// Leg and arm drawers. The rig (rig.js) works out where the joints are for a moment of an animation; these dress the
// joints in a maker's shape language (kit.js block / limb / joint), so one drawer per leg type serves all four makers.
// V = the part's own look knobs (thickness, extras), set in each maker's file.
import * as THREE from 'three';
import { box, cbox, rbox, cyl, ball, dome, capsule, ring, prism, rod, along, at, joint, limb, block, lamp, hazard, vents, glowOf, lerp, MAKERS, V as V3 } from './kit.js';

const DOWN = [0, 0, -1];
const f = v => v.toFixed(3);      // limb lateral that keeps a downward limb's +x facing forward (see kit.along)

/** A jet flame: a glowing cone pointing along `dir` from p (length by power 0..1). */
export function jet(K, parent, p, dir, power, r = 0.014) {
  if (power <= 0.05) return;
  const len = 0.02 + 0.06 * power;
  const g = along(parent, p, [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len], [0, 0, 1]);
  cyl(g, r, len, K.G, 'y', 0, len / 2, 0, { rt: r * 0.15, seg: 10 });
  cyl(g, r * 0.55, len * 0.6, glowOf('#ffffff', 0.9), 'y', 0, len * 0.3, 0, { rt: r * 0.1, seg: 8 });
}

// ---------------------------------------------------------------------------------------------------------------------
// feet
function foot(K, parent, l, D, Vk) {
  const g = at(parent, l.foot[0], l.foot[1], l.foot[2], 0, 0, l.pitch || 0);
  const L = D.foot, t = Vk.t;
  switch (K.look) {
    case 'sleek':
      prism(g, `slk-foot:${L}:${t}`, [[-L * 0.35, 0], [L * 0.62, 0], [L * 0.45, 0.022], [-L * 0.15, 0.04], [-L * 0.38, 0.03]], t * 1.25, K.P, 0.003, 0, 0, 0);
      box(g, L * 0.5, 0.006, t * 0.3, K.G, L * 0.15, 0.03, 0);
      break;
    case 'chunky':
      rbox(g, L * 1.05, 0.034, t * 1.7, 0.008, K.S, L * 0.08, 0.017, 0);
      rbox(g, L * 0.55, 0.03, t * 1.3, 0.008, K.P, L * 0.05, 0.045, 0);
      box(g, 0.006, 0.026, t * 1.5, K.K, L * 0.6, 0.017, 0);
      break;
    case 'rounded':
      ball(g, L * 0.55, 0.026, t * 0.8, K.P, L * 0.12, 0.022, 0, 16);
      ring(g, t * 0.45, t * 0.08, K.S, 'y', 0, 0.042, 0);
      break;
    default:
      box(g, L * 0.95, 0.026, t * 1.45, K.N, L * 0.1, 0.013, 0);
      box(g, L * 0.4, 0.03, t * 1.1, K.P, -L * 0.05, 0.04, 0).rotation.y = 0.12;
      box(g, 0.012, 0.012, t * 1.6, K.U, L * 0.55, 0.008, 0);
  }
  return g;
}

/** A knee guard in front of the knee. */
function kneePad(K, parent, knee, t, m) {
  const [x, y, z] = knee;
  switch (K.look) {
    case 'sleek': { const p = prism(parent, `slk-knee:${t}`, [[0, -t * 0.9], [t * 0.9, 0], [0, t * 1.4], [-t * 0.3, t * 0.5]], t * 1.0, m, 0.003, x + t * 0.25, y, z); return p; }
    case 'chunky': return rbox(parent, t * 0.9, t * 1.5, t * 1.5, t * 0.15, m, x + t * 0.45, y + t * 0.1, z);
    case 'rounded': return ball(parent, t * 0.6, t * 0.75, t * 0.65, m, x + t * 0.35, y, z, 14);
    default: { const b = box(parent, t * 0.4, t * 1.3, t * 1.3, m, x + t * 0.45, y, z); b.rotation.z = 0.2; return b; }
  }
}

