// E22: skill checks are a d20 plus a modest bonus, not a d20 plus a whole attribute.
//
// The log used to read "9 + 28 vs 15", which is not a check — it is a formality. One point of bonus
// per three attribute points puts the die back in charge, and crossings, map nodes, dialog events,
// dungeon stages and the flee roll all read the same function in rules.js.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { checkBonus, bestCheckBonus, ATTR_PER_BONUS } from '../js/rules.js';
import { checkBonus as exploreBonus, choiceState, resolveCrossing, dcFor } from '../js/explore.js';
import { fleeCheck } from '../js/combat.js';
import { makeRng } from '../js/rng.js';
import { Loot } from '../js/loot.js';

const items = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url)));
const loot = new Loot(items);

test('one point of bonus per three attribute points', () => {
  assert.equal(ATTR_PER_BONUS, 3);
  assert.equal(checkBonus(28), 9);
  assert.equal(checkBonus(15), 5);
  assert.equal(checkBonus(8), 2);
  assert.equal(checkBonus(2), 0);
  assert.equal(checkBonus(0), 0);
  assert.equal(checkBonus(-5), 0);
  assert.equal(checkBonus(undefined), 0);
  assert.equal(checkBonus('12'), 4);
});

test('bestCheckBonus takes the best in the party, then converts', () => {
  const party = [{ attrs: { STR: 10 } }, { attrs: { STR: 28 } }, { attrs: { STR: 19 } }];
  assert.equal(bestCheckBonus(party, 'STR'), 9);
  assert.equal(bestCheckBonus([], 'STR'), 0);
  assert.equal(bestCheckBonus(party, 'STR', h => h.attrs.STR * 2), 18);
});

test('explore.js uses the same number as rules.js', () => {
  for (const v of [0, 1, 7, 12, 28, 41]) assert.equal(exploreBonus(v), checkBonus(v));
});

/** A stand-in game good enough for choiceState/resolveCrossing. */
function mkGame(str = 28) {
  return {
    act: 1, gold: 500, fame: 0, day: 1, legsUsed: 0, zoneId: 'thornwood', inventory: [], party: [],
    supplies: { rope: 2, ration: 4, torch: 2, timber: 2 }, flags: {}, crossings: [], loot, rng: makeRng(2),
    d: { crossings: { difficulty: { perAct: 2, cap: 20, rewardPerAct: 0.45 } }, zones: { ZONE_ENCOUNTER_POOLS: {} } },
    alive() { return this.party; }, partyIds() { return []; }, remember() {}, logLoot() {},
  };
}
function mkHero(str) { return { id: 'h', alive: true, level: 5, hp: 50, maxHp: 50, attrs: { STR: str, DEX: 10, INT: 10, CON: 10 }, equipment: {}, passiveRanks: {}, talents: {}, skills: [] }; }

test('a crossing check rolls d20 + the bonus, and a high attribute is no longer an automatic pass', () => {
  const g = mkGame(); g.party = [mkHero(28)];
  const crossing = { id: 'x', name: 'Test ford', choices: [{ id: 'wade', text: 'Wade it', check: { stat: 'STR', dc: 14 }, success: 'ok', failure: 'no' }] };
  const st = choiceState(g, crossing, crossing.choices[0]);
  assert.equal(st.bonus, 9, 'the button shows the bonus');
  assert.ok(st.odds > 0 && st.odds < 100, `odds ${st.odds} leave room for the die`);
  // roll the same crossing many times: it must sometimes fail
  let pass = 0, fail = 0;
  for (let i = 0; i < 200; i++) {
    const g2 = mkGame(); g2.party = [mkHero(28)]; g2.rng = makeRng(100 + i);
    const r = resolveCrossing(g2, crossing, 'wade', g2.rng);
    if (r.ok) pass++; else fail++;
  }
  assert.ok(fail > 10, `checks can fail now (${fail} of 200)`);
  assert.ok(pass > 10, `and can still pass (${pass} of 200)`);
});

test('the flee roll uses the bonus too', () => {
  const heroes = [{ alive: true, level: 5, attrs: { DEX: 30 }, derived: { DEX: 30 } }];
  const enemies = [{ xpValue: 80 }, { xpValue: 80 }];
  const r = fleeCheck(heroes, enemies, () => 0.5);
  assert.equal(r.best, 10, 'DEX 30 is +10, not 30');
  let ok = 0; for (let i = 0; i < 100; i++) ok += fleeCheck(heroes, enemies, makeRng(i)).ok ? 1 : 0;
  assert.ok(ok > 0 && ok < 100, `fleeing is a roll, not a certainty (${ok}/100)`);
});

test('difficulty still climbs with the act and stays capped', () => {
  const g = mkGame();
  const dcs = []; for (let act = 0; act <= 9; act++) { g.act = act; dcs.push(dcFor(g, 12)); }
  for (let i = 1; i < dcs.length; i++) assert.ok(dcs[i] >= dcs[i - 1]);
  assert.ok(dcs.at(-1) <= 20);
});
