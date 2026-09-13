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
const host=u=>new URL(u).hostname.toLowerCase().replace(/^www\./,'')
const sameHost=(a,b)=>{try{return host(a)===host(b)}catch{return false}}

function vinOK(v){
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return false
  const m={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]
  let s=0
  for(let i=0;i<17;i++){const c=v[i],n=/\d/.test(c)?+c:m[c];if(n==null)return false;s+=n*w[i]}
  return v[8]===(s%11===10?'X':String(s%11))
}

function num(v){if(v==null)return null;const n=Number(String(v).replace(/[$,]/g,''));return Number.isFinite(n)?n:null}
function extractService(html){
  const m=String(html||'').match(SEARCH_SERVICE_RE)
  if(!m)return null
  try{const cfg=JSON.parse(m[1]);if(!cfg?.ccid||!cfg?.apiKey)return null;return{ccid:String(cfg.ccid),apiKey:String(cfg.apiKey),apiUrl:String(cfg.apiUrl||'')}}catch{return null}
}

async function oidc(){
  const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if(!u||!t)throw Error('GitHub OIDC environment unavailable')
  const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(7000)}),d=await r.json()
  if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`)
  return d.value
}

async function persist(result){
  const token=await oidc()
  const r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(result),signal:AbortSignal.timeout(20000)}),d=await r.json().catch(()=>({}))
  if(!r.ok||d.error)throw Error(d.error||`ingest ${r.status}`)
  return d
}
function out(needed){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`browser_needed=${needed?'true':'false'}\n`)}

if(target.platform!=='DEALERINSPIRE'){
  console.log(JSON.stringify({dealer_id:dealerId,status:'SKIPPED',reason:'Not Dealer Inspire'}))
  out(true);process.exit(0)
}

const browserPaths=['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome-stable','/usr/bin/google-chrome'].filter(p=>fs.existsSync(p))
if(!browserPaths.length)throw Error('No system Chrome/Chromium found')

async function launchBrowser(){
  let last
  for(const executablePath of browserPaths){
    for(let attempt=1;attempt<=2;attempt++){
      try{return await puppeteer.launch({executablePath,headless:true,pipe:true,timeout:20000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-sync','--no-first-run','--no-default-browser-check','--disable-extensions']})}
      catch(e){last=e;console.log(JSON.stringify({dealer_id:dealerId,phase:'browser_launch_retry',executablePath,attempt,error:e.message}));await sleep(500*attempt)}
    }
  }
  throw last||Error('Browser launch failed')
}

async function configure(page){
  await page.setViewport({width:1280,height:900})
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36')
  page.setDefaultNavigationTimeout(22000)
  await page.setRequestInterception(true)
  page.on('request',r=>['image','media','font'].includes(r.resourceType())?r.abort().catch(()=>{}):r.continue().catch(()=>{}))
}
function challenged(title,text){return /just a moment|attention required|access denied|cloudflare|you have been blocked/i.test(`${title}\n${String(text).slice(0,2500)}`)}

async function discoverCarsCommerce(browser){
  const page=await browser.newPage();await configure(page)
  let found=null
  const capture=req=>{
    if(found)return
    const url=req.url(),m=url.match(CC_RE)
    if(!m)return
    const h=req.headers(),apiKey=h['x-api-key']||h['X-Api-Key']
    if(apiKey)found={ccid:m[1],apiKey:String(apiKey),apiUrl:`https://${CC_HOST}`,evidence:'NETWORK_REQUEST',evidenceUrl:url}
  }
  page.on('request',capture)
  const paths=[]
  if(target.inventory_url&&!target.inventory_url.includes('/llm/inventory'))paths.push(target.inventory_url)
  for(const p of ['/','/new-vehicles/','/inventory/','/search/new/','/used-vehicles/'])paths.push(new URL(p,target.website).toString())
  const evidence=[]
  try{
    for(const url of [...new Set(paths)]){
      try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000})}catch{}
      await sleep(1300)
      const snap=await page.evaluate(()=>({url:location.href,title:document.title,html:document.documentElement.outerHTML,text:document.body?.innerText||''})).catch(()=>({url,title:'',html:'',text:''}))
      const cfg=extractService(snap.html)
      evidence.push({url:snap.url||url,title:snap.title,challenge:challenged(snap.title,snap.text),config_found:!!cfg,network_found:!!found})
      if(cfg){found={...cfg,evidence:'SEARCH_SERVICE_HTML',evidenceUrl:snap.url||url};break}
      if(found)break
    }
    return{config:found,evidence}
  }finally{page.off('request',capture);await page.close().catch(()=>{})}
}

function vehicleFromHit(hit){
  const vin=String(hit?.vin||'').toUpperCase()
  const pricing=hit?.pricing||{},styles=hit?.styles||{}
  const vdp=String(hit?.vdp_url||'')
  let vehicleUrl=null
  if(vdp)vehicleUrl=vdp.startsWith('http')?vdp:new URL(vdp,target.website).toString()
  return{vin,year:num(hit?.year),make:hit?.make||null,model:hit?.model||null,trim:hit?.trim||null,engine:hit?.engine||null,stock_number:hit?.stock||null,status:hit?.status||null,price:num(pricing.our_price)||num(pricing.price)||null,msrp:num(pricing.msrp),vehicle_url:vehicleUrl,platform:'DEALERINSPIRE'}
}

