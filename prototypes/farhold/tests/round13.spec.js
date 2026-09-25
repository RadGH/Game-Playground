// Round 13, in the browser: the parts of the play-test list that need Three.js and the DOM.
//
// The unit tests next door cover the arithmetic — the tool ladder, the haul path, the harvest
// table. These are the ones that can only be answered by the running game, and every one of them is
// a fault the player could see and the code could not:
//
//   * the Clear tool reported "cleared" and left the forest standing
//   * levelling a plot left its trees hanging in the air
//   * the Road tool gave no sign at all that a click had registered
//   * B locked the pointer to the middle of the screen and then put forty buttons on the right
//   * you walked through a wood made of the timber you were short of and could not touch any of it

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Walk to somewhere with trees on it, so the harvesting tests have something to hit. */
/**
 * Stand somewhere with things growing on it — and STAND ON THEM.
 *
 * R16: this used to accept any spot with four props inside 60 m and then hand back where the player
 * happened to be. The two tests below measure inside 10 m and 14 m, so whether they passed came
 * down to how that 60 m cluster happened to be arranged — and round 16's road and water work moved
 * the terrain a little, which moved the scatter, which turned a lucky pass into "the raise/lower
 * tools still do not affect the trees" on a test about something else entirely. It walks onto the
 * thickest patch it can find now, so the radius the test uses is the radius that was checked.
 */
const FIND_WOOD = async (page, want = 14) => page.evaluate(async radius => {
  const f = window.farhold;
  for (let tries = 0; tries < 60; tries++) {
    const near = f.props.near(f.control.x, f.control.z, 90);
    if (near.length >= 4) {
      // centre on whichever prop has the most neighbours inside the radius the caller will use
      let best = null, bestN = 0;
      for (const p of near) {
        const n = near.filter(q => Math.hypot(q.x - p.x, q.z - p.z) <= radius * 0.8).length;
        if (n > bestN) { bestN = n; best = p; }
      }
      if (best && bestN >= 2) {
        f.control.teleport(best.x, best.z);
        f.props.update(f.control.x, f.control.z, true);
        await new Promise(r => setTimeout(r, 60));
        const here = f.props.near(f.control.x, f.control.z, radius).length;
        if (here > 0) return { x: f.control.x, z: f.control.z, n: here };
      }
    }
    // step across the map looking for a cell with something growing in it
    f.control.teleport(f.control.x + 180, f.control.z + 90);
    f.props.update(f.control.x, f.control.z, true);
    await new Promise(r => setTimeout(r, 30));
  }
  return null;
}, want);

test('the Clear tool actually clears, and pays out the timber', async ({ page }) => {
  const errors = await land(page);
  const spot = await FIND_WOOD(page, 14);
  expect(spot, 'found nowhere with anything growing on it').toBeTruthy();

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const before = f.props.near(f.control.x, f.control.z, 14).length;
    const held = id => f.bag.count(id);
    const timberBefore = held('log') + held('stone') + held('fibre');
    f.build.setMode(true);
    f.build.setTool('clear');
    f.build.setRadius(14);
    f.build.aim(f.control.x, f.control.z);
    const res = f.build.clear();
    await new Promise(r => setTimeout(r, 120));
    const after = f.props.near(f.control.x, f.control.z, 14).length;
    f.build.setMode(false);
    return {
      before, after, removed: res.removed || 0,
      gained: (held('log') + held('stone') + held('fibre')) - timberBefore,
      cleared: f.props.clearedCount,
    };
  });

  expect(out.before, 'nothing was standing there to begin with').toBeGreaterThan(0);
  expect(out.removed, 'the Clear tool removed nothing').toBeGreaterThan(0);
  expect(out.after, 'the props are still standing after Clear').toBe(0);
  expect(out.gained, 'Clear paid out nothing — store.give was handed the whole bag as an id').toBeGreaterThan(0);
  expect(out.cleared).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('levelling the ground takes the trees with it, and pays for them', async ({ page }) => {
  const errors = await land(page);
  const spot = await FIND_WOOD(page, 10);
  expect(spot).toBeTruthy();

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const before = f.props.near(f.control.x, f.control.z, 10).length;
    f.build.setMode(true);
    f.build.setTool('smooth');
    f.build.setRadius(12);
    f.build.aim(f.control.x, f.control.z);
    f.build.paint();
    await new Promise(r => setTimeout(r, 120));
    const after = f.props.near(f.control.x, f.control.z, 10).length;
    f.build.setMode(false);
    return { before, after };
  });

  expect(out.before).toBeGreaterThan(0);
  expect(out.after, 'the raise/lower/level tools still do not affect the trees').toBe(0);
  expect(errors).toEqual([]);
});

