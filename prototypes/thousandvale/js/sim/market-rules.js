// THE MARKET's rules (stream Market, round 11, owner report #25). Pure: the province's market service
// (js/sim/market.js), both stores (js/sim/store-memory-m3.js, server/db/pg-social.js) and the client's Market tab
// (js/client/ui/market.js) all read this one file, so a number on the screen is the number the server charges.
//
// The owner's words: "Players can sell materials or equipment at their own price and just have to pay a small fee based
// on the sell value of the item. Marketed items should last 30 days and can be cancelled early to get the item back.
// Market items go through mail."
//
//   MARKET                 the knobs (fee share, price range, cap per character, hourly limit, how long a listing lasts)
//   feeFor(sellValue)      the listing fee for a lot whose shop sell value (all of it, count x each) is `sellValue`
//   listRefusal(item)      null, or the reason an item may never be listed ('keep' | 'item')
//   describe(item)         { name_lower, tab, sub, rarity, lvl, count } — the search columns of a listing
//   matches(row, f) / sortRows(rows, sort)   the browse filter, shared by the memory store and the tests
//   letter(kind, x)        the words of every market letter: 'bought' (to the buyer), 'sold' (to the seller),
//                          'cancelled' and 'expired' (the item back to the seller)
//   GEAR_SUBS / ITEM_SUBS  the browse filter choices (id + label) for each tab

import { tabOf, isKept, sellable } from './bag-tabs.js';

export const MARKET = Object.freeze({
  feePct: 20,                    // the fee is 20% of what a shop would pay for the lot (at least 1 gold); not refunded on cancel
  feeMin: 1,
  priceMin: 1,
  priceMax: 10000000,            // ten million gold for one lot
  cap: 20,                       // active listings per character
  perHour: 30,                   // new listings per character per hour
  lastsMs: 30 * 86400000,        // 30 days
  per: 30,                       // rows per browse page
  qMax: 40,                      // search text
  from: 'The Market',            // the sender shown on its letters
});

/** The listing fee for a lot whose shop sell value is `sellValue` gold (already x count). */
export function feeFor(sellValue) {
  const v = Math.max(0, Math.floor(+sellValue || 0));
  return Math.max(MARKET.feeMin, Math.ceil(v * MARKET.feePct / 100));
}

/** Null when `item` may be listed; else 'keep' (kept for good / never sold: the recall charm, quest items, boxes, tokens) or 'item'. */
export function listRefusal(item) {
  if (!item || typeof item !== 'object' || !item.uid) return 'item';
  if (isKept(item) || !sellable(item)) return 'keep';
  if (item.quest || item.noTrade || item.bound) return 'keep';
  return null;
}

const SLOT_SUB = { mainhand: 'weapon', ring1: 'ring', ring2: 'ring', neck: 'necklace', cape: 'back', cloak: 'back', belt: 'waist', shield: 'offhand' };
/** The browse sub-category: gear -> its worn slot; items -> its kind. */
export function subOf(item) {
  if (!item) return null;
  if (tabOf(item) === 'gear') {
    if (item.hand === 'off') return 'offhand';
    if (item.type === 'weapon') return 'weapon';
    const s = String(item.slot || '');
    return SLOT_SUB[s] || s || null;
  }
  const k = String(item.kind || '');
  if (k === 'material' || item.tool || (item.use && (item.use.type === 'tool' || item.use.type === 'rod'))) return k === 'material' ? 'material' : 'tool';
  if (k === 'fish') return 'fish';
  if (k === 'potion' || k === 'food' || k === 'meal' || k === 'cooked' || (item.use && item.use.type === 'food')) return 'consumable';
  return 'goods';
}

export const countOf = it => Math.max(1, (it && it.count) | 0 || 1);

/** The search columns of a listing. */
export function describe(item) {
  return {
    name_lower: String(item.name || '').toLowerCase().slice(0, 80),
    tab: tabOf(item) === 'gear' ? 'gear' : 'items',
    sub: subOf(item),
    rarity: String(item.setId ? 'set' : item.rarity || 'normal'),
    lvl: Math.max(1, Math.floor(+(item.reqLevel ?? item.level ?? item.ilvl ?? 1)) || 1),
    count: countOf(item),
  };
}

