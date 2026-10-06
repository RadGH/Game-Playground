// Thousandvale — footpaths between the places in a zone (stream B, play-test 1 P19: "massive empty areas … more to
// do, routes"). Zone-local, pure, deterministic; called by tools/bake-zone.mjs after the sites are placed and before
// the scatter, so trees keep off the paths.
//
// Every dungeon door, event arena, camp arena (B's sites) and every fort / farm / cave / waystone of stream E's
// placements gets a trail to the nearest road, street, town or earlier trail, routed by A* over a 4 m grid:
//   cost per metre = 1 + (slope / 18°)², × 4 wading, impassable: swimming water (unless a bridge deck), slopes past 42° (walk limit 46°),
//   stream E's discs (+2 m), building plots, and the 16 m next to a zone edge (so neighbours still agree bit for
//   bit — a trail never touches an edge).
// The result is painted as road surface 2.2 m wide (the same paint as roads: the client draws it, nav marks it ROAD,
// the scatter keeps a verge) but the ground is NOT reshaped, so stream E's placements stay valid. Returned as
// `path` placements: { id, from, to, pts [[x, z, h]…], width }.

const CELL = 4;
const EDGE = 16;
const MAX_LEN = 1600;          // metres of trail at most; a place further from everything stays wild
export const PATH_WIDTH = 2.2;

/** Binary-heap A*-free Dijkstra to the nearest goal cell (multi-target): returns the cell path or null. */
function route(N, cost, goal, start, maxCost) {
  const dist = new Float64Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1);
  const heap = [], push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  dist[start] = 0; push(start, 0);
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k]) continue;
    if (goal[k] && k !== start) { const out = []; for (let q = k; q >= 0; q = from[q]) out.push(q); return out.reverse(); }
    if (d > maxCost) return null;
    const i = k % N, j = (k / N) | 0;
    for (const [di, dj, m] of D) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = nj * N + ni, c = cost[n]; if (!(c < Infinity)) continue;
      const nd = d + (c + cost[k]) * 0.5 * m * CELL;
      if (nd < dist[n]) { dist[n] = nd; from[n] = k; push(n, nd); }
    }
  }
  return null;
}

/**
 * ctx: { t (terrain reader), biome (Uint8Array SIZE², painted in place), SIZE, STEP, ZM, roadId, sites (meta.sites),
 *        vignettes (stream E placements), plans (proctown plans, zone origin on plan.origin) }
 */
