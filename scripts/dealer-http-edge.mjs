const fs=process.getBuiltinModule('fs')
const base='https://eyngapizkxsernywdyfv.supabase.co'
const edge=`${base}/functions/v1/dealer-intel-api`
const ingest=`${base}/functions/v1/dealer-browser-ingest`
const apikey='sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const dealerId=String(process.env.DEALER_IDS||'').trim()
if(!/^\d+$/.test(dealerId)) throw new Error('Exactly one DEALER_IDS value is required.')
const targets=JSON.parse(fs.readFileSync('config/dealer-scan-targets.json','utf8'))
const target=targets.find(x=>String(x.dealer_id)===dealerId)
const started=Date.now()
const host=u=>new URL(u).hostname.toLowerCase().replace(/^www\./,'')
const same=(a,b)=>{try{return host(a)===host(b)}catch{return false}}
function vinOK(v){if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return false;const m={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];let s=0;for(let i=0;i<17;i++){const c=v[i],n=/\d/.test(c)?+c:m[c];if(n==null)return false;s+=n*w[i]}return v[8]===(s%11===10?'X':String(s%11))}
const vins=t=>[...new Set((String(t).toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/g)||[]).filter(vinOK))].sort()
function next(t,current){const m=String(t).match(/<link[^>]+rel=[\"']next[\"'][^>]+href=[\"']([^\"']+)/i)||String(t).match(/<link[^>]+href=[\"']([^\"']+)[\"'][^>]+rel=[\"']next[\"']/i)||String(t).match(/<a[^>]+(?:rel=[\"']next[\"']|aria-label=[\"'](?:next|next page)[\"'])[^>]+href=[\"']([^\"']+)/i);if(!m)return null;try{const u=new URL(m[1],current).toString();return same(u,current)?u:null}catch{return null}}
async function get(url){const r=await fetch(url,{redirect:'follow',headers:{accept:'text/html,application/xhtml+xml,*/*;q=0.8','user-agent':'Mozilla/5.0 Chrome/152 Safari/537.36 ScrapeIt/3.0'},signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error(`HTTP ${r.status}`);if(target?.website&&!same(r.url,target.website))throw Error(`off-host:${r.url}`);return{url:r.url,text:await r.text()}}
async function oidc(){const u=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,t=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;if(!u||!t)throw Error('OIDC unavailable');const r=await fetch(`${u}${u.includes('?')?'&':'?'}audience=scrape-it-supabase`,{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(7000)});const d=await r.json();if(!r.ok||!d.value)throw Error(`OIDC ${r.status}`);return d.value}
async function directDealerOn(){if(target?.platform!=='DEALERON'||!target?.inventory_url)return null;const all=new Set(),seen=new Set();let current=target.inventory_url,pages=0,exhausted=false;for(let i=0;i<20;i++){if(seen.has(current)){exhausted=true;break}seen.add(current);const p=await get(current);pages++;for(const v of vins(p.text))all.add(v);const n=next(p.text,p.url);if(!n){exhausted=true;break}current=n}if(!exhausted||!all.size)return null;const vehicles=[...all].sort().map(vin=>({vin,platform:'DEALERON'}));const token=await oidc();const body={dealer_id:target.dealer_id,dealer_name:target.dealer_name,dealer_website:target.website,status:'COMPLETE',source_url:target.inventory_url,final_url:target.inventory_url,platform:'DEALERON',pages_scanned:pages,pagination_exhausted:true,reported_total:null,coverage_status:'COMPLETE',completeness_reason:`DealerOn direct HTTP pagination exhausted after ${pages} page(s).`,vehicles};const r=await fetch(ingest,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw Error(d.error||`ingest ${r.status}`);return{status:'COMPLETE',coverage_status:'COMPLETE',platform:'DEALERON',vin_count:vehicles.length,pages_scanned:pages,adapter:'dealeron-direct-http-v1'}}
let result=null,error=null
try{result=await directDealerOn()}catch(e){error=e.message}
if(!result){try{const r=await fetch(edge,{method:'POST',headers:{apikey,'content-type':'application/json'},body:JSON.stringify({operation:'scan',dealerId}),signal:AbortSignal.timeout(45000)});const d=await r.json().catch(()=>({}));result=d?.result||null;error=d?.error||result?.error||error;if(!r.ok)result=null}catch(e){error=e.message}}
const complete=result?.status==='COMPLETE'&&result?.coverage_status==='COMPLETE'
console.log(JSON.stringify({dealer_id:dealerId,mode:result?.adapter||'HTTP_EDGE',status:result?.status||'ERROR',coverage_status:result?.coverage_status||null,platform:result?.platform||null,vin_count:result?.vin_count||0,pages_scanned:result?.pages_scanned||0,elapsed_ms:Date.now()-started,error:error||null},null,2))
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`browser_needed=${complete?'false':'true'}\n`)
