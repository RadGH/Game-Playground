// Lamp pools (owner 2026-10-28: "Lamps create a bright circle but do not actually light up the surroundings very well
// or at all"). The emitter pass averages a lamp's few cells into one light texel and the blur spreads that over an area
// that grows with the square of the distance, so a lamp lit only its own head. A material with a `light` row in
// data/materials.json ({ "r": radius in cells, "i": strength at the centre, "flicker": 0..1 }) ALSO gets a real point
// light of that radius: a soft disc splatted into the light buffer before the blur, so the ground under it is lit to the
// edge of the pool and the blur still gives it a soft rim.
//
// The renderer already keeps its own copy of every chunk; when one arrives, its light cells are gathered into 8×8-cell
// blocks (one light per block per material, at the cells' centroid), so a lamp post of a few cells is one light and a
// wall of yard lamps is a row of them. Each frame the lights of chunks near the view are pushed.

export function createLampLights(list) {
  const lightOf = list.map((m) => (m.light && m.emit ? { r: m.light.r, i: m.light.i ?? 1, flicker: m.light.flicker ?? 0, c: m.emit } : null));
  const any = lightOf.some(Boolean);
  const byChunk = new Map();        // chunk index -> Float32Array of [x, y, r, cr, cg, cb, i, flicker] * n
  const acc = new Float32Array(64 * 256 * 3);   // per block (64) per material (256): sum x, sum y, count
  const touched = [];

  /** A chunk arrived: re-gather its lights. `data` is the chunk's 64×64 cells, `cx`/`cy` its world corner. */
  function scan(ci, data, cx, cy) {
    if (!any) return;
    touched.length = 0;
    for (let i = 0; i < 4096; i++) {
      const m = data[i] & 255;
      if (!lightOf[m]) continue;
      const x = i & 63, y = i >> 6, blk = (y >> 3) * 8 + (x >> 3), o = (blk * 256 + m) * 3;
      if (acc[o + 2] === 0) touched.push(o);
      acc[o] += x; acc[o + 1] += y; acc[o + 2] += 1;
    }
    if (!touched.length) { byChunk.delete(ci); return; }
    const out = new Float32Array(touched.length * 8);
    touched.forEach((o, k) => {
      const m = (o / 3) % 256, L = lightOf[m], n = acc[o + 2];
      // a big cluster (a lit forge, a run of yard lamps in one block) shines a little stronger, never much
      const s = Math.min(1.6, 0.85 + 0.15 * Math.sqrt(n));
      out.set([cx + acc[o] / n + 0.5, cy + acc[o + 1] / n + 0.5, L.r, L.c[0], L.c[1], L.c[2], L.i * s, L.flicker], k * 8);
      acc[o] = acc[o + 1] = acc[o + 2] = 0;
    });
    byChunk.set(ci, out);
  }

  /**
   * Push the lights of chunks overlapping the view (plus their radius) through `pushL(x, y, size, r, g, b, i)`.
   * `night` 0 (noon) … 1 (midnight): a lamp's pool comes up through dusk and is off in daylight (it washed the roofs
   * beside every lamp post out to white by day). Its own glowing cells still glow (the emitter pass).
   */
  function push(vr, pushL, timeMs, night = 1) {
    if (!byChunk.size) return 0;
    const dark = Math.max(0, Math.min(1, (night - 0.15) / 0.55));
    if (dark <= 0.001) return 0;
    let n = 0;
    for (const arr of byChunk.values()) {
      for (let o = 0; o < arr.length; o += 8) {
        const x = arr[o], y = arr[o + 1], r = arr[o + 2];
        if (x + r < vr.x0 - 40 || x - r > vr.x1 + 40 || y + r < vr.y0 - 40 || y - r > vr.y1 + 40) continue;
        let i = arr[o + 6] * dark * dark * (3 - 2 * dark);
        const f = arr[o + 7];
        if (f) i *= 1 - f * (0.5 + 0.5 * Math.sin(timeMs * 0.011 + x * 1.7) * Math.sin(timeMs * 0.0067 + y * 2.3));
        pushL(x, y, r * 2, arr[o + 3], arr[o + 4], arr[o + 5], i);
        n++;
      }
    }
    return n;
  }

  return { scan, push, get chunks() { return byChunk.size; }, lightOf };
}
