from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import database_models as db_models
from models.schemas import GenerateRequest, GenerateCoverLetterRequest
from services.llm_service import generate_latex_resume, generate_cover_letter
from services.pdf_service import PDFCompilationError, compile_latex_to_pdf

router = APIRouter(
    prefix="/generate",
    tags=["generate"]
)


class CompileLatexRequest(BaseModel):
    latex: str


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

    try:
        pdf_bytes = compile_latex_to_pdf(latex_code)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=tailored_resume.pdf"}
    )


@router.post("/compile")
async def compile_latex(data: CompileLatexRequest):
    try:
        pdf_bytes = compile_latex_to_pdf(data.latex)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=tailored_resume.pdf"}
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
