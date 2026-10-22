// Thousandvale's own monster looks, shown on the Creatures page (creatures.html, "Thousandvale monsters").
//
// Nothing is copied: the looks are read LIVE from Thousandvale's data files, and every body is built the way the game's
// client builds it (prototypes/thousandvale/js/client/actors.js `build()` + looks.js `loadMonsterLooks()`), so the
// gallery shows what the game shows.
//
//   data/monster-looks.json          { type: look }  (grove_wolf …)
//   data/rules/monsters-tv.json      { monsters: [{ id, name, desc, levels, boss?, look }] }  (the Vharlen island set)
//
// A look is `{ creature }` (an avatar-3d creature spec) or `{ avatar }` (a Chibi 2 humanoid, drawn as Chibi 2.5 through
// Thousandvale's own createTvBody). Same precedence as the game: monsters-tv.json wins over monster-looks.json.
//
//   const list = await loadTvMonsters()            -> [{ id, name, desc, levels, kind: 'creature'|'humanoid', look, boss, flying, source }]
//   const body = await buildTvMonster(entry)       -> the body (group, update, setAnim, metrics, dispose) + { liftY, idleAnim }
//
// Never throws on a missing file: an absent file simply adds nothing.

import { createCreature, normalizeCreature } from './creatures.js';
import { compactCreature } from './mesh-merge.js';
import { CHIBI2_ANIMS } from './chibi2-motion.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';

const TV = new URL('../../prototypes/thousandvale/', import.meta.url);
const getJson = async path => { try { const r = await fetch(new URL(path, TV)); return r.ok ? await r.json() : null; } catch { return null; } };
const titleOf = id => String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** In the game a boss is drawn bigger: actors.js rankScale('boss') = 1.45, and a boss builds at full detail (1, else 0.8). */
const BOSS_SCALE = 1.45;

let listP = null;
export function loadTvMonsters() {
  if (!listP) listP = (async () => {
    const out = new Map();
    const looks = await getJson('data/monster-looks.json');
    for (const [id, look] of Object.entries(looks || {})) if (look && typeof look === 'object' && !id.startsWith('_')) out.set(id, { id, name: titleOf(id), desc: '', levels: null, look, boss: false, flying: !!look.flying, source: 'data/monster-looks.json' });
    const tv = await getJson('data/rules/monsters-tv.json');
    for (const m of tv?.monsters || []) if (m?.look) out.set(m.id, { id: m.id, name: m.name || titleOf(m.id), desc: m.desc || '', levels: Array.isArray(m.levels) ? m.levels : null, look: m.flying ? { ...m.look, flying: true } : m.look, boss: !!m.boss, flying: !!m.flying, source: 'data/rules/monsters-tv.json' });
    return [...out.values()].map(e => ({ ...e, kind: e.look.avatar ? 'humanoid' : 'creature' }));
  })();
  return listP;
}

/** The creature spec the game builds for this look (actors.js: `{ ...look.creature, seed, size: (size || 1) * big }`). */
export function tvCreatureSpec(entry, seed = 1) {
  const c = entry?.look?.creature || { type: 'wolf' };
  const big = entry?.boss ? BOSS_SCALE : 1;
  return normalizeCreature({ ...c, seed, size: +((c.size || 1) * big).toFixed(3) });
}

let tvBody = null;      // Thousandvale's createTvBody (Chibi 2.5, sliced template bake); loaded on first use
export async function buildTvMonster(entry) {
  if (entry.kind === 'humanoid') {
    if (!tvBody) tvBody = import('../../prototypes/thousandvale/js/client/chibi-version.js').then(m => m.createTvBody);
    const createTvBody = await tvBody;
    const body = await createTvBody(normalizeAvatar(entry.look.avatar), { anims: CHIBI2_ANIMS });
    if (entry.boss) body.group.scale.setScalar(BOSS_SCALE);           // a person is scaled as a whole (actors.js)
    body.group.userData.character = true;
    return Object.assign(body, { humanoid: true, liftY: 0, idleAnim: 'idle', anims: CHIBI2_ANIMS });
  }
  const body = await createCreature(tvCreatureSpec(entry), { detail: entry.boss ? 1 : 0.8 });
  try { compactCreature(body); } catch (e) { console.warn('[tv-monsters] compact failed', e); }
  // a flying look hovers 1.3 m up and plays `fly` (actors.js update)
  return Object.assign(body, { humanoid: false, liftY: entry.flying ? 1.3 : 0, idleAnim: entry.flying ? 'fly' : 'idle' });
}
