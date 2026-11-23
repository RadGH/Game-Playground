// Tabard runtime — WoW-style equippable characters in three.js.
//
//   const t = await createTabard({ body: 'male', items: ['jerkin_trail', 'sword_arming'] });
//   scene.add(t.group); t.play('Walk_Loop'); ... t.update(dt);
//   t.equip('chest', 'cuirass_bulwark'); t.equip('head', null); t.wearSet('plate');
//
// Three layers, as in the 2004 MMO this style comes from:
//   1. paint   — the body has ONE 1024² texture split into fixed boxes (data/regions.json). This module paints it on a
//                canvas: the bare skin first, then, for each worn item, the boxes of its slot copied from its outfit
//                painting (models/<body>/<outfit>.webp). Swapping a chest piece = re-copying three boxes. No new mesh.
//   2. geosets — swap-in mesh pieces inside the body file (robe skirt, boot cuffs, gauntlet cuffs), turned on by items
//                (`geosets`) and forced off by others (`hides`). They share the body's painted texture.
//   3. attach  — separate small models (helm, pauldrons, cape, weapons, shield) on bones (data/props.json sockets).
//                Also every fal.ai weapon: equip('mainhand', 'fal:sword') (see loadTabardData / falItems).
// Body + geosets = one material, one texture; each prop is one more draw call.
//
// Animation: the CC0 Universal Animation Library on the same 65-bone skeleton (models/anims.glb). Only rotations and
// the pelvis height are used, so the clips fit any body built on that skeleton. `calm` (0..1) softens the library's
// athletic posture at run time: arms closer to the body, chest let down toward neutral, hands relaxed open.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const DEG = Math.PI / 180;

const ROOT = new URL('../', import.meta.url);
const at = p => new URL(p, ROOT).href;
const loader = new GLTFLoader();
const glbs = new Map(), images = new Map();
let DATA = null, ANIMS = null;

// fal.ai weapons (avatar-3d/fal): any held item in its catalog can be worn here — same skeleton; the grips for the
// Tabard bodies are in models/props/sockets.json `_grips` (tools/blender/tb_prop.py sockets, fal's own rule).
const FAL = new URL('../fal/', ROOT);
const GRIP_SLOT = { palm_r: 'mainhand', palm_l: 'mainhand', forearm_l: 'offhand' };

export async function loadTabardData() {
  if (!DATA) DATA = (async () => {
    const [regions, items, props, sockets] = await Promise.all(['data/regions.json', 'data/items.json', 'data/props.json', 'models/props/sockets.json']
      .map(p => fetch(at(p)).then(r => r.json())));
    // every held fal item becomes a Tabard item 'fal:<id>' (new fal weapons show up with no change here); an item in
    // data/items.json with `fal: '<id>'` names one explicitly (its own name / slot win). A missing catalog is fine.
    let fal = { items: {} };
    try {
      const cat = await fetch(new URL('data/catalog.json', FAL)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
      for (const it of cat.items || []) if (it.kind === 'held' && it.file && GRIP_SLOT[it.grip]) fal.items[it.id] = it;
    } catch (e) { console.warn('Tabard: no fal catalog —', e.message); }
    const named = new Set(Object.values(items.items).map(it => it.fal).filter(Boolean));
    for (const [id, f] of Object.entries(fal.items)) {
      if (!named.has(id)) items.items['fal:' + id] = { slot: GRIP_SLOT[f.grip], name: f.name, fal: id, auto: true };
    }
    return { regions, items, props: props.props, sockets, fal };
  })();
  return DATA;
}

/** Tabard item ids for every fal weapon/shield ('fal:<id>'), for games mapping their items onto Tabard. */
export async function falItems() {
  const D = await loadTabardData();
  return Object.entries(D.items.items).filter(([, it]) => it.fal).map(([id, it]) => ({ id, slot: it.slot, name: it.name, fal: it.fal }));
}

function glb(path) {   // a path inside tabard/, or a full URL (fal weapons)
  if (!glbs.has(path)) glbs.set(path, loader.loadAsync(/^[a-z]+:/.test(path) ? path : at(path)));
  return glbs.get(path);
}

function image(path) {
  if (!images.has(path)) images.set(path, new Promise((ok, fail) => {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => ok(im); im.onerror = () => fail(new Error('missing ' + path)); im.src = at(path);
  }));
  return images.get(path);
}

/** The library clips, cleaned once: rotations for every bone, the pelvis position re-based per body later. */
async function anims() {
  if (!ANIMS) ANIMS = glb('models/anims.glb').then(g => {
    let pelvisRest = null;
    g.scene.traverse(o => { if (o.isBone && o.name === 'pelvis') pelvisRest = o.position.clone(); });
    const clips = g.animations.map(c => {
      const tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
      return new THREE.AnimationClip(c.name, c.duration, tracks);
    });
    return { clips, pelvisRest };
  });
  return ANIMS;
}

/** Clip names a page can offer (friendly label -> library clip). */
export const CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', attack: 'Sword_Attack',
  ready: 'Sword_Idle', cast: 'Spell_Simple_Shoot', channel: 'Spell_Simple_Idle_Loop', punch: 'Punch_Cross',
  hit: 'Hit_Chest', death: 'Death01', talk: 'Idle_Talking_Loop', sit: 'Sitting_Idle_Loop', dance: 'Dance_Loop',
  jump: 'Jump_Loop', roll: 'Roll', interact: 'Interact', formal: 'Walk_Formal_Loop', crouch: 'Crouch_Idle_Loop',
};
export const CLIP_NAMES = {
  idle: 'Idle', walk: 'Walk', run: 'Run', sprint: 'Sprint', attack: 'Sword swing', ready: 'Sword ready', cast: 'Cast',
  channel: 'Channel', punch: 'Punch', hit: 'Get hit', death: 'Death', talk: 'Talk', sit: 'Sit', dance: 'Dance',
  jump: 'Jump', roll: 'Roll', interact: 'Use', formal: 'Stroll', crouch: 'Crouch',
};

