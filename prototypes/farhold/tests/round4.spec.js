// Round 4 — the RPG expansion, in the real page.
//
// The node tests (tests/round4.test.js) cover the maths: bands, layouts, costs, effects. These
// cover the things that only exist once there is a renderer, a DOM and a frame loop — a dungeon you
// can stand in, a chest that opens, a torch that lights the ground, the sheet's tabs, the mouse
// coming back, and the galaxy sitting behind the planets rather than in front of them.

import { test, expect } from '@playwright/test';

async function land(page, { seed = 3, cls = 'warrior', extra = '' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=${cls}${extra}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('a new run starts in daylight wherever on the map it lands', async ({ page }) => {
  // The bug: sky.js gives every world a local time, so `startFraction` only meant morning at
  // longitude 0 — landing two thirds across the map started you at half past ten at night.
  for (const seed of [3, 11, 21]) {
    await land(page, { seed });
    const out = await page.evaluate(() => ({
      day: window.farhold.stats().dayFraction,
      sunY: window.farhold.stats().sunY,
      x: window.farhold.control.x / window.farhold.terrain.widthM,
    }));
    expect(out.sunY, `seed ${seed} started with the sun below the horizon`).toBeGreaterThan(0.05);
    expect(out.day, `seed ${seed} started at ${(out.day * 24).toFixed(1)}:00`).toBeGreaterThan(0.2);
    expect(out.day).toBeLessThan(0.8);
  }
});

test('every region has a level band, the start is the softest, and they climb outward', async ({ page }) => {
  const errors = await land(page, { seed: 11 });
  const out = await page.evaluate(() => {
    const f = window.farhold;
    const list = f.zones.list();
    return {
      count: list.length,
      home: list.find(z => z.home),
      first: list[0],
      last: list[list.length - 1],
      here: f.zones.at(f.control.x, f.control.z).name,
      hudLine: document.getElementById('hud-zone').textContent,
    };
  });
  expect(out.count).toBeGreaterThan(3);
  expect(out.home.minLevel).toBe(1);
  expect(out.first.minLevel).toBe(1);
  expect(out.last.maxLevel).toBeGreaterThan(out.first.maxLevel + 8);
  expect(out.hudLine).toMatch(/level \d+–\d+ · \w/);
  expect(errors).toEqual([]);
});

test('the map draws the level-band overlay, with a legend and a toggle', async ({ page }) => {
  await land(page, { seed: 11 });
  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(500);
  const on = await page.evaluate(() => {
    const f = window.farhold;
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // the overlay washes land cells towards a danger colour: count how many are warm
    let warm = 0;
    for (let i = 0; i < pixels.length; i += 4 * 97) {
      if (pixels[i] > pixels[i + 2] + 22) warm++;
    }
    return {
      warm, levels: f.map.state.levels,
      // round 4b: it is a `levels` chip beside Regions rather than a checkbox above the list
      toggle: !!document.querySelector('.chip[data-layer="levels"]'),
      legend: [...document.querySelectorAll('.legend .sw')].map(n => n.textContent),
    };
  });
  expect(on.levels).toBe(true);
  expect(on.toggle).toBe(true);
  expect(on.warm).toBeGreaterThan(20);
  expect(on.legend.join(' ')).toContain('do not go here yet');
  expect(on.legend.join(' ')).toContain('dungeon');

  // and turning it off really turns it off
  const off = await page.evaluate(() => {
    window.farhold.map.setLevels(false);
    const canvas = document.getElementById('map-canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let warm = 0;
    for (let i = 0; i < pixels.length; i += 4 * 97) if (pixels[i] > pixels[i + 2] + 22) warm++;
    return warm;
  });
  expect(off).toBeLessThan(on.warm);
});

test('the world is busy: packs, ranks and set-piece encounters, not one straggler', async ({ page }) => {
  const errors = await land(page, { seed: 5 });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    await new Promise(r => setTimeout(r, 6000));
    const ranks = {};
    for (const e of f.field.enemies) ranks[e.rank] = (ranks[e.rank] || 0) + 1;
    const before = f.field.enemies.length;
    await f.encounters.force('warband', f.control, f.player.level);
    await new Promise(r => setTimeout(r, 2500));
    return { spawned: before, after: f.field.enemies.length, ranks, kinds: f.encounters.table.length };
  });
  expect(out.spawned, 'the ring should be busy within a few seconds').toBeGreaterThan(6);
  // `after` can equal `spawned` when the ring is already at its cap — which is itself the point
  expect(out.after).toBeGreaterThanOrEqual(out.spawned);
  expect(out.kinds).toBeGreaterThanOrEqual(10);
  expect(errors).toEqual([]);
});

test('a chest opens, pays out, and shows the reward screen', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const gold = f.player.gold, bag = f.player.bag.length;
    f.placeChest('gilded');
    await f.openChest();
    await new Promise(r => setTimeout(r, 900));
    return {
      gold: f.player.gold - gold, items: f.player.bag.length - bag,
      mats: Object.keys(f.materials()).length,
      overlay: !!document.querySelector('.rw-overlay'),
      title: document.querySelector('.rw-ribbon')?.textContent,
    };
  });
  expect(out.gold).toBeGreaterThan(0);
  expect(out.items).toBeGreaterThan(0);
  expect(out.mats).toBeGreaterThan(0);
  expect(out.overlay).toBe(true);
  expect(out.title).toContain('Chest');
  expect(errors).toEqual([]);
});

