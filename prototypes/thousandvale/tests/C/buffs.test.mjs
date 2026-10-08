// node --test prototypes/thousandvale/tests/C/buffs.test.mjs
//
// The lead's follow-up to play-test 2: shop items that "do nothing yet" now do something (js/rules/buffs.js,
// rules.useItem). Timed self-buffs (one per kind, survive a zone change and a logout, end on death), the torch,
// the poultice, the recall charm's 5 s channel and the revive flask; and A's consumables.js hands each one over.

import { LIGHT } from '../../js/rules/index.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { itemStrikeMult, BUFF_KINDS, RECALL, REVIVE_FLASK } from '../../js/rules/buffs.js';
import { effectOf } from '../../js/sim/consumables.js';
import { makeRng } from '../../js/rules/rng.js';
import { attuneWeapon } from '../../js/rules/farhold.js';

const engine = rulesEngine();
const GOODS = JSON.parse(readFileSync(new URL('../../data/provinces/shops.json', import.meta.url), 'utf8')).goodsCatalog;
const use = id => GOODS[id].use;

function roomWith({ cls = 'warrior', level = 6, id = 'bf', host = {}, char = {} } = {}) {
  const terrain = standInTerrain(2, 2048);
  const events = [];
  const room = createRoom({ id, kind: 'wilds', terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  Object.assign(room.host, host);
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, at: room.now() }); return ev0(ev); };
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 1, name: 'T', cls, level, xp: 0, gold: 0, room: id, x: sx, z: sz, ...char }, null);
  return { room, me, events, sx, sz, R: room.rules, terrain };
}
const steps = (room, n) => { for (let i = 0; i < n; i++) room.step(); };

test('every buff good in the shops is one the rules carry out, and consumables.js hands it over', () => {
  for (const [id, g] of Object.entries(GOODS)) {
    const ef = effectOf({ kind: 'good', id, use: g.use });
    if (g.use.type === 'buff') { assert.ok(BUFF_KINDS[g.use.buff.stat], `${id}: ${g.use.buff.stat}`); assert.equal(ef.kind, 'rules', id); }
    if (['light', 'recall', 'cleanse'].includes(g.use.type)) assert.equal(ef.kind, 'rules', id);
  }
  assert.equal(effectOf({ kind: 'potion', id: 'revival_flask' }).kind, 'rules');
  assert.deepEqual(effectOf({ kind: 'good', id: 'hearty_stew', use: use('hearty_stew') }).buff, use('hearty_stew').buff, 'the stew carries its buff into the meal');
});

test('whetstone: +3% to every hit, 15 minutes, a second one refreshes and never stacks; shows on the body', () => {
  const { room, me, R, events } = roomWith();
  const u = me.r.unit;
  const r = R.useItem(me, use('whetstone'), { name: 'Whetstone', itemId: 'whetstone' });
  assert.equal(r.ok, true); assert.equal(r.consume, true); assert.equal(r.ms, 15 * 60000);
  assert.equal(R.itemBuffs(me).dmgPct, 0.03);
  assert.ok(R.statusesOf(me).includes('item:whetted'), 'on info.st for everyone near');
  assert.ok(events.some(e => e.type === 'fx' && e.status === 'item:whetted' && e.on === true));
  assert.ok(Math.abs(itemStrikeMult(u, { family: 'beast' }) - 1.03) < 1e-9);
  steps(room, 20 * 60);                                    // a minute later, a second stone
  const r2 = R.useItem(me, use('whetstone'), { name: 'Whetstone' });
  assert.equal(r2.ok, true);
  assert.equal(R.itemBuffs(me).dmgPct, 0.03, 'refreshed, not stacked');
  assert.ok(u.statuses['item:whetted'].remaining > 14.9 * 60, 'back to a full 15 minutes');
  // and in a real hit: same seed, same target, with and without
  const hit = (withBuff) => {
    const t = roomWith({ id: 'bfh' + withBuff });
    if (withBuff) t.R.useItem(t.me, use('whetstone'));
    const m = t.room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x: t.sx + 1.5, z: t.sz });
    m.r.unit.maxHp = m.r.unit.hp = 1e9;
    const rng = makeRng(9);
    return t.R.room.run(() => { let sum = 0; for (let i = 0; i < 400; i++) sum += engine.rpg.strike(t.me.r.unit, m.r.unit, rng, {}).amount; return sum; });
  };
  const a = hit(false), b = hit(true);
  assert.ok(b > a * 1.015 && b < a * 1.05, `400 hits: with a whetstone ${b} vs ${a}`);
});

