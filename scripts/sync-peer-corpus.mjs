#!/usr/bin/env node

// Deterministic retrieval + freshness for ONE remote peer corpus (the git
// transport of skill `sources/peer-corpus-access`).
//
// What it does:
//   - Sparse + shallow + partial clone of a peer's corpus SURFACE (e.g. doc/)
//     into .corpus-cache/<name>/ — never the app source, never the whole repo.
//   - On a present cache, a SHA-gated INCREMENTAL refresh: fetch shallow,
//     compare HEAD vs the fetched ref, advance only on change, and report the
//     changed-file list. Unchanged peer => near-free no-op (no re-clone).
//   - Ensures .corpus-cache/ is gitignored.
//
// What it does NOT do (by design):
//   - The GitHub MCP transport. MCP tools are only available to the in-session
//     agent, not to a child process. This script owns the git path; the agent
//     owns the MCP path (targeted reads / delta fetch via compare).
//   - Write back to doc/_meta/app-profile.yaml. It REPORTS the new SHA and
//     timestamp in its JSON output; the agent persists last_synced_sha /
//     last_synced_at so there is a single writer of that file.
//
// Usage:
//   node scripts/sync-peer-corpus.mjs --name <slug> --url <git-url> \
//        [--ref <branch|tag>] [--surface <path>] [--cache-root <dir>] [--json]
//
// Output (always JSON-serializable; pretty unless --json):
//   { name, status, cache_path, ref, before_sha, after_sha, initial,
//     changed_files, synced_at, gitignore_updated, error }
//   status: cloned | updated | unchanged | error
//
// Exit code: 0 on cloned|updated|unchanged, 1 on error. A non-zero exit is the
// signal for the agent to fall back to the GitHub MCP transport.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function git(args, cwd = root) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ensureGitignore() {
  const giAbs = path.join(root, '.gitignore');
  const needle = '.corpus-cache/';
  let current = '';
  if (fs.existsSync(giAbs)) current = fs.readFileSync(giAbs, 'utf8');
  if (current.split(/\r?\n/).some((l) => l.trim() === needle || l.trim() === '.corpus-cache')) {
    return false;
  }
  const sep = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(giAbs, `${current}${sep}${needle}\n`);
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  const result = {
    name: args.name || null,
    status: 'error',
    cache_path: null,
    ref: args.ref || null,
    before_sha: null,
    after_sha: null,
    initial: false,
    changed_files: [],
    synced_at: null,
    gitignore_updated: false,
    error: null,
  };

  try {
    if (!args.name) throw new Error('missing --name <peer-slug>');
    const cacheRoot = typeof args['cache-root'] === 'string' ? args['cache-root'] : '.corpus-cache';
    const surface = typeof args.surface === 'string' ? args.surface : 'doc';
    const cacheRel = path.join(cacheRoot, args.name);
    const cacheAbs = path.join(root, cacheRel);
    result.cache_path = cacheRel;

    result.gitignore_updated = ensureGitignore();
    fs.mkdirSync(path.join(root, cacheRoot), { recursive: true });

    const hasCache = fs.existsSync(path.join(cacheAbs, '.git'));

    if (!hasCache) {
      if (!args.url || args.url === true) throw new Error('cache absent and no --url provided to clone');
      const cloneArgs = ['clone', '--depth', '1', '--filter=blob:none', '--sparse'];
      if (typeof args.ref === 'string') cloneArgs.push('--branch', args.ref);
      cloneArgs.push(args.url, cacheRel);
      git(cloneArgs);
      git(['-C', cacheRel, 'sparse-checkout', 'set', surface]);
      result.ref = typeof args.ref === 'string' ? args.ref : git(['-C', cacheRel, 'rev-parse', '--abbrev-ref', 'HEAD']);
      result.after_sha = git(['-C', cacheRel, 'rev-parse', 'HEAD']);
      result.initial = true;
      result.status = 'cloned';
    } else {
      // Make sure the sparse scope still matches the requested surface.
      try { git(['-C', cacheRel, 'sparse-checkout', 'set', surface]); } catch { /* non-fatal */ }
      const ref = typeof args.ref === 'string' ? args.ref : git(['-C', cacheRel, 'rev-parse', '--abbrev-ref', 'HEAD']);
      result.ref = ref;
      const before = git(['-C', cacheRel, 'rev-parse', 'HEAD']);
      result.before_sha = before;
      git(['-C', cacheRel, 'fetch', '--depth', '1', 'origin', ref]);
      const after = git(['-C', cacheRel, 'rev-parse', 'FETCH_HEAD']);
      result.after_sha = after;
      if (before === after) {
        result.status = 'unchanged';
      } else {
        const diff = git(['-C', cacheRel, 'diff', '--name-only', before, after, '--', surface]);
        result.changed_files = diff ? diff.split(/\r?\n/).filter(Boolean) : [];
        git(['-C', cacheRel, 'reset', '--hard', after]);
        result.status = 'updated';
      }
    }

    result.synced_at = new Date().toISOString();
    emit(result, args.json);
    process.exit(0);
  } catch (err) {
    result.status = 'error';
    result.error = err && err.message ? err.message : String(err);
    // git stderr is often the useful part:
    if (err && err.stderr) result.error += ` :: ${String(err.stderr).trim()}`;
    emit(result, args.json);
    process.exit(1);
  }
}

function emit(result, jsonMode) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
  const lines = [
    `peer:     ${result.name}`,
    `status:   ${result.status}`,
    `cache:    ${result.cache_path}`,
    `ref:      ${result.ref}`,
  ];
  if (result.status === 'updated') {
    lines.push(`diff:     ${result.before_sha?.slice(0, 8)} -> ${result.after_sha?.slice(0, 8)} (${result.changed_files.length} changed under surface)`);
    for (const f of result.changed_files.slice(0, 20)) lines.push(`  ~ ${f}`);
    if (result.changed_files.length > 20) lines.push(`  … +${result.changed_files.length - 20} more`);
  } else if (result.status === 'cloned') {
    lines.push(`head:     ${result.after_sha?.slice(0, 8)} (initial sparse clone)`);
  } else if (result.status === 'unchanged') {
    lines.push(`head:     ${result.after_sha?.slice(0, 8)} (already up to date)`);
  } else if (result.status === 'error') {
    lines.push(`error:    ${result.error}`);
  }
  if (result.gitignore_updated) lines.push(`note:     added .corpus-cache/ to .gitignore`);
  process.stdout.write(lines.join('\n') + '\n');
}

main();
