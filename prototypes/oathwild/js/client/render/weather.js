// The weather, drawn (world-tools round 2026-11-26 — owner: "Can we have weather from thousand vale, it has lightning and
// storm effects"). The server decides WHAT the weather is, per region (js/world/weather.js, World Forge's odds); this
// draws it round the camera, ported from the games that already had it:
//   rain        Farhold's rain on the graphics card (prototypes/farhold/js/rain.js, used by path): streaks leaning with the
//               wind, splashes and rings where drops land (wider ripples on water), grey sheets of rain in the distance
//   clouds      a cloud layer inside the sky: Thousandvale's painted clouds (img/sky/cloudy.webp, from its sky set) round
//               the horizon for fair and cloudy days, and Farhold's cloud deck crossing the sky downwind, darker and lower
//               the heavier the weather, grey veil over the blue in a storm
//   lightning   a bolt in the sky, the clouds lit from inside, and a light that really lights the ground for a moment: a
//               light made ONCE with the view whose strength changes (lessons rule 29: no light added or removed in play).
//               Strike times come from the world's seed + clock, so everyone in the world sees the same bolt.
//   thunder     sfx `thunder`, later the further away the strike (sound covers ~343 m a second), quieter and deeper
//   gloom       a heavy sky steals the sun, darkens and greys the fog, pulls the fog in; fog weather thickens the mist
//   wet         puddles that grow on flat ground the longer it rains (they mirror the sky) and dry out slowly after
//   sound       the rain / storm bed instead of the place's own (render/ambient.js bedOverride)
// Cost: everything is pooled and made at start; Low draws a third of the rain and no splashes, sheets or puddles.
//
//   const wx = createWeatherView(view, { heightAt, T, quality, sound })   ← BEFORE the first frame (its light is in the
//                                                                            light count every material compiles with)
//   wx.update(dt, { wire, seed, time, at: { x, z } })   wire = wstate.wx, seed = wstate.wxs, time = world clock (s)
//   view.afterWeather = () => wx.apply()                 (view.render calls it after the Look numbers and the zones)
//   wx.preview('storm' | null)                           the map editor's picker: show a weather here, null = the server's
//   wx.strike(s?, { hold })                              a strike now (tests, the editor); hold = keep it lit for N s (pictures)
//   wx.numbers / wx.state / wx.wind / wx.stats           what is drawn now (tests, game-eye)
//   The ONE wind (render/wind.js) is driven from here: setFromWeather every frame (eases there itself)
import * as THREE from 'three';
import { createPrecipitation } from '../../../../farhold/js/rain.js';
import { createWind } from '../../../../farhold/js/wind.js';
import { makeNoise2D } from '../../../../../worldgen/js/noise.js';
import { numbersAt, regionNumbers, strikesBetween, WEATHER_SETUP } from '../../world/weather.js';
import { ATMOS } from './atmos.js';
import { wind as ONE_WIND } from './wind.js';

