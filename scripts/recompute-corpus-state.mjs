#!/usr/bin/env node

// Deterministic recompute of derived fields in doc/_meta/corpus-state.yaml.
//
// The corpus-state.yaml file is the "direction-carrying" state read by every
// agent at session start. When it drifts behind on-disk reality, the agent
// locks onto a stale direction. This script reads on-disk truth and patches
// the file in place, preserving comments, ordering, quoting style and every
// field NOT in the OWNED allowlist (operator-set fields, pack config,
// adoption judgement, etc.).
//
// Run with --dry-run (default) to print the diff without writing.
// Run with --apply to patch the file in place.
// Run with --json for machine-readable output.
//
// Mirror inverse of scripts/validate-corpus.mjs § checkCorpusStateBackwardDrift:
// the validator detects drift, this script corrects it.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const apply = process.argv.includes('--apply');
const jsonMode = process.argv.includes('--json');
const stateRel = 'doc/_meta/corpus-state.yaml';
const stateAbs = path.join(root, stateRel);

if (!fs.existsSync(stateAbs)) {
  console.error(`recompute-corpus-state: ${stateRel} not found`);
  process.exit(1);
}

// ============================================================================
// Helpers (mirrored from validate-corpus.mjs for behavioural consistency)
// ============================================================================

function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

