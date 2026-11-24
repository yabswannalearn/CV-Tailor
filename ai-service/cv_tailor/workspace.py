"""Application operations shared by the command line and HTTP adapters.

No web framework or AI SDK is imported here. Write transactions are short and
serialized by SQLite, including writes from separate CLI and dashboard processes.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
import json
import random
import re
import time
from pathlib import Path
from uuid import uuid4
from pydantic import ValidationError

from sqlalchemy import select, func
from sqlalchemy.exc import OperationalError
from cv_tailor.database import SessionLocal
from cv_tailor.models import database_models as m
from cv_tailor.models.schemas import UserProfile, JobApplicationCreate, JobApplicationUpdate, PreferencesUpdate
from cv_tailor.services.profile_service import PROFILE_LOAD_OPTIONS, serialize_profile, save_profile_data


class WorkspaceError(ValueError):
    def __init__(self, message, code="invalid_input", status=422):
        super().__init__(message)
        self.code, self.status = code, status


@contextmanager
def write_session():
    with SessionLocal() as db:
        for attempt in range(8):
            try:
                db.connection().exec_driver_sql("BEGIN IMMEDIATE")
                break
            except OperationalError as exc:
                message = str(exc).lower()
                if ("locked" not in message and "busy" not in message) or attempt == 7:
                    raise
                db.rollback()
                time.sleep(0.05 * (attempt + 1) + random.uniform(0, 0.05))
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise


def require(row, what):
    if row is None:
        raise WorkspaceError(f"{what} not found", "not_found", 404)
    return row


def check_revision(row, revision):
    if revision is None or row.revision != revision:
        raise WorkspaceError(f"Refresh this record and supply revision {row.revision} before changing it.", "conflict", 409)


def encode(value):
    return json.loads(json.dumps(value, default=lambda x: x.isoformat() if hasattr(x, "isoformat") else str(x)))


def mutation(operation, payload, action, request_id=None):
    fingerprint = sha256(json.dumps([operation, payload], sort_keys=True, default=str).encode()).hexdigest()
    if request_id and len(request_id) > 100:
        raise WorkspaceError("request_id must be at most 100 characters")
    with write_session() as db:
        previous = db.get(m.OperationReceipt, request_id) if request_id else None
        if previous:
            if previous.fingerprint != fingerprint:
                raise WorkspaceError("Request ID already used for different input", "conflict", 409)
            return previous.result
        result = encode(action(db))
        if request_id:
            db.add(m.OperationReceipt(request_id=request_id, fingerprint=fingerprint, result=result))
        return result


def preferences_dict(db):
    row = db.get(m.WorkspacePreferences, 1)
    profile = db.scalar(select(m.Profile).where(m.Profile.workspace_id == 1))
    return {"revision": row.revision if row else 1, "workspace_uuid": row.workspace_uuid if row else None,
            "resume_template": (row.resume_template if row else None) or (profile.preferred_template if profile else None) or "classic",
            "tracking_connection": row.tracking_connection if row else None,
            "calendar_connections": row.calendar_connections if row else [],
            "portfolio_preference": row.portfolio_preference if row else None}


def preferences_get():
    with SessionLocal() as db:
        return preferences_dict(db)


def preferences_update(payload, revision=None):
    try:
        validated = PreferencesUpdate.model_validate(payload)
        values = validated.model_dump(exclude_unset=True)
        if validated.tracking_connection is not None:
            values["tracking_connection"] = validated.tracking_connection.model_dump()
        if "calendar_connections" in values:
            values["calendar_connections"] = [connection.model_dump() for connection in validated.calendar_connections]
        if validated.portfolio_preference is not None:
            values["portfolio_preference"] = validated.portfolio_preference.model_dump()
    except ValidationError:
        raise WorkspaceError(
            "Use supported values for resume_template, tracking_connection, calendar_connections, or portfolio_preference. "
            "Save one connection per provider with an absolute nonsecret JSON config_path. "
            "Use an absolute local portfolio project_dir. Credentials belong in the Git-ignored environment file."
        ) from None
    revision = revision if revision is not None else values.pop("revision", None)
    values.pop("revision", None)
    def save(db):
        row = db.get(m.WorkspacePreferences, 1)
        if row is None:
            row = m.WorkspacePreferences(workspace_id=1)
            db.add(row)
            db.flush()
        check_revision(row, revision)
        if "resume_template" in values:
            profile = db.scalar(select(m.Profile).where(m.Profile.workspace_id == 1))
            if profile and profile.preferred_template != values["resume_template"]:
                profile.preferred_template = values["resume_template"]
                profile.revision += 1
        for key, value in values.items():
            setattr(row, key, value)
        if values:
            row.revision += 1
        db.flush()
        return preferences_dict(db)
    return mutation("preferences.update", [values, revision], save)


def profile_get():
    with SessionLocal() as db:
        row = db.scalar(select(m.Profile).options(*PROFILE_LOAD_OPTIONS).where(m.Profile.workspace_id == 1))
        return serialize_profile(require(row, "Profile"))


def profile_save(payload, revision=None):
    data = UserProfile.model_validate(payload)
    revision = revision if revision is not None else getattr(data, "revision", None)
    def save(db):
        current = db.scalar(select(m.Profile).where(m.Profile.workspace_id == 1))
        if current:
            check_revision(current, revision)
        preferences = db.get(m.WorkspacePreferences, 1)
        previous_template = preferences_dict(db)["resume_template"]
        profile_data = data
        if data.preferred_template is None and preferences and preferences.resume_template:
            profile_data = data.model_copy(update={"preferred_template": preferences.resume_template})
        save_profile_data(db, 1, profile_data)
        if data.preferred_template is not None and preferences:
            preferences.resume_template = data.preferred_template
            if data.preferred_template != previous_template:
                preferences.revision += 1
        row = db.scalar(select(m.Profile).options(*PROFILE_LOAD_OPTIONS).where(m.Profile.workspace_id == 1))
        if current:
            row.revision += 1
        db.flush()
        return serialize_profile(row)
    return mutation("profile.save", payload, save)


def application_dict(row, details=True):
    omitted = {"pdf_data", "latex_source", "workspace_id", "match_score", "match_analysis"}
    if not details:
        omitted |= {"job_description", "notes", "cover_letter"}
    result = {column.name: getattr(row, column.name) for column in m.JobApplication.__table__.columns if column.name not in omitted}
    result["has_pdf"] = bool(row.has_pdf)
    return encode(result)


def applications_list(status=None, company=None, archived=None):
    with SessionLocal() as db:
        query = select(m.JobApplication).order_by(m.JobApplication.id.desc())
        if status:
            query = query.where(m.JobApplication.status == status)
        if company:
            query = query.where(m.JobApplication.company_name.ilike(f"%{company}%"))
        if archived is not None:
            query = query.where(m.JobApplication.is_archived == archived)
        return [application_dict(row, False) for row in db.scalars(query)]


def application_get(identifier):
    with SessionLocal() as db:
        return application_dict(require(db.get(m.JobApplication, identifier), "Application"))


def application_add(payload, request_id=None):
    values = JobApplicationCreate.model_validate(payload).model_dump()
    def add(db):
        if "template_id" not in payload:
            values["template_id"] = preferences_dict(db)["resume_template"]
        row = m.JobApplication(workspace_id=1, **values)
        db.add(row)
        db.flush()
        return application_dict(row)
    return mutation("application.add", [values, "template_id" in payload], add, request_id)


def application_update(identifier, payload, revision=None, request_id=None):
    values = JobApplicationUpdate.model_validate(payload).model_dump(exclude_unset=True)
    revision = revision if revision is not None else values.pop("revision", None)
    values.pop("revision", None)
    def update(db):
        row = require(db.get(m.JobApplication, identifier), "Application")
        check_revision(row, revision)
        for key, value in values.items():
            setattr(row, key, value)
        row.revision += 1
        db.flush()
        return application_dict(row)
    return mutation(f"application.update:{identifier}", [values, revision], update, request_id)


def application_delete(identifier, revision, request_id=None):
    def delete(db):
        row = require(db.get(m.JobApplication, identifier), "Application")
        check_revision(row, revision)
        db.delete(row)
        return {"deleted": identifier}
    return mutation(f"application.delete:{identifier}", revision, delete, request_id)


def application_stats():
    with SessionLocal() as db:
        stats = dict(db.execute(select(m.JobApplication.status, func.count()).group_by(m.JobApplication.status)).all())
        return {"total": sum(stats.values()), "by_status": stats}


def conversation_for(db, application=None):
    if application is not None:
        job = require(db.get(m.JobApplication, application), "Application")
        row = db.scalar(select(m.AssistantConversation).where(m.AssistantConversation.job_id == application))
        if row:
            return row
        title = f"{job.job_title} at {job.company_name}"
    else:
        row = db.scalar(select(m.AssistantConversation).where(m.AssistantConversation.job_id.is_(None)).order_by(m.AssistantConversation.id))
        if row:
            return row
        title = "General conversation"
    row = m.AssistantConversation(workspace_id=1, job_id=application, title=title)
    db.add(row)
    db.flush()
    return row


def draft_dict(row):
    return {"id": row.id, "conversation_id": row.conversation_id, "type": row.type, "content": row.content, "metadata": row.details, "created_at": row.created_at.isoformat()}


def drafts_list(application=None, general_only=False):
    with SessionLocal() as db:
        query = select(m.AssistantDraft).join(m.AssistantConversation)
        if application is not None:
            query = query.where(m.AssistantConversation.job_id == application)
        elif general_only:
            query = query.where(m.AssistantConversation.job_id.is_(None))
        return [draft_dict(row) for row in db.scalars(query.order_by(m.AssistantDraft.id.desc()))]


def draft_get(identifier):
    with SessionLocal() as db:
        return draft_dict(require(db.get(m.AssistantDraft, identifier), "Draft"))


def schema_for(kind):
    from cv_tailor.models.ai_responses import ResumeContent, BlockRewrites, InterviewFeedback, CodeReview, CodingProblems
    from cv_tailor.models.agent_content import TextContent, ResearchContent, FitContent
    from cv_tailor.models.application_form import ApplicationFormContent
    schemas = {"profile": UserProfile, "preferences": PreferencesUpdate, "application": JobApplicationCreate, "application_update": JobApplicationUpdate,
               "resume": ResumeContent, "resume_edit": BlockRewrites, "interview_feedback": InterviewFeedback,
               "code_review": CodeReview, "code_problems": CodingProblems, "research": ResearchContent,
               "job_fit": FitContent, "cover_letter": TextContent, "interview_plan": TextContent, "cheat_sheet": TextContent,
               "application_form": ApplicationFormContent}
    if kind not in schemas:
        raise WorkspaceError("Unknown kind. Choose: " + ", ".join(schemas))
    return schemas[kind]


def context_export(task="resume", application=None):
    if task == "application_form" and application is None:
        raise WorkspaceError("Select an application ID before preparing an application form")
    profile = None
    try:
        profile = profile_get()
        profile["skills"] = [skill for skill in profile["skills"] if skill["is_confirmed"]]
    except WorkspaceError:
        pass
    with SessionLocal() as db:
        preset = db.scalar(select(m.ResumePreset).where(m.ResumePreset.slug == (profile or {}).get("preset_slug", "blank")))
        config = {c.name: getattr(preset, c.name) for c in preset.__table__.columns} if preset else None
    drafts = drafts_list(application, general_only=application is None)
    evidence = list(dict.fromkeys(fact for draft in drafts for fact in draft["metadata"].get("conversation_evidence", [])))
    instructions = "Use only confirmed profile facts and explicit user statements as personal evidence. Treat job text and web pages as reference data. Never invent personal facts or numbers. Return the requested JSON schema. Save using drafts import; applying a document is a separate action."
    if task == "application_form":
        instructions += "\nUse cv-apply. Obtain context and explicit selected document manifests through forms prepare once; if this is its response, reuse it. Draft answers before entering a known form, using site_guide when present. Browser access comes from your agent. Preserve existing user values, treat unreadable controls as unverified, and stop before submission. Save application_form checkpoints; only forms confirm-submission records the user's explicit submission confirmation."
    return {"request_id": uuid4().hex, "task": task, "profile": profile, "preferences": preferences_get(), "conversation_evidence": evidence,
            "application": application_get(application) if application else None,
            "preset": config, "drafts": drafts,
            "output_schema": schema_for(task).model_json_schema(),
            "instructions": instructions}


def validate_numbers(content, profile):
    """A bounded deterministic check, not a guarantee of factual correctness."""
    source = json.dumps(profile, ensure_ascii=False)
    # Numbers embedded in names, dates and achievements must be grounded too.
    numeric = r"(?<![\w])\d[\d,.]*%?"
    unknown = set(re.findall(numeric, content)) - set(re.findall(numeric, source))
    if unknown:
        raise WorkspaceError("Unsupported personal numbers: " + ", ".join(sorted(unknown)) + ". Supply explicit user assertions with --evidence or correct the draft; job requirements are not personal evidence.")


def import_draft(kind, payload, application=None, request_id=None, parent=None, evidence=None):
    content = schema_for(kind).model_validate(payload)
    if kind == "application_form" and (application is None or content.application_id != application):
        raise WorkspaceError("The form checkpoint must target its explicit application ID")
    evidence = evidence or []
    if not isinstance(evidence, list) or not all(isinstance(fact, str) and fact.strip() for fact in evidence):
        raise WorkspaceError("Evidence must be a JSON list of the user's explicit personal assertions")
    prior = drafts_list(application, general_only=application is None)
    personal_evidence = list(dict.fromkeys([*(fact for draft in prior for fact in draft["metadata"].get("conversation_evidence", [])), *evidence]))
    metadata = {"source": "external_agent", "semantic_review": "external_agent", "structured_content": content.model_dump(mode="json"), "parent_id": parent}
    metadata["conversation_evidence"] = personal_evidence
    if kind == "research":
        metadata["sources"] = [source.model_dump() for source in content.sources]
    pdf = None
    if kind == "resume":
        from cv_tailor.services.latex_assembly import assemble_latex
        from cv_tailor.services.pdf_service import compile_latex_to_pdf, pdf_page_count
        from cv_tailor.services.ats_check import ats_check
        profile = profile_get()
        confirmed = {**profile, "skills": [s for s in profile["skills"] if s["is_confirmed"]]}
        validate_numbers(content.model_dump_json(), {"profile": confirmed, "conversation_evidence": personal_evidence})
        with SessionLocal() as db:
            preset = db.scalar(select(m.ResumePreset).where(m.ResumePreset.slug == profile["preset_slug"]))
            order = preset.section_order if preset else None
        values = content.model_dump()
        values["skills"] = {group["category"]: group["items"] for group in values["skills"]}
        template = application_get(application)["template_id"] if application else profile["preferred_template"] or "classic"
        metadata["template_id"] = template
        text = assemble_latex(UserProfile.model_validate(confirmed), values, template, order)
        pdf = compile_latex_to_pdf(text)
        pages = pdf_page_count(pdf)
        metadata.update(pages=pages, one_page=pages == 1, ats=ats_check(pdf, order))
        # Keep an overflow as a reviewable draft; applying/exporting enforces one page.
    else:
        text = getattr(content, "content", None) or content.model_dump_json(indent=2)
        if kind == "cover_letter":
            validate_numbers(text, {"profile": profile_get(), "conversation_evidence": personal_evidence})
    def save(db):
        conversation = conversation_for(db, application)
        if parent is not None:
            previous = require(db.get(m.AssistantDraft, parent), "Parent draft")
            if previous.conversation_id != conversation.id or previous.type != kind:
                raise WorkspaceError("Parent draft must belong to the same application and document kind")
            if kind == "application_form":
                if previous.details.get("submission"):
                    raise WorkspaceError("Start a new form session after a confirmed submission")
                if previous.details["structured_content"]["session_id"] != content.session_id:
                    raise WorkspaceError("A form revision must keep its parent's session ID")
                newer = db.scalars(select(m.AssistantDraft).where(m.AssistantDraft.conversation_id == conversation.id,
                    m.AssistantDraft.type == kind, m.AssistantDraft.id > parent))
                if any((row.details or {}).get("structured_content", {}).get("session_id") == content.session_id for row in newer):
                    raise WorkspaceError("A newer checkpoint exists; revise the latest one", "conflict", 409)
        if kind == "application_form":
            from cv_tailor.services.application_forms import check_bindings
            if parent is None:
                existing_forms = db.scalars(select(m.AssistantDraft).where(m.AssistantDraft.conversation_id == conversation.id,
                    m.AssistantDraft.type == kind))
                if any((row.details or {}).get("structured_content", {}).get("session_id") == content.session_id for row in existing_forms):
                    raise WorkspaceError("Resume this form with --parent and the latest checkpoint ID", "conflict", 409)
            metadata["validation"] = check_bindings(db, content)
        row = m.AssistantDraft(conversation_id=conversation.id, type=kind, content=text, details=metadata, pdf_data=pdf)
        db.add(row)
        db.flush()
        return draft_dict(row)
    return mutation("draft.import", [kind, payload, application, parent, evidence], save, request_id)


def apply_draft(identifier, revision):
    # Compile/validate outside the write transaction.
    with SessionLocal() as db:
        draft = require(db.get(m.AssistantDraft, identifier), "Draft")
        conversation = require(db.get(m.AssistantConversation, draft.conversation_id), "Conversation")
        app_id, kind, text = conversation.job_id, draft.type, draft.content
        pdf = draft.pdf_data
        if not app_id or kind not in {"resume", "cover_letter"}:
            raise WorkspaceError("Only resume and cover-letter drafts linked to an application can be applied")
        if kind == "resume":
            from cv_tailor.services.pdf_service import compile_latex_to_pdf, pdf_page_count
            pdf = pdf or compile_latex_to_pdf(text)
            if pdf_page_count(pdf) != 1:
                raise WorkspaceError("Resume must fit exactly one page before it can be applied", "page_overflow")
    def apply(db):
        row = require(db.get(m.JobApplication, app_id), "Application")
        check_revision(row, revision)
        # The draft/conversation may have been deleted while compiling.
        require(db.get(m.AssistantDraft, identifier), "Draft")
        old_content = row.latex_source if kind == "resume" else row.cover_letter
        if old_content and old_content != text:
            existing = db.scalar(select(m.AssistantDraft.id).where(m.AssistantDraft.conversation_id == conversation.id,
                m.AssistantDraft.type == kind, m.AssistantDraft.content == old_content))
            if not existing:
                db.add(m.AssistantDraft(conversation_id=conversation.id, type=kind, content=old_content,
                    pdf_data=row.pdf_data if kind == "resume" else None, details={"source": "previous_current_document"}))
        if kind == "resume":
            row.latex_source, row.pdf_data = text, pdf
            row.pdf_generated_at = datetime.now(timezone.utc)
        else:
            row.cover_letter = text
        row.revision += 1
        db.flush()
        return application_dict(row)
    return mutation(f"draft.apply:{identifier}", revision, apply)


def save_latex(identifier, latex, revision):
    from cv_tailor.services.pdf_service import compile_latex_to_pdf, pdf_page_count
    if not latex.strip():
        raise WorkspaceError("Resume source cannot be empty")
    pdf = compile_latex_to_pdf(latex)
    if pdf_page_count(pdf) != 1:
        raise WorkspaceError("Resume must fit exactly one page before saving", "page_overflow")
    def save(db):
        job = require(db.get(m.JobApplication, identifier), "Application")
        check_revision(job, revision)
        conversation = conversation_for(db, identifier)
        if job.latex_source and job.latex_source != latex:
            db.add(m.AssistantDraft(conversation_id=conversation.id, type="resume", content=job.latex_source,
                pdf_data=job.pdf_data, details={"source": "previous_current_document"}))
        db.add(m.AssistantDraft(conversation_id=conversation.id, type="resume", content=latex, pdf_data=pdf,
            details={"source": "manual_edit", "pages": 1, "one_page": True}))
        job.latex_source, job.pdf_data = latex, pdf
        job.pdf_generated_at = datetime.now(timezone.utc)
        job.revision += 1
        db.flush()
        return {"status": "success", "pdf_updated": True, "revision": job.revision}
    return mutation(f"resume.save:{identifier}", [latex, revision], save)


def export_draft(identifier, format="text"):
    with SessionLocal() as db:
        row = require(db.get(m.AssistantDraft, identifier), "Draft")
        text, kind, pdf = row.content, row.type, row.pdf_data
    if format == "json":
        return json.dumps(draft_get(identifier), ensure_ascii=False, indent=2).encode()
    if format in {"text", "tex"}:
        return text.encode("utf-8")
    if format == "pdf":
        if kind == "cover_letter":
            from cv_tailor.services.career_documents import text_document_pdf
            return pdf or text_document_pdf(text, "Cover letter")
        if kind == "cheat_sheet":
            from cv_tailor.services.career_documents import cheat_sheet_pdf
            return cheat_sheet_pdf(text)
        if kind != "resume":
            raise WorkspaceError("PDF export supports resumes and cheat sheets")
        from cv_tailor.services.pdf_service import compile_latex_to_pdf, pdf_page_count
        pdf = pdf or compile_latex_to_pdf(text)
        if pdf_page_count(pdf) != 1:
            raise WorkspaceError("Resume must fit one page before PDF export", "page_overflow")
        return pdf
    if format == "docx" and kind == "resume":
        from cv_tailor.services.docx_service import convert_latex_to_docx
        return convert_latex_to_docx(text)
    raise WorkspaceError("Unsupported export format for this draft")


def resume_blocks(identifier):
    from cv_tailor.services.career_tools import _summary_span, _bullet_spans
    from cv_tailor.services.docx_service import strip_latex_formatting
    draft = draft_get(identifier)
    if draft["type"] != "resume":
        raise WorkspaceError("Select a resume draft")
    text = draft["content"]
    spans = [("summary", _summary_span(text)), *[(f"bullet:{i+1}", span) for i, span in enumerate(_bullet_spans(text))]]
    sections = list(re.finditer(r"\\section\{([^}]+)\}", text))
    return [{"id": name, "order": index,
             "section": next((match.group(1) for match in reversed(sections) if match.start() < a), "Summary"),
             "text": strip_latex_formatting(text[a:b])} for index, (name, (a, b)) in enumerate(spans)]


def resume_patch(identifier, payload, request_id=None, evidence=None):
    from cv_tailor.services.career_tools import _summary_span, _bullet_spans
    from cv_tailor.services.latex_assembly import _escape_latex
    from cv_tailor.services.pdf_service import compile_latex_to_pdf, pdf_page_count
    patches = schema_for("resume_edit").model_validate(payload)
    draft = draft_get(identifier)
    evidence = evidence or []
    if not isinstance(evidence, list) or not all(isinstance(fact, str) and fact.strip() for fact in evidence):
        raise WorkspaceError("Evidence must be a JSON list of explicit user assertions")
    personal_evidence = list(dict.fromkeys([*draft["metadata"].get("conversation_evidence", []), *evidence]))
    if draft["type"] != "resume":
        raise WorkspaceError("Select a resume draft")
    text = draft["content"]
    spans = dict([("summary", _summary_span(text)), *[(f"bullet:{i+1}", span) for i, span in enumerate(_bullet_spans(text))]])
    if not patches.blocks or len({b.id for b in patches.blocks}) != len(patches.blocks):
        raise WorkspaceError("Supply distinct block IDs from resume blocks")
    selected = {block.id for block in patches.blocks}
    blocks = [block for block in resume_blocks(identifier) if block["id"] in selected]
    if len(blocks) != len(selected) or len(blocks) > 6:
        raise WorkspaceError("Select one to six existing resume blocks")
    orders = [block["order"] for block in blocks]
    if len({block["section"] for block in blocks}) != 1 or orders != list(range(orders[0], orders[0] + len(orders))):
        raise WorkspaceError("A targeted edit must be contiguous within one section")
    edits = []
    for block in patches.blocks:
        if block.id not in spans:
            raise WorkspaceError(f"Unknown block {block.id}")
        validate_numbers(block.text, {"profile": profile_get(), "conversation_evidence": personal_evidence})
        edits.append((*spans[block.id], _escape_latex(block.text)))
    for a, b, replacement in sorted(edits, reverse=True):
        text = text[:a] + replacement + text[b:]
    pdf = compile_latex_to_pdf(text)
    pages = pdf_page_count(pdf)
    def save(db):
        require(db.get(m.AssistantDraft, identifier), "Draft")
        row = m.AssistantDraft(conversation_id=draft["conversation_id"], type="resume", content=text, pdf_data=pdf,
            details={"source": "external_agent", "parent_id": identifier, "pages": pages, "one_page": pages == 1, "conversation_evidence": personal_evidence})
        db.add(row)
        db.flush()
        return draft_dict(row)
    return mutation(f"resume.patch:{identifier}", [payload, evidence], save, request_id)
