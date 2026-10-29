// Kestrel kit — every hat (batch 3): one entry per id, written with hat-kit.js in head space (metres for a 0.24 m head,
// y up from the chin, crown 0.2415, +z forward, θ = 0 at the nose). Realistic proportions: a helm encloses a real head
// with room for the hair under it, a hood drapes onto the shoulders with the neck's and chest's own skin weights, a
// wizard hat's band sits on the skull. NOT a scaled Chibi part — the Chibi builders (avatar-3d/js/chibi2-hats.js,
// chibi2.js buildChibiHat, chibi2-gear5-armour.js) were only read for what each hat IS (silhouette, parts, colours).
//
//   HATS[id] = { fit(θ) | null, build(K, h) → { brow?: { p, n } } }
//     fit(θ): the lowest edge of what covers the skull on bearing θ (head-space y) — the hair is cut to it (hair-kit.js
//             re-roots locks just under it) and the scalp above it is not drawn. null = the hat sits ON the hair (bands).
//     h: { id, info, c (main colour, linear), c2, trim, dark, q (quality 0-3), hair (band hats: hairR(θ, y) = how far
//          the hair stands out there, head space) }
//     brow: where the emblem goes (head space point + outward normal), when the default (the front of the fit line) is
//           not on the hat's surface.
import { lerp, smooth, gauss, clamp, add, sub, mul, norm, cross, adiff, cmul, cmix } from './kmath.js';
import { rimAt } from './hat-catalog.js';
import { CLEAR, CROWN, tone, lift } from './hat-kit.js';

const PI = Math.PI, TAU = PI * 2;
const rim3 = (front, side, back) => th => rimAt({ front, side, back }, th);
/** bump of width w (radians) round bearing c, mirrored to both sides */
const sides = (th, c, w) => smooth(c - w, c - w * 0.4, Math.abs(th)) * (1 - smooth(c + w * 0.4, c + w, Math.abs(th)));
const rowIx = (u, n) => Math.round(u * n);
/** A brim stays flat over the hair next to the head and droops beyond (s = share of the way out). */
const droop = s => Math.pow(Math.max(0, s - 0.32) / 0.68, 2);

// ------------------------------------------------------------------------------------------------ a hat's frame
/**
 * The band of a brimmed hat: a ring on the skull at rim(θ), `clear` off it, and an axis that leans with the ring (a hat
 * sits lower at the back). at(θ, h, k, out) = a point h up the axis from the band, k times the band's radius out, plus
 * `out` further out along the band's own radial.
 */
function hatFrame(K, rim, clear = CLEAR + 0.003) {
  const n = 48, ring = [];
  for (let i = 0; i < n; i++) { const th = i / n * TAU - PI; ring.push(K.atY(th, rim(th), clear)); }
  const c = ring.reduce((s, p) => add(s, p), [0, 0, 0]).map(v => v / n);
  const yF = rim(0), yB = rim(PI), zF = K.atY(0, yF, clear)[2], zB = K.atY(PI, yB, clear)[2];
  const tilt = Math.atan2(yF - yB, zF - zB);                  // > 0: the front is higher
  const up = [0, Math.cos(tilt), -Math.sin(tilt)];
  const base = th => K.atY(th, rim(th), clear);
  const alongOf = th => { const d = sub(base(th), c); return d[0] * up[0] + d[1] * up[1] + d[2] * up[2]; };
  const radial = th => { const d = sub(base(th), c); return sub(d, mul(up, alongOf(th))); };
  // the band keeps its own shape (a notch over the ears, a lower back): its height along the axis is kept at the band and
  // fades out up the crown, so the top still closes in one point
  const at = (th, h, k = 1, out = 0, dz = 0) => { const r = radial(th), rl = Math.hypot(...r) || 1, al = alongOf(th) * (1 - smooth(0.0, 0.035, h)); return add(add(c, mul(up, al + h)), add(mul(r, k + out / rl), [0, 0, dz])); };
  return { c, up, base, radial, at, tilt };
}

/** A crown (the part of a brimmed hat above the band): rows [h, k, dz] in the hat's frame; closed at the top if k → 0. */
function crownSurface(K, F, rows, { segs = 30, top = true, color, ...look } = {}) {
  // a lathe in the hat's frame: rows are indices into `rows`
  const spec = K.lathe({ rows: rows.map(r => [r[0], r[1], r[2] || 0, 0]), fitY: 0.18, segs, capEnd: top && rows[rows.length - 1][1] === 0, color, ...look });
  if (!spec) return null;
  spec.at = (u, th) => { const [h, k, dz = 0] = rows[Math.round(u)]; const hp = K.keepOff(F.at(th, h, k, 0, dz)); return { p: K.W(hp), w: [['head', 1]], hp, u, th }; };
  spec.out = (p, u) => { const [h, k, dz = 0] = rows[Math.round(u)]; return sub(p, K.W(add(F.at(0, h, 0, 0, dz), [0, 0, 0]))); };
  return spec;
}
/** A brim off a hat's band: width(θ), lift(s, θ) (+ up the hat's axis), thick. */
function brimOn(K, F, { width, lift: up = null, thick = 0.0045, segs = 40, color, under = null, from = null, to = null, ...look }) {
  const spec = K.brim({ y: 0.18, width: 0.05, segs, color, under, ...look });
  if (!spec) return null;
  const S7 = [[0, 1], [0.5, 1], [1, 1], [1.04, 0], [1, -1], [0.5, -1], [0, -1]];
  spec.at = (u, th0) => {
    const th = from != null ? lerp(from, to, th0) : th0;
    const [s0, side] = S7[Math.round(u)], s = Math.min(1, s0), w = typeof width === 'function' ? width(th) : width;
    const hp = K.keepOff(add(F.at(th, 0, 1, w * s0), mul(F.up, (up ? up(s, th) : 0) + side * thick * 0.5)));
    return { p: K.W(hp), w: [['head', 1]], hp, u, th };
  };
  if (from != null) { spec.wrap = false; spec.theta = (j, n) => j / n; }
  return spec;
}

// ------------------------------------------------------------------------------------------------ fitted pieces
const MAIL = (K, h, rows) => ({
  bulge: (v) => (rowIx(v, rows) % 2 ? 0.0016 : 0),
  color: (v) => (rowIx(v, rows) % 2 ? lift(h.c, 0.22) : tone(h.c, 0.62)),
});
/** a hood / coif face opening: high over the brow, down the cheeks at |θ| = a0..a1, low behind */
const opening = (yTop, a0, a1, yLow) => th => lerp(yTop - 0.012 * (1 - Math.cos(th)) * 0, yLow, smooth(a0, a1, Math.abs(th)));

function gem(K, p, n, r, color, glow = 0.25) {
  const up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], X = norm(cross(up, n)), Y = cross(n, X);
  K.blob({ c: add(p, mul(n, r * 0.5)), r: [r, r * 1.25, r * 0.7], ax: [X, Y, n], rows: 2, segs: 4, color, rough: 0.2, glow, name: 'hatGem', minor: true });
}
function stud(K, p, n, r, color) {
  K.blob({ c: add(p, mul(n, r * 0.3)), r: [r, r, r * 0.8], rows: 3, segs: 5, color, metal: true, name: 'hatStud', minor: true });
}
/** A feather: a flat tube along a curve with a pale shaft colour down its middle. */
function feather(K, pts, w, color, { shaft = null, name = 'hatFeather' } = {}) {
  const path = t => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i; return add(mul(pts[i], 1 - u), mul(pts[i + 1], u)); };
  const sc = shaft || lift(color, 0.45);
  K.tube({ path, r: t => [w * Math.sin(PI * Math.min(1, t * 1.15 + 0.08)) + 0.0006, 0.0011], rows: 6, sides: 4, up: t => norm(cross(sub(path(Math.min(1, t + 0.05)), path(Math.max(0, t - 0.05))), [1, 0, 0])), color: (t, a) => (Math.abs(Math.cos(a)) < 0.35 ? sc : cmul(color, 0.9 + 0.2 * Math.sin(t * 18))), rough: 0.7, name });
}
/** A horn: a tapered tube from root along a curve. */
function horn(K, pts, r0, color) {
  const path = t => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i; return add(mul(pts[i], 1 - u), mul(pts[i + 1], u)); };
  K.tube({ path, r: t => r0 * Math.pow(1 - t, 0.8) + 0.0005, rows: 7, sides: 7, color: (t) => cmix(color, lift(color, 0.25), smooth(0.6, 1, t)), rough: 0.45, capEnd: true, name: 'hatHorn' });
}

// ------------------------------------------------------------------------------------------------ closed helms
/** A barrel helm round the WHOLE head (superellipse rows, its own shape — not the face's), down to the neck. */
function barrel(K, rows, { segs = 30, color, bottom = -0.035, ...look }) {
  // rows: [y, halfWidth, front, back, power]
  const R = rows;
  const at = (u, th) => {
    const [y, hw, zf, zb, pw = 2.4] = R[Math.round(u)];
    const s = Math.sin(th), c = Math.cos(th), b = c >= 0 ? zf : zb;
    const v = Math.pow(Math.abs(s) / hw, pw) + Math.pow(Math.abs(c) / Math.max(b, 1e-4), pw), r = v > 0 ? Math.pow(v, -1 / pw) : 0;
    return { hp: [s * r, y, c * r] };
  };
  const spec = K.shell({ rim: () => bottom, rows: 4, lip: 0, color, ...look });
  if (!spec) return null;
  spec.us = R.map((_, i) => i); spec.capEnd = R[R.length - 1][1] < 1e-3; spec.segs = K.nseg(segs, 12);
  spec.at = (u, th) => { const r = at(u, th); const hp = K.keepOff(r.hp); return { p: K.W(hp), w: [['head', 1]], hp, u, th }; };
  return { spec, at };
}
/** Barrel rows that clear the head with its nose and jaw (head space; the male face is the larger). */
const BARREL = [
  [-0.04, 0.094, 0.104, 0.098, 2.3], [-0.01, 0.108, 0.13, 0.112, 2.4], [0.05, 0.113, 0.142, 0.122, 2.5], [0.12, 0.116, 0.141, 0.128, 2.6],
  [0.18, 0.115, 0.13, 0.13, 2.5], [0.225, 0.103, 0.112, 0.118, 2.3], [0.26, 0.078, 0.082, 0.088, 2.1], [0.282, 0.042, 0.044, 0.048, 2], [0.29, 0, 0, 0, 2],
];
function barrelPoint(th, y) {
  // the barrel's surface point at (θ, y): linear between the two rows round y
  let i = 0; while (i < BARREL.length - 2 && BARREL[i + 1][0] < y) i++;
  const a = BARREL[i], b = BARREL[i + 1], t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
  const hw = lerp(a[1], b[1], t), zf = lerp(a[2], b[2], t), zb = lerp(a[3], b[3], t), pw = lerp(a[4], b[4], t);
  const s = Math.sin(th), c = Math.cos(th), bb = c >= 0 ? zf : zb;
  const v = Math.pow(Math.abs(s) / Math.max(hw, 1e-4), pw) + Math.pow(Math.abs(c) / Math.max(bb, 1e-4), pw), r = v > 0 ? Math.pow(v, -1 / pw) : 0;
  return [s * r, y, c * r];
}
/** A band painted round a barrel (eye slit, a trim) — a thin plate just proud of it. */
function barrelBand(K, { y0, y1, t0, t1, out = 0.0015, color, segs = 18, glow = 0, metal = true, name = 'hatSlit', inset = 0 }) {
  const spec = K.tube({ path: () => [0, 0, 0], rows: 2, sides: 3, color });
  if (!spec) return;
  const us = [0, 1, 2, 3];
  Object.assign(spec, {
    name, us, segs: K.nseg(segs, 6), wrap: false, t0, t1, theta: undefined, capStart: false, capEnd: false,
    rough: metal ? 0.34 : 0.6, glow: metal ? -0.55 : glow,
    out: (p) => sub(p, K.W([0, (y0 + y1) / 2, 0])),
    at: (u, th) => {
      const y = u <= 1 ? lerp(y0, y1, u) : lerp(y1, y0, u - 2);
      const b = barrelPoint(th, y), n = norm([b[0], 0, b[2]]), o = u === 0 || u === 3 ? out * 0.2 : out - inset;
      const hp = K.keepOff(add(b, mul(n, o)));
      return { p: K.W(hp), w: [['head', 1]], hp, u, th };
    },
  });
}

