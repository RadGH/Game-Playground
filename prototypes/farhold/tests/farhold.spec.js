// Farhold driven through the real page: land, look at the horizon, walk, swing, level up, loot.
//
// The page exposes window.farhold for exactly this (see js/main.js). Headless Chromium runs WebGL
// on SwiftShader, so this uses ?quality=low (three terrain rings instead of five) — every other
// system is the real one.

import { test, expect } from '@playwright/test';

/** Open the page, land on the planet, and collect any error the page throws. */
async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('the planet builds, the horizon is drawn, and the sky holds the rest of the system', async ({ page }) => {
  const errors = await land(page);
  const info = await page.evaluate(() => {
    const f = window.farhold;
    return {
      stats: f.stats(),
      planet: { name: f.planet.name, archetype: f.planet.archetype, giant: f.planet.giant, gravity: f.planet.gravity },
      system: f.system.planets.length,
      worldKm: [f.terrain.widthM / 1000, f.terrain.depthM / 1000],
      standingOn: f.terrain.biomeAt(f.control.x, f.control.z).name,
      groundUnderFeet: f.terrain.heightAt(f.control.x, f.control.z),
    };
  });

  expect(errors).toEqual([]);
  expect(info.planet.giant).toBe(false);
  expect(info.system).toBeGreaterThan(0);
  // a real planet, tens of kilometres across
  expect(info.worldKm[0]).toBeGreaterThan(50);
  expect(info.stats.triangles).toBeGreaterThan(2000);
  expect(info.stats.rings).toBeGreaterThanOrEqual(3);
  // The horizon follows the planet size (round 10 default: Small, 57 x 29 km) — at ?quality=low the
  // three rings reach about 1.8 km on it, which is further across THIS world than 3 km was across a
  // full-size one. What matters is that there is a real horizon, so the floor is relative.
  expect(info.stats.viewDistance).toBeGreaterThan(Math.min(2000, info.worldKm[0] * 1000 * 0.025));
  // the player is standing on the ground, not inside it or above it
  expect(Math.abs(info.stats.height - info.groundUnderFeet)).toBeLessThan(1.5);
  // something from the same star system is up there
  expect(info.stats.sky.length).toBeGreaterThan(0);
});

test('the terrain follows the player and the ground under them stays solid', async ({ page }) => {
  await land(page);
  const walk = await page.evaluate(async () => {
    const f = window.farhold;
    const start = { x: f.control.x, z: f.control.z, rebuilds: f.stats().rebuilds };
    // Jump 4 km across the planet — every ring has to rebuild. Land on DRY GROUND: round 4b starts
    // the player in a town, so a blind offset can now drop you in the sea, where `onGround` is false
    // because you are swimming, which is correct behaviour and a broken test.
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 6;
      const r = 4000 * (0.9 + (i / 48) * 0.6);
      const [x, z] = f.terrain.clampToWorld(f.control.x + Math.cos(a) * r, f.control.z + Math.sin(a) * r);
      if (f.terrain.underwater(x, z)) continue;
      f.teleport(x, z);
      break;
    }
    await new Promise(r => requestAnimationFrame(r));
    const after = f.stats();
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const x = f.control.x + i * 37, z = f.control.z + i * 53;
      samples.push(f.terrain.heightAt(x, z));
    }
    return {
      moved: Math.hypot(f.control.x - start.x, f.control.z - start.z),
      rebuilt: after.rebuilds > start.rebuilds,
      onGround: Math.abs(f.control.y - f.terrain.heightAt(f.control.x, f.control.z)) < 1.5,
      allFinite: samples.every(Number.isFinite),
      spread: Math.max(...samples) - Math.min(...samples),
    };
  });
  expect(walk.moved).toBeGreaterThan(1500);
  expect(walk.rebuilt).toBe(true);
  expect(walk.onGround).toBe(true);
  expect(walk.allFinite).toBe(true);
  expect(walk.spread).toBeGreaterThan(0);
});

