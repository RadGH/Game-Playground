// What the ground is painted with, worked out from the same data the server walks (pure: runs in Node for the tests).
// js/client/render/ground.js draws it; data/ground.json holds every knob.
//
//   const S = paintGround(T, { placements, art, cfg, res })   → { nx, nz, res, minX, minZ, A, B }  two RGBA Uint8 maps,
//        one texel per `res` metres over the whole map: A = grass, wild, forest, dirt; B = cobble, soil, sand, marsh
//        (cfg.layers order; the weights of a texel add up to 255). Rock is laid on by slope in the shader.
//   weightsAt(S, x, z)                                       → { grass: 0.7, dirt: 0.3, … } (tests, grass density)
//   const F = planFields(T, { placements, art, cfg })        → { parts: [{ mesh, colour, x, y, z, w, h, d, yaw, rx, rz }],
//        fences: same, strips: [{ field, crop, at, size, angle }] }  — crops strip by strip and the fence round each
//        field, every part on the ground under it and none on a road, in water or in a building or prop's footprint.
//   blockers(T, { placements, art })                          → { hit(x, z, pad) } the footprints crops and fences avoid
//
// How a texel is painted (in this order, each laid over what is under it):
//   1. the terrain's biome, blended between the four nearest 4 m biome cells (soft edges, no stair steps);
//      roads, towns and fields underneath count as the region's own grass (they are painted next, exactly)
//   2. fields: soil inside each field's rectangle, with grass baulks between the crop strips
//   3. wear: a trodden band either side of every road, patchy trodden ground in towns, packed earth round buildings
//      and yard props (wells, stalls, carts…), dirt squares
//   4. roads: worn dirt their own width (+ extra), the edge fading over `soft` metres with a little noise so it wanders
//   5. towns: cobbled streets (the roads inside the town, fading out at its edge) and cobbled squares
import { makeNoise2D, fbm, smoothstep, clamp } from '../../../../../worldgen/js/noise.js';
import { cropField, fenceLine } from '../../../../../proctown/js/propkit.js';
import { BIOMES, segDist } from '../../world/terrain.js';

const CH = 8;          // splat channels

/** Layer index by id (cfg.layers order). */
export const layerIndex = cfg => Object.fromEntries(cfg.layers.map((l, i) => [l.id, i]));

/** Oriented-box footprint test helper: is (x, z) inside the box at `at`, `size` [w, d], turned `facing`, grown by pad? */
function inBox(x, z, at, w, d, facing, pad) {
  const c = Math.cos(facing), s = Math.sin(facing), dx = x - at[0], dz = z - at[1];
  const lx = dx * c - dz * s, lz = dx * s + dz * c;          // three.js rotation.y = facing, inverted
  return Math.abs(lx) <= w / 2 + pad && Math.abs(lz) <= d / 2 + pad;
}
/** Signed distance outside an oriented rounded box (negative inside). */
function boxDist(x, z, at, w, d, angle, round = 0) {
  const c = Math.cos(angle), s = Math.sin(angle), dx = x - at[0], dz = z - at[1];
  const lx = Math.abs(dx * c - dz * s) - (w / 2 - round), lz = Math.abs(dx * s + dz * c) - (d / 2 - round);
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0) - round;
}

/** Footprints of everything standing in the world (buildings, props, shrines, chests, objects) for crops and fences. */
export function blockers(T, { placements, art }) {
  const size = new Map((art.scenery || []).map(a => [a.id, a.size || a.placeholder?.size || [2, 2, 2]]));
  const boxes = [];
  for (const b of placements.buildings || []) { const [w, , d] = size.get(b.art) || [6, 6, 6]; boxes.push({ at: b.at, w, d, facing: b.facing || 0 }); }
  for (const k of ['props', 'shrines', 'chests', 'objects']) for (const p of placements[k] || []) {
    const [w, , d] = size.get(p.art) || [1.5, 1, 1.5];
    boxes.push({ at: p.at, w: Math.max(w, 1), d: Math.max(d, 1), facing: p.facing || 0 });
  }
  return {
    boxes,
    hit(x, z, pad = 1) {
      for (const b of boxes) if (Math.abs(x - b.at[0]) < 14 + pad && Math.abs(z - b.at[1]) < 14 + pad && inBox(x, z, b.at, b.w, b.d, b.facing, pad)) return true;
      return false;
    },
  };
}

