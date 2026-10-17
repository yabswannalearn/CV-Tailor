"""Channel-agnostic career agent. The web chat is the primary interface; Telegram
and any future channel only ever call run_chat() — they never talk to the model
or tools directly."""
import logging
import os

from google.adk import Runner
from google.adk.agents import LlmAgent
from google.adk.sessions import DatabaseSessionService
from google.adk.tools import google_search
from google.genai import types

from .tools import TOOLS

logger = logging.getLogger(__name__)

APP_NAME = "cv_tailor_chat"

# The backend .env stores AI credentials as GEMINI_API_KEY; ADK expects
# GOOGLE_API_KEY + explicit non-Vertex mode. Re-checked per call so tests can
# override the environment.
def _configure_auth() -> None:
    os.environ.setdefault("GOOGLE_API_KEY", os.getenv("GEMINI_API_KEY", ""))
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="career_copilot",
        model=os.getenv("CRM_AGENT_MODEL", "gemini-2.5-flash"),
        instruction=(
            "You are CV Tailor's career copilot chat assistant.\n"
            "When the user shares a job URL, ALWAYS call analyze_job_url first.\n"
            "Then call compare_profile_to_job with the extracted description.\n"
            "Optionally use google_search once for brief company verification\n"
            "(hiring status, recent news) if the user asks or the listing looks stale.\n"
            "Reply in this shape:\n"
            "1. Verdict: APPLY / MAYBE / SKIP with the match score.\n"
            "2. Two or three pros and one or two cons, grounded in the extracted listing.\n"
            "3. Offer: 'Want me to draft a cover letter for this one?' — only after the\n"
            "   user confirms, call draft_cover_letter. For a full tailored CV/PDF say\n"
            "   the Generate CV page renders it and link to /generate.\n"
            "Never invent facts about the user's profile. Keep replies compact."
        ),
        description="Evaluates job links against the saved CV profile.",
        tools=list(TOOLS) + [google_search],
    )


root_agent = build_agent()

# Separate SQLite file — the CRM chat sessions stay out of the legacy Postgres DB (ADR-0003/0004).
# ADK's DatabaseSessionService is async-only, so sqlite needs the aiosqlite driver.
SESSION_DB_URL = os.getenv("CRM_SESSION_DB", "sqlite+aiosqlite:///./crm_sessions.db")
session_service = DatabaseSessionService(db_url=SESSION_DB_URL)
runner = Runner(agent=root_agent, app_name=APP_NAME, session_service=session_service)


async def ensure_session(user_id: str, session_id: str) -> None:
    existing = await session_service.get_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)
    if not existing:
        await session_service.create_session(app_name=APP_NAME, user_id=user_id, session_id=session_id)


async def run_chat(user_id: str, session_id: str, text: str):
    """Single gateway for every channel: yields reply text chunks for one user turn."""
    _configure_auth()
    await ensure_session(user_id, session_id)
    message = types.Content(role="user", parts=[types.Part(text=text)])
    try:
        async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=message):
            if event.is_final_response() and event.content:
                yield "".join(part.text or "" for part in (event.content.parts or []) if getattr(part, "text", None))
    except Exception as err:
        logger.exception("Agent run failed for user %s", user_id)
        yield f"Sorry, the copilot hit an error ({type(err).__name__}). Check the backend log."
