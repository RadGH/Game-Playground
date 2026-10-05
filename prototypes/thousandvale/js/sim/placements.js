// Stream E's zone PLACEMENTS as room content (stream A, PLAN §3.4–3.7). Pure.
//
//   placementContent(placements, { recipes, sites, hooks, treasure, quests, band, zone, encounterInfo })
//   -> { camps, objects, doors, waystones, rares: Set(encounter ids placed here), camped: bool }
//
// `placements` = data/vignettes/placements/<zone>.json `placements[]`, already in WORLD metres (content.js moves
// them, `path` points too). One record per thing E placed:
//   vignette        a recipe from data/vignettes/*.json -> js/sim/vignettes.js (marker + note/npc/chest/use + a camp)
//   camp            {monster, with, level:[lo,hi], count:[lo,hi]} -> a monster camp (+ escort)
//   rare            {id = encounter id, name, path, respawnMin:[lo,hi], level} -> a named rare camp that roams `path`
//                   (data.path on the monster; stream C walks it)
//   waystone        {id, name, settlement} -> a waystone (discover, travel; PLAN §5.2)
//   npc             {id, name, role, at} -> a quest NPC (greeting + the quests it gives, from data/quests/<zone>.json)
//   fort            {template, friendly} -> data/provinces/sites.json forts: friendly = a marker + its garrison NPCs;
//                   hostile = its garrison as camps + an armoury chest (per character); a warband stockade = ONE camp row
//                   with a warband leader type (stream C spawns the escort and standard-bearer)
//   farm            {template, settlement} -> a marker, the farm folk, and a small camp of its pests close by
//   cave            {template, plan:{family, floors, level}} -> a DOOR to a small instanced dungeon (the cave's packs
//                   and boss replace the plan's monsters)
//   hook            {id, kind} -> a marker with the hook's lore (data/hooks.json)
//   treasure_clue   {chain, step} -> a clue object (use: read it; progress saved per character)
//   treasure_cache  {chain, step} -> a hidden cache that opens once per character, after every clue of its chain
// Props and buildings are the client's to draw from the same files (E's records + sites.json templates).

import { vignetteContent, vignettePoint } from './vignettes.js';

/** A small stable hash of a string (same placement -> same rolls on every server). */
export function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pickIn = (r, h) => (Array.isArray(r) ? r[0] + (h % (r[1] - r[0] + 1)) : (r ?? 1));
const ROLE_NAMES = { guard: 'Guard', sergeant: 'Sergeant', quartermaster: 'Quartermaster', captain: 'Captain', tollkeeper: 'Tollkeeper',
  farmer: 'Farmer', farmhand: 'Farmhand', shepherd: 'Shepherd', swineherd: 'Swineherd', orchardist: 'Orchard keeper', fisher: 'Fisher', miller: 'Miller' };
const roleName = r => ROLE_NAMES[r] || (r ? r[0].toUpperCase() + r.slice(1) : 'Villager');

