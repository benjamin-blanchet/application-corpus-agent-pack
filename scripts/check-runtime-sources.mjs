#!/usr/bin/env node

// Transport-neutral runtime source preflight.
//
// This program deliberately has no write path. It reads durable source
// contracts, prints a probe plan, or validates a point-in-time observation
// supplied through stdin/a temporary input file. Runtime capability is never
// materialized as global corpus state.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_STATES = new Set([
  'usable',
  'visible_unverified',
  'not_visible',
  'unreachable',
  'permission_denied',
  'mapping_missing',
  'unsafe_to_probe',
]);

export const PROBE_OUTCOMES = new Set(['success', 'failure', 'not_run']);

const SOURCE_LIFECYCLES = new Set(['candidate', 'declared', 'retired', 'not_applicable']);
const SOURCE_REQUIREMENTS = new Set(['required', 'optional']);
const MAPPING_STATES = new Set(['unknown', 'partial', 'known', 'not_applicable']);
const TRANSPORT_METHODS = new Set(['local-filesystem', 'mcp', 'sql', 'api', 'file-export', 'cli', 'manual', 'browser', 'clone']);
const ACCESS_MODES = new Set(['read-only', 'write-with-approval']);
const TRANSPORT_SEMANTICS = new Set(['alternative', 'complementary']);
const TRANSPORT_CONSENT = new Set(['not_required', 'operator_required']);
const SOURCE_FIELDS = new Set([
  'id',
  'name',
  'category',
  'lifecycle',
  'requirement',
  'mapping_state',
  'mapping_refs',
  'transport_semantics',
  'transports',
  'allowed_uses',
  'restrictions',
  'evidence_rules',
  'freshness_max_days',
  'operational_doc',
  'owner',
  'notes',
]);
const TRANSPORT_FIELDS = new Set([
  'id',
  'method',
  'access_mode',
  'required_tools',
  'safe_probe',
  'safe_limit',
  'priority',
  'fallback',
  'consent',
]);
const FORBIDDEN_PERSISTENT_FIELDS = new Set([
  'status',
  'readiness',
  'availability',
  'available',
  'connected',
  'tools_attached_to_agent',
  'server_running',
  'authentication_status',
  'last_checked',
]);

function scalar(value) {
  const v = value.replace(/\s+#.*$/, '').trim();
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const body = v.slice(1, -1).trim();
    return body ? body.split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')) : [];
  }
  return v.replace(/^['"]|['"]$/g, '');
}

function keyValue(trimmed) {
  const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
  return match ? [match[1], scalar(match[2])] : null;
}

export function parseSourceContracts(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').trim();
  if (normalized.startsWith('{')) {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === 'object' ? parsed : { schema_version: null, sources: [] };
  }
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const contract = { schema_version: null, sources: [] };
  let source = null;
  let transport = null;
  let inSources = false;
  let inTransports = false;

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^\s*/)[0].length;
    const trimmed = raw.trim();

    if (indent === 0 && trimmed === 'sources:') {
      inSources = true;
      continue;
    }
    if (indent === 0) {
      const rootKv = keyValue(trimmed);
      if (rootKv) contract[rootKv[0]] = rootKv[1];
      continue;
    }
    if (!inSources) continue;

    if (indent === 2 && trimmed.startsWith('- id:')) {
      source = { id: scalar(trimmed.slice(trimmed.indexOf(':') + 1)), transports: [] };
      contract.sources.push(source);
      transport = null;
      inTransports = false;
      continue;
    }
    if (!source) continue;
    if (indent === 4 && trimmed === 'transports:') {
      inTransports = true;
      transport = null;
      continue;
    }
    if (inTransports && indent === 6 && trimmed.startsWith('- id:')) {
      transport = { id: scalar(trimmed.slice(trimmed.indexOf(':') + 1)) };
      source.transports.push(transport);
      continue;
    }
    const kv = keyValue(trimmed);
    if (!kv) continue;
    if (inTransports && transport && indent === 8) transport[kv[0]] = kv[1];
    else if (indent === 4) {
      inTransports = false;
      transport = null;
      source[kv[0]] = kv[1];
    }
  }
  return contract;
}

