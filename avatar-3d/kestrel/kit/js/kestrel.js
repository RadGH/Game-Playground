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
import { faceLandmarks, eyeMetrics } from './face.js';
import { hairStyleFor } from './hair.js';
// batch 2: every face part and hairstyle (face-catalog.js reads the look, face-build.js builds the head)
import { faceLook } from './face-catalog.js';
import { buildFace } from './face-build.js';
import { markSkin } from './face-marks.js';
import { garmentIds, fitOf, coverOf, garmentParts } from './garments.js';
import { MeshBuilder, COVER } from './geo.js';
import { kestrelMaterial } from './material.js';
import { createClips, KESTREL_ANIMS, ONE_SHOTS } from './clips.js';
import { FaceDriver, EXPRESSIONS } from './expressions.js';
// Thousandvale (batch 1): Chibi 2 looks — their gear on this body, their clips on this rig (README "Thousandvale")
import { buildGearGeometry, mergeInto, gearSubset, simplifyGear } from './gear-bridge.js';   // batch 4: simplifyGear
import { gameClip, retargetClip, chibiRigFor, chibiClipNames, isOneShot, retargetMap, gaitDistance } from './retarget.js';
import { TOOL_SCALE } from './hold-scale.js';
// batch 3: hats (hat-build.js — the hat, and what it does to the hair / ears / face under it)
import { hatLookOf, planHat, buildHat } from './hat-build.js';
import { hexLin, cmul, cmix, clamp, smooth, gauss, adiff } from './kmath.js';
// batch 4: clothing (clothes-catalog.js what each id covers, clothes.js the surfaces, skirt.js the skirt bones)
import { clothesLook, skirtOf, strideOf } from './clothes-catalog.js';
import { planClothes } from './clothes.js';
import { driveSkirtClip, legsOf } from './skirt.js';
// batch 5: cape bones (a long cape folds back over the seat in seated clips)
import { driveSeatClip, seatSampleOf, CAPE_DRIVEN } from './cape.js';
import { TOP_STYLES, BOTTOM_STYLES, SHOE_STYLES } from '../../../js/chibi2-body.js';
const CHIBI_STYLES = { top: TOP_STYLES, bottom: BOTTOM_STYLES, shoes: SHOE_STYLES };

export { KESTREL_ANIMS, EXPRESSIONS };
export const KESTREL_INFO = { attempt: 'kit', by: 'Claude Opus 5.5', version: '1.0.0-dev' };

