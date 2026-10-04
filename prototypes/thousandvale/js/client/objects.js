// Things in the world you can walk up to and use, plus the arena objects of a boss fight.
//
//   room objects   kind:'object' entities with info.type portal / stairs / exit / chest   (protocol §10)
//   arena objects  `obj {id, state, type?, x?, z?, r?, key?, hp?, gone?}` events: brazier, lever, pillar,
//                  pool, rock (js/rules/encounter.js)
//
// Each gets a model from the kit, and the usable ones a pulsing gold ring on the ground and a soft glow so
// they stand out from the scenery ("environment highlights"). The nearest usable one within reach shows a
// prompt ("E  Enter the Barrow"); E sends `use {id}` and the server answers with `used` (or a handoff).

import * as THREE from 'three';
import { buildProp, buildRock } from '../../../../highdef-3d/js/kit/rocks.js';
import { makeGlowTexture } from './decor.js';

const REACH = 4;
const KINDS = {
  portal:  { prop: 'ruined_arch', glow: '#8f7dff', label: o => `Enter ${o.name || 'the dungeon'}`, use: true, scale: 1.2 },
  stairs:  { prop: 'stone_step', glow: '#ffd38a', label: o => o.name || 'Take the stairs', use: true, stack: 3 },
  exit:    { prop: 'ruined_arch', glow: '#7fe0a0', label: o => o.name || 'Leave the dungeon', use: true },
  chest:   { prop: 'crate', glow: '#ffcf4a', label: o => (o.opened ? 'Empty' : `Open ${o.name || 'the chest'}`), use: o => !o.opened, tint: '#c99a3a', scale: 1.25 },
  brazier: { prop: 'fire_ring', glow: '#ff9a3d', label: o => (o.state === 'lit' ? 'Burning' : 'Light the brazier'), use: o => o.state !== 'lit' },
  lever:   { prop: null, glow: '#ffd38a', label: o => (o.state === 'used' ? 'Pulled' : 'Pull the lever'), use: o => o.state !== 'used' },
  pillar:  { prop: 'ruined_pillar', glow: null, label: () => null, use: false },
  rock:    { prop: 'boulder', rock: true, glow: null, label: () => null, use: false },
  pool:    { prop: null, glow: '#7ee04a', label: () => null, use: false },
};

