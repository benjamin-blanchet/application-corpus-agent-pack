import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_BASENAMES = [
  /storage[-_.]?state/i,
  /cookies?/i,
  /user[-_.]?data/i,
  /browser[-_.]?profile/i,
  /credentials?/i,
  /secrets?/i,
];

const TEXT_PATTERNS = [
  ['evidence-possible-private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['evidence-possible-aws-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['evidence-possible-token', /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/i],
  ['evidence-possible-bearer-token', /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._~+\/-]{12,}/i],
  ['evidence-possible-jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['evidence-possible-email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
];

const TEXT_EXTENSIONS = new Set(['.txt', '.json', '.yaml', '.yml', '.md', '.xml', '.log', '.html', '.csv', '.js', '.mjs', '.css', '.map', '.svg']);
const INSPECTABLE_BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_INSPECTABLE_BYTES = 50 * 1024 * 1024;

export function scanEvidenceFile(file, relativePath) {
  const findings = [];
  const basename = path.basename(relativePath);
  for (const pattern of FORBIDDEN_BASENAMES) {
    if (pattern.test(basename) || relativePath.split('/').some((part) => pattern.test(part))) {
      findings.push({ code: 'evidence-sensitive-artifact', message: `${relativePath} looks like authentication or secret state` });
      break;
    }
  }
  const extension = path.extname(file).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && !INSPECTABLE_BINARY_EXTENSIONS.has(extension)) {
    findings.push({ code: 'evidence-uninspectable-artifact', message: `${relativePath} has an artifact format that the minimizer cannot inspect safely` });
    return findings;
  }
  const stat = fs.statSync(file);
  if (stat.size > MAX_INSPECTABLE_BYTES) {
    findings.push({ code: 'evidence-artifact-too-large', message: `${relativePath} exceeds the inspectable evidence size limit` });
    return findings;
  }
  if (!TEXT_EXTENSIONS.has(extension)) return findings;
  const text = fs.readFileSync(file, 'utf8');
  for (const [code, pattern] of TEXT_PATTERNS) {
    if (pattern.test(text)) findings.push({ code, message: `${relativePath} contains material that must be removed or pseudonymized` });
  }
  return findings;
}

export function redactRuntimeValue(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (/token|secret|password|cookie|credential/i.test(text)) return '<redacted>';
  return text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<redacted-email>');
}

export function redactRuntimeText(value) {
  let text = String(value || '').replace(/\r\n?/g, '\n');
  for (const [, pattern] of TEXT_PATTERNS) text = text.replace(new RegExp(pattern.source, `${pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`}`), '<redacted>');
  return text;
}
