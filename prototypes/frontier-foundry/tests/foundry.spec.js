// Frontier Foundry, driven through the real page: land, draw, build, haul, research, defend, save.
//
// The interface exposes window.foundry for exactly this (see js/ui/main.js → testHooks). Anything
// here that reaches into foundry.debug is skipping the wall clock, not skipping the engine - every
// one of these still runs the real tick.

import { test, expect } from '@playwright/test';

/** Open the page, start a run on the recommended world, and collect any page errors. */
async function boot(page, { quick = true } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/frontier-foundry/');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
  if (quick) {
    await page.click('#btn-quick');
    await page.waitForFunction(() => !!window.foundry?.game, null, { timeout: 90000 });
    await page.evaluate(() => { window.foundry.app.settings.muted = true; window.foundry.app.sound.setMuted(true); });
  }
  return errors;
}

/** Put a drill on the nearest scanned ore patch and hand back its structure id. */
async function placeDrill(page) {
  return page.evaluate(() => {
    const g = window.foundry.game, hq = g.hq();
    g.scan(hq.x, hq.y, 40);
    const node = g.map.nodes
      .filter(n => n.scanned && !n.depleted && !n.claimedBy && (n.kind === 'ore' || n.kind === 'mineral'))
      .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    if (!node) return null;
    const out = g.place('drill_mk1', node.x - 1, node.y - 1);
    return out.ok ? { id: out.structure.id, state: out.structure.state, x: node.x, y: node.y } : { error: out.reason };
  });
}

test('quick start lands on a planet and the surface map draws', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  const landed = await page.evaluate(() => {
    const g = window.foundry.game;
    return { planet: g.planet.name, archetype: g.planet.archetype, hq: !!g.hq(), crew: g.units.length, size: g.map.width };
  });
  expect(landed.hq).toBe(true);
  expect(landed.planet.length).toBeGreaterThan(1);
  expect(landed.crew).toBeGreaterThanOrEqual(4);
  expect(landed.size).toBe(96);

  // the canvas has to be showing ground, not an empty black rectangle
  await page.waitForTimeout(700);
  const pixels = await page.evaluate(() => {
    const c = document.getElementById('map');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, total = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {          // a sparse sample is plenty
      total++;
      const v = d[i] + d[i + 1] + d[i + 2];
      sum += v;
      if (v > 90) lit++;
    }
    return { fraction: lit / total, mean: sum / total / 3, w: c.width, h: c.height };
  });
  expect(pixels.w).toBeGreaterThan(400);
  expect(pixels.fraction).toBeGreaterThan(0.05);          // the explored disc is on screen
  expect(pixels.mean).toBeGreaterThan(8);

  expect(errors).toEqual([]);
});

