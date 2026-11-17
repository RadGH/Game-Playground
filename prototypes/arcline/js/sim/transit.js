// Mass transit and interstate links (PLAN §0 'Roads', 'Population').
//   Lines: tiles.transit (1 = Monorail, 2 = Maglev; catalog.json `transit`) drawn like roads, elevated — over roads,
//   zones and water (not through buildings or walls). Stations are 2×2 lots beside a line. A line is WORKING when two
//   or more stations sit on it; each working station cuts traffic on the roads around it and lifts land value nearby.
//   Interstate links: a road on the border that meets the neighbour city's own border road tile to tile (#74), or a
//   transit line with a station reaching the region's edge where the neighbour region holds one of your cities, links
//   the two (world.js neighbours). A link works for
//   BOTH cities, whichever side built it (owner 2026-11-16: "transit lines benefit other cities by increasing growth
//   and demand"): each linked city sends T.neighbourTrickle people a month, and linkBoost() raises Residential and
//   Commercial demand and how fast newcomers move in (appeal) — transit counts for more than a road.
// Pure. Hooks the city tick calls: cutTraffic(r) right after solveTraffic, transitLandValue(r) right after
// solveLandValue, neighbourArrivals(world, r) once a month; transitUpkeep(r) belongs in the monthly budget.
import { T } from './tuning.js';
import { cat, unlocked } from './catalog.js';
import { isFlat } from './terrain.js';
import { addLot } from './build.js';
import { CELL, regionAt } from './world.js';
import { fmt } from '../../../../shared/format.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inMap = (r, x, z) => x >= 0 && z >= 0 && x < r.size && z < r.size;
export const STATION = [2, 2];
/** The catalog transit kind for a level (1 Monorail, 2 Maglev). */
export function transitKind(level) { return cat().transit[level - 1]; }
const stationId = level => `station-${transitKind(level).id}`;
export const isStation = l => typeof l.id === 'string' && l.id.startsWith('station-');

