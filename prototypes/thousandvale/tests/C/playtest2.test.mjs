// node --test prototypes/thousandvale/tests/C/playtest2.test.mjs
//
// Owner play-test 2 (~/claude/agent/mmo/round-playtest2.md), stream C's items:
//   Q1  a bow (and every other ranged weapon) fires from the basic-attack key / auto-attack: no "not drawn"
//   Q8  every status ends on death and does not come back on revive; the clients are told it went out
//   Q26 every perk-forest node sits inside its own arm's wedge; no arm is empty
//   Q3/Q4 the party loot ladder; one drop per party when the room takes party loot
//   Q16 the riding rules
//   Q28 class-quest unlocks (talents1, perk once per source)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { buildTvForest, ARM_MARGIN } from '../../js/rules/perk-forest.js';
import { lootTier, locksForRoll, splitLoot, rollWinner, normalizeThreshold, LOOT_THRESHOLDS, DEFAULT_LOOT_THRESHOLD } from '../../js/rules/loot-rules.js';
import { MOUNT_RULES, mountRefusal, mountSpeedMul, dismounts } from '../../js/rules/mount.js';
import { makeRng } from '../../js/rules/rng.js';
import { attuneWeapon } from '../../js/rules/farhold.js';
import { basicPace } from '../../js/rules/combat-cfg.js';

const engine = rulesEngine();

export function roomWith({ cls = 'warrior', level = 2, id = 'pt2', terrain = standInTerrain(2, 2048), kind = 'wilds', host = {}, char = {} } = {}) {
  const events = [];
  const room = createRoom({ id, kind, terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  Object.assign(room.host, host);
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, at: room.now() }); return ev0(ev); };
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 1, name: 'T', cls, level, xp: 0, gold: 0, room: id, x: sx, z: sz, ...char }, null);
  return { room, me, events, sx, sz, R: room.rules };
}

// ---------------------------------------------------------------------------- Q1

/** Every ranged / caster base the loot tables can give, with the distance its basic attack is tried from (a sceptre and a quarterstaff are Farhold melee weapons with an element, so 2 m). */
const RANGED = [
  ['bow', 'ranger', 14], ['shortbow', 'ranger', 14], ['crossbow', 'demon_hunter', 14], ['javelin', 'ranger', 12],
  ['wand', 'mage', 12], ['scepter', 'mage', 2], ['staff', 'pyromancer', 6], ['quarterstaff', 'mage', 2],
  ['roadwarden_bow', 'ranger', 14], ['stormpin_crossbow', 'demon_hunter', 14], ['emberbrand_wand', 'mage', 12], ['bramble_staff', 'druid', 6],
];

for (const [base, cls, dist] of RANGED) {
  test(`Q1: a ${base} lands damage from the basic-attack key in a real room, and never says "not drawn"`, () => {
    const { room, me, events, sx, sz, R } = roomWith({ cls, level: 6, id: 'q1' + base });
    const u = me.r.unit;
    const item = R.room.run(() => attuneWeapon(engine.rpg.loot.generate(base, 'normal', 'medium', { rng: makeRng(7) })));   // as every drop is (rpg.rollDrop)
    assert.ok(item, `${base} exists`);
    R.room.run(() => { engine.rpg.equip(u, item, { force: true }); engine.rpg.refresh(u); });
    assert.equal(u.equipment.weapon?.baseKey ?? u.equipment.weapon?.key, item.baseKey ?? item.key);
    const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x: sx + dist, z: sz });
    m.r.unit.maxHp = m.r.unit.hp = 99999;            // it must live through every shot
    m.r.unit.speed = 0; m.r.unit.attackEvery = 999;   // and stand still: this is about the shot, not the fight
    const refusals = [];
    let firstHitAt = null;
    for (let k = 0; k < 20 * 6; k++) {                // 6 s of the client's auto-attack: a click every 250 ms
      if (k % 5 === 0) {
        const r = room.intent(me, { t: 'cast', slot: 0, target: m.id });
        if (!r.ok) refusals.push(r.text || r.why);
      }
      room.step();
      room.rules.room.run(() => { m.r.unit.x = sx + dist; m.r.unit.z = sz; });   // pinned: a knock-back must not walk it out of reach
      if (firstHitAt == null && events.some(e => e.type === 'hit' && e.s === me.id && e.d === m.id && e.n > 0)) firstHitAt = room.now();
    }
    const hits = events.filter(e => e.type === 'hit' && e.s === me.id && e.d === m.id && e.n > 0);
    assert.ok(hits.length >= 3, `${base}: ${hits.length} damaging hits in 6 s (refusals: ${[...new Set(refusals)].join(', ')})`);
    assert.ok(!refusals.some(t => /not drawn/.test(t)), 'never "not drawn"');
    assert.ok(refusals.every(t => /not ready/.test(t)), `only "not ready" while the weapon cycles: ${[...new Set(refusals)].join(', ')}`);
    // the cadence the client is told (cast.every, ms) is the weapon's real one
    const casts = events.filter(e => e.type === 'cast' && e.s === me.id && e.slot === 0 && e.every > 0);
    assert.ok(casts.length > 0, 'the basic attack tells the client its cadence');
  });
}

