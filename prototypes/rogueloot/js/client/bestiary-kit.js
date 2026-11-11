// Bestiary kit — every Rogueloot monster, rare and boss as a flat-shaded low-poly model built in code from its
// `look` block in data/monsters.json (PLAN §0 ruling 14: phone first, stylised; ruling 24: all new for Rogueloot).
//
//   buildMonster(row, { rank, level, phase })  -> THREE.Group, +z is the front, feet at y = 0, scaled so the model's
//                                                  height (bipeds, constructs, blobs) or length (quads, serpents, insects,
//                                                  flyers) is row.size metres. group.userData is the rig (see below).
//   animateMonster(group, state, t, dt, opts)   -> poses the rig: idle / walk / attack / cast / hit / death per body plan.
//                                                  Transforms only, no skinning. opts = { swing, hit, cast, dead, deadT, landed }
//   triangleCount(group), materialCount(group)  -> what the model costs (the test keeps every row under BUDGET).
//
// Rig (group.userData): { plan, height, radius, body, torso, head, arm, armL, armR, arms, hands, legs[], tail, wings[],
//   weapon, glow[] (materials that pulse; eyes and lanterns), jaw, claw, spin, plates, book, flames[], throat, censer,
//   segs[], rear, aura }. `body` is the one node the caller may move freely between calls: animateMonster resets it.
// Every animated node keeps its build pose in node.userData.base = { p: [x,y,z], r: [x,y,z], s: [x,y,z] } and the
// animator adds offsets to that, so a pose never drifts and a builder may leave a limb at any angle it likes.
//
// Materials are shared through a cache keyed by colour (one MeshLambertMaterial per hex), so fifty raiders cost one
// material each colour; glow materials (MeshBasicMaterial) are per model so one monster can flare while it casts.
// Geometry is shared through a cache keyed by shape + dimensions. Budgets (ruling 14): monster ≤ 900 triangles,
// rare ≤ 1400, boss ≤ 4000, ≤ 6 materials each.
import * as THREE from 'three';

export const BUDGET = { monster: 900, rare: 1400, boss: 4000, materials: 6 };
const TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;

// ---------------------------------------------------------------- caches
const GEO = new Map(), MATS = new Map();
const geo = (key, make) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };
/** One material per colour and kind: 'flat' (lambert), 'both' (double-sided, for flags and wings), 'ghost' (see-through). */
export function mat(color, kind = 'flat') {
  const key = kind + '|' + color; let m = MATS.get(key);
  if (!m) {
    if (kind === 'both') m = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
    else if (kind === 'ghost') m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    else if (kind === 'film') m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    else m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    m.name = key; MATS.set(key, m);
  }
  return m;
}
function jitter(g, amt, seed) {
  const p = g.attributes.position, seen = new Map(); let s = seed || 1;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [r() * amt, r() * amt, r() * amt]);
    const d = seen.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  g.computeVertexNormals(); return g;
}
// geometry helpers (all cached by their arguments)
const box = (w, h, d) => geo(`B${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, n = 6) => geo(`C${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const cone = (r, h, n = 6) => geo(`K${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n));
const ico = (r, d = 0) => geo(`I${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const ball = r => ico(r, 1);
const lump = (r, d = 1, seed = 1, amt = 0.22) => geo(`L${r},${d},${seed},${amt}`, () => jitter(new THREE.IcosahedronGeometry(r, d), r * amt, seed));
const dome = (r, n = 8) => geo(`D${r},${n}`, () => new THREE.SphereGeometry(r, n, 3, 0, TAU, 0, HALF));
const torus = (r, t, n = 4, m = 8, arc = TAU) => geo(`T${r},${t},${n},${m},${arc.toFixed(3)}`, () => new THREE.TorusGeometry(r, t, n, m, arc));
const plane = (w, h) => geo(`P${w},${h}`, () => new THREE.PlaneGeometry(w, h));
const ring = (r0, r1, n = 24) => geo(`R${r0},${r1},${n}`, () => new THREE.RingGeometry(r0, r1, n));
const hang = (len, r0, r1, n = 5) => geo(`H${len},${r0},${r1},${n}`, () => new THREE.CylinderGeometry(r0, r1, len, n).translate(0, -len / 2, 0));
const shape = (key, pts) => geo('S' + key, () => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))));
// a wing membrane: inner quad + scalloped outer, in the xy plane, root at the origin, spanning +x
const batWing = (span, chord) => shape(`bat${span},${chord}`, [[0, 0], [span * 0.45, chord * 0.35], [span, chord * 0.1], [span * 0.8, -chord * 0.35], [span * 0.55, -chord * 0.55], [span * 0.3, -chord * 0.45], [0, -chord * 0.25]]);
const leaf = (len, w) => shape(`leaf${len},${w}`, [[0, 0], [len * 0.3, w * 0.5], [len * 0.75, w * 0.35], [len, 0], [len * 0.75, -w * 0.35], [len * 0.3, -w * 0.5]]);

// ---------------------------------------------------------------- scene-graph helpers
function pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
/** Add a mesh. m is a material or a hex colour; o = { rx, ry, rz, s, sx, sy, sz, shadow }. */
function part(parent, g, m, x = 0, y = 0, z = 0, o) {
  const mesh = new THREE.Mesh(g, typeof m === 'string' ? mat(m) : m);
  mesh.position.set(x, y, z);
  if (o) {
    if (o.rx || o.ry || o.rz) mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    if (o.s != null) mesh.scale.setScalar(o.s);
    if (o.sx != null || o.sy != null || o.sz != null) mesh.scale.set(o.sx ?? mesh.scale.x, o.sy ?? mesh.scale.y, o.sz ?? mesh.scale.z);
  }
  mesh.castShadow = !(o && o.shadow === false) && !mesh.material.transparent;
  parent.add(mesh); return mesh;
}
/** A limb: a pivot at (x,y,z) with a cylinder hanging DOWN from it (rotate the pivot to point it anywhere). */
function limb(parent, x, y, z, len, r0, r1, m, o = {}) {
  const p = pivot(parent, x, y, z); part(p, hang(len, r0, r1, o.n || 5), m, 0, 0, 0);
  p.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); p.userData.len = len; return p;
}
const eye = (c, parent, x, y, z, r, m) => part(parent, ico(r, 0), m || c.E, x, y, z, { sz: 0.6, shadow: false });
const eyes = (c, parent, x, y, z, r, m) => [eye(c, parent, -x, y, z, r, m), eye(c, parent, x, y, z, r, m)];
/** A candle: a stub and a flame (the flame is a glow material, pushed to u.flames so it flickers). */
function candle(c, parent, x, y, z, { h = 0.12, r = 0.025, flame = 0.07, m = CREAM, fm } = {}) {
  part(parent, cyl(r, r, h, 5), m, x, y + h / 2, z);
  const f = part(parent, cone(r * 1.5, flame, 4), fm || c.flame(), x, y + h + flame / 2, z, { shadow: false });
  c.u.flames.push(f); return f;
}
/** A crown of n candles round a head at radius rad, height y. */
function candleCrown(c, head, n, rad, y, o = {}) {
  for (let i = 0; i < n; i++) { const a = i / n * TAU + (o.offset || 0); candle(c, head, Math.sin(a) * rad, y, Math.cos(a) * rad, o); }
}
/** Two horns on a head: cones that lean outward and curl forward. */
function horns(c, head, { x = 0.2, y = 0.3, z = 0.05, len = 0.25, r = 0.06, m = CREAM, lean = 0.9, tilt = -0.3, n = 5 } = {}) {
  return [part(head, cone(r, len, n), m, -x, y, z, { rz: lean, rx: tilt }), part(head, cone(r, len, n), m, x, y, z, { rz: -lean, rx: tilt })];
}
/** A stag rack: a beam per side with three tines. */
function antlers(c, head, { x = 0.12, y = 0.3, z = 0, len = 0.5, r = 0.035, m = CREAM, spread = 1.1 } = {}) {
  for (const s of [-1, 1]) {
    const beam = limb(head, s * x, y, z, len, r, r * 0.6, m, { rz: s * spread + s * PI, rx: 0.25 });   // hangs "up"
    for (let i = 0; i < 3; i++) part(beam, cone(r * 0.8, len * 0.38, 4), m, 0, -len * (0.3 + i * 0.25), 0, { rx: -0.9 - i * 0.15 });
  }
}
/** A wing pair: pivots at (±x, y, z); kind feather | bat | leaf | disc; returns [L, R] with .userData.tip on each. */
function wingPair(c, parent, { span = 1, chord = 0.3, x = 0.1, y = 0, z = 0, kind = 'feather', m, tipM, segs = 2 } = {}) {
  const out = [];
  for (const s of [-1, 1]) {
    const root = pivot(parent, s * x, y, z); root.scale.x = s;   // mirror: three flips the cull face on a negative determinant
    const l1 = segs === 2 ? span * 0.45 : span;
    if (kind === 'feather') {
      part(root, box(l1, 0.05, chord), m, l1 / 2, 0, 0);
      const tip = pivot(root, l1, 0, 0); root.userData.tip = tip;
      if (segs === 2) { const l2 = span - l1; part(tip, box(l2, 0.04, chord * 0.85), tipM || m, l2 / 2, 0, -chord * 0.08); for (let i = 0; i < 3; i++) part(tip, box(l2 * 0.35, 0.03, chord * 0.3), tipM || m, l2 * 0.85 - i * l2 * 0.12, -0.01, -chord * (0.45 + i * 0.1)); }
    } else if (kind === 'bat') {
      const mm = mat(typeof m === 'string' ? m : m.color.getStyle(), 'both');
      part(root, box(l1, 0.05, 0.05), m, l1 / 2, 0, chord * 0.3);
      part(root, shape(`wq${l1},${chord}`, [[0, 0], [l1, 0], [l1, -chord * 0.7], [0, -chord * 0.55]]), mm, 0, 0, chord * 0.3, { rx: HALF, shadow: false });
      const tip = pivot(root, l1, 0, chord * 0.3); root.userData.tip = tip;
      part(tip, box(span - l1, 0.04, 0.04), m, (span - l1) / 2, 0, 0);
      part(tip, batWing(span - l1, chord), tipM ? mat(tipM, 'both') : mm, 0, 0, 0, { rx: HALF, shadow: false });
    } else if (kind === 'leaf') {
      part(root, leaf(span, chord), mat(m, 'both'), 0, 0, 0, { rx: HALF, shadow: false }); root.userData.tip = root;
    } else if (kind === 'disc') {
      part(root, cyl(span / 2, span / 2, 0.01, 8), mat(m, 'film'), span / 2, 0, 0, { shadow: false }); root.userData.tip = root;
    }
    out.push(root);
  }
  return out;
}
/** Legs round a body (insects): n legs, half a side, first segment out-and-up, second down to the ground. */
function bugLegs(c, parent, { n = 6, len = 0.3, r = 0.03, y = 0.2, x = 0.2, zFrom = 0.25, zTo = -0.25, lift = 0.5, m, n2 = 4 } = {}) {
  const out = [], per = n / 2;
  for (let i = 0; i < per; i++) {
    const z = per === 1 ? (zFrom + zTo) / 2 : zFrom + (zTo - zFrom) * i / (per - 1);
    for (const s of [-1, 1]) {
      const p = limb(parent, s * x, y, z, len, r, r * 0.8, m, { rz: s * (HALF + lift), n: n2 });
      const drop = 0.25, kneeY = y + len * Math.sin(lift), len2 = Math.max(0.05, kneeY / Math.cos(drop));
      const knee = limb(p, 0, -len, 0, len2, r * 0.8, r * 0.5, m, { rz: s * drop - s * (HALF + lift), n: n2 });
      p.userData.knee = knee; p.userData.side = s; out.push(p);
    }
  }
  return out;
}
const CREAM = '#f2e4c8', BONE = '#e8e0c8', WOOD = '#7a4f2e', DARK = '#1a1a1a', WHITE = '#ffffff', IRON = '#5a5a60';

// ---------------------------------------------------------------- rigs
/**
 * Biped: two legs, a torso pivot at the hips (rotates for a hunch), two arm pivots at the shoulders with hand groups
 * at the ends, a head pivot at the neck. torso: 'ball' | 'box' | 'lump' | 'cone'. Sizes in metres.
 */
function bipedRig(c, o = {}) {
  const { legH = 0.4, legR = 0.09, hipW = 0.14, torsoW = 0.5, torsoH = 0.5, torsoD = 0.35, armLen = 0.45, armR = 0.07, headR = 0.25,
    legM = c.P[0], torsoM = c.P[1], armM = c.P[0], headM = c.P[0], torso = 'ball', hunch = 0, legs = true, feet = true, neck = 0.02, headD = 1, stance = 0 } = o;
  const u = c.u, body = c.body;
  if (legs) for (const s of [-1, 1]) {
    const L = limb(body, s * hipW, legH, 0, legH, legR, legR * 0.85, legM, { rz: -s * stance });
    if (feet) part(L, box(legR * 2.2, legR * 1.2, legR * 3.2), legM, 0, -legH + legR * 0.6, legR * 0.9);
    u.legs.push(L);
  }
  const T = pivot(body, 0, legs ? legH - 0.02 : 0, 0); T.rotation.x = hunch; u.torso = T;
  const unit = torso === 'box' ? box(2, 2, 2) : torso === 'lump' ? lump(1, 1, 7, 0.18) : torso === 'cone' ? cyl(0.6, 1, 2, 8) : ball(1);
  u.torsoMesh = part(T, unit, torsoM, 0, torsoH / 2, 0, { sx: torsoW / 2, sy: torsoH / 2, sz: torsoD / 2 });
  const shY = torsoH * 0.88, shX = torsoW / 2 + armR * 0.5;
  u.armL = limb(T, -shX, shY, 0, armLen, armR, armR * 0.85, armM, { rz: 0.18 });
  u.armR = limb(T, shX, shY, 0, armLen, armR, armR * 0.85, armM, { rz: -0.18 });
  u.arm = u.armR; u.arms = [u.armL, u.armR];
  u.handL = pivot(u.armL, 0, -armLen, 0); u.handR = pivot(u.armR, 0, -armLen, 0); u.hands = [u.handL, u.handR];
  part(u.handL, ico(armR * 1.25, 0), armM); part(u.handR, ico(armR * 1.25, 0), armM);
  u.head = pivot(T, 0, torsoH + neck, 0);
  u.headMesh = part(u.head, ball(1), headM, 0, headR * 0.9, 0, { sx: headR, sy: headR, sz: headR * headD });
  u.headR = headR; u.shoulderY = shY; u.torsoH = torsoH;
  return u;
}
/** Quadruped: a torso pivot at the body's centre line, four legs under it, a head pivot at the front, a tail at the back. */
function quadRig(c, o = {}) {
  const { len = 1.0, chest = 0.22, legH = 0.35, legR = 0.06, headR = 0.18, neck = 0.08, tail = 0, tailR = 0.05, spread = 0.14,
    bodyM = c.P[0], legM = c.P[0], headM = c.P[0], tailM = c.P[0], body = 'ball', jaw = true, headUp = 0.4, legSet = 0.34 } = o;
  const u = c.u, cy = legH + chest * 0.55;
  const T = pivot(c.body, 0, cy, 0); u.torso = T;
  const unit = body === 'barrel' ? cyl(1, 1, 2, 8) : body === 'lump' ? lump(1, 1, 5, 0.16) : body === 'box' ? box(2, 2, 2) : ball(1);
  u.torsoMesh = part(T, unit, bodyM, 0, 0, 0, body === 'barrel' ? { rx: HALF, sx: chest, sy: len / 2, sz: chest * 0.9 } : { sx: chest, sy: chest * 0.9, sz: len / 2 });
  const legLen = cy - chest * 0.25;
  for (const z of [len * legSet, -len * legSet]) for (const s of [-1, 1]) {
    const L = limb(T, s * spread, -chest * 0.25, z, legLen, legR, legR * 0.8, legM);
    part(L, box(legR * 2, legR, legR * 2.4), legM, 0, -legLen + legR * 0.5, legR * 0.4); u.legs.push(L);
  }
  u.head = pivot(T, 0, chest * headUp, len / 2 + neck);
  u.headMesh = part(u.head, ball(1), headM, 0, headR * 0.2, headR * 0.6, { sx: headR, sy: headR * 0.9, sz: headR * 1.2 });
  if (jaw) { u.jaw = pivot(u.head, 0, -headR * 0.35, headR * 0.3); part(u.jaw, box(headR * 1.2, headR * 0.35, headR * 1.3), headM, 0, -headR * 0.15, headR * 0.6); }
  if (tail) { u.tail = pivot(T, 0, chest * 0.3, -len / 2); part(u.tail, hang(tail, tailR, tailR * 0.3, 4), tailM, 0, 0, 0, { rx: -HALF - 0.4 }); }
  u.headR = headR; u.len = len;
  return u;
}
/** A hooded, robed figure (Gravesworn, cantors, reeves): a robe cone to the floor, no legs, arms, a hood over the head. */
function robedRig(c, o = {}) {
  const { h = 1.4, rTop = 0.2, rBot = 0.32, robeM = c.P[0], armM = c.P[0], headR = 0.16, hood = true, hoodM = c.P[0], armLen = 0.45, armR = 0.06, faceM = DARK, hunch = 0 } = o;
  const u = bipedRig(c, { legs: false, torsoH: h * 0.62, torsoW: rTop * 2.2, torsoD: rTop * 1.8, armLen, armR, headR, legM: robeM, torsoM: robeM, armM, headM: hood ? hoodM : c.P[0], hunch, neck: 0.01 });
  u.torsoMesh.visible = false;   // the robe is the torso
  part(u.torso, cyl(rTop, rBot, h * 0.62, 8), robeM, 0, h * 0.31, 0);
  part(u.torso, cyl(rTop * 0.9, rTop * 1.1, h * 0.1, 8), robeM, 0, h * 0.62 + h * 0.03, 0);    // shoulders
  if (hood) {
    u.headMesh.visible = false;
    u.hood = part(u.head, cone(headR * 1.35, headR * 2.6, 7), hoodM, 0, headR * 1.1, 0);
    part(u.head, cyl(headR * 0.95, headR * 0.95, headR * 0.5, 7), faceM, 0, headR * 0.8, headR * 0.35);    // the dark of the hood
  }
  return u;
}
/** A skeleton (the Restless): skull with a jaw, three rib arcs, a spine, thin limbs, blue eye-lights. */
function skeletonRig(c, o = {}) {
  const { h = 1.7, boneM = c.m(c.pal[0]), legs = true, armLen, torsoW = 0.42, hunch = 0, stance = 0, headR } = o;
  const s = h / 1.7, hr = headR || 0.17 * s;
  const u = bipedRig(c, { legH: 0.62 * s, legR: 0.05 * s, hipW: 0.12 * s, torsoW: torsoW * s, torsoH: 0.55 * s, torsoD: 0.28 * s, armLen: armLen || 0.52 * s, armR: 0.045 * s, headR: hr,
    legM: boneM, torsoM: boneM, armM: boneM, headM: boneM, feet: false, legs, hunch, stance, headD: 1.15 });
  u.torsoMesh.visible = false;
  const T = u.torso, th = 0.55 * s;
  part(T, cyl(0.035 * s, 0.045 * s, th, 5), boneM, 0, th / 2, -0.03 * s);                                   // spine
  part(T, box(0.3 * s, 0.1 * s, 0.14 * s), boneM, 0, 0.06 * s, 0);                                           // pelvis
  for (let i = 0; i < 3; i++) part(T, torus(0.18 * s - i * 0.015 * s, 0.022 * s, 3, 7, PI), boneM, 0, th * (0.5 + i * 0.17), -0.02 * s, { rx: HALF, ry: 0, rz: 0, sy: 0.9 });   // ribs, open at the back
  part(T, box(0.36 * s, 0.06 * s, 0.1 * s), boneM, 0, th * 0.9, 0);                                           // collar bones
  part(u.head, box(hr * 1.1, hr * 0.5, hr * 0.9), boneM, 0, hr * 0.3, hr * 0.25);                             // jaw
  u.eyes = eyes(c, u.head, hr * 0.38, hr * 1.0, hr * 0.95, hr * 0.26);
  return u;
}
/** A frog-folk body (croaker, mudwitch): a wide squat body, a huge mouth with a jaw, eyes on top, a throat sac. */
function frogRig(c, o = {}) {
  const { w = 0.9, h = 0.7, bodyM = c.P[0], sacM = c.P[1], legs = true, arms = true } = o;
  const u = c.u, T = pivot(c.body, 0, 0.12, 0); u.torso = T;
  part(T, ball(1), bodyM, 0, h * 0.42, -0.05, { sx: w / 2, sy: h * 0.42, sz: w * 0.42 });
  u.head = pivot(T, 0, h * 0.62, w * 0.15);
  part(u.head, box(w * 0.8, h * 0.25, w * 0.5), bodyM, 0, h * 0.1, 0);                                       // upper jaw
  u.jaw = pivot(u.head, 0, -h * 0.03, -w * 0.2); part(u.jaw, box(w * 0.76, h * 0.12, w * 0.5), bodyM, 0, -h * 0.06, w * 0.22);
  u.eyes = [-1, 1].map(s => part(u.head, ball(1), WHITE, s * w * 0.25, h * 0.3, w * 0.05, { s: h * 0.13 }));
  [-1, 1].forEach(s => part(u.head, ico(h * 0.06, 0), DARK, s * w * 0.25, h * 0.33, w * 0.05 + h * 0.1));
  u.throat = part(u.jaw, ball(1), sacM, 0, -h * 0.18, w * 0.1, { s: h * 0.17, sy: h * 0.12 });
  u.throat.userData.rest = h * 0.17;
  if (legs) for (const s of [-1, 1]) {
    const thigh = limb(T, s * w * 0.4, h * 0.12, -w * 0.1, w * 0.28, h * 0.09, h * 0.07, bodyM, { rz: s * 1.2, rx: 0.4 });
    const shin = limb(thigh, 0, -w * 0.28, 0, w * 0.3, h * 0.07, h * 0.05, bodyM, { rz: -s * 1.3, rx: -0.5 });
    part(shin, box(h * 0.16, h * 0.04, h * 0.3), bodyM, 0, -w * 0.3, h * 0.1); u.legs.push(thigh); thigh.userData.knee = shin;
  }
  if (arms) {
    u.armL = limb(T, -w * 0.42, h * 0.42, w * 0.15, h * 0.4, h * 0.06, h * 0.05, bodyM, { rz: 0.5, rx: -0.4 });
    u.armR = limb(T, w * 0.42, h * 0.42, w * 0.15, h * 0.4, h * 0.06, h * 0.05, bodyM, { rz: -0.5, rx: -0.4 });
    u.arm = u.armR; u.arms = [u.armL, u.armR]; u.handL = pivot(u.armL, 0, -h * 0.4, 0); u.handR = pivot(u.armR, 0, -h * 0.4, 0); u.hands = [u.handL, u.handR];
  }
  return u;
}