function walk(dirAbs) {
  if (!fs.existsSync(dirAbs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function countMarkdownTableRows(text) {
  return text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return false;
    if (/^\|\s*-+/.test(trimmed)) return false;
    return true;
  }).length;
}

function parseSimpleYamlMap(text) {
  const result = {};
  const stack = [{ indent: -1, value: result }];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    let value;
    if (rawValue === '') {
      value = {};
      parent[key] = value;
      stack.push({ indent, value });
    } else if (rawValue === 'true') parent[key] = true;
    else if (rawValue === 'false') parent[key] = false;
    else if (rawValue === 'null') parent[key] = null;
    else if (/^-?\d+$/.test(rawValue)) parent[key] = Number(rawValue);
    else parent[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function yamlTopLevelListCount(relPath, key) {
  if (!exists(relPath)) return 0;
  const lines = read(relPath).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return 0;
  const keyIndent = lines[start].match(/^\s*/)[0].length;
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= keyIndent) break;
    if (indent === keyIndent + 2 && line.trim().startsWith('- ')) count += 1;
  }
  return count;
}

// ============================================================================
// Allowlist: only these fields are owned by the recompute. Everything else in
// corpus-state.yaml is preserved verbatim, including operator-set fields like
// kickstart_operator, ai_champion, pack_version, custom config, etc.
// ============================================================================

const OWNED_CORPUS_FIELDS = new Set([
  'indexes_initialized',
  'first_code_pass_done',
  'first_prod_pass_done',
  'code_analysis_status',
  'code_analysis_completed_at',
  'brick_inventory_status',
  'roadmap_status',
  'graph_status',
  'run_ledger_status',
  'last_continuous_run',
  'last_prod_discovery',
  'prod_discovery_status',
  // Per-pass code-pipeline mirroring
  'p1_tree_inventory_status',
  'p2_logical_boundaries_status',
  'p3_feature_candidates_status',
  'p4_feature_silo_deep_dive_status',
  'p5_cross_cutting_extraction_status',
  'p6_code_style_naming_status',
  'p7_structural_issues_status',
  'p8_code_maturity_status',
  'p9_code_reconciliation_gate_status',
]);

const OWNED_INVENTORY_KEYS = new Set([
  'bugs',
  'risks',
  'features',
  'apis',
  'batches',
  'screens',
]);

// Per-field vocabulary the recompute is allowed to write. When the EXISTING
// value in corpus-state.yaml is outside this set (and not null/empty), the
// recompute preserves it verbatim — operators sometimes carry their own
// vocabulary ("active", "started", "in-progress") and the script must not
// override those silently. The script only corrects values it understands.
const KNOWN_STATE_VOCABULARIES = {
  roadmap_status: new Set(['skeleton', 'in_progress', 'covered']),
  graph_status: new Set(['skeleton', 'in_progress', 'covered']),
  run_ledger_status: new Set(['initialized', 'in_use']),
  prod_discovery_status: new Set(['not_started', 'partial', 'covered']),
  brick_inventory_status: new Set(['not_started', 'covered']),
};

// last_* timestamp fields: only ever advance forward, never regress.
const TIMESTAMP_FIELDS = new Set([
  'last_continuous_run',
  'last_prod_discovery',
  'code_analysis_completed_at',
]);

// ============================================================================
// Compute derived values from on-disk reality
// ============================================================================

function firstExisting(candidates) {
  return candidates.find((rel) => fs.existsSync(path.join(root, rel))) || candidates[0];
}

function computeDerived() {
  const derived = { corpus: {}, corpus_inventory: {} };

  // indexes_initialized — populated index file (excluding by-source.md template seed)
  const idxDir = path.join(root, 'doc/_indexes');
  if (fs.existsSync(idxDir)) {
    const populated = walk(idxDir)
      .filter((f) => f.endsWith('.md') && path.basename(f) !== 'by-source.md')
      .filter((f) => countMarkdownTableRows(fs.readFileSync(f, 'utf8')) > 1);
    derived.corpus.indexes_initialized = populated.length >= 1;
  }

  // first_code_pass_done — repository-map.yaml populated beyond template, OR source-inventory exists
  if (exists('doc/_meta/repository-map.yaml')) {
    const txt = read('doc/_meta/repository-map.yaml');
    derived.corpus.first_code_pass_done =
      !/name:\s*['"]?unknown['"]?/i.test(txt) && /name:\s*['"]?[^'"\s]+['"]?/i.test(txt);
  } else if (exists('doc/_meta/source-inventory.md')) {
    derived.corpus.first_code_pass_done = true;
  }

  // code_analysis_status — mirror code-pipeline-state.yaml pipeline.overall_status
  // + per-pass status mirroring
  if (exists('doc/_meta/code-pipeline-state.yaml')) {
    const pipe = parseSimpleYamlMap(read('doc/_meta/code-pipeline-state.yaml')).pipeline || {};
    if (pipe.overall_status) derived.corpus.code_analysis_status = pipe.overall_status;
    const passMap = {
      p1_tree_inventory: 'p1_tree_inventory_status',
      p2_logical_boundaries: 'p2_logical_boundaries_status',
      p3_feature_candidates: 'p3_feature_candidates_status',
      p4_feature_silo_deep_dive: 'p4_feature_silo_deep_dive_status',
      p5_cross_cutting_extraction: 'p5_cross_cutting_extraction_status',
      p6_code_style_naming: 'p6_code_style_naming_status',
      p7_structural_issues: 'p7_structural_issues_status',
      p8_code_maturity: 'p8_code_maturity_status',
      p9_code_reconciliation_gate: 'p9_code_reconciliation_gate_status',
    };
    for (const [pipeKey, stateField] of Object.entries(passMap)) {
      const status = pipe[pipeKey]?.status;
      if (status) derived.corpus[stateField] = status;
    }
    // If all 9 passes covered, also stamp completed_at from pipeline.last_run
    const allCovered = Object.keys(passMap).every((k) => pipe[k]?.status === 'covered');
    if (allCovered && pipe.last_run) derived.corpus.code_analysis_completed_at = pipe.last_run;
  }

  // brick_inventory_status — covered if brick-inventory.yaml has entries
  if (exists('doc/_meta/brick-inventory.yaml')) {
    const txt = read('doc/_meta/brick-inventory.yaml');
    const hasBricks = /^\s*-\s+/m.test(txt) || /bricks:\s*\n\s+-/.test(txt);
    derived.corpus.brick_inventory_status = hasBricks ? 'covered' : 'not_started';
  }

  // roadmap_status — derived from CORPUS_ROADMAP.yaml node count.
  // The pack template ships a single `root` seed node; treat it as `skeleton`
  // (matches validator threshold). `in_progress` requires real expansion.
  if (exists('doc/_roadmap/CORPUS_ROADMAP.yaml')) {
    const nodeCount = yamlTopLevelListCount('doc/_roadmap/CORPUS_ROADMAP.yaml', 'nodes');
    derived.corpus.roadmap_status =
      nodeCount >= 5 ? 'covered' : nodeCount >= 2 ? 'in_progress' : 'skeleton';
  }

  // graph_status — same convention as roadmap_status.
  if (exists('doc/_graph/nodes.yaml')) {
    const nodes = (read('doc/_graph/nodes.yaml').match(/^\s+-\s+(id|name):/gm) || []).length;
    derived.corpus.graph_status = nodes >= 5 ? 'covered' : nodes >= 2 ? 'in_progress' : 'skeleton';
  }

  // run_ledger_status + last_continuous_run — from RUN_LEDGER.md
  if (exists('doc/_runs/RUN_LEDGER.md')) {
    const ledgerLines = read('doc/_runs/RUN_LEDGER.md').split(/\r?\n/);
    const realRows = ledgerLines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) return false;
      if (/^\|\s*-+/.test(trimmed)) return false;
      const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => c === '')) return false;
      if (cells.length >= 4 && cells.every((c) => /^[A-Za-z][A-Za-z _-]*$/.test(c))) return false;
      return true;
    });
    derived.corpus.run_ledger_status = realRows.length >= 1 ? 'in_use' : 'initialized';
    // Extract newest YYYY-MM-DD from first cell of real rows
    const dates = realRows
      .map((line) => line.trim().replace(/^\||\|$/g, '').split('|')[0]?.trim())
      .filter((d) => d && /^\d{4}-\d{2}-\d{2}/.test(d))
      .map((d) => d.match(/^\d{4}-\d{2}-\d{2}/)[0])
      .sort();
    if (dates.length) derived.corpus.last_continuous_run = dates[dates.length - 1];
  }

  // prod_discovery_status + first_prod_pass_done + last_prod_discovery
  const snapDir = path.join(root, 'doc/prod/snapshots');
  if (fs.existsSync(snapDir)) {
    const snaps = fs.readdirSync(snapDir).filter((n) => /production-discovery\.md$/.test(n));
    derived.corpus.first_prod_pass_done = snaps.length >= 1;
    derived.corpus.prod_discovery_status =
      snaps.length >= 3 ? 'covered' : snaps.length >= 1 ? 'partial' : 'not_started';
    if (snaps.length) {
      const dates = snaps
        .map((n) => n.match(/^(\d{4}-\d{2}-\d{2})/)?.[1])
        .filter(Boolean)
        .sort();
      if (dates.length) derived.corpus.last_prod_discovery = dates[dates.length - 1];
    }
  }

  // corpus_inventory.bugs and .risks — enumerate from disk
  const inventoryDirs = [
    { key: 'bugs', dir: 'doc/prod/known-bugs', prefix: 'BUG-' },
    { key: 'risks', dir: 'doc/prod/structural-risks', prefix: 'RISK-' },
  ];
  for (const { key, dir, prefix } of inventoryDirs) {
    const dirAbs = path.join(root, dir);
    const map = {};
    if (fs.existsSync(dirAbs)) {
      const files = fs
        .readdirSync(dirAbs)
        .filter(
          (n) =>
            n.startsWith(prefix) &&
            n.endsWith('.md') &&
            !n.toLowerCase().includes('template') &&
            n !== 'CATALOG.md' &&
            n !== 'INDEX.md',
        )
        .sort();
      for (const f of files) {
        const id = f.match(/^([A-Z]+-\d+)/)?.[1] || f.replace(/\.md$/, '');
        map[id] = `${dir}/${f}`;
      }
    }
    derived.corpus_inventory[key] = map;
  }

  // corpus_inventory.features/apis/batches/screens — enumerate folder-based
  // knowledge objects from disk. A knowledge object is a directory holding a
  // README.md, either directly under the zone (doc/project/features/<slug>/)
  // or one level down when the zone groups them (doc/project/apis/rest/<x>/).
  // `batchs` is the pack's historical spelling and `batches` the correct one;
  // corpora exist with each, so both resolve. Only zones that genuinely group
  // their objects (APIs under rest/, soap/) are allowed to nest — recursing
  // everywhere turns a feature that is merely missing its README into a set
  // of phantom features named after its subdirectories.
  const folderDirs = [
    { key: 'features', dir: 'doc/project/features', depth: 0 },
    { key: 'apis', dir: 'doc/project/apis', depth: 1 },
    { key: 'batches', dir: firstExisting(['doc/project/batches', 'doc/project/batchs']), depth: 0 },
    { key: 'screens', dir: 'doc/project/screens', depth: 0 },
  ];
  const RESERVED_ZONE_DOCS = new Set(['README.md', 'CATALOG.md', 'INDEX.md', 'index.md', 'log.md']);
  for (const { key, dir, depth } of folderDirs) {
    const dirAbs = path.join(root, dir);
    const map = {};
    if (fs.existsSync(dirAbs)) {
      // Corpora express a knowledge object either as a folder holding a
      // README.md, or as a single flat .md file. Both shapes occur in the
      // wild, sometimes for different zones of the same corpus — enumerate
      // both rather than assuming one.
      const collect = (relPrefix, absDir, depth) => {
        const entries = fs
          .readdirSync(absDir, { withFileTypes: true })
          .filter((e) => !e.name.startsWith('_') && !e.name.startsWith('.'))
          .sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          const childAbs = path.join(absDir, entry.name);
          const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          if (!entry.isDirectory()) continue;
          if (fs.existsSync(path.join(childAbs, 'README.md'))) {
            map[childRel] = `${dir}/${childRel}/README.md`;
          } else if (depth > 0) {
            collect(childRel, childAbs, depth - 1);
          }
        }
      };
      collect('', dirAbs, depth);
      // A zone is either folder-shaped or file-shaped, never both: once any
      // folder-shaped object is found, loose .md files in the zone are reports
      // or notes, not knowledge objects, and must not pollute the inventory.
      if (Object.keys(map).length === 0) {
        for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
          if (entry.name.startsWith('_') || RESERVED_ZONE_DOCS.has(entry.name)) continue;
          if (entry.name.toLowerCase().includes('template')) continue;
          map[entry.name.replace(/\.md$/, '')] = `${dir}/${entry.name}`;
        }
      }
    }
    derived.corpus_inventory[key] = map;
  }

  return derived;
}

