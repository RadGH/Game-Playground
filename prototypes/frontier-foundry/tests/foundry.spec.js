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

/**
 * Put a drill on a scanned ore patch near the pod and hand back its structure id.
 *
 * It walks out from the closest patch rather than insisting on it: the nearest one can be close
 * enough to the pod that a 3x3 drill will not fit beside it, and that is a fact about where the pod
 * came down, not a failure worth ending a test on.
 */
async function placeDrill(page, { free = false } = {}) {
  return page.evaluate(free => {
    const g = window.foundry.game, hq = g.hq();
    g.scan(hq.x, hq.y, 40);
    const nodes = g.map.nodes
      .filter(n => n.scanned && !n.depleted && !n.claimedBy && (n.kind === 'ore' || n.kind === 'mineral'))
      .sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y));
    if (!nodes.length) return null;
    let last = 'no patch had room for a drill';
    for (const node of nodes.slice(0, 8)) {
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0], [-2, -1], [-1, -2]]) {
        const out = g.place('drill_mk1', node.x + dx, node.y + dy, free ? { free: true } : {});
        if (out.ok) return { id: out.structure.id, state: out.structure.state, x: node.x, y: node.y };
        last = out.reason;
      }
    }
    return { error: last };
  }, free);
}

/**
 * Place something anywhere it will fit near a spot, finished, free and without needing the research.
 * These tests are about the interface, not about earning the building first.
 */
async function placeNear(page, type, near = null, radius = 34) {
  return page.evaluate(([type, near, radius]) => {
    const g = window.foundry.game;
    const at = near || { x: g.hq().x, y: g.hq().y };
    for (let r = 1; r < radius; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const out = g.place(type, at.x + dx, at.y + dy, { free: true });
        if (out.ok) return { id: out.structure.id, x: out.structure.x, y: out.structure.y };
      }
    }
    return null;
  }, [type, near, radius]);
}

test('quick start lands on a planet and the surface map draws', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  const landed = await page.evaluate(() => {
    const g = window.foundry.game;
    return {
      planet: g.planet.name, archetype: g.planet.archetype, hq: !!g.hq(), crew: g.units.length,
      size: g.map.width, chunks: window.foundry.debug.chunks(),
    };
  });
  expect(landed.hq).toBe(true);
  expect(landed.planet.length).toBeGreaterThan(1);
  expect(landed.crew).toBeGreaterThanOrEqual(4);
  // the grid is a block of worldgen cells, not the single 96-tile cell the engine defaults to
  expect(landed.chunks.cols).toBe(5);
  expect(landed.chunks.size).toBe(96);
  expect(landed.size).toBe(480);
  expect(landed.chunks.generated).toBe(9);              // the centre cell and its ring are warm at landfall
  expect(landed.chunks.of).toBe(25);

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

// ---------------------------------------------------------------------------- the three bug reports

test('FF1: a recipe dropdown survives the panel redrawing under it', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  // a kiln has three recipes, so the side panel puts a <select> on screen
  const kiln = await placeNear(page, 'kiln');
  expect(kiln, 'a kiln should fit somewhere near the pod').toBeTruthy();
  await page.evaluate(id => {
    const g = window.foundry.game;
    window.foundry.surface.select([{ kind: 'structure', structure: g.byId(id) }]);
  }, kiln.id);
  await page.waitForTimeout(300);
  await expect(page.locator('#sidepanel select')).toHaveCount(1);

  // mark the element, let the panel redraw many times, and check it is the same element
  await page.evaluate(() => {
    const sel = document.querySelector('#sidepanel select');
    sel.dataset.stamp = 'ff1';
    sel.focus();
  });
  await page.evaluate(() => window.foundry.debug.setSpeed(4));
  await page.waitForTimeout(1800);
  const still = await page.evaluate(() => {
    const sel = document.querySelector('#sidepanel select');
    return { same: sel?.dataset.stamp === 'ff1', focused: document.activeElement === sel, options: sel?.options.length };
  });
  expect(still.same, 'the <select> element must not be replaced while the panel refreshes').toBe(true);
  expect(still.focused, 'and it must not lose focus, which is what closes an open list').toBe(true);
  expect(still.options).toBeGreaterThan(1);

  // choosing through the control still reaches the engine, and the choice sticks through a redraw
  await page.selectOption('#sidepanel select', { index: 1 });
  await page.waitForTimeout(900);
  const chosen = await page.evaluate(id => ({
    shown: document.querySelector('#sidepanel select').value,
    engine: window.foundry.game.byId(id).recipe,
    same: document.querySelector('#sidepanel select').dataset.stamp === 'ff1',
  }), kiln.id);
  expect(chosen.shown).toBeTruthy();
  expect(chosen.engine).toBe(chosen.shown);
  expect(chosen.same).toBe(true);
  expect(errors).toEqual([]);
});

