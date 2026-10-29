// Kestrel kit — Chibi 2's held items, capes, packs, belts, accessories and (for now) hats on a Kestrel body
// (Thousandvale batch 1, 2026-10-27).
//
// Chibi 2 builds ~70 weapons, foci, shields, quivers, capes, packs, satchels, belts and hats with builder functions that
// take a context `c` whose `add(geometry, boneName, colour, opts)` drops a piece into the template (chibi2-gear.js,
// chibi2-weapons.js, chibi2-gear5*.js, chibi2-backpacks.js, chibi2-hats.js, chibi2.js buildChibiHat). This file calls the
// SAME builders with its own `add`, which keeps every piece in Chibi 2's bind space, and then moves each vertex onto the
// Kestrel body by what it is attached to:
//
//   grip    (anything a hand holds) — into the Chibi GRIP frame, resized for a real hand (hold-scale.js), then turned
//           into the Kestrel hand by the same hand axes retarget.js uses, so the clip that aims the grip aims the item.
//   torso   (chest / hips pieces: capes, packs, straps, belts, pouches, a hood's mantle) — by SURFACE: each vertex's
//           height (on body landmarks), its angle round the torso and its distance OUT of Chibi's torso are kept, and it
//           is put that far out of KESTREL's torso (plus the shirt's thickness), so nothing that lay on Chibi's body
//           cuts through this one. Near the skin it takes the skin's own weights (it moves as the skin does); a cape's
//           tail also follows the thigh behind it a little, so a run does not drive the legs through it.
//   head    (hats, until batch 3) — Chibi's head box onto the Kestrel skull's box (non-uniform), with room for hair.
//   limb    (anything on an arm or a leg) — along the Kestrel segment, thinned to a real limb.
//
// The result is ONE geometry with the kit's attributes, merged into the body mesh: gear adds no draw call.
//
//   const gear = buildGearGeometry({ chibi, krig, parts, P, worn, hairStyle });   // null when the look holds nothing
import * as THREE from 'three';
import { createRig as createChibiRig, taperedCurve } from '../../../js/chibi2-geometry.js';
import { buildBody } from '../../../js/chibi2-body.js';
import { buildCape, buildDecor, buildHeld, buildOffhand } from '../../../js/chibi2-gear.js';
import { buildChibiHat } from '../../../js/chibi2.js';
import { HELD_WEAPON_IDS, offhandAllowed } from '../../../js/chibi2-weapon-ids.js';
import { isG5, G5_HELD, G5_OFFHAND } from '../../../js/chibi2-gear5-ids.js';
import { G5_WEAPON_BUILDERS, G5_HAT_BUILDERS, G5_PACK_BUILDERS, G5_OFFHAND_BUILDERS, G5_CAPE_BUILDERS, G5_DECOR_BUILDERS, G5_RING_BUILDERS } from '../../../js/chibi2-gear5.js';
import { retargetMap } from './retarget.js';
// batch 4: tier-2 armour kits and the class emblem on chest and back (the hat's brow emblem is hat-build.js's)
import { buildArmour2 } from '../../../js/chibi2-armour2.js';
import { itemRule, stretchPoint, stretchScale } from './hold-scale.js';
import { capeWeights } from './cape.js';   // batch 5
import { skirtWeights } from './skirt.js';   // batch 5

const sphere = () => new THREE.SphereGeometry(1, 10, 6);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const TRIM = '#d9b477', LEATHER = '#493c36', STEEL = '#c4d4d6', DARK_STEEL = '#536a73';

