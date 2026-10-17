# Start the freelancer opportunity CRM as a local web app

Date: 2026-10-09

Status: Accepted product direction. Runtime choices below are the initial implementation plan.

## Context

CV Tailor is evolving toward a freelancer opportunity CRM: discover potential work, qualify it against the user's experience and preferences, prepare an application, and track replies, follow-ups, and outcomes. The user selected local first after comparing a personal local tool with a hosted app for other freelancers.

The current project already has a Next.js frontend, a FastAPI backend, PostgreSQL, discovery/import routes, an application tracker, and deterministic CV PDF and cover-letter generation. A separate scraper at `D:/vscode/Personal/Job Scraper` collects structured public OnlineJobs.ph listings and can fetch complete descriptions.

## Decision

The first version serves the user's own freelancer workflow and runs locally. Its interface is a local web app opened in the browser. The CRM database and application documents are stored locally; scraping and remote AI inference still require internet access.

OnlineJobs.ph is the first source. The first complete workflow is discovery, duplicate-safe intake, qualification, shortlisting, reviewed application preparation, and follow-up tracking. Business prospecting without an advertised opportunity is a later extension.

## Initial runtime plan

- Reuse Next.js and FastAPI, with both servers bound to loopback.
- Use SQLite for the isolated experiment and as the preferred starting point for the new single-user local CRM, per [ADR-0003](0003-sqlite-for-local-experiment.md). The existing PostgreSQL backend requires compatibility and schema-transition work before it can use SQLite.
- Reuse the separate OnlineJobs scraper through an intake adapter. JSON import is the first integration step; invoking scraper runs from the app follows after the intake is reliable.
- Keep deterministic scraping, normalization, deduplication, persistence, and stage updates in ordinary code. Use AI for qualification and drafting, with source evidence and the user's profile as grounding.
- Evaluate direct Sign in with ChatGPT plan usage for the local AI runtime. Verify Agents SDK compatibility before making it the required generation path. Keep provider-specific authentication and request handling behind the existing AI seam.
- Keep OAuth credentials in protected local runtime storage, outside frontend state, ordinary CRM records, and logs.
- Initially use manual searches and refreshes. Local scheduled work requires a running computer and explicit scheduling configuration.

## Consequences

Local first reduces hosted infrastructure requirements and lets the user validate the workflow using their own opportunities. It also puts dependency setup, updates, backups, and computer availability on the local installation.

Local storage does not imply offline inference: the chosen AI provider receives the context needed for generation. ChatGPT identity sign-in and permission to consume plan usage are separate, and request limits and model access must be handled explicitly.

The existing resume generation constraints remain applicable: AI supplies plain text/JSON, deterministic code assembles LaTeX, and generated resumes must pass the one-page rule and ATS Check.

This record captures the target direction. It does not claim that the CRM migration, local database provisioning, OAuth integration, or new pipeline is already implemented.

## References

- [Local-first implementation plan](../plans/05_local_first_freelancer_opportunity_crm.md)
- [Current domain language](../../CONTEXT.md)
- [Official Sign in with ChatGPT integration guide](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [ChatGPT plan usage request limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
