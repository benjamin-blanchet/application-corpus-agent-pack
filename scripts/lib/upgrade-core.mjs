// Shared engine for installing / upgrading the corpus pack in place.
//
// Both entrypoints reuse this module, so the safety guarantees are identical
// no matter how the pack is acquired:
//   - scripts/update-pack.mjs  (committed in the consumer repo; source pack
//                               passed as a path, or fetched via --from-github)
//   - scripts/cli.mjs          (the `npx github:…` bin; source pack = its own
//                               package dir, target = the caller's cwd)
//
// Bucket policy (see runUpgrade):
//   A · pack-owned        → overwritten with the source version
//                           (skills, helper scripts, schemas, root index files)
//   AGENTS · confirm       → `.github/agents/**`. Copied when missing. When a
//                           local agent DIFFERS it is operator-customized:
//                           never overwritten silently — confirmation is
//                           requested (TTY prompts; non-interactive preserves
//                           and flags it). `force: true` overwrites all.
//   B · pack-template     → copied only when missing locally (existing files
//                           preserved; diff hints emitted)
//   C · corpus-owned      → never touched, even if present in source
//
// Two hard rules:
//   1. `doc/**` is NEVER overwritten — even with `force`. The corpus is the
//      team's data. Genuinely-missing scaffold files are added; existing
//      files are preserved (with a diff hint when the template moved on).
//   2. A locally-modified agent is NEVER overwritten without explicit consent.

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

// ----------------------------------------------------------------------------
// Bucket definitions (pure — no filesystem state).

const BUCKET_A_FILES = new Set([
  'AGENTS.md',
  'KICKSTART.md',
  '.github/copilot-instructions.md', // pack doctrine (the AGENTS.md mirror + role routing), like AGENTS.md — refreshed on upgrade. Operator-specific Copilot instructions belong in `.github/instructions/*.instructions.md`, which the pack never ships or touches.
  'PACK_VERSION',
  'scripts/build-corpus-site.mjs',
  'scripts/validate-corpus.mjs',
  'scripts/inventory-repo.mjs',
  'scripts/export-graph-json.mjs',
  'scripts/update-pack.mjs',
]);
// Note: doc/CORPUS_MAP.md, doc/CORPUS_MANIFEST.md and doc/README.md are NOT
// bucket A — nothing under `doc/` is overwritten. They fall through to the
// copy-if-missing / preserve path like the rest of the corpus.

const BUCKET_A_PREFIXES = [
  '.github/skills/',
  '.github/prompts/',     // shipped prompt assets are pack-owned and refreshed with their skills
  'scripts/',          // all pack scripts (incl. scripts/lib/**) are pack-owned — replaced wholesale
  'schemas/',          // machine-readable contracts the validator enforces — pack-owned, not team data; refreshed so they never drift behind an updated validator
];

// `.github/agents/**` is the confirm bucket: operator-customizable.
const AGENT_PREFIXES = ['.github/agents/'];

// On an existing installation, the migration agent owns the durable version
// transition. Copying a missing state template here would pre-stamp the target
// with the incoming version and destroy the evidence that its prior version is
// unknown. Fresh installs still receive the template normally.
const MIGRATION_OWNED_ON_UPGRADE = new Set([
  'doc/_meta/corpus-state.yaml',
]);

// Repo-only paths in the pack source that must NEVER be copied into a consumer
// repo. Needed because the source is now the whole pack repository (via npx /
// git clone), not a hand-prepared subtree. The pack ships .github/, scripts/,
// schemas/, doc/, AGENTS.md, KICKSTART.md, PACK_VERSION and *.template files;
// everything else here is pack-repo infrastructure.
const SOURCE_IGNORE_SEGMENTS = new Set(['.git', 'node_modules']); // skipped at any depth
const SOURCE_IGNORE_ROOT_FILES = new Set([
  'README.md', 'LICENSE.md', 'package.json', 'package-lock.json',
  '.gitignore', '.npmignore', '.DS_Store',
]);
const SOURCE_IGNORE_ROOT_DIRS = ['docs/', 'examples/', '.github/workflows/'];

function isIgnoredSource(rel) {
  const segments = rel.split(/[\\/]/);
  if (segments.some((s) => SOURCE_IGNORE_SEGMENTS.has(s))) return true;
  if (SOURCE_IGNORE_ROOT_FILES.has(rel)) return true;
  // The pack repository follows its own spec-first workflow, but those
  // release work packages are not consumer corpus scaffolds. Ship/sync only
  // the reusable spec template.
  if (rel.startsWith('doc/spec/') && !rel.startsWith('doc/spec/template/')) return true;
  return SOURCE_IGNORE_ROOT_DIRS.some((p) => rel.startsWith(p));
}

