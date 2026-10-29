// Kestrel kit — every hairstyle (the 44 ids a Chibi 2.5 / Thousandvale look can name), written with the toolkit in
// hair-kit.js. Head space throughout (metres for a 0.24 m head, y up from the chin, +z forward, +x the character's "R"
// side, which is the viewer's LEFT in a front view).
//
//   hairParts(P, look, colors, id, { lod, body, underHat })  → { parts, scalp, covers(y, θ), ears }
//   hairStyleFor(id)                                        → the canonical id (unknown ids → the nearest, never an error)
//   hairUnderHat(id, hat)                                   → the opts for the same style cropped under a hat (batch 3)
//   hairChain(P) / hairSwing(id)                            → where the hairA/B/C spring bones sit, and how they may swing
//
// Each style is ONE function in STYLES below with its own silhouette and front. Shared builders (curtain, fringe, tail,
// bun, braid, petals) keep them short. `STYLE_INFO[id]` says how each one treats the ears ('over' = covers and hides
// them, 'free' = goes round them) and which way its springs swing.
import { clamp, lerp, smooth, gauss, table, add, sub, mul, norm, cross, dot, len, cmul, cmix } from './kmath.js';
import { hairKit } from './hair-kit.js';
import { hairIdOf } from './face-catalog.js';

const PI = Math.PI;

/** The canonical hair id for anything a look names ('' → 'short'; unknown → the nearest by name). */
export const hairStyleFor = hairIdOf;

/** Hairline height (head space) around the head, by |θ|. */
const HAIRLINE = table([[0, 0.192], [0.45, 0.188], [0.8, 0.172], [1.1, 0.158], [1.3, 0.13], [1.4, 0.112], [1.47, 0.14], [1.6, 0.16], [1.78, 0.152], [2.05, 0.112], [2.45, 0.075], [PI, 0.058]]);
export const hairlineY = th => HAIRLINE(Math.abs(th))[0];
const lineLong = th => hairlineY(th) - 0.003 - 0.006 * Math.max(0, Math.cos(th));
const lineHigh = th => hairlineY(th) + 0.014 * Math.max(0, Math.cos(th)) ** 2;          // receded at the front
const lineWidow = th => hairlineY(th) - 0.006 * gauss(th, 0.12) + 0.006 * gauss(Math.abs(th) - 0.55, 0.25);

/** Per style: ears 'over' (covered: plain ears are hidden, pointed ones poke through) or 'free'; swing = how the spring
 *  bones move ('tail' free, 'loose' never into the back, null = no spring hair); chain = the spring bones' head-space
 *  root, or 'nape' / 'crown'. */
export const STYLE_INFO = {
  bald: {}, buzz: {}, short: {}, side_part: {}, bangs: { ears: 'over' }, bob: { ears: 'over' }, long: { ears: 'over', swing: 'loose', chain: 'nape' },
  wavy: { ears: 'over', swing: 'loose', chain: 'nape' }, ponytail: { swing: 'tail', chain: [0.028, 0.085, -0.104] }, bun: {}, buns: {}, mohawk: {}, spiky: {},
  curly: {}, afro: { ears: 'over' }, braids: {}, pixie: {}, slicked: {}, hood_hair: { ears: 'over' }, tonsure: {}, horns_hair: {}, undercut: {},
  topknot: {}, high_ponytail: { swing: 'tail', chain: [0, 0.228, -0.066] }, twin_tails: { swing: 'tail', chain: [0, 0.2, -0.06] }, messy: {}, pompadour: {},
  locs: { ears: 'over', swing: 'loose', chain: 'nape' }, long_braid: { swing: 'tail', chain: [0, 0.07, -0.108] }, mullet: { swing: 'loose', chain: 'nape' },
  side_swept: {}, crown_braid: {}, side_shave: {}, wolf_cut: { ears: 'over' }, half_up: { swing: 'loose', chain: 'nape' }, ribbon_loops: {},
  cornrows: {}, warrior_braids: { swing: 'tail', chain: [0, 0.1, -0.11] }, feathered: { ears: 'over' }, curly_bob: { ears: 'over' }, puff: {},
  rolled_tail: {}, bowl: { ears: 'over' }, court_cut: { swing: 'loose', chain: 'nape' },
};
export const HAIR_IDS = Object.keys(STYLE_INFO);

/** Head-space points for the hairA / hairB / hairC spring bones of this look's style (face.js faceLandmarks). */
export function hairChain(P) {
  const id = P.face?.hair?.id || (P.fem ? 'high_ponytail' : 'spiky');
  const c = STYLE_INFO[id]?.chain;
  if (Array.isArray(c)) return [c, add(c, [0, -0.06, -0.06]), add(c, [0, -0.15, -0.065])];
  if (c === 'nape') return [[0, 0.1, -0.1], [0, -0.02, -0.11], [0, -0.13, -0.1]];
  return [[0, 0.215, -0.082], [0, 0.17, -0.15], [0, 0.09, -0.165]];
}
/** How this style's springs may swing: 'tail' (both ways), 'loose' (never forward into the back) or null. */
export const hairSwing = id => STYLE_INFO[hairStyleFor(id)]?.swing || null;

/**
 * The same style cropped to sit under a hat (batch 3 builds the hats). `hat` may name the brim height in head space at
 * the face and the nape ({ front, back }) or be a hat id; the defaults suit a cap / helm whose brim sits on the brow.
 * Returns the opts for hairParts (pass them as `underHat`).
 */
export function hairUnderHat(id, hat = {}) {
  const deep = typeof hat === 'string' && /helm|hood|coif|great|dragon|pumpkin|ghost/.test(hat);
  const front = Number.isFinite(hat.front) ? hat.front : deep ? 0.15 : 0.178;
  const back = Number.isFinite(hat.back) ? hat.back : deep ? 0.06 : 0.11;
  return { id: hairStyleFor(id), underHat: { front, back } };
}

// ------------------------------------------------------------------------------------------------ the builder
/**
 * The hair pieces for `id`. opts: lod (1 = fewer locks), body ({ neck, torso } parts, for keeping hanging hair off the
 * body), underHat ({ front, back } brim heights), earsShown (false when the look has no side ears to go round).
 * Returns { parts, scalp (the skin under the cap may be dropped), covers(y, θ) (is the scalp at this point under hair),
 * ears ('over' | 'free') }.
 */
export function hairParts(P, look, colors, id, opts = {}) {
  id = hairStyleFor(id);
  if (id === 'bald') return { parts: [], scalp: false, covers: () => false, ears: 'free', lineOf: hairlineY };
  const info = STYLE_INFO[id] || {};
  let seed = 7; for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const K = hairKit(P, colors, { lod: opts.lod || 0, body: opts.body, ears: info.ears || 'free', earsShown: opts.earsShown !== false, underHat: opts.underHat, seed, color2: colors.hair2, bodyPad: opts.bodyPad || 0, belt: opts.belt || null });   // batch 3: bodyPad (a fallen hood), belt (a band)
  const out = (STYLES[id] || STYLES.short)(K, P) || {};
  const line = out.line || hairlineY, top = out.top ?? 1;
  return {
    parts: K.parts, scalp: true, ears: info.ears || 'free', lineOf: line,
    covers: (y, th) => y > line(th) + 0.012 && (top >= 1 || y < out.topY - 0.008),
  };
}

// ------------------------------------------------------------------------------------------------ shared builders
const jitter = (K, k) => K.jit(k);
/** A row of locks rooted round the head at y(θ) that HANG to end(θ) (head-space y). */
function curtain(K, { n, from = -PI, to = PI, y, end, w = 0.042, th = 0.0125, lift = 0.25, droop = 0.55, steps = 6, curl = 0, flick = 0, out = 0.1, minor = false, bones = null, tip2 = null, skip = null, sides = 3, wave = 0, shade = 1, taper = 1.6, lenK = 1.15, rag = 0.14, flat = 0.45 }) {
  // polish: locks are ~15% narrower than they were and thicker (a ridge, not a sheet); the cap shows between them as
  // strand separation; lengths are ragged so the ends break up instead of ending on one line
  w *= 0.86;
  for (let i = 0; i < n; i++) {
    const a = lerp(from, to, (i + 0.5) / n) + jitter(K, 0.03);
    if (skip && skip(a)) continue;
    const ry = typeof y === 'function' ? y(a) : y;
    const e = typeof end === 'function' ? end(a) : end;
    const { p, n: nn } = K.scalp(a, ry);
    const dir = norm(add(K.meridian(a, ry), mul(nn, out)));
    const L = Math.max(0.02, (ry - e) * lenK + 0.012) * (1 + jitter(K, rag) - (i % 3 === 1 ? rag * 0.6 : 0));
    const inward = curl ? mul(nn, -curl) : flick ? mul(nn, flick) : null;
    K.lock({ root: p, n: nn, dir, length: L, lift, droop, w: w * (1 + jitter(K, 0.12)), th, steps, curl: inward, minor: minor && i % 2 === 1, bones: bones || ((q, t) => K.looseW(q, t)), tip2, flat, sides, shade: shade * (0.94 + 0.12 * Math.sin(i * 2.1)), taper, wave: wave ? [0.013 * wave, 2.0, i * 1.7] : null });
  }
}
/**
 * Long loose hair in layers (the polish pass for long / wavy, and the same idea in half_up / court_cut): a part, a crown
 * layer that stands off the head (volume) and falls to about the ears, face-framing locks swept from the part past the
 * temples to the jaw, layered sides and a back; every hanging lock ragged in length, optionally waving.
 * end = [front, side, back] end heights (head-space y).
 */
