// Screenshot helper for M2: node prototypes/lodestar/tools/shots.mjs [outDir]  (run under the playground Playwright lock)
// Opens the title and the desk at desktop, phone portrait and phone landscape sizes and prints any console errors.
import { chromium } from 'playwright';
const out = process.argv[2] || new URL('../shots/m2/', import.meta.url).pathname;
const base = process.env.LODESTAR_URL || 'http://localhost:8401/prototypes/lodestar/';
const sizes = [['desktop', 1280, 800], ['desktop-wide', 1920, 1080], ['phone', 402, 780], ['phone-land', 780, 402]];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0;
for (const [name, w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: name.startsWith('phone') ? 2 : 1, hasTouch: name.startsWith('phone'), isMobile: name === 'phone' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') { bad++; console.log(`[${name}] console error:`, m.text()); } });
  page.on('pageerror', e => { bad++; console.log(`[${name}] page error:`, e.message); });
  await page.goto(base + '?seed=1');
  await page.waitForSelector('.title .push');
  await page.screenshot({ path: `${out}${name}-title.png` });
  await page.click('[data-act=new]');
  await page.waitForSelector('.newgame-modal'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}${name}-newgame.png` });
  await page.fill('#ng-seed', '4242');
  await page.click('[data-act=start]');
  await page.waitForFunction(() => window.gameEye?.state().screen === 'game' && window.gameEye.state().tick > 30, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}${name}-desk.png` });
  await page.click('.menu-btn'); await page.waitForSelector('.menu-modal'); await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}${name}-menu.png` });
  await page.click('.menu-modal [data-act=settings]'); await page.waitForSelector('.settings-modal'); await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}${name}-settings.png` });
  await page.click('.settings-modal [data-close]');
  await page.evaluate(() => window.gameEye.act('hour', 22)); await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}${name}-night.png` });
  await page.evaluate(() => window.gameEye.act('hour', 10));
  if (!name.startsWith('phone')) { await page.click('[data-knob=range] .knob-detent[data-detent="0"]'); await page.waitForTimeout(400); await page.screenshot({ path: `${out}${name}-chart.png` }); await page.click('[data-knob=range] .knob-detent[data-detent="3"]'); }
  if (process.env.MORE) {
    for (const p of ['dials', 'time', 'log', 'more']) { const h2 = await page.$(`.handle[data-page=${p}]`); if (h2 && await h2.isVisible()) { await h2.click(); await page.waitForTimeout(300); await page.screenshot({ path: `${out}${name}-page-${p}.png` }); } }
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} console errors` : 'no console errors');
