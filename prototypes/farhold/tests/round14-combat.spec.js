// Round 14 driven through the real page: a swing that lands has weight.
//
// The node tests cover the arithmetic; this is the half that can only be checked in a browser —
// that the arc is actually drawn, that the body it hit actually moves, that the camera actually
// takes a knock and comes back, and that none of it throws.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('a swing draws its arc, and a heavy one draws more than a light one', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const { STRIKES, withArea } = await import('/prototypes/farhold/js/weapons.js');
    f.field.clear();
    const before = f.fx.stats();
    // a jab, then a smash, through the same path a real swing takes
    withArea(STRIKES.jab, 0);
    f.fx.swipe({ x: f.control.x, y: f.control.y, z: f.control.z, yaw: f.control.yaw, reach: 2, arc: 0.6 });
    const afterJab = f.fx.stats();
    withArea(STRIKES.slam, 0);
    f.fx.swipe({ x: f.control.x, y: f.control.y, z: f.control.z, yaw: f.control.yaw, reach: 3, arc: 1.4 });
    const afterSlam = f.fx.stats();
    return { before, afterJab, afterSlam };
  });
  expect(errors).toEqual([]);
  expect(out.afterJab.swipesLive).toBeGreaterThan(out.before.swipesLive);
  // a slam kicks up dust at the feet; a jab does not
  expect(out.afterSlam.puffsLive).toBeGreaterThan(out.afterJab.puffsLive);
});

test('an overhead throws a body back and a jab does not', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const { STRIKES, withArea } = await import('/prototypes/farhold/js/weapons.js');
    f.field.clear();

    /** Put an enemy right in front of the player and swing one named shape at it. */
    const run = async (shapeKey) => {
      const e = await f.spawn('cairn_rat', 1);
      if (!e) return null;
      const [dx, dz] = f.control.facing();
      e.x = f.control.x + dx * 1.6;
      e.z = f.control.z + dz * 1.6;
      e.hp = e.maxHp = 100000;                   // it must survive to be pushed
      const from = { x: e.x, z: e.z };
      withArea(STRIKES[shapeKey], 0);
      f.field.strike(f.control, f.player, { reach: 4, arc: 3, power: STRIKES[shapeKey].damage });
      // the body must not walk toward you while we are measuring how far it was thrown
      e.speed = 0;
      /**
       * BOOKED, then TRAVELLED. How far it actually goes depends on what is behind it — a body with
       * a wall at its back absorbs the blow and takes damage instead, which is the rule — and where
       * the player happens to be standing varies with the seed. The booked distance is the thing
       * the strike shape decides, so that is what the ordering is asserted on; `moved` says the
       * knockback is really being applied and not merely written down.
       */
      const booked = e.push ? e.push.metres : 0;
      const stagger = e.stagger || 0;
      for (let i = 0; i < 30; i++) f.field.update(1 / 60, f.control, f.player, {});
      const moved = Math.hypot(e.x - from.x, e.z - from.z);
      f.field.clear();
      return { booked, stagger, moved };
    };

    const jab = await run('jab');
    const overhead = await run('overhead');
    const slam = await run('slam');
    return { jab, overhead, slam };
  });
  expect(errors).toEqual([]);
  expect(out.overhead.booked).toBeGreaterThan(out.jab.booked);
  expect(out.slam.booked).toBeGreaterThan(out.overhead.booked);
  expect(out.slam.booked).toBeGreaterThan(2);
  // and at least one of them really travelled, so the book is not the whole of it
  expect(out.jab.moved + out.overhead.moved + out.slam.moved).toBeGreaterThan(0.1);
  expect(out.slam.stagger).toBeGreaterThan(0.4);
  expect(out.jab.stagger).toBe(0);
});

