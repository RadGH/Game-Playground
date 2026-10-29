// Kestrel — attempt "fable" (hand-coded by Claude Fable 5.1). CONTRACT.md §1: the module a game imports.
//
//   import { createKestrelCharacter, KESTREL_ANIMS } from '.../avatar-3d/kestrel/fable/js/kestrel.js';
//   const actor = await createKestrelCharacter(look);  scene.add(actor.group);  actor.update(dt) each frame.
//
// A look builds a TEMPLATE (one merged skinned geometry, one material, the clips) that is cached by its normalised
// JSON and reference-counted; actors share it and own only a skeleton, a mixer and a face driver. Everything is
// built from code: superellipse lofts over key profiles for the body (body.js), a sculpted skull with modelled
// features (head.js), spike-clump hair (hair.js), garments as the body's own profile grown outward (garments.js),
// sampled clips (motion.js), blink / gaze / expressions on bones (face.js). One draw call, no textures.
import * as THREE from 'three';
import { Builder, mirrorX, lerp, sstep } from './geometry.js';
import { dims, createRig } from './rig.js';
import { buildTorso, buildNeck, buildArm, buildHand, buildLeg, buildFoot } from './body.js';
import { buildHead, faceSpec, EXPRESSION_NAMES } from './head.js';
import { buildHair, hairIdFor } from './hair.js';
import { resolveOutfit, buildGarments, topIdFor, bottomIdFor, shoesIdFor } from './garments.js';
import { createClips, KESTREL_ANIMS, ONE_SHOTS } from './motion.js';
import { FaceDriver } from './face.js';

export { KESTREL_ANIMS };
export const KESTREL_INFO = { attempt: 'fable', by: 'Claude Fable 5.1', version: '0.1.0' };
export const KESTREL_EXPRESSIONS = EXPRESSION_NAMES;

// ---------------------------------------------------------------------------- normalising the look

/** The fields that change the build, in a stable order (the cache key). Unknown fields are ignored. */
export function normalizeLook(look = {}) {
  const b = look.body || {};
  const num = (v, d) => Number.isFinite(+v) ? Math.round(THREE.MathUtils.clamp(+v, 0, 1) * 100) / 100 : d;
  const col = (v, d) => { try { return '#' + new THREE.Color(v || d).getHexString(); } catch { return d; } };
  return {
    body: { form: b.form === 'fem' ? 'fem' : 'masc', height: num(b.height, 0.5), width: num(b.width, 0.5), skin: col(b.skin, b.form === 'fem' ? '#dea67f' : '#dba27a') },
    hair: { id: hairIdFor(look.hair?.id), color: col(look.hair?.color, '#3a2417') },
    eyes: { color: col(look.eyes?.color, '#4a2a16') },
    brows: { color: col(look.brows?.color, null) || null },
    mouth: { color: col(look.mouth?.color, b.form === 'fem' ? '#c0716a' : '#b06a5e') },
    top: { id: topIdFor(look.top?.id), color: col(look.top?.color, '#56708c') },
    bottom: { id: bottomIdFor(look.bottom?.id), color: col(look.bottom?.color, '#3e3a33') },
    shoes: { id: shoesIdFor(look.shoes?.id), color: col(look.shoes?.color, '#5b3b24') },
  };
}

// ---------------------------------------------------------------------------- the template

const templates = new Map();
const PREPARED_MAX = 12;

