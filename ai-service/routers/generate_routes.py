from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import database_models as db_models
from models.schemas import GenerateRequest, GenerateCoverLetterRequest
from services.llm_service import generate_latex_resume, generate_cover_letter
from services.pdf_service import PDFCompilationError, compile_latex_to_pdf
from limiter import limiter
from fastapi import Request

router = APIRouter(
    prefix="/generate",
    tags=["generate"]
)


class CompileLatexRequest(BaseModel):
    latex: str


@router.post("/cv")
@limiter.limit("3/minute")
async def generate_cv(data: GenerateRequest, request: Request, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(
        db_models.Profile.email == data.email
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user = profile.owner
    if user.credits <= 0:
        raise HTTPException(status_code=402, detail="Out of credits. Please upgrade to generate more CVs.")

    latex_code = generate_latex_resume(profile, data.jd)
    
    # Deduct credit
    user.credits -= 1
    db.commit()
    
    return {"latex": latex_code}

@router.post("/pdf")
@limiter.limit("3/minute")
async def generate_pdf(data: GenerateRequest, request: Request, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(
        db_models.Profile.email == data.email
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user = profile.owner
    if user.credits <= 0:
        raise HTTPException(status_code=402, detail="Out of credits. Please upgrade to generate more PDFs.")

    latex_code = generate_latex_resume(profile, data.jd)

    try:
        pdf_bytes = compile_latex_to_pdf(latex_code)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Deduct credit
    user.credits -= 1
    db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=tailored_resume.pdf"}
    )


@router.post("/compile")
@limiter.limit("10/minute")
async def compile_latex(data: CompileLatexRequest, request: Request):
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
@limiter.limit("3/minute")
async def generate_cl(data: GenerateCoverLetterRequest, request: Request, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(
        db_models.Profile.email == data.email
    ).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user = profile.owner
    if user.credits <= 0:
        raise HTTPException(status_code=402, detail="Out of credits. Please upgrade to generate more cover letters.")

    cover_letter_content = generate_cover_letter(profile, data.jd, data.company_name)
    
    # Deduct credit
    user.credits -= 1
    db.commit()
    
    return {"cover_letter": cover_letter_content}
