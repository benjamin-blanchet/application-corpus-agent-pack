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
//                           preserved; diff hints emitted). Executable factory
//                           templates are bucket A so they cannot drift from
//                           the scripts and schemas that consume them.
//   C · corpus-owned      → never touched, even if present in source
//
// Two hard rules:
//   1. `doc/**` is NEVER overwritten — even with `force` — except the reusable
//      executable scaffold `doc/spec/template/**` and the pack regression
//      ledger `doc/_meta/factory-learning.yaml`. Instantiated spec packages
//      and application knowledge remain team data.
//   2. A locally-modified agent is NEVER overwritten without explicit consent.

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  detectLegacyProfiles,
  loadInstallState,
  loadProfileConfig,
  PROFILE_ORDER,
  profileForPath,
  resolveProfiles,
  sourceTreeDigest,
  targetFileDigest,
  writeInstallState,
  writeOfflineBundles,
} from './profile-bundles.mjs';

// ----------------------------------------------------------------------------
// Bucket definitions (pure — no filesystem state).

const BUCKET_A_FILES = new Set([
  'AGENTS.md',
  'KICKSTART.md',
  '.github/copilot-instructions.md', // pack doctrine (the AGENTS.md mirror + role routing), like AGENTS.md — refreshed on upgrade. Operator-specific Copilot instructions belong in `.github/instructions/*.instructions.md`, which the pack never ships or touches.
  'doc/_meta/factory-learning.yaml', // pack regression memory; version-aligned with its schema and executable fixture catalogue
  'PACK_VERSION',
  'scripts/build-corpus-site.mjs',
  'scripts/validate-corpus.mjs',
  'scripts/inventory-repo.mjs',
  'scripts/export-graph-json.mjs',
  'scripts/update-pack.mjs',
]);
// Note: doc/CORPUS_MAP.md, doc/CORPUS_MANIFEST.md and doc/README.md are NOT
// bucket A. Only the two explicit Factory exceptions above/below are refreshed;
// all application corpus files fall through to copy-if-missing / preserve.

const BUCKET_A_PREFIXES = [
  '.github/skills/',
  '.github/prompts/',     // shipped prompt assets are pack-owned and refreshed with their skills
  '.github/templates/software-factory/', // executable workflows/contracts must stay version-aligned with scripts and schemas
  'doc/spec/template/', // reusable executable V3 package; instantiated doc/spec/<version> packages remain corpus-owned
  'pack/',             // executable profile definitions used by sync and the offline CLI
  'scripts/',          // all pack scripts (incl. scripts/lib/**) are pack-owned — replaced wholesale
  'schemas/',          // machine-readable contracts the validator enforces — pack-owned, not team data; refreshed so they never drift behind an updated validator
];

// `.github/agents/**` is the confirm bucket: operator-customizable.
const AGENT_PREFIXES = ['.github/agents/'];

// Exact, reviewed retirements only. General removed pack files remain warnings:
// local extensions are legitimate and sync must never become `--delete`.
const RETIRED_PACK_FILES = new Map([
  ['.github/skills/sources/mcp-readiness-check/SKILL.md', 'obsolete workstation/session readiness contract; replaced by runtime-source-probe'],
  ['doc/spec/template/factory-state.yaml', 'obsolete V1 mutable state; V3 state is derived from factory/events.v3.jsonl'],
  ['doc/spec/template/technical-plan.yaml', 'obsolete V1 machine plan; V3 uses factory/plan.v3.json'],
]);

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
const SOURCE_IGNORE_ROOT_DIRS = [
  'docs/',
  'examples/',
  '.github/workflows/',
  '.corpus-pack-backups/',
  '.corpus-pack/',
  // Lazy corpus sections are materialized from the always-local templates
  // only after the application actually exposes the corresponding concept.
  'doc/project/apis/',
  'doc/project/batchs/',
  'doc/project/features/',
  'doc/prod/',
];

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

