---
name: cv-tailor
description: Set up and operate the local CV Tailor career workspace. Use for onboarding, multi-step career tasks, or resuming saved application work.
---

# cv-tailor

Run `cv-tailor --json status` first. If no workspace exists, run `cv-tailor init`. The default installation is CLI only; add the optional UI with `cv-tailor dashboard install` and launch it with `cv-tailor dashboard`.
Load `cv-tailor --json preferences get` after initialization. Reuse the saved resume default and tracking connection without repeating setup questions. During first onboarding, offer a resume default and optional tracking tool (SQLite-only is valid); save choices the user provides with `preferences set --revision N --input preferences.json`, preserving other fields. Do not treat a saved connection preference as proof that authorization or publishing succeeded. A preference never authorizes an automatic publish.
Load the saved profile using `profile get`; gather missing facts through conversation and use cv-profile to save them. Use `applications list` to identify a requested existing application; pass its explicit ID to subsequent commands. Route the requested task to the focused skills below. Read only the skill you need.

Reuse saved `calendar_connections` for calendar requests through cv-calendar. Calendar setup is separate from `tracking_connection`; preserve both providers when updating the replacement list, and do not treat remembered setup as permission to publish events.
- Profile: cv-profile
- Job discovery/intake: cv-jobs
- Requirement comparison: cv-job-fit
- Research: cv-company-research
- Resume creation/editing: cv-resume, cv-resume-edit
- Web portfolio generation and deployment wizard: cv-portfolio
- Cover letters: cv-cover-letter
- Application management: cv-tracker
- Visual application snapshots and pipeline charts: cv-snapshot
- Optional tracking connections and publishing setup: cv-connect
- Calendar connections, interviews, deadlines, and reminders: cv-calendar
- Employer form filling and application answers: cv-apply
- Browser setup and local-only job-site sign-in: cv-browser
- Interview preparation/practice: cv-interview
- Coding exercises/review: cv-code-practice
For a multi-step request, save the application when requested, export its context, produce the requested documents, and save each as a draft. Report real command results and document IDs. Applying drafts is a separate operation. The CLI and optional dashboard use the same local SQLite data; no account or CV Tailor AI API key is required.

Commands accept `--json` and `--data-dir`. Activate the repository virtual environment first; see the root AGENTS.md for executable paths. Use file/stdin JSON to avoid shell escaping errors.

When the user supplies a new personal fact for this conversation, pass a JSON list of those explicit assertions with `--evidence facts.json` on draft import/revise, resume patch, or practice save. Never put job requirements or invented claims in evidence. It stays scoped to this conversation/application; saving it to the profile is a separate user choice.
