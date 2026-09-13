import React,{useEffect,useMemo,useState} from 'react'
import {AlertTriangle,Building2,CheckCircle2,ChevronDown,Download,Globe2,MapPin,Radar,RefreshCw,Search,ShieldCheck,SquareStack,Truck,XCircle} from 'lucide-react'
import {exportCsv,investigateDealer,loadDealerState,runDealerJob} from './backendClient.mjs'
import ScanHUD from './ScanHUD.jsx'
import ContactsPanel from './ContactsPanel.jsx'
import VehicleInventoryPanel from './VehicleInventoryPanel.jsx'
import DealerPulsePanel from './DealerPulsePanel.jsx'

function Badge({children,tone='idle'}){return <span className={`di-badge di-${tone}`}>{children}</span>}
function statusTone(s){return s==='COMPLETE'?'good':s==='INCOMPLETE'?'warn':s==='ERROR'?'bad':'idle'}
const coverageStatus=d=>d.current_coverage?.status||d.latest_run?.status||'UNSCANNED'

export default function ScrapeItApp(){
  const [state,setState]=useState({dealers:[],stats:{dealer_count:0,scanned_count:0,incomplete_count:0,error_count:0,vin_count:0,material_changes:0,regions:{}}})
  const [selected,setSelected]=useState(new Set())
  const [query,setQuery]=useState('')
  const [region,setRegion]=useState('ALL')
  const [activeJobId,setActiveJobId]=useState(null)
  const [running,setRunning]=useState(false)
  const [message,setMessage]=useState(null)
  const [probeUrl,setProbeUrl]=useState('')
  const [probeBusy,setProbeBusy]=useState(false)
  const [probeResult,setProbeResult]=useState(null)
  const [probeMessage,setProbeMessage]=useState(null)

  async function refresh(){const next=await loadDealerState();setState(next);return next}
  useEffect(()=>{refresh().catch(e=>setMessage({type:'error',text:e.message}))},[])

  const regions=useMemo(()=>['ALL',...Object.keys(state.stats?.regions||{}).sort()],[state.stats])
  const visible=useMemo(()=>state.dealers.filter(d=>{const platform=d.current_coverage?.platform||d.latest_attempt?.platform||d.latest_run?.platform||'';const hay=`${d.dealer_name} ${d.dealer_id} ${d.city} ${d.state} ${platform}`.toLowerCase();return(!query||hay.includes(query.toLowerCase()))&&(region==='ALL'||d.region===region)}),[state.dealers,query,region])
  const selectedIds=useMemo(()=>[...selected],[selected])

  function toggle(id){setSelected(cur=>{const n=new Set(cur);n.has(id)?n.delete(id):n.add(id);return n})}
  function choose(kind){let ids=[];if(kind==='ALL')ids=visible.map(d=>d.dealer_id);if(kind==='FAILED')ids=visible.filter(d=>coverageStatus(d)!=='COMPLETE'&&(d.latest_attempt||d.latest_run)?.status==='ERROR').map(d=>d.dealer_id);if(kind==='INCOMPLETE')ids=visible.filter(d=>coverageStatus(d)!=='COMPLETE').map(d=>d.dealer_id);setSelected(new Set(ids))}

  async function runInventory(){if(!selected.size)return setMessage({type:'warning',text:'Select at least one dealer.'});setRunning(true);setMessage(null);try{let jobId=null;await runDealerJob('INVENTORY',selectedIds,{concurrency:4,onProgress:x=>{jobId=x.jobId;setActiveJobId(x.jobId)}});if(jobId)setActiveJobId(jobId);const next=await refresh();const complete=selectedIds.filter(id=>coverageStatus(next.dealers.find(d=>d.dealer_id===id)||{})==='COMPLETE').length;setMessage({type:'success',text:`Inventory run finished for ${selectedIds.length} dealer(s). ${complete} have current completeness-proven coverage.`})}catch(e){setMessage({type:'error',text:e.message})}finally{setRunning(false)}}
  async function probeDealer(){if(!probeUrl.trim())return setProbeMessage({type:'warning',text:'Enter a dealer website first.'});setProbeBusy(true);setProbeMessage(null);setProbeResult(null);try{const result=await investigateDealer(probeUrl.trim());setProbeResult(result);setProbeMessage({type:result.coverage_status==='COMPLETE'?'success':'warning',text:result.coverage_status==='COMPLETE'?'One-time scan proved exhaustive public inventory coverage.':'One-time scan captured evidence, but exhaustive coverage was not proven.'})}catch(e){setProbeMessage({type:'error',text:e.message})}finally{setProbeBusy(false)}}
  function exportDealers(){exportCsv('scrape-it-dealer-status.csv',visible.map(d=>{const cov=d.current_coverage||{},attempt=d.latest_attempt||d.latest_run||{};return{dealer_id:d.dealer_id,dealer_name:d.dealer_name,city:d.city,state:d.state,region:d.region,current_coverage:coverageStatus(d),latest_attempt_status:attempt.status||'UNSCANNED',platform:cov.platform||attempt.platform||'',adapter:cov.adapter_name||'',vin_count:d.latest_snapshot?.vin_count||0,coverage_observed_at:cov.observed_at||'',latest_attempt_at:attempt.finished_at||attempt.started_at||'',inventory_url:cov.inventory_url||attempt.inventory_url||'',completeness_reason:cov.completeness_reason||'',latest_attempt_error:attempt.error_message||''}}))}

  return <div className="scrape-it-shell">
    <header className="si-header">
      <div className="si-brand-lockup"><div className="si-brand-mark"><Radar size={18}/></div><div><div className="si-brand"><span>BYBO</span><i>/</i><strong>DEALER PULSE</strong></div><p>Observed dealer intelligence</p></div></div>
      <div className="si-header-badges"><span className="si-live-dot"/><Badge tone="good">LIVE</Badge><Badge tone="idle">TRUST GATED</Badge></div>
    </header>

    <main className="si-main">
      <section className="si-hero si-hero-compact">
        <div><p className="si-kicker">SCRAPE IT · MARKET ACQUISITION</p><h1>Inventory intelligence.<br/>Without the noise.</h1><p>Scrape public dealer inventory, preserve the evidence, and let trusted history reveal what is actually changing.</p><div className="si-hero-actions"><button className="si-primary" onClick={()=>{choose('INCOMPLETE');document.getElementById('dealer-console')?.scrollIntoView({behavior:'smooth'})}}>Scan what needs coverage</button><button className="si-ghost" onClick={()=>document.getElementById('inventory')?.scrollIntoView({behavior:'smooth'})}>Open inventory</button></div></div>
        <div className="si-hero-metric"><span>Current monitored book</span><strong>{state.stats.dealer_count||state.dealers.length}</strong><p>dealers</p><div className="si-quiet-line"><b>{state.stats.scanned_count||0}</b> complete <i/> <b>{state.stats.vin_count||0}</b> trusted VINs</div></div>
      </section>

      <DealerPulsePanel/>

      <section className="si-panel si-console" id="dealer-console">
        <div className="si-section-head"><div><p className="si-kicker">MONITORED DEALERS</p><h2>Choose the rooftops that matter now.</h2><p className="di-sub">Complete coverage is the only state allowed to establish absence. Everything else stays observation-only.</p></div><div className="si-header-badges"><Badge tone="good"><ShieldCheck size={13}/>EVIDENCE GATED</Badge><Badge tone="idle">{selected.size} SELECTED</Badge></div></div>
        <div className="si-grid si-grid-3 si-metric-row"><article className="si-metric"><Building2/><span>Dealers</span><strong>{state.stats.dealer_count||state.dealers.length}</strong><small>current book universe</small></article><article className="si-metric"><CheckCircle2/><span>Complete</span><strong>{state.stats.scanned_count||0}</strong><small>exhaustive public coverage</small></article><article className="si-metric"><Truck/><span>Trusted VINs</span><strong>{state.stats.vin_count||0}</strong><small>latest safe snapshots</small></article></div>
        <div className="si-control-bar"><label><Search size={15}/><input placeholder="Dealer, ID, city, state, platform" value={query} onChange={e=>setQuery(e.target.value)}/></label><select value={region} onChange={e=>setRegion(e.target.value)}>{regions.map(r=><option key={r}>{r}</option>)}</select><button onClick={()=>choose('ALL')}>Select visible</button><button onClick={()=>choose('INCOMPLETE')}>Needs coverage</button><button onClick={()=>choose('FAILED')}>Hard errors</button><button onClick={()=>choose('CLEAR')}>Clear</button></div>
        <div className="si-run-strip"><button className="si-primary" disabled={running||!selected.size} onClick={runInventory}><RefreshCw size={16} className={running?'si-spin':''}/>{running?'Scraping selected…':`Scrape inventory (${selected.size})`}</button><button className="si-secondary" onClick={exportDealers}><Download size={15}/>Export status</button><span>{visible.length} visible</span></div>
        {message&&<div className={`di-message di-message-${message.type}`}>{message.text}</div>}
        <div className="si-dealer-grid">{visible.map(d=>{const attempt=d.latest_attempt||d.latest_run,cov=d.current_coverage||{},snap=d.latest_snapshot,status=coverageStatus(d),attemptIssue=attempt&&attempt.status!=='COMPLETE'&&status==='COMPLETE';return <button key={d.dealer_id} className={`si-dealer-card ${selected.has(d.dealer_id)?'selected':''}`} onClick={()=>toggle(d.dealer_id)}><div className="si-dealer-card-head"><span className="si-check">{selected.has(d.dealer_id)?'✓':''}</span><div><strong>{d.dealer_name}</strong><small>DLR #{d.dealer_id}</small></div><Badge tone={statusTone(status)}>{status}</Badge></div><div className="si-dealer-card-body"><span><MapPin size={13}/>{d.city}, {d.state}</span><span><Globe2 size={13}/>{cov.platform||attempt?.platform||'Platform pending'}</span><span><SquareStack size={13}/>{snap?.vin_count??0} VINs</span></div>{attemptIssue&&<small className="si-card-warning"><AlertTriangle size={12}/>Current coverage remains valid; latest attempt was {attempt.status}.</small>}{status!=='COMPLETE'&&attempt?.status==='ERROR'&&<small className="si-card-error"><XCircle size={12}/>{attempt.error_message}</small>}{status!=='COMPLETE'&&attempt?.status==='INCOMPLETE'&&<small className="si-card-warning"><AlertTriangle size={12}/>Exhaustive coverage not proven.</small>}</button>})}</div>
      </section>

      <div id="inventory"><VehicleInventoryPanel dealerState={state} selectedIds={selectedIds}/></div>

      <details className="si-tools-drawer">
        <summary><div><p className="si-kicker">SECONDARY TOOLS</p><strong>Investigation, contact discovery & diagnostics</strong><span>Legacy/operator utilities are intentionally tucked away from the main intelligence surface.</span></div><ChevronDown size={18}/></summary>
        <div className="si-tools-body">
          <section className="si-tool-section"><div className="si-section-head"><div><p className="si-kicker">ONE-TIME INVESTIGATION</p><h2>Scan a dealer outside the current book.</h2><p className="di-sub">This probe does not add the rooftop to monitored dealers or alter the book.</p></div><Badge tone="idle">OBSERVATION ONLY</Badge></div><div className="si-control-bar"><label><Globe2 size={15}/><input placeholder="https://www.exampledealer.com" value={probeUrl} onChange={e=>setProbeUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')probeDealer()}}/></label><button className="si-primary" onClick={probeDealer} disabled={probeBusy}>{probeBusy?'Investigating…':'Investigate dealer'}</button></div>{probeMessage&&<div className={`di-message di-message-${probeMessage.type}`}>{probeMessage.text}</div>}{probeResult&&<div className="si-grid si-grid-3"><article className="si-metric"><Globe2/><span>Platform</span><strong>{probeResult.platform||'Unknown'}</strong><small>{probeResult.website}</small></article><article className="si-metric"><Truck/><span>Validated VINs</span><strong>{probeResult.vin_count||0}</strong><small>{probeResult.pages_scanned||0} page(s) scanned</small></article><article className="si-metric"><ShieldCheck/><span>Coverage</span><strong>{probeResult.coverage_status||'INCOMPLETE'}</strong><small>{probeResult.completeness_reason}</small></article></div>}</section>
          <ContactsPanel dealers={state.dealers} selectedIds={selectedIds} onJob={setActiveJobId}/>
        </div>
      </details>

      <section className="si-guardrail"><ShieldCheck/><div><strong>Evidence boundary</strong><p>Inventory disappearance means “no longer observed,” never automatically a sale or trade. Seller/Buyer scores and VIN movement leads remain inference until stronger evidence exists.</p></div></section>
      <footer className="si-footer"><span>BYBO · Brand Builders</span><span>Smarter systems. Stronger business.</span></footer>
    </main>
    <ScanHUD jobId={activeJobId} onState={s=>{const j=s.jobs?.[0];if(j?.status==='COMPLETE')refresh().catch(()=>{})}}/>
  </div>
}
