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
  'scripts/',          // all pack scripts (incl. scripts/lib/**) are pack-owned — replaced wholesale
  'schemas/',          // machine-readable contracts the validator enforces — pack-owned, not team data; refreshed so they never drift behind an updated validator
];

// `.github/agents/**` is the confirm bucket: operator-customizable.
const AGENT_PREFIXES = ['.github/agents/'];

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
  // No TTY (npx in CI, piped) → never overwrite; preserve and report.
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
  const isInstall = localVersion === '<missing>';

  const plan = {
    replace: [],     // {rel, why}  — pack-owned, content differs
    copyNew: [],     // {rel, why}  — file missing locally
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
    if (!existsLocal(rel)) { plan.copyNew.push({ rel, why: 'template, missing locally' }); return; }
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
  log(`  Source:  ${sourceRoot}  (version ${sourceVersion})`);
  log(`  Target:  ${target}  (version ${localVersion})`);

  header(`Replace (bucket A — pack-owned): ${plan.replace.length}`); row(plan.replace);
  header(`New files (missing locally): ${plan.copyNew.length}`); row(plan.copyNew);
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

    stampState(target, sourceVersion, localVersion);
  }

  // --------------------------------------------------------------------------
  // Report.

  const reportRel = `doc/_meta/pack-${isInstall ? 'install' : 'upgrade'}-${localVersion.replace(/\s.*/, '')}-to-${sourceVersion.replace(/\s.*/, '')}.md`;
  const reportText = buildReport({ plan, keptAgents, apply, sourceRoot, sourceVersion, localVersion, isInstall });

  if (apply) {
    const reportAbs = path.join(target, reportRel);
    fs.mkdirSync(path.dirname(reportAbs), { recursive: true });
    fs.writeFileSync(reportAbs, reportText);
    log(`\nReport written to ${reportRel}`);
    log(`Files changed: ${changed.length}`);
    log('Re-run `node scripts/validate-corpus.mjs` to confirm structural integrity.');
  } else {
    log('\n(dry-run — pass --apply to perform the change)');
    log(`Would write report to ${reportRel}`);
  }

  return { changed, kept: keptAgents, plan, sourceVersion, localVersion, isInstall };
}

// ----------------------------------------------------------------------------
// State stamping (corpus-state.yaml + changelog) — best-effort, regex-based.

function stampState(target, sourceVersion, localVersion) {
  const today = new Date().toISOString().slice(0, 10);

  const csRel = 'doc/_meta/corpus-state.yaml';
  const csAbs = path.join(target, csRel);
  if (fs.existsSync(csAbs)) {
    let cs = fs.readFileSync(csAbs, 'utf8');
    if (/^\s*pack_version:/m.test(cs)) cs = cs.replace(/^(\s*pack_version:\s*).*$/m, `$1'${sourceVersion}'`);
    else cs = cs.replace(/^(corpus:\s*\n)/, `$1  pack_version: '${sourceVersion}'\n`);
    if (/^\s*last_pack_upgrade:/m.test(cs)) cs = cs.replace(/^(\s*last_pack_upgrade:\s*).*$/m, `$1'${today}'`);
    else cs = cs.replace(/^(\s*pack_version:.*\n)/m, `$1  last_pack_upgrade: '${today}'\n`);
    fs.writeFileSync(csAbs, cs);
  }

  const chgRel = 'doc/_meta/corpus-changelog.md';
  const chgAbs = path.join(target, chgRel);
  if (fs.existsSync(chgAbs)) {
    let chg = fs.readFileSync(chgAbs, 'utf8');
    const line = `| ${today} | Pack upgrade ${localVersion} → ${sourceVersion} | scripts/update-pack.mjs | corpus |\n`;
    if (chg.includes('| Date | Change | Reason | Actor |')) chg = chg.replace(/(\|\s*Date\s*\|.*\n\|[-\s|]+\n)/, `$1${line}`);
    else chg = chg.trimEnd() + '\n' + line;
    fs.writeFileSync(chgAbs, chg);
  }
}

function buildReport({ plan, keptAgents, apply, sourceRoot, sourceVersion, localVersion, isInstall }) {
  const L = [];
  const list = (items, render) => { if (items.length) for (const it of items) L.push(render(it)); else L.push('- _none_'); };

  L.push('---', 'type: meta', 'status: active', 'confidence: confirmed', 'source: pack',
    `generated_at: ${new Date().toISOString()}`, '---', '');
  L.push(`# Pack ${isInstall ? 'install' : 'upgrade'} report`, '');
  L.push(`- From version: \`${localVersion}\``);
  L.push(`- To version:   \`${sourceVersion}\``);
  L.push(`- Source path:  \`${sourceRoot}\``);
  L.push(`- Mode:         ${apply ? 'apply' : 'dry-run'}`, '');

  L.push('## Replaced (pack-owned)');
  list(plan.replace, (it) => `- \`${it.rel}\``);
  L.push('');
  L.push('## Newly copied (was missing locally)');
  list(plan.copyNew, (it) => `- \`${it.rel}\``);
  L.push('');
  L.push('## Agents modified locally (never overwritten silently)', '');
  L.push(apply
    ? 'These agents differ from the incoming pack version. Overwrites only happened where you confirmed (or `--force` was passed); the rest were preserved.'
    : 'These agents differ from the incoming pack version. On `--apply` you will be asked per file before any overwrite (preserved by default).');
  L.push('');
  list(plan.confirm, (it) => {
    const fate = apply ? (keptAgents.includes(it.rel) ? ' — preserved' : ' — overwritten') : '';
    return `- \`${it.rel}\`${fate}`;
  });
  L.push('');
  L.push('## Preserved (template diverged from local, NOT touched)', '');
  L.push('Review these files manually if the new pack changed conventions (new fields, new columns, renamed keys). Compare against the source pack copy of the same file.', '');
  list(plan.preserve, (it) => `- \`${it.rel}\``);
  L.push('');
  L.push('## Locally present, removed from source', '');
  L.push('These exist in your repo but not in the new pack. They may be deprecated, renamed, or local customizations. The script did NOT delete them — review and remove manually if appropriate.', '');
  list(plan.warnRemoved, (it) => `- \`${it.rel}\``);
  L.push('');
  L.push('## Next steps', '');
  L.push('1. Run `node scripts/validate-corpus.mjs` — fix any P0/P1 finding introduced by the change.');
  L.push('2. Review the "Preserved" list above — check each file against the new template if the pack changelog mentions structural changes.');
  L.push('3. Review the "Removed from source" list — delete obsolete files only if you are sure they are not local customizations you want to keep.');
  L.push('4. If `corpus-state.yaml.pack_version` was bumped, commit with a clear message: `chore: pack upgrade <from> → <to>`.');
  L.push('');
  return L.join('\n');
}
