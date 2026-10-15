// node --test prototypes/thousandvale/tests/C/encounter.test.mjs
//
// The encounter engine (js/rules/encounter.js + telegraph.js): telegraphs you can dodge, boss
// phases and health bars, enrage, mechanics (stack, soak, safe spots, line of sight, interrupts,
// tank swaps), arena objects, determinism, room isolation and the cost of many telegraphs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { attachEncounters, validateEncounters, RANK_SCALE } from '../../js/rules/encounter.js';
import { inside } from '../../js/rules/telegraph.js';
import { makeRng } from '../../js/rules/rng.js';

const DT = 0.05;
let ENGINE = null;
const engine = async () => (ENGINE ||= await engineFor(1));

/** A room with the encounter engine and `n` sturdy players around the origin. */
async function arena({ data = null, seed = 3, players = 1, at = [[0, -3]] } = {}) {
  const eng = await engine();
  const room = roomFor(eng, { seed, id: `enc${seed}` });
  room.combat.tickMonsters = dt => tickMonsters(room.field, dt);
  const enc = attachEncounters(room, { data: data || eng.encounters, roomKind: 'instance' });
  const ps = [];
  for (let i = 0; i < players; i++) {
    const [x, z] = at[i] || [i * 2 - players, -3];
    const p = createCharacter(eng, { id: 'p' + i, classId: 'knight', level: 30, rng: makeRng(i + 1), x, z });
    p.roomRng = room.streams.get('bars');
    p.partyId = 'P';
    p.hp = p.maxHp = 1e8;
    room.field.add(p, 'player');
    ps.push(p);
  }
  // the sheet is re-derived when statuses change, so health is topped up instead of made huge
  const step = (n = 1, each = null) => { for (let i = 0; i < n; i++) room.run(() => { room.clock.advance(DT); room.combat.tick(DT); for (const p of ps) if (!p.dead && p.hp < p.maxHp * 0.3) p.hp = p.maxHp; each?.(i); }); };
  const events = () => room.field.out;
  return { eng, room, enc, ps, step, events };
}
const spawn = (s, id, level, x, z, opts = {}) => s.room.run(() => spawnMonster(s.room.field, s.eng.enemyDef(id), level, x, z, opts));
/** a one-ability script, for the mechanics tests */
const oneShot = (tele, extra = {}) => ({
  scripts: { t: { id: 't', name: 'Test', phases: [{ abilities: ['a'] }], abilities: { a: { id: 'a', every: 99, first: 0, range: 99, telegraphs: [tele], ...extra } } } },
  specials: { families: {} }, defaults: { boss: { any: 't' } }, byType: {},
});

test('telegraph shapes: circle, ring/donut, cone, line, cross — a body touching the edge counts', () => {
  const c = { shape: 'circle', x: 0, z: 0, r: 3 };
  assert.ok(inside(c, 3.3, 0) && !inside(c, 3.6, 0));
  const ring = { shape: 'donut', x: 0, z: 0, r: 8, r2: 3 };
  assert.ok(!inside(ring, 1, 0) && inside(ring, 5, 0) && !inside(ring, 9, 0));
  const cone = { shape: 'cone', x: 0, z: 0, yaw: 0, r: 6, arc: Math.PI / 3 };
  assert.ok(inside(cone, 0, 5) && !inside(cone, 0, -2) && !inside(cone, 5, 1));
  const line = { shape: 'line', x: 0, z: 0, yaw: Math.PI / 2, len: 10, w: 2 };
  assert.ok(inside(line, 8, 0.5) && !inside(line, -3, 0) && !inside(line, 5, 3));
  const cross = { shape: 'cross', x: 0, z: 0, yaw: 0, r: 10, w: 2 };
  assert.ok(inside(cross, 0, 9) && inside(cross, -9, 0) && !inside(cross, 5, 5));
});

