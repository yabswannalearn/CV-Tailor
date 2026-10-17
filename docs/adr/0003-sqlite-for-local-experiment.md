# Use SQLite for the local CRM experiment

Date: 2026-10-09

Status: Accepted for the experiment. Updates the initial database plan in ADR-0002.

## Context

The user requested a database for local experimentation and asked whether SQLite or PostgreSQL would be a better fit. The initial workflow serves one person on one computer, with short intake and assessment writes. The standalone ChatGPT plan proof does not need the legacy backend's users, billing, or remote database configuration.

The existing backend uses SQLAlchemy with PostgreSQL connection parameters and PostgreSQL-specific compatibility migrations in `ai-service/database.py`. Merely substituting a SQLite connection URL would not make that backend compatible.

## Decision

Use Python's built-in SQLite support for the isolated experiment. Create the database automatically in the user's local application data directory, with a configurable path, explicit schema version, foreign keys, short transactions, and a lock timeout. Keep credentials in the existing protected authentication store.

Initially persist opportunity source data and completed qualification/input snapshots. Restore saved results without rerunning AI. Supply a consistent backup command using SQLite's backup API. Keep database files out of Git, and do not import or modify existing PostgreSQL data.

SQLite is also the preferred starting point for the new single-user local CRM. Before connecting legacy generation or tracker routes, implement and verify the required schema transition and compatibility changes. That work is not completed by this experiment.

## Consequences

Local setup needs no database service. Database transactions finish independently of scraper or AI work. SQLite serializes writes; a shared hosted app with sustained simultaneous writes or several application servers would justify reassessing PostgreSQL. A future PostgreSQL migration requires schema and data-transfer work plus integration tests, rather than a connection-string change.

## References

- [Local-first product direction](0002-local-first-freelancer-opportunity-crm.md)
- [Experiment setup and backup](../../experiments/chatgpt_plan/README.md)
- [SQLite's intended use cases and concurrency guidance](https://www.sqlite.org/whentouse.html)
- [SQLite backup API](https://www.sqlite.org/backup.html)
