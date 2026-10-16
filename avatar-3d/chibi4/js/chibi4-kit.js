// Chibi 4 KIT runtime (step 9): a character assembled at runtime from separate pieces on one skeleton.
//
//   import { createChibi4Kit, preloadChibi4 } from '<...>/avatar-3d/chibi4/js/chibi4-kit.js';
//   const actor = await createChibi4Kit(avatar);        // Chibi 2's avatar JSON (or avatar.chibi4 = { body, hair, garments })
//   scene.add(actor.group); actor.setAnim('walk'); actor.update(dt);
//   await actor.dress({ torso: 'jerkin' });              // or 'hat', ['pauldrons', 'bracers'], [{ id: 'robe', color: '#7a1020' }]
//   actor.setColors({ skin: '#c08860', hair: { color: '#202020' }, garments: { robe: { color: '#203060', color2: '#d0a040' } } });
//
// How a character is put together (files from tools/blender/step9_kit.py, models/kit/<body>/):
//   * body.glb gives the skeleton (cloned per character) and the body; g_<id>.glb / h_<id>.glb give garments and
//     hair, each skinned to the same bones (joints are matched BY NAME, so a piece's own joint order does not matter).
//     Every file is downloaded and decoded once per page and shared by every character.
//   * Hiding: every vertex carries the bits of the garments that cover it (COLOR_0 R/G). For an outfit, the bits of
//     everything worn are OR'd, and a triangle with any vertex under a worn garment is left out — the body under a robe,
//     a jerkin under a robe, hair under a hat are not drawn at all, so they cannot poke through.
//   * Merging: the kept triangles of every piece are copied into ONE geometry per distance (so a character is one draw
//     call), with a per-vertex slot number (0 body, 1 hair, 2.. garments). Merged geometry is cached by the outfit's
//     pieces (not its colours), so ten villagers in the same clothes share it.
//   * Colour: one material per character over the shared atlas; its shader reads the tint mask (R = a garment's main
//     colour, G = its second, B = skin) and the slot's colours from a uniform array, so recolouring is a uniform write.
//   * Distance: LOD 0/1/2 in a THREE.LOD; at LOD 1 the animation is evaluated every 2nd frame, at LOD 2 every 3rd.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../../vendor/meshopt/meshopt_decoder.mjs';
import { outfitFor, dressOutfit, outfitKey, isLong, clipFor, tintUniform, skinRatio, KIT_BODIES, CLIP_MAP } from './chibi4-outfit.js';
// 10a: weapons, off-hands and seats (chibi4-held.js; README "Step 10 contracts")
import { createHoldRig, seatHeight as seatHeightOf } from './chibi4-held.js';
const CLIP_MAP_HAS = (name, clips) => (CLIP_MAP[name]?.[0] || name) in clips;

const KIT_BASE = new URL('../models/kit/', import.meta.url);
const MAX_SLOTS = 16;
const kits = new Map();                  // body -> Promise<kit>
const merged = new Map();                // outfit key -> { geos: [LOD0, LOD1, LOD2], refs }
let loader = null;
const net = { bytes: 0, files: 0, log: [] };    // log: { url, bytes, fetchStart, fetchEnd, parseMs } (ms since page start)

