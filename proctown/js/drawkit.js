// Procedural Towns — drawing the building kit on a 2D canvas.
//
// The gallery has to show the SAME parts the game builds, or it is a picture of a different
// building and it can tell you nothing. So this file takes `partsFor(desc)` — the identical list
// Farhold instances — and draws it with a painter's algorithm in an axonometric view.
//
// Axonometric rather than a flat elevation because the thing being judged here is a SILHOUETTE:
// "each culture reads correctly at a distance" (section 6.18) is not a question you can answer from
// a front-on rectangle.
//
//   import { drawBuilding, drawSwatches } from './drawkit.js';
//   drawBuilding(ctx, partsFor(desc), { width, height });

const COS30 = Math.cos(Math.PI / 6), SIN30 = Math.sin(Math.PI / 6);

/**
 * Every unit shape as a set of flat faces, in the same unit space the kit uses:
 * x and z run -0.5..0.5, y runs 0..1, and the origin is the centre of the base.
 *
 * `light` is how much of the sun a face gets — a fixed number per face rather than a real normal,
 * because these are axis-aligned boxes and prisms and a lookup reads better than a dot product.
 */
function facesFor(mesh) {
  if (FACES[mesh]) return FACES[mesh];
  return FACES.box;
}

const ring = (n, r = 0.5, y = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

/** A prism from a closed ring of points: sides, a top and a bottom. */
function prism(ringPts, top = 1) {
  const faces = [];
  const n = ringPts.length;
  for (let i = 0; i < n; i++) {
    const a = ringPts[i], b = ringPts[(i + 1) % n];
    faces.push({ pts: [[a[0], 0, a[2]], [b[0], 0, b[2]], [b[0], top, b[2]], [a[0], top, a[2]]],
      light: 0.62 + 0.3 * (a[0] + b[0]) / 2 + 0.16 * (a[2] + b[2]) / 2 });
  }
  faces.push({ pts: ringPts.map(p => [p[0], top, p[2]]), light: 1 });
  faces.push({ pts: ringPts.map(p => [p[0], 0, p[2]]).reverse(), light: 0.4 });
  return faces;
}

const CUBE = prism([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]]);

const FACES = {
  box: CUBE,
  cyl: prism(ring(10)),
  // a triangular prism: the ridge runs along +Z, so the two ends are triangles
  gable: [
    { pts: [[-0.5, 0, -0.5], [0, 1, -0.5], [0.5, 0, -0.5]], light: 0.55 },
    { pts: [[0.5, 0, 0.5], [0, 1, 0.5], [-0.5, 0, 0.5]], light: 0.78 },
    { pts: [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [0, 1, 0.5], [0, 1, -0.5]], light: 0.7 },
    { pts: [[0.5, 0, 0.5], [0.5, 0, -0.5], [0, 1, -0.5], [0, 1, 0.5]], light: 0.95 },
    { pts: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], light: 0.4 },
  ],
  // a right-triangle prism rising toward -X
  shed: [
    { pts: [[-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 0, -0.5]], light: 0.55 },
    { pts: [[0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 0, 0.5]], light: 0.78 },
    { pts: [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]], light: 0.62 },
    { pts: [[-0.5, 1, -0.5], [-0.5, 1, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5]], light: 0.98 },
    { pts: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], light: 0.4 },
  ],
  hip: [
    { pts: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, 0]], light: 0.6 },
    { pts: [[0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 1, 0]], light: 0.95 },
    { pts: [[-0.5, 0, 0.5], [-0.5, 0, -0.5], [0, 1, 0]], light: 0.72 },
    { pts: [[0.5, 0, -0.5], [0.5, 0, 0.5], [0, 1, 0]], light: 0.86 },
    { pts: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], light: 0.4 },
  ],
  frustum: [
    { pts: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.225, 1, -0.225], [-0.225, 1, -0.225]], light: 0.6 },
    { pts: [[0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.225, 1, 0.225], [0.225, 1, 0.225]], light: 0.95 },
    { pts: [[-0.5, 0, 0.5], [-0.5, 0, -0.5], [-0.225, 1, -0.225], [-0.225, 1, 0.225]], light: 0.72 },
    { pts: [[0.5, 0, -0.5], [0.5, 0, 0.5], [0.225, 1, 0.225], [0.225, 1, -0.225]], light: 0.86 },
    { pts: [[-0.225, 1, -0.225], [0.225, 1, -0.225], [0.225, 1, 0.225], [-0.225, 1, 0.225]], light: 1 },
  ],
  cone: (() => {
    const r = ring(10);
    const out = r.map((a, i) => {
      const b = r[(i + 1) % r.length];
      return { pts: [[a[0], 0, a[2]], [b[0], 0, b[2]], [0, 1, 0]],
        light: 0.62 + 0.3 * (a[0] + b[0]) / 2 + 0.16 * (a[2] + b[2]) / 2 };
    });
    out.push({ pts: r.map(p => [p[0], 0, p[2]]).reverse(), light: 0.4 });
    return out;
  })(),
  dome: (() => {
    const out = [];
    const rings = 3, seg = 10;
    for (let k = 0; k < rings; k++) {
      const t0 = k / rings, t1 = (k + 1) / rings;
      const r0 = Math.cos(t0 * Math.PI / 2) * 0.5, y0 = Math.sin(t0 * Math.PI / 2);
      const r1 = Math.cos(t1 * Math.PI / 2) * 0.5, y1 = Math.sin(t1 * Math.PI / 2);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
        out.push({
          pts: [
            [Math.cos(a) * r0, y0, Math.sin(a) * r0], [Math.cos(b) * r0, y0, Math.sin(b) * r0],
            [Math.cos(b) * r1, y1, Math.sin(b) * r1], [Math.cos(a) * r1, y1, Math.sin(a) * r1],
          ],
          light: 0.6 + 0.34 * t1 + 0.14 * Math.cos((a + b) / 2),
        });
      }
    }
    return out;
  })(),
};