export function validateSourceContracts(contract) {
  const errors = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return ['source contract must be an object'];
  for (const field of Object.keys(contract)) {
    if (!['schema_version', 'sources'].includes(field)) errors.push(`unknown durable source-contract field: ${field}`);
  }
  if (contract.schema_version !== 2) errors.push('source contract schema_version must be 2');
  if (!Array.isArray(contract.sources) || contract.sources.length === 0) errors.push('source contract must contain sources');
  const ids = new Set();
  for (const source of contract.sources || []) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push('source entries must be objects');
      continue;
    }
    for (const field of Object.keys(source)) {
      if (!SOURCE_FIELDS.has(field)) errors.push(`${source.id || '<unknown>'}: unknown durable source field ${field}`);
    }
    if (!source.id) errors.push('source id is required');
    else if (ids.has(source.id)) errors.push(`duplicate source id: ${source.id}`);
    else ids.add(source.id);
    for (const field of ['name', 'category', 'lifecycle', 'requirement', 'mapping_state', 'mapping_refs', 'transport_semantics', 'allowed_uses', 'restrictions', 'evidence_rules', 'freshness_max_days', 'operational_doc', 'owner']) {
      if (source[field] === undefined || source[field] === '') errors.push(`${source.id || '<unknown>'}: missing ${field}`);
    }
    if (!SOURCE_LIFECYCLES.has(source.lifecycle)) errors.push(`${source.id}: invalid lifecycle ${source.lifecycle}`);
    if (!SOURCE_REQUIREMENTS.has(source.requirement)) errors.push(`${source.id}: invalid requirement ${source.requirement}`);
    if (!MAPPING_STATES.has(source.mapping_state)) errors.push(`${source.id}: invalid mapping_state ${source.mapping_state}`);
    if (!TRANSPORT_SEMANTICS.has(source.transport_semantics)) errors.push(`${source.id}: invalid transport_semantics ${source.transport_semantics}`);
    if (!Array.isArray(source.mapping_refs)) errors.push(`${source.id}: mapping_refs must be a list`);
    if (source.mapping_state === 'known' && Array.isArray(source.mapping_refs) && source.mapping_refs.length === 0) errors.push(`${source.id}: known mapping_state requires mapping_refs`);
    for (const field of ['allowed_uses', 'restrictions', 'evidence_rules']) {
      if (!Array.isArray(source[field])) errors.push(`${source.id}: ${field} must be a list`);
    }
    if (!Number.isInteger(source.freshness_max_days) || source.freshness_max_days < 0) errors.push(`${source.id}: freshness_max_days must be a non-negative integer`);
    for (const field of FORBIDDEN_PERSISTENT_FIELDS) {
      if (Object.hasOwn(source, field)) errors.push(`${source.id}: transient field ${field} is forbidden in a durable source contract`);
    }
    if (!Array.isArray(source.transports) || source.transports.length === 0) errors.push(`${source.id}: at least one transport is required`);
    const transportIds = new Set();
    const priorities = new Set();
    let primaryCount = 0;
    let fallbackCount = 0;
    for (const transport of source.transports || []) {
      if (!transport || typeof transport !== 'object' || Array.isArray(transport)) {
        errors.push(`${source.id}: transport entries must be objects`);
        continue;
      }
      for (const field of Object.keys(transport)) {
        if (!TRANSPORT_FIELDS.has(field)) errors.push(`${source.id}/${transport.id || '<unknown>'}: unknown durable transport field ${field}`);
      }
      if (!transport.id) errors.push(`${source.id}: transport id is required`);
      else if (transportIds.has(transport.id)) errors.push(`${source.id}: duplicate transport id ${transport.id}`);
      else transportIds.add(transport.id);
      for (const field of ['method', 'access_mode', 'required_tools', 'safe_probe', 'safe_limit', 'priority', 'fallback', 'consent']) {
        if (transport[field] === undefined || transport[field] === '') errors.push(`${source.id}/${transport.id || '<unknown>'}: missing ${field}`);
      }
      if (!TRANSPORT_METHODS.has(transport.method)) errors.push(`${source.id}/${transport.id}: invalid method ${transport.method}`);
      if (!ACCESS_MODES.has(transport.access_mode)) errors.push(`${source.id}/${transport.id}: invalid access_mode ${transport.access_mode}`);
      for (const field of FORBIDDEN_PERSISTENT_FIELDS) {
        if (Object.hasOwn(transport, field)) errors.push(`${source.id}/${transport.id}: transient field ${field} is forbidden in a durable transport contract`);
      }
      if (!Array.isArray(transport.required_tools)) errors.push(`${source.id}/${transport.id}: required_tools must be a list`);
      if (!Number.isInteger(transport.safe_limit) || transport.safe_limit < 1) errors.push(`${source.id}/${transport.id}: safe_limit must be a positive integer`);
      if (!Number.isInteger(transport.priority) || transport.priority < 1) errors.push(`${source.id}/${transport.id}: priority must be a positive integer`);
      else if (priorities.has(transport.priority)) errors.push(`${source.id}: duplicate transport priority ${transport.priority}`);
      else priorities.add(transport.priority);
      if (typeof transport.fallback !== 'boolean') errors.push(`${source.id}/${transport.id}: fallback must be a boolean`);
      else if (transport.fallback) fallbackCount += 1;
      else primaryCount += 1;
      if (!TRANSPORT_CONSENT.has(transport.consent)) errors.push(`${source.id}/${transport.id}: invalid consent ${transport.consent}`);
    }
    if (source.transport_semantics === 'alternative') {
      if (primaryCount !== 1) errors.push(`${source.id}: alternative transports require exactly one primary transport`);
      if ((source.transports || []).length > 1 && fallbackCount < 1) errors.push(`${source.id}: multiple alternative transports require at least one explicit fallback transport`);
    }
    if (source.transport_semantics === 'complementary' && fallbackCount > 0) errors.push(`${source.id}: complementary transports cannot be marked as fallback`);
  }
  return errors;
}