// ============================================================================
// Patch corpus-state.yaml in place (preserve comments / ordering / quoting)
// ============================================================================

function formatScalar(v, preferredQuote = "'") {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (v === '') return `${preferredQuote}${preferredQuote}`;
    // dates and timestamps are quoted (YAML 1.1 would parse them as dates)
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/.test(v)) return `${preferredQuote}${v}${preferredQuote}`;
    if (/[:#&*!|>'"%@`,\[\]\{\}]/.test(v) || /^\s|\s$/.test(v)) {
      // Use the preferred style; escape inner quotes accordingly
      if (preferredQuote === '"') return `"${v.replace(/"/g, '\\"')}"`;
      return `'${v.replace(/'/g, "''")}'`;
    }
    return v;
  }
  return String(v);
}

// Strip outer quotes from a raw YAML scalar for semantic comparison.
function unquote(raw) {
  if (raw == null) return raw;
  const s = String(raw).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// Detect the quote style used in the original raw value, so a recomputed
// value reuses the same style (avoids cosmetic-only rewrites).
function detectQuoteStyle(raw) {
  if (raw == null) return "'";
  const s = String(raw).trim();
  if (s.startsWith('"')) return '"';
  if (s.startsWith("'")) return "'";
  return "'"; // default for new writes
}

// Convert a raw YAML scalar to the same JS type formatScalar would emit,
// so semantic comparison is fair.
function semanticRaw(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  return unquote(String(value));
}

// Compare an existing raw line value to a newly-computed value semantically.
function isSameValue(rawExisting, newValue) {
  const existingSem = semanticRaw(rawExisting);
  const newSem = newValue === null ? 'null' : typeof newValue === 'string' ? newValue : String(newValue);
  return existingSem === newSem;
}

// For a *_status field: decide whether the recompute is allowed to override.
// Returns true only if the existing value is null/empty or in the known set.
function isOverridable(field, existingRaw) {
  const known = KNOWN_STATE_VOCABULARIES[field];
  if (!known) return true; // no vocabulary restriction
  const existing = unquote(existingRaw || '');
  if (existing === '' || existing === 'null') return true;
  return known.has(existing);
}

// For a last_* timestamp field: decide whether the new value is an advance
// (later) compared to the existing value. Returns true if no existing value,
// or if newValue >= existing.
function isAdvance(field, existingRaw, newValue) {
  if (!TIMESTAMP_FIELDS.has(field)) return true;
  const existing = unquote(existingRaw || '');
  if (!existing || existing === 'null') return true;
  // Compare as ISO dates (YYYY-MM-DD or full timestamp). Lexicographic ordering works.
  return String(newValue) >= existing;
}

function patchYamlInPlace(text, derived) {
  const lines = text.split(/\r?\n/);
  const changes = [];

  // -- 1. Locate section ranges (top-level keys) --
  const sectionRanges = {};
  let currentSection = null;
  let currentStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Top-level key: no leading whitespace + ends with colon
    if (/^[A-Za-z0-9_-]+:\s*$/.test(line)) {
      if (currentSection) {
        sectionRanges[currentSection] = { start: currentStart, end: i };
      }
      currentSection = line.match(/^([A-Za-z0-9_-]+):/)[1];
      currentStart = i;
    }
  }
  if (currentSection) sectionRanges[currentSection] = { start: currentStart, end: lines.length };

  // -- 2. Patch leaf fields under `corpus:` --
  const corpusRange = sectionRanges['corpus'];
  if (corpusRange && derived.corpus) {
    for (const [field, newValue] of Object.entries(derived.corpus)) {
      if (!OWNED_CORPUS_FIELDS.has(field)) continue;
      const fieldRegex = new RegExp(`^(\\s+)${field}:\\s*(.*)$`);
      let found = false;
      for (let i = corpusRange.start + 1; i < corpusRange.end; i++) {
        const m = lines[i].match(fieldRegex);
        if (m) {
          const indent = m[1];
          const oldRaw = m[2].trim();

          // Skip cosmetic-only changes (same value, different quote style)
          if (isSameValue(oldRaw, newValue)) {
            found = true;
            break;
          }
          // Preserve operator vocabulary on status fields (don't override values we don't recognize)
          if (!isOverridable(field, oldRaw)) {
            found = true;
            break;
          }
          // Never regress last_* timestamps
          if (!isAdvance(field, oldRaw, newValue)) {
            found = true;
            break;
          }
          // Preserve original quote style when writing
          const quote = detectQuoteStyle(oldRaw);
          const newRaw = formatScalar(newValue, quote);
          changes.push({ field: `corpus.${field}`, before: oldRaw, after: newRaw });
          lines[i] = `${indent}${field}: ${newRaw}`;
          found = true;
          break;
        }
      }
      if (!found) {
        // Append at end of corpus: section
        const indent = '  ';
        const insertAt = corpusRange.end;
        const newRaw = formatScalar(newValue);
        lines.splice(insertAt, 0, `${indent}${field}: ${newRaw}`);
        changes.push({ field: `corpus.${field}`, before: '(absent)', after: newRaw });
        // Section ranges below shift by 1
        for (const k of Object.keys(sectionRanges)) {
          if (sectionRanges[k].start >= insertAt) {
            sectionRanges[k].start += 1;
            sectionRanges[k].end += 1;
          } else if (sectionRanges[k].end >= insertAt) {
            sectionRanges[k].end += 1;
          }
        }
      }
    }
  }

  // -- 3. Patch each owned key under `corpus_inventory:` --
  // Strategy: find the `<key>:` line under corpus_inventory, replace its value
  // block (either inline `{}` or multi-line nested map) with the recomputed
  // mapping.
  const invRange = sectionRanges['corpus_inventory'];
  if (invRange && derived.corpus_inventory) {
    for (const [key, map] of Object.entries(derived.corpus_inventory)) {
      if (!OWNED_INVENTORY_KEYS.has(key)) continue;
      const keyRegex = new RegExp(`^(\\s+)${key}:\\s*(.*)$`);
      let keyLineIdx = -1;
      let keyIndent = '  ';
      for (let i = invRange.start + 1; i < invRange.end; i++) {
        const m = lines[i].match(keyRegex);
        if (m) {
          keyLineIdx = i;
          keyIndent = m[1];
          break;
        }
      }
      if (keyLineIdx === -1) {
        // Append a new key block at end of corpus_inventory:
        const block = serializeInventoryBlock(key, map, '  ');
        const insertAt = invRange.end;
        lines.splice(insertAt, 0, ...block);
        changes.push({ field: `corpus_inventory.${key}`, before: '(absent)', after: summarizeMap(map) });
        for (const k of Object.keys(sectionRanges)) {
          if (sectionRanges[k].start >= insertAt) {
            sectionRanges[k].start += block.length;
            sectionRanges[k].end += block.length;
          } else if (sectionRanges[k].end >= insertAt) {
            sectionRanges[k].end += block.length;
          }
        }
        continue;
      }
      // Determine the existing block extent (the key line + any deeper-indented children)
      const keyIndentLen = keyIndent.length;
      let blockEnd = keyLineIdx + 1;
      while (blockEnd < invRange.end) {
        const l = lines[blockEnd];
        if (!l.trim()) { blockEnd++; continue; }
        const ind = l.match(/^\s*/)[0].length;
        if (ind <= keyIndentLen) break;
        blockEnd++;
      }
      // Serialize the new block
      const before = lines.slice(keyLineIdx, blockEnd).join('\n');
      const newBlock = serializeInventoryBlock(key, map, keyIndent);
      const after = newBlock.join('\n');
      if (before !== after) {
        changes.push({
          field: `corpus_inventory.${key}`,
          before: summarizeRawBlock(before),
          after: summarizeMap(map),
        });
        const delta = newBlock.length - (blockEnd - keyLineIdx);
        lines.splice(keyLineIdx, blockEnd - keyLineIdx, ...newBlock);
        for (const k of Object.keys(sectionRanges)) {
          if (sectionRanges[k].start > keyLineIdx) sectionRanges[k].start += delta;
          if (sectionRanges[k].end > keyLineIdx) sectionRanges[k].end += delta;
        }
      }
    }
  }

  return { text: lines.join('\n'), changes };
}