const hexOf = c => {
  const n = parseInt(String(c).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lit = (colour, k) => {
  const [r, g, b] = hexOf(colour);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};

/** The whole part list as triangles in world space, ready to sort and paint. */
export function facesOf(parts) {
  const out = [];
  for (const p of parts) {
    const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
    for (const face of facesFor(p.mesh)) {
      const pts = face.pts.map(([lx, ly, lz]) => {
        const sx = lx * p.w, sy = ly * p.h, sz = lz * p.d;
        // the same yaw convention the game uses: local +Z goes to (sin, cos)
        return [p.x + sx * c + sz * s, p.y + sy, p.z - sx * s + sz * c];
      });
      let cx = 0, cy = 0, cz = 0;
      for (const [x, y, z] of pts) { cx += x; cy += y; cz += z; }
      const n = pts.length;
      out.push({ pts, light: face.light, colour: p.colour, tag: p.tag,
        depth: (cx + cy + cz) / n });
    }
  }
  return out;
}

/**
 * Draw one building into a canvas.
 *
 * `fit` is worked out from the parts themselves, so a five-storey tower house and a burrow both fill
 * their tile — otherwise a gallery of twenty-six bases is mostly empty sky.
 */
export function drawBuilding(ctx, parts, {
  width, height, background = '#131a25', ground = '#1b2433', pad = 14, outline = true,
} = {}) {
  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  if (!parts.length) { ctx.restore(); return; }

  const faces = facesOf(parts);
  const project = ([x, y, z]) => [(x - z) * COS30, (x + z) * SIN30 - y];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const f of faces) for (const p of f.pts) {
    const [sx, sy] = project(p);
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  const scale = Math.min((width - pad * 2) / Math.max(0.01, maxX - minX),
    (height - pad * 2) / Math.max(0.01, maxY - minY));
  const ox = width / 2 - (minX + maxX) / 2 * scale;
  const oy = height / 2 - (minY + maxY) / 2 * scale;
  const to = p => { const [sx, sy] = project(p); return [ox + sx * scale, oy + sy * scale]; };

  // a patch of ground, so a dug-in building reads as dug in rather than as a floating mound
  ctx.fillStyle = ground;
  ctx.beginPath();
  for (const [i, corner] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
    const [sx, sy] = to([corner[0] * 14, 0, corner[1] * 14]);
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();

  faces.sort((a, b) => a.depth - b.depth);
  for (const f of faces) {
    ctx.beginPath();
    f.pts.forEach((p, i) => { const [sx, sy] = to(p); if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); });
    ctx.closePath();
    ctx.fillStyle = lit(f.colour, f.light);
    ctx.fill();
    if (outline && scale > 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A row of colour swatches — the palette view, one strip per culture. */
export function drawSwatches(ctx, colours, { width, height, labels = null } = {}) {
  const n = colours.length || 1;
  const w = width / n;
  ctx.save();
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colours[i];
    ctx.fillRect(i * w, 0, Math.ceil(w) + 1, height);
    if (labels && labels[i]) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(labels[i], i * w + 4, height - 5);
    }
  }
  ctx.restore();
}
