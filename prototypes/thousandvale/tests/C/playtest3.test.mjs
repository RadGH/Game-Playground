// node --test prototypes/thousandvale/tests/C/playtest3.test.mjs
//
// Owner play-test 3 (~/claude/agent/mmo/round-playtest3.md), the rules side:
//   R4  every telegraph gives a person time to read the call-out, react and beat ~250 ms of latency; the
//       call-out goes out at the START; adds (minions) are called onto walkable floor, never into a wall
//   R5  every weapon's basic attack sends events the client can draw (swing + attack/projectile + impact)
//   R2  experience is a little faster; the starting chain's boss and dungeon are level 2 and winnable there

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { minWindFor, MIN_WIND, RANK_SCALE, isMechanic } from '../../js/rules/encounter.js';
import { planDungeon, FAMILIES } from '../../js/rules/dungeon-tiers.js';
import { dungeonTerrain } from '../../js/sim/dungeon.js';
import { xpForLevel } from '../../js/rules/farhold.js';

const engine = rulesEngine();
const D = engine.encounters;
const DT_STEPS = 20;          // room.step() = 50 ms

function roomOn(terrain, { kind = 'wilds', id = 'pt3', cls = 'knight', level = 30, at = null } = {}) {
  const events = [];
  const room = createRoom({ id, kind, terrain, seed: 9, camps: [], createRules, hooks: { log: () => {} } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, at: room.now() }); return ev0(ev); };
  const p = at || terrain.spawn;
  const me = room.addPlayer({ id: 1, name: 'T', cls, level, xp: 0, gold: 0, room: id, x: p.x, z: p.z }, null);
  return { room, me, events };
}

// ---------------------------------------------------------------------------- R4: the floors

test('R4: the floors are human-sized — >= 1.85 s for an ordinary monster, >= 2.05 s for a boss, + 0.8 s for a mechanic', () => {
  assert.ok(minWindFor({ rank: 'normal' }, { r: 3 }) >= 1.85 - 1e-9);
  assert.ok(minWindFor({ rank: 'champion' }, { r: 3 }) >= 1.95 - 1e-9);
  assert.ok(minWindFor({ boss: true }, { r: 3 }) >= 2.05 - 1e-9);
  assert.ok(MIN_WIND.latency >= 0.25, 'a 250 ms round trip is never the player\'s to use');
  for (const spec of [{ shape: 'donut', r: 5, r2: 2 }, { shape: 'ring', r: 5, r2: 2 }, { kind: 'stack', r: 3 }, { kind: 'soak', r: 3 }, { kind: 'safe', r: 3 }, { r: 3, los: true }]) {
    assert.ok(isMechanic(spec), JSON.stringify(spec));
    assert.ok(minWindFor({ rank: 'normal' }, spec) >= 1.85 + 0.8 - 1e-9, JSON.stringify(spec));
  }
  assert.ok(!isMechanic({ shape: 'circle', r: 3 }) && !isMechanic({ shape: 'line', len: 10 }));
});

/** Every telegraph an ability places, with the warning a player gets (cast bar + wind) at the rank it runs at. */
function warnings() {
  const out = [];
  const one = (where, ab, rank, scale) => {
    for (const tl of ab.telegraphs || []) {
      const e = { rank, boss: rank === 'boss' };
      const lead = (ab.cast ?? 0) * (rank === 'boss' ? 1 : scale);
      const total = lead + Math.max((tl.wind ?? 1.5) * (rank === 'boss' ? 1 : scale), minWindFor(e, tl) - lead);
      out.push({ where: `${where}/${ab.id}`, rank, total, need: minWindFor(e, tl), mech: isMechanic(tl), say: !!ab.say });
    }
  };
  for (const [id, s] of Object.entries(D.scripts)) for (const ab of Object.values(s.abilities || {})) one(id, ab, 'boss', 1);
  for (const fam of [D.specials.families || {}, D.specials.types || {}]) for (const [k, list] of Object.entries(fam)) for (const ab of list) for (const rank of ['normal', 'champion', 'rare']) one(k, ab, rank, RANK_SCALE[rank].wind);
  return out;
}

