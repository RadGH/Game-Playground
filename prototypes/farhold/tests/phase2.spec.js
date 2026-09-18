// Farhold phase 2 through the real page: the world is planted, the map's rivers/roads/towns are
// built, the weather runs, the debug menu works — and the three bugs the user reported are fixed.
//
// Headless Chromium runs WebGL on SwiftShader, so this uses ?quality=low. Every system under test
// is the real one; only the particle and scatter budgets are smaller.

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
 * Teleport somewhere that is really dry land, `metres` away-ish.
 *
 * Round 4b starts the player in a town rather than wherever the score function liked, so a blind
 * `teleport(x + 3000, z + 1200)` no longer lands where these tests assumed — on seed 7 it drops you
 * in the sea, and then there are no props, no roads and no towns to find, which is correct
 * behaviour and a broken test. This spirals outward until it finds ground.
 */
async function toLand(page, metres = 3000) {
  return page.evaluate((d) => {
    const f = window.farhold;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 * 3;
      const r = d * (0.4 + (i / 64) * 1.2);
      const [x, z] = f.terrain.clampToWorld(f.control.x + Math.cos(a) * r, f.control.z + Math.sin(a) * r);
      if (f.terrain.underwater(x, z)) continue;
      if (f.terrain.slopeAt(x, z, 6) > 0.6) continue;
      f.teleport(x, z);
      return { x: Math.round(x), z: Math.round(z), found: true };
    }
    return { found: false };
  }, metres);
}

// ---------------------------------------------------------------- the three reported bugs

test('a new game starts in daylight, not at midnight', async ({ page }) => {
  const errors = await land(page);
  const sky = await page.evaluate(() => {
    const f = window.farhold;
    return {
      sunY: f.sky.sunDirection.y,
      dayFraction: f.sky.dayFraction,
      night: f.sky.isNight,
      light: f.sky.sunLight.intensity,
      startFraction: f.balance.sky.startFraction,
    };
  });
  expect(errors).toEqual([]);
  expect(sky.night).toBe(false);
  expect(sky.sunY).toBeGreaterThan(0.2);          // the sun is well clear of the horizon
  expect(sky.light).toBeGreaterThan(0.8);
  // and the clock agrees it is morning, not midnight
  expect(sky.dayFraction).toBeGreaterThan(0.2);
  expect(sky.dayFraction).toBeLessThan(0.8);
});

test('the character faces the way it walks, and D really is right', async ({ page }) => {
  await land(page);
  // face a known direction and check the model agrees with the direction of travel
  const facing = await page.evaluate(async () => {
    const f = window.farhold;
    f.control.yaw = 0.9;
    // the body is turned by the game loop, so let a frame run before reading it
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const walk = { x: Math.sin(f.control.yaw), z: Math.cos(f.control.yaw) };
    const model = { x: Math.sin(f.actor.group.rotation.y), z: Math.cos(f.actor.group.rotation.y) };
    return walk.x * model.x + walk.z * model.z;      // 1 = same way, -1 = backwards
  });
  expect(facing).toBeGreaterThan(0.99);

  // strafing right must move the player toward the right of the screen
  const strafe = await page.evaluate(async () => {
    const THREE = await import('three');
    const f = window.farhold;
    f.control.pitch = 0;
    f.control.update(0.016, null, {});
    const right = new THREE.Vector3().setFromMatrixColumn(f.camera.matrixWorld, 0).normalize();
    const before = { x: f.control.x, z: f.control.z };
    for (let i = 0; i < 30; i++) f.control.update(1 / 60, { forward: 0, strafe: 1, run: false, jump: false, attack: false, look: [0, 0] }, {});
    const moved = new THREE.Vector3(f.control.x - before.x, 0, f.control.z - before.z);
    return { alongRight: moved.dot(right), distance: moved.length() };
  });
  expect(strafe.distance).toBeGreaterThan(0.5);
  // the movement is almost entirely along the camera's right axis, not against it
  expect(strafe.alongRight).toBeGreaterThan(strafe.distance * 0.9);
});

