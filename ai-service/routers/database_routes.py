from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import database_models as db_models
from models.schemas import UserProfile

router = APIRouter(
    prefix="/profile",
    tags=["profile"]
)

@router.post("/save")
async def save_profile(profile_data: UserProfile, request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        db.query(db_models.Profile).filter(
            db_models.Profile.user_id == user_id
        ).delete()

        new_profile = db_models.Profile(
            user_id=user_id,
            first_name=profile_data.first_name,
            last_name=profile_data.last_name,
            mobile_no=profile_data.mobile_no,
            email=profile_data.email,
            linkedin=profile_data.linkedin,
            github=profile_data.github,
            portfolio=profile_data.portfolio
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
                job_title=exp.name,
                company=exp.company,
                location=exp.location,
                description=exp.description,
                date_range=exp.date
            ))

        for proj in profile_data.projects:
            db.add(db_models.Project(
                profile_id=new_profile.id,
                name=proj.name,
                description=proj.description,
                date_range=proj.date
            ))

        for skill_name in profile_data.skills:
            db.add(db_models.Skill(
                profile_id=new_profile.id,
                skill_name=skill_name
            ))

        for cert in profile_data.certifications:
            db.add(db_models.Certification(
                profile_id=new_profile.id,
                name=cert.name,
                issuer=cert.issuer,
                date_issued=cert.date_issued
            ))

        db.commit()
        return {"status": "success", "message": "Profile saved"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Sync Error: {str(e)}")


@router.get("/load/{email}")
async def load_profile(email: str, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).options(
        joinedload(db_models.Profile.education),
        joinedload(db_models.Profile.experience),
        joinedload(db_models.Profile.projects),
        joinedload(db_models.Profile.skills),
        joinedload(db_models.Profile.certifications),
    ).filter(db_models.Profile.email == email).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

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
        "education": [
            {
                "school_name": e.school_name,
                "course": e.course,
                "location": e.location,
                "description": e.description  # add this
            } for e in profile.education
        ],
        "experience": [
            {
                "job_title": e.job_title,
                "company": e.company,
                "location": e.location,
                "description": e.description,
                "date_range": e.date_range
            } for e in profile.experience
        ],
        "projects": [
            {
                "name": p.name,
                "description": p.description,
                "date_range": p.date_range
            } for p in profile.projects
        ],
        "skills": [
            {"skill_name": s.skill_name} for s in profile.skills
        ],
        "certifications": [
            {
                "name": c.name,
                "issuer": c.issuer,
                "date_issued": c.date_issued
            } for c in profile.certifications
        ],
    }