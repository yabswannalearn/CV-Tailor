from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
import requests
from database import get_db
from models import database_models as db_models
from models.schemas import GenerateRequest, GenerateCoverLetterRequest
from services.llm_service import generate_latex_resume, generate_cover_letter

router = APIRouter(
    prefix="/generate",
    tags=["generate"]
)

@router.post("/cv")
async def generate_cv(data: GenerateRequest, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(
        db_models.Profile.email == data.email
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    latex_code = generate_latex_resume(profile, data.jd)
    return {"latex": latex_code}

@router.post("/pdf")
async def generate_pdf(data: GenerateRequest, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(
        db_models.Profile.email == data.email
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    latex_code = generate_latex_resume(profile, data.jd)

    go_response = requests.post(
        "http://localhost:8081/compile",
        json={"latex": latex_code}
    )

    return Response(
        content=go_response.content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=tailored_resume.pdf"}
    )

@router.post("/cover-letter")
async def generate_cl(data: GenerateCoverLetterRequest, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(
        db_models.Profile.email == data.email
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    cover_letter_content = generate_cover_letter(profile, data.jd, data.company_name)
    return {"cover_letter": cover_letter_content}