// Farhold round 23 — the air between you and everything: height fog that glows toward the sun, wet
// ground in the rain, and the wind that bends the trees. Installed ONCE, into every material.
//
//   import { ATMO, setAtmosphere, setWind, markSway } from './atmosphere.js';   // installs on import
//   markSway(material, { height: 7, amount: 0.05 });   // this material bends in the wind
//   setWind(wind);                                      // once a frame (js/wind.js)
//   setAtmosphere({ fog, base, sunDir, sunFog, wet, skyRefl });
//
// WHY IT IS GLOBAL. Farhold draws its world with MeshLambertMaterial in a dozen modules — the ground
// rings, the scatter, the buildings, the roads, the characters — and every one of them already has
// three's fog in it. highdef-3d/js/materials.js bolts its fog onto each material through an
// `enhance()` call; doing that here would mean touching every module that makes a material and
// remembering to do it in every new one. So this patches three's fog CHUNKS instead, which every
// fogged material already includes, and the fog comes for free wherever there was fog before.
//
// The catch is the uniforms. A patched chunk can declare a uniform, but three clones each material's
// uniform table when it compiles, so a value set once would never reach anybody. The one place a
// material's live uniform table is handed out is `onBeforeCompile`, so `Material.prototype` gets a
// small accessor: a material's own `onBeforeCompile` is kept and still runs, and ours runs first and
// drops the SAME uniform objects into every table. Change `ATMO.uFhWet.value` and every wet surface
// in the world changes with it. `customProgramCacheKey` is rewritten to match, so two materials with
// different hooks can never share a program by accident (three's default keys on the hook's source,
// which would now be ours for everybody).
//
// What is in the chunks:
//
//   FOG — the old distance fog (the weather still owns `near`/`far`) PLUS a height fog: density
//   `d * exp(-k * (y - base))` integrated along the view ray. There is a closed-form answer, so no
//   marching and no banding (the same idea as highdef-3d, rewritten for Farhold's scales: a camera
//   can be 40 km up, so every exponent is clamped). Looking toward the sun the fog colour leans to
//   the sun's glow — that is what makes a dusk valley glow orange instead of going grey.
//
//   WET — while it rains, surfaces that face up darken and pick up a thin sky reflection, stronger
//   at a grazing angle and in hollows where puddles would be. Only on Lambert materials, only where
//   there is fog (so the planets in the sky scene never get rained on).
//
//   SWAY — a material marked with `markSway()` bends downwind by the square of how far up the plant
//   it is (stiff at the root, loose at the top), leans in the steady wind and flutters in the gusts.
//   The phase comes from where the plant stands, so a wood does not rock in lockstep.

import * as THREE from 'three';
import { swayUniforms } from './wind.js';

/** The shared uniforms. Every fogged material in the game holds these very objects. */
export const ATMO = {
  uFhFogDensity: { value: 0 },
  uFhFogFalloff: { value: 1 / 150 },
  uFhFogBase: { value: 0 },
  uFhFogAmount: { value: 0 },
  uFhSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFhSunFog: { value: new THREE.Color(1, 0.8, 0.6) },
  uFhInscatter: { value: 0 },
  uFhWet: { value: 0 },
  uFhSkyRefl: { value: new THREE.Color(0.5, 0.6, 0.7) },
  uFhTime: { value: 0 },
  uFhWindDir: { value: new THREE.Vector2(1, 0) },
  uFhWind: { value: 0.12 },
  uFhGust: { value: 0.5 },
};

const FOG_PARS_VERTEX = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFhWorld;
#endif
#ifdef FH_SWAY
	uniform float uFhTime;
	uniform vec2 uFhWindDir;
	uniform float uFhWind;
	uniform float uFhGust;
	uniform float uFhSwayAmt;
	uniform float uFhSwayH;
#endif`;

const FOG_VERTEX = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	// world position without an inverse: the view matrix is a rotation R and a translation t, so
	// world = transpose(R) * (view - t)
	vFhWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;

const FOG_PARS_FRAGMENT = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFhWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	uniform float uFhFogDensity;
	uniform float uFhFogFalloff;
	uniform float uFhFogBase;
	uniform float uFhFogAmount;
	uniform vec3 uFhSunDir;
	uniform vec3 uFhSunFog;
	uniform float uFhInscatter;
	uniform float uFhWet;
	uniform vec3 uFhSkyRefl;
