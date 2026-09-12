// Public client configuration only. The publishable key is intentionally safe for browser use;
// all database tables deny anon/auth access and the Edge Function constrains allowed operations.
const PROJECT_URL = 'https://eyngapizkxsernywdyfv.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_Iyht5_rKaUOeHBz9sh0xRQ_eX6r8tfc'
const API_URL = `${PROJECT_URL}/functions/v1/scrape-it-api`

async function callApi(payload) {
  const response = await fetch(API_URL, {
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
  return callApi({ operation: 'state', query })
}

export function runApprovedSource(query) {
  return callApi({ operation: 'refresh', query })
}

export function submitFeedback(actionId, feedbackStatus, outcomeNote = '') {
  return callApi({ operation: 'feedback', actionId, feedbackStatus, outcomeNote })
}
