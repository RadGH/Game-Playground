// Water shine for the Look setting (world-tools round 2026-11-26, 4a: "water with reflections + shoreline foam +
// ripples"). Hooks the water material once at start: the code is always there and its strength is a uniform, so picking
// a preset only changes a number (lessons rule 29) — and at strength 0 the water is exactly today's (Classic).
//   * reflections  a stronger mirror of the sky at a low angle (Fresnel), from the scene's sky light
//   * foam         a soft broken white band where the water is shallow (the `aDepth` attribute: metres of water under
//                  each vertex, from the terrain's own water grid — the same numbers the server swims with, rule 22)
//   * ripples      the ripple normal map pushed harder and a second, finer set crossing it
//
//   addWaterDepth(geometry, depths)          one depth per vertex (render/ground.js, when it builds the water)
//   hookWaterLook(material)                  once, before the material is first drawn
//   WATER_LOOK.uniforms.uOwShine.value = 0..1   the Look's `water` effect strength
import * as THREE from 'three';

export const WATER_LOOK = {
  uniforms: { uOwShine: { value: 0 }, uOwWaterT: { value: 0 } },
  tick(t) { WATER_LOOK.uniforms.uOwWaterT.value = t; },
};

export function addWaterDepth(geometry, depths) {
  geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1));
}

export function hookWaterLook(material) {
  const own = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    own?.call(material, shader, r);
    Object.assign(shader.uniforms, WATER_LOOK.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vOwDepth;\nvarying vec3 vOwWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOwDepth = aDepth;\nvOwWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uOwShine, uOwWaterT; varying float vOwDepth; varying vec3 vOwWP;
        float owWH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float owWN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(owWH(i), owWH(i + vec2(1, 0)), f.x), mix(owWH(i + vec2(0, 1)), owWH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // finer ripples crossing the map's own (only with the Look's water effect on)
        if (uOwShine > 0.001) {
          vec2 q = vOwWP.xz * 1.7 + vec2(uOwWaterT * 0.6, -uOwWaterT * 0.45);
          vec2 dn = vec2(owWN(q + vec2(0.1, 0.0)) - owWN(q - vec2(0.1, 0.0)), owWN(q + vec2(0.0, 0.1)) - owWN(q - vec2(0.0, 0.1)));
          normal = normalize(normal + vec3(dn.x, 0.0, dn.y) * 0.35 * uOwShine);
        }`)
      .replace('#include <opaque_fragment>', `
        if (uOwShine > 0.001) {
          // a mirror at a low angle: the sky's colour, more the flatter you look across the water
          vec3 V = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(normal, -V)), 0.0, 1.0), 4.0);
          #ifdef USE_FOG
            outgoingLight = mix(outgoingLight, outgoingLight + fogColor * 0.55, fres * uOwShine);
          #endif
          // foam: a broken band where the water is shallow, drifting slowly
          float n = owWN(vOwWP.xz * 1.3 + uOwWaterT * 0.15) * 0.6 + owWN(vOwWP.xz * 3.1 - uOwWaterT * 0.2) * 0.4;
          float foam = (1.0 - smoothstep(0.05, 0.38, vOwDepth)) * smoothstep(0.42, 0.72, n);
          outgoingLight = mix(outgoingLight, vec3(0.88, 0.92, 0.94), foam * 0.75 * uOwShine);
          diffuseColor.a = max(diffuseColor.a, foam * uOwShine);
        }
        #include <opaque_fragment>`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '|owWaterLook';
}
