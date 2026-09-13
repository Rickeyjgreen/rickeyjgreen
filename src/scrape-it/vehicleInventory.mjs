export function buildVehicleRows(dealers = []) {
  return dealers.flatMap((dealer) => {
    const snapshot = dealer.latest_snapshot;
    const vehicles = Array.isArray(snapshot?.vehicles) ? snapshot.vehicles : [];
    const complete = dealer.latest_run?.status === 'COMPLETE' && snapshot?.coverage_status === 'COMPLETE';
    return vehicles.map((vehicle) => ({
      ...vehicle,
      dealer_id: dealer.dealer_id,
      dealer_name: dealer.dealer_name,
      city: dealer.city,
      state: dealer.state,
      region: dealer.region,
      observed_at: snapshot?.observed_at || null,
      coverage_status: complete ? 'COMPLETE' : 'OBSERVED',
      complete,
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
