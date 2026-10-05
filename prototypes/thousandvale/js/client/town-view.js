// The built world of one zone, from stream B's placements.json: every town's buildings (proctown plots,
// built with proctown's building kit — the same kit Farhold uses), the square, lamp posts along the main
// streets, bridges where roads cross rivers, and the barrow mouth at the dungeon door. Roads and streets
// themselves are painted into the ground by the bake (biome `road`), so they need no mesh.
//
// A building is described from its plot + culture + a seed (`describeBuilding`) and comes back as unit
// shapes (`partsFor`): eight InstancedMeshes hold every building in the zone, whatever its culture.
// Lit windows go into their own instanced mesh so night can turn them on (setNight).
//
// Conventions (docs/world.md §6): a building's `yaw` faces its street (protocol: yaw 0 faces +z, the door
// is at local +z); proctown's frontage angle is `facing`, so facing = PI/2 - yaw.

import * as THREE from 'three';
import { describeBuilding, partsFor, radiusOf, MESHES, describeStall, stallParts, wallKitParts, CULTURE_KIT } from '../../../../proctown/js/buildkit.js';
import { makeGlowTexture } from './decor.js';

/** proctown's plot from a placement record. Pure — exported for tests. */
export function plotFromPlacement(p) {
  const d = p.data || {};
  return { cx: p.x, cz: p.z, w: d.w || 6, d: d.d || 6, angle: d.angle || 0, facing: Math.PI / 2 - (p.yaw || 0), want: d.want || 'house', district: d.district || 'residential' };
}
/** A building's seed: from its plot position, so the same plot is the same house on every screen. */
export const buildingSeed = (townSeed, p) => (townSeed ^ Math.imul(Math.round(p.x * 8) * 73856093 ^ Math.round(p.z * 8) * 19349663, 1)) >>> 0;
/** Local (lx, lz) on a thing at (x, z) turned by yaw (protocol convention) -> world. */
export function localToWorld(x, z, yaw, lx, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}
const strHash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function prism(section) {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const n = section.length;
  for (let i = 1; i < n - 1; i++) {
    tri([section[0][0], section[0][1], 0.5], [section[i][0], section[i][1], 0.5], [section[i + 1][0], section[i + 1][1], 0.5]);
    tri([section[0][0], section[0][1], -0.5], [section[i + 1][0], section[i + 1][1], -0.5], [section[i][0], section[i][1], -0.5]);
  }
  for (let i = 0; i < n; i++) {
    const a = section[i], b = section[(i + 1) % n];
    tri([a[0], a[1], -0.5], [b[0], b[1], -0.5], [b[0], b[1], 0.5]);
    tri([a[0], a[1], -0.5], [b[0], b[1], 0.5], [a[0], a[1], 0.5]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}
/** The eight unit shapes (origin at the centre of the base, 1 m each way), as Farhold builds them. */
const UNIT = new Map();
export function unitGeometry(kind) {
  if (UNIT.has(kind)) return UNIT.get(kind);
  let g;
  switch (kind) {
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); g.translate(0, 0.5, 0); break;
    case 'gable': g = prism([[-0.5, 0], [0.5, 0], [0, 1]]); break;
    case 'shed': g = prism([[-0.5, 0], [0.5, 0], [-0.5, 1]]); break;
    case 'hip': g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'frustum': g = new THREE.CylinderGeometry(0.225 * Math.SQRT2, 0.5 * Math.SQRT2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 12); g.translate(0, 0.5, 0); break;
    case 'dome': g = new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 2, 1); break;
    default: g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); break;
  }
  UNIT.set(kind, g);
  return g;
}

