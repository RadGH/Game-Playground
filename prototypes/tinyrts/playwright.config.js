// Playwright runs against the Tiny RTS static server on port 8460.
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: 'http://localhost:8460/', headless: true, viewport: { width: 1280, height: 720 } },
  webServer: { command: 'python3 tools/serve.py 8460', url: 'http://localhost:8460/', reuseExistingServer: true },
  reporter: [['list']],
});
