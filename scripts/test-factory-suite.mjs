#!/usr/bin/env node

// Portable Factory regression runner. This file is shipped by `sync` and uses
// only Node plus pack-owned scripts; it intentionally never dispatches the
// consumer application's package.json scripts. Application verification is a
// separate, repository-owned FACTORY_CI operation.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { minimalChildEnvironment } from './lib/factory-v3/child-environment.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const learningCatalog = JSON.parse(fs.readFileSync(path.join(root, 'scripts/factory-fixtures/catalog.json'), 'utf8'));

function argumentValue(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1] || null;
  const prefixed = process.argv.find((value) => value.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

function realSubjectRoot(value) {
  if (!value) return root;
  const requested = path.resolve(value);
  const resolved = fs.realpathSync(requested);
  if (requested !== resolved || !fs.statSync(resolved).isDirectory()) {
    throw new Error('--subject-root must be a real directory without symbolic-link indirection');
  }
  return resolved;
}

let subjectRoot;
let baselineRoot = null;
let baselineSha = null;
try {
  subjectRoot = realSubjectRoot(argumentValue('--subject-root'));
  const requestedBaselineRoot = argumentValue('--baseline-root');
  baselineSha = argumentValue('--baseline-sha');
  if (Boolean(requestedBaselineRoot) !== Boolean(baselineSha)) {
    throw new Error('--baseline-root and --baseline-sha must be supplied together');
  }
  if (requestedBaselineRoot) {
    baselineRoot = realSubjectRoot(requestedBaselineRoot);
    if (baselineRoot === subjectRoot || baselineRoot === root) {
      throw new Error('controller, subject and published baseline roots must be disjoint');
    }
    if (!/^[a-f0-9]{40}$/.test(baselineSha)) throw new Error('--baseline-sha must be a full lowercase Git SHA');
  }
} catch (error) {
  process.stderr.write(`not ok - Factory suite subject: ${error.message}\n`);
  process.exit(1);
}
const suite = [
  {
    id: 'runtime-source-contracts',
    argv: ['scripts/test-runtime-sources.mjs', '--portable', '--root', subjectRoot],
  },
  {
    id: 'factory-control-regressions',
    argv: ['scripts/test-factory-v3.mjs'],
  },
  {
    id: 'factory-validator-self-tests',
    argv: ['scripts/validate-factory.mjs', '--self-test', '--json'],
  },
  {
    id: 'delivery-template-contracts',
    argv: ['scripts/validate-delivery.mjs', '--root', subjectRoot, '--lint-template', '--allow-unadopted-workflows', '--json'],
  },
  {
    id: 'factory-learning-contract',
    argv: [
      'scripts/test-factory-learning.mjs', '--root', subjectRoot, '--contract-only',
      ...(baselineRoot ? ['--baseline-root', baselineRoot, '--baseline-sha', baselineSha, '--require-history-baseline'] : []),
    ],
  },
];

if (process.argv.includes('--list')) {
  process.stdout.write(`${JSON.stringify({
    runner: 'factory-suite-v1',
    suite,
    learning_fixtures: learningCatalog.fixtures.map(({ id, polarity, test_file, test_name }) => ({ id, polarity, test_file, test_name })),
  }, null, 2)}\n`);
  process.exit(0);
}

let failed = 0;
for (const entry of suite) {
  const script = path.resolve(root, entry.argv[0]);
  const relative = path.relative(root, script);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(script)
    || fs.lstatSync(script).isSymbolicLink() || !fs.statSync(script).isFile()) {
    process.stderr.write(`not ok - ${entry.id}: pack-owned script is missing or unsafe\n`);
    failed += 1;
    continue;
  }
  const execution = spawnSync(process.execPath, [script, ...entry.argv.slice(1)], {
    cwd: root,
    encoding: 'utf8',
    env: minimalChildEnvironment(entry.env || {}),
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });
  if (execution.stdout) process.stdout.write(execution.stdout);
  if (execution.stderr) process.stderr.write(execution.stderr);
  if (execution.error || execution.status !== 0) {
    process.stderr.write(`not ok - ${entry.id}: exit=${String(execution.status)}${execution.error ? ` ${execution.error.message}` : ''}\n`);
    failed += 1;
  } else {
    process.stdout.write(`ok - ${entry.id}\n`);
  }
}

if (failed) {
  process.stderr.write(`${failed}/${suite.length} Factory suite checks failed\n`);
  process.exit(1);
}
process.stdout.write(`${suite.length}/${suite.length} Factory suite checks passed\n`);
