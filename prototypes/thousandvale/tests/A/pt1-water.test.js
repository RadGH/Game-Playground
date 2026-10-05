// Play-test 1, P2 + P25 (stream A): a stream whose middle is deeper than WADE_DEPTH was an invisible wall;
// now deep water is SWUM — slower, floating at the surface, no attacks — on the server and in the client's
// prediction (the same stepMove), on the real torbor_downs bake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepMove, moveKind, MOVE } from '../../js/sim/movement.js';
import { STATE } from '../../js/net/protocol.js';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

// a 12 m wide stream along z = 50..62, 1.6 m deep in the middle (deeper than WADE_DEPTH 1.1), banks at 10 m
const bed = z => (z < 50 || z > 62 ? 10 : 10 - 1.6 * Math.sin((z - 50) / 12 * Math.PI) - 0.2);
const stream = {
  heightAt: (x, z) => bed(z),
  waterAt: (x, z) => { const surface = 9.95, depth = surface - bed(z); return depth > 0 ? { kind: 'river', surface, depth } : { kind: 'none', surface: NaN, depth: 0 }; },
  walkable: (x, z) => !(9.95 - bed(z) > 1.1),           // the reader's old rule: deep water is not walkable
  bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 },
};

test('P2: walking straight across a stream deeper than WADE_DEPTH gets to the other bank (it used to stop mid-stream)', () => {
  const s = { x: 50, y: 10, z: 45, vy: 0, airborne: false };
  let swam = 0, maxZ = 0;
  for (let i = 0; i < 200 && s.z < 70; i++) { stepMove(s, { mx: 0, mz: 1, b: 0 }, 50, stream); if (s.swim) swam++; maxZ = Math.max(maxZ, s.z); }
  assert.ok(s.z >= 70, 'reached the far bank, got to z=' + maxZ.toFixed(2));
  assert.ok(swam > 0, 'swam the deep middle');
  assert.equal(s.swim, false); assert.equal(s.y, 10, 'standing on the far bank');
  // the old behaviour, for the record: a terrain that cannot say it is water still blocks
  const old = { heightAt: stream.heightAt, walkable: stream.walkable, bounds: stream.bounds };
  const t = { x: 50, y: 10, z: 45, vy: 0, airborne: false };
  for (let i = 0; i < 200; i++) stepMove(t, { mx: 0, mz: 1, b: 0 }, 50, old);
  assert.ok(t.z < 62, 'without a water layer the middle is still a wall');
});

test('P25: swimming is slower, floats at the surface, cannot jump; wading is a little slower', () => {
  const mid = { x: 50, y: 0, z: 56, vy: 0, airborne: false };
  stepMove(mid, { mx: 0, mz: 0, b: 0 }, 50, stream);
  assert.equal(moveKind(stream, 50, 56), 'swim');
  assert.ok(mid.swim && Math.abs(mid.y - (9.95 - MOVE.swimSink)) < 1e-9, 'floats at surface - swimSink: ' + mid.y);
  const x0 = mid.x; stepMove(mid, { mx: 1, mz: 0, b: 0 }, 100, stream);
  assert.ok(Math.abs(mid.x - x0 - MOVE.swim * 0.1) < 1e-9, 'swim speed');
  stepMove(mid, { mx: 0, mz: 0, b: 1 << 1 }, 50, stream);          // IN.JUMP
  assert.equal(mid.airborne, false, 'no jumping out of deep water');
  // wading (ankle-deep < depth <= WADE_DEPTH) is MOVE.wade of a run
  const z = 50.6; assert.equal(moveKind(stream, 50, z), 'wade');
  const w = { x: 50, y: bed(z), z, vy: 0, airborne: false };
  stepMove(w, { mx: 1, mz: 0, b: 0 }, 100, stream);
  assert.ok(Math.abs(w.x - 50 - MOVE.run * MOVE.wade * 0.1) < 1e-9, 'wade speed');
});

test('P25: a client terrain with only waterAt predicts exactly what a terrain with moveAt does', () => {
  const withMove = { ...stream, moveAt: (x, z) => moveKind(stream, x, z) };
  const a = { x: 50, y: 10, z: 40, vy: 0, airborne: false }, b = { ...a };
  for (let i = 0; i < 300; i++) { const m = { mx: Math.sin(i / 17), mz: 1, b: i % 41 === 0 ? 2 : 0 }; stepMove(a, m, 50, stream); stepMove(b, { ...m }, 50, withMove); }
  assert.deepEqual(a, b);
});

test('P2/P25 on the real bake: a player swims across a real river, gets the swim state + y on the wire, cannot attack mid-stream', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Swimmer');
  const T = world.layouts[0].terrain;
  assert.equal(typeof T.waterAt, 'function', 'province terrain carries the water layer');
  // a deep river point with dry walkable ground on both sides within 25 m
  let pick = null;
  const b = T.bounds;
  outer: for (let x = b.minX + 600; x < b.maxX - 600; x += 7) for (let z = b.minZ + 600; z < b.maxZ - 600; z += 7) {
    const w = T.waterAt(x, z);
    if (w.kind !== 'river' || w.depth < 1.3) continue;
    for (let k = 0; k < 8; k++) {
      const ang = k / 8 * Math.PI, dx = Math.cos(ang), dz = Math.sin(ang);
      let A = null, B = null;
      for (let d = 2; d < 25 && !A; d += 1) if (T.walkable(x - dx * d, z - dz * d) && T.waterAt(x - dx * d, z - dz * d).depth === 0) A = { x: x - dx * d, z: z - dz * d, d };
      for (let d = 2; d < 25 && !B; d += 1) if (T.walkable(x + dx * d, z + dz * d) && T.waterAt(x + dx * d, z + dz * d).depth === 0) B = { x: x + dx * d, z: z + dz * d, d };
      if (A && B) { pick = { A, B, dx, dz, P: { x, z } }; break outer; }
    }
  }
  assert.ok(pick, 'found a river with two dry banks');
  const o = rec(world, a);
  world.transfer(o, world.copies[0], pick.A, 'test');
  await run(clock, 300);
  const e = rec(world, a).entity, room = rec(world, a).room;
  let s = 1, swam = false, ySeen = false, refused = null;
  a.on('castR', r => { if (!r.ok) refused = r; });
  const total = pick.A.d + pick.B.d + 3;
  for (let i = 0; i < Math.ceil(total / (MOVE.swim * 0.05)) + 40; i++) {
    a.input({ s: ++s, dt: 50, mx: pick.dx, mz: pick.dz, yaw: 0, b: 0 });
    await run(clock, 50, 50);
    if (e.state & STATE.swimming) {
      if (!swam) { a.cast({ slot: 0 }); }
      swam = true;
      const me = a.mirror.ents.get(e.id);
      if (me && Number.isFinite(me.y)) ySeen = true;
    }
    if ((e.x - pick.B.x) * pick.dx + (e.z - pick.B.z) * pick.dz >= 0) break;     // stepped onto the dry bank
  }
  await run(clock, 200);
  assert.ok(swam, 'swam somewhere in the middle');
  assert.ok(Math.hypot(e.x - pick.B.x, e.z - pick.B.z) < 1.6, 'reached the far bank: ' + JSON.stringify({ e: [e.x, e.z], B: pick.B }));
  assert.ok(!(e.state & STATE.swimming), 'out of the water again');
  assert.ok(ySeen, 'the mirror kept the server y while swimming');
  assert.ok(refused && refused.why === 'swimming', 'attacks refused while swimming: ' + JSON.stringify(refused));
  assert.equal(room.stats.rulesErrors, 0);
  a.close(); await srv.stop();
});
