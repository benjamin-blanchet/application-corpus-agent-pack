#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(SCRIPT_ROOT, 'validate-skills.mjs');

function withFixture(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validator-'));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function invoke(root, extra = []) {
  const result = spawnSync(process.execPath, [VALIDATOR, '--root', root, '--json', ...extra], { encoding: 'utf8' });
  return { result, report: JSON.parse(result.stdout) };
}

const skill = (name, extra = '', body = '# Skill\n') => `---\nname: ${name}\ndescription: "Fixture skill."\n${extra}---\n${body}`;

withFixture({
  '.github/skills/testing/alpha/SKILL.md': skill('alpha', 'references:\n  - procedure.md\n'),
  '.github/skills/testing/alpha/procedure.md': '# Procedure\n',
}, (root) => {
  const { result, report } = invoke(root);
  assert.equal(result.status, 0);
  assert.equal(report.errorCount, 0);
  assert.equal(report.skillCount, 1);
});

withFixture({
  '.github/skills/one/duplicate/SKILL.md': skill('duplicate'),
  '.github/skills/two/duplicate/SKILL.md': skill('duplicate'),
}, (root) => {
  const { result, report } = invoke(root);
  assert.equal(result.status, 1);
  assert.ok(report.errors.some(({ code }) => code === 'duplicate-name'));
});

withFixture({
  '.github/skills/testing/wrong-folder/SKILL.md': skill('different-name', 'references:\n  - absent.md\n'),
}, (root) => {
  const { result, report } = invoke(root);
  assert.equal(result.status, 1);
  assert.ok(report.errors.some(({ code }) => code === 'name-parent-mismatch'));
  assert.ok(report.errors.some(({ code }) => code === 'missing-reference'));
});

withFixture({
  '.github/skills/testing/large/SKILL.md': skill('large', '', `${'# Skill\n'}${'line\n'.repeat(8)}`),
}, (root) => {
  const { result, report } = invoke(root, ['--max-lines', '5']);
  assert.equal(result.status, 0, 'size guidance is a warning, not a hard failure');
  assert.ok(report.warnings.some(({ code }) => code === 'large-skill'));
});

console.log('4/4 passing');

