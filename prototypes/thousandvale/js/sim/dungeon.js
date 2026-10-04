// Dungeon instances (stream A). Two pieces:
//
//   planDungeon(seed, opts)      the LAYOUT. Stream E owns the real generator (js/rules/dungeon-tiers.js,
//                                PLAN §3.6); until it exists this file carries a STAND-IN with the same
//                                output shape (rooms + corridors per floor, stairs, key/mini-boss/boss/
//                                reward rooms, a loop-back exit). worldRoomSpec() takes either.
//   dungeonTerrain(plan)         the plan as a terrain object for the room (flat floors, walls block).
//   dungeonRoomSpec(plan, opts)  monster camps + objects (stairs, exits, reward chest) for createRoom.
//
// PLAN SHAPE (what E's generator must return; docs/protocol.md §10):
//   { family, level, seed, cell: 2,
//     floors: [ { index, origin: {x, z}, w, h,          // w×h tiles of `cell` metres, origin = metres
//                 tiles: Uint8Array(w*h),               // 1 = floor, 0 = wall; index = j*w + i
//                 rooms: [ { i, j, w, h, kind } ],       // tiles; kind: entry|fight|key|miniboss|boss|reward|arrival
//                 entry: {x, z},                          // where you appear on this floor (metres)
//                 stairsDown?: {x, z}, stairsUp?: {x, z}, exit?: {x, z}, chest?: {x, z},
//                 packs: [ { x, z, count, rank: 'normal'|'elite'|'boss', level } ] } ] }

import { seedStream, int, next } from './rng.js';

const CELL = 2, W = 96, H = 96, GAP = 64;

function makeFloor(rng, index, kinds) {
  const tiles = new Uint8Array(W * H);
  const rooms = [];
  let tries = 0;
  while (rooms.length < kinds.length && tries++ < 4000) {
    const w = 7 + int(rng, 8), h = 7 + int(rng, 8);
    const i = 2 + int(rng, W - w - 4), j = 2 + int(rng, H - h - 4);
    if (rooms.some(r => i < r.i + r.w + 3 && r.i < i + w + 3 && j < r.j + r.h + 3 && r.j < j + h + 3)) continue;
    rooms.push({ i, j, w, h });
  }
  if (rooms.length < kinds.length) throw new Error('dungeon stand-in: could not place rooms');
  // order rooms into a chain by nearest neighbour so corridors stay short
  const chain = [rooms.shift()];
  while (rooms.length) {
    const last = chain[chain.length - 1];
    let bi = 0, bd = Infinity;
    rooms.forEach((r, k) => { const d = Math.abs(r.i - last.i) + Math.abs(r.j - last.j); if (d < bd) { bd = d; bi = k; } });
    chain.push(rooms.splice(bi, 1)[0]);
  }
  chain.forEach((r, k) => { r.kind = kinds[k]; });
  const carve = (i, j) => { if (i > 0 && j > 0 && i < W - 1 && j < H - 1) tiles[j * W + i] = 1; };
  for (const r of chain) for (let j = r.j; j < r.j + r.h; j++) for (let i = r.i; i < r.i + r.w; i++) carve(i, j);
  const mid = r => [r.i + (r.w >> 1), r.j + (r.h >> 1)];
  for (let k = 1; k < chain.length; k++) {
    const [ax, az] = mid(chain[k - 1]), [bx, bz] = mid(chain[k]);
    const xFirst = next(rng) < 0.5;
    const hLine = (i0, i1, j) => { for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) for (let d = -1; d <= 1; d++) carve(i, j + d); };
    const vLine = (j0, j1, i) => { for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) for (let d = -1; d <= 1; d++) carve(i + d, j); };
    if (xFirst) { hLine(ax, bx, az); vLine(az, bz, bx); } else { vLine(az, bz, ax); hLine(ax, bx, bz); }
  }
  const origin = { x: index * (W * CELL + GAP), z: 0 };
  const at = r => ({ x: origin.x + (r.i + r.w / 2) * CELL, z: origin.z + (r.j + r.h / 2) * CELL });
  return { index, origin, w: W, h: H, tiles, rooms: chain, at };
}

