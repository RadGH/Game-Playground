// Dev helper: screenshot avatar-3d/chibi3.html. node tools/chibi3-page-shot.mjs out.png "query" [w h] [js-to-run]
import { chromium } from '@playwright/test';
const [out, query = '', w = '1400', h = '1000', js = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto('http://localhost:8401/avatar-3d/chibi3.html?' + query);
try { await page.waitForFunction(() => window.chibi3page && !window.chibi3page.building, null, { timeout: 180000 }); } catch { logs.push('timeout'); }
if (js) { await page.evaluate(js); await page.waitForFunction(() => !window.chibi3page.building, null, { timeout: 180000 }); }
await page.waitForTimeout(+(process.env.WAIT || 1500));
const info = await page.evaluate(() => ({ stats: window.chibi3page.stats(), actors: window.chibi3page.actors.length, state: document.getElementById('state').textContent, build: document.getElementById('build').textContent + ' ' + document.getElementById('build-src').textContent }));
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' });
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 15)) console.log(l);
await browser.close();
