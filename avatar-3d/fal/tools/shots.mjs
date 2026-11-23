#!/usr/bin/env node
// Screenshots of the review page with headless Chromium (software WebGL), desktop and phone.
//   node avatar-3d/fal/tools/shots.mjs [name=query ...]      e.g. plate="set=plate&clip=walk&weapon=sword"
// Needs the playground dev server on 8401. Writes avatar-3d/fal/shots/page-<name>-<desktop|phone>.png and prints
// window.__fal errors + stats.
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FAL_URL || 'http://localhost:8401/avatar-3d/fal/index.html';
const shots = process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; });
if (!shots.length) shots.push(['default', '']);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, query] of shots) {
  for (const [dev, vp] of [['desktop', { width: 1400, height: 860 }], ['phone', { width: 360, height: 780 }]]) {
    if (process.env.ONLY && process.env.ONLY !== dev) continue;
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    const logs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
    page.on('pageerror', e => logs.push(String(e)));
    await page.goto(BASE + (query ? '?' + query : ''));
    await page.waitForFunction(() => window.__fal?.ready || window.__fal?.errors.length, null, { timeout: 120000 });
    await page.waitForTimeout(Number(process.env.WAIT || 1500));
    const info = await page.evaluate(() => ({ errors: window.__fal.errors, stats: window.__fal.stats?.(), overflow: document.documentElement.scrollWidth > innerWidth }));
    await page.screenshot({ path: join(ROOT, 'shots', `page-${name}-${dev}.png`), fullPage: dev === 'phone' && !!process.env.FULL });
    console.log(name, dev, JSON.stringify(info), logs.slice(0, 5).join(' | '));
    await page.close();
  }
}
await browser.close();
