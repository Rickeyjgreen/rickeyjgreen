// Public client configuration only. The publishable key is intentionally safe for browser use;
// all database tables deny anon/auth access and constrained Edge Functions perform approved operations.
const PROJECT_URL = 'https://eyngapizkxsernywdyfv.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const SCRAPE_API_URL = `${PROJECT_URL}/functions/v1/scrape-it-api`
const DEALER_API_URL = `${PROJECT_URL}/functions/v1/dealer-intel-api`

async function callApi(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) throw new Error(data?.error || `Scrape It API failed with HTTP ${response.status}`)
  return data
}

export function loadBackendState(query) {
  return callApi(SCRAPE_API_URL, { operation: 'state', query })
}

export function runApprovedSource(query) {
  return callApi(SCRAPE_API_URL, { operation: 'refresh', query })
}

export function submitFeedback(actionId, feedbackStatus, outcomeNote = '') {
  return callApi(SCRAPE_API_URL, { operation: 'feedback', actionId, feedbackStatus, outcomeNote })
}

export function loadDealerState() {
  return callApi(DEALER_API_URL, { operation: 'state' })
}

export function scanDealerInventory(dealerId) {
  return callApi(DEALER_API_URL, { operation: 'scan', dealerId })
}

export function scanDealerBatch(dealerIds) {
  return callApi(DEALER_API_URL, { operation: 'scan_batch', dealerIds })
}
