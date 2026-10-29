// Kestrel kit — the ONE entry point for hats (batch 3, 2026-10-28). kestrel.js (templateSteps) calls:
//
//   const hat = planHat(n.hat, n.face);                 // null when the look wears none (n.hat = hatLookOf(look) in normalize)
//   add(parts.neck, { …, mask: hat ? (y, th) => hat.neckMask(y, th) : 0 });     // neck skin under a mantle / aventail
//   const faceB = buildFace({ P, n, colors, lod, parts, add, hat });            // face-build.js: the hair cut to the hat
//                                                        // (or cinched under a band), the ears / beard / face pieces /
//                                                        // accessories it hides left out, the scalp / face under it masked
//   … the garments …, `hide` assembled …
//   hide |= buildHat(hat, { P, n, colors, lod, parts, add, MB, hair: faceB.hair, hide }).hide;   // the hat, LAST, in the
//                                                        // same mesh — it counts what is drawn and fits the budget
//   buildGearGeometry({ chibi: hat ? { ...n.chibi, look: { ...n.chibi.look, hat: { id: 'none' } } } : n.chibi, … })
//                                                        // so the gear bridge no longer builds Chibi's stand-in hat
//
// `hatFitFor(look)` is the light version: what the hat does to the head (hair cut line, ears, beard, face) without
// building anything. `bandFit` is face-build's helper for bands (circlet, headband, crown…) that sit on the hair.
//
// What a plan holds: { id, info (hat-catalog.js), look (normalised hat), fit(θ) | null, underHat ({ front, back, at,
// drop, floor, avoid } for hair-kit.js), band (bands), hair 'crop' | 'none' | 'keep', ears 'show' | 'hide' | 'tips',
// beard, beardShell, face, acc, accOk(id), headMask(y, θ), neckMask(yWorld, θ), hide (cover bits to drop), bodyPad }.
import * as THREE from 'three';
import { emblemGeometries } from '../../../js/chibi2-armour2.js';
import { HAT_INFO, hatLookOf, hatIdOf } from './hat-catalog.js';
import { faceLook } from './face-catalog.js';
import { HATS } from './hats.js';
import { hatKit, hatColor, CLEAR, CROWN, lift, tone } from './hat-kit.js';
import { cmul, cmix, add, mul, norm, cross, hexLin, clamp, smooth } from './kmath.js';
import { headToWorld } from './face.js';
import { COVER } from './geo.js';

export { hatLookOf, hatIdOf };
/** Cover bits of the skin a hat hides (above face.js FACE_COVER's 1<<24..27). */
export const HAT_COVER = { SCALP: 1 << 28, FACE: 1 << 29, NECK: 1 << 30, LEAN: 1 << 23 };   // LEAN: hair-kit.js tags its minor locks
/** The character's triangle budget at LOD 0 / 1 (CONTRACT: ≤ 12,000 / ≤ 4,000). */
export const HAT_BUDGET = [12000, 4000];

const DARK_STEEL = '#536a73', TRIM = '#d9b477';
/** Accessories that sit on the neck or the ears (gone under a hood, a coif, a helm). */
const NECK_ACC = new Set(['g5_torc', 'scarf_trailing', 'scarf_cowl', 'scarf_striped', 'neckerchief', 'scarf', 'earrings']);

/**
 * How high each ear shape stands (head space, the top of the rim; measured on face.js's ears, both bodies' larger) and
 * on what bearing — a hat that lets the ears show lifts its edge over them by just this much (the notch).
 */
const EAR_TOP = { normal: 0.157, small: 0.151, big: 0.165, pointed: 0.166, long_pointed: 0.172, swept: 0.157, notched: 0.158, fins: 0.17 };
const earNotch = (face, fit) => {
  const id = face?.ears?.id, top0 = EAR_TOP[id];
  if (!top0) return fit;
  const need = 0.127 + (top0 - 0.127) * (face.ears.scale ?? 1) + 0.011;   // + the rim's roll and a brim's droop
  return th => { const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th))), w = smooth(1.22, 1.48, a) * (1 - smooth(2.12, 2.45, a)), y = fit(th); return y + Math.max(0, need - y) * w; };
};

/**
 * What a hat does to the head, without building it. `hat` = a normalised hat (hatLookOf) or anything a look names;
 * `face` = face-catalog.js faceLook(look) (n.face) — a hat that lets the ears show is notched over tall ears.
 * Pure (no Three.js work); safe to call per frame.
 */
