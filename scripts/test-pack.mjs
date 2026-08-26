#!/usr/bin/env node
//
// Fixture-based regression tests for the pack's own tooling.
//
// Every case here exists because a real corpus broke on it. A fixture is a
// throwaway minimal corpus built in a temp directory, run through
// validate-corpus.mjs, and asserted on the *codes* it produces — never on
// totals, so unrelated findings in the skeleton do not make tests brittle.
//
// Fixtures are built at runtime rather than committed, so that CRLF cases
// survive git's line-ending normalisation on any platform.
//
// Usage:
//   node scripts/test-pack.mjs            run every case
//   node scripts/test-pack.mjs --only crlf  run cases whose name matches
//
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(here, 'validate-corpus.mjs');
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i === -1 ? null : process.argv[i + 1];
})();

// ---------------------------------------------------------------------------
// Minimal corpus skeleton shared by every fixture.

const FEATURE_DOCS = ['ARCHITECTURE.md', 'WORKFLOWS.md', 'BUSINESS_RULES.md', 'OPERATIONS.md', 'AI_AGENT_GUIDE.md'];

function skeleton({ featureStatus = 'documented', evidenceFiles = [], readmeBody = '' } = {}) {
  const files = {
    'doc/README.md': fm('corpus-entrypoint') + '# Corpus\n',
    'doc/CORPUS_MAP.md': fm('corpus-map') + '# Map\n',
    'doc/CORPUS_MANIFEST.md': fm('corpus-manifest') + '# Manifest\n',
    'doc/_meta/feature-candidates.yaml': 'candidates:\n  - slug: demo\n    status: documented\n',
    'doc/_meta/code-pipeline-state.yaml':
      'pipeline:\n  overall_status: covered\n  p4_feature_silo_deep_dive:\n    status: covered\n',
    'doc/project/features/demo/README.md': fm('feature', { status: featureStatus }) + '# Demo\n' + readmeBody,
    'doc/project/features/demo/_evidence.yaml':
      'p4_pass: covered\ninterview:\n  skipped: true\n  reason: "fixture"\nfiles_read_in_silo:\n' +
      evidenceFiles.map((f) => `  - "${f}"\n`).join(''),
  };
  for (const doc of FEATURE_DOCS) {
    files[`doc/project/features/demo/${doc}`] = fm('feature') + '# Demo\n\n```mermaid\ngraph TD;\nA-->B;\n```\n';
  }
  return files;
}

