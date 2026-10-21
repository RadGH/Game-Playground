#!/usr/bin/env node
// Thousandvale — FISH POOLS AND ANGLERS on stream B's baked water (stream E, play-test 5 T25 Angling).
//
//   node tools/content-pools.mjs            write data/provinces/angling-pools.json, the anglers' NPC rows in each
//                                           zone's quest file, and the first quest's pool mark (data/quests/angling.json)
//   node tools/content-pools.mjs --check    change nothing; exit 1 when a file would change
//
// OWNER FEEDBACK 7 (V3, "I've only seen the one right at the start"): every hub town with water within POOL.townReach m has
// a pool OF ITS OWN (`town`, `always`, tier 1) where the gate road, the bridge or the quay meets the water, and its angler
// stands beside it and says where it is; a second pass adds pools wherever a road runs beside or crosses the water; at
// least 60% of a zone's pools are tier 1 and 60% of the listed spots are open at once (`meta.live`).
//   then: node tools/content-hunts.mjs      (it copies the anglers into <zone>.quest.json so the server spawns them)
//
// WHAT A POOL IS. A spot IN the water (>= POOL.depth m deep) with a dry, walkable SHORE point POOL.shore m away that
// a walker can reach from the zone's town — so a pool can always be fished from the bank. Pools sit beside roads
// first ("a walking newcomer SEES one early"): candidates are taken nearest-road first, POOL.gap m apart. The zone
// lists about three times as many spots as are open at once (`live`): a pool is fished out after a few catches and
// another listed spot opens (stream A). Tier 1 = anyone, 2 = skill 25, 3 = skill 50 (C's fishing.pool(tier)): the
// roadside ones are tier 1, the ones you have to walk to are better.
//
// WATER KINDS. B bakes sea / lake / river. Angling speaks river / lake / marsh / coast (data/provinces/angling.json).
// `waterOf.<zone>` says what each baked kind counts as IN THAT ZONE: a marsh zone's standing water is `marsh`, a
// coast zone's is `coast`, sea is always `coast`. A uses the same table for a cast outside a pool.
//
// ANGLERS. One per hub town (angling.json `anglers`), standing on the bank nearest the town (within ANGLER.reach m);
// a town with no water in reach keeps its angler at the town's edge. The Torborhold one gives the first quest; the
// tier-1 pool nearest them is the `start` pool (always open, never fished out).
// Same inputs -> same output (no random numbers).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseTerrain, parseNav, NAV } from '../js/rules/terrain-read.js';
import { provinceComponents } from './content-place.mjs';
import { provinceArg, provinceDataPath, provinceDataSync, requireProvince } from './content-lib.mjs';

const ROOT = new URL('../', import.meta.url);
const P = f => new URL(f, ROOT);
const readJ = f => JSON.parse(readFileSync(P(f), 'utf8'));
const CHECK = process.argv.includes('--check');
const PROV = provinceArg(process.argv);     // --province=<id> (default torbor_downs): writes that province's own <id>-angling-pools.json
const ZM = 2048;

export const POOL = Object.freeze({ depth: 0.5, wade: 0.35, shelf: [0.22, 0.1], few: 12, shore: [3, 15], gap: 90, startGap: 80, max: 44, edge: 40, lattice: 6, roadside: 45, far: 220,
  // owner feedback 7 V3: more pools where a road runs beside or crosses the water (a second pass, closer together), a
  // pool of its own for every town with water in reach, and most pools open to a beginner
  roadGap: 60, roadMax: 16, roadM: 35, townReach: 700, townRoadM: 40, tier1Share: 0.6, minPools: 6 });
