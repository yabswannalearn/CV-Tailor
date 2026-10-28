"""User-scoped conversations, application drafts, and career agent runs."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user_id
from limiter import limiter
from models import database_models as models
from services.career_agent import CareerToolContext, run_career_agent, serialize_draft
from services.pdf_service import PDFCompilationError, compile_latex_to_pdf, pdf_page_count

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ConversationCreate(BaseModel):
    job_id: int | None = None


class LinkJob(BaseModel):
    job_id: int


class SendMessage(BaseModel):
    content: str = Field(min_length=1, max_length=12000)
    request_id: str | None = Field(default=None, min_length=1, max_length=80)


class ReviseDraft(BaseModel):
    content: str = Field(min_length=1, max_length=100000)


def _conversation(db, user_id, conversation_id):
    conversation = db.query(models.AssistantConversation).filter(
        models.AssistantConversation.id == conversation_id,
        models.AssistantConversation.user_id == user_id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


def _job(db, user_id, job_id):
    if job_id is None:
        return None
    job = db.query(models.JobApplication).filter(
        models.JobApplication.id == job_id, models.JobApplication.user_id == user_id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


def _draft(db, conversation_id, draft_id):
    draft = db.query(models.AssistantDraft).filter(
        models.AssistantDraft.id == draft_id,
        models.AssistantDraft.conversation_id == conversation_id,
    ).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")
    return draft


def _summary(conversation):
    return {"id": conversation.id, "job_id": conversation.job_id, "title": conversation.title,
            "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None}


def _detail(conversation, db):
    messages = db.query(models.AssistantMessage).filter(
        models.AssistantMessage.conversation_id == conversation.id).order_by(models.AssistantMessage.id).all()
    drafts = db.query(models.AssistantDraft).filter(
        models.AssistantDraft.conversation_id == conversation.id).order_by(models.AssistantDraft.id).all()
    return {**_summary(conversation), "messages": [{"id": m.id, "role": m.role, "content": m.content,
             "created_at": m.created_at.isoformat() if m.created_at else None} for m in messages],
            "drafts": [serialize_draft(d) for d in drafts]}


@router.get("/conversations")
def list_conversations(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    conversations = db.query(models.AssistantConversation).filter(
        models.AssistantConversation.user_id == user_id).order_by(models.AssistantConversation.updated_at.desc()).all()
    return [_summary(item) for item in conversations]


@router.post("/conversations")
def create_conversation(data: ConversationCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = _job(db, user_id, data.job_id)
    if job:
        existing = db.query(models.AssistantConversation).filter_by(user_id=user_id, job_id=job.id).first()
        if existing:
            return _summary(existing)
    conversation = models.AssistantConversation(user_id=user_id, job_id=job.id if job else None,
        title=f"{job.job_title} · {job.company_name}"[:200] if job else "General conversation")
    db.add(conversation)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(models.AssistantConversation).filter_by(user_id=user_id, job_id=data.job_id).first()
        if existing:
            return _summary(existing)
        raise
    db.refresh(conversation)
    return _summary(conversation)


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int, request: Request, db: Session = Depends(get_db)):
    conversation = _conversation(db, get_current_user_id(request), conversation_id)
    return _detail(conversation, db)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, request: Request, db: Session = Depends(get_db)):
    conversation = _conversation(db, get_current_user_id(request), conversation_id)
    db.delete(conversation)
    db.commit()
    return {"status": "deleted"}


@router.post("/conversations/{conversation_id}/link-job")
def link_job(conversation_id: int, data: LinkJob, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    conversation = _conversation(db, user_id, conversation_id)
    job = _job(db, user_id, data.job_id)
    if conversation.job_id is not None and conversation.job_id != job.id:
        raise HTTPException(status_code=409, detail="This conversation already belongs to an application.")
    other = db.query(models.AssistantConversation).filter(
        models.AssistantConversation.user_id == user_id, models.AssistantConversation.job_id == job.id,
        models.AssistantConversation.id != conversation.id).first()
    if other:
        raise HTTPException(status_code=409, detail="That application already has a conversation.")
    conversation.job_id = job.id
    conversation.title = f"{job.job_title} · {job.company_name}"[:200]
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That application already has a conversation.") from exc
    return _detail(conversation, db)


@router.post("/conversations/{conversation_id}/messages")
@limiter.limit("10/minute")
async def send_message(conversation_id: int, data: SendMessage, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    conversation = _conversation(db, user_id, conversation_id)
    job = _job(db, user_id, conversation.job_id)
    profile = db.query(models.Profile).filter(models.Profile.user_id == user_id).first()
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Enter a message.")
    if data.request_id:
        existing = db.query(models.AssistantMessage).filter_by(
            conversation_id=conversation.id, request_key=data.request_id).first()
        if existing:
            if existing.content != content:
                raise HTTPException(status_code=409, detail="This request ID was already used for a different message.")
            return _detail(conversation, db)
    history = db.query(models.AssistantMessage).filter(
        models.AssistantMessage.conversation_id == conversation.id).order_by(models.AssistantMessage.id).all()
    transcript = [{"role": m.role, "content": m.content} for m in history] + [{"role": "user", "content": content}]
    evidence = "\n".join(item["content"] for item in transcript if item["role"] == "user")[-20000:]
    db.add(models.AssistantMessage(conversation_id=conversation.id, role="user", content=content,
                                   request_key=data.request_id))
    ctx = CareerToolContext(db, user_id, conversation, job, profile, evidence)
    try:
        # Claim the request ID before the model or any paid tools run. A unique
        # constraint makes concurrent retries wait for the first transaction.
        db.flush()
        reply = await run_career_agent(ctx, transcript)
        assistant_message = models.AssistantMessage(conversation_id=conversation.id, role="assistant", content=reply)
        db.add(assistant_message)
        db.flush()
        for draft in ctx.created_drafts:
            if inspect(draft).persistent:
                draft.details = {**(draft.details or {}), "assistant_message_id": assistant_message.id}
        conversation.updated_at = datetime.now(timezone.utc)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        existing = db.query(models.AssistantMessage).filter_by(
            conversation_id=conversation_id, request_key=data.request_id).first() if data.request_id else None
        if existing and existing.content == content:
            conversation = _conversation(db, user_id, conversation_id)
            return _detail(conversation, db)
        raise HTTPException(status_code=409, detail="This request ID has already been used.") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail="The career agent couldn't respond. Please try again.") from exc
    return _detail(conversation, db)


@router.post("/conversations/{conversation_id}/drafts/{draft_id}/revise")
def revise_draft(conversation_id: int, draft_id: int, data: ReviseDraft, request: Request, db: Session = Depends(get_db)):
    conversation = _conversation(db, get_current_user_id(request), conversation_id)
    original = _draft(db, conversation.id, draft_id)
    details = {key: value for key, value in (original.details or {}).items() if key != "assistant_message_id"}
    draft = models.AssistantDraft(conversation_id=conversation.id, type=original.type,
                                  content=data.content, details=details)
    db.add(draft)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(draft)
    return serialize_draft(draft)


@router.post("/conversations/{conversation_id}/drafts/{draft_id}/apply")
def apply_draft(conversation_id: int, draft_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    conversation = _conversation(db, user_id, conversation_id)
    job = _job(db, user_id, conversation.job_id)
    if not job:
        raise HTTPException(status_code=422, detail="Link this conversation to an application first.")
    draft = _draft(db, conversation.id, draft_id)
    if draft.type == "cover_letter":
        _snapshot_current(db, conversation, "cover_letter", job.cover_letter)
        job.cover_letter = draft.content
    elif draft.type == "resume":
        try:
            pdf = compile_latex_to_pdf(draft.content)
            pages = pdf_page_count(pdf)
        except PDFCompilationError as exc:
            raise HTTPException(status_code=422, detail=f"Could not compile this resume: {exc}") from exc
        if pages != 1:
            raise HTTPException(status_code=422, detail=f"Resume must fit one page; this draft has {pages} pages. Open it in the editor to resolve overflow.")
        _snapshot_current(db, conversation, "resume", job.latex_source)
        job.latex_source, job.pdf_data = draft.content, pdf
        job.pdf_generated_at = datetime.now(timezone.utc)
    else:
        raise HTTPException(status_code=422, detail="Only resume and cover letter drafts can be applied to an application.")
    db.commit()
    return {"status": "applied", "job_id": job.id, "draft_id": draft.id}


def _snapshot_current(db, conversation, draft_type, content):
    if not content:
        return
    existing = db.query(models.AssistantDraft.id).filter_by(
        conversation_id=conversation.id, type=draft_type, content=content).first()
    if not existing:
        db.add(models.AssistantDraft(conversation_id=conversation.id, type=draft_type,
                                     content=content, details={"origin": "previous_application_document"}))


@router.get("/conversations/{conversation_id}/drafts/{draft_id}/pdf")
def download_draft_pdf(conversation_id: int, draft_id: int, request: Request, db: Session = Depends(get_db)):
    conversation = _conversation(db, get_current_user_id(request), conversation_id)
    draft = _draft(db, conversation.id, draft_id)
    if draft.type == "resume":
        try:
            pdf = compile_latex_to_pdf(draft.content)
        except PDFCompilationError as exc:
            raise HTTPException(status_code=422, detail=f"Could not compile this CV: {exc}") from exc
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": "inline; filename=cv-draft.pdf", "Cache-Control": "no-store"})
    if draft.type != "cheat_sheet":
        raise HTTPException(status_code=422, detail="PDF export is available for CVs and cheat sheets.")
    from services.career_documents import cheat_sheet_pdf
    try:
        pdf = cheat_sheet_pdf(draft.content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not create the cheat sheet PDF.") from exc
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=interview-cheat-sheet.pdf"})