test('the camera takes a knock and settles, and the world holds still for a moment', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const { STRIKES } = await import('/prototypes/farhold/js/weapons.js');
    const { feel } = await import('/prototypes/farhold/js/combat-feel.js');
    feel.reset();
    feel.setEnabled({ hitStop: true, screenShake: true });
    const start = f.camera.position.clone();
    feel.hit({ strike: STRIKES.slam, fromX: f.control.x, fromZ: f.control.z, toX: f.control.x + 3, toZ: f.control.z });
    const held = feel.scale;
    let biggest = 0;
    for (let i = 0; i < 20; i++) {
      feel.advance(1 / 60);
      const o = feel.cameraOffset();
      biggest = Math.max(biggest, Math.hypot(o[0], o[1], o[2]));
    }
    feel.advance(0.5);
    const settled = Math.hypot(...feel.cameraOffset());
    return { held, biggest, settled, scale: feel.scale, start: [start.x, start.y, start.z] };
  });
  expect(errors).toEqual([]);
  expect(out.held).toBeLessThan(0.2);          // the world nearly stops on a smash
  expect(out.biggest).toBeGreaterThan(0.005);  // and the camera moved
  expect(out.biggest).toBeLessThanOrEqual(0.13);
  expect(out.settled).toBe(0);                 // …and came back
  expect(out.scale).toBe(1);
});

test('a steel sword draws an impact at last, and a kill draws one too', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.field.clear();
    const e = await f.spawn('cairn_rat', 1);
    const [dx, dz] = f.control.facing();
    e.x = f.control.x + dx * 1.5; e.z = f.control.z + dz * 1.5;
    e.hp = e.maxHp = 100000;
    /**
     * COUNT THE CALLS, not the live pool. `spellfx.stats().live` decays on its own clock, so under
     * load a pooled effect could be reaped between the two reads and the test would go red for a
     * reason that has nothing to do with whether a sword draws an impact.
     */
    let impacts = 0, kills = 0;
    const real = f.spellfx.impact.bind(f.spellfx);
    f.spellfx.impact = (opts) => { impacts++; if (opts?.crit) kills++; return real(opts); };
    f.field.strike(f.control, f.player, { reach: 4, arc: 3, element: 'physical' });
    const afterHit = impacts;
    e.hp = 1;
    f.field.strike(f.control, f.player, { reach: 4, arc: 3, element: 'physical' });
    const afterKill = impacts;
    f.spellfx.impact = real;
    f.field.clear();
    return { afterHit, afterKill, kills, has: !!f.spellfx };
  });
  expect(errors).toEqual([]);
  // an ordinary steel sword hit drew nothing at all before round 14
  expect(out.afterHit).toBeGreaterThan(0);
  // …and a kill drew nothing either
  expect(out.afterKill).toBeGreaterThan(out.afterHit);
  expect(out.kills).toBeGreaterThan(0);
});

