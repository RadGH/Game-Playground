// Stream D — the drawn telegraph must be the measured telegraph: every point of the client's mesh lies inside
// the server's shape (js/rules/telegraph.js `inside`), the outline distance is ~0 on the server's boundary,
// and the fill coordinate runs 0..1 in the direction the blow travels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldAt, localMesh } from '../../js/client/telegraph-shape.js';
import { inside } from '../../js/rules/telegraph.js';

const SHAPES = [
  { shape: 'circle', r: 4 },
  { shape: 'ring', r: 9, r2: 5 },
  { shape: 'donut', r: 5, r2: 2 },
  { shape: 'cone', r: 12, arc: 1.1 },
  { shape: 'line', len: 16, w: 2.5 },
  { shape: 'cross', r: 7, w: 2 },
];

for (const base of SHAPES) {
  test(`telegraph ${base.shape}: drawn mesh = measured shape`, () => {
    for (const yaw of [0, 0.7, -2.3]) {
      const t = { ...base, x: 100, z: 50, yaw };
      const { pts, idx } = localMesh(t);
      assert.ok(idx.length >= 6 && pts.length >= 8);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (let k = 0; k < pts.length / 2; k++) {
        const lx = pts[k * 2], lz = pts[k * 2 + 1];
        const wx = t.x + lz * s + lx * c, wz = t.z + lz * c - lx * s;   // the same transform telegraphs.js uses
        assert.ok(inside(t, wx, wz, 0.02), `${base.shape} point (${lx.toFixed(2)}, ${lz.toFixed(2)}) is outside the server's shape`);
        const f = fieldAt(t, lx, lz);
        assert.ok(f.e >= -0.02, `edge distance ${f.e} < 0`);
        assert.ok(f.f >= -1e-6 && f.f <= 1 + 1e-6, `fill ${f.f} out of 0..1`);
      }
    }
  });
}

test('telegraph fill runs from where the blow starts', () => {
  assert.equal(fieldAt({ shape: 'circle', r: 4 }, 0, 0).f, 0);
  assert.equal(fieldAt({ shape: 'circle', r: 4 }, 0, 4).f, 1);
  assert.equal(fieldAt({ shape: 'line', len: 10, w: 2 }, 0, 0).f, 0);
  assert.equal(fieldAt({ shape: 'line', len: 10, w: 2 }, 0, 10).f, 1);
  assert.equal(fieldAt({ shape: 'ring', r: 9, r2: 5 }, 0, 9).f, 0, 'a ring closes in from its rim');
  assert.ok(Math.abs(fieldAt({ shape: 'circle', r: 4 }, 0, 4).e) < 1e-9, 'the rim is the outline');
});
