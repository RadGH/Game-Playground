// Round 5 — the six things that were flagged as not built, in the real page.
//
//   1. the star chart on M, and travel between stars with a warp
//   2. quest and pin tracking, on the map, the minimap and in space
//   3. flying down out of orbit without pressing anything
//   4. the habitable start
//   5. the creature brainstorm (a document, covered by tests/docs.test.js)
//   6. water that meets its bank
//
// The node tests cover the maths; these cover what only exists once there is a page.

import { test, expect } from '@playwright/test';

async function land(page, { seed = 11, cls = 'warrior', extra = '' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=${cls}${extra}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

// ---------------------------------------------------------------- 4. the habitable start

test('a habitable start puts you on a lived-in world with more than one biome', async ({ page }) => {
  const errors = await land(page, { seed: 1 });
  const out = await page.evaluate(() => {
    const f = window.farhold;
    const nodes = f.world.nodes || [];
    return {
      planet: f.planet.name,
      towns: nodes.filter(n => n.type === 'settlement' || n.type === 'port').length,
      biomes: new Set(f.world.biome).size,
      inhabited: !!f.planet.surface?.inhabited || !!f.planet.surfaces?.some?.(s => s.inhabited),
      spawnTown: !!f.control.spawn?.town,
    };
  });
  expect(out.towns, `${out.planet} has no settlements`).toBeGreaterThan(0);
  expect(out.biomes, `${out.planet} is a single-biome rock`).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

/**
 * Round 10 changed what the box means. It used to decide whether the seed search ran at all; now the
 * search ALWAYS runs, because "there should be at least one habitable planet in the starting system"
 * — and the box only decides whether you LAND on it. So the thing to check is the landing, not the
 * system: ticked, you are always on a settled multi-biome world; unticked, you may not be.
 */
test('the habitable box decides where you land, not which system you start in', async ({ page }) => {
  const seeds = [1, 4, 6, 12];
  const off = [], on = [];
  for (const seed of seeds) {
    await land(page, { seed, extra: '&habitable=0' });
    off.push(await page.evaluate(() => ({
      name: window.farhold.planet.name,
      liveable: window.farhold.liveableHere(),
      systemHasOne: window.farhold.liveableInSystem(),
    })));
    await land(page, { seed });
    on.push(await page.evaluate(() => ({
      name: window.farhold.planet.name,
      liveable: window.farhold.liveableHere(),
      systemHasOne: window.farhold.liveableInSystem(),
    })));
  }
  // with the box on, every start is a world you can live on
  for (const row of on) expect(row.liveable, `${row.name} is not a habitable start`).toBe(true);
  // and the starting system always holds one, whether or not you chose to land there
  for (const row of off) expect(row.systemHasOne, `${row.name}'s system has nowhere liveable`).toBe(true);
  // the box has to do SOMETHING: at least one of these seeds lands somewhere different with it off
  expect(off.some((row, i) => row.name !== on[i].name || row.liveable !== on[i].liveable)).toBe(true);
});

// ---------------------------------------------------------------- 6. water meeting its bank

test('a river sheet reaches its bank, and lakes have water in them', async ({ page }) => {
  const errors = await land(page, { seed: 1337 });
  const out = await page.evaluate(() => {
    const t = window.farhold.terrain;
    // sample across a river: the water surface must never sit above open ground
    let open = 0, checked = 0, worst = 0;
    for (const r of t.riverPaths.slice(0, 6)) {
      for (let i = 2; i < r.points.length - 2; i += 3) {
        const [x, z] = r.points[i];
        const surface = r.surface[i];
        // just outside the sheet, the ground must be at or above the water line
        for (const side of [1, -1]) {
          const nx = r.points[i + 1][0] - r.points[i - 1][0];
          const nz = r.points[i + 1][1] - r.points[i - 1][1];
          const len = Math.hypot(nx, nz) || 1;
          const px = x + (-nz / len) * side * r.reach, pz = z + (nx / len) * side * r.reach;
          const g = t.heightAt(px, pz);
          checked++;
          if (g < surface - r.depth) { open++; worst = Math.max(worst, surface - g); }
        }
      }
    }
    return { lakes: t.lakes.length, rivers: t.riverPaths.length, checked, open, worst: Math.round(worst) };
  });
  expect(out.rivers).toBeGreaterThan(0);
  expect(out.checked).toBeGreaterThan(50);
  // past the top of the bank the ground may be below the water only where the river runs into the
  // sea; anything more than a few per cent means the carve and the sheet disagree
  expect(out.open / out.checked, `${out.open}/${out.checked} bank samples are below the bed`).toBeLessThan(0.15);
  expect(out.lakes, 'this world has lakes on the map but none in the world').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 2. markers

test('a quest marks itself on the map, the minimap and the tracking list', async ({ page }) => {
  const errors = await land(page, { seed: 1337 });
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.markers.syncQuests([{ id: 'q1', title: 'Carry word to Somewhere', place: { cell: { x: 40, y: 18 }, name: 'Somewhere' } }]);
    const pin = f.markers.drop(20, 20, 'Test pin');
    const tracked = f.markers.tracked();
    const bearing = f.markers.bearing(tracked[0], f.control, f.terrain);
    f.markers.toggle(pin, false);
    return {
      here: f.markers.here().length,
      tracked: tracked.length,
      afterUntrack: f.markers.tracked().length,
      distance: Math.round(bearing.distance),
      finite: Number.isFinite(bearing.angle),
    };
  });
  expect(out.here).toBe(2);
  expect(out.tracked).toBe(2);
  expect(out.afterUntrack).toBe(1);
  expect(out.distance).toBeGreaterThan(0);
  expect(out.finite).toBe(true);

  await page.keyboard.press('KeyM');
  await page.waitForTimeout(400);
  const side = await page.evaluate(() => document.querySelector('#map-screen').innerText);
  expect(side).toContain('TRACKING');
  expect(side).toContain('Carry word to Somewhere');
  expect(side).toContain('Test pin');
  await page.keyboard.press('KeyM');
  expect(errors).toEqual([]);
});

test('a marker stays on the world it was made on', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.markers.drop(10, 10, 'home');
    const before = { here: f.markers.here().length, elsewhere: f.markers.elsewhere().length };
    // pretend we landed somewhere else in the same system
    f.markers.setWorld({ systemSeed: f.systemSeed, planetId: 99, planetName: 'Elsewhere' });
    const after = { here: f.markers.here().length, elsewhere: f.markers.elsewhere().length };
    return { before, after, inSystem: f.markers.inSystem(f.systemSeed).length };
  });
  expect(out.before).toEqual({ here: 1, elsewhere: 0 });
  expect(out.after).toEqual({ here: 0, elsewhere: 1 });
  expect(out.inSystem).toBe(1);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 1. the chart and the jump

test('M opens the world map on the ground and the star chart off it', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => ({ map: window.farhold.map.isOpen, chart: window.farhold.chart.isOpen })))
    .toEqual({ map: true, chart: false });
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(150);

  await page.evaluate(() => window.farhold.toSpace());
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => ({
    map: window.farhold.map.isOpen,
    chart: window.farhold.chart.isOpen,
    level: window.farhold.chart.state.level,
  }));
  // "It should start zoomed in all the way at the solar system level."
  expect(open).toEqual({ map: false, chart: true, level: 'system' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.farhold.chart.isOpen)).toBe(false);
  expect(errors).toEqual([]);
});

