import React,{useEffect,useMemo,useState} from 'react'
import {Activity,Database,GitBranch,RefreshCw,ServerCog,ShieldCheck,TriangleAlert} from 'lucide-react'
import {loadPocDashboard} from './backendClient.mjs'

const when=x=>x?new Date(x).toLocaleString():'—'
const age=x=>x==null?'—':x<1?'<1h':x<24?`${Math.round(x)}h`:`${Math.round(x/24)}d`
const top=(obj,n=6)=>Object.entries(obj||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,n)

export default function POCDashboard(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(null)
  async function refresh(){setLoading(true);try{setError(null);setData(await loadPocDashboard())}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{refresh()},[])
  const feed=data?.feed||{},snap=feed.snapshot,counts=feed.counts||{}
  const totalEvidence=useMemo(()=>Object.values(counts).reduce((n,x)=>n+Number(x||0),0),[counts])
  const waiting=!snap
  return <section className="poc-shell">
    <div className="poc-head">
      <div><p className="mb-eyebrow">POC INTELLIGENCE</p><h1>Read-only POC feed.</h1><p>Mirror evidence enters BYBO as timestamped observations. Snapshot data never becomes current truth just because it exists.</p></div>
      <button onClick={refresh} disabled={loading} aria-label="Refresh POC feed"><RefreshCw size={17} className={loading?'si-spin':''}/></button>
    </div>
    {error&&<div className="poc-warning"><TriangleAlert size={16}/><span>{error}</span></div>}
    <div className="poc-status">
      <div className={waiting?'poc-dot waiting':'poc-dot live'}/>
      <div><strong>{waiting?'Awaiting robocopy feed':'Snapshot evidence available'}</strong><span>{waiting?'Architecture is ready; no mirror path is connected yet.':`${snap.source_label} · observed ${when(snap.observed_at)}`}</span></div>
      <em>{snap?age(snap.age_hours):'NOT CONNECTED'}</em>
    </div>

    <div className="pulse-summary-grid poc-summary">
      <article><span>Evidence rows</span><strong>{totalEvidence.toLocaleString()}</strong></article>
      <article><span>VIN observations</span><strong>{Number(counts.poc_vin_observations||0).toLocaleString()}</strong></article>
      <article><span>Movements</span><strong>{Number(counts.poc_vin_movements||0).toLocaleString()}</strong></article>
      <article><span>Loads</span><strong>{Number(counts.poc_load_observations||0).toLocaleString()}</strong></article>
    </div>

    <div className="poc-grid">
      <article className="poc-card">
        <div className="poc-card-title"><Database size={17}/><div><span>Feed health</span><strong>Mirror → evidence store</strong></div></div>
        <dl><div><dt>State</dt><dd>{feed.state||'AWAITING_FEED'}</dd></div><div><dt>Snapshot status</dt><dd>{snap?.snapshot_status||'—'}</dd></div><div><dt>Observed</dt><dd>{when(snap?.observed_at)}</dd></div><div><dt>Ingested</dt><dd>{when(snap?.ingested_at)}</dd></div></dl>
      </article>
      <article className="poc-card">
        <div className="poc-card-title"><GitBranch size={17}/><div><span>Movement intelligence</span><strong>Leads, not sales</strong></div></div>
        <dl><div><dt>Recent sample</dt><dd>{data?.movement_summary?.recent_count||0}</dd></div><div><dt>Cross-owner candidates</dt><dd>{data?.movement_summary?.cross_owner_candidates||0}</dd></div><div><dt>Same-owner</dt><dd>{data?.movement_summary?.same_owner||0}</dd></div></dl>
        <p className="poc-note">A dealer-to-dealer VIN change remains a movement lead until stronger transaction evidence establishes what happened.</p>
      </article>
      <article className="poc-card">
        <div className="poc-card-title"><Activity size={17}/><div><span>Load layer</span><strong>Observed POC state</strong></div></div>
        <dl><div><dt>Sampled loads</dt><dd>{data?.load_summary?.sampled||0}</dd></div><div><dt>Units represented</dt><dd>{Number(data?.load_summary?.units||0).toLocaleString()}</dd></div></dl>
        <div className="poc-tags">{top(data?.load_summary?.statuses).map(([k,v])=><span key={k}>{k} · {v}</span>)}</div>
      </article>
      <article className="poc-card">
        <div className="poc-card-title"><ServerCog size={17}/><div><span>Dealer coverage</span><strong>Sanitized browser aggregate</strong></div></div>
        <dl><div><dt>Dealer observations sampled</dt><dd>{data?.dealer_summary?.sampled||0}</dd></div></dl>
        <div className="poc-tags">{top(data?.dealer_summary?.regions).map(([k,v])=><span key={k}>{k} · {v}</span>)}</div>
      </article>
    </div>

    <div className="poc-boundary"><ShieldCheck size={17}/><div><strong>Security boundary</strong><p>This screen intentionally excludes dealer emails, contact details, internal economics, freight detail, rep activity, and raw Access/POC records. Detailed queries are server-side agent tools only.</p></div></div>
    <div className="poc-truth"><strong>Truth rule:</strong> {feed.truth_notice||'POC mirror evidence is timestamped observation data, not permanent current truth.'}</div>
  </section>
}