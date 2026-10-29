// Kestrel kit — the HAT toolkit (batch 3). Every hat in hats.js is written with these builders; each one returns
// parametric surface specs (geo.js MeshBuilder.surface) in BIND space, like the hair and the garments, so a hat is merged
// into the character's one draw call.
//
//   const K = hatKit(P, { lod, body });     // body = { neck, torso } parts (body.js) for anything that reaches the neck
//   K.shell({ rim, clear, bulge, … })       // a dome fitted to the skull from a rim line up to the crown (caps, helms)
//   K.plate({ t0, t1, top, bot, … })        // a curved plate on the skull with a turned edge (cheek guards, visors, tails)
//   K.lathe({ rows, fitY, … })              // a revolved profile on the skull's own oval (a top hat's crown, a cone)
//   K.brim({ y, width, lift, … })           // a flat ring with real thickness and a rolled edge (hat brims)
//   K.tube({ path, r, … }) / K.blob({ c, r, … }) / K.loop({ y, … })   // horns, feathers, bands, studs, gems
//   K.drape({ top, hem, gap, … })           // cloth or mail laid on the head, neck and shoulders WITH THEIR SKIN WEIGHTS
//   K.parts, K.raws                          // what to hand to kestrel.js's add() (raws: emblem triangles, hat-build.js)
//
// HEAD SPACE (face.js): metres for a 0.24 m head, y up from the chin (crown 0.2415), +z forward, θ = 0 at the nose,
// +π/2 the character's +x side. A shell point is found along a RAY from C0 (on the head's axis at mid height), so "how
// far off the skull" is the same measure the no-poke test uses: the hair under a hat stands ≤ 4 mm off the skull
// (hair-kit.js re-roots and presses it), so a fitted piece clears it at CLEAR = 7.5 mm (LOD 1: +4.5 mm, geo.js's garment
// rule — every hat surface carries an `offset` so lodSpec treats it as a garment).
import { clamp, lerp, smooth, gauss, add, sub, mul, norm, cross, dot, len, cmul, cmix, hexLin } from './kmath.js';
import { makeHeadSurface, headToWorld, headWeights, headWarp } from './face.js';

const PI = Math.PI, TAU = PI * 2;
export const CROWN = 0.2415;
export const HAT_C0 = [0, 0.118, 0];
export const CLEAR = 0.0075;
/** No hat vertex comes nearer the skin than this along its ray (the hair under a hat reaches ~5.5 mm at the nape). */
export const KEEP_OFF = 0.0062;
const NO_OFF = () => 0;

/** linear colour from hex, a little richer (the kit's palette is graded; Chibi's raw hat colours read flat on it) */
export function hatColor(hex, fallback = '#777777', sat = 1.12) {
  const c = hexLin(hex || fallback, fallback), L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [Math.max(0, L + (c[0] - L) * sat), Math.max(0, L + (c[1] - L) * sat), Math.max(0, L + (c[2] - L) * sat)];
}
export const tone = (c, k) => cmul(c, k);
export const lift = (c, k) => cmix(c, [1, 1, 1], k);

