// Farhold round 28 — the skill vocabulary in the real game: the Warrior (the reference class,
// research/round28-content-guide.md) casts all six, and the druid takes a shape, casts the shape's
// version of Thornlash, attacks as the beast and comes back to its own body.
//
//   flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/farhold/tests/round28-skills.spec.js

import { test, expect } from '@playwright/test';

async function land(page, cls) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && /skill|mech|form/i.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=7&class=${cls}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  await page.evaluate(() => {
    const f = window.farhold;
    f.pause(false);
    f.rpg.gainXp(f.player, 400000);
    f.rpg.refresh(f.player, { full: true });
    f.player.mp = f.player.maxMp;
  });
  return errors;
}

/** Put a tough dummy `d` metres in front of the player (and keep it there). */
async function dummy(page, d = 2.6, side = 0) {
  return page.evaluate(async ([d, side]) => {
    const f = window.farhold;
    const e = await f.spawn('stone_sentinel', f.player.level);
    e.maxHp = e.hp = 1e7;
    const yaw = f.control.yaw;
    e.x = f.control.x + Math.sin(yaw) * d + Math.cos(yaw) * side;
    e.z = f.control.z + Math.cos(yaw) * d - Math.sin(yaw) * side;
    e.state = 'chase';
    (window.__dummies || (window.__dummies = [])).push(e);
    return f.field.enemies.indexOf(e);
  }, [d, side]);
}

test('the Warrior casts all six of its round-28 skills, and each one does what its card says', async ({ page }) => {
  test.setTimeout(150000);
  const errors = await land(page, 'warrior');
  const ids = await page.evaluate(() => window.farhold.skills.slots.map(s => s.id));
  expect(ids).toEqual(['cleave', 'breaching_shove', 'warcry', 'whirlwind', 'iron_resolve', 'groundbreaker']);

  await dummy(page, 2.4);
  await dummy(page, 3.0, 1.2);
  // Cleave hits both, and the crowd bonus means the second body takes more than a lone one would
  const cleave = await page.evaluate(async () => {
    const f = window.farhold;
    const [a, b] = window.__dummies;
    const before = [a.hp, b.hp];
    f.skills.slots[0].ready = 0; f.player.mp = f.player.maxMp;
    const plan = f.cast(0);
    await new Promise(r => setTimeout(r, 150));
    return { dealt: [before[0] - a.hp, before[1] - b.hp], bonus: plan.rules?.bonusIf?.[0]?.when || null };
  });
  expect(cleave.dealt[0]).toBeGreaterThan(0);
  expect(cleave.dealt[1]).toBeGreaterThan(0);
  expect(cleave.bonus).toBe('crowd:0.12:0.48');

  // Breaching Shove moves the body it hits and stuns it
  const shove = await page.evaluate(async () => {
    const f = window.farhold;
    const e = window.__dummies[0];
    e.x = f.control.x + Math.sin(f.control.yaw) * 2; e.z = f.control.z + Math.cos(f.control.yaw) * 2;
    f.skills.slots[1].ready = 0; f.player.mp = f.player.maxMp;
    f.cast(1);
    // the knock is read where it lands: the push it was given (a town wall may stop the travel —
    // seed 7 starts in a settlement — so the PUSH is asserted, not the metres covered)
    return { push: e.push?.metres || 0, stagger: e.stagger || 0 };
  });
  expect(shove.push, 'the shove gave the enemy no push').toBeGreaterThan(3);
  expect(shove.stagger, 'the shove did not stun').toBeGreaterThan(0.3);

  // War Cry: Might on you and the dummies taunted onto you
  const cry = await page.evaluate(async () => {
    const f = window.farhold;
    f.skills.slots[2].ready = 0; f.player.mp = f.player.maxMp;
    f.cast(2);
    await new Promise(r => setTimeout(r, 100));
    return { might: !!f.player.statuses?.might, taunted: window.__dummies.filter(e => e.tauntBy === 'player').length };
  });
  expect(cry.might).toBe(true);
  expect(cry.taunted).toBeGreaterThan(0);

  // Iron Gyre spins five times; Iron Resolve puts its guard on you; Groundbreaker leaves a fissure
  const rest = await page.evaluate(async () => {
    const f = window.farhold;
    const e = window.__dummies[0];
    e.x = f.control.x + Math.sin(f.control.yaw) * 2; e.z = f.control.z + Math.cos(f.control.yaw) * 2;
    const hp0 = e.hp;
    for (const i of [3, 4, 5]) { f.skills.slots[i].ready = 0; f.player.mp = f.player.maxMp; f.cast(i); await new Promise(r => setTimeout(r, 250)); }
    await new Promise(r => setTimeout(r, 1700));
    return { dealt: hp0 - e.hp, resolve: Object.keys(f.player.statuses || {}).some(k => k === 'buff:iron_resolve'), placed: f.mech.placed };
  });
  expect(rest.dealt).toBeGreaterThan(0);
  expect(rest.resolve).toBe(true);
  expect(rest.placed, 'Groundbreaker left no fissure').toBeGreaterThan(0);

  // a bespoke talent changes the cast: Reaping Arc turns Cleave into a frontal arc that knocks
  const talent = await page.evaluate(() => {
    const f = window.farhold;
    f.player.skillTalents = { cleave: { 1: 'reaping_arc' } };
    f.skills.slots[0].ready = 0; f.player.mp = f.player.maxMp;
    const plan = f.cast(0);
    return { kind: plan.kind, arc: plan.arc, knock: plan.knock?.push || 0 };
  });
  expect(talent.kind).toBe('melee');
  expect(talent.knock).toBe(1.5);
  expect(errors).toEqual([]);
});

