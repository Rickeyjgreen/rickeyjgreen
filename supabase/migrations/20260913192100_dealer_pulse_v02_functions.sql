-- Dealer Pulse v0.2 deterministic analytics functions.

create or replace function public.pending_vin_reference_enrichment(p_limit integer default 2000)
returns table(vin text)
language sql
set search_path=public
as $$
  with current_vins as (
    select distinct l.vin from public.vin_lifecycle_current l where l.currently_observed=true
  )
  select c.vin from current_vins c
  left join public.vehicle_vin_reference r on r.vin=c.vin
  where r.vin is null or r.model_year is null or r.make is null or r.model is null
  order by c.vin limit greatest(1,least(coalesce(p_limit,2000),5000));
$$;

create or replace function public.recompute_vin_lifecycle(p_dealer_id text)
returns void
language plpgsql
set search_path=public
as $$
declare latest_sid uuid; latest_at timestamptz;
begin
  select snapshot_id,observed_at into latest_sid,latest_at
  from public.dealer_inventory_snapshots
  where dealer_id=p_dealer_id and analytics_eligible=true
  order by observed_at desc limit 1;
  delete from public.vin_lifecycle_current where dealer_id=p_dealer_id;
  if latest_sid is null then return; end if;
  insert into public.vin_lifecycle_current(
    dealer_id,vin,first_seen_trusted_at,current_stint_started_at,last_seen_trusted_at,
    observed_scan_count,observed_dom_days,currently_observed,last_event_type,
    year,make,model,trim,engine,stock_number,current_price,msrp,vehicle_url,source_url,
    analytics_epoch,confidence,calculated_at,metadata
  )
  with trusted_obs as (
    select o.*,s.observed_at snapshot_at
    from public.dealer_vehicle_observations o
    join public.dealer_inventory_snapshots s on s.snapshot_id=o.snapshot_id
    where o.dealer_id=p_dealer_id and s.analytics_eligible=true
  ), agg as (
    select vin,min(snapshot_at) first_seen,max(snapshot_at) last_seen,count(*) scans from trusted_obs group by vin
  ), lastobs as (
    select distinct on(vin) vin,year,make,model,trim,engine,stock_number,price,msrp,vehicle_url,source_url,confidence,snapshot_at
    from trusted_obs order by vin,snapshot_at desc
  ), currentobs as (
    select vin from public.dealer_vehicle_observations where snapshot_id=latest_sid
  ), reapp as (
    select vin,max(event_at) reappeared_at from public.inventory_events
    where dealer_id=p_dealer_id and event_type='REAPPEARED' group by vin
  ), last_event as (
    select distinct on(vin) vin,event_type,event_at from public.inventory_events
    where dealer_id=p_dealer_id order by vin,event_at desc,event_id desc
  )
  select p_dealer_id,a.vin,a.first_seen,
    case when c.vin is not null then greatest(a.first_seen,coalesce(rp.reappeared_at,a.first_seen)) end,
    a.last_seen,a.scans,
    case when c.vin is not null then greatest(0,(latest_at at time zone 'America/Kentucky/Louisville')::date-(greatest(a.first_seen,coalesce(rp.reappeared_at,a.first_seen)) at time zone 'America/Kentucky/Louisville')::date) end,
    c.vin is not null,coalesce(le.event_type,case when c.vin is not null then 'PRESENT' end),
    coalesce(lo.year,vr.model_year),coalesce(lo.make,vr.make),coalesce(lo.model,vr.model),coalesce(lo.trim,vr.trim),coalesce(lo.engine,vr.engine_model),
    lo.stock_number,lo.price,lo.msrp,lo.vehicle_url,lo.source_url,'acquisition_v2_2026-09-13',
    greatest(coalesce(lo.confidence,0),coalesce(vr.confidence,0)),now(),
    jsonb_build_object('meaning','Observed DOM is time since first trusted observation in the current uninterrupted observed stint; it is not dealer DMS days-in-stock.','attribute_source',case when lo.make is not null and lo.model is not null then 'DEALER_SOURCE' when vr.vin is not null then 'NHTSA_VPIC_ENRICHMENT' else 'UNKNOWN' end)
  from agg a join lastobs lo using(vin)
  left join currentobs c using(vin)
  left join reapp rp using(vin)
  left join last_event le using(vin)
  left join public.vehicle_vin_reference vr using(vin);