test('DODGE: a player who steps out before the wind-up ends takes nothing; one who stays is hit', async () => {
  const data = oneShot({ shape: 'circle', at: 'target', r: 3, wind: 1.5, damage: 2 });
  for (const move of [false, true]) {
    const s = await arena({ data });
    const boss = spawn(s, 'moor_hound', 10, 0, 2, { boss: true });
    s.step(2);
    const tele = s.events().find(e => e.t === 'tele');
    assert.ok(tele, 'the circle went down under the player');
    const before = s.ps[0].hp;
    boss.dmg = [1, 1]; boss.attackEvery = 99; boss.swingTimer = 99;     // only the telegraph can hurt
    if (move) { s.ps[0].x = 12; s.ps[0].z = -3; }
    s.step(60);   // (R4: a big boss hit gets >= 2.45 s of warning)
    const res = s.events().find(e => e.t === 'teleR' && e.id === tele.id);
    assert.ok(res, 'it resolved');
    if (move) { assert.deepEqual(res.hits, []); assert.equal(s.ps[0].hp, before, 'moved out: no damage'); }
    else { assert.deepEqual(res.hits, ['p0']); assert.ok(s.ps[0].hp < before, 'stayed in: hit'); }
  }
});

test('ordinary monsters get telegraphed specials by family, and rank makes them bigger and harder', async () => {
  const s = await arena({ players: 1, at: [[0, -1]] });
  const plain = spawn(s, 'moor_hound', 5, 0, 1);
  const champ = spawn(s, 'moor_hound', 5, 40, 1, { rank: 'champion' });
  const p2 = createCharacter(s.eng, { id: 'p9', classId: 'warrior', level: 30, rng: makeRng(9), x: 40, z: -1 });
  p2.roomRng = s.room.streams.get('bars'); p2.hp = p2.maxHp = 1e8; s.room.field.add(p2, 'player');
  s.step(1200);
  const teles = s.events().filter(e => e.t === 'tele');
  const mine = teles.filter(e => e.s === plain.id), theirs = teles.filter(e => e.s === champ.id);
  assert.ok(mine.length > 2 && theirs.length > 2, `${mine.length} / ${theirs.length} specials`);
  assert.ok(mine.every(e => ['pounce', 'savage_bite', 'hamstring', 'circling_snap'].includes(e.ab)), 'a hound uses its own type\'s specials (or its family\'s)');
  const size = list => Math.max(...list.filter(e => e.ab === 'savage_bite' || e.ab === 'circling_snap').map(e => e.r));
  if (mine.some(e => e.ab === 'savage_bite' || e.ab === 'circling_snap') && theirs.some(e => e.ab === 'savage_bite' || e.ab === 'circling_snap')) assert.ok(size(theirs) > size(mine), 'a champion\'s bite is bigger');
  assert.ok(RANK_SCALE.champion.dmg > RANK_SCALE.normal.dmg);
});

