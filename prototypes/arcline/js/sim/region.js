// The state of one region's city — the object every sim module reads and changes — plus founding, save and load.
// Typed arrays are index z*size+x. Save is plain JSON (typed arrays as base64), and every field round-trips
// (lessons rule 36; tests/region.test.mjs reads the real save call).
import { generateTerrain, settleRivers } from './terrain.js';
import { T } from './tuning.js';
import { rng } from '../../../../citykit/js/kit/rng.js';

export const SAVE_VERSION = 2;   // 2: rivers settled below their banks (report #70)
export const RAW = ['metal', 'stone', 'crystal'], REFINED = ['steel', 'concrete', 'cells'];
// tile layers beyond the terrain's: what's been built
export const LAYERS = ['zone', 'road', 'power', 'pipe', 'lot', 'wall', 'wallHp', 'value', 'edu', 'leisure', 'traffic', 'transit'];
const TYPES = { zone: Uint8Array, road: Uint8Array, power: Uint8Array, pipe: Uint8Array, lot: Int32Array, wall: Uint8Array, wallHp: Float32Array, value: Float32Array, edu: Float32Array, leisure: Float32Array, traffic: Float32Array, transit: Uint8Array };
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3 };

export function newRegion(world, wr) {
  const ter = generateTerrain(world, wr), N = ter.size;
  const tiles = {};
  for (const k of LAYERS) tiles[k] = new TYPES[k](N * N);
  tiles.lot.fill(-1);
  return {
    v: SAVE_VERSION, id: wr.id, name: wr.name, size: N, seed: world.seed * 1000 + wr.id, biome: wr.biome,
    ter, tiles, lots: [], turrets: [],
    day: 0, founded: false, core: null,
    money: 0, loans: [], taxes: { R: T.taxDefault ?? 0.09, C: T.taxDefault ?? 0.09, I: T.taxDefault ?? 0.09 },
    stock: { metal: 0, stone: 0, crystal: 0, steel: 0, concrete: 0, cells: 0 },
    people: { total: 0, arriving: 0, born: 0, edu: 0 },
    milestone: 0, log: [],
    ships: { next: 0, passing: [], strikes: 0, lanceReady: 0, history: [] },
    rates: { money: 0, metal: 0, stone: 0, crystal: 0, steel: 0, concrete: 0, cells: 0, people: 0 },
    reputation: 0, nests: ter.nests.map(n => ({ ...n, hp: 1, angry: 0 })), lastActive: 0,
  };
}

/** Found the city: the Colony Core lands at (x, z) (top-left of its 3×3), nests near it are cleared, money given. */
export function found(region, x, z) {
  const R = rng(region.seed + 17);
  region.founded = true; region.core = { x, z }; region.foundedDay = region.day;
  region.money = T.foundingMoney;
  region.people.arriving = T.foundingSettlers;
  // nests too close to the landing are gone (the drop scares them off): a fair start (lessons rule 39)
  region.nests = region.nests.filter(n => Math.hypot(n.x - (x + 1.5), n.z - (z + 1.5)) > 22);
  region.ships.next = (T.shipEveryMin ?? 11) * 60 * 0.6;   // the first ship comes a bit sooner
  region.log.push({ day: 0, text: 'The founding ship landed. The first settlers are coming down.' });
  return R;
}

// ---------- save / load ----------
const b64 = arr => { const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')); };
const unb64 = (str, Type) => { const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary'); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return new Type(u8.buffer); };
const TER_TYPES = { height: Uint8Array, water: Uint8Array, deposit: Uint8Array, amount: Uint16Array, flora: Uint8Array, biome: Uint8Array };

export function saveRegion(r) {
  const out = { ...r, ter: { size: r.ter.size, nests: r.ter.nests }, tiles: {} };
  for (const k of Object.keys(TER_TYPES)) out.ter[k] = b64(r.ter[k]);
  for (const k of LAYERS) out.tiles[k] = b64(r.tiles[k]);
  return JSON.parse(JSON.stringify(out));
}
export function loadRegion(s) {
  const r = { ...s, ter: { size: s.ter.size, nests: s.ter.nests }, tiles: {} };
  for (const [k, Type] of Object.entries(TER_TYPES)) r.ter[k] = unb64(s.ter[k], Type);
  for (const k of LAYERS) r.tiles[k] = unb64(s.tiles[k], TYPES[k]);
  if ((s.v || 1) < 2) { settleRivers(r.ter); r.v = SAVE_VERSION; }   // saves made before the river fix (report #70) had raised wide rivers
  return r;
}
