// The character document: what a browser saves and what it hands to a room when it joins (ruling 1: characters live on
// the player's device). Pure. Version `v` lets later milestones migrate old saves forward.
//   newCharacter({ name, look, path, bar }) -> a fresh level-1 hero of that class (owner 2026-11-13: the class is picked at creation)
//   derived(ch) -> the numbers a fight reads (M4 adds gear on top)
import { ATTRS, START_ATTR, attrPointsFor, levelForXp, LEVEL_CAP } from './progression.js';

export const CHAR_VERSION = 1;
export const NAME_MAX = 20;
export const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'Hero';

/** The kit every new hero starts with (bases from data/item-bases.json): a short sword, a linen robe, a rope sash. */
export const STARTER_KIT = { weapon: 'footman_sword', chest: 'linen_robe', belt: 'rope_sash' };
/** Each class starts with a weapon it is allowed to hold (data/item-bases.json proficiency). */
export const STARTER_WEAPON = { fighter: 'footman_sword', rogue: 'skinning_knife', mage: 'willow_wand', healer: 'cudgel' };
export const starterKitFor = path => ({ ...STARTER_KIT, weapon: STARTER_WEAPON[path] || STARTER_KIT.weapon });
export function newCharacter({ name, look, id = null, now = Date.now(), kit = null, path = null, bar = null } = {}) {
  return {
    v: CHAR_VERSION, id: id || 'c' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    name: cleanName(name), look: look || null, created: now, played: 0,
    level: 1, xp: 0,
    attrs: Object.fromEntries(ATTRS.map(a => [a, START_ATTR])), unspent: 0, bonusAttr: 0,
    path, spec: null, tv: 2,
    skills: {}, skillPoints: 0, questPoints: 0, bar: bar || ['sure_strike', 'spark', 'field_mend', null, null, null],
    gold: 0, equip: kit || {}, bag: [], belt: [],
    quests: {}, waypoints: ['brightwater'], difficulty: 'normal',
  };
}

/** Spend attribute points. Returns the updated character, or an { err } (pure: the caller saves). */
export function spendAttr(ch, attr, n = 1) {
  if (!ATTRS.includes(attr) || !(n > 0) || ch.unspent < n) return { err: 'No points to spend.' };
  return { ...ch, attrs: { ...ch.attrs, [attr]: ch.attrs[attr] + n }, unspent: ch.unspent - n };
}
/** Add experience; hands out the level-up points. */
export function gainXp(ch, amount) {
  const xp = ch.xp + Math.max(0, Math.round(amount)), level = Math.min(LEVEL_CAP, levelForXp(xp));
  const ups = level - ch.level;
  return { ...ch, xp, level, unspent: ch.unspent + ups * 5, skillPoints: ch.skillPoints + ups, levelled: ups };
}

/** The numbers a fight reads, from attributes alone (gear comes on top in M6). */
export function derived(ch) {
  const a = ch.attrs, L = ch.level;
  return {
    maxHp: Math.round(70 + 18 * (L - 1) + 6 * (a.vit - START_ATTR) + (a.str - START_ATTR)),
    maxMana: Math.round(30 + 6 * L + 5 * (a.int - START_ATTR) + 2 * (a.spi - START_ATTR)),
    hpRegen: +(0.4 + 0.08 * L + 0.12 * (a.spi - START_ATTR)).toFixed(2),          // per second, slow (ruling 23)
    manaRegen: +(1 + 0.2 * L + 0.25 * (a.spi - START_ATTR) + 0.12 * (a.int - START_ATTR)).toFixed(2),
    meleePower: +(1 + 0.012 * (a.str - START_ATTR)).toFixed(3),                     // multipliers on weapon damage
    rangedPower: +(1 + 0.012 * (a.agi - START_ATTR)).toFixed(3),
    spellPower: +(1 + 0.012 * (a.int - START_ATTR)).toFixed(3),
    healPower: +(1 + 0.008 * (a.spi - START_ATTR) + 0.006 * (a.int - START_ATTR)).toFixed(3),
    crit: +(5 + 0.08 * (a.agi - START_ATTR)).toFixed(2),                             // whole percentage points
    dodge: +(3 + 0.06 * (a.agi - START_ATTR)).toFixed(2),
  };
}
