// Bannerline buildings and the dressed vale (stream C, PLAN §4 / §14, owner round 2 R2.3).
//
//   import { buildStructures, makeKeep, makeOutfitter, makeBarracks, makeDrillYard, makeSanctum } from './structures.js';
//   const world = buildStructures(scene, layout, { identity, buildings: Q.buildingsInfo(state, data), teams: [{ team: 0, race: 'freeholds', slot: 0 }, { team: 1, race: 'ashtusk', slot: 3 }] });
//   world.setBanners(team, fraction)        // 0..1 — banners fall one by one, staggered, and stay down
//   world.towns[team]                       // { shop, barracks, drillyard, sanctum }: each { id, kind, group, position, radius, useRadius, setReady, setHover, update }
//   world.buildings()                       // all of them, flat, for picking / "walk up to it" checks
//   world.setReady(team, kind, bool)        // the ring pulses (the Barracks also raises its banner and lights its windows)
//   world.setHover(team, kind, bool)        // the ring brightens while the hero is inside / the cursor is over it
//   world.flashPower(team, 'defensive' | 'offensive' | 'neutral')   // the Sanctum pulses that orb
//   world.update(dt); world.restyle(teams); world.dispose()
//
// A drop-in for js/view/terrain.js `buildWorld` (same layout object from layout.js, same
// setBanners/update/dispose), with race-themed walls, gatehouses, the Keep, the four town buildings
// (Outfitter / Barracks / Drill Yard / Sanctum = sim kinds shop / barracks / drillyard / sanctum),
// the ford and props outside the walls. Building spots + door facing come from the sim's building
// list (`buildings`: query.buildingsInfo or sim/buildings.js buildingsFor); without one, the vale
// default layout is used.
//
// HOW IT STAYS CHEAP. Every static piece is written through a Kit, which bakes boxes/cylinders/cones
// with their colour into vertex colours and merges them into one mesh per material kind (stone/wood,
// metal, glow, cloth). A whole field is ~10 draw calls. Only moving things are their own meshes:
// banner cloths, rings, the shrine crystal, the water.
//
// Facing: units walk +z (gate at low z, Keep at high z) and the RTS camera looks from +z, so the
// Keep's gate faces the field (-z) and the town buildings' doors face the camera (+z).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createIdentity, shadeHex } from './identity.js';

const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ================================================================ the Kit (static mesh baker)
const MATS = {};
/** The shared Kit materials (vertex colours), one per kind. */
export function kitMaterial(kind) {
  if (MATS[kind]) return MATS[kind];
  MATS[kind] = kind === 'metal' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.65 })
    : kind === 'glow' ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      : kind === 'cloth' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
  return MATS[kind];
}

export class Kit {
  /** `material(kind)` picks the material for 'std' | 'metal' | 'glow' | 'cloth' (default: the shared set here). */
  constructor({ material = kitMaterial } = {}) { this.material = material; this.parts = { std: [], metal: [], glow: [], cloth: [] }; this.stack = [new THREE.Matrix4()]; }
  /** Run `fn` with every add() placed relative to { p, r, s }. */
  at({ p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}, fn) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m)); fn(); this.stack.pop(); return this;
  }
  add(geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], kind = 'std' } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));
    g.applyMatrix4(this.stack[this.stack.length - 1].clone().multiply(m));
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts[kind].push(g); geo !== g && geo.dispose?.();
    return this;
  }
  box(w, h, d, color, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  cyl(rt, rb, h, color, o = {}, seg = 10) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, o); }
  cone(r, h, color, o = {}, seg = 10) { return this.add(new THREE.ConeGeometry(r, h, seg), color, o); }
  sphere(r, color, o = {}, seg = 10) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg * 0.6 | 0)), color, o); }
  ico(r, color, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, 0), color, o); }
  torus(r, tube, color, o = {}, arc = TAU) { return this.add(new THREE.TorusGeometry(r, tube, 6, 16, arc), color, o); }
  /** One merged BufferGeometry per kind (for an InstancedMesh prop) or a Group of meshes. */
  geometry(kind = 'std') { const l = this.parts[kind]; return l.length ? mergeGeometries(l) : null; }
  build(name = 'kit') {
    const g = new THREE.Group(); g.name = name;
    for (const [kind, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), this.material(kind));
      mesh.name = name + ':' + kind; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      g.add(mesh); for (const p of list) p.dispose();
    }
    this.parts = { std: [], metal: [], glow: [], cloth: [] };
    return g;
  }
}

// ================================================================ shared bits
function clothMaterial(identity, race, color, shape = 'banner') {
  return new THREE.MeshStandardMaterial({ map: identity.bannerTexture(THREE, { race, color, shape }), side: THREE.DoubleSide, roughness: 0.9 });
}
/** A hanging banner on a crossbar; the cloth is its own mesh so it can wave. Top of cloth at y=0. */
function hangingBanner(material, w = 0.9, h = 1.5) {
  const geo = new THREE.PlaneGeometry(w, h, 4, 6); geo.translate(0, -h / 2, 0);
  // swallow tail: pull the bottom-middle vertices up
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) + h) < 1e-4 && Math.abs(p.getX(i)) < w * 0.2) p.setY(i, -h * 0.82);
  const m = new THREE.Mesh(geo, material); m.userData.base = Float32Array.from(p.array); m.userData.h = h;
  return m;
}
function waveCloth(mesh, t, amp = 0.08, phase = 0) {
  const p = mesh.geometry.attributes.position, b = mesh.userData.base, h = mesh.userData.h || 1;
  for (let i = 0; i < p.count; i++) { const y = -b[i * 3 + 1] / h; p.array[i * 3 + 2] = b[i * 3 + 2] + Math.sin(t * 2.6 + y * 4 + b[i * 3] * 3 + phase) * amp * y; }
  p.needsUpdate = true;
}

function merlons(kit, len, h, th, color, { gap = 2.2, w = 1 } = {}) {
  const n = Math.max(1, Math.floor(len / gap));
  for (let i = 0; i < n; i++) kit.box(w, 0.7, th * 1.06, color, { p: [-len / 2 + (i + 0.5) * len / n, h + 0.35, 0] });
}

// ================================================================ walls by style
/** A wall run from a to b. Styles: stone (Freeholds), palisade (Ashtusk), crypt (Unburied), grove (Thornmane). */
function wallRun(kit, a, b, pal, style, { h = 3.2, th = 1.4, seed = 1 } = {}) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), yaw = -Math.atan2(b.z - a.z, b.x - a.x), r = rng(seed);
  kit.at({ p: [(a.x + b.x) / 2, 0, (a.z + b.z) / 2], r: [0, yaw, 0] }, () => {
    if (style === 'palisade') {
      kit.box(len, 0.6, th * 1.3, pal.stoneDark, { p: [0, 0.3, 0] });
      const n = Math.floor(len / 0.55);
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + (i + 0.5) * len / n, hh = h + (r() - 0.5) * 0.6, c = shadeHex(pal.wood, (r() - 0.5) * 0.25);
        kit.cyl(0.26, 0.28, hh, c, { p: [x, hh / 2, 0] }, 6);
        kit.cone(0.26, 0.6, shadeHex(pal.wood, 0.2), { p: [x, hh + 0.3, 0] }, 6);
      }
      for (let x = -len / 2 + 3; x < len / 2; x += 6) kit.box(0.2, 0.25, th * 1.25, '#3a2a1c', { p: [x, h * 0.55, 0], r: [0, 0, 0.0] }), kit.box(len > 6 ? 5.6 : len, 0.18, 0.12, '#3a2a1c', { p: [x, h * 0.62, -th * 0.4] });
    } else if (style === 'grove') {
      kit.box(len, 0.5, th * 1.4, pal.stoneDark, { p: [0, 0.25, 0] });
      for (let x = -len / 2; x < len / 2; x += 1.1) {
        const s = 0.9 + r() * 0.5, c = shadeHex(pal.roof, (r() - 0.5) * 0.3);
        kit.ico(s, c, { p: [x, 0.9 + r() * 0.5, (r() - 0.5) * 0.4], s: [1, 1.2 + r() * 0.4, 0.9] });
        if (r() < 0.5) kit.cone(0.08, 0.6, pal.trim, { p: [x + 0.3, 1.6 + r(), 0.6], r: [0.9, 0, r()] }, 4);
      }
      for (let x = -len / 2 + 2; x < len / 2; x += 8) kit.cyl(0.25, 0.3, h + 0.6, pal.wood, { p: [x, (h + 0.6) / 2, 0] }, 7), kit.cone(0.32, 0.5, pal.roof, { p: [x, h + 0.85, 0] }, 7);
    } else if (style === 'crypt') {
      kit.box(len, h * 0.8, th, pal.stone, { p: [0, h * 0.4, 0] });
      kit.box(len, 0.3, th * 1.2, pal.stoneDark, { p: [0, h * 0.8 + 0.15, 0] });
      for (let x = -len / 2 + 0.4; x < len / 2; x += 0.6) kit.cone(0.05, 0.7, pal.metal, { p: [x, h * 0.8 + 0.6, 0], kind: 'metal' }, 4);
      for (let x = -len / 2 + 4; x < len / 2 - 1; x += 9) {
        kit.box(1.1, h + 1.2, th * 1.4, pal.stoneDark, { p: [x, (h + 1.2) / 2, 0] });
        kit.cone(0.75, 1.3, pal.roof, { p: [x, h + 1.85, 0] }, 4);
        kit.sphere(0.2, pal.glow, { p: [x, h + 0.2, th * 0.75], kind: 'glow' }, 6);
      }
    } else {
      kit.box(len, h, th, pal.stone, { p: [0, h / 2, 0] });
      kit.box(len, 0.5, th * 1.15, pal.stoneDark, { p: [0, 0.25, 0] });
      merlons(kit, len, h, th, pal.stone);
      for (let x = -len / 2 + 6; x < len / 2 - 2; x += 12) kit.box(1.6, h + 0.4, th * 1.35, pal.stoneDark, { p: [x, (h + 0.4) / 2, 0] });
    }
  });
}

