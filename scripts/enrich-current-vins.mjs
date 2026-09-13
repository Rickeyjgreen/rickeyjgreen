const PROJECT_URL='https://eyngapizkxsernywdyfv.supabase.co'
const INGEST_URL=`${PROJECT_URL}/functions/v1/vin-reference-ingest`
const VPIC='https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/'
const WORKER_VERSION='2.2'
const BATCH=50
const ROUND_LIMIT=Math.max(50,Math.min(1000,Number(process.env.VIN_ENRICH_ROUND_LIMIT||1000)))
const MAX_ROUNDS=Math.max(1,Math.min(10,Number(process.env.VIN_ENRICH_MAX_ROUNDS||5)))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const errText=x=>typeof x==='string'?x:JSON.stringify(x)

async function oidc(){
  const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if(!u||!t)throw Error('GitHub OIDC unavailable')
  const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(10000)})
  const d=await r.json();if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`);return d.value
}
async function call(token,body,timeout=30000){
  const r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)})
  const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw Error(d.error?errText(d.error):`vin-reference-ingest ${r.status}`);return d
}
async function decode(vins){
  const form=new URLSearchParams({format:'json',data:vins.join(';')})
  const r=await fetch(VPIC,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'ScrapeIt-DealerPulse/1.0'},body:form,signal:AbortSignal.timeout(30000)})
  const d=await r.json().catch(()=>({}));if(!r.ok||!Array.isArray(d.Results))throw Error(`vPIC ${r.status}`);return d.Results
}

console.log(`VIN enrichment worker ${WORKER_VERSION}`)
const token=await oidc()
let decoded=0,failed=0,seen=0,rounds=0
for(let round=1;round<=MAX_ROUNDS;round++){
  const pending=await call(token,{operation:'pending',limit:ROUND_LIMIT})
  const vins=(pending.vins||[]).map(x=>typeof x==='string'?x:x.vin).filter(Boolean)
  console.log(`round ${round}: ${vins.length} pending VINs`)
  if(!vins.length)break
  rounds=round;seen+=vins.length
  for(let i=0;i<vins.length;i+=BATCH){
    const batch=vins.slice(i,i+BATCH)
    try{
      const rows=await decode(batch)
      const result=await call(token,{operation:'ingest',rows})
      decoded+=result.upserted||0
      console.log(`round ${round} batch ${Math.floor(i/BATCH)+1}: ${result.upserted||0} enriched`)
    }catch(e){
      failed+=batch.length
      console.error(`round ${round} batch ${Math.floor(i/BATCH)+1} failed: ${e.message}`)
    }
    await sleep(150)
  }
}
let refresh=null
for(let attempt=1;attempt<=3;attempt++){
  try{refresh=await call(token,{operation:'refresh'},90000);break}catch(e){console.error(`analytics refresh attempt ${attempt} failed: ${e.message}`);if(attempt<3)await sleep(1500*attempt);else throw e}
}
const remaining=await call(token,{operation:'pending',limit:1})
console.log(JSON.stringify({worker_version:WORKER_VERSION,rounds,seen,decoded,failed,remaining:(remaining.vins||[]).length,refresh:refresh?.result||null},null,2))
if(failed&&decoded===0)process.exitCode=1
