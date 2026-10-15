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
// Play-test 8 (W25, report #46 — "the War Helm's icon is a knight's helm, the model on my character is a gold dome with
// horns"): the icon is now drawn from THE worn model and nothing else. inv-core.js iconSpec asks gear-look.js
// `wornPart(item, slot, gearOpts(cls))` — the very call that dresses the bodies in the world, with the same options
// (item bases, the wearer's class kit, armour themes, stream F's gear catalog). Farhold's look tables are no longer read.
//   weapons, shields, foci   built on their own by the same builders the hands hold (chibi2-gear.js; chibi2-gear5.js for g5_)
//   armour, cloaks, packs, belts, torcs, catalog rings   a plain Chibi 2 body wearing exactly the item's parts, framed on them
//   potions, food, goods, materials, fish, junk, amulets, foci   drawn SVG art from icons/js/game-icons.js (2026-10-14)
//   a ring the catalog does not draw                              a 2D glyph in the ring's own colours
// Nothing is drawn until the look data has loaded (an icon made without the catalog would be the wrong picture, cached).

import * as THREE from 'three';
import { buildHeld, buildOffhand } from '../../../../../avatar-3d/js/chibi2-gear.js';
import { G5_WEAPON_BUILDERS, G5_OFFHAND_BUILDERS } from '../../../../../avatar-3d/js/chibi2-gear5.js';
import { isG5, G5_HELD, G5_OFFHAND } from '../../../../../avatar-3d/js/chibi2-gear5-ids.js';
import { iconSpec, slotOf } from './inv-core.js';
import { itemIconUrl, itemArtKey } from '../../../../../icons/js/game-icons.js';
import { wornPart } from '../gear-look.js';
import { gearOpts, lookDataReady, loadLookData } from '../looks.js';

