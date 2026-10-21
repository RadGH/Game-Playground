// 2026-10-20 — a field of grass drawn on the graphics card (owner: "Can we have GPU grass with various textures by biome
// or surface?"). Replaces ground-clutter.js's CPU tufts on Medium and High; the ferns, stones and lumps stay there.
// What grows where is js/client/grass-types.js (pure); this file is the three.js half.
//
//   const grass = createGpuGrass(scene, { quality, zoneAt, distance })     zoneAt(x, z) -> world-stream's loaded zone
//   grass.update(pos)            every frame outdoors (pos = the player: { x, y, z })
//   grass.refresh()              a zone was loaded, dropped or its nav refined: re-sample everything
//   grass.setDistance(id)        Settings → Grass distance (grass-types.js GRASS_DISTANCES) — applies at once
//   grass.setVisible(on)         a dungeon hides it
//   grass.stats -> { blades, calls, sampled, pending, distance }
//
// The idea that matters is Farhold's (prototypes/farhold/js/grass-gpu.js) and highdef-3d's before it: AN INSTANCE IS A
// SLOT, NOT A BLADE. One patch of blade slots follows you, but its centre moves in WHOLE lattice squares and every
// blade property (where in its square, which way it faces, how tall, flower or not) is an integer hash of the square's
// own whole-number coordinates — so the same ground always grows the same blade, whichever slot draws it, and walking
// moves you past the grass instead of dragging it along.
//
// What the graphics card is given:
//   tMask    a WRAPPING texture, 1 m a texel, round the player: texel (i, j) holds whichever world metre is congruent to
//            it (mod N) and nearest you. R = grass type, G = how much of the ground it covers, B = a slow colour wobble.
//            Walking only re-samples the strip of texels that came into range (a few hundred cheap lookups a frame).
//   tHeight  the SAME 2 m height samples the ground mesh is built from (terrain-view.js), also wrapping. The shader
//            interpolates them with the mesh's own diagonal (q–r: (i+1, j) to (i, j+1)), so a blade stands on the drawn
//            triangle — not on a smooth surface a few centimetres above or below it.
//   tTypes   the type table (grass-types.js typeTable): height, width, stiffness, taper, colours, flower heads.
//
// PRECISION. The world is ~30 km from the origin, where a float32 is good to a couple of millimetres — enough to make a
// lattice square or a texel jump. So the lattice is addressed in whole numbers (the patch origin as an integer square,
// offsets as integers), the hash is an integer hash, texels are found from an integer origin plus a small fraction, and
// every position the shader builds is relative to the patch origin (three works the mesh's own offset in doubles).
//
// COST. One draw call per wedge of the patch that is on screen (8 wedges + the disc at your feet; typically 4-6 drawn),
// 8 triangles a blade, nothing on the CPU per blade. Blades a slot cannot use (bare ground, the edge of the field)
// collapse to a point and draw no pixels.

import * as THREE from 'three';
import { windUniform } from './decor.js';
import { ATMOS_U, atmosTierNow, noiseTexture } from './atmos.js';
import { CLOUD } from './gfx-tiers.js';
import { GRASS_TYPES, TYPE_ROWS, grassAt, grassLattice, snapOrigin, typeTable, patchNoise } from './grass-types.js';

/**
 * Heights along a blade (0 root .. 1 tip): the rows above 0.8 are the flower head when the blade has one. Near / Medium
 * (the phone settings) use four rows — 6 triangles and 8 vertices a blade; Far / Very far five, for a smoother bend on tall
 * reeds and wild grass.
 */
const LEVELS_FULL = [0, 0.38, 0.7, 0.86, 1], LEVELS_LITE = [0, 0.45, 0.84, 1];
const WEDGES = 8, DISC = 7;                  // 8 slices round you + one disc of DISC m at your feet (frustum culled apart)