test('Q1: a bow on auto-attack draws to full and looses on its own — about one full-power shot per draw + nock', () => {
  const { room, me, events, sx, sz, R } = roomWith({ cls: 'ranger', level: 6, id: 'q1cad' });
  const plan = me.r.unit.derived.swing.main;
  assert.equal(plan.hold, 'draw');
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x: sx + 14, z: sz });
  m.r.unit.maxHp = m.r.unit.hp = 99999; m.r.unit.speed = 0; m.r.unit.attackEvery = 999;
  for (let k = 0; k < 20 * 10; k++) { room.intent(me, { t: 'cast', slot: 0, target: m.id }); room.step(); }
  const shots = events.filter(e => e.type === 'cast' && e.s === me.id && e.clip === 'shoot').length;
  // owner #37 (2026-10-15): every basic attack's clock is `basicPace` times as long (combat.json; 1 without the knobs)
  const cycle = (plan.draw.full + (plan.afterShot ?? 0.12)) * basicPace(rulesEngine());
  const expect = 10 / cycle;
  assert.ok(Math.abs(shots - expect) <= 2, `${shots} shots in 10 s, expected ~${expect.toFixed(1)} (draw ${plan.draw.full} s + nock, at the basic-attack pace)`);
  const draws = events.filter(e => e.type === 'cast' && e.s === me.id && e.clip === 'draw');
  assert.ok(draws.length >= shots - 1, 'every shot was drawn first (the client plays the draw)');
});

test('Q1: a drawn arrow follows the target it was drawn on; a death mid-draw looses nothing', () => {
  const { room, me, events, sx, sz } = roomWith({ cls: 'ranger', level: 6, id: 'q1fol' });
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x: sx + 14, z: sz });
  m.r.unit.maxHp = m.r.unit.hp = 99999; m.r.unit.speed = 0; m.r.unit.attackEvery = 999;
  room.intent(me, { t: 'cast', slot: 0, target: m.id });
  room.rules.room.run(() => { m.r.unit.x = sx; m.r.unit.z = sz + 14; });     // it stepped aside while you drew
  for (let k = 0; k < 40; k++) room.step();
  assert.ok(events.some(e => e.type === 'hit' && e.s === me.id && e.d === m.id), 'the arrow went where the target went');
  // death mid-draw
  const n0 = events.filter(e => e.type === 'hit' && e.s === me.id).length;
  for (let k = 0; k < 10; k++) room.step();
  room.intent(me, { t: 'cast', slot: 0, target: m.id });
  room.rules.room.run(() => { me.r.unit.hp = 0; me.r.unit.dead = true; });
  for (let k = 0; k < 40; k++) room.step();
  assert.equal(events.filter(e => e.type === 'hit' && e.s === me.id).length, n0, 'a dead archer looses nothing');
});

test('Q1: the explicit hold (Farhold parity path) still works — a short hold keeps drawing to the nock instead of refusing', () => {
  const { room, me, events, sx, sz, R } = roomWith({ cls: 'ranger', level: 6, id: 'q1hold' });
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 6, x: sx + 14, z: sz });
  m.r.unit.maxHp = m.r.unit.hp = 99999; m.r.unit.speed = 0; m.r.unit.attackEvery = 999;
  for (let k = 0; k < 40; k++) room.step();
  const r = room.intent(me, { t: 'cast', slot: 0, target: m.id, held: 0.05 });
  assert.equal(r.ok, true, 'a tap is not refused');
  for (let k = 0; k < 40; k++) room.step();
  assert.ok(events.some(e => e.type === 'hit' && e.s === me.id && e.d === m.id), 'and the weak shot lands');
});

