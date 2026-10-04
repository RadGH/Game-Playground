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
    encounterSets: [{ name: 'The Abbot\'s Ossuary', miniboss: [{ id: 'mb_marrowgnaw', type: 'barrow_hound' }, { id: 'mb_gallowmother', type: 'gallows_owl' }], boss: { id: 'boss_hollow_abbot', type: 'hollow_wraith' } },
      { name: 'The Bell and the Lantern', miniboss: [{ id: 'mb_bell_ringer', type: 'cult_zealot' }, { id: 'mb_chained_saint', type: 'stone_sentinel' }], boss: { id: 'boss_lantern_bishop', type: 'sky_cultist' } }],
  },
  mine_descent: {
    name: 'Mine descent', ready: true, look: 'warren', fallback: null,
    blurb: 'A switchback shaft cut ever deeper, galleries branching off it.',
    roster: { normal: ['cairn_rat', 'ironback_beetle', 'bog_slime', 'carrion_moth'], elite: 'ironback_beetle' },
    encounterSets: [{ name: 'The Ninth Shift', miniboss: [{ id: 'mb_rustjaw', type: 'ironback_beetle' }, { id: 'mb_seep_mother', type: 'bog_slime' }], boss: { id: 'boss_deep_foreman', type: 'shale_warden' } },
      { name: 'The Gassy Seam', miniboss: [{ id: 'mb_firedamp', type: 'ash_wisp' }, { id: 'mb_glimmerback', type: 'glass_shard' }], boss: { id: 'boss_hungry_cart', type: 'hoard_mimic' } }],
  },
  flooded_cistern: { name: 'Flooded cistern', ready: true, look: 'flooded', borrow: 'crypt_spiral',
    blurb: 'Chambers on a lattice of channels and sluices; the water level is part of the fight.',
    roster: { normal: ['bog_slime', 'reed_serpent', 'fen_croaker', 'barrow_hound'], elite: 'reed_serpent' },
    encounterSets: [
      { name: 'The Drowned Reeve', miniboss: [{ id: 'mb_sluicegrip', type: 'reed_serpent' }, { id: 'mb_old_murkfin', type: 'silt_lurker' }], boss: { id: 'boss_drowned_reeve', type: 'ossuary_crawler' } },
      { name: 'The Sunken Coffer', miniboss: [{ id: 'mb_drowned_lamp', type: 'ash_wisp' }, { id: 'mb_pipewalker', type: 'dune_centipede' }], boss: { id: 'boss_sunken_coffer', type: 'hoard_mimic' } }] },
  fortress_keep: { name: 'Fortress keep levels', ready: true, look: 'ruin', borrow: 'crypt_spiral',
    blurb: 'Halls and barracks in pairs up a central axis, the great hall at the top.',
    roster: { normal: ['road_brigand', 'brigand_archer', 'sky_cultist', 'cult_zealot'], elite: 'brigand_captain' },
    encounterSets: [
      { name: 'The Oathbroken Garrison', miniboss: [{ id: 'mb_sergeant_wark', type: 'road_brigand' }, { id: 'mb_drummer_ossa', type: 'sky_cultist' }], boss: { id: 'boss_castellan_odrun', type: 'cult_zealot' } },
      { name: 'The Red Banner', miniboss: [{ id: 'mb_greycoat', type: 'frost_stalker' }, { id: 'mb_spit_imp', type: 'cinder_imp' }], boss: { id: 'boss_warlord_hask', type: 'brigand_captain' } }] },
  cave_river: { name: 'Cave river', ready: true, look: 'cave', borrow: 'mine_descent',
    blurb: 'Caverns strung along an underground river, wide winding tunnels.',
    roster: { normal: ['cairn_rat', 'reed_serpent', 'dusk_flitter', 'ironback_beetle'], elite: 'silt_lurker' } },
  tower_climb: { name: 'Tower climb', ready: true, look: 'vault', borrow: 'fortress_keep', ascending: true,
    blurb: 'Up, not down: rooms round the walls of each storey, the top chamber in the middle, narrower each floor.',
    roster: { normal: ['sky_cultist', 'gallows_owl', 'marsh_wisp', 'ash_wisp'], elite: 'cult_zealot' } },
  barrow_maze: { name: 'Barrow maze', ready: true, look: 'barrow', borrow: 'crypt_spiral',
    blurb: 'Low barrows over the downs joined by passages that wind, loop and dead-end.',
    roster: { normal: ['barrow_hound', 'cairn_rat', 'carrion_moth', 'gallows_owl'], elite: 'barrow_hound' } },
  sunken_temple: { name: 'Sunken temple', ready: true, look: 'hollow', borrow: 'flooded_cistern',
    blurb: 'A cross-shaped temple the marsh swallowed: nave, transept chapels, the apse at the head.',
    roster: { normal: ['bog_slime', 'marsh_wisp', 'sporecap_walker', 'veil_spider'], elite: 'sporecap_walker' } },
};

