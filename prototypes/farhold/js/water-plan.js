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
export function waterRibbon(points, heights, half, { terrain, reach, skirt = 2.5, bankTolerance = null }) {
  const position = [], normal = [], index = [];
  const step = Math.max(1.5, half * 0.5);
  const sides = [];                       // [leftDistance, rightDistance] per point
  /**
   * HOW FAR THE TWO BANKS MAY DISAGREE, IN METRES.
   *
   * *"There is a road clipping into the water, and the water level is lower on one side of the
   * road."* The sheet is one flat quad per point, so both its edges are at the same HEIGHT — what
   * differed was how far each edge ran. The widening below walks outward on each side until the
   * carved ground comes back up to the water line, and anything that raises one bank (a road
   * embankment, and now a quay) stops that side dead while the other side runs on to `reach`.
   * Measured at the user's own spot, one side stopped at 6 m and the other at 32: an edge four
   * metres from the road and an edge thirty metres from it, at the same height, which reads as two
   * different water levels.
   *
   * A river is not that shape. The two sides are capped to within one river-width of each other
   * (never less than four metres), so the sheet stays a river — and where the bank really is
   * flatter on one side, the skirt covers what the trim gave up, exactly as it does for a low bank.
   */
  const tolerance = bankTolerance ?? Math.max(half, 4);

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const y = heights[i];
    const out = [half, half];
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? 1 : -1;
      const groundAt = d => terrain.heightAt(points[i][0] + nx * sign * d, points[i][1] + nz * sign * d);
      let last = half;
      for (let d = half; d <= reach; d += step) {
        out[s] = d;
        if (groundAt(d) >= y) {
          /**
           * ROUND 17 — AND THEN WALK BACK IN TO THE WATERLINE ITSELF.
           *
           * *"The water does not touch the shoreline."* The coarse walk steps in half a channel
           * width — three metres on an average river, eight on a big one — and takes the first step
           * where the bank has come back up. On anything but a cliff that step lands somewhere UP
           * the bank rather than on the waterline, so the sheet's rim stood a slope's worth above the
           * ground and you could see the edge of the water sitting proud of the shore.
           *
           * Five halvings put the edge within a tenth of the step of the real crossing, which is
           * under 40 cm on a wide river and under 10 on a narrow one. It costs five height samples
           * per bank per point and only at the point where the bank was actually found — nothing at
           * all on the edges that run out to `reach`.
           */
          let lo = last, hi = d;
          for (let k = 0; k < 5; k++) {
            const mid = (lo + hi) / 2;
            if (groundAt(mid) >= y) hi = mid; else lo = mid;
          }
          out[s] = hi;
          break;
        }
        last = d;
      }
      // never narrower than the water the plan asked for, whatever the bisection found
      if (out[s] < half) out[s] = half;
    }
    // the two banks have to agree — see `tolerance` above
    const cap = Math.min(out[0], out[1]) + tolerance;
    out[0] = Math.min(out[0], cap);
    out[1] = Math.min(out[1], cap);
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
  // A SMALL LAKE GETS A SHORELINE INSTEAD OF CORNERS. See `round` in js/planet.js: a lake of a few
  // cells drawn a square at a time is a blue rectangle with four right angles in it, which is what
  // "sharp corners and looks completely unnatural" was. Anything big enough for its own outline to
  // read as a shape is still drawn by the cell.
  if (lake.round) return pondSheet(lake, cellSize, terrain);
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

/**
 * A pond: one lake of a few cells, drawn as a shore rather than as squares.
 *
 * The outline is measured from the lake's OWN cells — a ray is walked out from the middle at each of
 * twenty angles until it leaves the footprint — so a two-cell lake comes out long and a four-cell
 * one comes out round, and neither has a corner in it. The radius is then wobbled by a couple of
 * slow waves keyed to the lake's own position, so two ponds on the same world are not the same
 * circle. It is pulled in to 0.86 of the footprint on purpose: the bank has to poke through the
 * edge of the sheet, which is what hides it (see `waterRibbon` above).
 */
