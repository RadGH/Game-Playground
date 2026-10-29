// Kestrel (fable) — hair. A CAP is the skull surface pushed out 4 mm above a hairline (a function of the angle
// round the head, so the forehead is bare, the sideburns come down and the nape is covered). Styles put flat-shaded
// SPIKE clumps on the cap (the mockup's hair is clumps, not strands), and the ponytail is a tube swept along a curve
// on two bones (`hairTail1` / `hairTail2`) that the actor sways. Everything is in HEAD space.
import * as THREE from 'three';
import { Piece, loft, spike, lerp, clamp, sstep, gauss, adist, shade, mix, TAU, alongDir, transform } from './geometry.js';
import { skullSpec } from './head.js';

const PI = Math.PI, HALF = PI / 2, FRONT = HALF, BACK = 3 * HALF;

export const HAIR_IDS = ['spiky', 'high_ponytail', 'bald', 'short', 'long'];
/** Any Chibi 2 hair id → the nearest style here (never throws). */
export function hairIdFor(id) {
  const s = String(id || 'short').toLowerCase();
  if (HAIR_IDS.includes(s)) return s;
  if (/bald|none|shaved/.test(s)) return 'bald';
  if (/pony|tail|bun|topknot/.test(s)) return 'high_ponytail';
  if (/long|braid|wave|curl|afro|flow/.test(s)) return 'long';
  if (/spik|messy|mohawk|wild|swept|quiff/.test(s)) return 'spiky';
  return 'short';
}

/** A seeded random (so a look always builds the same hair). */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * The cap: rows from the crown down to the hairline `phiMax(theta)`, pushed `lift` metres off the skull, with a final
 * row tucked back inside the skull so the edge is closed. `S.radial` is the skull.
 */
