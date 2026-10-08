// Thousandvale — is the way from a town gate to the town square a clear main street? (stream W, play-test 8 W6,
// report #27: "improve gate/road placement at Torborhold; it just leads you right into buildings instead of having a
// main road"). One function the test (tests/B/gate-streets.test.js, on the checked-in files), the table tool
// (tools/gate-streets.mjs) and the bake all call, so "clear" means one thing.
//
//   measureGates({ P, nav, bodies }) -> [{ town, kind, gate, wayKind, gateKind, road, hasMain, width, metres, blocked,
//                                           narrowest, ahead, firstAhead, navBlocked, hits: [what stands in it] }]
//     P       placements.json `placements` (zone metres)
//     nav     parseNav() of nav.bin, or null (then navBlocked is null)
//     bodies  stream E's rows with a footprint, [{ id, type, x, z, radius }] (people — npc / folk / guard — are left out:
//             they walk); pass the rows of <zone>.json and <zone>.quest.json
//
// THE ROUTE that is measured:
//   - a gate baked with `main` (W6): that polyline, gate -> edge of the square, at its own width
//   - a gate without one (data from before W6, or a side gate only a footpath uses): the best the street plan offers —
//     from the gate's inner mouth to the nearest street, the shortest way along the street centrelines to the point
//     nearest the square, then straight to the square's edge — held against the width a main street of that size of
//     settlement SHOULD have (HIGH_STREET_WIDTH), so before and after are measured with one yardstick
// THE NUMBERS:
//   metres     length of the route
//   blocked    metres of it where something with a footprint stands within half the width of the centreline
//   narrowest  the narrowest clear width anywhere along it = 2 x the smallest distance from the centreline to anything
//              (capped at 16 m; 0 = the centreline itself runs through a building)
//   ahead      metres you can walk STRAIGHT ON from the gate along the road's own line before a building or a wall is
//              in your way (capped at 60 m, or stops at the square) — "the first thing inside a gate is road, not a house"
//   navBlocked metres of the route's centreline that nav.bin says cannot be walked
// What has a footprint: building plots (the whole plot: a house may fill it), set-piece buildings, the wall's runs and
// towers, the well and the market stalls (js/client/town-square.js), and stream E's rows with a radius.
import { squareFurniture } from '../../js/client/town-square.js';

/** A main street's width by settlement kind (metres). The bake lays them this wide; the yardstick for old data. */
export const HIGH_STREET_WIDTH = { hamlet: 3.6, village: 4.2, town: 5, city: 6, capital: 6 };
/** Rows of stream E's that are people, not things: they are not "in the road". */
export const WALKERS = new Set(['npc', 'folk', 'guard', 'camp', 'monster', 'traveller']);

const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
const boxDist = (x, z, b) => {
  const dx = x - b.x, dz = z - b.z, lx = Math.abs(dx * b.c + dz * b.s) - b.w / 2, lz = Math.abs(-dx * b.s + dz * b.c) - b.d / 2;
  return lx <= 0 && lz <= 0 ? 0 : Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
};
const lengthOf = pts => pts.reduce((s, p, k) => s + (k ? Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
/** Points every `step` metres along a polyline (always includes both ends). */
export function walk(pts, step = 0.5) {
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let q = k ? 1 : 0; q <= n; q++) out.push([a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n]);
  }
  return out;
}

