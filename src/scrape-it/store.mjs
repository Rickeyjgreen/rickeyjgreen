const KEY = 'scrape-it-v1-store';

function emptyState() {
  return {
    raw_records: [],
    normalized_runs: [],
    change_events: [],
    evidence_records: [],
    recommended_actions: [],
    feedback_events: [],
    failures: [],
  };
}

export function loadStore() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

function save(state) {
  window.localStorage.setItem(KEY, JSON.stringify(state));
  return state;
}

export function appendRaw(rawRecord) {
  const state = loadStore();
  state.raw_records.push(rawRecord);
  return save(state);
}

export function appendSuccessfulRun({ queryKey, observations, change, evidence, action }) {
  const state = loadStore();
  state.normalized_runs.push({
    run_id: `run:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    query_key: queryKey,
    observed_at: observations[0]?.observed_at || evidence.observed_at,
    observations,
  });
  state.change_events.push({ ...change, event_id: `change:${Date.now()}`, observed_at: evidence.observed_at, query_key: queryKey });
  state.evidence_records.push(evidence);
  state.recommended_actions.push(action);
  return save(state);
}

export function appendFailure(failure) {
  const state = loadStore();
  state.failures.push({ ...failure, failure_id: `failure:${Date.now()}` });
  return save(state);
}

export function appendFeedback(actionId, feedbackType, note = '') {
  const state = loadStore();
  const event = {
    feedback_id: `feedback:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    action_id: actionId,
    feedback_type: feedbackType,
    note,
    created_at: new Date().toISOString(),
  };
  state.feedback_events.push(event);
  return save(state);
}

export function getLatestObservations(queryKey) {
  const state = loadStore();
  for (let index = state.normalized_runs.length - 1; index >= 0; index -= 1) {
    if (state.normalized_runs[index].query_key === queryKey) {
      return state.normalized_runs[index].observations || [];
    }
  }
  return [];
}

export function queryKey(query) {
  return [query.modelYear, query.make, query.model].map((value) => String(value).trim().toUpperCase()).join('|');
}
