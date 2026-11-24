// HIGH-DETAIL BODIES (settings.models = 'hd'): enemies are fal.ai models (avatar-3d/fal, js/fal.js), heroes and the story
// people built from a look are Tabard characters (avatar-3d/tabard, js/tabard.js). Who gets which model: hd-map.js +
// data/hd-models.json. Both runtimes and their catalogs are imported straight from avatar-3d, never copied, so a model
// fixed or added there shows up here as is.
//
//   const kit = await loadHdKit();            // null when the catalogs cannot load (everything stays on the old models)
//   kit.specFor(data, e, look) → spec | null  // hd-map.js hdSpecFor
//   const body = await buildHd(spec, { hull })   // hull(mesh) → its outline material (actors.js), or null for none
// A body has the same shape as the old ones (actors.js buildChibi): { obj, kind: 'fal' | 'tabard', h, mats, anim,
// play(name, { dur, wind }), loop(name, rate, fade), update(dt), dispose() } — so the rest of the drawing code does not
// care which model it moves. Wyrmroad clip names map to the model's clips through hd-models.json `clips`; a one-shot is
// sped up so the model clip's blow (hd-models.json `strike`) lands on the sim's wind-up, or fitted to its duration.
// Enemy bodies arrive as ~10 body-part meshes on one skeleton and one texture: they are merged into ONE skinned mesh
// (one draw call; the merged geometry is shared by every enemy of that body).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFalCharacter, loadCatalog, CLIPS as FAL_CLIPS, glb as falGlb } from '../../../../avatar-3d/fal/js/fal.js';
import { BEAST_CLIPS } from '../../../../avatar-3d/fal/js/beast.js';
import { createTabard, loadTabardData, CLIPS as TABARD_CLIPS } from '../../../../avatar-3d/tabard/js/tabard.js';
import { hdIndex, hdSpecFor, pickClip } from './hd-map.js';

let KIT = null;
export function loadHdKit() {
  if (!KIT) KIT = (async () => {
    const soft = p => p.catch(e => { console.warn('[wyrmroad] high-detail models:', e?.message || e); return null; });
    const [map, fal, tabard, anims] = await Promise.all([
      soft(fetch(new URL('../../data/hd-models.json', import.meta.url)).then(r => { if (!r.ok) throw new Error('hd-models.json ' + r.status); return r.json(); })),
      soft(loadCatalog()), soft(loadTabardData()), soft(falGlb('models/final/anims.glb')),
    ]);
    const H = hdIndex(map, fal, tabard);
    if (!H.ok) return null;
    const falLen = {};
    for (const c of anims?.animations || []) falLen[c.name] = c.duration;
    return { H, falLen, specFor: (data, e, look) => hdSpecFor(H, data, e, look) };
  })();
  return KIT;
}

// ------------------------------------------------------------------------------------------------ shared pieces
const FAL_KEYS = new Map(FAL_CLIPS.map(([k, lib]) => [k, lib]));
// four-legged bodies (catalog skeleton 'quadruped') move by avatar-3d/fal/js/beast.js: its keys, and its one-shot lengths
// (beast.js keeps them to itself: the same numbers here, only used to fit a one-shot to the sim's timing)
const BEAST_LEN = { attack: 0.9, hit: 0.5, death: 1.3 };
const heights = new Map();                  // model id → { h, minY } measured once at rest
const mergedGeo = new Map();                // fal body id → the body's parts merged into one geometry (shared)

function measure(id, group) {
  if (heights.has(id)) return heights.get(id);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  group.traverse(o => { if (o.isSkinnedMesh && o.visible) { o.skeleton.update(); o.computeBoundingBox(); b.copy(o.boundingBox).applyMatrix4(o.matrixWorld); box.union(b); } });
  const m = { h: Math.max(0.3, box.max.y - box.min.y), minY: box.min.y };
  heights.set(id, m);
  return m;
}

/** fal bodies: the body parts (one skeleton, one texture) as one skinned mesh. Returns the mesh, or null to keep the parts. */
function mergeParts(c, bodyId) {
  const parts = Object.values(c.regions || {});
  if (parts.length < 2) return null;
  const ref = parts[0], names = Object.keys(ref.geometry.attributes).sort().join();
  const same = parts.every(p => p.parent === ref.parent && p.bindMatrix.equals(ref.bindMatrix)
    && Object.keys(p.geometry.attributes).sort().join() === names && !Object.keys(p.geometry.morphAttributes).length
    && p.skeleton.bones.length === ref.skeleton.bones.length && p.skeleton.bones.every((bn, i) => bn === ref.skeleton.bones[i])
    && !!p.geometry.index === !!ref.geometry.index);
  if (!same) return null;
  let geo = mergedGeo.get(bodyId);
  if (geo === undefined) { geo = mergeGeometries(parts.map(p => p.geometry), false) || null; mergedGeo.set(bodyId, geo); }
  if (!geo) return null;
  const m = new THREE.SkinnedMesh(geo, ref.material);
  m.name = 'hd-body'; m.frustumCulled = false; m.castShadow = true;
  ref.parent.add(m); m.bind(ref.skeleton, ref.bindMatrix);
  for (const p of parts) { p.removeFromParent(); if (p !== ref) p.material.dispose(); }   // never drawn: nothing compiled
  return m;
}

