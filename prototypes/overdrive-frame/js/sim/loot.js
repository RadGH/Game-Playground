// Loot: rolled parts (Diablo-style, owner: "loot like Diablo / Voidwright; don't overload rare loot early"). A crate or a
// part pickup from a mission → one owned item { uid, id, rarity, rolls }. Rarity is a real power step (loadout.js RARITY
// lift + one bonus line per step); bonus lines come from a pool per slot, bigger at higher rarity. Pure: same seed, same
// item, so a co-op server and the player's own screen agree on what dropped.
import { makeRng } from './rng.js';
import { RARITY, RARITY_BY_ID, plainSpec } from './loadout.js';
import { rollMods } from './mods.js';

/** Chance of each rarity by loot tier (mission tier 1 early … 5 late). Rare stays rare early (owner). */
export const RARITY_ODDS = {           // round 7: a step rarer across the board (owner: "I would like to see more rare parts")
  1: { common: 58, refined: 30, rare: 10, prototype: 2, experimental: 0 },
  2: { common: 45, refined: 33, rare: 16, prototype: 5, experimental: 1 },
  3: { common: 32, refined: 34, rare: 22, prototype: 9, experimental: 3 },
  4: { common: 22, refined: 32, rare: 27, prototype: 14, experimental: 5 },
  5: { common: 14, refined: 28, rare: 30, prototype: 19, experimental: 9 },
};

/** Bonus lines per slot. pct = a percent change to the part's own number (negative = less, for costs); value range
 *  [min, max] at Refined, scaled up by rarity step. flat lines add a plain number (lock targets, firmware, crit). */
export const ROLL_POOLS = {
  weapon: [
    { stat: 'damage', pct: true, range: [4, 9], label: 'damage' },
    { stat: 'rate', pct: true, range: [4, 8], label: 'fire rate' },
    { stat: 'range', pct: true, range: [6, 12], label: 'range' },
    { stat: 'reload', pct: true, range: [-12, -6], label: 'reload time' },
    { stat: 'heatPerShot', pct: true, range: [-14, -7], label: 'heat per shot' },
    { stat: 'shotEnergy', pct: true, range: [-14, -7], label: 'energy per shot' },
    { stat: 'crit', flat: true, range: [0.03, 0.06], label: 'crit chance', fmt: 'pct' },
  ],
  frame: [
    { stat: 'ap', pct: true, range: [4, 8], label: 'armour' },
    { stat: 'weight', pct: true, range: [-10, -5], label: 'weight' },
    { stat: 'energy', pct: true, range: [-12, -6], label: 'energy draw' },
    { stat: 'heat', pct: true, range: [-20, -10], label: 'heat' },
  ],
  head: [{ stat: 'scan', pct: true, range: [8, 15], label: 'scan range' }],
  arms: [{ stat: 'aim', pct: true, range: [4, 8], label: 'aim' }, { stat: 'melee', pct: true, range: [6, 12], label: 'melee' }, { stat: 'recoil', pct: true, range: [-12, -6], label: 'recoil' }],
  legs: [{ stat: 'speed', pct: true, range: [3, 6], label: 'speed' }, { stat: 'carry', pct: true, range: [5, 10], label: 'carry' }, { stat: 'jump', pct: true, range: [6, 12], label: 'jump' }],
  core: [{ stat: 'boostEff', pct: true, range: [4, 8], label: 'booster supply' }],
  booster: [
    { stat: 'thrust', pct: true, range: [4, 8], label: 'boost thrust' }, { stat: 'qbThrust', pct: true, range: [5, 10], label: 'quick boost' },
    { stat: 'qbCost', pct: true, range: [-14, -7], label: 'quick boost cost' }, { stat: 'boostCost', pct: true, range: [-12, -6], label: 'boost cost' },
    { stat: 'weight', pct: true, range: [-10, -5], label: 'weight' },
  ],
  generator: [
    { stat: 'capacity', pct: true, range: [4, 9], label: 'energy capacity' }, { stat: 'recharge', pct: true, range: [5, 10], label: 'recharge' },
    { stat: 'output', pct: true, range: [4, 8], label: 'output' }, { stat: 'weight', pct: true, range: [-10, -5], label: 'weight' },
  ],
  cooling: [
    { stat: 'sink', pct: true, range: [5, 10], label: 'heat capacity' }, { stat: 'rate', pct: true, range: [5, 10], label: 'cooling rate' },
    { stat: 'weight', pct: true, range: [-10, -5], label: 'weight' },
  ],
  cpu: [
    { stat: 'lockSpeed', pct: true, range: [-14, -7], label: 'lock time' }, { stat: 'lockRange', pct: true, range: [6, 12], label: 'lock range' },
    { stat: 'lockCount', flat: true, range: [1, 1], label: 'lock targets', int: true }, { stat: 'firmware', flat: true, range: [1, 1], label: 'firmware', int: true },
  ],
};
const FRAME_SLOTS = new Set(['head', 'core', 'arms', 'legs']);