test('R4: every telegraph in every encounter script and every special meets its floor; every mechanic has a call-out', () => {
  const all = warnings();
  assert.ok(all.length > 300, `${all.length} telegraphs checked`);
  const low = all.filter(w => w.total < w.need - 1e-9 || w.total < (w.rank === 'boss' ? 2.05 : 1.85) - 1e-9).map(w => `${w.where} ${w.rank} ${w.total.toFixed(2)}s`);
  assert.deepEqual(low, []);
  const silent = all.filter(w => w.mech && !w.say).map(w => w.where);
  assert.deepEqual([...new Set(silent)], [], 'a mechanic you must read needs words: step in, stack, hide');
  // every mechanic gives at least 2.6 s
  const mechLow = all.filter(w => w.mech && w.total < 2.65 - 1e-9).map(w => `${w.where} ${w.total.toFixed(2)}s`);
  assert.deepEqual(mechLow, []);
});

test('R4: the pack leader\'s "get inside its reach" — a player 8 m out who starts at the call-out, 250 ms late, is inside in time', async () => {
  const pl = D.scripts.packleader.abilities.frenzy_ring;
  const tl = pl.telegraphs[0];
  assert.match(pl.say, /inside/);
  // as an elite (a dungeon mini-boss = champion) and as a boss
  for (const rank of ['champion', 'boss']) {
    const e = { rank, boss: rank === 'boss' };
    const lead = (pl.cast ?? 0);
    const total = lead + Math.max(tl.wind, minWindFor(e, tl) - lead);
    const run = (8 - (tl.r2 - 0.5)) / 5.4;            // a walking player (5.4 m/s), ending half a metre inside
    assert.ok(total >= 2.8, `${rank}: ${total.toFixed(2)} s of warning`);
    assert.ok(total - MIN_WIND.latency - 1.0 >= run, `${rank}: ${total.toFixed(2)} s - latency - 1 s to read leaves time to run ${run.toFixed(2)} s`);
  }
});

test('R4: live — the call-out goes out with (never after) the telegraph, and the damage never lands sooner than the floor', () => {
  const terrain = standInTerrain(2, 2048);
  const late = [], early = [];
  let teles = 0;
  for (const [id, s] of Object.entries(D.scripts)) {
    const { room, me, events } = roomOn(terrain, { id: 'r4' + id });
    const u = me.r.unit;
    const sx = terrain.spawn.x, sz = terrain.spawn.z;
    const type = engine.enemyDef(s.body) ? s.body : 'barrow_hound';
    const b = room.spawn({ kind: 'monster', type, level: 30, x: sx + 3, z: sz, rank: 'boss', data: { encounter: id } });
    const bu = b.r.unit;
    const phases = s.phases || [];
    for (let k = 0; k < 20 * 30; k++) {
      // walk the boss through its health phases, keep everyone alive
      const ph = phases[Math.min(phases.length - 1, Math.floor(k / (20 * 30 / Math.max(1, phases.length))))];
      room.rules.room.run(() => {
        if (ph && ph.at != null && bu.hp / bu.maxHp > ph.at) bu.hp = Math.max(1, Math.floor(bu.maxHp * ph.at) - 1);
        u.hp = u.maxHp;
      });
      if (me.dead) me.revive(1);
      room.step();
      if (b.dead || b.removed) break;
    }
    const bySay = events.filter(e => e.type === 'say' && e.id === b.id);
    for (const t of events.filter(e => e.type === 'tele' && e.s === b.id)) {
      teles++;
      const ab = s.abilities?.[t.ab];
      const done = events.find(e => e.type === 'teleR' && e.id === t.id && !e.x);
      if (done) {
        const tls = (ab?.telegraphs || []).filter(x => (x.shape || 'circle') === (t.shape || 'circle'));
        const tl = tls.reduce((m, x) => (minWindFor({ boss: true }, x) < minWindFor({ boss: true }, m) ? x : m), tls[0] || {});
        const need = minWindFor({ boss: true }, tl);
        if ((done.at - t.at) / 1000 < need - 0.051) early.push(`${id}/${t.ab}: ${((done.at - t.at) / 1000).toFixed(2)} s, needs ${need.toFixed(2)}`);
      }
      if (ab?.say) {
        const lines = [].concat(ab.say).map(x => new RegExp('^' + x.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(target|boss)\\?\}/g, '.*').replace(/\{(target|boss)\}/g, '.*') + '$'));
        const said = bySay.some(e => e.at <= t.at && e.at >= t.at - 30000 && lines.some(r => r.test(e.text)));
        if (!said) late.push(`${id}/${t.ab}`);
      }
    }
  }
  assert.ok(teles > 150, `${teles} telegraphs watched`);
  assert.deepEqual([...new Set(early)], []);
  assert.deepEqual([...new Set(late)], []);
});