function gltfLoader() {
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  return loader;
}
async function fetchBuf(url) {
  const fetchStart = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Chibi 4 kit: ${url} is missing (${res.status}). Build it: avatar-3d/chibi4/README.md "Rebuild".`);
  const b = await res.arrayBuffer(); net.bytes += b.byteLength; net.files++;
  net.log.push({ url: String(url).replace(/^.*models\/kit\//, ''), bytes: b.byteLength, fetchStart, fetchEnd: performance.now(), parseMs: 0 });
  return b;
}
async function parse(url) {
  await MeshoptDecoder.ready;
  const buf = await fetchBuf(url);
  const t = performance.now();
  const g = await gltfLoader().parseAsync(buf, String(url).replace(/[^/]*$/, ''));
  const name = String(url).replace(/^.*models\/kit\//, '');
  const e = net.log.findLast(x => x.url === name); if (e) e.parseMs = performance.now() - t;
  return g;
}
async function texture(url, srgb) {
  const blob = new Blob([await fetchBuf(url)], { type: 'image/webp' });
  const bmp = await createImageBitmap(blob);                       // glTF UVs: the picture as stored, no flip
  const t = new THREE.Texture(bmp);
  t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/** A piece file's skinned meshes as plain arrays, LOD0 first (most vertices), joints renamed to the kit's order. */
function prepare(gltf, boneIndex) {
  const meshes = [];
  gltf.scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  meshes.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  return meshes.map(m => {
    const g = m.geometry, n = g.attributes.position.count;
    const remap = m.skeleton.bones.map(b => boneIndex.get(b.name) ?? 0);
    const read = (attr, k) => { const out = new Float32Array(n * k); for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) out[i * k + c] = attr.getComponent(i, c); return out; };
    const si = g.attributes.skinIndex, joints = new Uint16Array(n * 4);
    for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) joints[i * 4 + c] = remap[si.getComponent(i, c)];
    const col = g.attributes.color, mask = new Uint32Array(n);
    if (col) for (let i = 0; i < n; i++) mask[i] = Math.round(col.getX(i) * 255) | (Math.round(col.getY(i) * 255) << 8);
    const morph = g.morphAttributes.position?.[0];
    return {
      n, position: read(g.attributes.position, 3), normal: read(g.attributes.normal, 3), uv: read(g.attributes.uv, 2),
      joints, weights: read(g.attributes.skinWeight, 4), mask, ears: morph ? read(morph, 3) : null,
      index: g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i),
    };
  });
}

export function loadKit(body = 'male') {
  if (!KIT_BODIES.includes(body)) body = 'male';
  if (!kits.has(body)) kits.set(body, (async () => {
    const base = new URL(`${body}/`, KIT_BASE);
    const meta = await (await fetch(new URL('kit.json', base))).json();
    const [bodyGltf, animGltf, atlas, mask] = await Promise.all([parse(new URL('body.glb', base)), parse(new URL('anims.glb', base)),
      texture(new URL(meta.atlas.file, base), true), texture(new URL(meta.mask.file, base), false)]);
    let master = null;
    bodyGltf.scene.traverse(o => { if (o.isSkinnedMesh && (!master || o.geometry.attributes.position.count > master.geometry.attributes.position.count)) master = o; });
    const boneIndex = new Map(master.skeleton.bones.map((b, i) => [b.name, i]));
    const clips = {};
    for (const c of animGltf.animations) clips[c.name] = c;
    // the other ~50 clips come when the first character of this body is made (not at preload), without holding it up
    let moreP = null;
    const more = () => moreP || (moreP = parse(new URL('anims_more.glb', base)).then(g => { for (const c of g.animations) clips[c.name] = c; return true; })
      .catch(e => { console.warn('[chibi4] anims_more.glb failed', e); return false; }));
    const pieces = new Map([['body', Promise.resolve(prepare(bodyGltf, boneIndex))]]);
    const piece = id => {
      if (!pieces.has(id)) pieces.set(id, parse(new URL(id + '.glb', base)).then(g => prepare(g, boneIndex)));
      return pieces.get(id);
    };
    return { body, base, meta, bodyGltf, master, boneIndex, clips, more, atlas, mask, piece };
  })());
  return kits.get(body);
}

/** Start the downloads for an avatar's outfit without building anything (a game calls this at page start). */
export async function preloadChibi4(avatar = {}) {
  const outfit = outfitFor(avatar);
  const kit = await loadKit(outfit.body);
  await Promise.all(partsOf(outfit).map(p => kit.piece(p.file)));
  return kit;
}

function partsOf(outfit) {
  const out = [{ file: 'body', slot: 0 }];
  if (outfit.hair) out.push({ file: 'h_' + outfit.hair.id, slot: 1 });
  outfit.garments.forEach((g, k) => out.push({ file: 'g_' + g.id, slot: 2 + k, id: g.id }));
  return out;
}

function mergeOutfit(kit, outfit, lists) {
  const worn = outfit.garments.reduce((b, g) => b | (1 << (kit.meta.bits[g.id] ?? 31)), 0);
  const elf = outfit.race === 'elf';
  const geos = [];
  for (let lod = 0; lod < 3; lod++) {
    const parts = [];
    let nv = 0, ni = 0;
    for (const { prep, slot } of lists) {
      const p = prep[Math.min(lod, prep.length - 1)];
      const keepV = new Int32Array(p.n).fill(-1);
      const idx = [];
      for (let t = 0; t < p.index.length; t += 3) {
        const a = p.index[t], b = p.index[t + 1], c = p.index[t + 2];
        if ((p.mask[a] | p.mask[b] | p.mask[c]) & worn) continue;
        idx.push(a, b, c);
      }
      let k = 0;
      for (const v of idx) if (keepV[v] < 0) keepV[v] = k++;
      parts.push({ p, slot, idx, keepV, count: k, base: nv });
      nv += k; ni += idx.length;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const sk = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), sl = new Float32Array(nv);
    const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let io = 0;
    for (const { p, slot, idx, keepV, base } of parts) {
      for (let v = 0; v < p.n; v++) {
        const o = keepV[v]; if (o < 0) continue;
        const d = base + o;
        for (let c = 0; c < 3; c++) {
          pos[d * 3 + c] = p.position[v * 3 + c] + (elf && p.ears ? p.ears[v * 3 + c] : 0);
          nor[d * 3 + c] = p.normal[v * 3 + c];
        }
        uv[d * 2] = p.uv[v * 2]; uv[d * 2 + 1] = p.uv[v * 2 + 1];
        for (let c = 0; c < 4; c++) { sk[d * 4 + c] = p.joints[v * 4 + c]; sw[d * 4 + c] = p.weights[v * 4 + c]; }
        sl[d] = slot;
      }
      for (const v of idx) index[io++] = base + keepV[v];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sk, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('c4slot', new THREE.BufferAttribute(sl, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    const h = kit.meta.height || 1.8;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 0.85);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-h * 0.6, -0.1, -h * 0.6), new THREE.Vector3(h * 0.6, h * 1.15, h * 0.6));
    geos.push(g);
  }
  return geos;
}

async function acquire(kit, outfit) {
  const key = kit.body + ':' + outfitKey(outfit);
  let e = merged.get(key);
  if (!e) {
    const parts = partsOf(outfit);
    const preps = await Promise.all(parts.map(p => kit.piece(p.file)));
    e = merged.get(key);                                       // another character may have finished it meanwhile
    if (!e) { e = { geos: mergeOutfit(kit, outfit, parts.map((p, i) => ({ prep: preps[i], slot: p.slot }))), refs: 0 }; merged.set(key, e); }
  }
  e.refs++;
  return { key, geos: e.geos };
}
function release(key) {
  const e = merged.get(key); if (!e) return;
  if (--e.refs <= 0) { for (const g of e.geos) g.dispose(); merged.delete(key); }
}

// one shader for every character; only the uniforms differ
const TINT_VERT = 'attribute float c4slot;\nvarying float vC4slot;\n';
const TINT_FRAG = `uniform sampler2D c4mask; uniform vec4 c4colA[${MAX_SLOTS}]; uniform vec4 c4colB[${MAX_SLOTS}]; uniform vec3 c4skin;\nvarying float vC4slot;\n`;
function makeMaterial(kit) {
  const u = {
    c4mask: { value: kit.mask },
    c4colA: { value: Array.from({ length: MAX_SLOTS }, () => new THREE.Vector4(1, 1, 1, 0)) },
    c4colB: { value: Array.from({ length: MAX_SLOTS }, () => new THREE.Vector4(1, 1, 1, 0)) },
    c4skin: { value: new THREE.Vector3(1, 1, 1) },
  };
  const m = new THREE.MeshStandardMaterial({ map: kit.atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = TINT_VERT + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvC4slot = c4slot;');
    sh.fragmentShader = TINT_FRAG + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
	{ vec3 tm = texture2D( c4mask, vMapUv ).rgb; int s = int( vC4slot + 0.5 );
	  vec4 A = c4colA[ s ]; vec4 B = c4colB[ s ];
	  float L = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
	  vec3 base = diffuseColor.rgb;
	  diffuseColor.rgb = mix( diffuseColor.rgb, A.rgb * L, clamp( tm.r * A.a, 0.0, 1.0 ) );
	  diffuseColor.rgb = mix( diffuseColor.rgb, B.rgb * L, clamp( tm.g * B.a, 0.0, 1.0 ) );
	  diffuseColor.rgb *= mix( vec3( 1.0 ), c4skin, tm.b ); }`);
  };
  m.customProgramCacheKey = () => 'chibi4-kit-tint';
  m.userData.c4 = u;
  return m;
}

