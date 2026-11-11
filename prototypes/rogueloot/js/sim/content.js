// Game content the sim reads: monsters, skills, item bases. The sim is pure, so content is LOADED outside it and handed
// to createWorld({ content }). One loader for both sides:
//   server / node:  loadContent(p => JSON.parse(fs.readFileSync(new URL('../../data/' + p, import.meta.url))))
//   browser/worker: await loadContentAsync(p => fetch(new URL('../../data/' + p, import.meta.url)).then(r => r.json()))
// Every raw row goes through one normaliser here, so a field renamed in the data is fixed in ONE place.
import { monsterBaseline } from '../rules/combat.js';

export const FILES = ['monsters.json', 'skills.json', 'item-bases.json'];

export function buildContent(raw) {
  const monsters = {};
  const src = raw['monsters.json']?.monsters || {};
  for (const [id, m] of Object.entries(src)) monsters[id] = monsterDef(id, m);
  for (const [id, m] of Object.entries(raw['monsters.json']?.bosses || {})) monsters[id] = monsterDef(id, { ...m, boss: true });
  const skills = {};
  for (const [id, s] of Object.entries(raw['skills.json']?.skills || {})) skills[id] = { id, ...s };
  const bases = {};
  for (const b of raw['item-bases.json']?.bases || []) bases[b.id] = b;
  return { monsters, skills, bases, spawnTables: raw['monsters.json']?.spawnTables || {}, champions: raw['monsters.json']?.champions || {} };
}
export function loadContent(readJson) { const raw = {}; for (const f of FILES) { try { raw[f] = readJson(f); } catch { raw[f] = null; } } return buildContent(raw); }
export async function loadContentAsync(readJson) { const raw = {}; await Promise.all(FILES.map(async f => { try { raw[f] = await readJson(f); } catch { raw[f] = null; } })); return buildContent(raw); }

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
    resists: m.resists || stats.resists || {},
    speed: num(m.speed ?? m.moveSpeed, 3.6),
    attackRange: num(m.attackRange ?? m.range, 1.6),
    attackSpeed: num(m.attackSpeed, 0.5),
    damageType: m.damageType || 'physical',
    abilities: Array.isArray(m.abilities) ? m.abilities : [],
    xp: num(m.xp ?? m.xpMult, 1),
    ai: m.ai || {}, look: m.look || {}, raw: m,
  };
}
/** The level-L numbers of a monster def (plus champion / player-count multipliers). */
export function monsterStats(def, level, { hpMult = 1, dmgMult = 1 } = {}) {
  const b = monsterBaseline(level);
  return { maxHp: Math.round(b.hp * def.hp * hpMult), dmg: +(b.dmg * def.dmg * dmgMult).toFixed(1), armour: Math.round(b.armour * def.armour), attackSpeed: def.attackSpeed || b.attackSpeed };
}
