// Kestrel (opus) — the character factory. CONTRACT.md §1–§2: the same actor shape as createChibi2Character.
//
//   import { createKestrelCharacter } from './kestrel.js';
//   const actor = await createKestrelCharacter(look, { anims, lod: 0 | 1 | 'auto', height });
//   scene.add(actor.group); actor.setAnim('walk'); actor.setExpression('happy'); … actor.update(dt);
//
// How it is put together (README.md has the long version): rig.js lays out a 64-bone skeleton from the look's body;
// body.js / face.js / hair.js / garments.js describe every piece as a parametric surface; geo.js samples them into ONE
// skinned geometry (garment-covered skin dropped), material.js shades it in one draw call; clips.js samples the clips;
// expressions.js drives the face. A template (geometry + clips) is cached per look and reference counted.
import * as THREE from 'three';
import { proportions, createRig } from './rig.js';
import { torsoPart, neckPart, armPart, legPart, handLayout, handParts, footParts } from './body.js';
import { faceLandmarks, headPart, faceParts, eyeMetrics } from './face.js';
import { hairParts, hairStyleFor, hairlineY } from './hair.js';
import { garmentIds, fitOf, coverOf, garmentParts } from './garments.js';
import { MeshBuilder, COVER } from './geo.js';
import { kestrelMaterial } from './material.js';
import { createClips, KESTREL_ANIMS, ONE_SHOTS } from './clips.js';
import { FaceDriver, EXPRESSIONS } from './expressions.js';
import { hexLin, cmul, cmix, clamp, smooth, gauss, adiff } from './kmath.js';

export { KESTREL_ANIMS, EXPRESSIONS };
export const KESTREL_INFO = { attempt: 'opus2', by: 'Claude Opus 5.5', version: '0.2.0' };

// ------------------------------------------------------------------------------------------------ look → settings
function normalize(look = {}) {
  const L = look || {};
  const body = L.body || {};
  const form = body.form === 'fem' || /^f/i.test(String(body.form || L.gender || '')) ? 'fem' : 'masc';
  const num = (v, d) => Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, 0, 1) : d;
  const hairId = L.hair?.id ?? (form === 'fem' ? 'high_ponytail' : 'spiky');
  const out = {
    form, height: num(body.height, 0.5), width: num(body.width, 0.5), skin: body.skin || (form === 'fem' ? '#dea67f' : '#dba27a'),
    hair: hairStyleFor(hairId), hairColor: L.hair?.color || '#3a2417',
    eyes: L.eyes?.color || '#4a2a16', brows: L.brows?.color || null, mouth: L.mouth?.color || (form === 'fem' ? '#c0716a' : '#b06a5e'),
    worn: garmentIds(L),
    colors: { shirt: L.top?.color || '#56708c', pants: L.bottom?.color || '#3e3a33', boots: L.shoes?.color || '#5b3b24' },
  };
  return out;
}
const keyOf = (n, lod) => JSON.stringify([n, lod]);

/** Richer colour: push away from grey (the review lighting is bright and washes pale skin out). */
function warm(c, sat) {
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [Math.max(0, L + (c[0] - L) * sat) * 1.02, Math.max(0, L + (c[1] - L) * sat), Math.max(0, L + (c[2] - L) * sat) * 0.96];
}
function palette(n) {
  const skin = cmul(warm(hexLin(n.skin), 1.4), 1.06), hair = cmul(warm(hexLin(n.hairColor), 1.3), 1.85);
  const lipBase = hexLin(n.mouth);
  return {
    skin, skinDark: cmix(cmul(skin, 0.62), [skin[0] * 0.6, skin[1] * 0.38, skin[2] * 0.32], 0.4),
    blush: [Math.min(1, skin[0] * 1.06), skin[1] * 0.74, skin[2] * 0.7],
    lip: cmix(skin, lipBase, n.form === 'fem' ? 0.8 : 0.7),
    mouth: hexLin('#5a2020'), teeth: hexLin('#efe9dc'), white: hexLin('#f4f1ec'), iris: hexLin(n.eyes),
    lash: hexLin('#1b110c'), brow: n.brows ? hexLin(n.brows) : cmul(hair, 0.62), hair, tie: hexLin('#2b2b30'),
    under: hexLin('#4a4c54'), underBand: hexLin('#868890'),
    shirt: hexLin(n.colors.shirt), pants: hexLin(n.colors.pants), boots: hexLin(n.colors.boots), sole: hexLin('#2a211b'),
  };
}

