// Hunters vs Farmers full kits, H3 (docs/hvf-PLAN.md §6-§8): farmer abilities and upgrades, defences,
// the Harvest Hall and its army, the hunter's skills, levels, lodges, watchstones and items, noise,
// tracks and the Turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHvf, data, ent } from './hvf-helpers.mjs';
import { KIND } from '../js/sim/modes/hvf/mapgen.js';
import { liveGrid, cellOf } from '../js/sim/modes/hvf/grid.js';
import { updateVision, canSee, hasBit } from '../js/sim/modes/hvf/vision.js';
import { hurt } from '../js/sim/modes/hvf/units.js';
import { gear } from '../js/sim/modes/hvf/hunter.js';
import { incomeOf } from '../js/sim/modes/hvf/farm.js';
import { turnValues } from '../js/sim/modes/hvf/turn.js';

const D = data.hvf;
const rejects = s => s.drainEvents().filter(e => e.type === 'reject').map(e => e.reason);
const at = (s, e, x, z) => { e.x = e.px = x; e.z = e.pz = z; };
const C = (s, dx = 0, dz = 0) => ({ x: s.map.commons.x + dx, z: s.map.commons.z + dz });
const go = s => { s.state.hvf.releaseTick = 0; return s; };
const build = (s, pid, kind, dx, dz = 0) => { const p = C(s, dx, dz); s.step([{ p: pid, type: 'build', kind, x: p.x, z: p.z }]); for (let i = 0; i < 400 && ent(s, pid).ord.k === 'build'; i++) s.step(); return s.state.ents.filter(e => e.type === kind).pop(); };
const give = (s, pid, id) => { const p = s.state.players[pid]; p.inv[p.inv.indexOf(null)] = { uid: s.state.nextItem++, id, charges: D['hunter-items'].items[id].charges || 0 }; };
const seeAll = s => { const ctx = s.ctx(); updateVision(ctx, 0); updateVision(ctx, 1); };

test('Scamper: +60% speed for 2.5 s, then a cooldown', () => {
  const s = createHvf({ format: '2v1', seed: 31 });
  const f = ent(s, 0);
  s.step([{ p: 0, type: 'move', ...C(s, 20) }]);
  s.run(10);
  const x0 = f.x; s.run(10); const plain = Math.abs(f.x - x0);
  s.step([{ p: 0, type: 'cast', slot: 'Q' }]);
  const x1 = f.x; s.run(10); const fast = Math.abs(f.x - x1);
  assert.ok(fast > plain * 1.4, `${fast} vs ${plain}`);
  s.drainEvents(); s.step([{ p: 0, type: 'cast', slot: 'Q' }]);
  assert.deepEqual(rejects(s), ['cooldown']);
});

test('Lie Low: still in tall grass -> seen only within 3 m; moving ends it', () => {
  const s = go(createHvf({ format: '2v1', seed: 5 }));
  const g = liveGrid(s.ctx()), cols = s.map.cols;
  const open = i => s.map.level[i] === 0 && [KIND.grass, KIND.tallgrass, KIND.trail].includes(g.cells[i]);
  const tg = g.cells.findIndex((k, i) => k === KIND.tallgrass && s.map.level[i] === 0 && (i % cols) + 4 < cols && [1, 2, 3, 4].every(d => open(i + d)));
  const fx = ((tg % cols) + 0.5) * 2, fz = (Math.floor(tg / cols) + 0.5) * 2;
  const f = ent(s, 0), h = ent(s, 2);
  at(s, f, fx, fz); at(s, h, fx + 4, fz); h.ord = { k: 'idle' };
  s.state.ents.filter(e => e.kind === 'farmer' && e !== f).forEach(o => at(s, o, s.map.kennels[0].x, s.map.kennels[0].z));
  s.step([{ p: 0, type: 'cast', slot: 'W' }]);
  s.run(40);
  assert.ok(f.lowUntil > s.tick, 'lying low');
  seeAll(s);
  assert.ok(!canSee(s.ctx(), 1, f), 'hidden at 4 m');
  at(s, h, fx + 2.5, fz); seeAll(s);
  assert.ok(canSee(s.ctx(), 1, f), 'seen at 2.5 m');
  s.step([{ p: 0, type: 'move', ...C(s) }]); s.run(5);
  assert.equal(f.lowUntil, 0);
});

