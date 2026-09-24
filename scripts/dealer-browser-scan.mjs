import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
import { loadRobotsPolicy } from './robots-policy.mjs'

const PROJECT_URL=process.env.SCRAPE_SUPABASE_URL
const PUBLISHABLE_KEY=process.env.SCRAPE_SUPABASE_PUBLISHABLE_KEY
if(!PROJECT_URL||new URL(PROJECT_URL).hostname!=='ioqdvdsjtzwyjtdkywcu.supabase.co')throw Error('This cutover worker requires the Bybo Builds Supabase URL.')
const STATE_URL=`${PROJECT_URL}/functions/v1/dealer-intel-api`
const INGEST_URL=`${PROJECT_URL}/functions/v1/dealer-browser-ingest`
const MAX_PAGES=60,NAV_TIMEOUT=22000,DEALER_TIMEOUT=100000
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const host=u=>new URL(u).hostname.toLowerCase().replace(/^www\./,'')
const same=(a,b)=>{try{return host(a)===host(b)}catch{return false}}

function vinOK(v){
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return false
  const m={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]
  let s=0
  for(let i=0;i<17;i++){const c=v[i],n=/\d/.test(c)?+c:m[c];if(n==null)return false;s+=n*w[i]}
  return v[8]===(s%11===10?'X':String(s%11))
}

