import { test } from '@playwright/test';
import { recordOracle } from '../../../adapters/playwright/recording.mjs';

test('CASE-001 fixture behaviour', async ({}, testInfo) => {
  testInfo.annotations.push({ type: 'case', description: 'CASE-001' });
  testInfo.annotations.push({ type: 'criterion', description: 'AC-001' });
  recordOracle(testInfo, { id: 'fixture-oracle', outcome: 'pass' });
});
