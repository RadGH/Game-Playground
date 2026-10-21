// node --test prototypes/thousandvale/tests/C/guards.test.mjs
//
// Owner feedback 8, W1 (report #22): "the starting town is being raided. I died before I had a chance to do anything.
// Where are the town guards?" — the rules' half: a town guard is an ownerless friendly FIGHTER (js/rules/guards.js).
// The rules are pinned (who fights whom, who is paid, who is chosen first), and stream E's hold rule
// (data/provinces/guards.json `hold`) is checked on the LIVE path with the real raid waves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';

const engine = rulesEngine();
const G = JSON.parse(readFileSync(new URL('../../data/provinces/guards.json', import.meta.url), 'utf8'));
const EVENTS = JSON.parse(readFileSync(new URL('../../data/quests/events.json', import.meta.url), 'utf8'));
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
let n = 0;
function world() {
  const events = [], awards = [];
  const id = `gd-${++n}`;
  const room = createRoom({ id, terrain, seed: 5, camps: [], createRules, kind: 'wilds', hooks: { log: () => {}, award: (e, a) => awards.push({ id: e.id, ...a }) } });
  const w = { room, events, awards, tick: 0, R: room.rules };
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, tick: w.tick }); return ev0(ev); };
  let pid = 40;
  w.add = (cls, level, dx, dz) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: SX + dx, z: SZ + dz }, null);
  w.guard = (dx, dz, level = 3, rank = 'guard', name = 'Torborhold Guard') => room.rules.spawnGuard({ x: SX + dx, z: SZ + dz, yaw: 0, level, rank, name, town: 'Torborhold' });
  w.raider = (type, dx, dz, level = 3, extra = {}) => room.spawn({ kind: 'monster', type, level, x: SX + dx, z: SZ + dz, rank: extra.rank || 'normal', data: { event: 'ev1', noRank: true, ...(extra.data || {}) } });
  w.wild = (type, dx, dz, level = 3) => room.spawn({ kind: 'monster', type, level, x: SX + dx, z: SZ + dz, data: { noRank: true } });
  w.steps = (k = 1) => { for (let i = 0; i < k; i++) { room.step(); w.tick++; } };
  return w;
}
const hold = (e, w) => { const u = e.r.unit; u.maxHp = u.hp = 1e7; };

test('W1: a guard is built from stream E\'s numbers — the reference body two levels up, four times its health, a fifth of its hit, more armour; E\'s name; a sergeant on top', () => {
  const w = world();
  const g = w.guard(0, 0, 3), s = w.guard(4, 0, 3, 'sergeant', 'Sergeant Kettleby');
  const u = g.r.unit, su = s.r.unit;
  assert.equal(g.kind, 'npc'); assert.ok(g.data.guard); assert.equal(g.name, 'Torborhold Guard'); assert.equal(s.name, 'Sergeant Kettleby');
  assert.equal(u.guard, true); assert.equal(u.level, 3 + G.rules.levelOver);
  const ref = engine.rpg.makeEnemy(engine.enemyDef(G.rules.reference), u.level, w.room.rules.room.streams.get('spawn'), {});
  assert.ok(Math.abs(u.maxHp / (ref.maxHp * G.rules.hpMult) - 1) < 0.25, `health ${u.maxHp} ~ ${ref.maxHp} x ${G.rules.hpMult}`);
  assert.ok(u.dmg[1] <= Math.ceil(ref.dmg[1] * G.rules.dmgMult) + 1 && u.dmg[1] >= 1, `hit ${u.dmg} ~ ${ref.dmg} x ${G.rules.dmgMult}`);
  assert.equal(u.armor, Math.round(ref.armor + G.rules.armor));
  assert.ok(su.maxHp > u.maxHp * 1.2, 'a sergeant is tougher');
  assert.equal(g.hpMax, u.maxHp, 'the room entity shows its health');
  assert.equal(w.R.guards.list.length, 2);
  // an NPC the room spawned itself with `data.guard` gets its fighter with no call at all
  const own = w.room.spawn({ kind: 'npc', type: 'guard', name: 'Mawehaven Guard', level: 1, x: SX + 20, z: SZ, team: 1, data: { guard: { rank: 'guard', town: 'Mawehaven', level: 4 } } });
  assert.ok(own.r.unit?.guard, 'adopted in addEntity'); assert.equal(own.r.unit.level, 4 + G.rules.levelOver);
});