export const COVERAGE_STATUSES = new Set(['not_started', 'inventory_only', 'started', 'partial', 'covered', 'deep', 'blocked', 'not_applicable']);
export const COVERAGE_FRESHNESS = new Set(['unknown', 'fresh', 'stale', 'not_applicable']);
const COVERAGE_FIELDS = new Set([
  'source_id',
  'status',
  'freshness',
  'last_successful_observation_at',
  'last_successful_run',
  'evidence_refs',
  'limitations',
  'blockers',
  'targets',
]);
const TARGET_FIELDS = new Set(['id', 'status', 'evidence_refs']);
const EVIDENCED_COVERAGE_STATUSES = new Set(['inventory_only', 'started', 'partial', 'covered', 'deep']);

export function parseSourceCoverage(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').trim();
  if (normalized.startsWith('{')) {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === 'object' ? parsed : { schema_version: null, coverage: [] };
  }
  const parsed = { schema_version: null, coverage: [] };
  let current = null;
  let inCoverage = false;
  let inTargets = false;
  for (const raw of String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^\s*/)[0].length;
    const line = raw.trim();
    if (indent === 0 && line === 'coverage:') {
      inCoverage = true;
      continue;
    }
    if (indent === 0) {
      const rootKv = keyValue(line);
      if (rootKv) parsed[rootKv[0]] = rootKv[1];
      continue;
    }
    if (!inCoverage) continue;
    if (indent === 2 && line.startsWith('- source_id:')) {
      current = { source_id: scalar(line.slice(line.indexOf(':') + 1)), targets: [] };
      parsed.coverage.push(current);
      inTargets = false;
      continue;
    }
    if (!current) continue;
    if (indent === 4 && line === 'targets:') {
      inTargets = true;
      continue;
    }
    if (inTargets && indent === 6 && line.startsWith('- id:')) {
      current.targets.push({ id: scalar(line.slice(line.indexOf(':') + 1)) });
      continue;
    }
    const kv = keyValue(line);
    if (!kv) continue;
    if (indent === 4) {
      inTargets = false;
      current[kv[0]] = kv[1];
    } else if (inTargets && indent === 8 && current.targets.length) {
      current.targets[current.targets.length - 1][kv[0]] = kv[1];
    }
  }
  return parsed;
}

