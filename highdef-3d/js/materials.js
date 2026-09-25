// One place where every material in the world gets its extras bolted on.
//
// Three things need to happen to almost every material here, and all three want to edit the same
// shader, so they have to be applied together or the last one wins:
//
//   1. Cascaded shadows (the CSM addon replaces `material.onBeforeCompile` outright, so anything
//      else that wants that hook has to chain onto it rather than assign over it).
//   2. Wind sway — plants lean and shiver. This is a vertex-shader push using the `aWind` attribute
//      that the model kits write into every geometry.
//   3. Our own atmospheric fog, which replaces three's linear/exponential fog with height fog that
//      also glows where you look toward the sun.
//
// `enhance(material, opts)` does all of it. Everything in this experiment goes through it.

import * as THREE from 'three';

/**
 * Uniforms shared by every patched material. Because the same uniform OBJECTS are handed to each
 * shader, changing `SHARED.uTime.value` once updates the whole world — there is no per-material
 * bookkeeping and nothing can fall out of step.
 */
export const SHARED = {
  uTime:          { value: 0 },
  uWindDir:       { value: new THREE.Vector3(0.82, 0, 0.57) },
  uWindStrength:  { value: 1.0 },
  uWindSpeed:     { value: 1.0 },
  // atmosphere — set from atmosphere.js, read by the fog chunk below
  hdFogGround:    { value: new THREE.Color(0x9fb0bd) },
  hdFogSky:       { value: new THREE.Color(0xc8d8e8) },
  hdFogSun:       { value: new THREE.Color(0xffd9a0) },
  hdSunDir:       { value: new THREE.Vector3(0.4, 0.6, 0.4) },
  hdFogDensity:   { value: 0.010 },
  hdFogHeight:    { value: 55.0 },
  hdFogBase:      { value: 0.0 },
  hdFogMax:       { value: 0.94 },
  hdFogSunPower:  { value: 8.0 },
};

let fogInstalled = false;

/**
 * Swap three's fog chunks for ours. This is global to the three module, but everything is behind
 * `#ifdef HD_FOG`, so a material that has not been enhanced keeps the stock behaviour.
 *
 * The height fog uses the usual closed-form integral: if density falls off exponentially with
 * height, the total fog along a straight ray has an exact answer, so there is no marching and no
 * banding. On top of that, looking toward the sun mixes in a warm colour, which is what makes a
 * hazy morning read as a hazy morning instead of grey soup.
 */
export function installFog() {
  if (fogInstalled) return;
  fogInstalled = true;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  #ifdef HD_FOG
    uniform vec3  hdFogGround;
    uniform vec3  hdFogSky;
    uniform vec3  hdFogSun;
    uniform vec3  hdSunDir;
    uniform float hdFogDensity;
    uniform float hdFogHeight;
    uniform float hdFogBase;
    uniform float hdFogMax;
    uniform float hdFogSunPower;
  #endif
#endif`;

  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef HD_FOG
    // Rebuild the world position of this pixel from the view-space one. The upper 3x3 of
    // viewMatrix is a pure rotation, so multiplying from the right is the same as multiplying by
    // its inverse — and it saves an inverse() call.
    vec3  hdOffset = ( -vViewPosition ) * mat3( viewMatrix );
    float hdDist   = length( hdOffset );
    vec3  hdDir    = hdDist > 1e-4 ? hdOffset / hdDist : vec3( 0.0, 0.0, -1.0 );

    float hStart = clamp( cameraPosition.y - hdFogBase, -80.0, 4000.0 );
    float k      = 1.0 / max( hdFogHeight, 0.001 );
    float dy     = hdDir.y;
    float integral;
    if ( abs( dy ) < 1e-4 ) {
      integral = exp( -hStart * k ) * hdDist;
    } else {
      integral = ( exp( -hStart * k ) - exp( -( hStart + dy * hdDist ) * k ) ) / ( dy * k );
    }
    float amount = 1.0 - exp( -hdFogDensity * max( integral, 0.0 ) );
    amount = clamp( amount, 0.0, hdFogMax );

    float sunAmt = pow( max( dot( hdDir, hdSunDir ), 0.0 ), hdFogSunPower );
    float upness = clamp( hdDir.y * 0.5 + 0.5, 0.0, 1.0 );
    vec3  haze   = mix( hdFogGround, hdFogSky, upness );
    haze = mix( haze, hdFogSun, sunAmt * 0.8 );

    gl_FragColor.rgb = mix( gl_FragColor.rgb, haze, amount );
  #else
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;
}

/** The vertex-shader snippet that makes a plant lean. Shared by trees, bushes and props. */
const WIND_PARS = /* glsl */`
attribute vec2 aWind;          // x = how much this vertex moves, y = its own phase
uniform float uTime;
uniform vec3  uWindDir;
uniform float uWindStrength;
uniform float uWindSpeed;
varying float vHdWind;
`;

