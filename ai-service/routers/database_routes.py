from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
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
                location=edu.location
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

        db.commit()
        return {"status": "success", "message": "Profile saved"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Sync Error: {str(e)}")
    

@router.get("/load/{email}")
async def load_profile(email: str, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(db_models.Profile.email == email).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile