// node --test prototypes/thousandvale/tests/C/perks.test.mjs
//
// Play-test 1 P6 — the PERK FOREST (js/rules/perk-forest.js, data/rules/perks.json) and its readers
// (js/rules/perk-rules.js):
//   * the shape: twelve arms, every arm branching into paths that end in keystones, well over twice
//     Farhold's 169 nodes, everything reachable from the middle, no two nodes on top of each other;
//   * nothing inert: every stat a node grants, every flag and every keystone power has a reader, and
//     moving each stat knob moves the sheet (rpg.derive through Farhold's perkBonuses);
//   * the cards: a stat node's line is written from its number; a hand-written keystone line quotes
//     every number it grants;
//   * each of Thousandvale's twenty rule nodes does what its card says;
//   * the take / Unbinder / save API the room uses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { STAT_READERS, FLAG_READERS, statText, forestView } from '../../js/rules/perk-forest.js';
import { PERK_RULES, TV_FLAG_READERS, strikeMult, afterHurt, onKill, weaveRefund, tickPlayer } from '../../js/rules/perk-rules.js';
import { EFFECTS } from '../../js/rules/farhold.js';
import { runtimeFor } from '../../js/rules/cast-skills.js';

const engine = rulesEngine();
const F = engine.forest;

test('the forest: twelve arms, every one branching, more than twice Farhold\'s size, all reachable, nothing overlapping', () => {
  assert.equal(F.arms.length, 12);
  assert.ok(F.nodes.length >= 340, `${F.nodes.length} nodes (Farhold has 169)`);
  for (const arm of F.arms) {
    const keys = F.nodes.filter(n => n.arm === arm.key && n.kind === 'keystone');
    const paths = new Set(F.nodes.filter(n => n.arm === arm.key && n.branch).map(n => n.branch));
    assert.ok(paths.size >= 2, `${arm.key}: ${paths.size} paths`);
    assert.ok(keys.length >= 2, `${arm.key}: ${keys.length} keystones`);
  }
  const seen = new Set(['start']), q = ['start'];
  while (q.length) for (const nx of F.neighbours.get(q.pop()) || []) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
  assert.equal(seen.size, F.nodes.length, 'every node can be walked to from the middle');
  let close = [];
  for (let i = 0; i < F.nodes.length; i++) for (let j = i + 1; j < F.nodes.length; j++) {
    const a = F.nodes[i], b = F.nodes[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.3) close.push(`${a.id} ~ ${b.id}`);
  }
  assert.deepEqual(close, [], 'nodes drawn on top of each other');
  const v = forestView(F);
  assert.equal(v.nodes.length, F.nodes.length);
  assert.ok(v.nodes.every(n => typeof n.x === 'number' && n.name && n.desc), 'the client gets a position, a name and a card for every node');
});

test('nothing inert: every granted stat, flag and power has a reader', () => {
  const badStat = [], badFlag = [], badPower = [];
  for (const n of F.nodes) {
    for (const k of [...Object.keys(n.grants || {}), ...Object.keys(n.whenGrants || {})]) if (!STAT_READERS[k]) badStat.push(`${n.id}: ${k}`);
    if (n.power && !EFFECTS[n.power]) badPower.push(`${n.id}: ${n.power}`);
    // a flag with no reader is allowed only as a NAME on a node that does its work through grants or a power
    if (n.flag && !FLAG_READERS[n.flag] && !n.power && !Object.keys(n.grants || {}).length) badFlag.push(`${n.id}: ${n.flag}`);
  }
  assert.deepEqual(badStat, []);
  assert.deepEqual(badFlag, []);
  assert.deepEqual(badPower, []);
  for (const f of Object.keys(TV_FLAG_READERS)) assert.ok(F.nodes.some(n => n.flag === f), `the rule ${f} is on some node`);
});

