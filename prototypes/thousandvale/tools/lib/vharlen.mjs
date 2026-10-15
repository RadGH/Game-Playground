// Thousandvale — Vharlen, the Burning Isle: the island's own ground (stream T, docs/EXPANSION-1.md §2–§3).
//
// world-core's `continentProfile` hands every point inside the Vharlen block to `makeVolcanic(...).height`, and the
// zone + horizon bakes take the island's surfaces from `biomeAt`, its standing water from `waterAt` and its settlements
// and roads from `VHARLEN.settlements` / `islandRoads`. Everything here is a PURE function of world metres (and the
// world seed), so two neighbouring zones compute the same number for the same point and their edges agree bit for bit
// (tests/B/zone-bake.test.js, tests/B/vharlen.test.js). No node:fs — the browser may import world-core.
//
// The shape, centred on the block centre (25600, 21504) — +x east, +z south:
//   * a volcano in the middle zone (z12_10): peak ~690 m at the rim, a caldera 360 m across the rim with a flat floor at
//     440 m and a crater lake, three breaches in the rim (east, south-west, north-west) that are the only ways in;
//   * radial ridges running down the cone;
//   * by bearing, eight shores: a flat landing plain east (Blackstrand, Port Vharl's harbour), sulphur flats north-east,
//     jungle hills north (the Steamwood), obsidian dunes north-west (Glasswind Strand), pumice swells west, a stepped
//     basalt plateau with sea cliffs south-west (Kiln Ridge), an ash valley south (Ashfall Hollow) and a low mud fen
//     south-east (Fumarole Fen).
//
// Biomes reuse World Forge's table (worldgen/js/biomes.js) so every zone shares one surface list (and Torbor Downs' road
// id never moves); the zone meta carries `palette: 'vharl'` and VHARL_BIOME_NAMES, and the client draws the same ids
// with Vharlen's own ground (black sand for `beach`, sulphur crust for `desert`, …: js/client/terrain-view.js).

import { makeNoise2D, fbm, ridged, subSeed } from '../../../../worldgen/js/noise.js';

const TAU = Math.PI * 2;
const sm = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const ss = (a, b, v) => sm((v - a) / (b - a));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/** World Forge biome ids (worldgen/js/biomes.js) the island uses. */
export const VB = { lake: 3, beach: 4, shrubland: 7, rainforest: 9, desert: 13, badlands: 14, marsh: 15, mountains: 17, volcanic: 19, blighted: 20, ashPlain: 21, glimmerwaste: 24, savanna: 6 };
/** What those ids ARE on Vharlen (zone meta `biomeNames`; the client's palette draws them). */
export const VHARL_BIOME_NAMES = {
  beach: 'Black Sand', rainforest: 'Steam Jungle', shrubland: 'Fern Scrub', savanna: 'Tussock', desert: 'Sulphur Flats', badlands: 'Basalt Highland',
  marsh: 'Mud Fen', volcanic: 'Scoria Slopes', blighted: 'Charred Wood', ashPlain: 'Pumice Waste', glimmerwaste: 'Obsidian Dunes', mountains: 'Basalt Cliffs',
};

