// Patchwork Salvage — cheap and scrap-built: mismatched plates, exposed pipes, roll cages, welded patches, a bare
// bulb here and there. Nothing is quite symmetrical. Heads, cores, arms, boosters, legs (biped, hopper, treads).
import { addParts, kitOf, box, cyl, ring, rod, prism, lamp, at, glowOf } from './kit.js';
import { drawBiped, drawReverse, drawTreads, drawArm } from './limbs.js';

const K = kitOf('patchwork');
const BULB = glowOf('#ffe7a8', 0.5);

// ---------- heads: an oil drum, a camera box, a caged floodlight ----------
function head(k) {
  return { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.012, 0.02, K.D, 'y', 0, 0.01, 0, { seg: 8 });
    if (k === 0) {          // an oil drum on its side with one lens
      cyl(g, 0.032, 0.06, K.P, 'z', 0, 0.045, 0, { seg: 14 });
      for (const z of [-0.022, 0.022]) ring(g, 0.032, 0.003, K.U, 'z', 0, 0.045, z);
      cyl(g, 0.014, 0.02, K.N, 'x', 0.03, 0.05, 0.008, { seg: 12 });
      cyl(g, 0.01, 0.004, K.L, 'x', 0.041, 0.05, 0.008, { seg: 12 });
    } else if (k === 1) {   // a camera box with two odd lenses
      const b = box(g, 0.06, 0.045, 0.065, K.S, 0, 0.042, 0); b.rotation.y = 0.08;
      box(g, 0.03, 0.03, 0.068, K.P, -0.02, 0.05, 0.004).rotation.z = 0.1;
      cyl(g, 0.014, 0.02, K.N, 'x', 0.034, 0.046, 0.015, { seg: 12 }); cyl(g, 0.01, 0.004, K.L, 'x', 0.045, 0.046, 0.015, { seg: 12 });
      cyl(g, 0.008, 0.016, K.N, 'x', 0.033, 0.036, -0.018, { seg: 10 }); cyl(g, 0.006, 0.004, K.L, 'x', 0.042, 0.036, -0.018, { seg: 10 });
      cyl(g, 0.002, 0.05, K.M, 'y', -0.02, 0.09, -0.02, { seg: 5 });
    } else {                // a welded box in a cage with a floodlight on top
      box(g, 0.065, 0.05, 0.07, K.P, 0, 0.04, 0);
      box(g, 0.012, 0.016, 0.05, K.L, 0.033, 0.045, 0);
      for (const [x, z] of [[0.036, 0.04], [0.036, -0.04], [-0.036, 0.04], [-0.036, -0.04]]) rod(g, [x, 0.012, z], [x, 0.074, z], 0.003, 0.003, K.D, 5);
      rod(g, [0.036, 0.074, 0.04], [0.036, 0.074, -0.04], 0.003, 0.003, K.D, 5); rod(g, [-0.036, 0.074, 0.04], [-0.036, 0.074, -0.04], 0.003, 0.003, K.D, 5);
      cyl(g, 0.016, 0.02, K.N, 'x', 0.01, 0.088, 0, { seg: 12 }); cyl(g, 0.013, 0.004, BULB, 'x', 0.021, 0.088, 0, { seg: 12 });
    }
  } };
}

