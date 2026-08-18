# CV Tailor

A full-stack career platform: Next.js frontend, FastAPI backend (Gemini API), Postgres, and Tectonic-based LaTeX PDF compilation. Generates ATS-safe tailored resumes from a user profile + job description.

## Language

**Preset**:
A content/role configuration that steers resume generation for a specific niche — summary prompt, skills bank, metric prompts, section order, lever guidance. Stored as a row in `resume_presets`. Identified by `slug` (e.g. `virtual-assistant`).
_Avoid_: template (when talking about content), role config, profile type.

**Template** (Visual Template):
The LaTeX skin/layout used to render a resume. Values: `classic` (Jake's/Harvard single-column) and `modern`. Stored as `Profile.preferred_template`. Orthogonal to Preset — a resume is (Template × Preset).
_Avoid_: layout, skin, theme (use Template).

**Role**:
The user's professional niche/identity. **Role and Preset are the same concept**, persisted as `Profile.preset_slug`. The user sets it once on the Personal tab; it selects the matching Preset. Per-generation, the user can override the preset without changing their saved Role.
_Avoid_: profile type, user type, category.

**Skills Bank**:
A preset's list of suggested skills for its niche. Non-destructively merged into `Profile.skills` (case-insensitive dedup) when the user saves their role. The user can edit/remove merged skills freely on the Skills tab.
_Avoid_: default skills, skill suggestions (use Skills Bank).

**Metric Prompts**:
Fill-in-the-blank achievement templates in a preset (e.g. `"Resolved [X]+ tickets/day with a [X]% CSAT score"`). Used ONLY to steer Gemini during generation — never rendered as literal placeholder text in the UI or the resume. The `[X]` markers must be replaced with real numbers by Gemini.
_Avoid_: bullet templates, placeholder fields.

**Lever Guidance**:
Per-niche text in a preset telling Gemini which resume section to expand most (e.g. projects for developers, experience bullets for VA/support/sales) and which action verbs fit. Injected into the shared prompt skeleton.
_Avoid_: section emphasis, main lever (use Lever Guidance when referring to the preset field).

**ATS Check**:
Post-compile validation (`ai-service/services/ats_check.py`) that extracts text from the generated PDF and verifies (a) section headings appear in the preset's stated order, (b) text is selectable (not image-based), (c) ATS-conventional headings are present. Returns `{pass, warnings}`. Surfaced as a badge in the generate page.
_Avoid_: ATS score, resume grader (use ATS Check).

**One-page rule**:
Every generated resume must fit on exactly one page. A resume that spills onto a second page is not a valid generated result.

**Admin**:
A User with `is_admin = true` on the `users` row — a single boolean flag, not a role table. Admins can access `/admin`, which lists every user (name, falling back to email if no Profile exists yet; credits; aggregate tracked-job counts by status) and can set any user's Credits to an exact value. Seeded idempotently in `migration.py`: flips `is_admin` to true for a known email once that user has registered normally through `/auth/register` — the seed never creates the account itself.
_Avoid_: role, permission level, superuser.

**Credits**:
A per-user integer balance (`User.credits`, default 5) that gates AI-driven generation actions (CV generation, PDF generation, cover letter generation, auto-fill) — each action decrements it by 1, and the action is blocked once it hits 0. Adjusted directly by an Admin via `/admin`.
_Avoid_: tokens, balance, quota.

## Architectural constraints

- **PDF compilation is Python + Tectonic** (`ai-service/services/pdf_service.py`), invoked directly from FastAPI. The `pdf-service/` Go/Gin app is dead code (nothing calls port 8081) and is not used. ATS validation is Python (`ai-service/services/ats_check.py`), not Go.
- **The resume editor is a single raw LaTeX `<textarea>`** (`frontend/src/app/generate/page.tsx`). There is no structured bullet-field form. Preset prefill happens at the profile + prompt level, never as UI placeholder fields.
- **Routes mount at the FastAPI root — no `/api/` prefix.** The spec's `/api/presets` is `/presets` in this codebase. Existing routers: `/generate`, `/profile`, `/auth`, `/tracker`, `/code`, `/interview`.
- **Migrations are a standalone script** (`ai-service/migration.py`, run with `python migration.py`) using ad-hoc `ALTER TABLE` / `CREATE TABLE` statements — not Alembic.

## Flagged ambiguities

- **"Template"** is overloaded in the broader LaTeX world (a `.tex` file is a "template"). In CV Tailor, **Template = Visual Template** (classic/modern skin). The `.tex` skeleton strings are the implementation of a Template, not a separate concept. When you mean the content/role configuration, say **Preset**.
- **"Role" vs "Preset"** — same thing. Do not model them as separate fields; both map to `Profile.preset_slug`.

## Example dialogue

**Dev**: "I'm adding a new role — Data Analyst. Where does it go?"
**Domain expert**: "Add a Preset row with slug `data-analyst`. The user picks it as their Role on the Personal tab; it'll also show in the generate Preset picker. No code changes — just the DB seed."

**Dev**: "Should the Data Analyst resume use the modern skin?"
**Domain expert**: "Set `recommended_template` to `modern` on the preset. The Template picker will highlight it, but the user can still pick classic — Template and Preset are independent."

**Dev**: "The metric prompt has `[X]` — does that show in the resume?"
**Domain expert**: "Never. Metric Prompts only steer Gemini. They're injected into the prompt as templates-to-emulate; Gemini replaces `[X]` with real numbers or drops it. They never reach the LaTeX."
