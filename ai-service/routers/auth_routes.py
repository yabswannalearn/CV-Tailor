from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import database_models as db_models
from models.schemas import RegisterRequest, LoginRequest

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

@router.post("/register")
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(db_models.User).filter(
        db_models.User.email == data.email
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = db_models.User(email=data.email)
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"status": "success", "user_id": user.id, "email": user.email}

@router.post("/login")
async def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(db_models.User).filter(
        db_models.User.email == data.email
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found — register first")

    request.session["user_id"] = user.id
    request.session["email"] = user.email

    return {"status": "success", "user_id": user.id, "email": user.email}

@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "success", "message": "Logged out"}

@router.get("/me")
async def me(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user_id": user_id, "email": request.session.get("email")}