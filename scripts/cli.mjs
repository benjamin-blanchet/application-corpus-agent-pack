#!/usr/bin/env node

// `corpus-pack` — the npx entrypoint for installing/upgrading the pack.
//
// Run directly from GitHub, no install, no zip:
//   npx github:benjamin-blanchet/application-corpus-agent-pack sync            # dry-run preview
//   npx github:benjamin-blanchet/application-corpus-agent-pack sync --apply    # install or upgrade
//   npx github:benjamin-blanchet/application-corpus-agent-pack#v1.3.0 sync --apply   # pinned version
//
// npx clones the pack into a temp dir and runs this bin with cwd = the repo
// you invoked it from. So the source pack is this package's own tree, and the
// target is the caller's working directory. Install and upgrade are the same
// code path (install = everything is "missing locally").

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpgrade } from './lib/upgrade-core.mjs';
import {
  enableOfflineProfile,
  loadProfileConfig,
  PROFILE_ORDER,
  profileStatus,
} from './lib/profile-bundles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..'); // the npx-cloned package root
const target = process.cwd();                // the consumer repo

const args = process.argv.slice(2);
const command = args[0]?.startsWith('-') ? 'sync' : (args[0] || 'sync');
const apply = args.includes('--apply');
const force = args.includes('--force') || args.includes('--yes');

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (!['sync', 'profile'].includes(command)) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
}

try {
  if (command === 'profile') {
    await runProfileCommand(args.slice(1));
  } else {
    if (path.resolve(sourceRoot) === path.resolve(target)) {
      throw new Error('source and target are the same directory; run sync from the application repository');
    }
    await runUpgrade({ sourceRoot, target, apply, force, profiles: profileArguments(args) });
  }
} catch (err) {
  console.error(`corpus-pack ${command} failed: ${err.message}`);
  process.exitCode = 1;
}

function profileArguments(values) {
  const profiles = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--profile') {
      const name = values[index + 1];
      if (!name || name.startsWith('--')) throw new Error('--profile requires a profile name');
      profiles.push(name);
      index += 1;
    } else if (value.startsWith('--profile=')) profiles.push(value.slice('--profile='.length));
  }
  return profiles.length ? profiles : null;
}

async function runProfileCommand(values) {
  const action = values.find((value) => !value.startsWith('--')) || 'list';
  if (action === 'list') {
    const config = loadProfileConfig(sourceRoot);
    for (const name of PROFILE_ORDER) {
      const definition = config.profiles[name];
      console.log(`${name}${name === 'core' ? ' (default)' : ''} — ${definition.description}`);
    }
    return;
  }
  if (action === 'status') {
    for (const item of profileStatus(target)) {
      const state = item.pending ? 'pending review' : item.active ? 'active' : 'inactive';
      console.log(`${item.name}: ${state} · ${item.bundled ? 'available offline' : 'bundle missing'} · ${item.files} files`);
    }
    return;
  }
  if (action === 'enable') {
    const actionIndex = values.indexOf(action);
    const profile = values.slice(actionIndex + 1).find((value) => !value.startsWith('--'));
    if (!profile) throw new Error('profile enable requires a profile name');
    const result = enableOfflineProfile({ target, profile, apply });
    console.log(`Profile ${profile} · ${apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`  New files: ${result.plan.copyNew.length}`);
    console.log(`  Existing identical files: ${result.plan.unchanged.length}`);
    console.log(`  Conflicts preserved: ${result.plan.conflicts.length}`);
    if (result.plan.conflicts.length) {
      console.log('  Incoming versions were/will be staged under .corpus-pack/incoming/.');
    }
    if (!apply) console.log('No files were written; re-run with --apply.');
    else if (result.plan.conflicts.length) {
      console.log(`Profile '${profile}' is pending review. Merge or accept the staged incoming files, then re-run this command.`);
    } else console.log(`Profile '${profile}' enabled from the local offline bundle.`);
    return;
  }
  throw new Error(`unknown profile action: ${action}`);
}

function printHelp() {
  console.log(`corpus-pack — install or upgrade the Application Corpus Agent Pack

Usage:
  npx github:benjamin-blanchet/application-corpus-agent-pack sync [--profile <name>] [--apply] [--force]
  node scripts/cli.mjs profile list
  node scripts/cli.mjs profile status
  node scripts/cli.mjs profile enable <sources|factory> [--apply]

Commands:
  sync            Install (if absent) or upgrade the pack in the current repo.
  profile list    List the available profiles.
  profile status  Show active profiles and offline bundle availability.
  profile enable  Enable a profile from its verified local bundle (no network).

Options:
  --apply         Write changes. Without it, runs a dry-run preview.
  --profile       Activate a profile during sync. May be repeated; core is implicit.
  --force         Overwrite locally-modified managed files during an upgrade.
  -h, --help      Show this help.

Guarantees: application corpus content under doc/ is preserved. The reusable
doc/spec/template/** scaffold and doc/_meta/factory-learning.yaml are versioned
pack surfaces; divergent pre-upgrade bytes are backed up under
.corpus-pack-backups/ before replacement or reviewed retirement. On first
install, every different pre-existing file is preserved and the pack version
is staged under .corpus-pack/incoming/, even with --force. Later local drift is
also preserved unless --force is explicit. Inactive profiles remain available
as verified local bundles; normal profile activation needs no network.`);
}
