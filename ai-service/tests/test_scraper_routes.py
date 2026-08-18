import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers import scraper_routes
from services.job_scraper_service import fetch_remote_jobs


class DiscoverJobsTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_scraped_jobs_without_profile_or_ai_enrichment(self):
        jobs = [{
            "company_name": "Example Co",
            "job_title": "Python Developer",
            "job_url": "https://example.com/job",
            "location": "Remote",
            "salary_range": "Competitive",
            "job_description": "Build web services.",
            "short_description": "Build web services.",
            "job_type": "Full-Time",
            "source": "RemoteOK",
        }]
        fetch_jobs = AsyncMock(return_value=(jobs, {"remoteok": "ok"}))
        request = SimpleNamespace(session={"user_id": 7})

        with patch.object(scraper_routes, "fetch_remote_jobs", fetch_jobs):
            result = await scraper_routes.discover_jobs(
                keyword="python",
                sources="remoteok",
                job_types="Full-Time",
                request=request,
            )

        fetch_jobs.assert_awaited_once_with(
            query="python",
            sources=["remoteok"],
            job_types=["Full-Time"],
            limit=12,
        )
        self.assertIs(result["jobs"], jobs)
        self.assertEqual(result["total"], 1)
        self.assertNotIn("profile_defaults", result)
        self.assertNotIn("match_score", result["jobs"][0])
        self.assertNotIn("match_analysis", result["jobs"][0])

    async def test_an_empty_source_selection_searches_no_websites(self):
        fetch_jobs = AsyncMock(return_value=([], {}))
        request = SimpleNamespace(session={"user_id": 7})

        with patch.object(scraper_routes, "fetch_remote_jobs", fetch_jobs):
            await scraper_routes.discover_jobs(sources="", request=request)

        self.assertEqual(fetch_jobs.await_args.kwargs["sources"], [])

        jobs, source_status = await fetch_remote_jobs(sources=[])
        self.assertEqual(jobs, [])
        self.assertEqual(source_status, {})


if __name__ == "__main__":
    unittest.main()
