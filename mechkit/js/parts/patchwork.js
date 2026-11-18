// Patchwork Salvage — cheap and scrap-built: mismatched plates, exposed pipes, roll cages, welded patches, a bare
// bulb here and there. Nothing is quite symmetrical. Heads, cores, arms, boosters, legs (biped, hopper, treads).
import { addParts, kitOf, box, cyl, ring, rod, at, glowOf } from './kit.js';
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

