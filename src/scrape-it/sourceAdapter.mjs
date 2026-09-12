import { normalizeNhtsaPayload } from './domain.mjs';

function makeRawId(sourceId, fetchedAt) {
  return `${sourceId}:${fetchedAt}:${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchNhtsaRecallObservation(source) {
  const fetchedAt = new Date().toISOString();
  const started = performance.now();
  const response = await fetch(source.exact_url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const rawText = await response.text();
  const durationMs = Math.round(performance.now() - started);

  let payload = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = null;
  }

  const rawRecord = {
    raw_id: makeRawId(source.source_id, fetchedAt),
    source_id: source.source_id,
    source_url: source.exact_url,
    fetched_at: fetchedAt,
    http_status: response.status,
    status_text: response.statusText,
    content_type: response.headers.get('content-type'),
    duration_ms: durationMs,
    raw_text: rawText,
    raw_json: payload,
    parse_status: payload ? 'PARSED' : 'PARSE_ERROR',
  };

  if (!response.ok) {
    const error = new Error(`NHTSA fetch failed with HTTP ${response.status}`);
    error.rawRecord = rawRecord;
    throw error;
  }

  if (!payload) {
    const error = new Error('NHTSA returned a non-JSON payload.');
    error.rawRecord = rawRecord;
    throw error;
  }

  return {
    rawRecord,
    observations: normalizeNhtsaPayload(payload, fetchedAt, source.source_id),
  };
}