test('move every stat knob: a node granting it moves the derived sheet (Farhold\'s perkBonuses + rpg.derive)', () => {
  const R = setup('warrior', 30).R;
  const u = R.field.players[0];
  const keys = new Set(F.nodes.flatMap(n => Object.keys(n.grants || {})));
  const dead = [];
  for (const k of keys) {
    const node = F.nodes.find(n => n.grants && Object.keys(n.grants).length === 1 && n.grants[k] != null) || F.nodes.find(n => n.grants?.[k] != null);
    u.perks = []; engine.rpg.refresh(u);
    const before = u.derived[k] ?? 0;
    u.perks = [node.id]; engine.rpg.refresh(u);
    const after = u.derived[k] ?? 0;
    if (before === after) dead.push(`${k} (${node.id})`);
  }
  u.perks = []; engine.rpg.refresh(u);
  assert.deepEqual(dead, []);
});

test('the cards: stat lines are written from the numbers; a keystone line quotes every number it grants', () => {
  const bad = [];
  for (const n of F.nodes) {
    if (n.kind === 'hub') continue;
    if (!n.ruleId) {
      const [[k, v]] = Object.entries(n.grants);
      if (n.desc !== statText(k, v)) bad.push(n.id);
      continue;
    }
    const text = `${n.desc} ${n.cost || ''}`;
    for (const [k, v] of [...Object.entries(n.grants || {}), ...Object.entries(n.whenGrants || {})]) {
      const shown = ['spellPower', 'stealth', 'thorns', 'echoChance', 'skillCostPct'].includes(k) ? Math.round(Math.abs(v) * 100) : Math.abs(v);
      if (!text.includes(String(shown))) bad.push(`${n.id}: ${k} ${v} not on the card "${text}"`);
    }
    if (/undefined|NaN/.test(text)) bad.push(n.id);
  }
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------------------- the twenty rules

function setup(cls = 'warrior', level = 20, opts = {}) {
  const terrain = standInTerrain(2, 2048);
  const room = createRoom({ id: 'perk' + Math.random(), terrain, seed: 4, camps: [], createRules, hooks: { log: () => {} } });
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 9, name: 'P', cls, level, room: 'perk', x: sx, z: sz, ...opts }, null);
  return { room, me, R: room.rules, sx, sz };
}
const flagged = (u, ...flags) => { u.perkFlags = { ...(u.perkFlags || {}) }; for (const f of flags) u.perkFlags[f] = true; return u; };
const foe = (extra = {}) => ({ side: 'foe', hp: 100, maxHp: 100, id: 'm1', level: 1, statuses: {}, ...extra });

test('hit rules: Finishing Blow, First Blood, Blood Scent, Planted Feet, Fresh Blood, Back to the Wall, Banner, Pack Tactics', () => {
  const R = PERK_RULES;
  const p = { kind: 'player', hp: 100, maxHp: 100, perkFlags: {} };
  assert.equal(strikeMult(p, foe()), 1, 'no flags, no change');
  assert.equal(strikeMult(flagged({ ...p }, 'finisher'), foe({ hp: 20 }), { skill: 'x' }), R.finisher.mult);
  assert.equal(strikeMult(flagged({ ...p }, 'finisher'), foe({ hp: 20 }), {}), 1, 'skills only');
  assert.equal(strikeMult(flagged({ ...p }, 'opener'), foe()), R.opener.mult);
  assert.equal(strikeMult(flagged({ ...p }, 'opener'), foe({ hp: 99 })), 1);
  assert.equal(strikeMult(flagged({ ...p }, 'bloodScent'), foe({ statuses: { burn: { perSecond: 3, kind: 'debuff' } } })), R.bloodScent.mult);
  assert.equal(strikeMult(flagged({ ...p, _stillFor: 2 }, 'stillness'), foe({ hp: 50 })), R.stillness.mult);
  assert.equal(strikeMult(flagged({ ...p, _stillFor: 0.5 }, 'stillness'), foe({ hp: 50 })), 1);
  assert.equal(strikeMult(flagged({ ...p }, 'vanguard'), foe({ hp: 50 })), R.vanguard.mult);
  assert.equal(strikeMult(flagged({ ...p, hp: 20 }, 'cornered'), foe({ hp: 50 })), R.cornered.mult);
  assert.equal(strikeMult({ ...p, _rally: true }, foe({ hp: 50 })), R.rally.mult);
  const owner = flagged({ ...p, id: 1 }, 'packTactics');
  strikeMult(owner, foe({ id: 'm7', hp: 50 }));                       // the owner hits m7
  const pet = { owner, kind: 'beast', side: 'friend' };
  assert.equal(strikeMult(pet, foe({ id: 'm7', hp: 50 })), R.packTactics.mult, 'the pet bites what the owner hit last');
  assert.equal(strikeMult(pet, foe({ id: 'm8', hp: 50 })), 1);
});