export const VHARLEN = {
  province: 'vharlen',
  centre: [25600, 21504],
  /** caldera: rim crest radius, the wall's foot, the floor, the crater lake */
  rim: 360, wallFoot: 300, floor: 440, peak: 690, coneLen: 1550,
  lake: { dx: -115, dz: -105, r: 128, level: 437.6 },
  /** the breaches in the rim (bearing, radians: 0 east, +π/2 south) */
  gaps: [0.16, 2.42, -2.2],
  /** where the Kiln Ridge steps can be climbed (bearings) */
  ramps: [2.64, 2.06],
  /** region bearings (radians): the eight shores */
  regions: { east: 0, sulphur: -Math.PI / 4, jungle: -Math.PI / 2, dunes: -3 * Math.PI / 4, pumice: Math.PI, kiln: 3 * Math.PI / 4, ash: Math.PI / 2, fen: Math.PI / 4 },
  /** one settlement per zone (world metres); `pad` flattens the ground round it in the profile itself */
  settlements: [],
  /** hot springs and acid pools (world metres): flat pads with a pool dug in them */
  pools: [],
  /** the ring road round the island and the climb to the Rim Shrine (settlement names, in order) */
  roads: [
    { id: 'v_ring', cls: 'road', width: 6, via: ['Port Vharl', 'Yellowpan', 'Mistfall', 'Shardhaven', 'Lastwell', 'Kilnhold', 'Cinderholt', 'Stiltreach', 'Port Vharl'] },
    { id: 'v_rim', cls: 'trail', width: 3.5, via: ['Port Vharl', 'Rim Shrine'] },
  ],
};
// settlements: offsets from the island centre -> world metres. zone = the world zone that holds it (one each, §3)
const C0 = VHARLEN.centre;
const S = (zone, sheet, name, kind, dx, dz, pad, ease = 90) => ({ zone, sheet, name, kind, x: C0[0] + dx, z: C0[1] + dz, pad, ease });
VHARLEN.settlements.push(
  { ...S('z13_10', 'blackstrand', 'Port Vharl', 'town', 2150, -110, 175), harbour: { bearing: 0 } },
  S('z12_09', 'steamwood', 'Mistfall', 'hamlet', 150, -1750, 95),
  S('z13_09', 'sulphur_bight', 'Yellowpan', 'village', 1540, -1490, 120),
  S('z13_11', 'fumarole_fen', 'Stiltreach', 'hamlet', 1560, 1480, 95),
  S('z11_09', 'glasswind_strand', 'Shardhaven', 'hamlet', -1500, -1500, 95),
  S('z11_10', 'pumice_wastes', 'Lastwell', 'town', -1760, 120, 160),
  S('z12_11', 'ashfall_hollow', 'Cinderholt', 'village', 60, 1760, 120),
  S('z11_11', 'kiln_ridge', 'Kilnhold', 'village', -1500, 1500, 120),
  S('z12_10', 'the_caldera', 'Rim Shrine', 'hamlet', 770, 124, 72, 200),
);
// pools: hot springs (Steamwood, the Caldera floor, the Fen) and acid pools (Sulphur Bight)
const PO = (kind, dx, dz, r, deep = 0.9) => ({ kind, x: C0[0] + dx, z: C0[1] + dz, r, deep });
VHARLEN.pools.push(
  PO('hot_spring', -320, -1420, 11), PO('hot_spring', 430, -1960, 9), PO('hot_spring', -560, -1720, 8),
  PO('hot_spring', 150, 170, 10, 1.0),
  PO('hot_spring', 1230, 1250, 10), PO('hot_spring', 1790, 1120, 8),
  PO('acid_pool', 1290, -1290, 12, 0.7), PO('acid_pool', 1800, -1180, 9, 0.7), PO('acid_pool', 1350, -1720, 7, 0.6),
);

/**
 * The island ground. `seaward(wx, wz)` is world-core's distance past the coast (<= 0 on land); `seed` the world seed.
 * Returns { height(wx, wz), raw(wx, wz) (no pads), biomeAt(wx, wz), waterAt(wx, wz, ground) -> null | {top, ground},
 * regionWeights(wx, wz) }.
 */