// ---------------------------------------------------------------------------- Q8

test('Q8: a burning player who dies stops burning at once, the clients are told, and respawn brings no fire back', () => {
  const { room, me, events, R } = roomWith({ cls: 'warrior', level: 4, id: 'q8a' });
  const u = me.r.unit;
  R.room.run(() => { R.combat.landStatus(u, 'burn', engine.statuses.burn, u, 50); R.combat.landStatus(u, 'chill', engine.statuses.chill, u, 5); });
  assert.ok(u.statuses.burn, 'on fire');
  room.step();
  assert.deepEqual(R.statusesOf(me).sort(), ['burn', 'chill'], 'statusesOf lists them (A puts them on info.st)');
  R.room.run(() => { u.hp = 0; u.dead = true; });
  room.step();
  assert.equal(me.dead, true);
  assert.deepEqual(Object.keys(u.statuses), [], 'nothing burns on a corpse');
  assert.deepEqual(R.statusesOf(me), []);
  for (const st of ['burn', 'chill']) assert.ok(events.some(e => e.type === 'fx' && e.kind === 'status' && e.status === st && e.on === false && e.id === me.id), `${st} went out on the clients`);
  // something lands on the body afterwards (a pool, a spread DoT): gone the next tick
  R.room.run(() => { u.statuses.poison = { left: 5, power: 9 }; });
  room.step();
  assert.deepEqual(Object.keys(u.statuses), []);
  room.respawn(me);
  for (let k = 0; k < 40; k++) room.step();
  assert.deepEqual(Object.keys(u.statuses), [], 'respawned clean');
  assert.equal(u.hp, u.maxHp, 'and nothing ticked it down');
});

test('Q8: a raised body (a party revive) comes back clean too, and a dying monster stops burning', () => {
  const { room, me, events, sx, sz, R } = roomWith({ cls: 'warrior', level: 4, id: 'q8b' });
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 1, x: sx + 3, z: sz });
  R.room.run(() => R.combat.landStatus(me.r.unit, 'burn', engine.statuses.burn, m.r.unit, 40));
  assert.ok(m.r.unit.statuses.burn);
  R.room.run(() => { m.r.unit.hp = 0; m.r.unit.dying = 0; });
  room.step();
  assert.deepEqual(Object.keys(m.r.unit.statuses || {}), [], 'a corpse does not burn');
  assert.ok(events.some(e => e.type === 'fx' && e.status === 'burn' && e.on === false && e.id === m.id));
  // revive path: the field's 'revive' event
  const u = me.r.unit;
  R.room.run(() => { (u.statuses ||= {}).burn = { left: 9, power: 30 }; u.hp = 0; u.dead = true; });
  R.room.run(() => { (u.statuses ||= {}).burn = { left: 9, power: 30 }; u.dead = false; u.hp = 10; R.field.emit({ t: 'revive', id: u.id, hp: 10 }); });
  room.step();
  assert.deepEqual(Object.keys(u.statuses), [], 'revived clean');
});

// ---------------------------------------------------------------------------- Q26

test('Q26: every arm has nodes, and every node of an arm sits inside that arm\'s wedge (angle ± half)', () => {
  const data = JSON.parse(readFileSync(new URL('../../data/rules/perks.json', import.meta.url), 'utf8'));
  const F = buildTvForest(data);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const out = [];
  for (const arm of F.arms) {
    assert.ok(arm.half > 0, `${arm.key} carries its wedge half-width`);
    const mine = F.nodes.filter(n => n.arm === arm.key);
    assert.ok(mine.length >= 20, `${arm.name}: ${mine.length} nodes`);
    assert.ok(mine.some(n => n.kind === 'keystone'), `${arm.name} has a cornerstone`);
    for (const n of mine) {
      const off = Math.abs(wrap(Math.atan2(n.y, n.x) - arm.angle));
      if (off > arm.half - ARM_MARGIN / 2) out.push(`${n.id} (${n.name}) ${(off * 180 / Math.PI).toFixed(1)}° from ${arm.name}'s middle, wedge ±${(arm.half * 180 / Math.PI).toFixed(1)}°`);
    }
  }
  assert.deepEqual(out, [], 'nodes outside their arm');
  // the two the owner named
  const fortune = F.arms.find(a => a.name === 'The Long Odds');
  for (const name of ['The Collector', "Fortune's Tithe"]) {
    const n = F.nodes.find(x => x.name === name);
    assert.equal(n.arm, fortune.key);
    assert.ok(Math.abs(wrap(Math.atan2(n.y, n.x) - fortune.angle)) < fortune.half, `${name} inside The Long Odds`);
  }
  // wedges tile the circle without overlapping
  const total = F.arms.reduce((a, arm) => a + 2 * arm.half, 0);
  assert.ok(Math.abs(total - Math.PI * 2) < 1e-9, 'the wedges add up to one circle');
});

