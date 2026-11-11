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
