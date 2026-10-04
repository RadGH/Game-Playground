// Thousandvale — multi-floor dungeon generator (stream E, PLAN §3.6). PURE: no Three.js, DOM, fetch,
// storage, wall clocks or Math.random. Same seed + options -> the same dungeon, byte for byte.
//
//   import { planDungeon, FAMILIES, familyFor } from './dungeon-tiers.js';
//   const plan = planDungeon(seed, { floors: 2, level: 3, family: 'crypt_spiral' });
//
// The output is the plan shape in docs/protocol.md §10.3 (what js/sim/dungeon.js's stand-in returns), so
// stream A swaps it in with one line. Everything past that shape is EXTRA and optional to read:
//
//   { family, familyName, look, name, level, seed, cell: 2,
//     floors: [ { index, origin:{x,z}, w, h, tiles: Uint8Array(w*h) /* 1 floor, 0 wall, j*w+i */,
//                 rooms: [ { i, j, w, h, kind, id, x, z } ],      // kind: entry|fight|key|miniboss|boss|reward|arrival
//                 entry:{x,z}, stairsDown?, stairsUp?, exit?, chest?,  // metres (protocol)
//                 packs: [ { x, z, count, rank, level, radius, type, room, encounter? } ],
//                 level,                                             // this floor's monster level (+2 a floor)
//                 lever?:   { x, z, room },                          // in the key room; opens `gate`
//                 gate?:    { i, j, w, h, x, z },                    // tiles that start CLOSED (still 1 in tiles[])
//                 shortcutUp?: { x, z, to: { floor: 0, x, z } },     // floors > 0: a quick way back to the top
//                 props:    [ { id, type, name, x, z, room, r?, encounter } ] } ] }  // arena objects (only with opts.arenas)
//
// A gate's tiles are floor (1) in `tiles`, so a server that ignores gates still has a walkable dungeon;
// one that honours them treats those tiles as walls until the lever is pulled. The test proves the lever
// is reachable with the gate shut, and the boss is not.
//
// Families (8 planned, PLAN §3.6). M1 ships two: `crypt_spiral` (rooms in a ring that winds inward to a
// central chamber) and `mine_descent` (a switchback shaft with galleries hanging off it). Asking for a
// planned family gets the nearest ready one, with `familyFallback` naming what was asked for.

export const CELL = 2;                  // metres per tile
const GAP = 64;                         // metres between floors laid side by side

/** The eight layout families. `ready` ones have a generator; `look` keys match Farhold DUNGEON_LOOKS. */
export const FAMILIES = {
  crypt_spiral: {
    name: 'Crypt spiral', ready: true, look: 'crypt', fallback: null,
    blurb: 'Burial rooms in a ring that winds inward to one great vault.',
    roster: { normal: ['barrow_hound', 'cairn_rat', 'gallows_owl'], elite: 'barrow_hound' },
    // floor N's mini-boss is miniboss[N % length]; `type` is the Farhold body the encounter runs on
    encounters: { miniboss: [{ id: 'mb_marrowgnaw', type: 'barrow_hound' }, { id: 'mb_gallowmother', type: 'gallows_owl' }], boss: { id: 'boss_hollow_abbot', type: 'hollow_wraith' } },
  },
  mine_descent: {
    name: 'Mine descent', ready: true, look: 'warren', fallback: null,
    blurb: 'A switchback shaft cut ever deeper, galleries branching off it.',
    roster: { normal: ['cairn_rat', 'ironback_beetle', 'bog_slime', 'carrion_moth'], elite: 'ironback_beetle' },
    encounters: { miniboss: [{ id: 'mb_rustjaw', type: 'ironback_beetle' }, { id: 'mb_seep_mother', type: 'bog_slime' }], boss: { id: 'boss_deep_foreman', type: 'shale_warden' } },
  },
  flooded_cistern: { name: 'Flooded cistern', ready: false, look: 'flooded', fallback: 'crypt_spiral', blurb: 'Channels and sluices; the water level is part of the fight.' },
  fortress_keep: { name: 'Fortress keep levels', ready: false, look: 'ruin', fallback: 'crypt_spiral', blurb: 'Halls and barracks stacked floor on floor.' },
  cave_river: { name: 'Cave river', ready: false, look: 'cave', fallback: 'mine_descent', blurb: 'A cave that follows an underground river downstream.' },
  tower_climb: { name: 'Tower climb', ready: false, look: 'vault', fallback: 'crypt_spiral', blurb: 'Up, not down: a ruined tower floor by floor.' },
  barrow_maze: { name: 'Barrow maze', ready: false, look: 'barrow', fallback: 'crypt_spiral', blurb: 'Low turf-roofed passages that double back.' },
  sunken_temple: { name: 'Sunken temple', ready: false, look: 'hollow', fallback: 'mine_descent', blurb: 'A temple the marsh swallowed, roof first.' },
};

