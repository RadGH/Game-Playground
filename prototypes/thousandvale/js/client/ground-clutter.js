// 2026-10-17 ground pass — grass tufts, ferns, small bushes, stones, pebbles and lumps of earth on every open bit of
// ground near the camera, in every province (what grows where: clutter-plan.js, pure).
//
// Cheap on purpose: one InstancedMesh per kit piece (about a dozen draw calls in all, whatever the field), the kit's
// own foliage / rock materials (so the only new shader is the per-instance-colour variant of each), filled from a
// FIXED world lattice round the camera — a cell's contents are a hash of the cell, so walking moves you past the
// grass rather than dragging it along. Refilled only when the camera has moved 3 m. Nothing on Low quality.
//
//   const clutter = createGroundClutter(scene, { quality, zoneAt, tufts })    zoneAt(x, z) -> world-stream's loaded zone;
//                                    tufts: false when grass-gpu.js draws the grass (Medium / High since 2026-10-20)
//   clutter.update(cam)       every frame (cheap unless the camera moved)
//   clutter.refresh()         a zone was loaded or dropped: refill next update
//   clutter.stats -> { tuft, detail, calls, refills, ms }

import * as THREE from 'three';
import { buildBush, buildFern } from '../../../../highdef-3d/js/kit/trees.js';
import { buildRock } from '../../../../highdef-3d/js/kit/rocks.js';
import { foliageMaterials, windUniform } from './decor.js';
import { atmosTierNow } from './atmos.js';
import { CLUTTER_KINDS, CLUTTER_LAYERS, clutterAt, cellSpot } from './clutter-plan.js';

const MOVE = 3;          // metres the camera must move before a refill
const _c = new THREE.Color();

/**
 * A clump of grass, 1 unit tall: 18 blades, each a tapered two-segment strip (4 triangles) leaning out and curving over, dark at
 * the root and pale at the tip. Normals point up (a tuft lit like the ground it stands on, never black on its back).
 * The kit's reed was tried first: its blades are 2-3 cm wide at full size, under a centimetre at tuft size — invisible.
 */
