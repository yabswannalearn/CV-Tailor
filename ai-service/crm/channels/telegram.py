"""Telegram — the ALTERNATE gateway. Disabled unless TELEGRAM_BOT_TOKEN is set;
even then it shares the same run_chat() used by the web chat, with its own
session namespace (tg-<chat_id>)."""
import os

import httpx
from fastapi import APIRouter, Request

from ..agent.career_agent import run_chat

router = APIRouter(prefix="/telegram", tags=["telegram"])

TELEGRAM_API = "https://api.telegram.org"


@router.post("/webhook")
async def telegram_webhook(request: Request):
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        return {"ok": True, "skipped": "TELEGRAM_BOT_TOKEN not set"}

    update = await request.json()
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    text = (message.get("text") or "").strip()
    chat_id = chat.get("id")
    if not text or not chat_id:
        return {"ok": True}

    chunks = [chunk async for chunk in run_chat(f"tg-{chat_id}", "default", text[:4000])]
    reply = "\n\n".join(chunks)[:4096]
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{TELEGRAM_API}/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": reply},
            )
    except Exception:
        return {"ok": False, "error": "telegram_send_failed"}
    return {"ok": True}
