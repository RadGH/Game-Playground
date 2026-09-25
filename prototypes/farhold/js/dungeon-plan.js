// Farhold — the dungeon LAYOUT, with no Three.js in it.
//
// Split out of `dungeon.js` for the same reason `avatar-3d/js/creature-types.js` is split out of
// `creatures.js`: the shape of a dungeon is rectangles and line segments, and `node --test` should
// be able to assert that every room is reachable and the boss is not standing in the doorway
// without a WebGL context anywhere near it. `dungeon.js` re-exports everything here.

import { makeRng } from '../../../worldgen/js/noise.js';

/** The look of a dungeon, picked from the biome it was dug into. Original names, no borrowed sets. */
export const DUNGEON_LOOKS = {
  barrow: { name: 'Barrow', floor: '#4a4238', wall: '#5a5248', trim: '#7a6a50', fog: '#0a0906' },
  crypt: { name: 'Crypt', floor: '#42444a', wall: '#4e5158', trim: '#8a90a0', fog: '#07080a' },
  cinderworks: { name: 'Cinderworks', floor: '#4a2e24', wall: '#5a382a', trim: '#c86a30', fog: '#120604' },
  hollow: { name: 'Hollow', floor: '#2e3a34', wall: '#3a4a40', trim: '#6a9a70', fog: '#060a08' },
  vault: { name: 'Vault', floor: '#3e3a4a', wall: '#4a4458', trim: '#9a80d0', fog: '#08060e' },
  rime: { name: 'Rimeworks', floor: '#46525e', wall: '#54626e', trim: '#a8ccdd', fog: '#080c10' },

  /**
   * ROUND 16 — five more, for the places `data/instances.json` opens.
   *
   * The six above are all DUG: somebody quarried them, laid the floor and set the sconces. An
   * instance is often none of those things — a cave nobody made, a house that fell in, a cistern
   * with water still in it — and reading a farmhouse cellar in the same grey stone as a crypt is
   * how twenty new places end up feeling like one place with twenty doors on it.
   *
   * The six above are untouched, byte for byte: every existing dungeon looks exactly as it did.
   */
  cave: { name: 'Cave', floor: '#3c3a36', wall: '#4a4640', trim: '#7d8a86', fog: '#050606' },
  ruin: { name: 'Ruin', floor: '#5a5446', wall: '#6a6356', trim: '#9a9080', fog: '#0b0a08' },
  hoard: { name: 'Hoard', floor: '#5a3a20', wall: '#48301f', trim: '#e0b040', fog: '#140a04' },
  flooded: { name: 'Flooded', floor: '#2a3a40', wall: '#36464c', trim: '#6ea8b0', fog: '#050a0c' },
  warren: { name: 'Warren', floor: '#463626', wall: '#54422e', trim: '#8a7048', fog: '#080604' },
};

/** Which look a biome family digs into. */
export function lookForBiome(families = []) {
  if (families.includes('lava')) return 'cinderworks';
  if (families.includes('ice') || families.includes('tundra')) return 'rime';
  if (families.includes('jungle') || families.includes('toxic')) return 'hollow';
  if (families.includes('void') || families.includes('crystal')) return 'vault';
  if (families.includes('rock') || families.includes('desert')) return 'crypt';
  return 'barrow';
}

/**
 * Lay the rooms out. Pure — no Three.js — so the node tests can assert that every room is reachable
 * and that the boss is not next to the door.
 */
