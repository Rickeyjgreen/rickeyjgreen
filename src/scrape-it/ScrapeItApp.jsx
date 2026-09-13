import React,{useEffect,useState} from 'react'
import {Activity,Building2,CarFront,Radar,RefreshCw,ShieldCheck} from 'lucide-react'
import {loadDealerState} from './backendClient.mjs'
import InventoryBrowser from './InventoryBrowser.jsx'
import MarketExplorer from './MarketExplorer.jsx'

export default function ScrapeItApp(){
  const [state,setState]=useState({dealers:[],stats:{dealer_count:0,scanned_count:0,vin_count:0}})
  const [error,setError]=useState(null)
  const [refreshing,setRefreshing]=useState(false)
  const [screen,setScreen]=useState('PULSE')
  const [browseIntent,setBrowseIntent]=useState(null)

  async function refresh(){setRefreshing(true);try{setError(null);const next=await loadDealerState();setState(next);return next}catch(e){setError(e.message)}finally{setRefreshing(false)}}
  useEffect(()=>{refresh()},[])
  function navigate(intent){const tab=intent?.tab==='DEALERS'?'DEALERS':'MODELS';setBrowseIntent({id:Date.now(),...intent,tab});setScreen(tab);window.scrollTo({top:0,behavior:'smooth'})}
  function openScreen(next){setBrowseIntent({id:Date.now(),tab:next});setScreen(next);window.scrollTo({top:0,behavior:'smooth'})}

  return <div className="scrape-it-shell mobile-first-shell catalog-shell">
    <header className="si-header mobile-header catalog-header">
      <div className="si-brand-lockup"><div className="si-brand-mark"><Radar size={17}/></div><div><div className="si-brand"><span>BYBO</span><i>/</i><strong>DEALER PULSE</strong></div><p>Trusted observed inventory</p></div></div>
      <button className="mb-refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh inventory"><RefreshCw size={17} className={refreshing?'si-spin':''}/></button>
    </header>

    <main className="mobile-main catalog-main">
      {error&&<div className="di-message di-message-error">{error}</div>}
      {screen==='PULSE'&&<MarketExplorer dealerState={state} onNavigate={navigate}/>} 
      {screen==='MODELS'&&<InventoryBrowser dealerState={state} intent={browseIntent} fixedTab="MODELS"/>}
      {screen==='DEALERS'&&<InventoryBrowser dealerState={state} intent={browseIntent} fixedTab="DEALERS"/>}
      <section className="mb-truth catalog-truth"><ShieldCheck size={15}/><p><strong>Evidence rule:</strong> “removed” means no longer observed on a trusted public scan. It is not automatically a sale or trade.</p></section>
    </main>

    <nav className="mb-bottom-nav catalog-nav" aria-label="Primary navigation">
      <button className={screen==='PULSE'?'active':''} onClick={()=>openScreen('PULSE')}><Activity size={19}/><span>Pulse</span></button>
      <button className={screen==='MODELS'?'active':''} onClick={()=>openScreen('MODELS')}><CarFront size={19}/><span>Models</span></button>
      <button className={screen==='DEALERS'?'active':''} onClick={()=>openScreen('DEALERS')}><Building2 size={19}/><span>Dealers</span></button>
    </nav>
  </div>
}
