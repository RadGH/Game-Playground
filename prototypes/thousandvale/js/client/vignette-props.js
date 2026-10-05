// The dressing of stream E's vignettes (a hanged-man oak, a broken cart, a burned camp…): each placement
// names a recipe (data/vignettes/{m1,m2,m2b}.json) whose `props` are kit pieces at local offsets, turned by
// the placement's yaw with the SAME formula the server uses for the vignette's objects
// (js/sim/vignettes.js vignettePoint), so the satchel you read lies under the tree you see.
// The server owns everything you can use (notes, chests, NPCs, monsters); this file only draws.

import * as THREE from 'three';
import { buildTree } from '../../../../highdef-3d/js/kit/trees.js';
import { buildGroundDetail } from '../../../../highdef-3d/js/kit/rocks.js';
import { createDecor, foliageMaterials } from './decor.js';
import { localToWorld } from './town-view.js';

const RECIPE_FILES = ['m1', 'm2', 'm2b'];
let recipes = null;
export function loadVignetteRecipes() {
  if (!recipes) recipes = Promise.all(RECIPE_FILES.map(f => fetch(new URL(`../../data/vignettes/${f}.json`, import.meta.url)).then(r => (r.ok ? r.json() : { vignettes: [] })).catch(() => ({ vignettes: [] }))))
    .then(list => new Map(list.flatMap(d => d.vignettes || []).map(v => [v.id, v])));
  return recipes;
}

/** Every prop of every placement, in world metres. Pure given the recipes — exported for tests. */
export function vignettePropList(placements, byId, ox = 0, oz = 0) {
  const out = [];
  for (const pl of placements || []) {
    const v = byId.get(pl.id); if (!v) continue;
    const px = pl.x + ox, pz = pl.z + oz, yaw = pl.yaw || 0;
    for (const p of v.props || []) {
      const w = localToWorld(px, pz, yaw, p.x || 0, p.z || 0);
      out.push({ kind: p.kind, id: p.id, x: w.x, z: w.z, yaw: (p.yaw || 0) + yaw, scale: p.scale || 1, dead: !!p.dead, vignette: pl.id });
    }
  }
  return out;
}

const FIRE = new Set(['campfire', 'torch_post', 'fire_ring']);
const GROUND_GEO = new Map();

export async function createVignetteProps(T, placements, { quality = 'high' } = {}) {
  const byId = await loadVignetteRecipes();
  const list = vignettePropList(placements, byId, T.ox || 0, T.oz || 0);
  if (!list.length) return null;
  // props (with fires and their lights) through the decor builder, no random scatter
  const decor = await createDecor(T, { placements: list.filter(p => p.kind === 'prop').map(p => ({ kind: 'prop', id: p.id, x: p.x, z: p.z, yaw: p.yaw, data: FIRE.has(p.id) ? { fire: true } : {} })), density: 0, cheap: quality === 'low' });
  const group = decor.group; group.name = 'vignettes-' + (T.zoneKey || '');
  const mats = await foliageMaterials(quality === 'low');
  // trees: a handful, full detail
  for (const p of list.filter(p => p.kind === 'tree')) {
    const sp = p.dead ? 'dead_snag' : p.id;
    let b; try { b = buildTree(sp, { seed: 3000 + Math.round(p.x + p.z), lod: 0 }); } catch { continue; }
    const s = Math.min(1.6, p.scale * 0.62);
    for (const [geo, mat] of [[b.bark, mats.bark], [b.foliage, mats.leaf]]) {
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat); m.position.set(p.x, T.heightAt(p.x, p.z) - 0.1, p.z); m.rotation.y = p.yaw; m.scale.setScalar(s);
      m.castShadow = m.receiveShadow = true; group.add(m);
    }
  }
  // ground details: bones, ash, puddles, lichen
  const ground = list.filter(p => p.kind === 'ground');
  const byKind = new Map();
  for (const p of ground) { if (!byKind.has(p.id)) byKind.set(p.id, []); byKind.get(p.id).push(p); }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [id, ps] of byKind) {
    if (!GROUND_GEO.has(id)) { try { GROUND_GEO.set(id, buildGroundDetail(id, { seed: 9, lod: 0 }).geometry); } catch { GROUND_GEO.set(id, null); } }
    const g = GROUND_GEO.get(id); if (!g) continue;
    const m = new THREE.InstancedMesh(g, mats.prop, ps.length);
    ps.forEach((p, i) => { _q.setFromAxisAngle(up, p.yaw); m.setMatrixAt(i, _m.compose(_p.set(p.x, T.heightAt(p.x, p.z) + 0.02, p.z), _q, _s.setScalar(p.scale))); });
    m.receiveShadow = true; group.add(m);
  }
  return { group, update: decor.update, stats: { props: list.length } };
}
