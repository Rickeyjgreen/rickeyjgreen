-- EAE POC read-only intelligence substrate.
-- Additive only: no write-back path to POC/Access and no browser table grants.

create table if not exists public.poc_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  source_kind text not null default 'POC_MIRROR',
  source_label text not null,
  source_path_hint text,
  source_modified_at timestamptz,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  body_hash text not null,
  manifest jsonb not null default '{}'::jsonb,
  snapshot_status text not null default 'SNAPSHOT_ONLY',
  unique(source_kind, body_hash)
);

create table if not exists public.poc_raw_records (
  raw_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  record_type text not null,
  source_file text not null,
  source_key text,
  observed_at timestamptz not null,
  body_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(snapshot_id, record_type, source_file, body_hash)
);

create table if not exists public.poc_dealer_observations (
  observation_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  dealer_num text not null,
  dealer_name text,
  city text,
  state text,
  zip text,
  region text,
  oem text,
  website text,
  phone text,
  rep_assignment text,
  last_deal_raw text,
  observed_at timestamptz not null,
  evidence_class text not null default 'STRUCTURED_DATA',
  source_file text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_contact_observations (
  observation_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  dealer_num text not null,
  contact_value text not null,
  contact_type text not null,
  source_file text not null,
  observed_at timestamptz not null,
  evidence_class text not null default 'STRUCTURED_DATA',
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_vin_observations (
  observation_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  vin text not null,
  dealer_num text,
  previous_dealer_num text,
  year integer,
  make text,
  model text,
  trim text,
  mileage integer,
  listing_price numeric,
  inventory_status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  observed_at timestamptz not null,
  source_file text not null,
  evidence_class text not null default 'STRUCTURED_DATA',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_vin_movements (
  movement_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  vin text not null,
  from_dealer_num text,
  to_dealer_num text,
  detected_at timestamptz not null,
  miles numeric,
  same_owner_status text not null default 'UNKNOWN',
  ownership_evidence text,
  interpretation text not null default 'MOVEMENT_LEAD',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_file text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_load_observations (
  observation_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  load_number text not null,
  status text,
  seller_dealer_num text,
  seller_dealer_name text,
  buyer_dealer_num text,
  rep text,
  seller_rep text,
  unit_count integer,
  invoice_value numeric,
  holdback numeric,
  advertising_261 numeric,
  expense_65a numeric,
  fee_total numeric,
  freight_total numeric,
  sold_date date,
  observed_at timestamptz not null,
  source_file text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_load_units (
  unit_observation_id uuid primary key default gen_random_uuid(),
  load_observation_id uuid not null references public.poc_load_observations(observation_id) on delete cascade,
  vin text,
  unit_number integer,
  year integer,
  make text,
  description text,
  invoice_amount numeric,
  holdback numeric,
  advertising_261 numeric,
  expense_65a numeric,
  fee numeric,
  freight numeric,
  over_under_310 numeric,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_invoice_economics (
  observation_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  vin text not null,
  load_number text,
  invoice_basis text,
  invoice_amount numeric,
  holdback numeric,
  advertising_261 numeric,
  expense_65a numeric,
  fee numeric,
  over_under_310 numeric,
  estimate_method text,
  observed_at timestamptz not null,
  source_file text not null,
  evidence_class text not null default 'STRUCTURED_DATA',
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_freight_observations (
  observation_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  load_number text,
  carrier text,
  seller_dealer_num text,
  buyer_dealer_num text,
  estimated_pickup timestamptz,
  estimated_delivery timestamptz,
  actual_pickup timestamptz,
  actual_delivery timestamptz,
  freight_amount numeric,
  status text,
  observed_at timestamptz not null,
  source_file text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_rep_activity (
  activity_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  rep text,
  action text not null,
  machine text,
  activity_at timestamptz not null,
  source_file text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_owner_relationships (
  relationship_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.poc_snapshots(snapshot_id) on delete restrict,
  dealer_num text not null,
  owner_key text not null,
  relationship_method text not null,
  relationship_status text not null default 'OBSERVED',
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  observed_at timestamptz not null,
  source_file text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.poc_ingest_events (
  ingest_event_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references public.poc_snapshots(snapshot_id) on delete set null,
  event_type text not null,
  status text not null,
  records_received integer not null default 0,
  records_written integer not null default 0,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists poc_dealer_obs_num_idx on public.poc_dealer_observations(dealer_num, observed_at desc);
create index if not exists poc_vin_obs_vin_idx on public.poc_vin_observations(vin, observed_at desc);
create index if not exists poc_vin_moves_vin_idx on public.poc_vin_movements(vin, detected_at desc);
create index if not exists poc_vin_moves_flow_idx on public.poc_vin_movements(from_dealer_num, to_dealer_num, detected_at desc);
create index if not exists poc_load_obs_num_idx on public.poc_load_observations(load_number, observed_at desc);
create index if not exists poc_invoice_econ_vin_idx on public.poc_invoice_economics(vin, observed_at desc);
create index if not exists poc_activity_rep_idx on public.poc_rep_activity(rep, activity_at desc);

alter table public.poc_snapshots enable row level security;
alter table public.poc_raw_records enable row level security;
alter table public.poc_dealer_observations enable row level security;
alter table public.poc_contact_observations enable row level security;
alter table public.poc_vin_observations enable row level security;
alter table public.poc_vin_movements enable row level security;
alter table public.poc_load_observations enable row level security;
alter table public.poc_load_units enable row level security;
alter table public.poc_invoice_economics enable row level security;
alter table public.poc_freight_observations enable row level security;
alter table public.poc_rep_activity enable row level security;
alter table public.poc_owner_relationships enable row level security;
alter table public.poc_ingest_events enable row level security;

revoke all on public.poc_snapshots, public.poc_raw_records, public.poc_dealer_observations,
  public.poc_contact_observations, public.poc_vin_observations, public.poc_vin_movements,
  public.poc_load_observations, public.poc_load_units, public.poc_invoice_economics,
  public.poc_freight_observations, public.poc_rep_activity, public.poc_owner_relationships,
  public.poc_ingest_events from anon, authenticated;

grant select, insert, update, delete on public.poc_snapshots, public.poc_raw_records,
  public.poc_dealer_observations, public.poc_contact_observations, public.poc_vin_observations,
  public.poc_vin_movements, public.poc_load_observations, public.poc_load_units,
  public.poc_invoice_economics, public.poc_freight_observations, public.poc_rep_activity,
  public.poc_owner_relationships, public.poc_ingest_events to service_role;

create or replace function public.reject_poc_raw_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'POC raw evidence is immutable';
end;
$$;

revoke all on function public.reject_poc_raw_mutation() from public, anon, authenticated;

drop trigger if exists poc_snapshots_immutable on public.poc_snapshots;
create trigger poc_snapshots_immutable before update or delete on public.poc_snapshots
for each row execute function public.reject_poc_raw_mutation();

drop trigger if exists poc_raw_records_immutable on public.poc_raw_records;
create trigger poc_raw_records_immutable before update or delete on public.poc_raw_records
for each row execute function public.reject_poc_raw_mutation();