// ---------- cores: a forklift-style cab in a roll cage ----------
function core(k) {
  const W = [0.9, 1, 1.1][k], H = [0.95, 1, 1.05][k];
  const top = 0.225 * H;
  return {
    sockets: { neck: [0.03, top, -0.012], shoulderL: [0, 0.18 * H, -0.16 * W], shoulderR: [0, 0.185 * H, 0.162 * W], back: [-0.1, 0.12 * H, 0], mountL: [-0.04, top, -0.088 * W], mountR: [-0.035, top, 0.09 * W] },
    build(root) {
      const g = at(root, 0, 0, 0);
      cyl(g, 0.04, 0.05, K.N, 'y', 0, 0.025, 0, { seg: 8 });                                   // a crude swivel
      box(g, 0.17, 0.15 * H, 0.22 * W, K.P, -0.01, 0.125 * H, 0);                             // the cab box
      const a = box(g, 0.02, 0.1 * H, 0.13 * W, K.N, 0.08, 0.13 * H, 0.03); a.rotation.y = 0.06;            // front plates, mismatched
      const b = box(g, 0.02, 0.07 * H, 0.09 * W, K.S, 0.082, 0.1 * H, -0.06 * W); b.rotation.z = 0.08;
      box(g, 0.006, 0.03, 0.06, K.L, 0.092, 0.18 * H, 0.03);                                  // a lit slot window
      box(g, 0.12, 0.02, 0.2 * W, K.S, -0.02, 0.205 * H, 0);                                  // roof plate
      // roll cage
      for (const z of [-0.12 * W, 0.12 * W]) {
        rod(g, [0.085, 0.06, z], [0.085, top + 0.012, z], 0.006, 0.006, K.D, 6);
        rod(g, [-0.095, 0.06, z], [-0.095, top + 0.012, z], 0.006, 0.006, K.D, 6);
        rod(g, [0.085, top + 0.012, z], [-0.095, top + 0.012, z], 0.006, 0.006, K.D, 6);
      }
      rod(g, [0.085, top + 0.012, -0.12 * W], [0.085, top + 0.012, 0.12 * W], 0.006, 0.006, K.D, 6);
      cyl(g, 0.006, 0.016, BULB, 'y', 0.07, top + 0.024, 0.1 * W, { seg: 8 });                 // a bare bulb
      rod(g, [-0.07, 0.15 * H, 0.1 * W], [-0.07, top + 0.06, 0.085 * W], 0.009, 0.008, K.U, 8); // bent exhaust pipe
      rod(g, [-0.07, top + 0.06, 0.085 * W], [-0.05, top + 0.075, 0.085 * W], 0.008, 0.008, K.U, 8);
      box(g, 0.05, 0.05, 0.05, K.A, -0.02, 0.07, -0.1 * W).rotation.y = 0.3;                  // a toolbox
      if (k >= 1) { ring(g, 0.04, 0.016, K.R, 'z', 0.0, 0.13 * H, -0.125 * W); }               // a tyre for armour
      if (k === 2) { box(g, 0.13, 0.025, 0.24 * W, K.S, 0.0, 0.07, 0).rotation.x = 0.04; box(g, 0.03, 0.12 * H, 0.03, K.U, 0.075, 0.12, -0.11 * W); }
    },
  };
}

function arms(k) {
  const Vk = { t: [0.035, 0.041, 0.049][k], paul: [0.9, 1.05, 1.2][k], upper: 1, fore: 1, seed: k * 3 + 1 };
  return { dims: { upper: [0.105, 0.11, 0.115][k], fore: [0.12, 0.12, 0.125][k], reach: 0.12, drop: 0.13, inset: 0.012 },
    draw(root, p, side, j) { drawArm(K, root, side, j, Vk); } };
}

