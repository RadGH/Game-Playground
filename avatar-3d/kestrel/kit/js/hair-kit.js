// Kestrel kit — the hair TOOLKIT every style in hair.js is written with. Head space throughout (metres for a 0.24 m
// head, y up from the chin, +z forward; face.js headToWorld puts it on the body).
//
//   const K = hairKit(P, colors, { lod, body, ears, underHat, seed });
//   K.cap({ line, off, color, … })      the shell laid on the skull from a hairline up to the crown
//   K.lock({ root, n, dir, length, … }) one tapered blade grown along a bent path, kept outside the head, ears and body
//   K.tube({ path, r, … })              a closed tube along a path (braids, ties, rolls, knots, beads)
//   K.blob({ c, r, … })                 a closed ellipsoid with optional bumps (buns, puffs, an afro, curls)
//   K.scalp(θ, y) / K.meridian(θ, y)    a point on the scalp + its normal / the way "down the head" runs there
//
// Rules every piece keeps (they are what make 44 styles fit one head): every point is asked of the skull (nothing is
// placed by a hand number that would float on another head shape); every lock is pushed OUT of the head, the ears it
// does not cover and the body (neck, torso, shoulders) at every step of its growth, in bind space; hair that hangs below
// the jaw is skinned to the neck and chest so it moves with the body instead of swinging through it; tails, braids and
// long backs ride the hairA/B/C spring bones (expressions.js) with weights that grow toward the tip.
//
// UNDER A HAT (`underHat: { front, back }` = the brim's height in head space at the face and at the nape; hair.js
// hairUnderHat()): the cap is laid close to the skull, any lock / tube / blob wholly above the brim is dropped, and the
// parts of hanging pieces above the brim are pressed down inside the hat's reach. What hangs below the brim stays.
import { clamp, lerp, smooth, gauss, add, sub, mul, norm, cross, dot, len, rng, cmul, cmix } from './kmath.js';
import { makeHeadSurface, headToWorld, headWarp } from './face.js';

const PI = Math.PI;
const CROWN = 0.2415;

