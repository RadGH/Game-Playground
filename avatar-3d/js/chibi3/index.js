// Chibi 3: the character factory. Reads the SAME avatar JSON as Chibi 2 and returns a controller
// with the same core API (group, setAnim, update, setRate, metrics, stats, setAvatar, dispose), plus
// what Chibi 3 adds: setSpeed (locomotion blend), play (layered actions), setExpression, say (lip
// shapes), lookAt, setGround (foot IK) and levels of detail.
//
//   import { createChibi3Character } from '../avatar-3d/js/chibi3/index.js';
//   const hero = await createChibi3Character(avatar, { lod: 'auto' });
//   scene.add(hero.group); hero.setAnim('walk'); ... hero.update(dt);
//
// Read avatar-3d/CHIBI3.md first.

import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../../../avatar-2d/js/render.js';
import { layoutRig } from './rig.js';
import { Assembler } from './assemble.js';
import { buildBody } from './body.js';
import { skinPaints, paint, shadeHex, mixHex } from './paint.js';
import { Shape, cone, sphere, smoothstep } from './sdf.js';
import { Grid } from './mesher.js';
import { decimate } from './decimate.js';
import { bakeTemplate, readBaked, cacheGet, cachePut, hashKey, BAKE_VERSION } from './bake.js';
import { jointWeights } from './skin.js';
import { characterMaterial, eyeMaterial } from './material.js';
import { buildOutfit } from './outfit.js';
import { Animator } from './animator.js';
import { faceMorphs, MORPHS } from './face.js';

export { MORPHS };
export { Assembler };

