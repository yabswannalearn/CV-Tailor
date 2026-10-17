"""Local OnlineJobs.ph scraper, adapted from the user's Job Scraper project."""

import argparse
import csv
import json
import re
import sys
import time
import threading
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

BASE = "https://www.onlinejobs.ph"
SEARCH = f"{BASE}/jobseekers/jobsearch"
USER_AGENT = "OnlineJobsPublicScraper/1.0 (personal research)"
FIELDS = (
    "jobUrl", "jobTitle", "employerName", "employmentType", "salary",
    "datePosted", "dateUpdated", "descriptionSnippet", "fullDescription", "skills",
)


def clean(element):
    return element.get_text(" ", strip=True) if element else ""


def parse_results(html, strict=False):
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for card in soup.select("a:has(> .jobpost-cat-box)"):
        box = card.select_one(".jobpost-cat-box")
        title = box.select_one("h4")
        if not title or not card.get("href"):
            continue
        badge = title.select_one(".badge")
        title_text = clean(title)
        if badge:
            title_text = title_text.removesuffix(clean(badge)).strip()
        posted = box.select_one("[data-temp]")
        salary = clean(box.select_one("dl dd")) or None
        description = box.select_one(".desc")
        if description:
            for link in description.select("a"):
                link.decompose()
        logo = box.select_one("img[alt]")
        jobs.append({
            "jobUrl": urljoin(BASE, card["href"]),
            "jobTitle": title_text,
            "employerName": logo.get("alt") or None if logo else None,
            "employmentType": clean(badge) or None,
            "salary": salary,
            "datePosted": posted.get("data-temp", "")[:10] if posted else None,
            "dateUpdated": None,
            "descriptionSnippet": clean(description),
            "fullDescription": None,
            "skills": [clean(tag) for tag in box.select(".job-tag .badge") if clean(tag)],
        })
    if strict and not jobs:
        text = clean(soup).lower()
        if not any(marker in text for marker in ("displaying 0", "no jobs found", "no results found")):
            raise ValueError("Search page has no recognizable listings or empty-results marker")
    return jobs


def parse_detail(html, strict=False):
    soup = BeautifulSoup(html, "html.parser")
    description = soup.select_one(".job-description")
    if strict and description is None:
        raise ValueError("Job page is missing its description; layout changed or access was blocked")
    if description:
        for tag in description.select("ojfilter"):
            tag.unwrap()
        for tag in description.select("br"):
            tag.replace_with("\n")
    updated = None
    label = soup.find(string=lambda s: s and "DATE UPDATED" in s.upper())
    if label:
        value = label.find_parent("dd")
        value = value.select_one("p") if value else None
        if value:
            try:
                updated = datetime.strptime(clean(value), "%b %d, %Y").date().isoformat()
            except ValueError:
                pass
    full_description = description.get_text().replace("\r\n", "\n").strip() if description else None
    if full_description:
        full_description = re.sub(r"\n[ \t]*\n(?:[ \t]*\n)*", "\n\n", full_description)
    return full_description or None, updated


class ScrapeError(Exception):
    """An actionable public-source failure; contains no credentials."""


class ScrapeCancelled(Exception):
    pass


class RobotsDenied(ScrapeError):
    pass


def check_cancel(cancel):
    if cancel.is_set():
        raise ScrapeCancelled()


def public_url(url):
    parsed = urlparse(url)
    try:
        port = parsed.port
    except ValueError:
        raise ScrapeError("The site returned an invalid posting URL.") from None
    if (parsed.scheme != "https" or parsed.hostname != "www.onlinejobs.ph"
            or parsed.username or parsed.password or port not in (None, 443)):
        raise ScrapeError("The site returned a link outside the allowed OnlineJobs website.")
    return url


def search_url(job_keyword, employment_type="all", page=0):
    params = {"jobkeyword": job_keyword}
    if employment_type != "all":
        params.update({"isFromJobsearchForm": "1", {
            "part-time": "partTime", "full-time": "fullTime", "gig": "gig"
        }[employment_type]: "on"})
    path = SEARCH if page == 0 else f"{SEARCH}/{page * 30}"
    return f"{path}?{urlencode(params)}"


