// Chibi 3 clothes: tunics, robes, surcoats, trousers, kilts, boots, belts, straps, wraps, fur.
// No Three.js. Built the garments.js way (offset from the body, inside a region).

import {
  torsoRegion, legsRegion, garmentShape, addGarment, capsuleDist, planeDist, minOf, skirtWeights,
  torsoBounds, armBounds, legBounds, unionBounds, clothFolds, paint, shadeHex, mixHex, addv, sub, unit, dot,
} from './garments.js';
import { Shape, cone, sphere, ellipsoid, roundBox, noise3, smoothstep } from './sdf.js';
import { jointWeights } from './skin.js';

/** A band of paint (a trim) along a surface: everything within `w` of the plane through p facing n. */
function bandPaint(p, n, w, pt, reach = 0) {
  const u = unit(n);
  // `reach` > 0 keeps the band near p (a cuff), instead of all the way round the character
  return { op: 'paint', k: 0, box: null, band: 0.002, paint: pt, d: (x, y, z) => {
    const d = Math.abs((x - p[0]) * u[0] + (y - p[1]) * u[1] + (z - p[2]) * u[2]) - w;
    return reach > 0 ? Math.max(d, Math.hypot(x - p[0], y - p[1], z - p[2]) - reach) : d;
  } };
}

/** Tunic / shirt / gambeson: to mid-thigh (or `hem`), sleeves to `sleeve`. */
export function tunic(ctx, color, { trim = null, sleeve = 1.85, hem = null, thick = 0.006, kind = 'cloth', quilted = false, collar = true } = {}) {
  const L = ctx.L, S = L.S, h = hem ?? L.hip - 0.16 * S;
  const region = torsoRegion(L, { hem: h, sleeve, neckline: 0.072, sleeveR: 0.105 });
  const prims = [];
  if (trim) {
    prims.push(bandPaint([0, h, 0], [0, 1, 0], 0.012 * S, paint(kind, trim)));
    for (const s of ['L', 'R']) {
      const A = L.arm[s];
      const end = sleeve <= 1 ? addv(A.sh, A.up, Math.hypot(...sub(A.el, A.sh)) * sleeve) : addv(A.el, A.fore, Math.hypot(...sub(A.wr, A.el)) * (sleeve - 1));
      prims.push(bandPaint(end, sleeve <= 1 ? A.up : A.fore, 0.012 * S, paint(kind, trim), 0.12 * S));
    }
  }
  const quilt = quilted ? (x, y, z) => -0.0016 * S * (Math.abs(Math.sin(y * 70 / S)) < 0.12 ? 1 : 0) : null;
  const folds = clothFolds(0.0024 * S, 26, { rings: [{ y: L.waist, w: 0.05 * S, freq: 150, amp: 0.0012 * S }] });
  const sh = garmentShape('tunic', ctx, thick * S, region, { paintBase: paint(kind, color), prims, folds: quilt ? (x, y, z) => folds(x, y, z) + quilt(x, y, z) : folds });
  addGarment(ctx, 'tunic', sh, unionBounds(torsoBounds(L, h), armBounds(L)), { step: 0.0125, weights: skirtWeights(ctx.R, ctx, { from: L.pelvis - 0.04 * S, to: L.knee + 0.1 * S }) });
}

/**
 * Robe: fitted over the chest, falling from the hips in a flared skirt to the ankles, wide bell
 * sleeves, trim at the hem, cuffs and down the front. The skirt is a cone joined to the body by a
 * smooth union, so it hangs from the hips instead of wrapping each leg.
 */
