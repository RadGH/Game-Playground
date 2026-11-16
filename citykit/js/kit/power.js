// Power pylons for Arcline's power lines (owner 2026-11-16: "The electrical poles don't fit in and don't have wires
// spanning between them"). A slim tapered lattice mast in dark alloy with a crossarm, glowing glass insulators at the
// arm tips (where the game hangs its wires) and a red beacon on top. The game places one every few tiles along a line
// and draws the sagging wires between them itself.
//
// Wire contract (the game's renderer uses these numbers): a crossarm runs along the model's z axis (across a line that
// runs along x — a line running along z uses the next view turn, like walls). Wires hang from
// (0, ARM_Y, ±ARM_HALF) and the earth wire from (0, TOP_Y, 0). `cross: 1` adds a second arm along x (corners, junctions).
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { box, cyl, dome, bodyMat, trimMat, neonMat } from './shapes.js';

export const PYLON = { ARM_Y: 0.98, ARM_HALF: 0.3, TOP_Y: 1.2 };
const LEG_FOOT = 0.15, LEG_TOP = 0.045;

/** A strut from a to b ([x, y, z] each), radius r. */
function strut(g, a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const m = cyl(g, r, len, mat, 0, 0, 0, { seg: 6 });
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}
const legAt = (sx, sz, y) => { const k = y / PYLON.ARM_Y, h = LEG_FOOT + (LEG_TOP - LEG_FOOT) * Math.min(1, k); return [sx * h, y, sz * h]; };

function arm(g, alongX, steel, glow, insul) {
  const { ARM_Y: y, ARM_HALF: a } = PYLON;
  if (alongX) box(g, a * 2 + 0.08, 0.035, 0.035, steel, 0, y + 0.02, 0); else box(g, 0.035, 0.035, a * 2 + 0.08, steel, 0, y + 0.02, 0);
  // braces from the mast up to each arm tip
  for (const s of [-1, 1]) strut(g, alongX ? [0, y - 0.16, 0] : [0, y - 0.16, 0], alongX ? [s * a * 0.8, y + 0.02, 0] : [0, y + 0.02, s * a * 0.8], 0.008, steel);
  // insulator strings hang under the tips: stacked glass discs that glow at night
  for (const s of [-1, 1]) {
    const x = alongX ? s * a : 0, z = alongX ? 0 : s * a;
    for (let k = 0; k < 3; k++) cyl(g, 0.028, 0.018, k === 1 ? glow : insul, x, y - 0.05 - k * 0.028, z, { seg: 10 });
    box(g, 0.05, 0.012, 0.05, steel, x, y - 0.075, z);
  }
}

addRecipes({
  'pwr-pylon': {
    name: 'Power Pylon', group: 'services', size: [1, 1], noStyle: true,
    blurb: 'Carries a power line. Placed by itself every few tiles along a line; wires hang between pylons.',
    params: [{ key: 'cross', label: 'Arms', min: 0, max: 1, step: 1, def: 0, names: ['One (straight run)', 'Two (corner / junction)'] }],
    build(p) {
      const g = new THREE.Group();
      const steel = bodyMat('graphite', 0, { color: '#3b4250', metal: 0.75, rough: 0.35 }), dark = trimMat('graphite');
      const glow = neonMat('#5ff2ff', 0.55), insul = neonMat('#9fdcf0', 0.15), beacon = neonMat('#ff4646', 0.6);
      // footing: a small concrete plinth per leg
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.07, 0.04, 0.07, dark, sx * LEG_FOOT, 0, sz * LEG_FOOT);
      // four legs leaning in to the waist
      const top = PYLON.ARM_Y + 0.02;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) strut(g, legAt(sx, sz, 0.03), legAt(sx, sz, top), 0.012, steel);
      // lattice: rings and X-braces on each face, tighter toward the top
      const levels = [0.03, 0.3, 0.55, 0.76, top];
      for (let n = 0; n < levels.length; n++) {
        const y = levels[n];
        const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => legAt(sx, sz, y));
        if (n) for (let k = 0; k < 4; k++) strut(g, c[k], c[(k + 1) % 4], 0.006, steel);
        if (n < levels.length - 1) {
          const y2 = levels[n + 1], c2 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => legAt(sx, sz, y2));
          for (let k = 0; k < 4; k++) { strut(g, c[k], c2[(k + 1) % 4], 0.005, steel); strut(g, c[(k + 1) % 4], c2[k], 0.005, steel); }
        }
      }
      // a thin glowing band at the waist: the cyber touch that reads at night
      box(g, LEG_TOP * 2 + 0.03, 0.02, LEG_TOP * 2 + 0.03, glow, 0, 0.76, 0);
      // top mast + earth-wire peak + beacon
      cyl(g, 0.022, PYLON.TOP_Y - top, steel, 0, top, 0, { rt: 0.012, seg: 8 });
      dome(g, 0.026, beacon, 0, PYLON.TOP_Y - 0.01, 0, { squash: 1, seg: 12 });
      arm(g, false, steel, glow, insul);
      if (p.cross) arm(g, true, steel, glow, insul);
      return g;
    },
  },
});
