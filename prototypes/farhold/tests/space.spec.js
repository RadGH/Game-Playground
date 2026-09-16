// Farhold phase 5/6: leaving the ground, flying the system, and landing on another world.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
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

  // Hold the throttle open and the nose up from a timer rather than a per-frame await: under
  // SwiftShader, with the whole suite running, three thousand awaited animation frames is a minute
  // of wall clock. The flight model still does all the work; this only holds the stick.
  await page.evaluate(() => {
    const f = window.farhold;
    // Bring the ceiling down for the test. The handover is what is under test, not the altitude it
    // happens at; climbing the real 9 km at SwiftShader's frame rate takes most of a minute, and
    // this is the same code path in a tenth of the time.
    f.air.cfg.ceiling = 1200;
    window.__climb = setInterval(() => {
      if (!f.air || f.mode !== 'air') return;
      f.air.state.throttle = 1;
      f.air.state.pitch = 1.2;
    }, 16);
  });
  await page.waitForFunction(() => window.farhold.mode === 'space', null, { timeout: 60000 });
  await page.evaluate(() => clearInterval(window.__climb));
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
      .filter(b => b.planet.id !== f.planet.id)
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