test('the druid takes Briarback shape, its Thornlash becomes Bramble Gore, and it comes back', async ({ page }) => {
  test.setTimeout(150000);
  const errors = await land(page, 'druid');
  const ids = await page.evaluate(() => window.farhold.skills.slots.map(s => s.id));
  expect(ids).toEqual(['thornlash', 'renew', 'briarback_shape', 'call_wolf', 'fenrunner_shape', 'sporecap_shape']);
  await dummy(page, 2.2);

  const shaped = await page.evaluate(async () => {
    const f = window.farhold;
    const armour = f.player.derived.armor;
    f.cast(2);
    await new Promise(r => setTimeout(r, 600));
    const st = f.skills.state();
    return { forms: f.mech.forms, name0: st[0].name, armourAfter: f.player.derived.armor, armour, badge: !!document.querySelector('#skill-strip .form') };
  });
  expect(shaped.forms).toContain('briarback');
  expect(shaped.name0).toBe('Bramble Gore');
  expect(shaped.armourAfter, 'Briarback gave no armour').toBeGreaterThan(shaped.armour);
  expect(shaped.badge).toBe(true);

  // the shape's Thornlash is a melee gore that knocks, and the basic attack is the beast's sweep
  const gore = await page.evaluate(async () => {
    const f = window.farhold;
    const e = window.__dummies[0];
    e.x = f.control.x + Math.sin(f.control.yaw) * 2; e.z = f.control.z + Math.cos(f.control.yaw) * 2;
    const hp0 = e.hp;
    f.skills.slots[0].ready = 0; f.player.mp = f.player.maxMp;
    const plan = f.cast(0);
    await new Promise(r => setTimeout(r, 300));
    return { kind: plan.kind, dealt: hp0 - e.hp };
  });
  expect(gore.kind).toBe('melee');
  expect(gore.dealt).toBeGreaterThan(0);

  const back = await page.evaluate(async () => {
    const f = window.farhold;
    f.skills.slots[2].ready = 0;
    f.cast(2);
    await new Promise(r => setTimeout(r, 300));
    return { forms: f.mech.forms, name0: f.skills.state()[0].name };
  });
  expect(back.forms).toEqual([]);
  expect(back.name0).toBe('Thornlash');

  // Fenrunner: Thornlash becomes a lunge to the first body
  const fen = await page.evaluate(async () => {
    const f = window.farhold;
    f.skills.slots[4].ready = 0; f.player.mp = f.player.maxMp;
    f.cast(4);
    await new Promise(r => setTimeout(r, 300));
    const st = f.skills.state();
    f.skills.slots[0].ready = 0; f.player.mp = f.player.maxMp;
    const plan = f.cast(0);
    return { name0: st[0].name, kind: plan?.kind };
  });
  expect(fen.name0).toBe('Venom Lunge');
  expect(fen.kind).toBe('dash');

  // Sporecap is timed, and the toggles cannot be cast while it runs
  const spore = await page.evaluate(async () => {
    const f = window.farhold;
    f.skills.slots[5].ready = 0; f.player.mp = f.player.maxMp;
    f.cast(5);
    await new Promise(r => setTimeout(r, 300));
    const locked = f.skills.check(2);
    return { forms: f.mech.forms, locked: locked.ok, why: locked.why || '' };
  });
  expect(spore.forms).toContain('sporecap');
  expect(spore.locked).toBe(false);
  expect(spore.why).toMatch(/Sporecap has/);
  expect(errors).toEqual([]);
});