// ---------- boosters: strapped-on jet engines and rockets ----------
function booster(k) {
  return { build(root) {
    const g = at(root, 0, 0, 0);
    box(g, 0.03, 0.08, 0.1, K.D, -0.01, 0, 0);
    box(g, 0.006, 0.01, 0.016, glowOf('#ff2a2a', 0.6), -0.026, 0.036, 0.04);           // a salvaged tail light
    if (k === 0) {
      cyl(g, 0.03, 0.09, K.S, 'x', -0.07, 0.01, 0, { rt: 0.026, seg: 14 });
      ring(g, 0.03, 0.005, K.U, 'x', -0.05, 0.01, 0);
      cyl(g, 0.022, 0.004, K.G, 'x', -0.117, 0.01, 0, { seg: 12 });
    } else if (k === 1) {   // two engines that don't match
      cyl(g, 0.026, 0.08, K.S, 'x', -0.065, 0.02, 0.035, { rt: 0.022, seg: 12 }); cyl(g, 0.019, 0.004, K.G, 'x', -0.107, 0.02, 0.035, { seg: 12 });
      cyl(g, 0.02, 0.1, K.P, 'x', -0.07, -0.01, -0.035, { rt: 0.016, seg: 10 }); cyl(g, 0.014, 0.004, K.G, 'x', -0.122, -0.01, -0.035, { seg: 10 });
      rod(g, [-0.03, 0.03, 0.035], [-0.03, -0.01, -0.035], 0.004, 0.004, K.U, 5);
    } else {               // a rocket drum
      cyl(g, 0.045, 0.06, K.P, 'x', -0.05, 0.02, 0, { seg: 16 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(g, 0.009, 0.004, K.G, 'x', -0.082, 0.02 + Math.sin(a) * 0.027, Math.cos(a) * 0.027, { seg: 8 }); }
      for (const z of [-0.03, 0.03]) ring(g, 0.045, 0.004, K.U, 'x', -0.05 + z * 0.4, 0.02, 0);
    }
  } };
}

const AMBER = glowOf('#ffae1a', 0.7);
/** A profile in the front plane (points [z, y]) pushed out along x (depth), centred on x = 0. */
function front(parent, key, pts, depth, m, bevel, x = 0, y = 0, z = 0) { const o = prism(parent, 'pf:' + key, pts, depth, m, bevel, x, y, z); o.rotation.y = Math.PI / 2; return o; }

// =====================================================================================================================
// Hauler line — a junk-crawler: a crane-cab head with a beacon, a skip-bin core heaped with scrap, a crane jib over the
// right shoulder and a winch on the left, a truck exhaust stack for a booster, and treads pushing forklift tines.
const hauler = {
  head: { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.014, 0.018, K.D, 'y', 0, 0.009, 0, { seg: 8 });
    box(g, 0.062, 0.056, 0.058, K.S, 0, 0.044, 0);
    box(g, 0.004, 0.034, 0.046, K.L, 0.032, 0.048, 0);
    for (const z of [-0.025, 0, 0.025]) box(g, 0.006, 0.04, 0.004, K.D, 0.033, 0.048, z);
    box(g, 0.07, 0.008, 0.066, K.P, -0.002, 0.075, 0).rotation.z = 0.05;
    cyl(g, 0.009, 0.014, AMBER, 'y', -0.015, 0.086, 0.015, { seg: 10 });
    cyl(g, 0.011, 0.003, K.D, 'y', -0.015, 0.08, 0.015, { seg: 10 });
    rod(g, [0.02, 0.06, -0.03], [0.035, 0.07, -0.05], 0.002, 0.002, K.D, 4); box(g, 0.004, 0.016, 0.01, K.M, 0.036, 0.072, -0.05);
  } },
  core: (() => {
    const top = 0.225;
    return {
      sockets: { neck: [0.065, top, 0], shoulderL: [0, 0.18, -0.165], shoulderR: [0, 0.18, 0.165], back: [-0.125, 0.12, 0], mountL: [-0.035, top + 0.01, -0.085], mountR: [-0.035, top + 0.01, 0.085] },
      build(root) {
        const g = at(root, 0, 0, 0);
        cyl(g, 0.045, 0.05, K.N, 'y', 0, 0.025, 0, { seg: 8 });
        front(g, 'hl-bin', [[-0.1, 0.05], [0.1, 0.05], [0.135, top], [-0.135, top]], 0.22, K.P, 0.003, -0.01, 0, 0);
        for (const z of [-0.07, 0, 0.07]) box(g, 0.012, 0.16, 0.014, K.S, 0.102 + Math.abs(z) * 0.0, 0.135, z).rotation.z = -0.1;
        box(g, 0.24, 0.014, 0.29, K.S, -0.01, top, 0);                                              // the rim
        box(g, 0.006, 0.03, 0.2, K.A, 0.11, 0.08, 0);
        // the heap of scrap showing over the rim
        box(g, 0.06, 0.04, 0.05, K.U, -0.06, top + 0.02, -0.04).rotation.set(0.3, 0.2, 0.25);
        box(g, 0.05, 0.03, 0.08, K.N, -0.05, top + 0.018, 0.04).rotation.set(-0.2, 0.4, 0.1);
        ring(g, 0.03, 0.012, K.R, 'z', -0.085, top + 0.03, 0.0).rotation.x = 0.4;
        rod(g, [-0.1, top, -0.08], [-0.02, top + 0.06, -0.1], 0.005, 0.005, K.D, 5);
        for (const s of [-1, 1]) ring(g, 0.016, 0.004, K.M, 'z', 0.0, 0.2, s * 0.14);               // lifting lugs
        cyl(g, 0.006, 0.016, BULB, 'y', 0.09, top + 0.016, -0.11, { seg: 8 });
        box(g, 0.05, 0.1, 0.1, K.D, -0.11, 0.12, 0);
      },
    };
  })(),
  arms: { dims: { upper: 0.11, fore: 0.12, reach: 0.12, drop: 0.13, inset: 0.012 },
    draw(root, p, side, j) { drawArm(K, root, side, j, { t: 0.044, paul: 1.05, upper: 1, fore: 1, seed: 6, shoulder: 'crane', forearm: 'winch' }); } },
  booster: { build(root) {
    const g = at(root, 0, 0, 0);
    box(g, 0.03, 0.09, 0.1, K.D, -0.01, 0, 0);
    cyl(g, 0.013, 0.2, K.M, 'y', -0.04, 0.085, 0.03, { seg: 12 });                                // the exhaust stack
    const cap = box(g, 0.03, 0.004, 0.03, K.D, -0.036, 0.19, 0.03); cap.rotation.z = 0.35;
    for (const y of [0.02, 0.1]) box(g, 0.034, 0.008, 0.034, K.U, -0.04, y, 0.03);
    cyl(g, 0.026, 0.08, K.S, 'x', -0.06, -0.01, -0.03, { rt: 0.022, seg: 12 }); cyl(g, 0.019, 0.004, K.G, 'x', -0.102, -0.01, -0.03, { seg: 12 });
    for (const x of [-0.04, -0.075]) ring(g, 0.027, 0.004, K.U, 'x', x, -0.01, -0.03);
  } },
  legs: { dims: { hip: 0.225, drop: 0.03, len: 0.38, trackH: 0.105, trackW: 0.07, gap: 0.13, ring: 0.065 },
    draw(root, st) { drawTreads(K, root, st, this.dims, { t: 0.036, forks: true }); } },
};

