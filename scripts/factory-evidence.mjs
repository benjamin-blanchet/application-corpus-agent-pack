#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { exitCodeFor, parseArgs, printResult, sha256File } from './lib/factory-delivery/core.mjs';
import { assembleEvidence } from './lib/factory-delivery/evidence.mjs';
import { readData, writeData } from './lib/factory-delivery/files.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());

try {
  if (args['source-digest']) throw new Error('--source-digest is not accepted; provenance is computed from the exact Git revision');
  for (const required of ['plan', 'environment', 'ci', 'observation', 'results', 'artifacts-root', 'subject-sha', 'out']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const planFile = path.resolve(root, args.plan);
  const environmentFile = path.resolve(root, args.environment);
  const ciFile = path.resolve(root, args.ci);
  const observationFile = path.resolve(root, args.observation);
  const resultsFile = path.resolve(root, args.results);
  const artifactsRoot = path.resolve(root, args['artifacts-root']);
  const ci = readData(ciFile);
  const publicationMode = args['publication-mode'] || 'ci_artifact';
  if (publicationMode === 'ci_artifact') for (const required of ['ci-run-id', 'ci-artifact-id', 'ci-artifact-url', 'junit', 'html-report']) if (!args[required]) throw new Error(`--${required} is required for ci_artifact publication`);
  const supportingArtifacts = [resultsFile];
  if (publicationMode === 'ci_artifact') {
    const junit = path.resolve(root, args.junit);
    const htmlReport = path.resolve(root, args['html-report']);
    if (!fs.existsSync(junit) || !fs.statSync(junit).isFile()) throw new Error('--junit must identify a generated file');
    if (!fs.existsSync(htmlReport) || !fs.statSync(htmlReport).isDirectory()) throw new Error('--html-report must identify a generated directory');
    supportingArtifacts.push(junit);
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`HTML report contains a symbolic link: ${child}`);
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) supportingArtifacts.push(child);
      }
    };
    visit(htmlReport);
  }
  const observation = readData(observationFile);
  if (observation.ci_contract_digest !== sha256File(ciFile)) throw new Error('environment observation was not produced from the supplied CI contract');
  const { manifest, findings } = assembleEvidence({
    plan: readData(planFile),
    environment: readData(environmentFile),
    ci,
    observation,
    results: readData(resultsFile),
    artifactsRoot,
    repository: root,
    subjectSha: args['subject-sha'],
    baseSha: args['base-sha'] || null,
    specPackage: args['spec-package'] || path.dirname(args.plan),
    environmentContractPath: environmentFile,
    acceptancePlanPath: planFile,
    publication: publicationMode === 'ci_artifact' ? {
      mode: 'ci_artifact',
      ci_run_id: args['ci-run-id'],
      artifact_id: args['ci-artifact-id'],
      artifact_url: args['ci-artifact-url'],
      retention_days: ci?.artifacts?.retention_days,
    } : {
      mode: 'evidence_only_commit',
      evidence_commit_sha: args['evidence-commit-sha'] || null,
    },
    supportingArtifacts,
  });
  writeData(path.resolve(root, args.out), manifest);
  printResult({
    title: 'Factory evidence assembly',
    summary: { verdict: manifest.verdict, findings: findings.length, artifacts: manifest.artifacts.length },
    manifest: args.json === true ? manifest : undefined,
    findings,
  }, args.json === true);
  process.exit(exitCodeFor(findings));
} catch (error) {
  printResult({ title: 'Factory evidence assembly', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-evidence-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
