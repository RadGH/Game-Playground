// Items (parts and turrets) and the ONE function that turns an item into numbers: partStats. The ship stats, the
// sim, the item card and the shop price all read it, so a rarity lift or a Mk lift is applied in exactly one place.

import { PARTS, TURRETS, RARITY, TIER_LIFT, TIER_NAMES, BLOCKS } from '../data/blocks.js';
import { rng } from '../core/math.js';
import { fmt } from '../../../../shared/format.js';

let nextUid = 1;
export function setNextUid(n) { nextUid = Math.max(nextUid, n); }
export function makeItem(kind, tier = 1, rarity = 0, uid = null) {
  const it = { uid: uid || nextUid++, kind, tier: Math.max(1, Math.min(4, tier)), rarity: Math.max(0, Math.min(4, rarity)) };
  if (uid) setNextUid(uid + 1);
  return it;
}
export const itemDef = it => PARTS[it.kind] || TURRETS[it.kind];
export const itemName = it => `${itemDef(it)?.name || 'Part'} ${TIER_NAMES[it.tier - 1]}`;
export const rarityOf = it => RARITY[it.rarity] || RARITY[0];

// numbers that grow with Mk and rarity (everything else is copied as-is)
const GROWS = new Set(['dmg', 'power', 'thrust', 'torque', 'shield', 'regen', 'cargo']);
// numbers that grow a little with rarity only
const SOFT = new Set(['range', 'rate', 'turn']);

/**
 * Numbers for one item. Turret power use grows with Mk but not rarity (a better roll is pure gain).
 * Reactors' `power` is output; on everything else `power` is what it draws.
 */
export function partStats(it) {
  const def = itemDef(it); if (!def) return {};
  const tl = TIER_LIFT[it.tier - 1] || 1; const rl = (RARITY[it.rarity] || RARITY[0]).lift;
  const out = { hpMul: tl * (0.85 + rl * 0.15) };
  for (const [k, v] of Object.entries(def.base)) {
    if (def.tierScale?.[k]) { out[k] = def.tierScale[k][it.tier - 1]; if (k === 'maxBlocks') out[k] = Math.round(out[k] * (1 + (rl - 1) * 0.5)); continue; }
    if (k === 'power' && it.kind !== 'reactor' && it.kind !== 'bridge') { out[k] = v * (1 + (it.tier - 1) * 0.6); continue; }
    if (GROWS.has(k)) out[k] = v * tl * rl;
    else if (SOFT.has(k)) out[k] = v * (1 + (rl - 1) * 0.25) * (k === 'range' ? 1 + (it.tier - 1) * 0.08 : 1);
    else out[k] = v;
  }
  if (it.kind === 'bridge') out.power = def.base.power * tl;
  // economy: a workshop bonus ({ stat, amount }) is applied here and nowhere else
  if (it.bonus) applyBonus(out, it.bonus);
  return out;
}

// ------------------------------------------------------------------ workshop bonuses (economy)
// A crafted or re-rolled part carries one bonus: item.bonus = { stat, amount } (amount 0.07 = +7%).
// Which stats each kind can roll, and the words for them. `powerLess` = less power drawn; `hp` = block health.
const TURRET_BONUS = ['dmg', 'rate', 'range', 'turn', 'hp'];
export const BONUS_STATS = {
  autocannon: TURRET_BONUS, gatling: TURRET_BONUS, laser: TURRET_BONUS, railgun: TURRET_BONUS, flak: TURRET_BONUS,
  missile: TURRET_BONUS, plasma: TURRET_BONUS, mining: ['dmg', 'range', 'turn', 'hp'],
  bridge: ['hp', 'power'], reactor: ['power', 'hp'], thruster: ['thrust', 'hp'], gyro: ['torque', 'hp'],
  shield: ['shield', 'regen', 'powerLess'], cargo: ['cargo', 'hp'], targeting: ['powerLess', 'hp'],
};
export const BONUS_WORDS = {
  dmg: 'damage', rate: 'fire rate', range: 'range', turn: 'turn speed', hp: 'block health', power: 'power output',
  thrust: 'thrust', torque: 'turning force', shield: 'shield strength', regen: 'shield refill', cargo: 'cargo room', powerLess: 'less power used',
};
/** Bonus size range (at common); each rarity step adds 30%. */
export const BONUS_RANGE = [0.04, 0.1];
export const BONUS_RARITY_STEP = 0.3;
function applyBonus(out, b) {
  const k = 1 + (b.amount || 0);
  if (b.stat === 'hp') out.hpMul *= k;
  else if (b.stat === 'powerLess') { if (out.power != null) out.power /= k; }
  else if (out[b.stat] != null) out[b.stat] *= k;
}
/** Roll a bonus for an item (its rarity sets the size). `r` = core/math.js rng. */
export function rollBonus(r, it) {
  const list = BONUS_STATS[it.kind]; if (!list) return null;
  const stat = list[Math.floor(r() * list.length)];
  const amount = (BONUS_RANGE[0] + r() * (BONUS_RANGE[1] - BONUS_RANGE[0])) * (1 + it.rarity * BONUS_RARITY_STEP);
  return { stat, amount: Math.round(amount * 1000) / 1000 };
}
/** "+7% damage" (or '' when the part has no bonus). */
export const bonusText = it => (it?.bonus ? `+${fmt(it.bonus.amount * 100, { decimals: 1 })}% ${BONUS_WORDS[it.bonus.stat] || it.bonus.stat}` : '');