/** Particles per graphics setting (Farhold's gfx shape). Low (phones): a third of the rain, no splashes / sheets. */
export const WEATHER_GFX = {
  low: { rainDrops: 1600, splashes: 0, rainSheets: false, snowFlakes: 900, debris: 0, puddles: 0, deck: 128 },
  medium: { rainDrops: 4200, splashes: 160, rainSheets: true, snowFlakes: 2200, debris: 160, puddles: 40, deck: 256 },
  high: { rainDrops: 7000, splashes: 300, rainSheets: true, snowFlakes: 3600, debris: 320, puddles: 72, deck: 256 },
};
// what each weather does to the light (multipliers at full gloom / fog); checked on the storm and fog pictures
export const WEATHER_LOOK = {
  sun: 0.8, fill: 0.28, exposure: 0.16, saturation: 0.1, skyLight: 0.65,       // a storm keeps 20% of the sun, 72% of the sky fill …
  fogGrey: '#59636f', fogGreyMix: 0.8,                          // … and its fog turns this slate grey
  fogMist: '#aeb8bf', fogMistMix: 0.55,                         // fog weather: the air goes a soft blue-grey, never white
  overcastSun: 0.72,                                            // a sky fully covered keeps 28% of the sun (no hard shadows)
  fogFar: 0.3, fogNear: 0.1,                                    // full fog: the view ends at 30% of the usual distance
  mist: 0.012, mistMax: 0.45,                                   // fog weather: low mist thickens by this much
  cloudShade: 0.22,                                             // cloud shadows on the ground on a broken-cloud day
  flashLight: 3.2, flashFill: 1.4,                              // lightning: the strike's light and the sky fill bump
};
const PAINT = { url: new URL('../../../img/sky/cloudy.webp', import.meta.url).href, horizonV: 0.9097 };   // Thousandvale skies.json `cloudy`
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** A seamless cloud tile (Farhold's cloudCanvas, four-way blended so the deck scrolls forever with no seam). */
function cloudTile(seed, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), n = makeNoise2D(seed >>> 0);
  const oct = (x, y) => { let v = 0, a = 0.5, f = 1; for (let o = 0; o < 5; o++) { v += a * n(x * f, y * f); a *= 0.52; f *= 2.03; } return v * 0.5 + 0.5; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const val = oct(u * 4, v * 4) * (1 - u) * (1 - v) + oct((u - 1) * 4, v * 4) * u * (1 - v) + oct(u * 4, (v - 1) * 4) * (1 - u) * v + oct((u - 1) * 4, (v - 1) * 4) * u * v;
    const o = (y * size + x) * 4, b = Math.round(clamp01(val) * 255);
    img.data[o] = img.data[o + 1] = img.data[o + 2] = img.data[o + 3] = b;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

const SKY_VERT = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FRAG = /* glsl */`
  uniform sampler2D tPaint, tDeck; uniform float uHV, uPaint, uCover, uGloom, uVeil, uFlash, uReady;
  uniform vec2 uOff; uniform vec3 uSunDir, uSunCol, uLit, uShade, uStorm, uHaze, uFlashCol;
  varying vec3 vP;
  float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void main(){
    vec3 d = normalize(vP); float h = d.y;
    float s = max(dot(d, uSunDir), 0.0);
    // the veil: under a heavy sky the blue goes grey, fading into the (greyed) fog colour at the horizon
    vec3 P = mix(mix(uHaze, uStorm * 1.7, uGloom * 0.55), mix(uShade, uStorm, uGloom), smoothstep(0.0, 0.3, h)) * uVeil;
    float A = uVeil;
    // Thousandvale's painted clouds round the horizon: the clouds are what is NOT blue in the painting
    if (uReady > 0.5 && uPaint > 0.001 && h > -0.01) {
      float e = clamp(asin(clamp(h, -1.0, 1.0)) / 1.5707963, 0.0, 1.0);
      float u = atan(d.x, -d.z) / 6.2831853 + 0.5;
      float uB = fract(u + 0.5) - 0.5;                  // the seam behind you (Thousandvale sky-box.js)
      if (fwidth(uB) < fwidth(u) - 0.0001) u = uB;
      vec3 pc = texture2D(tPaint, vec2(u, 1.0 - uHV * (1.0 - e))).rgb;
      float mask = 1.0 - smoothstep(0.16, 0.42, pc.b - pc.r);
      float a = mask * uPaint * smoothstep(0.0, 0.05, e) * (1.0 - smoothstep(0.55, 0.9, e));
      vec3 c = mix(pc, uStorm * (0.55 + 0.9 * luma(pc)), uGloom * 0.85);
      c += uSunCol * pow(s, 10.0) * 0.18 * (1.0 - uGloom);
      P = c * a + P * (1.0 - a); A = a + A * (1.0 - a);
    }
    // Farhold's deck: a flat sheet overhead, crossing the sky downwind; cover = how much of the sky it takes
    if (uCover > 0.02 && h > 0.0) {
      vec2 q = d.xz / max(h, 0.07) * 0.55 + uOff;
      float n = texture2D(tDeck, q * 0.5).r * 0.62 + texture2D(tDeck, q * 1.3 + 3.7).r * 0.38;
      float cov = smoothstep(1.02 - uCover, 1.25 - uCover * 0.9, n + 0.12) * smoothstep(0.01, 0.16, h);
      float thick = smoothstep(0.45, 0.95, n);
      vec3 c = mix(uLit, uShade, thick * (0.4 + 0.6 * uCover));
      c = mix(c, uStorm * (0.7 + 0.5 * (1.0 - thick)), uGloom);
      c += uSunCol * pow(s, 9.0) * (1.0 - thick) * 0.35 * (1.0 - uGloom);   // a silver edge on thin cloud near the sun
      P = c * cov + P * (1.0 - cov); A = cov + A * (1.0 - cov);
    }
    // lightning: the clouds light up from inside
    P += uFlashCol * uFlash * (0.25 + 0.75 * A) * 0.9; A = max(A, uFlash * 0.5);
    gl_FragColor = vec4(A > 0.001 ? P / max(A, 0.001) : vec3(0.0), clamp(A, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createWeatherView(view, { heightAt, T = null, quality = 'medium', sound = null, seed = 7, wind = null } = {}) {
  const { scene, camera, renderer } = view;
  // T may be a function: the page swaps places (regions, 2026-11-27) and the weather must read the place drawn NOW
  const TT = () => (typeof T === 'function' ? T() : T);
  const G0 = WEATHER_GFX[quality] || WEATHER_GFX.medium;
  const gfx = { ...G0 };                                         // rain.js re-reads rainDrops / snowFlakes / debris each frame
  // ---- the wind: the game's ONE wind (render/wind.js — trees, leaves, grass and crops bend with it); the weather sets its
  // strength and gusts and the rain leans with it. Farhold's wind (by path) only stands in if it is missing.
  let oneWind = wind || ONE_WIND;
  const ownWind = createWind({ seed });
  const windOf = () => (oneWind && Number.isFinite(oneWind.dirX) ? oneWind : ownWind);

  // ---- rain, splashes, sheets, snow, blown leaves (Farhold)
  const precip = createPrecipitation(scene, gfx);
  const terrain = { heightAt: (x, z) => heightAt(x, z), waterAt: (x, z) => TT()?.waterAt?.(x, z) || null };

  // ---- the cloud layer (inside the sky dome, before the distant hills: an opaque-list mesh that blends itself)
  const paint = new THREE.TextureLoader().load(PAINT.url, t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; skyU.uReady.value = 1; }, undefined, () => {});
  const deckTex = cloudTile(seed * 977 + 3, G0.deck);
  const skyU = {
    tPaint: { value: paint }, tDeck: { value: deckTex }, uHV: { value: PAINT.horizonV }, uPaint: { value: 0 }, uCover: { value: 0 },
    uGloom: { value: 0 }, uVeil: { value: 0 }, uFlash: { value: 0 }, uReady: { value: 0 }, uOff: { value: new THREE.Vector2() },
    uSunDir: { value: view.sunDir }, uSunCol: { value: new THREE.Color('#ffd6a4') }, uLit: { value: new THREE.Color('#f3f5f9') },
    uShade: { value: new THREE.Color('#8a95a5') }, uStorm: { value: new THREE.Color('#3f4855') }, uHaze: { value: new THREE.Color('#d3dde2') },
    uFlashCol: { value: new THREE.Color('#dfe8ff') },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const skyLayer = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), skyMat);
  skyLayer.renderOrder = -9.5; skyLayer.frustumCulled = false; skyLayer.name = 'weather clouds';
  scene.add(skyLayer);

  // ---- the bolt: a ribbon facing you, drawn in the sky (inside the dome, so the far plane never cuts it)
  const SEGS = 44;
  const boltPos = new Float32Array(SEGS * 6 * 3);
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3)); boltGeo.setDrawRange(0, 0);
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e6eeff').multiplyScalar(3), fog: false, depthWrite: false, side: THREE.DoubleSide,
    transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.renderOrder = -9.4; bolt.frustumCulled = false; bolt.name = 'weather bolt';
  scene.add(bolt);

  // ---- the strike's light: made once, always in the scene, dark until a strike (rule 29)
  const flashLight = new THREE.DirectionalLight('#dbe6ff', 0);
  flashLight.castShadow = false; flashLight.name = 'weather lightning';
  scene.add(flashLight); scene.add(flashLight.target);

  // ---- puddles: flat discs on level ground near you that mirror the sky, growing the longer it rains
  const NP = G0.puddles;
  const pudTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 4, 32, 32, 31); r.addColorStop(0, '#fff'); r.addColorStop(0.55, '#fff'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const pudMat = new THREE.MeshStandardMaterial({ color: '#2e3a44', roughness: 0.04, metalness: 0.0, envMapIntensity: 2.6, transparent: true, opacity: 0, alphaMap: pudTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const puddles = NP ? new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), pudMat, NP) : null;
  if (puddles) { puddles.count = 0; puddles.frustumCulled = false; puddles.name = 'weather puddles'; puddles.renderOrder = 1; scene.add(puddles); }
  let pudT = 0;
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3();
  const hsh = (a, b, k) => { const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
  function placePuddles(cx, cz, size) {
    if (!puddles) return;
    const CELL = 7, R = 38; let n = 0;
    const i0 = Math.floor((cx - R) / CELL), i1 = Math.floor((cx + R) / CELL), k0 = Math.floor((cz - R) / CELL), k1 = Math.floor((cz + R) / CELL);
    for (let i = i0; i <= i1 && n < NP; i++) for (let k = k0; k <= k1 && n < NP; k++) {
      if (hsh(i, k, 1) > 0.2) continue;
      const x = (i + 0.2 + hsh(i, k, 2) * 0.6) * CELL, z = (k + 0.2 + hsh(i, k, 3) * 0.6) * CELL;
      if (Math.hypot(x - cx, z - cz) > R) continue;
      const w = TT()?.waterAt?.(x, z); if (w && w.depth > -0.2) continue;
      const y = heightAt(x, z), r = 0.7 + hsh(i, k, 4) * 1.5;
      if (Math.abs(heightAt(x + r, z) - y) > 0.08 || Math.abs(heightAt(x, z + r) - y) > 0.08 || Math.abs(heightAt(x - r, z) - y) > 0.08 || Math.abs(heightAt(x, z - r) - y) > 0.08) continue;   // level ground only
      const sz = r * size;
      puddles.setMatrixAt(n++, m4.compose(v3.set(x, y + 0.035, z), q4.identity(), s3.set(sz * (1 + hsh(i, k, 5) * 0.5), 1, sz)));
    }
    puddles.count = n; puddles.instanceMatrix.needsUpdate = true;
  }

  // ---- state
  const N = regionNumbers(['clear', null, 0, 1]);
  const state = { flash: 0, strikes: 0, lastStrike: null, wet: 0, preview: null, thunderQueued: 0 };
  let flash = 0, holdFlash = 0, restrike = -1, boltLife = 0, lastT = null, warm = 3, previewRow = null, previewSince = 0, localT = 0;
  const strikeDir = new THREE.Vector3(1, 0, 0);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), toCam = new THREE.Vector3(), side = new THREE.Vector3();
  const rainCol = new THREE.Color(), fogNow = new THREE.Color(), grey = new THREE.Color(WEATHER_LOOK.fogGrey), mistCol = new THREE.Color(WEATHER_LOOK.fogMist);
  let q = quality;

  /** Lay a fresh zig-zag (with a branch or two) from the cloud base to the ground, `dist` metres away at `angle`. */
  function drawBolt(angle, dist, s0) {
    let s = (s0 >>> 0) || 1; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const R = skyLayer.scale.x * 0.92, D = Math.min(dist, R), k = D / Math.max(1, dist);
    const cx = camera.position.x, cz = camera.position.z, gy = heightAt(cx, cz);
    const bx = cx + Math.cos(angle) * D, bz = cz + Math.sin(angle) * D;
    const top = gy + Math.max(60, 380 * k), base = gy - 4 * k, w = Math.max(0.6, D * 0.0045);
    let o = 0;
    const seg = (ax, ay, az, bx2, by, bz2, width) => {
      if (o + 18 > boltPos.length) return;
      tmpA.set(ax, ay, az); tmpB.set(bx2, by, bz2);
      toCam.copy(camera.position).sub(tmpA).normalize();
      side.copy(tmpB).sub(tmpA).cross(toCam).normalize().multiplyScalar(width);
      const quad = [tmpA.x - side.x, tmpA.y - side.y, tmpA.z - side.z, tmpA.x + side.x, tmpA.y + side.y, tmpA.z + side.z, tmpB.x + side.x, tmpB.y + side.y, tmpB.z + side.z,
        tmpA.x - side.x, tmpA.y - side.y, tmpA.z - side.z, tmpB.x + side.x, tmpB.y + side.y, tmpB.z + side.z, tmpB.x - side.x, tmpB.y - side.y, tmpB.z - side.z];
      boltPos.set(quad, o); o += 18;
    };
    const steps = 26, jit = (top - base) / steps * 0.9;
    let x = bx + (rnd() - 0.5) * jit * 4, y = top, z = bz + (rnd() - 0.5) * jit * 4;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps;
      const nx = bx + (x - bx) * 0.35 + (rnd() - 0.5) * jit * (1 - t * 0.6), ny = top + (base - top) * t, nz = bz + (z - bz) * 0.35 + (rnd() - 0.5) * jit * (1 - t * 0.6);
      seg(x, y, z, nx, ny, nz, w * (1.2 - t * 0.5));
      if (i > 3 && i < 18 && rnd() < 0.16) {                  // a branch that forks off and dies out
        let fx = nx, fy = ny, fz = nz; const dx = (rnd() - 0.5) * jit * 2.2, dz = (rnd() - 0.5) * jit * 2.2;
        for (let j = 0; j < 5; j++) { const gx = fx + dx + (rnd() - 0.5) * jit, gyy = fy - jit * 0.8, gz = fz + dz + (rnd() - 0.5) * jit; seg(fx, fy, fz, gx, gyy, gz, w * 0.45); fx = gx; fy = gyy; fz = gz; }
      }
      x = nx; y = ny; z = nz;
    }
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.setDrawRange(0, o / 3);
    strikeDir.set(Math.cos(angle), 0.55, Math.sin(angle)).normalize();
  }
  /** A strike: the bolt, the flash, and its thunder later. */
  function strike(st = null, { hold = 0 } = {}) {
    holdFlash = hold;
    const s = st || { angle: Math.random() * Math.PI * 2, dist: 200 + Math.random() * 900, restrike: 0.12, seed: (Math.random() * 1e9) | 0 };
    drawBolt(s.angle, s.dist, s.seed);
    const near = 1 - smooth(WEATHER_SETUP.strikeMetres[0], WEATHER_SETUP.strikeMetres[1], s.dist) * 0.65;
    flash = near; boltLife = 0.17; restrike = s.restrike > 0 ? s.restrike : -1;
    state.strikes++; state.lastStrike = { ...s, near };
    const snd = typeof sound === 'function' ? sound() : sound;
    if (snd?.play) {
      const delay = s.dist / 343, far = smooth(140, 1400, s.dist);
      try { snd.play('thunder', { at: delay, gain: 1.15 - far * 0.75, pitch: 1.04 - far * 0.24 }); state.thunderQueued++; } catch { /* no sound yet */ }
    }
  }

  const wx = {
    numbers: N, state, precip, skyLayer, bolt, flashLight, puddles, gfx,
    get wind() { return windOf(); },
    /** The one wind (render/wind.js) once it exists: rain leans with it and the weather sets it (setFromWeather). */
    setWind(w) { oneWind = w || null; },
    /** The map editor's picker: draw this weather here (rolling in over 3 s); null = back to the server's. */
    preview(key) { previewRow = key ? [N.key || 'clear', key, 0, 3, 1] : null; previewSince = 0; state.preview = key || null; },
    strike,
    setQuality(next) {
      q = next; const G = WEATHER_GFX[next] || WEATHER_GFX.medium;
      // never above what was made at start (no new buffers or shaders mid-game)
      gfx.rainDrops = Math.min(G.rainDrops, G0.rainDrops); gfx.snowFlakes = Math.min(G.snowFlakes, G0.snowFlakes); gfx.debris = Math.min(G.debris, G0.debris);
      warm = 3;                                                // a new after-effect chain: draw everything once while hidden
    },
    stats() {
      return { quality: q, rainDrops: precip.streaks?.mesh.visible ? precip.streaks.mesh.geometry.instanceCount : 0, splashes: precip.splashes ? precip.splashes.count : 0,
        sheets: !!precip.sheets?.mesh.visible, puddles: puddles?.count || 0, strikes: state.strikes, weather: N.key, wet: +state.wet.toFixed(2) };
    },
    /**
     * dt seconds. wire/seed from the world state (wstate.wx / wxs), time = the world clock in seconds (for strikes and
     * a change rolling in between messages: `ahead` = time - sentAt), at = where the player (or the editor camera) is.
     */
    update(dt, { wire = null, seed: wseed = 1, time = null, sentAt = null, at = null } = {}) {
      localT += dt;
      const wt = Number.isFinite(time) ? time : localT;
      const ax = at?.x ?? camera.position.x, az = at?.z ?? camera.position.z;
      // what is drawn: the server's weather here (two regions blended over a border), or the editor's preview
      if (previewRow) { previewSince += dt; regionNumbers(previewRow, previewSince, N); N.region = null; }
      else if (wire) { const n = numbersAt(wire, TT(), ax, az, Number.isFinite(sentAt) && Number.isFinite(time) ? Math.max(0, time - sentAt) : 0); Object.assign(N, n); }
      else regionNumbers(['clear', null, 0, 1], 0, N);
      // the wind: weather sets its strength; rain, clouds and cloud shadows follow it
      const W = windOf();
      // World Forge's wind is 0..1; the one wind's storm is ~1.35 — scaled so a storm bends the woods hardest
      if (oneWind?.setFromWeather) oneWind.setFromWeather({ strength: N.wind * 1.55, gust: 0.3 + N.wind * 0.65 }); else ownWind.update(dt, N.wind);
      ATMOS.set({ wind: [W.dirX, W.dirZ] });
      // wetness: soaks in over ~40 s of rain, dries over ~4 minutes
      state.wet = clamp01(state.wet + (N.rain > 0.1 ? dt * N.rain / 40 : -dt / 240));
      // ---- rain etc. (Farhold)
      fogNow.copy(scene.fog.color);
      rainCol.copy(fogNow).lerp(new THREE.Color('#8fa2b6'), 0.5).multiplyScalar(0.5 + 0.2 * (1 - N.gloom));   // drops darker than the sky: rings and streaks never read as white chalk
      precip.update(dt, { camera, weather: N, wind: W, terrain, colour: rainCol, flash: flash * flash, viewHeight: view.size?.h || 720, fogColour: fogNow, biome: 'temperateForest', daylight: 1 - N.gloom * 0.4 });
      // Farhold's splash rings are drawn for a darker world: here they are fainter and take the rain's own colour
      if (precip.splashes) { precip.splashes.uniforms.uAmount.value *= 0.42; precip.splashes.uniforms.uColor.value.copy(rainCol).multiplyScalar(1.3); }
      if (q === 'low') { if (precip.splashes) precip.splashes.mesh.visible = false; if (precip.sheets) precip.sheets.mesh.visible = false; }
      // ---- clouds
      const L = skyLayer;
      L.position.copy(view.sky.position); L.scale.setScalar(view.sky.scale.x * 0.97);
      skyU.uPaint.value = smooth(0.12, 0.5, N.cloud) * (1 - smooth(0.7, 1, N.cloud) * 0.5) * (1 - smooth(0.3, 0.8, N.fog));
      skyU.uCover.value = smooth(0.4, 1, N.cloud) * (1 - smooth(0.4, 0.9, N.fog) * 0.7);
      skyU.uGloom.value = N.gloom;
      skyU.uVeil.value = Math.min(0.96, smooth(0.62, 0.98, N.cloud) * 0.8 + smooth(0.3, 0.9, N.fog) * 0.9);
      skyU.uHaze.value.copy(scene.fog.color);
      skyU.uSunCol.value.copy(view.sun.color);
      const drift = 0.0025 + W.strength * 0.012;
      skyU.uOff.value.x -= W.dirX * drift * dt * 3; skyU.uOff.value.y -= W.dirZ * drift * dt * 3;
      // ---- lightning (strike times from the world's seed + clock: the same for everyone in the world)
      if (lastT == null || wt < lastT || wt - lastT > 5) lastT = wt;
      if (wt > lastT) {
        const due = strikesBetween(previewRow ? 1 : wseed, lastT, wt, N.lightning);
        lastT = wt;
        if (due.length) strike(due[due.length - 1]);
      }
      if (restrike > 0) { restrike -= dt; if (restrike <= 0) { flash = Math.max(flash, (state.lastStrike?.near ?? 1) * 0.8); boltLife = 0.12; restrike = -1; } }
      if (holdFlash > 0) { holdFlash -= dt; boltLife = Math.max(boltLife, 0.17); flash = Math.max(flash, state.lastStrike?.near ?? 1); }   // tests: hold a strike for a picture
      if (boltLife > 0) { boltLife -= dt; boltMat.color.set('#e6eeff').multiplyScalar(3 * clamp01(boltLife / 0.17)); } else boltGeo.setDrawRange(0, 0);
      flash = Math.max(0, flash - dt * 4.5);
      if (holdFlash > 0) flash = Math.max(flash, state.lastStrike?.near ?? 1);
      state.flash = flash * flash;
      skyU.uFlash.value = state.flash;
      flashLight.intensity = state.flash * WEATHER_LOOK.flashLight;
      flashLight.position.copy(camera.position).addScaledVector(strikeDir, 120); flashLight.target.position.copy(camera.position);
      // ---- puddles
      if (puddles) {
        pudT -= dt;
        const size = smooth(0.05, 0.7, state.wet);
        if (pudT <= 0) { pudT = 0.6; if (size > 0.01) placePuddles(camera.position.x, camera.position.z, size); else puddles.count = 0; }
        pudMat.opacity = size * 0.85;
      }
      // ---- warm-up: the first frames after start (or a quality change) draw every weather piece once, invisibly, so
      // their shaders are built now and never when the first storm arrives mid-game (rule 29)
      if (warm > 0) {
        warm--;
        for (const m of [precip.streaks, precip.splashes, precip.sheets, precip.snow, precip.debris]) if (m) { m.mesh.visible = true; if (m.uniforms.uAmount) m.uniforms.uAmount.value = 0; }
        if (boltGeo.drawRange.count === 0) { boltPos.fill(0, 0, 18); boltGeo.setDrawRange(0, 6); boltGeo.attributes.position.needsUpdate = true; boltMat.color.setRGB(0, 0, 0); }
        if (puddles && !puddles.count) { puddles.count = 1; puddles.setMatrixAt(0, m4.makeScale(0.001, 0.001, 0.001)); puddles.instanceMatrix.needsUpdate = true; }
      }
      return N;
    },
    /** The light and the air under this weather — after the Look numbers and the zones each frame (view.afterWeather). */
    apply() {
      const g = N.gloom, f = N.fog, Lk = WEATHER_LOOK;
      mul(renderer, 'toneMappingExposure', 1 - Lk.exposure * g);
      mul(view.sun, 'intensity', 1 - Math.max(Lk.sun * g, Lk.overcastSun * smooth(0.6, 1, N.cloud)));
      mul(view.hemi, 'intensity', 1 - Lk.fill * g, state.flash * Lk.flashFill);
      mul(scene, 'environmentIntensity', 1 - Lk.skyLight * g);         // the sunny sky's reflection fades from water and shiny things
      mul(scene.fog, 'near', 1 - (1 - Lk.fogNear) * Math.pow(f, 1.3));
      mul(scene.fog, 'far', 1 - (1 - Lk.fogFar) * Math.pow(f, 1.2));
      tint(scene.fog.color, 'fog', grey, g * Lk.fogGreyMix);
      if (f > 0.05) scene.fog.color.lerp(mistCol, smooth(0.2, 0.9, f) * Lk.fogMistMix);
      if (scene.background?.isColor) scene.background.copy(scene.fog.color);
      const mist = ATMOS.uniforms.uAtMist.value, cl = ATMOS.uniforms.uAtCloud.value;
      mul(mist, 'x', 1, Lk.mist * f); mul(mist, 'w', 1, Lk.mistMax * smooth(0.5, 1, f));
      // cloud shadows: more of them on a broken-cloud day, gone when the whole sky is grey (no sun to cast them)
      const broken = smooth(0.15, 0.5, N.cloud) * (1 - smooth(0.75, 1, N.cloud));
      mul(cl, 'x', 1 - smooth(0.75, 1, N.cloud) * 0.8, Lk.cloudShade * broken);
      mul(cl, 'w', 1, -0.12 * broken);
      const grade = view.post?.grade;
      if (grade) mul(grade.uSat, 'value', 1 - Lk.saturation * g);
      ATMOS.set({ wet: state.wet * (view.lookFx?.wet || 0) });       // the Look's wet look: soaked ground darkens in the rain (0 in Classic)
    },
    dispose() {
      precip.dispose();
      for (const o of [skyLayer, bolt, flashLight, flashLight.target, puddles]) if (o) scene.remove(o);
      skyLayer.geometry.dispose(); skyMat.dispose(); deckTex.dispose(); paint.dispose(); boltGeo.dispose(); boltMat.dispose();
      if (puddles) { puddles.geometry.dispose(); pudMat.dispose(); pudTex.dispose(); }
    },
  };

  // Scaling a number that something else may or may not reset each frame: remember the value we wrote; if it is still
  // there next frame, scale from the base we started with (no compounding); if someone else wrote it, that is the base.
  const mem = new WeakMap();
  function mul(obj, key, k, add = 0) {
    if (!obj) return;
    let m = mem.get(obj); if (!m) { m = {}; mem.set(obj, m); }
    const cur = obj[key], st = m[key];
    const base = st && cur === st.set ? st.base : cur;
    obj[key] = base * k + add;
    m[key] = { base, set: obj[key] };
  }
  const tintMem = {};
  function tint(col, id, to, k) {
    const st = tintMem[id];
    const same = st && col.r === st.set.r && col.g === st.set.g && col.b === st.set.b;
    const base = same ? st.base : col.clone();
    col.copy(base).lerp(to, clamp01(k));
    tintMem[id] = { base, set: col.clone() };
  }
  return wx;
}