test('W1: raiders go for the guards first, the guards fight back and kill them — and a kill only guards made pays nobody, yet the raider is dead for the event', () => {
  const w = world();
  const me = w.add('warrior', 3, 0, -30);                      // a player in the town, well behind the gate, doing nothing
  const guards = [w.guard(-2, 0), w.guard(2, 0), w.guard(0, 2)];
  const raiders = [w.raider('road_brigand', -2, 26, 2), w.raider('road_brigand', 2, 27, 2)];
  for (const r of raiders) { assert.equal(r.r.unit.raider, true); assert.ok(guards.some(g => g.id === r.r.unit.targetId), 'its opening target is a guard'); }
  let firstHurt = null;
  for (let i = 0; i < 3000 && raiders.some(r => !r.dead); i++) {
    w.steps(1);
    if (!firstHurt) firstHurt = w.events.find(e => e.type === 'hit' && raiders.some(r => r.id === e.s));
  }
  assert.ok(raiders.every(r => r.dead), 'three guards kill two raiders');
  assert.ok(firstHurt && guards.some(g => g.id === firstHurt.d), 'the first thing a raider struck was a guard');
  assert.equal(w.events.filter(e => e.type === 'hit' && e.d === me.id).length, 0, 'nobody touched the player standing behind them');
  assert.ok(w.events.some(e => e.type === 'hit' && guards.some(g => g.id === e.s) && raiders.some(r => r.id === e.d) && e.n > 0), 'guards deal damage');
  assert.ok(raiders.every(r => r.dead && r.hp === 0), 'both are dead in the room (the event counts them)');
  assert.deepEqual(w.awards.filter(a => a.reason === 'kill'), [], 'no experience, gold or loot for anybody');
  assert.equal(w.events.filter(e => e.type === 'loot').length, 0);
  assert.ok(guards.every(g => !g.dead && !g.removed), 'the guards stand');
});

test('W1: a player who also hit the raider IS paid as always (the guards do not steal the kill)', () => {
  const w = world();
  const me = w.add('warrior', 3, 0, 3);
  w.guard(-2, 0); w.guard(2, 0);
  const r = w.raider('road_brigand', 0, 6, 2);
  for (let i = 0; i < 2000 && !r.dead; i++) { me.r.unit.swing.mainReady = 0; w.room.intent(me, { t: 'cast', slot: 0, target: r.id }); w.steps(1); }
  assert.ok(r.dead);
  const paid = w.awards.filter(a => a.reason === 'kill' && a.id === me.id);
  assert.equal(paid.length, 1); assert.ok(paid[0].xp > 0);
});

test('W1: a guard never dies — at no health it is down, nothing targets it, and it stands up whole after respawnSec; it cannot be hurt by players and never strikes one', () => {
  const w = world();
  const me = w.add('pyromancer', 20, 0, -6);
  const g = w.guard(0, 0);
  const u = g.r.unit;
  // a player's area skill on top of the guard does nothing to it
  const hp0 = u.hp;
  w.R.room.run(() => w.R.field.strikeArea(u.x, u.z, 6, me.r.unit, { power: 5, kind: 'skill' }));
  for (let s = 1; s <= 6; s++) { const sl = me.r.unit.skills.slots[s - 1]; if (sl) sl.ready = 0; me.r.unit.mp = me.r.unit.maxMp; w.room.intent(me, { t: 'cast', slot: s, target: g.id, aim: { x: u.x, z: u.z } }); w.steps(30); }
  assert.equal(u.hp, hp0, 'no player strike reaches a guard');
  // a brute knocks it down
  const brute = w.raider('road_brigand', 0, 3, 3);
  brute.r.unit.dmg = [300, 400]; brute.r.unit.maxHp = brute.r.unit.hp = 1e6;
  let down = null;
  for (let i = 0; i < 4000 && !down; i++) { w.steps(1); down = w.events.find(e => e.type === 'fx' && e.kind === 'guard' && e.id === g.id && e.down === 1); }
  assert.ok(down, 'it went down'); assert.equal(down.ms, G.rules.respawnSec * 1000);
  assert.equal(u.hp, 0); assert.equal(g.removed, false); assert.ok(u.dying == null, 'not a corpse');
  assert.equal(g.dead, false, 'no death');
  assert.notEqual(brute.r.unit.targetId, g.id, 'the raider lets go of a fallen guard');
  w.room.remove(brute);
  w.steps(Math.ceil(G.rules.respawnSec * 20) + 5);
  assert.equal(u.hp, u.maxHp, 'back on its feet at full health');
  assert.ok(w.events.some(e => e.type === 'fx' && e.kind === 'guard' && e.id === g.id && e.down === 0));
  assert.equal(w.events.filter(e => e.type === 'hit' && e.s === g.id && e.d === me.id).length, 0, 'never a player');
});

