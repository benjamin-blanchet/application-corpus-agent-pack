#!/usr/bin/env node

// Execute one repository-owned, unprivileged FACTORY_CI check operation in an
// environment-scrubbed child process. This is an ordinary application CI
// helper, not a host sandbox and never part of the pull_request_target policy.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseArgs,
  printResult,
  resolveContainedRegularFile,
  sha256File,
} from './lib/factory-delivery/core.mjs';
import { readData } from './lib/factory-delivery/files.mjs';
import { executeOperation, operationContractDigest } from './lib/factory-delivery/operations.mjs';
import { validateFactoryCi } from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = fs.realpathSync(path.resolve(args.root || process.cwd()));

try {
  if (!args.ci) throw new Error('--ci is required');
  const checkId = String(args.check || 'factory-application-ci');
  const ciFile = resolveContainedRegularFile(root, path.resolve(root, String(args.ci))).absolute;
  const ci = readData(ciFile);
  const findings = validateFactoryCi(ci, { file: args.ci, root, checkPipelineFile: true });
  if (findings.length) {
    printResult({ title: 'Factory CI check', summary: { findings: findings.length }, findings }, args.json === true);
    process.exit(2);
  }
  const check = (ci.checks || []).find((candidate) => candidate.id === checkId);
  if (!check) throw new Error(`CI check ${checkId} is not declared`);
  if (check.required !== true) throw new Error(`CI check ${checkId} must be required`);
  if (check.secret_access !== 'none') throw new Error(`CI check ${checkId} must not receive secrets in the policy job`);
  const operation = ci.operations?.[check.operation];
  if (!operation) throw new Error(`CI check ${checkId} references unknown operation ${String(check.operation)}`);
  if (operation.privilege !== 'unprivileged') throw new Error(`CI check ${checkId} operation must be unprivileged`);

  const allowedEnvironment = ['PATH', 'CI', 'SystemRoot'];
  const env = Object.fromEntries(allowedEnvironment
    .filter((name) => Object.hasOwn(process.env, name))
    .map((name) => [name, process.env[name]]));
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-policy-operation-'));
  env.HOME = isolatedHome;
  env.TMPDIR = isolatedHome;
  env.TMP = isolatedHome;
  env.TEMP = isolatedHome;
  let result;
  try {
    result = executeOperation(ci, check.operation, {
      cwd: root,
      env,
      dryRun: false,
      allowedSideEffects: ['none', 'build'],
    });
  } finally {
    fs.rmSync(isolatedHome, { recursive: true, force: true });
  }
  const receipt = {
    schema_version: 1,
    check_id: check.id,
    ci_contract_sha256: sha256File(ciFile),
    operation_contract_sha256: operationContractDigest(operation),
    operation: result,
  };
  printResult({
    title: 'Factory CI check',
    summary: { check: check.id, operation: check.operation, outcome: result.outcome },
    receipt: args.json === true ? receipt : undefined,
    findings: result.outcome === 'pass' ? [] : [{ severity: 'P0', code: 'factory-ci-operation-failed', message: `${check.operation} exited ${result.exit_code}` }],
  }, args.json === true);
  process.exit(result.outcome === 'pass' ? 0 : 2);
} catch (error) {
  printResult({ title: 'Factory CI check', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-ci-check-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
