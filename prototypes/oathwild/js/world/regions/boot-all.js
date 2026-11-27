// Oathwild — boot every region of the world once (the server at start, the tests' harness): each region's place
// (W + its ground check) and ONE world quest book shared by them all (js/world/regions/books.js). Pure apart from
// reading files through js/world/boot.js readJson. The page boots regions one at a time instead (js/client/place.js)
// and gets the world book from js/world/regions/books.js loadWorldBook.
//
//   const { index, places } = await bootAllRegions({ regions, home: { W, ground } })
//   places = { ashfield: { W, ground }, catacombs: { W, ground } }   (the home region is not in it — it is W / ground)
import { loadRegionIndex, bootRegion, homeRegion } from './index.js';
import { worldBooks, emptyBook } from './books.js';
import { worldScene } from '../live.js';
import { createGround } from '../../game/ground.js';

export async function bootAllRegions({ regions, home, index = null }) {
  index = index || await loadRegionIndex();
  const HOME = homeRegion(index);
  const places = {};
  for (const id of Object.keys(index.regions)) {
    if (id === HOME) continue;
    const W = await bootRegion(id, { index, regions });
    // a dungeon has no outdoor scatter (trees, bushes, rocks by bridges): its pieces are in its own plan
    const scattered = W.dungeon ? { trees: [], decor: [], report: { orphans: [] } } : worldScene(W);
    scattered.trees.push(...(W.town?.trees || []));
    const ground = W.makeGround ? W.makeGround(scattered) : createGround(W.terrain, W.data.placements, scattered, W.town);
    places[id] = { W, ground, scattered };
  }
  // one quest book for the world: every room (and the page) knows every quest; people and objects stay in their region
  const books = worldBooks({ [HOME]: home.W.book, ...Object.fromEntries(Object.entries(places).map(([id, P]) => [id, P.W.book || emptyBook()])) });
  home.W.book = books[HOME];
  for (const [id, P] of Object.entries(places)) P.W.book = books[id];
  return { index, places };
}
