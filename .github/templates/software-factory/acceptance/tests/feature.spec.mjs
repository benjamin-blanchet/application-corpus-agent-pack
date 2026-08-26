import { test, expect } from '@playwright/test';
import { checkpoint } from '../../../../../../scripts/adapters/playwright/checkpoint.mjs';

test('CASE-001 observable behaviour', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'case', description: 'CASE-001' });
  testInfo.annotations.push({ type: 'criterion', description: 'AC-001' });

  await page.goto('/<route>');
  const finalState = page.getByTestId('<stable-test-id>');
  await expect(finalState).toBeVisible();
  await checkpoint(page, testInfo, {
    caseId: 'CASE-001',
    evidenceId: 'stable-final-state',
  });
});
