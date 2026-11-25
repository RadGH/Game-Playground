// Oathwild — where a body may stand, for the server AND the browser's own-hero prediction (one function, so the
// drawn hero and the server's hero walk the same ground — lessons rule 22).
//
//   const G = createGround(T, placements, scattered, town)   T = js/world/terrain.js, scattered = js/world/scatter.js result,
//                                      town = js/world/town.js plan (its houses, stalls and terrace walls are solid boxes)
//   G.settle(prev, next)  → { x, z }   the step from prev to next, refused / slid along where the ground says no:
//                                      off the walkable ground (cliffs, out of bounds — deep water is SWUM, see swimming()), up or down a ledge
//                                      steeper than the walk limit, onto or off a bridge deck except at its ends, or
//                                      into a building, rock or tree trunk (pushed out of its circle)
//   G.y(x, z)            walked height (bridge decks win)
//   G.solidsNear(x, z, r) the round colliders near a point (tests, debug drawing)
//   G.swimming(x, z)     true in deep water (rivers, marsh pools): swim speed, no sprint / dodge / horse
//
// The combat sim (js/rules/combat.js) moves bodies on a flat plane; the server calls settle() for every unit that
// moved after each step. Pure: no DOM, no three.js.

const CELL = 8;

export function createGround(T, placements = null, scattered = null, town = null) {
  const maxRise = Math.tan(T.limits.maxSlope * Math.PI / 180);
  // round colliders: buildings (footprint), solid props, tree trunks, solid decor
  const grid = new Map();
  const key = (i, k) => i * 100003 + k;
  const solids = [];
  function add(x, z, r) {
    if (!(r > 0)) return;
    const s = { x, z, r };
    solids.push(s);
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const kk = key(i, k); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(s); }
  }
  if (placements) {
    for (const b of placements.buildings || []) add(b.at[0], b.at[1], (b.footprint || 6) * 0.42);
    for (const p of placements.props || []) if (p.r && p.r >= 0.6 && !p.walk) add(p.at[0], p.at[1], p.r * 0.8);
  }
  if (scattered) {
    for (const t of scattered.trees || []) add(t.x, t.z, Math.max(0.3, (t.r || 0.5) * 0.85));     // the trunk (scatter.js TREE_SPECIES)
    for (const d of scattered.decor || []) if (d.solid) add(d.x, d.z, (d.r || 1) * 0.8);
  }
  for (const t of town?.trees || []) add(t.x, t.z, Math.max(0.3, (t.r || 0.5) * 0.85));   // the towns' own trees (js/world/town.js)
  for (const c of town?.circles || []) add(c.x, c.z, c.r);                                   // the fountain
  // oriented boxes (town houses, stalls, terrace walls): pushed out of along the shallower side
  const bgrid = new Map(), boxes = [];
  for (const b of town?.boxes || []) {
    const c = Math.cos(b.facing), sn = Math.sin(b.facing), R = Math.hypot(b.hw, b.hd);
    const bx = { x: b.x, z: b.z, hw: b.hw, hd: b.hd, c, s: sn, R };
    boxes.push(bx);
    const i0 = Math.floor((b.x - R) / CELL), i1 = Math.floor((b.x + R) / CELL), k0 = Math.floor((b.z - R) / CELL), k1 = Math.floor((b.z + R) / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const kk = key(i, k); if (!bgrid.has(kk)) bgrid.set(kk, []); bgrid.get(kk).push(bx); }
  }
  function boxesNear(x, z) { return bgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []; }
  function pushBoxes(p, body) {
    for (const b of boxesNear(p.x, p.z)) {
      const dx = p.x - b.x, dz = p.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      const ox = b.hw + body - Math.abs(lx), oz = b.hd + body - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      let nx = lx, nz = lz;
      if (ox < oz) nx = Math.sign(lx || 1) * (b.hw + body); else nz = Math.sign(lz || 1) * (b.hd + body);
      // back to world: the inverse turn
      p.x = b.x + nx * b.c + nz * b.s; p.z = b.z - nx * b.s + nz * b.c;
    }
  }
  /** Is (x, z) inside a solid box (grown by `pad`)? */
  function inBox(x, z, pad = 0) {
    for (const b of boxesNear(x, z)) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad) return true; }
    return false;
  }
  function solidsNear(x, z, r = 2) {
    const out = new Set();
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) for (const s of grid.get(key(i, k)) || []) out.add(s);
    return [...out];
  }
  const y = (x, z) => T.walkHeightAt(x, z).y;

  function stepOk(ax, az, bx, bz) {
    if (!T.walkable(bx, bz) && !T.swimmable(bx, bz)) return false;          // deep water is swum, not a wall
    if (boxes.length && inBox(bx, bz, 0.3) && !inBox(ax, az, 0.3)) return false;   // a house wall (a body already inside one may walk out)
    const h0 = T.walkHeightAt(ax, az), h1 = T.walkHeightAt(bx, bz);
    const d = Math.hypot(bx - ax, bz - az);
    if (Math.abs(h1.y - h0.y) > Math.max(0.35, maxRise * d * 1.25)) return false;   // a ledge, not a slope
    if ((h0.on === 'deck') !== (h1.on === 'deck') && Math.abs(h1.y - h0.y) > 0.6) return false;   // a bridge side
    return true;
  }
  function pushOut(p, body = 0.4) {
    for (let n = 0; n < 2; n++) for (const s of solidsNear(p.x, p.z, body + 3)) {
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = s.r + body;
      if (d < min) { const k = d > 1e-4 ? (min - d) / d : 0; p.x += d > 1e-4 ? dx * k : min; p.z += dz * k; }
    }
    if (boxes.length) pushBoxes(p, body);
    return p;
  }
  /** One step: from prev toward next, as far as the ground allows (sliding along an edge). */
  function settle(prev, next, { body = 0.4, solid = true } = {}) {
    let x = next.x, z = next.z;
    const dist = Math.hypot(x - prev.x, z - prev.z);
    if (dist < 1e-6) return { x, z };
    // long moves (a dash, a dodge, a knock) are checked in short pieces so they stop at the first wall
    const pieces = Math.max(1, Math.ceil(dist / 0.9));
    let cx = prev.x, cz = prev.z;
    for (let i = 1; i <= pieces; i++) {
      const tx = prev.x + (x - prev.x) * i / pieces, tz = prev.z + (z - prev.z) * i / pieces;
      if (stepOk(cx, cz, tx, tz)) { cx = tx; cz = tz; continue; }
      if (stepOk(cx, cz, tx, cz)) { cx = tx; continue; }        // slide along x
      if (stepOk(cx, cz, cx, tz)) { cz = tz; continue; }        // slide along z
      break;
    }
    const p = { x: cx, z: cz };
    if (solid) {
      pushOut(p, body);
      if (!stepOk(prev.x, prev.z, p.x, p.z) && !(p.x === prev.x && p.z === prev.z)) { p.x = cx; p.z = cz; }
    }
    return p;
  }
  /** Nearest standing spot to (x, z) (a spawn on a bad cell walks out in a little spiral). */
  function standAt(x, z) {
    if (T.walkable(x, z)) return pushOut({ x, z });
    for (let r = 1; r < 30; r += 1) for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * Math.PI / 4) * r, pz = z + Math.sin(a * Math.PI / 4) * r;
      if (T.walkable(px, pz)) return pushOut({ x: px, z: pz });
    }
    return { x, z };
  }
  /** Is a body at (x, z) swimming (deep water)? The server slows it and the browser's prediction does the same. */
  const swimming = (x, z) => T.walkHeightAt(x, z).on === 'swim';
  return { settle, y, solidsNear, standAt, solids, stepOk, swimming, inBox, boxes };
}
