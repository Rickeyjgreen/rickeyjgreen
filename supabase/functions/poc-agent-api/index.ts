import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const C={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, x-poc-admin','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'}
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...C,'Content-Type':'application/json'}})
const K=(n:string)=>{try{return JSON.parse(Deno.env.get(n)||'{}')}catch{return{}}}
const DB=()=>createClient(Deno.env.get('SUPABASE_URL')!,K('SUPABASE_SECRET_KEYS').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
const auth=(r:Request)=>{const k=Deno.env.get('POC_QUERY_ADMIN_KEY')||'';return !!k&&r.headers.get('x-poc-admin')===k}
const clean=(x:any)=>String(x??'').trim()
const dealer=(x:any)=>{const s=clean(x);if(!/^\d{1,12}$/.test(s))throw Error('Invalid dealer number');return s}
const vin=(x:any)=>{const s=clean(x).toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(s))throw Error('Invalid VIN');return s}
const limit=(x:any,d=50,m=250)=>Math.max(1,Math.min(Number(x)||d,m))
const latest=<T extends Record<string,any>>(rows:T[],key:string)=>{const seen=new Set(),out:T[]=[];for(const r of rows){const k=String(r[key]??'');if(!k||seen.has(k))continue;seen.add(k);out.push(r)}return out}
const count=(rows:any[],key:string)=>rows.reduce((m:any,r:any)=>{const k=clean(r[key])||'UNKNOWN';m[k]=(m[k]||0)+1;return m},{})
async function dealerBase(d:any,n:string){const q=await d.from('poc_dealer_observations').select('*').eq('dealer_num',n).order('observed_at',{ascending:false}).limit(50);if(q.error)throw q.error;return q.data||[]}
async function dealerXray(d:any,n:string){
 const [base,outgoing,incoming,sell,buy,owners]=await Promise.all([
  dealerBase(d,n),
  d.from('poc_vin_movements').select('*').eq('from_dealer_num',n).order('detected_at',{ascending:false}).limit(100),
  d.from('poc_vin_movements').select('*').eq('to_dealer_num',n).order('detected_at',{ascending:false}).limit(100),
  d.from('poc_load_observations').select('*').eq('seller_dealer_num',n).order('observed_at',{ascending:false}).limit(100),
  d.from('poc_load_observations').select('*').eq('buyer_dealer_num',n).order('observed_at',{ascending:false}).limit(100),
  d.from('poc_owner_relationships').select('*').eq('dealer_num',n).order('observed_at',{ascending:false}).limit(20)
 ])
 return {dealer_num:n,current_observation:base[0]||null,observation_history:base,movement_out:outgoing.data||[],movement_in:incoming.data||[],seller_loads:sell.data||[],buyer_loads:buy.data||[],ownership:owners.data||[],evidence_class:'STRUCTURED_DATA',warning:'Historical participation and movement do not establish current willingness or a completed sale.'}
}
async function supply(d:any,b:any){
 let q=d.from('poc_vin_observations').select('vin,dealer_num,year,make,model,trim,mileage,listing_price,inventory_status,last_seen_at,observed_at,confidence,source_file').order('observed_at',{ascending:false}).limit(limit(b.limit,100,250))
 if(b.make)q=q.ilike('make',clean(b.make))
 if(b.model)q=q.ilike('model',`%${clean(b.model)}%`)
 if(b.year)q=q.eq('year',Number(b.year))
 if(b.dealerNum)q=q.eq('dealer_num',dealer(b.dealerNum))
 const r=await q;if(r.error)throw r.error
 const rows=latest(r.data||[],'vin')
 return {vehicles:rows,count:rows.length,warning:'These are latest observations within ingested snapshots, not guaranteed live Access inventory.'}
}
async function vinHistory(d:any,v:string){
 const [o,m,e,u]=await Promise.all([
  d.from('poc_vin_observations').select('*').eq('vin',v).order('observed_at',{ascending:false}).limit(250),
  d.from('poc_vin_movements').select('*').eq('vin',v).order('detected_at',{ascending:false}).limit(100),
  d.from('poc_invoice_economics').select('*').eq('vin',v).order('observed_at',{ascending:false}).limit(100),
  d.from('poc_load_units').select('*,poc_load_observations!inner(load_number,status,seller_dealer_num,buyer_dealer_num,observed_at)').eq('vin',v).limit(100)
 ]);return{vin:v,observations:o.data||[],movements:m.data||[],invoice_economics:e.data||[],load_units:u.data||[],warning:'Movement is not automatically a sale or Elite bypass.'}
}
async function moves(d:any,n:string,dir='both'){let q=d.from('poc_vin_movements').select('*').order('detected_at',{ascending:false}).limit(200);q=dir==='out'?q.eq('from_dealer_num',n):dir==='in'?q.eq('to_dealer_num',n):q.or(`from_dealer_num.eq.${n},to_dealer_num.eq.${n}`);const r=await q;if(r.error)throw r.error;return{dealer_num:n,direction:dir,movements:r.data||[]}}
async function deals(d:any,b:any){
 let q=d.from('poc_load_observations').select('*').order('observed_at',{ascending:false}).limit(limit(b.limit,100,250))
 if(b.dealerNum){const n=dealer(b.dealerNum);q=q.or(`seller_dealer_num.eq.${n},buyer_dealer_num.eq.${n}`)}
 if(b.status)q=q.eq('status',clean(b.status))
 const r=await q;if(r.error)throw r.error;return{loads:r.data||[],warning:'Load/deal records are historical structured evidence. Completion must be established by downstream status/accounting evidence.'}
}
async function dna(d:any,n:string,side:'buyer'|'seller'){
 const col=side==='buyer'?'buyer_dealer_num':'seller_dealer_num'
 const q=await d.from('poc_load_observations').select('load_number,status,unit_count,observed_at,invoice_value,holdback,advertising_261,expense_65a,fee_total,freight_total').eq(col,n).order('observed_at',{ascending:false}).limit(250);if(q.error)throw q.error
 const rows=q.data||[],units=rows.reduce((s:number,r:any)=>s+Number(r.unit_count||0),0)
 return {dealer_num:n,side,load_observations:rows.length,units,statuses:count(rows,'status'),latest_at:rows[0]?.observed_at||null,recent_loads:rows.slice(0,25),classification:'MEASURED_BEHAVIOR',warning:'Measured history is not a permanent preference or current intent.'}
}
async function economics(d:any,ln:string){
 const q=await d.from('poc_load_observations').select('*,poc_load_units(*)').eq('load_number',clean(ln)).order('observed_at',{ascending:false}).limit(20);if(q.error)throw q.error
 const rows=q.data||[],vins=[...new Set(rows.flatMap((r:any)=>(r.poc_load_units||[]).map((u:any)=>u.vin).filter(Boolean)))]
 const econ=vins.length?(await d.from('poc_invoice_economics').select('*').in('vin',vins).order('observed_at',{ascending:false})).data||[]:[]
 return {load_number:ln,load_observations:rows,invoice_economics:econ,terminology:'Invoice economics/spread only. Do not call buyer-minus-seller or invoice differential gross without final freight, fees, costs, reversals and accounting support.'}
}
async function freight(d:any,b:any){
 let q=d.from('poc_freight_observations').select('*').order('observed_at',{ascending:false}).limit(limit(b.limit,50,200))
 if(b.loadNumber)q=q.eq('load_number',clean(b.loadNumber))
 if(b.dealerNum){const n=dealer(b.dealerNum);q=q.or(`seller_dealer_num.eq.${n},buyer_dealer_num.eq.${n}`)}
 const r=await q;if(r.error)throw r.error;return{freight:r.data||[]}
}
async function evidence(d:any,b:any){
 let q=d.from('poc_raw_records').select('raw_id,snapshot_id,record_type,source_file,source_key,observed_at,body_hash,payload,created_at').order('observed_at',{ascending:false}).limit(limit(b.limit,25,100))
 if(b.recordType)q=q.eq('record_type',clean(b.recordType))
 if(b.sourceFile)q=q.eq('source_file',clean(b.sourceFile))
 if(b.sourceKey)q=q.eq('source_key',clean(b.sourceKey))
 const r=await q;if(r.error)throw r.error;return{evidence:r.data||[]}
}
async function conflicts(d:any,n:string){
 const rows=await dealerBase(d,n),fields=['dealer_name','city','state','zip','region','oem','website','rep_assignment'],out:any[]=[]
 for(const f of fields){const vals=new Map<string,any[]>();for(const r of rows){const v=clean(r[f]);if(!v)continue;if(!vals.has(v))vals.set(v,[]);vals.get(v)!.push({observed_at:r.observed_at,source_file:r.source_file,snapshot_id:r.snapshot_id})}if(vals.size>1)out.push({field:f,values:[...vals].map(([value,evidence])=>({value,evidence})),status:'DATA_CONFLICT_VERIFY'})}
 return{dealer_num:n,conflicts:out,rule:'Preserve conflicting observations; do not silently reconcile based only on recency.'}
}
async function rank(d:any,nums:string[]){
 const ids=[...new Set(nums.map(dealer))].slice(0,100),out=[]
 for(const n of ids){const [mv,sl,bl]=await Promise.all([
  d.from('poc_vin_movements').select('movement_id,detected_at').or(`from_dealer_num.eq.${n},to_dealer_num.eq.${n}`).order('detected_at',{ascending:false}).limit(50),
  d.from('poc_load_observations').select('unit_count,observed_at,status').eq('seller_dealer_num',n).order('observed_at',{ascending:false}).limit(50),
  d.from('poc_load_observations').select('unit_count,observed_at,status').eq('buyer_dealer_num',n).order('observed_at',{ascending:false}).limit(50)
 ]),base=await dealerBase(d,n),movesN=(mv.data||[]).length,sellUnits=(sl.data||[]).reduce((s:number,x:any)=>s+Number(x.unit_count||0),0),buyUnits=(bl.data||[]).reduce((s:number,x:any)=>s+Number(x.unit_count||0),0),score=Math.min(100,movesN*2+Math.min(30,sellUnits)+Math.min(30,buyUnits));out.push({dealer_num:n,dealer:base[0]||null,score,components:{movement_observations:movesN,seller_units_observed:sellUnits,buyer_units_observed:buyUnits},classification:'DERIVED_STATUS',rule:'score=min(100, 2*movement_observations + min(30,seller_units) + min(30,buyer_units)); activity priority only, not dealer intent.'})}
 return{opportunities:out.sort((a,b)=>b.score-a.score),warning:'This ranks evidence activity among dealer numbers supplied by the caller. It does not infer willingness or choose for the customer.'}
}