export const ROOM_KINDS = ['entry', 'arrival', 'fight', 'key', 'miniboss', 'boss', 'reward'];

/** Name parts for dungeon titles (original, no ember/veil). Province culture can override later. */
const NAMES = {
  crypt_spiral: { a: ['Ossuary', 'Crypt', 'Undervault', 'Charnel Ring', 'Bone Cloister'], b: ['of the Hollow Abbot', 'of Saint Orrin', 'of the Quiet Brothers', 'Below Torborhold', 'of the Nine Lamps'] },
  mine_descent: { a: ['Delving', 'Shaft', 'Old Workings', 'Deepcut', 'Seam'], b: ['of the Lost Shift', 'of Gaffer Brann', 'Under the Moor', 'of the Black Seam', 'of the Ninth Ladder'] },
  flooded_cistern: { a: ['Cistern', 'Sluiceworks', 'Drowned Vaults', 'Old Waterworks', 'Underlake'], b: ['of Halsbridge', 'of the Twelve Sluices', 'Under the Market', 'of the Lost Aqueduct', 'of Brother Weir'] },
  fortress_keep: { a: ['Keep', 'Broken Keep', 'Hold', 'Bastion', 'Barracks'], b: ['of the Red Banner', 'of Captain Varro', 'of the Last Garrison', 'on Ashcombe Hill', 'of the Oath-Breakers'] },
  cave_river: { a: ['Caves', 'Underriver', 'Grotto', 'Deeps', 'Echoing Caves'], b: ['of the Blind Eel', 'of the Gullwick Spring', 'Where the River Hides', 'of Dripping Stone', 'of the Lantern Moss'] },
  tower_climb: { a: ['Tower', 'Spire', 'Stair', 'Watchtower', 'Lighthouse'], b: ['of the Mad Astronomer', 'of Hollin Pass', 'of the Seven Bells', 'of the Weathercock', 'of Magister Quill'] },
  barrow_maze: { a: ['Barrows', 'Barrowdowns', 'Howes', 'Mounds', 'Long Barrow'], b: ['of the Nine Kings', 'of Wychwood', 'of the Sleeping Host', 'Under the Thorn', 'of Old Grimbold'] },
  sunken_temple: { a: ['Sunken Temple', 'Drowned Chapel', 'Mire Sanctum', 'Flooded Abbey', 'Reedwater Shrine'], b: ['of the Frog Saint', 'of Brackwater', 'of the Silent Bell', 'of Mother Reed', 'of the Green Lamp'] },
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

/** The encounter sets a family uses: its own, else the family it borrows from (followed until one has sets). */
export function encounterSetsFor(key) {
  const seen = new Set();
  while (FAMILIES[key] && !FAMILIES[key].encounterSets?.length && !seen.has(key)) { seen.add(key); key = FAMILIES[key].borrow || 'crypt_spiral'; }
  return FAMILIES[key].encounterSets;
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
// The CHAIN builder (M2): the six newer families are a room placement + this. Rooms are carved first,
// then joined in order by A* corridors that keep 2 tiles of rock between themselves and anything they
// may not touch. Corridors BEFORE the guarded room (boss on the last floor, else the mini-boss) may
// cross each other (loops, side passages); the corridor INTO the guarded room and everything after it
// touch nothing else, so a gate across that one corridor really shuts the guarded room off.

function noiseField(rng, W, H, cells = 8) {
  const n = cells + 2, v = new Float32Array(n * n).map(() => rng());
  return (i, j) => {
    const x = i / W * cells, y = j / H * cells, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const a = v[yi * n + xi], b = v[yi * n + xi + 1], c = v[(yi + 1) * n + xi], d = v[(yi + 1) * n + xi + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** A* over centreline tiles; `ok(i, j)` = the corridor may run here. Returns [[i, j], …] or null. */
function astar(W, H, from, to, ok, cost) {
  const N = W * H, g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const key = (i, j) => j * W + i, s = key(from[0], from[1]), t = key(to[0], to[1]);
  const h = k => Math.abs(k % W - to[0]) + Math.abs(((k / W) | 0) - to[1]);
  // binary heap of [f, k]
  const heap = [];
  const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const okMemo = new Int8Array(N);              // 0 unknown, 1 ok, -1 blocked
  const allowed = k => { if (!okMemo[k]) okMemo[k] = ok(k % W, (k / W) | 0) ? 1 : -1; return okMemo[k] > 0; };
  g[s] = 0; push(h(s), s);
  const closed = new Uint8Array(N);
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue; closed[k] = 1;
    if (k === t) break;
    const i = k % W, j = (k / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 2 || nj < 2 || ni >= W - 2 || nj >= H - 2) continue;
      const nk = key(ni, nj);
      if (closed[nk] || (nk !== t && !allowed(nk))) continue;
      const turn = prev[k] >= 0 && (prev[k] % W === i) !== (di === 0) ? 0.4 : 0;
      const ng = g[k] + cost(ni, nj) + turn;
      if (ng < g[nk]) { g[nk] = ng; prev[nk] = k; push(ng + h(nk), nk); }
    }
  }
  if (!closed[t]) return null;
  const out = []; for (let k = t; k >= 0; k = prev[k]) out.push([k % W, (k / W) | 0]);
  return out.reverse();
}

const inRect = (r, i, j, m = 0) => i >= r.i - m && j >= r.j - m && i < r.i + r.w + m && j < r.j + r.h + m;

/**
 * Join placed rooms into a floor. `L` = { W, H, rooms (in walk order, kinds set), half, wobble, loops,
 * branches, round }. Returns { grid, rooms, gate } or null if a corridor cannot be routed cleanly.
 */
export const CHAIN_FAILS = {};
const fail = why => { CHAIN_FAILS[why] = (CHAIN_FAILS[why] || 0) + 1; return null; };
function chainFloor(rng, L) {
  const { W, H, rooms } = L, half = L.half ?? 1, clear = half + 2;
  const g = makeGrid(W, H);
  const owner = new Int16Array(W * H).fill(-1);       // which room a tile belongs to
  const ARENA = new Set(['miniboss', 'boss']);
  for (let k = 0; k < rooms.length; k++) {
    const r = rooms[k];
    if (r.i < 2 || r.j < 2 || r.i + r.w > W - 2 || r.j + r.h > H - 2) return fail('room off the floor');
    for (let q = 0; q < k; q++) if (overlaps(rooms[q], r, clear + 1)) return fail('rooms too close');
    for (let j = r.j; j < r.j + r.h; j++) for (let i = r.i; i < r.i + r.w; i++) {
      // rounded corners on ordinary rooms (caves); arenas stay full so their objects stand on floor
      if (L.round && !ARENA.has(r.kind)) { const cx = Math.min(i - r.i, r.i + r.w - 1 - i), cz = Math.min(j - r.j, r.j + r.h - 1 - j); if (cx + cz < L.round) continue; }
      g.carve(i, j); owner[j * W + i] = k;
    }
  }
  const noise = noiseField(rng, W, H);
  const cost = (i, j) => 1 + (L.wobble || 0) * noise(i, j) + (g.get(i, j) ? 0.3 : 0);
  const gi = rooms.findIndex(r => r.kind === 'boss') >= 0 ? rooms.findIndex(r => r.kind === 'boss') : rooms.findIndex(r => r.kind === 'miniboss');
  const carvePath = path => { for (const [i, j] of path) for (let dj = -half; dj <= half; dj++) for (let di = -half; di <= half; di++) g.carve(i + di, j + dj); };
  const corridorTiles = new Uint8Array(W * H);
  const postTiles = new Uint8Array(W * H);          // corridors from the gate on: nothing else may touch them
  const markPath = path => { for (const [i, j] of path) for (let dj = -half; dj <= half; dj++) for (let di = -half; di <= half; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < W && jj < H && owner[jj * W + ii] < 0) corridorTiles[jj * W + ii] = 1; } };
  /** may a corridor between rooms a and b (b may be -1 = open rock) run with its centre on (i, j)? */
  const okFor = (a, b, post) => (i, j) => {
    for (let dj = -clear; dj <= clear; dj++) for (let di = -clear; di <= clear; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 1 || jj < 1 || ii >= W - 1 || jj >= H - 1) return false;
      const k = jj * W + ii, o = owner[k];
      if (o >= 0) { if (o !== a && o !== b) return false; continue; }
      if (post && corridorTiles[k]) return false;
      if (postTiles[k]) return false;
    }
    return true;
  };
  const centre = r => [r.i + (r.w >> 1), r.j + (r.h >> 1)];
  let gatePath = null;
  for (let k = 1; k < rooms.length; k++) {
    const post = k >= gi;
    const path = astar(W, H, centre(rooms[k - 1]), centre(rooms[k]), okFor(k - 1, k, post), cost);
    if (!path) return fail(post ? 'post corridor' : 'pre corridor');
    if (k === gi) gatePath = path;
    carvePath(path); markPath(path);
    if (post) for (const [i, j] of path) for (let dj = -half; dj <= half; dj++) for (let di = -half; di <= half; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < W && jj < H && owner[jj * W + ii] < 0) postTiles[jj * W + ii] = 1; }
  }
  // loops: extra links between rooms before the gate (pre rules)
  for (let n = 0; n < (L.loops || 0); n++) {
    if (gi < 3) break;
    const a = rng.int(gi), b = rng.int(gi);
    if (Math.abs(a - b) < 2) continue;
    const path = astar(W, H, centre(rooms[a]), centre(rooms[b]), okFor(a, b, false), cost);
    if (path && path.length < (W + H) * 0.9) { carvePath(path); markPath(path); }
  }
  // side passages: dead ends off a pre-gate room toward open rock
  for (let n = 0; n < (L.branches || 0); n++) {
    if (gi < 1) break;
    const a = rng.int(gi);
    const to = [3 + rng.int(W - 6), 3 + rng.int(H - 6)];
    const okT = okFor(a, -1, false);
    if (!okT(to[0], to[1])) continue;
    const path = astar(W, H, centre(rooms[a]), to, okT, cost);
    if (path && path.length > 8 && path.length < 40) { carvePath(path); markPath(path); }
  }
  // the gate: the corridor's full cross-section a few tiles outside the guarded room
  const gr = rooms[gi], pr = rooms[gi - 1];
  const enter = gatePath.findIndex(([i, j]) => inRect(gr, i, j));
  let gate = null;
  for (let back = 3; back <= 24 && !gate; back++) {
    const q = enter - back;
    if (q < 1) break;
    const [i, j] = gatePath[q], [pi, pj] = gatePath[q - 1];
    if (inRect(pr, i, j, half + 1) || inRect(gr, i, j, half + 1)) continue;
    const horiz = pj === j;
    gate = horiz ? { i, j: j - half, w: 1, h: 2 * half + 1 } : { i: i - half, j, w: 2 * half + 1, h: 1 };
  }
  if (!gate) { CHAIN_FAILS.lastNoGate = { enter, len: gatePath.length, gr: { ...gr }, pr: { ...pr } }; return fail('no gate spot'); }
  // the gate must be a clean cut: no floor tile beside its two ends
  const ends = gate.w === 1 ? [[gate.i, gate.j - 1], [gate.i, gate.j + gate.h]] : [[gate.i - 1, gate.j], [gate.i + gate.w, gate.j]];
  if (ends.some(([i, j]) => g.get(i, j))) return fail('gate not a clean cut');
  return { grid: g, rooms, gate };
}

