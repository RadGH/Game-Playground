// The ground, water and fields (split out of world.js 2026-11-24, "the world looks MVP"):
//   * the ground mesh is js/world/terrain.js's own height grid cut with its meshIndex rule (drawn = walked, rule 22),
//     painted per pixel from nine textures (data/ground.json `layers`, baked by tools/bake-ground.mjs from highdef-3d's
//     painted surfaces) mixed by two splat maps (ground-plan.js paintGround: biomes, fields, worn roads, trodden towns,
//     packed yards, cobbled streets and squares) plus rock wherever the slope is steep
//   * roads are worn INTO the ground (no strips laid on top: no floating, no z-fighting, soft wandering edges)
//   * water from the terrain's water grid (rivers, marsh pools)
//   * crops strip by strip in map.json's fields with a split-rail fence (ground-plan.js planFields; proctown's
//     cropField + fenceLine, swaying sheaves from propkit-three.js)
// Quality (fixed when the world is built, lessons rule 29): Low = 256 px layers, one sample per layer, fewer blades in
// a sheaf, no crop shadows; Medium = 512 px, a second, larger sample per layer so the repeat does not show; High = the
// same + crops cast shadows.
//
//   const G = createGround(view, { T, placements, art, cfg, quality, tileGroup })
//   G.splat  (ground-plan.js result)   G.heightTex   G.U (shared uniforms: uOwTime …)   G.update(dt)   G.ready
import * as THREE from 'three';
import { paintGround, planFields } from './ground-plan.js';
import { sheafGeometry, unitGeometry, partMatrix } from '../../../../../proctown/js/propkit-three.js';

const IMG = new URL('../../../img/ground/', import.meta.url);
/** data/ground.json (fetch + top-level await: no JSON import attributes in browser code, lessons rule 38). */
export const GROUND_CFG = await (await fetch(new URL('../../../data/ground.json', import.meta.url))).json();
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

/** One DataArrayTexture from the baked layer pictures (a 1-texel stand-in of each layer's `low` colour until they load). */
function layerTexture(cfg, px, aniso) {
  const n = cfg.layers.length;
  const stand = new Uint8Array(n * 4);
  cfg.layers.forEach((l, i) => { const v = parseInt(l.low.slice(1), 16); stand.set([v >> 16, (v >> 8) & 255, v & 255, 255], i * 4); });
  const make = (data, size) => {
    const t = new THREE.DataArrayTexture(data, size, size, n);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = size > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = size > 1; t.anisotropy = aniso; t.needsUpdate = true;
    return t;
  };
  const tex = { value: make(stand, 1) };
  const ready = (async () => {
    const data = new Uint8Array(n * px * px * 4);
    const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const avg = [];
    for (let i = 0; i < n; i++) {
      const blob = await (await fetch(new URL(cfg.layers[i].id + '.webp', IMG))).blob();
      const bmp = await createImageBitmap(blob);
      cx.clearRect(0, 0, px, px); cx.drawImage(bmp, 0, 0, px, px); bmp.close?.();
      const d = cx.getImageData(0, 0, px, px).data;
      data.set(d, i * px * px * 4);
      let r = 0, g = 0, b = 0; for (let j = 0; j < d.length; j += 64) { r += d[j]; g += d[j + 1]; b += d[j + 2]; }
      const k = 1 / (d.length / 64 * 255); avg.push(new THREE.Color().setRGB(r * k, g * k, b * k, THREE.SRGBColorSpace));
    }
    tex.value = make(data, px);
    return avg;
  })();
  return { tex, ready };
}

