// EQUINE BODIES (2026-10-05, Thousandvale play-test 4, S22 "mounts still look silly"; rebuilt 2026-10-07 for
// play-test W3, report #24: "The horse still looks bad: conical neck, bulging eyes. Make horses more realistic,
// even for a cartoon game").
//
// One body for every hoofed mount (horse, pony, courser, draft/warhorse, elk/stag/dray), drawn from the outline of
// a real horse and animated with real gaits.
//
// WHAT IT IS MADE OF
//   barrel   one LOFT from the buttock to the breast: rings of an egg-shaped cross-section (its own half-width,
//            height above and depth below the centre line, and how boxy or peaked it is) read from short profiles.
//            Croup, the dip of the back, the withers, the deep girth behind the elbow, the belly line and the
//            tuck of the flank are each one number in a table.
//   neck     NOT a tube round a line (that is what made it a cone). It is the space between TWO curves in the
//            side view: the CREST on top, which leaves the withers and arches over to the poll, and the THROAT
//            line beneath, which leaves the breast and runs up to the jaw. Deep where it joins the chest, half as
//            deep at the throat, and flat-sided all the way (a horse's neck is about a third as wide as it is deep).
//   head     a loft hung from the poll, pitched down: flat forehead, a deep round jaw and cheek, a long nose
//            tapering to a slightly fuller muzzle with a chin. The eyes are small dark almonds sunk INTO the side
//            of the skull under a brow, the nostrils are matte slits on the nose end, the ears stand upright.
//   legs     joint chains: shoulder / haunch mass -> forearm / gaskin -> knee / hock -> cannon -> fetlock ->
//            sloping pastern -> hoof. Each long bone is its own small loft, so the forearm carries its muscle, the
//            hock has its point at the back and the cannon has its tendon. Dark "points" fade in down the leg.
//   hair     a mane over the crest that falls in locks on the off side, a forelock between the ears, and a tail
//            that leaves the croup on a short dock and hangs full to below the hocks.
// Coat colour is per VERTEX, and every rigid piece (a head with its ears, lids and nostrils; a lower leg with its
// joint) is merged into ONE mesh, so a horse is about twenty draw calls and three materials.
//
// HOW IT MOVES. One cycle phase; each leg has its own offset in it and a stance share (`duty`):
//   walk   four beats, LH -> LF -> RH -> RF, 62 % of the time on the ground, a small nod of the head
//   trot   diagonal pairs (LF+RH, RF+LH), a bounce at each change
//   gallop the hinds land close together then the fronts, the body rocks nose-up/nose-down, the neck swings
// On the ground a leg sweeps back at an even rate; off it, it swings forward with the knee folding back (front)
// or the hock flexing (hind) and the hoof flipping up. Changing gait crossfades the whole pose over 0.3 s on the
// same phase, so a walk turns into a trot without a hitch. The cycle rate comes from the ground speed and the
// breed's stride, so the hooves keep up with the ground. The neck, head, mane and bridle are one unit that nods
// from a pivot buried in the chest.
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
 * Per breed, metres at size 1. H withers height (exact: the top of the withers stands at H); L barrel length,
 * buttock to breast (about H on a horse); w barrel half-width; d barrel half-depth (the chest is about 0.45 H deep,
 * which leaves the legs a little over half the height).
 * neck: Ln length from its root in the chest to the poll, `up` its rise above level (rad; 0.8 = 46 degrees),
 * arch (how far the crest bows, m), neckK thickness; head: Lh length (about 0.4 H), `down` its pitch below level
 * (rad), headK width/depth; legK leg thickness; tail Lt (0 = a stub); mane length; hump at the withers; markings.
 */