export const ROOM_KINDS = ['entry', 'arrival', 'fight', 'key', 'miniboss', 'boss', 'reward'];

/** Name parts for dungeon titles (original, no ember/veil). Province culture can override later. */
const NAMES = {
  crypt_spiral: { a: ['Ossuary', 'Crypt', 'Undervault', 'Charnel Ring', 'Bone Cloister'], b: ['of the Hollow Abbot', 'of Saint Orrin', 'of the Quiet Brothers', 'Below Torborhold', 'of the Nine Lamps'] },
  mine_descent: { a: ['Delving', 'Shaft', 'Old Workings', 'Deepcut', 'Seam'], b: ['of the Lost Shift', 'of Gaffer Brann', 'Under the Moor', 'of the Black Seam', 'of the Ninth Ladder'] },
};

// ------------------------------------------------------------------------------------------------
// seeded random (mulberry32; the module stays dependency-free)
function rngOf(seed) {
  let s = (seed >>> 0) ^ 0x6d2b79f5;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = n => Math.floor(f() * n);
  f.range = (a, b) => a + f.int(b - a + 1);       // inclusive integers
  f.pick = arr => arr[f.int(arr.length)];
  return f;
}

/** Which family a ready generator will actually build for `want`. */
export function familyFor(want) {
  let k = FAMILIES[want] ? want : 'crypt_spiral';
  const seen = new Set();
  while (!FAMILIES[k].ready && !seen.has(k)) { seen.add(k); k = FAMILIES[k].fallback || 'crypt_spiral'; }
  return k;
}

// ------------------------------------------------------------------------------------------------
// a floor grid with carving helpers
function makeGrid(w, h) {
  const tiles = new Uint8Array(w * h);
  const g = {
    w, h, tiles,
    inside: (i, j) => i > 0 && j > 0 && i < w - 1 && j < h - 1,
    carve(i, j) { if (g.inside(i, j)) tiles[j * w + i] = 1; },
    get: (i, j) => (i >= 0 && j >= 0 && i < w && j < h ? tiles[j * w + i] : 0),
    rect(r) { for (let j = r.j; j < r.j + r.h; j++) for (let i = r.i; i < r.i + r.w; i++) g.carve(i, j); },
    /** 3-tile-wide straight run between two points on one axis */
    hLine(i0, i1, j, half = 1) { for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) for (let d = -half; d <= half; d++) g.carve(i, j + d); },
    vLine(j0, j1, i, half = 1) { for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) for (let d = -half; d <= half; d++) g.carve(i + d, j); },
    /** L corridor; `cornerAt` picks the corner ('h' = go along x first) */
    ell(a, b, xFirst, half = 1) {
      if (xFirst) { g.hLine(a[0], b[0], a[1], half); g.vLine(a[1], b[1], b[0], half); }
      else { g.vLine(a[1], b[1], a[0], half); g.hLine(a[0], b[0], b[1], half); }
    },
  };
  return g;
}

const mid = r => [r.i + (r.w >> 1), r.j + (r.h >> 1)];
const overlaps = (a, b, m = 0) => a.i < b.i + b.w + m && b.i < a.i + a.w + m && a.j < b.j + b.h + m && b.j < a.j + a.h + m;

