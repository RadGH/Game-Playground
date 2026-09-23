// R15 — the industry chain, and the doors into it.
//
//   "I have stone and clay and I built a furnace. Now what? How do I interact with the furnace and
//    tell it what to smelt?"
//
// You could not. `drawBench` in js/build-ui.js has listed every recipe a machine can make since the
// building expansion, and the only way to reach it was to press B and notice a panel halfway down a
// sidebar. E — the key this game uses for every other "use the thing in front of you" — did
// nothing. Same shape as every other fault here: the room was finished, the door was missing.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/**
 * Put a machine of `key` on the ground next to the player, the way build mode would.
 *
 * Through the REAL path — select, aim, place — rather than by pushing an entry into the ledger,
 * because the thing being tested is the join between an entry standing in the world and the work
 * system knowing about it, and a hand-made entry would skip exactly that.
 */
async function placeMachine(page, key) {
  return page.evaluate(k => {
    const fh = window.farhold;
    fh.build.setMode(true);
    fh.build.select(k);
    // give it the materials, so the test is about the wiring and not about an economy
    const need = (fh.structures.structures || []).find(p => p.id === k)?.cost || {};
    for (const [id, n] of Object.entries(need)) fh.bag.add?.(id, n * 4);
    fh.build.setAim ? fh.build.setAim(fh.control.x + 3, fh.control.z + 3) : null;
    fh.build.aim?.(fh.control.x + 3, fh.control.z + 3);
    const out = fh.build.placeHere();
    fh.build.setMode(false);
    return { ok: !!out?.ok, why: out?.why ?? null, entries: (fh.build.entries || []).length };
  }, key);
}

test('E on a furnace opens its recipes and says what it is doing', async ({ page }) => {
  const errors = await land(page);
  const placed = await placeMachine(page, 'furnace');
  console.log('placed:', JSON.stringify(placed));

  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const target = fh.interactTarget ? fh.interactTarget() : null;
    return {
      kind: target?.kind ?? null,
      machineName: target?.machine?.name ?? null,
      hasWorks: !!target?.works,
      state: target?.works ? fh.works.stateText(target.works) : null,
    };
  });
  console.log('interact:', JSON.stringify(out));
  expect(out.kind, 'E on a furnace still finds nothing').toBe('machine');
  expect(out.hasWorks, 'the furnace is not registered with js/work.js').toBe(true);
  expect(out.state).toBeTruthy();
  expect(errors).toEqual([]);
});

test('a furnace can be told what to smelt, and it says what it is short of', async ({ page }) => {
  const errors = await land(page);
  await placeMachine(page, 'furnace');
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const m = (fh.build.entries || []).map(e => fh.works.get(e.id)).find(Boolean);
    if (!m) return { skipped: 'no machine registered' };
    const board = fh.works.board(m.type) || [];
    const first = board[0];
    const queued = first ? fh.works.queue(m.id, first.id, 1) : null;
    return {
      machine: m.name,
      recipes: board.map(r => ({ id: r.id, name: r.name, unlocked: r.unlocked })),
      queued: queued ? { ok: queued.ok, why: queued.why ?? null } : null,
      queueLen: m.queue.length,
    };
  });
  console.log('furnace:', JSON.stringify(out, null, 1));
  expect(out.skipped).toBeUndefined();
  // a furnace that can make nothing at all is a furnace with no reason to exist
  expect(out.recipes.length, 'the furnace offers no recipes').toBeGreaterThan(0);
  expect(out.recipes.some(r => /iron/i.test(r.name)), 'a furnace that cannot smelt iron').toBe(true);
  // either it queued, or it said WHY not — silence is the thing being fixed
  if (out.queued) expect(out.queued.ok || !!out.queued.why).toBe(true);
  expect(errors).toEqual([]);
});

/**
 *   "Also how do you even get better tools? I do not see a slot for tools in the character or
 *    inventory menu"
 *
 * There isn't one, on purpose — your weapon IS your tool. `data/resources.json` has carried a
 * sentence for every rung of that ladder since the building expansion and none of it was ever on a
 * screen, so a player looking for a pickaxe concludes the feature is missing rather than different.
 */
