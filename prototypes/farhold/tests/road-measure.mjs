// Round 28 — measuring a road against the ground it is drawn on, as the player sees it.
//
// Shared by tests/round28-roads.test.js and tools/ probes. Pure: no Three.js.
//
// `drawnGround(terrain, cell)` is the height the terrain view (js/terrain.js) actually DRAWS at a
// point when the ring covering it has quads `cell` metres across: a ring's vertices sit at whole
// multiples of its cell (its centre is snapped to the cell) and every quad is split on the
// (x+1, z) – (x, z+1) diagonal, so between vertices the drawn ground is a plane through three
// `heightAt` samples, not `heightAt` itself.

export function ringCells(terrain, balance, { low = false, M_PER_CELL_DEFAULT = 640 } = {}) {
  const base = (low ? balance.terrain?.ringsLow : balance.terrain?.rings)
    || [{ extent: 192, res: 96 }, { extent: 576, res: 96 }, { extent: 1728, res: 96 }];
  const shrink = Math.sqrt(Math.max(0.05, (terrain.metresPerCell || M_PER_CELL_DEFAULT) / M_PER_CELL_DEFAULT));
  const specs = shrink >= 0.999 ? base : base.map(r => ({ ...r, extent: Math.max(96, Math.round(r.extent * shrink)) }));
  // each ring covers from the previous ring's edge out to its own; `reach` is how far from the player
  return specs.map(r => ({ cell: r.extent / r.res, reach: r.extent / 2 }));
}

export function drawnGround(terrain, cell) {
  const cache = new Map();
  const at = (i, j) => {
    const k = i * 1000003 + j;
    let v = cache.get(k);
    if (v === undefined) { v = terrain.heightAt(i * cell, j * cell); cache.set(k, v); }
    return v;
  };
  return (x, z) => {
    const gx = x / cell, gz = z / cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    if (fx + fz <= 1) {
      const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1);
      return h00 + fx * (h10 - h00) + fz * (h01 - h00);
    }
    const h11 = at(i + 1, j + 1), h10 = at(i + 1, j), h01 = at(i, j + 1);
    return h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
  };
}

/** Quantiles of a numeric list (sorted copy). */
export function quantiles(list, qs = [0.5, 0.95, 0.99, 1]) {
  if (!list.length) return qs.map(() => 0);
  const s = Float64Array.from(list).sort();
  return qs.map(q => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]);
}

/**
 * Walk a ribbon's triangles: for every triangle, its three corners and the middles of its three
 * edges, compare the drawn paving to a ground function. Returns `{ float: [], sink: [] }` (metres
 * the paving is above / below the ground at each sample) — every sample goes in one or the other.
 * `skip(x, z)` drops samples (under a bridge, over water).
 */
export function ribbonVsGround(geom, groundAt, skip = null) {
  const P = geom.position, I = geom.index, N = geom.normal;
  // the paving only: a triangle with any corner not facing straight up is a skirt or a deck side
  const flat = v => !N || N[v * 3 + 1] > 0.99;
  const diffs = [];
  const seen = new Set();
  const sample = (x, y, z) => {
    if (skip && skip(x, z)) return;
    const g = groundAt(x, z);
    if (!Number.isFinite(g)) return;
    diffs.push(y - g);
  };
  for (let t = 0; t + 2 < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    if (!flat(v[0]) || !flat(v[1]) || !flat(v[2])) continue;
    for (const a of v) if (!seen.has(a)) { seen.add(a); sample(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]); }
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      if (seen.has(-key - 1)) continue;
      seen.add(-key - 1);
      sample((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
    }
  }
  return diffs;
}

/**
 * Which ring draws a point, seen from a player at (px, pz): the innermost ring whose square (snapped
 * to its own cell, as js/terrain.js snaps it) contains it, less the two-cell overlap at its rim.
 */
export function ringFor(rings, px, pz, x, z) {
  for (const r of rings) {
    const cx = Math.round(px / r.cell) * r.cell, cz = Math.round(pz / r.cell) * r.cell;
    if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) < r.reach - 2 * r.cell) return r;
  }
  return rings[rings.length - 1];
}

/** The road shader's pull and skirt drop at a distance (js/features.js ROAD_SHADER, same formula). */
export function shaderAt(k, d) {
  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { pull: c((d - k.pullStart) * k.pull, 0, k.pullMax), drop: c((d - k.skirtStart) * k.skirt, 0, k.skirtMax) };
}

/**
 * The drawn road against the DRAWN ground, as seen by a player standing at (px, pz): every paving
 * sample is measured against the ring that covers it, and what the shader does at that distance is
 * taken off — a sample whose paving is under the drawn hill by less than the pull is still seen, and
 * one hanging over it by less than the skirt's drop (plus its own `drop`) shows a bank, not a gap.
 * `edgeOnly` measures only the outermost vertices (where a gap under the edge would show).
 * Returns `{ samples, hidden: [], gap: [] }` in metres (positive = how much is still wrong).
 */
export function seenFrom(geom, terrain, rings, k, px, pz, { skirtDrop = 0.45, skip = null } = {}) {
  const P = geom.position, I = geom.index, N = geom.normal;
  const grounds = new Map();
  const groundFor = r => { let g = grounds.get(r); if (!g) grounds.set(r, g = drawnGround(terrain, r.cell)); return g; };
  const hidden = [], gap = [];
  let samples = 0;
  const seen = new Set();
  for (let t = 0; t + 2 < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const v = I[t + e];
      if (seen.has(v) || (N && N[v * 3 + 1] < 0.99)) continue;
      seen.add(v);
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (skip && skip(x, z)) continue;
      const d = Math.hypot(x - px, z - pz);
      const g = groundFor(ringFor(rings, px, pz, x, z))(x, z);
      const { pull, drop } = shaderAt(k, d);
      samples++;
      if (y < g) { hidden.push(Math.max(0, g - y - pull)); if (g - y - pull > 0.05) (seenFrom.where ||= []).push([d | 0, +(g - y).toFixed(1)]); }
      else gap.push(Math.max(0, y - g - skirtDrop - drop));
    }
  }
  return { samples, hidden, gap };
}
