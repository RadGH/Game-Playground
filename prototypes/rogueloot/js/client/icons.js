// One icon style for the whole game (owner 2026-11-11: "a lot of icons look like emoji (Chest) and others look like
// flat white icons (Attack, Sure Strike, Field Mend) which lack cohesion. See how icons were built in Thousandvale and
// mimic that"). Every picture here comes from the playground's Codex-drawn icon library (`icons/`): the 192 class spell
// medallions for skills, and the game-icon set for buttons, potions, materials and goods. Gear icons are rendered from
// the worn 3D model (the same rule Thousandvale follows) — `gearIconFor` is the hook the character code fills in.
//
//   skillIcon(skill, content, size)   -> SVG string, a medallion picked for what the skill DOES from its class's set
//   uiIcon(id, size)                  -> SVG string (attack, bag, map, skills, sheet, close, menu, …)
//   itemIcon(item, data, size)        -> SVG string / <img> for potions, currency, materials; null for gear (3D icons)
import { icons, iconSvg } from '../../../../icons/js/catalog.js';
import { uiIconSvg, itemIconSvg } from '../../../../icons/js/game-icons.js';

const PATH_CLASS = { fighter: 'fighter', rogue: 'rogue', mage: 'mage', healer: 'cleric', wanderer: 'warrior' };
const ELEMENT = { fire: 'fire', frost: 'ice', storm: 'lightning', poison: 'poison', shadow: 'shadow', holy: 'holy', arcane: 'arcane', physical: 'physical' };
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const byClass = new Map(); for (const i of icons) (byClass.get(i.classId) || byClass.set(i.classId, []).get(i.classId)).push(i);

/** What a skill does, as icon-library categories (pure — exported for tests). */
export function skillTags(sk) {
  const tags = new Set(), all = [];
  const walk = es => { for (const e of es || []) { all.push(e); walk(e.effects); } }; walk(sk?.effects);
  for (const e of all) {
    if (e.type && ELEMENT[e.type]) tags.add(ELEMENT[e.type]);
    switch (e.do) {
      case 'heal': case 'hot': tags.add('healing'); break;
      case 'shield': case 'shieldPct': tags.add('shield'); tags.add('defense'); break;
      case 'summon': tags.add('summon'); break;
      case 'bolt': tags.add('bolt'); tags.add('projectile'); break;
      case 'weapon': tags.add('weapon'); tags.add('melee'); tags.add('physical'); break;
      case 'dash': tags.add('dash'); tags.add('movement'); break;
      case 'taunt': tags.add('taunt'); break;
      case 'mark': tags.add('mark'); break;
      case 'stance': tags.add('stance'); tags.add('self'); break;
      case 'revive': tags.add('revive'); break;
      case 'link': tags.add('link'); break;
      case 'coat': tags.add('poison'); tags.add('weapon'); break;
      case 'zone': tags.add('ground'); tags.add('zone'); break;
      case 'buff': tags.add('buff'); tags.add('self'); break;
      case 'debuff': tags.add('control'); if (e.kind === 'sleep') tags.add('sleep'); if (e.kind === 'charm') tags.add('charm'); if (e.kind === 'slow') tags.add('slow'); break;
      case 'pull': tags.add('pull'); break;
      case 'area': tags.add('area'); tags.add(e.at === 'ground' ? 'ground' : 'around'); break;
      case 'dot': tags.add(e.type === 'physical' ? 'bleed' : (ELEMENT[e.type] || 'poison')); break;
    }
  }
  if (sk?.autoAttack) { tags.add('weapon'); tags.add('precision'); }
  return tags;
}
/** The library icon id for a skill (pure — exported for tests): its class's medallion that shares the most of what the
 *  skill does (element counts double); siblings that tie are spread over the set by their own id, so a tree doesn't
 *  repeat one picture. Falls back to every class when the skill's own set has nothing that fits. */