async function scanCarsCommerce(cfg){
  const ccid=String(cfg.ccid),endpoint=`https://${CC_HOST}/api/v1/listings/${encodeURIComponent(ccid)}/search`
  const headers={'x-api-key':cfg.apiKey,'content-type':'application/json','accept':'application/json','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36','origin':target.website.replace(/\/$/,''),'referer':target.website.replace(/\/$/,'')+'/'}
  const all=new Map(),pages=[];let total=null,page=1,terminal=false
  while(page<=100){
    const payload=page===1?{filters:{}}:{filters:{},page}
    let r
    for(let attempt=1;attempt<=3;attempt++){
      try{r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});if(r.status>=500&&attempt<3){await sleep(500*attempt);continue}break}catch(e){if(attempt===3)throw e;await sleep(500*attempt)}
    }
    if(!r?.ok)throw Error(`Cars Commerce HTTP ${r?.status||'network error'} on page ${page}`)
    const json=await r.json(),data=json?.data||{},listings=Array.isArray(data.listings)?data.listings:[]
    const t=num(data.total_vehicle_count)
    if(t!=null)total=total==null?t:Math.max(total,t)
    let validThis=0
    for(const hit of listings){
      const v=vehicleFromHit(hit)
      if(!vinOK(v.vin))continue
      validThis++
      all.set(v.vin,{hit,vehicle:v})
    }
    pages.push({page,listing_count:listings.length,valid_vin_count:validThis,total_vehicle_count:t})
    if(!listings.length){terminal=true;break}
    if(total!=null&&all.size>=total){terminal=true;break}
    page++
  }
  if(total==null)throw Error('Cars Commerce response did not report total_vehicle_count')
  if(!terminal)throw Error(`Cars Commerce pagination exceeded page cap with ${all.size}/${total} unique VINs`)
  if(all.size!==total)throw Error(`Cars Commerce total ${total} does not reconcile to ${all.size} unique checksum-valid VINs`)
  const newRows=[...all.values()].filter(({hit})=>String(hit?.type||'').toLowerCase()==='new')
  const ambiguous=[...all.values()].filter(({hit})=>!hit?.type)
  if(ambiguous.length)throw Error(`Cars Commerce returned ${ambiguous.length} listing(s) without a vehicle type; refusing COMPLETE new-inventory proof`)
  const vehicles=newRows.map(x=>x.vehicle).sort((a,b)=>a.vin.localeCompare(b.vin))
  return{dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:endpoint,final_url:endpoint,platform:'DEALERINSPIRE',pages_scanned:pages.length,pagination_exhausted:true,reported_total:vehicles.length,coverage_proof:'DEALER_INSPIRE_CARS_COMMERCE_EXHAUSTED',coverage_status:'COMPLETE',completeness_reason:`Dealer Inspire Cars Commerce account ${ccid} returned ${total} total public listings across ${pages.length} page(s); every listing reconciled to a unique checksum-valid VIN and ${vehicles.length} were explicitly type New.`,vehicles,page_evidence:pages.map((p,i)=>({url:endpoint,title:`Cars Commerce page ${p.page}`,vin_count:p.valid_vin_count,next_present:i<pages.length-1,vin_evidence:'CARS_COMMERCE_STRUCTURED_LISTING',listing_count:p.listing_count,total_vehicle_count:p.total_vehicle_count})),platform_evidence:{ccid,discovery_method:cfg.evidence,discovery_url:cfg.evidenceUrl,total_all_inventory:total,new_inventory_count:vehicles.length}}
}

async function scanLlm(browser){
  const page=await browser.newPage();await configure(page)
  const start=new URL('/llm/inventory/?limit=100&page=1&type=new',target.website).toString()
  try{
    await page.goto(start,{waitUntil:'domcontentloaded',timeout:22000});await sleep(600)
    const snap=await page.evaluate(()=>({title:document.title,text:document.body?.innerText||'',html:document.documentElement.outerHTML,url:location.href})).catch(()=>({title:'',text:'',html:'',url:start}))
    if(challenged(snap.title,snap.text))return{ok:false,reason:'challenge at /llm inventory'}
    return{ok:false,reason:'Cars Commerce config unavailable; strict /llm fallback intentionally does not infer COMPLETE without independently reconciled pagination.'}
  }catch(e){return{ok:false,reason:e.message}}
  finally{await page.close().catch(()=>{})}
}

let browser
try{
  browser=await launchBrowser()
  const discovered=await discoverCarsCommerce(browser)
  if(discovered.config){
    console.log(JSON.stringify({dealer_id:dealerId,phase:'cars_commerce_discovered',ccid:discovered.config.ccid,evidence:discovered.config.evidence}))
    const result=await scanCarsCommerce(discovered.config)
    const saved=await persist(result)
    console.log(JSON.stringify({...result,ingest:saved},null,2));out(false);process.exit(0)
  }
  const llm=await scanLlm(browser)
  console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',reason:`Cars Commerce dealer account could not be discovered from public site execution. ${llm.reason}`,discovery_evidence:discovered.evidence},null,2))
  out(false)
}catch(e){
  console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',error:e.message,reason:'Dealer Inspire Cars Commerce scan failed without proving exhaustive coverage.'},null,2));out(false)
}finally{await browser?.close().catch(()=>{})}
process.exit(0)
