// Oathwild dungeons — the seeded plan (brainstorm 2026-11-27-regions §3). Pure: no DOM, no fetch, seeded dice only.
//
//   planDungeon(spec, seed) → plan     spec = data/dungeons/<id>.json, seed = the world's dungeon seed
//   planToJSON(plan) / planFromJSON(j) a smaller JSON form (tile codes as row strings) and back
//
// The plan is a 2 m tile grid for the WHOLE dungeon in ONE coordinate space: every level of it is a set of rooms at
// its own floor height, and the levels are joined by long ramps inside the same grid (each lower level grows on from
// the bottom of the ramp), so there is never void between floors. Every room and corridor is spacious (owner rule:
// indoor scenes leave room for the camera to swing): rooms ≥ 16 m, big halls 30-60 m, corridors 6-8 m wide, ceilings
// ≥ 6 m (rooms 10-24 m). Columns in the pillared halls are 2-3 m thick and reach the ceiling, ≥ 6 m from each other
// and from the walls, so every lane between them is ≥ 6 m.
//
// Grid: tile (i, k) covers x ∈ [i·2, i·2+2), z ∈ [k·2, k·2+2); index = k·cols + i. Plan fields:
//   cells[]    tile codes (CODE in features.js): 0 rock, 1 floor, 2 chasm, 3 gate, 4 secret door
//   tiles[]    1 where a body may stand with every gate and secret door SHUT (the start state)
//   heights[]  floor height at the tile centre (ramps slope; a chasm keeps its rim height)
//   ceiling[]  ceiling height above that floor (0 for rock)
//   columns[]  { x, z, r, h, room }            rooms[]  { id, kind, level, rect:[x0,z0,x1,z1], y, ceiling, … }
//   corridors[] { id, a, b, rect, width, dir, ramp }   doors[] { id, room, corridor, at:[x,z], facing, width, kind }
//   entrances[] { id, at:[x,z], facing, level, room }  exits[] (same)   stairs[] { id, from, to, rect, axis, start, sign, len, y0, y1 }
//   features[] (features.js)   levels[] { n, name, monsterLevel, y, rooms:[ids] }
// Facing follows js/rules/combat.js: an angle a points along (sin a, cos a).
import { makeRng, hashStr } from '../../rules/farhold.js';
import { CODE, chasmStrip, sarcophagiFor, boneWallsFor, leverFor } from './features.js';

export const TILE = 2;
const MARGIN = 2;          // tiles of rock between two unrelated rooms / corridors (4 m walls)
const BORDER = 3;          // tiles of rock round the whole plan
const RAMP_TILES = 20;     // a ramp between levels: 40 m long (a 10 m drop is ~14°)

/** Room kinds: size ranges in metres, ceiling range, column pattern. */
export const ROOM_KINDS = {
  entrance:      { w: [18, 22], h: [18, 22], ceil: [10, 12] },
  crypt:         { w: [16, 22], h: [16, 22], ceil: [10, 12], sarcophagi: true },
  ossuary:       { w: [22, 30], h: [18, 26], ceil: [12, 16], boneWalls: true },
  chapel:        { w: [20, 26], h: [24, 30], ceil: [16, 20] },
  hall:          { w: [24, 36], h: [24, 36], ceil: [14, 18] },
  pillared_hall: { w: [40, 60], h: [30, 50], ceil: [20, 24], columns: 'grid' },
  goblin_den:    { w: [16, 24], h: [16, 24], ceil: [10, 12] },
  troll_pit:     { w: [36, 48], h: [36, 48], ceil: [18, 22], columns: 'ring' },
  boss_hall:     { w: [50, 60], h: [40, 50], ceil: [22, 24], columns: 'aisles' },
};
export const CORRIDOR_CEILING = [6.5, 8];
export const RAMP_CEILING = 9;

const DIR = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
const OPP = { E: 'W', W: 'E', S: 'N', N: 'S' };
export const DIR_FACING = { E: Math.PI / 2, W: -Math.PI / 2, S: 0, N: Math.PI };
const r2 = v => Math.round(v * 100) / 100;

/** The plan of one dungeon: the same spec + seed always gives the same plan. */
export function planDungeon(spec, seed = 1) {
  const base = ((seed >>> 0) ^ hashStr(spec.id || 'dungeon')) >>> 0;
  for (let attempt = 0; attempt < 120; attempt++) {
    const rng = makeRng((base + attempt * 7919) >>> 0);
    const laid = layOut(spec, rng);
    if (laid) return finish(spec, seed, attempt, laid, rng);
  }
  throw new Error(`planDungeon: could not lay out ${spec.id}`);
}

