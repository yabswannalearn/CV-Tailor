# CV Tailor

A full-stack career platform: Next.js frontend, FastAPI backend (Gemini API), Postgres, and Tectonic-based LaTeX PDF compilation. Generates ATS-safe tailored resumes from a user profile + job description.

## Language

**Application Conversation**:
A conversation with the Career Agent focused on one tracked application, bringing together its job context, research, document drafts, and interview preparation. Each application has one ongoing conversation, which the user can delete independently of the application.

**General Conversation**:
A conversation with the Career Agent that is not tied to a tracked application. A job description supplied there can be used before the user saves it as a tracked application.

**Confirmed Skill**:
A skill the user has affirmed they possess. A preset's suggested skill is not a Confirmed Skill until the user confirms it, and existing skills of unknown origin require user review.

**Conversation Evidence**:
A personal fact the user provides in a conversation for use in that conversation. It does not become part of the saved profile unless the user chooses to add it.

**Tailored Cover Letter**:
A cover letter that relates a user's actual experience and confirmed skills to a specific job description without inventing personal facts, achievements, or stories. It may use the saved profile and Conversation Evidence.

**Application Draft**:
A reviewable version of a CV, cover letter, interview preparation plan, or interview cheat sheet associated with an Application Conversation. Earlier versions remain available; applying a CV or cover letter draft makes it the current application document without discarding earlier versions.

**Personal Evidence**:
Personal facts supported by the user's saved profile or Conversation Evidence. Earlier resumes may inform context or phrasing but do not independently establish Personal Evidence.

**Company Research**:
Findings about a company or role gathered for the user's job search, with sources and a clear distinction between supported facts and inference.

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
Every generated resume must fit on exactly one page, including a resume revised through the Career Agent. A resume that spills onto a second page is not a valid generated result; the user is shown the overflow and can resolve it.

**Admin**:
A User with `is_admin = true` on the `users` row — a single boolean flag, not a role table. Admins can access `/admin`, which lists users and aggregate tracked-job counts by status.
_Avoid_: role, permission level, superuser.

**Block**:
The smallest independently regenerable piece of a resume: one summary, one bullet, one entry heading, one skills row, one certifications line. Blocks are derived from the generated LaTeX, each has a stable address, and they have a single document order. Distinct from **Section** (`\section{...}` — Summary, Education, Experience, Projects, Technical Skills, Certifications), which *contains* Blocks.
_Avoid_: node, element, region, chunk, segment.

**Spot Edit**:
A user-initiated rewrite of one or more Blocks driven by a free-text instruction ("make this more metric-heavy"). The user selects text in the PDF preview, the selection resolves to Blocks, the instruction applies to those Blocks only, and every other Block is left byte-identical. A Spot Edit spans a contiguous run of Blocks within one Section — never across Sections.
_Avoid_: annotation, markup, comment, highlight, patch, inline edit.

**No-invention rule**:
A Spot Edit may reframe, re-emphasise, re-order or re-word what the user's profile already contains, but must never introduce a fact — above all a number — that is absent from the profile. When an instruction asks for data the profile does not hold, the rewrite proceeds on intent alone and reports that the data was unavailable. Placeholder markers such as `[X]` never reach a Block, consistent with **Metric Prompts**.

## Architectural constraints

- **PDF compilation is Python + Tectonic** (`ai-service/services/pdf_service.py`), invoked directly from FastAPI. The `pdf-service/` Go/Gin app is dead code (nothing calls port 8081) and is not used. ATS validation is Python (`ai-service/services/ats_check.py`), not Go.
- **The resume editor has three modes over one source of truth** (`frontend/src/app/(authenticated)/generate/page.tsx`): a structured field form ("Edit"), a PDF preview, and a raw LaTeX editor ("LaTeX"). The LaTeX string is the single source of truth; the structured form is a parsed projection of it (`frontend/src/lib/resumeDraft.ts`) that writes edits back into the LaTeX surgically. Preset prefill happens at the profile + prompt level, never as UI placeholder fields.
- **The AI never emits LaTeX.** Gemini returns plain-text JSON; `services/latex_assembly.py` builds every LaTeX construct. This holds for Spot Edits too — a Spot Edit returns replacement plain text for a Block, never markup. It is what makes an AI rewrite structurally incapable of breaking compilation.
- **Routes mount at the FastAPI root — no `/api/` prefix.** The spec's `/api/presets` is `/presets` in this codebase. Existing routers: `/generate`, `/profile`, `/auth`, `/tracker`, `/code`, `/interview`.
- **Migrations are a standalone script** (`ai-service/migration.py`, run with `python migration.py`) using ad-hoc `ALTER TABLE` / `CREATE TABLE` statements — not Alembic.

## Flagged ambiguities

- **"Template"** is overloaded in the broader LaTeX world (a `.tex` file is a "template"). In CV Tailor, **Template = Visual Template** (classic/modern skin). The `.tex` skeleton strings are the implementation of a Template, not a separate concept. When you mean the content/role configuration, say **Preset**.
- **"Role" vs "Preset"** — same thing. Do not model them as separate fields; both map to `Profile.preset_slug`.
- **"Annotation"** is already taken by the PDF specification — react-pdf's `renderAnnotationLayer` means embedded PDF objects such as hyperlinks, and the generate page disables it. The user-facing act of selecting resume text and asking for a rewrite is a **Spot Edit**, never an annotation.
- Existing profile skills do not record whether they were entered by the user or suggested by a preset. They need user review before being treated as **Confirmed Skills** for the Career Agent.

## Example dialogue

**Dev**: "I'm adding a new role — Data Analyst. Where does it go?"
**Domain expert**: "Add a Preset row with slug `data-analyst`. The user picks it as their Role on the Personal tab; it'll also show in the generate Preset picker. No code changes — just the DB seed."

**Dev**: "Should the Data Analyst resume use the modern skin?"
**Domain expert**: "Set `recommended_template` to `modern` on the preset. The Template picker will highlight it, but the user can still pick classic — Template and Preset are independent."

**Dev**: "The metric prompt has `[X]` — does that show in the resume?"
**Domain expert**: "Never. Metric Prompts only steer Gemini. They're injected into the prompt as templates-to-emulate; Gemini replaces `[X]` with real numbers or drops it. They never reach the LaTeX."

**Dev**: "The user mentions managing five people in an Application Conversation. Can the cover letter use that?"
**Domain expert**: "Yes, as Conversation Evidence. Ask before adding it to their saved profile."