/** A family's floor: try its placement + chain until one routes cleanly (the seed stays the seed). */
function buildChain(rng, place, kinds, tries = 40) {
  for (let t = 0; t < tries; t++) {
    const L = place(rng, kinds, t);
    if (!L) continue;
    L.rooms.forEach((r, k) => { r.kind = kinds[k]; });
    const built = chainFloor(rng, L);
    if (built) { if (L.extra) built.extra = L.extra; return built; }
  }
  return null;
}

const sizeFor = (rng, kind, lo = 8, hi = 11) => kind === 'boss' ? 14 + rng.int(2) * 2 : kind === 'miniboss' ? 12 : lo + rng.int(hi - lo + 1);
const roomAt = (ci, cj, w, h) => ({ i: Math.round(ci - w / 2), j: Math.round(cj - h / 2), w, h });

// FAMILY 3 — flooded cistern: chambers on a 4×4 lattice, walked as a snake; channels loop between them.
function placeCistern(rng, kinds) {
  const C = 4, S = 19, W = C * S + 6, H = C * S + 6, n = kinds.length;
  // a random self-avoiding walk of n cells over the lattice
  const walk = [[rng.int(C), rng.int(C)]];
  const used = new Set([walk[0].join()]);
  const step = () => {
    if (walk.length === n) return true;
    const [x, y] = walk[walk.length - 1];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rng() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= C || ny >= C || used.has(nx + ',' + ny)) continue;
      walk.push([nx, ny]); used.add(nx + ',' + ny);
      if (step()) return true;
      walk.pop(); used.delete(nx + ',' + ny);
    }
    return false;
  };
  if (!step()) return null;
  const rooms = walk.map(([x, y], k) => { const s = sizeFor(rng, kinds[k], 8, 10); return roomAt(3 + x * S + S / 2, 3 + y * S + S / 2, s, s); });
  return { W, H, rooms, wobble: 0, loops: 3, branches: 0 };
}

