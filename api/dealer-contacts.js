import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const config={maxDuration:120}
const P='https://eyngapizkxsernywdyfv.supabase.co'
const KEY='sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const DEALER_API=`${P}/functions/v1/dealer-intel-api`
const CONTROL_API=`${P}/functions/v1/scrape-control-api`
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36'
const roleGroups={
  ANY:/(dealer principal|dealer operator|owner|president|general manager|general sales manager|gsm\b|new car manager|new vehicle manager|used car manager|used vehicle manager|inventory manager|fleet manager|commercial manager|sales manager|internet manager|bdc manager|business development manager|variable operations|general sales)/i,
  PRINCIPAL:/(dealer principal|dealer operator|owner|president)/i,
  GM:/\bgeneral manager\b/i,
  GSM:/(general sales manager|\bgsm\b)/i,
  NEW_CAR:/(new car manager|new vehicle manager)/i,
  USED_CAR:/(used car manager|used vehicle manager)/i,
  INVENTORY:/inventory manager/i,
  FLEET:/(fleet manager|commercial manager)/i,
  SALES_MANAGER:/\bsales manager\b/i,
  BDC:/(internet manager|bdc manager|business development manager)/i,
}
const host=u=>new URL(u).hostname.toLowerCase().replace(/^www\./,'')
const same=(a,b)=>{try{return host(a)===host(b)}catch{return false}}
const uniq=a=>[...new Set(a)]
const clean=s=>(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()
const plausibleName=s=>/^[A-Za-z][A-Za-z'’.\-]+(?:\s+[A-Za-z][A-Za-z'’.\-]+){1,3}$/.test(clean(s))
function common(base){return ['/staff/','/team/','/about-us/','/meet-our-staff/','/meet-the-team/','/management/','/leadership/','/contact-us/','/contact/'].map(p=>new URL(p,base).toString())}
function roleFor(value){return roleGroups[String(value||'ANY').toUpperCase()]||roleGroups.ANY}

