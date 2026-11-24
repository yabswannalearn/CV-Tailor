# CV Tailor

A single-user, local career workspace: an agent-friendly Python CLI, SQLite, and an optional static Next.js dashboard served by FastAPI on localhost. The public domain hosts the standalone landing page only.

## Local architecture

- CLI-only is the default installation; the dashboard and API AI are optional extras.
- `~/.cv-tailor` holds the default database and workspace configuration; `--data-dir` / `CV_TAILOR_HOME` chooses another workspace.
- One workspace/profile replaces hosted accounts. There is no registration, password, session cookie, or admin user management.
- CLI and HTTP adapters share services in the `cv_tailor` package. The CLI never requires a web server or Node.js.
- SQLite uses foreign keys, WAL, short write transactions, request receipts for idempotent creates/imports, and revision checks for edits. Slow external work runs outside write transactions.
- External-agent mode is the default. Skills export context and output schemas, then import typed results. API calls require `AI_MODE=api` and suitable optional dependencies/keys.
- Job discovery uses a shared source registry for CLI, HTTP, and agent callers. LinkedIn, JobStreet PH, and Indeed PH/US have dedicated public-page helpers under `services/job_sources`, with shared robots checks and request pacing. Source failures and partial results remain distinct from empty searches; unknown listing fields remain unknown. Job discovery does not automatically create tracked applications.
- The experimental `jobstreet-json` source is explicitly selected and excluded from default scans. It reads the PH website JSON search endpoint without credentials, separately from the HTML collector's robots stop; the site's robots rules disallow this API path. Search previews are not full job descriptions. See `docs/job_sources.md` for the access-policy distinction and current limitations.
- The experimental `linkedin-guest` source likewise requires explicit selection. It reads guest search and description endpoints without account sessions, outside the normal LinkedIn helper's robots stop. Results can include unrelated recommendations, and remote-only filtering is unavailable; Discover shows this limitation. Requests are sequential and stop on access refusals or rate limits.
- Optional application browser automation (`[automation]`) adds a native local sign-in wizard and agent-independent stdio MCP tools for Brave, Edge, Chrome, Chromium, Firefox and WebKit. The wizard's Connect action (also `browser connect`) saves project-local AI app configuration without manual JSON editing; it preserves existing entries and never edits global agent configuration. Per-site/browser profiles live outside SQLite under the workspace's `browser/` directory. Passwords are entered directly in the browser, never supplied to the agent. The adapter exposes native application operations without arbitrary JavaScript, screenshots or session export. This interface is not OS isolation from unrestricted same-user agents; final consent/submission remain user actions. See `docs/browser_setup.md`.
- The optional dashboard is a static export served by FastAPI; HTTP endpoints are under `/api`. The server accepts local connections and same-origin browser requests only.
- Public landing assets are built independently from `landing/`; the application is not hosted.
- Fresh workspaces are supported; legacy PostgreSQL/account migration is deferred.
- SQLite workspace preferences store a default resume template, preferred tracking provider and nonsecret setup-file reference, revision, and stable workspace UUID. CLI status/context and the local dashboard load them. Changing a default does not rewrite existing applications; credentials remain in the Git-ignored environment file. Existing profile template defaults remain compatible.
- Calendar setup is agent-guided through `cv-calendar`, like tracking connections. Workspace preferences keep a separate `calendar_connections` list (Google Calendar and Outlook, one setup reference per provider), so both can coexist with a tracking connection. Publishing is one-way and manual. Follow-up dates come from SQLite; interview/deadline schedules confirmed by the user live in nonsecret connection event plans. There is no built-in calendar sync worker or interview scheduling table.
- Portfolio generation is agent-guided through `cv-portfolio`. Generated portfolios live outside the CV Tailor repository, default to static export, and bundle the curated **Portfolio Designs** behind one **Portfolio Config** for the built-in React stacks so users can switch designs and re-sync profile updates safely. Workspace preferences store an optional nonsecret `portfolio_preference` (active design, stack, optional deploy provider, and local project directory) that can be changed anytime; the live deployed URL is saved to `Profile.portfolio` only after user confirmation. Hosting login, deployment, and optional custom domain verification run through a user-executed **Deploy Wizard**, never through agent-held credentials.

## Language

**Application Conversation**:
A conversation with the Career Agent focused on one tracked application, bringing together its job context, research, document drafts, and interview preparation. Each application has one ongoing conversation, which the user can delete independently of the application.

**General Conversation**:
A conversation with the Career Agent that is not tied to a tracked application. A job description supplied there can be used before the user saves it as a tracked application.

**Job Intake**:
The information the Career Agent gathers about a job, including its title, description, and Job Source, before adding it to the tracker. The agent may ask for additional information, may use a user-reviewed description extracted from a supplied link, and allows an unknown Job Source.

**Job Source**:
Where the user found a job, such as a job board or a referral. It may be unknown and is distinct from the job posting's URL.

**Suggested Message**:
A context-specific message offered by the Career Agent for the user to place in the chat composer, review, and send. For example, a cover-letter conversation may offer to add the job to the tracker.

