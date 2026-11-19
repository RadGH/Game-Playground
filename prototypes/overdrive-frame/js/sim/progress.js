// Pilot rank (from experience: what missions paid, plus a little for every kill even on a lost run — owner: "never
// too punishing") and the parts dealer's stock (what's on sale grows with rank; the stock turns over every two missions).
import { makeRng } from './rng.js';
import { RARITY_BY_ID, plainSpec } from './loadout.js';
import { newUid, rollLines } from './loot.js';
import { rollMods } from './mods.js';

/** Experience needed for each rank (index = rank − 1). */
export const RANK_XP = [0, 4000, 11000, 22000, 38000, 60000, 90000, 130000, 180000, 250000];
export const RANK_NAMES = ['Rookie', 'Contractor', 'Operator', 'Veteran', 'Specialist', 'Ace', 'Vanguard', 'Warden', 'Paragon', 'Legend'];

export function rankOf(xp = 0) {
  let r = 1; for (let i = 0; i < RANK_XP.length; i++) if (xp >= RANK_XP[i]) r = i + 1;
  const next = RANK_XP[r] ?? null, prev = RANK_XP[r - 1];
  return { rank: r, name: RANK_NAMES[r - 1], xp, next, into: xp - prev, need: next == null ? 0 : next - prev, max: next == null };
}

/** Experience from a mission: the pay, or kills on a loss. */
export const xpFor = (result, me) => (result.won ? result.pay : Math.round((me?.kills || 0) * 6));

/** Loot tier for a pilot's own level (co-op: each player's rewards at their own level — owner ruling). */
export const levelTier = rank => Math.max(1, Math.min(5, 1 + Math.floor((rank - 1) / 2)));

/** Highest Mech Kit part tier the dealer sells at a rank. */
export const dealerTier = rank => (rank >= 6 ? 3 : rank >= 3 ? 2 : 1);

/** What a dealer item costs (rarer = dearer). */
export const priceOf = (part, rarity = 'common') => Math.round((part.cost || 5000) * 0.6 * (1 + RARITY_BY_ID[rarity].lift * 3) / 50) * 50;

/** What rarity the dealer stocks at a rank (round 7 — owner: "more rare parts … especially in the shop … so many white
 *  items for sale that are equivalent or barely different"): never Common; Rare and better grow with rank. */
export const DEALER_ODDS = [
  { upTo: 2, odds: { refined: 55, rare: 35, prototype: 10, experimental: 0 } },
  { upTo: 4, odds: { refined: 35, rare: 42, prototype: 19, experimental: 4 } },
  { upTo: 6, odds: { refined: 20, rare: 42, prototype: 28, experimental: 10 } },
  { upTo: 99, odds: { refined: 10, rare: 38, prototype: 36, experimental: 16 } },
];
const dealerRarity = (R, rank, floor = 'refined') => {
  const odds = DEALER_ODDS.find(d => rank <= d.upTo).odds, order = ['refined', 'rare', 'prototype', 'experimental'];
  const list = order.slice(order.indexOf(floor)), tot = list.reduce((a, k) => a + odds[k], 0) || 1;
  let v = R.next() * tot; for (const k of list) { v -= odds[k]; if (v <= 0) return k; } return list[list.length - 1];
};
/** What a firmware chip costs at the dealer. */
export const chipPrice = chip => Math.round((1500 + chip.cost * 1200 + (chip.rank || 1) * 400) / 50) * 50;

/**
 * The dealer's shelves: 5 weapons, 5 frame or inner parts, one featured part (Prototype or better, from a tier above
 * your rank), and 2 firmware chips. The same until two more missions are played. Crafted-only weapons are never sold.
 * Items come pre-rolled (bonus lines AND mods) so what you see is exactly what you buy.
 * @returns {{ turn: number, items: Array<item & { price, featured? }>, chips: Array<{ uid, id, price }> }}
 */
export function dealerStock(P, { rank = 1, played = 0, seed = 7, CHIPS = [] }) {
  const turn = Math.floor(played / 2), R = makeRng(seed * 977 + turn * 131 + rank);
  const ceil = dealerTier(rank);
  const pool = Object.values(P).filter(p => !p.crafted && (p.tier || 1) <= ceil);
  const items = [];
  const add = (part, rar, extra = {}) => { const rolls = rollLines(R, part, rar); items.push({ uid: 'd' + turn + '-' + items.length, id: part.id, rarity: rar, rolls, mods: rollMods(R, part, rar, plainSpec), price: priceOf(part, rar), ...extra }); };
  const take = (list) => list.splice(Math.floor(R.next() * list.length), 1)[0];
  const weapons = pool.filter(p => p.slot === 'weapon'), frame = pool.filter(p => p.slot !== 'weapon');
  for (let i = 0; i < 5 && weapons.length; i++) add(take(weapons), dealerRarity(R, rank));
  for (let i = 0; i < 5 && frame.length; i++) add(take(frame), dealerRarity(R, rank));
  const highAll = Object.values(P).filter(p => !p.crafted && (p.tier || 1) <= Math.min(3, ceil + 1) && !items.some(i => i.id === p.id));
  const high = R.next() < 0.65 ? highAll.filter(p => p.slot === 'weapon') : highAll;   // the featured slot is usually a weapon
  if (high.length) add(take(high), dealerRarity(R, rank + 4, 'prototype'), { featured: true });
  const chipPool = CHIPS.filter(c => (c.rank || 1) <= rank + 1), chips = [];
  for (let i = 0; i < 2 && chipPool.length; i++) { const c = take(chipPool); chips.push({ uid: 'dc' + turn + '-' + i, id: c.id, price: chipPrice(c) }); }
  return { turn, items, chips };
}

/** A bought item becomes the player's own (new uid). */
export const bought = it => ({ uid: newUid(), id: it.id, rarity: it.rarity, rolls: it.rolls.slice(), mods: (it.mods || []).slice(), found: Date.now() });