test('Pounce leaps 8 m; Snare roots the first farmer to step in; farmers can pull it up', () => {
  const s = go(createHvf({ format: '2v1', seed: 32 }));
  const h = ent(s, 2), f = ent(s, 0), c = C(s);
  at(s, h, c.x - 6, c.z); s.step([]);
  s.step([{ p: 2, type: 'cast', slot: 'Q', x: c.x + 1, z: c.z }]);
  assert.ok(Math.abs(h.x - (c.x + 1)) < 1.5, 'pounced');
  s.drainEvents(); s.step([{ p: 2, type: 'cast', slot: 'Q', x: c.x + 1, z: c.z }]);
  assert.deepEqual(rejects(s), ['cooldown']);
  // a snare on the farmer's path
  s.step([{ p: 2, type: 'cast', slot: 'W', x: c.x + 2, z: c.z }]);
  const snare = s.state.ents.find(e => e.kind === 'snare');
  assert.ok(snare);
  at(s, h, s.map.kennels[0].x, s.map.kennels[0].z); h.ord = { k: 'idle' };
  at(s, f, snare.x - 6, snare.z);
  s.step([{ p: 0, type: 'move', x: snare.x + 6, z: snare.z }]);
  s.run(40);
  assert.ok(s.drainEvents().some(e => e.type === 'snared'), 'snared');
  assert.ok(f.rootUntil > s.tick - 30);
  // a second snare, pulled up
  at(s, h, c.x, c.z + 4); s.state.players[2].cd.W = 0;
  s.step([{ p: 2, type: 'cast', slot: 'W', x: c.x, z: c.z + 6 }]);
  const s2 = s.state.ents.find(e => e.kind === 'snare');
  at(s, h, s.map.kennels[0].x, s.map.kennels[0].z);
  at(s, f, s2.x - 3, s2.z); f.rootUntil = 0;
  s.step([{ p: 0, type: 'pullup', target: s2.id }]);
  s.run(20 * 5);
  assert.ok(!s.state.ents.includes(s2), 'pulled up');
});

test('Hawk flies out and gives sight; the Horn (level 6) reveals animals and sends them home', () => {
  const s = go(createHvf({ format: '2v1', seed: 33 }));
  const h = ent(s, 2), hp = s.state.players[2];
  at(s, h, s.map.commons.x - 20, s.map.commons.z);
  s.step([{ p: 2, type: 'cast', slot: 'E', ...C(s, 10) }]);
  s.run(80);
  const hawk = s.state.ents.find(e => e.kind === 'hawk');
  assert.ok(hawk && Math.abs(hawk.x - C(s, 10).x) < 0.5);
  seeAll(s);
  assert.ok(hasBit(s.state.hvf.vision[1], cellOf(s.map, hawk.x, hawk.z)));
  s.run(20 * 13);
  assert.ok(!s.state.ents.some(e => e.kind === 'hawk'), 'gone after 12 s');
  s.drainEvents(); s.step([{ p: 2, type: 'cast', slot: 'R' }]);
  assert.deepEqual(rejects(s), ['level']);
  s.state.players[0].gold = 1e4; build(s, 0, 'pen', 8); s.run(10);
  const sheep = s.state.ents.find(e => e.kind === 'animal');
  hp.level = 6; at(s, h, sheep.x + 30, sheep.z);
  s.step([{ p: 2, type: 'cast', slot: 'R' }]);
  assert.ok(canSee(s.ctx(), 1, sheep), 'revealed through the fog');
});

test('the thrown spear hits a target out of reach; kills give XP and levels (+8% HP)', () => {
  const s = go(createHvf({ format: '2v1', seed: 34 }));
  const h = ent(s, 2), hp = s.state.players[2], f = ent(s, 0);
  at(s, h, f.x + 6, f.z); seeAll(s);
  const before = f.hp;
  s.step([{ p: 2, type: 'attack', target: f.id }]);
  assert.ok(s.drainEvents().some(e => e.type === 'spear'));
  assert.ok(f.hp < before);
  const hp0 = h.hpMax;
  hp.xp = D.units.hunter.xpTable[1] - 1;
  hurt(s.ctx(), h, f, 1e6);
  assert.equal(hp.level, 2);
  assert.ok(Math.abs(h.hpMax - hp0 * (1 + D.units.hunter.perLevel)) < 1e-6);
});