/** A clump of `blades` blades fanned from one root: position.z is which blade of the clump a vertex belongs to. */
function bladeAttrs(LEVELS, blades) {
  const pos = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const base = pos.length / 3;
    for (const t of LEVELS) pos.push(-0.5, t, b, 0.5, t, b);
    for (let i = 0; i < LEVELS.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  return { position: new THREE.Float32BufferAttribute(pos, 3), normal: new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3), index: new THREE.Uint16BufferAttribute(idx, 1) };
}

const VERT_PARS = `
attribute vec2 aOffset;
attribute vec2 aSlot;
uniform sampler2D tMask;
uniform highp sampler2D tHeight;
uniform highp sampler2D tTypes;
uniform vec2 uOriginCell, uOrigInt, uOrigFrac;
uniform vec3 uPlayer;
uniform float uCell, uWindT, uDensity;
uniform int uMaskN, uHN;
varying vec3 vTvCol;
varying vec2 vTvW;
// pcg4d — an integer hash, so a square 30 km from the origin hashes as cleanly as one at 0 (grass-types.js grassHash)
vec4 tvHash( ivec2 c, int k ) {
  uvec4 v = uvec4( uint( c.x ), uint( c.y ), uint( k ), 0x2545f491u );
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return vec4( v ) / 4294967296.0;
}
float tvH( ivec2 g ) { return texelFetch( tHeight, g & ivec2( uHN - 1 ), 0 ).r; }
`;

const VERT_MAIN = `
  ivec2 tvCell = ivec2( uOriginCell + aOffset );
  int tvK = int( aSlot.x );
  vec4 tvR1 = tvHash( tvCell, tvK );
  vec4 tvR2 = tvHash( tvCell, tvK + 17 );
  // where in its square the blade stands, relative to the patch origin (small numbers)
  vec2 tvLocal = ( aOffset + ( tvR1.xy - 0.5 ) * 0.94 ) * uCell;
  // the world metre it is in: an integer origin plus a small fraction (exact 30 km out)
  vec2 tvP = uOrigFrac + tvLocal;
  vec2 tvIp = floor( tvP );
  ivec2 tvWi = ivec2( uOrigInt ) + ivec2( tvIp );
  vec2 tvF = tvP - tvIp;
  vec4 tvM = texelFetch( tMask, tvWi & ivec2( uMaskN - 1 ), 0 );
  int tvType = int( tvM.r * 255.0 + 0.5 );
  vec4 tvA = texelFetch( tTypes, ivec2( 0, tvType ), 0 );      // hMin, hMax, width, dense
  vec4 tvB = texelFetch( tTypes, ivec2( 1, tvType ), 0 );      // stiff, lean, taper, flower share
  vec4 tvRoot = texelFetch( tTypes, ivec2( 2, tvType ), 0 );   // root rgb, flower size
  vec3 tvTip = texelFetch( tTypes, ivec2( 3, tvType ), 0 ).rgb;
  // the ground: the 2 m samples the mesh is built from, split along the mesh's own diagonal
  ivec2 tvG = tvWi >> 1;
  vec2 tvGf = ( vec2( tvWi & 1 ) + tvF ) * 0.5;
  float tvHa = tvH( tvG ), tvHb = tvH( tvG + ivec2( 1, 0 ) ), tvHc = tvH( tvG + ivec2( 0, 1 ) ), tvHd = tvH( tvG + ivec2( 1, 1 ) );
  float tvGround; vec2 tvSl;
  if ( tvGf.x + tvGf.y <= 1.0 ) { tvGround = tvHa + ( tvHb - tvHa ) * tvGf.x + ( tvHc - tvHa ) * tvGf.y; tvSl = vec2( tvHb - tvHa, tvHc - tvHa ) * 0.5; }
  else { tvGround = tvHd + ( tvHc - tvHd ) * ( 1.0 - tvGf.x ) + ( tvHb - tvHd ) * ( 1.0 - tvGf.y ); tvSl = vec2( tvHd - tvHc, tvHd - tvHb ) * 0.5; }
  // how much grows: the texel's cover x the type's thickness, none on steep ground, thinned at the edge of the field
  float tvGrow = tvM.g * tvA.w * uDensity * step( 0.5, float( tvType ) );
  tvGrow *= 1.0 - smoothstep( 0.62, 0.95, length( tvSl ) );
  float tvDist = length( tvLocal - uPlayer.xz );
  float tvEdge = 1.0 - smoothstep( aSlot.y * 0.72, aSlot.y, tvDist );
  float tvCut = tvR1.z * 0.92 + 0.04;
  float tvKeep = smoothstep( tvCut - 0.08, tvCut + 0.05, tvGrow * tvEdge );
  float tvHeight = mix( tvA.x, tvA.y, tvR2.x ) * ( 0.7 + 0.3 * tvM.g ) * tvKeep;
  // far blades a little wider and taller, or at 100 m they are thinner than a pixel
  float tvFar = max( 0.0, tvDist - 18.0 );
  tvHeight *= 1.0 + tvFar * 0.006;
  float tvWidth = tvA.z * ( 0.75 + tvR2.y * 0.5 ) * ( 1.0 + tvFar * 0.03 ) * tvKeep;
  float tvAng = tvR1.w * 6.2831853;
  vec2 tvFace = vec2( cos( tvAng ), sin( tvAng ) );
  vec2 tvBendDir = vec2( -tvFace.y, tvFace.x ) * ( tvR2.z < 0.5 ? 1.0 : -1.0 );
  bool tvFlower = tvR2.w < tvB.w;
  vec3 objectNormal = normalize( vec3( tvBendDir.x * 0.35, 1.0, tvBendDir.y * 0.35 ) );
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3( 1.0, 0.0, 0.0 );
  #endif
`;