const COLLECTED = new WeakMap();      // batch 5: the Chibi look record (kestrel.js n.chibi) → its collected pieces
/** The gear-relevant part of a Chibi look (what makes two looks' gear the same — the template cache key uses it). */
export function gearSubset(a) {
  if (!a) return null;
  const pick = k => (a[k] && a[k].id && a[k].id !== 'none' ? a[k] : null);
  const out = {};
  for (const k of ['held', 'offhand', 'cape', 'decor', 'hat']) { const v = pick(k); if (v) out[k] = v; }
  // the accessory slot itself (glasses, masks, scarves, torcs) is the face's (kit/js/face-acc.js); only its rings are here
  const acc = a.accessory;
  if (acc && (acc.ring || acc.ring2)) out.accessory = { ring: acc.ring || null, ring2: acc.ring2 || null };
  return Object.keys(out).length ? out : null;
}

// --------------------------------------------------------------------------------------------- collecting Chibi pieces
class Collector {
  constructor(rig) { this.rig = rig; this.pieces = []; this.phase = 'gear'; this.skipHead = false; }
  add(geometry, boneName, color, { position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], metal = false, bend = null, skinTo = null, weigh = null, colorAt = null } = {}) {
    if (this.skipHead && boneName === 'head') return;
    const bone = this.rig.byName[boneName];
    if (!bone) return;
    const g = geometry.index ? geometry.toNonIndexed() : geometry;   // (kept simple: flat soup, re-indexed at the end)
    if (g !== geometry) geometry.dispose();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, count = p.count;
    const cols = new Float32Array(count * 3), c = new THREE.Color(color), c0 = c.clone();
    const wts = [];
    for (let i = 0; i < count; i++) {
      if (colorAt) { const v = colorAt(p.getX(i), p.getY(i), p.getZ(i), i); c.set(v == null ? c0 : v); }
      const tint = metal ? 1 : 0.94 + 0.06 * THREE.MathUtils.clamp(p.getY(i) + 0.5, 0, 1);
      cols.set([c.r * tint, c.g * tint, c.b * tint], i * 3);
      if (weigh) wts.push(weigh(p.getX(i), p.getY(i), p.getZ(i)).filter(([, w]) => w > 1e-4).slice(0, 4));
      else if (bend) { const m = THREE.MathUtils.smoothstep(-p.getY(i), bend.at - bend.width, bend.at + bend.width); wts.push([[skinTo || boneName, 1 - m], [bend.bone, m]]); }
      else wts.push([[skinTo || boneName, 1]]);
    }
    g.applyMatrix4(bone.matrixWorld);
    this.pieces.push({ g, cols, wts, metal, bone: boneName, skin: skinTo || boneName, phase: this.phase });
  }
}
const gripped = c => ({ ...c, add: (g, bone, color, o = {}) => c.add(g, bone, color, { ...o, skinTo: o.skinTo || (bone === 'handR' ? 'gripR' : bone === 'handL' || bone === 'elbowL' ? 'gripL' : undefined) }) });
const swapped = c => { const sw = b => b === 'handR' ? 'handL' : b === 'handL' ? 'handR' : b === 'elbowR' ? 'elbowL' : b === 'elbowL' ? 'elbowR' : b; return { ...c, add: (g, bone, color, o = {}) => c.add(g, sw(bone), color, o) }; };
const noop = () => {};

