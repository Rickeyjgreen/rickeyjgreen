import React,{useEffect,useMemo,useState} from 'react'
import {Activity,AlertTriangle,ArrowDownRight,ArrowUpRight,ShieldCheck} from 'lucide-react'

const URL='https://eyngapizkxsernywdyfv.supabase.co/functions/v1/dealer-pulse-api'
const fmt=n=>Number(n||0).toFixed(1)
const when=x=>x?new Date(x).toLocaleString():'—'

export default function DealerPulsePanel(){
  const [data,setData]=useState({scores:[],events:[],metrics:[],generated_at:null,evidence_notice:''})
  const [error,setError]=useState(null)
  async function refresh(){try{setError(null);const r=await fetch(URL,{cache:'no-store'}),d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Dealer Pulse ${r.status}`);setData(d)}catch(e){setError(e.message)}}
  useEffect(()=>{refresh()},[])
  const usable=useMemo(()=>data.scores.filter(x=>x.status!=='INSUFFICIENT_DATA'),[data.scores])
  const sellers=useMemo(()=>[...usable].sort((a,b)=>Number(b.seller_score)-Number(a.seller_score)).slice(0,5),[usable])
  const buyers=useMemo(()=>[...usable].sort((a,b)=>Number(b.buyer_score)-Number(a.buyer_score)).slice(0,5),[usable])
  const material=data.events.filter(e=>e.event_type!=='PRESENT').slice(0,12)
  return <section className="si-panel">
    <div className="si-section-head"><div><p className="si-kicker">Dealer Pulse · early intelligence</p><h2>Trusted inventory behavior, separated from dealer intent</h2><p className="di-sub">Scores are versioned hypotheses from completeness-proven public inventory history. They are not claims that a dealer wants to sell or buy.</p></div><div className="si-header-badges"><span className="di-badge di-good"><ShieldCheck size={13}/>TRUST GATED</span><span className="di-badge di-idle">v0.1</span></div></div>
    {error&&<div className="di-message di-message-error">{error}</div>}
    <div className="si-grid si-grid-3">
      <article className="si-metric"><Activity/><span>Scored dealers</span><strong>{data.scores.length}</strong><small>{usable.length} have enough history for a directional status</small></article>
      <article className="si-metric"><ArrowUpRight/><span>Observed additions</span><strong>{data.events.filter(e=>e.event_type==='ADDED').length}</strong><small>Recent non-PRESENT event feed</small></article>
      <article className="si-metric"><ArrowDownRight/><span>No longer observed</span><strong>{data.events.filter(e=>e.event_type==='REMOVED').length}</strong><small>Never automatically interpreted as sales</small></article>
    </div>
    <div className="si-grid si-grid-3">
      <article className="si-metric"><span>Seller-pressure leaders</span><strong>{sellers[0]?.dealer?.dealer_name||'Building history'}</strong><small>{sellers.length?`Observed seller score ${fmt(sellers[0].seller_score)} · ${sellers[0].status}`:'Insufficient trusted multi-day history'}</small></article>
      <article className="si-metric"><span>Buyer-pressure leaders</span><strong>{buyers[0]?.dealer?.dealer_name||'Building history'}</strong><small>{buyers.length?`Observed buyer score ${fmt(buyers[0].buyer_score)} · ${buyers[0].status}`:'Insufficient trusted multi-day history'}</small></article>
      <article className="si-metric"><span>Freshness</span><strong>{data.generated_at?'LIVE':'—'}</strong><small>{when(data.generated_at)}</small></article>
    </div>
    <div className="si-section-head"><div><p className="si-kicker">Trusted changes</p><h2>What actually changed in eligible scans</h2></div><button className="si-secondary" onClick={refresh}>Refresh pulse</button></div>
    {material.length?<div className="si-dealer-grid">{material.map(e=><article key={e.event_id} className="si-dealer-card"><div className="si-dealer-card-head"><div><strong>{e.dealer?.dealer_name||`Dealer ${e.dealer_id}`}</strong><small>{e.vin}</small></div><span className={`di-badge ${e.event_type==='REMOVED'?'di-warn':'di-good'}`}>{e.event_type}</span></div><div className="si-dealer-card-body"><span>{when(e.event_at)}</span>{e.previous_price!=null&&e.current_price!=null&&<span>${Number(e.previous_price).toLocaleString()} → ${Number(e.current_price).toLocaleString()}</span>}<span>{e.evidence_class} · confidence {fmt(Number(e.confidence)*100)}%</span></div></article>)}</div>:<div className="di-message di-message-warning"><AlertTriangle size={14}/> No recent material events beyond stable presence/additions. More trusted history is required.</div>}
    <div className="di-foot"><strong>Evidence boundary:</strong> {data.evidence_notice||'Only analytics-eligible COMPLETE scans may establish absence. Scores remain inference until stronger evidence exists.'}</div>
  </section>
}
