// Turns a hand-written map (first-map.js) into the world contract Roverlands' physics and vehicles read
// (roverlands/docs/PLAN.md "World contract"): size, cell, dim, heights, heightAt, normalAt, surfaceAt, waterAt, objects,
// roads, roadGraph, sites. Pure: no three.js, no DOM, no clock, no Math.random. Same map in, same world out, in a page,
// a Worker or Node. Everything here is in plain data, so the sim can read roads without loading anything else.
//
// Extra fields Oddhaven adds: world.towns, world.buildings, world.blocks (pavement loops), world.footpaths, world.lamps,
// world.trees, world.bridge, world.river. A building: { id, town, kind, x, z, y, yaw, w, d, h, floors, roof, tint, door:[x,z], doorX, garage, parking:[{x,z,yaw}] };
// its front (the street side, with the door) looks along local +z = (sin yaw, cos yaw).
//
// Roads get real heights first and the ground is cut to fit them, so a tyre, a road ribbon and a traffic rail all agree.
// The 4 m grid is too coarse to carry a road's edge, so surfaceAt asks how far you are from the road centre instead.
import { SURFACES, SURF } from '../../../roverlands/js/world/world-data.js';
import { fbm, clamp, lerp, smoothstep, makeRng, hash01 } from '../../../roverlands/js/world/wmath.js';

const YARD = 3;              // metres between the pavement and a building's front: a path, a parked car
const GARAGE_W = 12.6;       // a house this wide has a garage
const MAX_GRADE = 0.05;
const FLAT = 5;             // metres past the road edge the ground stays exactly at road height
const BLEND = 26;           // and over how many metres more it fades back to the land

/** Rounded corners: Chaikin's corner cutting; the first and last points stay put. */
function chaikin(pts, rounds = 3) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      if (i + 2 < p.length) out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
/** Even spacing along a line. */
function resample(pts, step) {
  const out = [pts[0].slice()]; let need = step;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az); let at = need;
    while (at <= L) { const t = at / L; out.push([ax + (bx - ax) * t, az + (bz - az) * t]); at += step; }
    need = at - L;
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.4) out.push(last.slice()); else out[out.length - 1] = last.slice();
  return out;
}