// ================================================================ towers + toppers
function towerTop(kit, x, z, y, r, pal, style) {
  if (style === 'stone') { kit.cone(r * 1.3, r * 2.0, pal.roof, { p: [x, y + r, z] }, 10); kit.cone(r * 0.12, r * 0.7, pal.metal, { p: [x, y + r * 2.2, z], kind: 'metal' }, 5); }
  else if (style === 'palisade') { kit.cyl(r * 1.15, r * 1.05, 0.5, pal.wood, { p: [x, y + 0.25, z] }, 8); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; kit.cone(0.16, 1.2, pal.trim, { p: [x + Math.cos(a) * r, y + 0.9, z + Math.sin(a) * r], r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4] }, 5); } kit.cone(r * 1.2, r * 1.3, pal.roof, { p: [x, y + r * 0.9, z] }, 6); }
  else if (style === 'crypt') { kit.cone(r * 1.0, r * 3.2, pal.roof, { p: [x, y + r * 1.6, z] }, 6); kit.sphere(r * 0.2, pal.glow, { p: [x, y + r * 3.4, z], kind: 'glow' }, 6); }
  else { kit.ico(r * 1.5, pal.roof, { p: [x, y + r * 0.8, z], s: [1, 0.8, 1] }); kit.ico(r * 0.9, shadeHex(pal.roof, 0.15), { p: [x + r * 0.5, y + r * 1.4, z - r * 0.3] }); }
}
function tower(kit, x, z, r, h, pal, style) {
  if (style === 'palisade') kit.cyl(r, r * 1.1, h, pal.wood, { p: [x, h / 2, z] }, 8);
  else if (style === 'grove') { kit.cyl(r * 0.8, r * 1.3, h, pal.wood, { p: [x, h / 2, z] }, 7); for (let i = 0; i < 3; i++) kit.torus(r * 0.9, 0.08, pal.roof, { p: [x, h * (0.3 + i * 0.25), z], r: [Math.PI / 2, 0, 0] }); }
  else { kit.cyl(r, r * 1.08, h, style === 'crypt' ? pal.stoneDark : pal.stone, { p: [x, h / 2, z] }, 12); kit.cyl(r * 1.12, r * 1.12, 0.4, pal.stoneDark, { p: [x, h - 0.2, z] }, 12); }
  towerTop(kit, x, z, h, r, pal, style);
}

// ================================================================ the Keep
/**
 * The Keep for a race: a squat great hall with four corner towers in the race style and a tall
 * central tower carrying the player's flag. Built at the origin facing -z (toward the field).
 * Returns { group, flag, update(t) }.
 */
export function makeKeep(identity, race, color) {
  const R = identity.race(race), st = R.style, kit = new Kit();
  kit.cyl(8, 8.6, 0.8, R.stoneDark, { p: [0, 0.4, 0] }, 8);
  const W = 9, D = 6.5, H = 4.6;
  if (st === 'palisade') { kit.box(W, H, D, R.wood, { p: [0, H / 2 + 0.8, 0] }); kit.cone(W * 0.75, 3, R.roof, { p: [0, H + 2.3, 0], r: [0, Math.PI / 4, 0], s: [1, 1, D / W] }, 4); for (const s of [-1, 1]) kit.cone(0.3, 3.4, R.trim, { p: [s * 1.6, H * 0.85, -D / 2 - 0.9], r: [-0.9, 0, s * 0.5] }, 6); }
  else if (st === 'grove') { kit.cyl(3.6, 4.6, H + 1.6, R.wood, { p: [0, (H + 1.6) / 2 + 0.8, 0] }, 9); kit.ico(5.2, R.roof, { p: [0, H + 3.4, 0], s: [1, 0.7, 1] }); kit.ico(3.4, shadeHex(R.roof, 0.18), { p: [1.8, H + 4.8, -1] }); }
  else {
    kit.box(W, H, D, R.stone, { p: [0, H / 2 + 0.8, 0] });
    if (st === 'stone') merlons(kit, W, H + 0.8, D, R.stone, { gap: 1.8 });
    else for (let x = -W / 2 + 0.6; x < W / 2; x += 1.2) kit.cone(0.3, 1.0, R.roof, { p: [x, H + 1.3, -D / 2 + 0.3] }, 4);
  }
  // the gate toward the field, and a door + windows on the camera side
  kit.box(2.6, 3.2, 0.4, '#2a1e16', { p: [0, 2.4, -D / 2 - 0.15] });
  kit.box(3.2, 0.5, 0.6, R.stoneDark, { p: [0, 4.1, -D / 2 - 0.2] });
  for (const x of [-2.6, 2.6]) kit.box(0.8, 1.2, 0.2, R.glow, { p: [x, 3.6, D / 2 + 0.05], kind: 'glow' });
  kit.box(1.8, 2.4, 0.3, '#2a1e16', { p: [0, 2, D / 2 + 0.1] });
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) tower(kit, x, z, 1.5, H + 3.2, R, st);
  // central tower with the flag
  const cH = H + 5.5;
  if (st !== 'grove') { kit.box(3.2, cH, 3.2, st === 'palisade' ? shadeHex(R.wood, -0.1) : R.stone, { p: [0, cH / 2 + 0.8, 0] }); towerTop(kit, 0, 0, cH + 0.8, 1.9, R, st); }
  kit.cyl(0.08, 0.1, 4, '#4a3a2a', { p: [0, cH + 4.8, 0] }, 6);
  const group = kit.build('keep');
  const flagMat = clothMaterial(identity, race, color, 'flag');
  const fg = new THREE.PlaneGeometry(2.4, 1.6, 8, 2); fg.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(fg, flagMat); flag.position.set(0.1, cH + 5.8, 0); flag.userData.base = Float32Array.from(fg.attributes.position.array);
  group.add(flag);
  return {
    group, flag,
    update(t) {
      const p = fg.attributes.position, b = flag.userData.base;
      for (let i = 0; i < p.count; i++) p.array[i * 3 + 2] = Math.sin(t * 3.2 + b[i * 3] * 2.2) * 0.14 * b[i * 3];
      p.needsUpdate = true;
    },
  };
}

// ================================================================ banner ring (falls one by one)
/**
 * Banner poles in a half-ring in front of the Keep (toward the field). `setFraction(f)` lowers every
 * pole above f*count; poles fall one at a time 0.28 s apart, tip over with a bounce, and the cloth
 * lies on the ground darkened. A pole that comes back (Rally) stands up again.
 */