test('armour oil and hearty stew change the sheet while they last, and it goes back when they run out', () => {
  const { room, me, R } = roomWith({ id: 'bfo' });
  const u = me.r.unit;
  const armor0 = u.derived.armor, hp0 = u.maxHp;
  assert.equal(R.useItem(me, use('armour_oil')).ok, true);
  assert.equal(u.derived.armor, Math.round(armor0 * 1.04));
  assert.equal(R.useItem(me, { type: 'buff', buff: use('hearty_stew').buff }).ok, true);
  assert.equal(u.maxHp, Math.round(hp0 * 1.05));
  R.room.run(() => { u.statuses['item:oiled'].remaining = 0.5; u.statuses['item:well_fed'].remaining = 0.5; });
  steps(room, 40);
  assert.equal(R.itemBuffs(me).armorPct, undefined);
  assert.equal(u.derived.armor, armor0, 'armour back');
  assert.equal(u.maxHp, hp0, 'health back');
});

test('a buff survives a zone change (the unit is handed over) and a logout (saved with the build); death ends it', () => {
  const A = roomWith({ id: 'bfz1' });
  A.R.useItem(A.me, use('armour_oil'));
  A.R.useItem(A.me, use('whetstone'));
  const armor = A.me.r.unit.derived.armor;
  const carry = A.me.r, char = A.me.char;
  A.room.remove(A.me);
  const B = createRoom({ id: 'bfz2', kind: 'wilds', terrain: A.terrain, seed: 6, camps: [], createRules, hooks: { log: () => {} } });
  const me2 = B.addPlayer(char, null, { x: A.sx, z: A.sz, carry });
  assert.equal(B.rules.itemBuffs(me2).armorPct, 0.04, 'the oil came along');
  assert.equal(me2.r.unit.derived.armor, armor);
  // logout: the build carries it
  const build = B.rules.saveBuild(me2);
  assert.deepEqual(build.buffs.map(b => b.stat).sort(), ['armorPct', 'dmgPct']);
  const C = roomWith({ id: 'bfz3', char: { build } });
  assert.equal(C.R.itemBuffs(C.me).dmgPct, 0.03, 'restored on login');
  assert.equal(C.me.r.unit.derived.armor, armor, 'and the sheet has it');
  // death
  const u = C.me.r.unit;
  C.R.room.run(() => { u.hp = 0; u.dead = true; });
  steps(C.room, 2);
  assert.deepEqual(C.R.itemBuffs(C.me), {}, 'gone with the death');
  C.room.respawn(C.me);
  steps(C.room, 2);
  assert.equal(u.derived.armor, Math.round(armor / 1.04), 'the sheet after respawn has no oil in it');
  assert.equal(u.hp, u.maxHp);
});

test('silver dust bites the undead; fletching only helps a bow; a torch lights and, at night, bites undead and beasts', () => {
  let night = false;
  const { me, R } = roomWith({ id: 'bft', cls: 'ranger', host: { isNight: () => night } });
  const u = me.r.unit;
  R.useItem(me, use('silver_dust'));
  assert.ok(Math.abs(itemStrikeMult(u, { family: 'undead' }) - 1.06) < 1e-9);
  assert.equal(itemStrikeMult(u, { family: 'beast' }), 1);
  R.useItem(me, use('fletching_kit'));
  assert.ok(Math.abs(itemStrikeMult(u, { family: 'beast' }) - 1.04) < 1e-9, 'the ranger holds a bow');
  const sword = roomWith({ id: 'bft2', cls: 'warrior' });
  sword.R.useItem(sword.me, use('fletching_kit'));
  assert.equal(itemStrikeMult(sword.me.r.unit, { family: 'beast' }), 1, 'no help to a sword');
  // owner feedback 8 (W22): torches are removed — using one is refused (and not spent), nobody carries `item:torch`,
  // and everyone's light is the same rules constant
  const torch = roomWith({ id: 'bft3', cls: 'warrior', host: { isNight: () => night } });
  const r = torch.R.useItem(torch.me, { type: 'light', minutes: 10 }, { name: 'Bundle of torches' });
  assert.equal(r.ok, false); assert.equal(r.why, 'gone');
  assert.equal(torch.R.itemBuffs(torch.me).lightRange, LIGHT.radius, 'everyone carries the same light');
  assert.ok(!torch.R.statusesOf(torch.me).includes('item:torch'));
  night = true; steps(torch.room, 21);
  assert.equal(itemStrikeMult(torch.me.r.unit, { family: 'beast' }), 1, 'no night bonus without a torch to carry');
});

