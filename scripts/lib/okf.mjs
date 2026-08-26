// Open Knowledge Format (OKF) v0.1 conformance engine.
//
// Single deterministic, additive engine shared by both entrypoints:
//   - scripts/build-okf-indexes.mjs   (run at corpus generation / bootstrap close)
//   - governance/pack-upgrade          (run during an existing-corpus upgrade)
//
// It makes a corpus conformant with the OKF v0.1 spec
// (https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
// WITHOUT ever rewriting corpus prose. Two additive operations only:
//
//   1. Emit a reserved `index.md` listing where it is SAFE to do so. OKF index
//      files are OPTIONAL (§6 — consumers may synthesize one and must not
//      reject a bundle for a missing index), so the engine generates one only
//      in directories that do NOT already carry a listing whose name collides
//      case-insensitively with `index.md` (e.g. the corpus' own uppercase
//      `INDEX.md`). On case-insensitive filesystems (macOS/Windows) `index.md`
//      and `INDEX.md` are the SAME inode; writing one would clobber the other,
//      so such directories are left to the consumer's on-the-fly synthesis.
//      Non-root index files carry no frontmatter; the bundle-root index
//      (doc/index.md) carries the single permitted key `okf_version`.
//   2. Backfill the standardized OPTIONAL frontmatter fields OKF recognizes
//      (title / description / timestamp) onto concept docs that already have a
//      frontmatter block — DERIVED deterministically, never invented. A doc
//      with no frontmatter at all is left untouched (the validator flags it as
//      a P0 for a human/agent to type; the engine never guesses a `type`).
//
// The boundary surface is already shipped as a human/agent-readable concept
// doc (architecture/BOUNDARY.md, produced by governance/boundary-contract and
// carrying a `type`), so it is already OKF-conformant and the engine leaves it
// alone — no projection needed.
//
// Idempotent: every generated file carries a marker; regeneration overwrites
// only marked files and never clobbers a hand-authored index.md.

import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './text.mjs';

export const OKF_VERSION = '0.1';

// Reserved OKF filenames (§3.1). Every OTHER .md is a "concept document".
export const RESERVED_FILES = new Set(['index.md', 'log.md']);

// The standardized optional frontmatter keys OKF recognizes (§2). `resource`
// and `tags` are intentionally NOT auto-derived (cannot be inferred without
// inventing); producers/skills set them. We backfill only what is derivable.
export const OKF_DERIVABLE_FIELDS = ['title', 'description', 'timestamp'];

const GEN_MARKER = '<!-- OKF-GENERATED: regenerate via scripts/build-okf-indexes.mjs — do not edit by hand -->';

// Directories never indexed (build output, raw templates).
const SKIP_DIR_SEGMENTS = new Set(['_site']);
const SKIP_PATH_FRAGMENTS = ['/spec/template'];

// ----------------------------------------------------------------------------
// Pure helpers (no fs).

const toPosix = (p) => p.split(path.sep).join('/');

