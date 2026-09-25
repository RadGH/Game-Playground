// Farhold R26 — races, in the browser.
//
//   1. The appearance editor's Body tab has four presets — Human, Elf, Dwarf, Halfling. Each one
//      changes the 3D figure (its `data-look`), the choice walks out of the title into the game on
//      `player.avatar.body.race`, and it survives a save.
//   2. The five enemy warbands are real bodies in the real game: every member builds as a Chibi 2
//      humanoid of its race (a giant stands taller than a human bandit, a goblin shorter), and the
//      live spawner puts warband members down inside a zone their warband holds.
//
// Screenshots land in test-results/round26-*.png.

import { test, expect } from '@playwright/test';

const BASE = '/prototypes/farhold/';
const SHOTS = 'test-results/';

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const lookOf = (page, sel) => page.evaluate(s => document.querySelector(s)?.dataset.look || null, sel);
async function lookChanges(page, from, sel) {
  await page.waitForFunction(([s, f]) => {
    const c = document.querySelector(s);
    return c?.dataset.look && c.dataset.look !== f;
  }, [sel, from], { timeout: 30000 });
  return lookOf(page, sel);
}

test('the four body presets change the figure and the race walks into the game', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watch(page);
  await page.goto(BASE + '?quality=low&sound=off');
  await page.waitForSelector('#boot-menu:not(.hidden)', { timeout: 30000 });
  await page.click('#boot-new');
  await page.selectOption('#boot-class', 'knight');
  await page.waitForFunction(() => document.querySelector('#boot-figure canvas')?.dataset.look, null, { timeout: 30000 });

  await page.click('#boot-customize');
  await expect(page.locator('#appearance')).toBeVisible();
  await expect(page.locator('#ap-figure canvas')).toBeVisible();
  // the four presets, and only those: the other races are the enemy
  await expect(page.locator('.ap-preset')).toHaveCount(4);
  const raceOptions = await page.$$eval('#ap-race option', os => os.map(o => o.value));
  expect(raceOptions).toEqual(['human', 'elf', 'dwarf', 'halfling']);

  const sel = '#ap-figure canvas';
  const seen = new Set([await lookOf(page, sel)]);
  for (const race of ['elf', 'dwarf', 'halfling', 'human', 'dwarf']) {
    const before = await lookOf(page, sel);
    await page.click(`#ap-preset-${race}`);
    const after = await lookChanges(page, before, sel);
    seen.add(after);
    await expect(page.locator(`#ap-preset-${race}`)).toHaveClass(/\bon\b/);
    await expect(page.locator('#ap-race')).toHaveValue(race);
    if (seen.size <= 5) {
      await page.evaluate(s => document.querySelector(s).__figure?.face?.(0), sel);
      await page.waitForTimeout(400);
      await page.locator('#ap-figure').screenshot({ path: `${SHOTS}round26-preset-${race}.png` });
    }
  }
  expect(seen.size, 'two presets drew the same figure').toBeGreaterThanOrEqual(5);

  await page.click('#ap-done');
  await expect(page.locator('#appearance')).toBeHidden();
  await expect(page.locator('#boot-figure-note')).toContainText('Your own look');

  await page.click('#boot-to-world');
  await page.fill('#boot-seed', '3');
  await page.selectOption('#boot-scale', '0.2');
  await page.waitForFunction(() => document.getElementById('boot-map')?.dataset.painted, null, { timeout: 60000 });
  await page.click('#boot-start');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.saveNow();
    const id = f.saves.list()[0]?.id;
    return { race: f.player.avatar?.body?.race, saved: id ? f.saves.read(id).avatar?.body?.race : null };
  });
  expect(out.race, 'the dwarf preset never reached the game').toBe('dwarf');
  expect(out.saved, 'the save dropped the race').toBe('dwarf');
  expect(errors).toEqual([]);
});