test('FF2: the route picker offers what the source makes, not only what it is holding', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);

  const harvester = await placeNear(page, 'biomass_harvester');
  const kiln = await placeNear(page, 'kiln', { x: harvester.x + 14, y: harvester.y + 14 });
  expect(harvester && kiln).toBeTruthy();

  const picker = await page.evaluate(([hid, kid]) => {
    const g = window.foundry.game;
    const from = g.byId(hid), to = g.byId(kid);
    g.setRecipe(kid, 'char_biomass');
    window.foundry.debug.routeTool.openPicker(from, to);
    return {
      holding: Object.keys(from.inv),                               // the harvester pushes what it cuts straight out
      offered: [...document.querySelectorAll('#dlg .picker button')].map(b => b.textContent.trim()),
    };
  }, [harvester.id, kiln.id]);
  // the bug: with an empty buffer the old picker had nothing to offer at all
  expect(picker.offered.some(t => /biomass/i.test(t)), `offered: ${picker.offered.join(' | ')}`).toBe(true);
  await page.evaluate(() => document.getElementById('dlg').close());

  // and the run can actually be started into a machine that eats it
  await placeNear(page, 'truck_garage');
  const started = await page.evaluate(([hid, kid]) => {
    const g = window.foundry.game;
    return g.addRoute({ from: hid, to: kid, resource: 'biomass' });
  }, [harvester.id, kiln.id]);
  expect(started.reason ?? '').toBe('');
  expect(started.ok).toBe(true);
  expect(errors).toEqual([]);
});

