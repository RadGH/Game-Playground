// Headless benchmark of the Chibi 3 page (software rendering: compare ratios, not absolute numbers). node tools/chibi3-bench.mjs out.png
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('http://localhost:8401/avatar-3d/chibi3.html');
await page.waitForFunction(() => window.chibi3page && !window.chibi3page.building, null, { timeout: 180000 });
const r = await page.evaluate(() => window.chibi3page.benchmark({ frames: 30, warmup: 6 }));
console.log(JSON.stringify(r, null, 1));
await page.waitForTimeout(3000);
await page.screenshot({ path: process.argv[2], fullPage: true });
await browser.close();
