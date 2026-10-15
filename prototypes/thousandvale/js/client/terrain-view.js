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
import { makeSurface } from '../../../../highdef-3d/js/kit/textures.js';
import { perf } from './perf.js';

/** Surfaces are made once per page: every zone's ground shares the same five textures. */
const TEX_CACHE = new Map();
let WATER_N = null;
/** The page's one water normal map (shared by every zone; scrolled by the wall clock so zones agree). */
export function waterNormals() {
  if (!WATER_N) { WATER_N = perf.span('terrain:waterNormals', () => quickWaterNormals(128)); WATER_N.wrapS = WATER_N.wrapT = THREE.RepeatWrapping; }
  return WATER_N;
}
/**
 * A tileable ripple normal map from a handful of integer-frequency waves, straight into a DataTexture (no canvas,
 * no read-back): ~2 ms. The kit's makeWaterNormals adds fBm through a canvas and cost seconds on a slow machine.
 */
export function quickWaterNormals(size = 128) {
  const waves = [[1, 2, 1, 0.3], [-2, 1, 0.8, 1.7], [3, -1, 0.5, 4.1], [-1, -3, 0.6, 2.2], [5, 7, 0.22, 0.9], [-7, 5, 0.18, 3.3], [9, -4, 0.14, 5.1], [-6, -11, 0.1, 1.2]];
  const h = new Float32Array(size * size), TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; let s = 0;
    for (const [kx, ky, a, ph] of waves) s += a * Math.sin((kx * u + ky * v) * TAU + ph);
    h[y * size + x] = s;
  }
  const out = new Uint8Array(size * size * 4), at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)], k = 0.9;
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
    const nx = -(at(x + 1, y) - at(x - 1, y)) * k, ny = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(nx, ny, 1);
    out[i] = (nx / l * 0.5 + 0.5) * 255; out[i + 1] = (ny / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  const t = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
const CHUNK = 64;
const SKIRT = 3;
const FOREST = new Set(['temperateForest', 'rainforest', 'borealForest', 'blighted', 'marsh', 'hallowed']);
const SAND = new Set(['beach', 'desert', 'savanna', 'coast']);
const ROCK = new Set(['mountains', 'snowyPeaks', 'badlands', 'volcanic', 'ashPlain', 'glimmerwaste', 'tundra']);

/**
 * The water surface extended onto the banks (P21). A dry sample within `reach` samples of water takes the lowest
 * surface of the nearest wet samples — but only where its ground is ABOVE that surface (a bank the water runs
 * into) or no more than `maxDrop` below it, so water never floats over land that falls away. Wet samples keep their
 * own surface. Pure (exported for tests): wg = water surface per sample (NaN = dry), grid = ground heights.
 */
export function extendWaterSurface(wg, grid, res, { reach = 2, maxDrop = 0.12 } = {}) {
  const out = Float32Array.from(wg);
  const best = new Float32Array(wg.length).fill(Infinity);    // squared distance to the nearest wet sample seen so far
  // spread outward from the wet samples only (a zone is ~2% water: scanning every dry sample's neighbourhood cost 130 ms)
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const v = wg[j * res + i];
    if (Number.isNaN(v)) continue;
    for (let dj = -reach; dj <= reach; dj++) {
      const jj = j + dj; if (jj < 0 || jj >= res) continue;
      for (let di = -reach; di <= reach; di++) {
        const ii = i + di; if (ii < 0 || ii >= res) continue;
        const k = jj * res + ii;
        if (!Number.isNaN(wg[k])) continue;
        const d = di * di + dj * dj;
        // the LOWEST of the nearest surfaces: never lifts water over a bank
        if (d < best[k] || (d === best[k] && v < out[k])) { best[k] = d; out[k] = v; }
      }
    }
  }
  for (let k = 0; k < out.length; k++) if (best[k] !== Infinity && grid[k] < out[k] - maxDrop) out[k] = NaN;
  return out;
}