// ---------------------------------------------------------------------------- R4: adds on the floor

/** Scripts that call adds anywhere (a phase, an ability, a trigger, an interrupt). */
const ADDERS = Object.entries(D.scripts).filter(([, s]) => /"adds"/.test(JSON.stringify(s))).map(([id]) => id);

test('R4: adds are called onto walkable floor — every script with adds, boss jammed into a dungeon corner, every family', () => {
  assert.ok(ADDERS.length >= 10, `${ADDERS.length} scripts call adds`);
  const families = Object.keys(FAMILIES).filter(k => FAMILIES[k].ready);
  const bad = [];
  let called = 0;
  for (const fam of families) {
    const plan = planDungeon(4242, { floors: 2, level: 6, family: fam });
    const terr = dungeonTerrain(plan);
    const f = plan.floors[0];
    const cell = plan.cell;
    // the floor tile with the most wall round it (a corner of the miniboss room, or a corridor end)
    const room = f.rooms.find(r => r.kind === 'miniboss') || f.rooms[0];
    let corner = null, worst = -1;
    for (let j = room.j; j < room.j + room.h; j++) for (let i = room.i; i < room.i + room.w; i++) {
      const x = f.origin.x + (i + 0.5) * cell, z = f.origin.z + (j + 0.5) * cell;
      if (!terr.walkable(x, z)) continue;
      let walls = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (!terr.walkable(x + di * cell, z + dj * cell)) walls++;
      if (walls > worst) { worst = walls; corner = { x, z }; }
    }
    for (const id of ADDERS) {
      const s = D.scripts[id];
      const { room: rm, me, events } = roomOn(terr, { kind: 'instance', id: 'r4a' + fam + id, at: corner });
      const type = engine.enemyDef(s.body) ? s.body : 'barrow_hound';
      const b = rm.spawn({ kind: 'monster', type, level: 6, x: corner.x, z: corner.z, rank: 'boss', data: { encounter: id } });
      const bu = b.r.unit, u = me.r.unit;
      const steps = 20 * 40, phases = s.phases || [];
      const seen = new Set();
      for (let k = 0; k < steps; k++) {
        const ph = phases[Math.min(phases.length - 1, Math.floor(k / (steps / Math.max(1, phases.length))))];
        rm.rules.room.run(() => {
          if (ph && ph.at != null && bu.hp / bu.maxHp > ph.at) bu.hp = Math.max(1, Math.floor(bu.maxHp * ph.at) - 1);
          if (ph && ph.newBar && k % 200 === 199) bu.hp = 1;
          u.hp = u.maxHp; u.x = corner.x; u.z = corner.z;
          bu.x = corner.x; bu.z = corner.z;                  // the boss stays jammed in its corner
          // anything with a timer goes now (an add call on an ability)
          const st = rm.rules.room.encounters.states.get(bu);
          if (st && k % 60 === 0) for (const kk of Object.keys(st.timers)) st.timers[kk] = 0;
        });
        if (me.dead) me.revive(1);
        rm.step();
        for (const e of rm.entities.values()) {
          if (e.kind !== 'monster' || e === b || seen.has(e.id)) continue;
          const un = e.r?.unit;
          if (!un || !un.addOf) continue;
          seen.add(e.id);
          called++;
          const sx = un.home?.[0] ?? e.x, sz = un.home?.[1] ?? e.z;
          if (!terr.walkable(sx, sz)) bad.push(`${fam}/${id}: add at (${sx.toFixed(1)}, ${sz.toFixed(1)}) in a wall`);
          // reachable from the boss in a straight line (not in the next room through a wall)
          const L = Math.hypot(sx - corner.x, sz - corner.z), n = Math.max(1, Math.ceil(L / 0.5));
          for (let q = 1; q < n; q++) if (!terr.walkable(corner.x + (sx - corner.x) * q / n, corner.z + (sz - corner.z) * q / n)) { bad.push(`${fam}/${id}: add behind a wall`); break; }
        }
        if (b.dead || b.removed) break;
      }
      void events;
    }
  }
  assert.ok(called >= ADDERS.length * families.length * 0.5, `${called} adds called`);
  assert.deepEqual(bad.slice(0, 20), []);
});

