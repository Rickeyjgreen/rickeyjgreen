const PROJECT_URL='https://eyngapizkxsernywdyfv.supabase.co'
const INGEST_URL=`${PROJECT_URL}/functions/v1/vin-reference-ingest`
const VPIC='https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/'
const BATCH=50
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

async function oidc(){
  const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if(!u||!t)throw Error('GitHub OIDC unavailable')
  const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(10000)})
  const d=await r.json();if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`);return d.value
}
async function call(token,body){
  const r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
  const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw Error(d.error||`vin-reference-ingest ${r.status}`);return d
}
async function decode(vins){
  const form=new URLSearchParams({format:'json',data:vins.join(';')})
  const r=await fetch(VPIC,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'ScrapeIt-DealerPulse/1.0'},body:form,signal:AbortSignal.timeout(30000)})
  const d=await r.json().catch(()=>({}));if(!r.ok||!Array.isArray(d.Results))throw Error(`vPIC ${r.status}`);return d.Results
}

const token=await oidc()
const pending=await call(token,{operation:'pending',limit:Number(process.env.VIN_ENRICH_LIMIT||2000)})
const vins=(pending.vins||[]).map(x=>typeof x==='string'?x:x.vin).filter(Boolean)
console.log(`VIN enrichment pending: ${vins.length}`)
let decoded=0,failed=0
for(let i=0;i<vins.length;i+=BATCH){
  const batch=vins.slice(i,i+BATCH)
  try{
    const rows=await decode(batch)
    const result=await call(token,{operation:'ingest',rows})
    decoded+=result.upserted||0
    console.log(`batch ${Math.floor(i/BATCH)+1}: ${result.upserted||0} enriched`)
  }catch(e){
    failed+=batch.length
    console.error(`batch ${Math.floor(i/BATCH)+1} failed: ${e.message}`)
  }
  await sleep(150)
}
const refresh=await call(token,{operation:'refresh'})
console.log(JSON.stringify({pending:vins.length,decoded,failed,refresh:refresh.result},null,2))
if(failed&&decoded===0)process.exitCode=1
