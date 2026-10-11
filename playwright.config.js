const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: { viewport: { width: 400, height: 800 }, browserName: 'chromium' },
});
