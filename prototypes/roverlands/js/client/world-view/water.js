// Water: the river, the lake and the fen pools, as one mesh.
//
// A copy-and-change of highdef-3d/js/water.js. Highdef's water is ONE flat sea level; here every body of water has its
// own surface height (the river falls toward the east, the lake and the fen pools sit at their own levels) and the
// river FLOWS. What is kept: depth baked per vertex from the heightmap (shallow = clear and green over the bed, deep =
// dark), the sky reflection from the sky module's cube, fresnel, a sun glint, and fog. What is new:
//   * per-vertex surface height from world.water (NaN = dry); a vertex just outside the water takes its wet
//     neighbour's height so the surface runs on under the bank instead of stopping short of it;
//   * a flow direction per vertex (along the river), and a two-phase flow map so the ripples move downstream
//     without the texture stretching;
//   * white water: foam where the water is shallow AND moving (the fords), plus the usual shore line.

import * as THREE from 'three';
import { SHARED } from '../../../../../highdef-3d/js/materials.js';
import { makeWaterNormals } from '../../../../../highdef-3d/js/kit/textures.js';

export function createWater(world, quality) {
  const { dim, heights, water } = world;
  const half = world.size / 2;
  const S = 2;                                   // a vertex every 2 samples (4 m)
  const n = Math.floor((dim - 1) / S) + 1;
  const pos = new Float32Array(n * n * 3), depth = new Float32Array(n * n), flow = new Float32Array(n * n * 2);
  const own = new Uint8Array(n * n);
  const river = world.river.pts;   // [x, z, halfW, level] every 8 m
  const rIdx = (x) => Math.max(0, Math.min(river.length - 2, Math.floor((x + half) / 8)));

  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const si = Math.min(dim - 1, i * S), sj = Math.min(dim - 1, j * S);
    const k = sj * dim + si, v = j * n + i;
    let lv = water[k];
    if (!Number.isNaN(lv)) own[v] = 1;
    else {
      // borrow the highest wet neighbour within two samples
      let best = NaN;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = si + di, jj = sj + dj;
        if (ii < 0 || jj < 0 || ii >= dim || jj >= dim) continue;
        const w = water[jj * dim + ii];
        if (!Number.isNaN(w) && !(w <= best)) best = w;
      }
      lv = best;
    }
    const x = -half + si * world.cell, z = -half + sj * world.cell;
    pos[v * 3] = x; pos[v * 3 + 1] = Number.isNaN(lv) ? -100 : lv; pos[v * 3 + 2] = z;
    depth[v] = Number.isNaN(lv) ? -1 : lv - heights[k];
    // flow along the river near its channel
    const r = rIdx(x), a = river[r], b = river[r + 1];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.sqrt(tx * tx + tz * tz) || 1; tx /= tl; tz /= tl;
    const rz = a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0] || 1));
    const d = Math.abs(z - rz) * Math.abs(tx);
    if (d < a[2] + 20 && Math.abs((Number.isNaN(lv) ? 0 : lv) - a[3]) < 0.5) {
      const shallow = depth[v] < 0.7 ? 1.7 : 1.0;
      const sp = 0.85 * shallow * (1 - Math.min(1, d / (a[2] + 20)) * 0.6);
      flow[v * 2] = tx * sp; flow[v * 2 + 1] = tz * sp;
    }
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (!(own[a] || own[b] || own[c] || own[d])) continue;
    if (pos[a * 3 + 1] < -50 || pos[b * 3 + 1] < -50 || pos[c * 3 + 1] < -50 || pos[d * 3 + 1] < -50) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const normals = makeWaterNormals(quality.textureSize >= 512 ? 512 : 256, 7);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.anisotropy = quality.anisotropy;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tNormal: { value: null }, tEnv: { value: null },
    uShallow: { value: new THREE.Color(0x5a8070) }, uDeep: { value: new THREE.Color(0x0d2228) },
    uMuddy: { value: new THREE.Color(0x6b5a3e) },
    uFoam: { value: new THREE.Color(0xe8f0ee) },
    uSunColor: { value: new THREE.Color(0xfff2d8) }, uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.4) },
    uEnvStrength: { value: 0.32 },
  }]);
  uniforms.tNormal.value = normals;
  Object.assign(uniforms, SHARED);

  const material = new THREE.ShaderMaterial({
    name: 'RoverWater', uniforms, fog: true, transparent: true, depthWrite: false,
    defines: { HD_FOG: '', USE_FOG: '' },
    vertexShader: /* glsl */`
      attribute float aDepth;
      attribute vec2 aFlow;
      uniform float uTime;
      varying vec2 vXZ; varying float vDepth; varying vec2 vFlow;
      varying vec3 vViewPosition; varying vec3 vWorldPos;
      #include <fog_pars_vertex>
      void main() {
        vDepth = aDepth; vFlow = aFlow; vXZ = position.xz;
        vec3 p = position;
        float damp = smoothstep( 0.0, 2.0, aDepth ) * ( 1.0 - min( 1.0, length( aFlow ) ) * 0.5 );
        p.y += ( sin( p.x * 0.11 + uTime * 0.9 ) * 0.5 + sin( p.z * 0.15 - uTime * 1.2 ) * 0.5 ) * 0.05 * damp;
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
      uniform vec3 uShallow, uDeep, uMuddy, uFoam, uSunColor, uSunDir;
      uniform float uTime, uEnvStrength;
      varying vec2 vXZ; varying float vDepth; varying vec2 vFlow;
      varying vec3 vViewPosition; varying vec3 vWorldPos;
      #include <fog_pars_fragment>
      vec3 nrmAt( vec2 uv ) { return texture2D( tNormal, uv ).xyz * 2.0 - 1.0; }
      void main() {
        if ( vDepth < -0.6 ) discard;
        // two-phase flow map: two copies of the ripples dragged downstream, each fading out before it stretches
        float sp = length( vFlow );
        float t = uTime * 0.35;
        float p0 = fract( t ), p1 = fract( t + 0.5 );
        float wA = 1.0 - abs( 1.0 - 2.0 * p0 );
        vec2 base = vXZ * 0.06;
        vec2 drift = vec2( uTime * 0.012, uTime * 0.007 );
        vec3 nA = nrmAt( base - vFlow * p0 * 0.6 + drift );
        vec3 nB = nrmAt( base - vFlow * p1 * 0.6 + drift + 0.5 );
        vec3 nC = nrmAt( vXZ * 0.023 - drift * 0.6 );
        vec3 nt = normalize( mix( nB, nA, wA ) * ( 0.6 + sp * 0.5 ) + nC * 0.45 );
        vec3 N = normalize( vec3( nt.x * 0.55, 1.0, nt.y * 0.55 ) );
        vec3 V = normalize( cameraPosition - vWorldPos );
        float d = max( vDepth, 0.0 );
        float dn = clamp( d / 3.5, 0.0, 1.0 );
        vec3 body = mix( mix( uShallow, uMuddy, 0.35 ), uDeep, dn * dn * ( 3.0 - 2.0 * dn ) );
        float fres = clamp( 0.03 + pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), 4.0 ) * 0.97, 0.0, 1.0 );
        vec3 env = textureCube( tEnv, reflect( -V, N ) ).rgb * uEnvStrength;
        float spec = pow( max( dot( N, normalize( uSunDir + V ) ), 0.0 ), 240.0 ) * 3.0;
        vec3 col = mix( body, env, fres * 0.65 ) + uSunColor * spec * 0.6;
        // white water: shallow and moving (the fords), plus a thin line at every shore
        // foam pattern from the ripples' sideways slope (the normal map's x), which varies; its z is ~1 everywhere
        float fn = abs( texture2D( tNormal, vXZ * 0.21 - vFlow * uTime * 0.25 ).r * 2.0 - 1.0 ) * 2.2;
        float rapid = ( 1.0 - smoothstep( 0.25, 0.75, d ) ) * smoothstep( 0.6, 1.4, sp );
        float shore = 1.0 - smoothstep( 0.02, 0.22, d );
        float foam = clamp( rapid * smoothstep( 0.35, 0.8, fn ) * 0.9 + shore * smoothstep( 0.3, 0.7, fn ) * 0.8, 0.0, 1.0 );
        col = mix( col, uFoam, foam * 0.7 );
        float alpha = mix( 0.28, 0.95, smoothstep( 0.0, 1.8, d ) );
        alpha = max( alpha, foam * 0.9 ) * smoothstep( -0.02, 0.08, vDepth );
        gl_FragColor = vec4( col, alpha );
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'water';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return {
    mesh, material, uniforms,
    setEnvironment(cube) { uniforms.tEnv.value = cube; },
    setSun(dir, colour) { uniforms.uSunDir.value.copy(dir); uniforms.uSunColor.value.copy(colour); },
    dispose() { geo.dispose(); material.dispose(); normals.dispose(); },
  };
}