// ---------------------------------------------------------------- layout (rects in tiles)

function makeRoom(rs, L, li, rng, n) {
  const K = ROOM_KINDS[rs.kind];
  if (!K) throw new Error(`planDungeon: unknown room kind ${rs.kind}`);
  const pick = (range, want) => Math.max(8, Math.round((want ?? rng.range(range[0], range[1])) / TILE));
  return {
    id: rs.id || `L${li + 1}-${rs.kind}-${n}`, kind: rs.kind, level: li + 1, levelIndex: li,
    w: pick(K.w, rs.size?.[0]), h: pick(K.h, rs.size?.[1]),
    y: L.y ?? -li * 10, ceiling: r2(rs.ceiling ?? rng.range(K.ceil[0], K.ceil[1])),
    x: 0, z: 0, inDir: null, spec: rs,
  };
}
const inflate = (r, m) => ({ x: r.x - m, z: r.z - m, w: r.w + 2 * m, h: r.h + 2 * m });
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.h && b.z < a.z + a.h;

function layOut(spec, rng) {
  const rooms = [], corrs = [];
  const free = (rect, skip) => !rooms.some(r => !skip.includes(r) && hits(rect, r)) && !corrs.some(c => hits(rect, c.rect));
  function attach(P, C, { ramp = false, straight = false } = {}) {
    const dirs = straight ? [P.inDir] : rng.shuffle(Object.keys(DIR)).filter(d => d !== OPP[P.inDir]);
    for (const d of dirs) for (let t = 0; t < 6; t++) {
      const cw = ramp ? 4 : rng.int(3, 4), gl = ramp ? RAMP_TILES : rng.int(3, 6);
      const horiz = d === 'E' || d === 'W';
      const pa = horiz ? P.x : P.z, pl = horiz ? P.w : P.h, pb = horiz ? P.z : P.x, pw = horiz ? P.h : P.w;
      const cl = horiz ? C.w : C.h, cwid = horiz ? C.h : C.w;
      if (pw - 2 - cw < 0 || cwid - 2 - cw < 0) continue;
      const cb = pb + 1 + rng.int(0, pw - 2 - cw);                       // the corridor's side position
      const lo = cb + cw + 1 - cwid, hi = cb - 1;
      if (hi < lo) continue;
      const childB = rng.int(lo, hi);
      const fwd = d === 'E' || d === 'S';
      const ca = fwd ? pa + pl : pa - gl;                                // corridor start along the axis
      const childA = fwd ? pa + pl + gl : pa - gl - cl;
      const rect = horiz ? { x: ca, z: cb, w: gl, h: cw } : { x: cb, z: ca, w: cw, h: gl };
      const cr = horiz ? { x: childA, z: childB, w: C.w, h: C.h } : { x: childB, z: childA, w: C.w, h: C.h };
      if (!free(inflate(cr, MARGIN), [])) continue;
      const side = horiz ? { x: rect.x, z: rect.z - MARGIN, w: rect.w, h: rect.h + 2 * MARGIN } : { x: rect.x - MARGIN, z: rect.z, w: rect.w + 2 * MARGIN, h: rect.h };
      if (!free(side, [P])) continue;
      C.x = cr.x; C.z = cr.z; C.inDir = d; C.parent = P.id;
      rooms.push(C);
      corrs.push({ id: `c-${P.id}-${C.id}`, a: P.id, b: C.id, rect, width: cw, dir: d, ramp: ramp ? { y0: P.y, y1: C.y } : null,
        ceiling: ramp ? RAMP_CEILING : r2(rng.range(CORRIDOR_CEILING[0], CORRIDOR_CEILING[1])),
        level: C.level, gate: C.spec.gate ? `gate-${C.id}` : null, secret: C.spec.secret ? `secret-${C.id}` : null });
      return true;
    }
    return false;
  }
  let prev = null, n = 0;
  for (const [li, L] of spec.levels.entries()) {
    const levelRooms = [];
    for (const rs of L.rooms) {
      const room = makeRoom(rs, L, li, rng, n++);
      if (!prev) { room.x = -Math.floor(room.w / 2); room.z = -Math.floor(room.h / 2); rooms.push(room); }
      else if (!attach(prev, room, { ramp: prev.levelIndex !== li, straight: !!prev.spec.chasm })) return null;
      levelRooms.push(room); prev = room;
    }
    for (const bs of L.branches || []) {
      const room = makeRoom(bs, L, li, rng, n++);
      const parents = bs.after ? [rooms.find(r => r.id === bs.after)].filter(Boolean)
        : rng.shuffle(levelRooms.filter(r => !r.spec.chasm && !r.spec.gate && !r.spec.secret && !r.spec.boss && !r.spec.wing && !r.spec.entrance));
      if (!parents.some(p => attach(p, room))) return null;
      levelRooms.push(room);
    }
  }
  return { rooms, corrs };
}

