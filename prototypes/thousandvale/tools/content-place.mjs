// Stream E — the zone content placer's machinery (used by tools/place-vignettes.mjs and tests/E/placement.test.js).
//
// Given ONE baked zone (stream B: terrain.bin + nav.bin + placements.json) this answers "is this disc a fair
// place to put something?" and finds good spots for every kind of content stream E places:
//   vignette · fort · farm · cave · camp · rare (spawn + a walkable roaming loop) · waystone · npc ·
//   treasure_clue · treasure_cache · hook
// Rules every spot obeys (PLAN §3.4/§3.5, the owner's ask): on dry land, walkable over its whole radius,
// not on a road, a street, a building plot or inside a settlement circle, not on a steep slope, in the
// zone's MAIN walkable component (the one the hub/town sits in — so a player can walk to it), clear of
// stream B's sites (door, event arenas, camp, landmarks) and of every other placement by a minimum gap.
//
// Distances are precomputed once per zone as distance fields on nav.bin's 2 m grid (roads, towns, water,
// steep ground), so a candidate check is a handful of array reads.
import { NAV } from '../js/rules/terrain-read.js';

export const KIND_RULES = {
  // townGap: metres from a settlement circle's EDGE; gap: extra metres to any other disc; slope: max degrees over the disc
  vignette: { townGap: 60, gap: 30, slope: 20, sameKindSpacing: 140 },
  fort: { townGap: 80, gap: 40, slope: 16 },
  farm: { townGap: 25, gap: 30, slope: 12 },
  cave: { townGap: 120, gap: 40, slope: 28 },
  camp: { townGap: 120, gap: 25, slope: 24 },
  rare: { townGap: 150, gap: 30, slope: 24 },
  hook: { townGap: 40, gap: 30, slope: 26 },
  wayside: { townGap: 20, gap: 12, slope: 34, edge: 24 },   // a cairn sits fine on a hillside and near a zone edge
  settlement: { townGap: 300, gap: 60, slope: 10 },
  // P19 living-world pass (tools/content-living.mjs): small things, close together, right up to the zone edge
  curio: { townGap: 30, gap: 10, slope: 26, edge: 30 },
  stray: { townGap: 70, gap: 16, slope: 26, edge: 30 },      // 1-3 monsters (type 'camp' in the file; also roaming packs)
  folk: { townGap: 30, gap: 12, slope: 24, edge: 30 },
  // play-test 2 (Q18): hand-designed set pieces near the start (tools/content-setpieces.mjs adjusts slope per piece)
  setpiece: { townGap: 20, gap: 25, slope: 20 },
};
export const ROAD_GAP = 4;          // metres between a disc's edge and the nearest painted road sample
export const EDGE_MARGIN = 60;      // metres from the zone edge
/** Point-like placements (radius 1, for stream B's scatter clearing): never part of the disc spacing rule. */
export const POINT_TYPES = new Set(['npc', 'waystone', 'treasure_clue', 'treasure_cache']);
export const BLOCK_BITS = NAV.ROAD | NAV.TOWN | NAV.BUILDING | NAV.STEEP | NAV.SHALLOW | NAV.DEEP;

/** The KIND_RULES row a placed record answers to: strays, roaming packs and door guards are small camps ('stray'). */
export const ruleKind = p => (p.type === 'camp' && (p.stray || p.roam || p.doorGuard) ? 'stray' : p.type === 'vignette' && p.setpiece ? 'setpiece' : p.type);

/** Mulberry-ish seeded rng from a string. */
export function rngFor(str) {
  let s = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) s = Math.imul(s ^ str.charCodeAt(i), 0x85ebca6b) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/** Two-pass chamfer distance (metres) from every sample whose nav bits match `mask`. */