/** Build everything for a normalised look at `lod` (0 full, 1 far). */
function buildTemplate(look, lod, anims, trace = null) {
  const t0 = now();
  const detail = lod === 0;
  const d = dims(look), rig = createRig(d);
  const outfit = resolveOutfit(look), hides = outfit.hidesFor(d);
  const B = rig.byName, builder = new Builder(rig.index);
  const note = (what) => { if (trace) trace.push(what); };
  const M = (name) => B[name].matrixWorld;
  // body
  const skin = d.skin;
  builder.add(buildTorso(rig, detail, hides.torso), { color: skin, colorAt: skinPaint(d) }); note('torso');
  builder.add(buildNeck(rig, detail), { color: skin }); note('neck');
  const armR = buildArm(rig, detail, hides.arm), armL = mirrorX(armR);
  builder.add(armR, { matrix: M('armR'), color: skin }); builder.add(armL, { matrix: M('armL'), color: skin }); note('arms');
  for (const p of buildHand(rig, detail)) {
    const bone = p.tag === 'palmR' || p.tag === 'mittR' ? 'handR' : p.tag.startsWith('thm') ? 'thm1R' : p.tag.slice(0, 3) + '1R';
    builder.add(mirrorX(p), { matrix: M(bone.slice(0, -1) + 'L'), color: skin });
    builder.add(p, { matrix: M(bone), color: skin });
  }
  note('hands');
  const legR = buildLeg(rig, detail, hides.leg), legL = mirrorX(legR);
  builder.add(legR, { matrix: M('legR'), color: skin }); builder.add(legL, { matrix: M('legL'), color: skin }); note('legs');
  for (const p of buildFoot(rig, detail, hides.foot)) { builder.add(mirrorX(p), { matrix: M('footL'), color: skin }); builder.add(p, { matrix: M('footR'), color: skin }); }
  note('feet');
  // head and hair: head.js places the face bones, so the skeleton is bound after it
  for (const p of buildHead(rig, look, detail)) builder.add(p, { matrix: M('head') });
  note('head');
  for (const p of buildHair(rig, look, detail)) builder.add(p, { matrix: M('head') });
  note('hair');
  // garments
  const g = buildGarments(rig, outfit, detail);
  for (const p of g.world) builder.add(p);
  for (const p of g.armR) { builder.add(mirrorX(p), { matrix: M('armL') }); builder.add(p, { matrix: M('armR') }); }
  for (const p of g.legR) { builder.add(mirrorX(p), { matrix: M('legL') }); builder.add(p, { matrix: M('legR') }); }
  for (const p of g.footR) { builder.add(mirrorX(p), { matrix: M('footL') }); builder.add(p, { matrix: M('footR') }); }
  note('garments');
  // everything is colour-per-vertex; the paint goes through the same mild grade Chibi 2.5 uses (a little richer)
  const geometry = builder.finish();
  grade(geometry.attributes.color);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0, side: THREE.DoubleSide });
  material.envMapIntensity = 0.5;
  // face runtime limits (pupil room inside the white)
  const F = faceSpec(d);
  rig.face = { limX: F.eyeW * (1 - F.irisR * F.eyeH * 0.95) * 0.8, limY: F.eyeW * F.eyeH * (1 - F.irisR) * 0.8 };
  const clips = createClips(rig, anims);
  const bones = rig.bones.length;
  return { geometry, material, rig, clips, refs: 0, anims, lod, buildMs: now() - t0, triangles: geometry.index.count / 3, bones };
}
/**
 * Skin paint on the torso (vertex colour): the grooves a painter would put in — sternum, the line under the pecs,
 * the linea alba and the ab rows, the V-lines into the hips, the spine, the shoulder blades, the lower-back dimples —
 * plus a soft armpit shadow. Lighting on a smooth low-poly body is flat; this is what makes the muscles read on a
 * phone. Amounts are small so it reads as shading, not dirt.
 */