test('the character sheet says what your tool is and how to get a better one', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const t = fh.hud.tool ? fh.hud.tool() : null;
    fh.hud.toggleSheet(true);
    const dt = [...document.querySelectorAll('#sheet-stats-utility dt')].find(n => n.textContent === 'Tool');
    return {
      tool: t ? { name: t.name, tier: t.tier, from: t.from, next: t.next?.name ?? null } : null,
      rowOnScreen: !!dt,
      value: dt?.nextElementSibling?.textContent ?? null,
      tip: dt?.dataset.tip ?? null,
    };
  });
  console.log('tool:', JSON.stringify(out, null, 1));
  expect(out.tool, 'the game cannot say what your tool is').not.toBeNull();
  expect(out.rowOnScreen, 'there is no Tool row on the character sheet').toBe(true);
  expect(out.value).toBe(out.tool.name);
  // the card has to answer the actual question — what is in the slot, and what the next rung is.
  // R21: was /no separate tool slot/, which R16 made false when it added one.
  expect(out.tip).toMatch(/Tool slot|Right now/i);
  expect(out.tip).toMatch(/Next rung/);
  expect(errors).toEqual([]);
});

/**
 *   "I realize we should probably use the Outpost marker to establish a base, and attribute
 *    everything nearby to that base. Then I would like the map to show outposts on it and allow
 *    creating connections between then to transport items, in either direction with a max limit."
 */
test('an Outpost Marker claims what is around it, and the map lists it', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    /**
     * Find dry, flat ground with room for both pieces. The refusals the first version of this test
     * hit — "you cannot build on water", "the ground is too steep here" — were the game working
     * correctly; a spec that builds in a lake is testing the wrong thing.
     */
    const t = fh.terrain;
    const ok = (x, z) => !t.underwater(x, z) && t.riverAt(x, z) <= 0.3 && t.slopeAt(x, z, 4) < 0.16;
    let bx = null, bz = null;
    for (let r = 20; r < 900 && bx === null; r += 20) {
      for (let a = 0; a < 16; a++) {
        const x = fh.control.x + Math.cos(a / 16 * 6.283) * r;
        const z = fh.control.z + Math.sin(a / 16 * 6.283) * r;
        // both ends of the pair have to be buildable, sixty metres apart
        if (ok(x, z) && ok(x + 60, z)) { bx = x; bz = z; break; }
      }
    }
    if (bx === null) return { skipped: 'no flat dry ground within 900 m on this seed' };
    const put = (key, dx, dz) => {
      fh.build.setMode(true); fh.build.select(key);
      const need = (fh.structures.structures || []).find(p => p.id === key)?.cost || {};
      for (const [id, n] of Object.entries(need)) fh.bag.add?.(id, n * 10);
      fh.build.aim?.(bx + dx, bz + dz);
      const r = fh.build.placeHere();
      fh.build.setMode(false);
      return { ok: !!r?.ok, why: r?.why ?? null };
    };
    // a marker, and a crate SIXTY metres away — past the 40 m chain, inside the marker's 90 m claim
    const a = put('claim_stone', 0, 0);
    const b = put('storage_crate', 60, 0);
    const posts = fh.build.outposts() || [];
    return {
      placed: { marker: a, crate: b },
      posts: posts.map(p => ({ name: p.name, count: p.count, role: p.role })),
    };
  });
  console.log('outposts:', JSON.stringify(out));
  if (out.skipped) { console.log('skipped:', out.skipped); return; }
  expect(out.placed.marker.ok, out.placed.marker.why || '').toBe(true);
  expect(out.placed.crate.ok, out.placed.crate.why || '').toBe(true);
  // the whole point: sixty metres apart is two outposts by the chain rule and ONE by the marker's
  expect(out.posts.length, 'the marker did not claim the crate sixty metres away').toBe(1);
  expect(out.posts[0].count).toBe(2);
  expect(errors).toEqual([]);
});

