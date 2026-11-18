// Pilot rank (from experience: what missions paid, plus a little for every kill even on a lost run — owner: "never
// too punishing") and the parts dealer's stock (what's on sale grows with rank; the stock turns over every two missions).
import { makeRng } from './rng.js';
import { RARITY_BY_ID } from './loadout.js';
import { newUid, rollLines } from './loot.js';

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

/** Highest Mech Kit part tier the dealer sells at a rank. */
export const dealerTier = rank => (rank >= 6 ? 3 : rank >= 3 ? 2 : 1);

/** What a dealer item costs (rarer = dearer). */
export const priceOf = (part, rarity = 'common') => Math.round((part.cost || 5000) * 0.6 * (1 + RARITY_BY_ID[rarity].lift * 3) / 50) * 50;

/**
 * The dealer's shelves: a few parts per slot group, the same until two more missions are played. Crafted-only weapons
 * are never sold. Items come pre-rolled so what you see is exactly what you buy.
 * @returns {{ turn: number, items: Array<item & { price }> }}
 */
export function dealerStock(P, { rank = 1, played = 0, seed = 7, licences = {} }) {
  const turn = Math.floor(played / 2), R = makeRng(seed * 977 + turn * 131 + rank);
  const ceil = dealerTier(rank);
  const pool = Object.values(P).filter(p => !p.crafted && (p.tier || 1) <= ceil);
  const groups = [['weapon', 6], ['head', 1], ['core', 1], ['arms', 1], ['legs', 2], ['booster', 1], ['generator', 1], ['cooling', 1], ['cpu', 1]];
  const items = [];
  for (const [slot, n] of groups) {
    const list = pool.filter(p => p.slot === slot);
    for (let i = 0; i < n && list.length; i++) {
      const part = list.splice(Math.floor(R.next() * list.length), 1)[0];
      const rar = R.next() < (rank >= 4 ? 0.3 : 0.18) ? 'refined' : 'common';
      const it = { uid: 'd' + turn + '-' + items.length, id: part.id, rarity: rar, rolls: rollLines(R, part, rar) };
      items.push({ ...it, price: priceOf(part, rar) });
    }
  }
  // maker licences: that maker's parts on the shelf (up to the licence's tier, even above your rank) and a discount
  for (const [maker, L] of Object.entries(licences)) {
    if (!L?.level) continue;
    const list = Object.values(P).filter(p => !p.crafted && p.maker === maker && (p.tier || 1) <= Math.max(ceil, L.tier || 1) && !items.some(i => i.id === p.id));
    for (let i = 0; i < (L.extra || 2) && list.length; i++) {
      const part = list.splice(Math.floor(R.next() * list.length), 1)[0];
      const rar = R.next() < 0.35 ? 'refined' : 'common';
      items.push({ uid: 'd' + turn + '-' + items.length, id: part.id, rarity: rar, rolls: rollLines(R, part, rar), price: priceOf(part, rar), licence: maker });
    }
  }
  for (const it of items) { const L = licences[P[it.id].maker]; if (L?.off) { it.full = it.price; it.price = Math.round(it.price * (1 - L.off) / 50) * 50; } }
  return { turn, items };
}

/** A bought item becomes the player's own (new uid). */
export const bought = it => ({ uid: newUid(), id: it.id, rarity: it.rarity, rolls: it.rolls.slice(), found: Date.now() });
