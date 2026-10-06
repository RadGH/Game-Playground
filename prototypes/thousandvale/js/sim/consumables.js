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

export const POTION_CD_MS = 30000;
/** `use.type`s the combat rules carry out (C's rules.useItem). */
export const RULES_USES = Object.freeze(['buff', 'light', 'cleanse', 'recall']);
export const GROUP_R = 30;                 // group tonic: party members this close
/** items.json potions (prototypes/emberveil/data/items.json) with the share of max each restores at least. */
export const POTIONS = Object.freeze({
  healing_potion: { type: 'heal', amount: 40, pct: 0.25 },
  greater_healing: { type: 'heal', amount: 80, pct: 0.45 },
  mana_potion: { type: 'mana', amount: 40, pct: 0.3 },
  group_tonic: { type: 'heal', amount: 25, pct: 0.15, group: true },
  antidote: { type: 'cleanse', statuses: ['poison', 'bleed', 'bleeding', 'poisoned'] },
  revival_flask: { type: 'revive' },
  emberheart_draught: { type: 'revive' },
});

export function effectOf(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.kind === 'potion') {
    const base = POTIONS[item.id] || null;
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

/** How much a potion restores for a body with these maxima. */
export function potionAmount(ef, hpMax, mpMax) {
  return { hp: ef.hp || ef.hpPct ? Math.max(ef.hp || 0, Math.round((ef.hpPct || 0) * hpMax)) : 0, mp: ef.mp || ef.mpPct ? Math.max(ef.mp || 0, Math.round((ef.mpPct || 0) * mpMax)) : 0 };
}
