// Small maths for the simulation: seeded random numbers, 3D vectors as plain {x,y,z} objects and quaternions as
// {x,y,z,w}. The sim never imports three.js, so it runs the same in node tests and in the browser.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** mulberry32: tiny, fast, seeded (same seed → same sequence). */
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
  return r;
}
/** A stable 32-bit hash of any numbers/strings. */
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e37; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- vectors
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vcopy = a => ({ x: a.x, y: a.y, z: a.z });
export const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vcross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const vlen = a => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vdist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
export const vdist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
export function vnorm(a) { const l = vlen(a); return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 1 }; }
/** a += b * s, in place (hot loops). */
export function vaddTo(a, b, s = 1) { a.x += b.x * s; a.y += b.y * s; a.z += b.z * s; return a; }
export const vlerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// ---------------------------------------------------------------- quaternions
export const qid = () => ({ x: 0, y: 0, z: 0, w: 1 });
export function qmul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
export function qnorm(q) { const l = Math.hypot(q.x, q.y, q.z, q.w) || 1; return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; }
export const qconj = q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export function qaxis(axis, ang) { const s = Math.sin(ang / 2); return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(ang / 2) }; }
/** Rotate vector v by quaternion q. */
export function qrot(q, v) {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}
/** World direction → this body's local frame. */
export const qinv = (q, v) => qrot(qconj(q), v);
/** The rotation that turns unit vector a onto unit vector b. */
export function qfromTo(a, b) {
  const d = vdot(a, b);
  if (d < -0.999999) { let ax = vcross({ x: 1, y: 0, z: 0 }, a); if (vlen(ax) < 1e-6) ax = vcross({ x: 0, y: 1, z: 0 }, a); return qaxis(vnorm(ax), Math.PI); }
  const c = vcross(a, b); return qnorm({ x: c.x, y: c.y, z: c.z, w: 1 + d });
}
/** Integrate an angular velocity (world frame, rad/s) over dt. */
export function qintegrate(q, w, dt) {
  const ang = vlen(w) * dt; if (ang < 1e-9) return q;
  return qnorm(qmul(qaxis(vnorm(w), ang), q));
}
export function qslerp(a, b, t) {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; let bb = b;
  if (cos < 0) { cos = -cos; bb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; }
  if (cos > 0.9995) return qnorm({ x: a.x + (bb.x - a.x) * t, y: a.y + (bb.y - a.y) * t, z: a.z + (bb.z - a.z) * t, w: a.w + (bb.w - a.w) * t });
  const th = Math.acos(cos), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return { x: a.x * wa + bb.x * wb, y: a.y * wa + bb.y * wb, z: a.z * wa + bb.z * wb, w: a.w * wa + bb.w * wb };
}
/** Random unit vector. */
export function vrand(r) { const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z); return { x: s * Math.cos(a), y: s * Math.sin(a), z }; }

// ---------------------------------------------------------------- grid directions
/** The six face directions; a block's `r` (facing) is an index into this list. */
export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const DIRV = DIRS.map(([x, y, z]) => ({ x, y, z }));
export const OPP = [1, 0, 3, 2, 5, 4];
/** Two unit axes perpendicular to face d (u × v = d's direction). */
export function faceAxes(d) {
  const n = DIRV[d];
  const u = Math.abs(n.y) > 0.5 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const v = vcross(n, u);
  return { n, u: vcross(v, n), v };
}
export const dirIndex = (x, y, z) => DIRS.findIndex(d => d[0] === x && d[1] === y && d[2] === z);