/** Damage per second of a turret item (for cards and ratings). */
export function turretDps(it) {
  const s = partStats(it); const def = TURRETS[it.kind]; if (!def) return 0;
  if (def.fire === 'beam') return s.dmg * s.pulse * s.rate;
  if (def.fire === 'mine') return s.dmg;
  return s.dmg * s.rate * (s.salvo || 1);
}

/** Shop price of an item. */
export function itemPrice(it) {
  const def = itemDef(it); const tierP = [1, 3.2, 9, 24][it.tier - 1]; const rarP = [1, 1.6, 2.8, 5, 9][it.rarity];
  const basis = { bridge: 600, reactor: 180, thruster: 120, gyro: 140, shield: 220, cargo: 90, targeting: 260, dronebay: 320, scanner: 240 }[it.kind] ?? (def?.cat === 'turret' ? 260 : 150);   // world: + drone bay, scanner
  return Math.round(basis * tierP * rarP / 10) * 10;
}

/** Roll a rarity for loot. `luck` 0..1 shifts the odds up. */
export function rollRarity(r, luck = 0) {
  const w = [60 - luck * 30, 26, 10 + luck * 14, 3.4 + luck * 8, 0.6 + luck * 3];
  return r.weighted(w.map((x, i) => ({ i, weight: Math.max(0.1, x) }))).i;
}
const LOOT_KINDS = ['autocannon', 'gatling', 'laser', 'railgun', 'flak', 'missile', 'plasma', 'mining', 'reactor', 'thruster', 'gyro', 'shield', 'cargo', 'targeting', 'bridge', 'dronebay', 'scanner'];   // world: + drone bay, scanner
const LOOT_WEIGHT = { autocannon: 10, gatling: 8, laser: 8, railgun: 5, flak: 6, missile: 5, plasma: 5, mining: 4, reactor: 7, thruster: 7, gyro: 5, shield: 6, cargo: 4, targeting: 3, bridge: 1.5, dronebay: 2.5, scanner: 3 };
/** One random loot item for a danger level. */
export function rollLootItem(seed, danger, luck = 0) {
  const r = rng(seed);
  const kind = r.weighted(LOOT_KINDS.map(k => ({ k, weight: LOOT_WEIGHT[k] }))).k;
  const tier = Math.max(1, Math.min(4, Math.round(1 + (danger - 1) * 0.55 + (r() - 0.5) * 1.2)));
  return makeItem(kind, tier, rollRarity(r, Math.min(1, luck + danger * 0.05)));
}

/** Lines for an item card, generated from the real numbers. */
export function itemLines(it) {
  const s = partStats(it); const def = itemDef(it); const L = [];
  const n = (v, d = 0) => fmt(v, { decimals: d });
  if (def.cat === 'turret') {
    if (def.fire === 'beam') L.push(['Damage', `${n(s.dmg)}/s for ${n(s.pulse, 2)}s per pulse`]);
    else if (def.fire === 'mine') L.push(['Cutting', `${n(s.dmg)}/s, ×${s.rockMul} on rock`]);
    else L.push(['Damage', `${n(s.dmg, 1)} per hit${s.salvo ? ` × ${s.salvo} missiles` : ''}`]);
    if (def.fire !== 'beam' && def.fire !== 'mine') L.push(['Fire rate', `${n(s.rate, 2)} per second`]);
    else if (def.fire === 'beam') L.push(['Pulses', `${n(s.rate, 2)} per second`]);
    L.push(['Damage per second', (n(turretDps(it), 1))]);
    L.push(['Range', `${n(s.range)} m`]);
    if (s.splash) L.push(['Blast radius', `${n(s.splash, 1)} m`]);
    if (s.charge) L.push(['Charge time', `${n(s.charge, 2)}s`]);
    L.push(['Turn speed', `${n(s.turn * 57.3)}° per second`]);
    L.push(['Damage type', def.dmgType[0].toUpperCase() + def.dmgType.slice(1)]);
    L.push(['Power use', (n(s.power, 1))]);
  } else {
    if (it.kind === 'bridge') { L.push(['Block limit', String(s.maxBlocks)]); L.push(['Auto-aim turrets', String(s.auto)]); L.push(['Power output', (n(s.power, 1))]); }
    if (it.kind === 'reactor') L.push(['Power output', (n(s.power, 1))]);
    if (it.kind === 'thruster') L.push(['Thrust', `${n(s.thrust)} kN`]);
    if (it.kind === 'gyro') L.push(['Turning force', (n(s.torque))]);
    if (it.kind === 'shield') { L.push(['Shield', (n(s.shield))]); L.push(['Refill', `${n(s.regen, 1)}/s after 3 s out of fire`]); L.push(['Power use', (n(s.power, 1))]); }
    if (it.kind === 'cargo') L.push(['Ore room', (n(s.cargo))]);
    if (it.kind === 'targeting') { L.push(['Auto-aim turrets', `+${s.auto}`]); L.push(['Power use', (n(s.power, 1))]); }
    if (it.kind === 'dronebay') { L.push(['Drones', `${s.bays} (rebuilt free 12 s after one is lost)`]); L.push(['Power use', (n(s.power, 1))]); }   // world:
    if (it.kind === 'scanner') { L.push(['Scan reach', `${n(s.scan / 1000, 1)} km (bridge alone: 1.5 km)`]); L.push(['Power use', (n(s.power, 1))]); }
  }
  L.push(['Block health', String(Math.round(BLOCKS[it.kind].hp * s.hpMul))]);
  return L;
}
