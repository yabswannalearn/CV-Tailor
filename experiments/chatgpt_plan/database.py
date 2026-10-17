"""Local experiment persistence; independent of the legacy PostgreSQL backend."""

import argparse
import json
import os
import re
import sqlite3
from contextlib import closing, contextmanager
from datetime import date, datetime, timezone
from pathlib import Path

from .crm_models import FreelancerProfile
from .intake import ImportValidationError, export_records, validate_posting


SCHEMA_VERSION = 3
POSTED_DATE_SQL = "normalized_posted_date(json_extract(source_json, '$.datePosted'))"


def normalized_posted_date(value):
    """Use only valid source calendar dates; never substitute collection time."""
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def default_database_path():
    configured = os.environ.get("CVTAILOR_EXPERIMENT_DB")
    if configured:
        return Path(configured).expanduser().resolve()
    root = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".local" / "share")
    return root / "CVTailor" / "local-crm-experiment" / "crm.sqlite3"


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


class DraftConflict(ValueError):
    """A newer local edit must be loaded before overwriting it."""


class ExperimentDatabase:
    def __init__(self, path=None):
        self.path = Path(path or default_database_path()).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()
        if os.name != "nt":
            self.path.chmod(0o600)

    @contextmanager
    def connection(self):
        # Each operation owns a connection. No connection spans an AI request.
        with closing(sqlite3.connect(self.path, timeout=5)) as connection:
            connection.row_factory = sqlite3.Row
            connection.create_function("normalized_posted_date", 1, normalized_posted_date, deterministic=True)
            connection.execute("PRAGMA foreign_keys = ON")
            with connection:
                yield connection

    def initialize(self):
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError("This database uses a newer schema. Use the matching app version.")
            if version == 0:
                connection.execute("""
                    CREATE TABLE opportunities (
                        id INTEGER PRIMARY KEY,
                        source TEXT NOT NULL,
                        source_url TEXT NOT NULL,
                        title TEXT NOT NULL,
                        employer TEXT,
                        source_json TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        UNIQUE(source, source_url)
                    )
                """)
                connection.execute("""
                    CREATE TABLE qualification_runs (
                        id INTEGER PRIMARY KEY,
                        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
                        model TEXT NOT NULL,
                        context_json TEXT NOT NULL,
                        result_json TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )
                """)
                connection.execute("CREATE INDEX qualification_runs_opportunity ON qualification_runs(opportunity_id)")
                connection.execute("PRAGMA user_version = 1")
                version = 1
            if version == 1:
                connection.execute("ALTER TABLE opportunities ADD COLUMN source_key TEXT")
                connection.execute("ALTER TABLE opportunities ADD COLUMN stage TEXT NOT NULL DEFAULT 'inbox' CHECK(stage IN ('inbox','shortlisted','skipped'))")
                connection.execute("ALTER TABLE opportunities ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
                connection.execute("ALTER TABLE opportunities ADD COLUMN last_seen_at TEXT")
                connection.execute("UPDATE opportunities SET source_key=source_url, last_seen_at=created_at")
                connection.execute("CREATE UNIQUE INDEX opportunities_source_key ON opportunities(source, source_key)")
                connection.execute("CREATE INDEX opportunities_source_stage ON opportunities(source, stage, id)")
                connection.execute("CREATE TABLE local_profile(id INTEGER PRIMARY KEY CHECK(id=1), data_json TEXT NOT NULL, updated_at TEXT NOT NULL)")
                connection.execute("PRAGMA user_version = 2")
                version = 2
            if version == 2:
                connection.execute("""
                    CREATE TABLE application_drafts (
                        id INTEGER PRIMARY KEY,
                        opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
                        model TEXT NOT NULL,
                        kind TEXT NOT NULL CHECK(kind IN ('cover_letter','proposal')),
                        context_json TEXT NOT NULL,
                        result_json TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        body TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        revision INTEGER NOT NULL DEFAULT 0,
                        reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0,1))
                    )
                """)
                connection.execute("CREATE INDEX application_drafts_opportunity ON application_drafts(opportunity_id,id)")
                connection.execute("PRAGMA user_version = 3")

    def save_assessment(self, context, result, *, opportunity_id=None):
        """Save a completed validated result and its exact input in one transaction."""
        opportunity = context["opportunity"]
        context_json, result_json = encode(context), encode(result)
        saved_at = timestamp()
        with self.connection() as connection:
            if opportunity_id is not None:
                existing = connection.execute("SELECT id FROM opportunities WHERE id=? AND source='onlinejobs'", (opportunity_id,)).fetchone()
                if existing is None:
                    raise ValueError("The selected opportunity does not exist.")
            else:
                connection.execute("""
                INSERT INTO opportunities(source, source_url, title, employer, source_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source, source_url) DO UPDATE SET
                    title=excluded.title, employer=excluded.employer,
                    source_json=excluded.source_json, updated_at=excluded.updated_at
                """, ("synthetic", opportunity["jobUrl"], opportunity["jobTitle"],
                  opportunity.get("employerName"), encode(opportunity), saved_at, saved_at))
                opportunity_id = connection.execute(
                    "SELECT id FROM opportunities WHERE source=? AND source_url=?",
                    ("synthetic", opportunity["jobUrl"])).fetchone()[0]
            run_id = connection.execute("""
                INSERT INTO qualification_runs(opportunity_id, model, context_json, result_json, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (opportunity_id, result["model"], context_json, result_json, saved_at)).lastrowid
        return {**result, "context": context, "storage": {
            "run_id": run_id, "opportunity_id": opportunity_id, "saved_at": saved_at}}

    def latest_assessment(self, opportunity_id=None, *, source=None):
        with self.connection() as connection:
            if opportunity_id is not None:
                row = connection.execute("SELECT * FROM qualification_runs WHERE opportunity_id=? ORDER BY id DESC LIMIT 1", (opportunity_id,)).fetchone()
            elif source is not None:
                row = connection.execute("SELECT q.* FROM qualification_runs q JOIN opportunities o ON o.id=q.opportunity_id WHERE o.source=? ORDER BY q.id DESC LIMIT 1", (source,)).fetchone()
            else:
                row = connection.execute("SELECT * FROM qualification_runs ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return None
        return {**json.loads(row["result_json"]), "context": json.loads(row["context_json"]),
                "storage": {"run_id": row["id"], "opportunity_id": row["opportunity_id"],
                            "saved_at": row["created_at"]}}

    def status(self):
        with self.connection() as connection:
            return {"engine": "SQLite", "path": str(self.path), "schema_version": SCHEMA_VERSION,
                    "opportunities": connection.execute("SELECT COUNT(*) FROM opportunities").fetchone()[0],
                    "assessments": connection.execute("SELECT COUNT(*) FROM qualification_runs").fetchone()[0],
                    "drafts": connection.execute("SELECT COUNT(*) FROM application_drafts").fetchone()[0]}

    def import_jobs(self, value, *, preserve_details=False):
        records = export_records(value)
        report = {"total": len(records), "imported": 0, "updated": 0, "skipped": 0, "failed": 0, "errors": []}
        received_at = timestamp()
        with self.connection() as connection:
            # Scraping and manual imports can target the same posting concurrently.
            # Take the write lock before checking identity to keep insert/update atomic.
            connection.execute("BEGIN IMMEDIATE")
            for index, record in enumerate(records, 1):
                try:
                    job = validate_posting(record)
                except ImportValidationError as error:
                    report["failed"] += 1
                    report["errors"].append({"row": index, "field": error.field, "message": str(error)})
                    continue
                existing = connection.execute("SELECT id, source_json FROM opportunities WHERE source=? AND source_key=?",
                                              (job["source"], job["source_key"])).fetchone()
                if existing and preserve_details and not (record.get("fullDescription") or "").strip():
                    previous = json.loads(existing["source_json"])
                    if (previous.get("fullDescription") or "").strip():
                        record = {**record, "fullDescription": previous["fullDescription"],
                                  "dateUpdated": previous.get("dateUpdated"),
                                  "fullDescriptionFromPreviousFetch": True}
                if existing is None:
                    connection.execute("""INSERT INTO opportunities(source, source_key, source_url, title, employer,
                                          source_json, created_at, updated_at, last_seen_at) VALUES(?,?,?,?,?,?,?,?,?)""",
                                       (job["source"], job["source_key"], job["source_url"], job["title"], job["employer"],
                                        encode(record), received_at, received_at, received_at))
                    report["imported"] += 1
                elif json.loads(existing["source_json"]) == record:
                    connection.execute("UPDATE opportunities SET last_seen_at=? WHERE id=?", (received_at, existing["id"]))
                    report["skipped"] += 1
                else:
                    connection.execute("""UPDATE opportunities SET source_url=?, title=?, employer=?, source_json=?,
                                          updated_at=?, last_seen_at=? WHERE id=?""",
                                       (job["source_url"], job["title"], job["employer"], encode(record),
                                        received_at, received_at, existing["id"]))
                    report["updated"] += 1
        return report

    @staticmethod
    def opportunity_view(row):
        posting = json.loads(row["source_json"])
        return {key: row[key] for key in ("id", "source", "source_key", "source_url", "title", "employer", "stage", "notes", "created_at", "updated_at", "last_seen_at")} | {
            "posting": posting, "posted_date": normalized_posted_date(posting.get("datePosted"))}

    def opportunities(self, *, stage="inbox", query="", page=1, page_size=25,
                      posted_from=None, posted_to=None):
        if stage not in {"inbox", "shortlisted", "skipped", "all"}:
            raise ValueError("Unknown stage.")
        for boundary in (posted_from, posted_to):
            if boundary is not None and normalized_posted_date(boundary) is None:
                raise ValueError("Use a valid posting date in YYYY-MM-DD format.")
        if posted_from and posted_to and posted_from > posted_to:
            raise ValueError("The From date must be on or before the To date.")
        clauses, parameters = ["source='onlinejobs'"], []
        if stage != "all":
            clauses.append("stage=?")
            parameters.append(stage)
        if query:
            clauses.append("(title LIKE ? ESCAPE '\\' OR employer LIKE ? ESCAPE '\\' OR source_json LIKE ? ESCAPE '\\')")
            pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            parameters.extend([pattern] * 3)
        if posted_from:
            clauses.append(f"{POSTED_DATE_SQL} >= ?")
            parameters.append(posted_from)
        if posted_to:
            clauses.append(f"{POSTED_DATE_SQL} <= ?")
            parameters.append(posted_to)
        where = " AND ".join(clauses)
        with self.connection() as connection:
            total = connection.execute(f"SELECT COUNT(*) FROM opportunities WHERE {where}", parameters).fetchone()[0]
            rows = connection.execute(f"SELECT * FROM opportunities WHERE {where} ORDER BY {POSTED_DATE_SQL} DESC, created_at DESC, id ASC LIMIT ? OFFSET ?",
                                      [*parameters, page_size, (page - 1) * page_size]).fetchall()
            counts = {"inbox": 0, "shortlisted": 0, "skipped": 0}
            for row in connection.execute("SELECT stage, COUNT(*) AS count FROM opportunities WHERE source='onlinejobs' GROUP BY stage"):
                counts[row["stage"]] = row["count"]
        return {"items": [self.opportunity_view(row) for row in rows], "total": total,
                "page": page, "page_size": page_size, "counts": counts,
                "posted_from": posted_from, "posted_to": posted_to, "sort": "posted_newest"}

    def opportunity(self, opportunity_id):
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM opportunities WHERE id=? AND source='onlinejobs'", (opportunity_id,)).fetchone()
        if row is None:
            return None
        return self.opportunity_view(row)

    def update_user_state(self, opportunity_id, *, stage=None, notes=None):
        assignments, parameters = [], []
        if stage is not None:
            assignments.append("stage=?")
            parameters.append(stage)
        if notes is not None:
            assignments.append("notes=?")
            parameters.append(notes)
        with self.connection() as connection:
            if assignments:
                connection.execute(f"UPDATE opportunities SET {', '.join(assignments)} WHERE id=? AND source='onlinejobs'",
                                   [*parameters, opportunity_id])
        return self.opportunity(opportunity_id)

    def profile(self):
        with self.connection() as connection:
            row = connection.execute("SELECT data_json FROM local_profile WHERE id=1").fetchone()
        return FreelancerProfile.model_validate(json.loads(row[0]) if row else {}).model_dump()

    def save_profile(self, profile):
        with self.connection() as connection:
            connection.execute("INSERT INTO local_profile(id, data_json, updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at",
                               (encode(profile), timestamp()))
        return self.profile()

    def save_draft(self, opportunity_id, context, result):
        """Append a generation; retain previous versions and their human edits."""
        saved_at = timestamp()
        with self.connection() as connection:
            draft_id = connection.execute("""
                INSERT INTO application_drafts(opportunity_id,model,kind,context_json,result_json,
                    subject,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
            """, (opportunity_id, result["model"], result["application"]["kind"], encode(context),
                  encode(result), result["subject"], result["body"], saved_at, saved_at)).lastrowid
        return self.draft(draft_id)

    @staticmethod
    def draft_view(row):
        return {"id": row["id"], "opportunity_id": row["opportunity_id"], "model": row["model"],
                "kind": row["kind"], "subject": row["subject"], "body": row["body"],
                "created_at": row["created_at"], "updated_at": row["updated_at"],
                "revision": row["revision"], "reviewed": bool(row["reviewed"]),
                "context": json.loads(row["context_json"]), "generated": json.loads(row["result_json"])}

    def draft(self, draft_id):
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM application_drafts WHERE id=?", (draft_id,)).fetchone()
        return self.draft_view(row) if row else None

    def drafts(self, opportunity_id):
        with self.connection() as connection:
            rows = connection.execute("""
                SELECT id,model,kind,created_at,updated_at,revision,reviewed FROM application_drafts
                WHERE opportunity_id=? ORDER BY id DESC
            """, (opportunity_id,)).fetchall()
        return [{**dict(row), "reviewed": bool(row["reviewed"])} for row in rows]

    def edit_draft(self, draft_id, *, subject, body, revision, reviewed):
        with self.connection() as connection:
            updated = connection.execute("""
                UPDATE application_drafts SET subject=?,body=?,reviewed=?,revision=revision+1,updated_at=?
                WHERE id=? AND revision=?
            """, (subject, body, int(reviewed), timestamp(), draft_id, revision))
            if updated.rowcount != 1:
                raise DraftConflict("This draft changed in another window. Reload it before saving your edits.")
        return self.draft(draft_id)

    def backup(self, destination):
        """Use SQLite's backup API so a backup is consistent while the app is running."""
        destination = Path(destination).expanduser().resolve()
        if destination == self.path:
            raise ValueError("Choose a backup path different from the active database.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation protects existing backups from accidental overwrite.
        with destination.open("xb"):
            pass
        try:
            if os.name != "nt":
                destination.chmod(0o600)
            with self.connection() as source, closing(sqlite3.connect(destination)) as target:
                source.backup(target)
        except Exception:
            destination.unlink()
            raise
        return destination


def main():
    parser = argparse.ArgumentParser(description="Initialize or inspect the local experiment's SQLite database")
    parser.add_argument("--backup", type=Path, help="Create a consistent backup at a new file path")
    parser.add_argument("--path", type=Path, help="Use an explicit database file instead of the default location")
    args = parser.parse_args()
    database = ExperimentDatabase(args.path)
    if args.backup:
        print(f"Backup created: {database.backup(args.backup)}")
    print(json.dumps(database.status(), indent=2))


if __name__ == "__main__":
    main()
