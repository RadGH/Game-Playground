// Stream E — small helpers over a province's zone grid (4-way neighbours). Pure.
export const gridDist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
/** Every connected set of `n` zones (indices into `cells`), as sorted index arrays. */
export function connectedSets(cells, n) {
  const adj = cells.map(a => cells.map((b, j) => gridDist(a, b) === 1 ? j : -1).filter(j => j >= 0));
  const seen = new Set(), out = [];
  const grow = set => {
    const key = [...set].sort((a, b) => a - b).join(',');
    if (seen.has(key)) return; seen.add(key);
    if (set.size === n) { out.push(key.split(',').map(Number)); return; }
    for (const z of set) for (const nb of adj[z]) if (!set.has(nb)) grow(new Set([...set, nb]));
  };
  cells.forEach((_, i) => grow(new Set([i])));
  return out;
}
