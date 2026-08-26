#!/usr/bin/env node
/**
 * add-skill-frontmatter.mjs
 *
 * Bulk-add a minimal YAML frontmatter (`name`, `description`) to every
 * SKILL.md that lacks one. Skills without a frontmatter cannot be
 * progressively disclosed by the Skills 2.1 runtime — the body gets loaded
 * unconditionally instead of just the metadata.
 *
 * The script generates a *draft* description from the file's first
 * non-empty paragraph. Hand-tune these descriptions to include operator
 * intent triggers (FR + EN verbs the operator might use) for best matching.
 *
 * Usage:
 *   node scripts/add-skill-frontmatter.mjs           # dry-run, prints diff
 *   node scripts/add-skill-frontmatter.mjs --write   # apply changes
 *
 * Idempotent: skips any SKILL.md that already has a frontmatter.
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './lib/text.mjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKILLS_ROOT = path.join(REPO_ROOT, '.github/skills');
const WRITE = process.argv.includes('--write');

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name === 'SKILL.md') yield full;
  }
}

function deriveName(filePath) {
  // .github/skills/<category>/<slug>/SKILL.md → "<slug>"
  // .github/skills/<category>/<sub>/<slug>/SKILL.md → "<slug>"
  const dir = path.dirname(filePath);
  return path.basename(dir);
}

function deriveCategory(filePath) {
  const rel = path.relative(SKILLS_ROOT, path.dirname(filePath));
  return rel.split(path.sep)[0] ?? 'misc';
}

function extractDraftDescription(body) {
  const lines = body.split('\n');

  // Try "## Purpose" section first
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Purpose\b/i.test(lines[i])) {
      const para = [];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j].trim();
        if (line.startsWith('#')) break;
        if (!line && para.length) break;
        if (line) para.push(line);
      }
      if (para.length) return para.join(' ');
    }
  }

  // Else, first paragraph after the H1
  let pastH1 = false;
  const para = [];
  for (const line of lines) {
    if (/^#\s/.test(line)) {
      pastH1 = true;
      continue;
    }
    if (!pastH1) continue;
    const t = line.trim();
    if (t.startsWith('#')) break;
    if (!t && para.length) break;
    if (t) para.push(t);
  }
  return para.join(' ');
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function yamlEscape(s) {
  // Conservative: wrap in double quotes, escape backslash + doublequote.
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function buildFrontmatter({ name, category, description }) {
  const lines = [
    '---',
    `name: ${name}`,
    `category: ${category}`,
    `description: ${yamlEscape(truncate(description, 280))}`,
    '---',
    '',
  ];
  return lines.join('\n');
}

function processFile(filePath) {
  const raw = normalizeText(fs.readFileSync(filePath, 'utf8'));
  if (raw.startsWith('---\n')) {
    return { skipped: true };
  }
  const name = deriveName(filePath);
  const category = deriveCategory(filePath);
  const description = extractDraftDescription(raw) || `Skill in category ${category}.`;
  const front = buildFrontmatter({ name, category, description });
  return { skipped: false, name, category, description, newContent: front + raw };
}

function main() {
  const files = [...walk(SKILLS_ROOT)];
  let added = 0;
  let skipped = 0;
  const samples = [];

  for (const f of files) {
    const result = processFile(f);
    if (result.skipped) {
      skipped += 1;
      continue;
    }
    added += 1;
    samples.push({ file: path.relative(REPO_ROOT, f), name: result.name, description: result.description });
    if (WRITE) {
      fs.writeFileSync(f, result.newContent);
    }
  }

  console.log(`Skills scanned: ${files.length}`);
  console.log(`  with existing frontmatter (skipped): ${skipped}`);
  console.log(`  ${WRITE ? 'updated' : 'would update'}: ${added}`);
  console.log('');

  const sampleN = Math.min(5, samples.length);
  if (sampleN) {
    console.log(`Sample of generated frontmatter (first ${sampleN}):`);
    for (const s of samples.slice(0, sampleN)) {
      console.log(`  • ${s.file}`);
      console.log(`      name: ${s.name}`);
      console.log(`      description: ${truncate(s.description, 200)}`);
    }
    console.log('');
  }

  if (!WRITE && added > 0) {
    console.log('Re-run with --write to apply.');
  }
  if (WRITE && added > 0) {
    console.log('Done. Hand-tune descriptions to include operator intent triggers');
    console.log('(FR + EN verbs) for best runtime matching. See doc/_meta/agent-cache-discipline.md.');
  }
}

main();