// ---------------------------------------------------------------- held things (built along +y from the hand; the hand tilts them forward)
const grip = (hand, tilt = 1.15) => { hand.rotation.x = tilt; return hand; };
function axe(c, hand, { len = 0.55, m = WOOD, headM = IRON, two = false } = {}) {
  grip(hand); part(hand, cyl(0.022, 0.028, len, 5), m, 0, len * 0.35, 0);
  part(hand, box(0.05, 0.2, 0.22), headM, 0, len * 0.78, 0.1); if (two) part(hand, box(0.05, 0.2, 0.22), headM, 0, len * 0.78, -0.1);
  return hand;
}
function hammer(c, hand, { len = 0.9, m = WOOD, headM = IRON, r = 0.16 } = {}) { grip(hand, 1.0); part(hand, cyl(0.03, 0.035, len, 5), m, 0, len * 0.35, 0); part(hand, lump(r, 0, 3, 0.2), headM, 0, len * 0.8, 0); return hand; }
function knife(c, hand, { len = 0.32, m = IRON, gripM = WOOD } = {}) { grip(hand, 1.3); part(hand, cyl(0.02, 0.02, 0.1, 4), gripM, 0, 0.02, 0); part(hand, box(0.018, len, 0.055), m, 0, len / 2 + 0.07, 0); return hand; }
function spear(c, hand, { len = 1.6, m = WOOD, tipM = IRON, flagM } = {}) {
  grip(hand, 1.4); part(hand, cyl(0.02, 0.022, len, 5), m, 0, len * 0.3, 0); part(hand, cone(0.045, 0.22, 4), tipM, 0, len * 0.8 + 0.1, 0);
  if (flagM) part(hand, box(0.02, 0.2, 0.28), flagM, 0, len * 0.72, 0.14, { shadow: false });
  return hand;
}
function staff(c, hand, { len = 1.3, m = WOOD, top } = {}) { grip(hand, 0.3); part(hand, cyl(0.022, 0.026, len, 5), m, 0, len * 0.3, 0); if (top) top(len * 0.8); return hand; }
function bow(c, parent, x, y, z, { r = 0.38, m = WOOD, stringM = CREAM } = {}) {
  const g = pivot(parent, x, y, z); part(g, torus(r, 0.022, 4, 9, PI), m, 0, 0, 0, { rz: -HALF, ry: HALF }); part(g, box(0.008, r * 2, 0.008), stringM, 0, 0, -r * 0.05, { shadow: false }); return g;
}
function roundShield(c, arm, { r = 0.28, m = WOOD, rimM = IRON, bossM = CREAM, y } = {}) {
  const g = pivot(arm, 0, y ?? -arm.userData.len * 0.55, 0.1);
  part(g, cyl(r, r, 0.035, 10), m, 0, 0, 0, { rx: HALF }); part(g, torus(r, 0.02, 3, 10), rimM, 0, 0, 0.02, { shadow: false }); part(g, ico(r * 0.3, 0), bossM, 0, 0, 0.03, { sz: 0.5 });
  return g;
}
function towerShield(c, arm, { w = 0.5, h = 0.9, m = IRON, deviceM } = {}) {
  const g = pivot(arm, 0, -arm.userData.len * 0.5, 0.12); part(g, box(w, h, 0.05), m, 0, 0, 0);
  if (deviceM) { part(g, box(w * 0.35, h * 0.3, 0.02), deviceM, 0, -h * 0.05, 0.035); part(g, cyl(w * 0.18, w * 0.18, 0.02, 7), deviceM, 0, h * 0.1, 0.035, { rx: HALF }); }
  return g;
}
function key(c, hand, { len = 0.5, m = '#c9a85c' } = {}) { grip(hand, 1.3); part(hand, cyl(0.018, 0.018, len, 5), m, 0, len * 0.4, 0); part(hand, torus(0.05, 0.015, 4, 8), m, 0, -0.04, 0); part(hand, box(0.02, 0.07, 0.06), m, 0, len * 0.82, 0.03); part(hand, box(0.02, 0.05, 0.04), m, 0, len * 0.72, 0.03); return hand; }
function rod(c, hand, { len = 0.7, m = '#4a4458', headM = '#c9a85c' } = {}) { grip(hand, 0.6); part(hand, cyl(0.02, 0.022, len, 5), m, 0, len * 0.35, 0); part(hand, box(0.09, 0.11, 0.04), headM, 0, len * 0.85, 0); part(hand, box(0.05, 0.07, 0.05), m, 0, len * 0.85, 0.005); return hand; }
function pick(c, hand, { len = 0.6, m = WOOD, headM = IRON } = {}) { grip(hand); part(hand, cyl(0.022, 0.026, len, 5), m, 0, len * 0.35, 0); part(hand, cone(0.035, 0.3, 4), headM, 0, len * 0.8, 0.14, { rx: HALF }); part(hand, cone(0.035, 0.18, 4), headM, 0, len * 0.8, -0.1, { rx: -HALF }); return hand; }

// ---------------------------------------------------------------- family bases
/** Hollowhorn: squat, broad, big head, fur collar, white stag-paint stripes over the eyes. Palette: leather, iron, red, gold. */
function hollowhorn(c, o = {}) {
  const [leather, iron] = c.pal;
  const u = bipedRig(c, { legH: o.legH ?? 0.36, legR: o.legR ?? 0.1, hipW: 0.15, torsoW: o.torsoW ?? 0.56, torsoH: o.torsoH ?? 0.5, torsoD: o.torsoD ?? 0.4, armLen: o.armLen ?? 0.42, armR: o.armR ?? 0.085,
    headR: o.headR ?? 0.27, legM: leather, torsoM: o.torsoM || iron, armM: leather, headM: leather, torso: 'box', neck: 0.0 });
  const hr = u.headR;
  part(u.head, torus(hr * 0.95, hr * 0.28, 4, 8), o.collarM || iron, 0, hr * 0.15, 0, { rx: HALF });                      // fur collar
  u.eyes = eyes(c, u.head, hr * 0.38, hr * 0.95, hr * 0.92, hr * 0.2, c.glow('#e0a84a'));
  for (const s of [-1, 1]) part(u.head, box(hr * 0.16, hr * 0.7, 0.02), CREAM, s * hr * 0.38, hr * 1.1, hr * 0.98, { shadow: false });   // stag paint
  part(u.head, box(hr * 0.5, hr * 0.12, 0.02), CREAM, 0, hr * 0.65, hr * 0.99, { shadow: false });
  return u;
}
/** A Hollowhorn iron cap: a dome with (count) horns; broken = one horn stubbed. */
function hornCap(c, u, { count = 2, m = c.pal[1], hornM = CREAM, broken = false, tall = false, len = 0.26 } = {}) {
  const hr = u.headR;
  part(u.head, dome(hr * 1.02, 8), m, 0, hr * 1.05, 0);
  if (count === 1) part(u.head, cone(0.06, len, 5), hornM, 0, hr * 1.9, 0, { rx: -0.3 });
  else if (count === 4) { horns(c, u.head, { x: hr * 0.65, y: hr * 1.55, len, m: hornM }); horns(c, u.head, { x: hr * 0.4, y: hr * 1.75, z: -hr * 0.4, len: len * 0.8, m: hornM, lean: 0.4 }); }
  else {
    part(u.head, cone(0.06, broken ? len * 0.45 : len, 5), hornM, -hr * 0.7, hr * 1.55, 0.05, { rz: 0.9, rx: -0.3 });
    part(u.head, cone(0.06, len, 5), hornM, hr * 0.7, hr * 1.55, 0.05, { rz: -0.9, rx: -0.3 });
  }
  if (tall) part(u.head, cone(hr * 0.5, hr * 1.2, 6), m, 0, hr * 1.9, 0);
}
/** A cloak / cape: a double-sided plane hanging from the shoulders. */
const cloak = (c, u, m, { w = 0.5, h = 0.6, y } = {}) => part(u.torso, box(w, h, 0.02), m, 0, (y ?? u.shoulderY) - h / 2, -u.torsoMesh.scale.z - 0.03, { shadow: false });

