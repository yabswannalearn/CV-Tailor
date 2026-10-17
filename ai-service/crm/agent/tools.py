"""FunctionTools the career agent can call — thin wrappers over existing CV Tailor services.

The agent never emits LaTeX or invents profile facts; listings are fetched from
URLs by the runtime, fit is scored by job_evaluator_service and drafts come from
llm_service, all grounded in the saved Profile.

Legacy imports (database / services) are deferred into the call bodies: this
module must stay importable in any venv (tests, adk web), while the DB drivers
are only present in the process that actually runs the FastAPI app.
"""
import asyncio
import json

import httpx
from google.adk.tools import FunctionTool

FETCH_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CVTailorCopilot/1.0)"}


async def _fetch_html(url: str, max_chars: int = 400_000) -> str | None:
    timeout = httpx.Timeout(connect=3.0, read=8.0, write=3.0, pool=3.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, headers=FETCH_HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text[:max_chars]  # ponytail: hard cut, extraction tops out at 800k anyway
    except Exception:
        return None


def _load_saved_profile():
    from database import SessionLocal
    from models import database_models as db_models

    session = SessionLocal()
    try:
        return session.query(db_models.Profile).first()
    finally:
        session.close()


@FunctionTool
async def analyze_job_url(url: str) -> str:
    """Fetch a job posting URL and extract the title, company name and cleaned job description.
    Call this first whenever the user shares a job URL."""
    from services.llm_service import extract_job_details

    html = await _fetch_html(url)
    if not html:
        return json.dumps({"error": f"Could not fetch {url}. Ask the user to paste the job text instead."})
    try:
        details = await asyncio.to_thread(extract_job_details, html)
    except Exception as err:
        return json.dumps({"error": f"Extraction failed ({type(err).__name__}). Ask the user to paste the job text."})
    details["url"] = url
    return json.dumps(details)


@FunctionTool
async def compare_profile_to_job(job_description: str, job_title: str = "", company_name: str = "") -> str:
    """Score how well the saved profile fits a job description (0-100) with pros and cons."""
    from services.job_evaluator_service import evaluate_job_match

    profile = _load_saved_profile()
    if not profile:
        return json.dumps({"error": "No CV profile saved yet. Ask the user to complete the Personal tab first."})
    job = {"job_title": job_title, "company_name": company_name, "job_description": job_description}
    result = await evaluate_job_match(profile, job)
    return json.dumps({
        "score": result.get("match_score"),
        "summary": result.get("match_analysis", {}).get("summary"),
        "pros": result.get("match_analysis", {}).get("pros", []),
        "cons": result.get("match_analysis", {}).get("cons", []),
    })


@FunctionTool
async def draft_cover_letter(job_description: str, company_name: str = "", job_title: str = "") -> str:
    """Write a tailored cover letter for this job using ONLY the saved profile facts."""
    from services.llm_service import generate_cover_letter

    profile = _load_saved_profile()
    if not profile:
        return json.dumps({"error": "No CV profile saved yet."})
    try:
        letter = await asyncio.to_thread(generate_cover_letter, profile, job_description, company_name)
    except Exception as err:
        return json.dumps({"error": f"Cover letter generation failed ({type(err).__name__})."})
    return letter


TOOLS = [analyze_job_url, compare_profile_to_job, draft_cover_letter]
