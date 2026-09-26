// Room kits (docs/09 §4.2, REVIEW B10): parametric generators that write a room in the same JSON format as
// hand-authored rooms, from a seed, the act's materials/theme and its spawn table. Every kit room has an
// entry 'w' on the left (exit back = @prev), and one or two exits on the right (e0 -> @next, e1 -> @next:1).
// Geometry stays inside the movement budget (jump apex 34, running gap 44) so room-check's reach bot passes.
import { createRng, hashSeed } from '../core/rng.js';

const B = 8; // block size
const ACT_STYLE = {
  act1: { wall: '#', floor: 'B', accent: 'x', soft: 'x', theme: 'crown_streets', traps: ['trap_spikes', 'trap_waxdrip', 'trap_flamejet'], liquid: 'q' },
  act2: { wall: 'B', floor: 'B', accent: 'r', soft: 'd', theme: 'gutter_tunnels', traps: ['trap_spikes', 'trap_crusher', 'trap_darts'], liquid: '~' },
  act3: { wall: 'B', floor: '#', accent: 'm', soft: 'i', theme: 'sluice_vault', traps: ['trap_spikes', 'trap_icicle'], liquid: '~' },
  act4: { wall: '#', floor: '#', accent: 'g', soft: 'd', theme: 'blackwater', traps: ['trap_flamejet', 'trap_darts', 'trap_spikes'], liquid: 'o' },
  act5: { wall: 'M', floor: '#', accent: 'M', soft: 'r', theme: 'bellwell', traps: ['trap_crusher', 'trap_spikes'], liquid: '~' },
  act6: { wall: 'c', floor: 'c', accent: 'c', soft: 's', theme: 'cloudroot', traps: ['trap_icicle', 'trap_spikes'], liquid: '~' },
};

export const KITS = ['fight_small', 'fight_tall', 'shaft', 'bridge_gap', 'flooded_hall', 'corridor_run'];

/**
 * @param kit    one of KITS
 * @param opts   { id, act, seed, exits: 1|2, spawnTable: [{id, w, group}], budget, name, dark, pinned: [thing] }
 */
export function generateKitRoom(kit, opts) {
  const rng = createRng(hashSeed(opts.seed ?? 1, kit, 'layout')), spawnRng = createRng(hashSeed(opts.seed ?? 1, kit, 'spawn')), propRng = createRng(hashSeed(opts.seed ?? 1, kit, 'props'));
  const st = ACT_STYLE[opts.act] || ACT_STYLE.act1;
  const G = GEN[kit] || GEN.fight_small;
  const room = G(rng, st, opts);
  room.format = 1; room.id = opts.id; room.name = opts.name || kitName(kit); room.act = opts.act; room.kind = kit === 'corridor_run' && opts.trap ? 'combat' : 'combat'; room.kit = kit; room.seed = opts.seed; room.theme = st.theme;
  room.rain = room.rain || { density: room.sky ? (opts.rainDensity ?? 80) : 0, wind: opts.wind ?? 0.15, maxDeposit: 3000 };
  if (opts.dark) room.tags = [...(room.tags || []), 'dark'];
  // spawns from the act table into the kit's spawn sockets, until the budget is spent
  placeSpawns(room, spawnRng, opts);
  // pots/crates and a chest sometimes
  if (propRng.chance(0.35) && room.sockets.floor.length) { const s = propRng.pick(room.sockets.floor); room.things.push({ t: 'crate', id: 'crate_1', at: [s[0], s[1]] }); }
  if (opts.chest && room.sockets.floor.length) { const s = room.sockets.floor[room.sockets.floor.length - 1]; room.things.push({ t: 'chest', id: 'chest_kit', at: [s[0] + 8, s[1]], loot: opts.chestLoot || `lt_${opts.act}_chest` }); }
  for (const t of opts.pinned || []) room.things.push(t);
  if (opts.kind) room.kind = opts.kind;
  if (opts.dress) opts.dress(room, propRng); // stand-ins for missing hand-made rooms place their things on the kit's floor sockets
  delete room.sockets; delete room.sky;
  return room;
}
function kitName(k) { return { fight_small: 'A Wet Yard', fight_tall: 'The Stacked Floors', shaft: 'A Drop', bridge_gap: 'The Gap', flooded_hall: 'A Flooded Hall', corridor_run: 'A Long Passage' }[k] || k; }

