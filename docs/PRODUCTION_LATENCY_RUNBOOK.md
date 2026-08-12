# Production latency runbook

## What the repository controls

- `frontend/next.config.ts` proxies `/api/*` to `BACKEND_URL`, keeping the browser on one origin. The proxy adds a Vercel-to-backend network hop, so its compute region should be close to the backend.
- `ai-service/database.py` creates one SQLAlchemy engine when each backend process imports the module. Requests reuse its bounded pool (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT_SECONDS`, and `DB_POOL_RECYCLE_SECONDS`).
- PostgreSQL connections have bounded connect and statement timeouts. Successful statements slower than `DB_SLOW_QUERY_MS` emit `slow_db_query` with duration, request path, and SQL shape; bound values are never logged.
- The checked-in deployment surface does not select a Vercel, FastAPI Cloud, or Supabase region. Do not add a guessed `vercel.json` region: it would override the dashboard without proving that it is near the backend.

## Database connection checklist

1. In Supabase, open the project and select **Connect**. Record the project region and copy a connection string without pasting it into tickets or logs.
2. For a persistent FastAPI process, use the direct IPv6 connection when the host supports it, or the shared **session pooler** (`aws-REGION.pooler.supabase.com:5432`) when IPv4 is required. Use transaction mode (`:6543`) for short-lived/serverless processes. The runtime URL must include `sslmode=require`; the application adds it for Supabase hosts when omitted.
3. Put the URL only in the backend provider's secret `DATABASE_URL`. Never commit it. Confirm logs show `application_name=cv_tailor` in `pg_stat_activity` without printing the URL.
4. Start with the checked-in defaults: pool size 5, overflow 5, pool wait 5 seconds, connect wait 5 seconds, statement timeout 15 seconds, and slow-query threshold 500 ms. Multiply `(pool size + overflow)` by the maximum simultaneous backend processes before increasing either value; keep the result below the project's available database connections.

## Region checklist

1. **Supabase:** note the primary region shown in project settings. Moving an existing project requires a new project plus a database migration, so treat it as an infrastructure change.
2. **Backend:** the local `.fastapicloud` link is intentionally untracked and contains no safe repository region setting. In FastAPI Cloud, open **Apps → the app → Settings** and inspect any location/region field; if none is exposed, ask FastAPI Cloud support which execution region serves the app. Also inspect **Logs** after a cold request because the platform scales idle apps to zero.
3. **Vercel:** open **Project → Settings → Functions → Function Regions** and select the Vercel region closest to the backend. The deployment summary shows the effective region. Static assets remain globally distributed.
4. If the backend provider cannot colocate with Supabase, prefer the closest available backend region to Supabase, then place Vercel Functions close to that backend. Record all three observed region codes/names in the deployment change ticket.

## Repeatable measurements

Use a dedicated test account with no personal data. The script prints only status, duration, and payload bytes.

```powershell
$env:CV_TAILOR_TEST_EMAIL = "performance-test@example.invalid"
$env:CV_TAILOR_TEST_PASSWORD = "set-locally-do-not-commit"
./scripts/measure-auth-latency.ps1 -BaseUrl "https://your-frontend.example" -WarmRuns 5
```

For direct-backend comparison, run the same command with the backend URL and an empty prefix:

```powershell
./scripts/measure-auth-latency.ps1 -BaseUrl "https://your-backend.example" -ApiPrefix "" -WarmRuns 5
```

Measurement procedure:

1. Record UTC time, deployed commit, frontend/backend/Supabase regions, and configured pool values.
2. After the backend has been idle long enough to scale down, run once and label it `cold/after-idle`. The script's `first-pass` is the first authenticated pass, not proof of an infrastructure cold start.
3. Run again immediately. For each endpoint, record median and p95 of at least five warm runs plus response bytes.
4. Compare frontend-proxy time with direct-backend time. A large delta points to proxy/region/network placement; similar slow times point to backend startup or database work.
5. Correlate requests with backend `slow_db_query` entries. If request time is high without slow SQL, inspect cold-start and inter-region latency. If SQL is slow, capture `EXPLAIN (ANALYZE, BUFFERS)` in a safe staging dataset before changing indexes.
6. Repeat after one change at a time. Keep before/after output in the deployment ticket, not in the repository if it contains hostnames or account metadata.

## Current evidence

- Repository baseline before this work: frontend lint failed with 28 errors; production build passed in 34.7 seconds. Static source audit found three raw `/auth/me`, four `/presets`, two `/profile/me`, and multiple tracker startup call sites.
- Repository result: lint and production build pass. `/auth/me`, `/profile/me`, `/presets`, and `/tracker/` each have one canonical React Query definition; Discover has no second presets request, and Generate uses `/tracker/{id}/details` for its label.
- Deployed cold/warm request timings are **not recorded** because no disposable authenticated performance account or authorization to inspect/change deployment dashboards was available. Run the commands above after deployment; do not infer production latency from local build time.

## Rollback

- Revert the latency configuration commit to remove statement timeout and slow-query instrumentation.
- Restore previous environment values without changing `DATABASE_URL` unless the connection-mode change itself is being rolled back.
- Region changes may require redeployment or project migration. Preserve the old service/project until authenticated smoke tests and measurements pass in the new region.

## Provider references

- [Supabase database connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region)
- [FastAPI Cloud deployment behavior](https://fastapicloud.com/docs/builds-and-deployments/how-it-works/)