class PacingSession:
    """Single worker with robots policy, interruptible pacing, and bounded retries."""

    def __init__(self, cancel=None, progress=None, session=None):
        self.cancel = cancel or threading.Event()
        self.progress = progress or (lambda event: None)
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.delay = 5.0
        self.last_request = None
        self.robots = None

    def close(self):
        self.session.close()

    def wait(self, seconds, message):
        if seconds > 0:
            self.progress({"message": message})
            if self.cancel.wait(seconds):
                raise ScrapeCancelled()
        check_cancel(self.cancel)

    def load_robots(self):
        self.progress({"message": "Checking OnlineJobs crawl rules…"})
        html = self._request(f"{BASE}/robots.txt", robots=True)
        if html is None:  # RFC 9309: 404/410 means no robots restrictions.
            html = b""
        text = html.decode("utf-8", errors="replace")
        if text.lstrip().startswith("<"):
            raise ScrapeError("Crawl rules returned an HTML page. Access may be blocked; retry later.")
        policy = RobotFileParser()
        policy.parse(text.splitlines())
        self.robots = policy
        self.delay = max(self.delay, float(policy.crawl_delay(USER_AGENT) or 0))
        rate = policy.request_rate(USER_AGENT)
        if rate and rate.requests > 0:
            self.delay = max(self.delay, rate.seconds / rate.requests)
        self.progress({"delay_seconds": self.delay})

    def get(self, url):
        if self.robots is None:
            self.load_robots()
        return self._request(url)

    def _request(self, url, *, robots=False):
        public_url(url)
        for redirect in range(4):
            if not robots and not self.robots.can_fetch(USER_AGENT, url):
                raise RobotsDenied("OnlineJobs crawl rules do not allow this page. The scraper stopped.")
            response = None
            for attempt in range(3):
                check_cancel(self.cancel)
                if self.last_request is not None:
                    self.wait(max(0, self.delay - (time.monotonic() - self.last_request)),
                              f"Waiting between requests ({self.delay:g}s crawl delay)…")
                try:
                    response = self.session.get(url, timeout=(10, 20), allow_redirects=False)
                except (requests.Timeout, requests.ConnectionError):
                    if attempt == 2:
                        raise ScrapeError("OnlineJobs could not be reached after three attempts. Retry later.") from None
                    self.wait(5 * (attempt + 1), "Connection interrupted; waiting before retry…")
                    continue
                finally:
                    self.last_request = time.monotonic()
                if self.cancel.is_set():
                    response.close()
                    raise ScrapeCancelled()
                if response.status_code not in (429, 502, 503, 504) or attempt == 2:
                    break
                retry = response.headers.get("Retry-After", "")
                wait = max(5 * (attempt + 1), float(retry) if retry.isdigit() else 0)
                response.close()
                if wait > 300:
                    raise ScrapeError("OnlineJobs requested a long retry delay. Stop and try again later.")
                self.wait(wait, "OnlineJobs is busy; waiting before retry…")
            try:
                if response.status_code in (301, 302, 303, 307, 308):
                    target = urljoin(url, response.headers.get("Location", ""))
                    if not response.headers.get("Location") or redirect == 3:
                        raise ScrapeError("OnlineJobs returned too many or invalid redirects.")
                    url = public_url(target)
                    continue
                if response.status_code in (404, 410):
                    return None
                if response.status_code >= 400:
                    raise ScrapeError(f"OnlineJobs returned HTTP {response.status_code}. Access may be limited; retry later.")
                return response.content
            finally:
                response.close()


