import React, { useEffect, useMemo, useState } from 'react';
import { loadDealerState } from './backendClient.mjs';
import { buildVehicleRows, filterVehicleRows } from './vehicleInventory.mjs';

export default function VehicleInventoryPanel() {
  const [state, setState] = useState({ dealers: [] });
  const [query, setQuery] = useState('');
  const [coverage, setCoverage] = useState('ALL');
  const [region, setRegion] = useState('ALL');

  useEffect(() => { loadDealerState().then(setState).catch(() => {}); }, []);

  const rows = useMemo(() => buildVehicleRows(state.dealers), [state.dealers]);
  const regions = useMemo(() => ['ALL', ...new Set(rows.map((r) => r.region).filter(Boolean))].sort(), [rows]);
  const visible = useMemo(() => filterVehicleRows(rows, { query, coverage, region }), [rows, query, coverage, region]);
  const complete = rows.filter((r) => r.complete).length;

  return <section className="si-panel">
    <div className="si-section-head"><div><p className="si-kicker">Vehicle inventory</p><h2>Search latest observed VINs across Rickey's dealer book</h2></div></div>
    <div className="si-grid si-grid-3">
      <article className="si-metric"><span>Observed VIN rows</span><strong>{rows.length}</strong><small>Latest dealer snapshots</small></article>
      <article className="si-metric"><span>COMPLETE evidence</span><strong>{complete}</strong><small>Eligible for complete-to-complete movement comparison</small></article>
      <article className="si-metric"><span>Observed only</span><strong>{rows.length - complete}</strong><small>Useful evidence; absence not established</small></article>
    </div>
    <div className="di-toolbar">
      <label><input placeholder="VIN, year, make, model, trim, engine, stock, dealer" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <select value={coverage} onChange={(e) => setCoverage(e.target.value)}><option value="ALL">All evidence</option><option value="COMPLETE">COMPLETE only</option><option value="OBSERVED">Observed only</option></select>
      <select value={region} onChange={(e) => setRegion(e.target.value)}>{regions.map((r) => <option key={r}>{r}</option>)}</select>
      <span>{visible.length} visible</span>
    </div>
    <div className="di-list">{visible.slice(0,300).map((row, i) => <article className="di-row" key={`${row.dealer_id}-${row.vin}-${i}`}>
      <div className="di-main"><div className="di-name"><strong>{[row.year,row.make,row.model].filter(Boolean).join(' ') || 'Vehicle identity pending'}</strong><span>{row.vin}</span></div><div className="di-loc">{row.dealer_name} · {row.city}, {row.state}</div></div>
      <div className="di-state"><div><span>Trim / engine</span><strong>{[row.trim,row.engine].filter(Boolean).join(' · ') || 'Enrichment pending'}</strong></div><div><span>Stock</span><strong>{row.stock_number || '—'}</strong></div><div><span>Price / MSRP</span><strong>{row.price ? `$${Number(row.price).toLocaleString()}` : '—'}{row.msrp ? ` / $${Number(row.msrp).toLocaleString()}` : ''}</strong></div></div>
      <div className="di-action"><span className={`di-badge ${row.complete ? 'di-good' : 'di-warn'}`}>{row.coverage_status}</span><small>{row.observed_at ? new Date(row.observed_at).toLocaleString() : 'Observed time unavailable'}</small></div>
    </article>)}</div>
    <div className="di-foot"><strong>Truth rule:</strong> OBSERVED means present in the latest captured snapshot. Only COMPLETE-to-COMPLETE comparisons may support addition/removal movement signals.</div>
  </section>;
}