function realDirectoryRoot(candidate, label) {
  const lexical = path.resolve(candidate);
  if (!fs.existsSync(lexical)) throw new Error(`${label} does not exist: ${lexical}`);
  const stat = fs.lstatSync(lexical);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be a real directory: ${lexical}`);
  return fs.realpathSync(lexical);
}

function relativeParts(rel, label) {
  const normalized = toPosix(rel);
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(rel)) throw new Error(`${label} must be a non-empty relative path`);
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`${label} contains an unsafe path segment: ${rel}`);
  return parts;
}

function inspectContained(root, rel, { allowMissing = false, label = rel } = {}) {
  const parts = relativeParts(rel, label);
  let cursor = root;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return { absolute: path.join(root, ...parts), exists: false, stat: null };
      throw new Error(`${label} cannot be inspected: ${error.message}`);
    }
    if (stat.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link at ${parts.slice(0, index + 1).join('/')}`);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`${label} has a non-directory parent at ${parts.slice(0, index + 1).join('/')}`);
  }
  return { absolute: path.join(root, ...parts), exists: true, stat: fs.lstatSync(cursor) };
}

function readContainedFile(root, rel, { allowMissing = false, encoding = null, label = rel } = {}) {
  const checked = inspectContained(root, rel, { allowMissing, label });
  if (!checked.exists) return null;
  if (!checked.stat.isFile()) throw new Error(`${label} must be a regular file`);
  const fd = fs.openSync(checked.absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== checked.stat.dev || opened.ino !== checked.stat.ino) throw new Error(`${label} changed while it was opened`);
    return fs.readFileSync(fd, encoding === null ? undefined : { encoding });
  } finally {
    fs.closeSync(fd);
  }
}

function ensureContainedParents(root, rel, label = rel) {
  const parts = relativeParts(rel, label);
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} has an unsafe parent ${path.relative(root, cursor)}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(cursor);
      const created = fs.lstatSync(cursor);
      if (created.isSymbolicLink() || !created.isDirectory()) throw new Error(`${label} parent was not created safely`);
    }
  }
  return path.dirname(path.join(root, ...parts));
}

