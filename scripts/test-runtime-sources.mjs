#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createProbePlan,
  findForbiddenDurableRuntimeFields,
  hasGlobalRuntimeObservation,
  evaluateRuntimeObservation,
  parseSourceContracts,
  parseSourceCoverage,
  validateSourceContracts,
  validateSourceCoverage,
} from './check-runtime-sources.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function argumentValue(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1] || null;
  const prefixed = process.argv.find((value) => value.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

const requestedRoot = path.resolve(argumentValue('--root') || path.resolve(here, '..'));
const repoRoot = fs.realpathSync(requestedRoot);
if (requestedRoot !== repoRoot || !fs.statSync(repoRoot).isDirectory()) {
  throw new Error('--root must be a real directory without symbolic-link indirection');
}
const portable = process.argv.includes('--portable');
const learningTestsArg = process.argv.indexOf('--learning-tests-json');
const selectedLearningTests = learningTestsArg >= 0
  ? new Set(JSON.parse(process.argv[learningTestsArg + 1] || '[]'))
  : null;
const discoveredLearningTests = new Set();
const script = path.join(here, 'check-runtime-sources.mjs');
const fixtures = path.join(here, 'runtime-source-fixtures');
const sourceCorpusFixture = path.join(fixtures, 'valid-source-corpus');
const contractText = fs.readFileSync(path.join(repoRoot, 'doc/_meta/information-sources.yaml'), 'utf8');
const contract = parseSourceContracts(contractText);
let failed = 0;
let ran = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function test(name, fn) {
  discoveredLearningTests.add(name);
  if (selectedLearningTests && !selectedLearningTests.has(name)) return;
  ran += 1;
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
}

function observation(items) {
  return {
    schema_version: 1,
    observed_at: '2026-08-26T12:00:00+02:00',
    surface: 'test-runtime',
    run_id: 'test-run',
    observations: items,
  };
}

test('canonical-source-contract-is-valid', () => {
  const errors = validateSourceContracts(contract);
  assert(errors.length === 0, errors.join('; '));
  assert(contract.sources.some((source) => source.id === 'jira'), 'jira source missing');
  assert(!contractText.includes('tools_attached_to_agent'), 'transient attachment leaked into source contract');
});

test('persistent-current-mcp-status', () => {
  const polluted = parseSourceContracts(contractText.replace(
    '    lifecycle: declared\n',
    '    lifecycle: declared\n    status: available\n',
  ));
  const errors = validateSourceContracts(polluted);
  assert(errors.some((error) => error.includes('transient field status')), 'durable availability field was accepted');
});

test('durable-contract-denies-renamed-runtime-fields-and-json-extras', () => {
  for (const field of ['mcp_status: unavailable', 'current_availability: usable', 'runtime_state: connected']) {
    const polluted = parseSourceContracts(contractText.replace(
      '    lifecycle: declared\n',
      `    lifecycle: declared\n    ${field}\n`,
    ));
    const errors = validateSourceContracts(polluted);
    assert(errors.some((error) => error.includes('unknown durable source field')), `${field} was accepted`);
  }
  const jsonContract = JSON.parse(JSON.stringify(contract));
  jsonContract.sources[0].current_availability = 'usable';
  const errors = validateSourceContracts(parseSourceContracts(JSON.stringify(jsonContract)));
  assert(errors.some((error) => error.includes('current_availability')), 'JSON runtime field was accepted');
});

test('durable-state-scanner-catches-yaml-and-json-runtime-bypasses', () => {
  const yamlFields = findForbiddenDurableRuntimeFields('source:\n  current_availability: usable\n  github_mcp_status: connected\n');
  assert(yamlFields.includes('current_availability'), 'nested YAML availability bypassed scanner');
  assert(yamlFields.includes('github_mcp_status'), 'renamed MCP status bypassed scanner');
  assert(findForbiddenDurableRuntimeFields('runtime: {availability: usable}').includes('availability'), 'flow-style YAML availability bypassed scanner');
  const json = fs.readFileSync(path.join(fixtures, 'global-runtime-observation.json'), 'utf8');
  assert(hasGlobalRuntimeObservation(json), 'JSON global observation bypassed scanner');
  assert(hasGlobalRuntimeObservation('observed_at: 2026-08-26T12:00:00Z\nobservations:\n  []\n'), 'YAML global observation bypassed scanner');
  assert(!hasGlobalRuntimeObservation(fs.readFileSync(path.join(repoRoot, 'doc/_meta/source-coverage.yaml'), 'utf8')), 'historical coverage was mistaken for current runtime state');
});

test('durable-state-scanner-normalizes-camel-case-and-separator-free-aliases', () => {
  const yaml = fs.readFileSync(path.join(fixtures, 'durable-runtime-aliases.yaml'), 'utf8');
  const yamlFields = findForbiddenDurableRuntimeFields(yaml);
  for (const field of [
    'current_availability',
    'current_source_capabilities',
    'runtime_transport_state',
    'runtime_adapter_observation',
    'github_mcp_status',
    'server_running',
  ]) {
    assert(yamlFields.includes(field), `YAML alias ${field} bypassed durable scanner: ${yamlFields.join(', ')}`);
  }

  const json = fs.readFileSync(path.join(fixtures, 'durable-runtime-aliases.json'), 'utf8');
  const jsonFields = findForbiddenDurableRuntimeFields(json);
  for (const field of ['current_availability', 'currentavailability', 'runtime_transport_state', 'runtimeadapterobservation', 'tools_attached_to_agent', 'authentication_status']) {
    assert(jsonFields.includes(field), `JSON alias ${field} bypassed durable scanner: ${jsonFields.join(', ')}`);
  }
});

test('durable-state-scanner-allows-historical-and-contractual-vocabulary', () => {
  for (const fixture of ['durable-source-history-vocabulary.yaml', 'durable-source-history-vocabulary.json']) {
    const history = fs.readFileSync(path.join(fixtures, fixture), 'utf8');
    const fields = findForbiddenDurableRuntimeFields(history);
    assert(fields.length === 0, `${fixture} historical or contractual vocabulary was mistaken for current runtime state: ${fields.join(', ')}`);
  }
  const durableContractFiles = [
    'doc/_meta/information-sources.yaml',
    'doc/_meta/source-coverage.yaml',
  ];
  for (const relative of durableContractFiles) {
    const fields = findForbiddenDurableRuntimeFields(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
    assert(fields.length === 0, `${relative} produced false positives: ${fields.join(', ')}`);
  }
});

test('transport-semantics-priority-fallback-and-consent-are-explicit', () => {
  const github = contract.sources.find((source) => source.id === 'github-peer-corpora');
  assert(github.transport_semantics === 'alternative', 'GitHub transport semantics missing');
  assert(github.transports.filter((transport) => transport.fallback === false).length === 1, 'GitHub primary transport is ambiguous');
  assert(github.transports.some((transport) => transport.fallback === true), 'GitHub fallback is not explicit');
  assert(github.transports.every((transport) => Number.isInteger(transport.priority)), 'GitHub transport priority missing');
  const invalid = JSON.parse(JSON.stringify(contract));
  const invalidGithub = invalid.sources.find((source) => source.id === 'github-peer-corpora');
  invalidGithub.transports[1].priority = invalidGithub.transports[0].priority;
  invalidGithub.transports[1].fallback = true;
  const errors = validateSourceContracts(invalid);
  assert(errors.some((error) => error.includes('duplicate transport priority')), 'duplicate priority was accepted');
  assert(errors.some((error) => error.includes('exactly one primary')), 'ambiguous fallback set was accepted');
});

test('probe-plan-is-transport-neutral-and-bounded', () => {
  const [jira] = createProbePlan(contract, ['jira']);
  assert(jira.source_id === 'jira', 'wrong selected source');
  assert(jira.transports[0].method === 'mcp', 'transport method missing');
  assert(jira.transports[0].safe_limit === 10, 'safe bound missing');
});

test('successful-point-in-time-observation-validates', () => {
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'jira',
    transport_id: 'atlassian-mcp',
    state: 'usable',
    observed_tools: ['jira'],
    probe: { operation: 'list-accessible-projects', outcome: 'success', limitation: '', limit: 10, observed_count: 1 },
  }]), contract, ['jira']);
  assert(result.errors.length === 0, result.errors.join('; '));
  assert(result.ok === true, 'optional usable source should pass');
});