/**
 * Play-test 2 (Q18, B's set-piece surfaces, docs/world.md §10): how much bare earth each shows (the path layer) and
 * how hard the surface's own colour tints it — a ploughed field reads brown, a crop field gold, a pasture bright, a
 * graveyard dark and kept. Unknown biomes keep the faint 18% pull. Exported for tests.
 */
export const SET_GROUND = {
  field: { path: 0.85, tint: 0.45 }, crop: { path: 0.3, tint: 0.6 }, pasture: { path: 0, tint: 0.45 }, yard: { path: 0.8, tint: 0.3 },
  graveyard: { path: 0, tint: 0.5 }, orchard: { path: 0.05, tint: 0.4 }, gravel: { path: 0.7, tint: 0.55 },
};
/**
 * Ground palettes (stream T, docs/EXPANSION-1.md): a zone whose terrain meta says `palette: 'vharl'` (Vharlen, the
 * Burning Isle) is drawn with its own surfaces over the SAME biome ids — ash where Torbor Downs has grass, dark jungle
 * moss for the forest floor, black basalt for rock, black sand for sand, plus two layers Torbor never uses: sulphur crust
 * and steaming mud. Per biome: weights of each layer (the rest is the base: ash) and an RGB multiplier (pale pumice,
 * red scoria, purple-black obsidian). Zones without a palette are drawn exactly as before.
 */
export const GROUND_PALETTES = {
  vharl: {
    textures: { grass: ['ash', null], floor: ['moss', '#7e9a76'], rock: ['cliff', '#5c5a5e'], sand: ['sand', '#3c3936'], path: ['dirt', '#a39c94'], sulphur: ['sand', '#f2dc4a'], mud: ['mud', null] },
    low: { grass: '#57534f', floor: '#33452c', rock: '#3a383b', sand: '#2e2b29', path: '#6a5f52', sulphur: '#bfa832', mud: '#3e3229' },
    biomes: {
      beach: { sand: 0.92 }, coast: { sand: 0.8 }, lake: { sand: 0.75 },
      rainforest: { forest: 0.86, mul: [0.92, 1.05, 0.9] }, shrubland: { forest: 0.55, mul: [0.95, 1.08, 0.92] }, savanna: { forest: 0.3, mul: [1.1, 1.12, 0.92] },
      desert: { sulphur: 0.82, mud: 0.05 }, badlands: { rock: 0.6 }, marsh: { mud: 0.8, forest: 0.1 },
      volcanic: { rock: 0.28, mul: [1.35, 0.92, 0.82] }, blighted: { forest: 0.18, mul: [0.7, 0.68, 0.66] }, ashPlain: { mul: [1.75, 1.72, 1.66] },
      glimmerwaste: { sand: 0.45, rock: 0.3, mul: [0.92, 0.85, 1.12] }, mountains: { rock: 0.92 }, road: { path: 0.92 },
    },
    // water over these biomes: hot (lake / caldera), sulphurous, muddy; the sea keeps the default colour
    water: { lake: '#3f7f72', desert: '#8f9a3a', marsh: '#5f5a3e', volcanic: '#4a8a76' },
  },
};

