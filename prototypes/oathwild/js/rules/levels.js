// Oathwild — the character record, XP and levelling up. Pure. The ONE reader of data/levels.json.
//
// Character record (ARCH.md "Character record"; saved on the player's side, travels into any world):
//   { id, name, look, background, version, level, xp,
//     classLevels { cls: n }, classOrder [cls], attributes { str… } (point buy), attrSpent { str: n },
//     nodes { 'cls/node': rank }, paths { cls: pathId }, talents { id: rank }, skills { id: { v, xp } },
//     bar [spellId], gear { slot: item }, bag [item], gold, enchant { known: [affixId] }, shrine, horse,
//     boosted { cls: true } (class use-skill head starts already given) }
//
//   createCharacter(rules, opts, rng)        → { ok, why, char }
//   xpToReach(rules, level) / levelForXp(rules, xp) / addXp(rules, char, n)
//   killXp(rules, { monsterXp, monsterLevel, playerLevel, helpers })
//   levelRefusal(rules, char, cls, ctx)      null or why the next level cannot go into `cls`
//   levelUp(rules, char, { cls, path, spend, attr, flags })   → { ok, why, gained }
//   pendingLevels(rules, char)               levels earned but not yet put into a class
//   respecPrice(rules, char, kind) / respec(rules, char, kind)   'points' | 'full'

import { pointBuyRefusal } from './attributes.js';
import { classDef, classRefusal, grantFree, buyNode, classRules, totalLevel, refundPoints } from './classes.js';
import { ensureSkills, boostSkill } from './skills-use.js';
import { refundTalents } from './talents.js';
import { attrTotals } from './sheet.js';
import { spendAttrPoint } from './attributes.js';
import { finishCaster } from './casters.js';

const L = rules => rules.data.levels;
export const levelCap = rules => L(rules).cap;
export const CHARACTER_VERSION = 1;

export function xpToReach(rules, level) {
  const t = L(rules).xpToReach;
  return t[Math.max(0, Math.min(t.length - 1, level - 1))];
}
export function levelForXp(rules, xp) {
  const t = L(rules).xpToReach;
  let lvl = 1;
  for (let i = 0; i < t.length; i++) if (xp >= t[i]) lvl = i + 1;
  return Math.min(lvl, levelCap(rules));
}

/** Levels the XP has earned that have not been put into a class yet (also after a full respec). */
export function pendingLevels(rules, char) {
  return Math.max(0, levelForXp(rules, char.xp || 0) - totalLevel(char));
}

/** Add XP (capped at what the level cap needs). Returns { added, ready } — ready = levels waiting for a class pick. */
export function addXp(rules, char, n) {
  const cap = xpToReach(rules, levelCap(rules));
  const before = char.xp || 0;
  char.xp = Math.min(cap, before + Math.max(0, Math.round(n)));
  return { added: char.xp - before, ready: pendingLevels(rules, char) };
}

/** XP one player gets for a kill. */
export function killXp(rules, { monsterXp, monsterLevel, playerLevel, helpers = 1 }) {
  const g = L(rules).levelGap;
  const gap = monsterLevel - playerLevel;
  if (gap <= -g.greyBelow) return 0;
  const k = Math.max(g.min, Math.min(g.max, 1 + gap * g.perLevel));
  const share = Math.max(L(rules).groupShare.floor, 1 - L(rules).groupShare.minus * (helpers - 1));
  return Math.max(1, Math.round(monsterXp * L(rules).killXpMult * k * share));
}

// ---------------------------------------------------------------- creating a character

/** The empty record (every field present, so saves round-trip). */
export function blankCharacter() {
  return {
    id: null, name: '', look: null, background: null, version: CHARACTER_VERSION,
    level: 1, xp: 0, classLevels: {}, classOrder: [], attributes: {}, attrSpent: {},
    nodes: {}, paths: {}, talents: {}, skills: {}, bar: [], gear: {}, bag: [], gold: 0,
    enchant: { known: [] }, shrine: null, horse: false, boosted: {},
  };
}

/**
 * A new level-1 character: point-buy attributes, a background, and the first class (must be a base
 * class). `rng` rolls the starter kit (normal items, item level 1).
 */