export function robe(ctx, color, { trim = null, sleeve = 1.95, bell = 1.25, hemY = null } = {}) {
  const L = ctx.L, S = L.S, W = L.W, hem = hemY ?? L.ankle + 0.05 * S;
  const prims = [];
  // the skirt cone, from just above the hips (inside the body) to the hem
  const top = [0, L.pelvis + 0.02 * S, -0.005 * S], bot = [0, hem - 0.02 * S, 0.01 * S];
  prims.push(Object.assign(cone(top, bot, 0.15 * S * W, 0.3 * S * W, { squash: [1.0, 0.82] }), { k: 0.07 * S, paint: paint('cloth', color) }));
  // bell sleeves: a cone from mid-forearm flaring past the wrist
  for (const s of ['L', 'R']) {
    const A = L.arm[s], f = Math.hypot(...sub(A.wr, A.el));
    prims.push(Object.assign(cone(addv(A.el, A.fore, f * 0.2), addv(A.wr, A.fore, 0.02 * S), 0.05 * S, 0.075 * S * bell), { k: 0.05 * S, paint: paint('cloth', color) }));
  }
  const sleeveEnd = s => addv(L.arm[s].wr, L.arm[s].fore, 0.03 * S);
  // the region: whole torso down to the hem, sleeves to past the wrist
  const torso = torsoRegion(L, { hem, sleeve, neckline: 0.062, sleeveR: 0.11 });
  const skirtZone = (x, y, z) => Math.max(hem - y, y - L.pelvis, Math.hypot(x / (0.42 * S * W), z / (0.36 * S)) - 1);
  const region = minOf(torso, skirtZone);
  region.partAt = (x, y, z) => skirtZone(x, y, z) < torso(x, y, z) ? 'torso' : torso.partAt(x, y, z);
  if (trim) {
    prims.push(bandPaint([0, hem, 0], [0, 1, 0], 0.025 * S, paint('silk', trim)));
    for (const s of ['L', 'R']) prims.push(bandPaint(sleeveEnd(s), L.arm[s].fore, 0.022 * S, paint('silk', trim), 0.16 * S));
    // down the front opening (front half only)
    prims.push({ op: 'paint', k: 0, box: null, band: 0.002, paint: paint('silk', trim), d: (x, y, z) => z < 0.03 * S ? 1 : Math.abs(x) - 0.018 * S });
  }
  // vertical folds in the skirt, deeper toward the hem; soft noise above
  const folds = (x, y, z) => {
    const below = smoothstep(L.pelvis, hem + 0.1 * S, y) * 0 + smoothstep(L.pelvis - 0.05 * S, hem, -y + 2 * L.pelvis - L.pelvis) ;
    const depth = Math.max(0, Math.min(1, (L.pelvis - y) / (L.pelvis - hem)));
    const ang = Math.atan2(x, z * 1.15);
    const pleat = Math.sin(ang * 9 + noise3(x * 6, 0.3, z * 6) * 2.2) * 0.009 * S * depth ** 1.2;
    void below;
    return pleat + noise3(x * 20, y * 6, z * 20) * 0.0028 * S;
  };
  const sh = garmentShape('robe', ctx, 0.0065 * S, region, { paintBase: paint('cloth', color), prims, folds });
  addGarment(ctx, 'robe', sh, unionBounds([-0.45 * S * W, hem - 0.04, -0.4 * S, 0.45 * S * W, L.neck + 0.08 * S, 0.42 * S], armBounds(L, 0.11)),
    { step: 0.0125, weights: skirtWeights(ctx.R, ctx, { from: L.pelvis + 0.02 * S, to: L.knee - 0.05 * S }) });
}