// ------------------------------------------------------------------------------------------------ look → settings
function normalize(look = {}) {
  let L = look || {};
  // batch 3: a Chibi look under a hat keeps its own hair, cut to the hat (from-chibi.js swaps it for 'short' for the stand-in)
  if (L.chibi?.look?.hat?.id && L.chibi.look.hat.id !== 'none' && L.hair?.id === 'short' && L.chibi.look.hair?.id) L = { ...L, hair: { ...L.hair, id: L.chibi.look.hair.id } };
  const body = L.body || {};
  const form = body.form === 'fem' || /^f/i.test(String(body.form || L.gender || '')) ? 'fem' : 'masc';
  const num = (v, d) => Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, 0, 1) : d;
  const hairId = L.hair?.id ?? (form === 'fem' ? 'high_ponytail' : 'spiky');
  const out = {
    form, height: num(body.height, 0.5), width: num(body.width, 0.5), skin: body.skin || (form === 'fem' ? '#dea67f' : '#dba27a'),
    hair: hairStyleFor(hairId), hairColor: L.hair?.color || '#3a2417',
    eyes: L.eyes?.color || '#4a2a16', brows: L.brows?.color || null, mouth: L.mouth?.color || (form === 'fem' ? '#c0716a' : '#b06a5e'),
    worn: garmentIds(L), face: faceLook(L),   // batch 2: face
    colors: { shirt: L.top?.color || '#56708c', pants: L.bottom?.color || '#3e3a33', boots: L.shoes?.color || '#5b3b24' },
  };
  { const ms = markSkin(out.face.marks.id, out.skin); if (ms) out.skin = ms; }   // batch 2: undead / pale skin
  // batch 4: the clothes (rows ride along off the key); `worn` keeps the old flags for face-acc's neck pieces
  out.clothes = clothesLook(L, CHIBI_STYLES);
  out.worn = { shirt: out.clothes.top && !out.clothes.top.row.bare ? 'shirt' : null, pants: out.clothes.bottom ? 'pants' : null, boots: out.clothes.shoes && !['sandal', 'bare'].includes(out.clothes.shoes.row.foot) ? 'boots' : null };
  out.skirtKey = skirtOf(out.clothes) ? ['top', 'bottom', 'shoes'].map(k => out.clothes[k]?.id || '-').join('|') : 0;
  out.hat = hatLookOf(L);   // batch 3: the hat (look.hat, or the Chibi look's) — null for none
  if (L.mannequin) out.mannequin = true;   // batch 5: a shop dummy (Thousandvale's gear icons): one colour, a carved face
  if (body.grade && typeof body.grade === 'object') out.grade = { skin: +body.grade.skin || 1.4, skinLift: +body.grade.skinLift || 1.06, hair: +body.grade.hair || 1.3, hairLift: +body.grade.hairLift || 1.85 };
  // race proportions (from-chibi.js raceK): girth, head and hand size here, overall height as the holder's scale
  const rk = body.raceK;
  if (rk && typeof rk === 'object') out.raceK = { scale: +rk.scale || 1, girth: +rk.girth || 1, head: +rk.head || 1, hand: +rk.hand || 1 };
  // a look converted from Chibi 2 (from-chibi.js) carries the Chibi look it came from: its gear is built onto this body
  // (gear-bridge.js) and its clips are Chibi's, retargeted (retarget.js). The Chibi look itself is kept off the cache key
  // (gearKey / hold / chibiBody are on it).
  if (L.chibi?.look) {
    Object.defineProperty(out, 'chibi', { value: L.chibi, enumerable: false });
    out.gearKey = JSON.stringify(gearSubset(L.chibi.look));
    out.hold = L.chibi.hold || null;
    const cb = L.chibi.look.body || {};
    // what of the Chibi body its clips depend on: roundness (arm spread) and race (posture); its height and width only
    // move the hips, and the retarget rescales those by the leg ratio — so they are left out and similar looks share clips
    out.chibiBody = [Math.round((cb.round ?? 0) * 4) / 4, cb.race || 'human'];
    // batch 5: a cape that hangs below the waist gets two cape bones (no skirt) — and its seated clips are its own
    const capeId = L.chibi.look.cape?.id;
    if (capeId && longCape(capeId)) out.capeKey = capeId;
  }
  return out;
}
const keyOf = (n, lod) => JSON.stringify([n, lod]);
/** batch 5: a cape-slot id that hangs below the waist (not a capelet, mantle, shawl, scarf or pack). */
const SHORT_CAPES = /^(none|shoulder_cape|fur_mantle|feather_mantle|shawl|scarf.*|neckerchief|g5_pack_.*)$/;
export const longCape = id => !!id && !SHORT_CAPES.test(String(id));