// ---------------------------------------------------------------- building lines + stations
/** Price a transit line along tiles (lineTiles from build.js). Over water costs 3×. → { ok, why, cost, tiles } */
export function quoteTransit(r, tiles, level = 1) {
  const k = transitKind(level); if (!k) return { ok: false, why: 'Unknown line', cost: 0, tiles: [] };
  if (!unlocked(r, k)) return { ok: false, why: `The ${k.name} unlocks at milestone ${k.unlock}`, cost: 0, tiles: [] };
  const good = []; let cost = 0, why = null;
  for (const [x, z] of tiles) {
    if (!inMap(r, x, z)) continue; const i = z * r.size + x;
    if (r.tiles.transit[i] >= level) continue;
    if (r.tiles.lot[i] >= 0) { why = 'A building is in the way'; continue; }
    if (r.tiles.wall[i]) { why = 'A wall is in the way'; continue; }
    if (r.turrets.some(t => t.x === x && t.z === z)) { why = 'A turret is in the way'; continue; }
    cost += k.cost * (r.ter.water[i] ? 3 : 1) * (r.tiles.transit[i] ? 0.6 : 1); good.push([x, z]);
  }
  cost = Math.round(cost);
  const broke = r.money < cost ? `Needs ${fmt(cost)} credits` : null;
  return { ok: good.length > 0 && !broke, why: broke || why || (good.length ? null : 'Already built'), cost, tiles: good };
}
export function buildTransit(r, tiles, level = 1) {
  const q = quoteTransit(r, tiles, level); if (!q.ok) return q;
  for (const [x, z] of q.tiles) { const i = z * r.size + x; r.tiles.transit[i] = level; r.tiles.zone[i] = 0; r.ter.flora[i] = 0; }
  r.money -= q.cost; r.dirty = true; return q;
}
/** Price a 2×2 station at (x, z) (top-left). It must be flat, clear and beside a line of its kind. */
export function quoteStation(r, x, z, level = 1) {
  const k = transitKind(level); if (!k) return { ok: false, why: 'Unknown line' };
  if (!unlocked(r, k)) return { ok: false, why: `The ${k.name} unlocks at milestone ${k.unlock}` };
  const [w, d] = STATION;
  if (!inMap(r, x, z) || !inMap(r, x + w - 1, z + d - 1)) return { ok: false, why: 'Off the edge of the region' };
  for (let a = 0; a < d; a++) for (let b = 0; b < w; b++) { const i = (z + a) * r.size + x + b; if (r.tiles.lot[i] >= 0 || r.tiles.wall[i] || r.tiles.road[i] || r.tiles.transit[i]) return { ok: false, why: 'Something is in the way' }; }
  if (!isFlat(r.ter, x, z, w, d)) return { ok: false, why: 'The ground must be flat and dry — level it first' };
  if (!besideLine(r, x, z, w, d, level)) return { ok: false, why: `Put it beside a ${k.name} line` };
  if (r.money < k.station) return { ok: false, why: `Needs ${fmt(k.station)} credits` };
  return { ok: true, cost: k.station };
}
export function placeStation(r, x, z, level = 1) {
  const q = quoteStation(r, x, z, level); if (!q.ok) return q;
  const k = transitKind(level), [w, d] = STATION;
  const lot = { n: r.nextLot = (r.nextLot || 0) + 1, id: stationId(level), name: `${k.name} station`, kind: 'placed', line: level, x, z, w, d,
    recipe: 'tr-station', params: { line: level, seed: (x * 31 + z * 17) % 997 + 1 }, power: -(level === 2 ? 6 : 3), water: 0, people: 0, jobs: 8, upkeep: k.upkeep * 20, built: r.day, hp: 1 };
  addLot(r, lot); r.money -= q.cost; r.dirty = true;
  return { ...q, lot };
}
function besideLine(r, x, z, w, d, level) {
  for (let k = -1; k <= d; k++) for (let j = -1; j <= w; j++) {
    if ((k === -1 || k === d) === (j === -1 || j === w)) continue;
    const tx = x + j, tz = z + k; if (inMap(r, tx, tz) && r.tiles.transit[tz * r.size + tx] === level) return true;
  }
  return false;
}

// ---------------------------------------------------------------- lines
/** Connected pieces of track (one level each) with their stations. → [{ level, tiles, stations: [lot], working, edge }]
 *  edge = the line touches the region edge. Also returns comp (tile → line index, -1 none). */
export function transitLines(r) {
  const N = r.size, tr = r.tiles.transit, comp = new Int32Array(N * N).fill(-1), lines = [];
  for (let s = 0; s < N * N; s++) {
    if (!tr[s] || comp[s] >= 0) continue;
    const id = lines.length, level = tr[s], q = [s]; comp[s] = id; let n = 0, edge = false;
    while (q.length) { const i = q.pop(), x = i % N, z = (i / N) | 0; n++; if (!x || !z || x === N - 1 || z === N - 1) edge = true;
      for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (!inMap(r, nx, nz)) continue; const j = nz * N + nx; if (tr[j] === level && comp[j] < 0) { comp[j] = id; q.push(j); } } }
    lines.push({ level, tiles: n, stations: [], edge });
  }
  for (const l of r.lots) {
    if (!isStation(l)) continue; const seen = new Set();
    for (let k = -1; k <= l.d; k++) for (let j = -1; j <= l.w; j++) { const tx = l.x + j, tz = l.z + k; if (!inMap(r, tx, tz)) continue; const c = comp[tz * N + tx]; if (c >= 0 && lines[c].level === l.line && !seen.has(c)) { seen.add(c); lines[c].stations.push(l); } }
  }
  for (const L of lines) L.working = L.stations.length >= 2;
  return Object.assign(lines, { comp });
}
/** Stations on a working line (each with its strength: Maglev 1.3×). */
function workingStations(r) {
  const out = new Map();
  for (const L of transitLines(r)) if (L.working) for (const s of L.stations) out.set(s, Math.max(out.get(s) || 0, L.level === 2 ? 1.3 : 1));
  return [...out];
}
/** After networks.solveTraffic: roads near a working station carry less (people ride instead). */
export function cutTraffic(r) {
  const N = r.size, rad = T.stationRadius ?? 9, cut = T.transitTrafficCut ?? 0.4;
  for (const [s, k] of workingStations(r)) {
    const cx = s.x + s.w / 2, cz = s.z + s.d / 2;
    for (let z = Math.max(0, Math.floor(cz - rad)); z < Math.min(N, cz + rad); z++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(N, cx + rad); x++) {
      const i = z * N + x; if (!r.tiles.road[i]) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d >= rad) continue;
      r.tiles.traffic[i] *= 1 - Math.min(0.9, cut * k * (1 - d / rad));
    }
  }
}
/** After city.solveLandValue: land near a working station is worth more. */
export function transitLandValue(r) {
  const N = r.size, rad = T.stationRadius ?? 9, add = T.transitValue ?? 0.12;
  for (const [s, k] of workingStations(r)) {
    const cx = s.x + s.w / 2, cz = s.z + s.d / 2;
    for (let z = Math.max(0, Math.floor(cz - rad)); z < Math.min(N, cz + rad); z++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(N, cx + rad); x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d >= rad) continue;
      const i = z * N + x; r.tiles.value[i] = Math.min(1, r.tiles.value[i] + add * k * (1 - d / rad));
    }
  }
}
/** Monthly cost of track (catalog upkeep per tile; stations carry their own lot upkeep). */
export function transitUpkeep(r) { let s = 0; const ks = cat().transit; for (let i = 0; i < r.tiles.transit.length; i++) { const lv = r.tiles.transit[i]; if (lv) s += ks[lv - 1].upkeep; } return s; }

