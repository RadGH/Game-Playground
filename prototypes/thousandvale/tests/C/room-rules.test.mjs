// node --test prototypes/thousandvale/tests/C/room-rules.test.mjs
//
// The combat core inside stream A's REAL room (js/sim/room.js) through js/rules/index.js
// `createRules` (docs/protocol.md §7): entities get Farhold's numbers, a basic attack hits a wolf
// pack with Farhold's damage, the pack bites back, kills pay through `host.award`, refusals use the
// protocol codes, and nothing throws (the room counts rules errors in `stats.rulesErrors`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules } from '../../js/rules/index.js';

function setup({ cls = 'warrior', level = 3, wolves = 3 } = {}) {
  const terrain = standInTerrain(2, 2048);
  const events = [];
  const room = createRoom({ id: 'c-test', terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  const origEvent = room.host.event;
  room.host.event = ev => { events.push(ev); return origEvent(ev); };
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const char = { id: 77, name: 'Tester', cls, level, xp: 0, gold: 0, room: 'c-test', x: sx, z: sz };
  const me = room.addPlayer(char, null);
  const pack = [];
  for (let i = 0; i < wolves; i++) pack.push(room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: sx + (i - 1) * 1.2, z: sz + 2.2 }));
  return { room, me, pack, events, char };
}

test('entities take Farhold\'s numbers: a level-3 warrior and moor hounds', () => {
  const { room, me, pack } = setup();
  const unit = me.r.unit;
  assert.ok(unit && unit.equipment.weapon, 'the player has a Farhold sheet with its class kit');
  assert.equal(me.hpMax, unit.maxHp);
  assert.equal(me.mpMax, unit.maxMp);
  for (const w of pack) {
    assert.equal(w.r.unit.defId, 'moor_hound', 'the camp type "wolf" is the bestiary\'s moor hound');
    assert.equal(w.hpMax, w.r.unit.maxHp);
  }
  assert.equal(room.stats.rulesErrors, 0);
});

test('a basic attack hits the pack, the pack bites back, a kill pays experience', () => {
  const { room, me, pack, events, char } = setup({ level: 2 });   // five levels over a kill pays nothing (Farhold's grey-con rule)
  const r0 = room.intent(me, { t: 'cast', slot: 0, target: pack[1].id });
  assert.deepEqual(r0, { ok: true });
  const again = room.intent(me, { t: 'cast', slot: 0, target: pack[1].id });
  assert.equal(again.ok, false);
  assert.equal(again.why, 'cooldown', 'the swing clock is enforced, with the protocol code');
  let swings = 1;
  for (let k = 0; k < 600 && pack.some(w => !w.dead); k++) {
    room.step();
    const alive = pack.filter(w => !w.dead);
    if (alive.length && k % 4 === 0) {
      const t = alive[0];
      if (room.intent(me, { t: 'cast', slot: 0, target: t.id }).ok) swings++;
    }
  }
  assert.ok(pack.every(w => w.dead), `the pack died (${swings} swings)`);
  const hits = events.filter(e => e.type === 'hit');
  assert.ok(hits.some(h => h.s === me.id && h.n > 0), 'the player hit something');
  assert.ok(hits.some(h => h.d === me.id && h.n > 0), 'something bit the player');
  assert.ok(events.some(e => e.type === 'aggro'), 'the hounds announced their target');
  assert.ok(char.xp > 0, 'kills paid experience through host.award');
  assert.ok(me.hp < me.hpMax || me.hp === me.hpMax, 'hp bar is a number');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
});

test('skills arrive on slots 1-6; an unlearned or locked slot refuses with a reason', () => {
  const { room, me, pack } = setup({ cls: 'knight', level: 30 });
  const res = room.intent(me, { t: 'cast', slot: 4, target: pack[0].id });   // Challenge: around + taunt
  assert.deepEqual(res, { ok: true });
  for (let k = 0; k < 3; k++) room.step();
  for (const w of pack) assert.equal(w.target, me.id, 'every hound in range now targets the knight');
  const low = setup({ cls: 'knight', level: 1 });
  const locked = low.room.intent(low.me, { t: 'cast', slot: 6 });
  assert.equal(locked.ok, false);
  assert.ok(locked.text, 'the refusal says why');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
});