export function placementContent(placements, { recipes = [], sites = null, hooks = [], treasure = [], quests = null, band = [1, 6], zone = null, respawnMs = 30000, encounterInfo = {}, warband: sheetWarband = null } = {}) {
  const camps = [], objects = [], doors = [], waystones = [], rares = new Set();
  const list = placements || [];
  const vig = vignetteContent(list.filter(p => !p.type || p.type === 'vignette'), recipes, { band });
  camps.push(...vig.camps); objects.push(...vig.objects);
  const hookById = new Map((hooks || []).map(h => [h.id, h]));
  const chains = new Map((treasure || []).map(c => [c.id, c]));
  const npcs = (quests && quests.npcs) || {};
  const questList = (quests && quests.quests) || [];
  let camped = false;

  for (const p of list) {
    const h = strHash(p.id || p.type + p.x + p.z);
    const marker = (type, extra = {}) => objects.push({ type, name: p.name || type, x: p.x, z: p.z, yaw: p.yaw || 0, key: `${type}:${p.id}`, r: p.radius || 10, ...extra });
    switch (p.type) {
      case 'camp': {
        camped = true;
        const level = pickIn(p.level, h), count = pickIn(p.count, h >>> 3);
        camps.push({ type: p.monster, level, x: p.x, z: p.z, count, radius: p.radius || 10, respawnMs, place: p.id });
        if (p.with) camps.push({ type: p.with, level, x: p.x + 4, z: p.z + 3, count: Math.max(1, count >> 1), radius: 6, respawnMs, place: p.id });
        break;
      }
      case 'rare': {
        rares.add(p.id);
        const r = p.respawnMin || [20, 60];
        camps.push({ type: (encounterInfo[p.id] && encounterInfo[p.id].body) || 'wolf', level: p.level || band[1], x: p.x, z: p.z, count: 1, radius: 2, rank: 'rare', encounter: p.id, name: p.name || null,
          respawnMs: Array.isArray(r) ? [r[0] * 60000, r[1] * 60000] : r * 60000, path: Array.isArray(p.path) && p.path.length > 1 ? p.path : null, place: p.id });
        break;
      }
      case 'waystone':
        waystones.push({ key: 'ws:' + p.id, name: p.name || 'Waystone', x: p.x, z: p.z, settlement: p.settlement || null, zone });
        break;
      case 'npc': {
        const n = npcs[p.id] || {};
        const gives = questList.filter(q => q.giver === p.id).map(q => q.id);
        objects.push({ type: 'npc', name: p.name || n.name || 'Stranger', x: p.x, z: p.z, yaw: p.yaw || 0, key: 'npc:' + p.id,
          npc: { id: p.id, role: p.role || n.role || null, says: n.greeting ? [n.greeting] : [], quest: gives[0] || null, quests: gives, zone } });
        break;
      }
      case 'fort': {
        const t = (sites && sites.forts && sites.forts[p.template]) || {};
        const friendly = p.friendly ?? t.friendly ?? true;
        marker('fort', { site: { kind: 'fort', template: p.template || null, friendly: !!friendly, blurb: t.blurb || null } });
        const g = t.garrison || {};
        if (friendly) ring(g.npcs, p, h).forEach(n => objects.push({ type: 'npc', name: roleName(n.role), x: n.x, z: n.z, key: `npc:${p.id}:${n.k}`, npc: { role: n.role, says: [], site: p.id } }));
        else if (p.template === 'warband_stockade' || t.warband) {
          // a warband camp: ONE row with the leader type; the rules (stream C) bring its escort + standard-bearer
          camped = true;
          const lvl = p.level || band[0] + 1;
          camps.push({ type: warbandLeader(lvl, sheetWarband), level: lvl, x: p.x, z: p.z, count: 1, radius: 3, respawnMs: 10 * 60000, place: p.id, warband: true });
          if (t.loot && t.loot.chest) objects.push({ type: 'chest', name: 'War chest', x: p.x + 2, z: p.z - 2, key: `chest:${p.id}`, chest: { key: `chest:${p.id}`, tier: t.loot.chest, level: lvl + 1 } });
        } else {
          camped = true;
          for (const m of g.monsters || []) camps.push({ type: m.type, level: p.level || band[0] + 1, x: p.x, z: p.z, count: pickIn(m.count, h >>> 5), radius: Math.max(6, (p.radius || 20) * 0.6), rank: m.rank || undefined, respawnMs: 5 * 60000, place: p.id });
          if (t.loot && t.loot.chest) objects.push({ type: 'chest', name: 'Armoury chest', x: p.x + 2, z: p.z - 2, key: `chest:${p.id}`, chest: { key: `chest:${p.id}`, tier: t.loot.chest, level: (p.level || band[0]) + 1 } });
        }
        break;
      }
      case 'farm': {
        const t = (sites && sites.farms && sites.farms[p.template]) || {};
        marker('farm', { site: { kind: 'farm', template: p.template || null, friendly: true, blurb: t.blurb || null, settlement: p.settlement || null } });
        ring(t.npcs, p, h).forEach(n => objects.push({ type: 'npc', name: roleName(n.role), x: n.x, z: n.z, key: `npc:${p.id}:${n.k}`, npc: { role: n.role, says: [], site: p.id } }));
        const pests = t.pests || [];
        if (pests.length) {
          const a = (h % 628) / 100, d = (p.radius || 20) + 18;
          camps.push({ type: pests[h % pests.length], level: p.level || band[0], x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, count: 2 + (h % 2), radius: 6, respawnMs, place: p.id });
        }
        break;
      }
      case 'cave': {
        const t = (sites && sites.caves && sites.caves[p.template]) || {};
        const plan = p.plan || t.plan || {};
        doors.push({ x: p.x, z: p.z, yaw: p.yaw || 0, name: p.name || t.name || 'Cave', zone, kind: 'cave', key: 'cave:' + p.id,
          sheet: { dungeon: { family: plan.family || 'cave_river', floors: plan.floors || 1, level: plan.level || p.level || band[0] } },
          cave: { packs: t.packs || null, boss: t.boss || null, name: p.name || t.name || null } });
        break;
      }
      case 'hook': {
        const hk = hookById.get(p.id) || {};
        marker('hook', { lore: hk.lore || null, site: { kind: 'hook', template: hk.kind || p.kind || null, blurb: null } });
        break;
      }
      case 'treasure_clue':
      case 'treasure_cache': {
        const c = chains.get(p.chain);
        if (!c) break;
        const cache = p.type === 'treasure_cache';
        const steps = c.steps || [];
        const st = cache ? null : steps[p.step] || {};
        const t = { chain: c.id, chainName: c.name || c.id, step: p.step, of: steps.length, cache, text: cache ? null : st.text || '', tier: cache ? (c.cache && c.cache.tier) || 'uncommon' : null, hint: cache ? (c.cache && c.cache.hint) || null : null, how: cache ? (c.cache && c.cache.how) || p.how || 'chest' : st.clue || p.clue || 'note' };
        objects.push({ type: cache ? 'cache' : 'clue', name: cache ? (c.name || 'Buried cache') : clueName(t.how), x: p.x, z: p.z, key: `tr:${c.id}:${p.step}`,
          hidden: cache, hint: cache ? t.hint : null, shimmer: cache ? (p.shimmer || (c.cache && c.cache.shimmer) || 15) : null,
          treasure: { ...t, level: band[0] + 1 } });
        break;
      }
      default: break;   // vignettes handled above; unknown kinds are left to the client
    }
  }
  return { camps, objects, doors, waystones, rares, camped };
}

