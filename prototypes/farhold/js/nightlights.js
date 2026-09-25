// Farhold R25 — people carry lights at night.
//
//   "At night time things get dark. Make it so NPCs and some humanoid enemies are carrying their own
//    light sources."
//
// A torch is a stick and a flame hung on the body's LEFT HAND BONE — a Chibi 2 bone is an ordinary
// Object3D, so a mesh added under it follows every swing of the arm with no rebuild of the body and
// no change to its look. Each lit torch is also handed to js/light.js as a SOURCE, so the few nearest
// actually throw light on the ground (the pool decides how many; a torch has `priority` 2 so it wins
// a slot over a far-off brazier but not over a spell going off in your face).
//
// Who carries one: every road wanderer, most townsfolk (guards always), and about a third of the
// humanoid enemies — never a beast, and never a hand that already holds a shield or a second weapon.
// The choice is a hash of the body's id, so the same person carries a torch every night.

import * as THREE from 'three';

const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

export function createNightLights() {
  const stick = new THREE.CylinderGeometry(0.018, 0.024, 0.42, 6);
  const flame = new THREE.ConeGeometry(0.07, 0.2, 7);
  const wood = new THREE.MeshLambertMaterial({ color: '#5a3a1a' });
  const fire = new THREE.MeshBasicMaterial({ color: '#ffae4a', toneMapped: false });
  const lit = new Map();          // actor -> { group, key }
  const tmp = new THREE.Vector3();

  function torchFor() {
    const g = new THREE.Group();
    g.name = 'carried-torch';
    const s = new THREE.Mesh(stick, wood); s.position.y = 0.21; g.add(s);
    const f = new THREE.Mesh(flame, fire); f.position.y = 0.48; g.add(f);
    // held in the fist, leaning forward and up (hand space: +z forward, +y up the forearm)
    g.position.set(0, -0.04, 0.06);
    g.rotation.set(0.95, 0, 0);
    g.scale.setScalar(1.6);
    return g;
  }

  /** Who should be carrying a light right now. `bodies` is [{ key, actor, kind }]. */
  function wants(b) {
    if (!b.actor || b.actor.beast || !b.actor.parts?.handL) return false;
    const left = b.actor.hold?.left;
    if (left && left !== 'none' && left !== 'torch') return false;
    const r = hash(b.key);
    if (b.kind === 'wanderer') return true;
    if (b.kind === 'guard') return true;
    if (b.kind === 'townsfolk') return r < 0.7;
    if (b.kind === 'enemy') return r < 0.35;
    return false;
  }

  /**
   * One pass. `night` is 0..1 (1 = full dark). Torches go on at dusk and come off at dawn; the flame
   * wobbles a little so a row of them does not pulse together.
   */
  function update(bodies, night, t = 0) {
    const on = night > 0.25;
    const seen = new Set();
    if (on) for (const b of bodies) {
      if (!wants(b)) continue;
      seen.add(b.actor);
      let rec = lit.get(b.actor);
      if (!rec) {
        const group = torchFor();
        b.actor.parts.handL.add(group);
        rec = { group, key: b.key };
        lit.set(b.actor, rec);
      }
      const f = rec.group.children[1];
      f.scale.setScalar(0.9 + Math.sin(t * 11 + hash(b.key) * 40) * 0.08 + Math.sin(t * 17.3) * 0.04);
    }
    for (const [actor, rec] of lit) {
      if (seen.has(actor)) continue;
      rec.group.parent?.remove(rec.group);
      lit.delete(actor);
    }
  }

  /** Light sources for js/light.js — one per carried torch, at the flame. */
  function sources(max = 8) {
    const out = [];
    for (const [, rec] of lit) {
      if (!rec.group.parent) continue;
      rec.group.children[1].getWorldPosition(tmp);
      out.push({ x: tmp.x, y: tmp.y + 0.2, z: tmp.z, color: '#ffa04a', range: 13, intensity: 1.7, priority: 2 });
      if (out.length >= max) break;
    }
    return out;
  }

  function clear() { for (const [, rec] of lit) rec.group.parent?.remove(rec.group); lit.clear(); }

  return { update, sources, clear, get count() { return lit.size; } };
}
