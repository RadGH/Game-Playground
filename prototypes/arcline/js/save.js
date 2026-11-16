// Arcline saves: worlds and their cities in this browser's localStorage (owner §0 "Saves": solo, browser + optional
// account cloud save). The WORLD itself is never stored: generateWorld() makes the same world from the same seed and
// size, so a world save is just its settings plus one saved city per region the player has played.
//
//   localStorage keys (all listed in CLOUD so shared/rgs-cloudsave.js can carry them to the account):
//     arcline.worlds                       { v, worlds: [meta…] }   meta = { id, v, name, seed, cells, pressure,
//                                          created, lastPlayed, regions: { [regionId]: summary } }
//     arcline.last                         id of the world played last
//     arcline.settings                     the settings sheet (volume, muted, shake, effects, weather, edgeScroll)
//     arcline.region.<worldId>.<regionId>  one city: sim/region.js saveRegion() JSON, gzipped + base64 ('gz1:…'),
//                                          or plain JSON ('js1:…') where the browser has no CompressionStream
//     arcline.snap.<worldId>.<regionId>    the city's picture for the world map: { w, h, top, url } (a small WebP,
//                                          render/map.js snapshot()); kept out of arcline.worlds so the index stays small
//   summary = { name, founded, population, money, milestone, day, lastPlayed, rates, size, snapAt } — what the world
//   map shows without opening the city. loadWorld() puts the picture on it as summary.snap.
//
// Every localStorage call is wrapped (private windows, full storage): a failed write returns { ok: false, reason }.
// Versioning: meta.v = SAVE_VERSION; push a step onto MIGRATE.world[v] (v → v+1) when the shape changes, and
// MIGRATE.region[v] for the region JSON (its own v from sim/region.js). loadWorld() runs every step in order.
import { generateWorld } from './sim/world.js';
import { saveRegion } from './sim/region.js';

export const SAVE_VERSION = 1;
export const KEYS = { worlds: 'arcline.worlds', last: 'arcline.last', settings: 'arcline.settings' };
export const REGION_PREFIX = 'arcline.region.';
export const SNAP_PREFIX = 'arcline.snap.';
/** For shared/rgs-cloudsave.js: cloudSave({ game: 'arcline', keys: CLOUD.keys, prefixes: CLOUD.prefixes, … }). */
export const CLOUD = { keys: { worlds: KEYS.worlds, last: KEYS.last, settings: KEYS.settings }, prefixes: { regions: REGION_PREFIX, snaps: SNAP_PREFIX } };

/** World sizes (cells per side) and creature pressure (a multiplier the defence sim reads from meta.pressure). */
export const WORLD_SIZES = [
  { id: 'small', label: 'Small', cells: 10 },
  { id: 'medium', label: 'Medium', cells: 14 },
  { id: 'large', label: 'Large', cells: 18 },
];
export const PRESSURES = [
  { id: 'calm', label: 'Calm', value: 0.6, note: 'Fewer probes, smaller swarms' },
  { id: 'normal', label: 'Normal', value: 1, note: 'The intended pressure' },
  { id: 'fierce', label: 'Fierce', value: 1.5, note: 'Bigger swarms, faster nests' },
];
export const pressureOf = v => PRESSURES.reduce((a, b) => (Math.abs(b.value - v) < Math.abs(a.value - v) ? b : a));
export const sizeOf = cells => WORLD_SIZES.find(s => s.cells === cells) || { id: 'custom', label: `${cells} × ${cells}`, cells };

/** Shape changes, step by step: MIGRATE.world[1] = meta => meta (v1 → v2)… The lead adds steps; tests prove the hook. */
export const MIGRATE = { world: {}, region: {} };

// ------------------------------------------------------------------ storage (wrapped)
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const storage = {
  get(k) { try { return ls()?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) {
    try { const s = ls(); if (!s) return { ok: false, reason: 'unavailable' }; s.setItem(k, v); return { ok: true }; }
    catch (e) { return { ok: false, reason: /quota|exceed|full/i.test(`${e?.name} ${e?.message}`) ? 'full' : 'blocked' }; }
  },
  remove(k) { try { ls()?.removeItem(k); } catch { /* blocked */ } },
  keys() { try { const s = ls(); if (!s) return []; const out = []; for (let i = 0; i < s.length; i++) out.push(s.key(i)); return out; } catch { return []; } },
  getJSON(k, d) { const v = this.get(k); if (v == null) return d; try { return JSON.parse(v); } catch { return d; } },
};

// ------------------------------------------------------------------ settings
export const DEFAULT_SETTINGS = { volume: 0.8, muted: false, shake: true, effects: 'full', weather: true, edgeScroll: true };
export function loadSettings() { return { ...DEFAULT_SETTINGS, ...storage.getJSON(KEYS.settings, {}) }; }
export function saveSettings(s) { return storage.set(KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, ...s })); }

