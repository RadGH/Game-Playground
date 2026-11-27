// Which place the page draws: the open world (the home region, Brightwater Vale), the arena (brainstorm 2026-11-27 §2a —
// its own hosting option with its own little map), or any other region of the world (owner 2026-11-27: "regions
// separated by travel points and loading screens"; docs/BRAINSTORM-2026-11-27-regions.md §1). The rest of the page
// holds app.W / app.scattered / app.ground by reference, so a place change fills those same objects with the other
// place's contents (js/world/live.js refill — the map editor's live edits swap worlds the same way) and rebuilds the
// drawn world. A place is built the first time it is entered and kept, so going back is quick. While a place is
// built the loading screen (render/loading.js) shows its picture, name, levels, a line, a tip and real progress.
//
//   await usePlace(app, 'world' | 'arena' | regionId)       (play.js, before it reads app.W)
//   placeOf(app)                                            the place drawn now
import { bootArena } from '../world/arena-place.js';
import { worldScene, refill } from '../world/live.js';
import { understory } from '../world/scatter.js';
import { createGround } from '../game/ground.js';
import { makeWorldView, dropWorldView } from './live-edits.js';
import { loadRegionIndex, bootRegion, regionOf, homeRegion } from '../world/regions/index.js';
import { showLoading } from './loading.js';

/** The page's place right now ('world' until an arena or another region is entered). */
export const placeOf = app => app.place || 'world';

/** A built place's parts: W, the trees and decor, the ground check (a dungeon brings its own walk grid as ground). */
function partsOf(W) {
  // a dungeon has no outdoor scatter (trees, bushes, understory): its pieces come from its own plan
  const scattered = W.dungeon ? { trees: [], decor: [], report: { orphans: [] } } : worldScene(W);
  scattered.trees.push(...(W.town?.trees || []));
  scattered.understory = W.dungeon ? [] : understory(W.terrain, W.data.placements, scattered.trees);
  const ground = W.makeGround ? W.makeGround(scattered) : createGround(W.terrain, W.data.placements, scattered, W.town);
  return { W, scattered, ground };
}
const tick = () => new Promise(r => setTimeout(r, 0));   // let the loading screen paint between steps

export async function usePlace(app, kind = 'world') {
  app.regionIndex = app.regionIndex || await loadRegionIndex().catch(() => null);
  const home = homeRegion(app.regionIndex);
  if (kind === home || !kind) kind = 'world';
  if (kind !== 'world' && kind !== 'arena' && !regionOf(app.regionIndex, kind)) kind = 'world';
  if (placeOf(app) === kind) return false;
  app.places = app.places || {};
  // the open world as it was loaded: keep its parts (the very objects, so the map editor's swaps still reach them)
  if (!app.places.world) app.places.world = { W: { ...app.W }, scattered: { ...app.scattered }, ground: { ...app.ground } };
  const row = kind === 'arena' ? { name: 'The Arena', loading: { line: 'Five waves, four gates, and a crowd that wants blood.' } } : kind === 'world' ? regionOf(app.regionIndex, home) : regionOf(app.regionIndex, kind);
  const loading = showLoading(app, { id: kind === 'world' ? home : kind, row });
  try {
    if (!app.places[kind]) {
      loading.step(0.1, 'Shaping the land');
      await tick();
      const W = kind === 'arena' ? await bootArena({ regions: app.rules.data.regions }) : await bootRegion(kind, { index: app.regionIndex, regions: app.rules.data.regions });
      loading.step(0.55, 'Placing trees, stones and houses');
      await tick();
      if (kind !== 'arena' && app.worldBooks?.[kind]) W.book = app.worldBooks[kind];   // the world's one quest book, seen from this region
      app.places[kind] = partsOf(W);
    }
    if (placeOf(app) === 'world') app.places.world = { W: { ...app.W }, scattered: { ...app.scattered }, ground: { ...app.ground } };
    const P = app.places[kind];
    refill(app.W, { ...P.W }); refill(app.scattered, { ...P.scattered }); refill(app.ground, { ...P.ground });
    app.place = kind;
    loading.step(0.75, 'Drawing the world');
    await tick();
    if (app.view && app.worldView) {
      const old = app.worldView;
      app.worldView = makeWorldView(app);
      dropWorldView(app, old);
      // a dungeon bakes its torchlight while the loading screen still shows (render/dungeon-draw.js ready())
      if (app.worldView?.ready) { loading.step(0.85, 'Lighting the torches'); await app.worldView.ready(); }
      // compile the new place's materials now, not on the first frame (lessons rule 29: no shader build mid-play)
      try { app.view.renderer?.compile?.(app.view.scene, app.view.camera); } catch { /* compile is a warm-up only */ }
    }
    loading.step(1, 'Ready');
    app.emit('place', kind);
    return true;
  } finally {
    loading.done();
  }
}