function bannerRing(identity, race, color, { count = 14, radius = 9.5 } = {}) {
  const group = new THREE.Group(), R = identity.race(race);
  const mat = clothMaterial(identity, race, color, 'banner');
  const downMat = mat.clone(); downMat.color = new THREE.Color(0.45, 0.42, 0.4);
  const poleKit = new Kit();
  poleKit.cyl(0.07, 0.09, 4.4, R.wood, { p: [0, 2.2, 0] }, 6);
  poleKit.box(1.2, 0.08, 0.08, R.wood, { p: [0, 4.2, 0] });
  poleKit.sphere(0.12, R.metal, { p: [0, 4.48, 0], kind: 'metal' }, 6);
  const poleGeo = poleKit.geometry('std'), knobGeo = poleKit.geometry('metal');
  const poles = [];
  for (let i = 0; i < count; i++) {
    const a = Math.PI + ((i + 0.5) / count) * Math.PI;            // the field side (-z)
    const p = new THREE.Group(); p.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    p.rotation.y = -a - Math.PI / 2;                                // cloth faces out, toward the field
    const tip = new THREE.Group(); p.add(tip);
    tip.add(new THREE.Mesh(poleGeo, kitMaterial('std')), new THREE.Mesh(knobGeo, kitMaterial('metal')));
    const cloth = hangingBanner(mat, 0.95, 1.7); cloth.position.set(0, 4.15, 0.05); tip.add(cloth);
    // the tip falls toward the field, away from the Keep: rotate about local x
    p.userData = { tip, cloth, phase: i * 0.9, fall: 0, vel: 0, down: false, at: 0, bounced: false };
    group.add(p); poles.push(p);
  }
  let queue = 0;
  return {
    group, poles,
    setFraction(f, now = 0) {
      const up = Math.ceil(Math.max(0, Math.min(1, f)) * count - 1e-6);
      // drop from the outside in, alternating ends, so the line visibly shrinks
      const order = [...Array(count).keys()].sort((a, b) => Math.abs(b - (count - 1) / 2) - Math.abs(a - (count - 1) / 2) || a - b);
      order.forEach((idx, rank) => {
        const u = poles[idx].userData, wantDown = rank < count - up;
        if (wantDown && !u.down) { u.down = true; u.at = Math.max(now, queue); queue = u.at + 0.28; u.bounced = false; }
        else if (!wantDown && u.down) { u.down = false; u.cloth.material = mat; }
      });
    },
    update(t, dt) {
      if (queue < t - 1) queue = t;
      for (const p of poles) {
        const u = p.userData;
        if (u.down && t >= u.at) {
          // a falling stick: angular acceleration grows as it tips, then a damped bounce at the ground
          const target = 1.5;
          if (u.fall < target) { u.vel += (2.5 + Math.sin(u.fall) * 9) * dt; u.fall += u.vel * dt; }
          if (u.fall >= target) { u.fall = target; if (!u.bounced && u.vel > 0.6) { u.vel = -u.vel * 0.28; u.bounced = true; u.fall = target - 0.001; } else { u.vel = 0; u.cloth.material = downMat; } }
        } else if (!u.down && u.fall > 0) { u.fall = Math.max(0, u.fall - dt * 1.6); u.vel = 0; }
        u.tip.rotation.x = -u.fall;
        if (u.fall < 0.2) waveCloth(u.cloth, t, 0.1, u.phase);
      }
    },
  };
}

// ================================================================ gatehouse
function gatehouse(kit, x, z, pal, style, w = 7.4) {
  const h = 3.2;
  tower(kit, x - w / 2 - 0.8, z, 1.7, h + 4, pal, style);
  tower(kit, x + w / 2 + 0.8, z, 1.7, h + 4, pal, style);
  if (style === 'palisade') { kit.box(w + 1, 0.8, 1.6, pal.wood, { p: [x, h + 2.2, z] }); for (const s of [-1, 1]) kit.cone(0.32, 3.4, pal.trim, { p: [x + s * 2.2, h + 3.2, z - 0.4], r: [0, 0, s * 0.9] }, 6); kit.sphere(0.6, pal.trim, { p: [x, h + 2.9, z - 0.6], s: [1, 0.85, 1] }, 8); }
  else if (style === 'grove') { kit.torus(w / 2 + 0.4, 0.45, pal.wood, { p: [x, h - 0.4, z], r: [0, 0, 0] }, Math.PI); for (let i = 0; i < 7; i++) kit.ico(0.7, pal.roof, { p: [x + Math.cos(i / 6 * Math.PI) * (w / 2 + 0.4), h - 0.4 + Math.sin(i / 6 * Math.PI) * (w / 2 + 0.4), z] }); }
  else { kit.box(w + 1.2, 1.6, 1.8, style === 'crypt' ? pal.stoneDark : pal.stone, { p: [x, h + 1.6, z] }); if (style === 'stone') merlons(kit, w + 1.2, h + 2.4, 1.8, pal.stone, { gap: 1.6 }); else kit.cone(1.2, 1.8, pal.roof, { p: [x, h + 3.3, z] }, 4); }
  // portcullis, raised half way
  for (let i = -3; i <= 3; i++) kit.box(0.08, 2.0, 0.08, pal.metal, { p: [x + i * 0.9, h + 0.6, z - 0.2], kind: 'metal' });
  for (let j = 0; j < 3; j++) kit.box(w * 0.9, 0.08, 0.08, pal.metal, { p: [x, h - 0.2 + j * 0.6, z - 0.2], kind: 'metal' });
  for (const s of [-1, 1]) kit.sphere(0.18, pal.glow, { p: [x + s * (w / 2 + 0.3), h + 0.3, z + 1.0], kind: 'glow' }, 6);
}

// ================================================================ town buildings (shared ring)
/**
 * Every town building has an INTERACTION RING on the ground in the player's colour: faint always
 * (so you know where to stand), brighter while hovered/near, pulsing while `ready` (the thing it
 * sells is affordable). Returns { group, radius, setReady(v), setHover(v), update(dt), ...extra }.
 */
function withInteraction(group, { radius, color, glow, ringY = 0.06, ringZ = 0, tick = null, extra = {} }) {
  const c = new THREE.Color(glow || '#ffd070').lerp(new THREE.Color(color), 0.4);
  const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.55, radius, 72), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(0, ringY, ringZ); ring.renderOrder = 2;
  const inner = new THREE.Mesh(new THREE.RingGeometry(radius - 1.15, radius - 0.95, 72), ringMat); inner.rotation.x = -Math.PI / 2; inner.position.set(0, ringY + 0.01, ringZ);
  group.add(ring, inner);
  let ready = false, hover = false, k = 0, h = 0, t = 0, base = 1;
  return {
    group, radius, ring, ...extra,
    /** Match the ring to a gameplay radius (world metres; the building's own scale is undone). */
    setRadius(r) { const sc = group.scale.x || 1; base = r / sc / radius; ring.scale.setScalar(base); inner.scale.setScalar(base); this.radius = r; },
    get ready() { return ready; }, get hover() { return hover; },
    setReady(v) { ready = !!v; }, setHover(v) { hover = !!v; },
    update(dt) {
      t += dt; k += ((ready ? 1 : 0) - k) * Math.min(1, dt * 3.5); h += ((hover ? 1 : 0) - h) * Math.min(1, dt * 8);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
      ringMat.opacity = 0.18 + h * 0.4 + k * (0.25 + 0.35 * pulse);
      ring.scale.setScalar(base * (1 + k * pulse * 0.03));
      tick?.(dt, t, k, h);
    },
  };
}

/** The DRILL YARD (unit upgrades): a forge shed beside a fenced training yard with straw targets. */
export function makeDrillYard(identity, race, color = identity.race(race).cloth) {
  const body = forgeBody(identity, race), R = identity.race(race);
  return withInteraction(body.group, { radius: 7.2, color, glow: R.glow, ringY: 0.44, ringZ: 3.2, tick: (dt, t) => body.tick(t) });
}

/**
 * The OUTFITTER (the shop — items): a merchant's front with a striped awning in the player's colour, a counter of
 * goods (bottles that glow, crates, barrels, a weapon rack) and a big coin sign. Race style decides
 * the building behind the stall.
 */