test('Banner of the Road reaches party members within 20 m; Planted Feet counts standing still', () => {
  const field = { players: [] };
  const a = flagged({ id: 1, kind: 'player', partyId: 'P', x: 0, z: 0 }, 'rally'), b = { id: 2, kind: 'player', partyId: 'P', x: 10, z: 0 }, c = { id: 3, kind: 'player', partyId: 'P', x: 40, z: 0 };
  field.players.push(a, b, c);
  for (const u of field.players) tickPlayer(field, u, 0.05, true);
  assert.ok(a._rally && b._rally && !c._rally);
  for (let i = 0; i < 40; i++) tickPlayer(field, a, 0.05, false);
  assert.ok(a._stillFor >= 1.9);
  a.x += 1; tickPlayer(field, a, 0.05, false);
  assert.equal(a._stillFor, 0);
});

test('hurt rules: Mind over Body, Shared Hide, Unbroken, Second Wind', () => {
  const emitted = [];
  const pet = { owner: null, hp: 100, maxHp: 100, dying: null };
  const field = { allies: [pet], emit: e => emitted.push(e) };
  const v = flagged({ kind: 'player', id: 1, hp: 60, maxHp: 100, mp: 50, maxMp: 50 }, 'mindWard');
  afterHurt(field, v, { amount: 40 }, null, 0);
  assert.equal(v.hp, 70, 'a quarter of 40 came back off the mana');
  assert.equal(v.mp, 40);
  const w = flagged({ kind: 'player', id: 2, hp: 70, maxHp: 100 }, 'sharedHide');
  pet.owner = w;
  afterHurt(field, w, { amount: 30 }, null, 0);
  assert.equal(w.hp, 79); assert.equal(pet.hp, 91);
  const x = flagged({ kind: 'player', id: 3, hp: -5, maxHp: 100 }, 'unbroken');
  const res = { amount: 50, dead: true };
  afterHurt(field, x, res, null, 10);
  assert.equal(x.hp, 1); assert.equal(res.dead, false);
  x.hp = -3; const res2 = { amount: 50, dead: true };
  afterHurt(field, x, res2, null, 50);
  assert.ok(x.hp <= 0 && res2.dead, 'once every 90 s');
  const y = flagged({ kind: 'player', id: 4, hp: 30, maxHp: 100 }, 'secondWind');
  afterHurt(field, y, { amount: 10 }, null, 0);
  assert.equal(y.hp, 50);
  y.hp = 30; afterHurt(field, y, { amount: 10 }, null, 10);
  assert.equal(y.hp, 30, 'once every 45 s');
});

test('Unbroken in a real fight: a killing bite leaves the player standing on 1 health', () => {
  const { room, me, R, sx, sz } = setup('mage', 5);
  const u = me.r.unit;
  flagged(u, 'unbroken');
  const m = room.spawn({ kind: 'monster', type: 'wolf', level: 30, x: sx + 1.5, z: sz });
  u.hp = 1;
  for (let k = 0; k < 40 && u.hp >= 1; k++) { room.step(); u.perkFlags.unbroken = true; if (u.hp === 1 && (u.perkCd?.unbroken ?? 0) > 0) break; }
  assert.ok(!u.dead && !me.dead, 'still standing');
  assert.ok(u.perkCd?.unbroken > 0, 'the rule fired');
  void m; void R;
});