export function makeVolcanic({ seed, seaward }) {
  const s0 = subSeed(seed, 'vharlen');
  const nWarp = makeNoise2D(subSeed(s0, 'warp')), nT = makeNoise2D(subSeed(s0, 'theta')), nL = makeNoise2D(subSeed(s0, 'low'));
  const nR = makeNoise2D(subSeed(s0, 'ridge')), nH = makeNoise2D(subSeed(s0, 'hills')), nD = makeNoise2D(subSeed(s0, 'dunes'));
  const nF = makeNoise2D(subSeed(s0, 'fen')), nB = makeNoise2D(subSeed(s0, 'biome')), nK = makeNoise2D(subSeed(s0, 'kiln'));
  const [CX, CZ] = VHARLEN.centre;
  const { rim, wallFoot, floor, peak, coneLen } = VHARLEN;
  const R = VHARLEN.regions;
  const regionKeys = Object.keys(R);

  /** normalised bearing weights for the eight shores at a (warped) bearing */
  function weights(theta) {
    const w = {}; let sum = 0;
    for (const k of regionKeys) { const c = Math.max(0, Math.cos(angDiff(theta, R[k]))); const v = c ** 7; w[k] = v; sum += v; }
    for (const k of regionKeys) w[k] /= sum || 1;
    return w;
  }
  function polar(wx, wz) {
    const dx = wx - CX, dz = wz - CZ, r = Math.hypot(dx, dz), theta = Math.atan2(dz, dx);
    const tw = theta + (fbm(nT, wx / 1600, wz / 1600, { octaves: 2 }) - 0.5) * 0.8;
    return { dx, dz, r, theta, tw };
  }
  /** the cone's outer slope at radius r (rim crest = peak) */
  const cone = r => { const u = Math.max(0, 1 - (r - rim) / coneLen); return peak * u * u; };

  /** the island before settlement pads and pools */
  function raw(wx, wz, P = polar(wx, wz), inland = -seaward(wx, wz)) {
    const { r, theta, tw } = P;
    const W = weights(tw);
    // the volcano: a warped radius so the cone is not a lathe
    const rw = r + (fbm(nWarp, wx / 700, wz / 700, { octaves: 3 }) - 0.5) * 240 * ss(rim + 40, rim + 400, r);
    // the cone sinks faster on the flat east and into the fen, so the landing and the fen stay low
    const C = cone(Math.max(rim, rw)) * (1 - 0.75 * (W.east + W.fen + 0.5 * W.sulphur) * ss(700, 1400, r));
    // radial ridges down the cone (fewer on the flat east and the fen)
    let ridge = 0;
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9 + 0.31 + 0.22 * Math.sin(r / 520 + i * 1.7);
      const d = Math.abs(angDiff(theta, a)) * r, w = 60 + r * 0.05;
      ridge += Math.exp(-((d / w) ** 2)) * (70 + 50 * ((i * 37) % 5) / 4);
    }
    ridge *= ss(rim + 80, rim + 380, r) * (1 - ss(1300, 2100, r)) * (1 - 0.8 * (W.east + W.fen));
    ridge *= 0.75 + 0.5 * ridged(nR, wx / 420, wz / 420, { octaves: 3 });
    // the lowland under the shores
    const low = 3 + 30 * ss(0, 900, inland) + (fbm(nL, wx / 620, wz / 620, { octaves: 4 }) - 0.5) * 34 * ss(0, 500, inland);
    // each shore's own ground (heights above the sea), blended by bearing
    const out = ss(rim + 300, rim + 900, r);                      // 0 on the cone, 1 off it
    let shore = 0;
    {
      const coast = (wid) => ss(0, wid, inland);                   // 0 at the waterline
      // east: Blackstrand — a flat landing plain, a low beach shelf at the harbour
      shore += W.east * (2.6 + (low - 3) * 0.35 * coast(260) + 2 * coast(80));
      // north-east: Sulphur Bight — low flats in shallow terraces
      { const f = 3 + 24 * coast(500); const t = Math.floor(f / 6) * 6 + 6 * ss(0.8, 1, (f / 6) % 1); shore += W.sulphur * (t + (fbm(nL, wx / 300, wz / 300, { octaves: 2 }) - 0.5) * 3); }
      // north: the Steamwood — jungle hills
      shore += W.jungle * (low + 70 * ridged(nH, wx / 520, wz / 520, { octaves: 3 }) * coast(320) + 30 * fbm(nH, wx / 260, wz / 260, { octaves: 3 }) * coast(200));
      // north-west: Glasswind Strand — long obsidian dunes
      { const du = ridged(nD, wx / 240 + wz / 900, wz / 120, { octaves: 2, sharpness: 1.5 }); shore += W.dunes * (2.5 + 10 * coast(300) + 14 * du * coast(160)); }
      // west: the Pumice Wastes — broad swells
      shore += W.pumice * (low * 1.1 + 22 * (fbm(nH, wx / 900, wz / 900, { octaves: 2 }) - 0.3) * coast(400));
      // south-west: Kiln Ridge — a basalt plateau in steps, falling to the sea in cliffs
      {
        const pl = 30 + 150 * ss(40, 620, inland) + 50 * (fbm(nK, wx / 500, wz / 500, { octaves: 3 }) - 0.5);
        const q = 34, f = pl / q, step = Math.floor(f) * q + q * ss(0.72, 1, f % 1);
        // two ramps climb the steps (the island's ring road takes them): there the plateau rises smoothly
        let ramp = 0; for (const a of VHARLEN.ramps) ramp = Math.max(ramp, 1 - ss(30, 70, Math.abs(angDiff(theta, a)) * r));
        shore += W.kiln * ((step + (pl - step) * ramp) * ss(0, 30, inland) + 2);
      }
      // south: Ashfall Hollow — a valley between two ash ridges
      {
        const d = Math.abs(angDiff(theta, R.ash)) * r;
        const valley = 6 + 18 * ss(0, 1200, inland) + 85 * ss(220, 520, d) * coast(260) + 40 * Math.exp(-(((d - 460) / 170) ** 2)) * coast(260);
        shore += W.ash * valley;
      }
      // south-east: Fumarole Fen — barely above the sea, pools in it (waterAt)
      shore += W.fen * (2.35 + 1.4 * (fbm(nF, wx / 160, wz / 160, { octaves: 3 }) - 0.5) + 4 * ss(300, 1400, inland));
    }
    let h = low * (1 - out) + shore * out + C + ridge;
    // the fen proper: whatever the neighbours' blend made of it, the heart of the south-east lies just above its pools
    const fenGround = 2.35 + 1.4 * (fbm(nF, wx / 160, wz / 160, { octaves: 3 }) - 0.5) + 2.2 * ss(300, 1500, inland);
    h += (fenGround - h) * ss(0.22, 0.55, W.fen) * out;
    // the caldera: a flat floor inside the wall, the wall a cliff (290 m in 60 m)
    if (r < rim) {
      const fl = floor + (fbm(nL, wx / 90, wz / 90, { octaves: 2 }) - 0.5) * 2.4;
      h = fl + (h - fl) * ss(wallFoot, rim, r) ** 1.5;
    }
    // the breaches: a gorge cut through the rim at the floor's level, then down the flank on the smooth cone (no warp, no
    // ridges: never steeper than the cone itself, ~35°) until it fades back into the slope 1–1.3 km out
    for (const g of VHARLEN.gaps) {
      if (r < wallFoot - 20 || r > 1300) continue;
      const lat = Math.abs(angDiff(theta, g)) * r;
      const w = (1 - ss(22, 56, lat)) * (1 - ss(1000, 1300, r));
      if (w <= 0) continue;
      const target = Math.min(floor + 1.5, cone(Math.max(rim, r)) + 28);
      h += (target - h) * w;
    }
    // out at sea the island hands back to the old ground (world-core blends both to the sea floor at the block edge)
    return h;
  }

  const padCache = new Map();
  const padHeight = p => { const k = p.x + ',' + p.z; if (!padCache.has(k)) padCache.set(k, raw(p.x, p.z)); return padCache.get(k); };

  /** The island ground with every settlement and pool pad flattened in. */
  function height(wx, wz) {
    let h = raw(wx, wz);
    for (const p of PADS()) {
      const d = Math.hypot(wx - p.x, wz - p.z); if (d > p.r + p.ease) continue;
      h += (padHeight(p) - h) * (1 - ss(p.r, p.r + p.ease, d));
    }
    return h;
  }

  /** Standing water the island adds (all lake-kind): the crater lake, fen pools, springs. ground = the dug ground. */
  function waterAt(wx, wz, ground) {
    const [cx, cz] = VHARLEN.centre;
    const L = VHARLEN.lake;
    {
      const dx = wx - (cx + L.dx), dz = wz - (cz + L.dz), d = Math.hypot(dx, dz);
      const edge = L.r * (1 + 0.12 * (fbm(nB, wx / 70, wz / 70, { octaves: 2 }) - 0.5));
      if (d < edge + 30) {
        if (d < edge) return { top: L.level, ground: Math.min(ground, L.level - 0.4 - 14 * ss(0, edge * 0.8, edge - d)) };
        return { top: NaN, ground: Math.min(ground, L.level + 0.3 + (ground - L.level - 0.3) * ss(edge, edge + 30, d)) };
      }
    }
    for (const p of VHARLEN.pools) {
      const d = Math.hypot(wx - p.x, wz - p.z); if (d > p.r + 4) continue;
      const top = padHeight({ x: p.x, z: p.z }) - 0.25;
      if (d < p.r) return { top, ground: Math.min(ground, top - 0.25 - (p.deep || 0.9) * ss(0, p.r, p.r - d)) };
      return null;
    }
    // the fen: shallow pools wherever the fen ground dips under its water line (2.0 m)
    const P = polar(wx, wz), W = weights(P.tw);
    if (W.fen > 0.3 && ground < 2.9) {
      const v = fbm(nF, wx / 95 + 40, wz / 95 - 12, { octaves: 3 });
      const level = 2.0;
      if (v > 0.6) {
        const g = level - 0.1 - 0.75 * ss(0.6, 0.78, v);
        return { top: level, ground: Math.min(ground, g) };
      }
    }
    return null;
  }

  /** Which World Forge biome id the island shows here (before water / road / rock overrides). */
  function biomeAt(wx, wz) {
    const P = polar(wx, wz), inland = -seaward(wx, wz), h = height(wx, wz);
    const W = weights(P.tw), r = P.r;
    const n = fbm(nB, wx / 260, wz / 260, { octaves: 3 });
    const n2 = fbm(nB, wx / 210 + 31, wz / 210 - 7, { octaves: 3 });
    if (r < VHARLEN.rim + 40) return VB.volcanic;
    // shore: black sand (glass on the dunes' coast), never on the kiln cliffs
    if (h < 4.6 && inland < 90 && W.kiln < 0.5 && !(W.fen > 0.6)) return W.dunes > 0.45 ? VB.glimmerwaste : VB.beach;
    // high cone: scoria
    const coneBand = 1 - ss(900, 1350, r + (n - 0.5) * 300);
    if (coneBand > 0.5 && h > 160) return VB.volcanic;
    // by bearing (the strongest shore, with the noise choosing between near-equals)
    let best = 'east', bv = -1;
    for (const k of regionKeys) { const v = W[k] + (k === 'east' ? 0 : 0) + (n - 0.5) * 0.18 * (k.length % 3); if (v > bv) { bv = v; best = k; } }
    switch (best) {
      case 'east': return n2 > 0.55 ? VB.rainforest : n > 0.5 ? VB.shrubland : VB.savanna;
      case 'sulphur': return n2 > 0.62 ? VB.shrubland : VB.desert;
      case 'jungle': return n2 < 0.3 ? VB.shrubland : VB.rainforest;
      case 'dunes': return n2 > 0.7 ? VB.ashPlain : VB.glimmerwaste;
      case 'pumice': return n2 > 0.66 ? VB.blighted : VB.ashPlain;
      case 'kiln': return n2 > 0.72 ? VB.ashPlain : VB.badlands;
      case 'ash': return n2 > 0.5 ? VB.blighted : VB.ashPlain;
      case 'fen': return n2 > 0.75 ? VB.shrubland : VB.marsh;
    }
    return VB.ashPlain;
  }

  function regionAt(wx, wz) { const P = polar(wx, wz), W = weights(P.tw); let best = null, bv = -1; for (const k of regionKeys) if (W[k] > bv) { bv = W[k]; best = k; } return best; }

  const PADS = () => {
    if (!PADS.list) PADS.list = [
      ...VHARLEN.settlements.map(s => ({ x: s.x, z: s.z, r: s.pad ?? 120, ease: s.ease ?? 90 })),
      ...VHARLEN.pools.map(p => ({ x: p.x, z: p.z, r: p.r + 10, ease: 30 })),
    ];
    return PADS.list;
  };
  const api = { raw: (x, z) => raw(x, z), height, waterAt, biomeAt, regionAt, weights: (x, z) => weights(polar(x, z).tw), cone,
    /** the island ground as the bakes see it (the sea blend applied by world-core): set by world-core's profileOf */
    ground: height,
    /** the island's standing water as records: [{ id, kind (crater_lake | hot_spring | acid_pool), name, x, z, r, level }] (world metres) */
    pools() {
      const L = VHARLEN.lake;
      return [{ id: 'crater_lake', kind: 'crater_lake', name: 'Crater Lake', x: C0[0] + L.dx, z: C0[1] + L.dz, r: L.r, level: L.level },
        ...VHARLEN.pools.map((p, i) => ({ id: `${p.kind}_${i + 1}`, kind: p.kind, name: null, x: p.x, z: p.z, r: p.r, level: +(padHeight({ x: p.x, z: p.z }) - 0.25).toFixed(3) }))];
    } };
  return api;
}

