// Pixel splats — the sampling half (no DOM; node-tested in tests/sample.test.mjs).
//
// Idea (owner 2026-11-24, from a Reddit post by Tommaso Checchi, "Not Baked, Not a Filter: Gaussian Splats That Catch
// Live Highlights"): a model made of tens of thousands of SQUARE splats, each carrying material data (colour, surface
// direction, how metal / how rough) instead of a finished colour, so the light is worked out live and highlights slide
// over the helmet and shield as it turns — and every splat lands on one cell of a fixed pixel grid, so it stays crisp
// pixel art while it rotates, with no pixel filter on top.
//
// The post TRAINS its splats (gradient descent on the G-buffer of a 3D knight, with losses for grid alignment, holes,
// overlaps). We SAMPLE them straight off the model's surface instead: area-weighted points on the triangles, each
// reading the texture under it and the interpolated surface normal. Same data per splat, no training step. The model
// here has only a colour texture, so metal / rough are estimated from the colour (materialFromColour).
//
//   bakeModel(root, THREE)                → { geometry (position, normal, uv, tex in one static mesh; a group per
//                                           texture), images: [picture per texture], bounds }   — in its CURRENT pose
//   sampleSplats(geometry, pixels, n, seed) → { count, position, normal, albedo (linear), material (metal, rough) }
//                                           pixels: one { width, height, data } or a list, one per texture
//   materialFromColour(r, g, b)           → [metal, rough]   (sRGB 0..1)

/** One static mesh from every (skinned) mesh in a loaded model, in its rest pose, scaled to 1.8 m and standing at 0. */
export function bakeModel(root, THREE) {
  root.updateMatrixWorld(true);
  const pos = [], nor = [], uv = [], tex = [], images = [], groups = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), w = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    if (!P || !U) return;
    const img = o.material?.map?.image || o.material?.emissiveMap?.image || null;
    let ti = images.indexOf(img); if (ti < 0) { ti = images.length; images.push(img); }
    const start = pos.length / 3;
    nm.getNormalMatrix(o.matrixWorld);
    const idx = g.index ? g.index.array : null, count = idx ? idx.length : P.count;
    for (let k = 0; k < count; k++) {
      const i = idx ? idx[k] : k;
      v.fromBufferAttribute(P, i);
      n.fromBufferAttribute(N, i);
      if (o.isSkinnedMesh) {
        // the normal must follow the pose too (left in the rest pose, a raised arm's splats faced the wrong way, were
        // thrown out as back-facing and left holes): skin a point a little way along it and take the difference
        w.copy(v).addScaledVector(n, 0.01);
        o.applyBoneTransform(i, v); o.applyBoneTransform(i, w);
        n.subVectors(w, v);
      }
      v.applyMatrix4(o.matrixWorld);
      n.applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uv.push(U.getX(i), U.getY(i)); tex.push(ti);
    }
    groups.push([start, pos.length / 3 - start, ti]);
  });
  // stand it on the ground, 1.8 m tall, centred
  let minY = Infinity, maxY = -Infinity, cx = 0, cz = 0;
  for (let i = 0; i < pos.length; i += 3) { minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]); cx += pos[i]; cz += pos[i + 2]; }
  const m = pos.length / 3; cx /= m; cz /= m;
  const s = 1.8 / Math.max(1e-6, maxY - minY);
  for (let i = 0; i < pos.length; i += 3) { pos[i] = (pos[i] - cx) * s; pos[i + 1] = (pos[i + 1] - minY) * s; pos[i + 2] = (pos[i + 2] - cz) * s; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('tex', new THREE.Float32BufferAttribute(tex, 1));
  for (const [start, count, ti] of groups) geometry.addGroup(start, count, ti);
  geometry.computeBoundingBox();
  return { geometry, images, image: images[0] || null, bounds: geometry.boundingBox };
}

/** Steel and gold shine, cloth and leather do not: a guess from the colour alone (this model has no metal/rough maps). */
export function materialFromColour(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0 ? (mx - mn) / mx : 0, lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let h = 0;
  if (mx > mn) { h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h *= 60; if (h < 0) h += 360; }
  if (h >= 30 && h <= 58 && sat > 0.35 && lum > 0.3) return [1, 0.3];                       // gold / brass
  if (sat < 0.17 && lum > 0.42) return [0.92, 0.22 + (1 - lum) * 0.25];                      // polished steel
  if (sat < 0.17 && lum > 0.18) return [0.6, 0.45];                                          // dark iron
  return [0, 0.78];                                                                           // cloth, leather, skin
}

const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * `n` splats spread over the surface by area. `pixels` = { width, height, data } of the colour texture (RGBA bytes;
 * glTF puts uv (0,0) at the top-left of the picture).
 */
export function sampleSplats(geometry, pixels, n = 60000, seed = 7) {
  const P = geometry.attributes.position.array, N = geometry.attributes.normal.array, U = geometry.attributes.uv.array;
  const TX = geometry.attributes.tex?.array || null, list = Array.isArray(pixels) ? pixels : [pixels];
  const tris = P.length / 9, area = new Float64Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2], bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
    total += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
    area[t] = total;                                       // running sum: pick a triangle by binary search
  }
  const rng = rngOf(seed);
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), albedo = new Float32Array(n * 3), material = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const want = rng() * total;
    let lo = 0, hi = tris - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (area[mid] < want) lo = mid + 1; else hi = mid; }
    let a = rng(), b = rng(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
    const c = 1 - a - b, o = lo * 9, q = lo * 6;
    for (let k = 0; k < 3; k++) {
      position[i * 3 + k] = P[o + k] * c + P[o + 3 + k] * a + P[o + 6 + k] * b;
      normal[i * 3 + k] = N[o + k] * c + N[o + 3 + k] * a + N[o + 6 + k] * b;
    }
    const l = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1;
    normal[i * 3] /= l; normal[i * 3 + 1] /= l; normal[i * 3 + 2] /= l;
    const u = U[q] * c + U[q + 2] * a + U[q + 4] * b, vv = U[q + 1] * c + U[q + 3] * a + U[q + 5] * b;
    let r = 0.7, g = 0.7, bl = 0.7;
    const pixels = list[TX ? TX[lo * 3] : 0] || null;
    if (pixels) {
      const px = Math.min(pixels.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * pixels.width)));
      const py = Math.min(pixels.height - 1, Math.max(0, Math.floor((vv - Math.floor(vv)) * pixels.height)));
      const d = (py * pixels.width + px) * 4;
      r = pixels.data[d] / 255; g = pixels.data[d + 1] / 255; bl = pixels.data[d + 2] / 255;
    }
    albedo[i * 3] = lin(r); albedo[i * 3 + 1] = lin(g); albedo[i * 3 + 2] = lin(bl);
    const [metal, rough] = materialFromColour(r, g, bl);
    material[i * 2] = metal; material[i * 2 + 1] = rough;
  }
  return { count: n, position, normal, albedo, material };
}
