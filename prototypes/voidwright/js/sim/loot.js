// Loot: what a destroyed ship drops. Rarity shifts upward with danger tier and ship size.
//
// An ITEM is a module block you can fit in build mode: { uid, block, rarity, mods, name }.
// mods: rolled bonuses (AFFIX below) and a legendary power key; sim/partstats.js applies them.

import { BLOCKS } from '../data/blocks.js';
import { RARITY, RARITY_BY_ID, MATERIALS, matOf, matTier } from '../data/types.js';
import { FACTIONS } from '../data/factions.js';
import { CLASSES } from '../data/hulls.js';
import { ALL_WEAPONS } from '../data/weapons.js';
import { UNIQUES } from '../data/uniques.js';
import { DRONES } from '../data/drones.js';

let uidCounter = 1;
export const setItemCounter = n => { uidCounter = Math.max(uidCounter, n); };
export const itemCounter = () => uidCounter;

/**
 * Rolled bonuses (Diablo-style, play-test #38). Each fits the parts `when` says. `pct` ones are fractions
 * (0.2 = +20%), `flat` ones whole numbers scaled by block size² and tier. One table — ui/items.js prints
 * these same entries with AFFIX_TEXT, sim/partstats.js applies them.
 */
export const AFFIX = [
  { key: 'dmg', name: 'Overcharged', pct: [0.08, 0.25], when: d => !!d.weapon && !isTool(d) },
  { key: 'rate', name: 'Rapid', pct: [0.06, 0.22], when: d => !!d.weapon && !isBeam(d) && !isTool(d) },
  { key: 'range', name: 'Long-reach', pct: [0.08, 0.28], when: d => !!d.weapon },
  { key: 'dmg', name: 'Deep-cutting', pct: [0.15, 0.4], when: d => isTool(d) && d.weapon.startsWith('mining') },
  { key: 'turn', name: 'Nimble', pct: [0.1, 0.4], when: d => !!d.weapon || d.cat === 'gyro' || d.cat === 'engine' },
  { key: 'hp', name: 'Reinforced', pct: [0.12, 0.45], when: d => d.cat !== 'frame' },
  { key: 'power', name: 'Efficient', pct: [0.12, 0.4], when: d => d.power < 0 },
  { key: 'cpuLess', name: 'Streamlined', flat: [1, 1], when: d => (d.cpu || 0) >= 2 },
  { key: 'output', name: 'Hot', pct: [0.1, 0.3], when: d => d.power > 0 },
  { key: 'shield', name: 'Resonant', pct: [0.1, 0.35], when: d => !!d.shield },
  { key: 'regen', name: 'Quickening', pct: [0.15, 0.45], when: d => !!d.shield },
  { key: 'thrust', name: 'Tuned', pct: [0.08, 0.3], when: d => d.cat === 'engine' },
  { key: 'cpu', name: 'Clocked', flat: [1, 3], when: d => d.cat === 'cpu' || d.cat === 'core' || d.cat === 'utility' },
  { key: 'slots', name: 'Tactical', flat: [1, 1], when: d => !!d.autoSlots || d.core },
  { key: 'crew', name: 'Spacious', flat: [1, 3], when: d => d.cat === 'crew' || d.cat === 'core' },
  { key: 'cargo', name: 'Deep', pct: [0.15, 0.5], when: d => d.cat === 'cargo' },
  { key: 'repair', name: 'Mending', pct: [0.2, 0.6], when: d => !!d.repair },
  { key: 'scan', name: 'Far-seeing', pct: [0.2, 0.6], when: d => !!d.scanRange },
  { key: 'drones', name: 'Crowded', flat: [1, 1], when: d => !!d.drones },
];
const isTool = d => d.weapon && ALL_WEAPONS[d.weapon]?.mode === 'tool';
const isBeam = d => d.weapon && (ALL_WEAPONS[d.weapon]?.mode === 'beam' || ALL_WEAPONS[d.weapon]?.proj === 'beam');

