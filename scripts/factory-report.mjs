#!/usr/bin/env node

import path from 'node:path';

import { exitCodeFor, parseArgs, printResult } from './lib/factory-delivery/core.mjs';
import { readData, writeText } from './lib/factory-delivery/files.mjs';
import { renderEvidenceReport } from './lib/factory-delivery/report.mjs';
import { validateEvidence } from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());

try {
  for (const required of ['manifest', 'plan', 'environment', 'artifacts-root', 'out']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const manifest = readData(path.resolve(root, args.manifest));
  const planFile = path.resolve(root, args.plan);
  const environmentFile = path.resolve(root, args.environment);
  const findings = validateEvidence(manifest, readData(planFile), {
    file: args.manifest,
    artifactsRoot: path.resolve(root, args['artifacts-root']),
    verifyArtifacts: true,
    acceptancePlanFile: planFile,
    environmentContractFile: environmentFile,
    repositoryRoot: root,
  });
  const reportManifest = findings.length ? {
    ...manifest,
    verdict: 'blocked',
    generation_findings: [
      ...(Array.isArray(manifest.generation_findings) ? manifest.generation_findings : []),
      ...findings.map((item) => ({ code: item.code, message: item.message })),
    ],
  } : manifest;
  writeText(path.resolve(root, args.out), renderEvidenceReport(reportManifest));
  printResult({ title: 'Factory acceptance report', summary: { verdict: reportManifest.verdict, findings: findings.length }, findings }, args.json === true);
  process.exit(exitCodeFor(findings));
} catch (error) {
  printResult({ title: 'Factory acceptance report', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-report-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
