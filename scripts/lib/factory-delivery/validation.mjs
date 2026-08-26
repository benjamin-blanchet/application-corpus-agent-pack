import fs from 'node:fs';
import path from 'node:path';

import {
  SHA_PATTERN,
  OUTCOMES,
  asArray,
  canonicalizeCaseOutcome,
  duplicateIds,
  ensureRequired,
  finding,
  requiredObject,
  resolveContainedRegularFile,
  sha256File,
  sha256Object,
} from './core.mjs';
import { inspectEvidenceMedia, scanEvidenceFile } from './minimize.mjs';
import { readData } from './files.mjs';

const PROFILE_KINDS = new Set(['local', 'preview', 'shared_nonprod']);
const AUTH_MODES = new Set(['service_identity', 'ephemeral_storage_state', 'interactive']);
const EPHEMERAL_STORAGE_INPUTS = new Set(['FACTORY_EPHEMERAL_STORAGE_STATE', 'FACTORY_EPHEMERAL_STORAGE_STATE_JSON']);
const DATA_ISOLATIONS = new Set(['per_run', 'namespaced', 'shared']);
const ORACLE_TYPES = new Set(['ui', 'api', 'db_read', 'log', 'file', 'human_attestation']);
const CLEANUP_OUTCOMES = new Set(['passed', 'failed', 'pending', 'not_required']);
const MUTATION_OUTCOMES = new Set(['applied', 'not_applied', 'failed']);
const FORBIDDEN_PR_ACTIONS = ['push', 'approve', 'mark_ready', 'merge', 'force_push'];
const REQUIRED_ENVIRONMENT_OPERATIONS = {
  build: 'build',
  start: 'start',
  health: 'none',
  stop: 'stop',
  reset: 'reset',
  revision_probe: 'none',
};
const SIDE_EFFECTS = new Set(['none', 'build', 'start', 'stop', 'seed', 'reset', 'cleanup']);
const PLACEHOLDER_PATTERN = /<[^>]+>|^(?:unknown|runtime-provided)$/i;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z][A-Za-z0-9._\/-]{0,127}$/;
const ENV_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;
const EVIDENCE_MEDIA_TYPES = {
  screenshot: new Set(['image/png', 'image/jpeg', 'image/webp']),
  trace: new Set(['application/zip']),
  video: new Set(['video/webm', 'video/mp4']),
  log: new Set(['text/plain', 'application/json']),
  report: new Set(['text/html', 'application/json', 'application/xml', 'text/plain']),
  file: null,
};
const DELIVERY_WORKFLOW_TEMPLATES = {
  'factory-policy.workflow.yml': {
    active: 'factory-policy.yml',
    runs: [
      { label: 'protected workflow context', pattern: /node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-workflow-context\.mjs["']?/ },
      { label: 'protected portable Factory suite', pattern: /node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/test-factory-suite\.mjs["']?\s+--subject-root\s+["']?\$GITHUB_WORKSPACE\/candidate["']?/ },
      { label: 'protected validate-factory.mjs', pattern: /node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/validate-factory\.mjs["']?\s+--root\s+["']?\$GITHUB_WORKSPACE\/candidate["']?/ },
      { label: 'protected validate-delivery.mjs --lint-template', pattern: /node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/validate-delivery\.mjs["']?\s+--root\s+["']?\$GITHUB_WORKSPACE\/candidate["']?\s+--lint-template/ },
      { label: 'protected validate-corpus.mjs', pattern: /node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/validate-corpus\.mjs["']?\s+--root\s+["']?\$GITHUB_WORKSPACE\/candidate["']?/ },
    ],
    actions: ['actions/checkout', 'actions/setup-node'],
  },
  'factory-acceptance.workflow.yml': {
    active: 'factory-acceptance.yml',
    runs: [
      { label: 'protected workflow context', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-workflow-context\.mjs["']?(?:\s|$)/ },
      { label: 'protected factory-acceptance.mjs', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-acceptance\.mjs["']?(?:\s|$)/ },
      { label: 'protected factory-stage-evidence.mjs', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-stage-evidence\.mjs["']?(?:\s|$)/ },
      { label: 'protected factory-evidence.mjs', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-evidence\.mjs["']?(?:\s|$)/ },
      { label: 'protected factory-report.mjs', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-report\.mjs["']?(?:\s|$)/ },
    ],
    actions: ['actions/checkout', 'actions/setup-node', 'actions/upload-artifact'],
  },
  'factory-release.workflow.yml': {
    active: 'factory-release.yml',
    runs: [
      { label: 'protected workflow context', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-workflow-context\.mjs["']?(?:\s|$)/ },
      { label: 'protected acceptance artifact attestation', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-actions-attestation\.mjs["']?(?:\s|$)/ },
      { label: 'protected factory-release.mjs', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-release\.mjs["']?(?:\s|$)/ },
    ],
    actions: ['actions/checkout', 'actions/setup-node', 'actions/download-artifact', 'actions/upload-artifact'],
  },
  'factory-draft-pr.workflow.yml': {
    active: 'factory-draft-pr.yml',
    runs: [
      { label: 'protected workflow context', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-workflow-context\.mjs["']?(?:\s|$)/ },
      { label: 'protected factory-pr.mjs --execute', pattern: /(?:^|&&|\|\||;)\s*node\s+["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-pr\.mjs["']?\s+--execute(?:\s|$)/ },
      { label: 'external authorization receipt materialization', pattern: /(?:^|&&|\|\||;)\s*node\s+-e\s+.*process\.env\.FACTORY_AUTHORIZATION_RECEIPT/ },
    ],
    actions: ['actions/checkout', 'actions/setup-node', 'actions/download-artifact'],
  },
};

function enumValue(value, allowed, code, scope, findings, file) {
  if (!allowed.has(value)) findings.push(finding(code, `${scope} has unsupported value ${JSON.stringify(value)}`, file));
}

function operationIds(ci) {
  return new Set(Object.keys(requiredObject(ci?.operations) ? ci.operations : {}));
}

function validReferencePath(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');
}

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_PATTERN.test(value);
}

function ensureClosed(value, allowed, scope, findings, file) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) findings.push(finding('delivery-unknown-field', `${scope}.${key} is not part of the closed contract`, file));
  }
}

function duplicateStrings(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of asArray(values)) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates];
}

function exactTestTitlePresent(source, title) {
  if (typeof title !== 'string' || !title) return false;
  return source.includes(`test('${title}'`) || source.includes(`test("${title}"`);
}

function validateNotApplicable(value, scope, findings, file) {
  ensureRequired(value, ['not_applicable', 'reason'], scope, findings, file);
  if (value?.not_applicable !== true || String(value?.reason || '').trim().length < 8) {
    findings.push(finding('environment-not-applicable-invalid', `${scope} needs not_applicable: true and an explicit reason`, file));
    return false;
  }
  return true;
}

function validateWaiver(waiver, scope, findings, file) {
  ensureRequired(waiver, ['reason', 'approver_ref', 'approved_at'], scope, findings, file);
  if (waiver?.reason && String(waiver.reason).trim().length < 8) findings.push(finding('waiver-reason-invalid', `${scope}.reason must be explicit`, file));
  if (waiver?.approver_ref && !SAFE_REFERENCE_PATTERN.test(waiver.approver_ref)) findings.push(finding('waiver-approver-invalid', `${scope}.approver_ref must be a logical identity reference`, file));
  if (waiver?.approved_at && Number.isNaN(Date.parse(waiver.approved_at))) findings.push(finding('waiver-date-invalid', `${scope}.approved_at must be an ISO date`, file));
}

export function hasValidWaiver(waiver) {
  const local = [];
  validateWaiver(waiver, 'waiver', local, null);
  return local.length === 0;
}

export function validateFactoryCi(ci, {
  file = 'factory-ci.yaml',
  root = process.cwd(),
  allowPlaceholders = false,
  checkPipelineFile = false,
} = {}) {
  const findings = [];
  ensureRequired(ci, ['version', 'subject_revision', 'pipeline', 'operations', 'checks', 'artifacts', 'flake_policy', 'security'], 'factory_ci', findings, file);
  if (ci?.version !== 1) findings.push(finding('factory-ci-version-unsupported', 'factory_ci.version must be 1', file));
  if (ci?.subject_revision !== 'pull_request_head') {
    findings.push(finding('factory-ci-subject-ambiguous', 'subject_revision must be pull_request_head', file));
  }

  const operations = requiredObject(ci?.operations) ? ci.operations : {};
  if (Object.keys(operations).length === 0) findings.push(finding('factory-ci-operation-missing', 'factory_ci.operations must not be empty', file));
  for (const [id, operation] of Object.entries(operations)) {
    ensureRequired(operation, ['argv', 'cwd', 'timeout_seconds', 'privilege', 'side_effect'], `operations.${id}`, findings, file);
    if (!Array.isArray(operation?.argv) || operation.argv.length === 0 || operation.argv.some((arg) => typeof arg !== 'string' || !arg)) {
      findings.push(finding('factory-ci-operation-invalid', `operations.${id}.argv must be a non-empty string array`, file));
    }
    if (!allowPlaceholders && asArray(operation?.argv).some(isPlaceholder)) findings.push(finding('factory-ci-placeholder', `operations.${id}.argv contains an unresolved placeholder`, file));
    if (!validReferencePath(operation?.cwd || '.')) findings.push(finding('factory-ci-operation-invalid', `operations.${id}.cwd must remain repository-relative`, file));
    if (!Number.isInteger(operation?.timeout_seconds) || operation.timeout_seconds < 1) {
      findings.push(finding('factory-ci-operation-invalid', `operations.${id}.timeout_seconds must be a positive integer`, file));
    }
    enumValue(operation?.privilege, new Set(['unprivileged', 'protected_environment']), 'factory-ci-operation-invalid', `operations.${id}.privilege`, findings, file);
    enumValue(operation?.side_effect, SIDE_EFFECTS, 'factory-ci-operation-invalid', `operations.${id}.side_effect`, findings, file);
  }

  if (!Array.isArray(ci?.checks) || ci.checks.length === 0) findings.push(finding('factory-ci-check-missing', 'factory_ci.checks must not be empty', file));
  for (const duplicate of duplicateIds(ci?.checks)) findings.push(finding('factory-ci-check-duplicate', `duplicate check id ${duplicate}`, file));
  const providerNames = new Set();
  for (const check of asArray(ci?.checks)) {
    ensureRequired(check, ['id', 'provider_name', 'operation', 'required', 'secret_access'], `checks.${check?.id || '?'}`, findings, file);
    if (!Object.hasOwn(operations, check?.operation)) {
      findings.push(finding('factory-ci-operation-unknown', `check ${check?.id} references unknown operation ${check?.operation}`, file));
    }
    if (typeof check?.required !== 'boolean') findings.push(finding('factory-ci-check-invalid', `checks.${check?.id}.required must be boolean`, file));
    if (typeof check?.provider_name !== 'string' || !check.provider_name.trim() || isPlaceholder(check.provider_name)) findings.push(finding('factory-ci-check-invalid', `checks.${check?.id}.provider_name must be a concrete check-run name`, file));
    else if (providerNames.has(check.provider_name)) findings.push(finding('factory-ci-provider-name-duplicate', `provider check name ${check.provider_name} is ambiguous`, file));
    else providerNames.add(check.provider_name);
    enumValue(check?.secret_access, new Set(['none', 'protected_environment']), 'factory-ci-secret-policy-invalid', `checks.${check?.id}.secret_access`, findings, file);
    if (check?.secret_access === 'protected_environment' && operations[check.operation]?.privilege !== 'protected_environment') {
      findings.push(finding('factory-ci-secret-policy-invalid', `check ${check.id} exposes protected secrets to a non-protected operation`, file));
    }
  }

  const pipeline = ci?.pipeline || {};
  ensureRequired(pipeline, ['active_config_ref', 'candidate_build_operation', 'preview_mode', 'preview_operation', 'build_identity_operation'], 'factory_ci.pipeline', findings, file);
  if (!allowPlaceholders && Object.values(pipeline).some(isPlaceholder)) findings.push(finding('factory-ci-placeholder', 'factory_ci.pipeline contains an unresolved placeholder', file));
  if (!validReferencePath(pipeline.active_config_ref)) findings.push(finding('factory-ci-pipeline-invalid', 'pipeline.active_config_ref must be repository-relative', file));
  else if (checkPipelineFile && !allowPlaceholders) {
    try {
      const activeConfig = resolveContainedRegularFile(root, path.join(root, pipeline.active_config_ref));
      const workflowText = fs.readFileSync(activeConfig.absolute, 'utf8');
      const workflow = workflowStructure(workflowText);
      findings.push(...policyWorkflowFindings(workflow, workflowText, path.relative(root, activeConfig.absolute)));
      for (const match of workflowText.matchAll(/^\s*uses:\s*["']?([^\s#"']+)/gm)) {
        const reference = match[1];
        if (reference.startsWith('./')) continue;
        const pinnedAction = /@[0-9a-f]{40}$/i.test(reference);
        const pinnedContainer = /^docker:\/\/[^@]+@sha256:[0-9a-f]{64}$/i.test(reference);
        if (!pinnedAction && !pinnedContainer) findings.push(finding('factory-ci-action-not-pinned', `active CI action is not pinned to an immutable digest: ${reference}`, file));
      }
    } catch (error) {
      findings.push(finding('factory-ci-pipeline-missing', `active pipeline config is not a contained regular file: ${error.message}`, file));
    }
  }
  for (const key of ['candidate_build_operation', 'preview_operation', 'build_identity_operation']) {
    if (pipeline[key] && !isPlaceholder(pipeline[key]) && !Object.hasOwn(operations, pipeline[key])) findings.push(finding('factory-ci-operation-unknown', `pipeline.${key} references unknown operation ${pipeline[key]}`, file));
  }
  if (!['local', 'preview', 'shared_nonprod'].includes(pipeline.preview_mode) && !(allowPlaceholders && isPlaceholder(pipeline.preview_mode))) findings.push(finding('factory-ci-pipeline-invalid', 'pipeline.preview_mode must identify the executed candidate environment', file));

  const artifacts = ci?.artifacts || {};
  ensureRequired(artifacts, ['retention_days', 'required', 'conditional'], 'factory_ci.artifacts', findings, file);
  if (!Number.isInteger(artifacts.retention_days) || artifacts.retention_days < 1) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.retention_days must be a positive integer', file));
  const requiredArtifacts = new Set(asArray(artifacts.required));
  if (!Array.isArray(artifacts.required) || artifacts.required.some((item) => typeof item !== 'string' || !item)) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.required must be a string array', file));
  if (!Array.isArray(artifacts.conditional) || artifacts.conditional.some((item) => typeof item !== 'string' || !item)) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.conditional must be a string array', file));
  if (requiredArtifacts.size !== asArray(artifacts.required).length) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.required contains duplicates', file));
  for (const id of ['evidence-manifest', 'results-json', 'junit', 'acceptance-report']) if (!requiredArtifacts.has(id)) findings.push(finding('factory-ci-artifact-missing', `${id} must be a required CI artifact`, file));

  const security = ci?.security || {};
  const requiredSecurity = {
    default_permissions: 'read',
    protected_job_requires_environment_approval: true,
    policy_definition_source: 'protected_base',
    controller_ref: 'protected_full_sha',
    candidate_checkout_credentials: 'none',
    actions_pinned_to_full_sha: true,
  };
  ensureRequired(security, Object.keys(requiredSecurity), 'factory_ci.security', findings, file);
  ensureClosed(security, Object.keys(requiredSecurity), 'factory_ci.security', findings, file);
  for (const [key, expected] of Object.entries(requiredSecurity)) {
    if (security[key] !== expected) findings.push(finding('factory-ci-security-weakened', `security.${key} must be ${JSON.stringify(expected)}`, file));
  }
  if (ci?.flake_policy?.retry_pass_outcome !== 'failed' || ci?.flake_policy?.retry_reason !== 'flaky_retry' || ci?.flake_policy?.flaky_blocks_readiness !== true) {
    findings.push(finding('factory-ci-flaky-policy-unsafe', 'retry-pass must be failed with reason flaky_retry and must block readiness', file));
  }
  return findings;
}

function stripWorkflowComment(value) {
  let single = false;
  let double = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && !double) single = !single;
    else if (character === '"' && !single && value[index - 1] !== '\\') double = !double;
    else if (character === '#' && !single && !double && (index === 0 || /\s/.test(value[index - 1]))) return value.slice(0, index).trimEnd();
  }
  return value.trimEnd();
}

function workflowScalar(value) {
  const stripped = stripWorkflowComment(String(value || '')).trim();
  if ((stripped.startsWith('"') && stripped.endsWith('"')) || (stripped.startsWith("'") && stripped.endsWith("'"))) return stripped.slice(1, -1);
  return stripped;
}

function workflowRun(lines, index, baseIndent) {
  const scalar = lines[index].replace(/^\s*run:\s*/, '').trim();
  if (scalar && !['|', '|-', '>', '>-'].includes(scalar)) return { command: workflowScalar(scalar).replace(/\s+/g, ' ').trim(), end: index };
  const body = [];
  let cursor = index;
  while (cursor + 1 < lines.length) {
    const next = lines[cursor + 1];
    const nextIndent = next.match(/^\s*/)[0].length;
    if (next.trim() && nextIndent <= baseIndent) break;
    cursor += 1;
    if (next.trim() && !next.trim().startsWith('#')) body.push(next.trim());
  }
  return { command: body.join(' ').replace(/\s+/g, ' ').trim(), end: cursor };
}

function workflowSteps(lines) {
  const steps = [];
  for (let start = 0; start < lines.length; start += 1) {
    const header = lines[start].match(/^(\s*)-\s+name:\s*(.*)$/);
    if (!header) continue;
    const baseIndent = header[1].length;
    let end = start + 1;
    while (end < lines.length) {
      const indent = lines[end].match(/^\s*/)[0].length;
      if (lines[end].trim() && indent <= baseIndent) break;
      end += 1;
    }
    const step = {
      job: null,
      name: workflowScalar(header[2]),
      id: null,
      uses: null,
      run: null,
      workingDirectory: null,
      with: {},
      env: {},
      start,
      end,
    };
    for (let cursor = start - 1; cursor >= 0; cursor -= 1) {
      const job = lines[cursor].match(/^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/);
      if (job) {
        step.job = job[1];
        break;
      }
    }
    let section = null;
    for (let index = start + 1; index < end; index += 1) {
      const line = lines[index];
      const indent = line.match(/^\s*/)[0].length;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (indent === baseIndent + 2) {
        section = null;
        const property = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
        if (!property) continue;
        const [, key, raw] = property;
        if (key === 'with' || key === 'env') {
          section = key;
          continue;
        }
        if (key === 'run') {
          const parsed = workflowRun(lines, index, indent);
          step.run = parsed.command;
          index = parsed.end;
        } else if (key === 'uses') step.uses = workflowScalar(raw);
        else if (key === 'id') step.id = workflowScalar(raw);
        else if (key === 'working-directory') step.workingDirectory = workflowScalar(raw);
      } else if (section && indent === baseIndent + 4) {
        const mapping = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
        if (mapping) step[section][mapping[1]] = workflowScalar(mapping[2]);
      }
    }
    steps.push(step);
    start = end - 1;
  }
  return steps;
}

function workflowStructure(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const runs = [];
  const actions = [];
  const retentionDays = [];
  const permissions = {};
  const jobEnvironments = [];
  const jobEnv = {};
  const jobIds = [];
  const triggers = [];
  const jobNeeds = {};
  const jobIf = {};
  const jobEnvs = {};
  let inJobs = false;
  let inOn = false;
  let currentJob = null;
  let jobEnvSection = null;
  let jobPermissionBlocks = 0;
  let inTopPermissions = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();
    if (indent === 0 && trimmed) {
      inJobs = trimmed === 'jobs:';
      inOn = trimmed === 'on:';
      currentJob = null;
      jobEnvSection = null;
    } else if (inOn && indent === 2) {
      const trigger = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
      if (trigger) triggers.push(trigger[1]);
    } else if (inJobs && indent === 2) {
      const job = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/);
      if (job) {
        currentJob = job[1];
        jobIds.push(currentJob);
        jobNeeds[currentJob] = [];
        jobEnvs[currentJob] = {};
        jobEnvSection = null;
      }
    }
    if (inJobs && currentJob && indent === 4) {
      jobEnvSection = trimmed === 'env:' ? currentJob : null;
      const needs = trimmed.match(/^needs:\s*(.*)$/);
      if (needs) {
        const value = workflowScalar(needs[1]);
        jobNeeds[currentJob] = value.startsWith('[') && value.endsWith(']')
          ? value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean)
          : value ? [value] : [];
      }
      const condition = trimmed.match(/^if:\s*(.*)$/);
      if (condition) jobIf[currentJob] = workflowScalar(condition[1]);
    } else if (jobEnvSection && indent === 6) {
      const variable = trimmed.match(/^([A-Z][A-Z0-9_]*):\s*(.+)$/);
      if (variable) jobEnvs[jobEnvSection][variable[1]] = workflowScalar(variable[2]);
    }
    if (inJobs && indent === 4 && /^permissions:/.test(trimmed)) jobPermissionBlocks += 1;
    const jobEnvironment = line.match(/^ {4}environment:\s*([^#\s]+)\s*(?:#.*)?$/);
    if (jobEnvironment) jobEnvironments.push(workflowScalar(jobEnvironment[1]));
    const jobEnvironmentVariable = line.match(/^ {6}([A-Z][A-Z0-9_]*):\s*(.+)$/);
    if (jobEnvironmentVariable) jobEnv[jobEnvironmentVariable[1]] = workflowScalar(jobEnvironmentVariable[2]);
    if (indent === 0) inTopPermissions = trimmed === 'permissions:';
    else if (inTopPermissions && indent === 2) {
      const match = trimmed.match(/^([A-Za-z_-]+):\s*([^#\s]+)\s*(?:#.*)?$/);
      if (match) permissions[match[1]] = match[2];
    } else if (inTopPermissions && trimmed && indent < 2) inTopPermissions = false;
    const uses = line.match(/^\s*uses:\s*([^\s#]+)/);
    if (uses) actions.push(uses[1].replace(/["']/g, ''));
    const retention = line.match(/^\s*retention-days:\s*(.+)$/);
    if (retention) {
      const value = workflowScalar(retention[1]);
      retentionDays.push(/^\d+$/.test(value) ? Number(value) : value.replace(/\s+/g, ' '));
    }
    const run = line.match(/^(\s*)run:\s*(.*)$/);
    if (!run) continue;
    const base = run[1].length;
    const scalar = run[2].trim();
    if (scalar && !['|', '|-', '>', '>-'].includes(scalar)) {
      runs.push(scalar.replace(/\s+/g, ' ').trim());
      continue;
    }
    const body = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      const nextIndent = next.match(/^\s*/)[0].length;
      if (next.trim() && nextIndent <= base) break;
      index += 1;
      if (next.trim() && !next.trim().startsWith('#')) body.push(next.trim());
    }
    runs.push(body.join(' ').replace(/\s+/g, ' ').trim());
  }
  const steps = workflowSteps(lines);
  const secretReferences = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\$\{\{\s*secrets\./.test(stripWorkflowComment(lines[index]))) continue;
    const step = steps.find((candidate) => index >= candidate.start && index < candidate.end) || null;
    secretReferences.push({ line: index + 1, step: step?.name || null });
  }
  return { runs, actions, retentionDays, permissions, steps, secretReferences, jobEnvironments, jobEnv, jobIds, jobPermissionBlocks, triggers, jobNeeds, jobIf, jobEnvs };
}

function workflowFingerprint(structure) {
  return sha256Object({
    runs: [...structure.runs].sort(),
    actions: [...structure.actions].sort(),
    retention_days: [...structure.retentionDays].sort((a, b) => String(a).localeCompare(String(b))),
    permissions: structure.permissions,
  });
}

function normalizedWorkflowText(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+#.*$/, '').replace(/\s+$/, ''))
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .join('\n');
}

function workflowExpression(value) {
  return String(value || '').replace(/\s+/g, '');
}

function exactWorkflowPermissions(actual, expected) {
  const actualKeys = Object.keys(actual || {}).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every((key, index) => actualKeys[index] === key && actual[key] === expected[key]);
}

function exactActionSurface(structure, expected) {
  const actual = structure.steps.filter((step) => step.uses).map((step) => step.uses.split('@')[0]).sort();
  return actual.length === expected.length && [...expected].sort().every((value, index) => actual[index] === value);
}

function shellControlOutsideQuotes(command) {
  let single = false;
  let double = false;
  const text = String(command || '');
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "'" && !double) single = !single;
    else if (character === '"' && !single && text[index - 1] !== '\\') double = !double;
    else if (!single && !double && (character === ';' || character === '`' || character === '|' || (character === '&' && text[index + 1] === '&'))) return true;
    else if (!single && character === '$' && text[index + 1] === '(') return true;
  }
  return single || double;
}

function optionCount(command, option) {
  const escaped = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...String(command || '').matchAll(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'g'))].length;
}

function protectedCheckoutFindings(structure, { candidateRef, candidateFetchDepth = null, file }) {
  const findings = [];
  const checkouts = structure.steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
  const controller = checkouts.find((step) => step.with.path === 'factory-controller');
  const candidate = checkouts.find((step) => step.with.path === 'candidate');
  if (checkouts.length !== 2
    || !controller
    || workflowExpression(controller.with.ref) !== '${{vars.FACTORY_CONTROLLER_SHA}}'
    || controller.with['persist-credentials'] !== 'false'
    || controller.with.repository
    || !candidate
    || workflowExpression(candidate.with.ref) !== workflowExpression(candidateRef)
    || (candidateFetchDepth !== null && candidate.with['fetch-depth'] !== candidateFetchDepth)
    || candidate.with['persist-credentials'] !== 'false'
    || candidate.with.repository) {
    findings.push(finding('delivery-workflow-checkout-boundary-invalid', 'workflow must use exactly one protected controller checkout and one disjoint exact candidate checkout with the required Git history and no persisted credentials', file));
  }
  const context = structure.steps.find((step) => step.run?.includes('$GITHUB_WORKSPACE/factory-controller/scripts/factory-workflow-context.mjs'));
  const requiredContextTokens = [
    '--controller-root "$GITHUB_WORKSPACE/factory-controller"',
    '--controller-sha "$FACTORY_CONTROLLER_SHA"',
    '--candidate-root "$GITHUB_WORKSPACE/candidate"',
  ];
  if (!context
    || workflowExpression(context.env.FACTORY_CONTROLLER_SHA) !== '${{vars.FACTORY_CONTROLLER_SHA}}'
    || requiredContextTokens.some((token) => !context.run.includes(token))) {
    findings.push(finding('delivery-workflow-controller-verification-missing', 'workflow must verify the full protected controller SHA and disjoint checkout roots before executing controller code', file));
  }
  return findings;
}

function exactWorkflowMap(actual, expected) {
  const actualKeys = Object.keys(actual || {}).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key, index) => (
    actualKeys[index] === key && workflowExpression(actual[key]) === workflowExpression(expected[key])
  ));
}

function policyWorkflowFindings(structure, text, file) {
  const findings = [];
  const expectedJobs = ['validate'];
  const actualJobs = [...structure.jobIds].sort();
  if (actualJobs.length !== expectedJobs.length || ![...expectedJobs].sort().every((job, index) => actualJobs[index] === job)
    || structure.jobPermissionBlocks !== 0
    || structure.jobEnvironments.length !== 0) {
    findings.push(finding('delivery-policy-job-surface-invalid', 'policy must contain only the protected validate job, with no job permission or environment override', file));
  }
  if (structure.triggers.length !== 1 || structure.triggers[0] !== 'pull_request_target') {
    findings.push(finding('delivery-policy-definition-source-invalid', 'policy must be loaded only through pull_request_target from the protected base', file));
  }
  if (!exactWorkflowPermissions(structure.permissions, { contents: 'read' })) {
    findings.push(finding('delivery-workflow-permission-surface-invalid', 'policy permissions must be exactly contents: read', file));
  }
  if (structure.secretReferences.length !== 0) {
    findings.push(finding('delivery-workflow-secret-scope-invalid', 'policy jobs must not reference repository or environment secrets', file));
  }
  if (!exactActionSurface(structure, [
    'actions/checkout', 'actions/checkout', 'actions/checkout', 'actions/setup-node',
  ])) {
    findings.push(finding('delivery-workflow-action-surface-invalid', 'policy action surface must be exactly one protected controller, one data-only candidate, one data-only published-base checkout and one Node setup step', file));
  }

  const expectedControllerEnvironment = {
    FACTORY_CONTROLLER_SHA: '${{ vars.FACTORY_CONTROLLER_SHA }}',
    FACTORY_CANDIDATE_SHA: '${{ github.event.pull_request.head.sha }}',
  };
  const expectedContractsEnvironment = {
    ...expectedControllerEnvironment,
    FACTORY_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
  };
  if (!exactWorkflowMap(structure.jobEnvs.validate, expectedContractsEnvironment)) {
    findings.push(finding('delivery-policy-job-binding-invalid', 'policy job environment must bind only the protected controller SHA and exact candidate/base SHAs', file));
  }

  const needs = structure.jobNeeds || {};
  if ((needs.validate || []).length !== 0 || structure.jobIf.validate) {
    findings.push(finding('delivery-policy-job-order-invalid', 'protected validation must be a single unconditional job with no candidate execution dependency', file));
  }

  for (const job of ['validate']) {
    const steps = structure.steps.filter((step) => step.job === job);
    const checkouts = steps.filter((step) => step.uses?.startsWith('actions/checkout@'));
    const controller = checkouts.find((step) => step.with.path === 'factory-controller');
    const candidate = checkouts.find((step) => step.with.path === 'candidate');
    const publishedBase = checkouts.find((step) => step.with.path === 'published-base');
    const setup = steps.filter((step) => step.uses?.startsWith('actions/setup-node@'));
    if (checkouts.length !== 3
      || !controller
      || workflowExpression(controller.with.ref) !== '${{vars.FACTORY_CONTROLLER_SHA}}'
      || controller.with.repository
      || controller.with['fetch-depth'] !== '1'
      || controller.with['persist-credentials'] !== 'false'
      || !candidate
      || workflowExpression(candidate.with.repository) !== '${{github.event.pull_request.head.repo.full_name}}'
      || workflowExpression(candidate.with.ref) !== '${{github.event.pull_request.head.sha}}'
      || candidate.with['fetch-depth'] !== '0'
      || candidate.with['persist-credentials'] !== 'false'
      || !publishedBase
        || workflowExpression(publishedBase.with.ref) !== '${{github.event.pull_request.base.sha}}'
        || publishedBase.with.repository
        || publishedBase.with['fetch-depth'] !== '1'
        || publishedBase.with['persist-credentials'] !== 'false'
      || setup.length !== 1
      || setup[0].with['node-version'] !== '20'
      || setup[0].with['package-manager-cache'] !== 'false') {
      findings.push(finding('delivery-workflow-checkout-boundary-invalid', `${job} must use exact disjoint protected-controller and credential-free candidate checkouts`, file));
    }
  }

  const contextRun = 'node "$GITHUB_WORKSPACE/factory-controller/scripts/factory-workflow-context.mjs" --controller-root "$GITHUB_WORKSPACE/factory-controller" --controller-sha "$FACTORY_CONTROLLER_SHA" --candidate-root "$GITHUB_WORKSPACE/candidate" --candidate-sha "$FACTORY_CANDIDATE_SHA" --json';
  const expectedRuns = new Map([
    ['validate:contracts-context', contextRun],
    ['validate:suite', 'node "$GITHUB_WORKSPACE/factory-controller/scripts/test-factory-suite.mjs" --subject-root "$GITHUB_WORKSPACE/candidate" --baseline-root "$GITHUB_WORKSPACE/published-base" --baseline-sha "$FACTORY_BASE_SHA"'],
    ['validate:factory', 'node "$GITHUB_WORKSPACE/factory-controller/scripts/validate-factory.mjs" --root "$GITHUB_WORKSPACE/candidate" --json'],
    ['validate:delivery-templates', 'node "$GITHUB_WORKSPACE/factory-controller/scripts/validate-delivery.mjs" --root "$GITHUB_WORKSPACE/candidate" --lint-template --allow-unadopted-workflows --json'],
    ['validate:delivery-package', 'node "$GITHUB_WORKSPACE/factory-controller/scripts/validate-delivery.mjs" --root "$GITHUB_WORKSPACE/candidate" --package scripts/fixtures/factory-delivery --environment scripts/fixtures/factory-delivery/environment.yaml --ci scripts/fixtures/factory-delivery/ci.yaml --allow-unadopted-workflows --json'],
    ['validate:corpus', 'node "$GITHUB_WORKSPACE/factory-controller/scripts/validate-corpus.mjs" --root "$GITHUB_WORKSPACE/candidate" --json'],
  ]);
  const executable = structure.steps.filter((step) => step.run);
  for (const step of executable) {
    const key = `${step.job}:${step.id}`;
    if (!expectedRuns.has(key) || step.run !== expectedRuns.get(key) || step.workingDirectory) {
      findings.push(finding('delivery-workflow-trust-anchor-invalid', `policy executable step ${key} is not the exact protected-controller command`, file));
    }
  }
  for (const key of expectedRuns.keys()) {
    if (!executable.some((step) => `${step.job}:${step.id}` === key)) findings.push(finding('delivery-workflow-template-incomplete', `policy is missing protected executable step ${key}`, file));
  }
  const suite = structure.steps.find((step) => step.job === 'validate' && step.id === 'suite');
  if (!suite || Object.keys(suite.env || {}).length !== 0) {
    findings.push(finding('delivery-policy-baseline-binding-invalid', 'portable policy validation must bind the exact pull-request base through the protected job contract only', file));
  }
  for (const step of structure.steps.filter((candidate) => candidate.run)) {
    if (Object.keys(step.env || {}).length !== 0) findings.push(finding('delivery-workflow-secret-scope-invalid', `policy step ${step.id} must receive no step-scoped environment`, file));
  }
  if (!/^\s*pull_request_target\s*:\s*$/m.test(text)) {
    findings.push(finding('delivery-policy-definition-source-invalid', 'policy pull_request_target trigger must be an explicit mapping loaded from the protected base', file));
  }
  return findings;
}

function privilegedWorkflowDefinitionFindings(structure, text, file, eventType, job) {
  const findings = [];
  if (structure.triggers.length !== 1 || structure.triggers[0] !== 'repository_dispatch'
    || /^\s*workflow_dispatch\s*:/m.test(text)
    || !new RegExp(`^\\s{4}types:\\s*\\[${eventType}\\]\\s*$`, 'm').test(text)) {
    findings.push(finding('delivery-workflow-definition-source-invalid', `${job} must be loaded from the protected default branch through the exact ${eventType} repository_dispatch event`, file));
  }
  if (workflowExpression(structure.jobIf[job]) !== '${{github.sha==vars.FACTORY_CONTROLLER_SHA}}') {
    findings.push(finding('delivery-workflow-controller-pin-missing', `${job} must fail closed unless the default-branch workflow revision equals FACTORY_CONTROLLER_SHA`, file));
  }
  return findings;
}

function acceptanceWorkflowFindings(structure, text, file) {
  const findings = [
    ...privilegedWorkflowDefinitionFindings(structure, text, file, 'factory-acceptance', 'acceptance'),
    ...protectedCheckoutFindings(structure, { candidateRef: '${{ github.event.client_payload.candidate_sha }}', file }),
  ];
  if (structure.jobIds.length !== 1 || structure.jobIds[0] !== 'acceptance' || structure.jobPermissionBlocks !== 0) findings.push(finding('delivery-workflow-job-surface-invalid', 'acceptance workflow must contain exactly one job and no job-level permission override', file));
  if (!exactWorkflowPermissions(structure.permissions, { contents: 'read' })) findings.push(finding('delivery-workflow-permission-surface-invalid', 'acceptance workflow permissions must be exactly contents: read', file));
  if (!exactActionSurface(structure, ['actions/checkout', 'actions/checkout', 'actions/setup-node', 'actions/upload-artifact', 'actions/upload-artifact'])) findings.push(finding('delivery-workflow-action-surface-invalid', 'acceptance workflow contains an action outside its exact checkout/setup/upload surface', file));
  if (!structure.jobEnvironments.includes('factory-acceptance')) findings.push(finding('delivery-workflow-protected-environment-missing', 'acceptance workflow must use the protected factory-acceptance environment', file));
  if (workflowExpression(structure.jobEnv.FACTORY_INPUT_CANDIDATE_SHA) !== '${{github.event.client_payload.candidate_sha}}'
    || workflowExpression(structure.jobEnv.FACTORY_RAW_EVIDENCE_ROOT) !== '${{runner.temp}}/factory-evidence-quarantine'
    || workflowExpression(structure.jobEnv.FACTORY_STAGING_ROOT) !== '${{runner.temp}}/factory-evidence-staging'
    || workflowExpression(structure.jobEnv.FACTORY_ENVELOPE_ROOT) !== '${{runner.temp}}/factory-evidence-envelope') {
    findings.push(finding('delivery-workflow-job-binding-invalid', 'acceptance job must bind disjoint quarantine, minimized staging and envelope roots exactly', file));
  }

  const context = structure.steps.find((step) => step.id === 'contract');
  if (!context
    || !context.run?.includes('$GITHUB_WORKSPACE/factory-controller/scripts/factory-workflow-context.mjs')
    || !context.run.includes('--candidate-sha "$FACTORY_INPUT_CANDIDATE_SHA"')
    || !context.run.includes('--ci "$FACTORY_INPUT_CI"')
    || !context.run.includes('--github-output "$GITHUB_OUTPUT"')) {
    findings.push(finding('delivery-workflow-ci-contract-source-invalid', 'acceptance retention must be resolved from the selected candidate CI contract by the protected controller', file));
  }

  for (const step of structure.steps) if (/\bnpm\s+(?:ci|install)\b/.test(step.run || '')) {
    findings.push(finding('delivery-workflow-candidate-install-unsafe', 'the fail-closed installable worker must not resolve or execute candidate-controlled dependencies', file));
  }

  const campaign = structure.steps.find((step) => step.id === 'campaign');
  const campaignTokens = [
    '$GITHUB_WORKSPACE/factory-controller/scripts/factory-acceptance.mjs',
    '--root "$GITHUB_WORKSPACE/candidate"',
    '--controller-root "$GITHUB_WORKSPACE/factory-controller"',
    '--observation-out "$FACTORY_RAW_EVIDENCE_ROOT/environment-observation.json"',
    '--lifecycle-out "$FACTORY_RAW_EVIDENCE_ROOT/factory-lifecycle.json"',
    '--evidence-root "$FACTORY_RAW_EVIDENCE_ROOT"',
  ];
  if (!campaign || campaignTokens.some((token) => !campaign.run?.includes(token))) findings.push(finding('delivery-workflow-protected-controller-command-invalid', 'acceptance lifecycle and adapter must be launched by the protected controller against the candidate root', file));
  if (campaign && (shellControlOutsideQuotes(campaign.run) || optionCount(campaign.run, '--root') !== 1 || optionCount(campaign.run, '--controller-root') !== 1)) findings.push(finding('delivery-workflow-protected-controller-command-invalid', 'acceptance controller command cannot chain shell commands or override protected roots', file));
  if (!campaign || Object.keys(campaign.env || {}).length !== 0 || structure.secretReferences.length !== 0) findings.push(finding('delivery-workflow-secret-scope-invalid', 'the fail-closed installable acceptance worker and its validation steps must receive no application secret', file));

  const stage = structure.steps.find((step) => step.id === 'stage');
  if (!stage?.run?.includes('$GITHUB_WORKSPACE/factory-controller/scripts/factory-stage-evidence.mjs')
    || !stage.run.includes('--raw-root "$FACTORY_RAW_EVIDENCE_ROOT"')
    || !stage.run.includes('--out "$FACTORY_STAGING_ROOT"')
    || !stage.run.includes('--manifest-out "$FACTORY_ENVELOPE_ROOT/staging-manifest.json"')) findings.push(finding('delivery-workflow-staging-missing', 'raw output must pass through protected fail-closed staging before any upload', file));

  const protectedPostProcessing = [];
  for (const [id, script] of [['evidence', 'factory-evidence.mjs'], ['report', 'factory-report.mjs']]) {
    const step = structure.steps.find((candidate) => candidate.id === id);
    protectedPostProcessing.push(step);
    if (!step?.run?.includes(`$GITHUB_WORKSPACE/factory-controller/scripts/${script}`) || !step.run.includes('--root "$GITHUB_WORKSPACE/candidate"')) {
      findings.push(finding('delivery-workflow-protected-controller-command-invalid', `${script} must execute from the protected controller against the candidate root`, file));
    }
    if (step && (shellControlOutsideQuotes(step.run) || optionCount(step.run, '--root') !== 1)) findings.push(finding('delivery-workflow-protected-controller-command-invalid', `${script} cannot chain shell commands or override the candidate root`, file));
  }

  const verdict = structure.steps.find((step) => step.name === 'Enforce honest campaign verdict');
  const exactVerdict = 'test "$FACTORY_CAMPAIGN_OUTCOME" = success -a "$FACTORY_STAGE_OUTCOME" = success -a "$FACTORY_SANITIZED_OUTCOME" = success -a "$FACTORY_EVIDENCE_OUTCOME" = success -a "$FACTORY_REPORT_OUTCOME" = success -a "$FACTORY_ENVELOPE_OUTCOME" = success';
  const allowedRuns = new Set([context, campaign, stage, ...protectedPostProcessing, verdict].filter(Boolean));
  if (structure.steps.some((step) => step.run && !allowedRuns.has(step)) || verdict?.run !== exactVerdict || [context, campaign, ...protectedPostProcessing].filter(Boolean).some((step) => shellControlOutsideQuotes(step.run))) {
    findings.push(finding('delivery-workflow-run-surface-invalid', 'acceptance workflow contains an executable command outside the exact protected controller and verdict surface', file));
  }

  const sanitizedUpload = structure.steps.find((step) => step.id === 'sanitized-evidence' && step.uses?.startsWith('actions/upload-artifact@'));
  if (!sanitizedUpload
    || workflowExpression(sanitizedUpload.with.path) !== '${{runner.temp}}/factory-evidence-staging'
    || workflowExpression(sanitizedUpload.with.name) !== 'factory-evidence-bundle-${{github.run_id}}') findings.push(finding('delivery-workflow-staging-upload-invalid', 'the first upload must contain only the exact minimized staging root', file));
  const uploads = structure.steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@'));
  if (uploads.some((step) => workflowExpression(step.with.path)?.includes('factory-evidence-quarantine'))) findings.push(finding('delivery-workflow-raw-upload-forbidden', 'quarantine/raw evidence must never be uploaded', file));
  const retentionOutput = '${{steps.contract.outputs.retention_days}}';
  if (uploads.length !== 2 || uploads.some((step) => workflowExpression(step.with['retention-days']) !== retentionOutput)) {
    findings.push(finding('delivery-workflow-retention-source-invalid', 'every acceptance artifact upload must use retention_days resolved from the selected CI contract', file));
  }
  return findings;
}

function draftPrWorkflowFindings(structure, text, file) {
  const findings = [
    ...privilegedWorkflowDefinitionFindings(structure, text, file, 'factory-draft-pr', 'draft-pr'),
    ...protectedCheckoutFindings(structure, { candidateRef: '${{ github.event.client_payload.head_sha }}', file }),
  ];
  if (structure.jobIds.length !== 1 || structure.jobIds[0] !== 'draft-pr' || structure.jobPermissionBlocks !== 0) findings.push(finding('delivery-workflow-job-surface-invalid', 'draft PR workflow must contain exactly one job and no job-level permission override', file));
  if (!exactWorkflowPermissions(structure.permissions, { actions: 'read', contents: 'read', checks: 'read', 'pull-requests': 'write' })) findings.push(finding('delivery-workflow-permission-surface-invalid', 'draft PR workflow permissions exceed its exact read plus draft-PR write surface', file));
  if (!exactActionSurface(structure, ['actions/checkout', 'actions/checkout', 'actions/setup-node', 'actions/download-artifact', 'actions/download-artifact', 'actions/download-artifact'])) findings.push(finding('delivery-workflow-action-surface-invalid', 'draft PR workflow contains an action outside its exact checkout/setup/download surface', file));
  if (!structure.jobEnvironments.includes('factory-delivery')) findings.push(finding('delivery-workflow-protected-environment-missing', 'draft PR workflow must use the protected factory-delivery environment', file));
  if (workflowExpression(structure.jobEnv.FACTORY_INPUT_HEAD_SHA) !== '${{github.event.client_payload.head_sha}}') findings.push(finding('delivery-workflow-job-binding-invalid', 'draft PR job must bind the exact authorized head input', file));
  const context = structure.steps.find((step) => step.run?.includes('$GITHUB_WORKSPACE/factory-controller/scripts/factory-workflow-context.mjs'));
  if (!context?.run?.includes('--candidate-sha "$FACTORY_INPUT_HEAD_SHA"')) findings.push(finding('delivery-workflow-controller-verification-missing', 'draft PR workflow must verify the exact candidate head checkout', file));
  const delivery = structure.steps.find((step) => step.run?.includes('$GITHUB_WORKSPACE/factory-controller/scripts/factory-pr.mjs'));
  const tokens = [
    '--execute',
    '--root "$GITHUB_WORKSPACE/candidate"',
    '--trust-root "$GITHUB_WORKSPACE/factory-controller"',
    '--authorization-public-key "$FACTORY_AUTHORIZATION_PUBLIC_KEY_PATH"',
    '--factory-events "$FACTORY_EVIDENCE_ROOT/events.v3.jsonl"',
    '--factory-state "$FACTORY_EVIDENCE_ROOT/state.v3.json"',
    '--release-metadata "$FACTORY_EVIDENCE_ROOT/release-envelope.json"',
    '--release-run-id "$FACTORY_INPUT_RELEASE_RUN_ID"',
    '--release-controller-sha "$FACTORY_RELEASE_CONTROLLER_SHA"',
  ];
  if (!delivery
    || tokens.some((token) => !delivery.run.includes(token))
    || shellControlOutsideQuotes(delivery.run)
    || optionCount(delivery.run, '--execute') !== 1
    || optionCount(delivery.run, '--root') !== 1
    || optionCount(delivery.run, '--trust-root') !== 1
    || optionCount(delivery.run, '--authorization-public-key') !== 1
    || workflowExpression(delivery.env.FACTORY_AUTHORIZATION_PUBLIC_KEY_PATH) !== '${{vars.FACTORY_AUTHORIZATION_PUBLIC_KEY_PATH}}'
    || workflowExpression(delivery.env.FACTORY_RELEASE_CONTROLLER_SHA) !== '${{vars.FACTORY_CONTROLLER_SHA}}') {
    findings.push(finding('delivery-workflow-trust-anchor-invalid', 'draft PR execution and authorization trust anchor must come from the disjoint protected controller checkout', file));
  }
  if (structure.steps.some((step) => /(?:^|\s)node\s+scripts\/factory-pr\.mjs(?:\s|$)/.test(step.run || ''))) findings.push(finding('delivery-workflow-trust-anchor-invalid', 'candidate-local factory-pr.mjs execution is forbidden', file));
  const receipt = structure.steps.find((step) => step.name === 'Materialize signed external authorization receipt');
  const exactReceipt = `node -e "const fs=require('node:fs'); JSON.parse(process.env.FACTORY_AUTHORIZATION_RECEIPT); fs.writeFileSync(process.env.RUNNER_TEMP + '/factory-authorization-receipt.json', process.env.FACTORY_AUTHORIZATION_RECEIPT + '\\n', {encoding:'utf8',mode:0o600});"`;
  const allowedRuns = new Set([context, receipt, delivery].filter(Boolean));
  if (structure.steps.some((step) => step.run && !allowedRuns.has(step)) || receipt?.run !== exactReceipt || [context, delivery].filter(Boolean).some((step) => shellControlOutsideQuotes(step.run))) {
    findings.push(finding('delivery-workflow-run-surface-invalid', 'draft PR workflow contains executable code outside context verification, receipt materialization and protected draft delivery', file));
  }
  return findings;
}

function releaseWorkflowFindings(structure, text, file) {
  const findings = [
    ...privilegedWorkflowDefinitionFindings(structure, text, file, 'factory-release', 'release'),
    ...protectedCheckoutFindings(structure, { candidateRef: '${{ github.event.client_payload.candidate_sha }}', candidateFetchDepth: '0', file }),
  ];
  if (structure.jobIds.length !== 1 || structure.jobIds[0] !== 'release' || structure.jobPermissionBlocks !== 0) findings.push(finding('delivery-workflow-job-surface-invalid', 'release workflow must contain exactly one job and no job-level permission override', file));
  if (!exactWorkflowPermissions(structure.permissions, { actions: 'read', contents: 'read' })) findings.push(finding('delivery-workflow-permission-surface-invalid', 'release workflow permissions must be exactly actions: read and contents: read', file));
  if (!exactActionSurface(structure, ['actions/checkout', 'actions/checkout', 'actions/setup-node', 'actions/download-artifact', 'actions/download-artifact', 'actions/upload-artifact'])) findings.push(finding('delivery-workflow-action-surface-invalid', 'release workflow contains an action outside its exact checkout/setup/download/upload surface', file));
  if (!structure.jobEnvironments.includes('factory-release')) findings.push(finding('delivery-workflow-protected-environment-missing', 'release workflow must use the protected factory-release environment', file));
  if (structure.secretReferences.length !== 0) findings.push(finding('delivery-workflow-secret-scope-invalid', 'release derivation must not receive secrets', file));
  const context = structure.steps.find((step) => step.id === 'contract');
  const acceptanceAttestation = structure.steps.find((step) => step.run?.includes('$GITHUB_WORKSPACE/factory-controller/scripts/factory-actions-attestation.mjs'));
  const release = structure.steps.find((step) => step.run?.includes('$GITHUB_WORKSPACE/factory-controller/scripts/factory-release.mjs'));
  const required = [
    '--root "$GITHUB_WORKSPACE/candidate"',
    '--controller-root "$GITHUB_WORKSPACE/factory-controller"',
    '--controller-sha "$FACTORY_CONTROLLER_SHA"',
    '--candidate-sha "$FACTORY_INPUT_CANDIDATE_SHA"',
    '--acceptance-run-id "$FACTORY_INPUT_ACCEPTANCE_RUN_ID"',
    '--acceptance-attestation "$FACTORY_ACCEPTANCE_ATTESTATION"',
    '--repository "$GITHUB_REPOSITORY"',
    '--out "$FACTORY_RELEASE_ROOT"',
  ];
  if (!acceptanceAttestation
    || !acceptanceAttestation.run.includes('--workflow-ref ".github/workflows/factory-acceptance.yml"')
    || !acceptanceAttestation.run.includes('--artifact-name "factory-evidence-envelope-$FACTORY_INPUT_ACCEPTANCE_RUN_ID"')
    || !acceptanceAttestation.run.includes('--candidate-sha "$FACTORY_INPUT_CANDIDATE_SHA"')
    || !acceptanceAttestation.run.includes('--workflow-sha "$FACTORY_CONTROLLER_SHA"')
    || workflowExpression(acceptanceAttestation.env.GH_TOKEN) !== '${{github.token}}'
    || workflowExpression(acceptanceAttestation.env.FACTORY_CONTROLLER_SHA) !== '${{vars.FACTORY_CONTROLLER_SHA}}'
    || shellControlOutsideQuotes(acceptanceAttestation.run)) findings.push(finding('delivery-workflow-acceptance-attestation-invalid', 'release must resolve the exact successful acceptance run and evidence envelope through the protected controller', file));
  if (!release
    || required.some((token) => !release.run.includes(token))
    || workflowExpression(release.env.FACTORY_RELEASE_REVIEW_RECEIPT) !== '${{github.event.client_payload.review_receipt_json}}'
    || workflowExpression(release.env.FACTORY_REVIEW_PUBLIC_KEY_PATH) !== '${{vars.FACTORY_REVIEW_PUBLIC_KEY_PATH}}'
    || shellControlOutsideQuotes(release.run)
    || optionCount(release.run, '--root') !== 1
    || optionCount(release.run, '--controller-root') !== 1) findings.push(finding('delivery-workflow-protected-controller-command-invalid', 'release must consume one signed fresh-context review and be derived once by the protected controller against the exact candidate and acceptance run', file));
  const allowedRuns = new Set([context, acceptanceAttestation, release].filter(Boolean));
  if (structure.steps.some((step) => step.run && !allowedRuns.has(step))) findings.push(finding('delivery-workflow-run-surface-invalid', 'release workflow contains executable code outside context verification and protected release derivation', file));
  const upload = structure.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  if (!upload
    || workflowExpression(upload.with.name) !== 'factory-release-envelope-${{github.run_id}}'
    || workflowExpression(upload.with.path) !== '${{runner.temp}}/factory-release-envelope'
    || workflowExpression(upload.with['retention-days']) !== '${{steps.contract.outputs.retention_days}}') findings.push(finding('delivery-workflow-release-upload-invalid', 'release workflow must upload the exact controller output with selected CI retention', file));
  return findings;
}

export function validateDeliveryWorkflowTemplates({ root = process.cwd(), requireActiveWorkflows = true } = {}) {
  const findings = [];
  const directory = path.join(root, '.github/templates/software-factory/delivery');
  let expectedRetention = null;
  try {
    expectedRetention = readData(path.join(directory, 'factory-ci.yaml'))?.artifacts?.retention_days;
  } catch (error) {
    findings.push(finding('delivery-workflow-contract-unreadable', error.message, 'factory-ci.yaml'));
  }
  for (const [name, contract] of Object.entries(DELIVERY_WORKFLOW_TEMPLATES)) {
    let resolved;
    try {
      resolved = resolveContainedRegularFile(root, path.join(directory, name));
    } catch (error) {
      findings.push(finding('delivery-workflow-template-missing', `${name}: ${error.message}`, name));
      continue;
    }
    const text = fs.readFileSync(resolved.absolute, 'utf8');
    const structure = workflowStructure(text);
    let active = null;
    let activeText = null;
    let activeStructure = null;
    try {
      active = resolveContainedRegularFile(root, path.join(root, '.github/workflows', contract.active));
      activeText = fs.readFileSync(active.absolute, 'utf8');
      activeStructure = workflowStructure(activeText);
    } catch (error) {
      if (requireActiveWorkflows) findings.push(finding('delivery-workflow-active-missing', `${contract.active}: ${error.message}`, contract.active));
    }
    if (name !== 'factory-policy.workflow.yml'
      && (/^\s*pull_request_target\s*:/m.test(text) || (activeText && /^\s*pull_request_target\s*:/m.test(activeText)))) {
      findings.push(finding('delivery-workflow-template-unsafe', `${name} uses pull_request_target`, resolved.relative));
    }
    for (const expected of contract.runs) if (!structure.runs.some((command) => expected.pattern.test(command))) findings.push(finding('delivery-workflow-template-incomplete', `${name} has no executable run step for ${expected.label}`, resolved.relative));
    for (const expected of contract.actions) if (!structure.actions.some((reference) => reference.startsWith(`${expected}@`))) findings.push(finding('delivery-workflow-template-incomplete', `${name} has no ${expected} action step`, resolved.relative));
    for (const command of structure.runs) if (/\$\{\{\s*(?:(?:github\.event\.)?inputs|github\.event\.client_payload)\./.test(command)) findings.push(finding('delivery-workflow-input-shell-interpolation', `${name} interpolates workflow input directly in a run command`, resolved.relative));
    for (const reference of structure.actions) {
      if (!reference.startsWith('./') && !/@[0-9a-f]{40}$/i.test(reference) && !/^docker:\/\/[^@]+@sha256:[0-9a-f]{64}$/i.test(reference)) findings.push(finding('delivery-workflow-action-not-pinned', `${name} contains unpinned action ${reference}`, resolved.relative));
    }
    if (name === 'factory-policy.workflow.yml') findings.push(...policyWorkflowFindings(structure, text, resolved.relative));
    else if (name === 'factory-acceptance.workflow.yml') findings.push(...acceptanceWorkflowFindings(structure, text, resolved.relative));
    else if (name === 'factory-release.workflow.yml') findings.push(...releaseWorkflowFindings(structure, text, resolved.relative));
    else if (name === 'factory-draft-pr.workflow.yml') findings.push(...draftPrWorkflowFindings(structure, text, resolved.relative));
    else if (structure.retentionDays.some((days) => days !== expectedRetention) || (activeStructure && activeStructure.retentionDays.some((days) => days !== expectedRetention))) findings.push(finding('delivery-workflow-retention-mismatch', `${name} artifact retention must equal factory-ci artifacts.retention_days (${expectedRetention})`, resolved.relative));
    if (activeStructure && (workflowFingerprint(structure) !== workflowFingerprint(activeStructure) || normalizedWorkflowText(text) !== normalizedWorkflowText(activeText))) findings.push(finding('delivery-workflow-active-drift', `${contract.active} is not semantically identical to installable ${name}`, active.relative));
  }
  return findings;
}

export function validateEnvironment(environment, ci, { file = 'environment-contract.yaml', allowPlaceholders = false } = {}) {
  const findings = [];
  ensureRequired(environment, ['version', 'profiles'], 'environment', findings, file);
  if (environment?.version !== 1) findings.push(finding('environment-version-unsupported', 'environment.version must be 1', file));
  if (!Array.isArray(environment?.profiles) || environment.profiles.length === 0) {
    findings.push(finding('environment-profile-missing', 'at least one environment profile is required', file));
    return findings;
  }
  const operations = operationIds(ci);
  for (const duplicate of duplicateIds(environment.profiles)) findings.push(finding('environment-profile-duplicate', `duplicate environment profile ${duplicate}`, file));
  for (const profile of environment.profiles) {
    const scope = `profiles.${profile?.id || '?'}`;
    const surfaceCanBeNotApplicable = profile?.runtime_type === 'cli' || profile?.runtime_type === 'library';
    ensureRequired(profile, ['id', 'kind', 'runtime_type', 'automated', 'operations', 'endpoint', 'revision', 'auth', 'data', 'mutation_policy', 'network'], scope, findings, file);
    enumValue(profile?.kind, PROFILE_KINDS, 'environment-profile-invalid', `${scope}.kind`, findings, file);
    enumValue(profile?.runtime_type, new Set(['server', 'cli', 'library', 'remote_service']), 'environment-profile-invalid', `${scope}.runtime_type`, findings, file);
    const endpointNotApplicable = profile?.endpoint?.not_applicable === true;
    if (endpointNotApplicable) {
      validateNotApplicable(profile.endpoint, `${scope}.endpoint`, findings, file);
      if (!surfaceCanBeNotApplicable) findings.push(finding('environment-endpoint-required', `${profile.id} must declare a concrete endpoint`, file));
    } else {
      ensureRequired(profile?.endpoint, ['base_url_from', 'tls'], `${scope}.endpoint`, findings, file);
      if (!ENV_REFERENCE_PATTERN.test(profile?.endpoint?.base_url_from || '') && !(allowPlaceholders && isPlaceholder(profile?.endpoint?.base_url_from))) findings.push(finding('environment-endpoint-invalid', `${scope}.endpoint.base_url_from must be an environment-variable reference`, file));
      if (!['strict', 'local_self_signed'].includes(profile?.endpoint?.tls)) findings.push(finding('environment-tls-policy-invalid', `${scope}.endpoint.tls is invalid`, file));
      if (profile?.endpoint?.tls === 'local_self_signed' && profile?.kind !== 'local') {
        findings.push(finding('environment-tls-policy-invalid', 'local_self_signed TLS is allowed only for a local profile', file));
      }
    }
    if (profile?.revision?.must_equal_subject_sha !== true || !['probe', 'image_label', 'build_manifest'].includes(profile?.revision?.source)) {
      findings.push(finding('environment-revision-unbound', `${profile.id} must expose and compare its deployed revision`, file));
    }
    ensureRequired(profile?.operations, Object.keys(REQUIRED_ENVIRONMENT_OPERATIONS), `${scope}.operations`, findings, file);
    for (const [role, expectedSideEffect] of Object.entries(REQUIRED_ENVIRONMENT_OPERATIONS)) {
      const operation = profile?.operations?.[role];
      if (!operation) continue;
      if (requiredObject(operation)) {
        validateNotApplicable(operation, `${scope}.operations.${role}`, findings, file);
        if (profile.runtime_type === 'server' && ['build', 'start', 'health', 'stop', 'reset', 'revision_probe'].includes(role)) findings.push(finding('environment-operation-required', `${profile.id}.${role} cannot be not_applicable for a server runtime`, file));
      } else if (typeof operation !== 'string') findings.push(finding('environment-operation-invalid', `${profile.id}.${role} must be an operation id or structured not_applicable declaration`, file));
      else if (!operations.has(operation)) findings.push(finding('environment-operation-unknown', `${profile.id}.${role} references unknown operation ${operation}`, file));
      else if (ci.operations[operation]?.side_effect !== expectedSideEffect) findings.push(finding('environment-operation-side-effect-invalid', `${profile.id}.${role} must reference a ${expectedSideEffect} operation`, file));
    }
    for (const [role, operation] of Object.entries(profile?.operations || {})) {
      if (typeof operation === 'string' && !operations.has(operation)) findings.push(finding('environment-operation-unknown', `${profile.id}.${role} references unknown operation ${operation}`, file));
    }
    for (const dependency of asArray(profile?.dependencies)) {
      ensureRequired(dependency, ['id', 'kind', 'readiness_operation', 'required'], `${scope}.dependencies.${dependency?.id || '?'}`, findings, file);
      if (dependency?.readiness_operation && !operations.has(dependency.readiness_operation)) {
        findings.push(finding('environment-operation-unknown', `dependency ${dependency.id} references unknown operation ${dependency.readiness_operation}`, file));
      } else if (dependency?.readiness_operation && ci?.operations?.[dependency.readiness_operation]?.side_effect !== 'none') {
        findings.push(finding('environment-probe-side-effect-invalid', `dependency ${dependency.id} readiness probe must be side-effect-free`, file));
      }
      if (dependency?.version_operation && !operations.has(dependency.version_operation)) {
        findings.push(finding('environment-operation-unknown', `dependency ${dependency.id} references unknown version operation ${dependency.version_operation}`, file));
      } else if (dependency?.version_operation && ci?.operations?.[dependency.version_operation]?.side_effect !== 'none') {
        findings.push(finding('environment-probe-side-effect-invalid', `dependency ${dependency.id} version probe must be side-effect-free`, file));
      }
    }
    const authNotApplicable = profile?.auth?.not_applicable === true;
    if (authNotApplicable) {
      validateNotApplicable(profile.auth, `${scope}.auth`, findings, file);
      if (!surfaceCanBeNotApplicable) findings.push(finding('environment-auth-required', `${profile.id} must declare a concrete authentication strategy`, file));
    } else {
      enumValue(profile?.auth?.mode, AUTH_MODES, 'environment-auth-invalid', `${scope}.auth.mode`, findings, file);
      if (profile?.automated === true && (profile?.auth?.mode === 'interactive' || profile?.auth?.automated_compatible !== true)) {
        findings.push(finding('acceptance-not-unattended', `${profile.id} is automated but its authentication requires interaction`, file));
      }
      ensureRequired(profile?.auth, ['mode', 'actor_ref', 'automated_compatible', 'secret_refs'], `${scope}.auth`, findings, file);
      if (profile?.auth?.actor_ref && !SAFE_REFERENCE_PATTERN.test(profile.auth.actor_ref) && !(allowPlaceholders && isPlaceholder(profile.auth.actor_ref))) findings.push(finding('environment-auth-reference-invalid', `${scope}.auth.actor_ref must be a logical reference, never a credential value`, file));
      if (!Array.isArray(profile?.auth?.secret_refs)) findings.push(finding('environment-auth-reference-invalid', `${scope}.auth.secret_refs must be an array of logical references`, file));
      for (const ref of asArray(profile?.auth?.secret_refs)) if (!SAFE_REFERENCE_PATTERN.test(ref) && !(allowPlaceholders && isPlaceholder(ref))) findings.push(finding('environment-auth-reference-invalid', `${scope}.auth.secret_refs contains an invalid reference`, file));
      if (profile?.auth?.mode === 'ephemeral_storage_state' && !asArray(profile.auth.secret_refs).some((ref) => EPHEMERAL_STORAGE_INPUTS.has(ref))) {
        findings.push(finding('environment-storage-state-reference-missing', `${scope}.auth.secret_refs must declare FACTORY_EPHEMERAL_STORAGE_STATE_JSON or FACTORY_EPHEMERAL_STORAGE_STATE`, file));
      }
    }
    const data = profile?.data || {};
    const dataNotApplicable = data?.not_applicable === true;
    if (dataNotApplicable) {
      validateNotApplicable(data, `${scope}.data`, findings, file);
      if (!surfaceCanBeNotApplicable) findings.push(finding('environment-data-required', `${profile.id} must declare a concrete data strategy`, file));
    } else {
      enumValue(data?.isolation, DATA_ISOLATIONS, 'environment-data-invalid', `${scope}.data.isolation`, findings, file);
      ensureRequired(data, ['isolation', 'dataset_id_from', 'dataset_version_from', 'cleanup_required'], `${scope}.data`, findings, file);
      for (const key of ['seed_operation', 'cleanup_operation']) if (!Object.hasOwn(data, key)) findings.push(finding('delivery-required-field-missing', `${scope}.data.${key} must be declared, using null when not applicable`, file));
      for (const key of ['dataset_id_from', 'dataset_version_from']) if (!ENV_REFERENCE_PATTERN.test(data[key] || '') && !(allowPlaceholders && isPlaceholder(data[key]))) findings.push(finding('environment-data-invalid', `${scope}.data.${key} must be an environment-variable reference`, file));
      if (typeof data.cleanup_required !== 'boolean') findings.push(finding('environment-data-invalid', `${scope}.data.cleanup_required must be boolean`, file));
      if (data.cleanup_required === true && !data.cleanup_operation) {
        findings.push(finding('environment-cleanup-undefined', `${profile.id} requires cleanup but declares no cleanup operation`, file));
      }
      for (const key of ['seed_operation', 'cleanup_operation']) {
        if (data[key] && !operations.has(data[key])) findings.push(finding('environment-operation-unknown', `${profile.id}.${key} references unknown operation ${data[key]}`, file));
      }
      if (data.seed_operation && ci?.operations?.[data.seed_operation]?.side_effect !== 'seed') findings.push(finding('environment-operation-side-effect-invalid', `${profile.id}.seed_operation must declare seed side effect`, file));
      if (data.cleanup_operation && !['cleanup', 'reset'].includes(ci?.operations?.[data.cleanup_operation]?.side_effect)) findings.push(finding('environment-operation-side-effect-invalid', `${profile.id}.cleanup_operation must declare cleanup or reset side effect`, file));
      if (data.isolation === 'shared' && profile?.mutation_policy?.allowed?.length && profile?.mutation_policy?.requires_human_approval !== true) {
        findings.push(finding('environment-shared-mutation-unguarded', `${profile.id} permits shared mutations without human approval`, file));
      }
    }
    ensureRequired(profile?.mutation_policy, ['allowed', 'requires_human_approval'], `${scope}.mutation_policy`, findings, file);
    if (!Array.isArray(profile?.mutation_policy?.allowed) || typeof profile?.mutation_policy?.requires_human_approval !== 'boolean') findings.push(finding('environment-mutation-policy-invalid', `${scope}.mutation_policy must declare an allowed array and boolean approval rule`, file));
    ensureRequired(profile?.network, ['policy'], `${scope}.network`, findings, file);
    if (!Object.hasOwn(profile?.network || {}, 'destinations_ref')) findings.push(finding('delivery-required-field-missing', `${scope}.network.destinations_ref must be declared`, file));
    if (!Array.isArray(profile?.network?.destinations)) findings.push(finding('environment-network-destinations-missing', `${scope}.network.destinations must be an exact array`, file));
    else {
      if (new Set(profile.network.destinations).size !== profile.network.destinations.length) findings.push(finding('environment-network-destinations-invalid', `${scope}.network.destinations contains duplicates`, file));
      for (const destination of profile.network.destinations) if (!/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(destination || '')) findings.push(finding('environment-network-destinations-invalid', `${scope}.network destination ${JSON.stringify(destination)} is not an exact host[:port]`, file));
    }
    if (!['deny_by_default', 'allowlist'].includes(profile?.network?.policy)) findings.push(finding('environment-network-policy-invalid', `${scope}.network.policy is invalid`, file));
    if (profile?.network?.policy === 'allowlist' && (!SAFE_REFERENCE_PATTERN.test(profile?.network?.destinations_ref || '') || asArray(profile.network.destinations).length === 0)) findings.push(finding('environment-network-policy-invalid', `${scope}.network must carry a logical reference and at least one exact destination`, file));
    if (profile?.network?.policy === 'deny_by_default' && (profile?.network?.destinations_ref !== null || asArray(profile?.network?.destinations).length !== 0)) findings.push(finding('environment-network-policy-invalid', `${scope}.network deny_by_default must not carry destinations`, file));
  }
  return findings;
}

export function validateAcceptancePlan(plan, {
  file = 'acceptance-plan.yaml',
  root = process.cwd(),
  checkFiles = false,
  specificationCriteria = null,
  allowPlaceholders = false,
} = {}) {
  const findings = [];
  ensureClosed(plan, ['version', 'spec_ref', 'environment_profile', 'subject', 'campaign', 'criteria', 'cases', 'mutations'], 'acceptance_plan', findings, file);
  ensureRequired(plan, ['version', 'spec_ref', 'environment_profile', 'subject', 'campaign', 'criteria', 'cases', 'mutations'], 'acceptance_plan', findings, file);
  if (plan?.version !== 1) findings.push(finding('acceptance-version-unsupported', 'acceptance_plan.version must be 1', file));
  if (!allowPlaceholders && isPlaceholder(plan?.spec_ref)) findings.push(finding('acceptance-placeholder', 'spec_ref contains an unresolved placeholder', file));
  ensureClosed(plan?.subject, ['freeze_at_execution', 'provenance_waiver'], 'acceptance_plan.subject', findings, file);
  if (plan?.subject?.freeze_at_execution !== true) findings.push(finding('acceptance-subject-not-frozen', 'subject.freeze_at_execution must be true', file));
  if (!validReferencePath(plan?.spec_ref) && !(allowPlaceholders && isPlaceholder(plan?.spec_ref))) findings.push(finding('acceptance-spec-reference-invalid', 'spec_ref must be repository-relative', file));
  ensureClosed(plan?.campaign, ['adapter', 'operation', 'config', 'bootstrap_operation', 'unattended_required', 'continue_after_failure', 'flaky_blocks', 'results_contract_version'], 'acceptance_plan.campaign', findings, file);
  ensureRequired(plan?.campaign, ['adapter', 'unattended_required', 'continue_after_failure', 'flaky_blocks', 'results_contract_version'], 'acceptance_plan.campaign', findings, file);
  if (!['playwright', 'command', 'manual'].includes(plan?.campaign?.adapter)) findings.push(finding('acceptance-adapter-invalid', 'campaign.adapter is invalid', file));
  if (plan?.campaign?.adapter === 'command' && (!SAFE_REFERENCE_PATTERN.test(plan?.campaign?.operation || '') || (!allowPlaceholders && isPlaceholder(plan?.campaign?.operation)))) findings.push(finding('acceptance-command-operation-missing', 'a command campaign must name one concrete declared CI operation', file));
  if (plan?.campaign?.adapter !== 'command' && Object.hasOwn(plan?.campaign || {}, 'operation')) findings.push(finding('acceptance-command-operation-conflict', 'campaign.operation is valid only for the command adapter', file));
  if (plan?.campaign?.adapter === 'playwright' && (!validReferencePath(plan?.campaign?.config) || (!allowPlaceholders && isPlaceholder(plan?.campaign?.config)))) findings.push(finding('acceptance-playwright-config-missing', 'a Playwright campaign must name one concrete repository-relative config', file));
  if (plan?.campaign?.adapter !== 'playwright' && Object.hasOwn(plan?.campaign || {}, 'config')) findings.push(finding('acceptance-playwright-config-conflict', 'campaign.config is valid only for the Playwright adapter', file));
  if (plan?.campaign?.bootstrap_operation && (!SAFE_REFERENCE_PATTERN.test(plan.campaign.bootstrap_operation) || (!allowPlaceholders && isPlaceholder(plan.campaign.bootstrap_operation)))) findings.push(finding('acceptance-bootstrap-operation-invalid', 'campaign.bootstrap_operation must be a concrete declared CI operation', file));
  if (plan?.campaign?.results_contract_version !== 1) findings.push(finding('acceptance-results-contract-invalid', 'campaign.results_contract_version must be 1', file));
  if (plan?.campaign?.flaky_blocks !== true) findings.push(finding('acceptance-flaky-policy-unsafe', 'campaign.flaky_blocks must be true', file));
  if (plan?.campaign?.unattended_required === true && plan?.campaign?.adapter === 'manual') {
    findings.push(finding('acceptance-not-unattended', 'a manual adapter cannot satisfy unattended_required', file));
  }

  for (const duplicate of duplicateIds(plan?.criteria)) findings.push(finding('acceptance-criterion-duplicate', `duplicate criterion ${duplicate}`, file));
  for (const duplicate of duplicateIds(plan?.cases)) findings.push(finding('acceptance-case-duplicate', `duplicate case ${duplicate}`, file));
  for (const duplicate of duplicateIds(plan?.mutations)) findings.push(finding('acceptance-mutation-duplicate', `duplicate mutation ${duplicate}`, file));
  const criteria = new Map(asArray(plan?.criteria).map((item) => [item.id, item]));
  const cases = new Map(asArray(plan?.cases).map((item) => [item.id, item]));
  const mutations = new Map(asArray(plan?.mutations).map((item) => [item.id, item]));

  for (const criterion of criteria.values()) {
    ensureClosed(criterion, ['id', 'cases', 'waiver'], `criteria.${criterion?.id || '?'}`, findings, file);
    ensureRequired(criterion, ['id'], `criteria.${criterion?.id || '?'}`, findings, file);
    for (const duplicate of duplicateStrings(criterion?.cases)) findings.push(finding('acceptance-case-reference-duplicate', `${criterion.id} references case ${duplicate} more than once`, file));
    if ((!Array.isArray(criterion?.cases) || criterion.cases.length === 0) && !criterion?.waiver) findings.push(finding('acceptance-criterion-uncovered', `${criterion.id} has neither cases nor a waiver`, file));
    if (asArray(criterion?.cases).length > 0 && criterion?.waiver) findings.push(finding('acceptance-criterion-ambiguous', `${criterion.id} cannot have both executable cases and a waiver`, file));
    if (criterion?.waiver) validateWaiver(criterion.waiver, `criteria.${criterion.id}.waiver`, findings, file);
    for (const caseId of asArray(criterion?.cases)) {
      if (!cases.has(caseId)) findings.push(finding('acceptance-case-unknown', `${criterion.id} references unknown case ${caseId}`, file));
      else if (!asArray(cases.get(caseId)?.criteria).includes(criterion.id)) findings.push(finding('acceptance-traceability-asymmetric', `${criterion.id} references ${caseId}, but that case does not reference the criterion`, file));
    }
  }
  if (Array.isArray(specificationCriteria)) {
    for (const id of specificationCriteria) if (!criteria.has(id)) findings.push(finding('acceptance-criterion-uncovered', `${id} from the specification is absent from the acceptance plan`, file));
  }

  for (const testCase of cases.values()) {
    const scope = `cases.${testCase?.id || '?'}`;
    ensureClosed(testCase, ['id', 'criteria', 'test_ref', 'preconditions', 'oracle', 'evidence', 'mutations'], scope, findings, file);
    ensureRequired(testCase, ['id', 'criteria', 'test_ref', 'preconditions', 'oracle', 'evidence', 'mutations'], scope, findings, file);
    ensureClosed(testCase?.test_ref, ['path', 'title'], `${scope}.test_ref`, findings, file);
    ensureClosed(testCase?.evidence, ['required'], `${scope}.evidence`, findings, file);
    for (const duplicate of duplicateStrings(testCase?.criteria)) findings.push(finding('acceptance-case-criterion-duplicate', `${testCase.id} references criterion ${duplicate} more than once`, file));
    for (const duplicate of duplicateStrings(testCase?.preconditions)) findings.push(finding('acceptance-precondition-duplicate', `${testCase.id} repeats precondition ${duplicate}`, file));
    for (const duplicate of duplicateStrings(testCase?.mutations)) findings.push(finding('acceptance-case-mutation-duplicate', `${testCase.id} references mutation ${duplicate} more than once`, file));
    if (!Array.isArray(testCase?.criteria) || testCase.criteria.length === 0) findings.push(finding('acceptance-case-unmapped', `${testCase.id} maps to no criterion`, file));
    for (const criterionId of asArray(testCase?.criteria)) if (!criteria.has(criterionId)) findings.push(finding('acceptance-criterion-unknown', `${testCase.id} references unknown criterion ${criterionId}`, file));
    for (const [criterionId, criterion] of criteria.entries()) {
      if (asArray(testCase?.criteria).includes(criterionId) && !asArray(criterion?.cases).includes(testCase.id)) {
        findings.push(finding('acceptance-traceability-asymmetric', `${testCase.id} and ${criterionId} do not reference each other`, file));
      }
    }
    if (!validReferencePath(testCase?.test_ref?.path) || !testCase?.test_ref?.title) {
      findings.push(finding('acceptance-test-reference-invalid', `${testCase.id} needs a safe path and exact test title`, file));
    } else if (checkFiles && !isPlaceholder(testCase.test_ref.path)) {
      const testFile = path.join(root, testCase.test_ref.path);
      if (!fs.existsSync(testFile)) findings.push(finding('acceptance-test-missing', `${testCase.id} test file does not exist: ${testCase.test_ref.path}`, file));
      else if (!exactTestTitlePresent(fs.readFileSync(testFile, 'utf8'), testCase.test_ref.title)) findings.push(finding('acceptance-test-title-missing', `${testCase.id} exact test title is absent from ${testCase.test_ref.path}`, file));
    }
    if (!allowPlaceholders && (isPlaceholder(testCase?.test_ref?.path) || isPlaceholder(testCase?.test_ref?.title))) findings.push(finding('acceptance-placeholder', `${testCase.id} contains an unresolved test reference`, file));
    if (!Array.isArray(testCase?.oracle) || testCase.oracle.length === 0) findings.push(finding('acceptance-oracle-missing', `${testCase.id} has no executable oracle`, file));
    const coveredByOracles = new Set();
    for (const oracle of asArray(testCase?.oracle)) {
      const oracleScope = `${scope}.oracle.${oracle?.id || '?'}`;
      ensureClosed(oracle, ['id', 'type', 'assertion', 'criteria', 'record_marker'], oracleScope, findings, file);
      ensureRequired(oracle, ['id', 'type', 'assertion', 'criteria'], oracleScope, findings, file);
      enumValue(oracle?.type, ORACLE_TYPES, 'acceptance-oracle-invalid', `${scope}.oracle.${oracle?.id}.type`, findings, file);
      if (!Array.isArray(oracle?.criteria) || oracle.criteria.length === 0) findings.push(finding('acceptance-oracle-criteria-missing', `${testCase.id}.${oracle?.id} maps to no criterion`, file));
      for (const duplicate of duplicateStrings(oracle?.criteria)) findings.push(finding('acceptance-oracle-criterion-duplicate', `${testCase.id}.${oracle?.id} repeats criterion ${duplicate}`, file));
      for (const criterionId of asArray(oracle?.criteria)) {
        if (!criteria.has(criterionId)) findings.push(finding('acceptance-criterion-unknown', `${testCase.id}.${oracle?.id} references unknown criterion ${criterionId}`, file));
        else if (!asArray(testCase.criteria).includes(criterionId)) findings.push(finding('acceptance-oracle-criterion-outside-case', `${testCase.id}.${oracle?.id} references ${criterionId} outside its case mapping`, file));
        else coveredByOracles.add(criterionId);
      }
      if (plan?.campaign?.unattended_required === true && oracle?.type === 'human_attestation') findings.push(finding('acceptance-not-unattended', `${testCase.id} requires human attestation`, file));
      if (plan?.campaign?.adapter === 'command' && (typeof oracle?.record_marker !== 'string' || oracle.record_marker.length < 8 || (!allowPlaceholders && isPlaceholder(oracle.record_marker)))) findings.push(finding('acceptance-command-oracle-marker-missing', `${testCase.id}.${oracle?.id} must declare an exact command-output record_marker`, file));
      if (plan?.campaign?.adapter !== 'command' && Object.hasOwn(oracle || {}, 'record_marker')) findings.push(finding('acceptance-command-oracle-marker-conflict', `${testCase.id}.${oracle?.id} declares a command marker for a non-command campaign`, file));
      if (checkFiles && plan?.campaign?.adapter === 'command' && validReferencePath(testCase?.test_ref?.path) && typeof oracle?.record_marker === 'string') {
        const testFile = path.join(root, testCase.test_ref.path);
        if (fs.existsSync(testFile) && !exactTestTitlePresent(fs.readFileSync(testFile, 'utf8'), oracle.record_marker)) findings.push(finding('acceptance-command-oracle-marker-unlinked', `${testCase.id}.${oracle.id} marker is not an exact test title in ${testCase.test_ref.path}`, file));
      }
    }
    for (const criterionId of asArray(testCase?.criteria)) if (!coveredByOracles.has(criterionId)) findings.push(finding('acceptance-criterion-oracle-uncovered', `${testCase.id}.${criterionId} has no explicitly linked oracle`, file));
    for (const duplicate of duplicateIds(testCase?.oracle)) findings.push(finding('acceptance-oracle-duplicate', `${testCase.id} has duplicate oracle ${duplicate}`, file));
    const requiredEvidence = asArray(testCase?.evidence?.required);
    if (requiredEvidence.length === 0) findings.push(finding('acceptance-evidence-missing', `${testCase.id} has no required evidence checkpoint`, file));
    for (const evidence of requiredEvidence) {
      ensureClosed(evidence, ['id', 'type', 'checkpoint', 'media_pii_policy', 'pii_attestation_ref'], `${scope}.evidence.${evidence?.id || '?'}`, findings, file);
      ensureRequired(evidence, ['id', 'type', 'checkpoint'], `${scope}.evidence.${evidence?.id || '?'}`, findings, file);
      if (!['screenshot', 'trace', 'video', 'log', 'report', 'file'].includes(evidence?.type)) findings.push(finding('acceptance-evidence-type-invalid', `${testCase.id}.${evidence?.id} has invalid type ${evidence?.type}`, file));
      if (['screenshot', 'video'].includes(evidence?.type) && evidence?.media_pii_policy !== 'masked_or_synthetic') findings.push(finding('acceptance-media-pii-policy-missing', `${testCase.id}.${evidence?.id} pixel evidence must be approved as masked_or_synthetic`, file));
      const validPiiAttestation = (allowPlaceholders && isPlaceholder(evidence?.pii_attestation_ref)) || (SAFE_REFERENCE_PATTERN.test(evidence?.pii_attestation_ref || '') && !isPlaceholder(evidence?.pii_attestation_ref));
      if (['screenshot', 'video'].includes(evidence?.type) && !validPiiAttestation) findings.push(finding('acceptance-media-pii-attestation-missing', `${testCase.id}.${evidence?.id} pixel evidence needs a concrete external redaction attestation reference`, file));
      if (!['screenshot', 'video'].includes(evidence?.type) && (Object.hasOwn(evidence || {}, 'media_pii_policy') || Object.hasOwn(evidence || {}, 'pii_attestation_ref'))) findings.push(finding('acceptance-media-pii-policy-conflict', `${testCase.id}.${evidence?.id} declares a pixel policy for non-pixel evidence`, file));
      if (evidence?.type === 'trace') findings.push(finding('acceptance-evidence-type-unsupported', `${testCase.id}.${evidence?.id} trace archives are not inspectable and are fail-closed; use extracted logs/files`, file));
    }
    for (const duplicate of duplicateIds(requiredEvidence)) findings.push(finding('acceptance-evidence-duplicate', `${testCase.id} has duplicate evidence requirement ${duplicate}`, file));
    for (const mutationId of asArray(testCase?.mutations)) if (!mutations.has(mutationId)) findings.push(finding('acceptance-mutation-unknown', `${testCase.id} references unknown mutation ${mutationId}`, file));
  }

  for (const mutation of mutations.values()) {
    ensureClosed(mutation, ['id', 'scope', 'target', 'side_effects', 'cleanup_required', 'cleanup_operation', 'waiver'], `mutations.${mutation?.id || '?'}`, findings, file);
    ensureRequired(mutation, ['id', 'scope', 'target', 'side_effects', 'cleanup_required'], `mutations.${mutation?.id || '?'}`, findings, file);
    if (!SAFE_REFERENCE_PATTERN.test(mutation?.target || '') || !Array.isArray(mutation?.side_effects) || mutation.side_effects.length === 0 || new Set(mutation.side_effects).size !== mutation.side_effects.length || mutation.side_effects.some((effect) => !SAFE_REFERENCE_PATTERN.test(effect || ''))) findings.push(finding('acceptance-mutation-authorization-basis-invalid', `${mutation?.id || '?'} must declare one exact target and non-empty side effects`, file));
    if (mutation?.cleanup_required === true && !mutation?.cleanup_operation && !mutation?.waiver) {
      findings.push(finding('acceptance-cleanup-undefined', `${mutation.id} requires cleanup but has no cleanup operation`, file));
    }
    if (mutation?.waiver) validateWaiver(mutation.waiver, `mutations.${mutation.id}.waiver`, findings, file);
  }
  if (plan?.campaign?.adapter === 'command') {
    const markers = asArray(plan?.cases).flatMap((testCase) => asArray(testCase?.oracle).map((oracle) => oracle?.record_marker));
    for (const duplicate of duplicateStrings(markers.filter((marker) => typeof marker === 'string'))) findings.push(finding('acceptance-command-oracle-marker-duplicate', `command marker ${duplicate} is reused by more than one oracle`, file));
  }
  return findings;
}

export function validateAcceptanceResults(results, {
  file = 'results.json',
  subjectSha = null,
  observationRunId = null,
  planDigest = null,
  environmentDigest = null,
  plan = null,
  environmentProfile = null,
  provenanceWaiver = null,
  ci = null,
  deferCleanup = false,
} = {}) {
  const findings = [];
  ensureRequired(results, ['schema_version', 'run_id', 'candidate_sha', 'plan_digest', 'environment_digest', 'observation_run_id', 'overall_status', 'toolchain', 'cases', 'mutations'], 'acceptance_results', findings, file);
  if (results?.schema_version !== 1) findings.push(finding('acceptance-results-version-invalid', 'acceptance results schema_version must be 1', file));
  if (!SAFE_REFERENCE_PATTERN.test(results?.run_id || '') || isPlaceholder(results?.run_id)) findings.push(finding('acceptance-results-run-invalid', 'results.run_id must be a concrete logical identifier', file));
  if (results?.observation_run_id !== results?.run_id) findings.push(finding('acceptance-results-run-mismatch', 'results.observation_run_id must equal results.run_id', file));
  for (const key of ['plan_digest', 'environment_digest']) if (!/^sha256:[0-9a-f]{64}$/i.test(results?.[key] || '')) findings.push(finding('acceptance-results-digest-invalid', `${key} must be sha256:<64 hex>`, file));
  if (!SHA_PATTERN.test(results?.candidate_sha || '')) findings.push(finding('acceptance-results-sha-invalid', 'results.candidate_sha must be a full SHA', file));
  if (subjectSha && results?.candidate_sha?.toLowerCase() !== subjectSha.toLowerCase()) findings.push(finding('acceptance-results-sha-mismatch', 'results.candidate_sha differs from the frozen candidate', file));
  if (observationRunId && (results?.run_id !== observationRunId || results?.observation_run_id !== observationRunId)) findings.push(finding('acceptance-results-run-mismatch', 'results and environment observation run identities differ', file));
  if (planDigest && results?.plan_digest !== planDigest) findings.push(finding('acceptance-results-plan-mismatch', 'results were not produced from the supplied acceptance plan', file));
  if (environmentDigest && results?.environment_digest !== environmentDigest) findings.push(finding('acceptance-results-environment-mismatch', 'results were not produced from the supplied environment contract', file));
  if (!['passed', 'failed', 'blocked'].includes(results?.overall_status)) findings.push(finding('acceptance-results-status-invalid', 'overall_status must be passed, failed or blocked', file));
  else if (results.overall_status !== 'passed') findings.push(finding('acceptance-campaign-failed', `campaign overall_status is ${results.overall_status}`, file));
  const provenanceWaived = hasValidWaiver(provenanceWaiver);
  for (const key of ['adapter', 'adapter_version']) if ((!results?.toolchain?.[key] || isPlaceholder(results.toolchain[key]) || results.toolchain[key] === 'not_applicable') && !provenanceWaived) findings.push(finding('acceptance-results-toolchain-incomplete', `toolchain.${key} must be non-placeholder`, file));
  if (plan?.campaign?.adapter && results?.toolchain?.adapter !== plan.campaign.adapter) findings.push(finding('acceptance-results-adapter-mismatch', 'results.toolchain.adapter must equal the exact planned adapter', file));
  for (const key of ['browser', 'browser_version']) {
    const value = results?.toolchain?.[key];
    const validNonBrowserValue = results?.toolchain?.adapter !== 'playwright' && value === 'not_applicable';
    if ((!value || isPlaceholder(value) || (value === 'not_applicable' && !validNonBrowserValue)) && !provenanceWaived) findings.push(finding('acceptance-results-toolchain-incomplete', `toolchain.${key} must identify Playwright's browser or be not_applicable for another adapter`, file));
  }
  const plannedCases = new Map(asArray(plan?.cases).map((item) => [item.id, item]));
  const capability = results?.capability_receipt;
  const secretRefs = asArray(environmentProfile?.auth?.secret_refs);
  const networkRequired = secretRefs.length > 0 || environmentProfile?.network?.policy === 'allowlist';
  const mutationRequired = asArray(plan?.mutations).length > 0;
  const capabilitiesRequired = networkRequired || mutationRequired;
  const grants = asArray(capability?.grants);
  if (capabilitiesRequired) {
    ensureRequired(capability, ['provider', 'repository', 'workflow_ref', 'provider_run_id', 'receipt_sha256', 'grants'], 'acceptance_results.capability_receipt', findings, file);
    ensureClosed(capability, ['provider', 'repository', 'workflow_ref', 'provider_run_id', 'receipt_sha256', 'grants'], 'acceptance_results.capability_receipt', findings, file);
    if (!/^[0-9a-f]{64}$/.test(capability?.receipt_sha256 || '')) findings.push(finding('acceptance-capability-receipt-digest-invalid', 'capability receipt must carry its exact protected receipt digest', file));
    if (environmentProfile?.kind === 'local') findings.push(finding('acceptance-local-capability-forbidden', 'local acceptance results cannot claim protected capabilities', file));
  } else if (capability) findings.push(finding('acceptance-capability-receipt-unnecessary', 'results carry a capability receipt for no declared capability', file));
  const networkGrants = grants.filter((grant) => grant?.capability === 'network');
  const mutationGrants = grants.filter((grant) => grant?.capability === 'data_mutation');
  if (networkRequired) {
    const grant = networkGrants.length === 1 ? networkGrants[0] : null;
    ensureRequired(grant, ['capability', 'authorization_ref', 'target', 'run_id', 'runner_trust', 'egress_allowlist', 'secret_refs', 'approved_by', 'approved_at'], 'acceptance_results.network_grant', findings, file);
    ensureClosed(grant, ['capability', 'authorization_ref', 'target', 'run_id', 'runner_trust', 'egress_allowlist', 'secret_refs', 'approved_by', 'approved_at'], 'acceptance_results.network_grant', findings, file);
    if (!grant || grant.runner_trust !== 'protected' || grant.target !== environmentProfile?.id || grant.run_id !== results?.run_id
      || [...asArray(grant.egress_allowlist)].sort().join(',') !== [...asArray(environmentProfile?.network?.destinations)].sort().join(',')
      || [...asArray(grant.secret_refs)].sort().join(',') !== [...secretRefs].sort().join(',')) findings.push(finding('acceptance-network-grant-mismatch', 'results network grant differs from the exact protected run/environment egress and secret contract', file));
  } else if (networkGrants.length) findings.push(finding('acceptance-network-grant-unplanned', 'results carry an unplanned network grant', file));
  const actualCases = new Map(asArray(results?.cases).map((item) => [item.id, item]));
  if (!Array.isArray(results?.cases)) findings.push(finding('acceptance-results-case-invalid', 'results.cases must be an array', file));
  if (!Array.isArray(results?.mutations)) findings.push(finding('acceptance-results-mutation-invalid', 'results.mutations must be an array', file));
  for (const duplicate of duplicateIds(results?.cases)) findings.push(finding('acceptance-results-case-duplicate', `duplicate result case ${duplicate}`, file));
  for (const id of plannedCases.keys()) if (!actualCases.has(id)) findings.push(finding('acceptance-results-case-missing', `${id} has no adapter result`, file));
  const evidenceIds = new Set();
  for (const result of asArray(results?.cases)) {
    ensureRequired(result, ['id', 'title', 'outcome', 'attempts', 'oracle_results', 'evidence'], `acceptance_results.cases.${result?.id || '?'}`, findings, file);
    const planned = plannedCases.get(result?.id);
    if (plan && !planned) findings.push(finding('acceptance-results-case-unplanned', `${result?.id} was not planned`, file));
    if (planned && result?.title !== planned?.test_ref?.title) findings.push(finding('acceptance-results-title-mismatch', `${result.id} did not execute the exact planned title`, file));
    if (!Number.isInteger(result?.attempts) || result.attempts < 1) findings.push(finding('acceptance-results-attempts-invalid', `${result?.id} attempts must be a positive integer`, file));
    const normalized = canonicalizeCaseOutcome(result?.outcome, result?.attempts);
    if (typeof result?.user_visible_error !== 'boolean') findings.push(finding('acceptance-results-user-visible-error-unrecorded', `${result?.id}.user_visible_error must be recorded explicitly`, file));
    if (result?.user_visible_error === true) findings.push(finding('acceptance-results-user-visible-error', `${result?.id} contains a user-visible error`, file));
    if (normalized.reason === 'invalid_adapter_outcome') findings.push(finding('acceptance-results-outcome-invalid', `${result?.id} has unsupported outcome ${JSON.stringify(result?.outcome)}`, file));
    if (normalized.outcome === 'waived') validateWaiver(result?.waiver, `acceptance_results.cases.${result?.id}.waiver`, findings, file);
    const plannedOracles = new Map(asArray(planned?.oracle).map((oracle) => [oracle.id, oracle]));
    const actualOracles = new Map(asArray(result?.oracle_results).map((oracle) => [oracle?.id, oracle]));
    if (!Array.isArray(result?.oracle_results)) findings.push(finding('acceptance-results-oracle-invalid', `${result?.id}.oracle_results must be an array`, file));
    for (const duplicate of duplicateIds(result?.oracle_results)) findings.push(finding('acceptance-results-oracle-duplicate', `${result?.id} has duplicate oracle ${duplicate}`, file));
    for (const oracleId of plannedOracles.keys()) if (!actualOracles.has(oracleId)) findings.push(finding('acceptance-results-oracle-missing', `${result?.id} has no result for oracle ${oracleId}`, file));
    for (const [oracleId, oracle] of actualOracles) {
      if (planned && !plannedOracles.has(oracleId)) findings.push(finding('acceptance-results-oracle-unplanned', `${result?.id} reports unplanned oracle ${oracleId}`, file));
      const oracleOutcome = canonicalizeCaseOutcome(oracle?.outcome);
      if (oracle?.recorded !== true) findings.push(finding('acceptance-results-oracle-not-recorded', `${result?.id}.${oracleId} was not explicitly recorded at the assertion point`, file));
      if (oracleOutcome.reason === 'invalid_adapter_outcome') findings.push(finding('acceptance-results-oracle-invalid', `${result?.id}.${oracleId} has unsupported outcome`, file));
      if (normalized.outcome === 'passed' && oracleOutcome.outcome !== 'passed') findings.push(finding('acceptance-results-false-pass', `${result?.id} passed while oracle ${oracleId} did not`, file));
    }
    const plannedEvidence = new Map(asArray(planned?.evidence?.required).map((requirement) => [requirement.id, requirement]));
    const boundRequirements = new Set();
    if (!Array.isArray(result?.evidence)) findings.push(finding('acceptance-results-evidence-invalid', `${result?.id}.evidence must be an array`, file));
    for (const [index, evidence] of asArray(result?.evidence).entries()) {
      ensureRequired(evidence, ['id', 'path'], `acceptance_results.cases.${result?.id}.evidence.${index}`, findings, file);
      if (evidenceIds.has(evidence?.id)) findings.push(finding('acceptance-results-evidence-duplicate', `artifact id ${evidence?.id} is reused`, file));
      else if (evidence?.id) evidenceIds.add(evidence.id);
      if (!evidence?.requirement_id) continue;
      if (boundRequirements.has(evidence.requirement_id)) findings.push(finding('acceptance-results-evidence-binding-duplicate', `${result?.id} binds ${evidence.requirement_id} more than once`, file));
      boundRequirements.add(evidence.requirement_id);
      const requirement = plannedEvidence.get(evidence.requirement_id);
      if (!requirement) findings.push(finding('acceptance-results-evidence-unplanned', `${result?.id} binds unknown evidence requirement ${evidence.requirement_id}`, file));
      else if (evidence.type !== requirement.type || evidence.checkpoint !== requirement.checkpoint) findings.push(finding('acceptance-results-evidence-type-mismatch', `${result?.id}.${evidence.requirement_id} has the wrong type or checkpoint`, file));
    }
    for (const requirementId of plannedEvidence.keys()) if (!boundRequirements.has(requirementId)) findings.push(finding('acceptance-results-evidence-missing', `${result?.id} has no artifact for ${requirementId}`, file));
  }
  const plannedMutations = new Map(asArray(plan?.mutations).map((mutation) => [mutation.id, mutation]));
  const actualMutations = new Map(asArray(results?.mutations).map((mutation) => [mutation?.id, mutation]));
  for (const duplicate of duplicateIds(results?.mutations)) findings.push(finding('acceptance-results-mutation-duplicate', `duplicate result mutation ${duplicate}`, file));
  for (const mutationId of plannedMutations.keys()) if (!actualMutations.has(mutationId)) findings.push(finding('acceptance-results-mutation-missing', `${mutationId} has no adapter result`, file));
  let unsafeMutation = false;
  for (const mutation of asArray(results?.mutations)) {
    ensureRequired(mutation, ['id', 'outcome', 'cleanup', 'cleanup_evidence_ids'], `acceptance_results.mutations.${mutation?.id || '?'}`, findings, file);
    const planned = plannedMutations.get(mutation?.id);
    if (plan && !planned) findings.push(finding('acceptance-results-mutation-unplanned', `${mutation?.id} was not planned`, file));
    if (!MUTATION_OUTCOMES.has(mutation?.outcome)) findings.push(finding('acceptance-results-mutation-invalid', `${mutation?.id} has invalid outcome ${mutation?.outcome}`, file));
    if (!CLEANUP_OUTCOMES.has(mutation?.cleanup)) findings.push(finding('acceptance-results-cleanup-invalid', `${mutation?.id} has invalid cleanup ${mutation?.cleanup}`, file));
    if (!Array.isArray(mutation?.cleanup_evidence_ids) || mutation.cleanup_evidence_ids.some((id) => typeof id !== 'string' || !id)) findings.push(finding('acceptance-results-cleanup-evidence-invalid', `${mutation?.id}.cleanup_evidence_ids must be a string array`, file));
    const grant = mutation?.authorization;
    if (mutation?.outcome === 'applied') {
      ensureRequired(grant, ['capability', 'authorization_ref', 'target', 'environment', 'side_effects', 'approved_by', 'approved_at', 'receipt_sha256'], `acceptance_results.mutations.${mutation?.id || '?'}.authorization`, findings, file);
      ensureClosed(grant, ['capability', 'authorization_ref', 'target', 'environment', 'side_effects', 'approved_by', 'approved_at', 'receipt_sha256'], `acceptance_results.mutations.${mutation?.id || '?'}.authorization`, findings, file);
      const receiptGrant = mutationGrants.find((candidate) => candidate?.authorization_ref === grant?.authorization_ref);
      const grantWithoutReceipt = grant ? {
        capability: grant.capability,
        authorization_ref: grant.authorization_ref,
        target: grant.target,
        environment: grant.environment,
        side_effects: grant.side_effects,
        approved_by: grant.approved_by,
        approved_at: grant.approved_at,
      } : null;
      if (!planned || grant?.capability !== 'data_mutation' || grant?.target !== planned.target || grant?.environment !== 'non_production'
        || [...asArray(grant?.side_effects)].sort().join(',') !== [...asArray(planned?.side_effects)].sort().join(',')
        || grant?.receipt_sha256 !== capability?.receipt_sha256
        || !receiptGrant || JSON.stringify(receiptGrant) !== JSON.stringify(grantWithoutReceipt)) {
        findings.push(finding('acceptance-mutation-authorization-invalid', `${mutation?.id || '?'} was applied without its exact protected non-production authorization`, file));
      }
    } else if (grant) findings.push(finding('acceptance-mutation-authorization-unnecessary', `${mutation?.id || '?'} carries authorization although it was not applied`, file));
    if (mutation?.cleanup === 'passed' && asArray(mutation?.cleanup_evidence_ids).length === 0) findings.push(finding('acceptance-results-cleanup-evidence-missing', `${mutation?.id} claims passed cleanup without evidence`, file));
    for (const evidenceId of asArray(mutation?.cleanup_evidence_ids)) if (!evidenceIds.has(evidenceId)) findings.push(finding('acceptance-results-cleanup-evidence-missing', `${mutation?.id} references unknown cleanup evidence ${evidenceId}`, file));
    const usedByApprovedCase = asArray(plan?.cases).some((testCase) => asArray(testCase?.mutations).includes(mutation?.id)
      && ['passed', 'waived'].includes(canonicalizeCaseOutcome(actualCases.get(testCase.id)?.outcome, actualCases.get(testCase.id)?.attempts).outcome));
    if (usedByApprovedCase && mutation?.outcome !== 'applied') {
      unsafeMutation = true;
      findings.push(finding('acceptance-results-mutation-not-applied', `${mutation.id} was required by an approved case but was not applied`, file));
    }
    if (mutation?.outcome === 'failed' || mutation?.cleanup === 'failed' || (mutation?.cleanup === 'pending' && !deferCleanup)) unsafeMutation = true;
    if (planned?.cleanup_required === true && mutation?.cleanup !== 'passed' && !(deferCleanup && mutation?.cleanup === 'pending') && !hasValidWaiver(planned?.waiver)) {
      unsafeMutation = true;
      findings.push(finding('acceptance-results-cleanup-incomplete', `${mutation.id} requires a passed cleanup result`, file));
    }
    validateCleanupExecution(mutation, planned, ci, {
      findings,
      file,
      scope: `acceptance_results.mutations.${mutation?.id || '?'}`,
      deferMissing: deferCleanup,
    });
  }
  if (results?.overall_status === 'passed') {
    const everyCaseApproved = asArray(results?.cases).every((result) => {
      const normalized = canonicalizeCaseOutcome(result?.outcome, result?.attempts);
      return result?.user_visible_error === false && (normalized.outcome === 'passed' || (normalized.outcome === 'waived' && hasValidWaiver(result?.waiver)));
    });
    if (!everyCaseApproved || unsafeMutation || (plan && actualCases.size !== plannedCases.size)) findings.push(finding('acceptance-results-false-pass', 'overall_status is passed while cases, coverage, mutations or cleanup are not ready', file));
  }
  return findings;
}

export function validateEnvironmentObservation(observation, {
  file = 'environment-observation.json',
  provenanceWaiver = null,
  environment = null,
  ci = null,
} = {}) {
  const findings = [];
  ensureRequired(observation, ['schema_version', 'run_id', 'observed_at', 'profile', 'subject_sha', 'deployed_revision', 'instance_id', 'build_or_image', 'schema_version_value', 'dataset_id', 'dataset_version', 'auth_actor_type', 'environment_contract_digest', 'ci_contract_digest', 'checks', 'operations', 'status'], 'environment_observation', findings, file);
  if (observation?.schema_version !== 1) findings.push(finding('environment-observation-version-invalid', 'environment observation schema_version must be 1', file));
  if (!SAFE_REFERENCE_PATTERN.test(observation?.run_id || '') || isPlaceholder(observation?.run_id)) findings.push(finding('environment-run-id-invalid', 'observation.run_id must be a concrete logical identifier', file));
  if (observation?.observed_at && Number.isNaN(Date.parse(observation.observed_at))) findings.push(finding('environment-observation-date-invalid', 'observed_at must be an ISO date', file));
  if (!['ready', 'blocked'].includes(observation?.status)) findings.push(finding('environment-status-invalid', 'observation.status must be ready or blocked', file));
  if (!Array.isArray(observation?.checks) || observation.checks.length === 0) findings.push(finding('environment-checks-missing', 'at least one environment preflight check is required', file));
  if (!Array.isArray(observation?.operations) || observation.operations.length === 0) findings.push(finding('environment-operations-missing', 'at least one executed preflight operation is required', file));
  for (const operation of asArray(observation?.operations)) {
    ensureRequired(operation, ['id', 'argv', 'cwd', 'timeout_seconds', 'side_effect', 'outcome'], `environment_observation.operations.${operation?.id || '?'}`, findings, file);
    for (const key of ['stdout', 'stderr']) if (!Object.hasOwn(operation || {}, key) || typeof operation[key] !== 'string') findings.push(finding('environment-operation-output-missing', `${operation?.id}.${key} must be a bounded string`, file));
    if (operation?.side_effect !== 'none') findings.push(finding('environment-probe-side-effect-invalid', `${operation?.id} observation is not side-effect-free`, file));
    if (!['planned', 'pass', 'fail'].includes(operation?.outcome)) findings.push(finding('environment-operation-outcome-invalid', `${operation?.id} has invalid operation outcome`, file));
  }
  if (!SHA_PATTERN.test(observation?.subject_sha || '') || !SHA_PATTERN.test(observation?.deployed_revision || '')) {
    findings.push(finding('environment-revision-invalid', 'subject and deployed revisions must be full 40-hex SHAs', file));
  } else if (observation.subject_sha.toLowerCase() !== observation.deployed_revision.toLowerCase()) {
    findings.push(finding('environment-revision-mismatch', 'the deployed revision does not equal the frozen subject revision', file));
  }
  for (const key of ['environment_contract_digest', 'ci_contract_digest']) if (!/^sha256:[0-9a-f]{64}$/i.test(observation?.[key] || '')) findings.push(finding('environment-contract-digest-invalid', `${key} must be sha256:<64 hex>`, file));
  const provenanceWaived = hasValidWaiver(provenanceWaiver);
  if (provenanceWaiver) validateWaiver(provenanceWaiver, 'environment_observation.provenance_waiver', findings, file);
  for (const key of ['run_id', 'instance_id', 'build_or_image', 'schema_version_value', 'dataset_id', 'dataset_version', 'auth_actor_type']) if ((!observation?.[key] || isPlaceholder(observation[key])) && !provenanceWaived) findings.push(finding('environment-provenance-incomplete', `${key} must be observed and non-placeholder`, file));
  for (const check of asArray(observation?.checks)) {
    if (check?.required !== false && check?.outcome !== 'pass') {
      const code = check?.kind === 'schema' ? 'environment-schema-mismatch'
        : check?.kind === 'dataset' ? 'environment-dataset-mismatch'
          : check?.kind === 'credential' ? 'environment-credential-expired'
            : 'environment-dependency-unready';
      findings.push(finding(code, `${check?.id || 'environment check'} did not pass`, file, check?.message || null));
    }
  }
  const profile = asArray(environment?.profiles).find((candidate) => candidate?.id === observation?.profile);
  if (environment && !profile) findings.push(finding('environment-observation-profile-unknown', `observation profile ${observation?.profile} is absent from the environment contract`, file));
  if (profile) {
    const expectedChecks = new Map();
    if (typeof profile.operations?.health === 'string') expectedChecks.set(profile.operations.health, { kind: 'health', required: true });
    if (typeof profile.operations?.revision_probe === 'string') expectedChecks.set(profile.operations.revision_probe, { kind: 'revision', required: true });
    for (const dependency of asArray(profile.dependencies)) {
      expectedChecks.set(dependency.readiness_operation, { kind: dependency.kind || 'dependency', required: dependency.required !== false });
      if (dependency.version_operation) expectedChecks.set(dependency.version_operation, { kind: dependency.version_kind || 'version', required: dependency.required !== false });
    }
    const checksById = new Map(asArray(observation?.checks).map((check) => [check?.id, check]));
    const operationsById = new Map(asArray(observation?.operations).map((operation) => [operation?.id, operation]));
    for (const duplicate of duplicateIds(observation?.checks)) findings.push(finding('environment-check-duplicate', `duplicate observation check ${duplicate}`, file));
    for (const duplicate of duplicateIds(observation?.operations)) findings.push(finding('environment-operation-duplicate', `duplicate observed operation ${duplicate}`, file));
    for (const [id, expected] of expectedChecks) {
      const check = checksById.get(id);
      const operation = operationsById.get(id);
      if (!check || !operation) findings.push(finding('environment-required-probe-missing', `${id} was required by the environment contract but was not observed`, file));
      else {
        if (check.kind !== expected.kind || check.required !== expected.required) findings.push(finding('environment-probe-contract-mismatch', `${id} observation metadata differs from the environment contract`, file));
        if (check.outcome !== operation.outcome) findings.push(finding('environment-probe-contract-mismatch', `${id} check outcome differs from its operation outcome`, file));
        const declared = ci?.operations?.[id];
        if (ci && (!declared || sha256Object({ argv: operation.argv, cwd: operation.cwd, timeout_seconds: operation.timeout_seconds, side_effect: operation.side_effect }) !== sha256Object({ argv: declared?.argv, cwd: declared?.cwd || '.', timeout_seconds: declared?.timeout_seconds, side_effect: declared?.side_effect }))) {
          findings.push(finding('environment-probe-contract-mismatch', `${id} executed operation differs from the frozen CI contract`, file));
        }
      }
    }
    for (const id of checksById.keys()) if (!expectedChecks.has(id)) findings.push(finding('environment-unplanned-probe', `${id} was not declared by the environment profile`, file));
    for (const id of operationsById.keys()) if (!expectedChecks.has(id)) findings.push(finding('environment-unplanned-probe', `${id} operation was not declared by the environment profile`, file));
    const revisionId = typeof profile.operations?.revision_probe === 'string' ? profile.operations.revision_probe : null;
    const revisionOperation = revisionId ? operationsById.get(revisionId) : null;
    const observedRevision = String(revisionOperation?.stdout || '').trim().match(/^[0-9a-f]{40}$/i)?.[0]?.toLowerCase() || null;
    if (!revisionOperation || revisionOperation.outcome !== 'pass' || observedRevision !== String(observation?.deployed_revision || '').toLowerCase()) {
      findings.push(finding('environment-revision-not-observed', 'deployed_revision must come from the declared successful revision probe output', file));
    }
  }
  if (observation?.status === 'blocked') findings.push(finding('environment-not-ready', 'environment observation is blocked', file));
  if (observation?.status === 'ready' && findings.length) findings.push(finding('environment-false-ready', 'observation says ready while a required preflight check failed', file));
  return findings;
}

export function validateEvidence(manifest, plan = null, {
  file = 'evidence-manifest.yaml',
  artifactsRoot = null,
  verifyArtifacts = false,
  acceptancePlanFile = null,
  environmentContractFile = null,
  repositoryRoot = process.cwd(),
  ci = null,
  environment = null,
} = {}) {
  const findings = [];
  ensureRequired(manifest, ['schema_version', 'run_id', 'generated_at', 'spec_package', 'subject', 'environment', 'toolchain', 'acceptance', 'publication', 'criteria_waivers', 'cases', 'mutations', 'artifacts', 'summary', 'verdict'], 'evidence', findings, file);
  if (manifest?.schema_version !== 1) findings.push(finding('evidence-version-unsupported', 'evidence.schema_version must be 1', file));
  if (!SAFE_REFERENCE_PATTERN.test(manifest?.run_id || '') || isPlaceholder(manifest?.run_id)) findings.push(finding('evidence-run-id-invalid', 'run_id must be a concrete logical identifier', file));
  if (Number.isNaN(Date.parse(manifest?.generated_at))) findings.push(finding('evidence-generated-at-invalid', 'generated_at must be an ISO date', file));
  if (!validReferencePath(manifest?.spec_package)) findings.push(finding('evidence-spec-package-invalid', 'spec_package must be repository-relative', file));
  const subject = manifest?.subject || {};
  for (const key of ['head_sha', 'tested_sha']) if (!SHA_PATTERN.test(subject[key] || '')) findings.push(finding('evidence-sha-invalid', `subject.${key} must be a full 40-hex SHA`, file));
  if (subject.base_sha && !SHA_PATTERN.test(subject.base_sha)) findings.push(finding('evidence-sha-invalid', 'subject.base_sha must be a full 40-hex SHA when present', file));
  if (subject.head_sha && subject.tested_sha && subject.head_sha.toLowerCase() !== subject.tested_sha.toLowerCase()) findings.push(finding('evidence-subject-stale', 'tested_sha differs from the frozen subject head_sha', file));
  if (!/^sha256:[0-9a-f]{64}$/i.test(subject.source_tree_digest || '')) findings.push(finding('evidence-source-digest-invalid', 'subject.source_tree_digest must be sha256:<64 hex>', file));
  if (Object.hasOwn(subject, 'evidence_commit_sha')) findings.push(finding('evidence-self-referential-sha', 'the manifest must not claim its own publication commit SHA; the V3 event binds it externally', file));
  ensureRequired(manifest?.publication, ['mode'], 'evidence.publication', findings, file);
  if (!['ci_artifact', 'evidence_only_commit'].includes(manifest?.publication?.mode)) findings.push(finding('evidence-publication-mode-invalid', 'publication.mode must be ci_artifact or evidence_only_commit', file));
  if (manifest?.publication?.mode === 'evidence_only_commit') for (const key of ['ci_run_id', 'artifact_id', 'artifact_url', 'retention_days', 'bundle_digest']) if (Object.hasOwn(manifest.publication, key)) findings.push(finding('evidence-publication-conflict', `evidence_only_commit must not carry CI field ${key}`, file));
  if (manifest?.publication?.mode === 'ci_artifact') {
    ensureRequired(manifest.publication, ['ci_run_id', 'artifact_id', 'artifact_url', 'retention_days', 'bundle_digest'], 'evidence.publication', findings, file);
    if (isPlaceholder(manifest.publication.ci_run_id) || isPlaceholder(manifest.publication.artifact_id)) findings.push(finding('evidence-publication-provenance-incomplete', 'CI publication identifiers must be non-placeholder', file));
    try {
      const url = new URL(manifest.publication.artifact_url);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('not a stable credential-free HTTPS URL');
    } catch {
      findings.push(finding('evidence-publication-url-invalid', 'publication.artifact_url must be an HTTPS URL', file));
    }
    if (!Number.isInteger(manifest.publication.retention_days) || manifest.publication.retention_days < 1) findings.push(finding('evidence-publication-retention-invalid', 'publication.retention_days must be positive', file));
    if (!/^sha256:[0-9a-f]{64}$/i.test(manifest.publication.bundle_digest || '')) findings.push(finding('evidence-publication-digest-invalid', 'publication.bundle_digest must be sha256:<64 hex>', file));
    else {
      const inventory = asArray(manifest?.artifacts)
        .map((artifact) => ({ path: artifact.path, sha256: artifact.sha256, bytes: artifact.bytes }))
        .sort((left, right) => left.path.localeCompare(right.path));
      if (new Set(inventory.map((entry) => entry.path)).size !== inventory.length || manifest.publication.bundle_digest !== sha256Object(inventory)) findings.push(finding('evidence-publication-digest-mismatch', 'publication.bundle_digest does not match the exact recursive artifact inventory', file));
    }
  }
  if (!SHA_PATTERN.test(manifest?.environment?.deployed_revision || '') || manifest?.environment?.deployed_revision?.toLowerCase() !== subject.tested_sha?.toLowerCase()) {
    findings.push(finding('evidence-deployed-revision-mismatch', 'environment.deployed_revision must equal subject.tested_sha', file));
  }
  if (!/^sha256:[0-9a-f]{64}$/i.test(manifest?.environment?.contract_digest || '')) findings.push(finding('evidence-environment-digest-invalid', 'environment.contract_digest must be sha256:<64 hex>', file));
  const provenanceWaived = hasValidWaiver(manifest?.provenance_waiver);
  if (manifest?.provenance_waiver) validateWaiver(manifest.provenance_waiver, 'evidence.provenance_waiver', findings, file);
  for (const key of ['instance_id', 'build_or_image', 'schema_version', 'dataset_id', 'dataset_version', 'auth_actor_type']) {
    if ((!manifest?.environment?.[key] || isPlaceholder(manifest.environment[key])) && !provenanceWaived) findings.push(finding('evidence-provenance-incomplete', `environment.${key} must be non-placeholder or explicitly waived`, file));
  }
  for (const key of ['adapter', 'adapter_version']) {
    if ((!manifest?.toolchain?.[key] || isPlaceholder(manifest.toolchain[key]) || manifest.toolchain[key] === 'not_applicable') && !provenanceWaived) findings.push(finding('evidence-provenance-incomplete', `toolchain.${key} must be non-placeholder or explicitly waived`, file));
  }
  if (plan?.campaign?.adapter && manifest?.toolchain?.adapter !== plan.campaign.adapter) findings.push(finding('evidence-adapter-mismatch', 'manifest.toolchain.adapter must equal the exact planned adapter', file));
  for (const key of ['browser', 'browser_version']) {
    const value = manifest?.toolchain?.[key];
    const validNonBrowserValue = manifest?.toolchain?.adapter !== 'playwright' && value === 'not_applicable';
    if ((!value || isPlaceholder(value) || (value === 'not_applicable' && !validNonBrowserValue)) && !provenanceWaived) findings.push(finding('evidence-provenance-incomplete', `toolchain.${key} must identify the browser for Playwright, or be not_applicable for a non-browser adapter`, file));
  }
  ensureRequired(manifest?.acceptance, ['plan_path', 'plan_digest'], 'evidence.acceptance', findings, file);
  if (!validReferencePath(manifest?.acceptance?.plan_path)) findings.push(finding('evidence-plan-path-invalid', 'acceptance.plan_path must be repository-relative', file));
  if (!/^sha256:[0-9a-f]{64}$/i.test(manifest?.acceptance?.plan_digest || '')) findings.push(finding('evidence-plan-digest-invalid', 'acceptance.plan_digest must be sha256:<64 hex>', file));
  if (acceptancePlanFile) {
    if (!fs.existsSync(acceptancePlanFile)) findings.push(finding('evidence-plan-missing', `acceptance plan is absent: ${acceptancePlanFile}`, file));
    else {
      const relative = path.relative(path.resolve(repositoryRoot), path.resolve(acceptancePlanFile)).split(path.sep).join('/');
      if (relative !== manifest?.acceptance?.plan_path) findings.push(finding('evidence-plan-path-mismatch', `manifest plan path ${manifest?.acceptance?.plan_path} differs from ${relative}`, file));
      if (sha256File(acceptancePlanFile) !== manifest?.acceptance?.plan_digest) findings.push(finding('evidence-plan-digest-mismatch', 'acceptance plan content differs from the tested manifest input', file));
    }
  }
  if (environmentContractFile) {
    if (!fs.existsSync(environmentContractFile)) findings.push(finding('evidence-environment-missing', `environment contract is absent: ${environmentContractFile}`, file));
    else if (sha256File(environmentContractFile) !== manifest?.environment?.contract_digest) findings.push(finding('evidence-environment-digest-mismatch', 'environment contract content differs from the tested manifest input', file));
  }

  for (const duplicate of duplicateIds(manifest?.cases)) findings.push(finding('evidence-case-duplicate', `duplicate evidence case ${duplicate}`, file));
  for (const duplicate of duplicateIds(manifest?.artifacts)) findings.push(finding('evidence-artifact-duplicate', `duplicate artifact ${duplicate}`, file));
  const artifacts = new Map(asArray(manifest?.artifacts).map((artifact) => [artifact.id, artifact]));
  const planCases = new Map(asArray(plan?.cases).map((testCase) => [testCase.id, testCase]));
  const actualCases = new Map(asArray(manifest?.cases).map((testCase) => [testCase.id, testCase]));
  const globallyBoundArtifactIds = new Set();
  const plannedCriterionWaivers = new Map(asArray(plan?.criteria)
    .filter((criterion) => criterion?.waiver)
    .map((criterion) => [criterion.id, criterion.waiver]));
  const actualCriterionWaivers = new Map(asArray(manifest?.criteria_waivers)
    .map((waiver) => [waiver?.criterion_id, waiver]));
  for (const duplicate of duplicateIds(asArray(manifest?.criteria_waivers).map((waiver) => ({ id: waiver?.criterion_id })))) {
    findings.push(finding('evidence-criterion-waiver-duplicate', `duplicate criterion waiver ${duplicate}`, file));
  }
  for (const [criterionId, plannedWaiver] of plannedCriterionWaivers) {
    const actualWaiver = actualCriterionWaivers.get(criterionId);
    if (!actualWaiver) findings.push(finding('evidence-criterion-waiver-missing', `${criterionId} waiver is absent from the evidence`, file));
    else {
      validateWaiver(actualWaiver, `criteria_waivers.${criterionId}`, findings, file);
      const { criterion_id: ignored, ...actualApproval } = actualWaiver;
      if (sha256Object(actualApproval) !== sha256Object(plannedWaiver)) findings.push(finding('evidence-criterion-waiver-mismatch', `${criterionId} waiver differs from the approved acceptance plan`, file));
    }
  }
  for (const criterionId of actualCriterionWaivers.keys()) {
    if (!plannedCriterionWaivers.has(criterionId)) findings.push(finding('evidence-criterion-waiver-unplanned', `${criterionId} has an evidence waiver absent from the acceptance plan`, file));
  }
  for (const id of planCases.keys()) if (!actualCases.has(id)) findings.push(finding('evidence-case-missing', `${id} was planned but has no result`, file));
  for (const testCase of actualCases.values()) {
    ensureRequired(testCase, ['id', 'criteria', 'outcome', 'attempts', 'user_visible_error', 'oracle_results', 'evidence_ids', 'evidence_bindings'], `evidence.cases.${testCase?.id || '?'}`, findings, file);
    const planned = planCases.get(testCase?.id);
    if (plan && !planned) findings.push(finding('evidence-case-unplanned', `${testCase?.id} was not declared in the acceptance plan`, file));
    if (planned) {
      const expectedCriteria = [...new Set(asArray(planned.criteria))].sort();
      const actualCriteria = [...new Set(asArray(testCase.criteria))].sort();
      if (sha256Object(actualCriteria) !== sha256Object(expectedCriteria)) findings.push(finding('evidence-criteria-mismatch', `${testCase.id} criteria differ from the acceptance plan`, file));
    }
    if (!Number.isInteger(testCase?.attempts) || testCase.attempts < 1) findings.push(finding('evidence-attempts-invalid', `${testCase?.id} attempts must be a positive integer`, file));
    if (!OUTCOMES.has(testCase?.outcome)) findings.push(finding('evidence-outcome-invalid', `${testCase?.id} has invalid outcome ${testCase?.outcome}`, file));
    else if (testCase.outcome === 'waived') {
      validateWaiver(testCase?.waiver, `cases.${testCase.id}.waiver`, findings, file);
    } else if (testCase.outcome !== 'passed') findings.push(finding('evidence-case-not-pass', `${testCase.id} outcome is ${testCase.outcome}`, file));
    if (testCase?.outcome === 'passed' && Number(testCase?.attempts) > 1) findings.push(finding('acceptance-flaky-blocking', `${testCase.id} passed only after retry and must be failed`, file));
    if (typeof testCase?.user_visible_error !== 'boolean') findings.push(finding('evidence-user-visible-error-unrecorded', `${testCase?.id}.user_visible_error must be explicit`, file));
    if (testCase?.user_visible_error === true) findings.push(finding('evidence-user-visible-error', `${testCase.id} contains a user-visible error`, file));
    for (const oracle of asArray(testCase?.oracle_results)) {
      if (!OUTCOMES.has(oracle?.outcome)) findings.push(finding('evidence-oracle-outcome-invalid', `${testCase.id}.${oracle?.id || '?'} has invalid outcome ${oracle?.outcome}`, file));
      if (oracle?.recorded !== true) findings.push(finding('evidence-oracle-not-recorded', `${testCase.id}.${oracle?.id || '?'} was not explicitly recorded`, file));
    }
    if (testCase?.outcome === 'passed' && testCase?.reason) findings.push(finding('evidence-false-pass', `${testCase.id} is passed but carries blocking reason ${testCase.reason}`, file));
    if (testCase?.outcome === 'passed' && asArray(testCase?.oracle_results).some((oracle) => oracle?.outcome !== 'passed')) findings.push(finding('evidence-false-pass', `${testCase.id} is passed while an oracle is not passed`, file));
    if (testCase?.outcome === 'passed' && asArray(testCase?.oracle_results).length === 0) findings.push(finding('evidence-oracle-result-missing', `${testCase.id} is passed without an oracle result`, file));
    if (planned) {
      const oracleResults = new Map(asArray(testCase?.oracle_results).map((oracle) => [oracle.id, oracle]));
      for (const duplicate of duplicateIds(testCase?.oracle_results)) findings.push(finding('evidence-oracle-result-duplicate', `${testCase.id} has duplicate oracle result ${duplicate}`, file));
      for (const oracle of asArray(planned.oracle)) {
        if (!oracleResults.has(oracle.id)) findings.push(finding('evidence-oracle-result-missing', `${testCase.id} has no result for oracle ${oracle.id}`, file));
      }
      const plannedOracleIds = new Set(asArray(planned.oracle).map((oracle) => oracle.id));
      for (const oracleId of oracleResults.keys()) if (!plannedOracleIds.has(oracleId)) findings.push(finding('evidence-oracle-result-unplanned', `${testCase.id} reports unplanned oracle ${oracleId}`, file));
      const requiredEvidence = asArray(planned?.evidence?.required);
      for (const binding of asArray(testCase?.evidence_bindings)) ensureRequired(binding, ['requirement_id', 'artifact_id', 'type', 'checkpoint'], `evidence.cases.${testCase.id}.evidence_bindings`, findings, file);
      const evidenceBindings = new Map(asArray(testCase?.evidence_bindings).map((binding) => [binding.requirement_id, binding]));
      const bindingRequirementIds = asArray(testCase?.evidence_bindings).map((binding) => ({ id: binding?.requirement_id }));
      for (const duplicate of duplicateIds(bindingRequirementIds)) findings.push(finding('evidence-binding-duplicate', `${testCase.id} binds requirement ${duplicate} more than once`, file));
      const boundArtifactIds = new Set();
      for (const requirement of requiredEvidence) {
        const binding = evidenceBindings.get(requirement.id);
        if (!binding) findings.push(finding('evidence-artifact-missing', `${testCase.id} has no artifact bound to ${requirement.id}`, file));
        else {
          if (binding.type !== requirement.type || binding.checkpoint !== requirement.checkpoint) findings.push(finding('evidence-artifact-type-mismatch', `${testCase.id}.${requirement.id} does not match its required type/checkpoint`, file));
          const artifact = artifacts.get(binding.artifact_id);
          if (!artifact) findings.push(finding('evidence-artifact-missing', `${testCase.id}.${requirement.id} references missing artifact ${binding.artifact_id}`, file));
          else {
            if (EVIDENCE_MEDIA_TYPES[requirement.type] && !EVIDENCE_MEDIA_TYPES[requirement.type].has(artifact.media_type)) findings.push(finding('evidence-artifact-media-mismatch', `${testCase.id}.${requirement.id} media type does not satisfy ${requirement.type}`, file));
            if (['screenshot', 'video'].includes(requirement.type) && (artifact.pii_policy !== 'masked_or_synthetic' || artifact.pii_attestation_ref !== requirement.pii_attestation_ref)) findings.push(finding('evidence-artifact-pii-attestation-mismatch', `${testCase.id}.${requirement.id} is not bound to its approved pixel-redaction attestation`, file));
          }
          if (boundArtifactIds.has(binding.artifact_id)) findings.push(finding('evidence-artifact-reused', `${testCase.id}.${requirement.id} reuses an artifact already bound to another requirement`, file));
          if (globallyBoundArtifactIds.has(binding.artifact_id)) findings.push(finding('evidence-artifact-reused', `${testCase.id}.${requirement.id} reuses an artifact bound to another case`, file));
          boundArtifactIds.add(binding.artifact_id);
          globallyBoundArtifactIds.add(binding.artifact_id);
        }
      }
      const requiredEvidenceIds = new Set(requiredEvidence.map((requirement) => requirement.id));
      for (const requirementId of evidenceBindings.keys()) if (!requiredEvidenceIds.has(requirementId)) findings.push(finding('evidence-artifact-unplanned', `${testCase.id} binds unplanned requirement ${requirementId}`, file));
      if (asArray(testCase?.evidence_bindings).length !== requiredEvidence.length) findings.push(finding('evidence-artifact-unplanned', `${testCase.id} evidence bindings are not exhaustive and exact`, file));
    }
    if (new Set(asArray(testCase?.evidence_ids)).size !== asArray(testCase?.evidence_ids).length) findings.push(finding('evidence-artifact-reused', `${testCase.id} evidence_ids contains duplicates`, file));
    for (const id of asArray(testCase?.evidence_ids)) if (!artifacts.has(id)) findings.push(finding('evidence-artifact-missing', `${testCase.id} references missing artifact ${id}`, file));
  }

  const plannedMutations = new Map(asArray(plan?.mutations).map((mutation) => [mutation.id, mutation]));
  let effectiveEnvironment = environment;
  if (!effectiveEnvironment && environmentContractFile && fs.existsSync(environmentContractFile)) {
    try { effectiveEnvironment = readData(environmentContractFile); } catch { /* contract readability is reported above */ }
  }
  const environmentProfile = asArray(effectiveEnvironment?.profiles).find((profile) => profile?.id === plan?.environment_profile);
  const evidenceCapability = manifest?.capability_receipt;
  const evidenceGrants = asArray(evidenceCapability?.grants);
  const evidenceMutationGrants = evidenceGrants.filter((grant) => grant?.capability === 'data_mutation');
  const evidenceSecretRefs = asArray(environmentProfile?.auth?.secret_refs);
  const evidenceNetworkRequired = evidenceSecretRefs.length > 0 || environmentProfile?.network?.policy === 'allowlist';
  if (plannedMutations.size > 0 || evidenceNetworkRequired) {
    ensureRequired(evidenceCapability, ['provider', 'repository', 'workflow_ref', 'provider_run_id', 'receipt_sha256', 'grants'], 'evidence.capability_receipt', findings, file);
    if (!/^[0-9a-f]{64}$/.test(evidenceCapability?.receipt_sha256 || '')) findings.push(finding('evidence-capability-receipt-digest-invalid', 'evidence must bind the protected capability receipt digest', file));
    if (environmentProfile?.kind === 'local') findings.push(finding('acceptance-local-capability-forbidden', 'local evidence cannot claim network, secret or mutation capability', file));
  } else if (evidenceCapability) findings.push(finding('evidence-capability-receipt-unnecessary', 'evidence carries an undeclared capability receipt', file));
  const actualMutations = new Map(asArray(manifest?.mutations).map((mutation) => [mutation.id, mutation]));
  for (const duplicate of duplicateIds(manifest?.mutations)) findings.push(finding('acceptance-mutation-duplicate', `duplicate evidence mutation ${duplicate}`, file));
  for (const id of plannedMutations.keys()) if (!actualMutations.has(id)) findings.push(finding('acceptance-mutation-missing', `${id} has no execution result`, file));
  for (const mutation of asArray(manifest?.mutations)) {
    ensureRequired(mutation, ['id', 'outcome', 'cleanup', 'cleanup_evidence_ids'], `evidence.mutations.${mutation?.id || '?'}`, findings, file);
    if (plan && !plannedMutations.has(mutation?.id)) findings.push(finding('acceptance-mutation-unplanned', `${mutation?.id} was not planned`, file));
    if (!MUTATION_OUTCOMES.has(mutation?.outcome)) findings.push(finding('acceptance-mutation-outcome-invalid', `${mutation?.id} has invalid outcome ${mutation?.outcome}`, file));
    if (mutation?.outcome === 'failed') findings.push(finding('acceptance-mutation-failed', `${mutation.id} failed`, file));
    if (!CLEANUP_OUTCOMES.has(mutation?.cleanup)) findings.push(finding('acceptance-cleanup-invalid', `${mutation?.id} has invalid cleanup ${mutation?.cleanup}`, file));
    if (mutation?.cleanup === 'failed' || mutation?.cleanup === 'pending') findings.push(finding('acceptance-cleanup-pending', `${mutation.id} cleanup is ${mutation.cleanup}`, file));
    if (!Array.isArray(mutation?.cleanup_evidence_ids) || mutation.cleanup_evidence_ids.some((id) => typeof id !== 'string' || !id)) findings.push(finding('acceptance-cleanup-evidence-invalid', `${mutation?.id}.cleanup_evidence_ids must be a string array`, file));
    if (mutation?.cleanup === 'passed' && asArray(mutation?.cleanup_evidence_ids).length === 0) findings.push(finding('acceptance-cleanup-evidence-missing', `${mutation?.id} claims passed cleanup without evidence`, file));
    for (const evidenceId of asArray(mutation?.cleanup_evidence_ids)) if (!artifacts.has(evidenceId)) findings.push(finding('acceptance-cleanup-evidence-missing', `${mutation?.id} references missing cleanup evidence ${evidenceId}`, file));
    const planned = plannedMutations.get(mutation?.id);
    if (mutation?.outcome === 'applied') {
      const grant = mutation?.authorization;
      const receiptGrant = evidenceMutationGrants.find((candidate) => candidate?.authorization_ref === grant?.authorization_ref);
      if (!planned || grant?.capability !== 'data_mutation' || grant?.target !== planned.target || grant?.environment !== 'non_production'
        || grant?.receipt_sha256 !== evidenceCapability?.receipt_sha256
        || [...asArray(grant?.side_effects)].sort().join(',') !== [...asArray(planned?.side_effects)].sort().join(',')
        || !receiptGrant) findings.push(finding('evidence-mutation-authorization-invalid', `${mutation?.id || '?'} is not bound to its exact protected non-production authorization`, file));
    }
    validateCleanupExecution(mutation, planned, ci, {
      findings,
      file,
      scope: `evidence.mutations.${mutation?.id || '?'}`,
    });
    if (planned?.cleanup_required === true && mutation?.cleanup !== 'passed' && !hasValidWaiver(planned?.waiver)) findings.push(finding('acceptance-cleanup-pending', `${mutation.id} requires a passed cleanup result`, file));
    const usedByApprovedCase = asArray(plan?.cases).some((plannedCase) => asArray(plannedCase?.mutations).includes(mutation?.id)
      && ['passed', 'waived'].includes(actualCases.get(plannedCase.id)?.outcome));
    if (usedByApprovedCase && mutation?.outcome !== 'applied') findings.push(finding('acceptance-mutation-not-applied', `${mutation.id} was required by an approved case but was not applied`, file));
  }
  for (const artifact of artifacts.values()) {
    ensureRequired(artifact, ['id', 'path', 'media_type', 'pii_policy', 'sha256', 'bytes'], `evidence.artifacts.${artifact?.id || '?'}`, findings, file);
    if (!['content_scanned', 'masked_or_synthetic', 'blocked_unverified'].includes(artifact?.pii_policy)) findings.push(finding('evidence-artifact-pii-policy-invalid', `${artifact?.id} has invalid PII policy`, file));
    if (artifact?.pii_policy === 'blocked_unverified') findings.push(finding('evidence-artifact-pii-unverified', `${artifact?.id} has not passed a supported PII minimization policy`, file));
    if (artifact?.pii_policy === 'masked_or_synthetic' && (!SAFE_REFERENCE_PATTERN.test(artifact?.pii_attestation_ref || '') || isPlaceholder(artifact?.pii_attestation_ref))) findings.push(finding('evidence-artifact-pii-attestation-missing', `${artifact?.id} has no concrete external pixel-redaction attestation reference`, file));
    if (artifact?.pii_policy !== 'masked_or_synthetic' && Object.hasOwn(artifact || {}, 'pii_attestation_ref')) findings.push(finding('evidence-artifact-pii-attestation-conflict', `${artifact?.id} carries a pixel attestation for a non-pixel policy`, file));
    if (!artifact?.path || path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]/).includes('..')) findings.push(finding('evidence-artifact-path-invalid', `${artifact?.id} has unsafe path ${artifact?.path}`, file));
    if (!/^sha256:[0-9a-f]{64}$/i.test(artifact?.sha256 || '')) findings.push(finding('evidence-artifact-hash-invalid', `${artifact?.id} has no valid sha256`, file));
    if (!Number.isInteger(artifact?.bytes) || artifact.bytes < 0) findings.push(finding('evidence-artifact-size-invalid', `${artifact?.id} has invalid byte size`, file));
    if (verifyArtifacts && artifactsRoot && artifact?.path) {
      try {
        const resolved = resolveContainedRegularFile(artifactsRoot, path.resolve(artifactsRoot, artifact.path));
        if (sha256File(resolved.absolute) !== artifact.sha256) findings.push(finding('evidence-artifact-hash-mismatch', `${artifact.id} content does not match its recorded hash`, file));
        if (fs.statSync(resolved.absolute).size !== artifact.bytes) findings.push(finding('evidence-artifact-size-mismatch', `${artifact.id} size does not match its recorded byte count`, file));
        const inspection = inspectEvidenceMedia(resolved.absolute, resolved.relative);
        if (!inspection.mediaType || inspection.mediaType !== artifact.media_type) findings.push(finding('evidence-artifact-media-mismatch', `${artifact.id} declared ${artifact.media_type} but bytes identify ${inspection.mediaType || 'unsupported'}`, file));
        for (const issue of scanEvidenceFile(resolved.absolute, resolved.relative, { mediaPiiPolicy: artifact.pii_policy })) findings.push(finding(issue.code, issue.message, file));
      } catch (error) {
        findings.push(finding(error.message.includes('symbolic') ? 'evidence-artifact-symlink' : 'evidence-artifact-path-invalid', `${artifact.id}: ${error.message}`, file));
      }
    }
  }

  const recomputed = { passed: 0, failed: 0, blocked: 0, skipped: 0, waived: 0 };
  for (const testCase of actualCases.values()) if (Object.hasOwn(recomputed, testCase.outcome)) recomputed[testCase.outcome] += 1;
  for (const [key, count] of Object.entries(recomputed)) if (manifest?.summary?.[key] !== count) findings.push(finding('evidence-summary-mismatch', `summary.${key} is ${manifest?.summary?.[key]} but results contain ${count}`, file));
  if (!Array.isArray(manifest?.generation_findings)) findings.push(finding('evidence-generation-findings-invalid', 'generation_findings must be an array', file));
  for (const item of asArray(manifest?.generation_findings)) {
    findings.push(finding(item?.code || 'evidence-generation-finding', item?.message || 'evidence generation reported an unresolved finding', file));
  }
  const actuallyReady = findings.length === 0
    && (actualCases.size > 0 || actualCriterionWaivers.size > 0)
    && [...actualCases.values()].every((testCase) => testCase.outcome === 'passed' || (testCase.outcome === 'waived' && hasValidWaiver(testCase.waiver)))
    && [...actualCriterionWaivers.values()].every(hasValidWaiver);
  if (manifest?.verdict === 'ready' && !actuallyReady) findings.push(finding('evidence-false-pass', 'manifest verdict is ready while its evidence is incomplete or failing', file));
  if (!['ready', 'blocked'].includes(manifest?.verdict)) findings.push(finding('evidence-verdict-invalid', 'verdict must be ready or blocked', file));
  return findings;
}

function validateCleanupExecution(mutation, planned, ci, { findings, file, scope, deferMissing = false }) {
  const execution = mutation?.cleanup_execution;
  if (planned?.cleanup_required !== true) {
    if (execution) findings.push(finding('acceptance-cleanup-execution-unplanned', `${scope}.cleanup_execution is present although cleanup is not required`, file));
    return;
  }
  if (!execution) {
    if (!deferMissing) findings.push(finding('acceptance-cleanup-execution-missing', `${scope} has no execution attestation for its declared cleanup operation`, file));
    return;
  }
  ensureRequired(execution, ['operation_id', 'operation_digest', 'started_at', 'finished_at', 'exit_code', 'outcome'], `${scope}.cleanup_execution`, findings, file);
  if (execution.operation_id !== planned.cleanup_operation) findings.push(finding('acceptance-cleanup-operation-mismatch', `${scope} executed ${execution.operation_id} instead of ${planned.cleanup_operation}`, file));
  const operation = ci?.operations?.[planned.cleanup_operation];
  if (ci && !operation) findings.push(finding('acceptance-cleanup-operation-missing', `${scope} references cleanup operation ${planned.cleanup_operation} absent from the CI contract`, file));
  if (operation) {
    const expectedDigest = sha256Object({
      argv: asArray(operation.argv).map(String),
      cwd: operation.cwd || '.',
      timeout_seconds: operation.timeout_seconds,
      side_effect: operation.side_effect,
    });
    if (execution.operation_digest !== expectedDigest) findings.push(finding('acceptance-cleanup-operation-digest-mismatch', `${scope} cleanup execution differs from the frozen CI operation`, file));
    if (!['cleanup', 'reset'].includes(operation.side_effect)) findings.push(finding('acceptance-cleanup-operation-side-effect-invalid', `${scope} cleanup operation has side effect ${operation.side_effect}`, file));
  } else if (!/^sha256:[0-9a-f]{64}$/i.test(execution.operation_digest || '')) findings.push(finding('acceptance-cleanup-operation-digest-invalid', `${scope} cleanup operation digest is invalid`, file));
  const startedAt = Date.parse(execution.started_at);
  const finishedAt = Date.parse(execution.finished_at);
  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt) || finishedAt < startedAt) findings.push(finding('acceptance-cleanup-execution-time-invalid', `${scope} cleanup execution timestamps are invalid`, file));
  if (!Number.isInteger(execution.exit_code) || execution.exit_code < 0 || !['pass', 'fail'].includes(execution.outcome)) findings.push(finding('acceptance-cleanup-execution-result-invalid', `${scope} cleanup exit/outcome is invalid`, file));
  if ((execution.exit_code === 0) !== (execution.outcome === 'pass')) findings.push(finding('acceptance-cleanup-execution-result-mismatch', `${scope} cleanup exit code and outcome disagree`, file));
  if (mutation.cleanup === 'passed' && (execution.exit_code !== 0 || execution.outcome !== 'pass')) findings.push(finding('acceptance-cleanup-false-pass', `${scope} claims passed cleanup after a failing operation`, file));
}

export function validatePrDraft(contract, ci = null, { file = 'pr-draft.yaml', allowPlaceholders = false } = {}) {
  const findings = [];
  ensureRequired(contract, ['version', 'provider', 'repository', 'draft', 'title', 'base_ref', 'head_ref_from', 'body_path', 'spec_ref', 'factory_plan_ref', 'acceptance_matrix_ref', 'environment_contract_ref', 'ci_contract_ref', 'replay_command', 'required_checks', 'ci_attestation', 'authorization', 'permissions', 'forbidden_actions'], 'pr_draft', findings, file);
  if (Object.hasOwn(contract || {}, 'technical_plan_ref')) findings.push(finding('pr-legacy-technical-plan-ref', 'technical_plan_ref is a V1 input; migrate to factory_plan_ref targeting factory/plan.v3.json', file));
  if (contract?.version !== 1) findings.push(finding('pr-version-unsupported', 'pr_draft.version must be 1', file));
  if (contract?.provider !== 'github') findings.push(finding('pr-provider-unsupported', 'only the github draft provider is supported', file));
  const repositoryPlaceholder = allowPlaceholders && isPlaceholder(contract?.repository);
  if (!repositoryPlaceholder && (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(contract?.repository || '') || isPlaceholder(contract?.repository))) findings.push(finding('pr-repository-invalid', 'repository must be one concrete canonical GitHub owner/name', file));
  if (contract?.draft !== true) findings.push(finding('pr-not-draft', 'factory PR creation is draft-only', file));
  const permissionKeys = Object.keys(requiredObject(contract?.permissions) ? contract.permissions : {}).sort();
  if (contract?.permissions?.actions !== 'read' || contract?.permissions?.contents !== 'read' || contract?.permissions?.checks !== 'read' || contract?.permissions?.pull_requests !== 'write' || sha256Object(permissionKeys) !== sha256Object(['actions', 'checks', 'contents', 'pull_requests'])) findings.push(finding('pr-permissions-invalid', 'draft PR permissions must be exactly actions:read, contents:read, checks:read and pull_requests:write', file));
  for (const action of FORBIDDEN_PR_ACTIONS) if (!asArray(contract?.forbidden_actions).includes(action)) findings.push(finding('pr-authority-too-broad', `${action} must remain forbidden`, file));
  ensureRequired(contract?.authorization, ['required', 'provider', 'issuer_ref', 'gate_id', 'public_key_ref', 'max_age_minutes'], 'pr_draft.authorization', findings, file);
  if (contract?.authorization?.required !== true || contract?.authorization?.provider !== 'external_receipt' || !contract?.authorization?.gate_id) findings.push(finding('pr-authorization-missing', 'draft creation requires an external authorization receipt gate', file));
  if (!SAFE_REFERENCE_PATTERN.test(contract?.authorization?.gate_id || '') || isPlaceholder(contract?.authorization?.gate_id)) findings.push(finding('pr-authorization-missing', 'authorization.gate_id must be a concrete logical gate reference', file));
  const issuerPlaceholder = allowPlaceholders && isPlaceholder(contract?.authorization?.issuer_ref);
  if (!issuerPlaceholder && (!SAFE_REFERENCE_PATTERN.test(contract?.authorization?.issuer_ref || '') || isPlaceholder(contract?.authorization?.issuer_ref))) findings.push(finding('pr-authorization-missing', 'authorization.issuer_ref must identify the external signer', file));
  if (!validReferencePath(contract?.authorization?.public_key_ref) || (!allowPlaceholders && isPlaceholder(contract?.authorization?.public_key_ref))) findings.push(finding('pr-authorization-key-invalid', 'authorization.public_key_ref must be a repository-relative public key path', file));
  if (!Number.isInteger(contract?.authorization?.max_age_minutes) || contract.authorization.max_age_minutes < 1 || contract.authorization.max_age_minutes > 1440) findings.push(finding('pr-authorization-expiry-invalid', 'authorization.max_age_minutes must be between 1 and 1440', file));
  if (typeof contract?.title !== 'string' || !contract.title.trim() || /[\r\n]/.test(contract.title) || (!allowPlaceholders && isPlaceholder(contract.title))) findings.push(finding('pr-title-invalid', 'title must be one concrete single-line value', file));
  const baseRefPlaceholder = allowPlaceholders && isPlaceholder(contract?.base_ref);
  if (!baseRefPlaceholder && (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(contract?.base_ref || '') || String(contract?.base_ref).includes('..') || isPlaceholder(contract?.base_ref))) findings.push(finding('pr-base-ref-invalid', 'base_ref must be a concrete safe Git ref', file));
  if (!ENV_REFERENCE_PATTERN.test(contract?.head_ref_from || '')) findings.push(finding('pr-head-ref-source-invalid', 'head_ref_from must name one environment variable', file));
  if (!validReferencePath(contract?.body_path)) findings.push(finding('pr-body-path-invalid', 'body_path must be a safe repository-relative path', file));
  for (const key of ['body_path', 'spec_ref', 'factory_plan_ref', 'acceptance_matrix_ref', 'environment_contract_ref', 'ci_contract_ref']) {
    if (!validReferencePath(contract?.[key])) findings.push(finding('pr-reference-path-invalid', `${key} must be repository-relative`, file));
    if (!allowPlaceholders && isPlaceholder(contract?.[key])) findings.push(finding('pr-placeholder', `${key} contains an unresolved placeholder`, file));
  }
  if (contract?.factory_plan_ref && !String(contract.factory_plan_ref).endsWith('/factory/plan.v3.json') && contract.factory_plan_ref !== 'factory/plan.v3.json') findings.push(finding('pr-factory-plan-ref-invalid', 'factory_plan_ref must target the canonical factory/plan.v3.json contract', file));
  ensureRequired(contract?.ci_attestation, ['provider', 'workflow_ref', 'event', 'artifact_name_prefix'], 'pr_draft.ci_attestation', findings, file);
  if (contract?.ci_attestation?.provider !== 'github_actions' || contract?.ci_attestation?.event !== 'repository_dispatch') findings.push(finding('pr-ci-attestation-invalid', 'CI attestation must use a protected-default-branch repository_dispatch GitHub Actions run', file));
  if (!validReferencePath(contract?.ci_attestation?.workflow_ref) || !String(contract?.ci_attestation?.workflow_ref || '').startsWith('.github/workflows/')) findings.push(finding('pr-ci-attestation-invalid', 'ci_attestation.workflow_ref must identify a repository workflow', file));
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{3,99}$/.test(contract?.ci_attestation?.artifact_name_prefix || '')) findings.push(finding('pr-ci-attestation-invalid', 'artifact_name_prefix must be a safe concrete minimized-bundle prefix', file));
  if (typeof contract?.replay_command !== 'string' || !contract.replay_command.trim() || /[\r\n]/.test(contract.replay_command) || (!allowPlaceholders && isPlaceholder(contract.replay_command))) findings.push(finding('pr-replay-command-invalid', 'replay_command must be one concrete single-line command', file));
  if (!Array.isArray(contract?.required_checks) || contract.required_checks.length === 0) findings.push(finding('pr-required-check-missing', 'required_checks must not be empty', file));
  if (new Set(asArray(contract?.required_checks)).size !== asArray(contract?.required_checks).length) findings.push(finding('pr-required-check-duplicate', 'required_checks must not contain duplicates', file));
  if (ci) {
    const checks = new Set(asArray(ci.checks).filter((check) => check.required === true).map((check) => check.id));
    for (const id of checks) if (!asArray(contract?.required_checks).includes(id)) findings.push(finding('pr-required-check-missing', `${id} is required by CI but absent from the PR contract`, file));
    for (const id of asArray(contract?.required_checks)) if (!checks.has(id)) findings.push(finding('pr-required-check-unplanned', `${id} is not a required CI check`, file));
  }
  return findings;
}

export function validateCrossContracts({ environment, ci, plan, pr }, files = {}) {
  const findings = [];
  const profiles = new Map(asArray(environment?.profiles).map((profile) => [profile.id, profile]));
  if (plan?.environment_profile && !profiles.has(plan.environment_profile)) findings.push(finding('acceptance-environment-unknown', `acceptance profile ${plan.environment_profile} is not declared`, files.plan));
  const profile = profiles.get(plan?.environment_profile);
  if (plan?.campaign?.unattended_required === true && profile?.automated !== true) findings.push(finding('acceptance-not-unattended', `${profile.id} is not automation-compatible`, files.plan));
  if (plan?.campaign?.adapter === 'command') {
    const operation = ci?.operations?.[plan?.campaign?.operation];
    if (!operation) findings.push(finding('acceptance-command-operation-unknown', `command campaign references unknown operation ${String(plan?.campaign?.operation)}`, files.plan));
    else if (operation.side_effect !== 'none') findings.push(finding('acceptance-command-operation-side-effect', 'command campaign operation must be side-effect-free', files.plan));
  }
  if (plan?.campaign?.bootstrap_operation) {
    const operation = ci?.operations?.[plan.campaign.bootstrap_operation];
    if (!operation) findings.push(finding('acceptance-bootstrap-operation-unknown', `campaign bootstrap references unknown operation ${plan.campaign.bootstrap_operation}`, files.plan));
    else if (operation.side_effect !== 'build') findings.push(finding('acceptance-bootstrap-operation-side-effect', 'campaign bootstrap operation must declare build side effect', files.plan));
  }
  if (pr && ci) findings.push(...validatePrDraft(pr, ci, { file: files.pr, allowPlaceholders: files.allowPlaceholders === true }));
  if (profile) {
    const allowedMutations = new Set(asArray(profile?.mutation_policy?.allowed));
    for (const mutation of asArray(plan?.mutations)) {
      if (!allowedMutations.has(mutation.id)) findings.push(finding('acceptance-mutation-not-allowed', `${mutation.id} is not allowed by environment profile ${profile.id}`, files.plan));
      if (mutation.cleanup_operation) {
        const cleanup = requiredObject(ci?.operations) && Object.hasOwn(ci.operations, mutation.cleanup_operation) ? ci.operations[mutation.cleanup_operation] : null;
        if (!cleanup) findings.push(finding('acceptance-cleanup-operation-unknown', `${mutation.id} references unknown cleanup operation ${mutation.cleanup_operation}`, files.plan));
        else if (cleanup.side_effect !== 'cleanup' && cleanup.side_effect !== 'reset') findings.push(finding('acceptance-cleanup-operation-invalid', `${mutation.id} cleanup operation must declare cleanup or reset side effect`, files.plan));
      }
    }
  }
  return findings;
}
