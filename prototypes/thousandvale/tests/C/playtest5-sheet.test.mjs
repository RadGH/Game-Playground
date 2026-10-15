// node --test prototypes/thousandvale/tests/C/playtest5-sheet.test.mjs
//
// Owner play-test 5, T18 (the character sheet) and T25 (angling as the room hands it out):
//   * every stat row is a field of the sheet Farhold derives — nothing recomputed;
//   * every ability number is MEASURED on a training dummy, and agrees with a real fight in a real room;
//   * the server never stalls for it: `rules.sheet` measures a slice a tick and says when it is complete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine, fishing } from '../../js/rules/index.js';
import { characterSheet, coreRows, advancedRows, measureBasic, measureSkill, sheetWith, SHEET } from '../../js/rules/estimate.js';
import { makeRng } from '../../js/rules/rng.js';

const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
let n = 0;
function world() {
  const changed = [];
  const id = `pt5s-${++n}`;
  const room = createRoom({ id, terrain, seed: 12, camps: [], createRules, hooks: { log: () => {} } });
  room.host.sheetChanged = e => changed.push(e.id);
  let pid = 30;
  const add = (cls, level = 20) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: SX, z: SZ }, null);
  return { room, add, changed };
}
const ROW = ['id', 'label', 'value', 'unit', 'tip'];

test('T18: the stat rows are the derived sheet, in D-UI\'s row shape', () => {
  const w = world();
  const me = w.add('knight', 20);
  const u = me.r.unit, d = u.derived;
  const core = coreRows(engine, u), adv = advancedRows(engine, u);
  for (const r of [...core, ...adv]) { for (const k of ROW) assert.ok(r[k] !== undefined, `${r.id}.${k}`); assert.equal(typeof r.value, 'number'); assert.ok(r.tip.length > 8, r.id); }
  const v = id => core.find(r => r.id === id).value;
  assert.equal(v('maxHp'), Math.round(u.maxHp)); assert.equal(v('maxMp'), Math.round(u.maxMp));
  assert.equal(v('damageMin'), Math.round(d.damage[0])); assert.equal(v('damageMax'), Math.round(d.damage[1]));
  assert.equal(v('armor'), Math.round(d.armor)); assert.equal(v('critChance'), Math.round(d.critChance * 10) / 10);
  // owner #2: no attribute rows; the weapon's family share and the melee guard instead
  assert.equal(core.some(r => ['str', 'dex', 'int', 'con'].includes(r.id)), false);
  assert.equal(v('familyPct'), d.familyPct); assert.equal(v('weaponGuard'), d.weaponGuard);
  assert.ok(core.find(r => r.id === 'aps').value > 0);      // owner feedback 10 (Y26): attacks per second replaced the "attack interval" row
  assert.match(core.find(r => r.id === 'armor').tip, new RegExp(`reduced by ${Math.round(d.armor / (100 + d.armor) * 100)}%`), 'the armour tip is the code\'s own formula');
  assert.ok(adv.some(r => r.id === 'magicFind'), 'advanced: the uncommon stats');
  assert.ok(!adv.some(r => r.id === 'thorns'), 'a zero stat is left out');
});

test('T18: every ability has a row; damage is measured, and what cannot be measured says why', () => {
  for (const cls of ['warrior', 'pyromancer', 'cleric', 'druid', 'necromancer', 'ranger']) {
    const w = world();
    const me = w.add(cls, 30);
    const s = characterSheet(engine, me.r.unit, { fresh: true });
    assert.equal(s.abilities.length, 7, `${cls}: the basic attack and six skills`);
    assert.equal(s.abilities[0].id, 'basic');
    assert.ok(s.abilities[0].dps > 0 && s.abilities[0].hit?.[0] > 0 && s.abilities[0].every > 0, `${cls}: basic ${JSON.stringify(s.abilities[0]).slice(0, 120)}`);
    for (const a of s.abilities) {
      assert.ok(a.name && a.tip, `${cls}/${a.id}`);
      if (a.dps == null && a.hps == null) assert.ok(a.why && a.why.length > 5, `${cls}/${a.id}: says why (${a.why})`);
      else assert.match(a.tip, /^Measured/, `${cls}/${a.id}`);
    }
    assert.ok(s.abilities.filter(a => a.dps > 0).length >= 2, `${cls}: at least two abilities with a number`);
  }
  // the particular cases
  const w = world();
  const cleric = w.add('cleric', 30);
  const cs = characterSheet(engine, cleric.r.unit, { fresh: true }).abilities;
  const mend = cs.find(a => a.id === 'mend');
  assert.ok(mend.hps > 0 && mend.dps == null, 'Mend: healing per second, no damage');
  assert.ok(Math.abs(mend.healCast - cleric.r.unit.maxHp * 0.35) <= cleric.r.unit.maxHp * 0.03, `Mend heals 35% of health per cast (${mend.healCast} of ${cleric.r.unit.maxHp})`);
  assert.match(cs.find(a => a.id === 'raise_the_fallen').why, /revive/i);
  assert.match(cs.find(a => a.id === 'guardian_light').why, /summon/i);
  const druid = w.add('druid', 30);
  assert.match(characterSheet(engine, druid.r.unit, { fresh: true }).abilities.find(a => a.id === 'briarback_shape').why, /shape/i);
  const low = w.add('mage', 1);
  assert.match(characterSheet(engine, low.r.unit, { fresh: true }).abilities.find(a => a.slot === 6).why, /level 24/);
});

