// node --test prototypes/farhold/tests/round28-affixes.test.js
//
// Round 28 — three affix rows that paid the wrong amount, and the target bar that showed the wrong
// enemy. Found while writing Wildmarch's item page (prototypes/wildmarch/docs/08-ITEMS.md §24).
//
//   of Resonance   (cond_afterSkillSpellPow) +300-800% spell power for 6 s: points into a share.
//   of Second Wind (cond_cheatDeath)          a save left you at 100% health: tuned like a flag.
//   of Laceration  (cond_bleedOnCrit)         a flat 0.3-0.6 a second: inert past level 5.
//   target bar     picked what a SHOT hits first, not what the crosshair is on.
//
// Every test drives the real module with an odd value and asks it what happened (the dead-data
// rule); nothing here pins a sentence or a tuning number.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { register } from 'node:module';

import { tuneAffixData, rollAffixValue, AFFIX_TIERS } from '../js/affixes.js';
import { Rpg } from '../js/rpg.js';
import { Effects, describeAffix, CHEAT_DEATH_COOLDOWN, BLEED_ON_CRIT_SECONDS } from '../js/effects.js';
import { lookedAt, chooseTarget, lastStruck, LOOK_STICK } from '../js/targetpick.js';
import { makeRng } from '../../emberveil/js/rng.js';

register('./three-loader.mjs', import.meta.url);
const { EnemyField } = await import('../js/actors.js');

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const balance = read('../data/balance.json');
const freshItems = () => read('../../emberveil/data/items.json');
const rpg = () => new Rpg(freshItems(), { ...balance, seed: 1 });

