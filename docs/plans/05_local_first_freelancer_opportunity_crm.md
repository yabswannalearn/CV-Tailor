# Local-first freelancer opportunity CRM

Date: 2026-10-09

Status: Phase 0 and the first inbox slice of phases 2–3 are implemented in `codex/local-first-crm`. The local app supports OnlineJobs JSON import, duplicate-safe refreshes, shortlist/skip/notes, a saved professional profile, and per-listing qualification. Full legacy runtime integration and phases 4–6 remain to be built.

## First outcome

The user can import an OnlineJobs.ph opportunity, understand why it fits or does not fit, shortlist it, prepare a grounded CV and cover letter, and track the application and its next follow-up from a local browser app.

Measure success by useful shortlisted opportunities, reviewed applications, replies, and won work. Raw listing volume is an intake diagnostic, not the product's success measure.

## Product shape

The initial navigation centers on the opportunity inbox, pipeline, profile/preferences, and AI settings. Existing generation tools are accessible from an opportunity.

The proposed domain concepts are:

| Concept | Purpose |
| --- | --- |
| Opportunity | A specific piece of potential work, initially an advertised OnlineJobs.ph job or contract. |
| Client | The business associated with one or more opportunities, when its identity is known. |
| Activity | A dated note, application, reply, discussion, or follow-up associated with an opportunity. |
| Application package | The reviewed CV, cover letter, and any requested application answers for an opportunity. |

These concepts guide the design; they are not existing database tables. Contact records and cold prospecting are deferred until a source supplies reliable client/contact information. Missing employer names remain unknown rather than being treated as verified clients.

Proposed pipeline: Shortlisted, Preparing, Applied/Contacted, Replied, Discussion, Won, Lost. Discovered listings enter the inbox before shortlisting. Draft generation does not automatically mean an application was submitted.

## Implementation sequence

### 0. Prove the selected AI runtime

The user chose Agents SDK workflows backed by separately authorized ChatGPT plan usage. Verify this integration before changing the CRM schema or generation flow.

- Build an isolated local compatibility spike that does not require the production database or modify existing generation routes.
- Use official Sign in with ChatGPT registration and protected credential storage; do not import this Codex chat's credentials.
- Discover models for the selected connection and complete one eligible streamed Responses request.
- Run one Python Agents SDK qualification agent with a local read-only tool that supplies a sample profile and OnlineJobs opportunity.
- Return a structured qualification result with fit evidence, gaps, unknowns, and a suggested next action.
- Apply the documented plan-usage request/tool contract in the model adapter. Verify that a tool call and its continuation complete, rather than assuming SDK defaults are compatible.
- Keep verification traces local unless a separate, supported tracing configuration is explicitly selected.
- Handle declined permission, token renewal, interrupted streams, and usage limits. Do not silently fall back to API billing.

Acceptance: the user explicitly authorizes the local app; one SDK run uses that connection, executes a local tool, and returns a completed, validated qualification result. Document any unsupported features or required adapter behavior. Offline checks alone do not establish plan access.

Completed: [runtime experiment](../../experiments/chatgpt_plan/README.md). The user granted plan access, and `gpt-6-luna` executed one local context tool call and completed two streamed model requests with a validated, evidence-backed qualification. The adapter uses full input history, `store:false`, `stream:true`, and `additional_tools`; SDK tracing is disabled. Twenty offline tests cover authentication, renewal, request compatibility, and failure handling. Live renewal and other models remain unverified.

### 1. Establish a reliable local runtime

- Verify local Next.js, FastAPI, Tectonic, and SQLite setup and document a reproducible launch flow. [ADR-0003](../adr/0003-sqlite-for-local-experiment.md) updates the database choice; legacy PostgreSQL routes need compatibility work before reuse.
- Keep local runtime configuration separate from any hosted configuration; do not copy or migrate remote data implicitly.
- Provide a clear local database and generated-document backup procedure.
- Choose a simple local user/profile flow before changing the existing registration and session behavior.

Acceptance: the app starts against an explicitly configured local database, loads a profile, and can save/reload tracker data.

Completed foundation: the standalone app automatically creates/upgrades SQLite, saves a local professional profile and opportunity state, persists assessments with input snapshots, and supplies a consistent backup command. It remains separate from legacy PostgreSQL registration, tracker data, and document-generation routes.

### 2. Import the existing OnlineJobs export

- Accept JSON exported by `D:/vscode/Personal/Job Scraper`.
- Map `jobUrl`, `jobTitle`, `employerName`, `employmentType`, `salary`, `datePosted`, `dateUpdated`, `descriptionSnippet`, `fullDescription`, and `skills` into the intake module.
- Preserve source identity, source URL, collection time, and original evidence. Salary remains original text until currency, amount, and period can be established reliably.
- Make imports idempotent within the local workspace using the source and canonical posting identifier/URL. Reimport updates source evidence without overwriting user notes, pipeline stages, or reviewed application documents.
- Preserve missing values. A snippet is not a complete description, and a missing employer name is not a confirmed client identity.
- Show imported, updated, skipped, and failed counts with actionable validation errors.

Acceptance: importing the same export twice creates no duplicate opportunities; user edits survive a refresh; malformed records are reported clearly.

