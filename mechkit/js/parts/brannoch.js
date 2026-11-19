// Brannoch Heavy Industries — chunky and industrial: slab armour, bolted plates, hydraulic rams, hazard stripes,
// exhaust stacks and amber work lights. Heads, cores, arms, boosters, legs (bipeds, a quad and treads).
import { addParts, kitOf, box, rbox, cyl, rod, prism, at, hazard, vents, lamp } from './kit.js';
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

/** A profile in the front plane (points [z, y]) pushed out along x (depth), centred on x = 0. */
function front(parent, key, pts, depth, m, bevel, x = 0, y = 0, z = 0) { const o = prism(parent, 'bf:' + key, pts, depth, m, bevel, x, y, z); o.rotation.y = Math.PI / 2; return o; }

// =====================================================================================================================
// Redoubt line — a siege frame: a periscope bunker head, a sloped casemate core with sandbag ridges, gun-carriage arms
// with mantlet shields, an armoured exhaust bank and four braced legs on stabiliser pads.
const redoubt = {
  head: { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.026, 0.014, K.D, 'y', 0, 0.007, 0, { seg: 12 });
    rbox(g, 0.09, 0.034, 0.1, 0.008, K.P, 0, 0.03, 0);
    box(g, 0.005, 0.008, 0.075, K.L, 0.046, 0.032, 0);
    hazard(K, g, 0.0455, 0.019, 0, 0.08, 0.008, 5);
    cyl(g, 0.012, 0.085, K.S, 'y', -0.018, 0.085, 0.022, { seg: 10 });                          // the periscope
    rbox(g, 0.042, 0.022, 0.026, 0.004, K.S, -0.006, 0.13, 0.022);
    box(g, 0.004, 0.012, 0.018, K.L, 0.016, 0.13, 0.022);
    lamp(K, g, 0.03, 0.054, -0.03, 0.009);
    cyl(g, 0.002, 0.05, K.M, 'y', -0.03, 0.07, -0.03, { seg: 5 });
  } },
  core: (() => {
    const top = 0.245;
    return {
      sockets: { neck: [0.01, top, 0], shoulderL: [0, 0.18, -0.19], shoulderR: [0, 0.18, 0.19], back: [-0.12, 0.13, 0], mountL: [-0.04, top, -0.1], mountR: [-0.04, top, 0.1] },
      build(root) {
        const g = at(root, 0, 0, 0);
        cyl(g, 0.062, 0.06, K.D, 'y', 0, 0.03, 0, { seg: 16 });
        // the casemate: sloped walls front and sides
        front(g, 'rd-case', [[-0.17, 0.05], [0.17, 0.05], [0.14, top], [-0.14, top]], 0.22, K.S, 0.006, -0.01, 0, 0);
        prism(g, 'rd-glacis', [[-0.11, 0.05], [0.125, 0.05], [0.09, top - 0.005], [-0.1, top - 0.005]], 0.3, K.P, 0.006);
        box(g, 0.005, 0.014, 0.18, K.L, 0.105, 0.19, 0);                                          // firing slit
        rbox(g, 0.02, 0.03, 0.2, 0.006, K.D, 0.1, 0.19, 0).position.x = 0.097;
        for (let i = 0; i < 3; i++) for (let r = 0; r < 2; r++) rbox(g, 0.05, 0.03, 0.09, 0.012, K.A, 0.12 - r * 0.012, 0.075 + r * 0.03, (i - 1) * 0.095 + r * 0.04 - 0.02);   // sandbag ridges
        hazard(K, g, 0.115, 0.135, 0, 0.22, 0.02, 9);
        for (const s of [-1, 1]) { vents(K, at(g, 0, 0, 0, 0, -s * Math.PI / 2, 0), 0.155, 0.15, 0, 0.12, 0.08, 4); lamp(K, g, 0.1, 0.225, s * 0.11, 0.012); }
        rbox(g, 0.06, 0.12, 0.2, 0.01, K.D, -0.11, 0.14, 0);
        for (const s of [-1, 1]) cyl(g, 0.016, 0.07, K.D, 'y', -0.12, top + 0.005, s * 0.06, { seg: 10 });
      },
    };
  })(),
  arms: { dims: { upper: 0.115, fore: 0.125, reach: 0.12, drop: 0.13, inset: 0.014 },
    draw(root, p, side, j) { drawArm(K, root, side, j, { t: 0.05, paul: 1.25, upper: 1, fore: 1, seed: 3, shoulder: 'carriage', forearm: 'mantlet', fist: 1.15 }); } },
  booster: { build(root) {
    const g = at(root, 0, 0, 0);
    rbox(g, 0.07, 0.11, 0.16, 0.012, K.S, -0.03, 0, 0);
    rbox(g, 0.03, 0.12, 0.17, 0.008, K.P, -0.07, 0.01, 0);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) {
      const y = -0.022 + r * 0.04, z = (i - 1) * 0.05;
      cyl(g, 0.014, 0.03, K.D, 'x', -0.092, y, z, { rt: 0.012, seg: 12 }); cyl(g, 0.01, 0.004, K.G, 'x', -0.108, y, z, { seg: 10 });
    }
    for (let i = 0; i < 4; i++) box(g, 0.006, 0.006, 0.17, K.K, -0.086, -0.045 + i * 0.03, 0);       // armour louvres
    hazard(K, at(g, -0.03, 0, 0, 0, Math.PI, 0), 0.036, 0.06, 0, 0.12, 0.012, 5);
  } },
  legs: { dims: { hip: 0.29, drop: 0.045, bodyX: 0.09, bodyZ: 0.085, reachX: 0.23, reachZ: 0.24, upper: 0.18, lower: 0.25, stride: 0.09, lift: 0.04 },
    draw(root, st) { drawQuad(K, root, st, this.dims, { t: 0.045, seed: 3, bunker: true, pads: true }); } },
};