/** Every value a row can roll, across every tier, from the tuned (Farhold) table. */
function rollRange(id, n = 400) {
  const items = freshItems();
  tuneAffixData(items);
  const def = Object.values(items.affixes).flat().find(a => a.id === id);
  assert.ok(def, `${id} is not in the affix pool`);
  const rng = makeRng(28);
  let lo = Infinity, hi = -Infinity;
  for (const t of AFFIX_TIERS) {
    for (let i = 0; i < n; i++) {
      const v = rollAffixValue(def, t.at, rng);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
  }
  return { lo, hi };
}

/** The number a card line prints as a percentage, e.g. "+7% spell power" -> 7. */
const firstPercent = text => Number((text.match(/(\d+(?:\.\d+)?)%/) || [])[1]);

const ring = affixes => ({ id: 'r28', name: 'Test Ring', type: 'accessory', slot: 'ring', rarity: 'rare', affixes });

// ------------------------------------------------------------------------------ of Resonance

test('of Resonance rolls a share of spell power, never hundreds of percent', () => {
  const { lo, hi } = rollRange('after_skill_sp');
  assert.ok(lo > 0.01, `bottom roll ${lo} is worth nothing`);
  assert.ok(hi <= 0.5, `top roll ${hi} is +${Math.round(hi * 100)}% spell power`);
});

test('of Resonance adds exactly its share to spell power after a skill, and the card says so', () => {
  for (const [value, share] of [[0.07, 0.07], [0.13, 0.13], [7, 0.07]]) {   // 7 = a pre-R28 save
    const r = rpg();
    const p = r.createPlayer({ level: 20 });
    r.equip(p, ring([{ stat: 'cond_afterSkillSpellPow', value }]));
    const before = r.derive(p).spellPower;
    r.fx.onCast({ self: p, skill: { id: 'x' } });
    const after = r.derive(p).spellPower;
    assert.ok(Math.abs((after - before) - share) < 1e-9, `value ${value}: spell power moved ${after - before}, wanted ${share}`);
    const printed = firstPercent(describeAffix({ stat: 'cond_afterSkillSpellPow', value }));
    assert.equal(printed, Math.round(share * 100), `value ${value}: the card prints ${printed}%`);
    // and it wears off
    r.fx.update(p, 6.1, { fighting: true });
    assert.ok(Math.abs(r.derive(p).spellPower - before) < 1e-9, 'the buff never ran out');
  }
});

// ------------------------------------------------------------------------------ of Second Wind

test('of Second Wind rolls a share of health well short of a full heal', () => {
  const { lo, hi } = rollRange('cheat_death');
  assert.ok(lo >= 0.05 && hi <= 0.5, `rolls ${lo}-${hi}`);
});

test('of Second Wind leaves you at its share of health, honours its cooldown, and the card agrees', () => {
  const hitter = { dmg: [100000, 100000], critChance: 0 };
  for (const value of [0.23, 1]) {                                          // 1 = a pre-R28 save
    const r = rpg();
    const p = r.createPlayer({ level: 12 });
    r.equip(p, ring([{ stat: 'cond_cheatDeath', value }]));
    r.refresh?.(p, { full: true });
    const max = p.maxHp;
    const first = r.strike(hitter, p, makeRng(1));
    assert.ok(first.saved > 0, `value ${value}: the save did not fire`);
    const share = p.hp / max;
    assert.ok(share < 0.5, `value ${value}: saved at ${Math.round(share * 100)}% health`);
    const printed = firstPercent(describeAffix({ stat: 'cond_cheatDeath', value }).replace(/^Every \d+s, /, ''));
    assert.ok(Math.abs(printed - Math.round(share * 100)) <= 1, `value ${value}: the card says ${printed}%, the save left ${share}`);
    if (value !== 1) assert.ok(Math.abs(share - value) < 0.02, `saved at ${share}, the roll was ${value}`);

    // inside the cooldown: no second save
    r.fx.update(p, CHEAT_DEATH_COOLDOWN - 1, { fighting: true });
    p.hp = max;
    assert.equal(r.strike(hitter, p, makeRng(2)).saved, 0, 'it saved again inside its cooldown');
    // after it: saves again
    r.fx.update(p, 2, { fighting: true });
    p.hp = max;
    assert.ok(r.strike(hitter, p, makeRng(3)).saved > 0, 'the cooldown never came back');
  }
  assert.match(describeAffix({ stat: 'cond_cheatDeath', value: 0.2 }), new RegExp(`${CHEAT_DEATH_COOLDOWN}s`), 'the card does not print the real cooldown');
});

test('the "once a fight" legendary save comes back after the fight', () => {
  const r = rpg();
  const p = r.createPlayer({ level: 12 });
  r.equip(p, ring([{ stat: 'cond_legendaryEffect', legendaryId: 'cheat_death_once', value: 1 }]));
  const hitter = { dmg: [100000, 100000], critChance: 0 };
  assert.ok(r.strike(hitter, p, makeRng(1)).saved > 0, 'the legendary did not save');
  p.hp = p.maxHp;
  assert.equal(r.strike(hitter, p, makeRng(2)).saved, 0, 'it saved twice in one fight');
  r.fx.update(p, 0.1, { fighting: false });
  p.hp = p.maxHp;
  assert.ok(r.strike(hitter, p, makeRng(3)).saved > 0, 'it never came back after the fight');
});

// ------------------------------------------------------------------------------ of Laceration

test('of Laceration bleeds for its share of the crit that caused it, and the card says so', () => {
  const { lo, hi } = rollRange('bleed_on_crit');
  assert.ok(lo >= 0.1 && hi <= 1.0, `rolls ${lo}-${hi}`);
  for (const value of [0.37, 0.52]) {
    for (const amount of [40, 900]) {                 // a level-3 crit and a level-40 one
      const fx = new Effects();
      const wearer = { equipment: { ring: ring([{ stat: 'cond_bleedOnCrit', value }]) } };
      const landed = [];
      fx.onCrit({ self: wearer, target: {}, amount, crit: true, applyStatus: (t, type, spec) => landed.push({ type, spec }) });
      const bleed = landed.find(l => l.type === 'bleed');
      assert.ok(bleed, 'no bleed on a crit');
      const total = bleed.spec.perSecond * bleed.spec.seconds;
      assert.ok(Math.abs(total - amount * value) < 1e-6, `a ${amount} crit at ${value} bled ${total}`);
      assert.equal(bleed.spec.seconds, BLEED_ON_CRIT_SECONDS);
    }
    const text = describeAffix({ stat: 'cond_bleedOnCrit', value });
    assert.equal(firstPercent(text), Math.round(value * 100), `card: ${text}`);
    assert.match(text, new RegExp(`${BLEED_ON_CRIT_SECONDS}s`));
  }
});

// ------------------------------------------------------------------------------ the target bar

const body = (id, x, z, extra = {}) => ({ id, name: id, x, y: 0, z, hp: 50, maxHp: 50, dying: null, removed: false, bodyR: 0.6, reach: 2, ...extra });

test('the target bar picks the body the crosshair is ON, not a closer one off to the side', () => {
  // camera at the origin at head height, looking straight down +z
  const ray = { x: 0, y: 0.9, z: 0, dx: 0, dy: 0, dz: 1, range: 200 };
  const champion = body('champion', 0, 25);          // dead on the crosshair, 25 m out
  const wolf = body('wolf', 1.6, 5);                  // 5 m out, 1.6 m to the side: ~18 degrees off
  // The REAL field, with both bodies in it. Its hitScan (what a shot hits first) takes the wolf —
  // which is exactly what the bar used to show.
  const field = new EnemyField({ scene: { add() {}, remove() {} }, terrain: { heightAt: () => 0 }, rpg: {}, defs: [], balance: { seed: 1 } });
  field.enemies.push(wolf, champion);
  assert.equal(field.hitScan(0, 0.9, 0, 0, 0, 1, { range: 200, width: 1.2 })?.enemy, wolf, 'setup: the shot scan should reach the wolf');
  assert.equal(field.lookScan(0, 0.9, 0, 0, 0, 1, { range: 200 }), champion, 'the bar shows the wolf, not the body under the crosshair');
  // two bodies both under the crosshair: the one in front is what you see
  const front = body('front', 0.1, 10);
  assert.equal(lookedAt([champion, front], ray), front);
  // nothing near the crosshair: nothing is "looked at"
  assert.equal(lookedAt([wolf], ray), null);
  // nothing beyond the ground the crosshair meets
  assert.equal(lookedAt([champion], { ...ray, range: 12 }), null);
});

test('with nothing under the crosshair, the bar keeps the body you are hitting, not a neighbour', () => {
  const a = body('a', 0, 3), b = body('b', 2, 2);
  const state = { unit: null, for: 0 };
  // looking at A
  assert.equal(chooseTarget(state, { looked: a, dt: 0.016, guess: () => b }), a);
  // the crosshair slips off: A stays for the stick
  assert.equal(chooseTarget(state, { looked: null, dt: LOOK_STICK / 2, guess: () => b }), a);
  // the stick runs out, but A is the one being hit: A stays, even though the guess says B
  a.struckAt = 10;
  const struck = () => lastStruck([a, b], 11);
  assert.equal(chooseTarget(state, { looked: null, dt: LOOK_STICK, struck, guess: () => b }), a);
  // long after the last hit, the guess gets its turn
  assert.equal(chooseTarget(state, { looked: null, dt: 0.016, struck: () => lastStruck([a, b], 30), guess: () => b }), b);
  // a dead body never holds the bar
  state.unit = a; state.for = 1; a.dying = 0;
  assert.equal(chooseTarget(state, { looked: null, dt: 0.016, struck, guess: () => b }), b);
});

test('the field stamps the enemy the player connects with', () => {
  const field = new EnemyField({ scene: { add() {}, remove() {} }, terrain: { heightAt: () => 0 }, rpg: {}, defs: [], balance: { seed: 1 } });
  const v = () => ({ x: 0, y: 0, z: 0, set() {}, setScalar() {} });
  const e = body('e', 0, 5, { state: 'idle', actor: { group: { position: v(), rotation: v(), scale: v(), add() {}, remove() {} }, setAnim() {}, update() {}, dispose() {} } });
  field.enemies.push(e);
  field.clock = 7.5;
  field.land(e, { amount: 0, blocked: false });
  assert.equal(field.lastStruck(null), e);
  assert.equal(e.struckAt, 7.5);
});