test('the chart steps out to the whole galaxy and back', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.toSpace();
    f.chart.toggle(true);
    const seen = [];
    for (const level of ['system', 'neighbourhood', 'sector', 'galaxy']) {
      f.chart.setLevel(level);
      seen.push(f.chart.state.level);
    }
    f.chart.stepLevel(-1);
    const back = f.chart.state.level;
    f.chart.toggle(false);
    return { seen, back, stars: f.galaxy.stars.length, lanes: f.galaxy.lanes.length, here: f.starNow.name };
  });
  expect(out.seen).toEqual(['system', 'neighbourhood', 'sector', 'galaxy']);
  expect(out.back).toBe('sector');
  expect(out.stars).toBeGreaterThan(100);
  expect(out.lanes).toBeGreaterThan(100);
  expect(out.here).toBeTruthy();
  expect(errors).toEqual([]);
});

test('a jump warps for five seconds and comes out in a different system', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  const before = await page.evaluate(() => {
    const f = window.farhold;
    f.markers.drop(8, 8, 'left behind');
    f.toSpace();
    return { star: f.starNow.name, id: f.starId, seed: f.systemSeed, bodies: f.space.bodies.length };
  });

  const started = await page.evaluate(async () => {
    const f = window.farhold;
    const { reachable } = await import('/prototypes/farhold/js/starchart.js');
    const first = reachable(f.galaxy, f.starNow)[0];
    const ok = f.beginJump(first.star);
    return { ok, mode: f.mode, to: first.star.name, ly: Math.round(first.ly), seconds: f.warp.state.seconds };
  });
  expect(started.ok).toBe(true);
  expect(started.mode).toBe('warp');
  expect(started.seconds).toBe(5);
  expect(started.ly).toBeGreaterThan(0);

  // the tunnel ramps in, holds, and ramps out again
  const curve = await page.evaluate(() => {
    const w = window.farhold.warp;
    return [0, 0.1, 0.3, 0.5, 0.8, 0.95, 1].map(t => +w.intensityAt(t).toFixed(2));
  });
  expect(curve[0]).toBe(0);
  expect(curve[curve.length - 1]).toBe(0);
  expect(Math.max(...curve)).toBe(1);
  expect(curve[1]).toBeLessThan(curve[3]);

  await page.waitForFunction(() => window.farhold.mode === 'space', null, { timeout: 40000 });
  const after = await page.evaluate(() => {
    const f = window.farhold;
    return {
      star: f.starNow.name, id: f.starId, seed: f.systemSeed,
      bodies: f.space.bodies.length,
      here: f.markers.here().length, elsewhere: f.markers.elsewhere().length,
    };
  });
  expect(after.id).not.toBe(before.id);
  expect(after.seed).not.toBe(before.seed);
  expect(after.star).toBe(started.to);
  expect(after.bodies).toBeGreaterThan(0);
  // the marker stays with the world it was made on, several hundred light years back
  expect(after.here).toBe(0);
  expect(after.elsewhere).toBe(1);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 3. the approach

test('closing on a world slows the ship and sharpens the world', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.toSpace();
    const s = f.space;
    const body = s.bodies.find(b => b.landable && !b.moon) || s.bodies[0];
    const rows = [];
    for (const alt of [40, 18, 8, 2]) {
      const dir = s.state.position.clone().sub(body.position).normalize();
      s.state.position.copy(body.position).addScaledVector(dir, body.radius * (1 + alt));
      for (let i = 0; i < 10; i++) s.refineDetail(1);
      rows.push({ alt, throttle: +s.throttleLimit().toFixed(2), tier: s.tierFor(alt).key, body: body.tier });
    }
    return rows;
  });
  // the throttle limit falls the whole way in
  for (let i = 1; i < out.length; i++) {
    expect(out[i].throttle, `throttle did not fall from ${out[i - 1].alt} to ${out[i].alt} radii`)
      .toBeLessThanOrEqual(out[i - 1].throttle);
  }
  expect(out[0].throttle).toBeGreaterThan(0.9);
  expect(out[out.length - 1].throttle).toBeLessThan(0.4);
  // and the detail step climbs
  expect(out.map(r => r.tier)).toEqual(['far', 'far', 'near', 'close']);
  expect(errors).toEqual([]);
});

