import puppeteer from 'puppeteer-core'

const fs=process.getBuiltinModule('fs')
const targets=JSON.parse(fs.readFileSync('config/dealer-scan-targets.json','utf8'))
const PROJECT_URL='https://eyngapizkxsernywdyfv.supabase.co'
const INGEST_URL=`${PROJECT_URL}/functions/v1/dealer-inspire-ingest`
const dealerId=String(process.env.DEALER_IDS||'').trim()
const target=targets.find(x=>String(x.dealer_id)===dealerId)
if(!target)throw Error(`Unknown dealer ${dealerId}`)

const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function vinOK(v){if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return false;const m={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];let s=0;for(let i=0;i<17;i++){const c=v[i],n=/\d/.test(c)?+c:m[c];if(n==null)return false;s+=n*w[i]}return v[8]===(s%11===10?'X':String(s%11))}
function structuredVins(text,html){const found=[];const patterns=[
  /\bVIN\s*(?:#|number)?\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi,
  /["'](?:vin|vehicleIdentificationNumber)["']\s*:\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi,
  /(?:data-vin|data-vehicle-vin|data-vehicleidentificationnumber)\s*=\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi,
  /(?:\/vin\/|[?&]vin=)([A-HJ-NPR-Z0-9]{17})(?:\b|[&#/?])/gi
];for(const source of [String(text),String(html)])for(const re of patterns){re.lastIndex=0;for(let m;(m=re.exec(source));)found.push(m[1].toUpperCase())}return[...new Set(found.filter(vinOK))].sort()}
function total(text){for(const re of[/\b([0-9][0-9,]*)\s+vehicles?\s+found\b/i,/[-–]\s*([0-9][0-9,]*)\s+vehicles?\s+found/i]){const m=String(text).match(re);if(m)return Number(m[1].replace(/,/g,''))}return null}
async function oidc(){const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;if(!u||!t)throw Error('GitHub OIDC environment unavailable');const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(7000)}),d=await r.json();if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`);return d.value}
async function persist(result){const token=await oidc();const r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(result),signal:AbortSignal.timeout(15000)}),d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw Error(d.error||`ingest ${r.status}`);return d}
function out(needed){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`browser_needed=${needed?'true':'false'}\n`)}

if(target.platform!=='DEALERINSPIRE'){
  console.log(JSON.stringify({dealer_id:dealerId,status:'SKIPPED',reason:'Not Dealer Inspire'}))
  out(true)
  process.exit(0)
}

const paths=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser']
const executablePath=paths.find(p=>fs.existsSync(p));if(!executablePath)throw Error('No system Chrome/Chromium found')
const start=new URL('/llm/inventory/?limit=100&page=1&type=new',target.website).toString()
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-sync']})
let complete=false
try{
  const page=await browser.newPage();await page.setViewport({width:1280,height:900});await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36');page.setDefaultNavigationTimeout(20000);await page.setRequestInterception(true);page.on('request',r=>['image','media','font'].includes(r.resourceType())?r.abort().catch(()=>{}):r.continue().catch(()=>{}))
  const all=new Set(),evidence=[];let reported=null,lastUrl=start,exhausted=false
  for(let n=1;n<=20;n++){
    const u=new URL(start);u.searchParams.set('page',String(n))
    await page.goto(u.toString(),{waitUntil:'domcontentloaded',timeout:20000});await sleep(600)
    const snap=await page.evaluate(()=>({title:document.title,text:document.body?.innerText||'',html:document.documentElement.outerHTML,url:location.href,next:[...document.querySelectorAll('a[href]')].find(a=>/next/i.test(`${a.rel||''} ${a.getAttribute('aria-label')||''} ${a.textContent||''}`))?.href||null}))
    if(/just a moment|attention required|access denied/i.test(`${snap.title}\n${snap.text.slice(0,1000)}`))throw Error(`Challenge page blocked Dealer Inspire inventory at page ${n}`)
    const vs=structuredVins(snap.text,snap.html),t=total(snap.text)
    if(!vs.length)throw Error(`Strict Dealer Inspire inventory page ${n} returned no VIN-labeled or VIN-structured vehicles`)
    if(t!=null)reported=reported==null?t:Math.max(reported,t)
    vs.forEach(v=>all.add(v));lastUrl=snap.url;evidence.push({url:snap.url,title:snap.title,vin_count:vs.length,next_present:!!snap.next,vin_evidence:'LABELED_OR_STRUCTURED_ONLY'})
    if(reported!=null&&all.size===reported&&!snap.next){exhausted=true;break}
    if(!snap.next){exhausted=true;break}
  }
  const list=[...all].sort()
  const exact=reported!=null&&list.length===reported
  const strictExhausted=exhausted&&evidence.length>0&&evidence.at(-1)?.next_present===false
  if(strictExhausted&&list.length>0&&(reported==null||exact)){
    const proof=reported==null?'DEALER_INSPIRE_LLM_EXHAUSTED':'DEALER_INSPIRE_VEHICLES_FOUND'
    const reason=reported==null?`Dealer Inspire strict new-only /llm inventory exhausted after ${evidence.length} page(s), yielding ${list.length} VIN-labeled/structured validated VINs.`:`Dealer Inspire paginated /llm inventory returned ${list.length} VIN-labeled/structured validated VINs matching reported total ${reported} across ${evidence.length} page(s).`
    const result={dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:start,final_url:lastUrl,platform:'DEALERINSPIRE',pages_scanned:evidence.length,pagination_exhausted:true,reported_total:reported,coverage_proof:proof,coverage_status:'COMPLETE',completeness_reason:reason,vehicles:list.map(vin=>({vin,platform:'DEALERINSPIRE'})),page_evidence:evidence}
    const saved=await persist(result);complete=saved?.status==='COMPLETE'&&saved?.coverage_status==='COMPLETE';console.log(JSON.stringify({...result,ingest:saved},null,2))
  }else{
    console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',vin_count:list.length,reported_total:reported,pages_scanned:evidence.length,reason:`Dealer Inspire strict pagination did not prove exhaustion/reconciliation: observed ${list.length}${reported!=null?` of ${reported}`:''}.`,page_evidence:evidence},null,2))
  }
}catch(e){console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALERINSPIRE',error:e.message,reason:'Specialized Dealer Inspire proof failed; generic page-wide fallback is intentionally disabled for this platform.'},null,2))}
finally{await browser.close().catch(()=>{})}
out(false)
process.exit(0)