export function buildWorld(input) {
  let map = input;
  const { size, cell, lane, river: R, seed } = map;
  const half = size / 2, dim = Math.round(size / cell) + 1, N = dim * dim;
  const rng = makeRng(seed * 2654435761 + 11);
  const clampI = i => (i < 0 ? 0 : i > dim - 1 ? dim - 1 : i);

  // --- the river's line, and how far every grid sample is from it ---------------------------------------------------
  const riverPts = resample(chaikin(R.pts), 8);
  const riverGap = new Float32Array(N).fill(1e4);
  const splat = (gap, x, z, radius, extra) => {
    const c0 = Math.floor((x - radius + half) / cell), c1 = Math.ceil((x + radius + half) / cell);
    const r0 = Math.floor((z - radius + half) / cell), r1 = Math.ceil((z + radius + half) / cell);
    for (let j = clampI(r0); j <= clampI(r1); j++) for (let i = clampI(c0); i <= clampI(c1); i++) {
      const dx = -half + i * cell - x, dz = -half + j * cell - z, d = Math.sqrt(dx * dx + dz * dz), k = j * dim + i;
      if (d < gap[k]) { gap[k] = d; extra?.(k); }
    }
  };
  for (const [x, z] of riverPts) splat(riverGap, x, z, 210);

  // --- the bare land: broad rolling noise on a coarse grid, town pads, a valley for the river, hills at the map's edge
  const T = map.timber;
  const pads = map.towns.map(t => ({ x: t.x, z: t.z, y: t.y, r: 190, blend: 170 }));
  if (T) for (const q of [[T.gate[0] + 10, -175], [T.forest.x, T.forest.z + 10]]) pads.push({ x: q[0], z: q[1], y: T.y, r: 88, blend: 70 });
  const COARSE = 4, cdim = Math.floor((dim - 1) / COARSE) + 1;
  const coarse = new Float32Array(cdim * cdim);
  const S = seed % 9973;
  for (let j = 0; j < cdim; j++) for (let i = 0; i < cdim; i++) {
    const x = -half + i * cell * COARSE, z = -half + j * cell * COARSE;
    coarse[j * cdim + i] = 13 + (fbm(x * 0.0016, z * 0.0016, S, 3) - 0.5) * 26;
  }
  const noiseAt = (i, j) => {
    const fx = i / COARSE, fz = j / COARSE, i0 = Math.min(cdim - 2, Math.floor(fx)), j0 = Math.min(cdim - 2, Math.floor(fz)), tx = fx - i0, tz = fz - j0;
    const a = coarse[j0 * cdim + i0], b = coarse[j0 * cdim + i0 + 1], c = coarse[(j0 + 1) * cdim + i0], d = coarse[(j0 + 1) * cdim + i0 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };
  const land = new Float32Array(N);
  for (let j = 0; j < dim; j++) for (let i = 0; i < dim; i++) {
    const x = -half + i * cell, z = -half + j * cell, k = j * dim + i;
    let h = noiseAt(i, j);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    h += smoothstep(half - 260, half - 30, edge) * 46;
    const g = riverGap[k];
    if (g < 210) h = lerp(Math.min(h, R.level + 3.2), h, smoothstep(R.halfW + 20, 210, g));
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + p.blend) h = lerp(p.y, h, smoothstep(p.r, p.r + p.blend, d));
    }
    land[k] = h;
  }
  const landAt = (x, z) => {
    const fx = clamp((x + half) / cell, 0, dim - 1.001), fz = clamp((z + half) / cell, 0, dim - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = land[j * dim + i], b = land[j * dim + i + 1], c = land[(j + 1) * dim + i], d = land[(j + 1) * dim + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };

  // --- towns: streets as a graph --------------------------------------------------------------------------------------
  const nodes = [], nodeId = new Map(), edges = [];
  const addNode = (id, x, z, y, town) => { const n = { id, x, z, y, town, edges: [] }; nodeId.set(id, n); nodes.push(n); return n; };
  const addEdge = (e) => { e.index = edges.length; edges.push(e); nodeId.get(e.a).edges.push(e.index); nodeId.get(e.b).edges.push(e.index); return e; };
  const toWorld = (t, ox, oz) => { const c = Math.cos(t.turn), s = Math.sin(t.turn); return [t.x + ox * c + oz * s, t.z - ox * s + oz * c]; };
  const towns = [];
  for (const t of map.towns) {
    const key = (c, r) => `${t.id}:${c},${r}`;
    t.zs.forEach((oz, r) => t.xs.forEach((ox, c) => { const [x, z] = toWorld(t, ox, oz); addNode(key(c, r), x, z, t.y, t.id); }));
    const street = (a, b) => {
      const A = nodeId.get(a), B = nodeId.get(b);
      const pts = resample([[A.x, A.z], [B.x, B.z]], 2).map(([x, z]) => [x, z, t.y]);
      addEdge({ id: `${a}>${b}`, a, b, cls: 'street', halfW: lane.halfW, limit: map.speed.town, town: t.id, pts, name: `${t.name} street` });
    };
    for (let r = 0; r < t.zs.length; r++) for (let c = 0; c < t.xs.length; c++) {
      if (c + 1 < t.xs.length && !t.skip.includes(`${c},${r}-${c + 1},${r}`)) street(key(c, r), key(c + 1, r));
      if (r + 1 < t.zs.length && !t.skip.includes(`${c},${r}-${c},${r + 1}`)) street(key(c, r), key(c, r + 1));
    }
    towns.push({ id: t.id, name: t.name, x: t.x, z: t.z, y: t.y, turn: t.turn, radius: Math.max(...t.xs.map(Math.abs), ...t.zs.map(Math.abs)) + 30 });
  }

  if (T) { addNode('timber:gate', T.gate[0], T.gate[1], T.y, null); map = { ...map, links: [...map.links, { ...T.link, to: 'timber:gate' }] }; }

  // --- the county road: its own height line, pinned at the towns and across the bridge ---------------------------------
  let bridge = null;
  for (const l of map.links) {
    const A = nodeId.get(l.from), B = nodeId.get(l.to);
    const pts2 = resample(chaikin([[A.x, A.z], ...l.via, [B.x, B.z]]), 2);
    const n = pts2.length, raw = pts2.map(([x, z]) => landAt(x, z));
    // find where the road meets the river; a straight deck spans the water and both cut banks
    const reach = R.halfW + R.bank + 3;
    const gapOf = ([x, z]) => { let best = 1e9; for (const [rx, rz] of riverPts) { const d = (rx - x) ** 2 + (rz - z) ** 2; if (d < best) best = d; } return Math.sqrt(best); };
    let i0 = -1, i1 = -1;
    for (let i = 0; i < n; i++) if (gapOf(pts2[i]) < reach) { if (i0 < 0) i0 = i; i1 = i; }
    const pinned = new Map([[0, A.y], [n - 1, B.y]]);
    if (i0 >= 0) {
      i0 = Math.max(1, i0 - 3); i1 = Math.min(n - 2, i1 + 3);
      for (let i = i0; i <= i1; i++) pinned.set(i, map.bridge.deck);
    }
    // smooth the raw land, then keep every point within reach of every pin at the steepest allowed grade
    const smooth = raw.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 40); k <= Math.min(n - 1, i + 40); k++) { s += raw[k]; c++; } return s / c; });
    const lo = new Float64Array(n).fill(-Infinity), hi = new Float64Array(n).fill(Infinity);
    for (const [at, y] of pinned) for (let i = 0; i < n; i++) { const d = Math.abs(i - at) * 2 * MAX_GRADE; lo[i] = Math.max(lo[i], y - d); hi[i] = Math.min(hi[i], y + d); }
    const y = smooth.map((v, i) => (pinned.has(i) ? pinned.get(i) : clamp(v, lo[i], hi[i])));
    for (let pass = 0; pass < 2; pass++) {   // a light second smoothing, pins held
      const prev = y.slice();
      for (let i = 0; i < n; i++) if (!pinned.has(i)) { let s = 0, c = 0; for (let k = Math.max(0, i - 12); k <= Math.min(n - 1, i + 12); k++) { s += prev[k]; c++; } y[i] = clamp(s / c, lo[i], hi[i]); }
    }
    const pts = pts2.map(([x, z], i) => [x, z, y[i]]);
    addEdge({ id: l.id, a: l.from, b: l.to, cls: 'county', halfW: lane.halfW, limit: map.speed.country, pts, name: l.name });
    if (i0 >= 0) {
      const a = pts[i0], b = pts[i1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      bridge = { id: 'wend-bridge', name: map.bridge.name, road: l.id, from: i0, to: i1, a: [a[0], a[1]], b: [b[0], b[1]], deck: map.bridge.deck, len, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), halfW: lane.halfW + 1.3, cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2 };
    }
  }

  // --- how far each grid sample is from a road, and that road's height there -------------------------------------------
  const roadGap = new Float32Array(N).fill(1e4), roadY = new Float32Array(N);
  const reach = lane.halfW + FLAT + BLEND + 4;
  for (const e of edges) {
    const stride = e.cls === 'street' ? 2 : 1;
    for (let i = 0; i < e.pts.length; i += stride) { const [x, z, y] = e.pts[i]; splat(roadGap, x, z, reach, k => { roadY[k] = y; }); }
  }

  // --- the finished ground ---------------------------------------------------------------------------------------------
  const heights = new Float32Array(N), bed = R.level - 2.4;
  for (let k = 0; k < N; k++) {
    let h = land[k];
    const d = roadGap[k];
    if (d < reach) h = lerp(roadY[k], h, smoothstep(lane.halfW + FLAT, reach - 4, d));
    const g = riverGap[k];
    if (g < R.halfW + R.bank) h = lerp(bed, h, smoothstep(R.halfW * 0.72, R.halfW + R.bank, g));
    heights[k] = h;
  }

  // --- sampling ----------------------------------------------------------------------------------------------------------
  const bilinear = (a, x, z) => {
    const fx = clamp((x + half) / cell, 0, dim - 1.001), fz = clamp((z + half) / cell, 0, dim - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const p = a[j * dim + i], q = a[j * dim + i + 1], r = a[(j + 1) * dim + i], s = a[(j + 1) * dim + i + 1];
    return lerp(lerp(p, q, tx), lerp(r, s, tx), tz);
  };
  const heightAt = (x, z) => bilinear(heights, x, z);
  const normalAt = (x, z) => {
    const e = cell, dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    const l = Math.sqrt(dx * dx + dz * dz + 4 * e * e);
    return [-dx / l, 2 * e / l, -dz / l];
  };
  const roadDistance = (x, z) => bilinear(roadGap, x, z);
  const riverDistance = (x, z) => bilinear(riverGap, x, z);
  const surfaceAt = (x, z) => {
    const d = roadDistance(x, z);
    if (d <= lane.halfW + lane.pavement + 0.4) return SURFACES[SURF.road];
    if (riverDistance(x, z) < R.halfW + 6) return SURFACES[SURF.sand];
    return d <= lane.halfW + 2.2 ? SURFACES[SURF.gravel] : SURFACES[SURF.grass];
  };
  const waterAt = (x, z) => (riverDistance(x, z) < R.halfW + 1.5 ? R.level : null);

  // --- what stands on the map: objects carry the colliders, in the world contract's shape ------------------------------
  const objects = [];
  const obj = o => { o.id = objects.length; objects.push(o); return o; };
  const buildings = [], blocks = [], lamps = [], footpaths = [];
  const inner = lane.halfW + lane.pavement;
  const WALLS = ['#d9c9ae', '#b9a68c', '#c8775a', '#9fb0b8', '#e4dccd', '#a8926e', '#7d8c78', '#c9b37a'];
  const ROOFS = ['#6a4a3c', '#51555a', '#7c4436', '#40474f'];

  function placeBuilding(t, kind, cx, cz, w, d, front, floors, roof) {
    // cx, cz, in the town's own frame; front = the local direction the door faces
    const [x, z] = toWorld(t, cx, cz), n = buildings.length;
    const yaw = front + t.turn, sy = Math.sin(yaw), cy = Math.cos(yaw);
    const h = floors * 3.1 + (roof === 'gable' ? 0.2 : 0.7);
    // a house has its door to one side, so the car has the other half of the yard; a wide one has a garage on that side
    const side = hash01(n, 23, seed) < 0.5 ? 1 : -1, doorX = kind === 'houses' ? -side * 1.4 : 0, garage = kind === 'houses' && w >= GARAGE_W ? side : 0;
    const local = (lx, lz) => [x + lx * cy + lz * sy, z - lx * sy + lz * cy];
    const b = {
      id: `${t.id}-b${n}`, town: t.id, kind, x, z, y: t.y, yaw, w, d, h, floors, roof, doorX, garage, side,
      tint: WALLS[Math.floor(rng() * WALLS.length)], roofTint: ROOFS[Math.floor(rng() * ROOFS.length)],
      door: local(doorX, d / 2 + 0.05), parking: [],
    };
    // parked cars stand along the front of the plot, nose to the side, clear of the door (data, so the sim never needs a picture)
    const yardZ = d / 2 + YARD / 2 - 0.2, spot = lx => { const [px, pz] = local(lx, yardZ); b.parking.push({ x: px, z: pz, yaw: yaw + Math.PI / 2 }); };
    if (kind === 'houses') {
      if (garage) { const [px, pz] = local(side * (w / 2 - 1.75), d / 2 - 2.9); b.parking.push({ x: px, z: pz, yaw, inside: true }); }
      else spot(side * Math.min(3.4, w / 2 - 2.5));
    } else for (let lx = -w / 2 + 2.8; lx < -2.9 + (kind === 'flats' || kind === 'civic' ? w : 0); lx += 5.6) if (Math.abs(lx - doorX) > 3.2) spot(lx);
    buildings.push(b);
    obj({ kind: 'building', x, y: t.y - 0.5, z, yaw, s: 1, shape: { t: 'box', hx: w / 2, hy: (h + 0.5) / 2, hz: d / 2 }, ref: b.id });
  }
  /** Lots along one side of a block. `along` local axis 'x' or 'z'; `side` +1/-1 is which way the street lies. */
  function row(t, style, a0, a1, fixed, along, side, trim = 0) {
    const P = { shops: [13, 19, 15, 2, 4, 0, 1], houses: [11, 15, 11, 1, 2, 4, 8], flats: [22, 30, 16, 4, 6, 3, 6] }[style];
    // the side rows are squeezed to clear the corners the set-back front rows now reach: same buildings, same order (a save's places)
    const k = (a1 - a0 - trim * 2) / (a1 - a0), squeeze = v => a0 + trim + (v - a0) * k;
    let at = a0;
    while (at < a1 - P[0]) {
      const w = Math.min(a1 - at, P[0] + rng() * (P[1] - P[0]));
      const floors = P[3] + Math.floor(rng() * (P[4] - P[3] + 1));
      const c = squeeze(at + w / 2), width = w * k - 0.6, off = fixed - side * (P[2] / 2 + YARD);
      const roof = style === 'houses' ? 'gable' : 'flat';
      if (along === 'x') placeBuilding(t, style, c, off, width, P[2], side > 0 ? 0 : Math.PI, floors, roof);
      else placeBuilding(t, style, off, c, width, P[2], side > 0 ? Math.PI / 2 : -Math.PI / 2, floors, roof);
      at += w + P[5] + rng() * (P[6] - P[5]);
    }
  }
  for (const t of map.towns) {
    for (let r = 0; r + 1 < t.zs.length; r++) for (let c = 0; c + 1 < t.xs.length; c++) {
      const x0 = t.xs[c], x1 = t.xs[c + 1], z0 = t.zs[r], z1 = t.zs[r + 1];
      const style = t.styles[r]?.[c] || 'houses';
      const bx0 = x0 + inner + 1, bx1 = x1 - inner - 1, bz0 = z0 + inner + 1, bz1 = z1 - inner - 1;
      // the pavement loop people walk: in the middle of the pavement, round the block, in world metres
      const m = lane.halfW + lane.pavement / 2;
      const loop = [[x0 + m, z0 + m], [x1 - m, z0 + m], [x1 - m, z1 - m], [x0 + m, z1 - m]].map(([a, b]) => toWorld(t, a, b));
      blocks.push({ id: `${t.id}-block-${c}-${r}`, town: t.id, style, loop });
      // a street left out of the plan still has its pavement: a plain footpath along that side of the block
      const sides = [[`${c},${r}-${c + 1},${r}`, 0, 1], [`${c + 1},${r}-${c + 1},${r + 1}`, 1, 2], [`${c},${r + 1}-${c + 1},${r + 1}`, 2, 3], [`${c},${r}-${c},${r + 1}`, 3, 0]];
      for (const [key, a, b] of sides) if (t.skip.includes(key)) footpaths.push({ town: t.id, a: loop[a], b: loop[b], y: t.y });
      if (style === 'park') continue;
      if (style === 'civic') {
        const w = Math.min(bx1 - bx0, 46), d = Math.min(bz1 - bz0, 34);
        placeBuilding(t, 'civic', (bx0 + bx1) / 2, (bz0 + bz1) / 2 + 2, w, d, 0, 3, 'flat');
        continue;
      }
      const depth = { shops: 15, houses: 11, flats: 16 }[style];
      row(t, style, bx0, bx1, bz1, 'x', 1);
      row(t, style, bx0, bx1, bz0, 'x', -1);
      row(t, style, bz0 + depth + 2, bz1 - depth - 2, bx1, 'z', 1, YARD - 1.2);
      row(t, style, bz0 + depth + 2, bz1 - depth - 2, bx0, 'z', -1, YARD - 1.2);
    }
    // lamps down the pavements
    const edgesHere = edges.filter(e => e.town === t.id);
    for (const e of edgesHere) {
      const L = (e.pts.length - 1) * 2, a = e.pts[0], b = e.pts[e.pts.length - 1], ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let s = 16; s < L - 12; s += 34) for (const side of [1, -1]) {
        const x = a[0] + ux * s - uz * side * (lane.halfW + 0.45), z = a[1] + uz * s + ux * side * (lane.halfW + 0.45);
        lamps.push({ x, z, y: t.y, yaw: Math.atan2(uz * side, -ux * side) });
        obj({ kind: 'lamp', x, y: t.y, z, yaw: 0, s: 1, shape: { t: 'cyl', r: 0.09, h: 5 } });
      }
    }
  }
  // the timber site: two huts, the forest's trees (the sim fells these, so they are not in world.trees) and the layout the sim works to
  let timber = null;
  if (T) {
    const here = { id: 'timber', x: 0, z: 0, y: T.y, turn: 0 }, n0 = buildings.length;
    placeBuilding(here, 'camp', T.camp.x, T.camp.z, T.camp.w, T.camp.d, 0, 1, 'flat');
    placeBuilding(here, 'mill', T.mill.x, T.mill.z, T.mill.w, T.mill.d, Math.PI / 2, 1, 'flat');
    const [camp, mill] = buildings.slice(n0), F = T.forest, siteTrees = [];
    camp.site = mill.site = true;
    mill.parking = [{ x: T.truck.x, z: T.truck.z, yaw: T.truck.yaw, truck: true }];
    for (let j = 0; j < F.rows; j++) for (let i = 0; i < F.cols; i++) {
      const k = j * F.cols + i, x = F.x + (i - (F.cols - 1) / 2) * F.step + (hash01(k, 31, seed) - 0.5) * 2.6, z = F.z + (j - (F.rows - 1) / 2) * F.step + (hash01(k, 37, seed) - 0.5) * 2.6;
      siteTrees.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: T.y, s: +(0.92 + hash01(k, 41, seed) * 0.34).toFixed(2), tint: +hash01(k, 43, seed).toFixed(3) });
    }
    const X = T.benchX;
    timber = {
      name: T.name, y: T.y, centre: [(T.mill.x + T.camp.x) / 2 + 8, -225], radius: T.radius, camp: camp.id, mill: mill.id, node: 'timber:gate',
      trees: siteTrees, landing: T.landing, lever: T.lever, deck: T.deck, rack: T.rack, truck: T.truck,
      benches: T.benches.map(b => ({ infeed: [X.infeed, b.z], lever: [X.lever, b.z + 2.2], blade: [X.blade, b.z], out: [X.out, b.z] })),
    };
  }

  // the bridge: one deck box the wheels roll on, two rails to bounce off
  if (bridge) {
    const { cx, cz, yaw, len, deck, halfW } = bridge;
    obj({ kind: 'bridge', x: cx, y: deck - 0.8, z: cz, yaw, s: 1, surface: SURFACES[SURF.road], shape: { t: 'box', hx: halfW, hy: 0.4, hz: len / 2 } });
    for (const side of [1, -1]) {
      const ox = Math.cos(yaw) * side * (halfW - 0.15), oz = -Math.sin(yaw) * side * (halfW - 0.15);
      obj({ kind: 'bridge-rail', x: cx + ox, y: deck, z: cz + oz, yaw, s: 1, shape: { t: 'box', hx: 0.15, hy: 0.5, hz: len / 2 } });
    }
  }
  // the edge of the map: tall invisible walls, so nobody drives off the end of the ground
  for (const [x, z, hx, hz] of [[0, -half + 2, half, 2], [0, half - 2, half, 2], [-half + 2, 0, 2, half], [half - 2, 0, 2, half]]) {
    obj({ kind: 'edge', x, y: -5, z, yaw: 0, s: 1, shape: { t: 'box', hx, hy: 120, hz } });
  }

  // trees: thick where the slow noise says so, thin elsewhere; nothing on a road, in the river or in a town
  const trees = [];
  const inTown = (x, z, m) => towns.some(t => Math.hypot(x - t.x, z - t.z) < t.radius * 1.42 + m);
  for (let tries = 0; tries < map.trees.count * 6 && trees.length < map.trees.count; tries++) {
    const x = (hash01(tries, 3, seed) - 0.5) * (size - 40), z = (hash01(tries, 7, seed) - 0.5) * (size - 40);
    if (fbm(x * 0.004, z * 0.004, S + 5, 2) < 0.47) continue;
    if (roadDistance(x, z) < 12 || riverDistance(x, z) < R.halfW + 9 || inTown(x, z, 6) || (timber && Math.hypot(x - timber.centre[0], z - timber.centre[1]) < timber.radius)) continue;
    const s = 0.8 + hash01(tries, 11, seed) * 0.7;
    trees.push({ x, z, y: heightAt(x, z), s, tint: hash01(tries, 13, seed) });
  }
  for (const b of blocks) {        // and the parks
    if (b.style !== 'park') continue;
    const [a, , c] = b.loop, cx = (a[0] + c[0]) / 2, cz = (a[1] + c[1]) / 2, rad = Math.hypot(a[0] - c[0], a[1] - c[1]) / 2 * 0.52;
    for (let i = 0; i < map.trees.street; i++) {
      const u = hash01(i, 17, seed), v = hash01(i, 19, seed), ang = u * 6.2832, r = Math.sqrt(v) * rad;
      trees.push({ x: cx + Math.cos(ang) * r, z: cz + Math.sin(ang) * r, y: heightAt(cx, cz), s: 0.75 + v * 0.5, tint: u });
    }
  }
  for (const t of trees) obj({ kind: 'tree', x: t.x, y: t.y, z: t.z, yaw: 0, s: t.s, shape: { t: 'cyl', r: 0.3 * t.s, h: 3.2 * t.s } });

  // fire hydrants: one on a corner of every street junction, on the pavement
  const hydrants = [];
  for (const n of nodes) { if (n.edges.length < 3 || !n.town) continue; const d = lane.halfW + 1.3; hydrants.push([n.x + d, n.z + d]); }

  const world = {
    id: map.id, zone: map.zone, seed, size, cell, dim, heights, heightAt, normalAt, surfaceAt, waterAt, roadDistance, riverDistance,
    surface: null, objects, decor: [],
    roads: edges.map(e => ({ id: e.id, cls: e.cls, from: e.a, to: e.b, halfW: e.halfW, limit: e.limit, town: e.town, name: e.name, pts: e.pts })),
    roadGraph: { nodes: nodes.map(n => ({ id: n.id, x: n.x, z: n.z, y: n.y, town: n.town, edges: n.edges })), edges: edges.map((e, i) => ({ a: e.a, b: e.b, road: i })) },
    towns, buildings, blocks, lamps, trees, bridge, footpaths, timber, hydrants,
    river: { name: R.name, level: R.level, halfW: R.halfW, pts: riverPts },
    lane, speed: map.speed, sites: { labels: towns.map(t => ({ name: t.name, x: t.x, z: t.z })) },
  };
  return world;
}
