// Vector layer (PLAN §3.2): walls, roads, rails and cliffs are authored as polylines and
// SIMULATED as cells. PURE. M1 uses it for cliffs; M4 (walls), M3 (roads) and M10 (rails) build on
// the same rasteriser so a drawn line and the cells the sim blocks always agree.
//
// Lines are stamped as discs of radius `r` every half cell along each segment. A radius of 1.5 or
// more always gives a 4-connected band, so nothing walking 8 ways can slip through a diagonal.

import { EDGE, ROAD, BRIDGE, RAIL, OWNED } from './grid.js';

/** Call fn(x, y) once for every cell within r of the polyline. */
export function rasterLine(pts, r, closed, fn, W, H) {
  const seen = new Set();
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const rr = r * r;
  const R = Math.ceil(r);
  const stamp = (cx, cy) => {
    const x0 = Math.floor(cx), y0 = Math.floor(cy);
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const ex = x + 0.5 - cx, ey = y + 0.5 - cy;
      if (ex * ex + ey * ey > rr) continue;
      const k = y * W + x;
      if (seen.has(k)) continue;
      seen.add(k);
      fn(x, y);
    }
  };
  if (n === 1) { stamp(pts[0][0] + 0.5, pts[0][1] + 0.5); return seen.size; }
  for (let s = 0; s < segs; s++) {
    const [ax, ay] = pts[s], [bx, by] = pts[(s + 1) % n];
    const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      stamp(ax + (bx - ax) * t + 0.5, ay + (by - ay) * t + 0.5);
    }
  }
  return seen.size;
}

/** Vector store for one base. */
export function createVectors(g, M) {
  const list = [];
  let nextId = 1;
  const widths = { cliff: 1.6, road: 2.2, wall: 1.6, rail: 1.2 };

  /** Add a vector and rasterise it (all of it, at once). Roads laid piece by piece use addRecord + applyPart. */
  function add(kind, pts, closed = false, extra = {}) {
    const v = addRecord(kind, pts, closed, extra);
    apply(v);
    return v;
  }
  /** Add a vector record without touching any cell (a blueprint: roads are laid by builders, M3). */
  function addRecord(kind, pts, closed = false, extra = {}) {
    const v = { id: nextId++, kind, pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]), closed, ...extra };
    list.push(v);
    return v;
  }
  function remove(id) { const i = list.findIndex((v) => v.id === id); if (i >= 0) return list.splice(i, 1)[0]; return null; }

  function apply(v, opts = {}) { applyPts(v.kind, v.pts, v.closed, opts); }
  /** Rasterise part of a vector: distance a..b along it (cells). */
  function applyPart(v, a, b, opts = {}) { const sub = cutPolyline(v.pts, a, b); if (sub.length >= 2) applyPts(v.kind, sub, false, opts); }

  /**
   * Stamp cells. Road rules (owner: one road kind, a road over shallow water is a bridge): a road never marks a cliff
   * cell or a building's roof; it marks water or lava BRIDGE only where `opts.reach` (material ids the global Bridge
   * level spans; default: walkable water = shallow) allows, and leaves the rest alone, so the cells marked are exactly
   * the cells you can walk on. Trees, shrubs, logs and loose rock under a road are cleared to `opts.clearTo`.
   */
  function applyPts(kind, pts, closed, opts) {
    const r = widths[kind] ?? 1.5;
    const cliff = M.id.cliff, wall = M.id.wall;
    const reach = opts.reach || null;
    const clearTo = opts.clearTo ?? M.id.soil;
    rasterLine(pts, r, closed, (x, y) => {
      const i = g.idx(x, y);
      let c = g.cells[i];
      const m = c & 255;
      if (kind === 'cliff') {
        c = ((c & ~0xff & ~0xff0000) | cliff | EDGE) >>> 0;
      } else if (kind === 'road') {
        if (c & EDGE) return;
        if ((c & OWNED) && !M.walk[m]) return;
        if (M.water[m] || M.hot[m]) {
          const ok = reach ? reach.has(m) : M.walk[m] > 0;
          if (!ok) return;
          c = (c | BRIDGE) >>> 0;
        } else {
          if (clearTo !== undefined && CLEARABLE.has(M.list[m].id)) c = ((c & ~0xff & ~0xff0000) | clearTo) >>> 0;
          c = (c | ROAD) >>> 0;
        }
        c = (c & ~(1 << 24)) >>> 0; // laying a road puts out what was burning under it
      } else if (kind === 'rail') {
        c = (c | RAIL) >>> 0;
      } else if (kind === 'wall') {
        // M4: a wall stands on land and on SHALLOW water (it plugs a ford); never on deep water, lava, a cliff or a
        // building's own cells (those are barriers already). `opts.mat` = the global Wall level's material.
        if (canHoldWall(M, c)) c = ((c & ~0xff & ~0xff0000 & ~(1 << 24)) | (opts.mat ?? wall) | OWNED | (255 << 16)) >>> 0;
      }
      if (g.cells[i] !== c) { g.cells[i] = c; g.ver[i >>> 12]++; }
    }, g.W, g.H);
  }

  return { list, add, addRecord, remove, apply, applyPart, widths, get nextId() { return nextId; } };
}