/** Run Chibi 2's gear builders for a look; returns the collector (pieces in Chibi bind space) and the Chibi rig. */
function collectChibiGear(a, race) {
  const rig = createChibiRig(a.body, race);
  rig.root.updateMatrixWorld(true);
  const C = new Collector(rig), H = rig.headScale;
  const add = (...args) => C.add(...args);
  const ellipsoid = (bone, color, position, scale, options = {}) => add(sphere(), bone, color, { position, scale, ...options });
  const strip = (bone, points, radius, color, options = {}) => add(taperedCurve(points, [radius, radius, radius], 4, 4), bone, color, options);
  const head = (g, color, options = {}) => add(g, 'head', color, { ...options, position: (options.position || [0, 0, 0]).map(v => v * H), scale: (options.scale || [1, 1, 1]).map(v => v * H) });
  // the body itself is only measured (its surfaces are what straps and packs lie on); nothing it adds is kept
  const body = buildBody(a, rig, { add: noop, ellipsoid: noop, strip: noop, trim: TRIM, leather: LEATHER, steel: STEEL, darkSteel: DARK_STEEL });
  const face = { faceZ: () => 0.27 * H, browTop: 0.4 * H };
  const c = { add, head, ellipsoid, strip, H, W: rig.wide, T: rig.torso, L: rig.leg, A: rig.arm, trim: TRIM, leather: LEATHER, steel: STEEL, darkSteel: DARK_STEEL, skin: a.body.skin, faceWidth: 1, faceDepth: 1, chestZ: body.chestZ, hipsZ: body.hipsZ, faceZ: face.faceZ, topStyle: body.top, LW: body.LW, rig, wrap: body.wrap, chestRings: body.chestRings, body, face };
  const g5 = [a.hat?.id, a.cape?.id, a.decor?.id, a.accessory?.id, a.held?.id, a.offhand?.id].some(isG5);
  // hats (batch 3 replaces these): Chibi's own, laid on the Kestrel skull's box
  C.phase = 'hat';
  if (a.hat?.id && a.hat.id !== 'none') {
    if (isG5(a.hat.id)) G5_HAT_BUILDERS[a.hat.id]?.(a, c, a.hat);
    else buildChibiHat(a, { add, head, H, W: rig.wide, T: rig.torso, trim: TRIM, leather: LEATHER, steel: STEEL, darkSteel: DARK_STEEL });
  }
  C.phase = 'cape';      // batch 5: the cape's pieces are told apart (its tail rides the cape bones; cape.js)
  buildCape(a, c);
  C.phase = 'gear';
  buildDecor(a, c);
  // (the accessory slot — glasses, masks, scarves, torcs — is built by the face, kit/js/face-acc.js: not here, or twice)
  if (g5) { C.phase = 'cape'; (G5_CAPE_BUILDERS[a.cape?.id] || G5_PACK_BUILDERS[a.cape?.id])?.(a, c, a.cape); C.phase = 'gear'; G5_DECOR_BUILDERS[a.decor?.id]?.(a, c, a.decor); }
  const ring = a.accessory?.ring, ring2 = a.accessory?.ring2;
  buildArmour2({ ...a, hat: { id: 'none' } }, c);      // batch 4: t2_* kits + emblems (nothing for a look naming neither)
  if (ring) G5_RING_BUILDERS[ring.id]?.(a, c, ring, 'R');
  if (ring2) G5_RING_BUILDERS[ring2.id]?.(a, c, ring2, 'L');
  // in the hands, exactly as chibi2-gear.js buildGear / chibi2-gear5.js buildGear5 do it
  const gc = gripped(c);
  let aa = a;
  if (!offhandAllowed(a.held?.id, a.offhand?.id)) aa = { ...a, offhand: { ...a.offhand, id: 'none' } };
  const held = aa.held?.id || 'none', off = aa.offhand?.id || 'none';
  if (G5_HELD[held]) G5_WEAPON_BUILDERS[held]?.(gc, aa.held.color || '#c8ccd6', aa.held.quality ?? 0, aa, aa.held);
  else buildHeld(aa, gc);
  if (G5_OFFHAND[off]) G5_OFFHAND_BUILDERS[off]?.(gc, aa.offhand.color || G5_OFFHAND[off].color || '#9aa3ad', aa.offhand.quality ?? 0, aa, aa.offhand);
  else if (G5_HELD[off]) G5_WEAPON_BUILDERS[off]?.(swapped(gc), aa.offhand.color || '#c8ccd6', aa.offhand.quality ?? 0, aa, aa.offhand);
  else if (HELD_WEAPON_IDS.includes(off) && off !== 'dagger') buildHeld({ ...aa, held: { ...aa.offhand } }, swapped(gc));
  else if (!isG5(off)) buildOffhand(aa, gc);
  return { C, rig, body };
}