test('W1: guards mind their own business — wildlife walking by is left alone until it strikes someone under their eye; they keep to the leash, go back to the post and heal', () => {
  const w = world();
  const g = w.guard(0, 0);
  const u = g.r.unit;
  const hound = w.wild('moor_hound', 6, 0, 3);
  w.steps(100);
  assert.equal(w.events.filter(e => e.type === 'hit' && e.s === g.id).length, 0, 'a hound that hurt nobody is not attacked');
  assert.ok(Math.hypot(u.x - (SX), u.z - SZ) < 0.5, 'still at the post');
  const me = w.add('warrior', 3, 3, 0); hold(me);
  for (let i = 0; i < 600 && !w.events.some(e => e.type === 'hit' && e.s === g.id && e.d === hound.id); i++) w.steps(1);
  assert.ok(hound.r.unit.guardFoe, 'it bit a player in the guard\'s sight');
  assert.ok(w.events.some(e => e.type === 'hit' && e.s === g.id && e.d === hound.id), 'and now the guard fights it');
  // a raider far outside the leash is not chased
  const far = w.raider('road_brigand', 0, G.rules.leashM + 40, 3);
  far.r.unit.speed = 0; far.r.unit.ranged = null;
  w.room.remove(hound);
  u.hp = Math.round(u.maxHp * 0.4);
  let maxOut = 0;
  for (let i = 0; i < 20 * (G.rules.healsOutOfCombatSec + 6); i++) { w.steps(1); maxOut = Math.max(maxOut, Math.hypot(u.x - SX, u.z - SZ)); }
  assert.ok(maxOut <= G.rules.leashM + 0.5, `never past the leash (${maxOut.toFixed(1)} m)`);
  assert.ok(Math.hypot(u.x - SX, u.z - SZ) < 0.6, 'back at the post');
  assert.equal(u.hp, u.maxHp, `healed ${G.rules.healsOutOfCombatSec} s after the fight`);
});

test('W1: a newcomer draws a quarter of the threat and is never an opening target; a guard\'s hit on the raid captain is cut by vsBossMult', () => {
  const w = world();
  const newbie = w.add('warrior', 1, 0, 8), vet = w.add('warrior', 1, 3, 8);
  assert.equal(w.R.newcomer(newbie, true), true);
  assert.equal(newbie.r.unit.threatScale, G.raid.newcomerThreatMult);
  const g = w.guard(0, 0);
  // the raider spawns right beside the newcomer, the guard is further off: it still opens on the guard
  const r = w.raider('road_brigand', 0, 12, 2);
  assert.equal(r.r.unit.targetId, g.id);
  assert.equal(w.R.openingTarget(r, newbie)?.id, g.id, 'asked to open on a newcomer, it opens on a guard');
  // equal damage, a quarter of the threat
  const m = w.wild('moor_hound', 40, 40, 3); m.r.unit.maxHp = m.r.unit.hp = 1e6;
  w.R.room.run(() => { w.R.field.credit(m.r.unit, newbie.r.unit, 100); w.R.field.credit(m.r.unit, vet.r.unit, 100); });
  const t = m.r.unit.threat;
  assert.ok(Math.abs(t.get(newbie.id) / t.get(vet.id) - G.raid.newcomerThreatMult) < 1e-9, `${t.get(newbie.id)} vs ${t.get(vet.id)}`);
  assert.equal(w.R.newcomer(newbie, false), true); assert.equal(newbie.r.unit.threatScale, 1);
  assert.ok(g.r.unit.threatMult > 1, 'and a guard draws more than its damage');
  // the captain
  const w2 = world();
  w2.add('warrior', 3, 0, -40);
  const gs = [w2.guard(-1.5, 0), w2.guard(1.5, 0)];
  const cap = w2.raider('brigand_captain', 0, 2.5, 3, { rank: 'boss' });
  const grunt = w2.raider('road_brigand', 30, 0, 3);
  for (const x of [cap, grunt]) { x.r.unit.maxHp = x.r.unit.hp = 1e6; x.r.unit.dmg = [0, 0]; x.r.unit.speed = 0; x.r.unit.armor = 0; }
  assert.equal(cap.r.unit.boss, true);
  w2.steps(600);
  const onCap = w2.events.filter(e => e.type === 'hit' && gs.some(g2 => g2.id === e.s) && e.d === cap.id && e.kind === 'dmg');
  assert.ok(onCap.length >= 10, `${onCap.length} guard hits on the captain`);
  const avgCap = onCap.reduce((a, e) => a + e.n, 0) / onCap.length;
  const u = gs[0].r.unit, plain = (u.dmg[0] + u.dmg[1]) / 2;
  assert.ok(avgCap <= Math.max(1, plain * G.rules.vsBossMult * 3), `a guard's spear barely scratches the captain (${avgCap.toFixed(2)} a hit against ${plain} on a raider)`);
});

