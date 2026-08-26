#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { readData } from './lib/factory-delivery/files.mjs';
import { parseYaml } from './lib/factory-delivery/yaml.mjs';
import { validatePlaywrightSource } from './adapters/playwright/policy.mjs';
import { canonicalHash } from './lib/factory-v3/canonical-json.mjs';
import { validateFactoryPackageV3 } from './lib/factory-v3/package-io.mjs';

function argumentValue(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1] || null;
  const prefixed = process.argv.find((value) => value.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

const controllerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestedRoot = path.resolve(argumentValue('--root') || controllerRoot);
const root = fs.realpathSync(requestedRoot);
if (requestedRoot !== root || !fs.statSync(root).isDirectory()) {
  throw new Error('--root must be a real directory without symbolic-link indirection');
}
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'scripts/factory-fixtures/catalog.json'), 'utf8'));
const learningBaseline = catalog.learning_baseline;
const learningSchema = readData(path.join(controllerRoot, 'schemas/factory-learning.yaml.schema.yaml'));
const contractOnly = process.argv.includes('--contract-only');
const requireHistoryBaseline = process.argv.includes('--require-history-baseline');
const historyBaselineRef = argumentValue('--baseline-ref') || process.env.FACTORY_LEARNING_BASELINE_REF || null;
const requestedBaselineRoot = argumentValue('--baseline-root');
const historyBaselineSha = argumentValue('--baseline-sha');
if (Boolean(requestedBaselineRoot) !== Boolean(historyBaselineSha)) {
  throw new Error('--baseline-root and --baseline-sha must be supplied together');
}
const requestedBaselinePath = requestedBaselineRoot ? path.resolve(requestedBaselineRoot) : null;
const historyBaselineRoot = requestedBaselinePath ? fs.realpathSync(requestedBaselinePath) : null;
if (historyBaselineRoot) {
  if (requestedBaselinePath !== historyBaselineRoot
    || !fs.statSync(historyBaselineRoot).isDirectory()
    || historyBaselineRoot === root
    || historyBaselineRoot === controllerRoot) {
    throw new Error('published baseline must be a real directory disjoint from subject and controller roots');
  }
  if (!/^[a-f0-9]{40}$/.test(historyBaselineSha || '')) throw new Error('--baseline-sha must be a full lowercase Git SHA');
}

