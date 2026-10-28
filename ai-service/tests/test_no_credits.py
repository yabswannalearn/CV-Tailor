import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from routers import generate_routes, database_routes


class NoCreditsTests(unittest.TestCase):
    def test_resume_and_cover_letter_do_not_require_a_balance(self):
        user = SimpleNamespace(_legacy_credits=0)
        profile = SimpleNamespace(owner=user)
        cv_request = SimpleNamespace(email="a@example.com", jd="Developer", template_id="classic", preset_slug="blank")
        letter_request = SimpleNamespace(email="a@example.com", jd="Developer", company_name="Example")
        with patch.object(generate_routes, "get_profile_or_404", return_value=profile), \
             patch.object(generate_routes, "generate_latex_resume", return_value="latex"), \
             patch.object(generate_routes, "generate_cover_letter", return_value="letter"):
            cv = asyncio.run(generate_routes.generate_cv.__wrapped__(cv_request, None, object()))
            letter = asyncio.run(generate_routes.generate_cl.__wrapped__(letter_request, None, object()))
        self.assertEqual(cv, {"latex": "latex"})
        self.assertEqual(letter, {"cover_letter": "letter"})
        self.assertEqual(user._legacy_credits, 0)

    def test_resume_import_requires_auth_but_no_balance(self):
        request = SimpleNamespace(session={"user_id": 1})
        upload = SimpleNamespace(filename="resume.pdf", read=lambda: asyncio.sleep(0, result=b"pdf"))
        reader = SimpleNamespace(pages=[SimpleNamespace(extract_text=lambda: "Profile text")])
        user_query = SimpleNamespace(filter=lambda *args: SimpleNamespace(first=lambda: SimpleNamespace(id=1, _legacy_credits=0)))
        db = SimpleNamespace(query=lambda *args: user_query)
        with patch.object(database_routes, "PdfReader", return_value=reader), \
             patch.object(database_routes, "extract_profile_from_resume", return_value={"first_name": "Alex"}):
            result = asyncio.run(database_routes.auto_fill_resume.__wrapped__(request, upload, db))
        self.assertEqual(result["data"]["first_name"], "Alex")
        with self.assertRaises(Exception) as error:
            asyncio.run(database_routes.auto_fill_resume.__wrapped__(SimpleNamespace(session={}), upload, db))
        self.assertEqual(error.exception.status_code, 401)


if __name__ == "__main__": unittest.main()
