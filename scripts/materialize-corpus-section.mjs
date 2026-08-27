#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CORPUS_SECTIONS, SECTION_REGISTRY_PATH, orderedSections } from './lib/corpus-sections.mjs';

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] || null;
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : null;
}

function normalizeRelative(candidate, label) {
  if (typeof candidate !== 'string' || candidate.length === 0 || path.isAbsolute(candidate)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const normalized = path.posix.normalize(candidate.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} escapes the repository: ${candidate}`);
  }
  return normalized;
}

function inside(root, relative, label) {
  const safe = normalizeRelative(relative, label);
  const absolute = path.resolve(root, ...safe.split('/'));
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes the repository: ${relative}`);
  }
  return { safe, absolute };
}

function assertNoSymlink(root, absolute, includeLeaf) {
  const relative = path.relative(root, absolute);
  let current = root;
  const parts = relative ? relative.split(path.sep) : [];
  const checked = includeLeaf ? parts : parts.slice(0, -1);
  for (const part of checked) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing symbolic-link path: ${path.relative(root, current)}`);
    }
  }
}

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readRegistry(root) {
  const { absolute } = inside(root, SECTION_REGISTRY_PATH, 'registry path');
  if (!fs.existsSync(absolute)) return { schema_version: 1, sections: {} };
  assertNoSymlink(root, absolute, true);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (parsed.schema_version !== 1 || !parsed.sections || Array.isArray(parsed.sections) || typeof parsed.sections !== 'object') {
    throw new Error(`${SECTION_REGISTRY_PATH} has an unsupported shape`);
  }
  return parsed;
}

function writeRegistry(root, registry) {
  const { absolute } = inside(root, SECTION_REGISTRY_PATH, 'registry path');
  assertNoSymlink(root, absolute, false);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
  fs.renameSync(temporary, absolute);
}

function usage() {
  console.error('Usage: node scripts/materialize-corpus-section.mjs <section> [--root <repo>] [--dry-run] [--json]');
  console.error('       node scripts/materialize-corpus-section.mjs --list [--json]');
}

const json = process.argv.includes('--json');
const list = process.argv.includes('--list');
const dryRun = process.argv.includes('--dry-run');
const positional = process.argv.slice(2).filter((arg, index, args) => {
  if (arg === '--root') return false;
  if (index > 0 && args[index - 1] === '--root') return false;
  return !arg.startsWith('--');
});

if (list) {
  const sections = Object.entries(CORPUS_SECTIONS).map(([name, value]) => ({
    name,
    description: value.description,
    dependencies: value.dependencies,
    files: value.files.map(([, target]) => target),
  }));
  if (json) console.log(JSON.stringify({ sections }, null, 2));
  else for (const section of sections) console.log(`${section.name}\t${section.description}`);
  process.exit(0);
}

const requestedSection = positional[0];
if (!requestedSection) {
  usage();
  process.exit(2);
}

try {
  const requestedRoot = path.resolve(valueAfter('--root') || process.cwd());
  const root = fs.realpathSync(requestedRoot);
  if (root !== requestedRoot || !fs.statSync(root).isDirectory()) {
    throw new Error('--root must be a real directory without symbolic-link indirection');
  }

  const registry = readRegistry(root);
  const result = { requested: requestedSection, dry_run: dryRun, created: [], unchanged: [], sections: [] };
  const pendingRegistry = structuredClone(registry);

  for (const sectionName of orderedSections(requestedSection)) {
    const section = CORPUS_SECTIONS[sectionName];
    const recordedFiles = [];
    for (const [sourceRel, targetRel] of section.files) {
      const source = inside(root, sourceRel, 'template path');
      const target = inside(root, targetRel, 'target path');
      if (!fs.existsSync(source.absolute) || !fs.lstatSync(source.absolute).isFile()) {
        throw new Error(`Local template is missing: ${source.safe}`);
      }
      assertNoSymlink(root, source.absolute, true);
      assertNoSymlink(root, target.absolute, fs.existsSync(target.absolute));
      const content = fs.readFileSync(source.absolute);
      if (fs.existsSync(target.absolute)) {
        if (!fs.lstatSync(target.absolute).isFile()) throw new Error(`Target is not a regular file: ${target.safe}`);
        const existing = fs.readFileSync(target.absolute);
        if (!existing.equals(content)) throw new Error(`Refusing to overwrite existing project content: ${target.safe}`);
        result.unchanged.push(target.safe);
      } else {
        if (!dryRun) {
          fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
          assertNoSymlink(root, target.absolute, false);
          fs.writeFileSync(target.absolute, content, { flag: 'wx', mode: 0o644 });
        }
        result.created.push(target.safe);
      }
      recordedFiles.push({ path: target.safe, sha256: digest(content) });
    }
    pendingRegistry.sections[sectionName] = { files: recordedFiles };
    result.sections.push(sectionName);
  }

  if (!dryRun) writeRegistry(root, pendingRegistry);
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${dryRun ? 'Would materialize' : 'Materialized'}: ${result.sections.join(', ')}`);
    console.log(`Created: ${result.created.length}; unchanged: ${result.unchanged.length}`);
  }
} catch (error) {
  if (json) console.log(JSON.stringify({ error: error.message }, null, 2));
  else console.error(error.message);
  process.exitCode = 1;
}
