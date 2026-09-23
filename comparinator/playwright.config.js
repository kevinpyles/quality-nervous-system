// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// QNS passes QNS_TARGET_PORT when it runs this suite against its own target server.
const PORT = Number(process.env.QNS_TARGET_PORT || 4173);

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx http-server . -p ${PORT} -a 127.0.0.1 -c-1 --silent`,
    url: `http://127.0.0.1:${PORT}/comparinator.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
