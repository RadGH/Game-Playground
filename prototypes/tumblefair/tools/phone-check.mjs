#!/usr/bin/env node
// Phone-size check of the menu screens (round 5, after "on the lobby page on phone I can't scroll, can't start"):
// opens the host on a small and a tall phone, and for the title and lobby (and the modals) checks that
//   * a finger drag ANYWHERE on the screen (raw CDP touch events; Input.synthesizeScrollGesture does NOT scroll in
//     headless Chromium, so a test built on it proves nothing) scrolls it,
//   * the Start button is on screen and tappable (elementFromPoint) without scrolling (it is pinned to the bottom),
//   * the same in WebKit (Safari's engine, what iPhones run) with the wheel — WebKit picks what to scroll by what is
//     under the pointer, which is how the iPhone lobby broke: #screen had pointer-events: none,
// and saves screenshots to tests/shots/phone-*.png. Exit code 1 on any failure.
//   flock /tmp/claude-1000/farhold-pw.lock node prototypes/tumblefair/tools/phone-check.mjs [--url http://127.0.0.1:8488/prototypes/tumblefair/]
import { chromium, webkit } from '@playwright/test';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL0 = arg('url', 'http://127.0.0.1:8480/prototypes/tumblefair/');
const OUT = new URL('../tests/shots/', import.meta.url).pathname;
const PHONES = [{ name: 'se', width: 375, height: 667 }, { name: 'tall', width: 393, height: 852 }, { name: 'land', width: 852, height: 393 }];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fails = [], errors = [];
async function swipe(page, cdp, x, y, dy) {
  const pt = yy => [{ x, y: yy, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y) });
  for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y + dy * k / 12) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
}
const scrollTop = page => page.evaluate(() => document.querySelector('#screen').scrollTop);
async function reachable(page, sel) {
  return page.evaluate(sel => { const b = document.querySelector(sel); if (!b) return 'missing'; const r = b.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight + 1) return `off screen (${Math.round(r.top)}..${Math.round(r.bottom)} of ${innerHeight})`;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit && (hit === b || b.contains(hit)) ? 'ok' : 'covered by ' + (hit?.className || hit?.tagName); }, sel);
}
for (const ph of PHONES) {
  const ctx = await browser.newContext({ viewport: { width: ph.width, height: ph.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push(`${ph.name}: ${e.message}`));
  await page.goto(URL0 + '?quality=low');
  await page.waitForFunction(() => window.tumblefair?.S.me, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}phone-${ph.name}-title.png` });
  const t = await reachable(page, '[data-act=host]'); if (t !== 'ok') fails.push(`${ph.name} title: Host button ${t}`);
  await page.click('[data-act=host]');
  await page.waitForFunction(() => window.tumblefair.S.phase === 'lobby' && document.querySelector('[data-act=start]'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}phone-${ph.name}-lobby.png` });
  const s0 = await reachable(page, '[data-act=start]'); if (s0 !== 'ok') fails.push(`${ph.name} lobby: Start button ${s0} before scrolling`);
  const over = await page.evaluate(() => { const s = document.querySelector('#screen'); return s.scrollHeight - s.clientHeight; });
  if (over > 4) {
    // swipe up on the empty middle of the screen (over the 3D characters), then on the panel
    await swipe(page, cdp, ph.width / 2, Math.min(ph.height * 0.3, 160), -300);
    const a = await scrollTop(page);
    if (a < 20) fails.push(`${ph.name} lobby: a swipe over the characters did not scroll (scrollTop ${a}, ${over}px to scroll)`);
    await swipe(page, cdp, ph.width / 2, ph.height * 0.8, -800);
    await swipe(page, cdp, ph.width / 2, ph.height * 0.8, -800);
  }
  await page.screenshot({ path: `${OUT}phone-${ph.name}-lobby-bottom.png` });
  const s = await reachable(page, '[data-act=start]'); if (s !== 'ok') fails.push(`${ph.name} lobby: Start button ${s} (after scrolling)`);
  // the modals scroll too, and their Done button is reachable
  for (const [act, sel] of [['shop', '.modal [data-close]'], ['pool', '.modal [data-close]'], ['edit', '.modal [data-close]']]) {
    if (!(await page.$(`[data-act=${act}]`))) continue;
    await page.evaluate(() => { const s = document.querySelector('#screen'); s.scrollTop = 0; });
    await page.click(`[data-act=${act}]`); await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}phone-${ph.name}-${act}.png` });
    const m0 = await page.evaluate(() => document.querySelector('.modal')?.scrollTop ?? -1);
    for (let k = 0; k < 8; k++) await swipe(page, cdp, ph.width / 2, ph.height * 0.85, -ph.height * 0.6);
    const m1 = await page.evaluate(() => { const m = document.querySelector('.modal'); return m ? [m.scrollTop, m.scrollHeight - m.clientHeight] : [-1, 0]; });
    if (m1[1] > 4 && m1[0] <= m0) fails.push(`${ph.name} ${act}: the list did not scroll`);
    await page.screenshot({ path: `${OUT}phone-${ph.name}-${act}-bottom.png` });
    const r = await reachable(page, sel); if (r !== 'ok') fails.push(`${ph.name} ${act}: Done ${r}`);
    await page.evaluate(() => document.querySelector('.modal')?.remove());
  }
  await ctx.close();
}
await browser.close();
// WebKit: wheel over the 3D characters and over the panel must scroll the lobby
{
  const wk = await webkit.launch(), ctx = await wk.newContext({ viewport: { width: 393, height: 700 } }), page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`webkit: ${e.message}`));
  await page.goto(URL0 + '?quality=low');
  await page.waitForFunction(() => window.tumblefair?.S.me, null, { timeout: 40000 });
  await page.click('[data-act=host]'); await page.waitForFunction(() => document.querySelector('[data-act=start]'), null, { timeout: 20000 }); await page.waitForTimeout(1200);
  for (const [y, where] of [[120, 'over the characters'], [560, 'over the panel']]) {
    await page.evaluate(() => { document.querySelector('#screen').scrollTop = 0; });
    await page.mouse.move(196, y); await page.mouse.wheel(0, 300); await page.waitForTimeout(500);
    const [st, over] = await page.evaluate(() => { const s = document.querySelector('#screen'); return [s.scrollTop, s.scrollHeight - s.clientHeight]; });
    if (over > 4 && st < 10) fails.push(`webkit lobby: wheel ${where} did not scroll`);
  }
  await page.screenshot({ path: `${OUT}phone-webkit-lobby.png` });
  await wk.close();
}
console.log(JSON.stringify({ fails, errors: errors.slice(0, 8) }, null, 1));
process.exit(fails.length || errors.length ? 1 : 0);
