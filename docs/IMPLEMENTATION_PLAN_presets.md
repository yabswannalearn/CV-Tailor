# Resume Content Presets — Implementation Plan

> Status: Design resolved via grilling session. Ready for implementation.
> Branch: `feature/templates`
> This document is self-contained. An executing agent should not need to re-ask any design question. Every decision is recorded in §3 with its rationale.

---

## 1. Background & Context

CV Tailor is a full-stack career platform:
- **Frontend**: Next.js (`frontend/`), dashboard at `frontend/src/app/dashboard/page.tsx`, resume generator at `frontend/src/app/generate/page.tsx`.
- **Backend**: FastAPI (`ai-service/`), Postgres, Gemini API. Resume generation lives in `ai-service/services/llm_service.py` (`build_prompt`, `assemble_latex`, `generate_latex_resume`).
- **PDF compilation**: Python + Tectonic in `ai-service/services/pdf_service.py` (`compile_latex_to_pdf`). **There is a `pdf-service/` Go/Gin app, but it is dead code — nothing calls port 8081. It is out of scope and will not be used.**
- **LaTeX templates**: `ai-service/services/templates/` — `jakes_resume.py` (`JAKES_RESUME`, the "classic" skin) and `modern_resume.py` (`MODERN_RESUME`, the "modern" skin). Assembled by string replacement of `<<HEADING>>`, `<<SUMMARY>>`, `<<EDUCATION>>`, `<<EXPERIENCE>>`, `<<PROJECTS>>`, `<<SKILLS>>`, `<<CERTIFICATIONS>>` placeholders.

### Two orthogonal feature axes (critical mental model)

1. **Visual Template** = the LaTeX skin/layout. Values: `classic`, `modern`. Already half-built in the working tree (uncommitted). Field: `Profile.preferred_template`.
2. **Content Preset** = the role/niche content steering. Values: `virtual-assistant`, `software-developer`, `customer-support`, `bookkeeping-finance`, `sales-sdr`, `content-marketing`, plus `blank` (custom). New. Field: `Profile.preset_slug`.

A resume = (Visual Template) × (Content Preset). They are independent. The preset recommends a default visual template but the user can override.

### Current working-tree state (uncommitted on this branch)

The uncommitted changes add the **visual template** feature:
- `Profile.preferred_template` column (migration in `ai-service/migration.py`).
- `GenerateRequest.template_id` field (`ai-service/models/schemas.py`).
- `GET /generate/templates` endpoint returning classic + modern (`ai-service/routers/generate_routes.py`).
- `services/templates/__init__.py` exporting `TEMPLATES = {"classic": JAKES_RESUME, "modern": MODERN_RESUME}`.
- `assemble_latex(profile, ai_content, template_id)` and `generate_latex_resume(db_profile, jd, template_id)` signatures.
- Template picker UI on the generate page (text cards, no preview images yet).

**This work is functional and will be committed first (see §12), then the preset feature builds on top.**

---

## 2. Glossary

See `CONTEXT.md` at repo root for the canonical term definitions. Key terms:

- **Preset** (content) vs **Template** (visual) vs **Role** — see CONTEXT.md. Role and Preset are the SAME concept persisted as `Profile.preset_slug`.
- **Skills Bank** — the preset's suggested-skills list, merged into `Profile.skills` (non-destructively) when the user saves their role.
- **Metric Prompts** — fill-in-the-blank achievement templates (e.g. `"Resolved [X]+ tickets/day with a [X]% CSAT score"`). Used ONLY to steer Gemini. Never rendered as literal placeholder text in the UI or the resume.
- **Lever Guidance** — per-niche text telling Gemini which section to expand most (projects for dev, experience bullets for VA/support/sales, etc.).
- **ATS Check** — post-compile validation that the generated PDF's extracted text reads in the intended order with recognizable headings.

---

## 3. Resolved Decisions (from grilling session)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| Q1 | Prefill mechanism | **Lazy path**: skills → `Profile.skills`; metric prompts → injected into Gemini prompt; summary prompt → steers Gemini. No structured form editor. | The editor is a single raw LaTeX `<textarea>`; building a structured bullet-field form is a separate large project. Avoids literal `[X]` placeholder leakage. |
| Q2 | Role vs Preset | **Same concept.** One field `Profile.preset_slug` is both the user's role identity and the preset selector. Per-generation override allowed without changing saved role. | One source of truth; avoids double vocabulary. |
| Q3 | ATS validation location | **Python** `ai-service/services/ats_check.py`, called from the existing FastAPI compile flow. Go service stays dead. | Go/Gin service is dead code; spec explicitly allowed Python fallback. |
| Q4 | Seed storage | **DB table** `resume_presets` + seed in `migration.py`. | Honors spec's acceptance criterion "add a 7th preset = one DB seed entry, no code changes." Repo already has a migration pattern. |
| Q5 | Section order semantics | **Advisory only.** Stored on the preset, used by the ATS check to verify heading sequence. The LaTeX template's section order stays fixed. Preset `section_order` must use the template's real heading names. | Making the template order dynamic is YAGNI; every preset uses the same fixed order today. |
| Q6 | Prompt integration | **Preset-aware in the parts that vary.** Inject `target_summary_prompt` (summary), `lever_guidance` (main-lever line), `metric_prompts` (quantify templates) into the shared prompt skeleton. Keep selection/tailoring/output rules shared. | Pure-layering (A) leaves dev-flavored "projects as main lever" guidance for VA resumes; full per-preset prompts (C) is 6× maintenance. |
| Q7 | Skills bank merge behavior | **Merge, no duplicates** (case-insensitive). User's existing skills preserved. User can delete preset skills on the Profile page. | Non-destructive; honors "user can remove/edit freely." |
| Q8 | When skills merge fires | **On profile role-save only** (Personal tab save). The New Resume preset picker (per-generation override) does NOT touch skills — it only steers the prompt. | One trigger, predictable, no skill accumulation from previewing presets. |
| Q9 | Visual vs content coexistence | **Two independent axes.** `Profile.preferred_template` (visual) + `Profile.preset_slug` (content). Two pickers on generate page. | Orthogonal concepts; merging breaks the "one DB row per preset" criterion. |
| Q10 | Template preview | **Pre-rendered static PNGs** committed to `frontend/public/template-previews/{classic,modern}.png`. Preset carries `recommended_template` field; picker highlights the recommended skin. | Templates change rarely; zero runtime cost; instant load. |
| Q11 | Role picker location | **Dashboard → Personal tab.** Dropdown "Your role / niche" + one-line helper text. Saved with the profile. | One place to set, one place to see, no new pages. |
| Q12 | Commit strategy | **Commit visual-template work first** as its own commit, then build presets on top. | Clean history; each feature is an independently reviewable/revertable unit. |

