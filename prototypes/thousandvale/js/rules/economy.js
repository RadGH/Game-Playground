// Thousandvale — GOLD: what an item is worth and what a kill pays (owner feedback 7, V2). Pure.
//
//   "Overhaul the gold rewards and item pricing throughout the game."
//
// Before: an item's price was Farhold's `basePrice x quality x rarity` — no level, no slot — so the average level-20
// drop listed at 65 gold, while a kill's gold was tied to the monster HEALTH curve (exponential): a level-20 brigand
// paid 163. One kill bought two and a half items; a quest paid less than two kills. Numbers now come from
// data/rules/prices.json and from three small formulas, each with ONE place it is applied:
//   * itemPrice   — the list price; a shop multiplies it by its town's factor and by nothing else
//   * sellPrice   — what a merchant pays (never more than the list price)
//   * killGold    — linear in level; js/rules/cast.js pays it, and gold find is applied there, once
// "A multiplier applied on both sides of an interface" is how Farhold's round 22 got a 500-damage Consecrate: every
// function here returns a FINAL number and says so; tests/C/playtest7 pins that the shop adds nothing on top.

const RARITIES = ['normal', 'magic', 'rare', 'legendary'];

/** The level an item was made at: where it dropped / was made (the rules stamp `dropLevel`), else its item level. */
export const itemLevelOf = item => Math.max(1, Math.round(item?.dropLevel || item?.ilvl || item?.levelReq || 1));

/** Which price slot an item is: its worn slot, with two-handed weapons apart. */
export function priceSlot(item) {
  if (!item) return 'weapon';
  if (item.type === 'weapon') return item.twoHanded ? 'weapon2h' : 'weapon';
  return item.slot === 'ring1' ? 'ring' : (item.slot || 'chest');
}

/** Is this something the gear formula prices (a weapon, armour, jewellery, a cloak or backpack, a belt)? */
export const isGear = item => !!item && typeof item === 'object' && (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory') && !item.kind;

/** The parts of a gear price, for a tooltip and the sim: `{ price, level, slot, parts: { base, slot, rarity, extra } }`. */
export function priceParts(cfg, item) {
  const G = cfg?.gear || {};
  const level = itemLevelOf(item);
  const slot = priceSlot(item);
  const base = (G.base ?? 30) + (G.perLevel ?? 28) * level;
  const slotK = G.slot?.[slot] ?? 1;
  const rarityK = G.rarity?.[item?.rarity] ?? 1;
  let extra = 1;
  if (item?.isUnique) extra *= G.unique ?? 1.5;
  else if (item?.setId) extra *= G.set ?? 1.25;
  if ((item?.tier || 1) >= 2) extra *= G.tier2 ?? 1.1;
  if (item?.bagSlots > 0 && item.slot === 'back') extra *= 1 + (G.bagSlot ?? 0.15) * item.bagSlots;      // W19: a backpack is priced by its room
  const price = Math.max(G.min ?? 1, Math.round(base * slotK * rarityK * extra));
  return { price, level, slot, parts: { base, slot: slotK, rarity: rarityK, extra } };
}

/** The LIST price of an item (final: level, slot and rarity are in it). A fish / junk / trophy carries its own; a crate is worth 1. */
export function itemPrice(cfg, item) {
  if (!item || typeof item !== 'object') return 0;
  if (item.kind === 'crate' || item.kind === 'gift' || item.crate || item.gift) return 1;
  if (!isGear(item)) return Number.isFinite(item.price) ? Math.max(0, Math.round(item.price)) : Number.isFinite(item.shopPrice) ? item.shopPrice : 0;
  return priceParts(cfg, item).price;
}

/** What a merchant pays for it: gear `sellFactor` of its list price (at least 1, never more than the price); own-priced things their price. */
export function sellPrice(cfg, item) {
  if (!item || typeof item !== 'object') return 0;
  if (item.kind === 'crate' || item.kind === 'gift' || item.crate || item.gift) return 1;
  if (!isGear(item)) return Number.isFinite(item.price) ? Math.max(0, Math.round(item.price)) : 0;
  const p = priceParts(cfg, item).price;
  return Math.max(1, Math.min(p, Math.floor(p * (cfg?.gear?.sellFactor ?? 0.06))));
}

/** A monster's own weight against the reference (a brigand carries more coin than a rat), clamped. */
export function goldWeight(cfg, defGold) {
  const K = cfg?.kill || {};
  const [lo, hi] = K.weight || [0.6, 1.8];
  if (!(defGold > 0)) return 1;
  return Math.max(lo, Math.min(hi, defGold / (K.goldRef ?? 5)));
}

/** What a kill pays BEFORE gold find: (base + perLevel x level) x weight x rank. Final for the monster; whole gold, at least 1. */
export function killGold(cfg, level = 1, { rank = 'normal', defGold = null, boss = false } = {}) {
  const K = cfg?.kill || {};
  const r = boss ? 'boss' : rank;
  const raw = ((K.base ?? 2) + (K.perLevel ?? 1) * Math.max(1, level)) * goldWeight(cfg, defGold) * (K.rank?.[r] ?? 1);
  return Math.max(1, Math.round(raw));
}

/** Kill gold with the finder's gold find on it (percent, capped) — the ONE place the stat is applied. */
export function goldFound(cfg, amount, goldFind = 0) {
  const cap = cfg?.goldFind?.cap ?? 100;
  return Math.max(0, Math.round(amount * (1 + Math.max(0, Math.min(cap, goldFind || 0)) / 100)));
}

/** An hour of questing gold at `level` (the knob `retrain.hour`, fitted to E's sim) — the yardstick the Unbinder is priced in. */
export function questHour(cfg, level = 1) {
  const H = cfg?.retrain?.hour || {};
  return (H.base ?? 730) + (H.perLevel ?? 520) * Math.max(0, (level || 1) - 1);
}
/**
 * What the Unbinder charges (owner feedback 7): `kind` talent | perk | spell, `scope` 'one' | 'all'. One taken back costs
 * `minutes[kind]` minutes of questing gold at the character's level, everything of a kind `allHours` hours. Null when
 * the knob is absent (the caller falls back to Farhold's own table).
 */
export function retrainPrice(cfg, kind = 'talent', scope = 'one', level = 1) {
  const R = cfg?.retrain;
  if (!R) return null;
  const hour = questHour(cfg, level);
  const share = scope === 'all' ? (R.allHours ?? 2) : (R.minutes?.[kind] ?? 17.5) / 60;
  return Math.max(1, Math.round(hour * share / 5) * 5);
}

export const PRICE_RARITIES = RARITIES;
