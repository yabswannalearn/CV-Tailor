from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from database import get_db
import models.database_models as db_models
import models.schemas as schemas

router = APIRouter(prefix="/presets", tags=["presets"])

@router.get("", response_model=list[schemas.PresetListItem])
async def list_presets(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    rows = db.query(db_models.ResumePreset).order_by(db_models.ResumePreset.id).all()
    return [{"slug": r.slug, "display_name": r.display_name, "recommended_template": r.recommended_template} for r in rows]

@router.get("/{slug}", response_model=schemas.PresetDetail)
async def get_preset(slug: str, db: Session = Depends(get_db)):
    row = db.query(db_models.ResumePreset).filter(db_models.ResumePreset.slug == slug).first()
    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {
        "slug": row.slug, "display_name": row.display_name,
        "target_summary_prompt": row.target_summary_prompt,
        "core_skills_bank": row.core_skills_bank,
        "metric_prompts": row.metric_prompts,
        "section_order": row.section_order,
        "recommended_template": row.recommended_template,
        "lever_guidance": row.lever_guidance,
    }