/** Pelvis: the hip block the socket sits on. */
function pelvis(K, parent, st, D, Vk) {
  const g = at(parent, st.pelvis[0], st.pelvis[1], st.pelvis[2], st.roll || 0, 0, -(st.lean || 0) * 0.5);
  const w = D.hipW * 2 + Vk.t * 0.9, h = D.drop * 1.4, d = Vk.t * 2.2;
  switch (K.look) {
    case 'sleek':
      cbox(g, d, h, w * 0.75, 0.008, K.D, 0, 0, 0);
      prism(g, 'slk-pelvis', [[-d * 0.6, -h * 0.2], [d * 0.7, -h * 0.5], [d * 0.55, h * 0.45], [-d * 0.5, h * 0.5]], w * 0.45, K.S, 0.003);
      break;
    case 'chunky':
      rbox(g, d * 1.1, h * 1.1, w, 0.01, K.S, 0, 0, 0);
      for (const s of [-1, 1]) { rbox(g, d * 1.15, h * 1.25, Vk.t * 0.5, 0.006, K.P, 0, -h * 0.15, s * (w / 2 + Vk.t * 0.15)); }
      break;
    case 'rounded':
      ball(g, d * 0.6, h * 0.75, w * 0.55, K.S, 0, 0, 0, 16);
      ring(g, w * 0.35, 0.008, K.P, 'y', 0, h * 0.25, 0);
      break;
    default:
      box(g, d, h, w, K.N, 0, 0, 0);
      box(g, d * 0.6, h * 0.5, w * 1.05, K.U, 0, h * 0.25, 0).rotation.x = 0.06;
  }
  // a skirt of armour over the hip joints
  if (Vk.skirt) for (const s of [-1, 1]) {
    const sk = at(g, 0, -h * 0.2, s * (D.hipW + Vk.t * 0.3), s * 0.25, 0, 0);
    block(K, sk, d * 0.9, h * 1.6, Vk.t * 0.35, K.P, 0, -h * 0.4, 0);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
export function drawBiped(K, root, st, D, Vk) {
  pelvis(K, root, st, D, Vk);
  for (const l of st.legs) {
    const t = Vk.t;
    joint(K, root, l.hip, t * 0.55);
    limb(K, root, l.hip, l.knee, t * Vk.thigh, { lateral: DOWN, m: K.P, trim: K.S, face: l.s, seed: Vk.seed + (l.s > 0 ? 1 : 0) });
    joint(K, root, l.knee, t * 0.5);
    limb(K, root, l.knee, l.ankle, t * Vk.shin, { lateral: DOWN, m: Vk.shinMat === 'S' ? K.S : K.P, trim: K.S, face: l.s, seed: Vk.seed + 2 });
    kneePad(K, root, l.knee, t, Vk.kneeMat === 'A' ? K.A : K.S);
    joint(K, root, l.ankle, t * 0.38);
    const f = foot(K, root, l, D, Vk);
    jet(K, f, [-D.foot * 0.3, 0.02, 0], [-0.5, -1, 0], st.jets, 0.012);
    // calf extras by maker
    if (K.look === 'chunky') {
      rod(root, [l.knee[0] - t * 0.5, l.knee[1] - t * 0.3, l.knee[2]], [l.ankle[0] - t * 0.35, l.ankle[1] + t * 0.4, l.ankle[2]], t * 0.16, t * 0.12, K.M, 8);
      const g = along(root, l.knee, l.ankle, DOWN); box(g, 0.005, g.userData.len * 0.25, t * 0.5, K.G, t * 0.62, g.userData.len * 0.55, 0);
    }
    if (K.look === 'sleek' && Vk.fins) { const g = along(root, l.knee, l.ankle, DOWN); prism(g, 'slk-calf', [[-0.01, 0.02], [-0.06, 0.05], [-0.02, 0.12], [0.0, 0.1]], 0.008, K.A, 0.002, -t * 0.4, 0, 0); }
    if (K.look === 'scrap') rod(root, [l.hip[0] - t * 0.6, l.hip[1], l.hip[2]], [l.ankle[0] - t * 0.5, l.ankle[1] + 0.03, l.ankle[2]], t * 0.09, t * 0.09, K.R, 6);
    if (Vk.spike) {   // a duellist's knee: a long blade spike forward-up off the knee, and a spur off the heel
      const g = along(root, l.knee, l.hip, DOWN);
      prism(g, `kspike:${t}`, [[t * 0.2, -t * 0.4], [t * 1.6, -t * 0.2], [t * 2.9, t * 1.9], [t * 0.4, t * 0.9]], t * 0.35, K.A, 0.002);
      box(g, t * 0.12, t * 1.2, t * 0.16, K.G, t * 1.1, t * 0.5, 0).rotation.z = -0.55;
      const fg = at(root, l.foot[0], l.foot[1], l.foot[2], 0, 0, l.pitch || 0);
      prism(fg, `spur:${t}`, [[-D.foot * 0.3, 0.012], [-D.foot * 0.85, 0.004], [-D.foot * 0.35, 0.034]], t * 0.3, K.A, 0.002);
    }
  }
}

export function drawReverse(K, root, st, D, Vk) {
  pelvis(K, root, st, D, Vk);
  for (const l of st.legs) {
    const t = Vk.t;
    joint(K, root, l.hip, t * 0.55);
    limb(K, root, l.hip, l.knee, t * Vk.thigh, { lateral: DOWN, m: K.P, trim: K.S, face: l.s, seed: Vk.seed });
    joint(K, root, l.knee, t * 0.48);
    kneePad(K, root, l.knee, t * 0.9, K.S);
    limb(K, root, l.knee, l.ankle, t * Vk.shin, { lateral: DOWN, m: K.S, trim: K.P, face: l.s, seed: Vk.seed + 3 });
    joint(K, root, l.ankle, t * 0.42, K.look === 'scrap' ? K.U : K.D);
    // the long foot bone, then toes
    limb(K, root, l.ankle, [l.foot[0] - 0.012, l.foot[1] + 0.02, l.foot[2]], t * 0.7, { lateral: DOWN, m: K.P, trim: K.D, face: l.s, seed: Vk.seed + 5 });
    if (K.look === 'scrap' && !Vk.pogo) {   // a coil spring along the foot bone: the hopper's trick
      const g = along(root, l.ankle, l.foot, DOWN);
      for (let i = 0; i < 5; i++) ring(g, t * 0.42, t * 0.08, K.M, 'y', -t * 0.5, g.userData.len * (0.15 + i * 0.13), 0);
    }
    if (Vk.pogo) {   // a big pogo spring down the back of the shin, bolted at both ends
      const g = along(root, l.knee, l.ankle, DOWN), n = 7, len = g.userData.len;
      for (let i = 0; i < n; i++) ring(g, t * 0.62, t * 0.11, i % 2 ? K.M : K.A, 'y', -t * 0.85, len * (0.12 + i * 0.12), 0);
      box(g, t * 0.4, t * 0.25, t * 1.2, K.U, -t * 0.85, len * 0.05, 0); box(g, t * 0.4, t * 0.25, t * 1.2, K.U, -t * 0.85, len * 0.92, 0);
    }
    if (Vk.vanes) {   // tall sensor vanes off the knee, swept back
      const g = at(root, l.knee[0], l.knee[1], l.knee[2]);
      prism(g, `kvane:${t}`, [[0, 0], [t * 0.6, t * 0.4], [-t * 1.6, t * 3.4], [-t * 2.1, t * 3.2]], t * 0.22, K.A, 0.0015, 0, t * 0.2, 0);
      box(g, t * 0.14, t * 1.9, t * 0.26, K.G, -t * 0.7, t * 1.9, 0).rotation.z = 0.5;
    }
    const toes = at(root, l.foot[0], l.foot[1], l.foot[2], 0, 0, l.pitch || 0);
    if (Vk.shovel) {   // a flat shovel blade for a foot
      box(toes, 0.075, 0.008, t * 1.9, K.N, 0.012, 0.005, 0);
      box(toes, 0.008, 0.014, t * 1.9, K.U, 0.05, 0.012, 0);
      box(toes, 0.03, 0.02, t * 0.6, K.P, -0.01, 0.016, 0).rotation.y = 0.15;
    } else for (const dz of [-1, 0, 1]) {
      const tg = at(toes, 0, 0.012, dz * t * 0.55, 0, -dz * 0.35, 0);
      if (K.look === 'sleek') prism(tg, 'slk-toe', [[-0.01, -0.01], [0.055, -0.01], [0.03, 0.012], [-0.01, 0.016]], t * 0.4, dz ? K.P : K.A, 0.002);
      else if (K.look === 'rounded') { capsule(tg, t * 0.22, 0.06, dz ? K.S : K.P, 'x', 0.022, -0.002, 0); ball(tg, t * 0.16, t * 0.16, t * 0.16, K.A, 0.052, -0.004, 0, 8); }
      else box(tg, 0.05, 0.018, t * 0.4, dz ? K.N : K.P, 0.022, 0, 0);
    }
    if (!Vk.shovel) box(toes, 0.03, 0.016, t * 0.45, K.D, -0.03, 0.01, 0);
    jet(K, toes, [-0.02, 0.03, 0], [-0.4, -1, 0], st.jets, 0.011);
  }
}

export function drawQuad(K, root, st, D, Vk) {
  const body = at(root, st.body[0], st.body[1], st.body[2], st.roll || 0, 0, st.pitch || 0);
  const bx = D.bodyX * 2.6, bz = D.bodyZ * 2.6, bh = D.drop * 1.7;
  if (Vk.bunker) {
    // a sloped casemate with a firing slit and armour skirts all round
    rbox(body, bx * 1.05, bh * 1.1, bz * 1.05, 0.012, K.S, 0, 0, 0);
    prism(body, `qb-glacis:${f(bx)}`, [[-bx * 0.5, -bh * 0.3], [bx * 0.56, -bh * 0.3], [bx * 0.4, bh * 0.75], [-bx * 0.45, bh * 0.75]], bz * 1.12, K.P, 0.004);
    box(body, 0.006, bh * 0.16, bz * 0.6, K.L, bx * 0.47, bh * 0.38, 0);
    for (const s of [-1, 1]) {
      rbox(body, bx * 0.95, bh * 0.75, 0.016, 0.004, K.P, 0, -bh * 0.35, s * bz * 0.6);
      hazard(K, body, bx * 0.5 + 0.004, -bh * 0.25, s * bz * 0.3, bz * 0.3, bh * 0.35, 3);
      lamp(K, body, bx * 0.52, bh * 0.1, s * bz * 0.42, 0.011);
    }
    rbox(body, bx * 0.3, bh * 0.4, bz * 0.5, 0.006, K.D, -bx * 0.5, bh * 0.2, 0);
    vents(K, body, -bx * 0.66, bh * 0.2, 0, bz * 0.4, bh * 0.3, 3);
  } else if (K.look === 'rounded') {
    ball(body, bx * 0.55, bh * 0.7, bz * 0.55, K.P, 0, 0, 0, 20);
    ring(body, bz * 0.42, 0.01, K.S, 'y', 0, bh * 0.35, 0);
    for (const s of [-1, 1]) ball(body, 0.018, 0.018, 0.018, K.G, bx * 0.42, -bh * 0.05, s * bz * 0.22, 10);
    ball(body, bx * 0.3, bh * 0.4, bz * 0.3, K.A, -bx * 0.45, -bh * 0.1, 0, 14);    // a glowing tail pod
    ball(body, bx * 0.12, bh * 0.2, bz * 0.12, K.G, -bx * 0.62, -bh * 0.1, 0, 10);
  } else {
    rbox(body, bx, bh, bz, 0.012, K.S, 0, 0, 0);
    rbox(body, bx * 0.9, bh * 0.5, bz * 1.08, 0.008, K.P, 0, bh * 0.35, 0);
    hazard(K, body, bx / 2 + 0.003, -bh * 0.1, 0, bz * 0.7, bh * 0.4, 5);
    for (const s of [-1, 1]) lamp(K, body, bx / 2 + 0.006, bh * 0.22, s * bz * 0.3, 0.012);
    cyl(body, 0.012, 0.07, K.D, 'y', -bx * 0.4, bh * 0.6, bz * 0.25, { seg: 8 });   // exhaust stack
  }
  for (const l of st.legs) {
    const t = Vk.t;
    joint(K, root, l.root, t * 0.6);
    const lat = [l.fx * 0.3, 0, -l.fz];
    limb(K, root, l.root, l.knee, t * 1.05, { lateral: [0, 1, 0], m: K.P, trim: K.S, face: l.fz, seed: Vk.seed });
    joint(K, root, l.knee, t * 0.5);
    if (K.look === 'rounded') {   // mantis: a long tapering spike of a lower leg
      rod(root, l.knee, l.foot, t * 0.42, t * 0.1, K.S, 10);
      ball(root, t * 0.5, t * 0.5, t * 0.5, K.P, l.knee[0], l.knee[1] + t * 0.2, l.knee[2], 12);
      ball(root, t * 0.22, t * 0.22, t * 0.22, K.G, l.knee[0], l.knee[1] + t * 0.55, l.knee[2], 8);
    } else {
      limb(K, root, l.knee, [l.foot[0], l.foot[1] + 0.03, l.foot[2]], t * 1.1, { lateral: lat, m: K.P, trim: K.S, face: l.fz, seed: Vk.seed + 1 });
      if (Vk.pads) {   // outrigger: a broad round stabiliser pad and a jack ram from the knee down to it
        cyl(root, 0.052, 0.022, K.S, 'y', l.foot[0], l.foot[1] + 0.011, l.foot[2], { rt: 0.044, seg: 16 });
        cyl(root, 0.03, 0.012, K.D, 'y', l.foot[0], l.foot[1] + 0.028, l.foot[2], { seg: 12 });
        rod(root, [l.knee[0] + l.fx * t * 0.6, l.knee[1] + t * 0.3, l.knee[2]], [l.foot[0] + l.fx * 0.012, l.foot[1] + 0.03, l.foot[2]], t * 0.34, t * 0.26, K.D, 10);
        rod(root, [l.knee[0] + l.fx * t * 0.6, l.knee[1] + t * 0.3, l.knee[2]], [l.foot[0] + l.fx * 0.012, l.foot[1] + 0.05, l.foot[2]], t * 0.2, t * 0.2, K.M, 8);
        block(K, root, t * 1.6, t * 1.8, t * 1.6, K.A, l.knee[0], l.knee[1] + t * 0.4, l.knee[2]);
      } else rbox(root, 0.07, 0.03, 0.07, 0.008, K.S, l.foot[0], l.foot[1] + 0.015, l.foot[2]);
      rod(root, [l.root[0], l.root[1] + 0.02, l.root[2]], [l.knee[0], l.knee[1] + 0.02, l.knee[2]], t * 0.14, t * 0.14, K.M, 8);
    }
    jet(K, root, [l.foot[0], l.foot[1] + 0.03, l.foot[2]], [0, -1, 0], st.jets * 0.8, 0.012);
  }
}

export function drawTreads(K, root, st, D, Vk) {
  const hull = at(root, st.body[0], st.body[1], st.body[2], st.roll || 0, 0, st.pitch || 0);
  const L = D.len, H = D.trackH, W = D.trackW, gap = D.gap;
  // hull between the tracks
  if (K.look === 'scrap') {
    box(hull, L * 0.7, 0.07, gap * 2 - W * 0.2, K.N, 0, 0.0, 0);
    box(hull, L * 0.4, 0.05, gap * 1.4, K.P, -0.02, 0.05, 0).rotation.y = 0.05;
    cyl(hull, 0.03, 0.09, K.U, 'z', -L * 0.3, 0.03, 0, { seg: 10 });          // a fuel drum strapped across the back
    cyl(hull, 0.01, 0.12, K.D, 'y', -L * 0.25, 0.1, gap * 0.5, { seg: 6 });
    lamp(K, hull, L * 0.36, 0.03, 0, 0.014);
  } else {
    rbox(hull, L * 0.78, 0.08, gap * 2 - W * 0.1, 0.012, K.S, 0, 0, 0);
    prism(hull, 'tr-glacis', [[-L * 0.38, 0.0], [L * 0.38, 0.0], [L * 0.3, 0.06], [-L * 0.3, 0.06]], gap * 1.7, K.P, 0.004, 0, 0.03, 0);
    hazard(K, hull, L * 0.39, 0.0, 0, gap * 1.2, 0.04, 6);
    for (const s of [-1, 1]) lamp(K, hull, L * 0.4, 0.045, s * gap * 0.55, 0.012);
  }
  for (const s of [-1, 1]) {
    const tr = at(root, 0, 0, s * gap, 0, 0, 0);
    tr.rotation.set(st.roll || 0, 0, (st.pitch || 0) * 0.5);
    tr.position.y = -st.sag * 0.2 + (st.down ? -0.01 * st.down : 0);
    // the track: links around a rounded loop, moving with the track phase
    const r = H / 2, flat = L - H, n = 18, per = 2 * flat + Math.PI * H;
    for (let i = 0; i < n; i++) {
      let u = ((i / n + st.track * (s > 0 ? 1 : 1) * 0.25) % 1 + 1) % 1 * per, x, y, a;
      if (u < flat) { x = flat / 2 - u; y = 0; a = 0; }
      else if ((u -= flat) < Math.PI * r) { a = u / r; x = -flat / 2 - Math.sin(a) * r; y = r - Math.cos(a) * r; }
      else if ((u -= Math.PI * r) < flat) { x = -flat / 2 + u; y = H; a = Math.PI; }
      else { u -= flat; a = Math.PI + u / r; x = flat / 2 - Math.sin(a) * r; y = r - Math.cos(a) * r; }
      const ln = box(tr, per / n * 0.8, 0.012, W, K.R, x, y + 0.006, 0); ln.rotation.z = -a;
    }
    // wheels + side armour
    for (let i = 0; i < 4; i++) cyl(tr, r * 0.72, W * 0.8, K.look === 'scrap' ? K.U : K.D, 'z', -flat / 2 + i * flat / 3, r, 0, { seg: 14 });
    if (Vk.forks) { ring(tr, H * 0.32, H * 0.13, K.R, 'z', -L * 0.12, H * 0.62, s * W * 0.62); box(tr, L * 0.3, H * 0.4, 0.008, K.S, L * 0.22, H * 0.6, s * W * 0.55).rotation.z = -0.08; }
    else if (K.look === 'scrap') { box(tr, L * 0.5, H * 0.5, 0.008, K.S, 0.02, H * 0.6, s * W * 0.55).rotation.z = 0.06; }
    else { block(K, tr, L * 0.92, H * 0.55, 0.02, K.P, 0, H * 0.62, s * W * 0.55); box(tr, L * 0.6, 0.008, 0.024, K.A, 0, H * 0.4, s * W * 0.56); }
    jet(K, tr, [-L * 0.45, H * 0.6, 0], [-1, -0.3, 0], st.jets, 0.016);
  }
  if (Vk.dozer) {   // a dozer blade across the front on two push arms
    const bl = at(hull, L * 0.5 + 0.035, -st.body[1] + 0.055, 0);
    prism(bl, `dozer:${f(gap)}`, [[0, -0.05], [0.02, -0.052], [0.012, 0.0], [0.024, 0.05], [0.004, 0.056], [-0.012, 0.0]], gap * 2 + W * 1.05, K.P, 0.004);
    hazard(K, bl, 0.022, 0.03, 0, gap * 2, 0.022, 9);
    for (const s of [-1, 1]) { rod(hull, [L * 0.25, 0.0, s * gap * 0.55], [L * 0.5 + 0.03, -st.body[1] + 0.05, s * gap * 0.55], 0.012, 0.012, K.D, 8); rod(hull, [L * 0.3, 0.035, s * gap * 0.3], [L * 0.5 + 0.03, -st.body[1] + 0.085, s * gap * 0.3], 0.008, 0.008, K.M, 8); }
  }
  if (Vk.forks) {   // forklift tines out front on a mast, and a tyre hung on each side
    const mast = at(hull, L * 0.42, 0, 0);
    for (const s of [-1, 1]) {
      box(mast, 0.012, 0.12, 0.014, K.D, 0, 0.0, s * gap * 0.45);
      box(mast, 0.12, 0.008, 0.02, K.M, 0.06, -st.body[1] + 0.03, s * gap * 0.4);
      box(mast, 0.01, 0.05, 0.02, K.M, 0.002, -st.body[1] + 0.055, s * gap * 0.4);
    }
    box(mast, 0.008, 0.012, gap * 1.1, K.A, 0.004, 0.06, 0); box(mast, 0.008, 0.012, gap * 1.1, K.A, 0.004, -0.04, 0);
  }
  // turret ring the upper body sits on
  const top = at(root, st.hip[0], st.hip[1], st.hip[2]);
  cyl(top, D.ring, 0.02, K.D, 'y', 0, -0.01, 0, { seg: 20 });
}

export function drawHover(K, root, st, D, Vk) {
  const h = at(root, st.sx || 0, st.y, 0, st.roll || 0, 0, st.pitch || 0);
  const T = D.top;
  if (Vk.pods) {
    // a small hub with a ring of floating seed pods, each on a tendril, bobbing out of step
    ball(h, D.r * 0.42, T * 0.42, D.r * 0.42, K.P, 0, T * 0.55, 0, 20);
    ring(h, D.r * 0.4, 0.008, K.A, 'y', 0, T * 0.5, 0);
    ball(h, D.r * 0.22, T * 0.2, D.r * 0.22, K.G, 0, T * 0.18, 0, 14);
    const n = Vk.pods, bob = st.phase || 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3, rr = D.r * 0.92, dy = 0.008 * Math.sin((bob + i / n) * Math.PI * 2);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = T * 0.28 + dy;
      rod(h, [Math.cos(a) * D.r * 0.3, T * 0.5, Math.sin(a) * D.r * 0.3], [x * 0.92, y + 0.02, z * 0.92], 0.006, 0.004, K.S, 6);
      ball(h, 0.036, 0.03, 0.036, K.P, x, y, z, 14);
      ring(h, 0.03, 0.005, K.S, 'y', x, y - 0.004, z);
      ball(h, 0.016, 0.01, 0.016, K.G, x, y - 0.024, z, 10);
    }
  } else if (K.look === 'sleek') {
    // a delta skirt with swept fins and a thruster line underneath
    slabDelta(K, h, D, T);
  } else {
    // a jellyfish bell: a dome over a glowing rim with fins hanging below
    dome(h, D.r, T * 0.95, D.r, K.P, 0, T * 0.05, 0, 24);
    ring(h, D.r * 0.98, 0.012, K.S, 'y', 0, T * 0.06, 0);
    ring(h, D.r * 0.8, 0.008, K.G, 'y', 0, T * 0.02, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = Math.cos(a) * D.r * 0.85, z = Math.sin(a) * D.r * 0.85;
      const f = at(h, x, 0, z, 0, -a, 0);
      ball(f, 0.022, 0.04, 0.012, K.S, 0, -0.02, 0, 10);
      ball(f, 0.008, 0.008, 0.008, K.G, 0.006, -0.05, 0, 8);
    }
    ball(h, D.r * 0.3, T * 0.3, D.r * 0.3, K.A, 0, T * 0.62, 0, 14);
  }
  // the lift glow under the skirt
  const p = 0.4 + 0.6 * st.jets;
  cyl(h, D.r * 0.55 * p + 0.02, 0.006, K.G, 'y', 0, -0.006, 0, { seg: 20 });
  jet(K, h, [-D.r * 0.6, T * 0.3, 0], [-1, -0.2, 0], st.jets * 0.8, 0.016);
}

function slabDelta(K, h, D, T) {
  const r = D.r;
  const pts = [[r * 1.05, 0], [-r * 0.6, r * 0.95], [-r * 0.9, r * 0.6], [-r * 0.9, -r * 0.6], [-r * 0.6, -r * 0.95]];
  const lower = prism(h, 'hv-delta', pts.map(([x, z]) => [x, z]), T * 0.4, K.S, 0.004); lower.rotation.x = -Math.PI / 2; lower.position.y = T * 0.2;
  const upper = prism(h, 'hv-delta2', pts.map(([x, z]) => [x * 0.75, z * 0.72]), T * 0.45, K.P, 0.006); upper.rotation.x = -Math.PI / 2; upper.position.y = T * 0.6;
  cbox(h, r * 0.7, T * 0.3, r * 0.6, 0.01, K.D, -0.01, T * 0.88, 0);
  for (const s of [-1, 1]) {
    const fin = prism(h, 'hv-fin', [[0, 0], [-r * 0.5, 0], [-r * 0.65, T * 0.9], [-r * 0.4, T * 0.9]], 0.01, K.A, 0.002, -r * 0.3, T * 0.5, s * r * 0.62);
    fin.rotation.x = s * 0.25;
    box(h, r * 0.9, 0.008, 0.012, K.G, 0, T * 0.42, s * r * 0.66).rotation.y = s * 0.55;
  }
  box(h, 0.008, T * 0.2, r * 0.6, K.G, r * 0.82, T * 0.45, 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// arms. j = { shoulder, elbow, hand, droop } in shoulder space (side +1 = right / +z).
export function drawArm(K, root, side, j, Vk) {
  const t = Vk.t;
  // shoulder armour first: it sets the silhouette
  const sh = at(root, 0, 0, 0);
  switch (K.look) {
    case 'sleek': {
      const p = prism(sh, `slk-paul:${Vk.paul}`, [[-0.055, -0.03], [0.05, -0.04], [0.035, 0.03], [-0.02, 0.05], [-0.085, 0.035]].map(([a, b]) => [a * Vk.paul, b * Vk.paul]), 0.05 * Vk.paul, K.P, 0.004, 0, 0.01, side * 0.035 * Vk.paul);
      p.rotation.x = -side * 0.35;
      box(sh, 0.06 * Vk.paul, 0.006, 0.006, K.G, -0.01, 0.02 * Vk.paul, side * 0.064 * Vk.paul).rotation.z = 0.25;
      if (Vk.fin) prism(sh, 'slk-sfin', [[0, 0], [-0.05, 0.075], [-0.07, 0.07], [-0.03, 0]], 0.008, K.A, 0.002, -0.02, 0.03, side * 0.05);
      break;
    }
    case 'chunky': {
      rbox(sh, 0.1 * Vk.paul, 0.075 * Vk.paul, 0.075 * Vk.paul, 0.012, K.P, 0, 0.012, side * 0.03 * Vk.paul);
      hazard(K, sh, 0.05 * Vk.paul + 0.002, 0.01, side * 0.03 * Vk.paul, 0.06 * Vk.paul, 0.022, 4);
      rbox(sh, 0.11 * Vk.paul, 0.02, 0.085 * Vk.paul, 0.006, K.S, 0, 0.052 * Vk.paul, side * 0.03 * Vk.paul);
      box(sh, 0.006, 0.008, 0.03, K.G, 0.052 * Vk.paul, 0.036 * Vk.paul, side * 0.03 * Vk.paul);       // amber running light
      break;
    }
    case 'rounded': {
      ball(sh, 0.05 * Vk.paul, 0.045 * Vk.paul, 0.045 * Vk.paul, K.P, 0, 0.012, side * 0.025, 18);
      ring(sh, 0.035 * Vk.paul, 0.007, K.S, 'z', 0, 0.01, side * 0.06 * Vk.paul);
      ball(sh, 0.01, 0.01, 0.01, K.G, 0.035 * Vk.paul, 0.03, side * 0.035, 8);
      break;
    }
    default: {
      // a tyre for a shoulder pad on one side, a dented plate on the other
      if (side > 0) { ring(sh, 0.035 * Vk.paul, 0.016 * Vk.paul, K.R, 'z', 0, 0.01, side * 0.03); cyl(sh, 0.025 * Vk.paul, 0.02, K.N, 'z', 0, 0.01, side * 0.03, { seg: 10 }); }
      else { const b = box(sh, 0.085 * Vk.paul, 0.06 * Vk.paul, 0.05 * Vk.paul, K.S, 0, 0.015, side * 0.03); b.rotation.set(0.2, 0.1, 0.1); box(sh, 0.04, 0.02, 0.055 * Vk.paul, K.U, 0.02, 0.04, side * 0.03); }
    }
  }
  if (Vk.shoulder) SHOULDER[Vk.shoulder](K, sh, side, Vk);
  joint(K, root, [0, 0, 0], t * 0.6);
  if (Vk.poles) {   // scaffold poles with clamps instead of armour
    rod(root, j.shoulder, j.elbow, t * 0.32, t * 0.32, K.M, 8); rod(root, j.elbow, j.hand, t * 0.3, t * 0.3, K.M, 8);
    for (const [a, b] of [[j.shoulder, j.elbow], [j.elbow, j.hand]]) for (const u of [0.25, 0.7]) box(root, t * 0.8, t * 0.5, t * 0.8, K.U, lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
    rod(root, [j.shoulder[0] - t * 0.5, j.shoulder[1], j.shoulder[2]], [j.hand[0] - t * 0.4, j.hand[1] + t * 0.4, j.hand[2]], t * 0.1, t * 0.1, K.R, 6);
  } else limb(K, root, j.shoulder, j.elbow, t * Vk.upper, { lateral: DOWN, m: K.S, trim: K.P, face: side, seed: Vk.seed });
  joint(K, root, j.elbow, t * 0.45);
  const fore = Vk.poles ? along(root, j.elbow, j.hand, [0, 0, -side]) : limb(K, root, j.elbow, j.hand, t * Vk.fore, { lateral: [0, 0, -side], m: K.P, trim: K.S, face: side, seed: Vk.seed + 1 });
  if (Vk.forearm) FOREARM[Vk.forearm](K, root, side, j, Vk);
  // forearm extras
  if (K.look === 'chunky') { const len = fore.userData.len; rbox(fore, t * 1.5, len * 0.55, t * 1.4, 0.008, K.P, t * 0.1, len * 0.55, 0); }
  if (K.look === 'rounded') { const len = fore.userData.len; ball(fore, t * 0.7, len * 0.4, t * 0.7, K.P, 0, len * 0.6, 0, 14); }
  if (K.look === 'sleek' && Vk.blade) { const len = fore.userData.len; prism(fore, 'slk-fblade', [[0, len * 0.2], [t * 1.1, len * 0.5], [0, len * 0.95]], 0.008, K.A, 0.002, t * 0.3, 0, 0); }
  // the hand
  const [hx, hy, hz] = j.hand, fk = Vk.fist || 1;
  switch (K.look) {
    case 'sleek': cbox(root, t * 1.0, t * 0.9, t * 0.85, t * 0.2, K.D, hx, hy, hz); break;
    case 'chunky': rbox(root, t * 1.2 * fk, t * 1.1 * fk, t * 1.15 * fk, t * 0.15, K.D, hx, hy, hz); break;
    case 'rounded': ball(root, t * 0.6, t * 0.55, t * 0.55, K.S, hx, hy, hz, 12); break;
    default: box(root, t * 1.05, t * 1.0, t * 1.0, K.N, hx, hy, hz);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Line extras: shoulder silhouettes and forearm add-ons that give a frame line its own look (arm Vk.shoulder / .forearm).
// Shoulder pieces build in the shoulder's own space (+x forward, +z right, side = ±1); forearm pieces get the joints.
/** A group along a forearm whose +z points up and +x points to the right of the limb (so `side` = outward). */
const foreUp = (root, j) => along(root, j.elbow, j.hand, [0, 1, 0]);
export const SHOULDER = {
  // Rapier: a tall swept blade standing up off the shoulder
  blade(K, sh, side, Vk) {
    const p = prism(sh, 'sh-blade', [[0.02, 0.02], [-0.03, 0.03], [-0.11, 0.16], [-0.085, 0.165], [-0.02, 0.07]], 0.009, K.A, 0.002, 0, 0.01, side * 0.06);
    p.rotation.x = -side * 0.22;
    box(sh, 0.004, 0.08, 0.004, K.G, -0.045, 0.1, side * 0.072).rotation.z = 0.6;
  },
  // Vantage: a slim range-finder pod on top of each shoulder
  sensor(K, sh, side) {
    cbox(sh, 0.07, 0.022, 0.026, 0.006, K.S, 0.01, 0.055, side * 0.05);
    box(sh, 0.004, 0.012, 0.018, K.L, 0.046, 0.055, side * 0.05);
    box(sh, 0.002, 0.05, 0.002, K.M, -0.02, 0.09, side * 0.055);
  },
  // Breaker: a battering ram on each shoulder — a hydraulic cylinder pointing forward with a flat ram head
  ram(K, sh, side, Vk) {
    const z = side * 0.06 * Vk.paul;
    cyl(sh, 0.026, 0.12, K.S, 'x', 0.0, 0.07, z, { seg: 14 });
    cyl(sh, 0.015, 0.06, K.M, 'x', 0.08, 0.07, z, { seg: 10 });
    rbox(sh, 0.026, 0.06, 0.06, 0.006, K.A, 0.12, 0.07, z);
    hazard(K, sh, 0.134, 0.07, z, 0.05, 0.03, 3);
    for (const dz of [-1, 1]) rbox(sh, 0.06, 0.012, 0.012, 0.003, K.D, -0.03, 0.045, z + dz * 0.024);
  },
  // Redoubt: an armoured gun-carriage box with a lamp
  carriage(K, sh, side, Vk) {
    rbox(sh, 0.08, 0.035, 0.11 * Vk.paul, 0.008, K.S, -0.01, 0.075, side * 0.03 * Vk.paul);
    lamp(K, sh, 0.034, 0.075, side * 0.06, 0.012);
  },
  // Bloom: a cluster of glowing pods on the shoulder
  pods(K, sh, side) {
    for (const [x, y, z, r] of [[0.0, 0.06, 0.05, 0.022], [0.025, 0.05, 0.07, 0.016], [-0.025, 0.052, 0.068, 0.017], [0.0, 0.08, 0.075, 0.013]]) {
      ball(sh, r, r, r, K.P, x, y, side * z, 12); ball(sh, r * 0.45, r * 0.45, r * 0.45, K.G, x + r * 0.7, y + r * 0.3, side * z, 8);
    }
  },
  // Sickle: a spiny shell ridge
  spines(K, sh, side) {
    for (let i = 0; i < 3; i++) { const c = cyl(sh, 0.008, 0.05, K.A, 'y', -0.025 + i * 0.022, 0.065, side * 0.05, { rt: 0.0015, seg: 8 }); c.rotation.x = -side * 0.5; c.rotation.z = 0.4; }
  },
  // Hauler: right shoulder carries a crane jib with a hook on a cable; left a winch drum
  crane(K, sh, side) {
    if (side > 0) {
      const a = [-0.02, 0.04, 0.05], b = [0.1, 0.27, 0.05], b2 = [0.1, 0.27, 0.025];
      rod(sh, a, b, 0.006, 0.005, K.A, 6); rod(sh, [a[0], a[1], 0.025], b2, 0.006, 0.005, K.A, 6);
      for (let i = 1; i < 5; i++) { const u = i / 5; rod(sh, [lerp(a[0], b[0], u), lerp(a[1], b[1], u), 0.05], [lerp(a[0], b[0], u + 0.18), lerp(a[1], b[1], u + 0.18), 0.025], 0.003, 0.003, K.A, 5); }
      box(sh, 0.04, 0.03, 0.04, K.S, -0.03, 0.04, 0.035);
      rod(sh, [0.105, 0.27, 0.0375], [0.105, 0.15, 0.0375], 0.0015, 0.0015, K.K, 4);
      const hk = at(sh, 0.105, 0.15, 0.0375); box(hk, 0.014, 0.01, 0.012, K.D, 0, 0, 0); ring(hk, 0.008, 0.0025, K.M, 'z', 0, -0.012, 0);
      lamp(K, sh, 0.11, 0.275, 0.0375, 0.007);
    } else {
      cyl(sh, 0.026, 0.05, K.P, 'z', -0.01, 0.055, side * 0.04, { seg: 12 }); cyl(sh, 0.03, 0.006, K.U, 'z', -0.01, 0.055, side * 0.016, { seg: 12 }); cyl(sh, 0.03, 0.006, K.U, 'z', -0.01, 0.055, side * 0.064, { seg: 12 });
      ring(sh, 0.026, 0.003, K.K, 'z', -0.01, 0.055, side * 0.04);
    }
  },
  // Pogo: a traffic cone for a shoulder pad (one side) and a hubcap (the other)
  junk(K, sh, side) {
    if (side > 0) { cyl(sh, 0.034, 0.06, K.A, 'y', 0, 0.06, side * 0.04, { rt: 0.006, seg: 12 }); box(sh, 0.06, 0.008, 0.06, K.K, 0, 0.03, side * 0.04); ring(sh, 0.022, 0.004, K.S, 'y', 0, 0.065, side * 0.04); }
    else { const c = cyl(sh, 0.04, 0.008, K.M, 'z', 0, 0.025, side * 0.06, { seg: 14 }); c.rotation.y = 0.2; }
  },
};
export const FOREARM = {
  // Vantage: a long scope rail along the forearm
  scope(K, root, side, j, Vk) {
    const g = foreUp(root, j), len = g.userData.len, t = Vk.t;
    cbox(g, t * 0.6, len * 0.8, t * 0.6, t * 0.12, K.S, side * t * 0.8, len * 0.55, t * 0.3);
    cyl(g, t * 0.32, len * 0.25, K.L, 'y', side * t * 0.8, len * 1.0, t * 0.3, { seg: 10 });
  },
  // Rapier: a tonfa blade along the forearm, sticking out past the elbow
  tonfa(K, root, side, j, Vk) {
    const g = foreUp(root, j), len = g.userData.len, t = Vk.t;
    prism(g, `tonfa:${f(len)}`, [[0, len * 0.85], [t * 0.9, len * 0.6], [t * 0.7, -len * 0.55], [0, -len * 0.35]], 0.007, K.A, 0.0015, side * t * 0.7, 0, 0).rotation.y = side > 0 ? 0 : Math.PI;
    box(g, 0.003, len * 0.7, 0.008, K.G, side * t * 0.95, len * 0.1, 0);
  },
  // Redoubt: a mantlet — a big armour slab on the outside of the forearm
  mantlet(K, root, side, j, Vk) {
    const g = foreUp(root, j), len = g.userData.len, t = Vk.t;
    rbox(g, t * 0.45, len * 1.0, t * 2.4, t * 0.1, K.P, side * t * 0.95, len * 0.5, t * 0.2);
    hazard(K, at(g, side * t * 1.2, len * 0.5, t * 0.2, 0, side > 0 ? 0 : Math.PI, 0), 0, 0, 0, len * 0.7, t * 0.4, 4);
  },
  // Sickle: a curved scythe blade folded along the forearm, point toward the elbow
  scythe(K, root, side, j, Vk) {
    const g = foreUp(root, j), len = g.userData.len, t = Vk.t;
    const pts = [[0, len * 1.05]]; for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push([-t * (0.3 + 3.2 * Math.sin(u * Math.PI * 0.85)), len * (1.05 - 1.7 * u)]); }
    for (let i = 10; i >= 0; i--) { const u = i / 10; pts.push([-t * (0.3 + 2.1 * Math.sin(u * Math.PI * 0.85)) * (1 - u * 0.2), len * (1.05 - 1.55 * u)]); }
    const b = prism(g, `scythe:${f(len)}:${f(t)}`, pts, 0.01, K.A, 0.0015, 0, 0, -t * 0.5); b.rotation.y = -Math.PI / 2;   // profile x → down
    box(g, 0.004, len * 0.9, 0.004, K.G, 0, len * 0.35, -t * 0.5 - t * 2.3).rotation.x = 0.0;
    for (let i = 0; i < 4; i++) rod(g, [0, len * (0.15 + i * 0.18), -t * 0.5], [0, len * (0.15 + i * 0.18) - t * 0.4, -t * 1.25], t * 0.14, t * 0.02, K.S, 6);
  },
  // Bloom: a glowing pod cluster on the forearm
  podfore(K, root, side, j, Vk) {
    const g = foreUp(root, j), len = g.userData.len, t = Vk.t;
    for (const [u, r] of [[0.35, 0.8], [0.6, 0.65]]) { ball(g, t * r, t * r, t * r, K.P, side * t * 0.75, len * u, t * 0.3, 12); ball(g, t * r * 0.45, t * r * 0.45, t * r * 0.45, K.G, side * t * 1.3, len * u, t * 0.45, 8); }
  },
  // Hauler: a winch drum and hook cable on the forearm
  winch(K, root, side, j, Vk) {
    const g = foreUp(root, j), len = g.userData.len, t = Vk.t;
    cyl(g, t * 0.75, t * 0.9, K.A, 'x', side * t * 0.9, len * 0.45, 0, { seg: 12 });
    ring(g, t * 0.6, t * 0.12, K.K, 'x', side * t * 0.9, len * 0.45, 0);
  },
};
