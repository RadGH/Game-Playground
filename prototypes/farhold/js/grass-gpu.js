// Farhold round 23 — a field of grass drawn on the graphics card, for a planet that streams.
//
//   const grass = createGpuGrass(scene, { terrain, view, props, features, gfx });
//   grass.update(player.x, player.z, player.y);     // every frame
//   grass.setVisible(on);
//
// Borrowed from highdef-3d/js/grass.js, and the idea that matters is the same: AN INSTANCE IS A
// SLOT, NOT A BLADE. There is one patch of blades that follows you, and which square of ground a
// slot draws comes from where the patch's centre is — but the centre moves in WHOLE squares, and
// every blade property (where in its square it stands, which way it faces, how tall it is) is a hash
// of the square's own whole-number coordinates. So the same ground always grows the same blade,
// whichever slot happens to be drawing it, and walking through the field moves you past the grass
// instead of dragging it along. (highdef-3d/README.md "The grass belongs to the ground" is the long
// version; an instance at a fixed offset from a moving centre crawls, and no still screenshot shows
// it.)
//
// What had to change for Farhold, whose world is not one 1024 m heightmap but a 160 km planet:
//
//   HEIGHT. highdef uploads the whole world's heightmap once. Farhold has no such array — but the
//   innermost clipmap ring (js/terrain.js) already samples `terrain.heightAt` on a 2 m lattice round
//   the player, and that lattice IS the ground you see. So its height array goes to the card as a
//   float texture (97 x 97, 37 KB) whenever the ring rebuilds, and the shader interpolates it with
//   the SAME diagonal the ring's triangles use. A blade therefore stands on the drawn triangle, not
//   on a smooth surface a few centimetres above or below it — the thing highdef's README calls the
//   most common way a world like this feels wrong.
//
//   WHERE IT GROWS. A 128 x 128 texture, 1 m a texel, WRAPPING (toroidal): texel (i, j) holds
//   whichever world metre is congruent to it and nearest the player. Walking only re-samples the
//   strip of texels that just came into range — a few hundred cheap terrain queries a frame — and
//   the shader reads it by world position with repeat wrapping, so there is never a seam or a copy.
//   Each texel says how dense the grass is and what colour (js/grass-plan.js): plantable ground, no
//   road, no levelled plot, not the middle of a town, and nothing on sand, ice or ash.
//
//   PRECISION. 30 km from the origin a float32 is good to a couple of centimetres, which is enough
//   to make a lattice square jump between neighbours. So the lattice is addressed in WHOLE numbers
//   (the patch origin as an integer square, offsets as integers), the hash is an integer hash, and
//   every position the shader builds is relative to the patch origin.

import * as THREE from 'three';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { grassAt, grassTintFor } from './grass-plan.js';
import { hex } from './sky-palette.js';

const MASK_N = 128;          // texels across the wrapping mask
const MASK_M = 1;            // metres a texel

