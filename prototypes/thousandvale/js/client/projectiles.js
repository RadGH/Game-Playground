// Shots you can SEE (play-test 8, W2 + W14): an arrow, a crossbow quarrel, a thrown knife or axe, a javelin, a stone,
// a firebolt, a bolt of any other element — one small body that leaves the attacker's HAND, crosses the gap in the
// rules' own flight time (following its target when the rules say it homes) and bursts where it arrives.
//
// Which body flies is projectile-kinds.js (pure, tested). This file is only the drawing:
//
//   * every model is built ONCE at boot and POOLED (a fixed number of meshes per model, hidden when idle) — a fight
//     never creates or disposes a geometry or a material;
//   * two materials in all — one solid, one glowing — both compiled in the boot warm-up through `sample()`, so the first
//     arrow of the session links no shader (memory note: a material first drawn mid-fight is a visible hitch);
//   * no lights. A firebolt's glow is additive colour, not a PointLight (adding or toggling a light recompiles every
//     lit material in the scene).
//
//   const shots = createProjectiles(scene, { actors, groundY, night })
//   shots.fire(ev, { to, follow, ms, onLand })     // ev = the rules' fx event; `to` a Vector3, `follow()` -> Vector3 | null
//   shots.update(dt)      shots.sample()      shots.stats

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { projectileKind, flightMs, arcHeight, fanBow, SHOT_COLOUR, MODELS, SHOOTER_HELD } from './projectile-kinds.js';

/** Bodies are drawn a little larger than life: a real arrow is a hair at 30 m. */
const SIZE = 1.5;
const POOL = { arrow: 14, quarrel: 8, javelin: 4, knife: 6, axe: 4, stone: 8, firebolt: 8, orb: 10, shard: 6, spark: 6 };

/** A geometry painted one colour (the pool's materials read vertex colours). */
function painted(g, colour) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(colour), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  return geo;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))); return g; };
/** A rod along +z from z0 to z1. */
const rod = (r0, r1, z0, z1, colour, n = 6) => painted(at(new THREE.CylinderGeometry(r1, r0, z1 - z0, n), 0, 0, (z0 + z1) / 2, Math.PI / 2), colour);
/** A point (cone) with its tip at z1 and its base at z0. */
const tip = (r, z0, z1, colour, n = 6) => painted(at(new THREE.ConeGeometry(r, Math.abs(z1 - z0), n), 0, 0, (z0 + z1) / 2, z1 > z0 ? Math.PI / 2 : -Math.PI / 2), colour);
const slab = (w, h, d, x, y, z, colour, rz = 0) => painted(at(new THREE.BoxGeometry(w, h, d), x, y, z, 0, 0, rz), colour);
const ball = (r, colour, z = 0, sz = 1, detail = 1) => painted(at(new THREE.IcosahedronGeometry(r, detail), 0, 0, z, 0, 0, 0, 1, 1, sz), colour);

