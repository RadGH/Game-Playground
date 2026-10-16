// Graphics pass 2026-10-16 (G-PROPS) — draws the surface layers (surface-plan.js / surface-paint.js) on the world's props
// and buildings. ONE texture array for the whole page, one float attribute (`aSurf`) per instance (unit-shape kit) or per
// vertex (kit models), and a small patch on the existing MeshStandardMaterial — no new draw calls, no new lights.
//
//   const tier = propTier(quality, { off: propsOff() })
//   surfaceMaterial(mat, tier, { unit: true })          patch a kit material in place (returns it); a no-op when tier.detail is off
//   instancedKit(geometry, mat, list, tier)             an InstancedMesh over a CLONE of the unit geometry with aSurf per
//                                                       instance; list = [{ m: Matrix4, c: Color, s: surface code }]
//   surfaceVertexAttr(geometry)                         give a vertex-coloured kit model its per-vertex aSurf (by colour)
//   disposeKit(mesh)                                    dispose an instancedKit mesh AND its own geometry
//
// What the shader does, per pixel, for a surface code s > 0 (0 = exactly the old look):
//   * the layer's picture is projected in METRES on the part's own faces (a 6 m wall shows six boards' worth of grain,
//     not one stretched board): flat tops take x/z, every other face takes "along the face" x "up the slope", so a roof's
//     tile rows follow its pitch; wood turns its grain along the longer side (a post's grain runs up it)
//   * albedo *= the layer (mean ~1, so the town's palette is kept) x a per-instance weathering tone (±6%)
//   * wear (Medium / High, unit shapes only): grime at the foot of walls, a crease of shadow under the top of a tall wall
//     (where the eave sits), and lighter rubbed edges on every box
//   * relief (High): the layer's height bends the normal (screen-space derivatives — three's own bump trick, one texture
//     fetch), and the layer's roughness replaces the flat 0.88
// Program cache: one program per (material type, defines) — every zone's kit material shares it (customProgramCacheKey),
// so streaming a zone in compiles nothing new.

import * as THREE from 'three';
import { LAYERS, LAYER_COUNT, surfaceByColour, propTier, propsOff } from './surface-plan.js';
import { paintLayer } from './surface-paint.js';

const NEUTRAL = [128, 128, 128, 160];
let TEX = null, PAINT = null, PAGE = null;
/**
 * The page's tier, for views that are only told `cheap` (decor.js, vignette-props.js, the site props): the tier the
 * first town / set piece view brought (they know the quality), else low when cheap, else medium (the props' only
 * difference between medium and high is relief, which a kit model does not get anyway).
 */
export const pageTier = (cheap = false) => (cheap ? propTier('low') : PAGE || propTier('medium', { off: propsOff() }));
/** The shared texture array at this tier's size (painted a layer per idle moment; neutral until then). */
export function surfaceTexture(tier) {
  if (TEX && TEX.image.width === tier.layerPx) return TEX;
  const px = tier.layerPx || 4;
  const data = new Uint8Array(LAYER_COUNT * px * px * 4);
  new Uint32Array(data.buffer).fill(new Uint32Array(new Uint8Array(NEUTRAL).buffer)[0]);   // one neutral texel, every texel
  const tex = new THREE.DataArrayTexture(data, px, px, LAYER_COUNT);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = tier.bump ? 4 : 1;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  TEX = tex; U.uSurfTex.value = tex; PAGE = tier;
  // paint in idle moments, a layer at a time (~10-30 ms each), then upload once
  if (tier.layerPx) {
    const step = (li) => {
      if (TEX !== tex) return;
      if (li >= LAYER_COUNT) { tex.needsUpdate = true; PAINT = 'done'; return; }
      const t0 = performance.now();
      paintLayer(data, px, li);
      STATS.paintMs += performance.now() - t0;
      later(() => step(li + 1));
    };
    PAINT = 'painting';
    later(() => step(0));
  }
  return tex;
}
const later = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => fn(), { timeout: 300 }) : setTimeout(fn, 16));
export const STATS = { paintMs: 0, materials: 0, kits: 0, instances: 0, get painted() { return PAINT; } };

// shared uniforms (one object: every patched material points at the same values)
const U = {
  uSurfTex: { value: null },
  uSurfInv: { value: LAYERS.map(l => 1 / l.size) },
  uSurfBump: { value: LAYERS.map(l => l.bump) },
  uSurfRough: { value: LAYERS.map(l => l.rough) },
  uSurfWood: { value: LAYERS.map(l => (l.wood ? 1 : 0)) },
};

