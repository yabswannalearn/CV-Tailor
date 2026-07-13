# CV Tailor Performance Optimization Plan

## Goal

Reduce the delay between the dashboard or job tracker appearing and the user’s data becoming visible, especially in the deployed Supabase environment.

The target experience is:

- The page shell appears immediately.
- A loading skeleton communicates that data is being fetched.
- Warm requests show useful data within 1–2 seconds.
- Large PDF and LaTeX payloads never block the tracker list.
- Users see clear retry and timeout messages when the backend is unavailable.

## Current findings

### Tracker data is heavier than necessary

The tracker list currently loads complete `JobApplication` records. Those records include large fields such as:

- `pdf_data`
- `latex_source`
- Full job descriptions
- Cover letters

The tracker only needs a small subset of these fields for its initial collapsed list view.

Because applications are now collapsible, the initial request should not load the full application payload. Full details should be fetched only when a user opens a specific application.

The `/tracker/stats` endpoint also loads every complete job record and counts statuses in Python. It should count records directly in PostgreSQL instead.

### Multiple requests are made during initial page load

The sidebar, dashboard, tracker, and generate page independently request `/auth/me`. The tracker also separately requests jobs and statistics.

This creates unnecessary network round trips and repeated database queries.

### Profile loading uses a large multi-join

The profile endpoint loads education, experience, projects, skills, and certifications with multiple `joinedload` relationships. This can multiply rows in the database result and increase response time.

### The interface does not communicate loading well

Some pages render their layout before data arrives but do not show enough loading state. A slow request therefore feels like an empty or broken page.

### No shared frontend data or client-state layer

The frontend currently uses local React hooks and manual `fetch` calls. There is no shared cache for server data, request deduplication, or centralized client state. This contributes to repeated `/auth/me` requests and makes tracker/profile data harder to reuse between pages.

The planned state architecture is:

- **TanStack React Query** (`@tanstack/react-query`) for server state: authenticated user data, profile data, tracker summaries, tracker details, statistics, presets, loading states, retries, caching, and invalidation.
- **Redux Toolkit** (`@reduxjs/toolkit` and `react-redux`) for structured application-wide client state that benefits from explicit actions, reducers, and devtools.
- **Zustand** (`zustand`) for small, focused client stores with low ceremony, such as editor preferences, temporary UI state, or lightweight cross-component interactions.
- Local React state remains appropriate for short-lived form state, draft text, and component-only interactions.

Redux and Zustand must not manage the same state. They are alternatives for client-owned state, not two competing global stores for every feature. The implementation phase should select the simpler option per state domain and document the boundary. Neither should duplicate data managed by React Query: API responses belong in the React Query cache; client stores should contain only UI state, preferences, and lightweight references to server records.

## Phase 0 — Measure before changing behavior

Create a baseline for local and deployed environments.

Measure:

1. Time to first page shell.
2. Time to authenticated user data.
3. Time to profile data.
4. Time to tracker jobs and statistics.
5. Database query duration.
6. Response payload size.
7. Warm request versus cold-start request time.

The measurements should identify whether each delay comes from frontend waterfalls, database connection setup, SQL execution, serialization, or network transfer.

## Phase 1 — Optimize tracker queries and lazy-load application details

### 1.1 Load lightweight application summaries first

The initial tracker request should return only the fields needed for a collapsed card:

- Application ID
- Company name
- Job title
- Status
- Priority
- Whether a PDF exists
- PDF generation date
- Created date

It should not load job descriptions, notes, cover letters, PDF binary data, LaTeX source, or other expanded-content fields.

### 1.2 Fetch details when a card expands

When the user opens an application card, the frontend should request a dedicated endpoint such as:

```text
GET /tracker/{job_id}/details
```

That endpoint should:

1. Verify that the application belongs to the authenticated user.
2. Select only the expanded fields needed by the card.
3. Return the details for that one application.

The expanded card should show a small loading state while the request is in progress. If the request fails, the card should remain open with a clear retry action.

