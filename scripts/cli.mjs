#!/usr/bin/env node

// `corpus-pack` — the npx entrypoint for installing/upgrading the pack.
//
// Run directly from GitHub, no install, no zip:
//   npx github:benjamin-blanchet/application-corpus-agent-pack sync            # dry-run preview
//   npx github:benjamin-blanchet/application-corpus-agent-pack sync --apply    # install or upgrade
//   npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --apply   # pinned version
//
// npx clones the pack into a temp dir and runs this bin with cwd = the repo
// you invoked it from. So the source pack is this package's own tree, and the
// target is the caller's working directory. Install and upgrade are the same
// code path (install = everything is "missing locally").

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpgrade } from './lib/upgrade-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..'); // the npx-cloned package root
const target = process.cwd();                // the consumer repo

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) || 'sync';
const apply = args.includes('--apply');
const force = args.includes('--force') || args.includes('--yes');

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (command !== 'sync') {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
}

if (path.resolve(sourceRoot) === path.resolve(target)) {
  console.error('Refusing to run: source and target are the same directory.');
  console.error('Run this from inside the application repository you want to install the pack into.');
  process.exit(2);
}

try {
  await runUpgrade({ sourceRoot, target, apply, force });
} catch (err) {
  console.error(`corpus-pack sync failed: ${err.message}`);
  process.exitCode = 1;
}

function printHelp() {
  console.log(`corpus-pack — install or upgrade the Application Corpus Agent Pack

Usage:
  npx github:benjamin-blanchet/application-corpus-agent-pack sync [--apply] [--force]

Commands:
  sync            Install (if absent) or upgrade the pack in the current repo.

Options:
  --apply         Write changes. Without it, runs a dry-run preview.
  --force         Overwrite locally-modified agents without prompting.
  -h, --help      Show this help.

Guarantees: doc/ is never overwritten; locally-modified agents are never
overwritten without confirmation.`);
}
