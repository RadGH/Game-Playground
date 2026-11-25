// Oathwild — the character sheet: every number the game reads off a character. Pure.
//
//   sheetOf(rules, char, { form })            → sheet (below); recompute whenever gear, levels,
//                                                 points, talents or a shape change (live buffs are
//                                                 applied by combat.js / rpg.strike, not baked in here)
//   attrTotals(rules, char)                     { str: 14, … } (for requirement checks)
//   STAT_KEYS                                   every `mods` key a passive, talent, background or aura may use
//
// Farhold's Rpg.derive still builds the weapon dice, armour, gear affixes, sets and legendary powers
// (its attribute weights are switched off in attributes.json `farholdPlayer`); this file lays
// Oathwild's attributes, classes, passives, talents and background over that, once, in one place.

import { ATTRS, attrBreakdown, perPointShare } from './attributes.js';
import { classGrowth, passiveMods } from './classes.js';
import { talentMods } from './talents.js';
import { carriedWeight, isBroken } from './inventory.js';
import { attackPlan } from './casters.js';

/** The mods vocabulary (class passives, talents, backgrounds, forms). Percent keys are percent numbers (5 = +5%). */
export const STAT_KEYS = Object.freeze([
  ...ATTRS,
  'maxHp', 'maxHpPct', 'maxMp', 'maxMpPct', 'maxStaminaPct', 'staminaRegen', 'hpRegen', 'mpRegen',
  'armor', 'armorPct', 'magicResist', 'dodge', 'critChance', 'critDamage', 'blockChance', 'blockPower', 'resistAll',
  'meleePct', 'rangedPct', 'spellPct', 'healPct', 'petPct',
  'firePct', 'icePct', 'lightningPct', 'arcanePct', 'shadowPct', 'holyPct', 'naturePct', 'poisonPct', 'physicalPct',
  'movePct', 'hastePct', 'cooldownPct', 'threatPct', 'carry', 'priceCut', 'lifeSteal', 'thorns', 'enchantSlots',
]);
const STAT_SET = new Set(STAT_KEYS);

