import path from 'node:path';

export function validateClaim(claim) {
  const findings = [];
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return [{ code: 'factory-path-claim-shape', message: 'claim must be an object' }];
  if (!['exact', 'prefix'].includes(claim.kind)) findings.push({ code: 'factory-path-claim-kind', message: `unsupported claim kind ${String(claim.kind)}` });
  try {
    normalizeRepoPath(claim.path);
  } catch (error) {
    findings.push({ code: error.code || 'factory-path-invalid', message: error.message });
  }
  return findings;
}

export function normalizeRepoPath(input) {
  if (typeof input !== 'string' || !input.trim()) throw pathError('factory-path-empty', 'path must be a non-empty string');
  if (input.includes('\\')) throw pathError('factory-path-not-posix', `path must use POSIX separators: ${input}`);
  if (input.includes('*') || input.includes('?') || input.includes('[')) throw pathError('factory-path-glob-forbidden', `globs are not allowed in V3 claims: ${input}`);
  if (path.posix.isAbsolute(input)) throw pathError('factory-path-absolute', `absolute path is forbidden: ${input}`);
  const trimmed = input.replace(/\/+$/, '');
  const normalized = path.posix.normalize(trimmed);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw pathError('factory-path-escape', `path escapes or claims the repository root: ${input}`);
  }
  if (normalized.startsWith('./')) throw pathError('factory-path-noncanonical', `path must not start with ./: ${input}`);
  return normalized;
}

export function claimsOverlap(left, right) {
  const a = normalizedClaim(left);
  const b = normalizedClaim(right);
  if (a.kind === 'exact' && b.kind === 'exact') return a.path === b.path;
  if (a.kind === 'prefix' && b.kind === 'prefix') return contains(a.path, b.path) || contains(b.path, a.path);
  const prefix = a.kind === 'prefix' ? a : b;
  const exact = a.kind === 'exact' ? a : b;
  return contains(prefix.path, exact.path);
}

export function claimCoversPath(claim, candidate) {
  const normalized = normalizedClaim(claim);
  const file = normalizeRepoPath(candidate);
  return normalized.kind === 'exact' ? normalized.path === file : contains(normalized.path, file);
}

export function changedPathsOutsideClaims(changedPaths, claims) {
  return [...new Set(changedPaths || [])]
    .map(normalizeRepoPath)
    .filter((changed) => !(claims || []).some((claim) => claimCoversPath(claim, changed)))
    .sort();
}

export function changedPathsInsideForbidden(changedPaths, forbiddenPaths) {
  const forbidden = (forbiddenPaths || []).map(normalizeRepoPath);
  return [...new Set(changedPaths || [])]
    .map(normalizeRepoPath)
    .filter((changed) => forbidden.some((prefix) => contains(prefix, changed)))
    .sort();
}

export function claimsConflict(leftClaims, rightClaims) {
  return (leftClaims || []).some((left) => (rightClaims || []).some((right) => claimsOverlap(left, right)));
}

export function normalizedClaim(claim) {
  const issues = validateClaim(claim);
  if (issues.length) throw pathError(issues[0].code, issues[0].message);
  return { kind: claim.kind, path: normalizeRepoPath(claim.path) };
}

export function pathAllowedByPatterns(candidate, allowed) {
  return (allowed || []).some((claim) => claimCoversPath(claim, candidate));
}

function contains(prefix, candidate) {
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

function pathError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
