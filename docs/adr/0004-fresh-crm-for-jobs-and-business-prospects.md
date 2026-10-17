# Rebuild the local CRM around jobs and business prospects

Date: 2026-10-11

Status: Accepted product scope; implementation architecture is proposed.

## Context

The user wants Tavily for lead generation and a fresh version of the project. They selected both job opportunities and direct business leads for the first working version, with shared qualification and drafting. This updates ADR-0002, which deferred business prospecting.

The existing local experiment has working OnlineJobs intake, SQLite persistence, a saved professional profile, qualification, and application drafting. These provide behavior to preserve and reusable integrations. The original application also has separate resume/PDF functionality. A fresh application is a new implementation, not an instruction to discard saved information or reset the original checkout.

## Decision

The first working version supports two lead kinds:

- A job opportunity has an advertised role or contract, with requirements taken from its posting.
- A business prospect is an organization the user might offer services to. A discovered website or inferred service opportunity does not establish that the organization is hiring or has approved a budget.

Both kinds use discovery, evidence collection, duplicate-safe intake, qualification, shortlisting, grounded drafting, and manual review. Job opportunities produce applications and cover letters; business prospects produce outreach drafts and proposals appropriate to their available evidence.

Use Tavily as the initial general-web discovery and extraction provider, alongside the existing OnlineJobs scraper. Choose additional crawling providers when concrete source requirements justify them.

Keep the application local first. Remote discovery and AI requests still require internet access. A new application directory in the current managed worktree and a separate database allow development without changing the running experiment or main checkout. Move existing data through a backed-up, repeatable import with verification rather than resetting it.

## Proposed implementation

See [the rebuild plan](../plans/06_fresh_local_crm_tavily_discovery.md). The proposed FastAPI, React, SQLite, and LangGraph runtime is a recommendation; this decision does not claim that a fresh application or Tavily integration is implemented.

## Consequences

A common pipeline can support both freelancer job searches and direct client acquisition. Its evidence and drafting rules must preserve the difference between advertised requirements and hypotheses about a business. Search relevance, service fit, and buying intent are separate judgments.

Retain truthful profile grounding, source snapshots, draft versions, human edits, and explicit review. Submission/contact history records actual user actions; discovery or generation does not count as outreach.

## References

- [Previous local-first direction](0002-local-first-freelancer-opportunity-crm.md)
- [SQLite decision](0003-sqlite-for-local-experiment.md)
- [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract)