// Breaker line — a breacher on treads: a caged welding-mask head, a wedge-prowed core, ram shoulders over big fists, a
// pair of charge drums and short fast treads pushing a dozer blade.
const breaker = {
  head: { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.02, 0.014, K.D, 'y', 0, 0.007, 0, { seg: 12 });
    rbox(g, 0.06, 0.05, 0.072, 0.012, K.S, -0.008, 0.038, 0);
    rbox(g, 0.022, 0.046, 0.08, 0.006, K.P, 0.026, 0.034, 0);                                   // the mask
    box(g, 0.004, 0.006, 0.05, K.L, 0.038, 0.042, 0);
    for (const z of [-0.03, -0.01, 0.01, 0.03]) rod(g, [0.046, 0.012, z], [0.046, 0.06, z], 0.003, 0.003, K.D, 5);   // the cage
    rod(g, [0.046, 0.06, -0.038], [0.046, 0.06, 0.038], 0.003, 0.003, K.D, 5); rod(g, [0.046, 0.06, 0], [-0.03, 0.068, 0], 0.003, 0.003, K.D, 5);
    lamp(K, g, 0.0, 0.07, 0.025, 0.009);
  } },
  core: (() => {
    const top = 0.235;
    return {
      sockets: { neck: [-0.005, top, 0], shoulderL: [0, 0.185, -0.165], shoulderR: [0, 0.185, 0.165], back: [-0.1, 0.13, 0], mountL: [-0.05, top, -0.085], mountR: [-0.05, top, 0.085] },
      build(root) {
        const g = at(root, 0, 0, 0);
        cyl(g, 0.055, 0.06, K.D, 'y', 0, 0.03, 0, { seg: 16 });
        rbox(g, 0.17, 0.16, 0.24, 0.014, K.S, -0.01, 0.14, 0);
        prism(g, 'br-prow', [[0.0, 0.055], [0.06, 0.06], [0.16, 0.11], [0.12, 0.225], [0.0, 0.24], [-0.02, 0.12]], 0.22, K.P, 0.006);
        prism(g, 'br-ridge', [[0.05, 0.065], [0.165, 0.112], [0.126, 0.226], [0.11, 0.22], [0.145, 0.115], [0.045, 0.075]], 0.03, K.A, 0.003);
        for (const s of [-1, 1]) { lamp(K, g, 0.13, 0.18, s * 0.07, 0.013); box(g, 0.004, 0.08, 0.01, K.K, 0.142, 0.15, s * 0.04).rotation.z = 0.42; }
        hazard(K, g, 0.075, 0.075, 0, 0.2, 0.02, 7);
        for (const s of [-1, 1]) {
          cyl(g, 0.016, 0.11, K.D, 'y', -0.085, top + 0.02, s * 0.075, { seg: 10 });
          cyl(g, 0.019, 0.012, K.K, 'y', -0.085, top + 0.078, s * 0.075, { seg: 10 });
        }
      },
    };
  })(),
  arms: { dims: { upper: 0.11, fore: 0.12, reach: 0.12, drop: 0.13, inset: 0.012 },
    draw(root, p, side, j) { drawArm(K, root, side, j, { t: 0.045, paul: 1.1, upper: 1, fore: 1, seed: 4, shoulder: 'ram', fist: 1.35 }); } },
  booster: { build(root) {
    const g = at(root, 0, 0, 0);
    rbox(g, 0.05, 0.08, 0.12, 0.01, K.S, -0.02, 0, 0);
    for (const s of [-1, 1]) {
      const d = at(g, -0.06, 0.0, s * 0.045, 0, 0, 0.35);
      cyl(d, 0.032, 0.07, K.P, 'x', 0, 0, 0, { seg: 16 }); cyl(d, 0.034, 0.008, K.D, 'x', 0.02, 0, 0, { seg: 16 });
      cyl(d, 0.024, 0.012, K.D, 'x', -0.04, 0, 0, { rt: 0.028, seg: 16 }); cyl(d, 0.02, 0.004, K.G, 'x', -0.047, 0, 0, { seg: 14 });
    }
    hazard(K, at(g, -0.02, 0, 0, 0, Math.PI, 0), 0.026, 0.03, 0, 0.1, 0.012, 5);
  } },
  legs: { dims: { hip: 0.235, drop: 0.035, len: 0.33, trackH: 0.115, trackW: 0.07, gap: 0.125, ring: 0.07 },
    draw(root, st) { drawTreads(K, root, st, this.dims, { t: 0.04, dozer: true }); } },
};

addParts({
  'brannoch-head-4': redoubt.head, 'brannoch-core-4': redoubt.core, 'brannoch-arms-4': redoubt.arms, 'brannoch-booster-4': redoubt.booster, 'brannoch-legs-5': redoubt.legs,
  'brannoch-head-5': breaker.head, 'brannoch-core-5': breaker.core, 'brannoch-arms-5': breaker.arms, 'brannoch-booster-5': breaker.booster, 'brannoch-legs-6': breaker.legs,
});

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
