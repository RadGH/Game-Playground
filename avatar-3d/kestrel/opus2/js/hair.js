// Kestrel (opus) — hair: a cap fitted to the skull plus LOCKS (tapered four-sided blades grown along a bent path that
// is kept outside the head). Styles: spiky (the man's messy cut), high_ponytail (the woman's), short, long, bald.
// Every other Chibi 2 hair id maps to the nearest of these (`hairStyleFor`), never an error.
import { clamp, lerp, smooth, gauss, table, add, sub, mul, norm, cross, dot, len, rng, cmul, cmix } from './kmath.js';
import { makeHeadSurface, headToWorld } from './face.js';

const PI = Math.PI;

export function hairStyleFor(id) {
  const s = String(id || '').toLowerCase();
  if (!s || s === 'none' || /bald|shav|buzz|skin/.test(s)) return s === '' ? 'short' : 'bald';
  if (/pony|tail/.test(s)) return 'high_ponytail';
  if (/spik|mess|mohawk|punk|wild|tous|shag|scruff/.test(s)) return 'spiky';
  if (/long|braid|wav|flow|loose|curl|bob|bun|knot|plait|mane|locks/.test(s)) return 'long';
  return 'short';
}

/** Hairline height (head space) around the head, by |θ|. */
const HAIRLINE = table([[0, 0.192], [0.45, 0.188], [0.8, 0.172], [1.1, 0.158], [1.3, 0.13], [1.4, 0.112], [1.47, 0.14], [1.6, 0.16], [1.78, 0.152], [2.05, 0.112], [2.45, 0.075], [PI, 0.058]]);
export const hairlineY = th => HAIRLINE(Math.abs(th))[0];

