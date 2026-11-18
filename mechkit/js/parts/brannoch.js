// Brannoch Heavy Industries — chunky and industrial: slab armour, bolted plates, hydraulic rams, hazard stripes,
// exhaust stacks and amber work lights. Heads, cores, arms, boosters, legs (bipeds, a quad and treads).
import { addParts, kitOf, box, rbox, cyl, at, hazard, vents, lamp } from './kit.js';
import { drawBiped, drawQuad, drawTreads, drawArm } from './limbs.js';

const K = kitOf('brannoch');

// ---------- heads: a squat box with a visor bar and work lamps ----------
function head(k) {
  return { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.022, 0.016, K.D, 'y', 0, 0.008, 0, { seg: 12 });
    if (k < 2) {
      const w = [0.07, 0.08][k];
      rbox(g, 0.07, 0.048, w, 0.008, K.P, 0.005, 0.038, 0);
      rbox(g, 0.03, 0.03, w * 0.82, 0.006, K.S, -0.03, 0.04, 0);
      box(g, 0.006, 0.012, w * 0.7, K.L, 0.041, 0.044, 0);                           // visor bar
      vents(K, g, 0.041, 0.024, 0, w * 0.5, 0.014, 2);                                // chin grille
      if (k === 1) for (const s of [-1, 1]) lamp(K, g, 0.03, 0.068, s * 0.025, 0.009);
      else lamp(K, g, 0.03, 0.068, 0, 0.011);
    } else {
      // a turret bucket: wide, low, with an antenna mast
      rbox(g, 0.085, 0.05, 0.09, 0.012, K.P, 0, 0.036, 0);
      rbox(g, 0.05, 0.022, 0.1, 0.006, K.S, 0.01, 0.064, 0);
      box(g, 0.006, 0.01, 0.07, K.L, 0.044, 0.044, 0);
      hazard(K, g, 0.0435, 0.024, 0, 0.07, 0.012, 5);
      cyl(g, 0.003, 0.07, K.M, 'y', -0.03, 0.1, 0.03, { seg: 6 });
      box(g, 0.006, 0.006, 0.006, K.G, -0.03, 0.135, 0.03);
    }
  } };
}

// ---------- cores: a big cab with a hatch, headlights and exhaust stacks ----------
function core(k) {
  const W = [0.92, 1, 1.1][k], H = [0.95, 1, 1.04][k];
  const top = 0.235 * H;
  return {
    sockets: { neck: [0.025, top, 0], shoulderL: [0, 0.19 * H, -0.17 * W], shoulderR: [0, 0.19 * H, 0.17 * W], back: [-0.105, 0.13 * H, 0], mountL: [-0.035, top, -0.09 * W], mountR: [-0.035, top, 0.09 * W] },
    build(root) {
      const g = at(root, 0, 0, 0);
      cyl(g, 0.055, 0.06, K.D, 'y', 0, 0.03, 0, { seg: 16 });                                       // waist ring
      rbox(g, 0.19, 0.16 * H, 0.25 * W, 0.016, K.S, -0.005, 0.135 * H, 0);                       // cab
      rbox(g, 0.2, 0.12 * H, 0.27 * W, 0.014, K.P, 0.0, 0.17 * H, 0);                            // upper armour shell
      rbox(g, 0.03, 0.09 * H, 0.15 * W, 0.008, K.P, 0.098, 0.12 * H, 0);                         // hatch
      hazard(K, g, 0.114, 0.075 * H, 0, 0.14 * W, 0.02, 7);
      for (const s of [-1, 1]) { lamp(K, g, 0.102, 0.205 * H, s * 0.1 * W, 0.013); vents(K, g, 0.1, 0.12 * H, s * 0.105 * W, 0.03, 0.04, 3); }
      for (const s of [-1, 1]) {                                                                   // exhaust stacks
        cyl(g, 0.014, 0.1, K.D, 'y', -0.085, top + 0.02, s * 0.06 * W, { seg: 10 });
        cyl(g, 0.017, 0.012, K.K, 'y', -0.085, top + 0.072, s * 0.06 * W, { seg: 10 });
      }
      if (k >= 1) for (const s of [-1, 1]) rbox(g, 0.17, 0.09 * H, 0.025, 0.006, K.P, -0.01, 0.12 * H, s * 0.14 * W);    // side slabs
      if (k === 2) { rbox(g, 0.05, 0.05, 0.2 * W, 0.008, K.A, 0.09, 0.225 * H, 0); box(g, 0.02, 0.015, 0.2 * W, K.D, -0.1, 0.06, 0); }
    },
  };
}