export function validateSourceCoverage(coverage, contract) {
  const errors = [];
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) return ['source coverage must be an object'];
  for (const field of Object.keys(coverage)) {
    if (!['schema_version', 'coverage'].includes(field)) errors.push(`unknown durable source-coverage field: ${field}`);
  }
  if (coverage.schema_version !== 1) errors.push('source coverage schema_version must be 1');
  if (!Array.isArray(coverage.coverage)) return [...errors, 'source coverage must contain a coverage list'];
  const sourceIds = new Set((contract?.sources || []).map((source) => source.id));
  const seenSources = new Set();
  for (const entry of coverage.coverage) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push('source coverage entries must be objects');
      continue;
    }
    const label = entry.source_id || '<unknown>';
    for (const field of Object.keys(entry)) {
      if (!COVERAGE_FIELDS.has(field)) errors.push(`${label}: unknown durable source-coverage field ${field}`);
    }
    for (const field of COVERAGE_FIELDS) {
      if (!Object.hasOwn(entry, field)) errors.push(`${label}: missing ${field}`);
    }
    if (!entry.source_id) errors.push('source coverage source_id is required');
    else if (seenSources.has(entry.source_id)) errors.push(`duplicate coverage source_id: ${entry.source_id}`);
    else seenSources.add(entry.source_id);
    if (entry.source_id && !sourceIds.has(entry.source_id)) errors.push(`coverage references unknown source: ${entry.source_id}`);
    if (!COVERAGE_STATUSES.has(entry.status)) errors.push(`${label}: invalid coverage status ${entry.status}`);
    if (!COVERAGE_FRESHNESS.has(entry.freshness)) errors.push(`${label}: invalid freshness ${entry.freshness}`);
    for (const field of ['evidence_refs', 'limitations', 'blockers', 'targets']) {
      if (!Array.isArray(entry[field])) errors.push(`${label}: ${field} must be a list`);
    }
    if (entry.last_successful_observation_at !== null && !isTimestamp(entry.last_successful_observation_at)) {
      errors.push(`${label}: last_successful_observation_at must be null or an ISO-8601 timestamp with timezone`);
    }
    if (entry.last_successful_run !== null && (typeof entry.last_successful_run !== 'string' || !entry.last_successful_run.trim())) {
      errors.push(`${label}: last_successful_run must be null or a non-empty string`);
    }
    if (['fresh', 'stale'].includes(entry.freshness) && !isTimestamp(entry.last_successful_observation_at)) {
      errors.push(`${label}: ${entry.freshness} freshness requires a successful observation timestamp`);
    }
    if (EVIDENCED_COVERAGE_STATUSES.has(entry.status)) {
      if (!entry.evidence_refs?.length) errors.push(`${label}: ${entry.status} coverage requires evidence_refs`);
      if (!isTimestamp(entry.last_successful_observation_at)) errors.push(`${label}: ${entry.status} coverage requires a successful observation timestamp`);
      if (typeof entry.last_successful_run !== 'string' || !entry.last_successful_run.trim()) errors.push(`${label}: ${entry.status} coverage requires a successful run reference`);
    }
    const seenTargets = new Set();
    for (const target of entry.targets || []) {
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        errors.push(`${label}: target entries must be objects`);
        continue;
      }
      const targetLabel = `${label}/${target.id || '<unknown>'}`;
      for (const field of Object.keys(target)) {
        if (!TARGET_FIELDS.has(field)) errors.push(`${targetLabel}: unknown target field ${field}`);
      }
      for (const field of TARGET_FIELDS) {
        if (!Object.hasOwn(target, field)) errors.push(`${targetLabel}: missing ${field}`);
      }
      if (!target.id) errors.push(`${label}: target id is required`);
      else if (seenTargets.has(target.id)) errors.push(`${label}: duplicate target id ${target.id}`);
      else seenTargets.add(target.id);
      if (!COVERAGE_STATUSES.has(target.status)) errors.push(`${targetLabel}: invalid status ${target.status}`);
      if (!Array.isArray(target.evidence_refs)) errors.push(`${targetLabel}: evidence_refs must be a list`);
      if (EVIDENCED_COVERAGE_STATUSES.has(target.status) && !target.evidence_refs?.length) errors.push(`${targetLabel}: ${target.status} target requires evidence_refs`);
    }
  }
  return errors;
}