// ------------------------------------------------------------------------------------------------ the splat
export function paintGround(T, { placements, art, cfg, res = 1, trees = [] }) {
  const L = layerIndex(cfg), B0 = T.bounds;
  const nx = Math.round((B0.maxX - B0.minX) / res), nz = Math.round((B0.maxZ - B0.minZ) / res);
  const W = new Float32Array(nx * nz * CH);
  const noise = makeNoise2D((T.seed || 1) + 77);
  const wob = (x, z) => fbm(noise, x / 9, z / 9, { octaves: 2 }) - 0.5;          // −0.5..0.5, a few metres across
  const cx = i => B0.minX + (i + 0.5) * res, cz = k => B0.minZ + (k + 0.5) * res;

  // 1. biomes, bilinear between the 4 nearest biome cells
  const BG = T.biomeGrid, regionLayer = (x, z) => L[cfg.biomes[T.map.regions[T.regionAt(x, z)]?.ground] || 'grass'] ?? 0;
  const UNDER = new Set(['road', 'trail', 'boardwalk', 'field', 'village']);
  const cellLayer = new Int8Array(BG.nx * BG.nz);
  for (let k = 0; k < BG.nz; k++) for (let i = 0; i < BG.nx; i++) {
    const b = BIOMES[BG.ids[k * BG.nx + i]], x = BG.minX + (i + 0.5) * BG.cell, z = BG.minZ + (k + 0.5) * BG.cell;
    const wet = b === 'water' && T.waterAt(x, z)?.kind === 'marsh';           // a marsh pool's bed is marsh, a river's is sand
    cellLayer[k * BG.nx + i] = UNDER.has(b) && b !== 'boardwalk' ? regionLayer(x, z) : wet ? L.marsh : (L[cfg.biomes[b]] ?? 0);
  }
  const ROCK = L.rock;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = cx(i), z = cz(k);
    const fx = clamp((x - BG.minX) / BG.cell - 0.5, 0, BG.nx - 1.001), fz = clamp((z - BG.minZ) / BG.cell - 0.5, 0, BG.nz - 1.001);
    const i0 = Math.floor(fx), k0 = Math.floor(fz), u = fx - i0, v = fz - k0, o = (k * nx + i) * CH;
    const add = (ci, ck, w) => { let l = cellLayer[ck * BG.nx + ci]; if (l === ROCK || l >= CH) l = L.dirt; W[o + l] += w; };
    add(i0, k0, (1 - u) * (1 - v)); add(i0 + 1, k0, u * (1 - v)); add(i0, k0 + 1, (1 - u) * v); add(i0 + 1, k0 + 1, u * v);
  }

  // a place may ask for its own ground (map.json places[id].paint = { layer, radius, soft }): the arena's sand floor and
  // its gate passage (data/arena/map.json). Grass tufts grow only on the grass layers, so none comes up through it.
  for (const p of Object.values(T.places)) {
    const P = p.paint; if (!P || L[P.layer] == null) continue;
    const r = P.radius, soft = P.soft ?? 2;
    for (let k = 0; k < nz; k++) { const z = cz(k); if (Math.abs(z - p.at[1]) > r + soft) continue; for (let i = 0; i < nx; i++) { const x = cx(i), d = Math.hypot(x - p.at[0], z - p.at[1]); if (d > r + soft) continue; const m = d <= r ? 1 : 1 - (d - r) / soft, o = (k * nx + i) * CH; for (let c = 0; c < CH; c++) W[o + c] *= 1 - m; W[o + L[P.layer]] += m; } }
  }

  // helpers: a coverage mask laid over everything below it
  const over = (layer, mask) => {
    for (let j = 0; j < nx * nz; j++) {
      const m = mask[j]; if (m <= 0) continue;
      const o = j * CH; for (let c = 0; c < CH; c++) W[o + c] *= 1 - m; W[o + layer] += m;
    }
  };
  const newMask = () => new Float32Array(nx * nz);
  /** Visit the texels of a world box. */
  const box = (x0, z0, x1, z1, fn) => {
    const i0 = clamp(Math.floor((x0 - B0.minX) / res), 0, nx - 1), i1 = clamp(Math.ceil((x1 - B0.minX) / res), 0, nx - 1);
    const k0 = clamp(Math.floor((z0 - B0.minZ) / res), 0, nz - 1), k1 = clamp(Math.ceil((z1 - B0.minZ) / res), 0, nz - 1);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * nx + i, cx(i), cz(k));
  };
  const put = (mask, j, v) => { if (v > mask[j]) mask[j] = v; };
  const towns = Object.entries(T.places).filter(([, p]) => p.kind === 'town').map(([id, p]) => ({ id, ...p, cfg: cfg.towns?.[id] }));

  // 2. fields: soil, with grass baulks between the strips
  const soil = newMask(), baulk = newMask();
  for (const f of T.map.fields || []) {
    const [sx, sz] = f.size, r = Math.hypot(sx, sz) / 2 + 2;
    const strips = fieldStrips(f, cfg.fields);
    box(f.at[0] - r, f.at[1] - r, f.at[0] + r, f.at[1] + r, (j, x, z) => {
      const d = boxDist(x, z, f.at, sx, sz, -f.angle, 1.5) + wob(x, z) * 0.8;
      const m = 1 - smoothstep(-0.6, 0.8, d);
      if (m <= 0) return;
      put(soil, j, m);
      for (const s of strips.cuts) {        // the line between two strips, in field-local metres along the long side
        const c = Math.cos(f.angle), sn = Math.sin(f.angle), dx = x - f.at[0], dz = z - f.at[1];
        const lx = dx * c + dz * sn, lz = -dx * sn + dz * c, along = strips.longX ? lx : lz;
        const b = 1 - smoothstep(cfg.fields.baulk * 0.35, cfg.fields.baulk * 0.75, Math.abs(along - s));
        if (b > 0) put(baulk, j, b * m);
      }
    });
  }
  over(L.soil, soil);
  over(L.grass, baulk);

  // 3. wear: trodden bands beside roads, trodden town ground, yards, dirt squares
  const wear = newMask(), road = newMask(), cobble = newMask();
  for (const t of towns) {
    if (!t.cfg) continue;
    const R = t.radius;
    box(t.at[0] - R, t.at[1] - R, t.at[0] + R, t.at[1] + R, (j, x, z) => {
      const d = Math.hypot(x - t.at[0], z - t.at[1]);
      const patch = smoothstep(0.42, 0.62, fbm(noise, x / 14 + 31, z / 14, { octaves: 3 }));
      put(wear, j, t.cfg.trodden * (1 - smoothstep(R * 0.45, R, d)) * (0.35 + 0.65 * patch));
    });
  }
  const yardIds = new Set(cfg.yardProps || []);
  const size = new Map((art.scenery || []).map(a => [a.id, a.size || a.placeholder?.size || [2, 2, 2]]));
  const townOf = (x, z) => towns.find(t => t.cfg && Math.hypot(x - t.at[0], z - t.at[1]) < t.radius + 10);
  const yard = (at, w, d, facing, Y) => {
    const r = Math.hypot(w, d) / 2 + Y.pad + Y.soft + 1;
    box(at[0] - r, at[1] - r, at[0] + r, at[1] + r, (j, x, z) => {
      const dd = boxDist(x, z, at, w + Y.pad * 2, d + Y.pad * 2, facing, Math.min(w, d) * 0.3) + wob(x, z) * 1.6;
      put(wear, j, Y.strength * (1 - smoothstep(-Y.soft * 0.4, Y.soft, dd)));
    });
  };
  for (const b of placements.buildings || []) {
    const t = townOf(b.at[0], b.at[1]); const Y = t?.cfg.yards || { pad: 1.6, soft: 2, strength: 0.6 };
    const [w, , d] = size.get(b.art) || [6, 6, 6];
    yard(b.at, w, d, b.facing || 0, Y);
  }
  for (const p of placements.props || []) {
    if (!yardIds.has(p.art)) continue;
    const t = townOf(p.at[0], p.at[1]); const Y = t?.cfg.yards || { pad: 1.2, soft: 1.6, strength: 0.5 };
    const [w, , d] = size.get(p.art) || [2, 2, 2];
    yard(p.at, w, d, p.facing || 0, { ...Y, pad: Y.pad * 0.6 });
  }
  // roads: the worn strip and the trodden bands beside it, segment by segment
  const RC = cfg.roads || {};
  for (const r of T.roads) {
    const rc = RC[r.class] || RC.trail || { extra: 0, soft: 1.4, wear: 1.2, wearStrength: 0.25 };
    const half = r.width / 2 + rc.extra, reach = half + rc.soft + rc.wear + 1.5;
    const tn = towns.map(t => ({ t, st: t.cfg?.streets }));
    for (let q = 0; q < r.pts.length - 1; q++) {
      const a = r.pts[q], b = r.pts[q + 1];
      box(Math.min(a.x, b.x) - reach, Math.min(a.z, b.z) - reach, Math.max(a.x, b.x) + reach, Math.max(a.z, b.z) + reach, (j, x, z) => {
        const dd = segDist(x, z, a.x, a.z, b.x, b.z).d + wob(x, z) * 1.3;
        put(road, j, 1 - smoothstep(half - rc.soft * 0.35, half + rc.soft * 0.65, dd));
        put(wear, j, rc.wearStrength * (1 - smoothstep(half, half + rc.soft + rc.wear, dd)));
        for (const { t, st } of tn) {
          if (!st) continue;
          const dt = Math.hypot(x - t.at[0], z - t.at[1]);
          if (dt > t.radius) continue;
          const sh = r.width / 2 + st.extra;
          // a town street says its own surface (map.json `surface`): cobbles to its end, or a packed-dirt alley
          if (r.surface === 'dirt') continue;
          const fade = r.surface === 'cobble' ? 1 : 1 - smoothstep(t.radius * 0.6, t.radius * 0.92, dt + wob(x, z) * 6);
          put(cobble, j, (1 - smoothstep(sh - st.soft * 0.4, sh + st.soft * 0.6, dd)) * fade);
        }
      });
    }
  }
  // squares
  for (const t of towns) for (const s of t.cfg?.squares || []) {
    const r = Math.hypot(...s.size) / 2 + 3, target = s.layer === 'cobble' ? cobble : wear;
    box(s.at[0] - r, s.at[1] - r, s.at[0] + r, s.at[1] + r, (j, x, z) => {
      const dd = boxDist(x, z, s.at, s.size[0], s.size[1], s.angle || 0, s.round || 0) + wob(x, z) * 2.2;
      put(target, j, 1 - smoothstep(-0.8, 1.2, dd));
    });
  }
  over(L.dirt, wear);
  over(L.dirt, road);
  over(L.cobble, cobble);

  // leaf litter under every crown (environment round 2026-11-24): where the ground is grass or wild grass, a soft disc
  // of forest floor under each tree — the dark of a wood reaches the meadow trees too. Roads, fields and paving untouched.
  if (L.forest != null) for (const t of trees) {
    const r = Math.max(2, (t.crown || 4) * 0.8);
    box(t.x - r, t.z - r, t.x + r, t.z + r, (j, x, z) => {
      const k = (1 - smoothstep(0.45, 1, (Math.hypot(x - t.x, z - t.z) + wob(x, z) * 1.6) / r)) * 0.75;
      if (k <= 0) return;
      const o = j * CH, g = W[o + L.grass] + (L.wild != null ? W[o + L.wild] : 0);
      if (g <= 0) return;
      const move = g * k;
      W[o + L.grass] *= 1 - k; if (L.wild != null) W[o + L.wild] *= 1 - k;
      W[o + L.forest] += move;
    });
  }

  // pack: every texel's eight weights → bytes that add up to 255
  const A = new Uint8Array(nx * nz * 4), Bm = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nx * nz; j++) {
    const o = j * CH; let s = 0; for (let c = 0; c < CH; c++) s += W[o + c];
    const k = s > 0 ? 255 / s : 0;
    for (let c = 0; c < 4; c++) { A[j * 4 + c] = Math.round(W[o + c] * k); Bm[j * 4 + c] = Math.round(W[o + 4 + c] * k); }
  }
  return { nx, nz, res, minX: B0.minX, minZ: B0.minZ, A, B: Bm, layers: cfg.layers.map(l => l.id) };
}

