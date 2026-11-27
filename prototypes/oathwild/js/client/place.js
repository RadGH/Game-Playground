// Which place the page draws: the open world, or the arena (brainstorm 2026-11-27 §2a — an arena is its own hosting
// option with its own little map). The rest of the page holds app.W / app.scattered / app.ground by reference, so a
// place change fills those same objects with the other place's contents (js/world/live.js refill — the map editor's
// live edits swap worlds the same way) and rebuilds the drawn world. The arena is loaded the first time it is entered.
//
//   await usePlace(app, 'arena' | 'world')       (play.js, before it reads app.W)
import { bootArena } from '../world/arena-place.js';
import { worldScene, refill } from '../world/live.js';
import { understory } from '../world/scatter.js';
import { createGround } from '../game/ground.js';
import { makeWorldView, dropWorldView } from './live-edits.js';

/** The page's place right now ('world' until an arena is entered). */
export const placeOf = app => app.place || 'world';

export async function usePlace(app, kind = 'world') {
  kind = kind === 'arena' ? 'arena' : 'world';
  if (placeOf(app) === kind) return false;
  app.places = app.places || {};
  // the open world as it was loaded: keep its parts (the very objects, so the map editor's swaps still reach them)
  if (!app.places.world) app.places.world = { W: { ...app.W }, scattered: { ...app.scattered }, ground: { ...app.ground } };
  if (kind === 'arena' && !app.places.arena) {
    const W = await bootArena({ regions: app.rules.data.regions });
    const scattered = worldScene(W);
    scattered.trees.push(...(W.town?.trees || []));
    scattered.understory = understory(W.terrain, W.data.placements, scattered.trees);
    app.places.arena = { W, scattered, ground: createGround(W.terrain, W.data.placements, scattered, W.town) };
  }
  if (placeOf(app) === 'world') app.places.world = { W: { ...app.W }, scattered: { ...app.scattered }, ground: { ...app.ground } };
  const P = app.places[kind];
  refill(app.W, { ...P.W }); refill(app.scattered, { ...P.scattered }); refill(app.ground, { ...P.ground });
  app.place = kind;
  if (app.view && app.worldView) {
    const old = app.worldView;
    app.worldView = makeWorldView(app);
    dropWorldView(app, old);
  }
  app.emit('place', kind);
  return true;
}
