// planInterior: from a building's footprint and type to rooms, doors, furniture and slots. Pure and seeded: no three, no
// clock, no Math.random, so it runs in the sim (the town knows where every bed is, drawn or not), in the page and in node.
//
//   const plan = planInterior({ id, kind, w, d, floors, units, doorX, garage, seed }, wiring)
//
// The frame is the building's own: x across, +z towards the street, origin at the middle of the footprint, y up from the
// ground floor. A plan holds:
//   rooms   { id, kind, lv, unit, x0, z0, x1, z1 }
//   walls   { lv, x0, z0, x1, z1, outer }        solid rectangles; a door is a gap in them, so a wall can never hide a door
//   doors   { id, lv, x, z, axis, w, h, kind, a, b, rect }   axis = the way the wall runs. a, b = room ids, 'out' = the street
//   windows { lv, x, z, axis, w }
//   furn    { id, kind, lv, room, x, z, w, d, h, turn, rect, solid }
//   slots   { i, kind, use, lv, unit, room, x, z, y, yaw, sx, sz }   x, z = where the body goes, sx, sz = where they stand to get there
//   floor   { i, lv, unit, room, x, z, yaw }     places to stand with nothing to use; in facing pairs (i ^ 1 is the mate)
//   things  { id, kind, lv, room, x, z, label }  wiring: switches, buttons, levers, plates, smoke alarms, sprinklers, the extinguisher (data/wiring.json)
//   lift    { x, z }, units [{ u, lv, side, rooms, door }]
//
// Rule 5 of the plan, "a door you can see is a door you can use", is this file's job: every door joins two rooms the nav
// grid can cross, and validate() is what the tests run over thousands of seeds.

import { GARAGE } from './parking.js';
import { canReach, outsideDoor } from './interior-nav.js';
import { hashString } from './rng.js';

export const WALL_T = 0.16, WALL_H = 2.75, FLOOR_H = 3.1, DOOR_W = 1.35, FRONT_W = 1.5, DOOR_H = 2.45, BODY_R = 0.4;

/** Indoors a body is drawn to clear a door: most at x1.1, the tall races less. `tall` = the body's height before any scale. */
export const DOOR_CLEAR = 2.35, WIDE_CLEAR = 1.12, INDOOR_SCALE = 1.1;
export const indoorScale = (tall, wide = 0) => Math.min(INDOOR_SCALE, DOOR_CLEAR / tall, wide ? WIDE_CLEAR / wide : 9);

/** Footprints for a town that gives none (fake-town.js). A real building brings its own. */
const DEFAULT_SIZE = { house: [12, 11, 1], apartment: [24, 16, 2], town_hall: [46, 34, 3], school: [46, 34, 3] };
const SHOP_SIZE = [16, 15, 2];

const rngOf = seed => { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const round = v => Math.round(v * 1000) / 1000;
const overlap = (a, b, gap = 0) => a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.z0 < b.z1 + gap && a.z1 > b.z0 - gap;
const rect = (x0, z0, x1, z1) => ({ x0: round(Math.min(x0, x1)), z0: round(Math.min(z0, z1)), x1: round(Math.max(x0, x1)), z1: round(Math.max(z0, z1)) });

// ---- rooms and doors ---------------------------------------------------------------------------------------------------

function newPlan(spec) {
  return { id: spec.id, kind: spec.kind, w: spec.w, d: spec.d, levels: 1, wallH: WALL_H, floorH: FLOOR_H, rooms: [], opens: [], doors: [], windows: [], furn: [], slots: [], floor: [], things: [], lift: null, units: [], keep: [], walls: [] };
}
function addRoom(P, kind, x0, z0, x1, z1, { lv = 0, unit = null } = {}) {
  const r = { id: `r${P.rooms.length}`, kind, lv, unit, ...rect(x0, z0, x1, z1) };
  P.rooms.push(r);
  return r;
}
/** The stretch two rooms share: which wall, and from where to where. */
function shared(a, b) {
  if (near(a.x1, b.x0) || near(a.x0, b.x1)) {
    const c = near(a.x1, b.x0) ? a.x1 : a.x0, lo = Math.max(a.z0, b.z0), hi = Math.min(a.z1, b.z1);
    return hi > lo ? { axis: 'z', c, lo, hi } : null;
  }
  if (near(a.z1, b.z0) || near(a.z0, b.z1)) {
    const c = near(a.z1, b.z0) ? a.z1 : a.z0, lo = Math.max(a.x0, b.x0), hi = Math.min(a.x1, b.x1);
    return hi > lo ? { axis: 'x', c, lo, hi } : null;
  }
  return null;
}
function addDoor(P, row) {
  const w = row.w, half = w / 2, d = { id: `d${P.doors.length}`, lv: 0, h: DOOR_H, kind: 'room', ...row, x: round(row.x), z: round(row.z) };
  d.rect = d.axis === 'x' ? rect(d.x - half, d.z - WALL_T, d.x + half, d.z + WALL_T) : rect(d.x - WALL_T, d.z - half, d.x + WALL_T, d.z + half);
  P.doors.push(d);
  // a door needs its swing and a way up to it: nothing may stand here
  P.keep.push({ lv: d.lv, ...(d.axis === 'x' ? rect(d.x - half - 0.35, d.z - 1.05, d.x + half + 0.35, d.z + 1.05) : rect(d.x - 1.05, d.z - half - 0.35, d.x + 1.05, d.z + half + 0.35)) });
  return d;
}
/** A door between two rooms. `at` asks for a place along the wall; the door is kept clear of the corners. */
function link(P, a, b, { w = DOOR_W, at = null, kind = 'room' } = {}) {
  const s = shared(a, b);
  if (!s) throw new Error(`plan ${P.id}: rooms ${a.kind} and ${b.kind} do not touch`);
  const min = s.lo + w / 2 + 0.1, max = s.hi - w / 2 - 0.1;
  if (max < min) throw new Error(`plan ${P.id}: no room for a door between ${a.kind} and ${b.kind}`);
  const p = Math.max(min, Math.min(max, at ?? (s.lo + s.hi) / 2));
  return addDoor(P, { lv: a.lv, x: s.axis === 'x' ? p : s.c, z: s.axis === 'x' ? s.c : p, axis: s.axis, w, a: a.id, b: b.id, kind });
}
function streetDoor(P, room, x, { w = FRONT_W, kind = 'front', closed = false, h = DOOR_H } = {}) {
  return addDoor(P, { lv: 0, x, z: P.d / 2, axis: 'x', w, h, a: 'out', b: room.id, kind, closed });
}
function open(P, a, b) { P.opens.push({ lv: a.lv, ...shared(a, b) }); }

/** Solid walls: every room edge, overlaps merged, doors and open-plan stretches cut out. */
function buildWalls(P) {
  const walls = [];
  const lines = new Map();
  const put = (lv, axis, c, lo, hi) => { const k = `${lv}|${axis}|${round(c)}`; if (!lines.has(k)) lines.set(k, { lv, axis, c: round(c), iv: [] }); lines.get(k).iv.push([lo, hi]); };
  for (const r of P.rooms) { put(r.lv, 'x', r.z0, r.x0, r.x1); put(r.lv, 'x', r.z1, r.x0, r.x1); put(r.lv, 'z', r.x0, r.z0, r.z1); put(r.lv, 'z', r.x1, r.z0, r.z1); }
  for (const L of lines.values()) {
    L.iv.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [lo, hi] of L.iv) { const m = merged[merged.length - 1]; if (m && lo <= m[1] + 1e-6) m[1] = Math.max(m[1], hi); else merged.push([lo, hi]); }
    const cuts = [];
    for (const d of P.doors) if (d.lv === L.lv && d.axis === L.axis && near(d.axis === 'x' ? d.z : d.x, L.c)) { const p = d.axis === 'x' ? d.x : d.z; cuts.push([p - d.w / 2, p + d.w / 2]); }
    for (const o of P.opens) if (o.lv === L.lv && o.axis === L.axis && near(o.c, L.c)) cuts.push([o.lo, o.hi]);
    cuts.sort((a, b) => a[0] - b[0]);
    const outer = L.axis === 'x' ? near(Math.abs(L.c), P.d / 2) : near(Math.abs(L.c), P.w / 2);
    for (const [lo0, hi0] of merged) {
      let lo = lo0 - WALL_T / 2; const hi = hi0 + WALL_T / 2;
      for (const [a, b] of cuts) {
        if (b <= lo || a >= hi) continue;
        if (a > lo + 0.01) walls.push(wallRow(L, lo, a, outer));
        lo = Math.max(lo, b);
      }
      if (hi > lo + 0.01) walls.push(wallRow(L, lo, hi, outer));
    }
  }
  P.walls = walls;
}
const wallRow = (L, lo, hi, outer) => ({ lv: L.lv, outer, axis: L.axis, ...(L.axis === 'x' ? rect(lo, L.c - WALL_T / 2, hi, L.c + WALL_T / 2) : rect(L.c - WALL_T / 2, lo, L.c + WALL_T / 2, hi)) });

