// Thousandvale props gallery — the CATALOGUE: every Thousandvale-only prop, scatter piece, station, tool, marker and
// dungeon look, each as a row { key, group, id, name, source, note, build(ctx) }.
//
// Nothing here draws a model of its own. Every row IMPORTS the game's own builder from
// prototypes/thousandvale/js/client/ and calls it the way the game does (same arguments, same material settings, same
// scale), so the gallery cannot drift from the game: change a builder there and this page shows the change.
// Where the game turns a part list into meshes inside a closure we cannot import (town-view.js's `push`, prof-view.js's
// node placement), the few lines that do the turning are repeated here with a comment naming the lines they follow.
//
// build(ctx) -> { object: THREE.Object3D, update?(dt, t), setNight?(n), dispose?(), noGround?, dark? }
//   ctx = { data: { vharlProps, gullwick, portVharl, gorsehold }, camera: { position } }  (camera = a proxy the page moves)
// A build may throw: the page catches it and shows the error on that tile.

import * as THREE from 'three';
import { buildVharlProp, VHARL_PROP_IDS, VHARL_FIRE, VHARL_FIRE_AT } from '../../prototypes/thousandvale/js/client/vharl-props.js';
import { buildVharlPiece, vharlMaterial } from '../../prototypes/thousandvale/js/client/vharl-scatter-art.js';
import { CLUTTER_IDS, placeModel, buildingTrim, doorClutter } from '../../prototypes/thousandvale/js/client/prop-clutter.js';
import { NODE_PARTS, PART_GEOMETRY, TINT_PARTS, chunkPlacements, trunkRadius, oreChunkGeometry, stationGeometry, STATION_KINDS, toolGeometry, TOOL_KINDS, glintGeometry } from '../../prototypes/thousandvale/js/client/prof-models.js';
import { rodGeometry, floatGeometry, fishGeometry } from '../../prototypes/thousandvale/js/client/angling-view.js';
import { createHeld } from '../../prototypes/thousandvale/js/client/held-view.js';
import { createDummyBody } from '../../prototypes/thousandvale/js/client/dummy-model.js';
import { harbourParts, harbourExtras } from '../../prototypes/thousandvale/js/client/harbour-view.js';
import { createTownView, unitGeometry, buildingLook } from '../../prototypes/thousandvale/js/client/town-view.js';
import { createLootMarkers, RARITY_COLOUR } from '../../prototypes/thousandvale/js/client/loot-marker.js';
import { createQuestMarks, MARKS, MARK_LOOK, TRAVEL_MARKS, TRAVEL_LOOK } from '../../prototypes/thousandvale/js/client/quest-marks.js';
import { createDungeonView, LOOKS } from '../../prototypes/thousandvale/js/client/dungeon-view.js';
import { makeFlameTexture, makeGlowTexture } from '../../prototypes/thousandvale/js/client/decor.js';
import { propTier, surfaceForPart, SURF } from '../../prototypes/thousandvale/js/client/surface-plan.js';
import { surfaceMaterial, instancedKit, surfaceVertexAttr } from '../../prototypes/thousandvale/js/client/surface-mat.js';

const TV = 'prototypes/thousandvale/js/client/';
/** The graphics tier the gallery draws at: the game's top tier (surfaces, wear, relief, trim, full clutter). */
export const TIER = propTier('high');

// ------------------------------------------------------------------------------------------------ shared helpers

function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const strHash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// town-view.js's kit material: MeshStandardMaterial, roughness 0.88, patched with the surface layers (unit shapes)
let KIT_MAT = null;
function kitMat() { if (!KIT_MAT) { KIT_MAT = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.88, metalness: 0 }); surfaceMaterial(KIT_MAT, TIER, { unit: true }); } return KIT_MAT; }
// decor.js's prop material for kit / island models: vertex colours, roughness 0.85, surface layers per vertex
let PROP_MAT = null;
function propMat() { if (!PROP_MAT) { PROP_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); surfaceMaterial(PROP_MAT, TIER); } return PROP_MAT; }
// town-view.js's window glass (bright on lit shops, dim on homes; emissive at night)
let GLASS = null;
function glassMats() { if (!GLASS) GLASS = { bright: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffb45c', emissiveIntensity: 0, roughness: 0.4 }), dim: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8a050', emissiveIntensity: 0, roughness: 0.4 }) }; return GLASS; }

/**
 * Unit-shape parts ({ mesh, x, y, z, yaw, w, h, d, colour, rx?, rz?, surf? }, base at y) -> one instanced kit mesh per shape.
 * Same matrix as town-view.js `push` (Euler(rx, yaw, rz, 'YXZ'), scale w/h/d) and the same instancedKit() call.
 */
