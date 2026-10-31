// Measures the biggest body each race can roll, on the real Chibi 2.5 model, and writes data/race-sizes.json for the door test
// (node can read the numbers without a renderer). Run again if a race's proportions change:
//   node --import ./avatar-3d/tests/three-register.mjs prototypes/oddhaven/tools/measure-races.mjs
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { createChibi2Character } from '../../../avatar-3d/js/chibi2.js';
import { CHIBI2_RACES } from '../../../avatar-3d/js/chibi2-races.js';

const out = {};
for (const race of Object.keys(CHIBI2_RACES)) {
  const r = CHIBI2_RACES[race].ranges, a = await createChibi2Character({ body: { race, height: r.height[1], width: r.width[1], round: r.round[1], headSize: r.headSize[1] } }, { v25: true });
  a.group.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(a.group).getSize(new THREE.Vector3());
  out[race] = { tall: +s.y.toFixed(3), wide: +s.x.toFixed(3), deep: +s.z.toFixed(3) };
}
writeFileSync(new URL('../data/race-sizes.json', import.meta.url), JSON.stringify({ _doc: 'The biggest body each race can roll, in model metres, before any scale in the game. Written by tools/measure-races.mjs.', races: out }, null, 1) + '\n');
console.log(out);