test('usable-observation-requires-tools-and-bounded-volume-proof', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(fixtures, 'usable-without-required-tools.json'), 'utf8'));
  const result = evaluateRuntimeObservation(payload, contract, ['jira']);
  assert(result.ok === false, 'unproved usable observation passed');
  assert(result.errors.some((error) => error.includes('missing required_tools')), 'missing tool proof was not rejected');
  assert(result.errors.some((error) => error.includes('safe_limit')), 'oversized probe limit was not rejected');
  assert(result.errors.some((error) => error.includes('observed_count')), 'oversized observed volume was not rejected');
});

test('operator-required-transport-needs-structured-consent', () => {
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'github-peer-corpora',
    transport_id: 'github-mcp',
    state: 'usable',
    observed_tools: ['get_file_contents', 'search_code'],
    probe: { operation: 'read-declared-peer-corpus-index', outcome: 'success', limitation: '', limit: 1, observed_count: 1 },
  }]), contract, ['github-peer-corpora']);
  assert(result.ok === false, 'operator-required transport passed without consent');
  assert(result.errors.some((error) => error.includes('consent attestation')), 'missing consent was not reported');
});

test('fallback-transport-cannot-be-selected-silently', () => {
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'github-peer-corpora',
    transport_id: 'github-mcp',
    state: 'usable',
    observed_tools: ['get_file_contents', 'search_code'],
    probe: { operation: 'read-declared-peer-corpus-index', outcome: 'success', limitation: '', limit: 1, observed_count: 1 },
    consent_attestation: { granted: true, approver: 'test-operator', granted_at: '2026-08-26T11:55:00+02:00', reason: 'Fixture permits read-only peer access' },
  }]), contract, ['github-peer-corpora']);
  assert(result.ok === false, 'fallback passed without a reason');
  assert(result.errors.some((error) => error.includes('fallback_reason')), 'silent fallback was not reported');
});

