import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const MAX_BODY = 900_000
const MAX_BATCH = 3

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function readKeyMap(name: string): Record<string,string> { try { return JSON.parse(Deno.env.get(name) || '{}') } catch { return {} } }
function authorized(req: Request) {
  const supplied = req.headers.get('apikey') || ''
  return supplied.length > 0 && Object.values(readKeyMap('SUPABASE_PUBLISHABLE_KEYS')).includes(supplied)
}
function dbClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const secret = readKeyMap('SUPABASE_SECRET_KEYS').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !secret) throw new Error('Supabase server credentials are unavailable.')
  return createClient(url, secret, { auth: { persistSession:false, autoRefreshToken:false } })
}
function safeDealerId(v: unknown) {
  const id = String(v || '').trim()
  if (!/^\d{1,12}$/.test(id)) throw new Error('Invalid dealer id.')
  return id
}
async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('')
}
function canonicalUrl(raw: string) {
  const u = new URL(raw)
  if (!['http:','https:'].includes(u.protocol)) throw new Error('Unsupported dealer website protocol.')
  u.hash = ''
  return u.toString()
}
function normalizeHost(host: string) { return host.toLowerCase().replace(/^www\./,'') }
function sameDealerHost(a: string, b: string) { return normalizeHost(new URL(a).hostname) === normalizeHost(new URL(b).hostname) }
function discoverInventoryUrls(html: string, baseUrl: string) {
  const out: string[] = []
  const re = /href\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html))) {
    const href = m[1]
    if (!/(inventory|new[-_ ]?vehicle|search[-_ ]?new|new[-_ ]?cars|new[-_ ]?trucks)/i.test(href)) continue
    try {
      const u = new URL(href, baseUrl).toString()
      if (sameDealerHost(u, baseUrl) && !out.includes(u)) out.push(u)
    } catch {}
    if (out.length >= 8) break
  }
  const fallback = ['/new-vehicles/','/new-inventory/index.htm','/searchnew.aspx','/inventory/new','/new-inventory/']
  for (const path of fallback) {
    try { const u = new URL(path, baseUrl).toString(); if (!out.includes(u)) out.push(u) } catch {}
  }
  return out.slice(0, 8)
}
function vinChecksum(vin: string) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false
  const map: Record<string,number> = {A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9}
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]
  let sum = 0
  for (let i=0;i<17;i++) {
    const ch = vin[i]
    const val = /\d/.test(ch) ? Number(ch) : map[ch]
    if (val == null) return false
    sum += val * weights[i]
  }
  const expected = sum % 11 === 10 ? 'X' : String(sum % 11)
  return vin[8] === expected
}
function extractVins(html: string) {
  const matches = html.toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/g) || []
  return [...new Set(matches.filter(vinChecksum))].slice(0, 1000).sort()
}
async function fetchPage(url: string) {
  const started = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, { redirect:'follow', signal:controller.signal, headers:{ 'Accept':'text/html,application/xhtml+xml', 'User-Agent':'Mozilla/5.0 (compatible; ScrapeIt/1.0; dealer inventory observation)' } })
    const text = await res.text()
    return { finalUrl:res.url || url, status:res.status, statusText:res.statusText, contentType:res.headers.get('content-type'), durationMs:Math.round(performance.now()-started), text }
  } finally { clearTimeout(timer) }
}
async function loadState(db: any) {
  const dealersRes = await db.from('dealer_accounts').select('dealer_id,dealer_name,address,city,state,zip,region,website,source_row,source_class,source_label').order('dealer_name')
  if (dealersRes.error) throw dealersRes.error
  const dealers = dealersRes.data || []
  const dealerIds = dealers.map((d:any)=>d.dealer_id)
  const [runsRes, snapsRes, changesRes, signalsRes] = await Promise.all([
    db.from('dealer_scan_runs').select('*').in('dealer_id', dealerIds.length ? dealerIds : ['__none__']).order('started_at',{ascending:false}),
    db.from('dealer_inventory_snapshots').select('*').in('dealer_id', dealerIds.length ? dealerIds : ['__none__']).order('observed_at',{ascending:false}),
    db.from('dealer_inventory_changes').select('*').in('dealer_id', dealerIds.length ? dealerIds : ['__none__']).order('observed_at',{ascending:false}),
    db.from('dealer_action_signals').select('*').in('dealer_id', dealerIds.length ? dealerIds : ['__none__']).order('created_at',{ascending:false}),
  ])
  const latestBy = (rows:any[], key:string) => {
    const m = new Map<string,any>(); for (const row of rows || []) if (!m.has(row[key])) m.set(row[key], row); return m
  }
  const runMap = latestBy(runsRes.data || [], 'dealer_id')
  const snapMap = latestBy(snapsRes.data || [], 'dealer_id')
  const changeMap = latestBy(changesRes.data || [], 'dealer_id')
  const signalMap = latestBy(signalsRes.data || [], 'dealer_id')
  const enriched = dealers.map((d:any)=>({ ...d, latest_run:runMap.get(d.dealer_id)||null, latest_snapshot:snapMap.get(d.dealer_id)||null, latest_change:changeMap.get(d.dealer_id)||null, latest_signal:signalMap.get(d.dealer_id)||null }))
  const regionCounts: Record<string,number> = {}
  for (const d of dealers) regionCounts[d.region || 'UNKNOWN'] = (regionCounts[d.region || 'UNKNOWN'] || 0) + 1
  return { dealers: enriched, stats: { dealer_count:dealers.length, scanned_count:enriched.filter((d:any)=>d.latest_run?.status==='COMPLETE').length, error_count:enriched.filter((d:any)=>d.latest_run?.status==='ERROR').length, vin_count:enriched.reduce((sum:number,d:any)=>sum+Number(d.latest_snapshot?.vin_count||0),0), material_changes:(changesRes.data||[]).filter((x:any)=>x.material).length, regions:regionCounts } }
}
async function scanDealer(db:any, dealerIdRaw:unknown) {
  const dealerId = safeDealerId(dealerIdRaw)
  const dealerRes = await db.from('dealer_accounts').select('dealer_id,dealer_name,website').eq('dealer_id', dealerId).single()
  if (dealerRes.error || !dealerRes.data) throw new Error('Dealer not found.')
  const dealer = dealerRes.data
  const homepage = canonicalUrl(dealer.website)
  const runRes = await db.from('dealer_scan_runs').insert({ dealer_id:dealerId, status:'FETCHING', homepage_url:homepage, metadata:{ strategy:'PUBLIC_HTML_SAME_DOMAIN_V1' } }).select().single()
  if (runRes.error) throw runRes.error
  const runId = runRes.data.run_id
  try {
    const home = await fetchPage(homepage)
    const homeCapture = await db.from('dealer_site_captures').insert({ run_id:runId, dealer_id:dealerId, capture_type:'HOMEPAGE', source_url:home.finalUrl, fetched_at:new Date().toISOString(), http_status:home.status, status_text:home.statusText, content_type:home.contentType, duration_ms:home.durationMs, body_hash:await sha256(home.text), raw_text:home.text.slice(0,MAX_BODY) }).select().single()
    if (homeCapture.error) throw homeCapture.error
    if (home.status >= 400) throw new Error(`Dealer homepage returned HTTP ${home.status}`)
    const candidates = discoverInventoryUrls(home.text, home.finalUrl)
    await db.from('dealer_scan_runs').update({ status:'FETCHED', discovered_links:candidates }).eq('run_id',runId)
    let chosen:any = null
    for (const u of candidates.slice(0,5)) {
      try { const page = await fetchPage(u); if (page.status < 400 && /html/i.test(page.contentType || '')) { chosen=page; break } } catch {}
    }
    if (!chosen) chosen = home
    const inventoryCapture = await db.from('dealer_site_captures').insert({ run_id:runId, dealer_id:dealerId, capture_type:'INVENTORY', source_url:chosen.finalUrl, fetched_at:new Date().toISOString(), http_status:chosen.status, status_text:chosen.statusText, content_type:chosen.contentType, duration_ms:chosen.durationMs, body_hash:await sha256(chosen.text), raw_text:chosen.text.slice(0,MAX_BODY) }).select().single()
    if (inventoryCapture.error) throw inventoryCapture.error
    const vins = extractVins(chosen.text)
    const previous = await db.from('dealer_inventory_snapshots').select('*').eq('dealer_id',dealerId).order('observed_at',{ascending:false}).limit(1).maybeSingle()
    const observedAt = new Date().toISOString()
    const snapRes = await db.from('dealer_inventory_snapshots').insert({ run_id:runId, dealer_id:dealerId, capture_id:inventoryCapture.data.capture_id, observed_at:observedAt, inventory_url:chosen.finalUrl, vin_count:vins.length, vins, vehicles:vins.map(vin=>({vin})), parser_name:'validated-vin-html-parser', parser_version:'1.0.0', evidence_class:'STRUCTURED_DATA', confidence:vins.length ? 0.90 : 0.55 }).select().single()
    if (snapRes.error) throw snapRes.error
    const prevVins = new Set<string>(previous.data?.vins || [])
    const nextVins = new Set<string>(vins)
    const added = vins.filter(v=>!prevVins.has(v))
    const removed = [...prevVins].filter(v=>!nextVins.has(v)).sort()
    const type = !previous.data ? 'BASELINE_CAPTURED' : (added.length || removed.length ? 'INVENTORY_CHANGED' : 'NO_MATERIAL_CHANGE')
    const material = type === 'INVENTORY_CHANGED'
    const summary = type === 'BASELINE_CAPTURED' ? `Captured public-site baseline with ${vins.length} validated VINs.` : material ? `${added.length} VINs added and ${removed.length} VINs no longer observed on the scanned public inventory page.` : `No VIN-set change detected across ${vins.length} validated VINs.`
    const changeRes = await db.from('dealer_inventory_changes').insert({ run_id:runId, dealer_id:dealerId, snapshot_id:snapRes.data.snapshot_id, previous_snapshot_id:previous.data?.snapshot_id || null, change_type:type, material, added_vins:added, removed_vins:removed, added_count:added.length, removed_count:removed.length, summary, observed_at:observedAt, confidence:vins.length ? 0.90 : 0.55 }).select().single()
    if (changeRes.error) throw changeRes.error
    const signal = material ? { bucket:'VERIFY', action_type:'VERIFY_INVENTORY_CHANGE', confidence:'MEDIUM_PUBLIC_SITE_EVIDENCE', why_now:`${dealer.dealer_name} public inventory changed: ${added.length} added / ${removed.length} no longer observed.`, recommended_next_step:'Inspect the changed VINs and confirm current availability with the dealer before treating the change as a sale, trade, or disposal event.', uncertainties:['A VIN disappearing from a public dealer page does not prove it sold or moved wholesale.','Public-site inventory can lag the dealer system of record.'] } : { bucket:'WATCH', action_type:'WATCH_DEALER_INVENTORY', confidence:'MEDIUM_PUBLIC_SITE_EVIDENCE', why_now:type==='BASELINE_CAPTURED' ? `A first public-site VIN baseline now exists for ${dealer.dealer_name}.` : `No material VIN-set change was detected for ${dealer.dealer_name}.`, recommended_next_step:'Retain the baseline and scan again later; use repeated observations to identify inventory movement candidates.', uncertainties:['VIN extraction is limited to what the public HTML exposes.','Dealer website inventory may differ from internal inventory.'] }
    await db.from('dealer_action_signals').insert({ run_id:runId, dealer_id:dealerId, change_id:changeRes.data.change_id, ...signal })
    await db.from('dealer_scan_runs').update({ status:'COMPLETE', inventory_url:chosen.finalUrl, finished_at:new Date().toISOString(), metadata:{ strategy:'PUBLIC_HTML_SAME_DOMAIN_V1', vin_count:vins.length } }).eq('run_id',runId)
    return { dealer_id:dealerId, dealer_name:dealer.dealer_name, status:'COMPLETE', vin_count:vins.length, inventory_url:chosen.finalUrl, change:{ change_type:type, material, added_count:added.length, removed_count:removed.length, summary } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.from('dealer_scan_runs').update({ status:'ERROR', finished_at:new Date().toISOString(), error_code:'DEALER_SCAN_FAILED', error_message:message }).eq('run_id',runId)
    return { dealer_id:dealerId, dealer_name:dealer.dealer_name, status:'ERROR', error:message }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders})
  if (req.method !== 'POST') return json({error:'Method not allowed.'},405)
  if (!authorized(req)) return json({error:'Unauthorized application key.'},401)
  try {
    const body = await req.json().catch(()=>({}))
    const op = body?.operation || 'state'
    const db = dbClient()
    if (op === 'state') return json(await loadState(db))
    if (op === 'scan') return json({result:await scanDealer(db,body.dealerId),state:await loadState(db)})
    if (op === 'scan_batch') {
      const ids = Array.isArray(body.dealerIds) ? body.dealerIds.slice(0,MAX_BATCH) : []
      if (!ids.length) throw new Error('No dealer ids supplied.')
      const results=[]; for (const id of ids) results.push(await scanDealer(db,id))
      return json({results,state:await loadState(db)})
    }
    return json({error:'Unsupported operation.'},400)
  } catch (error) { return json({error:error instanceof Error ? error.message : String(error)},400) }
})