const VERSION = 'v5';      // v5 (2026-10-14): armour is worn by a plain mannequin, not a person; potions/goods are drawn art (v4: the worn model)
const SIZE = 96, PX = SIZE;
const DB = 'tv-icons', OS = 'icons';
const mem = new Map();               // key -> object URL
const waiting = new Set();           // keys queued or rendering
const listeners = new Set();
let ctx = { cls: () => null };       // whose class kit a rare chest piece wears (the viewer's own: it is their body the icon stands for)
/** bag.js: tell the icons whose class to dress tier-2 armour as. */
export function setIconContext(c = {}) { ctx = { ...ctx, ...c }; }

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
/** The look data the bodies use (bases, class kits, themes, the gear catalog). Icons wait for it. */
let lookLoad = null;
export function loadLooks() {
  if (!lookLoad) lookLoad = Promise.resolve().then(() => loadLookData()).catch(() => null).then(() => { for (const fn of listeners) { try { fn('looks'); } catch {} } });
  return lookLoad;
}
/** The one question both the icon and the body ask (W25). */
export const wornFor = (item, slot) => wornPart(item, slot, gearOpts(ctx.cls?.() || null));
export function specFor(item) { return iconSpec(item, { worn: wornFor }); }
/** The icon for an item: a data URL when ready, else null (and it is queued). */
export function iconFor(item) {
  if (!item) return null;
  if (!slotOf(item)) { const art = itemArtKey(item); if (art) return itemIconUrl(art); }   // drawn art needs no look data
  if (!lookDataReady()) { loadLooks(); return null; }      // the catalog decides the picture: no guess before it is here
  const spec = specFor(item);
  if (!spec) return null;
  if (spec.kind === 'art') return itemIconUrl(spec.id);           // a drawn picture: ready at once, nothing to render or cache
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
/** Each window that shows icons says so (bag, loot, shop, trade — play-test 2): the queue runs while ANY is open. */
const owners = new Set();
export function iconsActive(on, who = 'bag') { if (on) owners.add(who); else owners.delete(who); active = owners.size > 0; if (active) pump(); }
export { cacheReady };

// ---- the render queue (one at a time, between frames) ----
const queue = [];
let busy = false;
const idle = () => new Promise(r => setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(r, { timeout: 600 }) : r()), 180));
let stageTail = Promise.resolve();
/** One subject on the stage at a time: resolves with a release function. */
function lockStage() { let rel; const next = new Promise(r => { rel = r; }); const prev = stageTail; stageTail = prev.then(() => next); return prev.then(() => rel); }
const IN_FLIGHT = 3;                               // icons whose GPU read-back is still on its way (none of them blocks)
let inflight = 0;
async function one(spec) {
  const t0 = performance.now();
  let canvas = null;
  try { canvas = await render(spec); } catch (e) { console.warn('[icons]', spec.key, e.message); canvas = glyphCanvas({ kind: 'glyph', id: 'bundle', color: '#a08060' }); }
  slowest = Math.max(slowest, performance.now() - t0);
  const out = await toBlobUrl(canvas);             // async PNG encode, off the frame
  waiting.delete(spec.key);
  if (!out) return;
  mem.set(spec.key, out.url); persist(spec.key, out.blob);
  for (const fn of listeners) { try { fn(spec.key); } catch {} }
}
async function pump() {
  if (busy || !queue.length || !active) return;
  busy = true;
  try {
    await Promise.all([loadLooks(), cacheReady]);
    while (queue.length && active) {
      await idle();                                   // one icon per idle period, with a gap: the game keeps its frames
      if (!active) break;
      while (inflight >= IN_FLIGHT) await new Promise(r => setTimeout(r, 60));
      const spec = queue.shift();
      if (!spec) break;
      if (mem.has(spec.key)) { waiting.delete(spec.key); continue; }
      inflight++;
      one(spec).finally(() => { inflight--; });
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
/**
 * Draw the stage and read it back WITHOUT blocking (play-test 2): a pixel-pack buffer + a fence, collected on a later tick.
 * drawImage of a WebGL canvas waits for the GPU to finish — on a software renderer that alone was ~100 ms an icon.
 * Returns a promise of a 2D canvas; the scene may be cleared as soon as this returns (the read is already queued).
 */
function shoot() {
  const { renderer, scene, camera } = stage(); renderer.clear(); renderer.render(scene, camera);
  const g = renderer.getContext();
  if (typeof WebGL2RenderingContext === 'undefined' || !(g instanceof WebGL2RenderingContext)) { const c = canvas2d(PX); c.getContext('2d').drawImage(stage().canvas, 0, 0); return Promise.resolve(c); }
  const buf = new Uint8Array(PX * PX * 4), pbo = g.createBuffer();
  g.bindBuffer(g.PIXEL_PACK_BUFFER, pbo); g.bufferData(g.PIXEL_PACK_BUFFER, buf.length, g.STREAM_READ);
  g.readPixels(0, 0, PX, PX, g.RGBA, g.UNSIGNED_BYTE, 0); g.bindBuffer(g.PIXEL_PACK_BUFFER, null);
  const fence = g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE, 0); g.flush();
  return (async () => {
    for (let i = 0; i < 400; i++) { if (g.clientWaitSync(fence, 0, 0) !== g.TIMEOUT_EXPIRED) break; await new Promise(r => setTimeout(r, 40)); }
    g.deleteSync(fence);
    const t0 = performance.now();
    g.bindBuffer(g.PIXEL_PACK_BUFFER, pbo); g.getBufferSubData(g.PIXEL_PACK_BUFFER, 0, buf); g.bindBuffer(g.PIXEL_PACK_BUFFER, null); g.deleteBuffer(pbo);
    const c = canvas2d(PX), img = new ImageData(PX, PX), row = PX * 4;
    for (let y = 0; y < PX; y++) img.data.set(buf.subarray((PX - 1 - y) * row, (PX - y) * row), y * row);
    c.getContext('2d').putImageData(img, 0, 0);
    syncSpan(t0, 'readback');
    return c;
  })();
}
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
  // the catalog's models (g5_) have builders of their own; a weapon worn in the off hand is still a weapon
  const part = spec.part || { id: spec.id, color: spec.color, quality: spec.quality ?? 1 };
  if (isG5(spec.id)) {
    if (held || (G5_HELD[spec.id] && !G5_OFFHAND[spec.id])) { a.held = { ...part }; a.offhand = { id: 'none' }; G5_WEAPON_BUILDERS[spec.id]?.(c, part.color || '#c8ccd6', part.quality ?? 0, a, a.held); }
    else { a.offhand = { ...part }; G5_OFFHAND_BUILDERS[spec.id]?.(c, part.color || G5_OFFHAND[spec.id]?.color || '#9aa3ad', part.quality ?? 0, a, a.offhand); }
  } else if (held) { a.held = { ...a.held, ...part }; buildHeld(a, c); }
  else { a.offhand = { ...a.offhand, ...part }; buildOffhand(a, c); if (!cloth.length && !metal.length) { a.held = { ...part }; a.offhand = { id: 'none' }; buildHeld(a, c); } }      // a second weapon in the off hand
  if (!cloth.length && !metal.length) throw new Error('no model for ' + spec.id);
  for (const [list, opts] of [[cloth, { roughness: 0.7, metalness: 0.05 }], [metal, { roughness: 0.32, metalness: 0.75 }]]) {
    for (const [geo, color] of list) {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      // Lambert: one cheap shader for every icon (compiled once); metal reads from a brighter emissive edge
      group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, emissive: new THREE.Color(color).multiplyScalar(opts.metalness > 0.5 ? 0.18 : 0.04) })));
    }
  }
  // weapons lie on the diagonal pointing up-right (hand space runs the blade along -y); a shield is built
  // facing -x on the forearm, so a quarter turn shows its face
  if (spec.id === 'bow' || spec.id === 'crossbow' || G5_HELD[spec.id]?.bow) { group.rotation.order = 'ZYX'; group.rotation.set(0, Math.PI / 2, Math.PI * 0.25); }
  else if (held) group.rotation.set(0, 0, Math.PI * 0.75);
  else group.rotation.set(0, Math.PI / 2, 0);
  return group;
}