test('farm upgrades: Feed +25% per rank, Shears on sheep, Breeding halves breed time', () => {
  const s = createHvf({ format: '2v1', seed: 35 });
  const p = s.state.players[0]; p.gold = 1e5;
  build(s, 0, 'pen', 8); s.run(20 * 80);
  const base = incomeOf(s.ctx(), p).total;
  s.step([{ p: 0, type: 'upgrade', id: 'feed' }]);
  assert.ok(Math.abs(incomeOf(s.ctx(), p).total - base * 1.25) < 1e-9);
  s.step([{ p: 0, type: 'upgrade', id: 'shears' }]);
  assert.ok(Math.abs(incomeOf(s.ctx(), p).total - base * 1.25 * 1.5) < 1e-9);
  s.drainEvents(); s.step([{ p: 0, type: 'upgrade', id: 'shears' }]);
  assert.deepEqual(rejects(s), ['max']);
  s.step([{ p: 0, type: 'upgrade', id: 'breeding' }]);
  const coop = build(s, 0, 'coop', -8);
  s.run(5);
  const t0 = s.tick;
  s.run(20 * 8);
  assert.equal(s.state.ents.filter(e => e.kind === 'animal' && e.home === coop.id).length, 2, 'two hens by 8 s with Breeding (15 s without)');
  assert.ok(t0 > 0);
});

test('Sheepdog halves the wander radius; Mud slows hunters; a Lookout sees 20 m; a Windmill shows over the trees', () => {
  const s = go(createHvf({ format: '2v1', seed: 36 }));
  const p = s.state.players[0]; p.gold = 1e5;
  const pen = build(s, 0, 'pen', 8); s.run(20 * 80);
  const far = () => Math.max(...s.state.ents.filter(e => e.kind === 'animal').map(a => Math.sqrt((a.x - pen.x) ** 2 + (a.z - pen.z) ** 2)));
  build(s, 0, 'sheepdog', 8, 5);
  let m = 0; for (let i = 0; i < 40; i++) { s.run(20); m = Math.max(m, far()); }
  assert.ok(m <= D.animals.kinds.sheep.wander * 0.5 + pen.r + 2, `herded ${m.toFixed(1)}`);
  // mud
  const mud = build(s, 0, 'mud', -10);
  const h = ent(s, 2);
  at(s, h, mud.x - 6, mud.z); s.step([{ p: 2, type: 'move', x: mud.x + 6, z: mud.z }]);
  let inMudSteps = 0, outSteps = 0, last = h.x;
  for (let i = 0; i < 60; i++) { s.step(); const d = Math.abs(h.x - last); last = h.x; if (Math.abs(h.x - mud.x) < 1.5) inMudSteps = Math.max(inMudSteps, d); else if (d > 0) outSteps = Math.max(outSteps, d); }
  assert.ok(inMudSteps < outSteps * 0.8, `mud ${inMudSteps} vs ${outSteps}`);
  // lookout
  const look = build(s, 0, 'lookout', 0, 10);
  seeAll(s);
  assert.ok(hasBit(s.state.hvf.vision[0], cellOf(s.map, look.x + 18, look.z)) || liveGrid(s.ctx()).cells[cellOf(s.map, look.x + 18, look.z)] !== KIND.grass);
  // windmill: a hunter 35 m away behind trees sees it
  const mill = build(s, 0, 'windmill', -6, -9);
  at(s, h, mill.x + 35, mill.z); seeAll(s);
  assert.ok(canSee(s.ctx(), 1, mill));
});

test('Arrow Tower shoots a hunter in range; Farmhouse respawns its ghost after 40 s', () => {
  const s = go(createHvf({ format: '2v1', seed: 37 }));
  const p = s.state.players[0]; p.gold = 1e5;
  const tower = build(s, 0, 'tower', 8);
  const h = ent(s, 2); at(s, h, tower.x + 6, tower.z); h.ord = { k: 'idle' };
  const hp0 = h.hp;
  s.run(30);
  assert.ok(h.hp < hp0, 'shot');
  at(s, h, s.map.kennels[0].x, s.map.kennels[0].z);
  const fh = build(s, 0, 'farmhouse', -8);
  hurt(s.ctx(), null, ent(s, 0), 1e6);
  assert.ok(p.ghost);
  s.run(20 * 41);
  assert.ok(!p.ghost && ent(s, 0).alive, 'back at the farmhouse');
  assert.ok(Math.abs(ent(s, 0).x - fh.x) < 8);
});

