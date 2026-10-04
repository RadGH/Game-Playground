import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid } from '../../js/sim/aoi.js';
import { seedStream, range } from '../../js/sim/rng.js';

test('grid query matches brute force; moves keep cells right', () => {
  const g = createGrid(1024);
  const r = seedStream(5, 'aoi');
  const es = [];
  for (let i = 0; i < 800; i++) { const e = { id: i, x: range(r, -20, 1044), z: range(r, -20, 1044) }; g.add(e); es.push(e); }
  for (let k = 0; k < 50; k++) {
    for (const e of es.slice(0, 100)) { e.x += range(r, -40, 40); e.z += range(r, -40, 40); g.move(e); }
    const x = range(r, 0, 1024), z = range(r, 0, 1024), rad = range(r, 5, 160);
    const got = g.query(x, z, rad).map(e => e.id).sort((a, b) => a - b);
    const want = es.filter(e => (e.x - x) ** 2 + (e.z - z) ** 2 <= rad * rad).map(e => e.id).sort((a, b) => a - b);
    assert.deepEqual(got, want);
  }
  let n = 0; for (const c of g.cells.values()) n += c.size;
  assert.equal(n, 800);
  g.remove(es[0]); assert.equal(es[0].cell, -1);
});
