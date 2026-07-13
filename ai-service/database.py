from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:reinael123@localhost:5432/cv_tailor")

def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    host = parsed.hostname or ""

    if "supabase.co" in host and "sslmode" not in query:
        query["sslmode"] = "require"

    return urlunsplit(parsed._replace(query=urlencode(query)))

DATABASE_URL = normalize_database_url(DATABASE_URL)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db():
    from models import database_models

    Base.metadata.create_all(bind=engine)
    # create_all() does not alter tables that already exist. Keep this
    # compatibility migration here so deployments with AUTO_CREATE_TABLES
    # can safely pick up newly-added required columns.
    with engine.begin() as conn:
        for statement in (
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 5",
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_template VARCHAR(50) DEFAULT 'classic'",
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preset_slug VARCHAR(50) DEFAULT 'blank'",
            "ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS template_id VARCHAR(50) NOT NULL DEFAULT 'classic'",
        ):
            conn.execute(text(statement))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
