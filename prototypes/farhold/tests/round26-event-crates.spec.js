// Farhold R26 — every event crate can be opened, every event bag can be picked up, and that is
// still true after a trip underground.
//
//   "A loot crate dropped from an event. I got items from the event automatically, but the loot
//    crate sat on the ground and I could not pick it up. It does not offer to press E and does not
//    get picked up when I walk over it… They used to work."
//
// js/encounters.js and js/sites.js were handed the chest field once, at boot. A dungeon replaces
// main.js's `chests`, and leaving builds a new surface field, so from the first dungeon on every
// event's crate and bag went into a field nothing reads (`E` asks the new one's `nearest`, walking
// over a bag asks its `collect`). This goes down and back up FIRST, then runs every event in
// data/events.json that pays with a crate or a bag and checks the prize is in the LIVE field, that
// `nearest` finds the crate where it stands, that it opens once its guards are down, and that a bag
// is collected by walking over it.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';

test('after a dungeon, every event crate is openable and every event bag can be picked up', async ({ page }) => {
  test.setTimeout(300000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '?auto&seed=3&scale=0.2&quality=low&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  // down and back up: this is what used to orphan every event's prize
  const swapped = await page.evaluate(async () => {
    const f = window.farhold;
    const before = f.chestField;
    await f.enterDungeon();
    const inside = !!f.dungeon;
    f.leaveDungeon();
    return { inside, replaced: f.chestField !== before, out: !f.dungeon };
  });
  expect(swapped.inside, 'never got into the dungeon').toBe(true);
  expect(swapped.out).toBe(true);
  expect(swapped.replaced, 'leaving did not build a new surface chest field (the test would prove nothing)').toBe(true);

  const events = await page.evaluate(() => fetch('data/events.json').then(r => r.json()).then(d => d.events
    .filter(e => e.kind && (e.bait || e.reward?.as === 'bag'))
    .map(e => ({ id: e.id, kind: e.kind, bag: !e.bait && e.reward?.as === 'bag' }))));
  expect(events.length).toBeGreaterThanOrEqual(20);
  for (const kind of ['rescue', 'chase', 'defend', 'trap', 'find']) {
    expect(events.some(e => e.kind === kind), `no ${kind} event pays with a crate or a bag`).toBe(true);
  }

  const results = [];
  for (const ev of events) {
    const r = await page.evaluate(async ({ id, bag }) => {
      const f = window.farhold;
      const field = f.chestField;
      const c = f.control;
      // clear the ground so each event starts on its own
      while (f.field.enemies.length) f.field.remove(0);
      const at = { x: c.x + 30, z: c.z + 30 };
      let run = null;
      for (let k = 0; k < 6 && !run; k++) {
        run = await f.encounters.force(id, { x: at.x + k * 40, z: at.z }, f.player.level);
      }
      if (!run) return { id, skipped: 'could not place it here' };
      const out = { id, kind: run.kind };
      if (!bag) {
        out.hasChest = !!run.chest;
        out.inLiveField = field.chests.includes(run.chest);
        out.nearestFinds = field.nearest(run.chest.x, run.chest.z) === run.chest;
        // a trap springs, a defend is fought: put every guard down, then the lid must come up
        if (run.kind === 'trap') {
          run.chest.touched = true;
          f.encounters.update(0.1, { x: run.x, z: run.z }, f.player);
          for (let w = 0; w < 100 && !run.spawned; w++) await new Promise(r => setTimeout(r, 100));
          out.sprung = !!run.spawned;
        }
        for (const u of run.units || []) f.field.removeUnit(u);
        const haul = field.open(run.chest, { level: f.player.level });
        out.sealed = haul?.sealed || null;
        out.opened = !!haul && !haul.sealed && !!run.chest.opened;
        out.paid = !!haul && (haul.mimic || (haul.items?.length || 0) + (haul.gold || 0) > 0);
      } else {
        // win it: the guards (or the runner) go down with the player standing there
        const bagsBefore = field.bags.length;
        for (const u of run.units || []) {
          if (run.kind === 'chase') { u.dying = 0; } else f.field.removeUnit(u);
        }
        run.seen = true;
        f.encounters.update(0.1, { x: run.x, z: run.z }, f.player);
        out.bagDropped = field.bags.length > bagsBefore;
        const b = field.bags[field.bags.length - 1];
        const got = b ? field.collect(b.x, b.z, 0.016) : [];
        out.collected = got.length > 0 && !field.bags.includes(b);
        for (const u of run.units || []) f.field.removeUnit(u);
      }
      return out;
    }, ev);
    results.push(r);
  }
  const placed = results.filter(r => !r.skipped);
  expect(placed.length, `only ${placed.length} of ${events.length} events could be placed: ${JSON.stringify(results.filter(r => r.skipped))}`).toBeGreaterThanOrEqual(events.length - 2);
  for (const r of placed) {
    if (r.hasChest !== undefined) {
      expect(r.hasChest, `${r.id}: no crate`).toBe(true);
      expect(r.inLiveField, `${r.id}: the crate went into a chest field nothing reads`).toBe(true);
      expect(r.nearestFinds, `${r.id}: E would not find the crate standing on it`).toBe(true);
      expect(r.sealed, `${r.id}: still sealed with every guard down`).toBe(null);
      expect(r.opened, `${r.id}: the crate would not open`).toBe(true);
      expect(r.paid, `${r.id}: the crate was empty`).toBe(true);
    } else {
      expect(r.bagDropped, `${r.id}: winning dropped no bag`).toBe(true);
      expect(r.collected, `${r.id}: walking over the bag did not pick it up`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
