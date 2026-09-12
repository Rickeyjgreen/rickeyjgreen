import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, ExternalLink, MapPin, Radar, RefreshCw, Search, ShieldCheck, Truck } from 'lucide-react';
import { loadDealerState, scanDealerInventory, scanDealerBatch } from './backendClient.mjs';
import './dealer-intel.css';

function tone(status) {
  if (status === 'COMPLETE') return 'good';
  if (status === 'INCOMPLETE') return 'warn';
  if (status === 'ERROR') return 'bad';
  return 'idle';
}

function Badge({ children, kind = 'idle' }) {
  return <span className={`di-badge di-${kind}`}>{children}</span>;
}

function DealerRow({ dealer, onScan, busy }) {
  const run = dealer.latest_run;
  const snap = dealer.latest_snapshot;
  const change = dealer.latest_change;
  const signal = dealer.latest_signal;
  const verified = run?.status === 'COMPLETE' && snap?.coverage_status === 'COMPLETE';
  return <article className="di-row">
    <div className="di-main">
      <div className="di-name"><strong>{dealer.dealer_name}</strong><span>DLR #{dealer.dealer_id}</span></div>
      <div className="di-loc"><MapPin size={14} />{dealer.city}, {dealer.state} {dealer.zip} · {dealer.region}</div>
      <div className="di-links"><a href={dealer.website} target="_blank" rel="noreferrer">Dealer site <ExternalLink size={13} /></a>{run?.inventory_url && <a href={run.inventory_url} target="_blank" rel="noreferrer">Observed source <ExternalLink size={13} /></a>}</div>
    </div>
    <div className="di-state">
      <Badge kind={tone(run?.status)}>{run?.status || 'UNSCANNED'}</Badge>
      <div><span>Verified new VINs</span><strong>{verified ? snap.vin_count : '—'}</strong></div>
      <div><span>Platform / adapter</span><strong>{run?.platform ? `${run.platform} · ${run.adapter_name || 'adapter pending'}` : '—'}</strong></div>
      <div><span>Coverage proof</span><strong>{run?.coverage_status || '—'}</strong></div>
      <div><span>Pages / reported</span><strong>{run ? `${run.pages_scanned || 0} / ${run.reported_total ?? 'n/a'}` : '—'}</strong></div>
      <div><span>Latest signal</span><strong>{verified ? (change?.change_type || '—') : 'WITHHELD'}</strong></div>
      <div><span>Delta</span><strong>{verified && change ? `+${change.added_count} / -${change.removed_count}` : '—'}</strong></div>
    </div>
    <div className="di-action">
      <button onClick={() => onScan(dealer.dealer_id)} disabled={busy}><RefreshCw size={15} className={busy ? 'si-spin' : ''} /> {busy ? 'Scanning…' : 'Scan dealer'}</button>
      {run?.completeness_reason && <p className="di-reason">{run.completeness_reason}</p>}
      {verified && signal && <div className="di-signal"><Badge kind={signal.bucket === 'VERIFY' ? 'warn' : 'idle'}>{signal.bucket}</Badge><p>{signal.recommended_next_step}</p></div>}
      {run?.status === 'ERROR' && <small className="di-error">{run.error_message}</small>}
      {run?.status === 'INCOMPLETE' && <small className="di-incomplete">Not eligible for movement/change intelligence until complete coverage is proven.</small>}
    </div>
  </article>;
}

