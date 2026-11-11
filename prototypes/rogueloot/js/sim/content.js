// Game content the sim reads: monsters, skills, item bases. The sim is pure, so content is LOADED outside it and handed
// to createWorld({ content }). One loader for both sides:
//   server / node:  loadContent(p => JSON.parse(fs.readFileSync(new URL('../../data/' + p, import.meta.url))))
//   browser/worker: await loadContentAsync(p => fetch(new URL('../../data/' + p, import.meta.url)).then(r => r.json()))
// Every raw row goes through one normaliser here, so a field renamed in the data is fixed in ONE place.
import { monsterBaseline } from '../rules/combat.js';
import { itemData } from '../rules/items.js';

export const FILES = ['monsters.json', 'skills.json', 'skills-paths.json', 'item-bases.json', 'balance.json', 'affixes.json', 'rarity.json', 'uniques.json', 'legendaries.json', 'potions.json', 'acts.json', 'currency.json', 'mercenaries.json', 'specs.json', 'skills-specs-index.json'];

export function buildContent(raw) {
  const monsters = {};
  const src = raw['monsters.json']?.monsters || {};
  for (const [id, m] of Object.entries(src)) if (!id.startsWith('_')) monsters[id] = monsterDef(id, m);
  for (const [id, m] of Object.entries(raw['monsters.json']?.bosses || {})) if (!id.startsWith('_')) monsters[id] = monsterDef(id, { ...m, boss: true });
  const skills = {};
  for (const [id, s] of Object.entries(raw['skills.json']?.skills || {})) skills[id] = { id, ...s };
  // the Path skills (and the Wanderer's, rewritten in the same vocabulary) win over the M4 file
  for (const [id, s] of Object.entries(raw['skills-paths.json']?.skills || {})) skills[id] = { id, ...s };
  for (const f of raw['skills-specs-index.json']?.files || []) for (const [id, s] of Object.entries(raw[f]?.skills || {})) skills[id] = { id, ...s };
  const bases = {};
  for (const b of raw['item-bases.json']?.bases || []) bases[b.id] = b;
  const mj = raw['monsters.json'] || {};
  const specs = raw['specs.json']?.specs || {};
  const items = itemData({ bases: raw['item-bases.json'], affixes: raw['affixes.json'], rarity: raw['rarity.json'], uniques: raw['uniques.json'], legendaries: raw['legendaries.json'] });
  // a spec's armour and weapons join its Path's at level 10 (rules/items.js profOf reads proficiency[spec])
  for (const [id, sp] of Object.entries(specs)) items.proficiency[id] = { armour: sp.armour || [], weapons: sp.weapons || [], offhand: sp.offhand || [] };
  return { specs, mercs: raw['mercenaries.json'] || null, currency: raw['currency.json'] || null, acts: raw['acts.json']?.acts || [], paths: raw['skills-paths.json']?.paths || {}, resources: raw['skills-paths.json']?.resources || {}, potions: raw['potions.json'] || { stack: 4, sizes: {} }, items, balance: raw['balance.json'] || {}, monsters, skills, bases, spawnTables: mj.spawnTables || {}, champions: mj.champions || {}, rares: mj.rares || {}, families: mj.families || {}, baseline: baselineFrom(mj.baseline) };
}

/** The bestiary's per-level baseline: formulas in L ("48 + 26*L + 1.4*L*L") compiled once, safely (digits, L, + - * / ( ) . only). */
export function formula(src, fallback) {
  if (typeof src === 'number') return () => src;
  const t = String(src ?? '');
  if (!/^[\dL+\-*/(). ]+$/.test(t) || !t.trim()) return fallback;
  try { const f = new Function('L', `return (${t});`); f(1); return L => +f(L); } catch { return fallback; }
}
export function baselineFrom(b) {
  const fb = monsterBaseline;
  if (!b) return null;
  return {
    hp: formula(b.hp, L => fb(L).hp), damage: formula(b.damage, L => fb(L).dmg), armour: formula(b.armour, L => fb(L).armour), xp: formula(b.xp, L => 10 + 5 * L),
    attackSpeed: +b.attackSpeed || 2, playersScaling: b.playersScaling || { hp: [1, 1.75, 2.5, 3.2], damage: [1, 1.1, 1.2, 1.3], drops: [1, 1.4, 1.8, 2.2] },
  };
}
export function loadContent(readJson) {
  const raw = {}; for (const f of FILES) { try { raw[f] = readJson(f); } catch { raw[f] = null; } }
  for (const f of raw['skills-specs-index.json']?.files || []) { try { raw[f] = readJson(f); } catch { raw[f] = null; } }
  const c = buildContent(raw); c.zones = {};
  try { for (const id of readJson('zones/index.json').zones) c.zones[id] = readJson(`zones/${id}.json`); } catch { /* no zones yet */ }
  return c;
}
export async function loadContentAsync(readJson) {
  const raw = {}; await Promise.all(FILES.map(async f => { try { raw[f] = await readJson(f); } catch { raw[f] = null; } }));
  await Promise.all((raw['skills-specs-index.json']?.files || []).map(async f => { try { raw[f] = await readJson(f); } catch { raw[f] = null; } }));
  const c = buildContent(raw); c.zones = {};
  try { const idx = await readJson('zones/index.json'); await Promise.all(idx.zones.map(async id => { c.zones[id] = await readJson(`zones/${id}.json`); })); } catch { /* no zones yet */ }
  return c;
}

