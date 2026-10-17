# Local opportunity inbox and ChatGPT plan runtime

A standalone local CRM slice: search OnlineJobs directly into SQLite, review and shortlist opportunities, save a professional profile, and qualify a selected posting with a Python Agents SDK agent. JSON imports remain available. A separate synthetic proof remains available in AI settings.

The experiment uses its own local SQLite database, no application `.env`, and no existing Codex credentials. It does not modify the legacy PostgreSQL backend or existing generation routes.

## Run on Windows

From this worktree's root, with Python 3.12 or newer:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-chatgpt-plan.ps1
```

Open <http://127.0.0.1:8010>. Use `127.0.0.1`, not `localhost`; it is also the required OAuth callback host.

1. Select **Find jobs**, enter a keyword and contract type, choose page/result limits, and start the search. Full descriptions are optional and take an extra request per listing. The scraper in `scrapers/onlinejobs_scraper.py` runs locally; there is no export/import step and no AI allowance is used. Alternatively, **Import JSON** accepts arrays or individual job objects from an existing export (10 MB/10,000 records; CSV is not supported).
2. Inspect new, refreshed, unchanged, and rejected counts, plus any errors. Search progress and cancellation remain available while reviewing leads. Already saved listings survive partial failures or cancellation. Repeated searches/imports use the posting ID to prevent duplicates, including when a title or URL slug changes; refreshed source data leaves notes and stages intact. An older full description retained during a quick search is visibly marked as potentially stale.
3. Search and page through the inbox. Jobs are always ordered by valid source posting date, newest first, before pagination. Use **Posted date** for Today, Last 7 days, Last 30 days, or an inclusive custom range (either end may be blank). Presets use your local calendar and include today. Unknown/invalid posting dates appear last for Any date and are excluded when a date bound is active. Collection time and source-update dates are never substituted for a missing posting date. Review the original posting, shortlist or skip it, and save your notes. These actions do not require AI.
4. Open **Your profile** and save actual skills, experience, services, availability, preferences, and an optional minimum rate with currency and period. The app never seeds the demo profile into your real workspace.
5. Open **AI settings**, select **Continue with ChatGPT**, and complete OpenAI's browser sign-in and consent yourself. Grant plan permission if offered and acknowledge **You're using your ChatGPT plan**. Identity-only sign-in cannot run AI.
6. Select a listing and an available model, then click **Qualify opportunity**. This sends the selected posting and saved professional profile to OpenAI and consumes your existing plan allowance. The result cites supplied facts, identifies gaps/unknowns, and remains separate from your shortlist decision.
7. Reload or restart. Listings, stages, notes, your profile, and per-opportunity assessments persist. Source/profile changes mark older assessments as stale rather than overwriting them or automatically rerunning AI.

At `/ai`, the proof sample is explicitly synthetic and kept separate from imported opportunities. Model discovery or successful sign-in does not establish inference entitlement. Each connection must complete a live run to verify inference access. No API-key fallback is implemented.

To launch without the bootstrap script after dependencies are installed:

```powershell
.\.venv\Scripts\python.exe -m experiments.chatgpt_plan.app
```

Use `--port 8011` if 8010 is occupied. Stop the server with Ctrl+C. Sign out in the UI to revoke the renewable session, or disconnect the app in ChatGPT settings.

For an existing workspace, use `--data-directory` (or the PowerShell launcher's `-DataDirectory`) to select the same `CVTailor` directory containing `local-crm-experiment` and `chatgpt-plan-spike`. This matters when switching between a packaged desktop app's environment and a regular shell, whose `LOCALAPPDATA` can differ. While the app is running, retrieve its active location:

```powershell
$crmDatabasePath = (Invoke-RestMethod http://127.0.0.1:8010/api/status).database.path
$crmDataDirectory = Split-Path (Split-Path $crmDatabasePath -Parent) -Parent
# Use this directory for the next launch after stopping the current server:
powershell -ExecutionPolicy Bypass -File .\scripts\start-chatgpt-plan.ps1 -DataDirectory $crmDataDirectory
```

## Implementation

- `auth.py`: PKCE/state/nonce, discovery and JWKS verification, saved registrations, account selection, serialized rotating-token renewal, revocation, and protected atomic storage.
- `qualification.py`: one SDK qualification agent, a shared read-only context-agent runner, structured output, citation checks, and a Responses transport adapter.
- `drafting.py`: a focused application agent with typed client needs, application paragraphs, missing facts, questions, and optional CV suggestions; local checks validate source IDs and exact original-CV quotes.
- `app.py` and `index.html`: loopback-only test UI, same-origin action protection, plan-use confirmation, model selection, cancellation, and assessment display.
- `database.py`: automatic SQLite initialization, opportunity source storage, assessment/input snapshots, restoration, and consistent backups.
- `intake.py`: OnlineJobs posting validation, canonical source URLs, posting-ID identity, and export limits.
- `crm_models.py` and `inbox.html`: saved professional profile, searchable inbox, shortlist/skip/notes, source evidence, and per-listing qualification.
- `sample.json`: synthetic fixture in the existing scraper's job field format.

Windows stores credentials using current-user DPAPI encryption at `%LOCALAPPDATA%\CVTailor\chatgpt-plan-spike\connection.dat`. On Unix, the file uses owner-only permissions under `~/.local/share/CVTailor/chatgpt-plan-spike`. Credentials stay out of the browser, source tree, and logs. Lost or ambiguous refresh responses freeze that saved token set until a fresh sign-in; they never cause a rotating token to be reused.

The transport allows only `POST https://api.openai.com/v1/responses`. It requires `store:false`, `stream:true`, and full input history; it moves flat local function tools into documented `additional_tools` input items. Unsupported fields, system messages, hosted tools, and other routes fail explicitly. OAuth is refreshed before model requests. SDK tracing is disabled; diagnostics contain only model/request metadata. Assessment output is shown only after a completed stream, a completed local tool round-trip, schema validation, and valid source references.

The interface uses real OAuth and model requests. Offline tests mock network responses, not the SDK runner. Their success does not prove account eligibility or live model compatibility.

## Local SQLite database

The database is created automatically at `%LOCALAPPDATA%\CVTailor\local-crm-experiment\crm.sqlite3` on Windows, or `~/.local/share/CVTailor/local-crm-experiment/crm.sqlite3` on Unix. Python includes SQLite; there is no database server or new package to install. Set `CVTAILOR_EXPERIMENT_DB` before launching to use another local file. Database files are ignored by Git.

Schema version 2 adds posting identity, stages, notes, last-import timestamps, and `local_profile` to version 1's `opportunities` and `qualification_runs`. Schema version 3 adds `application_drafts` with generation snapshots, editable text, optimistic edit revisions, and review status. Existing proof records and assessment snapshots survive the transactional upgrades. Original JSON fields and salary text are preserved; a snippet is explicitly incomplete and a missing employer remains unknown. Valid posting dates determine inbox order, newest first; same-day ties use collection time and record ID for stable pagination. Query-time date normalization preserves the original JSON and requires no schema migration. `last_seen_at` records a local import, not an invented crawl time. Only completed, validated assessments are saved; failed or interrupted AI requests create no assessment. Legacy PostgreSQL records have not been migrated.

Authentication tokens remain in separate DPAPI-protected storage. SQLite contains ordinary application data and is not encrypted by this experiment. Operations use foreign keys, parameterized queries, short transactions, and a five-second lock timeout. The default rollback journal is sufficient for this experiment; WAL is not enabled. No database transaction is held while waiting for AI.

Initialize the database or inspect its path, schema version, and record counts:

```powershell
.\.venv\Scripts\python.exe -m experiments.chatgpt_plan.database
```

Pass `--path "$crmDatabasePath"` to inspect or back up the active app's file explicitly when its launch environment differs from the current shell.

Create a consistent backup, even while the app is running. The destination must be a new file:

```powershell
.\.venv\Scripts\python.exe -m experiments.chatgpt_plan.database --backup "$env:LOCALAPPDATA\CVTailor\backups\crm-experiment-backup.sqlite3"
```

To inspect or restore a backup without overwriting the active database, stop the server and set `$env:CVTAILOR_EXPERIMENT_DB` to the backup's absolute path before relaunching. This selects that file as the active database; subsequent runs will write to it. Keep a separate backup copy if required.

## Draft an application

1. Open **Your profile** and save actual skills or experience. Portfolio URLs are optional. Paste original CV text only if you want suggestions grounded in its existing sections.
2. Find a listing with **Fetch full descriptions** enabled, review it, and **Shortlist** it.
3. In **Draft application**, choose a model and either **Cover letter** or **Freelancer proposal**. Acknowledged ChatGPT plan permission is required. Drafting sends the saved profile, optional CV text, and posting to OpenAI; SDK tracing stays disabled.
4. Review the client-needs brief, application text, missing facts, questions, and source references. Edit the subject/body, mark it reviewed when ready, and **Save edits**. Edits also save when switching leads/versions. Text changes clear the review checkbox; conflicting edits in another window require reloading rather than overwriting them.
5. **Export text** downloads the saved subject and application. **Generate new version** appends a generation and preserves previous edits. Nothing is submitted to a job site.

The database retains original AI output, source/profile snapshots, and current edited text separately. Sources describe the original generated text; human edits require fresh review. Source-ID validation and exact CV-quote checks reject absent evidence, but cannot prove that every prose claim accurately paraphrases its cited facts. Review remains necessary. Optional CV suggestions are plain-text recommendations, not a generated complete CV or PDF. Stale profile/posting indicators invite review or regeneration.

**Stop drafting** cancels the current AI request. Interrupted streams, invalid references, timeouts, and usage-limit failures save no partial generation. The app allows one AI run at a time; scraping can continue separately.

## Verification recorded on 2026-10-09

The user completed OpenAI sign-in and granted plan permission. A live Python Agents SDK run using `gpt-6-luna` then executed the local context tool once and completed two streamed Responses requests, both with HTTP 200. Diagnostics confirmed `store:false`, `additional_tools`, ChatGPT plan authentication, and disabled SDK tracing.

The validated assessment recommended shortlisting the synthetic opportunity, cited the supplied profile and posting, and identified undocumented n8n experience and an unknown hourly rate. This establishes the selected model's live tool round-trip and structured output through the adapter. It does not establish compatibility for every discovered model, production CRM integration, or live token renewal. Authentication, failure paths, and SQLite persistence are covered by 29 passing offline tests.

After SQLite was added, another live `gpt-6-luna` assessment saved one source opportunity and one completed assessment/input snapshot. Restarting the server and reopening the page restored the same saved result and timestamp, with the counts unchanged and no new inference request.

The inbox then imported all 35 records from the existing `part-time-jobs.json` export. Reimport reported 35 unchanged and no duplicates. Browser checks confirmed a saved shortlist and note survived reimport, and skip/return-to-inbox worked; temporary test decisions and notes were reset. Forty tests cover the runtime, migration, import, state preservation, profile validation, and an actual SDK tool round-trip over mocked network responses with explicitly supplied imported context. Qualification against the user's real profile remains for the user to run after entering their professional facts. No real profile was invented or submitted during implementation.

Browser verification of the integrated scraper completed a one-page, three-result part-time search for `automation`: three new listings were saved directly to SQLite with no errors. A second one-result search with full descriptions enabled refreshed the existing posting instead of creating a duplicate. The saved full description (3,838 characters) and source update date were displayed in the inbox. All 63 offline tests passed. The original Job Scraper project and main checkout were not modified by this integration.

Posting-date filtering and ordering add four checks for sorting before pagination, late imports of older postings, invalid/missing dates, inclusive bounds combined with stages/search, and API validation. The 32 relevant inbox/database/worker tests passed. Browser checks confirmed newest-first ordering, Today (16 current postings), the inclusive October 7–8 range (14 postings), return to page one after a filter change, and correction of an invalid range without leaving a stale error.

Application drafting adds 13 checks covering the actual SDK tool round-trip over mocked network responses, invalid/misclassified citations, exact original-CV quotes, placeholders, append-only generation history, edit conflicts, schema-2 migration, exports, source staleness, prerequisites, cancellation, and failures. All 80 offline checks passed. An isolated browser fixture verified editing/review, autosave across versions, generation of a new proposal version, reload persistence, and download of the saved edits. No fixture facts were added to the real workspace. The running database was backed up before upgrading to schema 3; its 100 real listings and existing proof assessment were retained. Live personalized drafting remains pending identification of the user's original saved profile; the local profile is empty.

## Verify offline

The scraper integration adds 23 offline checks for the retained parsers, crawl policy/pacing, retries, pagination/filtering, cancellation, partial results, SQLite persistence, and CSRF-protected worker endpoints. The worker has no AI or account dependency. Run state lasts for the current server process; SQLite records persist. See [scraper details](../../scrapers/README.md).

```powershell
.\.venv\Scripts\python.exe -m unittest experiments.chatgpt_plan.test_spike experiments.chatgpt_plan.test_database experiments.chatgpt_plan.test_inbox experiments.chatgpt_plan.test_drafting experiments.chatgpt_plan.test_scraping scrapers.tests.test_onlinejobs -v
```

## References

- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)
- [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk)