export function hairKit(P, colors, { lod = 0, body = null, ears = 'free', earsShown = true, underHat = null, seed = 1, color2 = null, bodyPad = 0, belt = null } = {}) {
  const H = makeHeadSurface(P);
  const parts = [];
  const R = rng(seed);
  const col = colors.hair, col2 = color2 || cmix(cmul(col, 1.7), [0.95, 0.85, 0.65], 0.25);
  const W = p => headToWorld(P, p);
  const HS = P.HS, len0 = 1;
  // head space ↔ bind space (the warp is smooth and close to identity, so three Newton steps invert it)
  const toHead = q => {
    const t = (q[1] - P.chinY) / HS;
    let y = t;
    for (let i = 0; i < 3; i++) { const e = 0.001, f = headWarp(y, P.fem, H.S.len) - t, d = (headWarp(y + e, P.fem, H.S.len) - headWarp(y - e, P.fem, H.S.len)) / (2 * e) || 1; y -= f / d; }
    return [q[0] / HS, y, (q[2] - P.headZ) / HS];
  };
  // batch 3: a hat may give its own brim line `underHat.at(θ)` (hat-catalog.js: a helm's cheek guards, a hood's face
  // opening) instead of the cosine blend between the face and the nape
  const brim = underHat ? (typeof underHat.at === 'function' ? underHat.at : (th => lerp(underHat.front, underHat.back, (1 - Math.cos(th)) / 2))) : null;
  // batch 3: a band round the hair (a circlet, a headband, a crown: hat-build.js bandFit) cinches it — within the band's
  // height the hair is drawn in to just inside it (`belt` = { y(θ), lo, hi, r(θ) } head space), easing off over 3 cm
  const cinch = belt ? (q => {
    const th = Math.atan2(q[0], q[2]), y0 = belt.y(th), dy = q[1] < y0 + belt.lo ? y0 + belt.lo - q[1] : q[1] > y0 + belt.hi ? q[1] - y0 - belt.hi : 0;
    if (dy > 0.03) return q;
    const r = Math.hypot(q[0], q[2]), rm = belt.r(th) + 0.06 * smooth(0, 0.03, dy) ** 2;      // eased off over 3 cm
    return r > rm ? [q[0] * rm / r, q[1], q[2] * rm / r] : q;
  }) : (q => q);
  /** batch 3: extra rows where a piece passes a band (its rows can be centimetres apart; the cinch needs vertices there) —
   *  rows = the piece's rows, yOf(t) = its centre point (head space) at row t. */
  const beltRows = (rows, at, dense = 0) => {
    if (!belt) return rows;
    // only where the piece passes the band AND stands out past it (what the cinch moves): the entry, the exit and the
    // middle of each such stretch (a piece that stays under the band gets nothing)
    const N = 32, extra = [];
    let start = -1;
    for (let i = 0; i <= N + 1; i++) {
      let hit = false;
      if (i <= N) {
        const t = i / N, q = at(t), th = Math.atan2(q[0], q[2]), y0 = belt.y(th);
        hit = q[1] > y0 + belt.lo - 0.026 && q[1] < y0 + belt.hi + 0.026 && Math.hypot(q[0], q[2]) > belt.r(th) - 0.001;
      }
      if (hit && start < 0) start = i;
      if (!hit && start >= 0) {
        const a = Math.max(0, start - 0.5) / N, b = Math.min(N, i - 0.5) / N; extra.push(a, b);
        const k = dense ? Math.min(10, Math.ceil((b - a) / dense)) : (b - a > 0.08 ? 2 : 1);   // a cap (the hair's volume) gets rows every `dense`
        for (let j = 1; j < k; j++) extra.push(a + (b - a) * j / k);
        start = -1;
      }
    }
    if (!extra.length) return rows;
    return [...new Set([...rows, ...extra].map(t => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b);
  };

  // ---- the skull and what a lock must stay outside of
  const headR = (y, th) => { const p = H.at(clamp(y, 0, CROWN - 0.001), th, { noFeatures: true }); return Math.hypot(p[0], p[2]); };
  const scalp = (th, y, off = 0.0025) => {
    const p = H.at(y, th, { noFeatures: true }), n = H.normalAt(y, th, { noFeatures: true });
    return { p: add(p, mul(n, off)), n };
  };
  const meridian = (th, y) => {
    const a = H.at(Math.min(CROWN - 0.001, y + 0.006), th, { noFeatures: true }), b = H.at(Math.max(0, y - 0.006), th, { noFeatures: true });
    return norm(sub(b, a));
  };
  // the ears a lock must go round (only the ones that are shown and not covered by the style)
  const earWin = (y, th) => earsShown && ears !== 'over' ? gauss(y - 0.127, 0.03) * gauss(Math.abs(th) - 1.62, 0.3) : 0;
  /** The skull's height at horizontal distance r on bearing θ, for points over the top of the head (bisection). */
  const topY = (r, th) => { let lo = CROWN - 0.05, hi = CROWN; for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (headR(m, th) > r) lo = m; else hi = m; } return (lo + hi) / 2; };
  const keepHead = (p, off, exact = false) => {
    const th = Math.atan2(p[0], p[2]);
    if (p[1] > CROWN + off) return p;
    if (exact && p[1] > CROWN - 0.05) {   // over the top: the real skull (tubes and braids lie on it)
      const r = Math.hypot(p[0], p[2]);
      if (r < headR(CROWN - 0.05, th)) { const yS = topY(r, th) + off; return p[1] < yS ? [p[0], yS, p[2]] : p; }
    }
    if (!exact && p[1] > CROWN - 0.03) {   // near the crown: keep outside a sphere-ish top (gives locks their volume)
      const top = H.at(CROWN - 0.03, th, { noFeatures: true });
      const c = [0, CROWN - 0.07, 0];
      const d = sub(p, c), r = len(d), need = len(sub(top, c)) + off;
      return r < need ? add(c, mul(d, need / (r || 1))) : p;
    }
    if (p[1] < -0.01) return p;
    const r = Math.hypot(p[0], p[2]), need = headR(p[1], th) + off + 0.026 * earWin(p[1], th);
    if (r >= need) return p;
    const k = need / (r || 1e-6); return [p[0] * k, p[1], p[2] * k];
  };
  // the body in bind space: the neck, the torso (its own radius), a ball on each deltoid
  const neckCZ = body?.neck ? (y => (body.neck.at(y, 0).p[2] + body.neck.at(y, PI).p[2]) / 2) : null;
  const keepBody = (q, off) => {
    if (!body) return q;
    let p = q;
    const nk = body.neck;
    if (nk && p[1] < P.headY + 0.02 && p[1] > nk.us[0]) {
      const cz = neckCZ(p[1]), th = Math.atan2(p[0], p[2] - cz), s = nk.at(p[1], th).p;
      const need = Math.hypot(s[0], s[2] - cz) + off + bodyPad * smooth(0.92, 0.62, Math.cos(th)), r = Math.hypot(p[0], p[2] - cz);   // batch 3: + bodyPad behind (hair over a fallen hood)
      if (r < need) { const k = need / (r || 1e-6); p = [p[0] * k, p[1], cz + (p[2] - cz) * k]; }
    }
    const T = body.torso;
    if (T && p[1] < T.yTop + 0.01 && p[1] > T.yBot) {
      const y = Math.min(p[1], T.yTop), cz = T.centreZ(y), th = Math.atan2(p[0], p[2] - cz), Rr = T.radiusAt(y, th);
      if (Rr) {
        const need = Rr.r + off + bodyPad * smooth(0.92, 0.62, Math.cos(th)) * (1 - smooth(T.yTop - 0.3, T.yTop - 0.4, y)), r = Math.hypot(p[0], p[2] - Rr.cz);
        if (r < need) { const k = need / (r || 1e-6); p = [p[0] * k, p[1], Rr.cz + (p[2] - Rr.cz) * k]; }
      }
    }
    for (const sg of [-1, 1]) {   // the deltoids (the arm's top in the A-pose)
      const c = [sg * P.arm.sh[0], P.arm.sh[1] + 0.01, P.arm.sh[2]], need = 0.068 * Math.sqrt(P.W) + off + bodyPad;   // batch 3: + bodyPad (over a fallen hood's cowl)
      const d = sub(p, c), r = len(d);
      if (r < need) p = add(c, mul(d, need / (r || 1e-6)));
    }
    return p;
  };
  const keepOut = (p, off, exact = false) => {
    let q = keepHead(p, off, exact);
    if (body && q[1] < 0.06) { const w = keepBody(W(q), off * HS); q = toHead(w); }
    return q;
  };

  // ---- skin weights
  /** Hair that hangs below the jaw follows the neck, then the chest (so it moves with the body, not through it). */
  const bodyW = (q) => {
    const y = q[1];
    if (y >= 0.03) return [['head', 1]];
    const a = smooth(0.03, -0.07, y), b = smooth(-0.06, -0.16, y);
    const back = smooth(0.0, -0.06, q[2]);       // hanging down the back reaches the chest sooner
    const bb = Math.max(b, back * smooth(0.0, -0.09, y));
    return [['head', 1 - a], ['neck', a * (1 - bb)], ['chest', a * bb]];
  };
  /** Down a tail / braid from its root: head → hairA → hairB → hairC by distance below `from` (head-space y). */
  const springW = (from, k = 1) => (q) => {
    const below = from - q[1];
    const a = smooth(-0.01, 0.02, below), b = smooth(0.06, 0.13, below), c = smooth(0.17, 0.25, below);
    const s = [['head', 1 - a * k], ['hairA', a * (1 - b) * k], ['hairB', b * (1 - c) * k], ['hairC', c * k]];
    return s;
  };
  /** Loose hair down the back: the body's weights, plus a spring share at the tips (expressions.js keeps that spring
   *  from swinging INTO the back). */
  const looseW = (q, t) => {
    const w = bodyW(q), k = 0.45 * smooth(0.35, 1, t) * smooth(0.02, -0.08, q[1]);
    if (k < 1e-3) return w;
    return [...w.map(([b, v]) => [b, v * (1 - k)]), ['hairB', k * 0.4], ['hairC', k * 0.6]];
  };

  // ---- colour
  const shadeOf = (k) => cmul(col, k);
  const tipMix = (c, t, from) => (from == null ? c : cmix(c, cmul(col2, 1), smooth(from, Math.min(1, from + 0.2), t)));

  // ---- under a hat
  const above = (q, pad = 0) => brim && q[1] > brim(Math.atan2(q[0], q[2])) - pad;
  const press = (q) => {
    if (!above(q)) return q;
    // batch 3: the radius is the skull's at the height the point is pressed TO (it was taken at the point's own height,
    // so a point pressed down from the crown to a nape brim stood 2 cm out of the narrower nape)
    const th = Math.atan2(q[0], q[2]), yp = Math.min(q[1], brim(th) + 0.004), y = Math.min(yp, CROWN - 0.002), r = headR(y, th) + 0.0035;
    return [Math.sin(th) * r, yp, Math.cos(th) * r];
  };
  /** batch 3: a vertex of a piece that comes out from under a hat never stands above the rim's lip: it is tucked down
   *  under it (pressing it in, as batch 2 did, stretched the piece's triangles through the lip). */
  const tuck = (q) => { if (!brim) return q; const y = brim(Math.atan2(q[0], q[2])) - 0.0045; return q[1] > y ? [q[0], y, q[2]] : q; };
  /**
   * batch 3: a lock / tube that starts under the hat comes out FROM UNDER THE BRIM. The part above the brim is cut off
   * and the piece is re-rooted on the skull just under the brim where it crosses it, then resampled to the same number
   * of points. (Pressing every point flat, as batch 2 did, left the blade's width and the jump between a pressed and an
   * unpressed point standing 4-7 cm out through any hat: hats.test.js measures it.) Returns null for a piece too short
   * to keep; points further down that rise above the brim again are pressed as before.
   */
  /** batch 3: a zone a hat keeps clear (a war helm's nasal: `underHat.avoid` = [{ t0, t1, y0, y1 }] in head space) */
  const avoided = (pts) => underHat?.avoid?.some(z => pts.some(q => { const t = Math.atan2(q[0], q[2]); return t > z.t0 && t < z.t1 && q[1] > z.y0 && q[1] < z.y1; }));
  const reroot = (pts) => {
    if (avoided(pts)) return null;
    // the first point clearly under the rim (below its rolled lip), and where the piece goes back up under the hat
    const below = q => !above(q, 0.006);
    let k = 0; while (k < pts.length && !below(pts[k])) k++;
    if (k >= pts.length) return null;
    // (`underHat.floor(θ)`: a hood keeps the hair in its face opening above the jaw — below it, it is tucked in)
    const fl = typeof underHat.floor === 'function' ? underHat.floor : null, sunk = q => fl && q[1] < fl(Math.atan2(q[0], q[2]));
    let m = k + 1; while (m < pts.length && !above(pts[m], 0.006) && !sunk(pts[m])) m++;
    if (k === 0 && m >= pts.length) return { pts };             // nothing under the hat
    const q = pts[k], th = Math.atan2(q[0], q[2]), yb = brim(th) - 0.006;
    let root = q, n = null;
    if (k > 0 && yb > 0.04 && yb < CROWN - 0.01) { const s = scalp(th, Math.min(yb, Math.max(q[1], yb - 0.03)), 0.004); root = s.p; n = s.n; }
    // a piece that curls back up under the hat is tucked in: it stops at the rim
    const poly = [root, ...pts.slice(k + 1, m)];
    if (m < pts.length) { const a = pts[m - 1], b = pts[m], ya = sunk(b) ? fl(Math.atan2(b[0], b[2])) : brim(Math.atan2(a[0], a[2])) - 0.004, t = clamp((ya - a[1]) / ((b[1] - a[1]) || 1e-6), 0, 1); poly.push(add(mul(a, 1 - t), mul(b, t))); }
    const L = [0]; for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + len(sub(poly[i], poly[i - 1])));
    const tot = L[L.length - 1];
    if (tot < 0.006) return null;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const d = tot * i / (pts.length - 1);
      let j = 1; while (j < poly.length - 1 && L[j] < d) j++;
      const t = (d - L[j - 1]) / ((L[j] - L[j - 1]) || 1);
      out.push(add(mul(poly[j - 1], 1 - t), mul(poly[j], t)));
    }
    return { pts: out, n };
  };

  // ------------------------------------------------------------------------------------------------ the cap
  /**
   * The shell. line(θ) = hairline height; top = where it stops (a tonsure's ring) or the crown; off(v, θ) = how far it
   * stands off the skull; color(v, θ) → colour; segs / rows. A shaved cap (shave) is the scalp tinted toward the hair.
   */
  function cap({ line, top = CROWN, off = 0.0042, color = null, segs = 24, rows = [0, 0.12, 0.3, 0.52, 0.74, 0.92, 1], shave = 0, from = -PI, to = PI, name = 'hairCap' } = {}) {
    if (lod) segs = Math.max(12, Math.round(segs * 0.8));
    const full = to - from >= 2 * PI - 1e-6;
    const offF = typeof off === 'function' ? off : () => off;
    const pressed = !!brim;
    const crownEnd = top >= CROWN - 1e-4;
    parts.push({
      name, us: rows, segs: full ? segs : segs, wrap: full, t0: from, t1: to, capEnd: crownEnd,
      theta: full ? (j, n) => (j / n) * PI * 2 - PI : undefined,
      at(v, th) {
        const y0 = line(th) - 0.002;
        const y = lerp(y0, top, Math.pow(v, 0.85));
        const p = H.at(y, th, { noFeatures: true });
        const n = H.normalAt(y, th, { noFeatures: true });
        let o = offF(v, th, y) * (0.35 + 0.65 * smooth(0, 0.25, v)) + (v > 0.97 && crownEnd ? 0.001 : 0);
        if (pressed) o = Math.min(o, 0.003);
        if (lod) o = Math.max(o + 0.0015, 0.0035);        // the far head is coarser: stand a little further off it
        return { p: W(add(p, mul(n, o))), w: [['head', 1]], v, th };     // (a band sits ON the cap — the hair's volume — and is never cinched into it)
      },
      out: (p) => [p[0], p[1] - (P.chinY + 0.12 * P.HS), p[2] - P.headZ],
      color: (v, th, p, s) => {
        let c = color ? color(s.v, s.th) : cmul(col, 0.88 + 0.12 * smooth(0, 0.6, s.v));
        if (shave) c = cmix(colors.skin, cmul(c, 0.85), shave);
        return c;
      },
      rough: shave ? 0.7 : 0.55, ao: 0.4,
      // batch 3: the cap more than 1.2 cm above a hat's edge is under the hat: tagged so it is dropped with the scalp
      // (hat-build.js HAT_COVER.SCALP = 1 << 28); the band just under the rim stays, so nobody sees skin up the gap
      mask: pressed ? (v, th) => (lerp(line(th) - 0.002, top, Math.pow(v, 0.85)) > brim(th) + 0.012 ? 1 << 28 : 0) : 0,
    });
  }

  // ------------------------------------------------------------------------------------------------ one lock
  /**
   * root: head-space point; n: surface normal there; dir: the way it heads; length (m); lift: how much it stands off at
   * first; droop: pull toward -y per step; w / th: width / thickness at the root; curl: a turn added per step; steps;
   * sides 3 (a ridged blade) or 4+ (round: locs); flat: the underside's share; bones(q, t) → weights (default: the
   * body's below the jaw); tip2: where colour 2 starts (0..1, null = none); shade: darker / lighter; minor: dropped at
   * LOD 1; keep: false = no collision (a piece that is placed by hand on purpose); taper: how the width falls off.
   */
  function lock({ root, n, dir, length, lift = 0.4, droop = 0.25, w = 0.02, th = 0.007, curl = null, spiral = 0, bones = null, shade = 1, off = 0.006, steps = 5, keep = true, flat = 0.5, sides = 3, tip2 = null, minor = false, taper = 1.6, swell = 0.5, name = 'lock', color = null, across: acrossIn = null, wave = null }) {
    if (lod && minor) return;
    const pts = [root];
    let d = norm(add(mul(n, lift), mul(norm(dir), 1)));
    let p = root;
    const seg = length / steps;
    for (let i = 0; i < steps; i++) {
      d = norm(add(d, [0, -droop, 0]));
      if (curl) d = norm(add(d, mul(curl, 1 / steps)));
      if (spiral) { const ax = norm(dir), q = cross(ax, d); d = norm(add(d, mul(q, spiral))); }
      p = add(p, mul(d, seg));
      if (keep) p = keepOut(p, off * (1 - 0.3 * i / steps) + 0.004);
      pts.push(p);
    }
    // a wave: the path swings side to side along its length (growing from the root), then is kept outside again
    if (wave && wave[0]) {
      let ax = norm(cross(n, norm(dir))); if (!Number.isFinite(ax[0])) ax = [1, 0, 0];
      const ph = wave[2] ?? 0;
      for (let i = 1; i <= steps; i++) { const t = i / steps; pts[i] = add(pts[i], mul(ax, wave[0] * Math.sin(PI * wave[1] * t + ph) * Math.pow(t, 0.6))); if (keep) pts[i] = keepOut(pts[i], off * 0.7 + 0.004); }
    }
    let P2pts = pts;
    if (brim) {
      if (pts.every(q => above(q, -0.004))) return;        // wholly under the hat
      if (underHat.drop && above(pts[0], -0.004)) return;   // batch 3: under a hood / coif, hair rooted under the cloth stays inside it
      const rr = reroot(pts);        // batch 3 (was: pts.map(press))
      if (!rr) return;
      P2pts = rr.pts; if (rr.n) n = rr.n;
    }
    // across vector: tangent to the head at the root, perpendicular to the lock
    const t0 = norm(sub(P2pts[1], P2pts[0]));
    let across = acrossIn ? norm(cross(acrossIn, t0)) : norm(cross(n, t0));     // `across` given = the blade's flat faces look that way (a crest)
    if (!Number.isFinite(across[0]) || len(acrossIn ? cross(acrossIn, t0) : cross(n, t0)) < 1e-4) across = [1, 0, 0];
    const shadeK = shade * (0.94 + R() * 0.12);
    let rows = []; for (let i = 0; i <= steps; i++) rows.push(i / steps);
    const CR = (t) => {                // Catmull-Rom along the points
      const f = t * steps, i = Math.min(steps - 1, Math.floor(f)), u = f - i, q = P2pts;
      const p0 = q[Math.max(0, i - 1)], p1 = q[i], p2 = q[i + 1], p3 = q[Math.min(steps, i + 2)];
      const u2 = u * u, u3 = u2 * u;
      return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
    };
    const bw = bones || ((q, t) => bodyW(q));
    rows = beltRows(rows, CR);     // batch 3
    parts.push({
      name, us: rows, segs: sides, capEnd: true,
      theta: (j, k) => j / k * PI * 2 + (k === 3 ? PI / 2 : 0),
      at(t, a) {
        const c = CR(t), c2 = CR(Math.min(1, t + 0.02)), c1 = CR(Math.max(0, t - 0.02));
        const T = norm(sub(c2, c1));
        const A = norm(sub(across, mul(T, dot(across, T))));
        const O = cross(T, A);
        const ww = w * (1 - Math.pow(t, taper)) * (1 - swell * 0.5 + swell * Math.sin(PI * t)), tt = th * Math.pow(1 - t, 0.5);
        const ca = Math.cos(a), sa = Math.sin(a);
        const q = sides === 3 ? add(c, add(mul(A, ca * ww * 1.15), mul(O, sa * tt * (sa > 0 ? 1 : flat))))
          : add(c, add(mul(A, ca * ww), mul(O, sa * ww * (sa > 0 ? 1 : flat) * (th / Math.max(w, 1e-4)))));
        return { p: W(cinch(brim ? tuck(q) : q)), w: bw(c, t), t, a };     // batch 3: a blade's width / thickness never stands above the rim
      },
      color(t, a, p, s) {
        let base = color ? color(s.t, s.a) : cmul(col, shadeK * lerp(0.7, 1.12, smooth(0, 0.75, s.t)));
        base = tipMix(base, s.t, tip2);
        const hl = Math.max(0, Math.sin(s.a)) * gauss(s.t - 0.45, 0.25) * 0.22;     // a soft highlight band on the outer face
        return cmix(base, cmul(base, 1.6), hl);
      },
      rough: 0.62, ao: 0,
      mask: minor ? 1 << 23 : 0,     // batch 3: a minor lock (the ones LOD 1 drops) can be dropped at LOD 0 too when a hat needs the triangles (hat-build.js HAT_COVER.LEAN)
    });
    return P2pts;
  }

  // ------------------------------------------------------------------------------------------------ tubes and blobs
  /**
   * A closed tube along `path(t)` (t 0..1, head space) with radius r(t) (or [rx, ry] for a flat band), `rows` along,
   * `sides` round. braid > 0 = that many crossings per metre (alternating lobes, a darker crease between them).
   * up = the tube's "up" for flattening; bones(q, t); color(t, a).
   */
  function tube({ path, r = 0.01, rows = 10, sides = 6, braid = 0, bones = null, color = null, up = [0, 0, 1], flat = 1, name = 'tube', capStart = true, capEnd = true, minor = false, keep = false, off = 0.004, tip2 = null, twist = 0 }) {
    if (lod && minor) return;
    if (lod) rows = Math.max(3, Math.ceil(rows * 0.6));
    const rf = typeof r === 'function' ? r : () => r;
    let samp = Array.from({ length: rows + 1 }, (_, i) => path(i / rows));
    if (keep) samp = samp.map(q => keepOut(q, off, true));
    if (brim) { if (samp.every(q => above(q, -0.004)) || (underHat.drop && above(samp[0], -0.004))) return; const rr = reroot(samp); if (!rr) return; samp = rr.pts; }   // batch 3: re-rooted at the brim (was: pressed)
    const at = (t) => { const f = t * rows, i = Math.min(rows - 1, Math.floor(f)), u = f - i; return add(mul(samp[i], 1 - u), mul(samp[i + 1], u)); };
    // total length (for braid spacing)
    let L = 0; for (let i = 1; i <= rows; i++) L += len(sub(samp[i], samp[i - 1]));
    const us = []; const nRows = braid ? Math.max(rows, Math.min(Math.round(L * braid * 2) + 2, rows * 2)) : rows;
    for (let i = 0; i <= nRows; i++) us.push(i / nRows);
    const usB = beltRows(us, at); us.length = 0; us.push(...usB);     // batch 3: rows where it passes a band
    const bw = bones || ((q) => bodyW(q));
    parts.push({
      name, us, segs: sides, capStart, capEnd,
      at(t, a) {
        const c = at(t), T = norm(sub(at(Math.min(1, t + 0.01)), at(Math.max(0, t - 0.01))));
        let A = norm(cross(up, T)); if (!Number.isFinite(A[0]) || len(cross(up, T)) < 1e-4) A = norm(cross([1, 0, 0], T));
        const B = cross(T, A);
        let rr = rf(t);
        const aa = a + twist * t;
        if (braid) {
          // two interleaved lobes: each half of the section swells on alternate crossings
          const ph = t * L * braid * PI, side = Math.cos(aa) >= 0 ? 0 : PI / 2;
          rr *= 0.82 + 0.3 * Math.abs(Math.sin(ph + side));
        }
        const rx = Array.isArray(rr) ? rr[0] : rr, ry = Array.isArray(rr) ? rr[1] : rr * flat;
        const q = add(c, add(mul(A, Math.cos(aa) * rx), mul(B, Math.sin(aa) * ry)));
        return { p: W(cinch(brim ? tuck(q) : q)), w: bw(c, t), t, a: aa };     // batch 3: nor a tube's section
      },
      color(t, a, p, s) {
        let base = color ? color(s.t, s.a) : cmul(col, 0.92 + 0.1 * Math.sin(s.a));
        if (braid) { const ph = s.t * L * braid * PI; base = cmul(base, 0.78 + 0.3 * Math.abs(Math.sin(ph + (Math.cos(s.a) >= 0 ? 0 : PI / 2)))); }
        return tipMix(base, s.t, tip2);
      },
      rough: 0.6, ao: 0.2,
    });
  }
  /** A closed ellipsoid at c with radii r = [x, y, z] (head space), bumps(θ, φ) → extra radius share, grooves = spiral. */
  function blob({ c, r, rows = 8, segs = 12, bumps = null, bones = null, color = null, grooves = 0, name = 'blob', minor = false, tilt = null }) {
    if (lod && minor) return;
    if (lod) { rows = Math.max(4, Math.round(rows * 0.6)); segs = Math.max(6, Math.round(segs * 0.6)); }
    if (brim && c[1] - r[1] > brim(Math.atan2(c[0], c[2])) - 0.004) return;
    const us = beltRows(Array.from({ length: rows + 1 }, (_, i) => i / rows), v => add(c, tilt ? tilt([0, Math.cos(PI * v) * r[1], Math.sin(PI * v) * r[2]]) : [0, Math.cos(PI * v) * r[1], Math.sin(PI * v) * r[2]]));   // batch 3
    const bw = bones || (() => [['head', 1]]);
    parts.push({
      name, us, segs, capStart: true, capEnd: true,
      at(v, a) {
        const ph = PI * v, sp = Math.sin(ph), cp = Math.cos(ph);
        let k = 1 + (bumps ? bumps(a, v) : 0);
        let d = [Math.cos(a) * sp * r[0] * k, cp * r[1] * k, Math.sin(a) * sp * r[2] * k];
        if (tilt) d = tilt(d);
        const q = add(c, d);
        return { p: W(cinch(brim ? tuck(q) : q)), w: bw(q, v), v, a };     // batch 3: tucked under the rim (was: pressed)
      },
      color: (v, a, p, s) => {
        let base = color ? color(s.v, s.a) : cmul(col, 0.9 + 0.15 * (1 - s.v));
        if (grooves) base = cmul(base, 0.86 + 0.2 * Math.abs(Math.sin(s.a * grooves + s.v * 9)));
        return base;
      },
      rough: 0.58, ao: 0.5,
    });
  }

  return { H, P, parts, R, col, col2, W, scalp, meridian, keepOut, headR, cap, lock, tube, blob, bodyW, springW, looseW, lod, brim, jit: (k) => (R() * 2 - 1) * k, CROWN };
}