const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const pickNum = (...vs) => { for (const v of vs) if (Number.isFinite(+v) && v !== null && v !== '') return +v; return undefined; };
/** One monster row -> the shape the sim reads. Multipliers are relative to monsterBaseline(level). */
export function monsterDef(id, m) {
  const lr = Array.isArray(m.levelRange) ? m.levelRange : Array.isArray(m.levels) ? m.levels : [num(m.level, 1), num(m.level, 1)];
  const stats = m.stats || {};
  return {
    id, name: m.name || id, family: m.family || 'beast', role: m.role || 'brute', boss: !!m.boss,
    levelRange: [num(lr[0], 1), num(lr[1] ?? lr[0], 1)],
    size: num(m.size ?? m.height, 1.4),
    radius: num(m.radius, Math.max(0.35, num(m.size ?? m.height, 1.4) * 0.3)),
    hp: num(pickNum(m.hp, m.hpMult, stats.hp), 1),
    dmg: num(pickNum(m.damage, m.dmg, m.damageMult, stats.damage), 1),
    armour: num(pickNum(m.armour, m.armor, m.armourMult, stats.armour), 1),
    // the bestiary writes resists as fractions (0.5 = half); the combat rules read whole points (50)
    resists: Object.fromEntries(Object.entries(m.resists || stats.resists || {}).map(([k, v]) => [k, Math.abs(+v) <= 1.5 ? Math.round(+v * 100) : +v])),
    speed: num(m.speed ?? m.moveSpeed, 3.6),
    attackRange: num(m.attackRange ?? m.range, 1.6),
    attackSecs: num(m.attackSpeed, 2),          // bestiary: seconds between hits
    damageType: m.damageType || 'physical',
    abilities: Array.isArray(m.abilities) ? m.abilities : [],
    xp: num(m.xp ?? m.xpMult, 1), packSize: m.packSize || [1, 1],
    ai: m.ai || {}, look: m.look || {}, raw: m,
  };
}
/** The level-L numbers of a monster def (plus champion / player-count multipliers). `base` = content.baseline (the
 *  bestiary's formulas) when loaded, else rules/combat.js monsterBaseline. attackSpeed in the bestiary is SECONDS per
 *  hit; the sim keeps hits per second, so it is turned over here. */
export function monsterStats(def, level, { hpMult = 1, dmgMult = 1, base = null, balance = null } = {}) {
  const b = base ? { hp: base.hp(level), dmg: base.damage(level), armour: base.armour(level) } : monsterBaseline(level);
  const m = balance?.monster, e = m?.early, ease = e && level < e.untilLevel ? e.from + (1 - e.from) * (level - 1) / Math.max(1, e.untilLevel - 1) : 1;
  hpMult *= (m?.hp ?? 1) * ease; dmgMult *= (m?.damage ?? 1) * ease;
  const secs = def.attackSecs || base?.attackSpeed || 2;
  return { maxHp: Math.max(1, Math.round(b.hp * def.hp * hpMult)), dmg: +(b.dmg * def.dmg * dmgMult).toFixed(1), armour: Math.round(b.armour * def.armour), attackSpeed: 1 / secs };
}

import { isPotion, checkPotion } from '../rules/potions.js';
import { isCurrency, checkCurrency } from '../rules/crafting.js';
import { checkItem } from '../rules/items.js';
/** The server's light check for anything a hero carries (ruling 8): items and potions. */
export const checkAny = (content, it) => isPotion(it) ? checkPotion(content.potions, it) : isCurrency(it) ? checkCurrency(content.currency, it) : checkItem(content.items, it);