export const ANGLER = Object.freeze({ reach: 420, startPool: 150, toPool: 60 });
/** Baked water kind -> angling water kind, by the zone's archetype (data/provinces/torbor_downs.json). */
export const WATER_BY_ARCHETYPE = Object.freeze({
  marsh: { river: 'marsh', lake: 'marsh', sea: 'coast' },
  coast: { river: 'river', lake: 'coast', sea: 'coast' },
  lakeland: { river: 'lake', lake: 'lake', sea: 'coast' },      // B bakes the Gullwick lakes as wide river water
  default: { river: 'river', lake: 'lake', sea: 'coast' },
});
/** One zone that is not what its archetype says: the Sunken Wolds are drowned land — standing water, whatever B calls it. */
export const WATER_BY_ZONE = Object.freeze({ sunken_wolds: { river: 'lake', lake: 'lake', sea: 'coast' } });

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Everything the tool needs to know about one baked zone. */
function zoneFacts(wid) {
  const t = parseTerrain(readFileSync(P(`data/zones/${wid}/terrain.bin`)));
  const nav = parseNav(readFileSync(P(`data/zones/${wid}/nav.bin`)));
  const { size: S, step, bits } = nav;
  const pass = k => (bits[k] & NAV.WALK) !== 0 && (bits[k] & (NAV.SOLID | NAV.BUILDING | NAV.DEEP)) === 0;
  const idx = (x, z) => Math.min(S - 1, Math.max(0, Math.round(z / step))) * S + Math.min(S - 1, Math.max(0, Math.round(x / step)));
  // metres to the nearest road sample: a two-pass chamfer over the nav grid
  const dRoad = new Float32Array(S * S).fill(1e9);
  for (let k = 0; k < S * S; k++) if (bits[k] & NAV.ROAD) dRoad[k] = 0;
  const A = step, D = step * Math.SQRT2;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = j * S + i; let v = dRoad[k];
    if (i > 0) v = Math.min(v, dRoad[k - 1] + A); if (j > 0) { v = Math.min(v, dRoad[k - S] + A); if (i > 0) v = Math.min(v, dRoad[k - S - 1] + D); if (i < S - 1) v = Math.min(v, dRoad[k - S + 1] + D); } dRoad[k] = v; }
  for (let j = S - 1; j >= 0; j--) for (let i = S - 1; i >= 0; i--) { const k = j * S + i; let v = dRoad[k];
    if (i < S - 1) v = Math.min(v, dRoad[k + 1] + A); if (j < S - 1) { v = Math.min(v, dRoad[k + S] + A); if (i < S - 1) v = Math.min(v, dRoad[k + S + 1] + D); if (i > 0) v = Math.min(v, dRoad[k + S - 1] + D); } dRoad[k] = v; }
  return { wid, t, nav, S, step, bits, pass, idx, dRoad };
}

/** Samples a walker can reach from (x, z) inside the zone (4-connected over the nav grid). */
function reachFrom(F, x, z) {
  const { S, step, pass } = F, seen = new Uint8Array(S * S);
  let start = -1;
  for (let r = 0; r < 80 && start < 0; r++) for (let a = 0; a < 24 && start < 0; a++) {
    const k = F.idx(x + Math.cos(a / 24 * 6.283) * r * step, z + Math.sin(a / 24 * 6.283) * r * step);
    if (pass(k)) start = k;
  }
  if (start < 0) return seen;
  const q = new Int32Array(S * S); let h = 0, n = 0; q[n++] = start; seen[start] = 1;
  while (h < n) {
    const k = q[h++], i = k % S;
    if (i > 0 && !seen[k - 1] && pass(k - 1)) { seen[k - 1] = 1; q[n++] = k - 1; }
    if (i < S - 1 && !seen[k + 1] && pass(k + 1)) { seen[k + 1] = 1; q[n++] = k + 1; }
    if (k >= S && !seen[k - S] && pass(k - S)) { seen[k - S] = 1; q[n++] = k - S; }
    if (k < S * (S - 1) && !seen[k + S] && pass(k + S)) { seen[k + S] = 1; q[n++] = k + S; }
  }
  return seen;
}

