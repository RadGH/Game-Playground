// Farhold round 3 through the real page: rivers you can swim in, roads that are part of the
// ground, things you cannot walk through, a horse, a map, saves, and eclipses.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=19' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand on the first real river cell the map has. */
const GOTO_RIVER = `
  const w = f.world; let cell = -1;
  for (let i = 0; i < w.river.length; i++) if (w.river[i] >= 2) { cell = i; break; }
  // round 10: the cell size is a title-screen knob now, so 640 is only right at Full
  const M = f.terrain.metresPerCell;
  const rx = (cell % w.width) * M, rz = Math.floor(cell / w.width) * M;
`;

// ---------------------------------------------------------------- rivers and water

test('a river is a channel you can swim in, not a gorge that swallows a town', async ({ page }) => {
  const errors = await land(page);
  const river = await page.evaluate(`(async () => {
    const f = window.farhold;
    ${GOTO_RIVER}
    const path = f.terrain.riverPaths[0];
    // the channel across, sampled from the centre outward
    const profile = [];
    for (let d = 0; d <= 60; d += 10) profile.push(f.terrain.heightAt(rx + d, rz));
    const water = f.terrain.waterAt(rx, rz);
    return {
      waterWidth: path.half * 2, bank: path.reach, depthSetting: path.depth,
      depth: water ? water.depth : 0, kind: water ? water.kind : null,
      surface: water ? water.surface : 0, bed: f.terrain.heightAt(rx, rz),
      profile, rx, rz,
    };
  })()`);
  expect(errors).toEqual([]);
  // a river, not a canyon: tens of metres across, not hundreds
  expect(river.waterWidth).toBeGreaterThan(8);
  expect(river.waterWidth).toBeLessThan(60);
  expect(river.bank).toBeLessThan(120);
  // deep enough to swim, shallow enough to be a river
  expect(river.kind).toBe('river');
  expect(river.depth).toBeGreaterThan(1.5);
  expect(river.depth).toBeLessThan(15);
  // the surface really is above the bed it was carved to — no water clipping through the ground
  expect(river.surface).toBeGreaterThan(river.bed);
  // and the ground climbs away from the channel
  expect(river.profile[river.profile.length - 1]).toBeGreaterThan(river.profile[0]);
});

test('towns are no longer drowned by their own river', async ({ page }) => {
  await land(page);
  // A river running THROUGH a town is correct — World Forge founds towns on rivers, and 45 of 93 on
  // one test world sit on a river cell. What was wrong was the 640 m gorge the old cell-based carve
  // dug through them. So the thing to check is that the channel is narrow and no building stands in
  // the water.
  const towns = await page.evaluate(async () => {
    const f = window.farhold;
    const THREE = await import('three');
    const onRiver = f.features.settlements
      .filter(s => f.terrain.riverAt(s.wx, s.wz) > 0.2)
      .sort((a, b) => b.size - a.size)[0];
    if (!onRiver) return { skipped: true };
    f.teleport(onRiver.wx, onRiver.wz);
    await new Promise(r => setTimeout(r, 400));

    const m = new THREE.Matrix4(), pos = new THREE.Vector3();
    let inWater = 0, inChannel = 0, counted = 0;
    for (const key of ['hut', 'house', 'hall', 'well', 'wall', 'tower']) {
      const mesh = f.features.instanced[key];
      if (!mesh) continue;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m); pos.setFromMatrixPosition(m); counted++;
        if (f.terrain.waterAt(pos.x, pos.z)) inWater++;
        if (f.terrain.riverAt(pos.x, pos.z) > 0.5) inChannel++;
      }
    }
    // how wide the trench through the town actually is
    const path = f.terrain.riverPaths.reduce((best, p) => {
      const d = Math.min(...p.points.map(q => Math.hypot(q[0] - onRiver.wx, q[1] - onRiver.wz)));
      return !best || d < best.d ? { p, d } : best;
    }, null);
    return {
      skipped: false, town: onRiver.name, size: onRiver.size,
      counted, inWater, inChannel,
      channelWidth: path.p.half * 2, valleyWidth: path.p.reach * 2,
    };
  });
  if (towns.skipped) return;
  expect(towns.counted).toBeGreaterThan(3);
  // not one building stands in the river
  expect(towns.inWater).toBe(0);
  expect(towns.inChannel).toBe(0);
  // and the river through the town is a river, not the 640 m trench it used to be
  expect(towns.channelWidth).toBeLessThan(60);
  expect(towns.valleyWidth).toBeLessThan(200);
});

