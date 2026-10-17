import threading
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from scrapers.onlinejobs_scraper import (
    BASE, FIELDS, PacingSession, RobotsDenied, ScrapeCancelled, ScrapeError,
    parse_detail, parse_results, scrape, search_url,
)

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


class Response:
    def __init__(self, content=b"", status=200, headers=None):
        self.content = content if isinstance(content, bytes) else content.encode()
        self.status_code, self.headers, self.closed = status, headers or {}, False

    def close(self):
        self.closed = True


class HttpSession:
    def __init__(self, responses):
        self.responses, self.headers, self.calls, self.closed = list(responses), {}, [], False

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    def close(self):
        self.closed = True


class Pages:
    def __init__(self, responses):
        self.responses, self.calls = iter(responses), []

    def get(self, url):
        self.calls.append(url)
        result = next(self.responses)
        if isinstance(result, Exception):
            raise result
        return result


class ParserTests(unittest.TestCase):
    def test_original_parser_preserves_missing_fields_and_evidence(self):
        jobs = parse_results(fixture("listings.html"), strict=True)
        self.assertEqual(set(jobs[0]), set(FIELDS))
        self.assertEqual((jobs[0]["jobTitle"], jobs[0]["employmentType"], jobs[0]["employerName"]),
                         ("Operations VA", "Part Time", "Example Company"))
        self.assertEqual(jobs[0]["descriptionSnippet"], "Manage operations.")
        self.assertEqual(jobs[0]["skills"], ["AI Tools"])
        self.assertIsNone(jobs[1]["salary"])
        self.assertIsNone(jobs[1]["employerName"])
        self.assertEqual(jobs[1]["skills"], [])

    def test_original_detail_parser_preserves_paragraphs(self):
        self.assertEqual(parse_detail(fixture("detail.html"), strict=True),
                         ("First paragraph.\n\nSecond paragraph.\nFinal line.", "2026-09-28"))

    def test_blocked_or_changed_layout_is_not_reported_as_zero_jobs(self):
        self.assertEqual(parse_results(fixture("empty.html"), strict=True), [])
        for html in ("<h1>Access denied</h1>", "<div>Changed layout</div>"):
            with self.assertRaises(ValueError):
                parse_results(html, strict=True)
            with self.assertRaises(ValueError):
                parse_detail(html, strict=True)


class TransportTests(unittest.TestCase):
    def test_robots_restrictions_pacing_and_finite_timeouts(self):
        responses = [Response("User-agent: *\nDisallow: /private\nCrawl-delay: 7"), Response("ok")]
        http = HttpSession(responses)
        client = PacingSession(session=http)
        waits = []
        client.wait = lambda seconds, message: waits.append(seconds)
        with patch("scrapers.onlinejobs_scraper.time.monotonic", return_value=10):
            self.assertEqual(client.get(BASE + "/public"), b"ok")
        self.assertEqual(client.delay, 7)
        self.assertIn(7, waits)
        with self.assertRaises(RobotsDenied):
            client.get(BASE + "/private")
        self.assertEqual(len(http.calls), 2)
        self.assertTrue(all(call[1] == {"timeout": (10, 20), "allow_redirects": False} for call in http.calls))
        self.assertTrue(all(response.closed for response in responses))
        client.close()
        self.assertTrue(http.closed)

    def test_rate_limit_retries_respect_retry_after_and_stop_after_three_attempts(self):
        http = HttpSession([Response("User-agent: *\nAllow: /"), Response(status=429, headers={"Retry-After": "21"}), Response("ok")])
        client = PacingSession(session=http)
        waits = []
        client.wait = lambda seconds, message: waits.append(seconds)
        self.assertEqual(client.get(BASE + "/public"), b"ok")
        self.assertIn(21, waits)
        self.assertEqual(len(http.calls), 3)
        http.responses = [Response(status=503) for _ in range(3)]
        with self.assertRaisesRegex(ScrapeError, "HTTP 503"):
            client.get(BASE + "/public")
        self.assertEqual(len(http.calls), 6)

    def test_missing_robots_allowed_but_unavailable_or_html_rules_stop(self):
        client = PacingSession(session=HttpSession([Response(status=404), Response("ok")]))
        client.wait = lambda *args: None
        self.assertEqual(client.get(BASE + "/public"), b"ok")
        for response in (Response(status=403), Response("<html>blocked</html>")):
            http = HttpSession([response])
            with self.assertRaises(ScrapeError):
                PacingSession(session=http).get(BASE + "/public")
            self.assertEqual(len(http.calls), 1)

    def test_redirect_cannot_leave_site_or_bypass_robots(self):
        for destination, error in (("https://attacker.example/", ScrapeError), (BASE + "/private", RobotsDenied)):
            http = HttpSession([Response("User-agent: *\nDisallow: /private"), Response(status=302, headers={"Location": destination})])
            client = PacingSession(session=http)
            client.wait = lambda *args: None
            with self.assertRaises(error):
                client.get(BASE + "/public")
            self.assertEqual(len(http.calls), 2)

    def test_cancellation_interrupts_pacing_before_another_request(self):
        cancel = threading.Event()
        http = HttpSession([])
        client = PacingSession(cancel=cancel, session=http)
        cancel.set()
        with self.assertRaises(ScrapeCancelled):
            client.get(BASE + "/public")
        self.assertEqual(http.calls, [])


