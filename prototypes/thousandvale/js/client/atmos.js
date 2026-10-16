// 2026-10-16 — graphics (G-ATMOS): the atmosphere pieces that sit on top of scene.js. The tier table and the maths are
// in gfx-tiers.js (pure); this file is the three.js half.
//
//   ATMOS_U                     shared uniform objects (time, cloud drift and strength, sun, sky): every water and ground
//                               material holds the SAME objects, so one write a frame reaches all of them
//   noiseTexture()              one tileable 128 px cloud / foam noise for the whole page (made once, ~3 ms)
//   setAtmosTier(t) / atmosTierNow(quality)   the page's tier (scene.js sets it at boot; terrain-view.js reads it)
//   patchWater(material, tier)  the water shader (depth colour, drifting ripples, glints, shore foam and waves)
//   groundCloudGlsl             the ground shader's cloud shadow line (terrain-view.js)
//   installGrade(renderer, t)   warm highlights / cool shadows folded into the tone mapping (no extra pass)
//   createMist(scene, opts)     drifting wisps of low cloud over water and valleys — one draw call
//   createContactShadows(scene) a soft round shadow under each character near the camera — one draw call
//
// Nothing here compiles a shader after boot or adds / hides a light (memory: threejs-shader-recompile-stutter).

import * as THREE from 'three';
import { ATMOS_TIERS, atmosTier, WATER, CLOUD, GRADE, MIST, mistSpotOk, mistAlpha } from './gfx-tiers.js';

export const ATMOS_U = {
  uT: { value: 0 },
  uCloudOff: { value: new THREE.Vector2() },
  uCloudK: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uSkyCol: { value: new THREE.Color(0.6, 0.72, 0.85) },
  tNoise: { value: null },
};

let TIER = null;
/** scene.js: the page's tier, chosen once at boot. */
export function setAtmosTier(t) { TIER = t; return t; }
/** The page's tier (or, before scene.js has set one — a test page — the row for this quality and the URL flag). */
export function atmosTierNow(quality = 'high') {
  if (TIER) return TIER;
  const flag = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('atmos') : null;
  return atmosTier(quality, flag);
}
export { ATMOS_TIERS };

// ---------------------------------------------------------------- the shared noise
let NOISE = null;
/** Tileable fBm value noise, 128 x 128, in the red channel (G/B: the same shifted, for a second look). */
export function noiseTexture(size = 128) {
  if (NOISE) return NOISE;
  const P = 8, lat = new Float32Array(P * P * 64);
  let s = 1234567; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  // periodic value noise at period p (lattice p x p), sampled at (u, v) in 0..1
  const vn = (u, v, p, o) => {
    const x = u * p, y = v * p, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const L = (a, b) => lat[o + ((b % p) * p + (a % p))];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (L(i, j) * (1 - sx) + L(i + 1, j) * sx) * (1 - sy) + (L(i, j + 1) * (1 - sx) + L(i + 1, j + 1) * sx) * sy;
  };
  const fbm = (u, v, o) => vn(u, v, 4, o) * 0.5 + vn(u, v, 8, o + 64) * 0.27 + vn(u, v, 16, o + 320) * 0.15 + vn(u, v, 32, o + 1344) * 0.08;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0, k = 0; y < size; y++) for (let x = 0; x < size; x++, k += 4) {
    const u = x / size, v = y / size;
    out[k] = Math.round(fbm(u, v, 0) * 255);
    out[k + 1] = Math.round(fbm((u + 0.37) % 1, (v + 0.61) % 1, 0) * 255);
    out[k + 2] = Math.round(vn(u, v, 32, 2000) * 255);
    out[k + 3] = 255;
  }
  NOISE = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping; NOISE.generateMipmaps = true;
  NOISE.minFilter = THREE.LinearMipmapLinearFilter; NOISE.magFilter = THREE.LinearFilter; NOISE.needsUpdate = true;
  ATMOS_U.tNoise.value = NOISE;
  return NOISE;
}

const f = v => v.toFixed(4);
const v3 = a => `vec3(${a.map(f).join(',')})`;

/** The cloud shadow on the ground (terrain-view.js puts this after its own colour sums; needs vW and the ATMOS uniforms). */
export const groundCloudGlsl = `diffuseColor.rgb *= 1.0 - smoothstep(0.47, 0.72, texture2D(tNoise, vW.xz * ${f(CLOUD.scale)} + uCloudOff).r) * uCloudK;`;
export const groundCloudPars = 'uniform sampler2D tNoise; uniform vec2 uCloudOff; uniform float uCloudK;';

// ---------------------------------------------------------------- water
/**
 * Turn the zone's water MeshStandardMaterial into the shaded water. The geometry carries `aWater` = (depth m,
 * metres to the waterline, foam round objects 0..1, 1 on a river). `normals` = the page's ripple normal map.
 */
