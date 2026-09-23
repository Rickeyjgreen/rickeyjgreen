import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const C={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, x-poc-ingest-key','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'}
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...C,'Content-Type':'application/json'}})
const K=(n:string)=>{try{return JSON.parse(Deno.env.get(n)||'{}')}catch{return{}}}
const DB=()=>createClient(Deno.env.get('SUPABASE_URL')!,K('SUPABASE_SECRET_KEYS').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
const auth=(r:Request)=>{const k=Deno.env.get('POC_INGEST_KEY')||'';return !!k&&r.headers.get('x-poc-ingest-key')===k}
const clean=(x:any)=>String(x??'').trim()
const iso=(x:any)=>{const d=new Date(x);if(!x||Number.isNaN(d.getTime()))throw Error('Invalid observed_at');return d.toISOString()}
const hash=async(x:string)=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x));return[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}
const allowed=new Set(['dealer','contact','vin','movement','load','invoice_economics','freight','rep_activity','owner_relationship'])
const num=(x:any)=>x==null||x===''?null:Number(x)
const integer=(x:any)=>x==null||x===''?null:Math.trunc(Number(x))
const safePayload=(p:any)=>{const x={...(p||{})};for(const k of Object.keys(x)){if(/password|secret|token|cookie|credential|smtp|api[_-]?key/i.test(k))delete x[k]}return x}
const batches=<T>(a:T[],n=250)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n))
async function insertMany(d:any,table:string,rows:any[]){let n=0;for(const chunk of batches(rows)){if(!chunk.length)continue;const q=await d.from(table).insert(chunk);if(q.error)throw q.error;n+=chunk.length}return n}
function base(r:any,snapshot_id:string){return{snapshot_id,observed_at:iso(r.observed_at),source_file:clean(r.source_file||'UNKNOWN'),payload:safePayload(r.payload||r)}}
async function normalize(d:any,snapshot_id:string,records:any[]){
  let written=0
  const by=new Map<string,any[]>();for(const r of records){const t=clean(r.type);if(!allowed.has(t))throw Error('Unsupported record type: '+t);if(!by.has(t))by.set(t,[]);by.get(t)!.push(r)}
  if(by.has('dealer'))written+=await insertMany(d,'poc_dealer_observations',by.get('dealer')!.map(r=>({...base(r,snapshot_id),dealer_num:clean(r.dealer_num),dealer_name:r.dealer_name||null,city:r.city||null,state:r.state||null,zip:r.zip||null,region:r.region||null,oem:r.oem||null,website:r.website||null,phone:r.phone||null,rep_assignment:r.rep_assignment||null,last_deal_raw:r.last_deal_raw||null,evidence_class:r.evidence_class||'STRUCTURED_DATA'})))
  if(by.has('contact'))written+=await insertMany(d,'poc_contact_observations',by.get('contact')!.map(r=>({...base(r,snapshot_id),dealer_num:clean(r.dealer_num),contact_value:clean(r.contact_value),contact_type:clean(r.contact_type||'UNKNOWN'),evidence_class:r.evidence_class||'STRUCTURED_DATA'})))
  if(by.has('vin'))written+=await insertMany(d,'poc_vin_observations',by.get('vin')!.map(r=>({...base(r,snapshot_id),vin:clean(r.vin).toUpperCase(),dealer_num:r.dealer_num?clean(r.dealer_num):null,previous_dealer_num:r.previous_dealer_num?clean(r.previous_dealer_num):null,year:integer(r.year),make:r.make||null,model:r.model||null,trim:r.trim||null,mileage:integer(r.mileage),listing_price:num(r.listing_price),inventory_status:r.inventory_status||null,first_seen_at:r.first_seen_at?iso(r.first_seen_at):null,last_seen_at:r.last_seen_at?iso(r.last_seen_at):null,evidence_class:r.evidence_class||'STRUCTURED_DATA',confidence:num(r.confidence)})))
  if(by.has('movement'))written+=await insertMany(d,'poc_vin_movements',by.get('movement')!.map(r=>({snapshot_id,vin:clean(r.vin).toUpperCase(),from_dealer_num:r.from_dealer_num?clean(r.from_dealer_num):null,to_dealer_num:r.to_dealer_num?clean(r.to_dealer_num):null,detected_at:iso(r.detected_at||r.observed_at),miles:num(r.miles),same_owner_status:r.same_owner_status||'UNKNOWN',ownership_evidence:r.ownership_evidence||null,interpretation:r.interpretation||'MOVEMENT_LEAD',confidence:num(r.confidence),source_file:clean(r.source_file||'UNKNOWN'),payload:safePayload(r.payload||r)})))
  if(by.has('load')){for(const r of by.get('load')!){const q=await d.from('poc_load_observations').insert({...base(r,snapshot_id),load_number:clean(r.load_number),status:r.status||null,seller_dealer_num:r.seller_dealer_num?clean(r.seller_dealer_num):null,seller_dealer_name:r.seller_dealer_name||null,buyer_dealer_num:r.buyer_dealer_num?clean(r.buyer_dealer_num):null,rep:r.rep||null,seller_rep:r.seller_rep||null,unit_count:integer(r.unit_count),invoice_value:num(r.invoice_value),holdback:num(r.holdback),advertising_261:num(r.advertising_261),expense_65a:num(r.expense_65a),fee_total:num(r.fee_total),freight_total:num(r.freight_total),sold_date:r.sold_date||null}).select('observation_id').single();if(q.error)throw q.error;written++;const units=(r.units||[]).map((u:any)=>({load_observation_id:q.data.observation_id,vin:u.vin?clean(u.vin).toUpperCase():null,unit_number:integer(u.unit_number),year:integer(u.year),make:u.make||null,description:u.description||null,invoice_amount:num(u.invoice_amount),holdback:num(u.holdback),advertising_261:num(u.advertising_261),expense_65a:num(u.expense_65a),fee:num(u.fee),freight:num(u.freight),over_under_310:num(u.over_under_310),payload:safePayload(u)}));written+=await insertMany(d,'poc_load_units',units)}}
  if(by.has('invoice_economics'))written+=await insertMany(d,'poc_invoice_economics',by.get('invoice_economics')!.map(r=>({...base(r,snapshot_id),vin:clean(r.vin).toUpperCase(),load_number:r.load_number||null,invoice_basis:r.invoice_basis||null,invoice_amount:num(r.invoice_amount),holdback:num(r.holdback),advertising_261:num(r.advertising_261),expense_65a:num(r.expense_65a),fee:num(r.fee),over_under_310:num(r.over_under_310),estimate_method:r.estimate_method||null,evidence_class:r.evidence_class||'STRUCTURED_DATA'})))
  if(by.has('freight'))written+=await insertMany(d,'poc_freight_observations',by.get('freight')!.map(r=>({...base(r,snapshot_id),load_number:r.load_number||null,carrier:r.carrier||null,seller_dealer_num:r.seller_dealer_num?clean(r.seller_dealer_num):null,buyer_dealer_num:r.buyer_dealer_num?clean(r.buyer_dealer_num):null,estimated_pickup:r.estimated_pickup?iso(r.estimated_pickup):null,estimated_delivery:r.estimated_delivery?iso(r.estimated_delivery):null,actual_pickup:r.actual_pickup?iso(r.actual_pickup):null,actual_delivery:r.actual_delivery?iso(r.actual_delivery):null,freight_amount:num(r.freight_amount),status:r.status||null})))
  if(by.has('rep_activity'))written+=await insertMany(d,'poc_rep_activity',by.get('rep_activity')!.map(r=>({snapshot_id,rep:r.rep||null,action:clean(r.action),machine:r.machine||null,activity_at:iso(r.activity_at||r.observed_at),source_file:clean(r.source_file||'UNKNOWN'),payload:safePayload(r.payload||r)})))
  if(by.has('owner_relationship'))written+=await insertMany(d,'poc_owner_relationships',by.get('owner_relationship')!.map(r=>({...base(r,snapshot_id),dealer_num:clean(r.dealer_num),owner_key:clean(r.owner_key),relationship_method:clean(r.relationship_method||'UNKNOWN'),relationship_status:r.relationship_status||'OBSERVED',confidence:num(r.confidence)})))
  return written
}

