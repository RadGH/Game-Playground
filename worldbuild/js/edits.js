// World Build — stage 8, hand fixes: the map editor's edit layer (prototypes/oathwild/data/edits.json, written by the
// editor at prototypes/oathwild/editor/) laid over the generated world, so a re-run keeps every fix that still has
// something to fix. The format and the apply rules are the EDITOR'S OWN (prototypes/oathwild/js/world/edits.js) — this
// file only says when in the pipeline each part is applied:
//
//   ground   [{ id, kind: raise|lower|flatten|smooth, at, r, amount, y? }]   applied to the raw 2 m ground right after
//            Shape builds it and before rivers, places and roads are cut in (as the game does: roads stay graded and
//            bridges meet them). Inside the pinned piece, Oathwild's createTerrain applies the same strokes itself.
//   trees    { remove: ['t<x·10>_<z·10>'…], add: [{ id, art, at, scale, rot }…], areas: [{ id, at, r, density, mode }…] }
//   decor    { remove: ['d<x·10>_<z·10>'…], add: [{ id, art, at, scale, rot }…] }
//            applied per tile with the editor's sceneryWithEdits() (same area brush, same trees); a generated tree's id
//            is where it stands (tenths of a metre), so the same seed gives the same ids and a removal keeps meaning
//            the same tree after a re-run
//   moves    { 'places:<place id>': { at } }   a generated place moved by hand — applied after Places, before Roads, so
//            its path follows it. Other groups (buildings:, camps:, npcs: …) belong to the pinned map's placements and
//            are the game's business: carried, not applied here.
//   zones, looks, notes   the game's own (colour looks, effect zones, note pins): carried, never applied here.
//   Roads, rivers and bridges of the pinned map are hand data in its map.json (the editor edits them there); for the
//   generated world the brief is where they change.
// An edit whose target is gone after a re-run (a tree no longer grown, a place no longer made, a stroke off the map) is
// listed in the report's "left over" list — never dropped without a word — and stays in the file.
//
//   readEdits(json)            → the editor's normalised shape (normEdits)
//   applyGround(W, E)          after the 2 m ground is made (shape.js calls it)
//   applyMoves(W, E)           after stage 4
//   leftovers(W, E)            after the trees are counted → [{ kind, id, text }]

import { normEdits, applyGroundStrokes, treeId as gameTreeId, decorId as gameDecorId } from '../../prototypes/oathwild/js/world/edits.js';

export const treeId = t => gameTreeId(t);
export const decorId = d => gameDecorId(d);

export function readEdits(json) { return json ? normEdits(json) : null; }

/** Ground strokes on the generated 2 m ground (the pinned vertices keep their own values: createTerrain applied them). */
export function applyGround(W, E) {
  const left = [];
  const B = W.bounds;
  const strokes = [];
  for (const s of E.ground) {
    if (!Array.isArray(s.at) || s.at[0] < B.minX || s.at[0] > B.maxX || s.at[1] < B.minZ || s.at[1] > B.maxZ) { left.push({ kind: 'ground', id: s.id, text: `ground stroke ${s.id || '?'} is off the map` }); continue; }
    strokes.push(s);
  }
  if (!strokes.length) return left;
  const keepVals = [];
  if (W.pin) for (let j = 0; j < W.N; j++) if (W.keep[j]) keepVals.push(j, W.H[j]);
  applyGroundStrokes(W.H, { nx: W.nx, nz: W.nz, cell: W.cell, minX: B.minX, minZ: B.minZ }, strokes);
  for (let q = 0; q < keepVals.length; q += 2) W.H[keepVals[q]] = keepVals[q + 1];
  return left;
}

/** 'places:<id>' moves (a generated place moved by hand). */
export function applyMoves(W, E) {
  const left = [];
  for (const [key, mv] of Object.entries(E.moves || {})) {
    if (!key.startsWith('places:')) continue;
    const id = key.slice(7), p = W.places[id];
    if (!p) { left.push({ kind: 'place', id, text: `moved place "${id}" is not in this world` }); continue; }
    if (p.pinned) { left.push({ kind: 'place', id, text: `"${p.name}" belongs to the hand-made map (move it in its map.json)` }); continue; }
    if (Array.isArray(mv.at)) p.at = [mv.at[0], mv.at[1]];
  }
  return left;
}

/** Removals that matched nothing in any tile (W._editSeen is filled by detail.js as tiles are made). */
export function leftovers(W, E) {
  const seen = W._editSeen || new Set();
  const out = [];
  for (const id of E.trees.remove) if (!seen.has(id) && !E.trees.add.some(t => t.id === id)) out.push({ kind: 'tree', id, text: `removed tree ${id}: no tree stands there any more` });
  for (const id of E.decor.remove) if (!seen.has(id)) out.push({ kind: 'decor', id, text: `removed piece ${id}: nothing lies there any more` });
  return out;
}
