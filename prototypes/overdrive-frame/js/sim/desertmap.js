// The desert badlands ("Red Mesa"): out past the city, under a bright sun. Not a street grid — open sand and red rock,
// with Halden-Voss's kit dropped on it. Same output as makeCityMap (lots, roads, plazas, start, extract, edges) so the
// missions, contracts, flow field, co-op mirror and briefing map need nothing new — plus `desert: {...}` for the ground
// drawing (render/desert-ground.js).
//
//   highway   one straight, 3-wide road across the map from the west edge to the east edge (so a convoy's shortest
//             way between its two ends IS the highway — sim/ops.js convoyRoute drives the flow field's path)
//   tracks    2-wide dirt tracks: from the north edge down to the highway, from the highway into the base, and from
//             the east edge to the base's side gate (enemies come in along every road end, like streets in the city)
//   base      the Halden-Voss forward base: a fenced, levelled basin south-east of the highway — hangars, container
//             barracks, radar masts, the fuel depot (bladders, they blow up), a water tower
//   ridge     the wind farm: a line of turbines along a low ridge north of the highway
//   pipeline  pipe runs and pump stations parallel to the highway, south of it, into the base's west fence
//   solar     rows of panels in the open, south-west of the base
//   washes    dry riverbeds winding north to south across the map: open sand nothing is built in, lined by canyon walls
//   rock      mesas, buttes, canyon walls and boulders in what is left: very tough cover that breaks sight lines
//
// Lanes: every two lots are at least 2 tiles apart (a frame is ~0.4 tiles wide, so there is always room to walk round),
// nothing sits within 2 tiles of the map edge, and anything the drop pad cannot walk up to is left out.
// Seeded and pure like the city: the co-op server and every player build the identical badlands from the same seed.
import { makeRng } from './rng.js';

const STYLES = ['chrome', 'pearl', 'copper', 'concrete'];
const GAP = 2;

/** The desert's entry in citymap.js DISTRICTS (lots = what the generator places; h in tiles — a frame is 0.75 tall). */
export const DESERT_DISTRICT = {
  label: 'Badlands', desert: true, street: 2, block: [8, 12], plaza: 0, lots: [
    { recipe: 'desert-mesa', size: [3, 3], floors: [1, 3], hp: 60000 },
    { recipe: 'desert-butte', size: [2, 2], floors: [1, 3], hp: 42000 },
    { recipe: 'desert-canyon', size: [4, 1], floors: [1, 3], hp: 45000 },
    { recipe: 'desert-rocks', size: [1, 1], floors: [1, 1], h: 0.45, hp: 6000 },
    { recipe: 'desert-turbine', size: [1, 1], floors: [1, 1], h: 2.6, hp: 1600 },
    { recipe: 'desert-solar', size: [2, 1], floors: [1, 1], h: 0.24, hp: 700 },
    { recipe: 'desert-pipe', size: [2, 1], floors: [1, 1], h: 0.34, hp: 1500 },
    { recipe: 'desert-pump', size: [2, 2], floors: [1, 1], h: 0.65, hp: 4000 },
    { recipe: 'desert-hangar', size: [3, 2], floors: [1, 1], h: 0.78, hp: 5200 },
    { recipe: 'desert-barracks', size: [2, 1], floors: [1, 2], hp: 2200 },
    { recipe: 'desert-radar', size: [1, 1], floors: [1, 1], h: 1.6, hp: 1500 },
    { recipe: 'desert-bladder', size: [2, 1], floors: [1, 1], h: 0.22, hp: 500, explosive: 1300 },
    { recipe: 'desert-watertower', size: [1, 1], floors: [1, 1], h: 1.25, hp: 1200 },
  ],
};
const KIND = Object.fromEntries(DESERT_DISTRICT.lots.map(l => [l.recipe.slice(7), l]));
/** Rock heights by `floors` (the recipe's Height param). */
const ROCK_H = { mesa: f => 1.3 + f * 0.22 - 0.22, butte: f => 1.85 + f * 0.2 - 0.2, canyon: f => 1.25 + f * 0.08 };
/** Rock, not buildings: lots get `natural: true` (missiondef.js never picks one as a stand-in demolition target). */
const ROCK = new Set(['mesa', 'butte', 'canyon', 'rocks']);
const BARRACKS_H = f => 0.06 + f * 0.26;

/** @returns the same shape as makeCityMap, district 'desert', plus `desert: { highway, tracks, base, ridge, pipeline,
 *  solar, washes, pads }` for the ground drawing. */