const FORBIDDEN_DURABLE_RUNTIME_FIELDS = new Set([
  'availability',
  'available',
  'connected',
  'readiness',
  'mcp_status',
  'tools_attached_to_agent',
  'server_running',
  'authentication_status',
  'permission_status',
  'last_checked',
]);

function normalizeDurableDocumentKey(value) {
  return String(value)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function collectDocumentKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectDocumentKeys(entry, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(normalizeDurableDocumentKey(key));
      collectDocumentKeys(child, keys);
    }
  }
  return keys;
}

export function durableDocumentKeys(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    try { return collectDocumentKeys(JSON.parse(normalized)); } catch { return new Set(); }
  }
  const keys = new Set();
  for (const line of normalized.split('\n')) {
    const match = line.match(/^\s*(?:-\s*)?["']?([A-Za-z0-9_-]+)["']?\s*:/);
    if (match) keys.add(normalizeDurableDocumentKey(match[1]));
    for (const flowMatch of line.matchAll(/(?:\{|,)\s*["']?([A-Za-z0-9_-]+)["']?\s*:/g)) {
      keys.add(normalizeDurableDocumentKey(flowMatch[1]));
    }
  }
  return keys;
}

function isForbiddenDurableRuntimeField(field) {
  const normalized = normalizeDurableDocumentKey(field);
  if (FORBIDDEN_DURABLE_RUNTIME_FIELDS.has(normalized)) return true;
  const forbiddenPattern = /^(?:current_(?:source_)?(?:availability|available|capabilities|connection|connected|authentication|permissions|readiness|status|state|observation)|runtime_(?:(?:source|transport|adapter)_)?(?:observation|status|state|availability|available|capabilities|connection|connected|authentication|permissions|readiness)|(?:source|transport|adapter)_(?:runtime_(?:observation|status|state|availability|capabilities)|availability(?:_status)?|connection_status)|[a-z0-9]+_mcp_status)$/;
  if (forbiddenPattern.test(normalized)) return true;

  // Keys without separators (including lower-cased aliases originating in
  // JSON) must not bypass the same policy. Keep this list anchored so durable
  // historical keys such as `historical_availability` and contract keys such
  // as `transport_semantics` remain valid.
  const compact = normalized.replace(/_/g, '');
  if ([...FORBIDDEN_DURABLE_RUNTIME_FIELDS].some((candidate) => candidate.replace(/_/g, '') === compact)) return true;
  return /^(?:current(?:source)?(?:availability|available|capabilities|connection|connected|authentication|permissions|readiness|status|state|observation)|runtime(?:(?:source|transport|adapter))?(?:observation|status|state|availability|available|capabilities|connection|connected|authentication|permissions|readiness)|(?:source|transport|adapter)(?:runtime(?:observation|status|state|availability|capabilities)|availability(?:status)?|connectionstatus)|[a-z0-9]+mcpstatus)$/.test(compact);
}

export function findForbiddenDurableRuntimeFields(text) {
  return [...durableDocumentKeys(text)].filter(isForbiddenDurableRuntimeField).sort();
}

function containsRuntimeObservation(value) {
  if (Array.isArray(value)) return value.some(containsRuntimeObservation);
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, 'observed_at') && Array.isArray(value.observations)) return true;
  return Object.values(value).some(containsRuntimeObservation);
}

export function hasGlobalRuntimeObservation(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    try { return containsRuntimeObservation(JSON.parse(normalized)); } catch { return false; }
  }
  return /^\s*["']?observed_at["']?\s*:\s*\S/m.test(normalized)
    && /^\s*["']?observations["']?\s*:/m.test(normalized);
}

export function createProbePlan(contract, selectedIds = []) {
  const selected = selectedIds.length ? new Set(selectedIds) : null;
  const unknown = selectedIds.filter((id) => !contract.sources.some((source) => source.id === id));
  if (unknown.length) throw new Error(`unknown source id(s): ${unknown.join(', ')}`);
  return contract.sources
    .filter((source) => !selected || selected.has(source.id))
    .filter((source) => !['retired', 'not_applicable'].includes(source.lifecycle))
    .map((source) => ({
      source_id: source.id,
      requirement: source.requirement,
      mapping_state: source.mapping_state,
      transport_semantics: source.transport_semantics,
      transports: source.transports.map((transport) => ({
        transport_id: transport.id,
        method: transport.method,
        access_mode: transport.access_mode,
        required_tools: transport.required_tools,
        safe_probe: transport.safe_probe,
        safe_limit: transport.safe_limit,
        priority: transport.priority,
        fallback: transport.fallback,
        consent: transport.consent,
      })),
    }));
}

function isTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function unknownFields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((field) => !allowed.has(field)).map((field) => `${label}: unknown field ${field}`);
}

export function validateRuntimeObservation(observation, contract, selectedIds = []) {
  const errors = [];
  if (!observation || typeof observation !== 'object') return ['observation must be an object'];
  errors.push(...unknownFields(observation, new Set(['schema_version', 'observed_at', 'surface', 'run_id', 'observations']), 'observation'));
  if (observation.schema_version !== 1) errors.push('observation schema_version must be 1');
  if (!isTimestamp(observation.observed_at)) {
    errors.push('observed_at must be an ISO-8601 timestamp with timezone');
  }
  if (!observation.surface || typeof observation.surface !== 'string') errors.push('surface is required');
  if (!Array.isArray(observation.observations)) errors.push('observations must be a list');
  const selected = selectedIds.length ? new Set(selectedIds) : null;
  const seen = new Set();
  for (const item of observation.observations || []) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push('observation items must be objects');
      continue;
    }
    errors.push(...unknownFields(item, new Set(['source_id', 'transport_id', 'state', 'observed_tools', 'probe', 'consent_attestation', 'fallback_reason']), `${item.source_id || '<unknown>'}/${item.transport_id || '<unknown>'}`));
    const source = contract.sources.find((candidate) => candidate.id === item.source_id);
    if (!source) {
      errors.push(`unknown observation source_id: ${item.source_id}`);
      continue;
    }
    if (selected && !selected.has(item.source_id)) errors.push(`observation source ${item.source_id} was not selected`);
    const transport = source.transports.find((candidate) => candidate.id === item.transport_id);
    if (!transport) errors.push(`${item.source_id}: unknown transport_id ${item.transport_id}`);
    const key = `${item.source_id}/${item.transport_id}`;
    if (seen.has(key)) errors.push(`duplicate observation: ${key}`);
    seen.add(key);
    if (!RUNTIME_STATES.has(item.state)) errors.push(`${key}: invalid state ${item.state}`);
    if (!Array.isArray(item.observed_tools)) errors.push(`${key}: observed_tools must be a list`);
    if (!item.probe || typeof item.probe !== 'object') errors.push(`${key}: probe is required`);
    else {
      errors.push(...unknownFields(item.probe, new Set(['operation', 'outcome', 'limitation', 'limit', 'observed_count']), `${key}/probe`));
      if (!item.probe.operation) errors.push(`${key}: probe.operation is required`);
      if (!PROBE_OUTCOMES.has(item.probe.outcome)) errors.push(`${key}: invalid probe outcome ${item.probe.outcome}`);
      if (typeof item.probe.limitation !== 'string') errors.push(`${key}: probe.limitation must be a string`);
      if (item.state === 'usable' && item.probe.outcome !== 'success') errors.push(`${key}: usable requires a successful probe`);
      if (item.probe.outcome === 'success' && item.state !== 'usable') errors.push(`${key}: a successful probe must have state usable`);
      if (transport && item.probe.operation !== transport.safe_probe) errors.push(`${key}: probe operation must match contract safe_probe ${transport.safe_probe}`);
      if (item.state === 'usable' && transport) {
        const observedTools = new Set(item.observed_tools || []);
        const missingTools = (transport.required_tools || []).filter((tool) => !observedTools.has(tool));
        if (missingTools.length) errors.push(`${key}: usable observation is missing required_tools ${missingTools.join(', ')}`);
        if (!Number.isInteger(item.probe.limit) || item.probe.limit < 1 || item.probe.limit > transport.safe_limit) {
          errors.push(`${key}: successful probe limit must be between 1 and contract safe_limit ${transport.safe_limit}`);
        }
        if (!Number.isInteger(item.probe.observed_count) || item.probe.observed_count < 0) {
          errors.push(`${key}: successful probe observed_count must be a non-negative integer`);
        } else if (Number.isInteger(item.probe.limit) && item.probe.observed_count > item.probe.limit) {
          errors.push(`${key}: observed_count cannot exceed the applied probe limit`);
        } else if (item.probe.observed_count > transport.safe_limit) {
          errors.push(`${key}: observed_count cannot exceed contract safe_limit ${transport.safe_limit}`);
        }
      }
    }
    if (transport?.consent === 'operator_required' && item.state === 'usable') {
      const attestation = item.consent_attestation;
      if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
        errors.push(`${key}: operator consent attestation is required for this transport`);
      } else {
        errors.push(...unknownFields(attestation, new Set(['granted', 'approver', 'granted_at', 'reason']), `${key}/consent_attestation`));
        if (attestation.granted !== true) errors.push(`${key}: operator consent must be explicitly granted`);
        if (typeof attestation.approver !== 'string' || !attestation.approver.trim()) errors.push(`${key}: consent approver is required`);
        if (!isTimestamp(attestation.granted_at)) errors.push(`${key}: consent granted_at must be an ISO-8601 timestamp with timezone`);
        if (typeof attestation.reason !== 'string' || !attestation.reason.trim()) errors.push(`${key}: consent reason is required`);
      }
    } else if (transport?.consent === 'not_required' && item.consent_attestation !== undefined) {
      errors.push(`${key}: consent_attestation is not allowed when the contract says not_required`);
    }
    if (transport?.fallback === true && item.state === 'usable') {
      if (typeof item.fallback_reason !== 'string' || !item.fallback_reason.trim()) errors.push(`${key}: usable fallback transport requires fallback_reason`);
    } else if (transport?.fallback === false && item.fallback_reason !== undefined) {
      errors.push(`${key}: fallback_reason is not allowed for a primary or complementary transport`);
    }
  }
  return errors;
}

