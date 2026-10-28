import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from database import Base
from models import database_models as models
from routers import assistant_routes as routes
from services.career_agent import CareerToolContext, run_career_agent


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([models.User(id=1, email="one@example.com", _legacy_credits=0),
                         models.User(id=2, email="two@example.com", _legacy_credits=0),
                         models.JobApplication(id=7, user_id=1, company_name="A", job_title="Role"),
                         models.JobApplication(id=8, user_id=2, company_name="B", job_title="Other")])
        self.db.commit()
        self.request = SimpleNamespace(session={"user_id": 1})

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create(self, job_id=7):
        return routes.create_conversation(routes.ConversationCreate(job_id=job_id), self.request, self.db)

    def test_application_conversation_unique_and_private(self):
        first = self.create()
        self.assertEqual(first["id"], self.create()["id"])
        with self.assertRaises(HTTPException) as denied:
            routes.create_conversation(routes.ConversationCreate(job_id=8), self.request, self.db)
        self.assertEqual(denied.exception.status_code, 404)
        with self.assertRaises(HTTPException):
            routes.get_conversation(first["id"], SimpleNamespace(session={"user_id": 2}), self.db)

    def test_chat_persists_and_scopes_evidence(self):
        conversation = self.create()
        async def fake_agent(ctx, transcript):
            self.assertEqual(ctx.user_evidence, "I built APIs")
            self.assertEqual(ctx.user_id, 1)
            return "What would you like to work on?"
        with patch.object(routes, "run_career_agent", side_effect=fake_agent):
            result = asyncio.run(routes.send_message.__wrapped__(conversation["id"],
                routes.SendMessage(content="I built APIs"), self.request, self.db))
        self.assertEqual([m["role"] for m in result["messages"]], ["user", "assistant"])
        self.assertNotIn("credits", result)
        self.db.expire_all()
        self.assertEqual(len(routes.get_conversation(conversation["id"], self.request, self.db)["messages"]), 2)

    def test_tool_runs_with_zero_legacy_balance_and_rolls_back_failures(self):
        conversation = self.db.get(models.AssistantConversation, self.create()["id"])
        ctx = CareerToolContext(self.db, 1, conversation, None, None, "")
        def failed():
            ctx.save_draft("research", "failed draft")
            return {"error": "research failed"}
        self.assertIn("error", ctx.run_action(failed))
        self.assertIsNone(ctx.latest_draft("research"))
        self.assertEqual(ctx.run_action(lambda: {"ok": True}), {"ok": True})
        self.assertEqual(ctx.run_action(lambda: {"ok": True}), {"ok": True})
        self.db.commit()
        self.assertEqual(self.db.get(models.User, 1)._legacy_credits, 0)

    def test_retry_of_same_message_does_not_repeat_action(self):
        conversation = self.create()
        async def fake_agent(ctx, transcript):
            result = ctx.run_action(lambda: {"ok": True})
            self.assertEqual(result, {"ok": True})
            return "Research completed."
        payload = routes.SendMessage(content="Research this company", request_id="request-123")
        with patch.object(routes, "run_career_agent", side_effect=fake_agent) as run:
            first = asyncio.run(routes.send_message.__wrapped__(conversation["id"], payload, self.request, self.db))
            second = asyncio.run(routes.send_message.__wrapped__(conversation["id"], payload, self.request, self.db))
        self.assertEqual(run.call_count, 1)
        self.assertNotIn("credits", first)
        self.assertNotIn("credits", second)
        self.assertEqual(len(second["messages"]), 2)

    def test_draft_versions_and_explicit_apply(self):
        cid = self.create()["id"]
        ctx = CareerToolContext(self.db, 1, self.db.get(models.AssistantConversation, cid), None, None, "")
        first = ctx.save_draft("cover_letter", "first")
        self.db.commit()
        second = routes.revise_draft(cid, first["id"], routes.ReviseDraft(content="second"), self.request, self.db)
        self.assertEqual(self.db.get(models.JobApplication, 7).cover_letter, None)
        routes.apply_draft(cid, second["id"], self.request, self.db)
        self.assertEqual(self.db.get(models.JobApplication, 7).cover_letter, "second")
        self.assertEqual([d["content"] for d in routes.get_conversation(cid, self.request, self.db)["drafts"]], ["first", "second"])

    def test_apply_preserves_preexisting_application_document(self):
        cid = self.create()["id"]
        self.db.get(models.JobApplication, 7).cover_letter = "original letter"
        ctx = CareerToolContext(self.db, 1, self.db.get(models.AssistantConversation, cid), None, None, "")
        draft = ctx.save_draft("cover_letter", "new letter")
        self.db.commit()
        routes.apply_draft(cid, draft["id"], self.request, self.db)
        versions = routes.get_conversation(cid, self.request, self.db)["drafts"]
        self.assertEqual({v["content"] for v in versions}, {"original letter", "new letter"})
        self.assertEqual(self.db.get(models.JobApplication, 7).cover_letter, "new letter")

    def test_general_conversation_can_link_job_without_losing_drafts(self):
        general = self.create(None)
        ctx = CareerToolContext(self.db, 1, self.db.get(models.AssistantConversation, general["id"]), None, None, "")
        ctx.save_draft("cover_letter", "draft")
        self.db.commit()
        linked = routes.link_job(general["id"], routes.LinkJob(job_id=7), self.request, self.db)
        self.assertEqual(linked["job_id"], 7)
        self.assertEqual(linked["drafts"][0]["content"], "draft")
        self.assertEqual(self.create()["id"], general["id"])

    def test_resume_apply_rejects_overflow(self):
        cid = self.create()["id"]
        ctx = CareerToolContext(self.db, 1, self.db.get(models.AssistantConversation, cid), None, None, "")
        draft = ctx.save_draft("resume", "latex")
        self.db.commit()
        with patch.object(routes, "compile_latex_to_pdf", return_value=b"pdf"), patch.object(routes, "pdf_page_count", return_value=2):
            with self.assertRaises(HTTPException) as error:
                routes.apply_draft(cid, draft["id"], self.request, self.db)
        self.assertEqual(error.exception.status_code, 422)
        self.assertIsNone(self.db.get(models.JobApplication, 7).latex_source)

    def test_deleting_application_removes_conversation_and_drafts(self):
        cid = self.create()["id"]
        ctx = CareerToolContext(self.db, 1, self.db.get(models.AssistantConversation, cid), None, None, "")
        ctx.save_draft("cover_letter", "draft")
        self.db.commit()
        self.db.delete(self.db.get(models.JobApplication, 7))
        self.db.commit()
        self.assertIsNone(self.db.get(models.AssistantConversation, cid))
        self.assertEqual(self.db.query(models.AssistantDraft).count(), 0)

    def test_adk_runner_calls_tool_and_returns_final_response(self):
        from google.adk.models.google_llm import Gemini
        from google.adk.models.llm_response import LlmResponse
        from google.genai import types
        calls = []

        async def fake_model(model, request, stream=False):
            calls.append(request)
            if len(calls) == 1:
                part = types.Part(function_call=types.FunctionCall(name="get_application_context", args={}))
            else:
                part = types.Part(text="I can help with that.")
            yield LlmResponse(content=types.Content(role="model", parts=[part]))

        cid = self.create()["id"]
        ctx = CareerToolContext(self.db, 1, self.db.get(models.AssistantConversation, cid),
                                self.db.get(models.JobApplication, 7), None, "hello")
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test"}), patch.object(Gemini, "generate_content_async", fake_model):
            reply = asyncio.run(run_career_agent(ctx, [{"role": "user", "content": "hello"}]))
        self.assertEqual(reply, "I can help with that.")
        self.assertEqual(len(calls), 2)

    def test_adk_generates_cover_letter_with_zero_legacy_balance(self):
        from google.adk.models.google_llm import Gemini
        from google.adk.models.llm_response import LlmResponse
        from google.genai import types
        from services import llm_service

        calls = []
        async def fake_model(model, request, stream=False):
            calls.append(request)
            if len(calls) == 1:
                part = types.Part(function_call=types.FunctionCall(
                    name="draft_cover_letter", args={"job_description": "", "instructions": ""}))
            else:
                part = types.Part(text="Your cover letter draft is ready.")
            yield LlmResponse(content=types.Content(role="model", parts=[part]))

        cid = self.create()["id"]
        job = self.db.get(models.JobApplication, 7)
        job.job_description = "Developer position"
        profile = models.Profile(user_id=1, first_name="Alex", last_name="Example", email="one@example.com", mobile_no="")
        self.db.add(profile)
        self.db.flush()
        ctx = CareerToolContext(self.db, 1, self.db.get(models.AssistantConversation, cid), job, profile, "yes")
        history = [{"role": "assistant", "content": "This will cost one credit. Shall I proceed?"}, {"role": "user", "content": "yes"}]
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test"}), \
             patch.object(Gemini, "generate_content_async", fake_model), \
             patch.object(llm_service, "generate_cover_letter", return_value="Grounded draft"):
            reply = asyncio.run(run_career_agent(ctx, history))
        self.assertIn("draft is ready", reply)
        self.assertEqual(ctx.latest_draft("cover_letter")["content"], "Grounded draft")
        self.assertEqual(self.db.get(models.User, 1)._legacy_credits, 0)


if __name__ == "__main__": unittest.main()