// ---------------------------------------------------------------- interstate links
/** The neighbour region across the edge from tile (x, z) of region r, or null. wr = the world's record for r. */
function across(world, wr, r, x, z) {
  const N = r.size, out = [];
  if (x === 0) out.push(regionAt(world, wr.cx - 1, wr.cz + Math.floor(z / CELL)));
  if (x === N - 1) out.push(regionAt(world, wr.cx + wr.span, wr.cz + Math.floor(z / CELL)));
  if (z === 0) out.push(regionAt(world, wr.cx + Math.floor(x / CELL), wr.cz - 1));
  if (z === N - 1) out.push(regionAt(world, wr.cx + Math.floor(x / CELL), wr.cz + wr.span));
  return out.filter(o => o && o.id !== wr.id);
}
// Road links need a road on BOTH sides of the border, meeting tile to tile (owner report #74, 2026-11-16: "If two
// adjacent cities do not have a connecting road, they should NOT form a connection on the world map"). A city's border
// roads are saved in its world summary (save.js summarize → edgeRoads: [[x, z, level]] in its own tiles), so a city
// can check its neighbour without loading it. A new region starts with a short road at every spot where a neighbour's
// road reaches the shared border, pointing out toward it (seedEdgeRoads) — so two cities line up and know they link.
/** Road tiles on the region's border, in its own tiles: [[x, z, level]]. */
export function edgeRoadTiles(r) {
  const N = r.size, out = [], seen = new Set();
  for (let k = 0; k < N; k++) for (const [x, z] of [[k, 0], [k, N - 1], [0, k], [N - 1, k]]) {
    const i = z * N + x; if (!r.tiles.road[i] || seen.has(i)) continue; seen.add(i); out.push([x, z, r.tiles.road[i]]);
  }
  return out;
}
/** The tile just across the border from (x, z) of world region a, in world region b's own tiles — or null. */
function acrossInto(a, x, z, b) {
  const N = a.size, wx = a.wx + x, wz = a.wz + z, steps = [];
  if (x === 0) steps.push([-1, 0]); if (x === N - 1) steps.push([1, 0]); if (z === 0) steps.push([0, -1]); if (z === N - 1) steps.push([0, 1]);
  for (const [dx, dz] of steps) { const bx = wx + dx - b.wx, bz = wz + dz - b.wz; if (bx >= 0 && bz >= 0 && bx < b.size && bz < b.size) return [bx, bz, dx, dz]; }
  return null;
}
const edgeSet = city => {
  if (!city?.edgeRoads) return null;
  if (city._edgeSet?.src !== city.edgeRoads) Object.defineProperty(city, '_edgeSet', { value: { src: city.edgeRoads, set: new Set(city.edgeRoads.map(([x, z]) => `${x},${z}`)) }, enumerable: false, configurable: true, writable: true });
  return city._edgeSet.set;
};
/** Does world region b (its saved summary) have a road on the tile across the border from (x, z) of region a? */
function theirRoadAt(a, x, z, b) { const set = edgeSet(b.city), t = set && acrossInto(a, x, z, b); return !!(t && set.has(`${t[0]},${t[1]}`)); }
/** Do two neighbouring world regions' saved border roads meet? (the world map's road links) */
export function roadsMeet(world, a, b) {
  const own = a.city?.edgeRoads; if (!own?.length || !edgeSet(b.city)) return false;
  return own.some(([x, z]) => theirRoadAt(a, x, z, b));
}
/** Two cities are linked on the world map when their border roads meet, or either side runs a transit line across. */
export function citiesLinked(world, a, b) {
  if (roadsMeet(world, a, b)) return true;
  const rail = (p, q) => (p.city?.links || []).some(l => l.id === q.id && (l.by === 'transit' || l.by === 'both') && !l.theirs);
  return rail(a, b) || rail(b, a);
}
/**
 * A brand-new region (never played): for every neighbour city whose road reaches the shared border, lay a short road
 * (T.edgeStub tiles, default 3) from the matching border tile inward, so it starts pointing out at the neighbour. Free.
 * It may not reach anything yet — it's there to line the two cities up. → number of road tiles laid
 */