export function makeDesertMap({ seed, w = 44, h = 44 }) {
  const R = makeRng(seed * 37 + 11);
  // 0 free, 1 road, 2 building, 3 kept open (pads, lanes), 4 wash, 5 reserved (base yard, solar field, ridge)
  const occ = new Uint8Array(w * h);
  const at = (x, z) => occ[z * w + x];
  const set = (x, z, v) => { if (x >= 0 && z >= 0 && x < w && z < h) occ[z * w + x] = v; };
  const fill = (x, z, sw, sd, v, keep = [1]) => { for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) if (i >= 0 && j >= 0 && i < w && j < h && !keep.includes(at(i, j))) set(i, j, v); };
  const roads = [], plazas = [], lots = [];

  // the highway: straight across, a third of the way down
  const hz = Math.round(h * 0.3) + R.int(-2, 1), highway = [0, hz, w, 3];
  roads.push(highway); fill(0, hz, w, 3, 1, []);

  // the drop pad (south-west) and the extraction pad (north-east) stay open
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  const openArea = (cx, cz, r) => { plazas.push([cx - r, cz - r, r * 2, r * 2]); fill(cx - r, cz - r, r * 2, r * 2, 3); };
  openArea(4, h - 5, 3); openArea(w - 5, 4, 3);
  const pads = [{ x: start.x, z: start.z, r: 2.4 }, { x: extract.x, z: extract.z, r: 2.2 }];

  // the forward base: a basin south-east of the highway, reached by a track from it and one from the east edge
  const bw = Math.round(w * 0.34), bd = Math.round(h * 0.32);
  const base = { x: w - bw - 3, z: hz + 3 + 4 + R.int(0, 1), w: bw, d: 0 };
  base.d = Math.min(bd, h - 3 - base.z);
  const tracks = [];
  const track = (x, z, sw, sd) => { tracks.push([x, z, sw, sd]); roads.push([x, z, sw, sd]); fill(x, z, sw, sd, 1); };
  const gateN = base.x + Math.floor(bw / 2) - 1 + R.int(-2, 2), gateE = base.z + Math.floor(base.d / 2) - 1 + R.int(-1, 1);
  track(gateN, hz + 3, 2, base.z - hz - 3 + 1);                    // highway → north gate
  track(base.x + bw - 1, gateE, w - base.x - bw + 1, 2);            // east edge → east gate
  // the north track: from the top edge down to the highway, west of the wind farm
  const tx = Math.round(w * 0.24) + R.int(-2, 2);
  track(tx, 0, 2, hz);
  // the yard inside the fence is reserved (only the base's own buildings go in it)
  fill(base.x, base.z, bw, base.d, 5);

  // washes: one or two dry riverbeds winding from the north edge to the south edge (they cross the highway in a dip)
  const washes = [];
  const nW = 1 + (R.chance(0.5) ? 1 : 0);
  for (let k = 0; k < nW; k++) {
    let x = k === 0 ? w * R.range(0.4, 0.5) : w * R.range(0.08, 0.16), r = R.range(1.1, 1.5);
    const pts = [];
    for (let z = -1; z <= h + 1; z += 3) { pts.push([+x.toFixed(2), z]); x += R.range(-1.6, 1.6); x = Math.max(4, Math.min(w - 4, x)); }
    // don't run through the base: bend round its west side
    for (const p of pts) if (p[1] > base.z - 2 && p[1] < base.z + base.d + 2 && p[0] > base.x - 3) p[0] = base.x - 3.5;
    const wash = { pts, r: +r.toFixed(2) }; washes.push(wash);
    for (let z = 0; z < h; z++) for (let x0 = 0; x0 < w; x0++) {
      if (at(x0, z) === 1 || at(x0, z) === 3) continue;
      if (washDist(wash, x0 + 0.5, z + 0.5) <= r) set(x0, z, at(x0, z) === 5 ? 5 : 4);
    }
  }

  const place = (kind, x, z, sw, sd, turn) => {
    const c = KIND[kind], floors = R.int(c.floors[0], c.floors[1]);
    const height = c.h ?? (ROCK_H[kind] ? ROCK_H[kind](floors) : kind === 'barracks' ? BARRACKS_H(floors) : 0.5);
    lots.push({ id: 'L' + lots.length, x, z, w: sw, d: sd, h: +height.toFixed(3), hp: c.hp, recipe: c.recipe, params: { floors, seed: R.int(1, 9999), rot: turn ? 1 : 0, style: STYLES[R.int(0, STYLES.length - 1)] }, explosive: c.explosive || 0, ...(ROCK.has(kind) ? { natural: true } : {}) });
    for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) set(i, j, 2);
  };
  /** Room for a sw×sd lot at x,z: every tile one of `on`, inside the edge margin, and GAP tiles clear of every lot. */
  const room = (x, z, sw, sd, on = [0]) => {
    if (x < GAP || z < GAP || x + sw > w - GAP || z + sd > h - GAP) return false;
    for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) if (!on.includes(at(i, j))) return false;
    for (let j = z - GAP; j < z + sd + GAP; j++) for (let i = x - GAP; i < x + sw + GAP; i++) if (i >= 0 && j >= 0 && i < w && j < h && at(i, j) === 2) return false;
    return true;
  };
  /** Try to put `kind` (turned or not) somewhere in the box [x0, x1) × [z0, z1); returns true if placed. */
  const scatter = (kind, x0, z0, x1, z1, { on = [0], tries = 60, turnable = true } = {}) => {
    const [a, b] = KIND[kind].size;
    for (let t = 0; t < tries; t++) {
      const turn = turnable && a !== b && R.chance(0.5), sw = turn ? b : a, sd = turn ? a : b;
      const x = R.int(Math.floor(x0), Math.max(Math.floor(x0), Math.floor(x1) - sw)), z = R.int(Math.floor(z0), Math.max(Math.floor(z0), Math.floor(z1) - sd));
      if (room(x, z, sw, sd, on)) { place(kind, x, z, sw, sd, turn); return true; }
    }
    return false;
  };

  // the base: hangars along the north fence, the fuel depot in the south-west corner, radar masts, barracks, the tower
  const inB = { on: [5], tries: 120 };
  const B = { x0: base.x + 1, z0: base.z + 1, x1: base.x + bw - 1, z1: base.z + base.d - 1 };
  for (let i = 0; i < 2; i++) scatter('hangar', B.x0, B.z0, B.x1, B.z0 + 5, { ...inB, turnable: false });
  let fuel = 0; for (let i = 0; i < 4 && fuel < 3; i++) if (scatter('bladder', B.x0, (B.z0 + B.z1) / 2, (B.x0 + B.x1) / 2 + 1, B.z1, inB)) fuel++;
  for (let i = 0; i < 6 && fuel < 3; i++) if (scatter('bladder', B.x0, B.z0, B.x1, B.z1, inB)) fuel++;
  let radars = 0; for (let i = 0; i < 4 && radars < 2; i++) if (scatter('radar', (B.x0 + B.x1) / 2, B.z0, B.x1, B.z1, inB)) radars++;
  for (let i = 0; i < 4 && radars < 1; i++) if (scatter('radar', B.x0, B.z0, B.x1, B.z1, inB)) radars++;
  scatter('watertower', B.x0, B.z0, B.x1, B.z1, inB);
  for (let i = 0; i < 5; i++) scatter('barracks', B.x0, B.z0, B.x1, B.z1, inB);
  for (let i = 0; i < 2; i++) scatter('rocks', B.x0, B.z0, B.x1, B.z1, inB);   // a few boulders left where they fell
  // the base yard's leftover ground stays open
  for (let j = base.z; j < base.z + base.d; j++) for (let i = base.x; i < base.x + bw; i++) if (at(i, j) === 5) set(i, j, 3);

  // the wind farm: turbines along a ridge between the north track and the extraction pad
  const rz = Math.max(GAP + 1, Math.round(hz / 2) + R.int(-1, 0)), ridge = { x0: tx + 4, x1: w - 10, z: rz };
  for (let x = ridge.x0, k = 0; x <= ridge.x1; x += 4, k++) {
    const z = rz + (k % 2 ? 1 : -1) * R.int(0, 1);
    if (room(x, z, 1, 1, [0])) place('turbine', x, z, 1, 1, false);
  }

  // the pipeline: pipe runs and pump stations south of the highway, from the west edge into the base's west fence
  const pz = hz + 3 + GAP, pipeline = { z: pz + 0.5, x0: GAP, x1: base.x };
  for (let x = GAP, k = 0; x + 2 <= base.x - GAP; k++) {
    const pump = k % 4 === 3;
    if (pump ? room(x, pz, 2, 2, [0]) : room(x, pz, 2, 1, [0])) { place(pump ? 'pump' : 'pipe', x, pz, 2, pump ? 2 : 1, false); x += 2 + GAP; }
    else x += 1;
  }

  // the solar field: rows of panels in the open between the drop pad and the base
  const solar = [Math.round(w * 0.3), pz + 4, 0, 0];
  solar[2] = Math.max(0, base.x - GAP - 1 - solar[0]); solar[3] = Math.max(0, h - GAP - 1 - solar[1]);
  for (let z = solar[1]; z + 1 <= solar[1] + solar[3]; z += 1 + GAP) for (let x = solar[0]; x + 2 <= solar[0] + solar[2]; x += 2 + GAP) if (R.chance(0.82) && room(x, z, 2, 1, [0])) place('solar', x, z, 2, 1, false);

  // canyon walls along the washes' banks
  for (const wash of washes) for (let i = 1; i < wash.pts.length - 1; i += 2) {
    const [cx, cz] = wash.pts[i], side = R.chance(0.5) ? 1 : -1, x = Math.round(cx + side * (wash.r + 1.2) - (side < 0 ? 1 : 0)), z = Math.round(cz - 2);
    if (room(x, z, 1, 4, [0])) place('canyon', x, z, 1, 4, true);
  }
  // rock: massifs first (a mesa with buttes, walls and boulders round it — the canyons between them are the lanes),
  // then single rocks in what is left
  const massifs = 3 + Math.round(w * h / 900) + R.int(0, 1);
  for (let k = 0, made = 0; k < 90 && made < massifs; k++) {
    const cx = R.range(GAP + 3, w - GAP - 3), cz = R.range(GAP + 3, h - GAP - 3);
    if (!scatter('mesa', cx - 3, cz - 3, cx + 3, cz + 3, { tries: 6 })) continue;
    made++;
    for (const kind of ['butte', 'canyon', 'butte', 'rocks', 'rocks']) scatter(kind, cx - 7, cz - 7, cx + 7, cz + 7, { tries: 8 });
  }
  const quota = Math.round(w * h / 160);
  for (let i = 0, n = 0; i < 300 && n < quota; i++) {
    const roll = R.next(), kind = roll < 0.2 ? 'mesa' : roll < 0.45 ? 'butte' : roll < 0.6 ? 'canyon' : 'rocks';
    if (scatter(kind, GAP, GAP, w - GAP, h - GAP, { tries: 3 })) n++;
  }

  // nothing sealed in: anything the drop pad cannot walk up to is left out (sand instead)
  const solid = new Uint8Array(w * h); for (const l of lots) for (let j = l.z; j < l.z + l.d; j++) for (let i = l.x; i < l.x + l.w; i++) solid[j * w + i] = 1;
  const seen = new Uint8Array(w * h), q = [Math.floor(start.z) * w + Math.floor(start.x)]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), x = c % w, z = (c / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, n = nz * w + nx; if (nx >= 0 && nz >= 0 && nx < w && nz < h && !solid[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
  const reachable = l => { for (let j = l.z - 1; j <= l.z + l.d; j++) for (let i = l.x - 1; i <= l.x + l.w; i++) if (i >= 0 && j >= 0 && i < w && j < h && seen[j * w + i]) return true; return false; };
  for (let i = lots.length - 1; i >= 0; i--) if (!reachable(lots[i])) lots.splice(i, 1);
  lots.forEach((l, i) => { l.id = 'L' + i; });

  // spawn edges: the road ends on the map border (west and east highway ends, the north track, the east base track)
  const edges = [
    { x: 0.5, z: hz + 1.5 }, { x: w - 0.5, z: hz + 1.5 },
    { x: tx + 1, z: 0.5 }, { x: w - 0.5, z: gateE + 1 },
  ];
  const r2 = n => +n.toFixed(2);
  return {
    w, h, lots, roads, plazas, start, extract, edges, district: 'desert', seed,
    desert: {
      highway, tracks, washes, pads, ridge, pipeline, solar,
      base: { x: base.x, z: base.z, w: bw, d: base.d, gates: [{ x: gateN + 1, z: base.z, side: 'n' }, { x: base.x + bw, z: gateE + 1, side: 'e' }] },
      hz: r2(hz),
    },
  };
}

/** Distance from (x, z) to a wash's centre line (a polyline of [x, z] points). */
export function washDist(wash, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < wash.pts.length; i++) {
    const [ax, az] = wash.pts[i], [bx, bz] = wash.pts[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), px = ax + dx * t, pz = az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}