function addWindows(P) {
  for (const r of P.rooms) {
    if (r.kind === 'wc' || r.kind === 'bath' || r.kind === 'vault') continue;
    for (const [axis, c, lo, hi, out] of [['x', r.z1, r.x0, r.x1, near(r.z1, P.d / 2)], ['x', r.z0, r.x0, r.x1, near(r.z0, -P.d / 2)], ['z', r.x1, r.z0, r.z1, near(r.x1, P.w / 2)], ['z', r.x0, r.z0, r.z1, near(r.x0, -P.w / 2)]]) {
      if (!out || hi - lo < 2.2) continue;
      const n = Math.max(1, Math.floor((hi - lo) / 3));
      for (let k = 0; k < n; k++) {
        const p = lo + (k + 0.5) * (hi - lo) / n, x = axis === 'x' ? p : c, z = axis === 'x' ? c : p;
        if (P.doors.some(d => d.lv === r.lv && d.axis === axis && Math.hypot(d.x - x, d.z - z) < d.w / 2 + 0.9)) continue;
        P.windows.push({ lv: r.lv, x: round(x), z: round(z), axis, w: 1.3 });
      }
    }
  }
}

// ---- furniture ---------------------------------------------------------------------------------------------------------

/** kind: [width along the wall, depth out of it, height]. Slots are written by `mount`. */
const SIZE = {
  bed2: [1.7, 2.1, 0.55], bed1: [1, 2.1, 0.55], bunk: [1, 2.1, 1.75], wardrobe: [1.3, 0.6, 2.05], nightstand: [0.5, 0.45, 0.5], desk: [1.15, 0.65, 0.76],
  sofa: [2.3, 0.9, 0.8], tv: [1.5, 0.4, 0.95], stove: [0.7, 0.65, 0.92], fridge: [0.8, 0.72, 1.85], worktop: [1.5, 0.65, 0.92], sink: [0.9, 0.65, 0.92],
  toilet: [0.75, 0.75, 0.8], shower: [1.05, 1.05, 2.1], basin: [0.65, 0.5, 0.88], cabinet: [1, 0.45, 1.1], shelf: [2.6, 0.55, 1.75], rack: [2, 0.6, 1.6], fridgewall: [2.2, 0.7, 1.95],
  till: [1.6, 0.7, 0.95], barcounter: [4, 0.7, 1.05], bench: [2, 0.8, 0.9], locker: [1.6, 0.5, 1.9], plant: [0.5, 0.5, 1.2], boxes: [1.2, 0.8, 1.1], reception: [2.2, 0.7, 1.05], coffee: [0.9, 0.5, 0.42], washer: [0.7, 0.65, 0.9],
};
const SIDES = ['n', 's', 'e', 'w'];
const shuffled = (list, rng) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
/** The room's own frame for a wall: where it runs, and which way "into the room" is. */
function wallOf(r, side) {
  const i = WALL_T / 2 + 0.02;
  if (side === 'n') return { ox: r.x0 + i, oz: r.z0 + i, tx: 1, tz: 0, nx: 0, nz: 1, len: r.x1 - r.x0 - i * 2, deep: r.z1 - r.z0 - i * 2 };
  if (side === 's') return { ox: r.x1 - i, oz: r.z1 - i, tx: -1, tz: 0, nx: 0, nz: -1, len: r.x1 - r.x0 - i * 2, deep: r.z1 - r.z0 - i * 2 };
  if (side === 'e') return { ox: r.x1 - i, oz: r.z0 + i, tx: 0, tz: 1, nx: -1, nz: 0, len: r.z1 - r.z0 - i * 2, deep: r.x1 - r.x0 - i * 2 };
  return { ox: r.x0 + i, oz: r.z1 - i, tx: 0, tz: -1, nx: 1, nz: 0, len: r.z1 - r.z0 - i * 2, deep: r.x1 - r.x0 - i * 2 };
}
const yawOfNormal = (nx, nz) => Math.atan2(nx, nz);

function freeRect(P, q, lv, keep = true) {
  for (const f of P.furn) if (f.lv === lv && f.solid !== false && overlap(q, f.rect, 0.04)) return false;
  if (keep) for (const k of P.keep) if (k.lv === lv && overlap(q, k)) return false;
  return true;
}
/** Against a wall, sliding along it until it fits. front = the strip in front of it that must stay clear to use it. */
function placeWall(P, room, kind, { sides = SIDES, front = 0.85, rng, at = null, solid = true, size = null, pull = 0 } = {}) {
  const [w, d, h] = size || SIZE[kind];
  const order = rng ? shuffled(sides, rng) : sides;
  for (const side of order) {
    const W = wallOf(room, side);
    if (W.len < w || W.deep < d + front + pull) continue;
    const span = W.len - w, n = Math.max(1, Math.ceil(span / 0.2)), first = rng ? Math.floor(rng() * (n + 1)) : 0;
    for (let k = 0; k <= n; k++) {
      const s = (at != null ? at : ((first + k) % (n + 1)) / n) * span + w / 2;
      const cx = W.ox + W.tx * s + W.nx * (d / 2 + pull), cz = W.oz + W.tz * s + W.nz * (d / 2 + pull);
      const hx = (Math.abs(W.tx) * w + Math.abs(W.nx) * d) / 2, hz = (Math.abs(W.tz) * w + Math.abs(W.nz) * d) / 2;
      const q = rect(cx - hx, cz - hz, cx + hx, cz + hz);
      const fx = cx + W.nx * (d / 2 + front / 2), fz = cz + W.nz * (d / 2 + front / 2), fw = (Math.abs(W.tx) * w + Math.abs(W.nx) * front) / 2, fh = (Math.abs(W.tz) * w + Math.abs(W.nz) * front) / 2;
      const strip = rect(fx - fw, fz - fh, fx + fw, fz + fh);
      if (!freeRect(P, q, room.lv) || !freeRect(P, strip, room.lv, false)) { if (at != null) break; continue; }
      return commit(P, room, kind, cx, cz, w, d, h, W, q, strip, solid);
    }
  }
  return null;
}
function commit(P, room, kind, cx, cz, w, d, h, W, q, strip, solid) {
  const f = { id: `f${P.furn.length}`, kind, lv: room.lv, room: room.id, unit: room.unit, x: round(cx), z: round(cz), w, d, h, nx: W.nx, nz: W.nz, tx: W.tx, tz: W.tz, yaw: round(yawOfNormal(W.nx, W.nz)), rect: q, solid };
  P.furn.push(f);
  if (strip) P.keep.push({ lv: room.lv, ...strip });
  return f;
}
/** Out in the room, facing +z unless told otherwise. */
function placeAt(P, room, kind, cx, cz, { size = null, nx = 0, nz = 1, around = 0 } = {}) {
  const [w, d, h] = size || SIZE[kind], tx = nz, tz = -nx, hx = (Math.abs(tx) * w + Math.abs(nx) * d) / 2, hz = (Math.abs(tz) * w + Math.abs(nz) * d) / 2, q = rect(cx - hx, cz - hz, cx + hx, cz + hz);
  const pad = rect(q.x0 - around, q.z0 - around, q.x1 + around, q.z1 + around);
  if (q.x0 < room.x0 + 0.1 || q.x1 > room.x1 - 0.1 || q.z0 < room.z0 + 0.1 || q.z1 > room.z1 - 0.1) return null;
  if (!freeRect(P, pad, room.lv)) return null;
  return commit(P, room, kind, cx, cz, w, d, h, { nx, nz, tx, tz }, q, null, true);
}