export function seedEdgeRoads(world, r) {
  const wr = world.regions[r.id]; if (!wr) return 0;
  const N = r.size, len = Math.max(1, Math.round(T.edgeStub ?? 3)); let laid = 0;
  for (const o of world.regions) {
    if (!o || o.id === wr.id || !o.city?.edgeRoads?.length) continue;
    for (const [ox, oz, lv] of o.city.edgeRoads) {
      const t = acrossInto(o, ox, oz, wr); if (!t) continue;
      const [x, z, dx, dz] = t;   // (dx, dz) points from the neighbour into this region: the stub runs that way
      for (let k = 0; k < len; k++) {
        const tx = x + dx * k, tz = z + dz * k; if (tx < 0 || tz < 0 || tx >= N || tz >= N) break;
        const i = tz * N + tx; if (r.tiles.lot[i] >= 0 || r.tiles.wall[i]) break;
        if (!r.tiles.road[i]) { r.tiles.road[i] = Math.min(3, Math.max(1, lv || 1)); r.tiles.zone[i] = 0; r.ter.flora[i] = 0; laid++; }
      }
    }
  }
  if (laid) { r.dirty = true; r.lineRev = (r.lineRev || 0) + 1; }
  return laid;
}

/**
 * Links from this city to neighbouring cities. founded(o) says whether world region o holds one of your cities
 * (default: o.city is set). A road link needs the neighbour's saved border road on the tile across (theirRoadAt); a
 * transit line needs one station on its side. → [{ id, name, road: bool, transit: bool, x, z }]
 */
export function edgeLinks(world, r, founded = o => !!o.city) {
  const wr = world.regions[r.id]; if (!wr || !r.founded) return [];
  const N = r.size, lines = transitLines(r), links = new Map();
  const note = (o, how, x, z) => { if (!founded(o)) return; const l = links.get(o.id) || { id: o.id, name: o.name, road: false, transit: false, x, z }; l[how] = true; links.set(o.id, l); };
  for (let k = 0; k < N; k++) for (const [x, z] of [[k, 0], [k, N - 1], [0, k], [N - 1, k]]) {
    const i = z * N + x;
    if (r.tiles.road[i]) for (const o of across(world, wr, r, x, z)) if (theirRoadAt(wr, x, z, o)) note(o, 'road', x, z);
    const c = lines.comp[i]; if (c >= 0 && lines[c].stations.length >= 1) for (const o of across(world, wr, r, x, z)) note(o, 'transit', x, z);
  }
  return [...links.values()];
}
/**
 * Links that other cities built to this one: a neighbour whose world record lists this region (written when that
 * city last ran its month). Same shape as edgeLinks. A link is a two-way street: both cities get its benefits.
 */