function distanceField(bits, size, step, test) {
  const INF = 1e9, d = new Float32Array(size * size);
  for (let k = 0; k < d.length; k++) d[k] = test(bits[k]) ? 0 : INF;
  const o = step, g = step * Math.SQRT2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + o);
    if (j > 0) { v = Math.min(v, d[k - size] + o); if (i > 0) v = Math.min(v, d[k - size - 1] + g); if (i < size - 1) v = Math.min(v, d[k - size + 1] + g); }
    d[k] = v;
  }
  for (let j = size - 1; j >= 0; j--) for (let i = size - 1; i >= 0; i--) {
    const k = j * size + i; let v = d[k];
    if (i < size - 1) v = Math.min(v, d[k + 1] + o);
    if (j < size - 1) { v = Math.min(v, d[k + size] + o); if (i < size - 1) v = Math.min(v, d[k + size + 1] + g); if (i > 0) v = Math.min(v, d[k + size - 1] + g); }
    d[k] = v;
  }
  return d;
}

/** Label nav's passable samples into 4-connected components; returns { label: Int32Array, main, sizes }. */
function components(nav, startXZ) {
  const { size, bits } = nav, label = new Int32Array(size * size).fill(-1), sizes = [];
  const pass = k => (bits[k] & NAV.WALK) !== 0 && (bits[k] & (NAV.SOLID | NAV.BUILDING | NAV.DEEP)) === 0;
  const q = new Int32Array(size * size);
  for (let s = 0; s < label.length; s++) {
    if (label[s] >= 0 || !pass(s)) continue;
    const id = sizes.length; let h = 0, t = 0; q[t++] = s; label[s] = id;
    while (h < t) {
      const k = q[h++], i = k % size, j = (k - i) / size;
      if (i > 0 && label[k - 1] < 0 && pass(k - 1)) { label[k - 1] = id; q[t++] = k - 1; }
      if (i < size - 1 && label[k + 1] < 0 && pass(k + 1)) { label[k + 1] = id; q[t++] = k + 1; }
      if (j > 0 && label[k - size] < 0 && pass(k - size)) { label[k - size] = id; q[t++] = k - size; }
      if (j < size - 1 && label[k + size] < 0 && pass(k + size)) { label[k + size] = id; q[t++] = k + size; }
    }
    sizes.push(t);
  }
  let main = sizes.indexOf(Math.max(...sizes));
  if (startXZ) {
    // the component the hub/town stands in, if it is a big one (a town can sit on a small island of its own)
    const idx = (x, z) => Math.round(z / nav.step) * size + Math.round(x / nav.step);
    for (let r = 0; r < 40 && startXZ; r += 2) for (let a = 0; a < 16; a++) {
      const k = idx(startXZ.x + Math.cos(a / 16 * 6.283) * r, startXZ.z + Math.sin(a / 16 * 6.283) * r);
      if (k >= 0 && k < label.length && label[k] >= 0 && sizes[label[k]] > sizes[main] * 0.25) { main = label[k]; r = 99; break; }
    }
  }
  return { label, main, sizes };
}

/**
 * Walkable components over a whole PROVINCE: the zones' nav grids stitched edge to edge (zone (gx, gy) of the
 * sheet's grid sits at sample offset (gx * (size - 1), gy * (size - 1)); the shared edge row is the same sample).
 * `zones` = [{ gx, gy, nav }]; `start` = { gx, gy, x, z } (the hub). -> { label, main, W, size, sizes }
 * Content must be reachable from the hub across zone borders — a river with no bridge cuts a zone in two and
 * the far half is only reachable through a neighbour, which a per-zone check would call unreachable.
 */
