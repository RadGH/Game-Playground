// The ground.
//
// The world is cut into 64 m chunks. Each chunk is built at one of four detail levels depending on
// how far away it is, and rebuilt when that changes. Two details are worth calling out:
//
//   Skirts. Where a detailed chunk meets a coarse one their edges do not line up exactly, and you
//   get a hairline crack you can see the sky through. Rather than stitch the edges — which means
//   every chunk has to know its neighbours' detail levels — each chunk grows a short vertical
//   curtain around its rim that hangs below the surface. The crack is still there; there is just
//   ground behind it now.
//
//   Splatting. Five ground surfaces (grass, forest floor, rock, sand, snow) are blended per pixel.
//   The WEIGHTS are worked out once per vertex on the processor, from the biome, the slope and the
//   height, because that is where the world data already lives. The shader just blends. Rock is
//   also sampled triplanar — projected from three directions and blended by the surface normal —
//   because a cliff face textured with flat top-down coordinates smears into vertical streaks, and
//   that streaking is the single most obvious "this is a game from 2009" tell there is.

import * as THREE from 'three';
import { enhance } from './materials.js';
import { makeSurface } from './kit/textures.js';
import { BIOMES, BIOME_BY_ID } from './world.js';
import { fbm, clamp, smoothstep } from './noise.js';

/** How the five surfaces tile, and how rough each one is. */
const LAYERS = [
  { key: 'grass',        scale: 0.14, rough: 0.92, tint: 0xffffff },
  { key: 'forest_floor', scale: 0.12, rough: 0.94, tint: 0xffffff },
  { key: 'rock',         scale: 0.055, rough: 0.82, tint: 0xffffff },
  { key: 'sand',         scale: 0.16, rough: 0.88, tint: 0xffffff },
  { key: 'snow',         scale: 0.10, rough: 0.55, tint: 0xffffff },
];

const LOD_RES = [64, 32, 16, 8];     // segments across a 64 m chunk at each detail level
const SKIRT_DROP = 4.0;              // metres the rim curtain hangs down

/**
 * @param {object} world  from world.js
 * @param {object} quality  from quality.js
 */
