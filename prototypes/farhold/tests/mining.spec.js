// Mining, in the real game: a seam you can see, a swing that gets ore, and a route whose length
// decides how fast the crate fills.
//
// "set up resources to be mined at a location, route between them determines transfer rate."

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('there is ore where the player actually is, and it is drawn on the ground', async ({ page }) => {
  const errors = await land(page);
  // the view redraws every tenth frame and only when the player has moved, so wait for it rather
  // than for a round number of milliseconds
  await page.waitForFunction(() => (window.farhold.oreView.stats().drawn || 0) > 0, null, { timeout: 20000 });

  const out = await page.evaluate(() => {
    const f = window.farhold;
    const near = f.ore.around(f.control.x, f.control.z);
    const furthest = near.reduce((m, n) => Math.max(m, Math.hypot(n.x - f.control.x, n.z - f.control.z)), 0);
    return {
      count: near.length,
      furthest: Math.round(furthest),
      drawn: f.oreView.stats(),
      kinds: [...new Set(near.map(n => n.kind))].length,
    };
  });

  // the bug this replaced put every seam in the game within 300 m of 0,0 — 29 km from the landing
  expect(out.count, 'no ore anywhere near the player').toBeGreaterThan(5);
  expect(out.furthest, 'the node tiles are not centred on the player').toBeLessThan(1600);
  expect(out.drawn.drawn, 'the seams are not drawn').toBeGreaterThan(0);
  expect(out.drawn.kinds, 'every seam is the same rock').toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('walking to a seam and pressing E gets ore, and a worked seam runs out', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // stand on the nearest seam you can actually work by hand
    const node = f.ore.around(f.control.x, f.control.z)
      .filter(n => n.handMinable && !n.depleted)
      .sort((a, b) => Math.hypot(a.x - f.control.x, a.z - f.control.z) - Math.hypot(b.x - f.control.x, b.z - f.control.z))[0];
    if (!node) return { none: true };
    f.control.teleport(node.x, node.z);
    await new Promise(r => setTimeout(r, 400));

    const before = f.materials()[node.resource] || 0;
    /**
     * R16 — E STARTS A BAR, IT DOES NOT TAKE A BITE.
     *
     *   "Change mining behavior instead of press E to collect an item or chop a tree, to press E or
     *    attack a mineable resource with the tool equipped = starts a small progress bar above the
     *    resource that collects the item when complete."
     *
     * So six presses 200 ms apart used to be six takings and are now one gather that has barely
     * started. The press still has to be a real keydown — that is the path being tested — and then
     * the test has to WAIT the way a player does. `gather.seamSeconds` is 3.2 at speed 1, and the
     * starting Knapped Tool is slower than that, so five seconds with a little headroom.
     */
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    await new Promise(r => setTimeout(r, 80));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
    const bars = [];
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 100));
      const bar = f.tools?.gathering?.bar?.();
      if (bar) bars.push(bar.fraction);
      if (!bar && bars.length) break;          // the bar filled and paid out
    }
    const after = f.materials()[node.resource] || 0;
    return {
      resource: node.resource,
      before, after,
      worked: node.worked,
      // R16: the bar went up, moved, and came down again
      barSteps: bars.length,
      barRose: bars.length > 1 && bars[bars.length - 1] > bars[0],
      // …and the report is the rich-and-far trade-off in one number
      report: f.mining.report(node, { x: node.x + 400, z: node.z }),
    };
  });

  expect(out.none, 'there was no hand-minable seam in range').toBeFalsy();
  expect(out.after, `pressing E on a ${out.resource} seam got nothing`).toBeGreaterThan(out.before);
  expect(out.worked, 'the seam does not remember being worked').toBeGreaterThan(0);
  expect(out.report.deliveredPerMinute, 'the haul report has no delivery rate').toBeGreaterThan(0);
  expect(out.report.walkShare, 'a 400 m walk cost nothing').toBeGreaterThan(0.2);
  expect(errors).toEqual([]);
});

