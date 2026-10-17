"""Persistence, restart, transaction, and backup checks against real SQLite files."""

import copy
import json
import re
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from .app import create_app
from .auth import PlanError
from .database import ExperimentDatabase
from .qualification import sample_context


class LocalAuth:
    pending = None

    def status(self):
        return {"active": "fixture-registration", "notice_required": False,
                "profiles": [], "connection": {"sharing": True, "connected": True}}

    def access_token(self, profile_id):
        return "fixture-token-never-saved-in-sqlite"


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "crm.sqlite3"
        self.database = ExperimentDatabase(self.path)
        self.context = sample_context()
        self.result = {"model": "fixture-model", "qualification": {
            "recommendation": "review", "summary": "Offline persistence test.", "fit_evidence": [],
            "gaps": [], "unknowns": ["Rate unknown."], "next_action": "Review the supplied context."},
            "citations": [], "tool_calls": 1, "completed_requests": 2,
            "requests": [], "tracing": "disabled", "fixture_notice": self.context["fixture_notice"]}

    def test_restart_preserves_result_and_exact_context(self):
        saved = self.database.save_assessment(self.context, self.result)
        reopened = ExperimentDatabase(self.path)
        self.assertEqual(reopened.latest_assessment(), saved)
        self.assertEqual(reopened.status()["assessments"], 1)
        self.assertNotIn("fixture-token-never-saved-in-sqlite", self.path.read_bytes().decode(errors="ignore"))

    def test_repeat_run_keeps_one_opportunity_and_both_input_snapshots(self):
        first = self.database.save_assessment(self.context, self.result)
        updated = copy.deepcopy(self.context)
        updated["opportunity"]["employerName"] = None
        updated["opportunity"]["jobTitle"] = "Updated source title"
        second = self.database.save_assessment(updated, self.result)
        self.assertEqual(first["storage"]["opportunity_id"], second["storage"]["opportunity_id"])
        self.assertEqual(self.database.status()["opportunities"], 1)
        self.assertEqual(self.database.status()["assessments"], 2)
        with self.database.connection() as connection:
            employer = connection.execute("SELECT employer FROM opportunities").fetchone()[0]
            original = connection.execute("SELECT context_json FROM qualification_runs WHERE id=?",
                                          (first["storage"]["run_id"],)).fetchone()[0]
        self.assertIsNone(employer)
        self.assertEqual(json.loads(original), self.context)

    def test_failed_result_insert_rolls_back_source_update(self):
        self.database.save_assessment(self.context, self.result)
        updated = copy.deepcopy(self.context)
        updated["opportunity"]["jobTitle"] = "Should not persist"
        with self.assertRaises(sqlite3.IntegrityError):
            self.database.save_assessment(updated, {**self.result, "model": None})
        with self.database.connection() as connection:
            title = connection.execute("SELECT title FROM opportunities").fetchone()[0]
        self.assertEqual(title, self.context["opportunity"]["jobTitle"])
        self.assertEqual(self.database.status()["assessments"], 1)

    def test_foreign_keys_are_enforced(self):
        with self.assertRaises(sqlite3.IntegrityError), self.database.connection() as connection:
            connection.execute("""INSERT INTO qualification_runs(opportunity_id, model, context_json, result_json, created_at)
                                  VALUES (999, 'fixture-model', '{}', '{}', 'fixture-time')""")

    def test_backup_is_readable_and_never_overwrites_an_existing_file(self):
        saved = self.database.save_assessment(self.context, self.result)
        destination = Path(self.directory.name) / "backup.sqlite3"
        self.database.backup(destination)
        self.assertEqual(ExperimentDatabase(destination).latest_assessment(), saved)
        with self.assertRaises(FileExistsError):
            self.database.backup(destination)
        with self.assertRaises(ValueError):
            self.database.backup(self.path)

    def test_concurrent_short_writes_preserve_every_run(self):
        with ThreadPoolExecutor(max_workers=4) as workers:
            results = list(workers.map(lambda _: self.database.save_assessment(self.context, self.result), range(12)))
        self.assertEqual(self.database.status()["opportunities"], 1)
        self.assertEqual(self.database.status()["assessments"], 12)
        self.assertEqual(len({result["storage"]["run_id"] for result in results}), 12)

    def test_newer_schema_is_rejected_without_changing_it(self):
        with self.database.connection() as connection:
            connection.execute("PRAGMA user_version = 99")
        with self.assertRaises(RuntimeError):
            ExperimentDatabase(self.path)
        with self.database.connection() as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 99)

    def post_run(self, browser):
        csrf = re.search(r"const csrf='([^']+)'", browser.get("/").text)[1]
        return browser.post("/api/qualify", json={"model": "fixture-model"},
                            headers={"Origin": "http://127.0.0.1:8010", "X-CSRF-Token": csrf})

    def test_completed_api_run_is_restored_by_a_new_app_instance(self):
        with patch("experiments.chatgpt_plan.app.list_models", return_value=[{"slug": "fixture-model"}]), \
                patch("experiments.chatgpt_plan.app.qualify", new=AsyncMock(return_value=self.result)) as qualify:
            with TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010") as browser:
                response = self.post_run(browser)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(qualify.call_args.kwargs["context"], self.context)
                saved = response.json()
        restarted = create_app(auth=LocalAuth(), database=ExperimentDatabase(self.path))
        with TestClient(restarted, base_url="http://127.0.0.1:8010") as browser:
            self.assertEqual(browser.get("/api/status").json()["latest_assessment"], saved)

    def test_failed_or_cancelled_ai_never_creates_a_saved_assessment(self):
        for code in ("run_cancelled", "subscription_sharing_usage_limit_exceeded"):
            with self.subTest(code=code), \
                    patch("experiments.chatgpt_plan.app.list_models", return_value=[{"slug": "fixture-model"}]), \
                    patch("experiments.chatgpt_plan.app.qualify", new=AsyncMock(side_effect=PlanError(code, "Fixture error"))):
                with TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010") as browser:
                    self.assertNotEqual(self.post_run(browser).status_code, 200)
                    self.assertEqual(self.database.status()["assessments"], 0)
                    self.assertEqual(self.database.status()["opportunities"], 0)


if __name__ == "__main__":
    unittest.main()
