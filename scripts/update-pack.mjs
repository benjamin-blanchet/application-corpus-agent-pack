#!/usr/bin/env node

// Update the corpus pack in-place from a newer pack source.
// Usage (from the consumer repo root):
//   node scripts/update-pack.mjs <source-pack-dir> [--apply] [--force]
//
// Default mode is read-only: previews what would change and writes the report.
// Pass --apply to actually copy files. (--dry-run is the default; included
// as an alias for clarity.)
//
// The script respects four buckets:
//   A · pack-owned        → overwritten with the source version
//                           (skills, helper scripts, root index files)
//   AGENTS · confirm       → `.github/agents/**`. Copied when missing. When a
//                           local agent DIFFERS from the incoming one it is
//                           treated as operator-customized: never overwritten
//                           silently — confirmation is requested (--apply on a
//                           TTY prompts; non-interactive runs preserve it and
//                           flag it in the report). `--force` overwrites all.
//   B · pack-template     → copied only when missing locally (existing
//                           enriched files are preserved; diff hints emitted)
//   C · corpus-owned      → never touched, even if present in source
//
// Two hard rules:
//   1. `doc/**` is NEVER overwritten. The corpus is the team's data. At most,
//      genuinely-missing scaffold files are added; any existing file under
//      `doc/` is preserved (with a diff hint when the template moved on).
//   2. A locally-modified agent under `.github/agents/` is NEVER overwritten
//      without explicit confirmation.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const args = process.argv.slice(2);
const sourceArg = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
const force = args.includes('--force') || args.includes('--yes');
const root = process.cwd();

if (!sourceArg) {
  console.error('Usage: node scripts/update-pack.mjs <source-pack-dir> [--apply] [--force]');
  console.error('       <source-pack-dir> is the path to a fresh checkout/download of the pack tree.');
  process.exit(2);
}

const sourceRoot = path.resolve(sourceArg);
if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
  console.error(`Source pack not found or not a directory: ${sourceRoot}`);
  process.exit(2);
}

// ----------------------------------------------------------------------------
// Bucket definitions.
//
// We walk the entire source pack tree and classify each file as:
//   A · pack-owned (explicit list of paths) → replaced wholesale
//   B · everything else shipped under doc/   → copy-if-missing
//
// Bucket C ("never touch") is implicit: the script only iterates files
// present in the source pack. Anything local-only (a populated feature,
// a real BUG-*, a date-named run, an interview log) is never iterated,
// so it's never touched.

const BUCKET_A_FILES = new Set([
  'AGENTS.md',
  'KICKSTART.md',
  'PACK_VERSION',
  'scripts/build-corpus-site.mjs',
  'scripts/validate-corpus.mjs',
  'scripts/inventory-repo.mjs',
  'scripts/export-graph-json.mjs',
  'scripts/update-pack.mjs',
]);
// Note: doc/CORPUS_MAP.md, doc/CORPUS_MANIFEST.md and doc/README.md used to be
// bucket A (overwritten). They are intentionally NOT here anymore — nothing
// under `doc/` is overwritten. They now fall through to the copy-if-missing /
// preserve path like the rest of the corpus.

// Files under these prefixes are bucket A (replaced wholesale).
const BUCKET_A_PREFIXES = [
  '.github/skills/',
  'scripts/',          // all pack scripts (incl. scripts/lib/**) are pack-owned — never operator-customized; replace wholesale on upgrade
];

// `.github/agents/**` is the confirm bucket: operator-customizable, so a local
// agent that differs from the incoming one is never overwritten silently.
const AGENT_PREFIXES = ['.github/agents/'];

function isBucketA(rel) {
  if (BUCKET_A_FILES.has(rel)) return true;
  return BUCKET_A_PREFIXES.some((p) => rel.startsWith(p));
}

function isAgent(rel) {
  return AGENT_PREFIXES.some((p) => rel.startsWith(p));
}

