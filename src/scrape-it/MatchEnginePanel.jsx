import React, { useEffect, useMemo, useState } from 'react';
import { loadDealerState } from './backendClient.mjs';
import { buildAccessHandoff, groupDealerMatches, rankMatches } from './matchEngine.mjs';

const EMPTY_NEED = { vin:'', year:'', make:'', model:'', trim:'', engine:'', stock_number:'', quantity:1, destination_state:'', destination_region:'' };

function Input({ label, field, need, setNeed, type='text', placeholder='' }) {
  return <label>{label}<input type={type} placeholder={placeholder} value={need[field]} onChange={(e) => setNeed({ ...need, [field]: type === 'number' ? Number(e.target.value || 0) : e.target.value })} /></label>;
}

export default function MatchEnginePanel() {
  const [state, setState] = useState({ dealers: [] });
  const [need, setNeed] = useState(EMPTY_NEED);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadDealerState().then(setState).catch(() => {}); }, []);

  const matches = useMemo(() => submitted ? rankMatches(state.dealers, need) : [], [state.dealers, need, submitted]);
  const dealers = useMemo(() => groupDealerMatches(matches), [matches]);
  const handoff = useMemo(() => buildAccessHandoff(dealers, 5), [dealers]);

  const requirement = [need.year, need.make, need.model, need.trim, need.engine, need.vin && `VIN ${need.vin}`].filter(Boolean).join(' ') || 'No vehicle requirement entered';

  async function copyHandoff() {
    const lines = [`ACCESS CHECK — ${requirement}`, `Qty: ${need.quantity || 1}`, ''];
    for (const item of handoff) {
      lines.push(`${item.rank}. DLR #${item.dealer_id} — ${item.dealer_name} (${item.location})`);
      lines.push(`   VINs: ${item.candidate_vins.join(', ') || 'identity pending'}`);
      lines.push(`   Evidence: ${item.evidence_status}`);
      lines.push(`   Action: ${item.action}`);
    }
    lines.push('', 'Public-site evidence is a verification lead, not proof of dealer willingness, sale, trade, or current Access inventory.');
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  return <section className="si-panel">
    <div className="si-section-head">
      <div><p className="si-kicker">Rickey Match Engine</p><h2>Need → ranked dealer candidates → Access handoff</h2><p>Rankings use observed vehicle identity, evidence completeness, freshness, and geography proxies. Dealer willingness remains UNKNOWN until verified.</p></div>
      <span className="di-badge di-good">RECOMMENDED STATE</span>
    </div>

    <div className="si-query-grid">
      <Input label="Year" field="year" need={need} setNeed={setNeed} type="number" placeholder="2025" />
      <Input label="Make" field="make" need={need} setNeed={setNeed} placeholder="Chevrolet" />
      <Input label="Model" field="model" need={need} setNeed={setNeed} placeholder="Silverado 1500" />
      <Input label="Trim" field="trim" need={need} setNeed={setNeed} placeholder="RST" />
      <Input label="Engine" field="engine" need={need} setNeed={setNeed} placeholder="6.2L" />
      <Input label="VIN (optional exact match)" field="vin" need={need} setNeed={setNeed} />
      <Input label="Quantity" field="quantity" need={need} setNeed={setNeed} type="number" />
      <Input label="Destination state" field="destination_state" need={need} setNeed={setNeed} placeholder="KY" />
      <label>Destination region<select value={need.destination_region} onChange={(e) => setNeed({ ...need, destination_region:e.target.value })}><option value="">Any</option><option>MW</option><option>NE</option><option>SE</option><option>SC</option><option>NC</option><option>WE</option></select></label>
      <button className="si-primary" onClick={() => setSubmitted(true)}>Rank my book</button>
    </div>

    {submitted && <>
      <div className="si-grid si-grid-3">
        <article className="si-metric"><span>Vehicle candidates</span><strong>{matches.length}</strong><small>Observed rows matching known identity fields</small></article>
        <article className="si-metric"><span>Dealer candidates</span><strong>{dealers.length}</strong><small>Ranked rooftops in Rickey's current book</small></article>
        <article className="si-metric"><span>Access first</span><strong>{handoff.length}</strong><small>Top dealer IDs to verify manually</small></article>
      </div>

      <div className="di-list">{dealers.slice(0, 12).map((dealer, index) => <article className="di-row" key={dealer.dealer_id}>
        <div className="di-main"><div className="di-name"><strong>#{index + 1} {dealer.dealer_name}</strong><span>DLR #{dealer.dealer_id}</span></div><div className="di-loc">{dealer.city}, {dealer.state} · {dealer.region}</div></div>
        <div className="di-state"><div><span>Match score</span><strong>{dealer.best_score}</strong></div><div><span>Candidate VINs</span><strong>{dealer.vehicles.length}</strong></div><div><span>Top VIN</span><strong>{dealer.vehicles[0]?.vin || '—'}</strong></div></div>
        <div className="di-action"><span className={`di-badge ${dealer.bucket === 'NOW' ? 'di-good' : dealer.bucket === 'NEXT' ? 'di-warn' : 'di-idle'}`}>{dealer.bucket}</span><small>{dealer.reasons.slice(0,4).join(' · ')}</small>{dealer.uncertainty.length > 0 && <small className="di-incomplete">UNKNOWN: {dealer.uncertainty.slice(0,2).join(' · ')}</small>}</div>
      </article>)}</div>

      {!dealers.length && <div className="si-empty"><h3>No defensible match yet</h3><p>The current captured rows do not contain enough matching vehicle identity. Verify the need in Access or wait for richer scanner/enrichment data rather than inventing a match.</p></div>}

      <div className="di-foot"><strong>Access handoff:</strong> {handoff.length ? `Check dealer IDs ${handoff.map((x) => x.dealer_id).join(', ')} first.` : 'No dealer IDs can be recommended from current evidence.'} {handoff.length > 0 && <button onClick={copyHandoff}>{copied ? 'Copied' : 'Copy Access checklist'}</button>}</div>
    </>}

    <div className="di-foot"><strong>Truth model:</strong> vehicle/dealer observations = STRUCTURED DATA. Ranking = INFERENCE. Current Access inventory, dealer willingness, price acceptance, and seller intent remain UNKNOWN until verified.</div>
  </section>;
}