**Confirmed Skill**:
A skill the user has affirmed they possess. A preset's suggested skill is not a Confirmed Skill until the user confirms it, and existing skills of unknown origin require user review.

**Conversation Evidence**:
A personal fact the user provides in a conversation for use in that conversation. It does not become part of the saved profile unless the user chooses to add it.

**Tailored Cover Letter**:
A cover letter that relates a user's actual experience and confirmed skills to a specific job description without inventing personal facts, achievements, or stories. It may use the saved profile and Conversation Evidence.

**Application Draft**:
A reviewable version of a CV, cover letter, interview preparation plan, or interview cheat sheet associated with an Application Conversation. Earlier versions remain available; applying a CV or cover letter draft makes it the current application document without discarding earlier versions.

**Application Form Checkpoint**:
A versioned `application_form` draft holding a live form's questions, proposed answers, reported observations, field constraints and selected document fingerprints. It belongs to one tracked application and one form session. Its derived state is drafted, partially filled, verified for review, or submission confirmed. The user's local agent supplies browser access; the CLI validates reported observations without independently controlling a browser. A checkpoint is never sent to an employer by CV Tailor. Only the user's explicit submission confirmation records Applied.

Application preparation drafts complete answers from the `forms prepare` context before entering a known form. That response includes an optional website-guide reference, initially for canonical OnlineJobs posting URLs. Guides supply navigation/field hints; fresh inventory and readback still establish live state. Routine filling uses one before-fill checkpoint and one revision after verification, with additional checkpoints for steps or interruptions. Confirmed facts retain their profile/application scope.

**Personal Evidence**:
Personal facts supported by the user's saved profile or Conversation Evidence. Earlier resumes may inform context or phrasing but do not independently establish Personal Evidence.

**Job Fit Analysis**:
An evidence-based assessment of how a user's Personal Evidence relates to a specific job's requirements, whether the job is saved in the tracker or supplied in a General Conversation. It highlights supported matches, uncertain areas, and known gaps without an overall numerical score or an apply-or-skip verdict.
_Avoid_: match score, ATS score

**Requirement Assessment**:
The part of a Job Fit Analysis that relates one job requirement to Personal Evidence and labels it supported, needing clarification, or a known gap. The requirement's importance is required, preferred, or unclear, supported by the job's wording; missing evidence alone is not a known gap.

**Practical Constraint**:
A job condition such as location, work authorization, salary, or working hours, considered separately from qualifications in a Job Fit Analysis. Its compatibility is uncertain when the relevant job condition or user's preference is unknown.

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
Post-compile validation (`ai-service/cv_tailor/services/ats_check.py`) that extracts text from the generated PDF and verifies (a) section headings appear in the preset's stated order, (b) text is selectable (not image-based), (c) ATS-conventional headings are present. Returns `{pass, warnings}`. Surfaced as a badge in the generate page.
_Avoid_: ATS score, resume grader (use ATS Check).

**One-page rule**:
Every generated resume must fit on exactly one page, including a resume revised through the Career Agent. A resume that spills onto a second page is not a valid generated result; the user is shown the overflow and can resolve it.

**Block**:
The smallest independently regenerable piece of a resume: one summary, one bullet, one entry heading, one skills row, one certifications line. Blocks are derived from the generated LaTeX, each has a stable address, and they have a single document order. Distinct from **Section** (`\section{...}` — Summary, Education, Experience, Projects, Technical Skills, Certifications), which *contains* Blocks.
_Avoid_: node, element, region, chunk, segment.

**Spot Edit**:
A user-initiated rewrite of one or more Blocks driven by a free-text instruction ("make this more metric-heavy"). The user selects text in the PDF preview, the selection resolves to Blocks, the instruction applies to those Blocks only, and every other Block is left byte-identical. A Spot Edit spans a contiguous run of Blocks within one Section — never across Sections.
_Avoid_: annotation, markup, comment, highlight, patch, inline edit.

**No-invention rule**:
A Spot Edit may reframe, re-emphasise, re-order or re-word what the user's profile already contains, but must never introduce a fact — above all a number — that is absent from the profile. When an instruction asks for data the profile does not hold, the rewrite proceeds on intent alone and reports that the data was unavailable. Placeholder markers such as `[X]` never reach a Block, consistent with **Metric Prompts**.

**Portfolio Design**:
One of the six curated visual foundations (`editorial`, `bento`, `technical`, `case-study`, `executive`, `bold-studio`) used to render a generated web portfolio. Orthogonal to resume **Template** and stored as the user's changeable default in workspace preferences.
_Avoid_: portfolio template, skin, theme, format.

**Portfolio Config**:
The single structured file inside a generated web portfolio holding the user's grounded public profile content, section order and visibility, color mode/accent options, and active **Portfolio Design**. Separates re-syncable data and layout choices from design components.

