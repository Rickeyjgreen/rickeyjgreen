import React, { useMemo, useState } from 'react';
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
  buildPipelineResult,
  buildSourceRegistryEntry,
} from './domain.mjs';
import { fetchNhtsaRecallObservation } from './sourceAdapter.mjs';
import {
  appendFailure,
  appendFeedback,
  appendRaw,
  appendSuccessfulRun,
  getLatestObservations,
  loadStore,
  queryKey,
} from './store.mjs';

const DEFAULT_QUERY = { modelYear: 2025, make: 'Chevrolet', model: 'Silverado 1500' };

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
      <div><span>Confidence</span><strong>{Math.round(evidence.confidence * 100)}%</strong></div>
      <div><span>Raw ID</span><strong>{evidence.raw_id}</strong></div>
    </div>
    <a className="si-source-link" href={evidence.source_url} target="_blank" rel="noreferrer">Open authoritative source <ExternalLink size={16} /></a>
    <h3>Normalized observations</h3>
    <div className="si-observation-list">{observations.length ? observations.map((item) => <article key={item.observation_id}><div><strong>{item.campaign_number || 'Unknown campaign'}</strong><Pill tone={item.park_it || item.park_outside ? 'danger' : 'info'}>{item.component || 'Component unspecified'}</Pill></div><p>{item.summary || 'No summary returned.'}</p><small>{item.raw_excerpt}</small></article>) : <p>No campaigns returned in this observation.</p>}</div>
    <h3>Immutable raw capture</h3>
    <pre className="si-raw-preview">{rawRecord ? rawRecord.raw_text.slice(0, 5000) : 'Raw record unavailable in this session.'}</pre>
  </aside>;
}

function ActionCard({ action, onEvidence, onFeedback, latestFeedback }) {
  if (!action) return null;
  return <article className="si-action-card">
    <div className="si-action-top"><Pill tone={action.bucket === 'NOW' ? 'danger' : action.bucket === 'VERIFY' ? 'warning' : 'info'}>{action.bucket}</Pill><span>{action.action_type}</span></div>
    <h2>{action.recommended_next_step}</h2>
    <p><strong>Why now:</strong> {action.why_now}</p>
    <blockquote>{action.suggested_call_question}</blockquote>
    <div className="si-uncertainty"><AlertTriangle size={18} /><div><strong>Uncertainty</strong>{action.uncertainties.map((item) => <span key={item}>{item}</span>)}</div></div>
    <div className="si-action-controls"><button onClick={onEvidence}><FileSearch size={17} /> Evidence</button>{latestFeedback && <Pill tone="success">{latestFeedback}</Pill>}</div>
    <div className="si-feedback"><span>Feedback</span>{FEEDBACK_OPTIONS.map((item) => <button key={item} onClick={() => onFeedback(item)}>{item.replaceAll('_', ' ')}</button>)}</div>
  </article>;
}

function SourceRegistry({ source }) {
  const fields = [
    ['Type', source.source_type],
    ['Tier', `Tier ${source.source_tier}`],
    ['Trust', source.trust_level],
    ['Status', source.status],
    ['Extraction', source.extraction_method],
    ['Geography', source.geography],
    ['Login', source.requires_login ? 'Required' : 'No'],
    ['Browser', source.requires_browser ? 'Required' : 'No'],
    ['Refresh', source.refresh_frequency],
    ['Access', source.robots_or_access_status],
  ];

  return <section className="si-panel">
    <div className="si-section-head"><div><p className="si-kicker">Source Registry</p><h2>Controlled source, explicit provenance</h2></div><Pill tone="success">{source.status}</Pill></div>
    <div className="si-source-card"><div><ShieldCheck size={22} /><div><strong>{source.source_name}</strong><span>{source.domain}</span></div></div><a href={source.exact_url} target="_blank" rel="noreferrer">Open source <ExternalLink size={15} /></a></div>
    <div className="si-source-meta">{fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{String(value)}</strong></div>)}</div>
    <details className="si-details"><summary>Expected fields + source notes</summary><p>{source.notes}</p><div className="si-tag-row">{source.expected_fields.map((field) => <Pill key={field}>{field}</Pill>)}</div></details>
  </section>;
}

