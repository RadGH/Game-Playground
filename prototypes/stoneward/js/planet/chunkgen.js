// Cell chunks generated on demand from the seed + macro map. PURE, and always the same: the same
// (seed, cx, cy) always gives the same cells, which is what lets a save keep only the chunks the
// player CHANGED (js/planet/chunks.js).
//
// A chunk is CH x CH cells (64). Layers, one byte each unless noted (Kindlewild's set plus three):
//   ground  floor material         mat   what stands on the floor (tree, wall, water…)
//   height  terrain height 0..255  tall  column height in cells for the 3/4 view (0..31)
//   temp    heat byte (ambient 40) life  fuel / liquid amount / growth
//   flag    BURN WET OWNED…        hp    cell durability (walls)
//   part    Uint16: which building / wall the cell belongs to (0 = none)
//
// Rivers come from the macro river polylines: every segment that touches the chunk is rasterised at
// cell level with a meander from fine noise, so a river is continuous across chunk and seam edges.

import { makeNoise3D, subSeed, makeRng } from './noise.js';
import { BIOMES, BIOME } from './biomes.js';
import { sampleMacro, wrap } from './macro.js';

export const CH = 64;
export const LAYERS = ['ground', 'mat', 'height', 'tall', 'temp', 'life', 'flag', 'hp'];

/** Make a blank chunk record. */
export function blankChunk(cx, cy) {
  const n = CH * CH;
  const c = { cx, cy, edited: false, version: 0 };
  for (const k of LAYERS) c[k] = new Uint8Array(n);
  c.part = new Uint16Array(n);
  return c;
}

/**
 * Prepare per-world generation state once (noise functions, material ids, river segment index).
 * M = compiled materials (js/sim/materials.js).
 */