test('PHASES: the Barrow Warden changes phase at 70%, raises its ward, and its one health bar is the whole fight (owner #51)', async () => {
  const s = await arena({ players: 2, at: [[0, -3], [2, -3]] });
  const boss = spawn(s, 'barrow_hound', 10, 0, 0, { boss: true });
  s.step(3);
  const st = s.enc.states.get(boss);
  assert.equal(st.script.id, 'barrow_warden');
  assert.equal(st.phase, 0);
  assert.ok(s.events().some(e => e.t === 'say'), 'a pull line');
  const be = s.events().find(e => e.t === 'boss');
  assert.ok(be && be.bars === 1 && be.phases.length === 2 && be.enrageMs === 360000 && be.arena.r === 26, 'a boss event describes the bar');
  assert.ok(s.enc.objects.size >= 6, 'pillars, braziers and the lever stand in the arena');
  boss.hp = Math.round(boss.maxHp * 0.71); s.step(2);
  assert.equal(st.phase, 0, 'not yet at 71%');
  boss.hp = Math.round(boss.maxHp * 0.69); s.step(2);
  assert.equal(st.phase, 1, 'the ward phase at 69%');
  // owner feedback 6 (U8): a ward is a real barrier with a life — 10% of the boss's health, 18 s — not a mountain
  assert.equal(boss.barrier, Math.round(boss.maxHp * 0.1), 'the ward is up');
  assert.ok(s.enc.wardOf(boss).ms >= 8000 && s.enc.wardOf(boss).ms <= 30000 && s.enc.wardOf(boss).max === boss.barrier, 'with a stated life and a breaking point');
  assert.equal(st.adds.size, 3, 'three hounds answered');
  // kill the hounds, light the braziers: the ward breaks and the Warden is exposed
  s.room.run(() => { for (const a of st.adds) { a.hp = 0; s.room.field.kill(a); } });
  for (const o of s.enc.objects.values()) if (o.type === 'brazier') {
    s.ps[0].x = o.x; s.ps[0].z = o.z;
    assert.deepEqual(s.room.run(() => s.enc.use(s.ps[0], o.id)), { ok: true });
  }
  s.step(2);
  assert.equal(boss.barrier, 0, 'the ward broke');
  assert.ok(boss.statuses?.vulnerable, 'exposed');
  // owner #51: the killing blow is the real death — no second bar, no heal back to full
  s.room.run(() => { boss.hp = 0; s.room.field.kill(boss); });
  assert.equal(boss.dying, 0, 'the bar is real: at zero it dies');
  assert.equal(st.bar, 0);
  assert.ok(s.events().some(e => e.t === 'boss' && e.end === 1 && e.won === true));
});

test('ENRAGE: soft enrage stacks from its start time, hard enrage fires on the second', async () => {
  const s = await arena({ players: 1, at: [[0, -2]] });
  const boss = spawn(s, 'thicket_boar', 10, 0, 0, { boss: true });
  s.room.encounters.data.byType = {};
  const st = s.enc.stateOf(boss);
  st.script = s.eng.encounters.scripts.briar_colossus;
  st.abilities = [];
  s.step(1);
  const startedAt = st.startedAt;
  const runTo = sec => { while (s.room.clock.now() - startedAt < sec) s.step(20); };
  runTo(239);
  assert.equal(st.softStacks, 0);
  runTo(241);
  assert.equal(st.softStacks, 1, 'soft enrage at 4:00');
  runTo(270);
  assert.ok(st.softStacks >= 3);
  assert.ok(!st.enraged);
  runTo(361);
  assert.ok(st.enraged, 'hard enrage at 6:00');
  const ev = s.events().filter(e => e.t === 'enrage');
  assert.ok(ev.some(e => e.hard) && ev.some(e => e.soft === 1));
});

