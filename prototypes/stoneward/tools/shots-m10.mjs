// M10 screenshots: track between two towns, stations, a moving train, the Lines screen.
//   node prototypes/stoneward/tools/shots-m10.mjs <out-prefix> [w h] [base-url]
import { chromium } from 'playwright';
const [out, w = 402, h = 780, base = 'http://localhost:8401'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto(base + '/prototypes/stoneward/?shots&dev', { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.fill('#nw-seed', '424242'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 30000 });
await page.mouse.click(+w / 2, +h / 2); await page.waitForTimeout(1500);
await page.click('#land-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'hud', null, { timeout: 10000 });
await page.waitForTimeout(1000);
// a second town along the way, and track between them (try rows until one is clear land)
const setup = await page.evaluate(async () => {
  const E = window.gameEye;
  await E.order({ t: 'dev.give', gold: 300, goods: { iron_ore: 400, stone: 300, log: 200 } });
  const a = E.state().town.towns[0];
  let b = null;
  for (const dx of [200, -200, 160, -160, 240, -240, 120, -120]) { b = await E.order({ t: 'found', x: a.x + dx, y: a.y, name: 'Brookmere' }); if (b && Math.abs(b.y - a.y) < 30) break; b = null; }
  if (!b) return { error: 'no second town' };
  for (const dy of [22, 26, 30, -24, -28, -32, 36, -36, 42, -42, 50, -50]) {
    const y = Math.round(a.y + dy);
    const n = await E.order({ t: 'rail', x0: Math.min(a.x, b.x) - 12, y0: y, x1: Math.max(a.x, b.x) + 12, y1: y });
    if (typeof n === 'number' && n > 0) {
      const st = [];
      for (const t of [a, b]) for (const side of [-3, 4]) { let done = false; for (const off of [0, 8, -8, 14, -14, 20, -20, 26, -26]) { const r = await E.order({ t: 'station', x: t.x + off, y: y + side, instant: true }); if (r && typeof r === 'object') { st.push(r); done = true; break; } } if (done) break; }
      return { a, b, y, n, st };
    }
  }
  return { error: 'no clear row' };
});
console.log('setup', JSON.stringify(setup));
await page.waitForTimeout(1500);
const lines = await page.evaluate(() => window.gameEye.view()?.trains?.lines || []);
console.log('lines', JSON.stringify(lines));
if (lines[0]) {
  await page.evaluate(async key => { await window.gameEye.order({ t: 'train.add', line: key, kind: 'freight' }); await window.gameEye.order({ t: 'train.add', line: key, kind: 'passenger' }); }, lines[0].key);
}
const mid = setup.a ? { x: (setup.a.x + setup.b.x) / 2, y: setup.y } : null;
if (setup.st?.[0]) {
  const s = setup.st[0];
  await page.evaluate(({ x, y }) => window.gameEye.fly(x + 5, y + 2, 9), s);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '-station.png' });
}
for (let k = 0; k < 2; k++) { console.log('clock', JSON.stringify(await page.evaluate(() => [window.gameEye.state().clock, (window.gameEye.view()?.trains?.trains || []).map(t => [t.kind, t.v, t.wait, t.cars[0]])]))); await page.waitForTimeout(1000); }
// a moving train
for (let k = 0; k < 120; k++) {
  const t = await page.evaluate(() => (window.gameEye.view()?.trains?.trains || []).find(t => t.wait === 0 && t.v > 6));
  if (t) {
    // follow it for a moment so the camera is on it
    for (let j = 0; j < 6; j++) { const u = await page.evaluate(id => window.gameEye.view()?.trains?.trains.find(t => t.id === id), t.id); if (!u) break; await page.evaluate(({ x, y }) => window.gameEye.fly(x, y, 9), { x: u.cars[1][0], y: u.cars[1][1] }); await page.waitForTimeout(120); }
    console.log('moving', JSON.stringify(t).slice(0, 160)); break;
  }
  await page.waitForTimeout(250);
}
await page.screenshot({ path: out + '-train.png' });
if (mid) { await page.evaluate(({ x, y }) => window.gameEye.fly(x, y, 1.3), mid); await page.waitForTimeout(2000); await page.screenshot({ path: out + '-line.png' }); }
// the Rails tab with the track tool on, dragging a ghost
console.log('tabs', await page.evaluate(() => [...document.querySelectorAll('#dock-tabs button')].map(b => b.dataset.tab).join(','))); console.log(logs.join('\n'));
await page.click('[data-tab="rails"]'); await page.waitForTimeout(300);
await page.click('text=Track'); await page.waitForTimeout(200);
await page.mouse.move(+w / 2 - 80, +h / 2 - 120); await page.mouse.down(); await page.mouse.move(+w / 2 + 60, +h / 2 - 60, { steps: 6 });
await page.waitForTimeout(300);
await page.screenshot({ path: out + '-tool.png' });
await page.mouse.up();
await page.waitForTimeout(800);
await page.click('[data-tab="info"]'); await page.waitForTimeout(300);
await page.click('#dock-panel >> text=Lines'); await page.waitForTimeout(1200);
await page.screenshot({ path: out + '-lines.png' });
console.log(JSON.stringify(await page.evaluate(() => window.gameEye.view()?.trains?.lines)));
console.log(logs.join('\n') || 'no console errors');
await browser.close();
