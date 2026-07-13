import asyncio

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import database_models as db_models
from models.schemas import GenerateRequest, GenerateCoverLetterRequest
from services.llm_service import generate_latex_resume, generate_cover_letter
from services.pdf_service import PDFCompilationError, compile_latex_to_pdf, pdf_page_count
from limiter import limiter
from fastapi import Request

router = APIRouter(
    prefix="/generate",
    tags=["generate"]
)


def require_one_page(pdf_bytes: bytes) -> None:
    pages = pdf_page_count(pdf_bytes)
    if pages != 1:
        raise HTTPException(
            status_code=422,
            detail=f"Generated resume must be exactly one page; the current output is {pages} pages.",
        )

@router.get("/templates")
async def get_templates():
    return [
        {
            "id": "classic",
            "name": "Classic Professional",
            "description": "A traditional, single-column layout perfect for corporate and finance roles."
        },
        {
            "id": "modern",
            "name": "Modern Tech",
            "description": "A sleek, contemporary layout with subtle color accents and clean typography."
        }
    ]


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

    latex_code = generate_latex_resume(profile, data.jd, data.template_id, preset_slug=data.preset_slug, db=db)
    
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

    latex_code = generate_latex_resume(profile, data.jd, data.template_id, preset_slug=data.preset_slug, db=db)

    try:
        pdf_bytes = await asyncio.to_thread(compile_latex_to_pdf, latex_code)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    require_one_page(pdf_bytes)

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
        pdf_bytes = await asyncio.to_thread(compile_latex_to_pdf, data.latex)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    require_one_page(pdf_bytes)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=tailored_resume.pdf"}
    )

@router.post("/compile-with-check")
@limiter.limit("10/minute")
async def compile_latex_with_check(data: CompileLatexRequest, request: Request):
    try:
        pdf_bytes = await asyncio.to_thread(compile_latex_to_pdf, data.latex)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    require_one_page(pdf_bytes)

    from services.ats_check import ats_check
    import base64
    ats_result = await asyncio.to_thread(ats_check, pdf_bytes, None)
    
    return {
        "pdf_b64": base64.b64encode(pdf_bytes).decode("utf-8"),
        "ats": ats_result
    }

@router.post("/ats-check")
@limiter.limit("5/minute")
async def generate_ats_check(data: GenerateRequest, request: Request, db: Session = Depends(get_db)):
    profile = db.query(db_models.Profile).filter(db_models.Profile.email == data.email).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    user = profile.owner
    if user.credits <= 0:
        raise HTTPException(status_code=402, detail="Out of credits. Please upgrade to generate more CVs.")
        
    latex_code = generate_latex_resume(profile, data.jd, data.template_id, data.preset_slug, db)
    
    try:
        pdf_bytes = await asyncio.to_thread(compile_latex_to_pdf, latex_code)
    except PDFCompilationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    require_one_page(pdf_bytes)
        
    preset_section_order = None
    if data.preset_slug and data.preset_slug != "blank":
        preset = db.query(db_models.ResumePreset).filter(
            (db_models.ResumePreset.slug == data.preset_slug) |
            (db_models.ResumePreset.display_name.ilike(data.preset_slug))
        ).first()
        if preset:
            preset_section_order = preset.section_order
            
    from services.ats_check import ats_check
    import base64
    ats_result = await asyncio.to_thread(ats_check, pdf_bytes, preset_section_order)
    
    # Deduct credit
    user.credits -= 1
    db.commit()
    
    return {
        "latex": latex_code,
        "pdf_b64": base64.b64encode(pdf_bytes).decode("utf-8"),
        "ats": ats_result
    }


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
