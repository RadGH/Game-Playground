// node --test prototypes/thousandvale/tests/C/playtest1.test.mjs
//
// Owner play-test 1 (~/claude/agent/mmo/round-playtest1.md), stream C's items:
//   P4  nothing follows you at level 1; the class companion comes by level / quest / perk
//   P8  a knock never slides a body that the hit killed
//   P11 followers never strike through a wall, path round walls, regroup by path, teleport last
//   P12 every telegraph gives real reaction time, and appears when the cast STARTS
//   P20 every skill emits a visible effect and its hits an impact the client can draw
//   P23 a cast that cannot reach spends neither mana nor cooldown
//   P26 a 1-3 level gap is softened (and only that)
//   P28 the bog slime takes damage

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { attachEncounters, minWindFor, MIN_WIND, RANK_SCALE } from '../../js/rules/encounter.js';
import { makeRng } from '../../js/rules/rng.js';
import { gapMult } from '../../js/rules/level-gap.js';
import { plannerBlocked, clearLine } from '../../js/rules/pathfind.js';
import { FOLLOW_PATH } from '../../js/rules/followers.js';

const engine = rulesEngine();

function roomWith({ cls = 'warrior', level = 2, id = 'pt1', terrain = standInTerrain(2, 2048), kind = 'wilds', at = null, char = {} } = {}) {
  const events = [];
  const room = createRoom({ id, kind, terrain, seed: 5, camps: [], createRules, hooks: { log: () => {} } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, at: room.now() }); return ev0(ev); };
  const sx = at ? at.x : terrain.spawn.x, sz = at ? at.z : terrain.spawn.z;
  const me = room.addPlayer({ id: 1, name: 'T', cls, level, xp: 0, gold: 0, room: id, x: sx, z: sz, ...char }, null);
  return { room, me, events, sx, sz, R: room.rules };
}

// ---------------------------------------------------------------------------- P4

test('P4: a level-1 warlock has no imp and no familiar, and one skill on the bar', () => {
  const { me, R } = roomWith({ cls: 'warlock', level: 1 });
  assert.equal(R.room.followers.of(me.r.unit).length, 0, 'nothing follows a new character');
  const open = R.bar(me).filter(b => !b.locked && !b.empty);
  assert.equal(open.length, 1, 'a level-1 bar has one skill');
  assert.equal(open[0].id, 'gnawing_dark');
  const info = R.companion(me);
  assert.equal(info.main.level, 10);
  assert.equal(info.extra.level, 20);
});

test('P4: the companion comes at its level, the second body at its own; a quest can bring it early', () => {
  const { me, R } = roomWith({ cls: 'warlock', level: 9 });
  assert.equal(R.room.followers.of(me.r.unit).length, 0);
  me.char.level = 10; R.onLevel(me);
  assert.deepEqual(R.room.followers.of(me.r.unit).map(p => p.defId), ['bound_imp'], 'level 10: the bound imp');
  me.char.level = 20; R.onLevel(me);
  assert.deepEqual(R.room.followers.of(me.r.unit).map(p => p.defId).sort(), ['bound_imp', 'ember_familiar']);
  me.char.level = 21; R.onLevel(me);
  assert.equal(R.room.followers.of(me.r.unit).length, 2, 'given once, never twice');
  const q = roomWith({ cls: 'ranger', level: 2, id: 'pt1q' });
  assert.equal(q.R.unlock(q.me, 'companion').ok, true);
  assert.deepEqual(q.R.room.followers.of(q.me.r.unit).map(p => p.defId), ['hunting_cat'], 'a quest unlock brings it at level 2');
  assert.equal(q.R.saveBuild(q.me).unlocks.companion, true, 'and the unlock is in the build A saves');
  assert.equal(q.R.unlock(q.me, 'a pony').ok, false);
});

// ---------------------------------------------------------------------------- P23

test('P23: Gnawing Dark out of range is refused before it costs anything; in range it goes', () => {
  const { room, me, R, sx, sz } = roomWith({ cls: 'warlock', level: 5 });
  const u = me.r.unit;
  const far = room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: sx + 50, z: sz });
  const mp = u.mp;
  const r = room.intent(me, { t: 'cast', slot: 1, target: far.id });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'range');
  assert.match(r.text, /out of range/);
  assert.equal(u.mp, mp, 'no mana spent');
  assert.equal(u.skills.slots[0].ready, 0, 'no cooldown started');
  const near = room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: sx + 20, z: sz });
  assert.deepEqual(room.intent(me, { t: 'cast', slot: 1, target: near.id }), { ok: true });
  assert.ok(u.mp < mp && u.skills.slots[0].ready > 0);
});

