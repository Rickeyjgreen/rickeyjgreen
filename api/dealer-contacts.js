import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const config={maxDuration:120}
const P='https://eyngapizkxsernywdyfv.supabase.co'
const KEY='sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const DEALER_API=`${P}/functions/v1/dealer-intel-api`
const CONTROL_API=`${P}/functions/v1/scrape-control-api`
const roleRe=/(dealer principal|dealer operator|owner|president|general manager|general sales manager|gsm\b|new car manager|new vehicle manager|used car manager|used vehicle manager|inventory manager|fleet manager|commercial manager|sales manager|internet manager|bdc manager|business development manager|variable operations|general sales)/i
const host=u=>new URL(u).hostname.toLowerCase().replace(/^www\./,'')
const same=(a,b)=>{try{return host(a)===host(b)}catch{return false}}
const uniq=a=>[...new Set(a)]

async function dealerState(id){
  const r=await fetch(DEALER_API,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({operation:'state'}),signal:AbortSignal.timeout(15000)})
  const d=await r.json();if(!r.ok||d.error)throw Error(d.error||`Dealer state HTTP ${r.status}`)
  const dealer=d.dealers?.find(x=>String(x.dealer_id)===String(id));if(!dealer)throw Error('Dealer not found.')
  return dealer
}
async function ingest(dealerId,sourceUrl,candidates,bodyHash=''){
  if(!candidates.length)return null
  const r=await fetch(CONTROL_API,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({operation:'ingest_contacts',dealerId,sourceUrl,candidates,bodyHash}),signal:AbortSignal.timeout(15000)})
  const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw Error(d.error||`Contact ingest HTTP ${r.status}`);return d
}
async function digest(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function common(base){return ['/staff/','/team/','/about-us/','/meet-our-staff/','/meet-the-team/','/management/','/contact-us/','/contact/'].map(p=>new URL(p,base).toString())}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'})
  if(req.headers.apikey!==KEY)return res.status(401).json({error:'Unauthorized application key.'})
  const dealerId=String(req.body?.dealerId||'').trim();if(!/^\d{1,12}$/.test(dealerId))return res.status(400).json({error:'Invalid dealer id.'})
  let browser
  try{
    const dealer=await dealerState(dealerId),base=dealer.website
    browser=await puppeteer.launch({args:chromium.args,defaultViewport:{width:1365,height:1000},executablePath:await chromium.executablePath(),headless:true})
    const page=await browser.newPage();await page.setRequestInterception(true)
    page.on('request',r=>['image','media','font'].includes(r.resourceType())?r.abort():r.continue())
    const sources=[],all=[]
    let homepageLinks=[]
    try{
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});await new Promise(r=>setTimeout(r,500))
      homepageLinks=await page.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>({href:a.href,text:(a.textContent||'').trim()})).filter(x=>/(staff|team|management|leadership|about|contact)/i.test(`${x.href} ${x.text}`)).map(x=>x.href))
    }catch{}
    const urls=uniq([...homepageLinks,...common(base)]).filter(u=>same(u,base)).slice(0,10)
    for(const url of urls){
      try{
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000});await new Promise(r=>setTimeout(r,400));if(!same(page.url(),base))continue
        const result=await page.evaluate((roleSource)=>{
          const role=new RegExp(roleSource,'i'),emailRe=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,phoneRe=/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/
          const clean=s=>(s||'').replace(/\s+/g,' ').trim(),plausibleName=s=>/^[A-Za-z][A-Za-z'’.\-]+(?:\s+[A-Za-z][A-Za-z'’.\-]+){1,3}$/.test(s)&&!role.test(s)
          const blocks=[...document.querySelectorAll('article,li,[class*="staff" i],[class*="team" i],[class*="employee" i],[class*="person" i],[class*="member" i],[class*="bio" i]')]
          const out=[]
          for(const el of blocks){
            const raw=(el.innerText||'').trim();if(raw.length<8||raw.length>1200||!role.test(raw))continue
            const lines=raw.split(/\n+/).map(clean).filter(Boolean).slice(0,20),title=lines.find(x=>role.test(x));if(!title)continue
            const ti=lines.indexOf(title),near=[...lines.slice(Math.max(0,ti-3),ti),...lines.slice(ti+1,Math.min(lines.length,ti+4))],person=near.find(plausibleName)||lines.find(plausibleName);if(!person)continue
            const email=(raw.match(emailRe)||[])[0]||null,phone=(raw.match(phoneRe)||[])[0]||null
            out.push({person_name:person,title,department:null,email,phone,confidence:(email||phone)?0.88:0.76,raw_excerpt:clean(raw).slice(0,900)})
          }
          const key=x=>`${x.person_name.toLowerCase()}|${x.title.toLowerCase()}|${x.email||''}|${x.phone||''}`
          return [...new Map(out.map(x=>[key(x),x])).values()].slice(0,60)
        },roleRe.source)
        if(!result.length)continue
        const html=await page.content(),sourceUrl=page.url();await ingest(dealerId,sourceUrl,result,await digest(html.slice(0,250000)))
        sources.push({source_url:sourceUrl,count:result.length});all.push(...result.map(x=>({...x,source_url:sourceUrl})))
      }catch{}
    }
    const unique=[...new Map(all.map(x=>[`${x.person_name.toLowerCase()}|${x.title.toLowerCase()}|${x.email||''}|${x.phone||''}`,x])).values()]
    return res.status(200).json({dealer_id:dealerId,dealer_name:dealer.dealer_name,status:'COMPLETE',candidate_count:unique.length,candidates:unique,sources})
  }catch(e){return res.status(500).json({error:e.message})}
  finally{if(browser)await browser.close().catch(()=>{})}
}
