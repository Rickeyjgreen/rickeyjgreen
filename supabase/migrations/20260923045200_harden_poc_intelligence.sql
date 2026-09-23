alter function public.reject_poc_raw_mutation() set search_path = '';

create index if not exists poc_dealer_obs_snapshot_idx on public.poc_dealer_observations(snapshot_id);
create index if not exists poc_contact_obs_snapshot_idx on public.poc_contact_observations(snapshot_id);
create index if not exists poc_vin_obs_snapshot_idx on public.poc_vin_observations(snapshot_id);
create index if not exists poc_vin_moves_snapshot_idx on public.poc_vin_movements(snapshot_id);
create index if not exists poc_load_obs_snapshot_idx on public.poc_load_observations(snapshot_id);
create index if not exists poc_load_units_parent_idx on public.poc_load_units(load_observation_id);
create index if not exists poc_invoice_econ_snapshot_idx on public.poc_invoice_economics(snapshot_id);
create index if not exists poc_freight_obs_snapshot_idx on public.poc_freight_observations(snapshot_id);
create index if not exists poc_rep_activity_snapshot_idx on public.poc_rep_activity(snapshot_id);
create index if not exists poc_owner_rel_snapshot_idx on public.poc_owner_relationships(snapshot_id);
create index if not exists poc_ingest_events_snapshot_idx on public.poc_ingest_events(snapshot_id);