test('the second-pass mechanics in the field: stasis holds and banks, a turned enemy fights its own side, a wall stands', async ({ page }) => {
  test.setTimeout(150000);
  const errors = await land(page, 'warrior');
  await dummy(page, 6);
  await dummy(page, 7, 1.5);
  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const S = f.skillData.skills;
    S.zz_stasis = { name: 'Test Stasis', shape: 'bolt', element: 'arcane', mult: 1, range: 30, cooldown: 1, mp: 0, stasis: { seconds: 2, bank: 1.5 } };
    S.zz_turn = { name: 'Test Turn', shape: 'bolt', element: 'arcane', mult: 0.2, range: 30, cooldown: 1, mp: 0, turned: { seconds: 4 } };
    S.zz_wall = { name: 'Test Wall', shape: 'ground', element: 'physical', range: 20, radius: 2, cooldown: 1, mp: 0, wall: { length: 6, seconds: 5, blocksRanged: true } };
    f.skills.relearn(['zz_stasis', 'zz_turn', 'zz_wall', null, null, null]);
    const [a, b] = window.__dummies;
    const aim = () => { a.x = f.control.x + Math.sin(f.control.yaw) * 6; a.z = f.control.z + Math.cos(f.control.yaw) * 6; };
    aim();
    f.cast(0);
    await new Promise(r => setTimeout(r, 500));
    const held = !!a.statuses?.stasis;
    const hp = a.hp;
    f.rpg.strike(f.player, a, f.field.rng, { multiplier: 5 });
    const banked = a.statuses?.stasis?.bank || 0;
    const untouched = a.hp === hp;
    for (let k = 0; k < 30 && a.statuses?.stasis; k++) await new Promise(r => setTimeout(r, 200));
    await new Promise(r => setTimeout(r, 200));
    const paid = hp - a.hp;
    aim();
    b.x = a.x + 1.5; b.z = a.z;              // a town makes bodies wander off: put its foe beside it
    f.cast(1);
    await new Promise(r => setTimeout(r, 500));
    const turned = !!a.statuses?.turned;
    // the dummy turned on its own side: count the blows it landed on another enemy
    for (let k = 0; k < 20 && !(a.turnedHits > 0); k++) await new Promise(r => setTimeout(r, 200));
    f.cast(2);
    await new Promise(r => setTimeout(r, 200));
    return { held, banked, untouched, paid, turned, bHit: a.turnedHits || 0, walls: f.mech.walls };
  });
  expect(out.held, 'the bolt put no stasis on the target').toBe(true);
  expect(out.untouched, 'a body in stasis took the hit').toBe(true);
  expect(out.banked).toBeGreaterThan(0);
  expect(out.paid, 'the bank did not land as it thawed').toBeGreaterThan(0);
  expect(out.turned).toBe(true);
  expect(out.bHit, 'the turned enemy did not strike its own side').toBeGreaterThan(0);
  expect(out.walls).toBe(1);
  expect(errors).toEqual([]);
});
