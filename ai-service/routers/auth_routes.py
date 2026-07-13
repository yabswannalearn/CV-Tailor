from datetime import datetime, timedelta, timezone
import hashlib
import os
import secrets
import logging

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import database_models as db_models
from models.schemas import (
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RegisterRequest,
    EmailRequest,
)
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from limiter import limiter
from services.email_service import password_reset_email, send_email, verification_email

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

ph = PasswordHasher()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "https://cvtailor.me").rstrip("/")


def issue_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, token_hash(raw)

@router.post("/register")
@limiter.limit("5/minute")
async def register(data: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    existing = db.query(db_models.User).filter(
        db_models.User.email == data.email
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = ph.hash(data.password)
    raw_token, hashed_token = issue_token()
    user = db_models.User(
        email=data.email,
        hashed_password=hashed_pw,
        is_verified=False,
        verification_token_hash=hashed_token,
        verification_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    subject, html_body, text_body = verification_email(
        data.email, f"{frontend_url()}/verify?token={raw_token}"
    )
    try:
        send_email(to=data.email, subject=subject, html_body=html_body, text_body=text_body, tag="verify-email")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Unable to send verification email. Please try again later.") from exc

    return {"status": "success", "email": user.email, "message": "Check your email to verify your account."}

@router.post("/login")
@limiter.limit("5/minute")
async def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(db_models.User).filter(
        db_models.User.email == data.email
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before signing in.")

    if not user.hashed_password:
        # Legacy account migration: Set the password to whatever they just typed
        user.hashed_password = ph.hash(data.password)
        db.commit()
        db.refresh(user)
    else:
        try:
            ph.verify(user.hashed_password, data.password)
            if ph.check_needs_rehash(user.hashed_password):
                user.hashed_password = ph.hash(data.password)
                db.commit()
        except VerifyMismatchError:
            raise HTTPException(status_code=401, detail="Invalid password")

    request.session["user_id"] = user.id
    request.session["email"] = user.email

    return {"status": "success", "user_id": user.id, "email": user.email}

@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "success", "message": "Logged out"}

@router.get("/me")
async def me(request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        request.session.clear()
        raise HTTPException(status_code=401, detail="User not found")
        
    return {
        "user_id": user.id, 
        "email": user.email,
        "credits": user.credits
    }


@router.get("/verify-email")
async def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(db_models.User).filter(
        db_models.User.verification_token_hash == token_hash(token)
    ).first()
    if not user or not user.verification_token_expires_at or user.verification_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This verification link is invalid or expired.")

    user.is_verified = True
    user.verification_token_hash = None
    user.verification_token_expires_at = None
    db.commit()
    return {"status": "success", "message": "Email verified. You can now sign in."}


@router.post("/verify-email/resend")
@limiter.limit("3/hour")
async def resend_verification(data: EmailRequest, request: Request, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(db_models.User).filter(db_models.User.email == email).first()
    if user and not user.is_verified:
        raw_token, hashed_token = issue_token()
        user.verification_token_hash = hashed_token
        user.verification_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db.commit()
        subject, html_body, text_body = verification_email(email, f"{frontend_url()}/verify?token={raw_token}")
        try:
            send_email(to=email, subject=subject, html_body=html_body, text_body=text_body, tag="verify-email")
        except RuntimeError as exc:
            logger.error(f"Failed to send verification email to {email}: {exc}")
    return {"status": "success", "message": "If the account needs verification, a new email has been sent."}


@router.post("/password-reset/request")
@limiter.limit("3/hour")
async def request_password_reset(data: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(db_models.User).filter(db_models.User.email == data.email.strip().lower()).first()
    if user:
        raw_token, hashed_token = issue_token()
        user.password_reset_token_hash = hashed_token
        user.password_reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        subject, html_body, text_body = password_reset_email(
            user.email, f"{frontend_url()}/reset-password?token={raw_token}"
        )
        try:
            send_email(to=user.email, subject=subject, html_body=html_body, text_body=text_body, tag="password-reset")
        except RuntimeError as exc:
            logger.error(f"Failed to send password reset email to {user.email}: {exc}")
    return {"status": "success", "message": "If an account exists, a password reset email has been sent."}


@router.post("/password-reset/confirm")
async def confirm_password_reset(data: PasswordResetConfirmRequest, db: Session = Depends(get_db)):
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    user = db.query(db_models.User).filter(
        db_models.User.password_reset_token_hash == token_hash(data.token)
    ).first()
    if not user or not user.password_reset_token_expires_at or user.password_reset_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired.")

    user.hashed_password = ph.hash(data.password)
    user.password_reset_token_hash = None
    user.password_reset_token_expires_at = None
    db.commit()
    return {"status": "success", "message": "Password reset successfully."}
