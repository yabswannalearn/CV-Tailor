"""Offline smoke checks for the copilot slice (no network, no API key needed)."""
import asyncio

from crm.agent import career_agent
from crm.api.chat_routes import ChatIn, _sse_stream


def test_agent_builds_with_expected_tools():
    agent = career_agent.root_agent
    assert agent.name == "career_copilot"
    names = [getattr(t, "name", "") for t in agent.tools]
    for expected in ("analyze_job_url", "compare_profile_to_job", "draft_cover_letter", "google_search"):
        assert expected in names, names


def test_run_chat_yields_without_model_key():
    """No GEMINI/GOOGLE key: run_chat must exit cleanly through the error path."""
    import os
    os.environ.pop("GEMINI_API_KEY", None)
    os.environ["GOOGLE_API_KEY"] = ""

    async def run():
        return [c async for c in career_agent.run_chat("smoke-user", "default", "ping")]

    reply = "".join(asyncio.run(run()))
    assert "error" in reply.lower()


def test_sse_stream_wires_run_chat_offline():
    async def run():
        return [e async for e in _sse_stream("sse-user", ChatIn(message="ping"))]

    events = asyncio.run(run())
    assert events[-1].startswith("data: ")
    assert "done" in events[-1]
