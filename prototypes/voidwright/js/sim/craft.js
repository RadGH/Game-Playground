// Crafting (play-test #25 + owner ruling E9, 2026-11-12): turn mined ore into parts.
//   recipe(blockId)      → { mats, cr } — structural + energy ore of the part's tier (+ a little exotic for
//                           computing and high-end parts), from the part's shop value, so mining pays like buying
//   craft(G, id, boost)  → spends the recipe (+ boost × exotic) and rolls a part; each boost step raises the
//                           rarity odds; a Forge bay / outpost factory adds more (`edge`)
//   reroll(G, item, key) → re-rolls ONE bonus on a part you own for exotic ore + credits
//   openCache(G, cache)  → a sealed cache: always rare or better, plus ore, sometimes a named unique
// Pure: G is the save, r a seeded rng. The UI is ui/workshop.js.

import { BLOCKS } from '../data/blocks.js';
import { DRONES } from '../data/drones.js';
import { MATERIALS, RARITY, RARITY_BY_ID, matOf } from '../data/types.js';
import { makeItem, rollRarity, AFFIX, rollUnique } from './loot.js';
import { makeDroneItem } from './state.js';

/** Material tier for a part's tier (parts go to tier 6, ore to 5). */
export const partMatTier = t => [1, 1, 2, 3, 4, 5, 5][Math.max(0, Math.min(6, t || 1))];

/** What share of a part's value goes to each ore role, by part category. */
const SPLIT = {
  weapon: { structural: 0.35, energy: 0.5, exotic: 0.15 }, shield: { structural: 0.2, energy: 0.5, exotic: 0.3 },
  power: { structural: 0.3, energy: 0.6, exotic: 0.1 }, engine: { structural: 0.4, energy: 0.5, exotic: 0.1 },
  gyro: { structural: 0.6, energy: 0.3, exotic: 0.1 }, cpu: { structural: 0.15, energy: 0.25, exotic: 0.6 },
  crew: { structural: 0.7, energy: 0.3, exotic: 0 }, cargo: { structural: 0.8, energy: 0.2, exotic: 0 },
  utility: { structural: 0.3, energy: 0.4, exotic: 0.3 }, drone: { structural: 0.4, energy: 0.4, exotic: 0.2 },
  core: { structural: 0.4, energy: 0.3, exotic: 0.3 },
};
const ORE_SHARE = 0.55;          // crafting from ore costs about 55% of the part's shop price in ore value…
const FEE = 0.08;                // …plus an 8% fee in credits

/** Can this block be crafted at all? (modules you could buy; not enemy-only, not alien race parts) */
export const craftable = d => !!d && d.module && !d.enemyOnly && !d.race && (!d.core || d.id !== 'bridge');   // better bridges can be crafted (#61)

export function recipe(id) {
  const d = BLOCKS[id]; if (!craftable(d)) return null;
  const t = partMatTier(d.tier); const value = d.cost?.cr || 100; const split = SPLIT[d.cat] || SPLIT.utility;
  const mats = {};
  for (const [role, share] of Object.entries(split)) {
    if (!share) continue;
    const m = matOf(role, t); const n = Math.max(1, Math.round(value * ORE_SHARE * share / MATERIALS[m].price));
    mats[m] = n;
  }
  return { mats, cr: Math.round(value * FEE), tier: t };
}

/** Drone recipe: its build cost moved onto the ore of its tier, plus a credit fee. */
export function droneRecipe(kind) {
  const D = DRONES[kind]; if (!D || D.enemy) return null;
  const t = partMatTier(D.tier); const value = D.cost?.cr || 200;
  const mats = { [matOf('structural', t)]: Math.max(1, Math.round(value * 0.3 / MATERIALS[matOf('structural', t)].price)), [matOf('energy', t)]: Math.max(1, Math.round(value * 0.25 / MATERIALS[matOf('energy', t)].price)) };
  return { mats, cr: Math.round(value * 0.15), tier: t };
}

/** Extra exotic ore one boost step costs for a recipe tier, and the rarity bonus per step. */
export const boostCost = t => ({ [matOf('exotic', t)]: 2 + t * 2 });
export const BOOST_STEP = 0.55;
export const MAX_BOOST = 3;