Deno.serve(async r=>{
  if(r.method==='OPTIONS')return new Response('ok',{headers:C})
  if(r.method!=='POST')return J({error:'Method not allowed'},405)
  if(!auth(r))return J({error:'Unauthorized ingest client'},401)
  const d=DB();let snapshot_id:string|null=null
  try{
    const b=await r.json(),records=Array.isArray(b.records)?b.records:[]
    if(records.length>1000)throw Error('Maximum 1000 records per ingest request')
    const batch_key=clean(b.batch_key)
    if(!batch_key)throw Error('batch_key is required for retry-safe ingestion')
    const observed_at=iso(b.observed_at),source_label=clean(b.source_label||'POC mirror'),source_kind=clean(b.source_kind||'POC_MIRROR')
    const manifest=safePayload(b.manifest||{}),body_hash=clean(b.body_hash)||await hash(JSON.stringify({source_label,observed_at,manifest}))
    const existing=await d.from('poc_snapshots').select('snapshot_id').eq('source_kind',source_kind).eq('body_hash',body_hash).maybeSingle()
    if(existing.error)throw existing.error
    if(existing.data?.snapshot_id)snapshot_id=existing.data.snapshot_id
    else{const q=await d.from('poc_snapshots').insert({source_kind,source_label,source_path_hint:b.source_path_hint?clean(b.source_path_hint):null,source_modified_at:b.source_modified_at?iso(b.source_modified_at):null,observed_at,body_hash,manifest,snapshot_status:'SNAPSHOT_ONLY'}).select('snapshot_id').single();if(q.error)throw q.error;snapshot_id=q.data.snapshot_id}
    const batch_hash=await hash(JSON.stringify(records.map(safePayload)))
    const prior=await d.from('poc_ingest_batches').select('ingest_batch_id,status,records_written,batch_hash').eq('snapshot_id',snapshot_id).eq('batch_key',batch_key).maybeSingle()
    if(prior.error)throw prior.error
    if(prior.data){
      if(prior.data.batch_hash!==batch_hash)throw Error('batch_key collision with different content')
      if(prior.data.status==='COMPLETE')return J({ok:true,snapshot_id,batch_key,duplicate_batch:true,records_received:records.length,records_written:prior.data.records_written||0})
      throw Error('Batch already exists but is not complete; manual review required')
    }
    const batch=await d.from('poc_ingest_batches').insert({snapshot_id,batch_key,batch_hash,record_count:records.length,status:'RECEIVED'}).select('ingest_batch_id').single()
    if(batch.error)throw batch.error
    const rawRows=[];for(const rec of records){const raw=JSON.stringify(safePayload(rec));rawRows.push({snapshot_id,record_type:clean(rec.type),source_file:clean(rec.source_file||'UNKNOWN'),source_key:rec.source_key?clean(rec.source_key):null,observed_at:iso(rec.observed_at||observed_at),body_hash:await hash(raw),payload:safePayload(rec)})}
    let rawWritten=0;for(const chunk of batches(rawRows)){if(!chunk.length)continue;const q=await d.from('poc_raw_records').upsert(chunk,{onConflict:'snapshot_id,record_type,source_file,body_hash',ignoreDuplicates:true});if(q.error)throw q.error;rawWritten+=chunk.length}
    const normalized=await normalize(d,snapshot_id,records)
    await d.from('poc_ingest_batches').update({status:'COMPLETE',records_written:normalized,completed_at:new Date().toISOString()}).eq('snapshot_id',snapshot_id).eq('batch_key',batch_key)
    await d.from('poc_ingest_events').insert({snapshot_id,event_type:'INGEST_BATCH',status:'COMPLETE',records_received:records.length,records_written:normalized,message:'POC mirror evidence ingested',metadata:{batch_key,raw_records_attempted:rawWritten}})
    return J({ok:true,snapshot_id,batch_key,records_received:records.length,records_written:normalized})
  }catch(e){
    await d.from('poc_ingest_events').insert({snapshot_id,event_type:'INGEST_BATCH',status:'ERROR',message:e instanceof Error?e.message:String(e)}).catch(()=>{})
    return J({error:e instanceof Error?e.message:String(e)},400)
  }
})