// The ground: chunked terrain with four detail levels, twelve blended surface textures, triplanar rock.
//
// Built on highdef-3d/js/terrain.js's ideas (skirts instead of edge stitching, splat weights worked out per vertex on
// the processor, triplanar rock, screen-space tangent frame) but it is its own module because that one is welded to
// highdef's five-surface world: Roverlands has eleven SURFACES (mud, ice, farm soil, road, river bed...) and a
// physics heightfield that the drawn ground must match. So:
//
//   * The finest level is exactly the 2 m physics grid — a vertex on every height sample. What you see is what the
//     tyres touch (the coarser levels only ever draw far away).
//   * All twelve ground textures live in ONE texture array (WebGL2 sampler2DArray): layer i = one surface, painted
//     by highdef's kit/textures.js. Colour in RGB with roughness in A; normal in RGB with occlusion in A. A pixel
//     only samples the layers whose weight is above a hair, so the cost is "how many surfaces meet here", not twelve.
//   * Weights come from the world's per-sample surface ids, blurred over a 3x3 tent so borders are soft, plus rock
//     wherever the ground is steep. 12 weights travel as three normalised-byte vec4s.

import * as THREE from 'three';
import { enhance } from '../../../../../highdef-3d/js/materials.js';
import { makeSurface } from '../../../../../highdef-3d/js/kit/textures.js';
import { SURF, BIOMES, BIOME } from '../../world/world-data.js';

/** The texture layers. `surface`: the highdef kit recipe painted for it. scale = texture repeats per metre. */
export const LAYERS = [
  { key: 'grass',  recipe: 'grass',        scale: 0.15, rough: 1.00 },
  { key: 'forest', recipe: 'forest_floor', scale: 0.13, rough: 1.00 },
  { key: 'dirt',   recipe: 'dirt',         scale: 0.14, rough: 1.00 },
  { key: 'mud',    recipe: 'mud',          scale: 0.11, rough: 0.55 },   // wet: glossy in the low spots
  { key: 'sand',   recipe: 'sand',         scale: 0.13, rough: 1.00 },
  { key: 'gravel', recipe: 'gravel',       scale: 0.17, rough: 1.00, bright: 1.2 },
  { key: 'rock',   recipe: 'rock',         scale: 0.055, rough: 1.00, triplanar: true, bright: 0.72 },
  { key: 'snow',   recipe: 'snow',         scale: 0.09, rough: 0.85, bright: 0.84 },
  { key: 'road',   recipe: 'dirt',         scale: 0.20, rough: 0.95, tint: '#d9ccb2', seed: 5, bright: 1.15 },
  { key: 'ice',    recipe: 'snow',         scale: 0.05, rough: 0.16, tint: '#9cc2dc', seed: 9, bright: 0.8 },
  { key: 'farm',   recipe: 'dirt',         scale: 0.10, rough: 1.00, tint: '#b08c62', seed: 4, furrows: true },
  { key: 'bed',    recipe: 'cobble',       scale: 0.16, rough: 0.70, seed: 3 },
];
const L = LAYERS.length;
/** SURFACES id -> layer index */
const SURF_LAYER = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ROCK = 6, FOREST = 1, GRASS = 0;

/** Paint every layer with the highdef kit and pack them into two texture arrays. */
export function buildGroundTextures(size, anisotropy = 8) {
  const N = size * size * 4;
  const alb = new Uint8Array(N * L), nrm = new Uint8Array(N * L);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const read = (tex) => { g.clearRect(0, 0, size, size); g.drawImage(tex.image, 0, 0, size, size); return g.getImageData(0, 0, size, size).data; };
  LAYERS.forEach((layer, li) => {
    const s = makeSurface(layer.recipe, { size, seed: layer.seed ?? 7, tint: layer.tint || null });
    const c = read(s.map), r = read(s.roughnessMap), n = read(s.normalMap), o = read(s.aoMap);
    const base = li * N;
    for (let y = 0; y < size; y++) {
      // a canvas is top row first; three flips canvas textures on upload and the kit's normal maps expect that,
      // so flip the rows here (a DataArrayTexture is not flipped)
      const sy = size - 1 - y;
      for (let x = 0; x < size; x++) {
        const si = (sy * size + x) * 4, di = base + (y * size + x) * 4;
        let cr = c[si], cg = c[si + 1], cb = c[si + 2];
        let nx = n[si], ny = n[si + 1];
        if (layer.furrows) {
          // ploughed rows across the tile: darker in the trough, a slope in the normal
          const t = (y / size) * 12 * Math.PI * 2;
          const f = Math.sin(t), df = Math.cos(t);
          const k = 0.84 + 0.16 * f;
          cr *= k; cg *= k; cb *= k;
          ny = Math.max(0, Math.min(255, ny + df * 55));
        }
        alb[di] = cr; alb[di + 1] = cg; alb[di + 2] = cb; alb[di + 3] = r[si];
        nrm[di] = nx; nrm[di + 1] = ny; nrm[di + 2] = n[si + 2]; nrm[di + 3] = o[si];
      }
    }
  });
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, size, size, L);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = anisotropy;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: mk(alb, true), normal: mk(nrm, false) };
}

