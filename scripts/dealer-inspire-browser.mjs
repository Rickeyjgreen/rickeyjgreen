import puppeteer from 'puppeteer-core'

const fs=process.getBuiltinModule('fs')
const targets=JSON.parse(fs.readFileSync('config/dealer-scan-targets.json','utf8'))
const PROJECT_URL='https://eyngapizkxsernywdyfv.supabase.co'
const INGEST_URL=`${PROJECT_URL}/functions/v1/dealer-inspire-ingest`
const CC_HOST='websites-search.api.carscommerce.inc'
const CC_RE=/https:\/\/websites-search\.api\.carscommerce\.inc\/api\/v1\/listings\/(\d+)\/search/i
const SEARCH_SERVICE_RE=/var\s+SEARCH_SERVICE\s*=\s*(\{.*?\});/is
const dealerId=String(process.env.DEALER_IDS||'').trim()
const target=targets.find(x=>String(x.dealer_id)===dealerId)
if(!target)throw Error(`Unknown dealer ${dealerId}`)

const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const vinFormatOK=v=>/^[A-HJ-NPR-Z0-9]{17}$/.test(String(v||'').toUpperCase())
function vinChecksumOK(v){
  v=String(v||'').toUpperCase();if(!vinFormatOK(v))return false
  const m={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]
  let s=0;for(let i=0;i<17;i++){const c=v[i],n=/\d/.test(c)?+c:m[c];if(n==null)return false;s+=n*w[i]}
  return v[8]===(s%11===10?'X':String(s%11))
}
const num=v=>{if(v==null)return null;const n=Number(String(v).replace(/[$,]/g,''));return Number.isFinite(n)?n:null}
function extractService(html){
  const m=String(html||'').match(SEARCH_SERVICE_RE);if(!m)return null
  try{const x=JSON.parse(m[1]);return x?.ccid&&x?.apiKey?{ccid:String(x.ccid),apiKey:String(x.apiKey)}:null}catch{return null}
}
async function oidc(){
  const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if(!u||!t)throw Error('GitHub OIDC environment unavailable')
  const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(7000)}),d=await r.json()
  if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`);return d.value
}
async function persist(result){
  const token=await oidc(),r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(result),signal:AbortSignal.timeout(20000)}),d=await r.json().catch(()=>({}))
  if(!r.ok||d.error)throw Error(d.error||`ingest ${r.status}`);return d
}
function out(needed){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`browser_needed=${needed?'true':'false'}\n`)}
if(target.platform!=='DEALERINSPIRE'){console.log(JSON.stringify({dealer_id:dealerId,status:'SKIPPED',reason:'Not Dealer Inspire'}));out(true);process.exit(0)}

const browserPaths=['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome-stable','/usr/bin/google-chrome'].filter(p=>fs.existsSync(p))
async function launchBrowser(){
  let last;if(!browserPaths.length)throw Error('No system Chrome/Chromium found')
  for(const executablePath of browserPaths)for(let attempt=1;attempt<=2;attempt++)try{return await puppeteer.launch({executablePath,headless:true,pipe:true,timeout:20000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-sync','--no-first-run','--no-default-browser-check','--disable-extensions']})}catch(e){last=e;await sleep(500*attempt)}
  throw last||Error('Browser launch failed')
}
async function configure(page){
  await page.setViewport({width:1280,height:900});await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36');page.setDefaultNavigationTimeout(22000)
  await page.setRequestInterception(true);page.on('request',r=>['image','media','font'].includes(r.resourceType())?r.abort().catch(()=>{}):r.continue().catch(()=>{}))
}
async function discover(browser){
  const page=await browser.newPage();await configure(page);let found=null
  const capture=req=>{const m=req.url().match(CC_RE);if(!m)return;const k=req.headers()['x-api-key'];if(k)found={ccid:m[1],apiKey:String(k),evidence:'NETWORK_REQUEST',evidenceUrl:target.website}}
  page.on('request',capture)
  const urls=[];if(target.inventory_url&&!target.inventory_url.includes('/llm/inventory'))urls.push(target.inventory_url)
  for(const p of ['/','/new-vehicles/','/search/new/','/inventory/'])urls.push(new URL(p,target.website).toString())
  const evidence=[]
  try{
    for(const url of [...new Set(urls)]){
      try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000})}catch{}
      await sleep(900)
      const x=await page.evaluate(()=>({url:location.href,title:document.title,html:document.documentElement.outerHTML})).catch(()=>({url,title:'',html:''}))
      const cfg=extractService(x.html);evidence.push({url:x.url||url,title:x.title,config_found:!!cfg,network_found:!!found})
      if(found)return{config:found,evidence}
      if(cfg)return{config:{...cfg,evidence:'SEARCH_SERVICE_HTML',evidenceUrl:x.url||url},evidence}
    }
    return{config:null,evidence}
  }finally{page.off('request',capture);await page.close().catch(()=>{})}
}
function vehicle(hit){
  const vin=String(hit?.vin||'').trim().toUpperCase(),pricing=hit?.pricing||{},styles=hit?.styles||{},vdp=String(hit?.vdp_url||'')
  return{vin,year:num(hit?.year),make:hit?.make||null,model:hit?.model||null,trim:hit?.trim||null,engine:hit?.engine||null,stock_number:hit?.stock||null,status:hit?.status||null,price:num(pricing.our_price)||num(pricing.price)||null,msrp:num(pricing.msrp),vehicle_url:vdp?(vdp.startsWith('http')?vdp:new URL(vdp,target.website).toString()):null,platform:'DEALERINSPIRE',exterior_color:styles.exterior_color||null,interior_color:styles.interior_color||null}
}
async function scan(cfg){
  const ccid=String(cfg.ccid),endpoint=`https://${CC_HOST}/api/v1/listings/${encodeURIComponent(ccid)}/search`,origin=target.website.replace(/\/$/,'')
  const headers={'x-api-key':cfg.apiKey,'content-type':'application/json','accept':'application/json','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36','origin':origin,'referer':origin+'/'}
  const all=new Map(),pages=[];let total=null,page=1
  while(page<=100){
    const payload=page===1?{filters:{type:['New']}}:{filters:{type:['New']},page}
    let r;for(let a=1;a<=3;a++)try{r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});if(r.status>=500&&a<3){await sleep(400*a);continue}break}catch(e){if(a===3)throw e;await sleep(400*a)}
    if(!r?.ok)throw Error(`Cars Commerce HTTP ${r?.status||'network error'} on page ${page}`)
    const data=(await r.json())?.data||{},listings=Array.isArray(data.listings)?data.listings:[],t=num(data.total_vehicle_count)
    if(t==null)throw Error('Cars Commerce response omitted total_vehicle_count')
    total=total==null?t:total;if(t!==total)throw Error(`Cars Commerce total changed during scan: ${total} -> ${t}`)
    let accepted=0,checksumPass=0
    for(const hit of listings){
      if(String(hit?.type||'').toLowerCase()!=='new')throw Error(`Cars Commerce ignored New filter on page ${page}`)
      const v=vehicle(hit);if(!vinFormatOK(v.vin))throw Error(`Structured New listing missing a valid 17-character VIN on page ${page}`)
      if(vinChecksumOK(v.vin))checksumPass++
      accepted++;all.set(v.vin,v)
    }
    pages.push({page,listing_count:listings.length,valid_vin_count:accepted,checksum_pass_count:checksumPass,total_vehicle_count:t})
    if(!listings.length||all.size>=total)break
    page++
  }
  if(total==null)throw Error('Cars Commerce new-inventory total unavailable')
  const listed=pages.reduce((n,p)=>n+p.listing_count,0)
  if(page>100)throw Error(`Cars Commerce new inventory exceeded page cap at ${all.size}/${total}`)
  if(all.size!==total)throw Error(`Cars Commerce New total ${total} does not reconcile to ${all.size} unique structured VINs (raw listings ${listed})`)
  if(listed!==total)throw Error(`Cars Commerce pagination produced ${listed} listing rows for reported New total ${total}; refusing duplicate/overlap ambiguity`)
  const vehicles=[...all.values()].sort((a,b)=>a.vin.localeCompare(b.vin)),checksumPass=pages.reduce((n,p)=>n+p.checksum_pass_count,0)
  return{dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:endpoint,final_url:endpoint,platform:'DEALERINSPIRE',pages_scanned:pages.length,pagination_exhausted:true,reported_total:total,coverage_proof:'DEALER_INSPIRE_CARS_COMMERCE_NEW_EXHAUSTED',coverage_status:'COMPLETE',completeness_reason:`Dealer Inspire Cars Commerce account ${ccid} was queried with type=New and returned ${total} New listings across ${pages.length} page(s); listing rows, unique structured VINs, and reported total reconciled exactly.`,vehicles,page_evidence:pages.map((p,i)=>({url:endpoint,title:`Cars Commerce New page ${p.page}`,vin_count:p.valid_vin_count,next_present:i<pages.length-1,vin_evidence:'CARS_COMMERCE_STRUCTURED_NEW',listing_count:p.listing_count,total_vehicle_count:p.total_vehicle_count,checksum_pass_count:p.checksum_pass_count})),platform_evidence:{ccid,discovery_method:cfg.evidence,discovery_url:cfg.evidenceUrl,total_new_inventory:total,checksum_pass_count:checksumPass}}
}

let browser
try{
  browser=await launchBrowser();const d=await discover(browser)
  if(!d.config){console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',reason:'Cars Commerce dealer account could not be discovered from public dealer pages.',discovery_evidence:d.evidence},null,2));out(false);process.exit(0)}
  console.log(JSON.stringify({dealer_id:dealerId,phase:'cars_commerce_discovered',ccid:d.config.ccid,evidence:d.config.evidence}))
  const result=await scan(d.config),saved=await persist(result);console.log(JSON.stringify({...result,ingest:saved},null,2));out(false)
}catch(e){console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',error:e.message,reason:'Dealer Inspire Cars Commerce New-inventory scan failed without proving exhaustive coverage.'},null,2));out(false)}
finally{await browser?.close().catch(()=>{})}
process.exit(0)
