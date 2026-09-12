import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  FileSearch,
  Gauge,
  Radar,
  RefreshCw,
  ShieldCheck,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import {
  FEEDBACK_OPTIONS,
  PIPELINE_STAGES,
  SOURCE_TYPES,
  buildSourceRegistryEntry,
} from './domain.mjs';
import { loadBackendState, runApprovedSource, submitFeedback } from './backendClient.mjs';
import DealerBookPanel from './DealerBookPanel.jsx';

const DEFAULT_QUERY = { modelYear: 2025, make: 'Chevrolet', model: 'Silverado 1500' };
const EMPTY_STATS = { raw_records: 0, change_events: 0, feedback_events: 0 };

function Pill({ children, tone = 'neutral' }) {
  return <span className={`si-pill si-pill-${tone}`}>{children}</span>;
}

function StageRail({ stageState }) {
  return <div className="si-stage-rail">{PIPELINE_STAGES.map((stage) => {
    const value = stageState[stage] || 'PENDING';
    return <div key={stage} className={`si-stage si-stage-${value.toLowerCase()}`}><span>{stage}</span><strong>{value}</strong></div>;
  })}</div>;
}

function EvidenceDrawer({ evidence, rawRecord, observations, onClose }) {
  if (!evidence) return null;
  return <aside className="si-drawer" aria-label="Evidence drawer">
    <div className="si-drawer-head"><div><p className="si-kicker">Evidence</p><h2>{evidence.evidence_class}</h2></div><button onClick={onClose} className="si-icon-button" aria-label="Close evidence"><XCircle /></button></div>
    <div className="si-evidence-grid">
      <div><span>Source</span><strong>{evidence.source_id}</strong></div>
      <div><span>Observed</span><strong>{new Date(evidence.observed_at).toLocaleString()}</strong></div>
      <div><span>Confidence</span><strong>{Math.round(Number(evidence.confidence) * 100)}%</strong></div>
      <div><span>Raw ID</span><strong>{evidence.raw_id}</strong></div>
    </div>
    <a className="si-source-link" href={evidence.source_url} target="_blank" rel="noreferrer">Open authoritative source <ExternalLink size={16} /></a>
    <h3>Normalized observations</h3>
    <div className="si-observation-list">{observations.length ? observations.map((item) => <article key={item.observation_id}><div><strong>{item.campaign_number || 'Unknown campaign'}</strong><Pill tone={item.park_it || item.park_outside ? 'danger' : 'info'}>{item.component || 'Component unspecified'}</Pill></div><p>{item.summary || 'No summary returned.'}</p><small>{item.raw_excerpt}</small></article>) : <p>No campaigns returned in this observation.</p>}</div>
    <h3>Immutable raw capture</h3>
    <pre className="si-raw-preview">{rawRecord?.raw_text ? rawRecord.raw_text.slice(0, 5000) : 'Raw record unavailable.'}</pre>
  </aside>;
}

function ActionCard({ action, onEvidence, onFeedback, latestFeedback }) {
  if (!action) return null;
  return <article className="si-action-card">
    <div className="si-action-top"><Pill tone={action.bucket === 'NOW' ? 'danger' : action.bucket === 'VERIFY' ? 'warning' : 'info'}>{action.bucket}</Pill><span>{action.action_type}</span></div>
    <h2>{action.recommended_next_step}</h2>
    <p><strong>Why now:</strong> {action.why_now}</p>
    <blockquote>{action.suggested_call_question}</blockquote>
    <div className="si-uncertainty"><AlertTriangle size={18} /><div><strong>Uncertainty</strong>{(action.uncertainties || []).map((item) => <span key={item}>{item}</span>)}</div></div>
    <div className="si-action-controls"><button onClick={onEvidence}><FileSearch size={17} /> Evidence</button>{latestFeedback && <Pill tone="success">{latestFeedback}</Pill>}</div>
    <div className="si-feedback"><span>Feedback</span>{FEEDBACK_OPTIONS.map((item) => <button key={item} onClick={() => onFeedback(item)}>{item.replaceAll('_', ' ')}</button>)}</div>
  </article>;
}