const LOD_STEP = [2, 4, 8, 16];   // metres between vertices at each detail level
const CHUNK = 128;
const SKIRT = 3.0;

export function createGround(world, quality, { csm, textures }) {
  const group = new THREE.Group();
  group.name = 'ground';
  const half = world.size / 2;
  const per = Math.round(world.size / CHUNK);
  const { dim, heights, surface, biome } = world;
  const cell = world.cell;

  // --- per-sample layer weights, blurred, as 12 bytes per sample (built once) -----------------------------------
  const W = buildSampleWeights(world);

  const uniforms = {
    tAlb: { value: textures.albedo }, tNrm: { value: textures.normal },
    uScale: { value: LAYERS.map(l => l.scale) },
    uRough: { value: LAYERS.map(l => l.rough) },
    uBright: { value: LAYERS.map(l => l.bright ?? 1) },
    uDetailFade: { value: 120 },
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, dithering: true });
  enhance(material, {
    csm, fog: true, wind: false, uniforms, defines: { RL_GROUND: '' },
    vertex: {
      pars: /* glsl */`
        attribute vec4 aW0; attribute vec4 aW1; attribute vec4 aW2;
        varying vec4 vW0; varying vec4 vW1; varying vec4 vW2;
        varying vec3 vRlWorld; varying float vRlDist;`,
      main: /* glsl */`
        vW0 = aW0; vW1 = aW1; vW2 = aW2;
        vec4 rlWp = modelMatrix * vec4( transformed, 1.0 );
        vRlWorld = rlWp.xyz; vRlDist = length( rlWp.xyz - cameraPosition );`,
    },
    fragment: {
      pars: /* glsl */`
        uniform highp sampler2DArray tAlb;
        uniform highp sampler2DArray tNrm;
        uniform float uScale[ ${L} ];
        uniform float uRough[ ${L} ];
        uniform float uBright[ ${L} ];
        uniform float uDetailFade;
        varying vec4 vW0; varying vec4 vW1; varying vec4 vW2;
        varying vec3 vRlWorld; varying float vRlDist;
        float rlHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 ); }
        float rlNoise( vec2 p ) {
          vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( rlHash( i ), rlHash( i + vec2( 1, 0 ) ), f.x ), mix( rlHash( i + vec2( 0, 1 ) ), rlHash( i + vec2( 1, 1 ) ), f.x ), f.y );
        }
        vec3 rlPerturb( vec3 eyePos, vec3 surfN, vec3 mapN, vec2 uv ) {
          vec3 q0 = dFdx( eyePos ), q1 = dFdy( eyePos );
          vec2 st0 = dFdx( uv ), st1 = dFdy( uv );
          vec3 N = surfN;
          vec3 q1perp = cross( q1, N ), q0perp = cross( N, q0 );
          vec3 T = q1perp * st0.x + q0perp * st1.x;
          vec3 B = q1perp * st0.y + q0perp * st1.y;
          float det = max( dot( T, T ), dot( B, B ) );
          float sc = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
          return normalize( T * ( mapN.x * sc ) + B * ( mapN.y * sc ) + N * mapN.z );
        }
        float rlRough = 1.0;
        float rlAO = 1.0;
        vec3 rlNTS = vec3( 0.0, 0.0, 1.0 );`,
      map: /* glsl */`
        {
          float w[ ${L} ];
          w[0] = vW0.x; w[1] = vW0.y; w[2] = vW0.z; w[3] = vW0.w;
          w[4] = vW1.x; w[5] = vW1.y; w[6] = vW1.z; w[7] = vW1.w;
          w[8] = vW2.x; w[9] = vW2.y; w[10] = vW2.z; w[11] = vW2.w;
          vec2 p = vRlWorld.xz;
          // break the soft vertex blend up with a little noise so borders are ragged, not blurred
          // each layer gets its own noise, so where two meet one wins in ragged patches
          float tot = 0.0;
          for ( int i = 0; i < ${L}; i++ ) {
            if ( w[ i ] > 0.003 ) w[ i ] = w[ i ] * w[ i ] * ( 0.35 + rlNoise( p * 0.45 + float( i ) * 13.7 ) * 0.7 + rlNoise( p * 1.7 - float( i ) * 5.3 ) * 0.4 );
            else w[ i ] = 0.0;
            tot += w[ i ];
          }
          vec2 dpx = dFdx( p ), dpy = dFdy( p );
          vec3 wn = normalize( ( vec4( normalize( vNormal ), 0.0 ) * viewMatrix ).xyz );
          vec3 col = vec3( 0.0 ), nrm = vec3( 0.0 );
          float rgh = 0.0, ao = 0.0;
          for ( int i = 0; i < ${L}; i++ ) {
            float wi = w[ i ] / max( tot, 1e-4 );
            if ( wi < 0.01 ) continue;
            float sc = uScale[ i ];
            vec4 a; vec4 n;
            if ( i == ${ROCK} ) {
              vec3 bw = pow( abs( wn ), vec3( 4.0 ) ); bw /= ( bw.x + bw.y + bw.z );
              vec3 q = vRlWorld * sc;
              vec3 dqx = dFdx( q ), dqy = dFdy( q );
              a = textureGrad( tAlb, vec3( q.zy, float( i ) ), dqx.zy, dqy.zy ) * bw.x
                + textureGrad( tAlb, vec3( q.xz, float( i ) ), dqx.xz, dqy.xz ) * bw.y
                + textureGrad( tAlb, vec3( q.xy, float( i ) ), dqx.xy, dqy.xy ) * bw.z;
              n = textureGrad( tNrm, vec3( q.xz, float( i ) ), dqx.xz, dqy.xz );
            } else {
              vec3 uv = vec3( p * sc, float( i ) );
              a = textureGrad( tAlb, uv, dpx * sc, dpy * sc );
              n = textureGrad( tNrm, uv, dpx * sc, dpy * sc );
            }
            col += a.rgb * uBright[ i ] * wi;
            rgh += a.a * uRough[ i ] * wi;
            nrm += ( n.xyz * 2.0 - 1.0 ) * wi;
            ao += n.a * wi;
          }
          // big soft blotches hide the tile repeat from a hillside
          float macro = rlNoise( p * 0.011 ) * 0.5 + rlNoise( p * 0.0037 ) * 0.5;
          col *= mix( 0.86, 1.14, macro );
          // a finer grain up close only
          float near = 1.0 - smoothstep( uDetailFade * 0.35, uDetailFade, vRlDist );
          if ( near > 0.01 ) col *= mix( 1.0, 0.86 + rlNoise( p * 3.1 ) * 0.28, near );
          rlRough = clamp( rgh, 0.05, 1.0 );
          rlAO = mix( 1.0, ao, 0.6 );
          rlNTS = normalize( vec3( nrm.xy * 1.1, max( nrm.z, 0.2 ) ) );
          diffuseColor.rgb *= col * rlAO;
        }`,
      rough: /* glsl */`float roughnessFactor = roughness * rlRough;`,
      normal: /* glsl */`normal = rlPerturb( -vViewPosition, normal, rlNTS, vRlWorld.xz );`,
    },
  });

  // --- chunks ------------------------------------------------------------------------------------------------
  const chunks = new Map();
  const geoCache = new Map();
  const nrm = { x: 0, y: 1, z: 0 };

  function buildGeometry(cx, cz, lod) {
    const key = `${cx},${cz},${lod}`;
    const hit = geoCache.get(key);
    if (hit) return hit;
    const step = LOD_STEP[lod];
    const res = CHUNK / step, n = res + 1;
    const ox = -half + cx * CHUNK, oz = -half + cz * CHUNK;
    const vc = n * n + n * 4;
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
    const w0 = new Uint8Array(vc * 4), w1 = new Uint8Array(vc * 4), w2 = new Uint8Array(vc * 4);
    const tint = [0, 0, 0];
    let v = 0;
    const sstep = step / cell;      // samples per vertex step
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, v++) {
      const x = ox + i * step, z = oz + j * step;
      const si = Math.min(dim - 1, Math.round((x + half) / cell)), sj = Math.min(dim - 1, Math.round((z + half) / cell));
      const k = sj * dim + si;
      const y = heights[k];
      pos[v * 3] = x - ox - CHUNK / 2; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z - oz - CHUNK / 2;
      world.normalAt(x, z, nrm);
      nor[v * 3] = nrm.x; nor[v * 3 + 1] = nrm.y; nor[v * 3 + 2] = nrm.z;
      // weights: at coarse levels, average the samples this vertex stands for
      const o = k * L;
      if (sstep <= 1) {
        for (let q = 0; q < 4; q++) { w0[v * 4 + q] = W[o + q]; w1[v * 4 + q] = W[o + 4 + q]; w2[v * 4 + q] = W[o + 8 + q]; }
      } else {
        const acc = new Float32Array(L);
        let c = 0;
        const r = sstep >> 1;
        for (let dj = -r; dj <= r; dj += Math.max(1, r)) for (let di = -r; di <= r; di += Math.max(1, r)) {
          const ii = Math.min(dim - 1, Math.max(0, si + di)), jj = Math.min(dim - 1, Math.max(0, sj + dj));
          const oo = (jj * dim + ii) * L;
          for (let q = 0; q < L; q++) acc[q] += W[oo + q];
          c++;
        }
        for (let q = 0; q < 4; q++) { w0[v * 4 + q] = acc[q] / c; w1[v * 4 + q] = acc[4 + q] / c; w2[v * 4 + q] = acc[8 + q] / c; }
      }
      vertexColour(world, si, sj, x, z, y, tint);
      col[v * 3] = tint[0]; col[v * 3 + 1] = tint[1]; col[v * 3 + 2] = tint[2];
    }
    // skirts
    const skirt0 = v;
    const rim = [];
    for (let i = 0; i < n; i++) rim.push(i);
    for (let j = 0; j < n; j++) rim.push(j * n + n - 1);
    for (let i = n - 1; i >= 0; i--) rim.push((n - 1) * n + i);
    for (let j = n - 1; j >= 0; j--) rim.push(j * n);
    for (const s of rim) {
      for (let q = 0; q < 3; q++) { pos[v * 3 + q] = pos[s * 3 + q]; nor[v * 3 + q] = nor[s * 3 + q]; col[v * 3 + q] = col[s * 3 + q]; }
      pos[v * 3 + 1] -= SKIRT;
      for (let q = 0; q < 4; q++) { w0[v * 4 + q] = w0[s * 4 + q]; w1[v * 4 + q] = w1[s * 4 + q]; w2[v * 4 + q] = w2[s * 4 + q]; }
      v++;
    }
    const idx = new Uint32Array(res * res * 6 + rim.length * 6);
    let p = 0;
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    for (let q = 0; q < rim.length - 1; q++) {
      const t0 = rim[q], t1 = rim[q + 1], b0 = skirt0 + q, b1 = skirt0 + q + 1;
      idx[p++] = t0; idx[p++] = b0; idx[p++] = t1; idx[p++] = t1; idx[p++] = b0; idx[p++] = b1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aW0', new THREE.BufferAttribute(w0, 4, true));
    geo.setAttribute('aW1', new THREE.BufferAttribute(w1, 4, true));
    geo.setAttribute('aW2', new THREE.BufferAttribute(w2, 4, true));
    geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, p), 1));
    geo.computeBoundingSphere();
    if (geoCache.size > 300) { const old = geoCache.keys().next().value; geoCache.get(old).dispose(); geoCache.delete(old); }
    geoCache.set(key, geo);
    return geo;
  }

  function lodFor(d) {
    const t = quality.terrainLod;
    return d < t[0] ? 0 : d < t[1] ? 1 : d < t[2] ? 2 : 3;
  }
  function ensure(cx, cz, lod) {
    const key = cx * 1000 + cz;
    let c = chunks.get(key);
    if (c && c.lod === lod) return c;
    const geo = buildGeometry(cx, cz, lod);
    if (c) { c.mesh.geometry = geo; c.lod = lod; return c; }
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(-half + (cx + 0.5) * CHUNK, 0, -half + (cz + 0.5) * CHUNK);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.name = `ground_${cx}_${cz}`;
    group.add(mesh);
    c = { mesh, lod, cx, cz };
    chunks.set(key, c);
    return c;
  }
  function distTo(cx, cz, p) {
    const x0 = -half + cx * CHUNK, z0 = -half + cz * CHUNK;
    const dx = Math.max(x0 - p.x, 0, p.x - (x0 + CHUNK)), dz = Math.max(z0 - p.z, 0, p.z - (z0 + CHUNK));
    return Math.sqrt(dx * dx + dz * dz);
  }
  let built = 0;
  function update(cam, budget = 2) {
    built = 0;
    const todo = [];
    for (let cz = 0; cz < per; cz++) for (let cx = 0; cx < per; cx++) {
      const d = distTo(cx, cz, cam);
      const key = cx * 1000 + cz;
      const have = chunks.get(key);
      if (d > quality.terrainViewDistance) { if (have) { group.remove(have.mesh); chunks.delete(key); } continue; }
      const lod = lodFor(d);
      if (have) have.mesh.castShadow = quality.shadows && d < quality.shadowDistance * 0.6;
      if (!have || have.lod !== lod) todo.push({ cx, cz, lod, d });
    }
    todo.sort((a, b) => a.d - b.d);
    for (const t of todo) { if (built >= budget && chunks.has(t.cx * 1000 + t.cz)) break; ensure(t.cx, t.cz, t.lod); built++; }
  }
  function preload(cam) { update(cam, 1e9); }

  return {
    group, material, update, preload, chunks,
    get chunkCount() { return chunks.size; },
    dispose() { for (const g of geoCache.values()) g.dispose(); geoCache.clear(); chunks.clear(); material.dispose(); },
  };
}