/** Body skin colour: warmer over knees, elbows and knuckles; nails lighter; palms and soles paler. */
function skinColor(colors, kind, part) {
  const { skin, blush } = colors;
  if (kind === 'torso') return (y, th, p) => {
    const a = Math.abs(th);
    let c = skin;
    c = cmix(c, blush, 0.18 * gauss(adiff(a, 0.45), 0.25) * gauss(y - part.nip, 0.012) * (part.fem ? 0 : 1));   // nipples
    c = cmul(c, 1 - 0.05 * smooth(1.3, 2.6, a));
    return c;
  };
  if (kind === 'arm') return (s, th) => cmix(skin, blush, 0.22 * gauss(s - part.sE, 0.03) * gauss(adiff(part.sg < 0 ? -th : th, Math.PI), 0.7));
  if (kind === 'leg') return (s, th) => cmix(skin, blush, 0.25 * gauss(s - part.sK, 0.035) * gauss(adiff(part.sg < 0 ? -th : th, 0), 0.8) + 0.1 * smooth(part.sA - 0.15, part.sA, s));
  if (kind === 'finger') return (u, th) => part.nail(u, th) ? cmix(skin, [1, 0.8, 0.76], 0.28) : cmix(skin, blush, 0.12 + 0.18 * smooth(0.55, 1, u / part.us[part.us.length - 1]));
  if (kind === 'palm') return (a, th) => Math.sin(th) < -0.2 ? cmix(skin, [1, 0.85, 0.75], 0.12) : skin;
  if (kind === 'foot') return (z, th, p) => p[1] < 0.006 ? cmix(skin, [1, 0.86, 0.78], 0.2) : cmix(skin, blush, 0.12);
  if (kind === 'toe') return (u, th) => part.nail(u, th) ? cmix(skin, [1, 0.8, 0.76], 0.28) : cmix(skin, blush, 0.15);
  return () => skin;
}

// ------------------------------------------------------------------------------------------------ template build
function lodSpec(spec, lod) {
  if (!lod) return spec;
  const us = spec.us, keep = [];
  const garment = !!spec.offset;
  const stride = garment && us.length < 14 ? 1 : us.length >= 5 ? 2 : 1;   // garments keep their rows: bands and cuffs are rows
  for (let i = 0; i < us.length; i++) if (i === 0 || i === us.length - 1 || i % stride === 0) keep.push(us[i]);
  const segs = spec.wrap === false ? Math.max(1, Math.round(spec.segs * 0.6)) : Math.max(3, Math.round(spec.segs * (garment ? 0.6 : 0.5)));
  // coarser garments sit a little further out, so the coarser skin under them cannot show between their facets
  const offset = spec.offset ? (u, t, p) => spec.offset(u, t, p) + 0.0045 : undefined;
  return { ...spec, us: keep, segs, ...(offset ? { offset } : {}) };
}

function layout(n) {
  const P = proportions({ form: n.form, height: n.height, width: n.width });
  const face = faceLandmarks(P);
  const hands = { L: handLayout(P, 'L'), R: handLayout(P, 'R') };
  return { P, face, hands };
}