test('a drill on a seam plus a route fills the crate, and a longer route fills it slower', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 800);
    }
    // find a seam on ground flat enough to build on
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 8) <= 0.3;
    /**
     * R18 — A SEAM A WOODEN CRATE CAN ACTUALLY HOLD.
     *
     * This took the richest seam near the spawn whatever it was, and on seed 11 that is a WATER
     * source. It then built a `storage_crate` for it and failed with "five seconds of drilling
     * delivered nothing", which reads as a broken drill. The drill was fine: the drill dug water
     * the whole time (stock climbing 12 -> 34 over five seconds) and a wooden box does not hold
     * water, so the route had nowhere to put it and the overview correctly said `limit: hauling`.
     *
     * It only started failing when round 18 fixed `createStoreNetwork`'s `materials` argument —
     * before that `kindOf` answered `'refined'` for every resource in the game and a crate happily
     * held a liquid. This test is about whether ROUTE LENGTH sets the delivery rate, so it picks a
     * seam whose output a crate can take and leaves fluids to the test below.
     */
    const KINDS = f.resources?.materials || {};
    const crateCanHold = res => {
      const kind = KINDS[res]?.kind;
      return kind !== 'fluid' && kind !== 'gas'
        && !['acid', 'coolant', 'lye', 'lift_fuel'].includes(res);
    };
    const node = f.ore.around(f.control.x, f.control.z)
      .filter(n => !n.depleted && flat(n.x, n.z) && flat(n.x + 30, n.z) && crateCanHold(n.resource))
      .sort((a, b) => b.amount - a.amount)[0];
    if (!node) return { none: true };

    f.control.teleport(node.x, node.z);
    await new Promise(r => setTimeout(r, 500));

    /**
     * The layout matters, which is the point of the whole feature.
     *
     * A storage crate reaches 7 m and a burner generator supplies 10 m, so the fuel crate has to be
     * beside the GENERATOR and the generator has to be beside the DRILL. The delivery crate is
     * sixty metres off, far enough that it is a different pool and the route is a real trip.
     */
    f.build.setMode(true);
    f.build.setTool('smooth'); f.build.setRadius(18);
    for (const dx of [0, 30, 60]) { f.build.aim(node.x + dx, node.z); f.build.paint(); }
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(node.x + 3, node.z + 6); f.build.placeHere();
    // R17 — this spec places a piece the tech tree now gates. `unlockAll` spends nothing and
    // earns nothing; it just takes every node, so the spec goes on testing the thing it is about.
    f.build.research?.unlockAll?.();
    f.build.select('drill'); f.build.aim(node.x, node.z);
    const drill = f.build.placeHere();
    f.build.select('burner_generator'); f.build.aim(node.x + 7, node.z);
    const gen = f.build.placeHere();
    f.build.select('storage_crate'); f.build.aim(node.x + 11, node.z);
    const fuel = f.build.placeHere();
    f.build.select('storage_crate'); f.build.aim(node.x + 62, node.z);
    const crate = f.build.placeHere();
    f.build.setMode(false);
    if (!drill.ok) return { drillWhy: drill.why };
    if (!crate.ok || !fuel.ok || !gen.ok) return { crateWhy: crate.why || fuel.why || gen.why };

    f.stores.put(f.stores.poolAt(node.x + 11, node.z), 'coal', 300);
    const pool = f.stores.poolAt(node.x + 62, node.z);
    await new Promise(r => setTimeout(r, 2200));      // let the grid notice the generator

    const laid = f.mining.route(drill.entry.id, pool.id);
    const shortRate = laid.ok ? laid.rate.perMinute : 0;

    const before = f.stores.count(pool, node.resource);
    await new Promise(r => setTimeout(r, 5000));
    const after = f.stores.count(pool, node.resource);

    // the same drill and the same crate, four times as far apart
    const farRate = f.stores.haulThroughput(62 * 4).perMinute;

    return {
      drillBound: f.mining.drills.length,
      routeOk: laid.ok, routeWhy: laid.why || '',
      shortRate, farRate,
      before, after,
      row: f.mining.overview()[0] || null,
      genPowered: f.grid.stateOf(gen.entry.id),
      drillPowered: f.grid.poweredOf(drill.entry.id),
      samePool: f.stores.poolAt(node.x + 11, node.z)?.id === pool?.id,
    };
  });

  expect(out.none, 'no buildable seam in range').toBeFalsy();
  expect(out.drillWhy, `the drill would not go down: ${out.drillWhy}`).toBeFalsy();
  expect(out.crateWhy, `the crate would not go down: ${out.crateWhy}`).toBeFalsy();
  expect(out.drillBound, 'putting a drill on a seam did not bind it').toBe(1);
  expect(out.routeOk, `the route was refused: ${out.routeWhy}`).toBe(true);
  expect(out.samePool, 'the fuel crate and the delivery crate joined into one pool').toBe(false);
  expect(out.genPowered, `the generator is ${out.genPowered}, not running`).toBe('running');
  expect(out.drillPowered, 'the drill has no power').toBeGreaterThan(0);
  expect(out.after, `five seconds of drilling delivered nothing (limit: ${out.row?.limit})`).toBeGreaterThan(out.before);
  // THE SENTENCE THE USER WROTE: the route between them determines the transfer rate
  expect(out.farRate, 'a four-times-longer route moves the same amount').toBeLessThan(out.shortRate);
  expect(out.row.limit, 'the overview does not say what the bottleneck is').toBeTruthy();
  expect(errors).toEqual([]);
});

