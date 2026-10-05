// The far horizon: the whole world from stream B's macro bake (data/world/macro.bin — 288 × 224 samples,
// one every 128 m, the field every zone was refined from), drawn as one low mesh in WORLD metres, so the
// hills and mountains several zones away are on the skyline and you can walk to them ("see it, walk to
// it", PLAN §12). Inside the zones that are loaded in full the horizon is cut away (a fragment discard
// against their rectangles), and its vertices on those zones' borders take the zone's own edge height, so
// the two meet instead of one poking through the other. Settlements from world.json become clusters of
// warm lights at night.
//
//   const hz = await createHorizon(scene, { quality })
//   hz.heightAt(x, z)  hz.setLoaded([bounds…], heightAt)  hz.setNight(0..1)  hz.setBiomes(reader.biomes)

import * as THREE from 'three';

const MAGIC = 'TVWM';

/** Decode macro.bin (tools/lib/world-core.mjs encodeMacro). Pure — exported for tests. */
export function decodeMacro(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MAGIC) throw new Error('macro.bin: bad magic ' + magic);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(4, true) !== 1) throw new Error('macro.bin: version ' + dv.getUint32(4, true));
  const jl = dv.getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jl)));
  const N = meta.width * meta.height;
  let off = (12 + jl + 3) & ~3;
  const elevation = new Float32Array(N), slope = new Float32Array(N);
  for (let i = 0; i < N; i++) elevation[i] = dv.getUint16(off + i * 2, true) / 65535;
  off += N * 2;
  for (let i = 0; i < N; i++) slope[i] = dv.getUint16(off + i * 2, true) / 65535;
  off += N * 2;
  const water = bytes.slice(off, off + N); off += N;
  const river = bytes.slice(off, off + N); off += N;
  const biome = bytes.slice(off, off + N);
  return { ...meta, elevation, slope, water, river, biome };
}