/** The bonus-line pool for a part (its slot's lines, plus the general frame lines for frame parts). */
export function poolFor(part) {
  if (part.slot === 'weapon') {
    // lines a weapon can't use are left out (no reload on a beam with no magazine, no shot energy on a gun)
    return ROLL_POOLS.weapon.filter(r => (!['damage', 'crit'].includes(r.stat) || part.damage > 0) && (r.stat !== 'reload' || part.mag) && (r.stat !== 'shotEnergy' || part.shotEnergy) && (r.stat !== 'heatPerShot' || part.heatPerShot) && (r.stat !== 'rate' || part.rate));
  }
  return [...(ROLL_POOLS[part.slot] || []), ...(FRAME_SLOTS.has(part.slot) ? ROLL_POOLS.frame : [])].filter(r => r.stat === 'lockCount' || r.stat === 'firmware' || typeof part[r.stat] === 'number' || r.flat);
}

/** One bonus line, sized for a rarity step (1 = Refined … 4 = Experimental). */
export function rollLine(R, line, step) {
  const [lo, hi] = line.range, k = 1 + (step - 1) * 0.3;
  let v = (lo + (hi - lo) * R.next()) * (line.int ? 1 : k);
  v = line.int ? Math.round(v) : line.fmt === 'pct' ? Math.round(v * 1000) / 1000 : Math.round(v);
  return line.pct ? { stat: line.stat, value: v, pct: true } : { stat: line.stat, value: v };
}

/** Roll the bonus lines for an item (no stat twice). */
export function rollLines(R, part, rarity, keep = []) {
  const step = RARITY.findIndex(r => r.id === rarity); const n = RARITY_BY_ID[rarity]?.rolls || 0;
  const pool = poolFor(part).filter(l => !keep.some(k => k.stat === l.stat));
  const out = keep.slice();
  while (out.length < n && pool.length) { const i = Math.floor(R.next() * pool.length); out.push(rollLine(R, pool.splice(i, 1)[0], Math.max(1, step))); }
  return out;
}

export function pickRarity(R, tier, luck = 0) {
  const odds = RARITY_ODDS[Math.max(1, Math.min(5, tier))];
  let v = R.next() * 100;                                // high = rarer
  v += (100 - v) * Math.min(0.5, luck) * 0.4;            // luck nudges the roll up (better odds, never a guarantee)
  let acc = 0;
  for (const r of RARITY) { acc += odds[r.id]; if (v < acc) return r.id; }
  return [...RARITY].reverse().find(r => odds[r.id] > 0)?.id || 'common';
}

let uidN = 0;
export const newUid = (R) => 'i' + Date.now().toString(36) + (uidN++).toString(36) + Math.floor((R ? R.next() : Math.random()) * 1e6).toString(36);

/** The parts a loot tier can drop: Mech Kit tier ≤ ceiling (tier 1 → part tier 1; 2 → up to 2; 3+ → up to 3), weighted
 *  toward the newest. P = parts index; crafted-only weapons never drop. */
