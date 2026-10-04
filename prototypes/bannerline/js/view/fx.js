// One-off effects driven by sim events (docs/interfaces.md §4): projectiles in flight, skill
// rings/arcs, pulses, Tide/wave arrival flares. Plain meshes with a short life; M7 swaps the skill
// shapes for BatchedSpellFx without changing the event plumbing.

import * as THREE from 'three';
import { TICK_HZ_FALLBACK } from './consts.js';

const ELEMENT_COLORS = { blade: 0xf2f2f2, pierce: 0xd8c27a, fire: 0xff7a2a, nature: 0x7ad84a, physical: 0xf2f2f2 };

export function createFx({ scene, actors, tickHz = TICK_HZ_FALLBACK, data = null, map = null, spellsElsewhere = false }) {
  // spellsElsewhere: stream C's skillfx draws casts / bolts / pulses; this file then draws only gameplay markers.
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const live = [];
  const projGeo = new THREE.SphereGeometry(0.14, 6, 4);
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
  const discGeo = new THREE.CircleGeometry(1, 40);

  const boltGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const zoneMeshes = new Map();
  let zoneT = 0;
  function makeZone(zn) {
    const el = zn.dmgType || data?.heroes?.skills?.[zn.skill]?.element;
    const color = ELEMENT_COLORS[el] ?? 0xff7a2a;
    const r = zn.radius || 2, len = zn.length || 0;
    // A disc, or a capsule (stadium) of `length` along `face` with half-width `radius`.
    const shape = new THREE.Shape();
    if (len > 0) {
      shape.absarc(0, len / 2, r, 0, Math.PI, false);
      shape.absarc(0, -len / 2, r, Math.PI, Math.PI * 2, false);
    } else shape.absarc(0, 0, r, 0, Math.PI * 2, false);
    const geo = new THREE.ShapeGeometry(shape, 24);
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edge = new THREE.LineSegments(edgeGeo, new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.7 }));
    const g = new THREE.Group();
    const flat = new THREE.Group(); flat.rotation.x = -Math.PI / 2; flat.add(fill, edge);
    g.add(flat);
    // Shape +y is local length; after laying flat it points along -z, so turn by face + PI.
    g.rotation.y = (zn.face || 0) + Math.PI;
    g.position.set(zn.x, 0.08, zn.z);
    // Embers rising from the patch.
    const n = Math.min(24, Math.round((len + r * 2) * 2.5));
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pts[i * 3] = (Math.random() - 0.5) * r * 1.6; pts[i * 3 + 1] = Math.random() * 1.5; pts[i * 3 + 2] = (Math.random() - 0.5) * (len + r); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const sparks = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffc070, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false }));
    sparks.onBeforeRender = () => { const a = pg.attributes.position; for (let i = 0; i < n; i++) { a.array[i * 3 + 1] += 0.02; if (a.array[i * 3 + 1] > 1.6) a.array[i * 3 + 1] = 0; } a.needsUpdate = true; };
    g.add(sparks);
    return { group: g, fill, edge, dispose() { geo.dispose(); edgeGeo.dispose(); pg.dispose(); fill.material.dispose(); edge.material.dispose(); sparks.material.dispose(); } };
  }

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
    spellsElsewhere,
    onEvent(ev, state) {
      if (this.spellsElsewhere && (ev.type === 'cast' || ev.type === 'bolt' || ev.type === 'pulse')) return;
      switch (ev.type) {
        case 'keepShot': {
          // The Keep guard (stream A, js/sim/keep.js): a bolt from the Keep's top to (x, z) and a blast.
          const f = map?.fields?.[ev.field];
          const kx = f ? f.keep.x : ev.x, kz = f ? f.keep.z : ev.z + 20;
          const head = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
          const glow = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.6, depthWrite: false }));
          glow.scale.setScalar(2.4);
          const g = new THREE.Group(); g.add(head, glow);
          add(g, 0.35, (k) => {
            g.position.set(kx + (ev.x - kx) * k, 9 * (1 - k) + 0.8 * k + Math.sin(k * Math.PI) * 3, kz + (ev.z - kz) * k);
            if (k >= 0.999) groundShape(ev.x, ev.z, ev.radius || 3, 0x8fd0ff, { life: 0.5, fill: 0.4 });
          });
          break;
        }
        case 'bolt': {
          // A skill bolt (Firebolt): a bright head with a glowing tail, homing on `dst` if it lives.
          const el = data?.heroes?.skills?.[ev.fx || ev.skill]?.element || data?.heroes?.skills?.[ev.skill]?.element;
          const color = ELEMENT_COLORS[el] ?? 0xff7a2a;
          const head = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
          const glow = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
          glow.scale.setScalar(2.1);
          const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
          tail.rotation.x = -Math.PI / 2; tail.position.z = -0.8;
          const g = new THREE.Group(); g.add(head, glow, tail);
          const life = Math.max(0.05, (ev.ticks || 1) / tickHz);
          const fx0 = ev.fromX, fz0 = ev.fromZ;
          add(g, life, (k) => {
            const dst = ev.dst >= 0 ? actors.get(ev.dst) : null;
            const tx = dst ? dst.x : ev.toX, tz = dst ? dst.z : ev.toZ;
            g.position.set(fx0 + (tx - fx0) * k, 1.2, fz0 + (tz - fz0) * k);
            g.lookAt(tx, 1.2, tz);
            glow.scale.setScalar(2.1 + Math.sin(k * 40) * 0.25);
            if (k >= 0.999) groundShape(tx, tz, 1.6, color, { life: 0.4, fill: 0.35 });
          });
          break;
        }
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
          const el = ev.element || data?.heroes?.skills?.[ev.fx || ev.skill]?.element || data?.heroes?.skills?.[ev.skill]?.element;
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
    /** Lingering ground zones (state.zones): drawn from state each frame so a reload never loses one. */
    syncZones(zones, dt) {
      const seen = new Set();
      zoneT += dt;
      for (const zn of zones || []) {
        seen.add(zn.id);
        let m = zoneMeshes.get(zn.id);
        if (!m) { m = makeZone(zn); zoneMeshes.set(zn.id, m); root.add(m.group); }
        const flick = 0.75 + Math.sin(zoneT * 9 + zn.id) * 0.12 + Math.sin(zoneT * 23 + zn.id * 2) * 0.08;
        m.fill.material.opacity = 0.32 * flick;
        m.edge.material.opacity = 0.75 * flick;
      }
      for (const [id, m] of zoneMeshes) if (!seen.has(id)) { root.remove(m.group); m.dispose(); zoneMeshes.delete(id); }
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const f = live[i];
        f.t += dt;
        const k = Math.min(1, f.t / f.life);
        f.update(k);
        if (k >= 1) {
          root.remove(f.obj);
          f.obj.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry && o.geometry !== projGeo && o.geometry !== boltGeo && o.geometry !== ringGeo && o.geometry !== discGeo) o.geometry.dispose(); });
          live.splice(i, 1);
        }
      }
    },
    count() { return live.length; },
    dispose() { for (const m of zoneMeshes.values()) m.dispose(); zoneMeshes.clear(); scene.remove(root); },
  };
}