/** Merge the shared defaults WITHOUT dropping ids the 2D catalogue does not know (ours may be new). */
export function normalizeForChibi3(avatar = {}) {
  const out = JSON.parse(JSON.stringify(DEFAULT_AVATAR));
  for (const [k, v] of Object.entries(avatar || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') Object.assign(out[k], JSON.parse(JSON.stringify(v)));
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

const LOD_DISTANCE = [0, 7, 16];
const templates = new Map();

/** Everything built from one look at one level of detail; shared by every character wearing it. */
function buildTemplate(a, lod) {
  const R = layoutRig(a), colors = skinPaints(a);
  const t0 = performance.now();
  const body = buildBody(a, R, colors);
  const asm = new Assembler(R, { lod });
  // the body sampled once on a grid: the skin is meshed from it, and every garment reads it as a
  // cheap stand-in for the body while filling its own grid
  body.shape.buildIndex();
  // filled with the WIDE evaluation: garments read it from centimetres off the skin
  const bodyGrid = new Grid(body.shape.bounds(0.04), 0.0125).fill({ eval: (x, y, z) => body.shape.evalWide(x, y, z) });
  const bodyFast = { eval: (x, y, z) => bodyGrid.sample(x, y, z) };
  asm.bodyField = bodyFast;
  const hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2];
  // ---- the skin, in three regions: the body coarse, the face and the hands fine
  const wrists = ['L', 'R'].map(s => { const w = R.byName['hand' + s].pos, e = R.byName['foreArm' + s].pos, d = norm3(sub(w, e)); return { w, d }; });
  const pastWrist = (x, y, z, by) => wrists.some(({ w, d }) => {
    const t = (x - w[0]) * d[0] + (y - w[1]) * d[1] + (z - w[2]) * d[2];
    if (t <= by) return false;
    // only near the hand itself: a leg is "below the wrist" too
    const px = x - w[0] - d[0] * t, py = y - w[1] - d[1] * t, pz = z - w[2] - d[2] * t;
    return t < 0.3 * R.P.S && Math.hypot(px, py, pz) < 0.075 * R.P.S * R.P.hand;
  });
  const neckCut = headY - 0.3 * hs;
  const skinWeights = faceWeights(R, body);
  const bodyLayer = { name: 'skin', shape: body.shape, step: 0.0125, grid: bodyGrid, hideable: true, weights: skinWeights, simplify: 0.0007,
    keep: lod === 2 ? null : (x, y, z) => y < neckCut + 0.02 * hs && !pastWrist(x, y, z, 0.012 * R.P.S) };
  asm.addField(bodyLayer);
  if (lod < 2) {
    // the finest regions (eyes, mouth, nose, ears) at LOD 0 only; LOD 1 keeps the plain face grid
    const regions = lod === 0 ? body.regions : [];
    const inBox = (b, x, y, z, m) => x > b[0] + m && y > b[1] + m && z > b[2] + m && x < b[3] - m && y < b[4] - m && z < b[5] - m;
    asm.addField({ name: 'face', shape: body.shape, step: 0.0052, inflate: 0.0004, hideable: true, weights: skinWeights, simplify: 0.0003,
      bounds: [-0.62 * hs, neckCut - 0.08 * hs, hz - 0.62 * hs, 0.62 * hs, headY + 0.95 * hs, hz + 0.6 * hs],
      keep: (x, y, z) => y > neckCut && !regions.some(r => inBox(r.box, x, y, z, 0.003)) });
    for (const r of regions) {
      const b = r.box, pad = r.step * 3;
      asm.addField({ name: r.name, shape: body.shape, step: r.step, inflate: r.inflate, hideable: true, weights: skinWeights, simplify: 0.00018,
        bounds: [b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad], keep: (x, y, z) => inBox(b, x, y, z, -0.0005), stepFixed: true });
    }
    for (const { w, d } of wrists) {
      const reach = 0.24 * R.P.S * R.P.hand, c = [w[0] + d[0] * reach * 0.42, w[1] + d[1] * reach * 0.42, w[2] + d[2] * reach * 0.42];
      asm.addField({ name: 'hand', shape: body.shape, step: 0.0046, inflate: 0.0006, hideable: true, weights: skinWeights, simplify: 0.0004,
        bounds: [c[0] - reach * 0.55, c[1] - reach * 0.62, c[2] - reach * 0.45, c[0] + reach * 0.55, c[1] + reach * 0.62, c[2] + reach * 0.45],
        keep: (x, y, z) => (x - w[0]) * d[0] + (y - w[1]) * d[1] + (z - w[2]) * d[2] > -0.006 * R.P.S });
    }
  }
  // ---- brows: a short pelt of hair laid on the brow ridge
  const browColor = a.brows?.color || shadeHex(a.hair?.color || '#3b2a1a', -0.1);
  if (a.brows?.id !== 'none') {
    const browShape = new Shape([], { name: 'brows', base: body.shape, offset: -0.0004 });
    const thick = { thick: 1.5, bushy: 1.8, thin: 0.6, arched: 1, angry: 1.1, worried: 1, raised: 1, straight: 1.1 }[a.brows?.id] ?? 1;
    const arch = a.brows?.id === 'arched' ? 0.03 : a.brows?.id === 'angry' ? -0.03 : 0;
    // the mask is drawn flat on the front of the face (it ignores depth), so it lands on the skin
    // wherever the brow ridge happens to be
    const strokes = [];
    for (const s of [1, -1]) {
      const pts = [[0.035, 0.425], [0.12, 0.447 + arch], [0.215, 0.43 + arch * 0.5]].map(([x, y]) => [s * x * hs, headY + y * hs]);
      strokes.push(capsule2d(pts[0], pts[1], 0.013 * hs * thick, 0.014 * hs * thick), capsule2d(pts[1], pts[2], 0.014 * hs * thick, 0.004 * hs));
    }
    const front = hz + 0.15 * hs;
    const strokeDist = (x, y) => { let d = 1e9; for (const f of strokes) { const v = f(x, y); if (v < d) d = v; } return d; };
    const browH = 0.0026 * R.P.S * Math.min(1.4, thick);
    // a domed pelt: tallest along the stroke, meeting the skin at its edge (no slab walls)
    browShape.displace = (x, y, z) => { if (z < front) return 0; const d = strokeDist(x, y); return d > 0 ? 0 : browH * Math.min(1, -d / (0.008 * hs)); };
    browShape.add({ op: 'inter', k: 0, box: null, d(x, y, z) { return Math.max(strokeDist(x, y), front - z); } });
    asm.addField({ name: 'brows', shape: browShape, owner: body.shape, step: 0.0035, simplify: 0.0002, minLod: 0, maxLod: 1, aoStrength: 0.3,
      bounds: [-0.3 * hs, headY + 0.36 * hs, hz + 0.12 * hs, 0.3 * hs, headY + 0.52 * hs, hz + 0.4 * hs],
      paint: paint('hair', browColor, { detail: 1.0, rough: 0.7 }), paintFn: () => paint('hair', browColor, { detail: 1.0, rough: 0.7 }), weights: (x, y, z) => [[R.byName.head.index, 1]] });
  }
  // ---- clothes, armour, hair, headwear, held things
  const outfit = buildOutfit(a, R, body, asm, { lod, bodyFast });
  // ---- eyelids: a cap over each eyeball, on its own bone, so a blink is a rotation
  if (lod < 2) for (const e of body.eyes) {
    // the cap rests a little closed, so the upper lid covers the top of the iris as a real one does
    const g = new THREE.SphereGeometry(e.radius * 1.1, 28, 10, 0, Math.PI * 2, 0, 1.25);
    g.rotateX(0.1);
    g.translate(...e.center);
    const lash = shadeHex(browColor, -0.35);
    asm.addGeometry({ name: 'lid' + e.side, geometry: g, bone: 'lid' + e.side, paint: colors.lidPaint, ao: false,
      paintFn: (x, y, z) => { const ly = ((y - e.center[1]) * Math.cos(0.1) + (z - e.center[2]) * Math.sin(0.1)) / (e.radius * 1.1); return ly < Math.cos(1.25) + 0.08 ? paint('hair', lash, { rough: 0.6, detail: 0 }) : { ...colors.skinPaint, detail: 0.2 }; } });
  }
  const geometry = asm.build();
  // ---- face morph targets (smile, frown, brows, visemes...) on the merged geometry
  if (lod < 2) faceMorphs(geometry, R, body);
  // ---- eyeballs: their own small mesh and material (an iris needs a real texture)
  let eyes = null;
  if (lod < 2) eyes = buildEyes(R, body, a);
  return { R, a, lod, geometry, eyes, outfit, body: { mouth: body.mouth, eyes: body.eyes, F: body.F }, ms: Math.round(performance.now() - t0), timings: asm.timings, tris: asm.tris };
}

/** Jaw weights: the lower lip, chin and jaw follow the jaw bone; the split is sharp at the lips. */
function faceWeights(R, body) {
  const hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2], jaw = R.byName.jaw.index, head = R.byName.head.index;
  const mouthY = (body.mouth.y - headY) / hs;
  return (x, y, z, owner) => {
    const w = jointWeights(R, x, y, z, owner === 'jaw' ? 'head' : owner);
    const hy = (y - headY) / hs, hzz = (z - hz) / hs, hx = x / hs;
    if (hy > 0.25 || hy < -0.45) return w;
    const front = smoothstep(0.17, 0.08, Math.abs(hx)) * smoothstep(0.18, 0.26, hzz);
    const sharp = smoothstep(mouthY + 0.008, mouthY - 0.008, hy);
    const soft = smoothstep(0.17, -0.02, hy) * smoothstep(-0.14, 0.06, hzz) * smoothstep(-0.45, -0.22, hy);
    const j = soft + (sharp - soft) * front;
    if (j < 0.001) return w;
    const out = [];
    for (const [i, wt] of w) { if (i === head) { out.push([head, wt * (1 - j)], [jaw, wt * j]); } else out.push([i, wt]); }
    return out;
  };
}

function buildEyes(R, body, a) {
  const parts = [];
  for (const e of body.eyes) {
    const g = new THREE.SphereGeometry(e.radius, 32, 20);
    g.rotateX(Math.PI / 2);   // the +y pole (front of the texture) now looks down +z
    const p = g.attributes.position;
    // cornea: the front of the eye bulges a little over the iris, which is what catches the highlight
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) / e.radius;
      if (z > 0.8) { const k = 1 + (z - 0.8) * 0.18; p.setXYZ(i, p.getX(i) * (1 + (k - 1) * 0.2), p.getY(i) * (1 + (k - 1) * 0.2), p.getZ(i) * k); }
    }
    g.computeVertexNormals();
    g.translate(...e.center);
    const n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = R.byName['eye' + e.side].index; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(g);
  }
  const merged = mergeSimple(parts);
  const slit = ['beast'].includes(a.body?.race) || a.eyes?.id === 'slit';
  return { geometry: merged, material: eyeMaterial(a.eyes?.color || '#5a7a3a', slit ? 'slit' : 'round') };
}

