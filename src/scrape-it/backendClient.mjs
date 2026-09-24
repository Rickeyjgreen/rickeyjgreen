const PROJECT_URL=(import.meta.env?.VITE_SUPABASE_URL||'https://ioqdvdsjtzwyjtdkywcu.supabase.co').replace(/\/$/,'')
const PUBLISHABLE_KEY=import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_pDKlAcXntriR1kpsh9lmTg_w3H94PfE'
const DEALER_API_URL=`${PROJECT_URL}/functions/v1/dealer-intel-api`
const DEALER_STATE_URL=`${PROJECT_URL}/functions/v1/dealer-intel-state-v2`
const CONTROL_API_URL=`${PROJECT_URL}/functions/v1/scrape-control-api`

async function callApi(url,payload,extraHeaders={}){
  const response=await fetch(url,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json',...extraHeaders},body:JSON.stringify(payload)})
  const data=await response.json().catch(()=>({}))
  if(!response.ok||data?.error)throw new Error(data?.error||`Scrape It API failed with HTTP ${response.status}`)
  return data
}
async function browserFallback(dealerId){
  const response=await fetch('/api/dealer-browser',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({dealerId})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok||data?.error)throw new Error(data?.error||`Browser adapter failed with HTTP ${response.status}`)
  return data
}
async function contactFallback(dealerId,role='ANY',dealer={}){
  const response=await fetch('/api/dealer-contacts',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({dealerId,role,website:dealer.website,dealerName:dealer.dealer_name})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok||data?.error)throw new Error(data?.error||`Contact crawler failed with HTTP ${response.status}`)
  return data
}

export function loadDealerState(){return callApi(DEALER_STATE_URL,{operation:'state'})}
export function loadControlState(jobId){return callApi(CONTROL_API_URL,{operation:'state',...(jobId?{jobId}:{})})}
export function createControlJob(jobType,dealerIds,label=''){return callApi(CONTROL_API_URL,{operation:'create_job',jobType,dealerIds,label})}
export function cancelControlJob(jobId){return callApi(CONTROL_API_URL,{operation:'cancel_job',jobId})}
export function resumeStaleControlJob(jobId){return callApi(CONTROL_API_URL,{operation:'resume_stale',jobId})}
export function updateControlItem(jobId,dealerId,patch){return callApi(CONTROL_API_URL,{operation:'update_item',jobId,dealerId,...patch})}
export function loadContactCandidates(dealerIds=[]){return callApi(CONTROL_API_URL,{operation:'contacts',dealerIds})}
export function loadAdminContactWorkspace(dealerIds,adminKey){return callApi(CONTROL_API_URL,{operation:'admin_workspace',dealerIds},{'x-scrape-admin':adminKey})}
export function reviewContact(candidateId,action,targetContactText,adminKey,notes=''){return callApi(CONTROL_API_URL,{operation:'review_contact',candidateId,action,targetContactText,notes},{'x-scrape-admin':adminKey})}
export async function investigateDealer(website){const response=await fetch('/api/investigate-dealer',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({website})}),data=await response.json().catch(()=>({}));if(!response.ok||data?.error)throw new Error(data?.error||`Dealer investigation failed with HTTP ${response.status}`);return data}

