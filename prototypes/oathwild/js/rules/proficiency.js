// Oathwild — may this character wear / wield this item? Pure. The ONE reader of data/proficiency.json.
//
//   itemNeeds(rules, item)                     { prof, str, label } | null (rings and amulets need nothing)
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

/** What an item needs: a proficiency and a Strength score. */
export function itemNeeds(rules, item) {
  if (!item) return null;
  const pd = P(rules);
  if (item.type === 'weapon') {
    const prof = pd.weapons.bySubtype[item.subtype] || 'martial';
    const str = item.twoHanded ? (pd.weapons.twoHandedStr[item.weaponCategory] || 0) : 0;
    return { prof, str, label: pd.names[prof] };
  }
  if (item.isMagicShield) return { prof: pd.shields.magic.prof, str: 0, label: pd.names[pd.shields.magic.prof] };
  if (item.isShield || item.baseKey === 'quiver') {
    const row = pd.shields[item.baseKey] || pd.shields.shield;
    return { prof: row.prof, str: row.str, label: pd.names[row.prof] };
  }
  if (item.type === 'armor') {
    const tier = pd.tierOf[baseOf(rules, item)?.tier] || 'cloth';
    return { prof: tier, str: pd.armour[tier].str, label: pd.names[tier] };
  }
  return null;
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
  const str = attrTotals(rules, char).str;
  const missing = [];
  // a weapon in the off hand: one-handed, and only for classes that may dual-wield (or the talent)
  if (slot === 'offhand' && item.type === 'weapon' && item.weaponCategory !== 'magic') {
    if (item.twoHanded) return { ok: false, why: `${item.name} is two-handed — it cannot go in the off hand.`, need };
    if (!src.dualWield) return { ok: false, why: `${item.name}: holding a weapon in each hand needs a class that fights with two (Rogue, Ranger, Warrior, Duelist…) or the Two-Weapon Fighting talent.`, need };
  }
  if (!src[need.prof]) missing.push(trainingText(rules, need.prof));
  if (str < need.str) missing.push(`${need.str} Strength (you have ${str})`);
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