const sq = (v) => v * v;
const CLEARABLE = new Set(['tree', 'shrub', 'log', 'rock', 'rubble', 'stumps']);

// ---- road geometry (PLAN M3: drawn as smooth auto-joining paths) ------------------------------------------------

/** Length of a polyline (cells). */
export function polyLength(pts, closed = false) {
  let L = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.sqrt(sq(b[0] - a[0]) + sq(b[1] - a[1])); }
  return L;
}

/** Point at distance d along a polyline. */
export function pointAt(pts, d) {
  if (d <= 0) return [pts[0][0], pts[0][1]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.sqrt(sq(b[0] - a[0]) + sq(b[1] - a[1]));
    if (d <= l || i === pts.length - 1) { const t = l ? Math.min(1, d / l) : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    d -= l;
  }
  return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
}

/** The part of a polyline between distances a and b (float points). */
export function cutPolyline(pts, a, b) {
  if (b <= a) return [];
  const out = [pointAt(pts, a)];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    const l = Math.sqrt(sq(q[0] - p[0]) + sq(q[1] - p[1]));
    acc += l;
    if (acc > a && acc < b) out.push([q[0], q[1]]);
  }
  out.push(pointAt(pts, b));
  return out;
}

/** Nearest point on a polyline to (x, y): { d2, x, y, at (distance along) }. */
export function nearestOn(pts, x, y) {
  let best = { d2: Infinity, x: pts[0][0], y: pts[0][1], at: 0 };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    let t = l2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + dx * t, py = a[1] + dy * t, d2 = sq(px - x) + sq(py - y);
    if (d2 < best.d2) best = { d2, x: px, y: py, at: acc + l * t };
    acc += l;
  }
  return best;
}

/**
 * Smooth a hand-drawn line: Chaikin corner cutting `passes` times (ends kept), then resampled every `step` cells
 * and rounded to whole cells (§3.2: vector points are integers). Same input always gives the same line.
 */
