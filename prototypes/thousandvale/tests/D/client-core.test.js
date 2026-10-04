// Stream D — node tests for the pure parts of the client: prediction + reconcile against stream A's real
// server sim (loopback), looks, the stand-in terrain adapter, the camp placements and the terrain mesh's
// agreement with the reader. Run: node --test prototypes/thousandvale/tests/D/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Predictor, MOVE } from '../../js/client/predict.js';
import { defaultLook, PLAYABLE_RACES, MONSTER_BODIES } from '../../js/client/looks.js';
import { loadClientTerrain } from '../../js/client/terrain.js';
import { campPlacements } from '../../js/client/camp.js';
import { parseTerrain, gridIndices } from '../../js/rules/terrain-read.js';
import { stepMove } from '../../js/sim/movement.js';
import { makeServer, joinAs, run } from '../A/helpers.js';
import { createVirtualClock } from '../../js/net/clock.js';

const flat = { heightAt: () => 0 };

test('predict: agreeing server -> no corrections; disagreeing server -> blended, never a jump', () => {
  const p = new Predictor({ stepMs: 50 }); p.terrain = flat;
  p.reset({ x: 0, y: 0, z: 0 });
  const server = []; const srv = { x: 0, y: 0, z: 0, vy: 0, airborne: false };
  for (let i = 0; i < 20; i++) {
    server.push(p.apply({ mx: 0, mz: 1, yaw: 0, b: 0 }));
    if (i >= 3) { const s = server.shift(); stepMove(srv, s, s.dt, flat); assert.ok(p.reconcile(s.s, srv) < 1e-9); }
  }
  assert.equal(p.corrections, 0);
  assert.ok(Math.abs(p.pos.z - 20 * 0.05 * MOVE.run) < 1e-9);
  const before = p.render(1, 0);
  p.reconcile(p.pending[0].s - 1, { x: 0, y: 0, z: srv.z - 0.5, vy: 0 });
  assert.ok(Math.abs(p.render(1, 0).z - before.z) < 1e-6, 'drawn position does not jump on a small correction');
  for (let i = 0; i < 60; i++) p.render(1, 1 / 60);
  assert.ok(Math.abs(p.render(1, 0).z - p.pos.z) < 0.01, 'the error blends away within a second');
  p.reconcile(p.lastAck + 1000, { x: 100, y: 0, z: 100 });
  assert.equal(p.render(1, 0).x, 100, 'a teleport snaps');
});

test('predict: inputs are rounded BEFORE the local step, so client and server run identical numbers', () => {
  const p = new Predictor({ stepMs: 50 }); p.terrain = flat; p.reset({ x: 0, y: 0, z: 0 });
  const inp = p.apply({ mx: 0.123456789, mz: 0.987654321, yaw: 1.23456789, b: 1 });
  assert.equal(inp.mx, 0.123); assert.equal(inp.mz, 0.988);
  const s = { x: 0, y: 0, z: 0, vy: 0, airborne: false };
  stepMove(s, JSON.parse(JSON.stringify(inp)), inp.dt, flat);   // what the server gets after the wire
  assert.equal(s.x, p.pos.x); assert.equal(s.z, p.pos.z);
});

test('predict vs the real server sim: 10 s of walking and turning reconciles with zero corrections', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock, latencyMs: 40 });
  await srv.ready;
  const c = await joinAs(srv, clock, 'Predi');
  const terrain = srv.world.room?.terrain || srv.world.rooms?.values().next().value.terrain;
  const p = new Predictor({ stepMs: 50 });
  p.terrain = { heightAt: terrain.heightAt, walkable: terrain.walkable, bounds: terrain.bounds };
  p.reset(c.joined.you);
  let worst = 0, snaps = 0;
  c.on('joined', j => p.reset(j.you));
  c.on('snap', s => { snaps++; if (s.self) worst = Math.max(worst, p.reconcile(s.ack, s.self)); });
  for (let i = 0; i < 200; i++) {
    const a = i * 0.05;
    c.input(p.apply({ mx: Math.sin(a), mz: Math.cos(a), yaw: a, b: i % 40 < 20 ? 1 : 0 }));
    await run(clock, 50, 10);
  }
  await run(clock, 400, 10);
  assert.ok(snaps > 100, `only ${snaps} snapshots`);
  assert.ok(worst < 0.05, `worst correction ${worst} m`);
  assert.ok(p.pending.length <= 3);
});

test('looks: a character with no look gets a stable one; monster ids map to bodies', () => {
  const a = defaultLook(42, 'mage'), b = defaultLook(42, 'mage');
  assert.deepEqual(a, b);
  assert.ok(PLAYABLE_RACES.includes(a.race) && a.seed > 0 && a.cls === 'mage');
  assert.notDeepEqual(defaultLook(43, 'mage'), a);
  assert.equal(MONSTER_BODIES.grey_wolf, 'wolf');
});

test('terrain: the stand-in adapter reads the same heights as the server stand-in', async () => {
  const T = await loadClientTerrain(null);
  const { standInTerrain } = await import('../../js/sim/terrain.js');
  const s = standInTerrain(1, 2048);
  for (const [x, z] of [[10, 10], [1024, 1024], [1500, 333]]) assert.equal(T.heightAt(x, z), s.heightAt(x, z));
  const g = T.heightGrid();
  assert.equal(g.length, T.res * T.res);
  assert.ok(Math.abs(g[(T.res >> 1) * T.res + (T.res >> 1)] - s.heightAt(T.origin.x + (T.res >> 1) * T.step, T.origin.z + (T.res >> 1) * T.step)) < 1e-4);
});

test('terrain mesh: the client chunk triangulation is the reader\'s (drawn = measured)', () => {
  const t = parseTerrain(readFileSync(new URL('../../data/zones/test/terrain.bin', import.meta.url)));
  // Same split as js/client/terrain-view.js: p=(i,j) q=(i+1,j) r=(i,j+1) s=(i+1,j+1) -> (p,r,q) (q,r,s).
  const idx = gridIndices(3);
  assert.deepEqual([...idx.slice(0, 6)], [0, 3, 1, 1, 3, 4]);
  // A point on the shared diagonal of a cell is the mean of the diagonal's two samples.
  const i = 500, j = 600, x = t.origin.x + (i + 0.5) * t.step, z = t.origin.z + (j + 0.5) * t.step;
  const mid = (t.heightOfSample(i + 1, j) + t.heightOfSample(i, j + 1)) / 2;
  assert.ok(Math.abs(t.heightAt(x, z) - mid) < 1e-4);
});

test('camp: placements land around the spawn and never in water', async () => {
  const T = await loadClientTerrain(null);
  const c = campPlacements({ x: 1000, z: 1000 }, T);
  assert.ok(c.length > 10);
  for (const p of c) assert.ok(Math.hypot(p.x - 1000, p.z - 1000) < 40);
  const wet = { ...T, waterAt: () => ({ depth: 1 }) };
  assert.equal(campPlacements({ x: 1000, z: 1000 }, wet).filter(p => p.kind === 'prop').length, 0);
});
