# CV Tailor FastAPI AI Service
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from routers import database_routes, generate_routes, auth_routes, tracker_routes, interview_routes, code_routes
import logging
import os
from dotenv import load_dotenv
from database import init_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

load_dotenv()

def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_origins(value: str | None) -> list[str]:
    if not value:
        return ["http://localhost:3000"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if parse_bool(os.getenv("AUTO_CREATE_TABLES")):
        logger.info("AUTO_CREATE_TABLES enabled; creating database tables if needed.")
        init_db()
    yield


app = FastAPI(lifespan=lifespan)

environment = os.getenv("ENVIRONMENT", "development").lower()
is_production = environment == "production"

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "change-this-secret"),
    session_cookie="cv_tailor_session",
    max_age=86400,  # 1 day
    https_only=parse_bool(os.getenv("SESSION_COOKIE_HTTPS_ONLY"), is_production),
    same_site=os.getenv("SESSION_COOKIE_SAMESITE", "none" if is_production else "lax")
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_origins(os.getenv("FRONTEND_ORIGINS")),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(database_routes.router)
app.include_router(generate_routes.router)
app.include_router(tracker_routes.router)
app.include_router(interview_routes.router)
app.include_router(code_routes.router)

@app.get("/")
def root():
    return {"hello": "world"}

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
