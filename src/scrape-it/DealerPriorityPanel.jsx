import React, { useEffect, useMemo, useState } from 'react';
import { loadDealerState } from './backendClient.mjs';
import { rankDealers } from './dealerPriority.mjs';

export default function DealerPriorityPanel() {
  const [state, setState] = useState({ dealers: [] });
  useEffect(() => { loadDealerState().then(setState).catch(() => {}); }, []);
  const ranked = useMemo(() => rankDealers(state.dealers).slice(0, 12), [state.dealers]);

  return <section className="si-panel">
    <div className="si-section-head"><div><p className="si-kicker">Rickey priority queue</p><h2>Which dealers deserve attention first</h2><p>Ranking uses only measured scan/change evidence. It does not infer dealer willingness, buyer need, or a completed sale.</p></div></div>
    <div className="di-list">{ranked.map((dealer, index) => <article className="di-row" key={dealer.dealer_id}>
      <div className="di-main"><div className="di-name"><strong>#{index + 1} {dealer.dealer_name}</strong><span>DLR #{dealer.dealer_id}</span></div><div className="di-loc">{dealer.city}, {dealer.state} · {dealer.region}</div></div>
      <div className="di-state"><div><span>Priority</span><strong>{dealer.priority.bucket} · {dealer.priority.score}</strong></div><div><span>Latest scan</span><strong>{dealer.latest_run?.status || 'UNSCANNED'}</strong></div><div><span>VINs observed</span><strong>{dealer.latest_snapshot?.vin_count || 0}</strong></div></div>
      <div className="di-action"><span className={`di-badge ${dealer.priority.bucket === 'NOW' ? 'di-good' : dealer.priority.bucket === 'NEXT' ? 'di-warn' : 'di-idle'}`}>{dealer.priority.bucket}</span><small>{dealer.priority.reasons.join(' · ') || 'No elevated evidence yet'}</small></div>
    </article>)}</div>
    <div className="di-foot"><strong>Recommended use:</strong> this queue tells Rickey where to inspect Access or make a verification call first. It is prioritization, not proof of propensity.</div>
  </section>;
}
