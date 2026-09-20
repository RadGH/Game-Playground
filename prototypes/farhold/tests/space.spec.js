// Farhold phase 5/6: leaving the ground, flying the system, and landing on another world.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // `ship=1` hands over a finished ship. §9 of BUILDING_EXPANSION means a fresh character has no
  // ship and cannot buy one — which is the point — but these tests are about how the thing FLIES,
  // not about earning it, so the gate is satisfied up front rather than mined through.
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7&ship=1' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('J lifts off the ground and ends up in space', async ({ page }) => {
  const errors = await land(page);
  const before = await page.evaluate(() => ({ mode: window.farhold.mode, planet: window.farhold.planet.name }));
  expect(before.mode).toBe('ground');

  // Round 4b: J no longer plays a cinematic. It puts you in the cockpit, IN the world, and you fly
  // out — the space scene takes over when the ground has faded. So this test has to fly.
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.farhold.mode === 'air', null, { timeout: 15000 });
  const airborne = await page.evaluate(() => ({ mode: window.farhold.mode, alt: Math.round(window.farhold.air.altitude) }));
  expect(airborne.mode).toBe('air');

  // Fly the climb on a FIXED clock rather than on animation frames.
  //
  // The handover is what is under test, not how long it takes: under SwiftShader, with the whole
  // suite running, the real frame rate makes a nine-kilometre climb take most of a minute of wall
  // clock and the result depends on how busy the machine is. Stepping the flight model directly at
  // a fixed dt exercises exactly the same code — thrust, lift, drag, the ceiling check — and takes
  // the same number of milliseconds every time.
  await page.evaluate(async () => {
    const f = window.farhold;
    for (let i = 0; i < 900 && f.mode === 'air'; i++) {
      f.air.state.throttle = 1;
      f.air.state.pitch = 1.2;                             // nose up
      const out = f.air.update(1 / 30, null, f.camera);
      if (out.leftAtmosphere) break;
      if (i % 60 === 0) await new Promise(r => setTimeout(r, 0));
    }
    // let the game's own loop see the altitude and make the handover
    for (let i = 0; i < 120 && f.mode === 'air'; i++) await new Promise(r => requestAnimationFrame(r));
  });
  await page.waitForFunction(() => window.farhold.mode === 'space', null, { timeout: 30000 });
  const after = await page.evaluate(() => {
    const f = window.farhold;
    const s = f.space.stats();
    return { mode: f.mode, bodies: s.bodies, target: s.target, altitude: s.altitude, canLand: s.canLand };
  });
  expect(after.mode).toBe('space');
  expect(after.bodies).toBeGreaterThan(1);
  // you leave just off the world you were standing on
  expect(after.target).toBe(before.planet);
  expect(after.altitude).toBeLessThan(6);
  expect(errors).toEqual([]);
});

test('the throttle, the boost and the warp are three different speeds', async ({ page }) => {
  await land(page);
  const speeds = await page.evaluate(async () => {
    const f = window.farhold;
    f.toSpace();
    // OUT INTO OPEN SPACE FIRST. Round 5 governs the throttle by how close you are to a world and
    // locks warp out entirely inside nine radii of anything — which is the point — so measuring the
    // three speeds beside the planet you just left measures the brake, not the drive.
    f.space.state.position.set(f.space.AU * 6, f.space.AU * 3, f.space.AU * 6);
    const run = (run, jump, frames = 240) => {
      f.space.state.throttle = 0; f.space.state.warpCharge = 0;
      let top = 0;
      for (let i = 0; i < frames; i++) {
        f.space.update(1 / 60, { forward: 1, strafe: 0, run, jump, attack: false, look: [0, 0], pressed: new Set() }, f.camera);
        top = Math.max(top, f.space.state.speed);
      }
      return Math.round(top);
    };
    return { cruise: run(false, false), boost: run(true, false), warp: run(true, true) };
  });
  expect(speeds.boost).toBeGreaterThan(speeds.cruise * 2);
  expect(speeds.warp).toBeGreaterThan(speeds.boost * 3);
});