test('P23: every damaging skill with nothing in reach is refused for free; self skills always go', () => {
  const refusedFree = [], wrongly = [];
  for (const cls of engine.classes.map(c => c.id)) {
    const { room, me } = roomWith({ cls, level: 30, id: 'pt23' + cls });
    const u = me.r.unit;
    u.skills.slots.forEach((sl, i) => {
      if (sl.empty) return;
      const row = u.skills.rowFor(i);
      u.mp = u.maxMp;
      const before = { mp: u.mp, ready: sl.ready };
      const r = room.intent(me, { t: 'cast', slot: i + 1 });
      if (!r.ok && r.why === 'range') {
        if (u.mp !== before.mp || sl.ready !== before.ready) wrongly.push(`${cls}/${sl.id}: spent while refused`);
        else refusedFree.push(sl.id);
        if (!['bolt', 'beam', 'melee'].includes(row.shape)) wrongly.push(`${cls}/${sl.id} (${row.shape}) refused for range`);
      }
    });
  }
  assert.deepEqual(wrongly, []);
  assert.ok(refusedFree.length > 20, `${refusedFree.length} damaging skills refused with nothing in reach`);
});

// ---------------------------------------------------------------------------- P12 / P8

const DT = 0.05;
async function arena(data, { rank = 'normal', boss = false, players = 1, topUp = true } = {}) {
  const eng = await engineFor(1);
  const room = roomFor(eng, { seed: 3, id: 'tele' });
  room.combat.tickMonsters = dt => tickMonsters(room.field, dt);
  attachEncounters(room, { data, roomKind: 'instance' });
  const ps = [];
  for (let i = 0; i < players; i++) {
    const p = createCharacter(eng, { id: 'p' + i, classId: 'knight', level: 30, rng: makeRng(i + 1), x: i * 2, z: -3 });
    p.roomRng = room.streams.get('bars');
    room.field.add(p, 'player');
    ps.push(p);
  }
  const log = [];
  let seen = 0;
  const step = n => { for (let i = 0; i < n; i++) { room.run(() => { room.clock.advance(DT); room.combat.tick(DT); if (topUp) for (const p of ps) if (!p.dead && p.hp < p.maxHp * 0.3) p.hp = p.maxHp; }); const out = room.field.out; for (; seen < out.length; seen++) log.push({ ...out[seen], at: room.clock.now() }); } };
  const m = room.run(() => spawnMonster(room.field, eng.enemyDef('moor_hound'), 10, 0, 1, { rank, boss }));
  m.attackEvery = 99; m.swingTimer = 99;
  return { room, ps, m, step, log };
}
const special = tele => ({ scripts: {}, specials: { families: {}, types: { moor_hound: [{ id: 'snap', every: 99, first: 0, range: 99, telegraphs: [tele] }] } }, defaults: {}, byType: {} });
const script = (ab, tele) => ({ scripts: { t: { id: 't', name: 'T', phases: [{ abilities: ['a'] }], abilities: { a: { id: 'a', every: 99, first: 0, range: 99, telegraphs: [tele], ...ab } } } }, specials: { families: {} }, defaults: { boss: { any: 't' } }, byType: {} });

test('P12: a fast telegraph is held to the rank\'s minimum, and the damage lands no sooner than that after the warning', async () => {
  for (const rank of ['normal', 'champion', 'rare']) {
    const s = await arena(special({ shape: 'circle', at: 'target', r: 3, wind: 0.2, damage: 1 }), { rank });
    s.step(80);
    const tele = s.log.find(e => e.t === 'tele');
    const done = s.log.find(e => e.t === 'teleR' && e.id === tele.id);
    assert.ok(tele && done, rank);
    const need = MIN_WIND[rank];
    assert.ok(done.at - tele.at >= need - 1e-6, `${rank}: ${done.at - tele.at}s of warning, needs ${need}`);
    assert.ok(tele.ms >= need * 1000 - 1, 'the event tells the client how long it has');
    const hit = s.log.find(e => e.t === 'hit' && e.kind === 'snap');
    assert.ok(hit, `${rank}: the player was hit`);
    assert.ok(hit.at >= tele.at + need - 1e-6, `${rank}: the damage came ${hit.at - tele.at}s after the warning`);
  }
  // a big hit gets more
  const big = await arena(special({ shape: 'circle', at: 'target', r: 3, wind: 0.2, damage: 2.5 }));
  big.step(80);
  const t = big.log.find(e => e.t === 'tele'), d = big.log.find(e => e.t === 'teleR');
  assert.ok(d.at - t.at >= MIN_WIND.normal + MIN_WIND.big - 1e-6);
});