/** A slot on a piece: `along` metres along it, `out` metres out from its front. */
function slot(P, f, kind, { use = kind, along = 0, out = 0.42, y = 0, stand = null, face = 0, inset = null } = {}) {
  const fx = f.x + f.tx * along + f.nx * (f.d / 2 + out), fz = f.z + f.tz * along + f.nz * (f.d / 2 + out);
  const x = inset == null ? fx : f.x + f.tx * along + f.nx * inset, z = inset == null ? fz : f.z + f.tz * along + f.nz * inset;
  const s = stand || [fx, fz], yaw = yawOfNormal(f.nx, f.nz) + face;
  const row = { i: P.slots.length, kind, use, lv: f.lv, unit: f.unit ?? null, room: f.room, x: round(x), z: round(z), y, yaw: round(yaw), sx: round(s[0]), sz: round(s[1]), furn: f.id };
  P.slots.push(row);
  return row;
}
const need = (P, f, what) => { if (!f) throw new PlanMiss(`${P.id}: no room for ${what}`); return f; };
class PlanMiss extends Error {}

/** Beds stand with their heads to the back wall, the far side from the hall, so the door and the feet of the beds share the floor. */
function bedroom(P, room, beds, rng) {
  const wide = room.x1 - room.x0 - 0.2;
  const put = (kind, at) => {
    const f = placeWall(P, room, kind, { sides: ['n'], at, front: 0.85 });
    if (!f) return 0;
    const list = kind === 'bed2' ? [-0.42, 0.42] : kind === 'bunk' ? [0.1, -0.1] : [0];
    list.forEach((a, k) => {
      const stand = [f.x + f.tx * a * 1.1 + f.nx * (f.d / 2 + 0.5), f.z + f.tz * a * 1.1 + f.nz * (f.d / 2 + 0.5)];
      slot(P, f, 'bed', { use: kind === 'bunk' && k === 1 ? 'sleepTop' : 'sleep', along: a, inset: 0, y: kind === 'bunk' && k === 1 ? 1.3 : 0.56, stand, face: Math.PI });
    });
    return list.length;
  };
  const first = rng() < 0.5 ? 0 : 1;
  if (beds >= 3 && wide >= 3.5) return put('bed2', first) + put('bed1', 1 - first);
  if (beds >= 3 && wide >= 2.1) return put('bunk', first) + put('bunk', 1 - first);
  if (beds >= 2) return put(wide >= 2 ? 'bed2' : 'bunk', 0.5);
  return beds > 0 ? put('bed1', first) : 0;
}

function bathroom(P, room, rng) {
  const long = room.z1 - room.z0 > room.x1 - room.x0, ends = long ? ['n', 's'] : ['e', 'w'], sidesL = long ? ['e', 'w'] : ['n', 's'];
  const sh = need(P, placeWall(P, room, 'shower', { sides: ends, rng, front: 0.75 }), 'shower');
  slot(P, sh, 'shower', { use: 'wash', inset: 0, y: 0, stand: [sh.x + sh.nx * 1.05, sh.z + sh.nz * 1.05] });
  const t = need(P, placeWall(P, room, 'toilet', { sides: sidesL, rng, front: 0.75 }), 'toilet');
  slot(P, t, 'toilet', { use: 'toilet', inset: 0.08, y: 0.42, stand: [t.x + t.nx * (t.d / 2 + 0.45), t.z + t.nz * (t.d / 2 + 0.45)] });
  if (Math.min(room.x1 - room.x0, room.z1 - room.z0) >= 2.45) placeWall(P, room, 'basin', { sides: sidesL, rng, front: 0.6 });
}
function kitchen(P, room, rng, chairs = 4) {
  const sf = need(P, placeWall(P, room, 'stove', { rng, front: 0.8 }), 'stove');
  slot(P, sf, 'stove', { use: 'cook' });
  const fr = need(P, placeWall(P, room, 'fridge', { rng, front: 0.8 }), 'fridge');
  slot(P, fr, 'fridge', { use: 'snack' });
  const wide = room.x1 - room.x0, deep = room.z1 - room.z0;
  const sinks = () => { placeWall(P, room, 'sink', { rng, front: 0.75 }); placeWall(P, room, 'worktop', { rng, front: 0.75 }); };
  const tw = chairs > 4 ? 1.9 : 1.4, cx0 = (room.x0 + room.x1) / 2, cz0 = (room.z0 + room.z1) / 2;
  for (const [dx, dz] of [[0, 0], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5], [1, 0], [-1, 0], [0, 1], [0, -1], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9]]) {
    if (table(P, room, cx0 + dx * wide * 0.25, cz0 + dz * deep * 0.25, tw, 0.85, chairs)) { sinks(); return; }
  }
  // a small kitchen: chairs at a worktop
  const bar = need(P, placeWall(P, room, 'worktop', { rng, front: 0.85, size: [chairs * 0.62 + 0.1, 0.55, 0.92] }), 'breakfast bar');
  for (let i = 0; i < chairs; i++) slot(P, bar, 'chair', { use: 'eat', along: (i - (chairs - 1) / 2) * 0.62, out: 0.46, y: 0.45, face: Math.PI });
  sinks();
}
/** A table with chairs down its long sides. Chairs are not solid: you sit on them. */
function table(P, room, cx, cz, tw, td, chairs, { use = 'eat', kind = 'chair', tag = 'table', pad = 0.9 } = {}) {
  if (cz - td / 2 - 0.9 < room.z0 || cz + td / 2 + 0.9 > room.z1 || cx - tw / 2 - 0.3 < room.x0 || cx + tw / 2 + 0.3 > room.x1) return false;     // the chairs need the floor too
  const f = placeAt(P, room, tag, cx, cz, { size: [tw, td, 0.75], around: pad });
  if (!f) return false;
  const a = Math.ceil(chairs / 2), b = chairs - a, row = (n, sign) => { for (let i = 0; i < n; i++) { const along = n === 1 ? 0 : (i - (n - 1) / 2) * (tw / n), x = f.x + along, z = f.z + sign * (td / 2 + 0.44); const s = { i: P.slots.length, kind, use, lv: f.lv, unit: f.unit ?? null, room: f.room, x: round(x), z: round(z), y: 0.45, yaw: sign > 0 ? Math.PI : 0, sx: round(x), sz: round(z), furn: f.id }; P.slots.push(s); } };
  row(a, 1); row(b, -1);
  P.keep.push({ lv: f.lv, ...rect(cx - tw / 2 - 0.2, cz - td / 2 - 0.8, cx + tw / 2 + 0.2, cz + td / 2 + 0.8) });     // nothing goes where the chairs are
  return true;
}
function living(P, room, rng, { sofa = 3, desks = 0 } = {}) {
  const s = need(P, placeWall(P, room, 'sofa', { rng, front: 1 }), 'sofa');
  for (let i = 0; i < sofa; i++) slot(P, s, 'sofa', { use: 'sit', along: (i - (sofa - 1) / 2) * 0.72, inset: 0.06, y: 0.45, stand: [s.x + s.tx * (i - (sofa - 1) / 2) * 0.72 + s.nx * (s.d / 2 + 0.5), s.z + s.tz * (i - (sofa - 1) / 2) * 0.72 + s.nz * (s.d / 2 + 0.5)] });
  placeWall(P, room, 'tv', { rng, front: 0.4 });
  for (let i = 0; i < desks; i++) desk(P, room, rng);
}
function desk(P, room, rng, use = 'desk', kind = 'desk') {
  const f = placeWall(P, room, 'desk', { rng, front: 0.95 });
  if (!f) return null;
  slot(P, f, kind, { use, out: 0.46, y: 0.45, face: Math.PI });
  return f;
}