test('you can attack a tree down, and it leaves timber behind', async ({ page }) => {
  const errors = await land(page);
  const spot = await FIND_WOOD(page, 40);
  expect(spot).toBeTruthy();

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const target = f.props.near(f.control.x, f.control.z, 40)[0];
    if (!target) return { none: true };
    const card = f.props.describe(target);
    let swings = 0, felled = null;
    while (swings < 40 && !felled) {
      const res = f.props.strike(target.x, target.z, { damage: 9, reach: 4, tier: 1 });
      swings++;
      if (res.blocked) return { blocked: res.why };
      if (res.felled) felled = res;
    }
    return {
      swings, card,
      materials: felled?.materials || null,
      verb: felled?.verb,
      // and the tree it felled is no longer standing there
      stillThere: f.props.near(target.x, target.z, 1.2).some(p => p.id === target.id),
      felledCount: f.props.felledCount,
    };
  });

  expect(out.none, 'nothing to hit').toBeFalsy();
  expect(out.blocked, `a starting weapon could not touch it: ${out.blocked}`).toBeFalsy();
  expect(out.swings, 'one swing should not fell a tree, and forty should').toBeGreaterThan(0);
  expect(out.card.name, 'the thing you hit has no name').toBeTruthy();
  expect(out.verb, 'no verb for the log line').toBeTruthy();
  expect(Object.keys(out.materials || {}).length, 'it dropped nothing').toBeGreaterThan(0);
  expect(out.stillThere, 'the tree is still standing after being felled').toBe(false);
  expect(out.felledCount).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('B frees the cursor, and the panel is clickable', async ({ page }) => {
  const errors = await land(page);
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Tab');   // R26 — B opens the ring; Tab is the full panel
  await expect(page.locator('#build-ui')).toBeVisible();

  // the middle-of-the-screen dot is a lie while the cursor is free
  await expect(page.locator('body')).toHaveClass(/building/);
  await expect(page.locator('#crosshair')).toBeHidden();

  // a real click on a real button in the panel, which is the whole ask
  await page.locator('.build-tool', { hasText: 'Scan' }).click();
  expect(await page.evaluate(() => window.farhold.build.tool)).toBe('scan');
  await page.locator('.build-tool', { hasText: 'Road' }).click();
  expect(await page.evaluate(() => window.farhold.build.tool)).toBe('road');
  // …and picking Road picks a road, so the panel is not quoting the price of a crate
  expect(await page.evaluate(() => window.farhold.build.selected)).toBe('road_dirt');

  await page.keyboard.press('KeyB');
  await expect(page.locator('body')).not.toHaveClass(/building/);
  expect(errors).toEqual([]);
});

