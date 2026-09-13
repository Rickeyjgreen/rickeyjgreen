const fs=process.getBuiltinModule('fs')
const targets=JSON.parse(fs.readFileSync('config/dealer-scan-targets.json','utf8'))
const PROJECT_URL='https://eyngapizkxsernywdyfv.supabase.co'
const INGEST_URL=`${PROJECT_URL}/functions/v1/dealer-browser-ingest`
const dealerId=String(process.env.DEALER_IDS||'').trim()
const target=targets.find(x=>String(x.dealer_id)===dealerId)
if(!target)throw Error(`Unknown dealer ${dealerId}`)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const host=u=>new URL(u).hostname.toLowerCase().replace(/^www\./,'')
const same=(a,b)=>{try{return host(a)===host(b)}catch{return false}}
function vinOK(v){if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return false;const m={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];let s=0;for(let i=0;i<17;i++){const c=v[i],n=/\d/.test(c)?+c:m[c];if(n==null)return false;s+=n*w[i]}return v[8]===(s%11===10?'X':String(s%11))}
function text(html){return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()}
function vins(html){const s=String(html),out=new Set(),patterns=[/\bVIN\s*(?:\||:|#|&nbsp;|&#160;|<[^>]+>|\s)*([A-HJ-NPR-Z0-9]{17})\b/gi,/["'](?:vin|vehicleIdentificationNumber)["']\s*:\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi,/(?:data-vin|data-vehicle-vin)\s*=\s*["']([A-HJ-NPR-Z0-9]{17})["']/gi];for(const re of patterns)for(const m of s.matchAll(re)){const v=m[1].toUpperCase();if(vinOK(v))out.add(v)}return[...out].sort()}
function stats(html){const t=text(html),tm=t.match(/\b([0-9][0-9,]*)\s+(?:Results Found|vehicles found)\b/i),pm=t.match(/\bPage\s*(\d+)\s*of\s*(\d+)\b/i);return{reported:tm?Number(tm[1].replace(/,/g,'')):null,page:pm?Number(pm[1]):null,pages:pm?Number(pm[2]):null,plain:t}}
async function get(url){let last;for(let a=1;a<=3;a++){try{const r=await fetch(url,{redirect:'follow',headers:{accept:'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36 ScrapeIt/7.0'},signal:AbortSignal.timeout(15000)});if(!same(r.url,target.website))throw Error(`off-host ${r.url}`);if(r.status===429||r.status>=500){last=Error(`HTTP ${r.status}`);await sleep(400*a);continue}if(!r.ok)throw Error(`HTTP ${r.status}`);const html=await r.text();if(/just a moment|attention required|access denied|cloudflare|you have been blocked/i.test(text(html).slice(0,2000)))throw Error('challenge/access page');return{url:r.url,html,...stats(html),vins:vins(html)}}catch(e){last=e;await sleep(250*a)}}throw last||Error('fetch failed')}
async function oidc(){const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;if(!u||!t)throw Error('OIDC unavailable');const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(7000)}),d=await r.json();if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`);return d.value}
async function persist(result){const token=await oidc(),r=await fetch(INGEST_URL,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(result),signal:AbortSignal.timeout(20000)}),d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw Error(d.error||`ingest ${r.status}`);return d}
function output(browserNeeded){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`browser_needed=${browserNeeded?'true':'false'}\n`)}
function withRoute(base,route){const u=new URL(base);let p=u.pathname;if(!p.endsWith('/'))p+='/';u.pathname=p+route.replace(/^\//,'');u.search='';return u.toString()}
function pageTemplates(base){const clean=base.endsWith('/')?base:`${base}/`;return[
 n=>withRoute(clean,`c:100,p:${n}/`),
 n=>withRoute(clean,`p:${n},c:100/`),
 n=>withRoute(clean,`c:100/pg:${n}/`),
 n=>withRoute(clean,`c:100/p:${n}/`),
 n=>{const u=new URL(withRoute(clean,'c:100/'));u.searchParams.set('page',String(n));return u.toString()},
 n=>{const u=new URL(withRoute(clean,'c:100/'));u.searchParams.set('p',String(n));return u.toString()},
 n=>{const u=new URL(clean);u.searchParams.set('page',String(n));return u.toString()},
 n=>{const u=new URL(clean);u.searchParams.set('p',String(n));return u.toString()}
]}

if(target.platform!=='DEALER_EPROCESS'){console.log(JSON.stringify({dealer_id:dealerId,status:'SKIPPED',reason:'Not Dealer eProcess'}));output(true);process.exit(0)}
try{
 const base=target.inventory_url||new URL('/search/new/tp/',target.website).toString(),firstCandidates=[withRoute(base,'c:100/'),base]
 let first=null
 for(const u of firstCandidates){try{const x=await get(u);if(x.reported&&x.vins.length){if(!first||x.vins.length>first.vins.length)first=x;if(x.vins.length===x.reported)break}}catch(e){console.log(JSON.stringify({dealer_id:dealerId,phase:'first_candidate',url:u,error:e.message}))}}
 if(!first)throw Error('No usable Dealer eProcess SRP response')
 if(first.vins.length===first.reported){const result={dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:first.url,final_url:first.url,platform:'DEALER_EPROCESS',pages_scanned:1,pagination_exhausted:true,reported_total:first.reported,coverage_proof:'DEALER_EPROCESS_REPORTED_TOTAL_EXHAUSTED',coverage_status:'COMPLETE',completeness_reason:`Dealer eProcess SRP returned ${first.vins.length} labeled/structured validated VINs matching reported total ${first.reported} on one page.`,vehicles:first.vins.map(vin=>({vin,platform:'DEALER_EPROCESS'})),page_evidence:[{url:first.url,title:'Dealer eProcess page 1',vin_count:first.vins.length,next_present:false,vin_evidence:'LABELED_OR_STRUCTURED_ONLY'}]};const saved=await persist(result);console.log(JSON.stringify({...result,ingest:saved},null,2));output(false);process.exit(0)}
 const templates=pageTemplates(base);let chosen=null,second=null
 for(let i=0;i<templates.length;i++){try{const x=await get(templates[i](2));const different=x.vins.some(v=>!first.vins.includes(v));if(x.reported===first.reported&&x.page===2&&different){chosen=templates[i];second=x;break}}catch(e){}}
 if(!chosen)throw Error(`Could not discover verified Dealer eProcess page-2 route; page 1 observed ${first.vins.length}/${first.reported}.`)
 const totalPages=first.pages||second.pages||Math.ceil(first.reported/Math.max(1,first.vins.length)),all=new Set(first.vins),ev=[{url:first.url,title:'Dealer eProcess page 1',vin_count:first.vins.length,next_present:totalPages>1,vin_evidence:'LABELED_OR_STRUCTURED_ONLY'}]
 for(let n=2;n<=totalPages;n++){const x=n===2?second:await get(chosen(n));if(x.reported!==first.reported||x.page!==n)throw Error(`Dealer eProcess pagination proof failed at page ${n}`);x.vins.forEach(v=>all.add(v));ev.push({url:x.url,title:`Dealer eProcess page ${n}`,vin_count:x.vins.length,next_present:n<totalPages,vin_evidence:'LABELED_OR_STRUCTURED_ONLY'})}
 const unique=[...all].sort();if(unique.length!==first.reported)throw Error(`Dealer eProcess exhausted ${totalPages} pages but unique VINs ${unique.length} != reported ${first.reported}`)
 const result={dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:first.url,final_url:ev.at(-1).url,platform:'DEALER_EPROCESS',pages_scanned:ev.length,pagination_exhausted:true,reported_total:first.reported,coverage_proof:'DEALER_EPROCESS_REPORTED_TOTAL_EXHAUSTED',coverage_status:'COMPLETE',completeness_reason:`Dealer eProcess pagination exhausted after ${ev.length} page(s); ${unique.length} labeled/structured validated VINs reconcile exactly to reported total ${first.reported}.`,vehicles:unique.map(vin=>({vin,platform:'DEALER_EPROCESS'})),page_evidence:ev}
 const saved=await persist(result);console.log(JSON.stringify({...result,ingest:saved},null,2));output(false)
}catch(e){console.log(JSON.stringify({dealer_id:dealerId,status:'INCOMPLETE',platform:'DEALER_EPROCESS',error:e.message},null,2));output(true)}