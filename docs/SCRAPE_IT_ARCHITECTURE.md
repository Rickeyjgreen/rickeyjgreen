# Scrape It — thin-slice architecture

## Scope implemented

This branch implements only the first vertical slice requested in the handoff:

`source registry -> one approved real source -> immutable raw observation -> normalization -> change detection -> evidence -> transparent action -> evidence drawer -> feedback`

The real source adapter is NHTSA's documented vehicle-recalls API using a make/model/model-year query. It does not bulk-query VINs.

## Canonical isolated surfaces

- GitHub repository: `Rickeyjgreen/rickeyjgreen`
- Git branch: `scrape-it`
- App route: `/scrape-it`
- Vercel project: `rickeyjgreen` (`prj_pIOon4i8iznaHlUglYkXfnoQV0I7`), mapped to `Rickeyjgreen/rickeyjgreen`
- Vercel branch alias: `rickeyjgreen-git-scrape-it-rickeyjgreens-projects.vercel.app`
- Supabase project: `scrape-it` (`eyngapizkxsernywdyfv`)
- Supabase Edge Function: `scrape-it-api`

The separate Elite Vercel project remains mapped to `Rickeyjgreen/Bybo-AI`, and the separate `Bybo Builds` Supabase project is not used by this app.

## Existing app preservation

Existing `/`, `/kaden`, and `/kendall` content remains in `src/main.jsx`. `src/router-entry.jsx` only selects the Scrape It bootstrap when the current path starts with `/scrape-it`; otherwise it loads the existing application unchanged.

No changes are merged to `main` by this branch workflow.

## Persistence boundary

PostgreSQL in the dedicated Scrape It Supabase project is the canonical datastore for this slice.

Layers:

### Raw / immutable
- `ingestion_runs`
- `raw_observations`

Raw observations retain source URL, fetch metadata, raw text/JSON, parse state, and SHA-256 body hash. A database trigger rejects update/delete operations on raw observations.

### Normalized factual
- `source_registry`
- `normalized_runs`
- `recall_observations`
- `evidence_records`

### Derived / recalculable
- `change_events`
- `recommended_actions`

### Feedback / append-only
- `action_feedback`

Feedback has its own immutability trigger and never rewrites source evidence.

## Access model

All public-schema Scrape It tables have Row Level Security enabled. Direct privileges are revoked from `anon` and `authenticated`; the browser does not read or write the tables directly.

The browser uses only the project's publishable key to call the constrained `scrape-it-api` Edge Function. Elevated database credentials remain server-side. The function permits only three operations:

- `state`
- `refresh`
- `feedback`

The fixed V1 external source is the approved NHTSA endpoint. User input is limited to validated make/model/model-year parameters; the client cannot provide an arbitrary crawl URL.

## Server-side pipeline

`browser -> scrape-it-api -> NHTSA -> raw_observations -> normalized_runs/recall_observations -> change_events -> evidence_records -> recommended_actions -> browser`

The function:

1. verifies the application publishable key
2. validates vehicle query inputs
3. creates an observable ingestion run
4. fetches the approved NHTSA endpoint
5. stores the raw response before downstream interpretation
6. hashes raw content
7. deterministically normalizes campaigns
8. compares against the previous observation for the same query
9. emits a baseline, no-change, or changed event
10. creates linked evidence
11. creates one transparent WATCH / VERIFY / NOW action
12. persists failures instead of silently dropping them

## Truth guardrails

- First live capture emits `BASELINE_CAPTURED`, not a fake market-change alert.
- A model-level recall does not prove a specific VIN is affected.
- Zero model-level recall results do not prove every VIN is recall-free.
- No dealer willingness or buyer need is inferred.
- Failed source stages are retained in the review trail.
- Feedback is append-only and never rewrites evidence.
- No secret or service-role credential is committed to GitHub or bundled into the client.

## Worker boundary

The Edge Function is appropriate for this narrow on-demand API fetch. Persistent crawling, Playwright/Crawl4AI, n8n scheduling, large-scale discovery, and long-running workers remain outside Vercel Functions and this first slice.

Future worker contract should remain conceptually:

`worker/n8n -> constrained ingest contract -> raw store -> deterministic normalizer -> diff -> evidence -> action`

## Current build gate

This slice is ready to validate the evidence/action substrate with a real authoritative source. Broad crawling should not be added until dealer identity resolution and the first dealer-inventory observation model are implemented and verified.
