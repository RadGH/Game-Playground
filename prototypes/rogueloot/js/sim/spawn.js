// Filling an area with monsters at the start of every game session (ruling 25: fresh each session). Pure.
// An area lists spawn markers: { x, z, level, tag: 'pack'|'patrol'|'swarm', pack?: [defId...], table?: '<spawnTable id>',
// route?: [{x,z}...] }. Untagged markers are 'pack'. A marker rolls from the bestiary's spawn table for its area
// (data/monsters.json spawnTables: packs / patrols / swarms with weights, counts [min,max] and minLevel) — or, with no
// bestiary loaded (unit tests), a small built-in set of stand-ins.
//
// The early-game ramp (owner 2026-11-13; data/balance.json `groups`): the MARKER's level caps how many stand together —
// 1 at level 1, pairs at 2-3 (most of them cut to one by `soloChance`), 3 at level 4, 4 at 5, 5 at 6, the table's full
// roll from 7. A swarm marker below `swarmMinLevel` spawns only that cap of its swarm (a taste, not the lesson). A
// champion stands alone up to `championSoloUntil`. Whatever the cap trims off is not lost: each trimmed monster becomes
// a separate single (its own pack) placed `strays.spread` m away in the open, so a zone keeps its monster count and XP —
// more, spread-out 1v1 fights instead of fewer markers.
import { makeFoe } from './actors.js';
import { monsterDef } from './content.js';
import { resolve } from './move.js';
import { clearLine } from './paths.js';
import { rollMods, makeChampion, spawnRares } from './champions.js';

export const FALLBACK = {
  test_raider: monsterDef('test_raider', { name: 'Hill Raider', role: 'brute', levelRange: [1, 3], size: 1.3, hp: 1, damage: 1, speed: 3.4 }),
  test_slinger: monsterDef('test_slinger', { name: 'Raider Slinger', role: 'archer', levelRange: [1, 3], size: 1.2, hp: 0.7, damage: 0.8, attackRange: 14, speed: 3.6 }),
  test_hexer: monsterDef('test_hexer', { name: 'Raider Hexer', role: 'caster', levelRange: [2, 4], size: 1.3, hp: 0.8, damage: 0.9, attackRange: 12, damageType: 'fire',
    abilities: [{ id: 'cinder', name: 'Cinder Bolt', kind: 'bolt', castTime: 2, cooldown: 9, interruptible: true, telegraph: { shape: 'none' }, effect: 'a fire bolt' }] }),
};
const defOf = (w, id) => w.content.monsters?.[id] || FALLBACK[id] || null;
const clampLevel = (def, L) => Math.max(def.levelRange[0], Math.min(def.levelRange[1], L));

export function spawnArea(w) {
  spawnPacks(w); spawnRares(w);
}
function spawnPacks(w) {
  let packN = 0; const nextPack = () => 'k' + (++packN);
  const placed = [];                                     // every stray placed in this area, so two markers' strays never share a spot
  for (const sp of w.area.spawns || []) {
    if (sp.boss) {                                         // a dungeon boss's marker: { x, z, boss: '<id>' }
      const def = w.content.monsters[sp.boss]; if (!def) continue;
      const f = makeFoe(w, def, def.raw?.level || sp.level || def.levelRange[0], sp.x, sp.z, { rank: 'boss', pack: 'boss-' + sp.boss });
      // where the boss's helpers come from (the room's own features: pillars, chutes, egg sacs, coffins)
      const SPOTS = ['pillars', 'chutes', 'sacs', 'coffins', 'spots', 'adds'];
      f.addSpots = SPOTS.flatMap(k => Array.isArray(sp[k]) ? sp[k].filter(v => Array.isArray(v) && v.length >= 2).map(([x, z]) => ({ x, z })) : []);
      f.leashBig = true; continue;
    }
    const rolled = sp.pack || pickPack(w, sp);
    const table = w.content.spawnTables?.[sp.table || w.area.table || w.area.id];
    const champ = sp.tag !== 'swarm' && (sp.rank === 'champion' || w.rng() < (table?.champion ?? 0));
    const { keep: ids, strays } = rampGroup(w, rolled, sp, { pinned: !!sp.pack, champion: champ });
    const pack = nextPack();
    const n = ids.length, ring = n > 6 ? 2.6 : 1.5;
    const mods = champ ? rollMods(w, sp.level || 1) : null;
    const made = [];
    ids.forEach((id, i) => {
      const def = defOf(w, id); if (!def) return;
      const a = (i / n) * Math.PI * 2, r = n > 1 ? ring * (0.6 + 0.4 * ((i * 7) % 3) / 2) : 0;
      const [x, z] = resolve(w.area, sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r, def.radius);      // never inside a tree
      const f = makeFoe(w, def, clampLevel(def, sp.level || def.levelRange[0]), x, z, { pack, rank: sp.rank || 'normal' });
      f.spawnLevel = sp.level || 1;                        // the marker's level (a crab at a level-4 marker is level 3)
      if (sp.route) { f.route = sp.route; f.leg = 0; }
      made.push(f);
    });
    // a champion pack: the first is the champion (all its mods), the rest share the pack-wide ones; twinned = two
    if (mods && made.length) { made.forEach((f, i) => makeChampion(w, f, mods, { leader: i === 0 || (i === 1 && mods.includes('twinned')) })); }
    // the ramp's leftovers: singles in the open round the marker, each its own fight
    for (const id of strays) placeStray(w, sp, id, nextPack(), placed);
  }
}
/** The early-game ramp (balance.json `groups`): which of a rolled group stand together at this marker, and which
 *  become spread-out singles. Pinned `pack` arrays keep their size up to the cap; a champion stands alone early on;
 *  a swarm marker below the swarm level spawns a few of its swarm and no strays. Trimming keeps one of each kind
 *  first (the lesson monster — the caster, the archer — stays with the group). */
