import fs from 'node:fs';
import path from 'node:path';

import { asArray } from '../../lib/factory-delivery/core.mjs';
import { readData } from '../../lib/factory-delivery/files.mjs';

function annotationValues(test, type) {
  return [...new Set((test.annotations || []).filter((annotation) => annotation.type === type).map((annotation) => annotation.description).filter(Boolean))];
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
      oracle_results: [],
      evidence: [],
    };
    existing.attempts = Math.max(existing.attempts, Number(result.retry || 0) + 1);
    existing.outcome = outcome(result.status);
    existing.title = test.title;
    existing.oracle_results = asArray(planned?.oracle).map((oracle) => ({ id: oracle.id, outcome: existing.outcome === 'pass' ? 'pass' : existing.outcome }));
    const requiredEvidence = new Map(asArray(planned?.evidence?.required).flatMap((item) => [[item.id, item], [item.checkpoint, item]]));
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
      existing.evidence.push({
        id: `${id}-attempt-${attempt}-${String(attachment.name || `attachment-${index + 1}`).replace(/[^A-Za-z0-9._-]/g, '-')}`,
        path: relative,
        media_type: attachment.contentType || undefined,
        ...(requirement ? {
          requirement_id: requirement.id,
          type: requirement.type,
          checkpoint: requirement.checkpoint,
        } : {}),
      });
    }
    for (const annotation of (test.annotations || []).filter((item) => item.type === 'mutation')) {
      const [mutationId, mutationOutcome, cleanup] = String(annotation.description || '').split(':');
      if (this.plannedMutations.has(mutationId)) this.mutations.set(mutationId, { id: mutationId, outcome: mutationOutcome, cleanup });
    }
    this.cases.set(id, existing);
  }

  async onEnd(result) {
    const output = path.resolve(process.env.FACTORY_RESULTS_PATH || 'factory-evidence/results.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const payload = {
      schema_version: 1,
      run_id: process.env.FACTORY_RUN_ID || `playwright-${Date.now()}`,
      started_at: this.startedAt,
      finished_at: new Date().toISOString(),
      candidate_sha: process.env.FACTORY_SUBJECT_SHA || 'unknown',
      plan_digest: process.env.FACTORY_PLAN_DIGEST || 'unknown',
      environment_digest: process.env.FACTORY_ENVIRONMENT_DIGEST || 'unknown',
      observation_run_id: process.env.FACTORY_OBSERVATION_RUN_ID || 'unknown',
      overall_status: result.status === 'passed' ? 'passed' : result.status === 'failed' || result.status === 'timedout' ? 'failed' : 'blocked',
      toolchain: {
        adapter: 'playwright',
        adapter_version: process.env.FACTORY_ADAPTER_VERSION || 'unknown',
        browser: this.projects.join(',') || 'configured-project',
        browser_version: this.browserVersion || 'unknown',
      },
      cases: [...this.cases.values()].sort((a, b) => a.id.localeCompare(b.id)),
      mutations: [...this.plannedMutations.keys()].map((id) => this.mutations.get(id) || { id, outcome: 'not_applied', cleanup: this.plannedMutations.get(id)?.cleanup_required ? 'pending' : 'not_required' }),
    };
    fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  printsToStdio() {
    return false;
  }
}