Deno.serve(async r=>{if(r.method==='OPTIONS')return new Response('ok',{headers:C});if(r.method!=='POST')return J({error:'Method not allowed'},405);if(!auth(r))return J({error:'Unauthorized agent query'},401)
 try{const b=await r.json().catch(()=>({})),d=DB(),tool=clean(b.tool)
  if(tool==='get_dealer_xray')return J(await dealerXray(d,dealer(b.dealerNum)))
  if(tool==='find_vehicle_supply')return J(await supply(d,b))
  if(tool==='get_vin_history')return J(await vinHistory(d,vin(b.vin)))
  if(tool==='get_dealer_movements')return J(await moves(d,dealer(b.dealerNum),clean(b.direction||'both')))
  if(tool==='find_historical_deals')return J(await deals(d,b))
  if(tool==='get_buyer_dna')return J(await dna(d,dealer(b.dealerNum),'buyer'))
  if(tool==='get_seller_dna')return J(await dna(d,dealer(b.dealerNum),'seller'))
  if(tool==='get_load_economics')return J(await economics(d,clean(b.loadNumber)))
  if(tool==='get_freight_context')return J(await freight(d,b))
  if(tool==='get_source_evidence')return J(await evidence(d,b))
  if(tool==='explain_dealer_conflicts')return J(await conflicts(d,dealer(b.dealerNum)))
  if(tool==='rank_dealer_activity')return J(await rank(d,Array.isArray(b.dealerNums)?b.dealerNums:[]))
  return J({error:'Unsupported agent tool'},400)
 }catch(e){return J({error:e instanceof Error?e.message:String(e)},400)}
})