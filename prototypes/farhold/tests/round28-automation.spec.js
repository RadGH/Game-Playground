// R28 — automation, driven through the real page.
//
//   "Improve building system and automation … update interfaces."
//
// The node tests (tests/round28-automation.test.js) cover the pure logic. This file asks the
// question this project keeps having to ask: is it REACHABLE from the running game? It builds a
// real base — a real Bunkhouse first, because the Holding's population reading used to throw
// "filter is not a function" the moment a real house stood — then:
//
//   1. a furnace on a keep-in-stock order with no ore is starved, the alert waits out its grace,
//      the HUD pill appears, a click opens the Production tab, and the machine row says WHY;
//   2. the Trade tab's "Send a cart" loads goods from a Trade Post, prices the run and sends it,
//      and it shows up "On the road".
//
// Screenshots go to prototypes/farhold/research/round28-automation/ (test-results/ is wiped by every run).

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Find flat ground, level it, and put up a claim stone, a Bunkhouse, a chest, a furnace and a Trade Post. */
async function buildBase(page) {
  return page.evaluate(async () => {
    const f = window.farhold;
    const t = f.terrain;
    const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.25;
    let spot = null;
    outer: for (let r = 0; r <= 1200; r += 20) for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
      if (flat(x, z) && flat(x + 20, z) && flat(x, z + 16)) { spot = { x, z }; break outer; }
    }
    if (!spot) return { none: true };
    f.control.teleport(spot.x - 6, spot.z - 6);
    for (const piece of f.structures.structures || []) {
      for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 900);
    }
    f.player.gold = Math.max(f.player.gold || 0, 500);
    await new Promise(r => setTimeout(r, 400));
    f.build.setMode(true);
    f.build.research?.unlockAll?.();
    f.build.setTool('smooth'); f.build.setRadius(22);
    f.build.aim(spot.x + 8, spot.z + 6); f.build.paint();
    f.build.setTool('build');
    const place = (key, dx, dz) => { f.build.select(key); f.build.aim(spot.x + dx, spot.z + dz); return f.build.placeHere(); };
    const placed = {
      claim: place('claim_stone', 0, 0),
      house: place('bunkhouse', 0, 12),
      chest: place('storage_chest', 10, 0),
      furnace: place('furnace', 14, 0),
      post: place('trade_post', 10, 10),
    };
    f.build.setMode(false);
    await new Promise(r => setTimeout(r, 1200));
    const entries = f.build.entries || [];
    return {
      spot,
      placed: Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, !!(v && v.ok !== false)])),
      keys: entries.map(e => e.key),
      furnace: entries.find(e => e.key === 'furnace')?.id ?? null,
      post: entries.find(e => e.key === 'trade_post')?.id ?? null,
    };
  });
}

test('a starved furnace raises the pill, and the Production tab says why', async ({ page }) => {
  // the alert's 12 s grace is GAME time, and a headless page runs at a few frames a second
  test.setTimeout(360000);
  const errors = await land(page);
  const base = await buildBase(page);
  expect(base.none, 'nowhere flat to build').toBeFalsy();
  console.log('base:', JSON.stringify(base));
  expect(base.keys, 'the Bunkhouse did not go up').toContain('bunkhouse');
  expect(base.furnace, 'the furnace did not go up').not.toBeNull();

  // the People tab on a REAL house first: this is the screen that used to throw
  await page.evaluate(() => { const f = window.farhold; f.hud.toggleSheet?.(true); f.hud.setTab?.('holding'); f.holding.tab = 'people'; });
  await page.waitForTimeout(400);
  const people = await page.evaluate(() => document.querySelector('.civics-body')?.textContent || '');
  console.log('people tab:', people.slice(0, 200));
  // the sheet pauses the world; shut it so the furnace has time to be starved
  await page.evaluate(() => window.farhold.hud.toggleSheet?.(false));

  // a keep-in-stock order with nothing to smelt
  const queued = await page.evaluate(id => {
    const f = window.farhold;
    const m = f.works.get(id);
    const recipe = Object.values(f.works.recipes).find(r => r.machine === m.type && r.inputs?.iron_ore) || Object.values(f.works.recipes).find(r => r.machine === m.type);
    const pool = f.stores.poolAt(m.x, m.z);
    for (const k of Object.keys(recipe.inputs || {})) f.stores.take(pool, k, 9999);
    f.stores.put(pool, 'log', 40);           // fuel, so the only thing short is the ore
    return { recipe: recipe.id, out: f.works.queue(id, recipe.id, 0, { keep: 20 }) };
  }, base.furnace);
  console.log('queued:', JSON.stringify(queued));
  expect(queued.out.ok, queued.out.why).toBe(true);

  // the alert waits out its grace (12 s) before it is an alert
  const lit = await page.waitForFunction(() => !document.getElementById('prod-pill')?.hidden, null, { timeout: 150000 }).then(() => true, () => false);
  if (!lit) {
    console.log('pill never lit:', JSON.stringify(await page.evaluate(id => {
      const f = window.farhold; const m = f.works.get(id);
      let threw = null; try { f.production.sample(f.state.elapsed); } catch (e) { threw = String(e && e.stack || e); }
      return { state: m.state, starvedFor: m.starvedFor, sheet: f.hud.sheetOpen, paused: f.state.paused, elapsed: f.state.elapsed, samples: f.production.samples, threw, alerts: f.production.alerts(), sum: f.production.summary() };
    }, base.furnace)));
  }
  expect(lit, 'the pill never appeared').toBe(true);
  const pill = await page.evaluate(() => document.getElementById('prod-pill').textContent);
  console.log('pill:', pill);
  expect(pill).toMatch(/need.*K/);

  // close the sheet, then the pill opens it straight onto Production
  await page.evaluate(() => window.farhold.hud.toggleSheet?.(false));
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('prod-pill').click());
  await page.waitForTimeout(600);
  const tab = await page.evaluate(() => ({
    on: document.querySelector('.civics-rail button.on')?.textContent || '',
    text: document.querySelector('.civics-body')?.textContent || '',
    badge: document.querySelector('.civics-rail .civ-badge')?.textContent || '',
  }));
  console.log('production tab:', tab.text.slice(0, 600));
  expect(tab.on).toMatch(/^Production/);
  expect(tab.badge, 'the rail carries the alert count').toMatch(/\d/);
  expect(tab.text).toMatch(/Needs you/);
  expect(tab.text).toMatch(/Furnace/);
  expect(tab.text, 'the machine row does not say what it is short of').toMatch(/iron ore/i);
  expect(tab.text).toMatch(/keep 20 in stock/);
  await page.screenshot({ path: 'prototypes/farhold/research/round28-automation/production.png' });

  // the keep line moves from the tab, and the furnace hears it
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.civics-body .prod-machine .prod-btn')].find(x => x.textContent === '+10');
    b?.click();
  });
  await page.waitForTimeout(300);
  const keep = await page.evaluate(id => window.farhold.works.get(id).queue[0].keep, base.furnace);
  expect(keep, 'the +10 button did not reach the machine').toBe(30);
  expect(errors).toEqual([]);
});

