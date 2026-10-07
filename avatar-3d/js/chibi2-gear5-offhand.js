// Chibi 2 — round-5 off-hand items and worn accessories (Thousandvale play-test 5, T23 / T15).
//
// Twelve things for the left hand and five things that are worn, every one a new `g5_` id listed in
// chibi2-gear5-ids.js and reached only through chibi2-gear5.js — nothing that existed changes.
//
//   shields   g5_targe · g5_scutcheon · g5_almond · g5_pavise       strapped to the forearm, face out
//   foci      g5_folio · g5_starglass · g5_thurible · g5_seeingmask · g5_sigilplate · g5_antlerrod
//             (one per focus kind, each silhouette suggesting one magic attack form)
//   carried   g5_hipquiver · g5_cresset
//   worn      g5_swallowtail (cape) · g5_hexlantern, g5_girdle (decor) · g5_torc (accessory) · g5_signet (ring)
//
// BONE SPACES (see the note at the top of chibi2-gear.js):
//   elbowL  the forearm runs from y 0 down to -0.205T; the OUTSIDE of the left forearm is -x. A shield
//           board is drawn in its own xy plane and turned [0, -PI/2, 0], which sends its +z to -x (out)
//           and its +x to +z (forward) — the same turn strapShield makes.
//   handL   a focus is built UP +y out of the fist at z 0.10 (the 'orb' hold stands +y upright); a book
//           hangs at y -0.1; a torch runs DOWN -y from the fist at z 0.055.
//   hips    belt at y ~0.03; the character's RIGHT is +x; hands hang at x ±0.255W, y ~-0.06.
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';
import { KIT } from './chibi2-weapons.js';
import { placeEmblem } from './chibi2-armour2.js';

const { tone, lift, extrude } = KIT;
const BRASS = '#c8a040', IRON = '#5a5f68', WOOD = '#5a3a1a', LEATHER = '#4a3624', PARCH = '#efe6cc';
const sph = (ws = 8, hs = 5) => new THREE.SphereGeometry(1, ws, hs);
const ico = () => new THREE.IcosahedronGeometry(1, 0);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (r0, r1, h, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);
const tor = (r, t, n = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 4, n, arc);
const own = (c, fallback) => (c && c !== '#9aa3ad' && c !== '#8a7a5a' ? c : fallback);

/** Reversed-winding copy, so a thin sheet shows from both sides. Take it BEFORE the original is placed. */
function backface(g) {
  const b = g.clone();
  if (!b.index) b.setIndex(Array.from({ length: b.attributes.position.count }, (_, i) => i));
  const idx = b.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]];
  b.computeVertexNormals(); return b;
}
/** A lathe ring [y, rx, rz, z] of `rings` at height y (linear between rows). */
function ringAt(rings, y) {
  if (!rings?.length) return [y, 0.2, 0.14, 0];
  if (y <= rings[0][0]) return rings[0];
  for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) {
    const a = rings[i - 1], b = rings[i], t = (y - a[0]) / (b[0] - a[0] || 1);
    return [y, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t];
  }
  return rings[rings.length - 1];
}

// ---------------------------------------------------------------- shields
/**
 * The shared part of a strapped shield: where it sits, a way to lay things on its outer face, the two
 * enarmes the forearm goes through, and a themed emblem if the game sent one.
 * `face(u, v, d)` -> elbowL position of board point (u forward, v up) standing `d` proud of the face.
 */
function shieldMount(c, part, h) {
  const T = c.T || 1, A = c.A || 1, L = 'elbowL';
  const pos = [-0.1, -0.11 * T * A, 0.02], rot = [0, -Math.PI / 2, 0];
  const face = (u, v, d = 0) => [pos[0] - 0.012 - d, pos[1] + v, pos[2] + u];
  for (const s of [-1, 1]) c.add(tor(0.085, 0.01, 10, Math.PI), L, LEATHER, { position: [pos[0] + 0.02, pos[1] + s * 0.06, 0], rotation: [Math.PI / 2, 0, -Math.PI / 2] });
  const emblem = (size = 0.06, v = 0) => {
    if (!part?.emblem) return false;
    try { placeEmblem(c.add, L, part.emblem, part.emblemColor || '#ffcf4a', { position: face(0, v, 0.004), rotation: rot, size, back: '#2a2a30', rim: part.color2 || BRASS }); } catch { return false; }
    return true;
  };
  void h;
  return { L, pos, rot, face, emblem };
}
const board = (c, m, pts, depth, colour, dx = 0, metal = true) => c.add(extrude(pts, depth), m.L, colour, { position: [m.pos[0] + dx, m.pos[1], m.pos[2]], rotation: m.rot, metal });
const circle = (rx, ry, n = 16) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return [Math.cos(t) * rx, Math.sin(t) * ry]; });

