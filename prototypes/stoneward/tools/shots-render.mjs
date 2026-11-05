// Play-test 2 render checks: the globe and the far flat map at Small and Large sizes (is it sharp?),
// and a close town view. Usage: node tools/shots-render.mjs <outdir> [phone]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'test-results/stoneward-render';
mkdirSync(out, { recursive: true });
const phone = process.argv[3] === 'phone';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const size of ['small', 'large']) {
  const page = await browser.newPage(phone ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errs.push('PAGE ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await page.goto('http://localhost:8401/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
  await page.evaluate(s => localStorage.setItem('stoneward.lastSettings', JSON.stringify({ size: s })), size);
  await page.click('#btn-new'); await page.click('#nw-go');
  await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${size}-globe.png` });
  // a closer globe, then the flat map zoomed out (no chunks)
  const st = await page.evaluate(() => window.gameEye.state());
  const c = st.camera;
  await page.evaluate(([x, y, p]) => window.gameEye.fly(x, y, p), [c.x, c.y, c.ppc * 1.25]); await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${size}-globe-near.png` });
  await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 0.85), [c.x, c.y]); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${size}-flat-far.png` });
  await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 1.6), [c.x, c.y]); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${size}-flat-farther.png` });
  await page.close();
}
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
