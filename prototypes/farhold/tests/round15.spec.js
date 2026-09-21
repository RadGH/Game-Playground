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
  // the card has to answer the actual question — "there is no slot" and "here is the next rung"
  expect(out.tip).toMatch(/no separate tool slot/i);
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