test('death and respawn: a player killed by the pack is revived with full health and mana', () => {
  const { room, me, pack } = setup({ level: 1, wolves: 3 });
  for (const w of pack) { w.r.unit.dmg = [400, 400]; }
  for (let k = 0; k < 400 && !me.dead; k++) room.step();
  assert.ok(me.dead, 'the player went down');
  room.respawn(me);
  assert.ok(!me.dead);
  assert.equal(me.hp, me.hpMax);
  assert.equal(me.r.unit.hp, me.r.unit.maxHp);
  assert.ok(pack.every(w => !w.r.unit.threat?.has(me.id)), 'no hound remembers the dead player');
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
});

test('levelFor / xpFor are Farhold\'s curve at the realm cap', () => {
  const { room } = setup();
  const rules = room.rules;
  assert.equal(rules.levelFor(0), 1);
  assert.ok(rules.xpFor(2) > 0);
  for (let l = 2; l <= 50; l++) assert.equal(rules.levelFor(rules.xpFor(l)), l, `level ${l}`);
});

test('gear survives a save: saveGear -> char.equipment -> a fresh room puts the same items back on', () => {
  const a = setup({ cls: 'rogue', level: 5 });
  const blob = a.room.rules.saveGear(a.me);
  assert.ok(blob.weapon, 'the dagger is in the blob');
  blob.weapon.uid = 'test:1';
  const b = setup({ cls: 'rogue', level: 5 });
  b.room.remove(b.me);
  const char = { id: 78, name: 'Loaded', cls: 'rogue', level: 5, xp: 0, gold: 0, room: 'c-test', x: 1000, z: 1000, equipment: JSON.parse(JSON.stringify(blob)) };
  const me = b.room.addPlayer(char, null);
  assert.equal(me.r.unit.equipment.weapon.uid, 'test:1');
  assert.deepEqual(me.r.unit.derived.damage, a.me.r.unit.derived.damage);
  // the stand-in rules' old plain items are ignored: a character with them gets the class kit
  const c = setup({ cls: 'rogue', level: 5 });
  const old = c.room.addPlayer({ id: 79, name: 'Old', cls: 'rogue', level: 5, room: 'c-test', x: 900, z: 900, equipment: { weapon: { name: 'Stick', slot: 'weapon' } } }, null);
  assert.ok(old.r.unit.equipment.weapon && old.r.unit.equipment.weapon.type === 'weapon');
});

test('equip / unequip / gear / rollLoot', () => {
  const { room, me } = setup({ cls: 'warrior', level: 10 });
  const rules = room.rules;
  const sword = rules.gear(me).weapon;
  const off = rules.unequip(me, 'weapon');
  assert.ok(off.ok && off.item === sword);
  assert.ok(!rules.gear(me).weapon);
  assert.ok(!me.r.unit.bag.includes(sword), 'the sheet keeps no bag of its own');
  const on = rules.equip(me, sword, 'weapon');
  assert.ok(on.ok, on.text);
  assert.equal(rules.gear(me).weapon, sword);
  const loot = rules.rollLoot(me, { level: 10, tier: 'reward' });
  assert.ok(loot.length === 1 && loot[0].name, 'a reward chest always gives an item');
  const ring = loot[0];
  const r = rules.equip(me, { ...ring, levelReq: 99, requiredLevel: 99, ilvl: 400 });
  assert.equal(typeof r.ok, 'boolean');
});

test('monster ranks: elite is a champion, boss is a rare that never leashes; a SCRIPTED one rolls no random modifiers', () => {
  const { room } = setup({ wolves: 0 });
  const elite = room.spawn({ kind: 'monster', type: 'wolf', level: 5, x: 1100, z: 1100, rank: 'elite' });
  const boss = room.spawn({ kind: 'monster', type: 'wolf', level: 5, x: 1110, z: 1100, rank: 'boss' });
  const plain = room.spawn({ kind: 'monster', type: 'wolf', level: 5, x: 1120, z: 1100 });
  assert.equal(elite.r.unit.rank, 'champion');
  assert.equal(boss.r.unit.rank, 'rare');
  assert.ok(boss.r.unit.boss, 'a boss never leashes');
  // both run scripts by default (packleader / briar_colossus), so the script's mechanics are their only ones
  assert.deepEqual(elite.r.unit.modifiers, []);
  assert.deepEqual(boss.r.unit.modifiers, []);
  assert.equal(elite.name, 'Packleader');
  assert.ok(boss.hpMax > plain.hpMax && elite.hpMax > plain.hpMax);
});

