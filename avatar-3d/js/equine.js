// EQUINE BODIES (2026-10-05, Thousandvale play-test 4, S22 "mounts still look silly").
//
// The first mounts (mounts.js, Q16) rode creatures.js's generic four-legged body: a capsule barrel, a capsule
// neck sticking out level, a ball head and four two-piece stick legs. That body is right for a wolf or a boar
// and wrong for a horse, whose whole read is its SHAPE — a deep chest and a round rump with a dip between,
// a long neck rising out of the chest and arching, a long head hung at the end of it, and legs that are thick
// at the top, thin and straight below the knee and end in a hoof. This file builds that shape, for every
// hoofed mount (horse, pony, courser, draft/warhorse, elk/stag/dray), and animates it with real gaits.
//
// HOW IT IS BUILT. Barrel, neck and head are each one LOFT: rings of an egg-shaped cross-section (its own
// half-width, height above and depth below the centre line) laid along a line — straight for the barrel and
// the head, a curve for the neck — with the half-width, top and bottom read from a short profile per breed.
// So "the croup is higher than the back" or "the jaw is deep and the muzzle narrow" is one number in a table,
// and the surface is smooth. Coat colour is per VERTEX (the belly colour fades in under the barrel, the
// muzzle darkens, a blaze runs down the face), so a coat is one material.
// Legs are joint chains: shoulder/stifle -> knee/hock -> fetlock -> pastern + hoof, with the forearm and the
// gaskin tapering, a muscle mass at the top that sinks into the barrel, and feathering on heavy breeds.
//
// HOW IT MOVES. One cycle phase; each leg has its own offset in it and a stance share (`duty`):
//   walk   four beats, LH -> LF -> RH -> RF, 62 % of the time on the ground, a small nod of the head
//   trot   diagonal pairs (LF+RH, RF+LH), a bounce at each change
//   gallop the hinds land close together then the fronts, the body rocks nose-up/nose-down, the neck swings
// On the ground a leg sweeps back at an even rate; off it, it swings forward with the knee folding back (front)
// or the hock flexing (hind) and the hoof flipping up. Changing gait crossfades the whole pose over 0.3 s on the
// same phase, so a walk turns into a trot without a hitch. The cycle rate comes from the ground speed and the
// breed's stride, so the hooves keep up with the ground.
//
// TACK. `frame.patch()` returns a piece of the barrel / neck / head surface pushed outward (a saddle blanket,
// a girth band, a crinet, a noseband), so tack is cut from the animal it sits on and fits whatever the breed.
//
//   import { createEquine, EQUINE_BREEDS } from './equine.js';
//   const e = await createEquine({ breed: 'horse', size: 1, colors: { body, belly, accent } });
//   e.setMotion('trot', 3.5);   e.update(dt);    e.parts.hip, e.frame.patch(...)
//
// The handle has the same shape as createCreature's (group, parts, anim, setAnim, setRate, update, metrics,
// dispose), so mounts.js treats it as the creature it rides.

import * as THREE from 'three';

/**
 * Per breed, metres at size 1. H withers height; L barrel length; w barrel half-width; d barrel half-depth;
 * neck: Ln length, up angle above level (rad), arch (crest bulge, m), thick (x); head: Lh length, down (rad below
 * level), wide (x); legK leg thickness; tail Lt (0 = a stub); mane length; hump at the withers; markings.
 */
export const EQUINE_BREEDS = {
  horse:   { H: 1.40, L: 1.42, w: 0.25, d: 0.32, Ln: 0.58, up: 0.95, arch: 0.08, neckK: 1.28, Lh: 0.54, down: 0.92, headK: 1.05, legK: 1.1, Lt: 0.8, mane: 0.11, hump: 0.07, blaze: true, socks: ['BL'], hoof: '#2a2420' },
  pony:    { H: 1.10, L: 1.18, w: 0.26, d: 0.30, Ln: 0.43, up: 0.82, arch: 0.06, neckK: 1.35, Lh: 0.46, down: 0.86, headK: 1.08, legK: 1.25, Lt: 0.66, mane: 0.15, hump: 0.04, forelock: 1.6, blaze: false, socks: [], hoof: '#2e2822' },
  courser: { H: 1.52, L: 1.50, w: 0.22, d: 0.31, Ln: 0.68, up: 1.05, arch: 0.08, neckK: 1.12, Lh: 0.52, down: 0.95, headK: 0.92, legK: 0.95, Lt: 0.86, mane: 0.09, hump: 0.08, tailUp: 0.2, blaze: true, socks: ['FL', 'BL', 'BR'], hoof: '#3a3430' },
  draft:   { H: 1.44, L: 1.62, w: 0.31, d: 0.37, Ln: 0.66, up: 0.88, arch: 0.11, neckK: 1.5, Lh: 0.6, down: 0.98, headK: 1.15, legK: 1.35, Lt: 0.8, mane: 0.13, hump: 0.06, feather: true, blaze: true, socks: [], hoof: '#2a2420' },
  elk:     { H: 1.46, L: 1.42, w: 0.23, d: 0.32, Ln: 0.56, up: 0.72, arch: 0.02, neckK: 1.15, Lh: 0.56, down: 0.78, headK: 0.95, legK: 0.88, Lt: 0, mane: 0, dewlap: 0.12, hump: 0.12, ears: 1.5, antlers: 1, rump: true, hoof: '#2a2420' },
  elk_dray:{ H: 1.46, L: 1.55, w: 0.27, d: 0.35, Ln: 0.58, up: 0.7, arch: 0.03, neckK: 1.35, Lh: 0.6, down: 0.8, headK: 1.05, legK: 1.08, Lt: 0, mane: 0, dewlap: 0.15, hump: 0.14, ears: 1.5, antlers: 1.35, rump: true, feather: true, hoof: '#2a2420' },
};
export const EQUINE_BREED_KEYS = Object.keys(EQUINE_BREEDS);

