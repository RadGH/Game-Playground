// Filling an area with monsters at the start of every game session (ruling 25: fresh each session). Pure.
// An area lists spawn spots: { x, z, level, pack: [defId...] } or { x, z, level, table: '<spawnTable id>' }.
// With no bestiary loaded (unit tests, or before data/monsters.json exists) a small built-in set stands in.
import { makeFoe } from './actors.js';
import { monsterDef } from './content.js';

export const FALLBACK = {
  test_raider: monsterDef('test_raider', { name: 'Hill Raider', role: 'brute', levelRange: [1, 3], size: 1.3, hp: 1, damage: 1, speed: 3.4 }),
  test_slinger: monsterDef('test_slinger', { name: 'Raider Slinger', role: 'archer', levelRange: [1, 3], size: 1.2, hp: 0.7, damage: 0.8, attackRange: 14, speed: 3.6 }),
  test_hexer: monsterDef('test_hexer', { name: 'Raider Hexer', role: 'caster', levelRange: [2, 4], size: 1.3, hp: 0.8, damage: 0.9, attackRange: 12, damageType: 'fire',
    abilities: [{ id: 'cinder', name: 'Cinder Bolt', castTime: 2, cooldown: 9, interruptible: true, damageMult: 2.4, damageType: 'fire' }] }),
};
const defOf = (w, id) => w.content.monsters?.[id] || FALLBACK[id] || null;

export function spawnArea(w) {
  let packN = 0;
  for (const sp of w.area.spawns || []) {
    const ids = sp.pack || pickPack(w, sp);
    const pack = 'k' + (++packN);
    ids.forEach((id, i) => {
      const def = defOf(w, id); if (!def) return;
      const a = (i / ids.length) * Math.PI * 2, r = ids.length > 1 ? 1.4 : 0;
      makeFoe(w, def, sp.level || def.levelRange[0], sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r, { pack, rank: sp.rank || 'normal' });
    });
  }
}
/** A pack from the bestiary's spawn table for this area, or the stand-ins. */
function pickPack(w, sp) {
  const table = w.content.spawnTables?.[sp.table || w.area.id];
  const rows = Array.isArray(table) ? table : table?.packs || null;
  if (rows && rows.length) {
    const tot = rows.reduce((s, r) => s + (+r.weight || 1), 0); let k = w.rng() * tot;
    for (const r of rows) { k -= (+r.weight || 1); if (k <= 0) { const m = r.monsters || r.pack || r.members; if (Array.isArray(m)) return m.flatMap(x => typeof x === 'string' ? [x] : Array(+x.count || 1).fill(x.id || x.monster)); } }
  }
  const n = 2 + Math.floor(w.rng() * 3), out = [];
  for (let i = 0; i < n; i++) out.push(i === 0 && sp.level >= 2 && w.rng() < 0.5 ? 'test_hexer' : w.rng() < 0.3 ? 'test_slinger' : 'test_raider');
  return out;
}
