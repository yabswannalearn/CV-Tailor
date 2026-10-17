# Local public-source scrapers

`onlinejobs_scraper.py` is copied and adapted from the user's
`D:/vscode/Personal/Job Scraper/onlinejobs_scraper.py`. Its listing/detail parsers
and HTML fixtures are retained. Native search filters and removed-job detection
come from that project's `actor.py`; the local runtime does not require Apify or Crawlee.
The original project is untouched.

The CRM's **Find jobs** form starts a single background worker. Each yielded
posting goes through the same validated, duplicate-safe SQLite intake as JSON
imports. Scrapers depend only on Requests and Beautiful Soup; they know nothing
about AI credentials, profiles, notes, or pipeline decisions.

The scraper fetches `robots.txt`, checks every requested page and redirect,
honors crawl delay/request rate, waits at least five seconds between requests,
and retries connection failures and HTTP 429/502/503/504 at most three times.
Unavailable crawl rules, access blocks, and changed layouts are explicit errors.
It does not log in or bypass access challenges. Cancellation interrupts waits;
an in-flight request must return or time out before the worker stops.

Manual searches accept a keyword, all/part-time/full-time/gig filter, 1–50 pages,
1–1,000 results, and optional full descriptions. Full descriptions require one
additional request per posting. Search progress is held in memory for the current
server process; saved opportunities survive restarts. Scheduling and search
history are not implemented yet.

The worker saves snippets when an individual detail fetch fails and reports a
partial run. Removed postings are skipped. A quick refresh retains a previously
fetched full description with `fullDescriptionFromPreviousFetch: true`; the UI
and qualification context explicitly flag that older evidence. Successfully
fetching the detail again replaces it and clears the marker.

Optional standalone JSON/CSV export, from the worktree root:

```powershell
.\.venv\Scripts\python.exe -m scrapers.onlinejobs_scraper --job-keyword automation --employment-type part-time --max-pages 1 --max-results 10 --output jobs.json
```

Offline parser/crawl checks:

```powershell
.\.venv\Scripts\python.exe -m unittest scrapers.tests.test_onlinejobs experiments.chatgpt_plan.test_scraping -v
```