// ------------------------------------------------------------------------------------------------
// FAMILY 1 — crypt spiral: a ring of rooms walked in order, the last one opening (through the gate)
// into a central vault. The ring is NOT closed, so the walk spirals: round the outside, then in.
function cryptFloor(rng, kinds) {
  const W = 72, H = 72, g = makeGrid(W, H);
  const cx = W >> 1, cz = H >> 1;
  const cs = 15 + 2 * rng.int(2);                      // centre 15 or 17 tiles (30-34 m): the arena
  const centre = { i: cx - (cs >> 1), j: cz - (cs >> 1), w: cs, h: cs };
  const ringKinds = kinds.ring;
  const n = ringKinds.length;
  const R = 24 + rng.int(3);
  const dir = rng() < 0.5 ? 1 : -1;
  const a0 = rng() * Math.PI * 2;
  const span = Math.PI * 2 * (n / (n + 1));            // leave one gap so the ring is a spiral, not a loop
  const ring = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + dir * span * (k / Math.max(1, n - 1));
    let w = 8 + rng.int(4), h = 8 + rng.int(4);
    if (ringKinds[k] === 'miniboss') { w = 12; h = 12; }
    const ci = Math.round(cx + Math.cos(a) * R), cj = Math.round(cz + Math.sin(a) * R);
    const r = { i: Math.max(2, Math.min(W - w - 2, ci - (w >> 1))), j: Math.max(2, Math.min(H - h - 2, cj - (h >> 1))), w, h };
    // shrink on a clash with the previous room (only possible when the ring is crowded)
    let guard = 0;
    while (ring.some(o => overlaps(o, r, 2)) && guard++ < 6) { r.w = Math.max(7, r.w - 1); r.h = Math.max(7, r.h - 1); }
    ring.push(r);
  }
  ring.forEach((r, k) => { r.kind = ringKinds[k]; g.rect(r); });
  g.rect(centre);
  // ring corridors: the L corner on the OUTSIDE of the ring keeps clear of the vault
  for (let k = 1; k < n; k++) {
    const a = mid(ring[k - 1]), b = mid(ring[k]);
    const c1 = [b[0], a[1]], c2 = [a[0], b[1]];
    const d1 = Math.hypot(c1[0] - cx, c1[1] - cz), d2 = Math.hypot(c2[0] - cx, c2[1] - cz);
    g.ell(a, b, d1 >= d2);
  }
  // the last ring room -> the vault: a straight-ish spoke, gated where it meets the vault wall
  const last = ring[n - 1], lm = mid(last);
  const spoke = [cx, cz];
  const xFirst = Math.abs(lm[0] - cx) > Math.abs(lm[1] - cz);
  g.ell(lm, spoke, !xFirst);
  centre.kind = kinds.centre;
  const rooms = [...ring, centre];
  // the gate: three tiles across the spoke, one tile outside the vault edge
  const gate = gateOnSpoke(g, centre, lm, xFirst);
  // the reward alcove: carved off the vault (last floor only), on a side where neither the alcove nor
  // its short passage touches anything already dug, so the vault is the ONLY way in
  if (kinds.reward) {
    const clear = (r) => {
      for (let j = r.j - 1; j < r.j + r.h + 1; j++) for (let i = r.i - 1; i < r.i + r.w + 1; i++) if (!g.inside(i, j) || g.get(i, j)) return false;
      return true;
    };
    const tries = [];
    for (const size of [9, 7]) for (const gap of [4, 3, 2]) for (const off of [0, -3, 3, -5, 5]) {
      const half = size >> 1;
      tries.push({ side: 'e', room: { i: centre.i + centre.w + gap, j: cz - half + off, w: size, h: size }, pass: { i: centre.i + centre.w, j: cz - 1 + off, w: gap, h: 3 } });
      tries.push({ side: 'w', room: { i: centre.i - gap - size, j: cz - half + off, w: size, h: size }, pass: { i: centre.i - gap, j: cz - 1 + off, w: gap, h: 3 } });
      tries.push({ side: 's', room: { i: cx - half + off, j: centre.j + centre.h + gap, w: size, h: size }, pass: { i: cx - 1 + off, j: centre.j + centre.h, w: 3, h: gap } });
      tries.push({ side: 'n', room: { i: cx - half + off, j: centre.j - gap - size, w: size, h: size }, pass: { i: cx - 1 + off, j: centre.j - gap, w: 3, h: gap } });
    }
    // prefer the side facing away from the spoke
    const away = Math.abs(lm[0] - cx) > Math.abs(lm[1] - cz) ? (lm[0] < cx ? 'e' : 'w') : (lm[1] < cz ? 's' : 'n');
    tries.sort((p, q) => (p.side === away ? 0 : 1) - (q.side === away ? 0 : 1));
    let t = tries.find(t => clear(t.room) && passOk(g, t.pass, centre));
    if (!t) t = tries[0];
    t.room.kind = 'reward';
    g.rect(t.room); g.rect(t.pass);
    rooms.push(t.room);
  }
  return { grid: g, rooms, gate };
}

