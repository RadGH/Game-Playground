// Bespoke areas — "set pieces" (play-test 2, Q18: "more content, more bespoke areas, especially near the start:
// graveyards, farmlands, various other details").
//
// Two streams lay them out; this file draws both, with the models in proctown's set-piece kit (proctown/js/propkit.js,
// a reusable experiment — Farhold or Bannerline can draw the same graveyard) and the office dressing (offices.js):
//
//   stream B (data/zones/<zone>/placements.json, docs/world.md §10) — the GROUND: `set_piece` records (graveyard
//     with grave rows + gate, orchard, mill pond with its wheel, stone circle, sheepfold, inn crossing, farm, belt),
//     `field` (crop / tilled / pasture, oriented rects), `hedge` / `fence` / `wall` polylines, `set_building`
//     (proctown bodies by want: chapel, mill, granary, inn, stable, house, hut) and `signpost` (arms naming roads)
//   stream E (data/vignettes/placements/<zone>.json, `setpiece: true`, recipe in data/vignettes/setpieces.json) —
//     the DRESSING: props, named `models`, primitive `parts`, proctown `buildings` and crop `fields`, local metres,
//     scaled by the placement's `scale` when E fitted the piece into one of B's (`bound`).
//
// Everything becomes unit shapes in ONE set of instanced meshes per zone (eight draw calls however many graves), plus
// lantern glass, a few turning wheels/sails and flame sprites. Parts stand on the ground at their own point.

import * as THREE from 'three';
import { LIGHTS } from './lightpool.js';
import { unitGeometry, localToWorld } from './town-view.js';
import { sheafGeometry, sheafWind } from '../../../../proctown/js/propkit-three.js';   // play-test 6 (U4): standing crops
import { windUniform } from './decor.js';

// U4 ("looks like coffins"): grain is drawn as `sheaf` patches — thin stalks, uneven top — in ONE instanced mesh per zone,
// with ONE material for the whole page (so one shader program, warmed at boot through cropSample()) swaying on the
// page's own wind clock.
let SHEAF_GEO = null, CROP_MAT = null;
let SHEAF_BLADES = 16, CROP_NEAR = 110;
/** Software / low-quality renderers draw half the blades (main.js calls this once, before any zone is built). */
export function setCropDetail(blades, near = null) { if (!SHEAF_GEO) SHEAF_BLADES = Math.max(4, blades | 0); if (near != null) CROP_NEAR = Math.max(20, +near || 110); }
/** How far standing crops are drawn as stalks (metres from you to the field's edge); further, a field is a flat slab. A settings hook. */
export function setCropDistance(m) { CROP_NEAR = Math.max(20, Math.min(400, +m || 110)); }
const sheafGeo = () => SHEAF_GEO || (SHEAF_GEO = sheafGeometry(THREE, SHEAF_BLADES));
function cropMaterial() {
  if (!CROP_MAT) CROP_MAT = sheafWind(new THREE.MeshLambertMaterial({ vertexColors: true }), windUniform);
  return CROP_MAT;
}
/** One visible sheaf with the crop material, for the boot shader warm-up (warmup.js `extras`). */
export function cropSample() { const m = new THREE.InstancedMesh(sheafGeo(), cropMaterial(), 1); m.setMatrixAt(0, new THREE.Matrix4()); m.setColorAt(0, new THREE.Color('#c9a84a')); m.receiveShadow = true; return m; }
import { makeGlowTexture, makeFlameTexture, createDecor } from './decor.js';
import { createBudget } from './perf.js';
import { buildSignBoards } from './sign-text.js';
import { MESHES, describeBuilding, partsFor, radiusOf } from '../../../../proctown/js/buildkit.js';
import { officeDressing, officeKindFor, OFFICE_KINDS } from '../../../../proctown/js/offices.js';
import * as KIT from '../../../../proctown/js/propkit.js';
import { tuneFor } from './building-tune.js';

