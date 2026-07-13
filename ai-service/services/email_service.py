import html
import os
from typing import Optional

import requests


RESEND_URL = "https://api.resend.com/emails"


def send_email(*, to: str, subject: str, html_body: str, text_body: str, tag: str) -> None:
    api_key = os.getenv("RESEND_API_KEY")
    sender = os.getenv("EMAIL_FROM", "CV Tailor <onboarding@resend.dev>")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")

    response = requests.post(
        RESEND_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "from": sender,
            "to": [to],
            "subject": subject,
            "html": html_body,
            "text": text_body,
            "tags": [{"name": "category", "value": tag}],
        },
        timeout=15,
    )
    if not response.ok:
        raise RuntimeError(f"Email provider error: {response.text[:300]}")


def verification_email(email: str, link: str) -> tuple[str, str, str]:
    safe_link = html.escape(link, quote=True)
    return (
        "Verify your CV Tailor account",
        f"<p>Welcome to CV Tailor.</p><p><a href=\"{safe_link}\">Verify your email address</a></p><p>This link expires in 24 hours.</p>",
        f"Welcome to CV Tailor. Verify your email address: {link}\nThis link expires in 24 hours.",
    )


def password_reset_email(email: str, link: str) -> tuple[str, str, str]:
    safe_link = html.escape(link, quote=True)
    return (
        "Reset your CV Tailor password",
        f"<p>We received a request to reset your CV Tailor password.</p><p><a href=\"{safe_link}\">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>",
        f"Reset your CV Tailor password: {link}\nThis link expires in 1 hour. If you did not request this, you can ignore this email.",
    )