/** Live/kitchen in front, a hall across the middle, bedrooms and a bathroom behind. A house and a flat are this one layout. */
function home(P, x0, z0, x1, z1, { lv = 0, unit = null, entry, garage = 0, rng, caps, doorX = 0, flip = false }) {
  const W = x1 - x0, D = z1 - z0, back = Math.max(3.9, Math.min(4.6, D * 0.42)), hallD = 1.7;
  const zH0 = z0 + back, zH1 = zH0 + hallD;
  const beds = caps.bed ?? 6, o = { lv, unit };
  const mx = (a, b) => (flip ? [x0 + x1 - b, x0 + x1 - a] : [a, b]);
  // the back row: bedroom, bathroom, bedroom. Narrow plots swap the second bedroom's share
  const bathW = W < 9 ? 2.3 : 2.5, bedW = (W - bathW) / 2, jitter = (rng() - 0.5) * 0.5;
  const c0 = x0 + bedW + jitter, c1 = c0 + bathW;
  const A = addRoom(P, 'bedroom', ...splitX(mx(x0, c0), z0, zH0), o), bath = addRoom(P, 'bath', ...splitX(mx(c0, c1), z0, zH0), o), B = addRoom(P, 'bedroom', ...splitX(mx(c1, x1), z0, zH0), o);
  const hall = addRoom(P, 'hall', x0, zH0, x1, zH1, o);
  link(P, hall, A); link(P, hall, bath); link(P, hall, B);
  let frontL = x0, frontR = x1, gar = null;
  const garX = garage > 0 ? x1 - 3.5 : x0 + 3.5;
  if (garage) { gar = addRoom(P, 'garage', garage > 0 ? garX : x0, zH1, garage > 0 ? x1 : garX, z1, o); if (garage > 0) frontR = garX; else frontL = garX; }
  // living holds the street door, kitchen takes the rest
  const doorOnLeft = entry.side !== 'front' ? rng() < 0.5 : doorX < (frontL + frontR) / 2;
  let split = frontL + (frontR - frontL) * (doorOnLeft ? 0.56 : 0.44);
  if (entry.side === 'front') { if (doorOnLeft) split = Math.max(split, doorX + FRONT_W / 2 + 0.4); else split = Math.min(split, doorX - FRONT_W / 2 - 0.4); }
  split = Math.max(frontL + 3, Math.min(frontR - 3, split));
  if (entry.side === 'front') { if (doorOnLeft) split = Math.max(split, doorX + FRONT_W / 2 + 0.3); else split = Math.min(split, doorX - FRONT_W / 2 - 0.3); }
  const L = doorOnLeft ? addRoom(P, 'living', frontL, zH1, split, z1, o) : addRoom(P, 'living', split, zH1, frontR, z1, o);
  const K = doorOnLeft ? addRoom(P, 'kitchen', split, zH1, frontR, z1, o) : addRoom(P, 'kitchen', frontL, zH1, split, z1, o);
  link(P, L, hall, { w: 1.6 }); link(P, K, L, { w: 1.6 });
  if (gar) link(P, gar, hall.x0 <= gar.x0 ? (shared(gar, hall) ? hall : K) : K);
  let front = null;
  if (entry.side === 'front') front = streetDoor(P, L, doorX);
  if (gar) { P.garage = { door: streetDoor(P, gar, (gar.x0 + gar.x1) / 2, { w: GARAGE.doorW, kind: 'garage', closed: true, h: GARAGE.doorH }).id, room: gar.id }; placeWall(P, gar, 'boxes', { sides: ['n', 'e', 'w'], rng, front: 0.2 }); placeWall(P, gar, 'washer', { sides: ['n', 'e', 'w'], rng, front: 0.5 }); }
  return { hall, A, B, bath, L, K, front, beds, gar };
}
const splitX = ([a, b], z0, z1) => [a, z0, b, z1];
function dressHome(P, r, rng, caps) {
  const n = caps.bed ?? 6, a = Math.ceil(n / 2);
  let done = bedroom(P, r.A, a, rng);
  done += bedroom(P, r.B, n - done, rng);
  if (done < n) throw new PlanMiss('not enough beds');
  bathroom(P, r.bath, rng);
  kitchen(P, r.K, rng, caps.chair ?? 4);
  const desks = caps.desk ?? 1;
  living(P, r.L, rng, { sofa: caps.sofa ?? 3 });
  let got = 0;
  for (const room of [r.A, r.B, r.L, r.L, r.K]) if (got < desks && desk(P, room, rng)) got++;
  if (got < desks) throw new PlanMiss('desk');
  placeWall(P, r.A, 'wardrobe', { rng, front: 0.7 }); placeWall(P, r.B, 'wardrobe', { rng, front: 0.7 });
  placeWall(P, r.L, 'plant', { rng, front: 0.2 });
}

// ---- homes ---------------------------------------------------------------------------------------------------------------

function house(P, spec, rng, caps) {
  const w = P.w / 2, d = P.d / 2, r = home(P, -w, -d, w, d, { unit: 0, entry: { side: 'front' }, doorX: spec.doorX ?? 0, garage: spec.garage ?? 0, rng, caps, flip: rng() < 0.5 });
  dressHome(P, r, rng, caps);
  P.units.push({ u: 0, lv: 0, side: 0, rooms: P.rooms.map(x => x.id) });
}