function mergeSimple(list) {
  const g = new THREE.BufferGeometry(), keys = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
  let nv = 0, ni = 0; for (const l of list) { nv += l.attributes.position.count; ni += l.index.count; }
  const arrays = Object.fromEntries(keys.map(k => [k, new (k === 'skinIndex' ? Uint16Array : Float32Array)(nv * list[0].attributes[k].itemSize)]));
  const idx = new Uint32Array(ni); let ov = 0, oi = 0;
  for (const l of list) {
    for (const k of keys) arrays[k].set(l.attributes[k].array, ov * l.attributes[k].itemSize);
    for (let i = 0; i < l.index.count; i++) idx[oi + i] = l.index.array[i] + ov;
    ov += l.attributes.position.count; oi += l.index.count;
  }
  for (const k of keys) g.setAttribute(k, new THREE.BufferAttribute(arrays[k], list[0].attributes[k].itemSize));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  return g;
}

/** A tapered 2D capsule in the xy plane (distance ignores z). */
function capsule2d(a, b, ra, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  return (x, y) => { const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) - (ra + (rb - ra) * t); };
}

/** A primitive that is the union of several, for masks ("only where these brush strokes are"). */
export function unionMask(prims, op = 'inter') {
  let box = null;
  for (const p of prims) box = !box ? p.box.slice() : [Math.min(box[0], p.box[0]), Math.min(box[1], p.box[1]), Math.min(box[2], p.box[2]), Math.max(box[3], p.box[3]), Math.max(box[4], p.box[4]), Math.max(box[5], p.box[5])];
  return { op, k: 0, box: null, d(x, y, z) { let d = 1e9; for (const p of prims) { const v = p.d(x, y, z); if (v < d) d = v; } return d; } };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

/**
 * The far levels of detail are NOT built again: they are the hero mesh simplified further, keeping
 * whole vertices (so colours, skin weights and morphs carry over exactly). A crowd LOD costs a
 * fraction of a second instead of a second full build.
 */
function deriveLod(hero, lod) {
  const g = hero.geometry, pos = g.attributes.position.array, nrm = g.attributes.normal.array;
  const t0 = performance.now();
  // colour borders stay pinned at LOD 1 so trims and heraldry keep their edges
  let pin = null;
  if (lod === 1) {
    const col = g.attributes.color.array, I = g.index.array, n = pos.length / 3;
    pin = new Uint8Array(n);
    const diff = (a, b) => Math.abs(col[a * 3] - col[b * 3]) + Math.abs(col[a * 3 + 1] - col[b * 3 + 1]) + Math.abs(col[a * 3 + 2] - col[b * 3 + 2]) > 0.18;
    for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (diff(a, b) || diff(b, c) || diff(a, c)) pin[a] = pin[b] = pin[c] = 1; }
  }
  const d = decimate({ positions: pos, normals: nrm, indices: g.index.array }, { maxError: lod === 1 ? 0.0022 : 0.012, minRatio: lod === 1 ? 0.22 : 0.04, pin, endpointsOnly: true, freeBoundaries: lod === 2 });
  const geometry = new THREE.BufferGeometry(), remap = d.remap, nOut = d.positions.length / 3;
  const back = new Int32Array(nOut); for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) back[remap[v]] = v;
  for (const [name, attr] of Object.entries(g.attributes)) {
    const k = attr.itemSize, src = attr.array, out = new src.constructor(nOut * k);
    for (let i = 0; i < nOut; i++) for (let c = 0; c < k; c++) out[i * k + c] = src[back[i] * k + c];
    geometry.setAttribute(name, new THREE.BufferAttribute(out, k, attr.normalized));
  }
  if (lod === 1 && g.morphAttributes.position) {
    geometry.morphAttributes.position = g.morphAttributes.position.map(m => { const out = new Float32Array(nOut * 3); for (let i = 0; i < nOut; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = m.array[back[i] * 3 + c]; return new THREE.BufferAttribute(out, 3); });
    geometry.morphTargetsRelative = true;
  }
  geometry.setIndex(new THREE.BufferAttribute(d.indices, 1));
  geometry.computeBoundingSphere();
  return { ...hero, geometry, eyes: lod === 1 ? hero.eyes : null, ms: Math.round(performance.now() - t0), derived: true };
}

