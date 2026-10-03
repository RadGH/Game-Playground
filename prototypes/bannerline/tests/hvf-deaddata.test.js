// Hunters vs Farmers dead-data guard (docs/hvf-PLAN.md §16.7): every number in data/hvf/{units,
// animals, buildings, hunter, hunter-items, rules}.json, moved to an odd value, must change a busy
// scripted match (its state hash OR its event stream), or be listed below with the reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHvf, hvfData, ent } from './hvf-helpers.mjs';
import { hashValue, hashString } from '../js/sim/hash.js';
import { hurt } from '../js/sim/modes/hvf/units.js';
import * as Q from '../js/sim/modes/hvf/query.js';
import { liveGrid, cellOf, canStand } from '../js/sim/modes/hvf/grid.js';
import { bfsMove } from '../js/sim/modes/hvf/mapgen.js';

function leaves(obj, path = []) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out.push([...path, k]);
    else if (Array.isArray(v)) { if (v.every(x => typeof x === 'number')) v.forEach((_, i) => out.push([...path, k, i])); }
    else if (v && typeof v === 'object') out.push(...leaves(v, [...path, k]));
  }
  return out;
}
const getAt = (o, p) => p.reduce((a, k) => a[k], o);
const setAt = (o, p, v) => { getAt(o, p.slice(0, -1))[p[p.length - 1]] = v; };
const oddly = v => (typeof v === 'boolean' ? !v : v === 0 ? 0.37 : Number.isInteger(v) ? Math.round(v * 1.37) + 1 : v * 1.37 + 0.07);

