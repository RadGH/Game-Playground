// Scripted playtest: starts a siege, builds a small base via the real UI (hotkeys + mouse),
// calls waves, and saves screenshots. Usage: node tools/play.mjs <outdir> [seconds]
import { chromium } from '@playwright/test';
const out = process.argv[2] || '.';
const secs = Number(process.argv[3] || 60);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8460/?play=siege&nopause&seed=12345');
await page.waitForTimeout(1500);
// Helpers: world -> screen.
const toScreen = (wx, wy) => page.evaluate(([x, y]) => { const c = window.app.camera; return { x: (x - c.x) * c.scale, y: (y - c.y) * c.scale }; }, [wx, wy]);
const core = await page.evaluate(() => { const g = window.app.game; const c = g.byId.get(g.teams[1].coreId); return { x: c.x, y: c.y, w: c.w, h: c.h }; });
const surf = (x) => page.evaluate((x) => window.app.game.world.surfaceY(x), x);
async function placeAt(keys, wx) {
  for (const k of keys) await page.keyboard.press(k);
  const y = await surf(Math.round(wx));
  const p = await toScreen(wx, y - 5);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(80);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(80);
}
// Drill near crystal: find the best x within range.
const best = await page.evaluate(() => {
  const g = window.app.game; const { oreInArea } = window.app.simHelpers;
  const core = g.byId.get(g.teams[1].coreId);
  let bx = null, bo = -1;
  for (let x = core.x - 60; x < core.x + 100; x += 2) {
    const y = g.world.surfaceY(x + 6) - 10;
    const o = oreInArea(g, x, y, 12, 10, { w: 16, h: 40 });
    if (o.c > bo && Math.abs(x - core.x) > 16) { bo = o.c; bx = x; }
  }
  return { x: bx + 6, ore: bo };
});
console.log('drill spot', best);
await placeAt(['KeyB', 'KeyE', 'KeyQ'], best.x);
await placeAt(['KeyB', 'KeyW', 'KeyQ'], core.x + core.w + 40);
await placeAt(['KeyB', 'KeyW', 'KeyQ'], core.x + core.w + 60);
await placeAt(['KeyB', 'KeyE', 'KeyW'], core.x - 20);
// Paint a Panel wall further right.
await page.keyboard.press('KeyB'); await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyQ');
const wx = core.x + core.w + 85; const gy = await surf(wx);
let a = await toScreen(wx, gy - 2), b = await toScreen(wx, gy - 26);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
await page.mouse.click(5, 300, { button: 'right' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/p1.png` });
await page.evaluate(() => { window.app.loop.speed = 2; });
await page.waitForTimeout(12000);
await page.screenshot({ path: `${out}/p2.png` });
await page.keyboard.press('Shift+KeyN');
await page.waitForTimeout(secs * 1000 / 3);
// Look at the wall.
await page.evaluate((x) => window.app.camera.centerOn(x, window.app.game.world.surfaceY(x) - 20), wx);
await page.screenshot({ path: `${out}/p3.png` });
await page.waitForTimeout(secs * 1000 / 3);
await page.screenshot({ path: `${out}/p4.png` });
const st = await page.evaluate(() => { const g = window.app.game; return { t: g.time, wave: g.waves.n, phase: g.waves.phase, res: g.teams[1].res, kills: g.teams[1].stats.kills, units: g.units.length, blds: g.buildings.map((b) => b.type + (b.done ? '' : '*')), result: g.result }; });
console.log(JSON.stringify(st));
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 5).join('\n'));
await browser.close();