// ---------------------------------------------------------------------------- R7: the arena the client gets

test('R7: the Chained Saint\'s pillars reach the client as chained pillars tethered to the Saint', () => {
  const terrain = standInTerrain(2, 2048);
  const { room, me } = roomOn(terrain, { id: 'r7' });
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const b = room.spawn({ kind: 'monster', type: 'stone_sentinel', level: 10, x: sx + 3, z: sz, rank: 'elite', data: { encounter: 'mb_chained_saint' } });
  for (let k = 0; k < 20; k++) { if (me.dead) me.revive(1); room.step(); }
  const pillars = [...room.entities.values()].filter(e => e.kind === 'object' && e.type === 'pillar');
  assert.equal(pillars.length, 4, 'four pillars on the floor at the pull');
  for (const p of pillars) {
    const info = p.info();
    assert.match(info.name, /pillar/i);
    assert.equal(info.look, 'chained');
    assert.equal(info.tether, b.id, 'the chain runs to the Saint');
  }
});

// ---------------------------------------------------------------------------- R5: every weapon draws

import { attuneWeapon } from '../../js/rules/farhold.js';
import { makeRng } from '../../js/rules/rng.js';

const ITEMS = JSON.parse(readFileSync(new URL('../../../emberveil/data/items.json', import.meta.url), 'utf8'));
const BASES = Object.keys(ITEMS.weaponBases);

test('R5: every weapon base\'s basic attack sends what the client needs to draw it — swing (wk/wt/el), the attack or projectile, the impact', () => {
  const terrain = standInTerrain(2, 2048);
  const bad = [];
  const seen = { melee: 0, arrow: 0, bolt: 0, staff: 0 };
  for (const base of BASES) {
    const { room, me, events } = roomOn(terrain, { id: 'r5' + base, cls: 'warrior', level: 10 });
    const u = me.r.unit;
    const item = room.rules.room.run(() => attuneWeapon(engine.rpg.loot.generate(base, 'normal', 'medium', { rng: makeRng(7) })));
    room.rules.room.run(() => { engine.rpg.equip(u, item, { force: true }); engine.rpg.refresh(u); });
    const w = ITEMS.weaponBases[base];
    const dist = w.ranged ? 12 : w.subtype === 'wand' ? 9 : w.subtype === 'staff' ? 2.5 : 1.6;
    const sx = terrain.spawn.x, sz = terrain.spawn.z;
    const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 10, x: sx + dist, z: sz });
    m.r.unit.maxHp = m.r.unit.hp = 99999; m.r.unit.speed = 0; m.r.unit.attackEvery = 999;
    for (let k = 0; k < 20 * 4; k++) {
      if (k % 5 === 0) room.intent(me, { t: 'cast', slot: 0, target: m.id, yaw: Math.PI / 2 });
      room.step();
      room.rules.room.run(() => { m.r.unit.x = sx + dist; m.r.unit.z = sz; });
    }
    const swing = events.find(e => e.type === 'cast' && e.s === me.id && e.skill === 'basic' && e.clip !== 'draw');
    if (!swing || !swing.wk || !swing.wt || !swing.el) { bad.push(`${base}: swing event without wk/wt/el ${JSON.stringify(swing)}`); continue; }
    seen[swing.wk] = (seen[swing.wk] || 0) + 1;
    const fx = events.find(e => e.type === 'fx' && e.id === me.id && ['attack', 'bolt', 'arrow'].includes(e.kind) && e.wt && e.el);
    if (!fx) bad.push(`${base} (${swing.wk}): no attack/bolt/arrow fx with wt + el`);
    else if (fx.kind === 'attack' && !fx.shape) bad.push(`${base}: attack fx without a shape`);
    if (swing.wk === 'melee' && !(swing.reach > 0 && swing.arc > 0)) bad.push(`${base}: melee swing without reach/arc`);
    const imp = events.find(e => e.type === 'fx' && e.kind === 'impact' && e.id === m.id && e.src === me.id);
    if (!imp) bad.push(`${base} (${swing.wk}): no impact on the target`);
  }
  assert.deepEqual(bad, []);
  assert.ok(seen.melee > 10 && seen.arrow >= 4 && seen.staff >= 4, JSON.stringify(seen));
});

