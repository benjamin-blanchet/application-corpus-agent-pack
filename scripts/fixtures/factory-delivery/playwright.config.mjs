import path from 'node:path';
import { defineConfig } from '@playwright/test';

const testDir = process.env.FACTORY_PLAYWRIGHT_TEST_DIR;
if (!testDir || !path.isAbsolute(testDir)) throw new Error('FACTORY_PLAYWRIGHT_TEST_DIR is required');

export default defineConfig({
  testDir,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
