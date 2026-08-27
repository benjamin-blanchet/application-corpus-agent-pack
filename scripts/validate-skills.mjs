#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_ROOT, '..');
const DEFAULT_MAX_LINES = 300;

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, json: false, maxLines: DEFAULT_MAX_LINES };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--root') options.root = path.resolve(argv[++index] || '');
    else if (arg.startsWith('--root=')) options.root = path.resolve(arg.slice(7));
    else if (arg === '--max-lines') options.maxLines = Number(argv[++index]);
    else if (arg.startsWith('--max-lines=')) options.maxLines = Number(arg.slice(12));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.maxLines) || options.maxLines < 1) {
    throw new Error('--max-lines must be a positive integer');
  }
  return options;
}

function walkSkillFiles(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) return [];
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name === 'SKILL.md') found.push(target);
    }
  };
  visit(skillsRoot);
  return found.sort();
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---\n')) return { error: 'missing opening frontmatter fence' };
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing === -1) return { error: 'missing closing frontmatter fence' };
  const raw = normalized.slice(4, closing);
  const values = {};
  const references = [];
  let listKey = null;

  for (const [offset, line] of raw.split('\n').entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const item = line.match(/^\s+-\s+(.+?)\s*$/);
    if (item) {
      if (!listKey) return { error: `orphan list item at frontmatter line ${offset + 1}` };
      if (listKey === 'references') references.push(unquote(item[1]));
      continue;
    }
    if (/^\s/.test(line)) continue;
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) return { error: `invalid top-level YAML at frontmatter line ${offset + 1}` };
    const [, key, rawValue] = pair;
    if (Object.hasOwn(values, key)) return { error: `duplicate frontmatter key: ${key}` };
    values[key] = unquote(rawValue);
    listKey = rawValue.trim() === '' ? key : null;
  }
  return { values, references };
}

function validate(root, maxLines) {
  const skillsRoot = path.join(root, '.github', 'skills');
  const files = walkSkillFiles(skillsRoot);
  const errors = [];
  const warnings = [];
  const names = new Map();

  const add = (collection, code, file, message) => collection.push({
    code,
    file: path.relative(root, file).split(path.sep).join('/'),
    message,
  });

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const parsed = parseFrontmatter(text);
    if (parsed.error) {
      add(errors, 'invalid-frontmatter', file, parsed.error);
      continue;
    }

    const { name, description } = parsed.values;
    if (!name) add(errors, 'missing-name', file, 'frontmatter name is required');
    if (!description) add(errors, 'missing-description', file, 'frontmatter description is required');
    if (name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      add(errors, 'invalid-name', file, `name must be lowercase kebab-case: ${name}`);
    }

    const parent = path.basename(path.dirname(file));
    if (name && name !== parent) {
      add(errors, 'name-parent-mismatch', file, `name "${name}" must match parent directory "${parent}"`);
    }
    if (name) {
      const previous = names.get(name);
      if (previous) {
        add(errors, 'duplicate-name', file, `name "${name}" is already declared by ${path.relative(root, previous)}`);
      } else {
        names.set(name, file);
      }
    }

    for (const reference of parsed.references) {
      if (!reference || path.isAbsolute(reference) || reference.split(/[\\/]/).includes('..')) {
        add(errors, 'unsafe-reference', file, `reference must stay inside the skill directory: ${reference}`);
        continue;
      }
      const target = path.resolve(path.dirname(file), reference);
      const base = `${path.resolve(path.dirname(file))}${path.sep}`;
      if (!target.startsWith(base) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        add(errors, 'missing-reference', file, `referenced file does not exist: ${reference}`);
      }
    }

    const lineCount = text.replace(/\n$/, '').split('\n').length;
    if (lineCount > maxLines) {
      add(warnings, 'large-skill', file, `${lineCount} lines exceeds the ${maxLines}-line progressive-disclosure guideline`);
    }
  }

  return { skillCount: files.length, errorCount: errors.length, warningCount: warnings.length, errors, warnings };
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const report = validate(options.root, options.maxLines);
if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Skills validation: ${report.skillCount} skills, ${report.errorCount} errors, ${report.warningCount} warnings`);
  for (const finding of report.errors) console.error(`ERROR [${finding.code}] ${finding.file}: ${finding.message}`);
  for (const finding of report.warnings) console.warn(`WARN  [${finding.code}] ${finding.file}: ${finding.message}`);
}
process.exitCode = report.errorCount ? 1 : 0;