/** Sleeveless tabard over armour: front and back panels to the knees, heraldry in color2. */
export function surcoat(ctx, color, { trim = null, device = 'cross', over = 0.034 } = {}) {
  const L = ctx.L, S = L.S, W = L.W, hem = L.knee + 0.05 * S;
  const prims = [];
  // two panels hanging from the waist (front and back), slightly flared
  for (const zs of [1, -1]) prims.push(Object.assign(roundBox([0, (L.waist + hem) / 2 - 0.03 * S, zs * 0.105 * S], [0.15 * S * W, (L.waist - hem) / 2, 0.012 * S], 0.008 * S, { rot: [zs * 0.08, 0, 0] }), { k: 0.04 * S, paint: paint('cloth', color) }));
  const torso = torsoRegion(L, { hem: L.waist - 0.06 * S, sleeve: 0, neckline: 0.085 });
  const panels = (x, y, z) => Math.max(hem - y, y - L.waist, Math.abs(x) - (0.15 + 0.03 * (L.waist - y) / (L.waist - hem)) * S * W, 0.03 * S - Math.abs(z));
  const region = minOf(torso, panels);
  region.partAt = () => 'torso';
  const dark = shadeHex(color, -0.12);
  if (device === 'cross' && trim) {
    // a heraldic cross on the chest and on the front panel
    prims.push({ op: 'paint', k: 0, box: null, band: 0.0015, paint: paint('cloth', trim), d: (x, y, z) => z < 0 ? 1 : Math.min(Math.abs(x) - 0.022 * S, Math.max(Math.abs(y - (L.chest + 0.06 * S)) - 0.02 * S, Math.abs(x) - 0.11 * S)) });
  }
  if (trim) prims.push(bandPaint([0, hem, 0], [0, 1, 0], 0.012 * S, paint('cloth', trim)));
  const folds = (x, y, z) => (y < L.waist ? Math.sin(x * 70 / S + noise3(x * 8, y * 3, z * 8) * 2) * 0.004 * S * smoothstep(L.waist, hem, y) : 0) + noise3(x * 22, y * 8, z * 22) * 0.002 * S;
  const sh = garmentShape('surcoat', ctx, over * S, region, { paintBase: paint('cloth', color), prims, folds });
  void dark;
  addGarment(ctx, 'surcoat', sh, [-0.36 * S * W, hem - 0.04, -0.3 * S, 0.36 * S * W, L.neck + 0.08 * S, 0.3 * S], { step: 0.012,
    weights: skirtWeights(ctx.R, ctx, { from: L.waist - 0.02 * S, to: L.knee }) });
}

/** A belt round the waist (`at` y), `over` metres off the skin, with a buckle. */
export function belt(ctx, color, { at = null, over = 0.012, width = 0.028, buckle = '#c8a050', studs = false } = {}) {
  const L = ctx.L, S = L.S, y0 = at ?? L.waist - 0.03 * S;
  const region = (x, y, z) => Math.max(Math.abs(y - y0) - width * S, Math.abs(x) - 0.25 * S * L.W, Math.abs(z) - 0.22 * S);
  const prims = [Object.assign(roundBox([0, y0, 0.0], [0.026 * S, 0.024 * S, 0.3 * S], 0.004 * S), { op: 'paint', band: 0.001, paint: paint('gold', buckle) })];
  const sh = garmentShape('belt', ctx, over * S, region, { paintBase: paint('leather', color), prims, folds: studs ? (x, y, z) => 0.0025 * S * (Math.abs(Math.sin(Math.atan2(x, z) * 14)) > 0.9 ? 1 : 0) * Math.exp(-(((y - y0) / (0.008 * S)) ** 2)) : null });
  addGarment(ctx, 'belt', sh, [-0.32 * S * L.W, y0 - 0.06 * S, -0.3 * S, 0.32 * S * L.W, y0 + 0.06 * S, 0.3 * S], { step: 0.0085 });
}

/** Trousers to the boot tops (`cuff` 0 knee .. 1 ankle). */
export function trousers(ctx, color, { cuff = 0.88, kind = 'cloth', thick = 0.005 } = {}) {
  const L = ctx.L, S = L.S, top = L.waist + 0.01 * S;
  const region = legsRegion(L, { top, cuff });
  const folds = clothFolds(0.0022 * S, 24, { rings: ['L', 'R'].map(s => ({ y: L.leg[s].kn[1], w: 0.04 * S, freq: 170, amp: 0.0012 * S })) });
  const sh = garmentShape('trousers', ctx, thick * S, region, { paintBase: paint(kind, color), folds });
  addGarment(ctx, 'trousers', sh, legBounds(L, top), { step: 0.0135 });
}

