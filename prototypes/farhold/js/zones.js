// Farhold — zones: the world's own difficulty, drawn on the map.
//
// The idea comes from the block-world action-RPG mods (named in the checklist, not in the game):
// **how hard a fight is belongs to the place, not to the player**. Walk further and everything is
// stronger and worth more. Those mods measure "further" as distance from spawn, which gives you
// invisible rings. World Forge already grows *named regions* with borders it draws on the map, so
// Farhold bands the regions instead — "the Kelder Reach is level 9-13" is something you can see,
// point at, and decide to avoid.
//
//   import { buildZones } from './zones.js';
//   const zones = buildZones(world, { spawn: [x, z], maxLevel: 30 });
//   zones.at(x, z);            // { name, minLevel, maxLevel, danger, band, … }
//   zones.levelFor(x, z, rng); // a level to roll an enemy at, right here
//
// Pure: no Three.js, no DOM, so the node tests drive it.

import { M_PER_CELL } from './planet.js';

/**
 * What a band is called. Deliberately plain words — the number next to it does the real work, and
 * these have to survive being read a thousand times.
 */
export const DANGER_WORDS = [
  'Settled', 'Open country', 'Wild', 'Lawless', 'Hostile', 'Savage', 'Blighted', 'Unforgiving',
];

/** The colour a zone reads as against your own level, for the HUD and the map. */
export function zoneTone(zoneLevel, playerLevel) {
  const gap = zoneLevel - playerLevel;
  if (gap <= -5) return 'trivial';
  if (gap <= -2) return 'easy';
  if (gap <= 2) return 'even';
  if (gap <= 5) return 'hard';
  return 'deadly';
}

/**
 * Band the regions of a world by how far they are from the one the player starts in.
 *
 * `hops` is the number of region borders you must cross, not metres: a huge region is still one
 * step. That keeps the first zone genuinely soft however big it happens to be, which is the whole
 * point of a starting region.
 */