/** A bank sample: reachable, dry or ankle-deep (a wide beach shelves slowly — you may stand in the shallows), no building, not steep. */
const bank = (F, reach, x, z, wade = POOL.wade) => { const k = F.idx(x, z), b = F.bits[k]; return !!reach[k] && !(b & (NAV.DEEP | NAV.BUILDING | NAV.STEEP | NAV.SOLID)) && !(F.t.waterAt(x, z).depth > wade); };

/** The nearest bank point to a water point, POOL.shore metres away (null = none: mid-lake, or a cliff shore). */
function shoreOf(F, reach, x, z, wade = POOL.wade) {
  for (let r = POOL.shore[0]; r <= POOL.shore[1]; r += 2) {
    let best = null;
    for (let a = 0; a < 16; a++) {
      // on the nav grid itself: the point written to the file is exactly the sample that was tested
      const px = Math.round((x + Math.cos(a / 16 * 6.283) * r) / F.step) * F.step, pz = Math.round((z + Math.sin(a / 16 * 6.283) * r) / F.step) * F.step;
      if (px < 4 || pz < 4 || px > ZM - 4 || pz > ZM - 4 || !bank(F, reach, px, pz, wade)) continue;
      if (Math.hypot(px - x, pz - z) < 2.5) continue;
      const d = F.dRoad[F.idx(px, pz)];
      if (!best || d < best.d) best = { x: px, z: pz, d };
    }
    if (best) return best;
  }
  return null;
}