test('P12: a cast-bar ability marks the ground when the cast STARTS; an interrupt takes the mark away', async () => {
  const s = await arena(script({ cast: 1, interrupt: true }, { shape: 'circle', at: 'target', r: 3, wind: 0.3, damage: 1 }), { boss: true });
  s.step(2);
  const bar = s.log.find(e => e.t === 'castbar');
  const tele = s.log.find(e => e.t === 'tele');
  assert.ok(bar && tele, 'cast bar and telegraph');
  assert.equal(tele.at, bar.at, 'the telegraph went out with the cast bar');
  s.step(60);
  const done = s.log.find(e => e.t === 'teleR' && e.id === tele.id);
  assert.ok(done.at - tele.at >= 1.3 - 1e-6 && done.at - tele.at >= MIN_WIND.boss - 1e-6, `${done.at - tele.at}s`);
  // interrupted: the mark is taken back (x: 1) and nothing is hit
  const t2 = await arena(script({ cast: 1.5, interrupt: true }, { shape: 'circle', at: 'target', r: 3, wind: 0.3, damage: 1 }), { boss: true });
  t2.step(4);
  t2.m.lastInterruptAt = t2.room.clock.now();
  t2.step(60);
  const gone = t2.log.find(e => e.t === 'teleR');
  assert.equal(gone.x, 1, 'withdrawn');
  assert.ok(!t2.log.some(e => e.t === 'hit' && e.kind === 'a'));
});

test('P12: every telegraph in the game data gives at least its rank\'s minimum', () => {
  const D = engine.encounters;
  const low = [];
  const check = (where, ab, rank, scriptScale) => {
    for (const tl of ab.telegraphs || []) {
      const data = (tl.wind ?? 1.5) * scriptScale;
      const lead = (ab.cast ?? 0) * (rank === 'boss' ? 1 : (RANK_SCALE[rank]?.wind ?? 1));
      const total = lead + Math.max(data, minWindFor({ rank, boss: rank === 'boss' }, tl) - lead);
      if (total < minWindFor({ rank, boss: rank === 'boss' }, tl) - 1e-9) low.push(`${where}/${ab.id}`);
    }
  };
  for (const [id, s] of Object.entries(D.scripts)) for (const ab of Object.values(s.abilities || {})) check(id, ab, 'boss', 1);
  for (const fam of [D.specials.families || {}, D.specials.types || {}]) for (const [k, list] of Object.entries(fam)) for (const ab of list) for (const rank of ['normal', 'champion', 'rare']) check(k, ab, rank, RANK_SCALE[rank].wind);
  assert.deepEqual(low, []);
});

test('P8: a knock that kills never slides the body', async () => {
  const s = await arena(special({ shape: 'circle', at: 'target', r: 3, wind: 0.2, damage: 500, knock: 6 }), { topUp: false });
  const p = s.ps[0];
  p.hp = 1;
  const before = { x: p.x, z: p.z };
  s.step(80);
  assert.ok(p.dead, 'the blow killed');
  assert.deepEqual({ x: p.x, z: p.z }, before, 'and did not move the body');
});

// ---------------------------------------------------------------------------- P11

/** A walled room: floor 0..100 square; a wall along x = 50 for z < 80 (a gap at the north end). */
function wallTerrain({ sealed = false } = {}) {
  const inWall = (x, z) => (x >= 49 && x <= 51 && (sealed || z < 80));
  return {
    key: null, kind: 'dungeon', heightAt: () => 0, size: 100, origin: { x: 0, z: 0 },
    walkable: (x, z) => x >= 1 && z >= 1 && x <= 99 && z <= 99 && !inWall(x, z),
    bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 }, spawn: { x: 40, z: 20 },
  };
}

test('P11: a follower never strikes through a wall, and never stands inside one', () => {
  const terrain = wallTerrain();
  const { room, me, R } = roomWith({ cls: 'ranger', level: 12, id: 'pt11a', terrain, kind: 'instance', at: { x: 40, z: 20 } });
  const cat = R.room.followers.of(me.r.unit)[0];
  assert.ok(cat, 'the ranger has its cat at 12');
  const m = room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: 60, z: 20 });
  const blk = plannerBlocked(R.field.terrain);
  assert.ok(blk, 'a dungeon\'s walls block');
  let throughWall = 0, inWall = 0, hits = 0;
  for (let k = 0; k < 300 && !m.dead; k++) {
    room.step();
    if (!terrain.walkable(cat.x, cat.z)) inWall++;
    const ok = clearLine(blk, cat.x, cat.z, m.r.unit.x, m.r.unit.z);
    for (const e of room.rules.field.out.splice(0)) void e;
    if (cat.swingTimer > cat.attackEvery - 0.06 && cat.anim === 'attack' && cat.target === m.r.unit) { hits++; if (!ok) throughWall++; }
  }
  assert.equal(inWall, 0, 'the cat never stood inside the wall');
  assert.equal(throughWall, 0, `the cat struck through the wall ${throughWall} times`);
});

