import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const SOURCE_ID = 'nhtsa-recalls-api-v1'
const PARSER_NAME = 'nhtsa-recall-normalizer'
const PARSER_VERSION = '1.1.0'
const SCHEMA_VERSION = 'scrape-it-v1'
const FEEDBACK = new Set(['USEFUL','WRONG','STALE','RESOLVED','ACTED','NOT_RELEVANT','VERIFY_LATER'])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function readKeyMap(name: string): Record<string, string> {
  try { return JSON.parse(Deno.env.get(name) || '{}') } catch { return {} }
}

function authorized(req: Request) {
  const supplied = req.headers.get('apikey') || ''
  const keys = Object.values(readKeyMap('SUPABASE_PUBLISHABLE_KEYS'))
  return supplied.length > 0 && keys.includes(supplied)
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const secret = readKeyMap('SUPABASE_SECRET_KEYS').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !secret) throw new Error('Supabase server credentials are unavailable.')
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
}

function normalizeText(value: unknown, max = 80) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!text || text.length > max || !/^[A-Za-z0-9 .&()'\-/]+$/.test(text)) throw new Error('Invalid vehicle query value.')
  return text
}

function normalizeQuery(input: any) {
  const modelYear = Number(input?.modelYear)
  if (!Number.isInteger(modelYear) || modelYear < 1990 || modelYear > 2035) throw new Error('Model year is outside the allowed range.')
  return { modelYear, make: normalizeText(input?.make, 50), model: normalizeText(input?.model, 80) }
}

function queryKey(query: {modelYear:number, make:string, model:string}) {
  return [query.modelYear, query.make, query.model].map((v) => String(v).trim().toUpperCase()).join('|')
}

