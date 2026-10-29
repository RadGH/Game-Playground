// Kestrel (opus) — small maths helpers shared by every builder. Pure, no Three.js.

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const gauss = (d, w) => Math.exp(-(d * d) / (w * w));
/** Shortest signed angle a - b, wrapped to -PI..PI. */
export const adiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const TAU = Math.PI * 2;

/** Superellipse radius in direction (sx, cz) for half-axes a (x) and b (z), exponent p (2 = ellipse, higher = squarer). */
export function superR(sx, cz, a, b, p) {
  const v = Math.pow(Math.abs(sx) / a, p) + Math.pow(Math.abs(cz) / b, p);
  return v > 0 ? Math.pow(v, -1 / p) : Math.max(a, b);
}

/**
 * A table of rows [u, v0, v1, ...] sampled with Catmull-Rom between rows (rows sorted by u). Values outside the table
 * clamp to its ends. `table(u)` returns an array of the row values (u itself is not returned).
 */
export function table(rows) {
  const n = rows.length, w = rows[0].length - 1, out = new Array(w);
  return function at(u) {
    if (u <= rows[0][0]) { for (let k = 0; k < w; k++) out[k] = rows[0][k + 1]; return out; }
    if (u >= rows[n - 1][0]) { for (let k = 0; k < w; k++) out[k] = rows[n - 1][k + 1]; return out; }
    let i = 0; while (i < n - 2 && rows[i + 1][0] < u) i++;
    const r0 = rows[Math.max(0, i - 1)], r1 = rows[i], r2 = rows[i + 1], r3 = rows[Math.min(n - 1, i + 2)];
    const t = (u - r1[0]) / (r2[0] - r1[0]);
    // uniform Catmull-Rom on values, tangents scaled by the spacing so uneven rows do not overshoot much
    const d1 = r2[0] - r1[0], d0 = r1[0] - r0[0] || d1, d2 = r3[0] - r2[0] || d1;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    for (let k = 1; k <= w; k++) {
      const p1 = r1[k], p2 = r2[k];
      // tangents: finite differences over the neighbouring rows (in u units), limited to avoid wobble
      let m1 = (r2[k] - r0[k]) / (d0 + d1) * d1, m2 = (r3[k] - r1[k]) / (d1 + d2) * d1;
      if (i === 0) m1 = p2 - p1;
      if (i + 1 === n - 1) m2 = p2 - p1;
      // monotone-ish: if the segment is flat or the neighbours turn, damp the tangent (no bulges between rows)
      const dd = p2 - p1;
      if (dd === 0) { m1 = 0; m2 = 0; }
      else { if (m1 / dd < 0) m1 = 0; if (m2 / dd < 0) m2 = 0; const a = m1 / dd, b = m2 / dd, s = a * a + b * b; if (s > 9) { const tt = 3 / Math.sqrt(s); m1 *= tt; m2 *= tt; } }
      out[k - 1] = h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
    }
    return out;
  };
}

/** Seeded random (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// tiny vector helpers on plain arrays
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** Rotate vector v about unit axis k by angle a (Rodrigues). */
export function rot(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, v), x = cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
}

/** Colour helpers: hex → linear [r,g,b] (Three's vertex colours are linear). */
const toL = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
export function hexLin(hex, fallback = '#808080') {
  let h = String(hex || fallback).trim();
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) h = fallback;
  h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [toL((n >> 16 & 255) / 255), toL((n >> 8 & 255) / 255), toL((n & 255) / 255)];
}
export const cmul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const cmix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
