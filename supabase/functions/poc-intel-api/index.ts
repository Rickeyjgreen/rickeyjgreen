import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const C={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'apikey, content-type, x-poc-admin',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store'
}
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...C,'Content-Type':'application/json'}})
const K=(n:string)=>{try{return JSON.parse(Deno.env.get(n)||'{}')}catch{return{}}}
const appAuth=(r:Request)=>Object.values(K('SUPABASE_PUBLISHABLE_KEYS')).includes(r.headers.get('apikey')||'')
const adminAuth=(r:Request)=>{const want=Deno.env.get('POC_QUERY_ADMIN_KEY')||'';return !!want && r.headers.get('x-poc-admin')===want}
const DB=()=>createClient(Deno.env.get('SUPABASE_URL')!,K('SUPABASE_SECRET_KEYS').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
const clean=(x:any)=>String(x??'').trim()
const vin=(x:any)=>{const s=clean(x).toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(s))throw Error('Invalid VIN');return s}
const dealer=(x:any)=>{const s=clean(x);if(!/^\d{1,12}$/.test(s))throw Error('Invalid dealer number');return s}
const load=(x:any)=>{const s=clean(x);if(!/^[A-Za-z0-9_-]{3,40}$/.test(s))throw Error('Invalid load number');return s}
const lim=(x:any,d=50,m=200)=>Math.max(1,Math.min(Number(x)||d,m))
const ageHours=(x:any)=>x?Math.max(0,(Date.now()-new Date(x).getTime())/3600000):null