/** Total cost of crafting with `boost` steps. */
export function craftCost(rec, boost = 0) {
  const mats = { ...rec.mats };
  for (const [m, n] of Object.entries(boostCost(rec.tier))) mats[m] = (mats[m] || 0) + n * boost;
  return { mats, cr: rec.cr };
}
export function missing(G, cost) {
  const out = [];
  for (const [m, n] of Object.entries(cost.mats)) if ((G.cargo[m] || 0) < n) out.push([m, n - (G.cargo[m] || 0)]);
  if (G.credits < cost.cr) out.push(['cr', cost.cr - G.credits]);
  return out;
}
function spend(G, cost) {
  for (const [m, n] of Object.entries(cost.mats)) { G.cargo[m] -= n; if (G.cargo[m] <= 0) delete G.cargo[m]; }
  G.credits -= cost.cr;
}

/** Chance of each rarity for a craft (for the screen): [{ id, p }]. Never relic from a fabricator. */
export function craftOdds(tier, boost, edge = 0) {
  const bonus = boost * BOOST_STEP + edge;
  const shift = (tier - 1) * 0.18 + bonus;
  // a relic roll is handed out as a legendary (craft / craftDrone), so its share is counted there
  const w = id => RARITY_BY_ID[id].weight * Math.pow(1 + RARITY_BY_ID[id].index * 0.9, shift);
  const list = RARITY.filter(x => x.id !== 'relic').map(x => ({ id: x.id, w: w(x.id) + (x.id === 'legendary' ? w('relic') : 0) }));
  const sum = list.reduce((s, x) => s + x.w, 0);
  return list.map(x => ({ id: x.id, p: x.w / sum }));
}

/** Chance a sealed cache holds a named unique (openCache). */
export const cacheUniqueChance = tier => 0.08 + (tier || 1) * 0.01;
/**
 * The real odds of a sealed cache (mirrors openCache): a named unique, else a rarity rolled at tier + 2 with a
 * +1.2 bonus where anything under rare becomes rare. 'unique' is its own entry (the reel shows it).
 */
export function cacheOdds(tier = 1) {
  const shift = (tier + 1) * 0.18 + 1.2;
  const w = id => RARITY_BY_ID[id].weight * Math.pow(1 + RARITY_BY_ID[id].index * 0.9, shift);
  const sum = RARITY.reduce((s, x) => s + w(x.id), 0); const uq = cacheUniqueChance(tier);
  const out = RARITY.filter(x => RARITY_BY_ID[x.id].index >= 2).map(x => ({ id: x.id, p: w(x.id) / sum }));
  out[0].p += (w('common') + w('uncommon')) / sum;
  for (const o of out) o.p *= 1 - uq;
  return [...out, { id: 'unique', p: uq }];
}

/** Craft a part. Returns { ok, item } or { ok:false, why }. */
export function craft(G, r, id, boost = 0, edge = 0) {
  const rec = recipe(id); if (!rec) return { ok: false, why: 'That part cannot be crafted.' };
  const cost = craftCost(rec, boost); const miss = missing(G, cost);
  if (miss.length) return { ok: false, why: 'missing', miss };
  spend(G, cost);
  let rar = rollRarity(r, rec.tier * 2 - 1, boost * BOOST_STEP + edge);
  if (rar.id === 'relic') rar = RARITY_BY_ID.legendary;
  const item = makeItem(r, id, rar.id);
  G.parts.push(item); G.stats.crafted = (G.stats.crafted || 0) + 1;
  return { ok: true, item };
}
export function craftDrone(G, r, kind, boost = 0, edge = 0) {
  const rec = droneRecipe(kind); if (!rec) return { ok: false, why: 'That drone cannot be built.' };
  const cost = craftCost(rec, boost); const miss = missing(G, cost);
  if (miss.length) return { ok: false, why: 'missing', miss };
  spend(G, cost);
  let rar = rollRarity(r, rec.tier * 2 - 1, boost * BOOST_STEP + edge);
  if (rar.id === 'relic') rar = RARITY_BY_ID.legendary;
  const d = makeDroneItem(kind, rar.id); (G.droneItems ||= []).push(d); G.stats.crafted = (G.stats.crafted || 0) + 1;
  return { ok: true, drone: d };
}