/** Boots: leather to mid-calf with a sole, a turned cuff and optional fur. */
export function boots(ctx, color, { height = 0.55, fur = null, heavy = false } = {}) {
  const L = ctx.L, S = L.S;
  for (const s of ['L', 'R']) {
    const G = L.leg[s], shin = Math.hypot(...sub(G.an, G.kn));
    const topP = addv(G.an, G.low, -shin * height);
    const region = (x, y, z) => Math.max(planeDist(topP, G.low.map(v => -v))(x, y, z), Math.hypot(x - G.an[0], z - (G.an[2] + 0.05 * S)) - 0.2 * S);
    const prims = [Object.assign(roundBox([G.an[0], 0.012 * S, (G.an[2] + G.toe[2]) / 2 + 0.012 * S], [0.045 * S, 0.012 * S, 0.125 * S], 0.01 * S), { k: 0.012 * S, paint: paint('leather', shadeHex(color, -0.45)) })];
    const cuffRoll = (x, y, z) => 0.004 * S * Math.exp(-(((y - topP[1] + 0.012 * S) / (0.01 * S)) ** 2));
    const sh = garmentShape('boot', ctx, (heavy ? 0.009 : 0.0065) * S, region, { paintBase: paint('leather', color), prims, folds: (x, y, z) => cuffRoll(x, y, z) + noise3(x * 30, y * 30, z * 30) * 0.0012 * S });
    addGarment(ctx, 'boot', sh, [G.an[0] - 0.11 * S, -0.02, G.an[2] - 0.12 * S, G.an[0] + 0.11 * S, topP[1] + 0.05 * S, G.toe[2] + 0.12 * S], { step: 0.009 });
    if (fur) furRing(ctx, 'bootfur', topP, G.low, 0.075 * S, fur, { length: 0.06 * S });
  }
}

/** Soft shoes / slippers: low, turned-up toe. */
export function slippers(ctx, color) {
  const L = ctx.L, S = L.S;
  for (const s of ['L', 'R']) {
    const G = L.leg[s];
    const region = (x, y, z) => Math.max(y - (G.an[1] + 0.015 * S), Math.hypot(x - G.an[0], z - (G.an[2] + 0.06 * S)) - 0.2 * S);
    const sh = garmentShape('shoe', ctx, 0.005 * S, region, { paintBase: paint('cloth', color) });
    addGarment(ctx, 'shoe', sh, [G.an[0] - 0.1 * S, -0.02, G.an[2] - 0.12 * S, G.an[0] + 0.1 * S, G.an[1] + 0.06 * S, G.toe[2] + 0.1 * S], { step: 0.007 });
  }
}

/**
 * A ring of fur around a limb or the neck: a lumpy collar offset well out from the body, whose
 * clumps come from noise. `length` is how far down the limb it runs.
 */
export function furRing(ctx, name, at, dir, radius, color, { length = 0.06 } = {}) {
  const S = ctx.L.S, cap = capsuleDist(at, addv(at, dir, length), radius);
  const region = (x, y, z) => Math.max(cap(x, y, z), planeDist(at, dir.map(v => -v))(x, y, z), planeDist(addv(at, dir, length), dir)(x, y, z));
  const clumps = (x, y, z) => 0.008 * S * (noise3(x * 55, y * 55, z * 55) * 0.6 + noise3(x * 140, y * 140, z * 140) * 0.4) + 0.004 * S;
  const sh = garmentShape(name, ctx, 0.016 * S, region, { paintBase: paint('fur', color), folds: clumps });
  const lo = [0, 1, 2].map(i => Math.min(at[i], at[i] + dir[i] * length) - radius - 0.05), hi = [0, 1, 2].map(i => Math.max(at[i], at[i] + dir[i] * length) + radius + 0.05);
  addGarment(ctx, name, sh, [...lo, ...hi], { step: 0.007, simplify: 0.0014 });
}

/** A fur mantle over the shoulders and upper back (a pelt), optional on one shoulder only. */
export function furMantle(ctx, color, { sides = ['L', 'R'] } = {}) {
  const L = ctx.L, S = L.S;
  const zones = sides.map(s => { const A = L.arm[s]; return capsuleDist(addv(A.sh, [-A.sign * 0.06 * S, 0.06 * S, -0.02 * S]), addv(A.sh, A.up, 0.06 * S), 0.12 * S); });
  const back = (x, y, z) => Math.max(L.chest + 0.04 * S - y, z + 0.02 * S, Math.abs(x) - 0.2 * S, y - (L.neck + 0.01 * S));
  const region = (x, y, z) => { let d = back(x, y, z); for (const zf of zones) d = Math.min(d, zf(x, y, z)); return Math.max(d, L.chest - 0.02 * S - y, y - (L.neck + 0.05 * S)); };
  // fur: locks hanging down (noise stretched along y), with a finer layer of strands on top
  const clumps = (x, y, z) => 0.012 * S * (noise3(x * 34, y * 8, z * 34) * 0.6 + noise3(x * 110, y * 22, z * 110) * 0.4) + 0.008 * S;
  const sh = garmentShape('mantle', ctx, 0.03 * S, region, { paintBase: paint('fur', color), folds: clumps });
  addGarment(ctx, 'mantle', sh, [-L.shX - 0.2 * S, L.chest - 0.06 * S, -0.28 * S, L.shX + 0.2 * S, L.neck + 0.16 * S, 0.24 * S], { step: 0.009, simplify: 0.0016 });
}