const VERT_POS = `
  float tvT = position.y;
  // the second blade of a slot: turned away from the first, its root a few centimetres off, a little shorter
  // a CLUMP: each blade of the slot on its own spoke round one root (golden-angle fan), its face across the spoke and
  // curving outward, a little shorter or taller than its neighbours — the old CPU tufts' shape, built in the shader
  float tvSub = position.z;
  float tvJ = fract( sin( tvSub * 12.9898 + tvR1.w * 78.233 ) * 43758.5453 );
  float tvGa = tvAng + tvSub * 2.39996 + tvJ * 0.6;
  vec2 tvRad = vec2( cos( tvGa ), sin( tvGa ) );
  tvFace = vec2( -tvRad.y, tvRad.x );
  tvBendDir = tvRad;
  tvHeight *= 0.68 + 0.32 * fract( tvJ * 7.13 + tvR2.x );
  tvFlower = fract( tvR2.w + tvSub * 0.618 ) < tvB.w;
  vec2 tvRootOff = tvRad * ( 0.04 + 0.08 * tvJ ) * ( 0.7 + tvA.z * 5.0 );
  // width along the blade: tapering to a point, or a flower head on the top two rows
  float tvW = tvWidth * pow( max( 1.0 - tvT, 0.0 ), tvB.z );
  if ( tvFlower && tvT > 0.8 ) tvW = tvKeep * tvRoot.w * ( tvT > 0.95 ? 1.0 : 0.3 ) * ( 1.0 + tvFar * 0.03 );
  // the wind (the page's one wind clock, decor.js — the trees sway on the same one), stiff types bend less
  vec2 tvWorld = uOrigInt + tvP;
  float tvPh = tvR2.y * 6.2831853;
  float tvGust = 0.55 + 0.45 * sin( uWindT * 0.31 + tvWorld.x * 0.013 + tvWorld.y * 0.009 );
  float tvWave = sin( uWindT * 1.9 + tvPh + tvWorld.x * 0.35 + tvWorld.y * 0.27 ) + sin( uWindT * 6.1 + tvPh * 2.7 ) * 0.15;
  float tvBend = ( 0.18 + 0.32 * tvGust + tvWave * tvGust * 0.22 ) * ( 1.0 - tvB.x ) * tvT * tvT;
  float tvLean = ( tvB.y + 0.18 ) * tvT * tvT;     // a clump always splays out a little
  // you push it aside as you walk through
  vec2 tvAway = tvLocal - uPlayer.xz;
  float tvPd = length( tvAway );
  float tvPush = ( 1.0 - smoothstep( 0.0, 1.3, tvPd ) ) * step( abs( uPlayer.y - tvGround ), 2.2 );
  vec2 tvPushDir = tvPd > 0.001 ? tvAway / tvPd : vec2( 1.0, 0.0 );
  vec3 transformed = vec3( position.x * tvW * tvFace.x, tvT * tvHeight, position.x * tvW * tvFace.y );
  transformed.xz += ( tvBendDir * tvLean * 0.6 + vec2( 0.86, 0.5 ) * tvBend + tvPushDir * tvPush * tvT * 0.9 ) * tvHeight;
  transformed.y -= ( tvLean * 0.3 + abs( tvBend ) * 0.3 + tvPush * 0.45 * tvT ) * tvHeight;
  transformed += vec3( tvLocal.x + tvRootOff.x, tvGround - 0.015, tvLocal.y + tvRootOff.y );
  // colour: dark at the root, the type's tip colour at the top, a little different blade to blade and patch to patch
  vTvCol = mix( tvRoot.rgb, tvTip, smoothstep( 0.0, 1.0, tvT ) ) * ( 0.82 + tvR2.z * 0.36 ) * ( 0.88 + 0.24 * tvM.b );
  if ( tvFlower && tvT > 0.8 ) vTvCol = texelFetch( tTypes, ivec2( tvR1.y < 0.5 ? 4 : 5, tvType ), 0 ).rgb * ( 0.9 + tvR2.z * 0.2 );
  vTvW = tvWorld;
`;