export function kitGroup(parts, mat = null) {
  const by = new Map();
  const e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  for (const p of parts) {
    const kind = p.mesh || 'box';
    if (!by.has(kind)) by.set(kind, []);
    e.set(p.rx || 0, p.yaw || 0, p.rz || 0, 'YXZ'); q.setFromEuler(e);
    by.get(kind).push({ m: new THREE.Matrix4().compose(v.set(p.x, p.y, p.z), q, s.set(p.w, p.h, p.d)), c: new THREE.Color(p.colour), s: p.surf == null ? undefined : p.surf });
  }
  const g = new THREE.Group();
  for (const [kind, list] of by) {
    const m = mat ? new THREE.InstancedMesh(unitGeometry(kind), mat, list.length) : instancedKit(unitGeometry(kind), kitMat(), list, TIER);
    if (mat) list.forEach((it, i) => { m.setMatrixAt(i, it.m); m.setColorAt(i, it.c); });
    m.castShadow = m.receiveShadow = true; m.computeBoundingBox(); m.computeBoundingSphere(); g.add(m);
  }
  return g;
}
// instancedKit wants a NUMBER surface code; town-view resolves names through SURF. Resolve them the same way.
const surfCode = s => (s == null ? undefined : typeof s === 'number' ? s : (SURF[s] || 0));
function kitGroupSurf(parts) { return kitGroup(parts.map(p => ({ ...p, surf: surfCode(p.surf) }))); }
let GHOST = null;
/** A see-through grey for context (the building under its trim), not part of what a tile measures. */
function ghostGroup(parts) {
  GHOST ||= new THREE.MeshStandardMaterial({ color: '#c8d0dc', transparent: true, opacity: 0.22, depthWrite: false, roughness: 1 });
  const g = kitGroup(parts.map(p => ({ ...p, colour: '#ffffff' })), GHOST);
  g.traverse(o => { o.castShadow = false; o.userData.noFrame = true; }); return g;
}

/** decor.js's flame for a burning prop: an additive sprite 0.45 + 0.55 m up, 1.3 x 1.7 m. */
function flameSprite(y = 1.0, sx = 1.3, sy = 1.7) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeFlameTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.position.set(0, y, 0); s.scale.set(sx, sy, 1); s.userData.noFrame = true; return s;
}
const flicker = (sp, t, k = 1) => { sp.scale.y = k * (1.2 + Math.sin(t * 9) * 0.12) * 1.4; };

/** A stand-in body for things that float over a person or a corpse (markers): a plain grey capsule, labelled as such. */
function standIn(lying = false) {
  const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, lying ? 1.1 : 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: '#8a8f98', roughness: 0.9 }));
  if (lying) { g.rotation.z = Math.PI / 2; g.position.y = 0.3; } else g.position.y = 0.83;
  g.castShadow = true; return g;
}

// ------------------------------------------------------------------------------------------------ the rows
export const GROUPS = [];
export const ITEMS = [];
function add(group, row) { if (!GROUPS.includes(group)) GROUPS.push(group); ITEMS.push({ group, key: group + ':' + row.id, ...row }); }

// ---- 1. Vharlen props (vharl-props.js): decor.js draws every `vh_` id from buildVharlProp(id), instanced, prop material
for (const id of VHARL_PROP_IDS) {
  add('Vharlen props', {
    id, source: TV + 'vharl-props.js', call: `buildVharlProp('${id}')`,
    info: ctx => { const d = ctx.data.vharlProps?.island?.[id]; return d ? { name: d.name, note: d.what, expect: { size: d.size, h: d.h } } : {}; },
    build() {
      const geo = buildVharlProp(id);
      if (!geo) throw new Error('buildVharlProp returned null');
      surfaceVertexAttr(geo);
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo, propMat()); m.castShadow = m.receiveShadow = true; g.add(m);
      // flames where decor.js puts them: the prop's own points (VHARL_FIRE_AT), else one low over the middle
      const fls = [];
      if (VHARL_FIRE.has(id)) for (const f of VHARL_FIRE_AT[id] || [{ x: 0, y: 1.0, z: 0, w: 1.3, h: 1.7 }]) { const fl = flameSprite(f.y, f.w, f.h); fl.position.x = f.x; fl.position.z = f.z; fl.userData.k = f.h / 1.7; g.add(fl); fls.push(fl); }
      return { object: g, update: fls.length ? (dt, t) => fls.forEach(fl => flicker(fl, t, fl.userData.k)) : null };
    },
  });
}