/** The layer weights at a point (nearest texel, 0..1). */
export function weightsAt(S, x, z) {
  const i = clamp(Math.floor((x - S.minX) / S.res), 0, S.nx - 1), k = clamp(Math.floor((z - S.minZ) / S.res), 0, S.nz - 1), j = (k * S.nx + i) * 4;
  const out = {};
  S.layers.slice(0, CH).forEach((id, c) => { out[id] = (c < 4 ? S.A[j + c] : S.B[j + c - 4]) / 255; });
  return out;
}

// ------------------------------------------------------------------------------------------------ fields
/** How a field is cut: strips across its long side (`longX` = the long side is its local x). */
export function fieldStrips(f, F) {
  const [sx, sz] = f.size, longX = sx >= sz, long = longX ? sx : sz;
  const n = Math.max(1, Math.round(long / F.strip)), w = long / n;
  const cuts = []; for (let i = 1; i < n; i++) cuts.push(-long / 2 + i * w);
  return { longX, n, w, long, short: longX ? sz : sx, cuts };
}

/** Centre of a part (its origin is the middle of its base; a beam's runs along its own y). */
function partMid(p) {
  const h = p.h / 2, sz = Math.sin(p.rz || 0), cz = Math.cos(p.rz || 0), sx = Math.sin(p.rx || 0), cx = Math.cos(p.rx || 0);
  let x = -sz * h, y = cz * h, z = 0;
  const y2 = y * cx - z * sx, z2 = y * sx + z * cx; y = y2; z = z2;
  const sy = Math.sin(p.yaw || 0), cy = Math.cos(p.yaw || 0);
  return [x * cy + z * sy, y, -x * sy + z * cy];
}

