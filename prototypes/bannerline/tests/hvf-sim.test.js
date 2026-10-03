// Hunters vs Farmers match sim, H2 (docs/hvf-PLAN.md §16.3, 16.5, 16.6): determinism, snapshot /
// restore between vision updates, vision golden cases, and the rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHvf, restoreHvf, hvfData, data, seats, ent } from './hvf-helpers.mjs';
import { KIND } from '../js/sim/modes/hvf/mapgen.js';
import { liveGrid, cellOf, canStand } from '../js/sim/modes/hvf/grid.js';
import { seeFrom, stamp, hasBit, updateVision, canSee } from '../js/sim/modes/hvf/vision.js';
import { priceOf, comfortOf } from '../js/sim/modes/hvf/farm.js';
import { hurt } from '../js/sim/modes/hvf/units.js';
import { ringBell } from '../js/sim/modes/hvf/animals.js';
import * as Q from '../js/sim/modes/hvf/query.js';

const rejects = s => s.drainEvents().filter(e => e.type === 'reject').map(e => e.reason);
const at = (s, e, x, z) => { e.x = e.px = x; e.z = e.pz = z; };
const released = s => { s.state.hvf.releaseTick = 0; };
// an open, buildable spot on the Commons, `dx` metres east of its centre
const commonsSpot = (s, dx = 6) => ({ x: s.map.commons.x + dx, z: s.map.commons.z });
const buildNow = (s, pid, kind, x, z) => { s.step([{ p: pid, type: 'build', kind, x, z }]); for (let i = 0; i < 400 && ent(s, pid).ord.k === 'build'; i++) s.step(); };

// ── determinism + snapshot ──────────────────────────────────────────────────────────────────────
function script(s) {
  // farmers build on the Commons then wander off; the hunter chases whatever it can see
  return tick => {
    const out = [];
    if (tick === 5) out.push({ p: 0, type: 'build', kind: 'coop', ...commonsSpot(s, 6) }, { p: 1, type: 'build', kind: 'pen', ...commonsSpot(s, -7) });
    if (tick === 400) out.push({ p: 0, type: 'move', x: s.map.hollows[0].x, z: s.map.hollows[0].z });
    if (tick > 900 && tick % 60 === 0) {
      const h = ent(s, 2);
      const ctx = { state: s.state, data: s.data, map: s.map, emit: () => {} };
      const t = s.state.ents.find(e => e.team === 0 && e.alive && !e._gone && e.kind !== 'building' && canSee(ctx, 1, e));
      if (t) out.push({ p: 2, type: 'attack', target: t.id });
      else out.push({ p: 2, type: 'move', x: s.map.commons.x, z: s.map.commons.z });
    }
    return out;
  };
}

test('two sims with the same commands keep the same hash for 3 minutes', () => {
  const a = createHvf({ format: '2v1', seed: 11 }), b = createHvf({ format: '2v1', seed: 11 });
  const sa = script(a), sb = script(b);
  for (let t = 1; t <= 3600; t++) {
    a.step(sa(t)); b.step(sb(t));
    if (t % 200 === 0) assert.equal(a.hash(), b.hash(), `tick ${t}`);
  }
  assert.ok(a.state.ents.some(e => e.kind === 'animal' || e.kind === 'building'), 'something happened');
});

test('a snapshot restored between vision updates continues exactly like the original', () => {
  const a = createHvf({ format: '2v1', seed: 12 });
  const sa = script(a);
  for (let t = 1; t <= 1202; t++) a.step(sa(t));   // 1202 % 4 = 2: neither team's vision tick
  const b = restoreHvf(a.snapshot());
  assert.equal(b.hash(), a.hash());
  const sb = script(b);
  for (let t = 1203; t <= 2400; t++) { a.step(sa(t)); b.step(sb(t)); if (t % 100 === 0) assert.equal(a.hash(), b.hash(), `tick ${t}`); }
});