export function dropPool(P, tier) {
  const ceil = tier <= 1 ? 1 : tier === 2 ? 2 : 3;
  return Object.values(P).filter(p => !p.crafted && (p.tier || 1) <= ceil).map(p => ({ p, w: (p.tier || 1) === ceil ? 2 : 1 }));
}

/** A rolled part from a drop. seed = the pickup's seed (same every time it's opened). */
export function rollItem(P, { tier = 1, seed = 1, boss = false, luck = 0, slot = null, rarity = null, partId = null }) {
  const R = makeRng(seed);
  let part = partId ? P[partId] : null;
  if (!part) {
    const pool = dropPool(P, tier).filter(x => !slot || x.p.slot === slot);
    const tot = pool.reduce((s, x) => s + x.w, 0); let v = R.next() * tot;
    for (const x of pool) { v -= x.w; if (v <= 0) { part = x.p; break; } }
    part ||= pool[0].p;
  }
  const rar = rarity || pickRarity(R, tier + (boss ? 1 : 0), luck);
  const rolls = rollLines(R, part, rar);
  return { uid: newUid(R), id: part.id, rarity: rar, rolls, mods: rollMods(R, part, rar, plainSpec), found: Date.now() };
}

/** A crate (grade reward): 1 part + materials + sometimes a firmware chip or a schematic. */
export function openCrate(P, CHIPS, { tier = 1, seed = 1, luck = 0 }) {
  const R = makeRng(seed ^ 0x5bd1e995);
  const items = [rollItem(P, { tier, seed: seed * 31 + 7, luck: luck + 0.1 })];
  const mats = { scrap: 10 + Math.floor(R.next() * 12) * tier, alloy: Math.floor(R.next() * 3 * tier), exotic: tier >= 3 && R.next() < 0.15 * (tier - 2) ? 1 : 0 };
  const chips = [];
  if (R.next() < 0.4) { const pool = CHIPS.filter(c => (c.drop || 1) <= tier); if (pool.length) chips.push({ uid: newUid(R), id: pool[Math.floor(R.next() * pool.length)].id }); }
  const schematic = R.next() < 0.12 + 0.04 * tier ? tier : 0;
  return { items, mats, chips, schematic };
}

/** What a part gives back when scrapped at the workshop (rarer = rarer materials). */
export function salvageValue(part, item) {
  const step = RARITY.findIndex(r => r.id === (item?.rarity || 'common'));
  const t = part.tier || 1;
  return { scrap: 6 + 4 * t + step * 4, alloy: step >= 1 ? step * 2 + t - 1 : 0, exotic: step >= 3 ? step - 2 : 0 };
}
/** What the dealer pays for a part (a fifth of its price, more for rarity). */
export function sellValue(part, item) {
  const r = RARITY_BY_ID[item?.rarity || 'common'];
  return Math.round(((part.cost || 5000) * 0.2 * (1 + r.lift * 2)) / 50) * 50;
}

/** One bonus line as words: "+7% damage", "−9% heat per shot", "+1 lock targets", "+4% crit chance". */
export function lineText(roll, slot = null) {
  // the part's own slot first: 'rate' is fire rate on a weapon but cooling rate on a cooler
  const own = slot ? [...(ROLL_POOLS[slot === 'weapon' ? 'weapon' : slot] || []), ...ROLL_POOLS.frame] : [];
  const L = own.find(l => l.stat === roll.stat) || Object.values(ROLL_POOLS).flat().find(l => l.stat === roll.stat);
  const label = L?.label || roll.stat;
  const sign = roll.value < 0 ? '−' : '+';
  if (roll.pct) return `${sign}${Math.abs(roll.value)}% ${label}`;
  if (L?.fmt === 'pct') return `${sign}${Math.round(Math.abs(roll.value) * 100)}% ${label}`;
  return `${sign}${Math.abs(roll.value)} ${label}`;
}
