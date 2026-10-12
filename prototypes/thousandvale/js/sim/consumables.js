// POTIONS AND FOOD (stream A, play-test 2 follow-up: the lead's "make them usable this round"). Pure.
//
// What a consumable DOES, decided here; the province applies it through the combat rules (C's `rules.restore`,
// `rules.cleanse`). A bag item is a consumable when it carries `kind: 'potion' | 'good'` (shops.js makes them from stream E's
// shops.json goods: potions are items.json `potions` keys, goods carry E's `use` block from `goodsCatalog`).
//
//   effectOf(item) -> { kind: 'potion'|'food'|'drink'|'none', ...numbers } | null   (null = not a consumable)
//
// Potions share ONE cooldown (POTION_CD_MS). A potion heals its listed amount OR a share of your maximum, whichever is more
// (items.json amounts are Farhold's level-1 numbers; a share keeps a potion worth carrying at level 20). Food and drink
// restore `regen` × max per second for `seconds`, out of combat only. Buff goods (whetstone, oil…), torches, poultices,
// recall charms and revive flasks are kind 'rules': C's rules.useItem does them (timed buffs, a 5 s recall channel, a revive).

export const POTION_CD_MS = 20000;         // owner feedback 6 (U17): was 30 s
/** `use.type`s the combat rules carry out (C's rules.useItem). */
export const RULES_USES = Object.freeze(['buff', 'light', 'cleanse', 'recall']);
export const GROUP_R = 30;                 // group tonic: party members this close
/** items.json potions (prototypes/emberveil/data/items.json) with the share of max each restores at least. */
export const POTIONS = Object.freeze({
  // owner feedback 6 (U17, stream C): "healing potions are nearly useless" — a quarter of your health every 30 s. Now half (greater: 80%).
  healing_potion: { type: 'heal', amount: 60, pct: 0.5 },
  greater_healing: { type: 'heal', amount: 120, pct: 0.8 },
  mana_potion: { type: 'mana', amount: 40, pct: 0.5 },
  group_tonic: { type: 'heal', amount: 40, pct: 0.25, group: true },
  antidote: { type: 'cleanse', statuses: ['poison', 'bleed', 'bleeding', 'poisoned'] },
  revival_flask: { type: 'revive' },
  emberheart_draught: { type: 'revive' },
});

/**
 * PLAY-TEST 6, U5 — consumables STACK. One bag item with `count` (1..`stackMax`, default STACK_MAX). What stacks: potions,
 * and goods you use up (food, drink, buffs, torches, cures, recall charms, bait, cooked meals). Never: rods and other tools,
 * quest parcels, crates, gifts, fish, junk, trophies, gear. Two items join when `stackKey` is the same.
 */
export const STACK_MAX = 20;
const STACK_USES = new Set(['food', 'drink', 'buff', 'light', 'cleanse', 'recall', 'bait', 'revive']);
export function stackable(item) {
  if (!item || typeof item !== 'object' || item.quest || item.noStack || item.tool) return false;
  if (item.kind === 'potion' || item.kind === 'material') return true;      // W9 (P-core): gathered and refined materials stack (stackMax 50)
  return item.kind === 'good' && !!item.use && STACK_USES.has(item.use.type);
}
export const stackKey = item => item.kind + '|' + item.id + (item.cooked ? '|c' : '');
export const stackMaxOf = item => Math.max(1, Math.min(99, (item.stackMax | 0) || (item.stack > 1 ? item.stack | 0 : 0) || STACK_MAX));
export const countOf = item => Math.max(1, (item && item.count) | 0 || 1);

/**
 * U17 (play-test 6): the potion numbers may come from stream E/C's `shops.json` `potions` block (`{ healing_potion: { pct,
 * amount }, …, cooldownSec }`) — pass it as `table`; without it the numbers above stand.
 */
