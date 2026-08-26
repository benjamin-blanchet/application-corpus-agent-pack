import path from 'node:path';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.FACTORY_BASE_URL;
if (!baseURL) throw new Error('FACTORY_BASE_URL is required');

const evidenceRoot = process.env.FACTORY_EVIDENCE_ROOT || 'factory-evidence';
const reporter = path.resolve(process.cwd(), 'scripts/adapters/playwright/reporter.mjs');
const ephemeralStorageState = process.env.FACTORY_EPHEMERAL_STORAGE_STATE;
if (process.env.FACTORY_STORAGE_STATE) throw new Error('FACTORY_STORAGE_STATE is forbidden; use a per-run FACTORY_EPHEMERAL_STORAGE_STATE');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  outputDir: path.join(evidenceRoot, 'playwright-output'),
  reporter: [
    [reporter],
    ['junit', { outputFile: path.join(evidenceRoot, 'junit.xml') }],
    ['html', { outputFolder: path.join(evidenceRoot, 'html-report'), open: 'never' }],
  ],
  use: {
    baseURL,
    headless: Boolean(process.env.CI),
    ignoreHTTPSErrors: process.env.FACTORY_LOCAL_SELF_SIGNED === 'true',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    storageState: ephemeralStorageState || undefined,
  },
});
