#!/usr/bin/env node

// Update the corpus pack in-place from a newer pack source.
//
// Usage (from the consumer repo root):
//   node scripts/update-pack.mjs <source-pack-dir> [--apply] [--force]
//   node scripts/update-pack.mjs --from-github[=<ref>] [--apply] [--force]
//
// Default mode is read-only and previews what would change. Pass --apply to
// copy files. Durable state and reports belong to the later Corpus migration.
//
//   <source-pack-dir>   path to a fresh checkout/download of the pack tree.
//   --from-github[=ref] fetch the pack from GitHub (shallow clone) instead of
//                       a local path. Optional ref pins a tag/branch
//                       (e.g. --from-github=v1.1.0); omit for the default branch.
//   --apply             write changes (default: dry-run preview).
//   --force             overwrite locally-modified agents without prompting.
//
// Safety guarantees (enforced by scripts/lib/upgrade-core.mjs):
//   - Application corpus content under `doc/**` is preserved. The reusable
//     spec template and pack learning ledger are versioned; divergent previous
//     bytes are backed up before replacement or exact reviewed retirement.
//   - A locally-modified `.github/agents/**` file is never overwritten without
//     confirmation (TTY prompt; non-interactive preserves and flags it).

import path from 'node:path';
import { runUpgrade } from './lib/upgrade-core.mjs';
import { fetchPackFromGitHub } from './lib/fetch-pack.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force') || args.includes('--yes');
const target = process.cwd();

const fromGithubArg = args.find((a) => a === '--from-github' || a.startsWith('--from-github='));
const sourceArg = args.find((a) => !a.startsWith('--'));

let sourceRoot;
let cleanup = () => {};

if (fromGithubArg) {
  const ref = fromGithubArg.includes('=') ? fromGithubArg.split('=')[1] : undefined;
  console.log(`Fetching pack from GitHub${ref ? ` @ ${ref}` : ' (default branch)'}…`);
  const fetched = fetchPackFromGitHub({ ref });
  sourceRoot = fetched.dir;
  cleanup = fetched.cleanup;
} else if (sourceArg) {
  sourceRoot = path.resolve(sourceArg);
} else {
  console.error('Usage: node scripts/update-pack.mjs <source-pack-dir> [--apply] [--force]');
  console.error('       node scripts/update-pack.mjs --from-github[=<ref>] [--apply] [--force]');
  process.exit(2);
}

try {
  await runUpgrade({ sourceRoot, target, apply, force });
} catch (err) {
  console.error(`Pack upgrade failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  cleanup();
}
