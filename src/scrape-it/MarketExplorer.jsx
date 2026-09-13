import React,{useEffect,useMemo,useState} from 'react'
import {Activity,Building2,Map,RefreshCw,Sparkles} from 'lucide-react'
import {groupInventoryData} from './InventoryBrowser.jsx'

const PULSE_URL='https://eyngapizkxsernywdyfv.supabase.co/functions/v1/dealer-pulse-api'
const COLORS=['#111318','#007BFF','#7C8692','#A9B0B8','#D0D4D9','#FF5C00','#5E6B78','#B9C8DA']
const cap=(items,n=7)=>{const sorted=[...items].sort((a,b)=>b.value-a.value);if(sorted.length<=n)return sorted;const head=sorted.slice(0,n),other=sorted.slice(n).reduce((s,x)=>s+x.value,0);return other?[...head,{name:'Other',value:other,key:'OTHER'}]:head}
const polar=(cx,cy,r,a)=>({x:cx+r*Math.cos((a-90)*Math.PI/180),y:cy+r*Math.sin((a-90)*Math.PI/180)})
function ringPath(start,end,outer=88,inner=61){const c=100,s1=polar(c,c,outer,start),e1=polar(c,c,outer,end),s2=polar(c,c,inner,end),e2=polar(c,c,inner,start),large=end-start>180?1:0;return `M ${s1.x} ${s1.y} A ${outer} ${outer} 0 ${large} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${inner} ${inner} 0 ${large} 0 ${e2.x} ${e2.y} Z`}

function Donut({data,onPick,centerLabel,centerValue}){
  const total=data.reduce((s,d)=>s+Number(d.value||0),0)
  let cursor=0
  const segments=data.map((d,i)=>{const span=total?Number(d.value||0)/total*360:0;const start=cursor+1,end=cursor+span-1;cursor+=span;return {...d,i,start,end}}).filter(d=>d.end>d.start)
  return <div className="mx-donut mx-native-donut"><svg viewBox="0 0 200 200" role="img" aria-label={`${centerValue} ${centerLabel}`}>{segments.map(d=><path key={`${d.key||d.name}-${d.i}`} d={ringPath(d.start,d.end)} fill={COLORS[d.i%COLORS.length]} onClick={()=>onPick?.(d)} className="mx-slice"><title>{d.name}: {Number(d.value).toLocaleString()}</title></path>)}</svg><div className="mx-center"><strong>{centerValue}</strong><span>{centerLabel}</span></div></div>
}
function Legend({data,onPick}){return <div className="mx-legend">{data.map((d,i)=><button key={`${d.key||d.name}-${i}`} onClick={()=>onPick?.(d)}><i style={{background:COLORS[i%COLORS.length]}}/><span>{d.name}</span><strong>{Number(d.value).toLocaleString()}</strong></button>)}</div>}

export default function MarketExplorer({dealerState,onNavigate}){
  const grouped=useMemo(()=>groupInventoryData(dealerState?.dealers||[]),[dealerState])
  const [view,setView]=useState('ACTIVITY'),[pulse,setPulse]=useState({panel_models:[],events:[],readiness:{}}),[loading,setLoading]=useState(false)
  async function refreshPulse(){setLoading(true);try{const r=await fetch(PULSE_URL,{cache:'no-store'}),d=await r.json();if(r.ok&&!d.error)setPulse(d)}catch{}finally{setLoading(false)}}
  useEffect(()=>{refreshPulse()},[])

  const datasets=useMemo(()=>{
    const regions=new Map(),dealers=new Map(),models=new Map()
    for(const d of grouped.dealers){if(d.region)regions.set(d.region,(regions.get(d.region)||0)+d.units);dealers.set(d.dealer_name,d.units)}
    for(const m of grouped.models)models.set(`${m.make} ${m.model}`,m.units)
    const activity=(pulse.panel_models||[]).map(m=>({name:`${m.make} ${m.model}`,key:`${m.make}|${m.model}`,value:Number(m.additions_7d||0)+Number(m.removals_7d||0)+Number(m.price_drops_7d||0),meta:{additions:Number(m.additions_7d||0),removals:Number(m.removals_7d||0),priceDrops:Number(m.price_drops_7d||0)}})).filter(x=>x.value>0)
    return {ACTIVITY:cap(activity),MODELS:cap([...models].map(([name,value])=>({name,value,key:name.replace(' ','|')}))),REGIONS:cap([...regions].map(([name,value])=>({name,value,key:name}))),DEALERS:cap([...dealers].map(([name,value])=>({name,value,key:name})))}
  },[grouped,pulse])
  const data=datasets[view]||[],total=data.reduce((s,x)=>s+x.value,0)
  const config={ACTIVITY:{label:'Market activity',unit:'signals',icon:Activity},MODELS:{label:'Model distribution',unit:'units',icon:Sparkles},REGIONS:{label:'Regional inventory',unit:'units',icon:Map},DEALERS:{label:'Dealer concentration',unit:'units',icon:Building2}}[view]
  const Icon=config.icon

  function pick(item){if(!item||item.key==='OTHER')return;if(view==='REGIONS')onNavigate?.({tab:'DEALERS',region:item.key});if(view==='DEALERS')onNavigate?.({tab:'DEALERS',query:item.name});if(view==='MODELS'||view==='ACTIVITY')onNavigate?.({tab:'MODELS',query:item.name})}

  return <section className="mx-shell">
    <div className="mx-head"><div><p className="mb-eyebrow">LIVE MARKET MAP</p><h1>See the market.<br/>Then drill in.</h1><p>Tap any slice to jump directly into the matching dealers or models.</p></div><button onClick={refreshPulse} disabled={loading} aria-label="Refresh market"><RefreshCw size={17} className={loading?'si-spin':''}/></button></div>
    <div className="mx-switch">{Object.entries({ACTIVITY:'Activity',MODELS:'Models',REGIONS:'Regions',DEALERS:'Dealers'}).map(([k,label])=><button key={k} className={view===k?'active':''} onClick={()=>setView(k)}>{label}</button>)}</div>
    <div className="mx-card"><div className="mx-card-title"><Icon size={17}/><div><span>{config.label}</span><strong>{view==='ACTIVITY'?'Most active vehicles now':'Current observed inventory'}</strong></div></div>{data.length?<><Donut data={data} onPick={pick} centerLabel={config.unit} centerValue={total.toLocaleString()}/><Legend data={data} onPick={pick}/></>:<div className="mx-empty"><Activity size={28}/><strong>Building activity history</strong><span>No trusted 7-day movement signals yet. Switch to Models, Regions or Dealers for current inventory distribution.</span></div>}</div>
    <div className="mx-stats"><article><span>Trusted VINs</span><strong>{pulse.readiness?.trusted_current_vins||grouped.rows.length}</strong></article><article><span>Models</span><strong>{grouped.models.length}</strong></article><article><span>Dealers</span><strong>{grouped.dealers.filter(d=>d.units>0).length}</strong></article></div>
    <p className="mx-note">Activity is derived from trusted additions, removals and price-drop observations. It is market activity evidence, not proof of a sale or dealer intent.</p>
  </section>
}
