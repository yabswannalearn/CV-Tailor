import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.pdf_service import PDFCompilationError, compile_latex_to_pdf


class PdfEngineTests(unittest.TestCase):
    def test_xelatex_uses_installed_compiler_without_shell_escape(self):
        def compile_pdf(command, **kwargs):
            self.assertIn("-no-shell-escape", command)
            self.assertNotIn("--only-cached", command)
            self.assertEqual(kwargs["timeout"], 120)
            (Path(kwargs["cwd"]) / "resume.pdf").write_bytes(b"%PDF-test")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.dict(os.environ, {"PDF_LATEX_ENGINE": "xelatex"}), \
             patch("services.pdf_service.which", return_value="xelatex"), \
             patch("services.pdf_service.subprocess.run", side_effect=compile_pdf):
            self.assertEqual(compile_latex_to_pdf("latex", fast_preview=True), b"%PDF-test")

    def test_missing_or_invalid_compiler_is_reported(self):
        with patch.dict(os.environ, {"PDF_LATEX_ENGINE": "xelatex"}), patch("services.pdf_service.which", return_value=None):
            with self.assertRaisesRegex(PDFCompilationError, "XeLaTeX is not installed"):
                compile_latex_to_pdf("latex")
        with patch.dict(os.environ, {"PDF_LATEX_ENGINE": "unknown"}):
            with self.assertRaisesRegex(PDFCompilationError, "must be tectonic or xelatex"):
                compile_latex_to_pdf("latex")


if __name__ == "__main__":
    unittest.main()