/** Every model, pointing +z, in metres (before SIZE). */
function buildGeometries() {
  const G = {};
  // an arrow: pale shaft, iron head, three fletchings (two white, one red — the cock feather)
  G.arrow = mergeGeometries([
    rod(0.011, 0.011, -0.42, 0.34, '#d8c49a'), tip(0.03, 0.34, 0.46, '#8a9098', 4),
    ...[0, 1, 2].map(k => slab(0.004, 0.07, 0.17, 0, 0.035, -0.33, k ? '#f0ece0' : '#c83a2a').applyMatrix4(new THREE.Matrix4().makeRotationZ(k * Math.PI * 2 / 3))),
    rod(0.013, 0.013, -0.44, -0.42, '#3a2a1a'),
  ]);
  // a crossbow quarrel: short, thick, a square head, two leather vanes
  G.quarrel = mergeGeometries([
    rod(0.017, 0.015, -0.2, 0.2, '#8a6a42'), tip(0.036, 0.2, 0.32, '#6a7078', 4),
    slab(0.005, 0.085, 0.12, 0, 0, -0.14, '#5a3a24'), slab(0.085, 0.005, 0.12, 0, 0, -0.14, '#5a3a24'),
  ]);
  // a javelin: a long ash shaft, a leaf head, a cord grip
  G.javelin = mergeGeometries([
    rod(0.016, 0.014, -0.75, 0.5, '#b89a68'), painted(at(new THREE.ConeGeometry(0.04, 0.26, 4), 0, 0, 0.63, Math.PI / 2, 0, 0, 1, 1, 0.45), '#9aa2ac'),
    rod(0.02, 0.02, -0.12, 0.08, '#4a3624'),
  ]);
  // a throwing knife: a flat leaf blade, a short wrapped grip, a ring pommel
  G.knife = mergeGeometries([
    painted(at(new THREE.ConeGeometry(0.045, 0.3, 4), 0, 0, 0.14, Math.PI / 2, 0, 0, 0.28, 1, 1), '#c8d0d8'),
    slab(0.07, 0.014, 0.02, 0, 0, -0.015, '#8a7a4a'), rod(0.014, 0.012, -0.16, -0.02, '#3a2a1a'), ball(0.02, '#8a7a4a', -0.175, 1, 0),
  ]);
  // a throwing axe: a short haft, a bearded head on one side
  G.axe = mergeGeometries([
    rod(0.016, 0.014, -0.26, 0.2, '#7a5a3a'),
    slab(0.016, 0.15, 0.13, 0, 0.085, 0.13, '#9aa2ac'), painted(at(new THREE.ConeGeometry(0.075, 0.07, 4), 0, 0.185, 0.13, 0, Math.PI / 4, 0, 0.16, 1, 1.3), '#c8d0d8'),
  ]);
  // a stone: a lumpy grey rock
  { const g = new THREE.IcosahedronGeometry(0.1, 0), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.82 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.36; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); } G.stone = mergeGeometries([painted(g, '#8a8a84'), ball(0.045, '#a8a8a0', 0.06, 1, 0)]); }
  // --- glowing ones: vertex colour is BRIGHTNESS (the material's colour is the element's); layers add up to a hot core
  // a firebolt: a hot head and a long tapering flame behind it, two licks off-axis
  G.firebolt = mergeGeometries([
    ball(0.1, '#a8a8a8'), ball(0.17, '#6a6a6a', -0.02, 1.25), tip(0.15, -0.05, -0.95, '#5a5a5a', 7), tip(0.085, 0.0, -1.3, '#4a4a4a', 5),      // (kept dim: the layers ADD, and a brighter stack burned out to yellow-white instead of fire orange)
    at(tip(0.06, 0, -0.5, '#484848', 4), 0.07, 0.06, -0.18, 0.12, 0.1), at(tip(0.05, 0, -0.42, '#484848', 4), -0.08, -0.04, -0.26, -0.1, -0.14),
  ]);
  // an orb: a bright core in a soft shell, a short tail
  G.orb = mergeGeometries([ball(0.1, '#ffffff'), ball(0.2, '#707070', 0, 1), ball(0.28, '#2c2c2c', -0.03, 1.1), tip(0.13, -0.08, -0.62, '#4a4a4a', 6)]);
  // a shard: a long crystal splinter with two smaller ones beside it
  G.shard = mergeGeometries([
    painted(at(new THREE.OctahedronGeometry(0.1, 0), 0, 0, 0.05, 0, 0, 0, 0.7, 0.7, 4.2), '#f0f0f0'),
    painted(at(new THREE.OctahedronGeometry(0.06, 0), 0.09, 0.03, -0.12, 0, 0, 0, 0.7, 0.7, 3.2), '#a0a0a0'),
    painted(at(new THREE.OctahedronGeometry(0.05, 0), -0.08, -0.05, -0.2, 0, 0, 0, 0.7, 0.7, 3), '#808080'),
    tip(0.07, -0.25, -0.75, '#404040', 4),
  ]);
  // a spark: a jagged streak (three offset slivers) with a white head
  G.spark = mergeGeometries([
    ball(0.08, '#ffffff'), ball(0.15, '#808080'),
    at(rod(0.03, 0.012, -0.35, 0, '#c0c0c0', 4), 0.03, 0.02, 0, 0, 0.12), at(rod(0.026, 0.01, -0.4, 0, '#a0a0a0', 4), -0.05, 0.03, -0.33, 0.1, -0.22), at(rod(0.022, 0.006, -0.38, 0, '#808080', 4), 0.02, -0.04, -0.7, -0.12, 0.16),
  ]);
  return G;
}

const GLOWING = new Set(['firebolt', 'orb', 'shard', 'spark']);