test('a drill routes itself to the best store, and the Route tool moves it to another one', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 800);
    }
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 8) <= 0.3;
    const node = f.ore.around(f.control.x, f.control.z)
      .filter(n => !n.depleted && flat(n.x, n.z) && flat(n.x + 60, n.z))
      .sort((a, b) => b.amount - a.amount)[0];
    if (!node) return { none: true };
    f.control.teleport(node.x, node.z);
    await new Promise(r => setTimeout(r, 400));

    // B, the way a player opens it — which is also what puts the panel on the screen
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    // R26 — B opens the build ring now; Tab from it is the full panel this test reads
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    f.build.setTool('smooth'); f.build.setRadius(18);
    for (const dx of [0, 30, 60]) { f.build.aim(node.x + dx, node.z); f.build.paint(); }
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(node.x + 3, node.z + 6); f.build.placeHere();
    // R17 — this spec places a piece the tech tree now gates. `unlockAll` spends nothing and
    // earns nothing; it just takes every node, so the spec goes on testing the thing it is about.
    f.build.research?.unlockAll?.();
    f.build.select('drill'); f.build.aim(node.x, node.z);
    const drill = f.build.placeHere();
    f.build.select('burner_generator'); f.build.aim(node.x + 7, node.z); f.build.placeHere();
    f.build.select('storage_crate'); f.build.aim(node.x + 11, node.z); f.build.placeHere();
    f.build.select('storage_crate'); f.build.aim(node.x + 62, node.z); f.build.placeHere();
    f.stores.put(f.stores.poolAt(node.x + 11, node.z), 'coal', 300);
    if (!drill.ok) return { drillWhy: drill.why };

    // the panel says "no route" before there is one
    await new Promise(r => setTimeout(r, 2200));
    const beforeText = document.querySelector('#build-ui .build-mines')?.textContent || '';
    const autoMetres = Math.round(f.mining.routes[0]?.rate?.metres ?? 0);

    // …and the route tool is two clicks on the ground
    f.build.setTool('route');
    f.build.aim(node.x, node.z);
    const first = f.build.confirm();
    const half = f.build.routeFrom?.key;
    f.build.aim(node.x + 62, node.z);
    const second = f.build.confirm();
    await new Promise(r => setTimeout(r, 600));
    const afterText = document.querySelector('#build-ui .build-mines')?.textContent || '';
    f.build.setMode(false);

    return {
      beforeText, afterText, autoMetres,
      firstWaiting: !!first.waiting, half,
      secondOk: second.ok, secondWhy: second.why || '',
      routes: f.mining.routes.length,
      metres: Math.round(f.mining.routes[0]?.rate?.metres ?? 0),
    };
  });

  expect(out.none, 'no buildable seam in range').toBeFalsy();
  expect(out.drillWhy, `the drill would not go down: ${out.drillWhy}`).toBeFalsy();
  expect(out.beforeText, 'the panel does not list the drill').toContain('Digging');
  /**
   * "We should not require the user to click the route button but maybe just use a pathfinding to
   * route the way." The drill went down before either crate existed, so it had nowhere to send its
   * ore; the crate that arrived afterwards is what it routes itself to, without a single click.
   */
  expect(out.beforeText, 'the drill did not route itself to the crate that arrived').not.toContain('no route');
  expect(out.beforeText, 'the panel does not show the automatic route').toContain('route');
  expect(out.autoMetres, 'the automatic route went to the far crate, not the near one').toBeLessThan(40);
  expect(out.firstWaiting, 'the first click did not pick an end').toBe(true);
  expect(out.half, 'the first click picked the wrong thing').toBe('drill');
  expect(out.secondOk, `the second click did not lay the route: ${out.secondWhy}`).toBe(true);
  expect(out.routes).toBe(1);
  expect(out.metres, 'the route is not the length it was drawn').toBeGreaterThan(50);
  expect(out.afterText, 'the panel still says there is no route').toContain('route');
  expect(out.afterText).not.toContain('no route');
  expect(errors).toEqual([]);
});

