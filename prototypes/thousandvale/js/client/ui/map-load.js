// Fetches what the map needs (once, in the background) and shapes it with map-data.js; renders the terrain
// pictures in a worker (map-image-worker.js): the whole world from data/world/horizon.bin (32 m a pixel) and,
// for the close-up region map, any zone from its own terrain.bin (4 m a pixel). Pictures are ImageBitmaps,
// cached for the session.
//
//   const maps = createMapSource();
//   const model = await maps.model();             // buildMapModel(...) — zones, names, bands, places, quests
//   const img = await maps.worldImage();          // { bitmap, w, h, metresPerPixel } or null
//   maps.zoneImage('z12_02')                      // returns the bitmap now if ready, else starts it and returns null
//
// If stream B publishes a pre-drawn map (data/world/map.png + map.json {metresPerPixel}), it is used instead of
// drawing the world here.

import { buildMapModel } from './map-data.js';

const DATA = new URL('../../../data/', import.meta.url);
const j = async (path, opt = false) => {
  try { const r = await fetch(new URL(path, DATA)); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { if (opt) return null; throw e; }
};

export function createMapSource() {
  let modelP = null, worldP = null, worker = null, seq = 0;
  const waits = new Map(), zones = new Map(), zoneBusy = new Set();
  const listeners = new Set();
  function w() {
    if (worker) return worker;
    worker = new Worker(new URL('./map-image-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const f = waits.get(data.id); if (f) { waits.delete(data.id); f(data); } };
    worker.onerror = e => { for (const f of waits.values()) f({ error: e.message || 'worker failed' }); waits.clear(); };
    return worker;
  }
  const ask = msg => new Promise(res => { const id = ++seq; waits.set(id, res); w().postMessage({ ...msg, id }); });
  const toBitmap = async (rgba, width, height) => {
    const img = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height);
    try { return await createImageBitmap(img); }
    catch { const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d').putImageData(img, 0, 0); return c; }
  };

  const api = {
    /** The map model (fetched once). */
    model() {
      if (modelP) return modelP;
      modelP = (async () => {
        const [world, provinceMap, rares, events] = await Promise.all([j('world/world.json'), j('world/province-map.json'), j('provinces/rares.json', true), j('quests/events.json', true)]);
        const sheets = {}, zoneJsons = {}, placements = {}, quests = {};
        const jobs = [];
        for (const [prov, p] of Object.entries(provinceMap.provinces || {})) {
          jobs.push(j(`provinces/${prov}.json`, true).then(s => { sheets[prov] = s; }));
          for (const [id, wk] of Object.entries(p.map || {})) {
            jobs.push(j(`zones/${wk}/zone.json`, true).then(z => { zoneJsons[wk] = z; }));
            jobs.push(j(`vignettes/placements/${wk}.json`, true).then(z => { placements[wk] = z; }));
            jobs.push(j(`quests/${id}.json`, true).then(z => { quests[id] = z; }));
          }
        }
        await Promise.all(jobs);
        return buildMapModel({ world, provinceMap, sheets, zoneJsons, placements, quests, rares, events });
      })();
      modelP.catch(e => console.warn('[map] model failed:', e.message));
      return modelP;
    },
    /** The world picture: B's pre-drawn map if there is one, else drawn here from horizon.bin. */
    worldImage() {
      if (worldP) return worldP;
      worldP = (async () => {
        const pre = await j('world/map.json', true);
        if (pre?.file) {
          try {
            const img = new Image(); img.src = new URL(pre.file.replace(/^data\//, ''), DATA).href; await img.decode();
            return { bitmap: img, w: img.naturalWidth, h: img.naturalHeight, metresPerPixel: pre.metresPerPixel || 32, source: 'baked' };
          } catch { /* fall back to drawing it */ }
        }
        const r = await ask({ type: 'world', url: new URL('world/horizon.bin', DATA).href });
        if (r.error) { console.warn('[map] world image:', r.error); return null; }
        return { bitmap: await toBitmap(r.rgba, r.w, r.h), w: r.w, h: r.h, metresPerPixel: r.step, source: 'horizon' };
      })();
      return worldP;
    },
    /** A zone's close-up picture (bitmap) if it is ready; otherwise starts drawing it and returns null. */
    zoneImage(key) {
      if (zones.has(key)) return zones.get(key);
      if (zoneBusy.has(key) || zoneBusy.size >= 2) return null;     // two at a time keeps the worker responsive
      zoneBusy.add(key);
      ask({ type: 'zone', url: new URL(`zones/${key}/terrain.bin`, DATA).href }).then(async r => {
        zoneBusy.delete(key);
        if (r.error) { zones.set(key, false); return; }
        zones.set(key, { bitmap: await toBitmap(r.rgba, r.w, r.h), w: r.w, h: r.h, metresPerPixel: r.mpp, origin: r.origin });
        for (const f of listeners) f(key);
      });
      return null;
    },
    /** Called with a zone key whenever a close-up picture finishes. */
    onZoneImage(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Street and building outlines of a zone (B's placements.json), for the close-up map; cached. */
    zoneDetail: (() => {
      const cache = new Map();
      return key => {
        if (cache.has(key)) return cache.get(key);
        const p = j(`zones/${key}/placements.json`, true).then(d => d?.placements || []);
        cache.set(key, p);
        return p;
      };
    })(),
  };
  return api;
}
