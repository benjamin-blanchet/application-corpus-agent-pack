import { canonicalHash } from './canonical-json.mjs';
import { normalizeRepoPath } from './path-claims.mjs';
import { repositoryFileObservation } from './artifact-digest.mjs';

export const VERIFICATION_RECEIPT_ALGORITHM = 'sha256-verification-receipt-v1';

export function verificationReceiptDigest(receipt) {
  return canonicalHash({
    algorithm: receipt?.algorithm,
    id: receipt?.id,
    command: receipt?.command,
    status: receipt?.status,
    runner: receipt?.runner,
    exit_code: receipt?.exit_code,
    stdout: receipt?.stdout,
    stderr: receipt?.stderr,
    artifacts: receipt?.artifacts,
  });
}

export function materializeVerificationReceipts({ repoRoot, controllerId, receipts }) {
  return (receipts || []).map((receipt) => {
    const value = {
      ...receipt,
      algorithm: VERIFICATION_RECEIPT_ALGORITHM,
      runner: {
        kind: 'controller_observed',
        id: controllerId,
        version: 1,
        attestation_ref: `controller:${controllerId}`,
      },
      stdout: observeByteReference(repoRoot, receipt?.stdout?.path),
      stderr: observeByteReference(repoRoot, receipt?.stderr?.path),
      artifacts: (receipt?.artifacts || []).map((entry) => observeByteReference(repoRoot, entry?.path)),
      receipt_sha256: null,
    };
    value.receipt_sha256 = verificationReceiptDigest(value);
    return value;
  });
}

export function validateVerificationReceiptBytes({ repoRoot, receipt }) {
  const findings = [];
  for (const [scope, reference] of [
    ['stdout', receipt?.stdout],
    ['stderr', receipt?.stderr],
    ...(receipt?.artifacts || []).map((entry, index) => [`artifacts[${index}]`, entry]),
  ]) {
    if (!reference?.path) continue;
    try {
      const observed = observeByteReference(repoRoot, reference.path);
      if (observed.sha256 !== reference.sha256 || observed.bytes !== reference.bytes) {
        findings.push(finding('factory-verification-receipt-bytes-mismatch', `${receipt?.id || '<unknown>'}.${scope} bytes differ from the receipt`));
      }
    } catch (error) {
      findings.push(finding(error.code || 'factory-verification-receipt-unreadable', `${receipt?.id || '<unknown>'}.${scope}: ${error.message}`));
    }
  }
  if (verificationReceiptDigest(receipt) !== receipt?.receipt_sha256) {
    findings.push(finding('factory-verification-receipt-digest-mismatch', `${receipt?.id || '<unknown>'}: receipt_sha256 is not recomputable`));
  }
  return findings;
}

function observeByteReference(repoRoot, candidate) {
  const repoPath = normalizeRepoPath(candidate);
  const observed = repositoryFileObservation({ repoRoot, repoPath });
  if (!observed.exists || observed.kind !== 'file') fail('factory-verification-receipt-file', `verification evidence must be a regular file: ${repoPath}`);
  return { path: repoPath, sha256: observed.sha256, bytes: observed.bytes };
}

function finding(code, message) {
  return { severity: 'P0', code, message };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
