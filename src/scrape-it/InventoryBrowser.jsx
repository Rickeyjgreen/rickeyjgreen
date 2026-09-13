import React,{useMemo,useState} from 'react'
import {Building2,ChevronRight,Filter,MapPin,Search,SlidersHorizontal,X} from 'lucide-react'
import {buildVehicleRows} from './vehicleInventory.mjs'

const PAGE=20
const clean=x=>String(x??'').trim()
const lower=x=>clean(x).toLowerCase()

function groupData(dealers){
  const rows=buildVehicleRows(dealers||[])
  const dealerMap=new Map()
  const modelMap=new Map()
  for(const d of dealers||[]){dealerMap.set(String(d.dealer_id),{...d,units:0,models:new Map()})}
  for(const r of rows){
    const d=dealerMap.get(String(r.dealer_id));
    if(d){d.units++;const key=`${clean(r.make)}|${clean(r.model)}`;if(clean(r.make)&&clean(r.model))d.models.set(key,(d.models.get(key)||0)+1)}
    if(clean(r.make)&&clean(r.model)){
      const key=`${clean(r.make)}|${clean(r.model)}`
      const m=modelMap.get(key)||{key,make:clean(r.make),model:clean(r.model),units:0,dealers:new Map(),rows:[]}
      m.units++;m.dealers.set(String(r.dealer_id),{dealer_id:r.dealer_id,dealer_name:r.dealer_name,city:r.city,state:r.state,count:(m.dealers.get(String(r.dealer_id))?.count||0)+1});m.rows.push(r);modelMap.set(key,m)
    }
  }
  return {rows,dealers:[...dealerMap.values()],models:[...modelMap.values()]}
}