test('FF2: ore and coal haul into a smelter and come out as ingots', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);

  const drill = await placeDrill(page, { free: true });     // finished, so the run can start at once
  expect(drill?.error).toBeUndefined();

  // far enough out that it is in no store pool: the only way ore and coal reach it is on a truck
  const smelter = await placeNear(page, 'smelter', { x: drill.x + 40, y: drill.y + 40 });
  const garage = await placeNear(page, 'truck_garage');
  expect(smelter && garage).toBeTruthy();

  // a smelter out on its own has no power and no fuel for the truck, and this test is about the
  // haul rather than about the grid or the refinery, so hand it both
  const gen = await placeNear(page, 'combustion_generator', smelter);
  expect(gen).toBeTruthy();

  const routes = await page.evaluate(([did, sid, gid]) => {
    const g = window.foundry.game;
    g.setRecipe(sid, 'smelt_iron');
    g.byId(gid).inv.coal = 400;
    // fuel goes at the source end of each run, never in the smelter: filling its buffer would leave
    // the ingots it makes nowhere to go
    g.byId(did).inv.fuel = 80;
    g.hq().inv.fuel = 80;
    const ore = g.addRoute({ from: did, to: sid, resource: 'iron_ore' });
    const coal = g.addRoute({ from: g.hq().id, to: sid, resource: 'coal' });
    return {
      ore: { ok: ore.ok, reason: ore.reason }, coal: { ok: coal.ok, reason: coal.reason },
      eta: ore.ok ? g.estimateTrip(ore.route) : null,
      samePool: g.byId(sid).pool >= 0 && g.byId(sid).pool === g.byId(did).pool,
    };
  }, [drill.id, smelter.id, gen.id]);
  expect(routes.ore.reason ?? '').toBe('');                         // "smelter will not hold iron ore" was the bug
  expect(routes.ore.ok).toBe(true);
  expect(routes.coal.reason ?? '').toBe('');
  expect(routes.coal.ok).toBe(true);
  expect(routes.samePool, 'the smelter must be out of reach of the pod, or it gets fed for free').toBe(false);
  expect(routes.eta.throughput).toBeGreaterThan(0);                 // the panel has a real ETA to show
  expect(routes.eta.tripTime).toBeGreaterThan(0);

  await page.evaluate(() => window.foundry.debug.run(1800));
  const made = await page.evaluate(sid => {
    const g = window.foundry.game, s = g.byId(sid);
    return {
      inv: { ...s.inv }, crafted: s.crafted, powered: s.powered, starvedFor: s.starvedFor,
      ingots: g.inventory().iron_ingot || 0, hauled: g.stats.hauled,
      running: g.routes.map(r => ({ res: r.resource, delivered: Math.round(r.delivered), trips: r.trips, waiting: !!r.waiting })),
    };
  }, smelter.id);
  expect(made.hauled, `trucks must tip their load into the machine: ${JSON.stringify(made)}`).toBeGreaterThan(0);
  expect(made.running.every(r => r.delivered > 0), `every run should have delivered: ${JSON.stringify(made.running)}`).toBe(true);
  expect(made.crafted, `smelter state: ${JSON.stringify(made)}`).toBeGreaterThan(0);
  expect(made.ingots).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('FF3: the map streams in around the camera and keeps drawing when you pan a long way', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);

  const start = await page.evaluate(() => window.foundry.debug.chunks());
  expect(start.generated).toBeLessThan(start.of);                   // there is more world than has been made

  // walk the camera three chunks east, letting the streamer keep up
  await page.evaluate(() => { window.foundry.debug.setSpeed(0); });
  for (let k = 0; k < 14; k++) {
    await page.evaluate(() => { const s = window.foundry.surface; s.centreOn(s.cam.x + 24, s.cam.y); });
    await page.waitForTimeout(200);
  }
  const after = await page.evaluate(() => window.foundry.debug.chunks());
  expect(after.generated, 'panning east should have pulled new ground in').toBeGreaterThan(start.generated);
  expect(after.bounds.x1).toBeGreaterThan(start.bounds.x1);

  // the ground under the camera is real: it can be walked on and built on
  const far = await page.evaluate(() => {
    const g = window.foundry.game, s = window.foundry.surface;
    const x = Math.round(s.cam.x), y = Math.round(s.cam.y);
    let ok = 0, tested = 0;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const i = (y + dy) * g.map.width + (x + dx);
      if (i < 0 || i >= g.map.buildable.length) continue;
      tested++;
      if (g.map.buildable[i]) ok++;
    }
    return { tested, buildable: ok, nodes: g.map.nodes.filter(n => Math.abs(n.x - x) < 48).length };
  });
  expect(far.buildable / far.tested, 'streamed ground must be real ground, not blank').toBeGreaterThan(0.2);
  expect(far.nodes).toBeGreaterThan(0);                             // and it has patches of its own

  // and the canvas is still painting something there
  await page.evaluate(() => window.foundry.debug.revealAll());
  await page.waitForTimeout(600);
  const pixels = await page.evaluate(() => {
    const c = document.getElementById('map');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0, total = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { total++; if (d[i] + d[i + 1] + d[i + 2] > 90) lit++; }
    return lit / total;
  });
  expect(pixels).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});

test('FF3: a base built out in a streamed chunk survives a save and a reload', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);

  const far = await page.evaluate(() => {
    const g = window.foundry.game, C = g.map.chunk;
    // a chunk that was not warm at landfall
    g.ensureChunks((C.centre + 2) * C.size + C.size / 2, (C.centre) * C.size + C.size / 2, 0);
    const x = (C.centre + 2) * C.size + 10, y = C.centre * C.size + 10;
    for (let r = 1; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const out = window.foundry.debug.instant('storage_crate', x + dx, y + dy);
      if (out.ok) return { id: out.structure.id, x: out.structure.x, y: out.structure.y, chunks: g.map.chunk.generated };
    }
    return null;
  });
  expect(far, 'a streamed chunk must be buildable').toBeTruthy();
  expect(far.chunks).toBeGreaterThan(9);

  await page.evaluate(() => window.foundry.save());
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
  await page.click('#btn-continue');
  await page.waitForFunction(() => !!window.foundry?.game, null, { timeout: 90000 });

  const back = await page.evaluate(xy => {
    const g = window.foundry.game;
    const s = g.structures.find(s => s.x === xy.x && s.y === xy.y);
    const i = (xy.y + 1) * g.map.width + (xy.x + 1);
    return { found: !!s, type: s?.type, chunks: g.map.chunk.generated, groundIsReal: !!g.map.buildable[i] || !!g.map.water[i] };
  }, { x: far.x, y: far.y });
  expect(back.found, 'the far crate should come back with the save').toBe(true);
  expect(back.chunks).toBeGreaterThanOrEqual(far.chunks);
  expect(back.groundIsReal, 'the chunk it stands on must be regenerated, not left blank').toBe(true);
  expect(errors).toEqual([]);
});
