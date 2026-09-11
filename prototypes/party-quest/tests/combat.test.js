import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Combat, itemStats, EV } from '../js/combat.js';
const rules = JSON.parse(readFileSync(new URL('../data/rules.json', import.meta.url)));
const mk = (id, side, hp, damage, extra = {}) => ({ id, name: id, side, hp, maxHp: hp, damage, armour: 0, role: 'melee', ...extra });
let seed = 1; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

test('a stronger party wins and emits start, kill, win events', () => {
  const party = [mk('w', 'party', 14, 3), mk('r', 'party', 11, 2, { role: 'ranged' })], foes = [mk('g1', 'enemy', 4, 1), mk('g2', 'enemy', 4, 1)];
  const c = new Combat(party, foes, rules, rng); const evs = []; while (!c.over) evs.push(...c.round());
  assert.equal(c.result, 'win'); assert.ok(evs.some(e => e.type === EV.START)); assert.equal(evs.filter(e => e.type === EV.KILL).length, 2); assert.ok(evs.at(-1).type === EV.WIN);
});
test('bloodied fires once per member, down fires when hp hits 0, party can lose', () => {
  const party = [mk('w', 'party', 6, 1)], foes = [mk('o', 'enemy', 30, 3, { armour: 5 })];
  const c = new Combat(party, foes, rules, rng); const evs = []; while (!c.over) evs.push(...c.round());
  assert.equal(c.result, 'lose'); assert.equal(evs.filter(e => e.type === EV.BLOODIED).length, 1); assert.equal(evs.filter(e => e.type === EV.DOWN).length, 1);
});
test('spells: healer heals the weakest, fireball hits all, cooldowns tick, armour reduces to a minimum of 1', () => {
  const party = [mk('c', 'party', 10, 1, { role: 'healer', spell: 'mendflesh' }), mk('m', 'party', 8, 1, { role: 'caster', spell: 'fireball' }), mk('t', 'party', 10, 2)];
  party[2].hp = 4; const foes = [mk('a', 'enemy', 6, 1, { armour: 9 }), mk('b', 'enemy', 6, 1)];
  const c = new Combat(party, foes, rules, rng); const evs = c.round();
  assert.ok(evs.some(e => e.type === EV.HEAL && e.target.id === 't')); assert.ok(evs.some(e => e.type === EV.SPELL && e.spellId === 'fireball'));
  assert.ok(foes[0].hp === 6 - 1 || foes[0].hp === 6 - 2, 'armour floor: ' + foes[0].hp); assert.ok(c.cd('m', 'fireball') > 0);
});
test('itemStats maps catalog entries to flat numbers', () => {
  const items = JSON.parse(readFileSync(new URL('../../../items/data/items.json', import.meta.url))).items; const by = Object.fromEntries(items.map(i => [i.id, i]));
  assert.deepEqual(itemStats(by.dagger, rules), { kind: 'weapon', damage: 1 }); assert.equal(itemStats(by.longsword, rules).damage, 3); assert.equal(itemStats(by.greatsword, rules).damage, 4); assert.equal(itemStats(by.longbow, rules).damage, 3);
  assert.equal(itemStats(by.chainmail, rules).armour, 2); assert.equal(itemStats(by.plate_armour, rules).armour, 3); assert.equal(itemStats(by.leather_armour, rules).armour, 1);
  assert.deepEqual(itemStats(by.wizard_staff, rules), { kind: 'implement', spell: 'fireball', damage: 1 }); assert.equal(itemStats(by.holy_symbol, rules).spell, 'mendflesh'); assert.equal(itemStats(by.goblet, rules).kind, 'treasure');
});