export function provinceComponents(zones, start) {
  const size = zones[0].nav.size, n = size - 1;
  const gw = Math.max(...zones.map(z => z.gx)) + 1, gh = Math.max(...zones.map(z => z.gy)) + 1;
  const W = gw * n + 1, H = gh * n + 1;
  const bits = new Uint8Array(W * H);
  for (const z of zones) for (let j = 0; j < size; j++) {
    const row = (z.gy * n + j) * W + z.gx * n;
    for (let i = 0; i < size; i++) { const b = z.nav.bits[j * size + i]; if (b) bits[row + i] = b; }
  }
  const pass = k => (bits[k] & NAV.WALK) !== 0 && (bits[k] & (NAV.SOLID | NAV.BUILDING | NAV.DEEP)) === 0;
  const label = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H), sizes = [];
  for (let s = 0; s < label.length; s++) {
    if (label[s] >= 0 || !pass(s)) continue;
    const id = sizes.length; let h = 0, t = 0; q[t++] = s; label[s] = id;
    while (h < t) {
      const k = q[h++], i = k % W, j = (k - i) / W;
      if (i > 0 && label[k - 1] < 0 && pass(k - 1)) { label[k - 1] = id; q[t++] = k - 1; }
      if (i < W - 1 && label[k + 1] < 0 && pass(k + 1)) { label[k + 1] = id; q[t++] = k + 1; }
      if (j > 0 && label[k - W] < 0 && pass(k - W)) { label[k - W] = id; q[t++] = k - W; }
      if (j < H - 1 && label[k + W] < 0 && pass(k + W)) { label[k + W] = id; q[t++] = k + W; }
    }
    sizes.push(t);
  }
  const step = zones[0].nav.step;
  let main = -1;
  for (let r = 0; r < 60 && main < 0; r += 2) for (let a = 0; a < 16 && main < 0; a++) {
    const i = start.gx * n + Math.round((start.x + Math.cos(a / 16 * 6.283) * r) / step), j = start.gy * n + Math.round((start.z + Math.sin(a / 16 * 6.283) * r) / step);
    const l = label[j * W + i]; if (l >= 0 && sizes[l] > 10000) main = l;
  }
  if (main < 0) main = sizes.indexOf(Math.max(...sizes));
  return { label, main, W, n, sizes };
}

/**
 * Build the zone context. `bake` = { terrain (parsed), nav (parsed), placements (B's placements.json array), extent }.
 * `reserve` = extra discs (settlement asks) that nothing may sit on.
 */
export function zoneContext({ terrain, nav, placements, start = null, reserve = [], province = null, cell = null, pinned = null }) {
  const { size, step, bits } = nav;
  const dRoad = distanceField(bits, size, step, b => (b & NAV.ROAD) !== 0);
  const dTown = distanceField(bits, size, step, b => (b & (NAV.TOWN | NAV.BUILDING)) !== 0);
  const dWater = distanceField(bits, size, step, b => (b & (NAV.DEEP | NAV.SHALLOW)) !== 0);
  const dSteep = distanceField(bits, size, step, b => (b & NAV.STEEP) !== 0);
  const comp = components(nav, start);
  if (province && cell) {
    // reachability from the province hub: this zone's slice of the stitched province labels
    const { label: G, main, W, n } = province, lab = new Int32Array(size * size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) lab[j * size + i] = G[(cell.gy * n + j) * W + cell.gx * n + i];
    let cnt = 0; for (let k = 0; k < lab.length; k++) if (lab[k] === main) cnt++;
    comp.label = lab; comp.main = main; comp.sizes = { [main]: cnt };
  }
  const extent = (size - 1) * step;
  const idx = (x, z) => {
    const i = Math.min(size - 1, Math.max(0, Math.round(x / step))), j = Math.min(size - 1, Math.max(0, Math.round(z / step)));
    return j * size + i;
  };
  const settlements = placements.filter(p => p.kind === 'settlement').map(p => ({ id: p.id, name: p.data.name, kind: p.data.kind, x: p.x, z: p.z, r: p.data.radius, hub: !!p.data.hub, wfName: p.data.wfName || null, source: 'bake' }));
  const SITE_R = { dungeon_door: 16, event_site: null, camp_site: null, landmark: 20, lair: 20, crossing: 15, pass: 15, dungeon: 20, bridge: null };
  const siteDiscs = [...placements.filter(p => p.kind in SITE_R).map(p => ({ kind: p.kind, id: p.id, x: p.x, z: p.z, r: SITE_R[p.kind] ?? (p.data?.r || (p.data?.span ? p.data.span / 2 + 4 : 20)) })),
    ...groundPieces(placements)];
  const ctx = {
    terrain, nav, size, step, extent, dRoad, dTown, dWater, dSteep, comp, idx,
    settlements: [...settlements, ...reserve.map(r => ({ ...r, source: 'ask' }))],
    siteDiscs, placed: [], pinned: pinned || new Set(),
    roadDist: (x, z) => dRoad[idx(x, z)], townDist: (x, z) => dTown[idx(x, z)],
    waterDist: (x, z) => dWater[idx(x, z)], steepDist: (x, z) => dSteep[idx(x, z)],
    inMain: (x, z) => comp.label[idx(x, z)] === comp.main,
    // a sample in the main component, or a solid one (a tree) next to it
    inMainLoose: (x, z) => { const k = idx(x, z); if (comp.label[k] === comp.main) return true; if (!(bits[k] & NAV.SOLID)) return false; return [1, -1, size, -size].some(o => comp.label[k + o] === comp.main); },
    bitsAt: (x, z) => bits[idx(x, z)],
    mainShare: comp.sizes[comp.main] / (size * size),
  };
  return ctx;
}