export function poolsForZone(F, { hub, archetype, band, gap = POOL.gap, eid = null, reach = null, town = null }) {
  reach ||= reachFrom(F, hub.x, hub.z);
  const waterOf = WATER_BY_ZONE[eid] || WATER_BY_ARCHETYPE[archetype] || WATER_BY_ARCHETYPE.default;
  const scan = (depth, wade, flat) => {
    const list = [];
    for (let z = POOL.edge; z <= ZM - POOL.edge; z += POOL.lattice) for (let x = POOL.edge; x <= ZM - POOL.edge; x += POOL.lattice) {
      const w = F.t.waterAt(x, z);
      if (!(w.depth >= depth)) continue;
      const s = shoreOf(F, reach, x, z, wade); if (!s) continue;
      list.push({ x, z, shore: { x: s.x, z: s.z }, water: waterOf[w.kind] || 'lake', baked: w.kind, road: Math.round(s.d), ...(flat ? { shelf: true } : {}) });
    }
    return list.sort((a, b) => a.road - b.road || a.z - b.z || a.x - b.x);
  };
  // a shore that shelves slowly (a beach, a mere) has no half-metre water within a cast of dry land: there the pool sits
  // in the shallows (POOL.shelf) — only used when the ordinary rule finds too few (`shelf: true` on those pools)
  const cands = scan(POOL.depth, POOL.wade, false);
  const spaced = l => { const o = []; for (const c of l) if (!o.some(p => Math.hypot(p.x - c.x, p.z - c.z) < gap)) o.push(c); return o; };
  if (spaced(cands).length < POOL.few) cands.push(...scan(POOL.shelf[0], POOL.shelf[1], true));
  const picked = [];
  // V3: the TOWN's own pool — the candidate nearest the town's middle among those a road passes (the gate road, the
  // bridge, the quay); with no road by the water, simply the nearest. One per town, always open, anyone may fish it.
  if (town) {
    const d = c => Math.hypot(c.shore.x - town.x, c.shore.z - town.z);
    const near = cands.filter(c => d(c) <= POOL.townReach);
    // nearest first; a pool a road passes is worth walking 120 m further for, not more
    const cost = c => d(c) + (c.road <= POOL.townRoadM ? 0 : 120);
    const best = near.sort((a, b) => cost(a) - cost(b) || a.z - b.z || a.x - b.x)[0];
    if (best) { best.town = town.name; best.always = true; best.fromTown = Math.round(d(best)); picked.push(best); }
  }
  for (const c of cands) {
    if (picked.length >= POOL.max) break;
    if (picked.some(p => Math.hypot(p.x - c.x, p.z - c.z) < gap)) continue;
    picked.push(c);
  }
  // play-test 12 (#81): a zone whose only reachable water is one cove or one stretch of river (the regenerated Gorse March
  // meets the sea in cliffs) spaces its pools closer rather than offering a single one — down to 25 m, until it has POOL.minPools
  for (const g2 of [gap / 2, 25]) {
    if (picked.length >= POOL.minPools) break;
    for (const c of cands) {
      if (picked.length >= POOL.minPools) break;
      if (picked.includes(c) || picked.some(p => Math.hypot(p.x - c.x, p.z - c.z) < g2)) continue;
      picked.push(c);
    }
  }
  // V3: "more spots along rivers" — where a road runs beside the water or crosses it, pools sit closer together
  let extra = 0;
  for (const c of cands) {
    if (extra >= POOL.roadMax) break;
    if (c.road > POOL.roadM || picked.some(p => Math.hypot(p.x - c.x, p.z - c.z) < POOL.roadGap)) continue;
    c.byRoad = true; picked.push(c); extra++;
  }
  // tiers: beside a road = 1; a walk away = 2 (one in three stays 1 so there is always something for a beginner);
  // the far ones = 3 from a zone whose band reaches level 5, else 2
  for (const p of picked) {
    const h = hash(F.wid + ':' + p.x + ':' + p.z) % 3;
    p.tier = p.town || p.road <= POOL.roadside ? 1 : p.road <= POOL.far ? (h !== 2 ? 1 : 2) : (band[1] >= 5 && h !== 0 ? 3 : 2);
  }
  // every zone keeps something a beginner may fish: at least a quarter of its pools (and never fewer than two) are tier 1,
  // the ones nearest a road first (`picked` is in that order)
  // (V3: 174 of the first 308 needed angling 25 or 50 — a newcomer saw ripples he could not use. Now at least
  // POOL.tier1Share of a zone's pools are tier 1.)
  const want = Math.min(picked.length, Math.max(2, Math.ceil(picked.length * POOL.tier1Share)));
  for (const p of picked.slice().sort((a, b) => a.road - b.road)) { if (picked.filter(q => q.tier === 1).length >= want) break; p.tier = 1; }
  return { reach, waterOf, cands: cands.length, pools: picked };
}

/** Where a town's angler stands: the reachable bank nearest the town centre, outside the buildings; else the town's edge. */
function anglerSpot(F, reach, town, taken, reachM = ANGLER.reach) {
  let best = null;
  for (let z = Math.max(4, Math.round((town.z - reachM) / 4) * 4); z <= Math.min(ZM - 4, town.z + reachM); z += 4) for (let x = Math.max(4, Math.round((town.x - reachM) / 4) * 4); x <= Math.min(ZM - 4, town.x + reachM); x += 4) {
    const d = Math.hypot(x - town.x, z - town.z);
    if (d > reachM || (best && d >= best.d)) continue;
    if (!bank(F, reach, x, z, 0) || (F.bits[F.idx(x, z)] & NAV.ROAD)) continue;
    // water within 6 m, in a direction we can name (the angler faces it)
    let face = null;
    for (let a = 0; a < 16 && !face; a++) { const wx = x + Math.cos(a / 16 * 6.283) * 5, wz = z + Math.sin(a / 16 * 6.283) * 5; if (F.t.waterAt(wx, wz).depth >= 0.3) face = { x: wx, z: wz }; }
    if (!face || taken.some(p => Math.hypot(p.x - x, p.z - z) < 4)) continue;
    best = { x, z, d, yaw: +Math.atan2(face.x - x, face.z - z).toFixed(2), water: true };
  }
  if (best || reachM !== ANGLER.reach) return best;
  for (let r = (town.r || 60) - 8; r >= 10; r -= 6) for (let a = 0; a < 24; a++) {
    const x = Math.round(town.x + Math.cos(a / 24 * 6.283) * r), z = Math.round(town.z + Math.sin(a / 24 * 6.283) * r);
    const k = F.idx(x, z), b = F.bits[k];
    if (reach[k] && !(b & (NAV.BUILDING | NAV.SOLID | NAV.ROAD | NAV.SHALLOW | NAV.DEEP)) && !taken.some(p => Math.hypot(p.x - x, p.z - z) < 4)) return { x, z, d: r, yaw: 0, water: false };
  }
  return null;
}

