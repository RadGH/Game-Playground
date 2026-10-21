// Chibi 2 — a flame on a held torch (owner review 2026-10-21, W10).
//
// The torch and the cresset lost their pointed flame cones: the model is now a rounded, rag-bound head (chibi2-gear.js
// `torch`, chibi2-gear5-offhand.js `g5_cresset`, KIT.rag in chibi2-weapons.js), and the FIRE is this — a few additive
// sprites that flicker, parented to the grip bone that carries the torch, so it goes wherever the hand goes and vanishes
// with the hand when a clip puts the hands away (the grip scales to nothing).
//
// Cheap on purpose (see the playground memory note on shader recompiles):
//   * no light: adding or toggling a light changes every lit material's light count and recompiles them all. A game that
//     wants the torch to light the ground keeps ONE light of its own and moves it (Farhold's js/light.js does).
//   * one shared texture, one shared material per colour, made once; nothing is created, disposed or switched per frame.
//     `update(dt)` only moves and scales three sprites.
//
//   import { attachHeldFlame } from '../../avatar-3d/js/held-flame.js';
//   const flame = attachHeldFlame(actor, avatar);        // null when nothing in the hands burns
//   ...each frame: flame?.update(dt);
//   ...when the look changes or the actor goes: flame?.dispose();
import * as THREE from 'three';
import { offhandAllowed } from './chibi2-weapon-ids.js';

/**
 * Where each burning thing's flame sits, in its GRIP bone's own space (the palm is the origin; the torch runs out
 * along -y). Measured off the models: the torch's rag head is centred 0.415 below the palm, the cresset's 0.435.
 */
export const HELD_FLAME_AT = {
  torch: { bone: 'gripL', at: [0, -0.43, 0], size: 1 },
  g5_cresset: { bone: 'gripL', at: [0, -0.46, 0], size: 1.15 },
};

/** The flame a look needs (`{ id, bone, at, size, color }`), or null. Off-hand only; the two-handed rule applies. */
export function heldFlameSpot(avatar) {
  const id = avatar?.offhand?.id;
  const spot = HELD_FLAME_AT[id];
  if (!spot || !offhandAllowed(avatar?.held?.id, id)) return null;
  const c = avatar.offhand.color;
  return { id, ...spot, color: c && c !== '#9aa3ad' ? c : '#ff8c2a' };
}

let texture = null;
const materials = new Map();
function flameTexture() {
  if (texture) return texture;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 38, 2, 32, 34, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.75)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function material(color) {
  if (!materials.has(color)) {
    materials.set(color, new THREE.SpriteMaterial({ map: flameTexture(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
  }
  return materials.get(color);
}

/**
 * A free-standing flame: `{ object, update(dt), dispose() }`. `object` stands up the WORLD's +y whatever it is parented
 * to (update() cancels the parent's turn), its base at the object's origin. `size` 1 is a torch flame (~0.17 tall in
 * Chibi 2 body units). Materials and the texture are shared and kept for the page's life; dispose() only detaches.
 */
export function createHeldFlame({ color = '#ff8c2a', size = 1, seed = Math.random() * 100 } = {}) {
  const object = new THREE.Group(); object.name = 'held-flame';
  const outer = new THREE.Color(color), core = outer.clone().lerp(new THREE.Color('#fff2c0'), 0.7);
  const parts = [
    { s: new THREE.Sprite(material('#' + outer.getHexString())), w: 0.15, h: 0.2, y: 0.07, f: 7.3 },
    { s: new THREE.Sprite(material('#' + core.getHexString())), w: 0.08, h: 0.12, y: 0.045, f: 11.1 },
    { s: new THREE.Sprite(material('#' + outer.clone().lerp(new THREE.Color('#ff3a10'), 0.4).getHexString())), w: 0.06, h: 0.09, y: 0.15, f: 13.7 },
  ];
  for (const p of parts) { p.s.renderOrder = 10; object.add(p.s); }
  const q = new THREE.Quaternion();
  let t = seed;
  function update(dt = 0) {
    t += dt;
    for (const [i, p] of parts.entries()) {
      const k = 1 + Math.sin(t * p.f + i) * 0.12 + Math.sin(t * p.f * 1.7 + i * 2) * 0.08;
      p.s.scale.set(p.w * size * (2 - k), p.h * size * k, 1);
      p.s.position.set(Math.sin(t * p.f * 0.6 + i) * 0.008 * size, p.y * size * k, 0);
    }
    // stand up the world's +y: undo the parent's world turn
    if (object.parent) { object.parent.getWorldQuaternion(q); object.quaternion.copy(q.invert()); }
  }
  update(0);
  return { object, update, dispose() { object.removeFromParent(); } };
}

/**
 * Put a flame on whatever burns in a Chibi 2 actor's hands. `avatar` is the look the actor was built from.
 * Returns the flame (`update(dt)` each frame, `dispose()` when the look changes) or null when nothing burns.
 */
export function attachHeldFlame(actor, avatar, opts = {}) {
  const spot = heldFlameSpot(avatar), bone = spot && actor?.parts?.[spot.bone];
  if (!bone) return null;
  const flame = createHeldFlame({ color: opts.color || spot.color, size: (opts.size || 1) * spot.size });
  flame.object.position.set(...spot.at);
  bone.add(flame.object);
  flame.update(0);
  return flame;
}