export function createTownView(T, placements, { quality = 'high' } = {}) {
  const group = new THREE.Group(); group.name = 'town-' + (T.zoneKey || '');
  const ox = T.ox || 0, oz = T.oz || 0;
  const W = p => ({ ...p, x: p.x + ox, z: p.z + oz });
  const cheap = quality === 'low';
  const Mat = cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const kitMat = new Mat({ vertexColors: false, ...(cheap ? {} : { roughness: 0.88, metalness: 0 }) });

  // ---- gather -----------------------------------------------------------------------------------
  const towns = new Map();   // town id -> { id, name, x, z, r, culture, seed, lamps: [] }
  for (const p of placements) if (p.kind === 'settlement') towns.set(p.id, { id: p.id, name: p.data?.name || p.id, x: p.x + ox, z: p.z + oz, r: p.data?.radius || 60, kind: p.data?.kind, hub: !!p.data?.hub, culture: 'human', seed: strHash(p.id), lamps: [], square: null });
  for (const p of placements) if (p.kind === 'town_square') { const t = towns.get(p.data?.town); if (t) { t.culture = p.data?.culture || t.culture; t.square = { x: p.x + ox, z: p.z + oz, r: p.data?.r || 5 }; } }
  const cultureOf = id => { const t = towns.get(id); return t && CULTURE_KIT.cultures[t.culture] ? t.culture : 'human'; };

  // ---- parts, collected per unit mesh -------------------------------------------------------------
  const parts = Object.fromEntries(MESHES.map(m => [m, []]));   // [{ m: Matrix4, c: Color }]
  const windows = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  const push = (mesh, x, y, z, yaw, w, h, d, colour) => {
    _e.set(0, yaw, 0); _q.setFromEuler(_e);
    (parts[mesh] || parts.box).push({ m: new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(w, h, d)), c: new THREE.Color(colour) });
  };
  const placePart = (part, ox2, oz2, ground, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    push(part.mesh, ox2 + part.x * c + part.z * s, ground + part.y, oz2 - part.x * s + part.z * c, yaw + (part.yaw || 0), part.w, part.h, part.d, part.colour);
  };

  let buildings = 0;
  const clearings = [];
  const solids = [];
  for (const raw of placements) {
    if (raw.kind !== 'building') continue;
    const p = W(raw);
    const town = towns.get(raw.data?.town);
    const plot = plotFromPlacement(p);
    const desc = describeBuilding({ plot, culture: cultureOf(raw.data?.town), townSeed: town ? town.seed : 0, seed: buildingSeed(town ? town.seed : 0, p), want: plot.want, district: plot.district });
    const ground = T.heightAt(p.x, p.z);
    const yaw = desc.yaw + (desc.lean || 0);
    // a footing slab hides the wedge of daylight under a wall on sloping ground
    push('box', p.x, ground - 0.7, p.z, yaw, desc.footprint.w + 0.6, 0.95, desc.footprint.d + 0.6, '#5a5248');
    let top = 0;
    for (const part of partsFor(desc)) { top = Math.max(top, part.y + part.h); placePart(part, p.x, p.z, ground, yaw); }
    // two lit windows on the front, either side of the door, for the night
    const fw = desc.footprint.w, fd = desc.footprint.d;
    for (const side of [-1, 1]) {
      const wpt = localToWorld(p.x, p.z, yaw, side * fw * 0.28, fd / 2 + 0.04);
      windows.push({ x: wpt.x, y: ground + Math.min(1.5, (desc.storeyHeight || 2.4) * 0.55), z: wpt.z, yaw, w: Math.min(0.8, fw * 0.14) });
    }
    solids.push({ x: p.x, z: p.z, r: radiusOf(desc), h: top });
    buildings++;
  }

  // ---- squares: paving, a well, a few stalls -----------------------------------------------------
  for (const t of towns.values()) {
    clearings.push({ x: t.x, z: t.z, r: t.r });
    if (!t.square) continue;
    const g = T.heightAt(t.square.x, t.square.z);
    push('cyl', t.square.x, g - 0.3, t.square.z, 0, t.square.r * 2.4, 0.36, t.square.r * 2.4, '#8d8577');
    push('cyl', t.square.x, g, t.square.z, 0, 1.8, 0.8, 1.8, '#77736b');          // the well
    push('cyl', t.square.x, g + 0.75, t.square.z, 0, 1.3, 0.1, 1.3, '#2b4a5a');
    push('box', t.square.x - 0.75, g, t.square.z, 0, 0.15, 2.2, 0.15, '#5c4633');
    push('box', t.square.x + 0.75, g, t.square.z, 0, 0.15, 2.2, 0.15, '#5c4633');
    push('gable', t.square.x, g + 2.1, t.square.z, Math.PI / 2, 2.0, 0.7, 2.0, '#6b3a2a');
    const kinds = ['produce', 'cloth', 'smith', 'produce'];
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + 0.4, rr = t.square.r * 1.9 + 2.5;
      const sx = t.square.x + Math.cos(a) * rr, sz = t.square.z + Math.sin(a) * rr;
      try {
        const stall = describeStall({ kind: kinds[k], culture: t.culture, seed: t.seed + k });
        const sy = T.heightAt(sx, sz);
        for (const part of stallParts(stall)) placePart(part, sx, sz, sy, Math.atan2(t.square.x - sx, t.square.z - sz));
      } catch {}
    }
  }

  // ---- lamp posts along main streets (lit at night) ---------------------------------------------
  const lamps = [];
  for (const raw of placements) {
    if (raw.kind !== 'street' || !raw.data?.pts) continue;
    const town = towns.get(raw.data.town);
    const every = raw.data.cls === 'main' ? 22 : raw.data.cls === 'side' ? 34 : 0;
    if (!every) continue;
    const pts = raw.data.pts.map(([x, z]) => [x + ox, z + oz]);
    let carry = every * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;           // the street's right-hand side
      for (let s = carry; s < L; s += every) {
        const off = (raw.data.width || 4) / 2 + 0.7;
        const x = ax + (bx - ax) * s / L + nx * off, z = az + (bz - az) * s / L + nz * off;
        if (solids.some(b => Math.hypot(b.x - x, b.z - z) < b.r + 0.4)) continue;
        if (lamps.some(l => Math.hypot(l.x - x, l.z - z) < 9)) continue;
        lamps.push({ x, y: T.heightAt(x, z), z, town: town?.id });
      }
      carry = (carry - L) % every; if (carry < 0) carry += every;
    }
  }
  for (const l of lamps) {
    push('cyl', l.x, l.y, l.z, 0, 0.16, 2.9, 0.16, '#3b3330');
    push('box', l.x, l.y + 2.85, l.z, 0, 0.42, 0.45, 0.42, '#2d2622');
    const t = towns.get(l.town); if (t) t.lamps.push(l);
  }

  // ---- bridges ------------------------------------------------------------------------------------
  for (const raw of placements) {
    if (raw.kind !== 'bridge') continue;
    const p = W(raw), span = raw.data?.span || 10, deck = raw.data?.deck ?? T.heightAt(p.x, p.z), yaw = p.yaw || 0;
    const width = 4.2, len = span + 6;
    push('box', p.x, deck - 0.35, p.z, yaw, width, 0.4, len, '#7a6048');
    for (const side of [-1, 1]) {
      const r = localToWorld(p.x, p.z, yaw, side * (width / 2 - 0.12), 0);
      push('box', r.x, deck + 0.05, r.z, yaw, 0.16, 0.9, len, '#5e4a37');
      for (const end of [-1, 1]) {
        const q = localToWorld(p.x, p.z, yaw, side * (width / 2 - 0.12), end * (span / 2 - 0.5));
        const g = T.heightAt(q.x, q.z);
        push('box', q.x, Math.min(g, deck) - 2.5, q.z, yaw, 0.7, deck - Math.min(g, deck) + 2.5, 0.7, '#6f6a62');
      }
    }
  }

  // ---- the dungeon door: a barrow mound with a stone mouth facing yaw --------------------------------
  for (const raw of placements) {
    if (raw.kind !== 'dungeon_door') continue;
    const p = W(raw), yaw = p.yaw || 0, g = T.heightAt(p.x, p.z);
    const back = localToWorld(p.x, p.z, yaw, 0, -6);
    push('dome', back.x, T.heightAt(back.x, back.z) - 1.5, back.z, yaw, 14, 4.2, 12, '#5f6b45');
    const mouth = localToWorld(p.x, p.z, yaw, 0, -0.6);
    for (const side of [-1, 1]) { const q = localToWorld(mouth.x, mouth.z, yaw, side * 1.9, 0); push('box', q.x, g - 0.3, q.z, yaw, 0.9, 3.6, 0.9, '#77736b'); }
    push('box', mouth.x, g + 3.2, mouth.z, yaw, 5.0, 0.8, 1.1, '#6d6961');
    push('box', mouth.x, g - 0.2, mouth.z, yaw, 2.9, 3.3, 0.3, '#0b0a0c');
    clearings.push({ x: p.x, z: p.z, r: 10 });
  }

  // ---- build the instanced meshes ------------------------------------------------------------------
  const meshes = [];
  for (const [kind, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(unitGeometry(kind), kitMat, list.length);
    list.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); });
    m.castShadow = !cheap; m.receiveShadow = true; m.name = 'kit-' + kind;
    m.computeBoundingSphere();
    group.add(m); meshes.push(m);
  }
  // lit windows (warm, emissive, off by day)
  const winMat = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#ffb45c', emissiveIntensity: 0, roughness: 0.6 });
  let winMesh = null;
  if (windows.length) {
    winMesh = new THREE.InstancedMesh(unitGeometry('box'), winMat, windows.length);
    windows.forEach((w, i) => { _e.set(0, w.yaw, 0); _q.setFromEuler(_e); winMesh.setMatrixAt(i, _m.compose(_v.set(w.x, w.y, w.z), _q, _s.set(w.w, w.w * 1.1, 0.08))); });
    group.add(winMesh); meshes.push(winMesh);
  }
  // lamp glows (sprites, cheap); a few real lights hop to the lamps nearest the camera at night
  const glowTex = makeGlowTexture();
  const lampSprites = lamps.map(l => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffc36e', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: true })); s.position.set(l.x, l.y + 2.75, l.z); s.scale.set(2.2, 2.2, 1); s.visible = false; group.add(s); return s; });
  const lampLights = [];
  for (let k = 0; k < (cheap ? 2 : 6); k++) { const pl = new THREE.PointLight('#ffb862', 0, 18, 1.6); pl.visible = false; group.add(pl); lampLights.push(pl); }

  let night = 0, relightAt = 0, t = 0;
  function setNight(n) {
    night = n;
    winMat.emissiveIntensity = 1.6 * n;
    for (const s of lampSprites) { s.visible = n > 0.05; s.material.opacity = 0.85 * n; }
  }
  function update(dt, cam) {
    t += dt;
    if (night < 0.05 || !cam) { for (const l of lampLights) l.visible = false; return; }
    if (t < relightAt) { for (const [k, l] of lampLights.entries()) if (l.visible) l.intensity = 14 * night * (0.92 + Math.sin(t * 7 + k) * 0.06); return; }
    relightAt = t + 0.6;
    const near = lamps.map(l => ({ l, d: Math.hypot(l.x - cam.x, l.z - cam.z) })).filter(o => o.d < 70).sort((a, b) => a.d - b.d);
    lampLights.forEach((pl, k) => { const n = near[k]; pl.visible = !!n; if (n) { pl.position.set(n.l.x, n.l.y + 2.7, n.l.z); pl.intensity = 14 * night; } });
  }

  return {
    group, update, setNight, clearings, solids, lamps,
    towns: [...towns.values()],
    stats: { buildings, lamps: lamps.length, windows: windows.length, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])) },
    dispose() { for (const m of meshes) m.dispose(); kitMat.dispose(); winMat.dispose(); for (const s of lampSprites) s.material.dispose(); },
  };
}