/** Layer weights per height sample (bytes, 12 per sample), blurred over a 3x3 tent so surface borders are soft. */
function buildSampleWeights(world) {
  const { dim, surface, biome, heights } = world;
  const N = dim * dim;
  const raw = new Float32Array(N * L);
  for (let j = 0; j < dim; j++) for (let i = 0; i < dim; i++) {
    const k = j * dim + i, o = k * L;
    const s = surface[k];
    let li = SURF_LAYER[s];
    if (s === SURF.shallows && (biome[k] === BIOME.bog || biome[k] === BIOME.river)) li = biome[k] === BIOME.bog ? 3 : 5;
    if (s === SURF.grass) {
      const b = biome[k];
      const f = b === BIOME.pine ? 0.75 : b === BIOME.birch ? 0.45 : b === BIOME.bog ? 0.35 : 0;
      raw[o + FOREST] += f; raw[o + GRASS] += 1 - f;
    } else raw[o + li] += 1;
    // steep ground shows rock whatever it is "made of"
    if (s !== SURF.road && i > 0 && j > 0 && i < dim - 1 && j < dim - 1) {
      const gx = heights[k + 1] - heights[k - 1], gz = heights[k + dim] - heights[k - dim];
      const g = Math.sqrt(gx * gx + gz * gz) / (4 * world.cell);
      const r = Math.min(1, Math.max(0, (g - 0.6) / 0.5));
      if (r > 0) { for (let q = 0; q < L; q++) raw[o + q] *= 1 - r; raw[o + ROCK] += r; }
    }
  }
  const out = new Uint8Array(N * L);
  const acc = new Float32Array(L);
  for (let j = 0; j < dim; j++) for (let i = 0; i < dim; i++) {
    acc.fill(0);
    let tw = 0;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj; if (jj < 0 || jj >= dim) continue;
      for (let di = -1; di <= 1; di++) {
        const ii = i + di; if (ii < 0 || ii >= dim) continue;
        const wgt = (dj === 0 ? 2 : 1) * (di === 0 ? 2 : 1);
        const o = (jj * dim + ii) * L;
        for (let q = 0; q < L; q++) acc[q] += raw[o + q] * wgt;
        tw += wgt;
      }
    }
    // roads keep a crisp edge: no blur for a road sample's own weight
    const o = (j * dim + i) * L;
    for (let q = 0; q < L; q++) out[o + q] = Math.round(Math.min(1, acc[q] / tw) * 255);
  }
  return out;
}

/** Vertex colour: biome tint, a cheap occlusion from how much the ground dips, darker where it is wet. */
function vertexColour(world, si, sj, x, z, y, out) {
  const { dim, heights, biome, water } = world;
  const k = sj * dim + si;
  const t = BIOMES[biome[k]].tint;
  const strong = biome[k] === BIOME.canyon ? 0.95 : 0.55;
  const r = 2;
  const kk = (a, b) => Math.min(dim - 1, Math.max(0, sj + b)) * dim + Math.min(dim - 1, Math.max(0, si + a));
  const around = (heights[kk(r, 0)] + heights[kk(-r, 0)] + heights[kk(0, r)] + heights[kk(0, -r)]) / 4;
  const dip = Math.max(0, Math.min(1, (around - y) / 2.5));
  const ao = 1 - dip * 0.35;
  // damp near water
  let wet = 0;
  for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (!Number.isNaN(water[kk(a, b)])) wet += 0.25;
  const mix = strong;
  out[0] = ((1 - mix) + t[0] * mix) * ao * (1 - wet * 0.25);
  out[1] = ((1 - mix) + t[1] * mix) * ao * (1 - wet * 0.22);
  out[2] = ((1 - mix) + t[2] * mix) * ao * (1 - wet * 0.18);
}