/** A passage from the vault wall to the alcove: only its own two ends may touch dug tiles. */
function passOk(g, pass, centre) {
  for (let j = pass.j - 1; j < pass.j + pass.h + 1; j++) for (let i = pass.i - 1; i < pass.i + pass.w + 1; i++) {
    const inVault = i >= centre.i && i < centre.i + centre.w && j >= centre.j && j < centre.j + centre.h;
    if (inVault) continue;
    const inPass = i >= pass.i && i < pass.i + pass.w && j >= pass.j && j < pass.j + pass.h;
    if (g.get(i, j) && !inPass) return false;
  }
  return true;
}

/** Find the three spoke tiles just outside the vault and call them the gate. */
function gateOnSpoke(g, centre, from, xFirst) {
  // xFirst (the last ring room sits mostly east/west of the vault) means the spoke went vertical first,
  // so its final leg enters the vault horizontally; otherwise it enters vertically.
  const cxT = centre.i + (centre.w >> 1), czT = centre.j + (centre.h >> 1);
  if (xFirst) {
    // final leg horizontal at row czT
    const side = from[0] < cxT ? -1 : 1;
    const i = side < 0 ? centre.i - 2 : centre.i + centre.w + 1;
    return { i, j: czT - 1, w: 1, h: 3 };
  }
  const side = from[1] < czT ? -1 : 1;
  const j = side < 0 ? centre.j - 2 : centre.j + centre.h + 1;
  return { i: cxT - 1, j, w: 3, h: 1 };
}