test('R5: a gloom (shadow) staff draws a shadow spell — the owner\'s report', () => {
  const terrain = standInTerrain(2, 2048);
  const { room, me, events } = roomOn(terrain, { id: 'r5gloom', cls: 'warlock', level: 10 });
  const u = me.r.unit;
  const item = room.rules.room.run(() => attuneWeapon(engine.rpg.loot.generate('staff', 'normal', 'medium', { rng: makeRng(7) })));
  item.castElement = 'shadow';
  room.rules.room.run(() => { engine.rpg.equip(u, item, { force: true }); engine.rpg.refresh(u); });
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const m = room.spawn({ kind: 'monster', type: 'barrow_hound', level: 10, x: sx + 2.5, z: sz });
  m.r.unit.maxHp = m.r.unit.hp = 99999; m.r.unit.speed = 0; m.r.unit.attackEvery = 999;
  for (let k = 0; k < 40; k++) { if (k % 5 === 0) room.intent(me, { t: 'cast', slot: 0, target: m.id }); room.step(); }
  const sw = events.find(e => e.type === 'cast' && e.s === me.id && e.skill === 'basic');
  assert.equal(sw.wk, 'staff'); assert.equal(sw.wt, 'staff');
  const fx = events.find(e => e.type === 'fx' && e.id === me.id && (e.kind === 'attack' || e.kind === 'bolt') && e.wt === 'staff');
  assert.ok(fx, 'the staff spell is an event');
  assert.equal(fx.el, 'shadow');
});

// ---------------------------------------------------------------------------- R2: the starting chain

const START = JSON.parse(readFileSync(new URL('../../data/quests/start.json', import.meta.url), 'utf8')).quests;
const SHEET = JSON.parse(readFileSync(new URL('../../data/provinces/torbor_downs.json', import.meta.url), 'utf8'));

/** A bot fight in a real room: `camps` round the player, every slot pressed, the basic attack held/released. */
function botFight(cls, level, camps, seed = 1, maxSteps = 4000) {
  const terrain = standInTerrain(2, 2048), sx = terrain.spawn.x, sz = terrain.spawn.z;
  const room = createRoom({ id: `f${cls}${level}${seed}`, kind: 'wilds', terrain, seed, createRules, hooks: { log: () => {} },
    // noRank: the AUTHORED camp (play-test 4 S4 rolls champions/rares from level 4; those are meant to be harder)
    camps: camps.map(c => ({ respawnMs: 1e9, radius: 2, noRank: true, ...c, x: sx + (c.dx ?? 0), z: sz + (c.dz ?? 6) })),
    encounterInfo: { mb_old_gristle: { name: 'Old Gristle', body: 'moor_hound' } } });
  const me = room.addPlayer({ id: 1, name: 'T', cls, level, xp: 0, gold: 0, room: room.id, x: sx, z: sz }, null);
  room.step();
  const foes = () => [...room.entities.values()].filter(e => e.kind === 'monster' && !e.dead);
  let held = 0, k = 0;
  for (; k < maxSteps && !me.dead && foes().length; k++) {
    room.step();
    const t = foes().sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    if (!t) break;
    for (const sl of [1, 2, 3]) room.intent(me, { t: 'cast', slot: sl, target: t.id });
    held += 0.05;
    if (room.intent(me, { t: 'cast', slot: 0, target: t.id, held }).ok) held = 0;
  }
  return { won: !me.dead && !foes().length, seconds: k / 20, me };
}