const WIND_BODY = /* glsl */`
{
  // The object may be rotated and scaled (instanced trees all are), and the wind blows in WORLD
  // space. Rather than move the vertex after the model matrix — which would mean rewriting three's
  // projection chunk — turn the wind direction around into the object's own space, push there, and
  // let the normal transform carry it back out. For a rotation with a uniform scale, multiplying a
  // vector from the right by the matrix is the same as multiplying by its transpose, and dividing
  // by the squared scale undoes the stretch.
  mat3 hdM = mat3( modelMatrix );
  #ifdef USE_INSTANCING
    hdM = hdM * mat3( instanceMatrix );
  #endif
  float hdS2 = max( dot( hdM[ 0 ], hdM[ 0 ] ), 1e-6 );
  vec3 hdWindObj = ( uWindDir * hdM ) / hdS2;

  // A per-object offset so a whole forest does not breathe in unison.
  float hdInst = 0.0;
  #ifdef USE_INSTANCING
    hdInst = instanceMatrix[ 3 ].x * 0.137 + instanceMatrix[ 3 ].z * 0.091;
  #endif

  float t     = uTime * uWindSpeed;
  float phase = aWind.y * 6.2831853 + hdInst;
  // Three waves at different rates: a slow sway, a quicker shiver, and a very slow gust that
  // rolls across the map so the whole wood moves in waves rather than at one steady rate.
  float sway   = sin( t * 1.15 + phase );
  float shiver = sin( t * 4.30 + phase * 2.3 ) * 0.22;
  float gust   = 0.55 + 0.45 * sin( t * 0.21 + hdInst * 0.7 );

  float amt = aWind.x * uWindStrength * gust;
  transformed += hdWindObj * ( ( sway + shiver ) * amt * 0.42 );
  // A leaning plant also gets a touch shorter — without this the sway looks like sliding.
  transformed.y -= abs( sway ) * amt * 0.06;
  vHdWind = amt;
}
`;

/**
 * Bolt the extras onto a material.
 *
 * @param {THREE.Material} material
 * @param {object} opts
 *   csm     — a CSM instance, or null. Pass it and the material gets cascaded shadows.
 *   wind    — false, or a number: the overall sway multiplier for this material.
 *   fog     — default true. Turns on our height fog (the material must also have `fog: true`).
 *   defines — extra #defines to merge in.
 *   uniforms— extra uniform objects to merge into the compiled shader.
 *   vertex  — { pars, main } extra GLSL for the vertex shader.
 *   fragment— { pars, main } extra GLSL for the fragment shader (main is appended at the end).
 * @returns the same material, for chaining.
 */
export function enhance(material, opts = {}) {
  const { csm = null, wind = false, fog = true, defines = {}, uniforms = {}, vertex = null, fragment = null } = opts;
  installFog();

  material.defines = material.defines || {};
  Object.assign(material.defines, defines);
  if (fog) { material.fog = true; material.defines.HD_FOG = ''; }

  // CSM claims onBeforeCompile for itself, so let it set up first and keep hold of its hook.
  let csmHook = null;
  if (csm) { csm.setupMaterial(material); csmHook = material.onBeforeCompile; }

  material.onBeforeCompile = function (shader, renderer) {
    if (csmHook) csmHook.call(this, shader, renderer);

    // Same uniform objects for every material, so one assignment moves the whole world.
    Object.assign(shader.uniforms, SHARED, uniforms);

    if (wind !== false) {
      shader.uniforms.uWindStrength = { value: typeof wind === 'number' ? wind : 1 };
      // keep the shared ones for time/dir/speed but give this material its own strength
      shader.uniforms.uTime = SHARED.uTime;
      shader.uniforms.uWindDir = SHARED.uWindDir;
      shader.uniforms.uWindSpeed = SHARED.uWindSpeed;
      shader.vertexShader = WIND_PARS + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + WIND_BODY
      );
      shader.fragmentShader = 'varying float vHdWind;\n' + shader.fragmentShader;
    }

    if (vertex) {
      if (vertex.pars) shader.vertexShader = vertex.pars + '\n' + shader.vertexShader;
      if (vertex.main) shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\n' + vertex.main);
    }
    if (fragment) {
      if (fragment.pars) shader.fragmentShader = fragment.pars + '\n' + shader.fragmentShader;
      if (fragment.map) shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>', fragment.map);
      if (fragment.rough) shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>', fragment.rough);
      if (fragment.normal) shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>', fragment.normal);
      if (fragment.emissive) shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + fragment.emissive);
      if (fragment.main) shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>', fragment.main + '\n#include <dithering_fragment>');
    }

    material.userData.shader = shader;
  };

  // three caches compiled programs by a key built from the material's settings; a material whose
  // shader source we rewrote needs its own key or it can pick up a neighbour's program.
  material.customProgramCacheKey = () => [
    wind !== false ? 'w' : '-', fog ? 'f' : '-', csm ? 'c' : '-',
    Object.keys(defines).sort().join(','), vertex ? 'v' : '-', fragment ? 'g' : '-',
  ].join('|');

  material.needsUpdate = true;
  return material;
}

/** Advance the shared clock. Called once a frame from the app. */
export function tickMaterials(elapsed) { SHARED.uTime.value = elapsed; }
