// A growing pile of coloured triangles that becomes one mesh: how every building, road and bridge in Oddhaven reaches
// the GPU as a single draw call per map square. `quad` takes four corners counter-clockwise seen from the front.

const hexRgb = new Map();
export function rgb(THREE, hex) {
  if (!hexRgb.has(hex)) { const c = new THREE.Color(hex); hexRgb.set(hex, [c.r, c.g, c.b]); }
  return hexRgb.get(hex);
}

export class Batch {
  constructor(THREE) { this.THREE = THREE; this.p = []; this.n = []; this.c = []; this.tags = null; this.tag = 0; }
  /** Every triangle after this carries `v` in the attribute aTag: which building it belongs to, so a shader can cut that one open. */
  tagged(v) { this.tag = v; this.tags ||= new Array(this.p.length / 3).fill(0); return this; }
  get tris() { return this.p.length / 9; }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); if (this.tags) this.tags.push(this.tag); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  /** An upright rectangle: centre c, outward normal (nx, nz), width w along the wall, from y0 to y1. */
  wall(cx, cz, nx, nz, w, y0, y1, col, out = 0) {
    const tx = nz, tz = -nx, x = cx + nx * out, z = cz + nz * out, h = w / 2;
    this.quad([x - tx * h, y0, z - tz * h], [x + tx * h, y0, z + tz * h], [x + tx * h, y1, z + tz * h], [x - tx * h, y1, z - tz * h], col);
  }
  /** A box standing on y, turned by yaw (local +z looks along (sin yaw, cos yaw)). No bottom. */
  box(cx, y, cz, hx, hy, hz, yaw, col, top = col) {
    const s = Math.sin(yaw), c = Math.cos(yaw), L = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c], y1 = y + hy * 2;
    const A = L(-hx, hz), B = L(hx, hz), C = L(hx, -hz), D = L(-hx, -hz);
    for (const [P, Q] of [[A, B], [B, C], [C, D], [D, A]]) this.quad([P[0], y, P[1]], [Q[0], y, Q[1]], [Q[0], y1, Q[1]], [P[0], y1, P[1]], col);
    this.quad([A[0], y1, A[1]], [B[0], y1, B[1]], [C[0], y1, C[1]], [D[0], y1, D[1]], top);
  }
  geometry() {
    const T = this.THREE, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.c), 3));
    if (this.tags) g.setAttribute('aTag', new T.BufferAttribute(new Float32Array(this.tags), 1));
    g.computeBoundingSphere();
    return g;
  }
}