export function createTerrain(world, quality, { csm } = {}) {
  const chunkSize = quality.terrainChunk || 64;
  const chunksPerSide = Math.round(world.size / chunkSize);
  const group = new THREE.Group();
  group.name = 'terrain';

  // --- textures --------------------------------------------------------------------------------
  const size = quality.textureSize || 512;
  const maps = {};
  for (const layer of LAYERS) {
    const s = makeSurface(layer.key, { size, seed: 7 });
    s.map.anisotropy = quality.anisotropy;
    s.normalMap.anisotropy = quality.anisotropy;
    maps[layer.key] = s;
  }

  // --- material --------------------------------------------------------------------------------
  const uniforms = {
    tGrass:  { value: maps.grass.map },        nGrass:  { value: maps.grass.normalMap },
    tFloor:  { value: maps.forest_floor.map }, nFloor:  { value: maps.forest_floor.normalMap },
    tRock:   { value: maps.rock.map },         nRock:   { value: maps.rock.normalMap },
    tSand:   { value: maps.sand.map },         nSand:   { value: maps.sand.normalMap },
    tSnow:   { value: maps.snow.map },         nSnow:   { value: maps.snow.normalMap },
    uLayerScale: { value: new Float32Array(LAYERS.map(l => l.scale)) },
    uLayerRough: { value: new Float32Array(LAYERS.map(l => l.rough)) },
    uDetailFade: { value: 140.0 },   // metres at which the close-up detail tiling fades out
    uMacroScale: { value: 0.0042 },  // the very large blotches that hide the repeat
    uNormalScale:{ value: 1.15 },
  };

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    dithering: true,
  });

  enhance(material, {
    csm, fog: true, wind: false,
    uniforms,
    defines: { HD_TERRAIN: '' },
    vertex: {
      pars: /* glsl */`
        attribute vec4 aSplat;   // forest, rock, sand, snow  (grass is whatever is left over)
        varying vec4  vSplat;
        varying vec3  vWorld;
        varying float vCamDist;
      `,
      main: /* glsl */`
        vSplat = aSplat;
        vec4 hdWp = modelMatrix * vec4( transformed, 1.0 );
        vWorld = hdWp.xyz;
        vCamDist = length( hdWp.xyz - cameraPosition );
      `,
    },
    fragment: {
      pars: /* glsl */`
        uniform sampler2D tGrass, tFloor, tRock, tSand, tSnow;
        uniform sampler2D nGrass, nFloor, nRock, nSand, nSnow;
        uniform float uLayerScale[5];
        uniform float uLayerRough[5];
        uniform float uDetailFade;
        uniform float uMacroScale;
        uniform float uNormalScale;
        varying vec4  vSplat;
        varying vec3  vWorld;
        varying float vCamDist;

        // Value noise, the same shape as the one the world is built from, so the large-scale
        // blotches in the ground line up with the terrain rather than fighting it.
        float hdHash( vec2 p ) {
          return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
        }
        float hdNoise( vec2 p ) {
          vec2 i = floor( p ), f = fract( p );
          f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( hdHash( i ), hdHash( i + vec2( 1.0, 0.0 ) ), f.x ),
                      mix( hdHash( i + vec2( 0.0, 1.0 ) ), hdHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
        }

        // Project a texture from all three axes and blend by the surface normal. Costs three
        // samples instead of one, so it is used on rock only — the layer that actually needs it.
        vec3 hdTriplanar( sampler2D tex, vec3 p, vec3 n, float s ) {
          vec3 b = pow( abs( n ), vec3( 4.0 ) );
          b /= ( b.x + b.y + b.z );
          vec3 cx = texture2D( tex, p.zy * s ).rgb;
          vec3 cy = texture2D( tex, p.xz * s ).rgb;
          vec3 cz = texture2D( tex, p.xy * s ).rgb;
          return cx * b.x + cy * b.y + cz * b.z;
        }

        // Tangent frame from screen-space derivatives — no tangent attribute needed, which keeps
        // the chunk geometry small.
        vec3 hdPerturb( vec3 eyePos, vec3 surfN, vec3 mapN, vec2 uv ) {
          vec3 q0 = dFdx( eyePos ), q1 = dFdy( eyePos );
          vec2 st0 = dFdx( uv ), st1 = dFdy( uv );
          vec3 N = surfN;
          vec3 q1perp = cross( q1, N );
          vec3 q0perp = cross( N, q0 );
          vec3 T = q1perp * st0.x + q0perp * st1.x;
          vec3 B = q1perp * st0.y + q0perp * st1.y;
          float det = max( dot( T, T ), dot( B, B ) );
          float sc = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
          return normalize( T * ( mapN.x * sc ) + B * ( mapN.y * sc ) + N * mapN.z );
        }

        // Filled in by the map block and read by the roughness and normal blocks below.
        vec3  hdAlbedo = vec3( 0.5 );
        float hdRough  = 0.9;
        vec3  hdNormalTS = vec3( 0.0, 0.0, 1.0 );
      `,
      map: /* glsl */`
        {
          float wForest = vSplat.x, wRock = vSplat.y, wSand = vSplat.z, wSnow = vSplat.w;
          float wGrass = clamp( 1.0 - ( wForest + wRock + wSand + wSnow ), 0.0, 1.0 );

          vec2 p = vWorld.xz;
          vec3 gn = normalize( vec3( 0.0, 1.0, 0.0 ) );
          #ifdef FLAT_SHADED
            gn = normalize( cross( dFdx( vWorld ), dFdy( vWorld ) ) );
          #else
            gn = normalize( vNormal );
          #endif
          vec3 worldN = normalize( ( vec4( gn, 0.0 ) * viewMatrix ).xyz );

          vec3 col = vec3( 0.0 );
          vec3 nrm = vec3( 0.0 );
          float rgh = 0.0;

          if ( wGrass > 0.002 ) {
            vec2 uv = p * uLayerScale[ 0 ];
            col += texture2D( tGrass, uv ).rgb * wGrass;
            nrm += ( texture2D( nGrass, uv ).xyz * 2.0 - 1.0 ) * wGrass;
            rgh += uLayerRough[ 0 ] * wGrass;
          }
          if ( wForest > 0.002 ) {
            vec2 uv = p * uLayerScale[ 1 ];
            col += texture2D( tFloor, uv ).rgb * wForest;
            nrm += ( texture2D( nFloor, uv ).xyz * 2.0 - 1.0 ) * wForest;
            rgh += uLayerRough[ 1 ] * wForest;
          }
          if ( wRock > 0.002 ) {
            col += hdTriplanar( tRock, vWorld, worldN, uLayerScale[ 2 ] ) * wRock;
            vec2 uv = p * uLayerScale[ 2 ];
            nrm += ( texture2D( nRock, uv ).xyz * 2.0 - 1.0 ) * wRock;
            rgh += uLayerRough[ 2 ] * wRock;
          }
          if ( wSand > 0.002 ) {
            vec2 uv = p * uLayerScale[ 3 ];
            col += texture2D( tSand, uv ).rgb * wSand;
            nrm += ( texture2D( nSand, uv ).xyz * 2.0 - 1.0 ) * wSand;
            rgh += uLayerRough[ 3 ] * wSand;
          }
          if ( wSnow > 0.002 ) {
            vec2 uv = p * uLayerScale[ 4 ];
            col += texture2D( tSnow, uv ).rgb * wSnow;
            nrm += ( texture2D( nSnow, uv ).xyz * 2.0 - 1.0 ) * wSnow;
            rgh += uLayerRough[ 4 ] * wSnow;
          }

          // Large-scale blotching. Without this the same 512 px tile is visible as a grid from a
          // hillside, however good the tile itself is.
          float macro = hdNoise( p * uMacroScale * 100.0 ) * 0.5 + hdNoise( p * uMacroScale * 31.0 ) * 0.5;
          col *= mix( 0.84, 1.16, macro );

          // A second, much finer tiling faded in only up close, so the ground has grain when you
          // stand on it and does not shimmer when you look at the horizon.
          float near = 1.0 - smoothstep( uDetailFade * 0.35, uDetailFade, vCamDist );
          if ( near > 0.01 ) {
            vec3 det = texture2D( tGrass, p * uLayerScale[ 0 ] * 7.0 ).rgb;
            col = mix( col, col * ( det * 1.55 + 0.25 ), near * 0.30 );
          }

          hdAlbedo = col;
          hdRough = clamp( rgh, 0.04, 1.0 );
          hdNormalTS = normalize( vec3( nrm.xy * uNormalScale, max( nrm.z, 0.15 ) ) );

          diffuseColor.rgb *= hdAlbedo;
        }
      `,
      rough: /* glsl */`
        float roughnessFactor = roughness * hdRough;
      `,
      normal: /* glsl */`
        normal = hdPerturb( -vViewPosition, normal, hdNormalTS, vWorld.xz * uLayerScale[ 0 ] );
      `,
    },
  });

  // --- chunk bookkeeping -----------------------------------------------------------------------
  const chunks = new Map();          // "cx,cz" -> { mesh, lod, cx, cz, centre }
  const geoCache = new Map();        // "cx,cz,lod" -> BufferGeometry
  const pending = [];
  const half = world.size / 2;
  const _c = new THREE.Vector3();

  /** Which detail level a chunk at this distance deserves. */
  function lodFor(dist) {
    if (dist < 110) return 0;
    if (dist < 240) return 1;
    if (dist < 460) return 2;
    return 3;
  }

  /** Build one chunk's geometry at one detail level. Cached, because flying back and forth
   *  between two distances would otherwise rebuild the same mesh over and over. */
  function buildGeometry(cx, cz, lod) {
    const key = `${cx},${cz},${lod}`;
    const cached = geoCache.get(key);
    if (cached) return cached;

    const res = LOD_RES[lod];
    const step = chunkSize / res;
    const ox = -half + cx * chunkSize;
    const oz = -half + cz * chunkSize;
    const n = res + 1;

    // n*n surface vertices, plus a ring of n*4 skirt vertices hanging off the rim
    const vertCount = n * n + n * 4;
    const pos = new Float32Array(vertCount * 3);
    const nor = new Float32Array(vertCount * 3);
    const uv = new Float32Array(vertCount * 2);
    const col = new Float32Array(vertCount * 3);
    const splat = new Float32Array(vertCount * 4);

    const nrm = { x: 0, y: 1, z: 0 };
    let v = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++, v++) {
        const x = ox + i * step, z = oz + j * step;
        const y = world.heightAt(x, z);
        pos[v * 3] = x - ox - chunkSize / 2;      // chunk-local, so float precision stays good
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z - oz - chunkSize / 2;
        world.normalAt(x, z, nrm);
        nor[v * 3] = nrm.x; nor[v * 3 + 1] = nrm.y; nor[v * 3 + 2] = nrm.z;
        uv[v * 2] = i / res; uv[v * 2 + 1] = j / res;
        writeSurface(world, x, z, y, nrm, splat, col, v);
      }
    }

    // the skirt: copy each rim vertex, drop it, and keep its splat/colour so the curtain matches
    const skirtStart = v;
    const rim = [];
    for (let i = 0; i < n; i++) rim.push(i);                       // south edge (j = 0)
    for (let j = 0; j < n; j++) rim.push(j * n + (n - 1));         // east edge
    for (let i = n - 1; i >= 0; i--) rim.push((n - 1) * n + i);    // north edge
    for (let j = n - 1; j >= 0; j--) rim.push(j * n);              // west edge
    for (const src of rim) {
      pos[v * 3] = pos[src * 3];
      pos[v * 3 + 1] = pos[src * 3 + 1] - SKIRT_DROP;
      pos[v * 3 + 2] = pos[src * 3 + 2];
      nor[v * 3] = nor[src * 3]; nor[v * 3 + 1] = nor[src * 3 + 1]; nor[v * 3 + 2] = nor[src * 3 + 2];
      uv[v * 2] = uv[src * 2]; uv[v * 2 + 1] = uv[src * 2 + 1];
      col[v * 3] = col[src * 3]; col[v * 3 + 1] = col[src * 3 + 1]; col[v * 3 + 2] = col[src * 3 + 2];
      splat[v * 4] = splat[src * 4]; splat[v * 4 + 1] = splat[src * 4 + 1];
      splat[v * 4 + 2] = splat[src * 4 + 2]; splat[v * 4 + 3] = splat[src * 4 + 3];
      v++;
    }

    const idx = [];
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    for (let k = 0; k < rim.length - 1; k++) {
      const top = rim[k], top2 = rim[k + 1];
      const bot = skirtStart + k, bot2 = skirtStart + k + 1;
      idx.push(top, bot, top2, top2, bot, bot2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.userData.key = key;

    // keep the cache from growing without bound as the camera roams
    if (geoCache.size > 420) {
      const oldest = geoCache.keys().next().value;
      geoCache.get(oldest)?.dispose();
      geoCache.delete(oldest);
    }
    geoCache.set(key, geo);
    return geo;
  }

  /** Decide how much of each surface shows at one point, and what colour to tint it. */
  function writeSurface(w, x, z, y, nrm, splat, col, v) {
    const slope = clamp((1 - nrm.y) * 2.6, 0, 1);
    const biome = w.biomeAt(x, z);
    const b = BIOME_BY_ID[biome] || BIOMES.meadow;

    // Rock shows on anything steep, and everywhere in the crags. The start of the ramp matters:
    // at 0.30 it began showing on ground gentle enough to walk up, which put grey patches across
    // whole hillsides that should have been grass.
    let wRock = smoothstep(0.42, 0.78, slope);
    if (biome === BIOMES.crags.id) wRock = Math.max(wRock, 0.72);
    if (biome === BIOMES.moor.id) wRock = Math.max(wRock, 0.20);

    // sand hugs the waterline and the shore biome
    const aboveWater = y - w.waterLevel;
    let wSand = (1 - smoothstep(0.4, 4.0, aboveWater)) * (1 - wRock * 0.6);
    if (biome === BIOMES.shore.id) wSand = Math.max(wSand, 0.80);
    if (aboveWater < -0.5) wSand = Math.max(wSand, 0.9);   // the sea floor

    // snow takes the tops, more on the flat than on a cliff face
    let wSnow = smoothstep(w.snowLine - 12, w.snowLine + 6, y) * (1 - slope * 0.75);
    // a ragged edge, so the snow line is not a contour drawn with a ruler
    wSnow *= clamp(fbm(x * 0.03, z * 0.03, { seed: 4242, octaves: 3 }) * 1.9 - 0.25, 0, 1) + 0.25;
    wSnow = clamp(wSnow, 0, 1);

    // forest floor under the woods
    let wForest = 0;
    if (biome === BIOMES.pinewood.id) wForest = 0.72;
    else if (biome === BIOMES.deepwood.id) wForest = 0.9;
    else if (biome === BIOMES.birchwood.id) wForest = 0.45;
    else if (biome === BIOMES.marsh.id) wForest = 0.6;
    wForest *= (1 - wRock) * (1 - wSand) * (1 - wSnow);
    // break the biome edge up so it is not a hard border
    wForest *= clamp(fbm(x * 0.05 + 11, z * 0.05 - 7, { seed: 1717, octaves: 3 }) * 1.6 - 0.1, 0, 1.2);

    const total = wForest + wRock + wSand + wSnow;
    const k = total > 1 ? 1 / total : 1;
    splat[v * 4] = wForest * k;
    splat[v * 4 + 1] = wRock * k;
    splat[v * 4 + 2] = wSand * k;
    splat[v * 4 + 3] = wSnow * k;

    // Vertex colour: the biome's own tint, plus a cheap baked occlusion from how much the ground
    // dips around this point — hollows read darker, which is what your eye expects.
    const t = b.tint;
    const around = (w.heightAt(x + 3, z) + w.heightAt(x - 3, z) + w.heightAt(x, z + 3) + w.heightAt(x, z - 3)) / 4;
    const dip = clamp((around - y) / 3, -1, 1);
    const ao = clamp(1 - Math.max(0, dip) * 0.42, 0.55, 1);
    const wet = smoothstep(2.0, -0.5, aboveWater) * 0.35;   // damp sand right at the edge
    // How much of the biome's colour is allowed over the texture's own. Above about a half the
    // meadow goes neon and the ground stops reading as a surface with a texture on it.
    const tintMix = 0.40;
    col[v * 3]     = ((1 - tintMix) + t[0] * tintMix) * ao * (1 - wet * 0.5);
    col[v * 3 + 1] = ((1 - tintMix) + t[1] * tintMix) * ao * (1 - wet * 0.45);
    col[v * 3 + 2] = ((1 - tintMix) + t[2] * tintMix) * ao * (1 - wet * 0.35);
  }

  /** Make sure the chunk exists at the right detail level. Cheap when nothing changed. */
  function ensureChunk(cx, cz, lod) {
    const key = `${cx},${cz}`;
    let c = chunks.get(key);
    if (c && c.lod === lod) return c;
    const geo = buildGeometry(cx, cz, lod);
    if (c) {
      c.mesh.geometry = geo;
      c.lod = lod;
      return c;
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(-half + cx * chunkSize + chunkSize / 2, 0, -half + cz * chunkSize + chunkSize / 2);
    // Set per frame from the distance — a hillside casting a shadow onto the valley behind it is
    // worth having up close and is four extra draws a chunk out at the horizon.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = `chunk_${cx}_${cz}`;
    group.add(mesh);
    c = { mesh, lod, cx, cz };
    chunks.set(key, c);
    return c;
  }

  let builtThisFrame = 0;
  /**
   * Bring the visible chunks up to date. `budget` caps how many chunks may be built in one frame:
   * building the whole view distance at once is a two-second freeze, and doing it over ten frames
   * is invisible.
   */
  function update(cameraPos, budget = 3) {
    builtThisFrame = 0;
    const view = quality.terrainViewDistance;
    const ccx = Math.floor((cameraPos.x + half) / chunkSize);
    const ccz = Math.floor((cameraPos.z + half) / chunkSize);
    const reach = Math.ceil(view / chunkSize) + 1;

    const wanted = new Set();
    const todo = [];
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < 0 || cz < 0 || cx >= chunksPerSide || cz >= chunksPerSide) continue;
        _c.set(-half + cx * chunkSize + chunkSize / 2, 0, -half + cz * chunkSize + chunkSize / 2);
        const dist = Math.hypot(_c.x - cameraPos.x, _c.z - cameraPos.z);
        if (dist > view + chunkSize) continue;
        wanted.add(`${cx},${cz}`);
        const lod = lodFor(dist);
        const have = chunks.get(`${cx},${cz}`);
        if (have) have.mesh.castShadow = dist < quality.shadowDistance;
        if (!have || have.lod !== lod) todo.push({ cx, cz, lod, dist });
      }
    }

    // nearest first — a hole under your feet matters far more than one on the horizon
    todo.sort((a, b) => a.dist - b.dist);
    for (const t of todo) {
      if (builtThisFrame >= budget) break;
      ensureChunk(t.cx, t.cz, t.lod);
      builtThisFrame++;
    }

    // retire what has fallen out of range
    for (const [key, c] of chunks) {
      if (!wanted.has(key)) { group.remove(c.mesh); chunks.delete(key); }
    }
  }

  /** Build everything within `radius` right now — used once, while the loading screen is up. */
  function preload(centre, radius = 200) {
    const reach = Math.ceil(radius / chunkSize);
    const ccx = Math.floor((centre.x + half) / chunkSize);
    const ccz = Math.floor((centre.z + half) / chunkSize);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < 0 || cz < 0 || cx >= chunksPerSide || cz >= chunksPerSide) continue;
        const d = Math.hypot((cx + 0.5) * chunkSize - half - centre.x, (cz + 0.5) * chunkSize - half - centre.z);
        ensureChunk(cx, cz, lodFor(d));
      }
    }
  }

  return {
    group, material, maps, chunks, update, preload,
    get chunkCount() { return chunks.size; },
    get builtLastFrame() { return builtThisFrame; },
    dispose() {
      for (const g of geoCache.values()) g.dispose();
      geoCache.clear(); chunks.clear();
      material.dispose();
      for (const s of Object.values(maps)) for (const t of Object.values(s)) t.dispose?.();
    },
  };
}