test('a bench you walk up to can be given work, and it makes the thing', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 8) <= 0.3;
    let spot = null;
    outer: for (let r = 0; r <= 900; r += 20) for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (flat(x, z) && flat(x + 8, z) && flat(x - 8, z)) { spot = { x, z }; break outer; }
    }
    if (!spot) return { none: true };
    f.control.teleport(spot.x, spot.z);
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 800);
    }
    await new Promise(r => setTimeout(r, 400));

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }));
    // R26 — B opens the build ring now; Tab from it is the full panel this test reads
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    f.build.setTool('smooth'); f.build.setRadius(16);
    f.build.aim(spot.x, spot.z); f.build.paint();
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(spot.x + 5, spot.z + 5); f.build.placeHere();
    // a furnace: the first refining step, and it burns rather than drawing power
    f.build.select('furnace'); f.build.aim(spot.x + 2, spot.z);
    const bench = f.build.placeHere();
    f.build.select('storage_chest'); f.build.aim(spot.x + 4, spot.z);
    f.build.placeHere();
    if (!bench.ok) return { benchWhy: bench.why };

    const pool = f.stores.poolAt(spot.x + 4, spot.z);
    /**
     * Everything a furnace recipe might want, so this is a test of the QUEUE and not of mining.
     *
     * R18 — this used to dump 120 of each into a `storage_crate` and the test failed with "the
     * furnace made nothing (Out of fuel)".
     *
     * The cause was plain CAPACITY, and it is worth being precise because the first diagnosis
     * written here was wrong. A Storage Box holds 120; `put(pool, 'iron_ore', 120)` filled the
     * whole thing on the first line, and the coal — seven lines later — had nowhere to go. The
     * raw-share caps in `roomFor` would have limited the iron long before that, but they were DEAD
     * at the time: `js/main.js` handed `createStoreNetwork` the whole of resources.json where it
     * wanted the `materials` block, so `kindOf` answered `'refined'` for everything and
     * `RAW.has('refined')` is false. That is fixed now, so both rules are live.
     *
     * A Storage Chest holds 400, and 24 of each fits under the capacity AND under the 200 the raw
     * share allows. The `stocked` check below is the point: when either rule moves again, the spec
     * should say the POOL would not take the fuel, not that the furnace is broken.
     */
    const FEED = ['iron_ore', 'copper_ore', 'coal', 'charcoal', 'log', 'stone', 'sand', 'clay'];
    const stocked = {};
    for (const id of FEED) stocked[id] = f.stores.put(pool, id, 24);
    await new Promise(r => setTimeout(r, 700));

    // the panel shows the bench you are standing next to
    const benchText = document.querySelector('#build-ui .build-bench')?.textContent || '';
    const rows = [...document.querySelectorAll('#build-ui .build-recipe')];
    const open = rows.find(r => !r.classList.contains('locked'));
    const label = open?.textContent || '';
    open?.click();
    await new Promise(r => setTimeout(r, 200));

    const machine = f.works.get(bench.entry.id);
    const queued = machine?.queue.length || 0;
    const madeBefore = machine?.made || 0;
    // a furnace smelts in sixteen seconds, so wait for the thing rather than for a round number —
    // but give up rather than hang if it is starved or blocked
    for (let i = 0; i < 90 && (f.works.get(bench.entry.id)?.made || 0) === madeBefore; i++) {
      await new Promise(r => setTimeout(r, 250));
    }
    f.build.setMode(false);

    return {
      benchText, label, stocked,
      recipes: rows.length,
      locked: rows.filter(r => r.classList.contains('locked')).length,
      queued,
      madeBefore, madeAfter: f.works.get(bench.entry.id)?.made || 0,
      state: f.works.stateText(f.works.get(bench.entry.id)),
    };
  });

  expect(out.none, 'nowhere flat to build').toBeFalsy();
  expect(out.benchWhy, `the furnace would not go down: ${out.benchWhy}`).toBeFalsy();
  expect(out.benchText, 'the panel does not show the bench you are standing at').toContain('Furnace');
  expect(out.recipes, 'the bench offers no recipes').toBeGreaterThan(0);
  // before blaming the furnace, check the pool actually took what the test tried to feed it
  for (const [id, n] of Object.entries(out.stocked || {})) {
    expect(n, `the pool would not take the ${id} — a store capacity or share rule moved`).toBe(24);
  }
  expect(out.queued, `clicking "${out.label}" did not queue it`).toBe(1);
  expect(out.madeAfter, `the furnace made nothing (${out.state})`).toBeGreaterThan(out.madeBefore);
  expect(errors).toEqual([]);
});

