// Chibi 3 armour: plate and mail, each piece a garment layer pushed well out from the body.
// No Three.js. See garments.js for how a garment is built.
//
// What makes plate read as plate rather than as grey clothes:
//   - thickness: 1.2-3.5 cm off the skin, which smooths the anatomy away the way a rigid shell does;
//   - LAMES: pauldrons and faulds are several bands, each tucked under the one above;
//   - rolled edges: a raised rim just inside every cut edge (displacement driven by the region's own
//     distance), and a ridge down the middle of the breastplate;
//   - the material: metal paint with polished worn edges (curvature-driven, assemble.js) and the
//     brushed/scratched detail tile;
//   - mail showing in the gaps (armpits, elbows, below the faulds), on its own chain-ring tile.

import {
  landmarks, torsoRegion, legsRegion, garmentShape, addGarment, capsuleDist, planeDist, minOf, maxOf, skirtWeights,
  torsoBounds, armBounds, legBounds, unionBounds, paint, shadeHex, addv, sub, unit, dot,
} from './garments.js';
import { smoothstep, sphere, cone, Shape } from './sdf.js';

/** A raised rolled rim just inside the edge of a region, plus any extra displacement. */
function rimmed(region, height = 0.0035, width = 0.006, extra = null) {
  return (x, y, z) => {
    const r = region(x, y, z);
    let d = r < 0 ? height * Math.exp(-(((r + width * 0.9) / width) ** 2)) : 0;
    if (extra) d += extra(x, y, z);
    return d;
  };
}

/** Knee-length (or `hem`) mail shirt with long sleeves. */
export function hauberk(ctx, color, { hem = null, sleeve = 1.8 } = {}) {
  const L = ctx.L, S = L.S, h = hem ?? L.hip - 0.2 * S;
  const region = torsoRegion(L, { hem: h, sleeve, neckline: 0.07, sleeveR: 0.11 });
  const sh = garmentShape('mail', ctx, 0.0055 * S, region, { paintBase: paint('chain', color) });
  addGarment(ctx, 'mail', sh, unionBounds(torsoBounds(L, h), armBounds(L)), { step: 0.014, weights: skirtWeights(ctx.R, ctx, { from: L.pelvis - 0.05 * S, to: L.knee }) });
}

/** Breastplate and backplate. */
export function cuirass(ctx, color) {
  const L = ctx.L, S = L.S;
  const lo = L.waist - 0.03 * S, hi = L.shoulder + 0.012 * S;
  const env = y => { const t = smoothstep(lo, L.chest + 0.08 * S, y); return (0.158 + 0.012 * t) * S * L.W; };
  const region = (x, y, z) => Math.max(lo - y, y - hi, Math.abs(x) - env(y), 0.088 * S - Math.hypot(x, (y - (L.neck + 0.02 * S)) * 0.75, z - 0.012 * S));
  // a ridge down the breastplate, and the lower edge flaring out a little over the faulds
  const ridge = (x, y, z) => (z > 0 ? 0.004 * S * Math.exp(-((x / (0.014 * S)) ** 2)) * smoothstep(lo, lo + 0.1 * S, y) : 0) + 0.006 * S * Math.exp(-(((y - lo) / (0.025 * S)) ** 2));
  const sh = garmentShape('cuirass', ctx, 0.02 * S, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.004 * S, 0.007 * S, ridge) });
  addGarment(ctx, 'cuirass', sh, torsoBounds(L, lo, 0.07), { step: 0.01 });
}

/** Hooped lames below the cuirass, each a little further out than the one above. */
export function faulds(ctx, color, { count = 3 } = {}) {
  const L = ctx.L, S = L.S, top = L.waist - 0.02 * S, h = 0.052 * S;
  for (let i = 0; i < count; i++) {
    const y1 = top - i * h * 0.86, y0 = y1 - h;
    const region = (x, y, z) => Math.max(y0 - y, y - y1, Math.abs(x) - 0.215 * S * L.W);
    const sh = garmentShape('fauld' + i, ctx, (0.024 + i * 0.006) * S, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.003 * S, 0.006 * S) });
    addGarment(ctx, 'fauld', sh, [-0.3 * S * L.W, y0 - 0.04, -0.25 * S, 0.3 * S * L.W, y1 + 0.04, 0.25 * S], { step: 0.01,
      weights: skirtWeights(ctx.R, ctx, { from: L.pelvis + 0.02 * S, to: L.hip - 0.2 * S }) });
  }
}