test('R2: experience is a little faster — kills x1.5, quests and events x1.25; the level curve is unchanged', () => {
  assert.equal(engine.xpCfg.kill, (engine.balance.xp.kill ?? 0.2) * 1.5);
  assert.equal(engine.xpMult('quest'), 1.25);
  assert.equal(engine.xpMult('event'), 1.25);
  const terrain = standInTerrain(2, 2048);
  const { room, me } = roomOn(terrain, { id: 'r2xp', cls: 'warrior', level: 1 });
  const m = room.spawn({ kind: 'monster', type: 'moor_hound', level: 1, x: terrain.spawn.x + 30, z: terrain.spawn.z });
  const before = engine.rpg.killXpFor(me.r.unit, m.r.unit, engine.balance.xp);
  const now = engine.rpg.killXpFor(me.r.unit, m.r.unit, engine.xpCfg);
  assert.ok(now >= 3 && now > before, `a level-1 hound pays ${now} (was ${before})`);
  // grey cons still pay nothing
  const { me: me6 } = roomOn(terrain, { id: 'r2xp6', cls: 'warrior', level: 6 });
  assert.equal(engine.rpg.killXpFor(me6.r.unit, m.r.unit, engine.xpCfg), 0, 'five levels below pays nothing');
  // a real kill pays the new amount
  const xp0 = me.char.xp || 0;
  const near = room.spawn({ kind: 'monster', type: 'moor_hound', level: 1, x: terrain.spawn.x + 1.4, z: terrain.spawn.z });
  for (let k = 0; k < 100 && !near.dead; k++) { room.rules.room.run(() => { near.r.unit.hp = Math.min(near.r.unit.hp, 1); }); room.intent(me, { t: 'cast', slot: 0, target: near.id }); room.step(); }
  assert.ok(near.dead, 'killed');
  assert.equal((me.char.xp || 0) - xp0, now);
});

test('R2: Old Gristle is a level-2 boss with level-2 health, and his quest (and the one before it) are level 2', () => {
  const g = D.scripts.mb_old_gristle;
  assert.equal(g.level, 2);
  const q = Object.fromEntries(START.map(x => [x.id, x]));
  assert.equal(q.start_old_gristle.level, 2);
  assert.equal(q.start_signs_of_the_beast.level, 2);
  // his health at level 2 is about a level-2 character's own (the owner: 272 hp boss vs his 130)
  const terrain = standInTerrain(2, 2048);
  const { room, me } = roomOn(terrain, { id: 'r2g', cls: 'warrior', level: 2 });
  const b = room.spawn({ kind: 'monster', type: 'moor_hound', level: 2, x: terrain.spawn.x + 30, z: terrain.spawn.z, rank: 'rare', data: { encounter: 'mb_old_gristle' } });
  room.rules.room.encounters.stateOf(b.r.unit);
  assert.ok(b.r.unit.maxHp <= me.r.unit.maxHp * 1.6, `Gristle ${b.r.unit.maxHp} hp vs a level-2 warrior's ${me.r.unit.maxHp}`);
});