// ---- edges shared by a hat's pieces and its fit line (the hair is cut exactly where the cover ends)
const WAR = { base: rim3(0.176, 0.16, 0.11) };
// one lower edge from the guard's front (high at the eye's corner) to the jaw, along the jaw to the curtain, down the nape
WAR.guard = th => { const a = Math.abs(th); return a >= 0.74 && a <= 1.62 ? lerp(0.13, 0.062, smooth(0.74, 1.02, a)) : 1; };
/** the hair is cut to the guards from the temples back (it would otherwise hang across a guard's front edge) */
WAR.hair = th => { const a = Math.abs(th); return a < 0.45 ? 1 : a < 0.74 ? lerp(0.15, 0.13, smooth(0.45, 0.74, a)) : WAR.guard(th); };
WAR.curtain = th => (Math.abs(th) >= 1.55 ? lerp(0.062, 0.035, smooth(1.6, 2.0, Math.abs(th))) : 1);
const KNIGHT = { base: rim3(0.176, 0.148, 0.1) };
KNIGHT.tail = th => (Math.abs(th) >= 1.4 ? lerp(0.1, 0.03, smooth(1.4, 2.3, Math.abs(th))) : 1);
// a hood's / coif's shell covers the head down to a GENTLE rim (a steep one makes long facets that cut into the temple);
// the sides of the face opening are the drape's front edge, standing at bearing OPEN from the rim down to the jaw
const COIF_RIM = th => 0.196 - 0.166 * smooth(0.5, 1.7, Math.abs(th)), HOOD_RIM = th => 0.215 - 0.185 * smooth(0.55, 1.7, Math.abs(th));
const COIF_OPEN = 0.9, HOOD_OPEN = 0.95;
/** the drape's top: the shell's rim behind the opening, level with the opening's top corner in front of it */
const frontTop = (rim, open) => th => (Math.abs(th) < open ? rim(open) : rim(th)) + 0.004;
/** the hair is kept in the face opening (under the shell's rim there) and cut everywhere the hood / coif covers */
const hoodFit = (rim, open, hem) => th => lerp(rim(th), hem, smooth(open - 0.02, open + 0.08, Math.abs(th)));
const MAILCAP = rim3(0.176, 0.165, 0.112), WOLF = rim3(0.19, 0.12, 0.06);

