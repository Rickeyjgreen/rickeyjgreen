alter table public.dealer_scan_runs drop constraint if exists dealer_scan_runs_status_check;
alter table public.dealer_scan_runs add constraint dealer_scan_runs_status_check check (status in ('RECEIVED','FETCHING','FETCHED','PARSED','COMPLETE','INCOMPLETE','ERROR'));

alter table public.dealer_scan_runs add column if not exists platform text;
alter table public.dealer_scan_runs add column if not exists adapter_name text;
alter table public.dealer_scan_runs add column if not exists pages_scanned integer not null default 0;
alter table public.dealer_scan_runs add column if not exists coverage_status text;
alter table public.dealer_scan_runs add column if not exists completeness_reason text;
alter table public.dealer_scan_runs add column if not exists reported_total integer;

alter table public.dealer_inventory_snapshots add column if not exists pages_scanned integer not null default 1;
alter table public.dealer_inventory_snapshots add column if not exists coverage_status text not null default 'UNKNOWN';
alter table public.dealer_inventory_snapshots add column if not exists reported_total integer;
alter table public.dealer_inventory_snapshots add column if not exists platform text;
alter table public.dealer_inventory_snapshots add column if not exists adapter_name text;