**Deploy Wizard**:
A standalone, user-executed local script generated by the agent inside a portfolio project to guide static hosting setup (Vercel or Cloudflare Pages), deployment, and optional custom domain DNS verification without exposing credentials to the agent or SQLite.

## Architectural constraints

- **Execution mode is explicit.** Trusted single-user development can use `EXECUTION_BACKEND=local` with native Python and Tectonic/XeLaTeX, bound to loopback. It runs with the developer's OS permissions and is not a sandbox. Hosted deployments use `EXECUTION_BACKEND=docker`; native mode is rejected outside `ENVIRONMENT=development`. Neither mode silently falls back to the other.
- **PDF compilation is Python + Tectonic** (`ai-service/cv_tailor/services/pdf_service.py`), invoked directly from FastAPI. The `pdf-service/` Go/Gin app is dead code (nothing calls port 8081) and is not used. ATS validation is Python (`ai-service/cv_tailor/services/ats_check.py`), not Go.
- **The resume editor has three modes over one source of truth** (`frontend/src/app/(workspace)/generate/page.tsx`): a structured field form ("Edit"), a PDF preview, and a raw LaTeX editor ("LaTeX"). The LaTeX string is the single source of truth; the structured form is a parsed projection of it (`frontend/src/lib/resumeDraft.ts`) that writes edits back into the LaTeX surgically. Preset prefill happens at the profile + prompt level, never as UI placeholder fields.
- **The AI never emits LaTeX.** Gemini returns plain-text JSON; `services/latex_assembly.py` builds every LaTeX construct. This holds for Spot Edits too — a Spot Edit returns replacement plain text for a Block, never markup. It is what makes an AI rewrite structurally incapable of breaking compilation.
- **Routes mount under `/api` in the local launcher.** The presets endpoint is `/api/presets`. Existing routers: `/generate`, `/profile`, `/auth`, `/tracker`, `/code`, `/interview`.
- **SQLite initialization is automatic and versioned.** `cv-tailor init` creates the schema and seeds; schema upgrades back up the workspace first.

## Flagged ambiguities

- **"Template"** is overloaded in the broader LaTeX world (a `.tex` file is a "template"). In CV Tailor, **Template = Visual Template** (classic/modern skin). The `.tex` skeleton strings are the implementation of a Template, not a separate concept. When you mean the content/role configuration, say **Preset**.
- **"Role" vs "Preset"** — same thing. Do not model them as separate fields; both map to `Profile.preset_slug`.
- **"Annotation"** is already taken by the PDF specification — react-pdf's `renderAnnotationLayer` means embedded PDF objects such as hyperlinks, and the generate page disables it. The user-facing act of selecting resume text and asking for a rewrite is a **Spot Edit**, never an annotation.
- Existing profile skills do not record whether they were entered by the user or suggested by a preset. They need user review before being treated as **Confirmed Skills** for the Career Agent.
- **"Template" vs "Portfolio Design"** — **Template** applies exclusively to resume LaTeX skins; web portfolio foundations are always **Portfolio Designs**.
- **Public portfolio privacy** — a user's saved profile contains private contact details (`mobile_no`) and potentially unconfirmed skills. Neither is published to a generated web portfolio by default; public email and downloadable resume PDFs require explicit user opt-in.

## Example dialogue

**Dev**: "I'm adding a new role — Data Analyst. Where does it go?"
**Domain expert**: "Add a Preset row with slug `data-analyst`. The user picks it as their Role on the Personal tab; it'll also show in the generate Preset picker. No code changes — just the DB seed."

**Dev**: "Should the Data Analyst resume use the modern skin?"
**Domain expert**: "Set `recommended_template` to `modern` on the preset. The Template picker will highlight it, but the user can still pick classic — Template and Preset are independent."

**Dev**: "The metric prompt has `[X]` — does that show in the resume?"
**Domain expert**: "Never. Metric Prompts only steer Gemini. They're injected into the prompt as templates-to-emulate; Gemini replaces `[X]` with real numbers or drops it. They never reach the LaTeX."

**Dev**: "The user mentions managing five people in an Application Conversation. Can the cover letter use that?"
**Domain expert**: "Yes, as Conversation Evidence. Ask before adding it to their saved profile."

**Dev**: "The job requires CRM experience, but the profile doesn't mention it. Is that a known gap?"
**Domain expert**: "No. The Requirement Assessment needs clarification; ask the user, and only use their answer in that conversation unless they add it to their profile."

**Dev**: "The user wants to switch their portfolio from `editorial` to `bento` and deploy to Cloudflare Pages. Should the agent re-scaffold and run `wrangler`?"
**Domain expert**: "No. Update the active **Portfolio Design** in **Portfolio Config** and workspace preferences without overwriting custom edits, then generate or refresh the **Deploy Wizard** so the user runs login, deployment, and any custom domain DNS check locally."

**Dev**: "Can the generated portfolio pull the user's phone number and full skills list straight from their profile?"
**Domain expert**: "No. Omit `mobile_no` and unconfirmed skills by default, ask before publishing email or linking a resume PDF, and never invent bios, links, or project metrics."
