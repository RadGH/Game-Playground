// Oathwild — carry weight, durability, enchanting and the mount. Pure.
// The ONE reader of data/inventory.json.
//
//   itemWeight(rules, item) / carriedWeight(rules, char)
//   durabilityOf(rules, item) / isBroken(rules, item) / wearOnRespawn(rules, char) / repairPrice / repairItem
//   disenchant(rules, char, item, rng)        { ok, why, learned: [affixId], skill } — destroys the item
//   enchantRefusal(rules, char, item, affixId, { sheet })   null or why
//   enchant(rules, char, item, affixId, rng, { sheet })     { ok, why, affix, price, skill }
//   affixTemplate(rules, affixId)              the Emberveil/Farhold affix row (for its stat and range)
//   mountRefusal(rules, { inCombatFor })       null or why you cannot call the horse now

import { rollAffixValue } from './farhold.js';
import { gainSkill, enchantPower, enchantSlots, hasPerk } from './skills-use.js';

const I = rules => rules.data.inventory;
const baseOf = (rules, item) => rules.data.items.weaponBases[item?.baseKey] || rules.data.items.armorBases[item?.baseKey] || null;

/** An item's weight in kilograms. */
export function itemWeight(rules, item) {
  if (!item) return 0;
  if (typeof item.weight === 'number') return item.weight;
  const W = I(rules).weights;
  if (item.type === 'weapon') return W.weapon[item.subtype] ?? W.default;
  if (item.type === 'accessory') return W.jewellery;
  if (item.isShield) return item.baseKey === 'quiver' ? W.quiver : W.shield;
  if (item.isMagicShield) return W.offhandMagic;
  if (item.baseKey === 'quiver') return W.quiver;
  const tier = rules.data.proficiency.tierOf[baseOf(rules, item)?.tier] || 'cloth';
  return Math.round(W.armourTier[tier] * (W.armourSlot[item.slot] ?? 1) * 10) / 10;
}

export function carriedWeight(rules, char) {
  let w = 0;
  for (const it of Object.values(char.gear || {})) w += itemWeight(rules, it);
  for (const it of char.bag || []) w += itemWeight(rules, it) * (it.count || 1);
  return w;
}

// ---------------------------------------------------------------- durability

const hasDurability = item => item && (item.type === 'weapon' || item.type === 'armor');
export function durabilityOf(rules, item) {
  if (!hasDurability(item)) return null;
  return item.durability ?? I(rules).durability.max;
}
export const isBroken = (rules, item) => hasDurability(item) && durabilityOf(rules, item) <= 0;

/** Dying and respawning: every worn piece loses a share. Returns [{ slot, from, to }]. */
export function wearOnRespawn(rules, char) {
  const out = [];
  const loss = I(rules).durability.respawnLoss;
  for (const [slot, it] of Object.entries(char.gear || {})) {
    if (!hasDurability(it)) continue;
    const from = durabilityOf(rules, it);
    it.durability = Math.max(0, from - loss);
    out.push({ slot, from, to: it.durability });
  }
  return out;
}

export function repairPrice(rules, item) {
  if (!hasDurability(item)) return 0;
  const missing = I(rules).durability.max - durabilityOf(rules, item);
  return Math.ceil(missing * I(rules).durability.repairPerPoint * (item.ilvl || 1));
}
export function repairItem(rules, char, item) {
  const price = repairPrice(rules, item);
  if (!price) return { ok: false, why: 'Nothing to repair.' };
  if ((char.gold || 0) < price) return { ok: false, why: `Repairing costs ${price} gold; you have ${char.gold || 0}.` };
  char.gold -= price;
  item.durability = I(rules).durability.max;
  return { ok: true, why: null, price };
}

// ---------------------------------------------------------------- enchanting

/** Every affix row the item generator knows, by id. */
export function affixTemplate(rules, id) {
  const A = rules.data.items.affixes;
  for (const group of ['prefixes', 'suffixes', 'shield', 'extended', 'slotOnly']) {
    const hit = (A[group] || []).find(a => a.id === id);
    if (hit) return hit;
  }
  return null;
}