/** Named powers only legendary and relic items roll. */
export const POWERS = [
  { key: 'chain', name: 'of Storms', blurb: 'Hits arc to one more target.', when: d => !!d.weapon && !isTool(d) },
  { key: 'splash', name: 'of Ruin', blurb: '+60% blast radius.', when: d => !!ALL_WEAPONS[d.weapon]?.splash },
  { key: 'pierce', name: 'of the Needle', blurb: 'Shots pass through 2 more blocks.', when: d => !!d.weapon && !isTool(d) && !isBeam(d) },
  { key: 'burn', name: 'of Cinders', blurb: 'Sets targets burning.', when: d => !!d.weapon && !isTool(d) },
  { key: 'leech', name: 'of the Leech', blurb: 'Damage repairs your hull a little.', when: d => !!d.weapon && !isTool(d) },
  { key: 'twin', name: 'Twinned', blurb: 'Fires an extra shot.', when: d => !!d.weapon && !isTool(d) && !isBeam(d) },
  { key: 'bulwark', name: 'of the Bulwark', blurb: 'Shield recharges twice as fast.', when: d => !!d.shield },
  { key: 'overdrive', name: 'of Overdrive', blurb: 'Boost lasts longer and goes faster.', when: d => d.cat === 'engine' },
  { key: 'sun', name: 'of the Sun', blurb: '+40% power, and it never explodes.', when: d => d.power > 0 },
  { key: 'hive', name: 'of the Hive Mind', blurb: '+50% CPU from this part.', when: d => !!d.cpuCap },
  { key: 'commons', name: 'of the Commons', blurb: '+50% crew room from this part.', when: d => !!d.crewCap },
  { key: 'plenty', name: 'of Plenty', blurb: '+50% cargo from this part.', when: d => !!d.cargo },
  { key: 'motherlode', name: 'of the Motherlode', blurb: 'Every ore cell it cuts drops twice as much.', when: d => isTool(d) && d.weapon.startsWith('mining') },
];

export function rollRarity(r, tier, bonus = 0) {
  // every tier and every bonus point makes common less likely
  const shift = (tier - 1) * 0.18 + bonus;
  return r.weighted(RARITY, x => x.weight * Math.pow(1 + RARITY_BY_ID[x.id].index * 0.9, shift));
}

/** Make an item for a block id with a rarity (rolls bonuses, and a named power for legendary/relic). */
export function makeItem(r, blockId, rarity = 'common') {
  const def = BLOCKS[blockId]; const rr = RARITY_BY_ID[rarity] || RARITY_BY_ID.common;
  const mods = {}; let prefix = '', suffix = '';
  const pool = AFFIX.filter(a => a.when(def));
  const scale = (def.size || 1) ** 2 * Math.max(1, Math.ceil((def.tier || 1) / 2));
  for (let i = 0; i < rr.affixes && pool.length; i++) {
    const a = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (mods[a.key]) continue;
    // better rarities roll nearer the top of the range
    const k = Math.min(1, r() * 0.7 + rr.index * 0.08);
    mods[a.key] = a.flat ? Math.round(a.flat[0] + (a.flat[1] - a.flat[0]) * k) * (a.key === 'cpuLess' || a.key === 'slots' || a.key === 'drones' ? 1 : scale)
      : +(a.pct[0] + (a.pct[1] - a.pct[0]) * k).toFixed(3);
    if (!prefix) prefix = a.name;
  }
  let power = null;
  if (rr.index >= 4) {
    const pp = POWERS.filter(p => p.when(def));
    if (pp.length) { power = r.pick(pp); mods[power.key] = 1; suffix = ' ' + power.name; }
  }
  return { uid: uidCounter++, block: blockId, rarity: rr.id, mods, name: `${prefix ? prefix + ' ' : ''}${def.name}${suffix}`, power: power?.key || null };
}

/** A named unique as an item (fixed bonuses; `unique` = its id for the collection log). */
export function makeUnique(u) {
  const powers = Object.keys(u.mods).filter(k => POWERS.some(p => p.key === k));
  return { uid: uidCounter++, block: u.block, rarity: 'legendary', mods: { ...u.mods }, name: u.name, power: powers[0] || null, unique: u.id };
}
/** Maybe a unique from a source (boss, stronghold, treasure, vault, wanted, nest, derelict, cache, deep). */
export function rollUnique(r, from, chance) {
  if (r() >= chance) return null;
  const pool = UNIQUES.filter(u => u.from === from); if (!pool.length) return null;
  return makeUnique(r.pick(pool));
}

/**
 * Pick a part from a pool; exotic kinds (ion / firebrand missiles, #57) get re-rolled most of the time near home
 * (75% at danger 1-3, 45% deeper), so they stay rare. Shops (ui/station.js) and drops both use this.
 */
export const EXOTIC_REROLL = t => (t <= 3 ? 0.75 : 0.45);
export function pickPart(r, pool, tier) {
  let d = r.pick(pool);
  if (ALL_WEAPONS[d?.weapon]?.exotic && r() < EXOTIC_REROLL(tier)) d = r.pick(pool);
  return d;
}

