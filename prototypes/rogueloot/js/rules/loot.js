// Loot (rulings 5, 38, 39): what a kill or a chest gives ONE player (personal loot — every hero rolls their own).
// Pure; reads data/rarity.json through the item data. Also the vendor and gambler maths (the town uses them in M13).
//   dropsFor(items, potions, rng, { level, kind, players, mf, gf, ch }) -> { items: [...], gold, potions: [...] }
//   chestDrops(items, potions, rng, { level, tier, ... })
import { interp, makeItem, rollRarity, RARITIES } from './items.js';
import { makePotion } from './potions.js';

const pickCount = (rng, w) => { const tot = w.reduce((a, b) => a + b, 0); let k = rng() * tot; for (let i = 0; i < w.length; i++) { k -= w[i]; if (k <= 0) return i; } return w.length - 1; };
const atLeast = (r, min) => RARITIES.indexOf(r) < RARITIES.indexOf(min) ? min : r;

/** Gold for a kind of kill at an area level (with gold find, whole points). */
export function goldFor(R, rng, level, rank = 'normal', gf = 0, players = 1) {
  const G = R.gold || {}, chance = interp(G.chancePct, level);
  if (rank === 'normal' && rng() * 100 >= chance) return 0;
  const a = G.amount || { base: 2, perLevel: 1.2, spread: [0.6, 1.4] };
  const v = (a.base + a.perLevel * level) * (a.spread[0] + rng() * (a.spread[1] - a.spread[0])) * (G.rankMult?.[rank] ?? 1);
  return Math.max(1, Math.round(v * (1 + gf / 100) * (1 + (R.perExtraPlayer?.goldPct || 0) / 100 * (players - 1))));
}
export function potionDrop(R, P, rng, level) {
  const Pt = R.potions || {}; if (rng() * 100 >= interp(Pt.chancePct, level)) return null;
  const size = (Pt.sizes || []).find(s => level <= s.levelMax)?.id || 'minor';
  return makePotion(rng, rng() * 100 < (Pt.healthWeight ?? 70) ? 'health' : 'mana', P.sizes?.[size] ? size : 'minor', 1);
}

/** One player's drops from one kill. kind: normal | champion | rare | boss | actBoss. */
export function dropsFor(items, P, rng, { level, kind = 'normal', players = 1, mf = 0, gf = 0, ch = null, firstKill = false, minFirst = null }) {
  const R = items.rarity, D = R.itemDrops?.[kind] || R.itemDrops?.normal || { chancePct: [[1, 16]], count: [93, 6, 1] };
  const ilvl = Math.min(R.ilvlCap || 65, level + (R.ilvlBonus?.[kind] ?? 0));
  const out = { items: [], gold: goldFor(R, rng, level, kind, gf, players), potions: [] };
  const chance = interp(D.chancePct, level) + (R.perExtraPlayer?.itemChancePct || 0) * (players - 1);
  if (rng() * 100 < chance) {
    const n = pickCount(rng, D.count) + 1 + (D.extra || 0);          // count[i] = weight for i+1 items
    let rares = D.guaranteedRares || 0;
    for (let i = 0; i < Math.max(1, n); i++) {
      let r = rollRarity(items, rng, ilvl, kind, mf);
      if (D.guaranteedMinRarity) r = atLeast(r, D.guaranteedMinRarity);
      if (rares > 0) { r = atLeast(r, 'rare'); rares--; }
      if (i === 0 && minFirst) r = atLeast(r, minFirst);           // champions: a guaranteed magic+, rares: a guaranteed rare+
      if (firstKill && D.firstKillUniqueChancePct && i === 0 && rng() * 100 < D.firstKillUniqueChancePct) r = 'unique';
      { const it = makeItem(items, rng, ilvl, { rarity: r, ch }); if (it) out.items.push(it); }
    }
  }
  const pot = potionDrop(R, P, rng, level); if (pot) out.potions.push(pot);
  return out;
}

/** A chest's drops for one player (tiers in rarity.json `chests`: crate, chest, lockedChest, bossHoard). */
export function chestDrops(items, P, rng, { level, tier = 'chest', mf = 0, gf = 0, ch = null, players = 1 }) {
  const R = items.rarity, C = R.chests?.[tier] || R.chests?.chest || { items: [15, 60, 22, 3], ilvlBonus: 0 };
  const ilvl = Math.min(R.ilvlCap || 65, level + (C.ilvlBonus || 0));
  const out = { items: [], gold: goldFor(R, rng, level, C.gold === 'chest' ? 'chest' : C.gold || 'chest', gf, players) || 0, potions: [] };
  const n = pickCount(rng, C.items);
  let rares = C.guaranteedRares || 0;
  for (let i = 0; i < n; i++) {
    let r = rollRarity(items, rng, ilvl, C.mult || 'chest', mf);
    if (C.minRarity) r = atLeast(r, C.minRarity);
    if (rares > 0) { r = atLeast(r, 'rare'); rares--; }
    { const it = makeItem(items, rng, ilvl, { rarity: r, ch }); if (it) out.items.push(it); }
  }
  if (rng() * 100 < (C.potionChancePct || 0)) { const p = potionDrop({ ...R, potions: { ...R.potions, chancePct: [[1, 100]] } }, P, rng, level); if (p) out.potions.push(p); }
  return out;
}

// ---- vendors (M13 uses these) -----------------------------------------------------------------------------------------
/** What a vendor pays for an item (sellPct of its value). */
export function itemValue(items, it) {
  const G = items.rarity.gold || {}, b = items.bases[it.base] || {};
  const kv = G.kindValue?.[b.kind] ?? G.kindValue?.[b.slot] ?? 6;
  return Math.max(1, Math.round(kv * (1 + it.ilvl * 0.35) * (G.rarityValueMult?.[it.ided === false ? 'rare' : it.rarity] ?? 1)));
}
export const sellPrice = (items, it) => Math.max(1, Math.round(itemValue(items, it) * (items.rarity.gold?.sellPct ?? 20) / 100));
export const buyPrice = (items, it) => itemValue(items, it);
/** The gambler: an unidentified item for 3x a normal one's value, rarity from a flat table. */
export function gamble(items, rng, level, base, ch = null) {
  const r = (() => { const t = { magic: 78, rare: 20, unique: 1.6, legendary: 0.4 }; let k = rng() * 100; for (const [id, w] of Object.entries(t)) { k -= w; if (k <= 0) return id; } return 'magic'; })();
  const it = makeItem(items, rng, level, { rarity: r, base, ch }) || makeItem(items, rng, level, { rarity: 'magic', base, ch });
  if (!it) return null;
  it.ided = false;
  return it;
}