// ---------------------------------------------------------------- per-monster builders
// Each takes the build context c (c.pal, c.P[i] palette materials, c.E eye glow, c.body, c.u the rig) and dresses it.
const BUILD = {
  // ===== Tidewrack: crabs, shoal-fish, gull-things, brine-hags
  tideling_crab(c) {   // "a dome with one huge claw held up; eye stalks tip the player off to which way is front"
    const [shell, pale, dark] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.22, 0); u.torso = T;
    part(T, lump(1, 1, 11, 0.1), shell, 0, 0, 0, { sx: 0.45, sy: 0.24, sz: 0.36 });
    for (const [x, z] of [[-0.15, 0.1], [0.2, -0.05], [0.0, -0.2]]) part(T, cone(0.05, 0.08, 5), pale, x, 0.2, z);          // barnacles
    u.legs = bugLegs(c, T, { n: 6, len: 0.16, r: 0.025, y: -0.05, x: 0.38, zFrom: 0.2, zTo: -0.2, lift: 0.35, m: dark });
    const big = limb(T, 0.3, 0.02, 0.28, 0.22, 0.05, 0.06, shell, { rz: -1.4, rx: 1.0 }); u.arm = big;
    const pin = pivot(big, 0, -0.22, 0); part(pin, box(0.12, 0.3, 0.1), shell, 0.03, -0.14, 0, { rz: 0.3 }); u.claw = pivot(pin, -0.03, 0, 0);
    part(u.claw, box(0.08, 0.24, 0.07), dark, -0.06, -0.12, 0, { rz: -0.3 });                                                 // the moving pincer half
    const small = limb(T, -0.3, 0.0, 0.26, 0.14, 0.035, 0.04, shell, { rz: 1.3, rx: 0.9 }); u.armL = small;
    part(small, box(0.07, 0.14, 0.05), shell, 0, -0.18, 0); part(small, box(0.04, 0.1, 0.04), dark, -0.04, -0.17, 0, { rz: -0.4 });
    u.stalks = [-1, 1].map(s => { const st = limb(T, s * 0.1, 0.12, 0.3, 0.14, 0.015, 0.015, dark, { rx: -0.6, rz: -s * 0.3, n: 4 }); eye(c, st, 0, -0.15, 0, 0.035); st.rotation.x = -2.5; return st; });
    u.fit = 'z'; u.death = 'flip'; u.gait = { f: 11, sidle: true };
  },
  shoal_snapper(c) {   // "a fish standing up on fins, mouth open; the dorsal fin is a flag"
    const [teal, pale, orange] = c.P, u = c.u;
    quadRig(c, { len: 0.95, chest: 0.19, legH: 0.18, legR: 0.045, headR: 0.17, neck: -0.02, bodyM: teal, legM: pale, headM: teal, jaw: false, spread: 0.12, legSet: 0.28 });
    for (const L of u.legs) { L.children[0].visible = false; part(L, box(0.03, 0.2, 0.12), pale, 0, -0.08, 0, { rz: 0.3 }); }                 // fin-legs
    part(u.torso, shape('dorsal', [[0, 0], [-0.12, 0.3], [-0.3, 0.33], [-0.42, 0.05]]), mat(c.pal[2], 'both'), 0, 0.1, 0.1, { ry: -HALF, shadow: false });
    part(u.torso, shape('tailfin', [[0, 0], [-0.22, 0.17], [-0.16, 0], [-0.22, -0.17]]), mat(c.pal[2], 'both'), 0, 0, -0.45, { ry: -HALF, shadow: false });
    part(u.torso, box(0.26, 0.03, 0.2), pale, 0, -0.16, 0.1);                                                                               // belly
    u.jaw = pivot(u.head, 0, -0.06, 0.02); part(u.jaw, box(0.3, 0.1, 0.26), pale, 0, -0.05, 0.14); u.jaw.rotation.x = 0.45;
    for (let i = 0; i < 4; i++) part(u.jaw, cone(0.022, 0.06, 4), WHITE, -0.1 + i * 0.066, 0.02, 0.24);
    u.eyes = [-1, 1].map(s => { part(u.head, ico(0.055, 0), WHITE, s * 0.14, 0.1, 0.12); return eye(c, u.head, s * 0.15, 0.1, 0.16, 0.03, mat(DARK)); });
    u.gait = { f: 12, wobble: 0.12 }; u.death = 'side';
  },
  gullhawk(c) {   // "wide flat wings, big hooked beak; reads as a seagull drawn angry"
    const [pale, slate, orange] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.3, 0); u.torso = T;
    part(T, ball(1), pale, 0, 0, 0, { sx: 0.17, sy: 0.16, sz: 0.3 }); part(T, box(0.12, 0.08, 0.2), slate, 0, 0.1, -0.05);
    u.head = pivot(T, 0, 0.12, 0.27); part(u.head, ball(1), pale, 0, 0.05, 0.03, { s: 0.13 });
    part(u.head, cone(0.05, 0.22, 4), orange, 0, 0.03, 0.18, { rx: HALF + 0.35 }); u.eyes = eyes(c, u.head, 0.08, 0.09, 0.1, 0.035);
    u.wings = wingPair(c, T, { span: 1.05, chord: 0.3, x: 0.1, y: 0.05, z: 0.02, m: pale, tipM: slate });
    for (let i = -1; i <= 1; i++) part(T, box(0.08, 0.02, 0.26), pale, i * 0.08, 0, -0.4, { ry: i * 0.35, shadow: false });     // splayed tail
    for (const s of [-1, 1]) part(T, box(0.05, 0.02, 0.08), orange, s * 0.07, -0.15, -0.02);
    u.fit = 'z'; u.hover = 1.6; u.flap = 3; u.death = 'tumble';
  },
  barnacle_shellback(c) {   // "a boulder on legs with three white barnacle spikes"
    const [moss, pale, teal] = c.P, u = c.u;
    quadRig(c, { len: 1.5, chest: 0.42, legH: 0.3, legR: 0.09, headR: 0.14, neck: 0.02, bodyM: moss, legM: moss, headM: moss, body: 'lump', jaw: false, spread: 0.3, headUp: -0.7 });
    u.torsoMesh.scale.set(0.62, 0.5, 0.75);
    for (const [x, z, r] of [[0.15, 0.2, 0.09], [-0.2, -0.1, 0.11], [0.05, -0.35, 0.08]]) part(u.torso, cone(r, r * 2.6, 5), pale, x, 0.42, z);   // barnacles: do not move
    part(u.head, cone(0.1, 0.2, 5), pale, 0, -0.1, 0.1, { rx: PI });                                                             // beard
    u.eyes = eyes(c, u.head, 0.08, 0.05, 0.13, 0.035);
    for (const s of [-1, 1]) part(u.torso, plane(0.18, 0.4), mat(c.pal[2], 'both'), s * 0.6, -0.1, -0.1, { ry: HALF, shadow: false });     // seaweed drape
    u.gait = { f: 4, lift: 0.3 }; u.death = 'side';
  },
  brinewife(c) {   // "tall and thin with a three-spike crown and hair that drags; the pearl is the only bright spot"
    const [skin, hair, pale, pearl] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.5, legR: 0.06, hipW: 0.1, torsoW: 0.34, torsoH: 0.55, torsoD: 0.26, armLen: 0.6, armR: 0.05, headR: 0.17, legM: skin, torsoM: skin, armM: skin, headM: skin, torso: 'cone', hunch: 0.3 });
    const hr = u.headR;
    for (let i = 0; i < 3; i++) part(u.head, cone(0.06, 0.22, 5), pale, (i - 1) * 0.1, hr * 1.7, -0.02, { rz: -(i - 1) * 0.5 });   // shell crown
    part(u.head, box(0.36, 0.9, 0.12), hair, 0, hr * 0.5 - 0.3, -hr * 0.9);                                                   // hair to the waist
    for (const s of [-1, 1]) part(u.head, box(0.08, 0.5, 0.1), hair, s * hr * 0.9, hr * 0.3 - 0.1, -0.02);
    u.eyes = eyes(c, u.head, hr * 0.35, hr * 0.9, hr * 0.9, hr * 0.2);
    for (const h of u.hands) { h.children[0].visible = false; part(h, box(0.09, 0.12, 0.03), skin, 0, -0.03, 0); }           // webbed hands
    u.pearl = part(u.torso, ico(0.07, 1), c.glow(pearl), 0, u.torsoH * 0.75, 0.2, { shadow: false }); u.orb = u.pearl;
    for (const a of u.arms) a.rotation.x = -0.9;
    u.gait = { f: 5, lift: 0.2 }; u.death = 'melt';
  },
  drowned_husk(c) {   // "a stiff-armed sailor shape with a crab on one shoulder"
    const [skin, shirt, crab, eyeC] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.55, legR: 0.09, hipW: 0.15, torsoW: 0.6, torsoH: 0.6, torsoD: 0.45, armLen: 0.62, armR: 0.07, headR: 0.2, legM: shirt, torsoM: shirt, armM: skin, headM: skin, torso: 'ball' });
    for (let i = 0; i < 3; i++) part(u.torso, box(0.62, 0.05, 0.46), skin, 0, 0.12 + i * 0.16, 0, { shadow: false });        // torn stripes
    part(u.torso, box(0.64, 0.08, 0.48), c.m('#2aa6a0'), 0, 0.42, 0);                                                     // seaweed wrap
    part(u.legs[0], box(0.2, 0.12, 0.28), DARK, 0, -0.5, 0.05);                                                              // one boot
    part(u.torso, ball(1), crab, 0.3, u.torsoH + 0.05, 0.05, { sx: 0.1, sy: 0.05, sz: 0.08 }); part(u.torso, box(0.04, 0.03, 0.06), crab, 0.38, u.torsoH + 0.06, 0.09);
    u.head.rotation.z = 0.35; u.eyes = eyes(c, u.head, 0.08, 0.17, 0.17, 0.045);
    for (const a of u.arms) a.rotation.x = -1.2;
    u.gait = { f: 4.5, lift: 0.15, stiff: true }; u.death = 'forward';
  },
  // ===== Fieldpest: rats, moles, wasps, weevils, mould
  grain_rat(c) {   // "small, fast, many; a wedge with a tail"
    const [fur, husk, pink] = c.P, u = c.u;
    quadRig(c, { len: 0.42, chest: 0.11, legH: 0.07, legR: 0.018, headR: 0.09, neck: -0.03, tail: 0.4, tailR: 0.015, bodyM: fur, legM: pink, headM: fur, tailM: pink, jaw: false, spread: 0.07 });
    u.headMesh.scale.set(0.08, 0.07, 0.16); part(u.head, cone(0.04, 0.1, 4), fur, 0, 0, 0.2, { rx: HALF });
    for (const s of [-1, 1]) part(u.head, cyl(0.035, 0.035, 0.01, 6), pink, s * 0.06, 0.08, 0.0, { rx: HALF });               // round ears
    u.eyes = eyes(c, u.head, 0.04, 0.03, 0.14, 0.018, mat(DARK)); part(u.head, ico(0.015, 0), pink, 0, 0, 0.25);
    part(u.torso, cone(0.04, 0.09, 4), husk, 0.02, 0.1, -0.05, { rx: 0.5 });                                                 // grain husk stuck on
    u.gait = { f: 16, lift: 0.5 }; u.death = 'side';
  },
  churnmole(c) {   // "a barrel with two shovels in front; the pink star nose is the face"
    const [dark, brown, pink] = c.P, u = c.u;
    quadRig(c, { len: 1.3, chest: 0.3, legH: 0.18, legR: 0.06, headR: 0.2, neck: -0.05, bodyM: dark, legM: dark, headM: dark, body: 'barrel', jaw: false, spread: 0.22, headUp: 0, legSet: -0.3 });
    u.legs.splice(2, 2).forEach(L => L.parent.remove(L));                                                                  // the back pair only
    for (const s of [-1, 1]) { const a = limb(u.torso, s * 0.3, -0.05, 0.4, 0.22, 0.07, 0.07, dark, { rz: -s * 0.5, rx: -0.9 }); part(a, box(0.16, 0.24, 0.05), brown, 0, -0.3, 0.02, { rz: s * 0.1 }); u.legs.push(a); if (s > 0) u.arm = a; else u.armL = a; }
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; part(u.head, cone(0.02, 0.06, 4), pink, Math.cos(a) * 0.05, 0.02 + Math.sin(a) * 0.05, 0.3, { rx: HALF }); }   // star nose
    u.eyes = eyes(c, u.head, 0.1, 0.12, 0.2, 0.02);
    for (const [x, z] of [[0.1, 0.2], [-0.15, -0.1], [0.05, -0.4]]) part(u.torso, lump(0.09, 0, 4), brown, x, 0.27, z);         // dirt clods
    u.gait = { f: 5, lift: 0.1, dig: true }; u.death = 'flip';
  },
  chaffwasp(c) {   // "a striped bead with two transparent discs; yellow/black reads do not touch"
    const [yellow, black, wingC] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.25, 0); u.torso = T;
    part(T, ball(1), yellow, 0, 0, -0.14, { sx: 0.11, sy: 0.1, sz: 0.19 }); for (const z of [-0.08, -0.17, -0.26]) part(T, torus(0.1, 0.02, 3, 8), black, 0, 0, z, { shadow: false });
    part(T, ball(1), black, 0, 0.02, 0.08, { s: 0.09 }); u.head = pivot(T, 0, 0.03, 0.18); part(u.head, ico(0.07, 1), yellow, 0, 0, 0);
    u.eyes = eyes(c, u.head, 0.05, 0.02, 0.04, 0.03, mat(DARK));
    for (const s of [-1, 1]) part(u.head, cyl(0.006, 0.006, 0.16, 3), black, s * 0.03, 0.1, 0.03, { rz: -s * 0.5, rx: -0.4 });
    part(T, cone(0.03, 0.14, 4), black, 0, 0, -0.38, { rx: -HALF });                                                        // stinger
    u.wings = wingPair(c, T, { span: 0.3, chord: 0.2, x: 0.05, y: 0.08, z: 0, kind: 'disc', m: wingC });
    for (const s of [-1, 1]) { part(T, cyl(0.008, 0.008, 0.12, 3), black, s * 0.06, -0.1, 0.02, { rz: s * 0.6 }); part(T, box(0.03, 0.02, 0.04), yellow, s * 0.1, -0.15, 0.02); }
    u.fit = 'z'; u.hover = 1.1; u.flap = 30; u.death = 'tumble';
  },
  mill_weevil(c) {   // "an oval with a long needle nose; flour-white top"
    const [brown, flour, yellow] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.2, 0); u.torso = T;
    part(T, ball(1), brown, 0, 0, -0.05, { sx: 0.22, sy: 0.17, sz: 0.32 }); part(T, lump(1, 1, 9, 0.12), flour, 0, 0.1, -0.05, { sx: 0.17, sy: 0.08, sz: 0.25, shadow: false });
    u.head = pivot(T, 0, 0.02, 0.27); part(u.head, ball(1), brown, 0, 0, 0, { s: 0.1 }); u.eyes = eyes(c, u.head, 0.06, 0.04, 0.06, 0.025);
    u.spin = pivot(u.head, 0, 0, 0.08); part(u.spin, cyl(0.012, 0.025, 0.36, 5), brown, 0, 0, 0.18, { rx: HALF }); part(u.spin, box(0.04, 0.01, 0.2), yellow, 0, 0.02, 0.2);
    for (const s of [-1, 1]) { const a = limb(u.head, s * 0.05, 0.06, 0.06, 0.14, 0.008, 0.008, brown, { rz: s * 1.6, rx: -0.3, n: 3 }); limb(a, 0, -0.14, 0, 0.12, 0.008, 0.006, brown, { rz: -s * 1.4, n: 3 }); }
    u.legs = bugLegs(c, T, { n: 6, len: 0.14, r: 0.02, y: -0.08, x: 0.2, zFrom: 0.18, zTo: -0.2, lift: 0.5, m: brown });
    u.fit = 'z'; u.gait = { f: 12 }; u.death = 'flip';
  },
  mould_shambler(c) {   // "a heap with four mushroom caps for hair; wider than tall"
    const [moss, capC, cloth] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0, 0); u.torso = T;
    part(T, lump(1, 1, 21, 0.2), moss, 0, 0.55, 0, { sx: 0.75, sy: 0.58, sz: 0.65 }); part(T, lump(1, 1, 22, 0.25), moss, 0, 0.2, 0, { sx: 0.9, sy: 0.25, sz: 0.8 });
    for (const [x, y, z, ry] of [[0.3, 0.6, 0.45, 0.3], [-0.4, 0.4, 0.3, -0.6], [0.1, 0.85, -0.5, 2.5]]) part(T, box(0.25, 0.2, 0.02), cloth, x, y, z, { ry, shadow: false });   // sack-cloth patches
    for (const [x, z, r] of [[0.15, 0.1, 0.14], [-0.2, 0.15, 0.11], [0.05, -0.2, 0.12], [-0.1, -0.05, 0.09]]) { part(T, cyl(r * 0.3, r * 0.35, r * 1.5, 5), CREAM, x, 1.05 + r * 0.5, z); part(T, dome(r, 7), capC, x, 1.05 + r * 1.4, z); }
    u.head = pivot(T, 0, 0.8, 0.5); u.eyes = eyes(c, u.head, 0.16, 0.0, 0.1, 0.07, mat(DARK));
    u.armL = limb(T, -0.7, 0.75, 0.1, 0.4, 0.13, 0.1, moss, { rz: 0.5 }); u.armR = limb(T, 0.7, 0.75, 0.1, 0.4, 0.13, 0.1, moss, { rz: -0.5 }); u.arm = u.armR; u.arms = [u.armL, u.armR];
    u.gait = { f: 2.5 }; u.death = 'deflate';
  },
  // ===== Hollowhorn warband: warm wood-and-red
  hollowhorn_raider(c, row, o) {   // "short, wide, two horns and a round shield; the shield is the thing you walk around"
    const lvl = o.level || row.levelRange[0], [leather, iron, red, gold] = c.pal;
    const u = hollowhorn(c, { torsoM: lvl >= 7 ? IRON : leather });
    hornCap(c, u, { count: 2, broken: lvl < 7 });
    axe(c, u.handR, { m: leather, headM: iron }); u.weapon = u.handR;
    roundShield(c, u.armL, { r: 0.3, m: leather, rimM: iron, bossM: CREAM });
    if (lvl >= 7) cloak(c, u, red, { w: 0.45, h: 0.5 });
    if (lvl >= 13) { for (const s of [-1, 1]) part(u.torso, box(0.2, 0.12, 0.3), iron, s * 0.3, u.shoulderY + 0.04, 0); part(u.torso, box(0.03, 0.14, 0.14), iron, 0.25, 0.1, -0.2); }   // pauldrons + spare axe
    u.gait = { f: 6, lift: 0.3 }; u.death = 'forward';
  },
  hollowhorn_slinger(c) {   // "the thin one with one horn and a whirling arm"
    const [leather, hide, red, gold] = c.pal;
    const u = hollowhorn(c, { torsoW: 0.42, torsoH: 0.5, torsoD: 0.3, armR: 0.065, headR: 0.24, torsoM: hide, legR: 0.08 });
    hornCap(c, u, { count: 1, m: leather });
    part(u.torso, box(0.3, 0.3, 0.06), hide, 0, 0.3, 0.17);                                                                 // hide vest
    part(u.torso, lump(0.1, 0, 5), hide, -0.28, 0.08, 0.02);                                                                 // stone bag
    grip(u.handR, 0.6); part(u.handR, cyl(0.008, 0.008, 0.5, 3), leather, 0, 0.2, 0); part(u.handR, ico(0.04, 0), hide, 0, 0.45, 0); u.weapon = u.handR; u.whirl = true;
    u.gait = { f: 7, lift: 0.35 }; u.death = 'forward';
  },
  hollowhorn_cutthroat(c) {   // "dark, crouched, two blades out to the sides; horns through the hood"
    const [dark, leather, red, gold] = c.pal;
    const u = hollowhorn(c, { torsoW: 0.42, torsoH: 0.46, torsoD: 0.3, armR: 0.065, headR: 0.23, torsoM: dark, legR: 0.07, collarM: dark });
    for (const L of u.legs) L.children[1].material = mat(leather);   // bare feet
    const hr = u.headR; part(u.head, cone(hr * 1.3, hr * 2.3, 7), dark, 0, hr * 1.1, 0);                                       // hood
    horns(c, u.head, { x: hr * 0.6, y: hr * 1.6, len: 0.14, r: 0.045, lean: 0.8 });
    part(u.head, box(hr * 1.6, hr * 0.45, 0.04), red, 0, hr * 0.55, hr * 0.92);                                               // scarf over the mouth
    knife(c, u.handR, { gripM: leather }); knife(c, u.handL, { gripM: leather }); u.weapon = u.handR; u.dual = true;
    u.torso.rotation.x = 0.35; u.armL.rotation.z = 0.9; u.armR.rotation.z = -0.9;
    u.gait = { f: 9, lift: 0.4 }; u.death = 'forward';
  },
  hollowhorn_bonechanter(c) {   // "the antlers: twice as wide as any other Hollowhorn head"
    const [leather, bone, red, ember] = c.pal;
    const u = hollowhorn(c, { torsoM: leather, headR: 0.26 }), hr = u.headR;
    part(u.head, ball(1), bone, 0, hr * 1.15, 0.06, { sx: hr * 0.95, sy: hr * 0.8, sz: hr * 1.1 });                         // the stag skull worn as a helm
    part(u.head, box(hr * 0.5, hr * 0.4, hr * 0.6), bone, 0, hr * 0.9, hr * 1.1);
    u.antlerM = new THREE.MeshLambertMaterial({ color: bone, flatShading: true, emissive: red, emissiveIntensity: 0 }); c.u.glow.push(u.antlerM);
    antlers(c, u.head, { x: hr * 0.5, y: hr * 1.6, len: 0.42, r: 0.03, m: u.antlerM, spread: 1.0 });
    for (let i = 0; i < 3; i++) part(u.torso, torus(0.2 + i * 0.04, 0.018, 3, 9, PI), bone, 0, u.torsoH * 0.78 - i * 0.07, 0.17, { rx: HALF + 0.3, rz: PI, shadow: false });   // bone necklaces
    staff(c, u.handR, { len: 1.3, m: leather, top: y => { part(u.handR, ico(0.08, 1), bone, 0, y + 0.04, 0); part(u.handR, box(0.05, 0.04, 0.06), bone, 0, y - 0.03, 0.04); } }); u.weapon = u.handR;
    cloak(c, u, red, { w: 0.55, h: 0.55 }); for (let i = 0; i < 4; i++) part(u.torso, box(0.1, 0.18, 0.02), bone, -0.22 + i * 0.15, u.shoulderY - 0.5, -0.24, { shadow: false });   // feathered edge
    for (const h of u.hands) h.children[0].material = mat('#8a8a88');   // ash-grey hand paint
    u.gait = { f: 5.5, lift: 0.3 }; u.death = 'forward';
  },
  hollowhorn_warcaller(c) {   // "tallest Hollowhorn, the banner pole on the back and a plume: you see it over the pack"
    const [leather, red, gold, dark] = c.pal;
    const u = hollowhorn(c, { torsoW: 0.6, torsoH: 0.58, torsoD: 0.42, armLen: 0.48, headR: 0.28, torsoM: dark, legH: 0.42 }), hr = u.headR;
    hornCap(c, u, { count: 2, m: dark, tall: true, len: 0.3 }); part(u.head, ball(1), red, 0, hr * 2.6, -0.05, { sx: 0.08, sy: 0.2, sz: 0.1 });   // plume
    spear(c, u.handR, { len: 1.7, m: leather, tipM: dark, flagM: red }); u.weapon = u.handR;
    part(u.torso, cone(0.05, 0.22, 5), gold, 0.3, 0.12, 0.1, { rz: -1.8 });                                                   // war horn at the hip
    part(u.torso, torus(0.3, 0.03, 3, 8), leather, 0, 0.14, 0, { rx: HALF });                                               // belt over the mail
    cloak(c, u, red, { w: 0.6, h: 0.65 });
    const pole = part(u.torso, cyl(0.02, 0.02, 1.2, 5), leather, 0.15, u.shoulderY + 0.3, -0.28); u.pole = pole;
    part(u.torso, box(0.3, 0.4, 0.02), red, 0.32, u.shoulderY + 0.68, -0.28, { shadow: false }); part(u.torso, ico(0.06, 0), CREAM, 0.32, u.shoulderY + 0.7, -0.26, { sz: 0.4 });
    u.gait = { f: 5.5, lift: 0.3 }; u.death = 'back';
  },
  hollowhorn_breaker(c) {   // "half again the height of a raider, the hammer is a boulder on a stick"
    const [leather, iron, red, gold] = c.pal;
    const u = hollowhorn(c, { torsoW: 0.78, torsoH: 0.7, torsoD: 0.55, armLen: 0.62, armR: 0.12, headR: 0.3, torsoM: iron, legH: 0.42, legR: 0.14 });
    hornCap(c, u, { count: 4, len: 0.3 });
    for (const s of [-1, 1]) { part(u.torso, box(0.3, 0.16, 0.4), iron, s * 0.42, u.shoulderY + 0.06, 0); part(u.torso, ico(0.08, 0), CREAM, s * 0.46, u.shoulderY + 0.16, 0.08); }   // plate shoulders + skull bosses
    part(u.torso, box(0.03, 0.03, 0.56), iron, 0, 0.42, 0.29, { ry: 0.6 }); part(u.torso, box(0.03, 0.03, 0.56), iron, 0, 0.3, 0.29, { ry: -0.6 });                                        // chains
    for (const a of u.arms) part(a, box(0.08, 0.1, 0.02), red, 0, -0.3, 0.12, { shadow: false });                                                                                        // handprints
    hammer(c, u.handR, { len: 1.1, m: leather, headM: '#8a8578', r: 0.2 }); u.weapon = u.handR; u.handR.rotation.x = 0.4;
    u.gait = { f: 4, lift: 0.25, heavy: true }; u.death = 'forward';
  },
  hollowhorn_sapper(c) {   // "the only Hollowhorn with no horns and a glowing match"
    const [leather, dark, match, gold] = c.pal;
    const u = hollowhorn(c, { torsoW: 0.42, torsoH: 0.5, torsoD: 0.3, armR: 0.065, headR: 0.24, torsoM: leather, legR: 0.08 }), hr = u.headR;
    part(u.head, dome(hr * 1.02, 8), dark, 0, hr * 1.05, 0); for (const s of [-1, 1]) part(u.head, torus(hr * 0.22, hr * 0.08, 4, 8), gold, s * hr * 0.4, hr * 1.4, hr * 0.9, { shadow: false });   // cap + goggles
    part(u.torso, box(0.34, 0.42, 0.05), dark, 0, 0.26, 0.17);                                                                // scorched apron
    part(u.torso, lump(0.12, 0, 6), leather, 0.3, 0.12, -0.05); for (const z of [-0.08, 0.06]) part(u.torso, cyl(0.04, 0.035, 0.08, 6), leather, 0.3, 0.22, z);   // satchel of pots
    u.match = part(u.torso, ico(0.03, 0), c.glow(match), -0.2, 0.12, 0.18, { shadow: false });
    for (const [x, y] of [[-0.12, 0.4], [0.1, 0.2]]) part(u.torso, box(0.08, 0.06, 0.02), dark, x, y, 0.2, { shadow: false });   // burn scars
    u.handL.children[0].material = mat(CREAM);                                                                                 // bandaged hand
    grip(u.handR, 0.5); part(u.handR, cyl(0.045, 0.04, 0.09, 6), leather, 0, 0.05, 0); u.weapon = u.handR;
    u.gait = { f: 7, lift: 0.3 }; u.death = 'forward';
  },
  hollowhorn_warhound(c) {   // "a running dog with a thick collar; the collar is what says warband"
    const [fur, red, gold, eyeC] = c.pal, u = c.u;
    quadRig(c, { len: 1.05, chest: 0.18, legH: 0.42, legR: 0.045, headR: 0.14, neck: 0.1, tail: 0.3, tailR: 0.03, bodyM: fur, legM: fur, headM: fur, tailM: fur, spread: 0.11, headUp: 0.6 });
    u.torsoMesh.scale.set(0.17, 0.2, 0.5); u.headMesh.scale.set(0.12, 0.12, 0.26);
    part(u.head, torus(0.14, 0.04, 4, 8), red, 0, 0, -0.1, { rx: HALF }); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; part(u.head, cone(0.02, 0.05, 4), IRON, Math.cos(a) * 0.15, Math.sin(a) * 0.15, -0.1, { rz: -a - HALF }); }   // spiked collar
    for (const s of [-1, 1]) part(u.head, box(0.04, 0.06, 0.03), fur, s * 0.07, 0.14, -0.02);                                 // cropped ears
    for (let i = 0; i < 3; i++) part(u.jaw, cone(0.012, 0.04, 4), WHITE, -0.04 + i * 0.04, 0.0, 0.24, { rx: PI });
    u.eyes = eyes(c, u.head, 0.06, 0.08, 0.2, 0.03); part(u.torso, box(0.03, 0.08, 0.2), CREAM, 0.17, 0.05, 0.05, { shadow: false });   // flank stripe
    u.gait = { f: 10, lift: 0.5 }; u.death = 'side';
  },
  // ===== Wild beasts
  brindle_wolf(c) {   // "a wolf with hackle tufts; stripes read even at phone scale"
    const [fur, dark, pale, eyeC] = c.pal, u = c.u;
    quadRig(c, { len: 1.1, chest: 0.2, legH: 0.42, legR: 0.05, headR: 0.15, neck: 0.1, tail: 0.45, tailR: 0.06, bodyM: fur, legM: fur, headM: fur, tailM: dark, spread: 0.12, headUp: 0.5 });
    u.torsoMesh.scale.set(0.2, 0.21, 0.52); u.headMesh.scale.set(0.14, 0.13, 0.24);
    for (let i = 0; i < 4; i++) part(u.torso, box(0.44, 0.1, 0.05), dark, 0, 0.12, 0.3 - i * 0.18, { shadow: false });          // brindle bands
    for (let i = 0; i < 3; i++) part(u.torso, cone(0.04, 0.12, 4), dark, 0, 0.2, 0.3 - i * 0.1, { rx: -0.4 });                 // raised hackles
    for (const s of [-1, 1]) part(u.head, cone(0.04, 0.1, 4), fur, s * 0.08, 0.15, -0.02, { rx: -0.3 });
    part(u.head, ball(1), pale, 0, -0.05, 0.2, { sx: 0.08, sy: 0.06, sz: 0.12 }); part(u.head, ico(0.025, 0), DARK, 0, 0.0, 0.33);
    u.eyes = eyes(c, u.head, 0.06, 0.07, 0.18, 0.03);
    u.gait = { f: 9, lift: 0.5 }; u.death = 'side';
  },
  rootboar(c) {   // "a barrel with tusks and a green root-mane"
    const [hide, green, cream, pink] = c.pal, u = c.u;
    quadRig(c, { len: 1.2, chest: 0.3, legH: 0.3, legR: 0.07, headR: 0.24, neck: 0.0, tail: 0.2, tailR: 0.02, bodyM: hide, legM: hide, headM: hide, tailM: hide, body: 'barrel', spread: 0.2, headUp: 0.1 });
    u.headMesh.scale.set(0.26, 0.22, 0.3); part(u.head, cyl(0.08, 0.08, 0.05, 7), pink, 0, -0.02, 0.38, { rx: HALF });
    for (const s of [-1, 1]) part(u.head, cone(0.035, 0.26, 4), cream, s * 0.14, -0.08, 0.3, { rx: -0.9, rz: -s * 0.3 });        // upturned tusks
    for (let i = 0; i < 6; i++) part(u.torso, cone(0.045, 0.2, 4), green, 0, 0.3, 0.45 - i * 0.16, { rx: -0.5 + (i % 2) * 0.3 });   // root mane
    for (const [z, r] of [[0.1, 0.07], [-0.15, 0.05]]) { part(u.torso, cyl(0.015, 0.02, 0.08, 5), cream, 0.3, 0.1, z); part(u.torso, dome(r, 6), cream, 0.3, 0.13, z, { rz: -0.9 }); }   // flank mushrooms
    for (const s of [-1, 1]) part(u.head, cone(0.05, 0.1, 4), hide, s * 0.15, 0.2, 0.0, { rz: -s * 0.4 });
    u.eyes = eyes(c, u.head, 0.11, 0.08, 0.25, 0.035);
    u.gait = { f: 7, lift: 0.3 }; u.death = 'side';
  },
  cairn_ram(c) {   // "a cloud of wool with two spirals on the front"
    const [wool, horn, face, eyeC] = c.pal, u = c.u;
    quadRig(c, { len: 1.3, chest: 0.33, legH: 0.42, legR: 0.06, headR: 0.17, neck: 0.1, tail: 0.1, tailR: 0.03, bodyM: wool, legM: face, headM: face, tailM: wool, body: 'lump', spread: 0.18, headUp: 0.5 });
    part(u.torso, lump(1, 1, 31, 0.22), wool, 0, 0.1, 0.1, { sx: 0.3, sy: 0.3, sz: 0.4 });
    for (const s of [-1, 1]) part(u.head, torus(0.17, 0.05, 5, 10, PI * 1.6), horn, s * 0.17, 0.1, -0.02, { ry: s * HALF, rz: 0.4 });   // curled horns
    part(u.head, cyl(0.02, 0.02, 0.1, 4), horn, 0, -0.1, 0.15); part(u.head, cone(0.04, 0.06, 6), c.m('#e0a84a'), 0, -0.17, 0.15, { rx: PI });   // bell on a cord
    u.eyes = eyes(c, u.head, 0.1, 0.08, 0.2, 0.03);
    for (const L of u.legs) part(L, cyl(0.07, 0.07, 0.12, 5), c.m('#b8b2a6'), 0, -0.4, 0, { shadow: false });              // scree dust
    u.gait = { f: 6.5, lift: 0.35 }; u.death = 'side';
  },
  ridge_lynx(c) {   // "crouched cat with ear tufts; hard to see on purpose until it moves"
    const [tan, brown, dark, pale] = c.pal, u = c.u;
    quadRig(c, { len: 1.1, chest: 0.2, legH: 0.36, legR: 0.045, headR: 0.15, neck: 0.06, tail: 0.1, tailR: 0.04, bodyM: tan, legM: tan, headM: tan, tailM: dark, spread: 0.12, headUp: 0.4 });
    u.torsoMesh.scale.set(0.2, 0.2, 0.52);
    part(u.head, torus(0.15, 0.05, 4, 9), c.m(CREAM), 0, 0.02, -0.05, { rx: HALF, shadow: false });                           // ruff
    for (const s of [-1, 1]) { part(u.head, cone(0.045, 0.1, 4), tan, s * 0.09, 0.16, 0.0); part(u.head, cone(0.015, 0.06, 4), dark, s * 0.1, 0.24, 0.0); }   // ear tufts
    for (let i = 0; i < 6; i++) part(u.torso, ico(0.035, 0), brown, (i % 2 ? 0.2 : -0.2), 0.04 + (i % 3) * 0.06, 0.25 - i * 0.09, { sx: 0.4, shadow: false });   // spots
    u.eyes = eyes(c, u.head, 0.06, 0.07, 0.17, 0.03);
    u.torso.rotation.x = 0.1; u.gait = { f: 9, lift: 0.45 }; u.death = 'side';
  },
  // ===== Thornkin: bramble walkers, sprites, roots, the elder
  bramblewight(c) {   // "a walking bush with arms too long for it; the red berries are the eyes"
    const [leaf, dark, berry] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.35, legR: 0.1, hipW: 0.2, torsoW: 0.9, torsoH: 0.85, torsoD: 0.75, armLen: 0.85, armR: 0.07, headR: 0.01, legM: dark, torsoM: leaf, armM: dark, headM: leaf, torso: 'lump', feet: false });
    u.headMesh.visible = false; u.head.position.y = 0.6; u.head.position.z = 0.3;
    for (const [x, y, z, r, s] of [[-0.3, 0.25, 0.25, 0.3, 41], [0.35, 0.35, -0.2, 0.32, 42], [0.0, 0.75, -0.25, 0.3, 43], [0.25, 0.65, 0.3, 0.26, 44]]) part(u.torso, lump(r, 1, s, 0.25), dark, x, y, z);
    for (let i = 0; i < 5; i++) part(u.torso, cyl(0.015, 0.015, 0.8, 3), dark, Math.cos(i * 2.1) * 0.3, 0.4, Math.sin(i * 2.1) * 0.3, { rx: Math.cos(i) * 0.9, rz: Math.sin(i * 1.3) * 0.9 });   // sticks
    u.eyes = eyes(c, u.head, 0.14, 0.0, 0.1, 0.06);                                                                           // berry eyes
    for (let i = 0; i < 6; i++) part(u.torso, ico(0.03, 0), berry, Math.cos(i * 1.7) * 0.4, 0.2 + i * 0.1, Math.sin(i * 1.7) * 0.4, { shadow: false });
    for (const h of u.hands) { h.children[0].visible = false; for (let i = 0; i < 4; i++) part(h, cone(0.03, 0.14, 4), dark, Math.cos(i * 1.6) * 0.05, -0.04, Math.sin(i * 1.6) * 0.05, { rx: Math.sin(i * 1.6) * 0.9, rz: -Math.cos(i * 1.6) * 0.9 }); }   // thorn clusters
    part(u.torso, cyl(0.02, 0.025, 0.35, 4), dark, 0.35, 0.95, 0.0, { rz: -0.3 }); part(u.torso, ico(0.1, 0), leaf, 0.4, 1.12, 0);        // sapling on the shoulder
    u.gait = { f: 4.5, lift: 0.25 }; u.death = 'deflate';
  },
  thistle_sprite(c) {   // "a purple puff on leaf wings; the only purple thing in the glade"
    const [green, purple, dark] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.25, 0); u.torso = T;
    part(T, cyl(0.03, 0.045, 0.3, 5), green, 0, 0, 0); u.head = pivot(T, 0, 0.2, 0);
    part(u.head, lump(0.2, 1, 17, 0.2), purple, 0, 0.1, 0); for (let i = 0; i < 7; i++) { const a = i * 0.9; part(u.head, cone(0.025, 0.12, 4), purple, Math.cos(a) * 0.17, 0.12 + Math.sin(a * 2) * 0.1, Math.sin(a) * 0.17, { rz: -Math.cos(a) * 1.3, rx: Math.sin(a) * 1.3 }); }
    u.eyes = eyes(c, u.head, 0.07, 0.08, 0.19, 0.035);
    u.armL = limb(T, -0.04, 0.05, 0, 0.18, 0.01, 0.01, green, { rz: 1.2, n: 3 }); u.armR = limb(T, 0.04, 0.05, 0, 0.18, 0.01, 0.01, green, { rz: -1.2, n: 3 }); u.arms = [u.armL, u.armR]; u.arm = u.armR;
    for (const a of u.arms) part(a, leaf(0.14, 0.07), mat(green, 'both'), 0, -0.18, 0, { rz: HALF, shadow: false });
    u.wings = [...wingPair(c, T, { span: 0.4, chord: 0.16, x: 0.04, y: 0.1, z: -0.02, kind: 'leaf', m: dark }), ...wingPair(c, T, { span: 0.32, chord: 0.14, x: 0.04, y: 0.0, z: -0.04, kind: 'leaf', m: dark })];
    part(T, cyl(0.012, 0.004, 0.3, 3), dark, 0, -0.28, -0.05, { rx: 0.3 });                                                  // root tail
    u.fit = 'y'; u.hover = 1.0; u.flap = 9; u.death = 'tumble';
  },
  hollow_elder(c) {   // "a tree that is too tall for its clearing, with a dark hole for a face"
    const [bark, leaf, berry, pale] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.7, legR: 0.14, hipW: 0.3, torsoW: 1.2, torsoH: 1.5, torsoD: 1.0, armLen: 1.4, armR: 0.12, headR: 0.01, legM: bark, torsoM: bark, armM: bark, headM: bark, torso: 'cone', feet: false });
    u.headMesh.visible = false; u.head.position.set(0, 1.0, 0.1);
    for (const L of u.legs) for (let i = 0; i < 3; i++) part(L, cone(0.09, 0.5, 4), bark, Math.cos(i * 2.1) * 0.15, -0.6, Math.sin(i * 2.1) * 0.15, { rx: Math.sin(i * 2.1) * 0.6, rz: -Math.cos(i * 2.1) * 0.6 });   // root legs
    part(u.torso, ico(0.3, 1), DARK, 0, 1.05, 0.45, { sz: 0.5 }); u.eyes = eyes(c, u.torso, 0.12, 1.1, 0.55, 0.05);           // the hollow face
    for (const a of u.arms) { part(a, ico(0.3, 0), leaf, 0, -1.3, 0.1); part(a, ico(0.22, 0), leaf, 0.2, -1.05, -0.15); part(a, cyl(0.05, 0.07, 0.5, 4), bark, 0.15, -0.9, -0.1, { rz: 0.8 }); }   // bough arms with leaf clusters
    for (const [x, y, z, r] of [[0, 2.2, 0, 0.95], [0.7, 1.9, 0.2, 0.6], [-0.7, 2.0, -0.2, 0.6], [0.1, 2.0, 0.7, 0.55]]) part(u.torso, lump(r, 1, 50 + x * 7, 0.18), leaf, x, y, z);   // the 2 m canopy
    for (const L of u.legs) { part(L, cyl(0.02, 0.025, 0.1, 5), CREAM, 0.12, -0.3, 0.1); part(L, dome(0.07, 6), CREAM, 0.12, -0.26, 0.1); }   // mushrooms on the shins
    part(u.armL, torus(0.15, 0.03, 3, 6), berry, 0, -0.5, 0, { shadow: false });                                            // the elven ribbon
    u.gait = { f: 2.5, lift: 0.2, heavy: true }; u.death = 'back';
  },
  root_choker(c) {   // "a snake of root rearing up with a split head; frills make the spine read"
    const [root, bark, berry] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.1, 0); u.torso = T; u.segs = [];
    const n = 7, seg = 0.26;
    u.rear = pivot(T, 0, 0, 0.3); u.rear.rotation.x = -1.1;                                                                 // the front rears up
    let parent = T;
    for (let i = n - 1; i >= 0; i--) {
      const r = 0.07 + i * 0.012, zpos = i >= 4 ? 0 : 0;
      const host = i >= 4 ? T : u.rear, zz = i >= 4 ? 0.3 - (i - 3) * seg : 0.05 + (3 - i) * seg;
      const s = pivot(host, 0, 0, zz); part(s, ball(1), i % 2 ? bark : root, 0, 0, 0, { sx: r, sy: r * 0.9, sz: seg * 0.62 }); s.userData.i = i; u.segs.push(s);
      if (i < 5) part(s, leaf(0.2, 0.09), mat(root, 'both'), 0, r * 0.9, 0, { rx: -HALF, rz: HALF, shadow: false });            // leaf frills along the spine
      if (i === n - 1) part(s, cone(0.04, 0.3, 4), bark, 0, 0, -0.25, { rx: -HALF });                                           // the trailing root tip
    }
    u.head = pivot(u.rear, 0, 0, 0.05 + 3 * seg + 0.12); part(u.head, ball(1), root, 0, 0, 0, { s: 0.12 });
    u.jaws = []; for (let i = 0; i < 4; i++) { const a = i * HALF + PI / 4; const j = pivot(u.head, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.05); part(j, cone(0.05, 0.22, 4), bark, 0, 0, 0.1, { rx: HALF }); j.rotation.set(-Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0); u.jaws.push(j); }
    u.eyes = eyes(c, u.head, 0.07, 0.07, 0.06, 0.03);
    u.fit = 'z'; u.gait = { f: 5 }; u.death = 'flat';
  },
  // ===== Creepers: spiders and borers
  web_spinner(c) {   // "a ball on eight high knees; the yellow hourglass tells it apart from the burrow spider"
    const [dark, hourglass, purple] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.42, 0); u.torso = T;
    part(T, ball(1), dark, 0, 0.05, -0.18, { s: 0.28 }); part(T, ball(1), dark, 0, -0.02, 0.14, { s: 0.14 });
    part(T, cone(0.07, 0.12, 4), hourglass, 0, 0.3, -0.18, { rx: PI, shadow: false }); part(T, cone(0.07, 0.12, 4), hourglass, 0, 0.42, -0.18, { shadow: false });   // the pale hourglass
    part(T, cone(0.03, 0.08, 4), purple, 0, 0.0, -0.48, { rx: -HALF });                                                      // spinneret nub
    u.head = pivot(T, 0, 0.02, 0.27); u.eyes = [...eyes(c, u.head, 0.04, 0.04, 0.0, 0.025), ...eyes(c, u.head, 0.08, 0.0, -0.02, 0.02)];
    for (const s of [-1, 1]) part(u.head, cone(0.02, 0.08, 4), purple, s * 0.04, -0.06, 0.02, { rx: PI });
    u.legs = bugLegs(c, T, { n: 8, len: 0.38, r: 0.022, y: 0, x: 0.14, zFrom: 0.2, zTo: -0.22, lift: 0.75, m: dark });
    u.fit = 'z'; u.gait = { f: 10 }; u.death = 'flip'; u.shootsBackward = true;
  },
  burrow_spider(c) {   // "wide, low and brown-backed; nothing like the ball-on-stilts spinner"
    const [dark, dirt, purple] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.26, 0); u.torso = T;
    part(T, ball(1), dark, 0, 0, -0.15, { sx: 0.42, sy: 0.2, sz: 0.5 }); part(T, ball(1), dark, 0, -0.02, 0.4, { sx: 0.3, sy: 0.16, sz: 0.28 });
    part(T, lump(1, 1, 61, 0.1), dirt, 0, 0.1, -0.15, { sx: 0.4, sy: 0.06, sz: 0.46 });                                      // the dirt-crusted lid
    u.head = pivot(T, 0, 0, 0.6); u.eyes = eyes(c, u.head, 0.08, 0.06, 0.05, 0.035);
    for (const s of [-1, 1]) part(u.head, cone(0.035, 0.22, 4), purple, s * 0.07, -0.1, 0.05, { rx: PI + 0.3 });            // fangs
    u.legs = bugLegs(c, T, { n: 8, len: 0.28, r: 0.045, y: -0.05, x: 0.38, zFrom: 0.38, zTo: -0.3, lift: 0.3, m: dark, n2: 5 });
    for (const L of u.legs) part(L, cone(0.04, 0.08, 4), dirt, 0, -0.15, 0, { rz: HALF });                                      // hair tufts
    u.fit = 'z'; u.gait = { f: 8 }; u.death = 'flip';
  },
  spiderling(c) {   // "many small purple dots that move together"
    const [dark, purple] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.1, 0); u.torso = T;
    part(T, ico(0.1, 0), purple, 0, 0, -0.06); part(T, ico(0.065, 0), dark, 0, -0.01, 0.08);
    u.head = pivot(T, 0, 0, 0.1); eye(c, u.head, 0, 0.02, 0.05, 0.025);
    u.legs = bugLegs(c, T, { n: 8, len: 0.1, r: 0.01, y: -0.02, x: 0.07, zFrom: 0.08, zTo: -0.1, lift: 0.6, m: dark, n2: 3 });
    u.fit = 'z'; u.gait = { f: 14 }; u.death = 'pop';
  },
  root_borer(c) {   // "a segmented beetle with a drill for a face"
    const [dark, brown, amber] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.3, 0); u.torso = T;
    for (let i = 0; i < 3; i++) part(T, ball(1), i === 1 ? brown : dark, 0, 0, 0.35 - i * 0.5, { sx: 0.3, sy: 0.24, sz: 0.3 });
    u.head = pivot(T, 0, 0.02, 0.62); u.spin = pivot(u.head, 0, 0, 0.05); part(u.spin, cone(0.14, 0.4, 5), brown, 0, 0, 0.2, { rx: HALF });
    for (const s of [-1, 1]) part(u.head, cone(0.03, 0.2, 4), dark, s * 0.14, -0.05, 0.1, { rx: HALF + 0.2, rz: -s * 0.7 });   // mandibles
    u.eyes = eyes(c, u.head, 0.12, 0.12, 0.0, 0.03);
    for (let i = 0; i < 5; i++) part(T, ico(0.03, 0), c.glow(c.pal[2]), Math.cos(i * 2.3) * 0.26, 0.12 + (i % 2) * 0.1, 0.3 - i * 0.3, { shadow: false });   // sap beads
    u.legs = bugLegs(c, T, { n: 6, len: 0.22, r: 0.04, y: -0.1, x: 0.28, zFrom: 0.4, zTo: -0.5, lift: 0.4, m: dark, n2: 5 });
    u.fit = 'z'; u.gait = { f: 7 }; u.death = 'side';
  },
  // ===== Elderkin: what the elves left
  glade_warden(c) {   // "a tall figure with a slot-face and leaf-clusters for hands; the glowing chest stone"
    const [wood, leafC, bronze, stone] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.6, legR: 0.13, hipW: 0.22, torsoW: 0.8, torsoH: 1.0, torsoD: 0.6, armLen: 0.95, armR: 0.1, headR: 0.22, legM: wood, torsoM: wood, armM: wood, headM: wood, torso: 'box', feet: false, headD: 0.8 });
    for (const L of u.legs) for (const s of [-1, 1]) part(L, cone(0.07, 0.3, 4), wood, s * 0.1, -0.55, 0.05, { rz: -s * 0.5 });   // root feet
    for (const [x, y, w, h] of [[-0.18, 0.5, 0.05, 0.5], [0.18, 0.5, 0.05, 0.5], [0, 0.72, 0.4, 0.05], [0, 0.28, 0.4, 0.05]]) part(u.torso, box(w, h, 0.02), leafC, x, y, 0.31, { shadow: false });   // knotwork
    u.orb = part(u.torso, ico(0.09, 1), c.glow(stone), 0, 0.5, 0.32, { shadow: false });
    for (const s of [-1, 1]) part(u.torso, lump(0.18, 0, 71, 0.2), leafC, s * 0.42, 0.95, 0, { sy: 0.6 });                   // moss shoulders
    part(u.head, box(0.3, 0.08, 0.04), DARK, 0, 0.2, 0.19);                                                                  // the slot of the carved face
    part(u.head, box(0.1, 0.18, 0.03), bronze, 0, 0.05, 0.2, { shadow: false });
    for (const h of u.hands) { h.children[0].visible = false; part(h, ico(0.16, 1), leafC, 0, -0.05, 0); part(h, ico(0.1, 0), leafC, 0.1, 0.05, 0.05); }
    for (const a of u.arms) part(a, cyl(0.04, 0.05, 0.4, 4), wood, 0.08, -0.5, 0.05, { rz: 0.5 });
    part(u.armL, cyl(0.02, 0.02, 0.15, 4), bronze, 0, -0.35, 0.12); part(u.armL, cone(0.07, 0.1, 6), bronze, 0, -0.45, 0.12, { rx: PI });   // the bronze bell
    u.gait = { f: 3, lift: 0.2, heavy: true }; u.death = 'kneel';
  },
  oathbound_archer(c) {   // "tall, slim, see-through, a bow; the mist-feet say ghost at any distance"
    const [ghostC, pale, gold] = c.pal, u = c.u, G = mat(ghostC, 'ghost');
    bipedRig(c, { legs: false, torsoW: 0.36, torsoH: 0.6, torsoD: 0.25, armLen: 0.6, armR: 0.045, headR: 0.16, torsoM: G, armM: G, headM: G });
    u.torso.position.y = 0.95;
    part(u.torso, cyl(0.16, 0.02, 0.9, 7), mat(ghostC, 'film'), 0, -0.45, 0, { shadow: false });                               // feet that trail into mist
    for (const s of [-1, 1]) part(u.head, cone(0.03, 0.18, 4), G, s * 0.16, 0.17, 0, { rz: -s * 1.5 });                        // long ears
    part(u.head, torus(0.15, 0.015, 3, 9), gold, 0, 0.2, 0, { rx: HALF, shadow: false });                                        // torn circlet
    u.eyes = eyes(c, u.head, 0.06, 0.15, 0.14, 0.03, mat(pale));
    part(u.torso, cyl(0.045, 0.045, 0.4, 5), gold, -0.14, 0.45, -0.16, { rz: 0.3 });                                            // quiver
    u.armL.rotation.x = -1.3; u.weapon = bow(c, u.armL, 0, -0.6, 0, { r: 0.42, m: '#d8c9a0', stringM: pale });
    u.armR.rotation.x = -1.1; u.armR.rotation.y = 0.5;
    u.hover = 0.1; u.fit = 'y'; u.gait = { f: 3, glide: true }; u.death = 'fade'; u.archer = true;
  },
  moonsworn_cantor(c) {   // "hands up, crescent crown, a book floating in front; the only elderkin with a crown"
    const [robeC, ghostC, gold, pale] = c.pal, u = c.u, G = mat(robeC, 'ghost');
    robedRig(c, { h: 1.7, rTop: 0.18, rBot: 0.36, robeM: G, armM: mat(ghostC, 'ghost'), headR: 0.16, hood: false, armLen: 0.55 });
    u.headMesh.material = mat(ghostC, 'ghost');
    part(u.torso, cyl(0.36, 0.05, 0.4, 8), mat(robeC, 'film'), 0, -0.1, 0, { shadow: false });                                  // hem into mist
    part(u.head, torus(0.17, 0.025, 4, 10, PI * 1.3), gold, 0, 0.36, 0, { rz: PI * 0.85, shadow: false });                     // crescent crown
    for (const s of [-1, 1]) part(u.head, cone(0.03, 0.18, 4), mat(ghostC, 'ghost'), s * 0.16, 0.17, 0, { rz: -s * 1.5 });
    u.eyes = eyes(c, u.head, 0.06, 0.15, 0.14, 0.03, mat(pale));
    for (const a of u.arms) { a.rotation.x = -2.3; }
    u.book = pivot(u.torso, 0, 0.6, 0.45); part(u.book, plane(0.22, 0.3), mat(CREAM, 'both'), -0.11, 0, 0, { rx: -HALF - 0.4, ry: 0.4, shadow: false }); part(u.book, plane(0.22, 0.3), mat(CREAM, 'both'), 0.11, 0, 0, { rx: -HALF - 0.4, ry: -0.4, shadow: false });
    u.hover = 0.15; u.gait = { f: 3, glide: true }; u.death = 'fade'; u.castsBothHands = true;
  },
  // ===== The Restless: bone-and-blue
  barrow_husk(c, row, o) {   // "stiff-armed shroud-wrapped walker; blue eye-lights"
    const lvl = o.level || row.levelRange[0], [skin, shroud, torc] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.6, legR: 0.07, hipW: 0.13, torsoW: 0.5, torsoH: 0.6, torsoD: 0.32, armLen: 0.62, armR: 0.06, headR: 0.18, legM: skin, torsoM: lvl >= 14 ? '#6a6a70' : shroud, armM: skin, headM: skin, torso: 'box' });
    for (const [y, ry] of [[0.15, 0.3], [0.32, -0.4], [0.5, 0.2]]) part(u.torso, box(0.56, 0.07, 0.38), shroud, 0, y, 0, { ry: ry * 0.3, shadow: false });   // shroud strips
    part(u.legs[1], box(0.16, 0.08, 0.16), shroud, 0, -0.25, 0);
    part(u.torso, torus(0.15, 0.03, 4, 8, PI * 1.5), torc, 0, u.torsoH - 0.02, 0.03, { rx: HALF, rz: PI * 0.75 });            // bronze torc
    u.handL.children[0].material = mat(BONE); part(u.handL, box(0.03, 0.1, 0.02), BONE, 0.03, -0.08, 0);                        // the bone hand
    for (const s of [-1, 1]) part(u.torso, lump(0.08, 0, 5 + s), '#5e4a36', s * 0.26, u.torsoH + 0.02, 0);                   // grave soil
    u.head.rotation.z = -0.3; part(u.head, box(0.16, 0.08, 0.14), skin, 0, 0.03, 0.1, { rx: 0.5 });                           // hanging jaw
    u.eyes = eyes(c, u.head, 0.07, 0.17, 0.16, 0.04);
    if (lvl >= 18) { part(u.head, dome(0.19, 7), IRON, 0, 0.2, 0); part(u.torso, cyl(0.24, 0.24, 0.04, 9), '#6a6a70', 0, 0.35, -0.2, { rx: HALF }); }   // helm + shield on the back
    for (const a of u.arms) a.rotation.x = -1.3;
    u.gait = { f: 4, lift: 0.15, stiff: true }; u.death = 'forward';
  },
  rattlebone_archer(c) {   // "a skeleton with a bow; the kettle helm reads as a dome"
    const [bone, dark, blue] = c.pal, u = c.u;
    skeletonRig(c, { h: 1.7 });
    const hr = u.headR; part(u.head, dome(hr * 1.1, 8), '#6a5a50', 0, hr * 0.95, 0); part(u.head, torus(hr * 1.15, 0.02, 3, 9), '#6a5a50', 0, hr * 0.95, 0, { rx: HALF });   // kettle helm
    u.torso.children[3].scale.x = 0.55;                                                                                        // one rib missing
    part(u.torso, cyl(0.04, 0.04, 0.42, 5), dark, -0.12, 0.4, -0.15, { rz: 0.3 }); for (let i = 0; i < 3; i++) part(u.torso, cone(0.015, 0.06, 3), bone, -0.18 + i * 0.05, 0.66, -0.17, { shadow: false });   // quiver
    u.armL.rotation.x = -1.3; u.weapon = bow(c, u.armL, 0, -0.5, 0, { r: 0.36, m: bone, stringM: CREAM });
    u.armR.rotation.x = -1.1; u.armR.rotation.y = 0.5;
    u.gait = { f: 5, lift: 0.3, stiff: true }; u.death = 'collapse'; u.archer = true;
  },
  gravecandle(c) {   // "a skull with a flame on it, floating; the light says kill me"
    const [bone, wax, blue] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.18, 0); u.torso = T; u.head = T;
    part(T, ball(1), bone, 0, 0, 0, { sx: 0.16, sy: 0.17, sz: 0.18 }); part(T, box(0.14, 0.06, 0.13), bone, 0, -0.14, 0.05, { rx: 0.3 });     // the jaw, open
    u.eyes = eyes(c, T, 0.065, 0.02, 0.15, 0.04);
    for (const [x, y] of [[0.08, 0.1], [-0.05, 0.06], [0.0, 0.13]]) part(T, box(0.03, 0.12, 0.02), wax, x, y, 0.17, { shadow: false });          // wax runs down the face
    candle(c, T, 0, 0.15, 0, { h: 0.2, r: 0.04, flame: 0.14, m: wax });
    for (let i = 1; i <= 3; i++) part(T, ico(0.03 - i * 0.005, 0), wax, Math.sin(i) * 0.05, -0.12 - i * 0.07, -0.1 - i * 0.1, { shadow: false });   // wax drops behind
    u.fit = 'y'; u.hover = 1.2; u.flap = 0; u.death = 'drop';
  },
  shroudmother(c) {   // "the tallest, thinnest thing in the crypt with no face; the needle hand"
    const [bone, shroud, blue] = c.pal, u = c.u;
    robedRig(c, { h: 1.9, rTop: 0.14, rBot: 0.3, robeM: shroud, armM: shroud, headR: 0.15, hood: false, armLen: 0.75, armR: 0.045 });
    u.headMesh.material = mat(shroud); part(u.head, cone(0.17, 0.4, 7), shroud, 0, 0.25, 0);                                    // the shroud over the head: no face
    u.faceGlow = part(u.head, ico(0.07, 1), c.glow(blue), 0, 0.12, 0.09, { shadow: false, sz: 0.5 });
    for (let i = 0; i < 5; i++) part(u.torso, box(0.08, 0.2, 0.02), shroud, -0.26 + i * 0.13, -0.05, 0.28 * Math.cos(i * 0.8), { ry: i * 0.6, shadow: false });   // the torn hem
    for (const h of u.hands) { h.children[0].visible = false; for (let i = 0; i < 3; i++) part(h, cone(0.012, 0.18, 3), bone, (i - 1) * 0.03, -0.08, 0, { rx: PI }); }   // needle fingers
    for (let i = 0; i < 3; i++) part(u.torso, cyl(0.03, 0.03, 0.08, 6), bone, -0.15 + i * 0.15, 0.25, 0.3);                     // thread spools
    u.armR.rotation.x = -2.2; part(u.handR, cyl(0.012, 0.008, 0.3, 4), bone, 0, 0.15, 0.03, { rx: 0.5 });                          // the hooked needle held up
    u.gait = { f: 3, glide: true }; u.death = 'deflate'; u.castsBothHands = true;
  },
  bone_hound(c) {   // "a running ribcage with a light inside"
    const [bone, dark, blue] = c.pal, u = c.u;
    quadRig(c, { len: 1.0, chest: 0.17, legH: 0.4, legR: 0.03, headR: 0.13, neck: 0.1, tail: 0.3, tailR: 0.02, bodyM: bone, legM: bone, headM: bone, tailM: bone, spread: 0.1, headUp: 0.5 });
    u.torsoMesh.visible = false; part(u.torso, cyl(0.025, 0.025, 1.0, 5), bone, 0, 0.1, 0, { rx: HALF });
    for (let i = 0; i < 4; i++) part(u.torso, torus(0.15, 0.018, 3, 7, PI), bone, 0, 0.1, 0.25 - i * 0.16, { rz: PI, shadow: false });     // ribs hang down from the spine
    u.flameOrb = part(u.torso, ico(0.08, 1), c.glow(blue), 0, 0.0, 0.08, { shadow: false });
    u.headMesh.scale.set(0.1, 0.1, 0.28); u.jaw.children[0].scale.set(0.9, 0.6, 1); u.eyes = eyes(c, u.head, 0.05, 0.07, 0.2, 0.03);
    part(u.head, torus(0.12, 0.025, 4, 8), dark, 0, 0, -0.08, { rx: HALF });                                                    // chain collar
    for (let i = 0; i < 5; i++) part(u.torso, cone(0.02, 0.07, 4), bone, 0, 0.14, 0.3 - i * 0.14);                               // spine spikes
    u.gait = { f: 10, lift: 0.5 }; u.death = 'collapse';
  },
  sludge_husk(c) {   // "a husk but wide and dripping; yellow-green instead of bone-white"
    const [green, dark, bile, blue] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.5, legR: 0.11, hipW: 0.17, torsoW: 0.75, torsoH: 0.75, torsoD: 0.6, armLen: 0.62, armR: 0.09, headR: 0.2, legM: dark, torsoM: green, armM: green, headM: green, torso: 'lump' });
    part(u.torso, box(0.3, 0.04, 0.08), CREAM, -0.15, 0.45, 0.3, { rz: 0.4 });                                                   // a rib showing
    for (const [x, y, z] of [[0.2, 0.1, 0.3], [-0.3, 0.2, 0.1], [0.1, 0.05, -0.3]]) part(u.torso, cone(0.04, 0.14, 4), bile, x, y, z, { rx: PI, shadow: false });   // drips
    for (const a of u.arms) part(a, cone(0.03, 0.1, 4), bile, 0.02, -0.64, 0, { rx: PI, shadow: false });
    for (let i = 0; i < 5; i++) part(u.head, cyl(0.008, 0.008, 0.1, 3), bile, -0.08 + i * 0.04, 0.4, -0.02 + (i % 2) * 0.05);   // reed stubble
    part(u.head, ico(0.05, 0), DARK, 0.12, 0.02, 0.1); part(u.head, ico(0.05, 1), bile, 0, 0.08, 0.2, { sy: 0.5 });              // leech on the neck, bile at the mouth
    u.eyes = eyes(c, u.head, 0.07, 0.2, 0.17, 0.04);
    for (const a of u.arms) a.rotation.x = -1.0;
    u.gait = { f: 3.5, lift: 0.12, stiff: true }; u.death = 'swell';
  },
  drowned_shade(c) {   // "a see-through sailor with a trailing coat; no legs"
    const [coatC, blue, rope] = c.pal, u = c.u, G = mat(coatC, 'ghost');
    robedRig(c, { h: 1.7, rTop: 0.2, rBot: 0.3, robeM: G, armM: G, headR: 0.15, hood: false, armLen: 0.7, armR: 0.05 });
    u.headMesh.material = G;
    part(u.torso, cyl(0.3, 0.03, 0.5, 7), mat(coatC, 'film'), 0, -0.2, 0, { shadow: false });                                     // the trailing coat
    part(u.head, torus(0.11, 0.025, 4, 8), rope, 0, 0.02, 0, { rx: HALF, shadow: false }); part(u.head, cyl(0.02, 0.02, 0.25, 4), rope, 0.05, -0.12, 0.1);   // rope round the neck
    u.eyes = eyes(c, u.head, 0.055, 0.15, 0.13, 0.035);
    for (const a of u.arms) a.rotation.x = -1.4;
    u.hover = 0.2; u.fit = 'y'; u.gait = { f: 3, glide: true }; u.death = 'sink';
  },
  ossuary_knight(c) {   // "the big armoured one with a tower shield; the crown-rim helm"
    const [plate, bone, gold, blue] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.62, legR: 0.11, hipW: 0.17, torsoW: 0.7, torsoH: 0.7, torsoD: 0.45, armLen: 0.65, armR: 0.1, headR: 0.22, legM: plate, torsoM: plate, armM: plate, headM: plate, torso: 'box', headD: 1.1 });
    part(u.head, cyl(0.24, 0.24, 0.05, 8), gold, 0, 0.42, 0); for (let i = 0; i < 6; i++) part(u.head, box(0.05, 0.08, 0.04), gold, Math.sin(i * 1.05) * 0.22, 0.48, Math.cos(i * 1.05) * 0.22);   // crown rim
    part(u.head, box(0.26, 0.05, 0.04), DARK, 0, 0.2, 0.22); u.eyes = eyes(c, u.head, 0.07, 0.2, 0.23, 0.035);                 // visor slit
    for (const s of [-1, 1]) part(u.torso, box(0.3, 0.14, 0.4), plate, s * 0.38, u.shoulderY + 0.05, 0);
    part(u.torso, plane(0.36, 0.55), mat('#3fa0e0', 'both'), 0, 0.3, 0.24, { shadow: false }); part(u.torso, box(0.14, 0.12, 0.02), gold, 0, 0.4, 0.25, { shadow: false });   // tabard + device
    towerShield(c, u.armL, { w: 0.52, h: 0.95, m: plate, deviceM: gold });
    grip(u.handR, 1.2); part(u.handR, box(0.07, 1.1, 0.025), bone, 0, 0.6, 0); part(u.handR, box(0.3, 0.05, 0.05), gold, 0, 0.1, 0); u.weapon = u.handR;
    u.gait = { f: 3.5, lift: 0.2, heavy: true }; u.death = 'collapse';
  },
  barrow_reeve(c) {   // "the tall cap and the rod; the only Restless that is not armed for war"
    const [robeC, gold, bone, blue] = c.pal, u = c.u;
    robedRig(c, { h: 1.9, rTop: 0.2, rBot: 0.34, robeM: robeC, armM: robeC, headR: 0.16, hood: false, armLen: 0.55 });
    u.headMesh.material = mat(bone); part(u.head, box(0.16, 0.06, 0.14), bone, 0, 0.04, 0.09); u.eyes = eyes(c, u.head, 0.06, 0.16, 0.15, 0.035);
    part(u.head, cyl(0.15, 0.14, 0.4, 8), robeC, 0, 0.5, 0); part(u.head, torus(0.15, 0.025, 4, 9), gold, 0, 0.36, 0, { rx: HALF, shadow: false });   // the tall cap + crown band
    part(u.torso, torus(0.2, 0.02, 3, 9, PI), gold, 0, 1.0, 0.18, { rx: HALF + 0.4, rz: PI, shadow: false });                   // chain of office
    part(u.torso, box(0.18, 0.24, 0.06), CREAM, 0.3, 0.45, 0.1); part(u.torso, cyl(0.01, 0.01, 0.2, 3), gold, 0.3, 0.65, 0.1);   // ledger on the belt
    rod(c, u.handR, { len: 0.75, m: robeC, headM: gold }); u.weapon = u.handR;
    u.gait = { f: 3.5, glide: true }; u.death = 'sink';
  },
  boneweaver(c) {   // "four arms and a spread ribcage; it looks like a bone spider standing up"
    const [bone, dark, blue] = c.pal, u = c.u;
    skeletonRig(c, { h: 1.8, torsoW: 0.5 });
    const s = 1.8 / 1.7, T = u.torso, armLen = 0.5 * s;
    const a2L = limb(T, -0.22 * s, 0.3 * s, 0.02, armLen, 0.04 * s, 0.035 * s, bone, { rz: 0.5 }), a2R = limb(T, 0.22 * s, 0.3 * s, 0.02, armLen, 0.04 * s, 0.035 * s, bone, { rz: -0.5 });
    for (const a of [a2L, a2R]) { const h = pivot(a, 0, -armLen, 0); part(h, ico(0.05, 0), bone); u.hands.push(h); } u.arms.push(a2L, a2R); u.lowerArms = [a2L, a2R];
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) part(T, torus(0.3 + i * 0.08, 0.02, 3, 6, PI * 0.9), bone, sd * 0.1, 0.6, -0.1, { ry: sd * (0.9 + i * 0.25), rz: HALF, shadow: false });   // the ribcage spread like wings
    for (let i = 0; i < 5; i++) part(u.head, cone(0.025, 0.12 + (i % 2) * 0.06, 4), bone, Math.sin(i * 1.25 - 2.5) * 0.14, 0.34, Math.cos(i * 1.25 - 2.5) * 0.14);   // bone crown
    u.thread = part(T, box(0.5, 0.012, 0.012), c.glow(blue), 0, 0.55, 0.35, { shadow: false });                                 // threads of light between the hands
    part(T, plane(0.14, 0.4), mat(CREAM, 'both'), -0.2, 0.1, 0.1, { shadow: false });                                            // the hanging scroll of names
    for (const a of u.arms) a.rotation.x = -1.4;
    u.gait = { f: 3.5, lift: 0.2, stiff: true }; u.death = 'collapse'; u.castsBothHands = true;
  },
  // ===== The Gravesworn: dark-and-gold-candle
  gravesworn_digger(c) {   // "a hooded stoop with a pick and a candle on the head"
    const [dark, apron, gold] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.5, legR: 0.08, hipW: 0.13, torsoW: 0.46, torsoH: 0.5, torsoD: 0.32, armLen: 0.52, armR: 0.065, headR: 0.17, legM: apron, torsoM: dark, armM: dark, headM: dark, hunch: 0.5 });
    const hr = u.headR; part(u.head, cone(hr * 1.3, hr * 2.2, 7), dark, 0, hr * 1.0, 0); part(u.head, cyl(hr * 0.8, hr * 0.8, hr * 0.4, 7), DARK, 0, hr * 0.7, hr * 0.4);   // hood
    u.eyes = eyes(c, u.head, 0.05, 0.12, 0.16, 0.03);
    candle(c, u.head, 0, hr * 2.05, 0, { h: 0.1, r: 0.022, flame: 0.07, m: gold });
    part(u.torso, box(0.36, 0.42, 0.04), apron, 0, 0.2, 0.17); part(u.torso, box(0.08, 0.1, 0.02), gold, 0, 0.42, 0.19, { shadow: false }); part(u.torso, torus(0.05, 0.012, 3, 8, PI), gold, 0, 0.44, 0.2, { shadow: false });   // apron + chalk door sigil
    u.lantern = part(u.torso, box(0.08, 0.1, 0.08), c.flame(), -0.25, 0.08, 0.05, { shadow: false });
    for (const h of u.hands) h.children[0].material = mat(DARK);
    pick(c, u.handR, { m: apron, headM: dark }); u.weapon = u.handR;
    u.gait = { f: 6, lift: 0.3 }; u.death = 'forward';
  },
  gravesworn_chanter(c) {   // "a hooded figure with a crown of five flames; the key"
    const [dark, gold, plum, flameC] = c.pal, u = c.u;
    robedRig(c, { h: 1.5, rTop: 0.18, rBot: 0.3, robeM: dark, armM: dark, headR: 0.15, hoodM: dark });
    const hr = u.headR; u.eyes = eyes(c, u.head, 0.05, hr * 0.85, hr * 0.5, 0.03);
    candleCrown(c, u.head, 5, hr * 1.05, hr * 1.5, { h: 0.1, r: 0.02, flame: 0.07 });
    part(u.torso, box(0.1, 0.13, 0.02), gold, 0, 0.6, 0.2, { shadow: false }); part(u.torso, torus(0.06, 0.012, 3, 8, PI), gold, 0, 0.64, 0.21, { shadow: false });   // door sigil
    part(u.torso, torus(0.24, 0.02, 3, 9), gold, 0, 0.35, 0, { rx: HALF, shadow: false });                                       // chain belt
    for (const [x, z] of [[0.1, 0.9], [-0.08, 0.5], [0.0, -1.2]]) part(u.head, box(0.03, 0.15, 0.02), CREAM, Math.sin(z) * hr * 1.1 * x * 8, hr * 0.8, Math.cos(z) * hr * 1.1, { ry: z, shadow: false });   // wax runs
    key(c, u.handR, { len: 0.45, m: gold }); u.weapon = u.handR; u.armR.rotation.x = -1.2;
    u.gait = { f: 4, glide: true }; u.death = 'forward'; u.castsBothHands = true;
  },
  gravesworn_keeper(c) {   // "the chanter's shape with two candles and a swinging censer"
    const [dark, gold, plum, flameC] = c.pal, u = c.u;
    robedRig(c, { h: 1.5, rTop: 0.22, rBot: 0.34, robeM: dark, armM: dark, headR: 0.15, hoodM: dark });
    const hr = u.headR; u.eyes = eyes(c, u.head, 0.05, hr * 0.85, hr * 0.5, 0.03);
    candleCrown(c, u.head, 2, hr * 0.9, hr * 1.6, { h: 0.1, r: 0.022, flame: 0.08, offset: HALF });
    for (const s of [-1, 1]) part(u.torso, box(0.08, 0.6, 0.02), gold, s * 0.1, 0.55, 0.22, { shadow: false });                   // chain stole
    part(u.torso, cyl(0.09, 0.09, 0.03, 8), gold, 0, 0.62, 0.22, { rx: HALF });                                                  // the bronze seal-disc
    for (const h of u.hands) h.children[0].material = mat(DARK);                                                                  // gloves
    u.armR.rotation.x = -1.0; u.censer = pivot(u.handR, 0, 0, 0); part(u.censer, cyl(0.006, 0.006, 0.35, 3), gold, 0, -0.17, 0); part(u.censer, ico(0.06, 1), gold, 0, -0.36, 0); part(u.censer, cone(0.03, 0.08, 4), c.flame(), 0, -0.3, 0, { shadow: false });
    u.gait = { f: 4, glide: true }; u.death = 'forward';
  },
  gravesworn_candlebearer(c) {   // "a tall light: the great candle is taller than the pack"
    const [dark, gold, plum, flameC] = c.pal, u = c.u;
    robedRig(c, { h: 1.7, rTop: 0.2, rBot: 0.36, robeM: dark, armM: dark, headR: 0.16, hoodM: dark, armLen: 0.55 });
    const hr = u.headR; u.eyes = eyes(c, u.head, 0.05, hr * 0.85, hr * 0.5, 0.03);
    candleCrown(c, u.head, 9, hr * 1.1, hr * 1.45, { h: 0.09, r: 0.018, flame: 0.06 });
    part(u.torso, torus(0.36, 0.03, 3, 10), gold, 0, 0.02, 0, { rx: HALF, shadow: false });                                      // gold trim at the hem
    part(u.torso, box(0.12, 0.15, 0.02), gold, 0, 0.7, 0.22, { shadow: false }); part(u.torso, torus(0.07, 0.014, 3, 8, PI), gold, 0, 0.75, 0.23, { shadow: false });
    u.armR.rotation.x = -0.6; grip(u.handR, 0); part(u.handR, cyl(0.05, 0.055, 1.5, 7), CREAM, 0, 0.55, 0); const f = part(u.handR, cone(0.08, 0.26, 4), c.flame(), 0, 1.42, 0, { shadow: false }); u.flames.push(f);   // the great candle
    u.armL.rotation.x = -0.9; grip(u.handL, 1.0); part(u.handL, cyl(0.02, 0.025, 0.5, 5), gold, 0, 0.2, 0); u.flames.push(part(u.handL, cone(0.05, 0.14, 4), c.flame(), 0, 0.5, 0, { shadow: false }));   // the brand
    u.weapon = u.handL; u.gait = { f: 4, glide: true }; u.death = 'forward';
  },
  // ===== Mirefolk: fen yellow
  bogtongue_croaker(c) {   // "a squat lump with a yellow balloon throat"
    const [green, yellow, mud, eyeC] = c.pal, u = c.u;
    frogRig(c, { w: 1.0, h: 0.75, bodyM: green, sacM: yellow });
    part(u.torso, cyl(0.02, 0.025, 1.1, 5), mud, -0.2, 0.5, -0.3, { rz: 0.5, rx: 0.3 }); part(u.torso, cone(0.04, 0.16, 4), mud, -0.45, 0.95, -0.45, { rz: 0.5 });   // reed spear on the back
    for (let i = 0; i < 6; i++) part(u.torso, ico(0.03, 0), mud, Math.cos(i * 1.9) * 0.35, 0.3 + (i % 3) * 0.1, Math.sin(i * 1.9) * 0.35, { shadow: false });   // mud freckles
    u.fit = 'y'; u.gait = { f: 6, hop: true }; u.death = 'deflate'; u.archer = true;
  },
  mire_lurker(c) {   // "a log with eyes; on land, a long low shape with a tail that is a third of it"
    const [mud, moss, yellow, eyeC] = c.pal, u = c.u;
    quadRig(c, { len: 1.7, chest: 0.26, legH: 0.18, legR: 0.06, headR: 0.2, neck: 0.05, tail: 0.9, tailR: 0.14, bodyM: mud, legM: mud, headM: mud, tailM: mud, spread: 0.28, headUp: 0.2, jaw: false });
    u.torsoMesh.scale.set(0.3, 0.2, 0.85); u.headMesh.visible = false;
    part(u.head, box(0.36, 0.12, 0.8), mud, 0, 0.06, 0.3); u.jaw = pivot(u.head, 0, -0.02, -0.1); part(u.jaw, box(0.34, 0.08, 0.8), mud, 0, -0.04, 0.4);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) part(u.jaw, cone(0.015, 0.05, 3), WHITE, s * 0.15, 0.02, 0.15 + i * 0.13, { shadow: false });   // teeth showing
    for (let i = 0; i < 6; i++) part(u.torso, cone(0.06, 0.12, 4), moss, 0, 0.2, 0.6 - i * 0.24);                                 // ridged back plates
    for (const [x, z] of [[0.12, 0.1], [-0.15, -0.3]]) { part(u.torso, lump(0.1, 0, 3, 0.3), moss, x, 0.2, z); part(u.torso, cyl(0.01, 0.01, 0.3, 3), moss, x, 0.35, z); }   // moss and reeds growing on it
    u.eyes = [-1, 1].map(s => { part(u.head, ball(1), mud, s * 0.13, 0.14, 0.15, { s: 0.07 }); return eye(c, u.head, s * 0.13, 0.17, 0.18, 0.035); });   // eyes on top
    part(u.legs[0], torus(0.07, 0.02, 3, 7), BONE, 0, -0.12, 0, { rx: HALF, shadow: false });                                     // the digger's armlet
    u.gait = { f: 5, lift: 0.2, drag: true }; u.death = 'flip';
  },
  leechswarm(c) {   // "a dark tide with yellow stripes that moves as one shape"
    const [dark, yellow, mouth] = c.P, u = c.u;
    const T = pivot(c.body, 0, 0.05, 0); u.torso = T;
    part(T, ball(1), dark, 0, 0, 0, { sx: 0.14, sy: 0.08, sz: 0.3 }); part(T, box(0.04, 0.02, 0.5), yellow, 0, 0.07, 0, { shadow: false });
    u.head = pivot(T, 0, 0, 0.3); part(u.head, torus(0.05, 0.02, 4, 8), mouth, 0, 0, 0, { shadow: false });
    u.fit = 'z'; u.gait = { f: 6, inch: true }; u.death = 'pop';
  },
  mudwitch(c) {   // "the croaker shape but with a reed crown and a dripping staff"
    const [green, mud, yellow, eyeC] = c.pal, u = c.u;
    frogRig(c, { w: 0.8, h: 0.7, bodyM: green, sacM: yellow }); u.throat.scale.multiplyScalar(0.6); u.throat.userData.rest *= 0.6;
    part(u.torso, cyl(0.42, 0.5, 0.35, 8), mud, 0, 0.4, -0.05);                                                                    // mud-caked shawl
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; part(u.head, cyl(0.012, 0.012, 0.2 + (i % 2) * 0.1, 3), i % 2 ? WHITE : mud, Math.sin(a) * 0.2, 0.42, Math.cos(a) * 0.2, { rz: -Math.sin(a) * 0.4, rx: Math.cos(a) * 0.4 }); }   // crown of reeds and bones
    for (let i = 0; i < 5; i++) part(u.torso, ico(0.03, 0), WHITE, -0.16 + i * 0.08, 0.5, 0.38, { shadow: false });                   // snail shell necklace
    staff(c, u.handR, { len: 1.1, m: mud, top: y => { part(u.handR, ball(1), yellow, 0, y, 0, { s: 0.08 }); part(u.handR, cone(0.02, 0.06, 4), yellow, 0.05, y - 0.08, 0, { rx: PI, shadow: false }); } }); u.weapon = u.handR;
    u.fit = 'y'; u.gait = { f: 5, hop: true }; u.death = 'sink';
  },
  marsh_light(c) {   // "a green light over the water with a tail"
    const [lightC, core, white] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.2, 0); u.torso = T; u.head = T;
    u.orb = part(T, ball(1), c.glow(lightC), 0, 0, 0, { s: 0.2, shadow: false }); u.orb.material.transparent = true; u.orb.material.opacity = 0.75;
    part(T, ico(0.1, 1), core, 0, 0, 0.02, { shadow: false }); u.eyes = eyes(c, T, 0.035, 0.02, 0.09, 0.02, mat(DARK));
    for (let i = 0; i < 3; i++) part(T, cone(0.04, 0.35, 4), mat(lightC, 'film'), Math.sin(i * 2.1) * 0.08, Math.cos(i * 2.1) * 0.08 - 0.05, -0.3, { rx: -HALF, shadow: false });   // trailing wisps
    u.fit = 'y'; u.hover = 0.9; u.flap = 0; u.death = 'pop'; u.noShadow = true;
  },
  // ===== Wyrmkin: drakes and kites
  scree_drake(c) {   // "wings and a crest; the glowing throat says breath coming"
    const [rust, dark, amber, eyeC] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.55, 0); u.torso = T;
    part(T, ball(1), rust, 0, 0, 0, { sx: 0.2, sy: 0.2, sz: 0.5 }); for (let i = 0; i < 4; i++) part(T, cone(0.04, 0.1, 4), amber, 0, 0.18, 0.3 - i * 0.18, { rx: -0.3 });   // rust-tipped scales
    u.head = pivot(T, 0, 0.12, 0.5); part(u.head, ball(1), rust, 0, 0.02, 0.1, { sx: 0.12, sy: 0.12, sz: 0.2 }); part(u.head, cone(0.07, 0.22, 4), dark, 0, 0, 0.32, { rx: HALF });   // beak-jaw
    u.jaw = pivot(u.head, 0, -0.04, 0.1); part(u.jaw, box(0.1, 0.04, 0.22), dark, 0, -0.02, 0.1);
    for (let i = 0; i < 3; i++) part(u.head, cone(0.03, 0.14, 4), dark, 0, 0.12, 0.02 - i * 0.07, { rx: -0.6 - i * 0.2 });        // bony crest
    u.throat = part(u.head, ico(0.07, 1), c.glow(amber), 0, -0.08, 0.02, { shadow: false }); u.throat.userData.rest = 1;
    u.eyes = eyes(c, u.head, 0.07, 0.07, 0.14, 0.03);
    u.wings = wingPair(c, T, { span: 1.25, chord: 0.5, x: 0.15, y: 0.08, z: 0.05, kind: 'bat', m: dark });
    u.tail = pivot(T, 0, 0, -0.45); part(u.tail, cone(0.08, 0.8, 5), rust, 0, 0, -0.4, { rx: -HALF });
    for (const s of [-1, 1]) { const L = limb(T, s * 0.12, -0.15, 0.1, 0.25, 0.04, 0.03, rust, { rx: 0.8 }); u.legs.push(L); }
    u.fit = 'z'; u.hover = 1.5; u.flap = 4; u.death = 'tumble';
  },
  cliff_kite(c) {   // "a forked-tail bird with a blue crest; longer wings than the gullhawk"
    const [dark, amber, storm, eyeC] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.3, 0); u.torso = T;
    part(T, ball(1), dark, 0, 0, 0, { sx: 0.12, sy: 0.11, sz: 0.3 }); part(T, box(0.1, 0.06, 0.2), amber, 0, -0.06, 0.02);
    u.head = pivot(T, 0, 0.08, 0.28); part(u.head, ball(1), dark, 0, 0.02, 0.02, { s: 0.1 }); part(u.head, cone(0.035, 0.14, 4), amber, 0, 0.0, 0.12, { rx: HALF + 0.3 });
    for (let i = 0; i < 3; i++) part(u.head, cone(0.02, 0.1, 4), c.glow(storm), (i - 1) * 0.04, 0.12, -0.02, { rx: -0.5, shadow: false });   // the crackling crest
    u.eyes = eyes(c, u.head, 0.06, 0.05, 0.07, 0.03);
    u.wings = wingPair(c, T, { span: 1.4, chord: 0.22, x: 0.08, y: 0.03, z: 0.02, m: dark, tipM: amber });
    for (const s of [-1, 1]) part(T, box(0.06, 0.02, 0.45), dark, s * 0.08, 0, -0.45, { ry: -s * 0.3, shadow: false });            // forked tail
    for (const s of [-1, 1]) part(T, cone(0.02, 0.08, 4), amber, s * 0.05, -0.12, 0.05, { rx: PI });                               // hooked feet
    u.fit = 'z'; u.hover = 2.0; u.flap = 2.5; u.death = 'tumble';
  },
  // ===== Stonebound: golems, wardens, watchers
  cairn_sentinel(c) {   // "a stack of slabs with a slot-face; runes glow when locked"
    const [stone, pale, rune] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.7, legR: 0.18, hipW: 0.3, torsoW: 1.2, torsoH: 1.3, torsoD: 0.7, armLen: 1.0, armR: 0.17, headR: 0.3, legM: stone, torsoM: stone, armM: stone, headM: stone, torso: 'box', feet: false, headD: 0.9 });
    u.torsoMesh.visible = false; for (let i = 0; i < 5; i++) part(u.torso, box(1.15 - Math.abs(i - 2) * 0.12, 0.24, 0.66), i % 2 ? pale : stone, (i % 2 ? 0.04 : -0.04), 0.13 + i * 0.26, 0, { ry: (i - 2) * 0.05 });   // the five slabs
    for (const L of u.legs) { L.children[0].visible = false; part(L, box(0.34, 0.7, 0.4), stone, 0, -0.35, 0); }
    for (const a of u.arms) { a.children[0].visible = false; part(a, box(0.3, 1.0, 0.3), stone, 0, -0.5, 0); }
    u.headMesh.visible = false; part(u.head, box(0.55, 0.5, 0.5), pale, 0, 0.27, 0); u.runeM = c.glow(rune); part(u.head, box(0.4, 0.07, 0.06), u.runeM, 0, 0.3, 0.26, { shadow: false }); u.eyes = eyes(c, u.head, 0.1, 0.3, 0.28, 0.035, u.runeM); for (const [x, y, w, h] of [[0, 0.75, 0.5, 0.03], [-0.2, 0.6, 0.03, 0.4], [0.2, 0.6, 0.03, 0.4], [0, 0.4, 0.3, 0.03]]) part(u.torso, box(w, h, 0.02), u.runeM, x, y, 0.35, { shadow: false });   // rune lines
    part(u.torso, cyl(0.025, 0.025, 0.8, 5), IRON, 0.5, 1.4, 0.0, { rz: -0.8, rx: 0.3 });                                        // the broken spear
    for (const [x, y, z] of [[-0.5, 0.9, 0.2], [0.3, 1.25, -0.3]]) part(u.torso, lump(0.12, 0, 9, 0.3), '#4e7d2b', x, y, z, { sy: 0.4, shadow: false });   // moss
    for (const a of u.arms) part(a, cyl(0.015, 0.015, 0.5, 4), IRON, 0.12, -0.75, 0.12, { rz: 0.2 });                              // loose chains
    u.gait = { f: 2.2, lift: 0.2, heavy: true }; u.death = 'collapse';
  },
  tide_warden(c) {   // "a crowned bronze statue with a trident; glowing joints"
    const [bronze, pale, frost] = c.pal, u = c.u;
    bipedRig(c, { legH: 0.7, legR: 0.14, hipW: 0.22, torsoW: 0.9, torsoH: 1.1, torsoD: 0.55, armLen: 0.9, armR: 0.12, headR: 0.26, legM: bronze, torsoM: bronze, armM: bronze, headM: bronze, torso: 'box', feet: true });
    u.seamM = c.glow(frost); for (const a of u.arms) part(a, torus(0.13, 0.025, 3, 8), u.seamM, 0, 0, 0, { rx: HALF, shadow: false }); for (const L of u.legs) part(L, torus(0.15, 0.025, 3, 8), u.seamM, 0, 0, 0, { rx: HALF, shadow: false });
    part(u.torso, torus(0.2, 0.02, 3, 8), u.seamM, 0, u.torsoH + 0.02, 0, { rx: HALF, shadow: false });
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.55; part(u.head, cone(0.06, 0.22, 4), pale, Math.sin(a) * 0.22, 0.45, Math.cos(a) * 0.22, { rz: -Math.sin(a) * 0.4 }); }   // shell crown
    part(u.head, cone(0.14, 0.3, 5), pale, 0, -0.08, 0.2, { rx: PI });                                                             // barnacle beard
    u.eyes = eyes(c, u.head, 0.09, 0.25, 0.25, 0.04);
    for (const s of [-1, 1]) part(u.torso, plane(0.3, 0.7), mat('#2aa6a0', 'both'), s * 0.46, 0.5, 0, { ry: HALF, shadow: false });   // kelp drape
    grip(u.handR, 0.2); part(u.handR, cyl(0.03, 0.035, 2.0, 5), pale, 0, 0.7, 0); for (let i = -1; i <= 1; i++) part(u.handR, cone(0.03, 0.3, 4), pale, i * 0.1, 1.8, 0); part(u.handR, box(0.26, 0.05, 0.05), pale, 0, 1.65, 0); u.weapon = u.handR;
    u.gait = { f: 2.5, lift: 0.2, heavy: true }; u.death = 'back';
  },
  rune_watcher(c) {   // "a floating eye-disc with four orbiting plates"
    const [stone, storm, pale] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 0.5, 0); u.torso = T; u.head = T;
    part(T, cyl(0.45, 0.45, 0.16, 10), stone, 0, 0, 0, { rx: HALF }); part(T, cyl(0.3, 0.3, 0.04, 9), pale, 0, 0, 0.09, { rx: HALF });
    u.orb = part(T, cyl(0.17, 0.17, 0.04, 9), c.glow(storm), 0, 0, 0.12, { rx: HALF, shadow: false }); part(T, cyl(0.07, 0.07, 0.04, 7), DARK, 0, 0, 0.14, { rx: HALF });
    u.crackM = c.glow(storm); for (const [x, y, a] of [[0.25, 0.3, 0.6], [-0.3, 0.15, -1.2], [0.1, -0.35, 1.9]]) part(T, box(0.02, 0.2, 0.02), u.crackM, x, y, 0.1, { rz: a, shadow: false });
    u.plates = pivot(T, 0, 0, 0); for (let i = 0; i < 4; i++) { const a = i * HALF; part(u.plates, box(0.14, 0.18, 0.04), storm, Math.cos(a) * 0.68, Math.sin(a) * 0.68, 0, { rz: a }); }
    for (let i = 0; i < 2; i++) part(T, torus(0.05, 0.015, 3, 7), IRON, 0, -0.52 - i * 0.08, 0, { shadow: false });              // the chain stub
    u.fit = 'y'; u.hover = 1.1; u.flap = 0; u.death = 'drop';
  },
  // ===== Bosses (≤ 4000 triangles; phase looks by opts.phase)
  clatterjaw(c, row, o) {   // "a boulder with one claw raised like a flag; the harpoons make it unmistakable"
    const [shell, pale, teal, eyeC] = c.pal, u = c.u, ph = o.phase || 1;
    const T = pivot(c.body, 0, 0.75, 0); u.torso = T;
    part(T, lump(1, 2, 13, 0.08), shell, 0, 0, 0, { sx: 1.55, sy: 0.8, sz: 1.25 });
    for (let i = 0; i < 6; i++) part(T, box(0.12, 0.1, 0.3), i % 2 ? '#8a3020' : shell, (i - 2.5) * 0.4, 0.72 - Math.abs(i - 2.5) * 0.1, 0, { ry: 0.2 });     // the cracked ridge
    if (ph >= 3) u.crack = part(T, box(2.0, 0.08, 0.14), c.glow(CREAM), 0, 0.7, 0, { shadow: false });
    for (const [x, z, r] of [[-0.8, 0.5, 0.12], [0.6, -0.4, 0.15], [0.2, 0.7, 0.1], [-0.4, -0.7, 0.13], [0.9, 0.2, 0.09]]) part(T, cone(r, r * 2.5, 5), pale, x, 0.55, z);   // barnacles
    for (const [x, z, a] of [[-0.5, -0.2, 0.5], [0.4, 0.4, -0.4], [0.1, -0.6, 0.8]]) { part(T, cyl(0.03, 0.03, 1.4, 5), WOOD, x, 0.9, z, { rz: a, rx: 0.4 }); part(T, cone(0.07, 0.2, 4), '#8a3020', x - Math.sin(a) * 0.6, 1.45, z - 0.25, { rz: a, rx: 0.4 }); }   // three harpoons
    for (let i = 0; i < 5; i++) part(T, cyl(0.012, 0.012, 2.2, 3), WOOD, -0.3, 0.3 + i * 0.1, 0.1, { rz: HALF, ry: i * 0.6, shadow: false });   // the fisher's net
    u.legs = bugLegs(c, T, { n: 8, len: 0.55, r: 0.08, y: -0.2, x: 1.3, zFrom: 0.8, zTo: -0.9, lift: 0.4, m: '#8a3020', n2: 5 });
    const big = limb(T, 1.0, -0.1, 0.9, 0.7, 0.16, 0.18, shell, { rz: -1.5, rx: 0.9 }); u.arm = big;
    const pin = pivot(big, 0, -0.7, 0); part(pin, box(0.4, 0.9, 0.3), shell, 0.1, -0.45, 0, { rz: 0.3 }); u.claw = pivot(pin, -0.1, 0, 0); part(u.claw, box(0.25, 0.75, 0.22), '#8a3020', -0.2, -0.38, 0, { rz: -0.3 });
    const small = limb(T, -1.0, -0.15, 0.85, 0.4, 0.1, 0.12, shell, { rz: 1.3, rx: 0.9 }); u.armL = small; part(small, box(0.2, 0.4, 0.15), shell, 0, -0.5, 0); part(small, box(0.12, 0.3, 0.12), '#8a3020', -0.12, -0.5, 0, { rz: -0.4 });
    u.stalks = [-1, 1].map(s => { const st = limb(T, s * 0.3, 0.4, 1.0, 0.4, 0.04, 0.04, '#8a3020', { rx: -2.4, rz: -s * 0.3, n: 4 }); eye(c, st, 0, -0.42, 0, 0.1); return st; });
    u.fit = 'z'; u.death = 'sink'; u.gait = { f: 8, sidle: true };
  },
  gristmaul(c, row, o) {   // "a stack of discs with one disc held up; flour streams"
    const [stone, pale, flour, eyeC] = c.pal, u = c.u, ph = o.phase || 1;
    bipedRig(c, { legH: 0.7, legR: 0.22, hipW: 0.35, torsoW: 2.2, torsoH: 2.2, torsoD: 2.2, armLen: 1.3, armR: 0.2, headR: 0.01, legM: IRON, torsoM: stone, armM: WOOD, headM: stone, torso: 'box', feet: false });
    u.torsoMesh.visible = false; u.headMesh.visible = false;
    part(u.torso, cyl(1.1, 1.1, 0.6, 12), stone, 0, 0.35, 0); part(u.torso, cyl(0.4, 0.4, 0.62, 8), IRON, 0, 0.35, 0);
    u.topStone = part(u.torso, cyl(1.0, 1.0, 0.55, 12), pale, ph >= 3 ? 0.15 : 0, 1.1, 0, { rz: ph >= 3 ? 0.12 : 0 }); u.spin = u.topStone;
    part(u.torso, cyl(0.16, 0.16, 2.6, 7), IRON, 0, 1.2, 0); for (const y of [0.7, 1.5, 2.2]) part(u.torso, torus(0.2, 0.04, 4, 8), IRON, 0, y, 0, { rx: HALF });   // the axle with iron bands
    part(u.torso, box(0.7, 0.6, 0.1), flour, 0, 1.95, 0.45); u.eyes = eyes(c, u.torso, 0.16, 2.0, 0.52, 0.09);          // the sack-cloth face
    for (const [x, z] of [[0.6, 0.6], [-0.8, 0.3], [0.2, -0.9], [-0.5, -0.6]]) part(u.torso, cone(0.08, 0.5, 4), flour, x, 0.5, z, { rx: PI, shadow: false });   // flour pouring from the seams
    part(u.torso, box(0.7, 0.6, 0.5), WOOD, 0, 1.6, -1.2); part(u.torso, torus(0.4, 0.04, 4, 9), WOOD, 0, 1.3, -1.2, { rx: HALF });   // hopper + rope
    for (const a of u.arms) a.children[0].visible = false;
    part(u.armR, cyl(0.12, 0.14, 1.3, 7), WOOD, 0, -0.65, 0); u.hammer = part(u.armR, cyl(0.55, 0.55, 0.3, 12), stone, 0, -1.4, 0, { rx: HALF }); u.arm = u.armR; u.weapon = u.armR;
    part(u.armL, cyl(0.1, 0.12, 1.0, 7), WOOD, 0, -0.5, 0); const cog = pivot(u.armL, 0, -1.1, 0); part(cog, cyl(0.35, 0.35, 0.2, 8), WOOD, 0, 0, 0, { rx: HALF }); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; part(cog, box(0.14, 0.16, 0.2), WOOD, Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0, { rz: a }); }
    for (const L of u.legs) part(L, cyl(0.26, 0.3, 0.3, 8), IRON, 0, -0.6, 0);
    u.gait = { f: 2, lift: 0.3, heavy: true }; u.death = 'collapse';
  },
  mother_thrum(c, row, o) {   // "the legs are taller than a player; she is a ceiling of legs"
    const [dark, paleC, purple, eyeC] = c.pal, u = c.u;
    const T = pivot(c.body, 0, 1.9, 0); u.torso = T;
    part(T, ball(1), paleC, 0, 0.1, -0.9, { sx: 1.1, sy: 1.0, sz: 1.3 }); part(T, ball(1), dark, 0, -0.1, 0.5, { sx: 0.6, sy: 0.45, sz: 0.6 });
    part(T, cone(0.3, 0.5, 4), dark, 0, 1.0, -0.9, { rx: PI, shadow: false }); part(T, cone(0.3, 0.5, 4), dark, 0, 1.5, -0.9, { shadow: false });       // the dark hourglass
    u.head = pivot(T, 0, -0.15, 1.05); part(u.head, ball(1), dark, 0, 0, 0, { s: 0.32 });
    u.eyes = []; for (let i = 0; i < 8; i++) { const a = (i - 3.5) * 0.3; u.eyes.push(eye(c, u.head, Math.sin(a) * 0.3, 0.1 - Math.abs(i - 3.5) * 0.03 + (i % 2) * 0.08, Math.cos(a) * 0.3, 0.05 - (i % 2) * 0.015)); }
    for (const s of [-1, 1]) { part(u.head, cone(0.06, 0.4, 4), paleC, s * 0.14, -0.3, 0.2, { rx: PI + 0.3 }); part(u.head, ico(0.04, 0), c.glow(purple), s * 0.14, -0.52, 0.28, { shadow: false }); }   // fangs that drip
    for (let i = 0; i < 6; i++) part(u.head, leaf(0.3, 0.14), mat(purple, 'both'), Math.sin(i * 1.1 - 2.7) * 0.25, 0.3, Math.cos(i * 1.1 - 2.7) * 0.25, { rz: HALF, ry: i * 1.1 - 2.7, shadow: false });   // crown of dead sprites' wings
    for (let i = 0; i < 4; i++) part(T, plane(0.5, 1.6), mat(CREAM, 'film'), (i - 1.5) * 0.4, -0.8, -2.2 - i * 0.15, { rx: 0.3, shadow: false });   // the web train
    u.legs = bugLegs(c, T, { n: 8, len: 1.6, r: 0.08, y: 0, x: 0.6, zFrom: 0.8, zTo: -1.0, lift: 0.9, m: dark, n2: 5 });
    u.kneeM = c.glow(purple); for (const L of u.legs) part(L, ico(0.12, 0), u.kneeM, 0, -1.6, 0, { shadow: false });            // joints that light
    u.fit = 'z'; u.gait = { f: 5 }; u.death = 'flip';
  },
  reeve_oswin(c) {   // "the tall cap, the ledger, the rod; a clerk, not a knight"
    const [robeC, gold, bone, blue] = c.pal, u = c.u;
    robedRig(c, { h: 2.2, rTop: 0.24, rBot: 0.42, robeM: robeC, armM: robeC, headR: 0.2, hood: false, armLen: 0.75, armR: 0.06 });
    u.headMesh.material = mat(bone); part(u.head, box(0.2, 0.08, 0.17), bone, 0, 0.05, 0.1); part(u.head, torus(0.1, 0.012, 3, 8), gold, 0, 0.1, 0.12, { rx: 0.3, shadow: false });   // jaw bound with gold wire
    u.eyes = eyes(c, u.head, 0.075, 0.2, 0.19, 0.045);
    part(u.head, cyl(0.19, 0.18, 0.55, 8), robeC, 0, 0.6, 0); part(u.head, torus(0.19, 0.03, 4, 9), gold, 0, 0.4, 0, { rx: HALF, shadow: false }); for (let i = 0; i < 5; i++) part(u.head, box(0.05, 0.08, 0.03), gold, Math.sin(i * 1.25) * 0.19, 0.46, Math.cos(i * 1.25) * 0.19);
    part(u.torso, torus(0.25, 0.025, 3, 10, PI), gold, 0, 1.2, 0.2, { rx: HALF + 0.4, rz: PI, shadow: false }); part(u.torso, box(0.1, 0.12, 0.03), gold, 0, 1.05, 0.26);   // chain of office
    part(u.torso, box(0.3, 0.4, 0.1), CREAM, 0.4, 0.5, 0.12); part(u.torso, box(0.32, 0.42, 0.03), robeC, 0.4, 0.5, 0.17); for (let i = 0; i < 4; i++) part(u.torso, torus(0.03, 0.01, 3, 6), gold, 0.4, 0.75 + i * 0.06, 0.12, { shadow: false });   // the great ledger, chained
    for (let i = 0; i < 3; i++) part(u.handL, cone(0.012, 0.16, 3), WHITE, (i - 1) * 0.035, -0.08, 0, { rx: PI });                  // quill fingers
    rod(c, u.handR, { len: 1.2, m: robeC, headM: gold }); u.weapon = u.handR;
    u.gait = { f: 3, glide: true }; u.death = 'sink'; u.castsBothHands = true;
  },
  ildreth(c, row, o) {   // "a tall crowned figure over a pool; petals fall from her"
    const [robeC, ghostC, gold, pale] = c.pal, u = c.u, G = mat(robeC, 'ghost'), ph = o.phase || 1;
    robedRig(c, { h: 2.4, rTop: 0.22, rBot: 0.5, robeM: G, armM: mat(ghostC, 'ghost'), headR: 0.2, hood: false, armLen: 0.8, armR: 0.06 });
    u.headMesh.material = mat(ghostC, 'ghost');
    part(u.torso, cyl(0.5, 0.05, 0.9, 8), mat(robeC, 'film'), 0, -0.3, 0, { shadow: false });                                      // hem of mist
    part(u.head, torus(0.22, 0.03, 4, 10, PI * 0.95), gold, 0, 0.45, 0, { rz: PI * 0.9, shadow: false });                           // crescent crown, one horn broken
    for (const s of [-1, 1]) part(u.head, cone(0.035, 0.24, 4), mat(ghostC, 'ghost'), s * 0.2, 0.2, 0, { rz: -s * 1.5 });
    u.eyes = eyes(c, u.head, 0.075, 0.2, 0.18, 0.04, mat(pale));
    for (let i = 0; i < 8; i++) part(u.torso, ico(0.04, 0), gold, Math.sin(i * 0.8) * 0.5, 0.1 + (i % 4) * 0.3, Math.cos(i * 0.8) * 0.5, { sy: 0.4, shadow: false });   // petals
    for (const [x, a] of [[-0.3, 0.4], [0.25, -0.5], [0.05, 0.1]]) part(u.torso, cyl(0.025, 0.03, 0.7, 4), '#5a4632', x, 0.4, 0.35, { rz: a, rx: -0.4 });   // roots grown through the robe
    for (const a of u.arms) a.rotation.x = -2.2;
    u.book = pivot(u.torso, 0, 0.9, 0.6); const BK = mat(ghostC, 'ghost'); part(u.book, plane(0.3, 0.4), BK, -0.15, 0, 0, { rx: -HALF - 0.4, ry: 0.4, shadow: false }); part(u.book, plane(0.3, 0.4), BK, 0.15, 0, 0, { rx: -HALF - 0.4, ry: -0.4, shadow: false }); part(u.book, plane(0.2, 0.26), BK, 0.3, -0.2, 0.1, { rx: -1, ry: 0.8, shadow: false });
    u.hover = ph >= 2 ? 0.1 : 1.2; u.gait = { f: 2.5, glide: true }; u.death = 'fade'; u.castsBothHands = true;
  },
  sister_vennel(c, row, o) {   // "the seven-candle crown and the big key; wax everywhere"
    const [dark, gold, plum, flameC] = c.pal, u = c.u, ph = o.phase || 1;
    robedRig(c, { h: 1.9, rTop: 0.2, rBot: 0.36, robeM: dark, armM: dark, headR: 0.17, hoodM: dark, armLen: 0.6 });
    const hr = u.headR; u.eyes = eyes(c, u.head, 0.055, hr * 0.85, hr * 0.5, 0.035);
    candleCrown(c, u.head, 7, hr * 1.1, hr * 1.5, { h: 0.1, r: 0.02, flame: 0.08 });
    if (ph >= 3) u.flames.slice(1).forEach(f => { f.visible = false; });
    part(u.torso, cone(0.08, 0.14, 6), gold, 0, 0.8, 0.22, { shadow: false }); part(u.torso, ico(0.03, 0), gold, 0, 0.7, 0.24);    // the bell sigil
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; part(u.torso, box(0.05, 0.3 + (i % 3) * 0.2, 0.02), CREAM, Math.sin(a) * 0.3, 0.5 + (i % 2) * 0.3, Math.cos(a) * 0.3, { ry: a, shadow: false }); }   // wax running down the robe
    part(u.torso, cone(0.06, 0.1, 6), gold, 0.3, 0.35, 0.1, { rx: PI }); part(u.torso, ico(0.02, 0), gold, 0.3, 0.28, 0.1);           // hand-bell on the belt
    for (const a of u.arms) a.rotation.x = -1.1; u.armL.rotation.z = 0.5; u.armR.rotation.z = -0.5;
    key(c, u.handR, { len: 1.0, m: gold }); u.weapon = u.handR;
    for (const s of [-1, 1]) part(u.torso, box(0.12, 0.05, 0.22), CREAM, s * 0.14, -0.02, 0.1);                                 // bare feet in the water
    u.gait = { f: 4, glide: true }; u.death = 'kneel';
  },
  warlord_ruhk(c, row, o) {   // "the antlers are the widest thing in the hall; on the stag, taller than anything you have fought"
    const [iron, red, gold, eyeC] = c.pal, u = c.u, ph = o.phase || 1;
    const rider = ph >= 3 ? pivot(c.body, 0, 1.45, -0.1) : c.body;
    const save = c.body; c.body = rider;
    bipedRig(c, { legH: 0.75, legR: 0.14, hipW: 0.22, torsoW: 0.95, torsoH: 0.9, torsoD: 0.65, armLen: 0.8, armR: 0.13, headR: 0.3, legM: iron, torsoM: iron, armM: iron, headM: iron, torso: 'box' });
    c.body = save;
    const hr = u.headR; part(u.head, ball(1), iron, 0, hr * 1.1, 0.08, { sx: hr * 1.05, sy: hr * 0.9, sz: hr * 1.2 }); part(u.head, box(hr * 0.6, hr * 0.45, hr * 0.7), iron, 0, hr * 0.85, hr * 1.2);   // the black stag skull
    antlers(c, u.head, { x: hr * 0.5, y: hr * 1.7, len: 0.75, r: 0.045, m: iron, spread: 1.05 });
    u.eyes = eyes(c, u.head, hr * 0.35, hr * 1.1, hr * 1.0, hr * 0.2);
    for (const s of [-1, 1]) { part(u.torso, box(0.38, 0.2, 0.5), iron, s * 0.5, u.shoulderY + 0.08, 0); part(u.torso, ico(0.1, 0), CREAM, s * 0.55, u.shoulderY + 0.2, 0.12); }
    for (const [x, y] of [[-0.25, 0.5], [0.3, 0.3], [0.0, 0.7]]) part(u.torso, box(0.1, 0.12, 0.02), CREAM, x, y, 0.34, { shadow: false });   // white handprints
    cloak(c, u, red, { w: 0.9, h: 1.0 }); for (let i = 0; i < 5; i++) part(u.torso, box(0.2, 0.22, 0.01), i % 2 ? gold : CREAM, -0.3 + i * 0.15, u.shoulderY - 0.3 - (i % 2) * 0.3, -0.38, { shadow: false });   // stitched banners
    part(u.torso, cyl(0.3, 0.3, 0.22, 9), CREAM, 0, 0.55, -0.5, { rx: HALF }); part(u.torso, torus(0.3, 0.03, 4, 9), gold, 0, 0.55, -0.62, { shadow: false });   // the war drum
    grip(u.handR, 1.1); part(u.handR, cyl(0.035, 0.04, 1.6, 6), iron, 0, 0.55, 0); for (const s of [-1, 1]) part(u.handR, cone(0.07, 0.5, 4), CREAM, s * 0.2, 1.2, 0, { rz: -s * 1.3 }); part(u.handR, box(0.5, 0.12, 0.1), IRON, 0, 1.15, 0); u.weapon = u.handR;   // the stag-horn axe
    if (ph >= 3) {   // the Black Stag
      const stag = c.u.stag = {}; const T = pivot(c.body, 0, 1.25, 0);
      part(T, ball(1), iron, 0, 0, 0, { sx: 0.42, sy: 0.45, sz: 1.0 });
      const neck = pivot(T, 0, 0.3, 0.85); part(neck, cyl(0.2, 0.26, 0.7, 7), iron, 0, 0.3, 0.1, { rx: 0.5 });
      const sh = pivot(neck, 0, 0.6, 0.35); part(sh, ball(1), iron, 0, 0, 0.1, { sx: 0.18, sy: 0.2, sz: 0.4 }); eyes(c, sh, 0.1, 0.1, 0.3, 0.05, c.glow('#ff3b2f')); antlers(c, sh, { x: 0.1, y: 0.2, len: 0.8, r: 0.04, m: iron, spread: 1.0 });
      stag.head = sh; stag.legs = [];
      for (const z of [0.6, -0.6]) for (const s of [-1, 1]) { const L = limb(T, s * 0.25, -0.3, z, 0.95, 0.07, 0.05, iron); part(L, cyl(0.07, 0.07, 0.08, 6), IRON, 0, -0.93, 0); stag.legs.push(L); }
      for (const L of u.legs) { L.rotation.x = -1.2; L.rotation.z = -Math.sign(L.position.x) * 0.5; }
    }
    u.gait = { f: 3.5, lift: 0.25, heavy: true }; u.death = 'kneel';
  },
  harrowmund(c, row, o) {   // "the twelve-candle crown over a seated giant; standing, the sceptre is taller than a player"
    const [plate, gold, bone, blue] = c.pal, u = c.u, ph = o.phase || 1;
    bipedRig(c, { legH: 0.95, legR: 0.16, hipW: 0.26, torsoW: 1.2, torsoH: 1.3, torsoD: 0.8, armLen: 1.1, armR: 0.14, headR: 0.38, legM: plate, torsoM: plate, armM: plate, headM: bone, torso: 'box', headD: 1.1 });
    if (ph < 3) { part(u.torso, cyl(0.6, 0.85, 1.25, 8), plate, 0, 0.6, 0); for (let i = 0; i < 4; i++) part(u.torso, box(0.04, 1.1, 0.02), gold, -0.45 + i * 0.3, 0.6, 0.78, { shadow: false }); }   // the gold-threaded robe
    const hr = u.headR; part(u.head, box(hr * 1.0, hr * 0.5, hr * 0.9), bone, 0, hr * 0.3, hr * 0.3); part(u.head, box(0.03, hr * 1.5, 0.03), plate, hr * 0.2, hr * 1.1, hr * 1.1, { rz: 0.15, shadow: false });   // jaw + the crack down the skull
    u.eyes = eyes(c, u.head, hr * 0.38, hr * 1.0, hr * 0.95, hr * 0.22);
    part(u.head, torus(hr * 1.1, 0.04, 4, 12), gold, 0, hr * 1.7, 0, { rx: HALF });
    candleCrown(c, u.head, 12, hr * 1.1, hr * 1.7, { h: 0.14, r: 0.028, flame: 0.1 }); u.candles = u.flames.slice(0, 12);
    const lit = ph >= 3 ? 12 : ph === 2 ? 8 : 4; u.candles.forEach((f, i) => { f.visible = i < lit; });
    for (const s of [-1, 1]) { part(u.torso, box(0.46, 0.24, 0.6), plate, s * 0.64, u.shoulderY + 0.1, 0); part(u.torso, cone(0.1, 0.3, 4), gold, s * 0.72, u.shoulderY + 0.32, 0, { rz: -s * 0.4 }); }
    cloak(c, u, plate, { w: 1.2, h: 1.3 }); for (let i = 0; i < 6; i++) part(u.torso, box(0.26, 0.3, 0.01), i % 3 ? CREAM : gold, -0.45 + (i % 3) * 0.45, u.shoulderY - 0.35 - Math.floor(i / 3) * 0.5, -0.46, { shadow: false });   // ledger pages and banners
    if (ph < 2) for (const a of u.arms) { part(a, torus(0.16, 0.03, 4, 8), gold, 0, -0.85, 0, { rx: HALF, shadow: false }); part(a, cyl(0.02, 0.02, 0.8, 4), gold, 0.1, -1.1, 0.1, { rz: 0.4 }); }   // chains from the seal
    grip(u.handR, 0.25); part(u.handR, cyl(0.045, 0.05, 2.0, 6), bone, 0, 0.7, 0); part(u.handR, box(0.22, 0.26, 0.08), ph >= 3 ? c.glow(gold) : gold, 0, 1.75, 0); part(u.handR, torus(0.12, 0.02, 3, 8, PI), ph >= 3 ? c.glow(gold) : gold, 0, 1.85, 0.05, { shadow: false }); u.weapon = u.handR;
    u.gait = { f: 2.5, lift: 0.2, heavy: true }; u.death = 'kneel';
  },
};