test('kill rules: Momentum, Spoils of the Fallen, Contagion', () => {
  const near = foe({ id: 'n', x: 3, z: 0, statuses: {} });
  const field = { nearestTo: () => near };
  let refreshed = 0;
  const k = flagged({ id: 1, kind: 'player', hp: 50, maxHp: 100, skills: { refresh: n => { refreshed += n; } } }, 'killHaste', 'killBarrier', 'contagion');
  const victim = { x: 0, z: 0, statuses: { poison: { perSecond: 4, kind: 'debuff', by: 1, power: 4, remaining: 3, seconds: 4 } } };
  onKill(field, k, victim, { statuses: { poison: { name: 'Poisoned', kind: 'debuff', element: 'poison', seconds: 4, perSecond: 1 } }, lastHit: true });
  assert.equal(refreshed, PERK_RULES.killHaste.seconds);
  assert.equal(k.barrier, Math.round(100 * PERK_RULES.killBarrier.share));
  assert.ok(near.statuses.poison, 'the poison jumped');
  refreshed = 0;
  onKill(field, k, { x: 0, z: 0, statuses: {} }, { lastHit: false });
  assert.equal(refreshed, 0, 'a kill somebody else finished is not your killing blow');
});

test('Weave: a different skill inside 3 s gives its mana back; the same skill does not', () => {
  const ch = flagged({}, 'weave');
  assert.equal(weaveRefund(ch, 'a', 10, 0), 0);
  assert.equal(weaveRefund(ch, 'b', 12, 1), 12);
  assert.equal(weaveRefund(ch, 'b', 12, 2), 0);
  assert.equal(weaveRefund(ch, 'a', 10, 9), 0, 'too late');
});

test('threat rules: Soft Footfall, Iron Presence and threatPct reach the threat table', async () => {
  const { addThreat } = await import('../../js/rules/threat.js');
  const m = { threat: new Map(), dying: null };
  addThreat(m, { id: 'a' }, 100);
  addThreat(m, flagged({ id: 'b' }, 'quietHand'), 100);
  addThreat(m, flagged({ id: 'c' }, 'ironPresence'), 100);
  addThreat(m, { id: 'd', perkFlags: {}, derived: { threatPct: 25 } }, 100);
  assert.equal(m.threat.get('a'), 100);
  assert.equal(m.threat.get('b'), 100 * PERK_RULES.quietHand.threat);
  assert.equal(m.threat.get('c'), 100 * PERK_RULES.ironPresence.threat);
  assert.equal(m.threat.get('d'), 125);
});

