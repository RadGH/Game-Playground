// The ground mesh, built from the terrain's own height grid (terrain.js) with the reader's diagonal,
// so `heightAt` is exactly the drawn surface and feet sit on it to the millimetre.
//
// A 2 km zone is a million samples, so the grid is cut into 64-cell chunks, each built lazily at the
// detail its distance deserves (every sample near you; every 4th, 16th further out). A short skirt
// hangs off every chunk rim so the seam between a fine chunk and a coarse one never shows sky.
// Four kit surfaces (grass, forest floor, rock, sand) are blended per pixel; the weights come from the
// zone's biome and slope per vertex, and the biome colour tints the ground so a marsh reads as a marsh.
// Water is drawn from the reader's own water layer: a triangle is wet only when all three corners are.

import * as THREE from 'three';
import { makeSurface, makeWaterNormals } from '../../../../highdef-3d/js/kit/textures.js';

const CHUNK = 64;
const SKIRT = 3;
const FOREST = new Set(['temperateForest', 'rainforest', 'borealForest', 'blighted', 'marsh', 'hallowed']);
const SAND = new Set(['beach', 'desert', 'savanna', 'coast']);
const ROCK = new Set(['mountains', 'snowyPeaks', 'badlands', 'volcanic', 'ashPlain', 'glimmerwaste', 'tundra']);