export function patchWater(material, tier, normals) {
  noiseTexture();
  const defs = ['#define TV_SHADED'];
  if (tier.cloudShadows) defs.push('#define TV_CLOUDS');
  if (tier.shoreWaves) defs.push('#define TV_WAVES');
  if (tier.sparkle) defs.push('#define TV_SPARK');
  material.color.set('#ffffff'); material.opacity = 1; material.roughness = 0.26; material.metalness = 0.05;
  material.normalMap = null;
  material.customProgramCacheKey = () => 'tv-water|' + defs.join(',');
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { tWN: { value: normals }, tNoise: ATMOS_U.tNoise, uT: ATMOS_U.uT, uCloudOff: ATMOS_U.uCloudOff, uCloudK: ATMOS_U.uCloudK, uSunDir: ATMOS_U.uSunDir, uSunCol: ATMOS_U.uSunCol, uSkyCol: ATMOS_U.uSkyCol });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWater; varying vec4 vWater; varying vec3 vWW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = aWater; vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${defs.join('\n')}
uniform sampler2D tWN, tNoise; uniform float uT, uCloudK; uniform vec2 uCloudOff; uniform vec3 uSunDir, uSunCol, uSkyCol;
varying vec4 vWater; varying vec3 vWW;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  vec2 wp = vWW.xz;
  float wDep = vWater.x, wShore = vWater.y, wRiver = vWater.w;
  float wK = 1.0 - exp(-max(wDep, 0.0) * ${f(WATER.depthK)});
  vec3 wCol = wK < 0.5 ? mix(${v3(WATER.shallow)}, ${v3(WATER.mid)}, wK * 2.0) : mix(${v3(WATER.mid)}, ${v3(WATER.deep)}, wK * 2.0 - 1.0);
  float wCs = 1.0;
#ifdef TV_CLOUDS
  wCs = 1.0 - smoothstep(0.47, 0.72, texture2D(tNoise, wp * ${f(CLOUD.scale)} + uCloudOff).r) * uCloudK;
#endif
  float wN = texture2D(tNoise, wp * 0.11 + vec2(uT * 0.013, -uT * 0.009)).r;
  float wFw = mix(${f(WATER.foamWidth)}, ${f(WATER.foamWidth * 0.4)}, wRiver);
  // foam right where the sheet meets the ground (the depth crosses 0 exactly at the drawn waterline), and a band out from
  // it measured in metres (a quay's sheer face has no shallows, so the depth alone would draw no foam there)
  float tvEdge = (1.0 - smoothstep(0.0, ${f(WATER.foamDepth)}, wDep + (wN - 0.5) * 0.1)) * (1.0 - smoothstep(1.5, 3.5, wShore));
  float tvBand = (1.0 - smoothstep(0.8, 0.8 + wFw, wShore + (wN - 0.5) * 1.6)) * 0.8;
  float tvFoam = max(tvEdge, tvBand) * smoothstep(0.15, 0.5, wN + 0.15) * (1.0 - wRiver * 0.35);
#ifdef TV_WAVES
  float wPh = wShore / ${f(WATER.waveSpacing)} + uT * 0.09 + wN * 0.35;
  float wFr = fract(wPh);
  float wBand = smoothstep(0.80, 0.96, wFr) * (1.0 - smoothstep(0.96, 1.0, wFr));
  tvFoam = max(tvFoam, wBand * smoothstep(2.5, 4.0, wShore) * (1.0 - smoothstep(${f(WATER.waveReach * 0.45)}, ${f(WATER.waveReach)}, wShore)) * smoothstep(0.35, 0.62, wN) * 0.6 * (1.0 - wRiver));
