// The far horizon: the whole world drawn beyond the zones that are loaded in full, in WORLD metres, so the hills and
// mountains several zones away are on the skyline and you can walk to them ("see it, walk to it", PLAN §12).
//
// Source (2026-10-05): stream B's data/world/horizon.bin — the whole world at 32 m, EXACT in baked zones — cut into
// chunks with distance LOD (horizon-grid.js: fine rings near the camera, coarser rings far away, skirts so strides
// meet without cracks). The file is inflated and every chunk is built in a worker (horizon-worker.js), so the main
// thread only hands finished arrays to the GPU; without workers the same code runs on the main thread, one chunk a
// frame. Low quality uses bigger chunks and coarser strides (64 m at best). If horizon.bin cannot be read — or with
// ?horizon=macro — the old single mesh from macro.bin (128 m, below) is drawn instead.
//
// Inside the zones loaded in full the horizon is hidden: a chunk wholly under loaded zones is not drawn, and a chunk
// partly under them is rebuilt with those cells left out (so nothing is rasterised beneath the real ground). The
// macro fallback still cuts them with a fragment discard. Settlements from world.json are warm lights at night.
//
//   const hz = await createHorizon(scene, { quality })
//   hz.update(cameraPosition)   (every frame)   hz.heightAt(x, z)  hz.setLoaded([bounds…])  hz.setNight(0..1)
//   hz.setBiomes(reader.biomes) (macro only)    hz.setVisible(bool)  hz.stats()

import * as THREE from 'three';
import { CHUNK, prepareGrid, buildChunk, gridHeightAt, chunkCounts, chunkRect, rectDistance, coveredBy, touchedBy, lodFor } from './horizon-grid.js';

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

/** The fine horizon (horizon.bin) unless it cannot be read or ?horizon=macro asks for the old one. */
export async function createHorizon(scene, { quality = 'high', base = new URL('../../data/world/', import.meta.url), source = null } = {}) {
  const want = source || (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('horizon') : null) || 'fine';
  if (want !== 'macro') {
    try { return await createFineHorizon(scene, { quality, base }); }
    catch (e) { console.warn('[horizon] horizon.bin not used, drawing macro.bin instead:', e.message); }
  }
  return createMacroHorizon(scene, { quality, base });
}

/** The hole cut (zones loaded in full) as a material patch shared by both horizons. */
function holeMaterial(holes) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uHoles = { value: holes };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vHW;\nuniform vec4 uHoles[${MAX_HOLES}];`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        for (int i = 0; i < ${MAX_HOLES}; i++) { vec4 hb = uHoles[i]; if (vHW.x > hb.x && vHW.x < hb.z && vHW.y > hb.y && vHW.y < hb.w) discard; }`);
  };
  return mat;
}

/** Warm points where people live (world.json settlements), lit at night. */
function settlementLights(world, heightAt) {
  const lights = [];
  for (const n of world?.nodes || []) if (n.type === 'settlement') {
    const count = { capital: 18, city: 14, town: 9, village: 6, hamlet: 3, port: 7 }[n.kind] || 3;
    let s = (n.id * 2654435761) >>> 0;
    const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0) / 4294967296);
    for (let k = 0; k < count; k++) {
      const x = n.x + (rnd() - 0.5) * count * 9, z = n.z + (rnd() - 0.5) * count * 9;
      lights.push(x, Math.max(0, heightAt(x, z)) + 6, z);
    }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
  const lmat = new THREE.PointsMaterial({ color: '#ffc070', size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const points = new THREE.Points(lg, lmat); points.visible = false; points.frustumCulled = false; points.name = 'horizon-lights';
  return { points, lmat };
}

/**
 * Chunk source: a module worker when the browser has one (inflate + every chunk off the main thread), else the same
 * functions here. `ready` resolves with { meta, W, H, step, drawn, wet }; `chunk(ci, cj, chunk, stride)` -> arrays.
 */
async function chunkSource(url) {
  if (typeof Worker !== 'undefined') {
    let w;
    try {
      w = new Worker(new URL('./horizon-worker.js', import.meta.url), { type: 'module' });
      const waiting = new Map(); let nextId = 1;
      const info = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('worker timed out')), 30000);
        w.onerror = e => { clearTimeout(t); reject(new Error(e.message || 'worker failed')); };
        w.onmessage = ({ data }) => {
          if (data.type === 'ready') { clearTimeout(t); resolve(data); }
          else if (data.type === 'error' && data.id == null) { clearTimeout(t); reject(new Error(data.message)); }
          else if (data.type === 'chunk' || data.type === 'error') { const p = waiting.get(data.id); waiting.delete(data.id); if (p) (data.type === 'chunk' ? p.resolve(data) : p.reject(new Error(data.message))); }
        };
        w.postMessage({ type: 'load', url: String(url) });
      });
      return {
        info, worker: true, maxInFlight: 8,
        chunk: (ci, cj, chunk, stride, holes) => new Promise((resolve, reject) => { const id = nextId++; waiting.set(id, { resolve, reject }); w.postMessage({ type: 'chunk', id, ci, cj, chunk, stride, holes }); }),
        dispose: () => w.terminate(),
      };
    } catch (e) {
      try { w?.terminate(); } catch { /* gone */ }
      console.warn('[horizon] no worker, building on the main thread:', e.message);
    }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('horizon.bin ' + r.status);
  const g = prepareGrid(await r.arrayBuffer());
  return { info: g, worker: false, maxInFlight: 1, chunk: async (ci, cj, chunk, stride, holes) => buildChunk(g, ci, cj, chunk, stride, holes), dispose() {} };
}

