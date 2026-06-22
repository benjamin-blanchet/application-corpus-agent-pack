#!/usr/bin/env node
// Make the corpus conformant with Open Knowledge Format (OKF) v0.1.
//
// Deterministic and ADDITIVE: emits reserved index.md listings, backfills the
// derivable OKF optional fields onto docs that already have frontmatter, stamps
// okf_version on the bundle-root index, and projects boundary.yaml -> boundary.md.
// It never rewrites corpus prose and never invents a `type`.
//
// Usage:
//   node scripts/build-okf-indexes.mjs            # apply, against ./doc
//   node scripts/build-okf-indexes.mjs --dry-run  # report only, write nothing
//   node scripts/build-okf-indexes.mjs --doc <path>   # custom bundle root
//   node scripts/build-okf-indexes.mjs --json     # machine-readable report
//
// Run automatically at corpus-bootstrap close (new packs) and by the
// governance/pack-upgrade skill (existing corpora).

import path from 'node:path';
import { buildOkf, summarizeReport, OKF_VERSION } from './lib/okf.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const jsonMode = argv.includes('--json');
const docArgIdx = argv.indexOf('--doc');
const docRoot = path.resolve(docArgIdx !== -1 ? argv[docArgIdx + 1] : path.join(process.cwd(), 'doc'));

let report;
try {
  report = buildOkf({ docRoot, dryRun });
} catch (err) {
  console.error(`OKF build failed: ${err.message}`);
  process.exit(2);
}

if (jsonMode) {
  console.log(JSON.stringify({ okf_version: OKF_VERSION, dryRun, docRoot, report }, null, 2));
} else {
  console.log(`OKF v${OKF_VERSION} conformance${dryRun ? ' (dry-run)' : ''} — ${docRoot}`);
  console.log(summarizeReport(report));
  const handwritten = report.indexes.filter((r) => r.status.startsWith('skipped'));
  if (handwritten.length) {
    console.log(`\nHand-authored files left untouched (no generated marker):`);
    for (const r of handwritten) console.log(`  - ${r.file} (${r.status})`);
  }
}