export function planHat(hat, face = null) {
  const look = hat && typeof hat === 'object' && hat.id && HAT_INFO[hat.id] ? hat : hatLookOf({ hat });
  if (!look) return null;
  const info = HAT_INFO[look.id], H = HATS[look.id];
  let fit = H.fit ? (th => H.fit(th)) : null;
  if (fit && info.ears !== 'hide') fit = earNotch(face, fit);
  const covers = !!fit && info.hair !== 'keep';
  const whole = info.face === false;
  const plan = {
    id: look.id, info, look, fit,
    hair: info.hair, ears: info.ears, beard: info.beard !== false, beardShell: info.beard === 'shell', face: info.face !== false, acc: info.acc, neck: !!info.neck,
    // the hair is cut at the hat's edge (hair-kit.js: `at` wins over front / back)
    // (`drop`: under anything that reaches the neck — a hood, a coif, an aventail, a pelt — hair rooted under it is not
    // re-rooted at its edge: it stays inside)
    // (`at`: the lowest edge within ±14° — a hair blade is up to 5 cm wide, so next to a step in the edge (a cheek guard,
    // a sallet's tail) it would reach under the lower side — less 2 mm; `floor`: under a hood / coif / aventail the hair in the face opening stops at the jaw, tucked in)
    bodyPad: info.kind === 'down' ? 0.05 : 0,
    band: H.band || null,                            // a band on the hair: { y(θ), lo, hi, min, max } (bandFit)      // a hood lying on the back: hanging hair lies over it
    underHat: covers && info.hair === 'crop' ? { front: fit(0), back: fit(Math.PI), at: th => Math.min(fit(th - 0.25), fit(th - 0.12), fit(th), fit(th + 0.12), fit(th + 0.25)) - 0.002, drop: !!info.neck, floor: info.neck ? () => 0.012 : null, avoid: H.avoid || null } : null,
    /** skin under the hat: the scalp more than 2 cm above its edge (the band under the rim stays: no gap to see into) */
    headMask: whole ? () => HAT_COVER.FACE : covers ? (y, th) => (y > fit(th) + 0.02 ? HAT_COVER.SCALP : 0) : () => 0,
    /** neck skin under a mantle / aventail / pelt: the back half of the neck */
    neckMask: info.neck ? (yW, th) => (Math.cos(th) < -0.25 ? HAT_COVER.NECK : 0) : () => 0,
    hide: (covers ? HAT_COVER.SCALP : 0) | (whole ? HAT_COVER.FACE : 0) | (info.neck ? HAT_COVER.NECK : 0),
    accOk: id => info.acc === 'all' || (info.acc === 'face' && !NECK_ACC.has(id)),
  };
  return plan;
}

/** hatFitFor(look): the plan for whatever hat a look wears (a Kestrel look's `hat`, or the Chibi look it carries). */
export const hatFitFor = look => planHat(hatLookOf(look), faceLook(look));

/**
 * How far the hair stands out of the skull at (θ, y), measured on the built hair (head space, from the head's axis) —
 * a circlet or a crown sits on the hair, not in it. Capped at 2.8 cm off the skull: wilder hair (an afro, spikes) is
 * allowed to bury the band a little rather than float it in the air.
 */
function hairExtent(K, hairParts) {
  const NB = 36, BY = [0.0, 0.25], NY = 26, grid = Array.from({ length: NB * NY }, () => 0);
  const bin = (th, y) => { const i = ((Math.round((th + Math.PI) / (2 * Math.PI) * NB) % NB) + NB) % NB, j = Math.round((y - BY[0]) / (BY[1] - BY[0]) * (NY - 1)); return j < 0 || j >= NY ? -1 : i * NY + j; };
  for (const sp of hairParts || []) {
    const cols = sp.wrap === false ? sp.segs + 1 : sp.segs;
    for (const u of sp.us) for (let j = 0; j < cols; j++) {
      const th = sp.theta ? sp.theta(j, sp.segs) : sp.wrap === false ? (sp.t0 ?? 0) + ((sp.t1 ?? 2 * Math.PI) - (sp.t0 ?? 0)) * j / sp.segs : j / sp.segs * 2 * Math.PI;
      const q = K.toHead(sp.at(u, th).p), a = Math.atan2(q[0], q[2]), b = bin(a, q[1]);
      if (b < 0) continue;
      const r = Math.hypot(q[0], q[2]);
      if (r > grid[b]) grid[b] = r;
    }
  }
  return (th, y, cap) => {
    const sk = K.skullHR(y, th), j = clamp(Math.round((y - BY[0]) / (BY[1] - BY[0]) * (NY - 1)), 0, NY - 1);
    let r = 0;
    // the outermost hair within ±1 bin round, so the band is smooth and clears its neighbours
    for (let d = -1; d <= 1; d++) { const i = ((Math.round((th + Math.PI) / (2 * Math.PI) * NB) + d) % NB + NB) % NB; for (let e = -1; e <= 1; e++) { const jj = j + e; if (jj >= 0 && jj < NY) r = Math.max(r, grid[i * NY + jj]); } }
    return Math.max(sk + CLEAR, Math.min(r + 0.002, sk + (cap ?? 0.028)));
  };
}

