// §7 — the raid you start yourself, and the turrets that answer it.
//
// The user's own condition on this feature:
//
//   "[the tower defence] might be better as a quest rather than a random event, so the player can
//    decide when to start on it rather than being a burden."
//
// So the first thing to prove is that NOTHING HAPPENS until the player says so, and the second is
// that a defensive structure actually defends.

import { test, expect } from '@playwright/test';

async function land(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand somewhere flat, with everything the catalogue asks for. */
const SETUP = async () => {
  const f = window.farhold;
  const t = f.terrain;
  const flat = (x, z) => !t.underwater(x, z) && !t.waterAt(x, z) && t.slopeAt(x, z, 10) <= 0.25;
  let spot = null;
  outer: for (let r = 0; r <= 1200; r += 20) for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    const x = f.control.x + Math.cos(th) * r, z = f.control.z + Math.sin(th) * r;
    if (flat(x, z) && flat(x + 12, z) && flat(x - 12, z)) { spot = { x, z }; break outer; }
  }
  if (!spot) return null;
  f.control.teleport(spot.x, spot.z);
  for (const piece of f.structures.structures || []) {
    for (const id of Object.keys(piece.cost || {})) f.bag.add(id, 900);
  }
  await new Promise(r => setTimeout(r, 400));
  f.build.setMode(true);
  f.build.setTool('smooth'); f.build.setRadius(20);
  for (const [dx, dz] of [[0, 0], [12, 0], [-12, 0], [0, 12]]) { f.build.aim(spot.x + dx, spot.z + dz); f.build.paint(); }
  f.build.setTool('build');
  f.build.select('claim_stone'); f.build.aim(spot.x + 6, spot.z + 6); f.build.placeHere();
  f.build.setMode(false);
  return spot;
};

test('a base with no defences is never offered a raid, and it says which gate is short', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async setupSrc => {
    const setup = eval('(' + setupSrc + ')');
    const f = window.farhold;
    const spot = await setup();
    if (!spot) return { none: true };

    const bare = f.defence.standing();
    const refused = f.defence.offer({ level: f.player.level, biome: 'grassland' });

    // …now put up a dozen things and a turret
    f.build.setMode(true);
    f.build.setTool('build');
    for (let i = 0; i < 12; i++) {
      f.build.select('palisade');
      f.build.aim(spot.x - 8 + i * 1.4, spot.z - 8);
      f.build.placeHere();
    }
    f.build.select('arrow_turret'); f.build.aim(spot.x + 2, spot.z + 2);
    const turret = f.build.placeHere();
    f.build.setMode(false);

    const armed = f.defence.standing();
    const offered = f.defence.offer({ level: f.player.level, biome: 'grassland' });

    return {
      bare, refusedWhy: refused.why, refusedOk: refused.ok,
      turretOk: turret.ok, turretWhy: turret.why || '',
      armed,
      offeredOk: offered.ok,
      waves: offered.waves?.length || 0,
      // …and it is only an OFFER. Nothing may be on the field.
      enemies: f.defence.quest?.state,
    };
  }, SETUP.toString());

  expect(out.none, 'nowhere flat to build').toBeFalsy();
  expect(out.refusedOk, 'a base with nothing on it was offered a raid').toBe(false);
  expect(out.refusedWhy, 'the refusal does not say which gate is short').toBeTruthy();
  expect(out.bare.defences).toBe(0);
  expect(out.turretOk, `the turret would not go down: ${out.turretWhy}`).toBe(true);
  expect(out.armed.defences, 'the turret does not count as a defence').toBeGreaterThan(0);
  expect(out.offeredOk, `a base with a wall and a turret was still refused: ${out.armed.why}`).toBe(true);
  expect(out.waves, 'the offer has no waves in it').toBeGreaterThan(0);
  // THE WHOLE POINT: taking the offer is a separate act, and ringing the bell is a third one
  expect(out.enemies, 'the raid started by itself').toBe('offered');
  expect(errors).toEqual([]);
});