// ================================================================================================ the hats
export const HATS = {
  // ------------------------------------------------------------------ soft caps
  cap: {
    fit: rim3(0.178, 0.168, 0.112),
    build(K, h) {
      const fit = h.fit;
      K.shell({ rim: fit, clear: CLEAR, bulge: v => 0.004 * Math.sin(PI * v) + 0.002 * v, rows: 7, segs: 30, color: (v, th) => cmul(h.c, 1 - 0.18 * Math.max(...[0, 1, 2, 3, 4, 5].map(k => gauss(adiff(th, k * PI / 3), 0.035))) * smooth(0.15, 0.4, v)), shade: 0.35, name: 'hatCap' });
      K.blob({ c: [0, CROWN + CLEAR + 0.006, -0.002], r: [0.008, 0.005, 0.008], rows: 3, segs: 6, color: tone(h.c, 0.8), name: 'hatButton', minor: true });
      // the short peak at the front, stiff and a little dipped
      const rin = th => K.ringR(th, fit(th), CLEAR + 0.0035);
      const pw = th => 0.052 * Math.pow(Math.max(0, Math.cos(th)), 1.6) * (1 - smooth(0.75, 1.05, Math.abs(th)));
      K.brim({ y: th => fit(th) + 0.001, inner: rin, width: pw, lift: (s, th) => -0.012 * s * s * pw(th) / 0.052, thick: 0.004, segs: 16, from: -1.05, to: 1.05, color: tone(h.c, 0.85), name: 'hatPeak' });
      return { brow: { y: 0.195 } };
    },
  },
  leather_cap: {
    fit: th => Math.min(rim3(0.178, 0.168, 0.112)(th), lerp(0.2, 0.092, sides(th, PI / 2, 0.75))),
    build(K, h) {
      const base = rim3(0.178, 0.168, 0.112);
      K.shell({ rim: base, clear: CLEAR + 0.001, bulge: v => 0.003 * Math.sin(PI * v), rows: 7, segs: 30, color: (v, th) => cmul(h.c, 1 - 0.3 * (gauss(th, 0.025) + gauss(adiff(th, PI / 2), 0.025) + gauss(adiff(th, -PI / 2), 0.025) + gauss(adiff(th, PI), 0.025)) * smooth(0.2, 0.5, v)), rough: 0.5, name: 'hatCap' });
      // ear flaps, laced at the bottom
      for (const sg of [-1, 1]) K.plate({ t0: sg > 0 ? PI / 2 - 0.62 : -PI / 2 - 0.62, t1: sg > 0 ? PI / 2 + 0.62 : -PI / 2 + 0.62, top: th => base(th) + 0.012, bot: th => lerp(base(th), 0.092, sides(th, PI / 2, 0.75)), clear: (s) => CLEAR + 0.001 + 0.016 * smooth(0, 0.6, s), thick: 0.004, rows: 4, segs: 7, color: (u) => (u > 5 ? tone(h.c, 0.6) : h.c), rough: 0.5, name: 'hatFlap' });
      for (const sg of [-1, 1]) if (!h.hairHangs(sg * PI / 2)) K.tube({ path: t => add(K.atY(sg * PI / 2, 0.096, CLEAR + 0.019), [0, -0.035 * t, 0.004 * t]), r: 0.0018, rows: 3, sides: 3, color: tone(h.c, 0.5), name: 'hatTie', minor: true });
      return { brow: { y: 0.192 } };
    },
  },
  bandana: {
    fit: rim3(0.18, 0.165, 0.11),
    build(K, h) {
      const fit = h.fit, dot = lift(h.c, 0.7);
      K.shell({ rim: fit, clear: CLEAR - 0.0012, bulge: v => 0.0015 * Math.sin(PI * v), rows: 7, segs: 30, ease: 0.8, color: (v, th) => { const a = (th / TAU) * 22, b = v * 9; const d = Math.hypot(a - Math.round(a), (b - Math.round(b)) * 0.8); return d < 0.17 ? dot : h.c; }, rough: 0.7, name: 'hatCloth' });
      const knot = K.atY(PI, fit(PI) + 0.012, CLEAR + 0.008);
      K.blob({ c: knot, r: [0.014, 0.011, 0.01], rows: 4, segs: 7, color: tone(h.c, 0.85), name: 'hatKnot' });
      // the tails hang down the back of the head — unless hair does (a ponytail, long hair): then the knot alone
      if (!h.hairHangs(PI)) for (const sg of [-1, 1]) K.tube({ path: t => add(knot, [sg * (0.006 + 0.012 * t), -0.004 - 0.05 * t, -0.006 - 0.012 * t * t]), r: t => [0.011 * (1 - 0.7 * t), 0.0016], rows: 5, sides: 4, up: [0, 0, 1], color: h.c, rough: 0.7, name: 'hatTail' });
      return { brow: { y: 0.195 } };
    },
  },
  feather_cap: {
    fit: rim3(0.182, 0.17, 0.122),
    build(K, h) {
      const fit = h.fit;
      // a soft felt crown that leans back, a turned band, a feather tucked in on the +x side
      K.shell({ rim: fit, clear: CLEAR + 0.003, bulge: (v, th) => 0.011 * Math.sin(PI * Math.min(1, v * 1.2)) * (0.7 + 0.5 * Math.max(0, -Math.cos(th))) + 0.006 * v * Math.max(0, -Math.cos(th)), rows: 8, segs: 30, color: h.c, rough: 0.75, name: 'hatFelt' });
      K.loop({ y: th => fit(th) + 0.007, off: CLEAR + 0.0065, r: [0.0045, 0.0065], segs: 32, sides: 4, color: tone(h.c, 0.78), rough: 0.7, name: 'hatBand' });
      K.loop({ y: th => fit(th) + 0.0135, off: CLEAR + 0.008, r: [0.0018, 0.0018], segs: 30, sides: 3, color: h.trim, metal: true, name: 'hatTrim', minor: true });
      const r0 = K.atY(1.05, fit(1.05) + 0.012, CLEAR + 0.01);
      feather(K, [r0, add(r0, [0.012, 0.04, -0.02]), add(r0, [0.016, 0.075, -0.055]), add(r0, [0.012, 0.095, -0.095])], 0.012, h.c2);
      return { brow: { y: 0.198 } };
    },
  },
  goggles_up: {
    fit: th => Math.min(rim3(0.183, 0.16, 0.098)(th), lerp(0.2, 0.088, sides(th, PI / 2, 0.8))),
    build(K, h) {
      const base = rim3(0.183, 0.16, 0.098), brass = cmix(h.c, [0.85, 0.66, 0.3], 0.7), glass = [0.42, 0.62, 0.68];
      K.shell({ rim: base, clear: CLEAR + 0.0015, bulge: v => 0.002 * Math.sin(PI * v), rows: 7, segs: 30, color: (v, th) => cmul(h.c, 1 - 0.35 * gauss(th, 0.02) * smooth(0.1, 0.3, v)), rough: 0.5, name: 'hatCap' });
      for (const sg of [-1, 1]) K.plate({ t0: sg * PI / 2 - 0.7, t1: sg * PI / 2 + 0.7, top: th => base(th) + 0.012, bot: th => lerp(base(th), 0.088, sides(th, PI / 2, 0.8)), clear: s => CLEAR + 0.0015 + 0.017 * smooth(0, 0.55, s), thick: 0.005, rows: 4, segs: 8, color: h.c, rough: 0.5, name: 'hatFlap' });
      K.loop({ y: th => base(th) + 0.003, off: CLEAR + 0.0035, r: [0.003, 0.004], segs: 30, color: tone(h.c, 0.7), rough: 0.5, name: 'hatRoll' });
      // the strap round the back, the goggles resting on the front of the cap
      K.loop({ y: th => lerp(0.212, 0.175, smooth(0.6, 2.6, Math.abs(th))), off: CLEAR + 0.0045, r: [0.0018, 0.0042], segs: 30, color: [0.06, 0.045, 0.035], rough: 0.6, name: 'hatStrap' });
      for (const sg of [-1, 1]) {
        const th = sg * 0.36, y = 0.212, c = K.atY(th, y, CLEAR + 0.009), n = K.normalY(th, y), up0 = [0, 1, 0], X = norm(cross(up0, n)), Y = cross(n, X);
        K.tube({ path: t => add(c, add(mul(X, Math.cos(t * TAU) * 0.0175), mul(Y, Math.sin(t * TAU) * 0.0155))), r: [0.0038, 0.0042], rows: 12, sides: 4, up: n, closed: true, color: brass, metal: true, name: 'hatGoggle' });
        K.blob({ c: add(c, mul(n, 0.002)), r: [0.0155, 0.0135, 0.003], ax: [X, Y, n], rows: 3, segs: 10, color: glass, rough: 0.08, glow: 0.12, name: 'hatLens' });
      }
      return { brow: { y: 0.23 } };
    },
  },
  bolt_crown: {
    fit: rim3(0.19, 0.165, 0.105),
    build(K, h) {
      const fit = h.fit, F = hatFrame(K, fit, CLEAR);
      // a tall flat-top of dark hair: a squared block standing up off the skull, a straight fringe, a stitched brow
      crownSurface(K, F, [[0, 1.0], [0.03, 1.04], [0.07, 1.06], [0.1, 1.05], [0.104, 0.9], [0.106, 0.5], [0.107, 0]], { segs: 32, color: (u, th) => cmul(h.c, 0.85 + 0.15 * Math.abs(Math.sin(th * 9))), rough: 0.8, name: 'hatFlatTop' });
      K.plate({ t0: -0.8, t1: 0.8, top: 0.205, bot: 0.183, clear: CLEAR + 0.004, thick: 0.006, rows: 2, segs: 10, color: tone(h.c, 0.75), rough: 0.8, name: 'hatFringe' });
      const m = h.c2;
      // a stitched scar across the brow (not under a fringe: the hair would hang through it)
      if (!h.hairHangs(0)) {
        K.tube({ path: t => K.atY(lerp(-0.25, 0.3, t), 0.168, 0.0012), r: [0.0012, 0.0012], rows: 5, sides: 3, color: [0.2, 0.08, 0.08], name: 'hatScar', minor: true });
        for (let k = 0; k < 5; k++) { const th = -0.2 + k * 0.11; K.tube({ path: t => K.atY(th, lerp(0.161, 0.175, t), 0.0014), r: 0.0009, rows: 1, sides: 3, color: [0.18, 0.08, 0.08], name: 'hatStitch', minor: true }); }
      }
      // the bolts, on the NECK (its own skin weights: they turn with it)
      for (const sg of [-1, 1]) {
        const yW = K.W([0, -0.035, 0])[1], az = K.axisZ(yW), sk = K.skinAround(yW, sg * PI / 2, az), w = sk.w;
        const p0 = K.toHead([sg * (sk.r - 0.004), yW, az]);
        const bolt = K.tube({ path: t => add(p0, [sg * 0.026 * t, 0, 0]), r: 0.0065, rows: 2, sides: 7, up: [0, 0, 1], color: m, metal: true, name: 'hatBolt' });
        const nut = K.tube({ path: t => add(p0, [sg * (0.02 + 0.008 * t), 0, 0]), r: 0.0105, rows: 1, sides: 6, up: [0, 0, 1], color: tone(m, 0.8), metal: true, name: 'hatBolt' });
        for (const s of [bolt, nut]) if (s) { const at = s.at; s.at = (u, th) => ({ ...at(u, th), w }); }
      }
      return { brow: { p: F.at(0, 0.05, 1.06, 0.002), n: [0, 0, 1] } };
    },
  },
  toadstool_cap: {
    fit: rim3(0.19, 0.175, 0.13),
    build(K, h) {
      const fit = h.fit, F = hatFrame(K, fit, CLEAR);
      const spots = [[0, 0.07], [0.9, 0.055], [-0.95, 0.06], [2.2, 0.06], [-2.1, 0.055], [1.6, 0.035], [-1.6, 0.03], [3.0, 0.05], [0.45, 0.025], [-0.4, 0.03]];
      const spot = (th, hh) => spots.some(([a, b]) => Math.hypot(adiff(th, a) * 0.11, hh - b) < 0.0135);
      const rows = [[-0.002, 1.0], [0.012, 1.7], [0.018, 1.95], [0.032, 1.95], [0.055, 1.72], [0.075, 1.32], [0.088, 0.82], [0.094, 0.35], [0.096, 0]];
      crownSurface(K, F, rows, { segs: 36, color: (u, th) => (u >= 2 && spot(th, rows[Math.round(u)][0]) ? h.c2 : u < 1.5 ? lift(h.c2, 0.1) : h.c), rough: 0.55, name: 'hatToadstool' });
      // the gills underneath: a pale frill from the band out to the rim
      brimOn(K, F, { width: th => Math.hypot(...F.radial(th)) * 0.9, lift: s => 0.012 * s, thick: 0.003, segs: 36, color: [0.86, 0.8, 0.7], under: [0.62, 0.55, 0.46], name: 'hatGills' });
      return { brow: { p: F.at(0, 0.05, 1.72, 0.002), n: norm([0, 0.6, 1]) } };
    },
  },
  g5_cloth_wrap: {
    fit: rim3(0.176, 0.165, 0.105),
    build(K, h) {
      const fit = h.fit;
      // a tall wound dome, three crossing turns, a jewel where they cross, a loose end down the back
      K.shell({ rim: fit, clear: CLEAR + 0.004, bulge: (v) => 0.016 * Math.sin(PI * Math.min(1, v * 1.15)) + 0.022 * v * v, rows: 8, segs: 30, color: (v, th) => cmul(h.c, 0.9 + 0.12 * Math.sin(v * 22 + th * 2)), rough: 0.75, name: 'hatWrap' });
      const turns = [[0.006, 0.0, 0.85], [0.022, 0.06, 0.6], [0.04, -0.07, 0.4]];
      turns.forEach(([dy, tlt, k], i) => K.loop({ y: th => fit(th) + dy + tlt * Math.sin(th) * 0.05 + 0.02 * (1 - k) * Math.max(0, -Math.cos(th)), off: CLEAR + 0.0075 + 0.013 * (1 - k), r: [0.0065, 0.0075], segs: 30, sides: 4, color: i % 2 ? lift(h.c, 0.16) : tone(h.c, 0.86), rough: 0.75, name: 'hatTurn' }));
      const c = K.atY(0, fit(0) + 0.022, CLEAR + 0.017), n = K.normalY(0, fit(0) + 0.022);
      K.blob({ c, r: [0.011, 0.011, 0.003], ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], rows: 3, segs: 8, color: h.c2, metal: true, name: 'hatPlate' });
      gem(K, add(c, mul(n, 0.003)), n, 0.006, [0.6, 0.06, 0.08], 0.3);
      feather(K, [add(c, [0, 0.008, 0.002]), add(c, [0.004, 0.03, -0.004]), add(c, [0.01, 0.05, -0.016])], 0.006, lift(h.c2, 0.3));
      const t0 = K.atY(-2.6, fit(-2.6) + 0.006, CLEAR + 0.012), nb = norm([Math.sin(-2.6), 0, Math.cos(-2.6)]);
      // the loose end stands off the hair below the wrap; over hair that hangs there (long, a tail) it is tucked in
      if (!h.hairHangs(-2.6)) K.tube({ path: t => add(add(t0, mul(nb, 0.03 * Math.sqrt(t))), [-0.012 * t, -0.006 - 0.1 * t, -0.012 * t]), r: t => [0.018 * (1 - 0.5 * t), 0.003], rows: 6, sides: 4, up: [0, 0, 1], color: tone(h.c, 0.9), rough: 0.75, name: 'hatTail' });
      return { brow: { p: add(c, mul(n, 0.004)), n, skip: true } };
    },
  },

  // ------------------------------------------------------------------ brimmed hats
  wide_brim: {
    fit: rim3(0.183, 0.172, 0.142),
    build(K, h) {
      const F = hatFrame(K, h.fit);
      crownSurface(K, F, [[-0.003, 1.0], [0.03, 1.02], [0.06, 0.98], [0.08, 0.86], [0.088, 0.55], [0.09, 0]], { segs: 32, color: (u, th) => cmul(h.c, 1 - 0.25 * gauss(th, 0.18) * (u >= 3 ? 1 : 0)), rough: 0.75, name: 'hatCrown' });
      crownSurface(K, F, [[0.002, 1.012], [0.016, 1.018]], { segs: 32, top: false, color: tone(h.c, 0.55), rough: 0.6, name: 'hatBand' });
      brimOn(K, F, { width: th => 0.072 + 0.01 * Math.cos(th), lift: (s, th) => -0.02 * droop(s) * (0.5 + 0.5 * Math.abs(Math.cos(th))) + 0.012 * droop(s) * Math.sin(th) ** 2, segs: 40, color: h.c, rough: 0.75, name: 'hatBrim' });
      return { brow: { p: F.at(0, 0.03, 1.02, 0.001), n: [0, 0.1, 1] } };
    },
  },
  straw: {
    fit: rim3(0.183, 0.172, 0.142),
    build(K, h) {
      const F = hatFrame(K, h.fit);
      const weave = (u, th, s) => cmul(h.c, 0.86 + 0.16 * Math.abs(Math.sin(th * 40 + (s || u) * 30)));
      crownSurface(K, F, [[-0.003, 1.0], [0.04, 0.99], [0.075, 0.95], [0.088, 0.7], [0.091, 0]], { segs: 32, color: (u, th) => weave(u, th), rough: 0.85, name: 'hatCrown' });
      crownSurface(K, F, [[0.002, 1.012], [0.017, 1.016]], { segs: 32, top: false, color: h.c2, rough: 0.7, name: 'hatBand' });
      brimOn(K, F, { width: 0.105, lift: (s, th) => -0.026 * droop(s) * (0.6 + 0.4 * Math.abs(Math.cos(th))), segs: 44, color: (u, th) => weave(u, th, u * 0.7), rough: 0.85, name: 'hatBrim' });
      return { brow: { p: F.at(0, 0.03, 1.0, 0.002), n: [0, 0.1, 1] } };
    },
  },
  top_hat: {
    fit: rim3(0.188, 0.177, 0.13),
    build(K, h) {
      const F = hatFrame(K, h.fit);
      crownSurface(K, F, [[-0.003, 1.0], [0.02, 1.0], [0.08, 1.04], [0.15, 1.08], [0.158, 1.07], [0.16, 0.7], [0.1605, 0]], { segs: 32, color: h.c, rough: 0.4, name: 'hatCrown' });
      crownSurface(K, F, [[0.002, 1.006], [0.032, 1.009]], { segs: 32, top: false, color: h.c2, rough: 0.5, name: 'hatBand' });
      brimOn(K, F, { width: th => 0.034 + 0.006 * Math.abs(Math.cos(th)), lift: (s, th) => 0.018 * s * s * Math.sin(th) ** 2 - 0.004 * s * Math.cos(th) ** 2, segs: 36, color: h.c, rough: 0.4, name: 'hatBrim' });
      return { brow: { p: F.at(0, 0.017, 1.009, 0.002), n: [0, 0, 1] } };
    },
  },
  tricorn: {
    fit: rim3(0.183, 0.172, 0.142),
    build(K, h) {
      const F = hatFrame(K, h.fit);
      crownSurface(K, F, [[-0.003, 1.0], [0.04, 0.99], [0.075, 0.94], [0.089, 0.7], [0.092, 0]], { segs: 30, color: h.c, rough: 0.7, name: 'hatCrown' });
      // the brim turned up into three walls that meet in points at the front and the two back corners
      const corner = th => Math.max(gauss(adiff(th, 0), 0.32), gauss(adiff(th, 2.1), 0.32), gauss(adiff(th, -2.1), 0.32));
      brimOn(K, F, { width: th => 0.05 + 0.03 * corner(th), lift: (s, th) => (0.012 * s + 0.05 * s * s) * (1 - 0.82 * corner(th)), segs: 48, color: (u, th) => (u >= 2 && u <= 4 ? h.c2 : h.c), rough: 0.7, name: 'hatBrim' });
      // the cockade on the left front wall
      const p = F.at(-0.85, 0.035, 1.0, 0.03), n = norm(F.radial(-0.85));
      K.blob({ c: p, r: [0.012, 0.012, 0.003], ax: [norm(cross([0, 1, 0], n)), [0, 1, 0], n], rows: 3, segs: 10, color: [0.86, 0.84, 0.78], rough: 0.7, name: 'hatCockade' });
      K.blob({ c: add(p, mul(n, 0.003)), r: [0.005, 0.005, 0.002], ax: [norm(cross([0, 1, 0], n)), [0, 1, 0], n], rows: 2, segs: 6, color: [0.55, 0.06, 0.08], name: 'hatCockade', minor: true });
      return { brow: { p: F.at(0, 0.05, 1.0, 0.045), n: [0, 0.2, 1] } };
    },
  },
  wizard: {
    fit: rim3(0.183, 0.172, 0.142),
    build(K, h) {
      const F = hatFrame(K, h.fit), under = tone(h.c, 0.72);
      crownSurface(K, F, [[-0.003, 1.0], [0.03, 0.9], [0.07, 0.7, -0.004], [0.12, 0.47, -0.012], [0.17, 0.27, -0.03], [0.21, 0.12, -0.06], [0.232, 0.04, -0.09], [0.238, 0, -0.105]], { segs: 30, color: (u, th) => cmul(h.c, 0.95 + 0.08 * Math.sin(th * 3 + u)), rough: 0.7, name: 'hatCone' });
      crownSurface(K, F, [[0.0, 1.01], [0.014, 0.97]], { segs: 30, top: false, color: tone(h.c, 0.6), rough: 0.6, name: 'hatBand' });
      brimOn(K, F, { width: th => 0.085 + 0.008 * Math.cos(th), lift: (s, th) => -0.014 * droop(s) + 0.004 * Math.sin(th * 3) * droop(s), segs: 40, color: h.c, under, rough: 0.7, name: 'hatBrim' });
      return { brow: { p: F.at(0, 0.03, 0.9, 0.002), n: norm([0, 0.3, 1]) } };
    },
  },
  witch_hat: {
    fit: rim3(0.183, 0.172, 0.142),
    build(K, h) {
      const F = hatFrame(K, h.fit);
      // a tall crooked cone that bends back, then hooks its tip
      crownSurface(K, F, [[-0.003, 1.0], [0.035, 0.86], [0.08, 0.66, -0.006], [0.13, 0.46, -0.02], [0.18, 0.3, -0.05], [0.215, 0.18, -0.09], [0.235, 0.09, -0.13], [0.24, 0.035, -0.165], [0.236, 0, -0.19]], { segs: 30, color: h.c, rough: 0.75, name: 'hatCone' });
      crownSurface(K, F, [[0.002, 1.006], [0.022, 0.95]], { segs: 30, top: false, color: h.c2, rough: 0.6, name: 'hatBand' });
      brimOn(K, F, { width: th => 0.105 + 0.012 * Math.cos(th), lift: (s, th) => -0.018 * droop(s) + 0.008 * droop(s) * Math.sin(th * 4) + 0.01 * droop(s) * Math.max(0, Math.cos(th)), segs: 44, color: h.c, rough: 0.75, name: 'hatBrim' });
      const b = F.at(0, 0.012, 1.006, 0.002);
      K.blob({ c: b, r: [0.012, 0.009, 0.0025], rows: 2, segs: 4, color: [0.85, 0.66, 0.2], metal: true, name: 'hatBuckle' });
      K.blob({ c: add(b, [0, 0, 0.0018]), r: [0.007, 0.0045, 0.002], rows: 2, segs: 4, color: h.c2, name: 'hatBuckle', minor: true });
      return { brow: null };
    },
  },
  candy_corn_hat: {
    fit: rim3(0.183, 0.172, 0.142),
    build(K, h) {
      const F = hatFrame(K, h.fit), white = [0.95, 0.9, 0.78];
      const rows = [[-0.003, 1.0], [0.02, 0.98], [0.045, 0.9], [0.08, 0.72, -0.004], [0.12, 0.52, -0.01], [0.16, 0.32, -0.018], [0.2, 0.14, -0.028], [0.222, 0.03, -0.034], [0.226, 0, -0.035]];
      crownSurface(K, F, rows, { segs: 26, color: (u) => { const hh = rows[Math.round(u)][0]; return hh < 0.085 ? h.c2 : hh < 0.165 ? h.c : white; }, rough: 0.45, name: 'hatCone' });
      K.loop({ y: th => h.fit(th) + 0.004, off: CLEAR + 0.005, r: [0.008, 0.008], segs: 30, sides: 6, color: h.c2, rough: 0.45, name: 'hatRoll' });
      return { brow: null };
    },
  },
  g5_leather_slouch: {
    fit: rim3(0.183, 0.172, 0.142),
    build(K, h) {
      const F = hatFrame(K, h.fit);
      // a soft dented crown (pinched at the front), a wide brim pinned up flat against the crown on the +x side
      const dent = th => 0.12 * gauss(th, 0.5);
      const crownSpec = crownSurface(K, F, [[-0.003, 1.0], [0.04, 1.0], [0.074, 0.95], [0.09, 0.78], [0.095, 0.45], [0.094, 0]], { segs: 30, color: h.c, rough: 0.7, name: 'hatCrown' });
      if (crownSpec) { const at = crownSpec.at; crownSpec.at = (u, th) => { const r = at(u, th); if (u >= 2) { const k = dent(th) * smooth(1, 4, u); r.hp = add(r.hp, mul(norm(F.radial(th)), -k * 0.06)); r.p = K.W(r.hp); } return r; }; }
      crownSurface(K, F, [[0.002, 1.012], [0.02, 1.014]], { segs: 30, top: false, color: tone(h.c, 0.55), rough: 0.6, name: 'hatBand' });
      const pin = th => Math.pow(Math.max(0, Math.sin(th)), 2);
      brimOn(K, F, { width: th => 0.09 - 0.035 * pin(th), lift: (s, th) => lerp(-0.02 * droop(s) * (0.4 + Math.abs(Math.cos(th))), 0.09 * s, pin(th)), segs: 40, color: h.c, rough: 0.7, name: 'hatBrim' });
      for (let k = 0; k < 5; k++) { const th = -0.6 + k * 0.3, p = F.at(th, 0.022, 1.014, 0.001); K.tube({ path: t => add(p, mul(F.up, 0.012 * t)), r: t => 0.0035 * (1 - t) + 0.0004, rows: 2, sides: 4, color: h.c2, name: 'hatTooth', minor: true }); }
      const pp = F.at(PI / 2, 0.05, 1.0, 0.012);
      gem(K, pp, [1, 0, 0], 0.006, [0.85, 0.66, 0.2], 0);
      feather(K, [add(pp, [0.002, -0.004, 0.006]), add(pp, [0.012, 0.04, -0.02]), add(pp, [0.008, 0.07, -0.06]), add(pp, [0, 0.085, -0.1])], 0.011, [0.6, 0.16, 0.1]);
      return { brow: { p: F.at(0, 0.011, 1.014, 0.002), n: [0, 0, 1] } };
    },
  },

  // ------------------------------------------------------------------ open-faced helms
  helmet: {
    fit: rim3(0.176, 0.163, 0.1),
    build(K, h) { helmBase(K, h, h.fit); return { brow: { y: 0.19, off: 0.011 } }; },
  },
  horned_helm: {
    fit: rim3(0.176, 0.163, 0.1),
    build(K, h) {
      helmBase(K, h, h.fit);
      for (const sg of [-1, 1]) {
        const r0 = K.atY(sg * 1.45, 0.2, CLEAR + 0.006);
        horn(K, [r0, add(r0, [sg * 0.03, 0.012, 0.004]), add(r0, [sg * 0.058, 0.04, 0.0]), add(r0, [sg * 0.066, 0.08, -0.012]), add(r0, [sg * 0.058, 0.11, -0.028])], 0.014, [0.82, 0.76, 0.6]);
      }
      return { brow: { y: 0.19, off: 0.011 } };
    },
  },
  rune_helm: {
    fit: rim3(0.175, 0.158, 0.098),
    build(K, h) {
      const fit = h.fit, st = h.c, glow = h.c2;
      K.shell({ rim: fit, clear: CLEAR + 0.0045, bulge: v => 0.002 * Math.sin(PI * v), rows: 7, segs: 30, color: st, metal: true, lip: 0.006, name: 'hatHelm' });
      K.loop({ y: th => fit(th) + 0.006, off: CLEAR + 0.01, r: [0.008, 0.009], segs: 32, sides: 6, color: tone(st, 0.75), metal: true, name: 'hatRoll' });
      K.loop({ y: th => fit(th) + 0.028, off: CLEAR + 0.0058, r: [0.0016, 0.006], segs: 32, sides: 4, color: tone(st, 0.5), metal: true, name: 'hatRuneBand' });
      // the runes: glowing marks set in the band
      for (let k = 0; k < 9; k++) {
        const th = -1.9 + k * 0.475, y = fit(th) + 0.028, c = K.atY(th, y, CLEAR + 0.0085);
        K.tube({ path: t => add(c, [Math.cos(th) * 0.004 * (t - 0.5) * (k % 2 ? 1 : -1), 0.009 * (t - 0.5), -Math.sin(th) * 0.004 * (t - 0.5)]), r: 0.0011, rows: 1, sides: 3, color: glow, glow: 0.9, name: 'hatRune', minor: true });
        K.tube({ path: t => add(c, [Math.cos(th) * 0.006 * (t - 0.5), -0.001, -Math.sin(th) * 0.006 * (t - 0.5)]), r: 0.001, rows: 1, sides: 3, color: glow, glow: 0.9, name: 'hatRune', minor: true });
      }
      K.tube({ path: t => K.onRay(0, lerp(0.5, PI - 0.5, t), CLEAR + 0.0075), r: [0.004, 0.005], rows: 8, sides: 4, color: tone(st, 0.6), metal: true, name: 'hatRidge' });
      for (const sg of [-1, 1]) stud(K, K.atY(sg * 1.25, fit(sg * 1.25) + 0.006, CLEAR + 0.017), [Math.sin(sg * 1.25), 0, Math.cos(sg * 1.25)], 0.0045, h.trim);
      return { brow: { y: 0.21, off: 0.014 } };
    },
  },
  war_helm: {
    fit: th => Math.min(WAR.base(th), WAR.hair(th), WAR.curtain(th)),
    avoid: [{ t0: -0.24, t1: 0.24, y0: 0.1, y1: 0.19 }],     // the nasal runs down the middle of the fringe
    build(K, h) {
      const base = WAR.base, st = h.c, dk = tone(st, 0.62);
      K.shell({ rim: base, clear: CLEAR + 0.0035, bulge: v => 0.002 * Math.sin(PI * v), rows: 7, segs: 30, color: st, metal: true, name: 'hatHelm' });
      K.loop({ y: th => base(th) + 0.004, off: CLEAR + 0.0065, r: [0.003, 0.006], segs: 32, color: dk, metal: true, name: 'hatBrow' });
      K.tube({ path: t => K.onRay(0, lerp(0.6, PI - 0.7, t), CLEAR + 0.006), r: [0.003, 0.004], rows: 8, sides: 4, color: dk, metal: true, name: 'hatRidge' });
      // the nasal down over the bridge of the nose
      K.plate({ t0: -0.075, t1: 0.075, top: 0.18, bot: 0.112, clear: s => CLEAR + 0.004 + 0.004 * s, thick: 0.003, rows: 3, segs: 2, color: st, metal: true, name: 'hatNasal' });
      // cheek guards hung from the brim down the cheeks, a mail curtain at the back of the neck
      for (const sg of [-1, 1]) {
        K.plate({ t0: sg > 0 ? 0.74 : -1.62, t1: sg > 0 ? 1.62 : -0.74, top: th => base(th) + 0.01, bot: WAR.guard, clear: s => CLEAR + 0.0045 + 0.0035 * s, thick: 0.004, rows: 4, segs: 8, color: (u) => (u === 5 ? dk : st), metal: true, name: 'hatCheek' });
        for (const [y, th] of [[0.15, sg * 1.3], [0.09, sg * 1.18]]) stud(K, K.atY(th, y, CLEAR + 0.009 + (y < 0.1 ? 0.003 : 0)), [Math.sin(th), 0, Math.cos(th)], 0.003, h.trim);
      }
      const rows = 6;
      K.plate({ t0: 1.55, t1: TAU - 1.55, top: th => base(th) + 0.01, bot: WAR.curtain, clear: s => CLEAR + 0.004 + 0.008 * s, thick: 0.004, rows, segs: 12, color: (u, th) => (Math.round(u) % 2 ? lift(h.dark, 0.25) : tone(h.dark, 0.7)), metal: true, name: 'hatCurtain' });
      return { brow: { y: 0.19, off: 0.012 } };
    },
  },
  plate_helm: {
    fit: th => Math.min(KNIGHT.base(th), KNIGHT.tail(th)),
    build(K, h) {
      const base = KNIGHT.base, st = h.c, dk = tone(st, 0.6);
      K.shell({ rim: base, clear: CLEAR + 0.004, bulge: (v, th) => 0.004 * Math.sin(PI * v) + 0.006 * v * v * Math.max(0, -Math.cos(th)), rows: 8, segs: 30, color: st, metal: true, name: 'hatHelm' });
      // the sallet's tail flaring out over the nape
      K.plate({ t0: 1.4, t1: TAU - 1.4, top: th => base(th) + 0.012, bot: KNIGHT.tail, clear: s => CLEAR + 0.004 + 0.022 * s * s, thick: 0.004, rows: 4, segs: 12, color: st, metal: true, name: 'hatTail' });
      // the visor, pushed up: a curved plate standing proud of the brow, pierced with a dark slit
      K.plate({ t0: -1.05, t1: 1.05, top: 0.236, bot: 0.188, clear: s => 0.018 + 0.004 * s, thick: 0.004, rows: 3, segs: 12, color: (u) => (u === 2 ? [0.03, 0.03, 0.035] : st), metal: true, name: 'hatVisor' });
      for (const sg of [-1, 1]) stud(K, K.atY(sg * 1.35, 0.2, CLEAR + 0.008), [Math.sin(sg * 1.35), 0, Math.cos(sg * 1.35)], 0.006, h.trim);
      const top = K.onRay(0, PI / 2 - 0.02, CLEAR + 0.008);
      K.tube({ path: t => add(top, [0, 0.014 * t, 0]), r: 0.005, rows: 1, sides: 6, color: h.trim, metal: true, name: 'hatPlumeHolder' });
      for (let k = 0; k < 4; k++) feather(K, [add(top, [0, 0.012, 0]), add(top, [(k - 1.5) * 0.006, 0.05, -0.03]), add(top, [(k - 1.5) * 0.009, 0.045, -0.085]), add(top, [(k - 1.5) * 0.007, 0.01, -0.12])], 0.012, k % 2 ? h.c2 : lift(h.c2, 0.15), { shaft: tone(h.c2, 0.7) });
      return { brow: { y: 0.183, off: 0.012 } };
    },
  },
  g5_mail_cap: {
    fit: th => lerp(MAILCAP(th), -0.17, smooth(0.95, 1.2, Math.abs(th))),
    build(K, h) {
      const base = MAILCAP, st = h.c, mail = h.c2;
      // a segmented conical cap, four ribs to a finial, a riveted brow band
      const cone = (v) => 0.03 * v * v;
      K.shell({ rim: base, clear: CLEAR + 0.0035, bulge: cone, rows: 7, segs: 28, color: st, metal: true, name: 'hatHelm' });
      K.loop({ y: th => base(th) + 0.006, off: CLEAR + 0.0058, r: [0.0025, 0.0065], segs: 32, color: tone(st, 0.62), metal: true, name: 'hatBrow' });
      for (let k = 0; k < 8; k++) { const th = k / 8 * TAU + 0.39; stud(K, K.atY(th, base(th) + 0.006, CLEAR + 0.0085), [Math.sin(th), 0, Math.cos(th)], 0.0025, lift(st, 0.35)); }
      for (let k = 0; k < 4; k++) { const th = k / 4 * TAU; K.tube({ path: t => { const e = lerp(K.eAt(th, base(th) + 0.012), PI / 2 - 0.05, t); return K.onRay(th, e, CLEAR + 0.0042 + cone((e - K.eAt(th, base(th))) / (PI / 2 - K.eAt(th, base(th))))); }, r: [0.003, 0.002], rows: 6, sides: 4, color: tone(st, 0.7), metal: true, name: 'hatRib' }); }
      K.blob({ c: K.onRay(0, PI / 2, CLEAR + 0.034), r: [0.006, 0.006, 0.006], rows: 3, segs: 6, color: lift(st, 0.3), metal: true, name: 'hatFinial' });
      // the aventail: mail hanging from the band round the sides and back to the shoulders, open over the face
      const R = 9;
      K.drape({ top: th => base(th) + 0.006, hem: th => -0.17 - 0.03 * Math.cos(th) ** 2, gap: (s, th) => CLEAR + 0.005 + 0.012 * s + (rowIx(s, R) % 2 ? 0.0015 : 0), from: s => lerp(1.0, 0.55, s), to: s => lerp(1.0, 0.55, s), rows: R, segs: 26, color: (u) => (rowIx(u, R) % 2 ? lift(mail, 0.2) : tone(mail, 0.6)), metal: true, name: 'hatAventail' });
      return { brow: { y: 0.19, off: 0.011 } };
    },
  },
  wolf_helm: {
    fit: th => lerp(WOLF(th), -0.34, smooth(1.82, 1.92, Math.abs(th))),
    build(K, h) {
      const base = WOLF, fur = h.c, belly = lift(fur, 0.35), dk = tone(fur, 0.55);
      const furC = (v, th) => cmul(fur, 0.86 + 0.18 * Math.abs(Math.sin(th * 11 + v * 7)));
      K.shell({ rim: base, clear: CLEAR + 0.006, bulge: v => 0.006 * Math.sin(PI * v), rows: 8, segs: 30, color: furC, rough: 0.9, name: 'hatPelt' });
      // the wolf's head over the brow: a muzzle, a nose, amber eyes, two upright ears
      const m0 = K.atY(0, 0.212, CLEAR + 0.012);
      // the wolf's skull over the brow, its muzzle reaching forward over the wearer's forehead, then the nose
      K.blob({ c: add(m0, [0, 0.012, 0.006]), r: [0.05, 0.022, 0.04], rows: 5, segs: 12, color: furC(0.5, 0), rough: 0.9, name: 'hatMuzzle' });
      K.blob({ c: add(m0, [0, 0.008, 0.045]), r: [0.022, 0.016, 0.042], ax: [[1, 0, 0], norm([0, 1, -0.15]), norm([0, 0.15, 1])], rows: 5, segs: 10, color: furC(0.6, 0), rough: 0.9, name: 'hatMuzzle' });
      K.blob({ c: add(m0, [0, -0.004, 0.058]), r: [0.017, 0.007, 0.03], rows: 4, segs: 8, color: belly, rough: 0.9, name: 'hatMuzzle' });
      K.blob({ c: add(m0, [0, 0.012, 0.086]), r: [0.009, 0.007, 0.006], rows: 3, segs: 6, color: [0.05, 0.04, 0.04], rough: 0.3, name: 'hatNose', minor: true });
      for (const sg of [-1, 1]) {
        K.blob({ c: add(m0, [sg * 0.028, 0.026, 0.03]), r: [0.007, 0.0042, 0.004], ax: [norm([1, 0, sg * -0.5]), [0, 1, 0], norm([sg * 0.5, 0, 1])], rows: 2, segs: 6, color: [0.95, 0.65, 0.18], glow: 0.6, name: 'hatEye', minor: true });
        const e0 = K.onRay(sg * 0.62, 1.12, CLEAR + 0.008);
        K.tube({ path: t => add(e0, [sg * 0.008 * t, 0.042 * t, -0.006 * t]), r: t => [0.016 * (1 - t) + 0.001, 0.005 * (1 - t) + 0.001], rows: 4, sides: 4, up: [0, 0, 1], color: (t, a) => (Math.sin(a) > 0.3 ? dk : fur), rough: 0.9, name: 'hatEar' });
      }
      // the pelt down the back, and its forelegs knotted over the shoulders
      K.drape({ top: th => base(th) + 0.01, hem: th => -0.33 - 0.12 * gauss(adiff(th, PI), 0.5), gap: s => CLEAR + 0.007 + 0.006 * s, from: 1.9, to: 1.9, rows: 7, segs: 16, color: (u, th) => furC(u, th), rough: 0.9, name: 'hatPelt' });
      for (const sg of [-1, 1]) {
        // the pelt's forelegs: thick, lying on the collarbone and knotted at the breastbone, each ending in a paw
        const pts = [-0.11, -0.16, -0.2, -0.235].map((y, i) => { const yW = K.W([0, y, 0])[1], th = sg * lerp(1.65, 0.32, i / 3), az = K.axisZ(yW), sk = K.skinAround(yW, th, az), rr = sk.r + 0.024; return { q: K.toHead([Math.sin(th) * rr, yW, az + Math.cos(th) * rr]), w: sk.w }; });
        const along = t => { const f = t * 3, i = Math.min(2, Math.floor(f)), u = f - i; return add(mul(pts[i].q, 1 - u), mul(pts[i + 1].q, u)); };
        const legW = (u) => pts[Math.min(3, Math.round(u * 3))].w;
        const leg = K.tube({ path: along, r: t => [0.022 * (1 - 0.25 * t), 0.014], rows: 6, sides: 6, up: [0, 0, 1], color: (t, a) => (Math.sin(a) > 0.2 ? furC(t, a) : tone(fur, 0.75)), rough: 0.9, name: 'hatLeg' });
        const paw = K.blob({ c: pts[3].q, r: [0.017, 0.013, 0.015], rows: 4, segs: 7, color: dk, rough: 0.9, name: 'hatLeg' });
        for (const s of [leg, paw]) if (s) { const at = s.at; s.at = (u, th) => ({ ...at(u, th), w: s === leg ? legW(u) : pts[3].w }); }
      }
      return { brow: { p: add(m0, [0, 0.022, 0.012]), n: norm([0, 0.7, 0.7]) } };
    },
  },

  // ------------------------------------------------------------------ closed helms and whole-head pieces
  great_helm: {
    fit: () => -0.05,
    build(K, h) {
      const st = h.c, gold = h.c2;
      const B = barrel(K, BARREL, { color: (u, th) => cmul(st, 0.92 + 0.08 * Math.cos(th)), metal: true, name: 'hatHelm' });
      void B;
      barrelBand(K, { y0: 0.118, y1: 0.136, t0: -1.0, t1: 1.0, out: 0.0012, color: [0.03, 0.03, 0.035], metal: false, name: 'hatSlit' });
      barrelBand(K, { y0: 0.14, y1: 0.147, t0: -1.05, t1: 1.05, out: 0.0035, color: gold, name: 'hatTrim' });
      barrelBand(K, { y0: 0.104, y1: 0.11, t0: -1.05, t1: 1.05, out: 0.0035, color: gold, name: 'hatTrim' });
      barrelBand(K, { y0: -0.038, y1: -0.025, t0: -PI, t1: PI, out: 0.003, color: gold, segs: 30, name: 'hatTrim' });
      // a gold cross down the face, breathing holes
      barrelBand(K, { y0: 0.0, y1: 0.104, t0: -0.07, t1: 0.07, out: 0.0035, color: gold, segs: 2, name: 'hatCross' });
      barrelBand(K, { y0: 0.06, y1: 0.074, t0: -0.4, t1: 0.4, out: 0.0035, color: gold, segs: 6, name: 'hatCross' });
      for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) { const th = sg * (0.55 + k * 0.14), y = 0.045 + k * 0.012, p = barrelPoint(th, y); K.blob({ c: add(p, mul(norm([p[0], 0, p[2]]), 0.0005)), r: [0.003, 0.003, 0.0015], ax: [norm([Math.cos(th), 0, -Math.sin(th)]), [0, 1, 0], norm([Math.sin(th), 0, Math.cos(th)])], rows: 2, segs: 6, color: [0.02, 0.02, 0.025], name: 'hatBreath', minor: true }); }
      closeUnder(K, -0.04, tone(st, 0.3));
      return { brow: { p: add(barrelPoint(0, 0.175), [0, 0, 0.004]), n: [0, 0.15, 1] } };
    },
  },
  dragon_helm: {
    fit: () => -0.05,
    build(K, h) {
      const helm = h.c, dark = tone(helm, 0.55), crest = [0.85, 0.28, 0.06], hornC = [0.62, 0.06, 0.04];
      barrel(K, BARREL, { color: (u, th) => cmul(helm, 0.9 + 0.12 * Math.abs(Math.sin(th * 7 + u * 2))), metal: true, name: 'hatHelm' });
      barrelBand(K, { y0: 0.112, y1: 0.136, t0: -1.05, t1: 1.05, out: 0.0012, color: [0.025, 0.03, 0.025], metal: false, name: 'hatSlit' });
      barrelBand(K, { y0: 0.138, y1: 0.152, t0: -1.1, t1: 1.1, out: 0.005, color: dark, name: 'hatBrow' });
      for (const sg of [-1, 1]) { const p = barrelPoint(sg * 0.4, 0.124); K.blob({ c: add(p, mul(norm([p[0], 0, p[2]]), 0.0016)), r: [0.012, 0.004, 0.002], ax: [norm([Math.cos(sg * 0.4), 0, -Math.sin(sg * 0.4)]), [0, 1, 0], norm([Math.sin(sg * 0.4), 0, Math.cos(sg * 0.4)])], rows: 2, segs: 6, color: lift(h.eyes, 0.35), glow: 0.9, name: 'hatGlint' }); }
      // cheek guards angled toward the chin, on a dark seam
      for (const sg of [-1, 1]) barrelBand(K, { y0: 0.0, y1: 0.09, t0: sg > 0 ? 0.2 : -0.85, t1: sg > 0 ? 0.85 : -0.2, out: 0.005, color: (u, th) => cmul(helm, 0.95), segs: 5, name: 'hatGuard' });
      barrelBand(K, { y0: -0.01, y1: 0.105, t0: -0.04, t1: 0.04, out: 0.007, color: dark, segs: 2, name: 'hatSeam' });
      // the crest: a blade down the forehead, spikes along the crown ridge
      for (let i = 0; i < 6; i++) {
        const y = [0.19, 0.235, 0.262, 0.28, 0.284, 0.276][i], z = barrelPoint(i < 3 ? 0 : PI, y)[2] * [1, 1, 1, 0.3, -0.4, -1][i];
        const p0 = i < 3 ? barrelPoint(0, y) : [0, y, z], n = norm([0, 0.6 + i * 0.1, i < 3 ? 0.8 : -0.3]);
        K.tube({ path: t => add(p0, mul(n, (0.026 - i * 0.002) * t)), r: t => [0.006 * (1 - t) + 0.0004, 0.0016 * (1 - t) + 0.0003], rows: 2, sides: 4, up: [1, 0, 0], color: crest, rough: 0.5, name: 'hatCrest' });
      }
      for (const sg of [-1, 1]) {
        const r0 = barrelPoint(sg * 1.1, 0.22);
        horn(K, [r0, add(r0, [sg * 0.03, 0.02, -0.008]), add(r0, [sg * 0.05, 0.05, -0.022]), add(r0, [sg * 0.052, 0.09, -0.04])], 0.012, hornC);
      }
      closeUnder(K, -0.04, tone(helm, 0.3));
      return { brow: { p: add(barrelPoint(0, 0.165), [0, 0, 0.005]), n: [0, 0.2, 1] } };
    },
  },
  g5_plate_armet: {
    fit: () => -0.05,
    build(K, h) {
      const st = h.c, gold = h.c2, dk = tone(st, 0.6);
      barrel(K, BARREL, { color: st, metal: true, name: 'hatHelm' });
      barrelBand(K, { y0: -0.045, y1: -0.03, t0: -PI, t1: PI, out: 0.003, color: gold, segs: 30, name: 'hatTrim' });
      // the houndsnout: a blunt cone drawn out from the lower face, with breaths along it
      const S0 = barrelPoint(0, 0.075);
      K.tube({ path: t => add(S0, [0, -0.006 * t, -0.01 + 0.05 * t]), r: t => [0.05 * (1 - 0.85 * t) + 0.003, 0.038 * (1 - 0.85 * t) + 0.003], rows: 5, sides: 10, up: [0, 1, 0], color: st, metal: true, capStart: false, name: 'hatSnout' });
      for (let k = 0; k < 3; k++) for (const sg of [-1, 1]) K.blob({ c: add(S0, [sg * (0.03 - k * 0.008), -0.004, 0.006 + k * 0.012]), r: [0.0025, 0.004, 0.002], rows: 2, segs: 5, color: [0.02, 0.02, 0.025], name: 'hatBreath', minor: true });
      barrelBand(K, { y0: 0.128, y1: 0.141, t0: -1.0, t1: 1.0, out: 0.0012, color: [0.03, 0.03, 0.035], metal: false, name: 'hatSlit' });
      barrelBand(K, { y0: 0.143, y1: 0.152, t0: -1.05, t1: 1.05, out: 0.004, color: dk, name: 'hatBrow' });
      for (const sg of [-1, 1]) { const p = barrelPoint(sg * PI / 2, 0.12); K.blob({ c: add(p, [sg * 0.003, 0, 0]), r: [0.003, 0.008, 0.008], rows: 3, segs: 8, color: gold, metal: true, name: 'hatPivot' }); }
      K.tube({ path: t => { const a = lerp(0.3, PI - 0.3, t); return [0, 0.2 + 0.094 * Math.sin(a), 0.129 * Math.cos(a)]; }, r: [0.0035, 0.008], rows: 8, sides: 4, up: [1, 0, 0], color: gold, metal: true, name: 'hatCrest' });
      const top = [0, 0.291, -0.01];
      for (let k = 0; k < 3; k++) feather(K, [top, add(top, [(k - 1) * 0.006, 0.045, -0.03]), add(top, [(k - 1) * 0.01, 0.04, -0.08]), add(top, [(k - 1) * 0.007, 0.005, -0.11])], 0.011, k === 1 ? lift(gold, 0.15) : gold, { shaft: tone(gold, 0.7) });
      closeUnder(K, -0.045, tone(st, 0.3));
      return { brow: { p: add(barrelPoint(0, 0.18), [0, 0, 0.004]), n: [0, 0.2, 1] } };
    },
  },
  pumpkin_head: {
    fit: () => -0.05,
    build(K, h) {
      const orange = h.c, stem = h.c2, glow = [1.0, 0.72, 0.18];
      const CY = 0.125, R = [0.152, 0.138, 0.148];
      const rib = a => Math.abs(Math.cos(a * 5));
      K.blob({ c: [0, CY, -0.004], r: R, rows: 12, segs: 30, bumps: (a, v) => -0.07 * (1 - Math.sqrt(rib(a))) - 0.16 * Math.pow(Math.max(0, Math.cos(PI * v)), 6) * (v < 0.5 ? 1 : 0), color: (v, a) => (rib(a) < 0.35 ? tone(orange, 0.72) : orange), rough: 0.55, name: 'hatPumpkin' });
      // the carving: lit triangles laid on the front
      const front = (x, y) => { const zz = R[2] * Math.sqrt(Math.max(0, 1 - (x / R[0]) ** 2 - ((y - CY) / R[1]) ** 2)); return [x, y, zz - 0.004 + 0.0025]; };
      const tri = (pts) => K.raw({ pts: pts.map(([x, y]) => front(x, y)), color: glow, glow: 1.0 });
      for (const sg of [-1, 1]) tri([[sg * 0.03, 0.135], [sg * 0.078, 0.135], [sg * 0.054, 0.175]]);
      tri([[-0.012, 0.105], [0.012, 0.105], [0, 0.12]]);
      for (let k = -3; k <= 3; k++) { if (k === -1 || k === 2) continue; const x = k * 0.019, y = 0.072 - 0.012 * Math.cos(k / 3 * PI / 2); tri([[x - 0.009, y + 0.012], [x + 0.009, y + 0.012], [x, y - 0.008]]); }
      const top = [0, CY + R[1] * 0.84, -0.004];
      K.tube({ path: t => add(top, [0.004 * t, 0.04 * t, -0.006 * t]), r: t => 0.011 - 0.004 * t, rows: 3, sides: 6, color: stem, rough: 0.8, name: 'hatStem' });
      K.tube({ path: t => add(top, [0.008 + 0.02 * Math.cos(t * 4.5), 0.03 + 0.006 * t, 0.02 * Math.sin(t * 4.5)]), r: 0.0025, rows: 8, sides: 4, color: stem, rough: 0.8, name: 'hatVine', minor: true });
      K.blob({ c: add(top, [-0.024, 0.008, 0.01]), r: [0.022, 0.0035, 0.014], rows: 3, segs: 8, color: lift(stem, 0.15), rough: 0.8, name: 'hatLeaf' });
      return { brow: null };
    },
  },
  ghost_sheet: {
    fit: () => -0.5,
    build(K, h) {
      const sheet = h.c, hole = [0.06, 0.06, 0.09];
      const eyes = (th, y) => [-1, 1].some(sg => Math.hypot(adiff(th, sg * 0.42) * 0.11, (y - 0.13) * 0.8) < 0.016) || Math.hypot(th * 0.1, y - 0.075) < 0.008;
      K.shell({ rim: () => 0.03, clear: 0.017, bulge: (v, th, e) => 0.006 * Math.max(0, Math.cos(th)) * (1 - v), rows: 8, segs: 30, lip: 0, color: sheet, rough: 0.8, name: 'hatSheet' });
      // the eye holes and the little 'oo' mouth: dark ovals laid just proud of the sheet (vertex colour alone smeared)
      for (const [th, y, rx, ry] of [[-0.42, 0.135, 0.016, 0.022], [0.42, 0.135, 0.016, 0.022], [0, 0.075, 0.011, 0.009]]) {
        const p = K.atY(th, y, 0.017 + 0.006 * Math.cos(th) * 0.6 + 0.0015), n = K.normalY(th, y), X = norm(cross([0, 1, 0], n)), Y = cross(n, X);
        K.blob({ c: p, r: [rx, ry, 0.0018], ax: [X, Y, n], rows: 3, segs: 12, color: hole, rough: 0.9, name: 'hatHole' });
      }
      void eyes;
      // a poncho's hem: short over the arms (they come out under it in every clip), long in front and behind, wavy
      K.drape({ top: 0.03, hem: th => -0.17 - 0.27 * Math.cos(th) ** 2 + 0.025 * Math.sin(th * 6), gap: s => 0.019 + 0.022 * s, rows: 11, segs: 32, color: (u, th) => cmul(sheet, 0.93 + 0.07 * Math.cos(th * 6)), rough: 0.8, name: 'hatSheet' });
      return { brow: null };
    },
  },

  // ------------------------------------------------------------------ hoods
  chain_coif: {
    fit: hoodFit(COIF_RIM, COIF_OPEN, -0.2),
    build(K, h) {
      const st = h.c, R = 16, rim = COIF_RIM;
      const M = MAIL(K, h, R);
      K.shell({ rim, clear: CLEAR + 0.0055, bulge: M.bulge, rows: R, segs: 34, color: M.color, metal: true, lip: 0.004, lipIn: 0.009, name: 'hatCoif' });
      // a leather binding round the face opening only (from jaw to jaw over the brow)
      K.tube({ path: t => { const th = lerp(-COIF_OPEN, COIF_OPEN, t); return K.atY(th, rim(th) + 0.003, CLEAR + 0.0075); }, r: [0.0032, 0.0038], rows: 16, sides: 4, color: [0.16, 0.11, 0.08], rough: 0.6, name: 'hatBinding' });
      const D = 10;
      // the mantle and the cheeks' sides; the opening closes under the chin (the first rows reach the jaw at s ≈ 0.45)
      const close = s => COIF_OPEN * (1 - smooth(0.42, 0.58, s));
      K.drape({ top: frontTop(rim, COIF_OPEN), hem: th => -0.2 - 0.04 * Math.cos(th) ** 2, gap: (s, th) => CLEAR + 0.0055 + 0.006 * s + (rowIx(s, D) % 2 ? 0.0016 : 0), from: close, to: close, rows: D, segs: 30, color: (u) => (rowIx(u, D) % 2 ? lift(st, 0.22) : tone(st, 0.62)), metal: true, name: 'hatMantle' });
      return { brow: { y: 0.215, off: 0.014 } };
    },
  },
  hood: {
    fit: hoodFit(HOOD_RIM, HOOD_OPEN, -0.21),
    build(K, h) {
      const cloth = h.c, lining = tone(h.c, 0.5), edge = h.own2 ? h.c2 : lift(h.c, 0.14 + (1 - Math.max(...h.c)) * 0.2);
      const rim = HOOD_RIM;
      // the cowl: loose over the head with a soft point at the back of the crown; the edge round the face turned back
      const peak = (v, th) => 0.012 * smooth(0.3, 1, v) * Math.max(0, -Math.cos(th)) + 0.006 * Math.sin(PI * v);
      K.shell({ rim, clear: 0.019, bulge: (v, th) => peak(v, th) + 0.006 * (1 - v) * smooth(0.8, 1.1, Math.abs(th)), rows: 8, segs: 32, color: (v, th) => (v < 0.12 && Math.abs(th) < 1.25 ? edge : cmul(cloth, 1 - 0.12 * smooth(1.6, 2.6, Math.abs(th)) - 0.25 * gauss(adiff(th, PI), 0.03))), rough: 0.85, lip: 0.006, lipIn: 0.01, name: 'hatHood' });
      // the lining inside the face opening
      K.shell({ rim: th => rim(th) + 0.002, clear: 0.0105, rows: 5, segs: 16, from: -1.15, to: 1.15, top: 1.3, lip: 0, color: lining, rough: 0.9, name: 'hatLining' });
      // the mantle on the shoulders, open in a V at the throat
      // the sides of the face and the mantle: straight down from the opening's corner to the jaw, then a V to the hem
      const vee = s => lerp(HOOD_OPEN, 0.42, smooth(0.4, 1, s));
      K.drape({ top: frontTop(rim, HOOD_OPEN), hem: th => -0.22 - 0.07 * Math.cos(th) ** 2, gap: (s, th) => 0.02 + 0.006 * s, from: vee, to: vee, rows: 10, segs: 30, color: (u, th) => (Math.abs(th) < vee(u) + 0.09 ? edge : cmul(cloth, 1 - 0.1 * u)), rough: 0.85, name: 'hatMantle' });
      return { brow: { y: 0.232, off: 0.024 } };
    },
  },
  hood_down: {
    fit: null,
    build(K, h) {
      const cloth = h.c, edge = lift(h.c, 0.14 + (1 - Math.max(...h.c)) * 0.2), lining = tone(h.c, 0.5);
      // the cowl lying round the neck and the empty hood flat on the upper back
      K.drape({ top: -0.06, hem: th => -0.13 - 0.02 * Math.cos(th) ** 2, gap: (s) => 0.012 + 0.018 * Math.sin(PI * s), from: 0.55, to: 0.55, rows: 4, segs: 26, color: (u, th) => (u < 0.3 ? edge : cloth), rough: 0.85, name: 'hatCowl' });
      K.drape({ top: -0.12, hem: th => -0.33 - 0.04 * gauss(adiff(th, PI), 0.4), gap: (s, th) => 0.016 + 0.014 * Math.sin(PI * s) * gauss(adiff(th, PI), 0.8), from: 2.05, to: 2.05, rows: 5, segs: 14, color: (u, th) => (u > 0.85 ? lining : cmul(cloth, 0.95 - 0.12 * gauss(adiff(th, PI), 0.05))), rough: 0.85, name: 'hatHoodBag' });
      return { brow: null };
    },
  },

  // ------------------------------------------------------------------ bands and crowns (on the hair)
  crown: {
    fit: null,
    band: { y: th => 0.205 - 0.012 * (1 - Math.cos(th)) / 2, lo: -0.017, hi: 0.06, min: 0.007, max: 0.035 },
    build(K, h) {
      const gold = h.c, y = this.band.y, R = th => h.bandR(th) + 0.0005;
      const ring = (k, dy) => th => R(th) * k + dy;
      void ring;
      K.loop({ y, around: th => R(th) + 0.003, r: [0.003, 0.016], segs: 40, sides: 4, color: (t, a) => (Math.abs(Math.sin(a)) > 0.9 ? lift(gold, 0.15) : gold), metal: true, name: 'hatCrown' });
      for (let k = 0; k < 8; k++) {
        const th = k / 8 * TAU - PI, rr = R(th) + 0.003, b = [Math.sin(th) * rr, y(th) + 0.012, Math.cos(th) * rr], n = norm([Math.sin(th), 0, Math.cos(th)]);
        K.tube({ path: t => add(add(b, mul(n, 0.006 * t)), [0, 0.042 * t, 0]), r: t => [0.0135 * (1 - t) + 0.0008, 0.0028], rows: 2, sides: 4, up: n, color: gold, metal: true, name: 'hatPoint' });
        K.blob({ c: add(add(b, mul(n, 0.006)), [0, 0.044, 0]), r: [0.0045, 0.0045, 0.0045], rows: 3, segs: 6, color: lift(gold, 0.2), metal: true, name: 'hatPoint', minor: true });
      }
      for (const th of [0, PI / 2, -PI / 2]) { const rr = R(th) + 0.0055; gem(K, [Math.sin(th) * rr, y(th), Math.cos(th) * rr], [Math.sin(th), 0, Math.cos(th)], 0.0055, [0.7, 0.06, 0.08], 0.25 + 0.1 * h.q); }
      return { brow: null };
    },
  },
  circlet: {
    fit: null,
    band: { y: th => 0.182 + 0.03 * (1 - Math.cos(th)) / 2, lo: -0.006, hi: 0.006, min: 0.003, max: 0.032 },
    build(K, h) {
      const y = this.band.y, R = th => h.bandR(th) + 0.0018;
      K.loop({ y, around: R, r: [0.0016, 0.0024], segs: 40, sides: 4, color: h.c, metal: true, name: 'hatCirclet' });
      gem(K, [0, y(0) - 0.001, R(0) + 0.0025], [0, 0, 1], 0.0065, h.c2, 0.4 + 0.15 * h.q);
      return { brow: null };
    },
  },
  headband: {
    fit: null,
    band: { y: th => 0.18 + 0.02 * (1 - Math.cos(th)) / 2, lo: -0.009, hi: 0.009, min: 0.003, max: 0.032 },
    build(K, h) {
      const y = this.band.y, R = th => h.bandR(th) + 0.0028;
      K.loop({ y, around: R, r: [0.0025, 0.0065], segs: 40, sides: 4, color: h.c, rough: 0.7, name: 'hatHeadband' });
      // the ties at the back lie over the hair there (laid on its measured outer face), not through it
      if (!h.hairHangs(PI)) for (const sg of [-1, 1]) K.tube({ path: t => { const th = PI + sg * (0.03 + 0.1 * t), yy = y(PI) - 0.05 * t, rr = Math.max(R(th) + 0.004 * (1 - t), h.hairR(th, yy, 0.06) + 0.004) + 0.008 * t; return [Math.sin(th) * rr, yy, Math.cos(th) * rr]; }, r: t => [0.006 * (1 - 0.6 * t), 0.0012], rows: 6, sides: 4, up: [0, 0, 1], color: h.c, rough: 0.7, name: 'hatTie' });
      return { brow: null };
    },
  },
  feather_band: {
    fit: null,
    band: { y: th => 0.185 + 0.02 * (1 - Math.cos(th)) / 2, lo: -0.009, hi: 0.03, min: 0.003, max: 0.032 },
    build(K, h) {
      const y = this.band.y, R = th => h.bandR(th) + 0.0028;
      K.loop({ y, around: R, r: [0.0025, 0.0065], segs: 40, sides: 4, color: h.c, rough: 0.7, name: 'hatHeadband' });
      for (const [th, col] of [[1.0, [0.86, 0.84, 0.78]], [1.3, lift(h.c, 0.5)]].slice(0, K.lean >= 3 ? 1 : 2)) {
        const b = [Math.sin(th) * (R(th) + 0.002), y(th), Math.cos(th) * (R(th) + 0.002)];
        feather(K, [b, add(b, [0.01, 0.035, -0.012]), add(b, [0.012, 0.07, -0.03]), add(b, [0.006, 0.095, -0.05])], 0.01, col);
      }
      return { brow: null };
    },
  },
  flower: {
    fit: null,
    band: { y: () => 0.2, lo: -0.03, hi: 0.03, min: 0.003, max: 0.04 },
    build(K, h) {
      const th = 1.0, y = 0.2, b = [Math.sin(th) * (h.bandR(th) + 0.0035), y, Math.cos(th) * (h.bandR(th) + 0.0035)], n = norm([Math.sin(th), 0.25, Math.cos(th)]);
      const up = [0, 1, 0], X = norm(cross(up, n)), Y = cross(n, X);
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; K.blob({ c: add(b, add(mul(X, Math.cos(a) * 0.015), mul(Y, Math.sin(a) * 0.015))), r: [0.012, 0.0115, 0.0032], ax: [norm(add(mul(X, Math.cos(a)), mul(Y, Math.sin(a)))), norm(add(mul(X, -Math.sin(a)), mul(Y, Math.cos(a)))), n], rows: 3, segs: 8, color: (v) => cmix(h.c, [1, 1, 1], 0.25 * v), rough: 0.6, name: 'hatPetal' }); }
      K.blob({ c: add(b, mul(n, 0.004)), r: [0.0075, 0.0075, 0.0045], ax: [X, Y, n], rows: 3, segs: 8, color: h.c2, rough: 0.6, name: 'hatPetal' });
      for (const s of [-1, 1]) K.blob({ c: add(b, add(mul(X, s * 0.026), mul(Y, -0.016))), r: [0.016, 0.006, 0.0018], ax: [norm(add(X, mul(Y, s * 0.4))), Y, n], rows: 2, segs: 6, color: [0.18, 0.42, 0.16], rough: 0.6, name: 'hatLeaf', minor: true });
      return { brow: null };
    },
  },
  bone_headdress: {
    fit: null,
    band: { y: th => 0.188 + 0.02 * (1 - Math.cos(th)) / 2, lo: -0.012, hi: 0.05, min: 0.004, max: 0.034 },
    build(K, h) {
      const y = this.band.y, R = th => h.bandR(th) + 0.0045, band = h.c, fc = h.c2;
      K.loop({ y, around: R, r: [0.004, 0.009], segs: 40, sides: 5, color: band, rough: 0.8, name: 'hatHeadband' });
      for (let k = 0; k < 7; k++) { const th = -0.9 + k * 0.3, rr = R(th) + 0.004; K.blob({ c: [Math.sin(th) * rr, y(th), Math.cos(th) * rr], r: [0.0035, 0.0035, 0.0035], rows: 3, segs: 5, color: k % 2 ? [0.9, 0.86, 0.76] : [0.13, 0.55, 0.6], name: 'hatBead', minor: true }); }
      const NF = K.lean >= 3 ? 3 : K.lean >= 2 ? 5 : 7;        // a heavy look (the budget) gets a smaller fan
      for (let k0 = 0; k0 < NF; k0++) {
        const k = NF === 7 ? k0 : k0 + 1, th = PI + (k - 3) * 0.3, rr = R(th) + 0.002, b = [Math.sin(th) * rr, y(th) + 0.004, Math.cos(th) * rr];
        const col = k % 2 ? fc : k === 3 ? [0.92, 0.9, 0.84] : [0.14, 0.12, 0.11];
        const out = [Math.sin(th) * 0.018, 0, Math.cos(th) * 0.018];
        feather(K, [b, add(b, add(mul(out, 0.6), [0, 0.04, 0])), add(b, add(mul(out, 1.1), [0, 0.085 - Math.abs(k - 3) * 0.008, 0])), add(b, add(mul(out, 1.5), [0, 0.12 - Math.abs(k - 3) * 0.016, 0]))], 0.011, col);
      }
      if (K.lean < 3) for (const sg of [-1, 1]) { const r0 = [Math.sin(sg * 0.95) * (R(sg * 0.95) + 0.003), y(sg * 0.95) + 0.004, Math.cos(sg * 0.95) * (R(sg * 0.95) + 0.003)]; horn(K, [r0, add(r0, [sg * 0.012, 0.016, -0.004]), add(r0, [sg * 0.016, 0.034, -0.014])], 0.006, [0.9, 0.86, 0.74]); }
      return { brow: null };
    },
  },
};