Completed: the inbox imported the existing 35-listing export, then reported all 35 unchanged on reimport. Identity uses the OnlineJobs posting ID, with canonical URLs and original JSON retained. Validation errors identify rows and fields; imports preserve saved notes/stages. Search, stage views, pagination, original links, missing-employer indicators, and incomplete-description indicators are available.

### 3. Qualify and shortlist

- Extend profile preferences with services offered, availability, acceptable contract types, target industries, and a minimum rate with currency and period.
- Apply explicit filters in code where source data supports them.
- Use AI to explain relevant experience, requirement gaps, and unknowns with references to the posting and profile.
- Show incomplete evidence and uncertain budget comparisons clearly. The user chooses whether to shortlist.

Acceptance: qualification explains its recommendation using real evidence and can abstain when information is insufficient.

Implemented: a local profile form stores professional facts, contract preferences, industries, availability, and an optional rate with currency/period. A selected listing is qualified through the proven SDK transport, with deterministic contract/incomplete-description checks, grounded citations, saved snapshots, and stale-result indicators after profile/source changes. AI recommendations do not move stages. Tests exercise the actual SDK with imported context over mocked network responses. The user must enter their own facts before a live personalized qualification; demo facts are never substituted.

### 4. Prepare the application

- Reuse the current profile, Presets, Templates, CV assembly, PDF preview, ATS Check, and cover-letter generation.
- Require sufficient posting evidence before tailoring; fetch or let the user supply a complete description when needed.
- Draw portfolio links and other personal facts from the profile.
- Keep saved documents associated with their opportunity and record the source/profile context used for generation.
- Let the user review, edit, and export the package before manually submitting it.

Acceptance: one imported opportunity produces an editable, grounded application package, and the CV satisfies existing document constraints.

First drafting slice implemented: shortlisted leads with a full description and saved professional facts can generate a client-needs brief, cover letter or freelancer proposal, missing-fact notes, and questions to confirm. A focused Python Agents SDK agent uses the existing ChatGPT plan adapter. Exact source references are validated before saving; original CV text, when supplied, enables suggested section wording anchored to exact quotes. SQLite schema 3 appends generations and preserves earlier human edits. The browser supports version selection, local editing, review status, text export, and stale-source warnings. Cancellation, timeouts, invalid references, and failed requests save no partial draft. Eighty offline tests and isolated browser checks cover this slice. Live personalized generation awaits identification of the user's saved profile; the local profile is currently empty. Reusing legacy Presets/Templates and producing a complete CV/PDF package remains future work.

### 5. Track the relationship and outcome

- Evolve the existing tracker toward the proposed freelancer pipeline without discarding historical application data.
- Add dated activities, next follow-up date, and a useful reason for won/lost outcomes.
- Track actual submission separately from preparation.

Acceptance: an opportunity moves through the pipeline with a visible history and next action, and retains its application documents.

### 6. Integrate scraper execution

- Invoke the existing scraper from a local worker after JSON intake is reliable.
- Reuse the same intake module for imported files and worker output.
- Surface progress, cancellation, partial results, and scraper failures. Long crawls must not block normal CRM interactions.
- Add saved searches and optional scheduling once manual runs are useful. Explain that scheduled local searches require the computer and worker to be running.

Acceptance: a search run supplies the same duplicate-safe intake as JSON import and clearly reports partial or failed runs.

Implemented manual execution: `scrapers/onlinejobs_scraper.py` retains the existing parser and adds native filters, result limits, strict layout detection, crawl-rule enforcement, pacing/retries, and cancellation. The local inbox's Find jobs form starts a single background worker that saves incrementally through the existing SQLite intake. Progress, counts, partial failures, and cancellation are visible; reviewing and editing leads remain available during searches. Quick refreshes preserve earlier full descriptions with a visible stale-evidence marker. Search run state is in memory; opportunity records persist. Saved searches, durable search history, and scheduling remain future work.

## AI integration checkpoint

Run a small compatibility spike before adopting ChatGPT plan usage as the primary AI path:

1. Complete official sign-in and distinguish identity from granted plan-usage permission.
2. Discover models for the selected connection and complete one eligible streamed Responses request.
3. Verify an Agents SDK qualification workflow under the documented request constraints, including local tool calls if used.
4. Verify token renewal, declined permission, interrupted responses, and usage-limit recovery without silently switching billing paths.

Keep authentication/transport inside the AI module. Introduce qualification and drafting workflows only as needed; scraping and CRM persistence remain deterministic tools. Eligibility and a completed inference request must be verified, not inferred from a successful login.

## Decisions still to resolve

- Local profile access: retain the existing local sign-in or introduce a dedicated single-profile mode.
- CRM schema transition: map existing `JobApplication` records into opportunities and preserve existing status/history semantics.
- Document history: determine the first required level of versioning for regenerated applications.
- Distribution: begin with the development launch flow; choose packaging once the end-to-end workflow is validated.

## References

- [Accepted local-first direction](../adr/0002-local-first-freelancer-opportunity-crm.md)
- Existing discovery/import: `ai-service/routers/scraper_routes.py`
- Existing tracker model: `ai-service/models/database_models.py`
- Existing tracker generation: `ai-service/routers/tracker_routes.py`
- Existing AI provider seam: `ai-service/services/llm_service.py`
- [Official Sign in with ChatGPT integration guide](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [Plan usage request limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
