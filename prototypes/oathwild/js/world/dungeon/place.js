// Oathwild — a dungeon as a region's place (regions, owner 2026-11-27; docs/BRAINSTORM-2026-11-27-regions.md §3). Pure
// apart from reading its spec through js/world/boot.js readJson. Turns buildDungeon (index.js) into the same W shape
// the open world, the arena and the graveyard give the server and the page: data (map, placements, npcs), a terrain
// face (heights, walkable, region), travel points (its entrances and exit), camps registered in rules.data.regions (so
// js/rules/combat.js spawnCamp reads them like any camp), and the dungeon's own ground: the walk grid
// (W.makeGround) — the ONE answer to where feet go, so nothing walks into the void.
//
//   const W = await bootDungeonPlace({ regions, file, read, id })     regions = rules.data.regions (camps are added)
//   dungeonAI(W)  → { sight(m, target, range), steer(u, p) }          the server puts these on its sim world
//
// Travel ids: `<id>-<entrance>` for each entrance and exit (catacombs-main, catacombs-collapsed, catacombs-surface);
// their `to` is the matching point in the region above (data/dungeons/<id>.json `links`, else `<above>-<entrance>`).
import { readJson } from '../boot.js';
import { normEdits } from '../edits.js';
import { buildDungeon } from './index.js';
import { canNotice, lineOfSight } from './sight.js';
import { BIOMES } from '../terrain.js';

const TILE = 2;

