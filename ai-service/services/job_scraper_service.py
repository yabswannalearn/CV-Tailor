import asyncio
import httpx
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Tuple, Optional

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

# On-site signals used to enforce remote-only filtering.
ONSITE_SIGNALS = ["on-site", "onsite", "on site", "in office", "in-office", "office based", "office-based"]


def _is_remote_posting(text: str) -> bool:
    low = (text or "").lower()
    if any(sig in low for sig in ONSITE_SIGNALS):
        # Allow if it also explicitly says remote/hybrid
        if "remote" in low or "hybrid" in low:
            return True
        return False
    return True


# ── Hybrid fetcher: scrapling StealthyFetcher (camoufox) ──────────
# scrapling's `.text` is unreliable in this env; use `.body` (bytes).
async def scrape_scrapling(url: str, timeout: int = 25) -> Optional[str]:
    try:
        from scrapling.fetchers import StealthyFetcher
        resp = await StealthyFetcher.async_fetch(
            url, headless=True, block_webrtc=True, timeout=timeout
        )
        body = getattr(resp, "body", b"") or b""
        return body.decode("utf-8", errors="ignore") if isinstance(body, bytes) else str(body)
    except Exception as err:
        print(f"[scrapling] fetch failed for {url}: {err}")
        return None


# ── httpx helpers ────────────────────────────────────────────────
async def _httpx_get(url: str, timeout: int = 10) -> Optional[str]:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=HEADERS) as client:
        try:
            resp = await client.get(url)
            return resp.text if resp.status_code == 200 else None
        except Exception as err:
            print(f"[httpx] fetch failed for {url}: {err}")
            return None


