#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJsonPretty } from './lib/factory-v3/canonical-json.mjs';
import { migrateV1Package } from './lib/factory-v3/legacy-v1.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const target = process.argv.slice(2).find((arg) => !arg.startsWith('--'));

if (!target || process.argv.includes('--help')) {
  process.stderr.write('Usage: node scripts/migrate-factory-v1-to-v3.mjs <package-dir> [--apply] [--json]\n');
  process.stderr.write('Default is a read-only dry-run. --apply preserves V1 files and creates doc/spec/.../factory/*.v3.* only.\n');
  process.exit(process.argv.includes('--help') ? 0 : 1);
}

try {
  const result = migrateV1Package({ repoRoot, packageDir: path.resolve(repoRoot, target), apply: process.argv.includes('--apply') });
  process.stdout.write(canonicalJsonPretty({ applied: result.applied, report: result.report, plan: result.plan, derived_state: result.state }));
} catch (error) {
  process.stderr.write(canonicalJsonPretty({ error: { code: error.code || 'factory-migration-error', message: error.message, details: error.details || {} } }));
  process.exitCode = 1;
}