export async function scanDealerInventory(dealerId,{jobId=null}={}){
  const started=performance.now();if(jobId)await updateControlItem(jobId,dealerId,{status:'RUNNING',stage:'DIRECT_HTTP',progress:12,message:'Trying direct platform adapter'})
  try{const direct=await callApi(DEALER_API_URL,{operation:'scan',dealerId});if(direct?.result?.status==='COMPLETE'){const elapsed_ms=Math.round(performance.now()-started);if(jobId)await updateControlItem(jobId,dealerId,{status:'COMPLETE',stage:'SAVED',progress:100,mode:'DIRECT_HTTP',platform:direct.result.platform,vin_count:direct.result.vin_count||0,metadata:{elapsed_ms},message:direct.result.completeness_reason||'Complete coverage proven'});return{...direct,elapsed_ms,state:await loadDealerState()}}
    if(jobId)await updateControlItem(jobId,dealerId,{status:'RUNNING',stage:'BROWSER_FALLBACK',progress:45,mode:'BROWSER',platform:direct?.result?.platform||null,vin_count:direct?.result?.vin_count||0,message:'Direct path did not prove complete coverage; launching browser fallback'});const browser=await browserFallback(dealerId),state=await loadDealerState(),elapsed_ms=Math.round(performance.now()-started),result={dealer_id:String(dealerId),dealer_name:browser.dealer_name,status:browser.ingest?.status||browser.coverage_status,vin_count:browser.ingest?.vin_count??browser.vehicles?.length??0,platform:browser.platform,pages_scanned:browser.pages_scanned,coverage_status:browser.ingest?.coverage_status||browser.coverage_status,completeness_reason:browser.ingest?.completeness_reason||browser.completeness_reason,reported_total:browser.reported_total,change:browser.ingest?.change||null,elapsed_ms};if(jobId)await updateControlItem(jobId,dealerId,{status:result.status==='COMPLETE'?'COMPLETE':'INCOMPLETE',stage:'SAVED',progress:100,mode:'BROWSER',platform:result.platform,vin_count:result.vin_count||0,metadata:{elapsed_ms},message:result.completeness_reason||result.status});return{result,state,elapsed_ms}
  }catch(e){const elapsed_ms=Math.round(performance.now()-started);if(jobId)await updateControlItem(jobId,dealerId,{status:'ERROR',stage:'ERROR',progress:100,metadata:{elapsed_ms},error_message:e.message,message:'Inventory scan failed'}).catch(()=>{});throw e}}

export async function scanDealerContacts(dealerId,{jobId=null,role='ANY',dealer={}}={}){
  const started=performance.now();if(jobId)await updateControlItem(jobId,dealerId,{status:'RUNNING',stage:'STAFF_DISCOVERY',progress:18,message:`Searching public staff pages for ${role}`})
  try{if(!dealer?.website)throw new Error('Dealer website is unavailable for contact discovery.');const result=await contactFallback(dealerId,role,dealer),elapsed_ms=Math.round(performance.now()-started);if(jobId)await updateControlItem(jobId,dealerId,{status:'COMPLETE',stage:'CONTACTS_SAVED',progress:100,mode:result.mode||'PUBLIC_WEB',contact_count:result.candidate_count||0,metadata:{elapsed_ms,requested_role:role},message:`${result.candidate_count||0} public candidate(s) found for ${role}`});return{...result,elapsed_ms}
  }catch(e){const elapsed_ms=Math.round(performance.now()-started);if(jobId)await updateControlItem(jobId,dealerId,{status:'ERROR',stage:'ERROR',progress:100,metadata:{elapsed_ms,requested_role:role},error_message:e.message,message:'Contact discovery failed'}).catch(()=>{});throw e}}

export async function runDealerJob(jobType,dealerIds,{concurrency=3,onProgress=()=>{},role='ANY',dealerMap={}}={}){
  const created=await createControlJob(jobType,dealerIds,jobType==='CONTACTS'?`Decision-maker discovery: ${role}`:'Inventory scan'),jobId=created.job.job_id;onProgress({jobId,created:true,job:created.job,items:created.items||[]});let cursor=0
  async function worker(){while(true){const index=cursor++;if(index>=dealerIds.length)return;const id=String(dealerIds[index]);try{const result=jobType==='CONTACTS'?await scanDealerContacts(id,{jobId,role,dealer:dealerMap[id]||{}}):await scanDealerInventory(id,{jobId});onProgress({dealerId:id,result,jobId})}catch(error){onProgress({dealerId:id,error,jobId})}}}
  await Promise.all(Array.from({length:Math.min(concurrency,dealerIds.length)},worker));return await loadControlState(jobId)
}

export function exportCsv(filename,rows){if(!rows?.length)return false;const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))],esc=v=>`"${String(v??'').replaceAll('"','""')}"`,csv=[keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);return true}
