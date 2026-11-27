// Tree Kit — ONE wind for everything that moves in it (trees, grass, crops, rain). The idea is Farhold's js/wind.js
// ("four consumers, four directions, none of them agreeing" — so everything asks one object), rebuilt for shaders:
// the wind is a handful of UNIFORMS (numbers handed to the graphics card), and every bend, sway and flutter is worked
// out in the vertex shader. Nothing is done per tree on the processor, and changing the wind never rebuilds a shader
// (lessons rule 29: only the numbers change).
//
//   const wind = createWind({ seed })
//   wind.update(dt)                        once a frame: eases toward the target, runs the clock, wanders the direction
//   wind.set({ angle, strength, gust, waveLength, waveSpeed })   the target (angle in radians: 0 blows toward +x,
//                                          PI/2 toward +z; strength 0 calm … 1 gale … 1.5 storm; gust 0 steady … 1 gusty)
//   wind.now({ … })                        the same, but jump there at once (pages, tests)
//   wind.setFromWeather(w)                 the weather's hook (safe to call every frame): { kind | key: 'clear'|'cloudy'|
//                                          'rain'|'storm'|'fog'|'snow', wind?: 0..1.5, angle?: radians, gust?: 0..1 } —
//                                          numbers win over the kind; ignored while something holds the wind
//   wind.hold(v) / wind.hold(null)         pin the wind (a page slider, a test, ?wind=storm): the weather cannot move it
//   wind.dirX / dirZ / strength / gust / angle / time   read-only, as drawn (the same names as Farhold's wind object,
//                                          so Farhold's rain code reads this one unchanged)
//   wind.storm(on = true)                  a storm now (strength 1.35, gusty) / back to what was set before
//   wind.state                             { angle, dirX, dirZ, strength, gust, time } as drawn this frame
//   wind.pushAt(x, z)                      the push (0..~2) at a world spot right now — the same sum as the shader's
//   wind.rainVelocity(fall = 30)           metres a second for rain streaks (leans downwind, harder in gusts)
//   wind.uniforms                          { uWind, uWindWave } — hand these to any shader
//   WIND_GLSL                              the shader functions: owWindPush(xz), owTreeBend(...), owGrassLean(...)
//   applyTreeWind(material, wind)          a tree material (bark, leaf cards, tufts, their shadow materials) bends
//
// THE MODEL. uWind = (dirX, dirZ, strength, gustiness); uWindWave = (wave length m, wave speed m/s, clock s, sway).
//  - Gusts are waves that ROLL ACROSS THE LAND downwind: a wave front every `waveLength` metres moving at `waveSpeed`,
//    its line wobbling so it is not a ruler-straight band — you see a gust come through the far wood, then yours.
//  - A tree bends from its base: the offset grows with (height share)², so the root stays put and the top travels
//    furthest; how far is the species' gale bend (data/species.json wind.stiffness → js/build.js galeBend) × push.
//    It sways about that lean at the species' own speed (wind.sway, per second: an ancient oak 0.28, a birch 1.0).
//  - Branches (aWind.x 0.2-0.4) swing sideways a little faster; leaf tufts (aWind.x 0.4-1) flutter fastest, by
//    wind.flutter. Every part reads the SAME push at the tree's base, so a whole tree moves as one.
//  - Grass leans the same way by the same push (owGrassLean), so a gust runs over the meadow and then the wood.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hash01(seed, salt) {
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** What each kind of weather does to the wind when the weather gives no numbers of its own. */
export const WEATHER_WIND = Object.freeze({
  clear: { strength: 0.22, gust: 0.35 },
  cloudy: { strength: 0.38, gust: 0.45 },
  fog: { strength: 0.08, gust: 0.15 },
  rain: { strength: 0.6, gust: 0.6 },
  snow: { strength: 0.45, gust: 0.4 },
  storm: { strength: 1.35, gust: 0.95 },
});
/** Named winds for the Tree Kit page's buttons (and tests). */
export const WIND_PRESETS = Object.freeze({
  calm: { strength: 0.05, gust: 0.1 },
  breeze: { strength: 0.3, gust: 0.4 },
  windy: { strength: 0.75, gust: 0.65 },
  gale: { strength: 1.0, gust: 0.8 },
  storm: { strength: 1.35, gust: 0.95 },
});

