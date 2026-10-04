// Stream C's Hunters vs Farmers art, wrapped for the HvF view (stream H): buildings from
// js/view/hvf-structures.js, farmers and hunters as Chibi 2 bodies and the army / pets as creatures
// (js/view/unit-looks.js, data/looks.json `hvf`), and the farm animals BAKED to one static mesh per
// species so a flock of hundreds stays one instanced draw (docs/hvf-PLAN.md §13).
//
//   const models = await loadHvfModels();          // null if the looks cannot load (the stand-ins stay)
//   models.building(kind, { color, w, d, mask })   // C's building object { group, update, setDamage, setProgress, setReady, fire, dispose }
//   models.body('farmer' | 'hunter', color)        // { object, setAnim(clip), update(dt), dispose() } — the model drops in when built
//   models.creature('army' | 'pets', id)           // same shape (scarecrow, crow, hound, hawk)
//   models.animal(kind) -> Promise<{ geometry, scale }>   // bind-pose geometry with vertex colours, metres
//   models.materials()                             // C's shared building materials (fogify each once per match)
//   models.animalPoses(kind) -> Promise<{ idle, walkA, walkB, run, graze, bleat, ... }>   // C's crowd poses (one InstancedMesh each)
//   models.linked(kind, mask) -> { std, metal, glow } geometries + models.material(key)   // joined fences / walls / hedges
//   models.ghost(group) -> restore()                // a downed farmer drawn translucent (looks.json hvf.ghost)

import * as THREE from 'three';
import { loadLooks, buildActor, applyGhost } from '../unit-looks.js';
import { makeHvfBuilding, hvfMaterials, hvfMaterial, linkedPiece } from '../hvf-structures.js';
import { creaturePoses } from '../../../../../avatar-3d/js/creature-poses.js';

let LOADING = null;
export function loadHvfModels() {
  if (!LOADING) LOADING = loadLooks().then((looks) => createModels(looks)).catch((err) => { console.warn('hvf models unavailable, using stand-ins', err); return null; });
  return LOADING;
}

function createModels(looks) {
  const animalCache = new Map(), poseCache = new Map();
  function holder(promise, scale = 1) {
    const object = new THREE.Group();
    object.scale.setScalar(scale);
    const b = { object, actor: null, clip: null, disposed: false,
      setAnim(clip) { if (b.actor && clip !== b.clip) { b.clip = clip; b.actor.setAnim(clip, 0.15, clip === 'attack'); } },
      update(dt, t) { b.actor?.update(dt, t); },
      dispose() { b.disposed = true; b.actor?.dispose(); },
    };
    promise.then((a) => { if (b.disposed) { a.dispose(); return; } b.actor = a; object.add(a.group); b.clip = null; }).catch((e) => console.warn('hvf model', e));
    return b;
  }
  return {
    looks,
    materials: hvfMaterials,
    material: (k) => hvfMaterial(k),
    linked: (kind, mask) => linkedPiece(kind, mask),
    ghost: (group) => applyGhost(group, looks.ghostStyle()),
    animalPoses(kind) {
      if (!poseCache.has(kind)) poseCache.set(kind, creaturePoses(looks.forHvf('animals', kind).spec));
      return poseCache.get(kind);
    },
    building(kind, opts) { return makeHvfBuilding(kind === 'ward' ? 'watchstone' : kind, opts); },
    body(role, color) { const look = looks.forRole(role, { color }); return holder(buildActor(look), look.scale || 1); },
    creature(kind, id) { const look = looks.forHvf(kind, id); return holder(buildActor(look), look.scale || 1); },
    animal(kind) {
      if (animalCache.has(kind)) return animalCache.get(kind);
      const p = buildActor(looks.forHvf('animals', kind)).then((a) => {
        a.group.updateMatrixWorld(true);
        const parts = [];
        a.group.traverse((o) => {
          if (!o.isMesh || !o.geometry.attributes.position) return;
          const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
          g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); if (g.attributes.uv) g.deleteAttribute('uv');
          if (!g.attributes.color) {   // a plain-coloured part: bake its material colour into vertex colours
            const c = o.material.color || new THREE.Color(1, 1, 1), n = g.attributes.position.count, arr = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) { arr[3 * i] = c.r; arr[3 * i + 1] = c.g; arr[3 * i + 2] = c.b; }
            g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
          }
          g.applyMatrix4(o.matrixWorld);
          parts.push(g);
        });
        let n = 0; for (const g of parts) n += g.attributes.position.count;
        const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
        let off = 0;
        for (const g of parts) {
          const cnt = g.attributes.position.count, col = g.attributes.color, k = col.itemSize;
          P.set(g.attributes.position.array, off * 3); N.set(g.attributes.normal.array, off * 3);
          for (let i = 0; i < cnt; i++) { C[(off + i) * 3] = col.getX(i); C[(off + i) * 3 + 1] = col.getY(i); C[(off + i) * 3 + 2] = k > 2 ? col.getZ(i) : col.getY(i); }
          off += cnt; g.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(P, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(C, 3));
        geometry.computeBoundingSphere();
        a.dispose();
        return { geometry, height: a.height };
      });
      animalCache.set(kind, p);
      return p;
    },
  };
}