async function createFineHorizon(scene, { quality, base }) {
  const [src, world] = await Promise.all([
    chunkSource(new URL('horizon.bin', base)),
    fetch(new URL('world.json', base)).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const g = src.info;                                   // { meta, W, H, step, drawn, wet } (drawn = what the mesh shows)
  const size = CHUNK[quality] || CHUNK.high;
  const { cx, cz } = chunkCounts(g, size);
  // no fragment discard here: cells under loaded zones are left out of the chunk itself (rebuilt when that set changes)
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group(); group.name = 'horizon';
  scene.add(group);
  const heightAt = (x, z) => gridHeightAt(g, x, z);
  const { points, lmat } = settlementLights(world, heightAt);
  scene.add(points);

  const chunks = [];
  for (let cj = 0; cj < cz; cj++) for (let ci = 0; ci < cx; ci++) chunks.push({ ci, cj, rect: chunkRect(g, ci, cj, size), mesh: null, stride: 0, want: 0, pending: 0, covered: false, dist: 0, tris: 0, holesVer: 0, needVer: 0 });
  let loadedRects = [], visible = true, inFlight = 0, coverDirty = true, built = 0, holesVer = 0;

  function apply(ch, c) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(c.nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c.col, 3));
    geo.setIndex(new THREE.BufferAttribute(c.idx, 1));
    geo.computeBoundingSphere();
    if (ch.mesh) { ch.mesh.geometry.dispose(); ch.mesh.geometry = geo; }
    else {
      ch.mesh = new THREE.Mesh(geo, mat);
      ch.mesh.name = `horizon-${ch.ci}-${ch.cj}`; ch.mesh.castShadow = false; ch.mesh.receiveShadow = false;
      ch.mesh.renderOrder = -1; ch.mesh.matrixAutoUpdate = false;
      group.add(ch.mesh);
    }
    ch.mesh.visible = !ch.covered;
    ch.stride = c.stride; ch.tris = c.tris; built++;
    ch.want = lodFor(ch.dist, quality, ch.stride);
  }

  function request(ch, stride) {
    ch.pending = stride; inFlight++;
    const ver = ch.needVer, cut = ver ? loadedRects.filter(r => touchedBy(ch.rect, [r])) : null;
    src.chunk(ch.ci, ch.cj, size, stride, cut).then(c => { apply(ch, c); ch.holesVer = ver; })
      .catch(e => console.warn('[horizon] chunk failed', ch.ci, ch.cj, e.message))
      .finally(() => { ch.pending = 0; inFlight--; if (src.worker) pump(); });   // keep the worker fed at any frame rate
  }

  /** Every frame: pick each chunk's stride from the camera distance, then ask for the most urgent rebuilds. */
  function update(cam) {
    if (!cam) return;
    if (coverDirty) {
      for (const ch of chunks) {
        ch.covered = coveredBy(ch.rect, loadedRects);
        if (ch.mesh) ch.mesh.visible = !ch.covered;
        // partly under loaded zones: rebuild with those cells cut out (and rebuild whole once they unload)
        const touched = !ch.covered && touchedBy(ch.rect, loadedRects);
        ch.needVer = touched ? holesVer : 0;
      }
      coverDirty = false;
    }
    lastCam.x = cam.x; lastCam.z = cam.z;
    if (Math.hypot(cam.x - lodAt.x, cam.z - lodAt.z) > 32 || lodDirty) {
      lodAt.x = cam.x; lodAt.z = cam.z; lodDirty = false;
      for (const ch of chunks) { ch.dist = rectDistance(ch.rect, cam.x, cam.z); ch.want = lodFor(ch.dist, quality, ch.stride); }
    }
    pump();
  }
  const lastCam = { x: NaN, z: NaN }, lodAt = { x: Infinity, z: Infinity };
  let lodDirty = true;
  /** Ask for the most urgent rebuilds until the source is busy: nothing drawn yet first (coarse, so the whole world
   *  appears at once), then nearest first. One per frame without a worker (built here, on the main thread). */
  function pump() {
    while (inFlight < src.maxInFlight && Number.isFinite(lastCam.x)) {
      let best = null, bestScore = Infinity;
      for (const ch of chunks) {
        if (ch.pending || ch.covered || (ch.want === ch.stride && ch.holesVer === ch.needVer)) continue;
        const score = (ch.mesh ? 1e6 : 0) + ch.dist;
        if (score < bestScore) { bestScore = score; best = ch; }
      }
      if (!best) return;
      request(best, best.mesh ? best.want : Math.max(best.want, best.dist > 4000 ? 8 : best.want));
      if (!src.worker) return;
    }
  }

  function setLoaded(rects) {
    const key = rects.map(r => `${r.minX},${r.minZ},${r.maxX},${r.maxZ}`).sort().join('|');
    if (key === setLoaded.key) return;
    setLoaded.key = key;
    loadedRects = rects.slice(); holesVer++; coverDirty = true;
  }

  return {
    source: 'horizon.bin', group, points, world, update, heightAt, setLoaded,
    setBiomes() { /* horizon.bin carries its own biome palette */ },
    setNight(n) { points.visible = visible && n > 0.05; lmat.opacity = Math.min(1, n * 1.2); },
    setVisible(v) { visible = v; group.visible = v; points.visible = v && lmat.opacity > 0.05; },
    get holes() { return loadedRects; },
    stats() {
      const lods = {}; let tris = 0, drawn = 0;
      for (const ch of chunks) if (ch.mesh && !ch.covered) { drawn++; tris += ch.tris; lods[ch.stride] = (lods[ch.stride] || 0) + 1; }
      return { source: 'horizon.bin', worker: src.worker, chunks: chunks.length, drawn, tris, lods, pending: inFlight, built, cut: chunks.filter(c => c.needVer).length };
    },
    dispose() { src.dispose(); for (const ch of chunks) ch.mesh?.geometry.dispose(); mat.dispose(); scene.remove(group); scene.remove(points); },
  };
}