function bladeGeometry(segments = 3) {
  const pos = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = (1 - t * t) * 0.5;
    pos.push(-w, t, 0, w, t, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export function createGpuGrass(scene, { terrain, view, props = null, features = null, gfx }) {
  const radius = gfx.grassRadius || 38;
  const target = gfx.grassBlades || 70000;
  // up to four blades per square, the extra ones only near the centre (highdef's RINGS)
  const RINGS = [1, 0.55, 0.3, 0.16];
  const spread = RINGS.reduce((a, f) => a + f * f, 0);
  const cell = Math.sqrt((Math.PI * radius * radius * spread) / target);
  const half = Math.ceil(radius / cell);
  const pts = [];
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      const d = Math.hypot(i * cell, j * cell);
      if (d > radius) continue;
      for (let k = 0; k < RINGS.length; k++) {
        const lim = radius * RINGS[k];
        if (d > lim) break;
        pts.push([i, j, d, k, lim]);
      }
    }
  }
  pts.sort((a, b) => (a[2] - b[2]) || (a[3] - b[3]));
  const count = pts.length;
  const offsets = new Float32Array(count * 2), slots = new Float32Array(count * 2);
  for (let n = 0; n < count; n++) {
    offsets[n * 2] = pts[n][0]; offsets[n * 2 + 1] = pts[n][1];
    slots[n * 2] = pts[n][3]; slots[n * 2 + 1] = pts[n][4];
  }
  const geo = bladeGeometry(3);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slots, 2));
  geo.instanceCount = count;

  // ------------------------------------------------------------------ the mask (wrapping)
  const maskData = new Uint8Array(MASK_N * MASK_N * 4);
  const held = new Int32Array(MASK_N * MASK_N * 2).fill(-2147483648);
  const maskTex = new THREE.DataTexture(maskData, MASK_N, MASK_N, THREE.RGBAFormat, THREE.UnsignedByteType);
  maskTex.wrapS = maskTex.wrapT = THREE.RepeatWrapping;
  maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter;
  maskTex.generateMipmaps = false;
  // the tint bytes are sRGB, like every colour a person picked; the density in alpha is untouched
  maskTex.colorSpace = THREE.SRGBColorSpace;
  maskTex.needsUpdate = true;

  // ------------------------------------------------------------------ the height (ring 0)
  const ring = () => view?.rings?.[0] || null;
  let heightTex = null, heightSrc = null, heightVersion = -1;

  const uniforms = {
    tMask: { value: maskTex },
    tHeight: { value: null },
    uMaskSize: { value: MASK_N * MASK_M },
    uOriginCell: { value: new THREE.Vector2() },
    uCell: { value: cell },
    uRadius: { value: radius },
    uHOrigin: { value: new THREE.Vector2() },
    uHCell: { value: 2 },
    uHRes: { value: 96 },
    uPlayer: { value: new THREE.Vector3(0, -1e4, 0) },
    uBlade: { value: new THREE.Vector2(0.07, 0.36) },
    uDensity: { value: 1 },
  };

  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  material.userData.fhWet = false;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aOffset;
        attribute vec2 aSlot;
        uniform sampler2D tMask;
        uniform highp sampler2D tHeight;
        uniform float uMaskSize, uCell, uRadius, uHCell, uHRes, uDensity;
        uniform vec2 uOriginCell, uHOrigin, uBlade;
        uniform vec3 uPlayer;
        uniform float uFhTime;
        uniform vec2 uFhWindDir;
        uniform float uFhWind, uFhGust;
        varying vec3 vFhGrass;
        // pcg4d — an integer hash, so a square 30 km from the origin hashes as cleanly as one at 0
        vec4 fhHash( ivec2 c, int k ) {
          uvec4 v = uvec4( uint( c.x ), uint( c.y ), uint( k ), 0x2545f491u );
          v = v * 1664525u + 1013904223u;
          v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
          v ^= v >> 16u;
          v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
          return vec4( v ) / 4294967296.0;
        }
        // height and slope (rise per metre along x and z) of the ring's own triangles: quads split
        // along the (x+1, z) -> (x, z+1) diagonal, four texel reads for all three numbers
        vec3 fhGround( vec2 p ) {
          vec2 g = p / uHCell;
          ivec2 i = ivec2( floor( g ) );
          i = clamp( i, ivec2( 0 ), ivec2( int( uHRes ) - 1 ) );
          vec2 f = clamp( g - vec2( i ), 0.0, 1.0 );
          float ha = texelFetch( tHeight, i, 0 ).r;
          float hb = texelFetch( tHeight, i + ivec2( 1, 0 ), 0 ).r;
          float hc = texelFetch( tHeight, i + ivec2( 0, 1 ), 0 ).r;
          float hd = texelFetch( tHeight, i + ivec2( 1, 1 ), 0 ).r;
          return f.x + f.y <= 1.0
            ? vec3( ha + ( hb - ha ) * f.x + ( hc - ha ) * f.y, ( hb - ha ) / uHCell, ( hc - ha ) / uHCell )
            : vec3( hd + ( hc - hd ) * ( 1.0 - f.x ) + ( hb - hd ) * ( 1.0 - f.y ), ( hd - hc ) / uHCell, ( hd - hb ) / uHCell );
        }`)
      .replace('#include <beginnormal_vertex>', `
        ivec2 fhCellId = ivec2( uOriginCell + aOffset );
        vec4 fhR1 = fhHash( fhCellId, int( aSlot.x ) );
        vec4 fhR2 = fhHash( fhCellId, int( aSlot.x ) + 17 );
        // relative to the patch origin — small numbers, whatever the world coordinate
        vec2 fhLocal = ( aOffset + ( fhR1.xy - 0.5 ) * 0.92 ) * uCell;
        vec2 fhWorld = uOriginCell * uCell + fhLocal;
        vec4 fhMask = texture2D( tMask, fhWorld / uMaskSize );
        float fhGrow = fhMask.a * uDensity;
        vec2 fhHp = fhLocal - uHOrigin;
        vec3 fhG = fhGround( fhHp );
        float fhH = fhG.x;
        float fhSlope = length( fhG.yz );
        fhGrow *= 1.0 - smoothstep( 0.55, 0.95, fhSlope );
        float fhDist = length( fhLocal - ( uPlayer.xz - uOriginCell * uCell ) );
        float fhEdge = 1.0 - smoothstep( aSlot.y * 0.72, aSlot.y, fhDist );
        float fhCut = fhR1.z * 0.92 + 0.04;
        float fhKeep = smoothstep( fhCut - 0.1, fhCut + 0.06, fhGrow * fhEdge );
        float fhRh = 0.6 + fhR2.x * 0.8;
        float fhHeight = uBlade.y * fhRh * ( 0.55 + fhGrow * 0.6 ) * fhKeep;
        float fhWidth = uBlade.x * ( 0.7 + fhRh * 0.5 ) * fhKeep;
        float fhAng = fhR1.w * 6.2831853;
        vec2 fhFace = vec2( cos( fhAng ), sin( fhAng ) );
        vec3 objectNormal = normalize( vec3( fhFace.x * 0.3, 1.0, fhFace.y * 0.3 ) );
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( 1.0, 0.0, 0.0 );
        #endif`)
      .replace('#include <begin_vertex>', `
        float fhT = position.y;
        // the wind, from the one shared source (js/wind.js through js/atmosphere.js)
        float fhPh = fhR2.y * 6.2831853;
        float fhGust = 0.55 + 0.45 * sin( uFhTime * 0.31 + fhWorld.x * 0.013 + fhWorld.y * 0.009 );
        float fhWave = sin( uFhTime * ( 1.6 + uFhWind * 1.4 ) + fhPh + fhWorld.x * 0.35 + fhWorld.y * 0.27 );
        float fhFlick = sin( uFhTime * 6.1 + fhPh * 2.7 ) * 0.18;
        float fhBend = ( uFhWind * ( 0.45 + 0.5 * uFhGust ) + ( fhWave + fhFlick ) * fhGust * ( 0.15 + uFhWind * 0.4 ) ) * fhT * fhT;
        // the player pushes it aside
        vec2 fhAway = fhWorld - uPlayer.xz;
        float fhPd = length( fhAway );
        float fhPush = ( 1.0 - smoothstep( 0.0, 1.5, fhPd ) ) * step( abs( uPlayer.y - fhH ), 2.2 );
        vec2 fhPushDir = fhPd > 0.001 ? fhAway / fhPd : vec2( 1.0, 0.0 );
        vec3 transformed = vec3( position.x * fhWidth * fhFace.x, fhT * fhHeight, position.x * fhWidth * fhFace.y );
        transformed.xz += uFhWindDir * fhBend * fhHeight;
        transformed.xz += fhPushDir * fhPush * 0.55 * fhT * fhHeight * 2.0;
        transformed.y -= ( abs( fhBend ) * 0.35 + fhPush * 0.5 * fhT ) * fhHeight * 0.45;
        transformed += vec3( fhLocal.x, fhH, fhLocal.y );
        // colour: the mask's tint, darker at the root, lighter at the tip
        vFhGrass = fhMask.rgb * mix( 0.5, 1.12, fhT ) * ( 0.85 + fhR2.z * 0.3 );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFhGrass;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vFhGrass;');
  };
  material.customProgramCacheKey = () => 'farhold-gpu-grass-v1';

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.name = 'farhold-grass-gpu';
  mesh.renderOrder = 1;
  scene.add(mesh);

  let visible = true;
  let townList = [], townAt = [Infinity, Infinity];
  let clearedVersion = -1;
  const stats = { sampled: 0, pending: 0, blades: count, cell };

  /** Everything a texel needs to know, from the terrain and the world. */
  function sampleTexel(wx, wz, o) {
    const x = (wx + 0.5) * MASK_M, z = (wz + 0.5) * MASK_M;
    const id = terrain.biomeIdAt(x, z);
    const key = BIOMES[id]?.key;
    let town = 0;
    for (const t of townList) {
      const d = Math.hypot(t.wx - x, t.wz - z);
      const r = 30 + (t.size || 1) * 15;
      // 1 in the middle of the town, gone by its edge: streets and yards, not a lawn
      town = Math.max(town, Math.min(1, Math.max(0, (r * 1.05 - d) / (r * 0.35))));
    }
    const d = grassAt({
      biomeKey: key,
      plantable: terrain.plantable(x, z),
      road: terrain.roadAt(x, z),
      cleared: props?.isCleared ? props.isCleared(x, z) : false,
      town: Math.max(0, town),
    });
    const tint = hex(grassTintFor(key));
    // a slow wobble in the colour so a meadow is not one flat green
    const wob = 0.9 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.1));
    maskData[o] = Math.min(255, tint[0] * wob * 255);
    maskData[o + 1] = Math.min(255, tint[1] * wob * 255);
    maskData[o + 2] = Math.min(255, tint[2] * wob * 255);
    maskData[o + 3] = Math.round(d * 255);
  }

  /** Re-sample the texels that should now hold different ground, up to `budget` of them. */
  function refreshMask(px, pz, budget) {
    const cx = Math.floor(px / MASK_M), cz = Math.floor(pz / MASK_M);
    const x0 = cx - MASK_N / 2, z0 = cz - MASK_N / 2;
    let done = 0, pending = 0;
    for (let j = 0; j < MASK_N; j++) {
      const wz = z0 + ((((j - z0) % MASK_N) + MASK_N) % MASK_N);
      for (let i = 0; i < MASK_N; i++) {
        const wx = x0 + ((((i - x0) % MASK_N) + MASK_N) % MASK_N);
        const t = j * MASK_N + i;
        if (held[t * 2] === wx && held[t * 2 + 1] === wz) continue;
        if (done >= budget) { pending++; continue; }
        sampleTexel(wx, wz, t * 4);
        held[t * 2] = wx; held[t * 2 + 1] = wz;
        done++;
      }
    }
    if (done) maskTex.needsUpdate = true;
    stats.sampled += done;
    stats.pending = pending;
    return done;
  }

  function refreshHeight() {
    const r = ring();
    if (!r || !r._heights) return false;
    if (heightSrc !== r._heights) {
      heightTex?.dispose();
      heightSrc = r._heights;
      heightTex = new THREE.DataTexture(heightSrc, r.res + 1, r.res + 1, THREE.RedFormat, THREE.FloatType);
      heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter;
      heightTex.generateMipmaps = false;
      uniforms.tHeight.value = heightTex;
      heightVersion = -1;
    }
    const v = r.version ?? 0;
    if (v !== heightVersion) {
      heightVersion = v;
      heightTex.needsUpdate = true;
      uniforms.uHRes.value = r.res;
      uniforms.uHCell.value = r.cell;
      r.__grassCentre = [r.centre[0], r.centre[1]];
    }
    return true;
  }

  return {
    mesh, material, uniforms, stats, count, cell,
    get visible() { return visible; },
    setVisible(on) { visible = !!on; mesh.visible = visible; },
    setDensity(k) { uniforms.uDensity.value = Math.max(0, Math.min(3, k)); },
    /** Throw away the whole mask — the ground under it changed (a clearing, a new world). */
    invalidate() { held.fill(-2147483648); },
    update(px, pz, py) {
      if (!visible) return;
      if (!refreshHeight()) { mesh.visible = false; return; }
      // a settlement list near the player, refreshed as you move, so a texel asks a handful
      if (features?.settlements && Math.hypot(px - townAt[0], pz - townAt[1]) > 60) {
        townAt = [px, pz];
        townList = features.settlements.filter(s => Math.hypot(s.wx - px, s.wz - pz) < 400);
        held.fill(-2147483648);
      }
      const cv = props?.clearedVersion ?? 0;
      if (cv !== clearedVersion) { clearedVersion = cv; held.fill(-2147483648); }
      refreshMask(px, pz, 2200);
      const oc = [Math.round(px / cell), Math.round(pz / cell)];
      uniforms.uOriginCell.value.set(oc[0], oc[1]);
      const r = ring();
      const c = r.__grassCentre || r.centre;
      const halfExt = r.res * r.cell / 2;
      // the height texture's texel (0, 0), relative to the patch origin — worked in doubles here
      uniforms.uHOrigin.value.set(c[0] - halfExt - oc[0] * cell, c[1] - halfExt - oc[1] * cell);
      uniforms.uPlayer.value.set(px, py ?? terrain.heightAt(px, pz), pz);
      mesh.position.set(oc[0] * cell, 0, oc[1] * cell);
      mesh.visible = true;
    },
    dispose() {
      scene.remove(mesh); geo.dispose(); material.dispose(); maskTex.dispose(); heightTex?.dispose();
    },
  };
}
