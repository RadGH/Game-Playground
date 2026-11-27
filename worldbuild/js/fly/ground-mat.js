// World Build fly view — the ground material: twelve painted surfaces in one texture array (Oathwild's own baked
// ground pictures, prototypes/oathwild/img/ground/*.webp, plus snow, ash and gravel painted by highdef-3d's surface
// kit), picked per spot from each chunk's small paint map (one layer index per cell, blended between the four nearest
// cells), with rock laid on wherever the ground is steep. Textured everywhere (lessons rule 77), one material per chunk
// (only its paint map differs), the same shader program for all of them.
//
//   const G = await groundLayers(renderer, { px })     the shared texture array (+ stand-in colours until loaded)
//   const mat = chunkMaterial(G, { x0, z0, size, pn, paint, quality })

import * as THREE from 'three';
import { makeSurface } from '../../../highdef-3d/js/kit/textures.js';

export const LAYERS = ['grass', 'wild', 'forest', 'dirt', 'soil', 'sand', 'marsh', 'gravel', 'snow', 'ash', 'heath', 'dust'];
const IMG = new URL('../../../prototypes/oathwild/img/ground/', import.meta.url);
// where each layer's picture comes from, how many metres one repeat covers, and a tint (1 = as painted)
const SOURCE = {
  grass: { img: 'grass', m: 5 }, wild: { img: 'wild', m: 6 }, forest: { img: 'forest', m: 6 }, dirt: { img: 'dirt', m: 5 },
  soil: { img: 'soil', m: 4 }, sand: { img: 'sand', m: 6 }, marsh: { img: 'marsh', m: 6 }, gravel: { img: 'rock', m: 7 },
  snow: { surface: 'snow', m: 8 }, ash: { surface: 'ash', m: 7 }, heath: { img: 'wild', m: 6, tint: [1.02, 0.82, 0.82] }, dust: { img: 'dirt', m: 6, tint: [1.15, 0.78, 0.58] },
};
const STAND = { grass: '#6f9a48', wild: '#6e8a48', forest: '#5a5a36', dirt: '#9c8260', soil: '#7a6248', sand: '#c4b48a', marsh: '#5d7450', gravel: '#8a847a', snow: '#eef1f6', ash: '#58534f', heath: '#806a5e', dust: '#b4784c' };

export async function groundLayers(renderer, { px = 512 } = {}) {
  const n = LAYERS.length, data = new Uint8Array(n * px * px * 4);
  const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
  const cx = cv.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < n; i++) {
    const s = SOURCE[LAYERS[i]];
    let src;
    if (s.img) { const blob = await (await fetch(new URL(s.img + '.webp', IMG))).blob(); src = await createImageBitmap(blob); }
    else src = makeSurface(s.surface, { size: 256, seed: 5 }).map.image;
    cx.clearRect(0, 0, px, px); cx.drawImage(src, 0, 0, px, px); src.close?.();
    const d = cx.getImageData(0, 0, px, px).data;
    if (s.tint) for (let j = 0; j < d.length; j += 4) { d[j] = Math.min(255, d[j] * s.tint[0]); d[j + 1] = Math.min(255, d[j + 1] * s.tint[1]); d[j + 2] = Math.min(255, d[j + 2] * s.tint[2]); }
    data.set(d, i * px * px * 4);
  }
  const tex = new THREE.DataArrayTexture(data, px, px, n);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1); tex.needsUpdate = true;
  return { tex, inv: LAYERS.map(l => 1 / SOURCE[l].m), stand: LAYERS.map(l => new THREE.Color(STAND[l])), bytes: data.byteLength };
}

const NOISE = /* glsl */`
  float wbHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wbNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wbHash(i), wbHash(i + vec2(1, 0)), f.x), mix(wbHash(i + vec2(0, 1)), wbHash(i + vec2(1, 1)), f.x), f.y); }`;

export function chunkMaterial(G, { x0, z0, size, pn, paint, quality = 'medium' }) {
  const pt = new THREE.DataTexture(paint, pn, pn, THREE.RedFormat, THREE.UnsignedByteType);
  pt.minFilter = pt.magFilter = THREE.NearestFilter; pt.needsUpdate = true;
  const NL = LAYERS.length;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.userData.paintTex = pt;
  mat.customProgramCacheKey = () => 'wb-ground|' + quality;
  mat.onBeforeCompile = sh => {
    sh.uniforms.tWbLayers = { value: G.tex };
    sh.uniforms.tWbPaint = { value: pt };
    sh.uniforms.uWbChunk = { value: new THREE.Vector4(x0, z0, size, pn) };
    sh.uniforms.uWbInv = { value: G.inv };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWbW; varying vec3 vWbN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWbW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWbN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray tWbLayers; uniform sampler2D tWbPaint; uniform vec4 uWbChunk; uniform float uWbInv[${NL}];
        varying vec3 vWbW; varying vec3 vWbN;
        ${NOISE}
        vec3 wbLayer(float id, vec2 p, vec2 gx, vec2 gy){
          int i = int(id + 0.5); float s = uWbInv[0];
          ${LAYERS.map((_, i) => `if (i == ${i}) s = uWbInv[${i}];`).join(' ')}
          vec3 a = textureGrad(tWbLayers, vec3(p * s, id), gx * s, gy * s).rgb;
          vec3 b = textureGrad(tWbLayers, vec3(p * s * 0.27 + 0.31, id), gx * s * 0.27, gy * s * 0.27).rgb;
          return mix(a, b, 0.35);
        }`)
      .replace('#include <map_fragment>', `
        {
          vec2 p = vWbW.xz;
          vec2 gx = dFdx(p), gy = dFdy(p);
          // the paint map: four nearest cells, blended (a wobble so the cell grid never shows)
          vec2 wob = vec2(wbNoise(p * 0.11), wbNoise(p * 0.11 + 7.3)) - 0.5;
          vec2 c = (p - uWbChunk.xy) / uWbChunk.z * uWbChunk.w - 0.5 + wob * 0.9;
          vec2 f = fract(c); ivec2 b0 = ivec2(floor(c));
          int last = int(uWbChunk.w) - 1;
          float i00 = texelFetch(tWbPaint, clamp(b0, ivec2(0), ivec2(last)), 0).r * 255.0;
          float i10 = texelFetch(tWbPaint, clamp(b0 + ivec2(1, 0), ivec2(0), ivec2(last)), 0).r * 255.0;
          float i01 = texelFetch(tWbPaint, clamp(b0 + ivec2(0, 1), ivec2(0), ivec2(last)), 0).r * 255.0;
          float i11 = texelFetch(tWbPaint, clamp(b0 + ivec2(1, 1), ivec2(0), ivec2(last)), 0).r * 255.0;
          vec3 col = wbLayer(i00, p, gx, gy) * (1.0 - f.x) * (1.0 - f.y) + wbLayer(i10, p, gx, gy) * f.x * (1.0 - f.y)
                   + wbLayer(i01, p, gx, gy) * (1.0 - f.x) * f.y + wbLayer(i11, p, gx, gy) * f.x * f.y;
          // steep ground shows rock
          float rock = 1.0 - smoothstep(0.74, 0.88, normalize(vWbN).y + (wbNoise(p * 0.13) - 0.5) * 0.08);
          col = mix(col, wbLayer(7.0, p, gx, gy) * 0.95, rock);
          // large soft colour drift so a plain reads as land, not a tiled carpet
          col *= 0.88 + 0.24 * (wbNoise(p * 0.017) * 0.6 + wbNoise(p * 0.061) * 0.4);
          diffuseColor.rgb *= col;
        }`);
  };
  return mat;
}
