// BAG TABS (round 11, owner report #11 / #42). Pure: the server's capacity rule and the client's bag window both read it.
//
// The bag is shown as three tabs, and the tab an item sits in is worked out from the item itself (nothing is stored, so
// no save needs migrating):
//
//   gear   Equipment — anything worn in a slot: weapons, armour, jewellery, backpacks, off-hand pieces.
//   items  Items — ore, skins, fish, food, potions, tools and rods, bought goods, junk, trophies.
//   other  Other — what can never be sold: the recall charm and anything else marked `noSell`, quest items, reward
//          boxes (crates and gift boxes), tokens sold nowhere (the cart fare tokens).
//
// Capacity: `gear` and `items` EACH hold the bag's capacity (40 + a worn backpack + fitted saddle bags); `other` has no
// limit and never counts against anything. So a full Equipment tab never stops you picking up ore.
//
//   tabOf(item) -> 'gear' | 'items' | 'other'
//   tabCounts(bag) -> { gear, items, other }
//   fitsIn(bag, cap, items) -> true when every item in `items` (array) has room in its tab
//   sellable(item) -> false for what lives in Other

export const TABS = Object.freeze([
  { id: 'gear', label: 'Equipment' },
  { id: 'items', label: 'Items' },
  { id: 'other', label: 'Other' },
]);

/** Goods that are tokens sold nowhere: they live in Other. */
export const TOKEN_IDS = Object.freeze(['cart_token', 'haulers_token']);

/** Items the server never lets you sell, drop, trade or post (the recall charm). */
export const KEEP_IDS = Object.freeze(['recall_charm']);

/** True when this item is kept for good: it cannot be sold, thrown away, traded or posted. */
export const isKept = it => !!(it && (it.noDrop || it.keep || KEEP_IDS.includes(it.id) || (it.use && it.use.type === 'recall')));

const GEAR_TYPES = new Set(['weapon', 'armor', 'armour', 'accessory']);

/** The tab an item is shown in (and counted against). */
export function tabOf(it) {
  if (!it || typeof it !== 'object') return 'items';
  if (isKept(it) || it.noSell) return 'other';
  if (it.quest || it.kind === 'quest') return 'other';
  if (it.kind === 'crate' || it.kind === 'gift' || it.crate || it.gift) return 'other';
  if (TOKEN_IDS.includes(it.id)) return 'other';
  if (it.tool || (it.use && (it.use.type === 'tool' || it.use.type === 'rod'))) return 'items';
  if (!it.kind && (GEAR_TYPES.has(it.type) || it.slot)) return 'gear';
  return 'items';
}

/** How many squares each tab uses (a stack is one square). */
export function tabCounts(bag) {
  const n = { gear: 0, items: 0, other: 0 };
  for (const it of bag || []) n[tabOf(it)]++;
  return n;
}

/** Can `incoming` (array of items, each one square) go in a bag with this capacity per tab? `leaving` squares come out first. */
export function fitsIn(bag, cap, incoming = [], leaving = []) {
  const n = tabCounts(bag);
  for (const it of leaving || []) n[tabOf(it)]--;
  for (const it of incoming || []) {
    const t = tabOf(it);
    if (t === 'other') continue;
    n[t]++;
    if (n[t] > cap) return false;
  }
  return true;
}

/** Free squares in one tab (Infinity for Other). */
export function freeIn(bag, cap, tab) {
  if (tab === 'other') return Infinity;
  return Math.max(0, cap - tabCounts(bag)[tab]);
}

/** False for what lives in Other: a merchant will not take it. */
export const sellable = it => tabOf(it) !== 'other';

/** The order Other is shown in: kept things first, then quest items, then boxes, then the rest; by name inside each. */
export function sortOther(list) {
  const rank = it => (isKept(it) ? 0 : it.quest || it.kind === 'quest' ? 1 : it.kind === 'crate' || it.kind === 'gift' ? 2 : 3);
  return [...list].sort((a, b) => rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || '')));
}