export const GEAR_SUBS = Object.freeze([
  { id: '', label: 'All equipment' }, { id: 'weapon', label: 'Weapons' }, { id: 'offhand', label: 'Off hand' },
  { id: 'head', label: 'Head' }, { id: 'chest', label: 'Chest' }, { id: 'legs', label: 'Legs' }, { id: 'hands', label: 'Hands' },
  { id: 'feet', label: 'Feet' }, { id: 'back', label: 'Back' }, { id: 'waist', label: 'Waist' }, { id: 'necklace', label: 'Neck' },
  { id: 'ring', label: 'Rings' },
]);
export const ITEM_SUBS = Object.freeze([
  { id: '', label: 'All items' }, { id: 'material', label: 'Materials' }, { id: 'fish', label: 'Fish' },
  { id: 'consumable', label: 'Potions and food' }, { id: 'tool', label: 'Tools' }, { id: 'goods', label: 'Other goods' },
]);
export const SORTS = Object.freeze([
  { id: 'cheap', label: 'Price: low to high' }, { id: 'dear', label: 'Price: high to low' },
  { id: 'each', label: 'Price each: low to high' }, { id: 'new', label: 'Newest first' },
]);
const SORT_IDS = new Set(SORTS.map(s => s.id));
export const sortId = s => (SORT_IDS.has(s) ? s : 'cheap');

/** Clean a browse request: { q, tab, sub, sort, page }. */
export function browseFilter(m = {}) {
  const tab = m.tab === 'gear' || m.tab === 'items' ? m.tab : '';
  const subs = tab === 'gear' ? GEAR_SUBS : tab === 'items' ? ITEM_SUBS : [];
  const sub = subs.some(s => s.id && s.id === m.slot) ? m.slot : '';
  return { q: String(m.q || '').toLowerCase().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MARKET.qMax), tab, sub, sort: sortId(m.sort), page: Math.max(0, Math.min(1000, (m.page | 0) || 0)) };
}

/** Does a stored row (with the describe() columns, `expiresAt` in ms) pass the browse filter at `nowMs`? */
export function matches(row, f, nowMs) {
  if (row.expiresAt <= nowMs) return false;
  if (f.tab && row.tab !== f.tab) return false;
  if (f.sub && row.sub !== f.sub) return false;
  if (f.q && !String(row.name_lower || '').includes(f.q)) return false;
  return true;
}
/** Order rows (a copy) by `sort`; ties: the older listing first, then id. */
export function sortRows(rows, sort) {
  const by = {
    cheap: (a, b) => a.price - b.price,
    dear: (a, b) => b.price - a.price,
    each: (a, b) => a.price / a.count - b.price / b.count,
    new: (a, b) => b.listedAt - a.listedAt || b.id - a.id,
  }[sortId(sort)];
  return [...rows].sort((a, b) => by(a, b) || a.listedAt - b.listedAt || a.id - b.id);
}

const lot = x => (x.count > 1 ? `${x.count} x ${x.name}` : x.name);
/** The words of a market letter. x = { name, count, price, buyer?, fee? }. */
export function letter(kind, x) {
  const n = String(x.name || 'item').slice(0, 40);
  const L = { name: n, count: Math.max(1, x.count | 0 || 1), price: x.price | 0 };
  if (kind === 'bought') return { subject: `Bought: ${n}`.slice(0, 60), body: `You bought ${lot(L)} on the Market for ${L.price} gold. Here it is.` };
  if (kind === 'sold') return { subject: `Sold: ${n}`.slice(0, 60), body: `${x.buyer || 'Someone'} bought your ${lot(L)} on the Market. Your ${L.price} gold is in this letter.` };
  if (kind === 'cancelled') return { subject: `Taken off the Market: ${n}`.slice(0, 60), body: `You took ${lot(L)} off the Market. Here it is back. (The listing fee is not paid back.)` };
  return { subject: `Unsold: ${n}`.slice(0, 60), body: `Nobody bought ${lot(L)} in 30 days, so the Market sends it back to you.` };
}
