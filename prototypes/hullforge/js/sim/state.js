// The saved game. One long save per slot (three slots). The ship is stored twice over: its DESIGN (what you built
// in the Shipyard: every block, paint and fitted part) and its DAMAGE (hit points of each block right now; a block
// shot off has 0 until it is repaired). Items are stored once in G.items and referenced by uid.

import { gridFromSave, gridToSave, key, put, createGrid, remove } from './grid.js';
import { makeItem, setNextUid, itemPrice } from './items.js';
import { buildStarter } from './shipgen.js';
import { STRUCTURE, ORES, BLOCKS } from '../data/blocks.js';
import { rng, hash } from '../core/math.js';
import { researchBonus } from './research.js';   // economy: research bonuses ride on the ship grid

export const SAVE_VERSION = 1;
export const SLOTS = 3;
const SLOT_KEY = i => `hullforge.slot.${i}`;
export const LAST_KEY = 'hullforge.last';

export function newGame({ slot = 0, starter = 'wasp', captain = 'Captain', shipName = 'Hullforge', paint = 0, accent = 2, seed = Date.now() % 1e9 } = {}) {
  const G = {
    v: SAVE_VERSION, slot, created: new Date().toISOString(), captain, shipName,
    credits: 400, cargo: {}, items: [], design: null, hp: {}, starter,
    galaxySeed: seed, system: 0, visited: [0], stock: {}, playTime: 0,
    goals: { done: [], seen: [] }, stats: { kills: 0, mined: 0, earned: 0, sold: 0, jumps: 0, bosses: 0, deaths: 0, maxDanger: 1 },
    ...economyDefaults(),
  };
  worldDefaults(G);   // world: standing, jobs, freight, outposts, drones
  const newItem = (kind, tier, rarity) => { const it = makeItem(kind, tier, rarity); G.items.push(it); return it; };
  const g = buildStarter(starter, newItem, paint, accent);
  G.design = gridToSave(g);
  // one spare part to try in the Shipyard on day one
  newItem(starter === 'mule' ? 'autocannon' : 'gatling', 1, 1);
  return G;
}

// economy: trade goods, markets, research, insurance, saved blueprints (each has a default so old saves load)
export function economyDefaults() {
  return { goods: {}, goodsPaid: {}, markets: {}, priceSeen: {}, research: { done: [] }, insurance: null, blueprints: [] };
}

export const itemsByUid = G => new Map(G.items.map(i => [i.uid, i]));
/** The ship's design as a grid at full health. Carries the research bonuses (stats.js computeStats reads g.bonus). */
export function designGrid(G) { const g = gridFromSave(G.design, itemsByUid(G)); g.bonus = researchBonus(G); return g; }
/** The ship as it is now: the design, damaged blocks at their saved hit points, shot-off blocks missing. */
export function liveGrid(G) {
  const g = designGrid(G);
  for (const [k, hp] of Object.entries(G.hp || {})) {
    const b = g.cells.get(+k); if (!b) continue;
    if (hp <= 0) remove(g, b.x, b.y, b.z); else b.hp = Math.min(b.maxHp, hp);
  }
  return g;
}
/** Remember the live ship's damage against the design. */
export function storeDamage(G, grid) {
  const d = designGrid(G); const hp = {};
  for (const [k, b] of d.cells) { const live = grid.cells.get(k); if (!live) hp[k] = 0; else if (live.hp < b.maxHp - 0.5) hp[k] = Math.round(live.hp); }
  G.hp = hp;
}
export const installedUids = G => new Set(G.design.map(r => r[6]).filter(Boolean));
export const looseItems = G => { const inst = installedUids(G); return G.items.filter(i => !inst.has(i.uid)); };

/** What it costs to put the ship back to its design (missing blocks + lost hit points). */
export function repairCost(G) {
  const d = designGrid(G); let cost = 0;
  for (const [k, hp] of Object.entries(G.hp || {})) {
    const b = d.cells.get(+k); if (!b) continue;
    const missing = (b.maxHp - Math.max(0, hp)) / b.maxHp;
    const blockPrice = STRUCTURE[b.t]?.cost ?? (b.item ? itemPrice(b.item) * 0.05 : 10);
    cost += missing * (6 + blockPrice * (hp <= 0 ? 0.6 : 0.25));
  }
  return Math.round(cost * researchBonus(G).repair);   // economy: research makes repairs (and rebuilds) cheaper
}

/** Cargo room in use: ore AND trade goods share the one hold (economy). */
export function cargoUsed(G) { return oreUsed(G) + Object.values(G.goods || {}).reduce((a, b) => a + b, 0) + Object.values(G.freight || {}).reduce((a, b) => a + b, 0); }   // world: + job freight
export function oreUsed(G) { return Object.values(G.cargo).reduce((a, b) => a + b, 0); }
export function cargoValue(G, prices) { return Object.entries(G.cargo).reduce((a, [o, n]) => a + n * (prices?.[o] ?? ORES[o]?.price ?? 0), 0); }

