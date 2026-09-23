// Grass.
//
// A quarter of a million blades is not something you can move about on the processor sixty times a
// second. So nothing moves: there is ONE instanced mesh, and its centre follows the camera a whole
// lattice square at a time. An instance is a SLOT, not a blade — which square of ground it draws
// depends on where the centre is, and everything about the blade standing on that square is hashed
// from the square's own coordinates. Work out where it really is, how tall the ground is under it,
// whether grass grows there at all and which way the wind has bent it — all in the vertex shader.
//
// For that to work the shader needs to be able to read the landscape, so the heightmap goes to the
// graphics card as a texture, along with a second one holding "how much grass grows here" and the
// local colour. Both come straight from the world field, so the grass agrees with the ground it is
// standing on rather than being scattered by a separate set of rules that drift apart.
//
// Blades that land where grass does not grow — a rock face, a lake, a snowfield — are collapsed to
// nothing. That is cheaper than any culling scheme and it costs one multiply.

import * as THREE from 'three';
import { enhance } from './materials.js';
import { BIOME_BY_ID, BIOMES } from './world.js';

/**
 * A single blade: a narrow strip that tapers to a point, with enough segments along its length to
 * bend into a curve rather than a wedge.
 */
function bladeGeometry(segments = 4) {
  const pos = [], nor = [], uvs = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = (1 - t * t) * 0.5;             // widest at the base, a point at the tip
    pos.push(-w, t, 0, w, t, 0);
    nor.push(0, 0, 1, 0, 0, 1);
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** The heightmap, as a texture the vertex shader can read. */
function heightTexture(world) {
  const tex = new THREE.DataTexture(world.heights, world.dim, world.dim, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The mask: how much grass grows at each point, plus a local colour.
 *   r — grass density 0..1
 *   g — how green (a dry meadow versus a lush forest floor)
 *   b — moisture, used to darken the blades in damp ground
 *   a — slope, so grass thins out on a bank before it disappears on a cliff
 */
function maskTexture(world, size = 512) {
  const data = new Uint8Array(size * size * 4);
  const step = world.size / (size - 1);
  const half = world.size / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -half + i * step, z = -half + j * step;
      const k = (j * size + i) * 4;
      const biome = BIOME_BY_ID[world.biomeAt(x, z)] || BIOMES.meadow;
      const y = world.heightAt(x, z);
      const slope = world.slopeAt(x, z);
      let d = biome.grass;
      d *= Math.max(0, 1 - slope * 2.1);
      if (y < world.waterLevel + 0.25) d = 0;
      data[k] = Math.round(Math.min(1, d) * 255);
      data[k + 1] = Math.round(Math.min(1, biome.tint[1] * 1.15) * 255);
      data[k + 2] = Math.round(world.moistureAt(x, z) * 255);
      data[k + 3] = Math.round(Math.min(1, slope) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createGrass(world, quality, { csm, seed = 99 } = {}) {
  const radius = quality.grassDistance || 0;
  if (!quality.grass || radius <= 0) {
    // A stub with the same shape, so the app does not need to check whether grass exists.
    return { mesh: null, update() {}, setDensity() {}, dispose() {}, count: 0, visibleCount: 0 };
  }

  // --- where the blades sit ---------------------------------------------------------------------
  // The blades sit on a LATTICE FIXED IN THE WORLD, not at random offsets from the camera. That
  // distinction is the whole trick: with random offsets the patch travels with you, so every blade
  // is standing somewhere different each time the centre moves and the field appears to crawl and
  // re-shuffle as you walk. Here an instance is only a SLOT; which square of ground it draws comes
  // from the centre, and everything about the blade standing on that square — where in the square
  // it is, its heading, height and colour — is hashed from the square's own coordinates. So the
  // same patch of ground always grows the same blade, whichever slot happens to be drawing it, and
  // walking through the field moves you past the grass instead of dragging it along.
  //
  // A plain lattice would spread the blades evenly, which spends most of them on ground far enough
  // away that nobody can tell. So a square gets up to four blades: the extra ones are only drawn
  // within their own radius, and they shrink into the ground as you walk away rather than winking
  // out. That gives a thick field underfoot and a thinner one in the distance, the way the old
  // random layout did — without any of it being tied to where the camera happens to be.
  const RINGS = [1, 0.55, 0.30, 0.16];   // how far out each extra blade per square is drawn
  const density = 62 * (quality.grassDensity || 1);   // blades per square metre at the centre
  const target = Math.min(420000, Math.round(Math.PI * radius * radius * density * 0.25));
  const spread = RINGS.reduce((a, f) => a + f * f, 0);   // blades per square, averaged over the disc
  const cell = Math.sqrt((Math.PI * radius * radius * spread) / Math.max(1, target));
  const half = Math.ceil(radius / cell);
  const pts = [];
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      const x = i * cell, z = j * cell;
      const d2 = x * x + z * z;
      if (d2 > radius * radius) continue;
      const d = Math.sqrt(d2);
      for (let k = 0; k < RINGS.length; k++) {
        const lim = radius * RINGS[k];
        if (d > lim) break;
        pts.push([x, z, d2, k, lim]);
      }
    }
  }
  // near-to-far, so turning the density down draws fewer blades and the ones that go are the far ones
  pts.sort((a, b) => (a[2] - b[2]) || (a[3] - b[3]));
  const count = pts.length;
  const offsets = new Float32Array(count * 2);
  const slots = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    offsets[i * 2] = pts[i][0]; offsets[i * 2 + 1] = pts[i][1];
    slots[i * 2] = pts[i][3]; slots[i * 2 + 1] = pts[i][4];
  }
  void seed;   // the look of a blade comes from where it stands, not from a sequence

  const geo = bladeGeometry(4);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  // x — which of the square's blades this is; y — the distance at which it stops being drawn
  geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slots, 2));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.5);

  const tHeight = heightTexture(world);
  const tMask = maskTexture(world, 512);

  const uniforms = {
    tHeight:   { value: tHeight },
    tMask:     { value: tMask },
    uWorldSize:{ value: world.size },
    uOrigin:   { value: new THREE.Vector3() },
    uRadius:   { value: radius },
    uCell:     { value: cell },
    uBlade:    { value: new THREE.Vector2(0.028, 0.42) },  // width, base height in metres
    uPlayer:   { value: new THREE.Vector3(0, -999, 0) },
    uPlayerR:  { value: 0.65 },
    uTipColor: { value: new THREE.Color(0x8cae52) },
    uBaseColor:{ value: new THREE.Color(0x36492a) },
    uDryColor: { value: new THREE.Color(0x93864f) },
  };

  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    roughness: 0.95,
    metalness: 0,
    vertexColors: false,
    color: 0xffffff,
    dithering: true,
  });

  enhance(material, {
    csm, fog: true, wind: false,
    uniforms,
    defines: { HD_GRASS: '' },
    vertex: {
      pars: /* glsl */`
        attribute vec2 aOffset;
        attribute vec2 aSlot;
        uniform sampler2D tHeight;
        uniform sampler2D tMask;
        uniform float uWorldSize;
        uniform vec3  uOrigin;
        uniform float uRadius;
        uniform float uCell;
        uniform vec2  uBlade;
        uniform vec3  uPlayer;
        uniform float uPlayerR;
        uniform float uTime;
        uniform vec3  uWindDir;
        uniform float uWindStrength;
        uniform float uWindSpeed;
        varying float vBladeT;
        varying vec3  vTint;
        varying float vDry;

        vec2 hdWorldToUv( vec2 p ) { return ( p + uWorldSize * 0.5 ) / uWorldSize; }

        // Four random numbers from a pair of whole numbers. Same square in, same blade out, for as
        // long as the world exists — which is what keeps the field still while the camera moves.
        vec4 hdHash4( vec2 p ) {
          vec4 q = fract( vec4( p.xyxy ) * vec4( 0.1031, 0.1030, 0.0973, 0.1099 ) );
          q += dot( q, q.wzxy + 33.33 );
          return fract( ( q.xxyz + q.yzzw ) * q.zywx );
        }
      `,
      main: /* glsl */`
      {
        // Which square of ground this slot is drawing. uOrigin is snapped to the same lattice on
        // the processor, so this is a whole number that belongs to the ground, not to the camera.
        vec2 cellId = floor( ( uOrigin.xz + aOffset ) / uCell + 0.5 );
        // A square can carry several blades; each one hashes the square with its own offset, so
        // they are different blades but every one of them is still nailed to that square.
        vec2 seedId = cellId + aSlot.x * 37.13;
        vec4 aRand = hdHash4( seedId );
        vec4 bRand = hdHash4( seedId + 17.13 );
        // Jitter inside the square so the field is not a visible grid — fixed, because it is
        // hashed from the square rather than handed to the instance.
        vec2 wxz = cellId * uCell + ( aRand.xy - 0.5 ) * uCell * 0.92;
        vec2 muv = hdWorldToUv( wxz );
        vec4 mask = texture2D( tMask, muv );
        float grow = mask.r;

        // Thin the blades out toward the edge of the range they are drawn over, rather than
        // ending it with a line. For the square's first blade that range is the whole patch; for
        // the extra ones it is their own smaller circle.
        float dist = length( wxz - uOrigin.xz );
        float edge = 1.0 - smoothstep( aSlot.y * 0.72, aSlot.y, dist );
        // A per-blade cutoff, so thinning removes whole blades instead of shrinking all of them —
        // but over a short band, so a blade at the far edge grows out of the ground as you walk
        // toward it instead of appearing whole.
        float cut = aRand.z * 0.92 + 0.04;
        float keep = smoothstep( cut - 0.10, cut + 0.06, grow * edge );

        float h = texture2D( tHeight, muv ).r;
        float rh = 0.6 + bRand.x * 0.8;
        float height = uBlade.y * rh * ( 0.55 + grow * 0.75 ) * keep;
        float width  = uBlade.x * ( 0.7 + rh * 0.5 ) * keep;

        float t = position.y;                 // 0 at the root, 1 at the tip
        vBladeT = t;

        // Wind. The bend grows with the square of the distance up the blade, which is roughly how
        // a real stem behaves — stiff at the base, loose at the tip.
        float ph = bRand.y * 6.2831853;
        float tt = uTime * uWindSpeed;
        float gust = 0.55 + 0.45 * sin( tt * 0.31 + wxz.x * 0.013 + wxz.y * 0.009 );
        float wave = sin( tt * 1.9 + ph + wxz.x * 0.35 + wxz.y * 0.27 );
        float flick = sin( tt * 6.1 + ph * 2.7 ) * 0.18;
        float bend = ( wave + flick ) * gust * uWindStrength * 0.34 * t * t;

        // The character pushes the grass aside as they walk through it.
        vec2 away = wxz - uPlayer.xz;
        float pd = length( away );
        float push = ( 1.0 - smoothstep( 0.0, uPlayerR * 2.4, pd ) ) * step( abs( uPlayer.y - h ), 2.2 );
        vec2 pushDir = pd > 0.001 ? away / pd : vec2( 1.0, 0.0 );

        // turn the blade to its own heading
        float ang = aRand.w * 6.2831853;
        vec2 dir = vec2( cos( ang ), sin( ang ) );
        vec3 local = vec3( position.x * width * dir.x, t * height, position.x * width * dir.y );

        local.xz += uWindDir.xz * bend * height;
        local.xz += pushDir * push * 0.55 * t * height * 2.0;
        // a bent blade is shorter, or it stretches
        local.y -= ( abs( bend ) * 0.35 + push * 0.5 * t ) * height * 0.45;

        transformed = vec3( wxz.x - uOrigin.x, 0.0, wxz.y - uOrigin.z ) + local;
        transformed.y += h - uOrigin.y;

        // Colour: greener in damp ground and toward the tip, drier and paler on high dry ground.
        vTint = vec3( mask.g, mask.b, grow );
        vDry = 1.0 - mask.b;

        // Face the light rather than the camera. A flat blade lit edge-on goes black and a field
        // of them flickers; tilting every normal upward is the standard fix and it works.
        objectNormal = normalize( vec3( dir.x * 0.35, 1.0, dir.y * 0.35 ) );
        transformedNormal = normalMatrix * objectNormal;
        vNormal = normalize( transformedNormal );
      }
      `,
    },
    fragment: {
      pars: /* glsl */`
        uniform vec3 uTipColor, uBaseColor, uDryColor;
        varying float vBladeT;
        varying vec3  vTint;
        varying float vDry;
      `,
      map: /* glsl */`
        {
          vec3 g = mix( uBaseColor, uTipColor, vBladeT * vBladeT * 0.85 + 0.15 );
          // Dry, straw-coloured grass only where the ground really is dry. At three quarters this
          // washed a whole meadow to cream, which is the first thing that stops a field reading
          // as grass at all.
          g = mix( g, uDryColor, clamp( vDry * 0.30, 0.0, 1.0 ) );
          g *= 0.78 + vTint.x * 0.42;
          // a touch of ambient occlusion at the root so the field has depth in it
          g *= mix( 0.55, 1.0, vBladeT * 0.8 + 0.2 );
          diffuseColor.rgb *= g;
        }
      `,
    },
  });

  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.name = 'grass';
  mesh.castShadow = false;       // a quarter million blades in the shadow pass is not worth it
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;    // the blades move in the shader, so the bounding box is a lie
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  // every instance sits at the origin; the shader puts it where it belongs
  const id = new THREE.Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, id);
  mesh.instanceMatrix.needsUpdate = true;

  let visible = count;

  return {
    mesh, material, uniforms, count, cell,
    get visibleCount() { return visible; },
    /**
     * Move the patch with the camera. The centre is snapped to the blade lattice itself — anything
     * finer and the squares an instance is drawing would shift by part of a square, which is
     * exactly the crawl this layout exists to remove. Snapped, the patch moves a whole square at a
     * time: the blades already on screen keep their ground, and one row appears at the far edge.
     */
    update(centre, playerPos) {
      const snap = cell;
      uniforms.uOrigin.value.set(
        Math.round(centre.x / snap) * snap,
        world.heightAt(centre.x, centre.z),
        Math.round(centre.z / snap) * snap
      );
      mesh.position.set(uniforms.uOrigin.value.x, uniforms.uOrigin.value.y, uniforms.uOrigin.value.z);
      if (playerPos) uniforms.uPlayer.value.copy(playerPos);
    },
    /** 0..1 — how many of the blades to actually draw. */
    setDensity(frac) {
      visible = Math.max(0, Math.min(count, Math.round(count * frac)));
      mesh.count = visible;
    },
    dispose() { geo.dispose(); material.dispose(); tHeight.dispose(); tMask.dispose(); },
  };
}
