// Gear icons from the 3D models (play-test P16). Each distinct picture (inv-core.js iconSpec key) is rendered
// ONCE on a small renderer of our own (never the game's), kept in memory as an object URL and in IndexedDB as a
// PNG blob (versioned; any storage error is ignored).
//
// NO FREEZES (play-test P1, D-world's profile: 3.3–4.1 s a icon from toDataURL right after joining): icons render
// only while the character window is OPEN (`iconsActive(true)`), ONE per idle period with a gap between them, at
// 96 px, with a cheap Lambert material; the read-back is drawImage into a small 2D canvas and the PNG encode is the
// async `toBlob`. Nothing is ever encoded with toDataURL. Boot reads the cache from IndexedDB asynchronously.
//
//   import { iconFor, onIcon } from './ui/item-icons.js';
//   const url = iconFor(item);            // a data URL now if cached, else null (rendering starts in the background)
//   onIcon(() => redraw());               // called each time a new icon is ready
//
// Weapons and off-hand pieces are built on their own from avatar-3d/js/chibi2-gear.js (the same builders the
// characters hold — the Bannerline icon forge's buildItemModel approach). Armour dresses a Chibi 2 body in the
// matching part and frames that part of the body. Rings, amulets, potions and junk are 2D glyphs.

import * as THREE from 'three';
import { buildHeld, buildOffhand } from '../../../../../avatar-3d/js/chibi2-gear.js';
import { iconSpec } from './inv-core.js';

const VERSION = 'v3';
const SIZE = 96, PX = SIZE;
const DB = 'tv-icons', OS = 'icons';
const mem = new Map();               // key -> object URL
const waiting = new Set();           // keys queued or rendering
const listeners = new Set();
let looks = null;                    // Farhold's heldLookFor / offhandLookFor (loaded once)
let lookLoad = null;

// ---- storage: IndexedDB, blobs keyed by VERSION + icon key (async; a private window just keeps memory) ----
// the old localStorage cache (big data: URLs parsed synchronously at boot) is removed once
try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('tv.icons.')) localStorage.removeItem(k); } } catch { /* blocked */ }
let dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise(res => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbP;
}
const cacheReady = (async () => {
  const d = await db(); if (!d) return;
  await new Promise(res => {
    try {
      const tx = d.transaction(OS, 'readonly'), st = tx.objectStore(OS), req = st.openCursor();
      req.onsuccess = () => { const c = req.result; if (!c) return res(); const k = String(c.key); if (k.startsWith(VERSION + ':') && c.value instanceof Blob) mem.set(k.slice(VERSION.length + 1), URL.createObjectURL(c.value)); c.continue(); };
      req.onerror = () => res();
    } catch { res(); }
  });
  if (mem.size) for (const fn of listeners) { try { fn(null); } catch {} }
})();
async function persist(key, blob) {
  const d = await db(); if (!d || !blob) return;
  try { d.transaction(OS, 'readwrite').objectStore(OS).put(blob, VERSION + ':' + key); } catch { /* quota / blocked */ }
}
const toBlobUrl = c => new Promise(res => c.toBlob(b => res(b ? { blob: b, url: URL.createObjectURL(b) } : null), 'image/png'));

export function onIcon(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function loadLooks() {
  if (!lookLoad) lookLoad = import('../../../../farhold/js/rpg.js').then(m => { looks = { held: m.heldLookFor, offhand: m.offhandLookFor }; }).catch(() => { looks = {}; });
  return lookLoad;
}
loadLooks();
export function specFor(item) { return iconSpec(item, looks || {}); }
/** The icon for an item: a data URL when ready, else null (and it is queued). */
export function iconFor(item) {
  if (!item) return null;
  const spec = specFor(item);
  if (!spec) return null;
  const hit = mem.get(spec.key);
  if (hit) return hit;
  if (!waiting.has(spec.key)) { waiting.add(spec.key); queue.push(spec); pump(); }
  return null;
}
export const iconStats = () => ({ cached: mem.size, waiting: waiting.size, active, slowest: Math.round(slowest), maxSync: Math.round(maxSync), spans: spans.slice() });
/** Render only while a window that shows icons is open (the bag). Off = the queue waits. */
let active = false, slowest = 0, maxSync = 0;
const spans = [];
const syncSpan = (t0, what = '') => { const d = performance.now() - t0; if (d > maxSync) maxSync = d; spans.push(what + ':' + Math.round(d)); if (spans.length > 40) spans.shift(); return d; };
export { syncSpan };
export function iconsActive(on) { active = !!on; if (active) pump(); }
export { cacheReady };

// ---- the render queue (one at a time, between frames) ----
const queue = [];
let busy = false;
const idle = () => new Promise(r => setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(r, { timeout: 600 }) : r()), 180));
async function pump() {
  if (busy || !queue.length || !active) return;
  busy = true;
  try {
    await Promise.all([loadLooks(), cacheReady]);
    while (queue.length && active) {
      await idle();                                   // one icon per idle period, with a gap: the game keeps its frames
      if (!active) break;
      const spec = queue.shift();
      if (mem.has(spec.key)) { waiting.delete(spec.key); continue; }
      const t0 = performance.now();
      let canvas = null;
      try { canvas = await render(spec); } catch (e) { console.warn('[icons]', spec.key, e.message); canvas = glyphCanvas({ kind: 'glyph', id: 'bundle', color: '#a08060' }); }
      slowest = Math.max(slowest, performance.now() - t0);
      const out = await toBlobUrl(canvas);           // async PNG encode, off the frame
      waiting.delete(spec.key);
      if (!out) continue;
      mem.set(spec.key, out.url); persist(spec.key, out.blob);
      for (const fn of listeners) { try { fn(spec.key); } catch {} }
    }
  } finally { busy = false; }
}