/** Oathwild's gear slots (Farhold's SLOTS minus light/mount, which Oathwild does not have). */
export const GEAR_SLOTS = Object.freeze(['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'ring2', 'necklace']);

const r2 = v => Math.round(v * 100) / 100;

/** Gear Farhold should see: no broken pieces, and Oathwild-only affixes (proficiency grants) left out. */
/** A shield's built-in Farhold block affix (Oathwild uses its own shield numbers instead). */
export const farholdShieldBlock = a => !!a?.baseIntrinsic && (a.stat === 'block_chance' || a.stat === 'block_power');

function farholdGear(rules, char) {
  const eq = {};
  for (const slot of GEAR_SLOTS) {
    const it = char.gear?.[slot];
    if (!it || isBroken(rules, it)) continue;
    // a shield's built-in Farhold block ("Base Block" / "Base Block Power") is replaced by Oathwild's own shield numbers
    // (data/combat.json block, read by shieldBlock): only rolled block affixes still add
    eq[slot] = it.affixes?.some(a => a.oathwild || farholdShieldBlock(a)) ? { ...it, affixes: it.affixes.filter(a => !a.oathwild && !farholdShieldBlock(a)) } : it;
  }
  return eq;
}

/**
 * A shield's own block (data/combat.json `block`): { chance, stops } for a shield, null for anything else (a quiver,
 * a magic ward, a weapon, nothing). The one place the shield numbers are read — the sheet, the item card and the
 * world sim all ask here.
 */
export function shieldBlock(rules, item) {
  if (!item || !item.isShield || item.isMagicShield || item.baseKey === 'quiver') return null;
  const B = rules.data.combat.block;
  if (!B) return null;
  const row = B.shields[item.baseKey] || B.shields[B.fallback];
  return row ? { chance: row.chance, stops: row.stops } : null;
}

/** Sum every mods source into one bag, remembering where each part came from. */
function collectMods(rules, char, extra = []) {
  const bg = rules.data.backgrounds.backgrounds[char.background];
  const sources = [
    ...passiveMods(rules, char),
    ...talentMods(rules, char),
    ...(bg?.mods && Object.keys(bg.mods).length ? [{ source: `${bg.name} (background)`, mods: bg.mods }] : []),
    ...extra,
  ];
  const total = {}, from = {}, unknown = [];
  for (const s of sources) {
    for (const [k, v] of Object.entries(s.mods || {})) {
      if (!STAT_SET.has(k)) { unknown.push(k); continue; }
      total[k] = (total[k] || 0) + v;
      (from[k] = from[k] || []).push({ source: s.source, value: v });
    }
  }
  return { total, from, unknown };
}

/** Attribute totals only (cheap enough for requirement checks). */
export function attrTotals(rules, char) {
  const s = sheetOf(rules, char);
  return Object.fromEntries(ATTRS.map(k => [k, s.attrs[k].total]));
}

/** The share an attribute adds to a weapon by its statScaling ("str_dex" takes the better of the two). */
function weaponAttrShare(rules, weapon, A, { ranged = false } = {}) {
  if (!weapon) return Math.max(perPointShare(rules, 'str', 'heavyShare', A.str), 0);
  const parts = String(weapon.statScaling || (weapon.weaponCategory === 'heavy' ? 'str' : 'dex')).split('_');
  let best = -Infinity;
  for (const p of parts) {
    let v = 0;
    if (p === 'str') v = perPointShare(rules, 'str', 'heavyShare', A.str);
    else if (p === 'dex') v = perPointShare(rules, 'dex', ranged ? 'rangedShare' : 'lightShare', A.dex);
    else if (p === 'int') v = perPointShare(rules, 'int', 'spellShare', A.int);
    best = Math.max(best, v);
  }
  return best === -Infinity ? 0 : best;
}

/** The sheet. `form` = a live shape (wolf, bear, cat) whose stats change the body. */
export function sheetOf(rules, char, { form = null } = {}) {
  const AD = rules.data.attributes;
  const base = AD.base;
  const fp = rules.balance.player;
  const level = char.level || 1;

  // 1) Farhold's sheet for the gear, with its own attribute weights at zero
  const unit = { level, attrs: { str: 0, dex: 0, int: 0, con: 0 }, equipment: farholdGear(rules, char), statuses: {}, talents: [], passiveRanks: {} };
  const d = rules.rpg.derive(unit);
  const gearAttr = { str: Math.round(d.str || 0), dex: Math.round(d.dex || 0), int: Math.round(d.int || 0), con: Math.round(d.con || 0), wis: 0, cha: 0 };

  // 2) every mods source, then attributes
  const formMods = [];
  if (form?.stats) {
    const fs = form.stats;
    formMods.push({ source: `${form.name} shape`, mods: { armorPct: (fs.armorPct || 0) * 100, maxHpPct: (fs.maxHpPct || 0) * 100, movePct: (fs.movePct || 0) * 100, hastePct: (fs.hastePct || 0) * 100, thorns: fs.thorns || 0 } });
  }
  const M = collectMods(rules, char, formMods);
  const m = k => M.total[k] || 0;
  const growth = classGrowth(rules, char);
  const bg = rules.data.backgrounds.backgrounds[char.background];
  const bonusAttr = {};
  for (const k of ATTRS) bonusAttr[k] = m(k) + (bg?.attrs?.[k] || 0);
  const attrs = attrBreakdown(rules, char, { class: growth.attrs, gear: gearAttr, bonus: bonusAttr });
  const A = Object.fromEntries(ATTRS.map(k => [k, attrs[k].total]));
  const pp = (k, f) => perPointShare(rules, k, f, A[k]);

  // 3) resources
  const gearHp = d.maxHp - (fp.baseHp ?? 0);
  const conHp = pp('con', 'hpFlat') + pp('con', 'hpPerLevel') * level;
  const hpRaw = base.hp + growth.hp + conHp + gearHp + m('maxHp');
  const maxHp = Math.max(1, Math.round(hpRaw * (1 + m('maxHpPct') / 100)));
  const castAttr = Math.max(A.int, A.wis, A.cha);
  const gearMp = d.maxMp - (fp.baseMp ?? 0);
  const mpRaw = base.mp + growth.mp + perPointShare(rules, 'int', 'mp', castAttr) + gearMp + m('maxMp');
  const maxMp = Math.max(0, Math.round(mpRaw * (1 + m('maxMpPct') / 100)));
  const maxStamina = Math.max(10, Math.round((base.stamina + pp('con', 'stamina') + pp('dex', 'stamina')) * (1 + m('maxStaminaPct') / 100)));

  // 4) defence
  const armor = Math.max(0, Math.round((d.armor + m('armor')) * (1 + m('armorPct') / 100)));
  const magicResist = Math.max(0, Math.round(d.magicResist + pp('wis', 'magicResist') + m('magicResist')));
  const fdex = AD.farholdDex;
  const dodge = Math.max(0, r2(d.dodge - (d.dex || 0) * fdex.dodge + pp('dex', 'dodge') + m('dodge')));
  const critChance = Math.max(0, r2(base.critChance + (d.critChance - (fp.critChance ?? 5) - (d.dex || 0) * fdex.critChance) + pp('dex', 'critChance') + m('critChance')));
  const critDamage = r2(d.critDamage + m('critDamage'));

  // 5) power
  const weapon = unit.equipment.weapon || null;
  const ranged = !!weapon?.ranged;
  const physK = 1 + m('physicalPct') / 100;
  const shareM = weaponAttrShare(rules, weapon, A, { ranged: false });
  const meleeK = (1 + shareM) * (1 + m('meleePct') / 100) * physK * (ranged ? 0.5 : 1);
  const melee = d.damage.map(v => Math.max(1, Math.round(v * meleeK)));
  const shareR = ranged ? weaponAttrShare(rules, weapon, A, { ranged: true }) : 0;
  const rangedRange = ranged ? d.damage.map(v => Math.max(1, Math.round(v * (1 + shareR) * (1 + m('rangedPct') / 100) * physK))) : null;
  const offhand = d.offDamage ? d.offDamage.map(v => Math.max(1, Math.round(v * meleeK))) : null;
  // spell power: a level curve, plus a share of a magic weapon (and an orb or tome in the off hand)
  const lvlK = 1 + base.spellPerLevel * (level - 1);
  const magicW = [weapon, unit.equipment.offhand].filter(w => w?.type === 'weapon' && w.weaponCategory === 'magic' && w.dmg);
  const spellBase = [0, 1].map(i => base.spellPower[i] * lvlK + magicW.reduce((s, w) => s + w.dmg[i] * base.magicWeaponShare, 0));
  const gearSpell = 1 + (d.spellPower || 0);
  const spellFor = attr => spellBase.map(v => Math.max(1, Math.round(v * (1 + pp(attr, 'spellShare')) * (1 + m('spellPct') / 100) * gearSpell)));
  const spell = { int: spellFor('int'), wis: spellFor('wis'), cha: spellFor('cha') };
  const healK = (1 + pp('wis', 'healShare')) * (1 + m('healPct') / 100);
  const heal = spellBase.map(v => Math.max(1, Math.round(v * (1 + pp('wis', 'spellShare')) * healK * gearSpell)));
  const school = {};
  for (const el of ['fire', 'ice', 'lightning', 'arcane', 'shadow', 'holy', 'nature', 'poison', 'physical']) school[el] = m(`${el}Pct`);

  // 6) movement, speed, carrying
  const armourSlow = d.moveSpeed / ((fp.moveSpeed ?? 5.4) * (1 + (d.movePct || 0) / 100));
  const carry = Math.round(base.carry + pp('str', 'carry') + pp('con', 'carry') + m('carry'));
  const carried = r2(carriedWeight(rules, char));
  const overloaded = carried > carry;
  const moveSpeed = r2(base.moveSpeed * armourSlow * (1 + m('movePct') / 100) * (overloaded ? rules.data.inventory.carry.overloadMove : 1));
  const hasteK = 1 + m('hastePct') / 100;
  const attackEvery = r2(d.attackEvery / hasteK);

  const how = {
    maxHp: [
      { label: 'Base', value: base.hp },
      { label: 'Class levels', value: growth.hp },
      { label: `Constitution ${A.con}`, value: Math.round(conHp) },
      { label: 'Gear', value: Math.round(gearHp) },
      ...(M.from.maxHp || []).map(f => ({ label: f.source, value: f.value })),
      ...(M.from.maxHpPct || []).map(f => ({ label: f.source, pct: f.value })),
    ],
    maxMp: [
      { label: 'Base', value: base.mp },
      { label: 'Class levels', value: growth.mp },
      { label: 'Best casting attribute', value: Math.round(perPointShare(rules, 'int', 'mp', castAttr)) },
      { label: 'Gear', value: Math.round(gearMp) },
      ...(M.from.maxMpPct || []).map(f => ({ label: f.source, pct: f.value })),
    ],
    melee: { dice: d.damage, attrShare: shareM, pct: m('meleePct') },
    ranged: ranged ? { dice: d.damage, attrShare: shareR, pct: m('rangedPct') } : null,
    spell: { base: spellBase, levelK: lvlK, gear: gearSpell, pct: m('spellPct') },
  };

  const shield = shieldBlock(rules, unit.equipment.offhand || null);
  const gearAffix = stat => Object.values(unit.equipment).reduce((t, it) => t + (it.affixes || []).filter(a => a.stat === stat).reduce((u, a) => u + (Number(a.value) || 0), 0), 0);
  const blockBonus = r2(gearAffix('block_chance') + m('blockChance'));
  const out = {
    level, attrs, A,
    maxHp, maxMp, maxStamina,
    hpRegen: r2(base.hpRegen + (d.hpRegen - (fp.hpRegen ?? 0)) + m('hpRegen')),
    mpRegen: r2(base.mpRegen + pp('wis', 'mpRegen') + m('mpRegen') + Math.max(0, (d.mpRegen || 1) - 1)),
    staminaRegen: r2(base.staminaRegen + m('staminaRegen')),
    armor, magicResist, dodge, critChance, critDamage,
    // block: only with a shield in the off hand (owner 2026-11-25: a passive chance like WoW, no button); gear and
    // passives add to the shield's own chance. blockBonus = what would add if a shield were held (for the sheet).
    // (Farhold's own weapon parry, `guard`, is not a block here: only a shield blocks)
    blockChance: shield ? Math.min(rules.data.combat.block.maxChance ?? 75, r2(shield.chance + blockBonus)) : 0,
    blockStops: shield ? shield.stops : 0, blockBonus,
    blockPower: shield ? Math.round(gearAffix('block_power')) : 0,
    resistAll: r2((d.resistAll || 0) + m('resistAll')),
    lifeSteal: r2((d.lifeSteal || 0) + m('lifeSteal')), thorns: r2((d.thorns || 0) + m('thorns')),
    melee, ranged: rangedRange, offhand, spell, heal, school,
    petPct: r2(m('petPct') + pp('cha', 'petShare') * 100),
    cooldownPct: Math.min(40, m('cooldownPct')), threatPct: m('threatPct'),
    priceCut: Math.min(40, r2(pp('cha', 'priceCut') * 100 + m('priceCut'))),
    enchantSlots: m('enchantSlots'),
    moveSpeed, attackEvery, hastePct: m('hastePct'),
    carry, carried, overloaded,
    swing: d.swing, weapon, holdsRanged: ranged,
    mods: M.total, modsFrom: M.from, unknownMods: M.unknown,
    how,
    farhold: d,
  };
  // a magic weapon's basic attack (wand / tome / staff style, a sceptre's swing, the off hand's rider): one plan
  // that js/rules/caster-attack.js fights with and describe.js writes the card from (js/rules/casters.js)
  out.caster = attackPlan(rules, { weapon: weapon ? char.gear?.weapon : null, offhand: unit.equipment.offhand ? char.gear?.offhand : null }, out);
  return out;
}
