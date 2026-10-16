// Dev helper: screenshot the Chibi 2.5 contact sheet (avatar-3d/chibi25-sheet.html) or builder page.
//   node tools/chibi25-shot.mjs out.png "slot=hair&v=2" [width] [page]
// Waits for window.sheetReady (sheet) or window.chibi25?.ready (builder). Full-page screenshot.
import { chromium } from '@playwright/test';
const [out, query = '', w = '1100', pageName = 'chibi25-sheet.html'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: 800 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await page.goto(`http://localhost:${process.env.PORT || 8401}/avatar-3d/${pageName}?${query}`);
try { await page.waitForFunction(() => window.sheetReady || window.chibi25?.ready, null, { timeout: 240000 }); } catch { logs.push('timeout'); }
await page.waitForTimeout(+(process.env.WAIT || 300));
await page.screenshot({ path: out, fullPage: true });
for (const l of logs.slice(0, 15)) console.log(l);
await browser.close();