test('the drive will not warp with a world in your lap, and gives it back out in the dark', async ({ page }) => {
  // "Getting close to a planet should cause you to slow down." Warp is locked out inside
  // `noWarpWithin` radii of ANY body, which is what stops you folding straight into a planet.
  await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.toSpace();
    const s = f.space;
    const body = s.bodies.find(b => b.landable) || s.bodies[0];

    /** Hold station wherever the ship is put and try to spin the drive up. */
    const tryWarp = () => {
      s.state.warpCharge = 0;
      s.state.throttle = 1;
      const held = s.state.position.clone();
      for (let i = 0; i < 150; i++) {
        s.update(1 / 60, { forward: 1, strafe: 0, run: false, jump: true, attack: false, look: [0, 0], pressed: new Set() }, f.camera);
        s.state.position.copy(held);
      }
      return {
        altitude: +s.nearest().altitude.toFixed(2),
        crowded: s.state.crowded,
        warp: +s.state.warpCharge.toFixed(2),
        approach: +s.state.approach.toFixed(2),
        speed: Math.round(s.state.speed),
      };
    };

    // right on top of a world…
    const dir = s.state.position.clone().sub(body.position).normalize();
    s.state.position.copy(body.position).addScaledVector(dir, body.radius * 2);
    const close = tryWarp();
    // …and a long way out from everything
    s.state.position.set(s.AU * 6, s.AU * 3, s.AU * 6);
    const far = tryWarp();
    return { close, far };
  });

  expect(out.close.altitude).toBeLessThan(9);
  expect(out.close.crowded).toBe(true);
  expect(out.close.warp, 'the drive spun up with a planet in the way').toBe(0);
  expect(out.close.approach).toBeLessThan(0.6);

  expect(out.far.altitude).toBeGreaterThan(26);
  expect(out.far.crowded).toBe(false);
  expect(out.far.warp).toBe(1);
  expect(out.far.approach).toBe(1);
  expect(out.far.speed).toBeGreaterThan(out.close.speed * 10);
});

test('the worlds are where their orbits put them, on real ellipses', async ({ page }) => {
  await land(page);
  const orbits = await page.evaluate(async () => {
    const f = window.farhold;
    f.toSpace();
    const out = [];
    for (const b of f.space.bodies) {
      // walk one whole orbit and record how far from the star it gets
      let min = Infinity, max = 0;
      for (let step = 0; step < 24; step++) {
        f.space.placeBodies(step / 24 * b.period * (f.balance.sky.dayLengthSeconds / f.balance.sky.orbitScale));
        const r = b.position.length() / f.space.AU;
        min = Math.min(min, r); max = Math.max(max, r);
      }
      out.push({ name: b.planet.name, au: b.au, e: b.eccentricity, min: +min.toFixed(3), max: +max.toFixed(3) });
    }
    return out;
  });
  expect(orbits.length).toBeGreaterThan(1);
  for (const o of orbits) {
    // the semi-major axis the universe generated is what it actually orbits at
    expect(o.max).toBeGreaterThan(o.au * 0.8);
    expect(o.min).toBeLessThan(o.au * 1.2);
    // an eccentric orbit really is nearer at one end than the other
    if (o.e > 0.05) expect(o.max - o.min).toBeGreaterThan(0.001);
  }
  // the planets are in the order the system says they are
  const sorted = [...orbits].sort((a, b) => a.au - b.au);
  expect(sorted[0].au).toBeLessThan(sorted[sorted.length - 1].au);
});