async function latestSnapshot(d:any){
  const q=await d.from('poc_snapshots').select('*').order('observed_at',{ascending:false}).limit(1).maybeSingle()
  if(q.error)throw q.error
  return q.data||null
}
async function feedHealth(d:any){
  const [snap,events]=await Promise.all([
    latestSnapshot(d),
    d.from('poc_ingest_events').select('event_type,status,records_received,records_written,message,created_at').order('created_at',{ascending:false}).limit(20)
  ])
  const tables=['poc_dealer_observations','poc_vin_observations','poc_vin_movements','poc_load_observations','poc_invoice_economics','poc_freight_observations','poc_rep_activity','poc_owner_relationships']
  const counts:any={}
  await Promise.all(tables.map(async t=>{const q=await d.from(t).select('*',{count:'exact',head:true});counts[t]=q.count||0}))
  return {
    snapshot:snap?{
      snapshot_id:snap.snapshot_id,source_label:snap.source_label,source_modified_at:snap.source_modified_at,
      observed_at:snap.observed_at,ingested_at:snap.ingested_at,snapshot_status:snap.snapshot_status,
      age_hours:ageHours(snap.observed_at),manifest:snap.manifest
    }:null,
    counts,
    recent_ingest_events:events.data||[],
    state:snap?'SNAPSHOT_AVAILABLE':'AWAITING_FEED',
    truth_notice:'POC data is observation evidence. A copied mirror is not automatically current truth.'
  }
}
async function publicDashboard(d:any){
  const h=await feedHealth(d)
  const [moves,loads,dealers]=await Promise.all([
    d.from('poc_vin_movements').select('detected_at,interpretation,confidence,same_owner_status').order('detected_at',{ascending:false}).limit(100),
    d.from('poc_load_observations').select('status,unit_count,observed_at').order('observed_at',{ascending:false}).limit(250),
    d.from('poc_dealer_observations').select('state,region,oem,observed_at').order('observed_at',{ascending:false}).limit(5000)
  ])
  const by=(rows:any[],key:string)=>rows.reduce((m:any,r:any)=>{const k=clean(r[key])||'UNKNOWN';m[k]=(m[k]||0)+1;return m},{})
  return {
    feed:h,
    movement_summary:{
      recent_count:(moves.data||[]).length,
      cross_owner_candidates:(moves.data||[]).filter((x:any)=>x.same_owner_status!=='SAME_OWNER').length,
      same_owner:(moves.data||[]).filter((x:any)=>x.same_owner_status==='SAME_OWNER').length
    },
    load_summary:{
      sampled:(loads.data||[]).length,
      units:(loads.data||[]).reduce((n:number,x:any)=>n+Number(x.unit_count||0),0),
      statuses:by(loads.data||[],'status')
    },
    dealer_summary:{
      sampled:(dealers.data||[]).length,
      regions:by(dealers.data||[],'region'),
      states:by(dealers.data||[],'state'),
      oems:by(dealers.data||[],'oem')
    },
    exposure:'SANITIZED_BROWSER_SUMMARY'
  }
}
async function dealerXray(d:any,n:string){
  const [base,movesFrom,movesTo,loadsSell,loadsBuy,contacts,owners]=await Promise.all([
    d.from('poc_dealer_observations').select('*').eq('dealer_num',n).order('observed_at',{ascending:false}).limit(20),
    d.from('poc_vin_movements').select('*').eq('from_dealer_num',n).order('detected_at',{ascending:false}).limit(100),
    d.from('poc_vin_movements').select('*').eq('to_dealer_num',n).order('detected_at',{ascending:false}).limit(100),
    d.from('poc_load_observations').select('*').eq('seller_dealer_num',n).order('observed_at',{ascending:false}).limit(100),
    d.from('poc_load_observations').select('*').eq('buyer_dealer_num',n).order('observed_at',{ascending:false}).limit(100),
    d.from('poc_contact_observations').select('*').eq('dealer_num',n).order('observed_at',{ascending:false}).limit(100),
    d.from('poc_owner_relationships').select('*').eq('dealer_num',n).order('observed_at',{ascending:false}).limit(20)
  ])
  return {
    dealer_num:n,
    observations:base.data||[],
    movement_out:movesFrom.data||[],
    movement_in:movesTo.data||[],
    seller_loads:loadsSell.data||[],
    buyer_loads:loadsBuy.data||[],
    contacts:contacts.data||[],
    ownership:owners.data||[],
    evidence_notice:'Observed/structured history only. Do not convert movement, contact presence, or historical participation into current willingness.'
  }
}
async function vinHistory(d:any,v:string){
  const [obs,moves,econ,units]=await Promise.all([
    d.from('poc_vin_observations').select('*').eq('vin',v).order('observed_at',{ascending:false}).limit(200),
    d.from('poc_vin_movements').select('*').eq('vin',v).order('detected_at',{ascending:false}).limit(100),
    d.from('poc_invoice_economics').select('*').eq('vin',v).order('observed_at',{ascending:false}).limit(100),
    d.from('poc_load_units').select('*,poc_load_observations!inner(load_number,status,seller_dealer_num,buyer_dealer_num,observed_at)').eq('vin',v).limit(100)
  ])
  return {vin:v,observations:obs.data||[],movements:moves.data||[],invoice_economics:econ.data||[],load_units:units.data||[],
    evidence_notice:'VIN movement is a movement lead unless transaction evidence independently establishes the event.'}
}
async function movements(d:any,b:any){
  let q=d.from('poc_vin_movements').select('*').order('detected_at',{ascending:false}).limit(lim(b.limit,50,200))
  if(b.dealerNum){const n=dealer(b.dealerNum);q=q.or(`from_dealer_num.eq.${n},to_dealer_num.eq.${n}`)}
  if(b.vin)q=q.eq('vin',vin(b.vin))
  const r=await q;if(r.error)throw r.error;return{movements:r.data||[]}
}
async function loadHistory(d:any,n:string){
  const q=await d.from('poc_load_observations').select('*,poc_load_units(*)').eq('load_number',n).order('observed_at',{ascending:false}).limit(20)
  if(q.error)throw q.error;return{load_number:n,observations:q.data||[]}
}
async function searchDealers(d:any,b:any){
  const q=clean(b.query).replace(/[%_,]/g,' ').slice(0,80)
  if(q.length<2)throw Error('Dealer query too short')
  const r=await d.from('poc_dealer_observations').select('dealer_num,dealer_name,city,state,region,oem,website,observed_at')
    .or(`dealer_name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`).order('observed_at',{ascending:false}).limit(lim(b.limit,25,100))
  if(r.error)throw r.error
  const seen=new Set(),out=[]
  for(const x of r.data||[]){if(seen.has(x.dealer_num))continue;seen.add(x.dealer_num);out.push(x)}
  return{dealers:out}
}

Deno.serve(async r=>{
  if(r.method==='OPTIONS')return new Response('ok',{headers:C})
  if(r.method!=='POST')return J({error:'Method not allowed'},405)
  if(!appAuth(r))return J({error:'Unauthorized application key'},401)
  try{
    const b=await r.json().catch(()=>({})),d=DB(),op=clean(b.operation||'dashboard')
    if(op==='dashboard')return J(await publicDashboard(d))
    if(!adminAuth(r))return J({error:'Detailed POC queries require server-side admin authorization'},403)
    if(op==='feed_health')return J(await feedHealth(d))
    if(op==='dealer_xray')return J(await dealerXray(d,dealer(b.dealerNum)))
    if(op==='vin_history')return J(await vinHistory(d,vin(b.vin)))
    if(op==='movements')return J(await movements(d,b))
    if(op==='load_history')return J(await loadHistory(d,load(b.loadNumber)))
    if(op==='search_dealers')return J(await searchDealers(d,b))
    return J({error:'Unsupported operation'},400)
  }catch(e){return J({error:e instanceof Error?e.message:String(e)},400)}
})