/**
 * Stream B's bespoke ground (play-test 2, Q18: tools/lib/zone-setpieces.mjs) as keep-clear discs: every set piece but the
 * automatic field belts round towns (r ~200 m — their FIELDS count instead), each field, and each set-piece building.
 * `piece` = the set piece a disc belongs to (a set piece of ours BOUND to that piece ignores its discs).
 */
export function groundPieces(placements) {
  const out = [];
  for (const p of placements) {
    const d = p.data || {};
    if (p.kind === 'set_piece' && d.piece !== 'belt') out.push({ kind: 'set_piece', id: p.id, piece: p.id, x: p.x, z: p.z, r: d.r || 15 });
    else if (p.kind === 'field') out.push({ kind: 'field', id: p.id, piece: d.setPiece || null, x: p.x, z: p.z, r: 0.5 * Math.hypot(d.w || 20, d.d || 20) });
    else if (p.kind === 'set_building') out.push({ kind: 'set_building', id: p.id, piece: d.setPiece || null, x: p.x, z: p.z, r: 0.5 * Math.hypot(d.w || 8, d.d || 8) + 1 });
  }
  return out;
}

/** One sample is open ground: walkable, in the main component, none of the blocking bits, dry. */
export function openPoint(ctx, x, z, { allowTown = false, allowRoad = false, allowSolid = false, slope = 30 } = {}) {
  if (x < 0 || z < 0 || x > ctx.extent || z > ctx.extent) return false;
  const b = ctx.bitsAt(x, z);
  if (!(b & NAV.WALK) || (b & (NAV.BUILDING | NAV.DEEP | NAV.SHALLOW | NAV.STEEP))) return false;
  if (!allowSolid && (b & NAV.SOLID)) return false;
  if (!allowTown && (b & NAV.TOWN)) return false;
  if (!allowRoad && (b & NAV.ROAD)) return false;
  if (!(allowSolid ? ctx.inMainLoose(x, z) : ctx.inMain(x, z))) return false;
  if (ctx.terrain.waterAt(x, z).depth > 0) return false;
  return ctx.terrain.slopeAt(x, z) <= slope;
}

/**
 * Clear of stream B's movable sites by B's OWN rule (tools/lib/zone-sites.mjs): B re-searches its door and event/
 * camp arenas on every bake with our placements as `avoid` discs (radius `r || 12`), and keeps a door >= r + 40 from
 * each and an arena >= r + arenaR + 20. Staying outside that keeps every B site exactly where it is.
 */
export function clearOfBSites(ctx, x, z, r) {
  for (const s of ctx.siteDiscs) {
    if (ctx.pinned && ctx.pinned.has(s.id)) continue;     // a pinned site (data/world/site-pins.json) never moves for us
    if (s.kind === 'dungeon_door' && Math.hypot(x - s.x, z - s.z) < r + 41) return false;
    if ((s.kind === 'event_site' || s.kind === 'camp_site') && Math.hypot(x - s.x, z - s.z) < r + s.r + 21) return false;
  }
  return true;
}