// ---- 2. Vharlen scatter (vharl-scatter-art.js): scatter-view.js's `custom` kinds, one geometry per `<kind>:<variant>`
const SCATTER = { tree_fern: ['a', 'b', 'c'], basalt_columns: ['a', 'b', 'c', 'd'], obsidian: ['a', 'b', 'c'], steam_vent: ['a', 'b'], sulphur_crust: ['a', 'b', 'c'] };
for (const [kind, vars] of Object.entries(SCATTER)) for (const v of vars) {
  add('Vharlen scatter', {
    id: `${kind}:${v}`, source: TV + 'vharl-scatter-art.js', call: `buildVharlPiece('${kind}', '${v}')`,
    note: kind === 'tree_fern' ? 'Still built by this file, but since 2026-10-20 the game draws tree ferns as storybook trees (tree-style.js story_fern_*) — this is the older low-poly fern.' : 'scatter-view.js instances it at scale 1 with vharlMaterial(kind).',
    build() {
      const geo = buildVharlPiece(kind, v);
      if (!geo) throw new Error('buildVharlPiece returned null');
      const m = new THREE.Mesh(geo, vharlMaterial(kind, false)); m.castShadow = m.receiveShadow = true;
      return { object: m };
    },
  });
}

// ---- 3. Street clutter (prop-clutter.js): CLUTTER_MODELS through placeModel, drawn as town-view.js's instanced kit
for (const id of CLUTTER_IDS) {
  add('Street clutter', {
    id, source: TV + 'prop-clutter.js', call: `placeModel('${id}', 0, 0, 0, 0, rng)`,
    note: 'Unit-shape parts; town-view.js pushes them into the town\'s instanced kit (barrel and sack are lathe shapes there).',
    build() { return { object: kitGroupSurf(placeModel(id, 0, 0, 0, 0, rngOf(strHash(id)))) }; },
  });
}

// ---- 4. Buildings + trim (prop-clutter.js buildingTrim + doorClutter on a real baked building, town-view.js buildingLook)
const TRIM_PICKS = [
  { zone: 'gullwick', town: 'gullwick', culture: 'halfling', want: 'house' },
  { zone: 'gullwick', town: 'gullwick', culture: 'halfling', want: 'tailor' },
  { zone: 'gullwick', town: 'gullwick', culture: 'halfling', want: 'inn' },
  { zone: 'portVharl', town: 'port_vharl', culture: 'vharl', want: 'house' },
  { zone: 'portVharl', town: 'port_vharl', culture: 'vharl', any: true, lit: true },
  { zone: 'gorsehold', town: 'gorsehold', culture: 'desert', want: 'house' },
];
function pickBuilding(ctx, P) {
  const list = ctx.data[P.zone]?.placements || [];
  const b = list.filter(p => p.kind === 'building' && p.data?.town === P.town);
  const hit = P.any ? b.find(p => p.data?.lit) : b.find(p => p.data?.want === P.want);
  if (!hit) throw new Error(`no ${P.want || 'lit'} building in ${P.town}`);
  return hit;
}
function buildingParts(raw, culture, { trimOnly = false } = {}) {
  // town-view.js: buildingLook -> parts (surface per part), glass for windows, buildingTrim, doorClutter, a footing slab
  const look = buildingLook(raw, { culture, townSeed: strHash(raw.data.town), ox: -raw.x, oz: -raw.z });
  const { desc, lit } = look;
  const yaw = desc.yaw + (desc.lean || 0), c = Math.cos(yaw), s = Math.sin(yaw);
  const at = part => ({ ...part, x: part.x * c + part.z * s, z: -part.x * s + part.z * c, yaw: yaw + (part.yaw || 0) });
  const out = [], glass = [], ghost = [];
  if (trimOnly) for (const part of look.parts) ghost.push(at(part));
  if (!trimOnly) {
    out.push({ mesh: 'box', x: 0, y: -0.7, z: 0, yaw, w: desc.footprint.w + 0.6, h: 0.95, d: desc.footprint.d + 0.6, colour: '#5a5248' });
    for (const part of look.parts) {
      if (part.tag === 'window') glass.push(at(part));
      else out.push(at({ ...part, surf: surfaceForPart(part, desc) }));
    }
  }
  for (const part of buildingTrim(look.parts, desc)) out.push(at(part.surf === null ? { ...part, surf: surfaceForPart({ tag: 'roof', colour: part.colour }, desc) } : part));
  if (!trimOnly) {
    const rng = rngOf(strHash(raw.id));
    for (const cl of doorClutter({ desc, lit }, rng, TIER.clutter)) for (const part of placeModel(cl.id, cl.lx, 0, cl.lz, cl.yaw, rng)) out.push(at(part));
  }
  return { parts: out, glass, lit, desc, ghost };
}
for (const P of TRIM_PICKS) for (const trimOnly of [false, true]) {
  add('Buildings + trim', {
    id: `${P.town}:${P.any ? 'lit shop' : P.want}${trimOnly ? ':trim only' : ''}`, source: TV + 'prop-clutter.js',
    call: trimOnly ? 'buildingTrim(parts, desc)' : 'buildingLook() + buildingTrim() + doorClutter()',
    note: trimOnly ? 'Only what buildingTrim adds (solid): sills, lintels, mullions, door jambs and step, ridge caps, timber braces. The building itself is drawn see-through for context.'
      : `A real baked ${P.culture} building from data/zones (placements.json), with its trim and the clutter by its door. Office signs and awnings are proctown offices.js (Set-piece Kit page).`,
    build(ctx) {
      const raw = pickBuilding(ctx, P);
      const { parts, glass, lit, ghost } = buildingParts(raw, P.culture, { trimOnly });
      const g = new THREE.Group();
      g.add(kitGroupSurf(parts));
      if (ghost.length) g.add(ghostGroup(ghost));
      if (glass.length) {
        const mats = glassMats(), mat = lit ? mats.bright : mats.dim;
        const m = new THREE.InstancedMesh(unitGeometry('box'), mat, glass.length);
        const e = new THREE.Euler(), q = new THREE.Quaternion();
        glass.forEach((p, i) => { e.set(p.rx || 0, p.yaw || 0, p.rz || 0, 'YXZ'); q.setFromEuler(e); m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.w, p.h, p.d))); m.setColorAt(i, new THREE.Color(p.colour)); });
        m.computeBoundingBox(); g.add(m);
      }
      return { object: g, setNight: n => { const mats = glassMats(); mats.bright.emissiveIntensity = 1.7 * n; mats.dim.emissiveIntensity = 0.32 * n; } };
    },
  });
}

