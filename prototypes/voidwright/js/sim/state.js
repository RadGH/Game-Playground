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
    credits: 400, cargo: { ferrite: 10 }, goods: {}, parts: [], specimens: [], passengers: 0,
    ship: { design: 'sparrow', cls: ship.cls, name: 'Sparrow', grid: gridToJSON(ship.grid), crew: ship.crew },
    hangar: [],                  // other owned ships: [{ design, cls, name, grid, crew }]
    designs: [],                 // saved build-mode layouts
    drones: [],                  // drone kinds in the bay
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
  G.itemCounter = itemCounter();
  G.savedAt = Date.now();
  const ok = ls.set(KEY(G.slot), JSON.stringify(G));
  ls.set('voidwright.last', String(G.slot));
  try { globalThis.app?.cloud?.saveSoon?.(); } catch { /* not in a browser */ }
  return ok;
}
export function load(slot) {
  const raw = ls.get(KEY(slot)); if (!raw) return null;
  try { const G = JSON.parse(raw); setItemCounter(G.itemCounter || 1); return G; } catch { return null; }
}
export function slots() {
  const out = [];
  for (let i = 0; i < 4; i++) { const raw = ls.get(KEY(i)); if (!raw) { out.push(null); continue; } try { const G = JSON.parse(raw); out.push({ slot: i, name: G.name, ship: G.ship.name, cls: G.ship.cls, credits: G.credits, savedAt: G.savedAt, chapter: G.quest?.chapter || 0, playTime: G.playTime || 0 }); } catch { out.push(null); } }
  return out;
}
export const lastSlot = () => +(ls.get('voidwright.last') ?? -1);
export const deleteSlot = slot => ls.del(KEY(slot));
export function sysMem(G, id) { return (G.sys[id] ||= { dead: [], looted: [], claims: [] }); }