function SourceRegistry({ source, runtimeSource }) {
  const fields = [
    ['Type', source.source_type], ['Tier', `Tier ${source.source_tier}`], ['Trust', source.trust_level],
    ['Status', runtimeSource?.status || source.status], ['Extraction', source.extraction_method], ['Geography', source.geography],
    ['Login', source.requires_login ? 'Required' : 'No'], ['Browser', source.requires_browser ? 'Required' : 'No'],
    ['Refresh', source.refresh_frequency], ['Access', source.robots_or_access_status],
  ];
  return <section className="si-panel">
    <div className="si-section-head"><div><p className="si-kicker">Source Registry</p><h2>Controlled source, explicit provenance</h2></div><Pill tone="success">{runtimeSource?.status || source.status}</Pill></div>
    <div className="si-source-card"><div><ShieldCheck size={22} /><div><strong>{source.source_name}</strong><span>{source.domain}</span></div></div><a href={source.exact_url} target="_blank" rel="noreferrer">Open source <ExternalLink size={15} /></a></div>
    <div className="si-source-meta">{fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{String(value)}</strong></div>)}</div>
    <details className="si-details"><summary>Expected fields + source health</summary><p>{source.notes}</p><p>Last success: {runtimeSource?.last_success_at ? new Date(runtimeSource.last_success_at).toLocaleString() : 'No successful run yet'} · Failures: {runtimeSource?.failure_count ?? 0}</p><div className="si-tag-row">{source.expected_fields.map((field) => <Pill key={field}>{field}</Pill>)}</div></details>
  </section>;
}

function latestToResult(latest) {
  if (!latest) return null;
  return { change: latest.change, evidence: latest.evidence, action: latest.action, rawRecord: latest.raw, observations: latest.observations || [] };
}