/**
 * Where a band goes round this hair (face-build.js calls it with the hair built once): its radius on each bearing is
 * the hair's outer face over the band's height (head space, from the head's axis), between `min` and `max` off the
 * skull, smoothed round the head. Returns { r(θ) (the band's inner radius), belt (for hairParts: the hair is rebuilt
 * cinched just inside it) }.
 */
export function bandFit(P, hairParts, band) {
  const K = hatKit(P), NB = 48, R = new Float64Array(NB), M = new Float64Array(NB), MC = new Float64Array(NB);
  const sk = th => K.skullHR(band.y(th), th), thOf = i => i / NB * 2 * Math.PI - Math.PI;
  // the hair cap is the hair's volume (a puffed afro is all cap): the band sits outside it over its whole height, a
  // little more; locks and tubes standing out past that are cinched in (but the band need not ride the odd spike)
  for (const sp of hairParts || []) {
    const isCap = sp.name === 'hairCap', pad = isCap ? 0.008 : 0.004;
    for (const p of sampleSpec(sp, 1, isCap ? 6 : 3)) {
      const q = K.toHead(p), th = Math.atan2(q[0], q[2]), y0 = band.y(th);
      if (q[1] < y0 + band.lo - pad || q[1] > y0 + band.hi + pad) continue;
      const i = ((Math.round((th + Math.PI) / (2 * Math.PI) * NB) % NB) + NB) % NB, off = Math.hypot(q[0], q[2]) + 0.0015 - sk(th);
      const A = isCap ? MC : M; if (off > A[i]) A[i] = off;
    }
  }
  const med = [...M].sort((a, b) => a - b)[NB >> 1], lim = Math.max(band.max, med + 0.004);
  for (let i = 0; i < NB; i++) R[i] = sk(thOf(i)) + Math.max(band.min, MC[i] + 0.001, Math.min(M[i], lim));
  // a smooth upper envelope (a band is a smooth ring, not a fit to every lock): the most within ±3 bins, then blurred
  const D = Array.from(R, (_, i) => Math.max(...[-3, -2, -1, 0, 1, 2, 3].map(d => R[(i + d + NB) % NB])));
  const S = Array.from(D, (_, i) => Math.max(R[i], 0.5 * D[i] + 0.25 * (D[(i + 1) % NB] + D[(i + NB - 1) % NB])));
  const r = th => { const f = ((th + Math.PI) / (2 * Math.PI) * NB % NB + NB) % NB, i = Math.floor(f), t = f - i; return S[i] * (1 - t) + S[(i + 1) % NB] * t; };
  return { r, belt: { y: band.y, lo: band.lo, hi: band.hi, r: th => r(th) - 0.0016 } };
}
/** A spec's grid points (bind space). */
function* sampleSpec(sp, step = 2, sub = 1) {
  const cols = sp.wrap === false ? sp.segs + 1 : sp.segs;
  // `sub` > 1: rows in between too (a sparse grid can hide a bulge from a measurement)
  const us = sub > 1 ? sp.us.flatMap((u, i) => (i ? Array.from({ length: sub }, (_, k) => sp.us[i - 1] + (u - sp.us[i - 1]) * (k + 1) / sub) : [u])) : sp.us;
  for (const u of us) for (let j = 0; j < cols; j += step) {
    const th = sp.theta ? sp.theta(j, sp.segs) : sp.wrap === false ? (sp.t0 ?? 0) + ((sp.t1 ?? 2 * Math.PI) - (sp.t0 ?? 0)) * j / sp.segs : j / sp.segs * 2 * Math.PI;
    yield sp.at(u, th).p;
  }
}
/** Write raw head-space triangles (the pumpkin's carving, the emblems) straight into the mesh builder. */
function writeRaw(MB, P, tri) {
  const W = p => headToWorld(P, p);
  const c = tri.color, w = [['head', 1]];
  const ids = tri.pts.map(p => MB.v(W(p), c, w, 0, tri.rough ?? 0.5, tri.glow ?? 0, 0, 0));
  for (let i = 1; i + 1 < ids.length; i++) MB.t(ids[0], ids[i], ids[i + 1]);
  return ids.length - 2;
}
const EMBLEM_COST = new Map();
/** Triangles the emblem `id` takes (its picture plus the disc behind it). */
function emblemCost(id) {
  if (!EMBLEM_COST.has(id)) {
    let n = new THREE.CylinderGeometry(1.3, 1.3, 0.25, 12).toNonIndexed().attributes.position.count / 3;
    for (const { geometry } of emblemGeometries(id)) { const g = geometry.index ? geometry.toNonIndexed() : geometry; n += g.attributes.position.count / 3; g.dispose(); geometry.dispose(); }
    EMBLEM_COST.set(id, n);
  }
  return EMBLEM_COST.get(id);
}
/** The emblem (chibi2-armour2.js's pictures, the same ids) on the hat's brow, facing out along n. */
function emblemAt(MB, P, id, p, n, color, rim) {
  const up0 = Math.abs(n[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0], X = norm(cross(up0, n)), Y = cross(n, X);
  const size = 0.011, W = q => headToWorld(P, q);
  let tris = 0;
  const put = (g, col, scale, z) => {
    const geo = g.index ? g.toNonIndexed() : g;
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i += 3) {
      const ids = [];
      for (let k = 0; k < 3; k++) {
        const x = pa.getX(i + k) * scale, y = pa.getY(i + k) * scale, zz = pa.getZ(i + k) * scale * 0.5 + z;
        ids.push(MB.v(W(add(p, add(add(mul(X, x), mul(Y, y)), mul(n, zz)))), col, [['head', 1]], 0, 0.34, -0.55, 0, 0));
      }
      MB.t(ids[0], ids[1], ids[2]); tris++;
    }
    geo.dispose(); if (geo !== g) g.dispose();
  };
  put(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 12).rotateX(Math.PI / 2), rim, size, 0.0012);
  for (const { geometry, k } of emblemGeometries(id)) put(geometry, k > 0 ? lift(color, k) : k < 0 ? cmul(color, 1 + k) : color, size, 0.0028);
  return tris;
}

