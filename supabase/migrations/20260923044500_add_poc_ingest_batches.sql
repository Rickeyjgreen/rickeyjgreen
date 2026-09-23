create table if not exists public.poc_ingest_batches (
  ingest_batch_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  batch_key text not null,
  batch_hash text not null,
  record_count integer not null default 0,
  status text not null default 'RECEIVED',
  records_written integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(snapshot_id,batch_key)
);
alter table public.poc_ingest_batches enable row level security;
revoke all on public.poc_ingest_batches from anon, authenticated;
grant select,insert,update,delete on public.poc_ingest_batches to service_role;
create index if not exists poc_ingest_batches_snapshot_idx on public.poc_ingest_batches(snapshot_id,created_at desc);