export const G5_OFFHAND_BUILDERS = {
  /** A round targe: leather face on a wooden board, an iron rim, a ring of studs and a centre spike. */
  g5_targe(c, oc, q, a, part) {
    const m = shieldMount(c, part), R = 0.2, hide = own(oc, '#7a5a3a');
    board(c, m, circle(R, R), 0.022, hide, 0, false);
    board(c, m, circle(R * 1.07, R * 1.07), 0.012, IRON, 0.007);
    board(c, m, circle(R * 0.55, R * 0.55), 0.008, tone(hide, 0.75), -0.014, false);
    for (let k = 0; k < 10; k++) { const t = k / 10 * Math.PI * 2; c.add(sph(6, 4), m.L, BRASS, { position: m.face(Math.cos(t) * R * 0.78, Math.sin(t) * R * 0.78, 0.002), scale: [0.012, 0.016, 0.016], metal: true }); }
    if (!m.emblem(0.05)) {
      c.add(cyl(0.05, 0.062, 0.02, 10), m.L, BRASS, { position: m.face(0, 0, 0.012), rotation: [0, 0, Math.PI / 2], metal: true });
      c.add(new THREE.ConeGeometry(0.026, 0.11, 6), m.L, lift(IRON, 0.35), { position: m.face(0, 0, 0.07), rotation: [0, 0, Math.PI / 2], metal: true });
    }
    if (q >= 2) for (const t of [0.6, 2.7, 4.6]) c.add(ico(), m.L, lift(hide, 0.5), { position: m.face(Math.cos(t) * R * 0.42, Math.sin(t) * R * 0.42, 0.006), scale: [0.008, 0.014, 0.014], metal: true });
  },
  /** A jousting heater: a lance notch cut out of the top front corner and a broad diagonal band. */
  g5_scutcheon(c, oc, q, a, part) {
    const m = shieldMount(c, part), w = 0.2, h = 0.5, st = own(oc, '#8d97a3');
    const pts = [[-w, h * 0.5], [w * 0.42, h * 0.5], [w * 0.5, h * 0.36], [w * 0.8, h * 0.3], [w, h * 0.4], [w, -h * 0.05], [w * 0.62, -h * 0.34], [0, -h * 0.5], [-w * 0.62, -h * 0.34], [-w, -h * 0.05]];
    board(c, m, pts, 0.024, st);
    board(c, m, pts.map(([x, y]) => [x * 1.07, y * 1.05]), 0.012, tone(st, 0.62), 0.007);
    // the band, corner to corner, a shade of the trim; laid as a thin slab just proud of the face
    const band = part?.color2 || '#a83a2a';
    board(c, m, [[-w * 0.95, h * 0.44], [-w * 0.6, h * 0.48], [w * 0.72, -h * 0.2], [w * 0.5, -h * 0.36]], 0.006, band, -0.016, false);
    if (!m.emblem(0.05, -0.02)) c.add(sph(8, 5), m.L, lift(st, 0.3), { position: m.face(0, 0.01, 0.006), scale: [0.02, 0.045, 0.045], metal: true });
    for (const [u, v] of [[-w * 0.8, h * 0.3], [w * 0.8, h * 0.12], [0, -h * 0.4]]) c.add(sph(6, 4), m.L, BRASS, { position: m.face(u, v, 0.002), scale: [0.008, 0.012, 0.012], metal: true });
    if (q >= 2) c.add(ico(), m.L, lift(band, 0.5), { position: m.face(-w * 0.5, -h * 0.12, 0.004), scale: [0.01, 0.02, 0.02], metal: true });
  },
  /** A long almond kite: pointed top and bottom, a raised spine down the middle and rivets round the rim. */
  g5_almond(c, oc, q, a, part) {
    const m = shieldMount(c, part), w = 0.18, h = 0.66, st = own(oc, '#8d97a3');
    const n = 9, pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, y = h * (0.42 - t * 0.92), k = Math.sin(Math.PI * Math.pow(t, 0.72)); pts.push([w * (0.12 + 0.88 * k), y]); }
    const outline = [[0, h * 0.5], ...pts, [0, -h * 0.5], ...pts.slice().reverse().map(([x, y]) => [-x, y])];
    board(c, m, outline, 0.024, st);
    board(c, m, outline.map(([x, y]) => [x * 1.08, y * 1.03]), 0.012, tone(st, 0.6), 0.007);
    // the spine: a ridge standing off the face from tip to tip
    c.add(taperedCurve([m.face(0, h * 0.46, 0.004), m.face(0, h * 0.1, 0.02), m.face(0, -h * 0.46, 0.004)], [0.006, 0.018, 0.006], 4, 8), m.L, lift(st, 0.25), { metal: true });
    for (let i = 1; i < n; i += 2) for (const s of [-1, 1]) c.add(sph(6, 4), m.L, BRASS, { position: m.face(s * pts[i][0] * 0.86, pts[i][1], 0.002), scale: [0.007, 0.011, 0.011], metal: true });
    if (!m.emblem(0.045, h * 0.12)) c.add(sph(8, 5), m.L, BRASS, { position: m.face(0, h * 0.1, 0.02), scale: [0.02, 0.036, 0.036], metal: true });
    if (q >= 2) c.add(ico(), m.L, lift(st, 0.55), { position: m.face(0, -h * 0.2, 0.014), scale: [0.01, 0.022, 0.016], metal: true });
  },
  /** A pavise: a tall board with an arched top, a hollow ridge up the middle and iron-shod corners. */
  g5_pavise(c, oc, q, a, part) {
    const m = shieldMount(c, part), w = 0.2, h = 0.72, st = own(oc, '#8d97a3');
    const arch = Array.from({ length: 7 }, (_, i) => { const t = i / 6 * Math.PI; return [Math.cos(t) * w, h * 0.36 + Math.sin(t) * h * 0.14]; });
    const pts = [[w, -h * 0.5], ...arch, [-w, -h * 0.5]];
    board(c, m, pts, 0.026, st);
    board(c, m, pts.map(([x, y]) => [x * 1.06, y * 1.03]), 0.012, tone(st, 0.6), 0.008);
    // the ridge: a half-round channel the full height, wider at the foot
    c.add(profile([[-h * 0.48, 0.05, 0.03], [h * 0.2, 0.04, 0.026], [h * 0.47, 0.022, 0.012]], 8), m.L, lift(st, 0.14), { position: [m.pos[0] - 0.008, m.pos[1], m.pos[2]], rotation: m.rot, metal: true });
    for (const v of [-h * 0.32, h * 0.26]) board(c, m, [[-w, v - 0.016], [w, v - 0.016], [w, v + 0.016], [-w, v + 0.016]], 0.006, tone(st, 0.7), -0.016);
    for (const s of [-1, 1]) board(c, m, [[s * w, -h * 0.5], [s * w * 0.5, -h * 0.5], [s * w, -h * 0.34]], 0.008, IRON, -0.017);
    if (!m.emblem(0.05, h * 0.02)) for (const s of [-1, 1]) c.add(sph(6, 4), m.L, BRASS, { position: m.face(s * w * 0.6, h * 0.26, 0.004), scale: [0.009, 0.014, 0.014], metal: true });
    if (q >= 2) c.add(ico(), m.L, lift(st, 0.55), { position: m.face(0, h * 0.4, 0.016), scale: [0.012, 0.024, 0.02], metal: true });
  },

  // ---------------------------------------------------------------- foci
  /** A sealed folio (tome, form projectile): a thick book bound shut with two straps, wax seals on ribbons, a quill. */
  g5_folio(c, oc, q) {
    const L = 'handL', B = [0, -0.1, 0.1], cover = own(oc, '#3a4a6a');
    c.add(box(0.07, 0.25, 0.19), L, cover, { position: B });
    c.add(box(0.054, 0.236, 0.18), L, PARCH, { position: [B[0], B[1], B[2] + 0.007] });
    c.add(new THREE.CylinderGeometry(0.037, 0.037, 0.25, 8, 1, false, Math.PI, Math.PI), L, tone(cover, 0.75), { position: [B[0], B[1], B[2] - 0.095] });
    for (const y of [-0.07, 0.07]) {
      // a strap right round the book, and its buckle on the fore-edge
      c.add(box(0.078, 0.026, 0.198), L, LEATHER, { position: [B[0], B[1] + y, B[2]] });
      c.add(box(0.03, 0.036, 0.012), L, BRASS, { position: [B[0], B[1] + y, B[2] + 0.1], metal: true });
    }
    // two wax seals pressed on the outside (-x) cover, each on a ribbon run under the lower strap
    for (const [dz, len, col] of [[-0.035, 0.07, '#b03030'], [0.04, 0.045, '#2a7a5a']]) {
      c.add(box(0.005, len, 0.016), L, tone(col, 0.8), { position: [B[0] - 0.038, B[1] - 0.07 + len / 2, B[2] + dz] });
      c.add(cyl(0.024, 0.024, 0.012, 8), L, col, { position: [B[0] - 0.041, B[1] - 0.07 + len, B[2] + dz], rotation: [0, 0, Math.PI / 2] });
    }
    // the quill, tucked under the top strap and standing out of the top
    c.add(taperedCurve([[B[0] - 0.042, B[1] + 0.02, B[2] + 0.03], [B[0] - 0.044, B[1] + 0.12, B[2] + 0.02], [B[0] - 0.046, B[1] + 0.2, B[2] - 0.02]], [0.004, 0.014, 0.003], 4, 6), L, '#f0ece0');
    if (q >= 2) c.add(ico(), L, lift(cover, 0.5), { position: [B[0] - 0.038, B[1], B[2]], scale: [0.008, 0.026, 0.02], metal: true });
  },
  /** A caged starglass (orb, form area): a glass orb held in four ribs that meet in a finial, spikes at the equator. */
  g5_starglass(c, oc, q) {
    const L = 'handL', P = [0, 0.2, 0.10], glass = own(oc, '#9fd8ff'), R = 0.085;
    c.add(cyl(0.02, 0.016, 0.1, 6), L, tone(BRASS, 0.7), { position: [0, 0.04, 0.10], metal: true });
    c.add(cyl(0.04, 0.022, 0.03, 8), L, BRASS, { position: [0, 0.1, 0.10], metal: true });
    c.add(new THREE.SphereGeometry(R, 12, 8), L, glass, { position: P, metal: true });
    c.add(new THREE.OctahedronGeometry(1), L, lift(glass, 0.7), { position: P, scale: [0.03, 0.04, 0.03] });
    for (let k = 0; k < 4; k++) {
      const t = k / 4 * Math.PI * 2 + Math.PI / 4, sx = Math.sin(t), cz = Math.cos(t), r = R + 0.012;
      const rib = Array.from({ length: 7 }, (_, i) => { const p = -1.35 + i / 6 * 2.7; return [P[0] + sx * Math.cos(p) * r, P[1] + Math.sin(p) * r, P[2] + cz * Math.cos(p) * r]; });
      c.add(taperedCurve(rib, [0.007, 0.009, 0.007], 4, 10), L, BRASS, { metal: true });
      c.add(new THREE.ConeGeometry(0.012, 0.06, 4), L, lift(BRASS, 0.2), { position: [P[0] + sx * (r + 0.03), P[1], P[2] + cz * (r + 0.03)], rotation: [cz * Math.PI / 2, 0, -sx * Math.PI / 2], metal: true });
    }
    c.add(new THREE.ConeGeometry(0.016, 0.08, 5), L, BRASS, { position: [P[0], P[1] + R + 0.045, P[2]], metal: true });
    if (q >= 2) c.add(tor(R + 0.03, 0.004, 16), L, lift(glass, 0.5), { position: P, rotation: [Math.PI / 2, 0, 0] });
  },
  /** A thurible (relic, form cone): a pierced censer hanging on three chains from a hooked rod, smoke fanning up. */
  g5_thurible(c, oc, q) {
    const L = 'handL', gold = own(oc, BRASS), top = [0, 0.34, 0.2], bowl = [0, 0.15, 0.2];
    c.add(cyl(0.017, 0.017, 0.34, 6), L, tone(gold, 0.6), { position: [0, 0.15, 0.10], metal: true });
    c.add(taperedCurve([[0, 0.3, 0.10], [0, 0.365, 0.12], [0, 0.375, 0.17], top], [0.012, 0.011, 0.009, 0.007], 4, 8), L, tone(gold, 0.6), { metal: true });
    c.add(tor(0.014, 0.004, 8), L, gold, { position: [top[0], top[1] - 0.012, top[2]], rotation: [0, Math.PI / 2, 0], metal: true });
    for (let k = 0; k < 3; k++) {
      const t = k / 3 * Math.PI * 2 + 0.5, x = Math.sin(t) * 0.05, z = Math.cos(t) * 0.05;
      c.add(taperedCurve([[top[0], top[1] - 0.02, top[2]], [bowl[0] + x, bowl[1] + 0.035, bowl[2] + z]], [0.004, 0.004], 3, 1), L, lift(gold, 0.2), { metal: true });
    }
    // the bowl, a band of dark piercings round its rim, a domed lid and a foot
    c.add(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), L, gold, { position: bowl, scale: [0.06, 0.06, 0.06], metal: true });
    c.add(cyl(0.061, 0.061, 0.022, 10), L, '#2a1a10', { position: [bowl[0], bowl[1] + 0.011, bowl[2]] });
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; c.add(box(0.012, 0.026, 0.012), L, gold, { position: [bowl[0] + Math.sin(t) * 0.06, bowl[1] + 0.011, bowl[2] + Math.cos(t) * 0.06], rotation: [0, t, 0], metal: true }); }
    c.add(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), L, tone(gold, 0.85), { position: [bowl[0], bowl[1] + 0.022, bowl[2]], scale: [0.06, 0.04, 0.06], metal: true });
    c.add(cyl(0.02, 0.034, 0.02, 8), L, tone(gold, 0.7), { position: [bowl[0], bowl[1] - 0.066, bowl[2]], metal: true });
    c.add(sph(6, 4), L, '#ff9a3a', { position: [bowl[0], bowl[1] + 0.012, bowl[2] + 0.062], scale: [0.012, 0.008, 0.004] });
    // smoke: three pale wisps opening forward and up like a fan
    for (const [dx, k] of [[-0.05, 0.9], [0, 1.15], [0.05, 0.9]]) {
      c.add(taperedCurve([[bowl[0], bowl[1] + 0.06, bowl[2] + 0.02], [bowl[0] + dx * 0.6, bowl[1] + 0.06 + 0.05 * k, bowl[2] + 0.07], [bowl[0] + dx * 1.6, bowl[1] + 0.06 + 0.09 * k, bowl[2] + 0.15 * k]], [0.006, 0.014, 0.024], 5, 6), L, '#d8dce4');
    }
    if (q >= 2) c.add(ico(), L, '#d04040', { position: [bowl[0], bowl[1] + 0.066, bowl[2]], scale: [0.012, 0.016, 0.012], metal: true });
  },
  /** A seeing mask (idol, form beam): a carved face on a stick, a round lens in its forehead, two horns. */
  g5_seeingmask(c, oc, q, a, part) {
    const L = 'handL', wood = own(oc, '#b89a58'), P = [0, 0.2, 0.10], lens = part?.color2 || '#7fe8ff';
    c.add(cyl(0.017, 0.02, 0.14, 6), L, WOOD, { position: [0, 0.04, 0.10] });
    // the face: a long shallow shield of wood, bowed forward
    const face = [[0, -0.12], [0.06, -0.08], [0.085, 0.02], [0.075, 0.11], [0.035, 0.15], [-0.035, 0.15], [-0.075, 0.11], [-0.085, 0.02], [-0.06, -0.08]];
    c.add(extrude(face, 0.03), L, wood, { position: P });
    c.add(extrude(face.map(([x, y]) => [x * 0.84, y * 0.86 + 0.004]), 0.012), L, lift(wood, 0.18), { position: [P[0], P[1], P[2] + 0.014] });
    // eye slits, a long nose, a mouth bar
    for (const s of [-1, 1]) c.add(box(0.04, 0.012, 0.01), L, '#140c08', { position: [P[0] + s * 0.036, P[1] + 0.03, P[2] + 0.021], rotation: [0, 0, s * 0.25] });
    c.add(box(0.014, 0.07, 0.016), L, tone(wood, 0.8), { position: [P[0], P[1] - 0.012, P[2] + 0.024] });
    c.add(box(0.05, 0.01, 0.01), L, '#140c08', { position: [P[0], P[1] - 0.075, P[2] + 0.021] });
    // the lens: a bright disc in a brass ring, with a short hood standing off it — where the beam leaves
    c.add(cyl(0.026, 0.026, 0.012, 12), L, lens, { position: [P[0], P[1] + 0.095, P[2] + 0.024], rotation: [Math.PI / 2, 0, 0], metal: true });
    c.add(tor(0.028, 0.007, 12), L, BRASS, { position: [P[0], P[1] + 0.095, P[2] + 0.028], metal: true });
    c.add(sph(6, 4), L, '#ffffff', { position: [P[0], P[1] + 0.095, P[2] + 0.031], scale: [0.01, 0.01, 0.004] });
    for (const s of [-1, 1]) c.add(taperedCurve([[P[0] + s * 0.06, P[1] + 0.13, P[2]], [P[0] + s * 0.11, P[1] + 0.17, P[2]], [P[0] + s * 0.115, P[1] + 0.24, P[2] + 0.01]], [0.02, 0.014, 0.003], 5, 6), L, '#e8e0c8');
    for (const s of [-1, 1]) c.add(taperedCurve([[P[0] + s * 0.07, P[1] - 0.06, P[2]], [P[0] + s * 0.085, P[1] - 0.13, P[2]], [P[0] + s * 0.07, P[1] - 0.19, P[2]]], [0.008, 0.007, 0.002], 3, 4), L, '#a83a2a');
    if (q >= 2) for (const s of [-1, 1]) c.add(ico(), L, lift(lens, 0.3), { position: [P[0] + s * 0.062, P[1] + 0.08, P[2] + 0.018], scale: [0.008, 0.012, 0.006], metal: true });
  },
  /** A sigil plate (ward, form shield): a hexagonal plate on a handle, a raised rune ring and a centre boss. */
  g5_sigilplate(c, oc, q) {
    const L = 'handL', glow = own(oc, '#9fe0ff'), P = [0, 0.2, 0.10], R = 0.115;
    c.add(cyl(0.02, 0.016, 0.12, 6), L, tone(BRASS, 0.7), { position: [0, 0.04, 0.10], metal: true });
    const hex = (r) => Array.from({ length: 6 }, (_, i) => { const t = i / 6 * Math.PI * 2 + Math.PI / 6; return [Math.cos(t) * r, Math.sin(t) * r]; });
    c.add(extrude(hex(R), 0.02), L, '#4a5262', { position: P, metal: true });
    c.add(extrude(hex(R * 1.1), 0.01), L, BRASS, { position: [P[0], P[1], P[2] - 0.002], metal: true });
    for (const z of [0.013, -0.013]) c.add(tor(R * 0.62, 0.008, 18), L, glow, { position: [P[0], P[1], P[2] + z] });
    for (let k = 0; k < 6; k++) {
      const t = k / 6 * Math.PI * 2 + Math.PI / 6;
      c.add(box(0.01, 0.03, 0.006), L, glow, { position: [P[0] + Math.cos(t) * R * 0.82, P[1] + Math.sin(t) * R * 0.82, P[2] + 0.011], rotation: [0, 0, t + (k % 2 ? 0.5 : -0.5)] });
      c.add(sph(6, 4), L, BRASS, { position: [P[0] + Math.cos(t) * R * 1.02, P[1] + Math.sin(t) * R * 1.02, P[2] + 0.006], scale: [0.011, 0.011, 0.008], metal: true });
    }
    c.add(sph(8, 5), L, lift(glow, 0.3), { position: [P[0], P[1], P[2] + 0.012], scale: [0.036, 0.036, 0.02], metal: true });
    if (q >= 2) c.add(new THREE.OctahedronGeometry(1), L, '#ffffff', { position: [P[0], P[1], P[2] + 0.03], scale: [0.012, 0.018, 0.008] });
  },
  /** An antler rod (totem, form fork): a rod that splits into a forked antler, a crystal bound between the tines. */
  g5_antlerrod(c, oc, q, a, part) {
    const L = 'handL', wood = own(oc, '#8a6a42'), horn = '#e8e0c8', z = 0.10, gemc = part?.color2 || '#9ede6a';
    c.add(profile([[-0.03, 0.017, 0.017], [0.16, 0.02, 0.02]], 6), L, wood, { position: [0, 0, z] });
    for (const y of [0.1, 0.15]) c.add(tor(0.022, 0.006, 8), L, '#a83a2a', { position: [0, y, z], rotation: [Math.PI / 2, 0, 0] });
    for (const s of [-1, 1]) {
      // the main beam of each side, then two tines off it
      c.add(taperedCurve([[0, 0.15, z], [s * 0.05, 0.22, z], [s * 0.11, 0.3, z + 0.01], [s * 0.1, 0.4, z + 0.02]], [0.02, 0.017, 0.013, 0.003], 5, 9), L, horn);
      c.add(taperedCurve([[s * 0.06, 0.235, z], [s * 0.14, 0.25, z + 0.02], [s * 0.18, 0.31, z + 0.03]], [0.012, 0.009, 0.002], 4, 5), L, horn);
      c.add(taperedCurve([[s * 0.105, 0.31, z + 0.01], [s * 0.05, 0.35, z + 0.03], [s * 0.04, 0.41, z + 0.03]], [0.011, 0.008, 0.002], 4, 5), L, tone(horn, 0.92));
    }
    // the crystal in the fork, lashed in with cord
    c.add(new THREE.OctahedronGeometry(1), L, gemc, { position: [0, 0.27, z + 0.005], scale: [0.026, 0.05, 0.026], metal: true });
    c.add(taperedCurve([[-0.06, 0.245, z], [0, 0.262, z + 0.028], [0.06, 0.245, z]], [0.004, 0.004, 0.004], 3, 4), L, '#a83a2a');
    c.add(taperedCurve([[-0.07, 0.275, z], [0, 0.282, z - 0.026], [0.07, 0.275, z]], [0.004, 0.004, 0.004], 3, 4), L, '#a83a2a');
    c.add(box(0.01, 0.08, 0.004), L, '#2a8a8a', { position: [0.03, 0.09, z + 0.02], rotation: [0, 0, 0.4] });
    if (q >= 2) c.add(tor(0.04, 0.003, 12), L, lift(gemc, 0.5), { position: [0, 0.27, z + 0.005], rotation: [Math.PI / 2, 0, 0] });
  },

  // ---------------------------------------------------------------- carried, not a focus
  /** A hip quiver: slung behind the right hip from the belt, mouth tipped back, arrows fanning out of it. */
  g5_hipquiver(c, oc, q) {
    const W = c.W || 1, hide = own(oc, '#6a4a2a');
    const x = 0.15 * W, zB = (c.hipsZ ? c.hipsZ(0.1 * W, -0.02, -1, 0.04) : -0.16 * W);
    const rot = new THREE.Euler(-0.75, 0, -0.18), dir = new THREE.Vector3(0, 1, 0).applyEuler(rot);
    const base = new THREE.Vector3(x, -0.05, zB - 0.07), r = [rot.x, rot.y, rot.z];
    c.add(cyl(0.056, 0.042, 0.34, 8), 'hips', hide, { position: base.toArray(), rotation: r });
    const mouth = base.clone().addScaledVector(dir, 0.17), foot = base.clone().addScaledVector(dir, -0.17);
    c.add(tor(0.056, 0.01, 10), 'hips', tone(hide, 0.65), { position: mouth.toArray(), rotation: [r[0] + Math.PI / 2, r[1], r[2]] });
    c.add(tor(0.05, 0.008, 10), 'hips', tone(hide, 0.65), { position: base.clone().addScaledVector(dir, -0.04).toArray(), rotation: [r[0] + Math.PI / 2, r[1], r[2]] });
    c.add(sph(8, 4), 'hips', tone(hide, 0.75), { position: foot.toArray(), scale: [0.044, 0.03, 0.044] });
    // two hangers up to the belt
    for (const t of [0.12, -0.02]) { const p = base.clone().addScaledVector(dir, t); c.add(taperedCurve([[p.x - 0.02, p.y + 0.03, p.z + 0.03], [x - 0.02, 0.03, zB + 0.03]], [0.007, 0.007], 4, 1), 'hips', LEATHER); }
    for (const [dx, dz, col] of [[-0.022, 0.012, '#c83a2a'], [0.022, 0.0, '#e8e0c0'], [0, -0.024, '#c83a2a'], [0.004, 0.026, '#2a7a5a']]) {
      const from = mouth.clone().add(new THREE.Vector3(dx, 0, dz)).addScaledVector(dir, -0.04), to = from.clone().addScaledVector(dir, 0.18);
      c.add(taperedCurve([from.toArray(), to.toArray()], [0.005, 0.005], 4, 1), 'hips', '#e8e0c0');
      for (const turn of [0, Math.PI / 2]) c.add(box(0.004, 0.06, 0.032), 'hips', col, { position: to.clone().addScaledVector(dir, -0.035).toArray(), rotation: new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromEuler(rot).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)))).toArray().slice(0, 3) });
    }
    if (q >= 2) c.add(ico(), 'hips', BRASS, { position: base.clone().addScaledVector(dir, 0.08).add(new THREE.Vector3(0.05, 0, 0)).toArray(), scale: [0.012, 0.018, 0.012], metal: true });
  },
  /** A cresset torch: an iron fire-basket on a stick — bars, two hoops, coals, and flame out of the open top. */
  g5_cresset(c, oc, q) {
    const L = 'handL', tz = 0.055, fire = own(oc, '#ff8c2a');
    c.add(profile([[-0.36, 0.019, 0.019], [0.08, 0.016, 0.016]], 6), L, WOOD, { position: [0, 0, tz] });
    c.add(profile([[-0.39, 0.03, 0.03], [-0.35, 0.022, 0.022]], 6), L, IRON, { position: [0, 0, tz], metal: true });
    // the basket widens away from the fist: six bars and two hoops
    for (let k = 0; k < 6; k++) {
      const t = k / 6 * Math.PI * 2, sx = Math.sin(t), cz = Math.cos(t);
      c.add(taperedCurve([[sx * 0.028, -0.38, tz + cz * 0.028], [sx * 0.058, -0.45, tz + cz * 0.058], [sx * 0.07, -0.53, tz + cz * 0.07]], [0.006, 0.006, 0.006], 3, 4), L, IRON, { metal: true });
    }
    for (const [y, r] of [[-0.45, 0.058], [-0.53, 0.07]]) c.add(tor(r, 0.007, 12), L, IRON, { position: [0, y, tz], rotation: [Math.PI / 2, 0, 0], metal: true });
    for (const [dx, dz, y] of [[0.02, 0.01, -0.44], [-0.02, -0.015, -0.47], [0.005, 0.02, -0.5]]) c.add(ico(), L, '#3a2a22', { position: [dx, y, tz + dz], scale: [0.03, 0.026, 0.03] });
    c.add(ico(), L, '#ff5a1a', { position: [0, -0.5, tz], scale: [0.036, 0.022, 0.036] });
    c.add(new THREE.ConeGeometry(0.05, 0.17, 6), L, fire, { position: [0, -0.61, tz], rotation: [Math.PI, 0, 0] });
    c.add(new THREE.ConeGeometry(0.028, 0.11, 5), L, '#ffd27a', { position: [0.004, -0.59, tz + 0.004], rotation: [Math.PI, 0, 0] });
    for (const s of [-1, 1]) c.add(new THREE.ConeGeometry(0.022, 0.09, 5), L, fire, { position: [s * 0.036, -0.57, tz], rotation: [Math.PI, 0, s * 0.3] });
    if (q >= 2) c.add(tor(0.034, 0.006, 10), L, BRASS, { position: [0, -0.33, tz], rotation: [Math.PI / 2, 0, 0], metal: true });
  },
};