function cap(S, rows, cols, phiMax, lift, w, color, { thin = 0 } = {}) {
  const p = new Piece(); p.color = color; p.tag = 'cap';
  p.pos.push(0, S.cy + S.radial(0, 0)[1] + lift, S.cz); p.skin.push(w); p.col.push(null);
  for (let i = 1; i <= rows + 1; i++) {
    for (let j = 0; j < cols; j++) {
      const th = j / cols * TAU, pm = phiMax(th);
      const t = Math.min(1, i / rows), phi = t * pm;
      const r = S.radial(th, phi);
      const dx = Math.sin(phi) * Math.cos(th), dy = Math.cos(phi), dz = Math.sin(phi) * Math.sin(th);
      // the lift fades toward the hairline so the edge lies on the skin, and the extra row dives inside
      const k = i > rows ? -0.004 : lift * (1 - 0.6 * t * t) + thin * Math.sin(phi) * 0;
      p.pos.push(dx * (r[0] + k), S.cy + dy * (r[1] + k), S.cz + dz * (r[2] + k)); p.skin.push(w);
      p.col.push(i > rows ? shade(color, 0.7) : shade(color, 0.95 + 0.2 * (1 - t)));
    }
  }
  const at = (i, j) => i === 0 ? 0 : 1 + (i - 1) * cols + (j % cols);
  for (let i = 0; i <= rows; i++) for (let j = 0; j < cols; j++) {
    if (i === 0) p.idx.push(0, at(1, j + 1), at(1, j));
    else p.idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
  return p;
}

/** A hairline: `front` / `side` / `back` are phi (0 top .. PI bottom) at the forehead, over the ears, at the nape. */
function hairline({ front, side, back, sideburn = 0, part = 0 }) {
  return (th) => {
    const f = gauss(adist(th, FRONT), 0.55), b = gauss(adist(th, BACK), 0.7);
    const s = Math.max(gauss(adist(th, 0), 0.42), gauss(adist(th, PI), 0.42));
    let phi = side + (front - side) * f + (back - side) * b * (1 - f);
    phi += sideburn * (gauss(adist(th, 0.25), 0.22) + gauss(adist(th, PI - 0.25), 0.22));
    phi -= part * gauss(adist(th, FRONT + 0.3), 0.2);
    return phi;
  };
}

/** Put a spike on the cap at (theta, phi), pointing `dir` (head-space), with the base sunk into the cap. */
function placeSpike(S, th, phi, dir, len, base, w, color, r, { lift = 0.004, sides = 4, taper = 0.12, flat = true, bend = null, flatness = 0.72, curve = 0 } = {}) {
  const rad = S.radial(th, phi);
  const dx = Math.sin(phi) * Math.cos(th), dy = Math.cos(phi), dz = Math.sin(phi) * Math.sin(th);
  const pos = [dx * (rad[0] + lift - 0.006), S.cy + dy * (rad[1] + lift - 0.006), S.cz + dz * (rad[2] + lift - 0.006)];
  const roll = r() * TAU, frame = alongDir(pos, dir, roll);
  if (curve) {
    // bend the tip toward the skull centre by `curve` metres, so a clump follows the head instead of leaving it
    const q = new THREE.Quaternion().setFromRotationMatrix(frame).invert();
    const inward = new THREE.Vector3(S.cz * 0 - pos[0], S.cy - pos[1], S.cz - pos[2]).normalize().applyQuaternion(q);
    bend = [inward.x * curve + (bend ? bend[0] : 0), inward.z * curve + (bend ? bend[1] : 0)];
  }
  const sp = spike(len, base, base * flatness, w, { sides, steps: 3, taper, bend: bend || [(r() - 0.5) * len * 0.3, (r() - 0.5) * len * 0.3], flat });
  for (let i = 0; i < sp.count; i++) { const t = clamp(sp.pos[i * 3 + 1] / len, 0, 1); sp.col[i] = shade(color, 0.72 + 0.5 * t); }
  transform(sp, frame);
  return sp;
}
/** The part of `v` that lies along the surface whose normal is `o`. */
const tangent = (o, v) => { const d = o[0] * v[0] + o[1] * v[1] + o[2] * v[2]; return norm([v[0] - o[0] * d, v[1] - o[1] * d, v[2] - o[2] * d]); };
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const addv = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Build the hair for a look: pieces in head space. */
export function buildHair(rig, look, detail) {
  const d = rig.d, S = skullSpec(d), id = hairIdFor(look.hair?.id);
  const color = look.hair?.color || '#3a2417', w = [['head', 1]];
  const r = rng(hashStr(id + color + d.form));
  const pieces = [];
  if (id === 'bald') return pieces;
  const cols = detail ? 28 : 12, rows = detail ? 9 : 4;
  const outDir = (th, phi) => norm([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)]);
  if (id === 'spiky') {
    const line = hairline({ front: 0.37 * PI, side: 0.5 * PI, back: 0.66 * PI, sideburn: 0.07 * PI });
    pieces.push(cap(S, rows, cols, line, 0.012, w, color));
    // clumps lying along the skull like leaves: swept back and to the character's left (+x) over the crown,
    // forward and down over the forehead; each lifts off the skull only a little
    const n = detail ? 44 : 18;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const phi = Math.sqrt(t) * 0.5 * PI, th = i * 2.399963 + r() * 0.4;               // golden-angle spiral from the crown
      if (phi > line(th) - 0.03 * PI) continue;
      const o = outDir(th, phi);
      const frontness = gauss(adist(th, FRONT), 0.75) * sstep(phi, 0.2 * PI, 0.36 * PI);
      const sweep = frontness > 0.3 ? [0.45, -0.7, 0.3] : [0.8, 0.25, -0.55];
      const tang = tangent(o, sweep);
      const dir = norm(addv(tang, o, 0.3 + 0.2 * (1 - frontness)));
      const len = lerp(0.04, 0.062, r()) * (1 - 0.1 * frontness), base = lerp(0.02, 0.03, r());
      pieces.push(placeSpike(S, th, phi, dir, len, base, w, color, r, { sides: 4, lift: 0.012, taper: 0.3, flatness: 0.42, bend: [0, 0], curve: 0.012 }));
    }
    // the fringe: a few clumps crossing the forehead from the part, swept to the character's left
    for (let i = 0; i < (detail ? 5 : 3); i++) {
      const t = i / 4, th = FRONT + lerp(-0.45, 0.4, t), phi = 0.34 * PI + 0.015 * PI * r(), o = outDir(th, phi);
      pieces.push(placeSpike(S, th, phi, norm(addv(tangent(o, [0.75, -0.55, 0.1]), o, 0.12)), lerp(0.045, 0.058, r()), 0.024, w, color, r, { sides: 4, lift: 0.012, taper: 0.3, flatness: 0.35, bend: [0, 0], curve: 0.015 }));
    }
    // short tufts at the nape and over the ears so the cap edge is not a clean line
    for (let i = 0; i < (detail ? 12 : 4); i++) {
      const th = r() * TAU, phi = line(th) - 0.05 * PI;
      if (gauss(adist(th, FRONT), 0.6) > 0.6) continue;
      const o = outDir(th, phi);
      pieces.push(placeSpike(S, th, phi, norm(addv(tangent(o, [0.2, -1, -0.3]), o, 0.25)), 0.035, 0.018, w, color, r, { sides: 4, lift: 0.012, taper: 0.3, flatness: 0.45 }));
    }
  } else if (id === 'high_ponytail') {
    const line = hairline({ front: 0.31 * PI, side: 0.5 * PI, back: 0.58 * PI, sideburn: 0.04 * PI });
    pieces.push(cap(S, rows, cols, line, 0.007, w, color));
    // the hair is combed up and back into the tie: a few long swept clumps over the cap
    const tie = [0, S.cy + S.ry * 0.78, S.cz - S.rz * 0.55];
    for (let i = 0; i < (detail ? 16 : 4); i++) {
      const th = r() * TAU, phi = lerp(0.15, 0.4, r()) * PI;
      if (phi > line(th) - 0.06 * PI) continue;
      const o = outDir(th, phi), rad = S.radial(th, phi);
      const at = [Math.sin(phi) * Math.cos(th) * rad[0], S.cy + Math.cos(phi) * rad[1], S.cz + Math.sin(phi) * Math.sin(th) * rad[2]];
      const toTie = norm([tie[0] - at[0], tie[1] - at[1], tie[2] - at[2]]);
      pieces.push(placeSpike(S, th, phi, norm(addv(toTie, o, 0.35)), lerp(0.05, 0.08, r()), 0.014, w, color, r, { sides: 3, taper: 0.3, lift: 0.006 }));
    }
    // bangs: swept across the forehead to the character's left, and two side locks down past the ears
    // bangs: a few long locks from a part on the character's left sweeping across to the right, tips above the
    // right brow, and two short ones on the left
    for (let i = 0; i < (detail ? 5 : 3); i++) {
      const t = i / 4, th = FRONT + 0.45 - 0.25 * t, phi = (0.3 + 0.02 * t) * PI;
      const o = outDir(th, phi);
      const dir = norm(addv(tangent(o, [-1, -0.55 - 0.25 * t, 0.1]), o, 0.1));
      pieces.push(placeSpike(S, th, phi, dir, lerp(0.07, 0.088, 1 - t * 0.6), 0.026, w, color, r, { sides: 4, taper: 0.18, lift: 0.006, flatness: 0.3, bend: [0, 0], curve: 0.028 }));
    }
    for (let i = 0; i < 2; i++) {
      const th = FRONT - 0.35 - 0.25 * i, phi = 0.31 * PI, o = outDir(th, phi);
      pieces.push(placeSpike(S, th, phi, norm(addv(tangent(o, [0.5, -0.8, 0.1]), o, 0.12)), 0.05, 0.02, w, color, r, { sides: 4, taper: 0.25, lift: 0.009, flatness: 0.35 }));
    }
    for (const sg of [-1, 1]) {
      const th = FRONT - sg * 0.95, phi = 0.4 * PI, o = outDir(th, phi);
      pieces.push(placeSpike(S, th, phi, norm(addv(tangent(o, [sg * 0.05, -1, 0.15]), o, 0.06)), 0.095, 0.024, w, color, r, { sides: 4, taper: 0.2, lift: 0.004, flatness: 0.3, bend: [0, 0], curve: 0.015 }));
      if (detail) pieces.push(placeSpike(S, th - sg * 0.3, phi + 0.06 * PI, norm(addv(tangent(o, [sg * 0.15, -1, 0.05]), o, 0.06)), 0.07, 0.018, w, color, r, { sides: 4, taper: 0.2, lift: 0.004, flatness: 0.35 }));
    }
    // the tie and the tail
    const t1 = rig.byName.hairTail1.position, t2 = rig.byName.hairTail2.position;
    const tailW = (t) => t < 0.35 ? [['hairTail1', 1]] : t < 0.75 ? [['hairTail1', 1 - sstep(t, 0.35, 0.75)], ['hairTail2', sstep(t, 0.35, 0.75)]] : [['hairTail2', 1]];
    const pts = [[t1.x, t1.y + 0.01, t1.z + 0.02], [t1.x, t1.y + 0.025, t1.z - 0.05], [0, t1.y - 0.02, t1.z - 0.115], [0, t1.y + t2.y + 0.0, t1.z + t2.z - 0.1], [0, t1.y + t2.y - 0.14, t1.z + t2.z - 0.07], [0.0, t1.y + t2.y - 0.3, t1.z + t2.z - 0.01]];
    const radii = [0.017, 0.034, 0.046, 0.044, 0.034, 0.008];
    const tail = tube(pts, radii, detail ? 10 : 6, detail ? 14 : 6, tailW, color, (a, t) => 1 + 0.25 * Math.sin(a * 3 + t * 9) * sstep(t, 0.1, 1) + 0.12 * Math.sin(a * 5 - t * 6) * sstep(t, 0.3, 1));
    pieces.push(tail);
    pieces.push(tube([[t1.x, t1.y + 0.008, t1.z + 0.025], [t1.x, t1.y + 0.015, t1.z - 0.01]], [0.021, 0.021], 8, 2, () => [['hairTail1', 1]], shade(color, 0.6)));
    // loose strands on the tail
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    for (let i = 0; i < (detail ? 9 : 0); i++) {
      const t = lerp(0.25, 0.85, r()), p = curve.getPointAt(t), tg = curve.getTangentAt(t), a = r() * TAU;
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).projectOnPlane(tg).normalize();
      const rad = radii[Math.round(t * (radii.length - 1))] * 0.9;
      const sp = spike(lerp(0.05, 0.1, r()), 0.012, 0.009, tailW(t), { sides: 3, steps: 3, taper: 0.1, bend: [(r() - 0.5) * 0.03, (r() - 0.5) * 0.03] });
      for (let k = 0; k < sp.count; k++) sp.col[k] = shade(color, 0.8 + 0.4 * clamp(sp.pos[k * 3 + 1] / 0.08, 0, 1));
      const dir = tg.clone().multiplyScalar(0.8).add(side.clone().multiplyScalar(0.5)).normalize();
      transform(sp, alongDir([p.x + side.x * rad, p.y + side.y * rad, p.z + side.z * rad], [dir.x, dir.y, dir.z]));
      pieces.push(sp);
    }
  } else if (id === 'short') {
    const line = hairline({ front: 0.3 * PI, side: 0.47 * PI, back: 0.62 * PI, sideburn: 0.06 * PI });
    pieces.push(cap(S, rows, cols, line, 0.012, w, color));
    for (let i = 0; i < (detail ? 18 : 6); i++) {
      const t = (i + 0.5) / (detail ? 18 : 6), phi = Math.sqrt(t) * 0.3 * PI, th = i * 2.399963;
      pieces.push(placeSpike(S, th, phi, norm(addv(outDir(th, phi), [0, 0.4, -0.5])), 0.028, 0.016, w, color, r, { sides: 3, taper: 0.3, lift: 0.012 }));
    }
  } else if (id === 'long') {
    const line = hairline({ front: 0.3 * PI, side: 0.5 * PI, back: 0.6 * PI, sideburn: 0.05 * PI, part: 0.02 * PI });
    pieces.push(cap(S, rows, cols, line, 0.01, w, color));
    // a mass down the back and two falls in front of the shoulders
    const backW = (t) => t < 0.3 ? [['head', 1]] : [['head', 1 - sstep(t, 0.3, 0.9) * 0.6], ['hairTail2', sstep(t, 0.3, 0.9) * 0.6]];
    pieces.push(tube([[0, S.cy + S.ry * 0.5, S.cz - S.rz * 0.85], [0, S.cy - S.ry * 0.3, S.cz - S.rz * 1.05], [0, S.cy - S.ry * 1.6, S.cz - S.rz * 0.9], [0, S.cy - S.ry * 2.6, S.cz - S.rz * 0.6]], [0.075, 0.085, 0.075, 0.03], detail ? 12 : 8, detail ? 9 : 5, backW, color, (a, t) => 1 + 0.12 * Math.sin(a * 4 + t * 5)));
    for (const sg of [-1, 1]) {
      pieces.push(tube([[sg * S.rx * 0.85, S.cy + 0.02, S.cz + 0.01], [sg * S.rx * 1.05, S.cy - 0.1, S.cz + 0.02], [sg * S.rx * 1.0, S.cy - 0.26, S.cz + 0.03]], [0.03, 0.03, 0.012], 8, 5, () => [['head', 1]], color));
    }
    for (let i = 0; i < (detail ? 6 : 3); i++) {
      const t = i / 5, th = FRONT + lerp(-0.5, 0.5, t), phi = 0.3 * PI;
      pieces.push(placeSpike(S, th, phi, norm([0.3 - 0.6 * t, -0.8, 0.4]), 0.08, 0.02, w, color, r, { sides: 4, taper: 0.2, lift: 0.01 }));
    }
  }
  return pieces;
}