/**
 * Gaits. duty = share of the cycle a hoof is on the ground; off = each leg's phase offset (FL FR BL BR);
 * A hip sweep, K knee/hock fold, F fetlock flip (rad); bob body bounce (m) and bobN bounces a cycle; pitch body rock;
 * nod neck swing; stride = metres a cycle at size 1 and H 1.4.
 */
const GAITS = {
  walk:   { duty: 0.62, off: [0.25, 0.75, 0.0, 0.5], A: 0.30, K: 1.0, F: 0.8, bob: 0.014, bobN: 2, pitch: 0.012, nod: 0.07, stride: 1.55, fMin: 0.6, fMax: 1.25 },
  trot:   { duty: 0.44, off: [0.0, 0.5, 0.5, 0.0], A: 0.40, K: 1.35, F: 1.1, bob: 0.035, bobN: 2, pitch: 0.015, nod: 0.03, stride: 2.5, fMin: 1.0, fMax: 1.9 },
  gallop: { duty: 0.36, off: [0.52, 0.62, 0.0, 0.1], A: 0.58, K: 1.6, F: 1.25, bob: 0.06, bobN: 1, pitch: 0.075, nod: 0.16, stride: 4.3, fMin: 1.35, fMax: 2.4 },
};

// ------------------------------------------------------------------------------------------------ helpers
const smooth = t => t * t * (3 - 2 * t);
const gauss = (u, c, s) => Math.exp(-(((u - c) / s) ** 2));
/** Catmull-Rom through sorted control points [[u, v], ...], clamped at both ends. */
function profile(pts) {
  return u => {
    if (u <= pts[0][0]) return pts[0][1];
    if (u >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 0; while (u > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(pts.length - 1, i + 2)][1];
    const t = (u - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
}
/** Rounded end caps: 1 in the middle, falling to 0 at u = 0 and 1 (p: higher = a blunter end). */
const cap = (u, p) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), p)), 1 / p);
const col = hex => new THREE.Color(hex);
function shade(hex, k) { const c = new THREE.Color(hex); if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k); else c.multiplyScalar(1 + k); return '#' + c.getHexString(); }

/**
 * A loft: `ring(u)` -> { c: [x,y,z], n: [x,y,z] dorsal unit, b: [x,y,z] side unit, rx, top, bot } for u in 0..1.
 * Ring point at angle a (0 = the +b side, PI/2 = dorsal): c + b * rx cos a + n * (sin a > 0 ? top : bot) sin a.
 * `colour(u, a, x, y)` -> THREE.Color per vertex. `push` scales the cross-section (tack patches), and
 * u0..u1 / a0..a1 cut a patch out of the surface.
 */
function loft(ring, { rows = 32, cols = 24, colour = null, push = 1, u0 = 0, u1 = 1, a0 = 0, a1 = Math.PI * 2, closed = true, uDist = null } = {}) {
  const pos = [], cols3 = [], idx = [];
  const nc = closed ? cols : cols + 1;
  for (let r = 0; r <= rows; r++) {
    let t = r / rows; if (uDist) t = uDist(t);
    const u = u0 + (u1 - u0) * t, R = ring(u);
    for (let k = 0; k < nc; k++) {
      const a = a0 + (a1 - a0) * (k / cols), ca = Math.cos(a), sa = Math.sin(a);
      const vy = (sa > 0 ? R.top : R.bot) * sa * push, vx = R.rx * ca * push;
      const x = R.c[0] + R.b[0] * vx + R.n[0] * vy, y = R.c[1] + R.b[1] * vx + R.n[1] * vy, z = R.c[2] + R.b[2] * vx + R.n[2] * vy;
      pos.push(x, y, z);
      if (colour) { const cc = colour(u, a, vx, vy); cols3.push(cc.r, cc.g, cc.b); }
    }
  }
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const a = r * nc + k, b = r * nc + (closed ? (k + 1) % cols : k + 1), c = a + nc, d = b + nc;
    idx.push(a, b, c, b, d, c);   // outward faces (b x n = t, rows along t)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (colour) g.setAttribute('color', new THREE.Float32BufferAttribute(cols3, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** A tapered limb piece hanging from its origin along -y. */
function taper(rTop, rBot, len, segs, flatX = 1) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, segs, 1, false);
  g.translate(0, -len / 2, 0); g.scale(flatX, 1, 1);
  return g;
}

