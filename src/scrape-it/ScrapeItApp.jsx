import React,{useEffect,useState} from 'react'
import {BarChart3,Compass,Radar,RefreshCw,ShieldCheck} from 'lucide-react'
import {loadDealerState} from './backendClient.mjs'
import InventoryBrowser from './InventoryBrowser.jsx'
import MarketExplorer from './MarketExplorer.jsx'

export default function ScrapeItApp(){
  const [state,setState]=useState({dealers:[],stats:{dealer_count:0,scanned_count:0,vin_count:0}})
  const [error,setError]=useState(null)
  const [refreshing,setRefreshing]=useState(false)
  const [screen,setScreen]=useState('MARKET')
  const [browseIntent,setBrowseIntent]=useState(null)

  async function refresh(){setRefreshing(true);try{setError(null);const next=await loadDealerState();setState(next);return next}catch(e){setError(e.message)}finally{setRefreshing(false)}}
  useEffect(()=>{refresh()},[])
  function navigateToBrowse(intent){setBrowseIntent({id:Date.now(),...intent});setScreen('BROWSE');window.scrollTo({top:0,behavior:'smooth'})}

  return <div className="scrape-it-shell mobile-first-shell">
    <header className="si-header mobile-header">
      <div className="si-brand-lockup"><div className="si-brand-mark"><Radar size={17}/></div><div><div className="si-brand"><span>BYBO</span><i>/</i><strong>DEALER PULSE</strong></div><p>Trusted observed inventory</p></div></div>
      <button className="mb-refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh inventory"><RefreshCw size={17} className={refreshing?'si-spin':''}/></button>
    </header>

    <main className="mobile-main">
      {error&&<div className="di-message di-message-error">{error}</div>}
      {screen==='MARKET'?<MarketExplorer dealerState={state} onNavigate={navigateToBrowse}/>:<InventoryBrowser dealerState={state} intent={browseIntent}/>} 
      <section className="mb-truth"><ShieldCheck size={16}/><p><strong>Evidence rule:</strong> inventory disappearance means “no longer observed,” not automatically sold or traded.</p></section>
    </main>

    <nav className="mb-bottom-nav" aria-label="Primary navigation">
      <button className={screen==='MARKET'?'active':''} onClick={()=>setScreen('MARKET')}><BarChart3 size={19}/><span>Market</span></button>
      <button className={screen==='BROWSE'?'active':''} onClick={()=>setScreen('BROWSE')}><Compass size={19}/><span>Browse</span></button>
    </nav>
  </div>
}
