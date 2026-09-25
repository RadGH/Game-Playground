// Playwright config: runs against the DEV server on port 8401.
//
// There are two servers now (tools/serve-both.sh), and the tests belong on the dev one:
//
//   8400  STABLE  ~/claude/playground-stable, pinned to the `stable` branch. This is the one the
//                 user has open in a browser, and nothing but tools/publish-stable.sh moves it.
//   8401  DEV     the live working tree, which is broken roughly half the time on purpose.
//
// Pointing the suite at 8400 would mean the tests passed against a build nobody is editing while
// the code being written went unchecked — the exact inverse of what a test run is for.
// Tests live in tests/*.spec.js and each experiment's own tests/ folder.
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.js', '*/tests/**/*.spec.js', 'prototypes/*/tests/**/*.spec.js'],
  testIgnore: ['prototypes/tinyrts/**'], // own repo (symlink) with its own suite on port 8460
  timeout: 60_000,
  workers: 1, // WebGL + audio synthesis pages are CPU heavy; run serially for stable timings
  use: { baseURL: 'http://localhost:8401/', headless: true, viewport: { width: 1280, height: 800 } },
  webServer: { command: 'python3 tools/serve.py 8401', url: 'http://localhost:8401/', reuseExistingServer: true },
  reporter: [['list']],
});