/**
 * Build an equine body. spec: { breed, size, colors: {body, belly, accent}, seed, markings? }.
 * -> creature-shaped handle (see the file header) + `frame` for tack and `breed`.
 */
export async function createEquine(spec = {}, { detail = 1 } = {}) {
  const key = EQUINE_BREEDS[spec.breed] ? spec.breed : 'horse';
  const Bd = EQUINE_BREEDS[key], S = spec.size || 1;
  const C = { body: '#6a4a32', belly: '#8a6a4a', accent: '#2a1e16', ...(spec.colors || {}) };
  const D = Math.max(0.35, Math.min(1, detail));
  const n = (v, m) => Math.max(m, Math.round(v * D));
  const isElk = key.startsWith('elk');
  const disposables = [];
  const MATS = new Map();
  function mat(colour, { vc = false, rough = 0.72, metal = 0, side = THREE.FrontSide } = {}) {
    const k = colour + vc + rough + side;
    if (!MATS.has(k)) { const m = new THREE.MeshStandardMaterial({ color: vc ? 0xffffff : col(colour), vertexColors: vc, roughness: rough, metalness: metal, side }); MATS.set(k, m); }
    return MATS.get(k);
  }
  function mesh(geo, colour, o) { const m = new THREE.Mesh(geo, mat(colour, o)); m.castShadow = true; disposables.push(geo); return m; }

  const group = new THREE.Group(); group.userData.character = true; group.name = 'equine-' + key;
  const root = new THREE.Group(); root.scale.setScalar(S); group.add(root);
  const { H, L, w, d } = Bd;
  const bodyY = H - d * (1 + Bd.hump * 0.6);
  const hip = new THREE.Group(); hip.position.y = bodyY; root.add(hip);

  const cBody = col(C.body), cBelly = col(C.belly), cMuzzle = col(shade(C.body, isElk ? -0.45 : -0.35)), cWhite = col('#ece6dc');
  const cRump = col(shade(C.belly, 0.35));

  // ---- the barrel ----------------------------------------------------------------------------------------
  // u = 0 at the rump, 1 at the chest. Croup high at 0.2, the back dips at the saddle (0.45), the withers rise at
  // 0.72; the chest is deepest under the withers and the belly tucks up toward the flank.
  const bW = profile([[0, 0.9], [0.18, 1.05], [0.45, 0.96], [0.72, 1.0], [1, 0.88]]);
  const bodyRing = u => {
    const cp = cap(u, 2.4);
    const top = d * cp * (0.9 + 0.09 * gauss(u, 0.2, 0.12) - 0.03 * gauss(u, 0.46, 0.1) + Bd.hump * 1.2 * gauss(u, 0.74, 0.1));
    const bot = d * cp * (0.95 + 0.12 * gauss(u, 0.72, 0.16) - 0.16 * gauss(u, 0.14, 0.12));
    return { c: [0, 0, -L / 2 + u * L], n: [0, 1, 0], b: [1, 0, 0], rx: w * bW(u) * cp, top, bot };
  };
  const bodyColour = (u, a, vx, vy) => {
    const c = cBody.clone();
    const belly = smooth(Math.max(0, Math.min(1, (-vy / d - 0.25) / 0.5)));
    c.lerp(cBelly, belly);
    if (Bd.rump && u < 0.12 && vy > -d * 0.4) c.lerp(cRump, smooth(Math.min(1, (0.12 - u) / 0.07)));
    return c;
  };
  const uDist = t => 0.5 - 0.5 * Math.cos(t * Math.PI);   // rows bunch at the ends so the caps stay round
  const barrel = mesh(loft(bodyRing, { rows: n(36, 14), cols: n(28, 12), colour: bodyColour, uDist }), C.body, { vc: true });
  hip.add(barrel);

  // ---- the neck: a curve from inside the chest up to the poll, deep and flat-sided ----------------------
  const neck = new THREE.Group(); neck.position.set(0, d * 0.26, L * 0.34); hip.add(neck);
  const up = Bd.up, Ln = Bd.Ln;
  const dir = [0, Math.sin(up), Math.cos(up)], dors = [0, Math.cos(up), -Math.sin(up)];
  const P0 = [0, -dir[1] * 0.14, -dir[2] * 0.14], P2 = [0, dir[1] * Ln, dir[2] * Ln];
  const P1 = [0, (P0[1] + P2[1]) / 2 + dors[1] * Bd.arch * 2, (P0[2] + P2[2]) / 2 + dors[2] * Bd.arch * 2];
  const bez = t => [0, (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1], (1 - t) ** 2 * P0[2] + 2 * (1 - t) * t * P1[2] + t * t * P2[2]];
  const bezT = t => { const y = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]), z = 2 * (1 - t) * (P1[2] - P0[2]) + 2 * t * (P2[2] - P1[2]); const l = Math.hypot(y, z) || 1; return [0, y / l, z / l]; };
  const nk = Bd.neckK;
  const nW = profile([[0, 0.22], [0.3, 0.155], [0.75, 0.112], [1, 0.098]]);
  const nTop = profile([[0, 0.13], [0.5, 0.095], [1, 0.078]]);
  const nBot = profile([[0, 0.3], [0.35, 0.19], [0.8, 0.12], [1, 0.1]]);
  const neckRing = u => { const c = bez(u), t = bezT(u); return { c, n: [0, t[2], -t[1]], b: [1, 0, 0], rx: nW(u) * nk, top: nTop(u) * nk, bot: nBot(u) * nk }; };
  const neckColour = (u, a, vx, vy) => { const c = cBody.clone(); if (vy < 0) c.lerp(cBelly, smooth(Math.min(1, -vy / 0.25)) * 0.35 * (1 - u)); return c; };
  neck.add(mesh(loft(neckRing, { rows: n(20, 8), cols: n(22, 10), colour: neckColour }), C.body, { vc: true }));

  // ---- the head: hung at the poll, pitched down; deep at the jaw, narrow to a soft muzzle ------------------
  const head = new THREE.Group(); head.position.set(0, P2[1] + 0.01, P2[2]); neck.add(head);
  head.rotation.x = Bd.down - up + 0.0;                 // the head's own pitch is relative to the neck group
  const headRest = head.rotation.x;
  const Lh = Bd.Lh * 1.08, hk = Bd.headK * 1.2;           // a touch big for the head: these carry Chibi 2 riders
  const hW = profile([[0, 0.07], [0.22, 0.112], [0.55, 0.082], [0.86, 0.074], [1, 0.07]]);
  const hTop = profile([[0, 0.06], [0.2, 0.072], [0.6, 0.052], [1, 0.048]]);
  const hBot = profile(isElk ? [[0, 0.09], [0.22, 0.15], [0.55, 0.085], [1, 0.062]] : [[0, 0.09], [0.22, 0.17], [0.5, 0.1], [0.86, 0.074], [1, 0.07]]);
  const headRing = u => { const cp = cap(u, 3.2); return { c: [0, 0, -0.06 + u * Lh], n: [0, 1, 0], b: [1, 0, 0], rx: hW(u) * hk * cp, top: hTop(u) * hk * cp, bot: hBot(u) * hk * cp }; };
  const blaze = Bd.blaze;
  const headColour = (u, a, vx, vy) => {
    const c = cBody.clone();
    c.lerp(cMuzzle, smooth(Math.max(0, Math.min(1, (u - 0.7) / 0.2))));
    if (blaze && vy > 0 && Math.abs(vx) < 0.028 && u > 0.18 && u < 0.92) c.copy(cWhite);
    return c;
  };
  head.add(mesh(loft(headRing, { rows: n(22, 9), cols: n(22, 10), colour: headColour, uDist }), C.body, { vc: true }));
  // eyes, nostrils, ears
  const at = u => headRing(u);
  for (const sx of [-1, 1]) {
    const R = at(0.3);
    const eye = mesh(new THREE.SphereGeometry(0.024 * hk, n(10, 6), n(8, 5)), '#120c08', { rough: 0.25 });
    eye.position.set(sx * R.rx * 0.9, R.top * 0.45, R.c[2]); eye.scale.set(0.6, 1, 1.15); head.add(eye);
    const lid = mesh(new THREE.SphereGeometry(0.027 * hk, n(10, 6), n(6, 4), 0, Math.PI * 2, 0, Math.PI / 2), shade(C.body, -0.15));
    lid.position.copy(eye.position); lid.position.y += 0.004; lid.scale.set(0.7, 0.55, 1.2); lid.rotation.z = -sx * 0.25; head.add(lid);
    const Rm = at(0.95);
    const nos = mesh(new THREE.SphereGeometry(0.017 * hk, n(8, 5), n(6, 4)), '#1a1210', { rough: 0.4 });
    nos.position.set(sx * Rm.rx * 0.6, Rm.top * 0.1, Rm.c[2] + 0.005); nos.scale.set(0.8, 0.6, 1); head.add(nos);
    // ears: up in the world, so turned back against the head's pitch, leaning a touch forward and out
    const ek = (Bd.ears || 1) * hk;
    const ear = new THREE.Group(); ear.position.set(sx * 0.05 * hk, hTop(0) * hk * 0.8, 0.0); ear.rotation.set(-Bd.down + 0.3, 0, -sx * (isElk ? 0.75 : 0.22)); head.add(ear);
    const eg = new THREE.ConeGeometry(0.033 * ek, 0.12 * ek, n(8, 5)); eg.translate(0, 0.06 * ek, 0); eg.scale(1, 1, 0.55);
    const em = mesh(eg, C.body); ear.add(em);
    const ig = new THREE.ConeGeometry(0.02 * ek, 0.09 * ek, n(6, 4)); ig.translate(0, 0.05 * ek, 0); ig.scale(1, 1, 0.3);
    const inner = mesh(ig, shade(C.body, -0.45)); inner.position.z = 0.008; ear.add(inner);
    head.userData['ear' + (sx < 0 ? 'L' : 'R')] = ear;
  }
  // mouth line
  { const R = at(0.86); const mouth = mesh(new THREE.BoxGeometry(R.rx * 1.9, 0.006, Lh * 0.18), '#1a1210'); mouth.position.set(0, -R.bot * 0.55, R.c[2]); head.add(mouth); }

  // ---- mane, forelock, dewlap ---------------------------------------------------------------------------
  const hair = C.hair || C.accent, hair2 = shade(hair, -0.15);   // mane + tail (a warhorse's accent is its cloth)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
  function card(parent, pos, tangent, normal, w3, h3, len3, lean, colour) {
    // a hair card at pos, running along `tangent`, standing out along `normal`, leaning `lean` rad toward +x
    const t = new THREE.Vector3(...tangent).normalize(), nn = new THREE.Vector3(...normal).normalize();
    const b = new THREE.Vector3().crossVectors(nn, t).normalize();
    nn.applyAxisAngle(t, -lean); b.applyAxisAngle(t, -lean);
    _m.makeBasis(b, nn, t); _q.setFromRotationMatrix(_m);
    const g = new THREE.BoxGeometry(w3, h3, len3); g.translate(0, h3 / 2, 0);
    const m = mesh(g, colour); m.position.set(...pos); m.quaternion.copy(_q); parent.add(m); return m;
  }
  if (Bd.mane > 0) {
    // the mane: one sheet over the crest, falling to the right side; a ridge stands up along the top and the
    // lower edge is cut into locks (the push swells and dips with u)
    const crest = profile([[0, 0.3], [0.08, 0.9], [0.5, 1], [0.92, 0.85], [1, 0.4]]);
    const maneRing = u => { const R = neckRing(u); return { ...R, rx: R.rx * 1.05, top: R.top + Bd.mane * 0.55 * crest(u), bot: R.bot * 1.05 }; };
    const mg = loft(u => maneRing(u), { rows: n(26, 10), cols: n(12, 6), u0: 0.02, u1: 0.99, a0: Math.PI / 2 - 1.25 - Bd.mane, a1: Math.PI / 2 + 0.55, closed: false });
    neck.add(mesh(mg, hair, { side: THREE.DoubleSide, rough: 0.9 }));
    // forelock: hangs down the forehead (along the head's +z, which points down-forward)
    const F = Bd.forelock || 1;
    for (const [dx, k] of [[-0.022, 0.9], [0.0, 1.1], [0.022, 0.85]]) {
      const g = new THREE.BoxGeometry(0.035, 0.016, 0.12 * F * k); g.translate(0, 0, 0.06 * F * k);
      const m = mesh(g, hair); m.position.set(dx, hTop(0.05) * hk + 0.012, 0.0); m.rotation.set(0.15, dx * 6, 0); head.add(m);
    }
  }
  if (Bd.dewlap) {
    const N = n(8, 5);
    for (let i = 0; i < N; i++) {
      const u = 0.15 + (i / (N - 1)) * 0.7, R = neckRing(u), t = bezT(u);
      const pos = [0, R.c[1] - R.n[1] * (R.bot - 0.02), R.c[2] - R.n[2] * (R.bot - 0.02)];
      card(neck, pos, t, [0, -R.n[1], -R.n[2]], 0.09 * nk, Bd.dewlap * (0.6 + 0.5 * Math.sin(i * 1.9) ** 2), (Ln * 0.7 / N) * 1.5, 0, i % 2 ? shade(C.body, -0.25) : shade(C.body, -0.35));
    }
    // a darker shaggy collar round the neck root
    const collar = mesh(loft(u => { const R = neckRing(u * 0.4); return { ...R, rx: R.rx * 1.06, top: R.top * 1.08, bot: R.bot * 1.06 }; }, { rows: n(8, 4), cols: n(20, 10) }), shade(C.body, -0.3));
    neck.add(collar);
  }
  if (Bd.antlers) {
    const ak = Bd.antlers, ac = shade(C.belly, 0.25);
    for (const sx of [-1, 1]) {
      const base = new THREE.Group(); base.position.set(sx * 0.045 * hk, hTop(0.08) * hk, 0.03); base.rotation.set(-Bd.down + 0.15, 0, -sx * 0.62); head.add(base);
      // the beam: three bends up and back; tines forward off it
      let parent = base; const segs = [[0.17, 0.05], [0.16, -0.3], [0.14, -0.25], [0.11, 0.2]];
      segs.forEach(([len, bend], i) => {
        const L2 = len * ak, r0 = 0.022 * ak * (1 - i * 0.18), r1 = r0 * 0.82;
        const g = new THREE.CylinderGeometry(r1, r0, L2, n(7, 5)); g.translate(0, L2 / 2, 0);
        const seg = mesh(g, ac); seg.rotation.x = bend; parent.add(seg);
        if (i > 0) {
          const tg = new THREE.ConeGeometry(r1 * 0.8, 0.13 * ak * (1 - i * 0.1), n(6, 4)); tg.translate(0, 0.065 * ak, 0);
          const tine = mesh(tg, ac); tine.position.y = L2 * 0.4; tine.rotation.set(1.15, 0, sx * 0.2 * i); seg.add(tine);
        }
        const nxt = new THREE.Group(); nxt.position.y = L2; seg.add(nxt); parent = nxt;
      });
      const tip = mesh(new THREE.ConeGeometry(0.014 * ak, 0.08 * ak, n(6, 4)), ac); tip.position.y = 0.04 * ak; parent.add(tip);
    }
  }

  // ---- the tail -------------------------------------------------------------------------------------------
  const tail = new THREE.Group(); tail.position.set(0, d * 0.62, -L / 2 + 0.03); hip.add(tail);
  const tailRest = Bd.Lt ? 0.3 - (Bd.tailUp || 0) : -0.4;
  tail.rotation.x = tailRest;
  const dock = mesh(taper(0.05, 0.035, Bd.Lt ? 0.17 : 0.12, n(8, 5)), C.body); tail.add(dock);
  let tailHair = null, tailTip = null;
  if (Bd.Lt) {
    tailHair = new THREE.Group(); tailHair.position.y = -0.12; tail.add(tailHair);
    const plume = (len, r0, r1, rMid) => {
      const pts = []; for (let i = 0; i <= 8; i++) { const v = i / 8; pts.push(new THREE.Vector2(Math.max(0.004, r0 + (r1 - r0) * v + rMid * Math.sin(Math.PI * v)), -len * v)); }
      const g = new THREE.LatheGeometry(pts, n(10, 6)); g.scale(0.72, 1, 1); return g;
    };
    const L1 = Bd.Lt * 0.48, L2 = Bd.Lt * 0.56;
    tailHair.add(mesh(plume(L1, 0.05, 0.09, 0.035), hair));
    tailTip = new THREE.Group(); tailTip.position.y = -L1 * 0.96; tailHair.add(tailTip);
    tailTip.add(mesh(plume(L2, 0.09, 0.008, 0.035), hair2));
  } else if (Bd.rump) {
    const puff = mesh(new THREE.SphereGeometry(0.05, n(8, 5), n(6, 4)), shade(C.belly, 0.35)); puff.position.y = -0.1; puff.scale.set(0.8, 1.2, 0.6); tail.add(puff);
  }

  // ---- legs ------------------------------------------------------------------------------------------------
  const lk = Bd.legK, segs = n(10, 6);
  const kneeH = H * 0.31, hockH = H * 0.42, fetH = H * 0.085, hoofH = 0.075, PAST = 0.42;
  const legs = [];
  const lower = shade(C.body, -0.12), sock = '#ece6dc';
  const socks = new Set(Bd.socks || []);
  for (const tag of ['FL', 'FR', 'BL', 'BR']) {
    const front = tag[0] === 'F', sx = tag[1] === 'L' ? -1 : 1;
    const legCol = socks.has(tag) ? sock : lower;
    const pivot = new THREE.Group();
    const py = front ? -d * 0.28 : -d * 0.02, pz = front ? L * 0.3 : -L * 0.3;
    pivot.position.set(sx * w * 0.56, py, pz); hip.add(pivot);
    const topY = bodyY + py;                                     // pivot height above the ground (size 1)
    let a1, rest = 0, midRest = 0;
    if (front) a1 = topY - kneeH;
    else { const hb = 0.13 * (H / 1.4); a1 = Math.hypot(topY - hockH, hb); rest = Math.atan2(hb, topY - hockH); midRest = -rest; }
    // muscle mass at the top (sinks into the barrel and moves with the leg), then the forearm / gaskin
    const mass = mesh(new THREE.SphereGeometry(1, n(14, 7), n(10, 5)), C.body);
    if (front) { mass.scale.set(w * 0.46, a1 * 0.42, 0.14 * lk); mass.position.set(-sx * 0.02, -a1 * 0.04, 0.02); }
    else { mass.scale.set(w * 0.52, a1 * 0.46, 0.19 * lk); mass.position.set(-sx * 0.025, a1 * 0.02, -0.02); }
    pivot.add(mass);
    const fore = mesh(taper(0.09 * lk, 0.056 * lk, a1 * 0.72, segs, 0.82), C.body); fore.position.y = -a1 * 0.28; pivot.add(fore);
    const mid = new THREE.Group(); mid.position.y = -a1; pivot.add(mid);
    const joint = mesh(new THREE.SphereGeometry(front ? 0.056 * lk : 0.06 * lk, segs, n(8, 5)), front ? lower : C.body);
    if (!front) { joint.scale.set(0.8, 1, 1.3); joint.position.z = -0.012; }
    mid.add(joint);
    const a2 = (front ? kneeH : hockH) - fetH;
    const cannon = mesh(taper(0.05 * lk, 0.044 * lk, a2, segs, 0.82), lower); mid.add(cannon);
    const fet = new THREE.Group(); fet.position.y = -a2; mid.add(fet);
    { const fb = mesh(new THREE.SphereGeometry(0.052 * lk, segs, n(8, 5)), legCol); fb.scale.set(0.9, 1, 1.1); fet.add(fb); }
    const pastern = new THREE.Group(); pastern.rotation.x = -PAST; fet.add(pastern);
    const a3 = (fetH - hoofH) / Math.cos(PAST);
    pastern.add(mesh(taper(0.044 * lk, 0.05 * lk, a3, segs, 0.88), legCol));
    const hoofG = new THREE.CylinderGeometry(0.054 * lk, 0.07 * lk, hoofH, n(12, 6)); hoofG.translate(0, -hoofH / 2, 0); hoofG.scale(0.92, 1, 1.12);
    const hoof = mesh(hoofG, Bd.hoof || '#2a2420', { rough: 0.55 }); hoof.position.y = -a3; hoof.rotation.x = PAST; hoof.position.z = 0.0; pastern.add(hoof);
    if (Bd.feather) {
      // feathering: a soft bell of long hair from the fetlock over the hoof, longer at the back
      const fp = [[0.046, 0.05], [0.062, 0.0], [0.08, -0.06], [0.088, -0.1], [0.07, -0.11]].map(([r, y]) => new THREE.Vector2(r * lk, y));
      const fg = new THREE.LatheGeometry(fp, n(14, 8)); fg.scale(1, 1, 1.15); fg.translate(0, 0, -0.012);
      const fm = mesh(fg, shade(C.belly, 0.3), { side: THREE.DoubleSide, rough: 0.95 }); fm.rotation.x = PAST * 0.5; fet.add(fm);
    }
    legs.push({ tag, front, left: sx < 0, pivot, mid, fet, rest, midRest, a1 });
  }

  // ---- tack frame ------------------------------------------------------------------------------------------
  const SADDLE_U = 0.55;
  const frame = {
    breed: key, size: S, bodyY, L, w, d,
    saddleU: SADDLE_U,
    /** hip-space z of barrel parameter u, and the barrel's cross-section there */
    ringAt: u => bodyRing(u),
    zAt: u => -L / 2 + u * L,
    neckRing, headRing, neckLen: Ln, headLen: Lh,
    /**
     * A tack patch: part of a surface pushed out. on: 'body' | 'neck' | 'head'; u0..u1 along it, a0..a1 round it
     * (PI/2 = the top); returns a BufferGeometry in that part's space (hip / neck / head).
     */
    patch({ on = 'body', u0 = 0, u1 = 1, a0 = 0, a1 = Math.PI, push = 1.03, rows = 8, cols = 16, closed = false } = {}) {
      const ring = on === 'neck' ? neckRing : on === 'head' ? headRing : bodyRing;
      return loft(ring, { rows: n(rows, 3), cols: n(cols, 6), push, u0, u1, a0, a1, closed });
    },
  };

  // ---- animation -------------------------------------------------------------------------------------------
  const state = { anim: 'idle', style: 'idle', from: null, blend: 1, phase: 0, freq: 1, t: 0, rate: 1, dead: 0, speed: 0 };
  const POSE_N = 4 * 3 + 6;
  const poseA = new Float32Array(POSE_N), poseB = new Float32Array(POSE_N);
  function evalPose(style, out) {
    const T = state.t;
    out.fill(0);
    if (style === 'idle' || !GAITS[style]) {
      const shift = Math.sin(T * 0.5) * 0.03;
      legs.forEach((lg, i) => { out[i * 3] = (lg.left ? shift : -shift) * (lg.front ? 1 : 0.6); });
      out[12] = Math.sin(T * 1.6) * 0.004;                       // breathing bob
      out[13] = 0;
      out[14] = 0.06 + Math.sin(T * 0.37) * 0.07 + Math.max(0, Math.sin(T * 0.11)) * 0.12;   // the head drifts down, sometimes to graze height
      out[15] = Math.sin(T * 0.7) * 0.05;
      out[16] = Math.sin(T * 1.25) * 0.12 + Math.sin(T * 3.1) * 0.03;   // tail swish (z)
      out[17] = 0;
      return;
    }
    const G = GAITS[style], ph = state.phase;
    legs.forEach((lg, i) => {
      const p = (ph + G.off[i]) % 1;
      let hipA, midA = 0, fetA = 0;
      if (p < G.duty) {
        const s = p / G.duty;
        hipA = -G.A + 2 * G.A * s;
        fetA = -0.18 * Math.sin(Math.PI * s);                    // the fetlock sinks as the weight comes over it
      } else {
        const s = (p - G.duty) / (1 - G.duty), lift = Math.sin(Math.PI * s), e = smooth(s);
        hipA = G.A - 2 * G.A * e - (lg.front ? 0.18 : 0.08) * lift;
        midA = (lg.front ? G.K : -G.K * 0.45) * Math.sin(Math.PI * Math.min(1, s * 1.15));
        fetA = G.F * lift;
      }
      out[i * 3] = hipA; out[i * 3 + 1] = midA; out[i * 3 + 2] = fetA;
    });
    const c = ph * Math.PI * 2;
    out[12] = G.bob * (G.bobN === 2 ? -Math.cos(c * 2) : -Math.cos(c - 0.6));
    out[13] = G.pitch * Math.sin(c + (style === 'gallop' ? 0.9 : 0));
    out[14] = G.nod * Math.sin(c * (style === 'gallop' ? 1 : 2) + 0.4) + (style === 'gallop' ? 0.12 : 0.03);
    out[15] = style === 'gallop' ? -0.08 : 0;
    out[16] = Math.sin(c) * (style === 'walk' ? 0.08 : 0.04);
    out[17] = style === 'gallop' ? -0.55 : style === 'trot' ? -0.2 : 0;   // the tail lifts and streams at speed
  }
  function apply(p) {
    legs.forEach((lg, i) => {
      lg.pivot.rotation.x = lg.rest + p[i * 3];
      lg.mid.rotation.x = lg.midRest + p[i * 3 + 1];
      lg.fet.rotation.x = p[i * 3 + 2];
    });
    hip.position.y = bodyY + p[12];
    hip.rotation.x = p[13];
    neck.rotation.x = p[14];
    head.rotation.x = headRest + p[15];
    tail.rotation.set(tailRest + p[17], 0, p[16]);
    if (tailHair) tailHair.rotation.set(-p[17] * 0.5, 0, p[16] * 0.8);
    if (tailTip) tailTip.rotation.set(-p[17] * 0.4, 0, p[16] * 1.2);
  }
  function setStyle(next) {
    if (next === state.style) return;
    state.from = state.style; state.style = next; state.blend = 0;
  }
  function setAnim(name) {
    if (name === state.anim) return;
    state.anim = name;
    if (name === 'run') setStyle('gallop');
    else if (name === 'walk') setStyle(state.style === 'trot' ? 'trot' : 'walk');
    else if (name !== 'dead') setStyle('idle');
  }
  const strideK = H / 1.4;
  function update(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    state.t += dt;
    const G = GAITS[state.style];
    if (G) {
      const f = state.speed > 0 ? state.speed / (G.stride * strideK * S) : G.fMin * state.rate;
      state.freq = Math.max(G.fMin, Math.min(G.fMax, f));
      state.phase = (state.phase + state.freq * dt) % 1;
    }
    state.blend = Math.min(1, state.blend + dt / 0.3);
    evalPose(state.style, poseA);
    if (state.blend < 1 && state.from) {
      evalPose(state.from, poseB);
      const k = smooth(state.blend);
      for (let i = 0; i < POSE_N; i++) poseA[i] = poseB[i] + (poseA[i] - poseB[i]) * k;
    }
    // dead: lie down on the near side
    state.dead += ((state.anim === 'dead' ? 1 : 0) - state.dead) * Math.min(1, dt * 3);
    if (state.dead > 0.001) {
      for (let i = 0; i < 12; i += 3) { poseA[i] = poseA[i] * (1 - state.dead) + 0.25 * state.dead; poseA[i + 1] *= 1 - state.dead; }
      poseA[14] = poseA[14] * (1 - state.dead) - 0.5 * state.dead;
    }
    apply(poseA);
    root.rotation.z = state.dead * Math.PI * 0.47;
    root.position.y = state.dead * (w * 0.9 - 0.0) * S - state.dead * bodyY * 0.0;
    // ear flicks
    const eL = head.userData.earL, eR = head.userData.earR;
    if (eL && eR) { eL.rotation.y = Math.max(0, Math.sin(state.t * 0.9)) ** 8 * 0.6; eR.rotation.y = -(Math.max(0, Math.sin(state.t * 0.7 + 2)) ** 8) * 0.6; }
  }
  apply(new Float32Array(POSE_N));

  return {
    group, frame, breed: key,
    get anim() { return state.anim; },
    get style() { return state.style; },
    get phase() { return state.phase; },
    setAnim,
    /** gait 'idle' | 'walk' | 'trot' | 'gallop', ground speed m/s: picks the leg pattern and the cadence. */
    setMotion(gait, speed = 0) {
      state.speed = Math.abs(+speed || 0);
      if (gait === 'gallop') { state.anim = 'run'; setStyle('gallop'); }
      else if (gait === 'walk' || gait === 'trot') { state.anim = 'walk'; setStyle(gait); }
      else { state.anim = 'idle'; setStyle('idle'); }
    },
    setRate(r) { state.rate = Math.max(0.15, Math.min(3, Number(r) || 1)); },
    get rate() { return state.rate; },
    get parts() { return { hip, bodyY, neck, head, legs, tail, root }; },
    metrics() { const b = new THREE.Box3().setFromObject(group); return { height: b.max.y - b.min.y, length: b.max.z - b.min.z, width: b.max.x - b.min.x }; },
    update,
    dispose() { for (const g of disposables) g.dispose(); for (const m of MATS.values()) m.dispose(); MATS.clear(); },
    /** for tack built by mounts.js: a material from this body's cache (disposed with it) */
    _mesh: mesh,
  };
}
