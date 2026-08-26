import { test, expect } from '@playwright/test';
import { recordOracle, recordUserVisibleError } from '../../../../../../scripts/adapters/playwright/recording.mjs';

test('CASE-001 observable behaviour', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'case', description: 'CASE-001' });
  testInfo.annotations.push({ type: 'criterion', description: 'AC-001' });

  await page.goto('/<route>');
  const finalState = page.getByTestId('<stable-test-id>');
  await expect(finalState).toBeVisible();
  recordOracle(testInfo, { id: 'visible-final-state', outcome: 'pass' });

  const visibleError = page.getByTestId('<user-visible-error-test-id>');
  if (await visibleError.isVisible()) recordUserVisibleError(testInfo);
  await expect(visibleError).toBeHidden();
  recordOracle(testInfo, { id: 'no-user-visible-error', outcome: 'pass' });
  await testInfo.attach('stable-final-state', {
    body: Buffer.from(JSON.stringify({ checkpoint: 'stable-final-state', visible: true })),
    contentType: 'application/json',
  });
});