test('you can look straight up, even with ground right behind you', async ({ page }) => {
  await land(page);
  const look = await page.evaluate(async () => {
    const THREE = await import('three');
    const f = window.farhold;
    // stand somewhere steep so the camera has something to collide with
    let steep = null;
    for (let i = 0; i < 400 && !steep; i++) {
      const x = Math.random() * f.terrain.widthM, z = Math.random() * f.terrain.depthM;
      if (f.terrain.slopeAt(x, z, 6) > 0.5 && !f.terrain.underwater(x, z)) steep = { x, z };
    }
    if (steep) f.teleport(steep.x, steep.z);

    f.control.pitch = 1.4;                       // look almost straight up
    f.control.update(0.016, null, {});
    const dir = new THREE.Vector3();
    f.camera.getWorldDirection(dir);
    const ground = f.terrain.heightAt(f.camera.position.x, f.camera.position.z);
    return {
      lookY: dir.y,
      aboveGround: f.camera.position.y - ground,
      pulledIn: f.control.camDistanceUsed,
      onSteep: !!steep,
    };
  });
  // the camera really is pointing at the sky
  expect(look.lookY).toBeGreaterThan(0.9);
  // and it never ends up buried in the hill
  expect(look.aboveGround).toBeGreaterThan(0);
  expect(look.pulledIn).toBeGreaterThan(0.3);
});

// ---------------------------------------------------------------- phase 2 content

test('the world is planted, and the scatter stays instanced', async ({ page }) => {
  const errors = await land(page);
  const planted = await page.evaluate(() => {
    const f = window.farhold;
    const s = f.stats();
    return { props: s.props, drawCalls: s.drawCalls, triangles: s.triangles };
  });
  expect(errors).toEqual([]);
  expect(planted.props.instances).toBeGreaterThan(100);
  expect(planted.props.grass).toBeGreaterThan(0);
  // thousands of things, but only a handful of draw calls — the whole point of instancing
  expect(planted.props.drawCalls).toBeLessThan(25);
  expect(planted.drawCalls).toBeLessThan(70);

  // density is a live knob
  const dense = await page.evaluate(() => {
    const f = window.farhold;
    const before = f.stats().props.instances;
    f.props.setDensity(0, f.control.x, f.control.z);
    const bare = f.stats().props.instances;
    f.props.setDensity(2, f.control.x, f.control.z);
    const thick = f.stats().props.instances;
    f.props.setDensity(1, f.control.x, f.control.z);
    return { before, bare, thick };
  });
  expect(dense.bare).toBe(0);
  expect(dense.thick).toBeGreaterThan(dense.before);
});

test('props follow the player and never stand in the sea', async ({ page }) => {
  await land(page);
  const before = await page.evaluate(() => window.farhold.stats().props.rebuilds);
  const spot = await toLand(page, 3000);
  expect(spot.found, 'no dry land within a few kilometres').toBe(true);
  const check = await page.evaluate(async (before) => {
    const THREE = await import('three');
    const f = window.farhold;
    await new Promise(r => setTimeout(r, 200));
    const after = f.stats();

    // sample the placed instances: none may be under water or floating
    const m = new THREE.Matrix4(), pos = new THREE.Vector3();
    let drowned = 0, floating = 0, sampled = 0;
    for (const key of Object.keys(f.props.meshes)) {
      const mesh = f.props.meshes[key];
      for (let i = 0; i < Math.min(mesh.count, 40); i++) {
        mesh.getMatrixAt(i, m);
        pos.setFromMatrixPosition(m);
        sampled++;
        if (f.terrain.underwater(pos.x, pos.z)) drowned++;
        if (Math.abs(pos.y - f.terrain.heightAt(pos.x, pos.z)) > 1.2) floating++;
      }
    }
    return { rebuilt: after.props.rebuilds > before, sampled, drowned, floating };
  }, before);
  expect(check.rebuilt).toBe(true);
  expect(check.sampled).toBeGreaterThan(20);
  expect(check.drowned).toBe(0);
  expect(check.floating).toBe(0);
});

