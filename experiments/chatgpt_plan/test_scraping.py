"""Local worker/API tests with real SQLite and offline public-source fixtures."""

import re
import tempfile
import threading
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from pydantic import ValidationError

from scrapers.onlinejobs_scraper import ScrapeError, check_cancel
from .app import create_app
from .database import ExperimentDatabase
from .scraping import ScrapeSettings, ScrapeWorker
from .test_database import LocalAuth
from .test_inbox import posting


class ScrapingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = ExperimentDatabase(Path(self.directory.name) / "crm.sqlite3")

    def worker(self, generator):
        worker = ScrapeWorker(self.database, scrape_fn=generator)
        self.addCleanup(worker.close)
        return worker

    def finish(self, worker):
        worker.thread.join(timeout=5)
        self.assertFalse(worker.thread.is_alive())
        return worker.status()

    def test_live_intake_repeat_preserves_notes_decisions_and_persists_on_restart(self):
        def source(**kwargs):
            kwargs["progress"]({"pages": 1, "examined": 2})
            yield posting()
            yield posting(54321)

        worker = self.worker(source)
        worker.start(ScrapeSettings())
        self.assertEqual(self.finish(worker)["imported"], 2)
        item = self.database.opportunities()["items"][0]
        self.database.update_user_state(item["id"], stage="shortlisted", notes="Follow up on Friday.")
        worker.start(ScrapeSettings())
        state = self.finish(worker)
        self.assertEqual((state["status"], state["unchanged"], state["pages"], state["examined"]),
                         ("completed", 2, 1, 2))
        restored = ExperimentDatabase(self.database.path).opportunity(item["id"])
        self.assertEqual((restored["notes"], restored["stage"]), ("Follow up on Friday.", "shortlisted"))

    def test_partial_network_failure_keeps_saved_listings_and_reports_error(self):
        def source(**kwargs):
            yield posting()
            raise ScrapeError("Page 2 returned HTTP 403.")

        worker = self.worker(source)
        worker.start(ScrapeSettings())
        state = self.finish(worker)
        self.assertEqual((state["status"], state["imported"], state["error_count"]), ("partial", 1, 1))
        self.assertIn("HTTP 403", state["errors"][0]["message"])
        self.assertEqual(self.database.opportunities()["total"], 1)

    def test_concurrent_scraper_and_manual_intake_share_atomic_identity(self):
        other = ExperimentDatabase(self.database.path)
        gate = threading.Barrier(2)

        def ingest(database):
            gate.wait(timeout=5)
            return database.import_jobs([posting()], preserve_details=True)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(ingest, (self.database, other)))
        self.assertEqual(sum(result["imported"] for result in results), 1)
        self.assertEqual(sum(result["skipped"] for result in results), 1)
        self.assertEqual(self.database.opportunities()["total"], 1)

    def test_cancellation_is_independent_of_ai_and_keeps_partial_results(self):
        saved = threading.Event()

        def source(cancel, **kwargs):
            yield posting()
            saved.set()  # The worker already committed the previous yield.
            cancel.wait(5)
            check_cancel(cancel)
            yield posting(54321)

        worker = self.worker(source)
        worker.start(ScrapeSettings())
        self.assertTrue(saved.wait(5))
        with self.assertRaises(ScrapeError):
            worker.start(ScrapeSettings())
        self.assertEqual(worker.cancel()["status"], "cancelling")
        self.assertEqual(self.finish(worker)["status"], "cancelled")
        self.assertEqual(self.database.opportunities()["total"], 1)
        worker.cancel()  # Cancelling a terminal run is harmless.
        self.assertEqual(worker.status()["status"], "cancelled")

    def test_quick_refresh_retains_full_description_with_visible_stale_marker(self):
        original = {**posting(), "fullDescription": "Complete requirements from an earlier fetch.", "dateUpdated": "2026-10-07"}
        self.database.import_jobs([original])
        item = self.database.opportunities()["items"][0]
        self.database.update_user_state(item["id"], notes="My notes.")
        report = self.database.import_jobs([posting()], preserve_details=True)
        refreshed = self.database.opportunity(item["id"])
        self.assertEqual(report["updated"], 1)
        self.assertEqual(refreshed["posting"]["fullDescription"], original["fullDescription"])
        self.assertTrue(refreshed["posting"]["fullDescriptionFromPreviousFetch"])
        self.assertEqual(refreshed["notes"], "My notes.")
        self.assertEqual(self.database.import_jobs([posting()], preserve_details=True)["skipped"], 1)
        new = {**posting(), "fullDescription": "Freshly fetched requirements.", "dateUpdated": "2026-10-09"}
        self.database.import_jobs([new], preserve_details=True)
        self.assertNotIn("fullDescriptionFromPreviousFetch", self.database.opportunity(item["id"])["posting"])

    def test_detail_and_validation_errors_are_partial_and_bounded(self):
        def source(progress, **kwargs):
            for _ in range(25):
                progress({"error": {"message": "A detail request failed."}})
            yield posting()
            yield {**posting(7), "skills": "invalid"}

        worker = self.worker(source)
        worker.start(ScrapeSettings())
        state = self.finish(worker)
        self.assertEqual((state["status"], state["fetched"], state["imported"], state["failed_records"]),
                         ("partial", 2, 1, 1))
        self.assertEqual((state["error_count"], len(state["errors"])), (26, 20))

    def test_api_validates_settings_csrf_serializes_jobs_and_allows_crm_during_search(self):
        waiting = threading.Event()

        def source(cancel, progress, **kwargs):
            yield posting()
            waiting.set()
            cancel.wait(5)
            check_cancel(cancel)

        worker = self.worker(source)
        app = create_app(auth=LocalAuth(), database=self.database, scraper=worker)
        with TestClient(app, base_url="http://127.0.0.1:8010") as client:
            csrf = re.search(r"const csrf='([^']+)'", client.get("/").text)[1]
            headers = {"Origin": "http://127.0.0.1:8010", "X-CSRF-Token": csrf}
            self.assertEqual(client.post("/api/scraper/start", json={}).status_code, 403)
            for data in ({"max_pages": True}, {"fetch_details": "false"}, {"max_results": 1001}, {"source_url": "https://evil.example"}):
                self.assertEqual(client.post("/api/scraper/start", json=data, headers=headers).status_code, 422)
            response = client.post("/api/scraper/start", json=ScrapeSettings().model_dump(), headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(waiting.wait(5))
            self.assertEqual(client.post("/api/scraper/start", json={}, headers=headers).status_code, 409)
            item = client.get("/api/opportunities").json()["items"][0]
            response = client.post(f"/api/opportunities/{item['id']}/state", json={"notes": "Review while searching."}, headers=headers)
            self.assertEqual(response.status_code, 200)
            app.state.run_task = object()  # The scraper remains cancellable during AI.
            self.assertEqual(client.post("/api/scraper/cancel", json={}, headers=headers).status_code, 200)
            app.state.run_task = None
            self.assertEqual(self.finish(worker)["status"], "cancelled")
            self.assertEqual(client.get("/api/scraper").json()["imported"], 1)
            self.assertEqual(self.database.opportunity(item["id"])["notes"], "Review while searching.")

    def test_shutdown_cancels_active_worker_and_settings_reject_coercion(self):
        waiting = threading.Event()

        def source(cancel, **kwargs):
            waiting.set()
            cancel.wait(5)
            check_cancel(cancel)
            yield posting()

        worker = self.worker(source)
        worker.start(ScrapeSettings())
        self.assertTrue(waiting.wait(5))
        worker.close()
        self.assertEqual(worker.status()["status"], "cancelled")
        self.assertEqual(self.database.opportunities()["total"], 0)
        self.assertFalse(worker.thread.is_alive())
        for value in ({"max_pages": True}, {"fetch_details": "false"}, {"job_keyword": None}):
            with self.assertRaises(ValidationError):
                ScrapeSettings(**value)


if __name__ == "__main__":
    unittest.main()