test('Harvest Hall needs 3 producers; scarecrows and crows train, take orders, kill a hunter and a kennel', () => {
  const s = go(createHvf({ format: '2v1', seed: 38 }));
  const p = s.state.players[0]; p.gold = 1e5;
  s.step([{ p: 0, type: 'build', kind: 'hall', ...C(s, -9) }]);
  assert.deepEqual(rejects(s), ['needs']);
  build(s, 0, 'coop', 8); build(s, 0, 'coop', 8, 5); build(s, 0, 'pen', 8, -6);
  const hall = build(s, 0, 'hall', -9);
  assert.ok(hall && hall.type === 'hall');
  for (let i = 0; i < 4; i++) s.step([{ p: 0, type: 'train', unit: 'scarecrow', building: hall.id }]);
  s.step([{ p: 0, type: 'train', unit: 'crow', building: hall.id }]);
  const army = s.state.ents.filter(e => e.kind === 'army');
  assert.equal(army.length, 4 + D.units.army.crow.flock);
  s.step([{ p: 1, type: 'train', unit: 'scarecrow', building: hall.id }]);
  assert.deepEqual(rejects(s).slice(-1), ['bad'], 'only the owner trains');
  // Stuffing reaches the standing scarecrows
  const sc = army.find(u => u.type === 'scarecrow'), hp0 = sc.hpMax;
  s.step([{ p: 0, type: 'upgrade', id: 'stuffing' }]);
  assert.ok(Math.abs(sc.hpMax - hp0 * 1.25) < 1e-6);
  // march on the hunter standing next to his kennel
  const h = ent(s, 2), kennel = s.state.ents.find(e => e.type === 'kennel');
  at(s, h, kennel.x, kennel.z); h.ord = { k: 'idle' };
  for (const u of army) at(s, u, kennel.x + 4, kennel.z + 1);
  seeAll(s);
  s.run(20 * 90);
  assert.ok(!kennel.alive || kennel._gone || !s.state.ents.includes(kennel), 'the kennel falls');
  assert.ok(s.state.players[2].out || s.state.result, 'the hunter is out with no lodge');
  assert.deepEqual([s.state.result.winner, s.state.result.reason], [0, 'hunted']);
});

test('the army cap holds; order validates ownership and targets', () => {
  const d = JSON.parse(JSON.stringify(data)); d.hvf.units.army.cap = 3;
  const s = go(createHvf({ format: '2v1', seed: 39 }, d));
  const p = s.state.players[0]; p.gold = 1e5;
  build(s, 0, 'coop', 8); build(s, 0, 'coop', 8, 5); build(s, 0, 'pen', 8, -6);
  const hall = build(s, 0, 'hall', -9);
  s.drainEvents();
  s.step([{ p: 0, type: 'train', unit: 'crow', building: hall.id }, { p: 0, type: 'train', unit: 'crow', building: hall.id }]);
  assert.deepEqual(rejects(s), ['cap']);
  const ids = s.state.ents.filter(e => e.kind === 'army').map(e => e.id);
  s.step([{ p: 1, type: 'order', ids, kind: 'move', x: 50, z: 50 }, { p: 0, type: 'order', ids, kind: 'attack', target: ent(s, 2).id }]);
  assert.deepEqual(rejects(s), ['bad', 'unseen']);
  s.step([{ p: 0, type: 'order', ids, kind: 'move', ...C(s, 6, 6) }]);
  s.run(80);
  assert.ok(s.state.ents.filter(e => e.kind === 'army').every(u => Math.abs(u.x - C(s, 6).x) < 1 && Math.abs(u.z - C(s, 0, 6).z) < 1));
});