### 1.3 Cache expanded details in the frontend

Once an application’s details are loaded, store them by job ID in frontend state. Reopening the same card should use the cached details instead of firing another request.

The frontend should also deduplicate requests if a user taps the expand control repeatedly while the first request is still running.

### 1.4 Keep list actions lightweight

Actions such as expand, edit, delete, generate CV, and generate cover letter should not require the initial list response to contain large fields. Fetch full job data only for the action that needs it.

### 1.5 Avoid accidental N+1 loading

Only fetch details for the application the user opens. Do not fetch detail data for every visible card after the summary list loads.

Optional prefetching can be considered later for desktop hover or keyboard focus, but it should not be enabled on mobile by default.

### 1.6 Create a lightweight tracker response

The initial tracker list should select only fields required by the collapsed cards.

The list response should exclude:

- `pdf_data`
- `latex_source`
- `job_description`
- `notes`
- `cover_letter`

Large or expanded fields should only be requested by the detail endpoint or dedicated PDF/LaTeX endpoints.

### 1.7 Aggregate status counts in PostgreSQL

Replace the current approach of loading every job and counting statuses in Python with a grouped database query:

```sql
SELECT status, COUNT(*)
FROM job_applications
WHERE user_id = :user_id
GROUP BY status;
```

The API should still return the same status-count shape to avoid unnecessary frontend changes.

### 1.8 Add tracker indexes

Add indexes for the queries used by the tracker:

- `job_applications.user_id`
- `job_applications(user_id, created_at)`
- `job_applications(user_id, status)`

These should be added through the existing migration mechanism.

## Phase 2 — Optimize profile loading

### 2.1 Replace the multi-join profile load

Use `selectinload` for profile collections instead of joining all collections into one large result. This avoids row multiplication when a profile has multiple education, experience, project, skill, and certification records.

### 2.2 Add a profile email index

The profile endpoint currently looks up profiles by email. Add an index to `profiles.email`.

Longer term, profile loading should use the authenticated `user_id` instead of an email path parameter.

### 2.3 Avoid unnecessary profile refetches

After saving a profile, update the local editor state from the successful response where possible. Only refetch the complete profile when the server has made a transformation that the frontend cannot reproduce.

## Phase 3 — Reduce frontend request waterfalls

### 3.0 Add the shared state-management foundation

Install and configure:

```text
@tanstack/react-query
@reduxjs/toolkit
react-redux
zustand
```

Add one application-level `QueryClientProvider`, Redux `Provider`, and the Zustand stores selected during the state-boundary review. Configure a shared query client with sensible stale times, retry behavior, and error handling for authenticated requests.

Create query hooks for:

- Current authenticated user
- Profile data
- Tracker summary list
- Tracker statistics
- Expanded tracker details by application ID
- Presets

Create focused Redux slices for client-only concerns, such as:

- Tracker filters and view preferences
- Expanded/collapsed application UI state
- Resume template and editor mode preferences
- Modal and notification state where a shared store is useful

Use focused Zustand stores for client-only concerns where a slice/reducer structure would add unnecessary ceremony, such as:

- Resume editor view preferences
- Temporary preview/editor UI state
- Small cross-component interaction state

Before implementation, review each proposed Redux slice and Zustand store. A state domain should use Redux Toolkit or Zustand, never both. If the review finds no need for Redux-specific workflows or middleware, Zustand may be used as the simpler client-state solution while Redux Toolkit remains available for future structured domains.

Do not migrate every existing `useState` automatically. Move state only when it is shared, persistent across navigation, or needed by multiple components.

### 3.1 Centralize authenticated user state

Use a React Query `useCurrentUser` query so the sidebar and pages reuse one cached `/auth/me` result. Expose authentication actions through a small auth service or hook rather than duplicating fetch logic in each page.

This avoids duplicate authentication requests on every page.

### 3.2 Add a tracker bootstrap endpoint