test('T18: a burn is in the number — Firebolt\'s measured damage is more than its hits alone', () => {
  const w = world();
  const pyro = w.add('pyromancer', 30);
  const m = measureSkill(engine, pyro.r.unit, pyro.r.unit.skills.slots.findIndex(s => s.id === 'firebolt'));
  const direct = m.hits.reduce((a, b) => a + b, 0) / SHEET.CASTS;
  assert.ok(m.perCast > direct * 1.05, `per cast ${m.perCast} vs direct hits ${Math.round(direct)}: the burn was counted`);
});

test('T18: the measured basic attack agrees with a real fight in a real room', () => {
  for (const cls of ['warrior', 'rogue', 'ranger', 'mage']) {
    const w = world();
    const me = w.add(cls, 25);
    const u = me.r.unit;
    const sheet = measureBasic(engine, u).dps;
    const reach = w.room.rules.attackRange(me);
    const m = w.room.spawn({ kind: 'monster', type: 'wolf', level: 25, x: SX, z: SZ + (reach == null ? 2 : Math.min(reach - 1.5, 10)), data: { noRank: true } });
    const mu = m.r.unit;
    mu.attackEvery = 1e9; mu.speed = 0; mu.aggroRange = 0; mu.maxHp = mu.hp = 1e9; mu.armor = 0; mu.magicResist = 0; mu.derived = { resistAll: 0, thorns: 0, dodge: 0 };
    const T = 20;
    const m0 = { x: m.x, z: m.z };
    let dealt = 0;
    const ev0 = w.room.host.event;
    w.room.host.event = ev => { if (ev.type === 'hit' && ev.d === m.id && ev.s === me.id && ev.kind === 'dmg') dealt += ev.n; /* your own hits: the sheet leaves followers out */ return ev0(ev); };
    for (let i = 0; i < T * 20; i++) { w.room.intent(me, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } }); mu.hp = mu.maxHp; mu.x = m0.x; mu.z = m0.z; mu.push = null; mu.stagger = 0; mu.facing = Math.atan2(u.x - mu.x, u.z - mu.z); w.room.step(); }   // the dummy never moves (a knock would carry it out of reach) and faces you, as the sheet's does (round 11)
    const real = dealt / T;
    assert.ok(real > 0, `${cls}: the fight did damage`);
    assert.ok(Math.abs(sheet - real) / real < 0.3, `${cls}: sheet ${sheet.toFixed(1)} vs real fight ${real.toFixed(1)} damage a second`);
  }
});

test('T18: equipping a better weapon raises the numbers; sheetWith shows it before you do, without touching you', () => {
  const w = world();
  const me = w.add('warrior', 30);
  const u = me.r.unit;
  const before = characterSheet(engine, u, { fresh: true });
  const better = engine.makeItem({ base: 'longsword', rarity: 'rare', level: 30, rng: makeRng(9) });
  better.dmg = [u.equipment.weapon.dmg[0] * 3, u.equipment.weapon.dmg[1] * 3];
  const preview = sheetWith(engine, u, better, 'weapon');
  assert.ok(preview.ok && preview.abilities === null, 'a compare gives the stat rows at once, no measuring');
  const dmax = s => s.core.find(r => r.id === 'damageMax').value;
  assert.ok(dmax(preview) > dmax(before) * 1.5, `preview ${dmax(preview)} vs now ${dmax(before)}`);
  assert.equal(dmax({ core: coreRows(engine, u) }), dmax(before), 'the character itself was not touched');
  assert.equal(sheetWith(engine, u, { ...better, levelReq: 99 }, 'weapon').ok, false, 'an item you cannot wear says so');
  assert.ok(w.room.rules.equip(me, better, 'weapon').ok);
  const after = characterSheet(engine, u);
  assert.ok(after.abilities[0].dps > before.abilities[0].dps * 1.5, `basic ${before.abilities[0].dps} -> ${after.abilities[0].dps}`);
  const k = id => [before, after].map(s => s.abilities.find(a => a.id === id).dps);
  const [c0, c1] = k('cleave');
  assert.ok(c1 > c0 * 1.5, `Cleave ${c0} -> ${c1}`);
});

