"""Real SQLite integration checks for the OnlineJobs inbox and qualification inputs."""

import copy
import json
import re
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from .app import create_app
from .crm_models import FreelancerProfile, MinimumRate
from .database import ExperimentDatabase
from .test_database import LocalAuth


def posting(posting_id=12345):
    return {"jobUrl": f"https://www.onlinejobs.ph/jobseekers/job/python-contractor-{posting_id}",
            "jobTitle": "Python API contractor", "employerName": None, "employmentType": "Part Time",
            "salary": "$7", "datePosted": "2026-10-07", "dateUpdated": None,
            "descriptionSnippet": "Build API integrations.", "fullDescription": None,
            "skills": ["Python", "FastAPI"], "extraSourceField": "Preserve this evidence."}


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "crm.sqlite3"
        self.database = ExperimentDatabase(self.path)

    def test_repeat_export_is_idempotent_and_preserves_unknowns_and_original_fields(self):
        first = self.database.import_jobs([posting(), posting(54321)])
        second = self.database.import_jobs([posting(), posting(54321)])
        self.assertEqual((first["imported"], second["skipped"]), (2, 2))
        item = self.database.opportunities()["items"][1]
        self.assertEqual(item["posting"], posting(54321))
        self.assertIsNone(item["employer"])
        self.assertIsNone(item["posting"]["fullDescription"])
        self.assertEqual(self.database.opportunities()["total"], 2)

    def test_id_survives_slug_tracking_and_protocol_changes_without_overwriting_user_state(self):
        self.database.import_jobs([posting()])
        item = self.database.opportunities()["items"][0]
        self.database.update_user_state(item["id"], stage="shortlisted", notes="Keep my reviewed notes.")
        changed = {**posting(), "jobUrl": "http://onlinejobs.ph/jobseekers/job/renamed-role-12345/?utm_source=test#details",
                   "jobTitle": "Updated role", "salary": "USD 20/hour", "fullDescription": "A complete description."}
        report = self.database.import_jobs([changed])
        restored = ExperimentDatabase(self.path).opportunity(item["id"])
        self.assertEqual(report["updated"], 1)
        self.assertEqual(restored["stage"], "shortlisted")
        self.assertEqual(restored["notes"], "Keep my reviewed notes.")
        self.assertEqual(restored["posting"], changed)
        self.assertEqual(restored["source_url"], "https://www.onlinejobs.ph/jobseekers/job/renamed-role-12345")
        self.assertEqual(self.database.opportunities(stage="all")["total"], 1)

    def test_record_errors_report_rows_and_fields_while_valid_records_import(self):
        report = self.database.import_jobs([posting(), {**posting(2), "skills": "Python"},
                                           {**posting(3), "jobUrl": "https://onlinejobs.ph.attacker.example/jobseekers/job/fake-3"},
                                           {**posting(4), "salary": 50}, None])
        self.assertEqual((report["imported"], report["failed"]), (1, 4))
        self.assertEqual([(error["row"], error["field"]) for error in report["errors"]],
                         [(2, "skills"), (3, "jobUrl"), (4, "salary"), (5, "record")])

    def test_duplicate_records_in_one_file_cannot_create_duplicate_opportunities(self):
        report = self.database.import_jobs([posting(), posting(), {**posting(), "jobTitle": "Changed"}])
        self.assertEqual((report["imported"], report["skipped"], report["updated"]), (1, 1, 1))
        self.assertEqual(self.database.opportunities()["total"], 1)

    def test_search_pagination_and_stage_counts(self):
        self.database.import_jobs([posting(index) for index in range(1, 32)])
        item = self.database.opportunities()["items"][0]
        self.database.update_user_state(item["id"], stage="skipped")
        page = self.database.opportunities()
        self.assertEqual((len(page["items"]), page["total"], page["counts"]["skipped"]), (25, 30, 1))
        self.assertEqual(len(self.database.opportunities(page=2)["items"]), 5)
        self.assertEqual(self.database.opportunities(query="%") ["total"], 0)
        self.assertEqual(self.database.opportunities(query="Python")["total"], 30)

    def test_v1_upgrade_retains_existing_opportunity_assessment_and_foreign_key(self):
        legacy = Path(self.directory.name) / "legacy.sqlite3"
        with closing(sqlite3.connect(legacy)) as connection:
            connection.executescript("""CREATE TABLE opportunities(id INTEGER PRIMARY KEY, source TEXT NOT NULL,
                source_url TEXT NOT NULL, title TEXT NOT NULL, employer TEXT, source_json TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(source,source_url));
                CREATE TABLE qualification_runs(id INTEGER PRIMARY KEY, opportunity_id INTEGER REFERENCES opportunities(id),
                model TEXT, context_json TEXT, result_json TEXT, created_at TEXT);
                INSERT INTO opportunities VALUES(1,'synthetic','https://example.com/sample','Existing proof',NULL,'{}','fixture','fixture');
                INSERT INTO qualification_runs VALUES(1,1,'fixture-model','{}','{}','fixture');
                PRAGMA user_version=1;""")
        upgraded = ExperimentDatabase(legacy)
        self.assertEqual(upgraded.status()["schema_version"], 3)
        self.assertEqual(upgraded.status()["assessments"], 1)
        self.assertEqual(upgraded.latest_assessment()["storage"]["opportunity_id"], 1)
        with upgraded.connection() as connection:
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(upgraded.opportunities()["total"], 0)  # The proof is separate from real intake.

    def test_posting_date_sort_runs_before_pagination_even_when_older_jobs_arrive_later(self):
        jobs = [{**posting(index), "datePosted": (date(2026, 9, 4) + timedelta(days=index)).isoformat()}
                for index in range(1, 36)]
        self.database.import_jobs(jobs)
        self.database.import_jobs([{**posting(999), "datePosted": "2000-01-01"}])
        first, second = self.database.opportunities(), self.database.opportunities(page=2)
        self.assertEqual([item["source_key"] for item in first["items"]], [str(i) for i in range(35, 10, -1)])
        self.assertEqual(second["items"][-1]["source_key"], "999")
        self.assertEqual(len({item["id"] for item in first["items"] + second["items"]}), 36)
        self.assertEqual(first["sort"], "posted_newest")

    def test_missing_invalid_and_updated_only_dates_are_last_and_never_invented(self):
        values = [None, "yesterday", "2026-02-30", "20261009", "2026-09-01", "2026-10-09"]
        jobs = [{**posting(index), "datePosted": value, "dateUpdated": "2026-10-09"}
                for index, value in enumerate(values, 1)]
        self.database.import_jobs(jobs)
        items = self.database.opportunities()["items"]
        self.assertEqual([item["posted_date"] for item in items], ["2026-10-09", "2026-09-01", None, None, None, None])
        self.assertEqual(next(item for item in items if item["source_key"] == "3")["posting"]["datePosted"], "2026-02-30")
        filtered = self.database.opportunities(posted_from="2026-09-01")
        self.assertEqual(filtered["total"], 2)
        self.assertTrue(all(item["posted_date"] for item in filtered["items"]))

    def test_inclusive_date_bounds_combine_with_search_stages_and_pagination(self):
        self.database.import_jobs([{**posting(index), "datePosted": f"2026-10-{index:02d}"}
                                   for index in range(6, 11)] + [{**posting(20), "datePosted": None}])
        before = self.database.opportunities()["items"]
        skipped = next(item for item in before if item["source_key"] == "8")
        self.database.update_user_state(skipped["id"], stage="skipped", notes="Keep this decision.")
        params = {"stage": "all", "query": "Python", "posted_from": "2026-10-07", "posted_to": "2026-10-09", "page_size": 2}
        first, second = self.database.opportunities(**params), self.database.opportunities(**params, page=2)
        self.assertEqual([item["posted_date"] for item in first["items"]], ["2026-10-09", "2026-10-08"])
        self.assertEqual([item["posted_date"] for item in second["items"]], ["2026-10-07"])
        self.assertEqual(first["total"], 3)
        self.assertEqual(self.database.opportunities(posted_from="2026-10-07", posted_to="2026-10-09")["total"], 2)
        self.assertEqual(self.database.opportunities(posted_to="2026-10-07")["total"], 2)
        self.assertEqual(self.database.opportunity(skipped["id"])["notes"], "Keep this decision.")

    def test_date_filter_api_validates_calendar_dates_and_reversed_ranges(self):
        self.database.import_jobs([{**posting(index), "datePosted": f"2026-10-{index:02d}"} for index in range(7, 10)])
        with TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010") as browser:
            response = browser.get("/api/opportunities?posted_from=2026-10-08&posted_to=2026-10-09")
            self.assertEqual(response.status_code, 200)
            self.assertEqual([item["posted_date"] for item in response.json()["items"]], ["2026-10-09", "2026-10-08"])
            self.assertEqual(response.json()["total"], 2)
            for query in ("posted_from=bad", "posted_from=2026-02-30", "posted_from=2026-10-09&posted_to=2026-10-07"):
                self.assertEqual(browser.get("/api/opportunities?" + query).status_code, 422)

    def headers(self, browser):
        csrf = re.search(r"const csrf='([^']+)'", browser.get("/").text)[1]
        return {"Origin": "http://127.0.0.1:8010", "X-CSRF-Token": csrf}

    def test_api_import_profile_and_state_are_local_and_persist_after_restart(self):
        with TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010") as browser:
            headers = self.headers(browser)
            response = browser.post("/api/import", json={"records": [posting()]}, headers=headers)
            self.assertEqual(response.json()["imported"], 1)
            item = browser.get("/api/opportunities").json()["items"][0]
            self.assertEqual(browser.post(f"/api/opportunities/{item['id']}/state", json={"stage": "shortlisted", "notes": "My note"}, headers=headers).status_code, 200)
            self.assertEqual(browser.post("/api/profile", json={"skills": [" Python ", "Python"], "availability": "10h/week"}, headers=headers).status_code, 200)
        reopened = ExperimentDatabase(self.path)
        self.assertEqual(reopened.opportunity(item["id"])["notes"], "My note")
        self.assertEqual(reopened.profile()["skills"], ["Python"])

    def test_import_rejects_invalid_json_wrong_shapes_and_oversized_requests(self):
        with TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010") as browser:
            headers = {**self.headers(browser), "Content-Type": "application/json"}
            self.assertEqual(browser.post("/api/import", content=b'{"records": [NaN]}', headers=headers).status_code, 400)
            self.assertEqual(browser.post("/api/import", json={"records": {"wrong": []}}, headers=headers).status_code, 400)
            with patch("experiments.chatgpt_plan.app.MAX_IMPORT_BYTES", 128):
                self.assertEqual(browser.post("/api/import", content=b" "*129, headers=headers).status_code, 413)
        self.assertEqual(self.database.opportunities()["total"], 0)

    def test_selected_listing_qualification_uses_saved_profile_and_marks_stale_results(self):
        self.database.import_jobs([posting()])
        item = self.database.opportunities()["items"][0]
        saved_profile = FreelancerProfile(skills=["Python"], preferred_contract_types=["Gig"]).model_dump()
        self.database.save_profile(saved_profile)
        result = {"model": "fixture-model", "qualification": {"recommendation": "review", "summary": "Offline test."},
                  "citations": [], "tool_calls": 1, "completed_requests": 2, "requests": [], "tracing": "disabled"}
        with patch("experiments.chatgpt_plan.app.list_models", return_value=[{"slug": "fixture-model"}]), \
                patch("experiments.chatgpt_plan.app.qualify", new=AsyncMock(return_value=result)) as qualifier:
            with TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010") as browser:
                response = browser.post("/api/qualify", json={"model": "fixture-model", "opportunity_id": item["id"]}, headers=self.headers(browser))
                self.assertEqual(response.status_code, 200)
                context = qualifier.call_args.kwargs["context"]
                self.assertEqual(context["profile"], saved_profile)
                self.assertEqual(context["opportunity"], posting())
                self.assertEqual(context["facts"]["profile.skills[0]"], "Python")
                self.assertIn("Only a listing snippet", context["preference_checks"][1])
                self.assertFalse(browser.get(f"/api/opportunities/{item['id']}").json()["assessment_stale"])
                self.assertIsNone(browser.get("/api/status").json()["latest_assessment"])
        self.database.save_profile({**saved_profile, "skills": ["React"]})
        with TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010") as browser:
            self.assertTrue(browser.get(f"/api/opportunities/{item['id']}").json()["assessment_stale"])
        self.assertEqual(self.database.opportunities()["items"][0]["stage"], "inbox")

    def test_profile_validation_requires_usable_rate_and_never_seeds_demo_facts(self):
        self.assertEqual(self.database.profile()["skills"], [])
        for amount in ("NaN", "Infinity", "0", "-5"):
            with self.subTest(amount=amount), self.assertRaises(ValueError):
                MinimumRate(amount=amount, currency="USD", period="hour")
        self.assertEqual(MinimumRate(amount="20.50", currency="USD", period="hour").amount, "20.50")


class InboxAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_sdk_qualifies_explicit_imported_context_without_demo_data(self):
        from .test_spike import AgentTests
        from .qualification import context_with_facts, qualify
        fixtures = AgentTests("test_real_sdk_executes_tool_and_validates_grounded_output")
        transport, requests = fixtures.mock_api()
        context = context_with_facts({"profile": FreelancerProfile(skills=["Python"]).model_dump(),
                                      "opportunity": posting(), "preference_checks": ["Only a snippet is available."]})
        with patch("experiments.chatgpt_plan.qualification.sample_context", side_effect=AssertionError("Do not load demo data")):
            result = await qualify("fixture-model", fixtures.credential, upstream=transport, context=context)
        self.assertEqual(result["tool_calls"], 1)
        self.assertEqual(result["completed_requests"], 2)
        self.assertEqual(result["citations"][0]["profile_text"], "Python")
        self.assertIsNone(result["fixture_notice"])
        self.assertIn("extraSourceField", str(requests[1]))


if __name__ == "__main__":
    unittest.main()