export function createGround(view, { T, placements, art, cfg, quality = 'medium', tileGroup, scattered = null }) {
  const low = quality === 'low', high = quality === 'high';
  const G = T.grid, stepCells = 128 / G.cell;
  const maxAniso = view.renderer.capabilities.getMaxAnisotropy?.() || 1;

  // ---------------------------------------------------------------- the splat maps (1 m a texel; 2 m on Low)
  const S = paintGround(T, { placements, art, cfg, res: low ? 2 : 1, trees: scattered?.trees || [] });
  const splatTex = data => {
    const t = new THREE.DataTexture(data, S.nx, S.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
    t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
  };
  const L = layerTexture(cfg, low ? 256 : 512, Math.min(maxAniso, low ? 2 : high ? 8 : 4));
  // heights as a texture too (the grass stands on the same triangles: GRID SPLIT)
  const heightTex = new THREE.DataTexture(G.heights, G.nx, G.nz, THREE.RedFormat, THREE.FloatType);
  heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter; heightTex.needsUpdate = true;

  const U = {
    tOwLayers: L.tex, tOwA: { value: splatTex(S.A) }, tOwB: { value: splatTex(S.B) },
    uOwSplat: { value: new THREE.Vector4(S.minX, S.minZ, 1 / (S.nx * S.res), 1 / (S.nz * S.res)) },
    uOwInv: { value: cfg.layers.map(l => 1 / l.metres) },
    uOwTone: { value: cfg.layers.map(l => new THREE.Color(l.tone || '#ffffff').multiplyScalar(l.bright || 1)) },
    uOwTime: { value: 0 },
    tOwHeight: { value: heightTex },
    uOwGrid: { value: new THREE.Vector4(G.minX, G.minZ, G.cell, 0) },
    uOwGrassCol: { value: [new THREE.Color('#5d8a3a'), new THREE.Color('#617a3c'), new THREE.Color('#4d6a34')] },
  };
  const NOISE = /* glsl */`
    float owHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float owNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(owHash(i), owHash(i + vec2(1, 0)), f.x), mix(owHash(i + vec2(0, 1)), owHash(i + vec2(1, 1)), f.x), f.y); }`;

  // ---------------------------------------------------------------- the ground material
  const NL = cfg.layers.length;
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  groundMat.customProgramCacheKey = () => 'ow-ground|' + quality;
  groundMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tOwLayers: U.tOwLayers, tOwA: U.tOwA, tOwB: U.tOwB, uOwSplat: U.uOwSplat, uOwInv: U.uOwInv, uOwTone: U.uOwTone });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOwW; varying vec3 vOwN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOwW = (modelMatrix * vec4(transformed, 1.0)).xyz; vOwN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray tOwLayers; uniform sampler2D tOwA, tOwB; uniform vec4 uOwSplat;
        uniform float uOwInv[${NL}]; uniform vec3 uOwTone[${NL}];
        varying vec3 vOwW; varying vec3 vOwN;
        ${NOISE}`)
      .replace('#include <map_fragment>', `
        {
          vec2 p = vOwW.xz;
          vec2 wob = vec2(owNoise(p * 0.23), owNoise(p * 0.23 + vec2(17.1, 5.3))) - 0.5;
          vec2 suv = (p - uOwSplat.xy + wob * 1.2) * uOwSplat.zw;
          vec4 sa = texture2D(tOwA, suv), sb = texture2D(tOwB, suv);
          float w[${NL}];
          w[0] = sa.r; w[1] = sa.g; w[2] = sa.b; w[3] = sa.a; w[4] = sb.r; w[5] = sb.g; w[6] = sb.b; w[7] = sb.a;
          float rock = 1.0 - smoothstep(0.77, 0.9, normalize(vOwN).y + (owNoise(p * 0.15) - 0.5) * 0.08);
          for (int i = 0; i < 8; i++) w[i] *= 1.0 - rock;
          w[8] = rock;
          float macro = owNoise(p * 0.031) * 0.6 + owNoise(p * 0.11) * 0.4;
          vec2 gx = dFdx(p), gy = dFdy(p);
          vec3 acc = vec3(0.0); float tot = 0.0;
          for (int i = 0; i < ${NL}; i++) {
            if (w[i] < 0.012) continue;
            float s = uOwInv[i];
            vec4 t = textureGrad(tOwLayers, vec3(p * s, float(i)), gx * s, gy * s);
            #ifdef OW_TWO_SCALE
              vec2 q = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) * s * 0.29 + 0.31;
              vec4 t2 = textureGrad(tOwLayers, vec3(q, float(i)), gx * s * 0.29, gy * s * 0.29);
              t = mix(t, t2, 0.3 + 0.35 * macro);
            #endif
            float h = dot(t.rgb, vec3(0.3, 0.5, 0.2));
            float ww = w[i] * w[i] * (0.35 + h * 1.8);
            acc += t.rgb * uOwTone[i] * ww; tot += ww;
          }
          vec3 col = acc / max(tot, 1e-4);
          col *= 0.88 + 0.24 * macro;
          // big slow patches of colour on the grass (environment round): straw-yellow in some, deeper green in others
          float hueN = owNoise(p * 0.0085 + 3.1) * 0.65 + owNoise(p * 0.027 + 9.7) * 0.35;
          float grassy = (w[0] + w[1]) / max(1e-4, w[0] + w[1] + w[2] + w[3] + w[4] + w[5] + w[6] + w[7] + w[8]);
          col *= mix(vec3(1.0), mix(vec3(0.9, 1.03, 0.94), vec3(1.09, 1.03, 0.8), smoothstep(0.3, 0.72, hueN)), grassy);
          diffuseColor.rgb *= col;
        }`);
    if (!low) sh.defines = { ...(sh.defines || {}), OW_TWO_SCALE: '' };
  };

  // the mesh, 128 m tiles; vertex colour = a soft shade (hollows a touch darker, a broad wobble), the textures carry colour
  const idxH = (i, k) => G.heights[Math.min(G.nz - 1, Math.max(0, k)) * G.nx + Math.min(G.nx - 1, Math.max(0, i))];
  for (let k0 = 0; k0 < G.nz - 1; k0 += stepCells) for (let i0 = 0; i0 < G.nx - 1; i0 += stepCells) {
    const i1 = Math.min(G.nx - 1, i0 + stepCells), k1 = Math.min(G.nz - 1, k0 + stepCells);
    const w = i1 - i0 + 1, h = k1 - k0 + 1;
    const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const o = ((k - k0) * w + (i - i0)) * 3;
      const x = G.minX + i * G.cell, z = G.minZ + k * G.cell, y = G.heights[k * G.nx + i];
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      const around = (idxH(i - 2, k) + idxH(i + 2, k) + idxH(i, k - 2) + idxH(i, k + 2)) / 4;
      const s = Math.min(1.06, Math.max(0.84, 1 + (y - around) * 0.06 + (hash(Math.floor(x / 9), Math.floor(z / 9)) - 0.5) * 0.05));
      col[o] = col[o + 1] = col[o + 2] = s;
    }
    const idx = new Uint32Array((w - 1) * (h - 1) * 6);       // GRID SPLIT: (i,k)(i,k+1)(i+1,k) and (i+1,k)(i,k+1)(i+1,k+1)
    let o = 0;
    for (let k = 0; k < h - 1; k++) for (let i = 0; i < w - 1; i++) {
      const a = k * w + i, b = a + 1, c = a + w, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true; mesh.name = 'ground';
    tileGroup(G.minX + (i0 + stepCells / 2) * G.cell, G.minZ + (k0 + stepCells / 2) * G.cell).add(mesh);
  }

  // ---------------------------------------------------------------- water (the terrain's own water surface grid)
  const waterTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    for (let n = 0; n < 220; n++) { x.fillStyle = `rgba(170,210,235,${0.08 + hash(n, 3) * 0.2})`; const px = hash(n, 1) * 128, py = hash(n, 2) * 128; x.fillRect(px, py, 6 + hash(n, 4) * 18, 1.5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // ripples (environment round): a tiling normal map from soft noise, scrolled two ways, so the surface catches the sky's
  // light (scene.environment) and the sun in small moving glints — brighter at a low angle, darker looking straight down
  const rippleTex = (() => {
    const N = 128, h = new Float32Array(N * N);
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
      let v = 0; for (const [f, a] of [[2, 1], [5, 0.5], [11, 0.25]]) v += a * Math.sin((i / N) * 6.2832 * f + Math.sin((k / N) * 6.2832 * (f - 1)) * 1.3) * Math.cos((k / N) * 6.2832 * f + i * 0.0);
      h[k * N + i] = v;
    }
    const d = new Uint8Array(N * N * 4);
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
      const dx = h[k * N + (i + 1) % N] - h[k * N + (i + N - 1) % N], dz = h[((k + 1) % N) * N + i] - h[((k + N - 1) % N) * N + i];
      const nx = -dx * 0.9, nz = -dz * 0.9, l = Math.hypot(nx, nz, 1);
      const o = (k * N + i) * 4; d[o] = (nx / l * 0.5 + 0.5) * 255; d[o + 1] = (nz / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
  })();
  const waterMat = low
    ? new THREE.MeshLambertMaterial({ color: '#4a8fb0', map: waterTex, transparent: true, opacity: 0.8, depthWrite: false, emissive: '#143a4a' })
    : new THREE.MeshStandardMaterial({ color: '#3f7f9e', map: waterTex, normalMap: rippleTex, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.12, metalness: 0.0, envMapIntensity: 1.6, transparent: true, opacity: 0.86, depthWrite: false, emissive: '#0f2e3a' });
  const marshMat = low
    ? new THREE.MeshLambertMaterial({ color: '#5a7a58', map: waterTex, transparent: true, opacity: 0.78, depthWrite: false, emissive: '#18281a' })
    : new THREE.MeshStandardMaterial({ color: '#4f6e4c', map: waterTex, normalMap: rippleTex, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.32, envMapIntensity: 1.0, transparent: true, opacity: 0.82, depthWrite: false, emissive: '#152416' });
  for (let k0 = 0; k0 < G.nz - 1; k0 += stepCells) for (let i0 = 0; i0 < G.nx - 1; i0 += stepCells) {
    const verts = [], uvs = [], vertsM = [], uvsM = [];
    const i1 = Math.min(G.nx - 1, i0 + stepCells), k1 = Math.min(G.nz - 1, k0 + stepCells);
    for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) {
      const ids = [k * G.nx + i, k * G.nx + i + 1, (k + 1) * G.nx + i, (k + 1) * G.nx + i + 1];
      const ws = ids.map(j => G.water[j]);
      const have = ws.filter(v => !Number.isNaN(v));
      if (!have.length) continue;
      const fill = Math.max(...have);
      const y = ws.map(v => (Number.isNaN(v) ? fill : v));
      const x0 = G.minX + i * G.cell, z0 = G.minZ + k * G.cell, x1 = x0 + G.cell, z1 = z0 + G.cell;
      const marsh = T.biomeAt(x0 + 1, z0 + 1) === 'marsh';
      const V = marsh ? vertsM : verts, Uv = marsh ? uvsM : uvs;
      V.push(x0, y[0], z0, x0, y[2], z1, x1, y[1], z0, x1, y[1], z0, x0, y[2], z1, x1, y[3], z1);
      Uv.push(x0 / 16, z0 / 16, x0 / 16, z1 / 16, x1 / 16, z0 / 16, x1 / 16, z0 / 16, x0 / 16, z1 / 16, x1 / 16, z1 / 16);
    }
    for (const [V, Uv, mat] of [[verts, uvs, waterMat], [vertsM, uvsM, marshMat]]) {
      if (!V.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(V, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; m.name = 'water';
      tileGroup(G.minX + (i0 + stepCells / 2) * G.cell, G.minZ + (k0 + stepCells / 2) * G.cell).add(m);
    }
  }

  // ---------------------------------------------------------------- boardwalks: planks laid across the path through the marsh
  // (the only road drawn on top of the ground: 3 cm over the walked surface, which is the same draped grid)
  const plankTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#3a2a1c'; x.fillRect(0, 0, 64, 128);
    for (let b = 0; b < 8; b++) {
      const y = b * 16, tone = 0.85 + hash(b, 5) * 0.3;
      x.fillStyle = `rgb(${Math.round(132 * tone)},${Math.round(98 * tone)},${Math.round(64 * tone)})`; x.fillRect(1 + hash(b, 2) * 3, y + 1.5, 60, 13);
      x.fillStyle = 'rgba(60,40,24,0.35)'; for (let g = 0; g < 4; g++) x.fillRect(4, y + 4 + g * 3 + hash(b, g) * 2, 52 + hash(g, b) * 6, 0.8);
      x.fillStyle = '#2a2018'; x.fillRect(6, y + 7, 2, 2); x.fillRect(56, y + 7, 2, 2);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const plankMat = new THREE.MeshLambertMaterial({ map: plankTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const r of T.roads) {
    if (r.class !== 'boardwalk' || r.pts.length < 2) continue;
    const half = r.width / 2, V = [], Uv = [];
    let s0 = 0;
    for (let n = 0; n < r.pts.length - 1; n++) {
      const a = r.pts[n], b = r.pts[n + 1], dx = b.x - a.x, dz = b.z - a.z, Ln = Math.hypot(dx, dz) || 1;
      const nx = -dz / Ln * half, nz = dx / Ln * half;
      const P = [[a.x + nx, a.z + nz], [a.x - nx, a.z - nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz]].map(([x, z]) => [x, T.heightAt(x, z) + 0.03, z]);
      const v0 = s0 / 2, v1 = (s0 + Ln) / 2;
      for (const [q, u, v] of [[P[0], 0, v0], [P[2], 0, v1], [P[1], 1, v0], [P[1], 1, v0], [P[2], 0, v1], [P[3], 1, v1]]) { V.push(...q); Uv.push(u, v); }
      s0 += Ln;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, plankMat); m.receiveShadow = true; m.name = 'road boardwalk ' + r.id;
    const mid = r.pts[Math.floor(r.pts.length / 2)];
    tileGroup(mid.x, mid.z).add(m);
  }

  // ---------------------------------------------------------------- fields: crops strip by strip, a fence round each
  const F = planFields(T, { placements, art, cfg });
  const sheafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cropMat = new THREE.MeshLambertMaterial();
  for (const m of [sheafMat, cropMat]) {
    m.customProgramCacheKey = () => 'ow-crop|' + (m === sheafMat ? 's' : 'p');
    m.onBeforeCompile = sh => {
      sh.uniforms.uOwTime = U.uOwTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uOwTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float shPh = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
            float shK = ${m === sheafMat ? 'position.y * position.y' : '0.0'};
            transformed.x += (sin(uOwTime * 1.6 + shPh) * 0.6 + sin(uOwTime * 2.9 + shPh * 1.7) * 0.3) * 0.11 * shK;
            transformed.z += cos(uOwTime * 1.3 + shPh * 0.8) * 0.06 * shK;
          #endif`);
    };
  }
  const sheaf = sheafGeometry(THREE, low ? 6 : high ? 16 : 9);
  // Low draws the round crop parts with fewer sides (a cabbage is 36 triangles, not 120)
  const LOW_UNIT = new Map();
  const unit = kind => {
    if (!low || !['dome', 'cyl', 'cone'].includes(kind)) return unitGeometry(THREE, kind);
    if (!LOW_UNIT.has(kind)) {
      let g;
      if (kind === 'dome') { g = new THREE.SphereGeometry(0.5, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 2, 1); }
      else if (kind === 'cyl') { g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true); g.translate(0, 0.5, 0); }
      else { g = new THREE.ConeGeometry(0.5, 1, 6, 1, true); g.translate(0, 0.5, 0); }
      LOW_UNIT.set(kind, g);
    }
    return LOW_UNIT.get(kind);
  };
  const byField = new Map(), fieldMeshes = [];
  // crops further than this are not drawn (the field shows as ploughed soil); Low draws only the near ones
  const cropFar = low ? 95 : high ? 1e9 : 170;
  const fieldOf = p => { let best = null, bd = Infinity; for (const f of T.map.fields || []) { const d = Math.hypot(p.x - f.at[0], p.z - f.at[1]); if (d < bd) { bd = d; best = f; } } return best; };
  // Low plants every other grain clump (a field still reads as a standing mass, at half the triangles)
  for (const p of [...F.parts.filter((q, i) => !low || q.mesh !== 'sheaf' || i % 2 === 0), ...F.fences]) { const f = fieldOf(p); if (!byField.has(f)) byField.set(f, []); byField.get(f).push(p); }
  const col = new THREE.Color(), m4 = new THREE.Matrix4();
  for (const [f, list] of byField) {
    const by = new Map();
    for (const p of list) { if (!by.has(p.mesh)) by.set(p.mesh, []); by.get(p.mesh).push(p); }
    for (const [kind, ps] of by) {
      const im = new THREE.InstancedMesh(kind === 'sheaf' ? sheaf : unit(kind), kind === 'sheaf' ? sheafMat : cropMat, ps.length);
      ps.forEach((p, i) => { im.setMatrixAt(i, partMatrix(THREE, p, m4)); im.setColorAt(i, col.set(p.colour)); });
      im.name = 'field ' + f.id + ' ' + kind;
      im.castShadow = high || (kind !== 'sheaf' && !low); im.receiveShadow = !low;
      im.computeBoundingSphere();
      tileGroup(f.at[0], f.at[1]).add(im);
      fieldMeshes.push({ im, x: f.at[0], z: f.at[1], r: Math.hypot(...f.size) / 2 });
    }
  }

  let wt = 0;
  return {
    splat: S, fields: F, heightTex, U, NOISE, groundMat,
    ready: L.ready.then(avg => {
      // the grass tufts take the colour of the ground they grow from (grass, wild grass, forest floor)
      if (avg) [0, 1, 2].forEach(i => U.uOwGrassCol.value[i].copy(avg[i]));
      return true;
    }).catch(() => false),
    update(dt, at) {
      wt += dt;
      if (at) for (const f of fieldMeshes) f.im.visible = Math.hypot(f.x - at.x, f.z - at.z) - f.r < cropFar;
      U.uOwTime.value = wt;
      waterTex.offset.set(wt * 0.012, wt * 0.02);
      if (waterMat.normalMap) waterMat.normalMap.offset.set(wt * 0.018, -wt * 0.011);
    },
  };
}