// ----------------------------------------------------------------------------
// Helpers.

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function readSource(rel) {
  const abs = path.join(sourceRoot, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function exists(absOrRel, base) {
  const abs = base ? path.join(base, absOrRel) : absOrRel;
  return fs.existsSync(abs);
}

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

function copy(srcAbs, dstAbs) {
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.copyFileSync(srcAbs, dstAbs);
}

function readVersion(rel) {
  const text = read(rel) || readSource(rel);
  if (!text) return null;
  const m = text.split(/\r?\n/)[0].trim();
  return m || null;
}

function readVersionFrom(text) {
  if (!text) return null;
  return text.split(/\r?\n/)[0].trim() || null;
}

const sourceVersion = readVersionFrom(readSource('PACK_VERSION')) || '<unknown>';
const localVersion = readVersionFrom(read('PACK_VERSION')) || '<missing>';

// ----------------------------------------------------------------------------
// Plan the upgrade.

const plan = {
  replace: [],     // {rel, why}  — pack-owned, content differs
  copyNew: [],     // {rel, why}  — file missing locally
  confirm: [],     // {rel, why}  — local agent differs → needs confirmation
  preserve: [],    // {rel, hint} — template diverged from local, NOT touched
  warnRemoved: [], // {rel}       — local file no longer in source pack
  unchanged: [],   // {rel}
};

function classifyAFile(rel) {
  const srcAbs = path.join(sourceRoot, rel);
  const dstAbs = path.join(root, rel);
  if (!fs.existsSync(dstAbs)) {
    plan.copyNew.push({ rel, why: 'pack-owned, missing locally' });
    return;
  }
  const a = fs.readFileSync(srcAbs);
  const b = fs.readFileSync(dstAbs);
  if (a.equals(b)) plan.unchanged.push({ rel });
  else plan.replace.push({ rel, why: 'pack-owned, content drift' });
}

function classifyAgentFile(rel) {
  const srcAbs = path.join(sourceRoot, rel);
  const dstAbs = path.join(root, rel);
  if (!fs.existsSync(dstAbs)) {
    plan.copyNew.push({ rel, why: 'agent, missing locally' });
    return;
  }
  const a = fs.readFileSync(srcAbs);
  const b = fs.readFileSync(dstAbs);
  if (a.equals(b)) {
    plan.unchanged.push({ rel });
    return;
  }
  // Local agent differs from the incoming one → treat as operator-customized.
  plan.confirm.push({ rel, why: 'local agent differs — confirm before overwrite' });
}

function classifyBFile(rel) {
  const srcAbs = path.join(sourceRoot, rel);
  const dstAbs = path.join(root, rel);
  if (!fs.existsSync(dstAbs)) {
    plan.copyNew.push({ rel, why: 'template, missing locally' });
    return;
  }
  const a = fs.readFileSync(srcAbs);
  const b = fs.readFileSync(dstAbs);
  if (a.equals(b)) {
    plan.unchanged.push({ rel });
    return;
  }
  plan.preserve.push({
    rel,
    hint: 'local file differs from new template — review manually if conventions changed',
  });
}

// Walk the source pack and classify every file.
const sourceFiles = walk(sourceRoot).map((p) => path.relative(sourceRoot, p));
const sourceSet = new Set(sourceFiles);
for (const rel of sourceFiles) {
  if (isAgent(rel)) classifyAgentFile(rel);
  else if (isBucketA(rel)) classifyAFile(rel);
  else classifyBFile(rel);
}

// Detect locally-present files that no longer ship with the source pack (only
// under pack-owned prefixes, where deletion is meaningful — under doc/ a
// "removed from source" file is almost certainly local corpus content).
const localFilesUnderA = [];
for (const p of [...BUCKET_A_PREFIXES, ...AGENT_PREFIXES]) {
  const dir = path.join(root, p);
  if (fs.existsSync(dir)) localFilesUnderA.push(...walk(dir).map((f) => path.relative(root, f)));
}
for (const rel of localFilesUnderA) {
  if (!sourceSet.has(rel)) plan.warnRemoved.push({ rel });
}
// Also flag root-level pack-owned files that are missing in source.
for (const rel of BUCKET_A_FILES) {
  if (fs.existsSync(path.join(root, rel)) && !sourceSet.has(rel)) {
    plan.warnRemoved.push({ rel });
  }
}

// ----------------------------------------------------------------------------
// Print the plan.

function header(s) { console.log(`\n=== ${s} ===`); }
function row(items, prefix = '  ') {
  if (!items.length) { console.log(`${prefix}(none)`); return; }
  for (const it of items) console.log(`${prefix}- ${it.rel}${it.why ? ' · ' + it.why : ''}${it.hint ? ' · ' + it.hint : ''}`);
}

console.log(`Pack upgrade · ${apply ? 'APPLY' : 'DRY-RUN'}`);
console.log(`  Source:  ${sourceRoot}  (version ${sourceVersion})`);
console.log(`  Target:  ${root}        (version ${localVersion})`);

header(`Replace (bucket A — pack-owned): ${plan.replace.length}`);
row(plan.replace);
header(`New files (missing locally): ${plan.copyNew.length}`);
row(plan.copyNew);
header(`Agents modified locally (confirm before overwrite${force ? ' — forced' : ''}): ${plan.confirm.length}`);
row(plan.confirm);
header(`Preserve (bucket B — local content differs, NOT touched): ${plan.preserve.length}`);
row(plan.preserve);
header(`Locally present, removed in source (review): ${plan.warnRemoved.length}`);
row(plan.warnRemoved);
header(`Unchanged: ${plan.unchanged.length}`);

// ----------------------------------------------------------------------------
// Apply (when requested).

async function confirmPrompt(question) {
  // No TTY (npx in CI, piped) → never overwrite; the file is preserved and
  // surfaced in the report for manual review.
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

const actuallyChanged = [];
const keptAgents = []; // agents preserved because the operator declined the overwrite
if (apply) {
  for (const it of plan.replace.concat(plan.copyNew)) {
    const srcAbs = path.join(sourceRoot, it.rel);
    const dstAbs = path.join(root, it.rel);
    copy(srcAbs, dstAbs);
    actuallyChanged.push(it.rel);
  }

  // Locally-modified agents: never overwritten without an explicit yes.
  if (plan.confirm.length && !force && !process.stdin.isTTY) {
    console.log(`\n${plan.confirm.length} locally-modified agent(s) preserved (non-interactive run; re-run on a TTY or pass --force to overwrite).`);
  }
  for (const it of plan.confirm) {
    const overwrite = force
      ? true
      : await confirmPrompt(`Overwrite locally-modified agent '${it.rel}'? Local changes will be lost.`);
    if (overwrite) {
      copy(path.join(sourceRoot, it.rel), path.join(root, it.rel));
      actuallyChanged.push(it.rel);
    } else {
      keptAgents.push(it.rel);
    }
  }

  // Stamp corpus-state.yaml with the new pack_version + last_pack_upgrade.
  // We do this with a minimal regex to avoid full YAML rewriting.
  const csRel = 'doc/_meta/corpus-state.yaml';
  if (fs.existsSync(path.join(root, csRel))) {
    let cs = fs.readFileSync(path.join(root, csRel), 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    if (/^\s*pack_version:/m.test(cs)) {
      cs = cs.replace(/^(\s*pack_version:\s*).*$/m, `$1'${sourceVersion}'`);
    } else {
      cs = cs.replace(/^(corpus:\s*\n)/, `$1  pack_version: '${sourceVersion}'\n`);
    }
    if (/^\s*last_pack_upgrade:/m.test(cs)) {
      cs = cs.replace(/^(\s*last_pack_upgrade:\s*).*$/m, `$1'${today}'`);
    } else {
      cs = cs.replace(/^(\s*pack_version:.*\n)/m, `$1  last_pack_upgrade: '${today}'\n`);
    }
    fs.writeFileSync(path.join(root, csRel), cs);
  }

  // Append a line to the corpus-changelog.
  const chgRel = 'doc/_meta/corpus-changelog.md';
  if (fs.existsSync(path.join(root, chgRel))) {
    const today = new Date().toISOString().slice(0, 10);
    let chg = fs.readFileSync(path.join(root, chgRel), 'utf8');
    const line = `| ${today} | Pack upgrade ${localVersion} → ${sourceVersion} | scripts/update-pack.mjs | corpus |\n`;
    if (chg.includes('| Date | Change | Reason | Actor |')) {
      // Append after the header separator.
      chg = chg.replace(/(\|\s*Date\s*\|.*\n\|[-\s|]+\n)/, `$1${line}`);
    } else {
      chg = chg.trimEnd() + '\n' + line;
    }
    fs.writeFileSync(path.join(root, chgRel), chg);
  }
}

// ----------------------------------------------------------------------------
// Write upgrade report.

const reportRel = `doc/_meta/pack-upgrade-${localVersion.replace(/\s.*/, '')}-to-${sourceVersion.replace(/\s.*/, '')}.md`;
const reportAbs = path.join(root, reportRel);
const todayIso = new Date().toISOString();
const lines = [];
lines.push('---');
lines.push('type: meta');
lines.push('status: active');
lines.push('confidence: confirmed');
lines.push('source: pack');
lines.push(`generated_at: ${todayIso}`);
lines.push('---');
lines.push('');
lines.push(`# Pack upgrade report`);
lines.push('');
lines.push(`- From version: \`${localVersion}\``);
lines.push(`- To version:   \`${sourceVersion}\``);
lines.push(`- Source path:  \`${sourceRoot}\``);
lines.push(`- Mode:         ${apply ? 'apply' : 'dry-run'}`);
lines.push('');
lines.push('## Replaced (pack-owned)');
if (plan.replace.length) for (const it of plan.replace) lines.push(`- \`${it.rel}\``); else lines.push('- _none_');
lines.push('');
lines.push('## Newly copied (was missing locally)');
if (plan.copyNew.length) for (const it of plan.copyNew) lines.push(`- \`${it.rel}\``); else lines.push('- _none_');
lines.push('');
lines.push('## Agents modified locally (never overwritten silently)');
lines.push('');
lines.push(apply
  ? 'These agents differ from the incoming pack version. Overwrites only happened where you confirmed (or `--force` was passed); the rest were preserved.'
  : 'These agents differ from the incoming pack version. On `--apply` you will be asked per file before any overwrite (preserved by default).');
lines.push('');
if (plan.confirm.length) {
  for (const it of plan.confirm) {
    const fate = apply ? (keptAgents.includes(it.rel) ? ' — preserved' : ' — overwritten') : '';
    lines.push(`- \`${it.rel}\`${fate}`);
  }
} else lines.push('- _none_');
lines.push('');
lines.push('## Preserved (template diverged from local, NOT touched)');
lines.push('');
lines.push('Review these files manually if the new pack changed conventions (new fields, new columns, renamed keys). Compare against the source pack copy of the same file.');
lines.push('');
if (plan.preserve.length) for (const it of plan.preserve) lines.push(`- \`${it.rel}\``); else lines.push('- _none_');
lines.push('');
lines.push('## Locally present, removed from source');
lines.push('');
lines.push('These exist in your repo but not in the new pack. They may be deprecated, renamed, or local customizations. The script did NOT delete them — review and remove manually if appropriate.');
lines.push('');
if (plan.warnRemoved.length) for (const it of plan.warnRemoved) lines.push(`- \`${it.rel}\``); else lines.push('- _none_');
lines.push('');
lines.push('## Next steps');
lines.push('');
lines.push('1. Run `node scripts/validate-corpus.mjs` — fix any P0/P1 finding introduced by the upgrade.');
lines.push('2. Review the "Preserved" list above — check each file against the new template if the pack changelog mentions structural changes (new required fields, new columns, renamed keys).');
lines.push('3. Review the "Removed from source" list — delete obsolete files only if you are sure they are not local customizations you want to keep.');
lines.push('4. If `corpus-state.yaml.pack_version` was bumped, commit the change with a clear message: `chore: pack upgrade <from> → <to>`.');
lines.push('');

if (apply) {
  fs.mkdirSync(path.dirname(reportAbs), { recursive: true });
  fs.writeFileSync(reportAbs, lines.join('\n'));
  console.log(`\nReport written to ${path.relative(root, reportAbs)}`);
  console.log(`Files changed: ${actuallyChanged.length}`);
  console.log('Re-run `node scripts/validate-corpus.mjs` to confirm structural integrity.');
} else {
  console.log('\n(dry-run — pass --apply to perform the upgrade)');
  console.log(`Would write report to ${path.relative(root, reportAbs)}`);
}
