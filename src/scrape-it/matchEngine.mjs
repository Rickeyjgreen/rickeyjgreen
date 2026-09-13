const norm = (value) => String(value ?? '').trim().toLowerCase();
const same = (a, b) => norm(a) && norm(a) === norm(b);
const includes = (a, b) => norm(a) && norm(b) && norm(a).includes(norm(b));

function freshnessPoints(observedAt) {
  if (!observedAt) return { points: 0, label: 'observation time unknown' };
  const hours = (Date.now() - new Date(observedAt).getTime()) / 36e5;
  if (hours <= 24) return { points: 10, label: 'observed within 24h' };
  if (hours <= 72) return { points: 6, label: 'observed within 72h' };
  if (hours <= 168) return { points: 3, label: 'observed within 7d' };
  return { points: 0, label: 'older observation' };
}

function fieldScore(row, need) {
  let score = 0;
  const matched = [];
  const unknown = [];
  const conflicts = [];

  const checks = [
    ['vin', 100, 'VIN'],
    ['year', 18, 'year'],
    ['make', 24, 'make'],
    ['model', 30, 'model'],
    ['trim', 12, 'trim'],
    ['engine', 8, 'engine'],
    ['stock_number', 8, 'stock'],
  ];

  for (const [field, points, label] of checks) {
    const wanted = need[field];
    if (!norm(wanted)) continue;
    const actual = row[field];
    if (!norm(actual)) { unknown.push(label); continue; }
    const hit = field === 'model' || field === 'trim' || field === 'engine'
      ? (same(actual, wanted) || includes(actual, wanted) || includes(wanted, actual))
      : same(actual, wanted);
    if (hit) { score += points; matched.push(label); }
    else conflicts.push(label);
  }

  return { score, matched, unknown, conflicts };
}

export function buildVehicleCandidates(dealers = []) {
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
      zip: dealer.zip,
      region: dealer.region,
      observed_at: snapshot?.observed_at || null,
      complete,
      material_change: Boolean(dealer.latest_change?.material),
      dealer_signal_bucket: dealer.latest_signal?.bucket || null,
    }));
  });
}

export function rankMatches(dealers = [], need = {}) {
  const rows = buildVehicleCandidates(dealers);
  const requestedIdentityFields = ['vin','year','make','model','trim','engine','stock_number'].filter((field) => norm(need[field]));
  const results = [];

  for (const row of rows) {
    const fields = fieldScore(row, need);
    if (requestedIdentityFields.length && fields.matched.length === 0) continue;
    if (fields.conflicts.includes('VIN') || fields.conflicts.includes('year') || fields.conflicts.includes('make') || fields.conflicts.includes('model')) continue;

    let score = fields.score;
    const reasons = fields.matched.map((field) => `${field} match`);
    const uncertainty = [];

    if (row.complete) { score += 15; reasons.push('COMPLETE inventory evidence'); }
    else uncertainty.push('dealer snapshot is OBSERVED/INCOMPLETE');

    const fresh = freshnessPoints(row.observed_at);
    score += fresh.points;
    reasons.push(fresh.label);

    if (norm(need.destination_state) && same(row.state, need.destination_state)) {
      score += 8;
      reasons.push('same-state geography proxy');
    } else if (norm(need.destination_region) && same(row.region, need.destination_region)) {
      score += 5;
      reasons.push('same-region geography proxy');
    }

    if (row.material_change) { score += 5; reasons.push('recent material inventory delta'); }
    if (row.dealer_signal_bucket === 'VERIFY') { score += 4; reasons.push('existing dealer VERIFY signal'); }
    if (fields.unknown.length) uncertainty.push(`identity fields unavailable: ${fields.unknown.join(', ')}`);
    if (!row.complete) uncertainty.push('absence/movement cannot be inferred from this snapshot');

    const bucket = score >= 75 ? 'NOW' : score >= 50 ? 'NEXT' : score >= 25 ? 'VERIFY' : 'WATCH';
    results.push({ ...row, match_score: score, bucket, reasons, uncertainty, matched_fields: fields.matched });
  }

  return results.sort((a, b) => b.match_score - a.match_score || a.dealer_name.localeCompare(b.dealer_name));
}

export function groupDealerMatches(matches = []) {
  const grouped = new Map();
  for (const match of matches) {
    if (!grouped.has(match.dealer_id)) grouped.set(match.dealer_id, { dealer_id: match.dealer_id, dealer_name: match.dealer_name, city: match.city, state: match.state, region: match.region, best_score: match.match_score, bucket: match.bucket, vehicles: [], reasons: new Set(), uncertainty: new Set() });
    const dealer = grouped.get(match.dealer_id);
    dealer.best_score = Math.max(dealer.best_score, match.match_score);
    dealer.vehicles.push(match);
    match.reasons.forEach((reason) => dealer.reasons.add(reason));
    match.uncertainty.forEach((item) => dealer.uncertainty.add(item));
  }
  return [...grouped.values()].map((dealer) => ({ ...dealer, reasons: [...dealer.reasons], uncertainty: [...dealer.uncertainty] })).sort((a, b) => b.best_score - a.best_score || a.dealer_name.localeCompare(b.dealer_name));
}

export function buildAccessHandoff(grouped = [], limit = 5) {
  return grouped.slice(0, limit).map((dealer, index) => ({
    rank: index + 1,
    dealer_id: dealer.dealer_id,
    dealer_name: dealer.dealer_name,
    location: [dealer.city, dealer.state].filter(Boolean).join(', '),
    candidate_vins: dealer.vehicles.slice(0, 8).map((vehicle) => vehicle.vin),
    action: 'Open dealer in Access and verify current inventory / availability before calling.',
    evidence_status: dealer.vehicles.every((vehicle) => vehicle.complete) ? 'COMPLETE_PUBLIC_SITE' : 'OBSERVED_PUBLIC_SITE',
  }));
}