test('deep water makes you swim, and you cannot ride a horse into it', async ({ page }) => {
  await land(page);
  const swim = await page.evaluate(`(async () => {
    const f = window.farhold;
    ${GOTO_RIVER}
    f.teleport(rx, rz);
    await new Promise(r => setTimeout(r, 350));
    const floating = { swimming: f.control.swimming, y: f.control.y, surface: f.control.waterSurface };
    // mounting is refused in the water
    f.control.mounted = true;
    f.control.update(0.05, null, {});
    const mountedInWater = f.control.mounted;
    return { floating, mountedInWater };
  })()`);
  expect(swim.floating.swimming).toBe(true);
  // Floating at the surface, not standing on the bed. The tolerance is the body's own float depth
  // plus a little: round 4b scaled the terrain's relief to the map's width, so a river bed sits
  // closer to its surface than it used to and the old 1.2 m was cutting it fine.
  expect(Math.abs(swim.floating.y - swim.floating.surface)).toBeLessThan(2);
  expect(swim.mountedInWater).toBe(false);

  // the stroke follows the keys, read through the real input path
  const strokes = {};
  for (const [name, key] of [['forward', 'KeyW'], ['back', 'KeyS'], ['side', 'KeyD']]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(260);
    strokes[name] = await page.evaluate(() => window.farhold.actor.anim);
    await page.keyboard.up(key);
    await page.waitForTimeout(120);
  }
  expect(strokes.forward).toBe('swim');
  expect(strokes.back).toBe('swimBack');
  expect(strokes.side).toBe('swimSide');
});

// ---------------------------------------------------------------- roads

test('roads are graded into the ground and nothing grows on them', async ({ page }) => {
  await land(page);
  const road = await page.evaluate(async () => {
    const f = window.farhold;
    const path = f.terrain.roadPaths.find(p => p.points.length > 12) || f.terrain.roadPaths[0];
    const mid = Math.floor(path.points.length / 2);
    f.teleport(path.points[mid][0], path.points[mid][1]);
    await new Promise(r => setTimeout(r, 300));

    // the drawn surface must match the ground the terrain was flattened to
    let worstGap = 0;
    for (let i = 4; i < path.points.length - 4; i++) {
      const [x, z] = path.points[i];
      worstGap = Math.max(worstGap, Math.abs(f.terrain.heightAt(x, z) - path.surface[i]));
    }

    // a road is flatter across its width than the land beside it
    const [cx, cz] = path.points[mid];
    const on = Math.abs(f.terrain.heightAt(cx + 2, cz) - f.terrain.heightAt(cx - 2, cz));

    // nothing planted on the roadway
    const THREE = await import('three');
    const m = new THREE.Matrix4(), pos = new THREE.Vector3();
    let onRoad = 0, sampled = 0;
    for (const key of Object.keys(f.props.meshes)) {
      const mesh = f.props.meshes[key];
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m); pos.setFromMatrixPosition(m); sampled++;
        if (f.terrain.roadAt(pos.x, pos.z) > 0.6) onRoad++;
      }
    }
    return { worstGap, on, sampled, onRoad, roadWidth: path.half * 2 };
  });
  // the ribbon sits on the graded ground, so it neither floats nor sinks
  expect(road.worstGap).toBeLessThan(1.2);
  expect(road.on).toBeLessThan(1.0);
  expect(road.sampled).toBeGreaterThan(20);
  expect(road.onRoad).toBe(0);
});