test('you fall into an atmosphere instead of pressing a key at it', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.toSpace();
    const s = f.space;
    const body = s.bodies.find(b => b.landable && !b.moon) || s.bodies[0];
    // park just outside the atmosphere and fly at it, with nobody touching J
    const dir = s.state.position.clone().sub(body.position).normalize();
    s.state.position.copy(body.position).addScaledVector(dir, body.radius * 2.4);
    s.aimAt(body);
    let entered = null;
    for (let i = 0; i < 3000 && !entered; i++) {
      s.aimAt(body);
      s.state.throttle = 1;
      s.update(1 / 30, null, f.camera);
      entered = s.atmosphereEntry();
      if (i % 60 === 0) await new Promise(r => setTimeout(r, 0));
    }
    // hand the frame loop enough turns to notice and switch
    for (let i = 0; i < 240 && f.mode === 'space'; i++) await new Promise(r => requestAnimationFrame(r));
    return { entered: !!entered, mode: f.mode, altitude: entered ? +entered.altitude.toFixed(2) : null };
  });
  expect(out.entered).toBe(true);
  expect(out.altitude).toBeLessThanOrEqual(0.5);
  expect(out.mode).toBe('air');
  expect(errors).toEqual([]);
});

// `scale=1` on purpose: this test is about the view widening as you climb toward a 9 km ceiling, and
// round 10 made the ceiling follow the planet size (a 9 km ceiling on a 16 km world is most of the
// way to space). The scaling itself is covered by tests/round10.test.js.
test('flying high widens the view without costing more triangles', async ({ page }) => {
  // The one slow test in the file: at `scale=1` the clipmap rebuilds twenty-four times over the climb
  // and the dive, which is 13s on an idle machine and comfortably past the 60s default when the box
  // is busy. It is measuring real work, so it gets real headroom rather than a smaller world.
  test.setTimeout(150_000);
  const errors = await land(page, { seed: 11, extra: '&scale=1' });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const ground = f.view.stats();
    f.launch();
    for (let i = 0; i < 400 && f.mode !== 'air'; i++) await new Promise(r => requestAnimationFrame(r));
    if (f.mode !== 'air') return { mode: f.mode };
    // climb
    for (let i = 0; i < 400; i++) { f.air.state.throttle = 0.2; f.air.state.lift = 1; f.air.update(1 / 30, null, f.camera); }
    for (let i = 0; i < 12; i++) await new Promise(r => requestAnimationFrame(r));
    const high = { alt: Math.round(f.air.altitude), ...f.view.stats() };
    // and back down
    for (let i = 0; i < 700; i++) { f.air.state.throttle = 0; f.air.state.lift = -1; f.air.update(1 / 30, null, f.camera); }
    for (let i = 0; i < 12; i++) await new Promise(r => requestAnimationFrame(r));
    const low = { alt: Math.round(f.air.altitude), ...f.view.stats() };
    return { ground, high, low, mode: f.mode };
  });
  expect(out.mode).toBe('air');
  expect(out.ground.viewScale).toBe(1);
  expect(out.high.viewScale, 'the view did not widen with altitude').toBeGreaterThan(2);
  expect(out.high.viewDistance).toBeGreaterThan(out.ground.viewDistance * 2);
  // same geometry, more world
  expect(out.high.triangles).toBe(out.ground.triangles);
  expect(out.low.viewScale, 'the view did not tighten up on the way down').toBeLessThan(out.high.viewScale);
  expect(errors).toEqual([]);
});