class CrawlTests(unittest.TestCase):
    def test_native_query_filters_and_postfilter_enforce_contract_type(self):
        url = urlparse(search_url("AI & automation", "full-time", 2))
        self.assertTrue(url.path.endswith("/60"))
        self.assertEqual(parse_qs(url.query), {"jobkeyword": ["AI & automation"], "isFromJobsearchForm": ["1"], "fullTime": ["on"]})
        pages = Pages([fixture("listings.html")])
        jobs = list(scrape("AI", employment_type="part-time", session=pages))
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["employmentType"], "Part Time")
        self.assertIn("partTime=on", pages.calls[0])

    def test_result_limit_prevents_extra_detail_requests(self):
        pages = Pages([fixture("listings.html"), fixture("detail.html")])
        jobs = list(scrape(fetch_details=True, max_results=1, session=pages))
        self.assertEqual(len(jobs), 1)
        self.assertTrue(jobs[0]["fullDescription"].startswith("First paragraph"))
        self.assertEqual(len(pages.calls), 2)

    def test_pagination_deduplicates_repeated_source_ids_and_stops_on_short_page(self):
        # The original source can change a posting's slug between pages.
        cards = ''.join(f'<a href="/jobseekers/job/Role-{index}"><div class="jobpost-cat-box"><h4>Role {index}</h4></div></a>' for index in range(30))
        pages = Pages([cards, cards.replace('Role-', 'Renamed-')])
        jobs = list(scrape(max_pages=2, session=pages))
        self.assertEqual(len(jobs), 30)
        self.assertTrue(urlparse(pages.calls[1]).path.endswith("/30"))

    def test_detail_failure_keeps_snippet_and_reports_partial_error_but_removed_jobs_skip(self):
        events = []
        pages = Pages([fixture("listings.html"), ScrapeError("HTTP 503"), fixture("deleted.html")])
        jobs = list(scrape(fetch_details=True, session=pages, progress=events.append))
        self.assertEqual(len(jobs), 1)
        self.assertIsNone(jobs[0]["fullDescription"])
        self.assertEqual(jobs[0]["descriptionSnippet"], "Manage operations.")
        self.assertEqual([e["error"]["message"] for e in events if "error" in e], ["HTTP 503"])
        self.assertEqual(sum(e.get("removed", 0) for e in events), 1)

    def test_blocked_detail_by_robots_stops_and_external_links_are_never_fetched(self):
        pages = Pages([fixture("listings.html"), RobotsDenied("Not allowed")])
        with self.assertRaises(RobotsDenied):
            list(scrape(fetch_details=True, session=pages))
        html = fixture("listings.html").replace('/jobseekers/job/Operations-VA-123', 'https://attacker.example/job')
        pages = Pages([html])
        with self.assertRaises(ScrapeError):
            list(scrape(fetch_details=True, session=pages))
        self.assertEqual(len(pages.calls), 1)

    def test_cancel_keeps_already_yielded_jobs_and_stops_before_next_detail(self):
        cancel = threading.Event()
        pages = Pages([fixture("listings.html"), fixture("detail.html")])
        stream = scrape(fetch_details=True, session=pages, cancel=cancel)
        self.assertEqual(next(stream)["jobTitle"], "Operations VA")
        cancel.set()
        with self.assertRaises(ScrapeCancelled):
            next(stream)
        self.assertEqual(len(pages.calls), 2)

    def test_invalid_settings_do_not_make_requests(self):
        for args in ({"max_pages": True}, {"max_results": 0}, {"max_pages": 51}, {"fetch_details": "false"}):
            with self.assertRaises(ValueError):
                list(scrape(**args, session=Pages([])))


if __name__ == "__main__":
    unittest.main()