// ---- 5. Gathering nodes (prof-models.js), placed the way prof-view.js rebuild() does (its lines 91-110)
const PATCH_SCALE = 1.35, CHUNK_SCALE = 1.55;     // prof-view.js constants (not exported there)
let PROF_MATS = null;
const profMats = () => (PROF_MATS ||= { plain: new THREE.MeshLambertMaterial({ vertexColors: true }), tint: new THREE.MeshLambertMaterial({ vertexColors: true }) });
const GEO = new Map();
const partGeo = p => { if (!GEO.has(p)) GEO.set(p, PART_GEOMETRY[p]()); return GEO.get(p); };
function nodeObject(look, tier, spent) {
  const L = look, size = L.size || 1, g = new THREE.Group(), M = profMats();
  const parts = NODE_PARTS[L.model](L.v | 0).filter(p => p.when === 'both' || (p.when === 'spent') === spent);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
  for (const p of parts) {
    const m = new THREE.InstancedMesh(partGeo(p.part), TINT_PARTS.has(p.part) ? M.tint : M.plain, 1);
    const patch = L.model !== 'boulder' && L.model !== 'tree';
    if (p.unit === 'trunk') { const r = trunkRadius(size); _s.set(r, 1, r); } else _s.setScalar(size * (patch ? PATCH_SCALE : 1));
    m.setMatrixAt(0, _m.compose(_p.set(0, L.model === 'boulder' ? -size * 0.06 : 0, 0), _q, _s));
    m.setColorAt(0, p.tint ? _c.set(spent ? '#6a6a6a' : L.tint || '#ffffff') : _c.set(spent && L.model === 'boulder' ? '#b9b4ac' : '#ffffff'));
    m.castShadow = m.receiveShadow = true; m.computeBoundingBox(); g.add(m);
  }
  if (L.model === 'boulder' && !spent) {
    const chunks = chunkPlacements(L.v | 0, Math.max(1, Math.min(10, L.n | 0 || 5)));
    const m = new THREE.InstancedMesh(partGeo('ore' + Math.max(1, Math.min(5, tier | 0 || 1))), M.tint, chunks.length);
    const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), q2 = new THREE.Quaternion();
    chunks.forEach((c, i) => {
      n.set(c.normal[0], c.normal[1], c.normal[2]).normalize();
      q2.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, c.spin));
      _p.set(c.pos[0] * size, c.pos[1] * size - size * 0.06, c.pos[2] * size);
      m.setMatrixAt(i, _m.compose(_p, q2, _s.setScalar(size * c.scale * CHUNK_SCALE)));
      m.setColorAt(i, _c.set(L.tint || '#c9824a'));
    });
    m.castShadow = true; m.computeBoundingBox(); g.add(m);
  }
  return g;
}
// looks taken from the baked node data (data/zones/*/zone.json `look`)
const NODES = [
  { id: 'boulder v0 (copper)', look: { model: 'boulder', size: 1.7, tint: '#b87333', n: 5, v: 0 }, tier: 1 },
  { id: 'boulder v1 (iron)', look: { model: 'boulder', size: 1.8, tint: '#8a8f98', n: 6, v: 1 }, tier: 2 },
  { id: 'boulder v2 (silver)', look: { model: 'boulder', size: 1.6, tint: '#c9ccd2', n: 5, v: 2 }, tier: 3 },
  { id: 'boulder v3 (gold)', look: { model: 'boulder', size: 1.7, tint: '#d8b040', n: 6, v: 3 }, tier: 4 },
  { id: 'boulder spent', look: { model: 'boulder', size: 1.7, tint: '#b87333', n: 5, v: 0 }, tier: 1, spent: true },
  { id: 'tree v0', look: { model: 'tree', size: 7, tint: '#d04a3a', n: 1, v: 0 } },
  { id: 'tree v1', look: { model: 'tree', size: 7, tint: '#d04a3a', n: 1, v: 1 } },
  { id: 'tree v2', look: { model: 'tree', size: 7, tint: '#d04a3a', n: 1, v: 2 } },
  { id: 'tree v3', look: { model: 'tree', size: 7, tint: '#d04a3a', n: 1, v: 3 } },
  { id: 'tree spent', look: { model: 'tree', size: 7, tint: '#d04a3a', n: 1, v: 1 }, spent: true },
  { id: 'herb', look: { model: 'herb', size: 0.5, tint: '#7fc98a', n: 6, v: 2 } },
  { id: 'herb spent', look: { model: 'herb', size: 0.5, tint: '#7fc98a', n: 6, v: 2 }, spent: true },
  { id: 'mushroom', look: { model: 'mushroom', size: 0.35, tint: '#e6dccb', n: 6, v: 0 } },
  { id: 'mushroom spent', look: { model: 'mushroom', size: 0.35, tint: '#e6dccb', n: 6, v: 0 }, spent: true },
  { id: 'fibre', look: { model: 'fibre', size: 1.1, tint: '#8fb6e0', n: 6, v: 1 } },
  { id: 'fibre spent', look: { model: 'fibre', size: 1.1, tint: '#8fb6e0', n: 6, v: 1 }, spent: true },
];
for (const N of NODES) {
  add('Gathering nodes', {
    id: N.id, source: TV + 'prof-models.js', call: `NODE_PARTS.${N.look.model}(${N.look.v}) + PART_GEOMETRY`,
    note: `look ${JSON.stringify(N.look)}${N.spent ? ' — spent (worked, waiting to come back)' : ''}. Placed as prof-view.js does (patches x${PATCH_SCALE}, ore chunks x${CHUNK_SCALE}).`,
    build() { return { object: nodeObject(N.look, N.tier, !!N.spent) }; },
  });
}
for (let t = 1; t <= 5; t++) {
  add('Gathering nodes', {
    id: `ore chunk tier ${t}`, source: TV + 'prof-models.js', call: `oreChunkGeometry(${t})`,
    note: 'One chunk at its own size (tinted per instance in the game); a boulder wears 5-10 of them at x1.55.',
    build() { const m = new THREE.Mesh(oreChunkGeometry(t), new THREE.MeshLambertMaterial({ vertexColors: true, color: ['#b87333', '#8a8f98', '#c9ccd2', '#d8b040', '#7fd0ff'][t - 1] })); m.castShadow = true; return { object: m }; },
  });
}

