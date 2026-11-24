"""SQLite configuration; importing this module never opens a database."""
from contextvars import ContextVar
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from cv_tailor.config import configure, data_dir

configure()
DATABASE_URL = "sqlite:///" + (data_dir() / "cv-tailor.sqlite3").as_posix()
request_path = ContextVar("request_path", default="cli")
Base = declarative_base()


def make_engine(url):
    result = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})
    @event.listens_for(result, "connect")
    def setup(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=15000")
    return result


engine = make_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db():
    data_dir().mkdir(parents=True, exist_ok=True)
    from cv_tailor.schema_changes import apply_schema_changes
    apply_schema_changes(engine)


def get_db():
    with SessionLocal() as db:
        yield db


def set_request_path(path):
    return request_path.set(path)


def reset_request_path(token):
    request_path.reset(token)
