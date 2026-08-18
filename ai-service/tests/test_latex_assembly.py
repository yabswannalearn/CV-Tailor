import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.latex_assembly import assemble_latex
from models.schemas import UserProfile


def make_profile(**overrides):
    base = dict(
        first_name="Jane", last_name="Doe", mobile_no="555-1234",
        email="jane@example.com", linkedin="https://linkedin.com/in/janedoe",
        github="https://github.com/janedoe", portfolio="https://jane.dev",
        education=[], experience=[], projects=[], skills=[], certifications=[],
    )
    base.update(overrides)
    return UserProfile(**base)


EMPTY_AI_CONTENT = {"summary": "", "experience": [], "projects": [], "skills": {}, "certifications": ""}


class AssembleLatexTests(unittest.TestCase):
    def test_escapes_latex_special_characters_in_ai_content(self):
        ai_content = {
            **EMPTY_AI_CONTENT,
            "experience": [{
                "title": "Eng #1", "company": "Acme & Co", "location": "Remote", "date": "2020 - 2023",
                "bullets": ["Cut costs 50% with $budget_tool and a ~tilde^caret"],
            }],
        }
        doc = assemble_latex(make_profile(), ai_content, "classic")
        self.assertIn(r"Acme \& Co", doc)
        self.assertIn(r"Eng \#1", doc)
        self.assertIn(r"50\% with \$budget\_tool", doc)
        self.assertIn(r"\textasciitilde{}tilde\^{}caret", doc)

    def test_omits_portfolio_line_when_not_provided(self):
        doc = assemble_latex(make_profile(portfolio=None), EMPTY_AI_CONTENT, "classic")
        self.assertNotIn("faGlobe", doc)

    def test_includes_contact_links_when_provided(self):
        doc = assemble_latex(make_profile(), EMPTY_AI_CONTENT, "classic")
        self.assertIn("jane@example.com", doc)
        self.assertIn("linkedin.com/in/janedoe", doc)
        self.assertIn("github.com/janedoe", doc)
        self.assertIn("jane.dev", doc)

    def test_classic_and_modern_templates_use_different_heading_styles(self):
        classic = assemble_latex(make_profile(), EMPTY_AI_CONTENT, "classic")
        modern = assemble_latex(make_profile(), EMPTY_AI_CONTENT, "modern")
        self.assertIn(r"\textcolor{NavyBlue}", classic)
        self.assertIn(r"\textcolor{primaryColor}", modern)
        self.assertNotIn(r"\textcolor{primaryColor}", classic)
        self.assertNotIn(r"\textcolor{NavyBlue}", modern)

    def test_unknown_template_id_falls_back_to_classic(self):
        doc = assemble_latex(make_profile(), EMPTY_AI_CONTENT, "nonexistent")
        self.assertIn(r"\textcolor{NavyBlue}", doc)

    def test_empty_sections_render_placeholder_text(self):
        doc = assemble_latex(make_profile(education=[]), EMPTY_AI_CONTENT, "classic")
        self.assertIn("No education history provided", doc)
        self.assertIn("No experience entries provided", doc)
        self.assertIn("No projects provided", doc)

    def test_blank_certifications_omit_the_section_entirely(self):
        doc = assemble_latex(make_profile(), EMPTY_AI_CONTENT, "classic")
        self.assertNotIn(r"\section{Certifications}", doc)

    def test_certifications_render_when_present(self):
        ai_content = {**EMPTY_AI_CONTENT, "certifications": "AWS Cert | GCP Cert"}
        doc = assemble_latex(make_profile(), ai_content, "classic")
        self.assertIn(r"\section{Certifications}", doc)
        self.assertIn("AWS Cert $|$ GCP Cert", doc)


if __name__ == "__main__":
    unittest.main()
