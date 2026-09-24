// Farhold round 23, items 4 and 5, in the real game at the reported spot.
//
//   seed 47, Sheithyadmia V, Super tiny planet (scale 0.1):
//     4. the bridge at x 13269 z 2876 — "no physics, characters clipping through it, the ends are
//        not flush with the ground";
//     5. the gate at x 13212 z 2916 — "does not properly connect to the walls, you can just walk
//        through the wall… the doors appear closed… have a guard by each entrance".
//
// The node test (round23-bridge-gate.test.js) measures the geometry. This one drives the player's
// own controller over it, with the real key input, and screenshots what it looks like.

import { test, expect } from '@playwright/test';

const SHOTS = 'prototypes/farhold/research/round23-bridge-gate/';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=47&scale=0.1&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand somewhere facing a heading, and let the world rebuild around you. */
async function stand(page, x, z, yaw) {
  await page.evaluate(async ({ x, z, yaw }) => {
    const f = window.farhold;
    f.teleport(x, z);
    f.control.yaw = yaw;
    f.control.pitch = -0.15;
    f.features.update(x, z, true);
    await new Promise(r => setTimeout(r, 600));
  }, { x, z, yaw });
}

/**
 * Hold W (and Shift, to run) until `done(sample)` or `ms` runs out, recording a sample every step.
 * Headless WebGL at low quality runs a few frames a second, so this is bounded by where the player
 * got to rather than by a fixed time.
 */
async function walk(page, ms, sample, done = () => false, run = false) {
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  const trail = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(sample);
    trail.push(s);
    if (done(s)) break;
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  if (run) await page.keyboard.up('ShiftLeft');
  return trail;
}

test('the reported bridge carries the player end to end, feet on the drawn deck', async ({ page }) => {
  const errors = await land(page);
  const info = await page.evaluate(() => {
    const f = window.farhold;
    f.features.update(13269, 2876, true);
    const p = f.features.bridgePlans.find(q => Math.hypot(q.crossing.x - 13306, q.crossing.z - 2879) < 8);
    return p && { x: p.crossing.x, z: p.crossing.z, tx: p.tx, tz: p.tz, from: p.from, to: p.to, planet: f.terrain.planet?.name };
  });
  expect(info, 'no bridge at the reported spot').toBeTruthy();
  expect(info.planet).toBe('Sheithyadmia V');
  // start on the road short of the east end (the reported spot is just inside it) and walk west
  const start = info.to + 8;
  const sx = info.x + info.tx * start, sz = info.z + info.tz * start;
  const yaw = Math.atan2(-info.tx, -info.tz);
  await stand(page, sx, sz, yaw);
  await page.screenshot({ path: SHOTS + 'after-bridge-east-end.png' });

  const trail = await walk(page, 90000, () => {
    const f = window.farhold, c = f.control;
    const p = f.features.bridgePlans.find(q => Math.hypot(q.crossing.x - 13306, q.crossing.z - 2879) < 8);
    const d = (c.x - p.crossing.x) * p.tx + (c.z - p.crossing.z) * p.tz;
    const on = d >= p.from && d <= p.to;
    // the drawn deck's top along its own samples
    let top = null;
    if (on) {
      const s = p.samples;
      for (let k = 0; k + 1 < s.length; k++) {
        if (d >= s[k].d && d <= s[k + 1].d) { top = s[k].top + (s[k + 1].top - s[k].top) * (d - s[k].d) / (s[k + 1].d - s[k].d); break; }
      }
    }
    return { d, on, y: c.y, top, swimming: c.swimming, bed: f.terrain.heightAt(c.x, c.z), from: p.from };
  }, t => t.d < t.from - 3, true);
  const onDeck = trail.filter(t => t.on && t.top !== null);
  expect(onDeck.length, 'the walk never reached the bridge').toBeGreaterThan(10);
  // across the middle the river bed is metres below the deck; the feet never leave the planks
  for (const t of onDeck) {
    expect(t.swimming, `swimming ${t.d.toFixed(1)} m along the bridge`).toBe(false);
    expect(Math.abs(t.y - t.top), `feet ${t.y.toFixed(2)} vs deck ${t.top.toFixed(2)} at ${t.d.toFixed(1)} m`).toBeLessThan(0.12);
  }
  expect(onDeck.some(t => t.top - t.bed > 3), 'never crossed the channel').toBe(true);
  // got right across: the walk ended past the far end
  expect(trail[trail.length - 1].d).toBeLessThan(info.from + 2);
  await page.screenshot({ path: SHOTS + 'after-bridge-walked.png' });
  expect(errors).toEqual([]);
});

