// Trees, rocks, bushes and placed props, from the high-def kit (highdef-3d/js/kit/*), drawn as
// instanced meshes.
//
// Trees come in three detail levels. Every half second each tree is re-sorted into the level its
// distance from the camera deserves and the instance lists are refilled — 1,500 trees is a trivial
// refill, and it keeps the whole forest at ~50 draw calls whatever its size. Only the two near levels
// cast shadows. Leaves sway in the vertex shader off the kit's `aWind` attribute.
//
// Placements use the shape stream B's bake will emit: { kind: 'prop' | 'ring', id, x, z, yaw, data }.

import * as THREE from 'three';
import { buildTree, buildBush, makeRng } from '../../../../highdef-3d/js/kit/trees.js';
import { buildRock, buildProp } from '../../../../highdef-3d/js/kit/rocks.js';
import { loadFoliageAtlas, makeSurface } from '../../../../highdef-3d/js/kit/textures.js';
import { makeNoise2D, fbm } from '../../../../worldgen/js/noise.js';

const SPECIES = ['pine', 'fir', 'oak', 'birch'];
const VARIANTS = 2;

const windUniform = { value: 0 };
function addWind(material, amount) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWindT = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aWind; uniform float uWindT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = aWind.y * 6.2831;
          #ifdef USE_INSTANCING
            ph += instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
          #endif
          float s = sin(uWindT * 1.7 + ph) * 0.6 + sin(uWindT * 3.1 + ph * 1.7) * 0.25;
          transformed.x += s * aWind.x * ${amount.toFixed(3)};
          transformed.z += s * aWind.x * ${(amount * 0.6).toFixed(3)};
        }`);
  };
  return material;
}

export async function createDecor(hf, { placements = [], paths = [], seed = 7, avoid = [], density = 1, lodFar = [70, 220], cheap = false } = {}) {
  const LOD_FAR = lodFar;   // metres: lod0 inside [0], lod1 inside [1], billboard beyond
  const group = new THREE.Group(); group.name = 'decor';
  const rng = makeRng(seed * 101 + 9);
  const nForest = makeNoise2D(seed * 13 + 5);   // breaks woods into groves

  // --- materials --------------------------------------------------------------------------------
  const atlas = await loadFoliageAtlas();
  const bark = makeSurface('bark_pine', { size: 256, seed: 3 });
  bark.map.wrapS = bark.map.wrapT = THREE.RepeatWrapping;
  // Cheap mode (software renderers): Lambert, no wind, so a leaf pixel costs one texture read.
  const mats = cheap ? {
    bark: new THREE.MeshLambertMaterial({ map: bark.map, vertexColors: true }),
    leaf: new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true, emissive: '#1c2a12', emissiveMap: atlas.texture, emissiveIntensity: 0.5 }),
    rock: new THREE.MeshLambertMaterial({ vertexColors: true, color: '#a29d94' }),
    prop: new THREE.MeshLambertMaterial({ vertexColors: true }),
  } : {
    bark: addWind(new THREE.MeshStandardMaterial({ map: bark.map, vertexColors: true, roughness: 0.95 }), 0.25),
    leaf: addWind(new THREE.MeshStandardMaterial({ map: atlas.texture, alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, emissive: '#1c2a12', emissiveMap: atlas.texture, emissiveIntensity: 0.55 }), 0.5),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, color: '#a29d94' }),
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  };

  // --- where trees grow -------------------------------------------------------------------------
  const segDist = (x, z) => {
    let best = 1e9;
    for (const p of paths) for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return best;
  };
  const blocked = (x, z) => avoid.some(a => Math.hypot(x - a.x, z - a.z) < a.r) || segDist(x, z) < 5;
  const trees = [];   // { x, y, z, yaw, s, sp, v }
  const rocks = [];
  const bushes = [];
  // Where things grow is the zone's biome: woods are dense, open grass has the odd tree and bush,
  // rock and sand have none; a noise field breaks woods into groves and glades.
  const FOREST_DENSITY = { temperateForest: 0.75, rainforest: 0.85, borealForest: 0.8, blighted: 0.5, hallowed: 0.55, marsh: 0.25, hills: 0.22, shrubland: 0.12, grassland: 0.07, savanna: 0.04, tundra: 0.03 };
  const b = hf.bounds, W = b.maxX - b.minX, D = b.maxZ - b.minZ;
  const tries = Math.round(W * D / 65 * density);
  const ylo = hf.heightAt(hf.spawn.x, hf.spawn.z);
  for (let i = 0; i < tries; i++) {
    const x = b.minX + 6 + rng() * (W - 12), z = b.minZ + 6 + rng() * (D - 12);
    if (blocked(x, z)) continue;
    if (hf.waterAt(x, z).depth > 0 || hf.waterAt(x + 3, z).depth > 0 || hf.waterAt(x, z + 3).depth > 0) continue;
    const y = hf.heightAt(x, z);
    const deg = hf.slopeDeg(x, z), slope = 1 - Math.cos(deg * Math.PI / 180);
    const biome = hf.biomeKey(x, z);
    const f = fbm(nForest, x * 0.006, z * 0.006, { octaves: 3 });
    const dens = (FOREST_DENSITY[biome] || 0) * (0.35 + f * 1.1);
    const r = rng();
    if (deg < 28 && r < dens * 0.32) {
      const high = biome === 'borealForest' || y > ylo + 110;
      const sp = high ? (rng() < 0.6 ? 'fir' : 'pine') : biome === 'rainforest' ? 'oak' : f > 0.6 ? SPECIES[Math.floor(rng() * 2)] : SPECIES[2 + Math.floor(rng() * 2)];
      trees.push({ x, y, z, yaw: rng() * 6.283, s: 0.75 + rng() * 0.5, sp, v: Math.floor(rng() * VARIANTS) });
    } else if (deg > 20 && rng() < 0.02 + slope * 0.25) {
      rocks.push({ x, y, z, yaw: rng() * 6.283, s: 0.6 + rng() * 1.4, k: Math.floor(rng() * 3) });
    } else if (r < 0.006 + dens * 0.04 && deg < 25) {
      bushes.push({ x, y, z, yaw: rng() * 6.283, s: 0.8 + rng() * 0.6, k: Math.floor(rng() * 2) });
    }
  }

  // --- tree LOD meshes --------------------------------------------------------------------------
  const lodMeshes = new Map();   // `${sp}|${v}` -> [{ bark, leaf }] by lod
  const byKind = new Map();
  for (const t of trees) { const k = `${t.sp}|${t.v}`; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(t); }
  for (const [k, list] of byKind) {
    const [sp, v] = k.split('|');
    const levels = [];
    for (let lod = 0; lod < 3; lod++) {
      const built = buildTree(sp, { seed: 1000 + SPECIES.indexOf(sp) * 10 + +v, lod, height: undefined });
      const mk = (geo, mat) => {
        if (!geo) return null;
        const m = new THREE.InstancedMesh(geo, mat, list.length);
        m.count = 0; m.castShadow = lod < 2; m.receiveShadow = lod < 2; m.frustumCulled = false;
        group.add(m); return m;
      };
      levels.push({ bark: mk(built.bark, mats.bark), leaf: mk(built.foliage, mats.leaf) });
    }
    lodMeshes.set(k, { levels, list });
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function relod(cam) {
    for (const { levels, list } of lodMeshes.values()) {
      const n = [0, 0, 0];
      for (const t of list) {
        const d = Math.hypot(t.x - cam.x, t.z - cam.z);
        const lod = d < LOD_FAR[0] ? 0 : d < LOD_FAR[1] ? 1 : 2;
        _q.setFromAxisAngle(_up, t.yaw); _s.setScalar(t.s); _p.set(t.x, t.y - 0.15, t.z);
        _m.compose(_p, _q, _s);
        const L = levels[lod];
        if (L.bark) L.bark.setMatrixAt(n[lod], _m);
        if (L.leaf) L.leaf.setMatrixAt(n[lod], _m);
        n[lod]++;
      }
      levels.forEach((L, i) => { for (const m of [L.bark, L.leaf]) if (m) { m.count = n[i]; m.instanceMatrix.needsUpdate = true; } });
    }
  }

  // --- rocks and bushes (static instances) ------------------------------------------------------
  const ROCK_KINDS = ['boulder', 'mossy_boulder', 'rock_cluster'];
  ROCK_KINDS.forEach((kind, ki) => {
    const list = rocks.filter(r => r.k === ki);
    if (!list.length) return;
    const g = buildRock(kind, { seed: 40 + ki, lod: 1, size: 2 }).geometry;
    const m = new THREE.InstancedMesh(g, mats.rock, list.length);
    list.forEach((r, i) => { _q.setFromAxisAngle(_up, r.yaw); _s.setScalar(r.s); _p.set(r.x, r.y - 0.3 * r.s, r.z); m.setMatrixAt(i, _m.compose(_p, _q, _s)); });
    m.castShadow = m.receiveShadow = true; group.add(m);
  });
  ['shrub', 'berry_bush'].forEach((kind, ki) => {
    const list = bushes.filter(b => b.k === ki);
    if (!list.length) return;
    const built = buildBush(kind, { seed: 60 + ki, lod: 1 });
    for (const [geo, mat] of [[built.bark, mats.bark], [built.foliage, mats.leaf]]) {
      if (!geo) continue;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((b, i) => { _q.setFromAxisAngle(_up, b.yaw); _s.setScalar(b.s); _p.set(b.x, b.y - 0.05, b.z); m.setMatrixAt(i, _m.compose(_p, _q, _s)); });
      m.castShadow = true; group.add(m);
    }
  });

  // --- placed props -----------------------------------------------------------------------------
  const lights = [];   // flickering fires
  const flames = [];
  const propCache = new Map();
  const propGeo = id => { if (!propCache.has(id)) { try { propCache.set(id, buildProp(id, { seed: 5, lod: 0 }).geometry); } catch { try { propCache.set(id, buildRock(id, { seed: 5, lod: 0 }).geometry); } catch { propCache.set(id, null); } } } return propCache.get(id); };
  const flameMat = new THREE.SpriteMaterial({ map: makeFlameTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  // Props are batched by id into one InstancedMesh each (a palisade is 150 stakes, one draw).
  const batches = new Map();   // id -> [{ x, y, z, yaw }]
  const place = (id, x, z, yaw, data = {}) => {
    const g = propGeo(id);
    if (!g || hf.waterAt(x, z).depth > 0) return;
    const y = hf.heightAt(x, z) - 0.02;
    if (!batches.has(id)) batches.set(id, []);
    batches.get(id).push({ x, y, z, yaw: yaw || 0 });
    if (data.fire) {
      const top = id === 'torch_post' ? 2.05 : 0.45;
      const fl = new THREE.Sprite(flameMat); fl.scale.set(id === 'torch_post' ? 0.6 : 1.3, id === 'torch_post' ? 0.9 : 1.7, 1);
      fl.position.set(x, y + top + (id === 'torch_post' ? 0.25 : 0.55), z); group.add(fl); flames.push(fl);
      if (id === 'campfire' || lights.length < 3) {
        const l = new THREE.PointLight('#ffae5c', id === 'campfire' ? 22 : 8, id === 'campfire' ? 16 : 9, 1.6);
        l.position.set(x, y + top + 0.6, z); group.add(l); lights.push(l);
      }
    }
    if (data.glow) {
      const l = new THREE.PointLight(data.glow, 10, 10, 1.8); l.position.set(x, y + 1.6, z); group.add(l);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: data.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(x, y + 1.3, z); s.scale.set(2.6, 3.2, 1); group.add(s); flames.push(s);
    }
  };
  for (const p of placements) {
    if (p.kind === 'prop') place(p.id, p.x, p.z, p.yaw, p.data);
    else if (p.kind === 'ring') {
      const { r, from, to, step } = p.data;
      for (let a = from; a <= to; a += step) place(p.id, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, -a + rng() * 0.3, {});
    }
  }
  for (const [id, list] of batches) {
    const m = new THREE.InstancedMesh(propGeo(id), mats.prop, list.length);
    list.forEach((b, i) => { _q.setFromAxisAngle(_up, b.yaw); _s.setScalar(1); _p.set(b.x, b.y, b.z); m.setMatrixAt(i, _m.compose(_p, _q, _s)); });
    m.castShadow = m.receiveShadow = true; m.name = 'prop-' + id; group.add(m);
  }

  let relodAt = 0, t = 0;
  return {
    group, stats: { trees: trees.length, rocks: rocks.length, bushes: bushes.length },
    update(dt, cam) {
      t += dt; windUniform.value = t;
      if (t >= relodAt) { relodAt = t + 0.5; relod(cam); }
      for (let i = 0; i < lights.length; i++) lights[i].intensity = (i === 0 ? 22 : 8) * (0.85 + Math.sin(t * 11 + i * 3) * 0.08 + Math.sin(t * 23 + i) * 0.06);
      for (let i = 0; i < flames.length; i++) flames[i].material.rotation = Math.sin(t * 6 + i) * 0.08;
    },
  };
}

function makeFlameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 92, 2, 32, 80, 50);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,190,90,0.9)'); grd.addColorStop(0.6, 'rgba(230,90,30,0.45)'); grd.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = grd; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(62, 70, 46, 118); g.lineTo(18, 118); g.quadraticCurveTo(2, 70, 32, 4); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
