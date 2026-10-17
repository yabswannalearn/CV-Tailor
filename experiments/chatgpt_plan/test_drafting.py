"""Actual SDK execution over mock network, local persistence, and drafting endpoints."""

import asyncio
import json
import re
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from .app import create_app
from .auth import PlanError
from .crm_models import FreelancerProfile
from .database import DraftConflict, ExperimentDatabase
from .drafting import ApplicationDraft, draft_application, validated_draft
from .qualification import context_with_facts
from .test_database import LocalAuth
from .test_inbox import posting
from . import test_spike as spike_fixtures


def draft_context():
    return context_with_facts({"profile": FreelancerProfile(name="Fixture Freelancer", skills=["Python"],
                                experience=["Built a Python API."], unknowns=["Availability not confirmed."]).model_dump(),
                               "opportunity": {**posting(), "fullDescription": "Build and maintain a Python API."},
                               "draft_kind": "cover_letter"})


def output():
    return {"kind": "cover_letter", "subject": "Application for Python API work",
            "client_needs": [{"text": "Build and maintain a Python API.", "opportunity_fact_ids": ["opportunity.fullDescription"]}],
            "paragraphs": [{"text": "Hello,", "fact_ids": []},
                           {"text": "I built a Python API and would like to discuss your API work.",
                            "fact_ids": ["profile.experience[0]", "opportunity.fullDescription"]}],
            "cv_suggestions": [], "missing_facts": ["Original CV not supplied."],
            "questions_to_confirm": ["What is the expected weekly workload?"]}


def saved_result(context=None):
    result = validated_draft(ApplicationDraft.model_validate(output()), context or draft_context())
    return {**result, "model": "fixture-model", "tool_calls": 1, "completed_requests": 2,
            "requests": [], "tracing": "disabled"}


class DraftAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_sdk_reads_exact_profile_and_posting_and_returns_a_draft(self):
        fixture = spike_fixtures.AgentTests("test_real_sdk_executes_tool_and_validates_grounded_output")
        transport, requests = fixture.mock_api(final=output())
        result = await draft_application("fixture-model", fixture.credential, context=draft_context(), upstream=transport)
        self.assertEqual(result["completed_requests"], 2)
        self.assertEqual(result["tool_calls"], 1)
        self.assertEqual(result["citations"]["paragraphs"][1][0]["text"], "Built a Python API.")
        self.assertIn("Fixture Freelancer", json.dumps(requests[1]))
        self.assertNotIn("fixture-oauth-token", json.dumps(result))

    async def test_interruption_usage_cap_and_http_error_do_not_accept_partial_drafts(self):
        for failure in ("interrupted", "limit", "http"):
            fixture = spike_fixtures.AgentTests("test_real_sdk_executes_tool_and_validates_grounded_output")
            transport, requests = fixture.mock_api(failure=failure)
            with self.subTest(failure=failure), self.assertRaises(Exception):
                await draft_application("fixture-model", fixture.credential, context=draft_context(), upstream=transport)
            self.assertEqual(len(requests), 1)

    def test_invalid_unknown_and_wrong_domain_citations_are_rejected(self):
        cases = []
        for fact_id in ("profile.invented", "profile.unknowns[0]"):
            value = output()
            value["paragraphs"][1]["fact_ids"] = [fact_id]
            cases.append(value)
        value = output()
        value["client_needs"][0]["opportunity_fact_ids"] = ["profile.skills[0]"]
        cases.append(value)
        value = output()
        value["paragraphs"][1]["fact_ids"] = ["opportunity.fullDescription"]
        cases.append(value)
        for value in cases:
            with self.subTest(value=value), self.assertRaises(PlanError):
                validated_draft(ApplicationDraft.model_validate(value), draft_context())

    def test_cv_suggestions_require_exact_original_text_and_both_sources(self):
        context = draft_context()
        context["profile"]["original_cv"] = "Experience\nBuilt a Python API."
        context = context_with_facts(context)
        value = output()
        value["cv_suggestions"] = [{"section": "Experience", "original_quote": "Built a Python API.",
                "suggested_text": "Developed a Python API.", "profile_fact_ids": ["profile.experience[0]"],
                "opportunity_fact_ids": ["opportunity.fullDescription"], "reason": "Emphasizes relevant API experience."}]
        result = validated_draft(ApplicationDraft.model_validate(value), context)
        self.assertEqual(len(result["application"]["cv_suggestions"]), 1)
        for changed in (draft_context(), {**context, "profile": {**context["profile"], "original_cv": "Different text."}}):
            with self.assertRaises(PlanError):
                validated_draft(ApplicationDraft.model_validate(value), changed)

    def test_wrong_kind_and_unresolved_placeholders_are_rejected(self):
        for changes in ({"kind": "proposal"}, {"subject": "Application from [Your name]"}):
            with self.assertRaises(PlanError):
                validated_draft(ApplicationDraft.model_validate({**output(), **changes}), draft_context())