test('healPower, Brimming Cup, dotPct and xpFind in the room', () => {
  const { room, me, R, sx, sz } = setup('cleric', 20);
  const u = me.r.unit;
  const mate = room.addPlayer({ id: 10, name: 'Mate', cls: 'warrior', level: 20, room: room.id, x: sx + 2, z: sz }, null).r.unit;
  u.partyId = mate.partyId = 'P';
  const rt = runtimeFor(R.combat);
  // healPower: +50% on a 20-point heal
  u.hp = 10; u.derived.healPower = 50;
  assert.equal(R.room.run(() => rt.healUnit(u, u, 20)), 30);
  u.derived.healPower = 0;
  // Brimming Cup: 25 on someone 5 short spills 20 onto the most hurt party member
  flagged(u, 'brimming');
  u.hp = u.maxHp - 5; mate.hp = 10;
  R.room.run(() => rt.healUnit(u, u, 25));
  assert.equal(mate.hp, 30, 'the spill reached the hurt party member');
  // dotPct: +50% on the power of a burn this caster lands
  const a = room.spawn({ kind: 'monster', type: 'wolf', level: 20, x: sx + 5, z: sz }).r.unit;
  const b = room.spawn({ kind: 'monster', type: 'wolf', level: 20, x: sx + 6, z: sz }).r.unit;
  const burn = engine.statuses.burn;
  R.room.run(() => R.combat.landStatus(u, 'burn', burn, a, 10));
  u.derived.dotPct = 50;
  R.room.run(() => R.combat.landStatus(u, 'burn', burn, b, 10));
  assert.ok(Math.abs(b.statuses.burn.power / a.statuses.burn.power - 1.5) < 1e-9);
  u.derived.dotPct = 0;
  // xpFind: the room's award is lifted by it
  const awards = [];
  const award0 = room.host.award;
  room.host.award = (e, x) => { awards.push(x.xp); return award0(e, x); };
  for (const xp of [0, 50]) {
    u.derived.xpFind = xp;
    const m = room.spawn({ kind: 'monster', type: 'wolf', level: 20, x: sx + 1, z: sz });
    m.r.unit.hp = 1;
    for (let k = 0; k < 60 && !m.dead; k++) { room.intent(me, { t: 'cast', slot: 0, target: m.id }); room.step(); }
  }
  assert.equal(awards.length, 2);
  assert.equal(awards[1], Math.round(awards[0] * 1.5));
});

test('the take / Unbinder / save API; a saved walk that no longer connects is dropped', () => {
  const { me, R } = setup('ranger', 12);
  const f = R.perkForest();
  const first = f.links.filter(l => l[0] === 'start').map(l => l[1])[0];
  const p0 = R.perks(me);
  assert.equal(p0.total, 13, 'level 12: 11 points + 2 for every fifth level');
  assert.equal(R.takePerk(me, 'melee:6:0').ok, false, 'nothing connects to it yet');
  const t = R.takePerk(me, first);
  assert.equal(t.ok, true, t.text);
  assert.deepEqual(t.build.perks, [first]);
  assert.ok(R.retrainPrice(me, 'perk') > 0);
  assert.equal(R.refundPerk(me, first).ok, true);
  assert.equal(R.resetPerks(me).ok, false, 'nothing to give back');
  // a saved walk: one node connects, one is cut off from the middle, one is not a node at all
  const terrain = standInTerrain(2, 2048);
  const room = createRoom({ id: 'perk-load', terrain, seed: 4, camps: [], createRules, hooks: { log: () => {} } });
  const back = room.addPlayer({ id: 11, name: 'L', cls: 'ranger', level: 12, room: 'perk-load', x: terrain.spawn.x, z: terrain.spawn.z, build: { v: 1, talents: {}, perks: [first, 'melee:6:0', 'nope'], unlocks: {} } }, null);
  assert.deepEqual(room.rules.saveBuild(back).perks, [first]);
});

test('Early Bond brings the class companion at level 1 once the point is spent', () => {
  const { me, R } = setup('ranger', 3);
  assert.equal(R.room.followers.of(me.r.unit).length, 0, 'no cat at level 3');
  const path = ['wild:1:0', 'wild:2:0', 'wild:3:0', 'wild:4:0', 'wild:5:0', 'wild:6:0'];
  void path;
  // walk the shortest way to the Early Bond keystone, spending bonus points for the test
  me.r.unit.bonusPerks = 40;
  const goal = 'wild:key:earlyBond';
  const prev = new Map([['start', null]]), q = ['start'];
  while (q.length) { const at = q.shift(); for (const nx of engine.forest.neighbours.get(at) || []) if (!prev.has(nx)) { prev.set(nx, at); q.push(nx); } }
  const walk = []; for (let at = goal; at && at !== 'start'; at = prev.get(at)) walk.unshift(at);
  for (const id of walk) assert.equal(R.takePerk(me, id).ok, true, id);
  assert.ok(me.r.unit.perkFlags.earlyBond);
  assert.equal(R.room.followers.of(me.r.unit).length, 1, 'the cat came');
});