export const potionCdMs = table => (table && Number.isFinite(table.cooldownSec) ? Math.round(table.cooldownSec * 1000) : POTION_CD_MS);
export function effectOf(item, table = null) {
  if (!item || typeof item !== 'object') return null;
  if (item.kind === 'potion') {
    const over = table && table[item.id] && typeof table[item.id] === 'object' ? table[item.id] : null;
    const base = POTIONS[item.id] || over ? { ...(POTIONS[item.id] || { type: 'heal' }), ...(over || {}) } : null;
    const ef = { ...(base || {}), ...(item.effect && typeof item.effect === 'object' ? item.effect : {}) };
    if (ef.type === 'heal') return { kind: 'potion', hp: +ef.amount || 0, hpPct: base ? base.pct : 0.2, group: !!(base && base.group) || item.effect?.target === 'group' };
    if (ef.type === 'mana') return { kind: 'potion', mp: +ef.amount || 0, mpPct: base ? base.pct : 0.2 };
    if (ef.type === 'cleanse') return { kind: 'potion', cleanse: ef.statuses || [] };
    if (ef.type === 'revive') return { kind: 'rules', use: { type: 'revive' } };      // C: rules.useItem (a fallen party member)
    return { kind: 'none', why: 'notYet' };
  }
  if (item.kind === 'good') {
    const u = item.use || {};
    if ((u.type === 'food' || u.type === 'drink') && u.regen > 0 && u.seconds > 0) {
      // food mends health, drink mana; a dish with a buff (hearty stew) does both
      const both = !!u.buff;
      return { kind: u.type, hpRate: u.type === 'food' || both ? u.regen : 0, mpRate: u.type === 'drink' || both ? u.regen : 0, ms: u.seconds * 1000, ...(u.buff ? { buff: u.buff } : {}) };
    }
    // C (the lead's follow-up): timed buffs (whetstone, oil, silver dust, fletching, oats), a lit torch, a poultice, the
    // recall charm — carried out by the combat rules, `rules.useItem(e, use, opts)` (js/rules/buffs.js)
    if (RULES_USES.includes(u.type)) return { kind: 'rules', use: u, charges: u.charges > 1 ? u.charges : 0 };
    return { kind: 'none', why: 'notYet' };
  }
  return null;
}

/**
 * Owner feedback 6 (U17 follow-up): what a potion's card SAYS, written from the same numbers it uses — never a fixed
 * "Restores 40 HP". With the drinker's maxima it adds what that is right now: "Restores 50% of your health (94 now). Shares
 * a 20 s cooldown with other potions." Returns null for an item that is not a potion (or one the table does not know).
 * `restore` (on the item for the client): { stat: 'hp'|'mp', pct, min, group? } so a card can recompute "now" itself.
 */
export function potionText(item, { hpMax = 0, mpMax = 0 } = {}, table = null) {
  const ef = effectOf(item, table);
  if (!ef || ef.kind !== 'potion') return null;
  const cd = Math.round(potionCdMs(table) / 1000);
  const tail = ` Shares a ${cd} s cooldown with other potions.`;
  if (ef.cleanse) return { desc: 'Cures poison and bleeding.' + tail, restore: null };
  const stat = ef.hp || ef.hpPct ? 'hp' : 'mp';
  const pct = stat === 'hp' ? ef.hpPct || 0 : ef.mpPct || 0, min = stat === 'hp' ? ef.hp || 0 : ef.mp || 0;
  const max = stat === 'hp' ? hpMax : mpMax;
  const now = max > 0 ? Math.min(max, Math.max(min, Math.round(pct * max))) : 0;
  const what = stat === 'hp' ? 'health' : 'mana';
  const whose = ef.group ? `of maximum ${what} to you and party members within ${GROUP_R} m` : `of your ${what}`;
  const amount = pct > 0 ? `${Math.round(pct * 100)}% ${whose}` : `${min} ${what}`;
  return { desc: `Restores ${amount}${now ? ` (${now} now${ef.group ? ', for you' : ''})` : ''}${pct > 0 && min ? `, never less than ${min}` : ''}.` + tail, restore: { stat, pct, min, ...(ef.group ? { group: true } : {}) } };
}

/** How much a potion restores for a body with these maxima. */
export function potionAmount(ef, hpMax, mpMax) {
  return { hp: ef.hp || ef.hpPct ? Math.max(ef.hp || 0, Math.round((ef.hpPct || 0) * hpMax)) : 0, mp: ef.mp || ef.mpPct ? Math.max(ef.mp || 0, Math.round((ef.mpPct || 0) * mpMax)) : 0 };
}
