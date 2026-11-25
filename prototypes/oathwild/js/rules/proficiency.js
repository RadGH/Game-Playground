// Oathwild — may this character wear / wield this item? Pure. The ONE reader of data/proficiency.json.
//
//   itemNeeds(rules, item)                     { prof, attr: { stat, value, name }, level, label } | null
//   levelGate(rules, item)                     the level it asks for (1 = none; only rare and better have one)
//   profSources(rules, char, { item, slot })   { prof: [source names] } — always, class nodes, talents, worn
//                                               items' enchantments (minus the slot being replaced) and the
//                                               item's own enchantment
//   canWear(rules, char, item, { slot })       { ok, why } — why is player language
//   canWield = canWear (weapons use the same rule)
//   profAffix(rules, id) / addProfAffix(item, def)   the "of the Bulwark"-style enchantments

import { classProfs } from './classes.js';
import { talentProfs } from './talents.js';
import { attrTotals } from './sheet.js';

const P = rules => rules.data.proficiency;
const baseOf = (rules, item) => rules.data.items.weaponBases[item?.baseKey] || rules.data.items.armorBases[item?.baseKey] || null;

const ATTR_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
/** The level an item still asks for (owner 2026-11-25: hardly any — only rare and better, well below their item level). */
export function levelGate(rules, item) {
  const g = P(rules).attrNeeds?.levelGate || {};
  const rarity = item?.setId ? 'set' : item?.isUnique ? 'unique' : item?.rarity || 'normal';
  if (g[rarity] == null) return 1;
  return Math.max(1, (item.ilvl || item.levelReq || 1) - g[rarity]);
}
/** The attribute an item asks for: { stat, value, name } or null. need = base + floor(item level / perLevels). */
function attrNeed(rules, item, row) {
  if (!row || !row.base) return null;
  const A = P(rules).attrNeeds;
  const stats = [].concat(row.stat);
  return { stats, stat: stats[0], value: row.base + Math.floor((item.ilvl || 1) / (A.perLevels || 4)), name: stats.map(k => ATTR_NAME[k] || k).join(' or ') };
}
/** The attribute you meet a need with: the highest of the ones it accepts. */
export const attrHave = (need, totals) => Math.max(...need.stats.map(k => totals[k] || 0));
/** What an item needs: a proficiency (training), an attribute score and a level. { prof, attr, str, level, label } */
export function itemNeeds(rules, item) {
  if (!item) return null;
  const pd = P(rules), A = pd.attrNeeds || {};
  const level = levelGate(rules, item);
  let prof = null, row = null;
  if (item.type === 'weapon') { prof = pd.weapons.bySubtype[item.subtype] || 'martial'; row = A.weapons?.[item.subtype]; }
  else if (item.isMagicShield) { prof = pd.shields.magic.prof; row = A.shields?.magic; }
  else if (item.isShield || item.baseKey === 'quiver') { prof = (pd.shields[item.baseKey] || pd.shields.shield).prof; row = A.shields?.[item.baseKey] || A.shields?.shield; }
  else if (item.type === 'armor') { prof = pd.tierOf[baseOf(rules, item)?.tier] || 'cloth'; row = A.armour?.[prof]; }
  const attr = attrNeed(rules, item, row);
  if (!prof && !attr && level <= 1) return null;
  return { prof, attr, str: attr?.stats.length === 1 && attr.stat === 'str' ? attr.value : 0, level, label: prof ? pd.names[prof] : 'It' };
}

export const profAffix = (rules, id) => P(rules).affixes.find(a => a.id === id) || null;
/** Put a proficiency enchantment on an item (loot.js rolls these). */
export function addProfAffix(item, def) {
  item.affixes = [...(item.affixes || []), { id: def.id, name: def.name, stat: 'proficiency', grants: def.grants, value: 1, oathwild: true }];
  return item;
}

/** Every proficiency the character has, and where it comes from. */
export function profSources(rules, char, { item = null, slot = null } = {}) {
  const out = {};
  const add = (p, s) => (out[p] = out[p] || []).push(s);
  for (const p of P(rules).always) add(p, 'Everyone');
  for (const cls of Object.keys(char.classLevels || {})) if (rules.data.classes.classes[cls]?.dualWield) add('dualWield', `${rules.data.classes.classes[cls].name}`);
  for (const [p, ss] of Object.entries(classProfs(rules, char))) ss.forEach(s => add(p, s));
  for (const [p, ss] of Object.entries(talentProfs(rules, char))) ss.forEach(s => add(p, s));
  for (const [s, worn] of Object.entries(char.gear || {})) {
    if (!worn || s === slot) continue;
    for (const a of worn.affixes || []) if (a.stat === 'proficiency') add(a.grants, `${worn.name}`);
  }
  for (const a of item?.affixes || []) if (a.stat === 'proficiency') add(a.grants, `its own enchantment (${a.name})`);
  return out;
}

/** May `char` put `item` on (in `slot`)? `why` names exactly what is missing. */
export function canWear(rules, char, item, { slot = null } = {}) {
  const need = itemNeeds(rules, item);
  if (!need) return { ok: true, why: null, need: null };
  const src = profSources(rules, char, { item, slot });
  // attributes without the item being replaced (its own bonus cannot pay for its successor)
  const bare = slot && char.gear?.[slot] && char.gear[slot] !== item ? { ...char, gear: { ...char.gear, [slot]: undefined } } : char;
  const have = attrTotals(rules, bare);
  const missing = [];
  // a weapon in the off hand: one-handed, and only for classes that may dual-wield (or the talent)
  if (slot === 'offhand' && item.type === 'weapon' && item.weaponCategory !== 'magic') {
    if (item.twoHanded) return { ok: false, why: `${item.name} is two-handed — it cannot go in the off hand.`, need };
    if (!src.dualWield) return { ok: false, why: `${item.name}: holding a weapon in each hand needs a class that fights with two (Rogue, Ranger, Warrior, Duelist…) or the Two-Weapon Fighting talent.`, need };
  }
  if (need.prof && !src[need.prof]) missing.push(trainingText(rules, need.prof));
  if (need.attr && attrHave(need.attr, have) < need.attr.value) missing.push(`${need.attr.value} ${need.attr.name} (you have ${attrHave(need.attr, have)})`);
  if ((char.level || 1) < need.level) missing.push(`level ${need.level} (you are ${char.level || 1})`);
  if (!missing.length) return { ok: true, why: null, need, from: src[need.prof] };
  return { ok: false, why: `${item.name}: ${need.label} needs ${missing.join(' and ')}.`, need };
}
export const canWield = canWear;

/** Where a proficiency can come from, in a phrase ("the Paladin's Plate Training, the Plate Training talent or an item of the Bulwark"). */
export function trainingText(rules, prof) {
  const ways = [];
  for (const [cls, def] of Object.entries(rules.data.classes.classes)) {
    if (def.round > 1) continue;
    const n = def.nodes.find(x => x.kind === 'prof' && x.grants.includes(prof));
    if (n && ways.length < 2) ways.push(`the ${def.name}'s ${n.name}`);
  }
  const t = Object.values(rules.data.talents.talents).find(x => x.grants?.prof?.includes(prof));
  if (t) ways.push(`the ${t.name} talent`);
  const a = P(rules).affixes.find(x => x.grants === prof);
  if (a) ways.push(`an item ${a.name}`);
  return ways.length ? `training (${ways.slice(0, -1).join(', ')}${ways.length > 1 ? ' or ' : ''}${ways[ways.length - 1]})` : 'training';
}
