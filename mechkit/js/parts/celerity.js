// Celerity Works — sleek and angular: knife-edge plates, swept fins, a narrow waist and glowing seams.
// Heads, cores, arms, boosters and legs (bipeds, bird legs, a hover delta). Ids match data/parts.json.
import { addParts, kitOf, box, cbox, cyl, prism, at } from './kit.js';
import { drawBiped, drawReverse, drawHover, drawArm } from './limbs.js';

const K = kitOf('celerity');
/** A profile in the front plane (points [z, y]) pushed out along x (depth), centred on x = 0. */
function front(parent, key, pts, depth, m, bevel, x = 0, y = 0, z = 0) { const o = prism(parent, 'cf:' + key, pts, depth, m, bevel, x, y, z); o.rotation.y = Math.PI / 2; return o; }

// ---------- heads: an arrowhead with a slit visor ----------
function head(k) {
  return { build(root) {
    const s = [0.9, 1, 1.12][k];
    const g = at(root, 0, 0, 0);
    box(g, 0.03, 0.02, 0.03, K.D, 0, 0.01, 0);                                   // neck
    prism(g, `head${k}`, [[-0.05, 0.015], [0.035, 0.012], [0.075, 0.03], [0.04, 0.062], [-0.035, 0.068], [-0.06, 0.045]].map(([x, y]) => [x * s, y * s]), 0.06 * s, K.P, 0.004);
    prism(g, `visor${k}`, [[0.03, 0.03], [0.074, 0.031], [0.045, 0.048], [0.02, 0.046]].map(([x, y]) => [x * s, y * s]), 0.064 * s, K.L, 0.002);
    prism(g, `crown${k}`, [[-0.045, 0.06], [0.03, 0.06], [-0.02, 0.078], [-0.07, 0.08]].map(([x, y]) => [x * s, y * s]), 0.026 * s, K.S, 0.002);
    if (k >= 1) for (const sd of [-1, 1]) {    // swept crest blades
      const b = prism(g, `crest${k}`, [[0, 0], [-0.07, 0.03], [-0.09, 0.025], [-0.02, -0.005]].map(([x, y]) => [x * s, y * s]), 0.006, K.A, 0.0015, -0.01, 0.055 * s, sd * 0.026 * s);
      b.rotation.x = -sd * 0.35;
    }
    if (k === 2) for (const sd of [-1, 1]) cbox(g, 0.05, 0.035, 0.012, 0.004, K.P, 0.0, 0.032, sd * 0.036);   // cheek plates
    if (k === 0) box(g, 0.002, 0.07, 0.002, K.M, -0.04, 0.09, 0.012);           // a whip antenna
  } };
}

// ---------- cores: a wedge chest over a narrow waist ----------
function core(k) {
  const W = [0.9, 1, 1.12][k], H = [0.96, 1, 1.06][k];
  const top = 0.225 * H;
  return {
    sockets: { neck: [0.012, top, 0], shoulderL: [0, 0.19 * H, -0.158 * W], shoulderR: [0, 0.19 * H, 0.158 * W], back: [-0.075, 0.14 * H, 0], mountL: [-0.045, top, -0.082 * W], mountR: [-0.045, top, 0.082 * W] },
    build(root) {
      const g = at(root, 0, 0, 0);
      cbox(g, 0.075, 0.07, 0.085 * W, 0.012, K.D, 0, 0.035, 0);                                 // waist
      front(g, `chest${k}`, [[-0.05, 0.06], [0.05, 0.06], [0.135, 0.165], [0.118, 0.22], [-0.118, 0.22], [-0.135, 0.165]].map(([z, y]) => [z * W, y * H]), 0.15, K.S, 0.005, -0.01, 0, 0);
      front(g, `chestP${k}`, [[-0.04, 0.09], [0.04, 0.09], [0.12, 0.17], [0.105, 0.215], [-0.105, 0.215], [-0.12, 0.17]].map(([z, y]) => [z * W, y * H]), 0.16, K.P, 0.006, 0.005, 0.004, 0);
      prism(g, `prow${k}`, [[0.06, 0.07], [0.11, 0.13], [0.1, 0.205], [0.04, 0.22]].map(([x, y]) => [x, y * H]), 0.07 * W, K.P, 0.004);       // keel
      for (const sd of [-1, 1]) {       // the glowing V seam
        const v = box(g, 0.004, 0.08 * H, 0.006, K.G, 0.112, 0.15 * H, sd * 0.03 * W); v.rotation.x = sd * 0.45;
      }
      box(g, 0.004, 0.012, 0.05 * W, K.G, 0.103, 0.205 * H, 0);
      // collar fins swept back
      for (const sd of [-1, 1]) {
        const f = prism(g, `cfin${k}`, [[0, 0], [-0.1, 0.06], [-0.12, 0.052], [-0.03, -0.004]], 0.008, K.A, 0.002, -0.02, top - 0.01, sd * 0.06 * W);
        f.rotation.x = -sd * 0.5;
      }
      cbox(g, 0.06, 0.12 * H, 0.08 * W, 0.012, K.D, -0.075, 0.14 * H, 0);                         // spine
      if (k === 2) for (const sd of [-1, 1]) {                                                     // heavy: flank armour
        front(g, 'flank', [[0, 0.08], [0.04, 0.1], [0.04, 0.19], [0, 0.2]], 0.13, K.P, 0.004, -0.01, 0, sd * 0.118 * W);
      }
      if (k === 0) box(g, 0.05, 0.004, 0.12, K.G, -0.02, 0.064, 0);                                 // light: a waist ring light
    },
  };
}