export function smoothLine(raw, passes = 2, step = 3) {
  let p = raw.map(([x, y]) => [x, y]);
  // drop repeated points
  p = p.filter((q, i) => i === 0 || q[0] !== p[i - 1][0] || q[1] !== p[i - 1][1]);
  if (p.length < 2) return p.map(([x, y]) => [Math.round(x), Math.round(y)]);
  for (let k = 0; k < passes && p.length > 2; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (i > 0) q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < p.length - 2) q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  const L = polyLength(p);
  const n = Math.max(1, Math.round(L / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const [x, y] = pointAt(p, (L * i) / n);
    const r = [Math.round(x), Math.round(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== r[0] || last[1] !== r[1]) out.push(r);
  }
  return out;
}

/**
 * Plan a road from a raw pen line (PLAN M3; shared by the sim, which decides, and the console, which stamps the price
 * on the pen). PURE: `cellAt(x, y)` reads the cells, `roads` are the existing road vectors, `doors` are points a road
 * end may join (building doors). Ends within `cfg.joinCells` of another road join it at the nearest point (a
 * junction) or snap to a door. The centre line may not cross a cliff (until Road `stairsAt`), a building, or water /
 * lava the Bridge level cannot span: those spans come back as `gaps` (red on the pen) with the unlock that would
 * bridge them.
 * Returns { ok, why, unlock, pts, len, bridge (cells of span), cost: {res: n}, gaps: [[x0,y0,x1,y1]], joins }.
 */
export function planRoad({ cellAt, W, H, M, cfg, levels = {}, roads = [], doors = [] }, raw) {
  const out = { ok: false, why: '', unlock: null, pts: [], len: 0, bridge: 0, cost: {}, gaps: [], joins: [] };
  if (!raw || raw.length < 2) { out.why = 'Draw a line for the road.'; return out; }
  let pts = smoothLine(raw, cfg.smoothPasses, cfg.resample);
  const j2 = cfg.joinCells * cfg.joinCells;
  const snap = (end) => {
    const p = end === 0 ? pts[0] : pts[pts.length - 1];
    let best = null;
    for (const r of roads) {
      const n = nearestOn(r.pts, p[0], p[1]);
      if (n.d2 <= j2 && (!best || n.d2 < best.d2)) best = { ...n, id: r.id };
    }
    for (const d of doors) {
      const d2 = sq(d[0] - p[0]) + sq(d[1] - p[1]);
      if (d2 <= j2 && (!best || d2 < best.d2)) best = { d2, x: d[0], y: d[1], at: 0, id: null, door: d[2] ?? true };
    }
    if (!best) return;
    const q = [Math.round(best.x), Math.round(best.y)];
    if (end === 0) { if (q[0] !== pts[0][0] || q[1] !== pts[0][1]) pts.unshift(q); pts[0] = q; }
    else { if (q[0] !== p[0] || q[1] !== p[1]) pts.push(q); pts[pts.length - 1] = q; }
    out.joins.push({ end, road: best.id, door: best.door || null, at: [q[0], q[1]] });
  };
  snap(0); snap(1);
  // an end that snapped onto the very point the other end is at would make a zero-length road
  pts = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  out.pts = pts;
  out.len = polyLength(pts);
  if (pts.length < 2 || out.len < cfg.minLen) { out.why = 'That road is too short to lay.'; return out; }
  if (out.len > cfg.maxLen) { out.why = `That road is too long to lay in one go (${Math.round(out.len / 2)} m; the most is ${cfg.maxLen / 2} m).`; return out; }
  const bridgeLv = levels.bridge || 1, roadLv = levels.road || 1;
  const reach = new Set((cfg.reach[String(Math.min(bridgeLv, 3))] || ['shallow']).map((id) => M.id[id]));
  const steps = Math.ceil(out.len * 2);
  let gap = null, worst = null;
  let bridge = 0;
  const kindOf = (c) => {
    const m = c & 255;
    if (c & (1 << 30)) return roadLv >= cfg.stairsAt ? 'ok' : 'cliff';
    if (M.list[m]?.wallPart) return 'ok'; // M4: a road over a wall gets a gate there (js/sim/defence/walls.js)
    if ((c & (1 << 25)) && !M.walk[m]) return 'building';
    if (M.water[m] || M.hot[m]) {
      if (reach.has(m)) return 'bridge';
      return M.hot[m] ? 'lava' : 'deep';
    }
    return 'ok';
  };
  for (let s = 0; s <= steps; s++) {
    const [x, y] = pointAt(pts, (out.len * s) / steps);
    const cx = Math.floor(x + 0.5), cy = Math.floor(y + 0.5);
    let k;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) k = 'edge';
    else k = kindOf(cellAt(cx, cy));
    if (k === 'bridge') bridge += out.len / steps;
    const bad = k !== 'ok' && k !== 'bridge';
    if (bad) {
      if (!gap) { gap = [x, y, x, y, k]; out.gaps.push(gap); }
      gap[2] = x; gap[3] = y;
      if (!worst || RANK[k] > RANK[worst]) worst = k;
    } else gap = null;
  }
  out.bridge = Math.round(bridge * 10) / 10;
  for (const [r, n] of Object.entries(cfg.cost || {})) out.cost[r] = Math.ceil(n * out.len);
  for (const [r, n] of Object.entries(cfg.bridgeCost || {})) if (bridge > 0) out.cost[r] = (out.cost[r] || 0) + Math.ceil(n * bridge);
  if (worst) {
    out.why = {
      cliff: `The road runs off a cliff edge. Roads climb cliffs only with ${cfg.stairsName}.`,
      building: 'The road runs through a building. Go round it, or end the road at its door.',
      deep: `The road crosses deep water. A bridge that long needs ${cfg.reachNames.deep}.`,
      lava: `The road crosses lava. A bridge over lava needs ${cfg.reachNames.lava}.`,
      edge: 'The road runs off the edge of the map.',
    }[worst];
    out.unlock = worst === 'cliff' ? cfg.stairsName : worst === 'deep' ? cfg.reachNames.deep : worst === 'lava' ? cfg.reachNames.lava : null;
    return out;
  }
  out.ok = true;
  return out;
}
const RANK = { edge: 5, lava: 4, deep: 3, cliff: 2, building: 1 };


// ---- wall geometry (PLAN M4: walls are easy to draw — drag a line, it joins anything within 3 m, it snaps to cliffs
// and deep water, the blueprint goes down at once) ------------------------------------------------------------------

/** Material ids that are part of a wall (data/materials.json `wallPart`: every wall level's material and the gate). */
export function wallParts(M) {
  const t = new Uint8Array(256);
  M.list.forEach((m, i) => { if (m.wallPart) t[i] = 1; });
  return t;
}

/** May a wall cell be stamped here? Land you can walk on, shallow water, or a wall already (a level change). */
export function canHoldWall(M, c) {
  const m = c & 255;
  if (c & EDGE) return false;
  if (M.list[m]?.wallPart) return true;
  if (c & OWNED) return false;   // a building's cells (roof or yard), a tower footing, a nest are not ours to cover
  if (M.hot[m]) return false;
  if (M.water[m] && !M.walk[m]) return false;    // deep water
  return M.walk[m] > 0 || M.water[m] > 0;
}

/** Is this cell a natural edge a wall may end against (a cliff, deep water, lava)? */
export function isEdgeCell(M, c) {
  const m = c & 255;
  return (c & EDGE) !== 0 || M.hot[m] > 0 || (M.water[m] > 0 && M.walk[m] === 0);
}

/** Douglas-Peucker: drop points that sit within `tol` cells of the straight line through their neighbours. */
export function simplifyLine(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.sqrt(sq(ax + dx * t - px) + sq(ay + dy * t - py));
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Do segments a-b and c-d cross? Returns the parameter t along a-b, or -1. */
export function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/** Distances along polyline `a` where it crosses polyline `b`. */
export function crossings(a, b) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1], q = a[i];
    const l = Math.sqrt(sq(q[0] - p[0]) + sq(q[1] - p[1]));
    for (let j = 1; j < b.length; j++) {
      const t = segCross(p[0], p[1], q[0], q[1], b[j - 1][0], b[j - 1][1], b[j][0], b[j][1]);
      if (t >= 0) out.push(acc + l * t);
    }
    acc += l;
  }
  return out;
}

