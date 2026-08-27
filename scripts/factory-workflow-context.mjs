#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  SHA_PATTERN,
  isWithin,
  parseArgs,
  printResult,
  resolveContainedDirectory,
  resolveContainedRegularFile,
} from './lib/factory-delivery/core.mjs';
import { readData } from './lib/factory-delivery/files.mjs';
import { currentHead } from './lib/factory-delivery/provenance.mjs';
import { validateFactoryCi } from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));

function realDirectory(value, label) {
  if (!value) throw new Error(`--${label} is required`);
  try {
    const requested = path.resolve(value);
    const resolved = resolveContainedDirectory(requested, requested).absolute;
    if (requested !== resolved) throw new Error('the checkout path contains a symbolic-link ancestor');
    return resolved;
  } catch (error) {
    throw new Error(`${label} must be a real directory without symbolic links: ${error.message}`);
  }
}

function assertIndependentRoots(controllerRoot, candidateRoot) {
  if (isWithin(controllerRoot, candidateRoot) || isWithin(candidateRoot, controllerRoot)) {
    throw new Error('controller and candidate roots must be disjoint checkouts');
  }
}

function assertRevision(root, revision, label) {
  const expected = String(revision || '').toLowerCase();
  if (!SHA_PATTERN.test(expected)) throw new Error(`${label} must be a full 40-hex SHA`);
  if (currentHead(root) !== expected) throw new Error(`${label} does not match the checked-out revision`);
}

function appendWorkflowOutput(file, key, value) {
  const absolute = path.resolve(file || '');
  if (!file || (fs.existsSync(absolute) && (fs.lstatSync(absolute).isSymbolicLink() || !fs.statSync(absolute).isFile()))) {
    throw new Error('--github-output must identify a regular GitHub Actions output file');
  }
  fs.appendFileSync(absolute, `${key}=${value}\n`, { encoding: 'utf8', mode: 0o600 });
}

try {
  const controllerRoot = realDirectory(args['controller-root'], 'controller-root');
  const candidateRoot = realDirectory(args['candidate-root'], 'candidate-root');
  assertIndependentRoots(controllerRoot, candidateRoot);
  assertRevision(controllerRoot, args['controller-sha'], 'controller-sha');
  assertRevision(candidateRoot, args['candidate-sha'], 'candidate-sha');

  let retentionDays = null;
  if (args.ci || args['github-output']) {
    if (!args.ci || !args['github-output']) throw new Error('--ci and --github-output must be supplied together');
    const ciFile = resolveContainedRegularFile(candidateRoot, path.resolve(candidateRoot, args.ci)).absolute;
    const ci = readData(ciFile);
    const findings = validateFactoryCi(ci, {
      file: path.relative(candidateRoot, ciFile),
      root: candidateRoot,
      checkPipelineFile: true,
    });
    if (findings.length) throw new Error(`selected CI contract is invalid: ${findings.map((item) => item.code).join(', ')}`);
    retentionDays = ci.artifacts.retention_days;
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) {
      throw new Error('selected CI artifact retention must be an integer between 1 and 90 days');
    }
    appendWorkflowOutput(args['github-output'], 'retention_days', retentionDays);
  }

  printResult({
    title: 'Factory protected workflow context',
    summary: {
      controller_sha: currentHead(controllerRoot),
      candidate_sha: currentHead(candidateRoot),
      retention_days: retentionDays ?? 'not_requested',
    },
    findings: [],
  }, args.json === true);
} catch (error) {
  printResult({
    title: 'Factory protected workflow context',
    summary: { internal: 1 },
    findings: [{ severity: 'P0', code: 'factory-workflow-context-invalid', message: error.message }],
  }, args.json === true);
  process.exit(1);
}
