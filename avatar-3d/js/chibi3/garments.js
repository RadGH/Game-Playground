// Chibi 3 garments: clothes and armour as layers OFFSET from the body. No Three.js.
//
// A garment is "the body, pushed out by a few millimetres, kept only inside a region":
//
//     garment(p) = max( body(p) - thickness,  region(p) )
//
// so it fits every race and every body dial without a single per-body number, and its hem, cuff
// and neckline are clean cut edges with real thickness. Plate armour is the same idea pushed out
// further (1-3 cm), which rounds away the anatomy underneath the way a rigid plate would. Lames
// (the overlapping bands of a pauldron or a fauld) are several thin bands, each a little further out
// than the one above.
//
// Regions are built from the rig's own joints (rig.js), so they follow proportions too.

import { Shape, sphere, ellipsoid, cone, roundBox, noise3, smoothstep } from './sdf.js';
import { paint, shadeHex, mixHex } from './paint.js';
import { jointWeights, chainWeights, mixWeights } from './skin.js';

// ------------------------------------------------------------------ small vector helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Distance to a capsule (segment a-b, radius r); negative inside. */
export function capsuleDist(a, b, r) {
  const d = sub(b, a), l2 = dot(d, d);
  return (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    let t = (px * d[0] + py * d[1] + pz * d[2]) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - d[0] * t, qy = py - d[1] * t, qz = pz - d[2] * t;
    return Math.sqrt(qx * qx + qy * qy + qz * qz) - r;
  };
}
/** Signed distance past a plane through `p` facing `n` (positive on the side n points to). */
export const planeDist = (p, n) => { const u = unit(n), px = p[0], py = p[1], pz = p[2], ux = u[0], uy = u[1], uz = u[2]; return (x, y, z) => (x - px) * ux + (y - py) * uy + (z - pz) * uz; };
export const minOf = (...fs) => (x, y, z) => { let d = 1e9; for (const f of fs) { const v = f(x, y, z); if (v < d) d = v; } return d; };
export const maxOf = (...fs) => (x, y, z) => { let d = -1e9; for (const f of fs) { const v = f(x, y, z); if (v > d) d = v; } return d; };

/**
 * Landmarks every garment builder uses, read off the rig.
 */
export function landmarks(R) {
  const J = n => R.byName[n].pos, S = R.P.S, W = R.P.width;
  const L = {
    S, W, J,
    hip: R.hipY, pelvis: R.pelvisY, waist: R.spineY - 0.01 * S, chest: R.chestY, neck: R.neckY, shoulder: R.shoulderY, head: R.headY,
    knee: R.kneeY, ankle: R.ankleY, shX: R.shoulderX,
    arm: {}, leg: {},
  };
  for (const s of ['L', 'R']) {
    const sh = J('upperArm' + s), el = J('foreArm' + s), wr = J('hand' + s);
    L.arm[s] = { sh, el, wr, up: unit(sub(el, sh)), fore: unit(sub(wr, el)), sign: s === 'L' ? 1 : -1 };
    const hp = J('thigh' + s), kn = J('shin' + s), an = J('foot' + s), toe = J('toe' + s);
    L.leg[s] = { hp, kn, an, toe, up: unit(sub(kn, hp)), low: unit(sub(an, kn)), sign: s === 'L' ? 1 : -1 };
  }
  return L;
}

/**
 * The torso region: a vertical slab from `hem` to `top`, no wider than the torso envelope (so arms
 * hanging beside it are left out), plus sleeves down each arm to `sleeve` (0 = none, 1 = the elbow,
 * 2 = the wrist; fractions between). `neckline` cuts a scoop around the neck.
 */