function structuredVins(text,html){
  const found=[]
  const patterns=[
    /\bVIN\s*(?:#|number)?\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi,
    /["'](?:vin|vehicleIdentificationNumber)["']\s*:\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi,
    /(?:data-vin|data-vehicle-vin|data-vehicleidentificationnumber)\s*=\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi,
    /(?:\/vin\/|[?&]vin=)([A-HJ-NPR-Z0-9]{17})(?:\b|[&#/?])/gi
  ]
  for(const source of [String(text),String(html)])for(const re of patterns){re.lastIndex=0;for(let x;(x=re.exec(source));)found.push(x[1].toUpperCase())}
  return [...new Set(found.filter(vinOK))].sort()
}

function platform(html,url){
  const s=`${url}\n${html}`.toLowerCase()
  if(s.includes('/llm/inventory')||s.includes('dealerinspire'))return'DEALERINSPIRE'
  if(s.includes('dealeron.com')||s.includes('dealeron.js')||s.includes('/api/vhcliaa/'))return'DEALERON'
  if(s.includes('dealer.com')||s.includes('ddc-site')||(s.includes('providerid')&&s.includes('ddc')))return'DEALER_DOT_COM'
  if(s.includes('dealerfire'))return'DEALERFIRE'
  return'GENERIC_BROWSER'
}

function reported(text,p,url){
  const t=String(text)
  if(p==='DEALERINSPIRE'){
    let u;try{u=new URL(url)}catch{return{total:null,proof:null}}
    if(!u.pathname.toLowerCase().includes('/llm/inventory')||u.searchParams.get('type')?.toLowerCase()!=='new')return{total:null,proof:null}
    const m=t.match(/\b([0-9][0-9,]*)\s+vehicles?\s+found\b/i)
    return m?{total:Number(m[1].replace(/,/g,'')),proof:'DEALER_INSPIRE_VEHICLES_FOUND'}:{total:null,proof:null}
  }
  const patterns=[
    /showing\s+\d+\s*(?:-|–|to)\s*\d+\s+of\s+([0-9,]+)/i,
    /(?:totalCount|totalVehicleCount|inventoryCount)["']?\s*[:=]\s*["']?([0-9,]+)/i,
    /\b([1-9][0-9,]*)\s+(?:new\s+)?vehicles?\s+(?:found|available|in stock)\b/i,
    /\b([1-9][0-9,]*)\s+results?\s+found\b/i,
    /Browse our inventory of\s+([0-9,]+)\s+vehicles?/i
  ]
  for(const re of patterns){const m=t.match(re);if(m)return{total:Number(m[1].replace(/,/g,'')),proof:p==='DEALER_DOT_COM'?'DEALER_DOT_COM_REPORTED_TOTAL':'REPORTED_TOTAL_RECONCILIATION'}}
  return{total:null,proof:null}
}

function vehicles(text,html,p){
  const vins=structuredVins(text,html),out=[]
  const source=`${text}\n${html}`
  for(const vin of vins){
    const pos=source.toUpperCase().indexOf(vin),block=source.slice(Math.max(0,pos-1800),Math.min(source.length,pos+2600))
    const field=n=>block.match(new RegExp(`[\\"']${n}[\\"']\\s*:\\s*[\\"']([^\\"']+)[\\"']`,'i'))?.[1]
    const label=n=>block.match(new RegExp(`\\b${n}\\s*[:#]?\\s*([^\\n<]{1,80})`,'i'))?.[1]?.trim()
    const money=n=>{const raw=field(n)||block.match(new RegExp(`${n}[^$0-9]{0,25}\\$?([0-9][0-9,]{3,})`,'i'))?.[1];return raw?Number(String(raw).replace(/[^0-9.]/g,''))||null:null}
    out.push({vin,year:Number(field('year'))||null,make:field('make'),model:field('model'),trim:field('trim'),engine:field('engine'),stock_number:field('stockNumber')||field('stock')||label('Stock #'),status:field('status'),price:money('price')||money('internetPrice')||money('salePrice'),msrp:money('msrp'),vehicle_url:field('link')||field('url'),platform:p})
  }
  return out.sort((a,b)=>a.vin.localeCompare(b.vin))
}

async function oidc(){
  const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if(!u||!t)throw Error('GitHub OIDC environment unavailable')
  const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(7000)}),d=await r.json()
  if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`)
  return d.value
}

async function state(){
  if(process.env.SCRAPE_STATIC_TARGETS==='1')return{dealers:JSON.parse(readFileSync('config/dealer-scan-targets.json','utf8'))}
  if(!PUBLISHABLE_KEY)throw Error('SCRAPE_SUPABASE_PUBLISHABLE_KEY is required for live state.')
  let e
  for(let i=1;i<=3;i++){
    try{const r=await fetch(STATE_URL,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({operation:'state'}),signal:AbortSignal.timeout(7000)}),d=await r.json();if(r.ok&&!d.error)return d;e=Error(d.error||`state ${r.status}`)}catch(x){e=x}
    await sleep(250*i)
  }
  throw e
}

async function configure(page,robots,website){
  await page.setViewport({width:1280,height:900})
  await page.setUserAgent('BYBOInventoryBot/1.0 (+https://elite-market-intelligence.vercel.app/)')
  page.setDefaultNavigationTimeout(NAV_TIMEOUT)
  await page.setRequestInterception(true)
  page.on('request',r=>{
    const permitted=r.resourceType()==='document'&&same(r.url(),website)&&robots.allows(r.url())
    return permitted?r.continue().catch(()=>{}):r.abort().catch(()=>{})
  })
}

async function expand(page){
  let prior=0,stable=0
  for(let i=0;i<12;i++){
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)).catch(()=>{})
    await sleep(180)
    const x=await page.evaluate(()=>{const re=/^(load more|show more|view more|more vehicles|see more)$/i,el=[...document.querySelectorAll('button,a')].find(x=>re.test((x.textContent||'').trim())&&!x.disabled);if(el){el.click();return{clicked:true,h:document.body.scrollHeight}}return{clicked:false,h:document.body.scrollHeight}}).catch(()=>({clicked:false,h:0}))
    stable=x.h===prior?stable+1:0;prior=x.h
    if(!x.clicked&&stable>=2)break
  }
}

async function capture(page,url){
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT})
  await sleep(350)
  await expand(page)
  return page.evaluate(()=>{
    const anchors=[...document.querySelectorAll('a[href]')]
    const next=anchors.find(a=>{
      const rel=(a.getAttribute('rel')||'').toLowerCase(),aria=(a.getAttribute('aria-label')||'').trim(),text=(a.textContent||'').replace(/\s+/g,' ').trim()
      return rel.split(/\s+/).includes('next')||/^next(?: page)?$/i.test(aria)||/^next(?:\s*[›»→>]+)?$/i.test(text)
    })
    return{html:document.documentElement.outerHTML,text:document.body?.innerText||'',url:location.href,title:document.title,nextUrl:next?.href||null}
  })
}

function nextFromHtml(html,current){
  const m=String(html).match(/<link[^>]+rel=[\"']next[\"'][^>]+href=[\"']([^\"']+)/i)||String(html).match(/<link[^>]+href=[\"']([^\"']+)[\"'][^>]+rel=[\"']next[\"']/i)||String(html).match(/<a[^>]+(?:rel=[\"']next[\"']|aria-label=[\"'](?:next|next page)[\"'])[^>]+href=[\"']([^\"']+)/i)
  if(!m)return null
  try{const u=new URL(m[1],current).toString();return same(u,current)?u:null}catch{return null}
}

async function candidate(browser,start,website,robots){
  const page=await browser.newPage();await configure(page,robots,website)
  try{
    const pages=[],seen=new Set(),all=new Map();let current=start,reportedTotal=null,proof=null,p='GENERIC_BROWSER',exhausted=false
    for(let i=0;i<MAX_PAGES;i++){
      if(seen.has(current)){exhausted=true;break}
      if(!robots.allows(current))throw Error('Robots policy disallows '+current)
      if(robots.delayMs)await sleep(robots.delayMs)
      seen.add(current)
      let c;try{c=await capture(page,current)}catch(e){if(!pages.length)throw e;break}
      if(!same(c.url,website))throw Error(`Redirected off dealer host: ${c.url}`)
      if(/just a moment|attention required|access denied/i.test(`${c.title}\n${c.text.slice(0,1200)}`))throw Error(`Challenge/access page at ${c.url}`)
      p=platform(c.html,c.url)
      const combined=`${c.text}\n${c.html}`,rp=reported(combined,p,c.url)
      if(rp.total!=null)reportedTotal=reportedTotal==null?rp.total:Math.max(reportedTotal,rp.total)
      if(rp.proof)proof=rp.proof
      const pageVehicles=vehicles(c.text,c.html,p)
      for(const v of pageVehicles)all.set(v.vin,{...(all.get(v.vin)||{}),...v})
      pages.push({url:c.url,title:c.title,vin_count:pageVehicles.length,next_present:!!c.nextUrl})
      let n=c.nextUrl||nextFromHtml(c.html,c.url)
      if(n){try{n=new URL(n,c.url).toString()}catch{n=null}}
      if(n&&!same(n,website))n=null
      if(!n){exhausted=true;break}
      current=n
    }
    const vs=[...all.values()].sort((a,b)=>a.vin.localeCompare(b.vin))
    let coverage='INCOMPLETE',reason='Browser inventory observed; exhaustive coverage not proven.'
    const exact=reportedTotal!=null&&vs.length===reportedTotal&&vs.length>0
    if(p==='DEALERON'&&exhausted&&pages.length&&vs.length){coverage='COMPLETE';reason=`DealerOn pagination exhausted after ${pages.length} browser page(s).`}
    else if(p==='DEALER_DOT_COM'&&exhausted&&exact){coverage='COMPLETE';reason=`Dealer.com browser VIN count ${vs.length} reconciled exactly to reported total ${reportedTotal}.`}
    else if(p==='DEALERINSPIRE'&&proof==='DEALER_INSPIRE_VEHICLES_FOUND'&&exhausted&&exact&&vs.length>1){coverage='COMPLETE';reason=`Dealer Inspire strict vehicles-found count ${reportedTotal} reconciled to ${vs.length} validated VINs.`}
    else if(p==='GENERIC_BROWSER'&&exhausted&&exact){coverage='COMPLETE';proof='GENERIC_REPORTED_TOTAL_EXHAUSTED';reason=`Generic dealer inventory pagination exhausted after ${pages.length} page(s); ${vs.length} structured/labeled VINs reconcile exactly to reported total ${reportedTotal}.`}
    else if(reportedTotal!=null)reason=`Observed ${vs.length} structured/labeled validated VINs vs reported ${reportedTotal}; refusing COMPLETE without exact reconciliation.`
    return{source_url:start,final_url:pages[0]?.url||start,platform:p,pages_scanned:pages.length,pagination_exhausted:exhausted,reported_total:reportedTotal,coverage_proof:proof,coverage_status:coverage,completeness_reason:reason,vehicles:vs,page_evidence:pages}
  }finally{await page.close().catch(()=>{})}
}

async function scan(browser,dealer){
  const robots=await loadRobotsPolicy(dealer.website)
  const preferred=dealer.inventory_url?[dealer.inventory_url]:[]
  const base=new URL(dealer.website),paths=['/search/new/tp/','/llm/inventory/?type=new','/searchnew.aspx','/new-inventory/index.htm','/new-vehicles/','/new-inventory/','/inventory/new']
  const urls=[...new Set([...preferred,...paths.map(p=>new URL(p,base).toString())])]
  let best=null
  for(const u of urls){
    let x;try{x=await candidate(browser,u,dealer.website,robots)}catch(e){if(/Robots policy/.test(String(e.message)))throw e;continue}
    if(!best||x.coverage_status==='COMPLETE'||x.vehicles.length>best.vehicles.length)best=x
    if(x.coverage_status==='COMPLETE')break
  }
  if(!best)return{dealer_id:dealer.dealer_id,dealer_name:dealer.dealer_name,status:'ERROR',error:'No browser inventory candidate produced usable evidence.'}
  return{dealer_id:dealer.dealer_id,dealer_name:dealer.dealer_name,dealer_website:dealer.website,status:best.coverage_status,...best}
}

async function ingest(token,result){
  const r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(result),signal:AbortSignal.timeout(15000)}),d=await r.json().catch(()=>({}))
  if(!r.ok||d.error)throw Error(d.error||`ingest ${r.status}`)
  return d
}

const paths=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'],fs=process.getBuiltinModule('fs'),executablePath=paths.find(p=>fs.existsSync(p))
if(!executablePath)throw Error('No system Chrome/Chromium found')
const st=await state(),requested=process.env.DEALER_IDS?new Set(process.env.DEALER_IDS.split(',').map(x=>x.trim()).filter(Boolean)):null,dealers=st.dealers.filter(d=>requested?requested.has(d.dealer_id):d.latest_run?.status!=='COMPLETE')
console.log(`Hardened browser worker scanning ${dealers.length} dealer(s).`)
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-sync','--metrics-recording-only']}),token=await oidc(),summary=[]
try{
  for(const dealer of dealers){
    const started=Date.now();console.log(`Scanning ${dealer.dealer_id} ${dealer.dealer_name}`)
    let result
    try{result=await Promise.race([scan(browser,dealer),new Promise((_,rej)=>setTimeout(()=>rej(Error('Dealer hard timeout')),DEALER_TIMEOUT))])}catch(e){result={dealer_id:dealer.dealer_id,dealer_name:dealer.dealer_name,dealer_website:dealer.website,status:'ERROR',error:e.message}}
    if(result.status!=='ERROR'){try{result.ingest=await ingest(token,result)}catch(e){result.ingest_error=e.message}}
    summary.push({dealer_id:dealer.dealer_id,dealer_name:dealer.dealer_name,status:result.ingest?.status||result.status,vin_count:result.vehicles?.length||0,reported_total:result.reported_total??null,coverage_proof:result.coverage_proof||null,platform:result.platform||null,pages_scanned:result.pages_scanned||0,elapsed_ms:Date.now()-started,ingest_error:result.ingest_error||null})
    console.log(summary.at(-1))
  }
}finally{await browser.close()}
console.table(summary);console.log(JSON.stringify({summary},null,2));process.exit(0)
