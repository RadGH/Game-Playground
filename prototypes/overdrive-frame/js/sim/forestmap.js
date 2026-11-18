// The pine forest (Pinewatch): a wooded ridge outside the city. Same output as makeCityMap (lots, roads, plazas, start,
// extract, edges) so the mission, the flow field, the mirror, contracts and the briefing map need nothing new — plus
// `forest: {…}` for the ground drawing (render/forest-ground.js).
//
//   woods      everything not cleared is pine stands (City Kit forest recipes). Trees block movement and shots until
//              they are knocked down (then they are rubble you walk over). No tile is deeper than DEPTH tiles into the
//              woods: deer trails are cut into any deeper patch, so the trees always stand in bands between lanes.
//   river      a meandering band of shallow water down one side, top edge to bottom edge. Open ground (you wade it).
//   dam        a small hydro dam across the river with its reservoir pooled behind it; portage trails round both ends.
//   road       a winding gravel road from the west edge through the logging camp, over the river on a bridge and out
//              the east edge (the swarm comes in along it, like streets in the city).
//   camp       the logging camp in a big clearing: sawmill, log decks, a skidder, crew cabins round an open yard. The
//              drop point is the middle of the yard (a mission's "hold the camp" is a zone on the start).
//   lookout    a ranger's fire tower and cabin in a clearing, a trail up to it and on to the north edge.
//   power cut  the line from the dam to the camp in a cleared strip, pylons along its edge.
//   clearings  a handful of round meadows to fight in, each joined to the trails.
//   extract    a cleared landing patch in the far corner, across the river from the camp.
// Every lane is 2+ tiles wide (a frame is ~0.4 tiles across). Seeded and pure: the co-op server and every player build
// the identical forest from the same seed.
import { makeRng } from './rng.js';

const STYLES = ['chrome', 'pearl', 'copper', 'concrete'];
const DEPTH = 5;                          // the furthest a tree tile may be from open ground (tiles)
// lane brushes: every tile whose centre is within this of the path is cleared. 1.42 keeps a diagonal lane 2.8 tiles
// across (1.05 left a diagonal only 1.4 across between the stair-stepped tree lots); a straight one is 2-3 tiles.
const LANE_R = 1.42, ROAD_R = 1.55;

/** Lot kinds. h = height in tiles (a frame is 0.75 tall). Woods kinds reuse a few seeds so their pictures are shared. */
const WOODS = [
  { recipe: 'forest-pines', size: [2, 2], h: 1.25, hp: 900, w: 6 },
  { recipe: 'forest-thicket', size: [2, 1], h: 1.0, hp: 600, w: 2 },
  { recipe: 'forest-pine', size: [1, 1], h: 1.2, hp: 420, w: 1.5 },
  { recipe: 'forest-rock', size: [1, 1], h: 0.28, hp: 1600, w: 0.35 },
  { recipe: 'forest-crag', size: [2, 2], h: 0.45, hp: 3200, w: 0.3 },
];
const B = {
  sawmill: { recipe: 'forest-sawmill', size: [3, 2], h: 0.75, hp: 3600 },
  logs: { recipe: 'forest-logs', size: [2, 1], h: 0.32, hp: 1000 },
  skidder: { recipe: 'forest-skidder', size: [1, 1], h: 0.42, hp: 800, explosive: 800 },
  cabin: { recipe: 'forest-cabin', size: [1, 1], h: 0.46, hp: 1100 },
  tower: { recipe: 'forest-tower', size: [1, 1], h: 1.65, hp: 900 },
  dam: { recipe: 'forest-dam', size: [4, 2], h: 0.6, hp: 9000 },
  pylon: { recipe: 'forest-pylon', size: [1, 1], h: 1.45, hp: 700 },
};
const PINE = WOODS[2], ROCK = WOODS[3];
export const WOODS_RECIPES = WOODS.map(c => c.recipe);

/** The forest's entry in citymap.js DISTRICTS. */
export const FOREST_DISTRICT = { label: 'Pine forest', forest: true, street: 2, block: [8, 12], plaza: 0.2, lots: [...WOODS, ...Object.values(B)] };