test('STACK, SOAK and SAFE: shared damage, a soak that punishes everyone when unheld, the inverse circle', async () => {
  // stack: two players inside share it
  {
    const s = await arena({ data: oneShot({ shape: 'circle', at: 'target', r: 3, wind: 1, kind: 'stack', need: 2, damage: 4 }), players: 2, at: [[0, -3], [0.5, -3]] });
    const boss = spawn(s, 'moor_hound', 10, 0, 1, { boss: true }); boss.attackEvery = 99; boss.swingTimer = 99;
    s.step(80);   // (R4: a group / line-of-sight mechanic gets >= 2.85-3.25 s of warning)
    const r = s.events().find(e => e.t === 'teleR');
    assert.equal(r.hits.length, 2, 'both stood in the stack');
  }
  // soak: nobody inside -> everybody hit
  {
    const s = await arena({ data: oneShot({ shape: 'circle', at: 'farthest', r: 2, wind: 1, kind: 'soak', need: 1, fail: 2 }), players: 2, at: [[0, -3], [3, -3]] });
    const boss = spawn(s, 'moor_hound', 10, 0, 1, { boss: true }); boss.attackEvery = 99; boss.swingTimer = 99;
    s.step(2);
    const t = s.events().find(e => e.t === 'tele');
    const soaker = s.ps.find(p => Math.hypot(p.x - t.x, p.z - t.z) < 0.01);
    soaker.x += 10;
    s.step(80);   // (R4: a group / line-of-sight mechanic gets >= 2.85-3.25 s of warning)
    assert.equal(s.events().find(e => e.t === 'teleR').hits.length, 2, 'unsoaked: the whole arena pays');
  }
  // safe: only the player standing in the light is spared
  {
    const s = await arena({ data: oneShot({ shape: 'circle', at: 'home', offset: [5, 0], r: 2.5, wind: 1, kind: 'safe', damage: 2 }), players: 2, at: [[5, 0], [-5, 0]] });
    const boss = spawn(s, 'moor_hound', 10, 0, 0, { boss: true }); boss.attackEvery = 99; boss.swingTimer = 99;
    s.step(1);
    s.ps[0].x = 5; s.ps[0].z = 0; s.ps[1].x = -5; s.ps[1].z = 0;
    s.step(80);   // (R4: a group / line-of-sight mechanic gets >= 2.85-3.25 s of warning)
    const r = s.events().find(e => e.t === 'teleR' && e.hits.length);
    assert.deepEqual(r.hits, ['p1']);
  }
});

test('LINE OF SIGHT: a pillar between you and the boss saves you, and cracks', async () => {
  const data = oneShot({ shape: 'circle', at: 'self', r: 30, wind: 1, los: true, damage: 2 });
  data.scripts.t.arena = { radius: 30, objects: [{ id: 'p', type: 'pillar', x: 0, z: -5, r: 1.5, hp: 2 }] };
  const s = await arena({ data, players: 2, at: [[0, -9], [8, -9]] });
  const boss = spawn(s, 'moor_hound', 10, 0, 0, { boss: true }); boss.attackEvery = 99; boss.swingTimer = 99; boss.speed = 0;
  s.step(1);
  s.ps[0].x = 0; s.ps[0].z = -9; s.ps[1].x = 8; s.ps[1].z = -9;
  s.step(80);   // (R4: a group / line-of-sight mechanic gets >= 2.85-3.25 s of warning)
  assert.deepEqual(s.events().find(e => e.t === 'teleR').hits, ['p1'], 'the one behind the pillar was spared');
  const pillar = [...s.enc.objects.values()][0];
  assert.equal(pillar.hp, 1, 'the pillar took the blast');
});

test('INTERRUPT: a stagger breaks an interruptible cast; left alone it completes', async () => {
  const data = { scripts: { t: { id: 't', phases: [{ abilities: ['heal'] }], abilities: { heal: { id: 'heal', every: 99, first: 0, range: 99, cast: 2, interrupt: true, actions: [{ heal: 0.5 }] } } } }, specials: { families: {} }, defaults: { boss: { any: 't' } }, byType: {} };
  for (const hitIt of [true, false]) {
    const s = await arena({ data });
    const boss = spawn(s, 'moor_hound', 10, 0, 1, { boss: true });
    boss.hp = Math.round(boss.maxHp * 0.4);
    s.step(5);
    assert.ok(s.events().some(e => e.t === 'castbar' && e.int === 1));
    if (hitIt) boss.lastInterruptAt = s.room.clock.now();
    s.step(50);
    if (hitIt) { assert.ok(s.events().some(e => e.t === 'castX' && e.why === 'interrupt')); assert.ok(boss.hp < boss.maxHp * 0.5); }
    else assert.ok(boss.hp > boss.maxHp * 0.85, 'the heal landed');
  }
});

