// Where a model's chimney is, found from its shape (environment round 2026-11-24): the fal-made buildings carry no
// "chimney" tag like the kit's houses, so the smoke needs another way to find one. Map the model's top height on a
// small grid seen from above; a chimney is a narrow spike that stands well clear of everything round it — a roof ridge
// is not (its neighbours along the ridge are as high), nor is a flag pole (too thin to fill a cell).
//
//   findChimney(points) → { x, y, z } (model space, top centre) | null      points: flat [x, y, z, x, y, z, …]
export function findChimney(points, { cell = 0.35, ring = 3, rise = 0.6, minCells = 2, maxCells = 24 } = {}) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, maxY = -Infinity, minY = Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; if (y > maxY) maxY = y; if (y < minY) minY = y;
  }
  if (!isFinite(maxY)) return null;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1), nz = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);
  const top = new Float32Array(nx * nz).fill(-Infinity);
  for (let i = 0; i < points.length; i += 3) {
    const ix = Math.floor((points[i] - minX) / cell), iz = Math.floor((points[i + 2] - minZ) / cell), k = iz * nx + ix;
    if (points[i + 1] > top[k]) top[k] = points[i + 1];
  }
  const H = maxY - minY, spike = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const t = top[iz * nx + ix];
    if (!(t > minY + H * 0.55)) continue;
    let around = -Infinity;
    for (let dz = -ring - 1; dz <= ring + 1; dz++) for (let dx = -ring - 1; dx <= ring + 1; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) < ring) continue;                 // only the ring round it
      const x = ix + dx, z = iz + dz; if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
      around = Math.max(around, top[z * nx + x]);
    }
    if (t - around > rise) spike[iz * nx + ix] = 1;
  }
  // group the spike cells; keep the highest group that is chimney-sized
  const seen = new Uint8Array(nx * nz); let best = null;
  for (let k = 0; k < nx * nz; k++) {
    if (!spike[k] || seen[k]) continue;
    const stack = [k], cells = []; seen[k] = 1;
    while (stack.length) { const c = stack.pop(); cells.push(c); const cx = c % nx, cz = (c / nx) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, z = cz + dz, j = z * nx + x; if (x >= 0 && z >= 0 && x < nx && z < nz && spike[j] && !seen[j]) { seen[j] = 1; stack.push(j); } } }
    if (cells.length < minCells || cells.length > maxCells) continue;
    let sx = 0, sz = 0, y = -Infinity;
    for (const c of cells) { sx += c % nx; sz += (c / nx) | 0; y = Math.max(y, top[c]); }
    if (!best || y > best.y) best = { x: minX + (sx / cells.length + 0.5) * cell, y, z: minZ + (sz / cells.length + 0.5) * cell };
  }
  return best;
}
