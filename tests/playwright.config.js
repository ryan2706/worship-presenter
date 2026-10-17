// Serves the project folder (one level up) the same way we do by hand,
// then runs the checks in the installed Google Chrome. To use Playwright's
// own Chromium instead, run `npx playwright install chromium` once and set
// TEST_BROWSER=chromium.
const { defineConfig } = require('@playwright/test');

const PORT = 8123;

module.exports = defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    channel: process.env.TEST_BROWSER === 'chromium' ? undefined : 'chrome',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --directory ..`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: true,
    stderr: 'ignore',
  },
});