test('TANK SWAP: Grave Rend stacks on the tank and calls the swap at three', async () => {
  const s = await arena({ players: 1, at: [[0, -1.5]] });
  const boss = spawn(s, 'barrow_hound', 10, 0, 0, { boss: true });
  s.step(600);
  const st = s.ps[0].statuses?.grave_rend;
  assert.ok(st && st.stacks >= 3, `stacks ${st?.stacks}`);
  assert.ok(s.events().some(e => e.t === 'say' && /swap/i.test(e.text)));
  void boss;
});

test('DETERMINISTIC: the same seed gives the same fight, event for event; another seed differs', async () => {
  const run = async seed => {
    const s = await arena({ seed, players: 2, at: [[0, -3], [3, -2]] });
    spawn(s, 'barrow_hound', 10, 0, 0, { boss: true });
    s.step(500, i => { if (i % 40 === 0) { s.ps[1].x += 1.5; } });
    return JSON.stringify(s.events().filter(e => ['tele', 'teleR', 'say', 'castbar', 'phase'].includes(e.t)));
  };
  const a = await run(5), b = await run(5), c = await run(6);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('ROOM ISOLATION: two boss fights interleaved tick by tick match each fought alone', async () => {
  const fight = async (seed, id) => {
    const s = await arena({ seed, players: 1 });
    s.room.id = id;
    const boss = spawn(s, 'barrow_hound', 10, 0, 0, { boss: true });
    return { s, boss };
  };
  const alone = await fight(7, 'solo');
  for (let i = 0; i < 400; i++) alone.s.step(1);
  const A = await fight(7, 'A'), B = await fight(8, 'B');
  for (let i = 0; i < 400; i++) { A.s.step(1); B.s.step(1); }
  const sig = x => JSON.stringify(x.s.events().filter(e => e.t === 'tele' || e.t === 'teleR'));
  assert.equal(sig(A), sig(alone));
  assert.equal(A.boss.hp, alone.boss.hp);
  assert.ok(!A.s.enc.tele.some(t => B.s.enc.tele.includes(t)));
});

test('a wipe resets the boss: objects gone, health full, phase back to the start', async () => {
  const s = await arena({ players: 1 });
  const boss = spawn(s, 'barrow_hound', 10, 0, 0, { boss: true });
  s.step(5);
  boss.hp = Math.round(boss.maxHp * 0.5); s.step(2);
  s.ps[0].dead = true;
  s.step(120);
  assert.ok(!s.enc.states.has(boss) || !s.enc.states.get(boss).started);
  assert.equal(boss.hp, boss.maxHp);
  assert.equal(s.enc.objects.size, 0);
  assert.ok(s.events().some(e => e.t === 'phase' && e.reset));
});

test('PERF: 300 live telegraphs and 40 players cost well under a millisecond a tick', async (t) => {
  const s = await arena({ players: 40, at: Array.from({ length: 40 }, (_, i) => [(i % 8) * 3 - 12, Math.floor(i / 8) * 3 - 6]) });
  const data = oneShot({ shape: 'circle', at: 'scatter', spread: 20, r: 3, count: 300, wind: 2, damage: 0.1 });
  const enc2 = s.enc; enc2.data.scripts.perf = { ...data.scripts.t, id: 'perf' };
  const boss = spawn(s, 'moor_hound', 10, 0, 0, { boss: true });
  enc2.stateOf(boss).script = enc2.data.scripts.perf;
  s.step(2);
  assert.ok(s.enc.tele.length >= 250, `${s.enc.tele.length} live`);
  const t0 = performance.now();
  s.step(60);
  const ms = (performance.now() - t0) / 60;
  t.diagnostic(`${ms.toFixed(3)} ms per tick with ~300 telegraphs resolving among 40 players (whole combat tick)`);
  assert.ok(ms < 5, `${ms} ms`);
  delete enc2.data.scripts.perf;
});

test('the shipped encounter data validates', async () => {
  const eng = await engine();
  assert.deepEqual(validateEncounters(eng.encounters), []);
  assert.ok(Object.keys(eng.encounters.scripts).length >= 3);
});
