// A base, from the first swing of the smoothing tool to walking back onto it from another star.
//
// The user's goal for build mode, in their own words: "make a base, ensure it gets save/loaded
// properly … It should be easy to teleport back to your bases even if you go to a different star
// system." That is one journey, so it is one test: anything that only works when the previous step
// is skipped is not a base, it is a demo.

import { test, expect } from '@playwright/test';

/**
 * Somewhere you could actually put a base.
 *
 * Injected into the page rather than written twice. Farhold's landing spot is chosen for being
 * interesting, not for being flat and dry, so a test that builds on the exact spawn point is a test
 * that fails on the seeds where the player lands on a beach — which is most of them.
 */
const FIND_SPOT = () => {
  const f = window.farhold;
  const t = f.terrain;
  const dry = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.riverAt(x, z) <= 0.05 && t.slopeAt(x, z, 8) <= 0.25;
  for (let r = 0; r <= 900; r += 20) {
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r;
      const z = f.control.z + Math.sin(th) * r;
      // the claim stone and the pad both have to fit, so check the whole footprint, not the middle
      if (dry(x, z) && dry(x + 6, z) && dry(x - 6, z) && dry(x, z + 6) && dry(x, z - 6)) {
        f.control.teleport(x, z);
        return { x, z };
      }
    }
  }
  return null;
};

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('a base is built, saved, reloaded, and reachable from another star system', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async findSpotSrc => {
    const findSpot = eval('(' + findSpotSrc + ')');
    const f = window.farhold;
    const tick = () => new Promise(r => setTimeout(r, 120));
    const spot = findSpot();
    if (!spot) return { noSpot: true };

    /**
     * Everything the catalogue asks for, read OUT OF THE CATALOGUE.
     *
     * A hand-written list here is a list that goes stale the moment anybody edits a recipe, and it
     * goes stale silently — the test starts failing with "you are short of 10 machine parts" and
     * looks like a bug in the base rather than a bug in the test. This test is about whether a base
     * survives a save, not about mining, so every ingredient in the game is simply granted.
     */
    const wanted = new Set();
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) wanted.add(id);
    }
    for (const id of wanted) f.bag.add(id, 500);

    // ---- level the ground, because a pad wants a 1-in-16 slope and Farhold is almost nowhere flat
    f.build.setMode(true);
    f.build.setTool('smooth');
    f.build.setRadius(14);
    f.build.aim(f.control.x + 10, f.control.z + 10);
    f.build.paint();
    await tick();

    // ---- claim the ground, then raise the pad on it
    f.build.setTool('build');
    f.build.select('claim_stone');
    f.build.aim(f.control.x + 6, f.control.z + 10);
    const stone = f.build.placeHere();

    f.build.select('waypoint_pad');
    f.build.aim(f.control.x + 10, f.control.z + 10);
    const pad = f.build.placeHere();

    // §5.10 — a pad draws 25 kW and is DARK until something makes it. This is the rule, so it is
    // checked before the generator goes down rather than worked around.
    await tick();
    const darkFirst = !f.waypoints.canTravel(f.homes.all()[0]?.id, {}).ok;

    /**
     * A crate of coal and something to burn it in.
     *
     * The whole chain in four pieces: the crate joins the storage pools, the coal goes in the pool,
     * the generator finds the coal because it is on the same pool, and the pad lights because it is
     * inside the generator's ten metres. Every one of those joins was missing.
     */
    f.build.select('storage_crate');
    f.build.aim(f.control.x + 16, f.control.z + 10);
    const crate = f.build.placeHere();
    f.build.select('burner_generator');
    f.build.aim(f.control.x + 20, f.control.z + 10);
    const gen = f.build.placeHere();
    f.build.setMode(false);
    const pool = f.stores.poolAt(f.control.x + 16, f.control.z + 10);
    const coal = f.stores.put(pool, 'coal', 200);
    // the grid is ticked from the frame loop; give it a couple of seconds of real time to notice
    await new Promise(r => setTimeout(r, 2500));

    const where = { systemSeed: f.systemSeed, planetId: f.planet.id };
    const built = f.homes.all();

    // ---- THE SAVE. Not "does the object have a field" — write it, read it back, rebuild from it.
    const json = JSON.parse(JSON.stringify(f.snapshot()));

    return {
      stoneOk: stone.ok, stoneWhy: stone.why || '',
      padOk: pad.ok, padWhy: pad.why || '',
      padIsWaypoint: !!pad.entry?.waypoint,
      homeCount: built.length,
      homeName: built[0]?.name || '',
      // the pad joined THIS world's network too, so the map draws it beside the towns
      onNetwork: f.waypoints.list().some(p => p.kind === 'built'),
      // …and it is lit, because a pad you built yourself is lit while its grid is up
      darkFirst,
      genOk: gen.ok, genWhy: gen.why || '',
      crateOk: crate.ok, crateWhy: crate.why || '',
      coal, poolFound: !!pool,
      burning: f.grid.stateOf(gen.entry?.id),
      travelOk: f.waypoints.canTravel(f.homes.all()[0]?.id, {}).ok,
      onGrid: f.grid.overview().length,
      savedHomes: json.homes,
      savedBuild: !!json.build,
      where,
    };
  }, FIND_SPOT.toString());

  expect(out.noSpot, 'nowhere dry to build within 900 m of the landing').toBeFalsy();
  expect(out.stoneOk, `the claim stone would not go down: ${out.stoneWhy}`).toBe(true);
  expect(out.padOk, `the waypoint pad would not go down: ${out.padWhy}`).toBe(true);
  expect(out.padIsWaypoint, 'the pad went down but is not a waypoint').toBe(true);
  expect(out.homeCount, 'building a waypoint pad did not register a base').toBe(1);
  expect(out.onNetwork, 'the base is not on this world\'s waypoint network').toBe(true);
  expect(out.darkFirst, 'a pad with no power was travelable — the grid rule does nothing').toBe(true);
  expect(out.crateOk, `the crate would not go down: ${out.crateWhy}`).toBe(true);
  expect(out.poolFound, 'a storage crate did not make a storage pool').toBe(true);
  expect(out.coal, 'the crate would not take the coal').toBe(200);
  expect(out.genOk, `the generator would not go down: ${out.genWhy}`).toBe(true);
  expect(out.burning, 'the generator never found the coal in the crate beside it').toBe('running');
  expect(out.onGrid, 'nothing joined the power grid').toBeGreaterThan(0);
  expect(out.travelOk, 'the pad stayed dark with a geothermal tap beside it').toBe(true);
  expect(out.savedHomes?.bases?.length, 'the base is not in the save').toBe(1);
  expect(out.savedBuild, 'the structures are not in the save').toBe(true);
  expect(errors).toEqual([]);
});