class DraftStorageAndAPITests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "crm.sqlite3"
        self.database = ExperimentDatabase(self.path)
        self.context = draft_context()
        self.database.import_jobs([self.context["opportunity"]])
        self.item = self.database.opportunities()["items"][0]
        self.database.save_profile(self.context["profile"])
        self.database.update_user_state(self.item["id"], stage="shortlisted", notes="User decision.")

    def browser(self):
        return TestClient(create_app(auth=LocalAuth(), database=self.database), base_url="http://127.0.0.1:8010")

    def headers(self, browser):
        csrf = re.search(r"const csrf='([^']+)'", browser.get("/").text)[1]
        return {"Origin": "http://127.0.0.1:8010", "X-CSRF-Token": csrf}

    def generate(self, browser, headers=None):
        return browser.post("/api/draft", json={"opportunity_id": self.item["id"], "model": "fixture-model", "kind": "cover_letter"},
                            headers=headers or self.headers(browser))

    def test_append_generations_and_restart_preserve_earlier_human_edits(self):
        first = self.database.save_draft(self.item["id"], self.context, saved_result())
        self.database.edit_draft(first["id"], subject="Edited subject", body="Edited local application.", revision=0, reviewed=True)
        second = self.database.save_draft(self.item["id"], self.context, saved_result())
        reopened = ExperimentDatabase(self.path)
        self.assertEqual(reopened.draft(first["id"])["body"], "Edited local application.")
        self.assertTrue(reopened.draft(first["id"])["reviewed"])
        self.assertEqual(reopened.draft(first["id"])["generated"], saved_result())
        self.assertFalse(reopened.draft(second["id"])["reviewed"])
        self.assertEqual([value["id"] for value in reopened.drafts(self.item["id"])], [second["id"], first["id"]])
        self.assertEqual(reopened.opportunity(self.item["id"])["notes"], "User decision.")

    def test_conflicting_edits_do_not_overwrite_another_window(self):
        draft = self.database.save_draft(self.item["id"], self.context, saved_result())
        self.database.edit_draft(draft["id"], subject="First edit", body="Keep me.", revision=0, reviewed=False)
        with self.assertRaises(DraftConflict):
            self.database.edit_draft(draft["id"], subject="Lost edit", body="Wrong.", revision=0, reviewed=True)
        self.assertEqual(self.database.draft(draft["id"])["body"], "Keep me.")

    def test_version_two_upgrade_preserves_leads_notes_profile_and_assessments(self):
        self.database.save_assessment(self.context, {"model": "fixture-model", "qualification": {}}, opportunity_id=self.item["id"])
        old_profile = {key: value for key, value in self.context["profile"].items() if key not in ("portfolio_links", "original_cv")}
        self.database.save_profile(old_profile)
        with self.database.connection() as connection:
            connection.execute("DROP TABLE application_drafts")
            connection.execute("PRAGMA user_version=2")
        upgraded = ExperimentDatabase(self.path)
        self.assertEqual(upgraded.status()["schema_version"], 3)
        self.assertEqual(upgraded.status()["assessments"], 1)
        self.assertEqual(upgraded.opportunity(self.item["id"])["stage"], "shortlisted")
        self.assertEqual(upgraded.profile()["skills"], ["Python"])
        self.assertEqual(upgraded.profile()["original_cv"], "")
        with self.assertRaises(sqlite3.IntegrityError):
            upgraded.save_draft(9999, self.context, saved_result())

    def test_api_generates_from_saved_sources_edits_exports_and_marks_stale(self):
        with patch("experiments.chatgpt_plan.app.list_models", return_value=[{"slug": "fixture-model"}]), \
                patch("experiments.chatgpt_plan.app.draft_application", new=AsyncMock(return_value=saved_result())) as drafter:
            with self.browser() as browser:
                headers = self.headers(browser)
                response = self.generate(browser, headers)
                self.assertEqual(response.status_code, 200, response.text)
                draft = response.json()
                context = drafter.call_args.kwargs["context"]
                self.assertEqual(context["profile"], self.context["profile"])
                self.assertEqual(context["opportunity"], self.context["opportunity"])
                self.assertFalse(draft["stale"])
                detail = browser.get(f"/api/opportunities/{self.item['id']}").json()
                self.assertEqual(detail["latest_draft"]["id"], draft["id"])
                self.assertEqual(detail["stage"], "shortlisted")
                edits = {"subject": "My subject", "body": "My edited café application.", "revision": 0, "reviewed": True}
                self.assertEqual(browser.post(f"/api/drafts/{draft['id']}", json=edits).status_code, 403)
                changed = browser.post(f"/api/drafts/{draft['id']}", json=edits, headers=headers)
                self.assertEqual(changed.status_code, 200)
                self.assertTrue(changed.json()["reviewed"])
                self.assertEqual(browser.post(f"/api/drafts/{draft['id']}", json=edits, headers=headers).status_code, 409)
                exported = browser.get(f"/api/drafts/{draft['id']}/export")
                self.assertEqual(exported.text, "Subject: My subject\n\nMy edited café application.\n")
                self.assertIn("attachment", exported.headers["content-disposition"])
                self.database.save_profile({**self.context["profile"], "availability": "Changed."})
                self.assertTrue(browser.get(f"/api/drafts/{draft['id']}").json()["stale"])
                self.assertEqual(browser.get("/api/drafts/9999").status_code, 404)

    def test_prerequisites_fail_before_any_model_discovery_or_inference(self):
        with patch("experiments.chatgpt_plan.app.list_models") as models, \
                patch("experiments.chatgpt_plan.app.draft_application", new=AsyncMock()) as drafter:
            with self.browser() as browser:
                self.database.update_user_state(self.item["id"], stage="inbox")
                self.assertEqual(self.generate(browser).json()["error"]["code"], "shortlist_required")
                self.database.update_user_state(self.item["id"], stage="shortlisted")
                self.database.save_profile(FreelancerProfile().model_dump())
                self.assertEqual(self.generate(browser).json()["error"]["code"], "profile_required")
                self.database.save_profile(self.context["profile"])
                self.database.import_jobs([{**self.context["opportunity"], "fullDescription": None}])
                self.assertEqual(self.generate(browser).json()["error"]["code"], "full_description_required")
                self.assertEqual(self.database.status()["drafts"], 0)
                models.assert_not_called()
                drafter.assert_not_called()

    def test_invalid_model_and_failed_run_create_no_draft(self):
        with patch("experiments.chatgpt_plan.app.list_models", return_value=[]), self.browser() as browser:
            self.assertEqual(self.generate(browser).json()["error"]["code"], "unknown_model")
        for error in (PlanError("ungrounded_draft", "Invalid facts"), PlanError("subscription_sharing_usage_limit_exceeded", "Cap reached"), TimeoutError()):
            with patch("experiments.chatgpt_plan.app.list_models", return_value=[{"slug": "fixture-model"}]), \
                    patch("experiments.chatgpt_plan.app.draft_application", new=AsyncMock(side_effect=error)), self.browser() as browser:
                self.assertNotEqual(self.generate(browser).status_code, 200)
                self.assertEqual(self.database.status()["drafts"], 0)
                self.assertFalse(browser.get("/api/status").json()["running"])

    def test_cancel_actual_pending_draft_unlocks_and_never_saves(self):
        started = threading.Event()

        async def pending(*args, **kwargs):
            started.set()
            await asyncio.sleep(60)

        with patch("experiments.chatgpt_plan.app.list_models", return_value=[{"slug": "fixture-model"}]), \
                patch("experiments.chatgpt_plan.app.draft_application", new=pending), self.browser() as browser:
            headers = self.headers(browser)
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(self.generate, browser, headers)
                self.assertTrue(started.wait(3))
                self.assertEqual(browser.post("/api/profile", json={}, headers=headers).status_code, 409)
                self.assertEqual(browser.post("/api/cancel", json={}, headers=headers).status_code, 200)
                self.assertEqual(future.result(timeout=5).json()["error"]["code"], "run_cancelled")
            self.assertEqual(self.database.status()["drafts"], 0)
            self.assertFalse(browser.get("/api/status").json()["running"])

    def test_profile_additions_are_optional_trimmed_and_validate_public_links(self):
        self.assertEqual(FreelancerProfile().original_cv, "")
        profile = FreelancerProfile(portfolio_links=[" https://example.com/work ", "https://example.com/work"], original_cv=" CV text ")
        self.assertEqual(profile.portfolio_links, ["https://example.com/work"])
        self.assertEqual(profile.original_cv, "CV text")
        for link in ("javascript:alert(1)", "file:///private", "https://user:password@example.com"):
            with self.assertRaises(ValueError):
                FreelancerProfile(portfolio_links=[link])


if __name__ == "__main__":
    unittest.main()
