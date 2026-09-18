// The boat, in the real page.
//
// "Boats should automatically equip when you start swimming and increase water travel movement
// speed." The numbers are pinned in tests/vehicles.test.js; this is the part that only exists once
// there is a browser — walking into a lake, the hull appearing under you, and the same stretch of
// water taking less time in a boat you paid for.
//
// The shop half is here too: a merchant has to have all three mounts and all three lights on the
// shelf, because the node test only proves `stockFor` returns them, not that the shop shows them.

import { test, expect } from '@playwright/test';

async function land(page, { seed = 11, cls = 'ranger', extra = '' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=${cls}${extra}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/**
 * Put the player in the nearest deep water and let a frame run.
 *
 * Searches outward from wherever they are standing rather than using a fixed coordinate: the world
 * is generated from the seed, so "the lake" is not in the same place twice.
 */
async function wadeIn(page) {
  return page.evaluate(() => {
    const f = window.farhold;
    const terrain = f.view?.terrain || f.control?.terrain || null;
    const swimDepth = f.balance.player?.swimDepth ?? 1.3;
    const { x: ox, z: oz } = f.control;
    let found = null;
    // rings outward, a few hundred metres — far enough to find a river or a lake on any seed
    for (let r = 20; r <= 900 && !found; r += 20) {
      for (let a = 0; a < 24; a++) {
        const x = ox + Math.cos(a / 24 * Math.PI * 2) * r;
        const z = oz + Math.sin(a / 24 * Math.PI * 2) * r;
        const w = f.terrainAt ? f.terrainAt(x, z) : null;
        const water = w || (terrain?.waterAt ? terrain.waterAt(x, z) : null);
        if (water && water.depth > swimDepth + 0.6) { found = { x, z, surface: water.surface }; break; }
      }
    }
    if (!found) return { found: false };
    f.control.x = found.x;
    f.control.z = found.z;
    f.control.y = found.surface - 0.4;          // down in it, not skating over the top
    return { found: true, ...found };
  });
}

// ---------------------------------------------------------------- the boat puts itself in the water

test('walking into deep water puts you in the boat you own, and taking you out puts it away', async ({ page }) => {
  const errors = await land(page);
  const spot = await wadeIn(page);
  test.skip(!spot.found, 'this seed has no deep water within 900 m of the landing site');

  // a couple of frames so the controller samples the water and boards
  await page.waitForTimeout(400);
  const afloat = await page.evaluate(() => ({
    swimming: window.farhold.control.swimming,
    boating: window.farhold.control.boating?.key || null,
    speed: window.farhold.control.boating?.speed || 0,
  }));
  expect(afloat.swimming).toBe(true);
  expect(afloat.boating).toBe('raft');           // what every character starts with
  expect(afloat.speed).toBeGreaterThan(2.7);     // the flat swim speed it replaces

  // back onto dry land: the boat goes away rather than following you up the bank.
  // `control.teleport` puts you down on the ground properly; `control.spawn` is where you landed,
  // which is always walkable because the game chose it.
  await page.evaluate(() => {
    const f = window.farhold;
    f.control.teleport(f.control.spawn.x, f.control.spawn.z);
  });
  await page.waitForTimeout(400);
  const ashore = await page.evaluate(() => ({
    swimming: window.farhold.control.swimming,
    boating: window.farhold.control.boating?.key || null,
  }));
  expect(ashore.swimming).toBe(false);
  expect(ashore.boating).toBe(null);
  expect(errors).toEqual([]);
});

test('a boat you bought is the boat that appears, and it is faster than the one you were given', async ({ page }) => {
  const errors = await land(page);
  const bought = await page.evaluate(() => {
    const f = window.farhold;
    f.player.gold = 9999;
    return f.buyVehicle
      ? f.buyVehicle('boat', 'cutter')
      : null;
  });
  // the handle may not expose a buy helper; fall back to the module the page already imported
  if (!bought?.ok) {
    await page.evaluate(async () => {
      const gear = await import('./js/gear.js');
      window.farhold.player.gold = 9999;
      gear.unlockVehicle(window.farhold.player, 'boat', 'cutter');
    });
  }

  const spot = await wadeIn(page);
  test.skip(!spot.found, 'this seed has no deep water within 900 m of the landing site');
  await page.waitForTimeout(400);

  const afloat = await page.evaluate(() => ({
    boating: window.farhold.control.boating?.key || null,
    speed: window.farhold.control.boating?.speed || 0,
  }));
  expect(afloat.boating).toBe('cutter');
  expect(afloat.speed).toBeGreaterThan(3.4);     // beats the raft it replaced
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- the rack in the shop

test('a merchant has all three mounts and all three lights on the shelf', async ({ page }) => {
  const errors = await land(page);
  const shelf = await page.evaluate(() => {
    const f = window.farhold;
    // any merchant will do — the rack is the same everywhere, which is the point of the fix
    const npc = f.folk.roster().find(n => n.badge === 'shop' || n.role === 'merchant')
      || f.folk.roster()[0];
    if (!npc) return { none: true };
    return { keys: f.folk.shelves(npc, f.player.level || 1).other.map(i => i.baseKey || i.name) };
  });
  test.skip(!!shelf.none, 'nobody is awake near the landing site on this seed');

  for (const key of ['pony', 'courser', 'dray', 'torch', 'lantern', 'wisplamp']) {
    expect(shelf.keys, `the shelf is missing ${key}`).toContain(key);
  }
  expect(errors).toEqual([]);
});

test('the Other tab has a Mounts heading and a Lights heading, and every row says what it is', async ({ page }) => {
  const errors = await land(page);
  // stand in the nearest town and wait for its people to wake up, the way town.spec.js does
  const opened = await page.evaluate(async () => {
    const f = window.farhold;
    const town = f.features.nearest('settlement', f.control.x, f.control.z);
    f.teleport(town.wx, town.wz);
    const t0 = Date.now();
    while (f.folk.stats().people === 0 && Date.now() - t0 < 25000) await new Promise(r => setTimeout(r, 200));
    const npc = [...f.folk.live.values()].flat().find(p => p.trades);
    if (!npc) return false;
    f.openTalk(npc);
    return true;
  });
  test.skip(!opened, 'no merchant near the landing site on this seed');

  // the shop opens on Weapons; the racks are in Other, which is the whole point of the complaint
  await page.locator('.shop-tabs .chip', { hasText: 'Other' }).click();

  const racks = await page.locator('.trade-rack h4').allTextContents();
  expect(racks).toContain('Mounts');
  expect(racks).toContain('Lights');

  // and a row is readable without hovering it
  const specs = await page.locator('.trade-row .trade-spec').allTextContents();
  expect(specs.filter(Boolean).length).toBeGreaterThan(0);
  expect(specs.some(t => /m\/s/.test(t)), 'a mount row should give its speed').toBe(true);
  expect(specs.some(t => /lights \d+ m/.test(t)), 'a light row should say how far it lights').toBe(true);
  expect(errors).toEqual([]);
});