#endif`;

const FOG_FRAGMENT = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	vec3 fhRay = vFhWorld - cameraPosition;
	float fhDist = length( fhRay );
	vec3 fhDir = fhRay / max( fhDist, 1e-3 );
	float fhHeightFog = 0.0;
	if ( uFhFogAmount > 0.001 ) {
		float fhB = uFhFogFalloff;
		float fhE0 = exp( - clamp( fhB * ( cameraPosition.y - uFhFogBase ), -20.0, 60.0 ) );
		float fhE1 = exp( - clamp( fhB * ( vFhWorld.y - uFhFogBase ), -20.0, 60.0 ) );
		float fhDy = fhB * ( vFhWorld.y - cameraPosition.y );
		float fhColumn = abs( fhDy ) > 1e-3 ? ( fhE0 - fhE1 ) / fhDy : fhE0;
		fhHeightFog = ( 1.0 - exp( - uFhFogDensity * fhDist * max( fhColumn, 0.0 ) ) ) * uFhFogAmount;
	}
	float fhSun = pow( max( dot( fhDir, uFhSunDir ), 0.0 ), 6.0 ) * uFhInscatter;
	vec3 fhFogColor = mix( fogColor, uFhSunFog, fhSun );
	fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - fhHeightFog );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fhFogColor, fogFactor );
#endif`;

const WET = /* glsl */`
#if defined( FH_WET ) && defined( USE_FOG )
	if ( uFhWet > 0.001 ) {
		vec3 fhUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		float fhFlat = smoothstep( 0.35, 0.9, dot( normal, fhUp ) );
		// hollows where the water would stand: a slow pattern fixed to the ground
		float fhPud = smoothstep( 0.62, 0.9, 0.5 + 0.25 * sin( vFhWorld.x * 0.31 + sin( vFhWorld.z * 0.17 ) * 2.0 ) + 0.25 * sin( vFhWorld.z * 0.27 + vFhWorld.x * 0.05 ) );
		float fhW = uFhWet * fhFlat;
		outgoingLight *= 1.0 - fhW * ( 0.3 + fhPud * 0.12 );
		float fhFres = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 5.0 );
		outgoingLight += uFhSkyRefl * fhW * ( 0.02 + fhPud * 0.1 + ( 0.35 + fhPud * 0.4 ) * fhFres );
	}
#endif
`;

const SWAY = /* glsl */`
#ifdef FH_SWAY
	{
		float fhT = clamp( position.y / max( uFhSwayH, 0.01 ), 0.0, 1.4 );
		vec3 fhD = vec3( uFhWindDir.x, 0.0, uFhWindDir.y );
		vec3 fhBase = vec3( 0.0 );
		float fhSy = 1.0;
		#ifdef USE_INSTANCING
			mat3 fhIm = mat3( instanceMatrix );
			fhBase = instanceMatrix[ 3 ].xyz;
			vec3 fhS2 = vec3( dot( fhIm[ 0 ], fhIm[ 0 ] ), dot( fhIm[ 1 ], fhIm[ 1 ] ), dot( fhIm[ 2 ], fhIm[ 2 ] ) );
			// a world direction in the instance's own frame (rotation and scale undone)
			fhD = ( transpose( fhIm ) * fhD ) / max( fhS2, vec3( 1e-6 ) );
			fhSy = sqrt( fhS2.y );
		#endif
		vec2 fhW = ( modelMatrix * vec4( fhBase, 1.0 ) ).xz;
		float fhPh = dot( fhW, vec2( 0.23, 0.19 ) );
		float fhWave = sin( uFhTime * ( 1.1 + uFhWind * 1.5 ) + fhPh ) * 0.65
			+ sin( uFhTime * ( 2.7 + uFhWind * 2.2 ) + fhPh * 1.9 ) * 0.3;
		float fhLean = uFhWind * ( 0.55 + 0.55 * uFhGust );
		float fhAmp = ( fhLean + fhWave * ( 0.2 + uFhWind * 0.55 ) ) * fhT * fhT * uFhSwayAmt * uFhSwayH * fhSy;
		transformed += fhD * fhAmp;
		transformed.y -= abs( fhAmp ) * fhT * 0.12 / max( fhSy, 0.01 );
	}
#endif`;

