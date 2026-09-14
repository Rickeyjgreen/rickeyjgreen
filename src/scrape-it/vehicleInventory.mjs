export function buildVehicleRows(dealers = []) {
  return dealers.flatMap((dealer) => {
    const snapshot = dealer.latest_snapshot;
    const lifecycleVehicles = Array.isArray(dealer.current_vehicles) ? dealer.current_vehicles : [];
    const rawVehicles = Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [];
    const vehicles = lifecycleVehicles.length ? lifecycleVehicles : rawVehicles;
    const platform = snapshot?.platform || dealer.latest_run?.platform || null;
    const adapter = snapshot?.adapter_name || dealer.latest_run?.adapter_name || '';
    const unsafeDealerInspire = platform === 'DEALERINSPIRE' && /^github-browser-v\d+/i.test(adapter);
    if (unsafeDealerInspire && !lifecycleVehicles.length) return [];
    const complete = dealer.current_coverage?.status === 'COMPLETE' || (dealer.latest_run?.status === 'COMPLETE' && snapshot?.coverage_status === 'COMPLETE');
    return vehicles.map((vehicle) => ({
      ...vehicle,
      dealer_id: dealer.dealer_id,
      dealer_name: dealer.dealer_name,
      city: dealer.city,
      state: dealer.state,
      region: dealer.region,
      observed_at: vehicle.observed_at || snapshot?.observed_at || null,
      coverage_status: complete ? 'COMPLETE' : 'OBSERVED',
      complete,
      inventory_source: lifecycleVehicles.length ? 'ENRICHED_CURRENT_LIFECYCLE' : 'RAW_SNAPSHOT',
    }));
  });
}

export function filterVehicleRows(rows, { query = '', coverage = 'ALL', region = 'ALL' } = {}) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    const haystack = [row.vin,row.year,row.make,row.model,row.trim,row.engine,row.stock_number,row.dealer_name,row.city,row.state].filter(Boolean).join(' ').toLowerCase();
    const queryMatch = !needle || haystack.includes(needle);
    const coverageMatch = coverage === 'ALL' || (coverage === 'COMPLETE' ? row.complete : !row.complete);
    const regionMatch = region === 'ALL' || row.region === region;
    return queryMatch && coverageMatch && regionMatch;
  });
}
