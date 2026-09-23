# EAE POC → BYBO Read-Only Integration

## Purpose
Use POC/Access-derived artifacts as evidence inputs to BYBO without creating any write path back to POC or Access.

## Boundary
```
office POC / Access
  -> approved robocopy mirror
  -> scripts/poc-mirror-adapter.mjs
  -> poc-ingest-api
  -> immutable snapshot/raw evidence
  -> normalized POC observations
  -> poc-intel-api / poc-agent-api
  -> BYBO Dealer Pulse / agent
```

The mirror path is configuration. No source path is hard-coded.

## Truth contract
- A mirrored folder is a **snapshot**, not current truth.
- Preserve `observed_at`, source file, snapshot hash, ingest time and payload provenance.
- VIN movement means a dealer-location change observation; it is not automatically a sale, wholesale trade, or Elite bypass.
- Historical dealer behavior is measured history, not permanent preference or current willingness.
- Buyer-minus-seller or invoice differential is not called gross without final freight, fees, costs, reversals and accounting evidence.
- Conflicting observations remain visible until stronger evidence resolves them.

## Data layers
### Immutable
- `poc_snapshots`
- `poc_raw_records`

Updates/deletes are rejected by database trigger.

### Normalized observations
- dealers
- contacts
- VIN observations
- VIN movements
- loads and load units
- invoice economics
- freight
- rep activity
- ownership relationships

### Operational ingest
- `poc_ingest_batches`: retry/idempotency state
- `poc_ingest_events`: ingest audit trail

## Security
All POC tables have RLS enabled and direct access revoked from `anon` and `authenticated`. Browser clients do not query them.

- `poc-intel-api` exposes one sanitized browser operation: `dashboard`.
- Detailed `poc-intel-api` queries require `POC_QUERY_ADMIN_KEY`.
- `poc-agent-api` requires `POC_QUERY_ADMIN_KEY`.
- `poc-ingest-api` requires `POC_INGEST_KEY`.
- Missing secrets fail closed.
- Raw source payloads are scrubbed for obvious password/secret/token/cookie/SMTP/API-key keys before storage.
- Never add POC/Access write endpoints to these functions.

## Mirror adapter
Run only against the approved mirror, never the live Access/POC directory.

```powershell
$env:POC_INGEST_KEY="<configured secret>"
node scripts/poc-mirror-adapter.mjs --source "X:\approved\POC-mirror"
```

Dry-run:

```powershell
$env:POC_DRY_RUN="1"
node scripts/poc-mirror-adapter.mjs --source "X:\approved\POC-mirror"
```

The current adapter recognizes `poc_dealers.json`, `_dealer_owner_map.json`, `poc_data.json` and records metadata hashes for the recognized snapshot set. Additional source adapters should be added only after their semantics are verified.

## Current gate
The database schema and cloud query/ingest boundaries exist. The live robocopy mirror is intentionally not connected until its approved path and execution mechanism are supplied.