test('roads pay for the height they gain, so they go round peaks', async ({ page }) => {
  await land(page);
  const climb = await page.evaluate(async () => {
    const { generateWorld } = await import('/worldgen/js/world.js');
    const steep = world => {
      let bad = 0, cells = 0, worst = 0;
      for (const r of world.roads) {
        cells += r.cells.length;
        for (let i = 1; i < r.cells.length; i++) {
          const rise = Math.abs(world.elevation[r.cells[i]] - world.elevation[r.cells[i - 1]]);
          if (rise > 0.02) bad++;
          worst = Math.max(worst, rise);
        }
      }
      return { bad, cells };
    };
    const flatCost = steep(generateWorld({ seed: 7, width: 160, height: 80, roadClimb: 0, history: false }));
    const withCost = steep(generateWorld({ seed: 7, width: 160, height: 80, history: false }));
    return { flatCost, withCost };
  });
  // fewer steep steps than when climbing was free
  expect(climb.withCost.bad).toBeLessThan(climb.flatCost.bad);
  // and the roads got longer, because going round costs distance
  expect(climb.withCost.cells).toBeGreaterThan(climb.flatCost.cells);
});

// ---------------------------------------------------------------- solid things

test('you cannot walk through trees, houses or walls', async ({ page }) => {
  await land(page);
  const collide = await page.evaluate(async () => {
    const f = window.farhold;
    const THREE = await import('three');
    // find a solid prop near the player and try to walk into it
    const m = new THREE.Matrix4(), pos = new THREE.Vector3();
    let target = null;
    for (const key of ['broadleaf', 'conifer', 'boulder', 'rock']) {
      const mesh = f.props.meshes[key];
      if (!mesh || !mesh.count) continue;
      mesh.getMatrixAt(0, m); pos.setFromMatrixPosition(m);
      target = { x: pos.x, z: pos.z, key };
      break;
    }
    if (!target) return { skipped: true };
    // stand just outside it and push straight at it for a second
    f.teleport(target.x + 6, target.z);
    f.control.yaw = Math.atan2(target.x - f.control.x, target.z - f.control.z);
    for (let i = 0; i < 120; i++) {
      f.control.update(1 / 60, { forward: 1, strafe: 0, run: true, jump: false, attack: false, look: [0, 0], pressed: new Set() }, {});
    }
    const gap = Math.hypot(f.control.x - target.x, f.control.z - target.z);
    return { skipped: false, gap, key: target.key, solids: f.props.solids.count };
  });
  if (collide.skipped) return;
  expect(collide.solids).toBeGreaterThan(0);
  // the walker is stopped short of the trunk rather than standing inside it
  expect(collide.gap).toBeGreaterThan(0.3);
});

test('a city wall is a closed ring, not a dotted line', async ({ page }) => {
  await land(page);
  const wall = await page.evaluate(async () => {
    const f = window.farhold;
    const city = f.features.settlements.filter(s => s.size >= 4).sort((a, b) => b.size - a.size)[0];
    if (!city) return { skipped: true };
    f.teleport(city.wx, city.wz);
    await new Promise(r => setTimeout(r, 350));
    const THREE = await import('three');
    const mesh = f.features.instanced.wall;
    const m = new THREE.Matrix4(), pos = new THREE.Vector3();
    const angles = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m); pos.setFromMatrixPosition(m);
      angles.push(Math.atan2(pos.z - city.wz, pos.x - city.wx));
    }
    angles.sort((a, b) => a - b);
    // the biggest angular hole in the ring, ignoring the deliberate gate
    const gaps = [];
    for (let i = 1; i < angles.length; i++) gaps.push(angles[i] - angles[i - 1]);
    if (angles.length > 1) gaps.push(angles[0] + Math.PI * 2 - angles[angles.length - 1]);
    gaps.sort((a, b) => b - a);
    return { skipped: false, segments: mesh.count, biggestGap: gaps[0] || 0, secondGap: gaps[1] || 0, city: city.name };
  });
  if (wall.skipped) return;
  expect(wall.segments).toBeGreaterThan(10);
  // one gate is expected; every other joint should be tight
  expect(wall.secondGap).toBeLessThan(0.5);
});

// ---------------------------------------------------------------- combat

