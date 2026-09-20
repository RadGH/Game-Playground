// R14 — the Civilization Expansion, driven through the real page.
//
//   "Do a new Civilization Expansion which integrates with the build system and adds NPC housing
//    and utilities. The goal being that you can have ore sent to a town and have an NPC run the
//    furnace to smelt it automatically, consuming work."
//
// The point of this file is the one fault this project keeps finding: a finished module that
// nothing calls. Every test here asks "is it reachable from the running game", not "does the pure
// module work" — the node tests already cover that.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('every piece of the expansion is reachable from the running game', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    return {
      civics: !!fh.civics, holding: !!fh.holding,
      housing: !!fh.housing, hold: !!fh.hold, trade: !!fh.goodsMarket, muster: !!fh.muster,
      // the switch: `labour` handed to createWorks is what makes a machine need a worker
      labourOn: !!fh.works?.labour || !!fh.works?.needsLabour || typeof fh.works?.machines === 'function',
      machines: typeof fh.works?.machines === 'function' ? (fh.works.machines() || []).length : -1,
    };
  });
  console.log('civics wiring:', JSON.stringify(out));
  for (const k of ['civics', 'holding', 'housing', 'hold', 'trade', 'muster']) {
    expect(out[k], `${k} is not on window.farhold — the module exists and nothing calls it`).toBe(true);
  }
  // `works.machines()` has been called by main.js since the building expansion and did not exist,
  // so js/work.js's third source has never once run
  expect(out.machines).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('K opens the Holding, and it has all six tabs', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.holding.show());
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => ({
    open: window.farhold.holding.open,
    tabs: [...document.querySelectorAll('.civics-rail button')].map(b => b.textContent),
    subtitle: document.querySelector('.civics-head .civ-sub, .civics-head')?.textContent?.slice(0, 80),
  }));
  console.log('holding:', JSON.stringify(out));
  expect(out.open).toBe(true);
  expect(out.tabs).toEqual(['People', 'Houses', 'Work', 'Traders', 'Trade', 'Muster']);
  expect(errors).toEqual([]);
});

test('the muster tab says what a muster is, and never offers one with nothing at stake hidden', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => { window.farhold.holding.show('muster'); });
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => document.querySelector('.civics-body')?.textContent || '');
  console.log('muster tab:', text.slice(0, 220));
  // the user's own condition has to be on the screen, not only in the code
  expect(text).toMatch(/nothing happens at all|no wall comes down|Stand at your own holding/i);
  expect(errors).toEqual([]);
});

test('the hold is weight-based and separate from the adventuring bag', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const h = fh.hold;
    const good = (fh.goodsMarket.goods || [])[0];
    const before = h.bar();
    // put something in it and prove the adventuring bag did not change
    const bagBefore = fh.player.bag.length;
    const put = h.put(good.id, 4);
    const after = h.bar();
    // and that it refuses what will not fit rather than silently swallowing it
    h.capacity = 1;
    const overload = h.put(good.id, 9999);
    return {
      good: good.id, kgEach: good.kg ?? good.weight ?? null,
      put, before, after, overload,
      bagBefore, bagAfter: fh.player.bag.length,
      weighed: /kg/.test(after.text || ''),
    };
  });
  console.log('hold:', JSON.stringify(out));
  // "intermediate items that are stored in a weight-based inventory system"
  expect(out.weighed).toBe(true);
  expect(out.put).toBeGreaterThan(0);
  expect(out.after.used).toBeGreaterThan(out.before.used);
  // a hold that is full takes nothing — it must never destroy what it cannot carry
  expect(out.overload).toBe(0);
  // …and it is SEPARATE from the bag you adventure with
  expect(out.bagAfter).toBe(out.bagBefore);
  expect(errors).toEqual([]);
});

test('a town has real prices, so buying low and selling high is a real thing', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    const towns = (fh.world?.nodes || []).filter(n => n.type === 'settlement').slice(0, 8);
    const good = (fh.goodsMarket.goods || [])[0];
    const priced = towns.map(t => ({ name: t.name, price: fh.goodsMarket.priceAt(good.id, t, 1) }));
    const values = priced.map(p => p.price).filter(v => typeof v === 'number' && v > 0);
    return {
      good: good.id,
      priced: priced.slice(0, 5),
      spread: values.length ? Math.max(...values) - Math.min(...values) : -1,
      base: good.base,
    };
  });
  console.log('town prices:', JSON.stringify(out));
  /**
   * "This would also allow the player to manufacture items and sell them via trade routes, or buy
   *  intermediate products from existing towns instead of setting up a supply route."
   *
   * None of that exists if every town quotes the same number. The prices are derived from what a
   * town IS — its plots, its biome, its size, its culture — so there is no authored data per
   * settlement and a world always has somewhere cheap and somewhere dear.
   */
  expect(out.spread, 'every town quotes the same price, so there is nothing to trade').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
