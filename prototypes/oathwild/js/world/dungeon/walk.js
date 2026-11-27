// Oathwild dungeons — the walk grid: the ONE truth for where feet go inside a dungeon (brainstorm 2026-11-27-regions §3).
// Heroes, monsters, pets, knockbacks, spawns and dropped loot all ask it. Pure.
//
//   const W = createWalk(plan, state?)   plan = plan.js planDungeon(), state = features.js featureState() (gates, secret doors)
//
// It has the same method names as js/game/ground.js createGround(), so the server and the browser's prediction can use
// either one as `ground`:
//   W.settle(prev, next, { body = 0.4, solid = true }) → { x, z }
//        the move from prev toward next, swept in pieces ≤ 0.5 m, sliding along walls and round columns. A body that
//        STARTS off the grid (knockback, lag, a bad spawn) is first snapped back to the nearest open tile — never
//        "already blocked, so free to move". It never ends off the grid. (solid: false skips only the low things —
//        sarcophagi — never walls or columns.)
//   W.y(x, z) = W.heightAt(x, z)   floor height (ramps slope smoothly)
//   W.standAt(x, z)                 the spot itself if a body fits there, else the nearest open tile centre
//   W.snapToWalkable(x, z, body?)   the nearest open tile centre (for a body found off the grid)
//   W.walkable(x, z)                is this point open floor (not wall, pit, shut gate or column)?
//   W.fits(x, z, body?)             does a body of that radius fit here?
//   W.stepOk(ax, az, bx, bz, body?) may a body step from a to b (b fits, no ledge)?
//   W.solidsNear(x, z, r) / W.solids   the round colliders: columns { kind: 'column', h } + sarcophagi
//   W.swimming() false · W.inBox() false · W.boxes []   (ground.js has them; nothing swims or has boxes in here)
// Also for sight.js / path.js / camera.js / encounters.js:
//   W.cols, W.rows, W.tile, W.tileOf(x, z), W.centre(t), W.pass[t] (a body can stand on tile t), W.see(t) (sight passes),
//   W.air(x, y, z) (camera space), W.clearance() (metres from each tile centre to the nearest wall / column),
//   W.setOpen(featureId, open) (a gate or secret door), W.version (bumps when the grid changes; caches key on it)
import { CODE } from './features.js';
import { rampY } from './plan.js';

const PIECE = 0.5;        // a move is checked every half metre
const MAX_STEP_RISE = 0.6;

