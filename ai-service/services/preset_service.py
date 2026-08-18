from typing import Optional

from sqlalchemy.orm import Session

from models import database_models as db_models


def resolve_preset(db: Session, identifier: Optional[str]) -> Optional[db_models.ResumePreset]:
    """Look up a preset by slug, falling back to a case-insensitive display-name match.

    Returns None for a missing/blank identifier — "blank" is the sentinel the
    frontend sends for "no preset selected", not a real slug.
    """
    if not identifier or identifier == "blank":
        return None
    return db.query(db_models.ResumePreset).filter(
        (db_models.ResumePreset.slug == identifier) |
        (db_models.ResumePreset.display_name.ilike(identifier))
    ).first()