/**
 * The island's roads as world polylines [[x, z, gradedHeight]…] (the same shape as world.json `roads`): A* over a 16 m
 * grid of the island ground, cheapest where it is gentle, never over the sea or a pool, never into the caldera; each
 * leg reuses the legs before it where it can (so the ring and the spoke share a stretch out of Port Vharl). Then two
 * Chaikin passes, an 8 m resample and the ground smoothed along it (±24 m) for the graded height, like a world road.
 * Deterministic: the same island always gives the same roads. Cached per island object.
 */
export function islandRoads(isl) {
  if (isl._roads) return isl._roads;
  const STEP = 16, X0 = 11 * 2048, Z0 = 9 * 2048, N = 3 * 2048 / STEP + 1;
  const H = new Float32Array(N * N), bad = new Uint8Array(N * N);
  const [cx, cz] = VHARLEN.centre;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const wx = X0 + i * STEP, wz = Z0 + j * STEP, h = isl.ground(wx, wz), k = j * N + i;
    H[k] = h;
    if (h < 1.2 || Math.hypot(wx - cx, wz - cz) < VHARLEN.rim + 60 || isl.waterAt(wx, wz, h)) bad[k] = 1;
  }
  const used = new Uint8Array(N * N);
  const cell = (x, z) => Math.round((z - Z0) / STEP) * N + Math.round((x - X0) / STEP);
  const byName = Object.fromEntries(VHARLEN.settlements.map(s => [s.name, s]));
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function route(a, b, maxGrade = 0.42) {
    const start = cell(a.x, a.z), goal = cell(b.x, b.z);
    const g = new Float64Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
    // binary heap of [f, k]
    const heap = []; const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1] <= heap[i][1])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; const lt = (x, y) => heap[x][0] < heap[y][0] || (heap[x][0] === heap[y][0] && heap[x][1] < heap[y][1]); if (l < heap.length && lt(l, m)) m = l; if (r < heap.length && lt(r, m)) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const gi = goal % N, gj = (goal / N) | 0;
    const hEst = k => Math.hypot((k % N) - gi, ((k / N) | 0) - gj) * STEP * 0.9;
    g[start] = 0; push(hEst(start), start);
    while (heap.length) {
      const [, k] = pop(); if (done[k]) continue; done[k] = 1;
      if (k === goal) break;
      const i = k % N, j = (k / N) | 0;
      for (const [di, dj] of D8) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const q = jj * N + ii; if (done[q] || (bad[q] && q !== goal)) continue;
        const run = Math.hypot(di, dj) * STEP, grade = Math.abs(H[q] - H[k]) / run;
        if (grade > maxGrade) continue;
        let c = run * (1 + 60 * grade * grade + (grade > 0.22 ? 30 * (grade - 0.22) : 0));
        if (used[q]) c *= 0.55;                                    // join the road already there
        const ng = g[k] + c; if (ng < g[q]) { g[q] = ng; from[q] = k; push(ng + hEst(q), q); }
      }
    }
    if (from[goal] < 0) return null;
    const cells = []; for (let k = goal; k >= 0; k = from[k]) { cells.push(k); if (k === start) break; }
    cells.reverse();
    for (const k of cells) used[k] = 1;
    return cells.map(k => [X0 + (k % N) * STEP, Z0 + ((k / N) | 0) * STEP]);
  }
  const out = [];
  for (const spec of VHARLEN.roads) {
    for (let q = 0; q < spec.via.length - 1; q++) {
      const a = byName[spec.via[q]], b = byName[spec.via[q + 1]];
      let pts = route(a, b, spec.cls === 'trail' ? 0.55 : 0.42);
      if (!pts) throw new Error(`vharlen: no road from ${a.name} to ${b.name}`);
      pts[0] = [a.x, a.z]; pts[pts.length - 1] = [b.x, b.z];
      for (let pass = 0; pass < 3; pass++) {
        const nl = [pts[0]];
        for (let k = 0; k < pts.length - 1; k++) { const A = pts[k], B = pts[k + 1]; nl.push([A[0] * 0.75 + B[0] * 0.25, A[1] * 0.75 + B[1] * 0.25], [A[0] * 0.25 + B[0] * 0.75, A[1] * 0.25 + B[1] * 0.75]); }
        nl.push(pts[pts.length - 1]); pts = nl;
      }
      // resample every 8 m
      const res = [pts[0]]; let carry = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        const A = pts[k], B = pts[k + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        let s = 8 - carry;
        while (s <= L) { res.push([A[0] + (B[0] - A[0]) * s / L, A[1] + (B[1] - A[1]) * s / L]); s += 8; }
        carry = L - (s - 8);
      }
      const last = pts[pts.length - 1]; if (Math.hypot(res[res.length - 1][0] - last[0], res[res.length - 1][1] - last[1]) > 0.5) res.push(last);
      const gr = res.map(([x, z]) => isl.ground(x, z));
      const graded = res.map(([x, z], k) => { let sum = 0, c = 0; for (let t = Math.max(0, k - 3); t <= Math.min(res.length - 1, k + 3); t++) { sum += gr[t]; c++; } return [+x.toFixed(2), +z.toFixed(2), +(sum / c).toFixed(3)]; });
      const xs = graded.map(p => p[0]), zs = graded.map(p => p[1]);
      out.push({ id: `${spec.id}_${q}`, class: spec.cls, width: spec.width, from: a.name, to: b.name, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], pts: graded });
    }
  }
  isl._roads = out;
  return out;
}
