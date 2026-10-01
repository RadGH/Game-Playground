// Chibi 3 materials: ONE physically based material for the whole character, plus one for the eyes.
//
// Chibi 2 split a character into a cloth mesh and a metal mesh, each a flat colour. Chibi 3 keeps it
// to one draw call by carrying the surface type on every vertex:
//
//   color   base colour (linear)
//   surf    [detail tile / 255, roughness, metalness, ambient occlusion]
//   extra   [emissive / 2, sheen, detail strength, edge wear]
// (all 0..1, so a baked character can store them as bytes)
//
// and putting the fine detail — skin pores, the weave of a tunic, the grain of leather, brushed and
// scratched steel, hair strands, chainmail rings, wood grain, fur — in a TEXTURE ARRAY of eight
// generated normal maps. The meshes have no UVs (they come out of a distance field), so the detail is
// projected from three sides in the BIND pose ("triplanar"), which glues it to the body as it moves.
//
// Every texture is drawn by code at load: nothing is downloaded.

import * as THREE from 'three';

export const TILES = { skin: 0, cloth: 1, leather: 2, metal: 3, hair: 4, chain: 5, wood: 6, fur: 7 };
/** Metres per repeat of each tile's pattern (how fine the detail is on the body). */
const TILE_SCALE = [0.016, 0.022, 0.07, 0.22, 0.05, 0.045, 0.16, 0.07];
const TILE_SIZE = 256;

// --------------------------------------------------------------------- tileable noise

function hash2(x, y, seed) { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
/** Value noise that repeats every `period` cells. */
function vnoise(u, v, period, seed = 0) {
  const x = u * period, y = v * period, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (a) => ((a % period) + period) % period;
  const s = t => t * t * (3 - 2 * t), sx = s(fx), sy = s(fy);
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed), c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(u, v, period, octaves, seed) { let a = 0, amp = 0.5, n = 0; for (let o = 0; o < octaves; o++) { a += vnoise(u, v, period << o, seed + o) * amp; n += amp; amp *= 0.5; } return a / n; }
/** Tileable cellular noise: distance to the nearest of `cells`^2 jittered points. */
function cellular(u, v, cells, seed) {
  const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
    const px = cx + hash2(wx, wy, seed), py = cy + hash2(wx, wy, seed + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [d1, d2];
}

/** Height (0..1) of each tile at (u, v) in 0..1. */
const HEIGHT = [
  // skin: pores and a faint cross-hatch of fine lines
  (u, v) => { const [d] = cellular(u, v, 22, 1); const pores = Math.min(1, d * 1.6); const lines = 0.5 + 0.5 * Math.sin((u + v * 0.3 + fbm(u, v, 4, 2, 3) * 0.2) * Math.PI * 2 * 18); return pores * 0.8 + lines * 0.08 + fbm(u, v, 8, 3, 2) * 0.12; },
  // cloth: plain weave — warp and weft threads passing over and under
  (u, v) => {
    const n = 16, x = u * n, y = v * n, cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy;
    const over = (cx + cy) % 2 === 0;
    const warp = Math.sin(fx * Math.PI) ** 0.6 * (over ? 1 : 0.55), weft = Math.sin(fy * Math.PI) ** 0.6 * (over ? 0.55 : 1);
    return Math.max(warp, weft) * 0.85 + fbm(u, v, 32, 2, 5) * 0.15;
  },
  // leather: pebbled grain with creases
  (u, v) => { const [d1, d2] = cellular(u, v, 14, 11); const crease = Math.min(1, (d2 - d1) * 5); return crease * 0.6 + fbm(u, v, 6, 4, 12) * 0.4; },
  // metal: brushed streaks, a few scratches, soft dents
  (u, v) => {
    let h = 0.5 + (fbm(u * 1, v, 64, 2, 21) - 0.5) * 0.25 + (vnoise(u, v * 0.02 + 0.5, 128, 22) - 0.5) * 0.15;
    for (let i = 0; i < 9; i++) { const a = hash2(i, 1, 23) * Math.PI, o = hash2(i, 2, 23); const d = Math.abs(((u * Math.cos(a) + v * Math.sin(a) - o) % 1 + 1) % 1 - 0.5); h -= Math.max(0, 1 - d * 900) * 0.35 * (hash2(i, 3, 23) > 0.4 ? 1 : 0); }
    return h + (fbm(u, v, 3, 3, 24) - 0.5) * 0.3;
  },
  // hair: strands running down v
  (u, v) => { const s = vnoise(u, v * 0.06, 96, 31) * 0.6 + vnoise(u, v * 0.1, 48, 32) * 0.4; return s * 0.85 + fbm(u, v, 8, 2, 33) * 0.15; },
  // chainmail: interlocking rings in offset rows
  (u, v) => {
    const n = 10, y = v * n, row = Math.floor(y), x = u * n + (row % 2) * 0.5;
    let h = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ry = row + dy, ox = (((ry % 2) + 2) % 2) * 0.5;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor(u * n + ((ry % 2 + 2) % 2) * 0.5) + dx - ox + 0.5, cy = ry + 0.5;
        const d = Math.hypot(u * n - cx, (y - cy) * 1.15), ring = Math.max(0, 1 - Math.abs(d - 0.42) / 0.14);
        h = Math.max(h, Math.sqrt(ring) * (dy === 0 ? 1 : 0.85));
      }
    }
    void x; return h;
  },
  // wood: grain lines with knots
  (u, v) => { const w = fbm(u, v, 4, 3, 41) * 0.35; const g = 0.5 + 0.5 * Math.sin((u + w) * Math.PI * 2 * 14); return g * 0.7 + fbm(u, v * 0.2, 32, 2, 42) * 0.3; },
  // fur: soft clumps of strands
  (u, v) => { const clump = fbm(u, v, 6, 2, 51); return vnoise(u + clump * 0.1, v * 0.15, 64, 52) * 0.7 + clump * 0.3; },
];