/** STAND-IN for E's dungeon-tiers.js: a 2-floor crypt. Same seed -> same dungeon. */
export function planDungeon(seed, { floors = 2, level = 3, family = 'crypt' } = {}) {
  const rng = seedStream(seed >>> 0, 'dungeon');
  const out = { family, level, seed, cell: CELL, floors: [], standIn: true };
  for (let f = 0; f < floors; f++) {
    const lastFloor = f === floors - 1;
    const kinds = f === 0 ? ['entry', 'fight', 'fight', 'key', 'miniboss']
      : lastFloor ? ['arrival', 'fight', 'fight', 'miniboss', 'boss', 'reward'] : ['arrival', 'fight', 'key', 'fight', 'miniboss'];
    const fl = makeFloor(rng, f, kinds);
    const lv = level + 2 * f;
    const packs = [];
    for (const r of fl.rooms) {
      const p = fl.at(r);
      if (r.kind === 'fight' || r.kind === 'key') packs.push({ x: p.x, z: p.z, count: 3 + int(rng, 2), rank: 'normal', level: lv, radius: Math.min(r.w, r.h) * CELL / 3 });
      else if (r.kind === 'miniboss') packs.push({ x: p.x, z: p.z, count: 1, rank: 'elite', level: lv + 1, radius: 1 });
      else if (r.kind === 'boss') packs.push({ x: p.x, z: p.z, count: 1, rank: 'boss', level: lv + 2, radius: 1 });
    }
    const first = fl.at(fl.rooms[0]);
    const floor = { index: f, origin: fl.origin, w: fl.w, h: fl.h, tiles: fl.tiles, rooms: fl.rooms, entry: { x: first.x, z: first.z }, packs };
    const mb = fl.rooms.find(r => r.kind === 'miniboss');
    if (!lastFloor) { const p = fl.at(mb); floor.stairsDown = { x: p.x + 3, z: p.z }; }
    if (f > 0) floor.stairsUp = { x: first.x - 3, z: first.z };
    if (f === 0) floor.exit = { x: first.x, z: first.z - 4 };
    if (lastFloor) {
      const rw = fl.at(fl.rooms.find(r => r.kind === 'reward'));
      floor.chest = { x: rw.x, z: rw.z };
      floor.exit = { x: rw.x + 4, z: rw.z };     // the loop-back exit to the entrance outside
    }
    out.floors.push(floor);
  }
  return out;
}

/** The plan as a terrain object: flat floors at y = 0; walls are not walkable. */
export function dungeonTerrain(plan) {
  const cell = plan.cell || CELL;
  const fl = plan.floors;
  const minX = Math.min(...fl.map(f => f.origin.x)), minZ = Math.min(...fl.map(f => f.origin.z));
  const maxX = Math.max(...fl.map(f => f.origin.x + f.w * cell)), maxZ = Math.max(...fl.map(f => f.origin.z + f.h * cell));
  function tileAt(x, z) {
    for (const f of fl) {
      const i = Math.floor((x - f.origin.x) / cell), j = Math.floor((z - f.origin.z) / cell);
      if (i >= 0 && j >= 0 && i < f.w && j < f.h) return f.tiles[j * f.w + i];
    }
    return 0;
  }
  return {
    key: null, kind: 'dungeon',
    heightAt: () => 0,
    walkable: (x, z) => tileAt(x, z) === 1,
    bounds: { minX, minZ, maxX, maxZ },
    size: Math.max(maxX - minX, maxZ - minZ), origin: { x: minX, z: minZ },
    spawn: { ...fl[0].entry },
  };
}

/** Run-length encode a 0/1 tile array: [run of 0s, run of 1s, run of 0s, …]. */
export function rleTiles(tiles) {
  const out = []; let cur = 0, n = 0;
  for (const t of tiles) { const v = t ? 1 : 0; if (v === cur) n++; else { out.push(n); cur = v; n = 1; } }
  out.push(n);
  return out;
}
export function unrleTiles(rle, size) {
  const t = new Uint8Array(size); let k = 0, v = 0;
  for (const n of rle) { if (v) t.fill(1, k, k + n); k += n; v ^= 1; }
  return t;
}

/** What the client needs to draw the dungeon (sent in joined.room.dungeon). */
export function describeDungeon(plan) {
  return {
    family: plan.family, level: plan.level, cell: plan.cell || CELL, standIn: !!plan.standIn,
    floors: plan.floors.map(f => ({ index: f.index, origin: f.origin, w: f.w, h: f.h, tiles: rleTiles(f.tiles), rooms: f.rooms.map(r => ({ i: r.i, j: r.j, w: r.w, h: r.h, kind: r.kind })) })),
  };
}

/**
 * Camps and objects for createRoom. `exitTo` = { room, x, z } outside (where the exits lead).
 * Objects: stairs (portal inside the room), exits (portal to exitTo), the reward chest.
 */
export function dungeonRoomSpec(plan, { exitTo, type = 'wolf' } = {}) {
  const camps = [], objects = [];
  for (const f of plan.floors) {
    for (const p of f.packs) camps.push({ type, level: p.level, x: p.x, z: p.z, count: p.count, radius: p.radius || 4, respawnMs: Infinity, rank: p.rank });
    if (f.stairsDown) objects.push({ type: 'stairs', name: 'Stairs down', x: f.stairsDown.x, z: f.stairsDown.z, portal: { to: 'here', x: plan.floors[f.index + 1].entry.x, z: plan.floors[f.index + 1].entry.z } });
    if (f.stairsUp) objects.push({ type: 'stairs', name: 'Stairs up', x: f.stairsUp.x, z: f.stairsUp.z, portal: { to: 'here', x: plan.floors[f.index - 1].stairsDown.x - 3, z: plan.floors[f.index - 1].stairsDown.z } });
    if (f.exit) objects.push({ type: 'exit', name: 'Way out', x: f.exit.x, z: f.exit.z, portal: { to: exitTo.room, x: exitTo.x, z: exitTo.z } });
    if (f.chest) objects.push({ type: 'chest', name: 'Reward chest', x: f.chest.x, z: f.chest.z, chest: { tier: 'reward', level: plan.level + 2 * f.index + 2, key: 'reward' } });
  }
  return { camps, objects };
}