---

## 4. Architecture Overview

```
User sets role on Dashboard → Personal tab
  → POST /profile/save (with preset_slug)
     → backend merges preset.core_skills_bank into profile.skills (dedup, case-insensitive)
     → saves profile.preset_slug

User opens New Resume flow
  → frontend fetches GET /api/presets (list) and GET /generate/templates (visual list)
  → preset picker shows 6 niches + "Blank / Custom"
  → visual template picker shows classic/modern with preview PNGs;
    recommended_template for the selected preset is highlighted
  → per-generation: user can override either axis
  → POST /generate/cv { email, jd, template_id, preset_slug }
     → load preset row by slug
     → build_prompt(profile, jd, preset) — injects summary prompt, lever guidance, metric prompts
     → Gemini call → JSON
     → assemble_latex(profile, ai_content, template_id)  (visual skin)
     → (for /pdf) compile_latex_to_pdf → ats_check(pdf_bytes, preset) → return pdf + ats result
  → frontend shows PDF preview + ATS Check badge (pass/fail + warnings)
```

Note: the spec mentions `/api/presets` but the existing router prefix convention is `/generate` and `/profile`. New preset endpoints will live under a new `presets` router with prefix `/presets` (so full path is `/presets` and `/presets/{slug}`). Adjust frontend `API_URL` calls accordingly. The spec's `/api/` prefix is NOT used by this codebase — all routes are mounted at the FastAPI root without `/api`.

---

## 5. Data Model

### New table: `resume_presets`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer, PK | auto-increment |
| `slug` | String(50), unique, not null, indexed | e.g. `virtual-assistant` |
| `display_name` | String(100), not null | e.g. `Virtual Assistant` |
| `target_summary_prompt` | Text, not null | steers Gemini summary generation |
| `core_skills_bank` | JSON, not null | array of strings |
| `metric_prompts` | JSON, not null | array of strings (contain `[X]` placeholders) |
| `section_order` | JSON, not null | array of heading names matching the LaTeX template's real section names (see §5.2) |
| `recommended_template` | String(50), not null, default `'classic'` | `classic` or `modern` |
| `lever_guidance` | Text, not null | per-niche instruction for which section to expand |

Add to `ai-service/models/database_models.py`:

```python
from sqlalchemy import JSON  # add to imports

class ResumePreset(Base):
    __tablename__ = "resume_presets"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(50), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    target_summary_prompt = Column(Text, nullable=False)
    core_skills_bank = Column(JSON, nullable=False)
    metric_prompts = Column(JSON, nullable=False)
    section_order = Column(JSON, nullable=False)
    recommended_template = Column(String(50), nullable=False, default="classic")
    lever_guidance = Column(Text, nullable=False)
```

### Modify `Profile` table

Add one column:

```python
preset_slug = Column(String(50), default="blank")  # blank = custom / no preset
```

`preferred_template` (visual) already exists from the uncommitted visual-template work.

### 5.2 Valid `section_order` values

The LaTeX templates (`jakes_resume.py`, `modern_resume.py`) render these fixed sections in this order:
- `Summary`
- `Education`
- `Experience`
- `Projects`
- `Technical Skills`
- `Certifications`

`section_order` on a preset is an advisory reordering expressed as a subset/reorder of **these exact heading strings**. The ATS check verifies the extracted text contains these headings in the preset's stated order. Do NOT invent names like `"tools"` or `"core_skills"` — use the template's real `\section{...}` names. If a preset wants to de-emphasize a section, list it last or omit it from `section_order` (the ATS check treats omitted headings as "not required").

---

## 6. Seed Data (all 6 presets)

Realistic PH-remote-market content. Insert via `migration.py` after table creation. Use `INSERT ... ON CONFLICT (slug) DO NOTHING` so re-running is idempotent.