export function hairParts(P, look, colors, style) {
  if (style === 'bald') return { parts: [], scalp: false };
  const H = makeHeadSurface(P), fem = P.fem;
  const col = colors.hair;
  const parts = [];
  const R = rng(style === 'spiky' ? 7 : style === 'high_ponytail' ? 11 : style === 'long' ? 5 : 3);
  const capOff = 0.0042;
  const W = p => headToWorld(P, p);
  // ---- the cap
  const crown = 0.2415;
  const lineOf = style === 'high_ponytail' || style === 'long' ? (th => hairlineY(th) - 0.003 - 0.006 * Math.max(0, Math.cos(th))) : hairlineY;
  parts.push({
    name: 'hairCap', us: [0, 0.1, 0.25, 0.45, 0.65, 0.82, 0.94, 1], segs: 28, capEnd: true,
    theta: (j, n) => (j / n) * PI * 2 - PI,
    at(v, th) {
      const y = lerp(lineOf(th) - 0.002, crown, Math.pow(v, 0.85));
      const p = H.at(y, th, { noFeatures: true });
      const n = H.normalAt(y, th, { noFeatures: true });
      const off = capOff * (0.35 + 0.65 * smooth(0, 0.25, v)) + (v > 0.97 ? 0.001 : 0);
      return { p: W(add(p, mul(n, off))), w: [['head', 1]], v };
    },
    out: (p) => [p[0], p[1] - (P.chinY + 0.12 * P.HS), p[2] - P.headZ],
    color: (v, th, p, s) => cmul(col, 0.88 + 0.12 * smooth(0, 0.6, s.v)),
    rough: 0.55, ao: 0.4,
  });

  // ---- head-space helpers for growing locks
  const headR = (y, th) => { const p = H.at(clamp(y, 0, crown - 0.001), th, { noFeatures: true }); return Math.hypot(p[0], p[2]); };
  const keepOut = (p, off) => {
    const th = Math.atan2(p[0], p[2]);
    if (p[1] > crown + off) return p;
    if (p[1] > crown - 0.03) {   // near the crown: keep outside a sphere-ish top
      const top = H.at(crown - 0.03, th, { noFeatures: true });
      const c = [0, crown - 0.07, 0];
      const d = sub(p, c), r = len(d), need = len(sub(top, c)) + off;
      return r < need ? add(c, mul(d, need / (r || 1))) : p;
    }
    const r = Math.hypot(p[0], p[2]), need = headR(p[1], th) + off;
    if (r >= need) return p;
    const k = need / (r || 1e-6); return [p[0] * k, p[1], p[2] * k];
  };
  const scalp = (th, y) => {
    const p = H.at(y, th, { noFeatures: true }), n = H.normalAt(y, th, { noFeatures: true });
    return { p: add(p, mul(n, capOff * 0.6)), n };
  };

  /**
   * One lock. root: head-space point; n: surface normal there; dir: the way it heads (head space); len: metres;
   * lift: how much it stands off the head at first; droop: pull toward -y per step; w/th: width/thickness at the root.
   */
  function lock({ root, n, dir, length, lift = 0.4, droop = 0.25, w = 0.02, th = 0.007, curl = null, bones = null, shade = 1, off = 0.006, steps = 5, keep = true, flat = 0.5, sides = 3 }) {
    const pts = [root];
    let d = norm(add(mul(n, lift), mul(norm(dir), 1)));
    let p = root;
    const seg = length / steps;
    for (let i = 0; i < steps; i++) {
      d = norm(add(d, [0, -droop, 0]));
      if (curl) d = norm(add(d, mul(curl, 1 / steps)));
      p = add(p, mul(d, seg));
      if (keep) p = keepOut(p, off * (1 - 0.3 * i / steps) + 0.004);
      pts.push(p);
    }
    // across vector: tangent to the head at the root, perpendicular to the lock
    const t0 = norm(sub(pts[1], pts[0]));
    let across = norm(cross(n, t0));
    if (!Number.isFinite(across[0]) || len(cross(n, t0)) < 1e-4) across = [1, 0, 0];
    const shadeK = shade * (0.94 + R() * 0.12);
    const rows = []; for (let i = 0; i <= steps; i++) rows.push(i / steps);
    const P2 = (t) => {                // Catmull-Rom along pts
      const f = t * steps, i = Math.min(steps - 1, Math.floor(f)), u = f - i;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(steps, i + 2)];
      const u2 = u * u, u3 = u2 * u;
      return [0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
    };
    parts.push({
      name: 'lock', us: rows, segs: sides, capEnd: true,
      theta: (j, n) => j / n * PI * 2 + (n === 3 ? PI / 2 : 0),
      at(t, a) {
        const c = P2(t), c2 = P2(Math.min(1, t + 0.02)), c1 = P2(Math.max(0, t - 0.02));
        const T = norm(sub(c2, c1));
        let A = norm(sub(across, mul(T, dot(across, T))));
        const O = cross(T, A);
        const ww = w * (1 - Math.pow(t, 1.6)) * (0.75 + 0.5 * Math.sin(PI * t)), tt = th * Math.pow(1 - t, 0.5);
        // a diamond, the outer face a little fuller than the inner one
        const ca = Math.cos(a), sa = Math.sin(a);
        const q = add(c, add(mul(A, ca * ww * (sides === 3 ? 1.15 : 1)), mul(O, sa * tt * (sa > 0 ? 1 : flat))));
        const wv = bones ? bones(q, t) : [['head', 1]];
        return { p: W(q), w: wv, t, a };
      },
      color(t, a, p, s) {
        const base = cmul(col, shadeK * lerp(0.7, 1.12, smooth(0, 0.75, s.t)));
        // a soft highlight band along the outer face
        const hl = Math.max(0, Math.sin(s.a)) * gauss(s.t - 0.45, 0.25) * 0.22;
        return cmix(base, cmul(col, 1.8), hl);
      },
      rough: 0.62, ao: 0,
    });
  }
  const dirToward = (from, to) => norm(sub(to, from));

  // a point on the scalp and the way "down the head" runs there (along the surface, away from the crown)
  const meridian = (th, y) => {
    const a = H.at(Math.min(crown - 0.001, y + 0.006), th, { noFeatures: true }), b = H.at(Math.max(0, y - 0.006), th, { noFeatures: true });
    return norm(sub(b, a));
  };
  const jit = (k) => (R() * 2 - 1) * k;
  if (style === 'spiky') {
    // shingled layers from the crown out, like the reference: each lock a fat pointed petal lying down the head and
    // flaring out at its tip; the top ones stand up as spikes. Fringe locks hang over the forehead to the brows.
    // v2: fatter, fuller petals (the head is smaller than v1's, the Codex hair is not)
    const layers = [
      { y: 0.238, n: 7, len: 0.062, lift: 0.65, droop: 0.1, w: 0.05, th: 0.02, up: 0.2 },
      { y: 0.226, n: 11, len: 0.078, lift: 0.7, droop: 0.1, w: 0.05, th: 0.019, up: 0.12 },
      { y: 0.208, n: 12, len: 0.076, lift: 0.6, droop: 0.09, w: 0.044, th: 0.017, up: 0.16 },
      { y: 0.186, n: 13, len: 0.066, lift: 0.4, droop: 0.12, w: 0.04, th: 0.015, up: 0 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        let th = PI * (-1 + 2 * (i + 0.5 + jit(0.25)) / L.n);
        const front = Math.cos(th) > 0.55;
        if (front && L.up < 0.5) continue;                      // the fringe is grown separately
        const y = L.y + jit(0.004);
        const { p, n } = scalp(th, y);
        let dir = meridian(th, y);
        if (L.up) dir = norm(add(mul(dir, 1 - L.up), mul([Math.sin(th) * 0.35, 1, -0.45 + Math.cos(th) * 0.2], L.up)));
        dir = norm(add(dir, [Math.sin(th) * 0.25 + jit(0.15), 0, jit(0.1)]));
        lock({ root: p, n, dir, length: L.len * (0.85 + R() * 0.3), lift: L.lift * (0.8 + R() * 0.4), droop: L.droop, w: L.w * (0.85 + R() * 0.3), th: L.th, off: 0.014, steps: 4, flat: 0.45 });
      }
    }
    // fringe: big pointed locks swept over the forehead, ending at the brows; one falls between the eyes
    const fr = [[-0.75, 0.18, 0.046, 0.034], [-0.45, 0.176, 0.054, 0.036], [-0.18, 0.172, 0.058, 0.036], [0.06, 0.166, 0.064, 0.034], [0.3, 0.174, 0.058, 0.036], [0.55, 0.178, 0.05, 0.034], [0.82, 0.183, 0.042, 0.032]];
    for (const [th, ty, L, w] of fr) {
      const y = 0.214 + jit(0.004), { p, n } = scalp(th, y);
      const target = H.at(ty, th * 0.8 - 0.12, { noFeatures: true });
      lock({ root: p, n, dir: dirToward(p, add(target, [0, -0.012, 0.0])), length: L * 1.3, lift: 0.35, droop: 0.3, w: w * 1.15, th: 0.016, off: 0.008, steps: 4, flat: 0.45 });
    }
    // sides: petals lying back over the temples to just above the ear, a sideburn in front of it
    for (const sg of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const th = sg * (1.05 + i * 0.3), y = 0.19 - i * 0.004, { p, n } = scalp(th, y);
        lock({ root: p, n, dir: norm(add(meridian(th, y), [0, 0, -0.35])), length: 0.062, lift: 0.38, droop: 0.12, w: 0.038, th: 0.014, off: 0.008, steps: 4, flat: 0.45 });
      }
      const { p, n } = scalp(sg * 1.3, 0.162);
      lock({ root: p, n, dir: [0, -1, 0.1], length: 0.035, lift: 0.1, droop: 0.15, w: 0.018, th: 0.006, off: 0.004, steps: 3 });
    }
    // behind the ears: petals down to the nape line
    for (const sg of [-1, 1]) for (let i = 0; i < 2; i++) {
      const th = sg * (1.95 + i * 0.35), y = 0.17, { p, n } = scalp(th, y);
      lock({ root: p, n, dir: norm(add(meridian(th, y), [0, -0.4, 0])), length: 0.07, lift: 0.32, droop: 0.12, w: 0.04, th: 0.014, off: 0.008, steps: 4, flat: 0.45 });
    }
    // the back: two more shingled rows down to the nape
    for (const [y, nB, L] of [[0.165, 8, 0.06], [0.135, 7, 0.055]]) for (let i = 0; i < nB; i++) {
      const th = PI + (i - (nB - 1) / 2) * (1.9 / nB) + jit(0.06), { p, n } = scalp(th, y);
      lock({ root: p, n, dir: norm(add(meridian(th, y), [0, -0.5, 0])), length: L * 1.1 + jit(0.008), lift: 0.38, droop: 0.12, w: 0.042, th: 0.015, off: 0.011, steps: 4, flat: 0.45 });
    }
    // nape: petals pointing down the back of the neck
    for (let i = 0; i < 6; i++) {
      const th = PI + (i - 2.5) * 0.34 + jit(0.05), y = 0.16, { p, n } = scalp(th, y);
      lock({ root: p, n, dir: norm(add(meridian(th, y), [0, -0.3, 0])), length: 0.072 + jit(0.008), lift: 0.3, droop: 0.12, w: 0.038, th: 0.013, off: 0.007, steps: 4, flat: 0.45 });
    }
  } else if (style === 'high_ponytail') {
    const tie = [0, 0.228, -0.066];
    // pulled-back sheets: from the hairline up over the cap to the tie (smooth, so the head reads as combed back)
    for (let i = 0; i < 12; i++) {
      const th = PI * (-1 + 2 * (i + 0.5) / 12);
      const { p, n } = scalp(th, lineOf(th) + 0.004);
      const L = len(sub(tie, p)) * 1.05;
      lock({ root: p, n, dir: dirToward(p, tie), length: L, lift: 0.04, droop: -0.06, w: 0.05, th: 0.006, off: 0.005, steps: 4, shade: 0.9, flat: 0.25 });
    }
    // the tie
    parts.push({
      name: 'tie', us: [0, 0.25, 0.75, 1], segs: 10,
      at(v, a) {
        const c = add(tie, [0, 0.004 - v * 0.012, -0.004 - v * 0.008]), r = 0.012 + 0.0015 * Math.sin(PI * v);
        const q = add(c, [Math.cos(a) * r, 0, Math.sin(a) * r * 0.9]);
        return { p: W(q), w: [['head', 0.4], ['hairA', 0.6]] };
      },
      color: () => colors.tie, rough: 0.6,
    });
    // ponytail: locks fountain up out of the tie, arc back and fall down the back
    const tailBones = (q) => {
      const below = tie[1] - q[1];
      const a = smooth(-0.01, 0.02, below), b = smooth(0.06, 0.13, below), c = smooth(0.17, 0.25, below);
      return [['head', 1 - a], ['hairA', a * (1 - b)], ['hairB', b * (1 - c)], ['hairC', c]];
    };
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * PI * 2 + jit(0.25);
      const root = add(tie, [Math.cos(ang) * 0.007, 0.006, -0.008 + Math.sin(ang) * 0.006]);
      const spread = [Math.cos(ang) * 0.22, 0.75 + R() * 0.4, -1.0 + Math.sin(ang) * 0.3];
      lock({ root, n: [0, 1, -0.3], dir: spread, length: 0.27 + R() * 0.1, lift: 0.1, droop: 0.75 + R() * 0.15, w: 0.044 + R() * 0.012, th: 0.012, off: 0.014, steps: 7, bones: tailBones, curl: [Math.cos(ang) * 0.12, 0, -0.25], flat: 0.4 });
    }
    // a spray of short locks standing above the tie (the volume on top in the reference)
    for (let i = 0; i < 5; i++) {
      const ang = jit(1.2);
      const root = add(tie, [Math.sin(ang) * 0.006, 0.008, -0.004]);
      lock({ root, n: [0, 1, 0], dir: [Math.sin(ang) * 0.8, 0.8, -0.45 + jit(0.3)], length: 0.06 + R() * 0.03, lift: 0.2, droop: 0.4, w: 0.034, th: 0.01, off: 0.012, steps: 4, bones: tailBones, flat: 0.4 });
    }
    // fringe: swept from a side part across the forehead toward her right (-x), and face-framing locks down each cheek
    const bang = (th, y, target, L, w, droop = 0.1, lift = 0.35) => { const { p, n } = scalp(th, y); lock({ root: p, n, dir: dirToward(p, target), length: L, lift, droop, w, th: 0.009, off: 0.006, steps: 5, flat: 0.35 }); };
    // the swoop: from a part on her left, across the forehead and down past her right cheek
    bang(0.5, 0.228, [-0.035, 0.18, 0.112], 0.09, 0.046, 0.05, 0.3);
    bang(0.32, 0.23, [-0.075, 0.168, 0.095], 0.12, 0.044, 0.08, 0.3);
    bang(0.12, 0.228, [-0.095, 0.12, 0.06], 0.17, 0.038, 0.16, 0.28);
    bang(-0.1, 0.222, [-0.094, 0.07, 0.04], 0.18, 0.03, 0.22, 0.3);
    bang(0.7, 0.218, [0.05, 0.175, 0.1], 0.07, 0.032, 0.08, 0.4);
    bang(0.25, 0.232, [0.02, 0.19, 0.11], 0.07, 0.05, 0.05, 0.25);   // v2: covers the part (bare scalp showed)
    // wisps in front of each ear down to the jaw (longer on her right)
    // v2: fuller face-framing locks to below the jaw on both sides (the Codex sheet), plus one over each temple
    for (const sg of [-1, 1]) {
      bang(sg * 1.12, 0.195, [sg * 0.1, sg < 0 ? -0.005 : 0.01, 0.018], sg < 0 ? 0.2 : 0.18, 0.03, 0.32, 0.1);
      bang(sg * 1.3, 0.185, [sg * 0.102, 0.02, -0.014], 0.17, 0.028, 0.32, 0.09);
      bang(sg * 1.5, 0.18, [sg * 0.09, 0.03, -0.04], 0.15, 0.026, 0.3, 0.06);
      bang(sg * 0.95, 0.205, [sg * 0.085, 0.09, 0.06], 0.12, 0.026, 0.22, 0.2);
    }
    bang(0.7, 0.212, [0.075, 0.1, 0.07], 0.12, 0.026, 0.2, 0.15);
  } else if (style === 'long') {
    for (let i = 0; i < 20; i++) {
      const th = PI * (-1 + 2 * (i + 0.5) / 20);
      const front = Math.cos(th) > 0.55;
      const { p, n } = scalp(th, front ? 0.215 : 0.2);
      const dir = front ? [Math.sin(th) * 1.4, -0.3, 0.6] : [Math.sin(th) * 0.4, -1, Math.cos(th) * 0.4 - 0.3];
      lock({ root: p, n, dir, length: front ? 0.08 : 0.26, lift: 0.3, droop: 0.35, w: 0.032, th: 0.007, off: 0.007, steps: front ? 4 : 6, bones: (q) => { const b = smooth(0.06, -0.05, q[1]); return [['head', 1 - b], ['neck', b]]; } });
    }
  } else {   // short
    for (let i = 0; i < 18; i++) {
      const th = PI * (-1 + 2 * (i + 0.5) / 18), y = 0.205 + 0.012 * Math.cos(th);
      const { p, n } = scalp(th, y);
      const dir = Math.cos(th) > 0.5 ? [Math.sin(th) * 0.7 + 0.3, -0.4, 0.6] : [Math.sin(th) * 0.4, -1, Math.cos(th) * 0.4 - 0.2];
      lock({ root: p, n, dir, length: 0.05, lift: 0.4, droop: 0.15, w: 0.03, th: 0.006, off: 0.005, steps: 4 });
    }
    for (let i = 0; i < 6; i++) { const th = (R() * 2 - 1) * 1.2, { p, n } = scalp(th, 0.228); lock({ root: p, n, dir: [Math.sin(th), 0.2, -0.6], length: 0.045, lift: 0.6, droop: 0.12, w: 0.028, th: 0.006, off: 0.006, steps: 3 }); }
  }
  return { parts, scalp: true, lineOf };
}