/** Everything with a footprint in one town: -> { clearance(x, z) -> { d, what }, boxes, discs, segs }. */
export function townObstacles({ P, town, bodies = [] }) {
  const S = P.find(p => p.kind === 'settlement' && p.id === town);
  const W = P.find(p => p.kind === 'town_wall' && p.data.town === town);
  const sq = P.find(p => p.kind === 'town_square' && p.data.town === town);
  const boxes = [], discs = [], segs = [];
  for (const p of P) {
    if (p.kind === 'building' && p.data.town === town) boxes.push({ id: p.id, x: p.x, z: p.z, w: p.data.w, d: p.data.d, c: Math.cos(p.data.angle), s: Math.sin(p.data.angle), what: (p.data.office ? 'office ' : 'house ') + p.id });
    if (p.kind === 'set_building' && S && Math.hypot(p.x - S.x, p.z - S.z) < S.data.radius + 20 && p.data?.w) boxes.push({ id: p.id, x: p.x, z: p.z, w: p.data.w, d: p.data.d, c: Math.cos(p.data.angle ?? 0), s: Math.sin(p.data.angle ?? 0), what: 'building ' + p.id });
  }
  if (W) {
    for (const r of W.data.runs) for (let k = 0; k < r.length - 1; k++) segs.push({ a: r[k], b: r[k + 1], r: W.data.thick / 2, what: 'the wall' });
    for (const t of W.data.towers) discs.push({ x: t.x, z: t.z, r: 2.4, what: 'a wall tower' });
  }
  if (sq) {
    const f = squareFurniture({ square: { x: sq.x, z: sq.z, r: sq.data.r }, stalls: sq.data.stalls });
    discs.push({ ...f.well, what: 'the well' });
    f.stalls.forEach((s, k) => discs.push({ ...s, what: `market stall ${k}` }));
  }
  if (S) for (const b of bodies) {
    if (!Number.isFinite(b.x) || WALKERS.has(b.type) || Math.hypot(b.x - S.x, b.z - S.z) > S.data.radius + 10) continue;
    discs.push({ x: b.x, z: b.z, r: b.radius || 0.5, what: `${b.type} ${b.id}` });
  }
  const clearance = (x, z) => {
    let d = Infinity, what = null;
    for (const b of boxes) { const q = boxDist(x, z, b); if (q < d) { d = q; what = b.what; } }
    for (const c of discs) { const q = Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r); if (q < d) { d = q; what = c.what; } }
    for (const s of segs) { const q = Math.max(0, segDist(x, z, s.a, s.b) - s.r); if (q < d) { d = q; what = s.what; } }
    return { d, what };
  };
  return { S, W, sq, boxes, discs, segs, clearance };
}