#endif
  tvFoam = clamp(max(tvFoam, vWater.z * smoothstep(0.3, 0.55, wN + 0.15)), 0.0, 1.0);
  diffuseColor.rgb *= mix(wCol, vec3(0.93, 0.96, 0.96), tvFoam) * wCs;
  diffuseColor.a = max(mix(${f(WATER.alphaShallow)} + wRiver * 0.12, ${f(WATER.alphaDeep)}, wK), tvFoam * 0.95);
  roughnessFactor = mix(roughnessFactor, 0.85, tvFoam);
  vec3 wn = vec3(0.0, 1.0, 0.0);`)
      .replace('#include <normal_fragment_maps>', `
  {
    float wFar = 1.0 - smoothstep(70.0, 520.0, length(cameraPosition - vWW));
    vec3 nA = texture2D(tWN, wp / 26.0 + vec2(uT * 0.010, uT * 0.006)).xyz * 2.0 - 1.0;
    vec3 nB = texture2D(tWN, wp / 9.5 + vec2(-uT * 0.017, uT * 0.012)).xyz * 2.0 - 1.0;
    vec2 sl = (nA.xy * 0.55 + nB.xy * 0.45) * 0.2 * wFar * (1.0 - tvFoam * 0.8);
    wn = normalize(vec3(sl.x, 1.0, sl.y));
    normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  }`)
      // the broad sun reflection off a rippled sheet whitened a whole bay looking toward the sun: keep a little of it,
      // the glints below do the sparkle
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular *= 0.35;')
      .replace('#include <opaque_fragment>', `
  {
    vec3 wV = normalize(cameraPosition - vWW);
    // the sky in the water at a low angle (no reflection pass: the sky's own horizon colour)
    float wFres = pow(1.0 - max(dot(wV, wn), 0.0), 5.0);
    outgoingLight = mix(outgoingLight, uSkyCol * wCs, wFres * 0.3 * (1.0 - tvFoam));
#ifdef TV_SPARK
    vec3 wR = reflect(-wV, wn);
    float wG = pow(max(dot(wR, normalize(uSunDir)), 0.0), 700.0);
    float wGl = wG * smoothstep(0.62, 0.9, texture2D(tNoise, wp * 0.9 + vec2(uT * 0.05, uT * 0.03)).b);
    outgoingLight += uSunCol * (wG * 0.6 + wGl * 5.0) * (1.0 - tvFoam) * wCs;
#endif
  }
  #include <opaque_fragment>`);
  };
  return material;
}

// ---------------------------------------------------------------- the grade
let GRADE_IN = false;
/** Warm highlights, cool shadows, a touch more colour — inside the tone mapping every lit material already runs. */
export function installGrade(renderer, tier) {
  if (!tier.grade) return false;
  if (!GRADE_IN) {
    const L = 'vec3(0.2126, 0.7152, 0.0722)';
    THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', `vec3 CustomToneMapping( vec3 color ) {
  color = ACESFilmicToneMapping( color );
  float gL = dot( color, ${L} );
  color *= mix( ${v3(GRADE.cool)}, ${v3(GRADE.warm)}, smoothstep( 0.05, ${f(GRADE.pivot * 2)}, gL ) );
  float gL2 = dot( color, ${L} );
  return saturate( vec3( gL2 ) + ( color - gL2 ) * ${f(GRADE.sat)} );
}`);
    GRADE_IN = true;
  }
  renderer.toneMapping = THREE.CustomToneMapping;
  return true;
}

// ---------------------------------------------------------------- mist
const MIST_VERT = `
attribute vec4 aC; attribute vec3 aS;
varying vec2 vUv; varying float vA; varying float vSeed;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vA = aC.w; vSeed = aS.z;
  vec4 mvPosition = viewMatrix * vec4(aC.xyz, 1.0);
  mvPosition.xy += position.xy * aS.xy;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const MIST_FRAG = `
uniform sampler2D tNoise; uniform vec3 uCol; uniform float uT;
varying vec2 vUv; varying float vA; varying float vSeed;
#include <fog_pars_fragment>
void main() {
  if (vA < 0.004) discard;
  vec2 c = vUv * 2.0 - 1.0;
  float r = length(c * vec2(1.0, 1.35));
  float n = texture2D(tNoise, vUv * 0.55 + vec2(vSeed, vSeed * 1.7) + vec2(uT * 0.004, 0.0)).r;
  float n2 = texture2D(tNoise, vUv * 1.3 + vec2(vSeed * 3.1, 0.3) - vec2(uT * 0.007, 0.0)).g;
  float a = (1.0 - smoothstep(0.25, 1.0, r)) * smoothstep(0.28, 0.72, n * 0.6 + n2 * 0.4 + (1.0 - r) * 0.3);
  gl_FragColor = vec4(uCol, a * vA);
  #include <fog_fragment>
}`;

/**
 * Wisps of low cloud drifting over water and valleys, `count` of them (0 = none, nothing drawn). spot(x, z) ->
 * { y, wet } (ground or water height; wet = over water). Kept `MIST.playerClear` m from the player and faded out
 * close to the camera, so the player and what is round them are never covered.
 */
export function createMist(scene, { count = 0, spot = () => ({ y: NaN, wet: false }) } = {}) {
  const api = { mesh: null, count, setSpot(fn) { spot = fn; }, update() {}, setColour() {}, setVisible() {}, stats: { shown: 0, placed: 0 } };
  if (!count) return api;
  noiseTexture();
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
  const aC = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aS = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  geo.setAttribute('aC', aC); geo.setAttribute('aS', aS); geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({ vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(0.9, 0.92, 0.95) } }]) });
  mat.uniforms.tNoise = ATMOS_U.tNoise; mat.uniforms.uT = ATMOS_U.uT;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'mist'; mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);
  let seed = 99; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const W = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, age: 0, life: 0, peak: 0, on: false, retry: Math.random() * 2 }));
  let visible = true;
  function place(w, fx, fz, fy) {
    for (let t = 0; t < 5; t++) {
      const a = rnd() * Math.PI * 2, r = MIST.playerClear + 15 + rnd() * (MIST.far[1] - MIST.playerClear - 15);
      const x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r, s = spot(x, z) || {};
      if (!mistSpotOk({ y: s.y, wet: s.wet, dPlayer: r, focusY: fy })) continue;
      w.x = x; w.z = z; w.y = (Number.isFinite(s.y) ? s.y : 0) + MIST.lift[0] + rnd() * (MIST.lift[1] - MIST.lift[0]);
      w.age = 0; w.life = MIST.life[0] + rnd() * (MIST.life[1] - MIST.life[0]); w.peak = 0.22 + rnd() * 0.16; w.on = true;
      const i = W.indexOf(w), sz = MIST.size[0] + rnd() * (MIST.size[1] - MIST.size[0]);
      aS.array[i * 3] = sz; aS.array[i * 3 + 1] = sz * (0.32 + rnd() * 0.18); aS.array[i * 3 + 2] = rnd() * 10;
      aS.needsUpdate = true; api.stats.placed++;
      return true;
    }
    return false;
  }
  Object.assign(api, {
    mesh,
    setVisible(v) { visible = v; mesh.visible = v; },
    /** Mist takes the sky's light: the fog colour (display values) lifted toward white by day, dim at night. */
    setColour(fog, night = 0) { mat.uniforms.uCol.value.setRGB(fog.r, fog.g, fog.b).lerp(new THREE.Color(1, 1, 1), 0.45 * (1 - night)).multiplyScalar(1 - night * 0.35); },
    update(dt, focus, cam) {
      if (!visible || !focus) return;
      const [wx, wz] = CLOUD.wind; let shown = 0;
      for (let i = 0; i < count; i++) {
        const w = W[i];
        if (!w.on) { w.retry -= dt; if (w.retry <= 0) { w.retry = 1 + rnd(); if (!place(w, focus.x, focus.z, focus.y)) { aC.array[i * 4 + 3] = 0; continue; } } else { aC.array[i * 4 + 3] = 0; continue; } }
        w.age += dt; w.x += wx * 0.35 * dt; w.z += wz * 0.35 * dt;
        const dP = Math.hypot(w.x - focus.x, w.z - focus.z);
        if (w.age >= w.life || dP > MIST.far[1] + 40 || dP < MIST.playerClear * 0.8) { w.on = false; w.retry = 0.5 + rnd(); aC.array[i * 4 + 3] = 0; continue; }
        const camD = Math.hypot(w.x - cam.x, w.y - cam.y, w.z - cam.z);
        // seen from high above, a wisp thins (it is low cloud, not a ceiling)
        const high = 1 - Math.max(0, Math.min(1, (cam.y - w.y - 120) / 160));
        const a = mistAlpha(w.age, w.life, camD, w.peak) * high;
        aC.array[i * 4] = w.x; aC.array[i * 4 + 1] = w.y; aC.array[i * 4 + 2] = w.z; aC.array[i * 4 + 3] = a;
        if (a > 0.01) shown++;
      }
      aC.needsUpdate = true; api.stats.shown = shown;
    },
  });
  return api;
}