// ---------------------------------------------------------------- cape
export const G5_CAPE_BUILDERS = {
  /** A swallowtail cloak: a standing collar, a clasp chain across the chest, the back split into two long points. */
  g5_swallowtail(a, c, cape) {
    const { add, W = 1, T = 1 } = c, cc = cape?.color || '#3a4a5a', trim = cape?.color2 || BRASS;
    const top = 0.3 * T, length = 0.86, sx = 10, sy = 8;
    const g = new THREE.PlaneGeometry(1, 1, sx, sy), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = 0.5 - p.getY(i);
      // two tails: full length at |u| ~0.27, cut high in the middle and shorter at the outer edges
      const f = 0.56 + 0.44 * Math.max(0, 1 - Math.abs(Math.abs(u) - 0.27) / 0.23);
      const width = THREE.MathUtils.lerp(0.42 * W, 0.66 * W, v);
      p.setXYZ(i, u * width, top - v * length * f, THREE.MathUtils.lerp(-0.155 * W, -0.34, v * f) + Math.cos(u * 16) * 0.016 * v);
    }
    g.computeVertexNormals();
    const inner = backface(g);
    add(g, 'chest', cc); add(inner, 'chest', tone(cc, 0.7));
    // the yoke over the shoulders, so the sheet has something to hang from
    add(taperedCurve([[-0.2 * W, 0.275 * T, 0.02], [-0.17 * W, 0.3 * T, -0.08 * W], [0, 0.315 * T, -0.15 * W], [0.17 * W, 0.3 * T, -0.08 * W], [0.2 * W, 0.275 * T, 0.02]], [0.03, 0.036, 0.04, 0.036, 0.03], 5, 12), 'chest', cc);
    // the standing collar: an open band behind the neck, both faces, piped along the top
    const col = new THREE.CylinderGeometry(0.16 * W, 0.13 * W, 0.13, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8);
    const colIn = backface(col);
    add(col, 'chest', cc, { position: [0, 0.36 * T, -0.02] }); add(colIn, 'chest', tone(cc, 0.6), { position: [0, 0.36 * T, -0.02] });
    const edge = [];
    for (let k = 0; k <= 10; k++) { const t = Math.PI * 0.6 + Math.PI * 0.8 * k / 10; edge.push([Math.sin(t) * 0.16 * W, 0.36 * T + 0.065, Math.cos(t) * 0.16 * W - 0.02]); }
    add(taperedCurve(edge, [0.006, 0.01, 0.006], 4, 14), 'chest', trim, { metal: true });
    // two round clasps on the collarbones and a chain swagged between them
    const zc = (x, y, l) => (c.chestZ ? c.chestZ(x, y, 1, l) : 0.14 * W);
    const plate = c.topStyle?.armor ? 0.04 : 0.012;
    for (const s of [-1, 1]) add(cyl(0.028, 0.028, 0.012, 10), 'chest', trim, { position: [s * 0.13 * W, 0.245 * T, zc(s * 0.13 * W, 0.245 * T, plate + 0.006)], rotation: [Math.PI / 2, 0, 0], metal: true });
    add(taperedCurve([-1, -0.5, 0, 0.5, 1].map(k => { const x = k * 0.13 * W, y = (0.245 - (1 - k * k) * 0.045) * T; return [x, y, zc(x, y, plate + 0.01)]; }), [0.006, 0.006, 0.006], 4, 10), 'chest', lift(trim, 0.2), { metal: true });
  },
};

