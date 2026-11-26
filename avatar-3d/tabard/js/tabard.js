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
import { blendTo } from '../../js/anim-blend.js';
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

// ---- skin colour. A body has ONE painted skin; every outfit painting was made by editing that skin painting, so where
// an outfit pixel still matches the skin painting at the same spot, it IS bare skin (face, neck, arms, a sleeveless
// top). Those pixels — and only those — take the wanted tone: each channel scaled by wanted / PAINTED_SKIN, so all the
// painted light, shade and blush stay (a light/colour split measured from the torso turned faces green-pale). Fades out over a small colour difference so cloth edges don't get a hard rim.
const skinCache = new Map();
// A finished body paint (skin + painted gear, recoloured) per body + outfit + skin tone: villagers dressed alike share it
// instead of each reading its canvas back and recolouring a million pixels (seconds of stall walking into a town).
const paintCache = new Map(), PAINT_MAX = 4;     // 4 MB each at 1024²: a few, for the outfits a town repeats most
/** The skin painting's pixels and its average tone (bare torso box), measured once per body. */
export async function skinInfo(body, img) {
  if (!skinCache.has(body)) skinCache.set(body, (async () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const data = x.getImageData(0, 0, c.width, c.height).data;
    const D = await loadTabardData(), [rx, ry, rw, rh] = D.regions.regions.torso_upper.rect, k = c.width / D.regions.size;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.round(ry * k); y < (ry + rh) * k; y += 3) for (let xx = Math.round(rx * k); xx < (rx + rw) * k; xx += 3) {
      const i = (y * c.width + xx) * 4; if (data[i + 3] < 200) continue; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    return { data, tone: hexRgb(PAINTED_SKIN), measured: [r / n, g / n, b / n] };
  })());
  return skinCache.get(body);
}
/** The tone the skin paintings were painted in (= the games' 'Warm'): that look leaves them as painted. */
export const PAINTED_SKIN = '#e7b48f';
const hexRgb = h => { const n = parseInt(String(h).replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
/**
 * Recolour skin pixels of `px` (RGBA, same size as `skin`) from the painted tone to `hex`. Returns false when nothing
 * changes. `skin` null = every pixel is skin (the face layer's own base). Used by face.js for its texture too.
 */
export function tintSkin(px, skin, tone, hex, tol = 34) {
  const t = hexRgb(hex), f = [t[0] / tone[0], t[1] / tone[1], t[2] / tone[2]];
  if (Math.abs(f[0] - 1) + Math.abs(f[1] - 1) + Math.abs(f[2] - 1) < 0.03) return false;
  for (let i = 0; i < px.length; i += 4) {
    let w = 1;
    if (skin) {
      const d = Math.abs(px[i] - skin[i]) + Math.abs(px[i + 1] - skin[i + 1]) + Math.abs(px[i + 2] - skin[i + 2]); if (d >= tol) continue;
      w = d < tol * 0.5 ? 1 : 2 - (2 * d) / tol;
      // the skin painting itself also holds the plain under-clothes (cream shirt, linen shorts): real skin is warm
      // (red well above blue) and not near-black; greyish cloth is not, so it keeps its colour (2026-11-23)
      const r = skin[i], gg = skin[i + 1], b = skin[i + 2], warm = (r - b) / Math.max(1, r);
      w *= Math.max(0, Math.min(1, (warm - 0.22) / 0.08)) * Math.max(0, Math.min(1, (r - 70) / 30)) * (r >= gg ? 1 : 0);
      if (w <= 0) continue;
    }
    for (let c = 0; c < 3; c++) {
      const v = px[i + c]; let o = v * f[c];
      if (o > 215) o = 215 + (o - 215) / (1 + (o - 215) / 40);        // soft top: lit spots stay painted, never white
      px[i + c] = v + (o - v) * w;
    }
  }
  return true;
}

const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _v = new THREE.Vector3(), _id = new THREE.Quaternion();


/** A copy of a weapon's geometry with everything more than y0 up the weapon (file Y) shrunk by k toward y0: the shaft
 *  and head get smaller, the handle in the fist keeps its size (items.json shrinkAbove; owner 2026-11-23, the mace). */
const _shrunk = new Map();
function shrinkAbove(geo, y0, k) {
  const key = `${geo.uuid}|${y0.toFixed(3)}|${k}`;
  if (!_shrunk.has(key)) {
    const g = geo.clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y <= y0) continue;
      const t = Math.min(1, (y - y0) / 0.04), r = 1 + (k - 1) * t * t * (3 - 2 * t);   // thickness eases in over 4 cm
      p.setXYZ(i, p.getX(i) * r, y0 + (y - y0) * k, p.getZ(i) * r);
    }
    p.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere(); _shrunk.set(key, g);
  }
  return _shrunk.get(key);
}