export function makeOutfitter(identity, race, color) {
  const R = identity.race(race), st = R.style, kit = new Kit();
  kit.box(7, 0.35, 6, R.stoneDark, { p: [0, 0.17, 0.4] });
  if (st === 'stone') { kit.box(5.6, 3.4, 3.6, R.trim, { p: [0, 2.05, -0.8] }); for (const x of [-2.8, 0, 2.8]) kit.box(0.2, 3.4, 3.64, R.wood, { p: [x, 2.05, -0.8] }); kit.box(6, 0.3, 4, R.wood, { p: [0, 3.9, -0.8] }); kit.cone(4.6, 2.4, R.roof, { p: [0, 5.2, -0.8], r: [0, Math.PI / 4, 0], s: [1, 1, 0.75] }, 4); }
  else if (st === 'palisade') { kit.cone(3.8, 4.6, R.roof, { p: [0, 2.6, -1], s: [1, 1, 0.8] }, 7); for (let i = 0; i < 5; i++) kit.cyl(0.05, 0.05, 1.6, R.wood, { p: [Math.cos(i) * 0.5, 5.2, -1 + Math.sin(i) * 0.5], r: [Math.sin(i) * 0.4, 0, Math.cos(i) * 0.4] }, 4); for (let i = 0; i < 4; i++) kit.box(1.1, 0.06, 0.8, '#8a6a48', { p: [-1.6 + i * 1.1, 1.4, -2.9], r: [0.3, 0, 0] }); }
  else if (st === 'crypt') { kit.box(5.4, 3.6, 3.4, R.stone, { p: [0, 2.15, -0.9] }); kit.box(5.8, 0.4, 3.8, R.stoneDark, { p: [0, 4.1, -0.9] }); kit.cone(3.9, 2.0, R.roof, { p: [0, 5.3, -0.9], r: [0, Math.PI / 4, 0], s: [1, 1, 0.7] }, 4); for (let i = 0; i < 6; i++) kit.sphere(0.13, ['#7ff2ff', '#9aff7a', '#c48aff'][i % 3], { p: [-1.6 + i * 0.64, 2.6, 0.82], kind: 'glow' }, 6); kit.box(4.2, 0.1, 0.4, R.stoneDark, { p: [0, 2.42, 0.8] }); }
  else { kit.cyl(2.4, 3.0, 3.0, R.wood, { p: [0, 1.85, -1] }, 9); kit.ico(3.6, R.roof, { p: [0, 4.4, -1], s: [1.1, 0.6, 1] }); for (let i = 0; i < 5; i++) kit.cyl(0.03, 0.03, 0.8, '#6a8a3a', { p: [-1.6 + i * 0.8, 3.0, 1.9] }, 4); }
  // the stall: counter, posts, striped awning in the player's colour
  kit.box(5.2, 1.0, 1.0, R.wood, { p: [0, 0.85, 1.7] });
  for (const x of [-2.5, 2.5]) kit.cyl(0.08, 0.08, 2.6, R.wood, { p: [x, 1.65, 2.2] }, 6);
  for (let i = 0; i < 6; i++) kit.box(5.6 / 6, 0.08, 1.9, i % 2 ? color : R.trim, { p: [-2.8 + (i + 0.5) * 5.6 / 6, 3.05, 1.6], r: [0.28, 0, 0], kind: 'cloth' });
  // goods: bottles (glow), crates, barrels, shields and swords on a rack
  for (let i = 0; i < 7; i++) kit.cyl(0.08, 0.1, 0.32, ['#ff5a4a', '#5aa0ff', '#7aff6a', '#ffd04a'][i % 4], { p: [-2.1 + i * 0.7, 1.52, 1.7], kind: 'glow' }, 6);
  kit.box(0.9, 0.9, 0.9, '#8a6a42', { p: [-3.0, 0.8, 3.0], r: [0, 0.4, 0] }); kit.box(0.7, 0.7, 0.7, '#7a5a38', { p: [-3.1, 1.6, 3.0], r: [0, 0.9, 0] });
  kit.cyl(0.42, 0.42, 0.9, R.wood, { p: [3.1, 0.8, 3.0] }, 9); kit.cyl(0.45, 0.45, 0.06, R.metal, { p: [3.1, 1.0, 3.0], kind: 'metal' }, 9);
  for (let i = 0; i < 3; i++) kit.box(0.06, 1.4, 0.18, R.metal, { p: [2.6 + i * 0.3, 1.5, 2.4], r: [0, 0, 0.15], kind: 'metal' });
  kit.cyl(0.5, 0.5, 0.1, color, { p: [-2.6, 1.3, 2.35], r: [Math.PI / 2 - 0.2, 0, 0] }, 12);
  // the coin sign on a bracket
  kit.box(0.1, 0.1, 1.4, R.wood, { p: [2.9, 3.9, 2.6] });
  kit.cyl(0.62, 0.62, 0.12, '#e0b040', { p: [2.9, 3.2, 3.2], r: [Math.PI / 2, 0, 0], kind: 'metal' }, 18); kit.cyl(0.42, 0.42, 0.14, '#ffd870', { p: [2.9, 3.2, 3.2], r: [Math.PI / 2, 0, 0], kind: 'metal' }, 6);
  const group = kit.build('shop');
  return withInteraction(group, { radius: 5.6, color, glow: R.glow, ringY: 0.4, ringZ: 0.8 });
}

/**
 * The SANCTUM (one-shot powers: defensive / offensive / neutral): a shrine whose crystal
 * floats over a rune ring, circled by three orbs — blue for defence, red for offence, gold for the
 * neutral powers. Race style: stone = a chapel with a bell tower, palisade = a totem hut round a
 * brazier, crypt = an obelisk, grove = a ring of standing stones round a glowing heart-tree.
 * `flash(kind)` pulses the matching orb when a power is bought or cast.
 */
export function makeSanctum(identity, race, color) {
  const R = identity.race(race), st = R.style, kit = new Kit();
  kit.cyl(4.8, 5.2, 0.4, R.stoneDark, { p: [0, 0.2, 0] }, 12);
  let top = 6.5;
  if (st === 'stone') { kit.box(4, 3.4, 4, R.stone, { p: [0, 2.1, -0.6] }); kit.cone(3.2, 2.2, R.roof, { p: [0, 4.9, -0.6], r: [0, Math.PI / 4, 0] }, 4); kit.box(1.6, 5.6, 1.6, R.stone, { p: [1.6, 3.2, -1.8] }); kit.cone(1.3, 2.2, R.roof, { p: [1.6, 7.1, -1.8], r: [0, Math.PI / 4, 0] }, 4); kit.box(1.2, 2.2, 0.2, '#2a1e16', { p: [0, 1.5, 1.42] }); top = 7.4; }
  else if (st === 'palisade') { kit.cone(3.0, 3.6, R.roof, { p: [-1.4, 2.2, -1.4] }, 7); for (const [x, z] of [[2.6, 1.6], [-2.6, 1.8], [2.4, -2.2]]) { kit.cyl(0.2, 0.25, 4.4, R.wood, { p: [x, 2.2, z] }, 6); kit.sphere(0.4, R.trim, { p: [x, 4.6, z], s: [1, 1.1, 1.2] }, 7); kit.box(0.9, 0.12, 0.12, R.roof, { p: [x, 3.6, z] }); } kit.cyl(0.9, 0.6, 1.0, '#3a3430', { p: [0, 0.9, 0.6] }, 10); kit.sphere(0.5, '#ff8a2a', { p: [0, 1.5, 0.6], s: [1, 0.6, 1], kind: 'glow' }, 8); top = 5.6; }
  else if (st === 'crypt') { kit.box(1.8, 6.4, 1.8, R.stoneDark, { p: [0, 3.6, -0.6] }); kit.cone(1.3, 1.8, R.stone, { p: [0, 7.7, -0.6], r: [0, Math.PI / 4, 0] }, 4); for (const s of [-1, 1]) kit.box(0.7, 2.6, 0.7, R.stone, { p: [s * 2.6, 1.7, 0.6] }), kit.sphere(0.25, R.glow, { p: [s * 2.6, 3.2, 0.6], kind: 'glow' }, 6); top = 8.8; }
  else { for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; kit.box(0.7, 2.4 + (i % 2) * 0.8, 0.45, R.stone, { p: [Math.cos(a) * 3.9, 1.4, Math.sin(a) * 3.9], r: [0, -a, 0.04] }); } kit.cyl(0.4, 0.8, 4, R.wood, { p: [0, 2.2, 0] }, 7); kit.ico(1.8, R.roof, { p: [0, 4.6, 0], s: [1, 0.8, 1] }); top = 6.4; }
  // the rune ring on the ground
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; kit.box(0.5, 0.06, 0.16, R.glow, { p: [Math.cos(a) * 3.4, 0.43, Math.sin(a) * 3.4], r: [0, -a, 0], kind: 'glow' }); }
  const group = kit.build('sanctum');
  const crystalMat = new THREE.MeshStandardMaterial({ color: R.glow, emissive: R.glow, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.1, flatShading: true });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), crystalMat); crystal.scale.set(0.8, 1.5, 0.8); crystal.position.y = top + 1.4; group.add(crystal);
  const KINDS = { defensive: '#4fa8ff', offensive: '#ff5a3a', neutral: '#ffd24a' };
  const orbs = Object.entries(KINDS).map(([kind, c], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.9 }));
    m.userData = { kind, a: i / 3 * TAU, flash: 0 }; group.add(m); return m;
  });
  return withInteraction(group, { radius: 5.6, color, glow: R.glow, ringY: 0.43, tick(dt, t, k) {
    crystal.rotation.y += dt * (0.6 + k * 1.2); crystal.position.y = top + 1.4 + Math.sin(t * 1.6) * 0.25;
    crystalMat.emissiveIntensity = 1.0 + k * 0.8 + Math.sin(t * 3) * 0.2;
    for (const o of orbs) { const u = o.userData; u.flash = Math.max(0, u.flash - dt * 1.5); const a = u.a + t * 0.9; o.position.set(Math.cos(a) * 1.8, top + 1.3 + Math.sin(t * 2 + u.a) * 0.3, Math.sin(a) * 1.8); o.scale.setScalar(1 + u.flash * 1.2); }
  }, extra: { crystal, orbs, flash(kind) { const o = orbs.find(x => x.userData.kind === kind); if (o) o.userData.flash = 1; } } });
}