// ------------------------------------------------------------------------------------------------
// FAMILY 2 — mine descent: one shaft in switchbacks across the floor, galleries hanging off it. The
// walk is the shaft; the gate cuts the shaft before the last gallery.
function mineFloor(rng, kinds) {
  const W = 88, H = 84, g = makeGrid(W, H);
  const rows = 4;
  const rowJ = [];
  for (let r = 0; r < rows; r++) rowJ.push(7 + Math.round(r * (H - 14) / (rows - 1)));
  // the shaft as a polyline of tile points, wiggling by ±1 row as it runs
  const pts = [];
  const x0 = 6, x1 = W - 7;
  for (let r = 0; r < rows; r++) {
    const ltr = r % 2 === 0;
    let j = rowJ[r];
    const seg = [];
    for (let s = 0; s <= 6; s++) {
      const i = ltr ? x0 + Math.round((x1 - x0) * s / 6) : x1 - Math.round((x1 - x0) * s / 6);
      if (s > 0 && s < 6) j = rowJ[r] + rng.int(3) - 1;
      seg.push([i, j]);
    }
    seg[seg.length - 1][1] = rowJ[r];
    pts.push(...seg);
  }
  // carve: consecutive points with an L each (short legs read as a wobbling tunnel)
  const path = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    g.ell(a, b, true);
    // record walked tiles along the centreline for "distance along the shaft"
    const stepI = Math.sign(b[0] - a[0]), stepJ = Math.sign(b[1] - a[1]);
    for (let i = a[0]; i !== b[0]; i += stepI) path.push([i, a[1]]);
    for (let j = a[1]; j !== b[1]; j += stepJ) path.push([b[0], j]);
  }
  path.push(pts[pts.length - 1]);
  const along = new Map(path.map((p, k) => [p[0] + ',' + p[1], k]));

  // galleries: kinds in order, spaced along the shaft; each is a room above or below the shaft with a spur
  const want = kinds.list;                             // e.g. entry, fight, key, fight, miniboss
  const rooms = [];
  const reserved = [];                                 // shaft bands, so a gallery never sits on another row
  for (let r = 0; r < rows; r++) reserved.push({ i: 0, j: rowJ[r] - 2, w: W, h: 5 });
  for (let r = 0; r < rows - 1; r++) {                 // the vertical connectors at the ends
    const i = r % 2 === 0 ? x1 : x0;
    reserved.push({ i: i - 2, j: rowJ[r], w: 5, h: rowJ[r + 1] - rowJ[r] });
  }
  const n = want.length;
  // galleries hang only off the horizontal runs (never the end connectors)
  const flat = [];
  path.forEach((p, k) => { if (p[0] >= x0 + 3 && p[0] <= x1 - 3 && rowJ.some(rj => Math.abs(rj - p[1]) <= 1)) flat.push(k); });
  for (let k = 0; k < n; k++) {
    const kind = want[k];
    const big = kind === 'boss' ? 14 : kind === 'miniboss' ? 12 : 0;
    // target index along the shaft: first gallery at the very start, last at the very end
    const t = n === 1 ? 0 : k / (n - 1);
    let idx = flat[Math.round(t * (flat.length - 1))];
    let placed = null;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const off = tries === 0 ? 0 : (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 3;
      const fk = flat.indexOf(idx);
      const p = path[flat[Math.max(0, Math.min(flat.length - 1, fk + off))]];
      const w = big || 8 + rng.int(4), h = big || 8 + rng.int(3);
      for (const side of (rng() < 0.5 ? [-1, 1] : [1, -1])) {
        const room = { w, h, i: Math.max(2, Math.min(W - w - 2, p[0] - (w >> 1))) };
        room.j = side < 0 ? p[1] - 3 - h : p[1] + 4;
        if (room.j < 2 || room.j + h > H - 2) continue;
        if (rooms.some(o => overlaps(o, room, 2))) continue;
        // may touch its OWN row's band (the spur crosses it) but no other band/connector
        const own = rowJ.findIndex(rj => Math.abs(rj - p[1]) <= 2);
        if (reserved.some((b, bi) => bi !== own && overlaps(b, room, 1))) continue;
        room.kind = kind; room.at = p; room.side = side;
        placed = room;
        break;
      }
    }
    if (!placed) {
      // last resort: widen the shaft into a chamber in place (always fits — it IS the shaft)
      const p = path[idx];
      const w = big || 9, h = Math.min(big || 7, 7);
      placed = { i: Math.max(2, Math.min(W - w - 2, p[0] - (w >> 1))), j: p[1] - (h >> 1), w, h, kind, at: p, side: 0 };
    }
    rooms.push(placed);
    g.rect(placed);
    // the spur from the shaft to the room
    if (placed.side) {
      const [si, sj] = placed.at;
      const ci = Math.max(placed.i + 1, Math.min(placed.i + placed.w - 2, si));
      const edge = placed.side < 0 ? placed.j + placed.h - 1 : placed.j;
      g.vLine(sj, edge, ci, 1);
    }
  }
  // the gate: three shaft tiles just before the spur of the gallery it guards (the boss on the last
  // floor, else the mini-boss) — everything past it along the shaft is behind the gate
  const guarded = rooms.find(r => r.kind === 'boss') || rooms.find(r => r.kind === 'miniboss');
  const keyRoom = rooms.find(r => r.kind === 'key');
  let gidx = along.get(guarded.at[0] + ',' + guarded.at[1]);
  const kidx = along.get(keyRoom.at[0] + ',' + keyRoom.at[1]);
  gidx = Math.max((kidx ?? 0) + 4, (gidx === undefined ? path.length - 1 : gidx) - 6);
  // a gate is the whole cross-section of the shaft at that point (the wobble can make it 4-5 wide);
  // step back toward the key room until the cross-section is a clean tunnel, not a gallery mouth
  let gate = null;
  for (let gi = gidx; gi > (kidx ?? 0) + 1 && !gate; gi--) {
    const gp = path[gi], gq = path[gi + 1] || path[gi - 1];
    const horiz = gq[1] === gp[1];
    let lo = 0, hi = 0;
    if (horiz) {
      while (g.get(gp[0], gp[1] + lo - 1)) lo--;
      while (g.get(gp[0], gp[1] + hi + 1)) hi++;
      if (hi - lo + 1 <= 5 && g.get(gp[0] - 1, gp[1]) && g.get(gp[0] + 1, gp[1])) gate = { i: gp[0], j: gp[1] + lo, w: 1, h: hi - lo + 1 };
    } else {
      while (g.get(gp[0] + lo - 1, gp[1])) lo--;
      while (g.get(gp[0] + hi + 1, gp[1])) hi++;
      if (hi - lo + 1 <= 5 && g.get(gp[0], gp[1] - 1) && g.get(gp[0], gp[1] + 1)) gate = { i: gp[0] + lo, j: gp[1], w: hi - lo + 1, h: 1 };
    }
  }
  if (!gate) { const gp = path[gidx]; gate = { i: gp[0], j: gp[1] - 1, w: 1, h: 3 }; }
  // shaft end stubs (the start is the entry gallery's spur; extend the tunnel a little past both ends)
  return { grid: g, rooms, gate, path, along };
}