let recipesP = null;
/** E's set-piece recipes + its model table (fallback primitive parts per model id). */
export function loadSetPieceRecipes() {
  if (!recipesP) recipesP = fetch(new URL('../../data/vignettes/setpieces.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    .then(d => ({ byId: new Map(((d && d.vignettes) || []).map(v => [v.id, v])), models: (d && d.models) || {} }));
  return recipesP;
}

const GRAVE_MODEL = { headstone: ['gravestone', 'gravestone', 'gravestone', 'gravestone_leaning'], cross: ['grave_cross', 'celtic_cross'], mound: ['grave_mound'], tomb: ['tomb_chest'], slab: ['grave_slab'], obelisk: ['grave_obelisk'] };
const CROP = { cabbages: 'cabbage', turnips: 'turnip', beets: 'beet', carrots: 'carrot', onions: 'onion', potatoes: 'potato', pumpkins: 'pumpkin', tilled: 'fallow', field: 'fallow', grapes: 'vineyard', peas: 'peas', beans: 'beans' };
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** A model's parts: proctown's set-piece kit first, E's primitive fallback for an id the kit lacks. Pure. */
export function modelParts(id, seed, fallback = null) {
  let m = null;
  try { m = KIT.propModel ? KIT.propModel(id, { seed }) : null; } catch { m = null; }
  if (m) return m;
  const fb = fallback && fallback[id];
  if (fb && Array.isArray(fb.parts)) return { id, parts: fb.parts.map(p => ({ mesh: p.mesh || 'box', x: p.x || 0, y: p.y || 0, z: p.z || 0, w: p.w || 0.5, h: p.h || 0.5, d: p.d || 0.5, yaw: p.yaw || 0, colour: p.colour || p.color || '#8a857c' })), spin: [], fires: [], glows: [], solid: null };
  return null;
}

/**
 * Plan every part of a zone's set pieces, in world metres (y = height above the ground at the part's own point unless
 * `abs`). Pure given the data — exported for tests.
 * -> { parts: [{mesh, x, y, z, w, h, d, yaw, rx, rz, colour, tag}], glass, spin, fires, lights, buildings: [{plot, want, kind, lit, culture}], solids }
 */
export function planSetPieces({ placements = [], vignettes = [] } = {}, { recipes = new Map(), models = {}, ox = 0, oz = 0 } = {}) {
  const parts = [], glass = [], spin = [], fires = [], lights = [], buildings = [], solids = [], props = [], cropFields = [];
  const put = (p, x, z, yaw, seedTag = '') => {
    // a model/part list at (x, z) turned by yaw: each part's local (x, z) turns with it, its own yaw adds
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return q => ({ ...q, x: x + q.x * c + q.z * s, z: z - q.x * s + q.z * c, yaw: yaw + (q.yaw || 0), rx: q.rx || 0, rz: q.rz || 0 });
  };
  function model(id, x, z, yaw, seed, { scale = 1 } = {}) {
    const m = modelParts(id, seed, models);
    if (!m) return false;
    const T = put(null, x, z, yaw);
    for (const q of m.parts) {
      const w = T(scale === 1 ? q : { ...q, x: q.x * scale, y: q.y * scale, z: q.z * scale, w: q.w * scale, h: q.h * scale, d: q.d * scale });
      (q.tag === 'lamp' ? glass : parts).push(w);
    }
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    for (const sp of m.spin || []) { const w = W(sp.x, sp.z); spin.push({ x: w.x, y: sp.y, z: w.z, yaw, axis: sp.axis, speed: sp.speed, parts: sp.parts }); }
    for (const f of m.fires || []) { const w = W(f.x, f.z); fires.push({ x: w.x, y: f.y, z: w.z, s: f.s || 0.8 }); lights.push({ x: w.x, y: f.y + 0.6, z: w.z, color: '#ffae5c', strong: true }); }
    for (const g of m.glows || []) { const w = W(g.x, g.z); lights.push({ x: w.x, y: g.y, z: w.z, color: g.color || '#ffbe6e', soft: true }); }
    if (m.solid) solids.push({ x, z, r: m.solid.r * scale, h: m.solid.h * scale });
    return true;
  }
  /** A run of segments along a polyline: a wall, hedge or fence piece per span (parts follow the ground). */
  function line(pts, kind, h) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.2) continue;
      const yaw = Math.atan2(bx - ax, bz - az);
      // split long spans so a piece hugs the ground under it
      const n = Math.max(1, Math.ceil(L / (kind === 'fence' ? 3 : 2.5)));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, len = L / n;
        const cx = ax + (bx - ax) * (t0 + t1) / 2, cz = az + (bz - az) * (t0 + t1) / 2;
        if (kind === 'hedge') {
          parts.push({ mesh: 'box', x: cx, y: -0.1, z: cz, w: 1.0, h: h + 0.1, d: len + 0.25, yaw, rx: 0, rz: 0, colour: (k + i) % 3 ? '#3d6a2c' : '#46752f' });
          parts.push({ mesh: 'dome', x: cx, y: h - 0.15, z: cz, w: 1.05, h: 0.4, d: len + 0.2, yaw, rx: 0, rz: 0, colour: '#4a7a32' });
        } else if (kind === 'wall') {
          parts.push({ mesh: 'box', x: cx, y: -0.2, z: cz, w: 0.75, h: h + 0.2, d: len + 0.12, yaw, rx: 0, rz: 0, colour: (k + i) % 2 ? '#8a857c' : '#7d786f' });
          parts.push({ mesh: 'box', x: cx, y: h - 0.02, z: cz, w: 0.82, h: 0.14, d: len + 0.14, yaw, rx: 0, rz: 0, colour: '#6d6961' });
        } else {
          const s = Math.sin(yaw), c = Math.cos(yaw);
          parts.push({ mesh: 'box', x: cx - s * len / 2, y: -0.1, z: cz - c * len / 2, w: 0.14, h: h + 0.1, d: 0.14, yaw, rx: 0, rz: 0, colour: '#5a4632' });
          for (const y of [h * 0.42, h * 0.82]) parts.push({ mesh: 'box', x: cx, y, z: cz, w: 0.07, h: 0.1, d: len + 0.05, yaw, rx: 0, rz: 0, colour: '#7a6048' });
        }
      }
      if (kind === 'fence' && i === pts.length - 2) parts.push({ mesh: 'box', x: bx, y: -0.1, z: bz, w: 0.14, h: h + 0.1, d: 0.14, yaw, rx: 0, rz: 0, colour: '#5a4632' });
    }
  }
  function field(x, z, rec) {
    const d = rec.data || {};
    if (d.crop === 'pasture') return;                         // grass; its fence/hedge come as their own lines
    const crop = CROP[d.grows] || d.grows || 'fallow';
    let list = [];
    try { list = KIT.cropField ? KIT.cropField({ w: d.w || 20, d: d.d || 14, crop, seed: hashStr(rec.id) }) : []; } catch { list = []; }
    // the plot's local +x runs along proctown's angle a: (cos a, sin a); yaw for our turn is the angle that sends
    // local +z to (sin yaw, cos yaw) — +x then goes to (cos yaw, -sin yaw), so yaw = -a
    const T = put(null, x, z, -(d.angle || 0));
    // standing stalks carry the field they belong to: each field is its own instanced mesh, drawn only when near
    // (cropFields: where, how big, what colour — for the flat far stand-in)
    const fid = 'f:' + rec.id;
    let n = 0, top = 0, tint = null;
    for (const q of list) { const w = T(q); if (q.mesh === 'sheaf') { w.fid = fid; n++; top = Math.max(top, q.h); tint ||= q.colour; } parts.push(w); }
    if (n) cropFields.push({ fid, x, z, w: d.w || 20, d: d.d || 14, yaw: -(d.angle || 0), h: top, colour: tint });
  }
  // ---- stream B: the ground ------------------------------------------------------------------------
  for (const raw of placements) {
    const x = raw.x + ox, z = raw.z + oz, d = raw.data || {};
    const pts = d.pts ? d.pts.map(([px, pz]) => [px + ox, pz + oz]) : null;
    switch (raw.kind) {
      case 'field': field(x, z, raw); break;
      case 'hedge': if (pts) line(pts, 'hedge', d.h || 1.5); break;
      case 'fence': if (pts) line(pts, 'fence', d.h || 1.1); break;
      case 'wall': if (pts) line(pts, 'wall', d.h || 1); break;
      case 'set_building': {
        const kind = officeKindFor(d.want);
        buildings.push({ id: raw.id, plot: { cx: x, cz: z, w: d.w || 7, d: d.d || 6, angle: d.angle || 0, facing: d.front ?? (Math.PI / 2 - (raw.yaw || 0)), want: d.want || 'house' }, culture: d.culture || 'human', kind, lit: kind ? (d.lit ?? OFFICE_KINDS[kind].lit) : false, label: d.label || null, seed: hashStr(raw.id) });
        break;
      }
      case 'signpost': {
        parts.push({ mesh: 'cyl', x, y: -0.2, z, w: 0.2, h: 3.0, d: 0.2, yaw: 0, rx: 0, rz: 0, colour: '#5a4632' });
        parts.push({ mesh: 'cone', x, y: 2.8, z, w: 0.26, h: 0.2, d: 0.26, yaw: 0, rx: 0, rz: 0, colour: '#4a3a2c' });
        (d.arms || []).forEach((a, k) => {
          const y = 2.5 - k * 0.32, yaw = a.yaw || 0;
          parts.push({ mesh: 'box', x: x + Math.sin(yaw) * 0.55, y, z: z + Math.cos(yaw) * 0.55, w: 0.06, h: 0.22, d: 1.0, yaw, rx: 0, rz: 0, colour: '#b89a6a' });
          parts.push({ mesh: 'gable', x: x + Math.sin(yaw) * 1.05, y, z: z + Math.cos(yaw) * 1.05, w: 0.22, h: 0.12, d: 0.06, yaw: yaw + Math.PI / 2, rx: 0, rz: Math.PI / 2, colour: '#b89a6a' });
        });
        break;
      }
      case 'set_piece': {
        const seed = hashStr(raw.id);
        if (d.piece === 'graveyard') {
          (d.graves || []).forEach(([gx, gz, yaw, style], i) => {
            const list = GRAVE_MODEL[style] || GRAVE_MODEL.headstone;
            const id = list[(seed + i * 7) % list.length];
            if (!model(id, gx + ox, gz + oz, yaw || 0, seed + i) && !model('gravestone', gx + ox, gz + oz, yaw || 0, seed + i)) {
              parts.push({ mesh: 'box', x: gx + ox, y: 0, z: gz + oz, w: 0.6, h: 0.9, d: 0.16, yaw: yaw || 0, rx: 0, rz: 0, colour: '#8f8a82' });
            }
          });
          if (d.gate) model('lychgate', d.gate.x + ox, d.gate.z + oz, d.gate.yaw || 0, seed);
          // a sexton's bell and a bench by the gate path, where the yard has room
          if (d.gate) { const c = localToWorld(d.gate.x + ox, d.gate.z + oz, d.gate.yaw || 0, 3.2, 2.2); model('bench', c.x, c.z, (d.gate.yaw || 0) + Math.PI / 2, seed + 1); }
        } else if (d.piece === 'mill_pond' && d.wheel) {
          model('watermill_wheel', d.wheel.x + ox, d.wheel.z + oz, d.wheel.yaw || 0, seed);
        } else if (d.piece === 'stone_circle') {
          (d.stones || []).forEach(([sx, sz, a, st], i) => {
            if (st === 'fallen') { const m = modelParts('standing_stone', seed + i, models); if (m) for (const q of m.parts) parts.push({ ...q, x: sx + ox, y: 0.2, z: sz + oz, yaw: a || 0, rx: Math.PI / 2 - 0.08, rz: 0 }); }
            else model('standing_stone', sx + ox, sz + oz, a || 0, seed + i);
          });
          model('altar_stone', x, z, 0, seed);
        } else if (d.piece === 'sheepfold') {
          // a round dry-stone fold with its gap toward the gate
          const r = Math.max(4, (d.r || 9) * 0.78), gate = d.gate ? Math.atan2(d.gate.x + ox - x, d.gate.z + oz - z) : 0, ring = [];
          for (let k = 0; k <= 28; k++) { const a = gate + 0.32 + k / 28 * (Math.PI * 2 - 0.64); ring.push([x + Math.sin(a) * r, z + Math.cos(a) * r]); }
          line(ring, 'wall', 1.0);
          model('water_trough', x + 1.5, z - 1.5, 0.4, seed);
        } else if (d.piece === 'inn' && d.slots) {
          for (const s of d.slots) if (s.kind === 'well') model('well', s.x + ox, s.z + oz, s.yaw || 0, seed);
        } else if (d.piece === 'orchard' && d.gate) {
          model('orchard_ladder', d.gate.x + ox + 2.5, d.gate.z + oz + 2.5, 0.6, seed); model('fruit_crate', d.gate.x + ox + 3.4, d.gate.z + oz + 1.6, 0.2, seed);
        } else if (d.piece === 'farm') {
          const yard = (d.slots || []).find(s => s.kind === 'farmstead');
          if (yard) { model('haystack', yard.x + ox + 6, yard.z + oz - 4, 0, seed); model('water_trough', yard.x + ox - 5, yard.z + oz + 5, 0.3, seed); model('chicken_coop', yard.x + ox + 5, yard.z + oz + 6, 2.1, seed); }
        }
        break;
      }
      default: break;
    }
  }
  // ---- stream E: the dressing ----------------------------------------------------------------------
  for (const pl of vignettes) {
    const rec = recipes.get(pl.recipe || pl.id);
    if (!rec) continue;
    const k = pl.scale > 0 && pl.scale < 1 ? pl.scale : 1;
    const px = pl.x + ox, pz = pl.z + oz, yaw = pl.yaw || 0, seed = hashStr(pl.id);
    const at = (lx, lz) => localToWorld(px, pz, yaw, lx * k, lz * k);
    for (const m of rec.models || []) { const w = at(m.x || 0, m.z || 0); model(m.id, w.x, w.z, yaw + (m.yaw || 0), seed + Math.round((m.x || 0) * 13 + (m.z || 0) * 7), { scale: m.scale || 1 }); }
    for (const q of rec.parts || []) { const w = at(q.x || 0, q.z || 0); parts.push({ mesh: q.mesh || 'box', x: w.x, y: q.y || 0, z: w.z, w: q.w || 0.5, h: q.h || 0.5, d: q.d || 0.5, yaw: yaw + (q.yaw || 0), rx: 0, rz: 0, colour: q.colour || q.color || '#8a857c' }); }
    for (const f of rec.fields || []) {
      const w = at(f.x || 0, f.z || 0);
      let list = []; try { list = KIT.cropField ? KIT.cropField({ w: (f.w || 10) * k, d: (f.d || 8) * k, crop: CROP[f.crop] || f.crop || 'fallow', seed: seed + 3 }) : []; } catch {}
      const T = put(null, w.x, w.z, yaw + (f.yaw || 0)); for (const q of list) parts.push(T(q));
    }
    for (const b of rec.buildings || []) {
      const w = at(b.x || 0, b.z || 0), kind = officeKindFor(b.want);
      const by = yaw + (b.yaw || 0);
      buildings.push({ id: pl.id + ':' + (b.want || 'b') + (b.x || 0), plot: { cx: w.x, cz: w.z, w: (b.w || 7) * Math.max(0.75, k), d: (b.d || 6) * Math.max(0.75, k), angle: Math.PI / 2 - by, facing: Math.PI / 2 - by, want: b.want || 'house' }, culture: 'halfling', kind, lit: kind ? (b.lit ?? OFFICE_KINDS[kind].lit) : false, seed: seed + 11 });
    }
    for (const p of rec.props || []) { const w = at(p.x || 0, p.z || 0); props.push({ kind: p.kind, id: p.id, x: w.x, z: w.z, yaw: yaw + (p.yaw || 0), scale: p.scale || 1, dead: !!p.dead }); }
  }
  return { parts, glass, spin, fires, lights, buildings, solids, props, cropFields };
}