export function createWind({ seed = 1, strength = 0.3, gust = 0.4, angle = null, waveLength = 70, waveSpeed = 11 } = {}) {
  const base = angle ?? hash01(seed, 1) * TAU;
  const ph1 = hash01(seed, 2) * TAU, ph2 = hash01(seed, 3) * TAU;
  const uniforms = { uWind: { value: new THREE.Vector4() }, uWindWave: { value: new THREE.Vector4(waveLength, waveSpeed, 0, 1) } };
  const target = { angle: base, strength, gust, waveLength, waveSpeed, wander: angle == null };
  const state = { angle: base, dirX: Math.cos(base), dirZ: Math.sin(base), strength, gust, time: 0 };
  let beforeStorm = null, held = null;

  function write() {
    state.dirX = Math.cos(state.angle); state.dirZ = Math.sin(state.angle);
    uniforms.uWind.value.set(state.dirX, state.dirZ, state.strength, state.gust);
    uniforms.uWindWave.value.set(target.waveLength, target.waveSpeed, state.time, 1);
  }
  const take = v => {
    if (v.angle != null) { target.angle = v.angle; target.wander = false; }
    if (v.dirX != null && v.dirZ != null) { target.angle = Math.atan2(v.dirZ, v.dirX); target.wander = false; }
    if (v.strength != null) target.strength = clamp(+v.strength, 0, 2);
    if (v.gust != null) target.gust = clamp(+v.gust, 0, 1);
    if (v.waveLength != null) target.waveLength = clamp(+v.waveLength, 10, 400);
    if (v.waveSpeed != null) target.waveSpeed = clamp(+v.waveSpeed, 0, 60);
    if (v.wander != null) target.wander = !!v.wander;
  };
  const W = {
    uniforms, state, target,
    update(dt = 0) {
      const d = clamp(dt, 0, 0.25);
      state.time += d;
      // the direction wanders slowly round its target (two long sines), unless something holds it
      const want = target.wander ? target.angle + 0.35 * Math.sin(state.time * 0.011 + ph1) + 0.15 * Math.sin(state.time * 0.037 + ph2) : target.angle;
      let da = ((want - state.angle) % TAU + TAU * 1.5) % TAU - TAU / 2;
      state.angle += da * Math.min(1, d * 0.5);
      // a few seconds to follow: a storm rolls in rather than switching on
      state.strength += (target.strength - state.strength) * Math.min(1, d * 0.45);
      state.gust += (target.gust - state.gust) * Math.min(1, d * 0.45);
      write();
      return W;
    },
    set(v = {}) { take(v); return W; },
    now(v = {}) { take(v); state.angle = target.angle; state.strength = target.strength; state.gust = target.gust; write(); return W; },
    setFromWeather(w = {}) {
      if (held) return W;
      const k = WEATHER_WIND[w.kind ?? w.key] || null;
      const v = { ...(k || {}) };
      if (w.wind != null) v.strength = w.wind;
      if (w.strength != null) v.strength = w.strength;
      if (w.gust != null) v.gust = w.gust;
      if (w.angle != null) v.angle = w.angle;
      beforeStorm = null;
      return W.set(v);
    },
    storm(on = true) {
      if (on) { if (!beforeStorm) beforeStorm = { strength: target.strength, gust: target.gust }; W.set(WIND_PRESETS.storm); }
      else if (beforeStorm) { W.set(beforeStorm); beforeStorm = null; }
      return W;
    },
    get storming() { return !!beforeStorm; },
    hold(v) { held = v ? { ...v } : null; if (v) W.now(v); return W; },
    get held() { return held; },
    get dirX() { return state.dirX; }, get dirZ() { return state.dirZ; }, get angle() { return state.angle; },
    get strength() { return state.strength; }, get gust() { return state.gust; }, get time() { return state.time; },
    /** The push at a world spot right now — the same sum as owWindPush in the shader (tests compare the two). */
    pushAt(x, z) { return state.strength * gustAt(x, z, state, target); },
    rainVelocity(fall = 30) {
      const push = state.strength * (5 + state.gust * 7);
      return { x: state.dirX * push, y: -fall, z: state.dirZ * push };
    },
  };
  write();
  return W;
}

function gustAt(x, z, s, t) {
  const along = x * s.dirX + z * s.dirZ, across = -x * s.dirZ + z * s.dirX;
  const ph = (along - t.waveSpeed * s.time) / t.waveLength * TAU;
  let w = Math.sin(ph + Math.sin(across * 0.013) * 1.7) * 0.5 + 0.5;
  w = w * w * (3 - 2 * w);
  const w2 = Math.sin(ph * 2.3 + across * 0.031 + 1.3) * 0.5 + 0.5;
  return 1 + s.gust * (0.35 + 1.3 * (w * 0.75 + w2 * 0.25) - 1);
}

