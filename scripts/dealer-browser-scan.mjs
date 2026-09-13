import puppeteer from 'puppeteer-core'

const PROJECT_URL = 'https://eyngapizkxsernywdyfv.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const STATE_URL = `${PROJECT_URL}/functions/v1/dealer-intel-api`
const INGEST_URL = `${PROJECT_URL}/functions/v1/dealer-browser-ingest`
const MAX_PAGES = 50

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function normalizeHost(value) { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') }
function sameHost(a, b) { try { return normalizeHost(a) === normalizeHost(b) } catch { return false } }
function vinChecksum(vin) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false
  const map = {A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9}
  const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const ch = vin[i]
    const value = /\d/.test(ch) ? Number(ch) : map[ch]
    if (value == null) return false
    sum += value * weights[i]
  }
  return vin[8] === (sum % 11 === 10 ? 'X' : String(sum % 11))
}
function extractVins(text) {
  return [...new Set((text.toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/g) || []).filter(vinChecksum))].sort()
}
function detectPlatform(html, url) {
  const s = `${url}\n${html}`.toLowerCase()
  if (s.includes('/llm/inventory') || s.includes('dealerinspire')) return 'DEALERINSPIRE'
  if (s.includes('dealeron.com') || s.includes('dealeron.js') || s.includes('/api/vhcliaa/')) return 'DEALERON'
  if (s.includes('dealer.com') || s.includes('ddc-site') || s.includes('providerid') && s.includes('ddc')) return 'DEALER_DOT_COM'
  if (s.includes('dealerfire')) return 'DEALERFIRE'
  return 'GENERIC_BROWSER'
}
function extractReportedTotal(text) {
  const patterns = [
    /showing\s+\d+\s*(?:-|–|to)\s*\d+\s+of\s+(\d+)/i,
    /(?:totalCount|totalVehicleCount|inventoryCount)[\"']?\s*[:=]\s*[\"']?(\d+)/i,
    /data-(?:total|count|total-count|vehicle-count)=[\"'](\d+)[\"']/i,
    /([1-9]\d{0,3})\s+(?:new\s+)?vehicles?\s+(?:found|available|in stock)/i,
    /(?:new inventory|new vehicles?)\s*[:\-]\s*([1-9]\d{0,3})/i,
    /([1-9]\d{0,3})\s+(?:results?|matches?)\b/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return Number(match[1])
  }
  return null
}
function extractVehicles(html, platform) {
  const byVin = new Map()
  const add = (v = {}) => {
    const vin = String(v.vin || '').toUpperCase()
    if (!vinChecksum(vin)) return
    const previous = byVin.get(vin) || { vin }
    const cleaned = { ...previous, ...Object.fromEntries(Object.entries(v).filter(([,x]) => x !== undefined && x !== null && x !== '')), vin }
    byVin.set(vin, cleaned)
  }
  const jsonPatterns = [
    /[\"']vin[\"']\s*:\s*[\"']([A-HJ-NPR-Z0-9]{17})[\"']/gi,
    /\bVIN\s*[:#]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi,
  ]
  for (const pattern of jsonPatterns) for (const match of html.matchAll(pattern)) add({ vin: match[1] })
  for (const vin of extractVins(html)) add({ vin })

  // Pull common structured fields when they occur close to a VIN in embedded JSON.
  for (const [vin, vehicle] of byVin) {
    const pos = html.toUpperCase().indexOf(vin)
    if (pos < 0) continue
    const block = html.slice(Math.max(0, pos - 1800), Math.min(html.length, pos + 3000))
    const field = (name) => block.match(new RegExp(`[\\\"']${name}[\\\"']\\s*:\\s*[\\\"']([^\\\"']+)[\\\"']`, 'i'))?.[1]
    const price = (name) => {
      const raw = field(name) || block.match(new RegExp(`${name}[^$0-9]{0,25}\\$?([0-9][0-9,]{3,})`, 'i'))?.[1]
      return raw ? Number(String(raw).replace(/[^0-9.]/g, '')) || null : null
    }
    add({
      ...vehicle,
      vin,
      year: Number(field('year')) || null,
      make: field('make'), model: field('model'), trim: field('trim'), engine: field('engine'),
      stock_number: field('stockNumber') || field('stock'), status: field('status'),
      price: price('price') || price('internetPrice') || price('salePrice'),
      msrp: price('msrp'),
      vehicle_url: field('link') || field('url'),
      platform,
    })
  }
  return [...byVin.values()].sort((a,b) => a.vin.localeCompare(b.vin))
}
async function getOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!requestUrl || !requestToken) throw new Error('GitHub OIDC environment is unavailable.')
  const join = requestUrl.includes('?') ? '&' : '?'
  const response = await fetch(`${requestUrl}${join}audience=scrape-it-supabase`, { headers: { Authorization: `Bearer ${requestToken}` } })
  const data = await response.json()
  if (!response.ok || !data.value) throw new Error(`OIDC token request failed: ${response.status}`)
  return data.value
}
async function getDealerState() {
  const response = await fetch(STATE_URL, { method:'POST', headers:{ apikey:PUBLISHABLE_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({operation:'state'}) })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error || `State HTTP ${response.status}`)
  return data
}
async function autoExpand(page) {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(550)
    const clicked = await page.evaluate(() => {
      const labels = /^(load more|show more|view more|more vehicles|see more)$/i
      const el = [...document.querySelectorAll('button,a')].find((x) => labels.test((x.textContent || '').trim()) && !x.disabled)
      if (el) { el.click(); return true }
      return false
    }).catch(() => false)
    if (!clicked && i > 3) break
  }
}
async function capturePage(page, url) {
  await page.goto(url, { waitUntil:'domcontentloaded', timeout:45000 })
  await sleep(1200)
  await autoExpand(page)
  return page.evaluate(() => ({ html: document.documentElement.outerHTML, text: document.body?.innerText || '', url: location.href, title: document.title }))
}
function nextUrlFromHtml(html, current) {
  const match = html.match(/<link[^>]+rel=[\"']next[\"'][^>]+href=[\"']([^\"']+)[\"']/i)
    || html.match(/<link[^>]+href=[\"']([^\"']+)[\"'][^>]+rel=[\"']next[\"']/i)
    || html.match(/<a[^>]+(?:rel=[\"']next[\"']|aria-label=[\"'](?:next|next page)[\"'])[^>]+href=[\"']([^\"']+)[\"']/i)
  if (!match?.[1]) return null
  try { const u = new URL(match[1], current).toString(); return sameHost(u, current) ? u : null } catch { return null }
}
async function scanCandidate(page, candidate, dealerWebsite) {
  const pages = [], seen = new Set(), all = new Map()
  let reportedTotal = null, platform = 'GENERIC_BROWSER', current = candidate, exhausted = false
  for (let i = 0; i < MAX_PAGES; i++) {
    if (seen.has(current)) { exhausted = true; break }
    seen.add(current)
    let captured
    try { captured = await capturePage(page, current) } catch (error) { if (!pages.length) throw error; break }
    if (!sameHost(captured.url, dealerWebsite)) throw new Error(`Redirected off dealer host: ${captured.url}`)
    platform = detectPlatform(captured.html, captured.url)
    const combined = `${captured.text}\n${captured.html}`
    const total = extractReportedTotal(combined)
    if (total != null) reportedTotal = reportedTotal == null ? total : Math.max(reportedTotal, total)
    for (const vehicle of extractVehicles(combined, platform)) all.set(vehicle.vin, { ...(all.get(vehicle.vin) || {}), ...vehicle })
    pages.push({ url:captured.url, title:captured.title, vin_count:extractVins(combined).length })
    const next = nextUrlFromHtml(captured.html, captured.url)
    if (!next) { exhausted = true; break }
    current = next
  }
  const vehicles = [...all.values()].sort((a,b) => a.vin.localeCompare(b.vin))
  let coverageStatus = 'INCOMPLETE', reason = 'Browser inventory was observed, but exhaustive new-inventory coverage was not proven.'
  if (platform === 'DEALERON' && exhausted && pages.length > 0) {
    coverageStatus = 'COMPLETE'; reason = `DealerOn pagination exhausted after ${pages.length} browser page(s).`
  } else if (reportedTotal != null && vehicles.length === reportedTotal && exhausted) {
    coverageStatus = 'COMPLETE'; reason = `Browser VIN count ${vehicles.length} reconciled exactly to reported total ${reportedTotal}.`
  } else if (reportedTotal != null) {
    reason = `Observed ${vehicles.length} validated VINs but platform reports ${reportedTotal}; refusing COMPLETE.`
  }
  return { source_url:candidate, final_url:pages[0]?.url || candidate, platform, pages_scanned:pages.length, pagination_exhausted:exhausted, reported_total:reportedTotal, coverage_status:coverageStatus, completeness_reason:reason, vehicles, page_evidence:pages }
}
async function scanDealer(browser, dealer) {
  const page = await browser.newPage()
  await page.setViewport({ width:1440, height:1100 })
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36')
  page.setDefaultNavigationTimeout(45000)
  const base = new URL(dealer.website)
  const candidates = [
    new URL('/llm/inventory/?type=new', base).toString(),
    new URL('/searchnew.aspx', base).toString(),
    new URL('/new-inventory/index.htm', base).toString(),
    new URL('/new-vehicles/', base).toString(),
    new URL('/new-inventory/', base).toString(),
    new URL('/inventory/new', base).toString(),
  ]
  let best = null
  for (const candidate of candidates) {
    try {
      const result = await scanCandidate(page, candidate, dealer.website)
      if (!best || result.vehicles.length > best.vehicles.length || result.coverage_status === 'COMPLETE') best = result
      if (result.coverage_status === 'COMPLETE') break
    } catch (error) {
      console.log(`[${dealer.dealer_id}] candidate failed ${candidate}: ${error.message}`)
    }
  }
  await page.close()
  if (!best) return { dealer_id:dealer.dealer_id, dealer_name:dealer.dealer_name, status:'ERROR', error:'No browser inventory candidate produced usable evidence.' }
  return { dealer_id:dealer.dealer_id, dealer_name:dealer.dealer_name, dealer_website:dealer.website, status:best.coverage_status, ...best }
}
async function ingest(token, result) {
  const response = await fetch(INGEST_URL, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify(result) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) throw new Error(data.error || `Ingest HTTP ${response.status}`)
  return data
}

const chromeCandidates = ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser']
const executablePath = chromeCandidates.find((p) => { try { return process.getBuiltinModule('fs').existsSync(p) } catch { return false } })
if (!executablePath) throw new Error('No system Chrome/Chromium found on the GitHub runner.')
const state = await getDealerState()
const requested = process.env.DEALER_IDS ? new Set(process.env.DEALER_IDS.split(',').map((x)=>x.trim()).filter(Boolean)) : null
const dealers = state.dealers.filter((d) => requested ? requested.has(d.dealer_id) : d.latest_run?.status !== 'COMPLETE')
console.log(`Browser worker scanning ${dealers.length} dealer(s).`)
const browser = await puppeteer.launch({ executablePath, headless:true, args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] })
const token = await getOidcToken()
const summary = []
try {
  for (const dealer of dealers) {
    console.log(`Scanning ${dealer.dealer_id} ${dealer.dealer_name}`)
    let result
    try { result = await scanDealer(browser, dealer) } catch (error) { result = { dealer_id:dealer.dealer_id, dealer_name:dealer.dealer_name, dealer_website:dealer.website, status:'ERROR', error:error.message } }
    if (result.status !== 'ERROR') {
      try { const saved = await ingest(token, result); result.ingest = saved } catch (error) { result.ingest_error = error.message }
    }
    summary.push({ dealer_id:dealer.dealer_id, dealer_name:dealer.dealer_name, status:result.status, vin_count:result.vehicles?.length || 0, reported_total:result.reported_total ?? null, platform:result.platform || null, ingest_error:result.ingest_error || null })
    console.log(summary.at(-1))
    await sleep(900)
  }
} finally { await browser.close() }
console.table(summary)
console.log(JSON.stringify({ summary }, null, 2))
