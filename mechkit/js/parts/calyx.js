// Calyx Biomechanics — rounded and organic: smooth shells, segmented limbs, ring joints and soft glowing pods.
// Heads, cores, arms, boosters and legs (a biped, a mantis quad and a jellyfish hover bell).
import { addParts, kitOf, ball, dome, ring, cyl, capsule, at } from './kit.js';
import { drawBiped, drawQuad, drawHover, drawArm } from './limbs.js';

const K = kitOf('calyx');

// ---------- heads: a bulb with insect eyes ----------
function head(k) {
  return { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.018, 0.018, K.S, 'y', 0, 0.009, 0, { seg: 12 });
    ring(g, 0.02, 0.005, K.P, 'y', 0, 0.016, 0);
    if (k === 0) {   // one big eye
      ball(g, 0.042, 0.036, 0.038, K.P, 0, 0.045, 0, 20);
      ball(g, 0.018, 0.018, 0.02, K.L, 0.032, 0.048, 0, 14);
      ring(g, 0.02, 0.004, K.S, 'x', 0.036, 0.048, 0);
    } else if (k === 1) {   // three eyes in a row and a crest ridge
      ball(g, 0.046, 0.034, 0.044, K.P, 0, 0.044, 0, 20);
      for (const z of [-0.022, 0, 0.022]) ball(g, 0.009, 0.009, 0.009, K.L, 0.04, 0.05 + (z ? 0 : 0.006), z, 10);
      ball(g, 0.04, 0.012, 0.012, K.S, -0.01, 0.075, 0, 14);
    } else {   // armoured shell with mandible plates
      ball(g, 0.05, 0.04, 0.05, K.P, 0, 0.046, 0, 20);
      dome(g, 0.052, 0.03, 0.052, K.S, -0.006, 0.05, 0, 20);
      for (const s of [-1, 1]) { const m = ball(g, 0.03, 0.012, 0.012, K.A, 0.04, 0.026, s * 0.022, 12); m.rotation.y = s * 0.5; ball(g, 0.008, 0.008, 0.008, K.L, 0.044, 0.05, s * 0.018, 10); }
    }
  } };
}

// ---------- cores: a beetle shell on a segmented waist ----------
function core(k) {
  const W = [0.92, 1, 1.1][k], H = [0.96, 1, 1.05][k];
  const top = 0.25 * H;
  return {
    sockets: { neck: [0.02, top, 0], shoulderL: [0, 0.18 * H, -0.15 * W], shoulderR: [0, 0.18 * H, 0.15 * W], back: [-0.1, 0.15 * H, 0], mountL: [-0.045, top - 0.015, -0.085 * W], mountR: [-0.045, top - 0.015, 0.085 * W] },
    build(root) {
      const g = at(root, 0, 0, 0);
      ball(g, 0.05, 0.03, 0.055 * W, K.S, 0, 0.022, 0, 16);                               // segmented abdomen
      ball(g, 0.058, 0.03, 0.065 * W, K.P, 0, 0.055, 0, 16);
      ball(g, 0.107, 0.105 * H, 0.135 * W, K.P, 0, 0.16 * H, 0, 24);                        // chest shell
      dome(g, 0.1, 0.09 * H, 0.128 * W, K.S, -0.02, 0.17 * H, 0, 24);                       // the shell's top plate
      ball(g, 0.03, 0.04 * H, 0.04, K.G, 0.088, 0.15 * H, 0, 16);                           // the glowing heart pod
      ring(g, 0.042, 0.007, K.A, 'x', 0.084, 0.15 * H, 0);
      for (let i = 0; i < 3; i++) ball(g, 0.02, 0.016, 0.02, K.S, -0.1 + i * 0.004, 0.11 * H + i * 0.045 * H, 0, 12);   // spine nodes
      ring(g, 0.035, 0.008, K.A, 'y', 0.01, top - 0.006, 0);                                // collar
      if (k === 2) for (const s of [-1, 1]) ball(g, 0.07, 0.07 * H, 0.03, K.S, 0, 0.14 * H, s * 0.122 * W, 16);   // heavy: side carapace
      if (k === 0) for (const s of [-1, 1]) ball(g, 0.01, 0.01, 0.01, K.G, 0.06, 0.2 * H, s * 0.07, 8);
    },
  };
}

function arms(k) {
  const Vk = { t: [0.037, 0.043, 0.05][k], paul: [0.92, 1.02, 1.18][k], upper: 1, fore: 1, seed: k };
  return { dims: { upper: [0.105, 0.11, 0.115][k], fore: [0.12, 0.125, 0.13][k], reach: 0.125, drop: 0.13, inset: 0.008 },
    draw(root, p, side, j) { drawArm(K, root, side, j, Vk); } };
}

// ---------- boosters: bulbous pods with glowing rings ----------
function booster(k) {
  return { build(root) {
    const g = at(root, 0, 0, 0);
    const pods = [[[0, 0]], [[0.03, 0.02], [-0.03, 0.02], [0, -0.025]], [[0.04, 0], [-0.04, 0]]][k];
    capsule(g, 0.022, 0.08, K.S, 'z', -0.015, 0, 0);
    for (const [z, y] of pods) {
      const r = k === 0 ? 0.04 : k === 1 ? 0.026 : 0.034;
      ball(g, r * 1.3, r, r, K.P, -0.05, y, z, 16);
      ring(g, r * 0.75, 0.005, K.A, 'x', -0.095 + (k === 0 ? -0.005 : 0.005), y, z);
      ball(g, 0.004, r * 0.6, r * 0.6, K.G, -0.098 - (k === 0 ? 0.005 : 0), y, z, 12);
    }
    if (k === 2) for (const s of [-1, 1]) { const f = ball(g, 0.05, 0.012, 0.03, K.S, -0.03, 0.05, s * 0.05, 12); f.rotation.x = s * 0.6; }
  } };
}

addParts({
  'calyx-head-1': head(0), 'calyx-head-2': head(1), 'calyx-head-3': head(2),
  'calyx-core-1': core(0), 'calyx-core-2': core(1), 'calyx-core-3': core(2),
  'calyx-arms-1': arms(0), 'calyx-arms-2': arms(1), 'calyx-arms-3': arms(2),
  'calyx-booster-1': booster(0), 'calyx-booster-2': booster(1), 'calyx-booster-3': booster(2),
  'calyx-legs-1': { dims: { hip: 0.34, drop: 0.035, thigh: 0.15, shin: 0.16, ankle: 0.03, hipW: 0.055, stance: 0.068, stride: 0.19, lift: 0.05, foot: 0.08 },
    draw(root, st) { drawBiped(K, root, st, this.dims, { t: 0.05, thigh: 1, shin: 0.95, seed: 0, skirt: false }); } },
  'calyx-legs-2': { dims: { hip: 0.31, drop: 0.04, bodyX: 0.075, bodyZ: 0.07, reachX: 0.21, reachZ: 0.2, upper: 0.18, lower: 0.27, stride: 0.12, lift: 0.06 },
    draw(root, st) { drawQuad(K, root, st, this.dims, { t: 0.034, seed: 2 }); } },
  'calyx-legs-3': { dims: { float: 0.07, top: 0.2, r: 0.14 },
    draw(root, st) { drawHover(K, root, st, this.dims, { t: 0.03 }); } },
});
