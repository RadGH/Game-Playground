// Fewer draws per monster (M30, phones): the bestiary kit builds a monster from ~23 small meshes, and every mesh is a
// draw call (twice with shadows). Meshes that never move on their own — leaf meshes under the same parent with the
// same material — are baked into one mesh. Anything the animator touches is left alone: objects referenced from the
// group's userData (legs, arms, wings, glow, candles…), objects that carry their own userData (an animated node keeps
// its build pose in userData.base), and anything with children. The look and the animation do not change.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function referenced(group) {
  const keep = new Set();
  const visit = (v, depth) => {
    if (!v || depth > 3) return;
    if (v.isObject3D) { keep.add(v); return; }
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    if (typeof v === 'object') for (const x of Object.values(v)) visit(x, depth + 1);
  };
  visit(group.userData, 0);
  return keep;
}
/** Normalise geometries so they can be merged: same attributes, all non-indexed. */
function prep(list) {
  const names = list.map(g => Object.keys(g.attributes));
  const common = names[0].filter(n => names.every(ns => ns.includes(n)));
  return list.map(g => {
    let c = g.index ? g.toNonIndexed() : g.clone();
    for (const n of Object.keys(c.attributes)) if (!common.includes(n)) c.deleteAttribute(n);
    c.morphAttributes = {};
    return c;
  });
}
export function mergeStatic(group) {
  const keep = referenced(group);
  let before = 0, after = 0;
  const parents = [];
  group.traverse(o => { if (o.children.length) parents.push(o); });
  for (const parent of parents) {
    const buckets = new Map();
    for (const m of parent.children) {
      if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || m.children.length || keep.has(m) || Object.keys(m.userData).length || !m.visible) continue;
      if (Array.isArray(m.material)) continue;
      const k = m.material.uuid + (m.castShadow ? 's' : '') + (m.receiveShadow ? 'r' : '');
      (buckets.get(k) || buckets.set(k, []).get(k)).push(m);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      before += list.length;
      const geos = prep(list.map(m => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); }));
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      for (const g of geos) g.dispose();
      merged.computeBoundingSphere();
      const one = new THREE.Mesh(merged, list[0].material); one.castShadow = list[0].castShadow; one.receiveShadow = list[0].receiveShadow; one.name = 'merged';
      for (const m of list) parent.remove(m);
      parent.add(one); after++;
    }
  }
  group.userData.merged = { before, after };
  return group;
}
