import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from database import DATABASE_URL, init_db


def masked_database_url() -> str:
    if "@" not in DATABASE_URL:
        return DATABASE_URL
    scheme_and_auth, host_and_db = DATABASE_URL.rsplit("@", 1)
    scheme = scheme_and_auth.split("://", 1)[0]
    return f"{scheme}://***:***@{host_and_db}"


if __name__ == "__main__":
    print(f"Creating tables on {masked_database_url()}")
    init_db()
    print("Database tables are ready.")
