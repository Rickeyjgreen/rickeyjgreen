# Scrape It — Analytics Trust Gate

Status: RECOMMENDED STATE implemented as the first Dealer Pulse analytics boundary.

## Purpose
Raw scraper output is evidence. It is not automatically market intelligence. Only inventory snapshots that pass this gate may create deterministic VIN events, dealer daily metrics, pressure scores, or collision candidates.

## Analytics-eligible snapshot rules
A snapshot is eligible only when `coverage_status = COMPLETE` and one of these validation paths is satisfied:
1. `REPORTED_TOTAL_RECONCILIATION` — website reported total is present and `reported_total = vin_count`.
2. `EXHAUSTIVE_PAGINATION` — current DealerOn pagination adapter exhausts the complete page chain deterministically.

Everything else remains preserved but excluded from analytics. A partial scan must never replace trusted state or create a VIN removal.

## Automatic processing
Every future dealer scan that transitions `dealer_scan_runs.status` to `COMPLETE` invokes the internal `process_trusted_inventory_snapshot(snapshot_id)` database processor. The processor:
1. evaluates the snapshot against the trust gate;
2. compares it only to the prior analytics-eligible COMPLETE snapshot;
3. idempotently derives VIN events;
4. refreshes the dealer's daily metric row;
5. recomputes the current Dealer Pulse score.

The processor and score function are not executable by `anon` or `authenticated`; browser clients consume the mediated `dealer-pulse-api` Edge Function instead of direct table access.

## Deterministic VIN event ledger
Supported event types: `ADDED`, `PRESENT`, `PRICE_DROP`, `PRICE_RISE`, `REMOVED`, `REAPPEARED`.

`REAPPEARED` requires a prior trusted `REMOVED` event for the same dealer + VIN. `REMOVED` means no longer observed between trusted COMPLETE scans; it does not prove a retail sale, wholesale sale, trade, auction disposition, or dealer-to-dealer movement.

Every event stores deterministic idempotency key, dealer + VIN, snapshot IDs, observation IDs where available, prices where available, event time, evidence class, source URL, analytics epoch, and derivation metadata.

## Dealer history primitive
`dealer_daily_metrics` is calculated only from analytics-eligible snapshots/events and stores end-of-day observed inventory count, VIN additions/removals, price rises/drops, reappearances, first/last trusted scan, trusted scan count, data coverage, confidence, and metric version.

## Dealer Pulse score v0.1
`dealer_scores_current` is the first deliberately conservative hypothesis layer. It produces `seller_score`, `buyer_score`, status, factor scores, coverage, confidence, version, and warning metadata.

Status values: `SELLER_LEAN`, `BUYER_LEAN`, `TWO_SIDED_ACTIVE`, `NEUTRAL`, `INSUFFICIENT_DATA`.

Current v0.1 uses only short-history signals that are already defensible: inventory growth/decline, additions, removals, price cuts, and reappearances. It intentionally does **not** pretend we have 30/60/90-day aging, stable velocity, model scarcity, or proven dealer intent yet. Most dealers should remain `INSUFFICIENT_DATA` until enough trusted history accumulates.

Score semantics:
- Seller pressure = INFERENCE, not a customer statement or commitment to sell.
- Buyer pressure = INFERENCE, not a customer statement or commitment to buy.
- Scores are not operational truth until sufficient trusted history and calibration exist.

## Serving layer
`dealer-pulse-api` exposes the current score layer, recent non-PRESENT VIN events, and recent dealer daily metrics to the Scrape It preview. Direct browser table access remains blocked by RLS.

## Evidence language
- Inventory presence/change: STRUCTURED_DATA / OBSERVATION
- Seller pressure: INFERENCE
- Buyer pressure: INFERENCE
- VIN collision: INFERENCE until stronger evidence exists
- Confirmed transaction: requires internal/structured transaction evidence

## Current trust epoch
`acquisition_v2_2026-09-13`

Older snapshots remain available as historical raw evidence but do not automatically enter Dealer Pulse analytics.