test('the map\'s rivers, roads, bridges and towns are actually built', async ({ page }) => {
  const errors = await land(page);
  const world = await page.evaluate(() => {
    const f = window.farhold;
    const s = f.stats().features;
    return { ...s, hasRivers: f.features.rivers.length > 0, hasRoads: f.features.roads.length > 0 };
  });
  expect(errors).toEqual([]);
  expect(world.hasRivers).toBe(true);
  expect(world.hasRoads).toBe(true);
  expect(world.settlements).toBeGreaterThan(0);
  expect(world.bridges).toBeGreaterThan(0);

  // a river runs along the floor of a valley it cut for itself. Sample a cell the map actually
  // marked as river, not a point on the drawn curve (which bows between cell centres).
  const valley = await page.evaluate(async () => {
    const f = window.farhold;
    const w = f.world, M = f.terrain.metresPerCell;   // round 10: the planet-size knob moves this
    let cell = -1;
    for (let i = 0; i < w.river.length; i++) if (w.river[i] >= 2) { cell = i; break; }
    const x = (cell % w.width) * M, z = Math.floor(cell / w.width) * M;
    f.teleport(x, z);
    await new Promise(res => setTimeout(res, 300));
    const bed = f.terrain.heightAt(x, z);
    const bank = Math.max(
      f.terrain.heightAt(x + 400, z), f.terrain.heightAt(x - 400, z),
      f.terrain.heightAt(x, z + 400), f.terrain.heightAt(x, z - 400),
    );
    return {
      carve: bank - bed,
      riverVerts: f.features.riverMesh.geometry.attributes.position?.count || 0,
      riverField: f.terrain.riverAt(x, z),
      offRiverField: f.terrain.riverAt(x + 2500, z + 2500),
    };
  });
  expect(valley.riverField).toBeGreaterThan(0.3);
  expect(valley.offRiverField).toBeLessThan(valley.riverField);
  expect(valley.carve).toBeGreaterThan(3);          // it sits in a real valley, not on a plain
  expect(valley.riverVerts).toBeGreaterThan(0);     // and the water surface is drawn

  // a town is a cluster of buildings standing on the ground
  const town = await page.evaluate(async () => {
    const f = window.farhold;
    const t = f.features.nearest('settlement', f.control.x, f.control.z);
    f.teleport(t.wx, t.wz);
    await new Promise(res => setTimeout(res, 250));
    const THREE = await import('three');
    const m = new THREE.Matrix4(), pos = new THREE.Vector3();
    let off = 0, counted = 0;
    for (const key of ['hut', 'house', 'hall']) {
      const mesh = f.features.instanced[key];
      for (let i = 0; i < Math.min(mesh.count, 30); i++) {
        mesh.getMatrixAt(i, m); pos.setFromMatrixPosition(m); counted++;
        if (Math.abs(pos.y - f.terrain.heightAt(pos.x, pos.z)) > 1.5) off++;
      }
    }
    return { name: t.name, size: t.size, buildings: f.stats().features.buildings, counted, off, standingIn: f.features.settlementAt(t.wx, t.wz)?.name };
  });
  expect(town.buildings).toBeGreaterThan(5);
  expect(town.counted).toBeGreaterThan(3);
  expect(town.off).toBe(0);                          // no house floating above or sunk into a hill
  expect(town.standingIn).toBe(town.name);           // the HUD can tell you where you are
});

test('weather rolls in, changes the sky, and can be held from the debug menu', async ({ page }) => {
  const errors = await land(page);
  const storm = await page.evaluate(async () => {
    const f = window.farhold;
    f.setWeather('clear');
    await new Promise(r => setTimeout(r, 150));
    const clear = { ...f.stats().weather, rain: f.weatherView.rain.visible, cloud: f.weatherView.decks[0].mesh.material.opacity, fog: f.scene.fog.far };
    f.setWeather('storm');
    await new Promise(r => setTimeout(r, 200));
    const wet = { ...f.stats().weather, rain: f.weatherView.rain.visible, cloud: f.weatherView.decks[0].mesh.material.opacity, fog: f.scene.fog.far };
    f.weatherView.strike();
    // the flash is worked out by the frame loop, so let one run
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const flashed = f.weatherView.state.flash;
    f.setWeather('blizzard');
    await new Promise(r => setTimeout(r, 200));
    const cold = { snowVisible: f.weatherView.snow.visible, rainVisible: f.weatherView.rain.visible };
    f.setWeather(null);
    return { clear, wet, flashed, cold, locked: f.weather.locked };
  });
  expect(errors).toEqual([]);
  expect(storm.clear.key).toBe('clear');
  expect(storm.wet.key).toBe('storm');
  // a storm is cloudier, wetter, and closes in the view
  expect(storm.wet.cloud).toBeGreaterThan(storm.clear.cloud);
  expect(storm.wet.rain).toBe(true);
  expect(storm.clear.rain).toBe(false);
  expect(storm.wet.fog).toBeLessThan(storm.clear.fog);
  expect(storm.flashed).toBeGreaterThan(0);
  // snow falls instead of rain in a blizzard
  expect(storm.cold.snowVisible).toBe(true);
  expect(storm.cold.rainVisible).toBe(false);
  // and letting go puts it back on its own schedule
  expect(storm.locked).toBe(false);
});

