// The Workshop: craft parts from ore, and re-roll a part's bonus or try for a better rarity. Pure: G is the save,
// r a seeded random source (core/math.js rng). The screen is ui/workshop.js; the rarity reel is ui/reel.js.
//
//   recipe(kind, tier)      → { ore: { id: n }, cr, tier } — ore of the Mk's band worth ORE_SHARE of the part's shop
//                             price, plus a FEE in credits, so mining pays about like buying
//   craftOdds(tier, boost, luck) → [{ i: rarity index, p }] — the REAL odds (the reel and the screen show these)
//   craft(G, r, kind, tier, boost) → spends the recipe (+ boost × better ore), rolls rarity, adds a workshop bonus
//   rerollBonus / upgradeRarity  → for ore + credits on a part you own
// Better ore = better odds: each boost step adds a helping of the NEXT band's ore and shifts the odds up.

import { makeItem, itemPrice, rollBonus, BONUS_STATS } from './items.js';
import { RARITY, PARTS, TURRETS } from '../data/blocks.js';
import { researchBonus } from './research.js';

/** Which two ores each Mk is made from, and the better ore its boost steps use. */
export const TIER_ORES = [
  { ore: ['iron', 'copper'], boost: 'cobalt' },
  { ore: ['copper', 'cobalt'], boost: 'iridium' },
  { ore: ['cobalt', 'iridium'], boost: 'sunstone' },
  { ore: ['iridium', 'sunstone'], boost: 'sunstone' },
];
export const ORE_SHARE = 0.55;        // ore value ≈ 55% of the part's common shop price…
export const FEE = 0.1;               // …plus a 10% fee in credits
export const ORE_SPLIT = [0.6, 0.4];  // of that ore value: 60% the cheaper ore, 40% the dearer
export const BOOST_STEP = 0.35;       // rarity luck per boost step
export const MAX_BOOST = 3;
export const TIER_LUCK = 0.12;        // each Mk above I adds a little luck on its own
const BASE_W = [60, 26, 10, 3.4, 0.6];   // common … legendary weights at zero luck
const LUCK_K = 0.8;                       // weight of rarity i is multiplied by e^(i · luck · LUCK_K)

export const CRAFT_KINDS = [...Object.keys(TURRETS), ...Object.keys(PARTS)];
const ORE_PRICE = { iron: 6, copper: 11, cobalt: 19, iridium: 32, sunstone: 52 };

/** The ore and credits one craft of `kind` Mk `tier` takes (no boost). */
export function recipe(kind, tier) {
  if (!CRAFT_KINDS.includes(kind)) return null;
  const value = itemPrice({ kind, tier, rarity: 0 });
  const T = TIER_ORES[tier - 1]; const ore = {};
  T.ore.forEach((o, i) => { ore[o] = (ore[o] || 0) + Math.max(1, Math.round(value * ORE_SHARE * ORE_SPLIT[i] / ORE_PRICE[o])); });
  return { ore, cr: Math.round(value * FEE), tier, value };
}
/** Extra better-ore one boost step costs. */
export const boostOre = tier => ({ [TIER_ORES[tier - 1].boost]: 3 + tier * 2 });
/** The full cost of a craft with `boost` steps. */
export function craftCost(rec, boost = 0) {
  const ore = { ...rec.ore };
  for (const [o, n] of Object.entries(boostOre(rec.tier))) ore[o] = (ore[o] || 0) + n * boost;
  return { ore, cr: rec.cr };
}
/** [[ore or 'cr', short by]] for a cost. */
export function shortFor(G, cost) {
  const out = [];
  for (const [o, n] of Object.entries(cost.ore)) { const h = G.cargo?.[o] || 0; if (h < n) out.push([o, n - h]); }
  if (G.credits < cost.cr) out.push(['cr', cost.cr - G.credits]);
  return out;
}
function pay(G, cost) {
  for (const [o, n] of Object.entries(cost.ore)) { G.cargo[o] -= n; if (G.cargo[o] <= 0) delete G.cargo[o]; }
  G.credits -= cost.cr;
}

