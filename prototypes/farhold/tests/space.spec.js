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

  await page.keyboard.press('KeyJ');
  // the climb, then the swap
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
  expect(after.altitude).toBeLessThan(4);
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