export function skillIconId(sk, content) {
  if (!sk) return null;
  const owner = sk.owner, cls = content?.specs?.[owner]?.tvClass || PATH_CLASS[owner] || 'warrior';
  const tags = skillTags(sk), el = [...tags].find(t => Object.values(ELEMENT).includes(t) && t !== 'physical');
  const score = i => i.categories.reduce((s, c) => s + (tags.has(c) ? (c === el ? 3 : 1) : 0), 0);
  const pick = list => { let best = -1, out = []; for (const i of list) { const s = score(i); if (s > best) { best = s; out = [i]; } else if (s === best) out.push(i); } return { best, out }; };
  let { best, out } = pick(byClass.get(cls) || []);
  if (best < 2) { const wide = pick(icons); if (wide.best > best + 1) ({ best, out } = wide); }
  return out.length ? out[hash(sk.id || sk.name) % out.length].id : null;
}
export function skillIcon(sk, content, size = 40) {
  if (!sk) return '';
  if (sk.id === 'attack' || sk.kind === 'auto') return uiIconSvg('attack', size) || '';
  const id = skillIconId(sk, content);
  return (id && iconSvg(id, size)) || uiIconSvg('skills', size) || '';
}
/** A talent's picture (owner 2026-11-13 talent trees): what the skills it changes DO, plus what it changes (healing,
 *  armour, speed…), picked from the whole library so a tree of 18 talents doesn't repeat one class's six medallions.
 *  Ties are spread by the talent's own id. Pure apart from the SVG lookup. */
const STAT_TAGS = { heal: ['healing'], duration: ['buff'], radius: ['area', 'around'], cost: ['buff'], cooldown: ['buff', 'movement'], cast: ['buff'], crit: ['precision'],
  maxHp: ['defense', 'shield'], armourPct: ['defense', 'shield'], blockChance: ['shield', 'defense'], dodge: ['movement', 'dash'], moveSpeed: ['movement', 'dash'], resistAll: ['defense', 'shield'],
  manaRegen: ['arcane', 'buff'], maxMana: ['arcane'], spellPower: ['arcane'], castSpeed: ['arcane', 'buff'], meleePower: ['weapon', 'melee'], attackSpeed: ['weapon', 'melee'], rangedPower: ['projectile', 'precision'],
  healPower: ['healing'], hpRegen: ['healing'], lifeOnHit: ['healing', 'weapon'], critDamage: ['precision'], threat: ['taunt'], rageGen: ['weapon', 'buff'], energyRegen: ['movement', 'buff'] };
export function talentIconId(t, content) {
  if (!t) return null;
  const S = content?.skills || {}, tags = new Set(), els = new Set();
  for (const m of t.mods || []) {
    const to = m.to || {}, ids = to.skill ? [to.skill] : to.skills || [];
    for (const id of ids) for (const g of skillTags(S[id])) tags.add(g);
    if (to.type) { const e = ELEMENT[to.type] || (to.type === 'heal' ? 'healing' : null); if (e) { tags.add(e); els.add(e); } }
    for (const g of STAT_TAGS[m.stat] || []) tags.add(g);
  }
  if (t.synergy?.skill) for (const g of skillTags(S[t.synergy.skill])) tags.add(g);
  for (const g of STAT_TAGS[t.passive?.stat] || []) tags.add(g);
  for (const g of tags) if (Object.values(ELEMENT).includes(g) && g !== 'physical') els.add(g);
  if (!tags.size) return skillIconId(t, content);
  const score = i => i.categories.reduce((s, c) => s + (tags.has(c) ? (els.has(c) ? 3 : 1) : 0), 0);
  let best = -1, out = []; for (const i of icons) { const s = score(i); if (s > best) { best = s; out = [i]; } else if (s === best) out.push(i); }
  // keep it near the class's own look: prefer the owner's set when it scores within one of the best
  const cls = content?.specs?.[t.owner]?.tvClass || PATH_CLASS[t.owner];
  const near = out.length > 1 ? out : icons.filter(i => score(i) >= best - 1);
  const own = near.filter(i => i.classId === cls);
  const pool = own.length && own.length >= 3 ? own : near;
  return pool.length ? pool[hash(t.id || t.name) % pool.length].id : null;
}
export function talentIcon(t, content, size = 40) { const id = talentIconId(t, content); return (id && iconSvg(id, size)) || skillIcon(t, content, size); }
export function uiIcon(id, size = 24) { return uiIconSvg(id, size) || ''; }

/** Potions, currency shards, dust and other non-gear things: drawn SVG art. Gear returns null (3D icons). */
const KIND_ART = { health: 'healing_potion', mana: 'mana_potion', rejuvenation: 'group_tonic' };
export function itemArtKeyFor(item, data) {
  if (!item) return null;
  if (item.base === 'potion') return KIND_ART[item.kind] || 'healing_potion';
  if (item.base === 'dust' || item.kind === 'dust') return 'silver_dust';
  if (item.shard || item.base === 'shard' || data?.currency?.shards?.[item.base]) return 'recall_charm';
  if (item.base === 'key' || item.kind === 'key') return 'key';
  if (item.quest) return 'quest_item';
  return null;
}
export function itemIcon(item, data, size = 48) { const k = itemArtKeyFor(item, data); return k ? itemIconSvg(k, size) : null; }
