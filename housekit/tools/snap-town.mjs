// House Kit: save the houses Oathwild's town planner makes (Larkford) as "house snapshots" — the plan record and its
// context as plain numbers, exactly what the game hands the kit (js/describe.js houseInput). The review page lists them
// under "a house from Larkford"; tests/same-house.test.mjs fails when this file falls behind the planner.
//   node housekit/tools/snap-town.mjs [town]       → housekit/data/<town>.json
import { readFileSync, writeFileSync } from 'node:fs';
import { createTerrain } from '../../prototypes/oathwild/js/world/terrain.js';
import { planTowns } from '../../prototypes/oathwild/js/world/town.js';
import { houseInput } from '../js/describe.js';

export function snapTown(town = 'larkford') {
  const J = p => JSON.parse(readFileSync(new URL('../../prototypes/oathwild/data/' + p, import.meta.url), 'utf8'));
  const T = createTerrain(J('map.json'));
  const P = planTowns(T, J('towns.json'), { placements: J('placements.json'), npcs: J('npcs.json').npcs });
  const houses = P.houses.filter(h => h.town === town).map(h => houseInput(h, { yards: P.yards, heightAt: (x, z) => T.heightAt(x, z) }));
  return { _doc: `Oathwild ${town} houses as the game hands them to the House Kit (written by tools/snap-town.mjs — do not edit).`, town, houses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const town = process.argv[2] || 'larkford';
  const out = snapTown(town);
  writeFileSync(new URL(`../data/${town}.json`, import.meta.url), JSON.stringify(out) + '\n');
  console.log(`${out.houses.length} houses → housekit/data/${town}.json`);
}