/**
 * Build the hat of `plan` into the character: every piece goes through `add` (kestrel.js: LOD-resampled, one mesh), the
 * emblem and carving triangles straight into `MB`. `hair` = face-build's hair result (bands measure it), `face` =
 * `hide` = the cover bits kestrel.js will drop (so the budget counts only what is drawn). Returns { pieces, rawTris, lean,
 * cost, used, leanHair, hide (extra bits to drop: HAT_COVER.LEAN when the minor hair locks had to go) }.
 *
 * The budget: what is already in the mesh and will be drawn (the skin and hair this hat hides are not counted) plus the
 * hat must stay within HAT_BUDGET, so a heavy look gets a leaner hat (fewer columns, no small studs, lean 1-2) and,
 * last, its minor hair locks (the ones LOD 1 drops) dropped.
 */
export function buildHat(plan, { P, n, lod = 0, parts = {}, add: addPart, MB = null, hair = null, hide = 0, budget = HAT_BUDGET[lod ? 1 : 0] }) {
  if (!plan) return null;
  const body = parts.neck && parts.torso ? { neck: parts.neck, torso: parts.torso } : null;
  const L = plan.look, info = plan.info, q = L.quality || 0;
  const c = hatColor(L.color || info.color), c2 = hatColor(L.color2 || info.color2 || TRIM);
  let hairR = null;
  const hatIn = K => ({
    id: plan.id, info, q, c, c2, own2: !!L.color2, fit: plan.fit,
    trim: lift(hatColor(TRIM), 0.06 * q),
    dark: hatColor(DARK_STEEL), eyes: hatColor(n?.eyes || '#e8c040'),
    hairR: hairR ||= (hair && hair.parts?.length ? hairExtent(K, hair.parts) : (th, y) => K.skullHR(y, th) + CLEAR),
    /** a band's inner radius on bearing θ (face-build.js measured it on the hair and cinched the hair inside it) */
    bandR: plan.bandR || (th => K.skullHR(plan.band ? plan.band.y(th) : 0.19, th) + (plan.band?.min ?? CLEAR)),
    /** does hair hang below the hat at the back on bearing θ (a ponytail, long hair)? (a knot's tails then stay off it) */
    hairHangs: th => !!hair?.parts?.some(sp => sp.name !== 'hairCap' && [...sampleSpec(sp)].some(p => { const q = K.toHead(p); return q[1] < (plan.fit ? plan.fit(th) : 0.15) - 0.01 && q[1] > -0.25 && Math.cos(Math.atan2(q[0], q[2]) - th) > 0.75; })),
  });
  const hideNow = (hide || COVER.BRIEFS | COVER.PATCH | (P.fem ? COVER.BRA : 0)) | plan.hide;
  const drawn = (M, a, b, c3, bits) => !((M[a] & bits) && (M[b] & bits) && (M[c3] & bits));
  let used = 0;
  if (MB) { const I = MB.I, M = MB.M; for (let t = 0; t < I.length; t += 3) if (drawn(M, I[t], I[t + 1], I[t + 2], hideNow)) used++; }
  const eCost = L.emblem && !lod ? emblemCost(L.emblem) : 0;
  // steps down, in order: fewer columns (lean 1, 2), then no emblem, then fewer still (lean 3), then the minor hair
  let K, out, cost = 0, lean = 0, emblem = !!eCost, spare = budget - used - eCost;
  for (let step = 0; ; step++) {
    lean = [0, 1, 2, 2, 3][step]; emblem = !!eCost && step < 3; spare = budget - used - (emblem ? eCost : 0);
    K = hatKit(P, { lod, body, lean });
    out = HATS[plan.id].build.call(HATS[plan.id], K, hatIn(K)) || {};
    cost = K.parts.reduce((s, sp) => s + estimate(sp, lod), 0) + K.raws.reduce((s, t) => s + t.pts.length - 2, 0);
    if (!MB || cost <= spare || step >= 4) break;
  }
  let leanHair = false;
  if (MB && cost > spare) {
    // still over: the minor hair locks go (they are the ones LOD 1 never builds)
    let minorT = 0; const I = MB.I, M = MB.M;
    for (let t = 0; t < I.length; t += 3) if (!drawn(M, I[t], I[t + 1], I[t + 2], HAT_COVER.LEAN) && drawn(M, I[t], I[t + 1], I[t + 2], hideNow)) minorT++;
    if (minorT) leanHair = true;
  }
  for (const s of K.parts) addPart(s);
  let rawTris = 0;
  if (MB) {
    for (const t of K.raws) rawTris += writeRaw(MB, P, t);
    // the emblem on the brow (tier-2 class armour: `hat.emblem`)
    if (emblem && out.brow !== null) {
      let p, nn;
      if (out.brow?.p) { p = out.brow.p; nn = norm(out.brow.n || [0, 0, 1]); }
      else { const y = out.brow?.y ?? (plan.fit ? plan.fit(0) + 0.02 : 0.2), off = out.brow?.off ?? 0.012; p = K.atY(0, y, off); nn = K.normalY(0, y); }
      rawTris += emblemAt(MB, P, L.emblem, p, nn, hatColor(L.emblemColor || '#ffcf4a'), hatColor(L.color2 || TRIM));
    }
  }
  return { pieces: K.parts.length, rawTris, lean, emblem, cost, used, leanHair, hide: leanHair ? HAT_COVER.LEAN : 0 };
}
/** Triangles a surface spec will make (before covered ones drop), as kestrel.js lodSpec resamples it. */
function estimate(s, lod) {
  const rows = lod && s.us.length >= 14 ? Math.ceil(s.us.length / 2) : s.us.length;
  const segs = lod ? Math.max(3, Math.round(s.segs * 0.6)) : s.segs;
  return 2 * (rows - 1) * segs - (s.capStart ? segs : 0) - (s.capEnd ? segs : 0);
}
void cmix; void hexLin; void CROWN; void tone; void mul; void add;
