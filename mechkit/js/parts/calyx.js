// Calyx Biomechanics — rounded and organic: smooth shells, segmented limbs, ring joints and soft glowing pods.
// Heads, cores, arms, boosters and legs (a biped, a mantis quad and a jellyfish hover bell).
import { addParts, kitOf, ball, dome, ring, cyl, capsule, rod, at } from './kit.js';
import { drawBiped, drawQuad, drawHover, drawReverse, drawArm } from './limbs.js';

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

/** A pod with a glowing cap pointing along (dx, dy, dz). */
function pod(g, x, y, z, r, dx = 1, dy = 0, dz = 0) {
  ball(g, r, r, r, K.P, x, y, z, 12); ball(g, r * 0.5, r * 0.5, r * 0.5, K.G, x + dx * r * 0.75, y + dy * r * 0.75, z + dz * r * 0.75, 8);
}

// =====================================================================================================================
// Bloom line — a hover medic / shield frame: a flower head round a lamp eye, a core hung with pod clusters, tendril arms
// with pods, a halo shield-emitter booster, and a ring of floating seed pods for legs.
const bloom = {
  head: { build(root) {
    const g = at(root, 0, 0, 0);
    cyl(g, 0.016, 0.018, K.S, 'y', 0, 0.009, 0, { seg: 12 });
    ball(g, 0.028, 0.028, 0.028, K.P, 0, 0.042, 0, 16);
    ball(g, 0.016, 0.016, 0.016, K.L, 0.022, 0.044, 0, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const pg = at(g, -0.004, 0.044, 0, a, 0, 0);
      const pt = ball(pg, 0.012, 0.03, 0.02, i % 2 ? K.A : K.S, -0.004, 0.034, 0, 12); pt.rotation.z = -0.35;
    }
  } },
  core: (() => {
    const top = 0.235;
    return {
      sockets: { neck: [0.015, top, 0], shoulderL: [0, 0.175, -0.14], shoulderR: [0, 0.175, 0.14], back: [-0.09, 0.15, 0], mountL: [-0.04, top - 0.012, -0.08], mountR: [-0.04, top - 0.012, 0.08] },
      build(root) {
        const g = at(root, 0, 0, 0);
        ball(g, 0.042, 0.03, 0.048, K.S, 0, 0.024, 0, 16);
        ball(g, 0.05, 0.03, 0.058, K.P, 0, 0.056, 0, 16);
        ball(g, 0.088, 0.09, 0.112, K.P, 0, 0.155, 0, 22);
        dome(g, 0.08, 0.075, 0.104, K.S, -0.016, 0.165, 0, 22);
        // the heart: three small lamps in a triangle under a ring
        for (const [y, z] of [[0.17, 0], [0.135, -0.022], [0.135, 0.022]]) ball(g, 0.014, 0.014, 0.014, K.G, 0.08, y, z, 10);
        ring(g, 0.04, 0.006, K.A, 'x', 0.074, 0.148, 0);
        // pod clusters on the flanks and the belly
        for (const s of [-1, 1]) for (const [x, y, z, r] of [[0.035, 0.1, 0.09, 0.024], [0.06, 0.085, 0.06, 0.018], [0.01, 0.075, 0.1, 0.017], [0.045, 0.06, 0.085, 0.014]]) pod(g, x, y, s * z, r, 1, 0, s * 0.3);
        ring(g, 0.032, 0.007, K.A, 'y', 0.008, top - 0.006, 0);
      },
    };
  })(),
  arms: { dims: { upper: 0.105, fore: 0.12, reach: 0.125, drop: 0.13, inset: 0.008 },
    draw(root, p, side, j) { drawArm(K, root, side, j, { t: 0.034, paul: 0.88, upper: 0.9, fore: 0.9, seed: 3, shoulder: 'pods', forearm: 'podfore' }); } },
  booster: { build(root) {
    const g = at(root, 0, 0, 0);
    capsule(g, 0.02, 0.07, K.S, 'z', -0.012, 0, 0);
    ring(g, 0.085, 0.009, K.A, 'x', -0.06, 0.035, 0);                                            // the halo shield emitter
    ring(g, 0.072, 0.004, K.G, 'x', -0.062, 0.035, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ball(g, 0.008, 0.008, 0.008, K.G, -0.06, 0.035 + Math.sin(a) * 0.085, Math.cos(a) * 0.085, 8); }
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 2; rod(g, [-0.02, 0, 0], [-0.055, 0.035 + Math.sin(a) * 0.07, Math.cos(a) * 0.07], 0.005, 0.004, K.S, 6); pod(g, -0.045, 0.012 + Math.sin(a) * 0.022, Math.cos(a) * 0.022, 0.02, -1, 0, 0); }
  } },
  legs: { dims: { float: 0.07, top: 0.19, r: 0.15 },
    draw(root, st) { drawHover(K, root, st, this.dims, { t: 0.03, pods: 6 }); } },
};