let copySequence = 0;
function writeContainedFile(targetRoot, rel, bytes, mode, { refuseDifferentExisting = false } = {}) {
  const parent = ensureContainedParents(targetRoot, rel, `target ${rel}`);
  const target = inspectContained(targetRoot, rel, { allowMissing: true, label: `target ${rel}` });
  if (target.exists && !target.stat.isFile()) throw new Error(`target ${rel} must be a regular file`);
  if (target.exists && refuseDifferentExisting) {
    const existing = readContainedFile(targetRoot, rel, { label: `target ${rel}` });
    if (!existing.equals(bytes)) throw new Error(`Refusing to overwrite a different existing backup: ${rel}`);
    return false;
  }
  copySequence += 1;
  const temporary = path.join(parent, `.${path.basename(rel)}.corpus-pack-${process.pid}-${copySequence}.tmp`);
  let temporaryCreated = false;
  try {
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), mode & 0o777);
    temporaryCreated = true;
    try {
      let offset = 0;
      while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    ensureContainedParents(targetRoot, rel, `target ${rel}`);
    inspectContained(targetRoot, rel, { allowMissing: true, label: `target ${rel}` });
    fs.renameSync(temporary, target.absolute);
    temporaryCreated = false;
    const written = inspectContained(targetRoot, rel, { label: `target ${rel}` });
    if (!written.stat.isFile()) throw new Error(`target ${rel} was not written as a regular file`);
    return true;
  } finally {
    if (temporaryCreated && fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function copyContainedFile(sourceRoot, targetRoot, rel) {
  const source = inspectContained(sourceRoot, rel, { label: `source ${rel}` });
  if (!source.stat.isFile()) throw new Error(`source ${rel} must be a regular file`);
  const bytes = readContainedFile(sourceRoot, rel, { label: `source ${rel}` });
  writeContainedFile(targetRoot, rel, bytes, source.stat.mode);
}

function backupRelativePath(fromVersion, toVersion, rel) {
  const slug = (value) => String(value).replace(/[^A-Za-z0-9._-]/g, '-');
  return `.corpus-pack-backups/${slug(fromVersion)}-to-${slug(toVersion)}/${toPosix(rel)}`;
}

function needsCompatibilityBackup(rel) {
  return rel.startsWith('.github/templates/software-factory/')
    || rel.startsWith('doc/spec/template/')
    || rel === 'doc/_meta/factory-learning.yaml';
}

function unlinkContainedFile(root, rel) {
  const checked = inspectContained(root, rel, { label: `retired ${rel}` });
  if (!checked.stat.isFile()) throw new Error(`Refusing to retire non-regular pack surface: ${rel}`);
  fs.unlinkSync(checked.absolute);
}

function walk(dirAbs) {
  if (!fs.existsSync(dirAbs)) return [];
  const rootStat = fs.lstatSync(dirAbs);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`Refusing to traverse non-directory or symlink: ${dirAbs}`);
  const out = [];
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (SOURCE_IGNORE_SEGMENTS.has(entry.name)) continue; // never descend into .git / node_modules
    const abs = path.join(dirAbs, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing to traverse source/target symlink: ${abs}`);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
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
 * @param {string[]} [o.profiles] profiles to activate; defaults to core on a fresh install
 * @returns {Promise<object>}    summary { changed, kept, plan }
 */
export async function runUpgrade({ sourceRoot, target, apply = false, force = false, profiles = null }) {
  sourceRoot = realDirectoryRoot(sourceRoot, 'source pack');
  target = realDirectoryRoot(target, 'target repository');

  const readLocal = (rel) => {
    return readContainedFile(target, rel, { allowMissing: true, encoding: 'utf8', label: `local ${rel}` });
  };
  const readSource = (rel) => {
    return readContainedFile(sourceRoot, rel, { allowMissing: true, encoding: 'utf8', label: `source ${rel}` });
  };

  const sourceVersion = firstLine(readSource('PACK_VERSION')) || '<unknown>';
  const previousInstallState = loadInstallState(target);
  const localVersion = firstLine(readLocal('PACK_VERSION')) || previousInstallState?.packVersion || '<missing>';
  // Very old corpora may predate PACK_VERSION. A canonical corpus marker still
  // makes this an upgrade: treating it as a fresh install could copy the new
  // state template and erase the fact that the previous version is unknown.
  const hasExistingCorpus = readLocal('doc/CORPUS_MANIFEST.md') !== null
    || readLocal('doc/_meta/corpus-state.yaml') !== null;
  const isInstall = localVersion === '<missing>' && !hasExistingCorpus && !previousInstallState;

  const sourceFiles = walk(sourceRoot)
    .map((p) => toPosix(path.relative(sourceRoot, p)))
    .filter((rel) => !isIgnoredSource(rel));
  const sourceSet = new Set(sourceFiles);
  const profileConfig = loadProfileConfig(sourceRoot);
  const activeProfiles = profiles?.length
    ? resolveProfiles(profiles, profileConfig)
    : previousInstallState?.activeProfiles?.length
      ? resolveProfiles(previousInstallState.activeProfiles, profileConfig)
      : isInstall
        ? ['core']
        : detectLegacyProfiles(target, sourceFiles, profileConfig);
  const activeProfileSet = new Set(activeProfiles);

  const plan = {
    replace: [],     // {rel, why}  — pack-owned, content differs
    copyNew: [],     // {rel, why}  — file missing locally
    defer: [],       // {rel, why}  — migration-owned file missing on upgrade
    confirm: [],     // {rel, why}  — local agent differs → needs confirmation
    conflict: [],    // {rel, incomingRel} — fresh-install collision, preserved locally
    preserve: [],    // {rel, hint} — template diverged from local, NOT touched
    backup: [],      // {rel, backupRel} — compatibility copy before replacing or retiring a formerly customizable pack surface
    retire: [],      // {rel, why}  — exact obsolete pack-owned surface
    warnRemoved: [], // {rel}       — local file no longer in source pack
    unchanged: [],   // {rel}
  };

  const differs = (rel) => {
    const a = readContainedFile(sourceRoot, rel, { label: `source ${rel}` });
    const b = readContainedFile(target, rel, { label: `local ${rel}` });
    return !a.equals(b);
  };
  const existsLocal = (rel) => inspectContained(target, rel, { allowMissing: true, label: `local ${rel}` }).exists;

  function classifyAFile(rel) {
    if (!existsLocal(rel)) { plan.copyNew.push({ rel, why: 'pack-owned, missing locally' }); return; }
    if (differs(rel)) {
      if (!isInstall && needsCompatibilityBackup(rel)) {
        plan.backup.push({ rel, backupRel: backupRelativePath(localVersion, sourceVersion, rel), why: 'preserve pre-upgrade customization before version-locked replacement' });
      }
      plan.replace.push({ rel, why: 'pack-owned, content drift' });
    }
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

  // Classify only active profile files. Inactive profiles are retained in
  // verified local bundles and can be enabled later without network access.
  for (const rel of sourceFiles) {
    if (!activeProfileSet.has(profileForPath(rel, profileConfig))) continue;
    const installedRecord = previousInstallState?.managedFiles?.[rel];
    const localDigest = existsLocal(rel) ? targetFileDigest(target, rel) : null;
    const protectedInstalledCollision = !isInstall
      && !force
      && previousInstallState
      && existsLocal(rel)
      && differs(rel)
      && (!installedRecord || installedRecord.sha256 !== localDigest);
    if ((isInstall || protectedInstalledCollision) && existsLocal(rel) && differs(rel)) {
      const versionSlug = String(sourceVersion).replace(/[^A-Za-z0-9._-]/g, '-');
      plan.conflict.push({
        rel,
        incomingRel: `.corpus-pack/incoming/${versionSlug}/${rel}`,
        why: isInstall
          ? 'pre-existing project file preserved; incoming pack version staged for review'
          : 'unowned or locally modified file preserved; incoming pack version staged for review',
      });
      const incoming = inspectContained(target, plan.conflict.at(-1).incomingRel, { allowMissing: true, label: `incoming ${rel}` });
      if (incoming.exists) {
        const proposed = readContainedFile(sourceRoot, rel, { label: `incoming source ${rel}` });
        const staged = readContainedFile(target, plan.conflict.at(-1).incomingRel, { label: `incoming ${rel}` });
        if (!proposed.equals(staged)) throw new Error(`Refusing to overwrite a different staged incoming file: ${plan.conflict.at(-1).incomingRel}`);
      }
      continue;
    }
    if (isAgent(rel)) classifyAgentFile(rel);
    else if (isBucketA(rel)) classifyAFile(rel);
    else classifyBFile(rel);
  }

  // Locally-present files removed from the source pack (only meaningful under
  // pack-owned / agent prefixes; under doc/ a "removed" file is corpus content).
  const localUnderManaged = [];
  for (const p of [...BUCKET_A_PREFIXES, ...AGENT_PREFIXES]) {
    const local = inspectContained(target, p.replace(/\/$/, ''), { allowMissing: true, label: `managed prefix ${p}` });
    if (local.exists) {
      if (!local.stat.isDirectory()) throw new Error(`managed prefix must be a directory: ${p}`);
      localUnderManaged.push(...walk(local.absolute).map((f) => toPosix(path.relative(target, f))));
    }
  }
  for (const rel of localUnderManaged) {
    if (sourceSet.has(rel)) continue;
    if (RETIRED_PACK_FILES.has(rel)) {
      if (isInstall) {
        plan.warnRemoved.push({ rel, why: 'pre-existing path resembles a retired pack file; preserved on first install' });
      } else {
        plan.backup.push({
          rel,
          backupRel: backupRelativePath(localVersion, sourceVersion, rel),
          why: 'preserve exact pre-upgrade bytes before reviewed retirement',
        });
        plan.retire.push({ rel, why: RETIRED_PACK_FILES.get(rel) });
      }
    }
    else plan.warnRemoved.push({ rel });
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
  log(`  Profiles: ${activeProfiles.join(', ')} (${isInstall ? 'core is the fresh-install default' : 'preserved/detected from the existing installation'})`);

  header(`Replace (bucket A — pack-owned): ${plan.replace.length}`); row(plan.replace);
  header(`New files (missing locally): ${plan.copyNew.length}`); row(plan.copyNew);
  header(`Deferred to Corpus migration: ${plan.defer.length}`); row(plan.defer);
  header(`Agents modified locally (confirm before overwrite${force ? ' — forced' : ''}): ${plan.confirm.length}`); row(plan.confirm);
  header(`Protected conflicts preserved: ${plan.conflict.length}`); row(plan.conflict.map((item) => ({ rel: `${item.rel} -> ${item.incomingRel}`, why: item.why })));
  header(`Preserve (bucket B — local content differs, NOT touched): ${plan.preserve.length}`); row(plan.preserve);
  header(`Compatibility backups before replacement or retirement: ${plan.backup.length}`); row(plan.backup.map((item) => ({ rel: `${item.rel} -> ${item.backupRel}`, why: item.why })));
  header(`Retire (exact obsolete pack surfaces): ${plan.retire.length}`); row(plan.retire);
  header(`Locally present, removed in source (review): ${plan.warnRemoved.length}`); row(plan.warnRemoved);
  header(`Unchanged: ${plan.unchanged.length}`);

  // --------------------------------------------------------------------------
  // Apply.

  const changed = [];
  const keptAgents = [];
  if (apply) {
    if (isInstall) {
      for (const rel of [
        '.corpus-pack/install-state.json',
        '.corpus-pack/manifest.json',
        '.corpus-pack/bundles/sources.bundle.json.gz',
        '.corpus-pack/bundles/factory.bundle.json.gz',
      ]) {
        if (inspectContained(target, rel, { allowMissing: true, label: `pack metadata ${rel}` }).exists) {
          throw new Error(`Refusing first install because reserved pack metadata already exists: ${rel}`);
        }
      }
    }
    for (const it of plan.conflict) {
      const source = inspectContained(sourceRoot, it.rel, { label: `incoming source ${it.rel}` });
      const bytes = readContainedFile(sourceRoot, it.rel, { label: `incoming source ${it.rel}` });
      writeContainedFile(target, it.incomingRel, bytes, source.stat.mode, { refuseDifferentExisting: true });
      changed.push(it.incomingRel);
    }
    for (const it of plan.backup) {
      const source = inspectContained(target, it.rel, { label: `backup source ${it.rel}` });
      if (!source.stat.isFile()) throw new Error(`backup source ${it.rel} must be a regular file`);
      const bytes = readContainedFile(target, it.rel, { label: `backup source ${it.rel}` });
      const created = writeContainedFile(target, it.backupRel, bytes, source.stat.mode, { refuseDifferentExisting: true });
      if (created) changed.push(it.backupRel);
    }
    for (const it of plan.replace.concat(plan.copyNew)) {
      copyContainedFile(sourceRoot, target, it.rel);
      changed.push(it.rel);
    }

    if (plan.confirm.length && !force && !process.stdin.isTTY) {
      log(`\n${plan.confirm.length} locally-modified agent(s) preserved (non-interactive run; re-run on a TTY or pass --force to overwrite).`);
    }
    for (const it of plan.confirm) {
      const overwrite = force
        ? true
        : await confirmPrompt(`Overwrite locally-modified agent '${it.rel}'? Local changes will be lost.`);
      if (overwrite) { copyContainedFile(sourceRoot, target, it.rel); changed.push(it.rel); }
      else keptAgents.push(it.rel);
    }
    for (const it of plan.retire) {
      unlinkContainedFile(target, it.rel);
      changed.push(it.rel);
    }

    writeOfflineBundles({ sourceRoot, target, sourceFiles, config: profileConfig, version: sourceVersion });
    changed.push('.corpus-pack/manifest.json', '.corpus-pack/bundles/sources.bundle.json.gz', '.corpus-pack/bundles/factory.bundle.json.gz');

    const managedFiles = {};
    for (const rel of sourceFiles) {
      const profile = profileForPath(rel, profileConfig);
      if (!activeProfileSet.has(profile)) continue;
      const sourceDigest = targetFileDigest(sourceRoot, rel);
      if (sourceDigest && targetFileDigest(target, rel) === sourceDigest) managedFiles[rel] = { profile, sha256: sourceDigest };
    }
    const packageJson = readSource('package.json');
    let repository = null;
    try {
      const parsed = packageJson ? JSON.parse(packageJson) : null;
      repository = typeof parsed?.repository === 'string' ? parsed.repository : parsed?.repository?.url || null;
    } catch {
      repository = null;
    }
    const unresolvedConflicts = [...new Set([
      ...(previousInstallState?.conflicts || []),
      ...plan.conflict.map((item) => item.rel),
      ...keptAgents,
    ])].filter((rel) => !managedFiles[rel]).sort();
    const conflictedProfiles = new Set(plan.conflict.map((item) => profileForPath(item.rel, profileConfig)));
    for (const rel of keptAgents) conflictedProfiles.add(profileForPath(rel, profileConfig));
    const pendingProfiles = new Set(previousInstallState?.pendingProfiles || []);
    for (const profile of activeProfiles) {
      if (conflictedProfiles.has(profile)) pendingProfiles.add(profile);
      else pendingProfiles.delete(profile);
    }
    const installedActiveProfiles = activeProfiles.filter((profile) => profile === 'core' || !conflictedProfiles.has(profile));
    writeInstallState(target, {
      schemaVersion: 1,
      packVersion: sourceVersion,
      source: {
        version: sourceVersion,
        repository,
        treeSha256: sourceTreeDigest(sourceRoot, sourceFiles),
      },
      activeProfiles: installedActiveProfiles,
      pendingProfiles: PROFILE_ORDER.filter((profile) => pendingProfiles.has(profile)),
      managedFiles,
      conflicts: unresolvedConflicts,
    });
    changed.push('.corpus-pack/install-state.json');
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

  return { changed, kept: keptAgents, plan, sourceVersion, localVersion, isInstall, activeProfiles };
}