// ---------------------------------------------------------------- the shader side
export const WIND_GLSL = /* glsl */`
uniform vec4 uWind;      // dirX, dirZ, strength, gustiness
uniform vec4 uWindWave;  // wave length m, wave speed m/s, clock s, 1
float owGustAt(vec2 xz) {
  vec2 d = uWind.xy;
  float along = dot(xz, d), across = -xz.x * d.y + xz.y * d.x;
  float ph = (along - uWindWave.y * uWindWave.z) / uWindWave.x * 6.2831853;
  float w = sin(ph + sin(across * 0.013) * 1.7) * 0.5 + 0.5;
  w = w * w * (3.0 - 2.0 * w);
  float w2 = sin(ph * 2.3 + across * 0.031 + 1.3) * 0.5 + 0.5;
  return 1.0 + uWind.w * (0.35 + 1.3 * (w * 0.75 + w2 * 0.25) - 1.0);
}
/** How hard the wind pushes at a world spot right now: 0 calm, ~1 a gale, more in a storm's gust. */
float owWindPush(vec2 xz) { return uWind.z * owGustAt(xz); }
/**
 * A tree's wind offset, in the tree's OWN units, for a vertex at p (own units, Y up from the root).
 * sway = aSway (height, gale bend share, sway speed /s, flutter); aw = aWind (local weight 0 trunk … 1 leaf tip, phase);
 * base = the tree's root in world x/z; dir = the wind direction turned into the tree's own frame.
 */
vec3 owTreeBend(vec3 p, vec4 sway, vec2 aw, vec2 base, vec2 dir) {
  float H = max(sway.x, 0.01);
  float yf = clamp(p.y / H, 0.0, 1.25);
  float push = owWindPush(base);
  float t = uWindWave.z;
  float tph = base.x * 0.137 + base.y * 0.091;
  float w = sway.z * 6.2831853;
  float osc = sin(t * w + tph) * 0.62 + sin(t * w * 1.73 + tph * 1.3) * 0.24;
  // a steady lean downwind plus a sway about it; still air keeps a faint breathing
  float lean = push * (0.72 + 0.34 * osc) + 0.035 * osc;
  float bend = lean * sway.y * H * yf * yf;
  vec3 side = vec3(-dir.y, 0.0, dir.x);
  vec3 off = vec3(dir.x, 0.0, dir.y) * bend;
  off.y -= bend * bend / H * 0.6 * yf;                       // the top swings on an arc, it does not stretch
  // branches swing sideways, leaves flutter: by the vertex's own weight, faster than the trunk
  float br = smoothstep(0.15, 0.45, aw.x), lf = smoothstep(0.38, 1.0, aw.x);
  float ph = aw.y * 6.2831853 + tph * 3.0;
  float bs = sin(t * w * 2.1 + ph) * (0.25 + push * 0.9);
  off += side * bs * br * H * 0.006 * yf;
  float fl = sin(t * (w * 3.3 + 4.0) + ph * 5.0 + p.x * 0.9 + p.z * 0.7) * 0.6 + sin(t * (w * 5.1 + 6.0) + ph * 3.0) * 0.4;
  off += (side * 0.7 + vec3(0.0, 0.55, 0.0) + vec3(dir.x, 0.0, dir.y) * 0.4) * fl * lf * sway.w * (0.05 + push * 0.55) * H * 0.012;
  return off;
}
/** Grass and crops: how far a blade's tip leans (world x/z offset) for blade height share k at world spot xz. */
vec2 owGrassLean(vec2 xz, float k) {
  float push = owWindPush(xz);
  float t = uWindWave.z;
  float osc = sin(t * 1.9 + xz.x * 0.31 + xz.y * 0.23) * 0.6 + sin(t * 3.3 + xz.x * 0.57) * 0.3;
  vec2 d = uWind.xy, side = vec2(-d.y, d.x);
  return (d * (0.03 + push * 0.32) * (0.75 + 0.35 * osc) + side * osc * (0.02 + push * 0.05)) * k;
}
`;

/** The vertex lines that bend one tree part (after #include <begin_vertex>). Needs attributes aWind, aSway. */
const TREE_BEND = /* glsl */`
  {
    mat4 owM = modelMatrix;
    #ifdef USE_INSTANCING
      owM = modelMatrix * instanceMatrix;
    #endif
    vec3 owD = transpose(mat3(owM)) * vec3(uWind.x, 0.0, uWind.y);
    vec2 owDir = normalize(owD.xz + vec2(1e-5, 0.0));
    transformed += owTreeBend(transformed, aSway, aWind, owM[3].xz, owDir);
  }`;

/**
 * Make a tree material bend in `wind` (bark, leaf cards, tufts, and their shadow materials — give the shadow ones the
 * same treatment or a bent tree throws a straight shadow). Adds to any onBeforeCompile already there; the shader key
 * grows by '|tk-wind' so a windless copy of the same material never shares the program by mistake.
 */
export function applyTreeWind(material, wind) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, wind.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aWind; attribute vec4 aSway;\n' + WIND_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + TREE_BEND);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|tk-wind';
  material.userData.treeWind = true;
  return material;
}
