// Dump the built bind-pose geometry of both test looks (positions + dominant bone per vertex + joint positions) so
// tools/fit.py can measure it the same way it measures the Meshy GLB.
//   node --import ./avatar-3d/tests/three-register.mjs avatar-3d/kestrel/opus2/tools/dump.mjs <outDir> [attempt=opus2]
import { writeFileSync } from 'node:fs';
import { lookFor } from '../../js/looks.js';
const [out, attempt = 'opus2'] = process.argv.slice(2);
const { createKestrelCharacter } = await import(`../../${attempt}/js/kestrel.js`);
for (const body of ['male', 'female']) {
  const a = await createKestrelCharacter(lookFor(body));
  let mesh = null; a.group.traverse(o => { if (o.isSkinnedMesh && o.visible && !mesh) mesh = o; });
  const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const bones = a.skeleton.bones.map(b => b.name);
  const pos = [], dom = [];
  for (let i = 0; i < P.count; i++) {
    pos.push(+P.getX(i).toFixed(4), +P.getY(i).toFixed(4), +P.getZ(i).toFixed(4));
    let best = 0, bw = -1; for (let q = 0; q < 4; q++) { const w = SW.getComponent(i, q); if (w > bw) { bw = w; best = SI.getComponent(i, q); } }
    dom.push(best);
  }
  a.group.updateMatrixWorld(true);
  const joints = {}; for (const b of a.skeleton.bones) { const v = b.getWorldPosition(new (b.position.constructor)()); joints[b.name] = [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)]; }
  const idx = Array.from(g.index.array);
  writeFileSync(`${out}/${attempt}-${body}.json`, JSON.stringify({ bones, pos, dom, joints, index: idx, tris: idx.length / 3, height: a.metrics().height }));
  a.dispose();
}
console.log('ok');