// ---- the stage ----
let R = null;
function stage() {
  if (R) return R;
  const canvas = document.createElement('canvas'); canvas.width = PX; canvas.height = PX;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1); renderer.setSize(PX, PX, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3028, 1.4));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-2.5, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(3, 2.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffc89a, 0.5); fill.position.set(3, 0.5, 3); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  R = { renderer, scene, camera, canvas };
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
function shoot() { const { renderer, scene, camera, canvas } = stage(); renderer.clear(); renderer.render(scene, camera); const c = canvas2d(PX); c.getContext('2d').drawImage(canvas, 0, 0); return c; }
function canvas2d(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function disposeTree(o) { o.traverse(c => { c.geometry?.dispose(); c.material?.dispose?.(); }); }

/** A weapon or off-hand piece built on its own from the Chibi 2 gear builders. */
function itemModel(spec) {
  const group = new THREE.Group(), cloth = [], metal = [];
  const held = spec.kind === 'held';
  const add = (geometry, bone, color, { position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], metal: isMetal = false } = {}) => {
    if (held && bone && !/hand|grip|elbow/.test(bone)) return;        // a bow's builder also hangs a quiver on the hips
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    const geo = geometry.clone(); geo.applyMatrix4(m);
    (isMetal ? metal : cloth).push([geo, color]);
  };
  const a = { held: { id: held ? spec.id : 'none', color: spec.color, quality: spec.quality ?? 1 }, offhand: { id: held ? 'none' : spec.id, color: spec.color, quality: spec.quality ?? 1 }, body: {} };
  const c = { add, trim: '#d9b477', leather: '#493c36', steel: '#c4d4d6', darkSteel: '#536a73', W: 1, T: 1, H: 1, A: 1, LW: 1, hipsZ: 0.13, rig: null };
  if (held) buildHeld(a, c); else buildOffhand(a, c);
  for (const [list, opts] of [[cloth, { roughness: 0.7, metalness: 0.05 }], [metal, { roughness: 0.32, metalness: 0.75 }]]) {
    for (const [geo, color] of list) {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      // Lambert: one cheap shader for every icon (compiled once); metal reads from a brighter emissive edge
      group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, emissive: new THREE.Color(color).multiplyScalar(opts.metalness > 0.5 ? 0.18 : 0.04) })));
    }
  }
  // weapons lie on the diagonal pointing up-right (hand space runs the blade along -y); a shield is built
  // facing -x on the forearm, so a quarter turn shows its face
  if (spec.id === 'bow' || spec.id === 'crossbow') { group.rotation.order = 'ZYX'; group.rotation.set(0, Math.PI / 2, Math.PI * 0.25); }
  else if (held) group.rotation.set(0, 0, Math.PI * 0.75);
  else group.rotation.set(0, Math.PI / 2, 0);
  return group;
}

let bodyLib = null;
function bodyModules() {
  if (!bodyLib) bodyLib = Promise.all([import('../../../../../avatar-3d/js/chibi2.js'), import('../looks.js')]).then(([c, l]) => ({ create: c.createChibi2Character, avatarFor: l.avatarFor }));
  return bodyLib;
}
const PART_FRAMES = {
  bust: { bones: ['head'], lift: 0.17, radius: 0.33, yaw: 0.35 },
  torso: { bones: ['chest'], lift: -0.02, radius: 0.2, yaw: 0.3, pitch: 0.05 },
  legs: { bones: ['kneeL', 'kneeR'], lift: 0.03, radius: 0.2, yaw: 0.45 },
  feet: { bones: ['footL', 'footR'], lift: 0.03, radius: 0.17, yaw: 0.7, pitch: 0.35 },
  hands: { bones: ['handR'], lift: 0, radius: 0.13, yaw: -0.9, pitch: 0.1 },
};
async function armourShot(spec) {
  const { create, avatarFor } = await bodyModules();
  const base = JSON.parse(JSON.stringify(await avatarFor({ race: 'human', cls: 'warrior', seed: 4242 })));
  // plain clothes everywhere, the piece in its slot, empty hands
  Object.assign(base, { hat: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' },
    top: { id: 'tunic', color: '#4a4038' }, bottom: { id: 'pants', color: '#3a3028' }, shoes: { id: 'boots', color: '#3a2a1e' } });
  base[spec.slot] = { id: spec.id, color: spec.color, ...(spec.color2 ? { color2: spec.color2 } : {}) };
  let t0 = performance.now();
  const actor = await create(base);
  syncSpan(t0, 'body');                             // (the body build: measured as one span, awaits included)
  await new Promise(r => setTimeout(r, 0));         // give the frame back between building and drawing
  t0 = performance.now();
  const { scene, camera } = stage();
  scene.add(actor.group);
  actor.setAnim?.('idle', 0); for (let i = 0; i < 4; i++) actor.update?.(0.15);
  actor.group.updateMatrixWorld(true);
  const F = PART_FRAMES[spec.frame] || PART_FRAMES.torso, H = actor.metrics().height;
  const target = new THREE.Vector3(); let n = 0;
  for (const b of F.bones) { const bone = actor.parts[b]; if (bone) { bone.getWorldPosition(_v); target.add(_v); n++; } }
  if (!n) { _box.setFromObject(actor.group); _box.getCenter(target); } else target.multiplyScalar(1 / n);
  target.y += H * F.lift;
  aim(camera, target, H * F.radius, F.yaw, F.pitch ?? 0.12);
  syncSpan(t0, 'pose');
  await new Promise(r => setTimeout(r, 0));         // and between posing and drawing
  t0 = performance.now();
  const shot = shoot();
  scene.remove(actor.group); actor.dispose();
  syncSpan(t0, 'armourShot');
  return shot;
}