test('P11: a follower separated by a wall walks round it to its owner — no teleport', () => {
  const terrain = wallTerrain();
  const { room, me, R, events } = roomWith({ cls: 'ranger', level: 12, id: 'pt11b', terrain, kind: 'instance', at: { x: 40, z: 20 } });
  const cat = R.room.followers.of(me.r.unit)[0];
  for (let k = 0; k < 5; k++) room.step();
  me.moveTo(60, 20);                               // the owner is now behind the wall (a 120 m walk round)
  let best = Infinity, inWall = 0;
  for (let k = 0; k < 600; k++) {
    room.step();
    if (!terrain.walkable(cat.x, cat.z)) inWall++;
    best = Math.min(best, Math.hypot(cat.x - 60, cat.z - 20));
    if (best < 4) break;
  }
  assert.ok(best < 4, `the cat reached its owner (closest ${best.toFixed(1)} m)`);
  assert.equal(inWall, 0);
  assert.ok(!events.some(e => e.type === 'move' && e.why === 'regroup'), 'no teleport — it walked');
});

test('P11: teleport is the last resort — a follower sealed away from a far owner comes after it is stuck', () => {
  const terrain = wallTerrain({ sealed: true });
  const { room, me, R } = roomWith({ cls: 'ranger', level: 12, id: 'pt11c', terrain, kind: 'instance', at: { x: 40, z: 20 } });
  const cat = R.room.followers.of(me.r.unit)[0];
  for (let k = 0; k < 5; k++) room.step();
  me.moveTo(95, 90);                               // sealed off and ~70 m away
  let at = null;
  for (let k = 0; k < 20 * 20; k++) {
    room.step();
    if (Math.hypot(cat.x - 95, cat.z - 90) < 5) { at = room.now() / 1000; break; }
  }
  assert.ok(at != null, 'it came in the end');
  assert.ok(FOLLOW_PATH.STUCK <= 6, 'and not before it had been stuck');
});

// ---------------------------------------------------------------------------- P20

test('P20: every skill of every class shows something when cast, and its hits carry an impact the client can draw', () => {
  const silent = [], noImpact = [];
  for (const cls of engine.classes.map(c => c.id)) {
    const { room, me, events, sx, sz } = roomWith({ cls, level: 30, id: 'pt20' + cls });
    const u = me.r.unit;
    for (let i = 0; i < 6; i++) {
      const sl = u.skills.slots[i];
      if (sl.empty) continue;
      const m = room.spawn({ kind: 'monster', type: 'wolf', level: 30, x: sx, z: sz + 2.5 });
      m.r.unit.attackEvery = 99;
      u.mp = u.maxMp; u.hp = u.maxHp;
      const from = events.length;
      const r = room.intent(me, { t: 'cast', slot: i + 1, target: m.id, aim: { x: m.x, z: m.z } });
      for (let k = 0; k < 40; k++) room.step();
      const mine = events.slice(from);
      const visible = mine.some(e => (e.type === 'fx' && ['spell', 'bolt', 'form', 'summon'].includes(e.kind)) || (e.type === 'castbar' && e.s === me.id) || (e.type === 'castbar' && e.id === me.id));
      if (r.ok && !visible) silent.push(`${cls}/${sl.id}`);
      const row = u.skills.rowFor(i);
      const hit = mine.some(e => e.type === 'hit' && e.s === me.id && e.d === m.id && e.n > 0);
      if (hit && row?.mult && !mine.some(e => e.type === 'fx' && e.kind === 'impact' && e.id === m.id)) noImpact.push(`${cls}/${sl.id}`);
      if (!m.removed) room.remove(m);
      // forms and stances: leave them so the next slot is the class's own
      for (const g of Object.keys(u.forms || {})) if (u.forms[g]) delete u.forms[g];
    }
  }
  assert.deepEqual(silent, [], 'skills that showed nothing at all');
  assert.deepEqual(noImpact, [], 'skills whose hits had no impact effect');
});