test('a dungeon is a real place: walls, rooms, a boss, chests and no daylight', async ({ page }) => {
  const errors = await land(page);
  const inside = await page.evaluate(async () => {
    const f = window.farhold;
    // A level-1 character walking into a level-25 dungeon dies in the doorway, and dying throws you
    // back out — which is the game working, not the dungeon failing. Level up and take the NEAREST
    // mouth, which is the one the zone bands mean you to use.
    f.rpg.gainXp(f.player, 40000);
    f.give('plate_chest', 'legendary');
    f.rpg.equip(f.player, f.player.bag.pop());
    const gate = f.gates.nodes
      .slice()
      .sort((a, b) => Math.hypot(a.x - f.control.x, a.z - f.control.z) - Math.hypot(b.x - f.control.x, b.z - f.control.z))[0];
    let why = null;
    try { await f.enterDungeon(gate); } catch (e) { why = e.message + ' | ' + (e.stack || '').split('\n')[1]; }
    await new Promise(r => setTimeout(r, 3500));
    const d = f.dungeon;
    if (!d) return { why, gates: f.gates.nodes.length, deaths: f.player.deaths, hp: f.player.hp };
    // the entrance room must be walled: walk its perimeter and count how much of it is solid.
    // Probing one point is no good — that point may be the doorway a corridor comes through.
    const room = d.entrance;
    const wall = f.control.obstacles[0];
    let solid = 0, probes = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      const px = room.x + Math.cos(a) * (room.w / 2 + 0.3);
      const pz = room.z + Math.sin(a) * (room.h / 2 + 0.3);
      probes++;
      if (wall.blocked(px, pz, 0.4)) solid++;
    }
    return {
      ...d.stats(),
      terrainSwapped: f.control.terrain.dungeon === true,
      blocked: solid / probes, centreClear: !wall.blocked(room.x, room.z, 0.4),
      walls: wall.count,
      enemies: f.field.enemies.length,
      boss: f.bossUnit?.name || null,
      bossBar: !document.getElementById('boss-bar').classList.contains('hidden'),
      torch: f.light.stats(),
      fogFar: f.scene.fog.far,
      minimapDrawn: document.getElementById('minimap').width,
    };
  });
  expect(inside.rooms, `no dungeon was built: ${JSON.stringify(inside)}`).toBeDefined();
  expect(inside.rooms).toBeGreaterThan(4);
  expect(inside.terrainSwapped).toBe(true);
  expect(inside.blocked, 'the entrance room is barely walled').toBeGreaterThan(0.5);
  expect(inside.centreClear, 'the middle of a room is solid — you could not stand in it').toBe(true);
  expect(inside.walls).toBeGreaterThan(100);
  expect(inside.enemies).toBeGreaterThan(4);
  expect(inside.boss).toBeTruthy();
  expect(inside.bossBar).toBe(true);
  expect(inside.torch.torch).toBe(true);
  expect(inside.torch.lit).toBeGreaterThan(0);
  expect(inside.fogFar).toBeLessThan(200);

  // and coming back out puts the planet back
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.leaveDungeon();
    await new Promise(r => setTimeout(r, 1200));
    return { dungeon: !!f.dungeon, surface: f.control.terrain.dungeon !== true, enemies: f.field.enemies.length };
  });
  expect(out.dungeon).toBe(false);
  expect(out.surface).toBe(true);
  expect(errors).toEqual([]);
});

test('every character starts with a lit torch that lights a large area', async ({ page }) => {
  const errors = await land(page, { seed: 7 });
  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.setTime(500);                              // push the clock round to night
    const lit = { torch: f.light.torchOn, range: f.light.torch.distance, offhand: f.player.equipment.light?.name };
    f.light.setTorch(false);
    const dark = f.light.torch.intensity;
    f.light.setTorch(true);
    return { ...lit, dark };
  });
  expect(out.offhand).toContain('Torch');
  expect(out.torch).toBe(true);
  expect(out.range).toBeGreaterThanOrEqual(25);
  expect(out.dark).toBe(0);
  expect(errors).toEqual([]);
});