export default function ScrapeItApp() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [stageState, setStageState] = useState({ RECEIVED: 'READY' });
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [failures, setFailures] = useState([]);
  const [runtimeSource, setRuntimeSource] = useState(null);
  const source = useMemo(() => buildSourceRegistryEntry(query), [query]);

  useEffect(() => {
    let active = true;
    loadBackendState(DEFAULT_QUERY).then((state) => {
      if (!active) return;
      setStats(state.stats || EMPTY_STATS);
      setFailures(state.failures || []);
      setRuntimeSource(state.source || null);
      setRunResult(latestToResult(state.latest));
      setFeedback(state.latest?.latest_feedback?.feedback_status || null);
    }).catch((caught) => active && setError({ code: 'BACKEND_STATE_FAILED', message: caught.message }));
    return () => { active = false; };
  }, []);

  async function runSource() {
    setRunning(true); setError(null); setFeedback(null);
    setStageState({ RECEIVED: 'DONE', FETCHING: 'RUNNING' });
    try {
      const state = await runApprovedSource(query);
      setStageState({ RECEIVED:'DONE', FETCHING:'DONE', FETCHED:'DONE', PARSED:'DONE', NORMALIZED:'DONE', DIFFED:'DONE', ACTIONED:'DONE' });
      setStats(state.stats || EMPTY_STATS); setFailures(state.failures || []); setRuntimeSource(state.source || null);
      setRunResult(latestToResult(state.latest));
    } catch (caught) {
      setStageState((current) => ({ ...current, FETCHING:'ERROR' }));
      setError({ code:'PIPELINE_ERROR', message:caught.message });
      try { const state = await loadBackendState(query); setStats(state.stats || EMPTY_STATS); setFailures(state.failures || []); setRuntimeSource(state.source || null); } catch {}
    } finally { setRunning(false); }
  }

  async function recordFeedback(type) {
    if (!runResult?.action?.action_id) return;
    try {
      await submitFeedback(runResult.action.action_id, type);
      setFeedback(type);
      setStats((current) => ({ ...current, feedback_events: current.feedback_events + 1 }));
    } catch (caught) { setError({ code:'FEEDBACK_FAILED', message:caught.message }); }
  }

  const changeType = runResult?.change?.signal_type || runResult?.change?.change_type;
  return <div className="scrape-it-shell">
    <header className="si-header">
      <div><div className="si-brand"><Radar size={25} /><span>Scrape It</span></div><p>Evidence-aware automotive market intelligence</p></div>
      <div className="si-header-badges"><Pill tone="warning">SCRAPE-IT BRANCH PREVIEW</Pill><Pill tone="success">Isolated Supabase persistence</Pill></div>
    </header>

    <main className="si-main">
      <section className="si-hero"><div><p className="si-kicker">Working sales-intelligence testbed</p><h1>Dealer book + public market evidence → changes → action.</h1><p>The test site now combines your sample dealer universe with controlled public-source observation. It preserves what was actually observed, what changed, and what still needs verification before a sales call.</p></div><div className="si-hero-metric"><span>Canonical rule</span><strong>No invented dealer need.</strong><p>Public inventory movement is a lead for verification, not proof of a sale, trade, buyer need, or dealer willingness.</p></div></section>

      <DealerBookPanel />

      <section className="si-grid si-grid-3">
        <article className="si-metric"><Database /><span>NHTSA raw captures</span><strong>{stats.raw_records}</strong><small>Append-only PostgreSQL evidence</small></article>
        <article className="si-metric"><Activity /><span>NHTSA change events</span><strong>{stats.change_events}</strong><small>Baseline + meaningful diffs retained</small></article>
        <article className="si-metric"><ThumbsUp /><span>Feedback events</span><strong>{stats.feedback_events}</strong><small>Append-only; never rewrites evidence</small></article>
      </section>

      <section className="si-panel si-run-panel">
        <div className="si-section-head"><div><p className="si-kicker">Reference source adapter</p><h2>NHTSA recalls by vehicle configuration</h2></div><Pill tone="success">TIER 1 · GOVERNMENT</Pill></div>
        <div className="si-query-grid"><label>Model year<input type="number" value={query.modelYear} onChange={(e) => setQuery({ ...query, modelYear:Number(e.target.value) })} /></label><label>Make<input value={query.make} onChange={(e) => setQuery({ ...query, make:e.target.value })} /></label><label>Model<input value={query.model} onChange={(e) => setQuery({ ...query, model:e.target.value })} /></label><button className="si-primary" onClick={runSource} disabled={running}><RefreshCw size={18} className={running ? 'si-spin' : ''} />{running ? 'Running pipeline…' : 'Run NHTSA source'}</button></div>
        <p className="si-source-policy">The server-side adapter uses NHTSA's documented make/model/model-year recall endpoint. It does not perform bulk VIN lookups, bypass access controls, or infer that every VIN is affected.</p>
        <StageRail stageState={stageState} />
        {error && <div className="si-error"><AlertTriangle /><div><strong>{error.code}</strong><span>{error.message}</span><small>Failed stages remain inspectable instead of being silently dropped.</small></div></div>}
      </section>

      <SourceRegistry source={source} runtimeSource={runtimeSource} />

      <section className="si-grid si-grid-2">
        <section className="si-panel"><div className="si-section-head"><div><p className="si-kicker">Safety Pulse</p><h2>Latest NHTSA detected state</h2></div><Gauge size={22} /></div>{runResult ? <div className="si-change-card"><div><Pill tone={runResult.change?.material ? 'warning' : 'info'}>{changeType}</Pill><span>{new Date(runResult.evidence.observed_at).toLocaleString()}</span></div><h3>{runResult.change.summary}</h3><div className="si-delta-grid"><div><span>Added</span><strong>{runResult.change.added?.length || 0}</strong></div><div><span>Removed</span><strong>{runResult.change.removed?.length || 0}</strong></div><div><span>Revised</span><strong>{runResult.change.changed?.length || 0}</strong></div></div><p>{runResult.change.material ? 'A material delta exists.' : 'No market-change claim is made from a first baseline or unchanged repeat observation.'}</p></div> : <div className="si-empty"><Radar /><h3>No NHTSA observation yet</h3><p>Run the source to create the first immutable baseline.</p></div>}</section>
        <section className="si-panel"><div className="si-section-head"><div><p className="si-kicker">Review Queue</p><h2>NHTSA failures and uncertainty</h2></div><AlertTriangle size={22} /></div>{failures.length ? <div className="si-review-list">{failures.map((item) => <div key={item.run_id}><Pill tone="danger">{item.error_code || 'ERROR'}</Pill><span>{item.error_message}</span><small>{new Date(item.started_at).toLocaleString()}</small></div>)}</div> : <div className="si-empty"><CheckCircle2 /><h3>No failed NHTSA stages recorded</h3><p>Source/parser failures remain visible here.</p></div>}</section>
      </section>

      <section className="si-panel"><div className="si-section-head"><div><p className="si-kicker">Safety Action Queue</p><h2>Transparent recommended action</h2></div><ChevronRight size={22} /></div>{runResult ? <ActionCard action={runResult.action} onEvidence={() => setDrawerOpen(true)} onFeedback={recordFeedback} latestFeedback={feedback} /> : <div className="si-empty"><FileSearch /><h3>No recommendation without evidence</h3><p>The action engine stays empty until a real observation exists.</p></div>}</section>

      <section className="si-panel"><div className="si-section-head"><div><p className="si-kicker">Source classes</p><h2>Registry-ready expansion lanes</h2></div><Pill>{SOURCE_TYPES.length} classes</Pill></div><div className="si-tag-row">{SOURCE_TYPES.map((type) => <Pill key={type}>{type.replaceAll('_', ' ')}</Pill>)}</div><p>NHTSA safety/recall and Rickey's sample dealer book are active. Dealer websites are scanned only on demand in this test build. OEM incentives, news, market metrics, freight, Slack, and Access remain separate until their individual connectors are validated.</p></section>

      <section className="si-guardrail"><ShieldCheck /><div><strong>Isolated persistence boundary</strong><p>Dealer-book records, public-site captures, inventory snapshots, changes, NHTSA evidence, recommendations, failures, and feedback persist in the dedicated Scrape It Supabase/PostgreSQL project. Private dealer contact details remain server-side and are not committed to the public repository.</p></div></section>
    </main>

    {drawerOpen && <><div className="si-backdrop" onClick={() => setDrawerOpen(false)} /><EvidenceDrawer evidence={runResult?.evidence} rawRecord={runResult?.rawRecord} observations={runResult?.observations || []} onClose={() => setDrawerOpen(false)} /></>}
  </div>;
}