function isBucketA(rel) {
  if (BUCKET_A_FILES.has(rel)) return true;
  return BUCKET_A_PREFIXES.some((p) => rel.startsWith(p));
}

function isAgent(rel) {
  return AGENT_PREFIXES.some((p) => rel.startsWith(p));
}

// ----------------------------------------------------------------------------
// Pure helpers.

// Relative paths are compared against forward-slash literals throughout (bucket
// prefixes, denylist, BUCKET_A_FILES). On Windows `path.relative` yields
// backslashes, so every relative path is normalized to POSIX separators before
// any comparison. (path.join converts back to the native separator on write.)
const toPosix = (p) => p.replace(/\\/g, '/');

function walk(dirAbs) {
  if (!fs.existsSync(dirAbs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (SOURCE_IGNORE_SEGMENTS.has(entry.name)) continue; // never descend into .git / node_modules
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function copyFile(srcAbs, dstAbs) {
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.copyFileSync(srcAbs, dstAbs);
}

function firstLine(text) {
  if (!text) return null;
  return text.split(/\r?\n/)[0].trim() || null;
}

async function confirmPrompt(question) {
  // No TTY (npx in CI, piped) → never overwrite; preserve and surface.
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

// ----------------------------------------------------------------------------
// The engine.

/**
 * Install or upgrade the pack in `target` from the pack tree at `sourceRoot`.
 * @param {object} o
 * @param {string} o.sourceRoot  absolute path to a fresh pack tree
 * @param {string} o.target      absolute path to the consumer repo root
 * @param {boolean} [o.apply]    write changes (default: dry-run)
 * @param {boolean} [o.force]    overwrite locally-modified agents without asking
 * @returns {Promise<object>}    summary { changed, kept, plan }
 */
export async function runUpgrade({ sourceRoot, target, apply = false, force = false }) {
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Source pack not found or not a directory: ${sourceRoot}`);
  }

  const readLocal = (rel) => {
    const abs = path.join(target, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  };
  const readSource = (rel) => {
    const abs = path.join(sourceRoot, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  };

  const sourceVersion = firstLine(readSource('PACK_VERSION')) || '<unknown>';
  const localVersion = firstLine(readLocal('PACK_VERSION')) || '<missing>';
  // Very old corpora may predate PACK_VERSION. A canonical corpus marker still
  // makes this an upgrade: treating it as a fresh install could copy the new
  // state template and erase the fact that the previous version is unknown.
  const hasExistingCorpus = readLocal('doc/CORPUS_MANIFEST.md') !== null
    || readLocal('doc/_meta/corpus-state.yaml') !== null;
  const isInstall = localVersion === '<missing>' && !hasExistingCorpus;

  const plan = {
    replace: [],     // {rel, why}  — pack-owned, content differs
    copyNew: [],     // {rel, why}  — file missing locally
    defer: [],       // {rel, why}  — migration-owned file missing on upgrade
    confirm: [],     // {rel, why}  — local agent differs → needs confirmation
    preserve: [],    // {rel, hint} — template diverged from local, NOT touched
    warnRemoved: [], // {rel}       — local file no longer in source pack
    unchanged: [],   // {rel}
  };

  const differs = (rel) => {
    const a = fs.readFileSync(path.join(sourceRoot, rel));
    const b = fs.readFileSync(path.join(target, rel));
    return !a.equals(b);
  };
  const existsLocal = (rel) => fs.existsSync(path.join(target, rel));

  function classifyAFile(rel) {
    if (!existsLocal(rel)) { plan.copyNew.push({ rel, why: 'pack-owned, missing locally' }); return; }
    if (differs(rel)) plan.replace.push({ rel, why: 'pack-owned, content drift' });
    else plan.unchanged.push({ rel });
  }
  function classifyAgentFile(rel) {
    if (!existsLocal(rel)) { plan.copyNew.push({ rel, why: 'agent, missing locally' }); return; }
    if (differs(rel)) plan.confirm.push({ rel, why: 'local agent differs — confirm before overwrite' });
    else plan.unchanged.push({ rel });
  }
  function classifyBFile(rel) {
    if (!existsLocal(rel)) {
      if (!isInstall && MIGRATION_OWNED_ON_UPGRADE.has(rel)) {
        plan.defer.push({ rel, why: 'migration-owned state, missing locally' });
        return;
      }
      plan.copyNew.push({ rel, why: 'template, missing locally' });
      return;
    }
    if (differs(rel)) {
      plan.preserve.push({ rel, hint: 'local file differs from new template — review manually if conventions changed' });
    } else {
      plan.unchanged.push({ rel });
    }
  }

  // Walk the source pack and classify every file (skipping repo-only paths).
  const sourceFiles = walk(sourceRoot)
    .map((p) => toPosix(path.relative(sourceRoot, p)))
    .filter((rel) => !isIgnoredSource(rel));
  const sourceSet = new Set(sourceFiles);
  for (const rel of sourceFiles) {
    if (isAgent(rel)) classifyAgentFile(rel);
    else if (isBucketA(rel)) classifyAFile(rel);
    else classifyBFile(rel);
  }

  // Locally-present files removed from the source pack (only meaningful under
  // pack-owned / agent prefixes; under doc/ a "removed" file is corpus content).
  const localUnderManaged = [];
  for (const p of [...BUCKET_A_PREFIXES, ...AGENT_PREFIXES]) {
    const dir = path.join(target, p);
    if (fs.existsSync(dir)) localUnderManaged.push(...walk(dir).map((f) => toPosix(path.relative(target, f))));
  }
  for (const rel of localUnderManaged) {
    if (!sourceSet.has(rel)) plan.warnRemoved.push({ rel });
  }
  for (const rel of BUCKET_A_FILES) {
    if (existsLocal(rel) && !sourceSet.has(rel)) plan.warnRemoved.push({ rel });
  }

  // --------------------------------------------------------------------------
  // Print the plan.

  const log = (s = '') => console.log(s);
  const header = (s) => log(`\n=== ${s} ===`);
  const row = (items, prefix = '  ') => {
    if (!items.length) { log(`${prefix}(none)`); return; }
    for (const it of items) log(`${prefix}- ${it.rel}${it.why ? ' · ' + it.why : ''}${it.hint ? ' · ' + it.hint : ''}`);
  };

  log(`Pack ${isInstall ? 'install' : 'upgrade'} · ${apply ? 'APPLY' : 'DRY-RUN'}`);
  log(`  Version: ${localVersion} → ${sourceVersion}`);
  log(`  Source:  ${sourceRoot}  (version ${sourceVersion})`);
  log(`  Target:  ${target}  (version ${localVersion})`);

  header(`Replace (bucket A — pack-owned): ${plan.replace.length}`); row(plan.replace);
  header(`New files (missing locally): ${plan.copyNew.length}`); row(plan.copyNew);
  header(`Deferred to Corpus migration: ${plan.defer.length}`); row(plan.defer);
  header(`Agents modified locally (confirm before overwrite${force ? ' — forced' : ''}): ${plan.confirm.length}`); row(plan.confirm);
  header(`Preserve (bucket B — local content differs, NOT touched): ${plan.preserve.length}`); row(plan.preserve);
  header(`Locally present, removed in source (review): ${plan.warnRemoved.length}`); row(plan.warnRemoved);
  header(`Unchanged: ${plan.unchanged.length}`);

  // --------------------------------------------------------------------------
  // Apply.

  const changed = [];
  const keptAgents = [];
  if (apply) {
    for (const it of plan.replace.concat(plan.copyNew)) {
      copyFile(path.join(sourceRoot, it.rel), path.join(target, it.rel));
      changed.push(it.rel);
    }

    if (plan.confirm.length && !force && !process.stdin.isTTY) {
      log(`\n${plan.confirm.length} locally-modified agent(s) preserved (non-interactive run; re-run on a TTY or pass --force to overwrite).`);
    }
    for (const it of plan.confirm) {
      const overwrite = force
        ? true
        : await confirmPrompt(`Overwrite locally-modified agent '${it.rel}'? Local changes will be lost.`);
      if (overwrite) { copyFile(path.join(sourceRoot, it.rel), path.join(target, it.rel)); changed.push(it.rel); }
      else keptAgents.push(it.rel);
    }
  }

  // --------------------------------------------------------------------------
  // Console summary. Durable state, changelog and migration reports belong to
  // the Corpus migration that follows an upgrade, never to this copy step.

  if (apply) {
    log('\nSync complete.');
    log(`Files changed: ${changed.length}`);
    log(`Locally-modified agents preserved: ${keptAgents.length}`);
    if (isInstall) {
      log('Next step: open the Corpus agent and start the corpus.');
    } else {
      log('Next step: open the Corpus agent and run the pack migration.');
    }
  } else {
    log('\nSync preview complete; no files were written.');
    log('Re-run with --apply to perform the copy.');
  }

  return { changed, kept: keptAgents, plan, sourceVersion, localVersion, isInstall };
}