end;
$$;

create or replace function public.recompute_dealer_model_metrics(p_dealer_id text)
returns void
language plpgsql
set search_path=public
as $$
declare total_current integer:=0; attributed_current integer:=0; cov numeric:=0;
begin
  select count(*),count(*) filter(where make is not null and btrim(make)<>'' and model is not null and btrim(model)<>'')
  into total_current,attributed_current from public.vin_lifecycle_current where dealer_id=p_dealer_id and currently_observed=true;
  cov:=case when total_current>0 then attributed_current::numeric/total_current else 0 end;
  delete from public.dealer_model_metrics_current where dealer_id=p_dealer_id;
  insert into public.dealer_model_metrics_current(
    dealer_id,make,model,inventory_count,dealer_inventory_share,avg_observed_dom,max_observed_dom,
    aged_30_count,aged_60_count,aged_90_count,avg_price,additions_7d,removals_7d,price_drops_7d,price_rises_7d,
    first_seen_trusted_at,last_seen_trusted_at,attribute_coverage,confidence,metric_version,calculated_at,metadata
  )
  with ev as (
    select l.make,l.model,
      count(*) filter(where e.event_type='ADDED') adds,
      count(*) filter(where e.event_type='REMOVED') removals,
      count(*) filter(where e.event_type='PRICE_DROP') drops,
      count(*) filter(where e.event_type='PRICE_RISE') rises
    from public.inventory_events e join public.vin_lifecycle_current l on l.dealer_id=e.dealer_id and l.vin=e.vin
    where e.dealer_id=p_dealer_id and e.event_at>=now()-interval '7 days'
      and l.make is not null and btrim(l.make)<>'' and l.model is not null and btrim(l.model)<>''
    group by l.make,l.model
  )
  select p_dealer_id,l.make,l.model,count(*),case when total_current>0 then count(*)::numeric/total_current else 0 end,
    avg(l.observed_dom_days),max(l.observed_dom_days),count(*) filter(where l.observed_dom_days>=30),count(*) filter(where l.observed_dom_days>=60),count(*) filter(where l.observed_dom_days>=90),
    avg(l.current_price),coalesce(ev.adds,0),coalesce(ev.removals,0),coalesce(ev.drops,0),coalesce(ev.rises,0),min(l.first_seen_trusted_at),max(l.last_seen_trusted_at),cov,coalesce(avg(l.confidence),0),'dealer_model_v0.1',now(),
    jsonb_build_object('observed_dom_semantics','Public-web trusted observation age, not DMS days-in-stock','window_days',7)
  from public.vin_lifecycle_current l left join ev on ev.make=l.make and ev.model=l.model
  where l.dealer_id=p_dealer_id and l.currently_observed=true and l.make is not null and btrim(l.make)<>'' and l.model is not null and btrim(l.model)<>''
  group by l.make,l.model,ev.adds,ev.removals,ev.drops,ev.rises;
end;
$$;

create or replace function public.recompute_observed_panel_model_metrics()
returns void
language plpgsql
set search_path=public
as $$
begin
  delete from public.observed_panel_model_metrics_current where true;
  insert into public.observed_panel_model_metrics_current(
    make,model,dealer_count,inventory_count,avg_units_per_dealer,median_units_per_dealer,avg_observed_dom,max_observed_dom,
    aged_30_count,aged_60_count,aged_90_count,additions_7d,removals_7d,net_change_7d,price_drops_7d,attribute_coverage,confidence,metric_version,calculated_at,metadata
  )
  select make,model,count(*),sum(inventory_count),avg(inventory_count),percentile_cont(0.5) within group(order by inventory_count),
    case when sum(inventory_count)>0 then sum(coalesce(avg_observed_dom,0)*inventory_count)/sum(inventory_count) end,max(max_observed_dom),
    sum(aged_30_count),sum(aged_60_count),sum(aged_90_count),sum(additions_7d),sum(removals_7d),sum(additions_7d)-sum(removals_7d),sum(price_drops_7d),
    case when sum(inventory_count)>0 then sum(attribute_coverage*inventory_count)/sum(inventory_count) else 0 end,
    case when sum(inventory_count)>0 then sum(confidence*inventory_count)/sum(inventory_count) else 0 end,
    'observed_panel_model_v0.1',now(),jsonb_build_object('scope','Observed trusted dealer panel only; not a national census')
  from public.dealer_model_metrics_current group by make,model;