export function hatKit(P, { lod = 0, body = null, lean = 0 } = {}) {
  const H = makeHeadSurface(P), S = H.S;
  const W = p => headToWorld(P, p);
  const C = HAT_C0;
  const parts = [], raws = [];
  const headW = () => [['head', 1]];
  const lodK = lod ? 0.6 : 1;
  // lean (hat-build.js budget): 1 = fewer columns and no small pieces, 2 = fewer still
  const LK = [1, 0.75, 0.56, 0.42][lean] || 0.42;
  const nseg = (n, min = 6) => Math.max(lean >= 3 ? Math.round(min * 0.7) : min, Math.round(n * (lod ? 0.75 : 1) * LK));
  const dirOf = (th, e) => { const ce = Math.cos(e); return [ce * Math.sin(th), Math.sin(e), ce * Math.cos(th)]; };

  // ---- the skull, asked along rays from C0 (features on the front of the face: brow ridge, cheekbones)
  const skullHR = (y, th) => {
    const yy = clamp(y, 0, CROWN - 1e-4);
    const s = H.at(yy, th, { noFeatures: !(Math.cos(th) > 0.15 && yy < 0.19) });
    return Math.hypot(s[0], s[2]);
  };
  const cache = new Map();
  /** Distance from C0 to the skin along the ray (θ, e). */
  function tSkull(th, e) {
    const key = Math.round(th * 4000) * 1e5 + Math.round(e * 4000);
    const hit = cache.get(key); if (hit !== undefined) return hit;
    const d = dirOf(th, e);
    let lo = 0, hi = 0.2;
    for (let i = 0; i < 17; i++) {
      const m = (lo + hi) / 2, y = C[1] + d[1] * m, r = Math.hypot(d[0] * m, d[2] * m);
      if (y < CROWN && r < skullHR(y, th)) lo = m; else hi = m;
    }
    const t = (lo + hi) / 2; cache.set(key, t); return t;
  }
  /** The elevation (from C0) of the skin point at head height y on bearing θ. */
  const eAt = (th, y) => Math.atan2(y - C[1], skullHR(y, th));
  /** A point `off` outside the skin on the ray (θ, e). */
  const onRay = (th, e, off) => { const d = dirOf(th, e), t = tSkull(th, e) + off; return [C[0] + d[0] * t, C[1] + d[1] * t, C[2] + d[2] * t]; };
  /**
   * The elevation whose ray point `off` outside the skin is at head height y (a ray from C0 slopes, steeply at the back
   * and the nape: moving 3 cm out along it also drops 2 cm — so the elevation is corrected until the point is at y).
   */
  const eOff = (th, y, off) => {
    let e = eAt(th, y);
    if (off) for (let i = 0; i < 4; i++) { const t = tSkull(th, e) + off, py = C[1] + Math.sin(e) * t; e = clamp(e + (y - py) / (t * Math.max(0.2, Math.cos(e))), -1.45, PI / 2); }
    return e;
  };
  /** A point `off` outside the skin at head height y on bearing θ (at that height). */
  const atY = (th, y, off) => onRay(th, eOff(th, y, off), off);
  /** Outward unit vector of the skin at (θ, y) (finite differences on the ray surface). */
  const normalY = (th, y) => {
    const e = 0.004, a = atY(th, y + e, 0), b = atY(th, y - e, 0), c = atY(th + 0.03, y, 0), d = atY(th - 0.03, y, 0);
    let n = norm(cross(sub(c, d), sub(a, b)));
    if (dot(n, sub(atY(th, y, 0), C)) < 0) n = mul(n, -1);
    return n;
  };

  // ---- common surface settings
  /** Push a head-space point out along its ray from C0 until it is KEEP_OFF past the skin (above the jaw line only). */
  const keepOff = hp => {
    if (hp[1] < 0.03) return hp;
    const v = sub(hp, C), L = len(v); if (L < 1e-6) return hp;
    const th = Math.atan2(v[0], v[2]), e = Math.asin(clamp(v[1] / L, -1, 1)), t = tSkull(th, e) + KEEP_OFF;
    return L >= t ? hp : add(C, mul(v, t / L));
  };
  const finish = (spec, { color, rough = 0.6, metal = false, glow = 0, shade = 0.3, ao = 0.4, weights = headW, name = 'hat', minor = false, free = false }) => {
    if ((lod || lean) && minor) return null;
    const col = typeof color === 'function' ? color : () => color;
    const s = {
      name, offset: NO_OFF, ...spec,
      color: (u, th, p, smp) => col(smp.u ?? u, smp.th ?? th, smp.hp, smp),
      mask: 0,
      rough: metal ? 0.34 : rough, glow: metal ? -0.55 : glow, shade, ao, aoScale: 0.012,
    };
    const at = spec.at;
    // every vertex is kept KEEP_OFF outside the skin (a crown leaning with its hat, a feather's root, a horn's base);
    // drapes (which carry the neck's / chest's weights and lie below the jaw) are laid off the skin by their own gap
    s.at = (u, th) => { const r = at(u, th); if (!free && !r.p) { const k = keepOff(r.hp); if (k !== r.hp) { r.hp = k; } } return { p: r.p || W(r.hp), w: r.w || weights(r.hp, u, th), hp: r.hp, u, th: r.th ?? th }; };
    parts.push(s);
    return s;
  };

  // ------------------------------------------------------------------------------------------------ shell
  /**
   * A dome over the skull: rim(θ) = its lower edge (head-space y), up to the crown (`top` = an elevation to stop at for
   * an open band). clear(v, θ) / bulge(v, θ, e) = how far off the skin (v = 0 at the rim … 1 at the top). `lip` gives the
   * edge a rolled, turned-under thickness (so nobody sees a paper edge or into the hat). rowsV = the v rows.
   */
  function shell({ rim, top = PI / 2, clear = CLEAR, bulge = null, rowsV = null, rows = 8, segs = 30, lip = 0.005, lipIn = 0.0066, ease = 0.9, from = null, to = null, ...look }) {
    const vs = rowsV || Array.from({ length: rows + 1 }, (_, i) => i / rows);
    const pole = top >= PI / 2 - 1e-4;
    const us = lip ? [-1, -0.5, ...vs] : vs;
    const open = from != null;
    const off = (v, th, e) => clear + (bulge ? bulge(v, th, e) : 0);
    return finish({
      us, segs: nseg(segs, 10), capEnd: pole, wrap: !open, t0: from ?? 0, t1: to ?? TAU,
      theta: open ? undefined : (j, n) => j / n * TAU - PI,
      out: (p) => sub(p, W([0, C[1] * 0.6, 0])),
      at(u, th) {
        const y0 = rim(th), eR = eOff(th, y0, off(0, th, eAt(th, y0)));   // the outer edge sits AT the rim height
        if (u < 0) {
          // the turned edge: the bottom of the roll, then back in under the hat to just outside the hair
          if (u === -0.5) return { hp: atY(th, y0 - lip * 0.45, (off(0, th, eR) + lipIn) * 0.5 + lip * 0.2) };
          return { hp: atY(th, y0 + lip * 0.5, lipIn) };
        }
        const e = lerp(eR, top, Math.pow(u, ease));
        return { hp: onRay(th, e, off(u, th, e)) };
      },
    }, look);
  }

  // ------------------------------------------------------------------------------------------------ plate
  /**
   * A plate on the skull between bearings t0..t1, from top(θ) down to bot(θ) (head-space y), `clear` off the skin
   * (clear(s, θ) may vary down the plate), `thick` thick with a turned lower edge (outer face, the edge, inner face).
   */
  function plate({ t0, t1, top, bot, clear = CLEAR, thick = 0.004, rows = 5, segs = 6, flare = null, ...look }) {
    segs = Math.round(segs * 1.5);       // a plate's lower edge follows a curve: enough columns that the chords stay on it
    const cl = typeof clear === 'function' ? clear : () => clear;
    // rows by index: 0..n the outer face top → bottom, n+1 the turned edge, n+2..2n+2 the inner face bottom → top
    const n = Math.min(rows, 5), us = Array.from({ length: 2 * n + 3 }, (_, i) => i);
    return finish({
      us, segs: nseg(segs, 3), wrap: false, t0, t1,
      out: (p, u) => { const q = sub(p, W([0, C[1], 0])); return u > n + 1 ? mul(q, -1) : q; },
      at(k, th0) {
        const th = Math.atan2(Math.sin(th0), Math.cos(th0));
        const yT = typeof top === 'function' ? top(th) : top, yB = typeof bot === 'function' ? bot(th) : bot;
        const o = s => cl(s, th) + (flare ? flare(s, th) : 0);
        if (k <= n) { const s = k / n; return { hp: atY(th, lerp(yT, yB, s), o(s)) }; }
        if (k === n + 1) return { hp: atY(th, yB - thick * 0.45, o(1) - thick * 0.5) };
        const s = 1 - (k - n - 2) / n;
        return { hp: atY(th, lerp(yT, yB, s), o(s) - thick) };
      },
    }, look);
  }

  // ------------------------------------------------------------------------------------------------ lathe
  /** The skull's own oval at height fy, `clear` out: radius on bearing θ (a crown keeps the head's shape, not a circle). */
  const ringR = (th, fy, clear = CLEAR) => skullHR(fy, th) + clear;
  /**
   * A revolved profile: rows = [[y, k, dz, dx]…] — at height y the section is the skull's oval at `fitY` scaled by k
   * (k = 0 closes it), its centre moved by dz / dx. `closeTop` / `closeBot` collapse the end rows to poles.
   */
  function lathe({ rows, fitY, clear = CLEAR, segs = 26, capStart = false, capEnd = false, tilt = null, ...look }) {
    const us = rows.map((_, i) => i);
    return finish({
      us, segs: nseg(segs, 10), capStart, capEnd,
      theta: (j, n) => j / n * TAU - PI,
      out: (p, u) => { const r = rows[Math.round(u)]; const c = W([r[3] || 0, r[0], r[2] || 0]); return sub(p, c); },
      at(u, th) {
        const [y, k, dz = 0, dx = 0] = rows[Math.round(u)];
        const R = ringR(th, fitY, clear) * k;
        let hp = [dx + Math.sin(th) * R, y, dz + Math.cos(th) * R];
        if (tilt) hp = tilt(hp, u);
        return { hp };
      },
    }, look);
  }

  // ------------------------------------------------------------------------------------------------ brim
  /**
   * A hat brim: a flat ring with real thickness and a rolled outer edge. y = its height at the crown (head space),
   * inner(θ) = inner radius (default: the skull oval at y + clear), width(θ) = how far out, lift(s, θ) = how far the
   * brim rises (+) or droops (−) at a share s of the way out, thick = thickness.
   */
  function brim({ y, inner = null, width, lift: up = null, thick = 0.004, segs = 36, under = null, from = null, to = null, ...look }) {
    const S7 = [[0, 1], [0.5, 1], [1, 1], [1.04, 0], [1, -1], [0.5, -1], [0, -1]];     // [share out, top (1) / edge (0) / under (-1)]
    const yb = th => (typeof y === 'function' ? y(th) : y);
    const rin = th => (inner ? inner(th) : ringR(th, yb(th), CLEAR + 0.002));
    const col = look.color, cf = typeof col === 'function' ? col : () => col;
    const uf = under ? (typeof under === 'function' ? under : () => under) : (u, th) => cmul(cf(u, th), 0.62);
    const bc = (u, th) => (S7[Math.round(u)][1] < 0 ? uf(u, th) : cf(u, th));
    const part = from != null;
    return finish({
      us: S7.map((_, i) => i), segs: nseg(segs, part ? 6 : 14), wrap: !part,
      theta: part ? (j, n) => lerp(from, to, j / n) : (j, n) => j / n * TAU - PI,
      out: (p, u, th) => { const k = S7[Math.round(u)][1]; return k > 0 ? [0, 1, 0] : k < 0 ? [0, -1, 0] : [Math.sin(th), 0, Math.cos(th)]; },
      at(u, th) {
        const [s0, side] = S7[Math.round(u)], s = Math.min(1, s0);
        const w = typeof width === 'function' ? width(th) : width;
        const r = rin(th) + w * s0;
        const ly = (up ? up(s, th) : 0) + side * thick * 0.5;
        return { hp: [Math.sin(th) * r, yb(th) + ly, Math.cos(th) * r] };
      },
    }, { ...look, color: bc });
  }

  // ------------------------------------------------------------------------------------------------ tubes, blobs, loops
  /** A closed tube along path(t) (head space); r(t) a number or [across, up]; up = which way the flat side faces. */
  function tube({ path, r = 0.004, rows = 6, sides = 5, up = [0, 1, 0], capStart = true, capEnd = true, closed = false, twist = 0, ...look }) {
    const rf = typeof r === 'function' ? r : () => r;
    const nr = Math.max(2, Math.round(rows * (lod ? 0.7 : 1) * (lean ? 0.75 : 1)));
    const us = Array.from({ length: nr + 1 }, (_, i) => i / nr);
    return finish({
      us, segs: Math.max(3, sides - ((lod || lean >= 3) && sides > 3 ? 1 : 0)), capStart: closed ? false : capStart, capEnd: closed ? false : capEnd,
      out: (p, u) => sub(p, W(path(u))),
      at(t, a) {
        const c = path(t), T = norm(sub(path(Math.min(1, t + 0.01)), path(Math.max(0, t - 0.01))));
        const upv = typeof up === 'function' ? up(t) : up;
        let A = norm(cross(upv, T)); if (!Number.isFinite(A[0]) || len(cross(upv, T)) < 1e-4) A = norm(cross([1, 0, 0], T));
        const B = cross(T, A), rr = rf(t), aa = a + twist * t;
        const rx = Array.isArray(rr) ? rr[0] : rr, ry = Array.isArray(rr) ? rr[1] : rr;
        return { hp: add(c, add(mul(A, Math.cos(aa) * rx), mul(B, Math.sin(aa) * ry))) };
      },
    }, look);
  }
  /** An ellipsoid at c with radii r along the axes ax = [X, Y, Z] (unit vectors; default the head's). rows 2 + segs 4 = a gem. */
  function blob({ c, r, ax = null, rows = 5, segs = 8, bumps = null, ...look }) {
    const [X, Y, Z] = ax || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const us = Array.from({ length: rows + 1 }, (_, i) => i / rows);
    return finish({
      us, segs: (lod || lean >= 2) && segs > 6 ? Math.max(5, Math.round(segs * (lean >= 3 ? 0.6 : 0.75))) : segs, capStart: true, capEnd: true,
      out: (p) => sub(p, W(c)),
      at(v, a) {
        const ph = PI * v, sp = Math.sin(ph), cp = Math.cos(ph), k = 1 + (bumps ? bumps(a, v) : 0);
        const d = add(add(mul(X, Math.cos(a) * sp * r[0] * k), mul(Y, cp * r[1] * k)), mul(Z, Math.sin(a) * sp * r[2] * k));
        return { hp: add(c, d) };
      },
    }, look);
  }
  /** A band round the head at height y(θ), on the skull (or on `around(θ)` = a radius), with a [depth, height] section. */
  function loop({ y, around = null, off = CLEAR + 0.002, r = [0.004, 0.006], segs = 32, sides = 4, ...look }) {
    if (lean >= 2 && sides > 4) sides = 4;
    const yb = th => (typeof y === 'function' ? y(th) : y);
    const R = th => (around ? around(th) : ringR(th, yb(th), off));
    return tube({ path: t => { const th = t * TAU - PI; const rr = R(th); return [Math.sin(th) * rr, yb(th), Math.cos(th) * rr]; }, r: () => r, rows: nseg(segs, 14), sides, up: [0, 1, 0], closed: true, ...look });
  }

  // ------------------------------------------------------------------------------------------------ drape
  // head space ↔ bind space (the warp is smooth and near identity: three Newton steps invert it)
  const toHead = q => {
    const t = (q[1] - P.chinY) / P.HS;
    let y = t;
    for (let i = 0; i < 3; i++) { const e = 0.001, f = headWarp(y, P.fem, S.len) - t, d = (headWarp(y + e, P.fem, S.len) - headWarp(y - e, P.fem, S.len)) / (2 * e) || 1; y -= f / d; }
    return [q[0] / P.HS, y, (q[2] - P.headZ) / P.HS];
  };
  const neck = body?.neck, torso = body?.torso;
  const neckCZ = neck ? (y => (neck.at(y, 0).p[2] + neck.at(y, PI).p[2]) / 2) : null;
  /**
   * The outermost skin on bearing θ at bind height yW, seen from an axis at z = az: candidates are the head (head-space y
   * ≥ −0.01, with the face's own weights: a coif under the chin opens with the jaw), the neck and the torso (their own
   * skin weights), and the deltoid balls. Returns { r, w } — r from the axis.
   */
  function skinAround(yW, th, az) {
    const c = [];
    const yh = toHead([0, yW, 0])[1];
    if (yh > -0.015 && yh < CROWN) {
      const hp = H.at(Math.max(0, yh), th);
      const q = W(hp); c.push({ r: Math.hypot(q[0], q[2] - az), w: headWeights(hp, S) });
    }
    if (neck && yW >= neck.us[0] && yW <= neck.us[neck.us.length - 1]) {
      const s = neck.at(yW, th); c.push({ r: Math.hypot(s.p[0], s.p[2] - az), w: s.w });
    }
    if (torso && yW >= torso.yBot && yW <= torso.yTop) {
      const R = torso.radiusAt(yW, th);
      if (R) { const q = [Math.sin(th) * R.r, yW, R.cz + Math.cos(th) * R.r]; c.push({ r: Math.hypot(q[0], q[2] - az), w: torso.weightsAt(yW, q[0], q[2]) }); }
    }
    if (!c.length) return { r: 0.05, w: [['neck', 1]] };
    const rmax = Math.max(...c.map(x => x.r));
    // soft maximum of the radii, and the weights blended by how close each candidate is to the outermost
    let tot = 0; const map = new Map();
    for (const x of c) { const k = Math.exp(-(rmax - x.r) / 0.004); tot += k; for (const [b, v] of x.w) map.set(b, (map.get(b) || 0) + v * k); }
    return { r: rmax, w: [...map].map(([b, v]) => [b, v / tot]) };
  }
  /** The neck's radius on bearing θ at bind height yW, from an axis at z = az (no torso / deltoids: a helm's underside). */
  const neckAround = (yW, th, az) => { if (!neck) return 0.05; const y = clamp(yW, neck.us[0], neck.us[neck.us.length - 1]), s = neck.at(y, th); return Math.hypot(s.p[0], s.p[2] - az); };
  /** The drape's axis z at bind height y (the head's axis above the jaw, the neck's below, then the torso's). */
  const axisZ = yW => {
    const yh = toHead([0, yW, 0])[1];
    const zn = neckCZ ? neckCZ(clamp(yW, neck.us[0], neck.us[neck.us.length - 1])) : P.headZ - 0.03;
    const zt = torso ? torso.centreZ(clamp(yW, torso.yBot, torso.yTop)) : zn;
    const zh = P.headZ;
    return yh > 0.02 ? zh : yh > -0.06 ? lerp(zn, zh, smooth(-0.06, 0.02, yh)) : yW > (torso?.yTop ?? 0) - 0.04 ? zn : lerp(zt, zn, smooth((torso?.yTop ?? 0) - 0.1, (torso?.yTop ?? 0) - 0.04, yW));
  };
  /** Push a bind-space point out of the deltoid balls (an arm raised in a clip still sits under the mantle's edge). */
  const deltoid = (q, gap) => {
    let p = q, share = 0;
    for (const sg of [-1, 1]) {
      const c = [sg * P.arm.sh[0], P.arm.sh[1] + 0.01, P.arm.sh[2]], need = 0.068 * Math.sqrt(P.W) + gap;
      const d = sub(p, c), r = len(d);
      if (r < need) { p = add(c, mul(d, need / (r || 1e-6))); share = Math.max(share, smooth(0.0, 0.02, need - r)); }
    }
    return { p, share, side: q[0] >= 0 ? 'R' : 'L' };
  };
  /**
   * Cloth or mail laid over the head / neck / shoulders. Rows run from `top` (head-space y, or a function of θ) down to
   * `hem` (head-space y, function of θ: a pointed or wavy hem) on bearings `from`..`to` (an open front) or all round.
   * gap(s, θ) = how far off the skin (s = 0 at the top … 1 at the hem). Every vertex takes the weights of the skin it
   * lies over, so it moves with the jaw, the neck and the chest in every clip.
   */
  function drape({ top, hem, gap, from = null, to = null, rows = 7, segs = 28, ease = 1, deltoids = true, ...look }) {
    const open = from != null;
    const us = Array.from({ length: rows + 1 }, (_, i) => i / rows);
    const gf = typeof gap === 'function' ? gap : () => gap;
    const fr = typeof from === 'function' ? from : () => from, tr = typeof to === 'function' ? to : () => to;
    return finish({
      us, segs: nseg(segs, 12), wrap: !open, t0: 0, t1: 1,
      theta: open ? (j, n) => j / n : (j, n) => j / n * TAU - PI,
      out: (p) => { const az = axisZ(p[1]); return [p[0], 0, p[2] - az]; },
      at(s, a) {
        // an open drape's columns run from the opening's one edge round the back to the other (a = 0..1)
        const th0 = open ? lerp(fr(s), TAU - tr(s), a) : a, th = Math.atan2(Math.sin(th0), Math.cos(th0));   // callbacks see −π..π
        const yh = lerp(typeof top === 'function' ? top(th) : top, hem(th), Math.pow(s, ease));
        const yW = W([0, yh, 0])[1];
        const az = axisZ(yW), sk = skinAround(yW, th, az);
        let q = [Math.sin(th) * (sk.r + gf(s, th)), yW, az + Math.cos(th) * (sk.r + gf(s, th))];
        let w = sk.w;
        if (deltoids && body) {
          const D = deltoid(q, gf(s, th) * 0.8);
          q = D.p;
          if (D.share > 0) w = [...w.map(([b, v]) => [b, v * (1 - D.share * 0.5)]), ['clav' + D.side, D.share * 0.3], ['arm' + D.side, D.share * 0.2]];
        }
        return { hp: toHead(q), p: q, w, th };
      },
    }, look);
  }

  // ------------------------------------------------------------------------------------------------ emblem triangles
  /** Raw triangles (head space), for the emblem pictures (hat-build.js writes them with MeshBuilder.v / .t). */
  function raw(tris) { raws.push(tris); }

  return { P, H, S, W, C, lod, lean, lodK, parts, raws, headW, keepOff, tSkull, eAt, eOff, onRay, atY, normalY, skullHR, ringR, toHead, skinAround, axisZ, neckAround,
    shell, plate, lathe, brim, tube, blob, loop, drape, raw, nseg, smooth, lerp, clamp, gauss };
}
