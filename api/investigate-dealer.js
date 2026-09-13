const KEY='sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36'
const host=u=>new URL(u).hostname.toLowerCase().replace(/^www\./,'')
const same=(a,b)=>{try{return host(a)===host(b)}catch{return false}}
function ok(v){if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))return false;const m={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9},w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];let s=0;for(let i=0;i<17;i++){const c=v[i],n=/\d/.test(c)?+c:m[c];if(n==null)return false;s+=n*w[i]}return v[8]===(s%11===10?'X':String(s%11))}
const vins=t=>[...new Set((String(t||'').toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/g)||[]).filter(ok))].sort()
function platform(t,u=''){const s=`${t} ${u}`.toLowerCase();if(s.includes('dealerinspire')||s.includes('/llm/inventory'))return'DEALERINSPIRE';if(s.includes('dealeron.com')||s.includes('dealeron.js')||s.includes('/api/vhcliaa/'))return'DEALERON';if(s.includes('dealer.com')||s.includes('ddc-')||s.includes('searchnew.aspx'))return'DEALER_DOT_COM';if(s.includes('dealerfire'))return'DEALERFIRE';if(s.includes('eprocess'))return'DEALER_EPROCESS';return'GENERIC_HTTP'}
function total(t){for(const p of[/showing\s+\d+\s*(?:-|–|to)\s*\d+\s+of\s+(\d+)/i,/(?:totalCount|totalVehicleCount|inventoryCount)[\"']?\s*[:=]\s*[\"']?(\d+)/i,/data-(?:total|count|total-count|vehicle-count)=[\"'](\d+)[\"']/i,/([1-9]\d{0,4})\s+(?:new\s+)?vehicles?\s+(?:found|available|in stock)/i,/([1-9]\d{0,4})\s+(?:results?|matches?)\b/i]){const m=t.match(p);if(m)return +m[1]}return null}
function next(t,u){const m=t.match(/<link[^>]+rel=[\"']next[\"'][^>]+href=[\"']([^\"']+)[\"']/i)||t.match(/<a[^>]+(?:rel=[\"']next[\"']|aria-label=[\"'](?:next|next page)[\"'])[^>]+href=[\"']([^\"']+)[\"']/i);if(!m?.[1])return null;try{const n=new URL(m[1],u).toString();return same(n,u)?n:null}catch{return null}}
async function get(u){const r=await fetch(u,{redirect:'follow',headers:{'user-agent':UA,accept:'text/html,application/xhtml+xml,application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const text=await r.text();if(!same(r.url,u))throw Error('Off-host redirect');return{url:r.url,text,content_type:r.headers.get('content-type')||''}}
async function scan(start,website){const seen=new Set(),all=new Set(),pages=[];let u=start,reported=null,p='GENERIC_HTTP',exhausted=false;for(let i=0;i<30;i++){if(seen.has(u)){exhausted=true;break}seen.add(u);const x=await get(u),vs=vins(x.text),tt=total(x.text);p=platform(x.text,x.url);vs.forEach(v=>all.add(v));if(tt!=null)reported=reported==null?tt:Math.max(reported,tt);pages.push({url:x.url,vin_count:vs.length,status:'OBSERVED'});const n=next(x.text,x.url);if(!n){exhausted=true;break}u=n}const list=[...all].sort();let coverage='INCOMPLETE',reason='Observed public inventory evidence, but exhaustive coverage was not proven.';if(reported!=null&&list.length===reported&&exhausted){coverage='COMPLETE';reason=`Validated VIN count ${list.length} reconciled exactly to reported total ${reported}.`}else if(p==='DEALERON'&&list.length&&exhausted){coverage='COMPLETE';reason=`DealerOn pagination exhausted after ${pages.length} page(s).`}else if(reported!=null)reason=`Observed ${list.length} validated VINs while the page reports ${reported}; refusing COMPLETE.`;return{inventory_url:pages[0]?.url||start,platform:p,pages_scanned:pages.length,pagination_exhausted:exhausted,reported_total:reported,coverage_status:coverage,completeness_reason:reason,vin_count:list.length,vins:list,page_evidence:pages}}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'})
  if(req.headers.apikey!==KEY)return res.status(401).json({error:'Unauthorized application key.'})
  let website=String(req.body?.website||'').trim();if(!website)return res.status(400).json({error:'Dealer website is required.'})
  if(!/^https?:\/\//i.test(website))website=`https://${website}`
  let base;try{base=new URL(website);if(!/^https?:$/.test(base.protocol))throw Error()}catch{return res.status(400).json({error:'Enter a valid http(s) dealer website.'})}
  const root=`${base.protocol}//${base.host}`
  const candidates=['/llm/inventory/?type=new','/searchnew.aspx','/new-inventory/index.htm','/new-vehicles/','/new-inventory/','/inventory/new','/vehicles/new'].map(p=>new URL(p,root).toString())
  const attempts=[];let best=null
  for(const url of candidates){
    try{const result=await scan(url,root);attempts.push({url,status:'OK',platform:result.platform,vin_count:result.vin_count,coverage_status:result.coverage_status});if(!best||result.coverage_status==='COMPLETE'&&best.coverage_status!=='COMPLETE'||result.vin_count>best.vin_count)best=result;if(result.coverage_status==='COMPLETE')break}catch(e){attempts.push({url,status:'ERROR',error:e.message})}
  }
  if(!best||!best.vin_count)return res.status(200).json({website:root,status:'NO_USABLE_INVENTORY_EVIDENCE',coverage_status:'INCOMPLETE',completeness_reason:'No validated VIN inventory route was found using the fast public HTTP probe.',attempts})
  return res.status(200).json({website:root,status:'OBSERVED',...best,attempts,evidence_class:'PUBLIC_WEB_OBSERVATION',confidence:best.coverage_status==='COMPLETE'?0.95:0.65,monitored:false})
}