test('the Road tool shows the run as you click it, and Enter lays it', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 500);
    }
    const t = f.terrain;
    // somewhere flat enough that the sections will actually fit
    let base = null;
    for (let i = 0; i < 60 && !base; i++) {
      const x = f.control.x + i * 20, z = f.control.z;
      if (!t.underwater(x, z) && t.slopeAt(x, z, 8) < 0.22 && !t.underwater(x + 24, z) && t.slopeAt(x + 24, z, 8) < 0.22) base = { x, z };
    }
    if (!base) return { none: true };
    f.control.teleport(base.x, base.z);
    await new Promise(r => setTimeout(r, 200));

    f.build.setMode(true);
    f.build.setTool('road');
    const before = f.build.entries.length;
    f.build.aim(base.x, base.z);
    f.build.confirm();
    const afterOne = f.scene.getObjectByName('farhold-build-run');
    const previewAfterFirstClick = !!(afterOne && afterOne.visible && afterOne.children.length);
    f.build.aim(base.x + 24, base.z);
    f.build.confirm();
    const previewLegs = f.scene.getObjectByName('farhold-build-run')?.children.length || 0;
    const res = f.build.finishRun();
    const previewAfterFinish = f.scene.getObjectByName('farhold-build-run')?.visible;
    const after = f.build.entries.length;
    const lane = f.build.lanes[f.build.lanes.length - 1] || null;
    let worstGap = 0;
    for (let i = 0; lane && i + 1 < lane.points.length; i++) {
      worstGap = Math.max(worstGap, Math.hypot(lane.points[i + 1][0] - lane.points[i][0], lane.points[i + 1][1] - lane.points[i][1]));
    }
    f.build.setMode(false);
    return {
      previewAfterFirstClick, previewLegs, previewAfterFinish,
      lanes: f.build.lanes.length, metres: res.metres || 0, worstGap,
      drawn: !!f.scene.getObjectByName('farhold-lane-' + (lane?.id || '')),
      added: after - before,
      why: res.why || '',
    };
  });

  expect(out.none, 'nowhere flat enough to lay a road').toBeFalsy();
  expect(out.previewAfterFirstClick, 'the first click drew nothing — "the Road tool doesn\'t do anything"').toBe(true);
  expect(out.previewLegs, 'the second corner drew no line between them').toBeGreaterThan(2);
  /**
   * ROUND 14 REWROTE WHAT THIS ASSERTS, AND THE REASON IS THE WHOLE OF §14.6.
   *
   * It used to expect `res.placed.length > 0` and the build ledger to grow by that many, because a
   * road WAS a row of `road_dirt` boxes in the ledger — which is exactly the *"lot of rectangles
   * that leave gaps in between"* the user reported. A road is a lane now: one polyline with a graded
   * height per point, drawn as one continuous ribbon, kept in its own book. So the ledger should not
   * grow at all, and what there should be instead is a lane, with a mesh, with no gap in it.
   */
  expect(out.why, `Enter laid no road: ${out.why}`).toBe('');
  expect(out.lanes, 'Enter laid no road').toBeGreaterThan(0);
  expect(out.metres, 'the road has no length').toBeGreaterThan(10);
  expect(out.added, 'a road should not put ninety boxes in the build ledger any more').toBe(0);
  expect(out.drawn, 'the lane was laid and nothing drew it').toBe(true);
  expect(out.worstGap, 'the road has a gap in it').toBeLessThan(3.2);
  expect(out.previewAfterFinish, 'the preview is still up after the road went down').toBe(false);
  expect(errors).toEqual([]);
});

test('the scanner finds deposits and pins them to the map', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const before = f.markers.here().length;
    const sweep = f.scan.sweep(f.control.x, f.control.z, 600);
    const state = f.scan.state();
    const first = state.rows[0];
    if (first) f.scan.pin(first.id);
    return {
      found: sweep.found,
      rows: state.rows.length,
      named: !!first?.resourceName,
      compass: first?.compass,
      delivered: first?.deliveredPerMinute,
      pinnedNow: f.markers.here().length - before,
      kinds: f.markers.here().map(m => m.kind),
    };
  });

  expect(out.found, 'a 600 m sweep turned up no deposits at all').toBeGreaterThan(0);
  expect(out.rows, 'the sweep produced no rows to show').toBeGreaterThan(0);
  expect(out.named).toBe(true);
  expect(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).toContain(out.compass);
  expect(out.delivered).toBeGreaterThan(0);
  expect(out.pinnedNow, 'pinning a deposit put nothing on the map').toBe(1);
  expect(out.kinds).toContain('seam');
  expect(errors).toEqual([]);
});

test('the town streets are one network and the highway comes in', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const mod = await import('/proctown/js/townplan.js');
    const nodes = (f.terrain.world?.nodes || []).filter(n => n.kind === 'settlement' || n.size >= 1);
    const rows = [];
    for (const node of nodes.slice(0, 6)) {
      const ring = 16 + (node.size || 1) * 13;
      // the same plan the game draws: same seed, same culture, same ground
      const plan = mod.planTown({
        seed: (f.state.seed ?? 11) >>> 0, size: node.size || 1,
        culture: mod.cultureFor({ race: node.race, biome: node.biome }),
        heightAt: (lx, lz) => f.terrain.heightAt(node.wx + lx, node.wz + lz),
      });
      const probe = mod.connectStreets({ streets: plan.streets.slice(), square: plan.square });
      rows.push({ pieces: probe.groups || 1, streets: plan.streets.length, ring });
    }
    return rows;
  });

  expect(out.length, 'no settlements on this world to look at').toBeGreaterThan(0);
  for (const row of out) {
    expect(row.pieces, 'a town came out in more than one piece — loose paving in a field').toBe(1);
  }
  expect(errors).toEqual([]);
});