/** Richer colour: push away from grey (the review lighting is bright and washes pale skin out). */
function warm(c, sat) {
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [Math.max(0, L + (c[0] - L) * sat) * 1.02, Math.max(0, L + (c[1] - L) * sat), Math.max(0, L + (c[2] - L) * sat) * 0.96];
}
function palette(n) {
  // the review page's grade by default; a game passes its own (`body.grade`: Thousandvale's colours are already rich)
  const G = n.grade || { skin: 1.4, skinLift: 1.06, hair: 1.3, hairLift: 1.85 };
  const skin = cmul(warm(hexLin(n.skin), G.skin), G.skinLift), hair = cmul(warm(hexLin(n.hairColor), G.hair), G.hairLift);
  const lipBase = hexLin(n.mouth);
  // batch 5: a mannequin is all one colour — the face keeps its carved shape (nose, lips, brow ridge, ears) but no paint
  if (n.mannequin) {
    const c = skin;
    return { skin: c, skinDark: cmul(c, 0.82), blush: c, lip: c, mouth: cmul(c, 0.7), teeth: c, white: c, iris: c, lash: c, brow: c, hair: c, tie: c,
      under: c, underBand: c, shirt: hexLin(n.colors.shirt), pants: hexLin(n.colors.pants), boots: hexLin(n.colors.boots), sole: cmul(c, 0.8) };
  }
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
  const thin = !!spec.lodThin;   // batch 4: small pieces (shoes, greaves, cuffs, caps, gloves) thin out like the body
  const stride = garment && us.length < 14 && !thin ? 1 : us.length >= 5 ? 2 : 1;   // garments keep their rows: bands and cuffs are rows
  for (let i = 0; i < us.length; i++) if (i === 0 || i === us.length - 1 || i % stride === 0) keep.push(us[i]);
  const segs = spec.wrap === false ? Math.max(1, Math.round(spec.segs * 0.6)) : Math.max(3, Math.round(spec.segs * (garment && !thin ? 0.6 : 0.5)));
  // coarser garments sit a little further out, so the coarser skin under them cannot show between their facets
  const offset = spec.offset ? (u, t, p) => spec.offset(u, t, p) + 0.0045 : undefined;
  return { ...spec, us: keep, segs, ...(offset ? { offset } : {}) };
}

function layout(n) {
  const P = proportions({ form: n.form, height: n.height, width: n.width, raceK: n.raceK });
  P.face = n.face;   // batch 2: the face settings every face / hair builder reads
  P.skirtBones = !!skirtOf(n.clothes); P.stride = strideOf(n.clothes);   // batch 4: skirt bones (rig.js) and a robe's stride (clips.js)
  P.capeBones = !!n.capeKey && !P.skirtBones;   // batch 5: cape bones (rig.js, cape.js) for a long cape over no skirt
  const face = faceLandmarks(P);
  const hands = { L: handLayout(P, 'L'), R: handLayout(P, 'R') };
  return { P, face, hands };
}

