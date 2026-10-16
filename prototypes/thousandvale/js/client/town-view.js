// The built world of one zone, from stream B's placements.json: every town's buildings (proctown plots,
// built with proctown's building kit — the same kit Farhold uses), the square, lamp posts along the main
// streets, bridges where roads cross rivers, and the barrow mouth at the dungeon door. Roads and streets
// themselves are painted into the ground by the bake (biome `road`), so they need no mesh.
//
// A building is described from its plot + culture + a seed (`describeBuilding`) and comes back as unit
// shapes (`partsFor`): eight InstancedMeshes hold every building in the zone, whatever its culture.
// Window glass goes into two glowing instanced meshes (bright on shops, dim on homes) so night can turn them on
// (setNight); service buildings get proctown's office dressing (offices.js: a forge, an awning, a sign — Q10).
//
// Conventions (docs/world.md §6): a building's `yaw` faces its street (protocol: yaw 0 faces +z, the door
// is at local +z); proctown's frontage angle is `facing`, so facing = PI/2 - yaw.

import * as THREE from 'three';
import { LIGHTS } from './lightpool.js';
import { describeBuilding, partsFor, radiusOf, MESHES, describeStall, stallParts, wallKitParts, CULTURE_KIT } from '../../../../proctown/js/buildkit.js';
import { makeGlowTexture, makeFlameTexture } from './decor.js';
import { squareFurniture } from './town-square.js';
import { buildSignBoards } from './sign-text.js';
import { officeDressing, officeKindFor, OFFICE_KINDS } from '../../../../proctown/js/offices.js';
import { tuneFor } from './building-tune.js';
import { harbourParts, harbourExtras, portDressing } from './harbour-view.js';
// graphics pass 2026-10-16 (G-PROPS): surfaces (grain, seams, wear) on the kit, building trim and street clutter
import { propTier, propsOff, surfaceForPart, SURF } from './surface-plan.js';
import { surfaceMaterial, instancedKit, disposeKit } from './surface-mat.js';
import { buildingTrim, doorClutter, squareClutter, placeModel } from './prop-clutter.js';

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
/**
 * One building's look, pure (no Three.js): its proctown description, which office it is (B's `data.office`, else a
 * service `want`; null = an ordinary home), whether it is lit (a shop: Q10), its kit parts and its office dressing.
 * Exported for tests (play-test 2 Q7/Q10).
 */