export function createCharacter(rules, { id = 'hero', name = 'Hero', look = null, background = 'farmhand', attributes, cls }, rng) {
  const bgs = rules.data.backgrounds.backgrounds;
  if (!bgs[background]) return { ok: false, why: 'Choose a background.' };
  const why = pointBuyRefusal(rules, attributes || {});
  if (why) return { ok: false, why };
  const def = classDef(rules, cls);
  if (!def) return { ok: false, why: 'Choose a class.' };
  if (!def.open) return { ok: false, why: `${def.name} has to be unlocked in play; start with one of the base classes.` };
  const char = blankCharacter();
  Object.assign(char, { id, name, look, background, attributes: { ...attributes }, gold: bgs[background].gold || 0 });
  ensureSkills(rules, char);
  for (const [k, v] of Object.entries(bgs[background].skills || {})) boostSkill(rules, char, k, v);
  takeClassLevel(rules, char, cls);
  for (const baseKey of def.starter || []) {
    const item = rules.rpg.loot.generate(baseKey, 'normal', 'medium', { rng, ilvl: 1, level: 1, raw: true });
    if (!item) continue;
    finishCaster(rules, item, { starter: true });     // a first wand / staff / tome has a known, readable style
    const slot = item.type === 'weapon' ? (char.gear.weapon ? 'offhand' : 'weapon') : item.slot;
    if (!char.gear[slot]) char.gear[slot] = item; else char.bag.push(item);
  }
  return { ok: true, why: null, char };
}

/** +1 in a class: first time adds it to classOrder and gives the class's use-skill head start. */
function takeClassLevel(rules, char, cls) {
  const first = !char.classLevels[cls];
  char.classLevels[cls] = (char.classLevels[cls] || 0) + 1;
  if (first) {
    char.classOrder.push(cls);
    // the head start is given once per class for the life of the character (a full respec does not repeat it)
    char.boosted = char.boosted || {};
    if (!char.boosted[cls]) {
      char.boosted[cls] = true;
      for (const [k, v] of Object.entries(classDef(rules, cls).skills || {})) boostSkill(rules, char, k, v);
    }
  }
  char.level = Math.max(char.level, totalLevel(char));
  grantFree(rules, char, cls);
}

// ---------------------------------------------------------------- level up

/** Why the next level cannot go into `cls` (or null). ctx.flags = world flags the player has found. */
export function levelRefusal(rules, char, cls, { flags = [] } = {}) {
  if (totalLevel(char) >= levelCap(rules)) return `Level ${levelCap(rules)} is as high as anyone can go for now.`;
  if (pendingLevels(rules, char) <= 0) {
    const need = xpToReach(rules, totalLevel(char) + 1);
    return `You need ${need} experience for level ${totalLevel(char) + 1} (you have ${char.xp || 0}).`;
  }
  return classRefusal(rules, char, cls, { flags, attrs: attrTotals(rules, char) });
}

/**
 * Put the next level into `cls`. Options, all validated, applied in this order and rolled back if
 * any fails: `spend` (node ids of that class to buy, in order), `attr` (spend an attribute point,
 * on even levels). (Classes have no paths since 2026-11-26.)
 */
export function levelUp(rules, char, { cls, spend = [], attr = null, flags = [] } = {}) {
  const why = levelRefusal(rules, char, cls, { flags });
  if (why) return { ok: false, why };
  const backup = structuredClone(char);
  const undo = (reason) => { for (const k of Object.keys(char)) delete char[k]; Object.assign(char, backup); return { ok: false, why: reason }; };
  takeClassLevel(rules, char, cls);
  for (const nodeId of spend) {
    const r = buyNode(rules, char, cls, nodeId);
    if (!r.ok) return undo(r.why);
  }
  if (attr) {
    const r = spendAttrPoint(rules, char, attr);
    if (!r.ok) return undo(r.why);
  }
  const lvl = char.classLevels[cls];
  return {
    ok: true, why: null,
    gained: {
      cls, classLevel: lvl, level: char.level,
      points: classRules(rules).pointsPerLevel,
      attrPoint: char.level % rules.data.attributes.levelPoints.every === 0,
      talentPoint: rules.data.talents.pointLevels.includes(char.level),
    },
  };
}

// ---------------------------------------------------------------- respec at a shrine

export function respecPrice(rules, char, kind = 'points') {
  const r = L(rules).respec[kind];
  if (!r) return null;
  const lvl = char.level || 1;
  return Math.max(r.min, Math.round(r.perLevelSq * lvl * lvl));
}

/**
 * 'points': every class point and talent point back (class levels and attributes stay).
 * 'full': also class levels and level-up attribute points; the character then re-picks a class for
 * each level (pendingLevels) — the first class must again be a base class.
 */
export function respec(rules, char, kind = 'points') {
  const price = respecPrice(rules, char, kind);
  if (price == null) return { ok: false, why: 'There is no such respec.' };
  if ((char.gold || 0) < price) return { ok: false, why: `This costs ${price} gold at a shrine; you have ${char.gold || 0}.` };
  char.gold -= price;
  refundTalents(char);
  if (kind === 'full') {
    char.classLevels = {}; char.classOrder = []; char.attrSpent = {};
    char.nodes = {}; char.paths = {}; char.bar = [];
  } else {
    refundPoints(rules, char);
  }
  return { ok: true, why: null, price };
}
