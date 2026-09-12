export const SOURCE_TYPES = [
  'DEALER_INVENTORY',
  'DEALER_SPECIALS',
  'OEM_INCENTIVE',
  'OEM_NEWSROOM',
  'SAFETY_RECALL',
  'DEALER_GROUP_NEWS',
  'INDUSTRY_NEWS',
  'MARKET_METRIC',
  'FREIGHT_LOGISTICS',
];

export const SOURCE_STATUSES = [
  'DISCOVERED',
  'VALIDATED',
  'APPROVED',
  'ACTIVE',
  'PAUSED',
  'BROKEN',
  'RETIRED',
];

export const FEEDBACK_OPTIONS = [
  'USEFUL',
  'WRONG',
  'STALE',
  'RESOLVED',
  'ACTED',
  'NOT_RELEVANT',
  'VERIFY_LATER',
];

export const PIPELINE_STAGES = [
  'RECEIVED',
  'FETCHING',
  'FETCHED',
  'PARSED',
  'NORMALIZED',
  'DIFFED',
  'ACTIONED',
];

export function buildSourceRegistryEntry(query) {
  const params = new URLSearchParams({
    make: query.make,
    model: query.model,
    modelYear: String(query.modelYear),
  });

  return {
    source_id: 'nhtsa-recalls-api-v1',
    source_name: 'NHTSA Vehicle Recalls API',
    source_type: 'SAFETY_RECALL',
    domain: 'api.nhtsa.gov',
    exact_url: `https://api.nhtsa.gov/recalls/recallsByVehicle?${params.toString()}`,
    parent_domain: 'nhtsa.gov',
    oem: query.make || 'MULTI',
    geography: 'United States',
    source_tier: 1,
    trust_level: 'AUTHORITATIVE',
    extraction_method: 'PUBLIC_JSON_API',
    expected_fields: [
      'NHTSACampaignNumber',
      'Component',
      'Summary',
      'Consequence',
      'Remedy',
      'ReportReceivedDate',
      'ModelYear',
      'Make',
      'Model',
    ],
    refresh_frequency: 'MANUAL_V1',
    requires_browser: false,
    requires_login: false,
    robots_or_access_status: 'DOCUMENTED_PUBLIC_API_NON_BULK_MODEL_QUERY',
    last_attempt_at: null,
    last_success_at: null,
    last_change_at: null,
    failure_count: 0,
    duplicate_of: null,
    status: 'ACTIVE',
    notes: 'V1 uses make/model/model-year recall lookup only; it does not bulk-query VINs.',
    provenance: 'NHTSA Datasets and APIs / Vehicle Recalls API',
  };
}

export function normalizeNhtsaRecall(raw, observedAt, sourceId) {
  return {
    observation_id: `${sourceId}:${raw.NHTSACampaignNumber || 'unknown'}:${observedAt}`,
    campaign_number: raw.NHTSACampaignNumber || null,
    manufacturer: raw.Manufacturer || null,
    make: raw.Make || null,
    model: raw.Model || null,
    model_year: raw.ModelYear ? Number(raw.ModelYear) : null,
    component: raw.Component || null,
    summary: raw.Summary || null,
    consequence: raw.Consequence || null,
    remedy: raw.Remedy || null,
    report_received_date_raw: raw.ReportReceivedDate || null,
    park_it: Boolean(raw.parkIt),
    park_outside: Boolean(raw.parkOutSide),
    over_the_air_update: Boolean(raw.overTheAirUpdate),
    observed_at: observedAt,
    source_id: sourceId,
    evidence_class: 'STRUCTURED_DATA',
    confidence: 0.98,
    raw_excerpt: [raw.Component, raw.Summary].filter(Boolean).join(' — ').slice(0, 700),
  };
}

export function normalizeNhtsaPayload(payload, observedAt, sourceId) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return rows.map((row) => normalizeNhtsaRecall(row, observedAt, sourceId));
}

function campaignMap(observations = []) {
  return new Map(observations.filter((item) => item.campaign_number).map((item) => [item.campaign_number, item]));
}

export function detectRecallChange(previous = [], current = []) {
  const prev = campaignMap(previous);
  const next = campaignMap(current);
  const added = [...next.keys()].filter((id) => !prev.has(id));
  const removed = [...prev.keys()].filter((id) => !next.has(id));
  const changed = [...next.keys()].filter((id) => {
    if (!prev.has(id)) return false;
    const before = prev.get(id);
    const after = next.get(id);
    return ['component', 'summary', 'consequence', 'remedy', 'park_it', 'park_outside']
      .some((field) => before[field] !== after[field]);
  });

  if (!previous.length) {
    return {
      change_type: 'BASELINE_CAPTURED',
      material: false,
      added,
      removed,
      changed,
      summary: `Captured live baseline with ${current.length} NHTSA recall campaign${current.length === 1 ? '' : 's'}.`,
    };
  }

  if (added.length || removed.length || changed.length) {
    return {
      change_type: 'RECALL_CHANGED',
      material: true,
      added,
      removed,
      changed,
      summary: `${added.length} added, ${removed.length} removed, ${changed.length} materially revised recall campaign${added.length + removed.length + changed.length === 1 ? '' : 's'}.`,
    };
  }

  return {
    change_type: 'NO_MATERIAL_CHANGE',
    material: false,
    added,
    removed,
    changed,
    summary: `No material recall change detected across ${current.length} campaign${current.length === 1 ? '' : 's'}.`,
  };
}

