// A height grid and the ONE way to read a height off it.
//
// The ground mesh is drawn from this grid, and every foot, camera, monster and server check reads
// `heightAt` from the same grid. heightAt does not do bilinear filtering — it finds the same TRIANGLE
// the mesh draws (each cell split along the diagonal from (i, j+1) to (i+1, j)) and reads the plane of
// that triangle. Bilinear would disagree with the drawn mesh by up to a few centimetres in every cell,
// which is how feet end up floating or sunk (the Farhold water-staircase lesson: drawn and measured
// geometry must be the same numbers). Pure: no DOM, no three.js.
//
//   const hf = createHeightField({ size: 1024, res: 513, data: Float32Array(res*res) })
//   hf.heightAt(x, z)    metres; x/z in metres with the grid centred on the origin
//   hf.normalAt(x, z)    unit normal of that triangle { x, y, z }
//   hf.slopeAt(x, z)     0 flat .. 1 vertical

export function createHeightField({ size, res, data, waterLevel = 0 }) {
  if (!(res >= 2) || data.length !== res * res) throw new Error('heightfield: data must be res*res');
  const cells = res - 1, step = size / cells, half = size / 2;
  const at = (i, j) => data[j * res + i];

  function locate(x, z) {
    let fx = (x + half) / step, fz = (z + half) / step;
    fx = Math.max(0, Math.min(cells - 1e-6, fx)); fz = Math.max(0, Math.min(cells - 1e-6, fz));
    const i = Math.floor(fx), j = Math.floor(fz);
    return { i, j, u: fx - i, v: fz - j };
  }
  function heightAt(x, z) {
    const { i, j, u, v } = locate(x, z);
    const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
    // Diagonal from (0,1) to (1,0): lower-left triangle when u + v <= 1.
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  function normalAt(x, z) {
    const { i, j, u, v } = locate(x, z);
    const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
    let dx, dz;
    if (u + v <= 1) { dx = (h10 - h00) / step; dz = (h01 - h00) / step; }
    else { dx = (h11 - h01) / step; dz = (h11 - h10) / step; }
    const l = Math.hypot(dx, 1, dz);
    return { x: -dx / l, y: 1 / l, z: -dz / l };
  }
  const slopeAt = (x, z) => 1 - normalAt(x, z).y;
  return { size, res, step, half, data, waterLevel, heightAt, normalAt, slopeAt, inside: (x, z) => Math.abs(x) < half && Math.abs(z) < half };
}