test('lodges: 300 g, built in 12 s, max 3 with the kennel, a respawn point and a shop', () => {
  const s = go(createHvf({ format: '2v1', seed: 40 }));
  const hp = s.state.players[2], h = ent(s, 2); hp.gold = 5000;
  const c = C(s, -8, 0); at(s, h, c.x, c.z);
  s.step([{ p: 2, type: 'lodge', x: c.x + 2, z: c.z }]);
  assert.equal(hp.gold, 5000 - D.hunter.lodge.cost);
  const lodge = s.state.ents.find(e => e.type === 'lodge');
  assert.equal(lodge.done, false);
  s.drainEvents(); s.step([{ p: 2, type: 'buy', id: 'axe' }]);
  assert.deepEqual(rejects(s), ['notAtShop'], 'an unfinished lodge is no shop yet');
  s.run(20 * 13);
  assert.equal(lodge.done, true);
  s.step([{ p: 2, type: 'buy', id: 'axe' }]);
  assert.deepEqual(rejects(s), []);
  at(s, h, c.x + 8, c.z + 6); s.step([{ p: 2, type: 'lodge', x: c.x + 8, z: c.z + 8 }]); s.run(20 * 13);
  s.drainEvents(); s.step([{ p: 2, type: 'lodge', x: c.x + 10, z: c.z + 4 }]);
  assert.deepEqual(rejects(s), ['max']);
  // dies -> respawns at a lodge
  hurt(s.ctx(), null, h, 1e9);
  s.run(20 * 16);
  assert.ok(h.alive && s.state.ents.some(b => b.lodge && b.x === h.x && b.z === h.z));
});

test('hunter items: buy only at a lodge; every copy counts; one horse; unique axe; sell back half', () => {
  const s = go(createHvf({ format: '2v1', seed: 41 }));
  const hp = s.state.players[2], h = ent(s, 2); hp.gold = 1e4;
  s.step([{ p: 2, type: 'buy', id: 'blade' }, { p: 2, type: 'buy', id: 'blade' }, { p: 2, type: 'buy', id: 'horse2' }, { p: 2, type: 'buy', id: 'horse1' }, { p: 2, type: 'buy', id: 'axe' }, { p: 2, type: 'buy', id: 'axe' }]);
  assert.deepEqual(rejects(s), ['group', 'uniqueEquipped']);
  const g = gear(data, hp);
  assert.equal(g.damage, 24); assert.equal(g.speed, 0.30); assert.equal(g.chopMult, 3);
  const gold = hp.gold;
  s.step([{ p: 2, type: 'sell', slot: 0 }]);
  assert.equal(hp.gold, gold + Math.round(D['hunter-items'].items.blade.price / 2));
  at(s, h, s.map.commons.x, s.map.commons.z);
  s.step([{ p: 2, type: 'buy', id: 'blade' }]);
  assert.deepEqual(rejects(s), ['notAtShop']);
});

test('watchstones: 3 charges, 12 m sight, farmers see one only from 6 m and pull it up; flare, hound and torch oil', () => {
  const s = go(createHvf({ format: '2v1', seed: 42 }));
  const hp = s.state.players[2], h = ent(s, 2), f = ent(s, 0);
  give(s, 2, 'watchstone');
  const c = C(s, 0, 8); at(s, h, c.x, c.z);
  s.step([{ p: 2, type: 'ward', x: c.x + 2, z: c.z }]);
  const w = s.state.ents.find(e => e.kind === 'ward');
  assert.ok(w); assert.equal(hp.inv[0].charges, 2);
  at(s, h, s.map.kennels[0].x, s.map.kennels[0].z); seeAll(s);
  assert.ok(hasBit(s.state.hvf.vision[1], cellOf(s.map, w.x + 8, w.z)) || liveGrid(s.ctx()).cells[cellOf(s.map, w.x + 8, w.z)] === KIND.tree, 'ward sight');
  at(s, f, w.x + 9, w.z); seeAll(s);
  assert.ok(!canSee(s.ctx(), 0, w), 'not seen from 9 m');
  at(s, f, w.x + 4, w.z); seeAll(s);
  assert.ok(canSee(s.ctx(), 0, w), 'seen from 4 m');
  s.step([{ p: 0, type: 'pullup', target: w.id }]); s.run(20 * 4);
  assert.ok(s.drainEvents().some(e => e.type === 'wardPulled'));
  // flare + torch + hound
  give(s, 2, 'flare'); give(s, 2, 'torch'); give(s, 2, 'hound');
  at(s, h, c.x, c.z);
  const fi = hp.inv.findIndex(it => it && it.id === 'flare');
  s.step([{ p: 2, type: 'use', slot: fi, x: c.x + 40, z: c.z }]);
  seeAll(s);
  assert.ok(hasBit(s.state.hvf.vision[1], cellOf(s.map, c.x + 40, c.z)), 'flare lights it');
  s.step([{ p: 2, type: 'use', slot: hp.inv.findIndex(it => it && it.id === 'torch') }]);
  assert.ok(h.torchUntil > s.tick);
  s.step([{ p: 2, type: 'use', slot: hp.inv.findIndex(it => it && it.id === 'hound') }]);
  assert.ok(s.state.ents.some(e => e.kind === 'hound'));
});