const VERT_PARS = /* glsl */`
attribute float aSurf;
attribute float aSurfRound;      // 1 on round unit shapes (cyl, cone, dome, barrel, sack): owner 2026-10-16 — towers read smooth
flat varying float vSurf;
varying vec2 vSurfUv;
varying vec3 vSurfLocal;
flat varying vec3 vSurfSize;
flat varying vec3 vSurfN;
flat varying float vSurfTone;
uniform float uSurfInv[${LAYER_COUNT}];
uniform float uSurfWood[${LAYER_COUNT}];
`;
const VERT_MAIN = /* glsl */`
{
  vSurf = aSurf;
  vec3 sScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  vec3 org = modelMatrix[3].xyz;
  #ifdef USE_INSTANCING
    sScale *= vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    org += instanceMatrix[3].xyz;
  #endif
  vec3 pm = position * sScale;
  vec3 nm = normalize(objectNormal / max(sScale, vec3(1e-4)));
  int li = int(max(aSurf - 1.0, 0.0) + 0.5);
  float wood = uSurfWood[li];
  vec2 uv;
  if (abs(nm.y) > 0.72) {
    // a flat top: boards ACROSS a long deck (a pier, a bridge), along anything squarer
    bool longZ = sScale.z > sScale.x;
    float ratio = longZ ? sScale.z / max(sScale.x, 1e-3) : sScale.x / max(sScale.z, 1e-3);
    bool swap = (wood > 0.5) && ((ratio > 2.5) == longZ);
    uv = swap ? pm.zx : pm.xz;
  } else {
    vec2 t = normalize(vec2(-nm.z, nm.x));
    float across = abs(dot(sScale.xz, t)), up = sScale.y;
    uv = vec2(dot(pm.xz, t), pm.y / max(length(nm.xz), 0.35));
    if (aSurfRound > 0.5) {
      // a round side: dot(position, tangent) is ~0 all the way round a cylinder, so the courses had no joints and a
      // tower read as smooth bands. Lay the pattern by arc length instead (metres round the curve).
      float rad = 0.25 * (sScale.x + sScale.z);
      uv.x = atan(position.z, position.x) * rad;
      across = 6.2831853 * rad;
    }
    // wood grain runs along the longer side of the face (a post's grain runs up it)
    if (wood > 0.5 && up > across * 1.25) uv = uv.yx;
  }
  vSurfUv = uv * uSurfInv[li];
  vSurfLocal = position;
  vSurfSize = sScale;
  vSurfN = objectNormal;
  float hsh = fract(sin(dot(floor(org.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
  vSurfTone = 0.94 + hsh * 0.12;
}
`;
const FRAG_PARS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uSurfTex;
uniform float uSurfBump[${LAYER_COUNT}];
uniform float uSurfRough[${LAYER_COUNT}];
flat varying float vSurf;
varying vec2 vSurfUv;
varying vec3 vSurfLocal;
flat varying vec3 vSurfSize;
flat varying vec3 vSurfN;
flat varying float vSurfTone;
float surfH = 0.5;
float surfW = 0.0;
int surfLi = 0;
`;
const FRAG_COLOR = /* glsl */`
{
  surfW = step(0.5, vSurf);
  surfLi = int(max(vSurf - 1.0, 0.0) + 0.5);
  vec4 st = texture(uSurfTex, vec3(vSurfUv, float(surfLi)));
  surfH = st.a;
  vec3 k = st.rgb * 2.0 * vSurfTone;
  #ifdef SURF_WEAR
  {
    vec3 n = abs(vSurfN);
    float side = 1.0 - step(0.72, n.y);
    // grime at the foot of a wall / crate / post (metres above its base)
    float footM = vSurfLocal.y * vSurfSize.y;
    float grime = side * (1.0 - smoothstep(0.0, 0.55, footM)) * 0.22;
    // the crease under the top of a TALL part (a wall under its eave)
    float topM = (1.0 - vSurfLocal.y) * vSurfSize.y;
    float crease = side * step(1.8, vSurfSize.y) * (1.0 - smoothstep(0.0, 0.45, topM)) * 0.2;
    // rubbed edges: metres to the nearest edge of this face of the unit box
    vec3 d3 = vec3((0.5 - abs(vSurfLocal.x)) * vSurfSize.x, min(vSurfLocal.y, 1.0 - vSurfLocal.y) * vSurfSize.y, (0.5 - abs(vSurfLocal.z)) * vSurfSize.z);
    d3 += step(0.72, n) * 100.0;
    float e = min(d3.x, min(d3.y, d3.z));
    float rub = (1.0 - smoothstep(0.0, 0.05, e)) * 0.16 * (0.4 + surfH);
    k *= (1.0 - grime) * (1.0 - crease) * (1.0 + rub);
    k = mix(k, k * vec3(0.92, 0.86, 0.78), grime * 2.0);
  }
  #endif
  diffuseColor.rgb *= mix(vec3(1.0), k, surfW);
}
`;
const FRAG_ROUGH = /* glsl */`
roughnessFactor = mix(roughnessFactor, uSurfRough[surfLi] * (1.12 - 0.24 * surfH), surfW);
`;
const FRAG_BUMP = /* glsl */`
{
  // three's perturbNormalArb with the layer's height (one texture fetch, already made)
  float bs = uSurfBump[surfLi] * 0.025 * surfW;
  vec2 dHdxy = vec2(dFdx(surfH), dFdy(surfH)) * bs;
  vec3 surf_pos = -vViewPosition;
  vec3 sx = dFdx(surf_pos.xyz), sy = dFdy(surf_pos.xyz);
  vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
  float fDet = dot(sx, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  normal = normalize(abs(fDet) * normal - vGrad);
}
`;

/**
 * Patch a kit material in place. `unit` = its geometry is a proctown unit shape (origin at the base centre, 1 m each
 * way: wear needs that frame). A no-op on a tier without detail (low, or ?props=0).
 */
export function surfaceMaterial(mat, tier, { unit = false } = {}) {
  if (!tier?.detail || !mat || mat.userData.surf) return mat;
  surfaceTexture(tier);
  const wear = !!(tier.wear && unit), bump = !!tier.bump;
  const std = !!mat.isMeshStandardMaterial;
  mat.userData.surf = true;
  mat.defines = { ...(mat.defines || {}), SURF_DETAIL: '' };
  if (wear) mat.defines.SURF_WEAR = '';
  if (bump) mat.defines.SURF_BUMP = '';
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
    if (std) shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH);
    if (bump) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_BUMP);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  const key = `surf:${std ? 's' : 'l'}${wear ? 'w' : ''}${bump ? 'b' : ''}`;
  mat.customProgramCacheKey = () => key + '|' + (prevKey ? prevKey() : '');
  mat.needsUpdate = true;
  STATS.materials++;
  return mat;
}

/**
 * An InstancedMesh over its OWN copy of a unit geometry, with the per-instance surface code. (A copy, because the unit
 * geometries are shared and an instanced attribute lives on the geometry; disposing a geometry that SHARED buffers with
 * another would leave the other's vertex-array state pointing at deleted buffers.) Without detail it is a plain
 * InstancedMesh over the shared geometry, exactly as before.
 */
export function instancedKit(geometry, mat, list, tier) {
  if (!tier?.detail) {
    const m = new THREE.InstancedMesh(geometry, mat, list.length);
    list.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); });
    return m;
  }
  const g = geometry.clone();
  const s = new Float32Array(list.length);
  list.forEach((it, i) => { s[i] = it.s != null ? it.s : surfOfColor(it.c); });
  g.setAttribute('aSurf', new THREE.InstancedBufferAttribute(s, 1));
  const m = new THREE.InstancedMesh(g, mat, list.length);
  list.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); });
  m.userData.ownGeo = true;
  STATS.kits++; STATS.instances += list.length;
  return m;
}
const COLOR_SURF = new Map();
/** A THREE.Color's surface by its (sRGB) hex — for kits whose parts carry only a colour. */
export function surfOfColor(c) {
  if (!c) return 0;
  const hex = '#' + c.getHexString();
  let v = COLOR_SURF.get(hex); if (v == null) { v = surfaceByColour(hex); COLOR_SURF.set(hex, v); }
  return v;
}
/**
 * Give an InstancedMesh that a view has ALREADY filled (matrices + colours) its surfaces: its geometry becomes its own
 * copy with `aSurf` per instance (from `codes`, else classified from each instance colour). A no-op without detail.
 * Dispose it with disposeKit().
 */
export function surfaceInstances(m, tier, codes = null) {
  if (!tier?.detail || !m?.instanceColor || m.userData.ownGeo) return m;
  const n = m.count, s = new Float32Array(n), c = new THREE.Color();
  for (let i = 0; i < n; i++) s[i] = codes?.[i] ?? surfOfColor(m.getColorAt(i, c));
  m.geometry = m.geometry.clone();
  m.geometry.setAttribute('aSurf', new THREE.InstancedBufferAttribute(s, 1));
  m.userData.ownGeo = true;
  STATS.kits++; STATS.instances += n;
  return m;
}
export function disposeKit(m) { m.dispose?.(); if (m.userData?.ownGeo) m.geometry.dispose(); }

/** A vertex-coloured kit model's per-vertex surface, classified from its vertex colours (done once per geometry). */
export function surfaceVertexAttr(geometry) {
  if (!geometry || geometry.attributes.aSurf) return geometry;
  const col = geometry.attributes.color, n = geometry.attributes.position.count;
  const s = new Float32Array(n);
  if (col) {
    const memo = new Map(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.LinearSRGBColorSpace);
      const hex = '#' + c.getHexString(THREE.SRGBColorSpace);
      let v = memo.get(hex); if (v == null) { v = surfaceByColour(hex); memo.set(hex, v); }
      s[i] = v;
    }
  }
  geometry.setAttribute('aSurf', new THREE.BufferAttribute(s, 1));
  return geometry;
}