function applyColors(kit, outfit, u) {
  const M = kit.meta;
  for (const v of u.c4colA.value) v.set(1, 1, 1, 0);
  for (const v of u.c4colB.value) v.set(1, 1, 1, 0);
  const hairCol = outfit.hair?.color;
  if (hairCol) u.c4colA.value[0].fromArray(tintUniform(hairCol, M.browLum, 0.85));            // brows follow the hair
  if (outfit.hair && hairCol) u.c4colA.value[1].fromArray(tintUniform(hairCol, M.hairs[outfit.hair.id]?.lum, 1));
  outfit.garments.forEach((g, k) => {
    const gm = M.garments[g.id]; if (!gm || 2 + k >= MAX_SLOTS) return;
    const a = g.color || (gm.tintAlways ? gm.refA : null);
    if (a) u.c4colA.value[2 + k].fromArray(tintUniform(a, gm.lumA, 1));
    if (g.color2 && gm.refB) u.c4colB.value[2 + k].fromArray(tintUniform(g.color2, gm.lumB, 1));
  });
  u.c4skin.value.fromArray(skinRatio(outfit.skin, M.skinRef));
}

export async function createChibi4Kit(avatar = {}, opts = {}) {
  let outfit = outfitFor(avatar);
  let kit = await loadKit(outfit.body);
  kit.more();
  const group = new THREE.Group(); group.name = 'chibi4kit'; group.userData.character = avatar;
  let root, skeleton, lod, mixer, actions = {}, current = null, currentName = 'idle', currentClip = null, bones = {};
  let held = null, rate = 1, acc = 0, frame = 0, disposed = false;
  let holdRig = null, holding = null;                         // 10a: what is in the hands (chibi4-held.js), built lazily
  const material = makeMaterial(kit);
  const lodDist = opts.lodDistances || [0, 8, 18];
  const twist = { yaw: 0, side: 0, fwd: 0, on: false, q: new THREE.Quaternion(), inv: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ') };

  function buildSkeleton() {
    root = SkeletonUtils.clone(kit.bodyGltf.scene);
    let m0 = null; const old = [];
    root.traverse(o => { if (o.isSkinnedMesh) { old.push(o); if (!m0 || o.geometry.attributes.position.count > m0.geometry.attributes.position.count) m0 = o; } });
    skeleton = m0.skeleton;
    lod = new THREE.LOD(); lod.position.copy(m0.position); lod.quaternion.copy(m0.quaternion); lod.scale.copy(m0.scale);
    m0.parent.add(lod);
    for (const o of old) o.removeFromParent();
    lod.userData.bindMatrix = m0.bindMatrix.clone();
    root.traverse(o => { if (o.isBone) bones[o.name] = o; });
    group.add(root);
    mixer = new THREE.AnimationMixer(root);
    mixer.addEventListener('finished', e => { if (e.action === current && currentName !== 'dead' && currentName !== 'sleep') setAnim('idle', 0.2); });
  }
  buildSkeleton();

  async function build() {
    const got = await acquire(kit, outfit);
    if (disposed) { release(got.key); return; }
    const prevKey = held?.key;
    for (const l of [...lod.levels]) lod.removeLevel(l.distance);
    got.geos.forEach((g, i) => {
      const m = new THREE.SkinnedMesh(g, material);
      m.name = `chibi4kit_LOD${i}`; m.castShadow = true;
      m.bind(skeleton, lod.userData.bindMatrix);
      if (opts.lod === false && i > 0) return;
      lod.addLevel(m, lodDist[i]);
    });
    held = got;
    if (prevKey) release(prevKey);
    applyColors(kit, outfit, material.userData.c4);
    if (currentName) setAnim(currentName, 0, true);
  }

  function setAnim(name = 'idle', fade = 0.12, restart = false) {
    if (disposed) return;
    const pick = clipFor(name, kit.clips, isLong(outfit));
    if (pick.fit === 'missing') {                              // not downloaded yet: idle now, the real clip when it lands
      const want = name;
      kit.more().then(() => { if (!disposed && currentName === want && (CLIP_MAP_HAS(want, kit.clips))) setAnim(want, fade, true); });
    }
    const next = actions[pick.clip] || (kit.clips[pick.clip] && (actions[pick.clip] = mixer.clipAction(kit.clips[pick.clip])));
    if (!next) return;
    if (next === current && pick.loop) { currentName = name; return; }
    if (next === current && !restart && next.isRunning()) return;
    next.reset(); next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1);
    next.setLoop(pick.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); next.clampWhenFinished = !pick.loop;
    if (current && current !== next && fade > 0) current.crossFadeTo(next, fade, false);
    else if (current && current !== next) current.stop();
    next.play();
    current = next; currentName = name; currentClip = pick.clip;
  }

  await build();
  setAnim('idle', 0);
  const height = kit.meta.height || 1.8;
  group.userData.fxHeight = height;
  const heldOf = a => ({ held: a?.held?.id && a.held.id !== 'none' ? a.held : null, offhand: a?.offhand?.id && a.offhand.id !== 'none' ? a.offhand : null });   // 10a

  const api = {
    group,
    get model() { return 'kit:' + outfit.body; },
    get outfit() { return JSON.parse(JSON.stringify(outfit)); },
    get parts() { return { head: bones.head, handL: bones.hand_l, handR: bones.hand_r, spine: bones.spine_03, pelvis: bones.pelvis, hips: bones.pelvis, bones }; },   // 10a: hips (mounts.js)
    get skeleton() { return skeleton; },
    get lod() { return lod; },
    get anim() { return currentName; },
    get clip() { return currentClip; },
    get mixer() { return mixer; },
    setAnim, play: setAnim,
    update(dt) {
      if (disposed) return;
      acc += Math.min(0.1, Math.max(0, dt));
      const level = opts.throttle === false ? 0 : lod.getCurrentLevel();
      if (++frame % (level === 0 ? 1 : level === 1 ? 2 : 3) !== 0) return;
      const chest = bones.spine_03;
      if (twist.on) chest.quaternion.multiply(twist.inv);
      const step = acc * rate;
      mixer.update(step); acc = 0;
      twist.on = !!(chest && (twist.yaw || twist.side || twist.fwd));
      if (twist.on) { twist.q.setFromEuler(twist.e.set(twist.fwd, twist.yaw, twist.side)); twist.inv.copy(twist.q).invert(); chest.quaternion.multiply(twist.q); }
      if (holdRig) holdRig.update(currentName, current, Math.max(step, 1 / 120));   // 10a: the hold pose sits on top of the clip
    },
    setRate(k = 1) { rate = Math.max(0.15, Math.min(3.5, Number(k) || 1)); },
    get rate() { return rate; },
    setTwist(yaw = 0, side = 0, fwd = 0) { twist.yaw = +yaw || 0; twist.side = +side || 0; twist.fwd = +fwd || 0; },
    hit() { setAnim('hit', 0.08, true); }, hold() {}, setHandsFree() {},
    /** Put anything in a hand: attach(mesh, 'handR'). For catalog items use equip(). */
    attach(obj, socket = 'handR') { const b = api.parts[socket] || bones[socket]; if (b) b.add(obj); return !!b; },
    // 10a: equip({ held: { id, color, color2 }, offhand: { … } }) — any held / off-hand row of the gear catalog
    async equip(want = {}) {
      holding = { held: want.held || null, offhand: want.offhand || null };
      if (!holdRig) holdRig = createHoldRig(api, kit);
      return holdRig.equip(holding);
    },
    get holdRig() { return holdRig; },
    // 10a: the pelvis height in a seated clip, for avatar-3d/js/mounts.js seatRider (riderHipsY asks for it)
    seatHeight(clip = 'ride') { return seatHeightOf(kit, clip); },
    async dress(change) { outfit = dressOutfit(outfit, change); await build(); return true; },
    async setAvatar(a) {
      group.userData.character = a;
      const next = outfitFor(a);
      const newBody = next.body !== outfit.body;                 // 10a
      if (newBody) {                         // a new body type is a new skeleton
        kit = await loadKit(next.body); kit.more(); outfit = next;
        group.remove(root); mixer.stopAllAction(); actions = {}; bones = {}; current = null;
        material.map = kit.atlas; material.userData.c4.c4mask.value = kit.mask;
        buildSkeleton();
      } else outfit = next;
      await build();
      setAnim(currentName || 'idle', 0, true);
      // 10a: a new skeleton loses what was hung on the old one; a changed look may change the hands
      const h = heldOf(a);
      if (holdRig && (newBody || JSON.stringify(h) !== JSON.stringify(holding))) { holdRig.dispose(); holdRig = null; }
      if (opts.held && (h.held || h.offhand)) await api.equip(h);
    },
    setColors({ skin, hair, garments } = {}) {
      if (skin) outfit.skin = skin;
      if (hair && outfit.hair) outfit.hair.color = hair.color || hair;
      if (garments) for (const g of outfit.garments) if (garments[g.id]) Object.assign(g, garments[g.id]);
      applyColors(kit, outfit, material.userData.c4);
    },
    stats() {
      const tri = g => g.index.count / 3;
      const geos = held?.geos || [];
      return { meshes: 1, drawCalls: 1, bones: skeleton.bones.length, triangles: geos[0] ? tri(geos[0]) : 0,
        vertices: geos[0]?.attributes.position.count || 0, lodTriangles: geos.map(tri), pieces: partsOf(outfit).length,
        bytes: net.bytes, files: net.files, textures: 2, lodLevel: lod.getCurrentLevel() };
    },
    metrics() { return { height, totalHeight: height }; },
    dispose() {
      if (disposed) return; disposed = true;
      mixer.stopAllAction(); mixer.uncacheRoot(root); group.removeFromParent();
      if (held) release(held.key);
      holdRig?.dispose();                                        // 10a (item geometry stays cached)
      material.dispose();                                        // the atlas, mask and piece geometry stay cached
    },
  };
  // 10a (UNFINISHED, opt-in): with opts.held an avatar that names a held / off-hand item gets it in the background.
  // Off by default — the item lift still mis-sizes many items (README "Step 10a — stopped here").
  if (opts.held) { const h = heldOf(avatar); if (h.held || h.offhand) api.equip(h).catch(e => console.warn('[chibi4] equip failed', e)); }
  return api;
}

export function chibi4KitStats() { return { kits: kits.size, mergedOutfits: merged.size, bytes: net.bytes, files: net.files, log: net.log.slice() }; }