// ------------------------------------------------------------------------------------------------
/** Floor kinds by position: first floor, a middle floor, the last floor. */
function kindsFor(f, floors) {
  const last = f === floors - 1;
  const first = f === 0;
  const start = first ? 'entry' : 'arrival';
  return { start, last };
}

/** Arena objects of an encounter placed in its room: `objects` are offsets from the room centre. */
function arenaProps(room, objects, floorIndex, roomCentre, encId) {
  return (objects || []).map((o, k) => {
    const p = { id: `f${floorIndex}-${o.id || o.type + k}`, type: o.type, name: o.name || o.type, x: +(roomCentre.x + (o.x || 0)).toFixed(2), z: +(roomCentre.z + (o.z || 0)).toFixed(2), room: room.id, encounter: encId };
    if (o.r) p.r = o.r;
    return p;
  });
}

/**
 * Plan a multi-floor dungeon. Pure; same seed + opts -> same plan.
 * @param {number} seed
 * @param {{floors?:number, level?:number, family?:string, encounters?:object, arenas?:object}} opts
 *        `encounters` overrides the family's { miniboss: [{id, type}], boss: {id, type} }.
 *        `arenas` = { encounterId: script.arena.objects } (the JSON in data/encounters/); when given,
 *        each boss/mini-boss room lists its arena objects as `props` (the encounter engine spawns the
 *        real objects itself — props are for the viewer, the client's dressing and the tests).
 */
export function planDungeon(seed, { floors = 2, level = 3, family = 'crypt_spiral', encounters = null, arenas = null } = {}) {
  floors = Math.max(1, Math.min(4, floors | 0));
  const key = familyFor(family);
  const fam = FAMILIES[key];
  const rng = rngOf((seed >>> 0) ^ hash(key));
  const enc = { ...fam.encounters, ...(encounters || {}) };
  const names = NAMES[key];
  const out = {
    family: key, familyName: fam.name, look: fam.look, level, seed: seed >>> 0, cell: CELL,
    name: `The ${rng.pick(names.a)} ${rng.pick(names.b)}`,
    encounters: { miniboss: [], boss: null },
    floors: [],
  };
  if (key !== family) out.familyFallback = family;
  let widthSoFar = 0;
  for (let f = 0; f < floors; f++) {
    const { start, last } = kindsFor(f, floors);
    let built;
    if (key === 'crypt_spiral') {
      const n = 6 + rng.int(2);                           // 6-7 ring rooms
      const ring = [start];
      while (ring.length < n - 1) ring.push('fight');
      ring.splice(Math.max(2, Math.floor(n / 2)), 0, 'key');
      ring.length = n;
      if (last) ring[n - 1] = 'miniboss';               // the last ring room holds the floor's mini-boss
      built = cryptFloor(rng, { ring, centre: last ? 'boss' : 'miniboss', reward: last });
    } else {
      const list = [start, 'fight', 'fight', 'key', 'fight', 'miniboss'];
      if (last) list.push('boss', 'reward');
      built = mineFloor(rng, { list });
    }
    const { grid, rooms, gate } = built;
    const origin = { x: widthSoFar, z: 0 };
    widthSoFar += grid.w * CELL + GAP;
    const at = r => ({ x: origin.x + (r.i + r.w / 2) * CELL, z: origin.z + (r.j + r.h / 2) * CELL });
    rooms.forEach((r, k) => { r.id = k; const p = at(r); r.x = p.x; r.z = p.z; });
    const lv = level + 2 * f;
    const startRoom = rooms.find(r => r.kind === start);
    const sp = at(startRoom);
    const floor = {
      index: f, origin, w: grid.w, h: grid.h, tiles: grid.tiles, level: lv,
      rooms: rooms.map(r => ({ i: r.i, j: r.j, w: r.w, h: r.h, kind: r.kind, id: r.id, x: r.x, z: r.z })),
      entry: { x: sp.x, z: sp.z }, packs: [], props: [],
    };
    // packs
    let eliteGiven = false;
    const mbs = Array.isArray(enc.miniboss) ? enc.miniboss : [enc.miniboss];
    for (const r of rooms) {
      const p = at(r);
      const radius = +(Math.min(r.w, r.h) * CELL / 3).toFixed(2);
      if (r.kind === 'fight' || r.kind === 'key') {
        floor.packs.push({ x: p.x, z: p.z, count: 3 + rng.int(2), rank: 'normal', level: lv, radius, type: rng.pick(fam.roster.normal), room: r.id });
        if (!eliteGiven && r.kind === 'fight' && rng() < 0.5) {
          floor.packs.push({ x: p.x + 2, z: p.z + 2, count: 1, rank: 'elite', level: lv + 1, radius: 1, type: fam.roster.elite, room: r.id });
          eliteGiven = true;
        }
      } else if (r.kind === 'miniboss') {
        const mb = mbs[f % mbs.length];
        floor.packs.push({ x: p.x, z: p.z, count: 1, rank: 'elite', level: lv + 1, radius: 1, type: mb.type, room: r.id, encounter: mb.id });
        out.encounters.miniboss.push(mb.id);
        floor.props.push(...arenaProps(r, arenas?.[mb.id], f, p, mb.id));
      } else if (r.kind === 'boss') {
        floor.packs.push({ x: p.x, z: p.z, count: 1, rank: 'boss', level: lv + 2, radius: 1, type: enc.boss.type, room: r.id, encounter: enc.boss.id });
        out.encounters.boss = enc.boss.id;
        floor.props.push(...arenaProps(r, arenas?.[enc.boss.id], f, p, enc.boss.id));
      }
    }
    // objects
    const mbRoom = rooms.find(r => r.kind === 'miniboss');
    if (!last) { const p = at(mbRoom); floor.stairsDown = { x: p.x + 3, z: p.z }; }
    if (f > 0) floor.stairsUp = { x: sp.x - 3, z: sp.z };
    if (f === 0) floor.exit = { x: sp.x, z: sp.z - 4 };
    if (last) {
      const rw = at(rooms.find(r => r.kind === 'reward'));
      floor.chest = { x: rw.x, z: rw.z };
      floor.exit = { x: rw.x + 4, z: rw.z };
    }
    const kr = rooms.find(r => r.kind === 'key');
    const kp = at(kr);
    floor.lever = { x: kp.x, z: kp.z + 2 * CELL, room: kr.id };
    floor.gate = { ...gate, x: origin.x + (gate.i + gate.w / 2) * CELL, z: origin.z + (gate.j + gate.h / 2) * CELL };
    if (f > 0) { const p = at(mbRoom); floor.shortcutUp = { x: p.x - 3, z: p.z + 3, to: { floor: 0, x: out.floors[0].entry.x, z: out.floors[0].entry.z } }; }
    out.floors.push(floor);
  }
  return out;
}