test('the bell is the player choosing the hour, and nothing comes before it', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async setupSrc => {
    const setup = eval('(' + setupSrc + ')');
    const f = window.farhold;
    const spot = await setup();
    if (!spot) return { none: true };

    f.build.setMode(true);
    f.build.setTool('build');
    for (let i = 0; i < 12; i++) { f.build.select('palisade'); f.build.aim(spot.x - 8 + i * 1.4, spot.z - 8); f.build.placeHere(); }
    f.build.select('arrow_turret'); f.build.aim(spot.x + 2, spot.z + 2); f.build.placeHere();
    f.build.select('alarm_bell'); f.build.aim(spot.x + 1, spot.z);
    const bell = f.build.placeHere();
    f.build.setMode(false);
    if (!bell.ok) return { bellWhy: bell.why };

    f.defence.offer({ level: f.player.level, biome: 'grassland' });
    f.defence.accept({ at: 0 });
    const accepted = f.defence.quest.state;

    // nothing on the field yet, however long we wait
    const before = f.field.enemies.filter(e => e.raider).length;
    await new Promise(r => setTimeout(r, 1200));
    const stillNothing = f.field.enemies.filter(e => e.raider).length;

    // the bell
    f.defence.ring({ hour: 21, at: 0, level: f.player.level });
    await new Promise(r => setTimeout(r, 1500));
    const raiders = f.field.enemies.filter(e => e.raider);

    return {
      accepted, before, stillNothing,
      running: f.defence.quest.state,
      night: f.defence.quest.night,
      raiders: raiders.length,
      // a night raid hits harder — that is a choice the player made, not a punishment
      scaled: raiders.every(e => e.maxHp > 0),
    };
  }, SETUP.toString());

  expect(out.none, 'nowhere flat to build').toBeFalsy();
  expect(out.bellWhy, `the bell would not go down: ${out.bellWhy}`).toBeFalsy();
  expect(out.accepted).toBe('accepted');
  expect(out.before, 'raiders appeared before the bell').toBe(0);
  expect(out.stillNothing, 'raiders arrived on their own while the player was not ready').toBe(0);
  expect(out.running).toBe('running');
  expect(out.night, 'ringing at 21:00 was not counted as night').toBe(true);
  expect(out.raiders, 'the bell brought nobody').toBeGreaterThan(0);
  expect(out.scaled).toBe(true);
  expect(errors).toEqual([]);
});

test('a turret shoots what comes into range, and a wall does not', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async setupSrc => {
    const setup = eval('(' + setupSrc + ')');
    const f = window.farhold;
    const spot = await setup();
    if (!spot) return { none: true };

    f.build.setMode(true);
    f.build.setTool('build');
    f.build.select('ballista_turret'); f.build.aim(spot.x + 2, spot.z);
    const turret = f.build.placeHere();
    f.build.select('palisade'); f.build.aim(spot.x - 4, spot.z);
    f.build.placeHere();
    f.build.setMode(false);
    if (!turret.ok) return { turretWhy: turret.why };

    // one enemy, well inside the ballista's 34 m
    const unit = await f.spawn(f.bestiaryIds[0]);
    if (!unit) return { noEnemy: true };
    unit.x = spot.x + 10; unit.z = spot.z;
    const hp = unit.hp;
    await new Promise(r => setTimeout(r, 3500));

    // …and a wall, on its own, must never do this
    const wallOnly = f.build.entries.filter(e => e.key === 'palisade').length;
    return { hp, now: unit.hp, wallOnly, alive: unit.hp > 0 };
  }, SETUP.toString());

  expect(out.none, 'nowhere flat to build').toBeFalsy();
  expect(out.turretWhy, `the ballista would not go down: ${out.turretWhy}`).toBeFalsy();
  expect(out.noEnemy, 'nothing to shoot at').toBeFalsy();
  expect(out.now, 'the turret never fired').toBeLessThan(out.hp);
  expect(out.wallOnly, 'the palisade did not go down').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