function validateLearningLedger(learning, fixtureCatalog = catalog, baseline = learningBaseline) {
  const errors = [];
  const requiredTopLevel = learningSchema.required_top_level;
  const requiredPromotion = learningSchema.promotion.required;
  const allowedSourceTypes = new Set(learningSchema.promotion.enums['source.type']);
  const allowedDecisionStatuses = new Set(learningSchema.promotion.enums['decision.status']);
  const exactKeys = (value, allowed, scope) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${scope} must be an object`);
      return false;
    }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${scope}.${key} is unknown`);
    return true;
  };
  const required = (value, keys, scope) => {
    for (const key of keys) if (!Object.hasOwn(value || {}, key)) errors.push(`${scope}.${key} is required`);
  };
  const nonEmptyString = (value, scope) => {
    if (typeof value !== 'string' || !value.trim()) errors.push(`${scope} must be a non-empty string`);
  };
  const stringList = (value, scope, { nonEmpty = true } = {}) => {
    if (!Array.isArray(value)) {
      errors.push(`${scope} must be an array`);
      return [];
    }
    if (nonEmpty && value.length === 0) errors.push(`${scope} must not be empty`);
    if (new Set(value).size !== value.length) errors.push(`${scope} must contain unique values`);
    for (const item of value) nonEmptyString(item, `${scope} item`);
    return value;
  };

  if (!exactKeys(learning, requiredTopLevel, 'learning')) return errors;
  required(learning, requiredTopLevel, 'learning');
  if (learning.schema_version !== learningSchema.schema_version) errors.push(`learning.schema_version must be ${learningSchema.schema_version}`);
  if (exactKeys(learning.baseline, learningSchema.baseline.required, 'learning.baseline')) {
    required(learning.baseline, learningSchema.baseline.required, 'learning.baseline');
    if (learning.baseline.path !== learningSchema.baseline.path) errors.push(`learning.baseline.path must be ${learningSchema.baseline.path}`);
    if (learning.baseline.algorithm !== learningSchema.baseline.algorithm) errors.push(`learning.baseline.algorithm must be ${learningSchema.baseline.algorithm}`);
    if (!/^[a-f0-9]{64}$/.test(learning.baseline.sha256 || '')) errors.push('learning.baseline.sha256 must be a lowercase sha256');
    else if (learning.baseline.sha256 !== canonicalHash(baseline)) errors.push('learning.baseline.sha256 does not match the canonical baseline');
  }
  if (!Array.isArray(learning.promotions)) {
    errors.push('learning.promotions must be an array');
    return errors;
  }
  if (learning.promotions.length === 0) errors.push('learning.promotions must not be empty');

  const baselineById = new Map();
  if (!exactKeys(baseline, ['version', 'required_promotions'], 'learning baseline')) return errors;
  if (baseline.version !== 1) errors.push('learning baseline.version must be 1');
  if (!Array.isArray(baseline.required_promotions) || baseline.required_promotions.length === 0) {
    errors.push('learning baseline.required_promotions must be a non-empty array');
  }
  for (const [index, record] of (baseline.required_promotions || []).entries()) {
    const scope = `learning baseline promotion[${index}]`;
    const keys = ['id', 'introduced_in', 'initial_decision', 'positive_fixtures', 'negative_fixtures'];
    if (!exactKeys(record, keys, scope)) continue;
    required(record, keys, scope);
    nonEmptyString(record.id, `${scope}.id`);
    if (baselineById.has(record.id)) errors.push(`${scope}.id duplicates ${record.id}`);
    else baselineById.set(record.id, record);
    if (!/^FACTORY-LEARN-[0-9]{3,}$/.test(record.id || '')) errors.push(`${scope}.id has invalid format`);
    if (!/^\d+\.\d+\.\d+$/.test(record.introduced_in || '')) errors.push(`${scope}.introduced_in must be semver`);
    if (!allowedDecisionStatuses.has(record.initial_decision)) errors.push(`${scope}.initial_decision is invalid`);
    stringList(record.positive_fixtures, `${scope}.positive_fixtures`);
    stringList(record.negative_fixtures, `${scope}.negative_fixtures`);
  }

  const fixtureById = new Map();
  if (!fixtureCatalog || typeof fixtureCatalog !== 'object' || Array.isArray(fixtureCatalog)) errors.push('fixture catalog must be an object');
  else {
    if (!exactKeys(fixtureCatalog, ['version', 'learning_baseline', 'fixtures'], 'fixture catalog')) return errors;
    if (fixtureCatalog.version !== 1) errors.push('fixture catalog.version must be 1');
    if (!Array.isArray(fixtureCatalog.fixtures)) errors.push('fixture catalog.fixtures must be an array');
    for (const [index, fixture] of (fixtureCatalog.fixtures || []).entries()) {
      const scope = `fixture[${index}]`;
      if (!exactKeys(fixture, ['id', 'polarity', 'test_file', 'test_name'], scope)) continue;
      required(fixture, ['id', 'polarity', 'test_file', 'test_name'], scope);
      nonEmptyString(fixture.id, `${scope}.id`);
      if (fixtureById.has(fixture.id)) errors.push(`${scope}.id duplicates ${fixture.id}`);
      else fixtureById.set(fixture.id, fixture);
      if (!['positive', 'negative'].includes(fixture.polarity)) errors.push(`${scope}.polarity is invalid`);
      for (const key of ['test_file', 'test_name']) nonEmptyString(fixture[key], `${scope}.${key}`);
      const file = path.resolve(root, fixture.test_file || '.');
      if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) errors.push(`${scope}.test_file is not a contained file`);
    }
  }

  const promotionIds = new Set();
  const promotionById = new Map();
  const amendmentIds = new Set();
  for (const [index, promotion] of learning.promotions.entries()) {
    const scope = `promotion[${index}]`;
    if (!exactKeys(promotion, requiredPromotion, scope)) continue;
    required(promotion, requiredPromotion, scope);
    nonEmptyString(promotion.id, `${scope}.id`);
    if (!/^FACTORY-LEARN-[0-9]{3,}$/.test(promotion.id || '')) errors.push(`${scope}.id has invalid format`);
    if (promotionIds.has(promotion.id)) errors.push(`${scope}.id duplicates ${promotion.id}`);
    promotionIds.add(promotion.id);
    promotionById.set(promotion.id, promotion);
    if (typeof promotion.observed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(promotion.observed_at)) errors.push(`${scope}.observed_at must be YYYY-MM-DD`);
    for (const key of ['observed_failure', 'generalized_rule', 'introduced_in']) nonEmptyString(promotion[key], `${scope}.${key}`);
    if (typeof promotion.introduced_in === 'string' && !/^\d+\.\d+\.\d+$/.test(promotion.introduced_in)) errors.push(`${scope}.introduced_in must be semver`);
    const serializedPromotion = JSON.stringify(promotion);
    if (/(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/.test(serializedPromotion)) errors.push(`${scope} contains a workstation-specific absolute path`);
    if (/(?:ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})/.test(serializedPromotion)) errors.push(`${scope} contains secret-like material`);

    if (exactKeys(promotion.source, ['type', 'ref'], `${scope}.source`)) {
      required(promotion.source, ['type', 'ref'], `${scope}.source`);
      if (!allowedSourceTypes.has(promotion.source.type)) errors.push(`${scope}.source.type is invalid`);
      nonEmptyString(promotion.source.ref, `${scope}.source.ref`);
    }
    if (exactKeys(promotion.decision, ['status', 'rationale', 'amendment'], `${scope}.decision`)) {
      required(promotion.decision, ['status', 'rationale'], `${scope}.decision`);
      if (!allowedDecisionStatuses.has(promotion.decision.status)) errors.push(`${scope}.decision.status is invalid`);
      nonEmptyString(promotion.decision.rationale, `${scope}.decision.rationale`);
      if (promotion.decision.amendment !== undefined) {
        const amendment = promotion.decision.amendment;
        const amendmentKeys = ['id', 'approved_by', 'approved_at', 'reason', 'previous_status', 'fixture_disposition', 'replacement_id'];
        if (exactKeys(amendment, amendmentKeys, `${scope}.decision.amendment`)) {
          required(amendment, amendmentKeys.filter((key) => key !== 'replacement_id'), `${scope}.decision.amendment`);
          nonEmptyString(amendment.id, `${scope}.decision.amendment.id`);
          if (!/^FACTORY-AMEND-[0-9]{3,}$/.test(amendment.id || '')) errors.push(`${scope}.decision.amendment.id has invalid format`);
          if (amendmentIds.has(amendment.id)) errors.push(`${scope}.decision.amendment.id duplicates ${amendment.id}`);
          amendmentIds.add(amendment.id);
          for (const key of ['approved_by', 'reason']) nonEmptyString(amendment[key], `${scope}.decision.amendment.${key}`);
          if (typeof amendment.approved_at !== 'string' || Number.isNaN(Date.parse(amendment.approved_at))) errors.push(`${scope}.decision.amendment.approved_at must be a date-time`);
          if (!allowedDecisionStatuses.has(amendment.previous_status)) errors.push(`${scope}.decision.amendment.previous_status is invalid`);
          if (!['retained', 'replaced', 'retired'].includes(amendment.fixture_disposition)) errors.push(`${scope}.decision.amendment.fixture_disposition is invalid`);
          if (amendment.replacement_id !== undefined) nonEmptyString(amendment.replacement_id, `${scope}.decision.amendment.replacement_id`);
        }
      }
    }

    stringList(promotion.acceptance_criteria, `${scope}.acceptance_criteria`);
    for (const [polarity, field] of [['positive', 'positive_fixtures'], ['negative', 'negative_fixtures']]) {
      const ids = stringList(promotion[field], `${scope}.${field}`, { nonEmpty: promotion.decision?.status === 'adopted' });
      for (const id of ids) {
        const fixture = fixtureById.get(id);
        if (!fixture) errors.push(`${scope}.${field} references unknown fixture ${id}`);
        else if (fixture.polarity !== polarity) errors.push(`${scope}.${field} references ${id} with polarity ${fixture.polarity}`);
      }
    }
  }

  for (const [id, record] of baselineById) {
    const promotion = promotionById.get(id);
    if (!promotion) {
      errors.push(`baseline promotion ${id} is missing from learning.promotions`);
      continue;
    }
    const decisionChanged = promotion.decision?.status !== record.initial_decision;
    const fixturesChanged = !sameStringList(promotion.positive_fixtures, record.positive_fixtures)
      || !sameStringList(promotion.negative_fixtures, record.negative_fixtures);
    const amendment = promotion.decision?.amendment;
    if ((decisionChanged || fixturesChanged) && !amendment) errors.push(`baseline promotion ${id} changed without a typed amendment`);
    if (amendment) {
      if (fixturesChanged && amendment.fixture_disposition === 'retained') errors.push(`baseline promotion ${id} changed fixtures but amendment says retained`);
      if (!fixturesChanged && amendment.fixture_disposition !== 'retained') errors.push(`baseline promotion ${id} retained fixtures but amendment says ${amendment.fixture_disposition}`);
      if (amendment.fixture_disposition === 'retired' && promotion.decision?.status === 'adopted') errors.push(`baseline promotion ${id} cannot retire fixtures while adopted`);
      if (promotion.decision?.status === 'superseded') {
        if (!amendment.replacement_id) errors.push(`baseline promotion ${id} superseded decision requires replacement_id`);
        else if (amendment.replacement_id === id || !promotionById.has(amendment.replacement_id)) errors.push(`baseline promotion ${id} replacement_id must reference another promotion`);
      }
    }
  }
  for (const promotion of learning.promotions) {
    if (promotion.decision?.status === 'adopted' && !baselineById.has(promotion.id)) {
      errors.push(`adopted promotion ${promotion.id} is missing from the content-addressed baseline`);
    }
  }
  return errors;
}