export function torsoRegion(L, { hem, top = null, sleeve = 0, neckline = 0.075, sleeveR = 0.1, open = 0 }) {
  const S = L.S, topY = top ?? L.neck + 0.03 * S;
  const xLim = y => { const t = smoothstep(L.hip, L.chest + 0.05 * S, y); return (0.17 + 0.03 * t) * S * L.W + t * 0.01 * S; };
  const neck = [0, L.neck + 0.02 * S, 0.0];
  const parts = [(x, y, z) => Math.max(hem - y, y - topY, Math.abs(x) - xLim(y), neckline > 0 ? neckline * S - Math.hypot(x, (y - neck[1]) * 0.8, z - 0.01 * S) : -1)];
  if (sleeve > 0) for (const s of ['L', 'R']) {
    const A = L.arm[s];
    const end = sleeve <= 1 ? addv(A.sh, A.up, Math.hypot(...sub(A.el, A.sh)) * sleeve) : addv(A.el, A.fore, Math.hypot(...sub(A.wr, A.el)) * (sleeve - 1));
    const dir = sleeve <= 1 ? A.up : A.fore;
    // starts above and inside the joint, so its rounded end covers the whole shoulder cap
    const inner = addv(A.sh, [-A.sign * 0.05 * S, 0.05 * S, 0]);
    const cap = capsuleDist(inner, end, sleeveR * S), cut = planeDist(end, dir);
    // the sleeve cut only applies past the shoulder: above it the torso slab decides
    parts.push((x, y, z) => Math.max(cap(x, y, z), cut(x, y, z), y - (L.shoulder + 0.13 * S)));
  }
  const f = minOf(...parts);
  // which part a point belongs to ('torso', 'L', 'R'): a sleeve takes its bones from its own arm,
  // and the torso part never from an arm (see addGarment)
  const names = ['torso', ...(sleeve > 0 ? ['L', 'R'] : [])];
  f.partAt = (x, y, z) => { let best = 0, bd = 1e9; parts.forEach((p, i) => { const v = p(x, y, z); if (v < bd) { bd = v; best = i; } }); return names[best]; };
  return f;
}

/** Leg region for trousers: hips from `top` down to the crotch, legs down to `cuff` (0 knee .. 1 ankle). */
export function legsRegion(L, { top, cuff = 1, legR = 0.13, cuffOver = 0 }) {
  const S = L.S, parts = [(x, y, z) => Math.max(y - top, L.hip - 0.12 * S - y, Math.abs(x) - 0.24 * S * L.W)];
  for (const s of ['L', 'R']) {
    const G = L.leg[s];
    const end = addv(G.kn, G.low, Math.hypot(...sub(G.an, G.kn)) * cuff + cuffOver);
    const cap = capsuleDist(addv(G.hp, [0, 0.05 * S, 0]), end, legR * S), cut = planeDist(end, G.low);
    parts.push((x, y, z) => Math.max(cap(x, y, z), cut(x, y, z), y - top));
  }
  return minOf(...parts);
}

/** A garment shape: the body offset by `t` metres inside `region`, plus optional folds. */
export function garmentShape(name, ctx, t, region, { folds = null, paintBase, prims = [] } = {}) {
  const sh = new Shape([], { name, base: ctx.body.shape, baseFast: ctx.bodyFast, offset: -t, basePaint: paintBase, displace: folds });
  sh.region = region;
  for (const p of prims) sh.add(p);
  sh.add({ op: 'inter', k: 0, box: null, d: region });
  return sh;
}

/** Cloth folds: soft, anisotropic noise (long along `axis`), plus compression rings near joints. */
export function clothFolds(amp, scale = 22, { axis = 'y', rings = [] } = {}) {
  return (x, y, z) => {
    let n;
    if (axis === 'y') n = noise3(x * scale, y * scale * 0.25, z * scale);
    else n = noise3(x * scale * 0.4, y * scale, z * scale * 0.4);
    let d = n * amp;
    for (const r of rings) { const k = Math.exp(-(((y - r.y) / r.w) ** 2)); if (k > 0.01) d += Math.sin(y * r.freq + x * 7) * r.amp * k; }
    return d;
  };
}

// ------------------------------------------------------------------ skirt weights
/**
 * Below the waist a long garment follows the skirt bones (front/back/left/right) more and more,
 * the legs less and less — a robe is draped over the legs, not glued to them.
 */