// FAMILY 4 — fortress keep: a gate hall at the bottom, halls in pairs up a central axis, the great hall at the top.
function placeKeep(rng, kinds) {
  const W = 84, H = 106, cx = W / 2, rows = [93, 73, 53, 33, 12];
  const slots = [[cx, rows[0]], [cx - 22, rows[1]], [cx + 22, rows[1]], [cx - 22, rows[2]], [cx + 22, rows[2]], [cx - 22, rows[3]], [cx + 22, rows[3]]];
  const n = kinds.length, rooms = [];
  const last = kinds.includes('boss');
  for (let k = 0; k < n; k++) {
    const kind = kinds[k];
    let p;
    if (kind === 'boss') p = [cx, rows[4] + 2];
    else if (kind === 'reward') p = [cx + (rng() < 0.5 ? -24 : 24), rows[4]];
    else if (kind === 'miniboss' && !last) p = [cx, rows[3] - 4];
    else p = slots[k];
    if (!p) return null;
    const w = kind === 'boss' ? 18 : sizeFor(rng, kind, 9, 12), h = kind === 'boss' ? 14 : sizeFor(rng, kind, 8, 10);
    rooms.push(roomAt(p[0] + (rng.int(3) - 1), p[1] + (rng.int(3) - 1), w, h));
  }
  return { W, H, rooms, wobble: 0, loops: 1, branches: 1 };
}