const DIRECT_LOD = new Set(globalThis.CHIBI3_DIRECT_LOD || []);
/** A template from a baked file (bake.js): the geometry is read, the light parts rebuilt. */
function fromBaked(buf, a, lod) {
  const { geometry, header } = readBaked(buf);
  const R = layoutRig(a);
  const eyes = lod < 2 && header.body?.eyes ? buildEyes(R, header.body, a) : null;
  return { R, a, lod, geometry, eyes, outfit: { hold: header.hold, families: header.families }, body: header.body, ms: 0, baked: true, timings: header.timings, tris: header.tris };
}
const keyOf = (a, lod) => JSON.stringify(a) + '|' + lod;
const cacheKey = (a, lod) => 'v' + BAKE_VERSION + ':' + hashKey(keyOf(a, lod));

/**
 * Register a baked look so creating that avatar is instant. `files` is [lod0, lod1, lod2] as
 * ArrayBuffers or URLs (any may be missing; missing levels are derived).
 */
export async function registerBaked(avatar, files) {
  const a = normalizeForChibi3(avatar);
  for (let lod = 0; lod < files.length; lod++) {
    let f = files[lod]; if (!f) continue;
    if (typeof f === 'string') {
      const r = await fetch(f); if (!r.ok) continue;
      f = f.endsWith('.gz') ? await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : await r.arrayBuffer();
    }
    const key = keyOf(a, lod);
    if (!templates.has(key)) { const t = fromBaked(f, a, lod); t.refs = 0; t.key = key; templates.set(key, t); }
  }
}