// ---------------------------------------------------------------- decor
export const G5_DECOR_BUILDERS = {
  /** A hooded storm lantern: six panes of light in an iron cage with a peaked hood, on a hook and chain at the right hip. */
  g5_hexlantern(a, c, decor) {
    const { add, W = 1 } = c, iron = own(decor?.color, '#4a4a52') === '#6a4a2a' ? '#4a4a52' : own(decor?.color, '#4a4a52'), glow = '#ffd27a';
    const x = 0.17 * W, y = -0.1, z = (c.hipsZ ? c.hipsZ(x, -0.05, 1, 0.075) : 0.215 * W);
    // hook on the belt, three links of chain down to the ring
    add(taperedCurve([[x - 0.01, 0.035, z - 0.05], [x, 0.03, z - 0.01], [x, 0.0, z]], [0.007, 0.007, 0.006], 4, 5), 'hips', iron, { metal: true });
    for (let k = 0; k < 2; k++) add(tor(0.011, 0.004, 6), 'hips', lift(iron, 0.25), { position: [x, -0.012 - k * 0.018, z], rotation: [0, k % 2 ? Math.PI / 2 : 0, 0], metal: true });
    add(tor(0.016, 0.005, 8), 'hips', iron, { position: [x, y + 0.115, z], metal: true });
    // the hood, the light, the cage, the base
    add(new THREE.ConeGeometry(0.066, 0.06, 6), 'hips', iron, { position: [x, y + 0.075, z], metal: true });
    add(cyl(0.07, 0.07, 0.012, 6), 'hips', tone(iron, 0.75), { position: [x, y + 0.044, z], metal: true });
    add(cyl(0.044, 0.05, 0.085, 6), 'hips', glow, { position: [x, y, z] });
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2 + Math.PI / 6; add(taperedCurve([[x + Math.sin(t) * 0.05, y + 0.044, z + Math.cos(t) * 0.05], [x + Math.sin(t) * 0.056, y - 0.044, z + Math.cos(t) * 0.056]], [0.006, 0.006], 4, 1), 'hips', iron, { metal: true }); }
    add(cyl(0.06, 0.05, 0.02, 6), 'hips', iron, { position: [x, y - 0.052, z], metal: true });
    add(new THREE.ConeGeometry(0.014, 0.03, 4), 'hips', tone(iron, 0.75), { position: [x, y - 0.076, z], rotation: [Math.PI, 0, 0], metal: true });
    add(ico(), 'hips', '#ffffff', { position: [x, y - 0.005, z], scale: [0.016, 0.026, 0.016] });
  },
  /** A war girdle: a broad belt, a big round buckle, a row of studs, leather tabs hanging at the front and a side pouch. */
  g5_girdle(a, c, decor) {
    const { add, W = 1 } = c, hide = own(decor?.color, '#5a3a24') === '#6a4a2a' ? '#5a3a24' : own(decor?.color, '#5a3a24'), trim = decor?.color2 || BRASS;
    const rings = c.body?.hipsRings, grow = /long|knee|coat|trench|short|mail|plates|peplum/.test(c.topStyle?.hem || '') ? 0.05 : 0.02;
    const y0 = -0.01, y1 = 0.065, r0 = ringAt(rings, y0), r1 = ringAt(rings, y1);
    add(profile([[y0, r0[1] + grow, r0[2] + grow, r0[3]], [(y0 + y1) / 2, (r0[1] + r1[1]) / 2 + grow + 0.006, (r0[2] + r1[2]) / 2 + grow + 0.006, (r0[3] + r1[3]) / 2], [y1, r1[1] + grow, r1[2] + grow, r1[3]]], 16), 'hips', hide);
    for (const y of [y0 + 0.004, y1 - 0.004]) { const r = ringAt(rings, y); add(profile([[y - 0.005, r[1] + grow + 0.004, r[2] + grow + 0.004, r[3]], [y + 0.005, r[1] + grow + 0.004, r[2] + grow + 0.004, r[3]]], 16), 'hips', tone(hide, 0.65)); }
    const ym = (y0 + y1) / 2, rm = ringAt(rings, ym), front = (x, l = 0) => rm[3] + (rm[2] + grow + 0.008 + l) * Math.sqrt(Math.max(0, 1 - (x / (rm[1] + grow + 0.008 + l)) ** 2));
    // the buckle: a ring, a plate in it, and the tongue
    add(tor(0.05, 0.012, 14), 'hips', trim, { position: [0, ym, front(0, 0.008)], metal: true });
    add(cyl(0.04, 0.04, 0.008, 12), 'hips', tone(trim, 0.7), { position: [0, ym, front(0, 0.004)], rotation: [Math.PI / 2, 0, 0], metal: true });
    add(box(0.07, 0.012, 0.01), 'hips', lift(trim, 0.3), { position: [0.01, ym, front(0, 0.016)], metal: true });
    for (const s of [-1, 1]) for (const k of [1, 2]) { const x = s * (0.05 + k * 0.045) * W; add(sph(6, 4), 'hips', trim, { position: [x, ym, front(x, 0.002)], scale: [0.011, 0.011, 0.008], metal: true }); }
    // hanging tabs either side of the buckle, each tipped with a stud
    for (const [xk, len] of [[-0.085, 0.15], [-0.04, 0.19], [0.04, 0.19], [0.085, 0.15]]) {
      const x = xk * W, zf = front(x, 0.004);
      add(box(0.036, len, 0.01), 'hips', tone(hide, 0.85), { position: [x, y0 - len / 2 + 0.01, zf + 0.012], rotation: [-0.1, 0, 0] });
      add(new THREE.ConeGeometry(0.02, 0.03, 4), 'hips', trim, { position: [x, y0 - len + 0.002, zf + 0.022], rotation: [Math.PI, Math.PI / 4, 0], metal: true });
    }
    // a pouch on the left side
    const px = -(rm[1] + grow) * 0.82, pz = front(px, 0.03);
    add(box(0.08, 0.085, 0.05), 'hips', hide, { position: [px, y0 - 0.035, pz], rotation: [0, -0.7, 0] });
    add(box(0.086, 0.04, 0.056), 'hips', tone(hide, 0.7), { position: [px, y0 - 0.01, pz], rotation: [0.1, -0.7, 0] });
    add(sph(6, 4), 'hips', trim, { position: [px - 0.016, y0 - 0.03, pz + 0.022], scale: [0.009, 0.009, 0.007], metal: true });
  },
};