/**
 * Plan a wall from a raw pen line (shared by the sim, which decides, and the console, which shows the pen's price,
 * joins and snaps — the same function both sides). PURE.
 *   cellAt(x, y) → cell value · walls: existing wall vectors [{ id, pts }] · cfg: buildings.json vectors.wall
 *   straight: a ruler line from the first point to the last (Shift)
 * A drag is simplified (a near-straight drag becomes straight, corners stay) and smoothed. An end within
 * `cfg.joinCells` of another wall's line joins it at the nearest point; a stroke whose ends meet closes into a ring;
 * an end that does not join and comes within `cfg.snapCells` of a cliff, deep water or lava runs on to it.
 * Returns { ok, why, pts, len, closed, joins: [{ end, wall, at: [x, y] }], snaps: [{ end, at, kind }], sections, cost }.
 */
export function planWall({ cellAt, W, H, M, cfg, walls = [], straight = false }, raw) {
  const out = { ok: false, why: '', pts: [], len: 0, closed: false, joins: [], snaps: [], sections: 0, cost: {} };
  const rawEnds = raw && raw.length ? [raw[0], raw[raw.length - 1]] : null; // joins measure from where the pen really ended
  let p = (raw || []).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
  if (p.length < 2) { out.why = 'Drag a line for the wall.'; return out; }
  const j = cfg.joinCells, j2 = j * j;
  // a stroke that comes back to where it started is a ring
  const loop = !straight && p.length > 3 && sq(p[0][0] - p[p.length - 1][0]) + sq(p[0][1] - p[p.length - 1][1]) <= j2 && polyLength(p) > 4 * j;
  if (straight) p = [p[0], p[p.length - 1]];
  else {
    p = simplifyLine(p, cfg.simplify);
    if (p.length > 2) p = smoothLine(p, cfg.smoothPasses, cfg.resample);
  }
  if (loop) { if (p.length > 3) p.pop(); out.closed = true; }
  // joins: each free end runs on to the nearest point of another wall within joinCells (3 m)
  const joinEnd = (end) => {
    const q = rawEnds ? rawEnds[end === 0 ? 0 : 1] : end === 0 ? p[0] : p[p.length - 1];
    let best = null;
    for (const w of walls) {
      const n = nearestOn(w.closed ? [...w.pts, w.pts[0]] : w.pts, q[0], q[1]);
      if (n.d2 <= j2 + 1e-9 && (!best || n.d2 < best.d2)) best = { ...n, id: w.id };
    }
    if (!best) return false;
    const r = [Math.round(best.x), Math.round(best.y)];
    const e = end === 0 ? p[0] : p[p.length - 1];
    if (end === 0) { if (r[0] !== e[0] || r[1] !== e[1]) p.unshift(r); }
    else if (r[0] !== e[0] || r[1] !== e[1]) p.push(r);
    out.joins.push({ end, wall: best.id, at: r });
    return true;
  };
  // snaps: a free end within snapCells of a cliff / deep water / lava runs on to the edge, so there is no gap to slip by
  const snapEnd = (end) => {
    const q = end === 0 ? p[0] : p[p.length - 1];
    const s = cfg.snapCells, s2 = s * s;
    let best = null;
    for (let dy = -s; dy <= s; dy++) for (let dx = -s; dx <= s; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > s2 || (best && d2 >= best.d2)) continue;
      const x = q[0] + dx, y = q[1] + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = cellAt(x, y);
      if (isEdgeCell(M, c)) best = { d2, x, y, kind: (c & EDGE) ? 'cliff' : M.hot[c & 255] ? 'lava' : 'deep' };
    }
    if (!best || best.d2 === 0) return;
    const r = [best.x, best.y];
    if (end === 0) p.unshift(r); else p.push(r);
    out.snaps.push({ end, at: r, kind: best.kind });
  };
  if (!out.closed) for (const end of [0, 1]) if (!joinEnd(end)) snapEnd(end);
  p = p.filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
  out.pts = p;
  out.len = polyLength(p, out.closed);
  if (p.length < 2 || out.len < cfg.minLen) { out.why = 'That wall is too short to build.'; return out; }
  if (out.len > cfg.maxLen) { out.why = `That wall is too long to stake out in one go (${Math.round(out.len / 2)} m; the most is ${cfg.maxLen / 2} m).`; return out; }
  for (const [x, y] of p) if (x < 0 || y < 0 || x >= W || y >= H) { out.why = 'The wall runs off the edge of the map.'; return out; }
  // a wall must stand somewhere: at least one section's worth of cells that can hold it
  const steps = Math.ceil(out.len);
  let can = 0;
  const pts = out.closed ? [...p, p[0]] : p;
  for (let s = 0; s <= steps; s++) {
    const [x, y] = pointAt(pts, (out.len * s) / steps);
    const cx = Math.floor(x + 0.5), cy = Math.floor(y + 0.5);
    if (cx >= 0 && cy >= 0 && cx < W && cy < H && canHoldWall(M, cellAt(cx, cy))) can++;
  }
  if (can < Math.min(steps, cfg.sectionCells / 2)) { out.why = 'There is no ground there to stand a wall on.'; return out; }
  out.sections = Math.max(1, Math.round(out.len / cfg.sectionCells));
  for (const [r, n] of Object.entries(cfg.cost || {})) out.cost[r] = Math.ceil(n * out.len - 1e-9);
  out.ok = true;
  return out;
}