function sameStringList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function executeCatalogFixtures(fixtureCatalog = catalog, repositoryRoot = controllerRoot, additionalRunners = new Map()) {
  const errors = [];
  const allowedRunners = new Map([
    ['scripts/test-factory-v3.mjs', { nativeNodeTest: true, args: [] }],
    ['scripts/test-factory-learning.mjs', { nativeNodeTest: true, args: [] }],
    ['scripts/test-factory-delivery.mjs', { nativeNodeTest: false, args: [] }],
    ['scripts/test-runtime-sources.mjs', { nativeNodeTest: false, args: ['--portable'] }],
    ...additionalRunners,
  ]);
  const grouped = new Map();
  for (const fixture of fixtureCatalog.fixtures || []) {
    if (!grouped.has(fixture.test_file)) grouped.set(fixture.test_file, []);
    grouped.get(fixture.test_file).push(fixture);
  }
  for (const [testFile, fixtures] of grouped) {
    const runner = allowedRunners.get(testFile);
    if (!runner) {
      errors.push(`${testFile}: fixture test file is not an allowlisted pack regression runner`);
      continue;
    }
    const resolved = path.resolve(repositoryRoot, testFile);
    if (!resolved.startsWith(`${repositoryRoot}${path.sep}`) || !fs.existsSync(resolved)) {
      errors.push(`${testFile}: fixture test file is not contained`);
      continue;
    }
    const childEnvironment = { ...process.env, FACTORY_LEARNING_FIXTURE_CHILD: '1' };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const exactNames = fixtures.map((fixture) => fixture.test_name);
    const exactPattern = `^(?:${exactNames.map(regexEscape).join('|')})$`;
    const argv = runner.nativeNodeTest
      ? ['--test', `--test-name-pattern=${exactPattern}`, resolved]
      : [resolved, '--learning-tests-json', JSON.stringify(exactNames), ...runner.args];
    const execution = spawnSync(process.execPath, argv, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: childEnvironment,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120_000,
    });
    const output = stripAnsi(`${execution.stdout || ''}\n${execution.stderr || ''}`);
    if (execution.error) {
      errors.push(`${testFile}: fixture test execution failed: ${execution.error.message}`);
      continue;
    }
    if (execution.status !== 0) errors.push(`${testFile}: fixture test process exited ${String(execution.status)}`);
    for (const fixture of fixtures) {
      const status = exactNamedTestStatus(output, fixture.test_name);
      if (status !== 'passed') errors.push(`${fixture.id}: exact test ${JSON.stringify(fixture.test_name)} reported ${status}`);
    }
  }
  return errors;
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactNamedTestStatus(output, testName) {
  const escaped = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  const mentions = lines.filter((line) => line.includes(testName));
  if (mentions.some((line) => /(?:#\s*(?:SKIP|TODO)|\bcancelled\b|^not ok\b|^FAIL\s|^✖\s|^﹣\s)/i.test(line))) return 'not-passed';
  const passed = [
    new RegExp(`^ok\\s+(?:[0-9]+\\s+-\\s+)?${escaped}(?:\\s|$)`),
    new RegExp(`^ok\\s+-\\s+${escaped}(?:\\s|$)`),
    new RegExp(`^✔\\s+${escaped}(?:\\s|$)`),
  ];
  return mentions.some((line) => passed.some((pattern) => pattern.test(line))) ? 'passed' : 'missing';
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function validateLearningHistory(current, previous, currentCatalog = catalog, previousCatalog = catalog) {
  const errors = [];
  const currentById = new Map((current.promotions || []).map((promotion) => [promotion.id, promotion]));
  const currentFixtures = new Map((currentCatalog.fixtures || []).map((fixture) => [fixture.id, fixture]));
  const previousFixtures = new Map((previousCatalog.fixtures || []).map((fixture) => [fixture.id, fixture]));
  for (const previousPromotion of previous.promotions || []) {
    const currentPromotion = currentById.get(previousPromotion.id);
    if (!currentPromotion) {
      errors.push(`published promotion ${previousPromotion.id} was removed; retain a tombstone with a typed amendment`);
      continue;
    }
    const withoutAmendment = (promotion) => {
      const copy = JSON.parse(JSON.stringify(promotion));
      if (copy.decision) delete copy.decision.amendment;
      return copy;
    };
    const promotionChanged = canonicalHash(withoutAmendment(currentPromotion)) !== canonicalHash(withoutAmendment(previousPromotion));
    const referencedFixtureIds = [...new Set([
      ...(previousPromotion.positive_fixtures || []),
      ...(previousPromotion.negative_fixtures || []),
      ...(currentPromotion.positive_fixtures || []),
      ...(currentPromotion.negative_fixtures || []),
    ])];
    const fixtureBindingChanged = referencedFixtureIds.some((id) => canonicalHash(currentFixtures.get(id) || null) !== canonicalHash(previousFixtures.get(id) || null));
    if (promotionChanged || fixtureBindingChanged) {
      const amendment = currentPromotion.decision?.amendment;
      if (!amendment) errors.push(`published promotion ${previousPromotion.id} changed without a typed amendment`);
      else {
        if (amendment.previous_status !== previousPromotion.decision?.status) errors.push(`published promotion ${previousPromotion.id} amendment.previous_status must match the previous published decision`);
        if (amendment.id === previousPromotion.decision?.amendment?.id) errors.push(`published promotion ${previousPromotion.id} must use a new amendment id for each published change`);
      }
    } else if (canonicalHash(currentPromotion.decision?.amendment || null) !== canonicalHash(previousPromotion.decision?.amendment || null)) {
      errors.push(`published promotion ${previousPromotion.id} amendment changed without a promotion or fixture change`);
    }
  }
  return errors;
}

function loadPublishedLearning(ref) {
  const resolved = runGit(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  if (!/^[a-f0-9]{40}$/.test(resolved)) throw new Error(`history baseline ref did not resolve to a full commit: ${ref}`);
  const learningResult = runGitResult(['show', `${resolved}:doc/_meta/factory-learning.yaml`]);
  const catalogResult = runGitResult(['show', `${resolved}:scripts/factory-fixtures/catalog.json`]);
  if (learningResult.status !== 0 && catalogResult.status !== 0) {
    const absentAtRevision = (result) => /(?:does not exist in|exists on disk, but not in)/i.test(result.stderr || '');
    if (absentAtRevision(learningResult) && absentAtRevision(catalogResult)) {
      return { ref: resolved, learning: null, catalog: null, bootstrap: true };
    }
    throw new Error(`cannot read published learning history at ${resolved}: ${(learningResult.stderr || catalogResult.stderr || '').trim()}`);
  }
  if (learningResult.status !== 0 || catalogResult.status !== 0) {
    throw new Error(`published learning history at ${resolved} is incomplete; ledger and catalogue must appear together`);
  }
  const learningText = learningResult.stdout;
  const catalogText = catalogResult.stdout;
  return { ref: resolved, learning: parseYaml(learningText), catalog: JSON.parse(catalogText) };
}

function loadPublishedLearningRoot(baselineRoot, expectedSha) {
  const resolved = runGit(['rev-parse', '--verify', 'HEAD^{commit}'], baselineRoot).trim();
  if (resolved !== expectedSha) {
    throw new Error(`published baseline checkout HEAD ${resolved || '<missing>'} does not equal expected ${expectedSha}`);
  }
  const safeRead = (relative) => {
    let absolute = baselineRoot;
    const parts = relative.split('/');
    for (let index = 0; index < parts.length; index += 1) {
      absolute = path.join(absolute, parts[index]);
      if (!fs.existsSync(absolute)) return null;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`published baseline ${relative} traverses a symbolic link`);
      if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`published baseline ${relative} has a non-directory parent`);
      if (index === parts.length - 1 && !stat.isFile()) throw new Error(`published baseline ${relative} must be a regular file`);
    }
    return fs.readFileSync(absolute, 'utf8');
  };
  const learningText = safeRead('doc/_meta/factory-learning.yaml');
  const catalogText = safeRead('scripts/factory-fixtures/catalog.json');
  if (learningText === null && catalogText === null) {
    return { ref: resolved, learning: null, catalog: null, bootstrap: true };
  }
  if (learningText === null || catalogText === null) {
    throw new Error(`published learning history at ${resolved} is incomplete; ledger and catalogue must appear together`);
  }
  return { ref: resolved, learning: parseYaml(learningText), catalog: JSON.parse(catalogText) };
}

function runGit(args, cwd = root) {
  const execution = runGitResult(args, cwd);
  if (execution.error || execution.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(execution.stderr || execution.error?.message || '').trim()}`);
  return execution.stdout;
}

function runGitResult(args, cwd = root) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

test('every adopted factory learning resolves to executable positive and negative fixtures', () => {
  const learning = readData(path.join(root, 'doc/_meta/factory-learning.yaml'));
  assert.deepEqual(validateLearningLedger(learning), []);
});

test('factory learning validation runs before adoption filtering', () => {
  const valid = readData(path.join(root, 'doc/_meta/factory-learning.yaml'));
  const mutate = (change) => {
    const copy = JSON.parse(JSON.stringify(valid));
    change(copy);
    return validateLearningLedger(copy);
  };
  assert.ok(mutate((copy) => { delete copy.promotions[0].decision; }).some((error) => error.includes('decision is required')));
  assert.ok(mutate((copy) => { copy.promotions[1].id = copy.promotions[0].id; }).some((error) => error.includes('duplicates')));
  assert.ok(mutate((copy) => { copy.promotions[0].source.type = 'transcript'; }).some((error) => error.includes('source.type is invalid')));
  assert.ok(mutate((copy) => { copy.promotions[0].source.ref = '/Users/alice/private-run'; }).some((error) => error.includes('workstation-specific')));
  assert.ok(mutate((copy) => {
    copy.promotions[0].decision.status = 'proposed';
    copy.promotions[0].positive_fixtures = ['missing-even-when-not-adopted'];
  }).some((error) => error.includes('unknown fixture')));
});

test('factory learning baseline prevents silent deletion, rejection or fixture removal', () => {
  const valid = readData(path.join(root, 'doc/_meta/factory-learning.yaml'));
  const mutate = (change) => {
    const copy = JSON.parse(JSON.stringify(valid));
    change(copy);
    return validateLearningLedger(copy);
  };
  assert.ok(mutate((copy) => { copy.promotions = []; }).some((error) => error.includes('must not be empty')));
  assert.ok(mutate((copy) => { copy.promotions.splice(0, 1); }).some((error) => error.includes('baseline promotion FACTORY-LEARN-001 is missing')));
  assert.ok(mutate((copy) => { copy.promotions[0].decision.status = 'rejected'; }).some((error) => error.includes('changed without a typed amendment')));
  assert.ok(mutate((copy) => { copy.promotions[0].positive_fixtures = []; }).some((error) => error.includes('changed without a typed amendment')));
  assert.ok(mutate((copy) => { copy.baseline.sha256 = '0'.repeat(64); }).some((error) => error.includes('does not match')));
});

test('a coordinated ledger, baseline and fixture deletion is rejected against published history', () => {
  const publishedLearning = readData(path.join(root, 'doc/_meta/factory-learning.yaml'));
  const currentLearning = JSON.parse(JSON.stringify(publishedLearning));
  const currentCatalog = JSON.parse(JSON.stringify(catalog));
  const removed = currentLearning.promotions.shift();
  currentCatalog.learning_baseline.required_promotions = currentCatalog.learning_baseline.required_promotions
    .filter((promotion) => promotion.id !== removed.id);
  const removedFixtureIds = new Set([...removed.positive_fixtures, ...removed.negative_fixtures]);
  currentCatalog.fixtures = currentCatalog.fixtures.filter((fixture) => !removedFixtureIds.has(fixture.id));
  currentLearning.baseline.sha256 = canonicalHash(currentCatalog.learning_baseline);

  assert.deepEqual(
    validateLearningLedger(currentLearning, currentCatalog, currentCatalog.learning_baseline),
    [],
    'the self-consistent current snapshot alone cannot detect a coordinated deletion',
  );
  assert.ok(
    validateLearningHistory(currentLearning, publishedLearning, currentCatalog, catalog)
      .some((error) => error.includes(`published promotion ${removed.id} was removed`)),
  );
});

test('published learning compares full provenance and rejects reuse of an old amendment', () => {
  const published = readData(path.join(root, 'doc/_meta/factory-learning.yaml'));
  const firstChange = JSON.parse(JSON.stringify(published));
  firstChange.promotions[0].decision.rationale = 'Updated rationale with an explicit published amendment.';
  firstChange.promotions[0].decision.amendment = {
    id: 'FACTORY-AMEND-900',
    approved_by: 'operator-ref',
    approved_at: '2026-08-26T10:00:00Z',
    reason: 'Correct the published decision rationale.',
    previous_status: 'adopted',
    fixture_disposition: 'retained',
  };
  assert.deepEqual(validateLearningHistory(firstChange, published), []);

  const secondChange = JSON.parse(JSON.stringify(firstChange));
  secondChange.promotions[0].observed_failure = 'A second published provenance rewrite.';
  assert.ok(
    validateLearningHistory(secondChange, firstChange)
      .some((error) => error.includes('must use a new amendment id')),
  );
});

test('factory learning preserves every promotion and fixture binding from the requested published revision', () => {
  if (!historyBaselineRef && !historyBaselineRoot) {
    assert.equal(
      requireHistoryBaseline,
      false,
      '--require-history-baseline requires --baseline-ref <published-commit> or FACTORY_LEARNING_BASELINE_REF',
    );
    return;
  }
  const published = historyBaselineRoot
    ? loadPublishedLearningRoot(historyBaselineRoot, historyBaselineSha)
    : loadPublishedLearning(historyBaselineRef);
  if (published.bootstrap) {
    assert.equal(
      published.learning,
      null,
      `published revision ${published.ref} must either contain both learning files or neither during initial adoption`,
    );
    return;
  }
  const current = readData(path.join(root, 'doc/_meta/factory-learning.yaml'));
  assert.deepEqual(
    validateLearningHistory(current, published.learning, catalog, published.catalog),
    [],
    `factory learning changed incompatibly since published revision ${published.ref}`,
  );
});

test('published baseline checkout is bound to its exact HEAD and rejects symlink substitution', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-learning-baseline-'));
  try {
    fs.mkdirSync(path.join(temporary, 'doc/_meta'), { recursive: true });
    fs.mkdirSync(path.join(temporary, 'scripts/factory-fixtures'), { recursive: true });
    fs.copyFileSync(path.join(root, 'doc/_meta/factory-learning.yaml'), path.join(temporary, 'doc/_meta/factory-learning.yaml'));
    fs.copyFileSync(path.join(root, 'scripts/factory-fixtures/catalog.json'), path.join(temporary, 'scripts/factory-fixtures/catalog.json'));
    runGit(['init', '--quiet'], temporary);
    runGit(['config', 'user.email', 'factory@example.invalid'], temporary);
    runGit(['config', 'user.name', 'Factory fixture'], temporary);
    runGit(['add', '.'], temporary);
    runGit(['commit', '--quiet', '-m', 'published learning baseline'], temporary);
    const head = runGit(['rev-parse', 'HEAD'], temporary).trim();
    assert.equal(loadPublishedLearningRoot(temporary, head).ref, head);
    assert.throws(() => loadPublishedLearningRoot(temporary, 'f'.repeat(40)), /does not equal expected/);

    const learningFile = path.join(temporary, 'doc/_meta/factory-learning.yaml');
    fs.unlinkSync(learningFile);
    fs.symlinkSync(path.join(temporary, 'scripts/factory-fixtures/catalog.json'), learningFile);
    assert.throws(() => loadPublishedLearningRoot(temporary, head), /symbolic link/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

if (!process.env.FACTORY_LEARNING_FIXTURE_CHILD) {
  test('every learning catalogue fixture actually executes and passes by exact name', () => {
    assert.deepEqual(executeCatalogFixtures(catalog, controllerRoot), []);
  });

  test('learning fixture execution rejects a skipped test even when its source and process exit look valid', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-learning-skip-'));
    try {
      fs.writeFileSync(path.join(temporary, 'skipped.mjs'), [
        "import { test } from 'node:test';",
        "test('critical-learning-check', { skip: true }, () => {});",
        '',
      ].join('\n'));
      const skippedCatalog = {
        version: 1,
        fixtures: [{
          id: 'skipped-learning-fixture',
          polarity: 'negative',
          test_file: 'skipped.mjs',
          test_name: 'critical-learning-check',
        }],
      };
      const skippedErrors = executeCatalogFixtures(
        skippedCatalog,
        temporary,
        new Map([['skipped.mjs', { nativeNodeTest: true, args: [] }]]),
      );
      assert.ok(skippedErrors.some((error) => error.includes('reported not-passed')), JSON.stringify(skippedErrors));
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}

if (!contractOnly) {
  test('the shipped specification template is a real V3 package without legacy dual truth', () => {
    const template = path.join(root, 'doc/spec/template');
    assert.deepEqual(validateFactoryPackageV3(template), []);
    assert.equal(fs.existsSync(path.join(template, 'technical-plan.yaml')), false);
    assert.equal(fs.existsSync(path.join(template, 'factory-state.yaml')), false);
  });

  test('the shipped Playwright scaffold satisfies the static replay policy', () => {
    const files = [
      '.github/templates/software-factory/acceptance/playwright.config.mjs',
      '.github/templates/software-factory/acceptance/tests/feature.spec.mjs',
    ];
    for (const file of files) {
      const findings = validatePlaywrightSource(fs.readFileSync(path.join(root, file), 'utf8'), { file });
      assert.deepEqual(findings, []);
    }
  });

  test('the Playwright policy rejects fixed waits and persistent human profiles', () => {
    const unsafe = `
      await page.waitForTimeout(2500);
      await chromium.launchPersistentContext('/Users/operator/profile', { args: ['--user-data-dir=profile'] });
    `;
    const codes = new Set(validatePlaywrightSource(unsafe).map((finding) => finding.code));
    assert.deepEqual(codes, new Set(['playwright-fixed-wait', 'playwright-persistent-human-profile']));
  });
}