// ---------- arms ----------
function arms(k) {
  const Vk = { t: [0.031, 0.036, 0.042][k], paul: [0.9, 1, 1.18][k], upper: 1, fore: 1, fin: k !== 1, blade: k >= 1, seed: k };
  return { dims: { upper: [0.105, 0.11, 0.115][k], fore: [0.12, 0.125, 0.13][k], reach: 0.13, drop: 0.13, inset: 0.008 },
    draw(root, p, side, j) { drawArm(K, root, side, j, Vk); } };
}

// ---------- boosters: swept wings and slim nozzles ----------
function booster(k) {
  return { build(root) {
    const g = at(root, 0, 0, 0);
    cbox(g, 0.05, 0.08, 0.06, 0.01, K.D, -0.02, 0, 0);
    const n = [2, 2, 4][k];
    for (let i = 0; i < n; i++) {
      const z = n === 2 ? (i ? 0.024 : -0.024) : [-0.045, -0.016, 0.016, 0.045][i], y = n === 4 ? (i % 3 === 0 ? -0.01 : 0.012) : 0;
      cyl(g, 0.014, 0.05, K.S, 'x', -0.055, y, z, { rt: 0.011, seg: 12 });
      cyl(g, 0.012, 0.012, K.D, 'x', -0.085, y, z, { rt: 0.016, seg: 12 });
      cyl(g, 0.009, 0.004, K.G, 'x', -0.092, y, z, { seg: 12 });
    }
    if (k >= 1) for (const sd of [-1, 1]) {
      const w = prism(g, `bwing${k}`, [[0, 0], [-0.04, 0.015], [-0.12, 0.09 + k * 0.02], [-0.1, 0.1 + k * 0.02], [0.01, 0.03]], 0.008, K.P, 0.002, -0.02, 0.02, sd * 0.035);
      w.rotation.x = -sd * (0.9 - k * 0.1);
      box(g, 0.06, 0.004, 0.004, K.G, -0.07, 0.07, sd * 0.07).rotation.x = -sd * 0.9;
    }
    if (k === 0) prism(g, 'bfin0', [[0, 0], [-0.07, 0.06], [-0.085, 0.055], [-0.02, -0.005]], 0.006, K.A, 0.002, -0.02, 0.03, 0);
  } };
}

// ---------- legs ----------
const biped = (k) => ({ dims: { hip: 0.35 + k * 0.005, drop: 0.032, thigh: 0.152 + k * 0.004, shin: 0.165 + k * 0.004, ankle: 0.032, hipW: 0.048 + k * 0.006, stance: 0.06 + k * 0.006, stride: 0.2, lift: 0.055, foot: 0.085 },
  draw(root, st) { drawBiped(K, root, st, this.dims, { t: 0.037 + k * 0.007, thigh: 1, shin: 0.92, fins: true, kneeMat: 'A', seed: k, skirt: k === 1 }); } });

addParts({
  'celerity-head-1': head(0), 'celerity-head-2': head(1), 'celerity-head-3': head(2),
  'celerity-core-1': core(0), 'celerity-core-2': core(1), 'celerity-core-3': core(2),
  'celerity-arms-1': arms(0), 'celerity-arms-2': arms(1), 'celerity-arms-3': arms(2),
  'celerity-booster-1': booster(0), 'celerity-booster-2': booster(1), 'celerity-booster-3': booster(2),
  'celerity-legs-1': biped(0),
  'celerity-legs-2': biped(1),
  'celerity-legs-3': { dims: { hip: 0.36, drop: 0.03, thigh: 0.13, shin: 0.17, meta: 0.13, toe: 0.06, ankle: 0, hipW: 0.05, stance: 0.065, stride: 0.22, lift: 0.07, foot: 0.07 },
    draw(root, st) { drawReverse(K, root, st, this.dims, { t: 0.037, thigh: 1.05, shin: 0.9, seed: 3, skirt: false }); } },
  'celerity-legs-4': { dims: { float: 0.06, top: 0.19, r: 0.15 },
    draw(root, st) { drawHover(K, root, st, this.dims, { t: 0.03 }); } },
});

