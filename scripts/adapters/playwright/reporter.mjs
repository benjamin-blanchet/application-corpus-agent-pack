import fs from 'node:fs';
import path from 'node:path';

import { asArray } from '../../lib/factory-delivery/core.mjs';
import { readData } from '../../lib/factory-delivery/files.mjs';

function annotationValues(test, type) {
  return [...new Set((test.annotations || []).filter((annotation) => annotation.type === type).map((annotation) => annotation.description).filter(Boolean))];
}

function rawAnnotationValues(test, type) {
  return (test.annotations || []).filter((annotation) => annotation.type === type).map((annotation) => annotation.description).filter(Boolean);
}

function caseId(test) {
  return annotationValues(test, 'case')[0] || test.title.match(/\bCASE-[A-Za-z0-9._-]+\b/)?.[0] || `UNMAPPED-${test.id}`;
}

function outcome(status) {
  if (status === 'passed') return 'pass';
  if (status === 'skipped') return 'skipped';
  if (status === 'failed' || status === 'timedOut') return 'fail';
  return 'blocked';
}

function safeIdentifier(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value || '');
}

function parseOracleAnnotation(description) {
  try {
    const parsed = String(description || '').trim().startsWith('{')
      ? JSON.parse(description)
      : (() => {
        const [id, oracleOutcome] = String(description || '').split(':');
        return { id, outcome: oracleOutcome };
      })();
    if (!safeIdentifier(parsed?.id) || !['pass', 'fail', 'blocked', 'skipped'].includes(parsed?.outcome)) return null;
    return { id: parsed.id, outcome: parsed.outcome, recorded: true };
  } catch {
    return null;
  }
}

function explicitOracleResults(test, planned) {
  const parsed = rawAnnotationValues(test, 'oracle').map(parseOracleAnnotation).filter(Boolean);
  const byId = new Map();
  for (const oracle of parsed) {
    if (!byId.has(oracle.id)) byId.set(oracle.id, []);
    byId.get(oracle.id).push(oracle);
  }
  const results = [];
  for (const oracle of asArray(planned?.oracle)) {
    const records = byId.get(oracle.id) || [];
    results.push(records.length === 1 ? records[0] : { id: oracle.id, outcome: 'blocked', recorded: false });
    byId.delete(oracle.id);
  }
  for (const records of byId.values()) results.push(...records);
  return results;
}

function userVisibleErrorRecorded(test) {
  const records = annotationValues(test, 'user_visible_error');
  if (records.length === 0) return false;
  return records.some((description) => {
    try {
      const parsed = String(description).trim().startsWith('{') ? JSON.parse(description) : { detected: description !== 'false' };
      return parsed?.detected !== false;
    } catch {
      return true;
    }
  });
}

function parseMutationAnnotation(description, attachmentIds) {
  try {
    const parsed = String(description || '').trim().startsWith('{')
      ? JSON.parse(description)
      : (() => {
        const [id, mutationOutcome, cleanup, rawEvidence = ''] = String(description || '').split(':');
        return { id, outcome: mutationOutcome, cleanup, cleanup_evidence: rawEvidence ? rawEvidence.split(',') : [] };
      })();
    if (!safeIdentifier(parsed?.id)) return null;
    const cleanupEvidenceIds = asArray(parsed.cleanup_evidence).map((reference) => attachmentIds.get(reference) || `unresolved-${String(reference).replace(/[^A-Za-z0-9._-]/g, '-')}`);
    return { id: parsed.id, outcome: parsed.outcome, cleanup: parsed.cleanup, cleanup_evidence_ids: [...new Set(cleanupEvidenceIds)] };
  } catch {
    return null;
  }
}

function mergeMutation(previous, next) {
  if (!previous) return next;
  const outcomeRank = new Map([['applied', 0], ['not_applied', 1], ['failed', 2]]);
  const cleanupRank = new Map([['passed', 0], ['not_required', 1], ['pending', 2], ['failed', 3]]);
  return {
    id: next.id,
    outcome: (outcomeRank.get(next.outcome) ?? 3) > (outcomeRank.get(previous.outcome) ?? 3) ? next.outcome : previous.outcome,
    cleanup: (cleanupRank.get(next.cleanup) ?? 4) > (cleanupRank.get(previous.cleanup) ?? 4) ? next.cleanup : previous.cleanup,
    cleanup_evidence_ids: [...new Set([...asArray(previous.cleanup_evidence_ids), ...asArray(next.cleanup_evidence_ids)])],
  };
}

export default class FactoryEvidenceReporter {
  constructor(options = {}) {
    this.options = options;
    this.cases = new Map();
    this.startedAt = new Date().toISOString();
    this.projects = [];
    this.browserVersion = process.env.FACTORY_BROWSER_VERSION || null;
    this.plan = process.env.FACTORY_ACCEPTANCE_PLAN && fs.existsSync(process.env.FACTORY_ACCEPTANCE_PLAN)
      ? readData(process.env.FACTORY_ACCEPTANCE_PLAN)
      : null;
    this.plannedCases = new Map(asArray(this.plan?.cases).map((item) => [item.id, item]));
    this.plannedMutations = new Map(asArray(this.plan?.mutations).map((item) => [item.id, item]));
    this.mutations = new Map();
  }

  onBegin(config) {
    this.projects = (config.projects || []).map((project) => project.name).filter(Boolean);
  }