// ---------------------------------------------------------------- the grid, columns, features

function finish(spec, seed, attempt, { rooms, corrs }, rng) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of [...rooms, ...corrs.map(c => c.rect)]) { minX = Math.min(minX, r.x); minZ = Math.min(minZ, r.z); maxX = Math.max(maxX, r.x + r.w); maxZ = Math.max(maxZ, r.z + r.h); }
  const sx = BORDER - minX, sz = BORDER - minZ;
  for (const r of rooms) { r.x += sx; r.z += sz; }
  for (const c of corrs) { c.rect.x += sx; c.rect.z += sz; }
  const cols = maxX - minX + 2 * BORDER, rows = maxZ - minZ + 2 * BORDER, N = cols * rows;
  const cells = new Uint8Array(N), heights = new Float32Array(N), ceiling = new Float32Array(N);
  const idx = (i, k) => k * cols + i;
  const byId = new Map(rooms.map(r => [r.id, r]));
  const features = [], doors = [], stairs = [];
  // rooms
  for (const r of rooms) for (let k = r.z; k < r.z + r.h; k++) for (let i = r.x; i < r.x + r.w; i++) { const t = idx(i, k); cells[t] = CODE.FLOOR; heights[t] = r.y; ceiling[t] = r.ceiling; }
  // corridors (ramps slope from the upper room to the lower one)
  for (const c of corrs) {
    const R = c.rect, horiz = c.dir === 'E' || c.dir === 'W', fwd = c.dir === 'E' || c.dir === 'S';
    let ramp = null;
    if (c.ramp) {
      const start = (fwd ? (horiz ? R.x : R.z) : (horiz ? R.x + R.w : R.z + R.h)) * TILE;
      ramp = { id: `stair-${c.a}-${c.b}`, from: byId.get(c.a).level, to: byId.get(c.b).level, rect: rectM(R), axis: horiz ? 'x' : 'z',
        start, sign: fwd ? 1 : -1, len: (horiz ? R.w : R.h) * TILE, y0: c.ramp.y0, y1: c.ramp.y1, tiles: R };
      stairs.push(ramp);
    }
    for (let k = R.z; k < R.z + R.h; k++) for (let i = R.x; i < R.x + R.w; i++) {
      const t = idx(i, k);
      cells[t] = CODE.FLOOR; ceiling[t] = c.ceiling;
      heights[t] = ramp ? rampY(ramp, (i + 0.5) * TILE, (k + 0.5) * TILE) : byId.get(c.a).y;
    }
    // a door at each end, on the room's wall line
    const mid = horiz ? (R.z + R.h / 2) * TILE : (R.x + R.w / 2) * TILE;
    const endA = (fwd ? (horiz ? R.x : R.z) : (horiz ? R.x + R.w : R.z + R.h)) * TILE;
    const endB = (fwd ? (horiz ? R.x + R.w : R.z + R.h) : (horiz ? R.x : R.z)) * TILE;
    const pt = a => horiz ? [r2(a), r2(mid)] : [r2(mid), r2(a)];
    doors.push({ id: `door-${c.id}-a`, room: c.a, corridor: c.id, at: pt(endA), facing: DIR_FACING[c.dir], width: c.width * TILE, kind: c.secret ? 'secret' : 'open' });
    doors.push({ id: `door-${c.id}-b`, room: c.b, corridor: c.id, at: pt(endB), facing: DIR_FACING[OPP[c.dir]], width: c.width * TILE, kind: c.gate ? 'gate' : 'open' });
    // a gate: the corridor's last row before the room; a secret door: its first row out of the parent room
    const rowTiles = atStart => { const out = []; const a = atStart === fwd ? (horiz ? R.x : R.z) : (horiz ? R.x + R.w - 1 : R.z + R.h - 1);
      for (let b = 0; b < (horiz ? R.h : R.w); b++) out.push(horiz ? idx(a, R.z + b) : idx(R.x + b, a)); return out; };
    if (c.gate) {
      const tiles = rowTiles(false); for (const t of tiles) cells[t] = CODE.GATE;
      features.push({ id: c.gate, kind: 'gate', room: c.b, corridor: c.id, tiles, at: pt(endB - (fwd ? 1 : -1)), facing: DIR_FACING[c.dir], width: c.width * TILE, lever: byId.get(c.b).spec.gate.lever, open: false });
    }
    if (c.secret) {
      const tiles = rowTiles(true); for (const t of tiles) cells[t] = CODE.SECRET;
      features.push({ id: c.secret, kind: 'secret', room: c.b, from: c.a, corridor: c.id, tiles, at: pt(endA + (fwd ? 1 : -1)), facing: DIR_FACING[c.dir], width: c.width * TILE, open: false });
    }
  }
  // chasms (with one bridge), columns, sarcophagi, bone walls, levers
  const columns = [];
  for (const r of rooms) {
    const K = ROOM_KINDS[r.kind];
    let chasm = null;
    if (r.spec.chasm) {
      chasm = chasmStrip(r, rng);
      for (let k = chasm.tiles.z; k < chasm.tiles.z + chasm.tiles.h; k++) for (let i = chasm.tiles.x; i < chasm.tiles.x + chasm.tiles.w; i++) {
        const b = chasm.bridgeTiles;
        if (i >= b.x && i < b.x + b.w && k >= b.z && k < b.z + b.h) continue;
        cells[idx(i, k)] = CODE.CHASM;
      }
      features.push({ id: `chasm-${r.id}`, kind: 'chasm', room: r.id, rect: rectM(chasm.tiles), depth: 30, bridge: { id: `bridge-${r.id}`, rect: rectM(chasm.bridgeTiles), y: r.y } });
    }
    if (K.columns) columns.push(...columnsFor(r, K.columns, rng, chasm));
    if (K.sarcophagi) features.push(...sarcophagiFor(r, rng, doors.filter(d => d.room === r.id), !!r.spec.hoard));
    if (K.boneWalls) features.push(...boneWallsFor(r, doors.filter(d => d.room === r.id)));
  }
  for (const g of features.filter(f => f.kind === 'gate')) {
    const room = byId.get(g.lever);
    if (!room) throw new Error(`planDungeon: gate ${g.id} names lever room ${g.lever}, which is not in the plan`);
    features.push(leverFor(room, g, doors.filter(d => d.room === room.id)));
  }
  // entrances (where a hero arrives) and exits: at the far side of the room from its first door, facing that door
  const entrances = [], exits = [];
  const farSpot = r => {
    const d = doors.find(x => x.room === r.id);
    const [x0, z0, x1, z1] = rectM(r), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let dx = cx - d.at[0], dz = cz - d.at[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const reach = Math.abs(dx) > Math.abs(dz) ? (x1 - x0) / 2 - 5 : (z1 - z0) / 2 - 5;
    const at = [r2(cx + dx * reach), r2(cz + dz * reach)];
    return { at, facing: r2(Math.atan2(d.at[0] - at[0], d.at[1] - at[1])), level: r.level, room: r.id };
  };
  for (const r of rooms) {
    if (r.spec.entrance) entrances.push({ id: r.spec.entrance, ...farSpot(r), collapsed: !!r.spec.collapsed });
    if (r.spec.exit) exits.push({ id: r.spec.exit, ...farSpot(r) });
  }
  // the walkable start state: floor tiles not inside a column
  const tiles = new Array(N).fill(0);
  for (let t = 0; t < N; t++) tiles[t] = cells[t] === CODE.FLOOR ? 1 : 0;
  for (const c of columns) forTilesInCircle(cols, rows, c.x, c.z, c.r, t => { const i = t % cols, k = (t / cols) | 0; if (Math.hypot((i + 0.5) * TILE - c.x, (k + 0.5) * TILE - c.z) < c.r) tiles[t] = 0; });
  const levels = spec.levels.map((L, li) => ({ n: li + 1, name: L.name, monsterLevel: L.monsterLevel, y: L.y ?? -li * 10, rooms: rooms.filter(r => r.levelIndex === li).map(r => r.id) }));
  return {
    id: spec.id, name: spec.name, seed, attempt, tile: TILE, cols, rows, origin: [0, 0],
    cells: Array.from(cells), tiles, heights: Array.from(heights, r2), ceiling: Array.from(ceiling, r2),
    columns, levels,
    rooms: rooms.map(r => ({ id: r.id, kind: r.kind, level: r.level, rect: rectM(r), tiles: { x: r.x, z: r.z, w: r.w, h: r.h }, y: r.y, ceiling: r.ceiling,
      inDir: r.inDir, parent: r.parent || null, wing: r.spec.wing || null, gate: !!r.spec.gate, secret: !!r.spec.secret, chasm: !!r.spec.chasm,
      boss: !!r.spec.boss, entrance: r.spec.entrance || null, exit: r.spec.exit || null, hoard: !!r.spec.hoard })),
    corridors: corrs.map(c => ({ id: c.id, a: c.a, b: c.b, rect: rectM(c.rect), tiles: c.rect, width: c.width * TILE, dir: c.dir, level: c.level, ceiling: c.ceiling, ramp: !!c.ramp, gate: c.gate, secret: c.secret })),
    doors, entrances, exits, stairs, features,
  };
}