// ---- 6. Stations (prof-models.js stationGeometry): prof-view.js puts one Mesh on the plain material, its fire as a glint
for (const kind of STATION_KINDS) {
  add('Stations', {
    id: kind, source: TV + 'prof-models.js', call: `stationGeometry('${kind}')`,
    note: 'Stands beside a craftsman whose role lists it (professions.json roles.<role>.stations).',
    build() {
      const { geometry, glow } = stationGeometry(kind);
      const g = new THREE.Group();
      const m = new THREE.Mesh(geometry, profMats().plain); m.castShadow = m.receiveShadow = true; g.add(m);
      let gl = null;
      if (glow) {
        gl = new THREE.Mesh(glintGeometry(), new THREE.MeshBasicMaterial({ color: glow.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        gl.position.set(glow.x, glow.y, glow.z); gl.userData.noFrame = true; g.add(gl);
      }
      return { object: g, update: gl ? (dt, t) => gl.scale.setScalar(0.28 + 0.08 * Math.sin(t * 9 + glow.x)) : null };
    },
  });
}

// ---- 7. Profession tools (prof-models.js toolGeometry): along +y, grip at the origin, hand units
for (const kind of TOOL_KINDS) {
  add('Profession tools', {
    id: kind, source: TV + 'prof-models.js', call: `toolGeometry('${kind}')`,
    note: 'Held in the fist while working (avatar-3d chibi2-motion-prof.js PROF_TOOL_MOUNT). Shown standing on its grip.',
    build() { const geo = toolGeometry(kind); geo.computeBoundingBox(); const m = new THREE.Mesh(geo, profMats().plain); m.castShadow = true; m.position.y = -geo.boundingBox.min.y; return { object: m }; },
  });
}

// ---- 8. Fishing (angling-view.js): the rod in the hand, the float on the water, the fish that jumps
const FISH = [
  ['rod', 'rodGeometry()', () => rodGeometry(), 'Butt at the origin along +y; 1.5 bone units (about 1.9 m on a human).'],
  ['float', 'floatGeometry()', () => floatGeometry(), 'Centred on the waterline (shown lifted onto the ground).'],
  ['fish', 'fishGeometry()', () => fishGeometry(), 'About 0.5 units long; a pool jump draws it at 1.6 + 0.3 x the pool tier.'],
];
for (const [id, call, make, note] of FISH) {
  add('Fishing', {
    id, source: TV + 'angling-view.js', call, note,
    build() {
      // shown standing on the ground (the game hangs the rod in a hand and floats the float on the water)
      const geo = make(); geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); m.castShadow = true;
      m.position.y = -geo.boundingBox.min.y; if (id === 'fish') m.rotation.y = Math.PI / 2;
      return { object: m };
    },
  });
}

// ---- 9. Camp and event props: the captive's cage (held-view.js createHeld) and the training dummy (dummy-model.js)
for (const open of [false, true]) {
  add('Camp + events', {
    id: open ? 'cage (open)' : 'cage', source: TV + 'held-view.js', call: `createHeld(group).set(id, { kind: 'cage', x: 0, z: 0${open ? ', open: true' : ''} })`,
    note: 'Where a road-event captive is held; the door swings open when they are freed.',
    build() {
      const g = new THREE.Group();
      const held = createHeld(g, {});
      held.set(0, { kind: 'cage', x: 0, z: 0, open });
      held.update(0.016, () => null);
      return { object: g, update: dt => held.update(dt, () => null) };
    },
  });
}
add('Camp + events', {
  id: 'training dummy', source: TV + 'dummy-model.js', call: 'createDummyBody()',
  note: 'Rocks on its post when struck (the page knocks it every three seconds).',
  build() {
    const body = createDummyBody();
    let next = 1.5;
    return { object: body.group, update: (dt, t) => { if (t > next) { next = t + 3; body.hit(0.6, 0.8, 0, 1); } body.update(dt); } };
  },
});

// ---- 10. Harbour (harbour-view.js), drawn by town-view.js createTownView from the zone's real `harbour` placement
function zoneT(off, { heightAt = () => 0, groundAt = heightAt } = {}) { return { zoneKey: 'tvprops', ox: off.x, oz: off.z, heightAt, groundAt }; }
function waterPlane(w, d, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: '#2f5d6e', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; m.userData.noFrame = true; return m;
}
function gullwickHarbour(ctx) {
  const rec = (ctx.data.gullwick?.placements || []).find(p => p.kind === 'harbour' && p.data?.quay);
  if (!rec) throw new Error('no built harbour in z14_02/placements.json');
  const Q = rec.data.quay, cx = (Q.x0 + Q.x1) / 2, cz = Q.z1;
  return { rec, off: { x: -cx, z: -cz }, Q };
}
function harbourBackdrop(Q, len) {
  // land behind the quay (its paving height) and the sea in front: the gallery's grass plane would be wrong here
  const g = new THREE.Group();
  const land = new THREE.Mesh(new THREE.BoxGeometry(len + 30, Q.h + 3, 34), new THREE.MeshStandardMaterial({ color: '#8b8273', roughness: 0.95 }));
  land.position.set(0, (Q.h - 3) / 2 - 0.001, -17 + 0.0); land.receiveShadow = true; land.userData.noFrame = true; g.add(land);
  g.add(waterPlane(len + 60, 160, 0)); g.children.at(-1).position.z = 60;
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(len + 60, 160), new THREE.MeshStandardMaterial({ color: '#4a4436' })); bed.rotation.x = -Math.PI / 2; bed.position.set(0, -3, 60); bed.userData.noFrame = true; g.add(bed);
  return g;
}
add('Harbour', {
  id: 'gullwick harbour', source: TV + 'harbour-view.js', call: 'createTownView(T, [harbour]) -> harbourParts + harbourExtras',
  note: 'Gullwick\'s real quay record (data/zones/z14_02): stone face and coping, bollards, three piers on posts, lamps, and the quay clutter at the top tier. Water at y 0, quay top at 2.2 m.',
  build(ctx) {
    const { rec, off, Q } = gullwickHarbour(ctx);
    const T = zoneT(off, { heightAt: () => Q.h, groundAt: () => -3 });
    const view = createTownView(T, [rec], { quality: 'high' });
    const g = new THREE.Group(); g.add(view.group, harbourBackdrop(Q, Q.x1 - Q.x0));
    return { object: g, noGround: true, dir: [0.5, 1, 1], zoom: 0.75, update: dt => view.update(dt), setNight: n => view.setNight(n), dispose: () => view.dispose() };
  },
});
for (const which of ['harbourParts', 'harbourExtras']) {
  add('Harbour', {
    id: which, source: TV + 'harbour-view.js', call: `${which}(rec, { ox, oz${which === 'harbourParts' ? ', groundAt' : ', density: 1'} })`,
    note: which === 'harbourParts' ? 'Only the built harbour: quay, coping, bollards, piers and their posts, the lamp posts\' bases.' : 'Only the working clutter: barrels, crates, sacks, rope, fish baskets, lobster pots, the hand crane, nets, the anchor.',
    build(ctx) {
      const { rec, off, Q } = gullwickHarbour(ctx);
      const parts = which === 'harbourParts' ? harbourParts(rec, { ox: off.x, oz: off.z, groundAt: () => -3 }).parts : harbourExtras(rec, { ox: off.x, oz: off.z, density: 1 });
      const g = new THREE.Group(); g.add(kitGroupSurf(parts), harbourBackdrop(Q, Q.x1 - Q.x0));
      return { object: g, noGround: true, dir: [0.5, 1, 1], zoom: 0.75 };
    },
  });
}
add('Harbour', {
  id: 'port vharl beach', source: TV + 'harbour-view.js', call: 'createTownView(T, [harbour]) -> portDressing',
  note: 'Port Vharl has no built quay (its jetty is the ship\'s own): its beach gets reed awnings, outrigger canoes, clay pots, stones, baskets and rope. Real record from data/zones/z13_10.',
  build(ctx) {
    const rec = (ctx.data.portVharl?.placements || []).find(p => p.kind === 'harbour');
    if (!rec) throw new Error('no harbour in z13_10/placements.json');
    const H = 0.4;     // dry ground (portDressing only places where the ground is above 0.35)
    const view = createTownView(zoneT({ x: -rec.x, z: -rec.z }, { heightAt: () => H }), [rec], { quality: 'high' });
    const g = new THREE.Group(); view.group.position.y = -H; g.add(view.group);
    return { object: g, update: dt => view.update(dt), setNight: n => view.setNight(n), dispose: () => view.dispose() };
  },
});

// ---- 11. Town squares (town-square.js squareFurniture): paving, the well, market stalls, square clutter (createTownView)
for (const [zone, town, culture] of [['gullwick', 'gullwick', 'halfling'], ['portVharl', 'port_vharl', 'vharl'], ['gorsehold', 'gorsehold', 'desert']]) {
  add('Town square', {
    id: `${town} square`, source: TV + 'town-square.js', call: 'createTownView(T, [settlement, town_square]) -> squareFurniture + squareClutter',
    note: `The real ${culture} square record: the well in the middle, stalls where the bake put them (beside the streets in), benches, crates, sacks, a cart and a bucket.`,
    build(ctx) {
      const list = ctx.data[zone]?.placements || [];
      const sq = list.find(p => p.kind === 'town_square' && p.data?.town === town);
      const st = list.find(p => p.kind === 'settlement' && p.id === town);
      if (!sq || !st) throw new Error(`no square for ${town}`);
      const view = createTownView(zoneT({ x: -sq.x, z: -sq.z }), [st, sq], { quality: 'high' });
      return { object: view.group, update: dt => view.update(dt), setNight: n => view.setNight(n), dispose: () => view.dispose() };
    },
  });
}

// ---- 12. Markers: loot sparkle + beam (loot-marker.js), quest and travel glyphs (quest-marks.js)
const RARITIES = ['normal', 'magic', 'rare', 'set', 'legendary', 'mythic'];
for (const r of RARITIES) {
  add('Markers', {
    id: `loot: ${r}`, source: TV + 'loot-marker.js', call: `createLootMarkers({ actors, glowTexture }).set(id, true, '${r}')`,
    note: `Over a body that holds loot for you, tinted ${RARITY_COLOUR[r]}; rare and better add a column of light. The grey capsule is a stand-in corpse.`,
    build() {
      const g = new THREE.Group(); g.add(standIn(true));
      const body = new THREE.Group(); body.position.y = 0.2; g.add(body);
      const actors = new Map([[1, { group: body }]]);
      const lm = createLootMarkers({ actors, glowTexture: makeGlowTexture() });
      lm.set(1, true, r); lm.update(0.016);
      return { object: g, update: dt => lm.update(dt), dispose: () => lm.clear() };
    },
  });
}
for (const mark of [...MARKS, ...TRAVEL_MARKS]) {
  const L = MARK_LOOK[mark] || TRAVEL_LOOK[mark];
  add('Markers', {
    id: `${MARKS.includes(mark) ? 'quest' : 'travel'}: ${mark}`, source: TV + 'quest-marks.js',
    call: MARKS.includes(mark) ? `createQuestMarks(scene, { actors, camera }).set(id, '${mark}')` : `createQuestMarks(...).setTravel(id, '${mark}')`,
    name: L.label, note: 'Floats over a person (grey capsule = stand-in); grows with distance so it stays readable.',
    build(ctx) {
      const g = new THREE.Group(); g.add(standIn(false));
      const actors = new Map([[1, { pos: new THREE.Vector3(0, 0, 0), height: 1.7, name: '' }]]);
      const qm = createQuestMarks(g, { actors, camera: ctx.camera, pool: 2 });
      if (MARKS.includes(mark)) qm.set(1, mark); else qm.setTravel(1, mark);
      qm.update(0.016);
      // a travel glyph is the icon library's SVG, drawn into its texture when it has loaded: give it a moment
      const ready = MARKS.includes(mark) ? null : import('../../icons/js/game-icons.js').then(() => new Promise(r => setTimeout(r, 500))).catch(() => {});
      return { object: g, ready, update: dt => qm.update(dt) };
    },
  });
}

// ---- 13. Dungeon rooms (dungeon-view.js createDungeonView): one sample room per look, no server needed
/** A sample one-room floor: a 10 x 8 cell room (20 x 16 m) with a short corridor out of it, rooms[] so the torches and dressing run. */
export function sampleDungeon(look) {
  const w = 14, h = 11, tiles = new Uint8Array(w * h);
  const room = { i: 1, j: 1, w: 10, h: 8, kind: 'fight' };
  for (let j = room.j; j < room.j + room.h; j++) for (let i = room.i; i < room.i + room.w; i++) tiles[j * w + i] = 1;
  for (let i = room.i + room.w; i < w - 1; i++) { tiles[4 * w + i] = 1; tiles[5 * w + i] = 1; }       // a corridor going east
  const cell = 2, origin = { x: -(room.i + room.w / 2) * cell, z: -(room.j + room.h / 2) * cell };
  return { look, cell, floors: [{ index: 0, w, h, origin, tiles, rooms: [room], entry: { x: 0, z: 0 } }] };
}
for (const look of Object.keys(LOOKS)) {
  const LK = LOOKS[look];
  add('Dungeon rooms', {
    id: look, source: TV + 'dungeon-view.js', call: `createDungeonView({ look: '${look}', cell: 2, floors: [one room] })`,
    note: `floor ${LK.floor}, wall ${LK.wall} ${LK.wallH} m, torch ${LK.torch}; props ${LK.props.join(', ')}; ground ${LK.ground.join(', ')}${LK.tombs ? '; tombs' : ''}${LK.beams ? '; beams' : ''}${LK.water ? '; pools' : ''}${LK.glow ? '; glowing growths' : ''}. A made-up 20 x 16 m room, not a planned dungeon.`,
    build() {
      const v = createDungeonView(sampleDungeon(look), { quality: 'high' });
      // the black plane under the floors (hides gaps between floors) is 40 m wider than the plan: not part of the room
      v.group.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.material?.isMeshBasicMaterial && !o.material.transparent) o.userData.noFrame = true; });
      return { object: v.group, noGround: true, dark: LK.fog, dir: [0.35, 1.5, 0.75], zoom: 0.8, update: (dt) => v.update(dt), dispose: () => v.dispose() };
    },
  });
}

/** Group -> short blurb for the filter list. */
export const GROUP_INFO = {
  'Vharlen props': 'vh_* wilderness props of the Burning Isle',
  'Vharlen scatter': 'ground scatter pieces of the Burning Isle',
  'Street clutter': 'barrels, crates, carts… beside doors, on squares and quays',
  'Buildings + trim': 'real baked buildings with their trim and door clutter',
  'Gathering nodes': 'profession nodes, ready and spent, and ore chunks',
  'Stations': 'crafting stations beside craftsmen',
  'Profession tools': 'the tool in the hand while working',
  'Fishing': 'rod, float, fish',
  'Camp + events': 'captive cage, training dummy',
  'Harbour': 'quays, piers, harbour clutter, a dressed beach',
  'Town square': 'well, stalls and square clutter',
  'Markers': 'loot sparkles, quest and travel glyphs',
  'Dungeon rooms': 'one sample room per dungeon look',
};