test('R2: the whole starting chain is winnable at its levels (bot that never dodges, all 30 classes)', () => {
  const classes = engine.classes.map(c => c.id);
  const report = [];
  // Old Gristle at level 2 (and even at level 1)
  const g2 = classes.filter(c => botFight(c, 2, [{ type: 'moor_hound', level: 2, count: 1, rank: 'rare', encounter: 'mb_old_gristle' }]).won).length;
  report.push(`Gristle L2: ${g2}/30`);
  assert.ok(g2 >= 28, report.join('; '));
  // every kill step: a PAIR of its monster at the quest's level (the worst a camp near the start holds), player at that level
  for (const qd of START) for (const s of qd.steps.filter(x => x.kind === 'kill' || x.kind === 'collect')) {
    const type = s.type || s.from;
    const won = classes.filter(c => botFight(c, qd.level, [{ type, level: qd.level, count: 2 }], 3, 3000).won).length;
    report.push(`${qd.id} ${type} x2 L${qd.level}: ${won}/30`);
    assert.ok(won >= 27, report.join('; '));
  }
});

test('R2: the chain levels you into it — rewards + the kills it asks for take a new character past level 4 by Home with News', () => {
  const lvOf = xp => engine.rpg ? (() => { let l = 1; while (xpForLevel(l + 1) <= xp) l++; return l; })() : 1;
  const terrain = standInTerrain(2, 2048);
  let xp = 0;
  const order = ['start_two_good_legs', 'start_letters_south', 'start_signs_of_the_beast', 'start_old_gristle', 'start_road_to_orrinsford', 'start_the_priors_favour', 'start_home_with_news'];
  const q = Object.fromEntries(START.map(x => [x.id, x]));
  const trace = [];
  for (const id of order) {
    const qd = q[id];
    const level = lvOf(xp);
    for (const s of qd.steps.filter(x => x.kind === 'kill' || x.kind === 'collect' || x.kind === 'killOne')) {
      const { room, me } = roomOn(terrain, { id: 'walk' + id, cls: 'warrior', level });
      const n = s.kind === 'killOne' ? 1 : s.kind === 'collect' ? Math.ceil(s.count / (s.chance || 1)) : s.count;
      const type = s.kind === 'killOne' ? 'moor_hound' : (s.type || s.from);
      const m = room.spawn({ kind: 'monster', type, level: qd.level, x: terrain.spawn.x + 30, z: terrain.spawn.z, rank: s.kind === 'killOne' ? 'rare' : 'normal' });
      xp += n * engine.rpg.killXpFor(me.r.unit, m.r.unit, engine.xpCfg);
    }
    const span = xpForLevel(qd.level + 1) - xpForLevel(qd.level);
    xp += Math.round((qd.reward?.xp || 0) * span * engine.xpMult('quest'));
    trace.push(`${id}: L${lvOf(xp)} (${xp} xp)`);
  }
  if (process.env.TV_TRACE) console.log(trace.join('\n'));
  assert.ok(lvOf(xp) >= 4, trace.join('; '));
  assert.ok(lvOf(xp) <= 6, 'and not past the province story\'s first level-band: ' + trace.join('; '));
});

test('R2: the Ploughman\'s Crypt (the Barrow entrance by Torborhold) is a level-2 dungeon with a level-2 mini-boss', () => {
  const ds = SHEET.zones.test.dungeon;
  assert.equal(ds.level, 2);
  const plan = planDungeon(99, { floors: ds.floors, level: ds.level, family: ds.family, floorStep: ds.floorStep, eliteStep: ds.eliteStep, bossStep: ds.bossStep });
  const mb0 = plan.floors[0].packs.find(p => p.encounter && p.rank === 'elite');
  assert.equal(mb0.level, 2, 'first floor mini-boss');
  assert.ok(plan.floors[0].packs.every(p => p.level <= 2), 'nothing on floor 1 above level 2');
  const boss = plan.floors.at(-1).packs.find(p => p.rank === 'boss');
  assert.ok(boss.level <= 4, `last boss level ${boss.level}`);
  // the other dungeons keep the old steps
  const other = planDungeon(99, { floors: 2, level: 3, family: 'crypt_spiral' });
  assert.equal(other.floors[0].packs.find(p => p.encounter && p.rank === 'elite').level, 4);
});
