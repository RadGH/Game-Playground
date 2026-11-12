// One place that turns a block + the item it came from (rarity, rolled bonuses, legendary power) into the
// numbers the game uses. ship.js (recompute), world.js (weapons), grid.js (block health) and ui/items.js
// (cards) all read through here, so a card can never promise something the game does not do.
//
// Rarity is a real power step (play-test #38, 2026-11-12: "an orange gatling gun should do significantly
// more than a blue one of the same tier"): RARITY[].bonus is the base-stat lift (types.js) — a legendary
// part is +85% before its bonuses, a rare one +28%.

import { RARITY_BY_ID } from '../data/types.js';

/** How strongly rarity lifts each stat (1 = the full rarity bonus). */
export const RARITY_WEIGHT = { dmg: 1, hp: 1, shield: 1, regen: 0.5, output: 0.6, cpuCap: 1, crewCap: 1, cargo: 1, thrust: 0.5, turn: 0.3, rate: 0.25, range: 0.15, repair: 1, scanRange: 0.5 };

export const rarityBonus = item => (item?.rarity ? RARITY_BY_ID[item.rarity]?.bonus || 0 : 0);

/**
 * The effective value of `key` for a block def + item.
 * Percent bonuses (mods[key]) multiply; flat ones (cpu, crew, slots, drones) add.
 */
export function partStat(def, item, key, base) {
  const m = item?.mods || {}; const rb = rarityBonus(item);
  const lift = 1 + rb * (RARITY_WEIGHT[key] ?? 0);
  switch (key) {
    case 'hp': return Math.round((base ?? def.hp) * lift * (1 + (m.hp || 0)));
    case 'powerOut': return def.power > 0 ? def.power * (1 + rb * RARITY_WEIGHT.output) * (1 + (m.output || 0)) * (m.sun ? 1.4 : 1) : 0;
    case 'powerUse': return def.power < 0 ? -def.power * (1 - (m.power || 0)) : 0;
    case 'cpu': return Math.max(0, (def.cpu || 0) - (m.cpuLess || 0));
    case 'cpuCap': return def.cpuCap ? Math.round(def.cpuCap * lift * (m.hive ? 1.5 : 1)) + (m.cpu || 0) : (m.cpu || 0);
    case 'crewCap': return def.crewCap ? Math.round(def.crewCap * lift * (m.commons ? 1.5 : 1)) + (m.crew || 0) : (m.crew || 0);
    case 'cargo': return def.cargo ? def.cargo * lift * (1 + (m.cargo || 0)) * (m.plenty ? 1.5 : 1) : 0;
    case 'thrust': return (def.thrust || 0) * lift * (1 + (m.thrust || 0));
    case 'turn': return (def.turn || 0) * lift * (1 + (m.turn || 0));
    case 'repair': return (def.repair || 0) * lift * (1 + (m.repair || 0));
    case 'autoSlots': return (def.autoSlots || 0) + (m.slots || 0);
    case 'drones': return (def.drones || 0) + (m.drones || 0);
    case 'scanRange': return (def.scanRange || 0) * lift * (1 + (m.scan || 0));
    case 'shield': return (def.shield?.hp || 0) * lift * (1 + (m.shield || 0));
    case 'regen': return (def.shield?.regen || 0) * lift * (1 + (m.regen || 0)) * (m.bulwark ? 2 : 1);
    default: return def[key];
  }
}

/** Weapon numbers: dmg (per hit / per second for beams), rate, range, turn. */
export function weaponStat(W, item, key) {
  const m = item?.mods || {}; const rb = rarityBonus(item);
  const lift = 1 + rb * (RARITY_WEIGHT[key] ?? 0);
  if (key === 'dmg') return W.dmg * lift * (1 + (m.dmg || 0));
  if (key === 'rate') return (W.rate || 0) * lift * (1 + (m.rate || 0));
  if (key === 'range') return W.range * lift * (1 + (m.range || 0));
  if (key === 'turn') return (W.turn || 3) * (1 + (m.turn || 0));
  return W[key];
}