// Clips where a staff / two-hander is simply carried (the holding pose applies); swings, casts, falls keep the clip's own arm.
const HOLD_CLIPS = /^(Idle_Loop|Walk_Loop|Jog_Fwd_Loop|Sprint_Loop|Idle_Talking_Loop|Walk_Formal_Loop|Crouch_Idle_Loop|Crouch_Fwd_Loop)$/;
// Legs a tabard flap keeps clear of: [from bone, to bone, radius there, radius at the end]
const FLAP_LEGS = [['thigh_l', 'calf_l', 0.085, 0.06], ['calf_l', 'foot_l', 0.055, 0.04], ['thigh_r', 'calf_r', 0.085, 0.06], ['calf_r', 'foot_r', 0.055, 0.04]];

export async function createTabard({ body = 'male', items = [], clip = 'idle', calm = 0.6, look = null } = {}) {
  const D = await loadTabardData();
  const [g, A] = await Promise.all([glb(`models/${body}.glb`), anims()]);
  const root = SkeletonUtils.clone(g.scene);
  const group = new THREE.Group(); group.add(root); group.name = 'tabard-' + body;

  // ---- paint layer: one canvas texture for the body and every swap-in piece
  const S = D.regions.size;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });   // the skin recolour reads it back: keep it in memory
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const matGeo = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const geosets = {}; const bones = {}; let bodyMesh = null, faceMesh = null;
  // face layer (tools/blender/tb_face.py): its own mesh over the face with its own texture layout. Its canvas starts as
  // the clean painted face (models/<body>/face.webp); js/face.js draws eyes, brows, beards on top (ctxLayer.faceMesh,
  // .faceCanvas, .faceTex). polygonOffset keeps it drawn over the skin it sits 0.4 mm above.
  const faceCanvas = document.createElement('canvas'); faceCanvas.width = faceCanvas.height = 1024;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.flipY = false; faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
  const matFace = new THREE.MeshLambertMaterial({ map: faceTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      o.frustumCulled = false;
      if (o.name.startsWith('geo_')) { o.material = matGeo; geosets[o.name.slice(4)] = o; o.visible = false; }
      else if (o.name === 'face_layer') { o.material = matFace; faceMesh = o; }
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
    const once = /Death|Roll|Attack|Shoot|Hit|Punch|Interact|Jump_Start|Jump_Land|Spell_Simple_Enter|Spell_Simple_Exit/.test(c.name);   // Enter/Exit: a spell's wind-up and follow-through (Oathwild) play once
    blendTo(mixer, mixer.clipAction(c), fade, once);
    current = mixer.clipAction(c); currentName = name; return true;
  }

  // ---- equipment
  const worn = {};             // slot -> item id
  const attached = {};                              // slot -> [Object3D]
  const hangers = [];   // props with place.hang (capes): kept hanging toward the ground
  const cloths = [];    // props with place.cloth: { holder, cloth } (js/cloth.js)
  const flaps = [];     // tabard flaps (place.hang.clear): each swings about its top edge, out of the legs' way (flapAll)
  let holdPole = false; // the main hand holds a staff / spear / two-hander: the holding pose in update()
  let version = 0;
  async function paint() {
    const v = ++version;
    const wantedPaint = new Set(['skin']);
    for (const id of Object.values(worn)) { const it = D.items.items[id]; if (it?.paint) wantedPaint.add(it.paint); }
    const pics = {};
    await Promise.all([...wantedPaint].map(async p => { pics[p] = await image(`models/${body}/${p}.webp`); }));
    if (v !== version) return;                       // a newer equip arrived while pictures loaded
    const want = (curLook || null)?.skin?.color;
    const pkey = `${body}|${S}|${want || ''}|${Object.entries(worn).filter(([, id]) => D.items.items[id]?.paint).map(([sl, id]) => sl + ':' + id).sort().join(',')}`;
    const on = new Set(), off = new Set();
    for (const id of Object.values(worn)) { const it = D.items.items[id]; if (it) { (it.geosets || []).forEach(x => on.add(x)); (it.hides || []).forEach(x => off.add(x)); } }
    const done = () => { tex.needsUpdate = true; for (const [k, m] of Object.entries(geosets)) m.visible = on.has(k) && !off.has(k); hairRule(); };
    const hit = paintCache.get(pkey);
    if (hit) { ctx.putImageData(hit, 0, 0); done(); return; }
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(pics.skin, 0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    for (const [slot, id] of Object.entries(worn)) {
      const it = D.items.items[id]; if (!it?.paint) continue;
      const boxes = (D.regions.slots[slot] || []).map(r => D.regions.regions[r].rect)
        .concat((it.geosets || []).map(gs => D.regions.geosets[gs].rect));
      for (const [x, y, w, h] of boxes) ctx.drawImage(pics[it.paint], x, y, w, h, x, y, w, h);
    }
    if (want) {                                      // skin colour: recolour only the bare-skin pixels (skinTint)
      const sk = await skinInfo(body, pics.skin);
      if (v !== version) return;
      const im = ctx.getImageData(0, 0, S, S);
      if (tintSkin(im.data, sk.data, sk.tone, want)) ctx.putImageData(im, 0, 0);
      if (paintCache.size >= PAINT_MAX) paintCache.delete(paintCache.keys().next().value);
      paintCache.set(pkey, im);
    }
    done();
  }

  async function attach(slot, id) {
    for (const o of attached[slot] || []) {
      o.parent?.remove(o); for (let i = hangers.length - 1; i >= 0; i--) if (hangers[i].holder === o) hangers.splice(i, 1);
      for (let i = cloths.length - 1; i >= 0; i--) if (cloths[i].holder === o) { cloths[i].cloth.dispose(); cloths.splice(i, 1); }
    }
    delete attached[slot];
    if (slot === 'mainhand') holdPole = false;
    for (let i = flaps.length - 1; i >= 0; i--) if (!flaps[i].holder.parent) flaps.splice(i, 1);
    const it = id && D.items.items[id];
    if (!it?.attach && !it?.fal) return;
    const fi = it.fal && D.fal.items[it.fal];
    if (it.fal && !fi) { console.warn('Tabard: no fal item', it.fal); return; }
    // one item may wear several props (the full tabard: chest panels + belt flaps): each is loaded and seated the same way
    const pids = fi ? [null] : [].concat(it.attach);
    const models = await Promise.all(pids.map(pid => glb(fi ? new URL(fi.file, FAL).href : `models/props/${pid}.glb`)
      .catch(() => { console.warn('Tabard: no model for', pid || it.fal); return null; })));
    if (worn[slot] !== id) return;                       // changed again while loading
    const list = [];
    for (const [pi, pid] of pids.entries()) {
      const pg = models[pi]; if (!pg) continue;
      const pr = pid ? D.props[pid] : null;
      // fal one-handers (maces, axes) are made with their origin high on the handle: 10–17 cm of handle below the fist
      // lay along the forearm like a sleeve (2026-11-23 QA). When less than 30% of the weapon is below the grip, slide it
      // down so about 6 cm stays below the fist (capped at 10 cm). Staffs, spears and bows (held mid-shaft) are left as
      // they are. Measured from the file itself, so new fal weapons get it too; an item may set gripShift (metres).
      let shift = 0, pole = it.hold === 'pole';
      if (fi && fi.grip === 'palm_r') {
        const bb = new THREE.Box3().setFromObject(pg.scene);       // file is Y-up: Y = along the weapon
        const below = -bb.min.y, len = bb.max.y - bb.min.y;
        if (it.gripShift != null || fi.gripShift != null) shift = it.gripShift ?? fi.gripShift;
        else if (below > 0.07 && below / len < 0.3) shift = Math.min(0.1, below - 0.06);
        // staffs, spears, greatswords and great axes: long, or held well up the shaft (owner 2026-11-23: they lay along
        // the upper arm) — the pole grip and the holding pose (update), unless the item says otherwise
        if (it.hold == null && (len >= 1.2 || below / len >= 0.3)) pole = true;
      }
      const socks = fi ? D.sockets[body]?._grips?.[pole && fi.grip === 'palm_r' && D.sockets[body]?._grips?.pole_r ? 'pole_r' : fi.grip]
        : D.sockets[body]?.[pid];
      if (!socks) continue;
      if (slot === 'mainhand') holdPole = pole;
      for (const s of socks) {
        const bone = bones[s.bone]; if (!bone) continue;
        // socket: the prop's place in the bone's own frame (tools/blender/tb_prop.py "sockets"; bone frames are the same
        // in Blender and here). The prop file itself is Y-up, so it turns +90° about X back into its modelled frame.
        const holder = new THREE.Group(); holder.name = `${pid || 'fal:' + it.fal}@${s.bone}`;
        holder.matrixAutoUpdate = false; holder.matrix.fromArray(s.matrix);
        const inner = pg.scene.clone(true); inner.position.z = shift;   // up the weapon: its pommel end comes to the fist
        // turn: about the item's own long axis first (the bow: string toward the archer), then the file's Y-up undone
        // fal bows (left-hand grip) come with the string on the file's +X: unturned, the string faced away from the
        // archer and the wood curved back at him (owner 2026-11-23 "the bow is held backwards") — half a turn by default
        inner.rotation.set(Math.PI / 2, (it.turn ?? (fi?.grip === 'palm_l' ? 180 : 0)) * DEG, 0);
        if (it.only) {   // wear only the named parts (a tabard's front flap without the back one)
          const drop = []; inner.traverse(o => { if (o !== inner && o.name && /^(front|back)$/.test(o.name) && !it.only.includes(o.name)) drop.push(o); });
          for (const o of drop) o.parent.remove(o);
        }
        inner.traverse(m => { if (m.isMesh) {
          m.frustumCulled = false;
          const src = m.material;
          // fal files may keep their painting in the emissive slot (Rodin) and have no cut-out parts
          m.material = fi ? new THREE.MeshLambertMaterial({ map: src.map || src.emissiveMap || null, color: (src.map || src.emissiveMap) ? 0xffffff : src.color, side: THREE.DoubleSide })
            : new THREE.MeshLambertMaterial({ map: src.map, alphaTest: 0.5, side: THREE.DoubleSide });
          if (m.material.map) m.material.map.colorSpace = THREE.SRGBColorSpace;
          if (it.shrinkAbove) m.geometry = shrinkAbove(m.geometry, -shift + it.shrinkAbove.from, it.shrinkAbove.k);
        } });
        const hang = pr?.place?.hang, clothOpts = pr?.place?.cloth;
        if (clothOpts) {   // real cloth (js/cloth.js): a coarse grid over the sheet, top edge sewn to the holder
          const { createCloth } = await import('./cloth.js');
          const base = clothOpts === true ? {} : clothOpts;
          // tabard flaps: each flap ('front' / 'back' node) is its own sheet — one grid over both would average a front
          // and a back flap into one sheet through the legs. Own holder each, facing its own way.
          const parts = []; inner.traverse(o => { if (o !== inner && /^(front|back)$/.test(o.name)) parts.push(o); });
          if (!parts.length) {
            holder.add(inner); bone.add(holder); list.push(holder);
            cloths.push({ holder, cloth: createCloth({ holder, bodyMesh, bones, opts: base }) });
          } else for (const p of parts) {
            const h = new THREE.Group(); h.name = `${holder.name}:${p.name}`; h.matrixAutoUpdate = false; h.matrix.copy(holder.matrix);
            const w = new THREE.Group(); w.position.copy(inner.position); w.rotation.copy(inner.rotation);
            p.parent.remove(p); w.add(p); h.add(w); bone.add(h); list.push(h);
            cloths.push({ holder: h, cloth: createCloth({ holder: h, bodyMesh, bones, opts: { ...base, out: p.name === 'front' ? [0, -1, 0] : [0, 1, 0] } }) });
          }
          continue;
        }
        if (hang?.clear) flapHang(holder, inner, hang);   // tabard flaps: each swings out of the legs' way (flapAll)
        else if (hang) {   // hangs from its top edge: a swing group turns it about its own side-to-side axis each frame (update)
          const swing = new THREE.Group(); swing.add(inner); holder.add(swing);
          hangers.push({ holder, swing, min: hang.min * DEG, max: hang.max * DEG });
        } else holder.add(inner);
        bone.add(holder); list.push(holder);
      }
    }
    if (slot === 'mainhand' && !list.length) holdPole = false;
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

  // Tabard flaps (props.json place.hang.clear): each flap ('front' / 'back' node) gets its own hinge at its top edge.
  // Every frame it hangs toward the ground (within hang.min..max degrees out from its rest line) and swings further out
  // whenever a thigh or shin would come through it — the leg is sampled as a few spheres along each bone.
  function flapHang(holder, inner, hang) {
    inner.updateMatrixWorld(true);                       // inner has no parent yet: its world = the holder's frame
    const meshes = []; inner.traverse(o => { if (o.isMesh) meshes.push(o); });
    const v = new THREE.Vector3();
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, pts = [];
      for (let i = 0; i < pos.count; i++) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone());
      const top = Math.max(...pts.map(p => p.z)), bottom = Math.min(...pts.map(p => p.z)), tops = pts.filter(p => p.z > top - 0.01);
      const hinge = new THREE.Vector3(0, tops.reduce((a, p) => a + p.y, 0) / tops.length, top);
      const pivot = new THREE.Group(); pivot.position.copy(hinge);
      const swing = new THREE.Group(), off = new THREE.Group();
      off.matrixAutoUpdate = false; off.matrix.makeTranslation(-hinge.x, -hinge.y, -hinge.z).multiply(m.matrixWorld);
      m.parent.remove(m); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
      off.add(m); swing.add(off); pivot.add(swing); holder.add(pivot);
      flaps.push({ holder, swing, hinge, out: hinge.y < 0 ? -1 : 1, len: top - bottom, hw: Math.max(...pts.map(p => Math.abs(p.x))),
        min: (hang.min || 0) * DEG, max: (hang.max ?? 75) * DEG, phi: 0 });
    }
  }
  const _hi = new THREE.Matrix4(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pp = new THREE.Vector3();
  function flapAll(dt) {
    for (const f of flaps) {
      _hi.copy(f.holder.matrixWorld).invert(); _m3.setFromMatrix4(_hi);
      _d.set(0, -1, 0).applyMatrix3(_m3).normalize();                    // straight down, in the holder's frame
      let want = Math.atan2(f.out * _d.y, -_d.z);                          // out from the rest line to straight down
      for (const [a, b, r0, r1] of FLAP_LEGS) {
        if (!bones[a] || !bones[b]) continue;
        bones[a].getWorldPosition(_pa); bones[b].getWorldPosition(_pb);
        for (let t = 0; t <= 1.001; t += 0.25) {
          _pp.lerpVectors(_pa, _pb, t).applyMatrix4(_hi);
          const rad = r0 + (r1 - r0) * t, ry = _pp.y - f.hinge.y, below = f.hinge.z - _pp.z;
          if (below < 0.02 || below > f.len + 0.12 || Math.abs(_pp.x) > f.hw + rad) continue;
          const dist = Math.hypot(ry, below);
          want = Math.max(want, Math.atan2(f.out * ry, below) + Math.asin(Math.min(1, (rad + 0.015) / dist)));
        }
      }
      want = Math.min(f.max, Math.max(f.min, want));
      f.phi += (want - f.phi) * Math.min(1, dt * (want > f.phi ? 30 : 7));   // out fast (a leg pushes), back slowly
      f.swing.rotation.x = f.out * f.phi;
    }
  }

  // Holding a staff / spear / two-hander (pole grip: the shaft through the fist at a right angle to the forearm): in the
  // carrying clips the elbow bends forward and the wrist turns so the shaft stands up beside the body instead of lying
  // along the arm (owner 2026-11-23). w = how much of the current pose comes from carrying clips (fades with the clips).
  const _ax = new THREE.Vector3(), _tg = new THREE.Vector3(), _fw = new THREE.Vector3(), _qh = new THREE.Quaternion(), _qp = new THREE.Quaternion();
  function poseHold(w) {
    const la = bones.lowerarm_r, hd = bones.hand_r, holder = attached.mainhand?.[0];
    if (!la || !hd || !holder) return;
    group.updateMatrixWorld(true);
    root.getWorldQuaternion(_qa); _fw.set(0, 0, 1).applyQuaternion(_qa);              // the body's forward
    la.getWorldPosition(_pa); hd.getWorldPosition(_pb); _ax.subVectors(_pb, _pa).normalize();   // the forearm
    _tg.crossVectors(_ax, _fw);
    if (_tg.lengthSq() > 1e-4) {                                                       // elbow: forearm forward 70°
      la.getWorldQuaternion(_q); _tg.applyQuaternion(_q.invert()).normalize();
      la.quaternion.multiply(_qp.setFromAxisAngle(_tg, 70 * DEG * w));
      group.updateMatrixWorld(true);
    }
    // wrist: turn the shaft toward upright (8° forward), at most 60°
    _ax.set(0, 0, 1).transformDirection(holder.matrixWorld);
    _tg.set(0, 1, 0).applyQuaternion(_qa).multiplyScalar(Math.cos(8 * DEG)).addScaledVector(_fw, Math.sin(8 * DEG)).normalize();
    const ang = _ax.angleTo(_tg); if (ang < 1e-3) return;
    _qh.setFromUnitVectors(_ax, _tg); _qp.identity().slerp(_qh, w * Math.min(1, 60 * DEG / ang));
    hd.getWorldQuaternion(_q); _q.premultiply(_qp);                                    // the hand's new world turn
    hd.parent.getWorldQuaternion(_qh); hd.quaternion.copy(_qh.invert().multiply(_q));
  }

  function hairRule() {   // a head item's `hair` rule: 'hide' | 'under' | 'keep' (old data: hidesHair = 'hide')
    const h = D.items.items[worn.head], rule = h?.hair && typeof h.hair === 'object' ? h.hair[body] : h?.hair;   // may be per body
    const hide = h ? (rule ? rule === 'hide' : !!h.hidesHair) : false;
    for (const o of attached.hair || []) o.visible = !hide;
    layers.hair?.setHead(worn.head || null);        // the hair layer picks its own version under that headwear (hair.js)
  }
  /** The hair the layer shows: the look's, unless the Hair slot wears a style item (items.json `hairStyle`). */
  function hairLook() {
    const L = curLook || faceMod.defaultLook(body), st = D.items.items[worn.hair]?.hairStyle;
    return st ? { id: st, color: L.hair?.color || '#4a3020' } : (L.hair || null);
  }

  async function equip(slot, id) {
    if (id) { const it = D.items.items[id]; if (!it || it.slot !== slot) throw new Error(`${id} is not a ${slot} item`); worn[slot] = id; }
    else delete worn[slot];
    await Promise.all([paint(), attach(slot, id), slot === 'hair' && layers.hair?.set(hairLook())]);
  }

  async function wearSet(name) {
    const set = D.items.sets[name]; if (!set) return;
    for (const s of Object.keys(worn)) { delete worn[s]; attach(s, null); }
    for (const id of set.items) worn[D.items.items[id].slot] = id;
    await Promise.all([paint(), ...set.items.map(id => attach(D.items.items[id].slot, id)), layers.hair?.set(hairLook())]);
  }

  // ---- look layers (round 4): the face (js/face.js — its own mesh + texture: eyes, brows, beard, marks) and the hair
  // (js/hair.js — its own meshes, see-through strand edges, physics on tails). Both follow a Chibi 2.6 look, so a game's
  // old character builder drives them as is: { skin:{color}, hair:{id,color}, eyes:{id,color}, brows:{id}, extras:{id},
  // facialHair:{id} }. setLook() re-applies; skin colour is a paint-layer job (paint()).
  const layers = { face: null, hair: null };
  let curLook = look;
  if (faceMesh) {
    try { const im = await image(`models/${body}/face.webp`); faceCanvas.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0, 1024, 1024); faceTex.needsUpdate = true; }   // the first getContext fixes the canvas's options: face.js reads it back, so keep it in memory
    catch (e) { console.warn('Tabard: no face painting —', e.message); }
  }
  const ctxLayer = { THREE, D, body, bones, root, group, bodyMesh, faceMesh, faceCanvas, faceTex, geosets, at };
  const [faceMod, hairMod] = await Promise.all([import('./face.js'), import('./hair.js')]);
  [layers.face, layers.hair] = await Promise.all([faceMod.createFace(ctxLayer), hairMod.createHair(ctxLayer)]);
  async function applyLook() {
    const L = curLook || faceMod.defaultLook(body);
    await Promise.all([paint(), layers.face?.set(L), layers.hair?.set(hairLook())]);
  }

  for (const id of items) { const it = D.items.items[id]; if (it) worn[it.slot] = id; }
  await Promise.all([applyLook(), ...items.map(id => D.items.items[id] && attach(D.items.items[id].slot, id))]);
  play(clip, 0);
  // bones the calm posture turns: their clean clip pose is kept so calm never stacks frame on frame (update)
  const calmClean = new Map(['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'upperarm_r', 'lowerarm_r', 'hand_r']
    .map(n => bones[n]).concat(fingers).filter(Boolean).map(b => [b, b.quaternion.clone()]));
  mixer.update(0);                                   // posed now: never drawn in the bind (T) pose for a frame
  for (const [b, q] of calmClean) q.copy(b.quaternion);

  // ---- calm: soften the library's athletic posture after the mixer has posed the bones
  const api = {
    group, root, bones, canvas, body, calm, _mixer: mixer, _flaps: flaps,   // _flaps: swing angles for tests
      // _mixer: tests/qa-anim.mjs reads blend weights
    get worn() { return { ...worn }; },
    get clip() { return currentName; },
    duration() { return current ? current.getClip().duration : 0; },
    play, equip, wearSet,
    get look() { return curLook; },
    /** A Chibi 2.6 look (see above); null = the body's default look. */
    async setLook(look) { curLook = look; await applyLook(); },
    layers,
    update(dt) {
      // three.js only writes a bone when the blended clip value CHANGED since the last frame. A clip held on its last
      // frame (death, lying down) writes nothing, so the calm turn below landed on top of last frame's calm turn and the
      // arms spun round and round (owner 2026-11-23: "getting knocked down the character twirls their arms in
      // circles"). Put back the clean clip pose first, so calm is applied once per frame whatever the mixer does.
      for (const [b, q] of calmClean) b.quaternion.copy(q);
      mixer.update(dt);
      for (const [b, q] of calmClean) q.copy(b.quaternion);
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
      if (holdPole) {   // carrying a staff / two-hander: the holding pose (after calm, on the clean pose — see above)
        let w = 0;
        for (const c of clips.values()) { const a = mixer.existingAction(c); if (a?.isRunning() && HOLD_CLIPS.test(c.name)) w += a.getEffectiveWeight(); }
        if (w > 0.001) poseHold(Math.min(1, w));
      }
      if (hangers.length) hangAll(dt); else group.updateMatrixWorld(true);   // bones placed once for cloth + hair
      if (flaps.length) flapAll(dt);
      for (const c of cloths) c.cloth.update(dt);
      layers.hair?.update(dt); layers.face?.update?.(dt);
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
      mixer.stopAllAction(); tex.dispose(); mat.dispose(); matGeo.dispose(); faceTex.dispose(); matFace.dispose(); layers.hair?.dispose(); layers.face?.dispose();
      for (const c of cloths) c.cloth.dispose();
    },
  };
  return api;
}
