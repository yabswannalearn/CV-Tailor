# Career Agent feature tracker

**Status:** Implemented; deployment migration and full live browser verification remain.

**Last updated:** 2026-10-28

**Reference:** [NextRole](https://github.com/tam159/next-role) · [Google Agent Development Kit](https://adk.dev/) · [Project glossary](../../CONTEXT.md)

## Goal

Add a conversational career assistant that can research an employer, prepare grounded application materials, and help users prepare for interviews. The existing Generate CV button, cover-letter generation, tracker, resume editor, interview practice, and other features remain available independently.

The agent uses Google ADK for Python and Gemini in the existing FastAPI service. Begin with one agent and focused tools; add specialist agents only when needed. Keep the current email-and-password login and leave the existing OpenAI provider integration in place for now. No autonomous applications or employer messages are in scope.

## Current state

- The repository already has saved profiles, role presets, job tracking, CV generation, PDF compilation, ATS checks, spot edits, cover letters, and interview practice.
- The preliminary custom router has been replaced with an ADK agent, persistent conversations, versioned drafts, and tool integrations. Finish the checks below before treating the feature as complete.
- Existing skills did not record whether they were entered by the user or added by a preset. The profile now supports review and confirmation, with legacy skills treated as unconfirmed.
- Offer-linked resumes remain available for context and phrasing but do not independently establish personal facts. The shared cover-letter prompt now uses the user's profile rather than a hard-coded portfolio URL.

## Intended experience

1. The user opens a new Career Agent tab and selects an application or starts a general conversation. A general conversation can use a pasted job description before the user saves it to the tracker.
2. An application conversation uses the signed-in user's profile and selected job. The user can ask for company research, a tailored CV or cover letter, interview preparation, or a cheat sheet.
3. The agent chooses appropriate tools and asks for missing context. Company research is performed on request or suggested when useful, and prior research can be reused.
4. Outputs are saved as reviewable drafts in the conversation. The user can refine them, open a CV in the existing editor, and explicitly apply a CV or cover letter to the application. Previous versions remain available.
5. Conversations and their associated research and drafts persist until the user deletes the conversation or its application. An application conversation can be deleted independently of the application.

## Milestones and acceptance checks

### 1. Shared evidence and skill confirmation

- [x] Add a one-time review for existing skills whose origin is unknown; treat them as unconfirmed for agent-generated documents until the user confirms them.
- [x] Change preset suggestions so newly suggested skills are not silently treated as confirmed skills.
- [x] Define a shared personal-evidence boundary using saved profile facts and facts the user explicitly supplies in the current conversation.
- [x] Allow conversation facts in that conversation without silently updating the saved profile; offer a separate user action to add them to the profile.
- [x] Prevent offer-linked historical resumes from independently establishing personal facts; retain their permitted use as context or phrasing.
- [ ] When a requirement lacks evidence, leave the claim out and optionally ask the user for relevant experience. Never invent achievements, skills, dates, metrics, or stories.

**Acceptance:** An unconfirmed preset skill and an unsupported claim from a previous resume do not appear as facts in an agent-produced CV or letter. A user-provided fact can be used in the conversation without changing the saved profile. Existing users can review their skills without losing them.

### 2. Agent foundation and conversations

- [x] Review the preliminary prototype and replace its custom routing with an ADK agent using Gemini; reuse suitable components where they fit the agreed behavior.
- [x] Add a Career Agent navigation tab with an application selector and a general conversation.
- [x] Persist one ongoing conversation per tracked application and preserve general conversations; scope access to the signed-in user.
- [x] Automatically provide the user's profile and selected application as context. Support pasted job descriptions in general chat and offer to save them to the tracker.
- [x] Support deleting an application conversation independently, and delete associated conversations and their research and drafts when their application is deleted.
- [x] Handle missing profiles, missing job descriptions, provider errors, and unavailable tools clearly in the interface.

**Acceptance:** A user can leave and reopen an application conversation with its history intact; another user cannot access it. Starting a general conversation does not require a saved job. Existing standalone pages still work.

### 3. Research and job context tools

- [x] Connect an ADK tool to the existing tracked-job context and job-description extraction capability; support user-supplied descriptions and URLs.
- [x] Add live company and role research with visible source links, prioritizing official company and job pages and supplementing with credible independent sources.
- [x] Distinguish sourced facts from inference and report when research or sources are unavailable.
- [x] Research on request or suggest it when useful; do not automatically research for every document. Reuse existing research in the conversation where appropriate.
- [ ] Treat job pages and research content as untrusted data and preserve user-scoped access for all tools.

**Acceptance:** A request to research a company returns relevant linked sources, handles an inaccessible source honestly, and does not treat content from a webpage as an instruction to the agent.

### 4. Grounded cover letters

- [x] Improve the existing shared cover-letter feature to tailor to the job description using the user's real profile, including their actual contact and portfolio details.
- [x] Connect the shared capability as an ADK tool, including conversation evidence and relevant sourced company research when appropriate.
- [x] Check drafts for unsupported personal claims and present uncertainty for review; do not promise that automated verification is infallible.
- [x] Support follow-up revisions, reviewable draft versions, and explicit application to the tracked job.

**Acceptance:** Given a job asking for leadership and no supporting user evidence, the letter does not claim leadership experience. If the user provides a relevant fact in chat, a revision can use it without modifying the profile. The standalone cover-letter flow receives the same grounding improvements.

### 5. CV generation and focused edits

- [x] Connect the existing CV generation and editor flows as ADK tools without removing or changing the availability of Generate CV.
- [x] Reuse or improve existing block-based Spot Edit behavior for targeted chat revisions so a request to change the summary preserves the rest of the CV.
- [x] Keep AI-generated content in plain text and use the existing LaTeX assembly and editing path.
- [x] Provide PDF preview and ATS checks through existing capabilities. Preserve the one-page rule, visibly report overflow, and help the user resolve it.
- [x] Open an agent-created CV as a draft in the editor and apply it to the application only on the user's explicit action; retain previous versions.

**Acceptance:** Generating from the button still works. Generating from chat opens an editable draft. A request to shorten only the summary leaves all other blocks unchanged. Overflow is visible and is not accepted as a valid generated one-page CV.

### 6. Interview preparation and cheat sheet

- [x] Create a preparation plan using the job, profile, relevant sourced research, and confirmed user-provided evidence.
- [x] Ask for interview date or available preparation time when useful; allow the user to skip it and receive a general plan.
- [x] Include likely questions and talking points without inventing personal stories; connect to the existing interview-practice feature where useful.
- [x] Create a concise editable interview-day cheat sheet in the app with PDF export.
- [x] Save plans and cheat sheets as versioned application drafts and support chat revisions.

**Acceptance:** A user can request a plan for a specific timeline or skip the timeline, revise the result in chat, and export an editable cheat sheet to PDF. Unsupported personal stories are not presented as fact.

### 7. Agent actions

- [x] Remove the credit system and allow requested research, generation, and revision actions without a balance or paid-action opt-in.
- [x] Preserve action failure rollback and message retry deduplication.

**Acceptance:** A user can request an agent action even if their legacy balance was zero. A failed action does not leave a partial draft, and retrying a message does not repeat a completed action.

### 8. End-to-end verification and release readiness

- [ ] Test tool selection and multi-turn requests using representative user conversations, including missing information and provider failures.
- [ ] Test cross-user isolation for profile, job, conversations, research, and drafts; test independent deletion and application deletion.
- [ ] Test skill confirmation, unsupported facts, prior-resume evidence, source links, targeted revisions, version restoration, and action retry behavior.
- [ ] Test the existing Generate CV, editor, cover-letter, tracker, ATS, and interview-practice workflows for regressions.
- [x] Verify the Career Agent interface on desktop and mobile, including accessibility and error states. A mocked browser smoke test covered both layouts and failed-message recovery.
- [ ] Document ADK/Gemini configuration, research-provider requirements, migrations, and any deployment steps. Verify live provider integration separately from mocked tests.

**Acceptance:** The agreed conversation-to-research-to-draft workflow works end to end with a configured provider, and the existing standalone features remain usable.

**Verification so far:** Backend unit and integration tests, frontend type checking, lint, resume-editor tests, and tracker tests pass. Live Gemini smoke tests covered ADK chat, research with sources, and a synthetic grounded cover-letter draft. A desktop/mobile browser smoke test used mocked API responses; the complete browser-to-provider workflow and deployment migration have not yet been exercised.

## Dependencies and sequencing

- Skill confirmation and personal-evidence rules are prerequisites for grounded documents and interview materials.
- Persistent conversations and draft versioning are prerequisites for returning to an application and restoring older drafts.
- Shared CV and cover-letter improvements should be available to both the standalone features and agent tools.
- Research, CVs, cover letters, interview preparation, and cheat sheets are all part of the first release; they can be implemented in separate milestones.
- Confirm the chosen ADK-compatible research setup and its credentials during implementation. The current prototype's direct Gemini search is not evidence that the complete ADK tool integration is finished.

## Out of scope for the first release

- Automatically applying for jobs, sending emails, or contacting employers.
- Removing the existing OpenAI provider integration or replacing the current application login.
- Replacing existing standalone features with chat-only workflows.