function sourceUrl(query: {modelYear:number, make:string, model:string}) {
  const params = new URLSearchParams({ make: query.make, model: query.model, modelYear: String(query.modelYear) })
  return `https://api.nhtsa.gov/recalls/recallsByVehicle?${params.toString()}`
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function normalizeRecall(raw: any, observedAt: string) {
  return {
    campaign_number: raw?.NHTSACampaignNumber || null,
    manufacturer: raw?.Manufacturer || null,
    make: raw?.Make || null,
    model: raw?.Model || null,
    model_year: raw?.ModelYear ? Number(raw.ModelYear) : null,
    component: raw?.Component || null,
    summary: raw?.Summary || null,
    consequence: raw?.Consequence || null,
    remedy: raw?.Remedy || null,
    report_received_date_raw: raw?.ReportReceivedDate || null,
    park_it: Boolean(raw?.parkIt),
    park_outside: Boolean(raw?.parkOutSide),
    over_the_air_update: Boolean(raw?.overTheAirUpdate),
    observed_at: observedAt,
    source_id: SOURCE_ID,
    evidence_class: 'STRUCTURED_DATA',
    confidence: 0.98,
    raw_excerpt: [raw?.Component, raw?.Summary].filter(Boolean).join(' — ').slice(0, 700),
  }
}

function campaignMap(rows: any[] = []) {
  return new Map(rows.filter((x) => x?.campaign_number).map((x) => [x.campaign_number, x]))
}

function detectChange(previous: any[], current: any[]) {
  const prev = campaignMap(previous)
  const next = campaignMap(current)
  const added = [...next.keys()].filter((id) => !prev.has(id))
  const removed = [...prev.keys()].filter((id) => !next.has(id))
  const changed = [...next.keys()].filter((id) => {
    if (!prev.has(id)) return false
    const a: any = prev.get(id), b: any = next.get(id)
    return ['component','summary','consequence','remedy','park_it','park_outside'].some((field) => a?.[field] !== b?.[field])
  })
  if (!previous.length) return { signal_type:'BASELINE_CAPTURED', material:false, added, removed, changed, summary:`Captured live baseline with ${current.length} NHTSA recall campaign${current.length === 1 ? '' : 's'}.` }
  if (added.length || removed.length || changed.length) return { signal_type:'RECALL_CHANGED', material:true, added, removed, changed, summary:`${added.length} added, ${removed.length} removed, ${changed.length} materially revised recall campaign${added.length + removed.length + changed.length === 1 ? '' : 's'}.` }
  return { signal_type:'NO_MATERIAL_CHANGE', material:false, added, removed, changed, summary:`No material recall change detected across ${current.length} campaign${current.length === 1 ? '' : 's'}.` }
}

function recommendAction(observations: any[], change: any, query: any) {
  const severe = observations.filter((x) => x.park_it || x.park_outside)
  const vehicle = `${query.modelYear} ${query.make} ${query.model}`
  if (severe.length) return {
    bucket:'NOW', action_type:'VERIFY_SAFETY_STATUS', vehicle_configuration:vehicle, urgency:'IMMEDIATE', opportunity_score:null,
    confidence:'HIGH_EVIDENCE_MEDIUM_ACTION',
    why_now:`${severe.length} NHTSA campaign${severe.length === 1 ? '' : 's'} include park-it or park-outside flags for this model-level query.`,
    recommended_next_step:'Verify VIN-level applicability and remedy status before representing affected inventory as saleable.',
    suggested_call_question:'Do any units in this configuration match the active NHTSA campaign, and has the required remedy been completed?',
    uncertainties:['NHTSA make/model/year results do not establish VIN-level applicability for a specific dealer unit.','Dealer inventory is not connected in this slice.'], expires_at:null,
  }
  if (observations.length) return {
    bucket:change.signal_type === 'RECALL_CHANGED' ? 'VERIFY' : 'WATCH', action_type:'VERIFY_SAFETY_STATUS', vehicle_configuration:vehicle,
    urgency:change.signal_type === 'RECALL_CHANGED' ? 'SAME_DAY' : 'MONITOR', opportunity_score:null, confidence:'HIGH_EVIDENCE_MEDIUM_ACTION',
    why_now:change.signal_type === 'RECALL_CHANGED' ? `The model-level NHTSA recall set changed: ${change.summary}` : `${observations.length} model-level NHTSA recall campaign${observations.length === 1 ? '' : 's'} are present in the current observation.`,
    recommended_next_step:'Before using this as dealer-specific intelligence, match the affected model to observed dealer inventory and verify VIN-level applicability.',
    suggested_call_question:'Are any of your current units in this configuration affected by an open campaign, and is the remedy available or completed?',
    uncertainties:['No dealer inventory linkage exists yet.','VIN-level applicability is unknown; model-level recall evidence does not prove a specific VIN is affected or unrepaired.'], expires_at:null,
  }
  return {
    bucket:'WATCH', action_type:'WATCH_VEHICLE', vehicle_configuration:vehicle, urgency:'MONITOR', opportunity_score:null, confidence:'MEDIUM',
    why_now:'The live NHTSA model-level query returned no campaigns in this observation.',
    recommended_next_step:'Retain the baseline and recheck later; do not treat a zero-result model query as proof that every VIN is recall-free.',
    suggested_call_question:'If this configuration becomes relevant to a deal, can we verify the exact VIN safety status before moving forward?',
    uncertainties:['Model naming can affect API results.','No VIN-level lookup was performed.'], expires_at:null,
  }
}

async function loadState(db: any, inputQuery?: any) {
  const query = inputQuery ? normalizeQuery(inputQuery) : { modelYear: 2025, make: 'Chevrolet', model: 'Silverado 1500' }
  const key = queryKey(query)
  const [sourceRes, rawCount, changeCount, feedbackCount, errorRuns, latestNormalized] = await Promise.all([
    db.from('source_registry').select('*').eq('source_id', SOURCE_ID).single(),
    db.from('raw_observations').select('raw_id', { count:'exact', head:true }),
    db.from('change_events').select('change_event_id', { count:'exact', head:true }),
    db.from('action_feedback').select('feedback_id', { count:'exact', head:true }),
    db.from('ingestion_runs').select('run_id,status,error_code,error_message,started_at').eq('status','ERROR').order('started_at',{ascending:false}).limit(6),
    db.from('normalized_runs').select('*').eq('query_key', key).order('observed_at',{ascending:false}).limit(1).maybeSingle(),
  ])
  if (sourceRes.error) throw sourceRes.error
  const state: any = { query, source:sourceRes.data, stats:{ raw_records:rawCount.count || 0, change_events:changeCount.count || 0, feedback_events:feedbackCount.count || 0 }, failures:errorRuns.data || [], latest:null }
  if (!latestNormalized.data) return state
  const n = latestNormalized.data
  const [raw, change, evidence, action, observations] = await Promise.all([
    db.from('raw_observations').select('*').eq('raw_id', n.raw_id).single(),
    db.from('change_events').select('*').eq('normalized_run_id', n.normalized_run_id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('evidence_records').select('*').eq('normalized_run_id', n.normalized_run_id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('recommended_actions').select('*').eq('run_id', n.run_id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('recall_observations').select('*').eq('normalized_run_id', n.normalized_run_id).order('campaign_number',{ascending:true}),
  ])
  const actionRow = action.data
  let latestFeedback = null
  if (actionRow?.action_id) {
    const fb = await db.from('action_feedback').select('*').eq('action_id', actionRow.action_id).order('created_at',{ascending:false}).limit(1).maybeSingle()
    latestFeedback = fb.data || null
  }
  state.latest = { normalized:n, raw:raw.data, change:change.data, evidence:evidence.data, action:actionRow, observations:observations.data || [], latest_feedback:latestFeedback }
  return state
}

async function refresh(db: any, inputQuery: any) {
  const query = normalizeQuery(inputQuery)
  const key = queryKey(query)
  const url = sourceUrl(query)
  const startedAt = new Date().toISOString()
  const sourceRes = await db.from('source_registry').select('*').eq('source_id', SOURCE_ID).single()
  if (sourceRes.error || !sourceRes.data || sourceRes.data.status !== 'ACTIVE') throw new Error('Approved NHTSA source is not active.')
  const runInsert = await db.from('ingestion_runs').insert({ source_id:SOURCE_ID, query_key:key, status:'FETCHING', started_at:startedAt, metadata:{ query } }).select().single()
  if (runInsert.error) throw runInsert.error
  const runId = runInsert.data.run_id
  await db.from('source_registry').update({ last_attempt_at:startedAt, updated_at:startedAt }).eq('source_id', SOURCE_ID)
  try {
    const previous = await db.from('normalized_runs').select('normalized_run_id,observations').eq('query_key', key).order('observed_at',{ascending:false}).limit(1).maybeSingle()
    const fetchStarted = performance.now()
    const response = await fetch(url, { headers:{ Accept:'application/json', 'User-Agent':'Scrape-It/1.0 evidence-aware market intelligence' } })
    const rawText = await response.text()
    const fetchedAt = new Date().toISOString()
    let payload: any = null
    try { payload = JSON.parse(rawText) } catch { payload = null }
    const bodyHash = await sha256(rawText)
    const rawInsert = await db.from('raw_observations').insert({
      run_id:runId, source_id:SOURCE_ID, source_url:url, fetched_at:fetchedAt, http_status:response.status,
      status_text:response.statusText, content_type:response.headers.get('content-type'), duration_ms:Math.round(performance.now()-fetchStarted),
      body_hash:bodyHash, raw_text:rawText, raw_payload:payload, parse_status:payload ? 'PARSED':'PARSE_ERROR'
    }).select().single()
    if (rawInsert.error) throw rawInsert.error
    if (!response.ok) throw new Error(`NHTSA fetch failed with HTTP ${response.status}`)
    if (!payload || !Array.isArray(payload.results)) throw new Error('NHTSA returned an unexpected payload.')
    await db.from('ingestion_runs').update({ status:'FETCHED' }).eq('run_id', runId)
    const observations = payload.results.map((row:any) => normalizeRecall(row, fetchedAt))
    const normalizedInsert = await db.from('normalized_runs').insert({
      run_id:runId, raw_id:rawInsert.data.raw_id, source_id:SOURCE_ID, query_key:key, observed_at:fetchedAt,
      observations, observation_count:observations.length, parser_name:PARSER_NAME, parser_version:PARSER_VERSION,
      schema_version:SCHEMA_VERSION, evidence_class:'STRUCTURED_DATA', confidence:observations.length ? 0.98 : 0.92
    }).select().single()
    if (normalizedInsert.error) throw normalizedInsert.error
    if (observations.length) {
      const recallRows = observations.map((o:any) => ({ ...o, normalized_run_id:normalizedInsert.data.normalized_run_id }))
      const recallsInsert = await db.from('recall_observations').insert(recallRows)
      if (recallsInsert.error) throw recallsInsert.error
    }
    await db.from('ingestion_runs').update({ status:'NORMALIZED' }).eq('run_id', runId)
    const change = detectChange(previous.data?.observations || [], observations)
    const changeInsert = await db.from('change_events').insert({
      run_id:runId, source_id:SOURCE_ID, normalized_run_id:normalizedInsert.data.normalized_run_id,
      previous_normalized_run_id:previous.data?.normalized_run_id || null, signal_type:change.signal_type, material:change.material,
      occurred_at:fetchedAt, summary:change.summary, added:change.added, removed:change.removed, changed:change.changed,
      confidence:observations.length ? 0.98 : 0.92
    }).select().single()
    if (changeInsert.error) throw changeInsert.error
    await db.from('ingestion_runs').update({ status:'DIFFED' }).eq('run_id', runId)
    const evidenceInsert = await db.from('evidence_records').insert({
      run_id:runId, source_id:SOURCE_ID, raw_id:rawInsert.data.raw_id, normalized_run_id:normalizedInsert.data.normalized_run_id,
      change_event_id:changeInsert.data.change_event_id, field:'recall_campaign_set', value:observations.map((x:any)=>x.campaign_number).filter(Boolean),
      evidence_class:'STRUCTURED_DATA', source_url:url, observed_at:fetchedAt, confidence:observations.length ? 0.98 : 0.92,
      raw_excerpt:`${response.status} ${response.statusText || 'OK'} · NHTSA make/model/model-year query for ${query.modelYear} ${query.make} ${query.model}`
    }).select().single()
    if (evidenceInsert.error) throw evidenceInsert.error
    const action = recommendAction(observations, change, query)
    const actionInsert = await db.from('recommended_actions').insert({
      run_id:runId, change_event_id:changeInsert.data.change_event_id, source_id:SOURCE_ID, bucket:action.bucket,
      action_type:action.action_type, dealer_id:null, vehicle_configuration:action.vehicle_configuration, urgency:action.urgency,
      opportunity_score:action.opportunity_score, confidence:action.confidence, why_now:action.why_now,
      recommended_next_step:action.recommended_next_step, suggested_call_question:action.suggested_call_question,
      evidence_ids:[evidenceInsert.data.evidence_id], uncertainties:action.uncertainties, expires_at:action.expires_at
    }).select().single()
    if (actionInsert.error) throw actionInsert.error
    const finishedAt = new Date().toISOString()
    await Promise.all([
      db.from('ingestion_runs').update({ status:'COMPLETE', finished_at:finishedAt }).eq('run_id', runId),
      db.from('source_registry').update({ last_success_at:finishedAt, last_change_at:change.material ? finishedAt : sourceRes.data.last_change_at, failure_count:0, updated_at:finishedAt }).eq('source_id', SOURCE_ID),
    ])
    return await loadState(db, query)
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : String(error)
    await Promise.all([
      db.from('ingestion_runs').update({ status:'ERROR', finished_at:finishedAt, error_code:'PIPELINE_ERROR', error_message:message }).eq('run_id', runId),
      db.from('source_registry').update({ failure_count:(sourceRes.data.failure_count || 0)+1, updated_at:finishedAt }).eq('source_id', SOURCE_ID),
    ])
    throw error
  }
}

async function feedback(db: any, input: any) {
  const actionId = String(input?.actionId || '')
  const feedbackStatus = String(input?.feedbackStatus || '')
  const outcomeNote = String(input?.outcomeNote || '').trim().slice(0, 2000)
  if (!/^[0-9a-f-]{36}$/i.test(actionId) || !FEEDBACK.has(feedbackStatus)) throw new Error('Invalid feedback payload.')
  const action = await db.from('recommended_actions').select('action_id').eq('action_id', actionId).maybeSingle()
  if (action.error || !action.data) throw new Error('Action was not found.')
  const inserted = await db.from('action_feedback').insert({ action_id:actionId, feedback_status:feedbackStatus, outcome_note:outcomeNote || null }).select().single()
  if (inserted.error) throw inserted.error
  return inserted.data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers:corsHeaders })
  if (req.method !== 'POST') return json({ error:'Method not allowed.' }, 405)
  if (!authorized(req)) return json({ error:'Unauthorized application key.' }, 401)
  try {
    const body = await req.json().catch(() => ({}))
    const operation = body?.operation || 'state'
    const db = adminClient()
    if (operation === 'state') return json(await loadState(db, body.query))
    if (operation === 'refresh') return json(await refresh(db, body.query))
    if (operation === 'feedback') return json({ feedback:await feedback(db, body) })
    return json({ error:'Unsupported operation.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error:message }, 400)
  }
})