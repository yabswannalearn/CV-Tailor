from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user_id
from models import database_models as db_models
from models.schemas import AdminCreditsUpdateRequest

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(request: Request, db: Session = Depends(get_db)) -> db_models.User:
    user_id = get_current_user_id(request)
    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/users")
async def list_users(db: Session = Depends(get_db), _admin: db_models.User = Depends(require_admin)):
    users = db.query(db_models.User).order_by(db_models.User.id).all()

    profiles_by_user = {
        user_id: (first_name, last_name)
        for user_id, first_name, last_name in db.query(
            db_models.Profile.user_id, db_models.Profile.first_name, db_models.Profile.last_name
        ).all()
    }

    status_counts_by_user: dict[int, dict[str, int]] = {}
    for user_id, status, count in (
        db.query(
            db_models.JobApplication.user_id,
            db_models.JobApplication.status,
            func.count(db_models.JobApplication.id),
        )
        .group_by(db_models.JobApplication.user_id, db_models.JobApplication.status)
        .all()
    ):
        status_counts_by_user.setdefault(user_id, {})[status] = count

    result = []
    for user in users:
        first_name, last_name = profiles_by_user.get(user.id, (None, None))
        full_name = f"{first_name or ''} {last_name or ''}".strip()
        by_status = status_counts_by_user.get(user.id, {})
        result.append({
            "id": user.id,
            "email": user.email,
            "name": full_name or user.email,
            "credits": user.credits,
            "is_admin": user.is_admin,
            "tracker": {
                "total": sum(by_status.values()),
                "by_status": by_status,
            },
        })
    return result


@router.patch("/users/{user_id}/credits")
async def update_user_credits(
    user_id: int,
    data: AdminCreditsUpdateRequest,
    db: Session = Depends(get_db),
    _admin: db_models.User = Depends(require_admin),
):
    user = db.query(db_models.User).filter(db_models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.credits = data.credits
    db.commit()
    return {"id": user.id, "credits": user.credits}
