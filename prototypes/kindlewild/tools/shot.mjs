// Browser smoke: open the game at phone (and desktop) size, collect console errors, screenshot.
// node prototypes/kindlewild/tools/shot.mjs [outdir] [script]   (script: 'title' | 'sandbox' | 'level:1-1')
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/kw';
const what = process.argv[3] || 'title';
const base = process.env.KW_URL || 'http://localhost:8401/prototypes/kindlewild/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = (process.env.KW_SIZES || 'phone').split(',');
for (const size of sizes) {
  const vp = size === 'phone' ? { width: 402, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1366, height: 820 };
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor || 1, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.gameEye, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  if (what.startsWith('level:')) {
    await page.evaluate((id) => window.gameEye.startLevel(id), what.slice(6));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}-${size}-intro.png` });
    await page.click('.modal .big.go').catch(() => {});
    await page.waitForTimeout(+(process.env.KW_WAIT || 4000));
  } else if (what === 'sandbox') {
    await page.evaluate((r) => window.gameEye.sandbox(r), process.env.R || 'greenvale');
    await page.waitForTimeout(2500);
  }
  if (process.env.KW_EVAL) await page.evaluate(process.env.KW_EVAL);
  if (process.env.KW_WAIT2) await page.waitForTimeout(+process.env.KW_WAIT2);
  await page.screenshot({ path: `${out}-${size}.png` });
  const st = await page.evaluate(() => JSON.stringify(window.gameEye.state()));
  console.log(size, 'errors:', errors.length ? errors.join('\n') : 'none');
  console.log(st.slice(0, 600));
  await ctx.close();
}
await browser.close();