export function buildEvidenceRecord({ rawRecord, observations, source, query }) {
  return {
    evidence_id: `ev:${rawRecord.raw_id}`,
    field: 'recall_campaign_set',
    value: observations.map((item) => item.campaign_number).filter(Boolean),
    evidence_class: 'STRUCTURED_DATA',
    source_id: source.source_id,
    source_url: rawRecord.source_url,
    observed_at: rawRecord.fetched_at,
    confidence: observations.length ? 0.98 : 0.92,
    raw_excerpt: `${rawRecord.http_status} ${rawRecord.status_text || 'OK'} · NHTSA make/model/model-year query for ${query.modelYear} ${query.make} ${query.model}`,
    supersedes: null,
    contradicts: [],
    raw_id: rawRecord.raw_id,
  };
}

export function recommendAction({ observations, change, evidenceId, query }) {
  const severe = observations.filter((item) => item.park_it || item.park_outside);
  const hasCampaigns = observations.length > 0;
  const changedNow = change.change_type === 'RECALL_CHANGED';

  if (severe.length) {
    return {
      action_id: `action:${Date.now()}:safety`,
      bucket: 'NOW',
      action_type: 'VERIFY_SAFETY_STATUS',
      dealer: null,
      vehicle_configuration: `${query.modelYear} ${query.make} ${query.model}`,
      urgency: 'IMMEDIATE',
      opportunity_score: null,
      confidence: 'HIGH_EVIDENCE_MEDIUM_ACTION',
      why_now: `${severe.length} NHTSA campaign${severe.length === 1 ? '' : 's'} include park-it or park-outside flags for this model-level query.`,
      recommended_next_step: 'Verify VIN-level applicability and remedy status before representing affected inventory as saleable.',
      suggested_call_question: 'Do any units in this configuration match the active NHTSA campaign, and has the required remedy been completed?',
      evidence_ids: [evidenceId],
      uncertainties: ['NHTSA make/model/year results do not establish VIN-level applicability for a specific dealer unit.', 'Dealer inventory is not connected in this slice.'],
      expires_at: null,
      feedback_status: null,
    };
  }

  if (hasCampaigns) {
    return {
      action_id: `action:${Date.now()}:verify`,
      bucket: changedNow ? 'VERIFY' : 'WATCH',
      action_type: 'VERIFY_SAFETY_STATUS',
      dealer: null,
      vehicle_configuration: `${query.modelYear} ${query.make} ${query.model}`,
      urgency: changedNow ? 'SAME_DAY' : 'MONITOR',
      opportunity_score: null,
      confidence: 'HIGH_EVIDENCE_MEDIUM_ACTION',
      why_now: changedNow
        ? `The model-level NHTSA recall set changed: ${change.summary}`
        : `${observations.length} model-level NHTSA recall campaign${observations.length === 1 ? '' : 's'} are present in the current observation.`,
      recommended_next_step: 'Before using this as dealer-specific intelligence, match the affected model to observed dealer inventory and verify VIN-level applicability.',
      suggested_call_question: 'Are any of your current units in this configuration affected by an open campaign, and is the remedy available or completed?',
      evidence_ids: [evidenceId],
      uncertainties: ['No dealer inventory linkage exists yet.', 'VIN-level applicability is unknown; model-level recall evidence does not prove a specific VIN is affected or unrepaired.'],
      expires_at: null,
      feedback_status: null,
    };
  }

  return {
    action_id: `action:${Date.now()}:watch`,
    bucket: 'WATCH',
    action_type: 'WATCH_VEHICLE',
    dealer: null,
    vehicle_configuration: `${query.modelYear} ${query.make} ${query.model}`,
    urgency: 'MONITOR',
    opportunity_score: null,
    confidence: 'MEDIUM',
    why_now: 'The live NHTSA model-level query returned no campaigns in this observation.',
    recommended_next_step: 'Retain the baseline and recheck later; do not treat a zero-result model query as proof that every VIN is recall-free.',
    suggested_call_question: 'If this configuration becomes relevant to a deal, can we verify the exact VIN safety status before moving forward?',
    evidence_ids: [evidenceId],
    uncertainties: ['Model naming can affect API results.', 'No VIN-level lookup was performed.'],
    expires_at: null,
    feedback_status: null,
  };
}

export function buildPipelineResult({ rawRecord, observations, previous, source, query }) {
  const change = detectRecallChange(previous, observations);
  const evidence = buildEvidenceRecord({ rawRecord, observations, source, query });
  const action = recommendAction({ observations, change, evidenceId: evidence.evidence_id, query });
  return { change, evidence, action };
}
