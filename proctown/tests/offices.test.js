// Office dressing (js/offices.js): every trade builds on every culture's bodies, only lit trades carry lights,
// every part is a unit shape with sane numbers. Run: node --test proctown/tests/offices.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBuilding, MESHES, CULTURE_KEYS } from '../js/buildkit.js';
import { officeDressing, officeKindFor, OFFICE_KINDS } from '../js/offices.js';

test('every office kind dresses every culture\'s building with valid unit parts', () => {
  for (const culture of CULTURE_KEYS) for (const kind of Object.keys(OFFICE_KINDS)) for (const seed of [1, 7, 42]) {
    const desc = describeBuilding({ plot: { cx: 0, cz: 0, w: 9 + seed % 4, d: 8, angle: 0, facing: Math.PI / 2 }, culture, seed, want: kind });
    const d = officeDressing(kind, desc, { seed });
    assert.ok(d.parts.length > 3, `${culture}/${kind}`);
    for (const p of [...d.parts, ...d.spin.flatMap(s => s.parts)]) {
      assert.ok(MESHES.includes(p.mesh), p.mesh);
      assert.ok(p.w > 0 && p.h > 0 && p.d > 0, `${culture}/${kind} size`);
      assert.ok([p.x, p.y, p.z, p.yaw, p.rx, p.rz].every(Number.isFinite), `${culture}/${kind} numbers`);
    }
    if (!OFFICE_KINDS[kind].lit) assert.equal(d.lights.length, 0, `${kind} unlit`);
    assert.deepEqual(officeDressing(kind, desc, { seed }), d, 'same seed, same dressing');
  }
});
test('names find their trade; homes have none', () => {
  assert.equal(officeKindFor('smith'), 'forge');
  assert.equal(officeKindFor('forge'), 'forge');
  assert.equal(officeKindFor('house'), null);
  assert.equal(officeDressing(null, {}).parts.length, 0);
});