export function rampGroup(w, ids, sp, { pinned = false, champion = false } = {}) {
  const G = w.content.balance?.groups, L = sp.level || 1;
  if (!G || !ids?.length) return { keep: ids || [], strays: [] };
  const cap = G.maxSize?.[L] ?? Infinity;
  if (sp.tag === 'swarm') return L >= (G.swarmMinLevel ?? 0) || ids.length <= cap ? { keep: ids, strays: [] } : { keep: oneOfEachFirst(ids).slice(0, cap), strays: [] };
  let n = cap;
  if (champion && L <= (G.championSoloUntil ?? 0)) n = 1;
  else if (!pinned && (G.soloChance?.[L] || 0) > 0 && w.rng() < G.soloChance[L]) n = 1;
  if (ids.length <= n) return { keep: ids, strays: [] };
  const o = oneOfEachFirst(ids);
  return { keep: o.slice(0, n), strays: o.slice(n) };
}
function oneOfEachFirst(ids) { const seen = new Set(), first = [], rest = []; for (const id of ids) (seen.has(id) ? rest : (seen.add(id), first)).push(id); return first.concat(rest); }
/** One trimmed monster, re-placed as a single `spread` m from its marker: in the open (a clear line back to the marker,
 *  so never across a cliff or a pool), not on the player's head, and `gap` m from other strays and other markers. */
function placeStray(w, sp, id, pack, placed) {
  const S = w.content.balance?.groups?.strays || {}, [d0, d1] = S.spread || [11, 18], gap = S.gap || 10;
  const def = defOf(w, id); if (!def) return null;
  const A = w.area, others = (A.spawns || []).filter(o => o !== sp);
  // two passes: the open spread first; then closer in with a smaller gap, for a cave corridor or a tight room
  const near = S.near || [8, 11];
  for (const [lo, hi, g, tries] of [[d0, d1, gap, 14], [near[0], near[1], Math.max(4, gap * 0.7), 14]]) for (let t = 0; t < tries; t++) {
    const a = w.rng() * Math.PI * 2, d = lo + w.rng() * (hi - lo);
    const [x, z] = resolve(A, sp.x + Math.cos(a) * d, sp.z + Math.sin(a) * d, def.radius);
    if (Math.hypot(x - sp.x, z - sp.z) < lo - 1) continue;                                // pushed back toward the group
    if (!clearLine(A, sp.x, sp.z, x, z, def.radius)) continue;                            // same side of every cliff and pool
    if (A.spawn && Math.hypot(x - A.spawn.x, z - A.spawn.z) < 18) continue;               // not on the player's head
    if (placed.some(p => Math.hypot(p.x - x, p.z - z) < g)) continue;                     // not beside another stray
    if (others.some(o => Math.hypot(o.x - x, o.z - z) < g)) continue;                     // not beside another marker's group
    const f = makeFoe(w, def, clampLevel(def, sp.level || def.levelRange[0]), x, z, { pack, rank: 'normal' });
    f.stray = true; f.spawnLevel = sp.level || 1; placed.push({ x, z }); return f;
  }
  return null;                                                                            // nowhere to stand: this one is lost
}
/** Roll one composition from a table list: [{ w, of: { id: n | [min, max] }, minLevel }]. */
export function rollComposition(w, rows, level, floor = 1) {
  const ok = (rows || []).filter(r => !(r.minLevel > level) && (r.floor == null || (Array.isArray(r.floor) ? r.floor.includes(floor) : r.floor === floor)));
  if (!ok.length) return null;
  const tot = ok.reduce((s, r) => s + (+r.w || +r.weight || 1), 0); let k = w.rng() * tot;
  for (const r of ok) {
    k -= (+r.w || +r.weight || 1); if (k > 0) continue;
    const out = [];
    for (const [id, c] of Object.entries(r.of || {})) {
      const n = Array.isArray(c) ? c[0] + Math.floor(w.rng() * (c[1] - c[0] + 1)) : +c || 1;
      for (let i = 0; i < n; i++) out.push(id);
    }
    return out;
  }
  return null;
}
function pickPack(w, sp) {
  const t = w.content.spawnTables?.[sp.table || w.area.table || w.area.id.replace(/_\d+$/, '')];
  const rows = sp.tag === 'patrol' ? t?.patrols : sp.tag === 'swarm' ? t?.swarms : t?.packs;
  const floor = +(/_(\d+)$/.exec(w.area.id)?.[1] || 1);            // tidecaves_2 is floor 2
  // a marked spot (perch, burrow, egg_sac, door…) prefers the table rows written for it, and falls back to any
  const fit = sp.marker && rows?.some(r => r.marker === sp.marker) ? rows.filter(r => r.marker === sp.marker) : rows?.filter(r => !r.marker || !sp.marker) || rows;
  const got = rollComposition(w, fit?.length ? fit : rows, sp.level || 1, floor);
  if (got?.length) return got;
  const n = 2 + Math.floor(w.rng() * 3), out = [];
  for (let i = 0; i < n; i++) out.push(i === 0 && sp.level >= 2 && w.rng() < 0.5 ? 'test_hexer' : w.rng() < 0.3 ? 'test_slinger' : 'test_raider');
  return out;
}
