const PROJECT_URL='https://eyngapizkxsernywdyfv.supabase.co'
const PUBLISHABLE_KEY='sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const DEALER_API_URL=`${PROJECT_URL}/functions/v1/dealer-intel-api`
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
async function contactFallback(dealerId){
  const response=await fetch('/api/dealer-contacts',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({dealerId})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok||data?.error)throw new Error(data?.error||`Contact crawler failed with HTTP ${response.status}`)
  return data
}

export function loadDealerState(){return callApi(DEALER_API_URL,{operation:'state'})}
export function loadControlState(jobId){return callApi(CONTROL_API_URL,{operation:'state',...(jobId?{jobId}:{})})}
export function createControlJob(jobType,dealerIds,label=''){return callApi(CONTROL_API_URL,{operation:'create_job',jobType,dealerIds,label})}
export function cancelControlJob(jobId){return callApi(CONTROL_API_URL,{operation:'cancel_job',jobId})}
export function resumeStaleControlJob(jobId){return callApi(CONTROL_API_URL,{operation:'resume_stale',jobId})}
export function updateControlItem(jobId,dealerId,patch){return callApi(CONTROL_API_URL,{operation:'update_item',jobId,dealerId,...patch})}
export function loadContactCandidates(dealerIds=[]){return callApi(CONTROL_API_URL,{operation:'contacts',dealerIds})}
export function loadAdminContactWorkspace(dealerIds,adminKey){return callApi(CONTROL_API_URL,{operation:'admin_workspace',dealerIds},{'x-scrape-admin':adminKey})}
export function reviewContact(candidateId,action,targetContactText,adminKey,notes=''){return callApi(CONTROL_API_URL,{operation:'review_contact',candidateId,action,targetContactText,notes},{'x-scrape-admin':adminKey})}

export async function scanDealerInventory(dealerId,{jobId=null}={}){
  if(jobId)await updateControlItem(jobId,dealerId,{status:'RUNNING',stage:'DIRECT_HTTP',progress:12,message:'Trying direct platform adapter'})
  try{
    const direct=await callApi(DEALER_API_URL,{operation:'scan',dealerId})
    if(direct?.result?.status==='COMPLETE'){
      if(jobId)await updateControlItem(jobId,dealerId,{status:'COMPLETE',stage:'SAVED',progress:100,mode:'DIRECT_HTTP',platform:direct.result.platform,vin_count:direct.result.vin_count||0,message:direct.result.completeness_reason||'Complete coverage proven'})
      return direct
    }
    if(jobId)await updateControlItem(jobId,dealerId,{status:'RUNNING',stage:'BROWSER_FALLBACK',progress:45,mode:'BROWSER',platform:direct?.result?.platform||null,vin_count:direct?.result?.vin_count||0,message:'Direct path did not prove complete coverage; launching browser fallback'})
    const browser=await browserFallback(dealerId)
    const state=await loadDealerState()
    const result={dealer_id:String(dealerId),dealer_name:browser.dealer_name,status:browser.ingest?.status||browser.coverage_status,vin_count:browser.ingest?.vin_count??browser.vehicles?.length??0,platform:browser.platform,pages_scanned:browser.pages_scanned,coverage_status:browser.ingest?.coverage_status||browser.coverage_status,completeness_reason:browser.ingest?.completeness_reason||browser.completeness_reason,reported_total:browser.reported_total,change:browser.ingest?.change||null}
    if(jobId)await updateControlItem(jobId,dealerId,{status:result.status==='COMPLETE'?'COMPLETE':'INCOMPLETE',stage:'SAVED',progress:100,mode:'BROWSER',platform:result.platform,vin_count:result.vin_count||0,message:result.completeness_reason||result.status})
    return{result,state}
  }catch(e){
    if(jobId)await updateControlItem(jobId,dealerId,{status:'ERROR',stage:'ERROR',progress:100,error_message:e.message,message:'Inventory scan failed'}).catch(()=>{})
    throw e
  }
}

export async function scanDealerContacts(dealerId,{jobId=null}={}){
  if(jobId)await updateControlItem(jobId,dealerId,{status:'RUNNING',stage:'STAFF_DISCOVERY',progress:18,message:'Searching dealer staff and leadership pages'})
  try{
    const result=await contactFallback(dealerId)
    if(jobId)await updateControlItem(jobId,dealerId,{status:'COMPLETE',stage:'CONTACTS_SAVED',progress:100,mode:'PUBLIC_WEB',contact_count:result.candidate_count||0,message:`${result.candidate_count||0} public decision-maker candidate(s) found`})
    return result
  }catch(e){
    if(jobId)await updateControlItem(jobId,dealerId,{status:'ERROR',stage:'ERROR',progress:100,error_message:e.message,message:'Contact discovery failed'}).catch(()=>{})
    throw e
  }
}

export async function runDealerJob(jobType,dealerIds,{concurrency=3,onProgress=()=>{}}={}){
  const created=await createControlJob(jobType,dealerIds,jobType==='CONTACTS'?'Decision-maker discovery':'Inventory scan')
  const jobId=created.job.job_id
  let cursor=0
  async function worker(){
    while(true){
      const index=cursor++;if(index>=dealerIds.length)return
      const id=String(dealerIds[index])
      try{
        const result=jobType==='CONTACTS'?await scanDealerContacts(id,{jobId}):await scanDealerInventory(id,{jobId})
        onProgress({dealerId:id,result,jobId})
      }catch(error){onProgress({dealerId:id,error,jobId})}
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,dealerIds.length)},worker))
  return await loadControlState(jobId)
}

export function exportCsv(filename,rows){
  if(!rows?.length)return false
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))]
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`
  const csv=[keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);return true
}
