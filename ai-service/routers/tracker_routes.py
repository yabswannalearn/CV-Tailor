import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime
from database import get_db
from models import database_models as db_models
from models.schemas import JobApplicationCreate, JobApplicationUpdate
from pydantic import BaseModel as PydanticBaseModel
from services.pdf_service import PDFCompilationError, compile_latex_to_pdf

router = APIRouter(prefix="/tracker", tags=["tracker"])

def get_current_user_id(request: Request) -> int:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id

def serialize_job(job: db_models.JobApplication, include_details: bool = True) -> dict:
    data = {
        "id": job.id,
        "company_name": job.company_name,
        "job_title": job.job_title,
        "job_url": job.job_url,
        "short_description": job.short_description,
        "has_pdf": job.pdf_data is not None,
        "pdf_generated_at": job.pdf_generated_at.isoformat() if job.pdf_generated_at else None,
        "status": job.status,
        "date_applied": job.date_applied.isoformat() if job.date_applied else None,
        "follow_up_date": job.follow_up_date.isoformat() if job.follow_up_date else None,
        "job_type": job.job_type,
        "location": job.location,
        "salary_range": job.salary_range,
        "priority": job.priority,
        "template_id": job.template_id or "classic",
    }
    if include_details:
        data.update({
            "job_description": job.job_description,
            "notes": job.notes,
            "cover_letter": job.cover_letter,
        })
    return data