/** Macro elevation (0..1) -> metres, the bake's own rule (world-core makeRefiner `metres`). */
export function macroMetres(m, e) {
  const land = m.landMetres ?? 1400, sea = m.seaMetres ?? 160;
  return e >= 0.5 ? (e - 0.5) * 2 * land : (e - 0.5) * 2 * sea;
}
/** Bilinear macro height at world metres (the horizon mesh's own surface). */
export function macroHeightAt(m, H, x, z) {
  const M = m.macroMetres || 128, w = m.width, h = m.height;
  const fx = Math.max(0, Math.min(w - 1.0001, x / M)), fz = Math.max(0, Math.min(h - 1.0001, z / M));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = H[j * w + i], b = H[j * w + i + 1], c = H[(j + 1) * w + i], d = H[(j + 1) * w + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

const BIOME_FALLBACK = ['#0b1d33', '#123a5e', '#1d5a86', '#2a6fa8', '#d3c592', '#6f9f52', '#9fa04e', '#87984f', '#3f7a45', '#1e6b39', '#356052', '#8d9a8f', '#e2ecf2', '#dac68d', '#a5714a', '#4a6b52', '#7c8a55', '#7f786d', '#d8dce0', '#4b3730', '#4a3a56', '#57504c', '#68597a', '#8fd0a0', '#a99ada', '#cfe2ec'];
const MAX_HOLES = 8;

export async function createHorizon(scene, { quality = 'high', base = new URL('../../data/world/', import.meta.url) } = {}) {
  const [macroBuf, world] = await Promise.all([
    fetch(new URL('macro.bin', base)).then(r => { if (!r.ok) throw new Error('macro.bin ' + r.status); return r.arrayBuffer(); }),
    fetch(new URL('world.json', base)).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const m = decodeMacro(macroBuf);
  m.landMetres = world?.landMetres ?? m.landMetres; m.seaMetres = world?.seaMetres ?? m.seaMetres; m.macroMetres = world?.macroMetres ?? m.macroMetres ?? 128;
  const W = m.width, Hh = m.height, M = m.macroMetres;
  const H = new Float32Array(W * Hh);
  for (let k = 0; k < W * Hh; k++) H[k] = macroMetres(m, m.elevation[k]);
  const drawnH = new Float32Array(H);           // what the mesh shows (sea flattened)
  for (let k = 0; k < W * Hh; k++) if (m.water[k] === 1 || H[k] < 0) drawnH[k] = Math.max(-0.5, Math.min(H[k], -0.5));

  // ---- the mesh: one vertex per macro sample ----
  const step = quality === 'low' ? 2 : 1;
  const nx = Math.floor((W - 1) / step) + 1, nz = Math.floor((Hh - 1) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const vIndex = (i, j) => (j / step) * nx + (i / step);
  const c = new THREE.Color(), rock = new THREE.Color('#7b766d'), snow = new THREE.Color('#e6eaee'), sea = new THREE.Color('#2a5468');
  let palette = BIOME_FALLBACK;
  function colour(k, h) {
    if (m.water[k]) return c.copy(sea);
    c.set(palette[m.biome[k]] || '#6f9f52');
    // map colours are bright; pull toward the ground textures' tones
    c.multiplyScalar(0.78);
    const s = m.slope[k];
    if (s > 0.35) c.lerp(rock, Math.min(1, (s - 0.35) * 2.2));
    if (h > 900) c.lerp(snow, Math.min(1, (h - 900) / 300));
    return c;
  }
  function paint() {
    for (let j = 0, v = 0; j < Hh; j += step) for (let i = 0; i < W; i += step, v++) {
      const k = j * W + i, cc = colour(k, H[k]);
      col[v * 3] = cc.r; col[v * 3 + 1] = cc.g; col[v * 3 + 2] = cc.b;
    }
  }
  for (let j = 0, v = 0; j < Hh; j += step) for (let i = 0; i < W; i += step, v++) {
    pos[v * 3] = i * M; pos[v * 3 + 1] = drawnH[j * W + i]; pos[v * 3 + 2] = j * M;
  }
  paint();
  const idx = [];
  for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) { const p = b * nx + a, q = p + 1, r = p + nx, s = r + 1; idx.push(p, r, q, q, r, s); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const holes = Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(1, 1, 0, 0));   // min > max = empty
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uHoles = { value: holes };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vHW;\nuniform vec4 uHoles[${MAX_HOLES}];`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        for (int i = 0; i < ${MAX_HOLES}; i++) { vec4 hb = uHoles[i]; if (vHW.x > hb.x && vHW.x < hb.z && vHW.y > hb.y && vHW.y < hb.w) discard; }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'horizon'; mesh.receiveShadow = false; mesh.castShadow = false; mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  scene.add(mesh);

  // ---- night lights where people live ----
  const lights = [];
  for (const n of world?.nodes || []) if (n.type === 'settlement') {
    const count = { capital: 18, city: 14, town: 9, village: 6, hamlet: 3, port: 7 }[n.kind] || 3;
    let s = (n.id * 2654435761) >>> 0;
    const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0) / 4294967296);
    for (let k = 0; k < count; k++) {
      const x = n.x + (rnd() - 0.5) * count * 9, z = n.z + (rnd() - 0.5) * count * 9;
      lights.push(x, Math.max(0, macroHeightAt(m, drawnH, x, z)) + 6, z);
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
  const lmat = new THREE.PointsMaterial({ color: '#ffc070', size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const points = new THREE.Points(lg, lmat); points.visible = false; points.frustumCulled = false; points.name = 'horizon-lights';
  scene.add(points);
  let loadedRects = [];

  /**
   * The zones drawn in full: cut them out, and pull the horizon's vertices on their borders to the
   * zone's own edge heights (`heightAt` = the composite ground) so the two surfaces meet.
   */
  function setLoaded(rects, heightAt = null) {
    loadedRects = rects.slice(0, MAX_HOLES);
    holes.forEach((h, i) => { const r = loadedRects[i]; if (r) h.set(r.minX, r.minZ, r.maxX, r.maxZ); else h.set(1, 1, 0, 0); });
    // restore everything, then snap borders
    for (let j = 0, v = 0; j < Hh; j += step) for (let i = 0; i < W; i += step, v++) pos[v * 3 + 1] = drawnH[j * W + i];
    if (heightAt) for (const r of loadedRects) {
      for (let j = 0; j < Hh; j += step) for (let i = 0; i < W; i += step) {
        const x = i * M, z = j * M;
        const onX = (x === r.minX || x === r.maxX) && z >= r.minZ && z <= r.maxZ, onZ = (z === r.minZ || z === r.maxZ) && x >= r.minX && x <= r.maxX;
        if (!onX && !onZ) continue;
        const inset = 0.5;
        const hx = Math.min(r.maxX - inset, Math.max(r.minX + inset, x)), hz = Math.min(r.maxZ - inset, Math.max(r.minZ + inset, z));
        pos[vIndex(i, j) * 3 + 1] = heightAt(hx, hz) - 0.8;
      }
    }
    geo.attributes.position.needsUpdate = true;
  }

  return {
    mesh, points, macro: m, world,
    heightAt: (x, z) => macroHeightAt(m, drawnH, x, z),
    setLoaded,
    setBiomes(biomes) { if (!biomes || palette !== BIOME_FALLBACK) return; palette = biomes.map(b => b.color); paint(); geo.attributes.color.needsUpdate = true; },
    setNight(n) { points.visible = n > 0.05; lmat.opacity = Math.min(1, n * 1.2); },
    setVisible(v) { mesh.visible = v; points.visible = v && lmat.opacity > 0.05; },
    get holes() { return loadedRects; },
  };
}