### 6.1 Virtual Assistant
- **slug**: `virtual-assistant`
- **display_name**: `Virtual Assistant`
- **target_summary_prompt**: `"Reliable virtual assistant experienced in supporting busy entrepreneurs and small business owners remotely. Emphasize calendar/email management, responsiveness, organization, and trustworthiness."`
- **core_skills_bank**: `["Email & Calendar Management", "Customer Service / Live Chat", "Data Entry & Reporting", "Social Media Scheduling", "File & Document Management", "CRM Management", "Microsoft 365 / Google Workspace"]`
- **metric_prompts**: `["Managed [X]'s inbox and calendar, reducing scheduling conflicts by [X]%", "Handled [X]+ customer inquiries daily via email/chat with a [X]% satisfaction rate", "Organized [X]+ files and records, cutting retrieval time from [X] to [X] minutes"]`
- **section_order**: `["Summary", "Experience", "Technical Skills", "Education", "Certifications"]`
- **recommended_template**: `classic`
- **lever_guidance**: `"Experience bullets are your main lever — write 3-4 detailed bullets per role. Emphasize organization, responsiveness, and volume handled. Use verbs like Managed, Coordinated, Organized, Handled, Streamlined. Projects usually don't apply; if the profile has none, do not invent any."`

### 6.2 Software Developer (reference implementation)
- **slug**: `software-developer`
- **display_name**: `Software Developer`
- **target_summary_prompt**: `"Software developer with strong engineering background. Emphasize technical depth, system design, and measurable impact on products."`
- **core_skills_bank**: `["JavaScript", "TypeScript", "Python", "React", "Node.js", "PostgreSQL", "Git", "REST APIs", "Docker"]`
- **metric_prompts**: `["Built [X] feature used by [X]+ users, reducing [metric] by [X]%", "Engineered [X] service handling [X] requests/day with [X]% uptime", "Improved [X] performance by [X]% through [specific optimization]"]`
- **section_order**: `["Summary", "Experience", "Projects", "Technical Skills", "Education", "Certifications"]`
- **recommended_template**: `modern`
- **lever_guidance**: `"Projects are your main lever — write 3 detailed bullets per project, each 1.5-2 lines, explaining what you built, how, and the measurable impact. Experience bullets should also be detailed. Use verbs like Architected, Engineered, Designed, Implemented, Optimized."`

### 6.3 Customer Support / BPO Specialist
- **slug**: `customer-support`
- **display_name**: `Customer Support / BPO Specialist`
- **target_summary_prompt**: `"Customer support specialist with experience in high-volume ticket resolution and cross-channel communication. Emphasize CSAT/NPS, ticket volume, and tools used."`
- **core_skills_bank**: `["Zendesk", "Intercom", "Freshdesk", "Live Chat Support", "Ticket Escalation", "CSAT/NPS Management", "Multi-channel Support", "Email Support"]`
- **metric_prompts**: `["Resolved [X]+ tickets/day with a [X]% CSAT score", "Reduced average response time from [X] to [X]", "Maintained [X]% NPS across [X]+ monthly interactions"]`
- **section_order**: `["Summary", "Experience", "Technical Skills", "Education", "Certifications"]`
- **recommended_template**: `classic`
- **lever_guidance**: `"Experience bullets are your main lever — write 3-4 detailed bullets per role. Quantify ticket volume, CSAT, response time, and channels. Use verbs like Resolved, Handled, Reduced, Maintained, Escalated. Projects usually don't apply; do not invent any."`

### 6.4 Bookkeeping / Accounting / Finance Support
- **slug**: `bookkeeping-finance`
- **display_name**: `Bookkeeping / Accounting / Finance Support`
- **target_summary_prompt**: `"Detail-oriented bookkeeper and accounting support specialist experienced in maintaining accurate financial records for small businesses. Emphasize accuracy, reconciliation, and tools (QuickBooks, Xero)."`
- **core_skills_bank**: `["QuickBooks", "Xero", "Wave", "Bank Reconciliation", "Accounts Payable / Receivable", "Invoicing", "Financial Reporting", "Excel / Google Sheets"]`
- **metric_prompts**: `["Managed [X]+ monthly transactions with [X]% accuracy across [X] accounts", "Reduced reconciliation time from [X] to [X] hours per month", "Processed [X]+ invoices/month with [X]% error rate"]`
- **section_order**: `["Summary", "Experience", "Technical Skills", "Education", "Certifications"]`
- **recommended_template**: `classic`
- **lever_guidance**: `"Experience bullets are your main lever — write 3-4 detailed bullets per role. Emphasize accuracy, volume, and reconciliation metrics. Use verbs like Managed, Reconciled, Processed, Maintained, Audited. Projects usually don't apply; do not invent any."`

### 6.5 Sales / Appointment Setter / SDR
- **slug**: `sales-sdr`
- **display_name**: `Sales / Appointment Setter / SDR`
- **target_summary_prompt**: `"Outbound sales specialist with experience in lead generation, cold outreach, and appointment setting. Emphasize call volume, conversion rates, and pipeline contribution."`
- **core_skills_bank**: `["Cold Calling", "Lead Generation", "Appointment Setting", "CRM (HubSpot / Salesforce)", "Email Outreach", "Pipeline Management", "Discovery Calls", "Sales Scripting"]`
- **metric_prompts**: `["Booked [X]+ qualified meetings/month with a [X]% show rate", "Made [X]+ cold calls/day, converting [X]% to opportunities", "Generated [X]+ in pipeline from [X]+ outbound touches per month"]`
- **section_order**: `["Summary", "Experience", "Technical Skills", "Education", "Certifications"]`
- **recommended_template**: `classic`
- **lever_guidance**: `"Experience bullets are your main lever — write 3-4 detailed bullets per role. Quantify call volume, meetings booked, conversion rates, and pipeline. Use verbs like Booked, Generated, Pitched, Closed, Nurtured. Projects usually don't apply; do not invent any."`