/** The warband leader for a camp of this level (Farhold data/warbands.json levels: Sootwick 1-16, Ashtusk 5-24, …). */
export const WARBAND_LEADERS = [['sootwick_ringleader', 1, 7], ['ashtusk_warchief', 8, 18], ['thornmane_packlord', 19, 26], ['unburied_deathmarshal', 27, 36], ['stonehide_mountainlord', 37, 99]];
export function warbandLeader(level, prefer = null) {
  if (prefer) { const hit = WARBAND_LEADERS.find(([id]) => id.startsWith(prefer)); if (hit) return hit[0]; }
  return (WARBAND_LEADERS.find(([, lo, hi]) => level >= lo && level <= hi) || WARBAND_LEADERS[0])[0];
}

function clueName(how) { return { note: 'A note', carved_arrow: 'A carved arrow', cairn: 'A cairn', mark: 'A mark' }[how] || 'Something odd'; }

/** NPCs of a site stood in a small ring round its centre: [{role, x, z, k}]. */
function ring(spec, p, h) {
  const out = [];
  for (const s of spec || []) { const n = pickIn(s.count, h >>> 7); for (let i = 0; i < n; i++) out.push({ role: s.role }); }
  const r = Math.max(3, (p.radius || 12) * 0.45);
  return out.map((n, i) => { const lp = { x: Math.cos(i / Math.max(1, out.length) * 6.283) * r, z: Math.sin(i / Math.max(1, out.length) * 6.283) * r }; const w = vignettePoint(p, lp.x, lp.z); return { ...n, x: w.x, z: w.z, k: i }; });
}

/** Re-type a planned cave so its packs are the cave's own beasts and its last pack the cave's boss. */
export function caveDungeon(plan, cave) {
  if (!cave) return plan;
  if (cave.name) plan.name = cave.name;
  const packs = cave.packs && cave.packs.length ? cave.packs : null;
  let n = 0;
  for (const f of plan.floors) for (const pk of f.packs) {
    if (pk.rank === 'boss' && cave.boss) { pk.type = cave.boss.type; pk.rank = cave.boss.rank || 'elite'; pk.encounter = null; pk.count = 1; }
    else if (packs) { pk.type = packs[n++ % packs.length]; if (pk.encounter) { pk.encounter = null; pk.rank = 'elite'; pk.count = 1; } }
  }
  return plan;
}