test('the enemy warbands build as race bodies and the live spawner puts them in their own ground', async ({ page }) => {
  test.setTimeout(300000);
  const errors = watch(page);
  await page.goto(BASE + '?auto&seed=3&scale=0.2&quality=low&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  const ids = await page.evaluate(() => window.farhold.bestiaryIds);
  const bands = ['sootwick', 'ashtusk', 'thornmane', 'unburied', 'stonehide'];
  for (const b of bands) expect(ids.filter(id => id.startsWith(b + '_')).length, `${b} is not in the bestiary`).toBe(5);

  // every member, built for real, next to an ordinary human bandit for scale
  const bodies = await page.evaluate(async bands => {
    const f = window.farhold;
    f.pause(true);
    const out = {};
    const human = await f.spawn('road_brigand', 5);
    out.human = { height: human.actor.metrics().height, race: human.look?.avatar?.body?.race || 'human' };
    for (const b of bands) {
      for (const id of f.bestiaryIds.filter(x => x.startsWith(b + '_'))) {
        const u = await f.spawn(id, 20);
        out[id] = {
          kind: u.kind, role: u.role, beast: !!u.actor?.beast, built: !!u.actor?.group,
          race: u.look?.avatar?.body?.race, height: u.actor?.metrics?.().height || 0,
          held: u.look?.avatar?.held?.id || null, drops: (u.dropBases || []).length,
        };
      }
    }
    while (f.field.enemies.length) f.field.remove(0);
    return out;
  }, bands);
  const raceOf = { sootwick: 'goblin', ashtusk: 'orc', thornmane: 'beast', unburied: 'undead', stonehide: 'giant' };
  for (const [id, b] of Object.entries(bodies)) {
    if (id === 'human') continue;
    const band = id.split('_')[0];
    expect(b.built, `${id} has no body`).toBe(true);
    expect(b.beast, `${id} was built as a creature`).toBe(false);
    expect(b.kind).toBe('humanoid');
    expect(b.race, `${id} is not a ${raceOf[band]}`).toBe(raceOf[band]);
    expect(b.held, `${id} is empty-handed`).toBeTruthy();
    expect(b.drops, `${id} drops nothing`).toBeGreaterThan(0);
    if (band === 'stonehide') expect(b.height, `${id} is no taller than a human`).toBeGreaterThan(bodies.human.height * 1.15);
    if (band === 'sootwick') expect(b.height, `${id} is no shorter than a human`).toBeLessThan(bodies.human.height * 0.93);
  }

  // the live spawner, in a zone a warband holds on this world
  const live = await page.evaluate(async () => {
    const f = window.farhold;
    const field = f.field;
    const zones = f.zones;
    const held = field.warbands.held(zones.zones);
    if (!held.length) return { held: 0 };
    const cell = f.terrain.metresPerCell;
    const W = f.world.width;
    let got = null, tries = 0;
    for (const { zone, band } of held) {
      for (let i = 0; i < f.world.region.length && !got; i++) {
        if (f.world.region[i] !== zone.id) continue;
        const x = ((i % W) + 0.5) * cell, z = (Math.floor(i / W) + 0.5) * cell;
        if (f.terrain.underwater(x, z) || !field.wild(x, z)) continue;
        const save = { ...field.cfg };
        field.cfg.minRadius = 0; field.cfg.radius = 0.01;
        for (let k = 0; k < 20 && !got; k++) {
          tries++;
          const u = await field.spawnNear(x, z, zone.midLevel);
          if (u?.defId && f.bestiaryIds.includes(u.defId) && u.defId.startsWith(band.id + '_')) {
            got = { band: band.id, zone: zone.name, defId: u.defId, race: u.look?.avatar?.body?.race, hasBody: !!u.actor?.group, level: u.level };
          }
        }
        field.cfg = save;
        break;
      }
      if (got) break;
    }
    return { held: held.length, got, tries };
  });
  expect(live.held, 'no zone on this world is held by a warband').toBeGreaterThan(0);
  expect(live.got, `spawnNear never put a warband member down in ${live.tries} tries`).toBeTruthy();
  expect(live.got.hasBody).toBe(true);
  expect(live.got.race).toBe(raceOf[live.got.band]);

  // a line-up in front of the camera for the screenshots: one warband at a time, facing us
  for (const b of bands) {
    await page.evaluate(async b => {
      const f = window.farhold;
      f.pause(true);
      while (f.field.enemies.length) f.field.remove(0);
      const c = f.control;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const list = f.bestiaryIds.filter(x => x.startsWith(b + '_'));
      const gap = b === 'stonehide' ? 3.2 : 2.4, d = b === 'stonehide' ? 10 : 7.5;
      for (let i = 0; i < list.length; i++) {
        const u = await f.spawn(list[i], 20);
        const s = (i - 2) * gap;
        u.x = c.x + fx * d + rx * s; u.z = c.z + fz * d + rz * s;
        u.state = 'idle'; u.aggroRange = 0; u.speed = 0;
        u.facing = c.yaw;
        u.y = f.terrain.heightAt(u.x, u.z);
        u.actor.group.position.set(u.x, u.y, u.z);
        u.actor.group.rotation.y = u.facing;
      }
      // the frame loop does not draw while paused; let it run, with nobody interested in the player
      f.pause(false);
    }, b);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}round26-warband-${b}.png`, clip: { x: 240, y: 140, width: 800, height: 440 } });
  }
  expect(errors.filter(e => !/404|Failed to load resource/.test(e))).toEqual([]);
});
