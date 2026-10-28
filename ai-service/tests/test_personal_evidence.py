import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import Base
from models import database_models as models
from models.schemas import UserProfile, Project
from routers.database_routes import save_profile_data, serialize_profile
from services.llm_service import db_profile_to_schema, generate_cover_letter, generate_latex_resume


def user_profile(skills):
    return UserProfile(first_name="Alex", last_name="Example", email="alex@example.com", mobile_no="",
                       education=[], experience=[], projects=[], skills=skills, certifications=[], preset_slug="blank")


class PersonalEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add(models.User(id=1, email="alex@example.com"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_project_link_survives_profile_save_and_reaches_cover_letter(self):
        profile = user_profile([])
        profile.projects = [Project(name="Example", description="Built a reporting app", date_range="2026", link="https://example.com/project")]
        with patch("routers.database_routes.resolve_preset", return_value=None):
            save_profile_data(self.db, 1, profile)
        stored = self.db.query(models.Profile).filter_by(user_id=1).one()
        self.assertEqual(serialize_profile(stored)["projects"][0]["link"], "https://example.com/project")
        calls = []
        def model(prompt):
            calls.append(prompt)
            return "I built a reporting app: https://example.com/project" if len(calls) == 1 else '{"supported":true,"unsupported":[]}'
        generate_cover_letter(stored, "Reporting developer", "Example", complete_fn=model)
        self.assertIn("https://example.com/project", calls[0])
        legacy_profile = user_profile([])
        legacy_profile.projects = [Project(name="Example", description="Built a reporting app", date_range="2026")]
        with patch("routers.database_routes.resolve_preset", return_value=None):
            save_profile_data(self.db, 1, legacy_profile)
        stored = self.db.query(models.Profile).filter_by(user_id=1).one()
        self.assertEqual(serialize_profile(stored)["projects"][0]["link"], "https://example.com/project")

    def test_review_status_is_preserved_and_suggested_skills_are_unconfirmed(self):
        preset = SimpleNamespace(core_skills_bank=["Excel", "Python"])
        with patch("routers.database_routes.resolve_preset", return_value=preset):
            save_profile_data(self.db, 1, user_profile([{"skill_name": "Python", "is_confirmed": True}]))
        profile = self.db.query(models.Profile).filter_by(user_id=1).one()
        self.assertEqual({s.skill_name: s.is_confirmed for s in profile.skills}, {"Python": True, "Excel": False})
        self.assertEqual([s.skill_name for s in db_profile_to_schema(profile, confirmed_skills_only=True).skills], ["Python"])

        # An older client saving the profile without confirmation fields does not
        # accidentally turn previously suggested skills into confirmed ones.
        old_client_data = user_profile([{"skill_name": "Python"}, {"skill_name": "Excel"}])
        with patch("routers.database_routes.resolve_preset", return_value=preset):
            save_profile_data(self.db, 1, old_client_data)
        profile = self.db.query(models.Profile).filter_by(user_id=1).one()
        self.assertEqual({s.skill_name: s.is_confirmed for s in profile.skills}, {"Python": True, "Excel": False})
        serialized = serialize_profile(profile)
        self.assertEqual(next(s for s in serialized["skills"] if s["skill_name"] == "Excel")["is_confirmed"], False)

        reviewed_data = user_profile([{"skill_name": "Python", "is_confirmed": True}, {"skill_name": "Excel", "is_confirmed": True}])
        with patch("routers.database_routes.resolve_preset", return_value=preset):
            save_profile_data(self.db, 1, reviewed_data)
        profile = self.db.query(models.Profile).filter_by(user_id=1).one()
        self.assertEqual({s.skill_name for s in db_profile_to_schema(profile, confirmed_skills_only=True).skills}, {"Python", "Excel"})

    def test_cover_letter_uses_only_confirmed_skills_and_user_portfolio(self):
        profile = models.Profile(user_id=1, first_name="Alex", last_name="Example", mobile_no="", email="alex@example.com", portfolio="https://alex.example")
        profile.skills = [models.Skill(skill_name="Python", is_confirmed=True), models.Skill(skill_name="Excel", is_confirmed=False)]
        calls = []
        def model(prompt):
            calls.append(prompt)
            return "Dear team, I use Python. Regards, Alex" if len(calls) == 1 else json.dumps({"supported": True, "unsupported": []})
        result = generate_cover_letter(profile, "Python and Excel experience", "Acme", conversation_evidence="I built a Python app.", complete_fn=model)
        self.assertIn("Python", result)
        self.assertIn("https://alex.example", calls[0])
        self.assertNotIn("reinaelyabut.dev", calls[0])
        self.assertNotIn('"skill_name":"Excel"', calls[0])
        self.assertIn("I built a Python app.", calls[1])
        self.assertNotIn("Python and Excel experience", calls[1])
        self.assertIn("pasted job requirements", calls[0])
        self.assertIn("a requirement in a job posting", calls[1])

    def test_unsupported_or_unverifiable_letter_is_rejected(self):
        profile = models.Profile(user_id=1, first_name="Alex", last_name="Example", mobile_no="", email="alex@example.com")
        calls = iter(["I managed 100 staff.", '{"supported": false, "unsupported": ["team size"]}',
                      "I managed 50 staff.", '{"supported": false, "unsupported": ["team size"]}'])
        with self.assertRaisesRegex(Exception, "not supported"):
            generate_cover_letter(profile, "Lead a team", "Acme", complete_fn=lambda _: next(calls))
        calls = iter(["I managed 100 staff.", "invalid"])
        with self.assertRaisesRegex(Exception, "Could not verify"):
            generate_cover_letter(profile, "Lead a team", "Acme", complete_fn=lambda _: next(calls))

    def test_resume_audit_excludes_job_and_old_resume_as_evidence(self):
        profile = models.Profile(user_id=1, first_name="Alex", last_name="Example", mobile_no="", email="alex@example.com")
        calls = []
        def model(prompt):
            calls.append(prompt)
            return '{"summary":"Built a Python app"}' if len(calls) == 1 else '{"supported":true,"unsupported":[]}'
        with patch("services.llm_service.retrieve_successful_evidence", return_value=[{"source": "Old offer", "text": "Managed a team of 100"}]), patch("services.llm_service.assemble_latex", return_value="latex"):
            result = generate_latex_resume(profile, "Needs leadership", conversation_evidence="I built a Python app", complete_fn=model)
        self.assertEqual(result, "latex")
        self.assertIn("Managed a team of 100", calls[0])
        self.assertNotIn("Managed a team of 100", calls[1])
        self.assertNotIn("Needs leadership", calls[1])
        self.assertIn("I built a Python app", calls[1])

    def test_cover_letter_repairs_unsupported_claim_once(self):
        profile = models.Profile(user_id=1, first_name="Alex", last_name="Example", mobile_no="", email="alex@example.com")
        prompts = []
        replies = iter(["I led a team of five.", '{"supported":false,"unsupported":["Unsubstantiated team leadership"]}',
                        "I am interested in the role.", '{"supported":true,"unsupported":[]}'])
        def model(prompt):
            prompts.append(prompt)
            return next(replies)
        self.assertEqual(generate_cover_letter(profile, "Lead a team", "Acme", complete_fn=model), "I am interested in the role.")
        self.assertEqual(len(prompts), 4)
        self.assertIn("Unsubstantiated team leadership", prompts[2])
        self.assertIn("criticism, not new facts", prompts[2])

    def test_resume_repairs_unsupported_claim_once(self):
        profile = models.Profile(user_id=1, first_name="Alex", last_name="Example", mobile_no="", email="alex@example.com")
        prompts = []
        replies = iter(['{"summary":"Led a team of five"}', '{"supported":false,"unsupported":["Unsubstantiated team leadership"]}',
                        '{"summary":"Python developer"}', '{"supported":true,"unsupported":[]}'])
        def model(prompt):
            prompts.append(prompt)
            return next(replies)
        with patch("services.llm_service.assemble_latex", return_value="latex") as assemble:
            self.assertEqual(generate_latex_resume(profile, "Lead a team", complete_fn=model), "latex")
        self.assertEqual(assemble.call_args.args[1], {"summary": "Python developer"})
        self.assertEqual(len(prompts), 4)
        self.assertIn("Unsubstantiated team leadership", prompts[2])


if __name__ == "__main__":
    unittest.main()