# ── Source: OnlineJobs.ph (httpx) ────────────────────────────────
async def fetch_onlinejobs_ph(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    search_term = query.strip() or "developer"
    url = f"https://www.onlinejobs.ph/jobseekers/jobsearch?jobkeyword={search_term}"
    html = await _httpx_get(url)
    if not html:
        return [], "no_results"
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(".jobpost-cat-box")
    jobs = []
    for card in cards:
        title_el = card.select_one("h4, h3, h5")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        badge_el = card.select_one(".badge")
        job_type = badge_el.get_text(strip=True) if badge_el else "Full Time"
        if badge_el and badge_el.text in title:
            title = title.replace(badge_el.text, "").strip()
        salary_el = card.select_one("dd")
        salary = salary_el.get_text(strip=True) if salary_el else "Competitive"
        if salary and salary.isdigit():
            salary = f"${salary} / month"
        desc_el = card.select_one(".desc")
        desc = desc_el.get_text(strip=True) if desc_el else ""
        link_el = card.select_one('a[href*="/jobseekers/info/"]') or card.select_one('a[href*="jobseekers"]')
        href = link_el["href"] if link_el else ""
        if href and not href.startswith("http"):
            href = f"https://www.onlinejobs.ph{href}"
        if not _is_remote_posting(f"{title} {desc}"):
            continue
        jobs.append({
            "company_name": "OnlineJobs Employer",
            "job_title": title or "Position",
            "job_url": href or url,
            "location": "Remote (Philippines / Global)",
            "salary_range": salary,
            "job_description": desc or f"Online job posting for {title} on OnlineJobs.ph.",
            "short_description": (desc[:200] + "...") if len(desc) > 200 else (desc or f"Position for {title}."),
            "job_type": job_type,
            "source": "OnlineJobs.ph",
        })
        if len(jobs) >= limit:
            break
    return jobs, ("ok" if jobs else "no_results")


# ── Source: LinkedIn PH (httpx) ──────────────────────────────────
async def fetch_linkedin_ph(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    search_term = query.strip() or "developer"
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={search_term}&location=Philippines&f_WT=2"
    html = await _httpx_get(url)
    if not html:
        return [], "blocked"
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(".job-search-card, .base-card")
    jobs = []
    for card in cards:
        title_el = card.select_one(".base-search-card__title, h3")
        comp_el = card.select_one(".base-search-card__subtitle, h4")
        loc_el = card.select_one(".job-search-card__location, .job-search-card__location-text")
        link_el = card.select_one("a.base-card__full-link, a.base-search-card__full-link, a[href*='/jobs/view/']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        company = comp_el.get_text(strip=True) if comp_el else "LinkedIn Employer"
        location = loc_el.get_text(strip=True) if loc_el else "Philippines"
        href = link_el["href"].split("?")[0] if (link_el and link_el.get("href")) else url
        if f" at {company}" in title:
            title = title.split(f" at {company}")[0].strip()
        if not _is_remote_posting(f"{title} {location}"):
            continue
        jobs.append({
            "company_name": company,
            "job_title": title,
            "job_url": href,
            "location": location,
            "salary_range": "Competitive",
            "job_description": f"LinkedIn job posting for {title} at {company} ({location}).",
            "short_description": f"Position for {title} at {company} ({location}).",
            "job_type": "Full-Time",
            "source": "LinkedIn",
        })
        if len(jobs) >= limit:
            break
    return jobs, ("ok" if jobs else "no_results")


# ── Source: RemoteOK (httpx API) ─────────────────────────────────
async def fetch_remoteok_jobs(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    html = await _httpx_get("https://remoteok.com/api")
    if not html:
        return [], "blocked"
    try:
        import json
        raw_jobs = json.loads(html)
        if isinstance(raw_jobs, list) and len(raw_jobs) > 1:
            raw_jobs = raw_jobs[1:]
    except Exception:
        return [], "no_results"
    query_terms = [t.lower() for t in query.strip().split() if t]
    filtered, seen = [], set()
    for job in raw_jobs:
        if not isinstance(job, dict):
            continue
        title = job.get("position", "")
        company = job.get("company", "")
        tags = " ".join(job.get("tags", []))
        desc = job.get("description", "")
        if not _is_remote_posting(f"{title} {tags} {desc}"):
            continue
        search_blob = f"{title} {company} {tags} {desc}".lower()
        if query_terms and not any(term in search_blob for term in query_terms):
            continue
        key = f"{company.lower()}_{title.lower()}"
        if key in seen:
            continue
        seen.add(key)
        salary_min = job.get("salary_min")
        salary_max = job.get("salary_max")
        if salary_min and salary_max:
            salary_str = f"${salary_min:,} - ${salary_max:,} / yr"
        elif salary_min:
            salary_str = f"From ${salary_min:,} / yr"
        else:
            salary_str = "Competitive / Unspecified"
        filtered.append({
            "company_name": company or "Remote Company",
            "job_title": title or "Position",
            "job_url": job.get("url") or job.get("apply_url") or "",
            "location": job.get("location") or "Remote",
            "salary_range": salary_str,
            "job_description": desc[:4000] if desc else f"Remote position for {title} at {company}.",
            "short_description": (desc[:200] + "...") if desc and len(desc) > 200 else (title or ""),
            "job_type": "Full-Time (Remote)",
            "source": "RemoteOK",
        })
        if len(filtered) >= limit:
            break
    return filtered, ("ok" if filtered else "no_results")


# ── Source: WeWorkRemotely (httpx RSS) ───────────────────────────
async def fetch_weworkremotely_jobs(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    html = await _httpx_get("https://weworkremotely.com/remote-jobs.rss")
    if not html:
        return [], "blocked"
    try:
        root = ET.fromstring(html)
    except Exception:
        return [], "no_results"
    query_terms = [t.lower() for t in query.strip().split() if t]
    jobs = []
    for item in root.findall(".//item"):
        title = item.find("title").text if item.find("title") is not None else ""
        link = item.find("link").text if item.find("link") is not None else ""
        desc = item.find("description").text if item.find("description") is not None else ""
        if not _is_remote_posting(f"{title} {desc}"):
            continue
        search_blob = f"{title} {desc}".lower()
        if query_terms and not any(term in search_blob for term in query_terms):
            continue
        parts = title.split(":", 1)
        company = parts[0].strip() if len(parts) > 1 else "Remote Employer"
        job_title = parts[1].strip() if len(parts) > 1 else title
        soup = BeautifulSoup(desc, "html.parser")
        clean_desc = soup.get_text(strip=True)
        jobs.append({
            "company_name": company,
            "job_title": job_title,
            "job_url": link,
            "location": "Remote (Global)",
            "salary_range": "Competitive",
            "job_description": clean_desc[:4000],
            "short_description": clean_desc[:200] + "..." if len(clean_desc) > 200 else clean_desc,
            "job_type": "Full-Time (Remote)",
            "source": "WeWorkRemotely",
        })
        if len(jobs) >= limit:
            break
    return jobs, ("ok" if jobs else "no_results")


# ── Source: Remotive (httpx API) ─────────────────────────────────
async def fetch_remotive_jobs(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    url = "https://remotive.com/api/remote-jobs?limit=50"
    if query.strip():
        url += f"&search={query.strip().replace(' ', '%20')}"
    html = await _httpx_get(url)
    if not html:
        return [], "blocked"
    try:
        import json
        data = json.loads(html)
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
    except Exception:
        return [], "no_results"
    jobs = []
    for job in raw_jobs:
        title = job.get("title", "")
        company = job.get("company_name", "")
        desc = job.get("description", "")
        if not _is_remote_posting(f"{title} {desc} {job.get('candidate_required_location','')}"):
            continue
        jobs.append({
            "company_name": company or "Remote Company",
            "job_title": title or "Position",
            "job_url": job.get("url") or "",
            "location": job.get("candidate_required_location") or "Remote",
            "salary_range": job.get("salary") or "Competitive",
            "job_description": desc[:4000] if desc else f"Remote position for {title}.",
            "short_description": (desc[:200] + "...") if desc and len(desc) > 200 else (title or ""),
            "job_type": "Full-Time (Remote)",
            "source": "Remotive",
        })
        if len(jobs) >= limit:
            break
    return jobs, ("ok" if jobs else "no_results")


# ── Source: JobStreet PH (scrapling stealth) ─────────────────────
async def fetch_jobstreet_ph(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    search_term = query.strip() or "remote"
    url = f"https://www.jobstreet.com.ph/j?q={search_term.replace(' ', '%20')}&work-type=242"
    html = await scrape_scrapling(url)
    if not html:
        return [], "blocked"
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("[data-automation='jobListing'], .job-card, article")
    jobs = []
    for card in cards:
        title_el = card.select_one("h3, h2, [data-automation='jobTitle']")
        comp_el = card.select_one("[data-automation='companyName'], h4")
        link_el = card.select_one("a[href*='/job/']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        company = comp_el.get_text(strip=True) if comp_el else "JobStreet Employer"
        href = link_el["href"] if (link_el and link_el.get("href")) else url
        if href and not href.startswith("http"):
            href = f"https://www.jobstreet.com.ph{href}"
        if not _is_remote_posting(f"{title} {company}"):
            continue
        jobs.append({
            "company_name": company,
            "job_title": title,
            "job_url": href,
            "location": "Remote (Philippines)",
            "salary_range": "Competitive",
            "job_description": f"JobStreet PH posting for {title} at {company}.",
            "short_description": f"Position for {title} at {company}.",
            "job_type": "Full-Time",
            "source": "JobStreet PH",
        })
        if len(jobs) >= limit:
            break
    return jobs, ("ok" if jobs else "no_results")


# ── Source: Indeed US (scrapling stealth) ────────────────────────
async def fetch_indeed_us(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    search_term = query.strip() or "remote"
    url = f"https://www.indeed.com/jobs?q={search_term.replace(' ', '+')}+remote&remotejob=032b3046-06e9-4ae4-8f4b-986bb313b994"
    html = await scrape_scrapling(url)
    if not html:
        return [], "blocked"
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("[data-testid='jobListing'], .job_seen_beacon, article")
    jobs = []
    for card in cards:
        title_el = card.select_one("h2.jobTitle span, h2 a span")
        comp_el = card.select_one("[data-testid='company-name'], .companyName")
        loc_el = card.select_one("[data-testid='text-location'], .companyLocation")
        link_el = card.select_one("h2 a, a[href*='/rc/']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        company = comp_el.get_text(strip=True) if comp_el else "Indeed Employer"
        location = loc_el.get_text(strip=True) if loc_el else "Remote (US)"
        href = link_el["href"] if (link_el and link_el.get("href")) else url
        if href and not href.startswith("http"):
            href = f"https://www.indeed.com{href}"
        if not _is_remote_posting(f"{title} {location}"):
            continue
        jobs.append({
            "company_name": company,
            "job_title": title,
            "job_url": href,
            "location": location,
            "salary_range": "Competitive",
            "job_description": f"Indeed US posting for {title} at {company}.",
            "short_description": f"Position for {title} at {company}.",
            "job_type": "Full-Time",
            "source": "Indeed (US)",
        })
        if len(jobs) >= limit:
            break
    return jobs, ("ok" if jobs else "no_results")


# ── Source: Indeed PH (scrapling stealth) ────────────────────────
async def fetch_indeed_ph(query: str = "", limit: int = 5) -> Tuple[List[Dict[str, Any]], str]:
    search_term = query.strip() or "remote"
    url = f"https://ph.indeed.com/jobs?q={search_term.replace(' ', '+')}+remote&remotejob=032b3046-06e9-4ae4-8f4b-986bb313b994"
    html = await scrape_scrapling(url)
    if not html:
        return [], "blocked"
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("[data-testid='jobListing'], .job_seen_beacon, article")
    jobs = []
    for card in cards:
        title_el = card.select_one("h2.jobTitle span, h2 a span")
        comp_el = card.select_one("[data-testid='company-name'], .companyName")
        loc_el = card.select_one("[data-testid='text-location'], .companyLocation")
        link_el = card.select_one("h2 a, a[href*='/rc/']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        company = comp_el.get_text(strip=True) if comp_el else "Indeed Employer"
        location = loc_el.get_text(strip=True) if loc_el else "Remote (PH)"
        href = link_el["href"] if (link_el and link_el.get("href")) else url
        if href and not href.startswith("http"):
            href = f"https://ph.indeed.com{href}"
        if not _is_remote_posting(f"{title} {location}"):
            continue
        jobs.append({
            "company_name": company,
            "job_title": title,
            "job_url": href,
            "location": location,
            "salary_range": "Competitive",
            "job_description": f"Indeed PH posting for {title} at {company}.",
            "short_description": f"Position for {title} at {company}.",
            "job_type": "Full-Time",
            "source": "Indeed (PH)",
        })
        if len(jobs) >= limit:
            break
    return jobs, ("ok" if jobs else "no_results")


# ── Source registry ──────────────────────────────────────────────
SOURCE_REGISTRY = {
    "onlinejobs": ("OnlineJobs.ph", fetch_onlinejobs_ph, "httpx"),
    "linkedin": ("LinkedIn PH", fetch_linkedin_ph, "httpx"),
    "remoteok": ("RemoteOK", fetch_remoteok_jobs, "httpx"),
    "weworkremotely": ("WeWorkRemotely", fetch_weworkremotely_jobs, "httpx"),
    "remotive": ("Remotive", fetch_remotive_jobs, "httpx"),
    "jobstreet": ("JobStreet PH", fetch_jobstreet_ph, "scrapling"),
    "indeed-us": ("Indeed (US)", fetch_indeed_us, "scrapling"),
    "indeed-ph": ("Indeed (PH)", fetch_indeed_ph, "scrapling"),
}


async def fetch_remote_jobs(
    query: str = "",
    sources: List[str] = None,
    job_types: List[str] = None,
    limit: int = 15,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """Hybrid aggregator. Returns (jobs, source_status)."""
    active = sources or list(SOURCE_REGISTRY.keys())
    per_source_limit = max(4, limit // max(1, len(active)))

    tasks = []
    for s in active:
        if s in SOURCE_REGISTRY:
            _, fn, _ = SOURCE_REGISTRY[s]
            tasks.append(fn(query, limit=per_source_limit))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_jobs: List[Dict[str, Any]] = []
    seen = set()
    source_status: Dict[str, str] = {}

    for idx, s in enumerate(active):
        if s not in SOURCE_REGISTRY:
            continue
        label, _, _ = SOURCE_REGISTRY[s]
        res = results[idx]
        if isinstance(res, Exception):
            source_status[label] = "error"
            continue
        jobs, status = res
        source_status[label] = status
        for job in jobs:
            key = f"{job['company_name'].lower()}_{job['job_title'].lower()}"
            if key in seen:
                continue
            seen.add(key)
            all_jobs.append(job)

    # Apply job-type filter
    allowed_types = [t.lower() for t in (job_types or []) if t]
    if allowed_types:
        all_jobs = [
            j for j in all_jobs
            if any(at in (j.get("job_type") or "").lower() for at in allowed_types)
        ]

    return all_jobs[:limit], source_status
