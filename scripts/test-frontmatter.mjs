#!/usr/bin/env node

// Cross-consumer regression tests for portable YAML frontmatter handling.
// Fixtures are generated at runtime so Git line-ending conversion cannot
// erase the CRLF and BOM cases this suite is meant to protect.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildOkf, splitFrontmatter } from './lib/okf.mjs';
import { normalizeText } from './lib/text.mjs';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEXT_HELPER = path.join(SCRIPT_ROOT, 'lib/text.mjs');
const MAX_BUFFER = 64 * 1024 * 1024;

function variants(text) {
  const crlf = text.replace(/\n/g, '\r\n');
  return [
    ['LF', text],
    ['CRLF', crlf],
    ['BOM+LF', `\uFEFF${text}`],
    ['BOM+CRLF', `\uFEFF${crlf}`],
  ];
}

function withTempDir(label, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `corpus-${label}-`));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFile(root, rel, content) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function runNode(script, args = [], options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
}

function assertSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

function parseJsonOutput(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    assert.fail(`${label} did not emit JSON\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function copyRootBoundScript(root, name) {
  const scriptTarget = path.join(root, 'scripts', name);
  const helperTarget = path.join(root, 'scripts/lib/text.mjs');
  fs.mkdirSync(path.dirname(helperTarget), { recursive: true });
  fs.copyFileSync(path.join(SCRIPT_ROOT, name), scriptTarget);
  fs.copyFileSync(TEXT_HELPER, helperTarget);
  return scriptTarget;
}

const TESTS = [];
function test(name, run) {
  TESTS.push({ name, run });
}

const BASE_DOCUMENT = [
  '---',
  'type: portable-fixture',
  'status: active',
  'confidence: confirmed',
  'source: code',
  'title: PortableSentinel',
  '---',
  '# Neutral heading',
  '',
  'A body without the search sentinel.',
  '',
].join('\n');

test('shared normalizer canonicalizes every supported variant', () => {
  for (const [name, input] of variants(BASE_DOCUMENT)) {
    const normalized = normalizeText(input);
    assert.equal(normalized, BASE_DOCUMENT, name);
    assert.equal(normalizeText(normalized), BASE_DOCUMENT, `${name} idempotence`);
  }
  assert.equal(normalizeText('before\uFEFFafter'), 'before\uFEFFafter', 'an embedded BOM is content');
});

test('validator reads portable frontmatter', () => {
  const validator = path.join(SCRIPT_ROOT, 'validate-corpus.mjs');
  for (const [name, input] of variants(BASE_DOCUMENT)) {
    withTempDir('validator', (root) => {
      writeFile(root, 'doc/README.md', input);
      const result = runNode(validator, ['--json'], { cwd: root });
      const report = parseJsonOutput(result, `validator ${name}`);
      const codes = new Set(report.findings.map((finding) => finding.code));
      for (const code of ['missing-frontmatter', 'okf-missing-frontmatter', 'okf-missing-type']) {
        assert.equal(codes.has(code), false, `${name}: unexpected ${code}`);
      }
    });
  }
});

test('OKF parses and backfills every portable variant once', () => {
  for (const [name, input] of variants(BASE_DOCUMENT)) {
    const parsed = splitFrontmatter(input);
    assert.equal(parsed.fm?.title, 'PortableSentinel', `${name}: title`);
    assert.equal(parsed.body, BASE_DOCUMENT.split('---\n').slice(2).join('---\n'), `${name}: body`);

    withTempDir('okf', (root) => {
      const docRoot = path.join(root, 'doc');
      const withoutDerivedFields = input
        .replace(/title: PortableSentinel\r?\n/, '')
        .replace('A body without the search sentinel.', 'Portable fixture description.');
      writeFile(root, 'doc/README.md', withoutDerivedFields);
      const report = buildOkf({ docRoot });
      assert.equal(report.fieldsAdded.length, 1, `${name}: one document backfilled`);
      assert.deepEqual(report.fieldsAdded[0].fields, ['title', 'description'], `${name}: derived fields`);
      const written = fs.readFileSync(path.join(docRoot, 'README.md'), 'utf8');
      assert.equal(written.charCodeAt(0) === 0xfeff, false, `${name}: no BOM after write`);
      assert.equal(written.includes('\r'), false, `${name}: LF after write`);
      assert.equal((written.match(/^---$/gm) || []).length, 2, `${name}: one frontmatter block`);
    });
  }
});

test('corpus loader applies metadata scoring identically', () => {
  const loader = path.join(SCRIPT_ROOT, 'corpus-load.mjs');
  for (const [name, input] of variants(BASE_DOCUMENT)) {
    withTempDir('loader', (root) => {
      const docRoot = path.join(root, 'doc');
      writeFile(root, 'doc/neutral.md', input);
      const result = runNode(loader, [
        '--doc', docRoot,
        '--task', 'portablesentinel',
        '--json',
        '--content',
      ], { cwd: root });
      assertSuccess(result, `loader ${name}`);
      const report = parseJsonOutput(result, `loader ${name}`);
      assert.equal(report.selected.length, 1, `${name}: selected count`);
      assert.equal(report.selected[0].title, 'PortableSentinel', `${name}: title`);
      assert.equal(report.selected[0].content, BASE_DOCUMENT, `${name}: normalized content`);
    });
  }
});

test('dashboard exposes portable feature metadata', () => {
  const dashboard = path.join(SCRIPT_ROOT, 'build-corpus-site.mjs');
  const feature = BASE_DOCUMENT
    .replace('type: portable-fixture', 'type: feature')
    .replace('status: active', 'status: portable-sentinel');

  for (const [name, input] of variants(feature)) {
    withTempDir('dashboard', (root) => {
      const docRoot = path.join(root, 'doc');
      const out = path.join(root, 'dashboard.html');
      writeFile(root, 'doc/project/features/demo/README.md', input);
      const result = runNode(dashboard, ['--doc', docRoot, '--out', out], { cwd: root });
      assertSuccess(result, `dashboard ${name}`);
      const html = fs.readFileSync(out, 'utf8');
      const match = html.match(/<script>window\.__CORPUS__ = ([\s\S]*?);<\/script>/);
      assert.ok(match, `${name}: embedded corpus data`);
      const clientData = JSON.parse(match[1]);
      const detail = clientData.details['feat-demo'];
      assert.equal(detail?.status, 'portable-sentinel', `${name}: status`);
      assert.equal(detail?.source, 'code', `${name}: source`);
      assert.equal(detail?.body.startsWith('---'), false, `${name}: body excludes frontmatter`);
    });
  }
});

test('post-init cleanup detects portable lifecycle metadata', () => {
  const skill = BASE_DOCUMENT
    .replace('type: portable-fixture\n', 'name: portable-cleanup\nlifecycle: init-only\n');

  for (const [name, input] of variants(skill)) {
    withTempDir('cleanup', (root) => {
      const script = copyRootBoundScript(root, 'clean-after-init.mjs');
      writeFile(root, 'PACK_VERSION', '1.1.0\n');
      writeFile(root, '.github/skills/setup/portable-cleanup/SKILL.md', input);
      const result = runNode(script, [], { cwd: root });
      assertSuccess(result, `cleanup ${name}`);
      assert.match(result.stdout, /Init-only skills \(frontmatter\): 1/, `${name}: count`);
      assert.match(result.stdout, /portable-cleanup/, `${name}: target`);
    });
  }
});

test('frontmatter adder never duplicates portable metadata', () => {
  const skill = BASE_DOCUMENT.replace('type: portable-fixture', 'name: portable-skill');
  for (const [name, input] of variants(skill)) {
    withTempDir('frontmatter-adder', (root) => {
      const script = copyRootBoundScript(root, 'add-skill-frontmatter.mjs');
      const target = writeFile(root, '.github/skills/testing/portable-skill/SKILL.md', input);
      const before = fs.readFileSync(target, 'utf8');
      const result = runNode(script, ['--write'], { cwd: root });
      assertSuccess(result, `frontmatter adder ${name}`);
      assert.equal(fs.readFileSync(target, 'utf8'), before, `${name}: byte-equivalent text`);
      assert.match(result.stdout, /with existing frontmatter \(skipped\): 1/, `${name}: skipped`);
      assert.match(result.stdout, /updated: 0/, `${name}: no update`);
    });
  }
});

let failed = 0;
for (const { name, run } of TESTS) {
  try {
    run();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${error.stack || error.message}`);
  }
}

console.log(`\n${TESTS.length - failed}/${TESTS.length} passing`);
process.exitCode = failed ? 1 : 0;