// ---------------------------------------------------------------- accessory (neck)
export const G5_ACCESSORY_BUILDERS = {
  /** A torc: a rigid twisted ring round the base of the neck, open at the throat, a ball on each end and a drop gem. */
  g5_torc(a, c, acc) {
    const { add, W = 1, T = 1 } = c, gold = own(acc?.color, '#d8b040') === '#333333' ? '#d8b040' : own(acc?.color, '#d8b040'), gemc = acc?.color2 || '#7fd4ff';
    const capelet = ['shoulder_cape', 'fur_mantle', 'feather_mantle'].includes(a.cape?.id);
    const st = c.topStyle || {};
    const out = (capelet ? 0.07 * W : 0) + (st.armor ? 0.036 : st.collar === 'high' || st.collar === 'hooded' || st.collar === 'fur' ? 0.03 : 0.006);
    const rings = c.body?.chestRings, yb = 0.262 * T, gap = 0.42, rxT = 0.118 * W + out * 0.5;
    // the ring LIES ON THE BODY: low on the collarbone at the front, up over the slope of the shoulders at
    // the sides (where the torso is narrower than the ring), and a little higher across the nape
    const at = t => {
      const sn = Math.sin(t), cz = Math.cos(t), x = sn * rxT;
      const y = yb + Math.pow(Math.abs(sn), 1.4) * 0.05 * T + (cz < 0 ? -cz * 0.012 * T : 0) + (capelet ? -0.02 : 0);
      const r = ringAt(rings, y), k = Math.sqrt(Math.max(0, 1 - (x / (r[1] + out + 0.014)) ** 2));
      return [x, y + 0.006, (r[3] || 0) + (cz >= 0 ? 1 : -1) * (r[2] + out + 0.012) * k * Math.min(1, Math.abs(cz) * 2.2 + 0.25)];
    };
    const n = 18, pts = Array.from({ length: n + 1 }, (_, i) => at(gap + (Math.PI * 2 - gap * 2) * i / n));
    add(taperedCurve(pts, [0.012, 0.014, 0.012], 5, 26), 'chest', gold, { metal: true });
    // the twist: darker beads along it read as the turns of the rope
    for (let i = 1; i < n; i++) add(sph(5, 3), 'chest', tone(gold, 0.68), { position: pts[i], scale: [0.0155, 0.007, 0.0155], rotation: [0.5, i, 0.5], metal: true });
    for (const p of [pts[0], pts[n]]) add(sph(8, 5), 'chest', lift(gold, 0.2), { position: p, scale: [0.022, 0.022, 0.022], metal: true });
    // the drop: a short chain between the two balls with a gem at its lowest point
    const a0 = pts[0], a1 = pts[n], mid = [0, a0[1] - 0.04, at(0)[2] + 0.004];
    add(taperedCurve([a1, mid, a0], [0.004, 0.004, 0.004], 3, 6), 'chest', gold, { metal: true });
    add(new THREE.OctahedronGeometry(1), 'chest', gemc, { position: [mid[0], mid[1] - 0.022, mid[2] + 0.004], scale: [0.016, 0.026, 0.012], metal: true });
  },
};