function layeredLong(K, { part = 0, end = [-0.04, -0.1, -0.24], wave = 0, crownOnly = false }) {
  const pw = (v, a) => cmul(K.col, (0.88 + 0.12 * smooth(0, 0.6, v)) * (1 - 0.38 * gauss(a - part, 0.035) * smooth(0.5, 0.85, v)));
  K.cap({ line: lineLong, color: pw });
  const W = wave ? [0.013 * wave, 2.0] : null;
  // crown layer: from the part outwards and down, standing off the skull
  for (let i = 0; i < 14; i++) {
    const a = part + PI * (-1 + 2 * (i + 0.5) / 14) * 0.98, side = Math.sign(Math.sin(a - part)) || 1;
    const y = 0.236 - 0.006 * (1 - Math.cos(a - part)) / 2, { p, n } = K.scalp(a, y);
    let dir = K.meridian(a, y);
    if (Math.cos(a) > 0.45) dir = norm(add(dir, [side * 0.9, -0.2, 0]));          // off the forehead toward the temples
    K.lock({ root: p, n, dir, length: 0.11 + jitter(K, 0.012), lift: 0.2, droop: 0.5, w: 0.046, th: 0.015, off: 0.011, steps: 4, flat: 0.45, minor: i % 4 === 3 });
  }
  if (crownOnly) return;
  // face framing: from beside the part, past the temple, down in front of the ear to the jaw / collar
  for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) {
    const a = part + sg * (0.12 + i * 0.16), { p, n } = K.scalp(a, 0.228 - i * 0.006);
    const target = K.H.at(0.16 - i * 0.014, sg * (1.0 + i * 0.12), { noFeatures: true });
    K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) + (0.16 - i * 0.012 - end[0]) * 1.05 + jitter(K, 0.015), lift: 0.3, droop: 0.5, w: 0.034, th: 0.012, off: 0.01, steps: 7, flat: 0.4, bones: (q, t) => K.looseW(q, t), wave: W ? [W[0] * 0.8, W[1], i + (sg > 0 ? 1 : 0)] : null });
  }
  for (const sg of [-1, 1]) curtain(K, { n: 5, from: sg > 0 ? 1.12 : -1.95, to: sg > 0 ? 1.95 : -1.12, y: a => hairlineY(a) + 0.034, end: end[1], w: 0.046, steps: 6, out: 0.24, wave, lift: 0.32 });
  curtain(K, { n: 9, from: 2.02, to: 2 * PI - 2.02, y: 0.205, end: end[2], w: 0.06, steps: 7, out: 0.2, wave, minor: true, lift: 0.32 });
}
/** A fringe: locks rooted near the crown/front, each aimed at a target point on the forehead (head space). */
function fringe(K, list, { th = 0.012, steps = 4, flat = 0.4, lift = 0.32, taper = 1.6, rootY = 0.214, droop: dr = null } = {}) {
  for (const [a, ty, len, w, droop = 0.28, xOff = 0] of list) {
    const { p, n } = K.scalp(a, rootY + jitter(K, 0.003));
    const target = K.H.at(ty, a * 0.8 + xOff, { noFeatures: true });
    K.lock({ root: p, n, dir: norm(sub(add(target, [0, -0.012, 0]), p)), length: len, lift, droop: dr ?? droop, w, th, off: 0.008, steps, flat, taper });
  }
}
/** Locks combed flat from their roots to a point (a tie, a bun, the crown): sheets that make the head read "pulled back". */
function combTo(K, { n, from = -PI, to = PI, y, target, w = 0.05, th = 0.006, lift = 0.04, droop = -0.06, steps = 5, shade = 0.9, over = 1.05, minor = false, swell = 0.5 }) {
  for (let i = 0; i < n; i++) {
    const a = lerp(from, to, (i + 0.5) / n);
    const ry = typeof y === 'function' ? y(a) : y;
    const { p, n: nn } = K.scalp(a, ry);
    const tg = typeof target === 'function' ? target(a) : target;
    K.lock({ root: p, n: nn, dir: norm(sub(tg, p)), length: len(sub(tg, p)) * over, lift, droop, w, th, off: 0.005, steps, shade, flat: 0.25, minor: minor && i % 2 === 1, swell });
  }
}
/** A tail out of a tie point: a fountain of locks that arcs out (spread) and falls on the spring bones. */
function tail(K, tie, { n = 12, len = 0.27, spread = [0, 0.75, -1], fan = 0.22, droop = 0.78, w = 0.046, th = 0.012, steps = 7, curl = [0, 0, -0.25], tip2 = null, bones = null }) {
  const bw = bones || K.springW(tie[1]);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * PI * 2 + jitter(K, 0.25);
    const root = add(tie, [Math.cos(ang) * 0.007, 0.004, Math.sin(ang) * 0.006]);
    const dir = [spread[0] + Math.cos(ang) * fan, spread[1] + K.R() * 0.3, spread[2] + Math.sin(ang) * fan];
    K.lock({ root, n: norm(dir), dir, length: len * (0.85 + K.R() * 0.3), lift: 0.1, droop: droop + K.R() * 0.12, w: w * (0.85 + K.R() * 0.3), th, off: 0.014, steps, bones: bw, curl: add(curl, [Math.cos(ang) * 0.1, 0, 0]), flat: 0.4, tip2, minor: i % 3 === 2 });
  }
}
/** A band round a tie point (an ellipse ring facing `axis`). */
function band(K, c, r, axis = [0, 1, 0], color = null, wide = 0.006) {
  const A = norm(axis); let u = norm(cross(A, [0, 0, 1])); if (!Number.isFinite(u[0]) || len(cross(A, [0, 0, 1])) < 0.1) u = norm(cross(A, [1, 0, 0]));
  const v = cross(A, u);
  K.tube({ path: t => add(c, add(mul(u, Math.cos(t * PI * 2) * r), mul(v, Math.sin(t * PI * 2) * r))), r: [wide, 0.004], rows: 10, sides: 4, up: A, color: color ? () => color : null, bones: () => [['head', 1]], capStart: false, capEnd: false, name: 'tie' });
}
/** A braid tube through head-space points (Catmull-Rom), radius r, with an optional tie at the end. */
function braid(K, pts, { r = 0.011, rows = 14, sides = 6, bones = null, tip2 = null, keep = true, tie = true, minor = false, crossings = 32, sink = 0 }) {
  const path = t => catmull(pts, t);
  K.tube({ path, r: t => r * (1 - 0.35 * smooth(0.75, 1, t)), rows, sides, braid: crossings, bones, keep, off: r * (1 - sink) + 0.004, tip2, minor });
  if (tie && !K.lod) { const e = path(0.93), e2 = path(0.97); K.tube({ path: t => add(e, mul(sub(e2, e), t)), r: r * 0.85, rows: 1, sides: 6, color: () => [0.16, 0.14, 0.13], bones, name: 'tie' }); }
}
function catmull(pts, t) {
  const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
}
/** A point `off` out from the scalp at (θ, y). */
const S_ = (K, a, y, off = 0.004) => K.scalp(a, y, off).p;
/** Shingled petal rows from the crown out (the spiky / messy / wolf-cut tops). */
function petals(K, layers, { skipFront = true, flat = 0.45 } = {}) {
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const a = PI * (-1 + 2 * (i + 0.5 + jitter(K, 0.25)) / L.n);
      if (skipFront && Math.cos(a) > 0.55 && (L.up ?? 0) < 0.5) continue;
      const y = L.y + jitter(K, 0.004);
      const { p, n } = K.scalp(a, y);
      let dir = K.meridian(a, y);
      if (L.up) dir = norm(add(mul(dir, 1 - L.up), mul([Math.sin(a) * 0.35, 1, -0.45 + Math.cos(a) * 0.2], L.up)));
      dir = norm(add(dir, [Math.sin(a) * 0.25 + jitter(K, 0.15), 0, jitter(K, 0.1)]));
      K.lock({ root: p, n, dir, length: L.len * (0.85 + K.R() * 0.3), lift: L.lift * (0.8 + K.R() * 0.4), droop: L.droop, w: L.w * (0.85 + K.R() * 0.3), th: L.th, off: 0.014, steps: L.steps || 4, flat, minor: L.minor && i % 2 === 1 });
    }
  }
}
/** Short locks lying down the back and sides to the nape (the back of most short cuts). */
function shortBack(K, { rows = [[0.165, 8, 0.06], [0.135, 7, 0.055]], w = 0.042, from = PI - 0.95, to = PI + 0.95, nape = 6, napeLen = 0.07, minor = true } = {}) {
  for (const [y, nB, L] of rows) for (let i = 0; i < nB; i++) {
    const a = lerp(from, to, (i + 0.5) / nB) + jitter(K, 0.06), { p, n } = K.scalp(a, y);
    K.lock({ root: p, n, dir: norm(add(K.meridian(a, y), [0, -0.5, 0])), length: L * 1.1 + jitter(K, 0.008), lift: 0.38, droop: 0.12, w, th: 0.015, off: 0.011, steps: 4, flat: 0.45, minor: minor && i % 2 === 1 });
  }
  for (let i = 0; i < nape; i++) {
    const a = PI + (i - (nape - 1) / 2) * 0.34 + jitter(K, 0.05), y = 0.16, { p, n } = K.scalp(a, y);
    K.lock({ root: p, n, dir: norm(add(K.meridian(a, y), [0, -0.3, 0])), length: napeLen + jitter(K, 0.008), lift: 0.3, droop: 0.12, w: 0.038, th: 0.013, off: 0.007, steps: 4, flat: 0.45 });
  }
}
/** Sides: locks lying back over the temples to just above the ear, and a sideburn. */
function shortSides(K, { n = 3, len = 0.062, w = 0.038, burn = true } = {}) {
  for (const sg of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const a = sg * (1.05 + i * 0.3), y = 0.19 - i * 0.004, { p, n: nn } = K.scalp(a, y);
      K.lock({ root: p, n: nn, dir: norm(add(K.meridian(a, y), [0, 0, -0.35])), length: len, lift: 0.38, droop: 0.12, w, th: 0.014, off: 0.008, steps: 4, flat: 0.45 });
    }
    if (burn) { const { p, n: nn } = K.scalp(sg * 1.3, 0.162); K.lock({ root: p, n: nn, dir: [0, -1, 0.1], length: 0.035, lift: 0.1, droop: 0.15, w: 0.018, th: 0.006, off: 0.004, steps: 3 }); }
  }
}
/** A cap that is shaved where shave(θ, y) > 0 (stubble-coloured) and full elsewhere. */
const capColor = (K, shaveAt) => (v, a) => {
  const k = shaveAt(v, a);
  return cmix(cmul(K.col, 0.88 + 0.12 * smooth(0, 0.6, v)), cmix(K.P.__skin || K.col, cmul(K.col, 0.7), 0.42), k);
};
/** Spiral corkscrew: a round lock that turns about its own hanging line. */
function corkscrew(K, root, n, { len = 0.1, r = 0.008, turns = 3, w = 0.011, steps = 7, bones = null, minor = false, tip2 = null }) {
  const down = norm(add(K.meridian(Math.atan2(root[0], root[2]), root[1]), mul(n, 0.35)));
  let side = norm(cross(down, n)); if (!Number.isFinite(side[0])) side = [1, 0, 0];
  const fwd = cross(side, down);
  const pts = []; for (let i = 0; i <= steps; i++) { const t = i / steps, ang = t * turns * PI * 2; pts.push(add(add(root, mul(down, len * t)), add(mul(side, Math.cos(ang) * r * t ** 0.5), mul(fwd, Math.sin(ang) * r * t ** 0.5 + 0.004 * t)))); }
  K.tube({ path: t => catmull(pts.map(q => K.keepOut(q, 0.006)), t), r: t => w * (1 - 0.55 * t), rows: steps * 2, sides: 4, bones, minor, tip2, name: 'curl' });
}