/** Two flats a floor round a core with the lift; the ground floor's core is the lobby. */
function flats(P, spec, rng, caps) {
  const w = P.w / 2, d = P.d / 2, core = 3.6, floors = spec.floors, c0 = -core / 2, c1 = core / 2;
  P.levels = floors;
  P.lift = { x: 0, z: -d + 1.75 };
  const units = Math.max(2, spec.units ?? floors * 2), perFloor = 2, used = Math.ceil(units / perFloor);
  P.levels = Math.max(floors, used);
  for (let lv = 0; lv < P.levels; lv++) {
    const land = addRoom(P, lv ? 'landing' : 'lobby', c0, -d, c1, d, { lv });
    const shaft = placeAt(P, land, 'lift', 0, -d + 0.65, { size: [1.9, 1.0, WALL_H] });
    need(P, shaft, 'lift');
    for (let side = 0; side < perFloor; side++) {
      const u = lv * perFloor + side;
      if (u >= units) continue;
      const x0 = side ? c1 : -w, x1 = side ? w : c0, before = P.rooms.length;
      const r = home(P, x0, -d, x1, d, { lv, unit: u, entry: { side: 'core' }, rng, caps, flip: rng() < 0.5 });
      const door = link(P, r.hall, land, { kind: 'flat', w: DOOR_W });
      dressHome(P, r, rng, caps);
      P.units.push({ u, lv, side, door: door.id, rooms: P.rooms.slice(before).map(x => x.id) });
    }
    if (lv === 0) { streetDoor(P, land, 0); const b = placeWall(P, land, 'plant', { sides: ['e', 'w'], front: 0.2 }); void b; }
  }
}

// ---- places of trade -----------------------------------------------------------------------------------------------------

function backRooms(P, depth = 3.3, { wc = true } = {}) {
  const w = P.w / 2, d = P.d / 2, zb = -d + depth, wcW = 2.2;
  const hall = addRoom(P, 'floor', -w, zb, w, d);
  const stock = addRoom(P, 'stock', wc ? -w + wcW : -w, -d, w, zb);
  link(P, hall, stock, { at: rngCentre(stock) });
  let toilet = null;
  if (wc) { toilet = addRoom(P, 'wc', -w, -d, -w + wcW, zb); link(P, stock, toilet); const t = need(P, placeWall(P, toilet, 'toilet', { sides: ['n', 'w'], front: 0.75 }), 'toilet'); slot(P, t, 'toilet', { use: 'toilet', inset: 0.08, y: 0.42, stand: [t.x + t.nx * (t.d / 2 + 0.45), t.z + t.nz * (t.d / 2 + 0.45)] }); placeWall(P, toilet, 'basin', { sides: ['e', 's', 'n'], front: 0.6 }); }
  return { hall, stock, toilet };
}
const rngCentre = r => (r.x0 + r.x1) / 2;

function staff(P, room, n, { fix = 'bench', use = 'work', rng, front = 0.95, seat = false, sides } = {}) {
  let got = 0;
  for (let i = 0; i < n * 3 && got < n; i++) {
    const f = placeWall(P, room, fix, { rng, front, sides }) ?? null;
    if (!f) break;
    const each = fix === 'bench' || fix === 'shelf' || fix === 'locker' ? Math.min(n - got, 2) : 1;
    for (let k = 0; k < each; k++) { slot(P, f, 'work', { use, along: each > 1 ? (k - 0.5) * (f.w * 0.5) : 0, out: 0.46, y: seat ? 0.45 : 0, face: seat ? Math.PI : Math.PI }); got++; }
  }
  return got;
}
/** Rows of fixtures across a room. Each face of a fixture holds shoppers, one every 1.3 m. */
function aisles(P, room, want, { fix = 'shelf', use = 'browse', kind = 'counter', size = null, gap = 1.85 } = {}) {
  const [w, d] = size || SIZE[fix], made = [];
  let got = 0;
  const left = room.x0 + 1.35, right = room.x1 - 1.35, front = room.z1 - 2.4, back = room.z0 + 1.4;
  for (let z = back + d / 2; z < front && got < want; z += d + gap) {
    for (let x = left + w / 2; x + w / 2 <= right && got < want; x += w + 1.4) {
      const f = placeAt(P, room, fix, x, z, { size: size || undefined });
      if (!f) continue;
      made.push(f);
      for (const sign of [1, -1]) for (let a = -w / 2 + 0.55; a <= w / 2 - 0.5 && got < want; a += 1.3) {
        const sx = x + a, sz = z + sign * (d / 2 + 0.55);
        if (sz < room.z0 + 0.5 || sz > room.z1 - 0.5) continue;
        const r = { i: P.slots.length, kind, use, lv: 0, unit: null, room: room.id, x: round(sx), z: round(sz), y: 0, yaw: sign > 0 ? Math.PI : 0, sx: round(sx), sz: round(sz), furn: f.id };
        P.slots.push(r); got++;
      }
    }
  }
  return got;
}
function tillBy(P, room, doorX, rng, n = 1) {
  const f = need(P, placeWall(P, room, 'till', { sides: ['e', 'w', 's'], rng, front: 1.5 }) ?? null, 'till');
  const behind = n;
  for (let i = 0; i < behind; i++) slot(P, f, 'work', { use: 'till', out: -f.d - 0.15 + 0.6, along: i * 0.7, face: 0, stand: [f.x + f.nx * (f.d / 2 + 0.55) + f.tx * (i * 0.7), f.z + f.nz * (f.d / 2 + 0.55) + f.tz * (i * 0.7)] });
  void doorX;
  return f;
}

function seats(P, room, want, rng, { use = 'eat', pitchX = 2.9, pitchZ = 2.75, per = 4, tw = 1.3, td = 0.85, kind = 'counter' } = {}) {
  let got = 0;
  const left = room.x0 + 1.25, right = room.x1 - 1.25, back = room.z0 + 1.7, front = room.z1 - 2.1;
  const cols = Math.floor((right - left) / pitchX) + 1, rows = Math.ceil(want / per / Math.max(1, cols));
  pitchZ = Math.max(pitchZ, Math.min(4.4, (front - back) / Math.max(1, rows - 1)));
  for (let z = back; z <= front + 0.01 && got < want; z += pitchZ) for (let x = left; x <= right && got < want; x += pitchX) {
    const n = Math.min(per, want - got);
    if (table(P, room, x, z, tw, td, n, { use, kind, pad: 0.5 })) got += n;
  }
  return got;
}