let bodyLib = null;
function bodyModules() {
  if (!bodyLib) bodyLib = Promise.all([import('../../../../../avatar-3d/js/chibi2.js'), import('../looks.js')]).then(([c, l]) => ({ create: a => c.createChibi2Character(a, { mannequin: true }), avatarFor: l.avatarFor }));
  return bodyLib;
}
/** The dummy's one colour: a pale matte ash, light enough that dark leather reads and dull enough that steel still shines. */
const MANNEQUIN = '#b9b2a6';
const PART_FRAMES = {
  bust: { bones: ['head'], lift: 0.17, radius: 0.33, yaw: 0.35 },
  torso: { bones: ['chest'], lift: -0.02, radius: 0.2, yaw: 0.3, pitch: 0.05 },
  legs: { bones: ['kneeL', 'kneeR'], lift: 0.03, radius: 0.2, yaw: 0.45 },
  feet: { bones: ['footL', 'footR'], lift: 0.03, radius: 0.17, yaw: 0.7, pitch: 0.35 },
  hands: { bones: ['handR'], lift: 0, radius: 0.13, yaw: -0.9, pitch: 0.1 },
  back: { bones: ['chest'], lift: -0.06, radius: 0.34, yaw: Math.PI - 0.5, pitch: 0.1 },       // a cloak or a pack: from behind
  waist: { bones: ['hips'], lift: 0.02, radius: 0.19, yaw: 0.35, pitch: 0.05 },
  neck: { bones: ['chest'], lift: 0.1, radius: 0.13, yaw: 0.2, pitch: 0.1 },
  ring: { bones: ['handR'], lift: 0, radius: 0.075, yaw: -1.2, pitch: 0.35 },
  carry: { bones: ['chest'], lift: -0.08, radius: 0.5, yaw: 0.45, pitch: 0.08 },
};
async function armourShot(spec) {
  const { create, avatarFor } = await bodyModules();
  const base = JSON.parse(JSON.stringify(await avatarFor({ race: 'human', cls: 'warrior', seed: 4242 })));
  // 2026-10-14 (owner: "a solid texture more like a mannequin… it should not feature random characters"): a shop dummy —
  // one matte colour for skin and the plain clothes under the piece, a bald carved head (chibi2 `mannequin` paints the
  // face the body's colour), no beard or marks. Only the item keeps its own colours.
  Object.assign(base, { hat: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' },
    hair: { ...(base.hair || {}), id: 'bald' }, facialHair: { id: 'none' }, extras: { id: 'none' },
    top: { id: 'tunic', color: MANNEQUIN }, bottom: { id: 'pants', color: MANNEQUIN }, shoes: { id: 'boots', color: MANNEQUIN } });
  base.body = { ...(base.body || {}), skin: MANNEQUIN };
  // exactly the parts the item puts on a body (W25): the same objects gearLook() hands the world's bodies
  for (const [k, v] of Object.entries(spec.parts || {})) base[k] = JSON.parse(JSON.stringify(v));
  let t0 = performance.now();
  const actor = await create(base);
  syncSpan(t0, 'body');                             // (the body build: measured as one span, awaits included)
  await new Promise(r => setTimeout(r, 0));         // give the frame back between building and drawing
  const release = await lockStage();               // the shared stage holds one subject at a time (several icons are in flight)
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
  const shot = shoot();                           // queued read-back: the body can go now
  scene.remove(actor.group); actor.dispose();
  release();
  syncSpan(t0, 'armourShot');
  return await shot;
}