function forgeBody(identity, race) {
  const R = identity.race(race), st = R.style, kit = new Kit();
  kit.box(6.2, 0.4, 5, R.stoneDark, { p: [0, 0.2, 0] });
  if (st === 'grove') { kit.cyl(2.2, 2.8, 3.4, R.wood, { p: [0, 2.1, 0] }, 8); kit.ico(3.6, R.roof, { p: [0, 4.6, 0], s: [1, 0.7, 1] }); }
  else if (st === 'palisade') { kit.box(5, 2.6, 4, R.wood, { p: [0, 1.7, 0] }); kit.cone(4.2, 2.4, R.roof, { p: [0, 4.2, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.8] }, 4); }
  else { kit.box(5, 2.8, 4, st === 'crypt' ? R.stoneDark : R.stone, { p: [0, 1.8, 0] }); for (const x of [-2.5, -0.8, 0.8, 2.5]) kit.box(0.25, 2.8, 0.25, R.wood, { p: [x, 1.8, 2.02] }); kit.cone(4.2, 2.2, R.roof, { p: [0, 4.3, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.8] }, 4); }
  // chimney + forge mouth facing the camera
  kit.box(0.9, 2.6, 0.9, R.stoneDark, { p: [1.8, 5, -1.1] });
  kit.box(1.4, 0.9, 0.2, '#ff8a2a', { p: [-1.2, 1.1, 2.06], kind: 'glow' });
  kit.box(1.8, 0.3, 0.5, R.stoneDark, { p: [-1.2, 1.7, 2.1] });
  // anvil on a stump
  kit.cyl(0.35, 0.4, 0.6, R.wood, { p: [1.2, 0.7, 3.1] }, 8);
  kit.box(0.8, 0.3, 0.35, '#3a3c40', { p: [1.2, 1.15, 3.1], kind: 'metal' }); kit.cone(0.15, 0.4, '#3a3c40', { p: [1.75, 1.15, 3.1], r: [0, 0, -Math.PI / 2], kind: 'metal' }, 6);
  // weapon rack with spears and a shield
  kit.box(2.2, 0.15, 0.15, R.wood, { p: [-2.9, 1.6, 2.6], r: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 4; i++) { kit.cyl(0.04, 0.04, 2.2, R.wood, { p: [-3.05, 1.2, 1.8 + i * 0.5], r: [0, 0, 0.12] }, 5); kit.cone(0.08, 0.35, R.metal, { p: [-3.18, 2.4, 1.8 + i * 0.5], kind: 'metal' }, 5); }
  kit.cyl(0.55, 0.55, 0.1, R.cloth, { p: [-2.6, 0.9, 3.4], r: [Math.PI / 2, 0, 0.3] }, 12);
  kit.cyl(0.4, 0.4, 0.8, R.wood, { p: [2.6, 0.8, 2.6] }, 8);                 // barrel
  // a hanging sign
  kit.box(1.2, 0.7, 0.08, R.wood, { p: [0, 3.2, 2.5] }); kit.box(0.6, 0.3, 0.1, R.metal, { p: [0, 3.2, 2.56], kind: 'metal' });
  // training kit for the troops it improves: an armour stand and a whetstone wheel
  kit.cyl(0.06, 0.06, 1.6, R.wood, { p: [3.2, 1.2, 0.6] }, 5); kit.box(0.9, 0.9, 0.5, R.metal, { p: [3.2, 1.6, 0.6], kind: 'metal' }); kit.sphere(0.25, R.metal, { p: [3.2, 2.3, 0.6], kind: 'metal' }, 8);
  kit.cyl(0.45, 0.45, 0.14, '#8a8478', { p: [-3.4, 0.95, -0.6], r: [0, 0, Math.PI / 2] }, 14); kit.box(0.1, 0.9, 0.9, R.wood, { p: [-3.4, 0.5, -0.6] });
  // the drill yard: a rail fence round a packed-earth square with straw targets
  kit.box(7.5, 0.06, 5.5, '#7a6448', { p: [0, 0.42, 6.2] });
  for (const [x0, z0, x1, z1] of [[-3.8, 3.4, 3.8, 3.4], [-3.8, 9.0, 3.8, 9.0], [-3.8, 3.4, -3.8, 9.0], [3.8, 3.4, 3.8, 9.0]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = -Math.atan2(z1 - z0, x1 - x0);
    for (const y of [0.75, 1.15]) kit.box(len, 0.1, 0.1, R.wood, { p: [(x0 + x1) / 2, y, (z0 + z1) / 2], r: [0, yaw, 0] });
    for (let i = 0; i <= 3; i++) kit.box(0.14, 1.3, 0.14, R.wood, { p: [x0 + (x1 - x0) * i / 3, 0.85, z0 + (z1 - z0) * i / 3] });
  }
  for (const [x, z] of [[-2, 6.6], [0, 7.6], [2, 6.6]]) { kit.cyl(0.05, 0.05, 1.5, R.wood, { p: [x, 1.15, z] }, 5); kit.box(0.8, 0.1, 0.1, R.wood, { p: [x, 1.55, z] }); kit.sphere(0.3, '#c8a860', { p: [x, 1.4, z], s: [1, 1.35, 0.8] }, 8); kit.sphere(0.2, '#c8a860', { p: [x, 2.0, z] }, 8); }
  const group = kit.build('drill-yard');
  const light = new THREE.PointLight(0xff9040, 5, 10, 2); light.position.set(-1.2, 1.2, 3); group.add(light);
  return { group, tick(t) { light.intensity = 4.2 + Math.sin(t * 13) * 0.6 + Math.sin(t * 7.3) * 0.5; } };
}


// ================================================================ Barracks
/**
 * THE BARRACKS — where you hire units to send down the enemy's field. Reads as a barracks from the
 * RTS camera: long and low with a big door, a yard of training gear, a shield-on-crossed-spears plaque
 * and two banner poles in the player's colour. One variant per race style:
 *   stone    (Freeholds) half-timbered hall, slate roof, spear racks, a straw training dummy
 *   palisade (Ashtusk)   dark log longhouse under a red hide roof, tusk arch over the door, war drum
 *   crypt    (Unburied)  a pale mausoleum with pointed spires, glowing windows, coffins standing up
 *   grove    (Thornmane) a hollow great-tree lodge with an antler arch and a ring of standing stones
 * `setReady(true)` when a send is affordable: the ring pulses, the windows brighten and the yard
 * banner rises to the top of its tall pole. Built at the origin, door facing +z.
 */
export function makeBarracks(identity, race, color) {
  const R = identity.race(race), st = R.style, kit = new Kit(), win = new Kit();
  const W = 8, D = 5;
  kit.box(W + 2.4, 0.35, D + 4, R.stoneDark, { p: [0, 0.17, 0.8] });        // yard + footing
  if (st === 'stone') {
    kit.box(W, 1.0, D, R.stone, { p: [0, 0.85, 0] });
    kit.box(W, 2.0, D, R.trim, { p: [0, 2.35, 0] });
    for (const x of [-W / 2, -W / 4, 0, W / 4, W / 2]) kit.box(0.22, 2.0, D + 0.04, R.wood, { p: [x, 2.35, 0] });
    for (const x of [-W / 2 + 1, W / 2 - 1]) kit.box(1.6, 0.18, 0.06, R.wood, { p: [x, 2.35, D / 2 + 0.02], r: [0, 0, 0.6] });
    kit.box(W + 0.2, 0.25, D + 0.04, R.wood, { p: [0, 3.35, 0] });
    kit.cone(W * 0.62, 2.6, R.roof, { p: [0, 4.75, 0], r: [0, Math.PI / 4, 0], s: [1.15, 1, (D + 1) / W] }, 4);
    kit.box(0.7, 1.4, 0.7, R.stoneDark, { p: [W / 2 - 1.4, 5.4, -0.8] });
    // spear racks and a training dummy
    for (const s of [-1, 1]) { kit.box(0.12, 1.2, 1.8, R.wood, { p: [s * (W / 2 + 0.6), 0.9, 2.2] }); for (let i = 0; i < 4; i++) { kit.cyl(0.035, 0.035, 2.4, R.wood, { p: [s * (W / 2 + 0.75), 1.45, 1.5 + i * 0.45] }, 5); kit.cone(0.07, 0.3, R.metal, { p: [s * (W / 2 + 0.75), 2.75, 1.5 + i * 0.45], kind: 'metal' }, 5); } }
    kit.cyl(0.06, 0.06, 1.8, R.wood, { p: [2.2, 1.25, 4.3] }, 5); kit.box(0.9, 0.12, 0.12, R.wood, { p: [2.2, 1.7, 4.3] }); kit.sphere(0.32, '#c8a860', { p: [2.2, 1.55, 4.3], s: [1, 1.3, 0.8] }, 8); kit.sphere(0.2, '#c8a860', { p: [2.2, 2.15, 4.3] }, 8);
  } else if (st === 'palisade') {
    kit.box(W, 2.6, D, R.wood, { p: [0, 1.65, 0] });
    for (let x = -W / 2; x <= W / 2; x += 0.5) kit.cyl(0.22, 0.24, 2.8, shadeHex(R.wood, (Math.sin(x * 7) * 0.12)), { p: [x, 1.7, D / 2], }, 6);
    kit.cone(W * 0.66, 3.2, R.roof, { p: [0, 4.5, 0], r: [0, Math.PI / 4, 0], s: [1.2, 1, (D + 1.2) / W] }, 4);
    for (let i = 0; i < 6; i++) kit.cyl(0.08, 0.08, 1.4, R.wood, { p: [-W / 2 + 0.6 + i * 1.4, 6.1, 0], r: [0, 0, (i % 2 ? 0.5 : -0.5)] }, 4);
    for (const s of [-1, 1]) kit.cone(0.26, 3.6, R.trim, { p: [s * 1.25, 3.1, D / 2 + 0.9], r: [0.15, 0, s * -0.5] }, 7);   // tusk arch
    kit.cyl(0.7, 0.6, 0.9, R.roof, { p: [-3, 0.8, 3.6] }, 12); kit.cyl(0.72, 0.72, 0.06, R.trim, { p: [-3, 1.27, 3.6] }, 12);   // war drum
    for (const s of [-1, 1]) { kit.cyl(0.08, 0.1, 2.6, R.wood, { p: [s * (W / 2 + 0.8), 1.3, 3] }, 5); kit.sphere(0.3, R.trim, { p: [s * (W / 2 + 0.8), 2.75, 3], s: [1, 1.15, 1.1] }, 7); }
  } else if (st === 'crypt') {
    kit.box(W, 3.0, D, R.stone, { p: [0, 1.85, 0] });
    kit.box(W + 0.4, 0.4, D + 0.4, R.stoneDark, { p: [0, 3.5, 0] });
    kit.cone(W * 0.6, 2.4, R.roof, { p: [0, 4.9, 0], r: [0, Math.PI / 4, 0], s: [1.1, 1, (D + 0.6) / W] }, 4);
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) { kit.box(0.7, 4.2, 0.7, R.stoneDark, { p: [x, 2.1, z] }); kit.cone(0.55, 1.6, R.roof, { p: [x, 5.0, z] }, 4); }
    kit.cone(1.4, 2.2, R.stone, { p: [0, 3.6, D / 2 + 0.1], r: [0, Math.PI / 4, 0], s: [1, 1, 0.3] }, 4);   // pointed arch over the door
    for (const s of [-1, 1]) { kit.box(0.7, 1.9, 0.35, '#2a2424', { p: [s * (W / 2 + 0.9), 1.0, 2.6], r: [0.2, s * 0.3, 0] }); kit.box(0.5, 1.6, 0.1, R.stoneDark, { p: [s * (W / 2 + 0.95), 1.0, 2.82], r: [0.2, s * 0.3, 0] }); }
    for (let x = -W / 2 - 1; x <= W / 2 + 1; x += 0.5) kit.cone(0.04, 1.2, R.metal, { p: [x, 0.95, 5.2], kind: 'metal' }, 4);
  } else {
    kit.cyl(2.8, 3.8, 5.0, R.wood, { p: [0, 2.85, -0.4] }, 9);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; kit.cyl(0.25, 0.55, 2.4, shadeHex(R.wood, -0.1), { p: [Math.cos(a) * 3.4, 0.8, -0.4 + Math.sin(a) * 3.4], r: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] }, 6); }
    kit.ico(4.6, R.roof, { p: [0, 6.6, -0.4], s: [1.1, 0.75, 1] }); kit.ico(3.0, shadeHex(R.roof, 0.15), { p: [-2, 7.6, -1.5] }); kit.ico(2.6, shadeHex(R.roof, -0.1), { p: [2.4, 7.2, 0.5] });
    for (let i = 0; i < 6; i++) { const a = i / 5 * Math.PI; kit.cone(0.12, 1.2, R.trim, { p: [Math.cos(a) * 1.7, 3.0 + Math.sin(a) * 1.7, 2.6], r: [0, 0, a - Math.PI / 2] }, 5); }     // antler arch
    for (let i = 0; i < 6; i++) { const a = -0.3 + i / 5 * (Math.PI + 0.6); kit.box(0.6, 1.6 + (i % 2) * 0.5, 0.4, R.stone, { p: [Math.cos(a) * 5.2, 0.9, 1.6 + Math.sin(a) * 2.4], r: [0, -a, 0] }); }
  }
  // the door (camera side) and its frame
  const doorZ = st === 'grove' ? 2.75 : D / 2 + 0.05;
  kit.box(2.0, 2.5, 0.25, '#2a1c12', { p: [0, 1.6, doorZ] });
  kit.box(2.5, 0.3, 0.35, st === 'palisade' || st === 'grove' ? R.wood : R.stoneDark, { p: [0, 2.95, doorZ + 0.05] });
  // windows glow (a separate mesh, so `ready` can brighten it)
  const winY = st === 'grove' ? 3.6 : 2.4;
  for (const x of st === 'grove' ? [-1.5, 1.5] : [-W / 2 + 1.2, -1.9, 1.9, W / 2 - 1.2]) win.box(0.8, 0.8, 0.1, R.glow, { p: [x, winY, doorZ + 0.02], kind: 'glow' });
  const group = kit.build('barracks');
  const windows = win.build('barracks-windows').children[0];
  windows.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.55 });
  group.add(windows);
  // yard banners: two fixed poles beside the door, and the "ready" banner on a tall pole that rises
  const mat = clothMaterial(identity, race, color, 'banner');
  const poleK = new Kit(); poleK.cyl(0.08, 0.1, 5.5, R.wood, { p: [0, 2.75, 0] }, 6); poleK.box(1.3, 0.09, 0.09, R.wood, { p: [0, 5.2, 0] }); poleK.sphere(0.14, R.metal, { p: [0, 5.6, 0], kind: 'metal' }, 6);
  const poles = poleK.build('barracks-poles');
  const cloths = [];
  for (const s of [-1, 1]) {
    const p = poles.clone(); p.position.set(s * 2.0, 0, doorZ + 1.6); group.add(p);
    const c = hangingBanner(mat, 1.1, 1.9); c.position.set(s * 2.0, 5.15, doorZ + 1.66); group.add(c); cloths.push(c);
  }
  const readyPole = new THREE.Group(); readyPole.position.set(0, 0, doorZ + 3.6); group.add(readyPole);
  const tall = new Kit(); tall.cyl(0.07, 0.09, 6.5, R.wood, { p: [0, 3.25, 0] }, 6); tall.box(1.5, 0.08, 0.08, R.wood, { p: [0, 6.2, 0] }); readyPole.add(tall.build('ready-pole'));
  const readyCloth = hangingBanner(mat, 1.3, 1.6); readyCloth.position.set(0, 2.2, 0.05); readyPole.add(readyCloth);
  // a recruiting plaque over the door: a shield on crossed spears, the sign of a barracks
  const plaque = new Kit();
  plaque.box(1.9, 1.1, 0.12, R.wood, { p: [0, 3.55, doorZ + 0.2] });
  for (const sgn of [-1, 1]) { plaque.cyl(0.03, 0.03, 1.9, R.wood, { p: [0, 3.6, doorZ + 0.3], r: [0, 0, sgn * 0.75] }, 5); plaque.cone(0.06, 0.22, R.metal, { p: [sgn * 0.68, 4.3, doorZ + 0.3], r: [0, 0, sgn * -0.75], kind: 'metal' }, 5); }
  plaque.cyl(0.42, 0.42, 0.1, R.cloth, { p: [0, 3.5, doorZ + 0.34], r: [Math.PI / 2, 0, 0] }, 14); plaque.torus(0.42, 0.05, R.metal, { p: [0, 3.5, doorZ + 0.38], kind: 'metal' });
  group.add(plaque.build('barracks-plaque'));
  return withInteraction(group, { radius: 7, color, glow: R.glow, ringY: 0.4, ringZ: 0.8, tick(dt, t, k) {
    windows.material.opacity = 0.5 + k * 0.5;
    readyCloth.position.y = 2.2 + k * 3.95;
    for (const c of cloths) waveCloth(c, t, 0.09, c.position.x);
    waveCloth(readyCloth, t * 1.2, 0.12, 2);
  }, extra: { windows } });
}