// ---------------------------------------------------------------- contact shadows
/** A soft dark disc under each character near the camera (opacity 0 = none). One instanced draw. */
export function createContactShadows(scene, { opacity = 0, max = 64 } = {}) {
  const api = { mesh: null, update() {}, setVisible() {}, stats: { shown: 0 } };
  if (!opacity) return api;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.75)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#10131a', transparent: true, opacity, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, max); mesh.name = 'contact-shadows'; mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 0;
  scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let visible = true;
  Object.assign(api, {
    mesh,
    setVisible(v) { visible = v; mesh.visible = v; },
    /** list = the actors Map's values; cam = camera position. Nearest first up to `max`, within 70 m. */
    update(list, cam) {
      if (!visible) return;
      let n = 0;
      for (const a of list) {
        if (n >= max) break;
        const G = a.group; if (!G || !G.visible || a.swim || a.dead) continue;
        const P = G.position, d = Math.hypot(P.x - cam.x, P.z - cam.z);
        if (d > 70) continue;
        const r = Math.max(0.42, Math.min(4, a.pickR ? a.pickR * 0.8 : (a.height || 1.7) * 0.27));
        p.set(P.x, P.y + 0.05, P.z); s.set(r * 2, 1, r * 2);
        m.compose(p, q, s); mesh.setMatrixAt(n++, m);
      }
      mesh.count = n; if (n) mesh.instanceMatrix.needsUpdate = true; api.stats.shown = n;
    },
  });
  return api;
}
