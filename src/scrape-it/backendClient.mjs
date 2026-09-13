// Public client configuration only. The publishable key is intentionally safe for browser use;
// all database tables deny anon/auth access and constrained server functions perform approved operations.
const PROJECT_URL = 'https://eyngapizkxsernywdyfv.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const SCRAPE_API_URL = `${PROJECT_URL}/functions/v1/scrape-it-api`
const DEALER_API_URL = `${PROJECT_URL}/functions/v1/dealer-intel-api`

async function callApi(url, payload) {
  const response = await fetch(url, { method:'POST', headers:{ apikey:PUBLISHABLE_KEY, 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) throw new Error(data?.error || `Scrape It API failed with HTTP ${response.status}`)
  return data
}
async function browserFallback(dealerId) {
  const response = await fetch('/api/dealer-browser', { method:'POST', headers:{ apikey:PUBLISHABLE_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({dealerId}) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) throw new Error(data?.error || `Browser adapter failed with HTTP ${response.status}`)
  return data
}
export function loadBackendState(query){return callApi(SCRAPE_API_URL,{operation:'state',query})}
export function runApprovedSource(query){return callApi(SCRAPE_API_URL,{operation:'refresh',query})}
export function submitFeedback(actionId,feedbackStatus,outcomeNote=''){return callApi(SCRAPE_API_URL,{operation:'feedback',actionId,feedbackStatus,outcomeNote})}
export function loadDealerState(){return callApi(DEALER_API_URL,{operation:'state'})}
export async function scanDealerInventory(dealerId){
  const direct=await callApi(DEALER_API_URL,{operation:'scan',dealerId})
  if(direct?.result?.status==='COMPLETE')return direct
  const browser=await browserFallback(dealerId)
  const state=await loadDealerState()
  return {result:{dealer_id:String(dealerId),dealer_name:browser.dealer_name,status:browser.ingest?.status||browser.coverage_status,vin_count:browser.ingest?.vin_count??browser.vehicles?.length??0,platform:browser.platform,pages_scanned:browser.pages_scanned,coverage_status:browser.ingest?.coverage_status||browser.coverage_status,completeness_reason:browser.ingest?.completeness_reason||browser.completeness_reason,reported_total:browser.reported_total,change:browser.ingest?.change||null},state}
}
export async function scanDealerBatch(dealerIds){const results=[];let state=null;for(const id of dealerIds.slice(0,3)){const r=await scanDealerInventory(id);results.push(r.result);state=r.state}return{results,state:state||await loadDealerState()}}