end;
$$;

create or replace function public.recompute_dealer_pulse(p_dealer_id text)
returns void
language plpgsql
set search_path=public
as $$
declare
  latest_metric public.dealer_daily_metrics%rowtype; prior_metric public.dealer_daily_metrics%rowtype;
  history_days int:=0; inv_growth numeric:=0; removal_share numeric:=0; add_share numeric:=0; price_drop_share numeric:=0;
  aged30_share numeric:=0; aged60_share numeric:=0; model_concentration numeric:=0; attr_cov numeric:=0;
  seller numeric:=0; buyer numeric:=0; stat text:='INSUFFICIENT_DATA'; cov numeric:=0; conf numeric:=0;
begin
  select * into latest_metric from public.dealer_daily_metrics where dealer_id=p_dealer_id order by metric_date desc limit 1;
  if latest_metric.metric_id is null then delete from public.dealer_scores_current where dealer_id=p_dealer_id; return; end if;
  select * into prior_metric from public.dealer_daily_metrics where dealer_id=p_dealer_id and metric_date<latest_metric.metric_date order by metric_date desc limit 1;
  select count(distinct metric_date) into history_days from public.dealer_daily_metrics where dealer_id=p_dealer_id;
  cov:=coalesce(latest_metric.data_coverage,0); conf:=coalesce(latest_metric.confidence,0);
  if prior_metric.metric_id is not null and prior_metric.inventory_count>0 then inv_growth:=(latest_metric.inventory_count-prior_metric.inventory_count)::numeric/prior_metric.inventory_count; end if;
  add_share:=least(1,coalesce(latest_metric.added_count,0)::numeric/greatest(latest_metric.inventory_count,1));
  removal_share:=least(1,coalesce(latest_metric.removed_count,0)::numeric/greatest(latest_metric.inventory_count,1));
  price_drop_share:=least(1,coalesce(latest_metric.price_drop_count,0)::numeric/greatest(latest_metric.inventory_count,1));
  select coalesce(sum(aged_30_count),0)::numeric/greatest(sum(inventory_count),1),coalesce(sum(aged_60_count),0)::numeric/greatest(sum(inventory_count),1),coalesce(max(dealer_inventory_share),0),coalesce(max(attribute_coverage),0)
  into aged30_share,aged60_share,model_concentration,attr_cov from public.dealer_model_metrics_current where dealer_id=p_dealer_id;
  seller:=round(least(100,greatest(0,24*least(1,aged30_share)+12*least(1,aged60_share)+18*least(1,greatest(inv_growth,0)*4)+14*price_drop_share+12*least(1,model_concentration)+10*add_share))*100)/100;
  buyer:=round(least(100,greatest(0,30*least(1,greatest(-inv_growth,0)*4)+28*removal_share+12*least(1,coalesce(latest_metric.reappeared_count,0)::numeric/greatest(latest_metric.inventory_count,1))))*100)/100;
  conf:=least(conf,case when history_days>=14 then 1 when history_days>=7 then .75 when history_days>=3 then .5 else .25 end)*(0.6+0.4*attr_cov);
  if history_days<3 then stat:='INSUFFICIENT_DATA'; elsif seller>=25 and buyer>=25 then stat:='TWO_SIDED_ACTIVE'; elsif seller>=25 then stat:='SELLER_LEAN'; elsif buyer>=25 then stat:='BUYER_LEAN'; else stat:='NEUTRAL'; end if;
  insert into public.dealer_scores_current(dealer_id,score_version,seller_score,buyer_score,status,factor_scores,top_factors,data_coverage,confidence,calculated_at,metadata)
  values(p_dealer_id,'dealer_pulse_v0.2',seller,buyer,stat,
    jsonb_build_object('inventory_growth_ratio',inv_growth,'added_share',add_share,'removed_share',removal_share,'price_drop_share',price_drop_share,'aged_30_share',aged30_share,'aged_60_share',aged60_share,'model_concentration',model_concentration,'attribute_coverage',attr_cov,'trusted_history_days',history_days),
    jsonb_build_array(jsonb_build_object('factor','Observed aged 30+ share','value',aged30_share),jsonb_build_object('factor','Inventory growth','value',inv_growth),jsonb_build_object('factor','Trusted removals share','value',removal_share)),
    cov,conf,now(),jsonb_build_object('evidence_class','INFERENCE','warning','Directional observed-inventory pressure only. Not proof that the dealer wants to sell or buy. Observed DOM is not DMS days-in-stock.','minimum_history_days_for_status',3))
  on conflict(dealer_id) do update set score_version=excluded.score_version,seller_score=excluded.seller_score,buyer_score=excluded.buyer_score,status=excluded.status,factor_scores=excluded.factor_scores,top_factors=excluded.top_factors,data_coverage=excluded.data_coverage,confidence=excluded.confidence,calculated_at=excluded.calculated_at,metadata=excluded.metadata;
