import puppeteer from 'puppeteer-core'

const fs=process.getBuiltinModule('fs')
const targets=JSON.parse(fs.readFileSync('config/dealer-scan-targets.json','utf8'))
const PROJECT_URL='https://eyngapizkxsernywdyfv.supabase.co'
const INGEST_URL=`${PROJECT_URL}/functions/v1/dealer-inspire-ingest`
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

function structuredVins(...sources){
  const found=[]
  const patterns=[
    /\bVIN\s*(?:#|number)?\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi,
    /["'](?:vin|vehicleIdentificationNumber)["']\s*:\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi,
    /(?:data-vin|data-vehicle-vin|data-vehicleidentificationnumber)\s*=\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi,
    /(?:\/vin\/|[?&]vin=)([A-HJ-NPR-Z0-9]{17})(?:\b|[&#/?])/gi
  ]
  for(const source of sources.map(String))for(const re of patterns){re.lastIndex=0;for(let x;(x=re.exec(source));)found.push(x[1].toUpperCase())}
  return [...new Set(found.filter(vinOK))].sort()
}

function reportedTotal(text){
  const s=String(text)
  const patterns=[
    /\b([0-9][0-9,]*)\s+vehicles?\s+found\b/i,
    /\b([0-9][0-9,]*)\s+results?\s+found\b/i,
    /showing\s+\d+\s*(?:-|–|to)\s*\d+\s+of\s+([0-9,]+)/i,
    /\b([0-9][0-9,]*)\s+(?:new\s+)?vehicles?\s+(?:available|in stock)\b/i,
    /["'](?:totalCount|totalVehicleCount|inventoryCount)["']?\s*[:=]\s*["']?([0-9,]+)/i
  ]
  for(const re of patterns){const m=s.match(re);if(m)return Number(m[1].replace(/,/g,''))}
  return null
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
  const r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(result),signal:AbortSignal.timeout(15000)}),d=await r.json().catch(()=>({}))
  if(!r.ok||d.error)throw Error(d.error||`ingest ${r.status}`)
  return d
}

function out(needed){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`browser_needed=${needed?'true':'false'}\n`)}

if(target.platform!=='DEALERINSPIRE'){
  console.log(JSON.stringify({dealer_id:dealerId,status:'SKIPPED',reason:'Not Dealer Inspire'}))
  out(true)
  process.exit(0)
}

const browserPaths=['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome-stable','/usr/bin/google-chrome'].filter(p=>fs.existsSync(p))
if(!browserPaths.length)throw Error('No system Chrome/Chromium found')

async function launchBrowser(){
  let last
  for(const executablePath of browserPaths){
    for(let attempt=1;attempt<=2;attempt++){
      try{
        return await puppeteer.launch({executablePath,headless:true,pipe:true,timeout:20000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-sync','--no-first-run','--no-default-browser-check','--disable-extensions']})
      }catch(e){last=e;console.log(JSON.stringify({dealer_id:dealerId,phase:'browser_launch_retry',executablePath,attempt,error:e.message}));await sleep(500*attempt)}
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

function challenged(title,text){return /just a moment|attention required|access denied|cloudflare/i.test(`${title}\n${String(text).slice(0,1500)}`)}

async function expand(page){
  let prior=0,stable=0
  for(let i=0;i<16;i++){
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)).catch(()=>{})
    await sleep(250)
    const x=await page.evaluate(()=>{
      const re=/^(load more|show more|view more|more vehicles|see more)$/i
      const el=[...document.querySelectorAll('button,a')].find(x=>re.test((x.textContent||'').replace(/\s+/g,' ').trim())&&!x.disabled)
      if(el){el.click();return{clicked:true,h:document.body.scrollHeight}}
      return{clicked:false,h:document.body.scrollHeight}
    }).catch(()=>({clicked:false,h:0}))
    stable=x.h===prior?stable+1:0;prior=x.h
    if(!x.clicked&&stable>=2)break
  }
}

async function snapshot(page){
  return page.evaluate(()=>{
    const anchors=[...document.querySelectorAll('a[href]')]
    const next=anchors.find(a=>{
      const rel=(a.getAttribute('rel')||'').toLowerCase(),aria=(a.getAttribute('aria-label')||'').trim(),text=(a.textContent||'').replace(/\s+/g,' ').trim()
      return rel.split(/\s+/).includes('next')||/^next(?: page)?$/i.test(aria)||/^next(?:\s*[›»→>]+)?$/i.test(text)
    })
    return{title:document.title,text:document.body?.innerText||'',html:document.documentElement.outerHTML,url:location.href,next:next?.href||null}
  })
}

async function scanLlm(browser){
  const page=await browser.newPage();await configure(page)
  const start=new URL('/llm/inventory/?limit=100&page=1&type=new',target.website).toString()
  try{
    const all=new Set(),evidence=[];let reported=null,lastUrl=start,exhausted=false
    for(let n=1;n<=60;n++){
      const u=new URL(start);u.searchParams.set('page',String(n))
      await page.goto(u.toString(),{waitUntil:'domcontentloaded',timeout:22000});await sleep(600)
      const snap=await snapshot(page)
      if(challenged(snap.title,snap.text))return{ok:false,reason:`challenge at /llm page ${n}`}
      const vs=structuredVins(snap.text,snap.html),t=reportedTotal(snap.text)
      if(!vs.length)return{ok:false,reason:`/llm page ${n} returned no structured/labeled VINs`}
      if(t!=null)reported=reported==null?t:Math.max(reported,t)
      vs.forEach(v=>all.add(v));lastUrl=snap.url;evidence.push({url:snap.url,title:snap.title,vin_count:vs.length,next_present:!!snap.next,vin_evidence:'LABELED_OR_STRUCTURED_ONLY'})
      if(!snap.next){exhausted=true;break}
    }
    const list=[...all].sort(),exact=reported!=null&&list.length===reported
    if(exhausted&&list.length>0&&(reported==null||exact)){
      return{ok:true,result:{dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:start,final_url:lastUrl,platform:'DEALERINSPIRE',pages_scanned:evidence.length,pagination_exhausted:true,reported_total:reported,coverage_proof:reported==null?'DEALER_INSPIRE_LLM_EXHAUSTED':'DEALER_INSPIRE_VEHICLES_FOUND',coverage_status:'COMPLETE',completeness_reason:reported==null?`Dealer Inspire strict new-only /llm inventory exhausted after ${evidence.length} page(s), yielding ${list.length} structured/labeled validated VINs.`:`Dealer Inspire /llm inventory returned ${list.length} structured/labeled validated VINs matching reported total ${reported}.`,vehicles:list.map(vin=>({vin,platform:'DEALERINSPIRE'})),page_evidence:evidence}}
    }
    return{ok:false,reason:`/llm did not reconcile: ${list.length}${reported!=null?` of ${reported}`:''}`}
  }finally{await page.close().catch(()=>{})}
}

async function scanPublicInventory(browser){
  const candidates=[]
  if(target.inventory_url&&!target.inventory_url.includes('/llm/inventory'))candidates.push(target.inventory_url)
  for(const p of ['/search/new/tp/','/search/new/','/new-vehicles/','/new-inventory/','/inventory/new'])candidates.push(new URL(p,target.website).toString())

  let best={vin_count:0,reason:'No usable public inventory page.'}
  for(const start of [...new Set(candidates)]){
    const page=await browser.newPage();await configure(page)
    const all=new Set(),evidence=[],seen=new Set(),networkVins=new Set(),pending=new Set();let reported=null,current=start,exhausted=false,lastUrl=start
    const onResponse=response=>{
      const req=response.request(),type=req.resourceType(),url=response.url()
      if(!['xhr','fetch','document','script'].includes(type))return
      if(!/(inventory|vehicle|search|listing|ajax|api|graphql|wp-json)/i.test(url))return
      const len=Number(response.headers()['content-length']||0);if(len>2500000)return
      const p=response.text().then(body=>{for(const vin of structuredVins(body))networkVins.add(vin);const t=reportedTotal(body);if(t!=null)reported=reported==null?t:Math.max(reported,t)}).catch(()=>{}).finally(()=>pending.delete(p));pending.add(p)
    }
    page.on('response',onResponse)
    try{
      for(let n=1;n<=60;n++){
        if(seen.has(current)){exhausted=true;break}seen.add(current)
        try{await page.goto(current,{waitUntil:'domcontentloaded',timeout:22000})}catch(e){if(!evidence.length)throw e;break}
        await sleep(900);await expand(page);await sleep(400);await Promise.allSettled([...pending]);
        const snap=await snapshot(page);lastUrl=snap.url
        if(!sameHost(snap.url,target.website))break
        if(challenged(snap.title,snap.text)){if(!evidence.length)break;else{exhausted=false;break}}
        const domVins=structuredVins(snap.text,snap.html);for(const v of domVins)all.add(v);for(const v of networkVins)all.add(v)
        const t=reportedTotal(`${snap.text}\n${snap.html}`);if(t!=null)reported=reported==null?t:Math.max(reported,t)
        evidence.push({url:snap.url,title:snap.title,vin_count:all.size,next_present:!!snap.next,vin_evidence:'DOM_OR_PUBLIC_XHR_STRUCTURED_ONLY'})
        let next=snap.next
        if(next){try{next=new URL(next,snap.url).toString()}catch{next=null}}
        if(next&&!sameHost(next,target.website))next=null
        if(!next){exhausted=true;break}
        current=next
      }
      const list=[...all].sort(),exact=reported!=null&&list.length===reported&&list.length>0
      if(exhausted&&exact){
        return{ok:true,result:{dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:start,final_url:lastUrl,platform:'DEALERINSPIRE',pages_scanned:evidence.length,pagination_exhausted:true,reported_total:reported,coverage_proof:'DEALER_INSPIRE_PUBLIC_TOTAL_RECONCILED',coverage_status:'COMPLETE',completeness_reason:`Dealer Inspire public inventory page/XHR scan exhausted and exactly reconciled ${list.length} structured/labeled validated VINs to reported total ${reported}.`,vehicles:list.map(vin=>({vin,platform:'DEALERINSPIRE'})),page_evidence:evidence}}
      }
      const reason=`Public inventory observed ${list.length}${reported!=null?` of reported ${reported}`:''} structured/labeled VINs across ${evidence.length} page(s); exhaustive exact reconciliation not proven.`
      if(list.length>best.vin_count)best={vin_count:list.length,reported,evidence,start,lastUrl,reason}
    }catch(e){if(best.vin_count===0)best.reason=e.message}
    finally{page.off('response',onResponse);await page.close().catch(()=>{})}
  }
  return{ok:false,best}
}

let browser
try{
  browser=await launchBrowser()
  const llm=await scanLlm(browser)
  if(llm.ok){const saved=await persist(llm.result);console.log(JSON.stringify({...llm.result,ingest:saved},null,2));out(false);process.exit(0)}
  console.log(JSON.stringify({dealer_id:dealerId,phase:'llm_fallback',reason:llm.reason}))
  const publicScan=await scanPublicInventory(browser)
  if(publicScan.ok){const saved=await persist(publicScan.result);console.log(JSON.stringify({...publicScan.result,ingest:saved},null,2));out(false);process.exit(0)}
  console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',vin_count:publicScan.best?.vin_count||0,reported_total:publicScan.best?.reported??null,pages_scanned:publicScan.best?.evidence?.length||0,reason:publicScan.best?.reason||llm.reason},null,2))
  out(false)
}catch(e){
  console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',error:e.message,reason:'Dealer Inspire public-source scan failed without proving exhaustive coverage.'},null,2))
  out(false)
}finally{await browser?.close().catch(()=>{})}
process.exit(0)
