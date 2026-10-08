// Stream W, play-test 8 W6 (report #27: "improve gate/road placement at Torborhold; it just leads you right into
// buildings instead of having a main road"). On the CHECKED-IN bake of every zone:
//   - every gate a world road uses has a main street to the edge of the town square
//   - nothing with a footprint (plot, office, wall, tower, market stall, stream E's things) stands within the street's
//     width anywhere along it, and nav.bin lets you walk all of it
//   - the first thing straight inside a gate is road, not a house
// and on the planner: the wall planner follows high streets, and the measure really does notice a house in the road.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadZone, zoneIds } from '../../tools/gate-streets.mjs';
import { measureGates, checkGateStreets, HIGH_STREET_WIDTH } from '../../tools/lib/gate-street-checks.mjs';
import { squareFurniture, STALL_R } from '../../js/client/town-square.js';
import { planTown, overlaps } from '../../../../proctown/js/townplan.js';

const ZONES = zoneIds();

test('W6: every zone is baked with main streets (16 zones, every road gate has one)', () => {
  assert.equal(ZONES.length, 16);
  let gates = 0;
  for (const z of ZONES) for (const r of measureGates(loadZone(z))) if (r.road) { gates++; assert.ok(r.hasMain, `${z} ${r.gate} has no main street`); }
  assert.ok(gates >= 60, `only ${gates} road gates`);
});

for (const z of ZONES) test(`W6: ${z} — every gate's main street is clear to the square`, () => {
  assert.deepEqual(checkGateStreets(loadZone(z)), []);
});

test('W6: Torborhold — three road gates, each a straight clear street at least 5 m wide', () => {
  const rows = measureGates(loadZone('z12_02')).filter(r => r.town === 'torborhold' && r.road);
  assert.equal(rows.length, 3);
  for (const r of rows) { assert.equal(r.blocked, 0); assert.ok(r.narrowest >= 5, `${r.gate} narrows to ${r.narrowest}`); assert.ok(r.ahead >= 30, `${r.gate}: ${r.ahead} m ahead`); assert.equal(r.navBlocked, 0); }
});

test('W6: a main street leaves its gate the way you came in (no dog-leg at the wall) and is as wide as its settlement asks', () => {
  for (const z of ZONES) {
    const { P } = loadZone(z);
    for (const W of P.filter(p => p.kind === 'town_wall')) for (const g of W.data.gates) {
      if (!g.main) continue;
      // as wide as its settlement asks; where shops ring the square too tightly for that, narrower — but never an alley
      assert.ok(g.main.width <= HIGH_STREET_WIDTH[W.data.settlement] && g.main.width >= 3.2, `${g.id} width ${g.main.width}`);
      const [a, b] = g.main.pts, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // the first leg runs with the gate's own `out` (the way a walker comes in), to within 12 degrees
      const c = -((b[0] - a[0]) * g.out[0] + (b[1] - a[1]) * g.out[1]) / d;
      assert.ok(c > Math.cos(12 * Math.PI / 180), `${g.id}: its street leaves the gate ${(Math.acos(Math.min(1, c)) * 180 / Math.PI).toFixed(0)} deg off the way in`);
      assert.ok(P.some(p => p.kind === 'street' && p.id === g.main.street && p.data.high), `${g.id}: ${g.main.street} is not a high street`);
    }
  }
});

test('W6: market stalls stand off every street and every plot', () => {
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  let stalls = 0;
  for (const z of ZONES) {
    const { P } = loadZone(z);
    for (const sq of P.filter(p => p.kind === 'town_square')) {
      assert.ok(Array.isArray(sq.data.stalls), `${sq.id} has no baked stalls`);
      for (const s of squareFurniture({ square: { x: sq.x, z: sq.z, r: sq.data.r }, stalls: sq.data.stalls }).stalls) {
        stalls++;
        for (const st of P.filter(p => p.kind === 'street' && p.data.town === sq.data.town)) for (let k = 0; k < st.data.pts.length - 1; k++)
          assert.ok(segD(s.x, s.z, st.data.pts[k], st.data.pts[k + 1]) >= st.data.width / 2 + STALL_R, `${sq.id}: a stall in ${st.id}`);
      }
    }
  }
  assert.ok(stalls > 60, `only ${stalls} stalls`);
});

test('W6: the measure notices a house put in the road (it is not a test that cannot fail)', () => {
  const Z = loadZone('z12_02'), P = structuredClone(Z.P);
  const g = P.find(p => p.id === 'torborhold_wall').data.gates[0], m = g.main.pts, mid = [(m[0][0] + m[1][0]) / 2, (m[0][1] + m[1][1]) / 2];
  P.push({ kind: 'building', id: 'torborhold_plot_test', x: mid[0], z: mid[1], yaw: 0, data: { town: 'torborhold', w: 4, d: 4, angle: 0, front: 0 } });
  const bad = checkGateStreets({ ...Z, P });
  assert.ok(bad.some(b => b.includes(g.id) && b.includes('blocked')), bad.join('; '));
});

test('W6 planner: with highStreets every link runs to the square and no plot stands in it; without, nothing changes', () => {
  for (const seed of [3, 11, 29, 47]) for (const size of [1, 2, 3, 4]) {
    const links = [[80, 5], [-10, 90], [-70, -40]], opts = { seed, size, culture: 'halfling', links };
    const plain = planTown(opts), again = planTown({ ...opts, highStreets: null });
    assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(plain)));
    const plan = planTown({ ...opts, highStreets: { to: 'square', width: 5, clear: 0.6 } });
    const highs = plan.streets.filter(s => s.high);
    assert.ok(highs.length >= 1 && highs.length <= 3);
    assert.equal(overlaps(plan).length, 0);
    for (const h of highs) {
      const end = h.pts[h.pts.length - 1];
      if (h.to === 'square') assert.ok(Math.abs(Math.hypot(end[0] - plan.square.cx, end[1] - plan.square.cz) - plan.square.r) < 0.01);
      else assert.ok(h.joins && h.joins.to === 'square');
    }
  }
});