// ── vision golden cases ─────────────────────────────────────────────────────────────────────────
function lab(rows) {
  // a tiny world from ASCII: . grass, T tree, ^ plateau grass, # cliff, / ramp, , tallgrass, % briar, F fence
  const cols = rows[0].length, n = cols * rows.length;
  const cells = new Uint8Array(n), level = new Uint8Array(n), fences = [];
  rows.forEach((r, z) => [...r].forEach((ch, x) => {
    const i = z * cols + x;
    cells[i] = { '.': KIND.grass, T: KIND.tree, '^': KIND.grass, '#': KIND.cliff, '/': KIND.ramp, ',': KIND.tallgrass, '%': KIND.briar, F: KIND.grass }[ch];
    if (ch === '^' || ch === '#' || ch === '/') level[i] = 1;
    if (ch === 'F') fences.push(i);
  }));
  const map = { cols, rows: rows.length, cell: 2, cells, level, size: cols * 2 };
  const state = { tick: 0, ents: fences.length ? [{ kind: 'building', alive: true, cells: fences, blocks: 'all', opaque: true }] : [], hvf: { chopped: [], chopV: 0, buildV: 0 } };
  const ctx = { state, map };
  const g = liveGrid(ctx);
  const see = (ex, ez, R = 12) => { const bits = new Array(Math.ceil(n / 32)).fill(0); seeFrom(map, g, bits, ez * cols + ex, R); return (x, z) => hasBit(bits, z * cols + x); };
  return { map, g, see, cols };
}

test('vision golden: 12 line-of-sight cases', () => {
  let L = lab(['..........', '..........', '..........']);
  assert.ok(L.see(0, 1)(9, 1), '1 open ground: see across');
  L = lab(['..........', '....T.....', '..........']);
  assert.ok(!L.see(0, 1)(9, 1), '2 a tree blocks the line');
  assert.ok(L.see(0, 1)(4, 1), '3 the tree itself is seen');
  assert.ok(L.see(0, 1)(9, 0), '4 a line that misses the tree is clear');
  L = lab(['.....#^^^^', '.....#^^^^', '.....#^^^^']);
  assert.ok(!L.see(0, 1)(8, 1), '5 ground eye cannot see onto a plateau');
  assert.ok(L.see(8, 1)(0, 1), '6 a plateau eye looks down past its cliff');
  L = lab(['.....#^^^^', '...../^^^^', '.....#^^^^']);
  assert.ok(L.see(0, 1)(5, 1), '7 a ramp is visible from below');
  L = lab(['..........', '....F.....', '..........']);
  assert.ok(!L.see(0, 1)(9, 1), '8 a fence blocks sight');
  L = lab(['..........', '....%.....', '..........']);
  assert.ok(L.see(0, 1)(9, 1), '9 briar does not block sight');
  L = lab(['..........', '..........', '..........']);
  assert.ok(!L.see(0, 1, 4)(9, 1), '10 beyond the radius is dark');
  // 11 a stamp ignores line of sight
  L = lab(['..........', '..TTT.....', '..........']);
  const bits = new Array(1).fill(0); stamp(L.map, bits, 1 * L.cols + 1, 3);
  assert.ok(hasBit(bits, 1 * L.cols + 4), '11 stamp sees through trees');
  // 12 tall grass: the cell is in vision but a unit standing in it is seen only from 2 cells
  const s = createHvf({ format: '2v1', seed: 5 });
  released(s);
  const h = ent(s, 2), f = ent(s, 0);
  const g = liveGrid({ state: s.state, map: s.map });
  const tg = g.cells.findIndex((k, i) => k === KIND.tallgrass && s.map.level[i] === 0);
  const fx = ((tg % s.map.cols) + 0.5) * 2, fz = (Math.floor(tg / s.map.cols) + 0.5) * 2;
  at(s, f, fx, fz);
  // hunter 3 cells away in the open (move along the row until standable)
  let hx = fx + 6;
  at(s, h, hx, fz);
  const ctx = { state: s.state, data: s.data, map: s.map, emit: () => {} };
  updateVision(ctx, 1);
  if (hasBit(s.state.hvf.vision[1], cellOf(s.map, fx, fz))) assert.ok(!canSee(ctx, 1, f), '12a in vision, but hidden in the tall grass');
  at(s, h, fx + 3, fz); updateVision(ctx, 1);
  assert.ok(canSee(ctx, 1, f), '12b seen from 1.5 cells');
});

test('explored remembers; vision forgets', () => {
  const s = createHvf({ format: '2v1', seed: 6 });
  const ctx = { state: s.state, data: s.data, map: s.map, emit: () => {} };
  const f = ent(s, 0), c0 = cellOf(s.map, f.x, f.z);
  assert.ok(hasBit(s.state.hvf.vision[0], c0) && hasBit(s.state.hvf.explored[0], c0));
  const k = s.map.kennels[0]; at(s, f, k.x, k.z); at(s, ent(s, 1), k.x, k.z);
  updateVision(ctx, 0);
  assert.ok(!hasBit(s.state.hvf.vision[0], c0) && hasBit(s.state.hvf.explored[0], c0));
});