export const EQUINE_BREEDS = {
  horse:   { H: 1.40, L: 1.42, w: 0.245, d: 0.32, Ln: 0.74, up: 0.80, arch: 0.07, neckK: 1.0, Lh: 0.54, down: 0.95, headK: 1.0, legK: 1.0, Lt: 0.86, mane: 0.10, hump: 0.07, blaze: true, socks: ['BL'], hoof: '#2a2420' },
  pony:    { H: 1.10, L: 1.18, w: 0.25, d: 0.29, Ln: 0.56, up: 0.72, arch: 0.06, neckK: 1.1, Lh: 0.45, down: 0.9, headK: 1.0, legK: 1.18, Lt: 0.72, mane: 0.14, hump: 0.04, forelock: 1.5, blaze: false, socks: [], hoof: '#2e2822' },
  courser: { H: 1.52, L: 1.50, w: 0.225, d: 0.31, Ln: 0.84, up: 0.90, arch: 0.08, neckK: 0.9, Lh: 0.55, down: 1.0, headK: 0.92, legK: 0.92, Lt: 0.9, mane: 0.08, hump: 0.08, tailUp: 0.2, blaze: true, socks: ['FL', 'BL', 'BR'], hoof: '#3a3430' },
  draft:   { H: 1.44, L: 1.60, w: 0.31, d: 0.37, Ln: 0.78, up: 0.80, arch: 0.10, neckK: 1.25, Lh: 0.6, down: 0.98, headK: 1.12, legK: 1.3, Lt: 0.84, mane: 0.13, hump: 0.06, feather: true, blaze: true, socks: [], hoof: '#2a2420' },
  elk:     { H: 1.46, L: 1.42, w: 0.23, d: 0.32, Ln: 0.70, up: 0.92, arch: 0.01, neckK: 0.9, Lh: 0.52, down: 0.72, headK: 0.9, legK: 0.86, Lt: 0, mane: 0, dewlap: 0.12, hump: 0.12, ears: 1.5, antlers: 1, rump: true, hoof: '#2a2420' },
  elk_dray:{ H: 1.46, L: 1.55, w: 0.27, d: 0.35, Ln: 0.70, up: 0.88, arch: 0.02, neckK: 1.08, Lh: 0.56, down: 0.75, headK: 1.0, legK: 1.05, Lt: 0, mane: 0, dewlap: 0.15, hump: 0.14, ears: 1.5, antlers: 1.35, rump: true, feather: true, hoof: '#2a2420' },
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
const clamp01 = t => Math.max(0, Math.min(1, t));
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
/** A cubic Bezier in the side plane: points are [z, y]. */
const bez3 = (a, b, c, e) => t => { const s = 1 - t, k0 = s * s * s, k1 = 3 * s * s * t, k2 = 3 * s * t * t, k3 = t * t * t; return [k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * e[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * e[1]]; };
const polar = (len, ang) => [Math.cos(ang) * len, Math.sin(ang) * len];
const col = hex => new THREE.Color(hex);
function shade(hex, k) { const c = new THREE.Color(hex); if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k); else c.multiplyScalar(1 + k); return '#' + c.getHexString(); }

/**
 * A point of a ring. ring = { c: [x,y,z], n: [x,y,z] dorsal unit, b: [x,y,z] side unit, rx, top, bot, pt?, pb? }.
 * At angle a (0 = the +b side, PI/2 = dorsal): c + b * rx * cos(a)^e + n * (sin a > 0 ? top : bot) * sin a, where
 * e is `pt` above the centre line and `pb` below it: 1 = an ellipse, under 1 = boxy (a flat forehead, a broad
 * rump), over 1 = peaked (the withers, the crest, the edge of the jaw).
 */
function ringPoint(R, a, push = 1, out = [0, 0, 0, 0, 0]) {
  const ca = Math.cos(a), sa = Math.sin(a), e = sa > 0 ? (R.pt || 1) : (R.pb || 1);
  const vx = R.rx * (ca < 0 ? -1 : 1) * (e === 1 ? Math.abs(ca) : Math.pow(Math.abs(ca), e)) * push, vy = (sa > 0 ? R.top : R.bot) * sa * push;
  out[0] = R.c[0] + R.b[0] * vx + R.n[0] * vy; out[1] = R.c[1] + R.b[1] * vx + R.n[1] * vy; out[2] = R.c[2] + R.b[2] * vx + R.n[2] * vy;
  out[3] = vx; out[4] = vy;
  return out;
}
/**
 * A loft: `ring(u)` for u in 0..1 (see ringPoint). `colour(u, a, x, y)` -> THREE.Color per vertex (or one Color
 * for the lot). `push` scales the cross-section (tack patches), and u0..u1 / a0..a1 cut a patch out of the surface;
 * a0 / a1 may be functions of u (a mane cut into locks, a forelock that comes to a point).
 */
function loft(ring, { rows = 32, cols = 24, colour = null, push = 1, u0 = 0, u1 = 1, a0 = 0, a1 = Math.PI * 2, closed = true, uDist = null } = {}) {
  const pos = [], cols3 = [], idx = [], P = [0, 0, 0, 0, 0];
  const nc = closed ? cols : cols + 1, fn = typeof colour === 'function';
  for (let r = 0; r <= rows; r++) {
    let t = r / rows; if (uDist) t = uDist(t);
    const u = u0 + (u1 - u0) * t, R = ring(u);
    const A0 = typeof a0 === 'function' ? a0(u) : a0, A1 = typeof a1 === 'function' ? a1(u) : a1;
    for (let k = 0; k < nc; k++) {
      const a = A0 + (A1 - A0) * (k / cols);
      ringPoint(R, a, push, P);
      pos.push(P[0], P[1], P[2]);
      if (colour) { const cc = fn ? colour(u, a, P[3], P[4]) : colour; cols3.push(cc.r, cc.g, cc.b); }
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
/**
 * A long bone hanging from its origin along -y: `prof(u)` -> { rx side half-width, f half-depth to the front (+z),
 * r half-depth to the rear, z centre offset }. `colour(u)` -> Color.
 */
function limb(len, prof, { rows = 6, cols = 10, colour = null } = {}) {
  return loft(u => { const p = prof(u); return { c: [0, -len * u, p.z || 0], n: [0, 0, 1], b: [1, 0, 0], rx: p.rx, top: p.f, bot: p.r }; }, { rows, cols, colour: colour ? (u => colour(u)) : null });
}
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _V = new THREE.Vector3(), _S = new THREE.Vector3();
/** Bake a place, a turn and a stretch into a geometry and paint it one colour (unless it is already painted). */
function part(geo, colour, { pos = null, rot = null, scale = null } = {}) {
  if (scale || rot || pos) {
    _E.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0); _Q.setFromEuler(_E);
    _V.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0); _S.set(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1);
    geo.applyMatrix4(_M.compose(_V, _Q, _S));
  }
  if (colour && !geo.getAttribute('color')) {
    const n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = colour.r; a[i * 3 + 1] = colour.g; a[i * 3 + 2] = colour.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return geo;
}
/** Several indexed geometries (position + normal [+ color]) as one. The inputs are disposed. */
function merge(geos) {
  const withCol = geos.every(g => g.getAttribute('color'));
  let nv = 0, ni = 0; for (const g of geos) { nv += g.getAttribute('position').count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colr = withCol ? new Float32Array(nv * 3) : null, idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  let v = 0, i = 0;
  for (const g of geos) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.set(g.getAttribute('position').array, v * 3); nor.set(g.getAttribute('normal').array, v * 3);
    if (colr) colr.set(g.getAttribute('color').array, v * 3);
    const src = g.index.array; for (let k = 0; k < src.length; k++) idx[i + k] = src[k] + v;
    v += g.getAttribute('position').count; i += src.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (colr) out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * Build an equine body. spec: { breed, size, colors: {body, belly, accent, hair?}, seed, markings? }.
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
  /** One mesh from painted pieces, on the shared vertex-colour coat material. */
  const coat = geos => mesh(merge(geos), C.body, { vc: true });

  const group = new THREE.Group(); group.userData.character = true; group.name = 'equine-' + key;
  const root = new THREE.Group(); root.scale.setScalar(S); group.add(root);
  const { H, L, w, d } = Bd;
  const TAU = Math.PI * 2, TOP = Math.PI / 2;

  const cBody = col(C.body), cBelly = col(C.belly), cMuzzle = col(shade(C.body, isElk ? -0.5 : -0.42)), cWhite = col('#ece6dc');
  const cRump = col(shade(C.belly, 0.35)), cDark = col(shade(C.body, -0.18)), cPoint = col(shade(C.body, isElk ? -0.3 : -0.42));
  const cSock = col('#e6e0d6'), cHoof = col(Bd.hoof || '#2a2420');

  // ---- the barrel ----------------------------------------------------------------------------------------
  // u = 0 at the buttock, 1 at the breast. The croup is high at 0.17, the back dips at the saddle (0.5) and the
  // withers stand at 0.74. Beneath, the girth is deepest just behind the elbow (0.68) and the belly line climbs
  // from there to the flank (0.25). Seen from the front or behind it is peaked at the withers, broad and boxy
  // over the quarters and narrow between the forelegs.
  const WITHERS_U = 0.74;
  const bW = profile([[0, 0.86], [0.16, 1.0], [0.36, 0.95], [0.56, 1.04], [0.78, 0.98], [1, 0.86]]);      // (round 2: a broader breast — from the front the forelegs stood under a slab)
  const bTop = profile([[0, 0.8], [0.17, 0.99], [0.34, 0.9], [0.5, 0.86], [0.64, 0.9], [WITHERS_U, 0.98 + Bd.hump * 1.3], [0.86, 0.9], [1, 0.8]]);
  const bBot = profile([[0, 0.55], [0.12, 0.7], [0.25, 0.8], [0.45, 0.94], [0.68, 1.06], [0.86, 0.98], [1, 0.74]]);
  const bPt = profile([[0, 0.82], [0.2, 0.8], [0.45, 0.95], [0.62, 1.15], [WITHERS_U, 1.5], [0.9, 1.25], [1, 1]]);
  const bPb = profile([[0, 1.0], [0.3, 0.9], [0.6, 0.92], [0.8, 1.2], [1, 1.3]]);
  const bodyRing = u => {
    const cp = cap(u, 2.6);
    return { c: [0, 0, -L / 2 + u * L], n: [0, 1, 0], b: [1, 0, 0], rx: w * bW(u) * cp, top: d * cp * bTop(u), bot: d * cp * bBot(u), pt: bPt(u), pb: bPb(u) };
  };
  const zAt = u => -L / 2 + u * L;
  const bodyY = H - bodyRing(WITHERS_U).top;                    // the withers stand at exactly H
  const hip = new THREE.Group(); hip.position.y = bodyY; root.add(hip);
  const bodyColour = (u, a, vx, vy) => {
    const c = cBody.clone();
    c.lerp(cBelly, smooth(clamp01((-vy / d - 0.3) / 0.5)));
    if (Bd.rump && u < 0.12 && vy > -d * 0.4) c.lerp(cRump, smooth(Math.min(1, (0.12 - u) / 0.07)));
    return c;
  };
  const uDist = t => 0.5 - 0.5 * Math.cos(t * Math.PI);   // rows bunch at the ends so the caps stay round
  hip.add(mesh(loft(bodyRing, { rows: n(34, 14), cols: n(26, 12), colour: bodyColour, uDist }), C.body, { vc: true }));

  // ---- the neck: the space between the crest and the throat line -----------------------------------------
  // Both curves are laid out in the side view, [z forward, y up], in hip space, and then moved into the neck
  // group, whose origin is the pivot the neck nods from (buried in the chest).
  const NECK_PIVOT = [L * 0.33, d * 0.2];
  const neck = new THREE.Group(); neck.position.set(0, NECK_PIVOT[1], NECK_PIVOT[0]); hip.add(neck);
  const up = Bd.up, Ln = Bd.Ln, nk = Bd.neckK, hk = Bd.headK * 1.12, Lh = Bd.Lh * 1.08, down = Bd.down;
  const nkP = nk * (0.55 + 0.45 * Bd.Lh / 0.54);                 // the poll end is sized to the head it carries
  const inNeck = p => [p[0] - NECK_PIVOT[0], p[1] - NECK_PIVOT[1]];
  const Rw = bodyRing(WITHERS_U);
  const C0 = inNeck([zAt(WITHERS_U - 0.08), Rw.top - 0.075]);    // the crest leaves from just behind and under the withers
  const T0 = inNeck([zAt(0.9), -d * 0.42]);                      // the throat line leaves from inside the breast
  const A0 = [(C0[0] + T0[0]) / 2, (C0[1] + T0[1]) / 2];
  const Pc = [A0[0] + Math.cos(up) * Ln, A0[1] + Math.sin(up) * Ln];   // the middle of the neck where the head hangs
  const pollAng = up - 0.3;                                      // the top of the neck flattens toward the poll
  const nP = [-Math.sin(pollAng), Math.cos(pollAng)], aP = [Math.cos(pollAng), Math.sin(pollAng)];
  const Ct = [Pc[0] + nP[0] * 0.095 * nkP, Pc[1] + nP[1] * 0.095 * nkP], Tt = [Pc[0] - nP[0] * 0.098 * nkP, Pc[1] - nP[1] * 0.098 * nkP];   // (round 2: a finer throat-latch behind the jaw)
  const add2 = (p, q, k = 1) => [p[0] + q[0] * k, p[1] + q[1] * k];
  const crest = bez3(C0, add2(add2(C0, polar(Ln * 0.42, up + 0.2)), [-Math.sin(up), Math.cos(up)], Bd.arch * 1.6), add2(Ct, polar(Ln * 0.34, pollAng + 0.1), -1), Ct);
  const throat = bez3(T0, add2(T0, polar(Ln * 0.3, up - 0.1)), add2(Tt, polar(Ln * 0.3, up + 0.22), -1), Tt);
  const nW = profile([[0, 0.17], [0.22, 0.125], [0.5, 0.092], [0.8, 0.076], [1, 0.07]]);
  const nPt = profile([[0, 1.15], [0.3, 1.45], [0.8, 1.4], [1, 1.2]]);
  const neckRing = u => {
    const Cc = crest(u), Tc = throat(u), dz = Cc[0] - Tc[0], dy = Cc[1] - Tc[1], len = Math.hypot(dz, dy) || 1e-6;
    return { c: [0, (Cc[1] + Tc[1]) / 2, (Cc[0] + Tc[0]) / 2], n: [0, dy / len, dz / len], b: [1, 0, 0], rx: nW(u) * nk, top: len / 2, bot: len / 2, pt: nPt(u), pb: 1.05 };
  };
  const neckColour = (u, a, vx, vy) => { const c = cBody.clone(); if (vy < 0) c.lerp(cBelly, smooth(Math.min(1, -vy / 0.25)) * 0.3 * (1 - u)); return c; };
  const neckGeos = [loft(neckRing, { rows: n(18, 8), cols: n(18, 10), colour: neckColour })];

  // ---- the head: hung at the poll, pitched down ------------------------------------------------------------
  // Head space: +z runs down the nose, +y is the forehead side. u = 0 behind the poll, 0.12 the ears, 0.3 the eye,
  // 0.3-0.4 the round of the jaw, 0.6 the bridge of the nose, 0.88 the nostrils, 1 the lips.
  const headN = [Math.sin(down), Math.cos(down)];                // the forehead's outward direction, [z, y]
  const Hp = add2(add2(Ct, aP, 0.05 * nkP), headN, -0.064 * hk);
  const head = new THREE.Group(); head.position.set(0, Hp[1], Hp[0]); neck.add(head);
  head.rotation.x = down;
  const headRest = head.rotation.x;
  const HEAD_Z0 = -0.075;
  const hW = profile([[0, 0.06], [0.13, 0.088], [0.3, 0.102], [0.48, 0.078], [0.7, 0.06], [0.88, 0.07], [1, 0.062]]);
  const hTop = profile([[0, 0.05], [0.14, 0.066], [0.3, 0.064], [0.6, 0.05], [0.86, 0.047], [1, 0.04]]);
  const hBot = profile(isElk
    ? [[0, 0.07], [0.15, 0.12], [0.3, 0.135], [0.48, 0.1], [0.66, 0.076], [0.88, 0.07], [1, 0.06]]
    : [[0, 0.075], [0.15, 0.15], [0.3, 0.182], [0.46, 0.128], [0.64, 0.08], [0.86, 0.082], [1, 0.07]]);      // (round 2: a deeper, rounder jowl; the nose a little drier in front of it)
  const hPt = profile([[0, 0.9], [0.2, 0.68], [0.45, 0.74], [0.8, 0.85], [1, 0.9]]);
  const hPb = profile([[0, 1.1], [0.3, 1.25], [0.6, 1.15], [0.85, 0.85], [1, 0.82]]);      // (round 2: the jaw less of a knife edge, the muzzle squarer)
  const headRing = u => { const cp = cap(u, 3.4); return { c: [0, 0, HEAD_Z0 + u * Lh], n: [0, 1, 0], b: [1, 0, 0], rx: hW(u) * hk * cp, top: hTop(u) * hk * cp, bot: hBot(u) * hk * cp, pt: hPt(u), pb: hPb(u) }; };
  const blaze = Bd.blaze;
  const headColour = (u, a, vx, vy) => {
    const c = cBody.clone();
    c.lerp(cMuzzle, smooth(clamp01((u - 0.72) / 0.18)));
    if (blaze && vy > 0 && Math.abs(vx) < 0.026 * (0.6 + 0.8 * gauss(u, 0.3, 0.2)) && u > 0.16 && u < 0.9) c.copy(cWhite);
    return c;
  };
  const headGeos = [loft(headRing, { rows: n(24, 10), cols: n(20, 10), colour: headColour, uDist })];
  const at = u => headRing(u);
  const eyeGeos = [], P5 = [0, 0, 0, 0, 0];
  for (const sx of [-1, 1]) {
    // EYES (W3: "bulging eyes"). A horse's eye sits on the SIDE of the skull, high and well back, and is sunk in:
    // what shows is a dark almond under a brow. So: a flattened dark lens whose centre is INSIDE the skull (it
    // stands 3 mm proud at most), an upper lid over the top third of it, and a brow ridge above.
    const EU = 0.3, EA = 0.5, Re = at(EU), ang = sx > 0 ? EA : Math.PI - EA, er = 0.024 * hk;      // (round 3: a touch larger — at riding distance the eye had vanished; still sunk, still an almond)
    ringPoint(Re, ang, 0.9, P5);
    eyeGeos.push(part(new THREE.SphereGeometry(er, n(10, 6), n(8, 5)), null, { pos: [P5[0], P5[1], P5[2]], rot: [0.2, 0, sx * 0.35], scale: [0.62, 0.82, 1.25] }));
    ringPoint(Re, ang, 0.905, P5);
    headGeos.push(part(new THREE.SphereGeometry(er * 1.16, n(10, 6), n(6, 4), 0, TAU, 0, TOP), cDark, { pos: [P5[0], P5[1] + er * 0.16, P5[2]], rot: [0.2, 0, sx * 0.35], scale: [0.72, 0.62, 1.3] }));
    ringPoint(Re, ang + sx * 0.3, 0.9, P5);
    headGeos.push(part(new THREE.SphereGeometry(er * 1.5, n(8, 6), n(6, 4)), cBody, { pos: [P5[0], P5[1] + er * 0.25, P5[2] - er * 0.2], rot: [0.25, 0, 0], scale: [0.7, 0.5, 1.45] }));
    const Rm = at(0.9);
    // NOSTRILS (2026-10-07: "the horse's weird nostrils" — a player took them for a second pair of eyes). They were
    // glossy black balls two thirds the size of the eye, proud of the top of the muzzle. A nostril is a small matte
    // slit on the SIDE of the nose end, a little below its midline and half sunk into it, running along the nose.
    const nos = part(new THREE.SphereGeometry(0.011 * hk, n(8, 5), n(6, 4)), col(shade(C.body, -0.7)), { pos: [sx * Rm.rx * 0.8, Rm.top * -0.12, Rm.c[2] + 0.012 * hk], rot: [0.5, sx * 0.5, 0], scale: [0.5, 0.75, 1.5] });
    headGeos.push(nos);
    // ears: up in the world, so turned back against the head's pitch, leaning a touch forward and out
    const ek = (Bd.ears || 1) * hk, EL = 0.125 * ek;
    const earRot = [-down + 0.22, 0, -sx * (isElk ? 0.8 : 0.2)];
    const earPos = [sx * 0.047 * hk, hTop(0.11) * hk * 0.8, at(0.11).c[2]];
    // (round 2: an ear is a LEAF — widest a third of the way up, a rounded point, cupped to the front — not a spike)
    const leaf = (rw, len, depth, ws, hs) => {
      const g = new THREE.SphereGeometry(1, ws, hs), p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), t = (y + 1) / 2, rad = Math.sqrt(Math.max(0, 1 - y * y)) || 1;
        const wd = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.8) * (1 - 0.35 * t);      // widest a third of the way up
        p.setXYZ(i, p.getX(i) / rad * wd * rw, t * len, p.getZ(i) / rad * wd * depth);
      }
      g.computeVertexNormals(); return g;
    };
    const eg = leaf(0.04 * ek, EL, 0.022 * ek, n(8, 6), n(7, 5));
    const ig = leaf(0.026 * ek, EL * 0.8, 0.008 * ek, n(6, 5), n(6, 4)); ig.translate(0, EL * 0.06, 0.017 * ek);
    const earGeo = merge([part(eg, cBody), part(ig, col(shade(C.body, -0.5)))]);
    const ear = new THREE.Group(); ear.position.set(...earPos); ear.rotation.set(...earRot); head.add(ear);
    ear.add(mesh(earGeo, C.body, { vc: true }));
    head.userData['ear' + (sx < 0 ? 'L' : 'R')] = ear;
    // the line of the mouth: a thin dark strip low on each side of the muzzle
    const m0 = sx > 0 ? -0.62 : Math.PI + 0.5, m1 = sx > 0 ? -0.5 : Math.PI + 0.62;
    headGeos.push(loft(headRing, { rows: n(5, 3), cols: 1, u0: 0.8, u1: 0.985, a0: m0, a1: m1, push: 1.012, closed: false, colour: col('#1a1210') }));
  }
  { const g = merge(eyeGeos); head.add(mesh(g, '#120c08', { rough: 0.25 })); }

  // ---- mane, forelock, dewlap, antlers ------------------------------------------------------------------
  const hair = C.hair || C.accent, hair2 = shade(hair, -0.15);   // mane + tail (a warhorse's accent is its cloth)
  if (Bd.mane > 0) {
    // the mane: one sheet that stands a little off the crest and falls down the off side, its lower edge cut into locks
    const lift = profile([[0, 0.2], [0.1, 0.8], [0.5, 1], [0.9, 0.9], [1, 0.5]]);
    const maneRing = u => { const R = neckRing(u); return { ...R, rx: R.rx + 0.012, top: R.top + Bd.mane * 0.38 * lift(u), pt: 1.1 }; };
    const hang = u => 0.75 + Bd.mane * 3.2 * lift(u) * (0.72 + 0.28 * Math.abs(Math.sin(u * 17)));
    const mg = loft(maneRing, { rows: n(28, 10), cols: n(8, 5), u0: 0.03, u1: 0.985, a0: u => TOP - hang(u), a1: TOP + 0.5, closed: false });
    neck.add(mesh(mg, hair, { side: THREE.DoubleSide, rough: 0.9 }));
    // forelock: a tuft from between the ears down the forehead, coming to a point
    const F = Bd.forelock || 1, f1 = Math.min(0.5, 0.3 * F), fw = u => 0.52 * Math.max(0.04, 1 - (u - 0.07) / (f1 - 0.07)) ** 0.7;
    const fg = loft(headRing, { rows: n(6, 4), cols: n(6, 4), u0: 0.07, u1: f1, a0: u => TOP - fw(u), a1: u => TOP + fw(u), push: 1.13, closed: false });
    head.add(mesh(fg, hair, { side: THREE.DoubleSide, rough: 0.9 }));
  }
  if (Bd.dewlap) {
    // a shaggy fringe under the throat, and a darker collar round the root of the neck
    const N = n(8, 5), cA = col(shade(C.body, -0.25)), cB = col(shade(C.body, -0.35));
    for (let i = 0; i < N; i++) {
      const u = 0.15 + (i / (N - 1)) * 0.7, R = neckRing(u), h3 = Bd.dewlap * (0.6 + 0.5 * Math.sin(i * 1.9) ** 2), len3 = (Ln * 0.7 / N) * 1.6;
      const g = new THREE.BoxGeometry(0.08 * nk, h3, len3); g.translate(0, -h3 / 2, 0);
      // hang it from the throat line, lying along the neck
      const tz = throat(Math.min(1, u + 0.02))[0] - throat(u - 0.02)[0], ty = throat(Math.min(1, u + 0.02))[1] - throat(u - 0.02)[1];
      neckGeos.push(part(g, i % 2 ? cA : cB, { pos: [0, R.c[1] - R.n[1] * (R.bot - 0.02), R.c[2] - R.n[2] * (R.bot - 0.02)], rot: [-Math.atan2(ty, tz), 0, 0] }));
    }
    neckGeos.push(loft(u => { const R = neckRing(0.06 + u * 0.36); return { ...R, rx: R.rx * 1.07, top: R.top * 1.05, bot: R.bot * 1.05 }; }, { rows: n(8, 4), cols: n(18, 10), colour: col(shade(C.body, -0.3)) }));
  }
  if (Bd.antlers) {
    // each antler is a chain of beams bending up and back, with a tine forward off every beam after the first
    const ak = Bd.antlers, ac = col(shade(C.belly, 0.25));
    const chain = new THREE.Group(); head.add(chain);
    for (const sx of [-1, 1]) {
      const base = new THREE.Group(); base.position.set(sx * 0.04 * hk, hTop(0.16) * hk * 0.9, at(0.16).c[2]); base.rotation.set(-down + 0.15, 0, -sx * 0.62); chain.add(base);
      let parent = base; const segs = [[0.17, 0.05], [0.16, -0.3], [0.14, -0.25], [0.11, 0.2]];
      segs.forEach(([len, bend], i) => {
        const L2 = len * ak, r0 = 0.022 * ak * (1 - i * 0.18), r1 = r0 * 0.82;
        const seg = new THREE.Group(); seg.rotation.x = bend; parent.add(seg);
        const g = new THREE.CylinderGeometry(r1, r0, L2, n(7, 5)); g.translate(0, L2 / 2, 0); seg.userData.geo = [g];
        if (i > 0) {
          const tl = 0.13 * ak * (1 - i * 0.1), tg = new THREE.ConeGeometry(r1 * 0.8, tl, n(6, 4)); tg.translate(0, tl / 2, 0);
          const tine = new THREE.Group(); tine.position.y = L2 * 0.4; tine.rotation.set(1.15, 0, sx * 0.2 * i); tine.userData.geo = [tg]; seg.add(tine);
        }
        const nxt = new THREE.Group(); nxt.position.y = L2; seg.add(nxt); parent = nxt;
      });
      const tip = new THREE.ConeGeometry(0.014 * ak, 0.08 * ak, n(6, 4)); tip.translate(0, 0.04 * ak, 0); parent.userData.geo = [tip];
    }
    // bake the whole rack into the head's own mesh (it is rigid with the skull)
    head.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(head.matrixWorld).invert();
    chain.traverse(o => { for (const g of o.userData.geo || []) { g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); headGeos.push(part(g, ac)); } });
    head.remove(chain);
  }
  neck.add(coat(neckGeos));
  head.add(coat(headGeos));

  // ---- the tail: a short dock off the end of the croup, and the hair hanging from it ------------------------
  const tail = new THREE.Group(); tail.position.set(0, bodyRing(0.05).top * 0.9, zAt(0.035)); hip.add(tail);
  const tailRest = Bd.Lt ? 0.95 - (Bd.tailUp || 0) * 0.6 : 0.5;  // the dock points back and down
  tail.rotation.x = tailRest;
  const DOCK = Bd.Lt ? 0.16 : 0.11;
  { const g = new THREE.CylinderGeometry(0.046, 0.034, DOCK, n(8, 5)); g.translate(0, -DOCK / 2 + 0.03, 0); const geos = [part(g, Bd.Lt ? col(hair) : cBody)];
    if (!Bd.Lt && Bd.rump) geos.push(part(new THREE.SphereGeometry(0.05, n(8, 5), n(6, 4)), col(shade(C.belly, 0.35)), { pos: [0, -0.1, 0], scale: [0.8, 1.2, 0.6] }));
    tail.add(coat(geos)); }
  let tailHair = null, tailTip = null;
  const hairRest = -(tailRest - 0.2 - (Bd.tailUp || 0));         // the hair falls nearly straight down from the dock
  if (Bd.Lt) {
    tailHair = new THREE.Group(); tailHair.position.y = -DOCK * 0.7; tailHair.rotation.x = hairRest; tail.add(tailHair);
    const plume = (len, r0, r1, rMid) => {
      const pts = []; for (let i = 0; i <= 7; i++) { const v = i / 7; pts.push(new THREE.Vector2(Math.max(0.004, r0 + (r1 - r0) * v + rMid * Math.sin(Math.PI * v)), -len * v)); }
      const g = new THREE.LatheGeometry(pts, n(10, 6)); g.scale(0.8, 1, 1); return g;
    };
    const L1 = Bd.Lt * 0.46, L2 = Bd.Lt * 0.58;
    tailHair.add(mesh(plume(L1, 0.04, 0.085, 0.03), hair, { rough: 0.9 }));
    tailTip = new THREE.Group(); tailTip.position.y = -L1 * 0.96; tailHair.add(tailTip);
    tailTip.add(mesh(plume(L2, 0.085, 0.01, 0.03), hair2, { rough: 0.9 }));
  }

  // ---- legs ------------------------------------------------------------------------------------------------
  // Heights above the ground at size 1: the knee at 0.31 H, the hock at 0.40 H, the fetlock at 0.085 H. The forearm
  // and the gaskin are muscled at the top and dry at the bottom; the cannon is thin and straight with the tendon
  // down its back; the pastern slopes forward into the hoof.
  const lk = Bd.legK, hs = H / 1.4, segs = n(10, 6);
  const kneeH = H * 0.31, hockH = H * 0.4, fetH = H * 0.085, hoofH = 0.075, PAST = 0.5;
  const legs = [];
  const socks = new Set(Bd.socks || []);
  const pr = pts => profile(pts);
  const foreP = { rx: pr([[0, 0.085], [0.3, 0.08], [0.65, 0.056], [0.9, 0.047], [1, 0.05]]), f: pr([[0, 0.085], [0.3, 0.09], [0.7, 0.056], [1, 0.05]]), r: pr([[0, 0.12], [0.22, 0.11], [0.55, 0.062], [1, 0.05]]) };
  const thighP = { rx: pr([[0, 0.1], [0.3, 0.092], [0.65, 0.058], [1, 0.046]]), f: pr([[0, 0.15], [0.32, 0.15], [0.56, 0.085], [0.8, 0.055], [1, 0.05]]), r: pr([[0, 0.17], [0.3, 0.125], [0.6, 0.072], [1, 0.062]]) };
  const cannonF = { rx: pr([[0, 0.044], [0.25, 0.034], [0.8, 0.033], [1, 0.04]]), f: pr([[0, 0.044], [0.25, 0.033], [1, 0.036]]), r: pr([[0, 0.046], [0.25, 0.042], [1, 0.044]]) };
  const cannonH = { rx: pr([[0, 0.046], [0.25, 0.036], [0.8, 0.035], [1, 0.042]]), f: pr([[0, 0.05], [0.25, 0.036], [1, 0.038]]), r: pr([[0, 0.066], [0.22, 0.048], [1, 0.046]]) };
  const scaleP = (P, k) => u => ({ rx: P.rx(u) * k, f: P.f(u) * k, r: P.r(u) * k });
  for (const tag of ['FL', 'FR', 'BL', 'BR']) {
    const front = tag[0] === 'F', sx = tag[1] === 'L' ? -1 : 1;
    const cLow = socks.has(tag) ? cSock : cPoint;
    const pivot = new THREE.Group();
    const py = front ? -d * 0.3 : -d * 0.04, pz = front ? L * 0.31 : -L * 0.31;
    pivot.position.set(sx * w * (front ? 0.54 : 0.6), py, pz); hip.add(pivot);
    const topY = bodyY + py;                                     // pivot height above the ground (size 1)
    let a1, rest = 0, midRest = 0;
    if (front) a1 = topY - kneeH;
    else { const hb = 0.14 * hs; a1 = Math.hypot(topY - hockH, hb); rest = Math.atan2(hb, topY - hockH); midRest = -rest; }
    // the upper leg: the muscle mass (it sinks into the barrel and moves with the leg) + the forearm / gaskin
    const upCol = u => cBody.clone().lerp(cPoint, smooth(clamp01((u - 0.55) / 0.45)) * 0.85);
    const upper = [limb(a1, scaleP(front ? foreP : thighP, lk * (0.6 + 0.4 * hs)), { rows: n(8, 5), cols: segs, colour: upCol })];
    if (front) upper.push(part(new THREE.SphereGeometry(1, n(12, 7), n(8, 5)), cBody, { pos: [-sx * 0.065, a1 * 0.1, 0.03], rot: [0.5, 0, 0], scale: [w * 0.34, a1 * 0.5, 0.18 * lk] }));
    else upper.push(part(new THREE.SphereGeometry(1, n(12, 7), n(8, 5)), cBody, { pos: [-sx * 0.045, a1 * 0.1, 0.0], rot: [-rest - 0.25, 0, 0], scale: [w * 0.4, a1 * 0.5, 0.25 * (0.5 + 0.5 * lk)] }));
    pivot.add(coat(upper));
    // the knee / hock and the cannon
    const mid = new THREE.Group(); mid.position.y = -a1; pivot.add(mid);
    const a2 = (front ? kneeH : hockH) - fetH;
    const lower = [limb(a2, scaleP(front ? cannonF : cannonH, lk), { rows: n(5, 3), cols: n(8, 6), colour: () => cPoint })];
    if (front) lower.push(part(new THREE.SphereGeometry(0.05 * lk, segs, n(6, 4)), cPoint, { pos: [0, 0.005, 0.004], scale: [0.95, 1.25, 1.05] }));
    else lower.push(part(new THREE.SphereGeometry(0.052 * lk, segs, n(6, 4)), cPoint, { pos: [0, 0.0, -0.018 * lk], scale: [0.85, 1.25, 1.4] }));
    mid.add(coat(lower));
    // the fetlock, the pastern sloping forward, the hoof
    const fet = new THREE.Group(); fet.position.y = -a2; mid.add(fet);
    const a3 = (fetH - hoofH) / Math.cos(PAST);
    const foot = [part(new THREE.SphereGeometry(0.046 * lk, segs, n(6, 4)), cLow, { pos: [0, 0, -0.004], scale: [0.92, 1, 1.15] })];
    const pg = new THREE.CylinderGeometry(0.04 * lk, 0.05 * lk, a3 + 0.02, n(8, 6), 1, true); pg.translate(0, -a3 / 2, 0); pg.scale(0.9, 1, 1);
    foot.push(part(pg, cLow, { rot: [-PAST, 0, 0] }));
    // the hoof: a short cone, longer at the toe, its wall sloping with the pastern
    const hg = new THREE.CylinderGeometry(0.052 * lk, 0.07 * lk, hoofH, n(12, 6)); hg.translate(0, -hoofH / 2, 0); hg.scale(0.94, 1, 1.12);
    { const p = hg.getAttribute('position'); for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getY(i) + hoofH) * -0.18 + 0.012 * lk); }
    foot.push(part(hg, cHoof, { pos: [0, -a3 * Math.cos(PAST), a3 * Math.sin(PAST)] }));
    fet.add(coat(foot));
    if (Bd.feather) {
      // feathering: a soft bell of long hair from the fetlock over the hoof, longer at the back
      const drop = Math.min(0.11 * lk, fetH - 0.012);
      const fp = [[0.046, 0.05], [0.06, 0.0], [0.078, -0.55], [0.086, -0.92], [0.07, -1]].map(([r, y]) => new THREE.Vector2(r * lk, y > 0 ? y * lk : y * drop));
      const fg = new THREE.LatheGeometry(fp, n(12, 8)); fg.scale(1, 1, 1.2); fg.translate(0, 0, 0.004);
      fet.add(mesh(fg, shade(C.belly, 0.3), { side: THREE.DoubleSide, rough: 0.9 }));
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
    zAt,
    /** a point ON a surface: on 'body' | 'neck' | 'head', at u along it and angle a round it -> [x, y, z] in that part's space */
    pointAt(on, u, a, push = 1) { const p = ringPoint((on === 'neck' ? neckRing : on === 'head' ? headRing : bodyRing)(u), a, push); return [p[0], p[1], p[2]]; },
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
    tail.rotation.set(tailRest + p[17] * 0.8, 0, p[16] * 0.5);
    if (tailHair) tailHair.rotation.set(hairRest - p[17] * 0.35, 0, p[16] * 0.8);
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