function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }

// ------------------------------------------------------------------------------------------------
// Helpers for tests and the viewer (pure)

/** Tile under a metre point on a floor, or -1 when off the floor. */
export function tileIndex(floor, x, z, cell = CELL) {
  const i = Math.floor((x - floor.origin.x) / cell), j = Math.floor((z - floor.origin.z) / cell);
  if (i < 0 || j < 0 || i >= floor.w || j >= floor.h) return -1;
  return j * floor.w + i;
}

/** Flood fill from a metre point. `gateShut` treats the gate tiles as walls. Returns Uint8Array(w*h). */
export function flood(floor, from, { gateShut = false, cell = CELL } = {}) {
  const { w, h, tiles } = floor;
  const seen = new Uint8Array(w * h);
  const start = tileIndex(floor, from.x, from.z, cell);
  if (start < 0 || !tiles[start]) return seen;
  const shut = new Uint8Array(w * h);
  if (gateShut && floor.gate) for (let j = floor.gate.j; j < floor.gate.j + floor.gate.h; j++) for (let i = floor.gate.i; i < floor.gate.i + floor.gate.w; i++) shut[j * w + i] = 1;
  const q = [start]; seen[start] = 1;
  while (q.length) {
    const k = q.pop(); const i = k % w, j = (k / w) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (seen[nk] || !tiles[nk] || shut[nk]) continue;
      seen[nk] = 1; q.push(nk);
    }
  }
  return seen;
}

/** Every metre point a floor names (for reachability checks): [label, {x,z}]. */
export function floorPoints(floor) {
  const pts = [['entry', floor.entry]];
  for (const k of ['stairsDown', 'stairsUp', 'exit', 'chest', 'lever', 'shortcutUp']) if (floor[k]) pts.push([k, floor[k]]);
  floor.rooms.forEach(r => pts.push([`room ${r.id} (${r.kind})`, { x: r.x, z: r.z }]));
  floor.packs.forEach((p, k) => pts.push([`pack ${k} (${p.rank})`, p]));
  floor.props.forEach(p => pts.push([`prop ${p.id}`, p]));
  return pts;
}