// fields a match cannot show, each with its reason (keep short)
const EXEMPT = {
  'buildings.kinds.*.tell': 'UI only: the build menu\'s tell rating',
  'rules.formats.*': 'per-format table; the scene plays one format and tests/hvf-mapgen.test.js checks the sizes',
  'rules.defaultFormat': 'lobby default',
  'units.hunter.maxLevel': 'the scene does not reach level 10',
  'units.hunter.xpTable.0': 'level 1 starts at 0 XP by definition',
  'units.army.cap': 'tests/hvf-kit.test.js "army cap" moves it',
  'animals.rules.capMatch': 'tests/hvf-sim.test.js moves the per-farmer cap; the match cap is the same code',
  'animals.rules.capPerFarmer': 'tests/hvf-sim.test.js "breeding stops at the per-farmer cap"',
  'units.farmer.respawnHp': 'reserved for a hurt-on-respawn rule (respawn is at full health now)',
  'units.hunter.respawn': 'tests/hvf-sim.test.js "a hunter with a lodge respawns"',
  'units.hunter.respawnPerDeath': 'same test (second death)',
  'buildings.kinds.farmhouse.respawn': 'tests/hvf-kit.test.js "Farmhouse respawns its ghost after 40 s"',
  'hunter.skills.R.*': 'the Horn needs level 6; tests/hvf-kit.test.js casts it',
  'hunter.lodge.*': 'tests/hvf-kit.test.js "lodges"',
  'units.hunter.chopBriar': 'the scene\'s hunter chops a tree, not briar',
  'units.farmer.chopBriar': 'farmers walk through briar and never cut it',
  'units.hunter.startGold': 'the scene sets gold directly',
  'units.farmerStartGold': 'the scene sets gold directly',
  'hunter.tracking.level': 'read by the visibleTracks query (tests/hvf-kit.test.js)',
};
// H3 (stream H, 2026-10-03): fields the scripted scene does not reach YET. Each is read by the sim
// (many are covered by tests/hvf-kit.test.js); the scene grows to cover them and this list shrinks.
// Never add to it to hide a field nothing reads — delete such a field from the data instead.
const PENDING = new Set([
  'units.farmer.chop',
  'units.farmer.chopGold',
  'units.farmer.reviveRange',
  'units.farmer.buildRange',
  'units.farmer.abilities.W.seen',
  'units.farmer.abilities.E.radius',
  'units.hunter.xpTable.3',
  'units.hunter.xpTable.4',
  'units.hunter.xpTable.5',
  'units.hunter.xpTable.6',
  'units.hunter.xpTable.7',
  'units.hunter.xpTable.8',
  'units.hunter.xpTable.9',
  'units.hunter.xp.hen',
  'units.hunter.xp.sheep',
  'units.hunter.xp.pig',
  'units.hunter.xp.cow',
  'units.hunter.xp.scarecrow',
  'units.hunter.xp.crow',
  'units.bounty.hen',
  'units.bounty.sheep',
  'units.bounty.pig',
  'units.bounty.cow',
  'units.bounty.scarecrow',
  'units.bounty.crow',
  'units.army.scarecrow.cost',
  'units.army.scarecrow.hp',
  'units.army.scarecrow.dps',
  'units.army.scarecrow.attackEvery',
  'units.army.scarecrow.range',
  'units.army.scarecrow.speed',
  'units.army.scarecrow.sight',
  'units.army.scarecrow.radius',
  'units.army.scarecrow.flying',
  'units.army.scarecrow.bounty',
  'units.army.crow.cost',
  'units.army.crow.flock',
  'units.army.crow.hp',
  'units.army.crow.dps',
  'units.army.crow.attackEvery',
  'units.army.crow.range',
  'units.army.crow.speed',
  'units.army.crow.sight',
  'units.army.crow.radius',
  'units.army.crow.flying',
  'units.army.crow.bounty',
  'animals.kinds.cow.breed',
  'animals.kinds.cow.sight',
  'animals.kinds.cow.noise',
  'animals.rules.crowdMult',
  'animals.rules.fleeRange',
  'animals.rules.fleeSeconds',
  'animals.rules.fleeSpeed',
  'buildings.copyMult',
  'buildings.kinds.pen.cap',
  'buildings.kinds.sty.cap',
  'buildings.kinds.barn.cap',
  'buildings.kinds.hive.hp',
  'buildings.kinds.granary.hp',
  'buildings.kinds.windmill.tall',
  'buildings.kinds.farmhouse.size.0',
  'buildings.kinds.farmhouse.size.1',
  'buildings.kinds.farmhouse.cost',
  'buildings.kinds.farmhouse.hp',
  'buildings.kinds.farmhouse.onePer',
  'buildings.kinds.hedge.size.0',
  'buildings.kinds.hedge.size.1',
  'buildings.kinds.hedge.cost',
  'buildings.kinds.hedge.hp',
  'buildings.kinds.mud.size.0',
  'buildings.kinds.mud.size.1',
  'buildings.kinds.mud.cost',
  'buildings.kinds.mud.hp',
  'buildings.kinds.mud.mud.speedMult',
  'buildings.kinds.mud.mud.attackMult',
  'buildings.kinds.lookout.size.0',
  'buildings.kinds.lookout.size.1',
  'buildings.kinds.lookout.cost',
  'buildings.kinds.lookout.hp',
  'buildings.kinds.lookout.sight',
  'buildings.kinds.tower.size.0',
  'buildings.kinds.tower.size.1',
  'buildings.kinds.tower.cost',
  'buildings.kinds.tower.hp',
  'buildings.kinds.tower.sight',
  'buildings.kinds.tower.shoot.dps',
  'buildings.kinds.tower.shoot.attackEvery',
  'buildings.kinds.tower.shoot.range',
  'buildings.kinds.hall.size.0',
  'buildings.kinds.hall.size.1',
  'buildings.kinds.hall.cost',
  'buildings.kinds.hall.hp',
  'buildings.kinds.hall.needsProducers',
  'buildings.upgrades.feed.costs.1',
  'buildings.upgrades.feed.costs.2',
  'buildings.upgrades.stuffing.costs.1',
  'buildings.upgrades.stuffing.costs.2',
  'buildings.upgrades.stuffing.armyPct',
  'hunter.skills.Q.range',
  'hunter.skills.Q.cooldown',
  'hunter.skills.W.max',
  'hunter.skills.W.root',
  'hunter.skills.W.armySlow',
  'hunter.skills.W.armySlowSeconds',
  'hunter.skills.W.range',
  'hunter.skills.W.seenWithin',
  'hunter.skills.E.range',
  'hunter.tracking.keep',
  'hunter.watchstone.sight',
  'hunter.watchstone.seenWithin',
  'hunter.watchstone.range',
  'hunter.flare.seconds',
  'hunter.hound.range',
  'hunter-items.sellFactor',
  'hunter-items.items.horse1.price',
  'hunter-items.items.horse1.stats.speed',
  'hunter-items.items.horse3.price',
  'hunter-items.items.horse3.stats.speed',
  'hunter-items.items.axe.uniqueEquipped',
  'hunter-items.items.spyglass.uniqueEquipped',
  'hunter-items.items.snarekit.price',
  'hunter-items.items.snarekit.stats.snares',
  'hunter-items.items.blade.price',
  'hunter-items.items.blade.stats.damage',
  'hunter-items.items.leathers.price',
  'hunter-items.items.leathers.stats.armorPct',
  'hunter-items.items.salve.price',
  'hunter-items.items.salve.stats.regen',
  'rules.turn.armyWeight',
  'rules.turn.towerWeight',
  'rules.turn.hunterBase',
  'rules.turn.hunterPerLevel',
  'rules.turn.itemWeight',
]);