// ---------------------------------------------------------------- rares: the base monster plus its own touch
const RARE = {
  old_pincer(c, u) { for (const [x, z] of [[-0.25, -0.15], [0.3, 0.1], [0.05, -0.3]]) part(u.torso, cone(0.05, 0.12, 5), c.P[1], x, 0.22, z); part(u.torso, cyl(0.02, 0.02, 0.5, 5), c.P[2], 0.1, 0.4, -0.1, { rz: 0.5, rx: 0.3 }); part(u.torso, cone(0.04, 0.1, 4), c.P[2], 0.32, 0.6, -0.17, { rz: 0.5, rx: 0.3 }); for (let i = 0; i < 4; i++) part(u.torso, torus(0.03, 0.01, 3, 6), c.P[2], -0.3 - i * 0.06, 0.1, -0.2 - i * 0.05, { ry: i * 1.5, shadow: false }); },
  whistler_jack(c, u) { for (const w of u.wings) w.userData.tip.traverse(m => { if (m.isMesh) m.material = mat(DARK); }); part(u.head, cyl(0.06, 0.06, 0.08, 7), '#3a3230', 0, 0.16, 0.0); part(u.head, cyl(0.1, 0.1, 0.015, 8), '#3a3230', 0, 0.12, 0.0); },
  grandmother_root(c, u) { for (let i = 0; i < 9; i++) part(u.torso, ico(0.05, 0), WHITE, Math.cos(i * 1.4) * 0.45, 0.15 + i * 0.09, Math.sin(i * 1.4) * 0.45, { shadow: false }); for (let i = 0; i < 3; i++) part(u.torso, torus(0.2 - i * 0.03, 0.02, 3, 7, PI), BONE, 0.1, 0.55 + i * 0.1, 0.3, { rx: HALF + 0.3, rz: PI, shadow: false }); },
  sergeant_krull(c, u) { u.head.traverse(m => { if (m.isMesh && m.geometry.type === 'SphereGeometry') m.material = mat('#e0a84a'); }); const sh = pivot(u.armL, 0, -0.25, 0.12); part(sh, cyl(0.42, 0.42, 0.04, 12), c.P[0], 0, 0, 0, { rx: HALF }); for (let i = 0; i < 6; i++) part(sh, box(0.04, 0.8, 0.03), c.P[3], 0, 0, 0.03, { rz: i * PI / 6 }); part(sh, torus(0.42, 0.03, 3, 12), c.P[3], 0, 0, 0.02, { shadow: false }); },
  the_lamplighter(c, u) { candleCrown(c, u.torso, 9, 0.18, 0.1, { h: 0.1, r: 0.02, flame: 0.08, m: c.pal[1] }); },
  velka_thricewed(c, u) { for (let i = 1; i < 3; i++) part(u.head, torus(0.17 - i * 0.02, 0.025, 4, 10, PI * 1.3), c.pal[2], 0, 0.36 + i * 0.1, 0, { rz: PI * 0.85, shadow: false }); for (let i = 0; i < 3; i++) part(u.head, plane(0.4, 0.6), mat(c.pal[0], 'film'), 0, -0.1, 0.12 + i * 0.05, { shadow: false }); },
  bogmother_sulk(c, u) { const th = pivot(c.body, 0, 0, 0); part(th, lump(1, 1, 77, 0.25), c.P[1], 0, 0.1, -0.1, { sx: 0.75, sy: 0.25, sz: 0.7 }); for (let i = 0; i < 6; i++) part(th, ico(1, 0), c.P[1], Math.cos(i * 1.1) * 0.55, 0.12, Math.sin(i * 1.1) * 0.5, { sx: 0.1, sy: 0.06, sz: 0.2, ry: i }); c.body.children.forEach(ch => { if (ch !== th) ch.position.y += 0.25; }); for (let i = 0; i < 5; i++) part(u.head, ico(0.04, 0), c.E, Math.sin(i * 1.25 - 2.5) * 0.3, 0.5, Math.cos(i * 1.25 - 2.5) * 0.3, { shadow: false }); },
  hoarfang(c, u) { c.body.traverse(m => { if (m.isMesh && m.material === c.P[0]) m.material = mat('#f4f4f8'); }); part(u.head, cone(0.12, 0.3, 5), mat('#c8e8ff', 'film'), 0, 0.0, 0.4, { rx: HALF, shadow: false }); u.head.children.find(m => m.geometry && m.geometry.type === 'ConeGeometry' && m.position.x > 0).scale.set(0.6, 0.5, 0.6); },
  captain_vosk(c, u) { part(u.head, box(u.headR * 0.95, u.headR * 1.2, u.headR * 0.6), c.P[1], u.headR * 0.5, u.headR * 0.9, u.headR * 0.65, { shadow: false }); part(u.torso, box(0.06, 0.6, 0.03), c.P[1], 0, 0.3, 0.2, { rz: 0.7 }); for (let i = 0; i < 4; i++) part(u.torso, cyl(0.035, 0.03, 0.07, 6), c.P[0], -0.18 + i * 0.12, 0.15 + i * 0.1, 0.22); part(u.head, torus(u.headR * 0.25, u.headR * 0.08, 4, 8), c.P[3], -u.headR * 0.4, u.headR * 0.95, u.headR * 0.95, { shadow: false }); },
  the_kept_bride(c, u) { c.body.traverse(m => { if (m.isMesh && m.material.name === 'ghost|' + c.pal[0]) m.material = mat('#e8f4ee', 'ghost'); if (m.isMesh && m.material.name === 'film|' + c.pal[0]) m.material = mat('#e8f4ee', 'film'); }); part(u.head, torus(0.16, 0.03, 4, 9), '#4e7d2b', 0, 0.28, 0, { rx: HALF, shadow: false }); u.armR.rotation.x = -1.6; part(u.handR, torus(0.03, 0.01, 4, 8), '#e0a84a', 0, 0, 0.03, { shadow: false }); part(u.torso, cyl(0.3, 0.45, 0.6, 8), mat('#e8f4ee', 'film'), 0, -0.2, 0, { shadow: false }); },
  morrow_the_unburied(c, u) { for (let i = 0; i < 8; i++) part(u.head, cone(0.04, 0.16, 4), c.pal[2], Math.sin(i * 0.785) * 0.22, 0.56, Math.cos(i * 0.785) * 0.22); part(u.head, dome(0.23, 8), c.pal[0], 0, 0.42, 0); for (let i = 0; i < 6; i++) part(u.torso, box(0.18, 0.22, 0.01), c.P[1], -0.3 + (i % 3) * 0.3, 0.3 + Math.floor(i / 3) * 0.3, -0.28, { shadow: false }); u.handR.children.find(m => m.geometry.type === 'BoxGeometry').scale.set(1.6, 2, 1.6); },
};

