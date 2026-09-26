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
  // R27 M10: six members each (the standard-bearer is the sixth)
  for (const b of bands) expect(ids.filter(id => id.startsWith(b + '_')).length, `${b} is not in the bestiary`).toBe(6);

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

/**
 * R27 M9 — warbands hold ground, in the live game: the map's warband layer lists exactly the held
 * zones you know (walked or rumoured), tinted in each warband's own colour; the zone banner names
 * the holder and its grip; and a war party walking the road gets real bodies when you come near.
 */
test('R27 M9: the warband map layer, the holder banner and a war party with bodies', async ({ page }) => {
  test.setTimeout(300000);
  const errors = watch(page);
  await page.goto(BASE + '?auto&seed=3&scale=0.2&quality=low&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });

  // pick two held zones away from here; hear the warband rumour about one, and give its band an odd colour
  const setup = await page.evaluate(() => {
    const f = window.farhold;
    const here = f.zones.at(f.control.x, f.control.z)?.id;
    // zone A has a real road through it, so its war parties walk one
    const roadIn = id => f.terrain.roadPaths.reduce((n, p) => n + p.points.filter(([x, z]) => f.zones.at(x, z)?.id === id).length, 0);
    const held = f.field.warbands.held(f.zones.zones).filter(r => r.zone.id !== here)
      .map(r => ({ ...r, road: roadIn(r.zone.id) })).sort((x, y) => y.road - x.road);
    const a = held[0], b = held.find(r => r.zone.id !== a?.zone.id);
    if (!a || !b) return { held: held.length };
    let heard = null;
    for (let i = 0; i < 60 && !heard; i++) { const r = f.rumours.hear(a.zone, {}); if (r?.kind === 'warband_holds') heard = r; }
    const row = f.field.warbands.data.warbands.find(w => w.id === a.band.id);
    row.colour = '#12ab34';
    return { held: held.length, a: a.zone.id, aName: a.zone.name, band: a.band.id, b: b.zone.id, heard: heard?.text || null };
  });
  expect(setup.held, 'fewer than two held zones on seed 3').toBeGreaterThanOrEqual(2);
  expect(setup.heard, 'the warband rumour never came up').toBeTruthy();

  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(600);
  const layer = await page.evaluate(({ a, b }) => {
    const f = window.farhold;
    f.map.draw();
    const rows = f.map.warbandLayer();
    const held = f.field.warbands.held(f.zones.zones).map(r => r.zone.id);
    // the reveal store the region NAMES use: every held zone the map will name
    const key = Object.keys(localStorage).find(k => k.startsWith('farhold.seen.'));
    const seen = new Set(JSON.parse(localStorage.getItem(key) || '[]').map(Number));
    const expected = held.filter(id => seen.has(id)).sort((x, y) => x - y);
    const sw = document.querySelector(`.warband-sw[data-band="${rows.find(r => r.zoneId === a)?.band}"] i`);
    const swatch = sw ? getComputedStyle(sw).backgroundColor : null;   // before a redraw replaces it
    // the tint, read off the canvas at the middle of zone A: layer on vs layer off
    const canvas = f.map.root.querySelector('canvas');
    const v = f.map.state.view;
    const ox = v.ox ?? v.offsetX, oy = v.oy ?? v.offsetY;
    // a cell of zone A whose four neighbours are zone A too, so the pixel is inside it
    const W = f.world.width, cells = [];
    for (let i = 0; i < f.world.region.length; i++) {
      if (f.world.region[i] === a && f.world.region[i - 1] === a && f.world.region[i + 1] === a
        && f.world.region[i - W] === a && f.world.region[i + W] === a) cells.push(i);
    }
    const c = cells[Math.floor(cells.length / 3)];
    const px = Math.round(ox + ((c % W) + 0.5) * v.scale), py = Math.round(oy + (Math.floor(c / W) + 0.5) * v.scale);
    const read = () => Array.from(canvas.getContext('2d').getImageData(px, py, 1, 1).data.slice(0, 3));
    const on = read();
    f.map.setWarbands(false);
    const off = read();
    f.map.setWarbands(true);
    return {
      rows: rows.map(r => r.zoneId).sort((x, y) => x - y), expected,
      hasA: rows.some(r => r.zoneId === a), hasB: rows.some(r => r.zoneId === b), bSeen: seen.has(b),
      colourA: rows.find(r => r.zoneId === a)?.colour, drawn: f.map.warbandDrawn.length,
      swatch, on, off,
    };
  }, setup);
  expect(layer.rows, 'the layer is not exactly held AND revealed').toEqual(layer.expected);
  expect(layer.hasA, 'the rumoured held zone is not on the layer').toBe(true);
  if (!layer.bSeen) expect(layer.hasB, 'a held zone nobody told you about is on the layer').toBe(false);
  expect(layer.colourA).toBe('#12ab34');
  expect(layer.swatch).toBe('rgb(18, 171, 52)');
  expect(layer.drawn).toBe(layer.rows.length);
  // on = off x 0.58 + colour x 0.42, per channel (the tint's own blend), give or take rounding
  const col = [0x12, 0xab, 0x34];
  for (let i = 0; i < 3; i++) expect(Math.abs(layer.on[i] - (layer.off[i] * 0.58 + col[i] * 0.42))).toBeLessThanOrEqual(3);
  await page.locator('.map-canvas-wrap').screenshot({ path: `${SHOTS}round27-warband-map.png` });
  await page.evaluate(() => window.farhold.map.toggle(false));

  // walk into zone A: the banner says who holds it and how firmly
  const spot = await page.evaluate(a => {
    const f = window.farhold;
    const W = f.world.width, cell = f.terrain.metresPerCell;
    for (let i = 0; i < f.world.region.length; i++) {
      if (f.world.region[i] !== a) continue;
      const x = ((i % W) + 0.5) * cell, z = (Math.floor(i / W) + 0.5) * cell;
      if (!f.terrain.underwater(x, z) && f.zones.at(x, z)?.id === a && f.field.wild(x, z)) return { x, z };
    }
    return null;
  }, setup.a);
  expect(spot).toBeTruthy();
  await page.evaluate(s => window.farhold.teleport(s.x, s.z), spot);
  await page.waitForFunction(() => /held by/.test(document.querySelector('#zone-banner .zb-danger')?.textContent || ''), null, { timeout: 30000 });
  const banner = await page.textContent('#zone-banner .zb-danger');
  expect(banner.toLowerCase()).toContain('held by the');
  expect(banner).toMatch(/firm|shaken|broken/);
  await page.locator('#zone-banner').screenshot({ path: `${SHOTS}round27-warband-banner.png` });

  // a war party on this zone's road: stand 60 m off its clock position and its bodies come out
  await page.waitForFunction(a => (window.farhold.patrols.inZone(a) || []).some(p => p.warband), setup.a, { timeout: 30000 });
  const party = await page.evaluate(a => {
    const f = window.farhold;
    const p = f.patrols.inZone(a).find(p => p.warband && f.field.wild(p.x, p.z) && !f.terrain.underwater(p.x, p.z))
      || f.patrols.inZone(a).find(p => p.warband);
    return { id: p.id, x: p.x, z: p.z, size: p.size, band: p.warband };
  }, setup.a);
  await page.evaluate(p => window.farhold.teleport(p.x + 60, p.z), party);
  await page.waitForFunction(id => (window.farhold.patrolBodies.live.find(r => r.id === id)?.units.length || 0) > 0, party.id, { timeout: 30000 });
  await page.waitForTimeout(800);
  const bodies = await page.evaluate(id => {
    const f = window.farhold;
    const row = f.patrolBodies.live.find(r => r.id === id);
    const toRoad = (x, z) => {
      let best = Infinity;
      for (const p of f.terrain.roadPaths) {
        for (let i = 1; i < p.points.length; i++) {
          const [ax, az] = p.points[i - 1], [bx, bz] = p.points[i];
          const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
          best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
        }
      }
      return best;
    };
    // face the party for the screenshot
    const lead = row.units[0];
    f.control.yaw = Math.atan2(lead.x - f.control.x, lead.z - f.control.z);
    return row.units.map(u => ({ defId: u.defId, built: !!u.actor?.group, race: u.look?.avatar?.body?.race, road: toRoad(u.x, u.z) }));
  }, party.id);
  expect(bodies.length).toBe(party.size);
  for (const b of bodies) {
    expect(b.defId.startsWith(party.band + '_'), `${b.defId} is not ${party.band}`).toBe(true);
    expect(b.built).toBe(true);
    expect(b.road, `${b.defId} stands ${b.road.toFixed(1)} m off the road`).toBeLessThanOrEqual(30);
  }
  // a close look, in daylight: stand 14 m from the leader, facing it
  await page.evaluate(id => {
    const f = window.farhold;
    const lead = f.patrolBodies.live.find(r => r.id === id).units[0];
    f.state.elapsed += 450;                       // half a day on: the sun is up
    f.teleport(lead.x - 14, lead.z);
    f.control.yaw = Math.atan2(lead.x - f.control.x, lead.z - f.control.z);
  }, party.id);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}round27-warband-patrol.png` });
  expect(errors.filter(e => !/404|Failed to load resource/.test(e))).toEqual([]);
});
