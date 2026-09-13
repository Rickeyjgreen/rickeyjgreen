const ALLOWED_HOSTS=new Set([
  'www.kearnymesachevrolet.com','kearnymesachevrolet.com',
  'www.duvallchevygp.com','duvallchevygp.com',
  'www.athenschevy.com','athenschevy.com',
  'www.woodstockchevy.com','woodstockchevy.com',
  'www.bobluegers.com','bobluegers.com',
  'www.shepherdswabash.com','shepherdswabash.com',
  'www.cheapchevrolet.com','cheapchevrolet.com',
  'www.redriverchevy.com','redriverchevy.com',
  'www.jones-gmc.com','jones-gmc.com',
  'www.eagchevroletgmcnavasota.com','eagchevroletgmcnavasota.com',
  'www.eldoradochevy.com','eldoradochevy.com'
])

export default async function handler(req,res){
  try{
    const raw=String(req.query?.url||'')
    const u=new URL(raw)
    if(u.protocol!=='https:'||!ALLOWED_HOSTS.has(u.hostname))return res.status(400).json({error:'host_not_allowed'})
    if(!u.pathname.toLowerCase().startsWith('/llm/inventory'))return res.status(400).json({error:'path_not_allowed'})
    u.searchParams.set('type','new')
    const r=await fetch(u,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; ScrapeIt/1.0; public inventory verification)','accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(15000)})
    const text=await r.text()
    const challenge=/just a moment|attention required|access denied|cloudflare/i.test(text.slice(0,5000))
    const total=text.match(/\b([0-9][0-9,]*)\s+vehicles?\s+found\b/i)?.[1]||null
    const labeled=[...text.matchAll(/\bVIN\s*(?:#|number)?\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi)].slice(0,5).map(m=>m[1].toUpperCase())
    return res.status(200).json({requested:u.toString(),status:r.status,ok:r.ok,final_url:r.url,challenge,content_length:text.length,reported_total:total?Number(total.replace(/,/g,'')):null,labeled_vin_samples:labeled,title:text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()||null})
  }catch(e){return res.status(500).json({error:e.message})}
}
