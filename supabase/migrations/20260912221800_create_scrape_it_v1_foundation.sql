create schema if not exists private;

create table public.source_registry (
  source_id text primary key,
  source_name text not null,
  source_type text not null,
  domain text not null,
  exact_url text not null,
  parent_domain text,
  oem text,
  geography text,
  source_tier smallint not null check (source_tier between 1 and 5),
  trust_level text not null,
  extraction_method text not null,
  expected_fields jsonb not null default '[]'::jsonb,
  refresh_frequency text not null,
  requires_browser boolean not null default false,
  requires_login boolean not null default false,
  robots_or_access_status text not null,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_change_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  duplicate_of text references public.source_registry(source_id),
  status text not null check (status in ('DISCOVERED','VALIDATED','APPROVED','ACTIVE','PAUSED','BROKEN','RETIRED')),
  notes text,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingestion_runs (
  run_id uuid primary key default gen_random_uuid(),
  source_id text not null references public.source_registry(source_id),
  query_key text not null,
  status text not null check (status in ('RECEIVED','FETCHING','FETCHED','PARSED','NORMALIZED','DIFFED','ACTIONED','COMPLETE','MANUAL_REVIEW','ERROR')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.raw_observations (
  raw_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ingestion_runs(run_id),
  source_id text not null references public.source_registry(source_id),
  source_url text not null,
  fetched_at timestamptz not null,
  http_status integer,
  status_text text,
  content_type text,
  duration_ms integer,
  body_hash text not null,
  raw_text text,
  raw_payload jsonb,
  parse_status text not null check (parse_status in ('PARSED','PARSE_ERROR','FETCH_ERROR')),
  created_at timestamptz not null default now()
);

create table public.normalized_runs (
  normalized_run_id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.ingestion_runs(run_id),
  raw_id uuid not null references public.raw_observations(raw_id),
  source_id text not null references public.source_registry(source_id),
  query_key text not null,
  observed_at timestamptz not null,
  observations jsonb not null default '[]'::jsonb,
  observation_count integer not null default 0 check (observation_count >= 0),
  parser_name text not null,
  parser_version text not null,
  schema_version text not null,
  evidence_class text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table public.recall_observations (
  observation_id uuid primary key default gen_random_uuid(),
  normalized_run_id uuid not null references public.normalized_runs(normalized_run_id),
  source_id text not null references public.source_registry(source_id),
  observed_at timestamptz not null,
  campaign_number text,
  manufacturer text,
  make text,
  model text,
  model_year integer,
  component text,
  summary text,
  consequence text,
  remedy text,
  report_received_date_raw text,
  park_it boolean not null default false,
  park_outside boolean not null default false,
  over_the_air_update boolean not null default false,
  evidence_class text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  raw_excerpt text
);

create table public.change_events (
  change_event_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ingestion_runs(run_id),
  source_id text not null references public.source_registry(source_id),
  normalized_run_id uuid not null references public.normalized_runs(normalized_run_id),
  previous_normalized_run_id uuid references public.normalized_runs(normalized_run_id),
  signal_type text not null,
  material boolean not null default false,
  occurred_at timestamptz not null,
  summary text not null,
  added jsonb not null default '[]'::jsonb,
  removed jsonb not null default '[]'::jsonb,
  changed jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table public.evidence_records (
  evidence_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ingestion_runs(run_id),
  source_id text not null references public.source_registry(source_id),
  raw_id uuid not null references public.raw_observations(raw_id),
  normalized_run_id uuid not null references public.normalized_runs(normalized_run_id),
  change_event_id uuid not null references public.change_events(change_event_id),
  field text not null,
  value jsonb not null,
  evidence_class text not null check (evidence_class in ('STRUCTURED_DATA','VERIFIED_FACT','DOCUMENT_EVIDENCE','PUBLIC_SOURCE_STATEMENT','INFERENCE','UNKNOWN')),
  source_url text not null,
  observed_at timestamptz not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  raw_excerpt text,
  supersedes uuid references public.evidence_records(evidence_id),
  contradicts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.recommended_actions (
  action_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ingestion_runs(run_id),
  change_event_id uuid not null references public.change_events(change_event_id),
  source_id text not null references public.source_registry(source_id),
  bucket text not null check (bucket in ('NOW','NEXT','BUILD','VERIFY','WATCH')),
  action_type text not null,
  dealer_id text,
  vehicle_configuration text,
  urgency text not null,
  opportunity_score numeric,
  confidence text not null,
  why_now text not null,
  recommended_next_step text not null,
  suggested_call_question text,
  evidence_ids jsonb not null default '[]'::jsonb,
  uncertainties jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  status text not null default 'OPEN',
  created_at timestamptz not null default now()
);

create table public.action_feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.recommended_actions(action_id),
  feedback_status text not null check (feedback_status in ('USEFUL','WRONG','STALE','RESOLVED','ACTED','NOT_RELEVANT','VERIFY_LATER')),
  outcome_note text,
  created_at timestamptz not null default now()
);

create index ingestion_runs_query_idx on public.ingestion_runs(query_key, started_at desc);
create index raw_observations_source_idx on public.raw_observations(source_id, fetched_at desc);
create index normalized_runs_query_idx on public.normalized_runs(query_key, observed_at desc);
create index recall_observations_campaign_idx on public.recall_observations(campaign_number, observed_at desc);
create index change_events_created_idx on public.change_events(created_at desc);
create index recommended_actions_created_idx on public.recommended_actions(created_at desc);
create index action_feedback_action_idx on public.action_feedback(action_id, created_at desc);

create or replace function private.reject_immutable_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable evidence rows cannot be updated or deleted';
end;
$$;

create trigger raw_observations_immutable
before update or delete on public.raw_observations
for each row execute function private.reject_immutable_mutation();

create trigger action_feedback_immutable
before update or delete on public.action_feedback
for each row execute function private.reject_immutable_mutation();

alter table public.source_registry enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.raw_observations enable row level security;
alter table public.normalized_runs enable row level security;
alter table public.recall_observations enable row level security;
alter table public.change_events enable row level security;
alter table public.evidence_records enable row level security;
alter table public.recommended_actions enable row level security;
alter table public.action_feedback enable row level security;

revoke all on table public.source_registry from anon, authenticated;
revoke all on table public.ingestion_runs from anon, authenticated;
revoke all on table public.raw_observations from anon, authenticated;
revoke all on table public.normalized_runs from anon, authenticated;
revoke all on table public.recall_observations from anon, authenticated;
revoke all on table public.change_events from anon, authenticated;
revoke all on table public.evidence_records from anon, authenticated;
revoke all on table public.recommended_actions from anon, authenticated;
revoke all on table public.action_feedback from anon, authenticated;

grant select, insert, update, delete on table public.source_registry to service_role;
grant select, insert, update, delete on table public.ingestion_runs to service_role;
grant select, insert, update, delete on table public.raw_observations to service_role;
grant select, insert, update, delete on table public.normalized_runs to service_role;
grant select, insert, update, delete on table public.recall_observations to service_role;
grant select, insert, update, delete on table public.change_events to service_role;
grant select, insert, update, delete on table public.evidence_records to service_role;
grant select, insert, update, delete on table public.recommended_actions to service_role;
grant select, insert, update, delete on table public.action_feedback to service_role;

insert into public.source_registry (
  source_id, source_name, source_type, domain, exact_url, parent_domain, oem, geography,
  source_tier, trust_level, extraction_method, expected_fields, refresh_frequency,
  requires_browser, requires_login, robots_or_access_status, status, notes, provenance
) values (
  'nhtsa-recalls-api-v1',
  'NHTSA Vehicle Recalls API',
  'SAFETY_RECALL',
  'api.nhtsa.gov',
  'https://api.nhtsa.gov/recalls/recallsByVehicle',
  'nhtsa.gov',
  'MULTI',
  'United States',
  1,
  'AUTHORITATIVE',
  'PUBLIC_JSON_API',
  '["NHTSACampaignNumber","Component","Summary","Consequence","Remedy","ReportReceivedDate","ModelYear","Make","Model"]'::jsonb,
  'MANUAL_V1',
  false,
  false,
  'DOCUMENTED_PUBLIC_API_NON_BULK_MODEL_QUERY',
  'ACTIVE',
  'V1 uses make/model/model-year recall lookup only; it does not bulk-query VINs.',
  '{"publisher":"NHTSA","source_class":"government","access":"public documented API"}'::jsonb
);