export default function ScrapeItApp() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [stageState, setStageState] = useState({ RECEIVED: 'READY' });
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);
  const [storeStats, setStoreStats] = useState(() => loadStore());

  const source = useMemo(() => buildSourceRegistryEntry(query), [query]);

  const setStage = (stage, status) => setStageState((current) => ({ ...current, [stage]: status }));

  async function runSource() {
    setRunning(true);
    setError(null);
    setFeedback(null);
    setStageState({ RECEIVED: 'DONE', FETCHING: 'RUNNING' });
    const key = queryKey(query);
    const previous = getLatestObservations(key);

    try {
      const { rawRecord, observations } = await fetchNhtsaRecallObservation(source);
      appendRaw(rawRecord);
      setStage('FETCHING', 'DONE');
      setStage('FETCHED', 'DONE');
      setStage('PARSED', 'DONE');
      setStage('NORMALIZED', 'DONE');

      const result = buildPipelineResult({ rawRecord, observations, previous, source, query });
      setStage('DIFFED', 'DONE');
      appendSuccessfulRun({ queryKey: key, observations, ...result });
      setStage('ACTIONED', 'DONE');
      setRunResult({ ...result, rawRecord, observations });
      setStoreStats(loadStore());
    } catch (caught) {
      const failure = {
        stage: stageState.FETCHED === 'DONE' ? 'PARSED' : 'FETCHING',
        code: caught.rawRecord ? `HTTP_${caught.rawRecord.http_status}` : 'SOURCE_FETCH_FAILED',
        message: caught.message,
        observed_at: new Date().toISOString(),
        source_id: source.source_id,
      };
      if (caught.rawRecord) appendRaw(caught.rawRecord);
      appendFailure(failure);
      setStage('FETCHING', 'ERROR');
      setError(failure);
      setStoreStats(loadStore());
    } finally {
      setRunning(false);
    }
  }

  function recordFeedback(type) {
    if (!runResult?.action) return;
    appendFeedback(runResult.action.action_id, type);
    setFeedback(type);
    setStoreStats(loadStore());
  }

  return <div className="scrape-it-shell">
    <header className="si-header">
      <div><div className="si-brand"><Radar size={25} /><span>Scrape It</span></div><p>Evidence-aware automotive market intelligence</p></div>
      <div className="si-header-badges"><Pill tone="warning">BRANCH PREVIEW BUILD</Pill><Pill>Browser-local persistence</Pill></div>
    </header>

    <main className="si-main">
      <section className="si-hero">
        <div><p className="si-kicker">Thin vertical slice</p><h1>Source → observation → change → evidence → action.</h1><p>One real authoritative source, append-only raw capture, deterministic normalization, transparent change detection, and a recommendation that exposes what is known versus unknown.</p></div>
        <div className="si-hero-metric"><span>Canonical rule</span><strong>No invented dealer need.</strong><p>Model-level safety evidence stays separate from VIN-level applicability and dealer willingness.</p></div>
      </section>

      <section className="si-grid si-grid-3">
        <article className="si-metric"><Database /><span>Raw captures</span><strong>{storeStats.raw_records.length}</strong><small>Append-only in this preview browser</small></article>
        <article className="si-metric"><Activity /><span>Change events</span><strong>{storeStats.change_events.length}</strong><small>Baseline + meaningful diffs retained</small></article>
        <article className="si-metric"><ThumbsUp /><span>Feedback events</span><strong>{storeStats.feedback_events.length}</strong><small>Never rewrites original evidence</small></article>
      </section>

      <section className="si-panel si-run-panel">
        <div className="si-section-head"><div><p className="si-kicker">Real source adapter</p><h2>NHTSA recalls by vehicle configuration</h2></div><Pill tone="success">TIER 1 · GOVERNMENT</Pill></div>
        <div className="si-query-grid">
          <label>Model year<input type="number" value={query.modelYear} onChange={(event) => setQuery({ ...query, modelYear: Number(event.target.value) })} /></label>
          <label>Make<input value={query.make} onChange={(event) => setQuery({ ...query, make: event.target.value })} /></label>
          <label>Model<input value={query.model} onChange={(event) => setQuery({ ...query, model: event.target.value })} /></label>
          <button className="si-primary" onClick={runSource} disabled={running}><RefreshCw size={18} className={running ? 'si-spin' : ''} />{running ? 'Running pipeline…' : 'Run approved source'}</button>
        </div>
        <p className="si-source-policy">This adapter uses NHTSA's documented make/model/model-year recall endpoint. It does not perform bulk VIN lookups, bypass access controls, or infer that every VIN is affected.</p>
        <StageRail stageState={stageState} />
        {error && <div className="si-error"><AlertTriangle /><div><strong>{error.code}</strong><span>{error.message}</span><small>Failure is retained in the review trail instead of being silently dropped.</small></div></div>}
      </section>

      <SourceRegistry source={source} />

      <section className="si-grid si-grid-2">
        <section className="si-panel">
          <div className="si-section-head"><div><p className="si-kicker">Market Pulse</p><h2>Latest detected state</h2></div><Gauge size={22} /></div>
          {runResult ? <div className="si-change-card"><div><Pill tone={runResult.change.material ? 'warning' : 'info'}>{runResult.change.change_type}</Pill><span>{new Date(runResult.evidence.observed_at).toLocaleString()}</span></div><h3>{runResult.change.summary}</h3><div className="si-delta-grid"><div><span>Added</span><strong>{runResult.change.added.length}</strong></div><div><span>Removed</span><strong>{runResult.change.removed.length}</strong></div><div><span>Revised</span><strong>{runResult.change.changed.length}</strong></div></div><p>{runResult.change.material ? 'A material delta exists.' : 'No market-change claim is made from a first baseline or unchanged repeat observation.'}</p></div> : <div className="si-empty"><Radar /><h3>No observation yet</h3><p>Run the approved source to create the first immutable baseline.</p></div>}
        </section>

        <section className="si-panel">
          <div className="si-section-head"><div><p className="si-kicker">Review Queue</p><h2>Failures and uncertainty</h2></div><AlertTriangle size={22} /></div>
          {storeStats.failures.length ? <div className="si-review-list">{storeStats.failures.slice(-4).reverse().map((item) => <div key={item.failure_id}><Pill tone="danger">{item.code}</Pill><span>{item.message}</span><small>{new Date(item.observed_at).toLocaleString()}</small></div>)}</div> : <div className="si-empty"><CheckCircle2 /><h3>No failed stages recorded</h3><p>Parser/source failures will remain visible here.</p></div>}
        </section>
      </section>

      <section className="si-panel">
        <div className="si-section-head"><div><p className="si-kicker">Action Queue</p><h2>Transparent recommended action</h2></div><ChevronRight size={22} /></div>
        {runResult ? <ActionCard action={runResult.action} onEvidence={() => setDrawerOpen(true)} onFeedback={recordFeedback} latestFeedback={feedback} /> : <div className="si-empty"><FileSearch /><h3>No recommendation without evidence</h3><p>The action engine stays empty until a real observation exists.</p></div>}
      </section>

      <section className="si-panel">
        <div className="si-section-head"><div><p className="si-kicker">Source classes</p><h2>Registry-ready, not silently activated</h2></div><Pill>{SOURCE_TYPES.length} classes</Pill></div>
        <div className="si-tag-row">{SOURCE_TYPES.map((type) => <Pill key={type}>{type.replaceAll('_', ' ')}</Pill>)}</div>
        <p>Only NHTSA safety/recall is ACTIVE in this slice. Dealer inventory, OEM incentives, news, market metrics, and freight remain unimplemented until each connector is validated and approved.</p>
      </section>

      <section className="si-guardrail">
        <AlertTriangle /><div><strong>Preview storage boundary</strong><p>Raw evidence and feedback currently persist append-only in this browser's local storage so the vertical slice can be tested without touching any existing database. This is not the canonical production datastore. The next infrastructure step is a brand-new isolated Postgres/Supabase project with RLS and server-side ingestion.</p></div>
      </section>
    </main>

    {drawerOpen && <><div className="si-backdrop" onClick={() => setDrawerOpen(false)} /><EvidenceDrawer evidence={runResult?.evidence} rawRecord={runResult?.rawRecord} observations={runResult?.observations || []} onClose={() => setDrawerOpen(false)} /></>}
  </div>;
}