/**
 * Leather straps crossing the chest and back (a harness), studded. Each strap is the body offset by a
 * few millimetres inside a capsule that follows the strap's path, which lays it flat on the skin.
 */
export function harness(ctx, color, { studs = '#9aa0a8' } = {}) {
  const L = ctx.L, S = L.S;
  const paths = [];
  // over the left shoulder, across the chest to the right hip, and the same across the back
  const shL = addv(L.arm.L.sh, [-0.05 * S, 0.05 * S, 0]);
  for (const zs of [1, -1]) paths.push([shL, [0.02 * S, L.chest + 0.06 * S, zs * 0.16 * S], [-0.15 * S, L.waist - 0.02 * S, zs * 0.08 * S]]);
  // lay every path point ON the skin (a muscular orc's chest is centimetres further out than a
  // human's), then sample the strap densely so it follows the curve between points too
  const onSkin = q => { const f = ctx.bodyFast || ctx.body.shape; let p = q.slice(); for (let it = 0; it < 4; it++) { const e = 0.003, d0 = f.eval(...p), g = [f.eval(p[0] + e, p[1], p[2]) - f.eval(p[0] - e, p[1], p[2]), f.eval(p[0], p[1] + e, p[2]) - f.eval(p[0], p[1] - e, p[2]), f.eval(p[0], p[1], p[2] + e) - f.eval(p[0], p[1], p[2] - e)], l = Math.hypot(...g) || 1; p = p.map((v, i) => v - g[i] / l * d0); } return p; };
  for (const p of paths) { const dense = []; for (let i = 0; i < p.length - 1; i++) for (let k = 0; k < 6; k++) dense.push(onSkin(p[i].map((v, j) => v + (p[i + 1][j] - v) * k / 6))); dense.push(onSkin(p[p.length - 1])); p.length = 0; p.push(...dense); }
  const caps = paths.flatMap(p => p.slice(1).map((b, i) => capsuleDist(p[i], b, 0.022 * S)));
  const region = minOf(...caps);
  const studPaint = paint('metal', studs);
  const prims = [];
  for (const p of paths) for (let i = 2; i < p.length - 1; i += 3) prims.push({ ...sphere(p[i], 0.02 * S), op: 'paint', band: 0.002, paint: studPaint });
  const studBumps = (x, y, z) => { let d = 0; for (const pr of prims) { const v = pr.d(x, y, z); if (v < 0) d = Math.max(d, 0.004 * S * Math.min(1, -v / (0.006 * S))); } return d * 0.5; };
  const sh = garmentShape('harness', ctx, 0.0055 * S, region, { paintBase: paint('leather', color), prims: prims.map(p => ({ ...p, d: (x, y, z) => p.d(x, y, z) + 0.012 * S })), folds: studBumps });
  addGarment(ctx, 'harness', sh, [-0.32 * S, L.waist - 0.08 * S, -0.3 * S, 0.32 * S, L.neck + 0.12 * S, 0.3 * S], { step: 0.0075 });
}