test('the sheet has tabs, and opening it gives the mouse back straight away', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.hud.toggleSheet(true);
    const tabs = [...document.querySelectorAll('#sheet-tabs button')].map(b => b.dataset.tab);
    const seen = {};
    for (const t of tabs) {
      f.hud.setTab(t);
      const body = document.querySelector(`.tab-body[data-tab="${t}"]`);
      seen[t] = { shown: !body.classList.contains('hidden'), kids: body.querySelectorAll('*').length };
    }
    return { tabs, seen, pointerLocked: !!document.pointerLockElement, open: f.hud.sheetOpen };
  });
  // round 7 added Perks, where attribute point-buy, the passive ladder and the talent picks went
  expect(out.tabs).toEqual(['character', 'inventory', 'skills', 'perks', 'crafting', 'upgrade', 'journal']);
  expect(out.pointerLocked, 'the mouse was still captured with the sheet open').toBe(false);
  for (const [tab, info] of Object.entries(out.seen)) {
    expect(info.shown, `${tab} did not show`).toBe(true);
    expect(info.kids, `${tab} is empty`).toBeGreaterThan(3);
  }
  expect(errors).toEqual([]);
});

test('recycling fills the materials bag, and the bench spends it', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    for (let i = 0; i < 6; i++) f.give('longsword', 'rare');
    f.hud.toggleSheet(true);
    f.hud.setTab('inventory');
    const rows = document.querySelectorAll('#sheet-bag .row').length;
    // recycle the lot through the button the player actually clicks
    const scraps = [...document.querySelectorAll('#sheet-bag .row .scrap')];
    for (const b of scraps) b.click();
    f.hud.setTab('crafting');
    const chips = document.querySelectorAll('#craft-materials .material').length;
    const recipes = document.querySelectorAll('#craft-list .recipe-row').length;
    const enabled = document.querySelector('#craft-detail .forge-btn')?.disabled === false;
    // and the Upgrade tab, which is where reworking an item lives now
    f.hud.setTab('upgrade');
    const upgrades = document.querySelectorAll('#up-list .recipe-row').length;
    return { rows, mats: f.materials(), chips, recipes, enabled, upgrades, bag: f.player.bag.length };
  });
  expect(out.rows).toBeGreaterThanOrEqual(6);
  expect(Object.keys(out.mats).length).toBeGreaterThan(0);
  expect(out.chips).toBeGreaterThan(0);
  expect(out.recipes, 'the Crafting tab lists what you can make').toBeGreaterThanOrEqual(4);
  expect(out.enabled, 'nothing could be forged after recycling six rares').toBe(true);
  expect(errors).toEqual([]);
});

