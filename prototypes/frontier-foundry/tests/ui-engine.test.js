// The engine hooks the interface needs: rotated footprints, selectAt, walk orders and shot records.
// These are the only things the interface phase added to the engine, so this is where they are pinned.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../js/data.js';
import { Game } from '../js/game.js';
import { footprint } from '../js/build.js';
import { spawnWave, recordShot } from '../js/combat.js';

const data = await loadData();
const make = (opts = {}) => Game.createSync({ data, seed: 5, difficulty: 'normal', size: 64, nests: false, ...opts });

test('a quarter turn swaps a rectangular footprint and leaves a square one alone', () => {
  const rect = data.structure.refinery;                       // 5 x 4
  assert.deepEqual(footprint(rect, 0), { w: 5, h: 4 });
  assert.deepEqual(footprint(rect, 1), { w: 4, h: 5 });
  assert.deepEqual(footprint(rect, 2), { w: 5, h: 4 });
  assert.deepEqual(footprint(rect, 3), { w: 4, h: 5 });
  const square = data.structure.drill_mk1;
  assert.deepEqual(footprint(square, 1), { w: 3, h: 3 });
});

test('a turned building occupies the turned tiles and comes back turned from a save', () => {
  const g = make();
  const hq = g.hq();
  // anywhere clear on the map, then lay a 5x4 refinery on its side
  let spot = null;
  for (let y = 1; y < g.map.height - 6 && !spot; y++) {
    for (let x = 1; x < g.map.width - 6; x++) {
      if (g.canPlace('refinery', x, y, { ignoreCost: true, ignoreUnlock: true, rot: 1 }).ok) { spot = { x, y }; break; }
    }
  }
  assert.ok(spot, 'there should be room for a turned refinery near the pod');
  const out = g.place('refinery', spot.x, spot.y, { free: true, rot: 1 });
  assert.equal(out.ok, true);
  assert.equal(out.structure.w, 4);
  assert.equal(out.structure.h, 5);
  assert.equal(g.map.occupied[(spot.y + 4) * g.map.width + spot.x], out.structure.id);

  const back = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())), { data });
  const same = back.byId(out.structure.id);
  assert.equal(same.rot, 1);
  assert.equal(same.w, 4);
  assert.equal(same.h, 5);
});

test('selectAt finds the most interesting thing on a tile', () => {
  const g = make();
  const hq = g.hq();
  const onHq = g.selectAt(hq.x + 1, hq.y + 1);
  assert.equal(onHq.kind, 'structure');
  assert.equal(onHq.structure.id, hq.id);

  // a builder standing on the pod wins over the pod itself
  const u = g.units[0];
  u.x = hq.x + 1; u.y = hq.y + 1;
  assert.equal(g.selectAt(hq.x + 1, hq.y + 1).kind, 'unit');

  // a scanned patch with nothing on it comes back as a node
  const node = g.map.nodes.find(n => n.scanned && g.map.occupied[n.y * g.map.width + n.x] < 0);
  if (node) assert.equal(g.selectAt(node.x, node.y).kind, 'node');

  // empty ground is a tile, never null
  const empty = g.selectAt(1, 1);
  assert.equal(empty.kind, 'tile');
  assert.equal(empty.x, 1);
});

test('a walk order moves a crew member and a builder drops it when it arrives', () => {
  const g = make();
  const u = g.units.find(x => x.def.buildRate);
  const from = { x: u.x, y: u.y };
  u.moveTo = { x: u.x + 8, y: u.y };
  for (let i = 0; i < 20; i++) g.step(1);
  assert.ok(u.x > from.x + 4, 'the builder should have walked most of the way');
  for (let i = 0; i < 20; i++) g.step(1);
  assert.equal(u.moveTo, null, 'the order clears when it arrives');
});

test('shots are only recorded when the interface asks for them', () => {
  const g = make();
  recordShot(g, 0, 0, 1, 1, 'bullet');
  assert.equal(g.shots, undefined, 'off by default, so the headless sim pays nothing');
  g.recordShots = true;
  recordShot(g, 0, 0, 1, 1, 'bullet');
  assert.equal(g.shots.length, 1);
  assert.deepEqual(Object.keys(g.shots[0]).sort(), ['t', 'type', 'x1', 'x2', 'y1', 'y2']);
  for (let i = 0; i < 400; i++) recordShot(g, 0, 0, 1, 1, 'bullet');
  assert.ok(g.shots.length <= 240, 'the list is bounded so a long fight cannot grow it forever');
});

test('a turret firing at a forced wave leaves tracers for the renderer', () => {
  const g = make({ nests: false });
  g.recordShots = true;
  const hq = g.hq();
  let placed = null;
  for (let r = 5; r < 18 && !placed; r++) {
    for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r]]) {
      if (g.canPlace('watchtower', hq.x + dx, hq.y + dy, { ignoreCost: true, ignoreUnlock: true }).ok) {
        placed = g.place('watchtower', hq.x + dx, hq.y + dy, { free: true });
        break;
      }
    }
  }
  assert.ok(placed?.ok, 'a watchtower should fit near the pod');
  const wave = spawnWave(g, { budget: 12 });
  assert.ok(wave && wave.spawned > 0);
  const t = placed.structure;
  for (const e of g.enemies) { e.x = t.x + 1; e.y = t.y + 1; }
  for (let i = 0; i < 6; i++) g.step(1);
  assert.ok(g.shots.length > 0, 'the turret should have recorded at least one tracer');
});
