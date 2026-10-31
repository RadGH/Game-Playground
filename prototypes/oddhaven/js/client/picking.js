// What did that tap land on? A person first (their screen position, with a thumb's slack), then a car (its driver), then the
// first building the ray meets, then a park. Pure apart from the projection passed in, so a node test can run it.
//   pick({ sx, sy, people, cars, buildings, parks, project, ray, ground })  -> { kind:'person', id } | { kind:'building', b } | { kind:'park', block } | null

export function rayHitsBox(ray, b) {
  // into the building's own frame, then the usual slab test
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), ox = ray.origin.x - b.x, oz = ray.origin.z - b.z, oy = ray.origin.y - b.y;
  const lx = ox * c - oz * s, lz = ox * s + oz * c, dx = ray.direction.x * c - ray.direction.z * s, dz = ray.direction.x * s + ray.direction.z * c, dy = ray.direction.y;
  let t0 = 0, t1 = 1e6;
  for (const [o, d, lo, hi] of [[lx, dx, -b.w / 2, b.w / 2], [oy, dy, 0, b.h], [lz, dz, -b.d / 2, b.d / 2]]) {
    if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / d, e = (hi - o) / d;
    if (a > e) [a, e] = [e, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, e);
    if (t0 > t1) return null;
  }
  return t0;
}
function inLoop(loop, x, z) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ax, az] = loop[i], [bx, bz] = loop[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
export function pick({ sx, sy, people, project, ray, ground, buildings, parks, reach = 34 }) {
  let best = null, bd = reach;
  for (const p of people) {
    const s = project(p.x, p.y + 0.8, p.z); if (!s) continue;
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) return { kind: 'person', id: best.id };
  let hit = null, ht = Infinity;
  for (const b of buildings) { const t = rayHitsBox(ray, b); if (t != null && t < ht) { ht = t; hit = b; } }
  if (hit) return { kind: 'building', b: hit };
  if (ground) for (const k of parks) if (inLoop(k.loop, ground.x, ground.z)) return { kind: 'park', block: k };
  return null;
}
