// A city district for a mission, from a seed: a street grid, blocks packed with City Kit buildings (the same recipe ids
// and params the renderer bakes), fuel depots that blow up, open plazas to fight in. Pure, so the co-op server and
// every player build the identical map from the same seed.
//
// Heights: a storey is citykit's FLOOR (0.22 tiles ≈ 3.5 m); a mech is ~0.75 tiles tall, so a two-storey shop row is a
// roof you can jump onto and a 30-storey tower is a wall of glass nine mechs high.
import { makeRng } from './rng.js';
import { makeMoonMap, MOON_DISTRICT } from './moonmap.js';   // round 5: the moon outpost (its own generator)
import { makeForestMap, FOREST_DISTRICT } from './forestmap.js';   // Pinewatch: the pine forest (its own generator)
import { makeSnowMap, SNOW_DISTRICT } from './snowmap.js';   // round 6: Frostline, the snowfield station (its own generator)
import { makeDesertMap, DESERT_DISTRICT } from './desertmap.js';   // Red Mesa: the desert badlands (its own generator)
import { makeLayoutMap, LAYOUTS } from './citylayouts.js';   // round 7: canal, ring, park, old town, rail yard, harbour, megablocks

export const FLOOR = 0.22;
/** City Kit building styles (citykit/js/kit/materials.js STYLE_IDS — copied here so the rules need no three.js). */
export const STYLES = ['chrome', 'pearl', 'copper', 'concrete'];

/** District styles: which buildings fill the blocks and how tall they grow. weight = how often picked. */
export const DISTRICTS = {
  downtown: { label: 'Downtown', street: 2, block: [6, 8], plaza: 0.18, fuel: 0.05, lots: [
    { recipe: 'com-office', size: [2, 2], floors: [8, 18], w: 2 }, { recipe: 'com-hotel', size: [2, 2], floors: [4, 12], w: 2 },
    { recipe: 'res-tower', size: [2, 2], floors: [12, 20], w: 0.6 }, { recipe: 'com-shops', size: [2, 1], floors: [1, 3], w: 3 },
    { recipe: 'res-slim', size: [1, 1], floors: [4, 9], w: 2 }, { recipe: 'com-market', size: [1, 1], floors: [1, 1], w: 2, low: 0.25 },
    { recipe: 'res-midrise', size: [2, 1], floors: [4, 8], w: 2 } ] },
  residential: { label: 'Residential', street: 1, block: [5, 7], plaza: 0.22, fuel: 0.03, lots: [
    { recipe: 'res-terrace', size: [2, 1], floors: [2, 4], w: 3 }, { recipe: 'res-block', size: [2, 2], floors: [4, 10], w: 2 },
    { recipe: 'res-townhouse', size: [1, 1], floors: [2, 3], w: 3 }, { recipe: 'res-pods', size: [1, 1], floors: [1, 2], w: 2 },
    { recipe: 'res-walkup', size: [2, 2], floors: [2, 4], w: 2 }, { recipe: 'com-shops', size: [2, 1], floors: [1, 2], w: 1 } ] },
  industrial: { label: 'Industrial', street: 2, block: [6, 9], plaza: 0.15, fuel: 0.16, lots: [
    { recipe: 'ind-workshop', size: [2, 2], floors: [1, 2], w: 3 }, { recipe: 'ind-depot', size: [3, 2], floors: [1, 1], w: 2, h: 0.5 },
    { recipe: 'ind-refinery', size: [2, 2], floors: [1, 1], w: 2, h: 0.9, explosive: 1400 }, { recipe: 'ind-freight', size: [2, 2], floors: [1, 1], w: 2, h: 0.55 },
    { recipe: 'ind-chemworks', size: [2, 1], floors: [1, 1], w: 2, h: 0.6, explosive: 900 }, { recipe: 'ind-printworks', size: [1, 1], floors: [1, 2], w: 2 } ] },
  moon: MOON_DISTRICT,   // round 5: not a city block at all — makeCityMap hands it to moonmap.js
  forest: FOREST_DISTRICT,   // Pinewatch: woods, river and dam, logging camp — makeCityMap hands it to forestmap.js
  snow: SNOW_DISTRICT,   // round 6: the snowfield — makeCityMap hands it to snowmap.js
  desert: DESERT_DISTRICT,   // Red Mesa: open badlands — makeCityMap hands it to desertmap.js
};

const pickW = (R, list) => { const tot = list.reduce((s, x) => s + (x.w || 1), 0); let v = R.next() * tot; for (const x of list) { v -= x.w || 1; if (v <= 0) return x; } return list[0]; };

/**
 * @param {{ seed: number, w?: number, h?: number, district?: keyof DISTRICTS, mix?: string[], layout?: string }} o
 *   layout (round 7): 'grid' (default — this street grid, the same map for the same seed as before) or one of
 *   citylayouts.js LAYOUTS; a layout the district doesn't suit still builds (the board never offers one).
 * @returns {{ w, h, lots, roads: Array<[x, z, w, d]>, plazas: Array<[x, z, w, d]>, start: {x, z}, extract: {x, z, r}, edges }}
 */
