// The toolkit every round-7 city layout is built with (owner 2026-11-18: "the simple grid city … is used over and over
// again for missions. Add a variety of map layouts"). A layout lays out its streets, water, rails, parks and set
// pieces on a tile grid, then hands the leftover ground to `fill` (the district's buildings, like the grid city) and
// `finish` (nothing sealed in, spawn edges, the briefing map's roads). Pure and seeded: the co-op server and every
// player build the same map from the same inputs.
//
// Ground codes — ONE character per tile in map.city.ground. The ground drawing (render/city-ground.js), the minimap,
// the briefing map AND the rules (world.js: 'w' is deep water) all read this one string.
import { makeRng } from '../rng.js';

export const GC = {
  walk: '.',      // pavement under the blocks (the default)
  road: 'r',      // a straight street (lane marks come from map.city.streets)
  band: 'R',      // under a smooth road band (ring roads, diagonals): drawn by the band, pavement underneath
  plaza: 'a',     // paved open square
  round: 'A',     // under a round plaza drawn as a circle (the ring layout)
  water: 'w',     // DEEP water: blocks walking (world.js DEEP_CODE)
  bridge: 'b',    // a bridge deck over water: open
  quay: 'q',      // stone quay / promenade along water
  lawn: 'g',      // park grass
  path: 'p',      // park path (gravel, drawn as a band)
  pond: 'o',      // shallow ornamental pond: you wade it
  track: 't',     // a rail track (rails + sleepers)
  ballast: 'T',   // rail yard gravel between tracks
  platform: 'P',  // a station platform
  crossing: 'x',  // a level crossing (street over a track)
  dock: 'd',      // harbour apron: concrete with painted bays
  pier: 'e',      // a pier deck over water: open
  cobble: 'c',    // old-town lane
  square: 's',    // old-town square
  deck: 'm',      // megablock plaza paving
};
/** Tiles a street runs on: the briefing map's roads, and where enemies may walk in from the map edge. */
export const ROADISH = new Set(['r', 'R', 'b', 'x', 'c']);
// occupancy while building
export const O = { FREE: 0, ROAD: 1, LOT: 2, OPEN: 3, WATER: 4 };

/**
 * The set pieces the layouts place besides the district's own buildings (City Kit recipes, citykit/js/kit/quarters.js
 * and parks.js). h = height in tiles (a frame is 0.75 tall); natural / prop = never a stand-in demolition target.
 */
export const PIECES = {
  tree: { recipe: 'qt-tree', size: [1, 1], h: 0.82, hp: 520, natural: true, seeds: 8 },
  grove: { recipe: 'qt-grove', size: [2, 2], h: 0.92, hp: 1200, natural: true, seeds: 8 },
  planter: { recipe: 'qt-planter', size: [1, 1], h: 0.16, hp: 600, natural: true, seeds: 8 },
  boxcar: { recipe: 'qt-boxcar', size: [2, 1], h: 0.3, hp: 1500, prop: true },
  tanker: { recipe: 'qt-boxcar', size: [2, 1], h: 0.3, hp: 1100, prop: true, explosive: 1000 },
  signal: { recipe: 'qt-signal', size: [1, 1], h: 0.95, hp: 900, prop: true },
  station: { recipe: 'qt-station', size: [3, 2], h: 1.0, hp: 4200 },
  crane: { recipe: 'qt-crane', size: [2, 2], h: 2.3, hp: 3400, prop: true },
  containers: { recipe: 'qt-containers', size: [2, 1], floors: [1, 4], prop: true },   // h from the stack: see containerH
  megatower: { recipe: 'qt-megatower', size: [4, 4], floors: [14, 24], extraFloors: 3 },   // + the 3-storey podium
  memorial: { recipe: 'pk-memorial', size: [2, 2], h: 1.0, hp: 2600 },
  fountain: { recipe: 'pk-fountain', size: [1, 1], h: 0.35, hp: 700 },
  playground: { recipe: 'pk-playground', size: [1, 1], h: 0.35, hp: 700 },
  court: { recipe: 'pk-court', size: [2, 1], h: 0.3, hp: 900 },
  amphi: { recipe: 'pk-amphi', size: [3, 3], h: 0.75, hp: 3600 },
  garden: { recipe: 'pk-garden', size: [2, 2], h: 0.5, hp: 1600 },
};
/** A container stack's height: 2.6 m boxes (0.16 tiles) on a thin pad. */
export const containerH = n => +(0.03 + n * 0.16).toFixed(3);

export const r2 = n => Math.round(n * 100) / 100;
export const pickW = (R, list) => { const tot = list.reduce((s, x) => s + (x.w || 1), 0); let v = R.next() * tot; for (const x of list) { v -= x.w || 1; if (v <= 0) return x; } return list[0]; };