function arms(k) {
  const Vk = { t: [0.036, 0.042, 0.05][k], paul: [0.95, 1.05, 1.2][k], upper: 1, fore: 1, seed: k };
  return { dims: { upper: [0.105, 0.11, 0.115][k], fore: [0.115, 0.12, 0.125][k], reach: 0.12, drop: 0.13, inset: 0.012 },
    draw(root, p, side, j) { drawArm(K, root, side, j, Vk); } };
}

// ---------- boosters: square housings with round exhausts ----------
function booster(k) {
  return { build(root) {
    const g = at(root, 0, 0, 0);
    const n = [2, 2, 4][k], w = [0.1, 0.13, 0.15][k];
    rbox(g, 0.06, 0.09, w, 0.01, K.S, -0.03, 0, 0);
    rbox(g, 0.04, 0.06, w * 0.8, 0.008, K.P, -0.055, 0.03, 0);
    hazard(K, g, -0.01, -0.035, 0, w * 0.8, 0.012, 5);
    for (let i = 0; i < n; i++) {
      const z = n === 2 ? (i ? 1 : -1) * w * 0.25 : [-0.3, -0.1, 0.1, 0.3][i] * w * 1.15, y = n === 4 ? -0.015 : -0.01;
      cyl(g, 0.02, 0.04, K.D, 'x', -0.075, y, z, { rt: 0.017, seg: 14 });
      cyl(g, 0.014, 0.004, K.G, 'x', -0.096, y, z, { seg: 12 });
    }
    if (k === 1) cyl(g, 0.012, 0.08, K.D, 'y', -0.04, 0.07, w * 0.35, { seg: 8 });
  } };
}

const biped = (k) => ({ dims: { hip: [0.34, 0.33][k], drop: 0.04, thigh: [0.145, 0.14][k], shin: [0.155, 0.15][k], ankle: 0.035, hipW: [0.06, 0.068][k], stance: [0.075, 0.085][k], stride: 0.17, lift: 0.04, foot: 0.1 },
  draw(root, st) { drawBiped(K, root, st, this.dims, { t: [0.053, 0.063][k], thigh: 1, shin: 1.05, seed: k, skirt: true, kneeMat: 'A' }); } });

addParts({
  'brannoch-head-1': head(0), 'brannoch-head-2': head(1), 'brannoch-head-3': head(2),
  'brannoch-core-1': core(0), 'brannoch-core-2': core(1), 'brannoch-core-3': core(2),
  'brannoch-arms-1': arms(0), 'brannoch-arms-2': arms(1), 'brannoch-arms-3': arms(2),
  'brannoch-booster-1': booster(0), 'brannoch-booster-2': booster(1), 'brannoch-booster-3': booster(2),
  'brannoch-legs-1': biped(0),
  'brannoch-legs-2': biped(1),
  'brannoch-legs-3': { dims: { hip: 0.3, drop: 0.045, bodyX: 0.085, bodyZ: 0.075, reachX: 0.2, reachZ: 0.19, upper: 0.17, lower: 0.25, stride: 0.1, lift: 0.05 },
    draw(root, st) { drawQuad(K, root, st, this.dims, { t: 0.042, seed: 1 }); } },
  'brannoch-legs-4': { dims: { hip: 0.22, drop: 0.035, len: 0.38, trackH: 0.11, trackW: 0.075, gap: 0.13, ring: 0.075 },
    draw(root, st) { drawTreads(K, root, st, this.dims, { t: 0.04 }); } },
});
