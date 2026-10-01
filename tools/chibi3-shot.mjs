// Dev helper: screenshot avatar-3d/chibi3-dev.html views. node tools/scratch/c3shot.mjs out.png "query" [w h]
import { chromium } from '@playwright/test';
const [out, query = '', w = '900', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto('http://localhost:8401/avatar-3d/chibi3-dev.html?' + query);
try { await page.waitForFunction(() => window.ready, null, { timeout: 120000 }); } catch (e) { logs.push('timeout'); }
await page.waitForTimeout(+(process.env.WAIT || 600));
const info = await page.evaluate(() => ({ buildMs: Math.round(window.buildMs || 0), stats: window.stats }));
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 15)) console.log(l);
await browser.close();