let installed = false;

/** Patch the chunks and the material hook. Safe to call more than once. */
export function installAtmosphere() {
  if (installed || THREE.ShaderChunk.__farholdAtmosphere) { installed = true; return; }
  installed = true;
  const C = THREE.ShaderChunk;
  C.__farholdAtmosphere = true;
  C.fog_pars_vertex = FOG_PARS_VERTEX;
  C.fog_vertex = FOG_VERTEX;
  C.fog_pars_fragment = FOG_PARS_FRAGMENT;
  C.fog_fragment = FOG_FRAGMENT;
  C.opaque_fragment = WET + C.opaque_fragment;
  C.begin_vertex = C.begin_vertex + SWAY;

  const proto = THREE.Material.prototype;
  const own = new WeakMap();
  const inject = (material, shader) => {
    const u = shader.uniforms;
    if (u) for (const k in ATMO) if (!u[k]) u[k] = ATMO[k];
    const sway = material.userData?.fhSway;
    if (sway && u) {
      u.uFhSwayAmt = material.__fhSwayAmt || (material.__fhSwayAmt = { value: sway.amount });
      u.uFhSwayH = material.__fhSwayH || (material.__fhSwayH = { value: sway.height });
      shader.vertexShader = '#define FH_SWAY\n' + shader.vertexShader;
    }
    if (material.isMeshLambertMaterial && material.userData?.fhWet !== false) {
      shader.fragmentShader = '#define FH_WET\n' + shader.fragmentShader;
    }
  };
  Object.defineProperty(proto, 'onBeforeCompile', {
    configurable: true,
    get() {
      const mat = this;
      const user = own.get(this);
      return function farholdOnBeforeCompile(shader, renderer) {
        inject(mat, shader);
        if (user) return user.call(mat, shader, renderer);
        return undefined;
      };
    },
    set(fn) { own.set(this, fn); },
  });
  proto.customProgramCacheKey = function () {
    const user = own.get(this);
    return (user ? user.toString() : '')
      + (this.userData?.fhSway ? '|fh-sway' : '')
      + (this.isMeshLambertMaterial && this.userData?.fhWet === false ? '|fh-dry' : '');
  };
}
installAtmosphere();

/**
 * This material bends in the wind. `height` is the plant's height in its OWN geometry units (the
 * sway is measured as a fraction of it); `amount` is how far the top travels in a full gale, as a
 * fraction of the height — a tree 0.04, a bush 0.08, a reed 0.14.
 */
export function markSway(material, { height = 1, amount = 0.05 } = {}) {
  material.userData = material.userData || {};
  material.userData.fhSway = { height, amount };
  if (material.__fhSwayAmt) material.__fhSwayAmt.value = amount;
  if (material.__fhSwayH) material.__fhSwayH.value = height;
  material.needsUpdate = true;
  return material;
}

/** Once a frame, from js/wind.js. */
export function setWind(wind) {
  const s = swayUniforms(wind);
  ATMO.uFhTime.value = s.time;
  ATMO.uFhWindDir.value.set(s.dirX, s.dirZ);
  ATMO.uFhWind.value = s.amount;
  ATMO.uFhGust.value = s.gust;
}

/**
 * Once a frame. `fog` from sky-palette's `fogFor()`; `base` the height of the low ground round the
 * player; `sunDir` a world direction; `sunFog` and `skyRefl` THREE.Colors (or anything with .r/.g/.b).
 */
export function setAtmosphere({ fog, base, sunDir, sunFog, wet, skyRefl } = {}) {
  if (fog) {
    ATMO.uFhFogDensity.value = fog.density;
    ATMO.uFhFogFalloff.value = fog.falloff;
    ATMO.uFhInscatter.value = fog.inscatter;
    ATMO.uFhFogAmount.value = fog.amount;
  }
  if (base != null) ATMO.uFhFogBase.value = base;
  if (sunDir) ATMO.uFhSunDir.value.copy(sunDir);
  if (sunFog) ATMO.uFhSunFog.value.copy(sunFog);
  if (wet != null) ATMO.uFhWet.value = wet;
  if (skyRefl) ATMO.uFhSkyRefl.value.copy(skyRefl);
}