/** Module blocks a faction might drop at a tier. */
function dropPool(faction, tier, maxSize) {
  const F = FACTIONS[faction];
  return Object.values(BLOCKS).filter(b => b.module && !b.core && (b.size || 1) <= maxSize && b.tier <= tier + 1 &&
    (!b.race || b.race === faction) && (F?.human || b.cat === 'weapon' || b.cat === 'shield' || b.cat === 'utility' || b.cat === 'drone' || b.cat === 'power' || b.cat === 'cpu'));
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
  const roles = F?.drops || ['structural'];
  const nMat = Math.round(1 + r() * 2 + cls.rank * 1.5);
  for (let i = 0; i < nMat; i++) {
    const mat = matOf(r.pick(roles), matTier(tier));
    const m = MATERIALS[mat];
    out.push({ kind: 'mat', mat, n: Math.max(1, Math.round((2 + r() * 6) * scale * (m.role === 'exotic' ? 0.35 : 1))) });
  }
  // items: the bigger the ship, the more rolls
  const rolls = (r() < 0.45 ? 1 : 0) + cls.rank + (s.boss ? 4 : 0) + (s.elite ? 2 : 0);
  const pool = dropPool(s.faction, tier, Math.max(1, cls.maxBlock));
  for (let i = 0; i < rolls && pool.length; i++) {
    const rar = rollRarity(r, tier, (s.boss ? 1.4 : 0) + (s.elite ? 0.6 : 0) + cls.rank * 0.15 + luck);
    const def = pickPart(r, pool, tier);
    out.push({ kind: 'item', item: makeItem(r, def.id, rar.id), rarity: rar.id });
  }
  // named uniques (owner E4): bosses often, strongholds and wanted captains sometimes, deep space rarely
  const uq = s.boss ? rollUnique(r, 'boss', 0.35) : s.stronghold ? rollUnique(r, 'stronghold', 0.25) : s.wanted ? rollUnique(r, 'wanted', 0.2)
    : s.nest ? rollUnique(r, 'nest', 0.2) : luck >= 0.5 ? rollUnique(r, 'treasure', 0.03 + cls.rank * 0.02) : tier >= 7 ? rollUnique(r, 'deep', 0.006 + cls.rank * 0.006) : null;
  if (uq) out.push({ kind: 'item', item: uq, rarity: 'legendary' });
  // drones as loot (play-test #31: drones are their own objects)
  if (F?.human && r() < 0.05 + cls.rank * 0.03) {
    const kinds = Object.values(DRONES).filter(d => !d.enemy && d.tier <= Math.ceil(tier / 2) + 1);
    if (kinds.length) out.push({ kind: 'drone', drone: r.pick(kinds).id, rarity: rollRarity(r, tier, luck).id });
  }
  // sealed caches (owner E4): cracked open at a station workshop, always rare or better inside
  if (r() < 0.02 + cls.rank * 0.02 + (s.elite ? 0.15 : 0) + (s.boss ? 1 : 0)) out.push({ kind: 'cache', tier, n: 1 });
  // people or specimens
  if (F?.crew) {
    const pods = Math.min(6, Math.floor((s.crew || 2) / 4) + (r() < 0.5 ? 1 : 0));
    for (let i = 0; i < pods; i++) out.push({ kind: 'pod', n: 1 + Math.floor(r() * 3) });
  } else if (F && r() < 0.25 + cls.rank * 0.1) {
    out.push({ kind: 'specimen', name: F.specimen, faction: s.faction, n: 1, value: Math.round(120 * tier * (1 + cls.rank)) });
  }
  if (tier >= 5 && !F?.human && r() < 0.04 + cls.rank * 0.03) out.push({ kind: 'mat', mat: 'relic', n: 1 });
  // research data cores (labs buy them for research points) and sealed caches (open for a surprise)
  if (r() < 0.06 + cls.rank * 0.04 + (s.elite ? 0.2 : 0)) out.push({ kind: 'data', n: 1 + Math.floor(r() * (1 + cls.rank)) });
  return out;
}

/** What an item sells for. */
export function itemValue(item) {
  const def = BLOCKS[item.block]; const rr = RARITY_BY_ID[item.rarity] || RARITY[0];
  if (!def) return 0;
  return Math.round((def.cost?.cr || 50) * 0.35 * (1 + rr.index * 0.9 + rr.index * rr.index * 0.25 + (item.power ? 1.5 : 0)));
}