// ------------------------------------------------------------------------------------------------ the styles
const STYLES = {
  // a tight stubble cap with squared temples; its front is the hairline itself
  buzz(K) {
    const line = th => hairlineY(th) + 0.004 * gauss(Math.abs(th) - 1.0, 0.2);
    K.cap({ line, off: 0.0013, shave: 0.62, segs: 26 });
    return { line };
  },
  // tousled: chunky locks spilling forward and to one side, a short back
  short(K) {
    K.cap({ line: hairlineY });
    for (let i = 0; i < 16; i++) {
      const a = PI * (-1 + 2 * (i + 0.5) / 16), y = 0.205 + 0.012 * Math.cos(a);
      const { p, n } = K.scalp(a, y);
      const dir = Math.cos(a) > 0.5 ? [Math.sin(a) * 0.7 + 0.3, -0.4, 0.6] : [Math.sin(a) * 0.4, -1, Math.cos(a) * 0.4 - 0.2];
      K.lock({ root: p, n, dir, length: 0.056, lift: 0.4, droop: 0.15, w: 0.036, th: 0.008, off: 0.006, steps: 4 });
    }
    for (let i = 0; i < 7; i++) { const a = (K.R() * 2 - 1) * 1.2, { p, n } = K.scalp(a, 0.228); K.lock({ root: p, n, dir: [Math.sin(a) + 0.3, 0.2, -0.5], length: 0.05, lift: 0.6, droop: 0.12, w: 0.032, th: 0.007, off: 0.006, steps: 3 }); }
    fringe(K, [[-0.35, 0.172, 0.06, 0.036, 0.3, 0.1], [0.0, 0.168, 0.066, 0.04, 0.3, 0.12], [0.35, 0.174, 0.06, 0.036, 0.3, 0.14], [0.7, 0.18, 0.05, 0.03, 0.3, 0.1]], { th: 0.01 });
  },
  // a deep part on one side; the hair from it sweeps across the forehead to the other temple
  side_part(K) {
    K.cap({ line: hairlineY, color: (v, a) => cmul(K.col, (0.88 + 0.12 * smooth(0, 0.6, v)) * (1 - 0.35 * gauss(a + 0.55, 0.035) * smooth(0.5, 0.8, v))) });
    for (let i = 0; i < 10; i++) {
      const y = lerp(0.206, 0.239, i / 9), { p, n } = K.scalp(-0.5 + 0.06 * (i / 9), y);
      const target = K.H.at(lerp(0.168, 0.2, i / 9), lerp(1.0, 2.2, (i / 9) ** 1.3), { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.12, lift: 0.24, droop: 0.12, w: 0.034, th: 0.014, off: 0.009, steps: 5, flat: 0.42, minor: i % 3 === 2 });
    }
    for (let i = 0; i < 3; i++) { const a = -0.85 - i * 0.28, { p, n } = K.scalp(a, 0.2); K.lock({ root: p, n, dir: norm(add(K.meridian(a, 0.2), [0, 0, -0.3])), length: 0.06, lift: 0.2, droop: 0.12, w: 0.04, th: 0.009, off: 0.006, steps: 4 }); }
    shortSides(K, { n: 2 });
    shortBack(K, { rows: [[0.2, 7, 0.07], [0.15, 7, 0.055]], nape: 5 });
  },
  // a blunt-cut sheet straight across the brows, sides to the jaw, back to the nape
  bangs(K) {
    K.cap({ line: lineLong });
    curtain(K, { n: 13, from: -0.95, to: 0.95, y: 0.222, end: 0.156, w: 0.034, lift: 0.2, droop: 0.4, steps: 4, taper: 5, out: 0.22, lenK: 1.25, rag: 0.04 });
    curtain(K, { n: 6, from: 1.05, to: 1.85, y: a => hairlineY(a) + 0.02, end: 0.04, w: 0.044, steps: 5, taper: 6, out: 0.15 });
    curtain(K, { n: 6, from: -1.85, to: -1.05, y: a => hairlineY(a) + 0.02, end: 0.04, w: 0.044, steps: 5, taper: 6, out: 0.15 });
    curtain(K, { n: 9, from: 1.95, to: 2 * PI - 1.95, y: 0.19, end: 0.03, w: 0.05, steps: 5, taper: 6, out: 0.12, minor: true });
  },
  // a chin bob: rounded hem all round curling under, and an arched fringe
  bob(K) {
    layeredLong(K, { part: 0.3, crownOnly: true });
    curtain(K, { n: 9, from: -0.85, to: 0.85, y: 0.224, end: a => 0.15 + 0.012 * Math.abs(a), w: 0.036, th: 0.009, lift: 0.18, droop: 0.4, steps: 4, taper: 3, out: 0.2 });
    curtain(K, { n: 16, from: 0.95, to: 2 * PI - 0.95, y: a => Math.max(0.17, hairlineY(a) + 0.03), end: 0.012, w: 0.05, th: 0.011, steps: 5, curl: 0.35, taper: 2.4, out: 0.18, minor: true });
  },
  // centre part; a crown layer with volume, face-framing locks from the part past the temples, layered sides and a
  // long back with broken ends
  long(K) { layeredLong(K, { part: 0, end: [-0.04, -0.1, -0.24] }); return { line: lineLong }; },
  // an off-centre part; the same layers, every hanging lock waving (S-curves that grow toward the ends)
  wavy(K) { layeredLong(K, { part: 0.35, end: [-0.03, -0.09, -0.2], wave: 1.25 }); return { line: lineLong }; },
  // pulled back flat to a low tie, a loose strand by one temple, the tail low on the nape
  ponytail(K) {
    const tie = [0.028, 0.085, -0.104];
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.84 + 0.14 * smooth(0, 0.5, v)) * (0.86 + 0.14 * Math.abs(Math.sin(a * 14 + v * 1.5)))) });     // combed grooves run to the tie
    combTo(K, { n: 16, y: a => lineLong(a) + 0.014, target: tie, w: 0.032, th: 0.005, steps: 6, swell: 1, lift: 0.08 });
    band(K, add(tie, [0, 0, -0.003]), 0.012, [0.1, 0.2, -1], [0.18, 0.15, 0.13]);
    tail(K, add(tie, [0, 0, -0.006]), { n: 10, len: 0.24, spread: [0.05, -0.2, -0.5], fan: 0.15, droop: 0.6, w: 0.04, steps: 6, tip2: null });
    const { p, n } = K.scalp(-1.15, 0.168);
    K.lock({ root: p, n, dir: [0, -1, 0.15], length: 0.12, lift: 0.1, droop: 0.3, w: 0.016, th: 0.006, off: 0.006, steps: 5 });
  },
  // swept UP from the forehead (a high front pouf) to a bun on the back of the crown
  bun(K) {
    const bc = [0, 0.205, -0.112];
    const pouf = (v, a) => 0.004 + 0.016 * Math.max(0, Math.cos(a)) ** 2 * Math.sin(Math.PI * Math.min(1, v * 1.6));
    K.cap({ line: lineLong, off: pouf, color: (v, a) => cmul(K.col, (0.86 + 0.12 * smooth(0, 0.6, v)) * (0.88 + 0.12 * Math.abs(Math.sin(a * 8 + v * 3)))) });
    combTo(K, { n: 12, y: a => lineLong(a) + 0.004, target: add(bc, [0, -0.01, 0.03]), w: 0.034, th: 0.004, steps: 6, swell: 1, lift: 0.1 });
    K.blob({ c: bc, r: [0.036, 0.032, 0.03], rows: 8, segs: 12, grooves: 2, tilt: d => [d[0], d[1] * 0.92 + d[2] * 0.25, d[2] * 0.92 - d[1] * 0.25] });
    band(K, add(bc, [0, -0.002, 0.024]), 0.022, [0, 0.3, 1], [0.18, 0.15, 0.13], 0.005);
  },
  // a straight centre part; each half combed up and out to its own bun high on the side
  buns(K) {
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.88 + 0.12 * smooth(0, 0.6, v)) * (1 - 0.35 * gauss(a, 0.03) * smooth(0.5, 0.85, v))) });
    for (const sg of [-1, 1]) {
      const at = K.scalp(sg * 0.95, 0.214, 0.026).p;
      combTo(K, { n: 6, from: sg > 0 ? 0.08 : -PI + 0.05, to: sg > 0 ? PI - 0.05 : -0.08, y: a => lineLong(a) + 0.004, target: at, w: 0.052, minor: true });
      K.blob({ c: at, r: [0.032, 0.03, 0.032], rows: 8, segs: 12, grooves: 2 });
    }
  },
  // shaved sides; a crest of upright blades from the forehead to the nape, the first curling forward
  mohawk(K) {
    const crest = (v, a) => smooth(0.55, 0.3, Math.abs(Math.sin(a)));
    K.cap({ line: hairlineY, off: (v, a) => 0.0013 + 0.0032 * crest(v, a), color: capColor(K, (v, a) => 1 - crest(v, a)) });
    const N = 11;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), a = t < 0.5 ? 0 : PI, phi = t * PI;              // along the midline, front → crown → nape
      const y = t < 0.5 ? lerp(0.19, 0.24, t * 2) : lerp(0.24, 0.08, (t - 0.5) * 2);
      const { p, n } = K.scalp(t < 0.5 ? 0 : PI, Math.min(0.24, y));
      const fwd = i === 0 ? [0, 0.5, 1] : [0, 1, -0.35 - t * 0.6];
      K.lock({ root: p, n, dir: fwd, length: lerp(0.07, 0.1, Math.sin(PI * t)) * (i === 0 ? 1.1 : 1), lift: 0.9, droop: i === 0 ? 0.18 : 0.05, w: 0.03, th: 0.006, off: 0.01, steps: 4, flat: 0.8, curl: i === 0 ? [0, -0.4, 0.4] : null, across: [1, 0, 0] });
      void phi; void a;
    }
  },
  // the man's messy cut (the test character): shingled petals from the crown out, a fringe to the brows, sides, nape
  spiky(K) {
    K.cap({ line: hairlineY, segs: 28, rows: [0, 0.1, 0.25, 0.45, 0.65, 0.82, 0.94, 1] });     // opus2's male hair
    petals(K, [
      { y: 0.238, n: 7, len: 0.062, lift: 0.65, droop: 0.1, w: 0.05, th: 0.02, up: 0.2 },
      { y: 0.226, n: 11, len: 0.078, lift: 0.7, droop: 0.1, w: 0.05, th: 0.019, up: 0.12 },
      { y: 0.208, n: 12, len: 0.076, lift: 0.6, droop: 0.09, w: 0.044, th: 0.017, up: 0.16 },
      { y: 0.186, n: 13, len: 0.066, lift: 0.4, droop: 0.12, w: 0.04, th: 0.015, up: 0, minor: true },
    ]);
    const fr = [[-0.75, 0.18, 0.046, 0.034], [-0.45, 0.176, 0.054, 0.036], [-0.18, 0.172, 0.058, 0.036], [0.06, 0.166, 0.064, 0.034], [0.3, 0.174, 0.058, 0.036], [0.55, 0.178, 0.05, 0.034], [0.82, 0.183, 0.042, 0.032]];
    for (const [a, ty, L, w] of fr) {
      const y = 0.214 + jitter(K, 0.004), { p, n } = K.scalp(a, y);
      const target = K.H.at(ty, a * 0.8 - 0.12, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(add(target, [0, -0.012, 0.0]), p)), length: L * 1.3, lift: 0.35, droop: 0.3, w: w * 1.15, th: 0.016, off: 0.008, steps: 4, flat: 0.45 });
    }
    shortSides(K);
    for (const sg of [-1, 1]) for (let i = 0; i < 2; i++) {
      const a = sg * (1.95 + i * 0.35), y = 0.17, { p, n } = K.scalp(a, y);
      K.lock({ root: p, n, dir: norm(add(K.meridian(a, y), [0, -0.4, 0])), length: 0.07, lift: 0.32, droop: 0.12, w: 0.04, th: 0.014, off: 0.008, steps: 4, flat: 0.45 });
    }
    shortBack(K);
  },
  // tight curls: a bumpy cap, a row of curls along the hairline, more round the back
  curly(K) {
    const bump = (v, a) => 0.0035 * (Math.sin(a * 9 + v * 11) * Math.sin(a * 5 - v * 13) + 0.6);
    K.cap({ line: hairlineY, off: (v, a) => 0.009 + bump(v, a) * smooth(0, 0.3, v), segs: 30, rows: [0, 0.12, 0.26, 0.4, 0.55, 0.7, 0.84, 0.94, 1], color: (v, a) => cmul(K.col, 0.82 + 0.22 * (Math.sin(a * 9 + v * 11) * 0.5 + 0.5)) });
    for (let i = 0; i < 18; i++) {
      const a = PI * (-1 + 2 * (i + 0.5) / 18), y = hairlineY(a) + 0.008, { p, n } = K.scalp(a, y, 0.006);
      K.lock({ root: p, n, dir: norm(add(K.meridian(a, y), mul(n, 0.6))), length: 0.03, lift: 0.8, droop: 0.05, w: 0.022, th: 0.012, off: 0.006, steps: 4, spiral: 0.9, flat: 0.8, minor: true });
    }
  },
  // a big round volume set back; its front edge is a soft rolled rim where it meets the forehead
  afro(K) {
    const big = (v, a) => 0.004 + 0.062 * smooth(0, 0.45, v) * (0.78 + 0.22 * (1 - Math.cos(a)) / 2) + 0.005 * Math.sin(a * 7 + v * 9) * Math.sin(a * 4 - v * 6) * smooth(0.1, 0.4, v);
    K.cap({ line: a => hairlineY(a) + 0.004, off: big, segs: 26, rows: [0, 0.08, 0.18, 0.3, 0.44, 0.58, 0.72, 0.86, 1], color: (v, a) => cmul(K.col, 0.8 + 0.2 * smooth(0, 0.5, v) + 0.08 * Math.sin(a * 7 + v * 9)) });
  },
  // a zigzag part, smooth wings combed down behind the ears, two braids over the shoulders
  braids(K) {
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.88 + 0.12 * smooth(0, 0.6, v)) * (1 - 0.4 * gauss(a - 0.03 * Math.sin(v * 40), 0.03) * smooth(0.45, 0.8, v))) });
    for (const sg of [-1, 1]) {
      const base = S_(K, sg * 1.95, 0.085, 0.01);
      combTo(K, { n: 8, from: sg > 0 ? 0.05 : -PI + 0.15, to: sg > 0 ? PI - 0.15 : -0.05, y: a => lineLong(a) + 0.004, target: base, w: 0.034, th: 0.004, over: 1.0, steps: 6, swell: 1 });
      const pts = [base, add(base, [sg * 0.025, -0.07, 0.02]), [sg * 0.12, -0.13, 0.03], [sg * 0.12, -0.21, 0.075], [sg * 0.11, -0.3, 0.09]];
      braid(K, pts, { r: 0.012, rows: 14, sides: 6, bones: q => K.bodyW(q) });
    }
  },
  // short and feathery: narrow pointed wisps all lying to one side, pointed sideburns
  pixie(K) {
    K.cap({ line: hairlineY });
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9 - r; i++) {
      const a = lerp(-1.4, 1.2, (i + 0.5) / (9 - r)), y = 0.232 - r * 0.018, { p, n } = K.scalp(a, y);
      const target = K.H.at(0.17 - r * 0.012, a - 0.55, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: 0.06 + r * 0.008, lift: 0.3, droop: 0.15, w: 0.026, th: 0.008, off: 0.008, steps: 4, taper: 1.1, minor: r === 2 });
    }
    for (const sg of [-1, 1]) { const { p, n } = K.scalp(sg * 1.3, 0.165); K.lock({ root: p, n, dir: [0, -1, 0.25], length: 0.045, lift: 0.1, droop: 0.15, w: 0.02, th: 0.006, off: 0.004, steps: 3, taper: 0.9 }); }
    shortBack(K, { rows: [[0.17, 7, 0.05]], nape: 5, napeLen: 0.05 });
  },
  // combed straight back: glossy strands from the hairline over the crown, no fringe
  slicked(K) {
    K.cap({ line: hairlineY, color: (v, a) => cmul(K.col, (0.9 + 0.25 * smooth(0.2, 0.7, v) * Math.abs(Math.sin(a * 11))) * 1) });
    for (let i = 0; i < 13; i++) {
      const a = lerp(-1.25, 1.25, (i + 0.5) / 13), y = hairlineY(a) + 0.006, { p, n } = K.scalp(a, y);
      const target = K.H.at(0.13, PI - a * 0.45, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(K.H.at(0.24, a * 0.5, { noFeatures: true }), p)), length: 0.2, lift: 0.04, droop: 0.1, w: 0.04, th: 0.006, off: 0.005, steps: 6, flat: 0.25, curl: mul(norm(sub(target, p)), 1.1), shade: 1.05, minor: i % 2 === 1 });
    }
    shortBack(K, { rows: [[0.15, 7, 0.06]], nape: 5, napeLen: 0.05 });
  },
  // shaggy: an uneven layered fringe of narrow points, jagged sides to the jaw and a jagged back
  hood_hair(K) {
    K.cap({ line: lineLong });
    for (let i = 0; i < 9; i++) {
      const a = lerp(-0.95, 0.95, (i + 0.5) / 9), { p, n } = K.scalp(a, 0.226);
      const ty = 0.14 + 0.02 * Math.abs(Math.sin(i * 2.3)), target = K.H.at(ty, a * 1.05, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.15, lift: 0.25, droop: 0.3, w: 0.028, th: 0.009, off: 0.008, steps: 4, taper: 1.1 });
    }
    curtain(K, { n: 7, from: 1.0, to: 1.95, y: a => hairlineY(a) + 0.03, end: a => 0.02 + 0.025 * Math.sin(a * 13), w: 0.034, steps: 5, out: 0.2, taper: 1.1 });
    curtain(K, { n: 7, from: -1.95, to: -1.0, y: a => hairlineY(a) + 0.03, end: a => 0.02 + 0.025 * Math.sin(a * 13), w: 0.034, steps: 5, out: 0.2, taper: 1.1 });
    curtain(K, { n: 11, from: 2.05, to: 2 * PI - 2.05, y: 0.2, end: a => -0.01 + 0.03 * Math.sin(a * 11), w: 0.04, steps: 5, out: 0.16, taper: 1.1, minor: true });
  },
  // a bare crown inside a ring of hair, and a short rolled fringe
  tonsure(K) {
    const topY = 0.205;
    K.cap({ line: hairlineY, top: topY, rows: [0, 0.2, 0.45, 0.7, 0.88, 1] });
    // the ring's rolled upper edge
    K.tube({ path: t => { const a = t * PI * 2 - PI, y = topY - 0.002; return S_(K, a, y, 0.004); }, r: [0.0065, 0.005], rows: 24, sides: 5, bones: () => [['head', 1]], capStart: false, capEnd: false, name: 'roll' });
    curtain(K, { n: 9, from: -0.9, to: 0.9, y: 0.2, end: 0.17, w: 0.032, steps: 3, taper: 3, out: 0.2 });
    return { top: 0, topY };
  },
  // wild: jagged locks curling out, and two horns from the temples
  horns_hair(K) {
    K.cap({ line: hairlineY });
    petals(K, [
      { y: 0.232, n: 9, len: 0.08, lift: 0.8, droop: 0.04, w: 0.04, th: 0.016, up: 0.35 },
      { y: 0.205, n: 12, len: 0.085, lift: 0.75, droop: 0.06, w: 0.036, th: 0.014, up: 0.15 },
      { y: 0.17, n: 11, len: 0.07, lift: 0.6, droop: 0.08, w: 0.034, th: 0.013, up: 0, minor: true },
    ], { skipFront: false });
    for (const sg of [-1, 1]) {
      const base = S_(K, sg * 0.62, 0.198, -0.004), dirO = [sg * 0.8, 0.65, 0.12];
      const pts = [base, add(base, mul(norm(dirO), 0.04)), add(base, [sg * 0.06, 0.07, -0.01]), add(base, [sg * 0.07, 0.11, -0.045])];
      K.tube({ path: t => catmull(pts, t), r: t => 0.013 * (1 - t) ** 0.8 + 0.001, rows: 8, sides: 6, color: (t) => cmix([0.78, 0.7, 0.55], [0.35, 0.3, 0.25], t), bones: () => [['head', 1]], capStart: true, name: 'horn' });
    }
  },
  // shaved all round; a long top lifted at the front and swept over to one side and back
  undercut(K) {
    const top = (v, a) => smooth(0.6, 0.85, Math.cos(a) * 0.4 + v);
    K.cap({ line: hairlineY, off: (v, a) => 0.0013 + 0.003 * top(v, a), color: capColor(K, (v, a) => 1 - top(v, a)) });
    for (let i = 0; i < 9; i++) {
      const a = lerp(-0.7, 0.7, (i + 0.5) / 9), y = 0.2 + 0.01 * Math.cos(a), { p, n } = K.scalp(a, y);
      K.lock({ root: p, n, dir: [0.55, 0.55, -0.6], length: 0.13, lift: 0.7, droop: 0.12, w: 0.044, th: 0.012, off: 0.01, steps: 5, flat: 0.35, curl: [0.6, -0.3, -0.2] });
    }
    for (let i = 0; i < 5; i++) { const a = lerp(0.8, 2.6, i / 4) * (i % 2 ? 1 : -1), { p, n } = K.scalp(a, 0.228); K.lock({ root: p, n, dir: norm(add(K.meridian(a, 0.228), [0.3, 0, -0.3])), length: 0.08, lift: 0.4, droop: 0.12, w: 0.044, th: 0.01, off: 0.008, steps: 4, minor: true }); }
  },
  // a high, receded hairline; every groove converges on a small knot on top of the crown
  topknot(K) {
    const kc = [0, 0.246, -0.035];
    K.cap({ line: lineHigh, color: (v, a) => cmul(K.col, (0.86 + 0.12 * smooth(0, 0.6, v)) * (0.86 + 0.16 * Math.abs(Math.sin(a * 10)))) });
    combTo(K, { n: 10, y: a => lineHigh(a) + 0.004, target: add(kc, [0, -0.01, 0]), w: 0.05, minor: true });
    K.blob({ c: kc, r: [0.022, 0.024, 0.022], rows: 7, segs: 10, grooves: 2 });
    band(K, add(kc, [0, -0.018, 0]), 0.015, [0, 1, 0.1], [0.2, 0.16, 0.12], 0.004);
    return { line: lineHigh };
  },
  // the woman's high ponytail (the test character): combed-back sheets to the tie, a fountain tail, a side-swept fringe
  high_ponytail(K) {
    const tie = [0, 0.228, -0.066];
    combTo(K, { n: 12, y: a => lineLong(a) + 0.004, target: tie, w: 0.05, steps: 4 });     // opus2's female hair, as approved
    K.cap({ line: lineLong, segs: 28, rows: [0, 0.1, 0.25, 0.45, 0.65, 0.82, 0.94, 1] });
    band(K, add(tie, [0, 0.004 - 0.006, -0.004 - 0.004]), 0.0125, [0, 1, -0.6], [0.17, 0.17, 0.19], 0.006);
    tail(K, tie, { n: 16, len: 0.27, spread: [0, 0.75, -1.0], fan: 0.22, droop: 0.75, w: 0.046, th: 0.012, steps: 7 });
    for (let i = 0; i < 5; i++) {
      const ang = jitter(K, 1.2), root = add(tie, [Math.sin(ang) * 0.006, 0.008, -0.004]);
      K.lock({ root, n: [0, 1, 0], dir: [Math.sin(ang) * 0.8, 0.8, -0.45 + jitter(K, 0.3)], length: 0.06 + K.R() * 0.03, lift: 0.2, droop: 0.4, w: 0.034, th: 0.01, off: 0.012, steps: 4, bones: K.springW(tie[1]), flat: 0.4, minor: i > 2 });
    }
    const bang = (a, y, target, L, w, droop = 0.1, lift = 0.35) => { const { p, n } = K.scalp(a, y); K.lock({ root: p, n, dir: norm(sub(target, p)), length: L, lift, droop, w, th: 0.009, off: 0.006, steps: 5, flat: 0.35 }); };
    bang(0.5, 0.228, [-0.035, 0.18, 0.112], 0.09, 0.046, 0.05, 0.3);
    bang(0.32, 0.23, [-0.075, 0.168, 0.095], 0.12, 0.044, 0.08, 0.3);
    bang(0.12, 0.228, [-0.095, 0.12, 0.06], 0.17, 0.038, 0.16, 0.28);
    bang(-0.1, 0.222, [-0.094, 0.07, 0.04], 0.18, 0.03, 0.22, 0.3);
    bang(0.7, 0.218, [0.05, 0.175, 0.1], 0.07, 0.032, 0.08, 0.4);
    bang(0.25, 0.232, [0.02, 0.19, 0.11], 0.07, 0.05, 0.05, 0.25);
    for (const sg of [-1, 1]) {
      bang(sg * 1.12, 0.195, [sg * 0.1, sg < 0 ? -0.005 : 0.01, 0.018], sg < 0 ? 0.2 : 0.18, 0.03, 0.32, 0.1);
      bang(sg * 1.3, 0.185, [sg * 0.102, 0.02, -0.014], 0.17, 0.028, 0.32, 0.09);
      bang(sg * 1.5, 0.18, [sg * 0.09, 0.03, -0.04], 0.15, 0.026, 0.3, 0.06);
      bang(sg * 0.95, 0.205, [sg * 0.085, 0.09, 0.06], 0.12, 0.026, 0.22, 0.2);
    }
    bang(0.7, 0.212, [0.075, 0.1, 0.07], 0.12, 0.026, 0.2, 0.15);
    return { line: lineLong };
  },
  // a sawtooth fringe; two tails tied high on the sides (colour 2 on the tips)
  twin_tails(K) {
    K.cap({ line: lineLong });
    for (let i = 0; i < 8; i++) {
      const a = lerp(-0.9, 0.9, (i + 0.5) / 8), { p, n } = K.scalp(a, 0.224), target = K.H.at(i % 2 ? 0.16 : 0.148, a, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.2, lift: 0.2, droop: 0.3, w: 0.036, th: 0.009, off: 0.008, steps: 4, taper: 1.0 });
    }
    for (const sg of [-1, 1]) {
      const tie = S_(K, sg * 1.62, 0.2, 0.012);
      combTo(K, { n: 6, from: sg > 0 ? 0.3 : -PI + 0.2, to: sg > 0 ? PI - 0.2 : -0.3, y: a => lineLong(a) + 0.004, target: tie, w: 0.05, minor: true });
      band(K, tie, 0.012, [sg, 0.25, 0], [0.75, 0.2, 0.3], 0.006);
      tail(K, tie, { n: 10, len: 0.25, spread: [sg * 0.55, 0.15, -0.4], fan: 0.14, droop: 0.85, w: 0.03, th: 0.011, steps: 6, curl: [sg * 0.05, 0, -0.15], tip2: 0.6 });
    }
  },
  // just out of bed: cowlicks flicking UP at the front in every direction, tufts round the crown
  messy(K) {
    K.cap({ line: hairlineY });
    petals(K, [
      { y: 0.235, n: 8, len: 0.06, lift: 0.85, droop: -0.02, w: 0.04, th: 0.015, up: 0.4 },
      { y: 0.215, n: 12, len: 0.07, lift: 0.7, droop: 0.04, w: 0.04, th: 0.014, up: 0.2 },
      { y: 0.185, n: 12, len: 0.06, lift: 0.5, droop: 0.1, w: 0.036, th: 0.012, minor: true },
    ]);
    for (let i = 0; i < 7; i++) {
      const a = lerp(-0.85, 0.85, (i + 0.5) / 7), { p, n } = K.scalp(a, 0.2);
      K.lock({ root: p, n, dir: [Math.sin(a) * 0.8 + jitter(K, 0.5), -0.2, 0.9], length: 0.055, lift: 0.5, droop: -0.25, w: 0.032, th: 0.01, off: 0.01, steps: 4, curl: [jitter(K, 0.5), 0.6, 0] });
    }
    shortBack(K, { rows: [[0.16, 8, 0.055]], nape: 5 });
  },
  // the quiff: a rolled volume swept up and back over the forehead, short sides
  pompadour(K) {
    const top = (v, a) => smooth(0.55, 0.8, Math.cos(a) * 0.35 + v * 0.9);
    K.cap({ line: hairlineY, off: (v, a) => 0.002 + 0.004 * top(v, a), color: capColor(K, (v, a) => (1 - top(v, a)) * 0.7) });
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) {
      const a = lerp(-0.75, 0.75, (i + 0.5) / 7), { p, n } = K.scalp(a, 0.19 + r * 0.02);
      K.lock({ root: p, n, dir: [0, 1, 0.8 - r * 0.4], length: 0.075, lift: 0.3, droop: -0.02, w: 0.036, th: 0.014, off: 0.012, steps: 5, curl: [0, -0.2, -1.8], flat: 0.4, minor: r === 1 && i % 2 === 1 });
    }
    shortBack(K, { rows: [[0.19, 7, 0.07], [0.15, 6, 0.05]], nape: 4 });
  },
  // locs: short ones fall over the temples, the rest hang round the back to the shoulders (colour 2 on the tips)
  locs(K) {
    K.cap({ line: lineLong, off: 0.006 });
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = PI * (-1 + 2 * (i + 0.5) / n) + jitter(K, 0.03), y = Math.max(0.19, lineLong(a) + 0.02), { p, n: nn } = K.scalp(a, y);
      const front = Math.cos(a) > 0.4;
      const L = front ? 0.09 : lerp(0.17, 0.32, smooth(1.2, 2.6, Math.abs(a)));
      K.lock({ root: p, n: nn, dir: norm(add(K.meridian(a, y), mul(nn, 0.2))), length: L, lift: 0.4, droop: 0.6, w: 0.011, th: 0.011, off: 0.01, steps: front ? 4 : 6, sides: 4, taper: 5, swell: 0, tip2: 0.75, bones: (q, t) => K.looseW(q, t), minor: !front && i % 3 === 1 });
    }
  },
  // a French braid from the forehead over the crown, carried on as one braid down the back (colour 2 at the end)
  long_braid(K) {
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.88 + 0.12 * smooth(0, 0.6, v)) * (0.9 + 0.1 * Math.abs(Math.sin(a * 7)))) });
    const top = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6, a = t < 0.5 ? 0 : PI, y = t < 0.5 ? lerp(0.205, 0.241, t * 2) : lerp(0.241, 0.075, (t - 0.5) * 2); top.push(S_(K, a, Math.min(0.2405, y), 0.002)); }
    const down = [[0, -0.02, -0.122], [0, -0.13, -0.13], [0, -0.25, -0.13], [0, -0.36, -0.12]];
    braid(K, [...top, ...down], { r: 0.013, rows: 22, sides: 6, tip2: 0.85, bones: (q) => q[1] > 0.06 ? [['head', 1]] : K.springW(0.07)(q), crossings: 30, sink: 0.55 });
  },
  // a short flat-top brush at the front, long at the back
  mullet(K) {
    K.cap({ line: hairlineY });
    petals(K, [{ y: 0.232, n: 9, len: 0.045, lift: 0.8, droop: 0.02, w: 0.036, th: 0.012, up: 0.55 }, { y: 0.214, n: 10, len: 0.045, lift: 0.7, droop: 0.05, w: 0.036, th: 0.012, up: 0.4 }], { skipFront: false });
    shortSides(K, { n: 2, len: 0.05 });
    curtain(K, { n: 10, from: 1.9, to: 2 * PI - 1.9, y: 0.17, end: -0.13, w: 0.05, steps: 6, out: 0.16 });
  },
  // one big swoop from one temple across the forehead to the other
  side_swept(K) {
    K.cap({ line: hairlineY });
    for (let i = 0; i < 6; i++) {
      const a = 1.0 - i * 0.16, { p, n } = K.scalp(a, 0.235 - i * 0.004), target = K.H.at(0.165 - i * 0.008, -0.6 - i * 0.12, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.25, lift: 0.3, droop: 0.18, w: 0.05, th: 0.012, off: 0.01, steps: 5, flat: 0.35 });
    }
    shortSides(K, { n: 2 });
    shortBack(K, { rows: [[0.2, 7, 0.07], [0.16, 7, 0.055]], nape: 5 });
  },
  // a braid wrapped round the head like a circlet, the hair pulled smooth under it
  crown_braid(K) {
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.86 + 0.12 * smooth(0, 0.6, v)) * (0.88 + 0.12 * Math.abs(Math.sin(a * 9)))) });
    const ringY = a => lerp(0.205, 0.15, (1 - Math.cos(a)) / 2);
    K.tube({ path: t => S_(K, t * PI * 2 - PI, ringY(t * PI * 2 - PI), 0.011), r: 0.012, rows: 22, sides: 6, braid: 30, bones: () => [['head', 1]], capStart: false, capEnd: false, name: 'crownBraid' });
  },
  // one side shaved; the long top flops over to the other side past the ear
  side_shave(K) {
    const shaved = (v, a) => smooth(-0.3, -0.6, Math.sin(a)) * (1 - smooth(0.75, 0.95, v));
    K.cap({ line: hairlineY, off: (v, a) => 0.0013 + 0.003 * (1 - shaved(v, a)), color: capColor(K, shaved) });
    for (let i = 0; i < 9; i++) {
      const a = lerp(-0.5, 1.2, (i + 0.5) / 9), { p, n } = K.scalp(a, 0.236 - 0.005 * i), target = K.H.at(0.09 + i * 0.006, 1.75 + 0.1 * i, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.15, lift: 0.3, droop: 0.25, w: 0.04, th: 0.011, off: 0.009, steps: 6, flat: 0.35 });
    }
    curtain(K, { n: 6, from: 1.6, to: 2.8, y: 0.2, end: 0.05, w: 0.045, steps: 5, out: 0.15, minor: true });
  },
  // choppy layers: a heavy fringe in V points, shaggy crown flicks, jagged spikes flaring at the nape
  wolf_cut(K) {
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.86 + 0.12 * smooth(0, 0.6, v)) * (0.9 + 0.1 * Math.abs(Math.sin(a * 11)))) });
    petals(K, [{ y: 0.234, n: 8, len: 0.06, lift: 0.7, droop: 0.06, w: 0.04, th: 0.013, up: 0.25 }, { y: 0.21, n: 11, len: 0.07, lift: 0.55, droop: 0.12, w: 0.038, th: 0.012, minor: true }]);
    for (let i = 0; i < 8; i++) {
      const a = lerp(-0.9, 0.9, (i + 0.5) / 8), { p, n } = K.scalp(a, 0.22), target = K.H.at(0.15 - (i % 2) * 0.01, a, { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.2, lift: 0.25, droop: 0.3, w: 0.034, th: 0.01, off: 0.008, steps: 4, taper: 1.0 });
    }
    for (const sg of [-1, 1]) curtain(K, { n: 5, from: sg > 0 ? 1.05 : -1.9, to: sg > 0 ? 1.9 : -1.05, y: a => hairlineY(a) + 0.03, end: 0.03, w: 0.036, steps: 5, out: 0.25, taper: 1.0, flick: 0.4 });
    curtain(K, { n: 9, from: 2.0, to: 2 * PI - 2.0, y: 0.19, end: -0.04, w: 0.04, steps: 5, out: 0.2, flick: 0.5, taper: 1.0, minor: true });
  },
  // the top half gathered in a small knot at the back; temple strands tucked behind the ears; the rest falls loose
  half_up(K) {
    const kc = [0, 0.19, -0.115];
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.86 + 0.12 * smooth(0, 0.6, v)) * (0.88 + 0.12 * Math.abs(Math.sin(a * 9 + v * 2)))) });
    combTo(K, { n: 12, from: -1.3, to: 1.3, y: a => lineLong(a) + 0.01, target: add(kc, [0, 0, 0.02]), w: 0.034, th: 0.007, steps: 6, swell: 1, lift: 0.16 });
    for (const sg of [-1, 1]) curtain(K, { n: 2, from: sg * 1.05, to: sg * 1.3, y: a => hairlineY(a) + 0.01, end: 0.02, w: 0.03, steps: 6, out: 0.1 });
    K.blob({ c: kc, r: [0.022, 0.02, 0.018], rows: 6, segs: 10, grooves: 2 });
    curtain(K, { n: 13, from: 1.5, to: 2 * PI - 1.5, y: a => Math.max(0.15, hairlineY(a) + 0.01), end: -0.15, w: 0.052, steps: 6, out: 0.15, minor: true });
  },
  // a split fringe (two short side bangs, the middle of the forehead clear); two buns with loops of hair under them
  ribbon_loops(K) {
    K.cap({ line: lineLong });
    for (const sg of [-1, 1]) {
      for (let i = 0; i < 2; i++) { const a = sg * (0.45 + i * 0.22), { p, n } = K.scalp(a, 0.222), target = K.H.at(0.15, sg * (0.7 + i * 0.25), { noFeatures: true }); K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.2, lift: 0.25, droop: 0.25, w: 0.034, th: 0.009, off: 0.008, steps: 4 }); }
      const at = S_(K, sg * 1.7, 0.2, 0.026);
      K.blob({ c: at, r: [0.028, 0.028, 0.028], rows: 7, segs: 10, grooves: 2 });
      const loop = t => add(at, [sg * (0.012 + 0.03 * Math.sin(PI * t)), -0.02 - 0.07 * Math.sin(PI * t * 0.5) * (1 - t * 0.3), -0.02 * Math.sin(PI * t)]);
      K.tube({ path: loop, r: 0.009, rows: 10, sides: 5, bones: K.springW(0.2, 0.6), name: 'loop' });
      band(K, add(at, [0, -0.02, 0.004]), 0.016, [0, 1, 0], [0.82, 0.22, 0.32], 0.007);
    }
    curtain(K, { n: 8, from: 2.2, to: 2 * PI - 2.2, y: 0.17, end: 0.05, w: 0.05, steps: 4, out: 0.15, minor: true });
  },
  // rows braided flat from the hairline to the nape, scalp showing dark between them
  cornrows(K) {
    K.cap({ line: hairlineY, off: 0.0014, shave: 0.75 });
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a0 = lerp(-1.15, 1.15, i / (N - 1));
      const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, a = lerp(a0, PI - a0 * 0.35, smooth(0.3, 1, t)) * (1 - 0) , y = t < 0.35 ? lerp(hairlineY(a0) + 0.005, 0.238, t / 0.35) : lerp(0.238, 0.08, (t - 0.35) / 0.65); pts.push(S_(K, a, Math.min(0.239, y), 0.004)); }
      K.tube({ path: t => catmull(pts, t), r: [0.0075, 0.005], rows: 9, sides: 4, bones: () => [['head', 1]], keep: false, name: 'row', color: (t, a) => cmul(K.col, 0.75 + 0.35 * Math.abs(Math.sin(t * 38 + (Math.cos(a) > 0 ? 0 : 1.57)))) });
    }
  },
  // shaved sides, a widow's peak and a ridge of hair over the top, three beaded braids down the back
  warrior_braids(K) {
    const ridge = (v, a) => smooth(0.5, 0.3, Math.abs(Math.sin(a)));
    K.cap({ line: lineWidow, off: (v, a) => 0.0013 + 0.005 * ridge(v, a), color: capColor(K, (v, a) => 1 - ridge(v, a)) });
    for (const dx of [-0.032, 0, 0.032]) {
      const base = [dx, 0.1, -0.106];
      const pts = [base, [dx * 1.1, 0.02, -0.12], [dx * 1.2, -0.08, -0.128], [dx * 1.2, -0.2, -0.126]];
      braid(K, pts, { r: 0.0085, rows: 12, sides: 5, bones: K.springW(0.1), tie: false, crossings: 34, minor: dx !== 0 });
      if (!K.lod) for (const t of [0.55, 0.85]) { const c = catmull(pts, t); K.blob({ c, r: [0.009, 0.007, 0.009], rows: 4, segs: 6, color: () => [0.75, 0.6, 0.3], bones: K.springW(0.1), name: 'bead' }); }
    }
    return { line: lineWidow };
  },
  // a centre part; layers feathered out and BACK at the temples like wings, flicking out at the jaw
  feathered(K) {
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.88 + 0.12 * smooth(0, 0.6, v)) * (1 - 0.3 * gauss(a, 0.03) * smooth(0.55, 0.85, v))) });
    for (const sg of [-1, 1]) for (let i = 0; i < 5; i++) {
      const a = sg * (0.1 + i * 0.17), { p, n } = K.scalp(a, 0.228 - i * 0.007), target = K.H.at(0.15 - i * 0.012, sg * (1.35 + i * 0.14), { noFeatures: true });
      K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.15, lift: 0.45, droop: 0.12, w: 0.032, th: 0.014, off: 0.012, steps: 5, curl: [sg * 0.25, 0.25, -0.45], flat: 0.45, minor: i === 4 });
    }
    curtain(K, { n: 12, from: 1.3, to: 2 * PI - 1.3, y: a => Math.max(0.15, hairlineY(a) + 0.02), end: 0.0, w: 0.046, steps: 5, out: 0.22, flick: 0.55, minor: true });
  },
  // corkscrew curls round the head to the chin, a few short ones over the forehead
  curly_bob(K) {
    const bump = (v, a) => 0.003 * (Math.sin(a * 8 + v * 10) * Math.sin(a * 5 - v * 12) + 0.6);
    K.cap({ line: lineLong, off: (v, a) => 0.012 + bump(v, a) * smooth(0, 0.3, v), segs: 26, color: (v, a) => cmul(K.col, 0.82 + 0.2 * (Math.sin(a * 8 + v * 10) * 0.5 + 0.5)) });
    for (let i = 0; i < 16; i++) {
      const a = PI * (-1 + 2 * (i + 0.5) / 16), front = Math.cos(a) > 0.55;
      const y = front ? 0.2 : Math.max(0.15, lineLong(a) + 0.03), { p, n } = K.scalp(a, y, 0.012);
      corkscrew(K, p, n, { len: front ? 0.04 : Math.max(0.05, y - 0.02), r: 0.009, turns: front ? 1.3 : 2.6, w: 0.012, steps: front ? 4 : 6, bones: q => K.bodyW(q), minor: !front && i % 2 === 1 });
    }
  },
  // sides pulled up tight to a round puff on top tied with a band; little swirled baby hairs at the temples
  puff(K) {
    const pc = [0, 0.268, -0.02];
    K.cap({ line: hairlineY, off: 0.003, color: (v, a) => cmul(K.col, (0.86 + 0.12 * smooth(0, 0.6, v)) * (0.85 + 0.17 * Math.abs(Math.sin(a * 12)))) });
    K.blob({ c: pc, r: [0.07, 0.06, 0.068], rows: 9, segs: 14, bumps: (a, v) => 0.06 * Math.sin(a * 7 + v * 9) * Math.sin(a * 4 - v * 7) });
    band(K, add(pc, [0, -0.05, 0]), 0.034, [0, 1, 0], [0.82, 0.35, 0.3], 0.007);
    for (const sg of [-1, 1]) { const { p, n } = K.scalp(sg * 1.0, 0.16, 0.002); K.lock({ root: p, n, dir: [0, -0.6, 1], length: 0.025, lift: 0.1, droop: 0, w: 0.012, th: 0.003, off: 0.002, steps: 3, spiral: 1.2, keep: false }); }
  },
  // two rolls laid across the top on either side of a part, a low tail over one shoulder
  rolled_tail(K) {
    K.cap({ line: lineLong, color: (v, a) => cmul(K.col, (0.88 + 0.12 * smooth(0, 0.6, v)) * (1 - 0.35 * gauss(a, 0.03) * smooth(0.5, 0.85, v))) });
    for (const sg of [-1, 1]) {
      const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, a = sg * lerp(0.35, 1.6, t ** 1.4), y = lerp(0.215, 0.165, t); pts.push(S_(K, a, y, 0.014)); }
      K.tube({ path: t => catmull(pts, t), r: t => 0.016 * (1 - 0.35 * t), rows: 10, sides: 6, twist: 10, bones: () => [['head', 1]], name: 'roll', color: (t, a) => cmul(K.col, 0.85 + 0.2 * Math.abs(Math.sin(a * 2 + t * 12))) });
    }
    const tie = [0.05, 0.07, -0.1];
    combTo(K, { n: 8, from: 1.7, to: 2 * PI - 1.7, y: 0.17, target: tie, w: 0.05, minor: true });
    band(K, tie, 0.012, [0.3, 0.3, -1], [0.2, 0.16, 0.13]);
    const pts = [tie, [0.11, 0.0, -0.08], [0.15, -0.08, 0.0], [0.14, -0.18, 0.08], [0.12, -0.28, 0.1]];
    K.tube({ path: t => catmull(pts, t), r: t => 0.02 * (1 - 0.6 * t ** 2), rows: 12, sides: 6, keep: true, off: 0.024, bones: q => K.bodyW(q), name: 'tail', twist: 6 });
  },
  // a bowl cut: an even cap with a thick rounded rim right round its edge, at the brow line in front
  bowl(K) {
    const line = th => Math.max(hairlineY(th) - 0.035 * Math.max(0, Math.cos(th)), lerp(0.155, 0.105, smooth(0.2, 2.2, Math.abs(th))));
    K.cap({ line, off: v => 0.006 + 0.007 * smooth(0, 0.2, v), segs: 28 });
    K.tube({ path: t => { const a = t * PI * 2 - PI; return S_(K, a, line(a) + 0.003, 0.01); }, r: [0.009, 0.007], rows: 28, sides: 6, bones: () => [['head', 1]], capStart: false, capEnd: false, name: 'rim' });
    return { line };
  },
  // straight cheek-length sidelocks before the ears, a sparse fringe of separate wisps, a long straight back
  court_cut(K) {
    layeredLong(K, { part: 0, crownOnly: true });
    for (let i = 0; i < 5; i++) { const a = lerp(-0.7, 0.7, (i + 0.5) / 5), { p, n } = K.scalp(a, 0.218), target = K.H.at(0.16, a, { noFeatures: true }); K.lock({ root: p, n, dir: norm(sub(target, p)), length: len(sub(target, p)) * 1.2, lift: 0.2, droop: 0.3, w: 0.016, th: 0.006, off: 0.007, steps: 4 }); }
    for (const sg of [-1, 1]) curtain(K, { n: 3, from: sg > 0 ? 1.08 : -1.3, to: sg > 0 ? 1.3 : -1.08, y: a => hairlineY(a) + 0.01, end: 0.075, w: 0.03, steps: 5, out: 0.08, taper: 6 });
    curtain(K, { n: 11, from: 1.75, to: 2 * PI - 1.75, y: 0.2, end: -0.26, w: 0.056, steps: 7, out: 0.12, taper: 5, minor: true });
  },
};
