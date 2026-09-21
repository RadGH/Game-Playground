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