async function render(spec) {
  if (spec.kind === 'glyph') return glyphCanvas(spec);
  let shot;
  if (spec.kind === 'armour') shot = await armourShot(spec);
  else {
    const t0 = performance.now();
    const { scene, camera } = stage();
    const obj = itemModel(spec);
    scene.add(obj); obj.updateMatrixWorld(true);
    _box.setFromObject(obj);
    const c = _box.getCenter(new THREE.Vector3()), size = _box.getSize(new THREE.Vector3());
    aim(camera, c, Math.max(size.x, size.y, size.z) * (spec.kind === 'offhand' ? 0.55 : 0.5), 0.25, 0.1);
    shot = shoot(); scene.remove(obj); disposeTree(obj);
    syncSpan(t0, spec.kind);
  }
  return finish(shot);
}

/** Transparent square with a soft shadow; the slot behind it carries the rarity colour. */
function finish(subject) {
  const c = canvas2d(SIZE), g = c.getContext('2d');
  g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = SIZE * 0.05; g.shadowOffsetY = SIZE * 0.02;
  g.drawImage(subject, 0, 0, SIZE, SIZE); g.restore();
  return c;
}

/** 2D pictures for things with no model: ring, amulet, potion, focus, junk, a bundle (a canvas). */
export function glyphCanvas(spec) {
  const c = canvas2d(SIZE), g = c.getContext('2d'), s = SIZE / 128, col = spec.color || '#d0a040';
  g.save(); g.translate(SIZE / 2, SIZE / 2); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  if (spec.id === 'ring') {
    g.strokeStyle = col; g.lineWidth = 11; g.beginPath(); g.ellipse(0, 10, 30, 24, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.beginPath(); g.ellipse(-2, 6, 30, 24, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
    g.fillStyle = '#9fe0ff'; g.strokeStyle = '#f4f0e0'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -38); g.lineTo(15, -22); g.lineTo(0, -8); g.lineTo(-15, -22); g.closePath(); g.fill(); g.stroke();
  } else if (spec.id === 'amulet') {
    g.strokeStyle = '#c8b070'; g.lineWidth = 4; g.beginPath(); g.moveTo(-34, -46); g.quadraticCurveTo(0, 10, 34, -46); g.stroke();
    g.fillStyle = '#d9b477'; g.beginPath(); g.arc(0, 12, 24, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(0, 12, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(-5, 6, 5, 0, Math.PI * 2); g.fill();
  } else if (spec.id === 'potion') {
    g.fillStyle = '#d8e4ea33'; g.strokeStyle = '#e8eef2'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-12, -40); g.lineTo(12, -40); g.lineTo(12, -18); g.bezierCurveTo(40, -6, 40, 44, 0, 44); g.bezierCurveTo(-40, 44, -40, -6, -12, -18); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(-31, 8); g.bezierCurveTo(-30, 44, 30, 44, 31, 8); g.bezierCurveTo(10, 14, -10, 2, -31, 8); g.fill();
    g.fillStyle = '#8a5a2a'; g.fillRect(-14, -50, 28, 12);
  } else if (spec.id === 'focus') {
    g.fillStyle = col; g.beginPath(); g.arc(0, -6, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(-9, -16, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6a4a2a'; g.fillRect(-20, 24, 40, 14);
  } else {
    // a tied cloth bundle (junk is greyer)
    g.fillStyle = spec.id === 'junk' ? '#6a6460' : col; g.beginPath(); g.moveTo(-36, 34); g.quadraticCurveTo(-44, -10, -8, -22); g.lineTo(8, -22); g.quadraticCurveTo(44, -10, 36, 34); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#d9b477'; g.fillRect(-14, -30, 28, 9);
  }
  g.restore();
  return c;
}
