// The outdoor world as you walk it: a province is ~16 zones stitched edge to edge (js/sim/province-terrain.js),
// far too much to hold at once (6 MB of heights a zone), so the client keeps the zone you stand in plus
// any neighbour whose border is within ~450 m, and lets a zone go once you are ~900 m past it.
// Zone edges are bit-identical in the bake, and every chunk carries a skirt, so the seam never shows.
//
// Each loaded zone owns its views: ground mesh + water (terrain-view.js), trees/rocks from scatter.bin
// (scatter-view.js), the town plan from placements.json (town-view.js) and vignette props. Everything
// is in WORLD metres. Beyond the loaded zones the far horizon (horizon.js) draws the whole world from
// the macro bake, so the mountains three zones away are there to walk to.
//
//   const ws = createWorldStream(scene, { quality, horizon, onZoneReady })
//   ws.setZones([{ key, bounds }])      // from joined.room.zones (bounds null = zone-local, offset 0)
//   ws.update(dt, pos)                  // streams zones in/out, updates LOD
//   ws.terrain                          // composite { heightAt, walkable, waterAt, slopeDeg, biomeKey, bounds }
//   ws.ready(x, z)                      // the zone under (x, z) is drawn
//   await ws.whenReady(x, z)

import { loadClientTerrain, loadZoneExtras, worldZone, zonesWanted, rectDist, ZONE_M } from './terrain.js';
import { createTerrainView } from './terrain-view.js';
import { createScatterView } from './scatter-view.js';
import { createTownView } from './town-view.js';
import { createSiteView } from './site-view.js';

/** Bounds for a zone key when the server sent none: `zXX_YY` in world metres, anything else zone-local. */
export function zoneBounds(key, worldMetres = true) {
  const m = /^z(\d+)_(\d+)$/.exec(key || '');
  if (!m || !worldMetres) return { minX: 0, minZ: 0, maxX: ZONE_M, maxZ: ZONE_M };
  const x = +m[1] * ZONE_M, z = +m[2] * ZONE_M;
  return { minX: x, minZ: z, maxX: x + ZONE_M, maxZ: z + ZONE_M };
}