/** Catmull-Rom through the points, sampled every `step` tiles. */
export function spline(pts, step = 0.25) {
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
export function wander(R, pts, amount) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, j = R.range(-amount, amount) * Math.min(1, L / 10);
    out.push({ x: (a.x + b.x) / 2 - dz / L * j, z: (a.z + b.z) / 2 + dx / L * j }, b);
  }
  return out;
}
/** Points along a straight line every `step` tiles. */
export function straight(a, b, step = 0.25) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step)), out = [];
  for (let k = 0; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  return out;
}
/** Grid street lines along one axis: the first a little in from the edge, then street + block, block, … */
export function streetLines(R, len, street, block, { from = 1 } = {}) {
  const out = []; let p = from + R.int(0, 2);
  while (p < len - 3) { out.push(p); p += street + R.int(block[0], block[1]); }
  return out;
}

/**
 * @param {{ seed, w, h, district, D, FLOOR, STYLES, layout, salt }} o  D = the district's entry in citymap.js DISTRICTS
 */
export function makeKit({ seed, w, h, district, D, FLOOR, STYLES, layout, salt }) {
  const R = makeRng(seed * salt + 101), N = w * h;
  const occ = new Uint8Array(N), gnd = new Array(N).fill(GC.walk);
  const keep = new Uint8Array(N);          // lanes and set-piece ground: never built on, never filled
  const lots = [], plazas = [], streets = [], bands = [];
  const I = (x, z) => z * w + x, inMap = (x, z) => x >= 0 && z >= 0 && x < w && z < h;
  const K = {
    R, w, h, N, occ, gnd, keep, lots, plazas, streets, bands, I, inMap, D, district, layout, FLOOR,
    street: Math.max(2, D.street),          // every lane a frame (≈0.4 tiles) and a swarm can use is 2+ tiles wide
    set(x, z, o, code) { if (!inMap(x, z)) return; const i = I(x, z); occ[i] = o; if (code) gnd[i] = code; },
    /** Fill a rectangle; `when(occ, ground, i)` limits which tiles change. */
    rect(x, z, rw, rd, o, code, when = null) { for (let j = z; j < z + rd; j++) for (let i = x; i < x + rw; i++) if (inMap(i, j) && (!when || when(occ[I(i, j)], gnd[I(i, j)], I(i, j)))) K.set(i, j, o, code); },
    /** A straight street (x, z, w, d): over water it is a bridge, over a track a level crossing, otherwise road. */
    road(x, z, rw, rd, code = GC.road) {
      for (let j = z; j < z + rd; j++) for (let i = x; i < x + rw; i++) {
        if (!inMap(i, j)) continue; const k = I(i, j);
        if (occ[k] === O.LOT) continue;
        if (occ[k] === O.WATER || gnd[k] === GC.bridge) { occ[k] = O.ROAD; gnd[k] = GC.bridge; continue; }
        if (gnd[k] === GC.track || gnd[k] === GC.crossing) { occ[k] = O.ROAD; gnd[k] = GC.crossing; continue; }
        occ[k] = O.ROAD; gnd[k] = code;
      }
      streets.push([x, z, rw, rd]);
    },
    /** Every tile whose centre is within r of (px, pz). */
    disc(px, pz, r, fn) { for (let z = Math.floor(pz - r - 1); z <= pz + r + 1; z++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) if (inMap(x, z) && Math.hypot(x + 0.5 - px, z + 0.5 - pz) <= r) fn(x, z, I(x, z)); },
    /**
     * A smooth band along a path (a ring road, a diagonal avenue, a park path), drawn by the ground renderer at
     * half-width hw. Every tile the drawn band touches (centre within hw + 0.71) is reserved, so the band is never
     * painted under a building. kind: 'road' | 'path'. Returns the kept path.
     */
    band(path, hw, kind, { o = O.ROAD, code = kind === 'path' ? GC.path : GC.band } = {}) {
      const pts = path.map(p => [r2(p.x), r2(p.z)]);
      for (const p of path) K.disc(p.x, p.z, hw + 0.71, (x, z, i) => {
        if (occ[i] === O.LOT || occ[i] === O.WATER) return;
        keep[i] = 1;
        if (kind === 'road') { occ[i] = O.ROAD; if (gnd[i] === GC.walk || gnd[i] === GC.lawn || gnd[i] === GC.round) gnd[i] = code; return; }
        if (occ[i] === O.FREE) occ[i] = o;
        if (gnd[i] === GC.walk || gnd[i] === GC.lawn) gnd[i] = code;
      });
      bands.push({ kind, hw, pts });
      return pts;
    },
    /** Open paved ground round (cx, cz) (the drop point, the extraction): kept free of buildings. */
    openArea(cx, cz, r, code = GC.plaza) {
      plazas.push([Math.floor(cx - r), Math.floor(cz - r), Math.ceil(r * 2), Math.ceil(r * 2)]);
      for (let z = Math.floor(cz - r); z < cz + r; z++) for (let x = Math.floor(cx - r); x < cx + r; x++) if (inMap(x, z)) {
        const i = I(x, z); keep[i] = 1;
        if (occ[i] === O.FREE) { occ[i] = O.OPEN; gnd[i] = code; }
      }
    },
    free(x, z, sw, sd, ok = (o, i) => o === O.FREE && !keep[i]) { for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) if (!inMap(i, j) || !ok(occ[I(i, j)], I(i, j))) return false; return true; },
    /** Put a lot down. c: { recipe, size, floors?, h?, hp?, explosive?, natural?, prop? }. */
    place(c, x, z, sw, sd, turn = false, { floors = null, style = null, params = null } = {}) {
      const fl = floors ?? (c.floors ? R.int(c.floors[0], c.floors[1]) : 1);
      const height = c.h ?? ((fl + (c.extraFloors || 0)) * FLOOR + 0.12);
      const hp = c.hp ?? Math.round(500 * sw * sd * (1 + Math.min(fl, 30) * 0.18));
      const lot = { id: 'L' + lots.length, x, z, w: sw, d: sd, h: +height.toFixed(3), hp, recipe: c.recipe,
        params: { floors: fl, seed: c.seeds ? R.int(1, c.seeds) : R.int(1, 9999), rot: turn ? 1 : 0, style: style || STYLES[R.int(0, STYLES.length - 1)], ...(params || {}) }, explosive: c.explosive || 0 };
      if (c.natural) lot.natural = true;      // trees, planters: never a stand-in demolition target (missiondef.js)
      if (c.prop) lot.prop = true;            // freight cars, containers, cranes: never a stand-in target either
      lots.push(lot);
      for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) occ[I(i, j)] = O.LOT;
      return lot;
    },
    /** Try to place c somewhere with its corner at (x, z), turned or not. */
    tryPlace(c, x, z, { ok, turn = null, ...o } = {}) {
      const t = turn ?? (c.size[0] !== c.size[1] && R.chance(0.5));
      const sw = t ? c.size[1] : c.size[0], sd = t ? c.size[0] : c.size[1];
      return K.free(x, z, sw, sd, ok) ? K.place(c, x, z, sw, sd, t, o) : null;
    },
    /**
     * The district's buildings on every free tile (the grid city's packing): the biggest lot that fits from the list,
     * now and then a small plaza, now and then fuel tanks in a gap; a leftover tile stays open ground.
     */
    fill({ list = D.lots, plaza = D.plaza, fuel = D.fuel ?? 0.05, ok = undefined, floorsMax = 99, leftover = GC.walk, area = null } = {}) {
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
        const i = I(x, z);
        if (occ[i] !== O.FREE || keep[i]) continue;
        if (area && !area(x, z)) continue;
        if (plaza && R.chance(plaza * 0.06) && K.free(x, z, 3, 3, ok)) { plazas.push([x, z, 3, 3]); K.rect(x, z, 3, 3, O.OPEN, GC.plaza); continue; }
        let put = null;
        for (let tries = 0; tries < 6 && !put; tries++) {
          const c = pickW(R, list), fl = c.floors ? Math.min(floorsMax, R.int(c.floors[0], c.floors[1])) : 1;
          put = K.tryPlace(c, x, z, { ok, floors: fl });
        }
        if (!put) {
          if (R.chance(fuel)) K.place({ recipe: 'fuel-tanks', size: [1, 1], floors: [1, 1], h: 0.32, explosive: 1100, hp: 500 }, x, z, 1, 1);
          else { occ[i] = O.OPEN; gnd[i] = leftover; }
        }
      }
    },
    /** Remove a lot (its ground becomes open pavement). */
    unplace(l) { lots.splice(lots.indexOf(l), 1); for (let j = l.z; j < l.z + l.d; j++) for (let i = l.x; i < l.x + l.w; i++) occ[I(i, j)] = O.OPEN; },

    /** Walkable for the rules: not a lot, not deep water. */
    walkable: i => occ[i] !== O.LOT && gnd[i] !== GC.water,
    reach(from) {
      const seen = new Uint8Array(N), s = I(Math.floor(from.x), Math.floor(from.z)); if (!K.walkable(s)) return seen;
      const q = [s]; seen[s] = 1;
      while (q.length) { const c = q.pop(), x = c % w, z = (c / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (!inMap(nx, nz)) continue; const n = I(nx, nz); if (!seen[n] && K.walkable(n)) { seen[n] = 1; q.push(n); } } }
      return seen;
    },
    /** The lots on or next to a set of tiles. */
    lotsBeside(tiles) {
      const at = new Map(); for (const l of lots) for (let j = l.z; j < l.z + l.d; j++) for (let i = l.x; i < l.x + l.w; i++) at.set(I(i, j), l);
      const out = new Set();
      for (const t of tiles) { const x = t % w, z = (t / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = I(x + dx, z + dz); if (inMap(x + dx, z + dz) && at.has(n)) out.add(at.get(n)); } }
      return [...out];
    },

    /**
     * Nothing sealed in, then the map: a pocket of open ground the drop point can't walk to (a gap left inside a block)
     * gets planters (up to 4 tiles) or has the smallest building between it and the streets taken away. Buildings in
     * the middle of a block may have no street beside them (a city block is solid), like the grid city. Spawn edges are the middles of the street ends on the map border.
     */
    finish({ start, extract, edgeCodes = ROADISH, extra = {} }) {
      const PLANTER = { recipe: 'qt-planter', size: [1, 1], h: 0.16, hp: 600, natural: true, seeds: 8 };
      for (let pass = 0; pass < 400; pass++) {
        const seen = K.reach(start);
        const touches = l => { for (let j = l.z - 1; j <= l.z + l.d; j++) for (let i = l.x - 1; i <= l.x + l.w; i++) { if ((j === l.z - 1 || j === l.z + l.d) && (i === l.x - 1 || i === l.x + l.w)) continue; if (inMap(i, j) && seen[I(i, j)]) return true; } return false; };
        let pocket = null;
        for (let i = 0; i < N && !pocket; i++) if (!seen[i] && K.walkable(i)) {
          pocket = [i]; const ps = new Uint8Array(N); ps[i] = 1;
          for (let k = 0; k < pocket.length; k++) { const c = pocket[k], x = c % w, z = (c / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = I(x + dx, z + dz); if (inMap(x + dx, z + dz) && !ps[n] && K.walkable(n)) { ps[n] = 1; pocket.push(n); } } }
        }
        if (!pocket) break;
        if (pocket.length <= 4 && pocket.every(i => !keep[i] && gnd[i] !== GC.bridge && gnd[i] !== GC.pier)) { for (const i of pocket) K.place(PLANTER, i % w, (i / w) | 0, 1, 1); continue; }
        const near = K.lotsBeside(pocket);
        if (!near.length) { for (const i of pocket) if (!keep[i] && gnd[i] !== GC.bridge) K.place(PLANTER, i % w, (i / w) | 0, 1, 1); break; }
        const open = near.filter(touches);
        const pick = (open.length ? open : near).sort((a, b) => a.w * a.d - b.w * b.d || a.h - b.h)[0];
        K.unplace(pick);
      }
      lots.forEach((l, i) => { l.id = 'L' + i; });

      // the briefing map's roads: street tiles as row runs
      const roads = [];
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
        if (!ROADISH.has(gnd[I(x, z)])) continue;
        let e = x; while (e + 1 < w && ROADISH.has(gnd[I(e + 1, z)])) e++;
        roads.push([x, z, e - x + 1, 1]); x = e;
      }
      // spawn edges: the middle of every run of reachable street tiles on the border, none close to the drop point
      const seen = K.reach(start), border = [];
      for (let x = 0; x < w; x++) border.push([x, 0, x + 0.5, 0.5]);
      for (let z = 1; z < h; z++) border.push([w - 1, z, w - 0.5, z + 0.5]);
      for (let x = w - 2; x >= 0; x--) border.push([x, h - 1, x + 0.5, h - 0.5]);
      for (let z = h - 2; z >= 1; z--) border.push([0, z, 0.5, z + 0.5]);
      const runsOf = codes => {
        const runs = []; let cur = null;
        const on = b => seen[I(b[0], b[1])] && codes.has(gnd[I(b[0], b[1])]);
        for (const b of border) { if (on(b)) { if (!cur) { cur = []; runs.push(cur); } cur.push(b); } else cur = null; }
        if (runs.length > 1 && on(border[0]) && on(border[border.length - 1])) runs[0].unshift(...runs.pop());
        return runs;
      };
      const edges = [];
      const addRuns = (runs, minLen) => { for (const run of runs) { if (run.length < minLen) continue; const m = run[Math.floor(run.length / 2)]; if (Math.hypot(m[2] - start.x, m[3] - start.z) < 9) continue; if (!edges.some(e => Math.hypot(e.x - m[2], e.z - m[3]) < 2)) edges.push({ x: m[2], z: m[3] }); } };
      addRuns(runsOf(edgeCodes), 2);
      if (edges.length < 4) addRuns(runsOf(new Set(Object.values(GC).filter(c => c !== GC.water))), 2);
      const city = { layout, ground: gnd.join(''), streets, bands, ...extra };
      return { w, h, lots, roads, plazas, start, extract, edges, district, seed, layout, city };
    },
  };
  return K;
}