function SearchBar({query,setQuery,onFilter,activeCount}){return <div className="mb-search-row"><label className="mb-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search dealer, city, make or model"/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear search"><X size={16}/></button>}</label><button className="mb-filter-btn" onClick={onFilter}><SlidersHorizontal size={18}/>{activeCount>0&&<span>{activeCount}</span>}</button></div>}
function Chips({region,setRegion,state,setState,regions,states}){const chips=[];if(region!=='ALL')chips.push(['Region',region,()=>setRegion('ALL')]);if(state!=='ALL')chips.push(['State',state,()=>setState('ALL')]);return <>{chips.length>0&&<div className="mb-chips">{chips.map(([k,v,clear])=><button key={`${k}-${v}`} onClick={clear}><span>{v}</span><X size={13}/></button>)}</div>}<div className="mb-quick-filters"><select value={region} onChange={e=>setRegion(e.target.value)}><option value="ALL">All regions</option>{regions.map(x=><option key={x}>{x}</option>)}</select><select value={state} onChange={e=>setState(e.target.value)}><option value="ALL">All states</option>{states.map(x=><option key={x}>{x}</option>)}</select></div></>}
function Drawer({item,type,onClose}){if(!item)return null;return <div className="mb-sheet-backdrop" onClick={onClose}><aside className="mb-sheet" onClick={e=>e.stopPropagation()}><div className="mb-sheet-handle"/><button className="mb-sheet-close" onClick={onClose}><X size={18}/></button>{type==='dealer'?<DealerDetail dealer={item}/>:<ModelDetail model={item}/>}</aside></div>}
function DealerDetail({dealer}){const models=[...dealer.models.entries()].sort((a,b)=>b[1]-a[1]);return <><p className="mb-eyebrow">DEALER</p><h2>{dealer.dealer_name}</h2><p className="mb-sub"><MapPin size={14}/>{dealer.city}, {dealer.state} · {dealer.region}</p><div className="mb-detail-stat"><strong>{dealer.units}</strong><span>observed units</span></div><h3>Matching models</h3><div className="mb-detail-list">{models.length?models.map(([k,count])=>{const [make,model]=k.split('|');return <div key={k}><span>{make} {model}</span><strong>{count}</strong></div>}):<p>No attributed models yet.</p>}</div></>}
function ModelDetail({model}){const dealers=[...model.dealers.values()].sort((a,b)=>b.count-a.count);return <><p className="mb-eyebrow">MODEL</p><h2>{model.make} {model.model}</h2><div className="mb-detail-stat"><strong>{model.units}</strong><span>observed units across {dealers.length} dealer{dealers.length===1?'':'s'}</span></div><h3>Matching dealers</h3><div className="mb-detail-list">{dealers.map(d=><div key={d.dealer_id}><span>{d.dealer_name}<small>{d.city}, {d.state}</small></span><strong>{d.count}</strong></div>)}</div></>}

export default function InventoryBrowser({dealerState}){
  const {dealers,models}=useMemo(()=>groupData(dealerState?.dealers||[]),[dealerState])
  const [tab,setTab]=useState('DEALERS'),[query,setQuery]=useState(''),[region,setRegion]=useState('ALL'),[state,setState]=useState('ALL'),[limit,setLimit]=useState(PAGE),[sheet,setSheet]=useState(null),[filtersOpen,setFiltersOpen]=useState(false)
  const regions=useMemo(()=>[...new Set(dealers.map(d=>d.region).filter(Boolean))].sort(),[dealers])
  const states=useMemo(()=>[...new Set(dealers.map(d=>d.state).filter(Boolean))].sort(),[dealers])
  const dealerResults=useMemo(()=>dealers.filter(d=>{const hay=lower(`${d.dealer_name} ${d.city} ${d.state} ${[...d.models.keys()].join(' ')}`);return(!query||hay.includes(lower(query)))&&(region==='ALL'||d.region===region)&&(state==='ALL'||d.state===state)}).sort((a,b)=>b.units-a.units||a.dealer_name.localeCompare(b.dealer_name)),[dealers,query,region,state])
  const allowedDealerIds=useMemo(()=>new Set(dealerResults.map(d=>String(d.dealer_id))),[dealerResults])
  const modelResults=useMemo(()=>models.map(m=>({...m,dealers:new Map([...m.dealers].filter(([id])=>allowedDealerIds.has(String(id))))})).map(m=>({...m,units:[...m.dealers.values()].reduce((s,d)=>s+d.count,0)})).filter(m=>m.units>0&&(!query||lower(`${m.make} ${m.model}`).includes(lower(query))||[...m.dealers.values()].some(d=>lower(d.dealer_name).includes(lower(query))))).sort((a,b)=>b.units-a.units||`${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`)),[models,allowedDealerIds,query])
  const results=tab==='DEALERS'?dealerResults:modelResults
  const visible=results.slice(0,limit)
  const activeCount=(region!=='ALL'?1:0)+(state!=='ALL'?1:0)
  function changeTab(t){setTab(t);setLimit(PAGE);setSheet(null)}
  return <section className="mb-browser">
    <div className="mb-title"><p className="mb-eyebrow">MARKET BROWSER</p><h1>Find the dealer. Find the model.</h1><p>Search trusted observed inventory without scrolling through VIN-level noise.</p></div>
    <SearchBar query={query} setQuery={x=>{setQuery(x);setLimit(PAGE)}} onFilter={()=>setFiltersOpen(v=>!v)} activeCount={activeCount}/>
    {filtersOpen&&<div className="mb-filter-panel"><div><Filter size={16}/><strong>Filter results</strong></div><Chips region={region} setRegion={x=>{setRegion(x);setLimit(PAGE)}} state={state} setState={x=>{setState(x);setLimit(PAGE)}} regions={regions} states={states}/></div>}
    {!filtersOpen&&activeCount>0&&<Chips region={region} setRegion={x=>{setRegion(x);setLimit(PAGE)}} state={state} setState={x=>{setState(x);setLimit(PAGE)}} regions={[]} states={[]}/>} 
    <div className="mb-tabs"><button className={tab==='DEALERS'?'active':''} onClick={()=>changeTab('DEALERS')}><Building2 size={16}/>Dealers <span>{dealerResults.length}</span></button><button className={tab==='MODELS'?'active':''} onClick={()=>changeTab('MODELS')}>Models <span>{modelResults.length}</span></button></div>
    <div className="mb-result-meta"><span>{results.length} results</span><span>Sorted by observed inventory</span></div>
    <div className="mb-results">{visible.map(item=>tab==='DEALERS'?<button key={item.dealer_id} className="mb-result-card" onClick={()=>setSheet({type:'dealer',item})}><div className="mb-result-icon"><Building2 size={19}/></div><div className="mb-result-main"><strong>{item.dealer_name}</strong><span>{item.city}, {item.state} · {item.region}</span><div className="mb-model-tags">{[...item.models.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,c])=><em key={k}>{k.replace('|',' ')} · {c}</em>)}{!item.models.size&&<em>Model attribution pending</em>}</div></div><div className="mb-result-count"><strong>{item.units}</strong><span>units</span></div><ChevronRight size={18}/></button>:<button key={item.key} className="mb-result-card" onClick={()=>setSheet({type:'model',item})}><div className="mb-result-icon mb-model-icon">{item.make?.[0]}{item.model?.[0]}</div><div className="mb-result-main"><strong>{item.make} {item.model}</strong><span>{item.dealers.size} matching dealer{item.dealers.size===1?'':'s'}</span><div className="mb-model-tags">{[...item.dealers.values()].sort((a,b)=>b.count-a.count).slice(0,3).map(d=><em key={d.dealer_id}>{d.dealer_name} · {d.count}</em>)}</div></div><div className="mb-result-count"><strong>{item.units}</strong><span>units</span></div><ChevronRight size={18}/></button>)}</div>
    {!results.length&&<div className="mb-empty"><Search size={24}/><strong>No matches</strong><span>Clear a filter or try a broader search.</span></div>}
    {limit<results.length&&<button className="mb-load" onClick={()=>setLimit(l=>l+PAGE)}>Show {Math.min(PAGE,results.length-limit)} more</button>}
    <Drawer item={sheet?.item} type={sheet?.type} onClose={()=>setSheet(null)}/>
  </section>
}
