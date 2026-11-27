// World Build — the whole pipeline: brief → shape → regions & biomes → places → roads → detail → checks → hand fixes.
// Pure: no DOM, no files (the caller passes `read` for the brief's pinned files). The page runs it in a Web Worker,
// tools/build.mjs runs it in Node; same brief + same seed = the same world in both (tests/determinism.test.mjs).
//
//   const W = await runPipeline(rawBrief, { read, seed, edits, onStage(id, ms, W) })
//   W.stages     [{ id, label, ms }]                 how long each stage took
//   W.T          the world as a terrain object (terrain-api.js: Oathwild's terrain queries)
//   W.report     the checks (checks.js) + numbers + left-over edits
//   W.numbers    places by kind, road km, bridges, fords, trees, houses…
//
// The world object (built up stage by stage): brief, seed, bounds, cell (2 m), nx, nz, N, H (heights), water (surface,
// NaN = dry), wkind (0 none, 1 river, 2 marsh, 3 lake, 4 sea), keep (1 = pinned vertex), pin, macro (the 8 m grids:
// H, sea, lake, river, region, level, travel, wet, forest…), lakes, rivers, regionList, places, roads, crossings,
// bridges, fields, townDefs, townPlan, setPieces, areas.

import { loadBrief } from './brief.js';
import { buildPin } from './pin.js';
import { shapeWorld } from './shape.js';
import { regionWorld } from './regions.js';
import { placeWorld } from './places.js';
import { roadWorld } from './roads.js';
import { bakedTerrain } from './terrain-api.js';
import { detailWorld, countDetail } from './detail.js';
import { checkWorld } from './checks.js';
import { readEdits, applyMoves, leftovers } from './edits.js';
import { timer, fingerprint } from './core.js';

export const STAGES = Object.freeze([
  { id: 'brief', label: 'Brief', n: 1 },
  { id: 'shape', label: 'Shape', n: 2 },
  { id: 'regions', label: 'Regions & biomes', n: 3 },
  { id: 'places', label: 'Places', n: 4 },
  { id: 'roads', label: 'Roads', n: 5 },
  { id: 'detail', label: 'Detail', n: 6 },
  { id: 'checks', label: 'Checks', n: 7 },
  { id: 'edits', label: 'Hand fixes', n: 8 },
]);

export async function runPipeline(raw, { read, seed = null, edits = null, onStage = () => {} } = {}) {
  const t = timer();
  const stages = [];
  const done = async (id, W) => { const ms = t.lap(id); stages.push({ id, label: STAGES.find(s => s.id === id).label, ms }); await onStage(id, ms, W); };
  const rawSeeded = seed != null ? { ...raw, seed: Number(seed) >>> 0 } : raw;
  const brief = await loadBrief(rawSeeded, read);
  // the edit layer: the one passed in, else the pinned map's own (brief pin.edits); its ground strokes reach the pinned
  // piece through Oathwild's createTerrain and the new ground through shape.js
  const E = readEdits(edits ?? brief.pin?.data?.edits ?? null);
  const pin = buildPin(brief, E);
  let W = { brief, seed: brief.seed, pin, stages };
  await done('brief', W);
  W = shapeWorld(brief, pin, { edits: E }); W.stages = stages;
  await done('shape', W);
  regionWorld(W);
  await done('regions', W);
  placeWorld(W);
  const left = [...(W.editLeft || [])];
  if (E) left.push(...applyMoves(W, E));
  await done('places', W);
  roadWorld(W);
  await done('roads', W);
  W.allRivers = [...(W.pin ? W.pin.riverLines : []), ...W.rivers];
  const T = bakedTerrain(W);
  W.T = T;
  W.editLayer = E;
  detailWorld(W, T);
  const detail = countDetail(W, T);
  W.detail = detail;
  await done('detail', W);
  const report = checkWorld(W, T, detail);
  await done('checks', W);
  if (E) left.push(...leftovers(W, E));
  W.report = { ...report, leftovers: left, edits: E ? { treesRemoved: E.trees.remove.length, treesAdded: E.trees.add.length, treeAreas: E.trees.areas.length, decor: E.decor.remove.length + E.decor.add.length, ground: E.ground.length, moves: Object.keys(E.moves).length, zones: E.zones.length, notes: E.notes.length } : null };
  W.numbers = numbers(W, detail);
  W.fingerprint = fingerprint(W.H, W.water);
  await done('edits', W);
  return W;
}

export function numbers(W, detail) {
  const places = {};
  for (const p of Object.values(W.places)) { const k = p.kind; places[k] = (places[k] || 0) + 1; }
  const km = r => r.pts[r.pts.length - 1].s / 1000;
  const roadKm = { road: 0, trail: 0, boardwalk: 0 };
  const newRoadKm = { road: 0, trail: 0 };
  for (const r of W.roads) { roadKm[r.class] = (roadKm[r.class] || 0) + km(r); if (r.generated) newRoadKm[r.class] = (newRoadKm[r.class] || 0) + km(r); }
  const round1 = v => Math.round(v * 10) / 10;
  const riverKm = W.allRivers.reduce((s, r) => s + (r.pts[r.pts.length - 1].s - r.pts[0].s) / 1000, 0);
  return {
    sizeKm: [W.brief.width / 1000, W.brief.depth / 1000],
    regions: W.regionList.map(r => ({ id: r.id, name: r.name, levels: r.levels, theme: r.theme, pinned: !!r.pinned })),
    places, generatedPlaces: W.placeOrder.length,
    roadKm: Object.fromEntries(Object.entries(roadKm).map(([k, v]) => [k, round1(v)])),
    newRoadKm: Object.fromEntries(Object.entries(newRoadKm).map(([k, v]) => [k, round1(v)])),
    bridges: W.bridges.filter(b => b.kind === 'bridge').length, fords: W.bridges.filter(b => b.kind === 'ford').length,
    newBridges: W.bridges.filter(b => b.generated && b.kind === 'bridge').length, newFords: W.bridges.filter(b => b.generated && b.kind === 'ford').length,
    rivers: W.rivers.filter(r => r.kind === 'river').length + (W.pin ? W.pin.T.rivers.length : 0), streams: W.rivers.filter(r => r.kind === 'stream').length,
    riverKm: round1(riverKm), lakes: W.lakes.length,
    trees: detail.trees, giants: detail.giants, decor: detail.decor, medianTreeM: detail.medianH, treeSpecies: detail.bySpecies,
    houses: W.townPlan.houses.length + (W.pinTownPlan ? W.pinTownPlan.houses.length : 0), newHouses: W.townPlan.houses.length,
    fields: W.fields.length, setPieces: W.setPieces.length, switchbacks: W.switchbacks,
    gateCells: W.gateCells.size,
  };
}