test('the map opens on Work, not on Layers, and Supply lists the outposts', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(400);
  const first = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.map-side .map-tab')].map(b => b.textContent),
    on: document.querySelector('.map-side .map-tab.on')?.textContent,
    // the reference material must be in a fold, and the fold must be last
    refIsLast: document.querySelector('.map-side > *:last-child')?.classList.contains('map-ref'),
    refOpen: document.querySelector('.map-side .map-ref')?.open,
  }));
  console.log('map side:', JSON.stringify(first));
  expect(first.tabs).toEqual(['Work', 'Places', 'Find', 'Supply']);
  expect(first.on, 'the map does not open on the thing you came for').toBe('Work');
  expect(first.refIsLast, 'Layers and the key are not at the bottom').toBe(true);
  expect(first.refOpen).toBe(false);

  const supply = await page.evaluate(() => {
    const fh = window.farhold;
    fh.map.state.tab = 'supply';
    fh.map.draw();
    // rebuild the side by clicking the tab, which is what a player does
    [...document.querySelectorAll('.map-side .map-tab')].find(b => b.textContent === 'Supply')?.click();
    return { text: document.querySelector('.map-side')?.textContent?.slice(0, 200) };
  });
  console.log('supply tab:', JSON.stringify(supply));
  expect(supply.text).toMatch(/Supply/);
  expect(errors).toEqual([]);
});

/**
 *   "Add a motorcycle, car, and truck, as crafting vehicles that move much faster than horse but
 *    occupy the same slot."
 *
 * They existed and were already faster — the fault was that they lived in a slot of their own on a
 * key of their own, so the game had two unrelated answers to "what am I travelling on".
 */
test('the horse and every vehicle you own are one choice, and H honours it', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const before = fh.hud.ground();
    // grant a motorcycle the way building one would
    fh.player.vehicles.owned.ground = ['motorcycle'];
    const after = fh.hud.ground();
    fh.hud.onSelectRide('motorcycle');
    return {
      before: before.options.map(o => o.name),
      after: after.options.map(o => ({ name: o.name, note: o.note })),
      active: fh.hud.ground().active,
      saved: fh.player.rideChoice,
    };
  });
  console.log('ride:', JSON.stringify(out, null, 1));
  /**
   * R22 — THE LIST IS EVERY MOUNT YOU OWN, EVERY VEHICLE YOU BUILT, AND ON FOOT.
   *
   * R15 made this one choice where there had been two systems; R22 finished the job by folding the
   * character sheet's separate Mount dropdown into it, because with one horse and no truck the two
   * were the same two words printed twice at two different speeds. So the list carries the mounts
   * as well now, and an "— on foot —" row, which is the only way to take a mount off once the row
   * that did that is gone. The rule is still "one list with the horse at the top of it"; the count
   * is not the rule.
   */
  const rideable = rows => rows.filter(r => !/on foot/i.test(r.name ?? r));
  expect(rideable(out.before).length).toBe(1);
  expect(out.before.some(n => /on foot/i.test(n))).toBe(true);
  const after = rideable(out.after);
  expect(after.length).toBe(2);
  expect(after[1].name).toMatch(/Scrambler|Motorcycle/i);
  // the note has to say what each is FOR — the horse is the one that climbs
  expect(after[0].note).toMatch(/climbs anything/);
  expect(after[1].note).toMatch(/m\/s/);
  // …and every row is in the same unit, which is what the two dropdowns used to disagree about
  for (const r of out.after) expect(r.note).toMatch(/m\/s/);
  expect(out.active).toBe('motorcycle');
  expect(out.saved).toBe('motorcycle');
  expect(errors).toEqual([]);
});

test('every ground vehicle is genuinely faster than the horse', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const walk = 5.4, mountMult = 1.6;   // the starting Trail Horse, from js/gear.js
    const horse = walk * mountMult;
    return {
      horse,
      vehicles: Object.values(fh.groundVehicles || {}).map(v => ({ name: v.name, speed: v.speed })),
    };
  });
  console.log('speeds:', JSON.stringify(out));
  expect(out.vehicles.length).toBe(3);
  for (const v of out.vehicles) {
    expect(v.speed, `${v.name} is not faster than the horse`).toBeGreaterThan(out.horse);
  }
  expect(errors).toEqual([]);
});

