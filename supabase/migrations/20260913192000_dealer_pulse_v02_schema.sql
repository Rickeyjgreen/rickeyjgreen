-- Dealer Pulse v0.2 reconciliation migration.
-- This migration captures the live trust-gated analytics schema after iterative validation.
-- It is intentionally idempotent so existing production tables are preserved.

alter table public.dealer_inventory_snapshots add column if not exists analytics_eligible boolean not null default false;
alter table public.dealer_inventory_snapshots add column if not exists analytics_reason text;
alter table public.dealer_inventory_snapshots add column if not exists trust_epoch text;
alter table public.dealer_inventory_snapshots add column if not exists validation_method text;
alter table public.dealer_inventory_snapshots add column if not exists schema_version text not null default 'inventory_snapshot_v1';

create table if not exists public.dealer_vehicle_observations (
  observation_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dealer_scan_runs(run_id) on delete cascade,
  snapshot_id uuid not null references public.dealer_inventory_snapshots(snapshot_id) on delete cascade,
  dealer_id text not null references public.dealer_accounts(dealer_id) on delete cascade,
  vin text not null,
  year integer,
  make text,
  model text,
  trim text,
  engine text,
  stock_number text,
  status text,
  price numeric,
  msrp numeric,
  vehicle_url text,
  source_url text not null,
  platform text,
  observed_at timestamptz not null default now(),
  evidence_class text not null default 'STRUCTURED_DATA',
  confidence numeric not null default 0.95,
  unique(snapshot_id,vin)
);

create table if not exists public.vehicle_vin_reference (
  vin text primary key check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  model_year integer,
  make text,
  model text,
  trim text,
  series text,
  body_class text,
  manufacturer text,
  engine_model text,
  engine_cylinders numeric,
  displacement_l numeric,
  fuel_type_primary text,
  decoder_source text not null default 'NHTSA_VPIC',
  decoder_endpoint text not null default 'DecodeVINValuesBatch',
  decode_error_code text,
  decode_error_text text,
  decoded_at timestamptz not null default now(),
  raw_decode jsonb not null default '{}'::jsonb,
  evidence_class text not null default 'STRUCTURED_DATA',
  confidence numeric not null default 0.95 check (confidence between 0 and 1)
);