// ---------------------------------------------------------------------------- Q3 / Q4

test('Q4: the party loot ladder — default rare, lowered to magic, sets and uniques at the top, epic is an alias', () => {
  assert.equal(DEFAULT_LOOT_THRESHOLD, 'rare');
  assert.deepEqual(LOOT_THRESHOLDS, ['magic', 'rare', 'legendary', 'unique']);
  assert.equal(normalizeThreshold('epic'), 'legendary');
  assert.equal(normalizeThreshold('nonsense'), 'rare');
  const it = (rarity, extra = {}) => ({ rarity, ...extra });
  assert.equal(lootTier(it('legendary', { setId: 's1' })), 'set');
  assert.equal(lootTier(it('legendary', { isUnique: true })), 'unique');
  assert.equal(locksForRoll(it('magic')), false, 'magic is free under the default');
  assert.equal(locksForRoll(it('rare')), true);
  assert.equal(locksForRoll(it('magic'), 'magic'), true, 'lowered to magic, magic locks');
  assert.equal(locksForRoll(it('normal'), 'magic'), false);
  assert.equal(locksForRoll(it('legendary'), 'unique'), false);
  assert.equal(locksForRoll(it('legendary', { setId: 'x' }), 'unique'), true);
  const { free, locked } = splitLoot([it('normal'), it('magic'), it('rare'), it('legendary')]);
  assert.equal(free.length, 2); assert.equal(locked.length, 2);
  assert.equal(rollWinner([{ id: 1, choice: 'greed', n: 99 }, { id: 2, choice: 'need', n: 3 }]).id, 2, 'need beats greed');
  assert.equal(rollWinner([{ id: 1, choice: 'greed', n: 40 }, { id: 2, choice: 'greed', n: 60 }]).id, 2);
  assert.equal(rollWinner([{ id: 1, choice: 'skip', n: 99 }, { id: 2, choice: 'skip', n: 1 }]), null, 'all skip: it stays on the corpse');
});

test('Q3/Q4: with host.partyLoot a party that tagged a kill gets ONE drop for the corpse; a solo tagger keeps its own', () => {
  const piles = [];
  const { room, me, sx, sz, R } = roomWith({ cls: 'warrior', level: 8, id: 'q4p', host: { partyLoot: (members, items, corpse, pid) => piles.push({ members: members.map(m => m.id), items, corpse: corpse?.id, pid }) } });
  const mate = room.addPlayer({ id: 2, name: 'U', cls: 'rogue', level: 8, xp: 0, gold: 0, room: 'q4p', x: sx + 1, z: sz }, null);
  R.onParty(me, 7); R.onParty(mate, 7);
  let kills = 0;
  for (let i = 0; i < 30; i++) {
    const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 8, x: sx + 2, z: sz, rank: 'elite' });
    R.room.run(() => { const u = m.r.unit; (u.damageBy ||= new Map()).set(me.id, 5).set(mate.id, 5); u.hp = 0; u.dying = 0; R.field.onKill(u); });
    kills++;
  }
  assert.equal(piles.length, kills, 'one pile per corpse');
  assert.ok(piles.every(p => p.members.length === 2 && p.pid === 7));
  assert.ok(piles.some(p => p.items.length > 0), 'elites drop something');
  assert.ok(piles.every(p => p.items.every(x => x.uid)), 'every item has a uid');
  // solo: no pile
  R.onParty(mate, null);
  const before = piles.length;
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 8, x: sx + 2, z: sz });
  R.room.run(() => { const u = m.r.unit; (u.damageBy ||= new Map()).set(me.id, 5); u.hp = 0; u.dying = 0; R.field.onKill(u); });
  assert.equal(piles.length, before, 'a solo kill is not a party pile');
});

