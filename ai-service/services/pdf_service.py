import os
import subprocess
import sys
import tempfile
import logging
from pathlib import Path
from shutil import which

logger = logging.getLogger(__name__)

class PDFCompilationError(RuntimeError):
    pass


def get_tectonic_command() -> str | None:
    path_command = which("tectonic") or which("tecto")
    
    # Check if a local downloaded static binary exists
    cache_dir = Path(tempfile.gettempdir()) / "cv-tailor-tectonic-cache"
    static_bin = cache_dir / "tectonic_static"
    if static_bin.exists():
        return str(static_bin)

    if path_command:
        # Check if it actually works (sometimes fails due to missing libgraphite2 on FastAPI Cloud)
        try:
            res = subprocess.run([path_command, "--version"], capture_output=True, text=True)
            if res.returncode == 0:
                logger.info(f"Using Tectonic from PATH: {path_command}")
                return path_command
        except Exception:
            pass

    scripts_dir = Path(sys.executable).parent
    for name in ("tectonic.exe", "tectonic", "tecto.exe", "tecto"):
        candidate = scripts_dir / name
        if candidate.exists():
            try:
                res = subprocess.run([str(candidate), "--version"], capture_output=True, text=True)
                if res.returncode == 0:
                    logger.info(f"Using Tectonic from Scripts: {candidate}")
                    return str(candidate)
            except Exception:
                pass

    logger.warning("Local tectonic binary failed or missing. Downloading statically linked fallback...")
    
    # Download the statically linked musl binary (works on any Linux, bypassing libgraphite2 errors)
    import urllib.request
    import tarfile
    import io
    
    try:
        url = "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz"
        logger.info(f"Downloading static tectonic from {url}...")
        cache_dir.mkdir(parents=True, exist_ok=True)
        
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            with tarfile.open(fileobj=io.BytesIO(response.read()), mode="r:gz") as tar:
                # Find the tectonic executable in the tarball
                for member in tar.getmembers():
                    if member.name.endswith("tectonic") or member.name.endswith("tectonic.exe"):
                        f = tar.extractfile(member)
                        if f:
                            static_bin.write_bytes(f.read())
                            static_bin.chmod(0o755)
                            logger.info(f"Successfully installed static tectonic to {static_bin}")
                            return str(static_bin)
    except Exception as e:
        logger.error(f"Failed to download static tectonic: {e}")

    return None

def write_fontconfig(cache_dir: Path) -> Path:
    fonts_conf = cache_dir / "fonts.conf"
    font_cache_dir = cache_dir / "font-cache"
    font_cache_dir.mkdir(parents=True, exist_ok=True)

    windows_fonts = Path("C:/Windows/Fonts")
    fonts_dir = windows_fonts.as_posix() if windows_fonts.exists() else ""

    dir_tags = f"  <dir>{cache_dir.as_posix()}</dir>"

    fonts_conf.write_text(
        f"""<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
{dir_tags}
  <cachedir>{font_cache_dir.as_posix()}</cachedir>
</fontconfig>
""",
        encoding="utf-8",
    )
    return fonts_conf

def compile_latex_to_pdf(latex: str) -> bytes:
    compiler = get_tectonic_command()
    if not compiler:
        raise PDFCompilationError(
            "Tectonic is not installed and failed to download the static fallback binary."
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        work_dir = Path(tmp_dir)
        
        # Auto-migrate fontawesome5 to fontawesome for stability on Windows
        if "\\usepackage{fontawesome5}" in latex:
            logger.info("Auto-migrating fontawesome5 to fontawesome for stability")
            latex = latex.replace("\\usepackage{fontawesome5}", "\\usepackage{fontawesome}")

        tex_file = work_dir / "resume.tex"
        tex_file.write_text(latex, encoding="utf-8")

        cache_dir = Path(tempfile.gettempdir()) / "cv-tailor-tectonic-cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        fonts_conf = write_fontconfig(cache_dir)

        try:
            result = subprocess.run(
                [compiler, "--outdir", str(work_dir), str(tex_file)],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=120,
                env={
                    **os.environ,
                    "TECTONIC_CACHE_DIR": str(cache_dir),
                    "FONTCONFIG_FILE": str(fonts_conf),
                },
            )
        except subprocess.TimeoutExpired as exc:
            logger.error("Tectonic compilation timed out after 120 seconds.")
            raise PDFCompilationError("LaTeX compilation timed out after 120 seconds.") from exc

        logger.info(f"Tectonic return code: {result.returncode}")

        pdf_file = work_dir / "resume.pdf"
        if not pdf_file.exists():
            generated_pdfs = list(work_dir.rglob("*.pdf"))
            if generated_pdfs:
                pdf_file = generated_pdfs[0]

        if result.returncode != 0 and not pdf_file.exists():
            details = "\n".join(part for part in [result.stdout, result.stderr] if part)
            logger.error(f"Tectonic compilation failed:\n{details}")
            
            # Save failed LaTeX for debugging
            try:
                debug_path = Path("debug_compile/last_failed.tex")
                debug_path.parent.mkdir(parents=True, exist_ok=True)
                debug_path.write_text(latex, encoding="utf-8")
                logger.error(f"Saved failed LaTeX to {debug_path}")
            except Exception as e:
                logger.error(f"Failed to save debug LaTeX: {e}")

            if "failed to download" in details or "couldn't get it from the internet" in details:
                details = (
                    "Tectonic is installed, but it could not download its LaTeX support bundle. "
                    "Run the first compile from a normal terminal with internet access, or allow "
                    "Tectonic through your firewall/proxy. Original compiler output:\n\n"
                    f"{details}"
                )

            raise PDFCompilationError(details or "LaTeX compilation failed.")

        if not pdf_file.exists():
            raise PDFCompilationError("LaTeX compilation finished, but no PDF was generated.")

        return pdf_file.read_bytes()
