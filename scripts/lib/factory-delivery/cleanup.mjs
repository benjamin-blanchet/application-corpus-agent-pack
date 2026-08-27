import fs from 'node:fs';
import path from 'node:path';

import { asArray } from './core.mjs';
import { readData, writeData } from './files.mjs';
import { executeOperation, operationContractDigest } from './operations.mjs';

export function runMutationCleanups({ root, ci, plan, lifecycle, env, evidenceRoot } = {}) {
  const resultsFile = path.join(evidenceRoot, 'results.json');
  const requiredCleanups = asArray(plan?.mutations).filter((item) => item?.cleanup_required === true);
  if (requiredCleanups.length === 0) return true;
  let ready = true;
  let results = null;
  try {
    if (fs.existsSync(resultsFile)) {
      const candidate = readData(resultsFile);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) results = candidate;
      else ready = false;
    } else ready = false;
  } catch {
    // Cleanup is a safety finalizer, not a consequence of reporter success.
    // A missing/corrupt result blocks readiness but must never suppress it.
    ready = false;
  }
  const byId = new Map(asArray(results?.mutations).map((mutation) => [mutation.id, mutation]));
  const recordLifecycle = (entry) => {
    if (Array.isArray(lifecycle)) lifecycle.push(entry);
  };

  for (const mutation of requiredCleanups) {
    const operationId = mutation.cleanup_operation;
    const actual = byId.get(mutation.id);
    if (typeof operationId !== 'string' || !ci?.operations?.[operationId]) {
      ready = false;
      if (actual) {
        actual.cleanup = 'failed';
        delete actual.cleanup_execution;
      }
      recordLifecycle({
        role: 'mutation_cleanup',
        mutation_id: mutation.id,
        operation_id: operationId || null,
        outcome: 'fail',
        exit_code: null,
        error: 'declared cleanup operation is unavailable',
      });
      continue;
    }
    const operationDigest = operationContractDigest(ci.operations[operationId]);
    let result;
    const attemptedAt = new Date().toISOString();
    try {
      result = executeOperation(ci, operationId, { cwd: root, env, dryRun: false, allowedSideEffects: ['cleanup', 'reset'] });
      recordLifecycle({ role: 'mutation_cleanup', mutation_id: mutation.id, operation_id: operationId, operation_digest: operationDigest, ...result });
    } catch (error) {
      ready = false;
      if (actual) {
        actual.cleanup = 'failed';
        delete actual.cleanup_execution;
      }
      recordLifecycle({
        role: 'mutation_cleanup',
        mutation_id: mutation.id,
        operation_id: operationId,
        operation_digest: operationDigest,
        started_at: attemptedAt,
        finished_at: new Date().toISOString(),
        outcome: 'fail',
        exit_code: null,
        error: String(error?.message || error),
      });
      continue;
    }
    if (!actual) {
      ready = false;
      continue;
    }
    actual.cleanup = result.outcome === 'pass' ? 'passed' : 'failed';
    actual.cleanup_execution = {
      operation_id: operationId,
      operation_digest: operationDigest,
      started_at: result.started_at,
      finished_at: result.finished_at,
      exit_code: result.exit_code,
      outcome: result.outcome,
    };
    const cleanupArtifactBase = mutation.id.replace(/[^A-Za-z0-9._-]/g, '-');
    const cleanupArtifactId = `${cleanupArtifactBase}-cleanup-operation`;
    const cleanupArtifactPath = `${cleanupArtifactBase}-cleanup-operation.json`;
    let artifactWritten = false;
    try {
      writeData(path.join(evidenceRoot, cleanupArtifactPath), {
        schema_version: 1,
        mutation_id: mutation.id,
        ...actual.cleanup_execution,
      });
      artifactWritten = true;
    } catch {
      ready = false;
    }
    const plannedCase = asArray(plan?.cases).find((testCase) => asArray(testCase?.mutations).includes(mutation.id));
    const evidenceCase = asArray(results?.cases).find((testCase) => testCase?.id === plannedCase?.id) || asArray(results?.cases)[0];
    if (artifactWritten && evidenceCase) {
      evidenceCase.evidence = asArray(evidenceCase.evidence).filter((item) => item?.id !== cleanupArtifactId);
      evidenceCase.evidence.push({ id: cleanupArtifactId, path: cleanupArtifactPath, media_type: 'application/json' });
      actual.cleanup_evidence_ids = [...new Set([...asArray(actual.cleanup_evidence_ids), cleanupArtifactId])];
    } else ready = false;
    if (result.outcome !== 'pass') ready = false;
  }
  if (results) {
    try {
      writeData(resultsFile, results);
    } catch {
      ready = false;
    }
  }
  return ready;
}
