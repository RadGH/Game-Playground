// The air between you and the world, on EVERY material that has fog (owner 2026-11-24 environment round):
//   * height fog — a mist that pools in low ground and thins with height, on top of the horizon-coloured distance fog
//   * cloud shadows — slow soft patches of shade drifting over ground, trees, buildings and heroes alike, the same clouds
//     for all of them (a shadow that only touched the ground would slide under the houses)
// Done once for the whole page by wrapping Material.onBeforeCompile: every material's own hook still runs first and keeps
// its own program identity (customProgramCacheKey / its text), then the fog chunk gains the two terms. Nothing toggles
// at run time (lessons rule 29): the strength numbers are uniforms, so the debug panel and quality changes only set values.
//
//   installAtmos()             call once before any material compiles
//   ATMOS.set({ ... })         numbers: cloud { strength, scale, speed, cover }, mist { density, base, falloff, max }, wet 0..1
//   ATMOS.tick(seconds)        advance the clouds
import * as THREE from 'three';

const U = {
  uAtTime: { value: 0 },
  uAtCloud: { value: new THREE.Vector4(0.2, 1 / 170, 1.6, 0.56) },   // strength, 1/size (per metre), speed (m/s), cover (noise cut)
  uAtWind: { value: new THREE.Vector2(0.8, 0.6) },
  // first tune (0.0035 / max 0.5) veiled whole towns in grey: thin, and only in really low ground
  uAtMist: { value: new THREE.Vector4(0.0012, 2, 0.25, 0.22) },       // density (per metre), base height, falloff (per metre up), max
  uAtWet: { value: 0 },                                               // the Look's wet look in rain: 0 = dry (today), 1 = soaked
};
export const ATMOS = {
  uniforms: U,
  set({ cloud, mist, wind, wet } = {}) {
    if (wet != null) U.uAtWet.value = Math.max(0, Math.min(1, wet));
    if (cloud) { const v = U.uAtCloud.value; v.set(cloud.strength ?? v.x, cloud.scale ? 1 / cloud.scale : v.y, cloud.speed ?? v.z, cloud.cover ?? v.w); }
    if (mist) { const v = U.uAtMist.value; v.set(mist.density ?? v.x, mist.base ?? v.y, mist.falloff ?? v.z, mist.max ?? v.w); }
    if (wind) U.uAtWind.value.set(wind[0], wind[1]).normalize();
  },
  tick(t) { U.uAtTime.value = t; },
};

const VERT_PARS = '#ifdef USE_FOG\n  varying vec3 vAtWorld;\n#endif';
// the world position from the view-space one (row-vector × view = the inverse rotation; cheap, no inverse())
const VERT = '#ifdef USE_FOG\n  vAtWorld = cameraPosition + ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif';
const FRAG_PARS = `#ifdef USE_FOG
  varying vec3 vAtWorld;
  uniform float uAtTime, uAtWet; uniform vec4 uAtCloud; uniform vec2 uAtWind; uniform vec4 uAtMist;
  float atHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float atNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(atHash(i), atHash(i + vec2(1, 0)), f.x), mix(atHash(i + vec2(0, 1)), atHash(i + vec2(1, 1)), f.x), f.y); }
  float atClouds(vec2 p){ p = p * uAtCloud.y - uAtWind * uAtTime * uAtCloud.z * uAtCloud.y;
    float n = atNoise(p) * 0.55 + atNoise(p * 2.07 + 5.3) * 0.3 + atNoise(p * 4.3 + 1.7) * 0.15;
    return smoothstep(uAtCloud.w, uAtCloud.w + 0.2, n); }
#endif`;
const FRAG = `#ifdef USE_FOG
  {
    // cloud shade first (it is light that does not arrive), then the mist, then the distance fog over both
    gl_FragColor.rgb *= 1.0 - uAtCloud.x * atClouds(vAtWorld.xz);
    // wet look (rain + the Look's wet effect): soaked ground, walls and roofs go darker and a touch richer in colour
    if (uAtWet > 0.001) { vec3 atC = gl_FragColor.rgb; float atL = dot(atC, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor.rgb = mix(atC, mix(vec3(atL), atC, 1.18) * 0.74, uAtWet); }
    float atMist = 1.0 - exp(-uAtMist.x * vFogDepth * exp(-max(vAtWorld.y - uAtMist.y, 0.0) * uAtMist.z));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, min(atMist, uAtMist.w));
  }
#endif`;

let installed = false;
export function installAtmos() {
  if (installed) return; installed = true;
  const proto = THREE.Material.prototype;
  const base = proto.onBeforeCompile;
  Object.defineProperty(proto, 'onBeforeCompile', {
    configurable: true,
    get() {
      const own = this._atOwn || base;
      const wrap = (shader, renderer) => {
        own.call(this, shader, renderer);
        if (!shader.fragmentShader.includes('#include <fog_fragment>') || !shader.vertexShader.includes('#include <fog_vertex>')) return;
        if (shader.vertexShader.includes('vAtWorld')) return;     // a hook that chains to an earlier one already got it
        shader.uniforms.uAtTime = U.uAtTime; shader.uniforms.uAtWet = U.uAtWet; shader.uniforms.uAtCloud = U.uAtCloud; shader.uniforms.uAtWind = U.uAtWind; shader.uniforms.uAtMist = U.uAtMist;
        shader.vertexShader = shader.vertexShader.replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n' + VERT_PARS).replace('#include <fog_vertex>', '#include <fog_vertex>\n' + VERT);
        shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + FRAG_PARS).replace('#include <fog_fragment>', FRAG + '\n#include <fog_fragment>');
      };
      // three.js names a program by this function's text when a material has no customProgramCacheKey: keep it the
      // material's own text, so two materials with different hooks never share one compiled program
      wrap.toString = () => own.toString() + '/atmos';
      return wrap;
    },
    set(fn) { this._atOwn = fn; },
  });
}