/** The best route the street plan offers from (x, z) to the square (for data with no `main`). */
function planRoute(P, town, from, sq) {
  const streets = P.filter(p => p.kind === 'street' && p.data.town === town);
  const nodes = [];                       // [x, z, street index]
  streets.forEach((s, si) => { for (const q of walk(s.data.pts, 1)) nodes.push([q[0], q[1], si, s.data.width || 2.2]); });
  if (!nodes.length) return [from, [sq.x, sq.z]];
  const N = nodes.length, adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
    const same = nodes[i][2] === nodes[j][2];
    if ((same && j === i + 1 && d < 1.6) || (!same && d <= (nodes[i][3] + nodes[j][3]) / 2 + 0.6)) { adj[i].push([j, d]); adj[j].push([i, d]); }
  }
  const nearest = (x, z) => { let b = 0, bd = Infinity; nodes.forEach((n, k) => { const d = Math.hypot(n[0] - x, n[1] - z); if (d < bd) { bd = d; b = k; } }); return b; };
  const a = nearest(from[0], from[1]), goal = nearest(sq.x, sq.z);
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[a] = 0;
  for (;;) {
    let u = -1, best = Infinity; for (let k = 0; k < N; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
    if (u < 0 || u === goal) break; done[u] = 1;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const mid = [];
  if (Number.isFinite(dist[goal])) for (let k = goal; k >= 0; k = prev[k]) mid.unshift([nodes[k][0], nodes[k][1]]);
  return [from, ...mid, [sq.x, sq.z]];      // no way along the streets at all: straight across
}

/** Cut a polyline where it comes within `r` of (x, z) (the edge of the square). */
function stopAt(pts, x, z, r) {
  const out = [];
  for (const q of walk(pts, 0.5)) { out.push(q); if (out.length > 1 && Math.hypot(q[0] - x, q[1] - z) <= r) break; }
  return out;
}

export function measureGates({ P, nav = null, bodies = [] }) {
  const rows = [];
  for (const W of P.filter(p => p.kind === 'town_wall')) {
    const town = W.data.town, O = townObstacles({ P, town, bodies }), sq = O.sq, kind = W.data.settlement;
    if (!sq) continue;
    const sqR = Math.max(sq.data.r, 2.5);
    for (const g of W.data.gates) {
      const hasMain = !!(g.main && g.main.pts?.length > 1);
      const width = hasMain ? g.main.width : HIGH_STREET_WIDTH[kind] || 4;
      const inX = -(g.x - W.x), inZ = -(g.z - W.z), inL = Math.hypot(inX, inZ) || 1;
      const mouth = [g.x + inX / inL * 2, g.z + inZ / inL * 2];
      const raw = hasMain ? g.main.pts : planRoute(P, town, mouth, sq);
      const route = stopAt([[g.x, g.z], ...raw.filter((q, k) => k || Math.hypot(q[0] - g.x, q[1] - g.z) > 0.01)], sq.x, sq.z, sqR);
      let blocked = 0, narrowest = Infinity, navBlocked = 0; const hits = new Map();
      for (let k = 0; k < route.length; k++) {
        const [x, z] = route[k], step = k ? Math.hypot(x - route[k - 1][0], z - route[k - 1][1]) : 0;
        // the gate's own jambs are part of the wall: the first metre is the gate
        const c = O.clearance(x, z);
        if (Math.hypot(x - g.x, z - g.z) < 1.5 && c.what === 'the wall') continue;
        narrowest = Math.min(narrowest, c.d * 2);
        if (c.d < width / 2 - 1e-6) { blocked += step || 0.5; hits.set(c.what, (hits.get(c.what) || 0) + (step || 0.5)); }
        if (nav && !nav.passable(x, z)) navBlocked += step || 0.5;
      }
      // straight on from the gate along the road's own line
      let ahead = 0, firstAhead = null;
      for (let s = 2; s <= 60; s += 0.5) {
        const x = g.x - g.out[0] * s, z = g.z - g.out[1] * s;
        if (Math.hypot(x - sq.x, z - sq.z) <= sqR + 1) { ahead = s; firstAhead = 'the square'; break; }
        const c = O.clearance(x, z);
        if (c.d < 1.2) { firstAhead = c.what; break; }
        if (Math.hypot(x - W.x, z - W.z) > W.data.radius + 1) { firstAhead = 'out of town again'; break; }
        ahead = s;
      }
      rows.push({ town, kind, gate: g.id, wayKind: g.wayKind, gateKind: g.kind, road: g.wayKind === 'road', hasMain, width,
        metres: +lengthOf(route).toFixed(1), blocked: +blocked.toFixed(1), narrowest: +Math.min(16, narrowest).toFixed(1), ahead, firstAhead: firstAhead || 'clear for 60 m',
        navBlocked: nav ? +navBlocked.toFixed(1) : null, ends: +(Math.hypot(route[route.length - 1][0] - sq.x, route[route.length - 1][1] - sq.z)).toFixed(1), sqR,
        hits: [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([w, m]) => `${w} (${m.toFixed(1)} m)`) });
    }
  }
  return rows;
}

/**
 * The promises (after W6) as problem strings — empty = kept. For every gate a WORLD ROAD uses:
 *   1. it has a main street, which ends at the edge of the town square
 *   2. nothing with a footprint stands within the street's width anywhere along it
 *   3. nav.bin lets you walk every metre of its centreline
 *   4. straight on from the gate there are at least 8 clear metres (the first thing inside is road)
 * and for EVERY gate: the first 4 m inside it are not a building.
 */
export function checkGateStreets({ P, nav = null, bodies = [] }) {
  const bad = [];
  for (const r of measureGates({ P, nav, bodies })) {
    if (r.ahead < 4 && /house|office|building/.test(r.firstAhead)) bad.push(`${r.gate}: ${r.firstAhead} stands ${r.ahead} m inside the gate`);
    if (!r.road) continue;
    if (!r.hasMain) { bad.push(`${r.gate}: a road gate with no main street`); continue; }
    if (r.ends > r.sqR + 0.75) bad.push(`${r.gate}: its main street stops ${r.ends} m from the middle of the square (square r ${r.sqR})`);
    if (r.blocked > 0) bad.push(`${r.gate}: ${r.blocked} m of its main street blocked — ${r.hits.join(', ')}`);
    if (r.narrowest < r.width - 0.01) bad.push(`${r.gate}: main street narrows to ${r.narrowest} m (should be ${r.width})`);
    if (r.navBlocked) bad.push(`${r.gate}: ${r.navBlocked} m of its main street cannot be walked in nav.bin`);
    if (r.ahead < 8) bad.push(`${r.gate}: only ${r.ahead} m of clear road straight inside the gate before ${r.firstAhead}`);
  }
  return bad;
}
