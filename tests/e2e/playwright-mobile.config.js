// @ts-check
/**
 * Lightweight Playwright config for mobile/desktop CSS & layout tests.
 * Assumes Vite dev server is already running on port 5174.
 * No global setup/teardown or unified server orchestration needed.
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 4,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
  },

  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    cwd: require('path').resolve(__dirname, '../..'),
    timeout: 30000,
  },

  outputDir: './test-results/artifacts',
  timeout: 30000,
  expect: { timeout: 10000 },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
