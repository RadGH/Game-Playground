// Browser stress test: a large map with ~300 enemies, turrets firing and walls collapsing.
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8460/?play=sandbox&nopause&size=large&seed=31');
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const app = window.app, g = app.game;
  g.opts.instantBuild = true; g.waves.enabled = false;
  const core = g.byId.get(g.teams[1].coreId);
  let x = core.x + core.w + 14;
  for (const t of ['relay', 'pulse', 'lance', 'mortar', 'relay', 'arc', 'flak', 'pulse', 'relay', 'railgun', 'mortar', 'pulse']) { const p = app._place.snapPlacement(g, t, x, core.y); g.applyNow({ t: 'build', team: 1, type: t, x: p.x, y: p.y }); x += 15; }
  for (let k = 0; k < 4; k++) { const wx = x + 20 + k * 12; for (let xx = wx; xx < wx + 5; xx++) { const gy = g.world.surfaceY(xx); for (let y = gy - 26; y < gy; y++) g.world.set(xx, y, 6, 1); } }
  const types = ['mite', 'mite', 'mite', 'gnawer', 'spitter', 'wisp', 'splitter', 'glare', 'carapace'];
  for (let k = 0; k < 300; k++) { const u = app._waves.spawnAt(g, types[k % types.length], types[k % types.length] === 'wisp' ? 'sky-right' : 'right'); u.x = x + 90 + (k % 60) * 4; u.y = g.world.surfaceY(Math.floor(u.x)) - (u.flying ? 40 : 1); }
  app.camera.centerOn(x + 60, core.y);
});
const samples = [];
for (let k = 0; k < 6; k++) {
  await page.waitForTimeout(1500);
  samples.push(await page.evaluate(() => ({ fps: window.app.loop.fps, units: window.app.game.units.length, parts: window.app.fx.parts.length })));
}
console.log(samples);
const tick = await page.evaluate(() => { const g = window.app.game; const t0 = performance.now(); for (let i = 0; i < 60; i++) g.tick(); return (performance.now() - t0) / 60; });
console.log('sim ms/tick in browser', tick.toFixed(2));
await page.screenshot({ path: process.argv[2] || 'stress.png' });
await browser.close();
