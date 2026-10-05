// Telegraph geometry for drawing (pure: no three.js, so node tests check it against the server's
// js/rules/telegraph.js `inside`). Local frame: +z = the shape's facing (yaw), +x = across it.

/** Fill coordinate f (0..1, where the sweep has reached), distance to the outline e (m), stripe coordinate s. */
/** Local-frame field values for a point (lx = across, lz = forward along yaw). */
export function fieldAt(t, lx, lz) {
  const d = Math.hypot(lx, lz);
  switch (t.shape) {
    case 'circle': return { f: d / t.r, e: t.r - d, s: d };
    case 'ring': case 'donut': {
      const r2 = t.r2 || 0;
      return { f: (t.r - d) / Math.max(0.01, t.r - r2), e: Math.min(t.r - d, d - r2), s: t.r - d };
    }
    case 'cone': {
      const off = Math.abs(Math.atan2(lx, lz));
      const side = d * Math.sin(Math.max(0, t.arc / 2 - off));
      return { f: d / t.r, e: Math.min(t.r - d, t.arc >= Math.PI * 1.99 ? 1e9 : side), s: d };
    }
    case 'line': return { f: lz / t.len, e: Math.min(t.w / 2 - Math.abs(lx), lz, t.len - lz), s: lz };
    case 'cross': {
      const arm = (u, v) => Math.min(t.w / 2 - Math.abs(v), t.r - Math.abs(u));
      const e1 = arm(lz, lx), e2 = arm(lx, lz);
      const f = e1 >= e2 ? Math.abs(lz) / t.r : Math.abs(lx) / t.r;
      return { f, e: Math.max(e1, e2), s: e1 >= e2 ? Math.abs(lz) : Math.abs(lx) };
    }
  }
  return { f: 0, e: 0, s: 0 };
}

/** Points + triangles covering the shape in its local frame. */
export function localMesh(t) {
  const pts = [], idx = [];
  const grid = (us, vs, map) => {   // us × vs parameter grid -> local points through map(u, v)
    const base = pts.length / 2;
    for (let j = 0; j < vs.length; j++) for (let i = 0; i < us.length; i++) { const [x, z] = map(us[i], vs[j]); pts.push(x, z); }
    const n = us.length;
    for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = base + j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  };
  const steps = (a, b, size) => { const n = Math.max(2, Math.min(60, Math.ceil(Math.abs(b - a) / size))); return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n); };
  if (t.shape === 'circle' || t.shape === 'ring' || t.shape === 'donut' || t.shape === 'cone') {
    const r0 = t.shape === 'circle' || t.shape === 'cone' ? 0 : (t.r2 || 0);
    const arc = t.shape === 'cone' ? Math.min(Math.PI * 2, t.arc) : Math.PI * 2;
    const radii = steps(r0, t.r, Math.max(0.35, t.r / 24));
    const angs = steps(-arc / 2, arc / 2, Math.max(0.04, 0.7 / Math.max(1, t.r)));
    grid(angs, radii, (a, rho) => [Math.sin(a) * rho, Math.cos(a) * rho]);
  } else if (t.shape === 'line') {
    grid(steps(-t.w / 2, t.w / 2, 0.5), steps(0, t.len, 0.6), (x, z) => [x, z]);
  } else if (t.shape === 'cross') {
    const h = t.w / 2, r = t.r;
    grid(steps(-h, h, 0.5), steps(-r, r, 0.6), (x, z) => [x, z]);          // the arm along yaw
    grid(steps(h, r, 0.6), steps(-h, h, 0.5), (x, z) => [x, z]);           // the cross arm, right half
    grid(steps(-r, -h, 0.6), steps(-h, h, 0.5), (x, z) => [x, z]);         // and left half
  }
  return { pts, idx };
}