/**
 *   "I have stone and clay and I built a furnace. Now what?"
 *   "I don't really know how to get iron ore or how to transport ore to my base for refining."
 *
 * The build panel's six-line starting list was written for exactly these and deleted itself the
 * moment anything was standing — on screen for the minute you did not need it, gone for the hour
 * you did. Both players had already built something.
 */
test('the build panel always says what to do next, even once you have built things', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    // open build mode with nothing built: the numbered starting list
    fh.build.setMode(true); fh.buildUI.setOpen(true); fh.buildUI.refresh();
    const fresh = document.querySelector('.build-steps')?.textContent || '';
    // now build something, which is what used to make the guidance vanish
    const t = fh.terrain;
    const ok = (x, z) => !t.underwater(x, z) && t.riverAt(x, z) <= 0.3 && t.slopeAt(x, z, 4) < 0.16;
    let bx = null, bz = null;
    for (let r = 20; r < 900 && bx === null; r += 20) {
      for (let a = 0; a < 16; a++) {
        const x = fh.control.x + Math.cos(a / 16 * 6.283) * r, z = fh.control.z + Math.sin(a / 16 * 6.283) * r;
        if (ok(x, z)) { bx = x; bz = z; break; }
      }
    }
    fh.build.select('storage_crate');
    /**
     * The catalogue prices things in SHORT names (`plank`, `iron`) and the bag holds the real ids
     * (`plank`, `iron_ingot`) — `MATERIAL_ALIASES` joins them at boot. Granting both spellings is
     * the test's business, not the game's.
     */
    for (const [id, n] of Object.entries({ plank: 40, iron: 20, iron_ingot: 20, log: 40, stone: 60 })) fh.bag.add?.(id, n);
    fh.build.aim?.(bx, bz);
    const placed = fh.build.placeHere();
    fh.buildUI.refresh();
    const after = document.querySelector('.build-steps')?.textContent || '';
    fh.build.setMode(false);
    return {
      fresh: fresh.slice(0, 80), after,
      placed: { ok: !!placed?.ok, why: placed?.why ?? null },
      entries: (fh.build.entries || []).length,
      hasNext: !!document.querySelector('.build-next'),
    };
  });
  console.log('next step:', JSON.stringify(out, null, 1));
  expect(out.fresh).toMatch(/Starting a base/);
  expect(out.placed.ok, out.placed.why || '').toBe(true);
  expect(out.entries).toBeGreaterThan(0);
  // THE BUG: this used to be empty
  expect(out.after.length, 'the guidance vanished the moment something was built').toBeGreaterThan(20);
  expect(out.after).toMatch(/Next/);
  expect(errors).toEqual([]);
});

/**
 *   "Then I would like to add a few drills next to an outpost marker, maybe with a chest for
 *    storage, and have that base generate ore."
 *
 * The whole loop, end to end, with nothing hand-wired: place a marker, put drills on real seams
 * around it and a crate beside them, and let the clock run. If the ore does not appear in the crate
 * then one of five joins is broken and it does not matter which of them looks correct in isolation.
 */