  onTestEnd(test, result) {
    const id = caseId(test);
    const planned = this.plannedCases.get(id);
    const existing = this.cases.get(id) || {
      id,
      title: test.title,
      criteria: asArray(planned?.criteria).length ? asArray(planned.criteria) : annotationValues(test, 'criterion'),
      attempts: 0,
      outcome: 'blocked',
      user_visible_error: false,
      oracle_results: [],
      evidence: [],
    };
    existing.attempts = Math.max(existing.attempts, Number(result.retry || 0) + 1);
    existing.outcome = outcome(result.status);
    existing.title = test.title;
    existing.user_visible_error = existing.user_visible_error || userVisibleErrorRecorded(test);
    if (existing.user_visible_error) existing.outcome = 'fail';
    existing.oracle_results = explicitOracleResults(test, planned);
    const requiredEvidence = new Map(asArray(planned?.evidence?.required).flatMap((item) => [[item.id, item], [item.checkpoint, item]]));
    const attachmentIds = new Map();
    for (const [index, attachment] of (result.attachments || []).entries()) {
      if (!attachment.path) continue;
      if (attachment.name?.endsWith('-metadata')) {
        try {
          const metadata = JSON.parse(fs.readFileSync(attachment.path, 'utf8'));
          if (metadata.run_id === process.env.FACTORY_RUN_ID && metadata.subject_sha === process.env.FACTORY_SUBJECT_SHA) this.browserVersion = metadata.browser_version || this.browserVersion;
        } catch {
          // The evidence assembler will reject missing or malformed required bindings.
        }
      }
      const root = path.resolve(process.env.FACTORY_EVIDENCE_ROOT || process.cwd());
      const relative = path.relative(root, path.resolve(attachment.path)).split(path.sep).join('/');
      const attempt = Number(result.retry || 0) + 1;
      const requirement = requiredEvidence.get(attachment.name);
      const artifactId = `${id}-attempt-${attempt}-${String(attachment.name || `attachment-${index + 1}`).replace(/[^A-Za-z0-9._-]/g, '-')}`;
      attachmentIds.set(attachment.name, artifactId);
      existing.evidence.push({
        id: artifactId,
        path: relative,
        media_type: attachment.contentType || undefined,
        ...(requirement ? {
          requirement_id: requirement.id,
          type: requirement.type,
          checkpoint: requirement.checkpoint,
          ...(requirement.media_pii_policy ? { media_pii_policy: requirement.media_pii_policy } : {}),
        } : {}),
      });
    }
    for (const annotation of (test.annotations || []).filter((item) => item.type === 'mutation')) {
      const mutation = parseMutationAnnotation(annotation.description, attachmentIds);
      if (mutation && this.plannedMutations.has(mutation.id)) this.mutations.set(mutation.id, mergeMutation(this.mutations.get(mutation.id), mutation));
    }
    this.cases.set(id, existing);
  }

  async onEnd(result) {
    const output = path.resolve(process.env.FACTORY_RESULTS_PATH || 'factory-evidence/results.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const cases = [...this.cases.values()].sort((a, b) => a.id.localeCompare(b.id));
    const mutations = [...this.plannedMutations.keys()].map((id) => this.mutations.get(id) || {
      id,
      outcome: 'not_applied',
      cleanup: this.plannedMutations.get(id)?.cleanup_required ? 'pending' : 'not_required',
      cleanup_evidence_ids: [],
    });
    const everyOracleRecorded = cases.every((testCase) => asArray(testCase.oracle_results).length > 0
      && asArray(testCase.oracle_results).every((oracle) => oracle.recorded === true && oracle.outcome === 'pass'));
    const casesReady = cases.length === this.plannedCases.size
      && cases.every((testCase) => testCase.outcome === 'pass' && testCase.user_visible_error === false);
    const requiredMutationIds = new Set(asArray(this.plan?.cases).flatMap((testCase) => asArray(testCase.mutations)));
    const deferCleanup = process.env.FACTORY_DEFER_CLEANUP === 'true';
    const cleanupReady = mutations.every((mutation) => mutation.outcome !== 'failed'
      && (!requiredMutationIds.has(mutation.id) || mutation.outcome === 'applied')
      && mutation.cleanup !== 'failed'
      && (mutation.cleanup !== 'pending' || deferCleanup)
      && (!this.plannedMutations.get(mutation.id)?.cleanup_required || (mutation.cleanup === 'passed'
        && mutation.cleanup_evidence_ids.length > 0
        && mutation.cleanup_evidence_ids.every((id) => !id.startsWith('unresolved-'))) || (deferCleanup && mutation.cleanup === 'pending')));
    const payload = {
      schema_version: 1,
      run_id: process.env.FACTORY_RUN_ID || `playwright-${Date.now()}`,
      started_at: this.startedAt,
      finished_at: new Date().toISOString(),
      candidate_sha: process.env.FACTORY_SUBJECT_SHA || 'unknown',
      plan_digest: process.env.FACTORY_PLAN_DIGEST || 'unknown',
      environment_digest: process.env.FACTORY_ENVIRONMENT_DIGEST || 'unknown',
      observation_run_id: process.env.FACTORY_OBSERVATION_RUN_ID || 'unknown',
      overall_status: result.status === 'passed' && casesReady && everyOracleRecorded && cleanupReady
        ? 'passed'
        : result.status === 'failed' || result.status === 'timedout' || cases.some((testCase) => testCase.outcome === 'fail')
          ? 'failed'
          : 'blocked',
      toolchain: {
        adapter: 'playwright',
        adapter_version: process.env.FACTORY_ADAPTER_VERSION || 'unknown',
        browser: this.projects.join(',') || 'configured-project',
        browser_version: this.browserVersion || 'unknown',
      },
      cases,
      mutations,
    };
    fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  printsToStdio() {
    return false;
  }
}
