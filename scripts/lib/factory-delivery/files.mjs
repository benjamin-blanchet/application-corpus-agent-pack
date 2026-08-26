import fs from 'node:fs';
import path from 'node:path';

import { readYaml, writeYaml } from './yaml.mjs';

export function readData(file) {
  if (path.extname(file).toLowerCase() === '.json') return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  return readYaml(file);
}

export function writeData(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (path.extname(file).toLowerCase() === '.json') fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  else writeYaml(file, value);
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

export function extractSpecificationCriteria(file) {
  if (!file || !fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const found = new Set();
  for (const match of text.matchAll(/(?:^|\s)(AC-?\d+)(?=\s*[:—-])/gim)) found.add(match[1].toUpperCase());
  return [...found];
}

export function existingOr(defaultFile, candidates) {
  return candidates.find((file) => fs.existsSync(file)) || defaultFile;
}
