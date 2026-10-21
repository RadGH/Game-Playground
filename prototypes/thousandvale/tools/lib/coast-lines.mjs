// Thousandvale — the roads and rivers as they are BUILT, cut at the shore (Coast stream, play-test 11 Z4, live #4:
// "random rivers and roads spilling out of the island and running into the ocean. They should stop at the shoreline").
//
// The world bake (data/world/world.json) still holds World Forge's pangea: rivers and roads that ran on across land that is
// open sea since the world became islands (2026-10-14), and, inside Vharlen's block, the old mainland's lines under a
// different island altogether. The map drew those. These are the lines the map (tools/bake-map.mjs -> map.json, read by
// js/client/ui/map-load.js) draws instead:
//   roads   every road the zone bakes laid (data/zones/<zone>/placements.json kind 'road': world roads, spurs, farm lanes,
//           an island's own roads), each zone's own stretch, in world metres — so only roads you can walk, on both islands
//   rivers  the world rivers (with the bays applied: tools/lib/world-core.mjs coastWorld) that run through a playable
//           block continent, from where they rise on land to their MOUTH: the first point where they reach the sea
//           (nothing downstream of it); none inside an island continent's block (the island has its own waters)
// Pure apart from what it is handed. tests/B/coast.test.js checks no segment of either lies over open sea.

/**
 * An island with its OWN waters (Vharlen): the world rivers under its block are the old mainland's and are not drawn.
 * Torbor Downs regenerated (play-test 12, #81, profile 'downs') became an island too, but keeps the world rivers —
 * world-core downsWorld re-fits them to its new hills — so they are drawn.
 */
export const ownWaters = c => c.kind === 'island' && c.profile !== 'downs';

/** Is (x, z) open sea on the far horizon? (sea level water, not a lake or a river sheet) */
export const seaAt = (H, x, z) => { const w = H.waterAt(x, z); return !!w && w.surface < 0.5 && w.depth > 0.6; };

/**
 * Split a polyline [[x, z, …]…] into the runs where `wet(x, z)` is false, each cut exactly (by bisection) where it
 * crosses into or out of the wet. -> [[[x, z]…]…]
 */
export function dryRuns(pts0, wet, step = 4) {
  // every `step` metres is tested, not only the vertices (a long straight stretch can cross a cove between two of them)
  const pts = [];
  for (let k = 0; k < pts0.length; k++) {
    const p = pts0[k]; pts.push(p);
    const q = pts0[k + 1]; if (!q) break;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.floor(L / step);
    for (let i = 1; i < n; i++) pts.push([p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n, 'mid']);
  }
  const runs = []; let cur = [];
  const edge = (a, b) => {          // a dry, b wet (or the other way): the crossing between them
    const aw = wet(a[0], a[1]); let lo = 0, hi = 1;
    for (let k = 0; k < 20; k++) { const t = (lo + hi) / 2; if (wet(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) === aw) lo = t; else hi = t; }
    const t = aw ? hi : lo; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], w = wet(p[0], p[1]);
    if (k > 0) { const q = pts[k - 1], qw = wet(q[0], q[1]); if (qw !== w) { const e = edge(q, p); if (w) { cur.push(e); runs.push(cur); cur = []; } else cur.push(e); } }
    if (!w && p[2] !== 'mid') cur.push([p[0], p[1]]);
  }
  if (cur.length) runs.push(cur);
  return runs.filter(r => r.length >= 2);
}

/** Clip a polyline to an axis-aligned square [x0, z0, x1, z1] (the stretch a zone owns). */
export function clipToRect(pts, [x0, z0, x1, z1]) {
  return dryRuns(pts, (x, z) => x < x0 || z < z0 || x > x1 || z > z1);
}

/**
 * The map's lines. W = the world bake WITH the bays applied (tools/bake-zone.mjs loadWorld().json), H = the parsed horizon,
 * PMAP = data/world/province-map.json provinces, CONTINENTS + continentRect from world-core, placementsOf(zoneId) -> B's
 * placements array or null. -> { roads: [{ id, cls, width, pts }], rivers: [{ id, name, cls, pts }] }  (world metres)
 */
export function builtLines({ W, H, PMAP, CONTINENTS, continentRect, placementsOf }) {
  const ZM = W.grid?.zoneMetres || 2048;
  const playable = Object.values(PMAP).map(p => [p.block[0] * ZM, p.block[1] * ZM, (p.block[0] + p.size[0]) * ZM, (p.block[1] + p.size[1]) * ZM]);
  const islands = CONTINENTS.filter(ownWaters).map(continentRect);
  const inRect = (r, x, z) => x >= r[0] && z >= r[1] && x < r[2] && z < r[3];
  const inIsland = (x, z) => islands.some(r => x >= r.x0 && z >= r.z0 && x < r.x1 && z < r.z1);
  const roads = [];
  for (const p of Object.values(PMAP)) for (const zid of Object.values(p.map || {})) {
    const P = placementsOf(zid); if (!P) continue;
    const m = /^z(\d+)_(\d+)$/.exec(zid), ox = +m[1] * ZM, oz = +m[2] * ZM;
    for (const r of P.filter(q => q.kind === 'road' && q.data?.pts?.length > 1)) {
      const pts = r.data.pts.map(([x, z]) => [x + ox, z + oz]);
      for (const run of clipToRect(pts, [ox, oz, ox + ZM, oz + ZM])) for (const dry of dryRuns(run, (x, z) => seaAt(H, x, z)))
        roads.push({ id: `${zid}:${r.id}`, cls: r.data.cls || 'road', width: r.data.width || 4, pts: dry });
    }
  }
  const rivers = [];
  for (const r of W.rivers) {
    if (!r.pts.some(p => playable.some(b => inRect(b, p[0], p[1])) && !inIsland(p[0], p[1]))) continue;
    // from the first point on land to the first point in the sea (a river never comes back out of it)
    const runs = dryRuns(r.pts, (x, z) => seaAt(H, x, z) || inIsland(x, z));
    let run = runs.find(q => q.some(p => playable.some(b => inRect(b, p[0], p[1]))));
    if (!run) continue;
    // a river whose upper course was the old mainland, now under the sea, would rise out of the sea: it enters the map at
    // the island's edge instead (where its baked water starts too)
    if (run[0][0] !== r.pts[0][0] || run[0][1] !== r.pts[0][1]) {
      const inP = (x, z) => playable.some(b => inRect(b, x, z));
      const i = run.findIndex(p => inP(p[0], p[1]));
      if (i > 0) {
        const a = run[i - 1], b = run[i]; let lo = 0, hi = 1;
        for (let k = 0; k < 20; k++) { const t = (lo + hi) / 2; if (inP(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) hi = t; else lo = t; }
        run = [[a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi], ...run.slice(i)];
      }
    }
    rivers.push({ id: r.id, name: r.name || null, cls: Math.max(...r.pts.map(p => p[3] || 1)), pts: run });
  }
  return { roads, rivers };
}