/** Is this E placement a set piece (drawn here, not by the vignette pass)? */
export const isSetPiece = pl => !!(pl && (pl.setpiece || String(pl.recipe || pl.id || '').startsWith('sp_')));

export async function createSetPieceView(T, { placements = [], vignetteFile = null } = {}, { quality = 'high' } = {}) {
  const { byId, models } = await loadSetPieceRecipes();
  const vignettes = ((vignetteFile && vignetteFile.placements) || []).filter(isSetPiece);
  const relevant = placements.filter(p => ['field', 'hedge', 'fence', 'wall', 'set_building', 'signpost', 'set_piece'].includes(p.kind));
  if (!relevant.length && !vignettes.length) return null;
  const budget = createBudget(5);
  // planned a few records at a time (P1: a whole zone at once was ~80 ms of solid work on the test VM)
  const plan = { parts: [], glass: [], spin: [], fires: [], lights: [], buildings: [], solids: [], props: [] };
  const opts = { recipes: byId, models, ox: T.ox || 0, oz: T.oz || 0 };
  const merge = p => { for (const k of Object.keys(plan)) for (const v of p[k]) plan[k].push(v); };
  for (let i = 0; i < relevant.length; i += 6) { merge(planSetPieces({ placements: relevant.slice(i, i + 6) }, opts)); await budget.slice(); }
  for (const v of vignettes) { merge(planSetPieces({ vignettes: [v] }, opts)); await budget.slice(); }
  const cheap = quality === 'low';
  const group = new THREE.Group(); group.name = 'setpieces-' + (T.zoneKey || '');
  const Mat = cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const kitMat = new Mat(cheap ? {} : { roughness: 0.9 });
  const meshes = [], disposers = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), col = new THREE.Color();
  const groundOf = (x, z) => T.heightAt(x, z);
  // set_buildings: proctown bodies (+ office dressing on a chapel/mill/inn/stable), in the building's own frame
  const solids = plan.solids.map(s => { const g = groundOf(s.x, s.z); return { x: s.x, z: s.z, r: s.r, bottom: g - 1, top: g + s.h }; });
  const abs = [];      // parts already in absolute height (buildings)
  const signs = [];    // name boards over office doors (B's label: 'The Wheel and Wether')
  for (const b of plan.buildings) {
    let desc; try { desc = describeBuilding({ plot: b.plot, culture: b.culture, seed: b.seed, want: b.plot.want, tune: tuneFor(b.plot.want, { plot: b.plot, seed: b.seed }) }); } catch { continue; }
    const g = groundOf(b.plot.cx, b.plot.cz), yaw = desc.yaw + (desc.lean || 0), c = Math.cos(yaw), s = Math.sin(yaw);
    const place = (q, list) => list.push({ ...q, x: b.plot.cx + q.x * c + q.z * s, y: g + q.y, z: b.plot.cz - q.x * s + q.z * c, yaw: yaw + (q.yaw || 0), rx: q.rx || 0, rz: q.rz || 0 });
    abs.push({ mesh: 'box', x: b.plot.cx, y: g - 0.7, z: b.plot.cz, w: desc.footprint.w + 0.6, h: 0.95, d: desc.footprint.d + 0.6, yaw, rx: 0, rz: 0, colour: '#5a5248' });
    let top = 0;
    for (const q of partsFor(desc)) { top = Math.max(top, q.y + q.h); if (q.tag === 'window') place({ ...q }, b.lit ? plan.glassAbs || (plan.glassAbs = []) : abs); else place(q, abs); }
    if (b.kind) {
      const d = officeDressing(b.kind, desc, { lit: b.lit, seed: b.seed });
      for (const q of d.parts) place(q, q.tag === 'lamp' ? (plan.glassAbs || (plan.glassAbs = [])) : abs);
      for (const L of d.lights) plan.lights.push({ x: b.plot.cx + L.x * c + L.z * s, y: L.y, z: b.plot.cz - L.x * s + L.z * c, color: L.color, strong: !!L.strong, rel: true });
      for (const f of d.fires) plan.fires.push({ x: b.plot.cx + f.x * c + f.z * s, y: f.y, z: b.plot.cz - f.x * s + f.z * c, s: f.s });
      if (d.fascia) signs.push({ text: b.label || OFFICE_KINDS[b.kind].label, x: b.plot.cx + d.fascia.x * c + d.fascia.z * s, y: g + d.fascia.y, z: b.plot.cz - d.fascia.x * s + d.fascia.z * c, yaw, w: d.fascia.w, h: d.fascia.h });
      for (const sp of d.spin) plan.spin.push({ x: b.plot.cx + sp.x * c + sp.z * s, y: sp.y, z: b.plot.cz - sp.x * s + sp.z * c, yaw, axis: sp.axis, speed: sp.speed, parts: sp.parts });
    }
    solids.push({ x: b.plot.cx, z: b.plot.cz, r: radiusOf(desc) * 0.85, bottom: g - 1, top: g + top });
    await budget.slice();
  }
  // every part into one instanced mesh per unit shape
  const byMesh = Object.fromEntries(MESHES.map(m => [m, []]));
  // standing crops (propkit cropField grain / vine leaves): ONE instanced mesh per field, so a field out of view or
  // far away costs nothing (all the fields of a zone in one mesh were always drawn — 700,000 triangles round Torborhold,
  // which stalled the software renderer the specs run on and would do the same to a phone)
  const byField = new Map();
  for (const q of plan.parts) { if (q.mesh === 'sheaf' && q.fid) { if (!byField.has(q.fid)) byField.set(q.fid, []); byField.get(q.fid).push({ q, g: groundOf(q.x, q.z) }); } else (byMesh[q.mesh] || byMesh.box).push({ q, g: groundOf(q.x, q.z) }); }
  const crops = [];
  for (const f of plan.cropFields || []) {
    const list = byField.get(f.fid); if (!list?.length) continue;
    const m = new THREE.InstancedMesh(sheafGeo(), cropMaterial(), list.length);
    for (let i = 0; i < list.length; i++) { const { q, g } = list[i]; _e.set(q.rx || 0, q.yaw || 0, q.rz || 0, 'YXZ'); _q.setFromEuler(_e); m.setMatrixAt(i, _m.compose(_v.set(q.x, g + q.y, q.z), _q, _s.set(q.w, q.h, q.d))); m.setColorAt(i, col.set(q.colour || '#c9a84a')); }
    m.receiveShadow = true; m.computeBoundingSphere(); m.name = 'sp-crop'; m.visible = false; group.add(m); meshes.push(m);
    // the far stand-in: one low slab in the crop's colour over the plot (a sown field from a distance, never bare earth)
    const g0 = groundOf(f.x, f.z);
    const far = new THREE.Mesh(unitGeometry('box'), kitMat.clone()); far.material.color.set(f.colour || '#c9a84a');
    far.position.set(f.x, g0 + 0.05, f.z); far.rotation.y = f.yaw; far.scale.set(Math.max(1, f.w - 0.4), Math.max(0.3, f.h * 0.72), Math.max(1, f.d - 0.4)); far.receiveShadow = true; far.name = 'sp-crop-far';
    group.add(far); disposers.push(() => far.material.dispose());
    crops.push({ m, far, x: f.x, z: f.z, r: Math.hypot(f.w, f.d) / 2 });
    await budget.slice();
  }
  for (const q of abs) (byMesh[q.mesh] || byMesh.box).push({ q, g: 0 });
  await budget.slice();
  for (const [kind, list] of Object.entries(byMesh)) {
    if (!list.length) continue;
    const sheaf = false;
    const m = new THREE.InstancedMesh(unitGeometry(kind), kitMat, list.length);
    for (let i = 0; i < list.length; i++) {
      const { q, g } = list[i];
      _e.set(q.rx || 0, q.yaw || 0, q.rz || 0, 'YXZ'); _q.setFromEuler(_e);
      m.setMatrixAt(i, _m.compose(_v.set(q.x, g + q.y, q.z), _q, _s.set(q.w, q.h, q.d)));
      m.setColorAt(i, col.set(q.colour || '#8a857c'));
      if ((i & 1023) === 1023) await budget.slice();
    }
    m.castShadow = !cheap && !sheaf; m.receiveShadow = true; m.computeBoundingSphere(); m.name = 'sp-' + kind;
    group.add(m); meshes.push(m);
  }
  // lantern glass (lit buildings, the inn sign's lamp): warm at night
  const glassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffb45c', emissiveIntensity: 0, roughness: 0.4 });
  const glassList = [...plan.glass.map(q => ({ q, g: groundOf(q.x, q.z) })), ...(plan.glassAbs || []).map(q => ({ q, g: 0 }))];
  if (glassList.length) {
    const m = new THREE.InstancedMesh(unitGeometry('box'), glassMat, glassList.length);
    glassList.forEach(({ q, g }, i) => { _e.set(q.rx || 0, q.yaw || 0, q.rz || 0, 'YXZ'); _q.setFromEuler(_e); m.setMatrixAt(i, _m.compose(_v.set(q.x, g + q.y, q.z), _q, _s.set(q.w, q.h, q.d))); m.setColorAt(i, col.set(q.colour || '#ffd28a')); });
    m.computeBoundingSphere(); group.add(m); meshes.push(m);
  }
  // turning parts: water wheels, sails, cogs
  const spinners = [];
  for (const sp of plan.spin) {
    const g = new THREE.Group(); g.position.set(sp.x, groundOf(sp.x, sp.z) + sp.y, sp.z); g.rotation.set(0, sp.yaw || 0, 0);
    const turn = new THREE.Group(); g.add(turn);
    const per = Object.fromEntries(MESHES.map(k => [k, []]));
    for (const q of sp.parts) (per[q.mesh] || per.box).push(q);
    for (const [kind, list] of Object.entries(per)) {
      if (!list.length) continue;
      const m = new THREE.InstancedMesh(unitGeometry(kind), kitMat, list.length);
      list.forEach((q, i) => { _e.set(q.rx || 0, q.yaw || 0, q.rz || 0, 'YXZ'); _q.setFromEuler(_e); m.setMatrixAt(i, _m.compose(_v.set(q.x, q.y, q.z), _q, _s.set(q.w, q.h, q.d))); m.setColorAt(i, col.set(q.colour || '#6e553d')); });
      m.castShadow = !cheap; m.computeBoundingSphere(); turn.add(m); meshes.push(m);
    }
    group.add(g); spinners.push({ turn, axis: sp.axis || 'x', speed: sp.speed || 0.5 });
  }
  // flames + light sources from the page's fixed pool (never a new PointLight: P1)
  const flameMat = new THREE.SpriteMaterial({ map: makeFlameTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flames = plan.fires.map(f => { const s = new THREE.Sprite(flameMat); const y = groundOf(f.x, f.z) + f.y; s.position.set(f.x, y + f.s * 0.45, f.z); s.scale.set(f.s * 0.9, f.s * 1.3, 1); s.userData.s = f.s; group.add(s); return s; });
  const glowTex = makeGlowTexture();
  const lights = plan.lights.map(l => {
    const y = groundOf(l.x, l.z) + l.y;
    const h = LIGHTS.add({ x: l.x, y, z: l.z, color: l.color, intensity: 0, distance: l.strong ? 14 : l.soft ? 6 : 10, decay: 1.6, flicker: l.strong ? 0.15 : 0.04, owner: group });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: l.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: true }));
    s.position.set(l.x, y, l.z); s.scale.setScalar(l.strong ? 2.2 : 1.2); s.visible = false; group.add(s);
    return { l, h, s };
  });
  // E's props (barrels, hay bales, trees, campfires…) through the decor builder, same as the vignettes
  let decor = null;
  const propList = plan.props.filter(p => p.kind === 'prop');
  if (propList.length) {
    try {
      decor = await createDecor(T, { placements: propList.map(p => ({ kind: 'prop', id: p.id, x: p.x, z: p.z, yaw: p.yaw, data: ['campfire', 'torch_post', 'fire_ring'].includes(p.id) ? { fire: true } : {} })), density: 0, cheap });
      group.add(decor.group);
    } catch (e) { console.warn('[setpieces] props', e.message); }
  }
  const boards = buildSignBoards(signs);
  if (boards) group.add(boards.mesh);
  let t = 0, night = 0, cropAt = 0;
  function setNight(n) {
    night = n;
    glassMat.emissiveIntensity = 1.6 * n;
    boards?.setNight(n);
    for (const { l, h, s } of lights) { h.intensity = l.strong ? 6 + 10 * n : n > 0.05 ? (l.soft ? 4 : 9) * n : 0; s.visible = l.strong || n > 0.05; s.material.opacity = l.strong ? 0.35 + 0.5 * n : 0.8 * n; }
  }
  return {
    group, solids, setNight,
    plan,
    update(dt, pos) {
      t += dt;
      // crops: stalks within CROP_NEAR metres of you, the flat stand-in beyond (checked a few times a second)
      if (pos && crops.length && t >= cropAt) { cropAt = t + 0.3; for (const c of crops) { const near = Math.hypot(c.x - pos.x, c.z - pos.z) - c.r < CROP_NEAR; c.m.visible = near; c.far.visible = !near; } }
      for (const S of spinners) S.turn.rotation[S.axis] += S.speed * dt;
      for (let i = 0; i < flames.length; i++) { const f = flames[i]; f.scale.y = f.userData.s * (1.2 + Math.sin(t * 9 + i) * 0.12); }
      decor?.update?.(dt, pos);
    },
    stats: { signs: signs.length, parts: plan.parts.length + abs.length, buildings: plan.buildings.length, spinners: spinners.length, lights: lights.length, props: propList.length, meshes: meshes.length },
    dispose() { for (const m of meshes) m.dispose(); kitMat.dispose(); glassMat.dispose(); flameMat.dispose(); for (const { h, s } of lights) { h.remove(); s.material.dispose(); } decor?.dispose?.(); boards?.dispose(); for (const d of disposers) d(); },
  };
}
