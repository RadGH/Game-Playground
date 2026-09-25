// Quick screenshot helper: node tools/shot.mjs "<url path>" out.png [waitMs] [js-to-eval]
import { chromium } from '@playwright/test';
const [, , path = '/', out = 'shot.png', wait = '1500', js = ''] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8460' + path);
await page.waitForTimeout(Number(wait));
if (js) { await page.evaluate(js); await page.waitForTimeout(800); }
await page.screenshot({ path: out });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