/** Road segments bucketed on a 16 m grid: near(x, z, pad) = within the road's half width + pad. */
export function roadIndex(T, cell = 16) {
  const B = new Map(), key = (i, k) => i * 100003 + k;
  for (const r of T.roads) for (let q = 0; q < r.pts.length - 1; q++) {
    const a = r.pts[q], b = r.pts[q + 1], m = r.width / 2 + 4;
    for (let i = Math.floor((Math.min(a.x, b.x) - m) / cell); i <= Math.floor((Math.max(a.x, b.x) + m) / cell); i++)
      for (let k = Math.floor((Math.min(a.z, b.z) - m) / cell); k <= Math.floor((Math.max(a.z, b.z) + m) / cell); k++) {
        const K = key(i, k); if (!B.has(K)) B.set(K, []); B.get(K).push([a, b, r.width / 2]);
      }
  }
  return {
    near(x, z, pad = 0) {
      for (const [a, b, half] of B.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []) if (segDist(x, z, a.x, a.z, b.x, b.z).d < half + pad) return true;
      return false;
    },
  };
}

export function planFields(T, { placements, art, cfg }) {
  const F = cfg.fields, block = blockers(T, { placements, art });
  const parts = [], fences = [], strips = [];
  const RI = roadIndex(T);
  const roadNear = (x, z, pad) => RI.near(x, z, pad);
  const wet = (x, z) => { const w = T.waterAt(x, z); return w && w.depth > -0.15; };
  // field-local (lx, lz) → world; the field's local axes are turned by +angle (terrain.js fieldAt turns back by −angle)
  const toWorld = (f, lx, lz) => { const c = Math.cos(f.angle), s = Math.sin(f.angle); return [f.at[0] + lx * c - lz * s, f.at[1] + lx * s + lz * c]; };
  const place = (list, f, p, ox, oz, turn, pad) => {
    const c = Math.cos(turn), s = Math.sin(turn);
    const lx = ox + p.x * c + p.z * s, lz = oz - p.x * s + p.z * c;      // the part's origin in field-local metres
    const [wx, wz] = toWorld(f, lx, lz);
    const yaw = (p.yaw || 0) + turn - f.angle;
    const [mx, , mz] = partMid({ ...p, yaw });
    const gx = wx + mx, gz = wz + mz;
    if (block.hit(gx, gz, pad) || roadNear(gx, gz, pad) || wet(gx, gz)) return false;
    list.push({ ...p, x: wx, z: wz, y: T.heightAt(gx, gz) + p.y, yaw });
    return true;
  };
  for (const f of T.map.fields || []) {
    const S = fieldStrips(f, F), plan = F.plans?.[f.id] || ['wheat'];
    for (let n = 0; n < S.n; n++) {
      const crop = plan[n % plan.length];
      const along = -S.long / 2 + (n + 0.5) * S.w;
      const w = S.w - F.baulk, d = S.short - 2.2;
      // rows run along the short side: the crop's own z is the field's short axis
      const ps = cropField({ w, d, crop, seed: (n + 1) * 97 + f.id.length });
      const ox = S.longX ? along : 0, oz = S.longX ? 0 : along, turn = S.longX ? 0 : Math.PI / 2;
      for (const p of ps) {
        if (p.mesh === 'box' && Math.max(p.w, p.d) > 2.5) continue;      // the long flat stubble strips: the ground is painted instead
        place(parts, f, p, ox, oz, turn, 0.6);
      }
      strips.push({ field: f.id, crop, at: toWorld(f, ox, oz), size: S.longX ? [w, d] : [d, w], angle: f.angle });
    }
    // the fence: round the edge in short runs (each run is level on the ground under it), a gate gap towards the nearest road
    const [sx, sz] = f.size, hx = sx / 2 + 0.6, hz = sz / 2 + 0.6;
    const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]];
    let gate = null, best = Infinity;
    for (let e = 0; e < 4; e++) {
      const [ax, az] = corners[e], [bx, bz] = corners[e + 1], mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const [wx, wz] = toWorld(f, mx, mz), r = T.roadAt(wx, wz, 200);
      if (r && r.d < best) { best = r.d; gate = [mx, mz]; }      // four calls a field: the slow full search is fine here
    }
    for (let e = 0; e < 4; e++) {
      const [ax, az] = corners[e], [bx, bz] = corners[e + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / F.fenceStep));
      for (let q = 0; q < n; q++) {
        const t0 = q / n, t1 = (q + 1) / n;
        const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
        const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        if (gate && Math.hypot(m[0] - gate[0], m[1] - gate[1]) < 2.6) continue;
        const [wx, wz] = toWorld(f, m[0], m[1]);
        if (block.hit(wx, wz, 1.2) || roadNear(wx, wz, 1.5) || wet(wx, wz)) continue;
        for (const p of fenceLine([[0, 0], [p1[0] - p0[0], p1[1] - p0[1]]], { kind: F.fence, seed: e * 31 + q })) place(fences, f, p, p0[0], p0[1], 0, 0);
      }
    }
  }
  return { parts, fences, strips };
}