// ground codes (map.forest.ground, one character per tile, row by row)
const GC = { woods: 'f', grass: 'g', trail: 't', road: 'r', water: 'w', bridge: 'b', yard: 'y', pad: 'p', cut: 'c' };
// occupancy while building: 0 woods (to be planted), 1 road, 2 building, 3 open, 4 water, 5 camp ground (buildings go here)
const OPEN = new Set([1, 3, 4, 5]);

const pickW = (R, list) => { const tot = list.reduce((s, x) => s + (x.w || 1), 0); let v = R.next() * tot; for (const x of list) { v -= x.w || 1; if (v <= 0) return x; } return list[0]; };
const r2 = n => Math.round(n * 100) / 100;

/** Catmull-Rom through the points, sampled every `step` tiles. */
function spline(pts, step = 0.25) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}
/** Waypoints with a jittered midpoint between each pair (a path that wanders instead of running straight). */
function wander(R, pts, amount) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, j = R.range(-amount, amount) * Math.min(1, L / 10);
    out.push({ x: (a.x + b.x) / 2 - dz / L * j, z: (a.z + b.z) / 2 + dx / L * j }, b);
  }
  return out;
}

/** @returns the same shape as makeCityMap, district 'forest', plus `forest: { ground, river, road, trails, … }`. */
export function makeForestMap({ seed, w = 44, h = 44 }) {
  const R = makeRng(seed * 37 + 11), N = w * h;
  const occ = new Uint8Array(N), gnd = new Array(N).fill(GC.woods);
  const main = new Uint8Array(N);          // tiles of the road, the named trails and the river: where the swarm comes in
  const lane = new Uint8Array(N);          // every carved lane tile: nothing is built on one (a cabin on the trail out of the camp would cut it)
  const inMap = (x, z) => x >= 0 && z >= 0 && x < w && z < h;
  const I = (x, z) => z * w + x;
  const lots = [], plazas = [], clearings = [], trails = [];
  /** Every tile whose centre is within r of (px, pz). */
  const disc = (px, pz, r, fn) => { for (let z = Math.floor(pz - r - 1); z <= pz + r + 1; z++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) if (inMap(x, z) && Math.hypot(x + 0.5 - px, z + 0.5 - pz) <= r) fn(x, z, I(x, z)); };

  // ---- the river: down the east-middle of the map, top to bottom; the reservoir pooled above the dam
  const rv = { x0: w * R.range(0.6, 0.65), amp: R.range(1.1, 2), fq: R.range(0.12, 0.2), ph: R.range(0, 6.28), wd: R.range(2.9, 3.3) };
  const damZ = Math.round(h * R.range(0.28, 0.38));
  const riverX = z => rv.x0 + rv.amp * Math.sin(z * rv.fq + rv.ph);
  const riverW = z => {
    const t = (z - (damZ - 7)) / 7;
    return t <= 0 || t >= 1 ? rv.wd : rv.wd + (3.9 - rv.wd) * t * t * (3 - 2 * t) + 2.4 * Math.sin(Math.PI * t);
  };
  const river = [];
  for (let z = 0; z <= h; z++) river.push({ z, x: r2(riverX(z)), w: r2(riverW(z)) });
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (Math.abs(x + 0.5 - riverX(z + 0.5)) <= riverW(z + 0.5) / 2) { occ[I(x, z)] = 4; gnd[I(x, z)] = GC.water; main[I(x, z)] = 1; }

  // ---- places: the camp (drop point), the lookout, the extraction
  const C = { x: Math.round(w * R.range(0.22, 0.3)), z: Math.round(h * R.range(0.62, 0.7)) };
  const start = { x: C.x + 0.5, z: C.z + 0.5 };
  const camp = { x: start.x, z: start.z, r: 7.2 };
  disc(start.x, start.z, camp.r, (x, z, i) => { if (occ[i] === 0) { occ[i] = 5; gnd[i] = GC.yard; } });
  const extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  disc(extract.x, extract.z, 3.2, (x, z, i) => { if (occ[i] === 0) { occ[i] = 3; gnd[i] = Math.hypot(x + 0.5 - extract.x, z + 0.5 - extract.z) < 2 ? GC.pad : GC.grass; } });
  plazas.push([w - 8, 1, 7, 7]);
  const T = { x: Math.round(w * R.range(0.3, 0.42)) + 0.5, z: Math.round(h * R.range(0.2, 0.3)) + 0.5 };
  const tower = { x: T.x, z: T.z, r: 3.3 };
  disc(T.x, T.z, tower.r, (x, z, i) => { if (occ[i] === 0) { occ[i] = 3; gnd[i] = GC.grass; } });

  // ---- carving lanes: a brush 2+ tiles wide along a spline
  const carve = (path, r, code, o = 3, isMain = true) => {
    for (const p of path) disc(p.x, p.z, r, (x, z, i) => {
      if (occ[i] === 2) return;
      if (isMain) main[i] = 1;
      lane[i] = 1;
      if (code === GC.road) { if (occ[i] === 4) { gnd[i] = GC.bridge; occ[i] = 1; } else { occ[i] = 1; gnd[i] = GC.road; } return; }
      if (occ[i] === 1 || occ[i] === 4) return;                      // a trail fords the river, joins the road
      if (occ[i] === 5) { if (code !== GC.cut) gnd[i] = GC.yard; return; }     // inside the camp it stays camp ground
      if (occ[i] === 3 && gnd[i] !== GC.woods && code === GC.trail && gnd[i] !== GC.cut) return;   // a trail crossing a clearing stays grass
      occ[i] = o; gnd[i] = code;
    });
  };
  const keep = path => path.map(p => [r2(p.x), r2(p.z)]);

  // the road: west edge → camp → bridge over the river (below the dam) → east edge
  const zA = Math.round(h * R.range(0.42, 0.55)) + 0.5, zB = Math.round(h * R.range(0.58, 0.74)) + 0.5, zE = Math.round(h * R.range(0.42, 0.6)) + 0.5;
  const roadPts = spline(wander(R, [{ x: -1, z: zA }, { x: C.x + 0.5, z: C.z - 1.5 }, { x: riverX(zB) - 3, z: zB }, { x: riverX(zB) + 3, z: zB }, { x: w + 1, z: zE }], 4));
  carve(roadPts, ROAD_R, GC.road);
  const nearestRoad = (x, z) => roadPts.reduce((b, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(b.x - x, b.z - z) ? p : b), roadPts[0]);
  const trail = (pts, amount = 3, isMain = true) => { const s = spline(wander(R, pts, amount)); carve(s, LANE_R, GC.trail, 3, isMain); trails.push(keep(s)); return s; };

  // the dam across the river, portage trails round both ends, its service track to the road
  const damX = Math.round(riverX(damZ + 1) - 2);
  const dam = { x: damX, z: damZ, w: 4, d: 2 };
  trail([{ x: damX - 1, z: damZ - 3.5 }, { x: damX - 1.2, z: damZ + 1 }, { x: damX - 0.5, z: damZ + 4.5 }], 0.5);
  trail([{ x: damX + 5, z: damZ - 3.5 }, { x: damX + 5.2, z: damZ + 1 }, { x: damX + 4.5, z: damZ + 4.5 }], 0.5);
  { const q = nearestRoad(damX - 1, damZ + 3); trail([{ x: damX - 1, z: damZ + 3 }, { x: q.x, z: q.z }]); }
  // the lookout: up from the camp, on to the north edge
  trail([{ x: start.x + 1, z: start.z - 4 }, { x: T.x, z: T.z }]);
  trail([{ x: T.x, z: T.z }, { x: T.x + R.range(-4, 4), z: -1 }]);
  // the extraction: down to the road (crossing the river where it must)
  { const q = nearestRoad(extract.x - 2, extract.z + 6); trail([{ x: extract.x, z: extract.z }, { x: extract.x - 3, z: extract.z + 5 }, { x: q.x, z: q.z }]); }
  // a logging trail south from the road to the bottom edge, and one from the camp out the west side
  { const p = roadPts[Math.floor(roadPts.length * R.range(0.42, 0.55))]; trail([{ x: p.x, z: p.z }, { x: p.x + R.range(-3, 3), z: h + 1 }]); }
  trail([{ x: start.x - 4, z: start.z + 3 }, { x: -1, z: Math.min(h - 3, start.z + R.range(4, 8)) }]);

  // the power line: a cleared strip from the dam's west end to the camp
  const cutA = { x: damX - 1.5, z: damZ + 1 }, cutB = { x: start.x + 4, z: start.z - 3 };
  const cutPts = spline([cutA, cutB], 0.25);
  carve(cutPts, LANE_R, GC.cut);

  // ---- clearings: round meadows to fight in, each joined to the lanes
  const nClear = Math.round(N / 300);
  for (let tries = 0; clearings.length < nClear && tries < 60; tries++) {
    const r = R.range(2.2, 3.5), x = R.range(r + 2, w - r - 2), z = R.range(r + 2, h - r - 2);
    if (Math.hypot(x - start.x, z - start.z) < camp.r + r + 2 || Math.hypot(x - T.x, z - T.z) < tower.r + r + 2 || Math.hypot(x - extract.x, z - extract.z) < r + 5) continue;
    if (clearings.some(c => Math.hypot(c.x - x, c.z - z) < c.r + r + 3)) continue;
    let wet = 0; disc(x, z, r, (_, __, i) => { if (occ[i] === 4 || occ[i] === 2) wet++; }); if (wet) continue;
    const c = { x: r2(x), z: r2(z), r: r2(r) }; clearings.push(c);
    disc(c.x, c.z, c.r, (_, __, i) => { if (occ[i] === 0) { occ[i] = 3; gnd[i] = GC.grass; } });
    plazas.push([Math.floor(c.x - c.r), Math.floor(c.z - c.r), Math.ceil(c.r * 2), Math.ceil(c.r * 2)]);
  }
  // join each clearing to the nearest open ground outside it (straight-ish trail)
  for (const c of clearings) {
    let best = null;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const i = I(x, z); if (!OPEN.has(occ[i]) || occ[i] === 4) continue;
      const d = Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z); if (d <= c.r + 0.5) continue;
      if (!best || d < best.d) best = { d, x: x + 0.5, z: z + 0.5 };
    }
    if (best) trail([{ x: c.x, z: c.z }, { x: best.x, z: best.z }], 1.5, false);
  }

  // ---- buildings
  const free = (x, z, sw, sd, ok) => { for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) if (!inMap(i, j) || !ok(occ[I(i, j)], I(i, j))) return false; return true; };
  const place = (c, x, z, sw, sd, turn, { woods = false } = {}) => {
    const floors = 1;
    lots.push({ id: 'L' + lots.length, x, z, w: sw, d: sd, h: c.h, hp: c.hp, recipe: c.recipe,
      params: { floors, seed: woods ? R.int(1, 8) : R.int(1, 9999), rot: turn ? 1 : 0, style: woods ? 'concrete' : STYLES[R.int(0, STYLES.length - 1)] }, explosive: c.explosive || 0 });
    for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) occ[I(i, j)] = 2;
  };
  // the dam first (it sits on the river)
  for (let j = dam.z; j < dam.z + dam.d; j++) for (let i = dam.x; i < dam.x + dam.w; i++) if (inMap(i, j)) gnd[I(i, j)] = GC.water;
  place(B.dam, dam.x, dam.z, 4, 2, false);
  // the camp: the sawmill, log decks, a skidder and crew cabins round the yard, on camp ground away from its middle
  const campOk = (o, i) => o === 5 && !lane[i] && Math.hypot((i % w) + 0.5 - start.x, Math.floor(i / w) + 0.5 - start.z) > 3.4;
  const campList = [[B.sawmill, 1], [B.logs, 3], [B.skidder, 1], [B.cabin, 3]];
  for (const [c, n] of campList) for (let k = 0, put = 0; k < 40 && put < n; k++) {
    const a = R.range(0, Math.PI * 2), rr = R.range(4.4, 6.2), turn = c.size[0] !== c.size[1] && R.chance(0.4);
    const sw = turn ? c.size[1] : c.size[0], sd = turn ? c.size[0] : c.size[1];
    const x = Math.round(start.x + Math.cos(a) * rr - sw / 2), z = Math.round(start.z + Math.sin(a) * rr - sd / 2);
    if (free(x, z, sw, sd, campOk)) { place(c, x, z, sw, sd, turn); put++; }
  }
  // the lookout and the ranger's cabin at the edge of its clearing
  const towerOk = (o, i) => (o === 3 || o === 0) && !lane[i];   // on the clearing, or at the edge of the trees round it
  const ring = [];
  for (const r of [1.6, 2.3, 1, 2.9, 3.6]) for (let k = 0; k < 8; k++) ring.push([Math.floor(T.x + Math.cos(k * Math.PI / 4 - 0.6) * r), Math.floor(T.z + Math.sin(k * Math.PI / 4 - 0.6) * r)]);
  for (const c of [B.tower, B.cabin]) for (const [x, z] of ring) if (free(x, z, 1, 1, towerOk)) { place(c, x, z, 1, 1, false); break; }
  // pylons along the north edge of the power cut, every 6 tiles
  { const L = cutPts.length, dx = cutB.x - cutA.x, dz = cutB.z - cutA.z, len = Math.hypot(dx, dz) || 1, nx = dz / len, nz = -dx / len;
    for (let k = 0; k * 6 * 4 < L; k++) {
      const p = cutPts[Math.min(L - 1, 8 + k * 24)], x = Math.floor(p.x + nx * 1.6), z = Math.floor(p.z + nz * 1.6);
      if (free(x, z, 1, 1, (o, i) => (o === 0 || o === 3) && !lane[i])) { gnd[I(x, z)] = GC.cut; place(B.pylon, x, z, 1, 1, false); }
    } }
  // boulders round the edges of the clearings (cover, low enough to jump onto)
  for (const c of clearings) for (let k = 0, n = R.int(1, 3); k < n; k++) {
    const a = R.range(0, Math.PI * 2), x = Math.floor(c.x + Math.cos(a) * (c.r - 0.9)), z = Math.floor(c.z + Math.sin(a) * (c.r - 0.9));
    if (free(x, z, 1, 1, (o, i) => o === 3 && !lane[i]) && gnd[I(x, z)] === GC.grass) place(ROCK, x, z, 1, 1, false, { woods: true });
  }

  // ---- open ground the drop point can't walk to (camp ground walled in behind the sawmill, a clearing edge cut off by
  // boulders) goes back to woods now, so the deer trails below measure depth from ground that is really open
  {
    const seen = new Uint8Array(N), q = [I(Math.floor(start.x), Math.floor(start.z))]; seen[q[0]] = 1;
    while (q.length) { const c = q.pop(), x = c % w, z = (c / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, n = I(nx, nz); if (inMap(nx, nz) && OPEN.has(occ[n]) && !seen[n]) { seen[n] = 1; q.push(n); } } }
    for (let i = 0; i < N; i++) if (OPEN.has(occ[i]) && !seen[i] && occ[i] !== 4) { occ[i] = 0; gnd[i] = GC.woods; }
  }
  // ---- deer trails: no woods deeper than DEPTH tiles from open ground
  for (let pass = 0; pass < 60; pass++) {
    const dist = new Int16Array(N).fill(-1), src = new Int32Array(N).fill(-1), q = [];
    for (let i = 0; i < N; i++) if (OPEN.has(occ[i])) { dist[i] = 0; src[i] = i; q.push(i); }
    let deep = -1;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], x = c % w, z = (c / w) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; if (!inMap(nx, nz)) continue; const n = I(nx, nz);
        if (dist[n] >= 0 || occ[n] !== 0) continue;
        dist[n] = dist[c] + 1; src[n] = src[c]; q.push(n); if (deep < 0 || dist[n] > dist[deep]) deep = n;
      }
    }
    if (deep < 0 || dist[deep] <= DEPTH) break;
    const s = src[deep], a = { x: (deep % w) + 0.5, z: ((deep / w) | 0) + 0.5 }, b = { x: (s % w) + 0.5, z: ((s / w) | 0) + 0.5 };
    // cut from the open ground in, a little past the deepest point, ending in a small glade
    const L = Math.hypot(a.x - b.x, a.z - b.z) || 1, end = { x: a.x + (a.x - b.x) / L * 1.5, z: a.z + (a.z - b.z) / L * 1.5 };
    trail([b, end], 1, false);
    disc(end.x, end.z, 1.6, (_, __, i) => { if (occ[i] === 0) { occ[i] = 3; gnd[i] = GC.grass; } });
  }

  // ---- left-over camp ground is yard
  for (let i = 0; i < N; i++) if (occ[i] === 5) occ[i] = 3;

  // ---- the woods: every remaining tile planted
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (occ[I(x, z)] !== 0) continue;
    let pick = null;
    for (let tries = 0; tries < 6 && !pick; tries++) {
      const c = pickW(R, WOODS), turn = c.size[0] !== c.size[1] && R.chance(0.5);
      const sw = turn ? c.size[1] : c.size[0], sd = turn ? c.size[0] : c.size[1];
      if (free(x, z, sw, sd, o => o === 0)) pick = { c, sw, sd, turn };
    }
    if (!pick) pick = { c: PINE, sw: 1, sd: 1, turn: false };
    place(pick.c, x, z, pick.sw, pick.sd, pick.turn, { woods: true });
  }

  // ---- nothing sealed in: open ground the drop point can't walk to gets a pine; a building with no reachable ground
  // beside it becomes pines (never happens to the dam or the camp — their lanes are cut first — but stay safe)
  const reach = () => {
    const solid = new Uint8Array(N); for (const l of lots) for (let j = l.z; j < l.z + l.d; j++) for (let i = l.x; i < l.x + l.w; i++) solid[I(i, j)] = 1;
    const seen = new Uint8Array(N), q = [I(Math.floor(start.x), Math.floor(start.z))]; seen[q[0]] = 1;
    while (q.length) { const c = q.pop(), x = c % w, z = (c / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, n = I(nx, nz); if (inMap(nx, nz) && !solid[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
    return { solid, seen };
  };
  let { solid, seen } = reach();
  const touches = l => { for (let j = l.z - 1; j <= l.z + l.d; j++) for (let i = l.x - 1; i <= l.x + l.w; i++) if (inMap(i, j) && seen[I(i, j)]) return true; return false; };
  for (let k = lots.length - 1; k >= 0; k--) {
    const l = lots[k]; if (WOODS_RECIPES.includes(l.recipe) || touches(l)) continue;
    lots.splice(k, 1); for (let j = l.z; j < l.z + l.d; j++) for (let i = l.x; i < l.x + l.w; i++) occ[I(i, j)] = 0;
  }
  ({ solid, seen } = reach());
  for (let i = 0; i < N; i++) if (!solid[i] && !seen[i]) { gnd[i] = GC.woods; place(PINE, i % w, (i / w) | 0, 1, 1, false, { woods: true }); }
  lots.forEach((l, i) => { l.id = 'L' + i; });

  // ---- roads (for the briefing map): the road's tiles as row runs
  const roads = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (gnd[I(x, z)] !== GC.road && gnd[I(x, z)] !== GC.bridge) continue;
    let e = x; while (e + 1 < w && (gnd[I(e + 1, z)] === GC.road || gnd[I(e + 1, z)] === GC.bridge)) e++;
    roads.push([x, z, e - x + 1, 1]); x = e;
  }

  // ---- spawn edges: the middle of every run of open border tiles the drop point reaches on the road, a named
  // trail or the river (never a deer trail), none close to the camp
  ({ solid, seen } = reach());
  const edges = [];
  const border = [];
  for (let x = 0; x < w; x++) border.push([x, 0, x + 0.5, 0.5]);
  for (let z = 1; z < h; z++) border.push([w - 1, z, w - 0.5, z + 0.5]);
  for (let x = w - 2; x >= 0; x--) border.push([x, h - 1, x + 0.5, h - 0.5]);
  for (let z = h - 2; z >= 1; z--) border.push([0, z, 0.5, z + 0.5]);
  const runs = []; let cur = null;
  const on = b => seen[I(b[0], b[1])] && main[I(b[0], b[1])];
  for (const b of border) { if (on(b)) { if (!cur) { cur = []; runs.push(cur); } cur.push(b); } else cur = null; }
  if (runs.length > 1 && on(border[0]) && on(border[border.length - 1])) runs[0].unshift(...runs.pop());
  for (const run of runs) {
    if (run.length < 2) continue;
    const m = run[Math.floor(run.length / 2)];
    if (Math.hypot(m[2] - start.x, m[3] - start.z) < 9) continue;
    edges.push({ x: m[2], z: m[3] });
  }

  const forest = {
    ground: gnd.join(''), river, road: keep(roadPts), trails, cut: keep(cutPts), dam,
    camp: { x: camp.x, z: camp.z, r: camp.r }, lookout: { x: T.x, z: T.z, r: tower.r }, clearings,
  };
  return { w, h, lots, roads, plazas, start, extract, edges, district: 'forest', seed, forest };
}
