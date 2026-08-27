#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const materializer = path.join(here, 'materialize-corpus-section.mjs');
const validator = path.join(here, 'validate-corpus.mjs');
let failed = 0;
let ran = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function write(root, relative, content) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function makeConsumer() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-minimal-')));
  fs.cpSync(path.join(repoRoot, '.github/templates/corpus-sections'), path.join(root, '.github/templates/corpus-sections'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
  fs.copyFileSync(materializer, path.join(root, 'scripts/materialize-corpus-section.mjs'));
  fs.copyFileSync(path.join(here, 'lib/corpus-sections.mjs'), path.join(root, 'scripts/lib/corpus-sections.mjs'));
  const frontmatter = (type) => `---\ntype: ${type}\nstatus: draft\nconfidence: unknown\nsource: pack\nlast_validated:\n---\n\n`;
  write(root, 'doc/README.md', `${frontmatter('corpus-root')}# Corpus\n`);
  write(root, 'doc/CORPUS_MAP.md', `${frontmatter('corpus-map')}# Corpus map\n`);
  write(root, 'doc/CORPUS_MANIFEST.md', `${frontmatter('corpus-manifest')}# Corpus manifest\n`);
  write(root, 'doc/_meta/corpus-state.yaml', 'corpus:\n  phase: pack_copied\n  operating_mode: continuous_enrichment\n  code_analysis_status: not_started\n  actionable_readiness_status: not_started\n  indexes_initialized: false\n');
  write(root, 'doc/_meta/code-pipeline-state.yaml', 'pipeline:\n  overall_status: not_started\n');
  return root;
}

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
}

function validate(root) {
  const result = run(validator, ['--root', root, '--json'], repoRoot);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(result.stderr || result.stdout || `validator exited ${result.status}`);
  }
  return { result, report };
}

test('minimal-consumer-validates-without-p0', () => {
  const root = makeConsumer();
  try {
    const { result, report } = validate(root);
    assert(result.status === 0, JSON.stringify(report.findings.filter((finding) => finding.severity === 'P0')));
    assert(report.summary.counts.P0 === 0, 'minimal corpus produced a P0');
    assert(!report.findings.some((finding) => finding.code.includes('demo')), 'validator still contains a demo finding');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('section-materialization-is-offline-idempotent-and-declared', () => {
  const root = makeConsumer();
  try {
    const first = run(materializer, ['apis', '--root', root, '--json'], repoRoot);
    assert(first.status === 0, first.stderr || first.stdout);
    const firstReport = JSON.parse(first.stdout);
    assert(firstReport.created.length === 3, `expected 3 created files, got ${firstReport.created.length}`);
    assert(fs.existsSync(path.join(root, 'doc/project/apis/CATALOG.md')), 'API catalog was not materialized');
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'doc/_meta/materialized-sections.json'), 'utf8'));
    assert(registry.sections.apis.files.length === 3, 'API section declaration is incomplete');

    const second = run(materializer, ['apis', '--root', root, '--json'], repoRoot);
    assert(second.status === 0, second.stderr || second.stdout);
    const secondReport = JSON.parse(second.stdout);
    assert(secondReport.created.length === 0 && secondReport.unchanged.length === 3, 'repeat materialization was not idempotent');

    const { result, report } = validate(root);
    assert(result.status === 0, JSON.stringify(report.findings.filter((finding) => finding.severity === 'P0')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('declared-files-are-required-and-project-content-is-never-overwritten', () => {
  const root = makeConsumer();
  try {
    const initial = run(materializer, ['incidents', '--root', root, '--json'], repoRoot);
    assert(initial.status === 0, initial.stderr || initial.stdout);
    const target = path.join(root, 'doc/prod/incidents/README.md');
    fs.rmSync(target);
    const missing = validate(root);
    assert(missing.result.status === 1, 'missing declared file did not fail validation');
    assert(missing.report.findings.some((finding) => finding.code === 'declared-section-file-missing'), 'missing declared section file was not reported');

    fs.writeFileSync(target, 'project-owned incident guidance\n');
    const conflict = run(materializer, ['incidents', '--root', root, '--json'], repoRoot);
    assert(conflict.status === 1, 'materializer overwrote project-owned content');
    assert(fs.readFileSync(target, 'utf8') === 'project-owned incident guidance\n', 'conflicting content changed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\n${ran - failed}/${ran} passing`);
process.exitCode = failed > 0 ? 1 : 0;