function skinPaint(d) {
  const base = new THREE.Color(d.skin), c = new THREE.Color(), f = d.fem, soft = f ? 0.6 : 1;
  const g = (v, w) => Math.exp(-(v * v) / (2 * w * w));
  const box = (v, a, b, w = 0.015) => sstep(v, a - w, a + w) * (1 - sstep(v, b - w, b + w));
  const pecY = d.chestY + (f ? -0.012 : 0.005), abTop = d.underBust - 0.015, abGap = (d.underBust - d.waistY) * 0.75;
  const segDist = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy))); return Math.hypot(px - ax - vx * t, py - ay - vy * t); };
  return (x, y, z) => {
    const ax = Math.abs(x);
    let k = 1;
    k -= 0.08 * g(ax - d.shoulderX * 0.85, 0.03) * g(y - d.chestY - 0.06, 0.04);                       // armpit
    if (z > 0) {
      k -= 0.08 * soft * g(x, 0.007) * box(y, d.underBust + 0.005, pecY + 0.045);                     // sternum
      if (!f) k -= 0.07 * g(y - (pecY - 0.052 - 0.012 * (ax / 0.1) ** 2), 0.008) * box(ax, 0.015, d.chestRX * 0.62);   // under the pecs
      k -= 0.06 * soft * g(x, 0.006) * box(y, d.waistY - 0.03, d.underBust);                          // linea alba
      for (let r = 0; r < 2; r++) k -= 0.05 * soft * g(y - (abTop - r * abGap - abGap * 0.5), 0.007) * box(ax, 0, 0.05, 0.02);   // ab rows
      k -= 0.05 * soft * (1 - sstep(segDist(ax, y, d.hipRX * 0.5, d.waistY - 0.01, 0.02, d.crotch + 0.07), 0.004, 0.014));    // V-lines
      k += 0.04 * (g(ax - 0.065, 0.035) * g(y - pecY - 0.015, 0.03)) * (f ? 0.8 : 1);                  // pec tops catch the light
    } else {
      k -= 0.07 * soft * g(x, 0.009) * box(y, d.hipY + 0.01, d.chestY + 0.09);                        // spine
      k -= 0.045 * soft * g(ax - 0.045, 0.012) * box(y, d.chestY + 0.0, d.chestY + 0.1);                // blade edges
      k -= 0.05 * g(ax - 0.04, 0.018) * g(y - d.hipY - 0.03, 0.018);                                  // dimples
      k -= 0.04 * soft * g(y - d.underBust + 0.01, 0.012) * box(ax, 0.03, 0.12);                       // under the lats
    }
    if (Math.abs(k - 1) < 0.004) return null;
    c.copy(base).multiplyScalar(k); return '#' + c.getHexString();
  };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function grade(attr) {
  const a = attr.array, SAT = 1.08;
  for (let i = 0; i < a.length; i += 3) {
    const L = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    for (let k = 0; k < 3; k++) a[i + k] = Math.min(1, Math.max(0, L + (a[i + k] - L) * SAT));
  }
  attr.needsUpdate = true;
}

const keyOf = (n, lod, anims) => JSON.stringify(n) + '|' + lod + '|' + anims.join(',');

function acquire(look, lod, anims, opts = {}) {
  const n = normalizeLook(look), key = keyOf(n, lod, anims);
  let template = opts.trace ? null : templates.get(key);
  if (!template) {
    template = buildTemplate(n, lod, anims, opts.trace || null);
    if (!opts.trace) templates.set(key, template);
  }
  template.prepared = false; template.refs++;
  // every actor gets its own bone tree (cloned from the template's rig) and skeleton
  const rig = cloneRig(template.rig);
  const skeleton = new THREE.Skeleton(rig.bones);                        // inverses from the bind-pose world matrices
  const mesh = new THREE.SkinnedMesh(template.geometry, template.material);
  mesh.name = 'kestrel-body'; mesh.castShadow = true; mesh.frustumCulled = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, rig.height * 0.5, 0), rig.height * 0.9);
  mesh.bind(skeleton, new THREE.Matrix4());
  const root = new THREE.Group(); root.name = 'kestrel-' + lod; root.add(rig.root); root.add(mesh);
  const mixer = new THREE.AnimationMixer(root);
  const actions = Object.fromEntries(template.clips.map(c => [c.name, mixer.clipAction(c)]));
  return { root, mesh, rig, skeleton, mixer, actions, template, key, release() {
    mixer.stopAllAction(); mixer.uncacheRoot(root); skeleton.dispose();
    if (--template.refs === 0 && !template.prepared) { template.geometry.dispose(); template.material.dispose(); if (templates.get(key) === template) templates.delete(key); }
  } };
}

/** A fresh bone tree with the template rig's bind pose (bones carry `userData.rest` for the face driver). */
function cloneRig(src) {
  const bones = [], byName = {}, index = {};
  for (const b of src.bones) {
    const c = new THREE.Bone(); c.name = b.name; c.position.copy(b.position); c.quaternion.copy(b.quaternion); c.scale.copy(b.scale);
    c.userData.rest = { p: b.position.clone(), q: b.quaternion.clone() };
    index[b.name] = bones.length; bones.push(c); byName[b.name] = c;
  }
  for (const b of src.bones) if (b.parent && b.parent.isBone) byName[b.parent.name].add(byName[b.name]);
  byName.root.updateMatrixWorld(true);
  return { root: byName.root, bones, byName, index, d: src.d, height: src.height, face: src.face, fs: src.fs };
}

