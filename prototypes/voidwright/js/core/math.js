// Small maths helpers + a seeded random number generator (same seed → same sequence).

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
/** Signed smallest difference between two angles, in (-PI, PI]. */
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const wrapAng = a => { a %= TAU; return a < 0 ? a + TAU : a; };
/** Turn `a` toward `b` by at most `step` radians. */
export const turnToward = (a, b, step) => { const d = angDiff(a, b); return Math.abs(d) <= step ? b : a + Math.sign(d) * step; };

/** mulberry32: tiny, fast, seeded. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.weighted = (items, w = x => x.weight) => {
    let tot = 0; for (const it of items) tot += w(it);
    let v = r() * tot;
    for (const it of items) { v -= w(it); if (v <= 0) return it; }
    return items[items.length - 1];
  };
  r.state = () => s;
  return r;
}

/** Hash a string or numbers into a 32-bit seed. */
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e37; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Cheap 2D value noise for backgrounds and planet surfaces. */
export function noise2(seed) {
  const perm = new Uint8Array(512); const r = rng(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256); for (let i = 0; i < 256; i++) val[i] = r();
  const fade = t => t * t * (3 - 2 * t);
  const at = (x, y) => val[perm[(perm[x & 255] + y) & 511] & 255];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  n.fbm = (x, y, oct = 4) => { let a = 0.5, f = 1, s = 0, t = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; } return s / t; };
  return n;
}
