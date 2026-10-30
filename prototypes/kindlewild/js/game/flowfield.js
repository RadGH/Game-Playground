// Flow field for tower defense: every cell knows how many steps it is from the keep, so any number of enemies can walk
// the same maze for the cost of one search. PURE. Rebuilt only when the world changes shape.

export const FAR = 65535;

export function createField(w) {
  const M = w.M, W = w.W, H = w.H, lava = M.id.lava;
  const dist = new Uint16Array(w.N).fill(FAR);
  const probe = new Uint16Array(w.N);
  const queue = new Int32Array(w.N);
  const { mat, life } = w;

  /** Can a ground enemy stand here? The same test as creatures.js walkable(), for something that is not fireproof. */
  const open = (i) => {
    const m = mat[i];
    if (m === 0) return true;
    if (M.walk[m] === 0 || m === lava) return false;
    return !(M.liquid[m] && life[i] > 22);
  };

  function search(into, seeds, block) {
    into.fill(FAR);
    let head = 0, tail = 0;
    for (const i of seeds) { into[i] = 0; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++], d = into[i] + 1, x = i % W;
      if (x > 0) { const n = i - 1; if (into[n] === FAR && open(n) && !(block && block[n])) { into[n] = d; queue[tail++] = n; } }
      if (x < W - 1) { const n = i + 1; if (into[n] === FAR && open(n) && !(block && block[n])) { into[n] = d; queue[tail++] = n; } }
      if (i >= W) { const n = i - W; if (into[n] === FAR && open(n) && !(block && block[n])) { into[n] = d; queue[tail++] = n; } }
      if (i < w.N - W) { const n = i + W; if (into[n] === FAR && open(n) && !(block && block[n])) { into[n] = d; queue[tail++] = n; } }
    }
    return into;
  }

  return {
    dist, open,
    /** Measure the whole map from the seeds (the cells round the keep). */
    compute(seeds) { return search(dist, seeds); },
    /** Measure without keeping it: "would this wall still leave a way through?" */
    test(seeds, block) { return search(probe, seeds, block); },
    /** The cell a few steps along the way to the keep from (x, y), or null when there is no way from here. */
    ahead(x, y, steps = 4) {
      let i = y * W + x;
      if (dist[i] === FAR) {
        // standing on something (a wall went up under it): the nearest cell that has a way
        let found = -1;
        for (let k = 0; k < 8 && found < 0; k++) { const a = i + DX[k] + DY[k] * W; if (a >= 0 && a < w.N && dist[a] !== FAR) found = a; }
        if (found < 0) return null;
        i = found;
      }
      for (let s = 0; s < steps; s++) {
        const cx = i % W;
        let best = i, bd = dist[i];
        for (let k = 0; k < 8; k++) {
          const nx = cx + DX[k];
          const n = i + DX[k] + DY[k] * W;
          if (nx < 0 || nx >= W || n < 0 || n >= w.N || dist[n] >= bd) continue;
          // no cutting across the corner of a wall
          if (DX[k] && DY[k] && (dist[i + DX[k]] === FAR || dist[i + DY[k] * W] === FAR)) continue;
          bd = dist[n]; best = n;
        }
        if (best === i) break;
        i = best;
      }
      return { x: i % W, y: (i / W) | 0 };
    },
  };
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
