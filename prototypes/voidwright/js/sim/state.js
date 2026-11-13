// The saved game (one long save, several slots — PLAN §0 #4). Everything that outlives a star system
// lives here: money, holds, parts, ships, reputation, quest progress, unlocks, per-system memory.

import { buildPremade } from './shipgen.js';
import { gridToJSON, gridFromJSON } from './grid.js';
import { makeBody, recompute } from './ship.js';
import { setItemCounter, itemCounter, makeItem } from './loot.js';
import { rng } from '../core/math.js';
import { generateGalaxy } from './galaxy.js';
import { applyResearch } from './research.js';

export const SAVE_VERSION = 1;
const KEY = slot => `voidwright.slot.${slot}`;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del(k) { try { localStorage.removeItem(k); } catch { /* */ } } };

export function newGame({ seed = (Math.random() * 1e9) | 0, slot = 0, name = 'Captain' } = {}) {
  const gal = generateGalaxy(seed);
  const ship = buildPremade('sparrow');
  const r = rng(seed);
  const G = {
    v: SAVE_VERSION, seed, slot, name, created: Date.now(), playTime: 0,
    credits: 400, cargo: { ferrite: 10, rock: 10 }, drive: 1, goods: {}, parts: [], specimens: [],
    ship: { design: 'sparrow', cls: ship.cls, name: 'Sparrow', grid: gridToJSON(ship.grid), crew: ship.crew, drones: [] },
    hangar: [],                  // other owned ships: [{ design, cls, name, grid, crew }]
    designs: [],                 // saved build-mode layouts
    droneItems: [],              // drone items you own: [{ uid, kind, rarity, name }] — fitted ones are in ship.drones
    caches: [], uniques: [],     // sealed caches to crack at a station; named uniques found (collection log)
    rep: { guild: 10, navy: 5, redfang: -60, vesh: -100, lattice: -100, ossari: -100, kharr: -100 },
    system: gal.start, docked: null, lastStation: { system: gal.start },
    insured: false, insurance: { tier: 0 },
    sys: {},                     // per-system memory: { dead:[], looted:[], claims:[] }
    markets: {},                 // per-system market state
    priceMemory: {},             // best prices seen: { good: { buy: {sys, price}, sell: {sys, price} } }
    claims: [],                  // mining claims you own: { system, x, y, mat, rate, last }
    bounties: [], research: { points: 0, done: [], seen: {} }, costBasis: {}, shopTaken: {},
    bosses: [], visited: [gal.start], seenSystems: [gal.start, ...gal.systems[gal.start].links],
    stats: { mined: 0, kills: 0, killsBy: {}, killsCls: {}, sold: 0, bought: 0, profit: 0, jumps: 0, dragged: 0, maxTier: 1, docks: 0, built: 0, rescued: 0, specimens: 0, bossKills: 0, strongholds: 0, deaths: 0, drones: 0, tradeProfit: 0 },
    quest: { chapter: 0, done: [], progress: {} },
    unlocked: { flight: true, mining: true },
    settings: {},
    itemCounter: 1,
  };
  // a starter part so the hold is not empty
  G.parts.push(makeItem(r, 'pulse_laser', 'common'));
  return G;
}

/** The player's ship body from the save. */
export function playerShip(G) {
  const grid = gridFromJSON(G.ship.grid);
  const s = makeBody('ship', grid, { cls: G.ship.cls, team: 'player', faction: 'player', name: G.ship.name, palette: G.ship.palette || null });
  applyResearch(s, G);
  s.crew = Math.min(G.ship.crew ?? s.stats.crewCap, s.stats.crewCap); recompute(s);
  return s;
}
/** Write the live ship back into the save (after build mode, before saving). */
export function storeShip(G, s) {
  G.ship.grid = gridToJSON(s.grid); G.ship.cls = s.cls; G.ship.crew = s.crew;
}

export function save(G) {
  G.itemCounter = itemCounter(); G.droneUid = droneUid;
  G.savedAt = Date.now();
  const ok = ls.set(KEY(G.slot), JSON.stringify(G));
  ls.set('voidwright.last', String(G.slot));
  try { globalThis.app?.cloud?.saveSoon?.(); } catch { /* not in a browser */ }
  return ok;
}
export function load(slot) {
  const raw = ls.get(KEY(slot)); if (!raw) return null;
  try { const G = JSON.parse(raw); setItemCounter(G.itemCounter || 1); setDroneUid(G.droneUid || 1 + (G.droneItems || []).reduce((m, d) => Math.max(m, d.uid), 0)); return G; } catch { return null; }
}
export function slots() {
  const out = [];
  for (let i = 0; i < 4; i++) { const raw = ls.get(KEY(i)); if (!raw) { out.push(null); continue; } try { const G = JSON.parse(raw); out.push({ slot: i, name: G.name, ship: G.ship.name, cls: G.ship.cls, credits: G.credits, savedAt: G.savedAt, chapter: G.quest?.chapter || 0, playTime: G.playTime || 0 }); } catch { out.push(null); } }
  return out;
}
export const lastSlot = () => +(ls.get('voidwright.last') ?? -1);
export const deleteSlot = slot => ls.del(KEY(slot));
export function sysMem(G, id) { return (G.sys[id] ||= { dead: [], looted: [], claims: [] }); }

/** A drone item (bought, crafted or looted). */
export function makeDroneItem(kind, rarity = 'common', uid = null) {
  return { uid: uid ?? nextDroneUid(), kind, rarity };
}
let droneUid = 1;
const nextDroneUid = () => droneUid++;
export const setDroneUid = n => { droneUid = Math.max(droneUid, n); };
/** The drone items fitted to the flagship, up to its drone-port capacity. */
export function fittedDrones(G, cap) {
  const ids = (G.ship.drones || []).slice(0, cap);
  return ids.map(u => (G.droneItems || []).find(d => d.uid === u)).filter(Boolean);
}
/**
 * Choose which owned drones fly (report #53). Returns { ok, why } — `why` is a sentence for the player.
 *   fitDrone:   put a stored drone into a free port
 *   unfitDrone: send a flying drone back to storage
 *   swapDrone:  a stored drone takes a flying drone's place (keeps its position in the fan)
 */
export function fitDrone(G, uid, cap) {
  const list = (G.ship.drones ||= []).filter(u => (G.droneItems || []).some(d => d.uid === u)); G.ship.drones = list;
  if (!(G.droneItems || []).some(d => d.uid === uid)) return { ok: false, why: 'You do not own that drone.' };
  if (list.includes(uid)) return { ok: false, why: 'That drone is already flying.' };
  if (!cap) return { ok: false, why: 'Place a Drone port in Build mode first.' };
  if (list.length >= cap) return { ok: false, why: `All ${cap} drone port${cap === 1 ? ' is' : 's are'} in use — swap one out.` };
  list.push(uid); return { ok: true };
}
export function unfitDrone(G, uid) {
  const before = (G.ship.drones || []).length; G.ship.drones = (G.ship.drones || []).filter(u => u !== uid);
  return { ok: G.ship.drones.length < before, why: '' };
}
export function swapDrone(G, outUid, inUid) {
  const list = G.ship.drones || []; const i = list.indexOf(outUid);
  if (i < 0) return { ok: false, why: 'That drone is not flying.' };
  if (list.includes(inUid) || !(G.droneItems || []).some(d => d.uid === inUid)) return { ok: false, why: 'Pick a stored drone to swap in.' };
  list[i] = inUid; return { ok: true };
}
