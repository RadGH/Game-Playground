// node --test prototypes/farhold/tests/skills.test.js
// Phase 3's fight. Cooldowns must actually block, mana must actually run out, a status must
// actually kill something if you leave it burning long enough, and every class must get four
// skills that exist.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inertTalents } from '../js/skilltalents.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSkillBar, applyStatus, tickStatuses, slowOf, buffsOf } from '../js/skills.js';
import { Rpg } from '../js/rpg.js';


const here = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(here, p), 'utf8'));
const items = read('../../emberveil/data/items.json');
const balance = read('../data/balance.json');
const data = read('../data/skills.json');

// spellfx.js imports three, which node cannot resolve, so the element names are read out of its
// source instead. That is the point of the check: the two files must agree.
const ELEMENTS = Object.fromEntries(
  readFileSync(join(here, '../../../avatar-3d/js/spellfx.js'), 'utf8')
    .split('export const ELEMENTS = {')[1].split('\n};')[0]
    .split('\n').map(l => l.match(/^\s*(\w+):\s*\{/)).filter(Boolean).map(m => [m[1], true]));

const bar = (classId = 'mage', level = 12) => {
  const rpg = new Rpg(items, balance);
  const player = rpg.createPlayer({ classId, level });
  player.mp = player.maxMp;
  return { rpg, player, skills: createSkillBar({ data, player, rpg }) };
};

test('every class gets six skills and every skill is real', () => {
  const classes = Object.keys(data.classes);
  assert.ok(classes.length >= 30, 'a skill set for every one of the thirty classes');
  for (const [id, list] of Object.entries(data.classes)) {
    assert.equal(list.length, 6, `${id} has six`);
    assert.equal(new Set(list).size, 6, `${id} has the same skill twice`);
    for (const key of list) assert.ok(data.skills[key], `${id} asks for ${key}, which does not exist`);
  }
  assert.equal(data.unlockAt.length, 6, 'six slots need six unlock levels');
  for (let i = 1; i < data.unlockAt.length; i++) {
    assert.ok(data.unlockAt[i] > data.unlockAt[i - 1], 'unlock levels must climb');
  }
});

test('every class in classes.json can actually be played', () => {
  const classes = JSON.parse(readFileSync(join(here, '../data/classes.json'), 'utf8')).classes;
  assert.equal(classes.length, 30);
  const weaponBases = { ...items.weaponBases, ...items.armorBases };
  for (const c of classes) {
    assert.ok(data.classes[c.id], `${c.id} has no skill set`);
    assert.ok(weaponBases[c.starter], `${c.id} starts with ${c.starter}, which is not a real base`);
    for (const k of c.startingArmour || []) assert.ok(weaponBases[k], `${c.id} starts in ${k}, which is not real`);
    assert.ok(c.look && c.name && c.role, `${c.id} is missing its look or its name`);
  }
});

test('every skill names a real element and a shape the game can draw', () => {
  const shapes = new Set(['melee', 'around', 'bolt', 'beam', 'ground', 'dash', 'summon', 'self']);
  for (const [key, s] of Object.entries(data.skills)) {
    assert.ok(ELEMENTS[s.element], `${key} uses ${s.element}, which SpellFx does not know`);
    assert.ok(shapes.has(s.shape), `${key} is shaped "${s.shape}"`);
    if (s.status) assert.ok(data.statuses[s.status], `${key} applies ${s.status}, which is not defined`);
    assert.ok(s.cooldown > 0, `${key} has no cooldown`);
    assert.ok(s.name && s.desc, `${key} has no name or description`);
  }
});

test('a skill on cooldown cannot be used again until it comes back', () => {
  const { skills } = bar('warrior');
  const first = skills.use(0);
  assert.equal(first.ok, true);
  assert.equal(skills.use(0).ok, false, 'straight away is too soon');
  skills.update(first.skill.cooldown - 0.1);
  assert.equal(skills.check(0).ok, false, 'still a fraction short');
  skills.update(0.2);
  assert.equal(skills.check(0).ok, true);
});

test('mana is spent and runs out', () => {
  const { player, skills } = bar('mage');
  player.mp = 10;
  const firebolt = skills.slots.findIndex(s => s.id === 'firebolt');
  const before = player.mp;
  assert.equal(skills.use(firebolt).ok, true);
  assert.equal(player.mp, before - data.skills.firebolt.mp);
  const nova = skills.slots.findIndex(s => s.id === 'frost_nova');
  const blocked = skills.use(nova);
  assert.equal(blocked.ok, false);
  assert.match(blocked.why, /mana/i);
});

test('a skill hits harder than a bare swing', () => {
  const { skills } = bar('warrior');
  const plan = skills.use(0);
  assert.ok(plan.mult > 1, 'Power Strike is a heavy blow, not a normal one');
  assert.ok(plan.damage >= 1);
});

test('a burn ticks, expires, and can finish something off', () => {
  const foe = { hp: 6, maxHp: 30 };
  applyStatus(foe, 'burn', data.statuses.burn, 10);
  let dealt = 0, t = 0;
  while (t < 6) { dealt += tickStatuses(foe, 0.25); t += 0.25; }
  assert.ok(dealt > 5, `a burn of power 10 over its life dealt only ${dealt}`);
  assert.equal(foe.hp, 0, 'it burned to death');
  assert.deepEqual(Object.keys(foe.statuses), [], 'and the burn ran out');
});

test('a second burn refreshes rather than stacking', () => {
  const foe = { hp: 100, maxHp: 100 };
  applyStatus(foe, 'burn', data.statuses.burn, 4);
  tickStatuses(foe, 3);
  applyStatus(foe, 'burn', data.statuses.burn, 4);
  assert.equal(Object.keys(foe.statuses).length, 1);
  assert.equal(foe.statuses.burn.remaining, data.statuses.burn.seconds);
});

test('a chill slows and buffs add up', () => {
  const foe = { hp: 50, maxHp: 50 };
  assert.equal(slowOf(foe), 0);
  applyStatus(foe, 'chill', data.statuses.chill, 1);
  assert.equal(slowOf(foe), data.statuses.chill.slow);
  assert.equal(tickStatuses(foe, 0.5), 0, 'a chill does no damage');

  const me = { hp: 50, maxHp: 50 };
  applyStatus(me, 'might', data.statuses.might, 1);
  applyStatus(me, 'guard', data.statuses.guard, 1);
  const b = buffsOf(me);
  assert.equal(b.damage, data.statuses.might.damage);
  assert.equal(b.resist, data.statuses.guard.resist);
  assert.ok(b.resist < 1, 'no amount of buffs makes you immune');
});

test('Mend heals a share of your health and War Cry buffs instead of hitting', () => {
  const { player, skills } = bar('cleric');
  player.hp = 1;
  const mend = skills.slots.findIndex(s => s.id === 'mend');
  const plan = skills.use(mend);
  assert.equal(plan.kind, 'self');
  assert.ok(plan.heal > 0 && plan.heal <= player.maxHp);

  const guard = skills.slots.findIndex(s => s.id === 'guard_stance');
  const guardPlan = skills.use(guard);
  assert.equal(guardPlan.heal, 0);
  assert.equal(guardPlan.status, 'guard');
});

test('a skill locked by level cannot be used, and unlocks when you reach it', () => {
  const low = bar('mage', 1);
  const state = low.skills.state();
  assert.equal(state[0].locked, false, 'the first skill is available from level 1');
  assert.ok(state[5].locked, 'the last slot should not be open at level 1');
  assert.equal(low.skills.use(5).ok, false);
  const high = bar('mage', 30);
  assert.ok(high.skills.state().every(s => !s.locked), 'everything should be open at level 30');
});

test('cooldown reduction and mana-cost cuts come off the bar, not off the data', () => {
  const { player, skills } = bar('mage', 20);
  const raw = skills.slots[0];
  const full = skills.cooldownFor(raw);
  player.derived.cooldownReduction = 50;
  assert.ok(skills.cooldownFor(raw) < full * 0.55, 'cooldown reduction did nothing');
  assert.ok(skills.cooldownFor(raw) >= 0.5, 'a cooldown must never reach zero');
});

test('the bar reports what the HUD needs to draw', () => {
  const { skills } = bar('ranger', 30);
  const state = skills.state();
  assert.equal(state.length, 6);
  assert.ok(state.every(s => s.usable), 'everything is ready at the start of a fight');
  skills.use(0);
  assert.equal(skills.state()[0].usable, false);
  assert.ok(skills.state()[0].ready > 0);
});

/**
 * R18 — THE AUDIT THIS FILE ALREADY HAD, GIVEN A CALLER.
 *
 * js/skilltalents.js exports `inertTalents()`, which walks every talent and reports the `mod` keys
 * nothing implements. It had ZERO callers — an audit written to catch exactly this project's
 * signature fault, itself never run, which is that fault wearing its own uniform. And it was stale:
 * `barrier`/`barrierSeconds` sat on its pending list from round 7 until R18 finally granted a
 * barrier off a cast, so Bulwark spent a talent point and did nothing for eleven rounds.
 *
 * This is the caller. The list is allowed to be non-empty — a talent may honestly be waiting on a
 * mechanic — but it has to be DECLARED, so a new inert talent fails and a fixed one has to be taken
 * off `PENDING_MODS` deliberately.
 */
test('R18 — no talent is inert except the ones this test names', () => {
  const inert = inertTalents();
  /**
   * Known to be waiting on a mechanic, with the reason. Anything else is a talent that takes a
   * point and gives nothing, which is the bug.
   */
  const ALLOWED = new Set([
    // `seeking` wants `homing`, and a projectile in this game cannot steer: js/combat-fx.js fires a
    // bolt along a fixed ray. That is a real mechanic to build, not a join to make, and it is the
    // only talent on this list — the other five were all working already and the audit was stale
    // about every one of them.
    'seeking',
  ]);
  const surprises = inert.filter(t => !ALLOWED.has(t.id));
  assert.deepEqual(surprises.map(t => `${t.id} (${t.missing.join(', ')})`), [],
    'these talents grant fields nothing reads — implement them, or add the id to ALLOWED with a '
    + 'reason:\n  ' + surprises.map(t => `${t.id}: ${t.missing.join(', ')}`).join('\n  '));
});