/**
 * Pauldron: a domed shoulder cap and lames stepping down the upper arm, each tucked under the one
 * above. `spikes` adds a row of spikes (the orc's war pauldron); `haute` the raised neck guard.
 */
export function pauldron(ctx, side, color, { lames = 2, size = 1, spikes = 0, haute = false } = {}) {
  const L = ctx.L, S = L.S, A = L.arm[side], s = A.sign;
  const top = addv(A.sh, [s * 0.01 * S, 0.055 * S, 0]);
  const dome = 0.135 * S * size, step = 0.045 * S * size;
  const zone = capsuleDist(addv(A.sh, [-s * 0.07 * S, 0.03 * S, 0]), addv(A.sh, A.up, 0.17 * S * size), dome);
  if (spikes) {
    // spikes are their own small layer: inside the pauldron's region they would be cut off
    const sp = new Shape([], { name: 'spikes' });
    for (let i = 0; i < spikes; i++) {
      const t = (i - (spikes - 1) / 2) * 0.9;
      const base = addv(top, [s * 0.02 * S, 0.012 * S, t * 0.05 * S]);
      sp.add(Object.assign(cone(base, addv(base, [s * 0.06 * S, 0.12 * S, t * 0.03 * S]), 0.022 * S, 0.0015 * S), { k: 0, paint: paint('metal', shadeHex(color, 0.15)) }));
    }
    ctx.asm.addField({ name: 'spikes', shape: sp, owner: ctx.body.shape, step: 0.0045, covers: false, hideable: false });
  }
  const prims = [];
  for (let i = 0; i <= lames; i++) {
    // lame 0 is the dome over the joint; 1.. step down the arm
    const u0 = i === 0 ? -1 : (i - 1) * step + 0.02 * S, u1 = i === 0 ? 0.025 * S : u0 + step * 1.25;
    const along = (x, y, z) => (x - top[0]) * A.up[0] + (y - top[1]) * A.up[1] + (z - top[2]) * A.up[2];
    const region = (x, y, z) => Math.max(zone(x, y, z), u0 - along(x, y, z), along(x, y, z) - u1, (s * x < 0.07 * S) ? 1 : -1);
    const off = (0.034 - i * 0.005) * S * size;
    let extra = null;
    if (i === 0 && haute) extra = (x, y, z) => 0.012 * S * Math.exp(-(((s * x - 0.12 * S) / (0.008 * S)) ** 2)) * smoothstep(L.shoulder - 0.01 * S, L.shoulder + 0.05 * S, y);
    const sh = garmentShape('pauldron' + i, ctx, off, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.0035 * S, 0.006 * S, extra), prims: i === 0 ? prims : [] });
    const b = [Math.min(top[0], A.el[0]) - 0.16 * S, A.el[1] - 0.04, -0.19 * S, Math.max(top[0], A.el[0]) + 0.16 * S, top[1] + 0.16 * S, 0.19 * S];
    addGarment(ctx, 'pauldron', sh, b, { step: 0.0095 });
  }
}