export default function DealerBookPanel() {
  const [state, setState] = useState({ dealers: [], stats: { dealer_count:0, scanned_count:0, incomplete_count:0, error_count:0, vin_count:0, material_changes:0, regions:{} } });
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('ALL');
  const [busyIds, setBusyIds] = useState(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function refresh() { setState(await loadDealerState()); }
  useEffect(() => { refresh().catch((e) => setMessage({ type:'error', text:e.message })); }, []);

  const regions = useMemo(() => ['ALL', ...Object.keys(state.stats?.regions || {}).sort()], [state.stats]);
  const filtered = useMemo(() => state.dealers.filter((d) => {
    const hay = `${d.dealer_name} ${d.dealer_id} ${d.city} ${d.state} ${d.latest_run?.platform || ''}`.toLowerCase();
    return (!search || hay.includes(search.toLowerCase())) && (region === 'ALL' || d.region === region);
  }), [state.dealers, search, region]);

  async function runOne(id) {
    setBusyIds((current) => new Set([...current, id])); setMessage(null);
    try {
      const response = await scanDealerInventory(id); setState(response.state); const r = response.result;
      if (r.status === 'COMPLETE') setMessage({ type:'success', text:`${r.dealer_name}: COMPLETE · ${r.vin_count} verified new VINs · ${r.pages_scanned} page(s).` });
      else if (r.status === 'INCOMPLETE') setMessage({ type:'warning', text:`${r.dealer_name}: INCOMPLETE · ${r.vin_count} VINs observed, but full new-inventory coverage is not proven. ${r.completeness_reason || ''}` });
      else setMessage({ type:'error', text:`${r.dealer_name}: ${r.error}` });
    } catch (e) { setMessage({ type:'error', text:e.message }); }
    finally { setBusyIds((current) => { const n = new Set(current); n.delete(id); return n; }); }
  }

  async function runStarterBatch() {
    const ids = filtered.filter((d) => d.latest_run?.status !== 'COMPLETE').slice(0, 3).map((d) => d.dealer_id);
    if (!ids.length) return setMessage({ type:'success', text:'All visible dealers already have completeness-proven scans.' });
    setBatchBusy(true); setMessage(null);
    try {
      const response = await scanDealerBatch(ids); setState(response.state);
      const complete = response.results.filter((r) => r.status === 'COMPLETE').length;
      const incomplete = response.results.filter((r) => r.status === 'INCOMPLETE').length;
      const errors = response.results.filter((r) => r.status === 'ERROR').length;
      setMessage({ type: errors ? 'warning' : 'success', text:`Batch finished: ${complete} complete · ${incomplete} incomplete · ${errors} errors.` });
    } catch (e) { setMessage({ type:'error', text:e.message }); }
    finally { setBatchBusy(false); }
  }

  return <section className="si-panel di-panel">
    <div className="si-section-head">
      <div><p className="si-kicker">Rickey Dealer Book</p><h2>Completeness-gated new-inventory intelligence</h2><p className="di-sub">A dealer is COMPLETE only when the platform adapter exhausts the public new-inventory source or reconciles the validated VIN set exactly to the platform's reported total. Partial pages never create movement signals.</p></div>
      <div className="di-head-actions"><Badge kind="good"><ShieldCheck size={13} /> PRIVATE BOOK</Badge><button className="si-primary" onClick={runStarterBatch} disabled={batchBusy}><Radar size={16} />{batchBusy ? 'Scanning 3…' : 'Scan next 3'}</button></div>
    </div>

    <div className="di-stats di-stats-6">
      <div><Building2 /><span>Dealers</span><strong>{state.stats.dealer_count}</strong></div>
      <div><Radar /><span>Complete</span><strong>{state.stats.scanned_count}</strong></div>
      <div><AlertTriangle /><span>Incomplete</span><strong>{state.stats.incomplete_count || 0}</strong></div>
      <div><Truck /><span>Verified new VINs</span><strong>{state.stats.vin_count}</strong></div>
      <div><AlertTriangle /><span>Errors</span><strong>{state.stats.error_count}</strong></div>
      <div><RefreshCw /><span>Material deltas</span><strong>{state.stats.material_changes}</strong></div>
    </div>

    <div className="di-toolbar">
      <label><Search size={15} /><input placeholder="Search dealer, platform, city, state, ID" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <select value={region} onChange={(e) => setRegion(e.target.value)}>{regions.map((r) => <option key={r}>{r}</option>)}</select>
      <span>{filtered.length} visible</span>
    </div>

    {message && <div className={`di-message di-message-${message.type}`}>{message.text}</div>}

    <div className="di-table-head"><span>Dealer</span><span>Coverage + inventory state</span><span>Action / blocker</span></div>
    <div className="di-list">{filtered.map((dealer) => <DealerRow key={dealer.dealer_id} dealer={dealer} onScan={runOne} busy={busyIds.has(dealer.dealer_id)} />)}</div>

    <div className="di-foot"><strong>Truth rule:</strong> COMPLETE means full public new-inventory coverage was proven. INCOMPLETE and ERROR scans cannot establish additions/removals. Even on a complete scan, a VIN disappearing is a movement candidate requiring verification—not proof of sale, trade, or Elite involvement.</div>
  </section>;
}