let buildCount = 0;
/** The template, built in one go. */
function buildTemplate(n, lod, trace) {
  const it = templateSteps(n, lod, trace);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
/** …and as steps (Thousandvale: prepareKestrel gives the thread back between them — a new look is ~100-250 ms). */
function* templateSteps(n, lod, trace) {
  buildCount++;
  const t0 = now();
  const { P, face, hands } = layout(n);
  const rig = createRig(P, face, hands);
  const colors = palette(n);
  const MB = new MeshBuilder(rig.index);
  const torso = torsoPart(P);
  const parts = { torso, neck: neckPart(P, torso), armL: armPart(P, -1, torso), armR: armPart(P, 1, torso), legL: legPart(P, -1, footParts(P, -1), torso), legR: legPart(P, 1, footParts(P, 1), torso) };
  const fit = fitOf(P, parts);
  const tC = now(), CL = planClothes({ P, parts, fit, clothes: n.clothes, hands, lod });   // batch 4: the clothes, and what they cover
  fit.extra = CL.cover;
  P.skirtProfile = CL.skirt ? { ...CL.skirt, legs: legsOf(rig, parts, P, CL.legPads) } : null;
  if (globalThis.__kestrelProf) globalThis.__kestrelProf['(plan clothes)'] = now() - tC;   // batch 4: profiling (tools)
  parts.torso.nip = 1.3 * P.k; parts.torso.fem = P.fem;
  const skip = globalThis.__kestrelSkip ? new RegExp(globalThis.__kestrelSkip) : null;
  const prof = globalThis.__kestrelProf;
  const add = (spec, extra = {}) => { if (skip && skip.test(spec.name)) return; const s = lodSpec({ ...spec, ...extra }, lod); const t = prof ? now() : 0; MB.surface(s); if (prof) { const k = s.name.replace(/[LR0-9]+$/, ''); prof[k] = (prof[k] || 0) + now() - t; } trace?.push(s.name); };
  // body
  const underPatch = p => parts.armL.patchHit(p) || parts.armR.patchHit(p);
  add(parts.torso, { color: skinColor(colors, 'torso', parts.torso), mask: (y, th, p) => coverOf('torso', y, th, fit) | (underPatch(p) ? COVER.PATCH : 0), ao: 1.25, aoScale: 0.016, rough: 0.6, shade: 0.4 });
  const hatP = planHat(n.hat, n.face);   // batch 3
  add(parts.neck, { color: () => colors.skin, mask: hatP ? (y, th) => hatP.neckMask(y, th) : 0, ao: 0.7, aoScale: 0.012, rough: 0.6, shade: 0.4 });   // batch 3: neck under a mantle
  yield;
  for (const s of ['L', 'R']) {
    const arm = parts['arm' + s], leg = parts['leg' + s];
    add(arm, { color: skinColor(colors, 'arm', arm), mask: (u, th) => coverOf('arm', u, th, fit), ao: 1.2, aoScale: 0.015, rough: 0.6, shade: 0.4 });
    add(leg, { color: skinColor(colors, 'leg', leg), mask: (u, th) => coverOf('leg', u, th, fit), ao: 1.2, aoScale: 0.015, rough: 0.6, shade: 0.4 });
    for (const hp of handParts(P, s, hands[s])) {
      if (lod && hp.name.startsWith('pinky')) { /* keep every finger: a mitten reads badly even far away */ }
      add(hp, { mask: CL.handMask(hp.name), /* batch 4: under a glove */ color: skinColor(colors, hp.name.startsWith('palm') ? 'palm' : 'finger', hp), ao: hp.name.startsWith('palm') ? 0.8 : 0.4, rough: 0.6, shade: 0.4 });   // v2: shaded like the arm (no lighter band at the wrist)
    }
    for (const fp of footParts(P, s === 'L' ? -1 : 1)) {
      if (lod && fp.name.startsWith('toe') && !fp.name.startsWith('toe0')) continue;
      add(fp, { color: skinColor(colors, fp.name.startsWith('foot') ? 'foot' : 'toe', fp), mask: COVER.BOOTS, ao: 0.6, rough: 0.6, shade: 0.4 });
    }
    yield;
  }
  // head + face (batch 2: face-build.js — head, face parts, hair, beard, marks, accessory)
  const faceB = buildFace({ P, n, colors, lod, parts, add, hat: hatP });
  yield;
  // garments
  const worn = n.worn;
  for (const g of garmentParts(P, parts, fit, worn, colors, lod)) add(g);
  for (const g of CL.parts) add(g);   // batch 4: every top / bottom / shoe / glove
  yield;
  let hide = COVER.BRIEFS | COVER.PATCH | (P.fem ? COVER.BRA : 0) | faceB.hide;   // batch 2: scalp / ears / skin under beard or mask
  if (worn.shirt) hide |= COVER.SHIRT;
  if (worn.pants) hide |= COVER.PANTS;
  if (worn.boots) hide |= COVER.BOOTS;
  hide |= CL.hide;   // batch 4
  // Thousandvale: Chibi 2's held items, cape, pack, belt and hat, moved onto this body (merged below: still one draw call).
  // batch 4: built BEFORE the hat, so the hat can leave room for it at LOD 1 (and simplified, if need be, after)
  const tG = now();
  const gear = n.chibi && !skip ? buildGearGeometry({ chibi: hatP ? { ...n.chibi, look: { ...n.chibi.look, hat: { id: 'none' } } } : n.chibi, krig: rig, parts, P, worn: { ...worn, outer: CL.outer }, hairStyle: n.hair, cacheKey: n.chibi }) : null;   // batch 3: no stand-in hat; batch 4: on the outermost layer
  if (globalThis.__kestrelProf) globalThis.__kestrelProf['(gear)'] = now() - tG;   // batch 4: profiling (tools)
  const gearFloor = lod && gear ? Math.min(gear.triangles, Math.round(gear.triangles * 0.55) + 120) : 0;   // what clustering can bring it down to
  // batch 3: the hat, in the same mesh — last, so it can count everything else that will be drawn and fit the budget
  if (hatP) hide |= buildHat(hatP, { P, n, colors, lod, parts, add, MB, hair: faceB.hair, hide, ...(lod ? { budget: 3950 - gearFloor } : {}) }).hide;   // batch 4: at LOD 1 the hat leaves room for the gear
  const tF = now();
  let { geometry, triangles } = MB.finish(hide, { occlusion: globalThis.__kestrelNoAO ? 0 : 1 });
  if (globalThis.__kestrelProf) globalThis.__kestrelProf['(finish)'] = now() - tF;   // batch 4: profiling (tools)
  yield;
  let gearTris = 0;
  if (gear) {
    // batch 4: gear is simplified (vertex clustering) only as far as the outfit budget needs — LOD 0 ≤ 15,000, LOD 1 ≤ 4,000
    const room = (lod ? 3950 : 14900) - triangles;
    let g = gear.geometry, gt = gear.triangles;
    for (const cell of lod ? [0.012, 0.02, 0.03, 0.045, 0.07, 0.1, 0.14, 0.2] : [0.004, 0.007, 0.012, 0.02]) { if (gt <= room) break; const sg = simplifyGear(gear.geometry, cell); if (g !== gear.geometry) g.dispose(); g = sg.geometry; gt = sg.triangles; }
    const merged = mergeInto(geometry, g); geometry.dispose(); if (g !== gear.geometry) g.dispose(); gear.geometry.dispose(); geometry = merged; triangles += gt; gearTris = gt;
  }
  // conservative bounds: covers raised arms, the jump and lying dead without scanning skinned vertices
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, P.T * 0.45, 0), P.T * 1.1);
  return { geometry, triangles, gearTris, P, face, hands, buildMs: now() - t0, tally: MB.tally };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------------------------------------------ cache