export function skirtWeights(R, ctx, { from, to }) {
  const idx = n => R.byName[n].index;
  const panels = [['skirtF', 0], ['skirtL', Math.PI / 2], ['skirtB', Math.PI], ['skirtR', -Math.PI / 2]];
  return (x, y, z, owner, px = x, py = y, pz = z) => {
    const body = jointWeights(R, px, py, pz, owner || 'pelvis');
    const t = smoothstep(from, to, y);
    if (t <= 0.001) return body;
    const ang = Math.atan2(x, z);
    const panelList = [];
    let sum = 0;
    for (const [name, a] of panels) {
      let d = Math.abs(ang - a); if (d > Math.PI) d = 2 * Math.PI - d;
      const w = Math.max(0, Math.cos(d)) ** 2; if (w < 0.01) continue;
      const down = Math.max(0, Math.min(1, (from - y) / (from - ctx.L.ankle)));
      for (const [i, cw] of chainWeights(R, [name + '1', name + '2'], down, null)) panelList.push([i, cw * w]);
      sum += w;
    }
    const panel = panelList.map(([i, w]) => [i, w / (sum || 1)]);
    // the pelvis keeps a share at the top so the waistband never tears away, and the legs keep a
    // third all the way down so a stride carries the cloth with it instead of through it
    return mixWeights(body, mixWeights([[idx('pelvis'), 1]], panel, Math.min(1, t * 1.6)), t * 0.68);
  };
}

// ------------------------------------------------------------------ the builders
// Each takes ctx = { a, R, L, body, bodyFast, asm, lod } and adds layers to ctx.asm.

/** The arm bone nearest a point (upper arm, forearm or hand), by distance to the bone segments. */
export function armOwner(L, side, x, y, z) {
  const A = L.arm[side], segs = [['upperArm', A.sh, A.el], ['foreArm', A.el, A.wr], ['hand', A.wr, addv(A.wr, A.fore, 0.1 * L.S)]];
  let best = 'upperArm', bd = 1e9;
  for (const [n, a, b] of segs) { const d = capsuleDist(a, b, 0)(x, y, z); if (d < bd) { bd = d; best = n; } }
  return best + side;
}
const ARM = /^(clav|upperArm|foreArm|hand|thumb|index|middle|ring)/;

/**
 * Add a garment layer with the usual options. When the garment's region knows its parts (a torso and
 * sleeves), a sleeve vertex is owned by the nearest bone of ITS arm, and a torso vertex never by an
 * arm: a bell sleeve hanging beside the hip would otherwise borrow the hip's bones and tear, and a
 * tabard's shoulder would lift with the arm.
 */
export function addGarment(ctx, name, shape, bounds, opts = {}) {
  const R = ctx.R, base = opts.weights || ((x, y, z, owner, px, py, pz) => jointWeights(R, px, py, pz, owner || 'chest'));
  const partAt = shape.region?.partAt;
  const weights = partAt ? (x, y, z, owner, px = x, py = y, pz = z) => {
    const part = partAt(x, y, z);
    if (part === 'L' || part === 'R') { const o = armOwner(ctx.L, part, x, y, z); return base(x, y, z, o, x, y, z); }
    if (owner && ARM.test(owner)) return base(x, y, z, owner.startsWith('clav') ? owner : 'chest', px, py, pz);
    return base(x, y, z, owner, px, py, pz);
  } : base;
  ctx.asm.addField({ name, shape, owner: ctx.body.shape, step: opts.step ?? 0.011, bounds, covers: opts.covers ?? true, hideable: opts.hideable ?? true, simplify: opts.simplify,
    hideDepth: opts.hideDepth, weights, aoStrength: opts.ao ?? 1, minLod: opts.minLod, maxLod: opts.maxLod });
}

export function torsoBounds(L, hem, extra = 0.06) { const S = L.S; return [-(L.shX + 0.17 * S + extra), hem - 0.03 * S, -0.24 * S - extra, L.shX + 0.17 * S + extra, L.neck + 0.08 * S, 0.24 * S + extra]; }
export function armBounds(L, extra = 0.05) {
  const xs = [], ys = [], zs = [];
  for (const s of ['L', 'R']) for (const p of [L.arm[s].sh, L.arm[s].el, L.arm[s].wr]) { xs.push(p[0]); ys.push(p[1]); zs.push(p[2]); }
  return [Math.min(...xs) - extra, Math.min(...ys) - extra, Math.min(...zs) - extra - 0.03, Math.max(...xs) + extra, Math.max(...ys) + extra, Math.max(...zs) + extra + 0.03];
}
export function legBounds(L, top, extra = 0.06) { const S = L.S; return [-0.3 * S * L.W - extra, -0.02, -0.2 * S - extra, 0.3 * S * L.W + extra, top + 0.03 * S, 0.26 * S + extra]; }
export const unionBounds = (...bs) => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])]);

export { paint, shadeHex, mixHex, sphere, ellipsoid, cone, roundBox, Shape, addv, sub, unit, dot };