// ---------------------------------------------------------------------------- the API

/** Bake a look ahead of time (both LODs if `opts.lod === 'auto'`); resolves when it is cached. */
export async function prepareKestrel(look, opts = {}) {
  const anims = opts.anims || KESTREL_ANIMS, lods = opts.lod === 'auto' ? [0, 1] : [opts.lod === 1 ? 1 : 0];
  for (const lod of lods) {
    const n = normalizeLook(look), key = keyOf(n, lod, anims);
    if (templates.has(key)) continue;
    const t = buildTemplate(n, lod, anims); t.prepared = true;
    const idle = [...templates.entries()].filter(([, x]) => x.refs === 0 && x.prepared);
    for (let i = 0; i < idle.length - PREPARED_MAX; i++) { idle[i][1].geometry.dispose(); idle[i][1].material.dispose(); templates.delete(idle[i][0]); }
    templates.set(key, t);
    await new Promise(r => setTimeout(r, 0));
  }
  return true;
}
export function kestrelCacheStats() { return { templates: templates.size, references: [...templates.values()].reduce((n, t) => n + t.refs, 0) }; }

/**
 * The actor — the same shape as `createChibi2Character` (CONTRACT.md §2), plus `setExpression` and `setLod`.
 * `opts.height` scales the whole character to that many metres. `opts.lod`: 0, 1 or 'auto' (auto = 0 unless a
 * `opts.camera` is given, then the far version past `opts.lodDistance` metres, default 14).
 */
