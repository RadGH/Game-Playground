// Triangle counts per piece for both looks (and outfit, LOD 1).  node --import ./avatar-3d/tests/three-register.mjs avatar-3d/kestrel/opus2/tools/tris.mjs
import { createKestrelCharacter } from '../js/kestrel.js';
import { lookFor } from '../../js/looks.js';
for (const b of ['male', 'female']) for (const o of [false, true]) {
  const a = await createKestrelCharacter(lookFor(b, o)), l = await createKestrelCharacter(lookFor(b, o), { lod: 1 });
  const s = a.stats(); console.log(b, o ? 'outfit' : '      ', s.triangles, 'lod1', l.stats().triangles, 'ms', s.buildMs, o ? '' : JSON.stringify(s.pieces));
}
