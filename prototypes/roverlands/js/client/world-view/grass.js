// Grass blades that follow the camera — highdef-3d/js/grass.js's technique, with a Roverlands mask.
//
// A copy rather than an import because highdef's version reads its own biome table to decide where grass grows.
// Kept as-is from there: an instance is a SLOT on a lattice fixed in the world (so the field never crawls as you
// drive), everything about a blade is hashed from its square, wind bends the tip, blades collapse to nothing where
// grass does not grow. Changed here:
//   * the mask comes from SURFACES (lush on grass, sparse on dirt/farm/mud, none on road, sand, rock, snow, ice,
//     water) and thins to nothing within ~2.5 m of a road's driving edge;
//   * the height texture is read with texelFetch and blended by hand. Phones often cannot filter float textures,
//     and an unfiltered lookup made blades float or sink by up to half a metre between samples.
//   * up to four vehicle positions push the blades aside (uPush[4]), not just one walker.

import * as THREE from 'three';
import { enhance } from '../../../../../highdef-3d/js/materials.js';
import { SURF } from '../../world/world-data.js';

const DENSITY = { [SURF.grass]: 1.0, [SURF.dirt]: 0.22, [SURF.mud]: 0.18, [SURF.farm]: 0.28, [SURF.gravel]: 0.05 };

