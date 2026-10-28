import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services import career_tools


class FakeContext:
    def __init__(self):
        self.db = object()
        self.profile = SimpleNamespace(preset_slug="blank")
        self.job = SimpleNamespace(job_description="A developer role", company_name="Example", job_title="Developer", template_id="classic")
        self.user_evidence = "I built Python applications."
        self.drafts = []
        self.actions = []
    def run_action(self, callback):
        self.actions.append("run")
        return callback()
    def save_draft(self, kind, content, metadata=None):
        draft = {"id": len(self.drafts) + 1, "type": kind, "content": content, "metadata": metadata or {}}
        self.drafts.append(draft)
        return draft
    def latest_draft(self, kind):
        return next((draft for draft in reversed(self.drafts) if draft["type"] == kind), None)


class CareerToolsTests(unittest.TestCase):
    def setUp(self):
        self.ctx = FakeContext()
        self.tools = {tool.__name__: tool for tool in career_tools.create_career_tools(self.ctx)}

    def test_research_persists_sources_with_draft(self):
        sources = [{"title": "Company", "url": "https://example.com"}]
        with patch.object(career_tools, "grounded_research", return_value=("Findings", sources)):
            result = self.tools["research_company"]("Example company")
        self.assertEqual(result["draft"]["metadata"]["sources"], sources)
        self.assertEqual(self.ctx.actions, ["run"])

    def test_url_extraction_rejects_url_not_given_by_user(self):
        result = self.tools["extract_job_url"]("http://localhost/private")
        self.assertIn("error", result)
        self.assertEqual(self.ctx.actions, [])

    def test_general_chat_cannot_invent_job_description(self):
        self.ctx.job = None
        result = self.tools["draft_cover_letter"]("An invented job description", "")
        self.assertIn("error", result)
        self.assertEqual(self.ctx.actions, [])

    def test_summary_edit_preserves_every_other_byte(self):
        latex = "before\\section{Summary}\n\\small{\\color{textColor}Old summary}\n\\vspace{-4pt}\nafter"
        self.ctx.save_draft("resume", latex)
        profile_schema = SimpleNamespace(model_dump_json=lambda: '{"skills": ["Python"]}')
        with patch.object(career_tools, "gemini_completion", return_value="Shorter Python summary"), \
             patch.object(career_tools.llm_service, "db_profile_to_schema", return_value=profile_schema), \
             patch.object(career_tools.llm_service, "verify_personal_claims"), \
             patch.object(career_tools, "compile_latex_to_pdf", return_value=b"pdf"), \
             patch.object(career_tools, "pdf_page_count", return_value=1):
            result = self.tools["revise_resume_summary"]("Make it shorter")
        self.assertEqual(result["draft"]["content"], latex.replace("Old summary", "Shorter Python summary"))
        self.assertEqual(self.ctx.actions, ["run"])

    def test_summary_edit_rejects_new_numbers(self):
        self.ctx.save_draft("resume", "\\section{Summary}\\small{Python developer}")
        profile_schema = SimpleNamespace(model_dump_json=lambda: '{"skills": ["Python"]}')
        with patch.object(career_tools, "gemini_completion", return_value="Led 12 engineers"), \
             patch.object(career_tools.llm_service, "db_profile_to_schema", return_value=profile_schema):
            with self.assertRaisesRegex(ValueError, "unsupported number"):
                self.tools["revise_resume_summary"]("Add leadership")
        self.assertEqual(len(self.ctx.drafts), 1)

    def test_bullet_edit_only_changes_the_selected_bullet(self):
        latex = r"\section{Summary}\small{A summary}\resumeItem{First bullet}\resumeItem{Second bullet}"
        self.ctx.save_draft("resume", latex)
        profile_schema = SimpleNamespace(model_dump_json=lambda: '{"skills": ["Python"]}')
        with patch.object(career_tools, "gemini_completion", return_value="Improved second bullet"), \
             patch.object(career_tools.llm_service, "db_profile_to_schema", return_value=profile_schema), \
             patch.object(career_tools.llm_service, "verify_personal_claims"), \
             patch.object(career_tools, "compile_latex_to_pdf", return_value=b"pdf"), \
             patch.object(career_tools, "pdf_page_count", return_value=1):
            result = self.tools["revise_resume_bullet"](2, "Make the second bullet clearer")
        self.assertEqual(result["draft"]["content"], latex.replace("Second bullet", "Improved second bullet"))


if __name__ == "__main__": unittest.main()
