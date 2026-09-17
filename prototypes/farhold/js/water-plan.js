// Farhold — where the water's edge goes.
//
// Split out of `js/features.js` for the same reason `js/dungeon-plan.js` was: this is arithmetic
// over points and heights with no Three.js in it, so `node --test` can drive the real code and
// check the thing that was actually wrong — that the water met the ground.

/**
 * A river's water, widened until it actually meets its own bank.
 *
 * The plain `ribbon` in `js/features.js` lays a flat sheet exactly as wide as the water — and `js/planet.js`
 * carves the channel to full depth across that same width, so the sheet's edge hung in the air a
 * couple of metres above a bed that only started climbing further out. From the side you could see
 * straight under the river. The user's words: *"the water layer should touch the edge of the ground,
 * you should not be able to peek under the water."*
 *
 * So two changes. The sheet is pushed OUTWARD, per point and per side, until the carved ground has
 * risen back to the water line — the bank then covers the extra, which is how a real shoreline hides
 * the edge of a lake. And a short skirt hangs off that edge down past the ground, for the places
 * where the bank never gets that high (a river running out onto a flat delta), so there is nothing
 * left to see under even there.
 */
export function waterRibbon(points, heights, half, { terrain, reach, skirt = 2.5 }) {
  const position = [], normal = [], index = [];
  const step = Math.max(1.5, half * 0.5);
  const sides = [];                       // [leftDistance, rightDistance] per point

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const y = heights[i];
    const out = [half, half];
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? 1 : -1;
      for (let d = half; d <= reach; d += step) {
        out[s] = d;
        if (terrain.heightAt(points[i][0] + nx * sign * d, points[i][1] + nz * sign * d) >= y) break;
      }
    }
    sides.push({ nx, nz, y, out });
    position.push(points[i][0] + nx * out[0], y, points[i][1] + nz * out[0]);
    position.push(points[i][0] - nx * out[1], y, points[i][1] - nz * out[1]);
    normal.push(0, 1, 0, 0, 1, 0);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  // the skirt: a short wall hanging off each edge, so a low bank still has nothing to see under
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const base = position.length / 3;
    for (let i = 0; i < points.length; i++) {
      const { nx, nz, y, out } = sides[i];
      const ex = points[i][0] + nx * sign * out[s], ez = points[i][1] + nz * sign * out[s];
      const floor = Math.min(y, terrain.heightAt(ex, ez)) - skirt;
      position.push(ex, y, ez, ex, floor, ez);
      normal.push(nx * sign, 0, nz * sign, nx * sign, 0, nz * sign);
      if (i > 0) {
        const a = base + (i - 1) * 2, b = a + 1, c = base + i * 2, d = c + 1;
        if (sign > 0) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
    }
  }
  return { position, normal, index };
}

/**
 * A lake's water: one flat sheet per cell of the lake, at the lake's own surface height, grown a
 * little past the cell so neighbouring cells overlap rather than leaving a hairline crack. Lakes
 * had a carved basin and no water in them at all before this — a dry hole with a blue dot on the
 * map. As with a river, the bank is left to poke through and hide the sheet's edge.
 */
export function lakeSheet(lake, cellSize, terrain) {
  const position = [], normal = [], index = [];
  const grow = cellSize * 0.62;                         // half a cell, plus an overlap
  const y = lake.surface;
  for (const i of lake.cells) {
    const cx = (i % terrain.width) * cellSize, cz = Math.floor(i / terrain.width) * cellSize;
    const base = position.length / 3;
    for (const [ox, oz] of [[-grow, -grow], [grow, -grow], [-grow, grow], [grow, grow]]) {
      position.push(cx + ox, y, cz + oz);
      normal.push(0, 1, 0);
    }
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  return { position, normal, index };
}