### 6.6 Content Writer / Copywriter / Digital Marketing
- **slug**: `content-marketing`
- **display_name**: `Content Writer / Copywriter / Digital Marketing`
- **target_summary_prompt**: `"Content writer and digital marketing specialist experienced in creating SEO-driven content and campaigns. Emphasize content output, engagement metrics, and tools."`
- **core_skills_bank**: `["SEO Writing", "Copywriting", "Content Strategy", "WordPress", "Google Analytics", "Social Media Marketing", "Email Marketing", "Keyword Research"]`
- **metric_prompts**: `["Published [X]+ articles/month driving [X]% organic traffic growth", "Grew social engagement by [X]% across [X]+ followers", "Ran [X]+ campaigns generating [X]+ leads at [X]% conversion"]`
- **section_order**: `["Summary", "Experience", "Projects", "Technical Skills", "Education", "Certifications"]`
- **recommended_template**: `modern`
- **lever_guidance**: `"Projects (campaigns, published content, portfolios) are your main lever alongside experience — write 2-3 detailed bullets per project and 3 per role. Emphasize content output, engagement, and traffic metrics. Use verbs like Wrote, Published, Grew, Optimized, Launched, Drove."`

### 6.7 Blank / Custom
This is NOT a row in the table. It is the frontend-only option meaning "no preset." When selected, `preset_slug` is sent as `"blank"` (or omitted). The backend treats a missing/`blank`/unknown slug as "no preset" and falls back to the current dev-style default prompt (existing behavior). The `Profile.preset_slug` column defaults to `"blank"`.

---

## 7. Migration

`ai-service/migration.py` currently does ad-hoc `ALTER TABLE` statements. Extend it (do NOT replace existing statements) to:

1. Add `preset_slug` column to `profiles`:
   ```sql
   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preset_slug VARCHAR(50) DEFAULT 'blank';
   ```
   (The `preferred_template` column add is already in the uncommitted migration.py from the visual-template work — leave it.)

2. Create the `resume_presets` table (idempotent):
   ```sql
   CREATE TABLE IF NOT EXISTS resume_presets (
     id SERIAL PRIMARY KEY,
     slug VARCHAR(50) UNIQUE NOT NULL,
     display_name VARCHAR(100) NOT NULL,
     target_summary_prompt TEXT NOT NULL,
     core_skills_bank JSON NOT NULL,
     metric_prompts JSON NOT NULL,
     section_order JSON NOT NULL,
     recommended_template VARCHAR(50) NOT NULL DEFAULT 'classic',
     lever_guidance TEXT NOT NULL
   );
   ```

3. Seed all 6 presets using `INSERT ... ON CONFLICT (slug) DO NOTHING` with the exact JSON values from §6. Use SQLAlchemy `text()` with `json.dumps(...)` for the JSON columns, or inline JSON string literals.

Run the migration the same way the existing one is run (the file is a standalone script: `python migration.py` from the `ai-service/` dir, using the existing engine connection string).

---

## 8. Backend Changes

### 8.1 Models (`ai-service/models/database_models.py`)
- Add `from sqlalchemy import JSON` to imports.
- Add the `ResumePreset` class (§5).
- Add `preset_slug = Column(String(50), default="blank")` to `Profile`.

### 8.2 Schemas (`ai-service/models/schemas.py`)
- Add `preset_slug: str = "blank"` to `GenerateRequest` (alongside the existing `template_id`).
- Add Pydantic response schemas for the preset endpoints:
  ```python
  class PresetListItem(BaseModel):
      slug: str
      display_name: str
      recommended_template: str

  class PresetDetail(BaseModel):
      slug: str
      display_name: str
      target_summary_prompt: str
      core_skills_bank: list[str]
      metric_prompts: list[str]
      section_order: list[str]
      recommended_template: str
      lever_guidance: str
  ```
- Add `preset_slug: Optional[str] = "blank"` to `UserProfile` so the dashboard can send/save it.

### 8.3 New preset router (`ai-service/routers/presets_routes.py`)
Create a new router file (mirror the style of `generate_routes.py`):

```python
router = APIRouter(prefix="/presets", tags=["presets"])

@router.get("")
async def list_presets(db: Session = Depends(get_db)):
    rows = db.query(db_models.ResumePreset).order_by(db_models.ResumePreset.id).all()
    return [{"slug": r.slug, "display_name": r.display_name, "recommended_template": r.recommended_template} for r in rows]

@router.get("/{slug}")
async def get_preset(slug: str, db: Session = Depends(get_db)):
    row = db.query(db_models.ResumePreset).filter(db_models.ResumePreset.slug == slug).first()
    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {
        "slug": row.slug, "display_name": row.display_name,
        "target_summary_prompt": row.target_summary_prompt,
        "core_skills_bank": row.core_skills_bank,
        "metric_prompts": row.metric_prompts,
        "section_order": row.section_order,
        "recommended_template": row.recommended_template,
        "lever_guidance": row.lever_guidance,
    }
```

Register the router in `ai-service/main.py` (find where `generate_routes` etc. are included and add `app.include_router(presets_router.router)`).

### 8.4 Prompt changes (`ai-service/services/llm_service.py`)

Modify `build_prompt` to accept an optional `preset: dict | None = None` and inject preset fields into the shared skeleton. Do NOT create per-preset full prompt strings — only the varying parts are injected.

Current signature: `build_prompt(profile: UserProfile, jd: str) -> str`
New signature: `build_prompt(profile: UserProfile, jd: str, preset: dict | None = None) -> str`

Injection points (replace the dev-specific lines):