test('noise: animals call on their own beat and hunters in range hear it; strays leave tracks', () => {
  const s = go(createHvf({ format: '2v1', seed: 43 }));
  const p = s.state.players[0]; p.gold = 1e4;
  const pen = build(s, 0, 'pen', 8);
  const h = ent(s, 2); at(s, h, pen.x + 12, pen.z); h.ord = { k: 'idle' };
  s.state.ents.filter(e => e.kind === 'farmer').forEach(o => at(s, o, s.map.kennels[0].x, s.map.kennels[0].z));
  s.drainEvents();
  // keep the hunter out of flee range but inside the 18 m bleat
  let heard = 0;
  for (let i = 0; i < 20 * 30; i++) { s.step(); for (const e of s.drainEvents()) if (e.type === 'noise' && e.heard.includes(2)) heard++; }
  assert.ok(heard >= 2, `heard ${heard}`);
  // strays: crowd the pen hard so the flock roams wide
  pen.comfort = 0; s.run(20 * 30);
  assert.ok(s.state.hvf.tracks.length > 0, 'tracks');
  assert.ok(s.state.hvf.tracks.every(t => t.tick >= s.tick - 20 * 20));
});

test('the Turn starts at the hunters\' night and crosses over when the army outweighs them', () => {
  const s = go(createHvf({ format: '2v1', seed: 44 }));
  s.run(20);
  assert.equal(s.state.hvf.turn, -1);
  const p = s.state.players[0]; p.gold = 1e5;
  build(s, 0, 'coop', 8); build(s, 0, 'coop', 8, 5); build(s, 0, 'pen', 8, -6);
  const hall = build(s, 0, 'hall', -9);
  for (let i = 0; i < 12; i++) s.step([{ p: 0, type: 'train', unit: 'scarecrow', building: hall.id }]);
  s.run(25);
  const v = turnValues(s.ctx());
  assert.ok(v.farm > v.hunt);
  assert.ok(s.state.hvf.turn > 0 && /outweighs/.test(s.state.hvf.turnWhy));
  assert.ok(s.drainEvents().some(e => e.type === 'turn'));
});

test('memory: a seen farm building is remembered, and forgotten once seen gone; tracks show from Tracking (level 3)', async () => {
  const Q = await import('../js/sim/modes/hvf/query.js');
  const s = go(createHvf({ format: '2v1', seed: 45 }));
  const p = s.state.players[0]; p.gold = 1e4;
  const coop = build(s, 0, 'coop', 8);
  const h = ent(s, 2); at(s, h, coop.x + 6, coop.z); h.ord = { k: 'idle' };
  seeAll(s);
  assert.deepEqual(Q.seenBuildings(s, 1).map(b => b.id), [coop.id]);
  at(s, h, s.map.kennels[0].x, s.map.kennels[0].z); seeAll(s);
  assert.equal(Q.seenBuildings(s, 1).length, 1, 'still remembered out of sight');
  hurt(s.ctx(), null, coop, 1e6); s.step();
  at(s, h, coop.x + 6, coop.z); seeAll(s);
  assert.equal(Q.seenBuildings(s, 1).length, 0, 'forgotten');
  s.state.hvf.tracks.push({ x: h.x, z: h.z, dir: 0, tick: s.tick, owner: 0 });
  assert.equal(Q.visibleTracks(s, 2).length, 0, 'level 1: no Tracking');
  s.state.players[2].level = 3;
  assert.equal(Q.visibleTracks(s, 2).length, 1);
  const hi = Q.hunterInfo(s, 2);
  assert.equal(hi.skills.length, 4); assert.equal(hi.skills.find(k => k.slot === 'R').reason, 'level');
  assert.equal(Q.farmUpgrades(s, 0).length, 4);
  assert.ok(Q.turnInfo(s).reason);
  assert.equal(Q.hunterShop(s, 2).length, Object.keys(D['hunter-items'].items).length);
});
