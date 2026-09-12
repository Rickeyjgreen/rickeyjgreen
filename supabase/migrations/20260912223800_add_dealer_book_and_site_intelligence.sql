create table if not exists public.dealer_accounts (
  dealer_id text primary key,
  dealer_name text not null,
  address text, city text, state text, zip text, region text, website text,
  phone_numbers jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  email_groups jsonb not null default '[]'::jsonb,
  source_row integer,
  source_class text not null default 'STRUCTURED_DATA',
  source_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dealer_book_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  dealer_id text not null references public.dealer_accounts(dealer_id),
  owner_name text not null,
  book_name text not null,
  assignment_type text not null,
  assignment_status text not null check (assignment_status in ('CURRENT','ROTATED_OUT','ARCHIVED')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  source_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_scan_runs (
  run_id uuid primary key default gen_random_uuid(),
  dealer_id text not null references public.dealer_accounts(dealer_id),
  status text not null check (status in ('RECEIVED','FETCHING','FETCHED','PARSED','COMPLETE','ERROR')),
  homepage_url text, inventory_url text,
  started_at timestamptz not null default now(), finished_at timestamptz,
  error_code text, error_message text,
  discovered_links jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.dealer_site_captures (
  capture_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dealer_scan_runs(run_id),
  dealer_id text not null references public.dealer_accounts(dealer_id),
  capture_type text not null check (capture_type in ('HOMEPAGE','INVENTORY')),
  source_url text not null, fetched_at timestamptz not null,
  http_status integer, status_text text, content_type text, duration_ms integer,
  body_hash text not null, raw_text text, created_at timestamptz not null default now()
);

create table if not exists public.dealer_inventory_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dealer_scan_runs(run_id),
  dealer_id text not null references public.dealer_accounts(dealer_id),
  capture_id uuid references public.dealer_site_captures(capture_id),
  observed_at timestamptz not null, inventory_url text,
  vin_count integer not null default 0 check (vin_count >= 0),
  vins jsonb not null default '[]'::jsonb,
  vehicles jsonb not null default '[]'::jsonb,
  parser_name text not null, parser_version text not null,
  evidence_class text not null default 'STRUCTURED_DATA',
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_inventory_changes (
  change_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dealer_scan_runs(run_id),
  dealer_id text not null references public.dealer_accounts(dealer_id),
  snapshot_id uuid not null references public.dealer_inventory_snapshots(snapshot_id),
  previous_snapshot_id uuid references public.dealer_inventory_snapshots(snapshot_id),
  change_type text not null check (change_type in ('BASELINE_CAPTURED','INVENTORY_CHANGED','NO_MATERIAL_CHANGE')),
  material boolean not null default false,
  added_vins jsonb not null default '[]'::jsonb,
  removed_vins jsonb not null default '[]'::jsonb,
  added_count integer not null default 0,
  removed_count integer not null default 0,
  summary text not null, observed_at timestamptz not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_action_signals (
  signal_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dealer_scan_runs(run_id),
  dealer_id text not null references public.dealer_accounts(dealer_id),
  change_id uuid not null references public.dealer_inventory_changes(change_id),
  bucket text not null check (bucket in ('NOW','NEXT','VERIFY','WATCH')),
  action_type text not null, confidence text not null,
  why_now text not null, recommended_next_step text not null,
  uncertainties jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_contact_private (
  dealer_id text primary key references public.dealer_accounts(dealer_id),
  phone_numbers jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  email_groups jsonb not null default '[]'::jsonb,
  source_label text not null,
  updated_at timestamptz not null default now()
);

create index if not exists dealer_accounts_region_idx on public.dealer_accounts(region,state,dealer_name);
create index if not exists dealer_assignments_dealer_idx on public.dealer_book_assignments(dealer_id,effective_from desc);
create index if not exists dealer_scan_runs_dealer_idx on public.dealer_scan_runs(dealer_id,started_at desc);
create index if not exists dealer_site_captures_dealer_idx on public.dealer_site_captures(dealer_id,fetched_at desc);
create index if not exists dealer_inventory_snapshots_dealer_idx on public.dealer_inventory_snapshots(dealer_id,observed_at desc);
create index if not exists dealer_inventory_changes_dealer_idx on public.dealer_inventory_changes(dealer_id,observed_at desc);
create index if not exists dealer_action_signals_dealer_idx on public.dealer_action_signals(dealer_id,created_at desc);

create trigger dealer_site_captures_immutable before update or delete on public.dealer_site_captures
for each row execute function private.reject_immutable_mutation();

alter table public.dealer_accounts enable row level security;
alter table public.dealer_book_assignments enable row level security;
alter table public.dealer_scan_runs enable row level security;
alter table public.dealer_site_captures enable row level security;
alter table public.dealer_inventory_snapshots enable row level security;
alter table public.dealer_inventory_changes enable row level security;
alter table public.dealer_action_signals enable row level security;
alter table public.dealer_contact_private enable row level security;

revoke all on table public.dealer_accounts, public.dealer_book_assignments, public.dealer_scan_runs, public.dealer_site_captures, public.dealer_inventory_snapshots, public.dealer_inventory_changes, public.dealer_action_signals, public.dealer_contact_private from anon, authenticated;
grant select,insert,update,delete on table public.dealer_accounts, public.dealer_book_assignments, public.dealer_scan_runs, public.dealer_site_captures, public.dealer_inventory_snapshots, public.dealer_inventory_changes, public.dealer_action_signals, public.dealer_contact_private to service_role;

create extension if not exists pg_net;