test('a class with companions gets them, and they follow it about', async ({ page }) => {
  const errors = await land(page, { cls: 'necromancer' });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    await new Promise(r => setTimeout(r, 2500));
    const roster = f.pets.roster();
    const start = f.pets.pets.map(p => ({ x: p.x, z: p.z }));
    f.teleport(f.control.x + 160, f.control.z + 160);
    await new Promise(r => setTimeout(r, 2500));
    const near = f.pets.pets.filter(p => Math.hypot(p.x - f.control.x, p.z - f.control.z) < 40).length;
    return { roster, moved: f.pets.pets.some((p, i) => Math.hypot(p.x - start[i].x, p.z - start[i].z) > 5), near, total: f.pets.pets.length };
  });
  expect(out.roster.length).toBeGreaterThanOrEqual(2);
  expect(out.roster[0].name).toContain('Bone');
  expect(out.moved, 'the companions never moved').toBe(true);
  expect(out.near, 'the companions did not follow').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('every one of the thirty classes boots and gets a skill bar', async ({ page }) => {
  // one page load, then swap the class through the boot menu would be slow; instead check the data
  // the boot menu is built from, and boot three of the awkward ones for real.
  const errors = await land(page);
  const listed = await page.evaluate(() => [...document.querySelectorAll('#boot-class option')].length);
  expect(listed).toBe(30);
  for (const cls of ['runesmith', 'chronomancer', 'tinker']) {
    const e = await land(page, { cls });
    const out = await page.evaluate(() => ({
      cls: window.farhold.player.classId,
      slots: document.querySelectorAll('#skillbar .skill-slot').length,
      named: window.farhold.skills.state()[0].name,
    }));
    expect(out.cls).toBe(cls);
    expect(out.slots).toBe(6);
    expect(out.named.length).toBeGreaterThan(2);
    expect(e).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('the galaxy is behind the planets and the atmosphere is in front of them', async ({ page }) => {
  const errors = await land(page, { seed: 11, extra: '&weather=clear' });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // Wind the clock until it is genuinely night HERE. The sun keeps local time (its angle includes
    // your longitude), so a fixed `elapsed` is midnight only at the left edge of the map.
    const day = f.balance.sky?.dayLengthSeconds ?? 900;
    for (let i = 0; i < 40 && !f.sky.isNight; i++) f.setTime((i / 40) * day);
    await new Promise(r => setTimeout(r, 900));
    const galaxy = f.sky.scene.children.find(c => c.renderOrder === -2000);
    const air = f.sky.scene.children.find(c => c.renderOrder === 2000);
    const bodies = f.sky.bodies.filter(b => b.shell);
    return {
      background: f.sky.scene.background,
      galaxy: galaxy && {
        r: galaxy.geometry.parameters.radius, order: galaxy.renderOrder,
        map: !!galaxy.material.map, depthWrite: galaxy.material.depthWrite,
        // OPAQUE on purpose: Three draws the whole opaque list before the whole transparent one,
        // so a transparent backdrop painted its stars over every planet.
        transparent: galaxy.material.transparent,
        visible: galaxy.visible, brightness: galaxy.material.color.r,
      },
      air: air && { r: air.geometry.parameters.radius, order: air.renderOrder, strength: air.material.uniforms.uStrength.value },
      shells: bodies.map(b => b.shell),
    };
  });
  expect(out.background, 'a flat background would paint over the stars').toBeNull();
  expect(out.galaxy.map).toBe(true);
  expect(out.galaxy.visible).toBe(true);
  expect(out.galaxy.depthWrite).toBe(false);
  expect(out.galaxy.transparent, 'a transparent backdrop draws over the planets').toBe(false);
  expect(out.galaxy.brightness, 'the galaxy should be bright at night').toBeGreaterThan(0.2);
  // the galaxy is further out than every body, and the air is nearer than every body
  for (const shell of out.shells) {
    expect(out.galaxy.r, 'a body is outside the galaxy').toBeGreaterThan(shell);
    expect(out.air.r, 'a body is inside the atmosphere').toBeLessThan(shell);
  }
  expect(out.air.order).toBeGreaterThan(out.galaxy.order);
  expect(errors).toEqual([]);
});

test('camps and lairs are placed, and walking up to one fills it', async ({ page }) => {
  const errors = await land(page, { seed: 5 });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const site = f.sites.sites.find(s => s.kind === 'camp');
    if (!site) return null;
    f.teleport(site.x + 40, site.z + 40);
    await new Promise(r => setTimeout(r, 4000));
    const near = f.field.enemies.filter(e => Math.hypot(e.x - site.x, e.z - site.z) < 40).length;
    return { stats: f.sites.stats(), populated: site.populated, near };
  });
  expect(out, 'no camps were placed on this world').not.toBeNull();
  expect(out.stats.camps).toBeGreaterThan(3);
  expect(out.stats.lairs).toBeGreaterThan(0);
  expect(out.populated).toBe(true);
  expect(out.near, 'walking into a camp found nobody in it').toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('no damage number anywhere in a live fight is NaN', async ({ page }) => {
  // The user hit this in play: enemies were given a `derived` bag, which made `attacker.derived`
  // truthy, and `derived.damage` is undefined on an enemy.
  const errors = await land(page, { seed: 5, cls: 'warrior' });
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const nums = [];
    // level the character first: five level-5 enemies kill a level-1 warrior in about two seconds,
    // and a corpse cannot swing at anything
    f.rpg.gainXp(f.player, 12000);
    f.give('longsword', 'rare');
    f.rpg.equip(f.player, f.player.bag.pop());
    for (const id of ['moor_hound', 'road_brigand', 'cinder_imp', 'stone_sentinel', 'hollow_wraith']) {
      await f.spawn(id, 5);
    }
    await new Promise(r => setTimeout(r, 1500));
    for (let k = 0; k < 40; k++) {
      for (const h of f.hit()) nums.push(h.result.amount);
      await new Promise(r => setTimeout(r, 60));
    }
    await new Promise(r => setTimeout(r, 3000));
    return {
      hits: nums.length,
      bad: nums.filter(n => !Number.isFinite(n)).length,
      hp: f.player.hp, hpText: document.getElementById('bar-hp-text').textContent,
    };
  });
  expect(out.hits).toBeGreaterThan(5);
  expect(out.bad).toBe(0);
  expect(Number.isFinite(out.hp)).toBe(true);
  expect(out.hpText).not.toContain('NaN');
  expect(errors).toEqual([]);
});