end;
$$;

create or replace function public.recompute_trusted_vin_collisions()
returns jsonb
language plpgsql
set search_path=public
as $$
declare n integer:=0;
begin
  delete from public.vin_collision_candidates where true;
  insert into public.vin_collision_candidates(idempotency_key,vin,from_dealer_id,to_dealer_id,removed_event_id,added_event_id,removed_at,added_at,gap_hours,make,model,model_year,evidence_class,confidence,candidate_status,reason,false_positive_flags,analytics_epoch,metadata)
  select md5(r.event_id::text||':'||a.event_id::text),r.vin,r.dealer_id,a.dealer_id,r.event_id,a.event_id,r.event_at,a.event_at,extract(epoch from(a.event_at-r.event_at))/3600.0,
    coalesce(l.make,vr.make),coalesce(l.model,vr.model),coalesce(l.year,vr.model_year),'INFERENCE',
    case when extract(epoch from(a.event_at-r.event_at))/3600.0<=24 then .72 when extract(epoch from(a.event_at-r.event_at))/3600.0<=72 then .64 else .55 end,
    'DEALER_CHANGE_CANDIDATE','VIN was no longer observed at one dealer in a trusted COMPLETE scan and was subsequently added/reappeared at another trusted dealer within 14 days. This is a movement lead, not proof of a transaction.',
    jsonb_build_array('shared_feed_possible','same_group_unknown','syndication_possible','stale_listing_possible','auction_or_intermediary_possible','scrape_timing_difference_possible'),
    'acquisition_v2_2026-09-13',jsonb_build_object('window_days',14,'derivation','trusted REMOVED -> trusted ADDED/REAPPEARED','transaction_confirmed',false)
  from public.inventory_events r join lateral(
    select e.* from public.inventory_events e where e.vin=r.vin and e.dealer_id<>r.dealer_id and e.event_type in('ADDED','REAPPEARED') and e.event_at>=r.event_at and e.event_at<=r.event_at+interval '14 days' order by e.event_at asc limit 1
  ) a on true
  left join public.vin_lifecycle_current l on l.dealer_id=a.dealer_id and l.vin=r.vin
  left join public.vehicle_vin_reference vr on vr.vin=r.vin
  where r.event_type='REMOVED' and r.analytics_epoch='acquisition_v2_2026-09-13' and a.analytics_epoch='acquisition_v2_2026-09-13';
  get diagnostics n=row_count;
  return jsonb_build_object('candidates',n,'refreshed_at',now(),'evidence_class','INFERENCE');
end;
$$;