export function createChunkGen(macro, M) {
  const W = macro.width, H = macro.height, mc = macro.macroCell;
  const nFine = makeNoise3D(subSeed(macro.seed, 'fine'));
  const nJit = makeNoise3D(subSeed(macro.seed, 'jitter'));
  const nClump = makeNoise3D(subSeed(macro.seed, 'clump'));
  const id = M.id;
  const R = W / (2 * Math.PI);        // cylinder radius in cells, so 1 unit = 1 cell everywhere
  const cyl = (x, y, f) => { const a = x / R; return [Math.cos(a) * R * f, y * f, Math.sin(a) * R * f]; };

  // ground recipes as [materialId, cumulativeWeight] lists per biome
  const recipes = BIOMES.map(b => {
    const g = b.ground || ['grass', 1], out = []; let acc = 0;
    for (let k = 0; k < g.length; k += 2) { acc += g[k + 1]; out.push([id[g[k]] ?? id.grass, acc]); }
    for (const o of out) o[1] /= acc;
    const kinds = b.kinds || ['tree', 1], ko = []; let ka = 0;
    for (let k = 0; k < kinds.length; k += 2) { ka += kinds[k + 1]; ko.push([id[kinds[k]] ?? id.tree, ka]); }
    for (const o of ko) o[1] /= ka;
    return { ground: out, kinds: ko };
  });

  // river segments in CELL coordinates, bucketed by chunk for quick lookup
  const segs = [];
  for (const r of macro.rivers) {
    const w = r.size === 3 ? 7 : r.size === 2 ? 4.5 : 2.6;
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, ay] = r.pts[k], [bx, by] = r.pts[k + 1];
      segs.push({ ax: ax * mc, ay: ay * mc, bx: bx * mc, by: by * mc, w: w * (0.8 + 0.4 * k / r.pts.length) });
    }
  }
  const cw = W / CH, chh = H / CH;
  const bucket = new Map();
  for (const s of segs) {
    const pad = s.w + 24;
    const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / CH), x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / CH);
    const y0 = Math.max(0, Math.floor((Math.min(s.ay, s.by) - pad) / CH)), y1 = Math.min(chh - 1, Math.floor((Math.max(s.ay, s.by) + pad) / CH));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const key = wrap(x, cw) + y * cw;
      let list = bucket.get(key); if (!list) bucket.set(key, list = []);
      list.push(s);
    }
  }

  const iceTop = macro.iceRows * mc, iceBot = H - macro.iceRows * mc;
  const seaH = macro.sea, topH = macro.top;
  const heightByte = e => {
    // sea floor 0..60, land 64..255 (so the shoreline sits at 64)
    if (e <= seaH) return Math.max(0, Math.round(60 * (e / seaH)));
    return Math.min(255, 64 + Math.round(191 * (e - seaH) / Math.max(1e-6, topH - seaH)));
  };

  /** Fill a chunk with generated cells. */
  function generate(cx, cy) {
    const c = blankChunk(cx, cy);
    const rng = makeRng(subSeed(macro.seed, `chunk:${cx},${cy}`));
    const list = bucket.get(cx + cy * cw) || [];
    for (let ly = 0; ly < CH; ly++) {
      const gy = cy * CH + ly;
      for (let lx = 0; lx < CH; lx++) {
        const gx = cx * CH + lx;
        const i = ly * CH + lx;
        // jittered macro read, so biome edges are ragged rather than 32 m squares
        const [jx, jy, jz] = cyl(gx, gy, 1 / 23);
        const j1 = nJit(jx, jy, jz), j2 = nJit(jx + 31.7, jy, jz);
        const fx = (gx + j1 * 22) / mc, fy = (gy + j2 * 22) / mc;
        const mxi = wrap(Math.floor(fx), macro.mw), myi = Math.max(0, Math.min(macro.mh - 1, Math.floor(fy)));
        const b = BIOMES[macro.biome[myi * macro.mw + mxi]];
        const [px, py, pz] = cyl(gx, gy, 1 / 48);
        const fine = nFine(px, py, pz) * 0.5 + nFine(px * 3.1, py * 3.1, pz * 3.1) * 0.2;
        let e = sampleMacro(macro.elev, macro.mw, macro.mh, gx / mc, gy / mc) + fine * 0.012;
        let h = heightByte(e);
        c.temp[i] = 40;

        // polar ice: a wall nobody crosses
        if (gy < iceTop || gy >= iceBot || b.polar) {
          c.ground[i] = id.seaice; c.height[i] = Math.max(h, 64); continue;
        }
        // rivers carve a channel and fill it with water
        let rd = 1e9, rw = 0;
        for (const s of list) {
          const d = segDist(gx, gy, s, W, nJit, cyl);
          if (d - s.w < rd - rw) { rd = d; rw = s.w; }
        }
        if (rd < rw && e > seaH && !b.water) {
          c.ground[i] = id.gravel; c.mat[i] = id.water;
          const depth = Math.min(1, 1 - rd / rw);
          c.life[i] = 4 + Math.round(depth * 4);       // liquid amount (Kindlewild LEVEL = 8)
          c.height[i] = Math.max(60, h - 2 - Math.round(depth * 3));
          continue;
        }
        if (rd < rw + 2.5 && e > seaH && !b.water) { c.ground[i] = id.mud; c.height[i] = h; continue; }

        c.height[i] = h;
        if (b.water || e <= seaH) {
          c.ground[i] = h > 40 ? id.sand : id.gravel;
          c.mat[i] = id.water;
          c.life[i] = 8;                                  // full; depth comes from height
          continue;
        }
        // ground: weighted by a clumpy noise so materials come in patches, not salt and pepper
        const [qx, qy, qz] = cyl(gx, gy, 1 / 9);
        const pick = (nClump(qx, qy, qz) * 0.5 + 0.5) * 0.75 + rng() * 0.25;
        const rec = recipes[b.id];
        let g = rec.ground[rec.ground.length - 1][0];
        for (const [mid, w] of rec.ground) if (pick <= w) { g = mid; break; }
        c.ground[i] = g;

        // things standing on it
        const [tx, ty, tz] = cyl(gx, gy, 1 / 17);
        const grove = nClump(tx + 50, ty, tz) * 0.5 + 0.5;
        const r = rng();
        let pTree = (b.trees || 0) * (0.25 + grove * 1.6);
        if (r < pTree) {
          const k = rng(); let m = rec.kinds[rec.kinds.length - 1][0];
          for (const [mid, w] of rec.kinds) if (k <= w) { m = mid; break; }
          place(c, i, m, M, rng); c.life[i] = 120 + ((rng() * 120) | 0);
          continue;
        }
        let acc = pTree;
        const tryPut = (p, m) => { if (!p) return false; acc += p; if (r < acc) { place(c, i, m, M, rng); return true; } return false; };
        if (tryPut(b.bush, id.bush)) continue;
        if (tryPut(b.boulder, id.boulder)) continue;
        if (tryPut(b.crystals, id.crystal)) continue;
        if (tryPut(b.graves, id.gravestone)) continue;
        if (tryPut(b.mushroom, id.mushroom)) continue;
        if (tryPut(b.tallgrass, id.tallgrass)) continue;
        if (tryPut(b.flowers, id.flowers)) continue;
        if (b.vents && tryPut(b.vents, id.vent)) continue;
      }
    }
    if (BIOMES.some(b => b.ruins)) addRuins(c, macro, M, rng);
    return c;
  }

  return { generate, W, H, chunksX: cw, chunksY: chh, segsNear: (cx, cy) => bucket.get(cx + cy * cw) || [] };
}