const templates = new Map();          // key → { lods: {0, 1}, clips, refs, n, P, face, hands, material }
const clipCache = new Map();          // body key → clips
let sharedMaterial = null;
const material = () => (sharedMaterial ||= kestrelMaterial());

/** One clip for one body, sampled the first time anything asks for it (so a new look only pays for `idle` up front). */
const KIT_ONLY = new Set(['sprint', 'crouch', 'aim', 'interact']);      // names only the kit has (everything else: Chibi's)
const KIT_NAMES = new Set(KESTREL_ANIMS);
/** Does this look play Chibi 2's version of `name` (retargeted) rather than the kit's own? */
const viaChibi = (n, name) => !KIT_ONLY.has(name) && (!!n.chibi || !KIT_NAMES.has(name));
function clipFor(n, rig, name) {
  const chibi = viaChibi(n, name);
  // batch 5: + the cape bones (a rig with them keys two more bones; a seated clip drives them for this cape on this top)
  const capeK = rig.byName.capeA ? (CAPE_DRIVEN.has(name) ? [n.capeKey, n.clothes?.top?.id || '-'] : 1) : rig.byName.skirt0 && CAPE_DRIVEN.has(name) ? [n.capeKey || 0] : 0;
  const key = JSON.stringify([n.form, n.height, n.width, n.raceK || 0, chibi ? [n.hold, n.chibiBody, n.hold?.twoHand ? n.chibi?.look.held?.id : 0] : 0, name, n.skirtKey || 0, capeK]);   // batch 4: + the skirt
  let c = clipCache.get(key);
  if (!c) {
    if (chibi) {
      const crig = chibiRigFor(n.chibi ? { body: { height: 0.5, width: 0.5, round: n.chibiBody[0], race: n.chibiBody[1] }, race: n.chibi.race, hold: n.hold, heldId: n.chibi.look.held?.id, stride: rig.stride } : { stride: rig.stride });   // batch 4: stride
      c = n.chibi ? gameClip(rig, crig, name) : retargetClip(rig, crig, name);
    } else c = createClips(rig, [name])[0];
    if (rig.byName.skirt0 && rig.P.skirtProfile) c = driveSkirtClip(c, rig, rig.P.skirtProfile);   // batch 4: the skirt bones off the legs
    if (rig.seatSample && !globalThis.__kestrelNoSeatDrive) c = driveSeatClip(c, rig, rig.seatSample);       // batch 5: the cape / hem off the seat and the ground
    if (clipCache.size > 4000) clipCache.delete(clipCache.keys().next().value);
    clipCache.set(key, c);
  }
  return c;
}
function clipsFor(n, rig, anims) { return anims.map(a => clipFor(n, rig, a)); }
/** The rig for a template (batch 5: with the cape / skirt sample the seated clips are driven from). */
function rigOf(T) {
  const L0 = T.lods[0] || T.lods[1];
  const rig = createRig(L0.P, L0.face, L0.hands);
  if (rig.byName.capeA || rig.byName.skirt0) { if (L0.seatSample === undefined) L0.seatSample = seatSampleOf(L0.geometry, rig); rig.seatSample = L0.seatSample; }
  return rig;
}

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