test('complementary-transports-all-gate-the-source', () => {
  const complementary = JSON.parse(JSON.stringify(contract));
  const source = complementary.sources.find((candidate) => candidate.id === 'repository');
  source.transport_semantics = 'complementary';
  source.transports.push({
    id: 'second-read-only-view', method: 'file-export', access_mode: 'read-only', required_tools: [],
    safe_probe: 'read-second-view', safe_limit: 1, priority: 2, fallback: false, consent: 'not_required',
  });
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'repository', transport_id: 'local-filesystem', state: 'usable', observed_tools: [],
    probe: { operation: 'list-repository-root', outcome: 'success', limitation: '', limit: 20, observed_count: 20 },
  }]), complementary, ['repository']);
  assert(result.errors.length === 0, result.errors.join('; '));
  assert(result.ok === false, 'one usable transport incorrectly satisfied a complementary source');
  assert(result.summary.blocking_required_sources.includes('repository'), 'complementary blocker was not classified required');
});

test('source-available-through-non-mcp-transport', () => {
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'github-peer-corpora',
    transport_id: 'git-sparse-clone',
    state: 'usable',
    observed_tools: ['git'],
    probe: { operation: 'fetch-declared-peer-corpus-head', outcome: 'success', limitation: 'Primary clone transport selected for this run', limit: 1, observed_count: 1 },
    consent_attestation: { granted: true, approver: 'test-operator', granted_at: '2026-08-26T11:55:00+02:00', reason: 'Fixture permits read-only peer access' },
  }]), contract, ['github-peer-corpora']);
  assert(result.errors.length === 0, result.errors.join('; '));
  assert(result.ok === true, 'declared non-MCP transport should satisfy the logical source');
});