function shop(P, spec, rng, caps) {
  const k = P.kind, { hall, stock } = backRooms(P, k === 'gym' ? 2.6 : 3.3), doorX = spec.doorX ?? 0, work = caps.work ?? 2, want = caps.counter ?? 8;
  streetDoor(P, hall, doorX);
  let fixedWork = 0;
  if (k === 'grocery' || k === 'boutique') {
    tillBy(P, hall, doorX, rng, Math.min(2, work)); fixedWork = Math.min(2, work);
    aisles(P, hall, want, k === 'grocery' ? { fix: 'shelf' } : { fix: 'rack' });
    if (k === 'grocery') placeWall(P, hall, 'fridgewall', { sides: ['n', 'e', 'w'], rng, front: 1 });
  } else if (k === 'cafe' || k === 'diner') {
    const c = need(P, placeWall(P, hall, 'barcounter', { sides: ['e', 'w'], rng, front: 1.1, size: [Math.min(5, hall.z1 - hall.z0 - 3), 0.7, 1.05] }), 'counter');
    const n = Math.min(work, 2); for (let i = 0; i < n; i++) slot(P, c, 'work', { use: 'till', along: (i - 0.5) * 1.2, stand: [c.x + c.nx * (c.d / 2 + 0.5) + c.tx * (i - 0.5) * 1.2, c.z + c.nz * (c.d / 2 + 0.5) + c.tz * (i - 0.5) * 1.2], out: 0.46, face: Math.PI }); fixedWork = n;
    seats(P, hall, want, rng);
    const left = work - fixedWork; fixedWork += staff(P, stock, left, { fix: 'stove', use: 'cook', rng, front: 0.85 });
  } else if (k === 'bar') {
    const c = need(P, placeWall(P, hall, 'barcounter', { sides: ['e', 'w'], rng, front: 1.5, size: [Math.min(7, hall.z1 - hall.z0 - 2.6), 0.7, 1.05] }), 'bar');
    const stools = Math.min(6, want);
    for (let i = 0; i < stools; i++) slot(P, c, 'counter', { use: 'sitBar', along: (i - (stools - 1) / 2) * 0.95, out: 0.46, y: 0.6, face: Math.PI });
    seats(P, hall, want - stools, rng, { use: 'sitBar' });
    fixedWork += staff(P, stock, work, { fix: 'bench', rng, front: 0.9 });
  } else if (k === 'gym') {
    fixedWork += staff(P, hall, 1, { fix: 'reception', use: 'till', rng, sides: ['e', 'w'] });
    aisles(P, hall, want, { fix: 'machine', size: [2.2, 0.9, 1.3], use: 'exercise' });
    fixedWork += staff(P, stock, work - fixedWork, { fix: 'bench', rng, front: 0.9 });
  }
  if (fixedWork < work) staff(P, stock, work - fixedWork, { fix: 'shelf', use: 'stack', rng, front: 0.85 });
  shutter(P);
}
/** A street door that rolls down at night. It is the same gap, so nothing about the door changes but whether it is shut. */
function shutter(P) { const d = P.doors.find(x => x.kind === 'front'); d.shutter = true; P.shutter = d.id; }

const WORKS = {
  office: { fix: 'desk', seat: true, use: 'type' }, school: { fix: 'desk', seat: true, use: 'type' }, clinic: { fix: 'bench', use: 'stack' }, police_station: { fix: 'desk', seat: true, use: 'type' }, town_hall: { fix: 'desk', seat: true, use: 'type' }, rift_lodge: { fix: 'desk', seat: true, use: 'type' },
  fire_station: { fix: 'bench', use: 'stack' }, garage: { fix: 'bench', use: 'stack' }, lumber_yard: { fix: 'bench', use: 'stack' }, sawmill: { fix: 'bench', use: 'stack' },
};
function deskField(P, room, n, W, rng) {
  // desks in rows, chair side clear
  let got = 0;
  const wide = SIZE[W.fix][0], pitchX = wide + 1.35, pitchZ = 2.25, left = room.x0 + 1.25 + wide / 2, right = room.x1 - 1.25 - wide / 2, back = room.z0 + 1.1, front = room.z1 - 1.5;
  for (let z = back; z <= front && got < n; z += pitchZ) for (let x = left; x <= right && got < n; x += pitchX) {
    const f = placeAt(P, room, W.fix, x, z);
    if (!f) continue;
    slot(P, f, 'work', { use: W.use, out: 0.46, y: W.seat ? 0.45 : 0, face: Math.PI }); got++;
  }
  got += staff(P, room, n - got, { ...W, rng });
  return got;
}
/** Lobby and reception at the street, the main room behind, a toilet and a store. Bay kinds have a big roller door instead. */
function workplace(P, spec, rng, caps) {
  const k = P.kind, W = WORKS[k] || WORKS.office, n = caps.work ?? 4, doorX = spec.doorX ?? 0, big = P.w > 30;
  if (big) return civic(P, spec, rng, caps, W);
  const bay = k === 'fire_station' || k === 'garage' || k === 'sawmill' || k === 'lumber_yard', { hall, stock } = backRooms(P, 3.3);
  const w = P.w / 2, zm = hall.z1 - 4.2;
  if (bay) {
    hall.kind = 'bay';
    const gx = doorX > 0 ? -w + 3.2 : w - 3.2;
    P.bay = { door: streetDoor(P, hall, Math.max(-w + 2.2, Math.min(w - 2.2, gx)), { w: 3.4, kind: 'garage', closed: k !== 'lumber_yard', h: 3 }).id, room: hall.id };
    streetDoor(P, hall, doorX);
    deskField(P, hall, n, W, rng);
    placeWall(P, stock, 'boxes', { rng, front: 0.3 });
    return;
  }
  // a wall across the shop front: the lobby
  hall.z1 = zm;
  const lobby = addRoom(P, 'lobby', -w, zm, w, P.d / 2);
  link(P, lobby, hall, { w: 1.6, at: doorX });
  streetDoor(P, lobby, doorX);
  const rc = placeWall(P, lobby, 'reception', { sides: ['e', 'w'], rng, front: 1 });
  let got = 0;
  if (rc) { slot(P, rc, 'work', { use: 'till', out: 0.46, face: Math.PI }); got++; }
  got += deskField(P, hall, n - got, W, rng);
  if (got < n) got += staff(P, stock, n - got, { fix: 'shelf', use: 'stack', rng, front: 0.85 });
  if (got < n) throw new PlanMiss(`${k}: ${got} of ${n} work places`);
  if (k === 'rift_lodge') testRoom(P, stock, rng);
  else placeWall(P, stock, 'boxes', { rng, front: 0.3 });
}
/** The town hall and the school: a wide hall from the door, rooms each side. */
function civic(P, spec, rng, caps, W) {
  const w = P.w / 2, d = P.d / 2, n = caps.work ?? 6, hz0 = -2.4, hz1 = 2.4, doorX = spec.doorX ?? 0;
  const hall = addRoom(P, 'hall', -w, hz0, w, hz1), lobby = addRoom(P, 'lobby', doorX - 5, hz1, doorX + 5, d);
  open(P, lobby, hall);
  streetDoor(P, lobby, doorX, { w: 2.4 });
  const rc = placeWall(P, lobby, 'reception', { sides: ['e', 'w'], rng, front: 1 });
  let got = 0;
  if (rc) { slot(P, rc, 'work', { use: 'till', out: 0.46, face: Math.PI }); got++; }
  const rooms = [];
  const row = (x0, x1, z0, z1, count) => { const each = (x1 - x0) / count; for (let i = 0; i < count; i++) { const r = addRoom(P, 'room', x0 + i * each, z0, x0 + (i + 1) * each, z1); link(P, r, hall); rooms.push(r); } };
  row(-w, doorX - 5, hz1, d, 2); row(doorX + 5, w, hz1, d, 2); row(-w, w, -d, hz0, 5);
  const wcRoom = rooms[rooms.length - 1]; wcRoom.kind = 'wc';
  for (const f of [0, 1]) { const t = placeWall(P, wcRoom, 'toilet', { rng, sides: ['n', 'e'], front: 0.8 }); if (t && !f) slot(P, t, 'toilet', { use: 'toilet', inset: 0.08, y: 0.42, stand: [t.x + t.nx * (t.d / 2 + 0.45), t.z + t.nz * (t.d / 2 + 0.45)] }); }
  for (const r of rooms.slice(0, -1)) { if (got >= n) { placeWall(P, r, 'cabinet', { rng }); placeWall(P, r, 'table', { rng, size: [2, 0.9, 0.75], front: 0.8 }); continue; } got += deskField(P, r, Math.min(n - got, 3), W, rng); }
  if (got < n) throw new PlanMiss('civic work');
}
/** The Lodge's back store holds the physical test: two levers and a plate open the strongroom. data/wiring.json says how. */
function testRoom(P, stock, rng) {
  // the store is cut in two: a strongroom behind a door nobody can just push
  const w = 2.6, x1 = stock.x1, vault = addRoom(P, 'vault', x1 - w, stock.z0, x1, stock.z1);
  stock.x1 = x1 - w;
  stock.kind = 'testroom';
  P.vault = { door: link(P, stock, vault, { kind: 'vault' }).id, room: vault.id };
  P.doors[P.doors.length - 1].closed = true;
  placeWall(P, vault, 'cabinet', { sides: ['e', 'n'], rng, front: 0.8 });
  void rng;
}