test('W1, the hold rule on the LIVE path: Torborhold\'s posted guards alone clear the raid\'s first wave with most of them standing; the same wave against one level-3 player with no guards kills the player', () => {
  const raid = EVENTS.realm.find(e => e.id === 'siege_torborhold');
  const posts = Object.values(G.posts).filter(p => p.town === 'Torborhold');
  assert.ok(posts.length >= 6, `${posts.length} posts in Torborhold`);
  const wave = raid.waves[0], count = Math.round((wave.count[0] + wave.count[1]) / 2);
  const cx = posts.reduce((a, p) => a + p.x, 0) / posts.length, cz = posts.reduce((a, p) => a + p.z, 0) / posts.length;
  // (a) guards alone — a player far behind them keeps the room awake and does nothing
  {
    const w = world();
    const me = w.add('warrior', raid.level, 0, -60); hold(me);
    // the posts as placed, squeezed onto the test ground: a gate line, the raiders arriving at it
    const gs = posts.map((p, i) => w.guard(((i % 5) - 2) * 3, Math.floor(i / 5) * 3, raid.level, p.rank, p.name));
    const rs = Array.from({ length: count }, (_, i) => w.raider(wave.type, ((i % 6) - 2.5) * 2.5, 28 + Math.floor(i / 6) * 3, wave.level));
    let t = 0;
    for (; t < 20 * 240 && rs.some(r => !r.dead); t++) w.steps(1);
    const standing = gs.filter(g => g.r.unit.hp > 0).length;
    assert.ok(rs.every(r => r.dead), `wave 1 (${count} x ${wave.type}) is cleared by ${gs.length} guards alone (${rs.filter(r => !r.dead).length} left after ${t / 20} s)`);
    assert.ok(standing / gs.length >= G.hold.wave1.minStandingShare, `${standing}/${gs.length} guards still standing (rule: ${G.hold.wave1.minStandingShare})`);
    assert.ok(t / 20 >= 12, `and it took them a while (${t / 20} s) — they hold, they do not sweep`);
    assert.equal(w.events.filter(e => e.type === 'hit' && e.d === me.id).length, 0);
    void cx; void cz;
  }
  // (b) what the owner met: the same wave, no guards, a new character
  {
    const w = world();
    const me = w.add('warrior', 1, 0, 0);
    Array.from({ length: count }, (_, i) => w.raider(wave.type, ((i % 6) - 2.5) * 2.5, 20 + Math.floor(i / 6) * 3, wave.level));
    for (let t = 0; t < 20 * 90 && !me.dead; t++) w.steps(1);
    assert.equal(me.dead, true, 'without guards a newcomer dies to the first wave (report #22)');
  }
  // (c) and with the guards posted, the same newcomer standing behind them lives through it
  {
    const w = world();
    const me = w.add('warrior', 1, 0, -10);
    w.R.newcomer(me, true);
    const gs = posts.map((p, i) => w.guard(((i % 5) - 2) * 3, Math.floor(i / 5) * 3, raid.level, p.rank, p.name));
    const rs = Array.from({ length: count }, (_, i) => w.raider(wave.type, ((i % 6) - 2.5) * 2.5, 28 + Math.floor(i / 6) * 3, wave.level));
    for (let t = 0; t < 20 * 240 && rs.some(r => !r.dead); t++) w.steps(1);
    assert.equal(me.dead, false, 'the newcomer behind the guards is alive when the wave is down');
    assert.ok(rs.every(r => r.dead)); void gs;
  }
});

test('#100: a guard with nothing at its post runs to a raider on a player within 110 m of it and fights beside them', () => {
  const w = world();
  const me = w.add('warrior', 6, 0, 80); hold(me);
  const g = w.guard(0, 0, 6);
  const r = w.raider('road_brigand', 0, 83, 6);
  w.R.room.run(() => { const u = r.r.unit; u.raider = true; u.state = 'chase'; u.targetId = me.id; (u.threat ||= new Map()).set(me.id, 50); });
  w.steps(20 * 30);
  const gu = g.r.unit;
  assert.ok(w.events.some(e => e.type === 'hit' && e.d === r.id && e.s === g.id), 'the guard struck the raider beside the player');
  assert.ok(Math.hypot(gu.post.x - (SX + 0), gu.post.z - (SZ + 0)) < 0.01, 'its post is where it was');
  void gu;
});