export async function createKestrelCharacter(look, opts = {}) {
  const anims = opts.anims || KESTREL_ANIMS;
  const group = new THREE.Group(); group.userData.character = true;
  let asset, action, anim = 'idle', disposed = false, handsFree = false, rate = 1, lod = opts.lod === 1 ? 1 : 0, current = look;
  const face = new FaceDriver();
  const twist = { yaw: 0, side: 0, fwd: 0, on: false, q: new THREE.Quaternion(), inv: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ') };
  const heightK = () => opts.height ? opts.height / asset.rig.height : 1;
  let expr = 'neutral', exprW = 1, exprFade = 0.2;
  function install(a, l) {
    const next = acquire(a, l, anims, { trace: opts.trace || null });
    if (asset) { group.remove(asset.root); asset.release(); }
    asset = next; lod = l; group.add(asset.root); action = null;
    asset.root.scale.setScalar(heightK());
    asset.mixer.addEventListener('finished', e => { if (e.action === action && anim !== 'dead') play('idle'); });
    const keep = anim; anim = ''; play(keep === 'dead' ? 'dead' : keep || 'idle', 0, true);
    group.userData.fxHeight = asset.rig.height * heightK();
    face.setExpression(expr, exprW, 0.001);
  }
  function play(name, fade = 0.12, restart = false) {
    if (disposed) return;
    if (!anims.includes(name)) name = 'idle';
    const next = asset.actions[name];
    if (next === action && !ONE_SHOTS.has(name)) return;
    if (next === action && ONE_SHOTS.has(name) && !restart && next.isRunning()) return;
    const previous = action;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(ONE_SHOTS.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = ONE_SHOTS.has(name); next.play();
    if (previous && previous !== next) { previous.fadeOut(fade); next.fadeIn(fade); }
    anim = name; action = next;
  }
  install(look, lod);
  const tailSway = { a: 0, v: 0, t: 0 };
  const _v = new THREE.Vector3(), _last = new THREE.Vector3(), _e = new THREE.Euler();
  return {
    group,
    get anim() { return anim; },
    get parts() { return asset.rig.byName; },
    get skeleton() { return asset.skeleton; },
    metrics() { const h = asset.rig.height * heightK(); return { totalHeight: h, height: h }; },
    stats() { return { meshes: 1, bones: asset.rig.bones.length, triangles: asset.template.triangles, drawCalls: 1, textures: 0, buildMs: asset.template.buildMs, lod }; },
    setAnim: play,
    async setAvatar(a) { if (!disposed) { current = a; install(a, lod); } },
    setRate(k) { rate = THREE.MathUtils.clamp(Number(k) || 1, 0.15, 3.5); },
    get rate() { return rate; },
    setTwist(yaw = 0, side = 0, fwd = 0) { twist.yaw = +yaw || 0; twist.side = +side || 0; twist.fwd = +fwd || 0; },
    get twist() { return { yaw: twist.yaw, side: twist.side, fwd: twist.fwd }; },
    update(dt) {
      if (disposed) return;
      const d = Math.min(0.1, Math.max(0, dt));
      const B = asset.rig.byName, chest = B.chest;
      if (twist.on) chest.quaternion.multiply(twist.inv);
      face.pre(asset.rig);
      asset.mixer.update(d * rate);
      twist.on = !!(twist.yaw || twist.side || twist.fwd);
      if (twist.on) { twist.q.setFromEuler(twist.e.set(twist.fwd, twist.yaw, twist.side)); twist.inv.copy(twist.q).invert(); chest.quaternion.multiply(twist.q); }
      face.update(asset.rig, d, anim);
      // ponytail: a damped swing driven by how fast the head is moving (world), plus a little life at rest
      const t1 = B.hairTail1, t2 = B.hairTail2;
      if (t1 && t2) {
        B.head.getWorldPosition(_v);
        const sp = _last.lengthSq() ? _v.distanceTo(_last) / Math.max(1e-3, d) : 0; _last.copy(_v);
        tailSway.t += d;
        const drive = Math.min(0.5, sp * 0.12) * Math.sin(tailSway.t * 9) + 0.03 * Math.sin(tailSway.t * 1.7);
        tailSway.v += ((drive - tailSway.a) * 60 - tailSway.v * 9) * d; tailSway.a += tailSway.v * d;
        t1.quaternion.copy(t1.userData.rest.q).multiply(new THREE.Quaternion().setFromEuler(_e.set(tailSway.a * 0.6, 0, tailSway.a * 0.3)));
        t2.quaternion.copy(t2.userData.rest.q).multiply(new THREE.Quaternion().setFromEuler(_e.set(tailSway.a * 0.9, 0, tailSway.a * 0.4)));
      }
      if (handsFree) for (const s of ['L', 'R']) B['grip' + s].scale.setScalar(0.001);
      if (opts.lod === 'auto' && opts.camera) {
        group.getWorldPosition(_v); const dist = _v.distanceTo(opts.camera.position), far = opts.lodDistance || 14;
        const want = dist > far * (lod === 1 ? 0.85 : 1) ? 1 : 0;
        if (want !== lod) install(current, want);
      }
    },
    setHandsFree(v) { handsFree = !!v; if (!v) for (const s of ['L', 'R']) asset.rig.byName['grip' + s].scale.setScalar(1); },
    get handsFree() { return handsFree; },
    lookAt(point, { head = 0.35 } = {}) { face.target = point ? (point.isVector3 ? point.clone() : new THREE.Vector3(...[].concat(point.x ?? point[0], point.y ?? point[1], point.z ?? point[2]))) : null; face.headK = THREE.MathUtils.clamp(head, 0, 1); },
    setGaze(x, y = 0) { face.manual = x == null ? null : [THREE.MathUtils.clamp(+x || 0, -1, 1), THREE.MathUtils.clamp(+y || 0, -1, 1)]; },
    blink() { face.blink(); },
    setBlink(k) { face.hold = k == null ? null : +k; },
    get eyes() { return { v25: true, blink: face.k, gaze: [...face.g], looking: face.looking, limits: [asset.rig.face.limX, asset.rig.face.limY] }; },
    setExpression(name, weight = 1, fade = 0.2) { expr = EXPRESSION_NAMES.includes(name) ? name : 'neutral'; exprW = weight; exprFade = fade; face.setExpression(expr, weight, fade); },
    get expression() { return expr; },
    setLod(n) { const want = n === 1 ? 1 : 0; if (want !== lod && !disposed) install(current, want); },
    get lod() { return lod; },
    get hold() { return null; },
    dispose() { if (disposed) return; disposed = true; group.remove(asset.root); asset.release(); },
  };
}