test('a save taken beside a finished base reloads with the base still on it', async ({ page }) => {
  const errors = await land(page);

  // build it, write it to storage, then reload the PAGE and continue that save — which is the only
  // honest way to test a save, because it is the only thing the player ever does
  const slot = await page.evaluate(async findSpotSrc => {
    const findSpot = eval('(' + findSpotSrc + ')');
    const f = window.farhold;
    if (!findSpot()) return { ok: false, why: 'nowhere dry within 900 m of the landing' };
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 500);
    }
    f.build.setMode(true);
    f.build.setTool('smooth'); f.build.setRadius(14);
    f.build.aim(f.control.x + 10, f.control.z + 10); f.build.paint();
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(f.control.x + 6, f.control.z + 10); f.build.placeHere();
    f.build.select('waypoint_pad'); f.build.aim(f.control.x + 10, f.control.z + 10);
    const res = f.build.placeHere();
    f.build.select('storage_crate'); f.build.aim(f.control.x + 16, f.control.z + 10); f.build.placeHere();
    f.build.select('burner_generator'); f.build.aim(f.control.x + 20, f.control.z + 10); f.build.placeHere();
    f.build.setMode(false);
    f.stores.put(f.stores.poolAt(f.control.x + 16, f.control.z + 10), 'coal', 200);
    await new Promise(r => setTimeout(r, 2500));
    if (!res.ok) return { ok: false, why: res.why };
    const id = f.saveNow();
    return { ok: true, id, name: f.homes.all()[0].name, x: Math.round(res.entry.x), z: Math.round(res.entry.z) };
  }, FIND_SPOT.toString());
  expect(slot.ok, `could not build the base: ${slot.why}`).toBe(true);

  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&load=${slot.id}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const after = await page.evaluate(() => {
    const f = window.farhold;
    const bases = f.homes.all();
    return {
      count: bases.length,
      name: bases[0]?.name || '',
      x: Math.round(bases[0]?.x ?? -1), z: Math.round(bases[0]?.z ?? -1),
      // the STRUCTURES came back too, not only the register
      structures: f.build.rebuild(),
      onNetwork: f.waypoints.list().some(p => p.kind === 'built'),
      // and the ground it stands on is still flat — the terraform brushes reloaded with it
      edits: f.terraform.count,
      // the grid came back with it, so the pad is still lit after a reload
      lit: f.waypoints.list().some(p => p.kind === 'built' && p.lit),
      onGrid: f.grid.size,
      coal: f.stores.count(f.stores.poolAt(bases[0].x, bases[0].z), 'coal'),
    };
  });

  expect(after.count, 'the base did not survive a reload').toBe(1);
  expect(after.name).toBe(slot.name);
  expect(after.x).toBe(slot.x);
  expect(after.z).toBe(slot.z);
  expect(after.onNetwork, 'the reloaded base is not on the waypoint network').toBe(true);
  expect(after.structures, 'the buildings did not come back').toBeGreaterThan(0);
  expect(after.onGrid, 'the reloaded machines did not rejoin the power grid').toBeGreaterThan(0);
  expect(after.edits, 'the ground you levelled came back rough').toBeGreaterThan(0);
  expect(after.coal, 'the coal in the crate did not survive the reload').toBeGreaterThan(0);
  expect(after.lit, 'the reloaded pad is dark — the generator came back with nothing to burn').toBe(true);
  expect(errors).toEqual([]);
});