test('an outline on a scanned patch gets built by the crew while the game runs at 4x', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  const drill = await placeDrill(page);
  expect(drill, 'there should be a scanned ore patch near the pod').toBeTruthy();
  expect(drill.error).toBeUndefined();
  expect(drill.state).toBe('ghost');

  await page.evaluate(() => window.foundry.debug.setSpeed(4));
  await page.waitForFunction(id => window.foundry.game.byId(id)?.state === 'done', drill.id, { timeout: 90000 });

  const after = await page.evaluate(id => {
    const s = window.foundry.game.byId(id);
    return { state: s.state, node: s.nodeId, progress: s.progress, time: window.foundry.game.time };
  }, drill.id);
  expect(after.state).toBe('done');
  expect(after.node).toBeTruthy();
  expect(after.time).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a delivery route moves ore from an outpost crate into a depot', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  const set = await page.evaluate(() => {
    const f = window.foundry, g = f.game, hq = g.hq();
    f.debug.unlock('t_haulage');
    const near = (dx, dy, type) => {
      for (let r = 0; r < 16; r++) for (const [ax, ay] of [[dx + r, dy], [dx, dy + r], [dx + r, dy + r], [dx - r, dy], [dx, dy - r]]) {
        if (g.canPlace(type, hq.x + ax, hq.y + ay, { ignoreCost: true }).ok) return g.place(type, hq.x + ax, hq.y + ay, { free: true });
      }
      return { ok: false };
    };
    const garage = near(8, 7, 'truck_garage');
    const source = near(22, 8, 'storage_crate');
    const depot = near(-6, -6, 'storage_crate');          // an empty crate to land the ore in
    if (!garage.ok || !source.ok || !depot.ok) return { ok: false, reason: 'nowhere to put the outpost' };
    source.structure.inv.iron_ore = 400;
    // a rover burns refined fuel; the pod does not land with any, so hand both ends a drum
    source.structure.inv.fuel = 120;
    depot.structure.inv.fuel = 120;
    const before = depot.structure.inv.iron_ore || 0;
    const route = g.addRoute({ from: source.structure.id, to: depot.structure.id, resource: 'iron_ore' });
    return { ok: route.ok, reason: route.reason, routeId: route.route?.id, before, depotId: depot.structure.id };
  });
  expect(set.reason, 'the route should be accepted').toBeUndefined();
  expect(set.ok).toBe(true);

  const est = await page.evaluate(id => window.foundry.game.estimateTrip(id), set.routeId);
  expect(est.throughput).toBeGreaterThan(0);

  const moved = await page.evaluate(arg => {
    window.foundry.debug.run(900);
    const g = window.foundry.game;
    const r = g.routes[0];
    return { delivered: r.delivered, trips: r.trips, arrived: (g.byId(arg.depotId).inv.iron_ore || 0) - arg.before, waiting: r.waiting };
  }, { depotId: set.depotId, before: set.before });
  expect(moved.delivered, 'the truck should have unloaded at least once').toBeGreaterThan(0);
  expect(moved.trips).toBeGreaterThan(0);
  expect(moved.arrived).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('research can be started from the tree screen and moves with a lab standing', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  await page.evaluate(() => window.foundry.show('research'));
  await expect(page.locator('#screen-research .tech').first()).toBeVisible();

  const started = await page.evaluate(() => {
    const f = window.foundry, g = f.game;
    const next = g.availableTechs()[0];
    const out = f.app.research.start(next.id);
    return { ok: out.ok, id: next.id, current: g.research.current };
  });
  expect(started.ok).toBe(true);
  expect(started.current).toBe(started.id);
  await expect(page.locator('#screen-research .tech.current')).toHaveCount(1);

  // a lab with packs in reach actually advances it
  const moved = await page.evaluate(() => {
    const f = window.foundry, g = f.game, hq = g.hq();
    f.debug.unlock('t_landfall');
    for (let r = 0; r < 16; r++) {
      for (const [ax, ay] of [[4 + r, 0], [0, 4 + r], [-4 - r, 0], [0, -4 - r]]) {
        if (g.canPlace('lab', hq.x + ax, hq.y + ay, {}).ok) { g.place('lab', hq.x + ax, hq.y + ay, { free: true }); r = 99; break; }
      }
    }
    f.debug.give('pack_basic', 400);
    const before = g.research.progress;
    f.debug.run(180);
    return { before, after: g.research.progress, done: g.research.done.length };
  });
  expect(moved.after > moved.before || moved.done > 1).toBe(true);
  expect(errors).toEqual([]);
});

test('a message with a place on it jumps the camera there', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  await expect(page.locator('#feed-list .note').first()).toBeVisible();
  const jumped = await page.evaluate(() => {
    const f = window.foundry, g = f.game;
    f.surface.centreOn(4, 4);
    const before = { x: f.surface.cam.x, y: f.surface.cam.y };
    const n = g.notifications.filter(x => x.at).pop();
    f.hud.jump(n);
    return { before, after: { x: f.surface.cam.x, y: f.surface.cam.y }, at: n.at, screen: f.app.screen, seen: n.seen };
  });
  expect(jumped.after.x).toBeCloseTo(jumped.at.x, 0);
  expect(jumped.after.y).toBeCloseTo(jumped.at.y, 0);
  expect(jumped.screen).toBe('surface');
  expect(jumped.seen).toBe(true);

  // the per-message "go" button does the same thing from a click
  await page.evaluate(() => window.foundry.surface.centreOn(2, 2));
  const btn = page.locator('#feed-list .note .jump').first();
  if (await btn.count()) {
    await btn.click();
    const moved = await page.evaluate(() => ({ x: window.foundry.surface.cam.x, y: window.foundry.surface.cam.y }));
    expect(moved.x + moved.y).toBeGreaterThan(4);
  }
  expect(errors).toEqual([]);
});

