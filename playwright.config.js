// Playwright config: runs against the static server on port 8400 (start it with ./serve.sh --bg).
// Tests live in tests/*.spec.js and each experiment's own tests/ folder.
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.js', '*/tests/**/*.spec.js', 'prototypes/*/tests/**/*.spec.js'],
  timeout: 60_000,
  workers: 1, // WebGL + audio synthesis pages are CPU heavy; run serially for stable timings
  use: { baseURL: 'http://localhost:8400/', headless: true, viewport: { width: 1280, height: 800 } },
  webServer: { command: 'python3 tools/serve.py 8400', url: 'http://localhost:8400/', reuseExistingServer: true },
  reporter: [['list']],
});