export function buildPools(prov = PROV) {
  const sheet = readJ(`data/provinces/${prov}.json`);
  const map = readJ('data/world/province-map.json').provinces[prov].map;
  const angling = provinceDataSync(readJ, prov, 'angling');
  angling.anglers ||= []; angling.legends ||= [];      // another province without its own anglers: none
  const out = { zones: {}, meta: {}, anglers: [] }, problems = [];
  // reachable = on foot from the province hub over every zone stitched together (a far bank reached through a neighbour counts)
  const navs = Object.fromEntries(Object.entries(map).map(([eid, wid]) => [eid, parseNav(readFileSync(P(`data/zones/${wid}/nav.bin`)))]));
  const se = sheet.grid.start, hubTown = readJ(`data/vignettes/placements/${map[se]}.json`).settlements.find(s => s.name === sheet.zones[se].town);
  const PC = provinceComponents(Object.keys(map).map(eid => ({ eid, gx: sheet.zones[eid].grid[0], gy: sheet.zones[eid].grid[1], nav: navs[eid] })), { gx: sheet.zones[se].grid[0], gy: sheet.zones[se].grid[1], x: hubTown.x, z: hubTown.z });
  const reachOf = eid => { const S = navs[eid].size, r = new Uint8Array(S * S), [gx, gy] = sheet.zones[eid].grid;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (PC.label[(gy * PC.n + j) * PC.W + gx * PC.n + i] === PC.main) r[j * S + i] = 1; return r; };
  for (const [eid, wid] of Object.entries(map)) {
    const zs = sheet.zones[eid], main = readJ(`data/vignettes/placements/${wid}.json`);
    const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number), ox = zx * ZM, oz = zy * ZM;
    const town = main.settlements.find(s => s.name === zs.town) || main.settlements.find(s => s.kind !== 'hamlet') || main.settlements[0];
    const F = zoneFacts(wid);
    const R = poolsForZone(F, { hub: town, archetype: zs.archetype, band: zs.band, gap: eid === 'test' ? POOL.startGap : POOL.gap, eid, reach: reachOf(eid), town });
    const who = angling.anglers.find(a => a.zone === eid);
    let spot = null;
    if (who) {
      // V3: the angler stands BY the town's pool (4-60 m along the bank from it) and points at it; with no pool in
      // reach of the town (Last Lantern: the Scar is dry) they keep to the town's edge
      const tp = R.pools.find(p => p.town), others = main.placements.filter(p => p.type === 'npc');
      if (tp) { spot = anglerSpot(F, R.reach, { x: tp.shore.x, z: tp.shore.z }, [...others, { x: tp.shore.x, z: tp.shore.z }], ANGLER.toPool); if (spot) spot.d = Math.round(Math.hypot(spot.x - town.x, spot.z - town.z)); }
      spot ||= anglerSpot(F, R.reach, town, others);
      if (!spot) problems.push(`${eid}: no spot for ${who.id}`);
    }
    const pools = R.pools.map((p, i) => ({ id: `pool_${wid}_${i + 1}`, x: p.x + ox, z: p.z + oz, shore: { x: p.shore.x + ox, z: p.shore.z + oz }, water: p.water, band: zs.band, tier: p.tier, road: p.road, ...(p.shelf ? { shelf: true } : {}), ...(p.byRoad ? { byRoad: true } : {}), ...(p.town ? { town: p.town, always: true, fromTown: p.fromTown } : {}) }));
    // the start pool: the tier-1 pool nearest the Torborhold angler; if none is close, the nearest pool becomes tier 1
    if (eid === 'test' && spot) {
      const near = pools.map(p => ({ p, d: Math.hypot(p.shore.x - (spot.x + ox), p.shore.z - (spot.z + oz)) })).sort((a, b) => a.d - b.d);
      const pick = near.find(n => n.p.town) || near.find(n => n.p.tier === 1 && n.d <= ANGLER.startPool) || near[0];      // the first quest's pool IS Torborhold's own
      if (!pick || pick.d > ANGLER.startPool) problems.push(`test: no pool within ${ANGLER.startPool} m of the angler (nearest ${pick ? Math.round(pick.d) : 'none'})`);
      if (pick) { pick.p.tier = 1; pick.p.start = true; pick.p.always = true; }
    }
    const legend = angling.legends.find(l => l.zone === eid), kinds = [...new Set(pools.map(p => p.water))].sort();
    if (legend && pools.length && !kinds.includes(legend.water)) problems.push(`${eid}: its legend ${legend.id} wants ${legend.water} water, the zone has ${kinds.join('/') || 'none'}`);
    if (legend && !pools.length && !legend.foundIn) problems.push(`${eid}: no water at all, and its legend ${legend.id} names no \`foundIn\` zone`);
    if (legend && legend.foundIn) { const there = out.zones[map[legend.foundIn]]; if (there && !there.some(p => p.water === legend.water)) problems.push(`${eid}: legend ${legend.id} is found in ${legend.foundIn}, which has no ${legend.water} pool`); }
    out.zones[wid] = pools;
    out.meta[wid] = { sheet: eid, name: zs.name, band: zs.band, live: pools.length ? Math.min(pools.length, Math.max(2, Math.ceil(pools.length * 0.6), pools.filter(p => p.tier === 1).length + Math.ceil(pools.filter(p => p.tier > 1).length / 2))) : 0, water: R.waterOf, kinds, candidates: R.cands,
      // (live = every beginner pool and half of the better ones: something to grow into is always in sight)
      roadside: pools.filter(p => p.road <= POOL.roadside).length, townPool: (pools.find(p => p.town) || {}).id || null, tiers: [1, 2, 3].map(t => pools.filter(p => p.tier === t).length) };
    if (who && spot) out.anglers.push({ id: who.id, name: who.name, town: who.town, sheet: eid, zone: wid, x: spot.x + ox, z: spot.z + oz, yaw: spot.yaw, byWater: spot.water, fromTown: Math.round(spot.d),
      ...(() => { const near = pools.map(p => ({ p, d: Math.hypot(p.shore.x - (spot.x + ox), p.shore.z - (spot.z + oz)) })).sort((a, b) => a.d - b.d);
        const mine = near.find(n => n.p.town) || near[0] || null;
        if (!mine) return { pool: null, toPool: null, points: 'No water for a mile, and what there was the blight drank. Sell me what you bring from elsewhere.' };
        const dx = mine.p.x - (spot.x + ox), dz = mine.p.z - (spot.z + oz), dir = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][Math.round(Math.atan2(dz, dx) / (Math.PI / 4) + 8) % 8];
        const m = Math.round(mine.d);
        return { pool: mine.p.id, toPool: m, points: m <= 80 ? `See the ripples, just ${dir} of where I'm standing? That's the town pool. It never fishes out.` : `The nearest pool is about ${Math.round(m / 10) * 10} paces ${dir} of here. Look for the ripples.` }; })() });
  }
  return { out, problems, angling };
}