/** Luck of a craft: Mk + boost steps + research. */
export const craftLuck = (G, tier, boost) => (tier - 1) * TIER_LUCK + boost * BOOST_STEP + researchBonus(G).craftLuck;
/** The real chance of each rarity for a given luck: [{ i, p }]. */
export function oddsFor(luck) {
  const w = BASE_W.map((b, i) => b * Math.exp(i * luck * LUCK_K));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x, i) => ({ i, p: x / sum }));
}
export const craftOdds = (G, tier, boost) => oddsFor(craftLuck(G, tier, boost));
function roll(r, odds) { let v = r(); for (const o of odds) { v -= o.p; if (v <= 0) return o.i; } return odds[odds.length - 1].i; }

/** Craft a part. Returns { ok, item, odds } or { ok: false, short }. */
export function craft(G, r, kind, tier, boost = 0) {
  const rec = recipe(kind, tier); if (!rec) return { ok: false, short: [] };
  const cost = craftCost(rec, boost); const short = shortFor(G, cost);
  if (short.length) return { ok: false, short };
  const odds = craftOdds(G, tier, boost);
  pay(G, cost);
  const item = makeItem(kind, tier, roll(r, odds));
  item.bonus = rollBonus(r, item);
  G.items.push(item);
  G.stats.crafted = (G.stats.crafted || 0) + 1;
  return { ok: true, item, odds };
}

// ------------------------------------------------------------------ re-rolls
/** Re-rolling a bonus: some of the part's band ore plus credits. Dearer for better rarities. */
export function rerollCost(it) {
  const T = TIER_ORES[it.tier - 1]; const value = itemPrice({ kind: it.kind, tier: it.tier, rarity: 0 });
  return { ore: { [T.boost]: 2 + it.tier * 2 + it.rarity * 2 }, cr: Math.round(value * 0.08 * (1 + it.rarity * 0.5)) };
}
/** Swap the part's bonus for a fresh roll (any stat that fits the part; the size grows with rarity). */
export function rerollBonus(G, r, it) {
  if (!BONUS_STATS[it.kind]) return { ok: false, short: [] };
  const cost = rerollCost(it); const short = shortFor(G, cost);
  if (short.length) return { ok: false, short };
  pay(G, cost);
  const before = it.bonus || null;
  it.bonus = rollBonus(r, it);
  G.stats.rerolls = (G.stats.rerolls || 0) + 1;
  return { ok: true, before, after: it.bonus };
}

/** Trying for a better rarity: a fresh rarity roll at good luck; a roll no better than now changes nothing. */
export const UPGRADE_LUCK = 0.7;
export function upgradeOdds(G, it) { return oddsFor((it.tier - 1) * TIER_LUCK + UPGRADE_LUCK + researchBonus(G).craftLuck); }
export const upgradeChance = (G, it) => upgradeOdds(G, it).filter(o => o.i > it.rarity).reduce((a, o) => a + o.p, 0);
export function upgradeCost(it) {
  const rec = recipe(it.kind, it.tier);
  const ore = {}; for (const [o, n] of Object.entries(rec.ore)) ore[o] = Math.max(1, Math.round(n * 0.4));
  return { ore, cr: Math.round(rec.value * 0.15 * (1 + it.rarity * 0.6)) };
}
/** Returns { ok, rolled, upgraded, odds } — `rolled` is the rarity the roll landed on (the reel shows it). */
export function upgradeRarity(G, r, it) {
  if (it.rarity >= RARITY.length - 1) return { ok: false, short: [], why: 'Already legendary.' };
  const cost = upgradeCost(it); const short = shortFor(G, cost);
  if (short.length) return { ok: false, short };
  const odds = upgradeOdds(G, it);
  pay(G, cost);
  const rolled = roll(r, odds); const upgraded = rolled > it.rarity;
  if (upgraded) it.rarity = rolled;     // the bonus stays as rolled; the rarity lift (partStats) is the gain
  G.stats.rerolls = (G.stats.rerolls || 0) + 1;
  return { ok: true, rolled, upgraded, odds };
}

/** The reel's strip: every row but `land` is an independent draw from the REAL odds; `land` holds the result. */
export function reelStrip(odds, result, r, { length = 46, land = 40 } = {}) {
  const pick = () => roll(r, odds);
  const strip = Array.from({ length }, pick);
  strip[land] = result;
  return { strip, land };
}