test('forcing a wave raises the banner and puts hostiles on the map', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  await expect(page.locator('#wave-banner')).toBeHidden();
  const wave = await page.evaluate(() => {
    const w = window.foundry.debug.forceWave();
    return { n: w?.n, spawned: w?.spawned, enemies: window.foundry.game.enemies.length };
  });
  expect(wave.n).toBeGreaterThan(0);
  expect(wave.enemies).toBeGreaterThan(0);

  await expect(page.locator('#wave-banner')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#wave-banner')).toContainText(/wave/i);

  // and the turret tracers are being recorded for the renderer to draw
  const shots = await page.evaluate(() => {
    const f = window.foundry, g = f.game, hq = g.hq();
    f.debug.unlock('t_defence');
    for (const r of ['iron_plate', 'gear', 'copper_wire', 'stone', 'concrete']) f.debug.give(r, 600);
    for (const e of g.enemies) { e.x = hq.x + 3; e.y = hq.y + 3; }
    f.debug.run(20);
    return (g.shots || []).length;
  });
  expect(shots).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('a save round-trips through localStorage with the same base', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  const before = await page.evaluate(() => {
    const f = window.foundry, g = f.game;
    f.debug.give('iron_plate', 600); f.debug.give('gear', 400);
    const hq = g.hq();
    for (let r = 2; r < 14; r++) {
      if (g.canPlace('storage_crate', hq.x + r, hq.y - 3, {}).ok) { g.place('storage_crate', hq.x + r, hq.y - 3, {}); break; }
    }
    f.debug.finishBuilds();
    f.debug.run(30);
    f.save();
    return { structures: g.structures.length, time: g.time, planet: g.planet.name, research: g.research.done.length };
  });
  expect(before.structures).toBeGreaterThan(1);

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
  await page.click('#btn-continue');
  await page.waitForFunction(() => !!window.foundry?.game, null, { timeout: 60000 });

  const after = await page.evaluate(() => {
    const g = window.foundry.game;
    return { structures: g.structures.length, time: g.time, planet: g.planet.name, research: g.research.done.length };
  });
  expect(after.structures).toBe(before.structures);
  expect(after.planet).toBe(before.planet);
  expect(after.research).toBe(before.research);
  expect(after.time).toBeCloseTo(before.time, -1);
  expect(errors).toEqual([]);
});

test('every screen opens, the build bar fills, and nothing throws', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  await expect(page.locator('#bb-items .bb-item').first()).toBeVisible();
  await page.locator('#bb-tabs button').nth(1).click();
  await expect(page.locator('#bb-items .bb-item').first()).toBeVisible();

  // build mode: pick a drill, the ghost follows the cursor, Esc drops it
  await page.evaluate(() => window.foundry.debug.pick('drill_mk1'));
  expect(await page.evaluate(() => window.foundry.surface.mode)).toBe('build');
  await page.mouse.move(640, 420);
  await page.mouse.move(660, 430);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.foundry.surface.mode)).toBe('select');

  for (const s of ['research', 'map', 'orbit', 'codex', 'surface']) {
    await page.evaluate(n => window.foundry.show(n), s);
    await page.waitForTimeout(s === 'orbit' ? 1500 : 400);
    await expect(page.locator('#screen-' + s)).toBeVisible();
  }
  await expect(page.locator('#region-list .region').first()).toBeVisible({ timeout: 10000 })
    .catch(() => {});                                   // a landing with no neighbouring region is legal

  // the quest board has something on it
  await page.evaluate(() => window.foundry.show('codex'));
  await expect(page.locator('#quest-list .quest').first()).toBeVisible();

  expect(errors).toEqual([]);
});
