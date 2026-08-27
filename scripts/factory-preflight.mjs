#!/usr/bin/env node

import path from 'node:path';

import { SHA_PATTERN, exitCodeFor, parseArgs, printResult, sha256File } from './lib/factory-delivery/core.mjs';
import { readData, writeData } from './lib/factory-delivery/files.mjs';
import { runPreflight } from './lib/factory-delivery/operations.mjs';
import { validateEnvironment, validateEnvironmentObservation, validateFactoryCi } from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());
const environmentFile = path.resolve(root, args.environment || 'doc/project/runtime/ENVIRONMENTS.yaml');
const ciFile = path.resolve(root, args.ci || 'doc/project/cicd/FACTORY_CI.yaml');
const subjectSha = String(args['subject-sha'] || '').toLowerCase();

try {
  if (!SHA_PATTERN.test(subjectSha)) throw new Error('--subject-sha must be a full 40-hex commit SHA');
  if (!args['run-id']) throw new Error('--run-id is required');
  const environment = readData(environmentFile);
  const ci = readData(ciFile);
  const contractFindings = [
    ...validateFactoryCi(ci, { file: ciFile }),
    ...validateEnvironment(environment, ci, { file: environmentFile }),
  ];
  if (contractFindings.length) {
    printResult({ title: 'Factory environment preflight', summary: { findings: contractFindings.length }, findings: contractFindings }, args.json === true);
    process.exit(2);
  }
  const profile = environment.profiles.find((candidate) => candidate.id === args.profile);
  const allowedEnvironmentNames = new Set([
    'PATH',
    'SystemRoot',
    profile?.endpoint?.not_applicable === true ? null : profile?.endpoint?.base_url_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_id_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_version_from,
    ...(Array.isArray(profile?.auth?.secret_refs) ? profile.auth.secret_refs : []),
  ].filter(Boolean));
  const operationEnv = Object.fromEntries([...allowedEnvironmentNames].filter((key) => Object.hasOwn(process.env, key)).map((key) => [key, process.env[key]]));
  const observation = runPreflight(environment, ci, args.profile, subjectSha, {
    cwd: root,
    env: operationEnv,
    dryRun: args.execute !== true,
    runId: args['run-id'],
    instanceId: args['instance-id'],
    buildOrImage: args['build-or-image'],
    schemaVersion: args['schema-version'],
    datasetId: args['dataset-id'],
    datasetVersion: args['dataset-version'],
    environmentContractDigest: sha256File(environmentFile),
    ciContractDigest: sha256File(ciFile),
  });
  const findings = validateEnvironmentObservation(observation, { environment, ci });
  if (args.out) writeData(path.resolve(root, args.out), observation);
  const result = {
    title: 'Factory environment preflight',
    summary: { status: observation.status, findings: findings.length, mode: args.execute === true ? 'execute' : 'dry-run' },
    observation,
    findings,
    message: args.execute === true ? null : 'Dry-run only. Pass --execute to run side-effect-free probes.',
  };
  printResult(result, args.json === true);
  process.exit(exitCodeFor(findings));
} catch (error) {
  printResult({ title: 'Factory environment preflight', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-preflight-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