// ── rules ───────────────────────────────────────────────────────────────────────────────────────
test('farmers cannot attack; hunters wait in the kennel until the head start ends', () => {
  const s = createHvf({ format: '2v1', seed: 1 });
  s.drainEvents();
  s.step([{ p: 0, type: 'attack', target: ent(s, 2).id }]);
  assert.deepEqual(rejects(s), ['role']);
  const h = ent(s, 2), x0 = h.x;
  s.step([{ p: 2, type: 'move', x: s.map.commons.x, z: s.map.commons.z }]);
  assert.deepEqual(rejects(s), ['kennel']);
  s.run(s.state.hvf.releaseTick - s.tick + 1);
  assert.ok(s.drainEvents().some(e => e.type === 'released'));
  s.step([{ p: 2, type: 'move', x: s.map.commons.x, z: s.map.commons.z }]);
  s.run(40);
  assert.notEqual(h.x, x0, 'the hunter walks once released');
});

test('the briar rule: farmers and animals pass briar and hedges, hunters do not; fences stop everyone', () => {
  const s = createHvf({ format: '2v1', seed: 2 });
  const p = s.state.players[0]; p.gold = 1e4;
  const sp = commonsSpot(s, 5);
  buildNow(s, 0, 'hedge', sp.x, sp.z);
  buildNow(s, 0, 'fence', sp.x + 2, sp.z);
  const g = liveGrid({ state: s.state, map: s.map });
  const hc = cellOf(s.map, sp.x, sp.z), fc = cellOf(s.map, sp.x + 2, sp.z);
  assert.ok(canStand(g, 'farmer', hc) && canStand(g, 'animal', hc) && !canStand(g, 'hunter', hc), 'hedge');
  assert.ok(!canStand(g, 'farmer', fc) && !canStand(g, 'animal', fc) && !canStand(g, 'hunter', fc), 'fence');
  const briar = g.cells.findIndex(k => k === KIND.briar);
  assert.ok(canStand(g, 'farmer', briar) && !canStand(g, 'hunter', briar), 'briar cell');
});

test('building: price per copy x1.15, refusals (gold, blocked, one farmhouse), animals breed up to capacity', () => {
  const s = createHvf({ format: '2v1', seed: 3 });
  const p = s.state.players[0];
  const c1 = priceOf(data, p, 'coop');
  p.gold = c1 - 1; s.drainEvents();
  s.step([{ p: 0, type: 'build', kind: 'coop', ...commonsSpot(s) }]);
  assert.deepEqual(rejects(s), ['gold']);
  p.gold = 1e4;
  buildNow(s, 0, 'coop', commonsSpot(s, 6).x, commonsSpot(s, 6).z);
  assert.equal(p.copies.coop, 1);
  assert.equal(priceOf(data, p, 'coop'), Math.round(c1 * data.hvf.buildings.copyMult));
  s.step([{ p: 0, type: 'build', kind: 'coop', ...commonsSpot(s, 6) }]);
  assert.deepEqual(rejects(s), ['blocked'], 'on top of the first');
  buildNow(s, 0, 'farmhouse', commonsSpot(s, -8).x, commonsSpot(s, -8).z);
  s.step([{ p: 0, type: 'build', kind: 'farmhouse', ...commonsSpot(s, 10) }]);
  assert.deepEqual(rejects(s), ['onePer']);
  s.run(20 * 40);
  const hens = s.state.ents.filter(e => e.kind === 'animal' && e.owner === 0);
  assert.equal(hens.length, data.hvf.buildings.kinds.coop.cap);
  assert.ok(Math.abs(p.income - data.hvf.animals.kinds.hen.income * 3) < 1e-9);
  const menu = Q.buildMenu(s, 0);
  assert.equal(menu.find(r => r.kind === 'coop').payback, 100);
  assert.equal(menu.find(r => r.kind === 'pen').tell, 2);
});

test('chopping opens the cell and pays 2 gold; the door tree is gone for good', () => {
  const s = createHvf({ format: '2v1', seed: 4 });
  const h = s.map.hollows.find(x => x.entry === 'tree');
  const p = s.state.players[0], g0 = p.gold;
  s.step([{ p: 0, type: 'chop', cell: h.door }]);
  s.run(20 * 30);
  assert.equal(liveGrid({ state: s.state, map: s.map }).cells[h.door], KIND.grass);
  assert.equal(p.gold, g0 + 2);
  assert.deepEqual(s.state.hvf.chopped, [h.door]);
});