test('the swipe arc points where the damage lands', async ({ page }) => {
  await land(page);
  const swipe = await page.evaluate(async () => {
    const f = window.farhold;
    const THREE = await import('three');
    f.control.yaw = 0.7;
    const s = f.fx.swipe({ x: f.control.x, y: f.control.y, z: f.control.z, yaw: f.control.yaw, reach: 3, arc: 1.5 });
    s.mesh.updateMatrixWorld(true);
    // the centre of the arc, in world space, relative to the player
    const tip = new THREE.Vector3(3, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(s.mesh.matrixWorld));
    const forward = new THREE.Vector3(Math.sin(f.control.yaw), 0, Math.cos(f.control.yaw));
    return { dot: tip.normalize().dot(forward) };
  });
  // 1 = the arc opens exactly the way the player faces; it used to be -1
  expect(swipe.dot).toBeGreaterThan(0.95);
});

test('a bow fires an arrow and every hit splashes', async ({ page }) => {
  await land(page);
  const combat = await page.evaluate(async () => {
    const f = window.farhold;
    f.field.clear();
    // three enemies in a tight clump, all within the splash of one landing arrow
    const made = [];
    for (const off of [[6, 0], [7, 1.2], [5.4, -1.1]]) {
      const e = await f.spawn('cairn_rat', 1);
      if (e) { e.x = f.control.x + off[0]; e.z = f.control.z + off[1]; made.push(e); }
    }
    const before = made.map(e => e.hp);
    const hits = f.field.strikeArea(f.control.x + 6, f.control.z, 2.6, f.player);
    const arrowsBefore = f.fx.stats().arrowsLive;
    f.fx.shoot({ x: f.control.x, y: f.control.y + 1.3, z: f.control.z, dirX: 1, dirZ: 0, range: 30 });
    const arrowsAfter = f.fx.stats().arrowsLive;
    return { made: made.length, hit: hits.length, before, after: made.map(e => e.hp), arrowsBefore, arrowsAfter };
  });
  expect(combat.made).toBe(3);
  // one area hit damaged more than one of them — no attack is single-target
  expect(combat.hit).toBeGreaterThan(1);
  expect(combat.arrowsAfter).toBeGreaterThan(combat.arrowsBefore);
});

// ---------------------------------------------------------------- the horse

test('H puts you on a horse: faster, jumps further, and cannot swing', async ({ page }) => {
  await land(page);
  const ride = await page.evaluate(async () => {
    const f = window.farhold;
    f.teleport(f.control.spawn.x, f.control.spawn.z);
    const walk = () => {
      const start = { x: f.control.x, z: f.control.z };
      for (let i = 0; i < 60; i++) {
        f.control.update(1 / 60, { forward: 1, strafe: 0, run: false, jump: false, attack: false, look: [0, 0], pressed: new Set() }, {});
      }
      return Math.hypot(f.control.x - start.x, f.control.z - start.z);
    };
    const onFoot = walk();
    // press H
    f.control.update(1 / 60, { forward: 0, strafe: 0, run: false, jump: false, attack: false, look: [0, 0], pressed: new Set(['KeyH']) }, {});
    const mounted = f.control.mounted;
    await new Promise(r => setTimeout(r, 120));
    const horseVisible = f.horse ? f.horse.group.visible : null;
    const riding = walk();
    // attacking while mounted does nothing
    const swing = f.control.update(1 / 60, { forward: 0, strafe: 0, run: false, jump: false, attack: true, look: [0, 0], pressed: new Set() }, {});
    return { onFoot, riding, mounted, horseVisible, attacked: swing.attacked };
  });
  expect(ride.mounted).toBe(true);
  expect(ride.horseVisible).toBe(true);
  expect(ride.riding).toBeGreaterThan(ride.onFoot * 1.4);
  expect(ride.attacked).toBe(false);
});

// ---------------------------------------------------------------- the map

