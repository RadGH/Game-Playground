// Grass.
//
// A quarter of a million blades is not something you can move about on the processor sixty times a
// second. So nothing moves: there is ONE instanced mesh whose blades sit at fixed offsets from a
// centre point, and the centre point follows the camera. Every blade works out where it really is,
// how tall the ground is under it, whether grass grows there at all and which way the wind has
// bent it — all in the vertex shader.
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
import { makeRng } from './noise.js';
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

  // --- where the blades sit relative to the centre ----------------------------------------------
  // Laid out in rings so the array is already sorted near-to-far: turning the density down is then
  // just drawing fewer of them, and the ones that go are the far ones.
  const density = 62 * (quality.grassDensity || 1);   // blades per square metre at the centre
  const target = Math.min(420000, Math.round(Math.PI * radius * radius * density * 0.25));
  const rng = makeRng(seed);
  const offsets = new Float32Array(target * 2);
  const rands = new Float32Array(target * 4);
  for (let i = 0; i < target; i++) {
    // sqrt spreads the points evenly over the disc instead of bunching them in the middle,
    // then a bias back toward the centre keeps the blades densest where you can actually see them
    const t = Math.pow(rng(), 0.62);
    const r = t * radius;
    const a = rng() * Math.PI * 2;
    offsets[i * 2] = Math.cos(a) * r;
    offsets[i * 2 + 1] = Math.sin(a) * r;
    rands[i * 4] = rng();                 // rotation
    rands[i * 4 + 1] = 0.6 + rng() * 0.8; // height
    rands[i * 4 + 2] = rng();             // colour jitter
    rands[i * 4 + 3] = rng();             // wind phase
  }

  const geo = bladeGeometry(4);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 4));
  geo.instanceCount = target;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.5);

  const tHeight = heightTexture(world);
  const tMask = maskTexture(world, 512);

  const uniforms = {
    tHeight:   { value: tHeight },
    tMask:     { value: tMask },
    uWorldSize:{ value: world.size },
    uOrigin:   { value: new THREE.Vector3() },
    uRadius:   { value: radius },
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
        attribute vec4 aRand;
        uniform sampler2D tHeight;
        uniform sampler2D tMask;
        uniform float uWorldSize;
        uniform vec3  uOrigin;
        uniform float uRadius;
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
      `,
      main: /* glsl */`
      {
        vec2 wxz = uOrigin.xz + aOffset;
        vec2 muv = hdWorldToUv( wxz );
        vec4 mask = texture2D( tMask, muv );
        float grow = mask.r;

        // Thin the blades out toward the edge of the patch rather than ending it with a line.
        float dist = length( aOffset );
        float edge = 1.0 - smoothstep( uRadius * 0.62, uRadius, dist );
        // a per-blade cutoff, so thinning removes whole blades instead of shrinking all of them
        float keep = step( 1.0 - grow * edge, aRand.z * 0.92 + 0.04 );

        float h = texture2D( tHeight, muv ).r;
        float height = uBlade.y * aRand.y * ( 0.55 + grow * 0.75 ) * keep;
        float width  = uBlade.x * ( 0.7 + aRand.y * 0.5 ) * keep;

        float t = position.y;                 // 0 at the root, 1 at the tip
        vBladeT = t;

        // Wind. The bend grows with the square of the distance up the blade, which is roughly how
        // a real stem behaves — stiff at the base, loose at the tip.
        float ph = aRand.w * 6.2831853;
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
        float ang = aRand.x * 6.2831853;
        vec2 dir = vec2( cos( ang ), sin( ang ) );
        vec3 local = vec3( position.x * width * dir.x, t * height, position.x * width * dir.y );

        local.xz += uWindDir.xz * bend * height;
        local.xz += pushDir * push * 0.55 * t * height * 2.0;
        // a bent blade is shorter, or it stretches
        local.y -= ( abs( bend ) * 0.35 + push * 0.5 * t ) * height * 0.45;

        transformed = vec3( aOffset.x, 0.0, aOffset.y ) + local;
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

  const mesh = new THREE.InstancedMesh(geo, material, target);
  mesh.name = 'grass';
  mesh.castShadow = false;       // a quarter million blades in the shadow pass is not worth it
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;    // the blades move in the shader, so the bounding box is a lie
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  // every instance sits at the origin; the shader puts it where it belongs
  const id = new THREE.Matrix4();
  for (let i = 0; i < target; i++) mesh.setMatrixAt(i, id);
  mesh.instanceMatrix.needsUpdate = true;

  let visible = target;

  return {
    mesh, material, uniforms, count: target,
    get visibleCount() { return visible; },
    /**
     * Move the patch with the camera. Snapping to a grid stops the whole field crawling by a
     * fraction of a blade every frame, which is very obvious once you have seen it.
     */
    update(centre, playerPos) {
      const snap = 0.5;
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
      visible = Math.max(0, Math.min(target, Math.round(target * frac)));
      mesh.count = visible;
    },
    dispose() { geo.dispose(); material.dispose(); tHeight.dispose(); tMask.dispose(); },
  };
}