export function createProjectiles(scene, { actors = null, groundY = () => 0, night = () => 0 } = {}) {
  const group = new THREE.Group(); group.name = 'projectiles'; scene.add(group);
  const GEO = buildGeometries();
  // TWO materials for everything (the glow pool clones its one so each shot can take its element's colour: a clone
  // shares the compiled program, so that costs nothing)
  const solidMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pools = {};
  for (const model of MODELS) {
    pools[model] = { next: 0, items: [] };
    for (let i = 0; i < (POOL[model] || 4); i++) {
      const m = new THREE.Mesh(GEO[model], GLOWING.has(model) ? glowMat.clone() : solidMat);
      m.visible = false; m.frustumCulled = false; m.matrixAutoUpdate = true; m.castShadow = false; m.receiveShadow = false;
      m.renderOrder = GLOWING.has(model) ? 4 : 0;
      group.add(m);
      pools[model].items.push({ m, live: false });
    }
  }
  const live = [];
  const stats = { fired: 0, landed: 0, reused: 0, byModel: {}, last: null };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _hand = new THREE.Vector3();

  /** Where a shot leaves the shooter: the bone of its weapon hand when the body has one, else beside the chest. */
  function handOf(a, out = new THREE.Vector3()) {
    if (!a) return null;
    const h = Math.max(0.6, a.height || 1.7);
    const fallback = () => out.set(a.pos.x + Math.sin(a.yaw) * 0.45 + Math.cos(a.yaw) * 0.22, a.pos.y + h * 0.68, a.pos.z + Math.cos(a.yaw) * 0.45 - Math.sin(a.yaw) * 0.22);
    try {
      const bone = a.model?.getObjectByName?.('gripR') || a.model?.getObjectByName?.('handR');
      if (bone) {
        bone.getWorldPosition(out);
        // a bone that has not been posed yet (or a body mid-rebuild) reports nonsense: trust it only near the body
        if (Number.isFinite(out.x) && Math.hypot(out.x - a.pos.x, out.z - a.pos.z) < 2.5 && out.y > a.pos.y - 0.5 && out.y < a.pos.y + h + 1.5) return out;
      }
    } catch { /* fall through */ }
    return fallback();
  }
  /** What the shooter holds, for a monster `shot` that does not say (a brigand archer's look holds a bow). Play-test 11 (Z26,
   *  live #27: "Brigand Archers look like they throw rocks"): a humanoid monster's bow sits in its bestiary look
   *  (`look.avatar.held`), which this never read, so every physical monster shot fell through to a stone. */
  const heldOf = a => a?.look?.held?.id || a?.avatar?.held?.id || a?.heldId || a?.look?.avatar?.held?.id || SHOOTER_HELD[a?.creature?.type] || a?.look?.gear?.weapon?.sub || a?.look?.gear?.weapon?.subtype || a?.look?.gear?.weapon?.base || null;

  /**
   * Loose one. `ev` = the rules' event (kind, element, proj, wt, ms / speed, id). `to` = where it is going (Vector3);
   * `follow()` = the target's live position (it homes) or null; `from` overrides the hand (a ricochet's next hop).
   * `onLand(point)` runs when it arrives. Returns the kind it drew.
   */
  function fire(ev, { to, follow = null, from = null, ms = null, onLand = null, spread = 0 } = {}) {
    const shooter = actors?.get?.(ev.id) || null;
    const start = from ? _hand.copy(from) : handOf(shooter, _hand);
    if (!start || !to) return null;
    const kind = projectileKind(ev, { held: heldOf(shooter) });
    const pool = pools[kind.model] || pools.orb;
    // the oldest one is taken back when the pool is all in the air (a volley of 20 arrows still shows 14)
    let it = pool.items.find(x => !x.live);
    if (!it) { it = pool.items[pool.next++ % pool.items.length]; stats.reused++; const i = live.indexOf(it); if (i >= 0) live.splice(i, 1); }
    const dist = start.distanceTo(to);
    it.live = true; it.kind = kind; it.t = 0; it.shooter = ev.id ?? null; it.big = ev.big ? 1.5 : 1;
    it.ms = flightMs({ ...ev, ms: ms ?? ev.ms }, dist, kind.model);
    it.from = (it.from || new THREE.Vector3()).copy(start);
    it.to = (it.to || new THREE.Vector3()).copy(to);
    it.follow = follow; it.onLand = onLand; it.dist = dist; it.spin = 0; it.side = spread;
    const m = it.m;
    m.scale.setScalar(SIZE * (kind.scale || 1) * (ev.big ? 1.5 : 1));
    if (kind.glow) m.material.color.set((SHOT_COLOUR[kind.element] || SHOT_COLOUR.arcane)[1]);
    m.position.copy(start); m.visible = true;
    live.push(it);
    stats.fired++; stats.byModel[kind.model] = (stats.byModel[kind.model] || 0) + 1;
    stats.last = { model: kind.model, element: kind.element, ms: Math.round(it.ms), dist: +dist.toFixed(2), from: [+start.x.toFixed(2), +start.y.toFixed(2), +start.z.toFixed(2)], shooter: ev.id ?? null };
    return kind;
  }

  function place(it, k) {
    // a homing shot bends toward where its target is NOW; the further along, the more it trusts the live position
    if (it.follow) { const p = it.follow(); if (p) it.to.lerp(p, Math.min(1, 0.25 + k)); }
    _a.lerpVectors(it.from, it.to, k);
    _a.y += arcHeight(k, it.dist, it.kind.arc);
    // play-test 11 (Z39, live #40): one bolt of a FAN bows out to its own side and comes back in on its mark, so three
    // bolts at one target are three flights you can count, not one streak drawn three times
    if (it.side) { const b = fanBow(k, it.dist, it.side), dx = it.to.x - it.from.x, dz = it.to.z - it.from.z, l = Math.hypot(dx, dz) || 1; _a.x += dz / l * b; _a.z -= dx / l * b; }
    return _a;
  }

  function update(dt) {
    if (!live.length) return;
    // solid bodies are unlit: dim them with the night so an arrow is not a white needle at midnight
    solidMat.color.setScalar(1 - 0.55 * Math.max(0, Math.min(1, night())));
    for (let i = live.length - 1; i >= 0; i--) {
      const it = live[i];
      it.t += dt * 1000;
      const k = Math.min(1, it.t / it.ms);
      const m = it.m;
      const p = place(it, k);
      m.position.copy(p);
      // face along the path (a look a twentieth of the way ahead), then tumble if it is a thrown thing
      _b.copy(place(it, Math.min(1, k + 0.05)));
      if (_b.distanceToSquared(m.position) > 1e-6) m.lookAt(_b);
      if (it.kind.spin) { it.spin += dt * it.kind.spin * Math.PI * 2; m.rotateX(it.spin); }
      if (it.kind.glow) { const f = (0.88 + 0.24 * Math.sin(it.t * 0.045 + i)) * (it.kind.scale || 1) * it.big; m.scale.set(SIZE * f, SIZE * f, SIZE * (it.kind.scale || 1) * it.big * (1 + 0.18 * Math.sin(it.t * 0.03))); }
      if (k >= 1) {
        m.visible = false; it.live = false; live.splice(i, 1); stats.landed++;
        const fn = it.onLand; it.onLand = null; it.follow = null;
        if (fn) { try { fn(m.position.clone(), it.kind); } catch { /* an impact that cannot draw is not worth a crash */ } }
      }
    }
  }

  /** One of each material, visible, for the boot shader warm-up (warmup.js `extras`). */
  function sample() {
    const g = new THREE.Group(); g.name = 'projectile-samples';
    const a = new THREE.Mesh(GEO.arrow, solidMat), b = new THREE.Mesh(GEO.firebolt, glowMat.clone());
    b.position.x = 1; g.add(a, b);
    return g;
  }
  /** Take every live shot of a shooter out of the air (it died mid-flight and the rules cancelled the hit). */
  function drop(id) { for (let i = live.length - 1; i >= 0; i--) if (live[i].shooter === id) { live[i].m.visible = false; live[i].live = false; live.splice(i, 1); } }
  return {
    fire, update, sample, drop, stats, handOf, group,
    get live() { return live.length; },
    /** What is in the air right now (specs and screenshots). */
    list: () => live.map(it => ({ model: it.kind.model, element: it.kind.element, k: +(it.t / it.ms).toFixed(2), x: it.m.position.x, y: it.m.position.y, z: it.m.position.z })),
    pools: () => Object.fromEntries(Object.entries(pools).map(([k, p]) => [k, p.items.length])),
    dispose() { scene.remove(group); for (const g of Object.values(GEO)) g.dispose(); solidMat.dispose(); for (const p of Object.values(pools)) for (const it of p.items) if (it.m.material !== solidMat) it.m.material.dispose(); glowMat.dispose(); },
  };
}