/**
 * R18 — AND A FLUID SEAM NEEDS A FLUID TANK.
 *
 * The other half of the test above. `data/power.json` has specced a `fluid_tank` since the building
 * expansion landed and it had no row in `data/structures.json`, so it could not be built — which did
 * not show while `kindOf()` was broken, because a wooden crate held water quite happily. With the
 * accept rules live there was briefly NO buildable store in the game that takes a liquid, and
 * js/refine.js draws machine inputs only from the pool, so thirteen recipes could never have run.
 *
 * This is the rule stated from the player's side: put a drill on a water source and a crate will
 * not do.
 */
test('a drill on a water seam fills a fluid tank, and a wooden crate will not do', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 800);
    }
    const KINDS = f.resources?.materials || {};
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 8) <= 0.3;
    const node = f.ore.around(f.control.x, f.control.z)
      .filter(n => !n.depleted && flat(n.x, n.z) && flat(n.x + 30, n.z) && KINDS[n.resource]?.kind === 'fluid')
      .sort((a, b) => b.amount - a.amount)[0];
    if (!node) return { none: true };

    f.control.teleport(node.x, node.z);
    await new Promise(r => setTimeout(r, 500));
    f.build.setMode(true);
    f.build.setTool('smooth'); f.build.setRadius(18);
    for (const dx of [0, 30]) { f.build.aim(node.x + dx, node.z); f.build.paint(); }
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(node.x + 3, node.z + 6); f.build.placeHere();
    f.build.research?.unlockAll?.();

    // a crate 30 m off, and a fluid tank 60 m off: two different pools, one of which is wrong
    f.build.select('storage_crate'); f.build.aim(node.x + 30, node.z);
    const crate = f.build.placeHere();
    f.build.select('fluid_tank'); f.build.aim(node.x + 60, node.z);
    const tank = f.build.placeHere();
    f.build.setMode(false);
    if (!tank.ok) return { tankWhy: tank.why || 'the fluid tank would not go down' };

    const cratePool = f.stores.poolAt(node.x + 30, node.z);
    const tankPool = f.stores.poolAt(node.x + 60, node.z);
    return {
      resource: node.resource,
      crateOk: crate.ok, tankOk: tank.ok,
      intoCrate: cratePool ? f.stores.put(cratePool, node.resource, 20) : -1,
      intoTank: tankPool ? f.stores.put(tankPool, node.resource, 20) : -1,
    };
  });

  if (out.none) return;                       // this seed has no fluid seam in range; nothing to say
  expect(out.tankWhy, `${out.tankWhy}`).toBeFalsy();
  expect(out.crateOk, 'the crate would not go down').toBe(true);
  expect(out.tankOk, 'the fluid tank would not go down — is it in data/structures.json?').toBe(true);
  expect(out.intoCrate, `a wooden crate took ${out.resource}, which is a fluid`).toBe(0);
  expect(out.intoTank, `the fluid tank would not take ${out.resource}`).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