export function splitFrontmatter(content) {
  const text = normalizeText(content);
  if (!text.startsWith('---\n')) return { fm: null, fmRaw: null, body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { fm: null, fmRaw: null, body: text };
  const fmRaw = text.slice(4, end);
  // body starts after the closing fence line
  const afterFence = text.indexOf('\n', end + 1);
  const body = afterFence === -1 ? '' : text.slice(afterFence + 1);
  return { fmRaw, body, fm: parseTopLevelKeys(fmRaw) };
}

// Top-level `key: value` extraction — tolerant, matches the validator's parser.
function parseTopLevelKeys(fmRaw) {
  const map = {};
  for (const raw of fmRaw.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\s/.test(raw)) continue; // nested — ignore for top-level presence checks
    const m = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) map[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return map;
}

function yamlQuote(value) {
  // Always emit a double-quoted scalar — safe for colons, #, leading symbols.
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function deriveTitle(body) {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

export function deriveDescription(body) {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence || !t) continue;
    if (/^[#>|]/.test(t) || /^[-*+]\s/.test(t) || /^\d+\.\s/.test(t) || t.startsWith('<!--')) continue;
    // First prose line — take up to the first sentence boundary, capped.
    const sentence = t.split(/(?<=\.)\s/)[0];
    const out = sentence.length > 200 ? `${sentence.slice(0, 197)}...` : sentence;
    return out;
  }
  return null;
}

// ----------------------------------------------------------------------------
// fs-backed engine.

function listDir(absDir) {
  return fs.readdirSync(absDir, { withFileTypes: true });
}

function isSkipped(relFromDoc) {
  if (SKIP_PATH_FRAGMENTS.some((f) => `/${relFromDoc}`.includes(f))) return true;
  return relFromDoc.split('/').some((seg) => SKIP_DIR_SEGMENTS.has(seg));
}

function conceptDocsIn(absDir) {
  return listDir(absDir)
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.endsWith('.template') && !RESERVED_FILES.has(e.name))
    .map((e) => e.name)
    .sort();
}

function subDirsIn(absDir, docRoot) {
  return listDir(absDir)
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !isSkipped(toPosix(path.relative(docRoot, path.join(absDir, name)))))
    .sort();
}

function docSummary(absFile) {
  const content = fs.readFileSync(absFile, 'utf8');
  const { fm, body } = splitFrontmatter(content);
  const title = (fm && fm.title) || deriveTitle(body) || path.basename(absFile, '.md');
  const description = (fm && fm.description) || deriveDescription(body) || null;
  return { title, description };
}

// The listing file a subdirectory will actually expose, resolved against the
// real on-disk casing so links stay valid on case-sensitive filesystems.
// Mirrors writeIndex's decision: lowercase index.md when we own/create it,
// otherwise the colliding uppercase INDEX.md, otherwise README.md, else none.
function childListingName(absChildDir, docRoot) {
  const names = listDir(absChildDir).filter((e) => e.isFile()).map((e) => e.name);
  if (names.includes('index.md')) return 'index.md';
  const upper = names.find((n) => n !== 'index.md' && n.toLowerCase() === 'index.md');
  if (upper) return upper;
  // Mirror writeIndex's create condition (skip-aware) so the predicted link
  // matches the file that will actually exist.
  if (conceptDocsIn(absChildDir).length || subDirsIn(absChildDir, docRoot).length) return 'index.md';
  if (names.includes('README.md')) return 'README.md';
  return null;
}

// Description for a subdirectory = its own index/README first prose line.
function dirSummary(absDir) {
  for (const probe of ['README.md', 'INDEX.md']) {
    const p = path.join(absDir, probe);
    if (fs.existsSync(p)) {
      const { body } = splitFrontmatter(fs.readFileSync(p, 'utf8'));
      const d = deriveDescription(body);
      if (d) return d;
    }
  }
  return null;
}

function renderIndex(absDir, docRoot, isRoot) {
  const subs = subDirsIn(absDir, docRoot);
  const docs = conceptDocsIn(absDir);
  const out = [];
  if (isRoot) out.push('---', `okf_version: "${OKF_VERSION}"`, '---', '');
  out.push(GEN_MARKER, '');

  if (subs.length) {
    out.push('# Subdirectories', '');
    for (const sub of subs) {
      const childAbs = path.join(absDir, sub);
      const listing = childListingName(childAbs, docRoot);
      const href = listing ? `${sub}/${listing}` : `${sub}/`;
      const desc = dirSummary(childAbs);
      out.push(`* [${sub}](${href})${desc ? ` — ${desc}` : ''}`);
    }
    out.push('');
  }
  if (docs.length) {
    out.push('# Concepts', '');
    for (const doc of docs) {
      const { title, description } = docSummary(path.join(absDir, doc));
      out.push(`* [${title}](${doc})${description ? ` — ${description}` : ''}`);
    }
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// Write index.md only when SAFE. Detection uses the real on-disk entry names
// (readdirSync returns the stored casing even on a case-insensitive FS) so we
// can tell `index.md` from a colliding `INDEX.md`.
function writeIndex(absDir, docRoot, isRoot, dryRun) {
  const relTarget = toPosix(path.relative(docRoot, path.join(absDir, 'index.md')));
  const names = listDir(absDir).filter((e) => e.isFile()).map((e) => e.name);
  const exactLower = names.find((n) => n === 'index.md');
  const collidingUpper = names.find((n) => n !== 'index.md' && n.toLowerCase() === 'index.md');

  if (exactLower) {
    // Our own generated file, or a hand-authored lowercase index.md.
    const existing = fs.readFileSync(path.join(absDir, 'index.md'), 'utf8');
    if (!existing.includes(GEN_MARKER)) return { file: relTarget, status: 'skipped-handwritten' };
    if (!dryRun) fs.writeFileSync(path.join(absDir, 'index.md'), renderIndex(absDir, docRoot, isRoot));
    return { file: relTarget, status: 'updated' };
  }
  if (collidingUpper) {
    // e.g. INDEX.md — corpus-owned, collides case-insensitively. Leave it; the
    // OKF consumer synthesizes a listing on the fly (index is optional).
    return { file: toPosix(path.relative(docRoot, path.join(absDir, collidingUpper))), status: 'skipped-case-collision' };
  }
  if (!dryRun) fs.writeFileSync(path.join(absDir, 'index.md'), renderIndex(absDir, docRoot, isRoot));
  return { file: relTarget, status: 'created' };
}

// Additively inject derivable OKF fields into a doc that already has a
// frontmatter block + a `type`. Never touches docs without frontmatter.
function backfillFields(absFile, dryRun) {
  const content = fs.readFileSync(absFile, 'utf8');
  const { fm, fmRaw, body } = splitFrontmatter(content);
  if (!fm || !('type' in fm)) return null; // engine never invents type/frontmatter
  const additions = [];
  if (!('title' in fm)) { const v = deriveTitle(body); if (v) additions.push(['title', v]); }
  if (!('description' in fm)) { const v = deriveDescription(body); if (v) additions.push(['description', v]); }
  if (!('timestamp' in fm)) {
    // OKF `timestamp` = ISO 8601 of last meaningful change. Reuse the corpus'
    // own last_validated when set; never fabricate a date otherwise.
    const lv = fm.last_validated;
    if (lv && String(lv).trim() && String(lv).trim() !== 'null') additions.push(['timestamp', String(lv).trim()]);
  }
  if (!additions.length) return null;

  const injected = additions.map(([k, v]) => `${k}: ${yamlQuote(v)}`).join('\n');
  const next = `---\n${fmRaw}\n${injected}\n---\n${body}`;
  if (!dryRun) fs.writeFileSync(absFile, next);
  return additions.map(([k]) => k);
}

function walkDirs(absDir, docRoot, acc) {
  acc.push(absDir);
  for (const sub of subDirsIn(absDir, docRoot)) walkDirs(path.join(absDir, sub), docRoot, acc);
  return acc;
}

// Main entrypoint. docRoot is an absolute path to the bundle root (doc/).
export function buildOkf({ docRoot, dryRun = false } = {}) {
  if (!fs.existsSync(docRoot)) throw new Error(`OKF: doc root not found: ${docRoot}`);
  const report = { indexes: [], fieldsAdded: [], rootStamped: false };

  // 1. backfill derivable OKF fields on every concept doc that has frontmatter.
  const allDirs = walkDirs(docRoot, docRoot, []);
  for (const dir of allDirs) {
    if (isSkipped(toPosix(path.relative(docRoot, dir)))) continue;
    for (const doc of conceptDocsIn(dir)) {
      const added = backfillFields(path.join(dir, doc), dryRun);
      if (added) report.fieldsAdded.push({ file: toPosix(path.relative(docRoot, path.join(dir, doc))), fields: added });
    }
  }

  // 2. emit index.md at every meaningful level (root carries okf_version).
  for (const dir of allDirs) {
    const relFromDoc = toPosix(path.relative(docRoot, dir));
    if (relFromDoc && isSkipped(relFromDoc)) continue;
    const isRoot = dir === docRoot;
    if (!isRoot && !conceptDocsIn(dir).length && !subDirsIn(dir, docRoot).length) continue;
    const res = writeIndex(dir, docRoot, isRoot, dryRun);
    report.indexes.push(res);
    if (isRoot && res.status !== 'skipped-handwritten') report.rootStamped = true;
  }
  return report;
}

export function summarizeReport(report) {
  const idx = report.indexes.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const idxStr = Object.entries(idx).map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
  return [
    `index.md: ${idxStr}`,
    `okf fields backfilled on ${report.fieldsAdded.length} doc(s)`,
    `root okf_version stamp: ${report.rootStamped ? OKF_VERSION : 'unchanged'}`,
  ].join('\n');
}