/**
 * Build a look's template (and bake its clips) ahead of `createKestrelCharacter`. With `opts.slice` (a function returning
 * a promise: the caller's "give the thread back") the work is done in steps of about `opts.budget` ms (default 8) with a
 * slice between them, so a new look never holds the main thread in one long task (Thousandvale builds one per frame).
 */
const pendingBuilds = new Map();
/** batch 5: build LOD `l` of template T in steps of ~`budget` ms with `slice()` between them (shared by every caller). */
function buildLodSliced(T, l, slice, budget = 8) {
  if (T.lods[l]) return Promise.resolve();
  const pk = T.key + '|' + l;
  if (!pendingBuilds.has(pk)) pendingBuilds.set(pk, (async () => {
    let t0 = now();
    const it = templateSteps(T.n, l);
    for (;;) { const r = it.next(); if (r.done) { T.lods[l] ||= r.value; return; } if (now() - t0 >= budget) { await slice(); t0 = now(); } }
  })().finally(() => pendingBuilds.delete(pk)));
  return pendingBuilds.get(pk);
}
export async function prepareKestrel(look, opts = {}) {
  const n = normalize(look);
  if (!opts.slice) {
    const T = getTemplate(n, opts.lod ?? 0, opts);
    clipsFor(n, rigOf(T), opts.anims || KESTREL_ANIMS);
    return true;
  }
  const budget = opts.budget ?? 8;
  let t0 = now();
  const pause = async () => { if (now() - t0 >= budget) { await opts.slice(); t0 = now(); } };
  const key = keyOf(n, 0);
  let T = templates.get(key);
  if (!T) { T = { key, n, lods: {}, refs: 0 }; templates.set(key, T); }
  const lod = opts.lod ?? 0;
  for (const l of lod === 'auto' ? [0, 1] : [lod ? 1 : 0]) await buildLodSliced(T, l, opts.slice, budget);
  const rig = rigOf(T);
  for (const a of opts.anims || ['idle']) { clipFor(n, rig, a); await pause(); }
  return true;
}