let atlasPromise = null;
/** The 8-layer detail texture (normal in rgb, height in alpha). Built once, shared by every character. */
export function detailAtlas() {
  if (atlasPromise) return atlasPromise;
  const N = TILE_SIZE, layers = HEIGHT.length, data = new Uint8Array(N * N * 4 * layers);
  for (let l = 0; l < layers; l++) {
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = HEIGHT[l](x / N, y / N);
    let lo = Infinity, hi = -Infinity; for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1, bump = [4, 5, 3.5, 2.5, 4, 6, 3, 3.5][l];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const at = (i, j) => (h[((j + N) % N) * N + ((i + N) % N)] - lo) / span;
      const dx = (at(x + 1, y) - at(x - 1, y)) * bump, dy = (at(x, y + 1) - at(x, y - 1)) * bump;
      const l2 = Math.hypot(dx, dy, 1), o = (l * N * N + y * N + x) * 4;
      data[o] = (-dx / l2 * 0.5 + 0.5) * 255; data[o + 1] = (-dy / l2 * 0.5 + 0.5) * 255; data[o + 2] = (1 / l2 * 0.5 + 0.5) * 255; data[o + 3] = at(x, y) * 255;
    }
  }
  const tex = new THREE.DataArrayTexture(data, N, N, layers);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
  atlasPromise = tex;
  return tex;
}

// --------------------------------------------------------------------- shader

const VERT_HEAD = /* glsl */`
attribute vec4 surf;
attribute vec4 extra;
flat varying float vTile;
varying vec4 vSurf;
varying vec4 vExtra;
varying vec3 vBindPos;
varying vec3 vBindNormal;
varying mat3 vBindToView;
`;
const FRAG_HEAD = /* glsl */`
uniform highp sampler2DArray detailMap;
uniform float detailScale[8];
uniform float detailOn;
flat varying float vTile;
varying vec4 vSurf;
varying vec4 vExtra;
varying vec3 vBindPos;
varying vec3 vBindNormal;
varying mat3 vBindToView;
vec4 c3Detail;
vec3 c3Triplanar(vec3 n, out float height) {
  float s = 1.0 / detailScale[int(vTile + 0.5)];
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec4 tx = texture(detailMap, vec3(vBindPos.zy * s, vTile));
  vec4 ty = texture(detailMap, vec3(vBindPos.xz * s, vTile));
  vec4 tz = texture(detailMap, vec3(vBindPos.xy * s, vTile));
  height = tx.a * w.x + ty.a * w.y + tz.a * w.z;
  vec2 dx = tx.xy * 2.0 - 1.0, dy = ty.xy * 2.0 - 1.0, dz = tz.xy * 2.0 - 1.0;
  vec3 p = vec3(0.0, dx.y, dx.x) * w.x
         + vec3(dy.x, 0.0, dy.y) * w.y
         + vec3(dz.x, dz.y, 0.0) * w.z;
  return p;
}
`;

/**
 * The character material. `opts.detail` false turns the triplanar detail off (the low LOD uses it).
 */