function fm(type, extra = {}) {
  const lines = ['---', `type: ${type}`, 'status: active', 'confidence: confirmed', 'source: code'];
  for (const [k, v] of Object.entries(extra)) {
    const idx = lines.findIndex((l) => l.startsWith(`${k}:`));
    if (idx === -1) lines.push(`${k}: ${v}`);
    else lines[idx] = `${k}: ${v}`;
  }
  lines.push('---', '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Cases.

const CASES = [
  {
    name: 'crlf-frontmatter-is-readable',
    why: 'A corpus authored on Windows is CRLF throughout. Reading it as if it were LF made frontmatter invisible, which both produced hundreds of false findings and silently disabled every check gated on a frontmatter field.',
    files: skeleton({ evidenceFiles: ['src/main/java/Demo.java'] }),
    crlf: true,
    forbid: ['okf-missing-frontmatter', 'okf-missing-type', 'missing-frontmatter'],
  },
  {
    name: 'crlf-does-not-disable-quality-checks',
    why: 'The P4 quality block is gated on `status: documented`. With unreadable frontmatter it never ran, so a broken silo passed silently.',
    files: skeleton({ evidenceFiles: ['doc/project/features/demo/ARCHITECTURE.md'] }),
    crlf: true,
    expect: ['p4-feature-evidence-self-referential'],
  },
  {
    name: 'evidence-must-cite-the-analysed-source',
    why: 'A silo whose only evidence is the corpus files it produced proves nothing and cannot be re-verified when the code moves.',
    files: skeleton({ evidenceFiles: ['doc/project/features/demo/ARCHITECTURE.md', 'doc/project/features/demo/OPERATIONS.md'] }),
    expect: ['p4-feature-evidence-self-referential'],
  },
  {
    name: 'evidence-citing-source-passes',
    why: 'The guard must not fire when at least one cited path is outside doc/.',
    files: skeleton({ evidenceFiles: ['doc/project/features/demo/ARCHITECTURE.md', 'src/main/java/Demo.java'] }),
    forbid: ['p4-feature-evidence-self-referential'],
  },
  {
    name: 'code-evidence-section-required',
    why: 'A documented silo must say where in the analysed system its claims come from. The genesis corpus carried 62 path:line citations; the first corpus produced without this contract carried none.',
    files: skeleton({ evidenceFiles: ['src/main/java/Demo.java'] }),
    expect: ['p4-feature-no-code-evidence-section'],
  },
  {
    name: 'code-evidence-must-be-located',
    why: 'A bare filename is an assertion. A line number is what a later pass can re-open and check.',
    files: skeleton({
      evidenceFiles: ['src/main/java/Demo.java'],
      readmeBody: '\n## Code Evidence\n\n| Element | Symbol | Location | Notes |\n|---|---|---|---|\n| entry | `Demo` | `src/main/java/Demo.java` | starts it |\n',
    }),
    expect: ['p4-feature-code-evidence-unlocated'],
    forbid: ['p4-feature-no-code-evidence-section'],
  },
  {
    name: 'located-code-evidence-passes',
    files: skeleton({
      evidenceFiles: ['src/main/java/Demo.java'],
      readmeBody: '\n## Code Evidence\n\n| Element | Symbol | Location | Notes |\n|---|---|---|---|\n| entry | `Demo` | `src/main/java/Demo.java:29` | starts it |\n',
    }),
    forbid: ['p4-feature-no-code-evidence-section', 'p4-feature-code-evidence-unlocated'],
  },
  {
    name: 'CONTROL-bug-absent-from-local-catalog-is-caught',
    why: 'Without a positive control, deleting checkIndexes() entirely leaves the suite green — verified: it did. A forbid-only case cannot tell "the check works" from "the check is gone".',
    files: {
      ...skeleton({ evidenceFiles: ['src/Demo.java'] }),
      'doc/_indexes/by-bug.md': fm('index') + '| Bug | Canonical file |\n|---|---|\n| BUG-001 | [x](../prod/known-bugs/BUG-001-demo.md) |\n',
      'doc/prod/known-bugs/BUG-001-demo.md': fm('known-bug') + '# BUG-001\n',
      'doc/prod/known-bugs/INDEX.md': fm('index') + '| Bug |\n|---|\n| (empty) |\n',
    },
    expect: ['bug-missing-from-local-index'],
  },
  {
    name: 'CONTROL-misnamed-prod-knowledge-is-caught',
    why: 'Same gap on checkProductionKnowledge.',
    files: {
      ...skeleton({ evidenceFiles: ['src/Demo.java'] }),
      'doc/prod/known-bugs/notes-about-a-bug.md': fm('known-bug') + '# notes\n',
    },
    expect: ['nonstandard-prod-knowledge-name'],
  },
  {
    name: 'CONTROL-generated-listing-is-not-prod-knowledge',
    why: 'OKF writes index.md into every zone. It is machine output, so corpus naming conventions must not apply to it.',
    files: {
      ...skeleton({ evidenceFiles: ['src/Demo.java'] }),
      'doc/prod/known-bugs/index.md': fm('index') + '# listing\n',
    },
    forbid: ['nonstandard-prod-knowledge-name'],
  },
  {
    name: 'CONTROL-a-P0-produces-exit-1',
    why: 'CI gates on the exit code. Nothing asserted it tracked P0 findings.',
    files: skeleton({ evidenceFiles: ['doc/project/features/demo/ARCHITECTURE.md'] }),
    expect: ['p4-feature-evidence-self-referential'],
    exit: 1,
  },
  {
    name: 'bom-does-not-hide-frontmatter',
    why: 'A Windows editor ships a BOM alongside CRLF. It defeated startsWith(\'---\') exactly the way CRLF did, reproducing both halves of the bug this branch opened by fixing.',
    files: skeleton({ evidenceFiles: ['src/Demo.java'] }),
    bom: true,
    crlf: true,
    forbid: ['okf-missing-frontmatter', 'missing-frontmatter'],
  },
  {
    name: 'empty-evidence-still-caught',
    why: 'The pre-existing emptiness guard must survive the new content guard.',
    files: skeleton({ evidenceFiles: [] }),
    expect: ['p4-feature-no-silo-files-read'],
    forbid: ['p4-feature-evidence-self-referential'],
  },
];

// ---------------------------------------------------------------------------
// Runner.

function materialise(files, dir, crlf, testCase = {}) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const body = crlf ? content.replace(/\n/g, '\r\n') : content;
    fs.writeFileSync(abs, testCase.bom && rel.endsWith('.md') ? '\uFEFF' + body : body);
  }
}

function runValidator(dir) {
  const res = spawnSync(process.execPath, [VALIDATOR, '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try {
    return { ...JSON.parse(res.stdout), exitCode: res.status };
  } catch {
    throw new Error(`validator produced no parsable JSON in ${dir}\n${res.stdout?.slice(0, 400)}\n${res.stderr?.slice(0, 400)}`);
  }
}

let failed = 0;
let ran = 0;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-pack-tests-'));

for (const testCase of CASES) {
  if (only && !testCase.name.includes(only)) continue;
  ran += 1;
  const dir = path.join(tmpRoot, testCase.name);
  fs.mkdirSync(dir, { recursive: true });
  materialise(testCase.files, dir, testCase.crlf, testCase);

  let codes;
  let report;
  try {
    report = runValidator(dir);
    codes = new Set(report.findings.map((f) => f.code));
  } catch (error) {
    console.log(`FAIL  ${testCase.name}\n        ${error.message}`);
    failed += 1;
    continue;
  }

  const missing = (testCase.expect || []).filter((code) => !codes.has(code));
  const unexpected = (testCase.forbid || []).filter((code) => codes.has(code));
  // CI gates on the exit code, so at least one case has to prove it tracks P0.
  if (testCase.exit !== undefined && report.exitCode !== testCase.exit) {
    missing.push(`exit ${testCase.exit} (got ${report.exitCode})`);
  }
  if (missing.length === 0 && unexpected.length === 0) {
    console.log(`ok    ${testCase.name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${testCase.name}`);
    console.log(`        ${testCase.why}`);
    if (missing.length) console.log(`        expected but absent: ${missing.join(', ')}`);
    if (unexpected.length) console.log(`        forbidden but present: ${unexpected.join(', ')}`);
  }
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n${ran - failed}/${ran} passing`);
process.exit(failed > 0 ? 1 : 0);