/** The grass material: matte Lambert, lit like the ground, its blades placed entirely in the vertex shader. */
function grassMaterial(uniforms, clouds, onShader) {
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    onShader?.(shader);
    if (clouds) Object.assign(shader.uniforms, { tNoise: ATMOS_U.tNoise, uCloudOff: ATMOS_U.uCloudOff, uCloudK: ATMOS_U.uCloudK });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', VERT_MAIN)
      .replace('#include <begin_vertex>', VERT_POS);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTvCol;\nvarying vec2 vTvW;\n' + (clouds ? 'uniform sampler2D tNoise; uniform vec2 uCloudOff; uniform float uCloudK;' : ''))
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vTvCol;' + (clouds ? `\n diffuseColor.rgb *= 1.0 - smoothstep(0.47, 0.72, texture2D(tNoise, vTvW * ${CLOUD.scale.toFixed(6)} + uCloudOff).r) * uCloudK;` : ''))
      // both faces of a blade take the same upward-leaning normal: three flips it for the back face of a double-sided
      // material, which lit every blade seen from behind from below — black (Farhold's fix)
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
  };
  m.customProgramCacheKey = () => 'tv-grass-gpu-v1' + (clouds ? '-c' : '');
  return m;
}

export function createGpuGrass(scene, { quality = 'high', zoneAt, distance = 'medium' } = {}) {
  const tier = atmosTierNow(quality);
  const group = new THREE.Group(); group.name = 'grass-gpu';
  const stats = { blades: 0, calls: 0, sampled: 0, pending: 0, distance: 'off', cell: 0 };
  const api = { group, stats, active: false, update() {}, refresh() {}, setDistance() {}, setVisible() {}, dispose() {} };
  if (!tier.grass) return api;          // Low and ?atmos=0 (the old look): no grass
  api.active = true;
  scene.add(group);
  if (tier.cloudShadows) noiseTexture();

  const types = new THREE.DataTexture(typeTable(), TYPE_ROWS, GRASS_TYPES.length, THREE.RGBAFormat, THREE.FloatType);
  types.minFilter = types.magFilter = THREE.NearestFilter; types.generateMipmaps = false; types.needsUpdate = true;
  const uniforms = {
    tMask: { value: null }, tHeight: { value: null }, tTypes: { value: types },
    uOriginCell: { value: new THREE.Vector2() }, uOrigInt: { value: new THREE.Vector2() }, uOrigFrac: { value: new THREE.Vector2() },
    uPlayer: { value: new THREE.Vector3(0, -1e4, 0) }, uCell: { value: 1 }, uWindT: windUniform, uDensity: { value: 1 },
    uMaskN: { value: 128 }, uHN: { value: 64 },
  };
  let shaderRef = null;
  const material = grassMaterial(uniforms, !!tier.cloudShadows, sh => { shaderRef = sh; });
  const baseCache = new Map();
  const baseFor = (levels, blades) => { const k = levels.length + ':' + blades; if (!baseCache.has(k)) baseCache.set(k, bladeAttrs(levels, blades)); return baseCache.get(k); };

  // ---------------------------------------------------------------- the wrapping textures
  let MN = 0, HN = 0, maskData = null, maskHeld = null, maskTex = null, hData = null, hHeld = null, hTex = null;
  function makeTextures(radius) {
    const mn = radius <= 58 ? 128 : 256, hn = radius <= 58 ? 64 : 128;
    if (mn === MN && maskTex) return;
    maskTex?.dispose(); hTex?.dispose();
    MN = mn; HN = hn;
    maskData = new Uint8Array(MN * MN * 4); maskHeld = new Int32Array(MN * MN * 2).fill(-2147483648);
    maskTex = new THREE.DataTexture(maskData, MN, MN, THREE.RGBAFormat, THREE.UnsignedByteType);
    maskTex.minFilter = maskTex.magFilter = THREE.NearestFilter; maskTex.generateMipmaps = false; maskTex.needsUpdate = true;
    hData = new Float32Array(HN * HN); hHeld = new Int32Array(HN * HN * 2).fill(-2147483648);
    hTex = new THREE.DataTexture(hData, HN, HN, THREE.RedFormat, THREE.FloatType);
    hTex.minFilter = hTex.magFilter = THREE.NearestFilter; hTex.generateMipmaps = false; hTex.needsUpdate = true;
    uniforms.tMask.value = maskTex; uniforms.tHeight.value = hTex; uniforms.uMaskN.value = MN; uniforms.uHN.value = HN;
  }

  let zone = null;
  const zoneFor = (x, z) => { const b = zone?.bounds; if (b && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return zone; return (zone = zoneAt(x, z)); };
  /** One mask texel: the world metre [wx, wx+1) x [wz, wz+1), sampled at its middle. */
  function sampleMask(wx, wz, o) {
    const x = wx + 0.5, z = wz + 0.5, L = zoneFor(x, z);
    let type = 0, cover = 0;
    if (L?.nav && L.T) {
      const g = grassAt({ biome: L.T.biomeKey(x, z), palette: L.T.reader?.meta?.palette || null, nav: L.nav.at(x - L.ox, z - L.oz), x, z });
      if (g) { type = g.type; cover = g.cover; }
    }
    maskData[o] = type; maskData[o + 1] = Math.round(cover * 255);
    maskData[o + 2] = Math.round(patchNoise(x, z, 73) * 255); maskData[o + 3] = 255;
  }
  /** One height texel: the ground sample at world (2 gi, 2 gj) — read straight from the zone's grid (what the mesh draws). */
  function sampleHeight(gi, gj, k) {
    const x = gi * 2, z = gj * 2, L = zoneFor(x, z);
    let h = 0;
    if (L?.T) {
      const T = L.T;
      if (T.step === 2 && T.heightGrid) {
        const grid = L.__grassGrid || (L.__grassGrid = T.heightGrid());
        const i = Math.min(T.res - 1, Math.max(0, Math.round((x - T.origin.x) / 2))), j = Math.min(T.res - 1, Math.max(0, Math.round((z - T.origin.z) / 2)));
        h = grid[j * T.res + i];
      } else h = T.heightAt(x, z);
    }
    hData[k] = h;
  }
  /** Walk a window of texels round (cx, cz), nearest rows first, re-sampling any that hold the wrong ground. */
  function sweep(N, held, cx, cz, half, budget, sample, stride) {
    let done = 0, pending = 0;
    for (let s = 0; s <= 2 * half; s++) {
      const dj = (s & 1 ? 1 : -1) * ((s + 1) >> 1), wz = cz + dj;
      for (let r = 0; r <= 2 * half; r++) {
        const di = (r & 1 ? 1 : -1) * ((r + 1) >> 1), wx = cx + di;
        const t = (wz & (N - 1)) * N + (wx & (N - 1));
        if (held[t * 2] === wx && held[t * 2 + 1] === wz) continue;
        if (done >= budget) { pending++; continue; }
        sample(wx, wz, t * stride);
        held[t * 2] = wx; held[t * 2 + 1] = wz; done++;
      }
    }
    return { done, pending };
  }

  // ---------------------------------------------------------------- the patch
  let meshes = [], lattice = null, distId = 'off';
  function build(id) {
    for (const m of meshes) { group.remove(m); m.geometry.dispose(); }
    meshes = [];
    lattice = grassLattice(id); distId = lattice.count ? id : 'off';
    stats.distance = distId; stats.slots = lattice.count; stats.blades = lattice.blades; stats.cell = +lattice.cell.toFixed(3);
    if (!lattice.count) { group.visible = false; return; }
    makeTextures(lattice.radius);
    const base = baseFor(id === 'near' || id === 'medium' ? LEVELS_LITE : LEVELS_FULL, lattice.clump);
    stats.clump = lattice.clump; stats.trisPerBlade = (base.index.count / 3) / lattice.clump;
    uniforms.uCell.value = lattice.cell;
    // sort the slots into wedges so the camera can cull the ones behind it
    const buckets = Array.from({ length: WEDGES + 1 }, () => []);
    const { offsets, slots, cell } = lattice;
    for (let n = 0; n < lattice.count; n++) {
      const x = offsets[n * 2] * cell, z = offsets[n * 2 + 1] * cell, d = Math.hypot(x, z);
      const w = d < DISC ? WEDGES : Math.min(WEDGES - 1, Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * WEDGES));
      buckets[w].push(n);
    }
    for (const list of buckets) {
      if (!list.length) continue;
      const off = new Float32Array(list.length * 2), sl = new Float32Array(list.length * 2);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      list.forEach((n, k) => {
        off[k * 2] = offsets[n * 2]; off[k * 2 + 1] = offsets[n * 2 + 1]; sl[k * 2] = slots[n * 2]; sl[k * 2 + 1] = slots[n * 2 + 1];
        const x = offsets[n * 2] * cell, z = offsets[n * 2 + 1] * cell;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      });
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', base.position); g.setAttribute('normal', base.normal); g.setIndex(base.index);
      g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
      g.setAttribute('aSlot', new THREE.InstancedBufferAttribute(sl, 2));
      g.instanceCount = list.length;
      // the ground can rise and fall a long way inside a wedge: a generous sphere (its y follows the player each frame)
      const cxw = (minX + maxX) / 2, czw = (minZ + maxZ) / 2;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cxw, 0, czw), Math.hypot(maxX - cxw, maxZ - czw) + 2 + 45);
      g.boundingBox = new THREE.Box3(new THREE.Vector3(minX - 2, -60, minZ - 2), new THREE.Vector3(maxX + 2, 60, maxZ + 2));
      const m = new THREE.Mesh(g, material);
      m.name = 'grass-gpu'; m.frustumCulled = true; m.castShadow = false; m.receiveShadow = true; m.renderOrder = 1;
      m.onBeforeRender = () => { stats.calls++; };
      group.add(m); meshes.push(m);
    }
    group.visible = visible;
    lastCx = lastCz = NaN;
  }

  let visible = true, lastCx = NaN, lastCz = NaN, pending = true, pinned = null;
  /** Tests: hold the patch centre at a point (null = follow the player), and stop the wind (null = the shared clock). */
  api.pin = p => { pinned = p ? { x: p.x, y: p.y, z: p.z } : null; };
  api.freezeWind = t => { uniforms.uWindT = t == null ? windUniform : { value: t }; material.uniformsNeedUpdate = true; if (shaderRef) shaderRef.uniforms.uWindT = uniforms.uWindT; };
  api.setDistance = id => { if (id !== distId) build(id); };
  api.setVisible = on => { visible = !!on; group.visible = visible && distId !== 'off'; };
  api.refresh = () => { maskHeld?.fill(-2147483648); hHeld?.fill(-2147483648); zone = null; pending = true; };
  api.update = p => {
    const pos = pinned || p;
    if (!pos || !visible || distId === 'off') return;
    stats.lastCalls = stats.calls; stats.calls = 0;      // calls = drawn wedges this frame (lastCalls: the frame before)
    const R = lattice.radius;
    // the textures: only when the centre moved a metre, or a sweep left work over
    const cx = Math.floor(pos.x), cz = Math.floor(pos.z);
    if (pending || cx !== lastCx || cz !== lastCz) {
      lastCx = cx; lastCz = cz; zone = null;
      const half = Math.min(MN / 2 - 1, Math.ceil(R) + 3);
      const a = sweep(MN, maskHeld, cx, cz, half, 2600, sampleMask, 4);
      const hh = Math.min(HN / 2 - 1, Math.ceil(R / 2) + 3);
      const b = sweep(HN, hHeld, Math.floor(pos.x / 2), Math.floor(pos.z / 2), hh, 1400, (gi, gj, k) => sampleHeight(gi, gj, k), 1);
      if (a.done) maskTex.needsUpdate = true;
      if (b.done) hTex.needsUpdate = true;
      stats.sampled += a.done + b.done; stats.pending = a.pending + b.pending;
      pending = stats.pending > 0;
    }
    // the patch: its centre in whole squares, its position worked in doubles on the CPU
    const oc = snapOrigin(pos.x, pos.z, lattice.cell);
    const ox = oc[0] * lattice.cell, oz = oc[1] * lattice.cell, fx = Math.floor(ox), fz = Math.floor(oz);
    uniforms.uOriginCell.value.set(oc[0], oc[1]);
    uniforms.uOrigInt.value.set(fx, fz); uniforms.uOrigFrac.value.set(ox - fx, oz - fz);
    // the inspect camera hands over a point with no height: use the ground's (the wedges' culling spheres hang off it)
    let py = pos.y;
    if (!Number.isFinite(py)) { const L = zoneFor(pos.x, pos.z); py = L?.T ? L.T.heightAt(pos.x, pos.z) : 0; }
    uniforms.uPlayer.value.set(pos.x - ox, py, pos.z - oz);
    for (const m of meshes) { m.position.set(ox, 0, oz); m.geometry.boundingSphere.center.y = py; }
  };
  /** Tests: the ground height the shader puts a blade's root at (its height texels, the mesh's diagonal), NaN if not held. */
  api.debugGround = (x, z) => {
    if (!hHeld) return NaN;
    const gi = Math.floor(x / 2), gj = Math.floor(z / 2), fx = x / 2 - gi, fz = z / 2 - gj;
    const H = (i, j) => { const t = (j & (HN - 1)) * HN + (i & (HN - 1)); return hHeld[t * 2] === i && hHeld[t * 2 + 1] === j ? hData[t] : NaN; };
    const a = H(gi, gj), b = H(gi + 1, gj), c = H(gi, gj + 1), d = H(gi + 1, gj + 1);
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };
  api.dispose = () => { scene.remove(group); for (const m of meshes) m.geometry.dispose(); material.dispose(); maskTex?.dispose(); hTex?.dispose(); types.dispose(); };
  build(distance);
  return api;
}
