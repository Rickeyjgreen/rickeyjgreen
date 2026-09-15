import React,{useEffect,useMemo,useState} from 'react'
import {Activity,AlertTriangle,ArrowUpRight,ChevronDown,RefreshCw,ShieldCheck} from 'lucide-react'
import {buildDealerXrays} from './dealerXray.mjs'

const URL='https://eyngapizkxsernywdyfv.supabase.co/functions/v1/dealer-pulse-api'
const fmt=n=>Number(n||0).toFixed(1)
const pct=n=>`${Math.round(Number(n||0)*100)}%`
const when=x=>x?new Date(x).toLocaleString():'—'
const tone=bucket=>bucket==='NOW'?'di-good':bucket==='NEXT'||bucket==='VERIFY'?'di-warn':'di-idle'

function ScoreLine({label,value,note}){return <div><span>{label}</span><strong>{fmt(value)}</strong>{note&&<small>{note}</small>}</div>}
function ModelLabel({model,fallback='Needs more evidence'}){return model?<>{model.make} {model.model}</>:fallback}

export default function DealerPulsePanel(){
  const [data,setData]=useState({scores:[],events:[],metrics:[],lifecycle:[],dealer_models:[],panel_models:[],collisions:[],readiness:{},generated_at:null,evidence_notice:''})
  const [error,setError]=useState(null)
  async function refresh(){try{setError(null);const r=await fetch(URL,{cache:'no-store'}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Dealer Pulse ${r.status}`);setData(d)}catch(e){setError(e.message)}}
  useEffect(()=>{refresh()},[])
  const usable=useMemo(()=>data.scores.filter(x=>x.status!=='INSUFFICIENT_DATA'),[data.scores])
  const sellers=useMemo(()=>[...usable].sort((a,b)=>Number(b.seller_score)-Number(a.seller_score)).slice(0,5),[usable])
  const buyers=useMemo(()=>[...usable].sort((a,b)=>Number(b.buyer_score)-Number(a.buyer_score)).slice(0,5),[usable])
  const xrays=useMemo(()=>buildDealerXrays(data.scores||[],data.dealer_models||[],data.panel_models||[]),[data.scores,data.dealer_models,data.panel_models])
  const actionable=xrays.filter(x=>x.status!=='INSUFFICIENT_DATA').slice(0,8)
  const material=data.events.filter(e=>e.event_type!=='PRESENT').slice(0,12)
  const models=(data.panel_models||[]).slice(0,8)
  const collisions=(data.collisions||[]).slice(0,8)
  const learning=!usable.length
  const lead=actionable[0]

  return <section className="si-panel si-pulse-panel">
    <div className="si-section-head"><div><p className="si-kicker">DEALER PULSE X-RAY · v0.3</p><h2>Pressure → fit → package hypothesis → action.</h2><p className="di-sub">Trusted public inventory history remains the evidence base. X-Ray adds action layers without converting observed behavior into dealer intent.</p></div><div className="si-header-badges"><span className="di-badge di-good"><ShieldCheck size={13}/>TRUST GATED</span><button className="si-icon-refresh" onClick={refresh} aria-label="Refresh Dealer Pulse"><RefreshCw size={15}/></button></div></div>
    {error&&<div className="di-message di-message-error">{error}</div>}

    <div className="si-signal-strip"><span className={learning?'si-signal-dot learning':'si-signal-dot'}/><div><strong>{learning?'Building trusted history':'X-Ray action layers active'}</strong><small>{learning?'Scores unlock after enough trusted daily history accumulates.':'Dealer priority now separates pressure, absorption, package leverage and execution readiness.'}</small></div><time>{when(data.generated_at)}</time></div>

    <div className="si-grid si-grid-3 si-pulse-metrics">
      <article className="si-metric"><Activity/><span>Trusted VINs</span><strong>{data.readiness?.trusted_current_vins||0}</strong><small>{data.readiness?.dealer_status_ready||0} dealers score-ready</small></article>
      <article className="si-metric"><ArrowUpRight/><span>Attributed VINs</span><strong>{data.readiness?.model_attributed_vins||0}</strong><small>dealer-first + vPIC enrichment</small></article>
      <article className="si-metric"><ShieldCheck/><span>Top X-Ray priority</span><strong>{lead?fmt(lead.priority):'—'}</strong><small>{lead?.dealer?.dealer_name||'Building evidence'}</small></article>
    </div>

    <div className="si-pressure-grid">
      <article><span>Observed seller pressure</span><strong>{sellers[0]?.dealer?.dealer_name||'Learning'}</strong><small>{sellers.length?`${fmt(sellers[0].seller_score)} existing Dealer Pulse score`:'Minimum trusted history not met'}</small></article>
      <article><span>Observed buyer pressure</span><strong>{buyers[0]?.dealer?.dealer_name||'Learning'}</strong><small>{buyers.length?`${fmt(buyers[0].buyer_score)} existing Dealer Pulse score`:'Minimum trusted history not met'}</small></article>
      <article><span>VIN movement leads</span><strong>{data.readiness?.collision_candidates||0}</strong><small>trusted cross-dealer candidates</small></article>
    </div>

    <details className="si-disclosure" open>
      <summary><div><span>Rickey opportunity queue</span><strong>Why each dealer deserves attention now</strong></div><ChevronDown size={17}/></summary>
      <div className="si-disclosure-body">
        {actionable.length?<div className="si-dealer-grid">{actionable.map((x,index)=><article key={x.dealer_id} className="si-dealer-card">
          <div className="si-dealer-card-head"><div><strong>#{index+1} {x.dealer?.dealer_name||`Dealer ${x.dealer_id}`}</strong><small>{x.dealer?.city||''}{x.dealer?.state?`, ${x.dealer.state}`:''} · X-Ray {x.version.replace('dealer_xray_','')}</small></div><span className={`di-badge ${tone(x.bucket)}`}>{x.bucket} · {fmt(x.priority)}</span></div>
          <div className="si-dealer-card-body">
            <ScoreLine label="Seller opportunity" value={x.seller_opportunity} note={<ModelLabel model={x.top_pressure_model}/>}/>
            <ScoreLine label="Observed absorption" value={x.observed_absorption} note={<ModelLabel model={x.top_absorption_model}/>}/>
            <ScoreLine label="Package leverage" value={x.package_leverage} note={x.package_status==='CANDIDATE'?'slow + faster-moving mix detected':'needs stronger two-sided evidence'}/>
            <ScoreLine label="Execution readiness" value={x.execution_readiness} note={`contactability ${x.contactability.toLowerCase()} · capped until verified`}/>
          </div>
          <div className="di-action"><small>{x.reasons.slice(0,3).join(' · ')}</small><small className="di-incomplete">UNKNOWN: {x.unknowns.slice(0,3).join(' · ')}</small></div>
        </article>)}</div>:<div className="si-empty-line">No dealer has enough trusted history for X-Ray prioritization yet.</div>}
        <div className="di-foot"><strong>Use:</strong> inspect the top dealer's pressure units and likely absorption models in Access first. Package leverage is a hypothesis to investigate, not proof the dealer will take a package.</div>
      </div>
    </details>

    <details className="si-disclosure">
      <summary><div><span>Observed model panel</span><strong>What the trusted dealer panel currently contains</strong></div><ChevronDown size={17}/></summary>
      <div className="si-disclosure-body">{models.length?<div className="si-model-grid">{models.map(m=><article key={`${m.make}:${m.model}`} className="si-model-card"><div><strong>{m.make} {m.model}</strong><span>{m.inventory_count} units · {m.dealer_count} dealer(s)</span></div><div><span>Avg / dealer</span><strong>{fmt(m.avg_units_per_dealer)}</strong></div><div><span>7d removals</span><strong>{m.removals_7d||0}</strong></div><div><span>7d additions</span><strong>{m.additions_7d||0}</strong></div><small>{pct(m.attribute_coverage)} attribute coverage</small></article>)}</div>:<div className="di-message di-message-warning"><AlertTriangle size={14}/> Model attributes are not yet complete enough for a broader panel.</div>}</div>
    </details>

    <details className="si-disclosure">
      <summary><div><span>Movement & changes</span><strong>Trusted VIN events and cross-dealer candidates</strong></div><ChevronDown size={17}/></summary>
      <div className="si-disclosure-body">
        <div className="si-subsection"><div className="si-minihead"><span>VIN movement leads</span><b>INFERENCE</b></div>{collisions.length?<div className="si-dealer-grid">{collisions.map(c=><article key={c.candidate_id} className="si-dealer-card"><div className="si-dealer-card-head"><div><strong>{c.model_year||''} {c.make||''} {c.model||''}</strong><small>{c.vin}</small></div><span className="di-badge di-warn">{fmt(c.confidence*100)}%</span></div><div className="si-dealer-card-body"><span>{c.from_dealer?.dealer_name||`Dealer ${c.from_dealer_id}`} → {c.to_dealer?.dealer_name||`Dealer ${c.to_dealer_id}`}</span><span>{fmt(c.gap_hours)} hours between trusted observations</span></div></article>)}</div>:<div className="si-empty-line">No trusted cross-dealer movement candidates yet.</div>}</div>
        <div className="si-subsection"><div className="si-minihead"><span>Material trusted changes</span><b>STRUCTURED DATA</b></div>{material.length?<div className="si-dealer-grid">{material.map(e=><article key={e.event_id} className="si-dealer-card"><div className="si-dealer-card-head"><div><strong>{e.dealer?.dealer_name||`Dealer ${e.dealer_id}`}</strong><small>{e.vin}</small></div><span className={`di-badge ${e.event_type==='REMOVED'?'di-warn':'di-good'}`}>{e.event_type}</span></div><div className="si-dealer-card-body"><span>{when(e.event_at)}</span>{e.previous_price!=null&&e.current_price!=null&&<span>${Number(e.previous_price).toLocaleString()} → ${Number(e.current_price).toLocaleString()}</span>}</div></article>)}</div>:<div className="si-empty-line">No recent removals or price changes. Stable presence is not displayed here.</div>}</div>
      </div>
    </details>

    <div className="di-foot"><strong>Evidence boundary:</strong> {data.evidence_notice||'Only analytics-eligible COMPLETE scans may establish absence. X-Ray opportunity and package scores are INFERENCE until stronger dealer, Access, Slack, deal, freight and contact evidence exists.'}</div>
  </section>
}