test('drills beside an outpost marker fill its crate with ore, on their own', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const fh = window.farhold;
    const t = fh.terrain;
    const buildable = (x, z) => !t.underwater(x, z) && t.riverAt(x, z) <= 0.3 && t.slopeAt(x, z, 4) < 0.18;

    // find real seams near the player — the ones the world actually generated
    const sweep = fh.scan.sweep(null, null, 900);
    /**
     * Seams within ninety metres of each other — that is the marker's claim, and "a few drills next
     * to an outpost marker" is what the ask described. A sweep reaches 900 m, so picking the first
     * three hits gives three seams hundreds of metres apart and three separate outposts, which is
     * the game behaving correctly and the test asking the wrong question.
     */
    const workable = (sweep.hits || []).filter(h => buildable(h.x, h.z));
    let seams = [];
    for (const h of workable) {
      const near = workable.filter(o => Math.hypot(o.x - h.x, o.z - h.z) < 80);
      if (near.length > seams.length) seams = near.slice(0, 3);
      if (seams.length >= 3) break;
    }
    if (seams.length < 2) return { skipped: `no two workable seams within 80 m of each other on this seed` };

    const give = key => {
      const need = (fh.structures.structures || []).find(p => p.id === key)?.cost || {};
      for (const [id, n] of Object.entries(need)) {
        fh.bag.add?.(id, n * 6);
        // the catalogue prices in short names and the bag holds real ids; grant both
        fh.bag.add?.(id === 'iron' ? 'iron_ingot' : id, n * 6);
      }
    };
    const put = (key, x, z) => {
      fh.build.setMode(true); fh.build.select(key); give(key);
      fh.build.aim?.(x, z);
      const r = fh.build.placeHere();
      fh.build.setMode(false);
      return { ok: !!r?.ok, why: r?.why ?? null };
    };

    // a marker at the first seam, a drill on each seam, and a crate beside the marker
    const home = seams[0];
    const marker = put('claim_stone', home.x + 6, home.z + 6);
    const crate = put('storage_crate', home.x + 9, home.z + 6);
    const drills = seams.map(s => put('small_drill', s.x, s.z));

    // let the clock run: the drills dig, and whatever is not already in a pool routes itself
    for (let i = 0; i < 40; i++) fh.mining.tick(3);

    const pools = fh.stores.pools() || [];
    const held = {};
    for (const p of pools) for (const [id, n] of Object.entries(p.totals || {})) held[id] = (held[id] || 0) + n;
    const overview = fh.mining.overview() || [];
    return {
      seams: seams.map(s => s.name),
      marker, crate, drills,
      outposts: (fh.build.outposts() || []).map(p => ({ name: p.name, count: p.count, role: p.role })),
      dug: overview.map(d => ({ stock: Math.round(d.stock || 0), res: d.resource })),
      held,
    };
  });
  console.log('outpost loop:', JSON.stringify(out, null, 1));
  if (out.skipped) { console.log('skipped:', out.skipped); return; }

  expect(out.marker.ok, out.marker.why || '').toBe(true);
  expect(out.crate.ok, out.crate.why || '').toBe(true);
  expect(out.drills.filter(d => d.ok).length, 'no drill would stand on a seam').toBeGreaterThan(0);

  // the marker's ninety-metre claim makes the whole lot ONE outpost
  expect(out.outposts.length, 'the marker did not gather the drills and the crate into one base').toBe(1);

  // and it generates ore without anybody touching it
  const totalDug = out.dug.reduce((n, d) => n + d.stock, 0);
  const inStores = Object.values(out.held).reduce((n, v) => n + v, 0);
  expect(totalDug + inStores, 'the drills dug nothing at all').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/**
 * R15 — a solo player IS the workforce.
 *
 * The Civilization Expansion made a machine need work units before it runs, and I turned that on
 * from the first minute of a new game — before anybody can have a colony. So a player who built a
 * furnace, queued iron and stood over it was told "Standing cold — nobody is working this", by a
 * game in which they were the only person alive. That is the sort of regression that reads as the
 * feature being broken rather than as a rule you have not met yet.
 */
