from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import database_models as db_models
from models.schemas import RegisterRequest, LoginRequest
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

ph = PasswordHasher()

@router.post("/register")
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(db_models.User).filter(
        db_models.User.email == data.email
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = ph.hash(data.password)
    user = db_models.User(email=data.email, hashed_password=hashed_pw)
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
        raise HTTPException(status_code=404, detail="User not found")

    if not user.hashed_password:
        # Legacy account migration: Set the password to whatever they just typed
        user.hashed_password = ph.hash(data.password)
        db.commit()
        db.refresh(user)
    else:
        try:
            ph.verify(user.hashed_password, data.password)
            if ph.check_needs_rehash(user.hashed_password):
                user.hashed_password = ph.hash(data.password)
                db.commit()
        except VerifyMismatchError:
            raise HTTPException(status_code=401, detail="Invalid password")

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