function write(file, text) {
  let old = null; try { old = readFileSync(P(file), 'utf8'); } catch { /* new */ }
  if (old === text) return 0;
  if (!CHECK) writeFileSync(P(file), text);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  requireProvince(process.argv);
  const { out, problems, angling } = buildPools();
  let changed = 0;
  const total = Object.values(out.zones).reduce((a, l) => a + l.length, 0);
  changed += write(provinceDataPath(PROV, 'angling-pools'), JSON.stringify({
    _doc: 'Stream E (play-test 5 T25 Angling) — MADE by tools/content-pools.mjs from stream B\'s baked water; do not edit by hand. `zones.<world zone>` = every fish-pool spot of that zone, WORLD metres: `x, z` in the water (where the ripples are drawn and the bobber lands), `shore` = a dry point a walker can reach, 3-11 m from it (stand there and cast), `water` river | lake | marsh | coast (what the catch table is rolled on), `band` = the zone\'s level band, `tier` 1 | 2 | 3 (C\'s fishing.pool(tier): skill 0 / 25 / 50), `road` = metres from the shore point to the nearest road (roadside pools are tier 1). `start: true` + `always: true` = the first quest\'s pool by Torborhold: always open, never fished out. `meta.<zone>.live` = how many of the listed spots are open at once (a pool closes after C\'s `catches` and another listed spot opens); `meta.<zone>.water` = what each BAKED water kind (terrain waterAt().kind: river / lake / sea) counts as in that zone, for a cast outside any pool. `anglers[]` = where each town\'s angler stands (world metres; tools/content-hunts.mjs copies them into <zone>.quest.json as npc records, role `angler`; their shop is shops.json kinds.angler).',
    pools: total, ...out }, null, 1) + '\n');
  // the anglers as NPCs of their zone's quest file (greeting + role; the Torborhold one lives in data/quests/angling.json)
  for (const a of out.anglers) {
    const def = angling.anglers.find(x => x.id === a.id);
    const file = a.sheet === 'test' ? 'data/quests/angling.json' : `data/quests/${a.sheet}.json`;
    let doc; try { doc = readJ(file); } catch { continue; }
    doc.npcs ||= {};
    doc.npcs[a.id] = { name: def.name, role: 'angler', at: def.town, greeting: def.greeting + ' ' + a.points, placedBy: 'content-pools', ...(doc.npcs[a.id] && 'titled' in doc.npcs[a.id] ? { titled: doc.npcs[a.id].titled } : {}) };   // W27: tools/content-givers.mjs owns `titled`
    if (a.sheet === 'test') {
      const start = out.zones[a.zone].find(p => p.start);
      for (const q of doc.quests || []) for (const st of q.steps || []) if (st.pool === 'start' || st.startPool) { st.startPool = true; if (start) st.at = { x: start.shore.x, z: start.shore.z, r: 14, name: 'the fish pool' }; }
    }
    changed += write(file, JSON.stringify(doc, null, 2) + '\n');
  }
  for (const [wid, m] of Object.entries(out.meta)) console.log(`${wid} ${m.sheet.padEnd(18)} pools ${String(out.zones[wid].length).padStart(2)} (live ${m.live}, roadside ${m.roadside}, tiers ${m.tiers.join('/')}) ${m.kinds.join(',') || 'DRY'}`);
  for (const a of out.anglers) console.log(`angler ${a.id.padEnd(22)} ${a.byWater ? 'on the bank' : 'IN TOWN (no water in reach)'} ${a.fromTown} m from ${a.town}'s middle; ${a.pool ? 'town pool ' + a.toPool + ' m away' : 'NO POOL'}`);
  console.log(`pools: ${total} in ${Object.keys(out.zones).length} zones; anglers ${out.anglers.length}; ${changed} file(s) ${CHECK ? 'would change' : 'written'}`);
  if (problems.length) { console.log('PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(2); }
  if (CHECK && changed) process.exit(1);
}
