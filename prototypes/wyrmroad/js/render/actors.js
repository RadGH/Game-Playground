// Everyone on the road: heroes (Chibi 2.6, dressed from their gear), Rook Gang / Lantern Order foes (Chibi looks from
// enemies.json) and creatures (avatar-3d creatures.js). Each actor follows the sim's view state: drawn between steps
// (lerp p → now, rule 28), facing its `dir` with heroes turned ~25° toward the camera, one clip per state and one-shot
// clips from `move` events timed to their `dur`. Enemy wind-ups glow and show a "!" (rule 39). Drawn height = data height
// (rule 21). Bodies are built sliced (prepareChibi2) and cached by look; while a new look builds the old body (or a
// stand-in) stays on screen.
import * as THREE from 'three';
import { createChibi2Character, prepareChibi2 } from '../../../../avatar-3d/js/chibi2.js';
import { CHIBI2_COMBAT_ALL, CHIBI2_MELEE_ANIMS, CHIBI2_EMOTE_ANIMS, CHIBI2_CLIP_SECONDS } from '../../../../avatar-3d/js/chibi2-motion.js';
import { createCreature } from '../../../../avatar-3d/js/creatures.js';
import { compactCreature } from '../../../../avatar-3d/js/mesh-merge.js';
import { holdFor } from '../../../../avatar-3d/js/chibi2-weapon-ids.js';
import { dressedLook } from '../sim/items.js';
import { blobTex, angleMaskTex, glyphAtlas, glowTex } from './kit.js';
import { handsFor, clipFor, twoHandClips } from './hands.js';

/** Every clip a Wyrmroad Chibi is built with (classes.json / enemies.json name only clips from these lists). */
export const CHIBI_ANIMS = [...new Set([...CHIBI2_COMBAT_ALL, ...CHIBI2_MELEE_ANIMS, ...CHIBI2_EMOTE_ANIMS])];
/** Player colours (ring under each hero; the HUD uses the same four). */
export const HERO_COLORS = ['#f2c14e', '#3ec7c0', '#ef5b4c', '#a77df0'];
export const HERO_HEIGHT = 1.75;
const THREAT = new THREE.Color('#ff6a3a');
const FRIEND_TELL = new THREE.Color('#ffd36a');
const ICE = new THREE.Color('#5aa8ff');
const HITME = new THREE.Color('#ffe08a'), CALM = new THREE.Color('#fff0c8');
const breathe = () => new Promise(r => setTimeout(r, 0));
const TURN = 0.44;   // ~25°: heroes face partly toward the camera so faces read