export function createWalk(plan, state = null) {
  const { cols, rows } = plan, T = plan.tile || 2, N = cols * rows;
  const cells = Uint8Array.from(plan.cells), heights = Float32Array.from(plan.heights), ceil = Float32Array.from(plan.ceiling);
  const featAt = new Map(), open = new Set();
  for (const f of plan.features) if (f.tiles) for (const t of f.tiles) featAt.set(t, f.id);
  for (const [id, v] of Object.entries(state?.open || {})) if (v) open.add(id);
  const stairOf = new Int16Array(N).fill(-1);
  plan.stairs.forEach((s, j) => { for (let k = s.tiles.z; k < s.tiles.z + s.tiles.h; k++) for (let i = s.tiles.x; i < s.tiles.x + s.tiles.w; i++) stairOf[k * cols + i] = j; });

  // round colliders, hashed by every tile they come within 1 m of
  const solids = [
    ...plan.columns.map(c => ({ x: c.x, z: c.z, r: c.r, h: c.h, kind: 'column', tall: true })),
    ...plan.features.filter(f => f.solid).map(f => ({ x: f.at[0], z: f.at[1], r: f.r, h: f.h, kind: f.kind, id: f.id, tall: false })),
  ];
  const byTile = new Map();
  for (const s of solids) eachTile(s.x, s.z, s.r + 1, t => { if (!byTile.has(t)) byTile.set(t, []); byTile.get(t).push(s); });
  function eachTile(x, z, r, fn) {
    const i0 = Math.max(0, Math.floor((x - r) / T)), i1 = Math.min(cols - 1, Math.floor((x + r) / T));
    const k0 = Math.max(0, Math.floor((z - r) / T)), k1 = Math.min(rows - 1, Math.floor((z + r) / T));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * cols + i);
  }

  const tileOf = (x, z) => { const i = Math.floor(x / T), k = Math.floor(z / T); return i < 0 || k < 0 || i >= cols || k >= rows ? -1 : k * cols + i; };
  const centre = t => ({ x: (t % cols + 0.5) * T, z: (Math.floor(t / cols) + 0.5) * T });
  const tileOpen = t => { const c = cells[t]; return c === CODE.FLOOR || ((c === CODE.GATE || c === CODE.SECRET) && open.has(featAt.get(t))); };
  const floorTile = new Uint8Array(N), pass = new Uint8Array(N);
  function rebuild() {
    for (let t = 0; t < N; t++) floorTile[t] = tileOpen(t) ? 1 : 0;
    for (let t = 0; t < N; t++) {
      pass[t] = floorTile[t];
      if (!pass[t]) continue;
      const c = centre(t);
      for (const s of byTile.get(t) || []) if (Math.hypot(c.x - s.x, c.z - s.z) < s.r + 0.45) { pass[t] = 0; break; }
    }
    api.version++; clear = null;
  }

  function hitSolid(x, z, body, solid) {
    const t = tileOf(x, z);
    for (const s of byTile.get(t) || []) if ((s.tall || solid) && Math.hypot(x - s.x, z - s.z) < s.r + body) return s;
    return null;
  }
  const onFloor = (x, z) => { const t = tileOf(x, z); return t >= 0 && floorTile[t] === 1; };
  const D = 0.7071;
  function fits(x, z, body = 0.4, solid = true) {
    if (!onFloor(x, z)) return false;
    if (!onFloor(x + body, z) || !onFloor(x - body, z) || !onFloor(x, z + body) || !onFloor(x, z - body)) return false;
    const b = body * D;
    if (!onFloor(x + b, z + b) || !onFloor(x - b, z + b) || !onFloor(x + b, z - b) || !onFloor(x - b, z - b)) return false;
    return !hitSolid(x, z, body, solid);
  }
  function heightAt(x, z) {
    const t = tileOf(x, z);
    if (t < 0) return 0;
    return stairOf[t] >= 0 ? rampY(plan.stairs[stairOf[t]], x, z) : heights[t];
  }
  const walkable = (x, z) => onFloor(x, z) && !hitSolid(x, z, 0, true);
  function stepOk(ax, az, bx, bz, body = 0.4, solid = true) {
    if (!fits(bx, bz, body, solid)) return false;
    return Math.abs(heightAt(bx, bz) - heightAt(ax, az)) <= MAX_STEP_RISE;
  }
  function pushOut(p, body, solid) {
    for (let n = 0; n < 2; n++) {
      const t = tileOf(p.x, p.z);
      for (const s of byTile.get(t) || []) {
        if (!s.tall && !solid) continue;
        const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = s.r + body + 1e-3;
        if (d < min) { if (d < 1e-6) { p.x = s.x + min; } else { p.x = s.x + dx / d * min; p.z = s.z + dz / d * min; } }
      }
    }
    return p;
  }
  /** The nearest open tile centre a body fits on (rings outward; stops once a ring can no longer be nearer). */
  function snapToWalkable(x, z, body = 0.4) {
    const i0 = Math.min(cols - 1, Math.max(0, Math.floor(x / T))), k0 = Math.min(rows - 1, Math.max(0, Math.floor(z / T)));
    let best = null, bestD = Infinity;
    for (let r = 0; r < Math.max(cols, rows); r++) {
      if ((r - 1) * T > bestD) break;
      for (let k = k0 - r; k <= k0 + r; k++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(k - k0)) !== r || i < 0 || k < 0 || i >= cols || k >= rows) continue;
        const t = k * cols + i;
        if (!pass[t]) continue;
        const c = centre(t);
        if (!fits(c.x, c.z, body)) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    return best || { x, z };
  }
  const standAt = (x, z, body = 0.4) => fits(x, z, body) ? { x, z } : snapToWalkable(x, z, body);

  function settle(prev, next, { body = 0.4, solid = true } = {}) {
    let sx = prev.x, sz = prev.z;
    if (!fits(sx, sz, body, solid)) { const s = snapToWalkable(sx, sz, body); sx = s.x; sz = s.z; }
    const dist = Math.hypot(next.x - sx, next.z - sz);
    if (!(dist > 1e-6)) return { x: sx, z: sz };
    const pieces = Math.max(1, Math.ceil(dist / PIECE));
    // every piece is a short step from where the body IS (never from the straight line), so a refused piece can never
    // be skipped over by a later one (no hopping a pit or a thin wall)
    const ux = (next.x - sx) / pieces, uz = (next.z - sz) / pieces;
    let cx = sx, cz = sz;
    for (let i = 1; i <= pieces; i++) {
      const tx = cx + ux, tz = cz + uz;
      const p = pushOut({ x: tx, z: tz }, body, solid);
      if (Math.hypot(p.x - cx, p.z - cz) <= PIECE * 1.5 && stepOk(cx, cz, p.x, p.z, body, solid)) { cx = p.x; cz = p.z; continue; }
      if (Math.abs(ux) > 1e-9 && stepOk(cx, cz, tx, cz, body, solid)) { cx = tx; continue; }        // slide along x
      if (Math.abs(uz) > 1e-9 && stepOk(cx, cz, cx, tz, body, solid)) { cz = tz; continue; }        // slide along z
      break;
    }
    return { x: cx, z: cz };
  }
  function solidsNear(x, z, r = 2) {
    const out = new Set();
    eachTile(x, z, r, t => { for (const s of byTile.get(t) || []) if (Math.hypot(x - s.x, z - s.z) < s.r + r) out.add(s); });
    return [...out];
  }
  /** Sight passes this tile: floor, pit, any gate (bars), an open secret door — not rock or a shut secret door. */
  const see = t => { const c = cells[t]; return c === CODE.FLOOR || c === CODE.CHASM || c === CODE.GATE || (c === CODE.SECRET && open.has(featAt.get(t))); };
  /** Is (x, y, z) open space a camera may sit in? Under the ceiling, above the floor (a pit has none), not in a column. */
  function air(x, y, z) {
    const t = tileOf(x, z);
    if (t < 0) return false;
    const c = cells[t];
    const isAir = c === CODE.FLOOR || c === CODE.CHASM || ((c === CODE.GATE || c === CODE.SECRET) && open.has(featAt.get(t)));
    if (!isAir) return false;
    const f = heightAt(x, z);
    if (y > f + ceil[t]) return false;
    if (c !== CODE.CHASM && y < f) return false;
    for (const s of byTile.get(t) || []) if (s.tall && y < f + s.h && Math.hypot(x - s.x, z - s.z) < s.r) return false;
    return true;
  }
  let clear = null;
  /** Metres from each tile centre to the nearest blocked tile edge or column / sarcophagus surface (cached per version). */
  function clearance() {
    if (clear) return clear;
    const d = new Int32Array(N).fill(1e9), q = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let t = 0; t < N; t++) if (!floorTile[t]) { d[t] = 0; q[qt++] = t; }
    while (qh < qt) {
      const t = q[qh++], i = t % cols, k = (t / cols) | 0;
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nk = k + dk; if (ni < 0 || nk < 0 || ni >= cols || nk >= rows) continue;
        const n = nk * cols + ni; if (d[n] > d[t] + 1) { d[n] = d[t] + 1; q[qt++] = n; }
      }
    }
    clear = new Float32Array(N);
    for (let t = 0; t < N; t++) clear[t] = d[t] === 0 ? 0 : Math.min(d[t] >= 1e9 ? 999 : (d[t] - 0.5) * T, 999);
    for (const s of solids) eachTile(s.x, s.z, s.r + 12, t => { if (!floorTile[t]) return; const c = centre(t); clear[t] = Math.min(clear[t], Math.max(0, Math.hypot(c.x - s.x, c.z - s.z) - s.r)); });
    return clear;
  }
  function setOpen(id, isOpenNow) {
    if (isOpenNow) open.add(id); else open.delete(id);
    rebuild();
  }

  const api = {
    plan, cols, rows, tile: T, version: 0, cells, ceil, solids,
    settle, y: heightAt, heightAt, standAt, snapToWalkable, walkable, fits, stepOk, solidsNear,
    swimming: () => false, inBox: () => false, boxes: [],
    tileOf, centre, pass, see, air, clearance, setOpen, isOpen: id => open.has(id), tileOpen: t => floorTile[t] === 1,
  };
  rebuild();
  return api;
}
