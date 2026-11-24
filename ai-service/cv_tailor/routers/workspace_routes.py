from fastapi import APIRouter, Request
from pydantic import BaseModel
from cv_tailor import workspace as w
from cv_tailor.config import data_dir, capabilities

router = APIRouter()


@router.get("/workspace")
@router.get("/workspace/status")
def workspace_status():
    try:
        profile = w.profile_get()
    except w.WorkspaceError:
        profile = None
    return {"name": "Local workspace", "email": (profile or {}).get("email", ""),
            "data_dir": str(data_dir()), "profile_exists": profile is not None, "preferences": w.preferences_get(), "ai": capabilities()}


@router.get("/preferences")
def preferences():
    return w.preferences_get()


@router.patch("/preferences")
def save_preferences(data: dict):
    # Shared validation omits rejected input values from credential-related errors.
    return w.preferences_update(data)


@router.get("/context")
def context(task: str = "resume", application: int | None = None):
    return w.context_export(task, application)


@router.get("/schemas/{kind}")
def schema(kind: str):
    return w.schema_for(kind).model_json_schema()


class DraftImport(BaseModel):
    kind: str
    content: dict
    application: int | None = None
    request_id: str | None = None
    parent: int | None = None
    evidence: list[str] = []


@router.post("/drafts")
def import_draft(data: DraftImport):
    return w.import_draft(data.kind, data.content, data.application, data.request_id, data.parent, data.evidence)


@router.get("/drafts")
def drafts(application: int | None = None):
    return w.drafts_list(application)