const exempt = key => PENDING.has(key) || Object.keys(EXEMPT).some(k => k === key || (k.endsWith('.*') && key.startsWith(k.slice(0, -1))) || (k.includes('.*.') && new RegExp('^' + k.replace(/\./g, '\\.').replace('\\.*\\.', '\\.[^.]+\\.') + '$').test(key)));

/** A busy 75-second 3v1: every building, upgrades, an army, the whole hunter kit. */
function scene(d) {
  const s = createHvf({ format: '3v1', seed: 77 }, d);
  const C = (dx, dz = 0) => ({ x: s.map.commons.x + dx, z: s.map.commons.z + dz });
  s.state.hvf.releaseTick = 20;
  for (const p of s.state.players) p.gold = 2e4;
  const kinds = ['coop', 'pen', 'sty', 'barn', 'hive', 'granary', 'windmill', 'farmhouse', 'sheepdog', 'fence', 'wall', 'hedge', 'mud', 'lookout', 'tower', 'hall'];
  // the first free spot (spiral out from the Commons) where this building fits
  const spotFor = (pid, kind) => {
    const f = ent(s, pid), g = liveGrid(s.ctx()), G = { cols: s.map.cols, rows: s.map.rows, n: s.map.cols * s.map.rows };
    const reach = bfsMove(G, g.cells, s.map.level, cellOf(s.map, f.x, f.z), c => canStand(g, 'farmer', c));
    const near = (x, z) => { const c = cellOf(s.map, x, z); for (const d of [0, 1, -1, 2, -2]) for (const e of [0, 1, -1, 2, -2]) { const i = c + d + e * s.map.cols; if (i >= 0 && i < G.n && reach[i] >= 0) return true; } return false; };
    for (let r = 4; r < 120; r += 2) for (let k = 0; k < 32; k++) {
      const a = k * 0.19635, x = s.map.commons.x + Math.round(r * Math.sin(a)), z = s.map.commons.z + Math.round(r * Math.cos(a));
      if (x < 4 || z < 4 || x > s.map.size - 4 || z > s.map.size - 4) continue;
      if (near(x, z) && Q.buildCheck(s, pid, kind, x, z) === null) return [x - s.map.commons.x, z - s.map.commons.z];
    }
    return [0, 0];
  };
  let ev = 0;
  const counts = {};
  const step = c => { s.step(c); for (const e of s.drainEvents()) { ev = (ev * 31 + hashString(JSON.stringify(e))) >>> 0; const k = e.type + (e.reason ? ':' + e.cmd + ':' + e.reason : '') + (e.type === 'built' || e.type === 'lost' ? ':' + e.kind : ''); counts[k] = (counts[k] || 0) + 1; } };
  kinds.forEach((k, i) => { const who = k === 'hedge' || k === 'fence' ? 1 : 0; const p = C(...spotFor(who, k)); step([{ p: who, type: 'build', kind: k, x: p.x, z: p.z }]); for (let t = 0; t < 160 && ent(s, who).ord.k === 'build'; t++) step([]); });
  for (const id of ['feed', 'shears', 'breeding', 'stuffing']) step([{ p: 0, type: 'upgrade', id }, { p: 1, type: 'upgrade', id }, { p: 2, type: 'upgrade', id }]);
  // hunter: items at the kennel, then out into the Commons with the full kit
  const h = ent(s, 3), hp = s.state.players[3];
  for (const id of ['horse2', 'axe', 'spyglass', 'watchstone', 'flare', 'hound', 'blade']) step([{ p: 3, type: 'buy', id }]);
  for (let t = 0; t < 25; t++) step([]);
  const hall = s.state.ents.find(e => e.type === 'hall');
  if (hall) for (const unit of ['scarecrow', 'crow', 'scarecrow']) step([{ p: hall.owner, type: 'train', unit, building: hall.id }]);
  h.x = h.px = s.map.commons.x - 14; h.z = h.pz = s.map.commons.z + 2;
  step([{ p: 3, type: 'cast', slot: 'E', ...C(4, 4) }, { p: 3, type: 'cast', slot: 'W', x: h.x, z: h.z }]);
  step([{ p: 3, type: 'ward', x: h.x, z: h.z }, { p: 3, type: 'use', slot: hp.inv.findIndex(it => it && it.id === 'flare'), ...C(12, 12) }]);
  step([{ p: 3, type: 'use', slot: hp.inv.findIndex(it => it && it.id === 'hound') }]);
  // back to the kennel for Torch Oil, then pounce at the nearest farmer
  const kennel = s.state.ents.find(e => e.type === 'kennel'), hx = h.x, hz = h.z;
  h.x = h.px = kennel.x; h.z = h.pz = kennel.z;
  step([{ p: 3, type: 'buy', id: 'torch' }]); step([{ p: 3, type: 'use', slot: hp.inv.findIndex(it => it && it.id === 'torch') }]);
  h.x = h.px = hx; h.z = h.pz = hz;
  { const f = ent(s, 2); step([{ p: 3, type: 'cast', slot: 'Q', x: f.x, z: f.z }]); }
  { const sn = s.state.ents.find(e => e.kind === 'snare'); if (sn) { const f0 = ent(s, 0); f0.x = f0.px = sn.x + 3; f0.z = f0.pz = sn.z; f0.ord = { k: 'idle' }; } }
  step([{ p: 0, type: 'cast', slot: 'Q' }, { p: 1, type: 'cast', slot: 'E' }, { p: 2, type: 'cast', slot: 'W' }]);
  const tree = s.map.cells.findIndex((k, i) => k === 2 && Math.abs((i % s.map.cols) * 2 - h.x) < 12 && Math.abs(Math.floor(i / s.map.cols) * 2 - h.z) < 12);
  step([{ p: 3, type: 'chop', cell: tree }]);
  for (let t = 1; t <= 20 * 60; t++) {
    const c = [];
    if (t % 40 === 0) {
      const ctx = s.ctx();
      let target = null, bd = 900;
      for (const e of s.state.ents) if (e.team === 0 && e.alive && !e._gone && (e.kind === 'animal' || e.kind === 'army' || (e.kind === 'farmer' && t > 700) || (e.kind === 'building' && t > 1000)) && (e.x - h.x) ** 2 + (e.z - h.z) ** 2 < bd && Q.visibleEnt(s, 1, e)) { bd = (e.x - h.x) ** 2 + (e.z - h.z) ** 2; target = e; }
      if (target) c.push({ p: 3, type: 'attack', target: target.id });
      const army = s.state.ents.filter(e => e.kind === 'army');
      if (army.length && hall) c.push({ p: hall.owner, type: 'order', ids: army.map(a => a.id), kind: 'amove', x: h.x, z: h.z });
      void ctx;
    }
    if (t === 30) { const w = s.state.ents.find(e => e.kind === 'ward' || e.kind === 'snare'); if (w) c.push({ p: 0, type: 'pullup', target: w.id }); }
    if (t === 900) { const f = ent(s, 1); hurt(s.ctx(), h, f, 1e6); }
    if (t === 960) c.push({ p: 2, type: 'revive', target: 1 });
    step(c);
  }
  if (process.env.HVF_SCENE) console.log(counts, s.state.result, s.state.ents.map(e => e.kind + ':' + e.type).join(' '), s.state.players.map(p => [p.level, p.xp, Math.round(p.gold)]));
  return hashValue(s.state) + ':' + ev;
}
export { scene };

if (!process.env.HVF_SCENE) test('every number in data/hvf/*.json changes a busy match (or is listed with a reason)', () => {
  const base = hvfData();
  const ref = scene(base);
  assert.equal(scene(hvfData()), ref, 'the scene is deterministic');
  const dead = [];
  for (const file of ['units', 'animals', 'buildings', 'hunter', 'hunter-items', 'rules']) {
    for (const path of leaves(base.hvf[file])) {
      const key = [file, ...path].join('.');
      if (exempt(key)) continue;
      const d = hvfData(raw => setAt(raw[file], path, oddly(getAt(raw[file], path))));
      if (scene(d) === ref) dead.push(key);
    }
  }
  assert.deepEqual(dead, [], 'data/hvf fields the sim never reads:\n  ' + dead.join('\n  '));
});