/** Upper arm tube, elbow cop with its fan, forearm tube. */
export function armHarness(ctx, side, color, { rerebrace = true, couter = true, vambrace = true } = {}) {
  const L = ctx.L, S = L.S, A = L.arm[side], s = A.sign;
  const tube = (name, a, b, r, off, cutA, cutB) => {
    const cap = capsuleDist(a, b, r), dir = unit(sub(b, a));
    const region = (x, y, z) => Math.max(cap(x, y, z), planeDist(cutA, dir.map(v => -v))(x, y, z), planeDist(cutB, dir)(x, y, z));
    const sh = garmentShape(name, ctx, off, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.003 * S, 0.005 * S) });
    const lo = [0, 1, 2].map(i => Math.min(a[i], b[i]) - r - 0.03), hi = [0, 1, 2].map(i => Math.max(a[i], b[i]) + r + 0.03);
    addGarment(ctx, name, sh, [...lo, ...hi], { step: 0.009 });
  };
  const upLen = Math.hypot(...sub(A.el, A.sh)), foreLen = Math.hypot(...sub(A.wr, A.el));
  if (rerebrace) tube('rerebrace', A.sh, A.el, 0.085 * S, 0.012 * S, addv(A.sh, A.up, upLen * 0.38), addv(A.sh, A.up, upLen * 0.86));
  if (vambrace) tube('vambrace', A.el, A.wr, 0.075 * S, 0.011 * S, addv(A.el, A.fore, foreLen * 0.16), addv(A.el, A.fore, foreLen * 0.9));
  if (couter) {
    const c = addv(A.el, [0, 0, -0.012 * S]);
    const ball = (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - 0.062 * S;
    // the cop covers the back and outside of the elbow; its fan spreads on the outer side
    const region = (x, y, z) => Math.max(ball(x, y, z), z - c[2] - 0.022 * S);
    const fan = (x, y, z) => 0.012 * S * Math.exp(-(((s * (x - c[0]) - 0.045 * S) / (0.014 * S)) ** 2) - (((y - c[1]) / (0.03 * S)) ** 2));
    const sh = garmentShape('couter', ctx, 0.018 * S, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.003 * S, 0.005 * S, fan) });
    addGarment(ctx, 'couter', sh, [c[0] - 0.11 * S, c[1] - 0.11 * S, c[2] - 0.11 * S, c[0] + 0.11 * S, c[1] + 0.11 * S, c[2] + 0.11 * S], { step: 0.0075 });
  }
}

/** Glove (leather, fingers kept) and a flared metal cuff. */
export function gauntlet(ctx, side, glove, cuffColor) {
  const L = ctx.L, S = L.S, A = L.arm[side], foreLen = Math.hypot(...sub(A.wr, A.el));
  const start = addv(A.wr, A.fore, -0.02 * S);
  const region = (x, y, z) => Math.max(planeDist(start, A.fore.map(v => -v))(x, y, z), Math.hypot(x - A.wr[0], y - A.wr[1], z - A.wr[2]) - 0.26 * S);
  const sh = garmentShape('glove', ctx, 0.0022 * S, region, { paintBase: paint('leather', glove, { detail: 0.6 }) });
  const c = addv(A.wr, A.fore, 0.09 * S);
  addGarment(ctx, 'glove', sh, [c[0] - 0.13 * S, c[1] - 0.14 * S, c[2] - 0.11 * S, c[0] + 0.13 * S, c[1] + 0.14 * S, c[2] + 0.11 * S], { step: 0.005, hideDepth: 0.0012 });
  if (cuffColor) {
    const a = addv(A.wr, A.fore, -foreLen * 0.22), b = addv(A.wr, A.fore, 0.012 * S);
    const cap = capsuleDist(a, b, 0.07 * S);
    const region2 = (x, y, z) => Math.max(cap(x, y, z), planeDist(a, A.fore.map(v => -v))(x, y, z), planeDist(b, A.fore)(x, y, z));
    // the cuff flares toward the hand
    const flare = (x, y, z) => 0.012 * S * smoothstep(a[1], b[1], y) * 0 + 0.01 * S * Math.max(0, dot(sub([x, y, z], a), A.fore) / (foreLen * 0.24));
    const sh2 = garmentShape('cuff', ctx, 0.012 * S, region2, { paintBase: paint('metal', cuffColor), folds: rimmed(region2, 0.0025 * S, 0.004 * S, flare) });
    addGarment(ctx, 'cuff', sh2, [Math.min(a[0], b[0]) - 0.1, Math.min(a[1], b[1]) - 0.1, Math.min(a[2], b[2]) - 0.1, Math.max(a[0], b[0]) + 0.1, Math.max(a[1], b[1]) + 0.1, Math.max(a[2], b[2]) + 0.1], { step: 0.0075 });
  }
}