/** The plain helm (helmet, horned helm): a round steel cap, a rolled rim, a ridge. */
function helmBase(K, h, fit) {
  const st = h.c, dk = tone(st, 0.62);
  K.shell({ rim: fit, clear: CLEAR + 0.0035, bulge: v => 0.003 * Math.sin(PI * v) + 0.004 * v * v, rows: 7, segs: 30, color: st, metal: true, name: 'hatHelm' });
  K.loop({ y: th => fit(th) + 0.004, off: CLEAR + 0.0065, r: [0.003, 0.005], segs: 32, color: h.trim, metal: true, name: 'hatRoll' });
  K.tube({ path: t => K.onRay(0, lerp(0.55, PI - 0.6, t), CLEAR + 0.0075 + 0.004 * Math.sin(PI * t)), r: [0.0028, 0.0035], rows: 8, sides: 4, color: dk, metal: true, name: 'hatRidge' });
}
/** The dark underside of a closed helm round the neck (no one sees up into an empty helm): from the barrel in to 1.4 cm
 *  off the neck (measured on the real neck, so a nod in a clip does not drive it into the skin). */
function closeUnder(K, y, color) {
  const yW = K.W([0, y, 0])[1], az = K.P.headZ;
  const inner = th => K.neckAround(yW, th, az) / K.P.HS + 0.014;
  K.brim({ y, inner, width: th => Math.max(0.004, Math.hypot(barrelPoint(th, y)[0], barrelPoint(th, y)[2]) - inner(th) - 0.002), thick: 0.002, segs: 26, color, under: color, rough: 0.9, name: 'hatUnder' });
}
