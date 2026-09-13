# Scrape It — Analytics Trust Gate

Status: RECOMMENDED STATE implemented as the first Dealer Pulse analytics boundary.

## Purpose

Raw scraper output is evidence. It is not automatically market intelligence.

Only inventory snapshots that pass this gate may create deterministic VIN events, dealer daily metrics, pressure scores, or collision candidates.

## Analytics-eligible snapshot rules

A snapshot is eligible only when `coverage_status = COMPLETE` and one of these validation paths is satisfied:

1. `REPORTED_TOTAL_RECONCILIATION`
   - adapter is a current trusted adapter generation
   - website reported total is present
   - `reported_total = vin_count`

2. `EXHAUSTIVE_PAGINATION`
   - current DealerOn pagination adapter
   - complete page chain was exhausted deterministically

Current trusted generations:
- `dealer-dot-com-jsonld-v2`
- `dealer-inspire-cars-commerce-v7`
- `github-browser-v3` only with exact reported-total reconciliation
- `dealeron-pagination-v2` with exhaustive pagination

Everything else remains preserved but is excluded from analytics.

## Hard exclusions

- INCOMPLETE
- INVALIDATED
- LEGACY_SINGLE_PAGE
- failed/error captures
- older adapter generations
- COMPLETE labels that do not satisfy the current adapter-specific proof rule

A partial scan must never replace trusted state or create a VIN removal.

## Deterministic VIN event ledger

Events are derived only between consecutive analytics-eligible snapshots for the same dealer.

Supported event types:
- ADDED
- PRESENT
- PRICE_DROP
- PRICE_RISE
- REMOVED
- REAPPEARED

`REAPPEARED` requires a prior trusted `REMOVED` event for the same dealer + VIN. A disappearance/reappearance is an observed inventory event, not proof of a retail or wholesale sale.

Every event stores:
- deterministic idempotency key
- dealer + VIN
- current and previous snapshot IDs
- current and previous observation IDs where available
- prices where available
- event time
- evidence class
- source URL
- analytics epoch
- derivation metadata

## Dealer history primitive

`dealer_daily_metrics` is calculated only from analytics-eligible snapshots/events. V1 stores:
- end-of-day observed inventory count
- VIN additions/removals
- price rises/drops
- reappearances
- first/last trusted scan
- trusted scan count
- data coverage
- confidence
- metric version

These are factual/structured observations. Seller/buyer pressure scores are a later derived inference layer and must retain score version, factors, coverage and confidence.

## Evidence language

- Inventory presence/change: STRUCTURED_DATA / OBSERVATION
- Seller pressure: INFERENCE
- Buyer pressure: INFERENCE
- VIN collision: INFERENCE until stronger evidence exists
- Confirmed transaction: requires internal/structured transaction evidence

## Current trust epoch

`acquisition_v2_2026-09-13`

Older snapshots remain available as historical raw evidence but do not automatically enter Dealer Pulse analytics.