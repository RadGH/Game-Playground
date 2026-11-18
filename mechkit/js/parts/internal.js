// Internal parts — generators, coolers and CPUs never show on the mech, but each gets a small model for its icon and
// the hangar (lessons rule 20: the icon comes from the model). build(root, part) stands it on the ground origin.
import { addParts, kitOf, box, cbox, rbox, cyl, ball, ring, rod, at, block, hazard, vents } from './kit.js';
import { PARTS_JSON } from '../data.js';

function generator(K, g, big) {
  const s = big ? 1.25 : 1;
  switch (K.look) {
    case 'sleek':
      cbox(g, 0.12 * s, 0.03, 0.12 * s, 0.01, K.S, 0, 0.015, 0);
      cyl(g, 0.035 * s, 0.1 * s, K.G, 'y', 0, 0.08 * s, 0, { seg: 6 });
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; cbox(g, 0.02, 0.12 * s, 0.03, 0.006, K.P, Math.cos(a) * 0.045 * s, 0.09 * s, Math.sin(a) * 0.045 * s).rotation.y = -a; }
      break;
    case 'chunky':
      rbox(g, 0.14 * s, 0.1 * s, 0.1 * s, 0.012, K.P, 0, 0.05 * s, 0);
      hazard(K, g, 0.07 * s + 0.002, 0.03, 0, 0.08 * s, 0.02, 5);
      for (const z of [-0.03, 0.03]) cyl(g, 0.012, 0.06, K.D, 'y', -0.04 * s, 0.13 * s, z * s, { seg: 10 });
      box(g, 0.006, 0.03, 0.05, K.G, 0.071 * s, 0.07 * s, 0);
      break;
    case 'rounded':
      ball(g, 0.06 * s, 0.07 * s, 0.06 * s, K.P, 0, 0.07 * s, 0, 20);
      ball(g, 0.03 * s, 0.03 * s, 0.03 * s, K.G, 0.04 * s, 0.08 * s, 0, 14);
      ring(g, 0.05 * s, 0.007, K.S, 'y', 0, 0.04 * s, 0);
      break;
    default:
      cyl(g, 0.045 * s, 0.1 * s, K.U, 'y', 0, 0.05 * s, 0, { seg: 12 });
      box(g, 0.06, 0.04, 0.05, K.P, 0.05, 0.03, 0).rotation.y = 0.3;
      cyl(g, 0.008, 0.012, K.G, 'y', 0, 0.105 * s, 0, { seg: 8 });
      rod(g, [0.02, 0.09 * s, 0.03], [0.07, 0.05, 0.02], 0.004, 0.004, K.R, 5);
  }
}
function cooler(K, g, big) {
  const s = big ? 1.25 : 1, n = big ? 7 : 5;
  const base = { sleek: K.S, chunky: K.S, rounded: K.S, scrap: K.N }[K.look];
  block(K, g, 0.12 * s, 0.025, 0.08 * s, base, 0, 0.0125, 0);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.016 * s;
    if (K.look === 'rounded') ball(g, 0.006, 0.05 * s, 0.035 * s, K.P, x, 0.06 * s, 0, 10);
    else block(K, g, 0.006, 0.07 * s, 0.07 * s, K.P, x, 0.06 * s, 0);
  }
  box(g, 0.12 * s, 0.004, 0.006, K.G, 0, 0.03, 0.04 * s);
  if (K.look === 'scrap') { cyl(g, 0.028, 0.008, K.D, 'x', 0.07 * s, 0.05 * s, 0, { seg: 12 }); }
}
function cpu(K, g, big) {
  const s = big ? 1.2 : 1;
  block(K, g, 0.1 * s, 0.03, 0.08 * s, K.S, 0, 0.015, 0);
  block(K, g, 0.07 * s, 0.025, 0.055 * s, K.P, 0, 0.04, 0);
  const rows = big ? 3 : 2;
  for (let i = 0; i < rows; i++) box(g, 0.05 * s, 0.004, 0.006, K.G, 0, 0.054, (i - (rows - 1) / 2) * 0.014);
  if (K.look === 'scrap') rod(g, [0.04, 0.05, 0.02], [0.06, 0.1, 0.03], 0.003, 0.003, K.R, 5);
  if (K.look === 'chunky') vents(K, g, 0.051 * s, 0.015, 0, 0.05, 0.02, 2);
}

const reg = {};
for (const p of PARTS_JSON.parts) {
  const draw = { generator, cooling: cooler, cpu }[p.slot]; if (!draw) continue;
  const big = p.class === 'heavy';
  reg[p.id] = { internal: true, build(root, part = p) { draw(kitOf(part.maker), at(root, 0, 0, 0), big); } };
}
addParts(reg);