export function createObjects(scene, { heightAt = () => 0, onUse } = {}) {
  const items = new Map();       // id -> object
  const group = new THREE.Group(); group.name = 'objects'; scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
  const glowTex = makeGlowTexture();
  const geoCache = new Map();
  const geo = (id, rock) => { const k = id + (rock ? '#r' : ''); if (!geoCache.has(k)) { try { geoCache.set(k, rock ? buildRock(id, { seed: 3, lod: 1, size: 2 }).geometry : buildProp(id, { seed: 3, lod: 0 }).geometry); } catch { geoCache.set(k, null); } } return geoCache.get(k); };
  let ground = heightAt;
  let focus = null;
  const prompt = document.getElementById('interact');

  function model(o) {
    const K = KINDS[o.type] || {};
    const root = new THREE.Group();
    const g = K.prop ? geo(K.prop, K.rock) : null;
    if (g) {
      const n = K.stack || 1;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(g, K.tint ? mat.clone() : mat);
        if (K.tint) m.material.color.set(K.tint);
        m.position.set(0, i * 0.18, -i * 0.35); m.castShadow = m.receiveShadow = true;
        root.add(m);
      }
      root.scale.setScalar(K.scale || 1);
    } else if (o.type === 'lever') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.9 }));
      base.position.y = 0.17; root.add(base);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0), new THREE.MeshStandardMaterial({ color: '#8a8f99', metalness: 0.6, roughness: 0.4 }));
      arm.geometry.translate(0, 0.5, 0); arm.position.y = 0.3; arm.rotation.z = 0.6; root.add(arm); o.arm = arm;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial({ color: '#b03a2a' })); knob.position.y = 1.0; arm.add(knob);
    } else if (o.type === 'pool') {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(o.r || 3, 40), new THREE.MeshBasicMaterial({ color: K.glow, transparent: true, opacity: 0.45, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; root.add(disc);
    }
    if (K.glow) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: K.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      s.position.y = o.type === 'portal' || o.type === 'exit' ? 1.8 : 0.9; s.scale.setScalar(o.type === 'portal' ? 4.2 : 2.2);
      root.add(s); o.glow = s;
    }
    if (K.use) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: K.glow || '#ffd38a', transparent: true, opacity: 0.5, depthWrite: false }));
      ring.position.y = 0.07; ring.scale.setScalar(Math.max(1.1, (o.r || 1) + 0.6)); ring.renderOrder = 2; root.add(ring); o.ring = ring;
    }
    if (o.type === 'brazier') {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffb35a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      fl.position.y = 0.8; fl.scale.set(1.2, 1.8, 1); root.add(fl); o.flame = fl;
    }
    return root;
  }

  /** Add or update. `o` = { id, type, name?, x, z, yaw?, r?, state?, opened?, source: 'room'|'arena' }. */
  function upsert(o) {
    let cur = items.get(o.id);
    if (cur && o.type && cur.type !== o.type) { remove(o.id); cur = null; }
    if (!cur) {
      if (!o.type || o.x === undefined) return null;
      cur = { ...o, t: Math.random() * 6 };
      cur.root = model(cur);
      group.add(cur.root);
      items.set(o.id, cur);
    } else Object.assign(cur, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
    cur.root.position.set(cur.x, ground(cur.x, cur.z), cur.z);
    cur.root.rotation.y = cur.yaw || 0;
    if (cur.type === 'pillar') cur.root.visible = cur.state !== 'broken';
    return cur;
  }
  function remove(id) { const o = items.get(id); if (!o) return; group.remove(o.root); items.delete(id); if (focus === o) focus = null; }
  function clear() { for (const id of [...items.keys()]) remove(id); }

  /** `obj` event from an encounter. */
  function onObj(ev) {
    if (ev.gone) { remove(ev.id); return; }
    upsert({ id: ev.id, type: ev.type, x: ev.x, z: ev.z, r: ev.r, state: ev.state, hp: ev.hp, key: ev.key, source: 'arena' });
  }

  function usable(o) { const K = KINDS[o.type]; if (!K) return false; return typeof K.use === 'function' ? K.use(o) : !!K.use; }

  function update(dt, me) {
    let best = null, bd = Infinity;
    for (const o of items.values()) {
      o.t += dt;
      const K = KINDS[o.type] || {};
      const can = usable(o);
      if (o.ring) { o.ring.visible = can; o.ring.material.opacity = 0.32 + Math.sin(o.t * 3) * 0.16 + (o === focus ? 0.35 : 0); o.ring.rotation.y += dt * 0.4; }
      if (o.glow) o.glow.material.opacity = (can || !K.use ? 0.55 : 0.12) + Math.sin(o.t * 2.2) * 0.15 + (o === focus ? 0.25 : 0);
      if (o.flame) o.flame.visible = o.state === 'lit';
      if (o.arm) o.arm.rotation.z += ((o.state === 'used' ? -0.6 : 0.6) - o.arm.rotation.z) * Math.min(1, dt * 8);
      if (me && can) { const d = Math.hypot(o.x - me.x, o.z - me.z) - (o.r || 1) * 0.5; if (d < REACH && d < bd) { bd = d; best = o; } }
    }
    focus = best;
    if (prompt) {
      const text = best ? (KINDS[best.type]?.label(best) || '') : '';
      prompt.hidden = !text;
      if (text) prompt.querySelector('span').textContent = text;
    }
  }

  /** E pressed: use the focused object. */
  function useFocus() { if (focus && usable(focus)) { onUse?.(focus.id, focus); return true; } return false; }

  return {
    items, upsert, remove, clear, onObj, update, useFocus,
    get focus() { return focus; },
    setGround(f) { ground = f; for (const o of items.values()) o.root.position.y = ground(o.x, o.z); },
    markOpened(id) { const o = items.get(id); if (o) o.opened = true; },
  };
}