// --------------------------------------------------------------------------------------------- Chibi torso, measured
function chibiTorso(rig, body) {
  const cy = rig.byName.chest.getWorldPosition(new THREE.Vector3()).y, hy = rig.byName.hips.getWorldPosition(new THREE.Vector3()).y;
  const rings = [...(body.hipsRings || []).map(([y, rx, rz, z = 0]) => [y + hy, rx, rz, z]), ...(body.chestRings || []).map(([y, rx, rz, z = 0]) => [y + cy, rx, rz, z])].sort((a, b) => a[0] - b[0]);
  // where hips and chest rings overlap, the wider wins (one surface)
  const ringAt = y => {
    if (!rings.length) return [y, 0.15, 0.12, 0];
    if (y <= rings[0][0]) return rings[0];
    if (y >= rings[rings.length - 1][0]) return rings[rings.length - 1];
    let best = null;
    for (let i = 1; i < rings.length; i++) {
      const a = rings[i - 1], b = rings[i];
      if (y < a[0] || y > b[0]) continue;
      const t = (y - a[0]) / (b[0] - a[0] || 1), r = [y, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
      if (!best || r[1] + r[2] > best[1] + best[2]) best = r;
    }
    return best || rings[rings.length - 1];
  };
  return { ringAt, chestY: cy, hipsY: hy };
}
const ellipseR = (rx, rz, th) => 1 / Math.sqrt((Math.sin(th) / rx) ** 2 + (Math.cos(th) / rz) ** 2);
/** Piecewise-linear map through matching landmark heights. */
const pw = (pairs) => y => {
  if (y <= pairs[0][0]) return pairs[0][1] + (y - pairs[0][0]) * ((pairs[1][1] - pairs[0][1]) / (pairs[1][0] - pairs[0][0]));
  for (let i = 1; i < pairs.length; i++) if (y <= pairs[i][0]) { const [a, A] = pairs[i - 1], [b, B] = pairs[i]; return A + (y - a) / (b - a) * (B - A); }
  const [a, A] = pairs[pairs.length - 2], [b, B] = pairs[pairs.length - 1];
  return B + (y - b) * ((B - A) / (b - a));
};

// --------------------------------------------------------------------------------------------- the move onto Kestrel
/**
 * `chibi` = { look (a normalised Chibi 2 avatar), race (chibi2-races record) , hold }, `krig` = Kestrel rig,
 * `parts` = the kit's body parts (torso, armL/R, legL/R), `P` = proportions, `worn` = garmentIds, `hairStyle`.
 * Returns { geometry, triangles } or null.
 */
export function buildGearGeometry({ chibi, krig, parts, P, worn = {}, hairStyle = 'short', cacheKey = chibi }) {
  const a = chibi?.look;
  if (!a || !gearSubset(a)) return null;
  // batch 5: the Chibi-space pieces depend only on the Chibi look, so a look's second LOD (a far body coming close, or
  // the other way) reuses them instead of running every builder again (the pieces are only read, never changed)
  const sig = JSON.stringify([a, chibi.race?.id ?? chibi.race ?? null]);
  let got = COLLECTED.get(cacheKey);
  if (!got || got.sig !== sig) { got = { sig, ...collectChibiGear(a, chibi.race || null) }; COLLECTED.set(cacheKey, got); }
  const { C, rig, body } = got;
  if (!C.pieces.length) return null;
  const M = retargetMap(krig), KB = krig.byName, hold = chibi.hold || {};
  const cw = n => rig.byName[n].getWorldPosition(new THREE.Vector3());
  const kw = n => new THREE.Vector3(...KB[n].userData.world);
  const CT = chibiTorso(rig, body), torso = parts.torso, k = P.k;
  // landmark heights, Chibi -> Kestrel
  const footC = CT.hipsY - rig.leg, kneeC = CT.hipsY - rig.leg * 0.51, shC = cw('armR').y, neckC = CT.chestY + 0.3 * rig.torso, headC = cw('head').y;
  const yOf = pw([[footC, P.ankleY], [kneeC, P.kneeY], [CT.hipsY, P.hipsY - 0.01 * k], [CT.chestY, P.spineY + 0.02 * k], [shC, P.shoulderY], [neckC, P.neckY + 0.04 * k], [headC, P.headY]]);
  // batch 4: how far out the outermost garment is (clothes.js plan.outer), so a belt, a cape or a pack lies on top of it
  const outer = worn.outer || null;
  const clothes = outer ? outer.off(P.chestY, 0) : worn.shirt ? 0.022 : 0.008;
  const clothesAt = outer ? (y, th) => outer.off(y, th) : () => clothes;
  // the shoulders: Chibi's are balls on the ends of its chest (chibi2-body.js shoulderBalls); Kestrel's the deltoid
  const ballR = 0.092 * Math.pow(rig.wide, 0.65) + (rig.round || 0) * 0.016;
  const balls = ['L', 'R'].map(s => ({ s, c: cw('arm' + s).add(new THREE.Vector3(0, -0.005, 0)), k: kw('arm' + s).add(new THREE.Vector3(0, 0.012, 0.004)), rk: 0.056 * Math.sqrt(P.W) + clothes * 0.7 }));
  const rad = (yReal, th) => {
    const y = Math.max(torso.yBot, Math.min(torso.yTop, yReal)), cz = torso.centreZ(y);
    const q = torso.at(P.yInv(y), th, { bump: 0.4 }).p;
    return { r: Math.hypot(q[0], q[2] - cz), cz };
  };
  // the head box: Chibi skull (head units) -> the Kestrel skull, with room for hair
  const H = rig.headScale, hc = cw('head');
  const hk = kw('head'), HS = P.HS || 1, hairPad = hairStyle === 'bald' ? 1.0 : hairStyle === 'short' ? 1.08 : 1.14;
  const headK = { chin: P.chinY, top: P.chinY + P.headH * (hairStyle === 'bald' ? 1.0 : 1.05), hw: 0.079 * HS * hairPad, front: 0.104 * HS * hairPad, back: 0.112 * HS * hairPad, z: hk.z - 0.004 };
  const limbAxial = {
    arm: (kw('elbowR').distanceTo(kw('armR'))) / rig.byName.elbowR.position.length(),
    elbow: (kw('handR').distanceTo(kw('elbowR'))) / rig.byName.handR.position.length(),
    leg: (kw('kneeR').distanceTo(kw('legR'))) / rig.byName.kneeR.position.length(),
    knee: (kw('footR').distanceTo(kw('kneeR'))) / rig.byName.footR.position.length(),
  };
  const out = { pos: [], nor: [], col: [], si: [], sw: [], surf: [], cape: [] };
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), tq = new THREE.Quaternion();
  const push = (p, n, c, w, metal) => {
    out.pos.push(p[0], p[1], p[2]); out.nor.push(n[0], n[1], n[2]); out.col.push(c[0], c[1], c[2]);
    const pairs = new Map();
    for (const [b, x] of w) { const nm = KB[b] ? b : b === 'chest' ? 'chest' : 'hips'; pairs.set(nm, (pairs.get(nm) || 0) + x); }
    const list = [...pairs].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = list.reduce((s, [, x]) => s + x, 0) || 1;
    for (let i = 0; i < 4; i++) { out.si.push(list[i] ? krig.index[list[i][0]] : 0); out.sw.push(list[i] ? list[i][1] / tot : 0); }
    out.surf.push(metal ? 0.34 : 0.86, metal ? -0.55 : 0);
  };
  for (const pc of C.pieces) {
    const pa = pc.g.attributes.position, na = pc.g.attributes.normal;
    const gripSide = /^grip([LR])$/.exec(pc.skin)?.[1];
    for (let i = 0; i < pa.count; i++) {
      const p = [pa.getX(i), pa.getY(i), pa.getZ(i)], n = [na.getX(i), na.getY(i), na.getZ(i)], col = [pc.cols[i * 3], pc.cols[i * 3 + 1], pc.cols[i * 3 + 2]];
      let q, nn = n, w = pc.wts[i];
      if (gripSide) {
        // ---- held: Chibi grip frame -> resized -> the Kestrel hand
        const g = cw('grip' + gripSide), kind = gripSide === 'R' ? hold.right : hold.left;
        const rule = itemRule(kind || 'none'), lp = [p[0] - g.x, p[1] - g.y, p[2] - g.z];
        const sp = stretchPoint(rule, ...lp), ss = stretchScale(rule, lp[1]);
        v.set(...sp).applyQuaternion(M.qB[gripSide]).add(kw('grip' + gripSide));
        nv.set(n[0] / ss[0], n[1] / ss[1], n[2] / ss[2]).normalize().applyQuaternion(M.qB[gripSide]);
        q = v.toArray(); nn = nv.toArray(); w = [['grip' + gripSide, 1]];
      } else if (pc.bone === 'head') {
        // ---- a hat: Chibi head box -> Kestrel skull box
        const x = (p[0] - hc.x) / H, y = (p[1] - hc.y) / H, z = (p[2] - hc.z) / H;
        const yk = headK.chin + (y / 0.6) * (headK.top - headK.chin);
        const zk = headK.z + (z >= 0 ? z / 0.28 * headK.front : z / 0.28 * headK.back);
        const below = Math.max(0, -y);      // a hood's hem below the chin follows the neck down, not the skull's box
        q = [x / 0.335 * headK.hw * (1 + below * 0.6), yk, zk];
        nn = [n[0] / headK.hw, n[1] / (headK.top - headK.chin), n[2] / headK.front];
        const l = Math.hypot(...nn) || 1; nn = nn.map(c => c / l);
      } else if (pc.bone === 'chest' || pc.bone === 'hips') {
        // ---- on the torso: same height (landmarks), same angle, same distance out of the body
        const ring = CT.ringAt(p[1]), th = Math.atan2(p[0], p[2] - ring[3]), rho = Math.hypot(p[0], p[2] - ring[3]);
        const lift = rho - ellipseR(ring[1], ring[2], th);
        const yk = yOf(p[1]), R = rad(yk, th);
        const cl = clothesAt(yk, th);
        const l2 = lift > -0.03 ? Math.max(lift, 0) * 0.9 + cl + Math.min(lift, 0) * 0.5 : lift + cl;
        let rr = Math.max(0.02, R.r + l2);
        // batch 4: below the torso, over a skirt (a cape's tail on a robe): outside the skirt by as much as it was out of Chibi's
        const skR = outer?.radius?.(yk, th);
        if (skR != null) rr = Math.max(rr, skR + 0.008 + Math.max(lift, 0) * 0.5);
        q = [Math.sin(th) * rr, yk, R.cz + Math.cos(th) * rr];
        // closer to a shoulder ball than to the chest? (a mantle, a strap over the top, a pauldron) — then by the ball
        const B = balls[p[0] >= 0 ? 1 : 0], dv = new THREE.Vector3(p[0] - B.c.x, p[1] - B.c.y, p[2] - B.c.z), dl = dv.length(), lb = dl - ballR;
        const bw = pc.bone === 'chest' ? smooth(-0.015, 0.015, lift - lb) * (1 - smooth(0.1, 0.16, lb)) : 0;
        if (bw > 0 && dl > 1e-5) {
          dv.multiplyScalar(1 / dl);
          const rb = B.rk + (lb > 0 ? lb * 0.9 : lb * 0.5);
          const qb = [B.k.x + dv.x * rb, B.k.y + dv.y * rb, B.k.z + dv.z * rb];
          q = q.map((c, j) => c + (qb[j] - c) * bw);
          w = [...w.map(([b, x]) => [b, x * (1 - bw * 0.5)]), ['arm' + B.s, bw * 0.25], ['clav' + B.s, bw * 0.25]];
        }
        // near the skin it moves as the skin does; further out, as Chibi skinned it (chest / hips / head)
        const near = (1 - smooth(0.05, 0.13, l2)) * (1 - bw);
        if (near > 0) {
          const sw = torso.weightsAt(Math.max(torso.yBot, yk), q[0], q[2]);
          w = [...sw.map(([b, x]) => [b, x * near]), ...w.map(([b, x]) => [b, x * (1 - near)])];
        }
        // batch 4: over a skirt, it moves as the skirt does (the skirt bones keep the legs inside it)
        const skW = skR != null ? outer.weights?.(yk, th) : null;
        if (skW) w = skW;
        // batch 5: a cape's tail below a SHORT skirt (a tunic to the seat) rides the skirt bones too, as it would over a
        // robe — so the seated clips' seat rule (cape.js), which lifts the skirt bones, lifts it with them
        else if (pc.phase === 'cape' && KB.skirt0 && yk < P.hipY && Math.cos(th) < -0.2) w = skirtWeights(th, P.hipY - yk, w, P.k);
        // a cape's tail behind the legs follows the thigh a little (a run would drive the legs through it)
        else if (yk < P.hipY && Math.cos(th) < -0.2 && l2 > 0.03) {
          const wl = 0.5 * smooth(P.hipY, P.kneeY, yk) * smooth(-0.2, -0.7, Math.cos(th));
          w = [...w.map(([b, x]) => [b, x * (1 - wl)]), [q[0] >= 0 ? 'legR' : 'legL', wl * 0.5], [q[0] >= 0 ? 'legL' : 'legR', wl * 0.2], ['hips', wl * 0.3]];
        }
        // batch 5: below the small of the back a long cape's tail hands over to the cape bones (cape.js drives them in
        // seated clips, so the tail lies back over the seat instead of going through it or into the ground)
        if (pc.phase === 'cape' && KB.capeA) w = capeWeights(w, yk, th, P);
      } else {
        // ---- on a limb: along the Kestrel segment, thinned
        const bn = pc.bone, s = bn.slice(-1), base = bn.slice(0, -1);
        const bc = cw(bn), bk = kw(bn);
        const lp = new THREE.Vector3(p[0] - bc.x, p[1] - bc.y, p[2] - bc.z);
        const ax = limbAxial[base] || 1, radial = base === 'leg' || base === 'knee' ? 0.85 : base === 'foot' ? 0.9 : 0.6;
        lp.set(lp.x * radial, lp.y * ax, lp.z * radial);
        const off = base === 'arm' ? M.offArm[s] : base === 'elbow' ? M.offElbow[s] : base === 'hand' ? M.offHand[s] : null;
        if (off) lp.applyQuaternion(tq.copy(off).invert());
        q = lp.add(bk).toArray();
        if (off) nn = nv.set(...n).applyQuaternion(tq).toArray();
      }
      if (pc.phase === 'cape') out.cape.push(out.pos.length / 3);   // batch 5: which vertices are the cape's
      push(q, nn, col, w, pc.metal);
    }
  }
  const n = out.pos.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(grade(out.col), 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.sw, 4));
  g.setAttribute('kestrelSurf', new THREE.Float32BufferAttribute(out.surf, 2));
  const geo = weld(g);
  if (out.cape.length) geo.userData.capeVerts = Uint32Array.from(out.cape);   // batch 5 (cape.js, tests)
  return { geometry: geo, triangles: n / 3 };
}