// ---------------------------------------------------------------- ring (on the hand, not the grip)
export const G5_RING_BUILDERS = {
  /** A signet: a band round the hand at the knuckles, a flat bezel on the back of the hand with a stone set in it. */
  g5_signet(a, c, ring, side = 'R') {
    const { add } = c, HK = c.rig?.hand || 1, s = side === 'L' ? -1 : 1, bone = 'hand' + (side === 'L' ? 'L' : 'R');
    const gold = ring?.color || '#d8b040', stone = ring?.color2 || '#b03030';
    // a band over the first finger of the closed fist (the fingers run across its front), bezel facing out
    const P = [s * 0.012 * HK, -0.058 * HK, 0.046 * HK];
    add(tor(1, 0.22, 12), bone, gold, { position: P, rotation: [0, Math.PI / 2, 0], scale: [0.024 * HK, 0.024 * HK, 0.03 * HK], metal: true });
    add(cyl(0.016 * HK, 0.019 * HK, 0.012 * HK, 8), bone, lift(gold, 0.15), { position: [P[0], P[1] - 0.004 * HK, P[2] + 0.026 * HK], rotation: [Math.PI / 2, 0, 0], metal: true });
    add(sph(6, 4), bone, stone, { position: [P[0], P[1] - 0.004 * HK, P[2] + 0.033 * HK], scale: [0.011 * HK, 0.011 * HK, 0.006 * HK], metal: true });
  },
};