// ------------------------------------------------------------------------------------------------ the actor
export async function createKestrelCharacter(look, opts = {}) {
  const CHIBI_NAMES = new Set(chibiClipNames());
  const anims = (opts.anims || KESTREL_ANIMS).filter(a => KESTREL_ANIMS.includes(a) || CHIBI_NAMES.has(a));
  if (!anims.includes('idle')) anims.unshift('idle');
  const group = new THREE.Group(); group.userData.character = true; group.name = 'kestrel';
  let asset = null, action = null, anim = 'idle', disposed = false, handsFree = false, rate = 1, lodMode = opts.lod ?? 0, lodNow = lodMode === 'auto' ? 0 : (lodMode ? 1 : 0);
  let lastCam = null, frozen = null, lodPending = null;
  const twist = { yaw: 0, side: 0, fwd: 0, on: false, q: new THREE.Quaternion(), inv: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ') };

  function install(look) {
    const t0 = now();
    const n = normalize(look);
    const before = buildCount;
    const T = getTemplate(n, lodMode === 'auto' ? 'auto' : lodNow, opts);
    const built = buildCount - before;
    const L0 = T.lods[0] || T.lods[1];
    const rig = rigOf(T);
    const playing = anims.includes(anim) ? anim : 'idle';
    const holder = new THREE.Group(); holder.name = 'kestrel-body';
    const scale = (opts.height ? opts.height / L0.P.T : 1) * (n.raceK?.scale || 1);
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
    // a Chibi look: the game hangs tools on handR and reads gripR's -Y as the blade, both in CHIBI hand space — so its
    // `parts` hand and grip are frames riding the bones with Chibi's axes (the bones themselves keep their names)
    let frames = null;
    if (n.chibi) {
      const M = retargetMap(rig), gC = new THREE.Vector3(0, -0.035, 0.055);
      frames = { ...rig.byName };
      for (const s of ['L', 'R']) {
        const hf = new THREE.Object3D(); hf.name = 'hand' + s + '-frame';
        hf.quaternion.copy(M.qB[s]); hf.scale.setScalar(TOOL_SCALE);
        hf.position.copy(rig.byName['grip' + s].userData.rest).sub(gC.clone().multiplyScalar(TOOL_SCALE).applyQuaternion(M.qB[s]));
        rig.byName['hand' + s].add(hf);
        const gf = new THREE.Object3D(); gf.name = 'grip' + s + '-frame'; gf.quaternion.copy(M.qB[s]);
        rig.byName['grip' + s].add(gf);
        frames['hand' + s] = hf; frames['grip' + s] = gf;
      }
    }
    const faceDrv = new FaceDriver(rig, eyeMetrics(L0.P));
    if (asset) { faceDrv.setExpression(asset.face.name, asset.face.target[asset.face.name] || 1, 0.001); faceDrv.w = { ...faceDrv.target }; }
    const prev = asset;
    T.refs++;
    asset = { T, rig, holder, skeleton, meshes, mixer, actions, face: faceDrv, scale, buildMs: now() - t0, cached: built === 0, n, frames };
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
    if (!asset.T.lods[l]) asset.T.lods[l] = buildTemplate(asset.n, l);
    // batch 5: a template another body already built this LOD for still needs a mesh of its own here
    if (!asset.meshes[l]) { const m = new THREE.SkinnedMesh(asset.T.lods[l].geometry, material()); m.name = 'kestrel-lod' + l; m.castShadow = true; m.bind(asset.skeleton, new THREE.Matrix4()); m.onBeforeRender = (r, s, cam) => { lastCam = cam; }; asset.holder.add(m); asset.meshes[l] = m; }
    lodNow = l;
    for (const [k, m] of Object.entries(asset.meshes)) m.visible = +k === l;
  }
  /**
   * batch 5: switch to LOD `l` without a hitch — if this look's template has no such LOD yet it is built in slices
   * (`slice()` between ~`budget` ms steps; the body keeps showing the LOD it has meanwhile). Resolves with the LOD shown.
   */
  async function wantLod(l, { slice = null, budget = 8 } = {}) {
    l = l ? 1 : 0;
    if (disposed) return lodNow;
    lodMode = l;
    if (asset.T.lods[l] || !slice) { if (lodNow !== l || !asset.meshes[l]) showLod(l); return lodNow; }
    const T = asset.T;
    lodPending = l;
    try { await buildLodSliced(T, l, slice, budget); } finally { if (lodPending === l) lodPending = null; }
    if (disposed || asset.T !== T || lodMode !== l) return lodNow;
    showLod(l);
    return lodNow;
  }
  function play(name, fade = 0.12, restart = false) {
    if (disposed) return;
    if (!anims.includes(name)) name = 'idle';
    if (!asset.actions[name]) asset.actions[name] = asset.mixer.clipAction(clipFor(asset.n, asset.rig, name));
    const next = asset.actions[name];
    const one = viaChibi(asset.n, name) ? isOneShot(name) : ONE_SHOTS.has(name);
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
    get parts() { return asset.frames || asset.rig.byName; },
    get skeleton() { return asset.skeleton; },
    get expression() { return asset.face.name; },
    get eyes() { const f = asset.face, E = f.eye; return { blink: f.k, gaze: [...f.g], looking: f.looking, limits: [E.limX, E.limY] }; },
    get hold() { return asset.n.hold || null; },
    get rate() { return rate; },
    get twist() { return { yaw: twist.yaw, side: twist.side, fwd: twist.fwd }; },
    get handsFree() { return handsFree; },
    get lod() { return lodNow; },
    /** batch 5 (tools, tests): the body's proportions (rig.js), at rig scale. */
    get proportions() { return (asset.T.lods[0] || asset.T.lods[1]).P; },
    /** batch 5: the LOD being built in the background (wantLod), or null. */
    get lodPending() { return lodPending; },
    metrics() { const h = asset.T.lods[0]?.P.T ?? asset.T.lods[1].P.T; return { totalHeight: h * asset.scale, height: h * asset.scale }; },
    stats() {
      const L = asset.T.lods[lodNow];
      return { meshes: 1, bones: asset.rig.bones.length, triangles: L.triangles, gearTriangles: L.gearTris || 0, drawCalls: 1, textures: 0, buildMs: Math.round(asset.buildMs * 10) / 10, cacheHit: asset.cached, lod: lodNow, lodTriangles: Object.fromEntries(Object.entries(asset.T.lods).map(([k, l]) => [k, l.triangles])), pieces: L.tally };
    },
    setAnim: play,
    /** Hold the current clip at `t` seconds (screenshots, tests); null lets it run again. */
    freeze(t) { frozen = t == null ? null : Math.max(0, +t || 0); },
    /** batch 4: the playing clip's length in seconds (tests sample clips through it). */
    clipDuration() { return action ? action.getClip().duration : 0; },
    /** batch 5: the playing clip's key times (tests sample exactly where it was baked). */
    clipTimes() { return action ? Array.from(action.getClip().tracks[0]?.times || []) : []; },
    /** How far one cycle of `walk` / `run` carries the body, in metres (a game sets the clip rate from its speed). */
    gaitDistance(name) { return gaitDistance(asset.rig, name) * asset.scale; },
    /** Portrait framing: the face's centre this far above the head bone, and the radius to frame (metres). */
    faceFrame() { const P = (asset.T.lods[0] || asset.T.lods[1]).P, s = asset.scale; return { up: (P.chinY + 0.11 * P.HS - P.headY) * s, r: 0.15 * P.HS * s }; },
    async setAvatar(look) { if (!disposed) install(look); },
    setRate(k) { rate = Math.max(0.15, Math.min(3.5, Number(k) || 1)); },
    setTwist(yaw = 0, side = 0, fwd = 0) { twist.yaw = +yaw || 0; twist.side = +side || 0; twist.fwd = +fwd || 0; },
    setExpression(name, weight = 1, fade = 0.2) { asset.face.setExpression(EXPRESSIONS.includes(name) ? name : 'neutral', weight, fade); },
    setLod(l) { lodMode = l === 'auto' ? 'auto' : (l ? 1 : 0); showLod(lodMode === 'auto' ? lodNow : lodMode); },
    wantLod,
    update(dt) {
      if (disposed) return;
      const d = Math.min(0.1, Math.max(0, Number(dt) || 0));
      const B = asset.rig.byName, chest = B.chest;
      if (frozen != null && action) { action.time = Math.min(frozen, action.getClip().duration); asset.mixer.update(0); }
      else asset.mixer.update(d * rate);
      if (twist.yaw || twist.side || twist.fwd) { twist.q.setFromEuler(twist.e.set(twist.fwd, twist.yaw, twist.side)); chest.quaternion.multiply(twist.q); }
      asset.face.update(d, anim);
      asset.face.hair(d);
      if (handsFree) for (const s of ['L', 'R']) B['grip' + s].scale.setScalar(0.001);   // (the clips key the grips' scale: hands-free clips)
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