create table if not exists public.inventory_events (
  event_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  dealer_id text not null,
  vin text not null,
  event_type text not null check (event_type in ('ADDED','PRESENT','PRICE_DROP','PRICE_RISE','REMOVED','REAPPEARED')),
  previous_snapshot_id uuid references public.dealer_inventory_snapshots(snapshot_id),
  snapshot_id uuid not null references public.dealer_inventory_snapshots(snapshot_id),
  previous_observation_id uuid references public.dealer_vehicle_observations(observation_id),
  observation_id uuid references public.dealer_vehicle_observations(observation_id),
  previous_price numeric,
  current_price numeric,
  event_at timestamptz not null,
  evidence_class text not null default 'STRUCTURED_DATA',
  confidence numeric not null default 1.0,
  source_url text,
  analytics_epoch text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.dealer_daily_metrics (
  metric_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  dealer_id text not null,
  metric_date date not null,
  inventory_count integer not null,
  added_count integer not null default 0,
  removed_count integer not null default 0,
  price_drop_count integer not null default 0,
  price_rise_count integer not null default 0,
  reappeared_count integer not null default 0,
  first_trusted_snapshot_at timestamptz,
  last_trusted_snapshot_at timestamptz,
  trusted_snapshot_count integer not null default 0,
  data_coverage numeric not null default 0,
  confidence numeric not null default 0,
  metric_version text not null default 'dealer_daily_v1',
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(dealer_id,metric_date,metric_version)
);

create table if not exists public.dealer_scores_current (
  dealer_id text primary key,
  score_version text not null,
  seller_score numeric not null default 0,
  buyer_score numeric not null default 0,
  status text not null check (status in ('SELLER_LEAN','BUYER_LEAN','TWO_SIDED_ACTIVE','NEUTRAL','INSUFFICIENT_DATA')),
  factor_scores jsonb not null default '{}'::jsonb,
  top_factors jsonb not null default '[]'::jsonb,
  data_coverage numeric not null default 0,
  confidence numeric not null default 0,
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.vin_lifecycle_current (
  dealer_id text not null,
  vin text not null,
  first_seen_trusted_at timestamptz not null,
  current_stint_started_at timestamptz,
  last_seen_trusted_at timestamptz not null,
  observed_scan_count integer not null default 0,
  observed_dom_days integer,
  currently_observed boolean not null default false,
  last_event_type text,
  year integer,
  make text,
  model text,
  trim text,
  engine text,
  stock_number text,
  current_price numeric,
  msrp numeric,
  vehicle_url text,
  source_url text,
  analytics_epoch text not null,
  confidence numeric,
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key(dealer_id,vin)
);

create table if not exists public.dealer_model_metrics_current (
  dealer_id text not null,
  make text not null,
  model text not null,
  inventory_count integer not null default 0,
  dealer_inventory_share numeric not null default 0,
  avg_observed_dom numeric,
  max_observed_dom integer,
  aged_30_count integer not null default 0,
  aged_60_count integer not null default 0,
  aged_90_count integer not null default 0,
  avg_price numeric,
  additions_7d integer not null default 0,
  removals_7d integer not null default 0,
  price_drops_7d integer not null default 0,
  price_rises_7d integer not null default 0,
  first_seen_trusted_at timestamptz,
  last_seen_trusted_at timestamptz,
  attribute_coverage numeric not null default 0,
  confidence numeric not null default 0,
  metric_version text not null,
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key(dealer_id,make,model)
);

create table if not exists public.observed_panel_model_metrics_current (
  make text not null,
  model text not null,
  dealer_count integer not null default 0,
  inventory_count integer not null default 0,
  avg_units_per_dealer numeric,
  median_units_per_dealer numeric,
  avg_observed_dom numeric,
  max_observed_dom integer,
  aged_30_count integer not null default 0,
  aged_60_count integer not null default 0,
  aged_90_count integer not null default 0,
  additions_7d integer not null default 0,
  removals_7d integer not null default 0,
  net_change_7d integer not null default 0,
  price_drops_7d integer not null default 0,
  attribute_coverage numeric not null default 0,
  confidence numeric not null default 0,
  metric_version text not null,
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key(make,model)
);

create table if not exists public.vin_collision_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  vin text not null,
  from_dealer_id text not null,
  to_dealer_id text not null,
  removed_event_id uuid not null references public.inventory_events(event_id),
  added_event_id uuid not null references public.inventory_events(event_id),
  removed_at timestamptz not null,
  added_at timestamptz not null,
  gap_hours numeric not null,
  make text,
  model text,
  model_year integer,
  evidence_class text not null default 'INFERENCE',
  confidence numeric not null default 0.5,
  candidate_status text not null default 'DEALER_CHANGE_CANDIDATE',
  reason text not null,
  false_positive_flags jsonb not null default '[]'::jsonb,
  analytics_epoch text not null default 'acquisition_v2_2026-09-13',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint vin_collision_distinct_dealers check (from_dealer_id<>to_dealer_id),
  constraint vin_collision_positive_gap check (gap_hours>=0 and gap_hours<=336)
);

create index if not exists dealer_vehicle_observations_dealer_vin_idx on public.dealer_vehicle_observations(dealer_id,vin,observed_at desc);
create index if not exists dealer_vehicle_observations_vehicle_idx on public.dealer_vehicle_observations(make,model,year);
create index if not exists vehicle_vin_reference_lookup_idx on public.vehicle_vin_reference(make,model,model_year);
create index if not exists inventory_events_dealer_time_idx on public.inventory_events(dealer_id,event_at desc);
create index if not exists inventory_events_vin_time_idx on public.inventory_events(vin,event_at desc);
create index if not exists inventory_events_type_time_idx on public.inventory_events(event_type,event_at desc);
create index if not exists inventory_events_snapshot_idx on public.inventory_events(snapshot_id);
create index if not exists inventory_events_previous_snapshot_idx on public.inventory_events(previous_snapshot_id);
create index if not exists inventory_events_observation_idx on public.inventory_events(observation_id);
create index if not exists inventory_events_previous_observation_idx on public.inventory_events(previous_observation_id);
create index if not exists vin_lifecycle_current_observed_idx on public.vin_lifecycle_current(dealer_id,currently_observed,observed_dom_days desc);
create index if not exists vin_lifecycle_current_model_idx on public.vin_lifecycle_current(make,model) where currently_observed=true;
create index if not exists dealer_model_metrics_model_idx on public.dealer_model_metrics_current(make,model,inventory_count desc);
create index if not exists vin_collision_vin_time_idx on public.vin_collision_candidates(vin,added_at desc);
create index if not exists vin_collision_from_time_idx on public.vin_collision_candidates(from_dealer_id,added_at desc);
create index if not exists vin_collision_to_time_idx on public.vin_collision_candidates(to_dealer_id,added_at desc);
create index if not exists vin_collision_removed_event_idx on public.vin_collision_candidates(removed_event_id);
create index if not exists vin_collision_added_event_idx on public.vin_collision_candidates(added_event_id);

alter table public.dealer_vehicle_observations enable row level security;
alter table public.vehicle_vin_reference enable row level security;
alter table public.inventory_events enable row level security;
alter table public.dealer_daily_metrics enable row level security;
alter table public.dealer_scores_current enable row level security;
alter table public.vin_lifecycle_current enable row level security;
alter table public.dealer_model_metrics_current enable row level security;
alter table public.observed_panel_model_metrics_current enable row level security;
alter table public.vin_collision_candidates enable row level security;

revoke all on table public.dealer_vehicle_observations,public.vehicle_vin_reference,public.inventory_events,public.dealer_daily_metrics,public.dealer_scores_current,public.vin_lifecycle_current,public.dealer_model_metrics_current,public.observed_panel_model_metrics_current,public.vin_collision_candidates from anon,authenticated;
grant select,insert,update,delete on table public.dealer_vehicle_observations,public.vehicle_vin_reference,public.inventory_events,public.dealer_daily_metrics,public.dealer_scores_current,public.vin_lifecycle_current,public.dealer_model_metrics_current,public.observed_panel_model_metrics_current,public.vin_collision_candidates to service_role;