export function pondSheet(lake, cellSize, terrain, { segments = 20 } = {}) {
  const position = [], normal = [], index = [];
  const y = lake.surface;
  const cells = new Set(lake.cells);
  const inside = (x, z) => {
    const cx = Math.round(x / cellSize), cz = Math.round(z / cellSize);
    if (cx < 0 || cz < 0 || cx >= terrain.width) return false;
    return cells.has(cz * terrain.width + cx);
  };
  // the middle of the footprint, not the middle of the bounding box
  let mx = 0, mz = 0;
  for (const i of lake.cells) { mx += (i % terrain.width) * cellSize; mz += Math.floor(i / terrain.width) * cellSize; }
  mx /= lake.cells.length; mz /= lake.cells.length;

  const phase = (mx * 0.013 + mz * 0.017) % (Math.PI * 2);
  const step = cellSize / 12;
  position.push(mx, y, mz);
  normal.push(0, 1, 0);
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let r = step;
    for (let d = step; d <= cellSize * 4; d += step) {
      if (!inside(mx + dx * d, mz + dz * d)) break;
      r = d;
    }
    r *= 0.86 * (1 + 0.14 * Math.sin(a * 3 + phase) + 0.07 * Math.sin(a * 5 - phase));
    position.push(mx + dx * r, y, mz + dz * r);
    normal.push(0, 1, 0);
  }
  for (let s = 0; s < segments; s++) index.push(0, 1 + s, 1 + ((s + 1) % segments));
  return { position, normal, index };
}

/**
 * A ROAD DECK WITH A THICKNESS, for the places you can see the side of it.
 *
 * "When they cross rivers the road surface is paper thin and looks off." The road is drawn as a flat
 * ribbon six centimetres above the graded ground, which is right where the ground is touching it and
 * wrong where it is not — over a river you are looking at a sheet of paper on edge. This builds the
 * same ribbon with a top, two sides and an underside `thick` metres down, so the crossing has an
 * edge to it from the bank.
 *
 * WIRED IN ROUND 16: `js/features.js` `buildRibbons` splits each road run by `path.lift` and draws
 * the lifted stretches — bridges and causeways, the only places you can see the side of a road —
 * with this instead of its flat `ribbon()`. Consecutive stretches share a point so there is no seam.
 */
export function roadDeck(points, heights, width, { thick = 0.45, lift = 0.06 } = {}) {
  const position = [], normal = [], index = [];
  const half = width / 2;
  const n = points.length;
  const edge = [];
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(n - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    edge.push({ nx: -dz / len, nz: dx / len, y: heights[i] + lift });
  }
  // top, then the two sides hanging off it, then the underside — four strips over the same spine
  const strip = (yOf, nrm, flip) => {
    const base = position.length / 3;
    for (let i = 0; i < n; i++) {
      const { nx, nz } = edge[i];
      const [l, r] = yOf(i);
      position.push(points[i][0] + nx * half, l, points[i][1] + nz * half);
      position.push(points[i][0] - nx * half, r, points[i][1] - nz * half);
      normal.push(...nrm(i, 0), ...nrm(i, 1));
      if (i > 0) {
        const a = base + (i - 1) * 2, b = a + 1, c = base + i * 2, d = c + 1;
        if (flip) index.push(a, b, c, b, d, c);
        else index.push(a, c, b, b, c, d);
      }
    }
  };
  strip(i => [edge[i].y, edge[i].y], () => [0, 1, 0], false);
  strip(i => [edge[i].y - thick, edge[i].y - thick], () => [0, -1, 0], true);
  // the two sides: a wall from the deck down to the underside on each edge
  for (const side of [1, -1]) {
    const base = position.length / 3;
    for (let i = 0; i < n; i++) {
      const { nx, nz, y } = edge[i];
      const ex = points[i][0] + nx * side * half, ez = points[i][1] + nz * side * half;
      position.push(ex, y, ez, ex, y - thick, ez);
      normal.push(nx * side, 0, nz * side, nx * side, 0, nz * side);
      if (i > 0) {
        const a = base + (i - 1) * 2, b = a + 1, c = base + i * 2, d = c + 1;
        if (side > 0) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
    }
  }
  return { position, normal, index };
}