/** Nearest settlement circle edge distance (negative = inside). */
export function settlementEdge(ctx, x, z) {
  let best = Infinity;
  for (const s of ctx.settlements) best = Math.min(best, Math.hypot(x - s.x, z - s.z) - s.r);
  return best;
}

/**
 * Why a disc of radius R at (x, z) is NOT a fair spot for `kind` (null = it is). Used by the placer AND the tests.
 * Trees and rocks (nav SOLID) inside a disc do not count against it: stream B's re-bake keeps scatter off every
 * placement, so they will not be there.
 */
export function discProblem(ctx, kind, x, z, R, { ignore = null, others = ctx.placed } = {}) {
  const rule = KIND_RULES[kind] || KIND_RULES.vignette;
  const m = Math.max(rule.edge ?? EDGE_MARGIN, R + 20);
  if (x < m || z < m || x > ctx.extent - m || z > ctx.extent - m) return 'edge';
  if (!openPoint(ctx, x, z, { slope: rule.slope, allowSolid: true })) return 'centre not open';
  const ring = R > 14 ? 16 : 8;
  for (const f of [0.5, 1]) for (let a = 0; a < ring; a++) {
    const px = x + Math.cos(a / ring * 6.2832) * R * f, pz = z + Math.sin(a / ring * 6.2832) * R * f;
    if (!openPoint(ctx, px, pz, { slope: rule.slope + 6, allowSolid: true })) return 'radius not open';
  }
  if (ctx.roadDist(x, z) < R + ROAD_GAP) return 'road';
  if (settlementEdge(ctx, x, z) < R + rule.townGap) return 'settlement';
  if (ctx.townDist(x, z) < R + Math.min(rule.townGap, 40)) return 'town ground';
  for (const s of ctx.siteDiscs) {
    if (ignore && ignore.bound && s.piece === ignore.bound) continue;          // our set piece bound onto B's piece (play-test 2)
    const gap = (s.kind === 'field' || s.kind === 'set_piece' || s.kind === 'set_building') ? Math.min(rule.gap, 12) : rule.gap;
    if (Math.hypot(x - s.x, z - s.z) < R + s.r + gap) return 'site ' + s.id;
  }
  if (!clearOfBSites(ctx, x, z, R)) return 'B site rule';
  for (const o of others) {
    if (o === ignore || o.radius == null || POINT_TYPES.has(o.type)) continue;
    if (ignore && (o.in === ignore.id || ignore.in === o.id)) continue;      // a set piece's own boss / folk sit inside it (play-test 2)
    const gap = Math.max(rule.gap, (KIND_RULES[ruleKind(o)] || rule).gap);   // the bigger of the two kinds' gaps, so order does not matter
    const need = (kind === 'vignette' && o.type === 'vignette' && !o.setpiece) ? Math.max(KIND_RULES.vignette.sameKindSpacing, R + o.radius + gap) : R + o.radius + gap;
    if (Math.hypot(x - o.x, z - o.z) < need) return 'near ' + o.id;
  }
  return null;
}

/**
 * A walkable straight leg: every 4 m is walkable, dry (wading allowed), not steep, not a building and in the main
 * component. Trees (SOLID) are allowed — a monster steers round a trunk; the leg is a corridor, not a ray.
 */
export function walkLine(ctx, a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
  for (let i = 0; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    const bits = ctx.bitsAt(x, z);
    if (!(bits & NAV.WALK) || (bits & (NAV.BUILDING | NAV.DEEP | NAV.STEEP)) || !ctx.inMainLoose(x, z)) return false;
  }
  return true;
}

/**
 * Search for the best fair spot. `score(x, z)` adds preference (bigger is better); a spread term pushes things
 * apart. `near` = { x, z, min, max } limits the search to an annulus.
 */