export function evaluateRuntimeObservation(observation, contract, selectedIds = []) {
  const errors = [...validateSourceContracts(contract), ...validateRuntimeObservation(observation, contract, selectedIds)];
  if (errors.length) return { ok: false, errors, summary: null, observations: observation?.observations || [] };
  const plan = createProbePlan(contract, selectedIds);
  const selectedSourceIds = new Set(plan.map((entry) => entry.source_id));
  const usableSources = new Set(plan.filter((entry) => {
    const usableTransportIds = new Set(observation.observations
      .filter((item) => item.source_id === entry.source_id && item.state === 'usable')
      .map((item) => item.transport_id));
    if (entry.transport_semantics === 'complementary') {
      return entry.transports.every((transport) => usableTransportIds.has(transport.transport_id));
    }
    return usableTransportIds.size > 0;
  }).map((entry) => entry.source_id));
  const required = plan.filter((entry) => entry.requirement === 'required');
  // An explicitly selected source is a gate for this invocation even when it
  // is optional for the corpus as a whole. Without --source, only durable
  // `requirement: required` contracts block the general preflight.
  const gates = selectedIds.length ? plan : required;
  const blocking = gates.filter((entry) => !usableSources.has(entry.source_id)).map((entry) => entry.source_id);
  const blockingRequired = gates.filter((entry) => entry.requirement === 'required' && !usableSources.has(entry.source_id)).map((entry) => entry.source_id);
  const blockingOptional = gates.filter((entry) => entry.requirement === 'optional' && !usableSources.has(entry.source_id)).map((entry) => entry.source_id);
  const unobserved = [...selectedSourceIds].filter((sourceId) => !observation.observations.some((item) => item.source_id === sourceId));
  return {
    ok: blocking.length === 0,
    errors: [],
    summary: {
      selected_sources: plan.length,
      observed_sources: selectedSourceIds.size - unobserved.length,
      usable_sources: usableSources.size,
      required_sources: required.length,
      gated_sources: gates.length,
      blocking_sources: blocking,
      blocking_required_sources: blockingRequired,
      blocking_optional_sources: blockingOptional,
      unobserved_sources: unobserved,
    },
    observations: observation.observations,
  };
}

