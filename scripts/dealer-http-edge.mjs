const endpoint='https://eyngapizkxsernywdyfv.supabase.co/functions/v1/dealer-intel-api'
const apikey='sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const dealerId=String(process.env.DEALER_IDS||'').trim()
if(!/^\d+$/.test(dealerId)) throw new Error('Exactly one DEALER_IDS value is required.')
const started=Date.now()
const response=await fetch(endpoint,{method:'POST',headers:{apikey,'content-type':'application/json'},body:JSON.stringify({operation:'scan',dealerId}),signal:AbortSignal.timeout(45000)})
const data=await response.json().catch(()=>({}))
const result=data?.result||{}
const complete=response.ok&&result.status==='COMPLETE'&&result.coverage_status==='COMPLETE'
console.log(JSON.stringify({dealer_id:dealerId,mode:'HTTP_EDGE',status:result.status||'ERROR',coverage_status:result.coverage_status||null,platform:result.platform||null,vin_count:result.vin_count||0,pages_scanned:result.pages_scanned||0,elapsed_ms:Date.now()-started,error:data?.error||result.error||null},null,2))
if(process.env.GITHUB_OUTPUT){const fs=process.getBuiltinModule('fs');fs.appendFileSync(process.env.GITHUB_OUTPUT,`browser_needed=${complete?'false':'true'}\n`)}
