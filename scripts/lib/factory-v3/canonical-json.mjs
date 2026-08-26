import crypto from 'node:crypto';
import fs from 'node:fs';
import { fail } from './errors.mjs';

function canonicalValue(value, location) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('factory-non-json-number', `non-finite number at ${location}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalValue(item, `${location}[${index}]`));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail('factory-non-plain-object', `non-plain object at ${location}`);
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) fail('factory-undefined-json-value', `undefined value at ${location}.${key}`);
      out[key] = canonicalValue(value[key], `${location}.${key}`);
    }
    return out;
  }
  fail('factory-non-json-value', `unsupported JSON value at ${location}`);
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value, '$'));
}

export function canonicalJsonPretty(value) {
  return JSON.stringify(canonicalValue(value, '$'), null, 2) + '\n';
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function canonicalHash(value) {
  return sha256(canonicalJson(value));
}

export function normalizeText(input) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
}

export function normalizedFileHash(file) {
  return sha256(normalizeText(fs.readFileSync(file)));
}

export function fileHash(file) {
  return sha256(fs.readFileSync(file));
}

export function deepCopy(value) {
  return JSON.parse(canonicalJson(value));
}