// ---------------------------------------------------------------- building
const LENGTH_PLANS = new Set(['quadruped', 'serpent', 'insect', 'flyer']);
const PLAN_ALIAS = { quad: 'quadruped', beast: 'quadruped', slime: 'blob', golem: 'construct', bird: 'flyer', snake: 'serpent', bug: 'insect' };
const FLAME = '#ffb347';
/** What kind of row this is: 'monster' | 'rare' | 'boss' (a rare has a base type, a boss has phases). */
export function rowKind(row) { return row.base && typeof row.look === 'string' ? 'rare' : row.phases || row.dungeon ? 'boss' : 'monster'; }
/** The scale factor a rare's look string asks for ("tideling_crab at 2.0x ..." -> 2). */
export function rareScale(row) { const m = /at ([\d.]+)x/.exec(typeof row.look === 'string' ? row.look : ''); return m ? +m[1] : 1; }

/**
 * Build one monster. row = a row of monsters.json (monsters[id], rares.list[id] or bosses[id], with `id` set).
 * opts: { rank: 'champion' | 'rare' | null, level, phase (bosses), base (the rare's base row), content (the whole
 * monsters.json, used to find a rare's base when `base` is not given) }.
 */
export function buildMonster(row, opts = {}) {
  const kind = rowKind(row);
  let base = row, look = row.look || {}, scale = 1;
  if (kind === 'rare') {
    base = opts.base || row.baseRow || opts.content?.monsters?.[row.base];
    if (!base) throw new Error(`bestiary-kit: rare ${row.id} needs its base row (${row.base}); pass { base } or { content }`);
    look = base.look || {}; scale = rareScale(row);
  }
  const plan = PLAN_ALIAS[look.bodyPlan] || look.bodyPlan || 'biped';
  const pal = [...(Array.isArray(look.palette) ? look.palette : [])]; while (pal.length < 4) pal.push(['#8a7a6a', '#4a4040', '#c8b080', '#ffe066'][pal.length]);
  const group = new THREE.Group(), fit = new THREE.Group(), body = new THREE.Group();
  group.add(fit); fit.add(body);
  const u = { plan, kind, id: row.id, body, legs: [], glow: [], flames: [], arms: [], hands: [] };
  const c = { pal, P: pal.map(h => mat(h)), body, u, row: base, m: h => mat(h), glow: null, flame: null };
  const glows = new Map();
  c.glow = color => { let m = glows.get(color); if (!m) { m = new THREE.MeshBasicMaterial({ color }); m.userData.base = new THREE.Color(color); m.name = 'glow|' + color; u.glow.push(m); glows.set(color, m); } return m; };
  let flameM = null; c.flame = () => flameM || (flameM = c.glow(FLAME));
  c.E = c.glow(pal[3]);
  const builder = BUILD[base.id] || BUILD[row.id] || FALLBACK[plan] || FALLBACK.biped;
  builder(c, base, { level: opts.level, phase: opts.phase });
  if (kind === 'rare' && RARE[row.id]) RARE[row.id](c, u);
  // hidden placeholders cost nothing on screen; drop them so counts are honest
  const dead = []; body.traverse(o => { if (o.isMesh && !o.visible) dead.push(o); }); for (const o of dead) o.parent.remove(o);
  // size: the design is already in metres; measure the axis the plan is sized by and correct any drift
  const size = (base.size || 1.3) * scale;
  const bb = new THREE.Box3().setFromObject(body);
  const axis = u.fit || (LENGTH_PLANS.has(plan) ? 'z' : 'y');
  const dim = axis === 'z' ? bb.max.z - bb.min.z : axis === 'x' ? bb.max.x - bb.min.x : bb.max.y;
  const s = dim > 0.01 ? size / dim : 1; fit.scale.setScalar(s);
  u.scale = s; u.height = bb.max.y * s; u.radius = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5 * s;
  u.centerY = (u.torso ? u.torso.position.y : bb.max.y * 0.5);
  u.hover = u.hover || 0; if (u.hover) u.height += u.hover * s;
  if (u.noShadow) body.traverse(o => { if (o.isMesh) o.castShadow = false; });
  if (opts.rank) {
    const col = opts.rank === 'rare' ? '#ffd24a' : '#b78de0';
    u.aura = new THREE.Mesh(ring(u.radius * 1.05, u.radius * 1.25, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false }));
    u.aura.rotation.x = -HALF; u.aura.position.y = 0.03; group.add(u.aura);
  }
  u.seed = (Math.random() * 97) * 0.37;
  u.nodes = collectAnimated(u);
  for (const n of u.nodes) n.userData.base = { p: n.position.toArray(), r: [n.rotation.x, n.rotation.y, n.rotation.z], s: n.scale.toArray() };
  group.userData = u;
  return group;
}
/** Plain stand-ins for a body plan with no builder of its own (so a new row never crashes the game). */
const FALLBACK = {
  biped(c) { bipedRig(c, {}); c.u.eyes = eyes(c, c.u.head, 0.1, 0.22, 0.22, 0.05); c.u.gait = { f: 6, lift: 0.3 }; c.u.death = 'forward'; },
  construct(c) { bipedRig(c, { torso: 'box', legH: 0.6, torsoW: 0.9, torsoH: 1.0, torsoD: 0.6, armLen: 0.9 }); c.u.eyes = eyes(c, c.u.head, 0.1, 0.22, 0.22, 0.05); c.u.gait = { f: 2.5, lift: 0.2, heavy: true }; c.u.death = 'back'; },
  quadruped(c) { quadRig(c, {}); c.u.eyes = eyes(c, c.u.head, 0.07, 0.08, 0.18, 0.03); c.u.gait = { f: 8, lift: 0.4 }; c.u.death = 'side'; },
  insect(c) { const T = pivot(c.body, 0, 0.3, 0); c.u.torso = T; part(T, ball(1), c.P[0], 0, 0, 0, { sx: 0.3, sy: 0.2, sz: 0.4 }); c.u.head = pivot(T, 0, 0, 0.4); c.u.eyes = eyes(c, c.u.head, 0.06, 0.03, 0.02, 0.03); c.u.legs = bugLegs(c, T, { n: 6, len: 0.25, r: 0.03, y: 0, x: 0.28, m: c.P[1] }); c.u.fit = 'z'; c.u.gait = { f: 9 }; c.u.death = 'flip'; },
  serpent(c) { BUILD.root_choker(c); },
  flyer(c) { const T = pivot(c.body, 0, 0.3, 0); c.u.torso = T; part(T, ball(1), c.P[0], 0, 0, 0, { sx: 0.15, sy: 0.15, sz: 0.3 }); c.u.head = pivot(T, 0, 0.05, 0.3); c.u.eyes = eyes(c, c.u.head, 0.05, 0.02, 0.05, 0.03); c.u.wings = wingPair(c, T, { span: 1, chord: 0.3, m: c.P[1] }); c.u.fit = 'z'; c.u.hover = 1.5; c.u.flap = 3; c.u.death = 'tumble'; },
  blob(c) { const T = pivot(c.body, 0, 0, 0); c.u.torso = T; part(T, lump(1, 1, 3, 0.2), c.P[0], 0, 0.5, 0, { sx: 0.6, sy: 0.5, sz: 0.6 }); c.u.head = pivot(T, 0, 0.6, 0.4); c.u.eyes = eyes(c, c.u.head, 0.12, 0, 0.1, 0.05); c.u.gait = { f: 3 }; c.u.death = 'deflate'; },
};
function collectAnimated(u) {
  const set = new Set();
  const add = n => { if (n && n.isObject3D) set.add(n); };
  for (const k of ['body', 'torso', 'head', 'arm', 'armL', 'armR', 'tail', 'jaw', 'claw', 'spin', 'plates', 'book', 'censer', 'throat', 'rear', 'orb', 'hammer', 'topStone']) add(u[k]);
  for (const k of ['arms', 'hands', 'legs', 'wings', 'jaws', 'stalks', 'segs', 'lowerArms', 'eyes', 'flames']) for (const n of u[k] || []) { add(n); add(n.userData && n.userData.knee); add(n.userData && n.userData.tip); }
  if (u.stag) { add(u.stag.head); for (const n of u.stag.legs) add(n); }
  return [...set];
}

