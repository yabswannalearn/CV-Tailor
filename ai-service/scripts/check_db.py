import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from sqlalchemy import text

from database import SessionLocal


if __name__ == "__main__":
    with SessionLocal() as db:
        result = db.execute(text("select 1")).scalar_one()
    print(f"Database connection ok: {result}")