function tuftGeometry() {
  const pos = [], col = [], nor = [], idx = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < 18; b++) {
    const a = rnd() * Math.PI * 2, lean = 0.2 + rnd() * 0.5, h = 0.45 + rnd() * 0.55, w = 0.05 + rnd() * 0.04, r0 = rnd() * 0.16;
    const ox = Math.cos(a), oz = Math.sin(a), px = -oz, pz = ox, base = pos.length / 3;
    for (let k = 0; k <= 2; k++) {
      const t = k / 2, y = h * t * (1 - 0.25 * t * lean), out = r0 + lean * h * t * t, half = w * (1 - t * 0.9);
      const cx = ox * out, cz = oz * out, shade = 0.42 + 0.58 * t;
      pos.push(cx - px * half, y, cz - pz * half, cx + px * half, y, cz + pz * half);
      for (let q = 0; q < 2; q++) { col.push(shade, shade, shade * 0.9); nor.push(ox * 0.25, 1, oz * 0.25); }
      if (k) { const v = base + (k - 1) * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
/** The grass's one material: matte, both sides, swaying on the page's shared wind clock (tips most, roots not at all). */
function tuftMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = shader => {
    shader.uniforms.uWindT = windUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float k = position.y * position.y;
          transformed.x += sin(uWindT * 1.7 + wp.x * 0.35 + wp.z * 0.2) * 0.09 * k; transformed.z += cos(uWindT * 1.3 + wp.z * 0.3) * 0.05 * k; }`);
  };
  m.customProgramCacheKey = () => 'tv-tuft';
  return m;
}

/** Kit geometry for a clutter kind: [{ geo, mat }] (bark + leaf for a plant, one rock otherwise). */
function partsFor(kind, mats) {
  if (kind === 'tuft') return [{ geo: tuftGeometry(), mat: tuftMaterial() }];
  const [type, name] = CLUTTER_KINDS[kind].piece, out = [];
  if (type === 'rock') out.push({ geo: buildRock(name, { seed: 90 + name.length + (kind === 'lump' ? 7 : 0), lod: 1, size: 1 }).geometry, mat: mats.rock });
  else {
    const b = type === 'bush' ? buildBush(name, { seed: 81 + name.length, lod: 1 }) : buildFern(name, { seed: 77 + name.length, lod: 1 });
    if (b.bark) out.push({ geo: b.bark, mat: mats.bark });
    if (b.foliage) out.push({ geo: b.foliage, mat: mats.leaf });
  }
  return out;
}

export async function createGroundClutter(scene, { quality = 'high', zoneAt, tufts = true } = {}) {
  const group = new THREE.Group(); group.name = 'ground-clutter';
  const stats = { tuft: 0, detail: 0, calls: 0, refills: 0, ms: 0 };
  const api = { group, stats, update() {}, refresh() {}, dispose() {} };
  const reach = { tuft: tufts ? CLUTTER_LAYERS.tuft.reach[quality] ?? 0 : 0,      // tufts: false = the GPU grass (grass-gpu.js) draws the grass
    detail: CLUTTER_LAYERS.detail.reach[quality] ?? 0 };
  if (!atmosTierNow(quality).clutter || (!reach.tuft && !reach.detail)) return api;     // Low, and ?atmos=0 (the old look)
  scene.add(group);
  const mats = await foliageMaterials(false);
  const density = quality === 'medium' ? 0.75 : 1;

  // one instanced mesh per (kind, part); per-instance colour carries the biome tint and each item's tone
  const meshes = {};
  for (const kind of Object.keys(CLUTTER_KINDS)) {
    if (kind === 'tuft' && !reach.tuft) continue;
    const cap = kind === 'tuft' ? CLUTTER_LAYERS.tuft.cap : Math.ceil(CLUTTER_LAYERS.detail.cap / 2);
    meshes[kind] = partsFor(kind, mats).map(({ geo, mat }) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.name = 'clutter-' + kind; group.add(m);
      return m;
    });
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const fill = {};
  /** The tint an item is multiplied by: plants pulled 60% toward their biome colour, lumps the earth colour. */
  function tint(it) {
    if (!it.colour) return _c.setScalar(it.tone);
    _c.set(it.colour);
    if (it.kind === 'lump') return _c.multiplyScalar(2.2 * it.tone);     // the rock material is a grey ~0.45: lift the earth colour over it
    if (it.kind === 'tuft') return _c.multiplyScalar(1.35 * it.tone);   // a white material: the blades ARE the biome's grass colour
    if (it.kind === 'pebbles' || it.kind === 'stone') return _c.multiplyScalar(1.5 * it.tone);   // stone, a little darker than bare kit rock
    const l = (_c.r + _c.g + _c.b) / 3 || 1, k = 0.6;
    return _c.setRGB((1 - k + k * _c.r / l) * it.tone, (1 - k + k * _c.g / l) * it.tone, (1 - k + k * _c.b / l) * it.tone);
  }
  function put(it, y) {
    const parts = meshes[it.kind]; if (!parts?.length) return;
    const n = fill[it.kind] || 0; if (n >= parts[0].instanceMatrix.count) return;
    const sq = CLUTTER_KINDS[it.kind].squash || 1;
    _q.setFromAxisAngle(_up, it.yaw); _s.set(it.s, it.s * sq, it.s); _p.set(it.x, y - (it.kind === 'lump' ? 0.08 : it.kind === 'tuft' ? 0.03 : 0.04), it.z);
    _m.compose(_p, _q, _s); tint(it);
    for (const m of parts) { m.setMatrixAt(n, _m); m.instanceColor.setXYZ(n, _c.r, _c.g, _c.b); }
    fill[it.kind] = n + 1;
  }

  let zone = null;
  const zoneFor = (x, z) => { const b = zone?.bounds; if (b && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return zone; return (zone = zoneAt(x, z)); };
  function relayer(layer, cam) {
    const R = reach[layer]; if (!R) return 0;
    const c = CLUTTER_LAYERS[layer].cell, i0 = Math.floor((cam.x - R) / c), i1 = Math.floor((cam.x + R) / c), j0 = Math.floor((cam.z - R) / c), j1 = Math.floor((cam.z + R) / c);
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const { x, z } = cellSpot(layer, i, j), d = Math.hypot(x - cam.x, z - cam.z);
      if (d > R) continue;
      const L = zoneFor(x, z); if (!L?.nav || !L.T) continue;
      const nav = L.nav.at(x - L.ox, z - L.oz);
      if (!nav) continue;
      const it = clutterAt(layer, i, j, { biome: L.T.biomeKey(x, z), nav, palette: L.T.reader?.meta?.palette || null, density });
      if (!it) continue;
      // the last fifth of the reach shrinks to nothing, so the edge of the field is not a line of popping tufts
      const edge = Math.min(1, (R - d) / (R * 0.2)); if (edge < 0.15) continue;
      it.s *= edge;
      put(it, L.T.heightAt(x, z)); n++;
    }
    return n;
  }

  let last = null, dirty = true;
  function relod(cam) {
    const t0 = performance.now();
    for (const k in meshes) fill[k] = 0;
    zone = null;
    stats.tuft = relayer('tuft', cam); stats.detail = relayer('detail', cam);
    let calls = 0;
    for (const [k, parts] of Object.entries(meshes)) for (const m of parts) { m.count = fill[k] || 0; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; if (m.count) calls++; }
    stats.calls = calls; stats.refills++; stats.ms = +(performance.now() - t0).toFixed(1);
  }
  api.update = cam => {
    if (!cam) return;
    if (!dirty && last && Math.hypot(cam.x - last.x, cam.z - last.z) < MOVE) return;
    dirty = false; last = { x: cam.x, z: cam.z };
    relod(cam);
  };
  api.refresh = () => { dirty = true; };
  api.dispose = () => { scene.remove(group); for (const parts of Object.values(meshes)) for (const m of parts) m.dispose(); };
  return api;
}
