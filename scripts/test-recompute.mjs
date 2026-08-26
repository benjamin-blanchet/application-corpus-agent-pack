#!/usr/bin/env node

// Regression tests for scripts/recompute-corpus-state.mjs.
// Every fixture lives in a temporary repository so the pack's live corpus is
// never mutated by the suite.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const recomputeScript = path.join(here, 'recompute-corpus-state.mjs');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-recompute-tests-'));

let failed = 0;
let ran = 0;

function write(root, rel, content = '') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function initialState() {
  return [
    'corpus:',
    "  pack_version: '0.9.0'",
    '  custom_operator_field: keep-me',
    'corpus_inventory:',
    '  bugs: {}',
    '  risks: {}',
    '  features: {}',
    '  apis: {}',
    '  batches: {}',
    '  screens: {}',
    '  production_signals:',
    '    SIGNAL-KEEP: doc/prod/signals/keep.md',
    'custom_top_level:',
    '  nested: keep-too',
    '',
  ].join('\n');
}

function runRecompute(root, mode) {
  const result = spawnSync(process.execPath, [recomputeScript, mode, '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`recompute ${mode} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`recompute ${mode} returned invalid JSON\n${result.stdout}\n${result.stderr}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, expected) {
  assert(text.includes(expected), `missing expected text: ${expected}`);
}

function assertNotIncludes(text, forbidden) {
  assert(!text.includes(forbidden), `unexpected text present: ${forbidden}`);
}

function test(name, fn) {
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

function makeFixture(name) {
  const root = path.join(tmpRoot, name);
  fs.mkdirSync(root, { recursive: true });
  write(root, 'doc/_meta/corpus-state.yaml', initialState());
  return root;
}

test('folder-shaped-inventories-dry-run-apply-idempotence', () => {
  const root = makeFixture('folder-shaped');
  write(root, 'doc/project/features/checkout/README.md', '# Checkout\n');
  write(root, 'doc/project/features/incomplete/ARCHITECTURE.md', '# No README\n');
  write(root, 'doc/project/features/loose-note.md', '# Not an object when folders exist\n');
  write(root, 'doc/project/apis/direct/README.md', '# Direct API\n');
  write(root, 'doc/project/apis/rest/payments/README.md', '# Payments\n');
  write(root, 'doc/project/batchs/nightly/README.md', '# Nightly\n');
  write(root, 'doc/project/screens/admin/README.md', '# Admin\n');
  write(root, 'doc/prod/known-bugs/BUG-001-timeout.md', '# Bug\n');
  write(root, 'doc/prod/structural-risks/RISK-002-coupling.md', '# Risk\n');

  const statePath = path.join(root, 'doc/_meta/corpus-state.yaml');
  const before = fs.readFileSync(statePath, 'utf8');
  const dry = runRecompute(root, '--dry-run');
  assert(dry.changed === true, 'first dry-run should report pending changes');
  assert(fs.readFileSync(statePath, 'utf8') === before, 'dry-run mutated corpus-state.yaml');

  const applied = runRecompute(root, '--apply');
  assert(applied.changed === true, 'apply should report changes');
  const after = fs.readFileSync(statePath, 'utf8');

  assertIncludes(after, 'BUG-001: doc/prod/known-bugs/BUG-001-timeout.md');
  assertIncludes(after, 'RISK-002: doc/prod/structural-risks/RISK-002-coupling.md');
  assertIncludes(after, 'checkout: doc/project/features/checkout/README.md');
  assertIncludes(after, 'direct: doc/project/apis/direct/README.md');
  assertIncludes(after, 'rest/payments: doc/project/apis/rest/payments/README.md');
  assertIncludes(after, 'nightly: doc/project/batchs/nightly/README.md');
  assertIncludes(after, 'admin: doc/project/screens/admin/README.md');
  assertNotIncludes(after, 'incomplete:');
  assertNotIncludes(after, 'loose-note:');
  assertIncludes(after, "pack_version: '0.9.0'");
  assertIncludes(after, 'custom_operator_field: keep-me');
  assertIncludes(after, 'SIGNAL-KEEP: doc/prod/signals/keep.md');
  assertIncludes(after, 'nested: keep-too');

  const secondDry = runRecompute(root, '--dry-run');
  assert(secondDry.changed === false, 'second dry-run should be idempotent');
  assert(fs.readFileSync(statePath, 'utf8') === after, 'idempotent dry-run changed file bytes');
});

test('flat-file-inventories-and-reserved-docs', () => {
  const root = makeFixture('flat-shaped');
  write(root, 'doc/project/features/checkout.md', '# Checkout\n');
  write(root, 'doc/project/features/README.md', '# Zone\n');
  write(root, 'doc/project/features/CATALOG.md', '# Catalog\n');
  write(root, 'doc/project/features/_private.md', '# Private\n');
  write(root, 'doc/project/features/feature-template.md', '# Template\n');
  write(root, 'doc/project/apis/payments.md', '# Payments\n');
  write(root, 'doc/project/batches/nightly.md', '# Nightly\n');
  write(root, 'doc/project/screens/admin.md', '# Admin\n');

  runRecompute(root, '--apply');
  const state = fs.readFileSync(path.join(root, 'doc/_meta/corpus-state.yaml'), 'utf8');
  assertIncludes(state, 'checkout: doc/project/features/checkout.md');
  assertIncludes(state, 'payments: doc/project/apis/payments.md');
  assertIncludes(state, 'nightly: doc/project/batches/nightly.md');
  assertIncludes(state, 'admin: doc/project/screens/admin.md');
  assertNotIncludes(state, 'README:');
  assertNotIncludes(state, 'CATALOG:');
  assertNotIncludes(state, '_private:');
  assertNotIncludes(state, 'feature-template:');
});

test('bom-crlf-state-is-readable-and-idempotent', () => {
  const root = makeFixture('bom-crlf-state');
  const statePath = path.join(root, 'doc/_meta/corpus-state.yaml');
  const portableState = initialState().replace(
    '  custom_operator_field: keep-me\n',
    '  indexes_initialized: false\n  custom_operator_field: keep-me\n',
  );
  fs.writeFileSync(statePath, `\uFEFF${portableState.replace(/\n/g, '\r\n')}`);
  write(root, 'doc/_indexes/by-feature.md', [
    '| Feature | Canonical file |',
    '|---|---|',
    '| checkout | doc/project/features/checkout/README.md |',
    '',
  ].join('\r\n'));

  const dry = runRecompute(root, '--dry-run');
  assert(dry.changes.some((change) => change.field === 'corpus.indexes_initialized'), 'BOM hid corpus.indexes_initialized drift');

  const applied = runRecompute(root, '--apply');
  assert(applied.changed === true, 'portable state apply should report changes');
  const state = fs.readFileSync(statePath, 'utf8');
  assert(state.charCodeAt(0) !== 0xfeff, 'written state should not retain a transport BOM');
  assert(!state.includes('\r'), 'written state should use canonical LF endings');
  assertIncludes(state, 'indexes_initialized: true');
  assertIncludes(state, 'custom_operator_field: keep-me');

  const secondDry = runRecompute(root, '--dry-run');
  assert(secondDry.changed === false, 'portable state should be idempotent after apply');
});

function extractSet(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert(match, `could not locate ${name}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

test('owned-allowlists-are-documented-by-skill-and-persona', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/recompute-corpus-state.mjs'), 'utf8');
  const corpusFields = extractSet(source, 'OWNED_CORPUS_FIELDS');
  const inventoryKeys = extractSet(source, 'OWNED_INVENTORY_KEYS');
  const docs = [
    '.github/skills/continuous/corpus-run/SKILL.md',
    '.github/agents/corpus.agent.md',
  ];
  for (const rel of docs) {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    for (const field of [...corpusFields, ...inventoryKeys]) {
      assert(text.includes(`\`${field}\``), `${rel} does not document owned key ${field}`);
    }
  }
});

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n${ran - failed}/${ran} passing`);
process.exit(failed > 0 ? 1 : 0);