test('hunters kill animals for bounty and down farmers into ghosts; an ally revives; all ghosts = hunters win', () => {
  const s = createHvf({ format: '2v1', seed: 5 });
  released(s);
  const p0 = s.state.players[0]; p0.gold = 1e4;
  buildNow(s, 0, 'coop', commonsSpot(s, 6).x, commonsSpot(s, 6).z);
  s.run(5);
  const hen = s.state.ents.find(e => e.kind === 'animal');
  const h = ent(s, 2), hp = s.state.players[2], g0 = hp.gold;
  at(s, h, hen.x + 1, hen.z);
  s.step([]); s.step([]); s.step([]); s.step([]);   // vision update for the hunters
  s.step([{ p: 2, type: 'attack', target: hen.id }]);
  s.run(60);
  assert.ok(!s.state.ents.includes(hen), 'the hen is gone');
  assert.ok(hp.gold >= g0 + data.hvf.units.bounty.hen);
  assert.equal(s.state.players[0].stats.animalsLost, 1);
  // down farmer 0, farmer 1 revives him
  const f0 = ent(s, 0), ctx = s.ctx();
  hurt(ctx, h, f0, 1e6);
  assert.ok(p0.ghost && s.state.hvf.graves.length === 1);
  s.drainEvents();
  s.step([{ p: 0, type: 'move', x: 10, z: 10 }]);
  assert.deepEqual(rejects(s), ['dead']);
  at(s, h, s.map.kennels[0].x, s.map.kennels[0].z); h.ord = { k: 'idle' };
  s.step([{ p: 1, type: 'revive', target: 0 }]);
  s.run(20 * 12);
  assert.ok(!p0.ghost && f0.alive, 'revived');
  // both down: hunters win
  hurt(ctx, h, f0, 1e6); hurt(ctx, h, ent(s, 1), 1e6);
  s.step([]);
  assert.deepEqual([s.state.result.winner, s.state.result.reason], [1, 'caught']);
});

test('a ghost farmer\'s animals go wild and earn nothing', () => {
  const s = createHvf({ format: '2v1', seed: 5 });
  const p0 = s.state.players[0]; p0.gold = 1e4;
  buildNow(s, 0, 'coop', commonsSpot(s, 6).x, commonsSpot(s, 6).z);
  s.run(20 * 20);
  assert.ok(p0.income > 0);
  hurt(s.ctx(), null, ent(s, 0), 1e6);
  s.run(25);
  assert.equal(p0.income, 0);
  assert.ok(s.state.ents.filter(e => e.kind === 'animal').every(a => a.wild));
});

test('a hunter with a lodge respawns; with none he is out, and all out = farmers win', () => {
  const s = createHvf({ format: '2v1', seed: 8 });
  released(s);
  const h = ent(s, 2), hp = s.state.players[2], ctx = s.ctx();
  hurt(ctx, null, h, 1e9);
  assert.ok(!h.alive && !hp.out && h.respawnAt > s.tick);
  s.run(20 * 16);
  assert.ok(h.alive, 'back at the kennel');
  const kennel = s.state.ents.find(e => e.type === 'kennel');
  kennel._gone = true; s.step([]);
  hurt(s.ctx(), null, h, 1e9);
  assert.ok(hp.out);
  s.step([]);
  assert.deepEqual([s.state.result.winner, s.state.result.reason], [0, 'hunted']);
});

test('the clock: farmers win if anyone is alive when it runs out', () => {
  const s = createHvf({ format: '2v1', seed: 9 });
  s.state.hvf.endTick = 50;
  s.run(60);
  assert.deepEqual([s.state.result.winner, s.state.result.reason], [0, 'clock']);
});