/** A tube along a Catmull-Rom curve through `pts` with per-point radii; `shapeAt(a, t)` wobbles the radius. */
export function tube(pts, radii, S, steps, wAt, color, shapeAt = null) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const rings = [];
  const up = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, c = curve.getPointAt(t), tg = curve.getTangentAt(t);
    const f = t * (radii.length - 1), r = lerp(radii[Math.floor(f)], radii[Math.min(radii.length - 1, Math.ceil(f))], f % 1);
    let u = X.clone().projectOnPlane(tg); if (u.lengthSq() < 1e-6) u = up.clone().projectOnPlane(tg); u.normalize();
    const v = new THREE.Vector3().crossVectors(tg, u).normalize();
    rings.push({ c: [c.x, c.y, c.z], u: [u.x, u.y, u.z], v: [v.x, v.y, v.z], ru: r, rv: r, n: 2, w: wAt(t), hidden: false, f: shapeAt ? (a) => shapeAt(a, t) : null, phase: 0 });
  }
  const p = loft(rings, S, { capStart: true, capEnd: true, color, tag: 'tube' });
  for (let i = 0; i < p.count; i++) { const ri = Math.min(steps, Math.floor(i / S)); p.col[i] = shade(color, 0.8 + 0.3 * (1 - ri / steps)); }
  return p;
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