export function findSpot(ctx, rnd, kind, R, { near = null, score = null, tries = 2500, spread = 1 } = {}) {
  let best = null, bestS = -Infinity;
  for (let t = 0; t < tries; t++) {
    let x, z;
    if (near) { const a = rnd() * 6.2832, d = near.min + rnd() * (near.max - near.min); x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d; }
    else { x = rnd() * ctx.extent; z = rnd() * ctx.extent; }
    x = Math.round(x); z = Math.round(z);           // the file stores whole metres: judge the spot that is written
    if (discProblem(ctx, kind, x, z, R)) continue;
    let s = score ? score(x, z) : 0;
    if (s === -Infinity) continue;
    if (spread) { let md = 600; for (const o of ctx.placed) if (o.radius != null && !POINT_TYPES.has(o.type)) md = Math.min(md, Math.hypot(x - o.x, z - o.z)); s += spread * md * 0.25; }
    s += rnd() * 10;
    if (s > bestS) { bestS = s; best = { x, z }; }
  }
  return best;
}

/** Small spot (an NPC, a clue, a waystone) within an annulus: open ground; `allowTown` for NPCs in a town. */
export function findPoint(ctx, rnd, near, { allowTown = false, avoidRoad = true, clearance = 1.5, keepFrom = [], minSep = 3, prefer = null, tries = 1500 } = {}) {
  let best = null, bestS = -Infinity;
  for (let t = 0; t < tries; t++) {
    const a = rnd() * 6.2832, d = near.min + rnd() * (near.max - near.min);
    const x = +(near.x + Math.cos(a) * d).toFixed(1), z = +(near.z + Math.sin(a) * d).toFixed(1);
    if (!openPoint(ctx, x, z, { allowTown, allowRoad: !avoidRoad, slope: 26 })) continue;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) if (!openPoint(ctx, x + Math.cos(k * 0.785) * clearance, z + Math.sin(k * 0.785) * clearance, { allowTown, allowRoad: true, slope: 32 })) ok = false;
    if (!ok) continue;
    if (keepFrom.some(o => Math.hypot(o.x - x, o.z - z) < minSep)) continue;
    if (!clearOfBSites(ctx, x, z, 1)) continue;
    const s = (prefer ? prefer(x, z) : -d) + rnd();
    if (s > bestS) { bestS = s; best = { x, z }; }
  }
  return best;
}

/** Text hint -> placement preference: a named place to stay near, and terrain words. */
export function hintFrom(text, places) {
  const s = String(text || '').toLowerCase();
  const near = places.find(p => p.name && s.includes(p.name.toLowerCase())) || null;
  return {
    near,
    water: /marsh|fen|river|lake|mere|shallow|reed|shore|pool|beach|tide|sand|channel|ferry|cove|wreck|sunk|eel|sinkhole|bog/.test(s),
    steep: /cliff|pass|switchback|high|ridge|scree|cairn|crag|rocks|quarry|seam|open cut|hill/.test(s),
    road: /road|toll|track|lane|bridge|crossing/.test(s),
    forest: /forest|wood|tree|glade|oak|grove|thicket|kiln|charcoal/.test(s),
  };
}

/** Score function for a hint (preferring water/steep/road/forest within ~60 m). */
export function hintScore(ctx, hint) {
  const forest = new Set(['temperateForest', 'borealForest', 'rainforest']);
  return (x, z) => {
    let s = 0;
    if (hint.water) { const d = ctx.waterDist(x, z); s += d < 80 ? 120 - d : 0; }
    if (hint.steep) { const d = ctx.steepDist(x, z); s += d < 80 ? 100 - d : 0; }
    if (hint.road) { const d = ctx.roadDist(x, z); s += d < 90 ? 90 - d : 0; }
    if (hint.forest && forest.has(ctx.terrain.biomes[ctx.terrain.biomeAt(x, z)].key)) s += 80;
    return s;
  };
}