/** Cloth wraps round the forearms (or shins): spiral bands with ridges. */
export function wraps(ctx, color, { arms = true, legs = false } = {}) {
  const L = ctx.L, S = L.S;
  const limbs = [];
  if (arms) for (const s of ['L', 'R']) { const A = L.arm[s]; limbs.push([addv(A.el, A.fore, 0.06 * S), addv(A.wr, A.fore, 0.03 * S), A.fore]); }
  if (legs) for (const s of ['L', 'R']) { const G = L.leg[s]; limbs.push([addv(G.kn, G.low, 0.05 * S), addv(G.an, G.low, -0.02 * S), G.low]); }
  for (const [a, b, dir] of limbs) {
    const cap = capsuleDist(a, b, 0.07 * S);
    const region = (x, y, z) => Math.max(cap(x, y, z), planeDist(a, dir.map(v => -v))(x, y, z), planeDist(b, dir)(x, y, z));
    const ridges = (x, y, z) => { const u = dot(sub([x, y, z], a), dir) / S + Math.atan2(x - a[0], z - a[2]) * 0.004; return 0.0018 * S * Math.abs(Math.sin(u * 160)); };
    const sh = garmentShape('wrap', ctx, 0.0035 * S, region, { paintBase: paint('cloth', color, { detail: 0.9 }), folds: ridges });
    const lo = [0, 1, 2].map(i => Math.min(a[i], b[i]) - 0.08), hi = [0, 1, 2].map(i => Math.max(a[i], b[i]) + 0.08);
    addGarment(ctx, 'wrap', sh, [...lo, ...hi], { step: 0.0055 });
  }
}

/**
 * A short skirt of hanging panels (kilt, fur loincloth): front and back flaps over a band, ending at
 * `hem`, fur along the bottom when `fur` is set. Panels follow the skirt bones.
 */
export function kilt(ctx, color, { hemY = null, fur = null, kind = 'leather' } = {}) {
  const L = ctx.L, S = L.S, W = L.W, hem = hemY ?? (L.hip + L.knee) / 2 + 0.02 * S;
  const prims = [];
  const top = [0, L.pelvis + 0.0 * S, -0.005 * S], bot = [0, hem, 0.0];
  prims.push(Object.assign(cone(top, bot, 0.15 * S * W, 0.22 * S * W, { squash: [1.0, 0.8] }), { k: 0.05 * S, paint: paint(kind, color) }));
  // the panels are separated by slits at the sides (a flap in front, a flap behind)
  const slits = (x, y, z) => (y < L.hip - 0.02 * S && Math.abs(z) < 0.035 * S) ? 1 : -1;
  const zone = (x, y, z) => Math.max(hem - y, y - (L.waist - 0.02 * S), Math.hypot(x / (0.36 * S * W), z / (0.3 * S)) - 1, slits(x, y, z));
  const folds = (x, y, z) => noise3(x * 18, y * 4, z * 18) * 0.004 * S;
  const sh = garmentShape('kilt', ctx, 0.008 * S, zone, { paintBase: paint(kind, color), prims, folds });
  addGarment(ctx, 'kilt', sh, [-0.4 * S * W, hem - 0.05, -0.35 * S, 0.4 * S * W, L.waist + 0.04 * S, 0.35 * S],
    { step: 0.0095, weights: skirtWeights(ctx.R, ctx, { from: L.pelvis, to: L.knee }) });
  if (fur) {
    // a fur hem: a ring of clumps around the bottom of the skirt cone
    const fz = new Shape([], { name: 'kiltfur' });
    fz.add(Object.assign(cone([0, hem + 0.035 * S, 0], [0, hem - 0.015 * S, 0.005 * S], 0.235 * S * W, 0.255 * S * W, { squash: [1, 0.8] }), { k: 0, paint: paint('fur', fur) }));
    fz.add({ op: 'sub', k: 0.01 * S, box: null, d: (x, y, z) => -(Math.hypot(x / (0.19 * S * W), z / (0.15 * S)) - 1) });
    fz.add({ op: 'sub', k: 0, box: null, d: (x, y, z) => (y < L.hip - 0.02 * S && Math.abs(z) < 0.035 * S) ? -1 : 1 });
    fz.displace = (x, y, z) => 0.012 * S * (noise3(x * 45, y * 45, z * 45) * 0.6 + noise3(x * 120, y * 120, z * 120) * 0.4);
    ctx.asm.addField({ name: 'kiltfur', shape: fz, owner: ctx.body.shape, step: 0.008, simplify: 0.0014, covers: true, hideable: false,
      bounds: [-0.4 * S * W, hem - 0.06, -0.36 * S, 0.4 * S * W, hem + 0.08 * S, 0.36 * S], weights: skirtWeights(ctx.R, ctx, { from: L.pelvis, to: L.knee }) });
  }
}

export { jointWeights };
