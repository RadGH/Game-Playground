// One-off effects driven by sim events (docs/interfaces.md §4): projectiles in flight, skill
// rings/arcs, pulses, Tide/wave arrival flares. Plain meshes with a short life; M7 swaps the skill
// shapes for BatchedSpellFx without changing the event plumbing.

import * as THREE from 'three';
import { TICK_HZ_FALLBACK } from './consts.js';

const ELEMENT_COLORS = { blade: 0xf2f2f2, pierce: 0xd8c27a, fire: 0xff7a2a, nature: 0x7ad84a, physical: 0xf2f2f2 };

export function createFx({ scene, actors, tickHz = TICK_HZ_FALLBACK, data = null }) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const live = [];
  const projGeo = new THREE.SphereGeometry(0.14, 6, 4);
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
  const discGeo = new THREE.CircleGeometry(1, 40);

  function add(obj, life, update) { root.add(obj); live.push({ obj, life, t: 0, update }); }

  function arcGeo(radius, arc) {
    return new THREE.RingGeometry(radius * 0.15, radius, 24, 1, -arc / 2, arc);
  }

  function groundShape(x, z, radius, color, { arc = null, face = 0, life = 0.45, fill = 0.28 } = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthWrite: false, side: THREE.DoubleSide });
    const geo = arc && arc < Math.PI * 1.99 ? arcGeo(radius, arc) : discGeo;
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    // RingGeometry's theta starts on +x in its own plane; after rotating flat, +x stays +x and the
    // plane's +y becomes -z. Facing (sin f, cos f) => angle on that plane = atan2(-cos f, sin f).
    if (arc) mesh.rotation.z = Math.atan2(-Math.cos(face), Math.sin(face));
    if (!arc || arc >= Math.PI * 1.99) mesh.scale.set(radius, radius, 1);
    mesh.position.set(x, 0.06, z);
    const edge = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    edge.rotation.x = -Math.PI / 2; edge.position.set(x, 0.07, z); edge.scale.set(radius, radius, 1);
    if (arc && arc < Math.PI * 1.99) edge.visible = false;
    const g = new THREE.Group(); g.add(mesh, edge);
    add(g, life, (k) => {
      m.opacity = fill * (1 - k);
      edge.material.opacity = 0.9 * (1 - k);
      const s = 0.85 + k * 0.2; g.scale.set(s, 1, s); g.position.set(x * (1 - s), 0, z * (1 - s));
    });
  }

  return {
    onEvent(ev, state) {
      switch (ev.type) {
        case 'shot': {
          const src = actors.get(ev.src), dst = actors.get(ev.dst);
          if (!src || !dst) break;
          const color = ELEMENT_COLORS[ev.dmgType] ?? 0xffffff;
          const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color }));
          const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
          const g = new THREE.Group(); g.add(m, trail);
          const sx = src.x, sz = src.z, sy = src.height * 0.7;
          const life = Math.max(0.05, (ev.ticks || 1) / tickHz);
          add(g, life, (k) => {
            const tx = dst.x, tz = dst.z, ty = dst.height * 0.6;
            const x = sx + (tx - sx) * k, z = sz + (tz - sz) * k;
            const arcH = Math.hypot(tx - sx, tz - sz) * 0.12 * Math.sin(k * Math.PI);
            g.position.set(x, sy + (ty - sy) * k + arcH, z);
            g.lookAt(tx, ty, tz); trail.rotation.x = Math.PI / 2; trail.position.z = -0.5;
          });
          break;
        }
        case 'cast': {
          const el = ev.element || data?.heroes?.skills?.[ev.skill]?.element;
          const color = ELEMENT_COLORS[el] ?? 0xffd66b;
          const r = ev.radius || ev.reach || 2;
          groundShape(ev.x, ev.z, r, color, { arc: ev.arc || null, face: ev.face || 0, life: 0.5 });
          break;
        }
        case 'pulse':
          groundShape(ev.x, ev.z, ev.radius || 2, 0xffd66b, { life: 0.35, fill: 0.18 });
          break;
        case 'death': {
          groundShape(ev.x, ev.z, 1.2, 0x2a1a14, { life: 0.8, fill: 0.35 });
          break;
        }
        case 'respawn': {
          const a = actors.get(ev.id);
          if (a) groundShape(a.x, a.z, 2.2, 0xffe08a, { life: 0.9, fill: 0.3 });
          break;
        }
        default: break;
      }
    },
    /** Flash at a gate when a wave/tide enters. */
    flare(x, z, color = 0xffd66b, radius = 4) { groundShape(x, z, radius, color, { life: 1.0, fill: 0.22 }); },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const f = live[i];
        f.t += dt;
        const k = Math.min(1, f.t / f.life);
        f.update(k);
        if (k >= 1) {
          root.remove(f.obj);
          f.obj.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry && o.geometry !== projGeo && o.geometry !== ringGeo && o.geometry !== discGeo) o.geometry.dispose(); });
          live.splice(i, 1);
        }
      }
    },
    count() { return live.length; },
    dispose() { scene.remove(root); },
  };
}