test('explicitly-selected-optional-source-still-gates-this-run', () => {
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'jira',
    transport_id: 'atlassian-mcp',
    state: 'not_visible',
    observed_tools: [],
    probe: { operation: 'list-accessible-projects', outcome: 'not_run', limitation: 'tool absent from this runtime', limit: null, observed_count: null },
  }]), contract, ['jira']);
  assert(result.ok === false, 'explicit optional source did not gate its own preflight');
  assert(result.summary.blocking_sources.includes('jira'), 'selected source blocker not reported');
});

test('required-source-failure-blocks-without-changing-history', () => {
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'repository',
    transport_id: 'local-filesystem',
    state: 'not_visible',
    observed_tools: [],
    probe: { operation: 'list-repository-root', outcome: 'not_run', limitation: 'workspace not mounted', limit: null, observed_count: null },
  }]), contract, ['repository']);
  assert(result.ok === false, 'missing required source should block');
  assert(result.summary.blocking_sources[0] === 'repository', 'blocking source not reported');
  const coverage = fs.readFileSync(path.join(repoRoot, 'doc/_meta/source-coverage.yaml'), 'utf8');
  assert(coverage.includes('source_id: repository'), 'coverage file unexpectedly changed or missing');
});

test('allow-partial-never-neutralizes-a-required-source', () => {
  const payload = fs.readFileSync(path.join(fixtures, 'required-source-unavailable.json'), 'utf8');
  const result = spawnSync(process.execPath, [script, '--source', 'repository', '--observation', '-', '--allow-partial', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: payload,
  });
  assert(result.status === 1, `required source bypassed with exit ${result.status}`);
  const output = JSON.parse(result.stdout);
  assert(output.summary.blocking_required_sources.includes('repository'), 'required blocker classification missing');
});

test('source-coverage-denies-runtime-fields-and-incomplete-target-evidence', () => {
  const coverage = parseSourceCoverage(fs.readFileSync(path.join(fixtures, 'invalid-source-coverage.yaml'), 'utf8'));
  const errors = validateSourceCoverage(coverage, contract);
  assert(errors.some((error) => error.includes('availability')), 'runtime availability persisted in coverage was accepted');
  assert(errors.some((error) => error.includes('coverage requires evidence_refs')), 'covered source without evidence passed');
  assert(errors.some((error) => error.includes('target requires evidence_refs')), 'covered target without evidence passed');
});

if (!portable) test('source-fixture-contract-coverage-run-and-human-view-stay-in-parity', () => {
  const fixtureDoc = path.join(sourceCorpusFixture, 'doc');
  const fixtureContract = parseSourceContracts(fs.readFileSync(path.join(fixtureDoc, '_meta/information-sources.yaml'), 'utf8'));
  const contractErrors = validateSourceContracts(fixtureContract);
  assert(contractErrors.length === 0, contractErrors.join('; '));
  const fixtureCoverage = parseSourceCoverage(fs.readFileSync(path.join(fixtureDoc, '_meta/source-coverage.yaml'), 'utf8'));
  const coverageErrors = validateSourceCoverage(fixtureCoverage, fixtureContract);
  assert(coverageErrors.length === 0, coverageErrors.join('; '));
  const ledger = fs.readFileSync(path.join(fixtureDoc, '_runs/RUN_LEDGER.md'), 'utf8');
  for (const entry of fixtureCoverage.coverage) {
    assert(ledger.includes(`| ${entry.last_successful_run} |`), `${entry.source_id} run is absent from the fixture ledger`);
    for (const evidenceRef of [...entry.evidence_refs, ...entry.targets.flatMap((target) => target.evidence_refs)]) {
      assert(fs.existsSync(path.join(sourceCorpusFixture, evidenceRef)), `${entry.source_id} evidence does not resolve: ${evidenceRef}`);
    }
  }
  const view = fs.readFileSync(path.join(fixtureDoc, '_meta/discovery-coverage.md'), 'utf8');
  assert(/^\| Repository source \| covered \|/m.test(view), 'Repository status drifted from fixture coverage');
});