async function render(spec) {
  if (spec.kind === 'glyph') return glyphCanvas(spec);
  let shot;
  if (spec.kind === 'worn') shot = await armourShot(spec);
  else {
    // built BEFORE the stage is taken: a piece with no model of its own is shown in the hand of a body instead
    let obj = null;
    try { obj = itemModel(spec); } catch { return finish(await armourShot({ frame: 'carry', parts: { [spec.kind === 'held' ? 'held' : 'offhand']: spec.part } })); }
    const release = await lockStage();
    const t0 = performance.now();
    const { scene, camera } = stage();
    scene.add(obj); obj.updateMatrixWorld(true);
    _box.setFromObject(obj);
    const c = _box.getCenter(new THREE.Vector3()), size = _box.getSize(new THREE.Vector3());
    aim(camera, c, Math.max(size.x, size.y, size.z) * (spec.kind === 'offhand' ? 0.55 : 0.5), 0.25, 0.1);
    const p = shoot(); scene.remove(obj); disposeTree(obj);
    release();
    syncSpan(t0, spec.kind);
    shot = await p;
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

/** A hex colour lightened (t > 0, towards white) or darkened (t < 0, towards black). */
function shade(hex, t) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
  const n = parseInt(m[1], 16), to = t > 0 ? 255 : 0, k = Math.abs(t);
  const ch = sh => Math.round(((n >> sh) & 255) + (to - ((n >> sh) & 255)) * k);
  return '#' + [16, 8, 0].map(sh => ch(sh).toString(16).padStart(2, '0')).join('');
}
/** 2D pictures for things with no model: ring, amulet, potion, focus, junk, a bundle (a canvas). */
export function glyphCanvas(spec) {
  const c = canvas2d(SIZE), g = c.getContext('2d'), s = SIZE / 128, col = spec.color || '#d0a040';
  g.save(); g.translate(SIZE / 2, SIZE / 2); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  if (spec.id === 'ring') {
    // Y6 (play-test 10): the ring itself — a band seen a little from above, so the loop reads as a loop, with its
    // bezel and stone on top. Band = the model's metal, stone = the model's stone (the same two colours the hand wears).
    const stone = spec.color2 || '#9fe0ff';
    const band = (rx, ry, lw, style) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); g.ellipse(0, 14, rx, ry, 0, 0, Math.PI * 2); g.stroke(); };
    band(34, 27, 15, shade(col, -0.45));                                         // the dark outside edge
    band(34, 27, 11, col);                                                        // the metal
    g.shadowColor = 'transparent';
    g.strokeStyle = shade(col, -0.3); g.lineWidth = 4; g.beginPath(); g.ellipse(0, 16, 27, 20, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();      // inside of the loop, far side in shadow
    g.strokeStyle = shade(col, 0.5); g.lineWidth = 3.5; g.beginPath(); g.ellipse(-1, 12, 35, 28, 0, Math.PI * 1.08, Math.PI * 1.42); g.stroke();   // a glint on the near shoulder
    g.strokeStyle = shade(col, 0.3); g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, 14, 34, 27, 0, Math.PI * 0.2, Math.PI * 0.42); g.stroke();
    // the bezel: a small collar where the band passes over the top, and the cut stone in it
    g.fillStyle = shade(col, -0.2); g.strokeStyle = shade(col, -0.5); g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-17, -6); g.lineTo(17, -6); g.lineTo(13, -20); g.lineTo(-13, -20); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = stone; g.strokeStyle = shade(stone, -0.5); g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -46); g.lineTo(16, -32); g.lineTo(11, -17); g.lineTo(-11, -17); g.lineTo(-16, -32); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = shade(stone, 0.45); g.beginPath(); g.moveTo(0, -46); g.lineTo(16, -32); g.lineTo(0, -30); g.lineTo(-16, -32); g.closePath(); g.fill();   // the crown facet catches the light
    g.strokeStyle = shade(stone, -0.35); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -17); g.moveTo(-16, -32); g.lineTo(16, -32); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(-6, -37, 2.6, 0, Math.PI * 2); g.fill();
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
