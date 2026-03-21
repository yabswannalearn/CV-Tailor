from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import database_models as db_models
from models.schemas import JobApplicationCreate, JobApplicationUpdate, JobApplicationResponse

router = APIRouter(
    prefix="/tracker",
    tags=["tracker"]
)

def get_current_user_id(request: Request) -> int:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id

@router.get("/", response_model=List[JobApplicationResponse])
async def get_all_jobs(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    jobs = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.user_id == user_id
    ).order_by(db_models.JobApplication.created_at.desc()).all()
    return jobs

@router.post("/", response_model=JobApplicationResponse)
async def create_job(data: JobApplicationCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    job = db_models.JobApplication(user_id=user_id, **data.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

@router.patch("/{job_id}", response_model=JobApplicationResponse)
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
    return job

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
    return {"status": "success", "message": "Job deleted"}

@router.get("/stats")
async def get_stats(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    jobs = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.user_id == user_id
    ).all()
    stats = {}
    for job in jobs:
        stats[job.status] = stats.get(job.status, 0) + 1
    return {
        "total": len(jobs),
        "by_status": stats
    }