create or replace function public.refresh_dealer_pulse_metrics(p_dealer_id text)
returns void
language plpgsql
set search_path=public
as $$
begin
  perform public.recompute_vin_lifecycle(p_dealer_id);
  perform public.recompute_dealer_model_metrics(p_dealer_id);
  perform public.recompute_observed_panel_model_metrics();
  perform public.recompute_dealer_pulse(p_dealer_id);
end;
$$;

create or replace function public.refresh_all_dealer_pulse_analytics()
returns jsonb
language plpgsql
set search_path=public
as $$
declare d record; n integer:=0;
begin
  for d in select distinct dealer_id from public.dealer_inventory_snapshots where analytics_eligible=true loop
    perform public.recompute_vin_lifecycle(d.dealer_id);
    perform public.recompute_dealer_model_metrics(d.dealer_id);
    perform public.recompute_dealer_pulse(d.dealer_id);
    n:=n+1;
  end loop;
  perform public.recompute_observed_panel_model_metrics();
  perform public.recompute_trusted_vin_collisions();
  return jsonb_build_object('dealers_refreshed',n,'refreshed_at',now());
end;
$$;

create or replace function public.process_trusted_inventory_snapshot(p_snapshot_id uuid)
returns jsonb
language plpgsql
set search_path=public
as $$
declare cur public.dealer_inventory_snapshots%rowtype; prev public.dealer_inventory_snapshots%rowtype; eligible boolean:=false; reason text; validation text; added_n int:=0; removed_n int:=0; drop_n int:=0; rise_n int:=0; reapp_n int:=0; d date;
begin
  select * into cur from public.dealer_inventory_snapshots where snapshot_id=p_snapshot_id;
  if cur.snapshot_id is null then raise exception 'snapshot not found'; end if;
  eligible:=cur.coverage_status='COMPLETE' and (cur.adapter_name='dealeron-pagination-v2' or (cur.adapter_name in('dealer-dot-com-jsonld-v2','dealer-inspire-cars-commerce-v7','github-browser-v3') and cur.reported_total is not null and cur.reported_total=cur.vin_count));
  reason:=case when cur.coverage_status<>'COMPLETE' then 'Excluded: coverage not COMPLETE' when cur.adapter_name='dealeron-pagination-v2' then 'Eligible: exhaustive DealerOn pagination adapter' when cur.adapter_name in('dealer-dot-com-jsonld-v2','dealer-inspire-cars-commerce-v7','github-browser-v3') and cur.reported_total=cur.vin_count then 'Eligible: trusted adapter generation with exact reported-total reconciliation' else 'Excluded: adapter generation or reconciliation not approved for analytics' end;
  validation:=case when cur.adapter_name='dealeron-pagination-v2' and cur.coverage_status='COMPLETE' then 'EXHAUSTIVE_PAGINATION' when eligible then 'REPORTED_TOTAL_RECONCILIATION' else 'NOT_ANALYTICS_ELIGIBLE' end;
  update public.dealer_inventory_snapshots set analytics_eligible=eligible,analytics_reason=reason,validation_method=validation,trust_epoch='acquisition_v2_2026-09-13' where snapshot_id=p_snapshot_id;
  if not eligible then return jsonb_build_object('eligible',false,'snapshot_id',p_snapshot_id,'reason',reason); end if;
  select * into prev from public.dealer_inventory_snapshots where dealer_id=cur.dealer_id and analytics_eligible=true and observed_at<cur.observed_at order by observed_at desc limit 1;
  if prev.snapshot_id is not null then
    insert into public.inventory_events(idempotency_key,dealer_id,vin,event_type,previous_snapshot_id,snapshot_id,previous_observation_id,observation_id,previous_price,current_price,event_at,evidence_class,confidence,source_url,analytics_epoch,metadata)
    select md5(cur.dealer_id||':'||c.vin||':PRESENT:'||cur.snapshot_id::text),cur.dealer_id,c.vin,'PRESENT',prev.snapshot_id,cur.snapshot_id,p.observation_id,c.observation_id,p.price,c.price,cur.observed_at,'STRUCTURED_DATA',least(coalesce(p.confidence,1),coalesce(c.confidence,1)),c.source_url,'acquisition_v2_2026-09-13','{}'::jsonb from public.dealer_vehicle_observations c join public.dealer_vehicle_observations p on p.snapshot_id=prev.snapshot_id and p.vin=c.vin where c.snapshot_id=cur.snapshot_id on conflict(idempotency_key) do nothing;
    insert into public.inventory_events(idempotency_key,dealer_id,vin,event_type,previous_snapshot_id,snapshot_id,observation_id,current_price,event_at,evidence_class,confidence,source_url,analytics_epoch,metadata)
    select md5(cur.dealer_id||':'||c.vin||':ADDED:'||cur.snapshot_id::text),cur.dealer_id,c.vin,case when exists(select 1 from public.inventory_events e where e.dealer_id=cur.dealer_id and e.vin=c.vin and e.event_type='REMOVED' and e.event_at<cur.observed_at) then 'REAPPEARED' else 'ADDED' end,prev.snapshot_id,cur.snapshot_id,c.observation_id,c.price,cur.observed_at,'STRUCTURED_DATA',coalesce(c.confidence,1),c.source_url,'acquisition_v2_2026-09-13','{}'::jsonb from public.dealer_vehicle_observations c left join public.dealer_vehicle_observations p on p.snapshot_id=prev.snapshot_id and p.vin=c.vin where c.snapshot_id=cur.snapshot_id and p.vin is null on conflict(idempotency_key) do nothing;
    insert into public.inventory_events(idempotency_key,dealer_id,vin,event_type,previous_snapshot_id,snapshot_id,previous_observation_id,previous_price,event_at,evidence_class,confidence,source_url,analytics_epoch,metadata)
    select md5(cur.dealer_id||':'||p.vin||':REMOVED:'||cur.snapshot_id::text),cur.dealer_id,p.vin,'REMOVED',prev.snapshot_id,cur.snapshot_id,p.observation_id,p.price,cur.observed_at,'STRUCTURED_DATA',coalesce(p.confidence,1),p.source_url,'acquisition_v2_2026-09-13',jsonb_build_object('meaning','No longer observed in later trusted COMPLETE snapshot; not proof of sale') from public.dealer_vehicle_observations p left join public.dealer_vehicle_observations c on c.snapshot_id=cur.snapshot_id and c.vin=p.vin where p.snapshot_id=prev.snapshot_id and c.vin is null on conflict(idempotency_key) do nothing;
    insert into public.inventory_events(idempotency_key,dealer_id,vin,event_type,previous_snapshot_id,snapshot_id,previous_observation_id,observation_id,previous_price,current_price,event_at,evidence_class,confidence,source_url,analytics_epoch,metadata)
    select md5(cur.dealer_id||':'||c.vin||':'||(case when c.price<p.price then 'PRICE_DROP' else 'PRICE_RISE' end)||':'||cur.snapshot_id::text),cur.dealer_id,c.vin,case when c.price<p.price then 'PRICE_DROP' else 'PRICE_RISE' end,prev.snapshot_id,cur.snapshot_id,p.observation_id,c.observation_id,p.price,c.price,cur.observed_at,'STRUCTURED_DATA',least(coalesce(p.confidence,1),coalesce(c.confidence,1)),c.source_url,'acquisition_v2_2026-09-13','{}'::jsonb from public.dealer_vehicle_observations c join public.dealer_vehicle_observations p on p.snapshot_id=prev.snapshot_id and p.vin=c.vin where c.snapshot_id=cur.snapshot_id and c.price is not null and p.price is not null and c.price<>p.price on conflict(idempotency_key) do nothing;
  end if;
  d:=(cur.observed_at at time zone 'America/Kentucky/Louisville')::date;
  select count(*) filter(where event_type='ADDED'),count(*) filter(where event_type='REMOVED'),count(*) filter(where event_type='PRICE_DROP'),count(*) filter(where event_type='PRICE_RISE'),count(*) filter(where event_type='REAPPEARED') into added_n,removed_n,drop_n,rise_n,reapp_n from public.inventory_events where dealer_id=cur.dealer_id and (event_at at time zone 'America/Kentucky/Louisville')::date=d;
  insert into public.dealer_daily_metrics(idempotency_key,dealer_id,metric_date,inventory_count,added_count,removed_count,price_drop_count,price_rise_count,reappeared_count,first_trusted_snapshot_at,last_trusted_snapshot_at,trusted_snapshot_count,data_coverage,confidence,metric_version,calculated_at,metadata)
  select cur.dealer_id||':'||d::text,cur.dealer_id,d,cur.vin_count,added_n,removed_n,drop_n,rise_n,reapp_n,min(observed_at),max(observed_at),count(*),1,avg(confidence),'dealer_daily_v0.3',now(),jsonb_build_object('analytics_epoch','acquisition_v2_2026-09-13','timezone','America/Kentucky/Louisville') from public.dealer_inventory_snapshots where dealer_id=cur.dealer_id and analytics_eligible=true and (observed_at at time zone 'America/Kentucky/Louisville')::date=d
  on conflict(idempotency_key) do update set inventory_count=excluded.inventory_count,added_count=excluded.added_count,removed_count=excluded.removed_count,price_drop_count=excluded.price_drop_count,price_rise_count=excluded.price_rise_count,reappeared_count=excluded.reappeared_count,last_trusted_snapshot_at=excluded.last_trusted_snapshot_at,trusted_snapshot_count=excluded.trusted_snapshot_count,data_coverage=excluded.data_coverage,confidence=excluded.confidence,metric_version=excluded.metric_version,calculated_at=excluded.calculated_at,metadata=excluded.metadata;
  perform public.refresh_dealer_pulse_metrics(cur.dealer_id);
  return jsonb_build_object('eligible',true,'snapshot_id',p_snapshot_id,'dealer_id',cur.dealer_id,'added',added_n,'removed',removed_n,'price_drops',drop_n,'price_rises',rise_n,'reappeared',reapp_n);
