// Water.
//
// A proper reflective water surface means rendering the world a second time into a mirrored
// camera, which roughly doubles the cost of the frame. This does not do that. Instead it leans on
// three things that together get most of the way there for almost nothing:
//
//   1. The sky reflection comes from the environment map the sky module already builds, so at dusk
//      the lake really does go orange.
//   2. The depth of the water at every point is known on the processor — the terrain heightmap is
//      right there — so it can be baked into the mesh as a per-vertex number. That gives shallow
//      water that goes green over sand and deep water that goes near-black, and a foam line that
//      hugs the actual shore, with no depth buffer trickery at all.
//   3. Two normal maps scrolling across each other at different speeds and scales. This is the
//      oldest trick in real-time water and it still looks better than anything cheaper.

import * as THREE from 'three';
import { SHARED } from './materials.js';
import { makeWaterNormals } from './kit/textures.js';

export function createWater(world, quality, { segments = 192 } = {}) {
  const size = world.size;
  const half = size / 2;
  const level = world.waterLevel;

  // --- geometry: a grid with the dry parts cut out ---------------------------------------------
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const depth = new Float32Array(n * n);      // metres of water under this point
  const shore = new Float32Array(n * n);      // 1 right at the edge, 0 further out
  const step = size / segments;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -half + i * step, z = -half + j * step;
      const ground = world.heightAt(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = level; pos[k * 3 + 2] = z;
      uv[k * 2] = x; uv[k * 2 + 1] = z;             // world-space uv; the shader scales it
      const d = level - ground;
      depth[k] = Math.max(0, d);
      shore[k] = Math.max(0, 1 - Math.max(0, d) / 2.6);
    }
  }

  const idx = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      // Keep the quad if any corner has water in it, plus a little margin so the foam band is not
      // clipped off at the very edge.
      if (depth[a] <= 0 && depth[b] <= 0 && depth[c] <= 0 && depth[d] <= 0) continue;
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  geo.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  // --- material --------------------------------------------------------------------------------
  const normals = makeWaterNormals(512, 7);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.anisotropy = quality.anisotropy;

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      tNormal:    { value: null },
      tEnv:       { value: null },
      uShallow:   { value: new THREE.Color(0x4f7d72) },
      uDeep:      { value: new THREE.Color(0x0b2029) },
      uFoam:      { value: new THREE.Color(0xdfeef0) },
      uSunColor:  { value: new THREE.Color(0xfff2d8) },
      uSunDir:    { value: new THREE.Vector3(0.4, 0.6, 0.4) },
      uWaveScale: { value: 0.045 },
      uWaveSpeed: { value: 0.035 },
      uWaveHeight:{ value: 0.16 },
      uChop:      { value: 0.55 },
      uOpacityMin:{ value: 0.55 },
      uEnvStrength:{ value: 1.0 },
    },
  ]);
  uniforms.tNormal.value = normals;
  Object.assign(uniforms, SHARED);

  const material = new THREE.ShaderMaterial({
    name: 'HDWater',
    uniforms,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    defines: { HD_FOG: '', USE_FOG: '' },
    vertexShader: /* glsl */`
      attribute float aDepth;
      attribute float aShore;
      uniform float uTime, uWaveHeight, uWaveSpeed;
      varying vec2  vWorldXZ;
      varying float vDepth;
      varying float vShore;
      varying vec3  vViewPosition;
      varying vec3  vWorldPos;
      #include <fog_pars_vertex>

      void main() {
        vDepth = aDepth;
        vShore = aShore;
        vWorldXZ = uv;

        // Two crossing swells. Their height is scaled down in the shallows so the water never
        // lifts above the sand it is lapping against.
        float shallowDamp = smoothstep( 0.0, 1.8, aDepth );
        float t = uTime * uWaveSpeed * 30.0;
        float w = sin( uv.x * 0.09 + t * 0.9 ) * 0.6
                + sin( uv.y * 0.13 - t * 1.3 ) * 0.4
                + sin( ( uv.x + uv.y ) * 0.045 + t * 0.55 ) * 0.7;
        vec3 p = position;
        p.y += w * uWaveHeight * shallowDamp;

        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        vViewPosition = -mv.xyz;
        vWorldPos = ( modelMatrix * vec4( p, 1.0 ) ).xyz;
        vec4 mvPosition = mv;
        gl_Position = projectionMatrix * mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tNormal;
      uniform samplerCube tEnv;
      uniform vec3  uShallow, uDeep, uFoam, uSunColor, uSunDir;
      uniform float uTime, uWaveScale, uWaveSpeed, uChop, uOpacityMin, uEnvStrength;
      varying vec2  vWorldXZ;
      varying float vDepth;
      varying float vShore;
      varying vec3  vViewPosition;
      varying vec3  vWorldPos;
      #include <fog_pars_fragment>

      vec3 sampleNormal( vec2 uv, float t ) {
        // Two layers at different sizes and speeds. Crossing them is what stops the ripple
        // pattern reading as one repeating tile sliding across the lake.
        vec3 a = texture2D( tNormal, uv * 1.0 + vec2( t * 0.9, t * 0.4 ) ).xyz * 2.0 - 1.0;
        vec3 b = texture2D( tNormal, uv * 2.7 - vec2( t * 0.6, t * 1.1 ) ).xyz * 2.0 - 1.0;
        vec3 c = texture2D( tNormal, uv * 0.42 + vec2( -t * 0.22, t * 0.17 ) ).xyz * 2.0 - 1.0;
        vec3 n = a * 0.5 + b * 0.32 + c * 0.4;
        return normalize( vec3( n.xy * uChop, 1.0 ) );
      }

      void main() {
        float t = uTime * uWaveSpeed;
        vec2 uv = vWorldXZ * uWaveScale;
        vec3 nTS = sampleNormal( uv, t );
        // the surface is flat, so tangent space maps straight onto world space here
        vec3 N = normalize( vec3( nTS.x, nTS.z * 1.6, nTS.y ) );
        vec3 V = normalize( cameraPosition - vWorldPos );

        // Deep water is dark and blue; shallow water lets the sand show through and goes green.
        float dnorm = clamp( vDepth / 9.0, 0.0, 1.0 );
        vec3 body = mix( uShallow, uDeep, dnorm * dnorm );

        // Fresnel: water is nearly a mirror at a glancing angle and nearly clear looking straight
        // down. Getting this one curve right is most of what makes water look like water.
        float fres = pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), 4.0 );
        fres = clamp( 0.03 + fres * 0.97, 0.0, 1.0 );

        vec3 R = reflect( -V, N );
        vec3 env = textureCube( tEnv, R ).rgb * uEnvStrength;

        // a hard specular glint straight off the sun
        vec3 H = normalize( uSunDir + V );
        float spec = pow( max( dot( N, H ), 0.0 ), 260.0 ) * 3.2;

        vec3 col = mix( body, env, fres * 0.86 ) + uSunColor * spec;

        // Foam. Two bands: a steady one right at the waterline, and a moving one a little further
        // out that surges in and back like a wave running up a beach.
        float band = smoothstep( 0.62, 1.0, vShore );
        float surge = sin( uTime * 1.35 + vWorldXZ.x * 0.07 + vWorldXZ.y * 0.05 ) * 0.5 + 0.5;
        float rolling = smoothstep( 0.28 + surge * 0.22, 0.62 + surge * 0.2, vShore );
        float foamNoise = texture2D( tNormal, vWorldXZ * 0.22 + vec2( t * 1.7, -t * 0.9 ) ).b;
        float foam = clamp( band * 1.1 + rolling * 0.55 * foamNoise * 1.6, 0.0, 1.0 );
        col = mix( col, uFoam, foam * 0.85 );

        // Right at the edge the water thins out to nothing rather than ending in a hard line.
        float alpha = mix( uOpacityMin, 0.99, clamp( dnorm * 2.4, 0.0, 1.0 ) );
        alpha = max( alpha, foam * 0.95 );
        alpha *= smoothstep( 0.0, 0.14, vDepth );

        gl_FragColor = vec4( col, alpha );
        #include <fog_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water';
  mesh.renderOrder = 2;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.frustumCulled = false;

  return {
    mesh, material, uniforms,
    /** Hand the water the current sky so it reflects the right thing. */
    setEnvironment(cubeTexture) { uniforms.tEnv.value = cubeTexture; },
    setSun(dir, colour) { uniforms.uSunDir.value.copy(dir); uniforms.uSunColor.value.copy(colour); },
    /** Water tone per weather — a storm lake is not the same colour as a clear one. */
    setMood({ shallow, deep, foam, chop, env }) {
      if (shallow) uniforms.uShallow.value.set(shallow);
      if (deep) uniforms.uDeep.value.set(deep);
      if (foam) uniforms.uFoam.value.set(foam);
      if (chop != null) uniforms.uChop.value = chop;
      if (env != null) uniforms.uEnvStrength.value = env;
    },
    /** True when a point is under the surface — used by the character controller for swimming. */
    isUnder(x, y, z) { return y < level && world.heightAt(x, z) < level; },
    level,
    dispose() { geo.dispose(); material.dispose(); normals.dispose(); },
  };
}