@router.get("")
async def get_all_jobs(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    jobs = db.query(
        db_models.JobApplication.id,
        db_models.JobApplication.company_name,
        db_models.JobApplication.job_title,
        db_models.JobApplication.job_url,
        db_models.JobApplication.short_description,
        db_models.JobApplication.pdf_data.isnot(None).label("has_pdf"),
        db_models.JobApplication.pdf_generated_at,
        db_models.JobApplication.status,
        db_models.JobApplication.date_applied,
        db_models.JobApplication.follow_up_date,
        db_models.JobApplication.job_type,
        db_models.JobApplication.location,
        db_models.JobApplication.salary_range,
        db_models.JobApplication.priority,
        db_models.JobApplication.template_id,
    ).filter(
        db_models.JobApplication.user_id == user_id
    ).order_by(db_models.JobApplication.created_at.desc()).all()
    return [{
        "id": j.id,
        "company_name": j.company_name,
        "job_title": j.job_title,
        "job_url": j.job_url,
        "short_description": j.short_description,
        "has_pdf": j.has_pdf,
        "pdf_generated_at": j.pdf_generated_at.isoformat() if j.pdf_generated_at else None,
        "status": j.status,
        "date_applied": j.date_applied.isoformat() if j.date_applied else None,
        "follow_up_date": j.follow_up_date.isoformat() if j.follow_up_date else None,
        "job_type": j.job_type,
        "location": j.location,
        "salary_range": j.salary_range,
        "priority": j.priority,
        "template_id": j.template_id or "classic",
    } for j in jobs]

@router.post("")
async def create_job(data: JobApplicationCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = db_models.JobApplication(user_id=user_id, **data.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)
    return serialize_job(job)

@router.patch("/{job_id}")
async def update_job(job_id: int, data: JobApplicationUpdate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return serialize_job(job)

@router.delete("/{job_id}")
async def delete_job(job_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
    return {"status": "success"}

@router.get("/stats")
async def get_stats(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    rows = db.query(
        db_models.JobApplication.status,
        func.count(db_models.JobApplication.id),
    ).filter(
        db_models.JobApplication.user_id == user_id
    ).group_by(db_models.JobApplication.status).all()
    stats = {status: count for status, count in rows}
    return {"total": sum(stats.values()), "by_status": stats}


@router.get("/{job_id}/details")
async def get_job_details(job_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job, include_details=True)

# ── PDF + LaTeX endpoints ─────────────────────────────────────────

@router.post("/{job_id}/generate-pdf")
async def generate_pdf_for_job(job_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)

    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.job_description:
        raise HTTPException(status_code=400, detail="No job description found for this job")

    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from services.llm_service import generate_latex_resume

    profile = db.query(db_models.Profile).options(
        joinedload(db_models.Profile.education),
        joinedload(db_models.Profile.experience),
        joinedload(db_models.Profile.projects),
        joinedload(db_models.Profile.skills),
        joinedload(db_models.Profile.certifications),
    ).filter(db_models.Profile.user_id == user.id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found — fill in your profile first")

    # 1. Generate LaTeX
    latex_code = generate_latex_resume(profile, job.job_description, template_id=job.template_id or "classic", db=db)

    # 2. Compile PDF with the Python-managed Tectonic binary
    try:
        pdf_bytes = await asyncio.to_thread(compile_latex_to_pdf, latex_code)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # 3. Save both LaTeX and PDF to DB
    job.latex_source = latex_code
    job.pdf_data = pdf_bytes
    job.pdf_generated_at = datetime.utcnow()
    db.commit()

    return {"status": "success", "message": "PDF generated and saved"}

@router.post("/{job_id}/generate-cover-letter")
async def generate_cover_letter_for_job(job_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)

    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.job_description:
        raise HTTPException(status_code=400, detail="No job description found for this job")

    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from services.llm_service import generate_cover_letter

    profile = db.query(db_models.Profile).options(
        joinedload(db_models.Profile.education),
        joinedload(db_models.Profile.experience),
        joinedload(db_models.Profile.projects),
        joinedload(db_models.Profile.skills),
        joinedload(db_models.Profile.certifications),
    ).filter(db_models.Profile.user_id == user.id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found — fill in your profile first")

    # Generate cover letter
    cover_letter_content = generate_cover_letter(profile, job.job_description, job.company_name)

    # Save to DB
    job.cover_letter = cover_letter_content
    db.commit()

    return {"status": "success", "cover_letter": cover_letter_content}

@router.get("/{job_id}/pdf")
async def get_pdf(job_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id
    ).first()
    if not job or not job.pdf_data:
        raise HTTPException(status_code=404, detail="No PDF found for this job")
    return Response(
        content=job.pdf_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={job.company_name}_resume.pdf"}
    )

@router.get("/{job_id}/latex")
async def get_latex(job_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.latex_source:
        raise HTTPException(status_code=404, detail="No CV generated for this job yet")
    return {"latex": job.latex_source}

class SaveLatexRequest(PydanticBaseModel):
    latex: str

@router.patch("/{job_id}/latex")
async def save_latex(job_id: int, data: SaveLatexRequest, request: Request, db: Session = Depends(get_db)):
    """Save edited LaTeX back to DB and recompile PDF."""
    user_id = get_current_user_id(request)
    job = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.id == job_id,
        db_models.JobApplication.user_id == user_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Save new LaTeX
    job.latex_source = data.latex

    # Recompile PDF from new LaTeX
    pdf_updated = False
    compilation_error = None
    try:
        job.pdf_data = await asyncio.to_thread(compile_latex_to_pdf, data.latex)
        job.pdf_generated_at = datetime.utcnow()
        pdf_updated = True
    except PDFCompilationError as exc:
        compilation_error = str(exc)

    db.commit()
    response = {"status": "success", "pdf_updated": pdf_updated}
    if compilation_error:
        response["error"] = compilation_error
    return response

class FetchJobRequest(PydanticBaseModel):
    url: str

@router.post("/fetch-job-details")
def fetch_job_details(data: FetchJobRequest, request: Request):
    user_id = get_current_user_id(request)
    
    from scrapling import Fetcher
    from services.llm_service import extract_job_details
    import urllib.parse

    try:
        url_to_fetch = data.url
        # Normalize LinkedIn 'collections/easy-apply' URLs to public 'jobs/view' URLs to bypass the forced login wall
        if "linkedin.com" in url_to_fetch and "currentJobId=" in url_to_fetch:
            parsed_url = urllib.parse.urlparse(url_to_fetch)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            if "currentJobId" in query_params:
                job_id = query_params["currentJobId"][0]
                url_to_fetch = f"https://www.linkedin.com/jobs/view/{job_id}/"
                print(f"Normalized LinkedIn URL to bypass login: {url_to_fetch}")

        # 1. Fetch page using scrapling (bypasses anti-bot)
        fetcher = Fetcher(headless=True)
        response = fetcher.get(url_to_fetch)
        
        html_content = response.body.decode('utf-8', errors='ignore')
        
        # 2. Extract using LLM
        details = extract_job_details(html_content)
        
        return {
            "status": "success",
            "data": details
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch or parse job: {str(e)}")