export function createTerrainView(T, { textureSize = 512, quality = 'high', clearings = [], biomeColors = null } = {}) {
  const group = new THREE.Group(); group.name = 'terrain';
  const grid = T.heightGrid();
  const { res, step, origin } = T;
  const cells = res - 1;
  const per = Math.ceil(cells / CHUNK);
  const strides = quality === 'low' ? [2, 8, 16] : [1, 4, 16];
  const dist = quality === 'low' ? [90, 320] : [180, 520];

  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const col = new THREE.Color(), bcol = new THREE.Color();
  function surface(x, z, out, o) {
    const slope = T.slopeDeg(x, z), b = T.biomeKey(x, z);
    let forest = FOREST.has(b) ? 0.75 : b === 'hills' || b === 'shrubland' ? 0.25 : 0;
    let rock = Math.max(smooth(26, 38, slope), ROCK.has(b) ? 0.55 : 0);
    let sand = SAND.has(b) ? 0.8 : 0;
    const w = T.waterAt(x, z);
    if (w.depth > 0) sand = Math.max(sand, 0.7);
    let path = 0;
    for (const c of clearings) { const d = Math.hypot(x - c.x, z - c.z) / c.r; forest *= smooth(0.7, 1.2, d); path = Math.max(path, (1 - smooth(0.12, 0.6, d)) * 0.7); }
    forest *= 1 - rock; path *= 1 - rock;
    let s = forest + rock + sand + path;
    if (s > 1) { forest /= s; rock /= s; sand /= s; path /= s; }
    out[o] = forest; out[o + 1] = rock; out[o + 2] = sand; out[o + 3] = path;
    // A faint pull toward the biome's own colour, so neighbouring biomes read differently.
    const hex = biomeColors?.[b];
    col.setRGB(1, 1, 1);
    if (hex) { bcol.set(hex); const l = (bcol.r + bcol.g + bcol.b) / 3 || 1; col.setRGB(0.82 + 0.18 * bcol.r / l, 0.82 + 0.18 * bcol.g / l, 0.82 + 0.18 * bcol.b / l); }
    return col;
  }

  // --- material --------------------------------------------------------------------------------
  const surf = k => { const s = makeSurface(k, { size: textureSize, seed: 7 }); s.map.anisotropy = 8; s.map.wrapS = s.map.wrapT = THREE.RepeatWrapping; return s.map; };
  const tex = quality === 'low' ? null : { grass: surf('grass'), floor: surf('forest_floor'), rock: surf('rock'), sand: surf('sand'), path: surf('dirt') };
  // Low quality (software renderers, weak GPUs): one Lambert pass with the surfaces pre-mixed into the
  // vertex colour. The splat shader fills every ground pixel with five texture reads, which is what
  // costs a software renderer 90% of its frame.
  const cheap = quality === 'low';
  const LOW = { grass: new THREE.Color('#5f7d3c'), floor: new THREE.Color('#4d4630'), rock: new THREE.Color('#7b766d'), sand: new THREE.Color('#b8a676'), path: new THREE.Color('#7a6446') };
  const material = cheap ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (!cheap) material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { tGrass: { value: tex.grass }, tFloor: { value: tex.floor }, tRock: { value: tex.rock }, tSand: { value: tex.sand }, tPath: { value: tex.path } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vW = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tFloor, tRock, tSand, tPath; varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;
        float tvHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float tvNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(tvHash(i),tvHash(i+vec2(1,0)),f.x), mix(tvHash(i+vec2(0,1)),tvHash(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        {
          vec2 p = vW.xz;
          float wF = vSplat.x, wR = vSplat.y, wS = vSplat.z, wP = vSplat.w;
          float wG = clamp(1.0 - wF - wR - wS - wP, 0.0, 1.0);
          vec3 c = texture2D(tGrass, p * 0.14).rgb * wG + texture2D(tFloor, p * 0.12).rgb * wF + texture2D(tSand, p * 0.16).rgb * wS + texture2D(tPath, p * 0.15).rgb * wP;
          if (wR > 0.002) {
            vec3 n = normalize(vWN); vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
            c += (texture2D(tRock, vW.zy * 0.06).rgb * b.x + texture2D(tRock, vW.xz * 0.06).rgb * b.y + texture2D(tRock, vW.xy * 0.06).rgb * b.z) * wR;
          }
          float macro = tvNoise(p * 0.012) * 0.5 + tvNoise(p * 0.041) * 0.5;
          c *= mix(0.84, 1.14, macro);
          float camD = length(vW - cameraPosition);
          float near = 1.0 - smoothstep(18.0, 60.0, camD);
          vec3 det = texture2D(tGrass, p * 0.9).rgb;
          c = mix(c, c * (det * 1.5 + 0.28), near * 0.25);
          diffuseColor.rgb *= c;
        }`);
  };

  // --- chunks ------------------------------------------------------------------------------------
  function buildChunk(ci, cj, stride) {
    const i0 = ci * CHUNK, j0 = cj * CHUNK, i1 = Math.min(cells, i0 + CHUNK), j1 = Math.min(cells, j0 + CHUNK);
    const nx = Math.floor((i1 - i0) / stride) + 1, nz = Math.floor((j1 - j0) / stride) + 1;
    const count = nx * nz, rim = 2 * (nx + nz) - 4, total = count + rim;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), cols = new Float32Array(total * 3), spl = new Float32Array(total * 4);
    const H = (i, j) => grid[Math.min(cells, Math.max(0, j)) * res + Math.min(cells, Math.max(0, i))];
    let v = 0;
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++, v++) {
      const i = i0 + a * stride, j = j0 + b * stride;
      const x = origin.x + i * step, z = origin.z + j * step, y = H(i, j);
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const ddx = (H(i + 1, j) - H(i - 1, j)) / (2 * step), ddz = (H(i, j + 1) - H(i, j - 1)) / (2 * step), l = Math.hypot(ddx, 1, ddz);
      nor[v * 3] = -ddx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -ddz / l;
      const c = surface(x, z, spl, v * 4);
      if (cheap) {
        const wf = spl[v * 4], wr = spl[v * 4 + 1], ws = spl[v * 4 + 2], wp = spl[v * 4 + 3], wg = Math.max(0, 1 - wf - wr - ws - wp);
        const n = 0.92 + 0.16 * (((i * 73856093) ^ (j * 19349663)) >>> 0) / 4294967296;   // a little grain per vertex
        cols[v * 3] = (LOW.grass.r * wg + LOW.floor.r * wf + LOW.rock.r * wr + LOW.sand.r * ws + LOW.path.r * wp) * c.r * n;
        cols[v * 3 + 1] = (LOW.grass.g * wg + LOW.floor.g * wf + LOW.rock.g * wr + LOW.sand.g * ws + LOW.path.g * wp) * c.g * n;
        cols[v * 3 + 2] = (LOW.grass.b * wg + LOW.floor.b * wf + LOW.rock.b * wr + LOW.sand.b * ws + LOW.path.b * wp) * c.b * n;
      } else { cols[v * 3] = c.r; cols[v * 3 + 1] = c.g; cols[v * 3 + 2] = c.b; }
    }
    const idx = [];
    for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) {
      const p = b * nx + a, q = p + 1, r = p + nx, s = r + 1;   // p=(i,j) q=(i+1,j) r=(i,j+1) s=(i+1,j+1)
      idx.push(p, r, q, q, r, s);                                // same split as the reader: q–r diagonal
    }
    // Skirt: a copy of the rim dropped SKIRT metres, stitched to the rim.
    const ring = [];
    for (let a = 0; a < nx; a++) ring.push(a);
    for (let b = 1; b < nz; b++) ring.push(b * nx + nx - 1);
    for (let a = nx - 2; a >= 0; a--) ring.push((nz - 1) * nx + a);
    for (let b = nz - 2; b >= 1; b--) ring.push(b * nx);
    const base = v;
    for (const src of ring) {
      pos[v * 3] = pos[src * 3]; pos[v * 3 + 1] = pos[src * 3 + 1] - SKIRT; pos[v * 3 + 2] = pos[src * 3 + 2];
      for (let k = 0; k < 3; k++) { nor[v * 3 + k] = nor[src * 3 + k]; cols[v * 3 + k] = cols[src * 3 + k]; }
      for (let k = 0; k < 4; k++) spl[v * 4 + k] = spl[src * 4 + k];
      v++;
    }
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length], A = base + k, B = base + (k + 1) % ring.length;
      idx.push(a, b, A, b, B, A, a, A, b, b, A, B);   // both windings: the skirt is seen from either side
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4));
    g.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  const chunks = [];
  for (let cj = 0; cj < per; cj++) for (let ci = 0; ci < per; ci++) {
    const cx = origin.x + (ci + 0.5) * CHUNK * step, cz = origin.z + (cj + 0.5) * CHUNK * step;
    const mesh = new THREE.Mesh(buildChunk(ci, cj, strides[2]), material);
    mesh.receiveShadow = true; mesh.name = `chunk-${ci}-${cj}`;
    group.add(mesh);
    chunks.push({ ci, cj, cx, cz, mesh, level: 2, geos: [null, null, mesh.geometry] });
  }

  // --- water --------------------------------------------------------------------------------------
  let water = null, normals = null;
  const wg = T.waterGrid();
  if (wg) {
    const ws = quality === 'low' ? 2 : 1;
    const map = new Int32Array(res * res).fill(-1);
    const wpos = [], widx = [];
    const vert = (i, j) => { const k = j * res + i; if (map[k] < 0) { map[k] = wpos.length / 3; wpos.push(origin.x + i * step, wg[k], origin.z + j * step); } return map[k]; };
    for (let j = 0; j + ws <= cells; j += ws) for (let i = 0; i + ws <= cells; i += ws) {
      const a = wg[j * res + i], b = wg[j * res + i + ws], c = wg[(j + ws) * res + i], d = wg[(j + ws) * res + i + ws];
      if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c)) widx.push(vert(i, j), vert(i, j + ws), vert(i + ws, j));
      if (!Number.isNaN(b) && !Number.isNaN(c) && !Number.isNaN(d)) widx.push(vert(i + ws, j), vert(i, j + ws), vert(i + ws, j + ws));
    }
    if (widx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      g.setIndex(widx); g.computeVertexNormals();
      const uv = new Float32Array(wpos.length / 3 * 2);
      for (let k = 0; k < uv.length / 2; k++) { uv[k * 2] = wpos[k * 3] / 24; uv[k * 2 + 1] = wpos[k * 3 + 2] / 24; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      normals = makeWaterNormals(256, 7); normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
      water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#2c5b6e', roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.84, normalMap: normals, normalScale: new THREE.Vector2(0.4, 0.4), depthWrite: false }));
      water.position.y = 0.02; water.renderOrder = 1; water.name = 'water';
      group.add(water);
    }
  }

  // --- per frame: re-level the chunks near the camera (two rebuilds a frame at most) --------------
  let lodAt = 0, t = 0;
  function update(dt, cam) {
    t += dt;
    if (normals) normals.offset.set(t * 0.012, t * 0.007);
    if (!cam || t < lodAt) return;
    lodAt = t + 0.25;
    let built = 0;
    const order = chunks.map(c => ({ c, d: Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z) - CHUNK * step * 0.7) })).sort((a, b) => a.d - b.d);
    for (const { c, d } of order) {
      const want = d < dist[0] ? 0 : d < dist[1] ? 1 : 2;
      if (want === c.level) continue;
      if (!c.geos[want]) { if (built >= 2) continue; c.geos[want] = buildChunk(c.ci, c.cj, strides[want]); built++; }
      c.mesh.geometry = c.geos[want]; c.level = want;
    }
  }

  return { group, material, water, update, ready: () => chunks.every(c => c.level !== 2 || true) };
}
