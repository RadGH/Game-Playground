// OPT-IN high streets (planTown({ highStreets })) — added for Thousandvale 2026-10-08. Without the option every plan
// is what it always was; with it, each road link runs to the square as one main street that no plot stands in, goes
// round any plot the caller asked to keep, and passes beside anything in `avoid`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTown, overlaps, corners } from '../js/townplan.js';

const LINKS = [[80, 5], [-10, 90], [-70, -40]];
const flat = p => JSON.parse(JSON.stringify(p));

test('without highStreets a plan is unchanged (and `highStreets: null` is the same as leaving it out)', () => {
  for (const culture of ['human', 'dwarf', 'halfling', 'elf']) for (const seed of [1, 7, 42]) for (const size of [1, 3, 5]) {
    const o = { seed, size, culture, links: LINKS };
    assert.deepEqual(flat(planTown({ ...o, highStreets: null })), flat(planTown(o)));
    assert.ok(planTown(o).streets.every(s => !s.high));
  }
});

test('with highStreets every link reaches the square (or a street that does) and nothing stands in it', () => {
  for (const culture of ['human', 'dwarf', 'halfling', 'orc']) for (const seed of [1, 7, 42, 99]) for (const size of [1, 2, 3, 4, 5]) {
    const plan = planTown({ seed, size, culture, links: LINKS, highStreets: { to: 'square', width: 5, clear: 0.6 } });
    const highs = plan.streets.filter(s => s.high);
    assert.ok(highs.length >= 1, `${culture} ${seed} ${size}: no high street`);
    assert.equal(overlaps(plan).length, 0);
    for (const h of highs) {
      const end = h.pts[h.pts.length - 1];
      if (h.to === 'square') assert.ok(Math.abs(Math.hypot(end[0] - plan.square.cx, end[1] - plan.square.cz) - plan.square.r) < 0.01);
      else assert.equal(h.joins.to, 'square');
      // the kerb: no plot corner within width / 2 + clear of the centreline
      for (const p of plan.plots) for (const [x, z] of corners(p)) for (let k = 0; k + 1 < h.pts.length; k++) {
        const a = h.pts[k], b = h.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
        assert.ok(Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) >= h.width / 2 + h.clear - 0.05, `${culture} ${seed} ${size}: a plot corner in the kerb`);
      }
    }
  }
});

test('`keep`: a high street goes round a plot it was asked to keep, where a way round exists', () => {
  let kept = 0, asked = 0;
  for (const seed of [1, 7, 42, 99, 123]) {
    const o = { seed, size: 3, culture: 'halfling', links: LINKS };
    const straight = planTown({ ...o, highStreets: { to: 'square', width: 5 } });
    const key = p => [p.cx, p.cz, p.w, p.d].map(v => v.toFixed(2)).join(',');
    const left = new Set(straight.plots.map(key));
    const plain = planTown(o), lost = plain.plots.filter(p => !left.has(key(p)));   // what the straight streets took
    if (!lost.length) continue;
    const plan = planTown({ ...o, highStreets: { to: 'square', width: 5, keep: lost } });
    const now = new Set(plan.plots.map(key));
    asked += lost.length; kept += lost.filter(p => now.has(key(p))).length;
    assert.equal(overlaps(plan).length, 0);
  }
  assert.ok(asked > 0 && kept >= asked * 0.8, `kept ${kept} of ${asked}`);
});

test('`avoid`: a high street passes beside a disc standing in its straight line', () => {
  const o = { seed: 7, size: 3, culture: 'halfling', links: [[80, 5]] };
  const h0 = planTown({ ...o, highStreets: { to: 'square', width: 5 } }).streets.find(s => s.high);
  const mid = { x: (h0.pts[0][0] + h0.pts[1][0]) / 2, z: (h0.pts[0][1] + h0.pts[1][1]) / 2, r: 1 };
  const h = planTown({ ...o, highStreets: { to: 'square', width: 5, avoid: [mid] } }).streets.find(s => s.high);
  for (let k = 0; k + 1 < h.pts.length; k++) {
    const a = h.pts[k], b = h.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((mid.x - a[0]) * dx + (mid.z - a[1]) * dz) / (dx * dx + dz * dz)));
    assert.ok(Math.hypot(mid.x - a[0] - dx * t, mid.z - a[1] - dz * t) >= 1 + 2.5 - 0.01);
  }
});
