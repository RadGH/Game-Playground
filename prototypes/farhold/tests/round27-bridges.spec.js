// Farhold round 27, M6 — bridges by kind, solid piers, fords and lake spans, in the real game.
//
// The node test (round27-bridges.test.js) measures the geometry: one deck in every style, piers that
// stop a swimmer, flagstones under 0.2-0.5 m of water. This spec looks at them — one screenshot per
// style from the bank, one of a ford — and walks the real player across a ford on the real keys to
// show that a ford is waded, never swum.
//
//   seed 47, Sheithyadmia V, Super tiny planet (scale 0.1)

import { test, expect } from '@playwright/test';

const SHOTS = 'prototypes/farhold/research/round27-bridges/';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=47&scale=0.1&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand `off` metres to the side of a spot on a line, looking back at it, and let the world rebuild. */
async function lookAt(page, x, z, nx, nz, off, pitch = -0.2) {
  await page.evaluate(async ({ x, z, nx, nz, off, pitch }) => {
    const f = window.farhold;
    const sx = x + nx * off, sz = z + nz * off;
    f.teleport(sx, sz);
    f.control.yaw = Math.atan2(x - sx, z - sz);
    f.control.pitch = pitch;
    f.features.update(sx, sz, true);
    await new Promise(r => setTimeout(r, 900));
  }, { x, z, nx, nz, off, pitch });
}

test('R27 M6 — one of each style from the bank, and a ford', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await land(page);
  const picks = await page.evaluate(() => {
    const f = window.farhold;
    const plans = f.terrain.bridgePlans();
    const out = {};
    for (const style of ['arch', 'trestle', 'plank']) {
      // the deepest of each kind, so the underside is worth looking at
      const p = plans.filter(q => q.style === style)
        .sort((a, b) => (b.halfLength - a.halfLength))[style === 'plank' ? 3 : 0];
      if (p) out[style] = { x: p.crossing.x, z: p.crossing.z, nx: p.flow[0], nz: p.flow[1], len: p.halfLength };
    }
    // the sun moves with longitude on this map, so the easternmost ford is the one in daylight
    const ford = f.terrain.fords.slice().sort((a, b) => b.x - a.x)[0];
    if (ford) {
      // the road's own line through the ford, for the walker to steer along — every road that fords
      // here, because a road can end at World Forge's ford node and another carry on from it
      const roads = f.terrain.fords.filter(q => Math.hypot(q.x - ford.x, q.z - ford.z) < 6).map(q => q.road);
      const line = f.terrain.roadPaths.filter(r => roads.includes(r.id)).flatMap(r => r.points.map(p => [p[0], p[1]]))
        .filter(p => Math.hypot(p[0] - ford.x, p[1] - ford.z) < ford.stonesHalf + 60);
      out.ford = { x: ford.x, z: ford.z, nx: -ford.tz, nz: ford.tx, tx: ford.tx, tz: ford.tz, len: ford.stonesHalf, line };
    }
    return out;
  });
  expect(Object.keys(picks).sort()).toEqual(['arch', 'ford', 'plank', 'trestle']);
  for (const style of ['arch', 'trestle', 'plank']) {
    const p = picks[style];
    await lookAt(page, p.x, p.z, p.nx, p.nz, Math.max(26, p.len * 0.9), -0.12);
    await page.screenshot({ path: SHOTS + `style-${style}.png` });
  }
  const fd = picks.ford;
  // along the road, up the bank from the stones, looking down at them
  await lookAt(page, fd.x, fd.z, -fd.tx, -fd.tz, fd.len + 9, -0.35);
  await page.screenshot({ path: SHOTS + 'ford-from-bank.png' });

  // walk the ford on the real keys, from one bank to the other, steering along the road's own line:
  // wading, never swimming
  const along = p => (p[0] - fd.x) * fd.tx + (p[1] - fd.z) * fd.tz;
  const line = fd.line.slice().sort((a, b) => along(a) - along(b));
  await page.evaluate(async ({ x, z, p }) => {
    const f = window.farhold;
    f.teleport(p[0], p[1]);
    f.control.pitch = -0.25;
    f.features.update(x, z, true);
    await new Promise(r => setTimeout(r, 600));
  }, { ...fd, p: line[0] });
  await page.keyboard.down('KeyW');
  const trail = [];
  let shot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const s = await page.evaluate(({ x, z, tx, tz, line }) => {
      const c = window.farhold.control;
      const d = (c.x - x) * tx + (c.z - z) * tz;
      // steer at the first road point at least 4 m further on
      // (past the road's last point — a road can end at the ford node — carry straight on across)
      const next = line.find(p => (p[0] - x) * tx + (p[1] - z) * tz > d + 4);
      c.yaw = next ? Math.atan2(next[0] - c.x, next[1] - c.z) : Math.atan2(tx, tz);
      return { d, swimming: !!c.swimming, depth: c.waterDepth, y: c.y };
    }, { ...fd, line });
    trail.push(s);
    if (!shot && Math.abs(s.d) < 1.5) { await page.screenshot({ path: SHOTS + 'ford-wading.png' }); shot = true; }
    if (s.d > fd.len + 6) break;
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  expect(trail[trail.length - 1].d, 'the walker did not get across the ford').toBeGreaterThan(fd.len);
  expect(trail.filter(s => s.swimming), 'the walker swam at a ford').toEqual([]);
  expect(trail.some(s => s.depth > 0.15), 'the walker never had water over its feet').toBe(true);
  expect(errors).toEqual([]);
});

// (A lake span is not screenshotted: no standard world has a road raised over more than 25 m of lake —
// World Forge keeps roads off lakes and towns drain them — so round27-bridges.test.js lays a lake
// across real roads itself and walks the spans it makes.)