test('HANDOFF: a player moving to another room keeps the same sheet (statuses, cooldowns, mana) and costs ~nothing', () => {
  const A = setup({ cls: 'knight', level: 20 });
  const terrain = A.room.terrain;
  const B = createRoom({ id: 'c-other', terrain, seed: 9, camps: [], createRules, hooks: { log: () => {} } });
  const unit = A.me.r.unit;
  A.room.intent(A.me, { t: 'cast', slot: 2 });                   // Sworn Guard: a buff + a cooldown
  unit.mp = 7;
  const cd = unit.skills.slots[1].ready;
  assert.ok(cd > 0);
  // the world's handoff: the old entity goes, a new one arrives carrying the old `r`
  const carry = A.me.r;
  const t0 = performance.now();
  A.room.remove(A.me);
  const me2 = B.addPlayer({ ...A.char, room: 'c-other' }, null, { carry });
  const ms = performance.now() - t0;
  assert.equal(me2.r.unit, unit, 'the same sheet object');
  assert.equal(unit.id, me2.id);
  assert.equal(unit.skills.slots[1].ready, cd, 'the cooldown came along');
  assert.equal(unit.mp, 7);
  assert.ok(B.rules.field.players.includes(unit) && !A.room.rules.field.players.includes(unit));
  assert.equal(B.rules.stats().handoffs, 1);
  assert.equal(B.rules.stats().builds, 0);
  // measure: a fresh build vs a handoff, warm
  const fresh = [], hand = [];
  for (let i = 0; i < 40; i++) {
    let t = performance.now();
    const e = B.addPlayer({ id: 500 + i, name: 'N' + i, cls: ['knight', 'cleric', 'mage', 'rogue'][i % 4], level: 20, room: 'c-other', x: 1000, z: 1000 }, null);
    fresh.push(performance.now() - t);
    const r = e.r;
    B.remove(e);
    t = performance.now();
    const e2 = A.room.addPlayer({ id: 500 + i, name: 'N' + i, cls: 'knight', level: 20, room: 'c-test', x: 1000, z: 1000 }, null, { carry: r });
    hand.push(performance.now() - t);
    A.room.remove(e2);
  }
  const med = a => a.sort((x, y) => x - y)[a.length >> 1];
  console.log(`# addEntity: fresh build median ${med(fresh).toFixed(2)} ms (max ${Math.max(...fresh).toFixed(2)}), handoff median ${med(hand).toFixed(3)} ms (max ${Math.max(...hand).toFixed(3)}); first handoff ${ms.toFixed(3)} ms incl. remove`);
  assert.ok(med(hand) < 0.5, `handoff median ${med(hand)} ms`);
  assert.equal(A.room.stats.rulesErrors + B.stats.rulesErrors, 0);
});

test('onParty keeps the sheet\'s party current', () => {
  const { room, me } = setup();
  room.rules.onParty(me, 'P9');
  assert.equal(me.r.unit.partyId, 'P9');
});

test('a target message names a living body in reach, or is refused', () => {
  const { room, me, pack } = setup();
  assert.deepEqual(room.intent(me, { t: 'target', id: pack[0].id }), { ok: true });
  assert.equal(me.target, pack[0].id);
  assert.deepEqual(room.intent(me, { t: 'target', id: 0 }), { ok: true });
  assert.equal(me.target, 0);
});