/** Thigh plates (front), knee cops with side wings, full greaves. */
export function legHarness(ctx, side, color) {
  const L = ctx.L, S = L.S, G = L.leg[side], s = G.sign;
  const thighLen = Math.hypot(...sub(G.kn, G.hp)), shinLen = Math.hypot(...sub(G.an, G.kn));
  {
    const a = addv(G.hp, G.up, thighLen * 0.12), b = addv(G.hp, G.up, thighLen * 0.86), cap = capsuleDist(a, b, 0.13 * S);
    const region = (x, y, z) => Math.max(cap(x, y, z), planeDist(a, G.up.map(v => -v))(x, y, z), planeDist(b, G.up)(x, y, z), -0.015 * S - (z - G.hp[2]) );
    const sh = garmentShape('cuisse', ctx, 0.013 * S, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.003 * S, 0.005 * S) });
    addGarment(ctx, 'cuisse', sh, [G.kn[0] - 0.16 * S, G.kn[1] - 0.02, -0.2 * S, G.kn[0] + 0.16 * S, G.hp[1] + 0.06, 0.24 * S], { step: 0.0095 });
  }
  {
    const c = addv(G.kn, [0, 0.008 * S, 0.02 * S]);
    const region = (x, y, z) => Math.max(Math.hypot(x - c[0], (y - c[1]) * 0.85, z - c[2]) - 0.068 * S, c[2] - 0.035 * S - z);
    const wing = (x, y, z) => 0.012 * S * Math.exp(-(((s * (x - c[0]) - 0.05 * S) / (0.016 * S)) ** 2) - (((y - c[1]) / (0.035 * S)) ** 2));
    const sh = garmentShape('poleyn', ctx, 0.02 * S, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.003 * S, 0.005 * S, wing) });
    addGarment(ctx, 'poleyn', sh, [c[0] - 0.12 * S, c[1] - 0.12 * S, c[2] - 0.12 * S, c[0] + 0.12 * S, c[1] + 0.12 * S, c[2] + 0.13 * S], { step: 0.0075 });
  }
  {
    const a = addv(G.kn, G.low, shinLen * 0.1), b = addv(G.kn, G.low, shinLen * 0.93), cap = capsuleDist(a, b, 0.1 * S);
    const region = (x, y, z) => Math.max(cap(x, y, z), planeDist(a, G.low.map(v => -v))(x, y, z), planeDist(b, G.low)(x, y, z));
    // a crease down the front of the shin plate
    const crease = (x, y, z) => z > G.kn[2] ? 0.003 * S * Math.exp(-(((x - G.kn[0]) / (0.012 * S)) ** 2)) : 0;
    const sh = garmentShape('greave', ctx, 0.012 * S, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.003 * S, 0.005 * S, crease) });
    addGarment(ctx, 'greave', sh, [G.an[0] - 0.13 * S, G.an[1] - 0.02, -0.15 * S, G.an[0] + 0.13 * S, G.kn[1] + 0.02, 0.17 * S], { step: 0.0095 });
  }
}

/** Plate shoes: lames over the top of the foot, a pointed toe. */
export function sabaton(ctx, side, color) {
  const L = ctx.L, S = L.S, G = L.leg[side];
  const region = (x, y, z) => Math.max(y - (G.an[1] + 0.06 * S), Math.hypot(x - G.an[0], z - (G.an[2] + 0.07 * S)) - 0.2 * S);
  // lames: shallow grooves across the top of the foot
  const lames = (x, y, z) => { const u = (z - G.an[2]) / (0.032 * S); return z > G.an[2] + 0.02 * S ? -0.0018 * S * Math.exp(-(((u - Math.round(u)) / 0.12) ** 2)) : 0; };
  const sh = garmentShape('sabaton', ctx, 0.011 * S, region, { paintBase: paint('metal', color), folds: rimmed(region, 0.0025 * S, 0.005 * S, lames),
    prims: [Object.assign(sphere([G.toe[0], 0.022 * S, G.toe[2] + 0.07 * S], 0.022 * S), { k: 0.03 * S, paint: paint('metal', color) })] });
  addGarment(ctx, 'sabaton', sh, [G.an[0] - 0.11 * S, -0.02, G.an[2] - 0.12 * S, G.an[0] + 0.11 * S, G.an[1] + 0.09 * S, G.toe[2] + 0.13 * S], { step: 0.009 });
}

export { landmarks };