let buildCount = 0;
function buildTemplate(n, lod, trace) {
  buildCount++;
  const t0 = now();
  const { P, face, hands } = layout(n);
  const rig = createRig(P, face, hands);
  const colors = palette(n);
  const MB = new MeshBuilder(rig.index);
  const torso = torsoPart(P);
  const parts = { torso, neck: neckPart(P, torso), armL: armPart(P, -1, torso), armR: armPart(P, 1, torso), legL: legPart(P, -1, footParts(P, -1), torso), legR: legPart(P, 1, footParts(P, 1), torso) };
  const fit = fitOf(P, parts);
  parts.torso.nip = 1.3 * P.k; parts.torso.fem = P.fem;
  const skip = globalThis.__kestrelSkip ? new RegExp(globalThis.__kestrelSkip) : null;
  const prof = globalThis.__kestrelProf;
  const add = (spec, extra = {}) => { if (skip && skip.test(spec.name)) return; const s = lodSpec({ ...spec, ...extra }, lod); const t = prof ? now() : 0; MB.surface(s); if (prof) { const k = s.name.replace(/[LR0-9]+$/, ''); prof[k] = (prof[k] || 0) + now() - t; } trace?.push(s.name); };
  // body
  const underPatch = p => parts.armL.patchHit(p) || parts.armR.patchHit(p);
  add(parts.torso, { color: skinColor(colors, 'torso', parts.torso), mask: (y, th, p) => coverOf('torso', y, th, fit) | (underPatch(p) ? COVER.PATCH : 0), ao: 1.25, aoScale: 0.016, rough: 0.6, shade: 0.4 });
  add(parts.neck, { color: () => colors.skin, mask: 0, ao: 0.7, aoScale: 0.012, rough: 0.6, shade: 0.4 });
  for (const s of ['L', 'R']) {
    const arm = parts['arm' + s], leg = parts['leg' + s];
    add(arm, { color: skinColor(colors, 'arm', arm), mask: (u, th) => coverOf('arm', u, th, fit), ao: 1.2, aoScale: 0.015, rough: 0.6, shade: 0.4 });
    add(leg, { color: skinColor(colors, 'leg', leg), mask: (u, th) => coverOf('leg', u, th, fit), ao: 1.2, aoScale: 0.015, rough: 0.6, shade: 0.4 });
    for (const hp of handParts(P, s, hands[s])) {
      if (lod && hp.name.startsWith('pinky')) { /* keep every finger: a mitten reads badly even far away */ }
      add(hp, { color: skinColor(colors, hp.name.startsWith('palm') ? 'palm' : 'finger', hp), ao: hp.name.startsWith('palm') ? 0.8 : 0.4, rough: 0.6, shade: 0.4 });   // v2: shaded like the arm (no lighter band at the wrist)
    }
    for (const fp of footParts(P, s === 'L' ? -1 : 1)) {
      if (lod && fp.name.startsWith('toe') && !fp.name.startsWith('toe0')) continue;
      add(fp, { color: skinColor(colors, fp.name.startsWith('foot') ? 'foot' : 'toe', fp), mask: COVER.BOOTS, ao: 0.6, rough: 0.6, shade: 0.4 });
    }
  }
  // head + face
  const hair = hairParts(P, null, colors, n.hair);
  const head = headPart(P, null, colors);
  add(head, { mask: (y, th) => (hair.scalp && y > hair.lineOf(th) + 0.012) ? COVER.SCALP : 0, shade: 0.42 });
  for (const fp of faceParts(P, null, colors, face)) {
    if (lod && /^(catch|lowLash|teeth)/.test(fp.name)) continue;
    add(fp);
  }
  for (const hp of hair.parts) add(hp);
  // garments
  const worn = n.worn;
  for (const g of garmentParts(P, parts, fit, worn, colors, lod)) add(g);
  let hide = COVER.BRIEFS | COVER.PATCH | (P.fem ? COVER.BRA : 0) | (hair.scalp ? COVER.SCALP : 0);
  if (worn.shirt) hide |= COVER.SHIRT;
  if (worn.pants) hide |= COVER.PANTS;
  if (worn.boots) hide |= COVER.BOOTS;
  const { geometry, triangles } = MB.finish(hide, { occlusion: globalThis.__kestrelNoAO ? 0 : 1 });
  // conservative bounds: covers raised arms, the jump and lying dead without scanning skinned vertices
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, P.T * 0.45, 0), P.T * 1.1);
  return { geometry, triangles, P, face, hands, buildMs: now() - t0, tally: MB.tally };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------------------------------------------ cache
const templates = new Map();          // key → { lods: {0, 1}, clips, refs, n, P, face, hands, material }
const clipCache = new Map();          // body key → clips
let sharedMaterial = null;
const material = () => (sharedMaterial ||= kestrelMaterial());

/** One clip for one body, sampled the first time anything asks for it (so a new look only pays for `idle` up front). */
function clipFor(n, rig, name) {
  const key = JSON.stringify([n.form, n.height, n.width, name]);
  let c = clipCache.get(key);
  if (!c) { c = createClips(rig, [name])[0]; clipCache.set(key, c); }
  return c;
}
function clipsFor(n, rig, anims) { return anims.map(a => clipFor(n, rig, a)); }

function getTemplate(n, lod, opts) {
  const key = keyOf(n, 0);
  let T = opts.trace ? null : templates.get(key);
  if (!T) {
    T = { key, n, lods: {}, refs: 0 };
    if (!opts.trace) templates.set(key, T);
  }
  for (const l of lod === 'auto' ? [0, 1] : [lod ? 1 : 0]) if (!T.lods[l]) T.lods[l] = buildTemplate(n, l, opts.trace);
  return T;
}

export function kestrelCacheStats() { return { templates: templates.size, references: [...templates.values()].reduce((s, t) => s + t.refs, 0) }; }

