import React,{useEffect,useMemo,useState} from 'react'
import {Download,Search} from 'lucide-react'
import {exportCsv,loadDealerState} from './backendClient.mjs'
import {buildVehicleRows,filterVehicleRows} from './vehicleInventory.mjs'

export default function VehicleInventoryPanel({dealerState=null,selectedIds=[]}){
  const [localState,setLocalState]=useState({dealers:[]})
  const [query,setQuery]=useState('')
  const [coverage,setCoverage]=useState('ALL')
  const [region,setRegion]=useState('ALL')
  useEffect(()=>{if(!dealerState)loadDealerState().then(setLocalState).catch(()=>{})},[dealerState])
  const state=dealerState||localState
  const rows=useMemo(()=>buildVehicleRows(state.dealers||[]),[state.dealers])
  const scoped=useMemo(()=>selectedIds.length?rows.filter(r=>selectedIds.includes(r.dealer_id)):rows,[rows,selectedIds])
  const regions=useMemo(()=>['ALL',...new Set(scoped.map(r=>r.region).filter(Boolean))].sort(),[scoped])
  const visible=useMemo(()=>filterVehicleRows(scoped,{query,coverage,region}),[scoped,query,coverage,region])
  const complete=scoped.filter(r=>r.complete).length
  const exportRows=()=>exportCsv('scrape-it-inventory.csv',visible.map(r=>({dealer_id:r.dealer_id,dealer_name:r.dealer_name,city:r.city,state:r.state,region:r.region,vin:r.vin,year:r.year,make:r.make,model:r.model,trim:r.trim,engine:r.engine,stock_number:r.stock_number,status:r.status,price:r.price,msrp:r.msrp,vehicle_url:r.vehicle_url,source_url:r.source_url,platform:r.platform,coverage_status:r.coverage_status,observed_at:r.observed_at})))

  return <section className="si-panel">
    <div className="si-section-head"><div><p className="si-kicker">Inventory workspace</p><h2>Search current observed inventory across {selectedIds.length?`${selectedIds.length} selected dealer${selectedIds.length===1?'':'s'}`:'the full book'}</h2></div><button className="si-secondary" onClick={exportRows} disabled={!visible.length}><Download size={15}/>Export CSV</button></div>
    <div className="si-grid si-grid-3"><article className="si-metric"><span>Observed VIN rows</span><strong>{scoped.length}</strong><small>Latest dealer snapshots</small></article><article className="si-metric"><span>COMPLETE evidence</span><strong>{complete}</strong><small>Eligible for complete-to-complete comparison</small></article><article className="si-metric"><span>Observed only</span><strong>{scoped.length-complete}</strong><small>Presence established; absence not established</small></article></div>
    <div className="si-control-bar"><label><Search size={15}/><input placeholder="VIN, year, make, model, trim, engine, stock, dealer" value={query} onChange={e=>setQuery(e.target.value)}/></label><select value={coverage} onChange={e=>setCoverage(e.target.value)}><option value="ALL">All evidence</option><option value="COMPLETE">COMPLETE only</option><option value="OBSERVED">Observed only</option></select><select value={region} onChange={e=>setRegion(e.target.value)}>{regions.map(r=><option key={r}>{r}</option>)}</select><span>{visible.length} visible</span></div>
    <div className="si-inventory-table"><div className="si-inventory-head"><span>Vehicle</span><span>Dealer</span><span>Trim / stock</span><span>Price</span><span>Evidence</span></div>{visible.slice(0,500).map((r,i)=><article className="si-inventory-row" key={`${r.dealer_id}-${r.vin}-${i}`}><div><strong>{[r.year,r.make,r.model].filter(Boolean).join(' ')||'Vehicle identity pending'}</strong><span>{r.vin}</span></div><div><strong>{r.dealer_name}</strong><span>{r.city}, {r.state}</span></div><div><strong>{[r.trim,r.engine].filter(Boolean).join(' · ')||'Enrichment pending'}</strong><span>{r.stock_number||'No stock # observed'}</span></div><div><strong>{r.price?`$${Number(r.price).toLocaleString()}`:'—'}</strong><span>{r.msrp?`MSRP $${Number(r.msrp).toLocaleString()}`:'No MSRP observed'}</span></div><div><span className={`di-badge ${r.complete?'di-good':'di-warn'}`}>{r.coverage_status}</span><small>{r.observed_at?new Date(r.observed_at).toLocaleString():'Time unavailable'}</small></div></article>)}</div>
    {!visible.length&&<div className="si-empty"><h3>No matching inventory rows</h3><p>Change the filters or run a dealer inventory scan.</p></div>}
    <div className="di-foot"><strong>Truth rule:</strong> OBSERVED means present in the captured snapshot. Only COMPLETE-to-COMPLETE comparisons may establish additions or “no longer observed” movement signals.</div>
  </section>
}
