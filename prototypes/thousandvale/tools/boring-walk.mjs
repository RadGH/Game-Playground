// Stream E — "longest boring walk ≤ 250 m" (PLAN §16, the content-density gate), over a whole province.
//
// A point of interest (POI) is anything a walker notices: every stream E placement and feature (vignettes, forts,
// farms, caves, camps, rares, waystones, NPCs, hooks, treasure marks) and stream B's settlements, doors, event/camp
// arenas, crossings, landmarks, lairs, bridges and named lakes. You notice a POI within SIGHT metres of its edge.
// Two measures, both must be ≤ LIMIT (250 m):
//   road  — walking every road polyline, the longest continuous stretch with no POI in sight;
//   open  — cross-country: with D = the farthest any walkable, reachable sample lies from a POI's edge, a straight
//           line through that emptiest pocket is out of sight of everything for at most 2·(D − SIGHT).
// Usable from tests and from stream B's tools/lib/province-reach.mjs:  boringWalk(zones, { reachable })
//   zones = [{ gx, gy, nav, bake (B placements[]), file (E placements file) }]
export const SIGHT = 60, LIMIT = 250, RIM = 40;

export function poisOf(z) {
  const out = [];
  for (const p of [...(z.file ? z.file.placements : []), ...(z.file ? z.file.features || [] : [])]) {
    out.push({ x: p.x, z: p.z, r: p.radius || 2 });
    if (p.pts) for (const [x, zz] of p.pts) out.push({ x, z: zz, r: 2 });
  }
  for (const b of z.bake) {
    if (b.kind === 'settlement') out.push({ x: b.x, z: b.z, r: b.data.radius });
    else if (['dungeon_door', 'crossing', 'landmark', 'lair', 'bridge', 'pass', 'dungeon'].includes(b.kind)) out.push({ x: b.x, z: b.z, r: 8 });
    else if (b.kind === 'event_site' || b.kind === 'camp_site') out.push({ x: b.x, z: b.z, r: b.data.r || 20 });
    else if (b.kind === 'lake' && b.data.name) out.push({ x: b.x, z: b.z, r: b.data.r });
  }
  return out;
}

/**
 * -> { road: { worst, at:{zone,x,z,road} }, open: { worst, D, at:{zone,x,z} }, pockets: [{zone,x,z,d}] (largest first) }
 * `reachable(gi)` = is province sample gi in the hub's walk component (pass the label test), else every walkable sample counts.
 */
export function boringWalk(zones, { reachable = null, sight = SIGHT } = {}) {
  const S = zones[0].nav.size, E = S - 1, step = zones[0].nav.step, ZM = E * step;
  const gw = Math.max(...zones.map(z => z.gx)) + 1, gh = Math.max(...zones.map(z => z.gy)) + 1;
  const W = gw * E + 1, H = gh * E + 1;
  // distance field (metres) from every POI's edge, chamfer over the open plane (walls do not block sight)
  const INF = 1e9, d = new Float32Array(W * H).fill(INF);
  const pois = [];
  for (const z of zones) for (const p of poisOf(z)) pois.push({ x: z.gx * ZM + p.x, z: z.gy * ZM + p.z, r: p.r });
  for (const p of pois) {
    const r = Math.ceil(p.r / step);
    const ci = Math.round(p.x / step), cj = Math.round(p.z / step);
    for (let j = Math.max(0, cj - r); j <= Math.min(H - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(W - 1, ci + r); i++)
      if ((i - ci) ** 2 + (j - cj) ** 2 <= r * r) d[j * W + i] = 0;
  }
  const o = step, g = step * Math.SQRT2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + o); if (j > 0) { v = Math.min(v, d[k - W] + o); if (i > 0) v = Math.min(v, d[k - W - 1] + g); if (i < W - 1) v = Math.min(v, d[k - W + 1] + g); } d[k] = v; }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; let v = d[k];
    if (i < W - 1) v = Math.min(v, d[k + 1] + o); if (j < H - 1) { v = Math.min(v, d[k + W] + o); if (i < W - 1) v = Math.min(v, d[k + W + 1] + g); if (i > 0) v = Math.min(v, d[k + W - 1] + g); } d[k] = v; }
  const at = (x, z) => d[Math.round(z / step) * W + Math.round(x / step)];
  // open ground: the emptiest reachable walkable sample (zone by zone so pockets can be reported per zone)
  const pockets = [];
  for (const z of zones) {
    let best = 0, bx = 0, bz = 0;
    for (let j = 0; j < S; j += 2) for (let i = 0; i < S; i += 2) {
      const b = z.nav.bits[j * S + i];
      if (!(b & 1) || (b & (8 | 32 | 128))) continue;               // WALK, not DEEP/SOLID/BUILDING
      const gi = (z.gy * E + j) * W + z.gx * E + i;
      if (reachable && !reachable(gi)) continue;
      // the province's OUTER rim borders zones that are not part of it: a walker there is leaving, not wandering
      const px = z.gx * ZM + i * step, pz = z.gy * ZM + j * step;
      if (px < RIM || pz < RIM || px > gw * ZM - RIM || pz > gh * ZM - RIM) continue;
      if (d[gi] > best) { best = d[gi]; bx = i * step; bz = j * step; }
    }
    pockets.push({ zone: z.id || `${z.gx},${z.gy}`, x: bx, z: bz, d: Math.round(best) });
  }
  pockets.sort((a, b) => b.d - a.d);
  const D = pockets[0] ? pockets[0].d : 0;
  // roads: every polyline, sampled every 4 m, longest run with nothing in sight
  let road = { worst: 0, at: null };
  for (const z of zones) for (const r of z.bake.filter(b => b.kind === 'road')) {
    let run = 0, start = null, cut = null;
    const pts = r.data.pts.filter(q => q[0] >= 0 && q[1] >= 0 && q[0] <= ZM && q[1] <= ZM);
    for (let k = 1; k < pts.length; k++) {
      const [x0, z0] = pts[k - 1], [x1, z1] = pts[k], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 4));
      for (let s = 0; s < n; s++) {
        const x = x0 + (x1 - x0) * s / n, zz = z0 + (z1 - z0) * s / n;
        if (at(z.gx * ZM + x, z.gy * ZM + zz) > sight) {
          if (!run) { start = { x: Math.round(x), z: Math.round(zz) }; cut = null; }
          run += L / n;
          if (!cut && run >= LIMIT / 2) cut = { x: Math.round(x), z: Math.round(zz) };   // where a filler splits the run
          if (run > road.worst) road = { worst: Math.round(run), at: { zone: z.id, road: r.id, ...start }, cut };
        } else run = 0;
      }
    }
  }
  return { road, open: { worst: Math.max(0, Math.round(2 * (D - sight))), D, at: pockets[0] }, pockets, distAt: at, ZM };
}