export function layPaths(ctx) {
  const { t, biome, SIZE, STEP, ZM, roadId, sites, vignettes, plans, blocked = null, extraStarts = [] } = ctx;
  const N = ZM / CELL;
  const cost = new Float32Array(N * N), goal = new Uint8Array(N * N);
  const discs = vignettes.filter(v => v.radius > 0).map(v => ({ x: v.x, z: v.z, r: v.radius + 2 }));
  const towns = sites.filter(s => s.type === 'settlement' && Number.isFinite(s.radius));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, k = j * N + i;
    if (x < EDGE || z < EDGE || x > ZM - EDGE || z > ZM - EDGE) { cost[k] = Infinity; continue; }
    const mv = t.moveAt(x, z);
    if (mv === 'steep' || (mv === 'swim' && Number.isNaN(t.deckAt(x, z)))) { cost[k] = Infinity; continue; }
    const s = t.slopeAt(x, z);
    if (s > 42 || (blocked && blocked(x, z))) { cost[k] = Infinity; continue; }
    cost[k] = (1 + (s / 18) ** 2) * (mv === 'wade' ? 4 : 1);
    if (biome[Math.round(z / STEP) * SIZE + Math.round(x / STEP)] === roadId) goal[k] = 1;
    if (towns.some(tw => Math.hypot(tw.x - x, tw.z - z) < tw.radius)) goal[k] = 1;
  }
  const block = (cx, cz, r) => {
    for (let j = Math.max(0, Math.floor((cz - r) / CELL)); j <= Math.min(N - 1, Math.floor((cz + r) / CELL)); j++)
      for (let i = Math.max(0, Math.floor((cx - r) / CELL)); i <= Math.min(N - 1, Math.floor((cx + r) / CELL)); i++)
        if (Math.hypot((i + 0.5) * CELL - cx, (j + 0.5) * CELL - cz) <= r + CELL * 0.5) { cost[j * N + i] = Infinity; goal[j * N + i] = 0; }
  };
  for (const d of discs) block(d.x, d.z, d.r);
  for (const pl of plans) for (const p of pl.plots) block(pl.origin.x + p.cx, pl.origin.z + p.cz, Math.hypot(p.w, p.d) / 2);

  // where each trail starts: just outside the place, on the side facing the nearest goal
  const starts = [];
  for (const s of sites) {
    if (s.type === 'dungeon') starts.push({ id: s.id, x: s.x + Math.sin(s.yaw) * 7, z: s.z + Math.cos(s.yaw) * 7, r: 0 });
    else if (s.type === 'event' || s.type === 'camp') starts.push({ id: s.id, x: s.x, z: s.z, r: s.r });
  }
  // set pieces (play-test 2): a farmyard's rim, a graveyard / orchard gate, a clearing's middle (blocked cells are skipped)
  for (const e of extraStarts) starts.push({ id: e.id, x: e.x, z: e.z, r: e.r || 0, ...(e.r ? { disc: true } : {}) });
  for (const v of vignettes) if (['fort', 'farm', 'cave', 'waystone'].includes(v.type)) starts.push({ id: v.id, x: v.x, z: v.z, r: (v.radius || 0) + 2 + CELL * 1.25, disc: v.radius > 0 });
  const cellOf = (x, z) => Math.min(N - 1, Math.max(0, Math.floor(z / CELL))) * N + Math.min(N - 1, Math.max(0, Math.floor(x / CELL)));
  const paths = [];
  for (const st of starts) {
    // pick a start cell on the rim (or the point itself) that is passable — 16 bearings, nearest goal by straight line
    let start = -1;
    const cands = st.r > 0 ? Array.from({ length: 16 }, (_, a) => [st.x + Math.cos(a / 16 * 2 * Math.PI) * st.r, st.z + Math.sin(a / 16 * 2 * Math.PI) * st.r]) : [[st.x, st.z]];
    let bestD = Infinity;
    for (const [x, z] of cands) {
      const k = cellOf(x, z); if (!(cost[k] < Infinity) || goal[k]) continue;
      // straight-line distance to the nearest goal cell (coarse scan every 8th cell is plenty to choose a side)
      let d = Infinity; for (let q = 0; q < N * N; q += 7) if (goal[q]) d = Math.min(d, Math.hypot((q % N + 0.5) * CELL - x, (((q / N) | 0) + 0.5) * CELL - z));
      if (d < bestD) { bestD = d; start = k; }
    }
    if (start < 0 || bestD > MAX_LEN) continue;
    const cells = route(N, cost, goal, start, MAX_LEN * 2.2);
    if (!cells || cells.length < 3) continue;
    // cells → points, Chaikin twice (keeps the ends), heights from the ground
    let pts = cells.map(k => [(k % N + 0.5) * CELL, (((k / N) | 0) + 0.5) * CELL]);
    for (let pass = 0; pass < 2; pass++) {
      const nl = [pts[0]];
      for (let q = 0; q < pts.length - 1; q++) { const a = pts[q], b = pts[q + 1]; nl.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      nl.push(pts[pts.length - 1]); pts = nl;
    }
    let len = 0; for (let q = 1; q < pts.length; q++) len += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]);
    if (len > MAX_LEN) continue;
    const endK = cells[cells.length - 1], endX = (endK % N + 0.5) * CELL, endZ = (((endK / N) | 0) + 0.5) * CELL;
    const town = towns.find(tw => Math.hypot(tw.x - endX, tw.z - endZ) < tw.radius);
    // paint, and make this trail a goal for the next ones (trails join into a network)
    const half = PATH_WIDTH / 2;
    for (let q = 0; q < pts.length - 1; q++) {
      const a = pts[q], b = pts[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s <= L; s += 0.5) {
        const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L;
        for (let j = Math.max(0, Math.floor((z - half) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((z + half) / STEP)); j++)
          for (let i = Math.max(0, Math.floor((x - half) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((x + half) / STEP)); i++) {
            if (Math.hypot(i * STEP - x, j * STEP - z) > half + 0.01) continue;
            if (t.waterAt(i * STEP, j * STEP).depth > 0) continue;
            biome[j * SIZE + i] = roadId;
          }
        goal[cellOf(x, z)] = 1;
      }
    }
    paths.push({ id: `path_${st.id}`, from: st.id, to: town ? `town:${town.name}` : 'road', width: PATH_WIDTH, pts: pts.filter((_, q) => q % 2 === 0 || q === pts.length - 1).map(([x, z]) => [+x.toFixed(2), +z.toFixed(2), +t.groundAt(x, z).toFixed(2)]) });
  }
  return paths;
}
