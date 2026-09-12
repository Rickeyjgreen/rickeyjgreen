import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPipelineResult,
  buildSourceRegistryEntry,
  detectRecallChange,
  normalizeNhtsaPayload,
} from '../src/scrape-it/domain.mjs';

const query = { modelYear: 2025, make: 'Chevrolet', model: 'Silverado 1500' };
const source = buildSourceRegistryEntry(query);
const payload = {
  results: [{
    Manufacturer: 'Example Manufacturer',
    NHTSACampaignNumber: '25V000001',
    ReportReceivedDate: '01/01/2025',
    Component: 'ELECTRICAL SYSTEM',
    Summary: 'Example source payload for deterministic parser testing.',
    Consequence: 'Example consequence.',
    Remedy: 'Example remedy.',
    ModelYear: '2025',
    Make: 'CHEVROLET',
    Model: 'SILVERADO 1500',
    parkIt: false,
    parkOutSide: false,
  }],
};

test('source registry entry is authoritative and active', () => {
  assert.equal(source.source_tier, 1);
  assert.equal(source.status, 'ACTIVE');
  assert.equal(source.domain, 'api.nhtsa.gov');
  assert.match(source.exact_url, /recallsByVehicle/);
});

test('normalizer preserves source semantics and evidence class', () => {
  const rows = normalizeNhtsaPayload(payload, '2026-09-12T20:00:00.000Z', source.source_id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].campaign_number, '25V000001');
  assert.equal(rows[0].evidence_class, 'STRUCTURED_DATA');
  assert.equal(rows[0].model_year, 2025);
});

test('first observation creates baseline, not a fake market-change claim', () => {
  const current = normalizeNhtsaPayload(payload, '2026-09-12T20:00:00.000Z', source.source_id);
  const change = detectRecallChange([], current);
  assert.equal(change.change_type, 'BASELINE_CAPTURED');
  assert.equal(change.material, false);
});

test('campaign delta is detected without calling it a confirmed VIN event', () => {
  const before = normalizeNhtsaPayload(payload, '2026-09-12T20:00:00.000Z', source.source_id);
  const afterPayload = { results: [...payload.results, { ...payload.results[0], NHTSACampaignNumber: '25V000002' }] };
  const after = normalizeNhtsaPayload(afterPayload, '2026-09-13T20:00:00.000Z', source.source_id);
  const change = detectRecallChange(before, after);
  assert.equal(change.change_type, 'RECALL_CHANGED');
  assert.deepEqual(change.added, ['25V000002']);
});

test('action explicitly preserves VIN and dealer uncertainty', () => {
  const observations = normalizeNhtsaPayload(payload, '2026-09-12T20:00:00.000Z', source.source_id);
  const rawRecord = {
    raw_id: 'raw:1',
    source_url: source.exact_url,
    fetched_at: '2026-09-12T20:00:00.000Z',
    http_status: 200,
    status_text: 'OK',
  };
  const result = buildPipelineResult({ rawRecord, observations, previous: [], source, query });
  assert.equal(result.action.action_type, 'VERIFY_SAFETY_STATUS');
  assert.match(result.action.uncertainties.join(' '), /VIN-level/i);
  assert.match(result.action.uncertainties.join(' '), /Dealer inventory/i);
  assert.deepEqual(result.action.evidence_ids, [result.evidence.evidence_id]);
});
