#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendEventFile } from './lib/factory-v3/event-log.mjs';
import { canonicalJsonPretty } from './lib/factory-v3/canonical-json.mjs';
import { loadFactoryPackage, validateEvidenceForState, validateFactoryPackageV3, writeDerivedState } from './lib/factory-v3/package-io.mjs';
import { reduceFactory } from './lib/factory-v3/reducer.mjs';
import { nextWave } from './lib/factory-v3/scheduler.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const [command, packageArg] = process.argv.slice(2);
const jsonMode = process.argv.includes('--json');

if (['-h', '--help'].includes(command)) usage(0);
if (!command || !packageArg) usage(1);
const packageDir = path.resolve(repoRoot, packageArg);

try {
  if (command === 'status') {
    const loaded = loadValidPackage(packageDir);
    emit(loaded.derived);
  } else if (command === 'validate') {
    const findings = validateFactoryPackageV3(packageDir);
    emit({ valid: findings.length === 0, findings });
    process.exitCode = findings.length ? 2 : 0;
  } else if (command === 'next-wave') {
    const loaded = loadValidPackage(packageDir);
    emit({ ready: nextWave(loaded.plan, loaded.derived) });
  } else if (command === 'append') {
    const input = readEventInput();
    const expected = option('--expected-seq');
    if (expected !== null) input.expected_previous_seq = Number(expected);
    if (!input.controller_id) throw coded('factory-cli-controller-required', 'event input requires controller_id');
    if (!input.subject) input.subject = { package: path.relative(repoRoot, packageDir).split(path.sep).join('/'), lot_id: null };
    const apply = process.argv.includes('--apply');

    // Validate the entire prospective history before taking the writer lock.
    const preview = appendEventFile({ repoRoot, packageDir, eventInput: input, apply: false });
    const loaded = loadFactoryPackage(packageDir);
    const previewState = reduceFactory({ plan: loaded.plan, events: preview.events, current: loaded.current });
    validateProspectiveArtifacts(preview.event, previewState, loaded, packageDir);
    if (!apply) {
      emit({ applied: false, event: preview.event, derived_state: previewState });
    } else {
      const result = appendEventFile({ repoRoot, packageDir, eventInput: input, apply: true });
      const refreshed = loadFactoryPackage(packageDir);
      writeDerivedState(refreshed.paths.state, refreshed.derived);
      emit({ applied: true, event: result.event, derived_state: refreshed.derived });
    }
  } else {
    usage(1, `unknown command: ${command}`);
  }
} catch (error) {
  emit({ error: { code: error.code || 'factory-cli-error', message: error.message, details: error.details || {} } });
  process.exitCode = 1;
}

function readEventInput() {
  const file = option('--event-file');
  const inline = option('--event-json');
  if (Boolean(file) === Boolean(inline)) throw coded('factory-cli-event-input', 'provide exactly one of --event-file or --event-json');
  return JSON.parse(file ? fs.readFileSync(path.resolve(process.cwd(), file), 'utf8') : inline);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function emit(value) {
  if (jsonMode || typeof value !== 'string') process.stdout.write(canonicalJsonPretty(value));
  else process.stdout.write(`${value}\n`);
}

function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function loadValidPackage(directory) {
  const findings = validateFactoryPackageV3(directory);
  if (findings.length) {
    const error = coded('factory-package-invalid', `factory package is invalid: ${findings[0].code}`);
    error.details = { findings };
    throw error;
  }
  return loadFactoryPackage(directory);
}

function validateProspectiveArtifacts(event, state, loaded, packageDir) {
  if (event.type !== 'evidence_committed') return;
  const { findings } = validateEvidenceForState({
    packageDir,
    plan: loaded.plan,
    state,
    event,
    environmentPath: loaded.environmentPath,
    repoRoot: loaded.repoRoot,
  });
  if (findings.length) {
    const error = coded(findings[0].code, findings[0].message);
    error.details = { findings };
    throw error;
  }
}

function usage(exitCode, message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('Usage: node scripts/factory-control.mjs <status|validate|next-wave|append> <package-dir> [--json]\n');
  process.stderr.write('Append is dry-run by default; mutation requires --apply and --event-file/--event-json.\n');
  process.exit(exitCode);
}