export function linksFrom(world, r, founded = o => !!o.city) {
  const out = [];
  for (const o of world.regions || []) {
    if (!o || o.id === r.id || !founded(o)) continue;
    const l = (o.links || []).find(l => l.id === r.id); if (!l) continue;
    out.push({ id: o.id, name: o.name, road: l.by === 'road' || l.by === 'both', transit: l.by === 'transit' || l.by === 'both' });
  }
  return out;
}
/**
 * What this city's links (r.links, refreshed monthly by neighbourArrivals) are worth right now:
 *   R, C — extra share of Residential / Commercial demand (0.12 = the targets grow 12%)
 *   appeal — added to city.appeal (newcomers move in faster)
 * A road link counts T.linkRoad, a transit link T.linkTransit (both: the bigger); more links add up with a cap.
 */
export function linkBoost(r) {
  let k = 0;
  for (const l of r.links || []) k += l.by === 'road' ? (T.linkRoad ?? 0.1) : (T.linkTransit ?? 0.25);
  k = Math.min(T.linkCap ?? 0.6, k);
  return { R: k, C: k * 1.2, appeal: k * 0.8 };
}
/**
 * Once a month: each linked city sends T.neighbourTrickle people (× T.transitTrickleMul over a transit line) as
 * arrivals. Links count from either side (edgeLinks from here, linksFrom the neighbours' records). Stores the links on
 * the region (r.links) and the world record (world.regions[id].links) so the world map can draw them without loading
 * the region. → { people, from: [{ id, name, people, by }] }
 */
export function neighbourArrivals(world, r, founded) {
  const by = l => l.transit && l.road ? 'both' : l.transit ? 'transit' : 'road';
  const own = edgeLinks(world, r, founded);
  // the world record keeps only the links THIS city built (a neighbour's own record speaks for its side; copying theirs
  // here would keep a link alive after they tore it down)
  if (world.regions[r.id]) world.regions[r.id].links = own.map(l => ({ id: l.id, by: by(l) }));
  const links = own.map(l => ({ ...l }));
  for (const o of linksFrom(world, r, founded)) {
    const l = links.find(l => l.id === o.id);
    if (l) { l.road ||= o.road; l.transit ||= o.transit; } else links.push({ ...o, x: null, z: null, theirs: true });
  }
  r.links = links.map(l => ({ id: l.id, name: l.name, by: by(l) }));
  const from = [];
  for (const l of links) { const n = Math.round((T.neighbourTrickle ?? 4) * (l.transit ? (T.transitTrickleMul ?? 2) : 1)); if (n > 0) from.push({ id: l.id, name: l.name, people: n, by: l.transit ? 'transit' : 'road' }); }
  const people = from.reduce((s, f) => s + f.people, 0);
  if (people) { r.people.arriving += people; r.people.fromNeighbours = (r.people.fromNeighbours || 0) + people; }
  return { people, from };
}
/** For the world map: every link once, as pairs. Reads world.regions[].links (written by neighbourArrivals). */
export function worldLinkPairs(world) {
  const seen = new Set(), out = [];
  for (const a of world.regions) for (const l of a.links || []) { const key = a.id < l.id ? `${a.id}-${l.id}` : `${l.id}-${a.id}`; if (seen.has(key)) continue; seen.add(key); out.push({ a: a.id, b: l.id, by: l.by }); }
  return out;
}
/** One call for the city's monthly tick: traffic cut + neighbour arrivals (land value goes after solveLandValue). */
export function transitMonth(world, r, founded) { cutTraffic(r); return world ? neighbourArrivals(world, r, founded) : { people: 0, from: [] }; }