export function createTerrainView(T, { textureSize = 512, quality = 'high', clearings = [], biomeColors = null, palette = null } = {}) {
  const PAL = GROUND_PALETTES[palette || T.reader?.meta?.palette || ''] || null;
  const group = new THREE.Group(); group.name = 'terrain';
  const grid = perf.span('terrain:grid', () => T.heightGrid());
  const { res, step, origin } = T;
  const cells = res - 1;
  const per = Math.ceil(cells / CHUNK);
  const strides = quality === 'low' ? [2, 8, 16] : [1, 4, 16];
  const dist = quality === 'low' ? [90, 320] : [180, 520];

  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const col = new THREE.Color(), bcol = new THREE.Color();
  function surface(x, z, out, o, out2 = null, o2 = 0) {
    if (PAL) return paletteSurface(x, z, out, o, out2, o2);
    const slope = T.slopeDeg(x, z), b = T.biomeKey(x, z);
    let forest = FOREST.has(b) ? 0.75 : b === 'hills' || b === 'shrubland' ? 0.25 : 0;
    let rock = Math.max(smooth(26, 38, slope), ROCK.has(b) ? 0.55 : 0);
    let sand = SAND.has(b) ? 0.8 : 0;
    const w = T.waterAt(x, z);
    if (w.depth > 0) sand = Math.max(sand, 0.7);
    const SP = SET_GROUND[b];
    let path = b === 'road' ? 0.92 : SP ? SP.path : 0;
    if (path || SP) { forest = 0; sand = 0; rock = Math.min(rock, 0.15); }
    for (const c of clearings) { const d = Math.hypot(x - c.x, z - c.z) / c.r; forest *= smooth(0.7, 1.2, d); path = Math.max(path, (1 - smooth(0.12, 0.6, d)) * 0.7); }
    forest *= 1 - rock; path *= 1 - rock;
    let s = forest + rock + sand + path;
    if (s > 1) { forest /= s; rock /= s; sand /= s; path /= s; }
    out[o] = forest; out[o + 1] = rock; out[o + 2] = sand; out[o + 3] = path;
    // A faint pull toward the biome's own colour, so neighbouring biomes read differently.
    const hex = biomeColors?.[b];
    col.setRGB(1, 1, 1);
    if (hex) { bcol.set(hex); const l = (bcol.r + bcol.g + bcol.b) / 3 || 1; const k = SP ? SP.tint : 0.18; col.setRGB(1 - k + k * bcol.r / l, 1 - k + k * bcol.g / l, 1 - k + k * bcol.b / l); }
    return col;
  }

  /** A palette zone's layers: aSplat = forest, rock, sand, path; aSplat2 = sulphur, mud (the rest is the base). */
  function paletteSurface(x, z, out, o, out2, o2) {
    const slope = T.slopeDeg(x, z), b = T.biomeKey(x, z), B = PAL.biomes[b] || {};
    let forest = B.forest || 0, sand = B.sand || 0, path = B.path || 0, sul = B.sulphur || 0, mud = B.mud || 0;
    let rock = Math.max(smooth(28, 40, slope), B.rock || 0);
    const w = T.waterAt(x, z);
    if (w.depth > 0) sand = Math.max(sand, 0.7);
    for (const c of clearings) { const d = Math.hypot(x - c.x, z - c.z) / c.r; forest *= smooth(0.7, 1.2, d); path = Math.max(path, (1 - smooth(0.12, 0.6, d)) * 0.7); }
    const free = 1 - rock; forest *= free; path *= free; sul *= free; mud *= free; sand *= free;
    const sum = forest + rock + sand + path + sul + mud;
    if (sum > 1) { forest /= sum; rock /= sum; sand /= sum; path /= sum; sul /= sum; mud /= sum; }
    out[o] = forest; out[o + 1] = rock; out[o + 2] = sand; out[o + 3] = path;
    if (out2) { out2[o2] = sul; out2[o2 + 1] = mud; }
    const m = B.mul; col.setRGB(m ? m[0] : 1, m ? m[1] : 1, m ? m[2] : 1);
    return col;
  }

  // --- material --------------------------------------------------------------------------------
  const surf = (k, tint = null) => {
    const ck = k + '@' + textureSize + (tint ? '#' + tint : '');
    if (!TEX_CACHE.has(ck)) { const s = makeSurface(k, { size: textureSize, seed: 7, ...(tint ? { tint } : {}) }); s.map.anisotropy = 8; s.map.wrapS = s.map.wrapT = THREE.RepeatWrapping; TEX_CACHE.set(ck, s.map); }
    return TEX_CACHE.get(ck);
  };
  const endTex = perf.begin('terrain:tex');
  const tex = quality === 'low' ? null : PAL ? Object.fromEntries(Object.entries(PAL.textures).map(([k, [name, tint]]) => [k, surf(name, tint)]))
    : { grass: surf('grass'), floor: surf('forest_floor'), rock: surf('rock'), sand: surf('sand'), path: surf('dirt') };
  // Low quality (software renderers, weak GPUs): one Lambert pass with the surfaces pre-mixed into the
  // vertex colour. The splat shader fills every ground pixel with five texture reads, which is what
  // costs a software renderer 90% of its frame.
  endTex();
  const cheap = quality === 'low';
  const LOW = PAL ? Object.fromEntries(Object.entries(PAL.low).map(([k, c]) => [k, new THREE.Color(c)]))
    : { grass: new THREE.Color('#5f7d3c'), floor: new THREE.Color('#4d4630'), rock: new THREE.Color('#7b766d'), sand: new THREE.Color('#b8a676'), path: new THREE.Color('#7a6446') };
  const material = cheap ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (!cheap) material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { tGrass: { value: tex.grass }, tFloor: { value: tex.floor }, tRock: { value: tex.rock }, tSand: { value: tex.sand }, tPath: { value: tex.path } });
    if (PAL) Object.assign(shader.uniforms, { tSul: { value: tex.sulphur }, tMud: { value: tex.mud } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;' + (PAL ? '\nattribute vec2 aSplat2; varying vec2 vSplat2;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vW = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normal;' + (PAL ? ' vSplat2 = aSplat2;' : ''));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tFloor, tRock, tSand, tPath; varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;${PAL ? '\n        uniform sampler2D tSul, tMud; varying vec2 vSplat2;' : ''}
        float tvHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float tvNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(tvHash(i),tvHash(i+vec2(1,0)),f.x), mix(tvHash(i+vec2(0,1)),tvHash(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        {
          vec2 p = vW.xz;
          float wF = vSplat.x, wR = vSplat.y, wS = vSplat.z, wP = vSplat.w;
          ${PAL ? 'float wSu = vSplat2.x, wM = vSplat2.y;' : 'float wSu = 0.0, wM = 0.0;'}
          float wG = clamp(1.0 - wF - wR - wS - wP - wSu - wM, 0.0, 1.0);
          vec3 c = texture2D(tGrass, p * 0.14).rgb * wG + texture2D(tFloor, p * 0.12).rgb * wF + texture2D(tSand, p * 0.16).rgb * wS + texture2D(tPath, p * 0.15).rgb * wP;
          ${PAL ? 'c += texture2D(tSul, p * 0.13).rgb * wSu + texture2D(tMud, p * 0.11).rgb * wM;' : ''}
          if (wR > 0.002) {
            vec3 n = normalize(vWN); vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
            c += (texture2D(tRock, vW.zy * 0.06).rgb * b.x + texture2D(tRock, vW.xz * 0.06).rgb * b.y + texture2D(tRock, vW.xy * 0.06).rgb * b.z) * wR;
          }
          float macro = tvNoise(p * 0.012) * 0.5 + tvNoise(p * 0.041) * 0.5;
          c *= mix(0.84, 1.14, macro);
          float camD = length(vW - cameraPosition);
          float near = 1.0 - smoothstep(18.0, 60.0, camD);
          vec3 det = texture2D(tGrass, p * 0.9).rgb;
          c = mix(c, c * (det * ${PAL ? '2.2' : '1.5'} + 0.28), near * 0.25);
          diffuseColor.rgb *= c;
        }`);
  };

  // --- chunks ------------------------------------------------------------------------------------
  function buildChunk(ci, cj, stride) {
    const i0 = ci * CHUNK, j0 = cj * CHUNK, i1 = Math.min(cells, i0 + CHUNK), j1 = Math.min(cells, j0 + CHUNK);
    const nx = Math.floor((i1 - i0) / stride) + 1, nz = Math.floor((j1 - j0) / stride) + 1;
    const count = nx * nz, rim = 2 * (nx + nz) - 4, total = count + rim;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), cols = new Float32Array(total * 3), spl = new Float32Array(total * 4);
    const spl2 = PAL ? new Float32Array(total * 2) : null;
    const H = (i, j) => grid[Math.min(cells, Math.max(0, j)) * res + Math.min(cells, Math.max(0, i))];
    let v = 0;
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++, v++) {
      const i = i0 + a * stride, j = j0 + b * stride;
      const x = origin.x + i * step, z = origin.z + j * step, y = H(i, j);
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const ddx = (H(i + 1, j) - H(i - 1, j)) / (2 * step), ddz = (H(i, j + 1) - H(i, j - 1)) / (2 * step), l = Math.hypot(ddx, 1, ddz);
      nor[v * 3] = -ddx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -ddz / l;
      const c = surface(x, z, spl, v * 4, spl2, v * 2);
      if (cheap) {
        const wf = spl[v * 4], wr = spl[v * 4 + 1], ws = spl[v * 4 + 2], wp = spl[v * 4 + 3];
        const wsu = spl2 ? spl2[v * 2] : 0, wm = spl2 ? spl2[v * 2 + 1] : 0, wg = Math.max(0, 1 - wf - wr - ws - wp - wsu - wm);
        const n = 0.92 + 0.16 * (((i * 73856093) ^ (j * 19349663)) >>> 0) / 4294967296;   // a little grain per vertex
        const L = LOW, ch = q => (L.grass[q] * wg + L.floor[q] * wf + L.rock[q] * wr + L.sand[q] * ws + L.path[q] * wp + (wsu ? L.sulphur[q] * wsu : 0) + (wm ? L.mud[q] * wm : 0));
        cols[v * 3] = ch('r') * c.r * n;
        cols[v * 3 + 1] = ch('g') * c.g * n;
        cols[v * 3 + 2] = ch('b') * c.b * n;
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
      if (spl2) { spl2[v * 2] = spl2[src * 2]; spl2[v * 2 + 1] = spl2[src * 2 + 1]; }
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
    if (spl2) g.setAttribute('aSplat2', new THREE.BufferAttribute(spl2, 2));
    g.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  const chunks = [];
  const endChunks = perf.begin('terrain:chunks');
  for (let cj = 0; cj < per; cj++) for (let ci = 0; ci < per; ci++) {
    const cx = origin.x + (ci + 0.5) * CHUNK * step, cz = origin.z + (cj + 0.5) * CHUNK * step;
    const mesh = new THREE.Mesh(buildChunk(ci, cj, strides[2]), material);
    mesh.receiveShadow = true; mesh.name = `chunk-${ci}-${cj}`;
    group.add(mesh);
    chunks.push({ ci, cj, cx, cz, mesh, level: 2, geos: [null, null, mesh.geometry] });
  }

  endChunks();
  const endWater = perf.begin('terrain:water');
  // --- water --------------------------------------------------------------------------------------
  let water = null, normals = null;
  const wg = T.waterGrid();
  if (wg) {
    const ws = quality === 'low' ? 2 : 1;
    // P21: the sheet runs past the wet samples up to where the bank rises out of it (extendWaterSurface), so the
    // shoreline is where the flat water meets the sloping ground — a smooth curve drawn by the depth test — instead
    // of the staircase of 2 m cells the wet layer has (and no dry sliver between the water's edge and the bank)
    const surf = extendWaterSurface(wg, grid, res, { reach: ws === 1 ? 2 : 3 });
    const map = new Int32Array(res * res).fill(-1);
    const wpos = [], widx = [];
    const vert = (i, j) => { const k = j * res + i; if (map[k] < 0) { map[k] = wpos.length / 3; wpos.push(origin.x + i * step, surf[k], origin.z + j * step); } return map[k]; };
    const ok = k => !Number.isNaN(surf[k]), wet = k => !Number.isNaN(wg[k]);
    for (let j = 0; j + ws <= cells; j += ws) for (let i = 0; i + ws <= cells; i += ws) {
      const a = j * res + i, b = a + ws, c = a + ws * res, d = c + ws;
      if (ok(a) && ok(b) && ok(c) && (wet(a) || wet(b) || wet(c))) widx.push(vert(i, j), vert(i, j + ws), vert(i + ws, j));
      if (ok(b) && ok(c) && ok(d) && (wet(b) || wet(c) || wet(d))) widx.push(vert(i + ws, j), vert(i, j + ws), vert(i + ws, j + ws));
    }
    if (widx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      g.setIndex(widx); g.computeVertexNormals();
      const uv = new Float32Array(wpos.length / 3 * 2);
      for (let k = 0; k < uv.length / 2; k++) { uv[k * 2] = wpos[k * 3] / 24; uv[k * 2 + 1] = wpos[k * 3 + 2] / 24; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      // a palette zone tints its inland water by what it lies on: hot springs and the crater lake, sulphur pools, fen mud
      let tinted = false;
      if (PAL?.water) {
        const wc = new Float32Array(wpos.length), base = new THREE.Color('#2c5b6e'), tc = new THREE.Color();
        for (let k = 0; k < wpos.length / 3; k++) {
          const x = wpos[k * 3], z = wpos[k * 3 + 2], w = T.waterAt(x, z);
          let c = base;
          if (w.kind === 'lake') { const hex = PAL.water[T.biomeKey(x, z)] || PAL.water.lake; if (hex) c = tc.set(hex); }
          wc[k * 3] = c.r / base.r; wc[k * 3 + 1] = c.g / base.g; wc[k * 3 + 2] = c.b / base.b;
          if (c !== base) tinted = true;
        }
        if (tinted) g.setAttribute('color', new THREE.BufferAttribute(wc, 3));
      }
      // P1: ONE water normal map for the page. Built per zone it cost 20 s on the test VM (procedural noise
      // read back through a canvas) — the multi-second freeze when a neighbouring zone streamed in.
      normals = waterNormals();
      water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#2c5b6e', roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.84, normalMap: normals, normalScale: new THREE.Vector2(0.4, 0.4), depthWrite: false, vertexColors: tinted }));
      water.position.y = 0.02; water.renderOrder = 1; water.name = 'water';
      group.add(water);
    }
  }

  endWater();
  // --- per frame: re-level the chunks near the camera (two rebuilds a frame at most) --------------
  let lodAt = 0, t = 0;
  function update(dt, cam) {
    t += dt;
    if (normals) { const w = performance.now() / 1000; normals.offset.set(w * 0.012, w * 0.007); }
    if (!cam || t < lodAt) return;
    lodAt = t + 0.25;
    let built = 0;
    const order = chunks.map(c => ({ c, d: Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z) - CHUNK * step * 0.7) })).sort((a, b) => a.d - b.d);
    for (const { c, d } of order) {
      const want = d < dist[0] ? 0 : d < dist[1] ? 1 : 2;
      if (want === c.level) continue;
      if (!c.geos[want]) { if (built >= 2) continue; c.geos[want] = perf.span('terrain:chunk', () => buildChunk(c.ci, c.cj, strides[want])); built++; }
      c.mesh.geometry = c.geos[want]; c.level = want;
    }
  }

  function dispose() {
    for (const c of chunks) for (const g of c.geos) g?.dispose();
    material.dispose();
    if (water) { water.geometry.dispose(); water.material.dispose(); }
  }
  return { group, material, water, update, dispose, ready: () => chunks.every(c => c.level !== 2 || true) };
}