/** Bake a look (all three levels) to ArrayBuffers — the tool and the builder's "export" use it. */
export function bakeLook(avatar) {
  const a = normalizeForChibi3(avatar);
  return [0, 1, 2].map(lod => { const t = acquire(a, lod); const buf = bakeTemplate(t); release(t); return buf; });
}

/**
 * Make sure the templates for `levels` exist: memory, then the browser cache, then a live build
 * (whose result is stored in the cache for next time). Live builds are what take seconds.
 */
async function ensure(a, levels, useCache) {
  for (const lod of levels) {
    const key = keyOf(a, lod);
    if (templates.has(key)) continue;
    if (useCache) {
      const buf = await cacheGet(cacheKey(a, lod));
      if (buf) { try { const t = fromBaked(buf, a, lod); t.refs = 0; t.key = key; t.cached = true; templates.set(key, t); continue; } catch { /* stale: rebuild */ } }
    }
    const t = acquire(a, lod); t.refs--;
    if (useCache) cachePut(cacheKey(a, lod), bakeTemplate(t));
  }
}

function acquire(a, lod) {
  const key = keyOf(a, lod);
  let t = templates.get(key);
  if (!t) {
    const direct = lod === 0 || DIRECT_LOD.has(lod);
    t = direct ? buildTemplate(a, lod) : deriveLod(acquire(a, 0), lod);
    t.refs = 0; t.key = key; templates.set(key, t);
    if (!direct) templates.get(JSON.stringify(a) + '|0').refs--;   // the derived level does not hold the hero
  }
  t.refs++;
  return t;
}
function release(t) {
  if (--t.refs > 0) return;
  t.geometry.dispose(); if (!t.derived) t.eyes?.geometry.dispose();
  templates.delete(t.key);
}

/** Build the THREE skeleton for a layout (each character gets its own). */
function makeSkeleton(R) {
  const bones = R.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
  R.bones.forEach((b, i) => {
    const bone = bones[i], parent = b.parent ? R.byName[b.parent] : null;
    const pp = parent ? parent.pos : [0, 0, 0];
    bone.position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
    if (b.rot) bone.rotation.set(...b.rot);
    if (parent) bones[parent.index].add(bone);
  });
  // a rotated bone's children are laid out in world offsets; undo its rotation for them (only the grip, a leaf)
  bones[0].updateMatrixWorld(true);
  return { root: bones[0], bones, byName: Object.fromEntries(bones.map(b => [b.name, b])) };
}

const sharedMaterials = { body: null, low: null };
function bodyMaterial(lod) {
  if (lod === 2) return sharedMaterials.low ||= characterMaterial({ detail: false });
  return sharedMaterials.body ||= characterMaterial({ detail: true });
}

/**
 * Create a character. Options:
 *   lod     0 | 1 | 2 | 'auto' (all three, switched by camera distance)
 *   anims   restrict the clip set (default: all)
 */