test('a poultice stops a bleed and heals a little; nothing to treat is refused (not wasted)', () => {
  const { me, R } = roomWith({ id: 'bfp' });
  const u = me.r.unit;
  assert.equal(R.useItem(me, use('herb_poultice')).ok, false, 'full health, no bleed');
  R.room.run(() => { u.hp = Math.round(u.maxHp * 0.5); R.combat.landStatus(u, 'bleed', engine.statuses.bleed, u, 5); });
  const r = R.useItem(me, use('herb_poultice'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.cleansed, ['bleed']);
  assert.ok(r.hp > 0);
});

test('recall: a 5 s channel standing still, then done(); moving, a hit, attacking or a fight stops it and nothing is spent', () => {
  const { room, me, R, sx, sz, events } = roomWith({ id: 'bfr' });
  let done = 0, broken = [];
  const go = () => R.useItem(me, use('recall_charm'), { name: 'Recall charm', done: () => done++, broken: w => broken.push(w) });
  const r = go();
  assert.equal(r.ok, true); assert.equal(r.consume, false, 'the charm is spent only when it works'); assert.equal(r.channel, RECALL.seconds * 1000);
  assert.ok(events.some(e => e.type === 'fx' && e.kind === 'channel' && e.ms === 5000));
  assert.equal(go().ok, false, 'one at a time');
  steps(room, 20 * 4.9);
  assert.equal(done, 0);
  steps(room, 4);
  assert.equal(done, 1, 'after 5 s');
  // moving
  go(); steps(room, 10); me.moveTo(sx + 2, sz); steps(room, 120);
  assert.equal(done, 1); assert.deepEqual(broken, ['moved']);
  me.moveTo(sx, sz);
  // attacking
  go(); steps(room, 5); room.intent(me, { t: 'cast', slot: 0 }); steps(room, 120);
  assert.equal(done, 1); assert.equal(broken.at(-1), 'acted');
  // a hit
  go(); steps(room, 5); R.room.run(() => { me.r.unit.hp -= 5; }); steps(room, 120);
  assert.equal(done, 1); assert.equal(broken.at(-1), 'hit');
  // fighting
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x: sx + 4, z: sz });
  R.room.run(() => { m.r.unit.targetId = me.id; m.r.unit.state = 'chase'; });
  const f = go();
  assert.equal(f.ok, false); assert.equal(f.why, 'combat');
});

test('revive flask: raises a fallen party member within 10 m at 40% health, clean; not a stranger, not from afar', () => {
  const { room, me, R, sx, sz } = roomWith({ id: 'bfv' });
  const mate = room.addPlayer({ id: 2, name: 'U', cls: 'rogue', level: 6, xp: 0, gold: 0, room: 'bfv', x: sx + 3, z: sz }, null);
  const mu = mate.r.unit;
  R.room.run(() => { R.combat.landStatus(mu, 'burn', engine.statuses.burn, mu, 20); mu.hp = 0; mu.dead = true; });
  steps(room, 2);
  assert.equal(mate.dead, true);
  assert.equal(R.useItem(me, { type: 'revive' }).ok, false, 'not in my party');
  R.onParty(me, 4); R.onParty(mate, 4);
  R.room.run(() => { mu.x = sx + 30; }); mate.moveTo(sx + 30, sz, undefined, true);
  assert.equal(R.useItem(me, { type: 'revive' }).why, 'target', 'too far');
  mate.moveTo(sx + 3, sz, undefined, true); steps(room, 1);
  const r = R.useItem(me, { type: 'revive' }, { target: mate.id });
  assert.equal(r.ok, true, r.text);
  steps(room, 2);
  assert.equal(mate.dead, false, 'up again');
  assert.equal(mu.hp, Math.round(mu.maxHp * REVIVE_FLASK.share));
  assert.deepEqual(Object.keys(mu.statuses || {}), [], 'not on fire');
  assert.equal(R.useItem(me, { type: 'revive' }).ok, false, 'nobody left to raise');
});