export function makeCityMap({ seed, w = 40, h = 40, district = 'downtown', mix = null, layout = 'grid' }) {
  if (DISTRICTS[district]?.moon) return makeMoonMap({ seed, w, h });     // round 5: the moon outpost
  if (DISTRICTS[district]?.forest) return makeForestMap({ seed, w, h });  // Pinewatch: the pine forest
  if (DISTRICTS[district]?.snow) return makeSnowMap({ seed, w, h });     // round 6: the snowfield
  if (DISTRICTS[district]?.desert) return makeDesertMap({ seed, w, h }); // Red Mesa: the desert badlands
  if (layout && layout !== 'grid' && LAYOUTS[layout]) return makeLayoutMap({ seed, w, h, district, layout, D: DISTRICTS[district], FLOOR, STYLES });
  const R = makeRng(seed);
  const D = DISTRICTS[district];
  const occ = new Uint8Array(w * h);            // 0 free, 1 road, 2 building, 3 plaza (kept open)
  const set = (x, z, v) => { if (x >= 0 && z >= 0 && x < w && z < h) occ[z * w + x] = v; };
  const free = (x, z, sw, sd) => { for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) if (i < 0 || j < 0 || i >= w || j >= h || occ[j * w + i]) return false; return true; };
  const roads = [], plazas = [], lots = [];

  // street grid: lines of road every block-length, the first and last a block in from the map edge
  const lines = (len) => { const out = []; let p = 1 + R.int(0, 2); while (p < len - 3) { out.push(p); p += D.street + R.int(D.block[0], D.block[1]); } return out; };
  const xs = lines(w), zs = lines(h);
  for (const x of xs) { roads.push([x, 0, D.street, h]); for (let z = 0; z < h; z++) for (let k = 0; k < D.street; k++) set(x + k, z, 1); }
  for (const z of zs) { roads.push([0, z, w, D.street]); for (let x = 0; x < w; x++) for (let k = 0; k < D.street; k++) set(x, z + k, 1); }

  // the start (a plaza near one corner) and the extraction (a plaza near the far corner) stay open
  const openArea = (cx, cz, r) => { plazas.push([cx - r, cz - r, r * 2, r * 2]); for (let z = cz - r; z < cz + r; z++) for (let x = cx - r; x < cx + r; x++) if (occ[z * w + x] !== 1) set(x, z, 3); };
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  openArea(4, h - 5, 3); openArea(w - 5, 4, 3);

  // blocks: walk every free tile; place the biggest lot that fits from the district's list
  const plazaAt = new Set();
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (occ[z * w + x]) continue;
    // whole open plazas now and then (room to fight a swarm)
    if (R.chance(D.plaza * 0.06) && free(x, z, 3, 3)) { plazas.push([x, z, 3, 3]); for (let j = z; j < z + 3; j++) for (let i = x; i < x + 3; i++) set(i, j, 3); continue; }
    let pick = null;
    for (let tries = 0; tries < 6 && !pick; tries++) {
      const c = pickW(R, mix ? mix.flatMap(d => DISTRICTS[d].lots) : D.lots);
      const turn = R.chance(0.5) && c.size[0] !== c.size[1];
      const sw = turn ? c.size[1] : c.size[0], sd = turn ? c.size[0] : c.size[1];
      if (free(x, z, sw, sd)) pick = { c, sw, sd, turn };
    }
    if (!pick) {
      if (R.chance(D.fuel)) pick = { c: { recipe: 'fuel-tanks', size: [1, 1], floors: [1, 1], h: 0.32, explosive: 1100, hp: 500 }, sw: 1, sd: 1 };
      else { set(x, z, 3); continue; }                           // a leftover tile stays open ground
    }
    const { c, sw, sd } = pick;
    const floors = R.int(c.floors[0], c.floors[1]);
    const height = c.h ?? (floors * FLOOR + 0.12);
    const hp = c.hp ?? Math.round(500 * sw * sd * (1 + Math.min(floors, 30) * 0.18));
    lots.push({ id: 'L' + lots.length, x, z, w: sw, d: sd, h: +height.toFixed(3), hp, recipe: c.recipe, params: { floors, seed: R.int(1, 9999), rot: pick.turn ? 1 : 0, style: STYLES[R.int(0, STYLES.length - 1)] }, explosive: c.explosive || 0 });
    for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) set(i, j, 2);
  }
  // every open area must reach the streets: carve a 2-wide lane from the start and the extraction to the nearest road,
  // removing any building in the way (a sealed plaza would leave a player where no enemy can reach and vice versa)
  const carve = (cx, cz) => {
    let best = null;
    for (const x of xs) { const d = Math.abs(x + D.street / 2 - cx); if (!best || d < best.d) best = { d, axis: 'x', at: x + D.street / 2 }; }
    for (const z of zs) { const d = Math.abs(z + D.street / 2 - cz); if (!best || d < best.d) best = { d, axis: 'z', at: z + D.street / 2 }; }
    if (!best) return;
    const lane = best.axis === 'x' ? [Math.min(cx, best.at) - 1, cz - 1, Math.abs(best.at - cx) + 2, 2] : [cx - 1, Math.min(cz, best.at) - 1, 2, Math.abs(best.at - cz) + 2];
    const hit = l => l.x < lane[0] + lane[2] && l.x + l.w > lane[0] && l.z < lane[1] + lane[3] && l.z + l.d > lane[1];
    for (let i = lots.length - 1; i >= 0; i--) if (hit(lots[i])) lots.splice(i, 1);
    plazas.push(lane);
  };
  carve(start.x, start.z); carve(extract.x, extract.z);
  lots.forEach((l, i) => { l.id = 'L' + i; });

  // spawn edges: road ends on the map border (enemies come in along the streets)
  const edges = [];
  for (const x of xs) { edges.push({ x: x + D.street / 2, z: 0.5 }); edges.push({ x: x + D.street / 2, z: h - 0.5 }); }
  for (const z of zs) { edges.push({ x: 0.5, z: z + D.street / 2 }); edges.push({ x: w - 0.5, z: z + D.street / 2 }); }
  return { w, h, lots, roads, plazas, start, extract, edges, district, seed };
}
