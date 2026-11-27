// Oathwild — rebuild the world after an edit, the same way on the server and in the browser (map editor, 2026-11-26).
// Pure apart from what it is handed (no files, no sockets, no DOM).
//
//   const S = worldScene(W)                          → scattered { trees, decor, report } with the edit layer + town trees
//   const fresh = await rebuildWorld(W.pristine, { map, edits, regions })   a new W from untouched data + the new files
//   swapInto(W, fresh)                               puts the new world INTO the old objects, so everything holding
//                                                    W, W.terrain, W.town, W.book or W.data.placements sees it at once
//
// `pristine` = the world data as it was loaded (bootWorld changes placements and NPC spots in place, so a rebuild always
// starts again from a clean copy: a move keyed by where place-world put a prop must find it there).
import { bootWorld } from './boot.js';
import { scatter, keepOuts, TREE_SPECIES, decorInfo } from './scatter.js';
import { sceneryWithEdits } from './edits.js';

const clone = o => JSON.parse(JSON.stringify(o));

/** Trees and decor for W with the editor's layer applied (W.town.trees loses the trees removed by hand). */
export function worldScene(W) {
  return sceneryWithEdits(W, { scatter, keepOuts, species: TREE_SPECIES, decorInfo });
}

export async function rebuildWorld(pristine, { map = null, edits = null, regions }) {
  const data = clone(pristine);
  if (map) data.map = clone(map);
  if (edits) data.edits = clone(edits);
  return bootWorld({ regions, data });
}

/** Copy every field of `from` onto `into` (same object, new contents); drops fields `from` does not have. */
function refill(into, from) {
  if (!into || !from || into === from) return into || from;
  for (const k of Object.keys(into)) if (!(k in from)) delete into[k];
  Object.assign(into, from);
  return into;
}
export function swapInto(W, fresh) {
  refill(W.terrain, fresh.terrain);
  if (W.town && fresh.town) refill(W.town, fresh.town); else W.town = fresh.town;
  refill(W.book, fresh.book);
  // data: same object; placements and npcs refilled in place (the world room keeps a handle on placements)
  for (const k of Object.keys(fresh.data)) {
    if ((k === 'placements' || k === 'npcs') && W.data[k] && typeof W.data[k] === 'object') refill(W.data[k], fresh.data[k]);
    else W.data[k] = fresh.data[k];
  }
  W.editOrphans = fresh.editOrphans;
  W.pristine = fresh.pristine;
  return W;
}
export { refill };