1. **Persona line** — currently:
   ```
   You are an elite technical resume writer and career strategist.
   ```
   Becomes:
   ```
   You are an elite resume writer and career strategist{persona_suffix}.
   ```
   where `persona_suffix = f" specializing in {preset['display_name']} roles"` if preset else `" specializing in software developer roles"` (preserve current default behavior when no preset).

2. **Summary rule** — currently inside SELECTION RULES:
   ```
   - Summary: 3 sentences that directly speak to what THIS specific job needs. Mirror JD language.
   ```
   Becomes (when preset present):
   ```
   - Summary: 3 sentences that directly speak to what THIS specific job needs. Mirror JD language. {preset['target_summary_prompt']}
   ```

3. **Main lever / page filling** — currently in PAGE FILLING RULES:
   ```
   - Projects are your main lever — write 3 detailed bullets per project, each 1.5-2 lines long.
   - Each project bullet should explain: WHAT you built + HOW you built it + the IMPACT or result.
   - Experience bullets should also be detailed — 1.5 lines each, not just one short sentence.
   ```
   When preset present, replace these three lines with `{preset['lever_guidance']}`. When no preset, keep the existing dev lines.

4. **Action verbs** — currently in TAILORING RULES:
   ```
   - Lead bullets with strong action verbs (Architected, Engineered, Designed, Implemented, etc.).
   ```
   When preset present, replace with a generic line:
   ```
   - Lead bullets with strong action verbs appropriate to the role.
   ```
   (Specific verbs are already named inside `lever_guidance`.) When no preset, keep the existing dev verbs line.

5. **Metric prompts** — append to TAILORING RULES (when preset present), a new line:
   ```
   - Quantify achievements wherever possible. Use templates like these as the shape: {preset['metric_prompts'] joined by "; "}
   ```
   Emphasize in the prompt: these are templates to emulate, NOT literal text. The `[X]` markers must be replaced with real numbers or removed.

Do NOT change the OUTPUT RULES or JSON structure — they stay identical so `assemble_latex` keeps working unchanged.

### 8.5 Generation flow (`ai-service/services/llm_service.py` + `ai-service/routers/generate_routes.py`)

`generate_latex_resume` currently: `generate_latex_resume(db_profile, jd, template_id)`.
New signature: `generate_latex_resume(db_profile, jd, template_id="classic", preset_slug="blank", db: Session = None)`.

Inside it:
1. If `preset_slug` and `preset_slug != "blank"` and `db` provided, load the preset row:
   ```python
   preset = db.query(db_models.ResumePreset).filter_by(slug=preset_slug).first()
   preset_dict = preset.__dict__-style mapping if found else None
   ```
2. Pass `preset_dict` to `build_prompt(profile, jd, preset_dict)`.
3. `assemble_latex(profile, ai_content, template_id)` — unchanged (visual skin only).

In `generate_routes.py`, update `generate_cv` and `generate_pdf` to:
- Read `data.preset_slug` and `data.template_id`.
- Pass `preset_slug=data.preset_slug, db=db` into `generate_latex_resume`.

### 8.6 Skill merge on profile save (`ai-service/routers/database_routes.py`)

