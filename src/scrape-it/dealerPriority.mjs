export function scoreDealerPriority(dealer) {
  const run = dealer.latest_run;
  const snapshot = dealer.latest_snapshot;
  const change = dealer.latest_change;
  const signal = dealer.latest_signal;
  const complete = run?.status === 'COMPLETE' && snapshot?.coverage_status === 'COMPLETE';
  let score = 0;
  const reasons = [];

  if (complete) { score += 25; reasons.push('complete public inventory coverage'); }
  if (change?.material) { score += 30; reasons.push('material inventory delta requires verification'); }
  if (signal?.bucket === 'VERIFY') { score += 20; reasons.push('existing VERIFY signal'); }
  const vinCount = Number(snapshot?.vin_count || 0);
  if (vinCount >= 50) { score += 10; reasons.push('large observed new-inventory set'); }
  else if (vinCount >= 20) { score += 5; reasons.push('meaningful observed inventory depth'); }
  if (run?.status === 'INCOMPLETE') { score += 5; reasons.push('coverage gap worth resolving'); }
  if (run?.status === 'ERROR') { score -= 10; reasons.push('scanner evidence currently blocked'); }

  const bucket = score >= 55 ? 'NOW' : score >= 30 ? 'NEXT' : score >= 10 ? 'VERIFY' : 'WATCH';
  return { score, bucket, reasons };
}

export function rankDealers(dealers = []) {
  return dealers.map((dealer) => ({ ...dealer, priority: scoreDealerPriority(dealer) }))
    .sort((a, b) => b.priority.score - a.priority.score || a.dealer_name.localeCompare(b.dealer_name));
}