// ---- things and wires -----------------------------------------------------------------------------------------------------

function roomOf(P, id) { return P.rooms.find(r => r.id === id); }
/** Where a switch goes: on the wall beside the room's first door, inside. */
function byDoor(P, room) {
  const d = P.doors.find(q => q.lv === room.lv && (q.a === room.id || q.b === room.id));
  if (!d) return { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 };
  const over = d.w / 2 + 0.25, inward = 0.22;
  if (d.axis === 'x') { const s = (room.z0 + room.z1) / 2 > d.z ? 1 : -1; for (const k of [1, -1]) { const x = d.x + k * over; if (x > room.x0 + 0.15 && x < room.x1 - 0.15) return { x, z: d.z + s * inward }; } return { x: d.x, z: d.z + s * inward }; }
  const s = (room.x0 + room.x1) / 2 > d.x ? 1 : -1;
  for (const k of [1, -1]) { const z = d.z + k * over; if (z > room.z0 + 0.15 && z < room.z1 - 0.15) return { x: d.x + s * inward, z }; }
  return { x: d.x + s * inward, z: d.z };
}
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

/** Turn the wiring sheet for this kind of building into real things and wires on this plan. */
function wire(P, wiring) {
  P.wires = []; P.defaults = {};
  if (!wiring) return;
  const sets = wiring.byKind[P.kind] ?? wiring.byKind[{ home: 'house' }[P.kind]] ?? [];
  const has = { garage: !!P.garage, bay: !!P.bay, shutter: !!P.shutter, vault: !!P.vault, lift: !!P.lift };
  const door = { garage: P.garage?.door, bay: P.bay?.door, shutter: P.shutter, vault: P.vault?.door };
  for (const d of P.doors) if (d.closed || d.shutter) P.defaults[`door:${d.id}`] = d.closed ? 0 : 1;
  for (const name of sets) {
    const set = wiring.sets[name];
    if (set.needs && !has[set.needs]) continue;
    const vars = { garage: door.garage, bay: door.bay, shutter: door.shutter, vault: door.vault };
    for (const t of set.things || []) {
      const rooms = t.each === 'room' ? P.rooms.filter(r => !['wc'].includes(r.kind) || true) : [null];
      for (const r of rooms) {
        const v = r ? { ...vars, room: r.id } : vars, id = fill(t.id, v);
        const base = { id, kind: t.kind, label: t.label ?? t.kind, on: t.on ?? null, off: t.off ?? null };
        if (t.kind === 'gate' || t.kind === 'timer') { P.things.push({ ...base, lv: -1, room: null, x: 0, z: 0, all: t.all ?? null, hours: t.hours ?? null }); continue; }
        const at = thingAt(P, t, r, door);
        if (at) P.things.push({ ...base, lv: at.lv ?? 0, room: at.room ?? null, x: round(at.x), z: round(at.z), outside: !!at.outside });
      }
    }
    for (const w of set.wires || []) {
      const rooms = w.each === 'room' ? P.rooms : [null];
      for (const r of rooms) {
        const v = r ? { ...vars, room: r.id } : vars;
        P.wires.push({ from: fill(w.from, v), on: w.on, do: w.do.map(a => ({ ...a, target: a.target ? fill(a.target, v) : undefined })) });
      }
    }
  }
}
function thingAt(P, t, r, door) {
  if (r) { const q = byDoor(P, r); return { ...q, lv: r.lv, room: r.id }; }
  const a = t.at;
  if (a === 'lift') return null;
  const nearDoor = (id, outside, off) => { const d = P.doors.find(q => q.id === id), k = outside ? 1 : -1; return { x: d.x + d.w / 2 + off, z: d.z + k * 0.2, lv: d.lv, room: d.b, outside }; };
  if (a === 'garage-in') return nearDoor(door.garage, false, 0.3);
  if (a === 'garage-out') return nearDoor(door.garage, true, 0.3);
  if (a === 'bay-in') return nearDoor(door.bay, false, 0.3);
  if (a === 'bay-out') return nearDoor(door.bay, true, 0.3);
  if (a === 'shutter-in') return nearDoor(door.shutter, false, 0.3);
  if (a === 'shutter-out') return nearDoor(door.shutter, true, 0.3);
  if (a?.startsWith('testroom')) {
    const room = P.rooms.find(q => q.kind === 'testroom'), u = (room.x1 - room.x0), m = { 'testroom-left': 0.22, 'testroom-mid': 0.5, 'testroom-right': 0.78 }[a];
    if (t.kind === 'plate') return { x: room.x0 + u * m, z: (room.z0 + room.z1) / 2, lv: 0, room: room.id };
    return { x: room.x0 + u * m, z: room.z0 + 0.2, lv: 0, room: room.id };
  }
  if (a === 'extinguisher') { const d = P.doors.find(q => q.a === 'out' && q.kind !== 'garage') ?? P.doors.find(q => q.a === 'out'), room = roomOf(P, d.b); return { x: d.x + d.w / 2 + 0.35, z: d.z - 0.25, lv: d.lv, room: room.id }; }
  if (a === 'vault') { const room = roomOf(P, P.vault.room); return { x: (room.x0 + room.x1) / 2, z: room.z0 + 0.8, lv: 0, room: room.id }; }
  return null;
}

// ---- standing room -------------------------------------------------------------------------------------------------------

/** Spots to stand in a room, in facing pairs, clear of everything. Enough for anyone with nothing to do. */
function standing(P) {
  for (const room of P.rooms) {
    if (['bath', 'wc', 'vault', 'garage'].includes(room.kind)) continue;
    let made = 0;
    const cap = room.kind === 'hall' || room.kind === 'landing' ? 2 : 4;
    for (let z = room.z0 + 0.8; z <= room.z1 - 0.8 && made < cap; z += 1.1) for (let x = room.x0 + 0.8; x <= room.x1 - 1.8 && made < cap; x += 1.4) {
      const a = { x, z }, b = { x: x + 1, z };
      const clear = p => !P.furn.some(f => f.lv === room.lv && f.solid !== false && p.x > f.rect.x0 - 0.5 && p.x < f.rect.x1 + 0.5 && p.z > f.rect.z0 - 0.5 && p.z < f.rect.z1 + 0.5)
        && !P.slots.some(s => s.lv === room.lv && Math.hypot(s.sx - p.x, s.sz - p.z) < 0.9) && !P.doors.some(d => d.lv === room.lv && Math.hypot(d.x - p.x, d.z - p.z) < 1.1)
        && !P.floor.some(s => s.lv === room.lv && Math.hypot(s.x - p.x, s.z - p.z) < 0.85);
      if (!clear(a) || !clear(b)) continue;
      P.floor.push({ i: P.floor.length, lv: room.lv, unit: room.unit, room: room.id, x: round(a.x), z: round(a.z), yaw: Math.PI / 2 }, { i: P.floor.length + 1, lv: room.lv, unit: room.unit, room: room.id, x: round(b.x), z: round(b.z), yaw: -Math.PI / 2 });
      made += 2;
    }
  }
}