end;
$$;

create or replace function public.on_complete_dealer_scan_process_pulse()
returns trigger language plpgsql set search_path=public as $$
declare sid uuid;
begin
  if new.status='COMPLETE' and old.status is distinct from 'COMPLETE' then
    select snapshot_id into sid from public.dealer_inventory_snapshots where run_id=new.run_id order by observed_at desc limit 1;
    if sid is not null then perform public.process_trusted_inventory_snapshot(sid); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_complete_dealer_scan_process_pulse on public.dealer_scan_runs;
create trigger trg_complete_dealer_scan_process_pulse after update of status on public.dealer_scan_runs for each row execute function public.on_complete_dealer_scan_process_pulse();

create or replace function public.on_inventory_event_refresh_collision()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.event_type in('REMOVED','ADDED','REAPPEARED') then perform public.recompute_trusted_vin_collisions(); end if;
  return new;
end;
$$;

drop trigger if exists trg_inventory_event_refresh_collision on public.inventory_events;
create trigger trg_inventory_event_refresh_collision after insert on public.inventory_events for each row execute function public.on_inventory_event_refresh_collision();

revoke execute on function public.pending_vin_reference_enrichment(integer),public.recompute_vin_lifecycle(text),public.recompute_dealer_model_metrics(text),public.recompute_observed_panel_model_metrics(),public.recompute_dealer_pulse(text),public.recompute_trusted_vin_collisions(),public.refresh_dealer_pulse_metrics(text),public.refresh_all_dealer_pulse_analytics(),public.process_trusted_inventory_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.pending_vin_reference_enrichment(integer),public.recompute_vin_lifecycle(text),public.recompute_dealer_model_metrics(text),public.recompute_observed_panel_model_metrics(),public.recompute_dealer_pulse(text),public.recompute_trusted_vin_collisions(),public.refresh_dealer_pulse_metrics(text),public.refresh_all_dealer_pulse_analytics(),public.process_trusted_inventory_snapshot(uuid) to service_role;
