// The character sheet: attributes + level + worn gear -> every number a fight reads. Pure. The sim builds a hero from
// this; the browser shows the same numbers on the character screen (one function, so they can never disagree).
import { derived } from './character.js';
import { gearTotals, weaponDamage, gearScore, pct } from './items.js';
import { ATTRS } from './progression.js';

export const FISTS = { min: 1, max: 3, speed: 1.0, ranged: false, hands: 1 };
const DMG = ['fire', 'frost', 'storm', 'poison', 'shadow'];

export function sheet(ch, data) {
  const g = data ? gearTotals(data, ch.equip || {}) : { mods: {}, armour: 0, block: null };
  const m = g.mods, attrs = {};
  for (const a of ATTRS) attrs[a] = (ch.attrs?.[a] || 12) + (m[a] || 0);
  const d = derived({ ...ch, attrs });
  const allRes = m.allResist || 0;
  const resists = {}; for (const t of DMG) resists[t] = (m[t + 'Resist'] || 0) + allRes;
  const wpn = (data && ch.equip?.weapon && (!ch.equip.weapon.dur || ch.equip.weapon.dur[0] > 0)) ? weaponDamage(data, ch.equip.weapon) : null;
  return {
    attrs, level: ch.level,
    maxHp: Math.round(d.maxHp + (m.health || 0)), maxMana: Math.round(d.maxMana + (m.mana || 0)),
    hpRegen: +(d.hpRegen + (m.healthRegen || 0)).toFixed(2), manaRegen: +(d.manaRegen + (m.manaRegen || 0)).toFixed(2),
    meleePower: d.meleePower, rangedPower: d.rangedPower,
    spellPower: +(d.spellPower * (1 + pct(m.spellPower || 0))).toFixed(3), healPower: +(d.healPower * (1 + pct(m.healingPower || 0))).toFixed(3),
    attackPower: m.attackPower || 0,                                    // added per hit as attackPower / 14 (docs/ITEMS.md)
    crit: +(d.crit + (m.critChance || 0)).toFixed(2), critDamage: m.critDamage || 0, dodge: +(d.dodge + (m.dodge || 0)).toFixed(2),
    armour: g.armour, block: g.block, resists,
    elemFlat: Object.fromEntries(DMG.map(t => [t, m[t + 'DamageFlat'] || (t === 'poison' ? m.poisonDamageOverTime || 0 : 0)])),
    elemPct: Object.fromEntries(DMG.map(t => [t, m[t + 'DamagePct'] || 0])),
    castSpeed: m.castSpeed || 0, cooldownReduction: m.cooldownReduction || 0, moveSpeed: Math.min(30, m.moveSpeed || 0),
    lifeOnHit: m.lifeOnHit || 0, manaOnKill: m.manaOnKill || 0, thorns: m.thorns || 0, magicFind: m.magicFind || 0, goldFind: m.goldFind || 0,
    potionPower: m.potionPower || 0, threat: m.threat || 0, hitChance: m.hitChance || 0, lightRadius: m.lightRadius || 0,
    potionSlots: m.potionSlots || 0,
    weapon: wpn || FISTS, gearScore: data ? gearScore(data, ch.equip || {}) : 0,
  };
}