def scrape(job_keyword="", max_pages=5, fetch_details=False, employment_type=None,
           session=None, *, max_results=100, cancel=None, progress=None):
    """Yield postings incrementally. A callback reports progress and per-job failures."""
    employment_type = employment_type or "all"
    if not isinstance(job_keyword, str) or len(job_keyword) > 200:
        raise ValueError("job_keyword must be text of at most 200 characters")
    for value, maximum, name in ((max_pages, 50, "max_pages"), (max_results, 1000, "max_results")):
        if type(value) is not int or not 1 <= value <= maximum:
            raise ValueError(f"{name} must be an integer between 1 and {maximum}")
    if type(fetch_details) is not bool:
        raise ValueError("fetch_details must be a boolean")
    if employment_type not in ("all", "part-time", "full-time", "gig"):
        raise ValueError("Unknown employment_type")
    cancel = cancel or threading.Event()
    progress = progress or (lambda event: None)
    owns_session = session is None
    session = session or PacingSession(cancel, progress)
    seen, collected, examined = set(), 0, 0
    try:
        for page in range(max_pages):
            check_cancel(cancel)
            progress({"message": f"Reading search page {page + 1} of {max_pages}…"})
            html = session.get(search_url(job_keyword.strip(), employment_type, page))
            if html is None:
                raise ScrapeError(f"Search page {page + 1} was not found.")
            try:
                jobs = parse_results(html, strict=True)
            except ValueError as error:
                raise ScrapeError(str(error)) from None
            examined += len(jobs)
            progress({"pages": page + 1, "examined": examined})
            fresh = []
            for job in jobs:
                public_url(job["jobUrl"])
                match = re.fullmatch(r"/jobseekers/job/(?:[A-Za-z0-9_-]*-)?([0-9]+)/?", urlparse(job["jobUrl"]).path)
                if not match:
                    raise ScrapeError("The search page returned an unrecognized posting link.")
                source_id = str(int(match[1]))
                if source_id not in seen:
                    seen.add(source_id)
                    fresh.append(job)
            if not fresh:
                return
            for job in fresh:
                check_cancel(cancel)
                if employment_type != "all" and (job["employmentType"] or "").lower().replace(" ", "-") != employment_type:
                    continue
                if fetch_details:
                    progress({"message": f"Reading full description: {job['jobTitle']}"})
                    try:
                        detail = session.get(job["jobUrl"])
                        soup = BeautifulSoup(detail or "", "html.parser")
                        heading = soup.select_one("h1")
                        if detail is None or (soup.select_one(".job-description") is None and heading
                                and clean(heading) == "Oops, we lost you there."):
                            progress({"removed": 1})
                            continue
                        job["fullDescription"], job["dateUpdated"] = parse_detail(detail, strict=True)
                    except RobotsDenied:
                        raise
                    except (ScrapeError, ValueError) as error:
                        # Keep a new listing's snippet. Storage retains an earlier full
                        # description with an explicit stale-evidence marker, if present.
                        progress({"error": {"url": job["jobUrl"], "message": str(error)}})
                check_cancel(cancel)
                yield job
                collected += 1
                if collected >= max_results:
                    return
            if len(jobs) < 30:
                return
    finally:
        if owns_session:
            session.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job-keyword", default="", help="Blank means all jobs")
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--max-results", type=int, default=100)
    parser.add_argument("--fetch-details", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--employment-type", choices=("all", "part-time", "full-time", "gig"),
                        help="Include only jobs with this employment type")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    parser.add_argument("--output", type=Path, default=Path("jobs.json"))
    args = parser.parse_args()
    try:
        jobs = list(scrape(args.job_keyword, args.max_pages, args.fetch_details,
                           args.employment_type, max_results=args.max_results))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "json":
            args.output.write_text(json.dumps(jobs, ensure_ascii=False, indent=2), encoding="utf-8")
        else:
            with args.output.open("w", encoding="utf-8-sig", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=FIELDS)
                writer.writeheader()
                writer.writerows({**job, "skills": "; ".join(job["skills"])} for job in jobs)
    except (requests.RequestException, ScrapeError, ValueError) as exc:
        parser.exit(1, f"Scrape failed: {exc}\n")
    print(f"Saved {len(jobs)} jobs to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
