// World Build — stage 5, Roads: a network that joins every place, follows the ground and crosses water only on a
// bridge or a ford. Pure and seeded.
//
//   1. Main roads join the towns and the pinned piece's gates (a spanning tree plus a few loops), routed by the cheapest
//      path over an 8 m grid with 16 move directions: steep steps cost a lot, so on a hillside the cheapest way is a
//      slant or a zig-zag (switchbacks), never straight up. Sea and lakes are walls; a river costs a crossing.
//   2. Town lanes: a ring lane round each town's middle and lanes out to it (lessons rule 76: streets first).
//   3. Trails from every shrine, camp, dungeon and landmark to the nearest road.
//   A new route that runs along an existing road is cut there: the new road starts where it leaves the old one, at a
//   point ON the old road (lessons rule 65: a link needs both ends).
//   4. Every place a road line meets a river line becomes a crossing (rule 24 — every one, along the whole line, rule 23):
//      a bridge, or a ford for a trail over a stream. The deck stands at or above both banks (rule 22).
//   5. Each road is graded to a smooth height (14% at most) and pressed into the 2 m ground exactly as Oathwild's
//      terrain.js step 5 does it.
//
//   roadWorld(W) adds W.roads, W.crossings, W.bridges, W.roadDist / W.roadIdx (2 m: distance to the nearest road centre),
//   W.gateCells (vertices changed inside the pinned piece), W.townStreets

import { makeHeap, clamp, lerp, smoothstep, gridSample, smoothLine, segCross, simplify, evenPoints, rngFor, r2 } from './core.js';
import { TOWN_SIZE } from './themes.js';

export const PATH_MAX_GRADE = 0.2;   // paths to camps, dungeons and landmarks (roads: the brief's limits.roadMaxGrade)

const MOVES = (() => {
  const m = [];
  for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]]) m.push([di, dk, Math.hypot(di, dk)]);
  return m;
})();