// ---------------------------------------------------------------------------- Q16

test('Q16: the riding rules — when you may call a mount, what takes you off, calm keeps you on', () => {
  assert.equal(mountRefusal({}), null);
  assert.match(mountRefusal({ fighting: true }), /fighting/);
  assert.match(mountRefusal({ swimming: true }), /swim/);
  assert.match(mountRefusal({ roomKind: 'instance' }), /ride/);
  assert.match(mountRefusal({ dead: true }), /dead/);
  assert.match(mountRefusal({ now: 1, thrownAt: 0 }), /skittish/);
  assert.equal(mountRefusal({ now: 1 + MOUNT_RULES.remountSeconds, thrownAt: 1 }), null);
  assert.equal(mountSpeedMul({ speed: 1.55 }), 1.55);
  assert.equal(mountSpeedMul({ speed: 9 }), MOUNT_RULES.maxSpeed);
  for (const w of ['attack', 'cast', 'swim', 'die', 'dungeon']) assert.equal(dismounts(w), true, w);
  const hit = { type: 'hit', s: 44, d: 1, n: 12, kind: 'dmg' };
  assert.equal(dismounts('hit', { ev: hit, mount: { calm: 0 } }), true, 'a hit throws you');
  assert.equal(dismounts('hit', { ev: { ...hit, skill: 'dot', s: 0 }, mount: {} }), false, 'a burn tick does not');
  assert.equal(dismounts('hit', { ev: { ...hit, kind: 'heal' }, mount: {} }), false);
  assert.equal(dismounts('hit', { ev: { ...hit, n: 0 }, mount: {} }), false, 'a fully absorbed hit does not');
  const rng = makeRng(3);
  let stayed = 0;
  for (let i = 0; i < 2000; i++) if (!dismounts('hit', { ev: hit, mount: { calm: 0.5 }, rng })) stayed++;
  assert.ok(stayed > 900 && stayed < 1100, `calm 0.5 keeps you on about half the time (${stayed}/2000)`);
  assert.equal(dismounts('hit', { ev: hit, mount: { calm: 5 }, rng: () => 0.81 }), true, 'calm is capped: nothing is never thrown');
});

// ---------------------------------------------------------------------------- Q28

test('Q28: class-quest unlocks — talents1 opens the first talent tier at level 1; a perk point pays once per quest', () => {
  const { me, R } = roomWith({ cls: 'mage', level: 2, id: 'q28u' });
  const u = me.r.unit;
  const view0 = R.talents(me);
  const sk = view0.skills.find(s => s.open);
  assert.ok(sk, 'an open skill');
  assert.equal(sk.tiers[0].open, false, 'tier 1 shut at level 2');
  const node = sk.tiers[0].nodes[0];
  assert.equal(R.pickTalent(me, sk.skillId, 1, node.id).ok ?? false, false);
  assert.equal(R.unlock(me, 'talents1').ok, true);
  const view1 = R.talents(me);
  const sk1 = view1.skills.find(s => s.skillId === sk.skillId);
  assert.equal(sk1.tiers[0].open, true, 'tier 1 open at level 2 after the quest');
  assert.equal(sk1.tiers[0].level, 1);
  const r = R.pickTalent(me, sk.skillId, 1, node.id);
  assert.equal(r.ok, true, r.text);
  // it survives a save and a reload
  const build = R.saveBuild(me);
  assert.equal(build.unlocks.talents1, true);
  const again = roomWith({ cls: 'mage', level: 2, id: 'q28v', char: { build } });
  assert.equal(again.R.talents(again.me).skills.find(s => s.skillId === sk.skillId).tiers[0].picked, node.id, 'the early pick reloads');
  // perk points
  const p0 = R.perks(me).total;
  assert.equal(R.unlock(me, 'perk', { source: 'class_mage' }).ok, true);
  assert.equal(R.unlock(me, 'perk', { source: 'class_mage' }).ok, false, 'not twice for one quest');
  assert.equal(R.perks(me).total, p0 + 1);
  assert.equal(R.saveBuild(me).bonusPerks, 1);
  assert.equal(R.unlock(me, 'a pony').ok, false);
});
