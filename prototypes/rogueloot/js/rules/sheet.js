// The character sheet: attributes + level + worn gear -> every number a fight reads. Pure. The sim builds a hero from
// this; the browser shows the same numbers on the character screen (one function, so they can never disagree).
import { derived } from './character.js';
import { gearTotals, weaponDamage, gearScore, pct } from './items.js';
import { ATTRS } from './progression.js';

export const FISTS = { min: 1, max: 3, speed: 1.0, ranged: false, hands: 1 };
const DMG = ['fire', 'frost', 'storm', 'poison', 'shadow'];

/** The melee Paths stand in the hits casters keep away from, so they are built sturdier (balance bot, 2026-11-11). */
export const PATH_BONUS = { fighter: { hpPct: 25, armourPct: 15, dr: 10 }, rogue: { hpPct: 25, dodge: 8, dr: 10 } };

export function sheet(ch, data, skills = null) {
  const pb = PATH_BONUS[ch.path] || {};
  const g = data ? gearTotals(data, ch.equip || {}) : { mods: {}, armour: 0, block: null };
  const m = { ...g.mods }, attrs = {};
  // passive skills (data/skills-paths.json): { stat, value, perRank } added like gear
  const P = { armourPct: 'armourPctPassive', crit: 'critChance', dodge: 'dodge', manaRegen: 'manaRegen', castSpeed: 'castSpeed', healPower: 'healingPower', spellPower: 'spellPower', attackSpeed: 'attackSpeed', maxHp: 'health', maxMana: 'mana', hpRegen: 'healthRegen', moveSpeed: 'moveSpeed', threat: 'threat', critDamage: 'critDamage', lifeOnHit: 'lifeOnHit', resistAll: 'allResist', blockChance: 'blockChance', rageGen: 'rageGen', energyRegen: 'energyRegen', meleePower: 'meleePowerPct', rangedPower: 'rangedPowerPct' };
  if (skills) for (const [id, r] of Object.entries(ch.skills || {})) { const s = skills[id]; if (s?.kind === 'passive' && r > 0 && s.passive) { const k = P[s.passive.stat] || s.passive.stat; m[k] = (m[k] || 0) + s.passive.value + (s.passive.perRank || 0) * (r - 1); } }
  for (const a of ATTRS) attrs[a] = (ch.attrs?.[a] || 12) + (m[a] || 0);
  const d = derived({ ...ch, attrs });
  const allRes = m.allResist || 0;
  const resists = {}; for (const t of DMG) resists[t] = (m[t + 'Resist'] || 0) + allRes;
  const wpn = (data && ch.equip?.weapon && (!ch.equip.weapon.dur || ch.equip.weapon.dur[0] > 0)) ? weaponDamage(data, ch.equip.weapon) : null;
  return {
    attrs, level: ch.level, dr: pb.dr || 0,                             // damage reduction, percent (melee Paths)
    maxHp: Math.round((d.maxHp + (m.health || 0)) * (1 + (pb.hpPct || 0) / 100)), maxMana: Math.round(d.maxMana + (m.mana || 0)),
    hpRegen: +(d.hpRegen + (m.healthRegen || 0)).toFixed(2), manaRegen: +(d.manaRegen + (m.manaRegen || 0)).toFixed(2),
    meleePower: +(d.meleePower * (1 + (m.meleePowerPct || 0) / 100)).toFixed(3), rangedPower: +(d.rangedPower * (1 + (m.rangedPowerPct || 0) / 100)).toFixed(3), rageGen: m.rageGen || 0, energyRegen: m.energyRegen || 0,
    spellPower: +(d.spellPower * (1 + pct(m.spellPower || 0))).toFixed(3), healPower: +(d.healPower * (1 + pct(m.healingPower || 0))).toFixed(3),
    attackPower: m.attackPower || 0,                                    // added per hit as attackPower / 14 (docs/ITEMS.md)
    crit: +(d.crit + (m.critChance || 0)).toFixed(2), critDamage: m.critDamage || 0, dodge: +(d.dodge + (m.dodge || 0) + (pb.dodge || 0)).toFixed(2),
    armour: Math.round(g.armour * (1 + ((m.armourPctPassive || 0) + (pb.armourPct || 0)) / 100)), block: g.block, resists,
    elemFlat: Object.fromEntries(DMG.map(t => [t, m[t + 'DamageFlat'] || (t === 'poison' ? m.poisonDamageOverTime || 0 : 0)])),
    elemPct: Object.fromEntries(DMG.map(t => [t, m[t + 'DamagePct'] || 0])),
    castSpeed: m.castSpeed || 0, cooldownReduction: m.cooldownReduction || 0, moveSpeed: Math.min(30, m.moveSpeed || 0),
    lifeOnHit: m.lifeOnHit || 0, manaOnKill: m.manaOnKill || 0, thorns: m.thorns || 0, magicFind: m.magicFind || 0, goldFind: m.goldFind || 0,
    potionPower: m.potionPower || 0, threat: m.threat || 0, hitChance: m.hitChance || 0, lightRadius: m.lightRadius || 0,
    potionSlots: m.potionSlots || 0,
    weapon: wpn || FISTS, gearScore: data ? gearScore(data, ch.equip || {}) : 0,
  };
}
