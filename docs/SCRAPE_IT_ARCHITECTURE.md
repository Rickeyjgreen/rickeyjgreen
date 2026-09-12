# Scrape It — thin-slice architecture

## Scope implemented

This branch implements only the first vertical slice requested in the handoff:

`source registry -> one approved real source -> raw observation -> normalization -> change detection -> evidence -> transparent action -> evidence drawer -> feedback`

The real source adapter is NHTSA's documented vehicle-recalls API using a make/model/model-year query. It does not bulk-query VINs.

## Isolation

- Git branch: `scrape-it`
- Route: `/scrape-it`
- Existing `/`, `/kaden`, and `/kendall` app code remains unchanged and is loaded through `src/router-entry.jsx`.
- No existing Vercel project is reused.
- No existing Supabase project is used.

## Current persistence boundary

For the branch-only thin slice, raw captures, normalized runs, change events, evidence, actions, failures, and feedback are append-only browser-local records under `scrape-it-v1-store`.

This is intentionally labeled in the UI and is **not** the canonical production datastore.

Before multi-user or scheduled-worker use, replace the store adapter with a brand-new isolated PostgreSQL/Supabase project. The raw layer must remain append-only; normalized and derived layers should reference raw IDs rather than mutate raw evidence.

## Worker/API boundary for the next slice

Recommended contract:

`worker/n8n -> POST /ingest/observation -> raw store -> deterministic normalizer -> diff -> evidence -> action`

The browser UI should read normalized/action state from the application API. Persistent crawling, Playwright/Crawl4AI, and long-running n8n jobs should stay outside Vercel Functions.

## Truth guardrails in code

- First live capture emits `BASELINE_CAPTURED`, not a fake market-change alert.
- A model-level recall does not prove a specific VIN is affected.
- Zero model-level recall results do not prove every VIN is recall-free.
- No dealer willingness or buyer need is inferred.
- Failed source stages are retained in the review trail.
- Feedback is append-only and never rewrites evidence.