/** Make every material fade-able without a shader rebuild (alphaHash, as the old bodies) and remember its base look. */
function prepMats(obj) {
  const mats = new Set();
  obj.traverse(o => {
    if (!o.isMesh || !o.material || o.userData.outline) return;
    for (const m of [].concat(o.material)) {
      m.alphaHash = true;
      m.userData.baseColor = m.color?.clone();
      if (m.emissive) { m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = m.emissiveIntensity ?? 1; }
      mats.add(m);
    }
  });
  return [...mats];
}

/** The play / loop / update part every high-detail body shares. impl: { play(key, fade), update(dt), len(key), has(key) } */
function driver(H, impl, strike) {
  let cur = '', key = null, rate = 1;
  return {
    get anim() { return cur; },
    play(name, { dur = 0, fade = 0.08, wind = 0 } = {}) {
      const k = pickClip(H, name, impl.has, { once: true }); cur = name;
      if (!k) return;
      impl.play(k, fade); key = k;
      const len = impl.len(k) || 0.6, s = strike?.[k];
      if (name === 'dead') rate = dur > 0 ? Math.min(2.5, Math.max(1, len / dur)) : 1;
      else if (wind > 0.05 && s) rate = Math.min(4, Math.max(0.6, s / wind));
      else rate = dur > 0 ? Math.min(4, Math.max(0.5, len / dur)) : 1;
    },
    loop(name, r = 1, fade = 0.15) {
      const k = pickClip(H, name, impl.has);
      if (k && k !== key) { impl.play(k, fade); key = k; }
      cur = name; rate = r;
    },
    update(dt) { impl.update(dt * rate); },
  };
}

// ------------------------------------------------------------------------------------------------ fal enemies
async function buildFal(kit, spec, { hull = null } = {}) {
  const c = await createFalCharacter(spec.body);
  const m0 = measure('fal:' + spec.body, c.group);
  const merged = mergeParts(c, spec.body);
  // the body's own weapon, or the one hd-models.json names (null: empty hands)
  const jobs = [];
  if (spec.weapon) jobs.push(c.equip('weapon', spec.weapon).catch(e => console.warn('[wyrmroad] weapon', spec.weapon, e?.message)));
  if (spec.offhand) jobs.push(c.equip('offhand', spec.offhand).catch(e => console.warn('[wyrmroad] offhand', spec.offhand, e?.message)));
  await Promise.all(jobs);
  const obj = new THREE.Group(); obj.name = 'hd:' + spec.body; obj.add(c.group);
  c.group.position.y = -m0.minY;                       // feet on the ground
  const mats = prepMats(obj);
  const bodyMats = mats.filter(m => merged ? m === merged.material : true);
  if (spec.tint) { const t = new THREE.Color(spec.tint); for (const m of bodyMats) { m.color.lerp(t, spec.tintK); m.userData.baseColor = m.color.clone(); } }
  if (spec.glow) for (const m of bodyMats) { m.emissive.set(spec.glow); m.emissiveIntensity = 0.55; m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = 0.55; }
  if (hull && merged) { const om = hull(merged); if (om) mats.push(om); }
  const beast = kit.H.bodies.get(spec.body)?.skeleton === 'quadruped';
  const clipsOf = beast
    ? { has: k => BEAST_CLIPS.includes(k), len: k => BEAST_LEN[k] || 1 }
    : { has: k => FAL_KEYS.has(k) && !!kit.falLen[FAL_KEYS.get(k)], len: k => kit.falLen[FAL_KEYS.get(k)] || 0 };
  const d = driver(kit.H, { ...clipsOf, play: (k, fade) => c.play(k, fade), update: dt => c.update(dt) }, kit.H.map.strike);
  return {
    obj, kind: 'fal', h: m0.h, mats, fal: c, hd: true,
    get anim() { return d.anim; }, play: d.play, loop: d.loop, update: d.update,
    dispose() { for (const m of mats) m.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ Tabard people
async function buildTabard(kit, spec, { hull = null } = {}) {
  const t = await createTabard({ body: spec.body, items: spec.items, clip: 'idle', calm: 0.35, look: spec.look || null });
  const m0 = measure('tabard:' + spec.body, t.group);
  const obj = new THREE.Group(); obj.name = 'hd:tabard-' + spec.body; obj.add(t.group);
  t.group.position.y = -m0.minY;
  t.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const mats = prepMats(obj);
  let body = null; t.group.traverse(o => { if (o.isSkinnedMesh && o.visible && !body) body = o; });
  if (hull && body) { const om = hull(body); if (om) mats.push(om); }
  const d = driver(kit.H, {
    has: k => k in TABARD_CLIPS,
    len: () => t.duration(),
    play: (k, fade) => t.play(k, fade),
    update: dt => t.update(dt),
  }, kit.H.map.strike);
  return {
    obj, kind: 'tabard', h: m0.h, mats, tabard: t, hd: true, baseKey: spec.baseKey,
    /** Restyle face + hair in place (same body and gear). New layer materials are made fade-able like the rest. */
    async setLook(look) { await t.setLook(look); for (const m of prepMats(obj)) if (!mats.includes(m)) mats.push(m); },
    get anim() { return d.anim; }, play: d.play, loop: d.loop, update: d.update,
    dispose() { for (const m of mats) m.dispose(); t.dispose(); },
  };
}

/** Build the body a spec names (throws when the model cannot load: the caller falls back to the old model). */
export async function buildHd(spec, opts = {}) {
  const kit = await loadHdKit();
  if (!kit) throw new Error('high-detail models are not available');
  return spec.type === 'tabard' ? buildTabard(kit, spec, opts) : buildFal(kit, spec, opts);
}