test('a furnace you are standing at runs, with no colony anywhere', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const fh = window.farhold;
    /**
     * Ask the GAME whether a spot will take a furnace, rather than guessing with a slope sample —
     * `build.aim()` returns the same check the ghost turns red on, footprint corners and all, which
     * is the only test that agrees with `placeHere`.
     */
    fh.build.setMode(true); fh.build.select('furnace');
    for (const [id, n] of Object.entries({ stone: 120, clay: 80 })) fh.bag.add?.(id, n);
    let fx = null, fz = null;
    for (let r = 6; r < 120 && fx === null; r += 4) {
      for (let a = 0; a < 16; a++) {
        const x = fh.control.x + Math.cos(a / 16 * 6.283) * r, z = fh.control.z + Math.sin(a / 16 * 6.283) * r;
        if (fh.build.aim?.(x, z)?.ok) { fx = x; fz = z; break; }
      }
    }
    if (fx === null) { fh.build.setMode(false); return { skipped: 'nowhere within 120 m will take a furnace' }; }

    fh.build.aim?.(fx, fz);
    const placed = fh.build.placeHere();
    fh.build.setMode(false);
    if (!placed?.ok) return { placed };

    const m = (fh.build.entries || []).map(e => fh.works.get(e.id)).find(Boolean);

    /**
     * A machine draws its inputs from the STORE POOL it is standing in — so a furnace with no crate
     * beside it has nowhere to take ore from, whoever is working it. That is the rule, not a bug:
     * it is why "put down a Furnace and a Storage Crate" is one step in the starting list.
     */
    fh.build.setMode(true); fh.build.select('storage_crate');
    for (const [id, n] of Object.entries({ plank: 60, iron: 20, iron_ingot: 20 })) fh.bag.add?.(id, n);
    let crate = null;
    for (let r = 3; r < 14 && !crate; r += 1.5) {
      for (let a = 0; a < 12; a++) {
        const x = fx + Math.cos(a / 12 * 6.283) * r, z = fz + Math.sin(a / 12 * 6.283) * r;
        if (fh.build.aim?.(x, z)?.ok) { fh.build.aim(x, z); crate = fh.build.placeHere(); break; }
      }
    }
    fh.build.setMode(false);
    const pool = fh.stores.poolAt(fx, fz);
    if (!pool) return { skipped: 'no store pool formed beside the furnace' };
    fh.stores.put(pool, 'log', 60);
    fh.stores.put(pool, 'iron_ore', 30);

    const recipe = (fh.works.board(m.type) || []).find(r => /iron/i.test(r.name));
    fh.works.queue(m.id, recipe.id, 2);

    // there is no colony: nobody but the player exists
    const citizens = fh.colony?.citizens?.length ?? 0;
    // stand there and let it run
    for (let i = 0; i < 90; i++) { fh.works.credit(m.id, 0.5 / 30 * 15); fh.works.tick(0.5); }
    return {
      placed, citizens,
      state: fh.works.stateText(m),
      made: m.made || 0,
      queue: m.queue.length,
    };
  });
  console.log('solo furnace:', JSON.stringify(out));
  if (out.skipped) { console.log('skipped:', out.skipped); return; }
  expect(out.placed.ok, out.placed.why || '').toBe(true);
  expect(out.citizens, 'this test is meaningless with a colony in it').toBe(0);
  expect(out.state, 'a furnace you are standing over is still cold').not.toMatch(/Standing cold/);
  expect(out.made, 'nothing was smelted').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/**
 * R16 — A JAVELIN DOES NOT RUN OUT, BECAUSE NOTHING IN THIS GAME DOES.
 *
 *   "You also mentioned javelins 'cost nothing'. Are you referring to ammo? I do not want any
 *    ammunition system in the game at this point."
 *
 * Round 15 gave it a count of six and a pick-them-up-off-the-ground loop; this is the same test
 * turned round. A javelin is balanced by what it IS — 28 m of reach against a longbow's 54, on a
 * 0.75 s throw clock — and throwing one costs nothing but the time.
 */
test('a javelin throws for ever, and nothing counts ammunition', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const fh = window.farhold;
    const jav = fh.rpg.loot.generate('javelin', 'normal', 'medium', { rng: fh.rpg.rng, level: 1 });
    if (!jav) return { skipped: 'no javelin base in the loot tables' };
    fh.rpg.equip(fh.player, jav, { force: true });
    fh.rpg.refresh(fh.player);
    const carried = fh.player.derived.swing?.main?.carried ?? null;
    const thrown = [];
    for (let i = 0; i < 12; i++) {
      fh.swingNow();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      fh.control.attackCooldown = 0;
      thrown.push(i);
    }
    return { carried, ammo: fh.player.javelins ?? null, onGround: (fh.player.javelinsOnGround || []).length, throws: thrown.length };
  });
  console.log('javelins:', JSON.stringify(out));
  if (out.skipped) { console.log('skipped:', out.skipped); return; }
  expect(out.carried, 'the ranged plan still declares an ammunition count').toBeFalsy();
  expect(out.ammo, 'something is still counting javelins on the player').toBeNull();
  expect(out.onGround, 'javelins are still being dropped on the ground to collect').toBe(0);
  expect(out.throws, 'twelve throws did not happen').toBe(12);
  expect(errors).toEqual([]);
});