test('T18: rules.sheet never stalls the room — stats at once, abilities a slice a tick, then host.sheetChanged', () => {
  const w = world();
  const me = w.add('stormcaller', 30);
  const first = w.room.rules.sheet(me);
  assert.equal(first.pending, true);
  assert.equal(first.core.length > 10 && first.abilities.length, 7);
  assert.ok(first.abilities.every(a => a.pending || a.why), 'nothing is measured yet');
  let ticks = 0;
  while (!w.changed.length && ticks < 60) { w.room.step(); ticks++; }
  assert.ok(w.changed.includes(me.id), `host.sheetChanged after ${ticks} ticks`);
  assert.ok(ticks <= 1 + 6 * SHEET.CASTS + 2, `${ticks} ticks: one slice a tick`);
  const done = w.room.rules.sheet(me);
  assert.equal(done.pending, false);
  assert.deepEqual(done.abilities, characterSheet(engine, me.r.unit, { fresh: true }).abilities, 'the sliced sheet is the same sheet');
  assert.equal(w.room.rules.sheet(me).pending, false, 'and it is kept until the build changes');
  // a new weapon: pending again
  const wand = engine.makeItem({ base: 'wand', rarity: 'magic', level: 30, rng: makeRng(2) });
  assert.ok(w.room.rules.equip(me, wand, 'weapon').ok);
  assert.equal(w.room.rules.sheet(me).pending, true);
});

// ============================================================================ T25 — angling, as the rules hand it out

test('T25: the booted angling rules have C\'s numbers and E\'s fish, and a newcomer\'s first casts work', () => {
  const F = fishing();
  assert.ok(F && F.numbers && typeof F.roll === 'function');
  const w = world();
  assert.equal(w.room.rules.fishing, F, 'the room hands out the same instance');
  const rng = makeRng(77);
  const kinds = {};
  let state = { xp: 0 };
  for (let i = 0; i < 400; i++) {
    const wait = F.wait(rng, {});
    assert.ok(wait >= 2 && wait <= 9);
    const c = F.roll({ water: 'river', band: 2, time: 'day', skill: F.levelOf(state.xp), zone: 'test', pool: i % 3 === 0 ? { tier: 1 } : null, rng });
    kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    const tug = F.tug(c, F.levelOf(state.xp));
    if (tug) { assert.ok(tug.ms >= 3000 && tug.ms <= 6000 && tug.band > 0.1 && tug.need <= 0.75); }
    if (F.lands(tug, 0.8)) { state = F.gain(state, F.xp(c, { first: i < 5, best: false })); const it = F.item(c); if (c.kind === 'fish') assert.ok(it.id && it.kind === 'fish' && it.price >= 0 && it.size > 0); }
  }
  if (F.content) {
    assert.ok(kinds.fish > 200, `mostly fish (${JSON.stringify(kinds)})`);
    assert.ok(F.levelOf(state.xp) >= 20, `400 casts: level ${F.levelOf(state.xp)}`);
    assert.equal(F.canFish({ skill: 1, pool: { tier: 1 }, rod: 'angling_rod' }).ok, true, 'a newcomer can fish the first pool');
    assert.equal(F.canFish({ skill: 1, pool: { tier: 3 }, rod: 'angling_rod' }).ok, false, 'not the best one');
    // a sunken crate is a real crate the room can open
    const crateCatch = { kind: 'crate', crate: F.content.crates?.crate || { slot: 'any', min: 'uncommon' } };
    const item = F.item(crateCatch);
    const me = w.add('ranger', 4);
    const crate = w.room.rules.makeCrate(me, item.crate);
    const [got] = w.room.rules.openCrate(me, crate);
    assert.ok(got && got.rarity !== 'normal', 'the sunken crate opens into an uncommon-or-better item');
  }
});
