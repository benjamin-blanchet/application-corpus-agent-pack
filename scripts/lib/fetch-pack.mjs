// Fetch a fresh pack tree from GitHub into a temporary directory, so the
// committed update script can self-acquire its source instead of requiring a
// manually-downloaded zip. Uses a shallow `git clone` (no full history) — git
// is universally available in dev environments, and the repo is public so no
// auth is needed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DEFAULT_SLUG = 'benjamin-blanchet/application-corpus-agent-pack';

/**
 * Shallow-clone the pack repo at `ref` (tag/branch/sha, default branch when
 * omitted) into a temp dir. Returns { dir, cleanup }.
 * @param {object} [o]
 * @param {string} [o.ref]   git ref to check out (tag/branch). Omit for default branch.
 * @param {string} [o.slug]  owner/repo. Defaults to the canonical pack repo.
 */
export function fetchPackFromGitHub({ ref, slug = DEFAULT_SLUG } = {}) {
  const url = `https://github.com/${slug}.git`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-pack-'));
  const cloneArgs = ['clone', '--depth', '1'];
  if (ref) cloneArgs.push('--branch', ref);
  cloneArgs.push(url, dir);

  try {
    execFileSync('git', cloneArgs, { stdio: ['ignore', 'ignore', 'inherit'] });
  } catch (err) {
    cleanupDir(dir);
    const hint = ref
      ? `Could not clone ${slug} at ref '${ref}'. Does the tag/branch exist?`
      : `Could not clone ${slug}. Is git installed and the network reachable?`;
    throw new Error(hint);
  }

  // Drop the .git dir — we only need the working tree as a pack source.
  cleanupDir(path.join(dir, '.git'));

  return { dir, cleanup: () => cleanupDir(dir) };
}

function cleanupDir(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best effort */ }
}
