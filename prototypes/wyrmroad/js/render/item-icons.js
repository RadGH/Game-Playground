// Item icons drawn from the worn model (lessons rule 20), after Thousandvale's ui/item-icons.js:
//   weapons and off-hand pieces   built on their own by the very gear builders the hands hold (chibi2-gear.js / gear5)
//                                 — a weapon laid on the diagonal, a shield face-on
//   head / chest / legs / feet / trinket   a plain matte mannequin (Chibi 2.6, `mannequin: true`) wearing ONLY that
//                                 item's `look` part, framed on the part (helm close-up, torso, legs, feet, neck)
// One small renderer of our own, one icon at a time with a breath between them (the bag never stalls), cached by base id.
//
//   renderItemIcon(data, item, { size }) → Promise<url>      (an object URL of a PNG)
//   itemIconUrl(data, item) → url | null                     (cached now, else starts the render and returns null)
//   paintItemIcons(root, data)                               (swaps each [data-icon-base] element's svg for its icon
//                                                             as soon as it is ready; the tinted svg stays until then)
import * as THREE from 'three';
import { createChibi2Character } from '../../../../avatar-3d/js/chibi2.js';
import { buildHeld, buildOffhand } from '../../../../avatar-3d/js/chibi2-gear.js';
import { G5_WEAPON_BUILDERS, G5_OFFHAND_BUILDERS } from '../../../../avatar-3d/js/chibi2-gear5.js';
import { isG5, G5_HELD, G5_OFFHAND } from '../../../../avatar-3d/js/chibi2-gear5-ids.js';
import { baseOf } from '../sim/items.js';
import { lengthScale } from './hands.js';

const PX = 128;
const MANNEQUIN = '#b9b2a6';       // the dummy's one matte colour: dark leather still reads on it, steel still shines
const cache = new Map();           // base id → Promise<url>
const ready = new Map();           // base id → url
const queue = [];
let busy = false;

// bones to aim at, how far around them to show, from which side (Thousandvale PART_FRAMES, tuned for Chibi 2.6)
const FRAMES = {
  head: { bones: ['head'], lift: 0.14, radius: 0.22, yaw: 0.35, pitch: 0.16 },      // the helm close-up (a Chibi head is big: 0.2 × height)
  chest: { bones: ['chest'], lift: -0.02, radius: 0.22, yaw: 0.3, pitch: 0.05 },
  legs: { bones: ['kneeL', 'kneeR'], lift: 0.03, radius: 0.21, yaw: 0.45 },
  feet: { bones: ['footL', 'footR'], lift: 0.03, radius: 0.17, yaw: 0.7, pitch: 0.35 },
  trinket: { bones: ['chest'], lift: 0.1, radius: 0.14, yaw: 0.2, pitch: 0.1 },
};

let R = null;
function stage() {
  if (R) return R;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = PX;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1); renderer.setSize(PX, PX, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3028, 1.4));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-2.5, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(3, 2.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffc89a, 0.5); fill.position.set(3, 0.5, 3); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  R = { canvas, renderer, scene, camera };
  return R;
}
const _v = new THREE.Vector3(), _box = new THREE.Box3();
function aim(camera, target, radius, yaw = 0.35, pitch = 0.12) {
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - radius * 4); camera.far = dist + radius * 6;
  camera.lookAt(target); camera.updateProjectionMatrix();
}
/** Draw the stage into a PNG object URL (async encode: toBlob, never toDataURL on the frame). */
function shoot() {
  const { renderer, scene, camera, canvas } = stage();
  renderer.clear(); renderer.render(scene, camera);
  const c = document.createElement('canvas'); c.width = c.height = PX;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = PX * 0.05; g.shadowOffsetY = PX * 0.02;
  g.drawImage(canvas, 0, 0);
  return new Promise(res => c.toBlob(b => res(b ? URL.createObjectURL(b) : c.toDataURL('image/png')), 'image/png'));
}

/** A weapon or off-hand piece built on its own by the gear builders the hand holds. */
function pieceModel(part, held) {
  const group = new THREE.Group(), cloth = [], metal = [];
  const add = (geometry, bone, color, { position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], metal: isMetal = false } = {}) => {
    if (held && bone && !/hand|grip|elbow/.test(bone)) return;          // a bow also hangs a quiver on the hips
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    const geo = geometry.clone(); geo.applyMatrix4(m);
    (isMetal ? metal : cloth).push([geo, color]);
  };
  const a = { held: { id: 'none' }, offhand: { id: 'none' }, body: {} };
  const c = { add, trim: '#d9b477', leather: '#493c36', steel: '#c4d4d6', darkSteel: '#536a73', W: 1, T: 1, H: 1, A: 1, LW: 1, hipsZ: 0.13, rig: null };
  const p = { quality: 1, ...part };
  if (isG5(p.id)) {
    if (held || (G5_HELD[p.id] && !G5_OFFHAND[p.id])) { a.held = p; G5_WEAPON_BUILDERS[p.id]?.(c, p.color || '#c8ccd6', p.quality ?? 0, a, a.held); held = true; }
    else { a.offhand = p; G5_OFFHAND_BUILDERS[p.id]?.(c, p.color || G5_OFFHAND[p.id]?.color || '#9aa3ad', p.quality ?? 0, a, a.offhand); }
  } else if (held) { a.held = p; buildHeld(a, c); }
  else { a.offhand = p; buildOffhand(a, c); if (!cloth.length && !metal.length) { a.held = p; a.offhand = { id: 'none' }; buildHeld(a, c); held = true; } }   // a second blade
  if (!cloth.length && !metal.length) return null;
  for (const [list, metalish] of [[cloth, false], [metal, true]]) for (const [geo, color] of list) {
    if (!geo.attributes.normal) geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, emissive: new THREE.Color(color).multiplyScalar(metalish ? 0.18 : 0.04) })));
  }
  // a weapon drawn shorter than its kind is lengthened along the blade, exactly as it is in the hand (hands.js)
  if (held) {
    _box.setFromObject(group);
    const k = lengthScale(p.id, _box.max.y - _box.min.y);
    if (k !== 1) group.traverse(o => { if (o.isMesh) o.geometry.scale(1, k, 1); });
  }
  // weapons lie on the diagonal pointing up-right (hand space runs the blade along -y); a shield faces -x, so a
  // quarter turn shows its face
  if (held) group.rotation.set(0, 0, Math.PI * 0.75); else group.rotation.set(0, Math.PI / 2, 0);
  return { group, held };
}