async function dealerState(id){
  const r=await fetch(DEALER_API,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({operation:'state'}),signal:AbortSignal.timeout(15000)})
  const d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Dealer state HTTP ${r.status}`)
  const dealer=d.dealers?.find(x=>String(x.dealer_id)===String(id));if(!dealer)throw Error('Dealer not found.')
  return dealer
}
async function priorSources(id){
  try{
    const r=await fetch(CONTROL_API,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({operation:'contacts',dealerIds:[String(id)]}),signal:AbortSignal.timeout(10000)})
    const d=await r.json();if(!r.ok||d.error)return[]
    return uniq((d.candidates||[]).map(x=>x.source_url).filter(Boolean))
  }catch{return[]}
}
async function ingest(dealerId,sourceUrl,candidates,bodyHash=''){
  if(!candidates.length)return null
  const r=await fetch(CONTROL_API,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({operation:'ingest_contacts',dealerId,sourceUrl,candidates,bodyHash}),signal:AbortSignal.timeout(15000)})
  const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw Error(d.error||`Contact ingest HTTP ${r.status}`);return d
}
async function digest(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function links(html,base){
  const out=[];for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    try{const u=new URL(m[1],base).toString(),label=clean(m[2].replace(/<[^>]+>/g,' '));if(same(u,base)&&/(staff|team|management|leadership|about|contact|employee)/i.test(`${u} ${label}`))out.push(u)}catch{}
  }return uniq(out)
}
function textLines(html){
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/article|\/section|h[1-6])\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .split(/\n+/).map(clean).filter(Boolean)
}
function extractFromLines(lines,role){
  const emailRe=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,phoneRe=/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/
  const out=[]
  for(let i=0;i<lines.length;i++){
    const title=lines[i];if(!role.test(title))continue
    const around=lines.slice(Math.max(0,i-4),Math.min(lines.length,i+5)),person=around.find((x,j)=>j!==Math.min(4,i)&&plausibleName(x)&&!roleGroups.ANY.test(x))
    if(!person)continue
    const raw=around.join(' '),email=(raw.match(emailRe)||[])[0]||null,phone=(raw.match(phoneRe)||[])[0]||null
    out.push({person_name:person,title,department:null,email,phone,confidence:(email||phone)?0.86:0.72,raw_excerpt:raw.slice(0,900)})
  }
  return [...new Map(out.map(x=>[`${x.person_name.toLowerCase()}|${x.title.toLowerCase()}|${x.email||''}|${x.phone||''}`,x])).values()].slice(0,60)
}
async function fetchHtml(url){
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,accept:'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(14000)})
  if(!r.ok)throw Error(`HTTP ${r.status}`);const final=r.url,ct=r.headers.get('content-type')||'';if(!same(final,url)||!ct.includes('text/html'))throw Error('Non-page response')
  const html=await r.text();return{html,url:final}
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'})
  if(req.headers.apikey!==KEY)return res.status(401).json({error:'Unauthorized application key.'})
  const dealerId=String(req.body?.dealerId||'').trim();if(!/^\d{1,12}$/.test(dealerId))return res.status(400).json({error:'Invalid dealer id.'})
  const roleKey=String(req.body?.role||'ANY').toUpperCase(),role=roleFor(roleKey)
  let browser
  try{
    const dealer=await dealerState(dealerId),base=dealer.website,cached=await priorSources(dealerId),sources=[],all=[]
    let homeLinks=[]
    try{const home=await fetchHtml(base);homeLinks=links(home.html,home.url)}catch{}
    const urls=uniq([...cached,...homeLinks,...common(base)]).filter(u=>same(u,base)).slice(0,12)

    // Fast path: direct HTTP. Most dealer staff pages are static enough that a browser is unnecessary.
    for(const url of urls){
      try{
        const x=await fetchHtml(url),result=extractFromLines(textLines(x.html),role);if(!result.length)continue
        await ingest(dealerId,x.url,result,await digest(x.html.slice(0,250000)))
        sources.push({source_url:x.url,count:result.length,mode:'DIRECT_HTTP'});all.push(...result.map(v=>({...v,source_url:x.url})))
      }catch{}
    }

    // Browser only when the fast path found nothing for the requested role.
    if(!all.length){
      browser=await puppeteer.launch({args:chromium.args,defaultViewport:{width:1365,height:1000},executablePath:await chromium.executablePath(),headless:true})
      const page=await browser.newPage();await page.setUserAgent(UA);await page.setRequestInterception(true)
      page.on('request',r=>['image','media','font'].includes(r.resourceType())?r.abort():r.continue())
      for(const url of urls.slice(0,8)){
        try{
          await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000});await new Promise(r=>setTimeout(r,350));if(!same(page.url(),base))continue
          const html=await page.content(),result=extractFromLines(textLines(html),role);if(!result.length)continue
          await ingest(dealerId,page.url(),result,await digest(html.slice(0,250000)))
          sources.push({source_url:page.url(),count:result.length,mode:'BROWSER_FALLBACK'});all.push(...result.map(v=>({...v,source_url:page.url()})))
        }catch{}
      }
    }
    const unique=[...new Map(all.map(x=>[`${x.person_name.toLowerCase()}|${x.title.toLowerCase()}|${x.email||''}|${x.phone||''}`,x])).values()]
    return res.status(200).json({dealer_id:dealerId,dealer_name:dealer.dealer_name,status:'COMPLETE',requested_role:roleKey,candidate_count:unique.length,candidates:unique,sources,mode:sources.some(x=>x.mode==='DIRECT_HTTP')?'DIRECT_HTTP':sources.length?'BROWSER_FALLBACK':'NO_MATCH'})
  }catch(e){return res.status(500).json({error:e.message})}
  finally{if(browser)await browser.close().catch(()=>{})}
}
