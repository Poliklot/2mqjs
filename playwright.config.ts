import { defineConfig } from '@playwright/test';

const baseURL = process.env.TEST_MANUAL_BASE_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  outputDir: '/tmp/2mqjs-playwright-results',
  testDir: './tests/e2e',
  use: {
    baseURL,
  },
  webServer: {
    command: 'npm run test:manual',
    url: baseURL,
    reuseExistingServer: true,
  },
});
