from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime
from database import get_db
from models import database_models as db_models
from models.schemas import JobApplicationCreate, JobApplicationUpdate
import requests as http_requests

router = APIRouter(prefix="/tracker", tags=["tracker"])

def get_current_user_id(request: Request) -> int:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id

def serialize_job(job: db_models.JobApplication) -> dict:
    return {
        "id": job.id,
        "company_name": job.company_name,
        "job_title": job.job_title,
        "job_url": job.job_url,
        "short_description": job.short_description,
        "job_description": job.job_description,
        "has_pdf": job.pdf_data is not None,
        "pdf_generated_at": job.pdf_generated_at.isoformat() if job.pdf_generated_at else None,
        "status": job.status,
        "date_applied": job.date_applied.isoformat() if job.date_applied else None,
        "follow_up_date": job.follow_up_date.isoformat() if job.follow_up_date else None,
        "job_type": job.job_type,
        "location": job.location,
        "salary_range": job.salary_range,
        "priority": job.priority,
        "notes": job.notes,
    }

@router.get("/")
async def get_all_jobs(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    jobs = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.user_id == user_id
    ).order_by(db_models.JobApplication.created_at.desc()).all()
    return [serialize_job(j) for j in jobs]

@router.post("/")
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
    jobs = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.user_id == user_id
    ).all()
    stats = {}
    for job in jobs:
        stats[job.status] = stats.get(job.status, 0) + 1
    return {"total": len(jobs), "by_status": stats}

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
    ).filter(db_models.Profile.email == user.email).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found — fill in your profile first")

    # 1. Generate LaTeX
    latex_code = generate_latex_resume(profile, job.job_description)

    # 2. Compile PDF via Go service
    go_response = http_requests.post(
        "http://localhost:8081/generate",
        json={"latex": latex_code},
        timeout=120
    )
    if not go_response.ok:
        raise HTTPException(status_code=500, detail="PDF compilation failed")

    # 3. Save both LaTeX and PDF to DB
    job.latex_source = latex_code
    job.pdf_data = go_response.content
    job.pdf_generated_at = datetime.utcnow()
    db.commit()

    return {"status": "success", "message": "PDF generated and saved"}

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