test('the reported gate: the wall beside it stops you, the opening lets you through, the guards stand at it', async ({ page }) => {
  const errors = await land(page);
  const gate = await page.evaluate(async () => {
    const f = window.farhold;
    f.teleport(13212, 2916);
    f.features.update(13212, 2916, true);
    const t = f.features.settlements.find(s => s.name === 'Fenkeep');
    const g = f.features.gatesOf(t.id).find(q => Math.hypot(q.x - 13212, q.z - 2916) < 6);
    return g && { ...g, town: t.id };
  });
  expect(gate, 'no gate at the reported spot').toBeTruthy();
  const outside = 10;

  // 1. beside the gate, where the old wall had its hole: start outside, walk straight in
  const besideAlong = gate.span / 2 + 2.5;
  const bx = gate.x + gate.tx * besideAlong + gate.ox * outside, bz = gate.z + gate.tz * besideAlong + gate.oz * outside;
  await stand(page, bx, bz, Math.atan2(-gate.ox, -gate.oz));
  await page.screenshot({ path: SHOTS + 'after-gate-outside.png' });
  // long enough to cover the ten metres to the wall and well past it, if it were not there
  const wallTrail = await walk(page, 12000, () => {
    const c = window.farhold.control;
    return { x: c.x, z: c.z };
  });
  const endWall = wallTrail[wallTrail.length - 1];
  const outWall = (endWall.x - gate.x) * gate.ox + (endWall.z - gate.z) * gate.oz;
  expect(outWall, `walked through the wall beside the gate to ${outWall.toFixed(2)} m`).toBeGreaterThan(0.5);

  // 2. through the middle of the opening: start outside, walk in, end up inside the town
  const gx = gate.x + gate.ox * outside, gz = gate.z + gate.oz * outside;
  await stand(page, gx, gz, Math.atan2(-gate.ox, -gate.oz));
  const gateTrail = await walk(page, 30000, () => {
    const c = window.farhold.control;
    return { x: c.x, z: c.z };
  }, s => (s.x - gate.x) * gate.ox + (s.z - gate.z) * gate.oz < -8);
  const endGate = gateTrail[gateTrail.length - 1];
  const outGate = (endGate.x - gate.x) * gate.ox + (endGate.z - gate.z) * gate.oz;
  expect(outGate, `stopped ${outGate.toFixed(2)} m from the gate`).toBeLessThan(-6);

  // 3. the guards: two posted at this gate. Their POST is the gate (they are real guards, so if a
  // wolf comes by they go and fight it — seen on the first run of this spec — and walk back after)
  await stand(page, gate.x + gate.ox * 14, gate.z + gate.oz * 14, Math.atan2(-gate.ox, -gate.oz));
  const guards = await page.evaluate(async (gate) => {
    const f = window.farhold;
    const t0 = Date.now();
    const find = () => f.folk.roster().filter(n => n.post && Math.hypot(n.home[0] - gate.x, n.home[1] - gate.z) < gate.open / 2 + 6);
    while (find().length < 2 && Date.now() - t0 < 25000) await new Promise(r => setTimeout(r, 250));
    // anything that wandered over to be fought is sent away, so the posts can be seen held
    for (const e of [...(f.field?.enemies || [])]) if (Math.hypot(e.x - gate.x, e.z - gate.z) < 80) f.field.kill?.(e);
    // …and they walk back to their posts (headless frames are slow, so wait on it, not on a clock)
    const t1 = Date.now();
    while (find().some(n => !n.target && Math.hypot(n.x - n.home[0], n.z - n.home[1]) > 1.5) && Date.now() - t1 < 30000) {
      await new Promise(r => setTimeout(r, 250));
    }
    return find().map(n => ({
      role: n.role, atPost: Math.hypot(n.x - n.home[0], n.z - n.home[1]), target: !!n.target,
      out: (n.home[0] - gate.x) * gate.ox + (n.home[1] - gate.z) * gate.oz,
    }));
  }, gate);
  expect(guards.length).toBe(2);
  for (const g of guards) {
    expect(g.role).toBe('guard');
    expect(g.out, 'a gate guard is posted inside the wall').toBeGreaterThan(gate.depth / 2);
    if (!g.target) expect(g.atPost, 'an idle gate guard has left the gate').toBeLessThan(2);
  }
  await page.screenshot({ path: SHOTS + 'after-gate-guards.png' });
  expect(errors).toEqual([]);
});