export async function bootDungeonPlace({ regions, file, read = readJson, id = null, seed = null }) {
  const spec = await read(new URL(`../../../${file}`, import.meta.url));
  const rid = id || spec.id || 'catacombs';
  const D = buildDungeon(spec, seed ?? spec.seed ?? 1);
  const P = D.plan;
  const lv = [Math.min(...spec.levels.map(l => l.monsterLevel ?? l.level)), Math.max(...spec.levels.map(l => l.monsterLevel ?? l.level))];

  // camps: one per pack (bosses, elites and patrols too), registered where js/rules/combat.js looks camps up
  const camps = {}, campRows = [];
  for (const pk of D.encounters.packs) {
    const at = pk.home;
    camps[pk.id] = {
      name: pk.name || `${roomName(P, pk.room)}`, at, levels: [pk.monsterLevel, pk.monsterLevel], respawnMinutes: pk.kind === 'boss' ? 45 : 25, chest: null,
      notice: pk.notice || spec.notice || 16,
      spawns: pk.members.map((mb, i) => ({ id: mb.monster, count: 1, at: [round(mb.at[0] - at[0]), round(mb.at[1] - at[1])], ...(mb.rank || (pk.kind === 'boss' && i === 0) ? { rank: mb.rank || 'boss' } : {}), ...(mb.name ? { name: mb.name } : {}) })),
      ...(pk.patrol ? { patrol: pk.patrol } : {}),
    };
    campRows.push({ id: pk.id, name: camps[pk.id].name, region: rid, at, levels: camps[pk.id].levels, clear: 10 });
  }
  if (regions?.regions) regions.regions[rid] = { name: spec.name, levels: lv, roam: [], camps, chests: {}, shrines: {}, dungeon: true };

  // a terrain face for the room code and the page (no sky ground: heights and walkable come from the walk grid)
  const W2 = P.cols * TILE, H2 = P.rows * TILE;
  const places = Object.fromEntries(P.rooms.filter(r => r.name || r.kind === 'boss_hall' || r.kind === 'entrance' || r.kind === 'pillared_hall').map(r => [r.id, { name: r.name || roomName(P, r.id), at: [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2], radius: Math.min(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) / 2 }]));
  // the page's maps (minimap, the region map) paint a biome grid: here one cell per tile — floor as paved road, rock as
  // rock, the pit as deep water-dark marsh — so the Catacombs' own plan shows on them (and the outdoor-only questions
  // — water, forest, roads — answer "none")
  const BI = name => BIOMES.indexOf(name);
  const ids = new Uint8Array(P.cols * P.rows);
  for (let k = 0; k < P.rows; k++) for (let i = 0; i < P.cols; i++) { const t = P.tiles[k * P.cols + i]; ids[k * P.cols + i] = t === 0 ? BI('rock') : t === 2 ? BI('marsh') : BI('road'); }
  const tileAt = (x, z) => { const i = Math.floor(x / TILE), k = Math.floor(z / TILE); return i < 0 || k < 0 || i >= P.cols || k >= P.rows ? 0 : P.tiles[k * P.cols + i]; };
  const terrain = {
    heightAt: (x, z) => D.walk.heightAt(x, z),
    walkable: (x, z) => D.walk.walkable(x, z),
    regionAt: () => rid, regionIds: [rid], places,
    levelBandAt: () => lv,
    bounds: { minX: 0, maxX: W2, minZ: 0, maxZ: H2 },
    biomeGrid: { nx: P.cols, nz: P.rows, cell: TILE, minX: 0, minZ: 0, ids },
    biomeAt: (x, z) => { const t = tileAt(x, z); return t === 0 ? 'rock' : t === 2 ? 'marsh' : 'road'; },
    waterAt: () => null, forestAt: () => 0, roadAt: () => null,
    roads: [], rivers: [], bridges: [], marshes: [],
    grid: { heights: Float32Array.from(P.heights || []) },
    dungeon: true,
  };
  const main = P.entrances.find(e => !e.collapsed) || P.entrances[0];
  const links = spec.links || {};
  const travel = [...P.entrances, ...P.exits].map(e => ({
    id: `${rid}-${e.id}`, at: e.at, facing: e.facing, radius: 6, arrive: 7,
    label: e.collapsed ? 'The fallen grave (climb up)' : P.exits.includes(e) ? 'The stair up to the light' : 'The crypt stair up',
    to: links[e.id] || `${spec.above || 'ashfield'}-${e.id === 'surface' ? 'crypt' : e.id}`, toRegion: spec.above || 'ashfield',
  }));
  const data = {
    map: { spawn: { at: arrival(main) }, regions: { [rid]: { name: spec.name, levels: lv } }, bounds: terrain.bounds, places: {}, roads: [], rivers: [] },
    placements: { camps: campRows, roam: [], shrines: [], chests: [], objects: [], props: [], boxes: [], dungeon: true },
    quests: { quests: {} }, npcs: { npcs: {} }, towns: {}, edits: normEdits(null),
  };
  terrain.map = data.map;
  return {
    data, terrain, town: null, book: null, travel, dungeon: D, spec, place: rid,
    makeGround: () => D.walk,
  };
}

/** The server's sim hooks for a dungeon place: monsters notice only what they can see (and walk to), and walk round walls. */
export function dungeonAI(W) {
  const D = W.dungeon;
  return {
    sight: (m, t, r) => canNotice(D.walk, m, t, r, { pather: D.pather }),
    steer: (u, p) => {
      if (lineOfSight(D.walk, u, p)) return p;
      const f = D.pather.flowTo(p);
      return (f && D.pather.nextStep(f, u)) || p;
    },
  };
}

const round = v => Math.round(v * 100) / 100;
const arrival = e => [e.at[0] + Math.sin(e.facing || 0) * 7, e.at[1] + Math.cos(e.facing || 0) * 7];
function roomName(P, id) {
  const r = P.rooms.find(x => x.id === id);
  const K = { hall: 'the Hall', pillared_hall: 'the Pillared Hall', crypt: 'a Crypt', ossuary: 'the Ossuary', chapel: 'the Chapel', goblin_den: 'the Goblin Den', troll_pit: 'the Troll Pit', boss_hall: 'the Throne Hall', entrance: 'the Crypt Gate' };
  return r ? (K[r.kind] || 'the Catacombs') : 'the Catacombs';
}