test('every weapon family equips, draws a body, and swings without throwing', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.player.level = 40;
    f.rpg.refresh(f.player, { full: true });
    const tried = [];
    for (const key of ['dagger', 'sword', 'longsword', 'greatsword', 'sword2h', 'axe2h', 'battleaxe',
      'hammer', 'warhammer', 'iron_mace', 'halberd', 'spear', 'javelin', 'rapier', 'obsidian_scimitar',
      'quarterstaff', 'staff', 'wand', 'scepter', 'bow', 'crossbow']) {
      const item = f.give(key, 'rare', { level: 10 });
      if (!item) continue;
      f.player.equipment.weapon = item;
      f.rpg.refresh(f.player);
      await new Promise(r => setTimeout(r, 30));
      const plan = f.player.derived.swing?.main;
      tried.push({
        key,
        clip: plan?.steps?.[0]?.clip || null,
        hold: plan?.hold || null,
        steps: plan?.steps?.length || 0,
        wind: Math.round(plan?.steps?.[0]?.windMs || 0),
      });
      f.hit();
    }

    /**
     * …and, on the same page, the wind-up itself: press, count the frames until the damage lands.
     * A dagger is out and back before you register it; a greatsword is a decision.
     */
    const windOf = (key) => {
      const item = f.give(key, 'normal', { level: 5 });
      f.player.equipment.weapon = item;
      f.player.equipment.offhand = null;
      f.rpg.refresh(f.player);
      const c = f.control;
      c.windLeft = 0; c.attackCooldown = 0; c.mainStep = 0; c.recoverLeft = 0; c.buffered = 0; c.held = 0;
      const snap = { forward: 0, strafe: 0, run: false, jump: false, attack: true, look: [0, 0], pressed: new Set(), keys: new Set() };
      let pressedAt = null;
      for (let i = 0; i < 200; i++) {
        // main.js keeps the per-hand clock in step every frame; do the same here
        const plan = f.player.derived.swing?.main;
        const sp = plan.steps[c.mainStep % plan.steps.length];
        c.mainEvery = sp.every;
        const step = c.update(1 / 60, snap, {});
        if (pressedAt == null && c.windLeft > 0) pressedAt = i;
        if (step.attacked) return pressedAt == null ? 0 : (i - pressedAt) / 60;
      }
      return null;
    };
    const wind = { dagger: windOf('dagger'), greatsword: windOf('greatsword') };
    return { tried, wind };
  });
  expect(errors).toEqual([]);
  const rows = out.tried;
  expect(rows.length).toBeGreaterThan(18);
  for (const row of rows) {
    expect(row.steps, `${row.key} has no swing plan`).toBeGreaterThan(0);
    expect(row.clip, `${row.key} has no clip`).toBeTruthy();
  }
  // the promises, read back off the live sheet
  expect(rows.find(r => r.key === 'bow').hold).toBe('draw');
  expect(rows.find(r => r.key === 'staff').hold).toBe('charge');
  expect(rows.find(r => r.key === 'quarterstaff').hold).toBe(null);
  expect(rows.find(r => r.key === 'greatsword').wind).toBeGreaterThan(rows.find(r => r.key === 'dagger').wind * 2);
  // …and the swing really does take that long in the controller, not just on the sheet
  expect(out.wind.dagger).toBeGreaterThan(0);
  expect(out.wind.greatsword).toBeGreaterThan(out.wind.dagger * 2);
});

test('a bow is drawn: a click looses a weak shot, holding looses a strong one', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.player.level = 30;
    f.rpg.refresh(f.player, { full: true });
    const bow = f.give('bow', 'normal', { level: 5 });
    f.player.equipment.weapon = bow;
    f.player.equipment.offhand = null;
    f.rpg.refresh(f.player);

    /** Drive the controller by hand: `held` frames of the button down, then let go. */
    const loose = (frames) => {
      const c = f.control;
      c.held = 0; c.windLeft = 0; c.attackCooldown = 0; c.charge = null;
      const snap = { forward: 0, strafe: 0, run: false, jump: false, attack: true, look: [0, 0], pressed: new Set(), keys: new Set() };
      const fired = [];
      for (let i = 0; i < frames; i++) {
        const step = c.update(1 / 60, snap, {});
        if (step.attacked) fired.push({ frame: i, power: step.power, held: true });
      }
      snap.attack = false;
      for (let i = 0; i < 90 && !fired.length; i++) {
        const step = c.update(1 / 60, snap, {});
        if (step.attacked) fired.push({ frame: frames + i, power: step.power, held: false });
      }
      return fired[0] || null;
    };

    const tap = loose(1);              // one frame of the button, then let go
    const full = loose(120);           // two seconds of holding: past full draw
    return { tap, full, hold: f.player.derived.swing?.main?.hold };
  });
  expect(errors).toEqual([]);
  expect(out.hold).toBe('draw');
  // a click is not thrown away: it draws itself to the nock and looses a weak shot
  expect(out.tap).not.toBe(null);
  // …and holding is worth a great deal more
  expect(out.full).not.toBe(null);
  expect(out.full.power).toBeGreaterThan(out.tap.power * 2);
  expect(out.full.power).toBeGreaterThan(1.5);
});
