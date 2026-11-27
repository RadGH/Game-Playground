// Live map edits in the game page (dev world server only — the live server never sends them). When the map editor or
// tools/map-edit.mjs changes the world, the server sends { t: 'worldEdit', touched, edits, map? } to every page; this
// rebuilds the world with the same code the server just used (js/world/live.js) and redraws it without a reload:
//   zones / looks  → only the effect zones are told (render/zones.js): nothing is rebuilt
//   anything else  → terrain, trees, colliders and placements rebuilt and swapped in place; the 3D world redrawn
//
//   installLiveEdits(app)               (main.js)
//   makeWorldView(app) / dropWorldView(app, wv)   build / throw away the drawn world (play.js and the editor use these)
import { createWorldView } from './render/world.js';
import { createDungeonView } from './render/dungeon-draw.js';
import { understory } from '../world/scatter.js';
import { createGround } from '../game/ground.js';
import { worldScene, rebuildWorld, swapInto, refill } from '../world/live.js';

/** The drawn world, remembering which scene objects it added (grass and contact shade sit on the scene itself). */
export function makeWorldView(app, { quality = app.settings.quality } = {}) {
  const scene = app.view.scene, before = new Set(scene.children);
  // a dungeon place (js/world/dungeon/place.js) is drawn from its plan: no land, sky, grass, trees or water
  const wv = app.W.dungeon ? createDungeonView(app.view, { W: app.W, quality }) : createWorldView(app.view, { T: app.W.terrain, placements: app.W.data.placements, art: app.art, scattered: app.scattered, book: app.W.book, town: app.W.town, quality });
  wv.owned = scene.children.filter(o => !before.has(o));
  return wv;
}
export function dropWorldView(app, wv) {
  if (!wv) return;
  wv.dispose?.();                                         // (the dungeon puts the sky, sun and fog back)
  for (const o of wv.owned || []) {
    app.view.scene.remove(o);
    // geometry only: materials and textures are shared with caches (GLB models, kit pieces) that a new view reuses
    o.traverse(n => { if (n.geometry && !n.userData.keepGeometry) n.geometry.dispose(); });
  }
}

/** Rebuild app.W / app.scattered / app.ground from new files (same objects, new contents). */
export async function rebuildAppWorld(app, { map = null, edits }) {
  const fresh = await rebuildWorld(app.W.pristine, { map, edits, regions: app.rules.data.regions });
  const sc = worldScene(fresh);
  sc.trees.push(...(fresh.town?.trees || []));
  sc.understory = understory(fresh.terrain, fresh.data.placements, sc.trees);
  const g = createGround(fresh.terrain, fresh.data.placements, sc, fresh.town);
  swapInto(app.W, fresh); refill(app.scattered, sc); refill(app.ground, g);
  return sc.report;
}

export function installLiveEdits(app) {
  let pending = null, running = false;
  app.on('worldEdit', m => { pending = pending ? { ...m, map: m.map || pending.map, touched: pending.touched === m.touched ? m.touched : 'all' } : m; if (!running) run(); });
  async function run() {
    running = true;
    while (pending) {
      const m = pending; pending = null;
      try { await apply(m); } catch (e) { console.warn('[live edit]', e); }
    }
    running = false;
  }
  async function apply(m) {
    if (app.place === 'arena' || app.W.dungeon) return;   // (the arena and a dungeon are their own places: the open world's edits wait until you are back)
    app.W.data.edits = m.edits;
    if (m.touched === 'zones' || m.touched === 'looks') { app.zones?.setEdits(m.edits); app.emit('worldChanged', m); return; }
    await rebuildAppWorld(app, m);
    if (app.view && app.worldView) {
      const old = app.worldView;
      app.worldView = makeWorldView(app);
      dropWorldView(app, old);
    }
    app.zones?.setEdits(m.edits);
    app.emit('worldChanged', m);
    if (app.screenName === 'play') app.toast?.('The world was changed by the map editor.', 'info', 2500);
  }
}
