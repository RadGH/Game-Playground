// Planet texture level-of-detail, in the real page.
//
// "Can the planets also switch to a higher resolution texture as you get closer? It might make sense
// to generate 2-3 LOD textures."
//
// There WAS a three-tier system before this — far / near / close with `textureSize` 256 / 512 / 1024
// — and the texture size did nothing, because `createPlanet` only reads `textureSize` when nobody
// hands it a map, and the world you launched from always hands it one. Measured, the surface stayed
// 1024 wide at every distance. These tests exist so that cannot quietly come back.

import { test, expect } from '@playwright/test';

async function inSpace(page, seed = 11) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=ranger`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  await page.evaluate(() => window.farhold.toSpace());
  await page.waitForFunction(() => window.farhold.mode === 'space' && !!window.farhold.space, null, { timeout: 30000 });
  return errors;
}

/** Walk the ship in from far out, sampling the nearest world's tier and texture at each step. */
async function approach(page) {
  return page.evaluate(async () => {
    const f = window.farhold;
    const sp = f.space;
    const rows = [];
    sp.state.position.multiplyScalar(6);                 // start well out, so `far` is exercised
    const settle = async () => {
      for (let i = 0; i < 30; i++) { sp.refineDetail(1 / 30); await new Promise(r => setTimeout(r, 10)); }
    };
    await settle();
    for (let step = 0; step < 10; step++) {
      const n = sp.nearest();
      if (!n) break;
      const body = n.body;
      const mat = body.model.surface?.material || body.model.group.children[0]?.material;
      rows.push({
        altitude: +n.altitude.toFixed(2),
        tier: body.tier,
        texW: mat?.map?.image?.width ?? null,
        verts: body.model.surface?.geometry?.attributes?.position?.count ?? null,
      });
      const dir = body.position.clone().sub(sp.state.position).multiplyScalar(0.34);
      sp.state.position.add(dir);
      await settle();
    }
    return rows;
  });
}

test('a planet takes a bigger texture as you close on it, and a smaller one far out', async ({ page }) => {
  const errors = await inSpace(page);
  const rows = await approach(page);

  const at = key => rows.filter(r => r.tier === key);
  expect(at('far').length, 'the approach never reached the far tier').toBeGreaterThan(0);
  expect(at('close').length, 'the approach never reached the close tier').toBeGreaterThan(0);

  // three rungs, and each one genuinely bigger than the last
  const widthAt = key => at(key)[0]?.texW ?? null;
  expect(widthAt('far')).toBe(256);
  if (at('near').length) expect(widthAt('near')).toBe(512);
  expect(widthAt('close')).toBe(1024);

  // and the geometry sharpens with it
  expect(at('close')[0].verts).toBeGreaterThan(at('far')[0].verts);
  expect(errors).toEqual([]);
});

test('the texture never gets coarser as you get closer', async ({ page }) => {
  await inSpace(page);
  const rows = await approach(page);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].altitude >= rows[i - 1].altitude) continue;     // only compare while closing
    expect(rows[i].texW, `texture shrank from ${rows[i - 1].texW} to ${rows[i].texW} while approaching`)
      .toBeGreaterThanOrEqual(rows[i - 1].texW);
  }
});

test('a rung is generated once and then switched to, not rasterised again', async ({ page }) => {
  await inSpace(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const sp = f.space;
    const tex = await import('/universe/js/texture.js');

    // what one rung actually costs to build, for scale
    const t0 = performance.now();
    tex.surfaceTexture(f.planet, f.world, { size: 1024 });
    const buildMs = performance.now() - t0;

    // walk in and back out twice, so every rung is visited more than once
    const walk = async k => {
      sp.state.position.multiplyScalar(k);
      for (let i = 0; i < 40; i++) { sp.refineDetail(1 / 30); await new Promise(r => setTimeout(r, 6)); }
    };
    await walk(4); await walk(0.25); await walk(4); await walk(0.25);

    // now time a burst of tier changes: if anything rasterises, this cannot stay near zero
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) sp.refineDetail(1);
    const switchMs = performance.now() - t1;
    return { buildMs, switchMs };
  });

  // building one rung is tens of milliseconds — several dropped frames. Switching between rungs that
  // already exist has to be far cheaper than building one, or the cache is not being used.
  expect(out.buildMs).toBeGreaterThan(3);
  expect(out.switchMs).toBeLessThan(out.buildMs);
});