// ------------------------------------------------------------------ the world index
function readIndex() {
  const idx = storage.getJSON(KEYS.worlds, null);
  const worlds = Array.isArray(idx?.worlds) ? idx.worlds.filter(w => w && w.id && Number.isFinite(w.seed)) : [];
  return { v: SAVE_VERSION, worlds: worlds.map(migrateMeta) };
}
function writeIndex(idx) { return storage.set(KEYS.worlds, JSON.stringify({ v: SAVE_VERSION, worlds: idx.worlds })); }
const listeners = new Set();
/** Called after every successful write (the game hooks cloud.saveSoon() here). Returns an unsubscribe. */
export function onSaved(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const saved = what => { for (const f of listeners) { try { f(what); } catch { /* a listener */ } } };

/** Bring an old meta up to SAVE_VERSION (each step v → v+1). */
export function migrateMeta(meta) {
  let m = { ...meta, regions: { ...(meta.regions || {}) } };
  m.v ??= 1;
  while (m.v < SAVE_VERSION) { const step = MIGRATE.world[m.v]; if (step) m = step(m) || m; m.v++; }
  return m;
}
export function migrateRegion(json) {
  if (!json) return json;
  let r = json; let v = r.v ?? 1;
  for (let guard = 0; MIGRATE.region[v] && guard < 50; guard++) { r = MIGRATE.region[v](r) || r; v = (r.v = v + 1); }
  return r;
}

/** Totals over a world's played cities. */
export function worldTotals(meta) {
  const cities = Object.values(meta?.regions || {}).filter(s => s?.founded);
  return { cities: cities.length, people: cities.reduce((a, s) => a + (s.population || 0), 0), money: cities.reduce((a, s) => a + (s.money || 0), 0) };
}
/** Every world, most recently played first, with totals. */
export function listWorlds() {
  return readIndex().worlds.map(m => ({ ...m, totals: worldTotals(m) })).sort((a, b) => (b.lastPlayed || b.created || 0) - (a.lastPlayed || a.created || 0));
}
export function getWorldMeta(id) { return readIndex().worlds.find(w => w.id === id) || null; }
/** The world played last (or the most recent one), or null. */
export function lastWorld() {
  const all = listWorlds(); if (!all.length) return null;
  const id = storage.get(KEYS.last);
  return all.find(w => w.id === id) || all[0];
}

let idCounter = 0;
const newId = () => `w${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Make and store a new world. Returns { meta, world, regions: {} } (the same shape loadWorld gives). */
export function newWorldSave({ name = 'New World', seed = 1, cells = 14, pressure = 1 } = {}) {
  seed = Math.max(1, Math.floor(Math.abs(Number(seed)) || 1));
  const now = Date.now();
  const meta = { id: newId(), v: SAVE_VERSION, name: String(name).trim().slice(0, 40) || 'New World', seed, cells, pressure, created: now, lastPlayed: now, regions: {} };
  const idx = readIndex(); idx.worlds.push(meta);
  const res = writeIndex(idx);
  if (res.ok) { storage.set(KEYS.last, meta.id); saved({ world: meta.id }); }
  const world = generateWorld({ seed, cells });
  return { meta, world, regions: {}, ok: res.ok, reason: res.reason };
}

/** Open a world: its meta, the world regenerated from seed + size (each region's .city = its summary), and every
 *  saved city's JSON (already migrated; pass it to sim/region.js loadRegion). null if the world isn't there. */
export async function loadWorld(id) {
  const meta = getWorldMeta(id); if (!meta) return null;
  const world = generateWorld({ seed: meta.seed, cells: meta.cells });
  for (const r of world.regions) { r.city = meta.regions[r.id] || null; if (r.city) { const sn = loadSnap(id, r.id); if (sn) r.city.snap = sn; } }
  const regions = {};
  for (const rid of Object.keys(meta.regions)) regions[rid] = await loadRegionSave(id, rid);
  return { meta, world, regions };
}
/** One city's saved JSON (migrated), or undefined. */
export async function loadRegionSave(worldId, regionId) {
  const raw = storage.get(regionKey(worldId, regionId)); if (raw == null) return undefined;
  try { return migrateRegion(await unpack(raw)); } catch { return undefined; }
}
export const regionKey = (worldId, regionId) => `${REGION_PREFIX}${worldId}.${regionId}`;
export const snapKey = (worldId, regionId) => `${SNAP_PREFIX}${worldId}.${regionId}`;
/** A city's world-map picture ({ w, h, top, url }) or null. */
export function loadSnap(worldId, regionId) { const s = storage.getJSON(snapKey(worldId, regionId), null); return s && typeof s.url === 'string' && s.w > 0 ? s : null; }

/** A city's summary for the world map (no typed arrays). */
export function summarize(r) {
  return {
    name: r.name, founded: !!r.founded, population: Math.round(r.people?.total || 0), money: Math.round(r.money || 0),
    milestone: r.milestone || 0, day: Math.floor(r.day || 0), lastPlayed: Date.now(), size: r.size,
    rates: { ...(r.rates || {}) }, stock: { ...(r.stock || {}) }, links: Array.isArray(r.links) ? r.links.slice() : undefined,
  };
}

/** Save one region's city into world `id`. Async (gzip). opts.snap = its world-map picture (map.js snapshot()), stored
 *  beside it; a picture that doesn't fit is skipped, never the city. → { ok, bytes, packed: 'gz1'|'js1', reason?, snap } */
export async function saveRegionTo(id, regionState, opts = {}) {
  const idx = readIndex(); const meta = idx.worlds.find(w => w.id === id);
  if (!meta) return { ok: false, reason: 'no-world' };
  const text = await pack(saveRegion(regionState));
  const res = storage.set(regionKey(id, regionState.id), text);
  if (!res.ok) return { ok: false, reason: res.reason, bytes: text.length };
  const prevSnap = meta.regions[regionState.id]?.snapAt;
  meta.regions[regionState.id] = summarize(regionState);
  let snap = false;
  if (opts.snap?.url) { snap = storage.set(snapKey(id, regionState.id), JSON.stringify(opts.snap)).ok; }
  if (snap) meta.regions[regionState.id].snapAt = Date.now(); else if (prevSnap) meta.regions[regionState.id].snapAt = prevSnap;
  meta.lastPlayed = Date.now();
  const r2 = writeIndex(idx);
  if (!r2.ok) return { ok: false, reason: r2.reason, bytes: text.length };
  storage.set(KEYS.last, id);
  saved({ world: id, region: regionState.id });
  return { ok: true, bytes: text.length, packed: text.slice(0, 3), snap };
}

/** Mark a world as just opened (Continue order) without saving a city. */
export function touchWorld(id) {
  const idx = readIndex(); const meta = idx.worlds.find(w => w.id === id); if (!meta) return false;
  meta.lastPlayed = Date.now(); writeIndex(idx); storage.set(KEYS.last, id); return true;
}
export function renameWorld(id, name) {
  const idx = readIndex(); const meta = idx.worlds.find(w => w.id === id); if (!meta) return false;
  meta.name = String(name).trim().slice(0, 40) || meta.name;
  const ok = writeIndex(idx).ok; if (ok) saved({ world: id }); return ok;
}
export function deleteWorld(id) {
  const idx = readIndex(); const before = idx.worlds.length;
  idx.worlds = idx.worlds.filter(w => w.id !== id);
  for (const k of storage.keys()) if (k.startsWith(`${REGION_PREFIX}${id}.`) || k.startsWith(`${SNAP_PREFIX}${id}.`)) storage.remove(k);
  writeIndex(idx);
  if (storage.get(KEYS.last) === id) storage.remove(KEYS.last);
  saved({ world: id, deleted: true });
  return idx.worlds.length < before;
}

// ------------------------------------------------------------------ packing (gzip + base64 when the browser can)
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); };
const fromB64 = str => { const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary'); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
async function pipe(u8, Stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Stream('gzip'))).arrayBuffer()); }
export const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function' && typeof Blob === 'function';

/** Object → stored string. `force: 'plain'` skips gzip (tests use it for the fallback). */
export async function pack(obj, { force = null } = {}) {
  const text = JSON.stringify(obj);
  if (force !== 'plain' && canGzip()) {
    try { return 'gz1:' + toB64(await pipe(new TextEncoder().encode(text), CompressionStream)); } catch { /* fall back */ }
  }
  return 'js1:' + text;
}
export async function unpack(str) {
  if (str.startsWith('gz1:')) return JSON.parse(new TextDecoder().decode(await pipe(fromB64(str.slice(4)), DecompressionStream)));
  if (str.startsWith('js1:')) return JSON.parse(str.slice(4));
  return JSON.parse(str);
}

// ------------------------------------------------------------------ planet names (original, from a seed)
const P1 = ['Ves', 'Kor', 'Tal', 'Ny', 'Or', 'Quel', 'Sar', 'Ith', 'Dro', 'Ul', 'Zeph', 'Cal', 'Mir', 'Thes', 'Aru', 'Eno', 'Lyr', 'Pax', 'Rho', 'Sil'];
const P2 = ['ara', 'ion', 'ex', 'ura', 'is', 'eth', 'ova', 'ane', 'yx', 'olis', 'ade', 'ira', 'un', 'essa', 'or'];
const P3 = ['', '', '', ' Prime', ' Minor', ' II', ' III', ' IV', ' VI', ' Deep', ' Reach'];
/** A planet name from a number (same number → same name). */
export function planetName(n) {
  let h = (Math.floor(n) * 2654435761) >>> 0; const pick = a => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return a[h % a.length]; };
  return pick(P1) + pick(P2) + pick(P3);
}
export const randomSeed = () => 1 + Math.floor(Math.random() * 999999);