// ---------- helpers ----------
function grid(cols, rows, fill = '.') { return Array.from({ length: rows }, () => Array(cols).fill(fill)); }
function frame(m) { const R = m.length, C = m[0].length; for (let r = 0; r < R; r++) { m[r][0] = 'X'; m[r][C - 1] = 'X'; } for (let c = 0; c < C; c++) { m[R - 1][c] = 'X'; } }
function box(m, c0, r0, c1, r1, ch) { for (let r = Math.max(0, r0); r <= Math.min(m.length - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(m[0].length - 1, c1); c++) m[r][c] = ch; }
function open(m, c0, r0, c1, r1) { box(m, c0, r0, c1, r1, '.'); }
function strs(m) { return m.map(r => r.join('')); }
function doorLeft(m, rFloor, h = 3) { open(m, 0, rFloor - h, 1, rFloor - 1); }
function doorRight(m, rFloor, h = 3) { const C = m[0].length; open(m, C - 2, rFloor - h, C - 1, rFloor - 1); }
function base(W, H, things, sky) { return { size: [W, H], block: B, map: null, ops: [], things, wires: [], decor: {}, sockets: { floor: [], air: [] }, sky }; }
function exitsFor(room, W, entryRow, exitRows, opts) {
  const e = entryRow * B;
  room.things.push({ t: 'entry', id: 'w', at: [12, e - 1], face: 'r' });
  room.things.push({ t: 'exit', id: 'exit_back', rect: [0, e - 3 * B, 3, 3 * B], to: '@prev', entry: 'e' });
  exitRows.slice(0, Math.max(1, opts.exits || 1)).forEach((r, k) => {
    room.things.push({ t: 'exit', id: `exit_e${k}`, rect: [W - 3, r * B - 3 * B, 3, 3 * B], to: k ? `@next:${k}` : '@next', entry: 'w' });
    if (k === 0) room.things.push({ t: 'entry', id: 'e', at: [W - 14, r * B - 1], face: 'l' });
  });
}
/** A second exit high on the right, with two 24-cell steps up to it (the jump apex is 34). */
function upperExit(m, floor, st) {
  const C = m[0].length, r = floor - 6;
  box(m, C - 13, r, C - 2, r, st.wall);           // the exit ledge
  box(m, C - 21, floor - 3, C - 15, floor - 3, st.wall); // a step half way
  open(m, C - 13, r - 4, C - 2, r - 1); doorRight(m, r);
  return r;
}
function lights(room, rng, W, H, n, color = '#ffc46a') { for (let k = 0; k < n; k++) room.things.push({ t: 'light', id: `lt_${k}`, at: [Math.round(40 + rng.next() * (W - 80)), Math.round(40 + rng.next() * (H * 0.5))], color, r: 60 + Math.round(rng.next() * 30), intensity: 0.8, shadow: true, flicker: 0.08 }); }

// ---------- the six generators ----------
const GEN = {
  fight_small(rng, st, opts) {
    const C = 60, R = 34, m = grid(C, R, '.'); const sky = rng.chance(0.6);
    for (let r = 0; r < 3; r++) for (let c = 0; c < C; c++) m[r][c] = sky ? ':' : st.wall;
    const floor = 28 + rng.int(-1, 1); box(m, 0, floor, C - 1, R - 1, st.floor); frame(m);
    const W = C * B, H = R * B, room = base(W, H, [], sky);
    // 2-3 ledges
    const n = rng.int(2, 3); for (let k = 0; k < n; k++) { const c0 = 8 + k * 16 + rng.int(-2, 2), w = rng.int(6, 9), r = floor - rng.int(3, 4); box(m, c0, r, c0 + w, r, rng.chance(0.5) ? 'W' : st.wall); room.sockets.floor.push([(c0 + w / 2) * B, r * B - 1]); }
    // cover blocks
    for (let k = 0; k < rng.int(1, 3); k++) { const c = rng.int(12, C - 12); box(m, c, floor - 2, c + 1, floor - 1, st.accent); }
    doorLeft(m, floor); doorRight(m, floor);
    const exitRows = [floor]; if ((opts.exits || 1) > 1) exitRows.push(upperExit(m, floor, st));
    for (let c = 6; c < C - 6; c += 9) room.sockets.floor.push([c * B, floor * B - 1]);
    room.map = strs(m); exitsFor(room, W, floor, exitRows, opts); lights(room, rng, W, H, 2);
    return room;
  },
  fight_tall(rng, st, opts) {
    const C = 60, R = 68, m = grid(C, R, '.'); for (let r = 0; r < 2; r++) for (let c = 0; c < C; c++) m[r][c] = st.wall;
    box(m, 0, R - 5, C - 1, R - 1, st.floor); frame(m);
    const W = C * B, H = R * B, room = base(W, H, [], false);
    // 4 floors with gaps alternating sides; stepping ledges in the gaps
    const floors = [R - 5, R - 18, R - 31, R - 44]; floors.forEach((r, k) => { if (k === 0) return; const gapLeft = k % 2 === 1; if (gapLeft) box(m, 12, r, C - 1, r, st.wall); else box(m, 0, r, C - 13, r, st.wall);
      const gc = gapLeft ? 5 : C - 8; for (let s = 1; s <= 2; s++) box(m, gc - 1, r + s * 4, gc + 2, r + s * 4, 'W'); });
    floors.forEach(r => { for (let c = 8; c < C - 8; c += 12) room.sockets.floor.push([c * B, r * B - 1]); });
    const entryRow = floors[3]; doorLeft(m, entryRow);
    const exitRows = [floors[0]]; doorRight(m, floors[0]); if ((opts.exits || 1) > 1) { doorRight(m, floors[2]); exitRows.push(floors[2]); }
    room.map = strs(m); exitsFor(room, W, entryRow, exitRows, opts); lights(room, rng, W, H, 3);
    return room;
  },
  shaft(rng, st, opts) {
    const C = 60, R = 68, m = grid(C, R, '.'); box(m, 0, R - 5, C - 1, R - 1, st.floor);
    // walls closing in: a central drop between two rock masses with ledges
    box(m, 0, 0, 16, R - 1, st.wall); box(m, C - 17, 0, C - 1, R - 1, st.wall); open(m, 17, 0, C - 18, R - 5); frame(m);
    const W = C * B, H = R * B, room = base(W, H, [], true); for (let c = 17; c < C - 17; c++) m[0][c] = ':';
    // entry corridor top-left, exit bottom-right
    const top = 10; open(m, 0, top - 4, 17, top - 1); box(m, 0, top, 17, top, st.floor);
    const bottom = R - 5; open(m, C - 18, bottom - 4, C - 1, bottom - 1);
    // alternating ledges down the shaft
    for (let k = 0; k < 9; k++) { const r = top + 5 + k * 5, left = k % 2 === 0; const c0 = left ? 17 : C - 26; box(m, c0, r, c0 + 8, r, rng.chance(0.3) ? 'W' : st.wall); room.sockets.floor.push([(c0 + 4) * B, r * B - 1]); }
    room.ops.push({ op: 'rope', from: [30 * B, 1], length: 200 }); // level ropes are climbable from Act 1 (07 §3.6)
    const exitRows = [bottom]; if ((opts.exits || 1) > 1) { const r = 30; open(m, C - 17, r - 4, C - 1, r - 1); box(m, C - 17, r, C - 1, r, st.floor); exitRows.push(r); }
    room.map = strs(m); exitsFor(room, W, top, exitRows, opts); room.things.find(t => t.id === 'w').at = [12, top * B - 1]; lights(room, rng, W, H, 3);
    return room;
  },
  bridge_gap(rng, st, opts) {
    const C = 120, R = 34, m = grid(C, R, '.'); for (let r = 0; r < 3; r++) for (let c = 0; c < C; c++) m[r][c] = ':';
    const floor = 26; box(m, 0, floor, 44, R - 1, st.floor); box(m, 76, floor, C - 1, R - 1, st.floor); frame(m);
    const W = C * B, H = R * B, room = base(W, H, [], true);
    // the gap: water below, and a way across by act: a wood bridge (can burn), stepping stones, or a rope
    box(m, 45, R - 4, 75, R - 2, st.floor); for (let r = floor + 4; r < R - 4; r++) for (let c = 45; c <= 75; c++) m[r][c] = st.liquid;
    const across = opts.act === 'act1' ? 'stones' : rng.pick(['bridge', 'stones', 'rope']);
    if (across === 'bridge') { box(m, 45, floor, 75, floor, 'W'); }
    else if (across === 'stones') { for (let c = 49; c <= 72; c += 6) box(m, c, floor - 1 - (c % 12 === 1 ? 1 : 0), c + 2, floor, st.wall); }
    else { box(m, 45, floor, 49, floor, 'W'); box(m, 71, floor, 75, floor, 'W'); room.ops.push({ op: 'rope', from: [60 * B, 3 * B], length: (floor - 6) * B }); box(m, 55, 2, 65, 3, st.wall); }
    for (let c = 6; c < 44; c += 10) room.sockets.floor.push([c * B, floor * B - 1]); for (let c = 80; c < C - 4; c += 10) room.sockets.floor.push([c * B, floor * B - 1]);
    doorLeft(m, floor); doorRight(m, floor); const exitRows = [floor]; if ((opts.exits || 1) > 1) exitRows.push(upperExit(m, floor, st));
    room.map = strs(m); exitsFor(room, W, floor, exitRows, opts); lights(room, rng, W, H, 3);
    return room;
  },
  flooded_hall(rng, st, opts) {
    const C = 120, R = 34, m = grid(C, R, '.'); for (let r = 0; r < 3; r++) for (let c = 0; c < C; c++) m[r][c] = st.wall;
    const floor = 28; box(m, 0, floor, C - 1, R - 1, st.floor); frame(m);
    const W = C * B, H = R * B, room = base(W, H, [], false);
    // a basin in the middle, walkways on both sides and a high path of ledges
    open(m, 30, floor, 90, floor + 3); const level = floor - (opts.act === 'act3' ? 1 : 0); for (let r = floor; r <= floor + 3; r++) for (let c = 30; c <= 90; c++) m[r][c] = '~';
    for (let c = 32; c < 88; c += 11) box(m, c, floor - 4, c + 4, floor - 4, st.wall);
    for (let c = 6; c < 28; c += 8) room.sockets.floor.push([c * B, floor * B - 1]); for (let c = 94; c < C - 4; c += 8) room.sockets.floor.push([c * B, floor * B - 1]);
    room.sockets.water = [[60 * B, (floor + 2) * B]];
    doorLeft(m, floor); doorRight(m, floor); const exitRows = [floor]; if ((opts.exits || 1) > 1) exitRows.push(upperExit(m, floor, st));
    room.map = strs(m); exitsFor(room, W, floor, exitRows, opts); lights(room, rng, W, H, 4, '#6fb0ff');
    return room;
  },
  corridor_run(rng, st, opts) {
    const C = 120, R = 34, m = grid(C, R, '.'); for (let r = 0; r < 4; r++) for (let c = 0; c < C; c++) m[r][c] = st.wall;
    const floor = 27; box(m, 0, floor, C - 1, R - 1, st.floor); frame(m);
    const W = C * B, H = R * B, room = base(W, H, [], false);
    // uneven floor steps and ceiling beams
    for (let c = 10; c < C - 10; c += rng.int(10, 16)) { const up = rng.chance(0.5); if (up) box(m, c, floor - 1, c + rng.int(4, 8), floor - 1, st.floor); else box(m, c, 4, c + 2, 4 + rng.int(2, 5), st.wall); }
    // traps from the act's list along the run
    const traps = st.traps; let tc = 22;
    while (tc < C - 20) { const t = rng.pick(traps); const x = tc * B; if (t === 'trap_spikes') { box(m, tc, floor, tc + 3, floor, st.floor); room.things.push({ t, id: `tr_${tc}`, rect: [x, floor * B - 4, 32, 4] }); open(m, tc, floor - 1, tc + 3, floor - 1); }
      else if (t === 'trap_flamejet') room.things.push({ t, id: `tr_${tc}`, at: [x, floor * B - 1], dir: 'u', len: 40, cycle: [1.2, 2.2] });
      else if (t === 'trap_waxdrip' || t === 'trap_icicle') room.things.push({ t, id: `tr_${tc}`, at: [x, 5 * B], mat: 'ice' });
      else if (t === 'trap_crusher') room.things.push({ t, id: `tr_${tc}`, rect: [x - 12, 4 * B, 24, (floor - 4) * B - 14] });
      else if (t === 'trap_darts') { room.things.push({ t, id: `tr_${tc}`, at: [x, floor * B - 6], dir: 'l' }); room.things.push({ t: 'plate', id: `pl_${tc}`, rect: [x - 60, floor * B - 2, 16, 2] }); room.wires.push({ from: `pl_${tc}`, to: `tr_${tc}`, do: 'pulse', when: 'on' }); }
      tc += rng.int(18, 26); }
    for (let c = 8; c < C - 4; c += 12) room.sockets.floor.push([c * B, floor * B - 1]);
    doorLeft(m, floor); doorRight(m, floor); const exitRows = [floor]; if ((opts.exits || 1) > 1) exitRows.push(upperExit(m, floor, st));
    room.map = strs(m); exitsFor(room, W, floor, exitRows, opts); lights(room, rng, W, H, 4);
    return room;
  },
};

function placeSpawns(room, rng, opts) {
  const table = opts.spawnTable || []; if (!table.length || opts.noEnemies) return;
  let budget = opts.budget ?? 8; const COST = { fodder: 1, standard: 2, heavy: 4 };
  const sockets = [...room.sockets.floor].filter(s => s[0] > 90); rng.shuffle(sockets); let k = 0;
  while (budget > 0 && sockets.length) {
    const pick = rng.weighted(table); const s = sockets[k++ % sockets.length]; const n = pick.group || 1;
    const cost = (COST[pick.tier] ?? 2) * (pick.group ? 0.5 : 1);
    room.things.push({ t: 'spawn', id: `sp_${k}`, enemy: pick.id, count: n, rect: [s[0] - 16, s[1] - 24, 32, 24], when: 'enter' });
    budget -= cost; if (k > 12) break;
  }
}
