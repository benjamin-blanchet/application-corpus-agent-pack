#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { readData } from './lib/factory-delivery/files.mjs';
import { validatePlaywrightSource } from './adapters/playwright/policy.mjs';
import { validateFactoryPackageV3 } from './lib/factory-v3/package-io.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'scripts/factory-fixtures/catalog.json'), 'utf8'));

test('every adopted factory learning resolves to executable positive and negative fixtures', () => {
  const learning = readData(path.join(root, 'doc/_meta/factory-learning.yaml'));
  const fixtures = new Map(catalog.fixtures.map((fixture) => [fixture.id, fixture]));
  assert.equal(fixtures.size, catalog.fixtures.length, 'fixture ids must be unique');

  for (const promotion of learning.promotions.filter((item) => item.decision?.status === 'adopted')) {
    assert.ok(promotion.positive_fixtures.length > 0, `${promotion.id} has no positive fixture`);
    assert.ok(promotion.negative_fixtures.length > 0, `${promotion.id} has no negative fixture`);
    for (const [polarity, ids] of [['positive', promotion.positive_fixtures], ['negative', promotion.negative_fixtures]]) {
      for (const id of ids) {
        const fixture = fixtures.get(id);
        assert.ok(fixture, `${promotion.id} references unknown fixture ${id}`);
        assert.equal(fixture.polarity, polarity, `${id} has the wrong polarity`);
        const file = path.resolve(root, fixture.test_file);
        assert.ok(file.startsWith(`${root}${path.sep}`) && fs.existsSync(file), `${id} test file is missing`);
        const source = fs.readFileSync(file, 'utf8');
        assert.ok(source.includes(`test('${fixture.test_name}'`), `${id} test is not executable or was renamed`);
      }
    }
  }
});

test('the shipped specification template is a real V3 package without legacy dual truth', () => {
  const template = path.join(root, 'doc/spec/template');
  assert.deepEqual(validateFactoryPackageV3(template), []);
  assert.equal(fs.existsSync(path.join(template, 'technical-plan.yaml')), false);
  assert.equal(fs.existsSync(path.join(template, 'factory-state.yaml')), false);
});

test('the shipped Playwright scaffold satisfies the static replay policy', () => {
  const files = [
    '.github/templates/software-factory/acceptance/playwright.config.mjs',
    '.github/templates/software-factory/acceptance/tests/feature.spec.mjs',
  ];
  for (const file of files) {
    const findings = validatePlaywrightSource(fs.readFileSync(path.join(root, file), 'utf8'), { file });
    assert.deepEqual(findings, []);
  }
});

test('the Playwright policy rejects fixed waits and persistent human profiles', () => {
  const unsafe = `
    await page.waitForTimeout(2500);
    await chromium.launchPersistentContext('/Users/operator/profile', { args: ['--user-data-dir=profile'] });
  `;
  const codes = new Set(validatePlaywrightSource(unsafe).map((finding) => finding.code));
  assert.deepEqual(codes, new Set(['playwright-fixed-wait', 'playwright-persistent-human-profile']));
});