// ---------------------------------------------------------------- animation
const MOVING = new Set(['walk', 'move', 'chase', 'wander', 'return', 'flee', 'run']);
const WHITE_C = new THREE.Color('#ffffff');
const clamp01 = v => Math.max(0, Math.min(1, v || 0));
/** The attack arm's angle over a swing: wind up over the shoulder, whip down and forward, settle. p = 0..1. */
function swingPose(p) { return p < 0.3 ? -2.4 * Math.pow(p / 0.3, 0.7) : p < 0.55 ? -2.4 + 2.1 * (p - 0.3) / 0.25 : -0.3 * (1 - (p - 0.55) / 0.45); }
const bump = p => Math.sin(clamp01(p) * PI);
/**
 * Pose a built monster. state: 'idle' | 'walk' (or any moving sim state) | 'attack' | 'cast' | 'dead'; t in seconds.
 * opts: { swing: 1 -> 0 over an attack, hit: 1 -> 0 after being struck, cast: truthy while casting, dead, deadT: 0 -> 1, landed }.
 */
export function animateMonster(group, state, t, dt = 0.016, o = {}) {
  const u = group.userData; if (!u || !u.body) return;
  for (const n of u.nodes) { const b = n.userData.base; n.position.fromArray(b.p); n.rotation.set(b.r[0], b.r[1], b.r[2]); n.scale.fromArray(b.s); }
  const body = u.body, moving = MOVING.has(state) || state === 'walk', cast = !!(o.cast || state === 'cast');
  const dead = state === 'dead' || !!o.dead, k0 = dead ? clamp01(o.deadT ?? 1) : 0, k = 1 - (1 - k0) * (1 - k0);
  const swing = clamp01(o.swing), p = 1 - swing, hit = clamp01(o.hit), ph = u.seed || 0;
  const g = u.gait || { f: 6, lift: 0.3 }, f = g.f || 6, w = t * f + ph, lift = g.lift ?? 0.3;
  const hover = (o.landed ? 0 : u.hover) || 0;
  const flare = cast ? 0.45 + Math.sin(t * 14) * 0.15 : swing > 0 ? swing * 0.3 : 0.06 + Math.sin(t * 5 + ph) * 0.06;
  for (const m of u.glow) { if (m.emissive) m.emissiveIntensity = cast ? 0.7 + Math.sin(t * 12) * 0.3 : 0; else m.color.copy(m.userData.base).lerp(WHITE_C, dead ? 0 : flare); }
  for (const fl of u.flames) { const s = 0.85 + Math.sin(t * 17 + fl.position.x * 40 + ph) * 0.15 + (cast ? 0.4 : 0); fl.scale.set(s, s * (1 + Math.sin(t * 23 + fl.position.z * 30) * 0.2), s); }
  if (dead) return deathPose(u, k, hover);
  const plan = u.plan;
  if (plan === 'flyer') {
    body.position.y = hover + Math.sin(t * 2.2 + ph) * (hover ? 0.08 : 0.01);
    if (u.wings) for (const wg of u.wings) {
      const sgn = wg.scale.x < 0 ? -1 : 1, disc = wg.userData.tip === wg && u.flap > 15;
      const ang = o.landed ? 1.25 : disc ? Math.sin(t * 60) * 0.25 : Math.sin(t * (u.flap || 3) * TAU + ph) * (moving ? 0.75 : 0.5);
      wg.rotation.z += ang * sgn; if (wg.userData.tip && wg.userData.tip !== wg) wg.userData.tip.rotation.z += (o.landed ? 1.4 : ang * 0.6) * sgn;
    }
    if (u.plates) u.plates.rotation.z += t * 1.2;
    if (u.tail) u.tail.rotation.y += Math.sin(t * 3 + ph) * 0.15;
    if (u.head && u.head !== u.torso) u.head.rotation.y += Math.sin(t * 0.9 + ph) * 0.2;
    if (u.id === 'marsh_light') body.rotation.y += t * 0.6;
    if (swing > 0) { body.position.y -= bump(p) * Math.max(0.2, hover * 0.45); body.rotation.x += bump(p) * 0.7; if (u.jaw) u.jaw.rotation.x += bump(p) * 0.6; if (u.orb) u.orb.scale.multiplyScalar(1 - bump(p) * 0.4); }
    if (cast) { body.rotation.x -= 0.25; body.rotation.z += Math.sin(t * 9) * 0.08; if (u.throat) u.throat.scale.multiplyScalar(1.6 + Math.sin(t * 10) * 0.2); if (u.jaw) u.jaw.rotation.x += 0.5; }
    if (u.legs.length) for (const L of u.legs) L.rotation.x += o.landed ? -0.8 : 0;
  } else if (plan === 'blob') {
    const wob = Math.sin(t * 2.5 + ph) * 0.04;
    body.scale.set(1 - wob * 0.5, 1 + wob, 1 - wob * 0.5);
    if (moving) { const inch = Math.sin(w); body.scale.z *= 1 + inch * (g.inch ? 0.2 : 0.06); body.position.y += Math.abs(inch) * 0.04; }
    if (swing > 0) { body.scale.y *= 1 - bump(p) * 0.3; body.scale.x *= 1 + bump(p) * 0.15; body.scale.z *= 1 + bump(p) * 0.15; if (u.torso && g.inch) u.torso.rotation.x -= bump(p) * 0.9; for (const a of u.arms) a.rotation.x -= bump(p) * 1.3; }
    if (cast) { for (const a of u.arms) a.rotation.z += Math.sign(a.position.x) * 1.0 + Math.sin(t * 20) * 0.15; body.rotation.z += Math.sin(t * 25) * 0.03; }
  } else if (plan === 'serpent') {
    for (const sg of u.segs) sg.position.x += Math.sin(w * 0.9 - sg.userData.i * 0.75) * (moving ? 0.08 : 0.03) * (1 + sg.userData.i * 0.12);
    if (u.rear) u.rear.rotation.x += Math.sin(t * 1.5 + ph) * 0.08;
    if (u.head) u.head.rotation.y += Math.sin(t * 1.1 + ph) * 0.3;
    const open = swing > 0 ? bump(p) : 0.15 + Math.sin(t * 2) * 0.15;
    for (const j of u.jaws || []) { const b = j.userData.base.r; j.rotation.x = b[0] * (1 + open * 1.4); j.rotation.y = b[1] * (1 + open * 1.4); }
    if (swing > 0) { u.rear.rotation.x += bump(p) * 0.75; body.position.z += bump(p) * 0.35; }
    if (cast) { u.rear.rotation.x -= 0.3; body.rotation.y += Math.sin(t * 6) * 0.1; }
  } else if (plan === 'insect') {
    body.position.y += moving ? Math.abs(Math.sin(w * 2)) * 0.02 : Math.sin(t * 2 + ph) * 0.012;
    u.legs.forEach((L, i) => {
      const side = L.userData.side || 1, row = Math.floor(i / 2), phase = ((row + (side > 0 ? 1 : 0)) % 2) * PI;
      if (moving) { const sw = Math.sin(w + phase); L.rotation.y += sw * 0.35 * side * (g.sidle ? 0.5 : 1); L.rotation.z += Math.max(0, Math.cos(w + phase)) * 0.3 * side; }
      else L.rotation.z += Math.sin(t * 1.5 + i) * 0.03 * side;
    });
    if (u.stalks) for (const st of u.stalks) st.rotation.y += Math.sin(t * 1.3 + ph + st.position.x) * 0.45;
    if (u.claw) { const open = swing > 0 ? (p < 0.4 ? p / 0.4 : Math.max(0, 1 - (p - 0.4) / 0.12)) : 0.4 + Math.sin(t * 1.2 + ph) * 0.3; u.claw.rotation.z -= open * 0.7; }
    if (u.arm && swing > 0) u.arm.rotation.x -= bump(p) * 0.6;
    if (u.spin && (swing > 0 || cast)) u.spin.rotation.z += t * 30;
    if (swing > 0 && !u.claw) { if (u.shootsBackward) u.torso.rotation.y += bump(p) * PI * 0.9; else { body.position.z += bump(p) * 0.2; if (u.head) u.head.rotation.x -= bump(p) * 0.4; } }
    if (cast) { u.torso.rotation.x -= 0.25; body.position.y += 0.05; }
    if (u.head) u.head.rotation.y += Math.sin(t * 0.8 + ph) * 0.12;
  } else if (plan === 'quadruped') {
    body.position.y += moving ? Math.abs(Math.sin(w)) * lift * 0.18 : Math.sin(t * 2 + ph) * 0.01;
    if (g.wobble) body.rotation.z += Math.sin(t * 2.3 + ph) * g.wobble;
    u.legs.forEach((L, i) => { const phase = i === 0 || i === 3 ? 0 : PI; if (moving) L.rotation.x += Math.sin(w + phase) * 0.55 * (g.drag ? 0.5 : 1); });
    if (u.head) { u.head.rotation.x += moving ? Math.sin(w * 2) * 0.06 : Math.sin(t * 1.5 + ph) * 0.05; u.head.rotation.y += moving ? 0 : Math.sin(t * 0.6 + ph) * 0.25; }
    if (u.tail) { u.tail.rotation.y += Math.sin(t * 4 + ph) * 0.3; }
    if (u.jaw) u.jaw.rotation.x += swing > 0 ? bump(p) * 0.6 : g.wobble ? Math.max(0, Math.sin(t * 3)) * 0.2 : 0;
    if (swing > 0) { body.position.z += bump(p) * 0.3; if (u.head) u.head.rotation.x -= bump(p) * 0.35; if (u.arm) { u.arm.rotation.x += swingPose(p) * 0.6; if (u.armL) u.armL.rotation.x += swingPose(1 - swing * 0.7) * 0.6; } }
    if (cast) { if (u.head) u.head.rotation.x -= 0.5; u.torso.rotation.x -= 0.2; body.position.y += 0.05; if (u.jaw) u.jaw.rotation.x += 0.5; }
  } else {   // biped, construct and everything on two legs or a robe
    const glide = g.glide;
    body.position.y += glide ? hover + Math.sin(t * 2 + ph) * 0.05 : moving ? Math.abs(Math.sin(w)) * lift * 0.2 : Math.sin(t * 2 + ph) * 0.012;
    if (moving && !glide) { if (u.torso) u.torso.rotation.z += Math.sin(w) * (g.heavy ? 0.08 : 0.04); if (g.hop) { body.position.y += Math.abs(Math.sin(w)) * 0.15; body.scale.y *= 1 - Math.abs(Math.cos(w)) * 0.08; } }
    u.legs.forEach((L, i) => { if (moving && !g.hop) L.rotation.x += Math.sin(w + i * PI) * 0.6 * (g.stiff ? 0.45 : 1); if (L.userData.knee && moving) L.userData.knee.rotation.x += Math.max(0, -Math.sin(w + i * PI)) * 0.8; });
    const swingsArms = !u.archer && !u.castsBothHands && !g.stiff;
    u.arms.forEach((a, i) => { if (moving && swingsArms && a !== u.weapon?.parent) a.rotation.x += Math.sin(w + (i + 1) * PI) * (g.heavy ? 0.2 : 0.35); });
    if (u.head) { u.head.rotation.y += Math.sin(t * 0.7 + ph) * 0.15; if (g.heavy) u.head.rotation.x += Math.sin(t * 0.9) * 0.04; }
    if (u.book) u.book.position.y += Math.sin(t * 2.4 + ph) * 0.04;
    if (u.censer) u.censer.rotation.x += Math.sin(t * 2.6 + ph) * 0.45;
    if (u.plates) u.plates.rotation.z += t;
    if (swing > 0) {
      if (u.whirl) u.arm.rotation.x -= p * TAU * 2.5;
      else if (u.archer) { u.armR.rotation.z += bump(p) * 0.6; u.armR.rotation.x -= bump(p) * 0.3; }
      else if (u.arm) { u.arm.rotation.x += swingPose(p); if (u.torso) u.torso.rotation.y += bump(p) * (u.dual ? 0.1 : 0.3); if (u.dual && u.armL) u.armL.rotation.x += swingPose(clamp01(p - 0.15)); if (u.hammer || g.heavy) { body.position.y += bump(p) * 0.08; } }
      if (u.lowerArms) for (const a of u.lowerArms) a.rotation.x += swingPose(p) * 0.5;
      if (u.jaw) u.jaw.rotation.x += bump(p) * 0.6;
      if (u.throat) u.throat.scale.multiplyScalar(1 + bump(p) * 0.6);
    }
    if (cast) {
      const sway = Math.sin(t * 6) * 0.08;
      for (const a of u.arms) { a.rotation.x = -2.3 + sway; a.rotation.z = Math.sign(a.position.x) * -0.5; }
      if (u.head) u.head.rotation.x -= 0.35;
      if (u.throat) u.throat.scale.multiplyScalar(1.7 + Math.sin(t * 10) * 0.2);
      if (u.orb) u.orb.position.y += 0.15 + Math.sin(t * 8) * 0.05;
      if (u.hands && u.weapon) u.weapon.rotation.x += 0.4;
    }
  }
  if (hit > 0) { body.scale.multiplyScalar(1 + hit * 0.12); body.rotation.x -= hit * 0.12; }
}
function deathPose(u, k, hover) {
  const body = u.body, d = u.death || 'forward';
  switch (d) {
    case 'forward': body.rotation.x = k * HALF; body.position.y = -k * 0.05; break;
    case 'back': body.rotation.x = -k * HALF; body.position.y = -k * 0.05; break;
    case 'side': body.rotation.z = -k * HALF; for (const L of u.legs) L.rotation.x += k * 0.6 * (L.position.z > 0 ? 1 : -1); break;
    case 'flip': body.rotation.z = k * PI; body.position.y = k * 2 * u.centerY; for (const L of u.legs) L.rotation.z += k * 0.6 * (L.userData.side || 1); break;
    case 'tumble': body.rotation.z = k * PI * 0.8; body.rotation.x = k * 0.5; body.position.y = hover * (1 - k) + k * 0.12; for (const w of u.wings || []) w.rotation.z += k * 1.2 * (w.scale.x < 0 ? -1 : 1); break;
    case 'drop': body.position.y = hover * (1 - k * k); body.rotation.x = k * 1.2; body.rotation.z = k * 0.4; break;
    case 'deflate': body.scale.set(1 + k * 0.5, Math.max(0.08, 1 - k * 0.88), 1 + k * 0.5); break;
    case 'melt': body.scale.set(1 + k * 0.6, Math.max(0.1, 1 - k * 0.9), 1 + k * 0.6); break;
    case 'flat': if (u.rear) u.rear.rotation.x = u.rear.userData.base.r[0] * (1 - k); for (const s of u.segs || []) s.position.x = 0; break;
    case 'fade': body.position.y = hover + k * 0.8; body.scale.setScalar(Math.max(0.05, 1 - k * 0.6)); break;
    case 'sink': body.position.y = -k * (u.height / u.scale) * 0.95; break;
    case 'collapse': body.scale.y = Math.max(0.15, 1 - k * 0.85); body.rotation.x = k * 0.3; for (const L of u.legs) L.rotation.z += k * 0.5 * Math.sign(L.position.x || 1); for (const a of u.arms) a.rotation.z += k * 0.8 * Math.sign(a.position.x || 1); break;
    case 'swell': { const s = k < 0.85 ? 1 + k * 0.4 : 0.02; body.scale.setScalar(s); break; }
    case 'pop': body.scale.setScalar(Math.max(0.02, 1 - k)); break;
    case 'kneel': for (const L of u.legs) L.rotation.x -= k * 1.3; body.position.y -= k * (u.legs[0] ? u.legs[0].userData.len * 0.45 : 0.2); if (u.torso) u.torso.rotation.x += k * 0.5; if (u.head) u.head.rotation.x += k * 0.6; for (const a of u.arms) a.rotation.x += k * 0.4; break;
  }
}

// ---------------------------------------------------------------- measuring
export function triangleCount(group) {
  let n = 0;
  group.traverse(o => { if (o.isMesh && o.visible && o.geometry) { const g = o.geometry; n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } });
  return Math.round(n);
}
export function materialCount(group) { const set = new Set(); group.traverse(o => { if (o.isMesh && o.visible) set.add(o.material.uuid); }); return set.size; }
export function meshCount(group) { let n = 0; group.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; }
/** The ids this kit has a bespoke builder for (everything else gets a body-plan stand-in). */
export const BUILT_IDS = Object.keys(BUILD);
export const RARE_IDS = Object.keys(RARE);
