// Oathwild — how strong a piece of gear is: item level grows the base, rarity adds "enhanced" damage / armour (owner
// 2026-11-27: "I'd like gear to get significantly better upgrades like d2"; report #142). Pure. The ONE reader of
// data/loot-tables.json `power` (docs/BRAINSTORM-2026-11-27-gear.md).
//
//   empower(rules, item)        recomputes item.dmg / item.armor / a shield's block power from its base, quality,
//                               item level and rarity; renames the base with its tier word ("Steel Longsword");
//                               stamps item.power = { tier, enhanced }. Every item maker calls it once (engine.js).
//   tierOfLevel(rules, ilvl, material)  → { word, from } the tier word for that item level and material
//   materialOf(rules, item)     'metal' | 'leather' | 'cloth' (what the tier word is made of)
//   armourKindFor(rules, baseKey, ilvl)  the base key to really make at that item level (#143: plate from item level 4)
//   gearPowerOf(rules, item)    { tier, enhanced, growth } for the card
//
// The enhanced roll comes from the item's id (same item = same number), so it never takes a draw from the loot dice
// and every other roll stays as it was.

import { hashStr } from './farhold.js';

const P = rules => rules.data.lootTables.power;

/** The bigger number of the two (unique / set count as their own rarity). */
const rarityKey = item => item.setId ? 'set' : item.isUnique || item.uniqueId ? 'unique' : item.rarity || 'normal';

export function materialOf(rules, item) {
  if (item.type === 'weapon') return item.weaponCategory === 'magic' ? 'arcane' : 'metal';
  const tier = rules.data.items.armorBases[item.baseKey]?.tier;
  if (item.isShield) return tier === 'light' ? 'leather' : 'metal';
  return P(rules).materialByTier[tier] || 'cloth';
}

export function tierOfLevel(rules, ilvl, material) {
  const rows = P(rules).tiers;
  let row = rows[0];
  for (const r of rows) if ((ilvl || 1) >= r.from) row = r;
  return { word: row.words?.[material] || '', from: row.from, name: row.name };
}

/** The share of extra damage / armour this item rolled for its rarity (0.2 = +20%). Same id = same roll. */
function enhancedRoll(rules, item) {
  const range = P(rules).enhanced[rarityKey(item)];
  if (!range) return 0;
  const t = (hashStr(`enh:${item.id}:${item.baseKey}`) % 10007) / 10006;
  return Math.round((range[0] + t * (range[1] - range[0])) * 100) / 100;
}

/** A plate piece below plate's item level comes out as the same piece in mail (#143), and so on down the list. */
export function armourKindFor(rules, baseKey, ilvl) {
  const swap = P(rules).armourFromLevel;
  for (const row of swap) {
    if (baseKey.startsWith(row.prefix) && (ilvl || 1) < row.from) {
      const alt = baseKey.replace(row.prefix, row.else);
      if (rules.data.items.armorBases[alt]) return armourKindFor(rules, alt, ilvl);
    }
  }
  return baseKey;
}

export function empower(rules, item) {
  if (!item || item.power) return item;
  const base = rules.rpg.loot.base(item.baseKey);
  if (!base) return item;
  const cfg = P(rules);
  const ilvl = Math.max(1, item.ilvl || 1);
  const q = cfg.quality[item.quality] ?? 1;
  const enhanced = enhancedRoll(rules, item);
  const material = materialOf(rules, item);
  const tier = tierOfLevel(rules, ilvl, material);
  const grow = kind => 1 + (cfg.perLevel[kind] || 0) * (ilvl - 1);
  if (base.dmg) {
    const k = q * grow('weapon') * (1 + enhanced);
    item.dmg = [Math.max(1, Math.round(base.dmg[0] * k)), Math.max(1, Math.round(base.dmg[1] * k))];
  }
  if (base.armor !== undefined) item.armor = Math.round(base.armor * q * grow('armour') * (1 + enhanced));
  // a shield's own numbers grow with it (its chance stays: a block is a share of the blow)
  for (const a of item.affixes || []) {
    if (!a.baseIntrinsic) continue;
    if (a.stat === 'block_power' && base.blockPower) a.value = Math.round(base.blockPower * q * grow('armour') * (1 + enhanced));
    if (a.stat === 'barrier' && base.barrier) a.value = Math.round(base.barrier * q * grow('armour') * (1 + enhanced));
  }
  // the tier word on the base name ("Steel Longsword"), kept through the affix renaming
  if (tier.word && !item.isUnique && !item.setId) {
    const plain = item.baseName || base.name;
    const named = `${tier.word} ${plain}`;
    item.name = item.name.includes(plain) ? item.name.replace(plain, named) : item.name;
    item.baseName = named;
  }
  item.power = { tier: tier.name, word: tier.word, enhanced };
  return item;
}

/** What the card says about an item's power. Older items (made before 2026-11-27) have none. */
export function gearPowerOf(rules, item) {
  if (!item?.power) return null;
  const cfg = P(rules);
  const ilvl = Math.max(1, item.ilvl || 1);
  return { ...item.power, growth: item.dmg ? cfg.perLevel.weapon * (ilvl - 1) : cfg.perLevel.armour * (ilvl - 1) };
}