/** Bonuses on a part that can be re-rolled (rolled ones, not the named power). */
export function rerollable(item) {
  const d = BLOCKS[item.block]; if (!d || item.unique) return [];
  return Object.keys(item.mods || {}).filter(k => AFFIX.some(a => a.key === k && a.when(d)));
}
export function rerollCost(item) {
  const d = BLOCKS[item.block]; const t = partMatTier(d.tier); const ri = RARITY_BY_ID[item.rarity]?.index || 0;
  return { mats: { [matOf('exotic', t)]: 3 + t * 2 + ri * 2 }, cr: Math.round((d.cost?.cr || 100) * 0.1 * (1 + ri)) };
}
/** Swap one rolled bonus for a fresh roll of any bonus that fits the part (may land on the same kind). */
export function reroll(G, r, item, key) {
  if (!rerollable(item).includes(key)) return { ok: false, why: 'That bonus cannot be re-rolled.' };
  const cost = rerollCost(item); const miss = missing(G, cost);
  if (miss.length) return { ok: false, why: 'missing', miss };
  spend(G, cost);
  const d = BLOCKS[item.block]; const ri = RARITY_BY_ID[item.rarity]?.index || 0;
  const others = new Set(Object.keys(item.mods).filter(k => k !== key));
  const pool = AFFIX.filter(a => a.when(d) && !others.has(a.key));
  const a = r.pick(pool);
  const scale = (d.size || 1) ** 2 * Math.max(1, Math.ceil((d.tier || 1) / 2));
  const k = Math.min(1, r() * 0.7 + ri * 0.08);
  delete item.mods[key];
  item.mods[a.key] = a.flat ? Math.round(a.flat[0] + (a.flat[1] - a.flat[0]) * k) * (a.key === 'cpuLess' || a.key === 'slots' || a.key === 'drones' ? 1 : scale) : +(a.pct[0] + (a.pct[1] - a.pct[0]) * k).toFixed(3);
  // the name leads with its first bonus
  const lead = AFFIX.find(x => x.key === Object.keys(item.mods).find(m => AFFIX.some(y => y.key === m)));
  const base = d.name + (item.name.includes(' of ') ? item.name.slice(item.name.indexOf(' of ')) : '');
  item.name = `${lead ? lead.name + ' ' : ''}${base}`;
  G.stats.rerolls = (G.stats.rerolls || 0) + 1;
  return { ok: true, item, key: a.key };
}

/** Price to have a cache cracked. */
export const cacheFee = c => 150 * (c.tier || 1);
/** Open a sealed cache: one part (rare or better), ore of its tier, a chance of a named unique. */
export function openCache(G, r, cache, pool) {
  const i = (G.caches || []).indexOf(cache); if (i < 0) return { ok: false, why: 'No such cache.' };
  const fee = cacheFee(cache); if (G.credits < fee) return { ok: false, why: 'missing', miss: [['cr', fee - G.credits]] };
  G.credits -= fee; G.caches.splice(i, 1);
  const tier = cache.tier || 1;
  const uq = rollUnique(r, 'cache', cacheUniqueChance(tier));
  let item = uq;
  if (!item) {
    let rar = rollRarity(r, tier + 2, 1.2);
    if ((RARITY_BY_ID[rar.id].index) < 2) rar = RARITY_BY_ID.rare;
    item = makeItem(r, r.pick(pool).id, rar.id);
  }
  G.parts.push(item);
  if (item.unique && !(G.uniques ||= []).includes(item.unique)) G.uniques.push(item.unique);
  const t = partMatTier(tier); const ore = { [matOf('exotic', t)]: 2 + r.int(0, 3), [matOf('energy', t)]: 5 + r.int(0, 8) };
  for (const [m, n] of Object.entries(ore)) G.cargo[m] = (G.cargo[m] || 0) + n;
  G.stats.caches = (G.stats.caches || 0) + 1;
  return { ok: true, item, ore };
}