// --------------------------------------------------------------- shops
/** What the outfitter sells here: seeded by the system and how many times you have arrived (restocks on arrival). */
export function shopStock(sys, visits, tierBonus = 0) {
  const r = rng(hash(sys.seed, 'shop', visits));
  const out = [];
  const tierMax = Math.min(4, 1 + Math.floor((sys.danger - 1) / 1.5) + tierBonus);   // economy: tierBonus from research
  const kinds = ['autocannon', 'gatling', 'laser', 'railgun', 'flak', 'missile', 'plasma', 'mining', 'reactor', 'thruster', 'gyro', 'shield', 'cargo', 'targeting', 'bridge', 'dronebay', 'scanner'];   // world: + drone bay, scanner
  for (const k of kinds) {
    const n = k === 'bridge' ? 1 : r() < 0.75 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const tier = Math.max(1, tierMax - (r() < 0.55 ? 0 : 1));
      if ((k === 'railgun' || k === 'missile' || k === 'plasma') && sys.danger < 2 && r() < 0.6) continue;
      const rarity = r() < 0.12 + sys.danger * 0.04 ? 2 : r() < 0.4 ? 1 : 0;
      out.push({ kind: k, tier: k === 'bridge' ? Math.min(4, tierMax + (sys.danger >= 3 ? 0 : 1)) : tier, rarity: k === 'bridge' ? 0 : rarity });
    }
  }
  return out;
}
/** Ore prices at a station (a little different in each system). */
export function orePrices(sys) {
  const r = rng(hash(sys.seed, 'ore')); const out = {};
  for (const [id, o] of Object.entries(ORES)) out[id] = Math.round(o.price * (0.85 + r() * 0.35) * (1 + sys.danger * 0.04) * (sys.oreMul || 1));   // world: oreMul = the owner's standing
  return out;
}

// --------------------------------------------------------------- storage
export function save(G) {
  try {
    G.savedAt = new Date().toISOString();
    localStorage.setItem(SLOT_KEY(G.slot), JSON.stringify(G)); localStorage.setItem(LAST_KEY, String(G.slot)); return true;
  } catch { return false; }
}
export function load(slot) {
  try {
    const raw = localStorage.getItem(SLOT_KEY(slot)); if (!raw) return null;
    const G = JSON.parse(raw); return migrate(G);
  } catch { return null; }
}
export function slotInfo(slot) {
  const G = load(slot); if (!G) return null;
  return { slot, captain: G.captain, shipName: G.shipName, credits: G.credits, system: G.system, savedAt: G.savedAt, playTime: G.playTime, blocks: G.design.length };
}
export function deleteSlot(slot) { try { localStorage.removeItem(SLOT_KEY(slot)); } catch { /* blocked */ } }
export function lastSlot() { try { const v = localStorage.getItem(LAST_KEY); return v == null ? null : +v; } catch { return null; } }
export function migrate(G) {
  if (!G || !Array.isArray(G.design)) return null;
  G.items = (G.items || []).filter(i => BLOCKS[i.kind]);
  for (const it of G.items) setNextUid(it.uid + 1);
  G.cargo ||= {}; G.hp ||= {}; G.goals ||= { done: [], seen: [] }; G.stats ||= {}; G.visited ||= [0]; G.stock ||= {};
  for (const k of ['kills', 'mined', 'earned', 'sold', 'jumps', 'bosses', 'deaths']) G.stats[k] ||= 0;
  G.stats.maxDanger ||= 1;
  // economy: new fields default in (older saves have none of them)
  const d = economyDefaults();
  for (const k of Object.keys(d)) if (G[k] === undefined || (k !== 'insurance' && G[k] == null)) G[k] = d[k];
  G.research.done ||= [];
  worldDefaults(G);   // world:
  return G;
}
// world: round 2 save fields (standing, jobs, job freight, outposts, drones, research points from outpost labs).
// Every one has its default here, used by both newGame and migrate.
export function worldDefaults(G) {
  G.rep = { traders: 0, navy: 0, pirate: -40, swarm: -60, ...(G.rep || {}) };
  G.missions ||= { active: [], taken: [], done: 0 }; G.missions.active ||= []; G.missions.taken ||= []; G.missions.done ||= 0;
  G.freight ||= {};
  G.outposts ||= [];
  G.drones ||= []; G.droneBays ||= {}; if (G.dronesOut == null) G.dronesOut = true;
  G.researchPoints ||= 0;
  for (const k of ['missions', 'salvaged', 'scans', 'encounters']) G.stats[k] ||= 0;
  for (const d of G.drones) setNextUid(d.uid + 1);
  for (const o of G.outposts) for (const it of o.store?.parts || []) setNextUid(it.uid + 1);   // parts waiting at an outpost keep their ids
  return G;
}
export { put, createGrid, key };
