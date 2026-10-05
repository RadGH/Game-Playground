// One fixed set of point lights for the whole page — the fix for the shader-recompile freeze (P1).
//
// three.js compiles every lit material for the number of VISIBLE lights in the scene. Adding a PointLight
// (a campfire coming into view, a zone with a town loading, a dungeon), removing one, or flipping its
// `visible` recompiles every material on screen: hundreds of milliseconds to seconds, the "comes and goes
// while walking" freeze the owner reported. Farhold hit the same thing (memory: threejs-shader-recompile-stutter).
//
// So the scene gets `count` PointLights once, at boot, always visible. Anything that wants light registers a
// SOURCE (a position, colour, strength, reach); a few times a second the pool hands its real lights to the
// sources nearest the camera, and unused lights sit at intensity 0. The light count never changes, so nothing
// ever recompiles.
//
//   import { LIGHTS } from './lightpool.js'
//   LIGHTS.attach(scene, { count: 8 })                     // main.js, once
//   const h = LIGHTS.add({ x, y, z, color, intensity, distance, decay, flicker, follow, owner })
//   h.intensity = 0                                        // dim it (0 = never picked)
//   h.remove()
//   LIGHTS.update(dt, cameraPosition)                      // every frame
//
// `follow`: an Object3D the light rides (offset by x/y/z in its space); `owner`: an Object3D whose visibility
// (and its parents') gates the source — a hidden zone or a dungeon left behind never steals a light.

import * as THREE from 'three';

/** Drawn: visible all the way up AND attached to a scene (a group taken out of the scene lights nothing). */
function shown(o) { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p.isScene) return true; } return false; }

export function createLightPool() {
  const sources = new Set();
  const real = [];
  let scene = null, t = 0, pickAt = 0;
  const _v = new THREE.Vector3();

  function attach(sc, { count = 8 } = {}) {
    if (scene) return;
    scene = sc;
    for (let k = 0; k < count; k++) {
      const l = new THREE.PointLight('#ffb862', 0, 12, 1.6);
      l.name = 'pool-light-' + k; l.castShadow = false; l.userData.src = null;
      sc.add(l); real.push(l);
    }
  }

  function add(o) {
    const h = {
      x: o.x || 0, y: o.y || 0, z: o.z || 0, color: new THREE.Color(o.color || '#ffae5c'), intensity: o.intensity ?? 8,
      distance: o.distance ?? 10, decay: o.decay ?? 1.6, flicker: o.flicker || 0, follow: o.follow || null, owner: o.owner || null,
      phase: Math.random() * 10, world: new THREE.Vector3(),
      remove() { sources.delete(h); for (const l of real) if (l.userData.src === h) { l.userData.src = null; l.intensity = 0; } },
      set(p) { Object.assign(h, p); if (p.color) h.color = new THREE.Color(p.color); return h; },
    };
    sources.add(h);
    pickAt = 0;
    return h;
  }

  // transient sources (spell effects in flight: SpellFx#lights) are re-offered every frame
  const transient = [];
  for (let k = 0; k < 3; k++) transient.push(Object.assign(add({ intensity: 0, distance: 8 }), { transient: true }));
  function setTransient(list = []) {
    for (let k = 0; k < transient.length; k++) {
      const h = transient[k], L = list[k];
      if (!L) { if (h.intensity) { h.intensity = 0; pickAt = 0; } continue; }
      h.x = L.x; h.y = L.y; h.z = L.z; h.color.set(L.color); h.distance = L.range || 8; h.decay = 1.4;
      if (!(h.intensity > 0.01)) pickAt = 0;
      h.intensity = L.intensity ?? 6;
    }
  }

  function worldOf(h) {
    if (h.follow) { _v.set(h.x, h.y, h.z); h.follow.localToWorld(_v); h.world.copy(_v); }
    else h.world.set(h.x, h.y, h.z);
    return h.world;
  }

  function update(dt, cam) {
    t += dt;
    if (!scene || !cam) return;
    if (t >= pickAt) {
      pickAt = t + 0.3;
      const live = [];
      for (const h of sources) {
        if (!(h.intensity > 0.01)) continue;
        if ((h.follow && !shown(h.follow)) || (h.owner && !shown(h.owner))) continue;
        const w = worldOf(h);
        const d = Math.hypot(w.x - cam.x, w.y - cam.y, w.z - cam.z);
        if (d > h.distance + 60) continue;
        live.push([d, h]);
      }
      live.sort((a, b) => a[0] - b[0]);
      // keep a light on the source it already lights when that source is still wanted (no popping)
      const want = new Set(live.slice(0, real.length).map(e => e[1]));
      const free = [];
      for (const l of real) { if (l.userData.src && want.has(l.userData.src)) want.delete(l.userData.src); else { l.userData.src = null; free.push(l); } }
      for (const h of want) { const l = free.pop(); if (!l) break; l.userData.src = h; }
      for (const l of free) { l.intensity = 0; }
    }
    for (const l of real) {
      const h = l.userData.src;
      if (!h) { l.intensity = 0; continue; }
      if (h.follow) worldOf(h);
      l.position.copy(h.world);
      if (!l.color.equals(h.color)) l.color.copy(h.color);
      l.distance = h.distance; l.decay = h.decay;
      l.intensity = h.intensity * (h.flicker ? 1 - h.flicker + Math.sin(t * 11 + h.phase) * h.flicker * 0.6 + Math.sin(t * 23 + h.phase * 2) * h.flicker * 0.4 : 1);
    }
  }

  return {
    attach, add, update, setTransient, sources, lights: real,
    stats: () => ({ lights: real.length, sources: sources.size, lit: real.filter(l => l.userData.src).length }),
    clear() { for (const h of [...sources]) h.remove(); },
  };
}

/** The page's one pool. */
export const LIGHTS = createLightPool();