/** The old horizon: one mesh over macro.bin (128 m). Low quality's fallback when horizon.bin cannot be read. */
async function createMacroHorizon(scene, { quality = 'high', base = new URL('../../data/world/', import.meta.url) } = {}) {
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
  const mat = holeMaterial(holes);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'horizon'; mesh.receiveShadow = false; mesh.castShadow = false; mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  scene.add(mesh);

  const { points, lmat } = settlementLights(world, (x, z) => macroHeightAt(m, drawnH, x, z));
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
    source: 'macro.bin', mesh, points, macro: m, world,
    update() { /* one mesh: nothing to stream */ },
    stats: () => ({ source: 'macro.bin', chunks: 1, drawn: mesh.visible ? 1 : 0, tris: idx.length / 3 }),
    heightAt: (x, z) => macroHeightAt(m, drawnH, x, z),
    setLoaded,
    setBiomes(biomes) { if (!biomes || palette !== BIOME_FALLBACK) return; palette = biomes.map(b => b.color); paint(); geo.attributes.color.needsUpdate = true; },
    setNight(n) { points.visible = n > 0.05; lmat.opacity = Math.min(1, n * 1.2); },
    setVisible(v) { mesh.visible = v; points.visible = v && lmat.opacity > 0.05; },
    get holes() { return loadedRects; },
  };
}