Create one endpoint that returns the initial tracker data:

```json
{
  "user": {},
  "jobs": [],
  "stats": {}
}
```

The `jobs` array should contain summary rows only. The backend can execute the lightweight jobs query and grouped stats query in parallel before returning the response.

### 3.3 Add a dashboard bootstrap endpoint

Create one endpoint that returns:

- Authenticated user information
- Profile data
- Available presets

Presets can be cached because they change infrequently.

### 3.4 Reuse cached data between pages

When navigating between tracker, dashboard, and generate pages, reuse React Query data while it is fresh. Invalidate or refetch related queries after successful mutations. Use Redux only for navigation-independent UI state, not as a second API cache.

## Phase 4 — Improve perceived performance

Add loading states that reflect the actual page structure:

- Dashboard profile skeleton
- Tracker job-card skeletons
- Status-summary skeleton
- Generate-page profile loading state

Keep existing data visible while a refresh is in progress. Do not replace the entire page with a blank state.

Add clear recovery states:

- “We couldn’t load your applications.”
- “Try again” action.
- “Your session expired. Please sign in again.”
- “The server is taking longer than expected.”

## Phase 5 — Optimize Supabase connectivity

Verify the deployment configuration:

1. The backend and Supabase project are in the same geographic region where possible.
2. The backend uses the Supabase pooler connection string.
3. The SQLAlchemy engine is created once per process.
4. Pool size and overflow match the deployed service capacity.
5. Database connections are not opened per request.
6. Slow queries are logged with duration and route name.

Connection-pool changes should be measured rather than applied blindly, since an oversized pool can exhaust Supabase connection limits.

## Phase 6 — Caching and response behavior

Add short-lived caching for data that changes infrequently:

- Presets
- Static configuration

Do not cache user-specific profile or tracker responses without including the authenticated user in the cache key.

Use response compression only after removing large unused fields. Compression should not be used as a substitute for selecting the correct columns.

## Implementation order

The recommended implementation sequence is:

1. Measure the current waterfall and payload sizes.
2. Return lightweight tracker summaries only.
3. Fetch expanded job details when a card opens.
4. Cache expanded details and deduplicate in-flight requests.
5. Replace Python status counting with SQL aggregation.
6. Add database indexes.
7. Replace profile `joinedload` with `selectinload`.
8. Add loading skeletons and retry states.
9. Add TanStack React Query and Redux Toolkit providers and migrate shared state incrementally.
10. Centralize `/auth/me` data through a React Query hook.
11. Add tracker and dashboard bootstrap endpoints.
12. Tune Supabase connection pooling based on measurements.
13. Add safe caching for presets and static configuration.

## Acceptance criteria

The optimization is successful when:

- The tracker list does not fetch `pdf_data` or `latex_source`.
- The tracker list does not fetch expanded fields such as `job_description`, `notes`, or `cover_letter`.
- Opening a card fetches details only for that application.
- Reopening a loaded card does not issue a duplicate details request.
- Tracker status counts are produced by SQL aggregation.
- Tracker initial loading uses one bootstrap request or an equivalent efficient request set.
- The sidebar does not make a duplicate `/auth/me` request on every page.
- Server responses are cached and deduplicated through TanStack React Query.
- Redux and/or Zustand contain only shared client/UI state and do not duplicate the React Query server cache.
- No state domain is duplicated between Redux and Zustand.
- Profile loading does not create a multi-collection cartesian result.
- Warm deployed page loads display user data within 1–2 seconds under normal conditions.
- Slow or failed requests produce understandable messages and retry controls.
- Existing profile, tracker, PDF, and resume-generation behavior remains unchanged.

## Rollout and rollback

Each phase should be deployed as a small change with a before/after measurement. Query and response changes should be rolled out before frontend assumptions are changed.

If a response change causes a regression, temporarily preserve the old endpoint while the frontend is switched to the new lightweight endpoint. Database indexes and query changes are independently reversible through migrations.
