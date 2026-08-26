#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { SHA_PATTERN, isWithin, parseArgs, printResult, resolveContainedRegularFile } from './lib/factory-delivery/core.mjs';
import { readData, writeData, writeText } from './lib/factory-delivery/files.mjs';
import { scanEvidenceFile } from './lib/factory-delivery/minimize.mjs';
import { sourceTreeDigest, verifyEvidenceOnlyCommit } from './lib/factory-delivery/provenance.mjs';
import { validateEvidence, validateFactoryCi, validatePrDraft } from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());

function safeRef(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value || '') || value.includes('..') || value.endsWith('/')) {
    throw new Error(`${label} is not a safe Git ref`);
  }
  return value;
}

function run(command, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    timeout: 120_000,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  if (!allowFailure && result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result;
}

function remoteHeadSha(repository, headRef) {
  const response = JSON.parse(run('gh', ['api', `repos/${repository}/git/ref/heads/${headRef}`]).stdout || '{}');
  return String(response?.object?.sha || '').toLowerCase();
}

function bodyWithEvidence(body, manifest, contract) {
  const marker = '<!-- factory-evidence -->';
  const generated = [
    marker,
    '',
    '## Factory evidence',
    '',
    `- Verdict: **${manifest.verdict}**`,
    `- Subject SHA: \`${manifest.subject.tested_sha}\``,
    `- Run: \`${manifest.run_id}\``,
    `- Evidence: ${manifest.publication?.artifact_url || 'evidence-only commit'}`,
    `- Evidence bundle: \`${manifest.publication?.bundle_digest || manifest.subject?.evidence_commit_sha}\``,
    `- Source digest: \`${manifest.subject.source_tree_digest}\``,
    `- Specification: \`${contract.spec_ref}\``,
    `- Technical plan: \`${contract.technical_plan_ref}\``,
    `- Acceptance matrix: \`${contract.acceptance_matrix_ref}\``,
    `- Required checks: ${contract.required_checks.join(', ')}`,
    `- Replay: \`${contract.replay_command}\``,
    `- Results: passed=${manifest.summary.passed}, failed=${manifest.summary.failed}, blocked=${manifest.summary.blocked}, skipped=${manifest.summary.skipped}, waived=${manifest.summary.waived}`,
    '',
  ].join('\n');
  const index = body.indexOf(marker);
  return index === -1 ? `${body.trim()}\n\n${generated}` : `${body.slice(0, index).trim()}\n\n${generated}`;
}

function validateAuthorizationReceipt(file, contract, { candidateSha, headRef, baseRef }) {
  const absolute = path.resolve(file);
  if (isWithin(root, absolute)) throw new Error('authorization receipt must come from an external gate, not the repository');
  if (!fs.existsSync(absolute) || fs.lstatSync(absolute).isSymbolicLink() || !fs.statSync(absolute).isFile()) throw new Error('authorization receipt must be a real external file');
  const receipt = readData(absolute);
  for (const key of ['gate_id', 'candidate_sha', 'head_ref', 'base_ref', 'approver_ref', 'authorized_at']) if (!receipt?.[key]) throw new Error(`authorization receipt is missing ${key}`);
  if (receipt.gate_id !== contract.authorization.gate_id || receipt.candidate_sha?.toLowerCase() !== candidateSha || receipt.head_ref !== headRef || receipt.base_ref !== baseRef) throw new Error('authorization receipt is not bound to this exact draft operation');
  const authorizedAt = Date.parse(receipt.authorized_at);
  if (Number.isNaN(authorizedAt) || Date.now() - authorizedAt > 24 * 60 * 60 * 1000 || authorizedAt > Date.now() + 5 * 60 * 1000) throw new Error('authorization receipt is expired or invalid');
  return receipt;
}

try {
  for (const required of ['contract', 'evidence', 'plan', 'environment', 'ci', 'artifacts-root']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const contract = readData(path.resolve(root, args.contract));
  const manifest = readData(path.resolve(root, args.evidence));
  const planFile = path.resolve(root, args.plan);
  const environmentFile = path.resolve(root, args.environment);
  const ciFile = path.resolve(root, args.ci);
  const ci = readData(ciFile);
  const planContract = readData(planFile);
  const findings = [
    ...validateFactoryCi(ci, { file: args.ci, root, checkPipelineFile: true }),
    ...validatePrDraft(contract, ci, { file: args.contract }),
    ...validateEvidence(manifest, planContract, {
      file: args.evidence,
      artifactsRoot: path.resolve(root, args['artifacts-root']),
      verifyArtifacts: true,
      acceptancePlanFile: planFile,
      environmentContractFile: environmentFile,
      repositoryRoot: root,
    }),
  ];
  if (manifest.publication?.mode === 'ci_artifact' && manifest.publication?.retention_days !== ci?.artifacts?.retention_days) findings.push({ severity: 'P0', code: 'pr-evidence-retention-mismatch', message: 'evidence retention differs from the CI contract' });
  if (manifest.verdict !== 'ready') findings.push({ severity: 'P0', code: 'pr-evidence-not-ready', message: 'a draft PR cannot be created from blocked evidence' });
  const testedSha = String(manifest.subject?.tested_sha || '').toLowerCase();
  if (!String(contract.replay_command || '').includes(testedSha) || !String(contract.replay_command || '').includes(manifest.run_id)) findings.push({ severity: 'P0', code: 'pr-replay-command-stale', message: 'replay_command must contain the exact tested SHA and run id' });
  const expectedHeadSha = manifest.publication?.mode === 'evidence_only_commit'
    ? String(manifest.subject?.evidence_commit_sha || '').toLowerCase()
    : testedSha;
  const headSha = String(args['head-sha'] || expectedHeadSha).toLowerCase();
  if (!SHA_PATTERN.test(headSha) || headSha !== expectedHeadSha) findings.push({ severity: 'P0', code: 'pr-subject-sha-mismatch', message: 'head SHA must equal the publication-mode revision bound by the evidence manifest' });
  if (SHA_PATTERN.test(testedSha)) {
    try {
      const digest = sourceTreeDigest(root, testedSha, { excludedPrefixes: [`${manifest.spec_package}/acceptance/runs`] });
      if (digest !== manifest.subject?.source_tree_digest) findings.push({ severity: 'P0', code: 'pr-source-digest-mismatch', message: 'tested source tree does not match the evidence manifest digest' });
      if (manifest.publication?.mode === 'evidence_only_commit' && SHA_PATTERN.test(expectedHeadSha)) {
        const evidenceOnly = verifyEvidenceOnlyCommit(root, testedSha, expectedHeadSha, [`${manifest.spec_package}/acceptance/runs`]);
        if (!evidenceOnly.ok) findings.push({ severity: 'P0', code: evidenceOnly.code, message: `evidence commit changes non-evidence files: ${(evidenceOnly.forbidden || []).join(', ')}` });
      }
    } catch (error) {
      findings.push({ severity: 'P0', code: 'pr-source-provenance-unverifiable', message: error.message });
    }
  }
  const headRef = safeRef(args['head-ref'] || process.env[contract.head_ref_from], 'head ref');
  const baseRef = safeRef(args['base-ref'] || contract.base_ref, 'base ref');
  const bodyPath = path.resolve(root, contract.body_path);
  for (const key of ['spec_ref', 'technical_plan_ref', 'acceptance_matrix_ref']) {
    try {
      resolveContainedRegularFile(root, path.resolve(root, contract[key]));
    } catch (error) {
      findings.push({ severity: 'P0', code: 'pr-reference-path-invalid', message: `${key}: ${error.message}` });
    }
  }
  let body = '';
  try {
    const resolvedBody = resolveContainedRegularFile(root, bodyPath);
    for (const issue of scanEvidenceFile(resolvedBody.absolute, resolvedBody.relative)) findings.push({ severity: 'P0', ...issue, file: resolvedBody.relative });
    body = bodyWithEvidence(fs.readFileSync(resolvedBody.absolute, 'utf8'), manifest, contract);
  } catch (error) {
    findings.push({ severity: 'P0', code: 'pr-body-path-invalid', message: error.message });
  }

  const plan = {
    mode: args.execute === true ? 'execute' : 'dry-run',
    provider: 'github',
    operation: 'create-draft',
    title: contract.title,
    base_ref: baseRef,
    head_ref: headRef,
    head_sha: headSha,
    tested_sha: testedSha,
    argv: ['gh', 'pr', 'create', '--draft', '--base', baseRef, '--head', headRef, '--title', contract.title, '--body', '<generated-body>'],
  };
  if (args['body-out']) {
    const bodyOut = path.resolve(root, args['body-out']);
    if (!isWithin(root, bodyOut)) findings.push({ severity: 'P0', code: 'pr-body-output-invalid', message: 'body output must remain inside the repository' });
    else writeText(bodyOut, body);
  }
  if (findings.length) {
    printResult({ title: 'Factory draft PR', summary: { mode: plan.mode, findings: findings.length }, plan, findings }, args.json === true);
    process.exit(2);
  }
  if (args.execute !== true) {
    printResult({ title: 'Factory draft PR', summary: { mode: 'dry-run', findings: 0 }, plan, findings: [], message: 'No external action performed. Pass --execute with an external authorization receipt to create or update the draft.' }, args.json === true);
    process.exit(0);
  }
  if (!args['authorization-receipt']) throw new Error('--authorization-receipt is required for execution');
  const authorization = validateAuthorizationReceipt(args['authorization-receipt'], contract, { candidateSha: headSha, headRef, baseRef });

  run('gh', ['auth', 'status']);
  const repositoryInfo = JSON.parse(run('gh', ['repo', 'view', '--json', 'nameWithOwner']).stdout);
  const remoteSha = remoteHeadSha(repositoryInfo.nameWithOwner, headRef);
  if (remoteSha !== headSha) throw new Error(`remote head ${remoteSha || '<missing>'} does not equal tested SHA ${headSha}`);
  const checkResponse = JSON.parse(run('gh', ['api', `repos/${repositoryInfo.nameWithOwner}/commits/${headSha}/check-runs?per_page=100`]).stdout || '{}');
  const providerNames = new Map(ci.checks.filter((check) => check.required === true).map((check) => [check.id, check.provider_name]));
  for (const checkId of contract.required_checks) {
    const providerName = providerNames.get(checkId);
    const matching = (checkResponse.check_runs || []).filter((check) => check.name === providerName && check.head_sha?.toLowerCase() === headSha);
    if (!matching.some((check) => check.status === 'completed' && check.conclusion === 'success')) throw new Error(`required check ${checkId} has not succeeded for the exact head SHA`);
  }
  const existing = run('gh', ['pr', 'list', '--head', headRef, '--state', 'open', '--json', 'number,url,isDraft,headRefOid,baseRefName,title,body'], { allowFailure: false });
  const rows = JSON.parse(existing.stdout || '[]');
  let operation;
  if (rows.length) {
    const current = rows[0];
    if (current.headRefOid?.toLowerCase() !== headSha) throw new Error('existing draft PR points at a different head SHA');
    if (current.isDraft !== true) throw new Error('an open non-draft PR already exists for this branch');
    if (current.baseRefName !== baseRef || current.title !== contract.title || current.body !== body) {
      run('gh', ['pr', 'edit', String(current.number), '--base', baseRef, '--title', contract.title, '--body', body]);
      operation = { outcome: 'updated', number: current.number, url: current.url, head_sha: headSha };
    } else operation = { outcome: 'existing', number: current.number, url: current.url, head_sha: headSha };
  } else {
    const created = run('gh', ['pr', 'create', '--draft', '--base', baseRef, '--head', headRef, '--title', contract.title, '--body', body]);
    operation = { outcome: 'created', url: created.stdout.trim(), head_sha: headSha };
  }
  operation.authorization = { gate_id: authorization.gate_id, approver_ref: authorization.approver_ref, authorized_at: authorization.authorized_at };
  if (args.out) writeData(path.resolve(root, args.out), operation);
  printResult({ title: 'Factory draft PR', summary: { mode: 'execute', outcome: operation.outcome }, plan, operation, findings: [] }, args.json === true);
  process.exit(0);
} catch (error) {
  printResult({ title: 'Factory draft PR', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-pr-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