// Sickle line — a mantis hunter: a triangle head with big compound eyes and feelers, a long hunched thorax with a hanging
// abdomen, scythe forearms, wing-case booster and springy bird legs with claws.
const sickle = {
  head: { build(root) {
    const g = at(root, 0, 0, 0);
    capsule(g, 0.012, 0.03, K.S, 'y', 0, 0.012, 0);
    ball(g, 0.032, 0.026, 0.05, K.P, 0, 0.036, 0, 18);
    ball(g, 0.018, 0.016, 0.02, K.S, 0.028, 0.018, 0, 12);                                         // the mouth
    for (const s of [-1, 1]) {
      ball(g, 0.017, 0.02, 0.016, K.L, 0.01, 0.045, s * 0.042, 14);
      rod(g, [0.018, 0.055, s * 0.012], [-0.01, 0.1, s * 0.035], 0.0025, 0.002, K.S, 5);
      rod(g, [-0.01, 0.1, s * 0.035], [-0.05, 0.12, s * 0.055], 0.002, 0.0015, K.S, 5);
    }
  } },
  core: (() => {
    const top = 0.235;
    return {
      sockets: { neck: [0.07, top, 0], shoulderL: [0.03, 0.175, -0.125], shoulderR: [0.03, 0.175, 0.125], back: [-0.06, 0.17, 0], mountL: [-0.03, 0.215, -0.075], mountR: [-0.03, 0.215, 0.075] },
      build(root) {
        const g = at(root, 0, 0, 0);
        ball(g, 0.04, 0.035, 0.045, K.S, 0, 0.03, 0, 14);
        // the abdomen: long, segmented, hanging down behind
        const ab = at(g, -0.1, 0.085, 0, 0, 0, 0.42);
        ball(ab, 0.11, 0.05, 0.068, K.P, 0, 0, 0, 20);
        for (let i = 0; i < 4; i++) ring(ab, 0.05 - i * 0.006, 0.006, K.S, 'x', -0.03 + i * 0.03, 0, 0).scale.set(1, 1.35, 1);
        ball(ab, 0.012, 0.012, 0.012, K.G, -0.105, -0.005, 0, 8);
        // the thorax, hunched forward and up into a long neck
        const th = at(g, 0.01, 0.15, 0, 0, 0, 0.3);
        ball(th, 0.1, 0.07, 0.1, K.P, 0, 0, 0, 22);
        dome(th, 0.09, 0.05, 0.088, K.S, -0.01, 0.01, 0, 20);
        ball(th, 0.022, 0.03, 0.03, K.G, 0.08, -0.02, 0, 12);
        rod(g, [0.04, 0.18, 0], [0.07, top, 0], 0.03, 0.02, K.S, 12);
        ring(g, 0.024, 0.006, K.A, 'y', 0.068, top - 0.01, 0);
        for (const s of [-1, 1]) ball(g, 0.008, 0.008, 0.008, K.G, 0.07, 0.2, s * 0.06, 8);
      },
    };
  })(),
  arms: { dims: { upper: 0.11, fore: 0.125, reach: 0.13, drop: 0.12, inset: 0.008 },
    draw(root, p, side, j) { drawArm(K, root, side, j, { t: 0.038, paul: 0.85, upper: 0.95, fore: 0.9, seed: 4, shoulder: 'spines', forearm: 'scythe' }); } },
  booster: { build(root) {
    const g = at(root, 0, 0, 0);
    capsule(g, 0.018, 0.06, K.S, 'z', -0.01, 0, 0);
    for (const s of [-1, 1]) {
      const w = at(g, -0.06, 0.02, s * 0.03, s * 0.35, 0, -0.25);
      dome(w, 0.085, 0.022, 0.034, K.P, 0, 0, 0, 18); ball(w, 0.07, 0.004, 0.006, K.A, 0, 0.018, 0, 10);
      pod(g, -0.05, -0.022, s * 0.022, 0.016, -1, -0.4, 0);
    }
  } },
  legs: { dims: { hip: 0.36, drop: 0.032, thigh: 0.13, shin: 0.18, meta: 0.13, toe: 0.06, ankle: 0, hipW: 0.05, stance: 0.07, stride: 0.23, lift: 0.07, foot: 0.07 },
    draw(root, st) { drawReverse(K, root, st, this.dims, { t: 0.04, thigh: 1, shin: 0.8, seed: 6, skirt: false }); } },
};

addParts({
  'calyx-head-4': bloom.head, 'calyx-core-4': bloom.core, 'calyx-arms-4': bloom.arms, 'calyx-booster-4': bloom.booster, 'calyx-legs-4': bloom.legs,
  'calyx-head-5': sickle.head, 'calyx-core-5': sickle.core, 'calyx-arms-5': sickle.arms, 'calyx-booster-5': sickle.booster, 'calyx-legs-5': sickle.legs,
});

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