export function layout({ seed = 1, rooms: want = [6, 11], roomSize = [9, 17], cellSize = 6, corridor = 3.2 } = {}) {
  const rng = makeRng(seed >>> 0);
  const count = want[0] + Math.floor(rng() * (want[1] - want[0] + 1));
  const rooms = [];
  const spread = 26 + count * 7;

  // scatter rectangles, rejecting anything that lands on top of an existing room
  for (let tries = 0; rooms.length < count && tries < count * 60; tries++) {
    const w = roomSize[0] + rng() * (roomSize[1] - roomSize[0]);
    const h = roomSize[0] + rng() * (roomSize[1] - roomSize[0]);
    const x = (rng() - 0.5) * spread * 2;
    const z = (rng() - 0.5) * spread * 2;
    const room = { x, z, w, h, id: rooms.length };
    const clash = rooms.some(r =>
      Math.abs(r.x - room.x) < (r.w + room.w) / 2 + cellSize * 1.6 &&
      Math.abs(r.z - room.z) < (r.h + room.h) / 2 + cellSize * 1.6);
    if (!clash) rooms.push(room);
  }
  if (!rooms.length) rooms.push({ x: 0, z: 0, w: 14, h: 14, id: 0 });

  // the entrance is the room nearest the middle; the boss is the one furthest from it
  let entrance = rooms[0];
  for (const r of rooms) if (Math.hypot(r.x, r.z) < Math.hypot(entrance.x, entrance.z)) entrance = r;
  let boss = rooms[0];
  for (const r of rooms) {
    if (Math.hypot(r.x - entrance.x, r.z - entrance.z) > Math.hypot(boss.x - entrance.x, boss.z - entrance.z)) boss = r;
  }
  entrance.kind = 'entrance';
  boss.kind = boss === entrance ? 'entrance' : 'boss';
  for (const r of rooms) if (!r.kind) r.kind = 'room';

  // join them: grow a connected set, each step adding the unconnected room nearest to it. That is
  // a minimum spanning tree by another name, and it guarantees every room is reachable.
  const joined = [entrance];
  const left = rooms.filter(r => r !== entrance);
  const halls = [];
  while (left.length) {
    let best = null, from = null, bestD = Infinity;
    for (const a of joined) for (const b of left) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < bestD) { bestD = d; best = b; from = a; }
    }
    halls.push({ from: from.id, to: best.id, ax: from.x, az: from.z, bx: best.x, bz: best.z, bendX: rng() < 0.5 });
    joined.push(best);
    left.splice(left.indexOf(best), 1);
  }
  // one or two loops, so a dungeon is not a pure tree you have to backtrack through
  const extra = Math.floor(rng() * 2) + (count > 7 ? 1 : 0);
  for (let i = 0; i < extra && rooms.length > 3; i++) {
    const a = rooms[Math.floor(rng() * rooms.length)];
    const b = rooms[Math.floor(rng() * rooms.length)];
    if (a === b || halls.some(h => (h.from === a.id && h.to === b.id) || (h.from === b.id && h.to === a.id))) continue;
    halls.push({ from: a.id, to: b.id, ax: a.x, az: a.z, bx: b.x, bz: b.z, bendX: rng() < 0.5, loop: true });
  }

  const bounds = rooms.reduce((acc, r) => ({
    minX: Math.min(acc.minX, r.x - r.w / 2), maxX: Math.max(acc.maxX, r.x + r.w / 2),
    minZ: Math.min(acc.minZ, r.z - r.h / 2), maxZ: Math.max(acc.maxZ, r.z + r.h / 2),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  return { rooms, halls, entrance, boss, bounds, corridor, cellSize, count: rooms.length };
}

/** Is this point on a floor — in a room, or in the width of a corridor? */
export function insideLayout(plan, x, z, pad = 0) {
  for (const r of plan.rooms) {
    if (Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.h / 2 + pad) return r;
  }
  const half = plan.corridor / 2 + pad;
  for (const h of plan.halls) {
    // an L: one leg along x at az, one along z at bx (or the other way round)
    const midX = h.bendX ? h.bx : h.ax;
    const midZ = h.bendX ? h.az : h.bz;
    if (Math.abs(z - h.az) <= half && x >= Math.min(h.ax, midX) - half && x <= Math.max(h.ax, midX) + half && h.bendX) return h;
    if (Math.abs(x - midX) <= half && z >= Math.min(h.az, h.bz) - half && z <= Math.max(h.az, h.bz) + half) return h;
    if (Math.abs(z - h.bz) <= half && x >= Math.min(midX, h.bx) - half && x <= Math.max(midX, h.bx) + half && !h.bendX) return h;
    /**
     * R18 — THERE WAS A FOURTH CLAUSE HERE AND IT REPORTED FLOOR THAT IS NEVER DRAWN.
     *
     * It tested, for `!h.bendX`, a horizontal strip at `z = h.az` spanning the whole ax..bx range.
     * js/dungeon.js draws a `!bendX` hall as a VERTICAL leg at `x = h.ax` (az..bz) and THEN a
     * horizontal leg at `z = h.bz` (ax..bx) — so a strip at `z = h.az` is the other L, the one the
     * renderer did not build. The clauses above already cover both real legs, and the only floor
     * that genuinely exists at `z = h.az` is where the vertical leg starts, which the `|x - midX|`
     * clause covers.
     *
     * It mattered because js/dungeon.js asks this question to decide where NOT to build a wall: it
     * probes 1.4 m outside each room-wall segment and, when something else owns that floor, leaves
     * the segment out to make a doorway. A phantom strip therefore punched a hole in a room wall
     * with nothing behind it — measured at ~5 per dungeon across 38 of 40 seeds — and the same
     * false positive dropped corridor rail segments.
     */
  }
  return null;
}