function serializeInventoryBlock(key, map, keyIndent) {
  const entries = Object.entries(map);
  if (entries.length === 0) return [`${keyIndent}${key}: {}`];
  const childIndent = keyIndent + '  ';
  const out = [`${keyIndent}${key}:`];
  for (const [id, value] of entries) {
    const fmt = formatScalar(value);
    out.push(`${childIndent}${id}: ${fmt}`);
  }
  return out;
}

function summarizeMap(map) {
  const n = Object.keys(map).length;
  if (n === 0) return '{} (empty)';
  if (n <= 3) return `{${Object.keys(map).join(', ')}}`;
  return `{${n} entries: ${Object.keys(map).slice(0, 3).join(', ')}, ...}`;
}

function summarizeRawBlock(text) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= 60) return compact;
  return compact.slice(0, 57) + '...';
}

// ============================================================================
// Main
// ============================================================================

const originalText = read(stateRel);
const derived = computeDerived();
const { text: patchedText, changes } = patchYamlInPlace(originalText, derived);

const result = {
  file: stateRel,
  mode: apply ? 'apply' : 'dry-run',
  changes,
  changed: changes.length > 0,
};

if (apply && changes.length > 0) {
  fs.writeFileSync(stateAbs, patchedText);
  result.written = true;
}

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`recompute-corpus-state (${result.mode})`);
  if (changes.length === 0) {
    console.log('No drift detected — corpus-state.yaml matches on-disk reality.');
  } else {
    console.log(`${changes.length} field(s) drifted:`);
    for (const c of changes) {
      console.log(`  ${c.field}: ${c.before} -> ${c.after}`);
    }
    if (apply) console.log(`\nApplied to ${stateRel}.`);
    else console.log(`\n(dry-run — re-run with --apply to write)`);
  }
}

process.exit(0);