/** The affixes an item can teach (rolled ones, not the base's own built-in properties). */
const teachable = (rules, item) => (item.affixes || []).filter(a => !a.baseIntrinsic && !a.intrinsic && !a.oathwild && !a.enchanted && affixTemplate(rules, a.id));

/**
 * Break a magic-or-better item to learn one (or, with Keen Reader, two) of its enchantments.
 * The caller removes the item from the bag on ok. The picks are seeded by `rng`.
 */
export function disenchant(rules, char, item, rng) {
  if (!item) return { ok: false, why: 'Nothing to break.' };
  if (!I(rules).enchanting.learnFrom.includes(item.rarity)) return { ok: false, why: `Only magic, rare and legendary items carry enchantments you can learn.` };
  const list = teachable(rules, item);
  char.enchant = char.enchant || { known: [] };
  const fresh = list.filter(a => !char.enchant.known.includes(a.id));
  if (!fresh.length) return { ok: false, why: `You already know every enchantment on ${item.name}.` };
  const n = hasPerk(rules, char, 'keen_reader') && ['rare', 'legendary'].includes(item.rarity) ? 2 : 1;
  const learned = [];
  const pool = [...fresh];
  for (let i = 0; i < n && pool.length; i++) learned.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  char.enchant.known.push(...learned);
  const skill = gainSkill(rules, char, 'enchanting', 'disenchant');
  return { ok: true, why: null, learned, skill };
}

/** How many of your enchantments an item already carries. */
export const enchantsOn = item => (item?.affixes || []).filter(a => a.enchanted).length;

export function enchantRefusal(rules, char, item, affixId, { sheet = null } = {}) {
  if (!item || !(item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory')) return 'Only weapons, armour and jewellery take enchantments.';
  if (!char.enchant?.known?.includes(affixId)) return 'You have not learned that enchantment — break an item that carries it.';
  const def = affixTemplate(rules, affixId);
  if (!def) return 'That enchantment no longer exists.';
  if (!rules.rpg.loot.allowed(def, baseOf(rules, item) || item, item.rarity || 'magic')) return `${def.name} cannot go on ${item.name}.`;
  if ((item.affixes || []).some(a => a.id === affixId)) return `${item.name} already carries ${def.name}.`;
  const slots = enchantSlots(rules, char, sheet?.enchantSlots || 0);
  if (enchantsOn(item) >= slots) return `${item.name} already holds ${slots} of your enchantments (Enchanting 50 and the Runic Hand talent allow more).`;
  const price = enchantPrice(rules, item);
  if ((char.gold || 0) < price) return `Enchanting costs ${price} gold; you have ${char.gold || 0}.`;
  return null;
}

export const enchantPrice = (rules, item) => Math.ceil(I(rules).enchanting.goldPerItemLevel * (item.ilvl || 1));

export function enchant(rules, char, item, affixId, rng, opts = {}) {
  const why = enchantRefusal(rules, char, item, affixId, opts);
  if (why) return { ok: false, why };
  const def = affixTemplate(rules, affixId);
  const price = enchantPrice(rules, item);
  const value = rollAffixValue(def, item.ilvl || 1, rng) * enchantPower(rules, char);
  const affix = { ...def, value: Math.round(value * 100) / 100, enchanted: true };
  item.affixes = [...(item.affixes || []), affix];
  char.gold -= price;
  const skill = gainSkill(rules, char, 'enchanting', 'enchant');
  return { ok: true, why: null, affix, price, skill };
}

// ---------------------------------------------------------------- the horse

export const mountDef = rules => I(rules).mount;

/** Why the horse cannot be called now, or null. `inCombatFor` = seconds since the last fight. */
export function mountRefusal(rules, { owned = true, inCombatFor = Infinity, moving = false } = {}) {
  const m = mountDef(rules);
  if (!owned) return `You do not own a horse yet — a stable sells one for ${m.price} gold.`;
  if (inCombatFor < m.combatLock) return 'You cannot call your horse in the middle of a fight.';
  if (moving) return 'Stand still to call your horse.';
  return null;
}