// ---- the check ----------------------------------------------------------------------------------------------------------

/** What makes a plan good. Empty = good. The planner retries on this, and the tests run it over every building and many seeds. */
export function validate(P, caps = {}) {
  const bad = [];
  const shutNone = null, from = outsideDoor(P);
  for (const d of P.doors) {
    for (const side of [-1, 1]) {
      const p = d.axis === 'x' ? { x: d.x, z: d.z + side * 0.75 } : { x: d.x + side * 0.75, z: d.z };
      const r = routeFrom(P, from, { ...p, lv: d.lv }, shutNone);
      if (!r) bad.push(`door ${d.id} (${d.kind}) cannot be reached on side ${side}`);
    }
  }
  for (const r of P.rooms) if (!P.doors.some(d => d.a === r.id || d.b === r.id) && !(r.kind === 'lobby' || r.kind === 'hall')) bad.push(`room ${r.id} (${r.kind}) has no door`);
  for (const s of P.slots) {
    if (!routeFrom(P, from, { x: s.sx, z: s.sz, lv: s.lv }, shutNone)) bad.push(`slot ${s.i} (${s.kind}) cannot be reached`);
    const q = solidsAt(P, s.lv).find(r => s.sx > r.x0 - 0.3 && s.sx < r.x1 + 0.3 && s.sz > r.z0 - 0.3 && s.sz < r.z1 + 0.3);
    if (q) bad.push(`slot ${s.i} (${s.kind}) stands in something`);
  }
  for (const [kind, n] of Object.entries(caps)) {
    if (kind === 'work' && P.units.length) continue;      // at home, work is done at a desk, a table or the sofa
    if (P.units.length > 1) continue;
    const got = P.slots.filter(s => s.kind === kind).length;
    if (got < n) bad.push(`${kind}: ${got} of ${n}`);
  }
  for (const u of P.units) {
    const slots = P.slots.filter(s => s.unit === u.u);
    for (const [kind, n] of Object.entries(caps)) { if (kind === 'work') continue; const got = slots.filter(s => s.kind === kind).length; if (got < n) bad.push(`unit ${u.u} ${kind}: ${got} of ${n}`); }
  }
  for (const f of P.furn) {
    const r = P.rooms.find(q => q.id === f.room);
    if (f.rect.x0 < r.x0 - 0.01 || f.rect.x1 > r.x1 + 0.01 || f.rect.z0 < r.z0 - 0.01 || f.rect.z1 > r.z1 + 0.01) bad.push(`${f.kind} ${f.id} sticks out of its room`);
    for (const d of P.doors) if (d.lv === f.lv && f.solid !== false && overlap(d.rect, f.rect, 0.3)) bad.push(`${f.kind} ${f.id} blocks door ${d.id}`);
    for (const g of P.furn) if (g !== f && g.lv === f.lv && g.id > f.id && overlap(f.rect, g.rect)) bad.push(`${f.kind} ${f.id} is inside ${g.kind} ${g.id}`);
  }
  for (let a = 0; a < P.slots.length; a++) for (let b = a + 1; b < P.slots.length; b++) {
    const s = P.slots[a], t = P.slots[b];
    if (s.lv === t.lv && s.unit === t.unit && !(s.furn === t.furn && s.kind === 'bed') && Math.hypot(s.x - t.x, s.z - t.z) < 0.5) bad.push(`slots ${a} and ${b} overlap`);
  }
  return bad;
}
function solidsAt(P, lv) { const list = P.walls.filter(w => w.lv === lv); for (const f of P.furn) if (f.lv === lv && f.solid !== false) list.push(f.rect); return list; }
function routeFrom(P, from, to) {
  if (to.lv === 0) return canReach(P, 0, to, from, BODY_R);
  return canReach(P, 0, P.lift, from, BODY_R) && canReach(P, to.lv, to, P.lift, BODY_R);
}
// ---- the entry point ------------------------------------------------------------------------------------------------------

const cache = new Map();
function attempt(spec, wiring, caps, salt) {
  const P = newPlan(spec), rng = rngOf(spec.seed + salt * 7919), k = spec.kind;
  if (k === 'house') house(P, spec, rng, caps);
  else if (k === 'apartment') flats(P, spec, rng, caps);
  else if (['grocery', 'boutique', 'cafe', 'diner', 'bar', 'gym'].includes(k)) shop(P, spec, rng, caps);
  else workplace(P, spec, rng, caps);
  if (P.rooms.length === 0) throw new PlanMiss('no rooms');
  buildWalls(P);
  addWindows(P);
  standing(P);
  wire(P, wiring);
  delete P.keep; delete P.opens;
  return P;
}

export function planInterior(input, wiring = null, slotsOf = {}) {
  const [dw, dd, df] = DEFAULT_SIZE[input.kind] ?? SHOP_SIZE;
  const spec = { doorX: 0, garage: 0, ...input, w: input.w ?? dw, d: input.d ?? dd, floors: input.floors ?? df };
  spec.seed = spec.seed ?? parseInt(hashString(String(spec.id)), 16) | 0;
  const key = `${spec.id}|${spec.kind}|${spec.w}|${spec.d}|${spec.floors}|${spec.units}|${spec.doorX}|${spec.garage}|${spec.seed}`, had = cache.get(key);
  if (had) return had;
  const caps = { ...slotsOf };
  let last = null;
  for (let salt = 0; salt < 12; salt++) {
    try {
      const P = attempt(spec, wiring, caps, salt), bad = validate(P, caps);
      if (!bad.length) { P.tries = salt + 1; if (cache.size > 4000) cache.clear(); cache.set(key, P); return P; }
      last = bad.slice(0, 4).join('; ');
    } catch (e) { if (!(e instanceof PlanMiss)) throw e; last = e.message; }
  }
  throw new Error(`planInterior: ${spec.id} (${spec.kind} ${spec.w}x${spec.d}) has no good plan: ${last}`);
}

/** Building frame to the world. `b` = { cx, cz, yaw }: the footprint's middle and which way its front looks. */
/** When a piece of furniture catches, as its room's burn number. The sim and the cutaway read the same number. */
export const furnChar = (b, id) => 0.25 + 0.6 * (parseInt(hashString(`${b}/${id}`), 16) / 4294967296);

export const toWorld = (b, x, z, out = {}) => { const s = Math.sin(b.yaw), c = Math.cos(b.yaw); out.x = b.cx + x * c + z * s; out.z = b.cz - x * s + z * c; return out; };
export const toLocal = (b, x, z, out = {}) => { const s = Math.sin(b.yaw), c = Math.cos(b.yaw), dx = x - b.cx, dz = z - b.cz; out.x = dx * c - dz * s; out.z = dx * s + dz * c; return out; };
export { outsideDoor };
