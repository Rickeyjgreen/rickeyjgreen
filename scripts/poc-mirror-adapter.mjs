#!/usr/bin/env node
/**
 * EAE POC mirror adapter.
 * READ-ONLY against the mirror directory: it only stat/readFile/readdir's source files.
 * It writes nothing to the source tree. Supabase handles snapshot/batch idempotency.
 *
 * Usage:
 *   POC_INGEST_KEY=... node scripts/poc-mirror-adapter.mjs --source "C:\\path\\to\\POC"
 *
 * Optional:
 *   POC_INGEST_URL=https://<ref>.supabase.co/functions/v1/poc-ingest-api
 *   POC_SOURCE_LABEL="EAE POC robocopy mirror"
 *   POC_DRY_RUN=1
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const args=process.argv.slice(2)
const getArg=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:null}
const source=path.resolve(getArg('--source')||process.env.POC_MIRROR_PATH||'')
if(!source||source===path.resolve('.'))throw new Error('Provide --source or POC_MIRROR_PATH')
const endpoint=process.env.POC_INGEST_URL||'https://eyngapizkxsernywdyfv.supabase.co/functions/v1/poc-ingest-api'
const key=process.env.POC_INGEST_KEY||''
const dry=process.env.POC_DRY_RUN==='1'
const label=process.env.POC_SOURCE_LABEL||'EAE POC robocopy mirror'
if(!dry&&!key)throw new Error('POC_INGEST_KEY is required unless POC_DRY_RUN=1')

const FILES=['poc_dealers.json','_dealer_owner_map.json','poc_data.json','load_invoices.json','_brand_map.json','moves_owner_groups.json','_FLEET_MIRROR.json']
const sha=x=>crypto.createHash('sha256').update(x).digest('hex')
const iso=x=>new Date(x).toISOString()
const clean=x=>String(x??'').trim()
const arr=x=>Array.isArray(x)?x:(x==null||x===''?[]:[x])
const year=x=>{const n=Number(x);return Number.isFinite(n)?(n>0&&n<100?2000+n:Math.trunc(n)):null}
const numeric=x=>{const n=Number(x);return x==null||x===''||!Number.isFinite(n)?null:n}

async function read(name){
  const p=path.join(source,name)
  try{const [buf,st]=await Promise.all([fs.readFile(p),fs.stat(p)]);return{name,path:p,buf,st,hash:sha(buf)}}catch(e){if(e?.code==='ENOENT')return null;throw e}
}
const existing=(await Promise.all(FILES.map(read))).filter(Boolean)
if(!existing.length)throw new Error('No recognized POC snapshot files found in source directory')
const observedAt=new Date(Math.max(...existing.map(f=>f.st.mtimeMs))).toISOString()
const manifest=Object.fromEntries(existing.map(f=>[f.name,{bytes:f.buf.length,modified_at:iso(f.st.mtime),sha256:f.hash}]))
const snapshotHash=sha(JSON.stringify({files:Object.entries(manifest).sort()}))

function parseJson(file){try{return JSON.parse(file.buf.toString('utf8').replace(/^\uFEFF/,''))}catch(e){throw new Error(`${file.name}: invalid JSON: ${e.message}`)}}
const byName=Object.fromEntries(existing.map(f=>[f.name,f]))
const records=[]

function dealerRecords(){
  const f=byName['poc_dealers.json'];if(!f)return
  const j=parseJson(f),rows=Array.isArray(j)?j:(j.dealers||j.rows||[])
  for(const d of rows){
    const n=clean(d.n??d.dealer_num??d.dlrNum);if(!n)continue
    const base={type:'dealer',source_file:f.name,source_key:n,observed_at:iso(f.st.mtime),dealer_num:n,dealer_name:d.nm??d.name??null,city:d.c??d.city??null,state:d.s??d.state??null,zip:d.z??d.zip??null,region:d.rg??d.region??null,oem:d.o??d.oem??null,website:d.w??d.website??null,phone:d.p??d.phone??null,rep_assignment:d.r??d.rep??null,payload:d}
    records.push(base)
    for(const [kind,val] of [['EMAIL',d.e],['EMAIL_EXTRA',d.ex]]){
      for(const v of arr(val).flatMap(x=>typeof x==='string'?x.split(/[;,]/):[x]).map(clean).filter(Boolean)){
        if(v.includes('@'))records.push({type:'contact',source_file:f.name,source_key:`${n}:${kind}:${v.toLowerCase()}`,observed_at:iso(f.st.mtime),dealer_num:n,contact_value:v.toLowerCase(),contact_type:kind,payload:{dealer_num:n,source_field:kind}})
      }
    }
  }
}
function ownerRecords(){
  const f=byName['_dealer_owner_map.json'];if(!f)return
  const j=parseJson(f),m=j.map||j.dealers||j.owner_map||{}
  for(const [dealerNum,val] of Object.entries(m)){
    const ownerKey=typeof val==='string'?val:(val?.owner_key??val?.key??'');if(!clean(ownerKey))continue
    let method='UNKNOWN',confidence=null
    if(String(ownerKey).startsWith('chain:')){method='CURATED_CHAIN';confidence=.98}
    else if(String(ownerKey).startsWith('grp:')){method='DOMAIN_CLUSTER';confidence=.72}
    else {method='OWNER_KEY';confidence=.65}
    records.push({type:'owner_relationship',source_file:f.name,source_key:clean(dealerNum),observed_at:iso(f.st.mtime),dealer_num:clean(dealerNum),owner_key:clean(ownerKey),relationship_method:method,relationship_status:'OBSERVED',confidence,payload:{owner_key:ownerKey}})
  }
}
function loadRecords(){
  const f=byName['poc_data.json'];if(!f)return
  const j=parseJson(f),loads=Array.isArray(j?.loads)?j.loads:[]
  for(const l of loads){
    const ln=clean(l.ln??l.load_number);if(!ln)continue
    records.push({
      type:'load',source_file:f.name,source_key:ln,observed_at:iso(f.st.mtime),
      load_number:ln,status:l.st??null,seller_dealer_num:l.sdn!=null?clean(l.sdn):null,seller_dealer_name:l.sdnm??null,
      buyer_dealer_num:l.bdn!=null?clean(l.bdn):null,rep:l.rep??null,seller_rep:l.sellRep??l.sellerRep??null,
      unit_count:numeric(l.uc),invoice_value:numeric(l.val),holdback:numeric(l.hb),advertising_261:numeric(l.t261),
      expense_65a:numeric(l.t65),fee_total:numeric(l.tfee),freight_total:numeric(l.fr??l.freight),sold_date:l.soldDate||null,
      units:arr(l.units).map(u=>({unit_number:numeric(u.u),vin:clean(u.vin).toUpperCase()||null,year:year(u.yr),make:u.mk??null,description:u.desc??null,invoice_amount:numeric(u.amt),holdback:numeric(u.hb),advertising_261:numeric(u.a261),expense_65a:numeric(u.a65),fee:numeric(u.fee),freight:numeric(u.fr),over_under_310:numeric(u.landedUnder??u.overUnder310)})),
      payload:l
    })
    for(const u of arr(l.units)){
      const v=clean(u.vin).toUpperCase();if(!v)continue
      records.push({type:'invoice_economics',source_file:f.name,source_key:`${ln}:${v}`,observed_at:iso(f.st.mtime),vin:v,load_number:ln,invoice_basis:'POC_LOAD_UNIT',invoice_amount:numeric(u.amt),holdback:numeric(u.hb),advertising_261:numeric(u.a261),expense_65a:numeric(u.a65),fee:numeric(u.fee),over_under_310:numeric(u.landedUnder??u.overUnder310),estimate_method:'POC_SNAPSHOT_FIELD_MAP',payload:{load_number:ln,unit:u}}
    }
  }
}
dealerRecords();ownerRecords();loadRecords()

const counts=records.reduce((m,r)=>(m[r.type]=(m[r.type]||0)+1,m),{})
console.log(JSON.stringify({source,observed_at:observedAt,snapshot_hash:snapshotHash,recognized_files:existing.map(x=>x.name),record_counts:counts,dry_run:dry},null,2))
if(dry)process.exit(0)

const CHUNK=500
for(let i=0;i<records.length;i+=CHUNK){
  const chunk=records.slice(i,i+CHUNK),batchKey=`records:${String(i/CHUNK).padStart(5,'0')}:${sha(JSON.stringify(chunk)).slice(0,16)}`
  const body={source_kind:'POC_MIRROR',source_label:label,source_path_hint:process.env.POC_INCLUDE_PATH_HINT==='1'?source:path.basename(source),source_modified_at:observedAt,observed_at:observedAt,body_hash:snapshotHash,manifest,batch_key:batchKey,records:chunk}
  const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-poc-ingest-key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)})
  const out=await r.json().catch(()=>({}))
  if(!r.ok||out.error)throw new Error(`ingest batch ${batchKey} failed: ${out.error||r.status}`)
  console.log(`batch ${i/CHUNK+1}/${Math.ceil(records.length/CHUNK)}: ${out.duplicate_batch?'already ingested':'ok'} (${out.records_written} normalized rows)`)
}
console.log('POC mirror ingest complete.')