/** The 2.5 colour grade, mildly (the kit's own palette is richer than Chibi 2's raw colours). */
function grade(c) {
  for (let i = 0; i < c.length; i += 3) {
    const L = 0.2126 * c[i] + 0.7152 * c[i + 1] + 0.0722 * c[i + 2];
    for (let k = 0; k < 3; k++) c[i + k] = Math.max(0, L + (c[i + k] - L) * 1.12);
  }
  return c;
}
/** Index a flat soup (keeps every vertex; the index is what mergeInto expects). */
function weld(g) {
  const n = g.attributes.position.count, idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Append geometry `b` to `a` (same attribute set) — one draw call. */
export function mergeInto(a, b) {
  const na = a.attributes.position.count, nb = b.attributes.position.count, out = new THREE.BufferGeometry();
  for (const name of Object.keys(a.attributes)) {
    const A = a.attributes[name], B = b.attributes[name], size = A.itemSize;
    const arr = new A.array.constructor((na + nb) * size);
    arr.set(A.array, 0);
    if (B) arr.set(B.array, na * size);
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, A.normalized));
  }
  const ia = a.index.array, ib = b.index.array, big = na + nb > 65535;
  const idx = big ? new Uint32Array(ia.length + ib.length) : new Uint16Array(ia.length + ib.length);
  idx.set(ia, 0);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  if (a.userData.kestrelGrid) out.userData.kestrelGrid = { ...a.userData.kestrelGrid, bodyVertices: na };   // batch 4: tests (the body's vertices come first)
  for (const G of [a, b]) if (G.userData.capeVerts) {     // batch 5: the cape's vertices, renumbered
    const off = G === a ? 0 : na, prev = out.userData.capeVerts || new Uint32Array(0), cur = G.userData.capeVerts;
    const all = new Uint32Array(prev.length + cur.length); all.set(prev, 0); for (let i = 0; i < cur.length; i++) all[prev.length + i] = cur[i] + off;
    out.userData.capeVerts = all;
  }
  return out;
}

