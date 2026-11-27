// Oathwild dungeons — everything a game needs for one dungeon, in one call. Pure (the spec is read by the caller).
//
//   const D = buildDungeon(spec, seed, saved?)   spec = data/dungeons/<id>.json, seed = the world's seed, saved = state.open from the save
//   D.plan       plan.js     the grid, rooms, columns, doors, entrances, exits, stairs, features
//   D.state      features.js { open: { gate / secret id: bool } } — keep it in the world save
//   D.walk       walk.js     the ground for this place (same method names as js/game/ground.js)
//   D.pather     path.js     A* + flow fields, goHome
//   D.encounters encounters.js packs, named, boss, patrols
//   D.pullLever(id) / D.openSecret(id)   change the state AND the walk grid together
export { planDungeon, planToJSON, planFromJSON, ROOM_KINDS, TILE } from './plan.js';
export { createWalk } from './walk.js';
export { createPather } from './path.js';
export { lineOfSight, firstHit, canNotice, joinsFight } from './sight.js';
export { planEncounters } from './encounters.js';
export { cameraBoom, boomPoint } from './camera.js';
export { CODE, featureState, pullLever, openSecret, isOpen } from './features.js';
import { planDungeon } from './plan.js';
import { createWalk } from './walk.js';
import { createPather } from './path.js';
import { planEncounters } from './encounters.js';
import { featureState, pullLever, openSecret } from './features.js';

export function buildDungeon(spec, seed = 1, saved = null) {
  const plan = planDungeon(spec, seed);
  const state = featureState(plan, saved);
  const walk = createWalk(plan, state);
  const pather = createPather(walk);
  const encounters = planEncounters(plan, spec, seed, createWalk(plan));
  return {
    plan, state, walk, pather, encounters,
    pullLever: id => pullLever(plan, state, id, walk),
    openSecret: id => openSecret(plan, state, id, walk),
  };
}
