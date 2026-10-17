"""Web chat — the primary copilot interface.

POST /chat/{user_id}/message streams SSE events:
  data: {"delta": "..."}   reply text chunks
  data: {"done": true}     final event
Frontend reads the stream with fetch(); no websocket, no extra dependency.
"""
import json
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..agent.career_agent import run_chat

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    session_id: str = Field(default="default", max_length=120)


async def _sse_stream(user_id: str, body: ChatIn):
    try:
        async for chunk in run_chat(user_id, body.session_id, body.message.strip()):
            if chunk:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
    except Exception as err:
        yield f"data: {json.dumps({'error': f'{type(err).__name__}'})}\n\n"


@router.post("/{user_id}/message")
async def chat_message(user_id: str, body: ChatIn):
    return StreamingResponse(
        _sse_stream(user_id, body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