/**
 * Batch 4: a cheaper copy of a gear geometry (vertex clustering): vertices in the same `cell` (m) that hang on the same
 * main bone become one, triangles that collapse are dropped. kestrel.js uses it only when the outfit budget needs it
 * (a tier-2 kit, a cape and a two-hander on a plate body; and always on LOD 1). Returns { geometry, triangles }.
 */
export function simplifyGear(geometry, cell) {
  const A = geometry.attributes, pos = A.position.array, si = A.skinIndex.array, sw = A.skinWeight.array, idx = geometry.index.array, n = pos.length / 3;
  const map = new Int32Array(n), keyOf = new Map(), keepV = [];
  for (let v = 0; v < n; v++) {
    let bk = 0, bw = -1; for (let k = 0; k < 4; k++) if (sw[v * 4 + k] > bw) { bw = sw[v * 4 + k]; bk = si[v * 4 + k]; }
    const key = `${Math.round(pos[v * 3] / cell)},${Math.round(pos[v * 3 + 1] / cell)},${Math.round(pos[v * 3 + 2] / cell)},${bk}`;
    let r = keyOf.get(key); if (r === undefined) { r = keepV.length; keyOf.set(key, r); keepV.push(v); }
    map[v] = r;
  }
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) { const a = map[idx[t]], b = map[idx[t + 1]], c = map[idx[t + 2]]; if (a !== b && b !== c && a !== c) tris.push(a, b, c); }
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(A)) {
    const S = A[name], k = S.itemSize, arr = new S.array.constructor(keepV.length * k);
    keepV.forEach((v, i) => { for (let c = 0; c < k; c++) arr[i * k + c] = S.array[v * k + c]; });
    g.setAttribute(name, new THREE.BufferAttribute(arr, k, S.normalized));
  }
  g.setIndex(new THREE.BufferAttribute(keepV.length > 65535 ? new Uint32Array(tris) : new Uint16Array(tris), 1));
  if (geometry.userData.capeVerts) g.userData.capeVerts = Uint32Array.from(new Set(Array.from(geometry.userData.capeVerts, v => map[v])));   // batch 5
  return { geometry: g, triangles: tris.length / 3 };
}