function place(c, i, m, M, rng) {
  c.mat[i] = m;
  const t = M.tall[m];
  c.tall[i] = t ? Math.max(1, t + Math.round((rng() - 0.5) * t * 0.5)) : 0;
  c.hp[i] = M.hard[m] ? 255 : 0;
}

/** Distance from cell (gx, gy) to a river segment, with a meander and the x wrap. */
function segDist(gx, gy, s, W, n, cyl) {
  const [mx, my, mz] = cyl(gx, gy, 1 / 37);
  const wob = n(mx + 7, my, mz) * 9;
  let px = gx + wob, py = gy + n(mx, my + 3, mz) * 9;
  // bring the point to the same unwrapped side as the segment
  const sx = (s.ax + s.bx) / 2;
  while (px - sx > W / 2) px -= W;
  while (sx - px > W / 2) px += W;
  const vx = s.bx - s.ax, vy = s.by - s.ay, L = vx * vx + vy * vy || 1;
  let t = ((px - s.ax) * vx + (py - s.ay) * vy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (s.ax + vx * t), dy = py - (s.ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ruin stubs: in an 'ancient ruins' chunk, a few broken wall rectangles over flagstone floors. */
function addRuins(c, macro, M, rng) {
  const mc = macro.macroCell;
  const mx = wrap(Math.floor((c.cx * CH + CH / 2) / mc), macro.mw), my = Math.floor((c.cy * CH + CH / 2) / mc);
  if (macro.biome[my * macro.mw + mx] !== BIOME.ruins) return;
  const n = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const w = 6 + Math.floor(rng() * 10), h = 5 + Math.floor(rng() * 8);
    const x0 = 2 + Math.floor(rng() * (CH - w - 4)), y0 = 2 + Math.floor(rng() * (CH - h - 4));
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const i = y * CH + x;
      if (c.mat[i] === M.id.water) continue;
      c.ground[i] = M.id.ruinfloor; c.mat[i] = 0; c.tall[i] = 0;
      const edge = y === y0 || x === x0 || y === y0 + h - 1 || x === x0 + w - 1;
      if (edge && rng() < 0.7) { c.mat[i] = M.id.ruinwall; c.tall[i] = 1 + Math.floor(rng() * 4); c.hp[i] = 255; }
    }
  }
}