test('ENCOUNTERS in the real room: a boss pulls, its arena objects are entities, telegraphs and call-outs reach the clients, a brazier can be used', () => {
  const terrain = standInTerrain(2, 2048);
  const events = [];
  const room = createRoom({ id: 'c-boss', kind: 'instance', terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  const orig = room.host.event;
  room.host.event = ev => { events.push(ev); return orig(ev); };
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 90, name: 'Tank', cls: 'knight', level: 12, xp: 0, gold: 0, room: 'c-boss', x: sx, z: sz - 3 }, null);
  const boss = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 8, x: sx, z: sz, rank: 'boss' });
  for (let k = 0; k < 300; k++) { room.step(); if (me.dead) room.respawn(me); }
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
  const types = new Set(events.map(e => e.type));
  for (const t of ['say', 'phase', 'tele', 'teleR', 'boss']) assert.ok(types.has(t), `a ${t} event reached the room (${[...types]})`);
  const objs = [...room.entities.values()].filter(e => e.kind === 'object' && e.data?.rules);
  assert.ok(objs.length >= 6, `${objs.length} arena objects are room entities`);
  const brazier = objs.find(o => o.type === 'brazier');
  me.moveTo(brazier.x, brazier.z);
  assert.deepEqual(room.rules.useObject(me, brazier), { ok: true });
  assert.equal(brazier.data.state, 'lit', 'the state is stored on the object (host.objState) for late joiners');
  assert.ok(boss.r.unit && room.rules.encounters.states.get(boss.r.unit)?.script?.id === 'barrow_warden');
});

test('E\'s asks: a scripted monster takes the script\'s name, keeps none of its body\'s own phases or random modifiers; objects keep their authored names', () => {
  const terrain = standInTerrain(2, 2048);
  const room = createRoom({ id: 'c-skein', kind: 'wilds', terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  room.addPlayer({ id: 91, name: 'Tank', cls: 'knight', level: 12, room: 'c-skein', x: sx, z: sz - 3 }, null);
  const skein = room.spawn({ kind: 'monster', type: 'thornmother', level: 8, x: sx, z: sz, rank: 'boss', data: { encounter: 'event_grandmother_skein' } });
  assert.equal(skein.name, 'Grandmother Skein');
  assert.equal(skein.r.unit.name, 'Grandmother Skein');
  assert.equal(skein.r.unit.phases, null, 'thornmother\'s own phases are not run');
  assert.deepEqual(skein.r.unit.modifiers, []);
  for (let k = 0; k < 60; k++) room.step();
  const names = [...room.entities.values()].filter(e => e.kind === 'object').map(e => e.name);
  assert.ok(names.includes('Hay rick'), names.join(','));
  assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError || '');
});

test('type specials: a moor hound uses its own type\'s list (specials_torbor.json) before its family\'s', () => {
  const { room, pack } = setup({ wolves: 1 });
  const enc = room.rules.encounters;
  const list = enc.stateOf(pack[0].r.unit).abilities.map(a => a.id);
  assert.deepEqual(list, ['hamstring', 'circling_snap']);
});

test('no banned names in stream C\'s encounter data (E\'s list)', async () => {
  const fs = await import('node:fs');
  // E's list, read as text (importing the file would run E's tests inside this one)
  let BANNED = null;
  try {
    const src = fs.readFileSync(new URL('../E/content.test.js', import.meta.url), 'utf8');
    const m = /export const BANNED = (\[[\s\S]*?\]);/.exec(src);
    if (m) BANNED = JSON.parse(m[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  } catch { /* E's file moved: fall back below */ }
  const words = BANNED || ['Maul', 'Heroic', 'Mythic', 'Horde', 'Alliance', 'Hearthstone', 'Delve', 'Renown'];
  for (const f of ['specials.json', 'packleader.json', 'briar_colossus.json', 'barrow_warden.json']) {
    const text = fs.readFileSync(new URL(`../../data/encounters/${f}`, import.meta.url), 'utf8').replace(/"_doc"\s*:\s*"[^"]*"/g, '');
    for (const w of words) assert.ok(!new RegExp(`(^|[^A-Za-z])${w.replace(/[+]/g, '\\+')}($|[^A-Za-z])`, 'i').test(text), `${f}: "${w}"`);
    assert.ok(!/ember|veil/i.test(text), `${f}: ember/veil`);
  }
});