const rectM = r => [r.x * TILE, r.z * TILE, (r.x + r.w) * TILE, (r.z + r.h) * TILE];
/** Floor height on a ramp at (x, z). */
export function rampY(s, x, z) {
  const c = s.axis === 'x' ? x : z;
  const t = Math.max(0, Math.min(1, s.sign * (c - s.start) / s.len));
  return s.y0 + (s.y1 - s.y0) * t;
}
export function forTilesInCircle(cols, rows, x, z, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r) / TILE)), i1 = Math.min(cols - 1, Math.floor((x + r) / TILE));
  const k0 = Math.max(0, Math.floor((z - r) / TILE)), k1 = Math.min(rows - 1, Math.floor((z + r) / TILE));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * cols + i);
}

/** Columns 2-3 m thick in rows, ≥ 6 m from the walls and from each other (so every lane is ≥ 6 m), up to the ceiling. */
function columnsFor(r, pattern, rng, chasm) {
  const rad = r2(rng.range(1.0, 1.5));
  const inset = 6 + rad + 0.5;
  const s = r2(Math.max(2 * rad + 6.5, rng.range(10, 12.5)));
  const [x0, z0, x1, z1] = rectM(r), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const line = (lo, hi, c) => { const avail = hi - lo - 2 * inset; if (avail < 0) return []; const n = Math.floor(avail / s) + 1; return Array.from({ length: n }, (_, j) => c + (j - (n - 1) / 2) * s); };
  const xs = line(x0, x1, cx), zs = line(z0, z1, cz);
  const out = [];
  const alongX = r.inDir === 'E' || r.inDir === 'W';
  for (const [a, x] of xs.entries()) for (const [b, z] of zs.entries()) {
    if (pattern === 'ring' && Math.hypot(x - cx, z - cz) < 12) continue;                  // the troll's open floor
    if (pattern === 'aisles' && (alongX ? (b !== 0 && b !== zs.length - 1) : (a !== 0 && a !== xs.length - 1))) continue;   // a nave down the middle
    if (chasm) { const [qx0, qz0, qx1, qz1] = rectM(chasm.tiles); if (x > qx0 - rad - 3 && x < qx1 + rad + 3 && z > qz0 - rad - 3 && z < qz1 + rad + 3) continue; }
    out.push({ x: r2(x), z: r2(z), r: rad, h: r.ceiling, room: r.id });
  }
  return out;
}

// ---------------------------------------------------------------- a smaller JSON form

/** Tile codes as one string per row; everything else as is. planFromJSON(planToJSON(p)) deep-equals p. */
export function planToJSON(plan) {
  const rowsOf = arr => Array.from({ length: plan.rows }, (_, k) => arr.slice(k * plan.cols, (k + 1) * plan.cols).join(''));
  return { ...plan, cells: rowsOf(plan.cells), tiles: rowsOf(plan.tiles), format: 'dungeon-plan-1' };
}
export function planFromJSON(j) {
  if (j.format !== 'dungeon-plan-1') return j;
  const flat = rows => rows.join('').split('').map(Number);
  const { format, ...rest } = j;
  return { ...rest, cells: flat(j.cells), tiles: flat(j.tiles) };
}