// ================================================================ ground, ford, props
const GTEX = {};
function speckleTex(key, base, cols, n, seed, rep) {
  if (GTEX[key]) return GTEX[key];
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.25 + r() * 0.5; const s = 1 + r() * 4; g.beginPath(); g.ellipse(r() * 256, r() * 256, s, s * (0.5 + r()), r() * 3, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.repeat.set(rep, rep);
  return (GTEX[key] = t);
}
const GROUNDS = {
  stone: ['#4f6b34', ['#5d7a3c', '#435c2b', '#6a8443', '#3a5226', '#738c4a']],
  palisade: ['#5a5a34', ['#6a6a3c', '#4a4a2a', '#7a6a42', '#3e3a26', '#6e5a3a']],
  crypt: ['#55604f', ['#5f6b58', '#4a5446', '#6a7260', '#434c40', '#6e6c5e']],
  grove: ['#3e5a2e', ['#4a6a36', '#2f4824', '#56743e', '#24381c', '#6a7a40']],
};
function texFor(key, w, d, scale = 10) { const t = key.clone(); t.needsUpdate = true; t.repeat.set(w / scale, d / scale); return t; }

/** Props per race style, as merged geometries for InstancedMesh: [{ geo: {std, glow}, weight }]. */
function propKits(R, st) {
  const out = [];
  const make = (weight, fn) => { const k = new Kit(); fn(k); out.push({ weight, std: k.geometry('std'), glow: k.geometry('glow'), metal: k.geometry('metal') }); };
  if (st === 'stone') {
    make(5, k => { k.cyl(0.25, 0.35, 2.2, '#5a4030', { p: [0, 1.1, 0] }, 6); k.ico(1.7, '#3e6a2e', { p: [0, 3.2, 0] }); k.ico(1.2, '#4a7a34', { p: [0.7, 3.9, 0.3] }); });
    make(2, k => { k.cyl(0.6, 0.6, 1.0, '#c8a860', { p: [0, 0.6, 0], r: [0, 0, Math.PI / 2] }, 10); });
    make(2, k => { for (const x of [-1.4, 0, 1.4]) k.box(0.15, 1.0, 0.15, '#6a5038', { p: [x, 0.5, 0] }); k.box(3, 0.12, 0.08, '#6a5038', { p: [0, 0.8, 0] }); k.box(3, 0.12, 0.08, '#6a5038', { p: [0, 0.45, 0] }); });
    make(1, k => { k.ico(0.8, '#8a867b', { p: [0, 0.4, 0], s: [1.2, 0.7, 1] }); });
  } else if (st === 'palisade') {
    make(4, k => { k.cyl(0.18, 0.3, 2.6, '#4a3a2a', { p: [0, 1.3, 0] }, 5); for (let i = 0; i < 4; i++) k.cyl(0.05, 0.1, 1.2, '#4a3a2a', { p: [Math.cos(i * 1.6) * 0.4, 2 + i * 0.2, Math.sin(i * 1.6) * 0.4], r: [Math.sin(i) * 0.9, 0, Math.cos(i * 1.6) * 0.9] }, 4); });
    make(2, k => { k.cyl(0.07, 0.08, 2.4, '#4a3424', { p: [0, 1.2, 0] }, 5); k.sphere(0.28, R.trim, { p: [0, 2.5, 0], s: [1, 1.1, 1.2] }, 7); for (const s of [-1, 1]) k.cone(0.06, 0.6, R.trim, { p: [s * 0.3, 2.7, 0], r: [0, 0, s * -0.8] }, 4); });
    make(2, k => { k.cone(1.8, 2.2, R.roof, { p: [0, 1.1, 0] }, 6); k.cyl(0.05, 0.05, 2.8, '#3a2a1c', { p: [0, 1.4, 0] }, 4); });
    make(1, k => { k.ico(0.9, '#5a5048', { p: [0, 0.4, 0], s: [1.3, 0.6, 1] }); });
  } else if (st === 'crypt') {
    make(4, k => { k.box(0.7, 1.0, 0.18, '#7e8684', { p: [0, 0.5, 0] }); k.cyl(0.35, 0.35, 0.18, '#7e8684', { p: [0, 1.0, 0], r: [Math.PI / 2, 0, 0] }, 10); });
    make(2, k => { k.box(0.16, 1.3, 0.16, '#6e7674', { p: [0, 0.65, 0] }); k.box(0.7, 0.16, 0.16, '#6e7674', { p: [0, 0.95, 0] }); });
    make(3, k => { k.cyl(0.15, 0.3, 2.4, '#3a3434', { p: [0, 1.2, 0], r: [0, 0, 0.15] }, 5); for (let i = 0; i < 3; i++) k.cyl(0.03, 0.08, 1.3, '#3a3434', { p: [0.3 * Math.cos(i * 2), 2.2, 0.3 * Math.sin(i * 2)], r: [Math.sin(i * 2) * 1.0, 0, -Math.cos(i * 2) * 1.0] }, 4); });
    make(1, k => { k.cyl(0.05, 0.05, 2, '#2a2a2e', { p: [0, 1, 0], kind: 'metal' }, 4); k.box(0.3, 0.4, 0.3, '#2a2a2e', { p: [0, 2.1, 0], kind: 'metal' }); k.sphere(0.12, R.glow, { p: [0, 2.1, 0], kind: 'glow' }, 6); });
  } else {
    make(5, k => { k.cyl(0.2, 0.3, 1.4, '#4a3424', { p: [0, 0.7, 0] }, 6); k.cone(1.5, 2.6, '#2e4a28', { p: [0, 2.2, 0] }, 7); k.cone(1.1, 2.0, '#365630', { p: [0, 3.4, 0] }, 7); k.cone(0.7, 1.4, '#3e6236', { p: [0, 4.4, 0] }, 7); });
    make(3, k => { k.ico(0.9, '#3a5a2a', { p: [0, 0.6, 0], s: [1.2, 0.8, 1] }); for (let i = 0; i < 5; i++) k.cone(0.05, 0.5, R.trim, { p: [Math.cos(i * 1.3) * 0.8, 0.8, Math.sin(i * 1.3) * 0.8], r: [Math.sin(i * 1.3) * 1.2, 0, -Math.cos(i * 1.3) * 1.2] }, 4); });
    make(1, k => { k.box(0.8, 2.6, 0.5, '#7e8064', { p: [0, 1.3, 0], r: [0.05, 0, 0.06] }); });
    make(1, k => { k.cyl(0.08, 0.1, 0.4, '#e8e0c8', { p: [0, 0.2, 0] }, 6); k.sphere(0.3, '#a84a3a', { p: [0, 0.42, 0], s: [1, 0.55, 1] }, 8); });
  }
  return out;
}

// ================================================================ the world
const STYLE_OF = race => ({ freeholds: 'stone', ashtusk: 'palisade', unburied: 'crypt', thornmane: 'grove' })[race] || 'stone';

/** Building kind (sim id) -> model. Names: Outfitter, Barracks, Drill Yard, Sanctum (data/buildings.json). */
export const MAKERS = { shop: (...a) => makeOutfitter(...a), barracks: (...a) => makeBarracks(...a), drillyard: (...a) => makeDrillYard(...a), sanctum: (...a) => makeSanctum(...a) };
const DOOR_YAW = { '+z': 0, '+x': Math.PI / 2, '-x': -Math.PI / 2, '-z': Math.PI };
/** Field-local fallback when no building list is given (mirrors data/buildings.json layouts.vale.default). */
const DEFAULT_TOWN = { shop: { x: -15, z: 126, door: '+x', radius: 7 }, barracks: { x: -14, z: 112, door: '+z' }, drillyard: { x: 16, z: 126, door: '-x' }, sanctum: { x: 16, z: 112, door: '-x' } };

export function buildStructures(scene, layout, { identity = null, identityData = null, teams = null, buildings = null, bannerCount = 14 } = {}) {
  const id = identity || createIdentity(identityData);
  let root = null, fields = [], towns = {}, water = [], t = 0, built = null;

  function teamInfo(team) {
    const row = (teams || []).find(x => x.team === team) || {};
    const race = row.race || (team === 0 ? 'freeholds' : 'ashtusk');
    const color = row.color || (row.slot != null ? id.slotColor(row.slot) : id.teamColor(team));
    return { race, color, R: id.race(race), st: STYLE_OF(race) };
  }

  function build() {
    root = new THREE.Group(); root.name = 'structures'; fields = []; towns = {}; water = [];
    const b = layout.bounds, bw = b.x1 - b.x0 + 300, bd = b.z1 - b.z0 + 300;
    const wild = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), new THREE.MeshStandardMaterial({ map: texFor(speckleTex('wild', '#3d5130', ['#4a6038', '#33452a', '#56693f', '#2c3b24', '#605f3a'], 2600, 11, 1), bw, bd, 14), roughness: 1 }));
    wild.rotation.x = -Math.PI / 2; wild.position.set((b.x0 + b.x1) / 2, -0.03, (b.z0 + b.z1) / 2); root.add(wild);

    for (const f of layout.fields) {
      const T = teamInfo(f.team), R = T.R, st = T.st;
      const g = new THREE.Group(); g.name = 'field' + f.team;
      const zMin = Math.min(f.zGate, f.zKeep), zMax = f.zEnd ?? Math.max(f.zGate, f.zKeep) + 8, w = f.x1 - f.x0, cx = (f.x0 + f.x1) / 2, len = zMax - zMin;
      // floor + lanes
      const [gb, gc] = GROUNDS[st];
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, len + 10), new THREE.MeshStandardMaterial({ map: texFor(speckleTex('g' + st, gb, gc, 2600, 7, 1), w, len + 10), roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, (zMin + zMax) / 2 - 2); g.add(floor);
      const roadTex = speckleTex('road', '#8a7556', ['#9c8663', '#7a6649', '#a8936e', '#6c5a40', '#b19c74'], 3000, 3, 1);
      for (const lane of f.lanes || []) for (let i = 0; i < lane.length - 1; i++) {
        const a = lane[i], c = lane[i + 1], l = Math.hypot(c.x - a.x, c.z - a.z);
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(6, l + 6), new THREE.MeshStandardMaterial({ map: texFor(roadTex, 6, l + 6, 6), roughness: 1, transparent: true, opacity: 0.92 }));
        seg.rotation.x = -Math.PI / 2; seg.rotation.z = -Math.atan2(c.x - a.x, c.z - a.z) + Math.PI; seg.position.set((a.x + c.x) / 2, 0.015 + i * 0.002, (a.z + c.z) / 2); g.add(seg);
      }
      const kit = new Kit();
      // ford: water, muddy banks, stepping stones, reeds
      if (f.ford) {
        const fz = (f.ford.z0 + f.ford.z1) / 2, fl = Math.abs(f.ford.z1 - f.ford.z0);
        const wt = speckleTex('water', '#3d6f86', ['#4c86a0', '#36637a', '#5b98b0', '#7ab0c4'], 600, 9, 1).clone(); wt.needsUpdate = true; wt.repeat.set(w / 8, fl / 8);
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(w, fl), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.88 }));
        wm.rotation.x = -Math.PI / 2; wm.position.set(cx, 0.04, fz); wm.name = 'ford'; g.add(wm); water.push(wt);
        for (const s of [-1, 1]) kit.box(w, 0.06, 1.2, '#4a3e2c', { p: [cx, 0.025, fz + s * (fl / 2 + 0.4)] });
        const r = rng(31 + f.team);
        for (let i = 0; i < 14; i++) kit.cyl(0.55 + r() * 0.3, 0.7, 0.28, R.stoneDark, { p: [cx + (r() - 0.5) * w * 0.9, 0.1, fz + (r() - 0.5) * fl * 0.7], r: [0, r() * 3, 0] }, 7);
        for (let i = 0; i < 70; i++) { const s = r() < 0.5 ? -1 : 1; kit.cone(0.05, 0.9 + r() * 0.7, r() < 0.2 ? '#8a7a40' : '#5a7a3a', { p: [cx + (r() - 0.5) * w, 0.45, fz + s * (fl / 2 + (r() - 0.3) * 1.2)], r: [(r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4] }, 4); }
      }
      // side walls, gate wall with gatehouses, Keep wall
      const th = 1.4;
      wallRun(kit, { x: f.x0 - th / 2, z: zMin - 6 }, { x: f.x0 - th / 2, z: zMax + 2 }, R, st, { seed: 11 + f.team });
      wallRun(kit, { x: f.x1 + th / 2, z: zMin - 6 }, { x: f.x1 + th / 2, z: zMax + 2 }, R, st, { seed: 13 + f.team });
      const gz = f.zGate - 6;
      const gxs = (f.gates || []).map(p => p.x).sort((a, c) => a - c);
      let lastX = f.x0 - th;
      for (const gx of gxs) { if (gx - 5.2 - lastX > 0.5) wallRun(kit, { x: lastX, z: gz }, { x: gx - 5.2, z: gz }, R, st, { h: 4.2, th: 2.2, seed: gx | 0 }); gatehouse(kit, gx, gz, R, st); lastX = gx + 5.2; }
      wallRun(kit, { x: lastX, z: gz }, { x: f.x1 + th, z: gz }, R, st, { h: 4.2, th: 2.2, seed: 99 });
      wallRun(kit, { x: f.x0 - th, z: zMax + 2 }, { x: f.x1 + th, z: zMax + 2 }, R, st, { seed: 7 });
      // grass tufts along the walls inside the field
      const r2 = rng(77 + f.team);
      for (let i = 0; i < 90; i++) { const sx = r2() < 0.5 ? f.x0 + 1 + r2() * 3 : f.x1 - 1 - r2() * 3; kit.cone(0.25 + r2() * 0.2, 0.5 + r2() * 0.4, shadeHex(gb, 0.15 + r2() * 0.2), { p: [sx, 0.25, zMin + r2() * len] }, 5); }
      const walls = kit.build('walls'); g.add(walls);
      // gate banners (two per gate, hanging off the gatehouse)
      const bannerMat = clothMaterial(id, T.race, T.color, 'banner'), gateCloths = [];
      for (const gx of gxs) for (const s of [-1, 1]) { for (const side of [-1, 1]) { const c = hangingBanner(bannerMat, 1.2, 2.4); c.position.set(gx + s * 2.6, 6.6, gz + side * 1.15); if (side < 0) c.rotation.y = Math.PI; g.add(c); gateCloths.push(c); } }

      // the Keep and its banners
      const keep = makeKeep(id, T.race, T.color); keep.group.position.set(f.keep.x, 0, f.keep.z + 1.5); g.add(keep.group);
      const ring = bannerRing(id, T.race, T.color, { count: bannerCount }); ring.group.position.set(f.keep.x, 0, f.keep.z + 1.5); g.add(ring.group);
      // the town: the four buildings (sim: data/buildings.json -> buildingsInfo / buildingsFor)
      const town = {};
      const mine = (buildings || []).filter(b => b.team === f.team);
      const rows = mine.length ? mine : Object.entries(DEFAULT_TOWN).map(([kind, at]) => ({ kind, team: f.team, x: (f.x0 + f.x1) / 2 + at.x, z: at.z, door: at.door, radius: at.radius }));
      for (const row of rows) {
        const make = MAKERS[row.kind]; if (!make) continue;
        const b = make(id, T.race, T.color);
        b.group.position.set(row.x, 0, row.z); b.group.rotation.y = DOOR_YAW[row.door] ?? 0;
        b.position = new THREE.Vector3(row.x, 0, row.z); b.kind = row.kind; b.team = f.team; b.id = row.id || `t${f.team}.${row.kind}`;
        b.useRadius = row.radius ?? null;               // the sim's "stand inside" radius (Outfitter), null = from anywhere
        if (b.useRadius) b.setRadius(b.useRadius);
        g.add(b.group); town[row.kind] = b;
      }
      towns[f.team] = town;

      root.add(g);
      fields.push({ team: f.team, group: g, keep, banners: ring, town, gateCloths, layout: f, race: T.race });
    }
    decorate();
    scene.add(root);
    built = true;
  }

  /** Race props outside the walls: each field's own theme on its side of the vale. */
  function decorate() {
    const b = layout.bounds, inField = (x, z) => layout.fields.some(f => x > f.x0 - 5 && x < f.x1 + 5 && z > Math.min(f.zGate, f.zKeep) - 16 && z < (f.zEnd ?? f.zKeep + 8) + 10);
    const o = new THREE.Object3D(), mid = (b.x0 + b.x1) / 2;
    for (const F of fields) {
      const T = teamInfo(F.team), kits = propKits(T.R, T.st), total = kits.reduce((a, k) => a + k.weight, 0);
      const left = F.layout.x1 < mid || (F.layout.x0 + F.layout.x1) / 2 < mid;
      const x0 = left ? b.x0 - 110 : mid, x1 = left ? mid : b.x1 + 110;
      const r = rng(900 + F.team);
      const lists = kits.map(() => []);
      let tries = 0, n = 0;
      while (n < 420 && tries < 10000) {
        tries++;
        const x = x0 + r() * (x1 - x0), z = b.z0 - 80 + r() * (b.z1 - b.z0 + 150);
        if (inField(x, z)) continue;
        let pick = r() * total, k = 0; while (pick > kits[k].weight) { pick -= kits[k].weight; k++; }
        const s = 0.75 + r() * 0.7; o.position.set(x, 0, z); o.rotation.set(0, r() * TAU, 0); o.scale.setScalar(s); o.updateMatrix();
        lists[k].push(o.matrix.clone()); n++;
      }
      kits.forEach((kt, i) => {
        for (const kind of ['std', 'glow', 'metal']) {
          if (!kt[kind] || !lists[i].length) continue;
          const m = new THREE.InstancedMesh(kt[kind], kitMaterial(kind), lists[i].length);
          lists[i].forEach((mx, j) => m.setMatrixAt(j, mx)); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
          root.add(m);
        }
      });
    }
  }

  function dispose() {
    if (!root) return;
    scene.remove(root);
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !Object.values(MATS).includes(o.material)) o.material.dispose?.(); });
    root = null;
  }

  build();
  return {
    get root() { return root; }, get fields() { return fields; }, get towns() { return towns; },
    /** Every town building as a flat list: { kind, team, position, radius, group, setReady, setHover } (picking). */
    buildings() { return Object.values(towns).flatMap(t => Object.values(t)); },
    identity: id,
    setBanners(team, fraction) { for (const f of fields) if (f.team === team) f.banners.setFraction(fraction, t); },
    /** kind: 'shop' | 'barracks' | 'drillyard' | 'sanctum'. */
    setReady(team, kind, v) { towns[team]?.[kind]?.setReady(v); },
    setHover(team, kind, v) { towns[team]?.[kind]?.setHover(v); },
    flashPower(team, powerKind) { towns[team]?.sanctum?.flash(powerKind); },
    restyle(newTeams) { teams = newTeams; dispose(); build(); },
    update(dt) {
      t += dt;
      for (const f of fields) {
        f.banners.update(t, dt); f.keep.update(t); for (const b of Object.values(f.town)) b.update(dt);
        for (const c of f.gateCloths) waveCloth(c, t, 0.1, c.position.x);
      }
      for (const w of water) { w.offset.x = t * 0.02; w.offset.y = Math.sin(t * 0.4) * 0.03; }
    },
    dispose,
  };
}
