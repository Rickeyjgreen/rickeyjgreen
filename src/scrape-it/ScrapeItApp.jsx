import React,{useEffect,useState} from 'react'
import {ChevronDown,Radar,RefreshCw,ShieldCheck} from 'lucide-react'
import {loadDealerState} from './backendClient.mjs'
import InventoryBrowser from './InventoryBrowser.jsx'
import DealerPulsePanel from './DealerPulsePanel.jsx'
import ScanHUD from './ScanHUD.jsx'

export default function ScrapeItApp(){
  const [state,setState]=useState({dealers:[],stats:{dealer_count:0,scanned_count:0,vin_count:0}})
  const [activeJobId,setActiveJobId]=useState(null)
  const [error,setError]=useState(null)
  const [refreshing,setRefreshing]=useState(false)

  async function refresh(){setRefreshing(true);try{setError(null);const next=await loadDealerState();setState(next);return next}catch(e){setError(e.message)}finally{setRefreshing(false)}}
  useEffect(()=>{refresh()},[])

  return <div className="scrape-it-shell mobile-first-shell">
    <header className="si-header mobile-header">
      <div className="si-brand-lockup"><div className="si-brand-mark"><Radar size={17}/></div><div><div className="si-brand"><span>BYBO</span><i>/</i><strong>DEALER PULSE</strong></div><p>Trusted observed inventory</p></div></div>
      <button className="mb-refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh inventory"><RefreshCw size={17} className={refreshing?'si-spin':''}/></button>
    </header>

    <main className="mobile-main">
      {error&&<div className="di-message di-message-error">{error}</div>}
      <InventoryBrowser dealerState={state}/>

      <details className="mb-secondary">
        <summary><div><span>Market intelligence</span><strong>Dealer Pulse signals</strong></div><ChevronDown size={18}/></summary>
        <div className="mb-secondary-body"><DealerPulsePanel/></div>
      </details>

      <section className="mb-truth"><ShieldCheck size={16}/><p><strong>Evidence rule:</strong> inventory disappearance means “no longer observed,” not automatically sold or traded.</p></section>
    </main>

    <ScanHUD jobId={activeJobId} onState={()=>{}}/>
  </div>
}
