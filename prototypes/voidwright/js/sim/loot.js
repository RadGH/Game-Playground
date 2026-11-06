// Loot: what a destroyed ship drops. Rarity shifts upward with danger tier and ship size.
//
// An ITEM is a module block you can fit in build mode: { uid, block, rarity, mods, name }.
// mods are percentage bonuses: dmg, rate, range, hp, shield, power (less power use), turn.

import { BLOCKS } from '../data/blocks.js';
import { RARITY, RARITY_BY_ID, MATERIALS } from '../data/types.js';
import { FACTIONS } from '../data/factions.js';
import { CLASSES } from '../data/hulls.js';

let uidCounter = 1;
export const setItemCounter = n => { uidCounter = Math.max(uidCounter, n); };
export const itemCounter = () => uidCounter;

const AFFIX = [
  { key: 'dmg', name: 'Overcharged', cats: ['weapon'], min: 0.06, max: 0.22 },
  { key: 'rate', name: 'Rapid', cats: ['weapon'], min: 0.05, max: 0.2 },
  { key: 'range', name: 'Long-reach', cats: ['weapon'], min: 0.06, max: 0.25 },
  { key: 'hp', name: 'Reinforced', cats: ['weapon', 'shield', 'power', 'engine', 'utility', 'drone', 'cpu', 'core', 'gyro'], min: 0.1, max: 0.4 },
  { key: 'shield', name: 'Resonant', cats: ['shield'], min: 0.08, max: 0.3 },
  { key: 'power', name: 'Efficient', cats: ['weapon', 'shield', 'engine', 'utility', 'drone'], min: 0.1, max: 0.35 },
  { key: 'thrust', name: 'Tuned', cats: ['engine'], min: 0.08, max: 0.3 },
  { key: 'turn', name: 'Nimble', cats: ['gyro', 'weapon'], min: 0.1, max: 0.4 },
];
/** Named powers only legendary and relic items roll. */
export const POWERS = [
  { key: 'chain', name: 'of Storms', blurb: 'Hits arc to one more target.', cats: ['weapon'] },
  { key: 'splash', name: 'of Ruin', blurb: '+60% blast radius.', cats: ['weapon'] },
  { key: 'pierce', name: 'of the Needle', blurb: 'Shots pass through 2 more blocks.', cats: ['weapon'] },
  { key: 'burn', name: 'of Cinders', blurb: 'Sets targets burning.', cats: ['weapon'] },
  { key: 'leech', name: 'of the Leech', blurb: 'Damage repairs your hull a little.', cats: ['weapon'] },
  { key: 'twin', name: 'Twinned', blurb: 'Fires an extra shot.', cats: ['weapon'] },
  { key: 'bulwark', name: 'of the Bulwark', blurb: 'Shield recharges twice as fast.', cats: ['shield'] },
  { key: 'overdrive', name: 'of Overdrive', blurb: 'Boost lasts longer and goes faster.', cats: ['engine'] },
];

export function rollRarity(r, tier, bonus = 0) {
  // every tier and every bonus point makes common less likely
  const shift = (tier - 1) * 0.18 + bonus;
  return r.weighted(RARITY, x => x.weight * Math.pow(1 + RARITY_BY_ID[x.id].index * 0.9, shift));
}

/** Make an item for a block id with a rarity (rolls affixes). */
export function makeItem(r, blockId, rarity = 'common') {
  const def = BLOCKS[blockId]; const rr = RARITY_BY_ID[rarity];
  const mods = {}; let prefix = '', suffix = '';
  const n = rr.index >= 4 ? 3 : rr.index >= 2 ? 2 : rr.index >= 1 ? 1 : 0;
  const pool = AFFIX.filter(a => a.cats.includes(def.cat));
  for (let i = 0; i < n && pool.length; i++) {
    const a = pool.splice(Math.floor(r() * pool.length), 1)[0];
    mods[a.key] = +(a.min + r() * (a.max - a.min) * (1 + rr.index * 0.25)).toFixed(3);
    if (!prefix) prefix = a.name;
  }
  let power = null;
  if (rr.index >= 4) {
    const pp = POWERS.filter(p => p.cats.includes(def.cat));
    if (pp.length) { power = r.pick(pp); mods[power.key] = 1; suffix = ' ' + power.name; }
  }
  return { uid: uidCounter++, block: blockId, rarity, mods, name: `${prefix ? prefix + ' ' : ''}${def.name}${suffix}`, power: power?.key || null };
}

/** Module blocks a faction might drop at a tier. */
function dropPool(faction, tier, maxSize) {
  const F = FACTIONS[faction];
  return Object.values(BLOCKS).filter(b => b.module && !b.core && (b.size || 1) <= maxSize && b.tier <= tier + 1 &&
    (!b.race || b.race === faction) && (F?.human || b.cat === 'weapon' || b.cat === 'shield' || b.cat === 'utility' || b.cat === 'drone' || b.cat === 'power'));
}

/**
 * Loot from a destroyed ship. Returns a list of pickups (without positions): materials, credits, items,
 * escape pods (humans only) and alien specimens.
 */
export function rollLoot(r, s, luck = 0) {
  const tier = s.tier || 1; const F = FACTIONS[s.faction]; const cls = CLASSES[s.cls] || CLASSES.skiff;
  const scale = 1 + cls.rank * 1.4;
  const out = [];
  // credits
  out.push({ kind: 'cr', n: Math.round((20 + r() * 40) * tier * scale * (F?.human ? 1 : 0.6)) });
  // materials
  const mats = F?.drops || ['ferrite'];
  const nMat = Math.round(1 + r() * 2 + cls.rank * 1.5);
  for (let i = 0; i < nMat; i++) {
    const mat = r.pick(mats);
    const m = MATERIALS[mat];
    if (m.tier > tier + 2) continue;
    out.push({ kind: 'mat', mat, n: Math.max(1, Math.round((2 + r() * 6) * scale / Math.sqrt(m.tier))) });
  }
  // items: the bigger the ship, the more rolls
  const rolls = (r() < 0.45 ? 1 : 0) + cls.rank + (s.boss ? 4 : 0) + (s.elite ? 2 : 0);
  const pool = dropPool(s.faction, tier, Math.max(1, cls.maxBlock));
  for (let i = 0; i < rolls && pool.length; i++) {
    const rar = rollRarity(r, tier, (s.boss ? 1.4 : 0) + (s.elite ? 0.6 : 0) + cls.rank * 0.15 + luck);
    const def = r.pick(pool);
    out.push({ kind: 'item', item: makeItem(r, def.id, rar.id), rarity: rar.id });
  }
  // people or specimens
  if (F?.crew) {
    const pods = Math.min(6, Math.floor((s.crew || 2) / 4) + (r() < 0.5 ? 1 : 0));
    for (let i = 0; i < pods; i++) out.push({ kind: 'pod', n: 1 + Math.floor(r() * 3) });
  } else if (F && r() < 0.25 + cls.rank * 0.1) {
    out.push({ kind: 'specimen', name: F.specimen, faction: s.faction, n: 1, value: Math.round(120 * tier * (1 + cls.rank)) });
  }
  if (tier >= 5 && !F?.human && r() < 0.04 + cls.rank * 0.03) out.push({ kind: 'mat', mat: 'relic', n: 1 });
  return out;
}

/** What an item sells for. */
export function itemValue(item) {
  const def = BLOCKS[item.block]; const rr = RARITY_BY_ID[item.rarity] || RARITY[0];
  return Math.round((def.cost?.cr || 50) * 0.35 * (1 + rr.index * 0.8 + (item.power ? 1.5 : 0)));
}