test('crowding widens the wander radius; the Bell sends animals home', () => {
  const s = createHvf({ format: '2v1', seed: 10 });
  const p0 = s.state.players[0]; p0.gold = 1e4;
  buildNow(s, 0, 'pen', commonsSpot(s, 6).x, commonsSpot(s, 6).z);
  const pen = s.state.ents.find(e => e.type === 'pen');
  s.run(20 * 90);
  const sheep = s.state.ents.filter(e => e.kind === 'animal');
  assert.equal(sheep.length, 4);
  const far = () => Math.max(...sheep.map(a => Math.sqrt((a.x - pen.x) ** 2 + (a.z - pen.z) ** 2)));
  // squeeze the comfort: the same flock now counts as crowded and roams wider
  let maxOpen = 0, maxCrowd = 0;
  for (let i = 0; i < 40; i++) { s.run(20); maxOpen = Math.max(maxOpen, far()); }
  pen.comfort = 1;
  for (let i = 0; i < 40; i++) { s.run(20); maxCrowd = Math.max(maxCrowd, far()); }
  assert.ok(maxCrowd > maxOpen, `crowded flock roams wider (${maxCrowd.toFixed(1)} > ${maxOpen.toFixed(1)})`);
  assert.ok(maxOpen <= data.hvf.animals.kinds.sheep.wander + 2);
  const n = ringBell(s.ctx(), p0, pen.x, pen.z, 30);
  assert.equal(n, 4);
  s.run(20 * 6);
  assert.ok(far() < pen.r + 2.5, `home (${far().toFixed(1)} m)`);
  assert.ok(comfortOf(s.ctx(), pen, 10) >= 1);
});

test('breeding stops at the per-farmer cap; income keeps the animals it has', () => {
  const d = hvfData(x => { x.animals.rules.capPerFarmer = 2; });
  const s = createHvf({ format: '2v1', seed: 3 }, d);
  s.state.players[0].gold = 1e4;
  buildNow(s, 0, 'coop', commonsSpot(s, 6).x, commonsSpot(s, 6).z);
  s.run(20 * 60);
  assert.equal(s.state.ents.filter(e => e.kind === 'animal').length, 2);
  assert.ok(s.state.players[0].income > 0);
});

test('a hunter cannot target what the fog hides', () => {
  const s = createHvf({ format: '2v1', seed: 11 });
  released(s);
  const f = ent(s, 0);
  s.drainEvents();
  s.step([{ p: 2, type: 'attack', target: f.id }]);
  assert.deepEqual(rejects(s), ['unseen']);
});

test('illegal commands never throw and change nothing', () => {
  const s = createHvf({ format: '2v1', seed: 13 }), b = createHvf({ format: '2v1', seed: 13 });
  const junk = [null, 7, {}, { p: 99, type: 'move' }, { p: 0, type: 'build', kind: 'castle', x: 1, z: 1 }, { p: 0, type: 'move', x: NaN, z: 3 },
    { p: 0, type: 'chop', cell: -4 }, { p: 0, type: 'chop', cell: 1.5 }, { p: 0, type: 'rally', building: 1, x: 3, z: 3 }, { p: 0, type: 'revive', target: 0 },
    { p: 0, type: '__proto__' }, { p: 0, type: 'constructor' }, { p: 2, type: 'build', kind: 'coop', x: 50, z: 50 }];
  s.step(junk); b.step([]);
  assert.equal(s.hash(), b.hash());
});

test('queries describe the match for the UI', () => {
  const s = createHvf({ format: '2v1', seed: 14 });
  assert.ok(Q.clock(s).releaseIn > 0);
  assert.deepEqual(Q.sideInfo(s), { farmers: { alive: 2, ghost: 0 }, hunters: { alive: 1, down: 0, out: 0 } });
  const fi = Q.farmerInfo(s, 0);
  assert.equal(fi.gold, data.hvf.units.farmerStartGold);
  assert.equal(Q.buildMenu(s, 0).length, data.hvf.buildings.order.length);
  assert.equal(Q.buildCheck(s, 0, 'coop', s.map.commons.x + 6, s.map.commons.z), null);
  assert.equal(Q.hunterInfo(s, 2).lodges.length, 1);
  const fog = Q.fogBits(s, 0);
  assert.equal(fog.vision.length, Math.ceil(s.map.cols * s.map.rows / 32));
});

test('performance: a 9v3 minute with animals stays inside the tick budget', () => {
  const s = createHvf({ format: '9v3', seed: 21, players: seats('9v3') });
  for (let i = 0; i < 9; i++) s.state.players[i].gold = 1e5;
  const cmds = [];
  for (let i = 0; i < 9; i++) cmds.push({ p: i, type: 'build', kind: i % 2 ? 'pen' : 'coop', x: s.map.commons.x + (i - 4) * 7, z: s.map.commons.z + (i % 2 ? 7 : -7) });
  s.step(cmds);
  s.run(20 * 60);
  const t0 = performance.now();
  s.run(20 * 30);
  const ms = (performance.now() - t0) / 600;
  assert.ok(ms < 3, `${ms.toFixed(2)} ms per tick`);
});
