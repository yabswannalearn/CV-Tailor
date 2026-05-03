# CV Tailor FastAPI AI Service
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from routers import database_routes, generate_routes, auth_routes, tracker_routes, interview_routes, code_routes
import logging
import os
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "change-this-secret"),
    session_cookie="cv_tailor_session",
    max_age=86400,  # 1 day
    https_only=False,  # set True in production
    same_site="lax"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)