/** Content fingerprint for the sameness check: what kinds/templates a zone holds. */
export function fingerprint(file) {
  const pl = file.placements;
  return {
    vignettes: new Set(pl.filter(p => p.type === 'vignette').map(p => p.id)),
    templates: pl.filter(p => ['fort', 'farm', 'cave'].includes(p.type)).map(p => `${p.type}:${p.template}`).sort(),
    camps: pl.filter(p => p.type === 'camp').map(p => p.monster).sort(),
  };
}

// ---- the level gradient (owner play-test P26) -----------------------------------------------------------------
/**
 * "A fresh level 1-3 player needs plenty of level 1-3 creatures near the start, levels rising gently outward."
 * Level at a point = max(1, min(zone ramp, distance ramp)):
 *   distance ramp = 1 + (metres from the start hub) / metresPerLevel — so ~1 by the gate, 2 at ~550 m, 3 at ~1.1 km;
 *   zone ramp     = the zone sheet's band, low edge on the side nearest the hub rising to the high edge on the far side.
 * The distance ramp only ever LOWERS a level (a far zone keeps its own band); near the start it is what you meet.
 */
export const GRADIENT = { metresPerLevel: 550, startLevel: 1 };

/**
 * levelField({ sheet, hub: { x, z } (province metres = zone grid * ZM + zone metres), ZM })
 * -> { at(eid, x, z) (zone metres) -> float level, dist(eid, x, z) -> metres from the hub, span(eid) -> [lo, hi] (whole levels the zone holds) }
 */
export function levelField({ sheet, hub, ZM = 2048, metresPerLevel = GRADIENT.metresPerLevel }) {
  const zr = {};
  for (const [eid, z] of Object.entries(sheet.zones)) {
    const x0 = z.grid[0] * ZM, z0 = z.grid[1] * ZM, x1 = x0 + ZM, z1 = z0 + ZM;
    const dx = Math.max(x0 - hub.x, 0, hub.x - x1), dz = Math.max(z0 - hub.z, 0, hub.z - z1);
    const dMin = Math.hypot(dx, dz);
    const dMax = Math.max(...[[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([a, b]) => Math.hypot(a - hub.x, b - hub.z)));
    zr[eid] = { x0, z0, dMin, dMax, band: z.band };
  }
  const dist = (eid, x, z) => Math.hypot(zr[eid].x0 + x - hub.x, zr[eid].z0 + z - hub.z);
  const raw = (eid, d) => {
    const r = zr[eid], t = Math.min(1, Math.max(0, (d - r.dMin) / Math.max(1, r.dMax - r.dMin)));
    const zone = r.band[0] + (r.band[1] - r.band[0]) * t;
    return Math.max(GRADIENT.startLevel, Math.min(zone, GRADIENT.startLevel + d / metresPerLevel));
  };
  return {
    hub, metresPerLevel,
    dist,
    at: (eid, x, z) => raw(eid, dist(eid, x, z)),
    span: eid => [Math.max(1, Math.floor(raw(eid, zr[eid].dMin))), zr[eid].band[1]],
  };
}

/** A camp's [lo, hi] at a level: whole levels, lo = floor, hi = lo + 1, never above the zone's top. */
export function campLevels(level, top) { const lo = Math.max(1, Math.min(top, Math.floor(level))); return [lo, Math.min(top, lo + 1)]; }

/**
 * Stream C's starting-area rules (docs/requests.md "C -> E, P26", measured with level-2 characters):
 * the first ~400 m round the start hub holds solos and pairs only, 400-900 m at most trios; the heavy hitters
 * (crag hyena, frost stalker, brigand captain) never stand where the ramp is under 4.
 */
export const HEAVY = new Set(['crag_hyena', 'frost_stalker', 'brigand_captain']);
export const heavyOk = (type, level) => !HEAVY.has(type) || level >= 4;
export function capCount(count, hubDist) {
  const [lo, hi] = Array.isArray(count) ? count : [count || 1, count || 1];
  const cap = hubDist < 400 ? 2 : hubDist < 900 ? 3 : 99;
  return [Math.min(lo, cap), Math.min(hi, cap)];
}
export const countCapAt = hubDist => (hubDist < 400 ? 2 : hubDist < 900 ? 3 : null);