// FAMILY 5 — cave river: caverns strung along an underground river that meanders across the floor.
function placeCave(rng, kinds) {
  const n = kinds.length, W = 18 * n + 24, H = 80;
  const amp = 10 + rng.int(8), ph = rng() * 6.28, freq = 1.5 + rng();
  const riverZ = i => H / 2 + Math.sin(i / W * Math.PI * freq + ph) * amp;
  const rooms = [];
  for (let k = 0; k < n; k++) {
    const ci = 10 + (W - 20) * (n === 1 ? 0 : k / (n - 1));
    const side = k % 2 ? 1 : -1;
    const s = sizeFor(rng, kinds[k], 9, 12);
    const off = kinds[k] === 'boss' || kinds[k] === 'miniboss' ? 0 : side * (8 + rng.int(6));
    rooms.push(roomAt(ci, Math.max(4 + s / 2, Math.min(H - 4 - s / 2, riverZ(ci) + off)), s, s - (kinds[k] === 'fight' ? rng.int(3) : 0)));
  }
  const river = []; for (let i = 0; i <= W; i += 4) river.push([i, +riverZ(i).toFixed(1)]);
  return { W, H, rooms, half: 2, wobble: 2.5, loops: 1, branches: 2, round: 3, extra: { river } };
}

// FAMILY 6 — tower climb: rooms round the four walls of a square storey, the top chamber in the middle;
// each storey up is a little narrower (the tower tapers).
function placeTower(rng, kinds, t, storey = 0) {
  const W = 70 - storey * 4, H = W, n = kinds.length, c = W / 2;
  const guarded = kinds.includes('boss') ? 'boss' : 'miniboss';
  const ringKinds = kinds.filter(k => k !== guarded && k !== 'reward');
  const m = ringKinds.length, R = c - 9;
  const start = rng.int(8);
  const perim = q => { // 8 slots round a square: corners + mids
    const s = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][(start + q) % 8];
    return [c + s[0] * R, c + s[1] * R];
  };
  const rooms = [];
  let ring = 0;
  for (let k = 0; k < n; k++) {
    const kind = kinds[k];
    if (kind === guarded) { const s = sizeFor(rng, kind); rooms.push(roomAt(c, c, s, s)); continue; }
    if (kind === 'reward') { const p = perim(ring + 1); rooms.push(roomAt(p[0], p[1], 8, 8)); continue; }
    const p = perim(ring++); const s = sizeFor(rng, kind, 8, 9);
    rooms.push(roomAt(p[0], p[1], s, s));
  }
  if (m > 7) return null;
  return { W, H, rooms, wobble: 0.3, loops: 0, branches: 0 };
}