export function createWorldStream(scene, { quality = 'high', horizon: hz0 = null, onZoneReady = null, solids = null, opts = {} } = {}) {
  let horizon = hz0;
  let zones = [];                 // [{ key, bounds }]
  const loaded = new Map();       // key -> { key, T, views[], bounds, ready }
  const loading = new Map();      // key -> promise
  let lastPos = null;

  const at = (x, z) => {
    for (const L of loaded.values()) { const b = L.bounds; if (L.T && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return L; }
    return null;
  };
  const NONE = { kind: 'none', surface: NaN, depth: 0 };
  const terrain = {
    get bounds() {
      if (!zones.length) return { minX: 0, minZ: 0, maxX: ZONE_M, maxZ: ZONE_M };
      return zones.reduce((a, q) => ({ minX: Math.min(a.minX, q.bounds.minX), minZ: Math.min(a.minZ, q.bounds.minZ), maxX: Math.max(a.maxX, q.bounds.maxX), maxZ: Math.max(a.maxZ, q.bounds.maxZ) }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
    },
    heightAt(x, z) { const L = at(x, z); if (L) return L.T.heightAt(x, z); return horizon ? horizon.heightAt(x, z) : 0; },
    walkable(x, z) { const L = at(x, z); return L ? L.T.walkable(x, z) : zones.some(q => x >= q.bounds.minX && x <= q.bounds.maxX && z >= q.bounds.minZ && z <= q.bounds.maxZ); },
    waterAt(x, z) { const L = at(x, z); return L ? L.T.waterAt(x, z) : NONE; },
    slopeDeg(x, z) { const L = at(x, z); return L ? L.T.slopeDeg(x, z) : 0; },
    biomeKey(x, z) { const L = at(x, z); return L ? L.T.biomeKey(x, z) : 'grassland'; },
    zoneAt(x, z) { const q = zones.find(q => x >= q.bounds.minX && x < q.bounds.maxX && z >= q.bounds.minZ && z < q.bounds.maxZ); return q ? q.key : null; },
  };

  function syncHorizon() { if (horizon) horizon.setLoaded([...loaded.values()].map(L => L.bounds), (x, z) => terrain.heightAt(x, z)); }

  function setZones(list) {
    const next = (list || []).filter(q => q && q.key).map(q => ({ key: q.key, bounds: q.bounds || zoneBounds(q.key, false) }));
    const same = next.length === zones.length && next.every((q, i) => q.key === zones[i].key && q.bounds.minX === zones[i].bounds.minX && q.bounds.minZ === zones[i].bounds.minZ);
    if (same) return;
    zones = next;
    // a zone that moved (single zone <-> province) is rebuilt
    for (const [k, L] of loaded) { const q = zones.find(z => z.key === k); if (!q || q.bounds.minX !== L.bounds.minX || q.bounds.minZ !== L.bounds.minZ) unload(k); }
    syncHorizon();
  }

  async function load(q) {
    if (loaded.has(q.key)) return loaded.get(q.key);
    if (loading.has(q.key)) return loading.get(q.key).ground;
    let groundResolve;
    const ground = new Promise(r => { groundResolve = r; });
    const p = (async () => {
      const [base, extras] = await Promise.all([loadClientTerrain(q.key), loadZoneExtras(q.key)]);
      if (!zones.some(z => z.key === q.key)) return null;
      const T = worldZone(base, q.bounds.minX, q.bounds.minZ);
      T.zoneKey = q.key;
      const L = { key: q.key, T, bounds: { ...T.bounds }, views: [], extras, ready: false };
      const biomeColors = base.reader ? Object.fromEntries(base.reader.biomes.map(b => [b.key, b.color])) : null;
      const ground = createTerrainView(T, { quality, textureSize: quality === 'low' ? 256 : 512, biomeColors, clearings: opts.clearingsFor ? opts.clearingsFor(T, extras) : [] });
      scene.add(ground.group); L.views.push(ground); L.ground = ground;
      if (horizon && base.reader) horizon.setBiomes?.(base.reader.biomes);
      loaded.set(q.key, L);
      syncHorizon();
      groundResolve(L);
      // the rest arrives a moment later; the ground is what feet need
      try {
        if (extras.placements.length) { const town = createTownView(T, extras.placements, { quality }); scene.add(town.group); L.views.push(town); L.town = town; }
        if (extras.scatter) { const sc = await createScatterView(T, extras.scatter, { quality, avoid: L.town ? L.town.clearings : [] }); if (loaded.get(q.key) !== L) { sc.dispose?.(); return L; } scene.add(sc.group); L.views.push(sc); L.scatter = sc; }
        else if (opts.fallbackDecor) { const d = await opts.fallbackDecor(T, L); if (d && loaded.get(q.key) === L) { scene.add(d.group); L.views.push(d); } }
        const vigOk = !extras.vignetteHash || !base.reader || extras.vignetteHash === base.reader.meta.inputHash;   // made for another bake: the server skips them too
        if (vigOk && extras.vignetteFile) { const sv = await createSiteView(T, extras.vignetteFile, { quality }); if (sv && loaded.get(q.key) === L) { scene.add(sv.group); L.views.push(sv); L.sites = sv; } }
        if (solids && loaded.get(q.key) === L) solids.add(q.key, [...(L.town?.solids || []), ...(L.sites?.solids || []), ...(L.scatter?.solids || [])]);
      } catch (e) { console.warn('[world] zone extras failed', q.key, e); }
      L.ready = true;
      onZoneReady?.(L);
      return L;
    })().catch(e => { console.warn('[world] zone failed', q.key, e); groundResolve(null); return null; }).finally(() => loading.delete(q.key));
    p.ground = ground;
    loading.set(q.key, p);
    return ground;
  }

  function unload(key) {
    const L = loaded.get(key); if (!L) return;
    for (const v of L.views) { scene.remove(v.group); v.dispose?.(); }
    solids?.remove(key);
    loaded.delete(key);
    syncHorizon();
  }

  let decideAt = 0, t = 0;
  function update(dt, pos) {
    t += dt;
    if (pos) lastPos = pos;
    if (lastPos && t >= decideAt && zones.length) {
      decideAt = t + 0.5;
      const want = zonesWanted(zones, lastPos.x, lastPos.z, new Set(loaded.keys()), { max: opts.maxZones || (quality === 'low' ? 3 : 4) });
      for (const k of [...loaded.keys()]) if (!want.includes(k)) unload(k);
      // nearest first, one fetch at a time (a 6 MB zone should not race the one you are about to step on)
      if (!loading.size) { const k = want.find(k => !loaded.has(k)); if (k) load(zones.find(z => z.key === k)); }
    }
    for (const L of loaded.values()) for (const v of L.views) v.update?.(dt, pos || lastPos);
  }

  /** Load the zone under (x, z) now (login, a waystone jump) and resolve once its ground is drawn. */
  async function whenReady(x, z) {
    const q = zones.find(q => rectDist(q.bounds, x, z) === 0) || zones[0];
    if (!q) return null;
    lastPos = { x, z };
    if (loaded.has(q.key)) return loaded.get(q.key);
    return load(q);       // resolves when the ground is drawn; trees and town follow a moment later
  }

  return {
    terrain, setZones, update, whenReady, load, unload,
    setHorizon(h) { horizon = h; const L = loaded.values().next().value; if (h && L?.T.reader) h.setBiomes?.(L.T.reader.biomes); syncHorizon(); },
    get zones() { return zones; }, loaded,
    ready: (x, z) => !!at(x, z),
    zoneAt: (x, z) => at(x, z),
    setVisible(v) { for (const L of loaded.values()) for (const view of L.views) view.group.visible = v; },
    /** Towns drawn right now (for lamps at night, and the map). */
    towns() { const out = []; for (const L of loaded.values()) if (L.town) out.push(...L.town.towns); return out; },
    stats() { let tris = 0; const keys = [...loaded.keys()]; return { zones: keys, loading: [...loading.keys()], trees: [...loaded.values()].reduce((a, L) => a + (L.scatter?.stats.trees || 0), 0), buildings: [...loaded.values()].reduce((a, L) => a + (L.town?.stats.buildings || 0), 0), tris }; },
  };
}