test('unknown-source-and-unsafe-state-combinations-fail', () => {
  const result = evaluateRuntimeObservation(observation([{
    source_id: 'unknown-source',
    transport_id: 'none',
    state: 'usable',
    observed_tools: [],
    probe: { operation: 'anything', outcome: 'failure', limitation: '', limit: null, observed_count: null },
  }]), contract);
  assert(result.errors.some((error) => error.includes('unknown observation source_id')), 'unknown source accepted');
});

test('cli-prints-plan-and-never-creates-global-runtime-state', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-source-test-'));
  try {
    const before = new Set(fs.readdirSync(path.join(repoRoot, 'doc/_meta')));
    const result = spawnSync(process.execPath, [script, '--source', 'dynatrace', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert(result.status === 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert(payload.status === 'observation_required', 'CLI did not return a probe plan');
    assert(payload.persistence === 'none', 'CLI did not declare ephemeral semantics');
    const after = new Set(fs.readdirSync(path.join(repoRoot, 'doc/_meta')));
    assert(before.size === after.size && [...before].every((name) => after.has(name)), 'CLI wrote global state');
    assert(!fs.existsSync(path.join(tmp, 'current-source-observation.yaml')), 'CLI wrote a current observation');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

if (!portable) test('dashboard-separates-contract-lifecycle-from-historical-coverage', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-source-dashboard-'));
  try {
    const out = path.join(tmp, 'fixture.html');
    const result = spawnSync(process.execPath, [path.join(here, 'build-corpus-site.mjs'), '--doc', path.join(sourceCorpusFixture, 'doc'), '--out', out], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert(result.status === 0, result.stderr || result.stdout);
    const html = fs.readFileSync(out, 'utf8');
    assert(html.includes('historically covered'), 'dashboard omits historical coverage semantics');
    assert(html.includes('Current runtime usability is intentionally absent'), 'dashboard omits runtime-state disclaimer');
    assert(!html.includes('alimenté par'), 'dashboard still claims declarations feed the corpus');
    assert(!/ov-src-status-good">declared/.test(html), 'declared lifecycle is still rendered as green evidence');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cli-validates-stdin-observation-and-enforces-selected-gate', () => {
  const payload = observation([{
    source_id: 'jira',
    transport_id: 'atlassian-mcp',
    state: 'not_visible',
    observed_tools: [],
    probe: { operation: 'list-accessible-projects', outcome: 'not_run', limitation: 'not exposed', limit: null, observed_count: null },
  }]);
  const blocked = spawnSync(process.execPath, [script, '--source', 'jira', '--observation', '-', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: JSON.stringify(payload),
  });
  assert(blocked.status === 1, `selected unusable source should exit 1, got ${blocked.status}`);
  const result = JSON.parse(blocked.stdout);
  assert(result.summary.blocking_sources.includes('jira'), 'CLI omitted selected source blocker');

  const partial = spawnSync(process.execPath, [script, '--source', 'jira', '--observation', '-', '--allow-partial', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: JSON.stringify(payload),
  });
  assert(partial.status === 0, '--allow-partial did not permit an explicitly labeled reduced scope');
});

test('implementation-has-no-filesystem-write-api', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert(!/writeFile|appendFile|createWriteStream/.test(source), 'runtime checker contains a filesystem write path');
});

if (selectedLearningTests) {
  for (const name of selectedLearningTests) {
    if (!discoveredLearningTests.has(name)) {
      failed += 1;
      console.log(`FAIL  ${name}`);
      console.log('        requested learning fixture test is not registered');
    }
  }
}

console.log(`\n${ran - failed}/${ran} passing`);
process.exitCode = failed > 0 ? 1 : 0;
