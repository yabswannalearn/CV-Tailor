from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.orm import Session, selectinload
from database import get_db
from dependencies import get_current_user_id
from models import database_models as db_models
from models.schemas import UserProfile
import io
from pypdf import PdfReader
from services.llm_service import extract_profile_from_resume
from services.preset_service import resolve_preset
from limiter import limiter

router = APIRouter(
    prefix="/profile",
    tags=["profile"]
)

PROFILE_LOAD_OPTIONS = (
    selectinload(db_models.Profile.education),
    selectinload(db_models.Profile.experience),
    selectinload(db_models.Profile.projects),
    selectinload(db_models.Profile.skills),
    selectinload(db_models.Profile.certifications),
)


def serialize_profile(profile: db_models.Profile) -> dict:
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "mobile_no": profile.mobile_no,
        "email": profile.email,
        "linkedin": profile.linkedin,
        "github": profile.github,
        "portfolio": profile.portfolio,
        "preset_slug": profile.preset_slug,
        "education": [
            {
                "school_name": item.school_name,
                "course": item.course,
                "location": item.location,
                "description": item.description,
            }
            for item in profile.education
        ],
        "experience": [
            {
                "job_title": item.job_title,
                "company": item.company,
                "location": item.location,
                "description": item.description,
                "date_range": item.date_range,
            }
            for item in profile.experience
        ],
        "projects": [
            {
                "name": item.name,
                "description": item.description,
                "date_range": item.date_range,
            }
            for item in profile.projects
        ],
        "skills": [{"skill_name": item.skill_name} for item in profile.skills],
        "certifications": [
            {
                "name": item.name,
                "issuer": item.issuer,
                "date_issued": item.date_issued,
            }
            for item in profile.certifications
        ],
    }

@router.post("/auto-fill-resume")
@limiter.limit("3/minute")
async def auto_fill_resume(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    
    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user or user.credits <= 0:
        raise HTTPException(status_code=402, detail="Out of credits. Please upgrade to auto-fill resumes.")
        
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
    try:
        content = await file.read()
        reader = PdfReader(io.BytesIO(content))
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
            
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")
            
        profile_data = extract_profile_from_resume(text)
        
        # Deduct credit
        user.credits -= 1
        db.commit()
        
        return {"status": "success", "data": profile_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")

def save_profile_data(db: Session, user_id: int, profile_data: UserProfile) -> None:
    """Replace the user's profile and all nested rows with profile_data, then commit."""
    existing = db.query(db_models.Profile).filter(
        db_models.Profile.user_id == user_id
    ).first()
    if existing:
        db.query(db_models.Education).filter(db_models.Education.profile_id == existing.id).delete()
        db.query(db_models.Experience).filter(db_models.Experience.profile_id == existing.id).delete()
        db.query(db_models.Project).filter(db_models.Project.profile_id == existing.id).delete()
        db.query(db_models.Skill).filter(db_models.Skill.profile_id == existing.id).delete()
        db.query(db_models.Certification).filter(db_models.Certification.profile_id == existing.id).delete()
        db.query(db_models.Profile).filter(db_models.Profile.id == existing.id).delete()
        db.flush()

    new_profile = db_models.Profile(
        user_id=user_id,
        first_name=profile_data.first_name,
        last_name=profile_data.last_name,
        mobile_no=profile_data.mobile_no,
        email=profile_data.email,
        linkedin=profile_data.linkedin,
        github=profile_data.github,
        portfolio=profile_data.portfolio,
        preset_slug=profile_data.preset_slug
    )
    db.add(new_profile)
    db.flush()

    for edu in profile_data.education:
        db.add(db_models.Education(
            profile_id=new_profile.id,
            school_name=edu.school_name,
            course=edu.course,
            location=edu.location,
            description=edu.description
        ))

    for exp in profile_data.experience:
        db.add(db_models.Experience(
            profile_id=new_profile.id,
            job_title=exp.job_title,
            company=exp.company,
            location=exp.location,
            description=exp.description,
            date_range=exp.date_range
        ))

    for proj in profile_data.projects:
        db.add(db_models.Project(
            profile_id=new_profile.id,
            name=proj.name,
            description=proj.description,
            date_range=proj.date_range
        ))

    for skill in profile_data.skills:
        db.add(db_models.Skill(
            profile_id=new_profile.id,
            skill_name=skill.skill_name
        ))

    existing_skills = {s.skill_name.lower() for s in profile_data.skills}
    preset = resolve_preset(db, profile_data.preset_slug)
    if preset and preset.core_skills_bank:
        for p_skill in preset.core_skills_bank:
            if p_skill.lower() not in existing_skills:
                db.add(db_models.Skill(
                    profile_id=new_profile.id,
                    skill_name=p_skill
                ))

    for cert in profile_data.certifications:
        db.add(db_models.Certification(
            profile_id=new_profile.id,
            name=cert.name,
            issuer=cert.issuer,
            date_issued=cert.date_issued
        ))

    db.commit()


@router.post("/save")
@limiter.limit("30/minute")
async def save_profile(profile_data: UserProfile, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    try:
        save_profile_data(db, user_id, profile_data)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Sync Error: {str(e)}")
    return {"status": "success", "message": "Profile saved"}


@router.get("/me")
@limiter.limit("30/minute")
async def load_current_profile(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)

    profile = db.query(db_models.Profile).options(*PROFILE_LOAD_OPTIONS).filter(
        db_models.Profile.user_id == user_id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return serialize_profile(profile)
