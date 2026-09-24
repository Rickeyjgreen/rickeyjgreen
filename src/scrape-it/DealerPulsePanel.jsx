import React,{useEffect,useMemo,useState} from 'react'
import {Activity,AlertTriangle,ArrowUpRight,ChevronDown,Clock3,RefreshCw,ShieldCheck} from 'lucide-react'

const URL=`${(import.meta.env?.VITE_SUPABASE_URL||'https://ioqdvdsjtzwyjtdkywcu.supabase.co').replace(/\/$/,'')}/functions/v1/dealer-pulse-api`
const fmt=n=>Number(n||0).toFixed(1)
const pct=n=>`${Math.round(Number(n||0)*100)}%`
const when=x=>x?new Date(x).toLocaleString():'—'

export default function DealerPulsePanel(){
  const [data,setData]=useState({scores:[],events:[],metrics:[],lifecycle:[],dealer_models:[],panel_models:[],collisions:[],readiness:{},generated_at:null,evidence_notice:''})
  const [error,setError]=useState(null)
  async function refresh(){try{setError(null);const r=await fetch(URL,{cache:'no-store'}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Dealer Pulse ${r.status}`);setData(d)}catch(e){setError(e.message)}}
  useEffect(()=>{refresh()},[])
  const usable=useMemo(()=>data.scores.filter(x=>x.status!=='INSUFFICIENT_DATA'),[data.scores])
  const sellers=useMemo(()=>[...usable].sort((a,b)=>Number(b.seller_score)-Number(a.seller_score)).slice(0,5),[usable])
  const buyers=useMemo(()=>[...usable].sort((a,b)=>Number(b.buyer_score)-Number(a.buyer_score)).slice(0,5),[usable])
  const material=data.events.filter(e=>e.event_type!=='PRESENT').slice(0,12)
  const models=(data.panel_models||[]).slice(0,8)
  const collisions=(data.collisions||[]).slice(0,8)
  const learning=!usable.length

  return <section className="si-panel si-pulse-panel">
    <div className="si-section-head"><div><p className="si-kicker">DEALER PULSE</p><h2>Observed market behavior.</h2><p className="di-sub">Trusted public inventory history only. Intent is never assumed.</p></div><div className="si-header-badges"><span className="di-badge di-good"><ShieldCheck size={13}/>TRUST GATED</span><button className="si-icon-refresh" onClick={refresh} aria-label="Refresh Dealer Pulse"><RefreshCw size={15}/></button></div></div>
    {error&&<div className="di-message di-message-error">{error}</div>}

    <div className="si-signal-strip"><span className={learning?'si-signal-dot learning':'si-signal-dot'}/><div><strong>{learning?'Building trusted history':'Directional signals active'}</strong><small>{learning?'Scores unlock after enough trusted daily history accumulates.':'Dealer pressure scores now meet minimum history rules.'}</small></div><time>{when(data.generated_at)}</time></div>

    <div className="si-grid si-grid-3 si-pulse-metrics">
      <article className="si-metric"><Activity/><span>Trusted VINs</span><strong>{data.readiness?.trusted_current_vins||0}</strong><small>{data.readiness?.dealer_status_ready||0} dealers score-ready</small></article>
      <article className="si-metric"><Clock3/><span>Observed DOM</span><strong>{data.readiness?.max_observed_dom_days??0}<em> days</em></strong><small>trusted observation age</small></article>
      <article className="si-metric"><ArrowUpRight/><span>Attributed VINs</span><strong>{data.readiness?.model_attributed_vins||0}</strong><small>dealer-first + vPIC enrichment</small></article>
    </div>

    <div className="si-pressure-grid">
      <article><span>Seller pressure</span><strong>{sellers[0]?.dealer?.dealer_name||'Learning'}</strong><small>{sellers.length?`${fmt(sellers[0].seller_score)} observed score`:'Minimum 3 trusted history days'}</small></article>
      <article><span>Buyer pressure</span><strong>{buyers[0]?.dealer?.dealer_name||'Learning'}</strong><small>{buyers.length?`${fmt(buyers[0].buyer_score)} observed score`:'Minimum 3 trusted history days'}</small></article>
      <article><span>VIN movement leads</span><strong>{data.readiness?.collision_candidates||0}</strong><small>trusted cross-dealer candidates</small></article>
    </div>

    <details className="si-disclosure" open>
      <summary><div><span>Observed model panel</span><strong>What the trusted dealer panel currently contains</strong></div><ChevronDown size={17}/></summary>
      <div className="si-disclosure-body">{models.length?<div className="si-model-grid">{models.map(m=><article key={`${m.make}:${m.model}`} className="si-model-card"><div><strong>{m.make} {m.model}</strong><span>{m.inventory_count} units · {m.dealer_count} dealer(s)</span></div><div><span>Avg / dealer</span><strong>{fmt(m.avg_units_per_dealer)}</strong></div><div><span>Observed DOM</span><strong>{fmt(m.avg_observed_dom)}</strong></div><div><span>7d change</span><strong>+{m.additions_7d} / -{m.removals_7d}</strong></div><small>{pct(m.attribute_coverage)} attribute coverage</small></article>)}</div>:<div className="di-message di-message-warning"><AlertTriangle size={14}/> Model attributes are not yet complete enough for a broader panel.</div>}</div>
    </details>

    <details className="si-disclosure">
      <summary><div><span>Movement & changes</span><strong>Trusted VIN events and cross-dealer candidates</strong></div><ChevronDown size={17}/></summary>
      <div className="si-disclosure-body">
        <div className="si-subsection"><div className="si-minihead"><span>VIN movement leads</span><b>INFERENCE</b></div>{collisions.length?<div className="si-dealer-grid">{collisions.map(c=><article key={c.candidate_id} className="si-dealer-card"><div className="si-dealer-card-head"><div><strong>{c.model_year||''} {c.make||''} {c.model||''}</strong><small>{c.vin}</small></div><span className="di-badge di-warn">{fmt(c.confidence*100)}%</span></div><div className="si-dealer-card-body"><span>{c.from_dealer?.dealer_name||`Dealer ${c.from_dealer_id}`} → {c.to_dealer?.dealer_name||`Dealer ${c.to_dealer_id}`}</span><span>{fmt(c.gap_hours)} hours between trusted observations</span></div></article>)}</div>:<div className="si-empty-line">No trusted cross-dealer movement candidates yet.</div>}</div>
        <div className="si-subsection"><div className="si-minihead"><span>Material trusted changes</span><b>STRUCTURED DATA</b></div>{material.length?<div className="si-dealer-grid">{material.map(e=><article key={e.event_id} className="si-dealer-card"><div className="si-dealer-card-head"><div><strong>{e.dealer?.dealer_name||`Dealer ${e.dealer_id}`}</strong><small>{e.vin}</small></div><span className={`di-badge ${e.event_type==='REMOVED'?'di-warn':'di-good'}`}>{e.event_type}</span></div><div className="si-dealer-card-body"><span>{when(e.event_at)}</span>{e.previous_price!=null&&e.current_price!=null&&<span>${Number(e.previous_price).toLocaleString()} → ${Number(e.current_price).toLocaleString()}</span>}</div></article>)}</div>:<div className="si-empty-line">No recent removals or price changes. Stable presence is not displayed here.</div>}</div>
      </div>
    </details>

    <div className="di-foot"><strong>Evidence boundary:</strong> {data.evidence_notice||'Only analytics-eligible COMPLETE scans may establish absence. Scores and collision candidates remain inference until stronger evidence exists.'}</div>
  </section>
}
