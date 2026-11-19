// Round 7 city layouts (owner 2026-11-18: "the simple grid city we have right now is redundant … Add a variety of map
// layouts so it doesn't feel as repetitive"). makeCityMap({ layout }) hands a city district to one of these; 'grid' is
// the original street grid (citymap.js, unchanged for the same seed). Each layout lives in js/sim/layouts/ and builds
// on layouts/kit.js; its map carries `city: { layout, ground, streets, bands, … }` for the ground drawing
// (render/city-ground.js), the minimap and the briefing map.
//
// Contracts pick a layout from their district type's pool by their own map seed (layoutFor), so the board shows a mix
// and the co-op server, rebuilding the same contract, gets the same layout. Story missions name theirs in
// data/missions.json (`map.layout`).
import { makeKit } from './layouts/kit.js';
import { canal } from './layouts/canal.js';
import { ring } from './layouts/ring.js';
import { park } from './layouts/park.js';
import { oldtown } from './layouts/oldtown.js';
import { railyard } from './layouts/railyard.js';
import { harbour } from './layouts/harbour.js';
import { megablock } from './layouts/megablock.js';

/** Every layout: a plain name for the board and briefing, a line about it, and which district types it suits (w = how
 *  often a contract there picks it). */
export const LAYOUTS = {
  grid: { label: 'Street grid', line: 'Straight streets and square blocks.', fits: { downtown: 3, residential: 3, industrial: 3 } },
  canal: { label: 'Canal quarter', line: 'A deep canal splits the district; bridges are the only ways across.', fits: { downtown: 2, residential: 2, industrial: 1 }, make: canal, salt: 211 },
  ring: { label: 'Ring plaza', line: 'A round plaza in the middle, a ring road and avenues out like spokes.', fits: { downtown: 2, residential: 1, industrial: 1 }, make: ring, salt: 223 },
  park: { label: 'City park', line: 'A big park in the middle: lawns, trees, a pond and open ground to fight on.', fits: { downtown: 1, residential: 2 }, make: park, salt: 227 },
  oldtown: { label: 'Old town', line: 'Narrow crooked lanes, small houses and little squares.', fits: { downtown: 1, residential: 2 }, make: oldtown, salt: 229 },
  railyard: { label: 'Rail yard', line: 'Tracks across the middle, freight trains to hide behind, a station.', fits: { industrial: 2, downtown: 1 }, make: railyard, salt: 233 },
  harbour: { label: 'Harbour front', line: 'Docks along the sea: piers, cranes and container stacks.', fits: { industrial: 2, downtown: 1 }, make: harbour, salt: 239 },
  megablock: { label: 'Megablocks', line: 'A few giant towers on podiums with wide plazas between.', fits: { downtown: 2, residential: 1 }, make: megablock, salt: 241 },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);
/** ' · Canal quarter' for a mission on a non-grid layout, '' otherwise (the board's cards and the briefing). */
export const layoutTag = map => (map?.layout && LAYOUTS[map.layout]?.make ? ` · ${LAYOUTS[map.layout].label}` : '');

/** The layouts a district type can have (grid first). */
export const layoutsFor = district => LAYOUT_IDS.filter(id => LAYOUTS[id].fits[district]);

/** A contract's layout, from its district type and its own map seed (same inputs → same layout, on the server too).
 *  Outdoor districts (forest, desert…) have their own generators: always 'grid' (ignored by makeCityMap there). */
export function layoutFor(district, seed) {
  const pool = layoutsFor(district); if (!pool.length) return 'grid';
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x5bd1e995) >>> 0; s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0; s ^= s >>> 13;
  const tot = pool.reduce((a, id) => a + LAYOUTS[id].fits[district], 0);
  let v = (s % 10007) / 10007 * tot;
  for (const id of pool) { v -= LAYOUTS[id].fits[district]; if (v < 0) return id; }
  return pool[0];
}

/** Build a city district with a non-grid layout. Called by citymap.js makeCityMap. */
export function makeLayoutMap({ seed, w, h, district, layout, D, FLOOR, STYLES }) {
  const L = LAYOUTS[layout]; if (!L?.make) throw new Error(`unknown city layout ${layout}`);
  const K = makeKit({ seed, w, h, district, D, FLOOR, STYLES, layout, salt: L.salt });
  return L.make(K);
}