In `save_profile` (the `POST /profile/save` handler), AFTER creating `new_profile` and before committing:
1. Read `preset_slug` from the incoming `profile_data` (it's now on `UserProfile`).
2. If `preset_slug` and `preset_slug != "blank"`: load the preset row, get `core_skills_bank`.
3. Get the set of existing skill names the user provided in `profile_data.skills` (lowercased).
4. For each skill in the preset's `core_skills_bank`, if its lowercased form is NOT already in the user's set, append a new `db_models.Skill(profile_id=new_profile.id, skill_name=skill)`.
5. This is a one-time merge on save. Do NOT merge on the generate endpoint.

The merge is non-destructive because `save_profile` already deletes and recreates all child rows — the user's manually-entered skills come from `profile_data.skills` (preserved), and preset skills are additive. The dedup is case-insensitive against the user's submitted skills.

Note: the dashboard frontend sends the full skills list on save. The merge must run against the skills the user submitted in THIS save (not against previously-saved DB rows, which are already deleted at this point in the flow).

### 8.7 Load profile returns preset_slug

In `load_profile` (`GET /profile/load/{email}`), add `"preset_slug": profile.preset_slug` to the returned dict so the dashboard can show the saved role.

---

## 9. ATS Validation (`ai-service/services/ats_check.py`)

New file. Pure Python. No Go.

### 9.1 Function signature
```python
def ats_check(pdf_bytes: bytes, preset_section_order: list[str] | None = None) -> dict:
    """Returns {"pass": bool, "warnings": list[str], "extracted_text": str}"""
```

### 9.2 Text extraction
1. Write `pdf_bytes` to a temp file.
2. Try `pdftotext` (poppler CLI) via `subprocess.run(["pdftotext", "-layout", tmpfile, "-"], capture_output=True)`. Use `shutil.which("pdftotext")` to detect it.
3. If `pdftotext` is NOT available, fall back to `pypdf` (`PdfReader`; already a project dependency):
   ```python
   from pypdf import PdfReader
   reader = PdfReader(io.BytesIO(pdf_bytes))
   text = "\n".join(page.extract_text() for page in reader.pages)
   ```
   Append a warning: `"pdftotext (poppler) not found; used pypdf fallback — order check less reliable."`
4. Clean the extracted text (collapse whitespace).

### 9.3 Checks (append warnings, set pass=false if any warning is severe)

**Check A — Section order** (only if `preset_section_order` provided):
- For each heading in `preset_section_order`, find its position in the extracted text (case-insensitive substring search). Accept common variants: "Experience" or "Work Experience"; "Technical Skills" or "Skills"; "Summary" or "Professional Summary" or "Profile".
- Verify positions are strictly increasing. If out of order, warn: `"Section headings out of order in extracted text: expected [order], got [found]."`
- If a required heading is missing entirely, warn: `"Required heading not found in extracted text: {heading}."`

**Check B — Selectable text / no image-only content**:
- If `extracted_text` length is less than 50 chars per page, warn: `"Very little selectable text extracted — PDF may contain image-based text that ATS cannot parse."`

**Check C — ATS-recognizable headings present**:
- Whitelist of conventional headings: any of {"experience", "work experience", "education", "skills", "technical skills", "summary", "professional summary", "projects", "certifications"}.
- If NONE of the conventional headings appear in the extracted text, warn: `"No ATS-conventional section headings found in extracted text."`
- If a preset's `section_order` heading deviates from conventional naming (e.g. a stylized variant not in the whitelist), warn per heading: `"Heading '{x}' may not be ATS-recognized; consider a conventional variant."` (This is advisory since headings come from the fixed LaTeX template and are already conventional — this check mostly guards future templates.)

**Check D — (skip) coordinate-based order**: NOT implemented. YAGNI for single-column templates. `// ponytail: coordinate-based y-order check deferred; add when a multi-column template ships`

### 9.4 Integration
Call `ats_check` from the compile flow. Two integration points:
- `POST /generate/compile` (the live recompile endpoint used by the editor textarea): after `compile_latex_to_pdf`, run `ats_check(pdf_bytes)` (no preset context here — pass `None` for section_order; runs checks B and C only). Return the result alongside the PDF. Since this endpoint currently returns raw PDF bytes with `Content-Disposition: inline`, add a new endpoint or return JSON with base64 PDF + ats result. **Simplest non-breaking approach**: add a NEW endpoint `POST /generate/compile-with-check` that returns `{"pdf_b64": "...", "ats": {...}}`, and have the frontend's live compile call that instead. (Keep the old `/generate/compile` returning raw PDF for backward compat.)
- `POST /generate/pdf`: after compile, run `ats_check(pdf_bytes, preset.section_order)` using the preset used for that generation. This endpoint currently returns raw PDF bytes. To surface the ATS result, either (a) add a companion endpoint `POST /generate/ats-check` that takes `{latex, preset_slug}`, compiles, checks, and returns JSON; or (b) change `/generate/pdf` to return JSON `{pdf_b64, ats}`. **Recommended**: add `POST /generate/ats-check` taking `{email, jd, template_id, preset_slug}` that reuses the generation+compile path and returns `{pdf_b64, ats}`. The frontend calls it after generation to populate the badge. This keeps `/generate/pdf` returning a clean downloadable PDF.

### 9.5 Result shape
```json
{
  "pass": true,
  "warnings": [],
  "extracted_text": "..."
}
```
`pass` is `true` only when `warnings` is empty. The frontend treats any non-empty warnings as "fail with warnings" (amber), empty as "pass" (green).

---

## 10. Frontend Changes

### 10.1 Dashboard → Personal tab: role picker (`frontend/src/app/dashboard/page.tsx`)

In the `Profile` interface, add `preset_slug: string` (default `"blank"`).
In `emptyProfile`, add `preset_slug: "blank"`.
In the profile load handler, read `data.preset_slug`.
In the Personal tab JSX (the block starting `activeTab === "personal"`), add at the top (before First Name) a dropdown:

```
label: "Your Role / Niche"
helper text (one line, textMuted): "We'll tailor your resume toward {role} roles and suggest relevant skills."
options (fetched from GET /presets on mount, plus a hardcoded "Blank / Custom" option at the top with slug "blank"):
  - Blank / Custom (blank)
  - Virtual Assistant (virtual-assistant)
  - Software Developer (software-developer)
  - Customer Support / BPO Specialist (customer-support)
  - Bookkeeping / Accounting / Finance Support (bookkeeping-finance)
  - Sales / Appointment Setter / SDR (sales-sdr)
  - Content Writer / Copywriter / Digital Marketing (content-marketing)
```

The helper text updates when the dropdown changes (derive role display name from the selected option). Use the existing `inputClass` / `labelClass` styling constants. A native `<select>` styled with `inputClass` is fine (lazy).

On save, include `preset_slug` in the body sent to `POST /profile/save`. The backend merges preset skills (§8.6). After save succeeds, if the user changed their role, refetch the profile so the Skills tab shows the merged skills.

### 10.2 Generate page: preset picker (`frontend/src/app/generate/page.tsx`)

Add a `selectedPreset` state (default `"blank"` or read from a query param). Add a preset picker block (near the existing template picker). Render as cards or a dropdown — match the existing template-picker card style. Options from `GET /presets` + "Blank / Custom". When a preset is selected, store its `recommended_template` and auto-select that visual template (the user can still change the visual template afterward — this is the "recommendation" behavior).

In the generate POST body (`/generate/cv` and `/generate/pdf`), include `preset_slug: selectedPreset`.

### 10.3 Generate page: template preview images

- Create `frontend/public/template-previews/classic.png` and `frontend/public/template-previews/modern.png` (see §11 for how to generate them).
- In the existing visual-template picker cards, add an `<img src={`/template-previews/${tpl.id}.png`} ... />` below the name/description. Style: `className="w-full mt-2 rounded border" style={{ borderColor: C.border }}`. The commented-out img tag already in the diff shows the intended shape — uncomment and wire it.
- When a preset is selected, highlight its `recommended_template` card with a small "Recommended for {role}" badge/label so the user sees the recommendation but can still pick the other skin.

### 10.4 Generate page: ATS badge

After a successful generation/compile that returns an ATS result, render a small badge near the PDF preview header:
- **Pass** (green, `C.green` / `C.greenLight`): "ATS Check: Passed"
- **Warnings** (amber): "ATS Check: {N} warnings" — clicking expands a list of the warning strings.
- **Fail/Error** (red, `C.red` / `C.redBg`): if the ATS check call itself failed.

Call the new `POST /generate/ats-check` endpoint (§9.4) after generation completes successfully to populate the badge. Store the result in state `atsResult: {pass, warnings} | null`.

---

## 11. Template Preview Image Generation

One-time, manual (not part of the running app):
1. Create a sample profile (or use an existing test profile) and a sample JD.
2. For each visual template (`classic`, `modern`): call the generation flow (or `assemble_latex` directly with hardcoded sample content) to produce LaTeX, compile to PDF via Tectonic.
3. Convert PDF → PNG. On Windows: use `pdftoppm` (poppler) if available, or open the PDF and screenshot page 1, or use a quick Python script with `pdf2image`/`pymupdf` if installed. A simple approach: `pdftoppm -png -r 150 resume.pdf classic` → `classic-1.png`, rename to `classic.png`.
4. Crop/resize to a consistent thumbnail size (e.g. 400×520px or a 3:4 ratio). Commit both PNGs to `frontend/public/template-previews/`.

These are static assets; they only need regenerating if the LaTeX template strings change materially. Document this in the README (§15).

`// ponytail: preview PNGs are static; regenerate manually when a template string changes materially`

---

## 12. Commit Strategy

### Commit 1 — Visual template feature (existing uncommitted work)
Stage and commit the current uncommitted changes as-is on this branch. Suggested message:
```
feat: add visual template picker (classic + modern LaTeX skins)
```
Files in this commit (from `git status`):
- `ai-service/models/database_models.py` (preferred_template column)
- `ai-service/models/schemas.py` (template_id on GenerateRequest)
- `ai-service/routers/generate_routes.py` (GET /generate/templates, template_id threading)
- `ai-service/services/llm_service.py` (assemble_latex template_id, modern heading, TEMPLATES import)
- `frontend/src/app/generate/page.tsx` (template picker UI)
- `ai-service/services/templates/__init__.py` (TEMPLATES dict)
- `ai-service/services/templates/modern_resume.py` (MODERN_RESUME string)
- `ai-service/migration.py` (preferred_template migration)

Verify the app still runs after this commit before starting commit 2.

### Commit 2 — Content presets feature
All the preset + ATS + role work from this plan. Suggested message:
```
feat: add content presets (role/niche) with ATS validation
```
Files touched/created (see §13).

Optionally split commit 2 into smaller commits (preset data model, preset endpoints, prompt integration, ATS check, frontend role picker, frontend preset picker + previews, ATS badge) — at the executor's discretion, but keep them on this branch after commit 1.

---

## 13. File-by-File Change List

### Backend
| File | Change |
|------|--------|
| `ai-service/models/database_models.py` | Add `JSON` import; add `ResumePreset` class; add `preset_slug` column to `Profile`. |
| `ai-service/models/schemas.py` | Add `preset_slug` to `GenerateRequest` and `UserProfile`; add `PresetListItem`, `PresetDetail` schemas. |
| `ai-service/migration.py` | Add `preset_slug` column migration; create `resume_presets` table; seed 6 presets (idempotent). |
| `ai-service/routers/presets_routes.py` | **NEW**. `GET /presets`, `GET /presets/{slug}`. |
| `ai-service/main.py` | Register `presets_routes` router. |
| `ai-service/services/llm_service.py` | `build_prompt(profile, jd, preset=None)` with injections (§8.4); `generate_latex_resume(..., preset_slug, db)` loads preset and passes through (§8.5). |
| `ai-service/routers/generate_routes.py` | Thread `preset_slug` from `GenerateRequest` into `generate_latex_resume`; add `POST /generate/ats-check` endpoint (§9.4). |
| `ai-service/routers/database_routes.py` | `save_profile`: merge preset skills (§8.6); `load_profile`: return `preset_slug` (§8.7). |
| `ai-service/services/ats_check.py` | **NEW**. `ats_check(pdf_bytes, preset_section_order)` (§9). |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/app/dashboard/page.tsx` | Add `preset_slug` to Profile type + emptyProfile; fetch presets on mount; render role dropdown + helper text on Personal tab; send `preset_slug` on save; refetch profile after save to show merged skills (§10.1). |
| `frontend/src/app/generate/page.tsx` | Add `selectedPreset` state; fetch presets; render preset picker; auto-select recommended visual template; send `preset_slug` in generate body; add preview `<img>` to template cards + "Recommended" badge; add ATS badge after generation (§10.2, §10.3, §10.4). |
| `frontend/public/template-previews/classic.png` | **NEW** static asset (§11). |
| `frontend/public/template-previews/modern.png` | **NEW** static asset (§11). |

### Docs
| File | Change |
|------|--------|
| `CONTEXT.md` | **NEW** (repo root). Glossary: Preset, Template, Role, Skills Bank, Metric Prompts, Lever Guidance, ATS Check. |
| `README.md` (or a new `docs/ADDING_A_PRESET.md`) | Section: "How to add a new preset" (§15). |

---

## 14. Acceptance Criteria

1. Selecting any of the 6 presets produces a resume that visually matches the existing Jake's/Harvard (classic) or Modern layout — no new visual template required.
2. `pdftotext` (or pypdf fallback) output for a resume generated from each preset reads in correct top-to-bottom order (the ATS check's section-order check passes for all 6).
3. Adding a 7th preset requires only a DB seed entry (INSERT into `resume_presets`) — no code changes. The new slug appears in `GET /presets`, the dashboard dropdown, and the generate preset picker automatically.
4. Saving a role on the Personal tab merges that preset's `core_skills_bank` into the profile's skills (non-destructive, deduped). The merged skills are visible on the Skills tab and survive subsequent saves.
5. The Gemini-generated summary reflects the preset's `target_summary_prompt` direction (e.g. a VA preset summary mentions calendar/email management, not "architected systems").
6. No literal `[X]` placeholder text from `metric_prompts` ever appears in a generated resume (metric prompts steer Gemini only; they are never rendered into the LaTeX).
7. The generate page shows a template preview image for each visual template and highlights the preset's `recommended_template`.
8. The generate page shows an ATS Check badge (pass/warnings) after generation, populated from `/generate/ats-check`.
9. The Go/Gin `pdf-service/` is not touched and not used.

---

## 15. README Section — How to add a new preset

Add to the repo README (or `docs/ADDING_A_PRESET.md`):

```markdown
## Adding a new resume preset

Presets are DB rows in `resume_presets`. Adding a niche requires one INSERT — no code changes.

1. Choose a unique `slug` (kebab-case, e.g. `graphic-designer`) and a `display_name`.
2. Write a `target_summary_prompt` — a sentence steering Gemini's summary for this niche.
3. List a `core_skills_bank` (JSON array of suggested skills, PH-remote-market relevant).
4. Write 2-3 `metric_prompts` — achievement templates with `[X]` placeholders (e.g. "Designed [X]+ assets/month for [X] campaigns"). These steer Gemini; they are never rendered literally.
5. Set `section_order` — a JSON array using the LaTeX template's real heading names: "Summary", "Education", "Experience", "Projects", "Technical Skills", "Certifications". Reorder/omit to advise the ATS check.
6. Set `recommended_template` — "classic" or "modern" (which visual skin to default to).
7. Write `lever_guidance` — tell Gemini which section to expand most and which action verbs fit the niche.
8. INSERT the row (use `ON CONFLICT (slug) DO NOTHING` for idempotency) via a migration script or directly.

The new preset automatically appears in `GET /presets`, the dashboard role dropdown, and the generate page preset picker on next load.

### Regenerating template preview images
Preview PNGs live at `frontend/public/template-previews/{classic,modern}.png`. They are static. Regenerate only when a LaTeX template string changes materially: compile a sample resume with each template, convert page 1 to PNG (e.g. `pdftoppm -png -r 150 resume.pdf classic`), and commit the new PNG.
```

---

## 16. Out of Scope / Non-Goals

- Building a structured resume form editor (the editor stays a single LaTeX `<textarea>`).
- Per-preset full prompt templates (we layer onto the shared prompt skeleton only).
- Making the LaTeX template's section order dynamic (fixed; `section_order` is advisory for the ATS check only).
- Resurrecting or using the Go/Gin `pdf-service/` (stays dead; ATS validation is Python).
- Coordinate-based (y-axis) ATS text-order validation (YAGNI for single-column; add only if a multi-column template ships).
- Onboarding flow for role selection (role is set on the Personal tab, not at signup).
- Admin UI for managing presets (presets are DB-seeded only).
- Caching/lazy-rendering template previews (static PNGs are committed).

---

## 17. Notes for Executing Agents

- **Read `CONTEXT.md` first** for the canonical definitions of Preset vs Template vs Role — do not conflate them. Role and Preset are the same concept (`Profile.preset_slug`).
- **Do commit 1 first** (the existing uncommitted visual-template work) and verify the app runs before starting commit 2. The preset feature depends on the `services/templates/` package and `template_id` plumbing from commit 1.
- **Migration is a standalone script** (`ai-service/migration.py`) using a hardcoded local connection string `postgresql://postgres:reinael123@localhost:5432/cv_tailor`. Extend it; don't replace it. Run with `python migration.py` from `ai-service/`.
- **No `/api/` prefix** in this codebase — routes mount at FastAPI root. The spec's `/api/presets` becomes `/presets`.
- **The editor is a single `<textarea>`** — do not attempt to add per-bullet placeholder fields. Prefill happens at the profile + prompt level only.
- **Metric prompts never reach the LaTeX.** They are injected into the Gemini prompt as templates-to-emulate and must be replaced with real numbers or removed by Gemini. The prompt should explicitly say so.
- **Skill merge runs ONLY on `POST /profile/save`**, not on the generate endpoint. Dedup is case-insensitive against the skills submitted in that same save.
- **ATS check uses `pdftotext` (poppler) with `pypdf` fallback.** Detect with `shutil.which("pdftotext")`. The fallback appends a "less reliable" warning.
- **Keep the lazy path**: no new abstractions, no interfaces with one implementation, no factories. The `ResumePreset` model + two endpoints + prompt injection + one ATS function is the whole feature.
- **Follow existing code style**: no comments unless asked, mimic existing router/service patterns, use the existing `inputClass`/`labelClass`/`C` color constants on the frontend.
- **Verify after each phase**: run the backend (`uvicorn main:app` or whatever the existing boot script uses), run the frontend (`npm run dev`), and manually test one preset end-to-end (set role → save → generate → ATS badge) before doing all 6.
- **Lint/typecheck**: run the project's existing lint/typecheck commands before committing. If unknown, ask the user.
- **Do not commit unless the user explicitly asks.**
