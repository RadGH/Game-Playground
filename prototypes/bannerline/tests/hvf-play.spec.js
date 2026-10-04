// Hunters vs Farmers played in the browser (stream H): hvf.html, setup card -> match vs AI seats.
// A farmer places a coop and a pen with the mouse and the animals wander; a hunter walks under the fog
// of war and cannot see the farmers' things; the view is not blank and nothing throws.
import { test, expect } from '@playwright/test';

const PAGE = 'prototypes/bannerline/hvf.html';
const errorsOf = (page) => { const e = []; page.on('pageerror', (x) => e.push(x.message)); page.on('console', (m) => { if (m.type() === 'error') e.push(m.text()); }); return e; };

test('setup card -> farmer match: build with the mouse, the animals wander', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?seed=5`);
  await expect(page.locator('.hvf-setup .role')).toHaveCount(2);
  await page.locator('.hvf-setup [data-role="farmer"]').click();
  await page.locator('.hvf-setup select[data-k="format"]').selectOption('3v1');
  await page.locator('.hvf-setup [data-act="start"]').click();
  await page.waitForFunction(() => window.hvf && window.hvf.match, null, { timeout: 30_000 });
  await expect(page.locator('.hv-build [data-build]')).toHaveCount(16);
  // plenty of gold, then place a Hen Coop a few metres east of the farmer with the mouse
  await page.evaluate(() => { const g = window.hvf; g.state().players[g.match.me].gold = 2000; });
  const spot = await page.evaluate(() => {
    const g = window.hvf, m = g.match, s = g.state(), e = s.ents.find((x) => x.id === s.players[m.me].ent);
    m.camera.snapTo(e.x, e.z); m.camera.update(0.016, {});
    // the first spot around the farmer where a coop fits
    for (const [dx, dz] of [[7, 0], [-7, 0], [0, 7], [0, -7], [9, 6], [-9, 6], [6, -9]]) {
      const x = e.x + dx, z = e.z + dz;
      if (m.sim.map && window.hvfCheck?.(x, z) === false) continue;
      const p = m.camera.project(x, 0, z, m.vp.rect);
      return { x: p.x, y: p.y, wx: x, wz: z };
    }
    return null;
  });
  await page.locator('.hv-build [data-build="coop"]').click();
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y);
  await page.evaluate(() => window.hvf.fastForward(300));
  let st = await page.evaluate(() => { const s = window.hvf.state(); return { coops: s.ents.filter((e) => e.type === 'coop').length, hens: s.ents.filter((e) => e.kind === 'animal').length }; });
  expect(st.coops, 'the coop was placed by a mouse click').toBe(1);
  // a pen by key (2) + click a little further out
  await page.keyboard.press('Digit2');
  await page.mouse.click(spot.x + 140, spot.y + 60);
  await page.evaluate(() => window.hvf.fastForward(20 * 60));
  const a = await page.evaluate(() => window.hvf.state().ents.filter((e) => e.kind === 'animal').map((e) => [e.id, e.x, e.z]));
  expect(a.length).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.hvf.fastForward(20 * 10));
  const b = await page.evaluate(() => window.hvf.state().ents.filter((e) => e.kind === 'animal').map((e) => [e.id, e.x, e.z]));
  const moved = b.filter(([id, x, z]) => { const o = a.find((q) => q[0] === id); return o && Math.hypot(o[1] - x, o[2] - z) > 0.3; }).length;
  expect(moved, 'animals wander').toBeGreaterThan(0);
  await page.waitForTimeout(600);
  const probe = await page.evaluate(() => window.hvf.probe());
  expect(probe.sd).toBeGreaterThan(8);
  expect(probe.calls).toBeLessThan(250);
  await page.screenshot({ path: 'test-results/hvf-farmer.png' });
  expect(errors).toEqual([]);
});

test('hunter: waits in the kennel, then walks under the fog; the farmers stay hidden', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?seed=5`);
  await page.waitForFunction(() => window.hvfGame, null, { timeout: 30_000 });
  await page.evaluate(() => window.hvfGame.start({ role: 'hunter', format: '3v1', seed: 5, headStart: 2, ai: 'recruit' }));
  await page.waitForFunction(() => window.hvf && window.hvf.match);
  // right-click toward the Commons
  const before = await page.evaluate(() => { const g = window.hvf, s = g.state(), e = s.ents.find((x) => x.id === s.players[g.match.me].ent); return { x: e.x, z: e.z }; });
  await page.evaluate(() => window.hvf.fastForward(60));
  const target = await page.evaluate(() => { const m = window.hvf.match, c = m.sim.map.commons, s = window.hvf.state(), e = s.ents.find((x) => x.id === s.players[m.me].ent);
    const x = e.x + (c.x - e.x) * 0.15, z = e.z + (c.z - e.z) * 0.15; m.camera.snapTo(e.x, e.z); m.camera.update(0.016, {}); const p = m.camera.project(x, 0, z, m.vp.rect); return p; });
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.evaluate(() => window.hvf.fastForward(20 * 8));
  const after = await page.evaluate(() => { const g = window.hvf, s = g.state(), e = s.ents.find((x) => x.id === s.players[g.match.me].ent); return { x: e.x, z: e.z }; });
  expect(Math.hypot(after.x - before.x, after.z - before.z), 'the hunter walked').toBeGreaterThan(4);
  // fog: the hunters see a small part of the map, and none of the farmers at the Commons
  const fog = await page.evaluate(() => {
    const s = window.hvf.state(), v = s.hvf.vision[1];
    let n = 0; for (const w of v) { let x = w >>> 0; while (x) { n += x & 1; x >>>= 1; } }
    return { share: n / (window.hvf.match.sim.map.cols * window.hvf.match.sim.map.rows) };
  });
  expect(fog.share).toBeLessThan(0.2);
  expect(await page.evaluate(() => window.hvf.match.actors.items.size >= 1)).toBe(true);
  const farmersShown = await page.evaluate(() => [...window.hvf.match.actors.items.values()].filter((it) => it.ent.kind === 'farmer' && it.mesh.visible).length);
  expect(farmersShown, 'no farmer drawn inside the fog').toBe(0);
  await page.waitForTimeout(600);
  expect((await page.evaluate(() => window.hvf.probe())).sd).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/hvf-hunter.png' });
  expect(errors).toEqual([]);
});