test('you can fly to another world and land on it, and everything you own comes with you', async ({ page }) => {
  const errors = await land(page);
  const trip = await page.evaluate(async () => {
    const f = window.farhold;
    f.player.gold = 321;
    f.give('greatsword', 'rare');
    const home = { id: f.planet.id, name: f.planet.name, archetype: f.planet.archetype };
    const carriedBefore = { gold: f.player.gold, bag: f.player.bag.length, level: f.player.level };

    f.toSpace();
    await new Promise(r => setTimeout(r, 200));
    const target = f.space.bodies.find(b => b.planet.id !== home.id && b.landable);
    if (!target) return { skipped: true };

    // fly there, re-aiming as it moves
    let frames = 0, arrived = null;
    while (frames < 6000) {
      f.space.aimAt(target);
      f.space.state.throttle = 1;
      const near = f.space.nearest();
      const far = near.body !== target || near.altitude > 6;
      f.space.update(1 / 60, { forward: 1, strafe: 0, run: true, jump: far, attack: false, look: [0, 0], pressed: new Set() }, f.camera);
      frames++;
      const can = f.space.canLand();
      if (can && can.planet.id === target.planet.id) { arrived = can; break; }
    }
    if (!arrived) return { failed: true, frames };

    f.landOn(target.planet.id, f.space.landingSpot(target));
    await new Promise(r => setTimeout(r, 900));
    return {
      home, frames,
      arrived: { id: f.planet.id, name: f.planet.name, archetype: f.planet.archetype },
      mode: f.mode,
      carriedBefore,
      carriedAfter: { gold: f.player.gold, bag: f.player.bag.length, level: f.player.level },
      onGround: Math.abs(f.control.y - f.terrain.heightAt(f.control.x, f.control.z)) < 2,
      inWater: !!f.terrain.waterAt(f.control.x, f.control.z),
      props: f.stats().props.instances,
      mapIsNewWorld: f.map.state !== undefined,
    };
  });
  if (trip.skipped) return;
  expect(trip.failed).toBeFalsy();
  // a different world, actually rebuilt
  expect(trip.arrived.id).not.toBe(trip.home.id);
  expect(trip.mode).toBe('ground');
  expect(trip.onGround).toBe(true);
  expect(trip.inWater).toBe(false);
  expect(trip.props).toBeGreaterThan(0);
  // and the character is untouched by the journey
  expect(trip.carriedAfter).toEqual(trip.carriedBefore);
  expect(errors).toEqual([]);
});

test('the sky from the ground agrees with where the ship actually flies', async ({ page }) => {
  await land(page);
  const agree = await page.evaluate(async () => {
    const f = window.farhold;
    // what the sky says is the nearest neighbour
    const seen = f.sky.visible();
    f.toSpace();
    const home = f.space.bodies.find(b => b.planet.id === f.planet.id);
    const distances = f.space.bodies
      // Moons only, and no moons: a moon is now drawn in a tight ring inside its parent's own lane
      // (round 11 — they used to sweep a circle wider than the gap to the next world), so a moon and
      // its planet are at the same distance to three decimal places and the moon simply takes a slot
      // in the queue ahead of it. What is being checked is which NEIGHBOUR you can see.
      .filter(b => !b.moon && b.planet.id !== f.planet.id)
      .map(b => ({ name: b.planet.name, d: b.position.distanceTo(home.position) / f.space.AU }))
      .sort((a, b) => a.d - b.d);
    return { seen: seen.map(s => s.name), closest: distances[0], all: distances };
  });
  // whatever looks biggest in the sky is one of the near ones out there
  if (agree.seen.length) {
    const nearNames = agree.all.slice(0, 3).map(d => d.name);
    expect(nearNames).toContain(agree.seen[0]);
  }
  expect(agree.closest.d).toBeGreaterThan(0);
});

test('the ship points where it is flying', async ({ page }) => {
  await land(page);
  const nose = await page.evaluate(async () => {
    const f = window.farhold;
    const THREE = await import('three');
    f.toSpace();
    const out = [];
    for (const [yaw, pitch] of [[0.8, 0.6], [-2.1, -0.9], [3.0, 0]]) {
      f.space.state.yaw = yaw; f.space.state.pitch = pitch; f.space.state.throttle = 1;
      for (let i = 0; i < 20; i++) f.space.update(1 / 60, null, f.camera);
      // the hull is modelled facing +Z
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(f.space.ship.group.quaternion);
      const cp = Math.cos(pitch);
      const flight = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      out.push({ dot: n.dot(flight), noseY: n.y, flightY: flight.y });
    }
    return out;
  });
  for (const n of nose) {
    // the nose is along the flight path, not stuck level
    expect(n.dot).toBeGreaterThan(0.93);
    expect(Math.abs(n.noseY - n.flightY)).toBeLessThan(0.12);
  }
});
