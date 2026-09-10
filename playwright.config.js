// Playwright config: runs against the static server on port 8400 (start it with ./serve.sh --bg).
// Tests live in tests/*.spec.js and each experiment's own tests/ folder.
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.js', '*/tests/**/*.spec.js'],
  timeout: 60_000,
  use: { baseURL: 'http://localhost:8400/', headless: true, viewport: { width: 1280, height: 800 } },
  webServer: { command: 'python3 -m http.server 8400 --bind 0.0.0.0', url: 'http://localhost:8400/', reuseExistingServer: true },
  reporter: [['list']],
});
