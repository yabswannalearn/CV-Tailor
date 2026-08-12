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

def positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=positive_int_env("DB_POOL_RECYCLE_SECONDS", 1800),
    pool_timeout=positive_int_env("DB_POOL_TIMEOUT_SECONDS", 5),
    connect_args={
        "connect_timeout": positive_int_env("DB_CONNECT_TIMEOUT_SECONDS", 5),
        "application_name": "cv_tailor",
    },
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
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_expires_at TIMESTAMPTZ",
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_template VARCHAR(50) DEFAULT 'classic'",
            "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preset_slug VARCHAR(50) DEFAULT 'blank'",
            "ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS template_id VARCHAR(50) NOT NULL DEFAULT 'classic'",
            "ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS match_score INTEGER",
            "ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS match_analysis JSON",
            "CREATE INDEX IF NOT EXISTS ix_education_profile_id ON education (profile_id)",
            "CREATE INDEX IF NOT EXISTS ix_experience_profile_id ON experience (profile_id)",
            "CREATE INDEX IF NOT EXISTS ix_projects_profile_id ON projects (profile_id)",
            "CREATE INDEX IF NOT EXISTS ix_skills_profile_id ON skills (profile_id)",
            "CREATE INDEX IF NOT EXISTS ix_certifications_profile_id ON certifications (profile_id)",
            "CREATE INDEX IF NOT EXISTS ix_job_applications_user_created ON job_applications (user_id, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_job_applications_user_status ON job_applications (user_id, status)",
        ):
            conn.execute(text(statement))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