// FAMILY 7 — barrow maze: low barrows scattered over the downs, joined by winding passages that loop and dead-end.
function placeBarrow(rng, kinds) {
  const W = 84, H = 84, rooms = [];
  for (let k = 0; k < kinds.length; k++) {
    const s = sizeFor(rng, kinds[k], 7, 9);
    let r = null;
    for (let t = 0; t < 200 && !r; t++) {
      const cand = roomAt(6 + s / 2 + rng() * (W - 12 - s), 6 + s / 2 + rng() * (H - 12 - s), s, s);
      if (rooms.some(o => overlaps(o, cand, 9))) continue;
      // keep the walk wandering but not absurd: each barrow within reach of the last
      if (k && Math.hypot(cand.i - rooms[k - 1].i, cand.j - rooms[k - 1].j) > 42) continue;
      r = cand;
    }
    if (!r) return null;
    rooms.push(r);
  }
  return { W, H, rooms, wobble: 3.5, loops: 2, branches: 5 };
}

// FAMILY 8 — sunken temple: a cross-shaped temple — nave up the middle, chapels out on the transepts,
// the apse (boss) at the head and a reliquary beside it.
function placeTemple(rng, kinds) {
  const W = 92, H = 100, cx = W / 2, n = kinds.length, last = kinds.includes('boss');
  // the walk: west aisle up, across the nave below the crossing, east aisle down, then into the crossing
  const slots = [[cx, 88], [cx - 30, 76], [cx - 30, 50], [cx + 30, 50], [cx + 30, 76]];
  const rooms = [];
  for (let k = 0; k < n; k++) {
    const kind = kinds[k];
    let p;
    if (kind === 'boss') p = [cx, 15];
    else if (kind === 'reward') p = [cx + (rng() < 0.5 ? -28 : 28), 14];
    else if (kind === 'miniboss') p = last ? [cx, 46] : [cx, 24];
    else p = slots[k];
    if (!p) return null;
    const s = sizeFor(rng, kind, 8, 11);
    rooms.push(roomAt(p[0] + rng.int(3) - 1, p[1] + rng.int(3) - 1, kind === 'boss' ? s + 2 : s, s));
  }
  return { W, H, rooms, wobble: 0.2, loops: 1, branches: 0 };
}