test('the weather that is possible depends on where you stand', async ({ page }) => {
  await land(page);
  const climates = await page.evaluate(async () => {
    const f = window.farhold;
    const { weatherWeights } = await import('/worldgen/js/weather.js');
    // find the hottest driest cell and the coldest one on this planet, and compare
    let hot = null, cold = null;
    for (let i = 0; i < 1200; i++) {
      const x = Math.random() * f.terrain.widthM, z = Math.random() * f.terrain.depthM;
      if (f.terrain.underwater(x, z)) continue;
      const c = f.terrain.climateAt(x, z);
      if (!hot || (c.temperature - c.moisture) > (hot.temperature - hot.moisture)) hot = c;
      if (!cold || c.temperature < cold.temperature) cold = c;
    }
    return { hot: weatherWeights(hot), cold: weatherWeights(cold), hotT: hot.temperature, coldT: cold.temperature };
  });
  expect(Object.keys(climates.hot).length).toBeGreaterThan(0);
  expect(Object.keys(climates.cold).length).toBeGreaterThan(0);
  expect(climates.coldT).toBeLessThan(climates.hotT);
  // the cold end of the planet may snow; the hot dry end must not
  expect(climates.hot.snow || 0).toBe(0);
});

test('the debug menu opens on the tilde key and drives the game', async ({ page }) => {
  const errors = await land(page);
  await page.keyboard.press('Backquote');
  await expect(page.locator('#debug')).toBeVisible();

  // the weather buttons are real
  const before = await page.evaluate(() => window.farhold.stats().weather.key);
  await page.locator('#debug .debug-btn', { hasText: 'Thunderstorm' }).click();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ key: window.farhold.stats().weather.key, locked: window.farhold.weather.locked }));
  expect(after.locked).toBe(true);

  // time of day moves the sun
  const sun = await page.evaluate(() => {
    const f = window.farhold;
    const before = f.sky.sunDirection.y;
    f.debug.panel.querySelector('.debug-slider');
    return before;
  });
  await page.locator('#debug .debug-btn', { hasText: 'Midnight' }).click();
  await page.waitForTimeout(150);
  const night = await page.evaluate(() => window.farhold.sky.sunDirection.y);
  expect(night).toBeLessThan(sun);

  // and it closes again
  await page.keyboard.press('Backquote');
  await expect(page.locator('#debug')).toBeHidden();
  expect(errors).toEqual([]);
});

test('every planet gets its own sky, sea and cloud colour', async ({ page }) => {
  await land(page);
  const palettes = await page.evaluate(async () => {
    const { atmospherePalette } = await import('/worldgen/js/weather.js');
    const { createSystem } = await import('/prototypes/farhold/js/planet.js');
    const out = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const { system } = createSystem({ seed });
      for (const p of system.planets.slice(0, 3)) {
        out.push({ archetype: p.archetype, ...atmospherePalette(p) });
      }
    }
    return out;
  });
  expect(palettes.length).toBeGreaterThan(8);
  for (const p of palettes) {
    expect(p.sky).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.cloud).toMatch(/^#[0-9a-f]{6}$/);
  }
  // no two worlds share a sky
  const skies = new Set(palettes.map(p => p.sky));
  expect(skies.size).toBeGreaterThan(palettes.length * 0.7);
});

test('the rings have a skirt around their hole, so the joins are not see-through', async ({ page }) => {
  await land(page);
  const rings = await page.evaluate(() => {
    const f = window.farhold;
    const out = [];
    for (const ring of f.view.rings) {
      if (!ring.hole) continue;
      const pos = ring.geometry.attributes.position.array;
      const res = ring.res, cell = ring.cell, half = ring.extent / 2;
      let onLip = 0, justOutside = 0, lipY = 0, outY = 0;
      for (let y = 0; y <= res; y++) {
        for (let x = 0; x <= res; x++) {
          const i = y * (res + 1) + x;
          const lx = Math.abs(-half + x * cell), lz = Math.abs(-half + y * cell);
          const edge = Math.max(lx, lz);
          const ground = f.terrain.heightAt(
            ring.centre[0] - half + x * cell,
            ring.centre[1] - half + y * cell,
          );
          const drop = ground - pos[i * 3 + 1];
          if (edge <= ring.hole / 2 + cell) { onLip++; lipY += drop; }
          else if (edge <= ring.hole / 2 + cell * 3) { justOutside++; outY += drop; }
        }
      }
      out.push({
        extent: ring.extent, skirt: ring.skirt,
        lipDrop: onLip ? lipY / onLip : 0,
        outsideDrop: justOutside ? outY / justOutside : 0,
      });
    }
    return out;
  });
  expect(rings.length).toBeGreaterThan(0);
  for (const r of rings) {
    // the lip really is below the ground it sits on, and the ground outside it is not
    expect(r.lipDrop).toBeGreaterThan(r.skirt * 0.5);
    expect(Math.abs(r.outsideDrop)).toBeLessThan(0.5);
  }
});
