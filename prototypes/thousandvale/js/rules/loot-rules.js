// Thousandvale — the PARTY LOOT ladder (play-test 2, Q3/Q4).
//
//   "Party loot threshold, configurable, default 'rare or better', can be lowered to magic. Items
//    at/above threshold are locked -> Need / Greed / Skip roll UI ..."
//
// Farhold's rarity ladder is normal / magic / rare / legendary, and a legendary roll comes out as one of
// three things: a plain legendary, a SET piece (`setId`) or a UNIQUE (`isUnique`) — items.json gives
// the last two their own colours. This file is the one place that ranks them, so the server (A: which
// items lock for a roll), the client (D-UI: the threshold menu) and the tests agree.
//
// Pure: no room, no rng.

/** Rank of each tier. A set piece and a unique share the top rung (both are named, both are chased). */
export const RARITY_RANK = Object.freeze({ normal: 0, magic: 1, rare: 2, legendary: 3, set: 4, unique: 4 });

/**
 * The thresholds a party leader may pick, lowest first. `epic` (the word D-UI's first draft used) is
 * accepted as an alias of `legendary` — Farhold has no "epic" rarity, and a menu that says Epic over
 * items that say Legendary would only confuse.
 */
export const LOOT_THRESHOLDS = Object.freeze(['magic', 'rare', 'legendary', 'unique']);
export const THRESHOLD_ALIASES = Object.freeze({ epic: 'legendary', set: 'unique', uncommon: 'magic' });
export const DEFAULT_LOOT_THRESHOLD = 'rare';
/** What the menu says for each threshold. */
export const THRESHOLD_LABELS = Object.freeze({
  magic: 'Magic or better',
  rare: 'Rare or better',
  legendary: 'Legendary or better',
  unique: 'Set pieces and uniques only',
});

/** The tier an item counts as: 'normal' | 'magic' | 'rare' | 'legendary' | 'set' | 'unique'. */
export function lootTier(item) {
  if (!item) return 'normal';
  if (item.isUnique || item.rarity === 'unique') return 'unique';
  if (item.setId || item.rarity === 'set') return 'set';
  return RARITY_RANK[item.rarity] != null ? item.rarity : 'normal';
}
export const lootRank = item => RARITY_RANK[lootTier(item)] ?? 0;

/** A threshold name made safe: unknown -> the default; aliases resolved. */
export function normalizeThreshold(t) {
  const k = THRESHOLD_ALIASES[t] || t;
  return LOOT_THRESHOLDS.includes(k) ? k : DEFAULT_LOOT_THRESHOLD;
}

/** Does this item lock for a Need / Greed / Skip roll under `threshold`? */
export function locksForRoll(item, threshold = DEFAULT_LOOT_THRESHOLD) {
  return lootRank(item) >= RARITY_RANK[normalizeThreshold(threshold)];
}

/** Split a corpse's items: `free` (anyone in the party may take them) and `locked` (rolled for). */
export function splitLoot(items, threshold = DEFAULT_LOOT_THRESHOLD) {
  const free = [], locked = [];
  for (const it of items || []) (locksForRoll(it, threshold) ? locked : free).push(it);
  return { free, locked };
}

/**
 * Resolve one Need / Greed / Skip roll. `choices` = [{ id, choice: 'need'|'greed'|'skip', n }] where
 * `n` is the 1-100 number the server rolled for that player (on its own seeded stream). Need beats
 * Greed; the highest number wins inside the best choice; a tie goes to the earlier entry. Everyone
 * skipping (or nobody answering) -> null: the item stays on the corpse (Q4).
 */
export function rollWinner(choices) {
  const order = { need: 2, greed: 1 };
  let best = null;
  for (const c of choices || []) {
    const w = order[c?.choice];
    if (!w) continue;
    if (!best || w > order[best.choice] || (w === order[best.choice] && c.n > best.n)) best = c;
  }
  return best;
}