export function buildingLook(raw, { culture = 'human', townSeed = 0, ox = 0, oz = 0 } = {}) {
  const p = { ...raw, x: raw.x + ox, z: raw.z + oz };
  const plot = plotFromPlacement(p);
  const seed = buildingSeed(townSeed, p);
  // T13 (play-test 5): Thousandvale's own heights — taller storeys and doors, nothing dug in, the plot filled (building-tune.js)
  const desc = describeBuilding({ plot, culture, townSeed, seed, want: plot.want, district: plot.district, tune: tuneFor(plot.want, { office: raw.data?.office || null, plot, seed }) });
  const kind = officeKindFor(raw.data?.office) || officeKindFor(plot.want);
  const lit = kind ? (raw.data?.lit ?? OFFICE_KINDS[kind].lit) : false;
  return { p, plot, seed, desc, kind, lit, parts: partsFor(desc), dressing: kind ? officeDressing(kind, desc, { lit, seed }) : null };
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
    // G-PROPS 2026-10-16: a bulged barrel (staves come from the surface layer, hoops are thin cyls) and a tied sack
    case 'barrel': g = new THREE.LatheGeometry([[0, 0], [0.4, 0], [0.47, 0.25], [0.5, 0.5], [0.47, 0.75], [0.4, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), 10); break;
    case 'sack': g = new THREE.LatheGeometry([[0, 0], [0.4, 0.02], [0.5, 0.22], [0.48, 0.55], [0.32, 0.82], [0.12, 0.9], [0.17, 0.97], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)), 8); break;
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
  // G-PROPS: what this tier draws (surface-plan.js PROP_TIERS; ?props=0 = the look before the graphics pass)
  const tier = propTier(quality, { off: propsOff() });
  if (!cheap) surfaceMaterial(kitMat, tier, { unit: true });
  let rngS = 0x9e3779b9 ^ strHash(T.zoneKey || 'zone');
  const rng = () => { rngS = (rngS + 0x6d2b79f5) >>> 0; let x = rngS; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

  // ---- gather -----------------------------------------------------------------------------------
  const towns = new Map();   // town id -> { id, name, x, z, r, culture, seed, lamps: [] }
  for (const p of placements) if (p.kind === 'settlement') towns.set(p.id, { id: p.id, name: p.data?.name || p.id, x: p.x + ox, z: p.z + oz, r: p.data?.radius || 60, kind: p.data?.kind, hub: !!p.data?.hub, culture: 'human', seed: strHash(p.id), lamps: [], square: null });
  for (const p of placements) if (p.kind === 'town_square') { const t = towns.get(p.data?.town); if (t) { t.culture = p.data?.culture || t.culture; t.square = { x: p.x + ox, z: p.z + oz, r: p.data?.r || 5, stalls: Array.isArray(p.data?.stalls) ? p.data.stalls.map(([x, z]) => [x + ox, z + oz]) : null }; } }
  const cultureOf = id => { const t = towns.get(id); return t && CULTURE_KIT.cultures[t.culture] ? t.culture : 'human'; };

  // ---- parts, collected per unit mesh -------------------------------------------------------------
  const KINDS = [...MESHES, 'barrel', 'sack'];
  const parts = Object.fromEntries(KINDS.map(m => [m, []]));   // [{ m: Matrix4, c: Color, s: surface code | undefined }]
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  // a part may carry tilts (rx pitch, rz roll) applied after its yaw — Euler order 'YXZ' (proctown offices/propkit)
  const push = (mesh, x, y, z, yaw, w, h, d, colour, rx = 0, rz = 0, into = parts, surf = null) => {
    _e.set(rx, yaw, rz, 'YXZ'); _q.setFromEuler(_e);
    const s = surf == null ? undefined : typeof surf === 'number' ? surf : (SURF[surf] || 0);
    (into[mesh] || into.box).push({ m: new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(w, h, d)), c: new THREE.Color(colour), s });
  };
  const placePart = (part, ox2, oz2, ground, yaw, into = parts) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    push(part.mesh, ox2 + part.x * c + part.z * s, ground + part.y, oz2 - part.x * s + part.z * c, yaw + (part.yaw || 0), part.w, part.h, part.d, part.colour, part.rx || 0, part.rz || 0, into, part.surf ?? null);
  };
  // glass: the kit's own window parts (and lantern glass) go in two glowing meshes instead of the plain kit — BRIGHT on
  // the buildings meant to draw a player in (shops, the inn, the smithy: Q10), DIM on ordinary homes. Play-test 2 Q7:
  // the old lit windows were two boxes stamped at a fixed spot on the footprint's front edge whatever the building's
  // real shape — on round huts, L-shaped houses and set-back fronts (18 of Torborhold's 90) they hung in the air in
  // front of the wall: the "floating tiny lanterns".
  const glass = { bright: [], dim: [] };
  const placeGlass = (part, ox2, oz2, ground, yaw, bright) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const x = ox2 + part.x * c + part.z * s, z = oz2 - part.x * s + part.z * c;
    _e.set(part.rx || 0, yaw + (part.yaw || 0), part.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    (bright ? glass.bright : glass.dim).push({ m: new THREE.Matrix4().compose(_v.set(x, ground + part.y, z), _q, _s.set(part.w, part.h, part.d)), c: new THREE.Color(part.colour || '#2a2620') });
  };
  const offices = [];       // { x, z, kind, lit, label, building }
  const officeLights = [];  // world { x, y, z, color, strong }
  const fires = [];         // world { x, y, z, s }
  const spinners = [];      // { x, y, z, yaw, axis, speed, parts }
  const signBoards = [];    // { text, x, y, z, yaw, w, h } — the name over each office door (B's label)

  let buildings = 0;
  const clearings = [];
  const solids = [];
  const descs = [];
  /** Dress one service building (Q10) — its look from proctown's office dressing, in the building's own frame. */
  function dress(b, kind, lit, into = parts, sink = { lights: officeLights, fires, spinners }, made = null) {
    const d = made || officeDressing(kind, b.desc, { lit, seed: b.seed });
    for (const part of d.parts) {
      if (part.tag === 'lamp') { placeGlass(part, b.x, b.z, b.ground, b.yaw, true); continue; }
      placePart(part, b.x, b.z, b.ground, b.yaw, into);
    }
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    const W2 = (lx, lz) => ({ x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c });
    for (const L of d.lights) { const w = W2(L.x, L.z); sink.lights.push({ x: w.x, y: b.ground + L.y, z: w.z, color: L.color, strong: !!L.strong }); }
    for (const f of d.fires) { const w = W2(f.x, f.z); sink.fires.push({ x: w.x, y: b.ground + f.y, z: w.z, s: f.s }); }
    for (const sp of d.spin) { const w = W2(sp.x, sp.z); sink.spinners.push({ x: w.x, y: b.ground + sp.y, z: w.z, yaw: b.yaw, axis: sp.axis, speed: sp.speed, parts: sp.parts }); }
    if (d.fascia && b.label !== false) { const w = W2(d.fascia.x, d.fascia.z); (sink.signs || signBoards).push({ text: b.label || OFFICE_KINDS[kind].label, x: w.x, y: b.ground + d.fascia.y, z: w.z, yaw: b.yaw, w: d.fascia.w, h: d.fascia.h }); }
    return d;
  }
  for (const raw of placements) {
    if (raw.kind !== 'building') continue;
    const town = towns.get(raw.data?.town);
    // an office (B's `data.office` once baked, else a service `want`) is dressed and, when it is a shop, lit
    const look = buildingLook(raw, { culture: cultureOf(raw.data?.town), townSeed: town ? town.seed : 0, ox, oz });
    const { p, plot, seed, desc, kind, lit } = look;
    const ground = T.heightAt(p.x, p.z);
    const yaw = desc.yaw + (desc.lean || 0);
    const b = { id: raw.id, x: p.x, z: p.z, ground, yaw, desc, seed, want: plot.want, kind, lit, town: town?.id, dressing: look.dressing, label: raw.data?.label || null };
    descs.push(b);
    // a footing slab hides the wedge of daylight under a wall on sloping ground
    push('box', p.x, ground - 0.7, p.z, yaw, desc.footprint.w + 0.6, 0.95, desc.footprint.d + 0.6, '#5a5248');
    let top = 0;
    for (const part of look.parts) {
      top = Math.max(top, part.y + part.h);
      if (part.tag === 'window') placeGlass(part, p.x, p.z, ground, yaw, lit);
      else placePart(tier.detail ? { ...part, surf: surfaceForPart(part, desc) } : part, p.x, p.z, ground, yaw);
    }
    // G-PROPS: window frames, door jambs and step, ridge caps, timber braces; barrels / crates / a bench by the door
    if (tier.trim) for (const part of buildingTrim(look.parts, desc)) placePart(part.surf === null ? { ...part, surf: surfaceForPart({ tag: 'roof', colour: part.colour }, desc) } : part, p.x, p.z, ground, yaw);
    if (tier.clutter > 0) for (const c of doorClutter({ desc, lit }, rng, tier.clutter)) for (const part of placeModel(c.id, c.lx, 0, c.lz, c.yaw, rng)) placePart(part, p.x, p.z, ground, yaw);
    if (kind) { dress(b, kind, lit, parts, undefined, look.dressing); offices.push({ x: p.x, z: p.z, kind, lit, label: raw.data?.label || OFFICE_KINDS[kind].label, building: raw.id }); }
    solids.push({ x: p.x, z: p.z, r: radiusOf(desc) * 0.85, h: top, bottom: ground - 1, top: ground + top });
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
    // W6: the stalls stand where the bake put them — beside the streets that enter the square, never in one
    // (js/client/town-square.js; a square baked before W6 falls back to the old ring of four)
    const kinds = ['produce', 'cloth', 'smith', 'produce'];
    const spots = squareFurniture({ square: t.square, stalls: t.square.stalls }).stalls;
    for (let k = 0; k < spots.length; k++) {
      const { x: sx, z: sz, yaw } = spots[k];
      try {
        const stall = describeStall({ kind: kinds[k % kinds.length], culture: t.culture, seed: t.seed + k });
        const sy = T.heightAt(sx, sz);
        for (const part of stallParts(stall)) placePart(part, sx, sz, sy, yaw);
      } catch {}
    }
    // G-PROPS: benches round the rim, sacks and crates by the stalls, a hand cart, a bucket at the well
    if (tier.clutter > 0) for (const c of squareClutter(t.square, spots, rng, tier.clutter)) { const y = T.heightAt(c.x, c.z); for (const part of placeModel(c.id, c.x, y, c.z, c.yaw, rng)) push(part.mesh, part.x, part.y, part.z, part.yaw, part.w, part.h, part.d, part.colour, part.rx || 0, part.rz || 0, parts, part.surf ?? null); }
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
  // ---- a built harbour (play-test 11, Z61: Gullwick's quay, piers, boats; js/client/harbour-view.js) ------------------
  for (const raw of placements) {
    if (raw.kind !== 'harbour' || !raw.data?.quay) continue;
    const hb = harbourParts(raw, { ox, oz, groundAt: (x, z) => (T.groundAt ? T.groundAt(x, z) : T.heightAt(x, z)) });
    for (const q of hb.parts) push(q.mesh, q.x, q.y, q.z, q.yaw, q.w, q.h, q.d, q.colour, q.rx || 0, q.rz || 0, parts, q.surf ?? null);
    for (const l of hb.lamps) lamps.push({ x: l.x, y: l.y, z: l.z, town: raw.data.town });
    // G-PROPS: the working clutter of the quay (more of it on a richer tier)
    if (tier.clutter > 0) for (const q of harbourExtras(raw, { ox, oz, groundAt: (x, z) => (T.groundAt ? T.groundAt(x, z) : T.heightAt(x, z)), density: tier.clutter })) push(q.mesh, q.x, q.y, q.z, q.yaw, q.w, q.h, q.d, q.colour, q.rx || 0, q.rz || 0, parts, q.surf ?? null);
  }
  // G-PROPS: a harbour with no built quay (Port Vharl: its jetty is the ship's own, js/client/ship-view.js) gets a dressed beach
  if (tier.clutter > 0) for (const raw of placements) {
    if (raw.kind !== 'harbour' || raw.data?.quay) continue;
    for (const q of portDressing(raw, { ox, oz, groundAt: (x, z) => (T.groundAt ? T.groundAt(x, z) : T.heightAt(x, z)), density: tier.clutter })) push(q.mesh, q.x, q.y, q.z, q.yaw, q.w, q.h, q.d, q.colour, q.rx || 0, q.rz || 0, parts, q.surf ?? null);
  }
  for (const l of lamps) {
    if (tier.trim) {
      // G-PROPS: a stone foot, an iron post with a collar, and a lantern — cage, glass (lit at night), a little roof
      push('box', l.x, l.y - 0.1, l.z, 0, 0.44, 0.38, 0.44, '#7a746b', 0, 0, parts, 'ashlar');
      push('cyl', l.x, l.y, l.z, 0, 0.14, 2.6, 0.14, '#3b3330', 0, 0, parts, 'metal');
      push('cyl', l.x, l.y + 0.3, l.z, 0, 0.2, 0.12, 0.2, '#2d2622', 0, 0, parts, 'metal');
      push('box', l.x, l.y + 2.55, l.z, 0, 0.42, 0.06, 0.42, '#2d2622', 0, 0, parts, 'metal');
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) push('box', l.x + dx * 0.18, l.y + 2.6, l.z + dz * 0.18, 0, 0.05, 0.42, 0.05, '#2d2622', 0, 0, parts, 'metal');
      push('hip', l.x, l.y + 3.0, l.z, 0, 0.56, 0.24, 0.56, '#2d2622', 0, 0, parts, 'metal');
      glass.bright.push({ m: new THREE.Matrix4().compose(_v.set(l.x, l.y + 2.62, l.z), _q.identity(), _s.set(0.3, 0.36, 0.3)), c: new THREE.Color('#d9c48a') });
    } else {
      push('cyl', l.x, l.y, l.z, 0, 0.16, 2.9, 0.16, '#3b3330');
      push('box', l.x, l.y + 2.85, l.z, 0, 0.42, 0.45, 0.42, '#2d2622');
    }
    const t = towns.get(l.town); if (t) t.lamps.push(l);
  }

  // ---- bridges ------------------------------------------------------------------------------------
  for (const raw of placements) {
    if (raw.kind !== 'bridge') continue;
    // B's bridge (P24): the deck runs abutment to abutment (`data.a`/`data.b` = [x, z, h], zone-local), `data.width` wide,
    // its TOP at `data.deck` (push() boxes stand on their y); piers stand on the bare ground (groundAt: heightAt is the deck here)
    const d = raw.data || {}, p = W(raw);
    const ox = T.ox || 0, oz = T.oz || 0;
    const A = d.a ? { x: d.a[0] + ox, z: d.a[1] + oz } : localToWorld(p.x, p.z, p.yaw || 0, 0, -(d.span || 10) / 2);
    const B = d.b ? { x: d.b[0] + ox, z: d.b[1] + oz } : localToWorld(p.x, p.z, p.yaw || 0, 0, (d.span || 10) / 2);
    const len = Math.max(1, Math.hypot(B.x - A.x, B.z - A.z)), yaw = Math.atan2(B.x - A.x, B.z - A.z);
    const cx = (A.x + B.x) / 2, cz = (A.z + B.z) / 2, deck = d.deck ?? T.heightAt(cx, cz), width = d.width || 4.2;
    const bare = (x, z) => (T.groundAt ? T.groundAt(x, z) : T.heightAt(x, z));
    push('box', cx, deck - 0.4, cz, yaw, width, 0.4, len, '#7a6048');
    for (const side of [-1, 1]) {
      const r = localToWorld(cx, cz, yaw, side * (width / 2 - 0.12), 0);
      push('box', r.x, deck, r.z, yaw, 0.16, 0.9, len, '#5e4a37');
      const piers = Math.max(2, Math.round(len / 7) + 1);
      for (let k = 0; k < piers; k++) {
        const q = localToWorld(cx, cz, yaw, side * (width / 2 - 0.12), (k / (piers - 1) - 0.5) * (len - 1));
        const g = Math.min(bare(q.x, q.z), deck - 0.4);
        const h = deck - 0.4 - g + 1.5;                    // down to the river bed and a little into it
        push('box', q.x, deck - 0.4 - h, q.z, yaw, 0.6, h, 0.6, '#6f6a62');
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
    const m = instancedKit(unitGeometry(kind), kitMat, list, tier);
    m.castShadow = !cheap; m.receiveShadow = true; m.name = 'kit-' + kind;
    m.computeBoundingSphere();
    group.add(m); meshes.push(m);
  }
  // glass: bright (shops) and dim (homes) — warm and emissive at night, the glass colour by day
  const winMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffb45c', emissiveIntensity: 0, roughness: 0.4 });
  const dimMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8a050', emissiveIntensity: 0, roughness: 0.4 });
  const glassMeshes = [];
  for (const [list, mat, name] of [[glass.bright, winMat, 'glass-bright'], [glass.dim, dimMat, 'glass-dim']]) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(unitGeometry('box'), mat, list.length);
    list.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); });
    m.name = name; m.computeBoundingSphere(); group.add(m); meshes.push(m); glassMeshes.push(m);
  }
  // turning parts (mill sails): a small group per spinner, its own instanced pieces
  const spinGroups = [];
  function buildSpinner(sp, into = group) {
    const g = new THREE.Group(); g.position.set(sp.x, sp.y, sp.z); g.rotation.set(0, sp.yaw, 0, 'YXZ');
    const turn = new THREE.Group(); g.add(turn);
    const per = Object.fromEntries(MESHES.map(m => [m, []]));
    for (const part of sp.parts) push(part.mesh, part.x, part.y, part.z, part.yaw || 0, part.w, part.h, part.d, part.colour, part.rx || 0, part.rz || 0, per);
    for (const [kind, list] of Object.entries(per)) {
      if (!list.length) continue;
      const m = instancedKit(unitGeometry(kind), kitMat, list, tier);
      m.castShadow = !cheap; m.computeBoundingSphere(); turn.add(m); meshes.push(m);
    }
    into.add(g);
    const S = { g, turn, axis: sp.axis, speed: sp.speed };
    spinGroups.push(S);
    return S;
  }
  for (const sp of spinners) buildSpinner(sp);
  // flames (forge hearth, temple candles) — sprites; their light comes from officeLights
  const flameMat = new THREE.SpriteMaterial({ map: makeFlameTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flameSprites = [];
  function addFlame(f, into = group) { const sp = new THREE.Sprite(flameMat); sp.position.set(f.x, f.y + f.s * 0.45, f.z); sp.scale.set(f.s * 0.9, f.s * 1.3, 1); sp.userData.s = f.s; into.add(sp); flameSprites.push(sp); }
  for (const f of fires) addFlame(f);
  const boards = buildSignBoards(signBoards);
  if (boards) group.add(boards.mesh);
  // lamp glows (sprites, cheap); a few real lights hop to the lamps nearest the camera at night
  const glowTex = makeGlowTexture();
  const lampSprites = lamps.map(l => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffc36e', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: true })); s.position.set(l.x, l.y + 2.75, l.z); s.scale.set(2.2, 2.2, 1); s.visible = false; group.add(s); return s; });
  // every lamp is a light SOURCE in the page's fixed pool (lightpool.js): no light is ever added or hidden, so
  // nightfall and walking past lamps never recompile a shader
  const lampLights = lamps.map(l => LIGHTS.add({ x: l.x, y: l.y + 2.7, z: l.z, color: '#ffb862', intensity: 0, distance: 18, decay: 1.6, flicker: 0.05, owner: group }));

  // office lanterns and hearths: pool light SOURCES too (only lit offices carry any: Q10 — shops draw the eye, homes do not)
  const officeSources = officeLights.map(l => LIGHTS.add({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: 0, distance: l.strong ? 14 : 11, decay: 1.6, flicker: l.strong ? 0.18 : 0.06, owner: group }));
  const officeGlows = officeLights.map(l => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: l.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: true })); s.position.set(l.x, l.y, l.z); s.scale.set(l.strong ? 2.4 : 1.3, l.strong ? 2.4 : 1.3, 1); s.visible = false; group.add(s); return s; });

  let night = 0, relightAt = 0, t = 0;
  function setNight(n) {
    night = n;
    winMat.emissiveIntensity = 1.7 * n;
    dimMat.emissiveIntensity = 0.32 * n;
    for (const s of lampSprites) { s.visible = n > 0.05; s.material.opacity = 0.85 * n; }
    for (const h of lampLights) h.intensity = n > 0.05 ? 14 * n : 0;
    boards?.setNight(n);
    officeLights.forEach((l, i) => { officeSources[i].intensity = l.strong ? 5 + 9 * n : (n > 0.05 ? 9 * n : 0); officeGlows[i].visible = l.strong || n > 0.05; officeGlows[i].material.opacity = l.strong ? 0.35 + 0.5 * n : 0.8 * n; });
    for (const c of claimed.values()) c.setNight?.(n);
  }
  function update(dt, cam) {
    t += dt;
    for (const S of spinGroups) S.turn.rotation[S.axis] += S.speed * dt;
    for (let i = 0; i < flameSprites.length; i++) { const f = flameSprites[i], k = f.userData.s; f.scale.y = k * (1.2 + Math.sin(t * 9 + i) * 0.12); }
  }

  /**
   * The server's own office list (`info.office` on a service NPC: {kind, plot, x, z, lit}) — a role that took over an
   * ordinary house as its shop (no dedicated plot in this town) gets that house dressed now. Idempotent per building.
   */
  const claimed = new Map();
  function claimOffice(o) {
    if (!o) return false;
    const kind = officeKindFor(o.kind) || officeKindFor(o.want);
    if (!kind) return false;
    let b = o.plot != null ? descs.find(d => d.id === o.plot) : null;
    if (!b && Number.isFinite(o.x)) for (const d of descs) for (const [x, z] of [[o.x, o.z], [o.x + ox, o.z + oz]]) if (Math.hypot(d.x - x, d.z - z) < 2.5) b = d;
    if (!b) return false;
    if (b.kind === kind || claimed.get(b.id)?.kind === kind) return true;
    if (b.kind) return true;            // already dressed as another trade: the plan wins
    claimed.get(b.id)?.dispose();
    const sub = new THREE.Group(); sub.name = 'office-' + kind;
    const subParts = Object.fromEntries(MESHES.map(m => [m, []]));
    const sink = { lights: [], fires: [], spinners: [], signs: [] };
    const lit = o.lit ?? OFFICE_KINDS[kind].lit;
    const before = glass.bright.length;
    dress(b, kind, lit, subParts, sink);
    const lampGlass = glass.bright.splice(before);
    const own = [];
    for (const [k, list] of Object.entries(subParts)) {
      if (!list.length) continue;
      const m = instancedKit(unitGeometry(k), kitMat, list, tier);
      m.castShadow = !cheap; m.computeBoundingSphere(); sub.add(m); own.push(m);
    }
    if (lampGlass.length) { const m = new THREE.InstancedMesh(unitGeometry('box'), winMat, lampGlass.length); lampGlass.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); }); sub.add(m); own.push(m); }
    for (const sp of sink.spinners) buildSpinner(sp, sub);
    for (const f of sink.fires) addFlame(f, sub);
    const subBoards = buildSignBoards(sink.signs); if (subBoards) sub.add(subBoards.mesh);
    const srcs = sink.lights.map(l => LIGHTS.add({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: 0, distance: 11, decay: 1.6, flicker: 0.06, owner: group }));
    group.add(sub);
    const rec = { kind, setNight: n => { for (const h of srcs) h.intensity = n > 0.05 ? 9 * n : 0; }, dispose() { group.remove(sub); subBoards?.dispose(); for (const m of own) disposeKit(m); for (const h of srcs) h.remove(); } };
    rec.setNight(night);
    claimed.set(b.id, rec);
    offices.push({ x: b.x, z: b.z, kind, lit, label: OFFICE_KINDS[kind].label, building: b.id, claimed: true });
    return true;
  }

  return {
    group, update, setNight, clearings, solids, lamps, offices, claimOffice, buildingsList: descs,
    towns: [...towns.values()],
    stats: { tier: tier.off ? 'off' : quality, signs: signBoards.length, buildings, lamps: lamps.length, windows: glass.bright.length + glass.dim.length, brightGlass: glass.bright.length, dimGlass: glass.dim.length, offices: offices.length, officeLights: officeLights.length, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])) },
    dispose() { for (const m of meshes) disposeKit(m); kitMat.dispose(); winMat.dispose(); dimMat.dispose(); flameMat.dispose(); for (const s of lampSprites) s.material.dispose(); for (const s of officeGlows) s.material.dispose(); for (const h of lampLights) h.remove(); for (const h of officeSources) h.remove(); for (const c of claimed.values()) c.dispose(); boards?.dispose(); },
  };
}
