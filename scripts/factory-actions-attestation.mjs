#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { SHA_PATTERN, assertRunExecutedAJob, parseArgs, printResult } from './lib/factory-delivery/core.mjs';
import { githubArtifactAttestationRef } from './lib/factory-delivery/authorization.mjs';
import { readData, writeData } from './lib/factory-delivery/files.mjs';

const args = parseArgs(process.argv.slice(2));

function ghJson(endpoint) {
  const result = spawnSync('gh', ['api', endpoint], {
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
    timeout: 120_000,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  if (result.status !== 0) throw new Error(`gh api failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return JSON.parse(result.stdout || '{}');
}

function outputFile(value) {
  const requested = path.resolve(value);
  if (fs.existsSync(requested)) throw new Error('--out must not already exist');
  const parent = fs.realpathSync(path.dirname(requested));
  return path.join(parent, path.basename(requested));
}

export function verifyActionsArtifactObservation({ repository, runId, candidateSha, workflowSha, workflowRef, artifactName, runRecord, jobsResponse, artifactResponse }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('repository must be a canonical owner/name');
  if (!/^\d+$/.test(String(runId || '')) || !SHA_PATTERN.test(candidateSha || '') || !SHA_PATTERN.test(workflowSha || '')) throw new Error('run id, candidate SHA and workflow SHA are invalid');
  if (String(runRecord?.id) !== String(runId)
    || String(runRecord?.head_sha || '').toLowerCase() !== workflowSha.toLowerCase()
    || runRecord?.status !== 'completed'
    || runRecord?.conclusion !== 'success'
    || runRecord?.event !== 'repository_dispatch'
    || runRecord?.path !== workflowRef) throw new Error('GitHub run does not attest the exact successful protected default-branch workflow');
  assertRunExecutedAJob(jobsResponse, 'the protected workflow run');
  const matches = (artifactResponse?.artifacts || []).filter((artifact) => artifact.name === artifactName);
  if (matches.length !== 1) throw new Error('GitHub run must contain exactly one expected artifact');
  const artifact = matches[0];
  if (artifact.expired !== false
    || String(artifact.workflow_run?.id) !== String(runId)
    || !/^\d+$/.test(String(artifact.id || ''))
    || !/^sha256:[0-9a-f]{64}$/i.test(artifact.digest || '')) throw new Error('GitHub artifact identity, lifetime or digest is invalid');
  return {
    schema_version: 2,
    provider: 'github_actions',
    repository,
    workflow_ref: workflowRef,
    run_id: String(runId),
    workflow_sha: workflowSha.toLowerCase(),
    subject_sha: candidateSha.toLowerCase(),
    conclusion: 'success',
    artifact: {
      id: String(artifact.id),
      name: artifact.name,
      digest: String(artifact.digest).toLowerCase(),
    },
    attestation_ref: githubArtifactAttestationRef({
      repository,
      runId,
      artifactId: artifact.id,
      digest: artifact.digest,
    }),
  };
}

try {
  for (const key of ['repository', 'run-id', 'candidate-sha', 'workflow-sha', 'workflow-ref', 'artifact-name', 'out']) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  const runRecord = args['run-json']
    ? readData(path.resolve(args['run-json']))
    : ghJson(`repos/${args.repository}/actions/runs/${args['run-id']}`);
  const jobsResponse = args['jobs-json']
    ? readData(path.resolve(args['jobs-json']))
    : ghJson(`repos/${args.repository}/actions/runs/${args['run-id']}/jobs?per_page=100`);
  const artifactResponse = args['artifacts-json']
    ? readData(path.resolve(args['artifacts-json']))
    : ghJson(`repos/${args.repository}/actions/runs/${args['run-id']}/artifacts?per_page=100`);
  const receipt = verifyActionsArtifactObservation({
    repository: args.repository,
    runId: args['run-id'],
    candidateSha: args['candidate-sha'],
    workflowSha: args['workflow-sha'],
    workflowRef: args['workflow-ref'],
    artifactName: args['artifact-name'],
    runRecord,
    jobsResponse,
    artifactResponse,
  });
  writeData(outputFile(args.out), receipt);
  printResult({ title: 'Factory GitHub Actions artifact attestation', summary: { status: 'verified' }, receipt, findings: [] }, args.json === true);
} catch (error) {
  printResult({ title: 'Factory GitHub Actions artifact attestation', summary: { internal: 1 }, findings: [{ severity: 'P0', code: error.code || 'factory-actions-attestation-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
