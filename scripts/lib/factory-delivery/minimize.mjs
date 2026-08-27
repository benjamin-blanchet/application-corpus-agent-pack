import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

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

const TEXT_MEDIA_TYPES = new Map([
  ['.txt', 'text/plain'],
  ['.log', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.yaml', 'application/yaml'],
  ['.yml', 'application/yaml'],
  ['.xml', 'application/xml'],
  ['.html', 'text/html'],
  ['.csv', 'text/csv'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.css', 'text/css'],
  ['.svg', 'image/svg+xml'],
]);
const BYTE_MEDIA_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.webm', 'video/webm'],
  ['.mp4', 'video/mp4'],
  ['.zip', 'application/zip'],
]);
const PIXEL_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'video/webm', 'video/mp4']);
const APPROVED_MEDIA_PII_POLICIES = new Set(['masked_or_synthetic']);
const MAX_INSPECTABLE_BYTES = 50 * 1024 * 1024;

function byteSignatureMatches(extension, buffer) {
  if (extension === '.png') return buffer.length >= 20
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && buffer.subarray(buffer.length - 8, buffer.length - 4).toString('ascii') === 'IEND';
  if (extension === '.jpg' || extension === '.jpeg') return buffer.length >= 5
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (extension === '.webp') return buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.readUInt32LE(4) === buffer.length - 8
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (extension === '.webm') return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (extension === '.mp4') return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if (extension === '.zip') return buffer.length >= 4 && ['504b0304', '504b0506', '504b0708'].includes(buffer.subarray(0, 4).toString('hex'));
  return false;
}

function decodeUtf8(buffer) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) throw new Error('control bytes are not accepted as evidence text');
  return text;
}

// The returned media type is derived from validated bytes within a finite
// allowlist. The caller-provided Content-Type is never authoritative.
export function inspectEvidenceMedia(file, relativePath = file) {
  const extension = path.extname(relativePath).toLowerCase();
  const stat = fs.statSync(file);
  if (stat.size > MAX_INSPECTABLE_BYTES) {
    return { mediaType: null, kind: 'blocked', error: `${relativePath} exceeds the inspectable evidence size limit` };
  }
  const buffer = fs.readFileSync(file);
  if (TEXT_MEDIA_TYPES.has(extension)) {
    let text;
    try {
      text = decodeUtf8(buffer);
    } catch {
      return { mediaType: null, kind: 'blocked', error: `${relativePath} is not valid UTF-8 text` };
    }
    if ((extension === '.json' || extension === '.map')) {
      try {
        JSON.parse(text);
      } catch {
        return { mediaType: null, kind: 'blocked', error: `${relativePath} is not valid JSON` };
      }
    }
    const trimmed = text.trimStart().toLowerCase();
    if ((extension === '.xml' && (!trimmed.startsWith('<') || !text.trimEnd().endsWith('>')))
      || (extension === '.html' && !/^<(?:!doctype\s+html|html)\b/.test(trimmed))
      || (extension === '.svg' && !/^<(?:\?xml[^>]*>\s*)?<svg\b/.test(trimmed))) {
      return { mediaType: null, kind: 'blocked', error: `${relativePath} content does not match its evidence extension` };
    }
    return {
      mediaType: TEXT_MEDIA_TYPES.get(extension),
      kind: PIXEL_MEDIA_TYPES.has(TEXT_MEDIA_TYPES.get(extension)) ? 'pixel_media' : 'text',
      text,
    };
  }
  if (BYTE_MEDIA_TYPES.has(extension)) {
    if (!byteSignatureMatches(extension, buffer)) {
      return { mediaType: null, kind: 'blocked', error: `${relativePath} content does not match its evidence extension` };
    }
    return {
      mediaType: BYTE_MEDIA_TYPES.get(extension),
      kind: extension === '.zip' ? 'archive' : 'pixel_media',
      metadataText: buffer.toString('latin1'),
    };
  }
  return { mediaType: null, kind: 'blocked', error: `${relativePath} has a format outside the fail-closed evidence allowlist` };
}

export function scanEvidenceFile(file, relativePath, { mediaPiiPolicy = null } = {}) {
  const findings = [];
  const basename = path.basename(relativePath);
  for (const pattern of FORBIDDEN_BASENAMES) {
    if (pattern.test(basename) || relativePath.split('/').some((part) => pattern.test(part))) {
      findings.push({ code: 'evidence-sensitive-artifact', message: `${relativePath} looks like authentication or secret state` });
      break;
    }
  }
  const inspection = inspectEvidenceMedia(file, relativePath);
  if (inspection.error) {
    const code = inspection.error.includes('size limit') ? 'evidence-artifact-too-large'
      : inspection.error.includes('does not match') || inspection.error.includes('valid JSON') || inspection.error.includes('valid UTF-8')
        ? 'evidence-artifact-format-mismatch'
        : 'evidence-uninspectable-artifact';
    findings.push({ code, message: inspection.error });
    return findings;
  }
  if (inspection.kind === 'archive') {
    findings.push({ code: 'evidence-uninspectable-archive', message: `${relativePath} is an archive; publish extracted, individually scanned evidence instead` });
    return findings;
  }
  if (inspection.kind === 'pixel_media' && !APPROVED_MEDIA_PII_POLICIES.has(mediaPiiPolicy)) {
    findings.push({ code: 'evidence-media-pii-policy-missing', message: `${relativePath} contains pixels and requires the approved masked_or_synthetic PII policy` });
  }
  const text = inspection.text || inspection.metadataText || '';
  for (const [code, pattern] of TEXT_PATTERNS) {
    if (pattern.test(text)) findings.push({ code, message: `${relativePath} contains material that must be removed, masked or pseudonymized` });
  }
  return findings;
}

export function scanEvidenceText(value, label = '<text>') {
  const findings = [];
  const text = String(value || '');
  for (const [code, pattern] of TEXT_PATTERNS) if (pattern.test(text)) findings.push({ code, message: `${label} contains material that must be removed or pseudonymized` });
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
