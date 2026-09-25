// node --test prototypes/farhold/tests/round26-skills.test.js
//
// Round 26 — "Power Strike does no damage on a level 1 fighter where my normal attack deals 8-10
// damage."
//
// The damage sum was never the problem (a 190% skill does 190%); the SHAPE was. A melee skill had a
// fixed reach and arc whatever was in your hand, while a basic swing is shaped by the weapon — a
// greatsword sweeps 4.6 m across 253°, Power Strike reached 3.4 m across 92°. So the enemy your free
// swing kept hitting could be standing outside the skill, and the skill landed on nothing.
//
// What this holds every class to, at level 1, with its own starter weapon and with a longsword and a
// greatsword in the fighter's hands:
//   1. every skill you can press at level 1 that deals damage deals MORE than nothing;
//   2. a damage skill is worth at least one ordinary swing of the same weapon, on average;
//   3. a melee skill reaches at least as far, and as wide, as the widest swing of the weapon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Rpg } from '../js/rpg.js';
import { createSkillBar } from '../js/skills.js';
import { strikeAt, profileOf, meleeSpanOf, isStaff, isWand } from '../js/weapons.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));
const skillData = read('data/skills.json');
const classData = read('data/classes.json');
const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
const balance = read('data/balance.json');

/** A level-1 character of this class holding `weaponKey` (default: the class's own starter). */
function character(classId, weaponKey = null) {
  const r = new Rpg(items, { ...balance, seed: 7 });
  const def = classData.classes.find(c => c.id === classId);
  const player = r.createPlayer({ classId, level: 1 });
  const key = weaponKey || def?.starter;
  if (key && items.weaponBases[key]) {
    const w = r.loot.generate(key, 'normal', 'medium', { rng: r.rng, level: 1 });
    if (w) r.equip(player, w, { force: true });
  }
  r.refresh(player, { full: true });
  player.mp = player.maxMp = 9999;
  return { r, player };
}

/** A dummy that takes everything and never dies, with a little armour like a level-1 beast. */
const dummy = () => ({ name: 'Dummy', hp: 1e9, maxHp: 1e9, armor: 4, magicResist: 0, derived: { resistAll: 0, thorns: 0, dodge: 0 } });

/** The average of `n` strikes at `multiplier`. */
function average(r, player, n, opts) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += r.strike(player, dummy(), r.rng, opts).amount;
  return sum / n;
}

/** One ordinary swing of the main hand, averaged over its whole pattern. */
function basicSwing(r, player) {
  const weapon = player.equipment.weapon;
  const p = profileOf(weapon);
  let total = 0;
  for (let i = 0; i < p.pattern.length; i++) total += average(r, player, 200, { multiplier: strikeAt(weapon, i).damage });
  return total / p.pattern.length;
}

/** Every slot a level-1 character can press that is meant to hurt something. */
function levelOneDamageSlots(bar) {
  return bar.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.empty && s.unlockAt <= 1 && s.mult && !['self', 'summon'].includes(s.shape));
}

function checkCharacter(label, classId, weaponKey = null) {
  const { r, player } = character(classId, weaponKey);
  const bar = createSkillBar({ data: skillData, player, rpg: r });
  const weapon = player.equipment.weapon;
  const basic = basicSwing(r, player);
  const out = [];
  for (const { s, i } of levelOneDamageSlots(bar)) {
    bar.slots[i].ready = 0;
    const plan = bar.use(i);
    assert.ok(plan.ok, `${label}: ${s.name} would not cast (${plan.why})`);
    const hit = average(r, player, 400, { multiplier: plan.mult, element: plan.element, skill: s.id });
    assert.ok(hit > 0, `${label}: ${s.name} did no damage`);
    if (plan.kind === 'melee' && !plan.breath) {
      // the rule from the report: a melee skill never reaches less than the weapon's free swing
      const span = meleeSpanOf(weapon);
      if (span) {
        assert.ok(plan.reach >= span.reach - 1e-9, `${label}: ${s.name} reaches ${plan.reach.toFixed(2)} m, the weapon swings ${span.reach.toFixed(2)} m`);
        assert.ok(plan.arc >= span.arc - 1e-9, `${label}: ${s.name} is ${plan.arc.toFixed(2)} rad wide, the weapon swings ${span.arc.toFixed(2)} rad`);
      }
      // …and on a blade, a skill with a cooldown is worth at least a swing that has none
      if (!isStaff(weapon) && !isWand(weapon)) {
        assert.ok(hit >= basic, `${label}: ${s.name} averages ${hit.toFixed(1)}, a plain swing ${basic.toFixed(1)}`);
      }
    }
    out.push({ id: s.id, hit, basic, plan });
  }
  return out;
}

test('every class, at level 1 with its own starter weapon: each damage skill it can press does damage', () => {
  let checked = 0;
  for (const c of classData.classes) {
    checked += checkCharacter(c.id, c.id).length;
  }
  assert.ok(checked >= classData.classes.length - 4, `only ${checked} level-1 damage skills were found — did the bars change?`);
});

test('the fighter\'s Power Strike, with a longsword and with a greatsword', () => {
  for (const key of ['longsword', 'greatsword']) {
    const rows = checkCharacter(`fighter + ${key}`, 'fighter', key);
    const ps = rows.find(x => x.id === 'power_strike');
    assert.ok(ps, `fighter + ${key}: Power Strike is not on slot 1`);
    // it should read as a big hit next to the swing, not "no damage"
    assert.ok(ps.hit >= ps.basic, `fighter + ${key}: Power Strike ${ps.hit.toFixed(1)} vs swing ${ps.basic.toFixed(1)}`);
    if (key === 'greatsword') {
      // the exact case from the report: the greatsword's sweep is 4.6 m wide across ~250°, and the
      // skill used to be 3.4 m across 92° — it now takes the weapon's span
      assert.ok(ps.plan.reach > 4.5, `Power Strike with a greatsword only reaches ${ps.plan.reach.toFixed(2)} m`);
      assert.ok(ps.plan.arc > 4, `Power Strike with a greatsword is only ${ps.plan.arc.toFixed(2)} rad wide`);
    }
  }
});

test('a melee skill keeps its own numbers when they are already bigger than the weapon (a dagger)', () => {
  const { r, player } = character('rogue', 'dagger');
  const bar = createSkillBar({ data: skillData, player, rpg: r });
  const i = bar.slots.findIndex(s => s.id === 'eviscerate');
  const plan = bar.use(i);
  assert.equal(plan.reach, skillData.skills.eviscerate.reach ?? 3);
  assert.equal(plan.arc, skillData.skills.eviscerate.arc ?? 1.5);
});