test('a base is one button away from another star system', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async findSpotSrc => {
    const findSpot = eval('(' + findSpotSrc + ')');
    const f = window.farhold;
    if (!findSpot()) return { noSpot: true };
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 500);
    }
    f.build.setMode(true);
    f.build.setTool('smooth'); f.build.setRadius(16);
    f.build.aim(f.control.x + 10, f.control.z + 10); f.build.paint();
    f.build.setTool('build');
    f.build.select('claim_stone'); f.build.aim(f.control.x + 6, f.control.z + 10); f.build.placeHere();
    f.build.select('waypoint_pad'); f.build.aim(f.control.x + 10, f.control.z + 10);
    const pad = f.build.placeHere();
    f.build.select('storage_crate'); f.build.aim(f.control.x + 16, f.control.z + 10); f.build.placeHere();
    f.build.select('burner_generator'); f.build.aim(f.control.x + 20, f.control.z + 10); f.build.placeHere();
    f.build.setMode(false);
    f.stores.put(f.stores.poolAt(f.control.x + 16, f.control.z + 10), 'coal', 400);
    await new Promise(r => setTimeout(r, 2500));
    if (!pad.ok) return { padWhy: pad.why };

    const base = f.homes.all()[0];
    const homeSystem = f.systemSeed;

    /**
     * Fold to another star the way the game does, then ask to go home.
     *
     * `?auto=1` lands the player, so getting into space means going up; the test skips the flight
     * with `toSpace` because take-off has its own tests, and then takes a real jump through the
     * real warp so the register is looked at after the system has genuinely been thrown away and
     * rebuilt from a different seed.
     */
    f.toSpace();
    const other = f.galaxy.stars.find(s => s.id !== f.starId);
    f.beginJump(other);
    await new Promise(r => setTimeout(r, 9000));      // five seconds of tunnel plus the arrival
    const awaySystem = f.systemSeed;

    const route = f.homes.routeTo(base.id, { systemSeed: f.systemSeed, planetId: f.planet?.id ?? null });
    const went = f.returnToBase(base.id);
    await new Promise(r => setTimeout(r, 1500));

    return {
      homeSystem, awaySystem,
      step: route.step, why: route.why,
      went,
      backIn: f.systemSeed,
      onPlanet: f.planet?.id ?? null,
      wantedPlanet: base.planetId,
      away: Math.hypot(f.control.x - base.x, f.control.z - base.z),
      // the way back to where you were is open behind you
      portal: !!f.portals?.portal,
      // …and the base is on this world's network again, because the register put it back
      onNetwork: f.waypoints.list().some(p => p.kind === 'built'),
    };
  }, FIND_SPOT.toString());

  expect(out.noSpot, 'nowhere dry to build').toBeFalsy();
  expect(out.padWhy, `the pad would not go down: ${out.padWhy}`).toBeFalsy();
  expect(out.awaySystem, 'the jump did not leave the system').not.toBe(out.homeSystem);
  expect(out.step, 'a base in another system was not recognised as a jump').toBe('jump');
  expect(out.why).toMatch(/drive has to spin up/);
  expect(out.went, `going home was refused: ${out.why}`).toBe(true);
  expect(out.backIn, 'going home did not rebuild the home system').toBe(out.homeSystem);
  expect(out.onPlanet, 'going home landed on the wrong world').toBe(out.wantedPlanet);
  expect(out.away, 'going home did not put the player on the sigil').toBeLessThan(6);
  expect(out.onNetwork, 'the base is not back on the waypoint network').toBe(true);
  expect(out.portal, 'no portal was left where the player was standing').toBe(true);
  expect(errors).toEqual([]);
});