export function roadWorld(W) {
  const { brief, macro: M, pin } = W;
  const { nx, nz, cell } = M, MN = nx * nz;
  const LIM = brief.limits;
  const g = { minX: W.bounds.minX, minZ: W.bounds.minZ, cell: W.cell, nx: W.nx, nz: W.nz, data: W.H };
  const hAt = (x, z) => gridSample(g, x, z);
  const waterDepth = (x, z) => { const j = clamp(Math.round((z - g.minZ) / g.cell), 0, g.nz - 1) * g.nx + clamp(Math.round((x - g.minX) / g.cell), 0, g.nx - 1); const w = W.water[j]; return Number.isNaN(w) ? -Infinity : w - hAt(x, z); };
  const cx = j => M.minX + (j % nx) * cell, cz = j => M.minZ + Math.floor(j / nx) * cell;
  const cellOf = (x, z) => clamp(Math.round((z - M.minZ) / cell), 0, nz - 1) * nx + clamp(Math.round((x - M.minX) / cell), 0, nx - 1);
  const rng = rngFor(W.seed, 'roads');

  // ---------------------------------------------------------------- the cost grid
  const Hc = new Float32Array(MN);
  for (let j = 0; j < MN; j++) Hc[j] = hAt(cx(j), cz(j));
  const wall = new Uint8Array(MN);       // 1 = never (sea, lake, the kept piece, the world's edge)
  const riverW = new Float32Array(MN);   // width of the river in this cell (0 = none)
  const edge = Math.ceil((W.bounds.margin + 30) / cell);
  for (let j = 0; j < MN; j++) {
    const i = j % nx, k = (j - i) / nx;
    if (M.sea[j] || M.lake[j] >= 0 || M.keep[j] || i < edge || k < edge || i >= nx - edge || k >= nz - edge) wall[j] = 1;
  }
  // the 2 m water reaches a little past the coarse lake and sea cells: keep roads a cell further off
  { const grow = []; for (let j = 0; j < MN; j++) if (M.sea[j] || M.lake[j] >= 0) { const i = j % nx, k = (j - i) / nx; for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) { const ii = i + di, kk = k + dk; if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) grow.push(kk * nx + ii); } } for (const j of grow) wall[j] = 1; }
  for (const r of W.rivers) for (const p of r.pts) { const j = cellOf(p.x, p.z); riverW[j] = Math.max(riverW[j], r.width); }
  // a river is wider than one coarse cell: mark its banks as river too, so a road cannot slip through diagonally
  for (const r of W.rivers) for (const p of r.pts) for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (r.width < 6) continue;
    const j = cellOf(p.x + di * cell * 0.7, p.z + dk * cell * 0.7); riverW[j] = Math.max(riverW[j], r.width);
  }
  // the 2 m water decides too: a marsh lobe, a lake's edge or the sea between coarse cells is a wall; a river is a
  // crossing (costed per cell below)
  for (let j = 0; j < MN; j++) {
    const x = cx(j), z = cz(j);
    for (const [dx, dz] of [[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const i2 = clamp(Math.round((x + dx - g.minX) / g.cell), 0, g.nx - 1), k2 = clamp(Math.round((z + dz - g.minZ) / g.cell), 0, g.nz - 1), j2 = k2 * g.nx + i2;
      const w = W.water[j2];
      if (Number.isNaN(w) || w - W.H[j2] <= LIM.wadeDepth * 0.6) continue;
      if (W.wkind[j2] === 1) riverW[j] = Math.max(riverW[j], 6); else wall[j] = 1;
    }
  }
  // new roads keep 24 m off the kept piece (its ground there cannot be re-graded, so a road beside it would have a
  // cliff for a shoulder); the gate stubs are laid by hand through that band
  if (pin) for (let j = 0; j < MN; j++) if (!M.keep[j] && pin.keepDist(cx(j), cz(j)) < 24) wall[j] = 1;
  const onRoad = new Uint8Array(MN);     // cells a road already runs through (cheap to follow)
  const roadNear = new Int32Array(MN).fill(-1);   // index of that road in W.roads

  const dist = new Float64Array(MN).fill(Infinity), prev = new Int32Array(MN).fill(-1), seen = [];
  // turns: one step may turn at most 46 degrees from the step before (and pays a little for 22-46), so a switchback
  // takes several steps to come round and its two legs end up well apart (tight hairpins left a cliff between legs)
  function route(from, isTarget, opts = {}) {
    // where the ground leaves no room (a narrow gorge), allow a sharper turn, step by step, before none at all
    for (const minCos of [0.69, 0.49, 0.0]) { const p = routeOnce(from, isTarget, { ...opts, minCos }); if (p) { routeStats[minCos] = (routeStats[minCos] || 0) + 1; return p; } }
    // the quick search keeps one way into each cell, which can miss a turn that another way in would allow: search
    // again with the way in as part of the state (slower, so only when needed)
    const d = routeDirected(from, isTarget, opts);
    if (d) { routeStats.directed = (routeStats.directed || 0) + 1; return d; }
    routeStats.free = (routeStats.free || 0) + 1;
    routeStats.freeAt = [...(routeStats.freeAt || []), [Math.round(cx(from)), Math.round(cz(from))]];
    return routeOnce(from, isTarget, { ...opts, minCos: -2 });
  }
  let dirDist = null, dirPrev = null;
  function routeDirected(from, isTarget, { h = null, maxCost = Infinity } = {}) {
    const S = 17, NS = MN * S;
    if (!dirDist) { dirDist = new Float64Array(NS).fill(Infinity); dirPrev = new Int32Array(NS).fill(-1); }
    const touched = [];
    const heap = makeHeap(1 << 16);
    const s0 = from * S + 16;
    dirDist[s0] = 0; touched.push(s0); heap.push(h ? h(from) : 0, s0);
    let hit = -1;
    while (heap.size) {
      const st = heap.pop(), j = (st / S) | 0, din = st - j * S, d = dirDist[st];
      if (d > maxCost) break;
      if (j !== from && isTarget(j)) { hit = st; break; }
      const i = j % nx, k = (j - i) / nx;
      for (let m = 0; m < 16; m++) {
        const [di, dk, len] = MOVES[m];
        if (din < 16) { const [a, b, l2] = MOVES[din]; const cos = (di * a + dk * b) / (len * l2); if (cos < 0.49) continue; }
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const jj = kk * nx + ii;
        if (wall[jj] && !isTarget(jj)) continue;
        if (Math.abs(di) + Math.abs(dk) === 3) { const mi = i + Math.sign(di) * (Math.abs(di) === 2 ? 1 : 0), mk = k + Math.sign(dk) * (Math.abs(dk) === 2 ? 1 : 0); if (wall[mk * nx + mi]) continue; }
        const L = len * cell, gr = Math.abs(Hc[jj] - Hc[j]) / L;
        if (gr > 0.45) continue;
        let c = L * (onRoad[jj] ? 0.35 : 1);
        if (gr > 0.07) c += gr <= 0.14 ? L * (gr - 0.07) * 18 : L * (1.3 + (gr - 0.14) * 120);
        if (riverW[jj]) c += 140 + riverW[jj] * 14;
        const ns = jj * S + m, nd = d + c;
        if (nd < dirDist[ns]) { if (dirDist[ns] === Infinity) touched.push(ns); dirDist[ns] = nd; dirPrev[ns] = st; heap.push(nd + (h ? h(jj) : 0), ns); }
      }
    }
    let path = null;
    if (hit >= 0) { path = []; for (let st = hit; st >= 0; st = dirPrev[st]) path.push((st / S) | 0); path.reverse(); }
    for (const st of touched) { dirDist[st] = Infinity; dirPrev[st] = -1; }
    return path;
  }
  const routeStats = {};
  function routeOnce(from, isTarget, { h = null, maxCost = Infinity, minCos = 0.69 } = {}) {
    const turns = minCos > -2;
    for (const j of seen) { dist[j] = Infinity; prev[j] = -1; }
    seen.length = 0;
    const heap = makeHeap(1 << 15);
    dist[from] = 0; seen.push(from); heap.push(h ? h(from) : 0, from);
    let hit = -1;
    while (heap.size) {
      const j = heap.pop();
      const d = dist[j];
      if (d > maxCost) break;
      if (j !== from && isTarget(j)) { hit = j; break; }
      const i = j % nx, k = (j - i) / nx;
      const pj = prev[j];
      let inx = 0, inz = 0, inL = 0;
      if (turns && pj >= 0) { const pi = pj % nx; inx = i - pi; inz = k - (pj - pi) / nx; inL = Math.hypot(inx, inz); }
      for (const [di, dk, len] of MOVES) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const jj = kk * nx + ii;
        if (wall[jj] && !isTarget(jj)) continue;
        let turnCost = 0;
        if (inL) { const cos = (di * inx + dk * inz) / (len * inL); if (cos < minCos) continue; if (cos < 0.93) turnCost = len * cell * (cos < 0.69 ? 1.5 : 0.4); }
        // a knight move passes over two cells: both must be open
        if (Math.abs(di) + Math.abs(dk) === 3) { const mi = i + Math.sign(di) * (Math.abs(di) === 2 ? 1 : 0), mk = k + Math.sign(dk) * (Math.abs(dk) === 2 ? 1 : 0); if (wall[mk * nx + mi]) continue; }
        const L = len * cell, gr = Math.abs(Hc[jj] - Hc[j]) / L;
        if (gr > 0.45) continue;
        let c = L * (onRoad[jj] ? 0.35 : 1) + turnCost;
        if (gr > 0.07) c += gr <= 0.14 ? L * (gr - 0.07) * 18 : L * (1.3 + (gr - 0.14) * 120);
        if (riverW[jj]) c += 140 + riverW[jj] * 14;          // every river cell: cross straight, never run along one
        const nd = d + c;
        if (nd < dist[jj]) {
          if (dist[jj] === Infinity) seen.push(jj);
          dist[jj] = nd; prev[jj] = j; heap.push(nd + (h ? h(jj) : 0), jj);
        }
      }
    }
    if (hit < 0) return null;
    const path = [];
    for (let j = hit; j >= 0; j = prev[j]) path.push(j);
    return path.reverse();
  }

  // ---------------------------------------------------------------- road list (pinned roads first, ids unchanged)
  const roads = [];
  if (pin) for (const r of pin.T.roads) roads.push({ id: r.id, name: r.name, class: r.class, width: r.width, points: pin.lists.roads.find(x => x.id === r.id).points, pts: r.pts.map(p => ({ ...p, x: p.x + pin.at[0], z: p.z + pin.at[1] })), town: r.town, surface: r.surface, pinned: true });
  const ids = new Set(roads.map(r => r.id));
  const uid = base => { let id = base, n = 2; while (ids.has(id)) id = `${base}_${n++}`; ids.add(id); return id; };
  const slug = s => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const markRoad = (pts, ri) => { for (const p of pts) { const j = cellOf(p[0] ?? p.x, p[1] ?? p.z); onRoad[j] = 1; roadNear[j] = ri; } };

  /** Turn a cell path into roads, cutting the stretches that run on roads already there (each cut end ON that road). */
  function addPath(path, base) {
    const out = [];
    let cur = null;
    const flush = () => { if (cur && cur.cells.length >= 2) out.push(cur); cur = null; };
    for (let q = 0; q < path.length; q++) {
      const j = path[q];
      const on = onRoad[j] && q > 0 && q < path.length - 1;
      if (on) { if (cur) { cur.endRoad = roadNear[j]; cur.cells.push(j); flush(); } continue; }
      if (!cur) { cur = { cells: [], startRoad: q > 0 && onRoad[path[q - 1]] ? roadNear[path[q - 1]] : -1 }; if (q > 0) cur.cells.push(path[q - 1]); }
      cur.cells.push(j);
      // a path that ends ON a road (a trail's target) ends at a point of that road, not at the cell's middle
      if (q === path.length - 1 && onRoad[j] && roadNear[j] >= 0) cur.endRoad = roadNear[j];
    }
    flush();
    const made = [];
    for (const piece of out) {
      let pts = piece.cells.map(j => [cx(j), cz(j)]);
      // ends that join a road: snap to the nearest point OF that road (rule 65)
      if (piece.startRoad >= 0) pts[0] = nearestOn(roads[piece.startRoad], pts[0]);
      if (piece.endRoad >= 0) pts[pts.length - 1] = nearestOn(roads[piece.endRoad], pts[pts.length - 1]);
      if (base.from && piece === out[0] && piece.startRoad < 0) pts[0] = base.from;
      if (base.to && piece === out[out.length - 1] && piece.endRoad < 0) pts[pts.length - 1] = base.to;
      pts = evenPoints(simplify(pts, 1.5).map(([x, z]) => [r2(x), r2(z)]));
      const len = pts.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      if (len < 6 || (len < 26 && piece.startRoad >= 0 && piece.endRoad >= 0)) continue;   // a scrap between two roads
      const rd = { id: uid(base.id), name: base.name, class: base.class, width: base.width, points: pts, generated: true, links: base.links, ...(base.maxGrade ? { maxGrade: base.maxGrade } : {}), ...(base.town ? { town: base.town } : {}), ...(base.fromY != null && piece === out[0] && piece.startRoad < 0 ? { startY: base.fromY } : {}) };
      rd.pts = smoothLine(rd.points, 2);
      roads.push(rd); made.push(rd);
      markRoad(rd.pts, roads.length - 1);
    }
    return made;
  }
  function nearestOn(rd, [x, z]) {
    let best = null, bd = Infinity;
    for (const p of rd.pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return [r2(best.x), r2(best.z)];
  }
  // the pinned roads are part of the network (gates join them); their cells are inside the wall, so mark only for reuse
  roads.forEach((r, ri) => markRoad(r.pts, ri));

  // ---------------------------------------------------------------- 1. gates out of the pinned piece
  const gateRoads = [];
  const nodes = [];      // main-road nodes: { at, cell, kind, id }
  if (pin) for (const gt of pin.gates) {
    const inner = [gt.start, ...gt.via, gt.edge];
    // carry on outwards 40 m past the kept edge so the routed part starts outside the wall
    const [ex, ez] = gt.edge, [px, pz] = inner[inner.length - 2];
    const L = Math.hypot(ex - px, ez - pz) || 1, out = [ex + (ex - px) / L * 36, ez + (ez - pz) / L * 36];
    nodes.push({ at: out, cell: cellOf(...out), kind: 'gate', id: gt.id, gate: gt, inner: [...inner, out] });
  }
  const placeList = W.placeOrder.map(id => W.places[id]);
  const towns = placeList.filter(p => p.kind === 'town');
  for (const t of towns) nodes.push({ at: t.at, cell: cellOf(...t.at), kind: 'town', id: t.id, place: t });
  for (const n of nodes) if (wall[n.cell] && n.kind !== 'gate') throw new Error(`${n.id} stands on water or the edge.`);

  // ---------------------------------------------------------------- 2. main roads: spanning tree over towns + gates, then loops
  const edges = [];
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    if (nodes[a].kind === 'gate' && nodes[b].kind === 'gate') continue;   // gates join through the pinned piece already
    edges.push([Math.hypot(nodes[a].at[0] - nodes[b].at[0], nodes[a].at[1] - nodes[b].at[1]), a, b]);
  }
  edges.sort((p, q) => p[0] - q[0]);
  const parent = nodes.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // the gates already meet each other inside the pinned piece
  const gIdx = nodes.map((n, i) => (n.kind === 'gate' ? i : -1)).filter(i => i >= 0);
  for (const i of gIdx.slice(1)) parent[find(i)] = find(gIdx[0]);
  const tree = [];
  for (const [d, a, b] of edges) if (find(a) !== find(b)) { parent[find(a)] = find(b); tree.push([a, b, d]); }
  // loops: pairs that are near in a straight line but far apart along the tree
  const adj = nodes.map(() => []);
  for (const [a, b, d] of tree) { adj[a].push([b, d]); adj[b].push([a, d]); }
  const treeDist = (a, b) => { const D = new Map([[a, 0]]), q = [a]; while (q.length) { const u = q.shift(); for (const [v, d] of adj[u]) if (!D.has(v)) { D.set(v, D.get(u) + d); q.push(v); } } return D.get(b) ?? Infinity; };
  const loops = [];
  for (const [d, a, b] of edges) {
    if (loops.length >= Math.max(2, Math.round(towns.length / 4))) break;
    if (tree.some(([p, q]) => (p === a && q === b) || (p === b && q === a)) || d > 1400) continue;
    if (treeDist(a, b) > d * 2.2) { loops.push([a, b, d]); adj[a].push([b, d]); adj[b].push([a, d]); }
  }
  // lay gate stubs first, then the tree from the gates outward (so each new road can join the ones before it)
  for (const n of nodes) if (n.kind === 'gate') {
    const gt = n.gate;
    const rd = { id: uid(gt.id), name: gt.name, class: gt.class, width: gt.width, points: evenPoints(n.inner.map(([x, z]) => [r2(x), r2(z)])), generated: true, gate: gt.id, joins: gt.road };
    rd.pts = smoothLine(rd.points, 2);
    roads.push(rd); gateRoads.push(rd);
    markRoad(rd.pts.filter(p => !pin.inKeep(p.x, p.z)), roads.length - 1);
  }
  const roadName = (a, b) => { const t = nodes[b].place || nodes[a].place; return t ? `the ${t.name} Road` : 'the Road'; };
  const mainLinks = [...tree, ...loops].sort((p, q) => p[2] - q[2]);
  const failed = [];
  for (const [a, b] of mainLinks) {
    const A = nodes[a], Bn = nodes[b];
    const tx = Bn.at[0], tz = Bn.at[1];
    const path = route(A.cell, j => j === Bn.cell, { h: j => Math.hypot(cx(j) - tx, cz(j) - tz) * 0.9 });
    if (!path) { failed.push(`${A.id} → ${Bn.id}`); continue; }
    addPath(path, { id: slug(roadName(a, b)), name: roadName(a, b), class: 'road', width: 6, from: A.kind === 'town' ? A.at : A.at, to: Bn.at, links: [A.id, Bn.id] });
  }

  // ---------------------------------------------------------------- 3. town lanes: a ring round the middle and lanes out to it
  const townStreets = {};
  for (const t of towns) {
    const S = TOWN_SIZE[t.size || 'village'];
    const tr = rngFor(W.seed, 'lanes:' + t.id);
    const list = roads.filter(r => r.generated && r.pts.some(p => Math.hypot(p.x - t.at[0], p.z - t.at[1]) < 8)).map(r => r.id);
    const lanes = [];
    const okLane = pts => pts.every(([x, z]) => !wall[cellOf(x, z)] && !(W.water[Math.round((z - g.minZ) / g.cell) * g.nx + Math.round((x - g.minX) / g.cell)] > hAt(x, z) - 0.3));
    if (S.ring) {
      const R = t.radius * 0.55, n = 10, a0 = tr() * 6.28;
      const ring = [];
      for (let q = 0; q <= n; q++) { const a = a0 + q / n * 6.2832, rr = R * (0.88 + tr() * 0.24); ring.push([r2(t.at[0] + Math.cos(a) * rr), r2(t.at[1] + Math.sin(a) * rr)]); }
      ring[n] = ring[0];
      if (okLane(ring)) {
        const rd = { id: uid(`${t.id}_ring`), name: `${t.name} Ring Lane`, class: 'road', width: 4.5, points: ring, generated: true, town: t.id, shoulder: 2 };
        rd.pts = smoothLine(rd.points, 2); roads.push(rd); lanes.push(rd.id);
      }
    }
    const ringRoad = lanes.length ? roads.find(r => r.id === lanes[0]) : null;
    for (let q = 0; q < S.lanes; q++) {
      const a = tr() * 6.2832, L = t.radius * (S.ring ? 0.95 : 0.7);
      let end = [r2(t.at[0] + Math.cos(a + 0.18) * L), r2(t.at[1] + Math.sin(a + 0.18) * L)];
      if (ringRoad) end = nearestOn(ringRoad, end);
      const pts = [[t.at[0], t.at[1]], [r2(t.at[0] + Math.cos(a) * L * 0.45), r2(t.at[1] + Math.sin(a) * L * 0.45)], end];
      if (!okLane(pts)) continue;
      const rd = { id: uid(`${t.id}_lane_${q + 1}`), name: `${t.name} ${['Mill', 'Well', 'Church', 'Bell'][q % 4]} Lane`, class: 'trail', width: 4.5, points: evenPoints(pts, 10, 2), generated: true, town: t.id, shoulder: 2 };
      rd.pts = smoothLine(rd.points, 2); roads.push(rd); lanes.push(rd.id);
    }
    for (const id of lanes) markRoad(roads.find(r => r.id === id).pts, roads.findIndex(r => r.id === id));
    townStreets[t.id] = { main: list, lanes };
  }

  // ---------------------------------------------------------------- 4. trails from every other place to the nearest road
  const trailOf = { shrine: 'Path', camp: 'Trail', dungeon: 'Trail', landmark: 'Path' };
  for (const p of placeList) {
    if (p.kind === 'town') continue;
    const from = cellOf(...p.at);
    if (onRoad[from]) continue;
    const path = route(from, j => onRoad[j] === 1 && !M.keep[j], { maxCost: 60000 });
    if (!path) { failed.push(`${p.id} → road`); continue; }
    // the trail stops at the place's edge (its middle holds the fire, the altar, the door)
    const edgeR = p.kind === 'shrine' ? 7.5 : Math.max(8, (p.radius || 12) * 0.8);
    let q0 = 0;
    while (q0 < path.length - 2 && Math.hypot(cx(path[q0]) - p.at[0], cz(path[q0]) - p.at[1]) < edgeR) q0++;
    const [ex, ez] = [cx(path[q0]), cz(path[q0])], dl = Math.hypot(ex - p.at[0], ez - p.at[1]) || 1;
    const start = [r2(p.at[0] + (ex - p.at[0]) / dl * edgeR), r2(p.at[1] + (ez - p.at[1]) / dl * edgeR)];
    addPath(path.slice(q0), { id: slug(`${p.name} ${trailOf[p.kind]}`), name: `${p.name.replace(/^the /, 'The ')} ${trailOf[p.kind]}`.replace(/^The /, 'the '), class: 'trail', width: p.kind === 'shrine' ? 3.5 : 4, maxGrade: p.kind === 'shrine' ? LIM.roadMaxGrade : PATH_MAX_GRADE, from: start, fromY: hAt(...start) > p.y + 1 || hAt(...start) < p.y - 1 ? p.y : null, links: [p.id] });
  }

  // ---------------------------------------------------------------- 5. crossings: every road line over every river line
  const crossings = pin ? pin.lists.crossings.map(c => ({ ...c })) : [];
  const bridges = pin ? pin.T.bridges.map(b => ({ ...b, at: [b.at[0] + pin.at[0], b.at[1] + pin.at[1]], a: [b.a[0] + pin.at[0], b.a[1] + pin.at[1]], b: [b.b[0] + pin.at[0], b.b[1] + pin.at[1]], pinned: true })) : [];
  const crossIds = new Set(crossings.map(c => c.id));
  const riverLines = W.rivers.map(r => ({ id: r.id, name: r.name, width: r.width, pts: r.pts }));
  if (pin) riverLines.push(...pin.riverLines);
  const nearestTownName = (x, z) => { let best = null, bd = Infinity; for (const p of Object.values(W.places)) if (p.kind === 'town') { const d = Math.hypot(p.at[0] - x, p.at[1] - z); if (d < bd) { bd = d; best = p; } } return best?.name || 'Old'; };
  for (const rd of roads) {
    if (!rd.generated) continue;
    const pts = rd.pts;
    for (const rv of riverLines) {
      for (let a = 0; a < pts.length - 1; a++) {
        // quick reject on the segment's box
        for (let b = 0; b < rv.pts.length - 1; b++) {
          const p1 = pts[a], p2 = pts[a + 1], q1 = rv.pts[b], q2 = rv.pts[b + 1];
          if (Math.max(p1.x, p2.x) < Math.min(q1.x, q2.x) || Math.min(p1.x, p2.x) > Math.max(q1.x, q2.x) || Math.max(p1.z, p2.z) < Math.min(q1.z, q2.z) || Math.min(p1.z, p2.z) > Math.max(q1.z, q2.z)) continue;
          const c = segCross(p1, p2, q1, q2);
          if (!c) continue;
          if (bridges.some(bb => bb.road === rd.id && bb.river === rv.id && Math.hypot(bb.at[0] - c.x, bb.at[1] - c.z) < rv.width + 10)) continue;
          {
            // a road that meets water twice within a few metres (a bend, a fork) gets ONE longer bridge over both
            const sHere = p1.s + (p2.s - p1.s) * c.t;
            const near = bridges.find(bb => bb.road === rd.id && !bb.pinned && Math.abs(bb.s - sHere) < bb.reach + rv.width / 2 + 14);
            if (near) {
              const lo = Math.min(near.s - near.reach, sHere - rv.width / 2 - 5), hi = Math.max(near.s + near.reach, sHere + rv.width / 2 + 5);
              const at = sv => pts[Math.max(0, pts.findIndex(p => p.s >= sv))] || pts[pts.length - 1];
              const pa = at(lo), pb = at(hi), surface = Math.max(near.surface, q1.y + (q2.y - q1.y) * c.u);
              Object.assign(near, { kind: 'bridge', art: near.art || 'bridge-wood', s: (lo + hi) / 2, reach: (hi - lo) / 2, a: [r2(pa.x), r2(pa.z)], b: [r2(pb.x), r2(pb.z)], at: [r2((pa.x + pb.x) / 2), r2((pa.z + pb.z) / 2)], surface: r2(surface), deck: r2(Math.max(Math.min(hAt(pa.x, pa.z), hAt(pb.x, pb.z)) + 0.15, surface + 1.35)), facing: r2(Math.atan2(pb.x - pa.x, pb.z - pa.z)), rivers: [...new Set([...(near.rivers || [near.river]), rv.id])] });
              const cr = crossings.find(x => x.id === near.id); if (cr) { cr.kind = 'bridge'; cr.art = near.art; cr.rivers = near.rivers; }
              continue;
            }
          }
          const ford = rd.class === 'trail' && rv.width <= 6;
          const kind = ford ? 'ford' : 'bridge';
          const art = ford ? null : rv.width >= 12 || (rd.class === 'road' && rv.width >= 9) ? 'bridge-stone' : 'bridge-wood';
          const rvName = rv.name ? rv.name.replace(/^the /, '') : 'Stream';
          const name = ford ? `the ${rvName} Ford` : `${nearestTownName(c.x, c.z)} Bridge`;
          let id = slug(name); while (crossIds.has(id)) id = `${id}_2`; crossIds.add(id);
          crossings.push({ id, name: uniqueName(crossings, name), road: rd.id, river: rv.id, kind, ...(art ? { art } : {}), generated: true });
          const sAt = p1.s + (p2.s - p1.s) * c.t, surface = q1.y + (q2.y - q1.y) * c.u;
          const along = sv => pts[Math.max(0, Math.min(pts.length - 1, pts.findIndex(p => p.s >= sv) < 0 ? pts.length - 1 : pts.findIndex(p => p.s >= sv)))];
          // the deck spans the whole wet stretch under the road (an oblique crossing or a flat estuary is longer than
          // the river is wide), so it never ends over water
          const wetTo = dir => { let d = 0; for (let k = 1; k < 160; k++) { const p = along(sAt + dir * k); const wd = waterDepth(p.x, p.z); if (wd > -0.3) d = k; else if (k > d + 4) break; } return d; };
          const lo = Math.max(rv.width / 2 + (ford ? 1.5 : 5), ford ? 0 : wetTo(-1) + 3), hi = Math.max(rv.width / 2 + (ford ? 1.5 : 5), ford ? 0 : wetTo(1) + 3);
          const reach = (lo + hi) / 2;
          const pa = along(sAt - lo), pb = along(sAt + hi);
          // the deck meets the LOWER bank flush; where the far bank stands higher the road leaves the deck in a short
          // cutting (a flat deck at the higher bank would leave the near approach a wall to climb)
          const deck = ford ? surface - 0.35 : Math.max(Math.min(hAt(pa.x, pa.z), hAt(pb.x, pb.z)) + 0.15, surface + 1.35);
          bridges.push({ id, name: crossings[crossings.length - 1].name, road: rd.id, river: rv.id, kind, art, at: [r2(c.x), r2(c.z)], a: [r2(pa.x), r2(pa.z)], b: [r2(pb.x), r2(pb.z)], width: rd.width + 1, deck: r2(deck), surface: r2(surface), facing: r2(Math.atan2(pb.x - pa.x, pb.z - pa.z)), s: sAt + (hi - lo) / 2, reach, generated: true, inKeep: !!(pin && pin.inKeep(c.x, c.z)) });
        }
      }
    }
  }

  // a bridge deck is straight from a to b: the road follows it exactly there (a curve on a long deck left road points
  // off the deck, over the water)
  for (const b of bridges) {
    if (b.pinned) continue;
    const rd = roads.find(r => r.id === b.road);
    const s0 = b.s - b.reach, s1 = b.s + b.reach;
    for (const p of rd.pts) if (p.s >= s0 && p.s <= s1) { const t = (p.s - s0) / (s1 - s0 || 1); p.x = b.a[0] + (b.b[0] - b.a[0]) * t; p.z = b.a[1] + (b.b[1] - b.a[1]) * t; }
  }

  // ---------------------------------------------------------------- 6. grade every generated road and press it into the ground
  const N = W.N, H = W.H;
  void N;
  const RD = new Float32Array(N).fill(Infinity), RI = new Int16Array(N).fill(-1);
  // the pinned roads keep their own surface: mark them as laid already (no generated road may re-grade them)
  if (pin) roads.forEach((r, ri) => {
    if (!r.pinned) return;
    for (const p of r.pts) boxEach(g, p.x, p.z, r.width / 2 + 1, (j, x, z) => { const d = Math.hypot(x - p.x, z - p.z); if (d < RD[j]) { RD[j] = d; RI[j] = ri; } });
  });
  const gateCells = new Set();
  // each bridge's deck and banks belong to its own road: no other road re-grades them (a second road nearby would
  // otherwise lift a bank above the first one's deck)
  const zoneOf = new Map();
  for (const b of bridges) {
    if (b.pinned) continue;
    const ri = roads.findIndex(r => r.id === b.road);
    const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz) || 1;
    for (let t = -4; t <= L + 4; t += 1) boxEach(g, b.a[0] + dx / L * t, b.a[1] + dz / L * t, b.width / 2 + 3, j => zoneOf.set(j, ri));
  }
  const snapEnds = [];
  roads.forEach((r, ri) => {
    if (!r.generated) return;
    const pts = r.pts, half = r.width / 2;
    const pinned = new Array(pts.length).fill(null);
    for (const b of bridges) if (b.road === r.id) for (let q = 0; q < pts.length; q++) if (Math.abs(pts[q].s - b.s) <= b.reach + (b.kind === 'ford' ? 0 : 1.5)) pinned[q] = b.deck;
    const prof = pts.map(p => hAt(p.x, p.z));
    // roads and town lanes climb 14% at most (Oathwild's limit); a path out to a camp, dungeon or landmark may climb
    // a steeper `pathMaxGrade` (a mountain path is not a cart road)
    const maxGrade = r.maxGrade ?? LIM.roadMaxGrade;
    // a trail leaving a place on a raised (or sunk) level pad starts flush with the pad, not at the foot of its edge
    if (r.startY != null && pinned[0] == null) pinned[0] = r.startY;
    // ends that join a road laid before keep that road's height (junctions meet flush)
    for (const q of [0, pts.length - 1]) {
      const j = idx2(g, pts[q].x, pts[q].z);
      if (pinned[q] == null && RI[j] >= 0 && RD[j] <= roads[RI[j]].width / 2 + 1) { pinned[q] = roadY(roads[RI[j]], pts[q].x, pts[q].z) ?? hAt(pts[q].x, pts[q].z); snapEnds.push(r.id); }
    }
    {
      const ends = [0, pts.length - 1];
      if (pinned[ends[0]] != null && pinned[ends[1]] != null && !pts.some((p, q) => q > 0 && q < pts.length - 1 && pinned[q] != null)) {
        const need = Math.abs(pinned[ends[1]] - pinned[ends[0]]), can = maxGrade * pts[pts.length - 1].s;
        if (need > can) pinned[ends[1]] = null;          // meets the second road on a ramp instead of flush
      }
    }
    const ground = prof.slice();
    const gr = q => maxGrade * (pts[q].s - pts[q - 1].s);
    const grade = () => {
      for (let q = 0; q < pts.length; q++) prof[q] = pinned[q] != null ? pinned[q] : ground[q];
      for (let it = 0; it < 40; it++) for (let q = 1; q < pts.length - 1; q++) if (pinned[q] == null) prof[q] = (prof[q - 1] + prof[q] + prof[q + 1]) / 3;
      for (let pass = 0; pass < 8; pass++) {
        for (let q = 1; q < pts.length; q++) if (pinned[q] == null) prof[q] = clamp(prof[q], prof[q - 1] - gr(q), prof[q - 1] + gr(q));
        for (let q = pts.length - 2; q >= 0; q--) if (pinned[q] == null) prof[q] = clamp(prof[q], prof[q + 1] - gr(q + 1), prof[q + 1] + gr(q + 1));
      }
      for (let q = 1; q < pts.length; q++) if (Math.abs(prof[q] - prof[q - 1]) > gr(q) + 0.01 && !(pinned[q] != null && pinned[q - 1] != null)) return false;
      return true;
    };
    // pinned heights that cannot all be met within the grade: let go of the far junction first (it meets the other
    // road on a short ramp), then of a place pad's height — never of a bridge deck
    if (!grade()) {
      const endIsJunction = pinned[pts.length - 1] != null && !bridges.some(b => b.road === r.id && Math.abs(b.s - pts[pts.length - 1].s) <= b.reach + 2);
      if (endIsJunction) pinned[pts.length - 1] = null;
      if (!grade() && r.startY != null && pinned[0] === r.startY) { pinned[0] = null; grade(); }
      const startIsBridge = bridges.some(b => b.road === r.id && Math.abs(b.s - pts[0].s) <= b.reach + 2);
      if (!grade() && pinned[0] != null && !startIsBridge) { pinned[0] = null; grade(); }
    }
    pts.forEach((p, q) => { p.y = r2(prof[q]); p.zone = pinned[q] != null; p.x = r2(p.x); p.z = r2(p.z); p.s = r2(p.s); });
    const shoulder = r.shoulder ?? 5;
    // per vertex: the nearest point of this road, and the nearest point of ANOTHER stretch of it (the other leg of a
    // switchback); between two legs the ground ramps from one to the other instead of meeting in a step
    const bestD = new Map(), legGap = 2 * (half + shoulder) + 6;
    for (const p of pts) boxEach(g, p.x, p.z, half + shoulder + 3, (j, x, z) => {
      const d = Math.hypot(x - p.x, z - p.z);
      let cur = bestD.get(j);
      if (!cur) { cur = [Infinity, 0, 0, x, z, 0, Infinity, 0, 0]; bestD.set(j, cur); }
      if (d < cur[0]) {
        if (Math.abs(p.s - cur[5]) > legGap && cur[0] < cur[6]) { cur[6] = cur[0]; cur[7] = cur[1]; cur[8] = cur[5]; }
        cur[0] = d; cur[1] = p.y; cur[2] = p.zone ? 1 : 0; cur[5] = p.s;
      } else if (d < cur[6] && Math.abs(p.s - cur[5]) > legGap) { cur[6] = d; cur[7] = p.y; cur[8] = p.s; }
    });
    for (const [j, cur] of bestD) {
      let [d, y, zone, x, z, , d2, y2] = cur;
      if (d > half + shoulder) continue;
      if (d2 < half + shoulder + 3 && d > half) { const t = (d - half) / Math.max(0.01, (d - half) + Math.max(0, d2 - half)); y = y + (y2 - y) * t; d = half; }
      const onEarlier = RI[j] >= 0 && RI[j] !== ri && RD[j] <= roads[RI[j]].width / 2 + 0.5;
      if (d < RD[j]) { RD[j] = d; RI[j] = ri; }
      if (onEarlier) continue;
      if (W.keep[j] && !r.gate) continue;               // nothing but a gate road touches the kept piece
      if (zoneOf.has(j) && zoneOf.get(j) !== ri) continue;
      const inRiver = W.wkind[j] === 1 && !Number.isNaN(W.water[j]) && H[j] < W.water[j];
      const before = H[j];
      if (zone) {
        const br = bridges.find(b => b.road === r.id && Math.hypot(x - b.at[0], z - b.at[1]) <= b.reach + half + 2);
        if (br?.kind === 'ford' && d < half + 1.5) H[j] = Math.max(H[j], br.deck);
        else if (!inRiver && d < half + shoulder) H[j] = lerp(H[j], y, 1 - smoothstep(half, half + shoulder, d));
      } else if (!inRiver) H[j] = lerp(H[j], y, 1 - smoothstep(half, half + shoulder, d));
      if (W.keep[j] && H[j] !== before) gateCells.add(j);
    }
  });
  function roadY(rd, x, z) { let best = null, bd = Infinity; for (const p of rd.pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best?.y ?? null; }

  // switchbacks: the road turns back on itself (heading changes by 150 degrees or more within 80 m either side) while
  // climbing at least 6 m over that stretch
  let switchbacks = 0;
  for (const r of roads) {
    if (!r.generated || r.town) continue;
    const P = r.pts, head = [0];
    for (let q = 1; q < P.length - 1; q++) { let a = Math.atan2(P[q + 1].z - P[q].z, P[q + 1].x - P[q].x); const prevA = head[q - 1]; while (a - prevA > Math.PI) a -= 2 * Math.PI; while (a - prevA < -Math.PI) a += 2 * Math.PI; head.push(a); }
    for (let q = 40; q < head.length - 40; q += 4) {
      if (Math.abs(head[q + 40] - head[q - 40]) > 2.6 && Math.abs(P[q + 40].y - P[q - 40].y) > 6) { switchbacks++; q += 80; }
    }
  }
  Object.assign(W, { roads, crossings, bridges, roadDist: RD, roadIdx: RI, gateCells, townStreets, roadFailures: failed, switchbacks, gateRoads: gateRoads.map(r => r.id), routeStats });
  void rng; void snapEnds;
  return W;
}

function uniqueName(list, name) { let n = name, k = 2; while (list.some(c => c.name === n)) n = `${name} ${['II', 'III', 'IV', 'V', 'VI'][k - 2] || k}`, k++; return n; }
function idx2(g, x, z) { const i = clamp(Math.round((x - g.minX) / g.cell), 0, g.nx - 1), k = clamp(Math.round((z - g.minZ) / g.cell), 0, g.nz - 1); return k * g.nx + i; }
function boxEach(g, x, z, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r - g.minX) / g.cell)), i1 = Math.min(g.nx - 1, Math.ceil((x + r - g.minX) / g.cell));
  const k0 = Math.max(0, Math.floor((z - r - g.minZ) / g.cell)), k1 = Math.min(g.nz - 1, Math.ceil((z + r - g.minZ) / g.cell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * g.nx + i, g.minX + i * g.cell, g.minZ + k * g.cell);
}
