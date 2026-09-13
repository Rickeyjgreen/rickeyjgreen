import React,{useEffect,useMemo,useState} from 'react'
import {AlertTriangle,Building2,CheckCircle2,Download,Globe2,MapPin,Radar,RefreshCw,Search,ShieldCheck,SquareStack,Truck,XCircle} from 'lucide-react'
import {exportCsv,loadDealerState,runDealerJob} from './backendClient.mjs'
import ScanHUD from './ScanHUD.jsx'
import ContactsPanel from './ContactsPanel.jsx'
import VehicleInventoryPanel from './VehicleInventoryPanel.jsx'

function Badge({children,tone='idle'}){return <span className={`di-badge di-${tone}`}>{children}</span>}
function statusTone(s){return s==='COMPLETE'?'good':s==='INCOMPLETE'?'warn':s==='ERROR'?'bad':'idle'}

export default function ScrapeItApp(){
  const [state,setState]=useState({dealers:[],stats:{dealer_count:0,scanned_count:0,incomplete_count:0,error_count:0,vin_count:0,material_changes:0,regions:{}}})
  const [selected,setSelected]=useState(new Set())
  const [query,setQuery]=useState('')
  const [region,setRegion]=useState('ALL')
  const [activeJobId,setActiveJobId]=useState(null)
  const [running,setRunning]=useState(false)
  const [message,setMessage]=useState(null)

  async function refresh(){const next=await loadDealerState();setState(next);return next}
  useEffect(()=>{refresh().catch(e=>setMessage({type:'error',text:e.message}))},[])

  const regions=useMemo(()=>['ALL',...Object.keys(state.stats?.regions||{}).sort()],[state.stats])
  const visible=useMemo(()=>state.dealers.filter(d=>{const hay=`${d.dealer_name} ${d.dealer_id} ${d.city} ${d.state} ${d.latest_run?.platform||''}`.toLowerCase();return(!query||hay.includes(query.toLowerCase()))&&(region==='ALL'||d.region===region)}),[state.dealers,query,region])
  const selectedIds=useMemo(()=>[...selected],[selected])

  function toggle(id){setSelected(cur=>{const n=new Set(cur);n.has(id)?n.delete(id):n.add(id);return n})}
  function choose(kind){let ids=[];if(kind==='ALL')ids=visible.map(d=>d.dealer_id);if(kind==='FAILED')ids=visible.filter(d=>d.latest_run?.status==='ERROR').map(d=>d.dealer_id);if(kind==='INCOMPLETE')ids=visible.filter(d=>d.latest_run?.status==='INCOMPLETE').map(d=>d.dealer_id);if(kind==='CLEAR')ids=[];setSelected(new Set(ids))}

  async function runInventory(){if(!selected.size)return setMessage({type:'warning',text:'Select at least one dealer.'});setRunning(true);setMessage(null);try{let jobId=null;await runDealerJob('INVENTORY',selectedIds,{concurrency:4,onProgress:x=>{jobId=x.jobId;setActiveJobId(x.jobId)}});if(jobId)setActiveJobId(jobId);const next=await refresh();const complete=selectedIds.filter(id=>next.dealers.find(d=>d.dealer_id===id)?.latest_run?.status==='COMPLETE').length;setMessage({type:'success',text:`Inventory run finished for ${selectedIds.length} dealer(s). ${complete} currently completeness-proven.`})}catch(e){setMessage({type:'error',text:e.message})}finally{setRunning(false)}}

  function exportDealers(){exportCsv('scrape-it-dealer-status.csv',visible.map(d=>({dealer_id:d.dealer_id,dealer_name:d.dealer_name,city:d.city,state:d.state,region:d.region,status:d.latest_run?.status||'UNSCANNED',coverage_status:d.latest_run?.coverage_status||'',platform:d.latest_run?.platform||'',adapter:d.latest_run?.adapter_name||'',vin_count:d.latest_snapshot?.vin_count||0,last_scanned:d.latest_run?.finished_at||'',inventory_url:d.latest_run?.inventory_url||'',completeness_reason:d.latest_run?.completeness_reason||'',error:d.latest_run?.error_message||''})))}

  return <div className="scrape-it-shell">
    <header className="si-header"><div><div className="si-brand"><Radar size={25}/><span>Scrape It</span></div><p>Fast public-web dealer inventory + decision-maker discovery</p></div><div className="si-header-badges"><Badge tone="good">SCRAPE-IT PREVIEW</Badge><Badge tone="idle">MAIN UNTOUCHED</Badge></div></header>
    <main className="si-main">
      <section className="si-hero si-hero-compact"><div><p className="si-kicker">Operator console</p><h1>Pick dealers. Scrape them. Keep the evidence.</h1><p>Inventory and public staff discovery stay separate, source-backed, and reviewable. COMPLETE means exhaustive public inventory coverage was proven; anything less stays observation-only.</p></div><div className="si-hero-metric"><span>Current book</span><strong>{state.stats.dealer_count||state.dealers.length} dealers</strong><p>{state.stats.scanned_count||0} complete · {state.stats.incomplete_count||0} incomplete · {state.stats.error_count||0} errors</p></div></section>

      <section className="si-panel">
        <div className="si-section-head"><div><p className="si-kicker">Dealer controls</p><h2>Select one, several, filtered groups, or the full book</h2></div><div className="si-header-badges"><Badge tone="good"><ShieldCheck size={13}/>EVIDENCE GATED</Badge><Badge tone="idle">{selected.size} selected</Badge></div></div>
        <div className="si-grid si-grid-3">
          <article className="si-metric"><Building2/><span>Dealers</span><strong>{state.stats.dealer_count||state.dealers.length}</strong><small>Rickey book universe</small></article>
          <article className="si-metric"><CheckCircle2/><span>Complete</span><strong>{state.stats.scanned_count||0}</strong><small>Exhaustive public coverage proven</small></article>
          <article className="si-metric"><Truck/><span>Verified VINs</span><strong>{state.stats.vin_count||0}</strong><small>From COMPLETE latest snapshots</small></article>
        </div>
        <div className="si-control-bar">
          <label><Search size={15}/><input placeholder="Dealer, ID, city, state, platform" value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <select value={region} onChange={e=>setRegion(e.target.value)}>{regions.map(r=><option key={r}>{r}</option>)}</select>
          <button onClick={()=>choose('ALL')}>Select visible</button><button onClick={()=>choose('INCOMPLETE')}>Incomplete</button><button onClick={()=>choose('FAILED')}>Errors</button><button onClick={()=>choose('CLEAR')}>Clear</button>
        </div>
        <div className="si-run-strip"><button className="si-primary" disabled={running||!selected.size} onClick={runInventory}><RefreshCw size={16} className={running?'si-spin':''}/>{running?'Scraping selected…':`Scrape inventory (${selected.size})`}</button><button className="si-secondary" onClick={exportDealers}><Download size={15}/>Export dealer status</button><span>{visible.length} visible</span></div>
        {message&&<div className={`di-message di-message-${message.type}`}>{message.text}</div>}
        <div className="si-dealer-grid">{visible.map(d=>{const run=d.latest_run,snap=d.latest_snapshot;return <button key={d.dealer_id} className={`si-dealer-card ${selected.has(d.dealer_id)?'selected':''}`} onClick={()=>toggle(d.dealer_id)}>
          <div className="si-dealer-card-head"><span className="si-check">{selected.has(d.dealer_id)?'✓':''}</span><div><strong>{d.dealer_name}</strong><small>DLR #{d.dealer_id}</small></div><Badge tone={statusTone(run?.status)}>{run?.status||'UNSCANNED'}</Badge></div>
          <div className="si-dealer-card-body"><span><MapPin size={13}/>{d.city}, {d.state} · {d.region}</span><span><Globe2 size={13}/>{run?.platform||'Platform pending'}</span><span><SquareStack size={13}/>{snap?.vin_count??0} latest observed VINs</span></div>
          {run?.status==='ERROR'&&<small className="si-card-error"><XCircle size={12}/>{run.error_message}</small>}
          {run?.status==='INCOMPLETE'&&<small className="si-card-warning"><AlertTriangle size={12}/>Observation captured; exhaustive coverage not proven.</small>}
        </button>})}</div>
      </section>

      <VehicleInventoryPanel dealerState={state} selectedIds={selectedIds}/>
      <ContactsPanel dealers={state.dealers} selectedIds={selectedIds} onJob={setActiveJobId}/>

      <section className="si-guardrail"><ShieldCheck/><div><strong>Truth boundary</strong><p>Inventory disappearance is recorded as “no longer observed,” never automatically as a sale or trade. Public contact pages are evidence of what was represented when observed; private CRM records change only after an explicit Match / Update / Add decision.</p></div></section>
    </main>
    <ScanHUD jobId={activeJobId} onState={s=>{const j=s.jobs?.[0];if(j?.status==='COMPLETE')refresh().catch(()=>{})}}/>
  </div>
}