function parseArgs(argv) {
  const options = { sources: [], json: false, observation: null, contracts: 'doc/_meta/information-sources.yaml', allowPartial: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--allow-partial') options.allowPartial = true;
    else if (arg === '--source') options.sources.push(...String(argv[++index] || '').split(',').filter(Boolean));
    else if (arg === '--observation') options.observation = argv[++index];
    else if (arg === '--contracts') options.contracts = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function print(value, json) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (value.probe_plan) {
    console.log('Runtime source probe plan (point-in-time; nothing was persisted)');
    for (const source of value.probe_plan) {
      console.log(`- ${source.source_id} [${source.requirement}]`);
      console.log(`  semantics: ${source.transport_semantics}`);
      for (const transport of [...source.transports].sort((a, b) => a.priority - b.priority)) {
        console.log(`  - ${transport.transport_id}: ${transport.safe_probe} (limit ${transport.safe_limit}; priority ${transport.priority}; ${transport.fallback ? 'fallback' : 'primary/complementary'}; consent ${transport.consent})`);
      }
    }
  } else {
    console.log(`Runtime source observation: ${value.ok ? 'usable' : 'blocked or invalid'}`);
    if (value.errors?.length) for (const error of value.errors) console.log(`- ${error}`);
    if (value.summary?.blocking_sources?.length) console.log(`- gated sources blocked: ${value.summary.blocking_sources.join(', ')}`);
  }
}

async function readObservation(location) {
  const text = location === '-'
    ? await new Promise((resolve, reject) => {
        let body = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { body += chunk; });
        process.stdin.on('end', () => resolve(body));
        process.stdin.on('error', reject);
      })
    : fs.readFileSync(path.resolve(location), 'utf8');
  return JSON.parse(text);
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let options;
  try { options = parseArgs(argv); }
  catch (error) {
    console.error(error.message);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node scripts/check-runtime-sources.mjs [--source id] [--observation file|-] [--contracts file] [--json] [--allow-partial]');
    console.log('--allow-partial acknowledges reduced scope only for selected optional sources; required sources still exit 1.');
    return 0;
  }
  try {
    const contractPath = path.resolve(cwd, options.contracts);
    const contract = parseSourceContracts(fs.readFileSync(contractPath, 'utf8'));
    const contractErrors = validateSourceContracts(contract);
    if (contractErrors.length) {
      print({ ok: false, errors: contractErrors }, options.json);
      return 2;
    }
    if (!options.observation) {
      const probePlan = createProbePlan(contract, options.sources);
      print({ schema_version: 1, status: 'observation_required', persistence: 'none', probe_plan: probePlan }, options.json);
      return 0;
    }
    const observation = await readObservation(options.observation);
    const result = evaluateRuntimeObservation(observation, contract, options.sources);
    print(result, options.json);
    if (result.errors.length) return 2;
    if (result.ok) return 0;
    // Reduced-scope continuation is valid only for explicitly selected optional
    // sources. A required source needs a separate, structured operator waiver;
    // this CLI deliberately has no un-attested waiver path.
    if (options.allowPartial && result.summary?.blocking_required_sources?.length === 0) return 0;
    return 1;
  } catch (error) {
    print({ ok: false, errors: [error.message] }, options?.json);
    return 2;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
