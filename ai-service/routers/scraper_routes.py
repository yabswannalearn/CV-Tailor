from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from pydantic import BaseModel

from database import get_db
from models import database_models as db_models
from services.job_scraper_service import fetch_remote_jobs, SOURCE_REGISTRY

router = APIRouter(prefix="/scraper", tags=["scraper"])

def get_current_user_id(request: Request) -> int:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id

class ImportJobRequest(BaseModel):
    company_name: str
    job_title: str
    job_url: Optional[str] = ""
    job_description: Optional[str] = ""
    short_description: Optional[str] = ""
    location: Optional[str] = "Remote"
    salary_range: Optional[str] = ""
    job_type: Optional[str] = "Full-Time"
    match_score: Optional[int] = None
    match_analysis: Optional[Dict[str, Any]] = None

@router.get("/discover")
async def discover_jobs(
    keyword: Optional[str] = None,
    preset_slug: Optional[str] = None,
    sources: Optional[str] = None,
    job_types: Optional[str] = None,
    request: Request = None,
):
    get_current_user_id(request)

    active_preset = preset_slug.strip() if preset_slug and preset_slug.strip() else ""
    search_keyword = keyword.strip() if keyword and keyword.strip() else active_preset.replace("-", " ")
    if not search_keyword or search_keyword == "blank":
        search_keyword = "remote developer"

    source_list = (
        [s.strip() for s in sources.split(",") if s.strip()]
        if sources is not None
        else list(SOURCE_REGISTRY.keys())
    )
    type_list = [t.strip() for t in job_types.split(",") if t.strip()] if job_types else []

    raw_jobs, source_status = await fetch_remote_jobs(
        query=search_keyword,
        sources=source_list,
        job_types=type_list,
        limit=12
    )

    return {
        "search_keyword": search_keyword,
        "active_preset": active_preset,
        "source_status": source_status,
        "total": len(raw_jobs),
        "jobs": raw_jobs
    }

@router.post("/import")
async def import_scraped_job(payload: ImportJobRequest, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    
    new_job = db_models.JobApplication(
        user_id=user_id,
        company_name=payload.company_name,
        job_title=payload.job_title,
        job_url=payload.job_url,
        job_description=payload.job_description,
        short_description=payload.short_description or (payload.job_description[:200] if payload.job_description else ""),
        location=payload.location or "Remote",
        salary_range=payload.salary_range or "",
        job_type=payload.job_type or "Full-Time",
        status="Saved",
        priority="Medium",
        match_score=payload.match_score,
        match_analysis=payload.match_analysis
    )
    
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    
    return {
        "status": "success",
        "job_id": new_job.id,
        "message": "Job imported into tracker successfully"
    }