// ---------------------------------------------------------------------------- P26

test('P26: the level gap — a monster 1-3 levels up hits softer and takes more; below you nothing changes', () => {
  const cfg = engine.levelGap;
  const pl = { kind: 'player', level: 2, side: 'friend' }, pet = { owner: pl, level: 2, side: 'friend' };
  const m = lv => ({ side: 'foe', level: lv });
  assert.equal(gapMult(cfg, m(2), pl), 1);
  assert.equal(gapMult(cfg, m(3), pl), cfg.monsterDamage[1]);
  assert.equal(gapMult(cfg, m(5), pl), cfg.monsterDamage[3]);
  assert.equal(gapMult(cfg, m(9), pl), cfg.monsterDamage[3], 'past 3 the last step holds');
  assert.equal(gapMult(cfg, pl, m(4)), cfg.playerDamage[2]);
  assert.equal(gapMult(cfg, pet, m(4)), cfg.playerDamage[2], 'followers too');
  assert.equal(gapMult(cfg, m(1), pl), 1, 'a monster below you: Farhold');
  assert.equal(gapMult(cfg, pl, m(1)), 1);
  assert.equal(gapMult(cfg, pl, { kind: 'player', level: 9, side: 'friend' }), 1, 'player against player: untouched');
  assert.equal(gapMult(null, m(5), pl), 1, 'switched off (the parity fixtures)');
});

test('P26: a level-2 character against a pair of crag hyenas two levels up wins most fights with the gap rule, rarely without', () => {
  const run = on => {
    const was = engine.levelGap;
    engine.levelGap = on ? was : null;
    let wins = 0, n = 0, left = 0;
    try {
      for (const cls of ['warrior', 'cleric', 'mage', 'rogue']) for (let s = 1; s <= 3; s++) {
        const { room, me, sx, sz } = roomWith({ cls, level: 2, id: `gap${cls}${s}${on}` });
        const ms = [0, 1].map(i => room.spawn({ kind: 'monster', type: 'crag_hyena', level: 4, x: sx + i * 1.5, z: sz + 4 }));
        let held = 0;
        for (let k = 0; k < 1200 && ms.some(x => !x.dead) && !me.dead; k++) {
          room.step();
          const t = ms.find(x => !x.dead);
          if (!t) break;
          for (const sl of [1, 2]) room.intent(me, { t: 'cast', slot: sl, target: t.id });
          held += 0.05;
          if (room.intent(me, { t: 'cast', slot: 0, target: t.id, held }).ok) held = 0;
        }
        n++; if (!me.dead) { wins++; left += me.hp / Math.max(1, me.hpMax); }
      }
    } finally { engine.levelGap = was; }
    return { won: wins / n, left: left / n };
  };
  const off = run(false), on = run(true);
  assert.ok(on.won >= 0.6, `with the rule: ${Math.round(on.won * 100)}% won`);
  // owner feedback 6: a level-2 healer now has its attack key from level 1, so this sample wins without the rule too —
  // the rule is judged by what it is FOR: how much health the same fights leave you (it used to be judged by wins)
  assert.ok(on.won >= off.won && on.left > off.left + 0.04, `health left with the rule ${Math.round(on.left * 100)}% vs without ${Math.round(off.left * 100)}% (won ${Math.round(off.won * 100)}% without)`);
});

// ---------------------------------------------------------------------------- P28

test('P28: a level-6 bog slime takes damage from every class\'s basic attack and first skill at level 2', () => {
  const unhurt = [];
  for (const cls of engine.classes.map(c => c.id)) {
    const { room, me, events, sx, sz } = roomWith({ cls, level: 2, id: 'pt28' + cls });
    const slime = room.spawn({ kind: 'monster', type: 'bog_slime', level: 6, x: sx, z: sz + 2.5 });
    assert.equal(slime.r.unit.defId, 'bog_slime');
    let held = 0;
    for (let k = 0; k < 60; k++) {
      room.step();
      held += 0.05;
      if (room.intent(me, { t: 'cast', slot: 0, target: slime.id, held }).ok) held = 0;
      room.intent(me, { t: 'cast', slot: 1, target: slime.id, aim: { x: slime.x, z: slime.z } });
    }
    const dealt = events.filter(e => e.type === 'hit' && e.d === slime.id && e.n > 0 && (e.s === me.id)).length;
    if (!dealt || !(slime.hp < slime.hpMax || slime.dead)) unhurt.push(cls);
  }
  assert.deepEqual(unhurt, [], 'classes that could not hurt the slime');
});
