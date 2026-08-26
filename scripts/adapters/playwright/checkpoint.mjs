import fs from 'node:fs';

function safeId(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value || '')) throw new Error(`${label} must be a safe identifier`);
  return value;
}

export async function checkpoint(page, testInfo, {
  caseId,
  evidenceId,
  locator = null,
  fullPage = false,
} = {}) {
  const safeCase = safeId(caseId, 'caseId');
  const safeEvidence = safeId(evidenceId, 'evidenceId');
  if (locator) await locator.waitFor({ state: 'visible' });
  const screenshot = testInfo.outputPath(`${safeCase}-${safeEvidence}.png`);
  if (locator) await locator.screenshot({ path: screenshot });
  else await page.screenshot({ path: screenshot, fullPage });
  const metadata = testInfo.outputPath(`${safeCase}-${safeEvidence}.json`);
  fs.writeFileSync(metadata, `${JSON.stringify({
    schema_version: 1,
    run_id: process.env.FACTORY_RUN_ID || 'unknown',
    subject_sha: process.env.FACTORY_SUBJECT_SHA || 'unknown',
    case_id: safeCase,
    evidence_id: safeEvidence,
    captured_at: new Date().toISOString(),
    plan_digest: process.env.FACTORY_PLAN_DIGEST || 'unknown',
    environment_digest: process.env.FACTORY_ENVIRONMENT_DIGEST || 'unknown',
    browser_version: page.context().browser()?.version() || 'unknown',
  }, null, 2)}\n`, 'utf8');
  await testInfo.attach(safeEvidence, { path: screenshot, contentType: 'image/png' });
  await testInfo.attach(`${safeEvidence}-metadata`, { path: metadata, contentType: 'application/json' });
  return { screenshot, metadata };
}