// Pogo line — a scrappy hopper: an upturned bucket head with a traffic-light eye, a barrel body with a flag, scaffold-pole
// arms under a traffic cone and a hubcap, two bottle rockets, and bird legs on big pogo springs with shovel feet.
const pogo = {
  head: { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.01, 0.018, K.D, 'y', 0, 0.009, 0, { seg: 8 });
    cyl(g, 0.034, 0.05, K.P, 'y', 0, 0.042, 0, { rt: 0.026, seg: 14 });
    ring(g, 0.03, 0.003, K.U, 'y', 0, 0.035, 0);
    ring(g, 0.03, 0.002, K.M, 'x', 0, 0.067, 0).scale.set(1, 0.7, 1);
    box(g, 0.014, 0.052, 0.022, K.K, 0.034, 0.04, 0.0);
    cyl(g, 0.008, 0.006, K.L, 'x', 0.042, 0.056, 0, { seg: 10 });
    cyl(g, 0.008, 0.006, K.D, 'x', 0.042, 0.04, 0, { seg: 10 }); cyl(g, 0.008, 0.006, K.D, 'x', 0.042, 0.024, 0, { seg: 10 });
  } },
  core: (() => {
    const top = 0.225;
    return {
      sockets: { neck: [0.02, top, 0], shoulderL: [0, 0.17, -0.128], shoulderR: [0, 0.17, 0.128], back: [-0.09, 0.13, 0], mountL: [-0.03, top, -0.068], mountR: [-0.03, top, 0.068] },
      build(root) {
        const g = at(root, 0, 0, 0);
        cyl(g, 0.034, 0.05, K.N, 'y', 0, 0.025, 0, { seg: 8 });
        cyl(g, 0.085, 0.17, K.P, 'y', 0, 0.135, 0, { seg: 16 });
        for (const y of [0.07, 0.135, 0.2]) ring(g, 0.086, 0.005, K.U, 'y', 0, y, 0);
        cyl(g, 0.08, 0.008, K.S, 'y', 0, top - 0.004, 0, { seg: 16 });
        box(g, 0.012, 0.05, 0.05, K.S, 0.085, 0.115, 0.03).rotation.y = -0.3;                       // a welded patch
        box(g, 0.006, 0.026, 0.05, K.L, 0.087, 0.17, -0.02);
        rod(g, [-0.07, 0.1, 0.06], [-0.08, top + 0.14, 0.06], 0.003, 0.003, K.D, 5);                 // the flag
        prism(g, 'pg-flag', [[0, 0], [-0.07, 0.012], [-0.06, 0.03], [0, 0.04]], 0.003, K.A, 0.001, -0.082, top + 0.1, 0.06);
        cyl(g, 0.006, 0.016, BULB, 'y', 0.04, top + 0.01, -0.05, { seg: 8 });
      },
    };
  })(),
  arms: { dims: { upper: 0.105, fore: 0.115, reach: 0.12, drop: 0.13, inset: 0.012 },
    draw(root, p, side, j) { drawArm(K, root, side, j, { t: 0.034, paul: 0.85, upper: 1, fore: 1, seed: 7, poles: true, shoulder: 'junk' }); } },
  booster: { build(root) {
    const g = at(root, 0, 0, 0);
    box(g, 0.02, 0.06, 0.1, K.U, -0.01, 0, 0);
    for (const s of [-1, 1]) {
      const r = at(g, -0.03, 0.01, s * 0.03, s * 0.35, 0, 0.35);
      cyl(r, 0.012, 0.1, K.S, 'x', -0.02, 0, 0, { seg: 10 });
      cyl(r, 0.012, 0.03, K.A, 'x', 0.045, 0, 0, { rt: 0.001, seg: 10 });
      cyl(r, 0.009, 0.004, K.G, 'x', -0.072, 0, 0, { seg: 10 });
      prism(r, 'pg-fin', [[0, 0], [-0.02, 0], [-0.03, 0.02], [-0.012, 0.02]], 0.003, K.A, 0.001, -0.045, 0.01, 0);
      box(r, 0.006, 0.03, 0.03, K.D, 0.0, 0, 0);
    }
  } },
  legs: { dims: { hip: 0.37, drop: 0.032, thigh: 0.13, shin: 0.175, meta: 0.14, toe: 0.06, ankle: 0, hipW: 0.05, stance: 0.07, stride: 0.22, lift: 0.08, foot: 0.07 },
    draw(root, st) { drawReverse(K, root, st, this.dims, { t: 0.034, thigh: 0.9, shin: 0.8, seed: 7, skirt: false, pogo: true, shovel: true }); } },
};