export function characterMaterial({ detail = true } = {}) {
  const atlas = detailAtlas();
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(1, 1, 1) });
  m.userData.chibi3 = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: atlas };
    shader.uniforms.detailScale = { value: TILE_SCALE };
    shader.uniforms.detailOn = { value: detail ? 1 : 0 };
    shader.vertexShader = VERT_HEAD + shader.vertexShader
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
        // surf.x is the detail tile / 255 and extra.x the glow / 2, so both pack into bytes (baked files)
        vTile = floor(surf.x * 255.0 + 0.5); vSurf = surf; vExtra = vec4(extra.x * 2.0, extra.yzw); vBindPos = position; vBindNormal = normal;
        #ifdef USE_SKINNING
          vBindToView = normalMatrix * mat3(skinMatrix);
        #else
          vBindToView = normalMatrix;
        #endif`);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float c3h = 0.5;
        vec3 c3n = normalize(vBindNormal);
        vec3 c3p = vec3(0.0);
        if (detailOn > 0.5) c3p = c3Triplanar(c3n, c3h);
        // cavities in the detail darken the colour a little (pores, weave gaps, grain)
        diffuseColor.rgb *= mix(1.0, 0.78 + 0.32 * c3h, vExtra.z * detailOn);
        // worn edges on metal and leather go lighter
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.45 + 0.04, clamp(vExtra.w, 0.0, 1.0));
        c3Detail = vec4(c3p, c3h);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(vSurf.y + (0.5 - c3Detail.w) * 0.25 * vExtra.z - vExtra.w * 0.18, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = vSurf.z;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 c3bn = normalize(c3n + c3Detail.xyz * vExtra.z * detailOn);
        normal = normalize(vBindToView * c3bn);
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.sheenColor = mix(vec3(1.0), diffuseColor.rgb * 1.6, 0.7) * vExtra.y;`)
      .replace('#include <aomap_fragment>', `
        float c3ao = vSurf.w;
        reflectedLight.indirectDiffuse *= c3ao;
        reflectedLight.indirectSpecular *= c3ao * c3ao;
        reflectedLight.directDiffuse *= mix(1.0, c3ao, 0.3);
        reflectedLight.directSpecular *= mix(1.0, c3ao, 0.6);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vExtra.x * 2.5;`);
  };
  m.customProgramCacheKey = () => 'chibi3-' + (detail ? 'd' : 'n');
  return m;
}

// --------------------------------------------------------------------- eyes

const eyeTextures = new Map();
/**
 * Eye texture: the sphere's front pole is the pupil. u runs around the eye, v from the front pole
 * (0) to the back (1): pupil, iris with radial fibres and a darker rim, limbal ring, then sclera
 * with faint veins.
 */
export function eyeTexture(irisHex = '#5a7a3a', pupil = 'round') {
  const key = irisHex + pupil;
  if (eyeTextures.has(key)) return eyeTextures.get(key);
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), iris = new THREE.Color(irisHex);
  const PUP = 0.055, IRIS = 0.15, LIMB = 0.165;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, o = (y * W + x) * 4;
    let r, gg, b;
    const ang = u * Math.PI * 2;
    // slit pupils (beastkin, some orcs): narrower across, taller up and down
    const pr = pupil === 'slit' ? PUP * (0.35 + 0.65 * Math.abs(Math.sin(ang))) : PUP;
    if (v < pr) { r = gg = b = 0.02; }
    else if (v < IRIS) {
      const t = (v - pr) / (IRIS - pr);
      const fib = 0.75 + 0.25 * vnoise(u, t * 0.4, 96, 61) + 0.15 * Math.sin(ang * 60 + t * 6);
      const ring = 0.75 + 0.45 * Math.exp(-((t - 0.25) ** 2) / 0.01);  // a bright collarette near the pupil
      const k = fib * ring * (1 - t * 0.35);
      r = iris.r * k; gg = iris.g * k; b = iris.b * k;
    } else if (v < LIMB) { const t = (v - IRIS) / (LIMB - IRIS); r = iris.r * 0.25 * (1 - t) + 0.75 * t * 0.5; gg = iris.g * 0.25 * (1 - t) + 0.7 * t * 0.5; b = iris.b * 0.25 * (1 - t) + 0.68 * t * 0.5; }
    else {
      const vein = Math.max(0, 1 - Math.abs(vnoise(u, v, 24, 62) - 0.5) * 30) * Math.min(1, (v - LIMB) * 4) * 0.25;
      const edge = Math.min(1, Math.max(0, (v - 0.3) * 2.5)); r = 0.8 - edge * 0.2; gg = 0.76 - vein * 0.5 - edge * 0.24; b = 0.72 - vein * 0.5 - edge * 0.24;
    }
    img.data[o] = Math.min(255, r * 255); img.data[o + 1] = Math.min(255, gg * 255); img.data[o + 2] = Math.min(255, b * 255); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = THREE.RepeatWrapping;
  eyeTextures.set(key, tex);
  return tex;
}

export function eyeMaterial(irisHex, pupil) {
  return new THREE.MeshPhysicalMaterial({ map: eyeTexture(irisHex, pupil), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, metalness: 0 });
}
