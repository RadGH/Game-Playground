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
import { createSetPieceView } from './setpiece-view.js';
import { createWallsView } from './walls-view.js';   // play-test 4 S7 (stream B): town perimeters + gates
import { createGroundClutter } from './ground-clutter.js';   // 2026-10-17: grass tufts, ferns, stones, pebbles, lumps round the camera
import { createGpuGrass } from './grass-gpu.js';             // 2026-10-20: the grass itself, drawn on the graphics card (Medium, High)
import { perf, nextFrame } from './perf.js';
import { parseNav } from '../rules/terrain-read.js';
import { refineNav } from '../rules/nav-refine.js';       // Z37: trees and rocks block as circles the size of their models
import { growForest, clearOf } from '../rules/forest.js';   // Z25: forests with giants
/** `?forest=0`: the bake's sprinkle only (a before / after look and perf check; the server still grows its woods). */
const NO_FOREST = typeof location !== 'undefined' && new URLSearchParams(location.search).get('forest') === '0';   // play-test 4: walls + houses block prediction like the server (stepMove reads terrain.nav.at)

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
  // `?clutter=0`: no ground clutter (before / after measuring)
  const NO_CLUTTER = typeof location !== 'undefined' && new URLSearchParams(location.search).get('clutter') === '0';
  let clutter = null;

  const at = (x, z) => {
    for (const L of loaded.values()) { const b = L.bounds; if (L.T && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return L; }
    return null;
  };
  // `?grass=0`: no GPU grass (the CPU tufts come back — the look before 2026-10-20, for before / after measuring)
  const NO_GPU_GRASS = typeof location !== 'undefined' && new URLSearchParams(location.search).get('grass') === '0';
  let grass = null;
  if (!NO_CLUTTER && !NO_GPU_GRASS) { try { grass = createGpuGrass(scene, { quality, zoneAt: at, distance: opts.grassDistance || 'medium' }); } catch (e) { console.warn('[grass]', e.message); grass = null; } }
  if (grass && !grass.active) grass = null;
  const refreshGround = () => { clutter?.refresh(); grass?.refresh(); };
  // the GPU grass replaces the clutter's tufts (the ferns, stones and lumps stay)
  if (!NO_CLUTTER) createGroundClutter(scene, { quality, zoneAt: at, tufts: !grass }).then(c => { clutter = c; }).catch(e => console.warn('[clutter]', e.message));
  const NONE = { kind: 'none', surface: NaN, depth: 0 };
  const terrain = {
    get bounds() {
      if (!zones.length) return { minX: 0, minZ: 0, maxX: ZONE_M, maxZ: ZONE_M };
      return zones.reduce((a, q) => ({ minX: Math.min(a.minX, q.bounds.minX), minZ: Math.min(a.minZ, q.bounds.minZ), maxX: Math.max(a.maxX, q.bounds.maxX), maxZ: Math.max(a.maxZ, q.bounds.maxZ) }), { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
    },
    heightAt(x, z) { const L = at(x, z); if (L) return L.T.heightAt(x, z); return horizon ? horizon.heightAt(x, z) : 0; },
    walkable(x, z) { const L = at(x, z); return L ? L.T.walkable(x, z) : zones.some(q => x >= q.bounds.minX && x <= q.bounds.maxX && z >= q.bounds.minZ && z <= q.bounds.maxZ); },
    waterAt(x, z) { const L = at(x, z); return L ? L.T.waterAt(x, z) : NONE; },
    /** 'out' | 'steep' | 'walk' | 'wade' | 'swim' — B's depth layer (stepMove reads it so prediction swims like the server). */
    moveAt(x, z) { const L = at(x, z); if (L && L.T.moveAt) return L.T.moveAt(x, z); return terrain.walkable(x, z) ? 'walk' : 'out'; },
    slopeDeg(x, z) { const L = at(x, z); return L ? L.T.slopeDeg(x, z) : 0; },
    biomeKey(x, z) { const L = at(x, z); return L ? L.T.biomeKey(x, z) : 'grassland'; },
    /** The stitched nav map, the same shape as js/sim/province-terrain.js `nav` (raw bits; 0 where a zone has none). */
    nav: { at(x, z) { const L = at(x, z); return L && L.nav ? L.nav.at(x - L.ox, z - L.oz) : 0; }, passable(x, z) { const L = at(x, z); return !L || !L.nav || L.nav.passable(x - L.ox, z - L.oz); } },
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
      const [base, extras, nav] = await Promise.all([loadClientTerrain(q.key), loadZoneExtras(q.key),
        fetch(new URL(`../../data/zones/${encodeURIComponent(q.key)}/nav.bin`, import.meta.url)).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? parseNav(b) : null)).catch(() => null)]);
      if (!zones.some(z => z.key === q.key)) return null;
      await nextFrame();                    // P1: the parse and the ground build land in different frames
      if (!zones.some(z => z.key === q.key)) return null;
      const T = worldZone(base, q.bounds.minX, q.bounds.minZ);
      let end = perf.begin('zone:ground');
      T.zoneKey = q.key;
      const L = { key: q.key, T, bounds: { ...T.bounds }, views: [], extras, ready: false, nav, ox: q.bounds.minX, oz: q.bounds.minZ };
      // Z25 (live #26): woods grown out of the bake's sprinkle — giants and new neighbours (js/rules/forest.js), then
      // Z37 (live #38): round colliders for trees and rocks (nav-refine.js). The server grows and wraps the same files the
      // same way. Each in its own frame (~25 + ~35 ms for a full zone); until then the grid answers, as it always did, and
      // the scatter view waits for the grown woods (L.woods).
      L.woods = !extras?.scatter ? Promise.resolve() : nextFrame().then(() => {
        // the same keep-clear list as the server (js/sim/content.js): the bake's placements + the vignettes it accepted
        const vigOk = !extras.vignetteHash || !base.reader || extras.vignetteHash === base.reader.meta.inputHash;
        if (!NO_FOREST) extras.scatter = perf.span('zone:forest', () => growForest(extras.scatter, nav, { ox: q.bounds.minX, oz: q.bounds.minZ, clear: clearOf(extras.placements, vigOk ? extras.vignettes : []) }));
        if (!nav) return;
        return nextFrame().then(() => { if (loaded.get(q.key) === L) { L.nav = perf.span('zone:navRefine', () => refineNav(nav, extras.scatter)); refreshGround(); } });
      });
      const biomeColors = base.reader ? Object.fromEntries(base.reader.biomes.map(b => [b.key, b.color])) : null;
      const ground = createTerrainView(T, { quality, textureSize: quality === 'low' ? 256 : 512, biomeColors, clearings: opts.clearingsFor ? opts.clearingsFor(T, extras) : [] });
      scene.add(ground.group); L.views.push(ground); L.ground = ground;
      if (horizon && base.reader) horizon.setBiomes?.(base.reader.biomes);
      loaded.set(q.key, L); refreshGround();
      syncHorizon();
      end();
      groundResolve(L);
      // the rest arrives a moment later, a piece a frame (P1: one zone's town + scatter + sites in a single task was a
      // stall); each piece's shaders are compiled before it is shown (compileAsync, parallel where the GPU allows)
      const show = async view => {
        if (opts.compile) { try { await opts.compile(view.group); } catch { /* drawn = compiled */ } }
        if (loaded.get(q.key) !== L) { view.dispose?.(); return false; }   // the zone was let go while it compiled
        scene.add(view.group); return true;
      };
      try {
        await nextFrame();
        if (extras.placements.length) { end = perf.begin('zone:town'); const town = createTownView(T, extras.placements, { quality }); end(); if (loaded.get(q.key) !== L) { town.dispose?.(); return L; } if (!(await show(town))) return L; L.views.push(town); L.town = town; for (const o of offices.values()) town.claimOffice(o); await nextFrame(); }
        if (extras.scatter) { await L.woods; end = perf.begin('zone:scatter'); const sc = await createScatterView(T, extras.scatter, { quality, avoid: L.town ? L.town.clearings : [] }); end(); if (loaded.get(q.key) !== L) { sc.dispose?.(); return L; } sc.refresh?.(lastPos); if (!(await show(sc))) return L; L.views.push(sc); L.scatter = sc; await nextFrame(); }
        else if (opts.fallbackDecor) { const d = await opts.fallbackDecor(T, L); if (d && loaded.get(q.key) === L) { scene.add(d.group); L.views.push(d); } }
        const vigOk = !extras.vignetteHash || !base.reader || extras.vignetteHash === base.reader.meta.inputHash;   // made for another bake: the server skips them too
        if (vigOk && extras.vignetteFile) { end = perf.begin('zone:sites'); const sv = await createSiteView(T, extras.vignetteFile, { quality }); end(); if (sv && loaded.get(q.key) === L) { if (!(await show(sv))) return L; L.views.push(sv); L.sites = sv; } else sv?.dispose?.(); }
        // Q18: bespoke areas — B's ground (graveyards, fields, hedges, set buildings) + E's set-piece dressing
        if (extras.placements.length || (vigOk && extras.vignetteFile)) { end = perf.begin('zone:setpieces'); const sp = await createSetPieceView(T, { placements: extras.placements, vignetteFile: vigOk ? extras.vignetteFile : null }, { quality }); end(); if (sp && loaded.get(q.key) === L) { if (!(await show(sp))) return L; L.views.push(sp); L.setpieces = sp; } else sp?.dispose?.(); }
        // S7 (stream B): town walls / palisades / fences / barricades and their gates; night rides on the town view's setNight
        if (extras.placements.length) { const wv = createWallsView(T, extras.placements, { quality }); if (wv && loaded.get(q.key) === L && await show(wv)) { L.views.push(wv); L.walls = wv; if (L.town?.setNight) { const sn = L.town.setNight; L.town.setNight = n => { sn(n); wv.setNight(n); }; } } else wv?.dispose?.(); }
        if (solids && loaded.get(q.key) === L) solids.add(q.key, [...(L.town?.solids || []), ...(L.sites?.solids || []), ...(L.scatter?.solids || []), ...(L.setpieces?.solids || []), ...(L.walls?.solids || [])]);
        if (loaded.get(q.key) === L) L.ground?.foamAround?.([...(L.town?.solids || []), ...(L.sites?.solids || []), ...(L.scatter?.solids || []), ...(L.setpieces?.solids || [])]);   // G-ATMOS: foam round rocks, posts and walls standing in water
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
    const end = perf.begin('zone:unload');
    for (const v of L.views) { scene.remove(v.group); v.dispose?.(); }
    solids?.remove(key);
    loaded.delete(key);
    refreshGround();
    syncHorizon();
    end();
  }

  let decideAt = 0, t = 0;
  const offices = new Map();        // Q10: server-claimed offices (plot key -> info.office)
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
    const end = perf.begin('world:views');
    for (const L of loaded.values()) for (const v of L.views) v.update?.(dt, pos || lastPos);
    end();
    if (clutter && (pos || lastPos)) perf.span('world:clutter', () => clutter.update(pos || lastPos));
    if (grass && (pos || lastPos)) perf.span('world:grass', () => grass.update(pos || lastPos));
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
    setVisible(v) { for (const L of loaded.values()) for (const view of L.views) view.group.visible = v; grass?.setVisible(v); if (clutter?.group) clutter.group.visible = v; },
    /** Settings → Graphics → Grass distance (grass-types.js GRASS_DISTANCES id); applies at once. */
    setGrassDistance(id) { grass?.setDistance(id); },
    get grass() { return grass; }, get clutter() { return clutter; },
    /**
     * Q10: a service NPC's office (`info.office`) — dress the house it took over (a town plan with no plot of that
     * trade). Remembered, so a zone that loads later dresses it too.
     */
    claimOffice(o) {
      if (!o) return;
      const k = o.plot != null ? 'p:' + o.plot : `${Math.round(o.x)},${Math.round(o.z)}`;
      if (offices.get(k)?.kind === o.kind) return;
      offices.set(k, o);
      for (const L of loaded.values()) if (L.town?.claimOffice(o)) break;
    },
    /** Towns drawn right now (for lamps at night, and the map). */
    towns() { const out = []; for (const L of loaded.values()) if (L.town) out.push(...L.town.towns); return out; },
    stats() { let tris = 0; const keys = [...loaded.keys()]; return { zones: keys, loading: [...loading.keys()], trees: [...loaded.values()].reduce((a, L) => a + (L.scatter?.stats.trees || 0), 0), buildings: [...loaded.values()].reduce((a, L) => a + (L.town?.stats.buildings || 0), 0), tris }; },
  };
}