/** The plain dummy wearing exactly one part. */
function mannequinLook(slotKey, part) {
  const look = {
    body: { build: 'average', skin: MANNEQUIN }, skin: { color: MANNEQUIN }, hair: { id: 'bald' }, facialHair: { id: 'none' },
    hat: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' }, accessory: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' },
    top: { id: 'tunic', color: MANNEQUIN }, bottom: { id: 'pants', color: MANNEQUIN }, shoes: { id: 'boots', color: MANNEQUIN },
  };
  look[slotKey] = JSON.parse(JSON.stringify(part));
  return look;
}

async function draw(b) {
  const [slotKey, part] = Object.entries(b.look || {})[0] || [];
  if (!part) return null;
  const { scene, camera } = stage();
  if (b.slot === 'weapon' || b.slot === 'offhand') {
    // a second blade in the off hand (the Duelist's) is a weapon, not a shield: build it as one
    const m = pieceModel(part, b.slot === 'weapon' || b.offKind === 'blade');
    if (m) {
      scene.add(m.group); m.group.updateMatrixWorld(true);
      _box.setFromObject(m.group);
      const c = _box.getCenter(new THREE.Vector3()), s = _box.getSize(new THREE.Vector3());
      aim(camera, c, Math.max(s.x, s.y, s.z) * (m.held ? 0.5 : 0.56), 0.25, 0.1);
      const url = await shoot();
      scene.remove(m.group); m.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
      return url;
    }
  }
  // worn pieces (and any hand piece without a model of its own): on the mannequin
  const actor = await createChibi2Character(mannequinLook(slotKey, part), { v25: true, v26: true, mannequin: true, anims: ['idle'] });
  try {
    scene.add(actor.group);
    actor.setAnim('idle', 0); for (let i = 0; i < 4; i++) actor.update(0.15);
    actor.group.updateMatrixWorld(true);
    const F = FRAMES[b.slot] || (b.slot === 'weapon' || b.slot === 'offhand' ? { bones: [b.slot === 'weapon' ? 'handR' : 'handL'], lift: 0, radius: 0.45, yaw: 0.45, pitch: 0.08 } : FRAMES.chest);
    const H = actor.metrics().height, target = new THREE.Vector3(); let n = 0;
    for (const name of F.bones) { const bone = actor.parts[name]; if (bone) { bone.getWorldPosition(_v); target.add(_v); n++; } }
    if (n) target.multiplyScalar(1 / n); else target.set(0, H * 0.6, 0);
    target.y += H * F.lift;
    aim(camera, target, H * F.radius, F.yaw, F.pitch ?? 0.12);
    return await shoot();
  } finally { scene.remove(actor.group); actor.dispose(); }
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      await new Promise(r => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 30)));   // one icon per breath
      try { const url = await draw(job.b); if (url) ready.set(job.b.id, url); job.res(url); } catch (e) { console.warn('wyrmroad: icon failed', job.b.id, e?.message); job.res(null); }
    }
  } finally { busy = false; }
}

/** The icon of an item's base, drawn from the model it puts on a body. Cached by base id. */
export function renderItemIcon(data, item, { size = PX } = {}) {
  const b = baseOf(data.items, item);
  if (!b) return Promise.resolve(null);
  if (!cache.has(b.id)) cache.set(b.id, new Promise(res => { queue.push({ b, res, size }); pump(); }));
  return cache.get(b.id);
}
/** Cached URL now, or null (and the drawing starts). */
export function itemIconUrl(data, item) {
  const b = baseOf(data.items, item); if (!b) return null;
  if (ready.has(b.id)) return ready.get(b.id);
  renderItemIcon(data, item);
  return null;
}
/** An <img> for an item when its icon is ready, else '' (and the drawing starts) — for one-off markup like toasts. */
export function itemIconHtml(data, item, px = 28) {
  const url = itemIconUrl(data, item);
  return url ? `<img class="wr-item-icon" src="${url}" width="${px}" height="${px}" alt="" decoding="async">` : '';
}
/** Swap the tinted svg in every [data-icon-base] element under root for the drawn icon (now, or when it is ready). */
export function paintItemIcons(root, data) {
  if (!root) return;
  for (const el of root.querySelectorAll('[data-icon-base]')) {
    const item = { base: el.dataset.iconBase, rarity: 'common', bonus: [] };
    const px = +(el.dataset.iconPx || 44);
    const put = url => {
      if (!url || !el.isConnected) return;
      const svg = el.querySelector('svg.ic'); if (!svg) return;
      const img = document.createElement('img'); img.className = 'wr-item-icon'; img.src = url; img.width = px; img.height = px; img.alt = ''; img.decoding = 'async';
      svg.replaceWith(img);
    };
    const now = itemIconUrl(data, item);
    if (now) put(now); else renderItemIcon(data, item).then(put);
  }
}