test('walking moves the character over the ground', async ({ page }) => {
  await land(page);
  const before = await page.evaluate(() => ({ x: window.farhold.control.x, z: window.farhold.control.z, y: window.farhold.control.y }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => {
    const f = window.farhold;
    return { x: f.control.x, z: f.control.z, y: f.control.y, ground: f.terrain.heightAt(f.control.x, f.control.z) };
  });
  const distance = Math.hypot(after.x - before.x, after.z - before.z);
  expect(distance).toBeGreaterThan(2);       // at least a couple of metres in a second
  expect(distance).toBeLessThan(40);         // and not teleporting
  expect(Math.abs(after.y - after.ground)).toBeLessThan(1.5);
});

test('the day turns: the sun moves, the sky changes colour and the night comes', async ({ page }) => {
  await land(page);
  const readings = await page.evaluate(() => {
    const f = window.farhold;
    const out = [];
    for (const t of [0, 220, 450, 680]) {
      f.setTime(t);
      out.push({
        t,
        sunY: f.sky.sunDirection.y,
        // round 4: the backdrop is the galaxy sphere, not a flat `scene.background`. The sky's own
        // colour now lives on the atmosphere shell and the fog, which is what the ground sees.
        sky: f.sky.fog.color.getHexString(),
        night: f.sky.isNight,
        light: f.sky.sunLight.intensity,
        visible: f.sky.visible().length,
      });
    }
    return out;
  });
  const sunHeights = readings.map(r => r.sunY);
  expect(Math.max(...sunHeights) - Math.min(...sunHeights)).toBeGreaterThan(0.5);
  expect(new Set(readings.map(r => r.sky)).size).toBeGreaterThan(1);
  expect(readings.some(r => r.night)).toBe(true);
  expect(readings.some(r => !r.night)).toBe(true);
  // the brightest reading is the one with the sun highest
  const brightest = readings.reduce((a, b) => (b.light > a.light ? b : a));
  expect(brightest.sunY).toBe(Math.max(...sunHeights));
});

test('a fight gives xp, a level and loot', async ({ page }) => {
  const errors = await land(page);
  const result = await page.evaluate(async () => {
    const f = window.farhold;
    f.field.clear();
    const before = { level: f.player.level, xp: f.player.xp, bag: f.player.bag.length, gold: f.player.gold };
    let killed = 0;
    for (let i = 0; i < 26; i++) {
      const enemy = await f.spawn('cairn_rat', 1);
      if (!enemy) continue;
      for (let swing = 0; swing < 120 && enemy.hp > 0; swing++) f.hit();
      if (enemy.hp === 0) killed++;
    }
    return {
      killed,
      before,
      after: { level: f.player.level, xp: f.player.xp, bag: f.player.bag.length, gold: f.player.gold, kills: f.player.kills },
      // round 7: a level opens the perk forest rather than handing out attribute points
      pending: f.perkPoints(),
      damage: f.player.derived.damage,
    };
  });
  expect(errors).toEqual([]);
  expect(result.killed).toBeGreaterThan(10);
  expect(result.after.xp).toBeGreaterThan(result.before.xp);
  expect(result.after.gold).toBeGreaterThan(result.before.gold);
  expect(result.after.level).toBeGreaterThan(result.before.level);
  expect(result.pending).toBeGreaterThan(0);
  expect(result.after.bag).toBeGreaterThan(result.before.bag);
});

test('the character sheet wears an item and the body picks up the weapon', async ({ page }) => {
  await land(page);
  const outcome = await page.evaluate(async () => {
    const f = window.farhold;
    // Round 6 gave every item a level requirement, so a level-1 character cannot simply put on
    // whatever falls out of the generator. Level up first — the point of this test is the sheet and
    // the body, not the requirement (which has its own tests in tests/affixes.test.js).
    f.player.level = 30;
    f.rpg.refresh(f.player, { full: true });
    const item = f.give('greatsword', 'rare', { level: 10 });
    f.hud.toggleSheet(true);
    f.hud.setTab('inventory');          // round 4: the bag lives on its own tab
    const rows = document.querySelectorAll('#sheet-bag .row');
    const damageBefore = [...f.player.derived.damage];
    rows[rows.length - 1].click();
    await new Promise(r => setTimeout(r, 120));
    return {
      item: item.name,
      worn: f.player.equipment.weapon?.name,
      damageBefore,
      damageAfter: [...f.player.derived.damage],
      slotsDrawn: document.querySelectorAll('#inv-slots .slot').length,
      sheetVisible: !document.getElementById('sheet').classList.contains('hidden'),
    };
  });
  expect(outcome.sheetVisible).toBe(true);
  // round 4b added a second ring, a mount slot and a light slot
  // R16: thirteen. "Instead of having tool be based on weapon (no idea how that works) change it
  // so you build new tools" — so there is a Tool slot now (js/rpg.js SLOTS, js/tools.js).
  expect(outcome.slotsDrawn).toBe(13);
  expect(outcome.worn).toBe(outcome.item);
  expect(outcome.damageAfter[1]).toBeGreaterThan(outcome.damageBefore[1]);
});

test('a level requirement is refused out loud, not silently ignored', async ({ page }) => {
  // The other half of the same change: clicking a bag row you have not grown into must say why,
  // and leave what you were wearing alone.
  const errors = await land(page);
  const outcome = await page.evaluate(async () => {
    const f = window.farhold;
    f.player.level = 1;
    f.rpg.refresh(f.player, { full: true });
    const before = f.player.equipment.weapon?.name || null;
    const item = f.give('greatsword', 'rare', { level: 40 });
    f.hud.toggleSheet(true);
    f.hud.setTab('inventory');
    const rows = document.querySelectorAll('#sheet-bag .row');
    rows[rows.length - 1].click();
    await new Promise(r => setTimeout(r, 150));
    const log = [...document.querySelectorAll('#log div')].map(n => n.textContent).join(' | ');
    return {
      item: item.name, ilvl: item.ilvl, req: item.levelReq,
      before, after: f.player.equipment.weapon?.name || null,
      stillInBag: f.player.bag.includes(item),
      said: /needs level/.test(log),
    };
  });
  expect(outcome.req).toBeGreaterThan(1);
  expect(outcome.after).toBe(outcome.before);
  expect(outcome.stillInBag).toBe(true);
  expect(outcome.said).toBe(true);
  expect(errors).toEqual([]);
});

test('enemies appear around the player, chase, and are cleared away when you leave', async ({ page }) => {
  await land(page);
  const life = await page.evaluate(async () => {
    const f = window.farhold;
    f.field.clear();
    // let the spawner work
    const start = Date.now();
    while (f.field.enemies.length < 3 && Date.now() - start < 30000) await new Promise(r => setTimeout(r, 200));
    const spawned = f.field.enemies.length;
    const distances = f.field.enemies.map(e => Math.hypot(e.x - f.control.x, e.z - f.control.z));
    const onGround = f.field.enemies.every(e => Math.abs(e.y - f.terrain.heightAt(e.x, e.z)) < 0.01);
    f.teleport(f.control.x + 3000, f.control.z);
    await new Promise(r => setTimeout(r, 400));
    return { spawned, distances, onGround, afterWalkingOff: f.field.enemies.length };
  });
  expect(life.spawned).toBeGreaterThanOrEqual(3);
  expect(Math.min(...life.distances)).toBeGreaterThan(20);
  expect(life.onGround).toBe(true);
  expect(life.afterWalkingOff).toBeLessThan(life.spawned);
});