function bladeGeometry(segments = 3) {
  const pos = [], nor = [], uvs = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, w = (1 - t * t) * 0.5;
    pos.push(-w, t, 0, w, t, 0); nor.push(0, 0, 1, 0, 0, 1); uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < segments; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** One texel per height sample: r = how much grass grows, g = how lush (not dry), b = slope. */
function maskTexture(world) {
  const { dim, surface, roadDist, water, heights, biome } = world;
  const data = new Uint8Array(dim * dim * 4);
  for (let j = 0; j < dim; j++) for (let i = 0; i < dim; i++) {
    const k = j * dim + i;
    let d = DENSITY[surface[k]] || 0;
    d *= Math.min(1, Math.max(0, (roadDist[k] - 0.3) / 2.5));
    if (!Number.isNaN(water[k])) d = 0;
    const i0 = Math.max(0, i - 1), i1 = Math.min(dim - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(dim - 1, j + 1);
    const gx = heights[j * dim + i1] - heights[j * dim + i0], gz = heights[j1 * dim + i] - heights[j0 * dim + i];
    const sl = Math.sqrt(gx * gx + gz * gz) / (4 * world.cell);
    d *= Math.max(0, 1 - sl * 1.6);
    const b = biome[k];
    const o = k * 4;
    data[o] = Math.round(Math.min(1, d) * 255);
    data[o + 1] = b === 6 || b === 5 ? 60 : b === 8 ? 150 : 220;   // dunes / canyon / farm grass is drier
    data[o + 2] = Math.round(Math.min(1, sl) * 255);
    data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, dim, dim, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function createGrass(world, quality, { csm } = {}) {
  const radius = quality.grassDistance || 0;
  if (!quality.grass || radius <= 0) return { mesh: null, update() {}, setPush() {}, dispose() {}, count: 0 };

  const RINGS = [1, 0.55, 0.30, 0.16];
  const density = 55 * (quality.grassDensity || 1);
  const target = Math.min(300000, Math.round(Math.PI * radius * radius * density * 0.25));
  const spread = RINGS.reduce((a, f) => a + f * f, 0);
  const cell = Math.sqrt((Math.PI * radius * radius * spread) / Math.max(1, target));
  const hc = Math.ceil(radius / cell);
  const pts = [];
  for (let j = -hc; j <= hc; j++) for (let i = -hc; i <= hc; i++) {
    const x = i * cell, z = j * cell, d2 = x * x + z * z;
    if (d2 > radius * radius) continue;
    const d = Math.sqrt(d2);
    for (let k = 0; k < RINGS.length; k++) { const lim = radius * RINGS[k]; if (d > lim) break; pts.push([x, z, d2, k, lim]); }
  }
  pts.sort((a, b) => (a[2] - b[2]) || (a[3] - b[3]));
  const count = pts.length;
  const offsets = new Float32Array(count * 2), slots = new Float32Array(count * 2);
  pts.forEach((p, i) => { offsets[i * 2] = p[0]; offsets[i * 2 + 1] = p[1]; slots[i * 2] = p[3]; slots[i * 2 + 1] = p[4]; });
  const geo = bladeGeometry(3);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slots, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.5);

  const tHeight = new THREE.DataTexture(world.heights, world.dim, world.dim, THREE.RedFormat, THREE.FloatType);
  tHeight.minFilter = tHeight.magFilter = THREE.NearestFilter;
  tHeight.generateMipmaps = false; tHeight.needsUpdate = true;
  const tMask = maskTexture(world);

  const uniforms = {
    tHeight: { value: tHeight }, tMask: { value: tMask },
    uWorldSize: { value: world.size }, uDim: { value: world.dim }, uCellM: { value: world.cell },
    uOrigin: { value: new THREE.Vector3() }, uCell: { value: cell },
    uBlade: { value: new THREE.Vector2(0.03, 0.40) },
    uPush: { value: [new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0)] },
    uTipColor: { value: new THREE.Color(0x8fb055) }, uBaseColor: { value: new THREE.Color(0x384b2a) }, uDryColor: { value: new THREE.Color(0x9b8a52) },
  };
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95, metalness: 0, color: 0xffffff, dithering: true });
  enhance(material, {
    csm, fog: true, wind: false, uniforms, defines: { RL_GRASS: '' },
    vertex: {
      pars: /* glsl */`
        attribute vec2 aOffset; attribute vec2 aSlot;
        uniform highp sampler2D tHeight; uniform sampler2D tMask;
        uniform float uWorldSize, uDim, uCellM, uCell;
        uniform vec3 uOrigin; uniform vec2 uBlade; uniform vec4 uPush[4];
        uniform float uTime; uniform vec3 uWindDir; uniform float uWindStrength; uniform float uWindSpeed;
        varying float vBladeT; varying float vDry; varying float vGrow;
        vec4 rlHash4( vec2 p ) {
          vec4 q = fract( vec4( p.xyxy ) * vec4( 0.1031, 0.1030, 0.0973, 0.1099 ) );
          q += dot( q, q.wzxy + 33.33 );
          return fract( ( q.xxyz + q.yzzw ) * q.zywx );
        }
        float rlHeight( vec2 p ) {
          vec2 f = ( p + uWorldSize * 0.5 ) / uCellM;
          vec2 i = clamp( floor( f ), vec2( 0.0 ), vec2( uDim - 2.0 ) );
          vec2 t = clamp( f - i, 0.0, 1.0 );
          ivec2 c = ivec2( i );
          float a = texelFetch( tHeight, c, 0 ).r, b = texelFetch( tHeight, c + ivec2( 1, 0 ), 0 ).r;
          float cc = texelFetch( tHeight, c + ivec2( 0, 1 ), 0 ).r, d = texelFetch( tHeight, c + ivec2( 1, 1 ), 0 ).r;
          return mix( mix( a, b, t.x ), mix( cc, d, t.x ), t.y );
        }`,
      main: /* glsl */`
      {
        vec2 cellId = floor( ( uOrigin.xz + aOffset ) / uCell + 0.5 );
        vec2 seedId = cellId + aSlot.x * 37.13;
        vec4 aR = rlHash4( seedId ), bR = rlHash4( seedId + 17.13 );
        vec2 wxz = cellId * uCell + ( aR.xy - 0.5 ) * uCell * 0.92;
        vec4 mask = texture2D( tMask, ( ( wxz + uWorldSize * 0.5 ) / uCellM + 0.5 ) / uDim );
        float grow = mask.r;
        float dist = length( wxz - uOrigin.xz );
        float edge = 1.0 - smoothstep( aSlot.y * 0.72, aSlot.y, dist );
        float cut = aR.z * 0.92 + 0.04;
        float keep = smoothstep( cut - 0.10, cut + 0.06, grow * edge );
        float h = rlHeight( wxz );
        float rh = 0.6 + bR.x * 0.8;
        float height = uBlade.y * rh * ( 0.55 + grow * 0.75 ) * keep;
        float width = uBlade.x * ( 0.7 + rh * 0.5 ) * keep;
        float t = position.y;
        vBladeT = t; vDry = 1.0 - mask.g; vGrow = grow;
        float ph = bR.y * 6.2831853, tt = uTime * uWindSpeed;
        float gust = 0.55 + 0.45 * sin( tt * 0.31 + wxz.x * 0.013 + wxz.y * 0.009 );
        float wave = sin( tt * 1.9 + ph + wxz.x * 0.35 + wxz.y * 0.27 );
        float bend = ( wave + sin( tt * 6.1 + ph * 2.7 ) * 0.18 ) * gust * uWindStrength * 0.34 * t * t;
        // anything passing through pushes the blades aside (and flattens them under a wheel)
        vec2 push = vec2( 0.0 ); float squash = 0.0;
        for ( int q = 0; q < 4; q++ ) {
          vec2 away = wxz - uPush[ q ].xz;
          float pd = length( away );
          float r = max( uPush[ q ].w, 0.01 );
          float k = ( 1.0 - smoothstep( 0.0, r * 1.6, pd ) ) * step( abs( uPush[ q ].y - h ), 3.0 );
          push += ( pd > 0.001 ? away / pd : vec2( 1.0, 0.0 ) ) * k;
          squash = max( squash, k );
        }
        float ang = aR.w * 6.2831853;
        vec2 dir = vec2( cos( ang ), sin( ang ) );
        vec3 local = vec3( position.x * width * dir.x, t * height, position.x * width * dir.y );
        local.xz += uWindDir.xz * bend * height;
        local.xz += push * 0.7 * t * height * 2.0;
        local.y -= ( abs( bend ) * 0.35 + squash * 0.7 * t ) * height * 0.5;
        transformed = vec3( wxz.x - uOrigin.x, h - uOrigin.y, wxz.y - uOrigin.z ) + local;
        objectNormal = normalize( vec3( dir.x * 0.35, 1.0, dir.y * 0.35 ) );
        transformedNormal = normalMatrix * objectNormal;
        vNormal = normalize( transformedNormal );
      }`,
    },
    fragment: {
      pars: /* glsl */`uniform vec3 uTipColor, uBaseColor, uDryColor; varying float vBladeT; varying float vDry; varying float vGrow;`,
      map: /* glsl */`
        {
          vec3 g = mix( uBaseColor, uTipColor, vBladeT * vBladeT * 0.85 + 0.15 );
          g = mix( g, uDryColor, clamp( vDry * 0.55, 0.0, 1.0 ) );
          g *= 0.8 + vGrow * 0.35;
          g *= mix( 0.55, 1.0, vBladeT * 0.8 + 0.2 );
          diffuseColor.rgb *= g;
        }`,
    },
  });
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.name = 'grass';
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const id = new THREE.Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, id);
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh, count,
    update(centre) {
      const ox = Math.round(centre.x / cell) * cell, oz = Math.round(centre.z / cell) * cell;
      uniforms.uOrigin.value.set(ox, world.heightAt(ox, oz), oz);
      mesh.position.copy(uniforms.uOrigin.value);
    },
    /** up to 4 things that push grass aside: [{ x, y, z, r }] */
    setPush(list) {
      for (let q = 0; q < 4; q++) {
        const p = list && list[q];
        if (p) uniforms.uPush.value[q].set(p.x, p.y, p.z, p.r || 1.2); else uniforms.uPush.value[q].set(0, -999, 0, 0);
      }
    },
    dispose() { geo.dispose(); material.dispose(); tHeight.dispose(); tMask.dispose(); },
  };
}