test('the Trade tab sends a cart from a Trade Post, and it goes on the road', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await land(page);
  const base = await buildBase(page);
  expect(base.none, 'nowhere flat to build').toBeFalsy();
  expect(base.post, 'the Trade Post did not go up').not.toBeNull();

  const setup = await page.evaluate(id => {
    const f = window.farhold;
    const e = (f.build.entries || []).find(x => x.id === id);
    const pool = f.stores.poolAt(e.x, e.z);
    const put = f.stores.put(pool, 'salt_block', 6);
    f.hud.toggleSheet?.(true); f.hud.setTab?.('holding'); f.holding.tab = 'trade';
    return { put, gold: f.player.gold, routes: f.goodsMarket.list().length };
  }, base.post);
  expect(setup.put, 'the post would not take the goods').toBeGreaterThan(0);
  await page.waitForTimeout(500);

  const form = await page.evaluate(() => ({
    text: document.querySelector('.civics-body')?.textContent || '',
    towns: document.querySelectorAll('.civ-cart-to option').length,
    good: !!document.querySelector('.civ-cart-good[data-good="salt_block"]'),
  }));
  console.log('cart form:', form.text.slice(0, 400));
  expect(form.text).toMatch(/Send a cart/);
  expect(form.towns, 'no town to send it to').toBeGreaterThan(0);
  expect(form.good, 'the salt at the post is not offered').toBe(true);

  // load three, read the price, send it — through the buttons
  await page.evaluate(() => {
    const row = document.querySelector('.civ-cart-good[data-good="salt_block"]');
    [...row.querySelectorAll('.prod-btn')].find(b => b.textContent === '+1').click();
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const row = document.querySelector('.civ-cart-good[data-good="salt_block"]');
    [...row.querySelectorAll('.prod-btn')].find(b => b.textContent === '+1').click();
    [...document.querySelector('.civ-cart-good[data-good="salt_block"]').querySelectorAll('.prod-btn')].find(b => b.textContent === '+1').click();
  });
  await page.waitForTimeout(300);
  const priced = await page.evaluate(() => ({
    plan: document.querySelector('.civ-cart-plan')?.textContent || '',
    disabled: document.querySelector('.civ-cart-send')?.disabled,
  }));
  console.log('priced:', priced.plan);
  expect(priced.plan).toMatch(/Sells for \d+ gold/);
  expect(priced.disabled).toBe(false);
  await page.screenshot({ path: 'prototypes/farhold/research/round28-automation/trade.png' });

  await page.evaluate(() => document.querySelector('.civ-cart-send').click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(id => {
    const f = window.farhold;
    const e = (f.build.entries || []).find(x => x.id === id);
    return {
      routes: f.goodsMarket.list().length,
      left: f.stores.count(f.stores.poolAt(e.x, e.z), 'salt_block'),
      gold: f.player.gold,
      text: document.querySelector('.civics-body')?.textContent || '',
    };
  }, base.post);
  console.log('after:', JSON.stringify({ ...after, text: after.text.slice(0, 200) }));
  expect(after.routes, 'nothing went on the road').toBe(setup.routes + 1);
  expect(after.left).toBe(setup.put - 3);
  expect(after.gold, 'the upkeep was not paid').toBeLessThan(setup.gold);
  expect(after.text).toMatch(/On the road/);
  expect(after.text).not.toMatch(/No carts out/);
  await page.screenshot({ path: 'prototypes/farhold/research/round28-automation/trade-sent.png' });
  expect(errors).toEqual([]);
});