export async function prepareKestrel(look, opts = {}) {
  const n = normalize(look);
  const T = getTemplate(n, opts.lod ?? 0, opts);
  const { P, face, hands } = T.lods[0] || T.lods[1];
  clipsFor(n, createRig(P, face, hands), opts.anims || KESTREL_ANIMS);
  return true;
}

// ------------------------------------------------------------------------------------------------ the actor
export async function createKestrelCharacter(look, opts = {}) {
  const anims = (opts.anims || KESTREL_ANIMS).filter(a => KESTREL_ANIMS.includes(a));
  if (!anims.includes('idle')) anims.unshift('idle');
  const group = new THREE.Group(); group.userData.character = true; group.name = 'kestrel';
  let asset = null, action = null, anim = 'idle', disposed = false, handsFree = false, rate = 1, lodMode = opts.lod ?? 0, lodNow = lodMode === 'auto' ? 0 : (lodMode ? 1 : 0);
  let lastCam = null;
  const twist = { yaw: 0, side: 0, fwd: 0, on: false, q: new THREE.Quaternion(), inv: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ') };

  function install(look) {
    const t0 = now();
    const n = normalize(look);
    const before = buildCount;
    const T = getTemplate(n, lodMode === 'auto' ? 'auto' : lodNow, opts);
    const built = buildCount - before;
    const L0 = T.lods[0] || T.lods[1];
    const rig = createRig(L0.P, L0.face, L0.hands);
    const playing = anims.includes(anim) ? anim : 'idle';
    const holder = new THREE.Group(); holder.name = 'kestrel-body';
    const scale = opts.height ? opts.height / L0.P.T : 1;
    holder.scale.setScalar(scale);
    holder.add(rig.root);
    rig.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(rig.bones);
    const meshes = {};
    for (const l of Object.keys(T.lods)) {
      const m = new THREE.SkinnedMesh(T.lods[l].geometry, material());
      m.name = 'kestrel-lod' + l; m.castShadow = true; m.frustumCulled = true;
      m.bind(skeleton, new THREE.Matrix4());
      m.onBeforeRender = (r, s, cam) => { lastCam = cam; };
      m.visible = +l === lodNow || (!T.lods[lodNow] && true);
      holder.add(m); meshes[l] = m;
    }
    const mixer = new THREE.AnimationMixer(rig.root);
    const actions = { idle: mixer.clipAction(clipFor(n, rig, 'idle')) };
    if (playing !== 'idle') actions[playing] = mixer.clipAction(clipFor(n, rig, playing));
    mixer.addEventListener('finished', e => { if (e.action === action && anim !== 'dead') play('idle'); });
    const faceDrv = new FaceDriver(rig, eyeMetrics(L0.P));
    if (asset) { faceDrv.setExpression(asset.face.name, asset.face.target[asset.face.name] || 1, 0.001); faceDrv.w = { ...faceDrv.target }; }
    const prev = asset;
    T.refs++;
    asset = { T, rig, holder, skeleton, meshes, mixer, actions, face: faceDrv, scale, buildMs: now() - t0, cached: built === 0, n };
    group.add(holder);
    if (prev) release(prev);
    group.userData.fxHeight = L0.P.T * scale;
    action = null; const keep = anim; anim = 'idle';
    play(prev ? keep : 'idle', 0);
    showLod(lodNow);
  }
  function release(a) {
    group.remove(a.holder); a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.rig.root); a.skeleton.dispose();
    if (--a.T.refs <= 0 && templates.get(a.T.key) === a.T && templates.size > 24) {
      for (const l of Object.values(a.T.lods)) l.geometry.dispose();
      templates.delete(a.T.key);
    }
  }
  function showLod(l) {
    if (!asset.T.lods[l]) { asset.T.lods[l] = buildTemplate(asset.n, l); const m = new THREE.SkinnedMesh(asset.T.lods[l].geometry, material()); m.name = 'kestrel-lod' + l; m.bind(asset.skeleton, new THREE.Matrix4()); m.onBeforeRender = (r, s, cam) => { lastCam = cam; }; asset.holder.add(m); asset.meshes[l] = m; }
    lodNow = l;
    for (const [k, m] of Object.entries(asset.meshes)) m.visible = +k === l;
  }
  function play(name, fade = 0.12, restart = false) {
    if (disposed) return;
    if (!anims.includes(name)) name = 'idle';
    if (!asset.actions[name]) asset.actions[name] = asset.mixer.clipAction(clipFor(asset.n, asset.rig, name));
    const next = asset.actions[name];
    const one = ONE_SHOTS.has(name);
    if (next === action && !one) return;
    if (next === action && one && !restart && next.isRunning()) return;
    const previous = action;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(one ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = one; next.play();
    if (previous && previous !== next && fade > 0) { previous.fadeOut(fade); next.fadeIn(fade); }
    else if (previous && previous !== next) previous.stop();
    anim = name; action = next;
  }
  install(look);

  const v = new THREE.Vector3(), cv = new THREE.Vector3();
  return {
    group,
    get anim() { return anim; },
    get parts() { return asset.rig.byName; },
    get skeleton() { return asset.skeleton; },
    get expression() { return asset.face.name; },
    get eyes() { const f = asset.face, E = f.eye; return { blink: f.k, gaze: [...f.g], looking: f.looking, limits: [E.limX, E.limY] }; },
    get hold() { return null; },
    get rate() { return rate; },
    get twist() { return { yaw: twist.yaw, side: twist.side, fwd: twist.fwd }; },
    get handsFree() { return handsFree; },
    get lod() { return lodNow; },
    metrics() { const h = asset.T.lods[0]?.P.T ?? asset.T.lods[1].P.T; return { totalHeight: h * asset.scale, height: h * asset.scale }; },
    stats() {
      const L = asset.T.lods[lodNow];
      return { meshes: 1, bones: asset.rig.bones.length, triangles: L.triangles, drawCalls: 1, textures: 0, buildMs: Math.round(asset.buildMs * 10) / 10, cacheHit: asset.cached, lod: lodNow, lodTriangles: Object.fromEntries(Object.entries(asset.T.lods).map(([k, l]) => [k, l.triangles])), pieces: L.tally };
    },
    setAnim: play,
    async setAvatar(look) { if (!disposed) install(look); },
    setRate(k) { rate = Math.max(0.15, Math.min(3.5, Number(k) || 1)); },
    setTwist(yaw = 0, side = 0, fwd = 0) { twist.yaw = +yaw || 0; twist.side = +side || 0; twist.fwd = +fwd || 0; },
    setExpression(name, weight = 1, fade = 0.2) { asset.face.setExpression(EXPRESSIONS.includes(name) ? name : 'neutral', weight, fade); },
    setLod(l) { lodMode = l === 'auto' ? 'auto' : (l ? 1 : 0); showLod(lodMode === 'auto' ? lodNow : lodMode); },
    update(dt) {
      if (disposed) return;
      const d = Math.min(0.1, Math.max(0, Number(dt) || 0));
      const B = asset.rig.byName, chest = B.chest;
      asset.mixer.update(d * rate);
      if (twist.yaw || twist.side || twist.fwd) { twist.q.setFromEuler(twist.e.set(twist.fwd, twist.yaw, twist.side)); chest.quaternion.multiply(twist.q); }
      asset.face.update(d, anim);
      asset.face.hair(d);
      for (const s of ['L', 'R']) B['grip' + s].scale.setScalar(handsFree ? 0.001 : 1);
      // LOD by how tall the character is on screen (one frame behind: the camera seen at the last render)
      if (lodMode === 'auto' && lastCam && lastCam.isPerspectiveCamera) {
        group.getWorldPosition(v); cv.setFromMatrixPosition(lastCam.matrixWorld);
        const dist = v.distanceTo(cv), h = this.metrics().height;
        const frac = h / (2 * dist * Math.tan(THREE.MathUtils.degToRad(lastCam.fov) / 2));
        const want = lodNow === 0 ? (frac < 0.16 ? 1 : 0) : (frac > 0.2 ? 0 : 1);
        if (want !== lodNow) showLod(want);
      }
    },
    setHandsFree(v) { handsFree = !!v; },
    lookAt(point, { head = 0.35 } = {}) {
      const f = asset.face;
      f.look = point ? (point.isVector3 ? point.clone() : new THREE.Vector3(point.x ?? point[0], point.y ?? point[1], point.z ?? point[2])) : null;
      f.headK = clamp(head, 0, 1);
    },
    setGaze(x, y = 0) { asset.face.manual = x == null ? null : [clamp(+x || 0, -1, 1), clamp(+y || 0, -1, 1)]; },
    blink() { asset.face.blink(); },
    setBlink(k) { asset.face.hold = k == null ? null : +k; },
    dispose() { if (disposed) return; disposed = true; release(asset); },
  };
}