export async function createChibi3Character(avatar, opts = {}) {
  const group = new THREE.Group(); group.userData.character = true; group.name = 'chibi3';
  let state = null, disposed = false;
  const levels = opts.lod === 'auto' || opts.lod == null ? [0, 1, 2] : [opts.lod];
  async function install(av) {
    const a = normalizeForChibi3(av);
    await ensure(a, levels, opts.cache !== false && typeof indexedDB !== 'undefined');
    if (disposed) return;
    const temps = levels.map(l => acquire(a, l));
    const R = temps[0].R, sk = makeSkeleton(R);
    const skeleton = new THREE.Skeleton(sk.bones);
    const root = new THREE.Group(); root.name = 'chibi3-body'; root.add(sk.root);
    const lodObj = new THREE.LOD(); lodObj.autoUpdate = true; root.add(lodObj);
    const meshes = [];
    temps.forEach((t, i) => {
      const lvl = new THREE.Group();
      const mesh = new THREE.SkinnedMesh(t.geometry, bodyMaterial(levels[i]));
      mesh.name = 'chibi3-lod' + levels[i]; mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      lvl.add(mesh); mesh.bind(skeleton, new THREE.Matrix4()); meshes.push(mesh);
      if (t.eyes) { const em = new THREE.SkinnedMesh(t.eyes.geometry, t.eyes.material); em.frustumCulled = false; lvl.add(em); em.bind(skeleton, new THREE.Matrix4()); meshes.push(em); }
      lodObj.addLevel(lvl, LOD_DISTANCE[levels[i]] * Math.max(1, R.height / 1.8));
    });
    const animator = new Animator(R, sk, { hold: temps[0].outfit.hold, morphMeshes: meshes.filter(m => m.morphTargetInfluences), body: temps[0].body });
    const next = { a, temps, R, sk, skeleton, root, lodObj, meshes, animator };
    if (state) { group.remove(state.root); state.temps.forEach(release); state.skeleton.dispose(); }
    state = next; group.add(root);
    group.userData.fxHeight = R.height;
    animator.play(opts.initial || 'idle', { fade: 0 });
  }
  await install(avatar);
  let rate = 1;
  return {
    group,
    get anim() { return state.animator.current; },
    get parts() { return state.sk.byName; },
    get skeleton() { return state.skeleton; },
    get rig() { return state.R; },
    get animator() { return state.animator; },
    get avatar() { return state.a; },
    metrics() { return { totalHeight: state.R.height, height: state.R.height }; },
    stats() {
      const lod0 = state.temps[0];
      return { baked: !!lod0.baked, cached: !!lod0.cached, meshes: state.meshes.length, bones: state.R.bones.length, triangles: lod0.geometry.index.count / 3 + (lod0.eyes ? lod0.eyes.geometry.index.count / 3 : 0),
        lodTriangles: state.temps.map(t => t.geometry.index.count / 3), buildMs: state.temps.map(t => t.ms), timings: lod0.timings, layerTris: lod0.tris, morphs: Object.keys(lod0.geometry.morphAttributes.position ? MORPHS : {}).length };
    },
    setAnim(name, fade = 0.18) { state.animator.play(name, { fade }); },
    play(name, o) { state.animator.play(name, o); },
    setSpeed(v) { state.animator.setSpeed(v); },
    setExpression(name, w = 1) { state.animator.setExpression(name, w); },
    say(text) { state.animator.say(text); },
    lookAt(target) { state.animator.lookAt(target); },
    setGround(fn) { state.animator.setGround(fn); },
    setRate(k) { rate = Math.max(0.15, Math.min(3.5, Number(k) || 1)); },
    get rate() { return rate; },
    setHandsFree(v) { state.animator.handsFree = !!v; },
    async setAvatar(av) { if (!disposed) await install(av); },
    forceLod(level) { if (level == null) { state.lodObj.autoUpdate = true; return; } state.lodObj.autoUpdate = false; state.lodObj.levels.forEach((l, i) => { l.object.visible = levels[i] === level; }); },
    update(dt) { if (disposed) return; state.animator.update(Math.min(0.1, Math.max(0, dt)) * rate, group); },
    dispose() { if (disposed) return; disposed = true; group.remove(state.root); state.temps.forEach(release); state.skeleton.dispose(); },
  };
}

export function chibi3CacheStats() { return { templates: templates.size, references: [...templates.values()].reduce((n, t) => n + t.refs, 0) }; }
export { mixHex, sphere };