const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _v = new THREE.Vector3(), _id = new THREE.Quaternion();

export async function createTabard({ body = 'male', items = [], clip = 'idle', calm = 0.6 } = {}) {
  const D = await loadTabardData();
  const [g, A] = await Promise.all([glb(`models/${body}.glb`), anims()]);
  const root = SkeletonUtils.clone(g.scene);
  const group = new THREE.Group(); group.add(root); group.name = 'tabard-' + body;

  // ---- paint layer: one canvas texture for the body and every swap-in piece
  const S = D.regions.size;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const matGeo = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const geosets = {}; const bones = {}; let bodyMesh = null;
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.frustumCulled = false;
      if (o.name.startsWith('geo_')) { o.material = matGeo; geosets[o.name.slice(4)] = o; o.visible = false; }
      else { o.material = mat; bodyMesh = o; }
    }
  });

  // ---- animation
  const fingers = Object.values(bones).filter(b => /^(index|middle|ring|pinky|thumb)_0[123]_/.test(b.name));
  const mixer = new THREE.AnimationMixer(root);
  const pelvisRest = bones.pelvis.position.clone();
  const clips = new Map();
  function clipFor(name) {
    const lib = CLIPS[name] || name;
    if (!clips.has(lib)) {
      const src = A.clips.find(c => c.name === lib);
      if (!src) return null;
      const c = src.clone();
      for (const t of c.tracks) if (t.name === 'pelvis.position') {
        const v = t.values; // re-base the hip height from the library's mannequin to this body
        for (let i = 0; i < v.length; i += 3) {
          v[i] += pelvisRest.x - A.pelvisRest.x; v[i + 1] += pelvisRest.y - A.pelvisRest.y; v[i + 2] += pelvisRest.z - A.pelvisRest.z;
        }
      }
      clips.set(lib, c);
    }
    return clips.get(lib);
  }
  let current = null, currentName = null;
  function play(name, fade = 0.25) {
    const c = clipFor(name); if (!c) return false;
    const a = mixer.clipAction(c);
    a.reset(); a.enabled = true; a.setEffectiveWeight(1);
    if (/Death|Roll|Attack|Shoot|Hit|Punch|Interact|Jump_Start|Jump_Land/.test(c.name)) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    else a.setLoop(THREE.LoopRepeat);
    if (current && current !== a) a.crossFadeFrom(current, fade, false);
    a.play(); current = a; currentName = name; return true;
  }

  // ---- equipment
  const worn = {};             // slot -> item id
  const attached = {};                              // slot -> [Object3D]
  const hangers = [];   // props with place.hang (capes): kept hanging toward the ground
  let version = 0;
  async function paint() {
    const v = ++version;
    const wantedPaint = new Set(['skin']);
    for (const id of Object.values(worn)) { const it = D.items.items[id]; if (it?.paint) wantedPaint.add(it.paint); }
    const pics = {};
    await Promise.all([...wantedPaint].map(async p => { pics[p] = await image(`models/${body}/${p}.webp`); }));
    if (v !== version) return;                       // a newer equip arrived while pictures loaded
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(pics.skin, 0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    const on = new Set(), off = new Set();
    for (const [slot, id] of Object.entries(worn)) {
      const it = D.items.items[id]; if (!it) continue;
      (it.geosets || []).forEach(x => on.add(x)); (it.hides || []).forEach(x => off.add(x));
      if (!it.paint) continue;
      const boxes = (D.regions.slots[slot] || []).map(r => D.regions.regions[r].rect)
        .concat((it.geosets || []).map(gs => D.regions.geosets[gs].rect));
      for (const [x, y, w, h] of boxes) ctx.drawImage(pics[it.paint], x, y, w, h, x, y, w, h);
    }
    tex.needsUpdate = true;
    for (const [k, m] of Object.entries(geosets)) m.visible = on.has(k) && !off.has(k);
    hairRule();
  }

  async function attach(slot, id) {
    for (const o of attached[slot] || []) { o.parent?.remove(o); for (let i = hangers.length - 1; i >= 0; i--) if (hangers[i].holder === o) hangers.splice(i, 1); }
    delete attached[slot];
    const it = id && D.items.items[id];
    if (!it?.attach && !it?.fal) return;
    const fi = it.fal && D.fal.items[it.fal];
    if (it.fal && !fi) { console.warn('Tabard: no fal item', it.fal); return; }
    const socks = fi ? D.sockets[body]?._grips?.[fi.grip] : D.sockets[body]?.[it.attach];
    if (!socks) return;
    let pg;
    try { pg = await glb(fi ? new URL(fi.file, FAL).href : `models/props/${it.attach}.glb`); }
    catch (e) { console.warn('Tabard: no model for', it.attach || it.fal); return; }
    if (worn[slot] !== id) return;                       // changed again while loading
    const list = [];
    // fal one-handers (maces, axes) are made with their origin high on the handle: 10–17 cm of handle below the fist
    // lay along the forearm like a sleeve (2026-11-23 QA). When less than 30% of the weapon is below the grip, slide it
    // down so about 6 cm stays below the fist (capped at 10 cm). Staffs, spears and bows (held mid-shaft) are left as
    // they are. Measured from the file itself, so new fal weapons get it too; an item may set gripShift (metres).
    let shift = 0;
    if (fi && fi.grip === 'palm_r') {
      if (it.gripShift != null || fi.gripShift != null) shift = it.gripShift ?? fi.gripShift;
      else {
        const bb = new THREE.Box3().setFromObject(pg.scene);       // file is Y-up: Y = along the weapon
        const below = -bb.min.y, len = bb.max.y - bb.min.y;
        if (below > 0.07 && below / len < 0.3) shift = Math.min(0.1, below - 0.06);
      }
    }
    for (const s of socks) {
      const bone = bones[s.bone]; if (!bone) continue;
      // socket: the prop's place in the bone's own frame (tools/blender/tb_prop.py "sockets"; bone frames are the same
      // in Blender and here). The prop file itself is Y-up, so it turns +90° about X back into its modelled frame.
      const holder = new THREE.Group(); holder.name = `${it.attach || 'fal:' + it.fal}@${s.bone}`;
      holder.matrixAutoUpdate = false; holder.matrix.fromArray(s.matrix);
      const inner = pg.scene.clone(true); inner.rotation.x = Math.PI / 2; inner.position.z = shift;   // up the weapon: its pommel end comes to the fist
      inner.traverse(m => { if (m.isMesh) {
        m.frustumCulled = false;
        const src = m.material;
        // fal files may keep their painting in the emissive slot (Rodin) and have no cut-out parts
        m.material = fi ? new THREE.MeshLambertMaterial({ map: src.map || src.emissiveMap || null, color: (src.map || src.emissiveMap) ? 0xffffff : src.color, side: THREE.DoubleSide })
          : new THREE.MeshLambertMaterial({ map: src.map, alphaTest: 0.5, side: THREE.DoubleSide });
        if (m.material.map) m.material.map.colorSpace = THREE.SRGBColorSpace;
      } });
      const hang = it.attach && D.props[it.attach]?.place?.hang;
      if (hang) {   // hangs from its top edge: a swing group turns it about its own side-to-side axis each frame (update)
        const swing = new THREE.Group(); swing.add(inner); holder.add(swing);
        hangers.push({ holder, swing, min: hang.min * DEG, max: hang.max * DEG });
      } else holder.add(inner);
      bone.add(holder); list.push(holder);
    }
    attached[slot] = list; hairRule();
  }

  // A cape is stiff (one piece on the upper back), so leaning forward would lift it out behind like a board. Each frame
  // its swing angle about its own side-to-side axis is set so the bottom edge hangs back from straight down by
  // between place.hang.min and .max degrees (min keeps it off the back and seat), eased so it sways instead of snapping.
  const _d = new THREE.Vector3(), _b = new THREE.Vector3(), _m3 = new THREE.Matrix3();
  function hangAll(dt) {
    group.updateMatrixWorld(true);
    for (const h of hangers) {
      _m3.setFromMatrix4(h.holder.matrixWorld);
      _d.set(0, 0, -1).applyMatrix3(_m3).normalize();      // the cape's 'down' (its top->bottom), without swing
      _b.set(0, 1, 0).applyMatrix3(_m3).normalize();       // its 'back' (away from the body)
      const now = Math.atan2(_d.dot(_b.set(_b.x, 0, _b.z).normalize()), -_d.y);   // how far the bottom is behind straight down
      const want = Math.min(h.max, Math.max(h.min, now)) - now;
      h.swing.rotation.x += (want - h.swing.rotation.x) * Math.min(1, dt * 8);
    }
  }

  function hairRule() {   // a head item with hidesHair hides whatever the hair slot wears
    const hide = !!D.items.items[worn.head]?.hidesHair;
    for (const o of attached.hair || []) o.visible = !hide;
  }

  async function equip(slot, id) {
    if (id) { const it = D.items.items[id]; if (!it || it.slot !== slot) throw new Error(`${id} is not a ${slot} item`); worn[slot] = id; }
    else delete worn[slot];
    await Promise.all([paint(), attach(slot, id)]);
  }

  async function wearSet(name) {
    const set = D.items.sets[name]; if (!set) return;
    for (const s of Object.keys(worn)) { delete worn[s]; attach(s, null); }
    for (const id of set.items) worn[D.items.items[id].slot] = id;
    await Promise.all([paint(), ...set.items.map(id => attach(D.items.items[id].slot, id))]);
  }

  for (const id of items) { const it = D.items.items[id]; if (it) worn[it.slot] = id; }
  await Promise.all([paint(), ...items.map(id => D.items.items[id] && attach(D.items.items[id].slot, id))]);
  play(clip, 0);

  // ---- calm: soften the library's athletic posture after the mixer has posed the bones
  const api = {
    group, root, bones, canvas, body, calm,
    get worn() { return { ...worn }; },
    get clip() { return currentName; },
    duration() { return current ? current.getClip().duration : 0; },
    play, equip, wearSet,
    update(dt) {
      mixer.update(dt);
      const k = api.calm;
      if (k > 0) {
        for (const n of ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head']) {   // Head: the library idles look at the floor
          const b = bones[n]; if (b) b.quaternion.slerp(_id, (n === 'Head' ? 0.5 : 0.35) * k);
        }
        // relaxed hands: fingers ease toward their rest (open, slightly curled by the blend), so no clenched fists
        for (const b of fingers) b.quaternion.slerp(_id, 0.7 * k);
        group.updateMatrixWorld(true);
        for (const [n, sgn] of [['upperarm_l', 1], ['upperarm_r', -1]]) {
          const b = bones[n]; if (!b) continue;
          // the body's forward axis (+Z in the file), expressed in this bone's own frame
          b.getWorldQuaternion(_q); root.getWorldQuaternion(_qa);
          _v.set(0, 0, 1).applyQuaternion(_qa).applyQuaternion(_q.invert());
          b.quaternion.multiply(_qa.setFromAxisAngle(_v.normalize(), sgn * 0.24 * k));
        }
      }
      if (hangers.length) hangAll(dt);
    },
    stats() {
      let triangles = 0, draws = 0;
      group.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && o.visible && o.parent?.visible !== false) {
        let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
        if (!vis) return;
        triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; draws++;
      } });
      return { triangles: Math.round(triangles), draws, bones: Object.keys(bones).length, texture: `${S}×${S}` };
    },
    dispose() {
      mixer.stopAllAction(); tex.dispose(); mat.dispose(); matGeo.dispose();
    },
  };
  return api;
}