test('M opens a map with the player, layers and pins on it', async ({ page }) => {
  const errors = await land(page);
  await page.keyboard.press('KeyM');
  await expect(page.locator('#map-screen')).toBeVisible();
  await expect(page.locator('#map-canvas')).toBeVisible();
  // World Forge's own layer chips, the weather one from round 3, and Farhold's own `levels` overlay
  const chips = page.locator('#map-screen .chips.layers .chip');
  await expect(chips).toHaveCount(10);
  await expect(page.locator('#map-screen .chip[data-layer="levels"]')).toBeVisible();
  await page.locator('#map-screen .chip[data-layer="elevation"]').click();
  expect(await page.evaluate(() => window.farhold.map.state.layer)).toBe('elevation');

  // a pin can be dropped and removed
  const pins = await page.evaluate(() => {
    const f = window.farhold;
    f.map.addPin(10, 10, 'Test pin');
    const after = f.map.pins.length;
    f.map.removePin(f.map.pins[f.map.pins.length - 1]);
    return { after, now: f.map.pins.length };
  });
  expect(pins.after).toBe(1);
  expect(pins.now).toBe(0);

  await page.keyboard.press('KeyM');
  await expect(page.locator('#map-screen')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the minimap has relief, so a single-biome world is not a blank sheet', async ({ page }) => {
  // seed 9 is a 100% ice world, which is what came out white
  await land(page, '');
  const shades = await page.evaluate(async () => {
    const f = window.farhold;
    const { generateWorld } = await import('/worldgen/js/world.js');
    const { worldPixels } = await import('/worldgen/js/render.js');
    const { createWorld } = await import('/prototypes/farhold/js/planet.js');
    const ice = createWorld({ seed: 9, width: 128, height: 64 });
    const flat = worldPixels(ice.world, { layer: 'biomes', hillshade: false });
    const shaded = worldPixels(ice.world, { layer: 'biomes', hillshade: true, shade: 7 });
    const spread = px => {
      let lo = 255, hi = 0;
      for (let i = 0; i < px.data.length; i += 4) { const v = px.data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      return hi - lo;
    };
    return { archetype: ice.planet.archetype, flat: spread(flat), shaded: spread(shaded) };
  });
  expect(shades.archetype).toBe('ice');
  // unshaded, an ice world is one flat colour; with relief there is something to read
  expect(shades.shaded).toBeGreaterThan(shades.flat + 20);
});

// ---------------------------------------------------------------- saves

test('a run saves itself and loads back', async ({ page }) => {
  await land(page);
  const saved = await page.evaluate(async () => {
    const f = window.farhold;
    f.player.gold = 777;
    f.player.kills = 12;
    f.give('greatsword', 'rare');
    f.map.addPin(20, 20, 'Camp');
    const id = f.saveNow();
    const snap = f.snapshot();
    const read = f.saves.read(id);
    return {
      id, wrote: !!read,
      gold: read?.player?.gold, kills: read?.player?.kills,
      bag: read?.player?.bag?.length,
      // round 5: pins became markers, and each one carries the world it is on
      pins: read?.markers?.markers?.length,
      seed: read?.seed, name: read?.name,
      // a save must be small: it is the seed plus what you did, never the world
      bytes: JSON.stringify(read).length,
      hasWorld: JSON.stringify(read).includes('elevation'),
      listed: f.saves.list().some(s => s.id === id),
    };
  });
  expect(saved.wrote).toBe(true);
  expect(saved.gold).toBe(777);
  expect(saved.kills).toBe(12);
  expect(saved.bag).toBeGreaterThan(0);
  expect(saved.pins).toBe(1);
  expect(saved.listed).toBe(true);
  expect(saved.hasWorld).toBe(false);
  expect(saved.bytes).toBeLessThan(60000);

  // and it comes back on a reload
  await page.goto('/prototypes/farhold/?quality=low&seed=19');
  await page.waitForFunction(() => !!document.getElementById('boot-continue'), null, { timeout: 60000 });
  await page.waitForFunction(() => !document.getElementById('boot-continue').hidden, null, { timeout: 60000 });
  await page.locator('#boot-continue').click();
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const loaded = await page.evaluate(() => ({
    gold: window.farhold.player.gold,
    kills: window.farhold.player.kills,
    pins: window.farhold.map.pins.length,
  }));
  expect(loaded.gold).toBe(777);
  expect(loaded.kills).toBe(12);
  expect(loaded.pins).toBe(1);
});

// ---------------------------------------------------------------- the sky

test('the neighbours visibly orbit, and an eclipse darkens the world', async ({ page }) => {
  await land(page);
  const sky = await page.evaluate(() => {
    const f = window.farhold;
    // over a few in-game minutes a body should move against the sun, not sit welded to it
    const seps = [];
    for (const t of [0, 60, 120, 180]) {
      f.setTime(t);
      const b = f.sky.bodies[0];
      seps.push(b.dir ? b.dir.angleTo(f.sky.sunDirection) : 0);
    }
    const moved = Math.max(...seps) - Math.min(...seps);

    // force one and watch the light go
    f.setTime(0);
    const brightBefore = f.sky.sunLight.intensity;
    // round 4: the backdrop is the galaxy sphere; the sky's own colour lives on the fog now
    const skyBefore = f.sky.fog.color.getHexString();
    const body = f.sky.forceEclipse('solar');
    const after = { light: f.sky.sunLight.intensity, sky: f.sky.fog.color.getHexString(), ...f.sky.eclipse };
    return { moved, brightBefore, after, body, orbitScale: f.balance.sky.orbitScale };
  });
  expect(sky.orbitScale).toBeGreaterThan(1);
  // the sky is not frozen relative to the sun
  expect(sky.moved).toBeGreaterThan(0.01);
  // the forced eclipse really covers the star and really takes the light away
  expect(sky.after.solar).toBeGreaterThan(0);
  expect(sky.after.kind).toBe('solar');
  expect(sky.after.light).toBeLessThan(sky.brightBefore);
});

test('a bridge spans its river, sits above the water, and is turned the right way', async ({ page }) => {
  await land(page);
  const bridges = await page.evaluate(async () => {
    const f = window.farhold;
    const THREE = await import('three');
    const b = f.features.bridges.find(b => f.terrain.riverInfoAt(b.x, b.z));
    if (!b) return { skipped: true };
    f.teleport(b.x, b.z);
    await new Promise(r => setTimeout(r, 400));

    const mesh = f.features.instanced.bridge;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
    let found = null;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m); m.decompose(pos, quat, scale);
      if (Math.hypot(pos.x - b.x, pos.z - b.z) < 2) { found = { pos: pos.clone(), quat: quat.clone(), scale: scale.clone() }; break; }
    }
    if (!found) return { skipped: true };
    const river = f.terrain.riverInfoAt(b.x, b.z);
    // the deck's long axis, in world space
    const along = new THREE.Vector3(0, 0, 1).applyQuaternion(found.quat);
    const roadDir = new THREE.Vector3(Math.sin(b.angle), 0, Math.cos(b.angle));
    return {
      skipped: false,
      alongDotRoad: Math.abs(along.dot(roadDir)),
      deckY: found.pos.y, waterY: river.surface, riverWidth: river.width,
      spanMetres: found.scale.z * 10,
    };
  });
  if (bridges.skipped) return;
  // the deck runs along the road, not across it (this was 90 degrees out)
  expect(bridges.alongDotRoad).toBeGreaterThan(0.95);
  // it is above the water, not in it
  expect(bridges.deckY).toBeGreaterThan(bridges.waterY + 1);
  // and long enough to reach both banks
  expect(bridges.spanMetres).toBeGreaterThan(bridges.riverWidth + 8);
});

test('a bow shoots where you are looking, up or down', async ({ page }) => {
  await land(page);
  const shots = await page.evaluate(async () => {
    const f = window.farhold;
    const out = {};
    for (const [name, pitch] of [['up', 1.0], ['level', 0], ['down', -0.9]]) {
      const cp = Math.cos(pitch);
      const a = f.fx.shoot({
        x: f.control.x, y: f.control.y + 2, z: f.control.z,
        dirX: 0, dirY: Math.sin(pitch), dirZ: cp, range: 40, speed: 42,
      });
      const y0 = a.y;
      for (let i = 0; i < 6; i++) f.fx.update(1 / 60);
      out[name] = a.y - y0;
      f.fx.land(a);
    }
    return out;
  });
  // aimed up it climbs, aimed down it drops, level it only sags under gravity
  expect(shots.up).toBeGreaterThan(1);
  expect(shots.down).toBeLessThan(-1);
  expect(Math.abs(shots.level)).toBeLessThan(0.5);
  expect(shots.up).toBeGreaterThan(shots.level);
  expect(shots.level).toBeGreaterThan(shots.down);
});