export function buildZones(world, { spawn = null, maxLevel = 30, bandWidth = 4, startLevel = 1 } = {}) {
  const regions = world.regions || [];
  const W = world.width;
  const cellOf = (x, z) => {
    const cx = Math.max(0, Math.min(W - 1, Math.floor(x / M_PER_CELL)));
    const cy = Math.max(0, Math.min(world.height - 1, Math.floor(z / M_PER_CELL)));
    return cy * W + cx;
  };

  // which region the player starts in; if they start at sea (they never do) fall back to region 0
  let startId = 0;
  if (spawn && world.region) {
    const r = world.region[cellOf(spawn[0], spawn[1])];
    if (r >= 0) startId = r;
  }

  // breadth-first over the region neighbour graph
  const hops = new Map([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    const h = hops.get(id);
    for (const n of regions[id]?.neighbours || []) {
      if (hops.has(n)) continue;
      hops.set(n, h + 1);
      queue.push(n);
    }
  }
  // islands the graph never reaches (another landmass) are as far away as anything gets, plus one
  let maxHops = 0;
  for (const h of hops.values()) maxHops = Math.max(maxHops, h);
  const unreachable = maxHops + 1;
  for (const r of regions) if (!hops.has(r.id)) hops.set(r.id, unreachable);
  maxHops = Math.max(maxHops, regions.length > 1 ? unreachable : 0);

  // Spread the bands over the level range. A world with three regions still goes 1 -> 30, and a
  // world with fifteen does not spend eleven of them at level 29.
  //
  // Hops alone are too coarse on a real map. World Forge grows big, well-connected regions, so a
  // whole continent is often only three or four borders across — and banding purely on hops gave
  // 1-4, then 10-13, then 18-21, then *everything else* at 27-30. That is a cliff, not a gradient,
  // and you cannot plan a route along it. So the band is hops (which respects borders and what is
  // actually walkable) blended with how far the region's middle is from home (which separates the
  // regions that share a hop count). Hops still lead: a near region can never outrank a far one by
  // much, and the starting region is pinned to the bottom below whatever this says.
  const bands = Math.max(1, maxHops);
  const home0 = regions[startId]?.center || { x: 0, y: 0 };
  let farthest = 1;
  for (const r of regions) {
    farthest = Math.max(farthest, Math.hypot((r.center?.x ?? 0) - home0.x, (r.center?.y ?? 0) - home0.y));
  }
  const top = Math.max(startLevel + bandWidth, maxLevel - bandWidth + 1);

  // How far out each region is, 0..1, with a gentle curve on the bottom so the first ring out of
  // home is a step rather than a wall. A new character needs somewhere to go at level 5.
  const reach = regions.map(r => {
    const h = hops.get(r.id) ?? 0;
    const hopShare = bands ? h / bands : 0;
    const away = Math.hypot((r.center?.x ?? 0) - home0.x, (r.center?.y ?? 0) - home0.y) / farthest;
    return { r, h, t: Math.pow(Math.min(1, hopShare * 0.6 + away * 0.4), 1.35) };
  });

  /**
   * NO GAPS. Placing each band at `1 + t × 26` independently left holes: a world could come out
   * "1-4, 7-10, 8-11, 16-19" with nothing at all to fight at levels 5-6 or 12-15, and a player who
   * levelled past their home region had nowhere legitimate to go next.
   *
   * So the bands are laid out by RANK rather than by raw distance — sorted by `t`, then spread
   * evenly across the level range — and the band is **widened** when there are too few regions to
   * tile it. With five regions a four-level band cannot cover thirty levels; an eight-level one can.
   */
  const order = [...reach].sort((a, b) => a.t - b.t);
  const steps = Math.max(1, order.length - 1);
  const stride = (top - startLevel) / steps;                 // levels between one region and the next
  const width = Math.max(bandWidth, Math.ceil(stride) + 1);  // wide enough that consecutive bands touch
  const rankOf = new Map(order.map((o, i) => [o.r.id, i]));

  const zones = regions.map(r => {
    const info = reach.find(x => x.r === r);
    const rank = rankOf.get(r.id) ?? 0;
    const min = Math.round(startLevel + rank * stride);
    const max = Math.min(maxLevel, min + width - 1);
    const band = Math.min(DANGER_WORDS.length - 1, Math.round(info.t * (DANGER_WORDS.length - 1)));
    return {
      id: r.id, name: r.name, adjective: r.adjective, people: r.people, race: r.race,
      descriptor: r.descriptor, center: r.center, cells: r.cells,
      hops: info.h, rank, band, danger: DANGER_WORDS[band],
      minLevel: Math.max(1, min), maxLevel: Math.max(1, max),
      midLevel: Math.round((Math.max(1, min) + Math.max(1, max)) / 2),
      home: r.id === startId,
    };
  });

  // The starting region is *always* the softest thing on the planet, whatever the graph says.
  const home = zones.find(z => z.home);
  if (home) {
    home.minLevel = startLevel;
    home.maxLevel = startLevel + Math.max(bandWidth, Math.ceil(stride)) - 1;
    home.midLevel = Math.round((home.minLevel + home.maxLevel) / 2);
    home.band = 0;
    home.danger = DANGER_WORDS[0];
  }

  /** Every level from `startLevel` to `maxLevel` that no region covers. Should always be empty. */
  function gaps() {
    const covered = new Set();
    for (const z of zones) for (let l = z.minLevel; l <= z.maxLevel; l++) covered.add(l);
    const out = [];
    for (let l = startLevel; l <= maxLevel; l++) if (!covered.has(l)) out.push(l);
    return out;
  }

  // The sea is nobody's region. Anything asked about open water gets the shallowest band, because
  // the only things that happen out there are crossings.
  const OPEN = {
    id: -1, name: 'Open water', danger: DANGER_WORDS[0], band: 0, hops: 0,
    minLevel: startLevel, maxLevel: startLevel + bandWidth - 1,
    midLevel: startLevel + 1, home: false, descriptor: 'open water',
  };

  function at(x, z) {
    if (!world.region) return OPEN;
    const id = world.region[cellOf(x, z)];
    return id >= 0 ? (zones[id] || OPEN) : OPEN;
  }

  /** The level to roll a spawn at, here. A little spread inside the band keeps a zone varied. */
  function levelFor(x, z, rng = Math.random) {
    const zone = at(x, z);
    const span = zone.maxLevel - zone.minLevel;
    const r = typeof rng === 'function' ? rng() : Math.random();
    return Math.max(1, Math.min(maxLevel, zone.minLevel + Math.round(r * span)));
  }

  return {
    zones, startId, maxHops, bandWidth: width, maxLevel, gaps,
    at, levelFor,
    /** For the map legend and the debug report. */
    list: () => zones.slice().sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name)),
    byId: id => zones[id] || OPEN,
    /** A one-line description, the way the HUD says it. */
    text: zone => `${zone.name} · level ${zone.minLevel}–${zone.maxLevel} · ${zone.danger}`,
  };
}
