// Chibi 2.5 hair see-through counts (hair pass 2): magenta back-face pixels per style per angle on chibi25-sheet.html?xray=1.
//   node tools/chibi25-xray.mjs ids,comma,separated [screenshot.png]   (dev server on PORT, default 8401)
import { chromium } from '@playwright/test';
const [ids, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 800 } });
await page.goto(`http://localhost:${process.env.PORT || 8401}/avatar-3d/chibi25-sheet.html?slot=hair&views=all&size=170&cols=1&xray=1&ids=${ids}`);
await page.waitForFunction(() => window.sheetReady, null, { timeout: 400000 });
const c = await page.evaluate(() => window.xrayCounts);
for (const [k, v] of Object.entries(c)) console.log(k.padEnd(15), Object.values(v).reduce((a, b) => a + b, 0), JSON.stringify(v));
if (out) await page.screenshot({ path: out, fullPage: true });
await browser.close();