// ------------------------------------------------------------------------------------------------ outline (inverted hull)
// One program each for skinned and rigid bodies; per-actor clones only carry the opacity (dead fade), so no recompiles.
function outlineMaterial(skinned, thickness) {
  const m = new THREE.MeshBasicMaterial({ color: 0x1c1410, side: THREE.BackSide, alphaHash: true });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace(skinned ? '#include <skinning_vertex>' : '#include <begin_vertex>',
      (skinned ? '#include <skinning_vertex>' : '#include <begin_vertex>') + `\n transformed += normalize(${skinned ? 'objectNormal' : 'normal'}) * ${thickness.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'wyrm-outline-' + (skinned ? 's' : 'r') + thickness.toFixed(4);
  return m;
}
const OUTLINE = { skinned: null, rigid: null };
function outlineBase(skinned) {
  const k = skinned ? 'skinned' : 'rigid';
  if (!OUTLINE[k]) OUTLINE[k] = outlineMaterial(skinned, skinned ? 0.011 : 0.016);
  return OUTLINE[k];
}
function cloneMat(m) {
  const c = m.clone();
  if (m.onBeforeCompile) c.onBeforeCompile = m.onBeforeCompile;
  if (m.customProgramCacheKey) c.customProgramCacheKey = m.customProgramCacheKey;
  return c;
}

// ------------------------------------------------------------------------------------------------ body shape
/**
 * The form alone decides the chest (owner 2026-11-21: "Masculine should always be flat and Feminine should always be
 * round, and could be even a little more pronounced"): 'fem' → Chibi 2.6's fuller 'full' curve, anything else flat. A
 * saved look's own body.chestSize (round 1 had a separate Chest row) is ignored. Applies to every Chibi we draw.
 */
export function bodyShape(look) {
  if (!look || !look.body) return look;
  const want = look.body.form === 'fem' ? 'full' : 'flat';
  return look.body.chestSize === want ? look : { ...look, body: { ...look.body, chestSize: want } };
}

// ------------------------------------------------------------------------------------------------ outline hull minus the face
/**
 * The toon outline is an inverted hull: the body drawn again, a little fatter, back faces only, in ink. On a face that
 * outlined every small feature — each lip, the nose, the brows, the lids — so a mouth read as 3–4 separate lines (owner
 * 2026-11-21: "reduce the cell shading effect on facial details"). The hull keeps the body, clothes, hair and the head's
 * silhouette and leaves out the face's features: every piece riding the eye, pupil, lid, mouth or jaw bones, and every
 * small piece on the head bone that sits on the front of the face (smaller than about half the head). Pieces are found
 * as connected parts of the merged mesh. One hull index per geometry (bodies of one look share it).
 */
const FACE_BONES = /^(eye|pupil|eyelid|mouth|jaw)/;
const hullIndexOf = new WeakMap();
function hullGeometry(mesh, headSize) {
  const g = mesh.geometry;
  if (hullIndexOf.has(g)) return hullIndexOf.get(g);
  const idx = g.index.array, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = pos.count;
  const names = mesh.skeleton.bones.map(b => b.name);
  const head = names.indexOf('head'), headZ = head >= 0 ? new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[head].clone().invert().premultiply(new THREE.Matrix4().copy(mesh.bindMatrixInverse))).z : 0;
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let t = 0; t < idx.length; t += 3) { const r = find(idx[t]); parent[find(idx[t + 1])] = r; parent[find(idx[t + 2])] = r; }
  const parts = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i); let P = parts.get(r);
    if (!P) parts.set(r, P = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity, face: 0, head: 0, n: 0 });
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x < P.x0) P.x0 = x; if (x > P.x1) P.x1 = x; if (y < P.y0) P.y0 = y; if (y > P.y1) P.y1 = y; if (z < P.z0) P.z0 = z; if (z > P.z1) P.z1 = z;
    const b = names[si.getX(i)] || '', w = sw.getX(i);
    if (FACE_BONES.test(b)) P.face += w; else if (b === 'head') P.head += w;
    P.n++;
  }
  const drop = new Set();
  for (const [r, P] of parts) {
    const size = Math.max(P.x1 - P.x0, P.y1 - P.y0, P.z1 - P.z0);
    if (P.face > P.n * 0.5) drop.add(r);
    else if (P.head + P.face > P.n * 0.5 && size < headSize * 0.55 && (P.z0 + P.z1) / 2 > headZ + 0.03) drop.add(r);
  }
  let out = g;
  if (drop.size) {
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) if (!drop.has(find(idx[t]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    out = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) if (g.attributes[k]) out.setAttribute(k, g.attributes[k]);
    out.setIndex(keep); out.boundingSphere = g.boundingSphere; out.boundingBox = g.boundingBox;
  }
  hullIndexOf.set(g, out);
  return out;
}

// ------------------------------------------------------------------------------------------------ bodies
/**
 * A body: { obj, kind, h (native height), play(name, { dur, fade, restart }), loop(name, rate), update(dt), mats, dispose() }.
 * Materials are per-actor clones (same shader program) so one actor can flash without flashing every look-alike.
 * A body that holds a two-hander also gets the two-handed strikes and the left hand's reach (hands.js); a weapon drawn
 * shorter than its kind is lengthened there too.
 */
async function buildChibi(look, { low, anims = CHIBI_ANIMS, outline = true } = {}) {
  look = bodyShape(look);
  const h0 = holdFor(look), twoKind = h0.right === 'staff' && h0.left === 'none' ? 'staff' : (h0.twoHand ? 'two' : null);
  if (twoKind && anims.length > 4) anims = [...anims, ...twoHandClips(twoKind)];
  const o = { v25: true, v26: true, anims, park: true, ...(low ? { graphics: 'low' } : {}) };
  try { await prepareChibi2(look, { ...o, slice: breathe, budget: 8 }); } catch { /* the build below reports it */ }
  const c = await createChibi2Character(look, o);
  const hands = handsFor(c, look);
  const mats = [], outlines = [];
  const skinned = []; c.group.traverse(n => { if (n.isSkinnedMesh) skinned.push(n); });
  const headSize = c.metrics().headHeight || c.metrics().height * 0.2;
  for (const n of skinned) {
    const m = cloneMat(n.material); m.alphaHash = true; n.material = m; n.castShadow = true; mats.push(m);
    if (outline) {
      const om = outlineBase(true).clone(); om.onBeforeCompile = outlineBase(true).onBeforeCompile; om.customProgramCacheKey = outlineBase(true).customProgramCacheKey;
      const hull = new THREE.SkinnedMesh(hullGeometry(n, headSize), om); hull.castShadow = false; hull.boundingSphere = n.boundingSphere; hull.userData.outline = true;
      hull.bind(n.skeleton, n.bindMatrix); n.parent.add(hull); outlines.push(om); mats.push(om);
    }
  }
  const h = c.metrics().height || 1.3;
  const two = hands?.kind || null;
  let cur = '', clip = 'idle';           // '' until the first loop/play: the character starts on Chibi's own idle, which a two-hander swaps for w2_idle
  const pick = name => { const k = clipFor(name, two); return anims.includes(k) ? k : name; };
  return {
    obj: c.group, kind: 'chibi', h, mats, outlines, chibi: c, hands,
    get anim() { return cur; },
    play(name, { dur = 0, fade = 0.08, restart = true } = {}) {
      if (!anims.includes(name)) name = fallbackClip(name, anims);
      clip = pick(name); c.setAnim(clip, fade, restart); cur = name;
      const len = CHIBI2_CLIP_SECONDS[clip] || CHIBI2_CLIP_SECONDS[name] || 0.6;
      c.setRate(dur > 0 ? len / dur : 1);
    },
    loop(name, rate = 1, fade = 0.15) {
      if (!anims.includes(name)) name = fallbackClip(name, anims);
      if (cur !== name) { clip = pick(name); c.setAnim(clip, fade, false); } cur = name; c.setRate(rate);
    },
    update(dt) { hands?.pre(); c.update(dt); hands?.update(dt, clip); },
    dispose() { for (const m of mats) m.dispose(); c.dispose(); },
  };
}
function fallbackClip(name, anims) {
  if (name === 'getup') return 'ready';
  if (/cast|channel|pray/.test(name) && anims.includes('cast')) return 'cast';
  return anims.includes('attack') ? 'attack' : 'idle';
}

const CREATURE_LOOPS = new Set(['idle', 'walk', 'run', 'fly', 'talk']);
async function buildCreature(spec, { low, outline = true, render = null } = {}) {
  const c = await createCreature(spec, { detail: low ? 0.5 : 0.85 });
  compactCreature(c);      // one skinned mesh per material kind instead of one mesh per bead (avatar-3d/js/mesh-merge.js)
  const mats = [];
  const meshes = []; c.group.traverse(n => { if (n.isMesh) meshes.push(n); });
  c.group.updateMatrixWorld(true);
  const sizeOf = n => { if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere(); const v = new THREE.Vector3(); n.getWorldScale(v); return n.geometry.boundingSphere.radius * Math.max(v.x, v.y, v.z); };
  // the folded body (skinned) gets the hull; of the pieces that move on their own only the two biggest do
  const ranked = meshes.map(n => [n, sizeOf(n)]).sort((x, y) => (y[0].isSkinnedMesh - x[0].isSkinnedMesh) || (y[1] - x[1]));
  let rigidHulls = 0;
  for (const [n] of ranked) {
    const m = n.material.clone(); if (n.material.onBeforeCompile) m.onBeforeCompile = n.material.onBeforeCompile;
    m.alphaHash = true; m.userData.baseEmissive = m.emissive?.clone(); m.userData.baseEI = m.emissiveIntensity ?? 1;
    n.material.dispose(); n.material = m; mats.push(m);    // the original was never drawn: no shader is released
    if (!outline) continue;
    if (n.isSkinnedMesh) {
      const om = outlineBase(true).clone(); om.onBeforeCompile = outlineBase(true).onBeforeCompile; om.customProgramCacheKey = outlineBase(true).customProgramCacheKey;
      const hull = new THREE.SkinnedMesh(n.geometry, om); hull.castShadow = false; hull.frustumCulled = false; hull.bind(n.skeleton, n.bindMatrix); n.parent.add(hull); mats.push(om);
    } else if (rigidHulls < 2 && sizeOf(n) > 0.1) {
      const om = outlineBase(false).clone(); om.onBeforeCompile = outlineBase(false).onBeforeCompile; om.customProgramCacheKey = outlineBase(false).customProgramCacheKey;
      const hull = new THREE.Mesh(n.geometry, om); hull.castShadow = false; n.add(hull); mats.push(om); rigidHulls++;
    }
  }
  const box = new THREE.Box3().setFromObject(c.group);
  const h = Math.max(0.2, box.max.y - Math.min(0, box.min.y));
  // a giant green-flame ghost (Aldric Eternal, the Lantern Wraith): tongues of flame licking up round its body
  const aura = render?.big === 'flame_ghost' ? flameAura(c.group, box, render.tint || '#7affa0') : null;
  let cur = 'idle', oneT = 0;
  return {
    obj: c.group, kind: 'creature', h, mats, creature: c,
    /** How far the body reaches in front of its feet when facing the camera (a giant's head and claws). */
    front: Math.max(box.max.z, 0.5),
    get anim() { return cur; },
    play(name, { dur = 0 } = {}) {
      const n = name === 'dead' ? 'dead' : (name === 'talk' ? 'talk' : (name === 'hit' ? 'talk' : 'attack'));
      c.setAnim('idle'); c.setAnim(n); cur = n; oneT = dur || 0.6;
      c.setRate(n === 'attack' && dur > 0 ? Math.max(0.4, Math.min(2.5, 0.7 / dur)) : 1);
    },
    loop(name, rate = 1) {
      const n = name === 'ready' ? 'idle' : (CREATURE_LOOPS.has(name) ? name : (name === 'dead' ? 'dead' : 'idle'));
      if (cur !== n) { c.setAnim(n); cur = n; }
      c.setRate(rate);
    },
    update(dt) { c.update(dt); if (oneT > 0) oneT -= dt; aura?.update(dt); },
    dispose() { for (const m of mats) m.dispose(); aura?.dispose(); c.dispose(); },
  };
}
/**
 * THE UNDERMAW'S HAND (owner brief: "a giant root hand out of the water"): a forearm of twisted root rising out of the
 * lake, a palm, four fingers and a thumb of three knuckles each, rootlets hanging, and pale-blue knots at the fingertips
 * (its weak points glow when it is down to be hit). Made of a few cylinders and spheres with its own little rig: it
 * sways at rest, curls its fingers when it talks, and slams forward (the whole arm pitches down toward the street).
 */
function buildRootHand() {
  const bark = new THREE.MeshToonMaterial({ color: '#4a3a2e' }), dark = new THREE.MeshToonMaterial({ color: '#2e241c' }), tip = new THREE.MeshToonMaterial({ color: '#9ad8ff', emissive: '#5ab8ff', emissiveIntensity: 0.6 });
  const mats = [bark, dark, tip];
  const root = new THREE.Group(), arm = new THREE.Group(); root.add(arm);
  const seg = (parent, r0, r1, len, m = bark) => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 7), m); c.position.y = len / 2; c.castShadow = true; g.add(c); parent.add(g); return { g, len }; };
  const fore = seg(arm, 0.75, 0.55, 5.2); fore.g.position.y = -1.6;
  for (let i = 0; i < 9; i++) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.15, 6, 4), dark); const a = i * 1.7; k.position.set(Math.cos(a) * 0.6, 0.4 + i * 0.55, Math.sin(a) * 0.6); fore.g.add(k); }
  const palm = new THREE.Group(); palm.position.y = fore.len; fore.g.add(palm);
  const pm = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), bark); pm.scale.set(1.15, 0.9, 0.5); pm.position.y = 0.6; pm.castShadow = true; palm.add(pm);
  const fingers = [];
  for (let f = 0; f < 5; f++) {
    const thumb = f === 4, base = new THREE.Group();
    base.position.set(thumb ? -1.05 : -0.75 + f * 0.5, thumb ? 0.4 : 1.35, 0.05); base.rotation.z = thumb ? 0.9 : (f - 1.5) * -0.12; palm.add(base);
    let parent = base; const knuckles = [];
    for (let k = 0; k < 3; k++) { const L = (thumb ? 0.55 : 0.75) * (1 - k * 0.15); const s = seg(parent, 0.22 - k * 0.04, 0.18 - k * 0.04, L); s.g.position.y = k ? parent.userData.len : 0; s.g.userData.len = L; knuckles.push(s.g); parent = s.g; }
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), tip); t.position.y = parent.userData.len; parent.add(t);
    fingers.push(knuckles);
  }
  for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 1 + Math.random(), 4), dark); r.position.set((Math.random() - 0.5) * 1.6, 0.2, (Math.random() - 0.5) * 0.4); r.rotation.z = (Math.random() - 0.5) * 0.5; palm.add(r); }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  let cur = 'idle', t = 0, slam = 0, slamDur = 0.8;
  return {
    obj: root, kind: 'creature', h: box.max.y, mats, front: Math.max(box.max.z, 1.5),
    get anim() { return cur; },
    play(name, { dur = 0 } = {}) { cur = name === 'dead' ? 'dead' : name === 'talk' || name === 'hit' ? 'talk' : 'attack'; if (cur === 'attack') { slam = 0.0001; slamDur = dur || 0.8; } },
    loop(name) { if (cur !== 'attack' || slam <= 0) cur = name === 'dead' ? 'dead' : 'idle'; },
    update(dt) {
      t += dt;
      let pitch = Math.sin(t * 0.7) * 0.06, curl = 0.25 + Math.sin(t * 1.1) * 0.08;
      if (slam > 0) { slam += dt; const k = Math.min(1, slam / slamDur), u = k < 0.45 ? -0.3 * (k / 0.45) : k < 0.6 ? -0.3 + 1.3 * ((k - 0.45) / 0.15) : 1 - (k - 0.6) / 0.4; pitch = u; curl = k < 0.5 ? 0.1 : 0.7; if (k >= 1) slam = 0; }
      if (cur === 'talk') curl = 0.3 + Math.abs(Math.sin(t * 5)) * 0.5;
      if (cur === 'dead') { pitch = Math.min(1.3, (arm.rotation.x || 0) + dt * 0.8); curl = 0.9; }
      arm.rotation.x = pitch; arm.rotation.z = Math.sin(t * 0.5) * 0.05;
      fingers.forEach((kn, f) => kn.forEach((g, k) => { g.rotation.x = curl * (k ? 0.9 : 0.5) + Math.sin(t * 1.3 + f) * 0.04; }));
    },
    dispose() { for (const m of mats) m.dispose(); root.traverse(o => o.geometry?.dispose()); },
  };
}
/**
 * THE UNDERMAW (brief: "ring of roots + eye + heart stages"): a ring of huge roots arching up out of the pit behind the
 * street, an eye in the middle of the ring, a heart under it. Its parts come down to be hit in turn (sim `part`: root →
 * eye → heart, one per phase): a root slams onto the street (the nearest root lashes forward), the eye drops low and
 * stares, the heart swells and beats bright. The part being hit is lit (actors.js tint) and its own glow brightens.
 */
function buildUndermaw() {
  const flesh = new THREE.MeshToonMaterial({ color: '#4a2a2e' }), dark = new THREE.MeshToonMaterial({ color: '#2a161a' }), tooth = new THREE.MeshToonMaterial({ color: '#e8dcc0' });
  const eyeW = new THREE.MeshToonMaterial({ color: '#f0e0c0', emissive: '#ff6a5a', emissiveIntensity: 0.25 }), pupil = new THREE.MeshBasicMaterial({ color: '#1a0406' });
  const heartM = new THREE.MeshToonMaterial({ color: '#c8303a', emissive: '#ff3a4a', emissiveIntensity: 0.5 });
  const mats = [flesh, dark, tooth, eyeW, pupil, heartM];
  const root = new THREE.Group(), roots = [];
  const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 16, r, 7, false);
  for (let i = 0; i < 9; i++) {
    const a = -1.25 + i * (2.5 / 8), x = Math.sin(a) * 6.5, z = -Math.cos(a) * 2.2, h = 6 + (i % 3) * 1.4;
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    const m = new THREE.Mesh(tube([[0, -1, 0], [0.4 * Math.sign(-x || 1), h * 0.45, 0.6], [-0.2 * Math.sign(x || 1), h * 0.85, 1.6], [-0.9 * Math.sign(x || 1), h, 2.6]], 0.55 - (i % 2) * 0.12), i % 2 ? dark : flesh);
    m.castShadow = true; g.add(m);
    for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 5), tooth); t.position.set(0, h * (0.3 + k * 0.17), 0.55); t.rotation.x = Math.PI / 2; g.add(t); }
    roots.push({ g, base: x, i });
  }
  const eye = new THREE.Group(); eye.position.set(0, 5.2, 0.2); root.add(eye);
  const eb = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14), eyeW); eye.add(eb);
  const pu = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), pupil); pu.scale.set(0.45, 1, 0.4); pu.position.z = 1.3; eye.add(pu);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(1.62, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), flesh); eye.add(lid);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), heartM); heart.position.set(0, 1.6, 0.4); heart.scale.set(1, 1.2, 0.9); root.add(heart);
  for (let k = 0; k < 6; k++) { const v = new THREE.Mesh(tube([[0, 0, 0], [Math.cos(k) * 1.6, 0.8, Math.sin(k)], [Math.cos(k) * 3, -0.6, Math.sin(k) * 1.5]], 0.14), dark); v.position.copy(heart.position); root.add(v); }
  root.updateMatrixWorld(true);
  let cur = 'idle', t = 0, strike = 0, part = null;
  return {
    obj: root, kind: 'creature', h: 9, mats, front: 3.5,
    get anim() { return cur; },
    /** The part the sim has down (root | eye | heart): it drives which piece comes forward. */
    setPart(p) { part = p; },
    play(name, { dur = 0 } = {}) { cur = name === 'dead' ? 'dead' : name === 'talk' || name === 'hit' ? 'talk' : 'attack'; if (cur === 'attack') strike = 0.0001; },
    loop(name) { if (cur !== 'attack' || strike <= 0) cur = name === 'dead' ? 'dead' : 'idle'; },
    update(dt) {
      t += dt;
      if (strike > 0) { strike += dt; if (strike > 0.9) strike = 0; }
      const lash = strike > 0 ? Math.sin(Math.min(1, strike / 0.9) * Math.PI) : 0;
      for (const r of roots) {
        const near = Math.abs(r.base) < 2.5;
        r.g.rotation.x = Math.sin(t * 0.8 + r.i) * 0.06 + (near ? lash * 0.9 : lash * 0.15) + (part === 'root' && near ? 0.75 : 0);
        r.g.rotation.z = Math.sin(t * 0.6 + r.i * 1.3) * 0.05;
      }
      const look = cur === 'talk' || part === 'eye';
      eye.position.y += ((part === 'eye' ? 2.4 : 5.2) - eye.position.y) * Math.min(1, dt * 4);
      eye.position.z += ((part === 'eye' ? 2.2 : 0.2) - eye.position.z) * Math.min(1, dt * 4);
      lid.rotation.x = look ? -0.9 : -0.35 + Math.max(0, Math.sin(t * 0.4)) ** 20 * 1.2;
      pu.position.x = Math.sin(t * 0.7) * 0.35; eyeW.emissiveIntensity = part === 'eye' ? 0.8 : 0.25;
      const beat = Math.pow(Math.max(0, Math.sin(t * (part === 'heart' ? 5 : 2.6))), 8);
      const hs = (part === 'heart' ? 1.45 : 1) * (1 + beat * 0.12);
      heart.scale.set(hs, hs * 1.2, hs * 0.9); heart.position.z += ((part === 'heart' ? 2.4 : 0.4) - heart.position.z) * Math.min(1, dt * 3);
      heartM.emissiveIntensity = (part === 'heart' ? 1.1 : 0.45) + beat * 0.6;
      if (cur === 'dead') { root.position.y = Math.max(-9, root.position.y - dt * 1.5); }
    },
    dispose() { for (const m of mats) m.dispose(); root.traverse(o => o.geometry?.dispose()); },
  };
}
function flameAura(group, box, color) {
  const m = new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 });
  const n = 24, list = [], H = box.max.y - box.min.y, Wd = Math.max(box.max.x - box.min.x, 0.5);
  for (let i = 0; i < n; i++) { const sp = new THREE.Sprite(m); sp.userData = { x: (Math.random() - 0.5) * Wd * 0.7, z: (Math.random() - 0.5) * Wd * 0.4, y0: box.min.y + Math.random() * H * 0.6, p: Math.random() }; group.add(sp); list.push(sp); }
  let t = 0;
  return {
    update(dt) { t += dt; for (const sp of list) { const u = sp.userData, k = (t * 0.6 + u.p) % 1; sp.position.set(u.x * (1 - k * 0.5), u.y0 + k * H * 0.7, u.z); sp.scale.setScalar(H * 0.42 * (1 - k) + 0.05); } },
    dispose() { m.dispose(); },
  };
}

/** A capsule in the actor's colour, shown until the first real body is ready (never an empty spot). */
function standIn(color, h) {
  const g = new THREE.Group();
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color).multiplyScalar(0.7) });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, h - 0.9, 4, 10), m); body.position.y = h / 2 - 0.1; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), m); head.position.y = h - 0.3; g.add(head);
  return { obj: g, kind: 'stand', h, mats: [m], play() {}, loop() {}, update() {}, dispose() { m.dispose(); body.geometry.dispose(); head.geometry.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ giants and hints
/**
 * A giant that lives behind the street's back edge (Ossmara, the Undermaw, the Undermaw's Hand — sim: def.backEdge).
 * It faces the street, most of it behind the back edge; while hidden it rears there (the sim says it can't be hit).
 * When a part comes down (`expose`: e.part, not hidden, e.x/e.z where the strike landed) the body lunges forward and
 * leans down so its front reaches that spot, glows (tint) and a gold ring marks the spot.
 */
function placeGiant(a, e, dt) {
  a.body?.setPart?.(e.hidden ? null : e.part);
  const front = (a.body?.front || 1.5) * (a.scale || 1), down = e.part && !e.hidden && e.state !== 'dead';
  // hidden: its head just behind the back edge (head at homeZ + 1.4 ≈ 1 m behind the curb); down: its head on the spot
  const want = down ? e.z - front * 0.92 : (e.homeZ ?? Math.min(e.z, -3.4)) + 1.4 - front;
  a.bz = a.bz == null ? want : a.bz + (want - a.bz) * Math.min(1, dt * (down ? 9 : 3));
  a.group.position.z = a.bz;
  a.giantLean = (a.giantLean || 0) + ((down ? 0.32 : 0) - (a.giantLean || 0)) * Math.min(1, dt * 8);
  if (a.hitRing) {
    a.hitRing.visible = down;
    if (down) { const k = 1 + 0.12 * Math.sin(performance.now() / 120); a.hitRing.position.set(e.x, 0.05, e.z); a.hitRing.scale.set(1.6 * k, 1, 1.2 * k); }
  }
}
/**
 * The renderer hints SIM puts on enemies (enemies.json `render`): ghost (see-through), glass (green-glass sheen), veins
 * (a faint root-green glow), pale (bleached), wet (dark and glossy), tint (a colour cast). Colour and number changes on
 * the body's own material clones only — no shader is rebuilt (rule 29: alphaHash is already on).
 */
function applyHints(body, r) {
  const tint = r.tint ? new THREE.Color(r.tint) : null, glass = r.glass ? new THREE.Color(r.glass) : null;
  for (const m of body.mats) {
    if (m.side === THREE.BackSide) continue;
    if (r.pale) m.color.lerp(new THREE.Color('#dcdcd2'), 0.42);
    if (r.wet) { m.color.multiplyScalar(0.78); if (m.roughness != null) m.roughness = Math.min(m.roughness, 0.38); }
    const flame = r.big === 'flame_ghost';
    if (tint) { m.color.lerp(tint, r.ghost || flame ? 0.6 : 0.3); if (m.emissive) { m.emissive.copy(tint); m.emissiveIntensity = flame ? 0.65 : r.ghost ? 0.45 : 0.18; } }
    if (r.veins && m.emissive && !tint) { m.emissive.set(r.veins); m.emissiveIntensity = 0.22; }
    if (glass && m.emissive) { m.color.lerp(glass, 0.25); m.emissive.copy(glass); m.emissiveIntensity = 0.3; }
    if (m.emissive) { m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = m.emissiveIntensity; }
    m.userData.baseColor = m.color.clone();
  }
  body.alpha = r.ghost ? 0.6 : r.big === 'flame_ghost' ? 0.82 : r.glass ? 0.88 : 1;
}

// ------------------------------------------------------------------------------------------------ the cast
/**
 * createActors({ scene, data, quality, models }) → { sync(G, alpha, dt), handle(events, G), get(id), clear(), preload(ch, heroes), setVisible(on), setModels(m) }
 * models: 'legacy' (the Chibi 2.6 and creature bodies below) or 'hd' (high-detail models, js/render/hd.js: fal enemies and
 * Tabard heroes; whatever has no high-detail model keeps its old body). setModels switches live: every actor rebuilds.
 */
export function createActors({ scene, data, quality = 'high', models = 'legacy' }) {
  const low = quality === 'low';
  const root = new THREE.Group(); root.name = 'actors'; scene.add(root);
  const actors = new Map();           // entity id → actor
  const pool = new Map();             // body key → [bodies] (foes that left, ready for the next of their kind)
  const atlas = glyphAtlas();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, color: 0xffffff });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2);
  const reviveGeo = new THREE.RingGeometry(0.62, 0.8, 48).rotateX(-Math.PI / 2);
  const clockGeo = new THREE.RingGeometry(0.86, 0.94, 48).rotateX(-Math.PI / 2);
  // ring UVs are planar, so the angle mask works; one material per hero (its own fill level)

  const lookKey = o => JSON.stringify(o);
  // ---- high-detail models (hd.js, loaded only when chosen): the spec wins when there is one, else the old body below
  let hd = null, hdLoad = null;
  function loadHd() {
    if (!hdLoad) hdLoad = import('./hd.js').then(async m => { const kit = await m.loadHdKit(); hd = kit ? { kit, build: m.buildHd } : null; if (hd) refresh(); })
      .catch(err => { console.warn('[wyrmroad] high-detail models are not available', err?.message); hd = null; });
    return hdLoad;
  }
  if (models === 'hd') loadHd();
  /** The ink outline of a high-detail body (the same program as the old bodies'). */
  function hull(mesh) {
    if (low) return null;
    const base = outlineBase(true), om = base.clone(); om.onBeforeCompile = base.onBeforeCompile; om.customProgramCacheKey = base.customProgramCacheKey;
    const h = new THREE.SkinnedMesh(mesh.geometry, om); h.castShadow = false; h.frustumCulled = false; h.userData.outline = true;
    h.bind(mesh.skeleton, mesh.bindMatrix); mesh.parent.add(h);
    return om;
  }
  function bodyKeyFor(e) {
    const old = legacyKeyFor(e);
    if (models !== 'hd' || !hd) return old;
    const spec = hd.kit.specFor(data, e, e.side === 'hero' ? heroLook(e) : null);
    if (!spec) return old;
    return {
      key: spec.key, height: old?.height, hd: true,
      make: async () => {
        try { return await hd.build(spec, { hull }); }
        catch (err) { console.warn('[wyrmroad] high-detail model failed, drawing the old one:', spec.body, err?.message); return old ? old.make() : standIn('#6a7050', 1.7); }
      },
    };
  }
  function legacyKeyFor(e) {
    if (e.side === 'hero') {
      const look = heroLook(e);
      return { key: 'h' + lookKey(look), make: () => buildChibi(look, { low, outline: !low }) };
    }
    // a story-stage person with a look of their own (story.json speakers: Brother Aldric, Tamsin…)
    if (e.lookDirect) return { key: 'n' + lookKey(e.lookDirect), make: () => buildChibi(e.lookDirect, { low, outline: !low }) };
    const def = data.enemies.foes[e.kind] || data.enemies.bosses[e.kind];
    if (!def) return null;
    if (def.render?.big === 'maw_hand') return { key: 'roothand', make: async () => buildRootHand(), height: def.height };
    if (def.render?.big === 'undermaw') return { key: 'undermaw', make: async () => buildUndermaw(), height: def.height };
    if (def.body === 'creature') return { key: 'c' + lookKey(def.look) + (def.render?.big || ''), make: () => buildCreature(def.look, { low, outline: !low, render: def.render }), height: def.height };
    return { key: 'f' + lookKey(def.look), make: () => buildChibi(def.look, { low, outline: !low }), height: def.height };
  }
  function heroLook(e) {
    const look = dressedLook(data.classes, data.items, { cls: e.cls, look: e.look || {}, gear: e.gear || {} });
    if (e.pickup) {
      const P = data.chapters.pickups[e.pickup.id];
      if (P) {
        if (/targe|shield|scutcheon/.test(P.held)) look.offhand = { id: P.held, color: P.color };
        else { look.held = { id: P.held, color: P.color }; if (!/morningstar|scepter|club/.test(P.held)) look.offhand = { id: 'none' }; }
      }
    }
    return look;
  }
  function getBody(spec) {
    const list = pool.get(spec.key);
    if (list && list.length) return Promise.resolve(list.pop());
    return spec.make();
  }
  function release(spec, body) {
    if (!spec || body.kind === 'stand') { body.dispose(); return; }
    body.obj.removeFromParent();
    const list = pool.get(spec.key) || []; pool.set(spec.key, list);
    if (list.length < 6) list.push(body); else body.dispose();
  }

  function makeActor(e, G) {
    const hero = e.side === 'hero';
    const def = hero || e.lookDirect ? null : (data.enemies.foes[e.kind] || data.enemies.bosses[e.kind]);
    const height = hero ? HERO_HEIGHT : (e.height || def?.height || 1.7);
    const color = hero ? HERO_COLORS[(G.heroes.indexOf(e)) % 4] : (e.side === 'ally' ? '#c8a060' : '#6a7050');
    const group = new THREE.Group(); group.name = 'actor:' + e.id; root.add(group);
    const yawG = new THREE.Group(); group.add(yawG);            // facing
    const pivot = new THREE.Group(); yawG.add(pivot);          // tumbles and spins (rotates about mid-height)
    const holder = new THREE.Group(); pivot.add(holder);
    pivot.position.y = height * 0.5; holder.position.y = -height * 0.5;
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.025; blob.renderOrder = 1; group.add(blob);
    let ring = null, revive = null, clock = null;
    if (hero || e.side === 'ally') {
      ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); ring.position.y = 0.03; ring.renderOrder = 2; group.add(ring);
    }
    if (hero) {
      const mk = (geo, c) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, alphaMap: angleMaskTex(), alphaTest: 0.999, side: THREE.DoubleSide, depthWrite: false })); m.position.y = 0.04; m.visible = false; m.renderOrder = 3; group.add(m); return m; };
      revive = mk(reviveGeo, '#7cf0a0'); clock = mk(clockGeo, '#ff7a5a');
      const back = new THREE.Mesh(reviveGeo, new THREE.MeshBasicMaterial({ color: 0x10241a, transparent: true, opacity: 0.55, depthWrite: false })); back.position.y = 0.035; back.visible = false; group.add(back); revive.userData.back = back;
    }
    // the "!" over a foe winding up
    const tellMat = new THREE.SpriteMaterial({ map: atlas.tex.clone(), color: THREAT, depthTest: false, transparent: true });
    { const r = atlas.rects['!'], t = tellMat.map; t.needsUpdate = true; t.repeat.set(r.w / atlas.W, r.h / atlas.H); t.offset.set(r.x / atlas.W, 1 - (r.y + r.h) / atlas.H); }
    const tell = new THREE.Sprite(tellMat); tell.visible = false; tell.renderOrder = 20; tell.scale.set(0.42, 0.63, 1); group.add(tell);

    // a giant at the street's back edge (enemies.json backEdge): a gold ring marks where its part has come down to be hit
    let hitRing = null;
    if (def?.backEdge) { hitRing = new THREE.Mesh(reviveGeo, new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, depthWrite: false })); hitRing.visible = false; hitRing.renderOrder = 3; root.add(hitRing); }
    const a = {
      id: e.id, hero, side: e.side, kind: e.kind, def, height, group, yawG, pivot, holder, blob, ring, revive, clock, tell, color, hitRing, back: !!def?.backEdge, bz: null,
      body: null, spec: null, wantKey: '',
      yaw: (e.dir || 1) > 0 ? Math.PI / 2 : -Math.PI / 2, shotT: 0, shotAnim: null, prevState: e.state, stateT: 0,
      flash: 0, flashColor: new THREE.Color(1, 1, 1), windT: 0, windDur: 0, fade: 1, spin: 0, lean: 0, scale: 1, lastTint: '',
    };
    a.e = e;
    setBody(a, standIn(color, height), null);
    requestBody(a, e);
    actors.set(e.id, a);
    return a;
  }

  function setBody(a, body, spec) {
    if (a.body) { a.holder.remove(a.body.obj); release(a.spec, a.body); }
    a.body = body; a.spec = spec; a.holder.add(body.obj);
    a.scale = a.height / body.h; body.obj.scale.setScalar(a.scale);
    if (body.kind === 'creature') body.obj.position.y = 0;   // creature feet are at y=0
    if (a.def?.render && !body.hinted) { applyHints(body, a.def.render); body.hinted = true; }
    a.lastTint = '';
    // keep the clip the old body was playing
    if (a.shotAnim && a.shotT > 0) body.play(a.shotAnim, { dur: a.shotT });
    else body.loop(a.loopName || 'idle');
  }
  function requestBody(a, e) {
    const spec = bodyKeyFor(e);
    if (!spec || spec.key === a.wantKey) return;
    a.wantKey = spec.key;
    const p = getBody(spec);
    p.then(body => {
      if (!actors.has(a.id) || a.wantKey !== spec.key) { release(spec, body); return; }
      setBody(a, body, spec);
    }).catch(err => console.error('wyrmroad: body build failed', e.kind, err));
  }

  /** Ask every actor for its body again (the model choice changed, or the high-detail models finished loading). */
  function refresh() { for (const a of actors.values()) if (a.e) requestBody(a, a.e); }

  function removeActor(a) {
    actors.delete(a.id);
    if (a.body) { a.holder.remove(a.body.obj); release(a.spec, a.body); a.body = null; }
    a.group.removeFromParent();
    a.tell.material.map.dispose(); a.tell.material.dispose();
    if (a.hitRing) { root.remove(a.hitRing); a.hitRing.material.dispose(); }
    for (const m of [a.ring, a.revive, a.clock, a.revive?.userData.back]) if (m) m.material.dispose();
  }

  // ---------------------------------------------------------------------------------------------- per-frame
  const tmpC = new THREE.Color();
  let frameNo = 0, crowd = false;   // the view never writes to G
  function loopFor(a, e, G, speed) {
    switch (e.state) {
      case 'dash': return ['run', 1.5];
      case 'block': return [e.cls === 'warden' || a.def?.shield ? 'block' : 'guard', 1];
      case 'grab': return ['ready', 1];
      case 'enter': return ['walk', Math.max(0.7, Math.min(1.8, speed / 2.2))];
      case 'held': return ['hit', 0.6];
      case 'rise': return [a.body?.kind === 'creature' ? 'idle' : 'jump', 0.5];
      case 'calm': return ['idle', 0.6];
      default: break;
    }
    const an = e.anim || 'idle';
    if (an === 'walk' || speed > 0.6) return speed > 5.5 ? ['run', Math.max(0.8, Math.min(1.6, speed / 6))] : ['walk', Math.max(0.6, Math.min(2, speed / (a.height * 1.25)))];
    if (an === 'run') return ['run', 1];
    if (an === 'jump' || e.y > 0.05) return [a.body?.kind === 'creature' ? 'idle' : 'jump', 1];
    if (G.cinematic) return [e.loop || 'idle', 1];           // a story stage: standing at ease, or a held pose it asked for
    return [G.phase === 'fight' || !a.hero ? 'ready' : 'idle', 1];
  }

  function syncOne(a, e, G, alpha, dt) {
    const x = e.px != null ? e.px + (e.x - e.px) * alpha : e.x;
    const y = e.py != null ? e.py + (e.y - e.py) * alpha : e.y;
    const z = e.pz != null ? e.pz + (e.z - e.pz) * alpha : e.z;
    const speed = a.lastX != null && dt > 0 ? Math.hypot(x - a.lastX, (z - a.lastZ)) / dt : 0;
    a.speed = a.speed == null ? speed : a.speed + (speed - a.speed) * Math.min(1, dt * 10);
    a.lastX = x; a.lastZ = z;
    a.group.position.set(x, y, z);
    a.drawn = a.group.position;
    if (a.back) placeGiant(a, e, dt);
    // climbing out of the ground / fading in (state 'rise', for def.rise seconds)
    a.riseK = e.state === 'rise' ? Math.min(1, a.stateT / Math.max(0.2, a.def?.rise || 1)) : 1;
    if (e.state === 'rise' && (a.def?.riseHow || 'ground') === 'ground') a.group.position.y = y - a.height * 0.95 * (1 - a.riseK) ** 1.5;

    // rebuild when the look changes (gear, look, a ground weapon picked up or broken)
    a.e = e;
    if (a.hero) requestBody(a, e);

    // facing: heroes partly toward the camera; foes a little; creatures side-on
    const turn = a.back ? Math.PI / 2 : e.turn ?? (a.hero ? TURN : (a.body?.kind === 'creature' ? 0.12 : 0.28));   // giants face the street; a story stage sets its own
    const want = (e.dir || 1) > 0 ? Math.PI / 2 - turn : -Math.PI / 2 + turn;
    let d = want - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    a.yaw += d * Math.min(1, dt * 18);
    a.yawG.rotation.y = a.yaw;

    // state changes
    const st = e.state;
    if (st !== a.prevState) { onState(a, e, a.prevState, st); a.prevState = st; a.stateT = 0; }
    a.stateT += dt;

    const body = a.body;
    if (a.shotT > 0) a.shotT -= dt;
    const lying = st === 'down' || st === 'out' || st === 'dead' || st === 'air' || st === 'thrown';
    if (lying) {
      a.shotT = 0;
      if (body && body.anim !== 'dead') body.play('dead', { dur: st === 'air' || st === 'thrown' ? 0.45 : 0.6, fade: 0.06 });
    } else if (st === 'hurt' || st === 'held') {
      a.shotT = 0;
      if (body && (body.anim !== 'hit' || a.hitAgain)) body.play('hit', { dur: 0.45, fade: 0.05 });
    } else if (a.shotT <= 0) {
      const [n, rate] = loopFor(a, e, G, a.speed);
      a.loopName = n;
      if (body) body.loop(n, rate, a.getupFade || 0.15);
      a.getupFade = 0;
    }
    a.hitAgain = false;

    // tumbles: thrown spins, held dangles, frozen stops
    let spin = 0, lean = 0;
    if (st === 'thrown') { a.spin += dt * 14; spin = a.spin; }
    else { a.spin = 0; }
    if (st === 'held') lean = -0.35;
    if (st === 'hurt') lean = Math.max(0, 0.25 - a.stateT) * -1.2;
    a.lean += (lean - a.lean) * Math.min(1, dt * 14);
    a.pivot.rotation.x = spin + (a.giantLean || 0);
    a.pivot.rotation.z = 0;
    a.holder.rotation.x = a.lean;
    // crowd throttle: with many Chibis on screen, foes that are only idling or walking animate on alternate frames
    // (twice the step) — heroes, and anyone striking, hurt or falling, every frame
    a.animAcc = (a.animAcc || 0) + (e.freezeT > 0 ? 0 : dt);
    const busy = a.hero || a.shotT > 0 || lying || st === 'hurt' || st === 'held' || a.flash > 0;
    if (body && (busy || !crowd || ((a.id + frameNo) & 1) === 0)) { body.update(a.animAcc); a.animAcc = 0; }

    // blob shadow shrinks with height; hero ring
    const hs = Math.max(0.35, 1 - y * 0.35), bw = (a.body?.kind === 'creature' ? 1.1 : 0.8) * Math.max(0.8, a.height / 1.7);
    a.blob.position.y = 0.025 - y; a.blob.scale.set(bw * hs, 1, bw * 0.6 * hs);
    if (a.ring) { a.ring.position.y = 0.03 - y; a.ring.visible = st !== 'gone' && st !== 'dead' && !G.cinematic; }

    // revive ring + down clock for a hero who is out
    if (a.revive) {
      const out = st === 'out';
      a.revive.visible = a.clock.visible = a.revive.userData.back.visible = out;
      if (out) {
        const k = Math.min(1, (e.reviveT || 0) / (G.T.reviveTime || 2));
        a.revive.material.alphaTest = Math.max(0.002, 1 - Math.max(0.004, k));
        const c = Math.min(1, Math.max(0, (e.downClock || 0) / (G.T.downTime || 3)));
        a.clock.material.alphaTest = Math.max(0.002, 1 - Math.max(0.004, c));
        a.revive.position.y = a.clock.position.y = 0.04 - y; a.revive.userData.back.position.y = 0.035 - y;
      }
    }

    // wind-up tell
    if (a.windT > 0) {
      a.windT -= dt;
      const k = 1 - Math.max(0, a.windT) / Math.max(0.05, a.windDur);
      a.tell.visible = true; a.tell.position.y = a.height + 0.45 + k * 0.1;
      const s = 0.36 + 0.18 * k + (a.windT < 0.08 ? 0.15 : 0); a.tell.scale.set(s * 0.67, s, 1);
      a.tell.material.opacity = 0.65 + 0.35 * k;
    } else a.tell.visible = false;

    // visibility: i-frame blink, dead fade, gone
    let vis = st !== 'gone';
    if (e.invT > 0 && st !== 'out' && st !== 'dead' && st !== 'down') vis = vis && (Math.floor(G.t * 14) % 2 === 0);
    a.group.visible = vis;
    if (st === 'dead') a.fade = Math.max(0, 1 - Math.max(0, a.stateT - 1.1) / 1.2); else a.fade = 1;
    if (st === 'rise' && a.def?.riseHow === 'fade') a.fade *= a.riseK;
    a.fade *= a.body?.alpha ?? 1;
    tint(a, e, G, dt);
  }

  function onState(a, e, from, to) {
    if (from === 'down' && to !== 'down' && to !== 'out' && to !== 'dead') { a.getupFade = 0.45; a.shotT = 0; }
    if (from === 'out' && to === 'idle') { a.getupFade = 0.45; a.shotT = 0; }
    if (to === 'dead' || to === 'out') { a.windT = 0; }
    if (to !== 'move') { a.windT = 0; }
  }

  /** Flash / tell / burn / ice / fade on this actor's own materials (uniform changes only). */
  function tint(a, e, G, dt) {
    if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 9);
    const body = a.body; if (!body) return;
    let em = null, ek = 0;
    if (a.flash > 0.01) { em = a.flashColor; ek = a.flash * 0.26; }      // a short, light flash: the body still reads under it
    else if (a.windT > 0) { const k = 1 - Math.max(0, a.windT) / Math.max(0.05, a.windDur); em = e.team === 0 ? FRIEND_TELL : THREAT; ek = 0.12 + 0.3 * k * (0.7 + 0.3 * Math.sin(G.t * 40)); }
    else if (e.burnT > 0) { em = tmpC.setRGB(1, 0.45, 0.1); ek = 0.25 + 0.25 * Math.abs(Math.sin(G.t * 23)); }
    else if (a.back && e.part && !e.hidden && e.state !== 'dead') { em = HITME; ek = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(G.t * 9)); }   // a warm pulse that keeps the body readable (the gold ring marks the spot)   // its part is down: hit it now
    else if (e.state === 'calm') { em = CALM; ek = 0.18; }
    const ice = e.freezeT > 0;
    const key = (em ? em.getHexString() + ek.toFixed(2) : '-') + (ice ? 'i' : '') + a.fade.toFixed(2);
    if (key === a.lastTint) return;
    a.lastTint = key;
    for (const m of body.mats) {
      if (m.side === THREE.BackSide) { m.opacity = a.fade; continue; }
      m.opacity = a.fade;
      if (!m.emissive) continue;
      if (!m.userData.baseColor) { m.userData.baseColor = m.color.clone(); m.userData.baseEmissive = m.userData.baseEmissive || m.emissive.clone(); m.userData.baseEI = m.userData.baseEI ?? m.emissiveIntensity; }
      if (em) { m.emissive.copy(em); m.emissiveIntensity = ek; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
      if (ice) { m.color.copy(m.userData.baseColor).lerp(ICE, 0.55); if (!em) { m.emissive.set('#1a4a8a'); m.emissiveIntensity = 0.35; } } else m.color.copy(m.userData.baseColor);
    }
  }

  // ---------------------------------------------------------------------------------------------- api
  return {
    root, actors,
    sync(G, alpha, dt) {
      frameNo++;
      let chibis = 0; for (const x of actors.values()) if (x.body?.kind === 'chibi' || x.body?.kind === 'fal' || x.body?.kind === 'tabard') chibis++;
      crowd = chibis > 8;
      const seen = new Set();
      for (const e of G.heroes) { seen.add(e.id); syncOne(actors.get(e.id) || makeActor(e, G), e, G, alpha, dt); }
      for (const e of G.foes) { seen.add(e.id); syncOne(actors.get(e.id) || makeActor(e, G), e, G, alpha, dt); }
      for (const a of [...actors.values()]) if (!seen.has(a.id)) removeActor(a);
    },
    /** One-shot clips, flashes and tells from this frame's events. */
    handle(events, G) {
      for (const ev of events) {
        if (ev.type === 'move') {
          const a = actors.get(ev.id); if (!a) continue;
          const anim = ev.anim === 'getup' ? 'ready' : ev.anim;
          if (ev.anim === 'block' || ev.anim === 'run') continue;          // held states: their loop comes from the state
          if (ev.anim === 'getup') { a.getupFade = 0.45; a.shotT = 0; continue; }   // lying → standing blend (no clip of its own)
          if (ev.anim === 'jump' && !ev.dur) { if (a.body) a.body.play('jump', { dur: 0.8 }); a.shotT = 0.8; a.shotAnim = 'jump'; a.shotKind = 'jump'; continue; }
          const dur = ev.dur || 0.5;
          a.shotT = dur; a.shotAnim = anim; a.shotKind = ev.kind;
          if (a.body) a.body.play(anim, { dur, fade: 0.06, wind: ev.wind || 0 });
          if (!a.hero && ev.wind > 0.12) { a.windT = ev.wind; a.windDur = ev.wind; }
        } else if (ev.type === 'hit' || ev.type === 'armor') {
          const a = actors.get(ev.id); if (!a) continue;
          a.flash = ev.type === 'armor' ? 0.6 : 1; a.flashColor.set(ev.type === 'armor' ? '#c0c8d0' : (a.hero ? '#ff5a4a' : '#ffffff'));
          if (ev.type === 'hit') { a.windT = 0; a.hitAgain = true; }
        } else if (ev.type === 'block' || ev.type === 'shieldblock' || ev.type === 'perfect') {
          const a = actors.get(ev.id); if (!a) continue;
          a.flash = 0.7; a.flashColor.set(ev.type === 'perfect' ? '#ffe28a' : '#9ec8ff');
        } else if (ev.type === 'heal') {
          const a = actors.get(ev.id); if (a) { a.flash = 0.6; a.flashColor.set('#7cf0a0'); }
        }
      }
    },
    get(id) { return actors.get(id) || null; },
    /** Build every body a chapter needs before its fights (so a spawn never waits on a build). */
    async preload(ch, heroes = []) {
      if (models === 'hd') await loadHd();
      const kinds = new Set();
      for (const s of ch.sections) { for (const w of s.waves) for (const f of w) kinds.add(f.split('@')[0]); if (s.boss) kinds.add(s.boss); }
      if (ch.ally) kinds.add(data.chapters.allies[ch.ally]?.foe);
      for (const b of Object.values(data.enemies.bosses)) for (const mv of b.moves || []) for (const s of mv.summon || []) if (kinds.has(Object.keys(data.enemies.bosses).find(k => data.enemies.bosses[k] === b))) kinds.add(s);
      const jobs = [];
      for (const k of kinds) {
        const def = data.enemies.foes[k] || data.enemies.bosses[k]; if (!def) continue;
        if (bodyKeyFor({ side: 'foe', kind: k })?.hd) continue;          // a high-detail model: nothing of the old body to prepare
        if (def.body !== 'creature') jobs.push(prepareChibi2(def.look, { v25: true, v26: true, anims: CHIBI_ANIMS, ...(low ? { graphics: 'low' } : {}), slice: breathe, budget: 8 }).catch(() => {}));
      }
      for (const h of heroes) if (!bodyKeyFor({ ...h, side: 'hero' })?.hd) jobs.push(prepareChibi2(heroLook(h), { v25: true, v26: true, anims: CHIBI_ANIMS, ...(low ? { graphics: 'low' } : {}), slice: breathe, budget: 8 }).catch(() => {}));
      await Promise.all(jobs);
      // one ready body per foe kind waits in the pool, so the first spawn of a kind never builds (or compiles) mid-fight
      const warm = [];
      for (const k of kinds) {
        const spec = bodyKeyFor({ side: 'foe', kind: k }); if (!spec) continue;
        if ((pool.get(spec.key) || []).length) continue;
        try { const b = await spec.make(); b.obj.position.set(0, -60, 0); root.add(b.obj); warm.push([spec, b]); } catch (err) { console.error('wyrmroad: preload failed', k, err); }
      }
      return { warm, done: () => { for (const [spec, b] of warm) { b.obj.position.set(0, 0, 0); release(spec, b); } } };
    },
    clear() { for (const a of [...actors.values()]) removeActor(a); },
    /** 'legacy' | 'hd': every actor on screen rebuilds in the chosen models (the old body stays until the new one is ready). */
    setModels(m) {
      m = m === 'hd' ? 'hd' : 'legacy';
      if (m === models) return;
      models = m;
      if (m === 'hd' && !hd) loadHd();          // the first load rebuilds everyone when it lands
      else refresh();
    },
    get models() { return models; },
    setVisible(on) { root.visible = on; },
    heroLook,
  };
}

export { buildChibi, buildCreature };