addParts({
  'patchwork-head-4': hauler.head, 'patchwork-core-4': hauler.core, 'patchwork-arms-4': hauler.arms, 'patchwork-booster-4': hauler.booster, 'patchwork-legs-4': hauler.legs,
  'patchwork-head-5': pogo.head, 'patchwork-core-5': pogo.core, 'patchwork-arms-5': pogo.arms, 'patchwork-booster-5': pogo.booster, 'patchwork-legs-5': pogo.legs,
});

addParts({
  'patchwork-head-1': head(0), 'patchwork-head-2': head(1), 'patchwork-head-3': head(2),
  'patchwork-core-1': core(0), 'patchwork-core-2': core(1), 'patchwork-core-3': core(2),
  'patchwork-arms-1': arms(0), 'patchwork-arms-2': arms(1), 'patchwork-arms-3': arms(2),
  'patchwork-booster-1': booster(0), 'patchwork-booster-2': booster(1), 'patchwork-booster-3': booster(2),
  'patchwork-legs-1': { dims: { hip: 0.34, drop: 0.035, thigh: 0.15, shin: 0.16, ankle: 0.03, hipW: 0.05, stance: 0.065, stride: 0.19, lift: 0.05, foot: 0.085 },
    draw(root, st) { drawBiped(K, root, st, this.dims, { t: 0.042, thigh: 1, shin: 1, seed: 1, skirt: false, shinMat: 'S' }); } },
  'patchwork-legs-2': { dims: { hip: 0.35, drop: 0.032, thigh: 0.125, shin: 0.165, meta: 0.13, toe: 0.06, ankle: 0, hipW: 0.052, stance: 0.07, stride: 0.22, lift: 0.07, foot: 0.07 },
    draw(root, st) { drawReverse(K, root, st, this.dims, { t: 0.042, thigh: 1, shin: 0.95, seed: 2, skirt: false }); } },
  'patchwork-legs-3': { dims: { hip: 0.21, drop: 0.03, len: 0.34, trackH: 0.1, trackW: 0.065, gap: 0.12, ring: 0.06 },
    draw(root, st) { drawTreads(K, root, st, this.dims, { t: 0.035 }); } },
});

