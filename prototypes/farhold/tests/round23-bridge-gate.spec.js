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
    // R27 M5 moved this gate 31 m along the same road (a wider highway grew the plan — see the node
    // test); it is still the nearest gate to the reported spot
    const g = f.features.gatesOf(t.id).map(q => ({ q, d: Math.hypot(q.x - 13212, q.z - 2916) }))
      .filter(e => e.d < 40).sort((a, b) => a.d - b.d)[0]?.q;
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

// R27 M4 — the reported gate again, shut this time. A siege camp is put 90 m outside Fenkeep's wall
// (none of the standard seeds places one by a walled town on its own; see round27-gates.test.js), the real player walks into
// the shut gate on the real keys, M1's take lifts the siege, E knocks a re-shut gate open, a Hunted
// player finds the guards coming for him outside the wall and not inside, a Trusted one gets a
// salute, and every watchpost in town has a guard at its door.
test('R27 M4 — a besieged gate is shut: the walker stops, the take and a knock open it, Hunted guards come out', async ({ page }) => {
  test.setTimeout(420000);
  const errors = await land(page);
  const gate = await page.evaluate(async () => {
    const f = window.farhold;
    f.teleport(13212, 2916);
    f.features.update(13212, 2916, true);
    const t = f.features.settlements.find(s => s.name === 'Fenkeep');
    const g = f.features.gatesOf(t.id).find(q => Math.hypot(q.x - 13212, q.z - 2916) < 40 && q.doors);
    // nothing about this town may exempt it: wake somewhere else, and drop any job from here
    f.control.spawn.x = t.wx + 20000; f.control.spawn.z = t.wz;
    for (const q of [...f.questLog.active]) if (String(q.giverId ?? '').split(':')[0] === String(t.id)) q.giverId = null;
    // a siege camp, shaped as js/sites.js makes one, 90 m outside the wall on the far side — on a
    // Super tiny world the next town is only a few hundred metres off, and a camp besieges its NEAREST
    const src = f.sites.sites.find(s => s.family === 'stronghold');
    const wall = f.features.wallOf(t.id).r;
    f.sites.sites.push({ ...src, key: 'm4-siege', id: 'm4-siege', type: 'siege_camp', family: 'stronghold', taken: false,
      populated: true, cleared: true, x: t.wx - (wall + 90), z: t.wz, name: 'Siege Camp of the Test' });
    return g && { x: g.x, z: g.z, ox: g.ox, oz: g.oz, tx: g.tx, tz: g.tz, yaw: g.yaw, open: g.open, span: g.span, depth: g.depth, index: g.index, town: t.id, cx: t.wx, cz: t.wz, wall };
  });
  expect(gate, 'no gatehouse with doors at the reported spot').toBeTruthy();
  const out = s => (s.x - gate.x) * gate.ox + (s.z - gate.z) * gate.oz;
  const verdict = () => page.evaluate(id => { const v = window.farhold.folk.gateOf(id); return v && { shut: v.shut, reason: v.reason, exempt: v.exempt, band: v.band }; }, gate.town);
  const waitShut = async want => {
    for (let i = 0; i < 60; i++) { const v = await verdict(); if (v && v.shut === want) return v; await page.waitForTimeout(250); }
    return verdict();
  };
  const inward = Math.atan2(-gate.ox, -gate.oz);
  const pos = () => { const c = window.farhold.control; return { x: c.x, z: c.z }; };

  // 1. shut by the siege: the real walker stops at the gate line
  expect((await waitShut(true))?.reason).toBe('siege');
  await stand(page, gate.x + gate.ox * 10, gate.z + gate.oz * 10, inward);
  await page.waitForTimeout(1200);                                   // the leaves take 0.8 s to swing
  await page.screenshot({ path: SHOTS + 'r27-gate-shut-siege.png' });
  let trail = await walk(page, 12000, pos);
  expect(out(trail[trail.length - 1]), 'walked through a shut gate').toBeGreaterThan(0.5);

  // 2. M1's take lifts the siege: the same walk goes in
  await page.evaluate(() => window.farhold.sites.take('m4-siege'));
  expect((await waitShut(false))?.shut).toBe(false);
  await stand(page, gate.x + gate.ox * 10, gate.z + gate.oz * 10, inward);
  trail = await walk(page, 30000, pos, s => out(s) < -8);
  expect(out(trail[trail.length - 1]), 'the siege is lifted and the gate still stops you').toBeLessThan(-6);

  // 3. the camp back: shut again, and E at the gate — Known — opens it for a minute
  await page.evaluate(() => { window.farhold.sites.sites.find(s => s.key === 'm4-siege').taken = false; });
  expect((await waitShut(true))?.shut).toBe(true);
  await stand(page, gate.x + gate.ox * 3, gate.z + gate.oz * 3, inward);
  expect(await page.evaluate(() => window.farhold.interactTarget()?.kind)).toBe('gate');
  await page.keyboard.press('KeyE');
  expect((await waitShut(false))?.shut, 'the knock did not open it').toBe(false);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS + 'r27-gate-knocked-open.png' });
  await stand(page, gate.x + gate.ox * 10, gate.z + gate.oz * 10, inward);
  trail = await walk(page, 30000, pos, s => out(s) < -8);
  expect(out(trail[trail.length - 1]), 'a knocked-open gate still stops you').toBeLessThan(-6);
  await page.evaluate(() => { window.farhold.sites.sites.find(s => s.key === 'm4-siege').taken = true; });

  // 4. Hunted: barred, and the gate guards come for you OUTSIDE the wall only
  const holder = await page.evaluate(({ cx, cz }) => {
    const f = window.farhold;
    const k = f.holdings.of(f.zones.at(cx, cz)?.id)?.holder;
    if (k) f.standings.add(k, -200, { spread: false });
    f.player && (f.player.hp = f.player.maxHp);
    return k;
  }, gate);
  expect(holder, 'Fenkeep\'s zone has no holder to be hunted by').toBeTruthy();
  expect((await waitShut(true))?.reason).toBe('hunted');
  await stand(page, gate.x + gate.ox * 9, gate.z + gate.oz * 9, inward);
  const hunting = await page.evaluate(async ({ town }) => {
    const f = window.farhold, t0 = Date.now();
    const guards = () => f.folk.roster().filter(n => n.node?.id === town && n.post?.gate != null);
    while (!guards().some(n => n.huntingPlayer) && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 200));
    return guards().filter(n => n.huntingPlayer).length;
  }, gate);
  expect(hunting, 'no gate guard went for a Hunted player outside the wall').toBeGreaterThan(0);
  await page.screenshot({ path: SHOTS + 'r27-gate-hunted-outside.png' });
  // inside the wall (teleported past the shut door): left alone
  await stand(page, gate.cx, gate.cz, inward);
  const inside = await page.evaluate(async ({ town }) => {
    const f = window.farhold;
    await new Promise(r => setTimeout(r, 1500));
    return f.folk.roster().filter(n => n.node?.id === town && n.huntingPlayer).length;
  }, gate);
  expect(inside, 'a guard went for the player inside the wall').toBe(0);

  // 5. Trusted: an open gate, a greeting and a salute
  await page.evaluate(({ holder }) => { const st = window.farhold.standings; st.add(holder, 40 - st.get(holder), { spread: false }); }, { holder });
  expect((await waitShut(false))?.band).toBe('trusted');
  await stand(page, gate.x + gate.ox * 20, gate.z + gate.oz * 20, inward);
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyW');
  const saluted = await page.evaluate(async ({ town }) => {
    const f = window.farhold, t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      if (f.folk.roster().some(n => n.node?.id === town && n.saluteLeft > 0)) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }, gate);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: SHOTS + 'r27-gate-salute.png' });
  expect(saluted, 'no salute for a Trusted player at an open gate').toBe(true);

  // 6. the watchposts are manned: a guard body within 2 m of every one this town built
  const watch = await page.evaluate(async ({ town }) => {
    const f = window.farhold, t0 = Date.now();
    const posts = f.features.postsOf(town).filter(p => p.key === 'watchpost');
    const manned = () => posts.filter(p => f.folk.roster().some(n => n.post?.watch != null && Math.hypot(n.x - p.x, n.z - p.z) - p.r <= 2));
    while (manned().length < posts.length && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 250));
    return { posts: posts.length, manned: manned().length };
  }, gate);
  expect(watch.manned).toBe(watch.posts);
  // nothing new went into the save
  const snap = await page.evaluate(() => JSON.stringify(window.farhold.snapshot?.() || {}));
  expect(snap).not.toMatch(/doorState|knock|gateShut/);
  expect(errors).toEqual([]);
});