const CHAIN = { flooded_cistern: placeCistern, fortress_keep: placeKeep, cave_river: placeCave, tower_climb: placeTower, barrow_maze: placeBarrow, sunken_temple: placeTemple };

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
 *        `set` picks one of the family's encounter sets (default: the seed picks).
 *        `encounters` overrides the set's { miniboss: [{id, type}], boss: {id, type} }.
 *        `arenas` = { encounterId: script.arena.objects } (the JSON in data/encounters/); when given,
 *        each boss/mini-boss room lists its arena objects as `props` (the encounter engine spawns the
 *        real objects itself — props are for the viewer, the client's dressing and the tests).
 */
export function planDungeon(seed, { floors = 2, level = 3, family = 'crypt_spiral', encounters = null, arenas = null, set = null } = {}) {
  floors = Math.max(1, Math.min(4, floors | 0));
  const key = familyFor(family);
  const fam = FAMILIES[key];
  const rng = rngOf((seed >>> 0) ^ hash(key));
  const sets = encounterSetsFor(key);
  const setIndex = set != null ? set % sets.length : rng.int(sets.length);
  const enc = { ...sets[setIndex], ...(encounters || {}) };
  const names = NAMES[key];
  const out = {
    family: key, familyName: fam.name, look: fam.look, level, seed: seed >>> 0, cell: CELL,
    name: `The ${rng.pick(names.a)} ${rng.pick(names.b)}`,
    encounters: { set: setIndex, setName: sets[setIndex].name || null, miniboss: [], boss: null },
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
    } else if (key === 'mine_descent') {
      const list = [start, 'fight', 'fight', 'key', 'fight', 'miniboss'];
      if (last) list.push('boss', 'reward');
      built = mineFloor(rng, { list });
    } else {
      const list = [start, 'fight', 'fight', 'key', 'fight', 'miniboss'];
      if (last) list.push('boss', 'reward');
      const place = key === 'tower_climb' ? (r, k, t) => placeTower(r, k, t, f) : CHAIN[key];
      built = buildChain(rng, place, list);
      if (!built) throw new Error(`dungeon-tiers: ${key} could not route floor ${f} for seed ${seed}`);
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
    if (built.extra?.river) floor.river = built.extra.river.map(([i, j]) => ({ x: origin.x + i * CELL, z: origin.z + j * CELL }));
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
