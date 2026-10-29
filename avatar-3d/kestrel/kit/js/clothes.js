// Kestrel kit — clothing on the Kestrel body (Thousandvale batch 4, 2026-10-28).
//
// Reads clothes-catalog.js rows (what each top / bottom / pair of shoes / pair of gloves covers and is made of) and
// writes surface specs for geo.js MeshBuilder — the same "surface API" every other piece uses (README): a garment is
// the body part's own `at(u, θ)` sampled again over part of its range and pushed out, so it carries the body's skin
// weights and moves with it in every clip. On top of that:
//
//   SHELL   a top's torso. Rows run in REAL height from its hem up to its neckline; each point is the torso skin point
//           (relief smoothed) pushed out along the skin's own normal by the layer's thickness. Below the hip joint the
//           shell becomes a SKIRT: its radius in each direction is the larger of the torso's (plus the layer) and the
//           convex hull of both legs with their trousers and boots (support function, so it encloses them), never
//           narrowing on the way down, belled out by `flare`, and its weights hand over from the hips to the skirt bones
//           (skirt.js). One surface from hem to collar, so there is no ledge where a robe's body meets its skirt.
//   LAYERS  skin < underwear < trousers < shirt / tunic < mail / coat / robe < plate < belt / cape / pack. Each layer is
//           thicker than the one under it wherever they overlap (LAYER_OFFSET), and the skin / inner layer it FULLY
//           covers is tagged with a cover bit and dropped at finish (no poke-through; the dropped triangles pay for the
//           garment). `cover(part, u, θ, p)` gives the bits for the body skin and the underwear.
//   EXTRAS  pauldrons, tassets, knee cops, greaves, cuisses, collars, cuffs, bracers, belts, sashes, aprons, straps,
//           wraps: separate surfaces, each sampled off the body part (or the garment) it rides, so they deform with it.
//   RELIEF  seams, quilting, mail rings, scales, plate highlights and lames, rivets, laces, buttons, fur: vertex colour
//           (+ small pads where the rows are dense enough). Metal is a negative glow (material.js: metalness).
//
//   const CL = planClothes({ P, parts, fit, clothes: n.clothes, hands, lod });
//   CL.parts (surface specs), CL.hide (cover bits), CL.cover(part, u, θ, p), CL.handMask(name), CL.outer (for the
//   gear bridge), CL.skirt (skirt.js profile, or null), CL.worn (face-acc / legacy flags).
import { clamp, lerp, smooth, gauss, adiff, cmul, cmix, hexLin, add, sub, mul, norm, cross, dot, table, superR } from './kmath.js';
import { COVER } from './geo.js';
import { handParts } from './body.js';
import { LAYER_OFFSET, FIT_OFFSET, HEM_LEVEL, skirtOf, strideOf } from './clothes-catalog.js';
import { skirtWeights, HAND, LEG_A } from './skirt.js';

const PI = Math.PI, TAU = PI * 2;
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Cover bits (geo.js COVER uses 1..64, faces 1<<23 up). */
export const CLOTH_COVER = {
  TOP: 1 << 7,       // under a top's shell / sleeves
  BOT: 1 << 8,       // under trousers / a bottom skirt's waist / stockings
  SHOE: 1 << 9,      // leg skin inside a shoe's shaft
  GLOVE: 1 << 10,    // hand skin inside a glove
  ROBE: 1 << 11,     // thighs (skin, briefs, trousers) inside a closed long skirt
  TOPOVER: 1 << 12,  // a trousers' / bottom skirt's waist under the top's shell
  SHAFT: 1 << 13,    // trousers / stockings inside a boot shaft
  GREAVE: 1 << 14,   // a boot shaft under a greave
  CUFF: 1 << 15,     // a sleeve's end inside a glove cuff
};
export const CLOTH_ALL = Object.values(CLOTH_COVER).reduce((a, b) => a | b, 0);

// ------------------------------------------------------------------------------------------- colour + material
const sat = (c, s = 1.08) => { const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map(v => Math.max(0, L + (v - L) * s)); };
const lift = (c, k) => cmix(c, [1, 1, 1], k);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
/** roughness, glow (negative = metalness) per material */
const MAT = {
  cloth: [0.9, 0], linen: [0.93, 0], silk: [0.48, 0], leather: [0.6, 0], fur: [1, 0], quilt: [0.9, 0],
  mail: [0.5, -0.5], scale: [0.36, -0.68], plate: [0.27, -0.82], brigandine: [0.72, 0],
};
const DEFAULT_COLOR = { cloth: '#6a6458', linen: '#cdbf9f', silk: '#7a3a5a', leather: '#6a4a30', fur: '#8a7458', quilt: '#8a7a5a', mail: '#8a9098', scale: '#7a8a7a', plate: '#a0a8b2', brigandine: '#5a4a3a' };
const GOLD = hexLin('#c8a040');

/** A material's paint at a surface point. (x, y) = an across / up position in metres on the piece (any origin). */
function paint(mat, base, x, y, n = 0) {
  switch (mat) {
    // mail: the rings are smaller than the vertex spacing, so they are a grain — every vertex its own brightness, with
    // darker courses every ~2.5 cm (the rows the rings hang in)
    case 'mail': { const course = ((y / 0.025) % 1 + 1) % 1; return cmul(lift(base, 0.06), 0.55 + 0.6 * hash(x * 91.7, y * 57.3) - 0.18 * gauss(course - 0.5, 0.18)); }
    case 'scale': { const row = y / 0.024, fr = row - Math.floor(row), col = x / 0.03 + (Math.floor(row) % 2) * 0.5, fc = col - Math.floor(col); return cmul(base, 0.7 + 0.45 * fr * (1 - 0.6 * Math.abs(fc - 0.5))); }
    case 'plate': return cmul(base, 1 + 0.04 * (hash(x * 3, y * 3) - 0.5));
    case 'leather': return cmul(base, 0.92 + 0.12 * hash(Math.floor(x / 0.02), Math.floor(y / 0.02)));
    case 'fur': return cmul(lift(base, 0.08 * hash(x * 7, y * 7)), 0.78 + 0.4 * hash(x * 13 + 1, y * 13));
    case 'quilt': { const a = Math.abs(Math.sin((x + y) / 0.045 * PI)), b = Math.abs(Math.sin((x - y) / 0.045 * PI)); return cmul(base, 0.8 + 0.2 * Math.min(1, Math.min(a, b) * 3)); }
    case 'linen': return cmul(base, 0.96 + 0.06 * hash(x * 5, y * 5));
    case 'silk': return cmul(base, 1 + 0.06 * Math.sin(x * 40 + y * 12));
    case 'brigandine': { const st = gauss(((x / 0.035) % 1 + 1) % 1 - 0.5, 0.12) * gauss(((y / 0.035) % 1 + 1) % 1 - 0.5, 0.12); return cmix(cmul(base, 0.95), [0.78, 0.72, 0.6], st * 0.85); }
    default: return cmul(base, 0.97 + 0.05 * hash(Math.floor(x / 0.03), Math.floor(y / 0.03)));
  }
}

// ------------------------------------------------------------------------------------------- the plan
export function planClothes({ P, parts, fit, clothes, hands, lod = 0, colors = null }) {
  const out = [], k = P.k, fem = P.fem, C = CLOTH_COVER;
  const T = parts.torso, Ar = { L: parts.armL, R: parts.armR }, Lg = { L: parts.legL, R: parts.legR };
  const lodPush = lod ? 0.0045 : 0;   // (lodSpec pushes every garment spec out by this at LOD 1; points placed by hand follow it)
  const shoulderEnd = {};
  const top = clothes?.top || null, bot = clothes?.bottom || null, sho = clothes?.shoes || null, glo = clothes?.gloves || null;
  const tr = top?.row || null, br = bot?.row || null, sr = sho?.row || null, gr = glo?.row || null;
  const collared = !!tr && !tr.bare && (['high', 'gorget', 'fur', 'hood'].includes(tr.neck) || tr.extras.includes('hoodDown'));
  const HL = HEM_LEVEL[fem ? 'fem' : 'masc'];
  const hemY = name => (HL[name] ?? HL.hip) * k;
  const col = (part, which = 'main') => {
    if (!part) return [0.5, 0.5, 0.5];
    const mat = part.row.mat || 'cloth';
    const main = sat(hexLin(part.color || DEFAULT_COLOR[mat] || '#6a6458'));
    if (which === 'main') return main;
    if (part.color2) return sat(hexLin(part.color2));
    if (part.quality >= 2) return GOLD;
    return mat === 'plate' || mat === 'mail' || mat === 'scale' ? lift(main, 0.25) : cmul(main, 0.62);
  };
  const matOf = part => MAT[part?.row.mat || 'cloth'] || MAT.cloth;

  // ---- the levels everything is measured against (REAL heights unless marked v1)
  const leg = Lg.R, arm = Ar.R;
  const yJoin = P.hipY + 0.06 * P.k;                                 // above: the torso shell; below: the skirt part
  const yS = yJoin;
  const torsoBotReal = T.yBot - 0.004, torsoTopReal = T.yTop;
  const pantsTopV = (fem ? 1.0 : 1.04) * k, pantsTopReal = P.yMap(pantsTopV);

  // trousers: how far down, how thick
  const bottomLeg = br && !br.skirt ? br : null;
  const legEnd0 = !bottomLeg ? null : bottomLeg.to === 'thigh' ? leg.sH + 0.42 * (leg.sK - leg.sH) : bottomLeg.to === 'knee' ? leg.sK + 0.07 * k : bottomLeg.to === 'shin' ? leg.sK + 0.62 * (leg.sA - leg.sK) : leg.sA - 0.03 * k;
  // trousers under a low shoe end a little way up inside it (tucked in): their hem never rides the ankle's bend
  const lowShaft = sr && sr.foot !== 'sandal' && sr.foot !== 'bare' && ['ankle', 'low'].includes(sr.shaft) ? { ankle: leg.sA - 0.045 * k, low: leg.sA - 0.09 * k }[sr.shaft] : null;
  const legEnd = legEnd0 != null && lowShaft != null && legEnd0 > lowShaft + 0.008 ? lowShaft + 0.008 : legEnd0;
  const fitOff = FIT_OFFSET[bottomLeg?.fit || 'fit'];
  const pantsOff = (u) => !bottomLeg || u > legEnd + 0.01 ? 0 : lerp(fitOff[0], fitOff[1], smooth(leg.sK - 0.1, leg.sA, u)) + (bottomLeg.extras.includes('bloused') ? 0.012 * gauss(u - (sr && sr.shaft !== 'none' && sr.foot !== 'sandal' ? shaftTop - 0.035 : legEnd - 0.05), 0.04) : 0);
  // shoes: the shaft
  const shaftTop = !sr ? null : { none: leg.sA + 0.01, ankle: leg.sA - 0.045 * k, low: leg.sA - 0.09 * k, mid: leg.sA - 0.22 * k, calf: leg.sA - 0.31 * k, knee: leg.sK + 0.03 * k }[sr.shaft] ?? leg.sA - 0.22 * k;
  const footCovered = !!sr && sr.foot !== 'sandal' && sr.foot !== 'bare';
  const shaftOff = (u) => pantsOff(u) + (sr?.foot === 'heavy' || sr?.foot === 'sabaton' ? 0.018 : sr?.mat === 'cloth' || sr?.foot === 'wrap' ? 0.012 : 0.016) + (u < shaftTop + 0.012 && sr?.cuff ? 0.004 : 0);
  // greaves
  const hasGreave = !!bottomLeg && (bottomLeg.extras.includes('greaves'));
  const greave = hasGreave ? [leg.sK + 0.035 * k, leg.sA - 0.06 * k] : null;
  const greaveOff = u => Math.max(pantsOff(u), sr && u > shaftTop ? shaftOff(u) : 0) + 0.012;
  const legPad = (u) => Math.max(pantsOff(u), sr && u > shaftTop ? shaftOff(u) : 0, greave && u > greave[0] && u < greave[1] ? greaveOff(u) + 0.008 : 0);

  // ---- skirts: which surfaces hang below the crotch
  const skirtLv = skirtOf(clothes);
  const topSkirt = tr && ['seat', 'thigh', 'aboveKnee', 'knee', 'calf', 'floor'].includes(tr.hem) ? tr.hem : (tr && (tr.extras.includes('tassets') || tr.extras.includes('mailSkirt')) ? 'seat' : null);
  const botSkirt = br?.skirt || null;
  const topClosedLong = !!tr && !tr.open && ['knee', 'calf', 'floor'].includes(topSkirt);
  const botClosedLong = !!botSkirt && !botSkirt.arcs && ['knee', 'calf', 'floor'].includes(botSkirt.hem);
  // a closed top skirt at least as long as the bottom's makes the bottom skirt invisible: it is not built
  const order = ['seat', 'thigh', 'aboveKnee', 'knee', 'calf', 'floor'];
  const buildBotSkirt = !!botSkirt && !(tr && !tr.open && topSkirt && order.indexOf(topSkirt) >= order.indexOf(botSkirt.hem));
  const robeHide = (topClosedLong || (buildBotSkirt && botClosedLong)) ? leg.sK - 0.07 * k : null;   // thighs above this u are inside the cloth

  // ---- the leg hull (both legs + what is on them), per height, for skirts
  // (built the first time a skirt asks: most outfits have no skirt)
  let legCols = null;
  const legColumns = () => {
    if (legCols) return legCols;
    legCols = [];
    for (const s of ['L', 'R']) {
      const L = Lg[s], us = L.us.filter((u, i) => i % 2 === 0 || u > L.sK - 0.05);
      for (let j = 0; j < 14; j++) {
        const th = j / 14 * TAU, pts = [];
        for (const u of us) { const q = L.at(u, th, { bump: 0.5 }); const F = L.frame(u), d = norm(sub(q.p, F.c)), pad = legPad(u); pts.push(add(q.p, mul(d, pad + 0.004))); }
        legCols.push(pts);
      }
    }
    return legCols;
  };
  // the legs' cross-section at a height (every leg column crossed there), cached per height
  const sectionCache = new Map();
  const legSection = (y) => {
    const key = Math.round(y * 2000);
    let sec = sectionCache.get(key);
    if (sec) return sec;
    sec = [];
    for (const pts of legColumns()) for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if ((a[1] - y) * (b[1] - y) > 0) continue;
      const t = (y - a[1]) / ((b[1] - a[1]) || 1e-9);
      sec.push(lerp(a[0], b[0], t), lerp(a[2], b[2], t));
    }
    sectionCache.set(key, sec);
    return sec;
  };
  const legSupport = (y, phi) => {
    const sx = Math.sin(phi), cz = Math.cos(phi), sec = legSection(y);
    let h = -Infinity;
    for (let i = 0; i < sec.length; i += 2) { const v = sec[i] * sx + sec[i + 1] * cz; if (v > h) h = v; }
    return h;
  };

  // ---- torso shell points (normal offset), shared by tops, belts and bottom waists
  const torsoPoint = (yReal, phi, bump, pad) => {
    const yv = P.yInv(clamp(yReal, T.yBot + 0.001, T.yTop - 0.001));
    return T.at(yv, phi, { bump, pad });
  };
  const shellPoint = (yReal, phi, off, bump = 0.5, pad = null) => {
    const c = torsoPoint(yReal, phi, bump, pad), e = 0.008;
    const a1 = torsoPoint(yReal + e, phi, bump, pad).p, a0 = torsoPoint(yReal - e, phi, bump, pad).p;
    const b1 = torsoPoint(yReal, phi + 0.02, bump, pad).p, b0 = torsoPoint(yReal, phi - 0.02, bump, pad).p;
    let n = norm(cross(sub(b1, b0), sub(a1, a0)));
    const cz = T.centreZ(yReal), rad = [c.p[0], 0, c.p[2] - cz];
    if (dot(n, rad) < 0) n = mul(n, -1);
    return { p: add(c.p, mul(n, off)), w: c.w, base: c.p };
  };
  const radialOf = (p, yReal) => Math.hypot(p[0], p[2] - T.centreZ(yReal));

  // ---- the SKIRT radius in a direction (a column, cached), for a skirt surface from `topY` down to `hemAt(φ)`
  function skirtColumn({ hemAt, flare, clear, inner = null, torsoOff }) {
    const cache = new Map();
    // `rows` = [[y, φ], ...] for one column of the surface (φ may change down a split coat's column), keyed by `key`
    return (key, rows) => {
      let colm = cache.get(key);
      if (colm) return colm;
      colm = new Map();
      let rMax = 0;
      const sorted = [...rows].sort((a, b) => b[0] - a[0]);          // top → bottom
      for (const [y, phi] of sorted) {
        const hem = hemAt(phi);
        let r = 0;
        if (y >= torsoBotReal) r = radialOf(torsoPoint(y, phi, 0.5).p, y) + torsoOff(y);
        if (y < yS) {
          const h = legSupport(y, phi);
          // the legs' hull (plus clearance), fading into the torso shell over the top of the skirt part (no step)
          if (h > -Infinity) r = Math.max(r, lerp(h - (T.centreZ(Math.max(y, torsoBotReal)) * Math.cos(phi)) + clear, r, smooth(yJoin - 0.03 * k, yS, y)));
        }
        if (inner) r = Math.max(r, inner(phi, y) + 0.006);
        if (y < yJoin) r = Math.max(r, rMax);                         // cloth hangs: never narrower lower down
        const f = flare * 0.13 * k * Math.pow(clamp((yJoin - y) / Math.max(0.05, yJoin - hem), 0, 1), 1.4) * (0.85 + 0.3 * Math.abs(Math.cos(phi - PI)));
        rMax = Math.max(rMax, r);
        colm.set(y, r + (y < yJoin ? f : 0));
      }
      cache.set(key, colm);
      return colm;
    };
  }
  const wrap2 = a => ((a % TAU) + TAU) % TAU;

  /**
   * One torso-region garment (a top's shell, a bottom skirt or a bottom's waist) from its hem to its top line, as ONE
   * surface. o: { name, part, top(φ) real, hem(φ) real, off(y) layer thickness, skirt: { flare, clear, inner, arcs, open },
   * color(y, φ, x), rough, glow, mask(y, φ, p), bump, pad, rowsAbove, rowsBelow, segs }
   */
  function torsoGarment(o) {
    const segs = o.segs || 34;
    const hemMin = o.hemMin;
    const skirtPart = hemMin < yJoin - 0.01;
    const nB = skirtPart ? Math.max(3, Math.round((yJoin - hemMin) / (0.055 * k))) : 0;
    const topMax = o.topMax;
    const nA = Math.max(4, Math.round((topMax - Math.max(hemMin, yJoin)) / (o.rowStep || 0.03 * k)));
    // rows: u in [0, 1] = the skirt part (hem → yJoin), (1, 2] = the shell part (max(hem, yJoin) → top)
    const us = [];
    if (skirtPart) for (let i = 0; i <= nB; i++) us.push(i / nB * (1 - 0.001));
    for (let i = 0; i <= nA; i++) us.push(1 + i / nA);
    if (o.rimRows) us.splice(us.length - 1, 0, 2 - 0.035, 2 - 0.012);
    const yOf = (u, phi) => {
      if (u < 1) { const hem = o.hem(phi); return lerp(hem, yJoin, u); }
      const lo = skirtPart ? yJoin : o.hem(phi);
      return lerp(lo, o.top(phi), u - 1);
    };
    const open = o.skirt?.open || 0;                                  // a front split (radians either side at the hem)
    // the handover from the hips to the skirt bones: 10 cm under the hip joint, or most of a short skirt's length
    const hand = Math.max(0.03 * k, Math.min(HAND * k, (P.hipY - hemMin) * 0.85));
    const legA = hemMin > (fem ? 0.6 : 0.63) * k ? 0.85 : LEG_A;      // a short skirt is mostly pushed by the thighs
    const phiOf = (u, th) => {
      if (!open) return th;
      const d = u < 1 ? open * (1 - smooth(0.2, 1, u)) : 0;            // the split closes at the waist
      const t = wrap2(th);                                             // columns run 0..2π (wrap: false)
      return d + t / TAU * (TAU - 2 * d);
    };
    // the skirt column needs every height it will be asked for in a direction: the column's own rows
    const skirtUs = us.filter(u => u < 1.0001);
    const colRows = th => skirtUs.map(u => { const uu = Math.min(u, 0.999), ph = phiOf(uu, th); return [yOf(uu, ph), ph]; });
    const column0 = skirtPart ? skirtColumn({ hemAt: o.hem, flare: o.skirt?.flare || 0, clear: o.skirt?.clear ?? 0.02, inner: o.skirt?.inner || null, torsoOff: o.off }) : null;
    const column = th => column0(Math.round(wrap2(th) * 1e4), colRows(th));
    /** this surface's radius at a skirt height in an actual direction (for the garments over it and the drive) */
    const Rsk = (phi, y) => {
      const th = open ? (wrap2(phi) - open) * TAU / (TAU - 2 * open) : phi;     // (the hem's split; near enough higher up)
      const arr = [...column(th)].sort((a, b) => a[0] - b[0]);
      if (y <= arr[0][0]) return arr[0][1];
      for (let i = 1; i < arr.length; i++) if (y <= arr[i][0]) { const t = (y - arr[i - 1][0]) / ((arr[i][0] - arr[i - 1][0]) || 1); return lerp(arr[i - 1][1], arr[i][1], t); }
      return arr[arr.length - 1][1];
    };
    const at = (u, th) => {
      const phi = phiOf(u, th), y = yOf(u, phi);
      let pt, w, shell = false;
      if (u >= 1 || !skirtPart) {
        // the torso skin point; the geo builder pushes it out along the grid's own normal by o.off (spec.offset)
        const s = torsoPoint(y, phi, o.bump ?? 0.5, o.pad ? (yy, t) => o.pad(P.yMap(yy), t) : null);
        pt = s.p; w = s.w; shell = true;
        if (skirtPart || o.stripLegs) w = stripLegs(w);
      } else {
        const r = column(th).get(y) ?? Rsk(phi, y);
        const cz = T.centreZ(Math.max(y, torsoBotReal));
        pt = [Math.sin(phi) * r, y, cz + Math.cos(phi) * r];
        const tw = T.weightsAt(clamp(y, T.yBot, T.yTop), pt[0], pt[2]);
        w = skirtWeights(phi, P.hipY - y, stripLegs(tw), k, hand, legA);
      }
      return { p: pt, w, y, phi, shell, base: pt };
    };
    const spec = {
      name: o.name, us, segs, wrap: !open, theta: open ? (j, n) => j / n * TAU : (j, n) => (j / n) * TAU - PI,
      at, offset: (u, t, p) => (u >= 1 || !skirtPart ? o.off(p[1]) : 0), out: (p, u) => { const y = p[1]; return [p[0], 0, p[2] - T.centreZ(clamp(y, T.yBot, T.yTop))]; },
      color: (u, t, p, smp) => o.color(smp.y, smp.phi, u),
      mask: (u, t, p, smp) => (o.mask ? o.mask(smp.y, smp.phi, smp) : 0),
      rough: o.rough, glow: o.glow, ao: 0.55, capStart: false,
    };
    out.push(spec);
    // what driveSkirtClip needs: the rest radius from the PIVOT axis (x = 0, z = 0) per direction, rows below the pivot
    let prof = null;
    if (skirtPart) {
      const rowsY = us.filter(u => u < 1).map(u => u).concat([1]).map(u => u);
      prof = {
        rows: null, arcs: open ? [[0, TAU]] : null,
        hemArc: o.skirt?.arcs || null,
        R: (phi, yRel) => {
          const y = yRel + P.hipY, r = Rsk(phi, Math.min(y, yJoin - 1e-4));
          // from the pivot axis: the skirt's own centre is the torso's centre line
          const cz = T.centreZ(Math.max(y, torsoBotReal));
          return Math.hypot(Math.sin(phi) * r, cz + Math.cos(phi) * r);
        },
        hem: phi => o.hem(phi) - P.hipY, hand, legA,
      };
      void rowsY;
      // rows relative to the pivot, top → bottom, at the skirt part's own spacing
      const rr = []; for (let i = nB; i >= 0; i--) rr.push(lerp(hemMin, yJoin, i / nB) - P.hipY);
      rr.unshift(0.06 * k);
      prof.rows = rr;
      if (open) {
        const d0 = open;
        prof.arcs = [[d0, TAU - d0]];
      }
      if (o.skirt?.arcs) prof.arcs = o.skirt.arcs;
    }
    /** the surface's own (u, column θ) for a real height and an actual direction (belts, sash tails, the gear bridge) */
    const uvOf = (y, phi) => {
      let u;
      if (skirtPart && y < yJoin) { const hem = o.hem(phi); u = clamp((y - hem) / ((yJoin - hem) || 1), 0, 0.999); }
      else { const lo = skirtPart ? yJoin : o.hem(phi); u = 1 + clamp((y - lo) / ((o.top(phi) - lo) || 1), 0, 1); }
      let th = phi;
      if (open) { const d = u < 1 ? open * (1 - smooth(0.2, 1, u)) : 0; th = (wrap2(phi) - d) * TAU / (TAU - 2 * d); }
      return [u, th];
    };
    /** the finished point (offset included) at a real height in an actual direction */
    const atOut = (y, phi) => {
      const [u, th] = uvOf(y, phi), r = at(u, th);
      if (!r.shell) return r;
      const n = norm([r.p[0], 0, r.p[2] - T.centreZ(clamp(r.y, T.yBot, T.yTop))]);
      return { ...r, p: add(r.p, mul(n, o.off(r.y) + lodPush)) };
    };
    /** every row's height (the skirt part's and the shell's) in a direction, top → bottom */
    const rowYs = phi => us.map(u => yOf(u, phiOf(u, phi))).sort((a, b) => b - a);
    return { spec, prof, Rsk, column, uvOf, atOut, rowYs };
  }
  const stripLegs = w => { const o = w.filter(([b]) => !/^leg[LR]$/.test(b)); const lost = w.reduce((s, [b, x]) => s + (/^leg[LR]$/.test(b) ? x : 0), 0); if (lost > 0) o.push(['hips', lost]); return o; };

  const skirtProfiles = [];
  const outerShells = [];      // { y0, y1, at(y, φ) → outermost point } for belts / the gear bridge

  // ================================================================================================ BOTTOMS
  let botSkirtG = null;
  if (bot) {
    const c = col(bot), c2 = col(bot, 'trim'), [rough, glow] = matOf(bot), mat = br.mat;
    if (bottomLeg) {
      // the waist: torso from the bottom to the waistband (as the test outfit's trousers)
      const topV = pantsTopV;
      const us = []; const n = lod ? 5 : 8; for (let i = 0; i <= n; i++) us.push(T.y0 + (topV - T.y0) * i / n);
      us.splice(us.length - 1, 0, topV - 0.035 * k, topV - 0.03 * k); us.sort((a, b) => a - b);
      const off = (y) => 0.0085 + 0.002 * smooth(topV - 0.035 * k, topV, y) + (bottomLeg.fit === 'loose' || bottomLeg.fit === 'wide' ? 0.004 : 0);
      out.push({
        name: 'pantsTorso', us, segs: Math.round(T.segs * (lod ? 0.6 : 1)), capStart: true,
        at: (y, th) => T.at(y, th, { bump: 0.7 }), offset: off,
        color: (y, th) => y > topV - 0.034 * k ? cmul(c, 0.72) : paint(mat, cmul(c, 1 - 0.07 * gauss(adiff(Math.abs(th), PI / 2), 0.04)), th * 0.15, y),
        mask: (y, th) => (topCoversY(P.yMap(y), fit.m, th) || (tr?.extras.includes('apron') && Math.abs(wrapPi(th)) < 0.72) ? C.TOPOVER : 0), rough, glow, ao: 0.6,   // (an apron hangs over the front)
      });
      outerShells.push({ y0: P.yMap(T.y0), y1: pantsTopReal, off: y => off(P.yInv(y)) });
      for (const s of ['L', 'R']) {
        const L = Lg[s], end = legEnd, torn = bottomLeg.extras.includes('torn');
        const rowsU = [...L.us.filter(u => u < end - 0.01), end - 0.012, end];
        const endAt = th => torn ? end - 0.045 * k * (0.5 + 0.5 * Math.sin(5 * th + 1.3) * Math.sin(3 * th + 0.4)) : end;
        out.push({
          name: 'pantsLeg' + s, us: rowsU, segs: L.segs,
          at: (u, th) => { const uu = u >= end - 0.013 ? lerp(u, endAt(th), (u - (end - 0.013)) / 0.013) : Math.min(u, endAt(th)); const q = L.at(uu, th, { bump: bottomLeg.fit === 'tight' ? 0.85 : 0.6 }); q.uu = uu; return q; },
          offset: (u) => pantsOff(Math.min(u, end)) + (u > end - 0.013 ? 0.0015 : 0),
          color: (u, th, p, smp) => {
            const t = s === 'L' ? -th : th, uu = smp.uu;
            let cc = cmul(c, 1 - 0.08 * gauss(adiff(t, PI / 2), 0.04) - 0.05 * gauss(adiff(t, PI), 0.6) * gauss(uu - L.sK, 0.03));
            if (bottomLeg.extras.includes('straps') && (Math.abs(uu - (L.sH + 0.3 * (L.sK - L.sH))) < 0.014 || Math.abs(uu - (L.sH + 0.75 * (L.sK - L.sH))) < 0.014)) cc = cmul(c2, 0.9);
            if (bottomLeg.extras.includes('pleats')) cc = cmul(cc, 0.9 + 0.12 * Math.abs(Math.sin(th * 7)));
            if (uu > end - 0.014) cc = cmul(cc, 0.8);
            return paint(mat, cc, th * 0.06, uu);
          },
          mask: (u, th, p, smp) => (robeHide != null && smp.uu < robeHide ? C.ROBE : 0) | (sr && smp.uu > shaftTop + 0.014 ? C.SHAFT : 0) | (greave && smp.uu > greave[0] + 0.012 && smp.uu < greave[1] - 0.012 ? C.GREAVE : 0),
          rough, glow, ao: 0.6,
        });
        // stockings below breeches
        if (bottomLeg.extras.includes('stockings')) {
          const s0 = end - 0.02, s1 = L.sA + 0.01, sc = bot.color2 ? c2 : hexLin('#d8d0bc');
          out.push({
            name: 'stocking' + s, lodThin: true, us: [s0, ...L.us.filter(u => u > s0 + 0.01 && u < s1 - 0.01), s1], segs: L.segs,
            at: (u, th) => L.at(u, th, { bump: 0.9 }), offset: () => 0.0028,
            color: (u, th) => cmul(sc, 0.95 + 0.06 * Math.sin(th * 9)), mask: (u) => (sr && u > shaftTop + 0.014 ? C.SHAFT : 0), rough: 0.85, ao: 0.5,
          });
        }
        // greaves (shin plates) and knee cops
        if (greave) {
          const gc = bottomLeg.mat === 'plate' ? c : hexLin('#b4bcc6'), gHi = lift(gc, 0.35);
          out.push({
            name: 'greave' + s, lodThin: true, us: [greave[0], greave[0] + 0.01, ...L.us.filter(u => u > greave[0] + 0.02 && u < greave[1] - 0.02), greave[1] - 0.01, greave[1]], segs: L.segs,
            at: (u, th) => L.at(u, th, { bump: 0.2, pad: (ss, t) => 0.006 * gauss(t, 0.3) }), offset: (u) => greaveOff(u) + (u < greave[0] + 0.011 || u > greave[1] - 0.011 ? 0.003 : 0),
            color: (u, th) => { const t = s === 'L' ? -th : th; if (u < greave[0] + 0.011 || u > greave[1] - 0.011) return gHi; if (Math.abs(adiff(Math.abs(t), 1.35)) < 0.12) return cmul(gc, 0.6); return cmul(gc, 0.8 + 0.55 * gauss(t, 0.35) - 0.2 * gauss(adiff(t, PI), 0.8)); },
            rough: 0.34, glow: -0.62, ao: 0.4,
          });
        }
        if (bottomLeg.extras.includes('kneeCops')) {
          const kc = hexLin('#a8b0ba'), k0 = L.sK - 0.06 * k, k1 = L.sK + 0.045 * k;
          out.push({
            name: 'kneeCop' + s, lodThin: true, us: [k0, ...L.us.filter(u => u > k0 + 0.006 && u < k1 - 0.006), k1], segs: 8, wrap: false, t0: -1.35, t1: 1.35,
            at: (u, th) => L.at(u, th, { bump: 0.2 }),
            offset: (u, th) => legPad(u) + 0.016 + 0.012 * Math.sin(PI * (u - k0) / (k1 - k0)) * gauss(th, 0.9),
            color: (u, th) => u < k0 + 0.013 || u > k1 - 0.013 ? lift(kc, 0.35) : cmul(kc, 0.85 + 0.35 * gauss(th, 0.4)),
            out: (p, u) => sub(p, L.frame(u).c), rough: 0.26, glow: -0.82, ao: 0.4,
          });
        }
        if (bottomLeg.extras.includes('cuisses')) {
          const cc = c, c0 = L.sH + 0.05 * k, c1 = L.sK - 0.075 * k;
          out.push({
            name: 'cuisse' + s, lodThin: true, us: [c0, ...[0.2, 0.4, 0.6, 0.8].map(f => lerp(c0, c1, f)), c1], segs: 9, wrap: false, t0: -1.25, t1: 1.45,
            at: (u, th) => L.at(u, th, { bump: 0.2 }), offset: (u) => pantsOff(u) + 0.011,
            color: (u, th) => { const f = (u - c0) / (c1 - c0), band = Math.abs(((f * 4) % 1) - 0.5) > 0.42; return band ? lift(cc, 0.3) : cmul(cc, 0.82 + 0.3 * gauss(th, 0.5)); },
            out: (p, u) => sub(p, L.frame(u).c), rough: 0.28, glow: -0.8, ao: 0.4,
          });
        }
      }
    }
    // a bottom skirt (kilt, skirt, long skirt, loincloth flaps)
    if (buildBotSkirt) {
      const sk = br.skirt, hem = hemY(sk.hem);
      const arcs = sk.arcs || null;
      const topY = pantsTopReal + 0.01 * k;
      const pleat = (phi) => sk.pleats ? 0.9 + 0.14 * Math.abs(Math.sin(phi * 14)) : 1;
      const mk = (name, arc) => torsoGarment({
        name, hemMin: hem, topMax: topY, hem: () => hem, top: () => topY, off: (y) => 0.01 + 0.002 * smooth(topY - 0.03, topY, y),
        skirt: { flare: sk.flare, clear: 0.016, arcs: arc ? [arc] : null }, segs: arc ? 10 : 32, rowStep: 0.03 * k,
        color: (y, phi) => { let cc = cmul(c, pleat(phi)); if (y > topY - 0.03 * k && br.waist !== 'none') cc = cmul(c, 0.72); if (y < hem + 0.025 * k) cc = cmul(c2, 1); return paint(mat, cc, phi * 0.2, y); },
        mask: (y, phi) => (topCoversY(y, 0.016, phi) ? C.TOPOVER : 0), rough, glow,
      });
      if (arcs) {
        for (let i = 0; i < arcs.length; i++) {
          const g = mk('loinFlap' + i, arcs[i]);
          // a flap: remap the columns onto its arc
          const sp = g.spec, at0 = sp.at, [a0, a1] = arcs[i];
          sp.wrap = false; sp.theta = (j, n) => a0 + (a1 - a0) * j / n; sp.at = (u, th) => at0(u, th);
          if (g.prof) { g.prof.arcs = [[wrap2(a0), wrap2(a0) + (a1 - a0)]]; skirtProfiles.push(g.prof); }
        }
      } else {
        botSkirtG = mk('skirt');
        if (botSkirtG.prof) skirtProfiles.push(botSkirtG.prof);
        outerShells.push({ y0: hem, y1: topY, g: botSkirtG });
      }
    }
  }

  // ================================================================================================ TOPS
  /** Is height yReal inside the top's shell all the way round (so what is under it there can be dropped)? */
  function topCoversY(y, m0, phi = null) {
    if (!tr || tr.bare) return false;
    if (topSkirt && tr.open) {
      if (y > yJoin + 0.02) return true;
      if (phi == null) return false;
      // under a split coat: covered except in (and just beside) the split, which opens from the waist down
      const hem = hemY(tr.hem), u = clamp((y - hem) / (yJoin - hem), 0, 1), gap = 0.22 * (1 - smooth(0.2, 1, u));
      return y > hem + 0.06 * k && (Math.abs(wrapPi(phi)) > gap + 0.16 || y > P.crotchY - 0.02 * k);   // (the split is a slit up to the crotch)
    }
    if (topSkirt) return true;                                         // a closed skirt top hangs below the whole torso
    return y > hemY(tr.hem) + m0;
  }
  function topHemV() {                                                // the top's hem as a v1 torso height (for masks)
    if (!tr) return Infinity;
    if (topSkirt) return T.y0 - 1;                                     // reaches below the torso: covers all of it
    return P.yInv(hemY(tr.hem));
  }
  let topG = null;
  if (top && !tr.bare) {
    const c = col(top), c2 = col(top, 'trim'), [rough, glow] = matOf(top), mat = tr.mat;
    const layerOff = LAYER_OFFSET[tr.layer] || 0.014;
    const hemBase = topSkirt ? hemY(topSkirt === 'seat' && !['seat', 'thigh', 'aboveKnee', 'knee', 'calf', 'floor'].includes(tr.hem) ? 'seat' : tr.hem) : hemY(tr.hem);
    const jag = tr.extras.includes('jagged');
    const hemAt = phi => hemBase - (jag ? 0.045 * k * (0.5 + 0.5 * Math.sin(6 * phi + 0.7) * Math.cos(4 * phi)) : 0);
    // neckline (v1 heights → real)
    const collarV = (phi) => {
      const base = fit.collar(phi), a = Math.abs(wrapPi(phi));
      switch (tr.neck) {
        case 'v': return base - (fem ? 0.05 : 0.07) * k * gauss(a, 0.42);
        case 'crossed': return base - 0.075 * k * gauss(a, 0.5);
        case 'lapels': return base - 0.1 * k * gauss(a, 0.5);
        case 'scoop': return base - 0.07 * k * gauss(a, 0.95);
        case 'laced': return base - 0.035 * k * gauss(a, 0.3);
        case 'none': return base - 0.03 * k;
        default: return base;
      }
    };
    const topAt = phi => P.yMap(collarV(phi));
    const trousersUnder = !!bottomLeg || buildBotSkirt;
    const off = (y) => layerOff + (trousersUnder ? 0.006 * (1 - smooth(pantsTopReal, pantsTopReal + 0.06 * k, y)) : 0)
      + (tr.extras.includes('peplum') ? 0.03 * smooth(hemBase + 0.08 * k, hemBase, y) : 0)
      + (tr.mat === 'plate' ? 0.006 * smooth(P.yMap(1.1 * k), P.yMap(1.25 * k), y) * (1 - smooth(P.yMap(1.38 * k), P.yMap(1.45 * k), y)) : 0)
      + (tr.extras.includes('furTrim') && y < hemBase + 0.035 * k ? 0.006 : 0)
      + 0.011 * smooth(P.shoulderY - 0.14 * k, P.shoulderY, y);
    // relief pads on the torso (v1 height yy -> real y passed in by torsoGarment)
    const pad = (y, t) => {
      const a = Math.abs(t);
      let d = 0;
      if (mat === 'plate') d += 0.006 * gauss(t, 0.12) * smooth(P.yMap(1.05 * k), P.yMap(1.2 * k), y);                       // the breastplate's ridge
      if (tr.extras.includes('flutes')) d += 0.003 * Math.max(0, Math.sin(t * 9)) * gauss(t, 0.9);
      if (tr.extras.includes('fauld') && y < P.yMap(1.08 * k)) d += 0.004 * (((y - hemBase) / (0.035 * k)) % 1 > 0.75 ? 1 : 0);
      if (tr.extras.includes('lapels') || tr.neck === 'lapels') d += 0.004 * gauss(a - (topAt(t) - y) * 1.6, 0.08) * smooth(topAt(t) - 0.2 * k, topAt(t) - 0.05, y);
      if (tr.front === 'straps') d += 0.003 * gauss(((t * 0.18 - (y - 1.1 * k) * 0.8) / 0.025) % 3 - 0, 0.5);
      if (mat === 'quilt' || tr.front === 'quilt') d += 0.0025 * Math.abs(Math.sin((t * 0.18 + y) / 0.045 * PI)) * Math.abs(Math.sin((t * 0.18 - y) / 0.045 * PI));
      return d;
    };
    const frontCol = (y, phi, base) => {
      const a = Math.abs(wrapPi(phi)), x = wrapPi(phi) * 0.17, yTop = topAt(phi);
      let cc = base;
      switch (tr.front) {
        case 'buttons': if (Math.abs(x) < 0.008 && ((y / (0.06 * k)) % 1) < 0.28) cc = GOLD; else if (Math.abs(x) < 0.014) cc = cmul(base, 0.85); break;
        case 'laces': if (y > hemBase + 0.04 && y < yTop && a < 0.18 && Math.abs(Math.abs(x) - 0.016 * (0.5 + 0.5 * Math.abs(Math.sin(y / 0.025 * PI)))) < 0.004) cc = cmul(c2, 0.8); break;
        case 'band': if (a < 0.13) cc = c2; break;
        case 'panels': if (a < 0.55) cc = cmul(base, 0.82); if (Math.abs(a - 0.55) < 0.03) cc = cmul(base, 0.6); break;
        case 'straps': { const v = (x - (y - 1.12 * k) * 0.8), w2 = (x + (y - 1.12 * k) * 0.8); if (Math.abs(v) < 0.018 || Math.abs(w2) < 0.018) cc = cmul(c2, 0.85); break; }
        case 'sash': { const v = x + (y - 1.2 * k) * 0.7; if (Math.abs(v) < 0.03 && y > P.yMap(1.05 * k)) cc = c2; break; }
        case 'patches': { const h = hash(Math.floor(x / 0.05), Math.floor(y / 0.06)); if (h > 0.82) cc = cmul(cmix(base, [0.5, 0.42, 0.3], 0.5), 0.9); else if (h < 0.08) cc = cmul(base, 0.75); break; }
        case 'pocket': if (a < 0.6 && y > pantsTopReal + 0.01 && y < pantsTopReal + 0.13 * k) cc = cmul(base, Math.abs(a - 0.58) < 0.04 || Math.abs(y - (pantsTopReal + 0.125 * k)) < 0.008 ? 0.7 : 0.92); break;
        case 'quilt': break;
        case 'open': break;
        default: break;
      }
      if (tr.extras.includes('shirtFront') && a < 0.32 && y > P.yMap(1.05 * k)) cc = a > 0.29 ? cmul(c, 0.7) : hexLin(top.color2 || '#d8d0bc');
      if ((tr.extras.includes('lapels') || tr.neck === 'lapels') && a < 0.6 && y > yTop - 0.2 * k && Math.abs(a - (yTop - y) * 1.6) < 0.06) cc = cmul(tr.extras.includes('shirtFront') ? c : c2, 0.9);
      if (tr.extras.includes('stole') && Math.abs(a - 0.38) < 0.09) cc = c2;
      if (tr.extras.includes('yoke') && y > P.yMap(1.36 * k)) cc = cmul(c2, 1);
      if (tr.extras.includes('tabard') && a < 0.42) cc = c2;
      if (tr.extras.includes('studs') && ((x / 0.035) % 1 + 1) % 1 < 0.22 && ((y / 0.035) % 1) < 0.22) cc = [0.75, 0.68, 0.5];
      return cc;
    };
    const color = (y, phi) => {
      const x = wrapPi(phi) * 0.17;
      let cc = paint(mat, c, x, y);
      cc = cmul(cc, 1 - 0.07 * gauss(adiff(Math.abs(wrapPi(phi)), PI / 2), 0.05));                 // side seams
      if (mat === 'plate') cc = cmul(cc, 0.82 + 0.38 * gauss(wrapPi(phi), 0.55) * smooth(hemBase, P.yMap(1.15 * k), y) - 0.12 * gauss(adiff(Math.abs(wrapPi(phi)), PI), 0.6));
      if (tr.extras.includes('fauld') && y < P.yMap(1.08 * k) && y > hemBase && ((y - hemBase) / (0.035 * k)) % 1 > 0.78) cc = lift(cc, 0.28);
      cc = frontCol(y, phi, cc);
      if (y < hemAt(phi) + (topSkirt ? 0.03 : 0.018) * k) cc = tr.extras.includes('hemTrim') || tr.extras.includes('furTrim') ? (tr.extras.includes('furTrim') ? paint('fur', hexLin('#d8c8a8'), x, y) : c2) : cmul(cc, 0.82);
      if (y > topAt(phi) - 0.012) cc = tr.extras.includes('collarRim') || tr.extras.includes('furTrim') ? c2 : cmul(cc, 0.84);
      return cc;
    };
    const hemMin = topSkirt ? hemBase - (jag ? 0.045 * k : 0) : hemBase;
    const topMax = Math.max(...Array.from({ length: 16 }, (_, i) => topAt(i / 16 * TAU)));
    const open = tr.open ? 0.22 : 0;
    const sleeved = !!tr.sleeve && tr.sleeve.to && tr.sleeve.to !== 'none';
    const armholeHit = p => { const sg = p[0] < 0 ? -1 : 1, sh = [P.arm.sh[0] * sg, P.arm.sh[1], P.arm.sh[2]], d = sub(sh, p), l = Math.hypot(...d) || 1; return (sg < 0 ? Ar.L : Ar.R).patchHit(add(p, mul(d, Math.min(1, 0.024 / l)))); };
    // the skirt part clears whatever skirt is under it (a kilt, a long skirt) and the trousers
    topG = torsoGarment({
      name: 'top', hemMin, topMax, hem: hemAt, top: topAt, off, pad, bump: mat === 'plate' ? 0.3 : tr.layer === 1 ? 0.8 : 0.65, rowStep: (mat === 'plate' || mat === 'scale' ? 0.026 : 0.031) * k, rimRows: true,
      skirt: topSkirt ? { flare: tr.flare || (topSkirt === 'seat' ? 0.05 : 0.1), clear: 0.018 + layerOff * 0.6, inner: botSkirtG ? (phi, y) => botSkirtG.Rsk(phi, y) : null, open } : null,
      color, rough, glow, segs: 36,
      // under the sleeve's shoulder patch; with no sleeve the armhole is cut 2 cm wider, so the shoulder turns inside it
      mask: (y, phi, smp) => { const p = smp.base || smp.p; return (Ar.L.patchHit(p) || Ar.R.patchHit(p) || (!sleeved && armholeHit(p))) ? COVER.PATCH : (collared && y > topAt(phi) - (tr.neck === 'fur' || tr.neck === 'hood' || tr.extras.includes('hoodDown') ? 0.1 : 0.032) * k ? C.TOPOVER : 0); },   // (the neckline under a collar)
      stripLegs: false,
    });
    if (topG.prof) skirtProfiles.push(topG.prof);
    outerShells.push({ y0: hemMin, y1: topMax, g: topG, top: true });

    // ---- sleeves
    const sl = tr.sleeve || { to: 'none' };
    if (sl.to !== 'none') {
      const sc = sl.under ? (top.color2 ? c2 : mat === 'mail' || tr.extras.includes('tabard') ? hexLin('#8a9098') : hexLin('#cfc6b0')) : c;
      const smat = sl.under ? (tr.extras.includes('tabard') ? 'mail' : 'linen') : sl.shape === 'mail' ? (mat === 'plate' || mat === 'scale' ? 'mail' : mat) : mat;
      const [sRough, sGlow] = MAT[smat] || MAT.cloth;
      for (const s of ['L', 'R']) {
        const A = Ar[s];
        const end = sleeveEnd(A, sl);
        const us = [A.us[0], ...A.us.filter(u => u > 0 && u < end - 0.008), end - 0.012, end];
        const so = sleeveOff(A, sl, layerOff, end);
        out.push({
          name: 'sleeve' + s, us, segs: A.segs, capStart: !A.sR, out: A.out, normal: A.normal,
          at: (u, th) => wristCap(A, u, th, 0.7), offset: (u) => so(u),
          color: (u, th) => {
            let cc = paint(smat, sc, th * 0.05, u);
            if (u > end - 0.013) cc = tr.extras.includes('cuffs') ? cmul(c2, 0.95) : cmul(cc, 0.84);
            if (sl.shape === 'rolled' && u > end - 0.03) cc = cmul(sc, 0.9 + 0.12 * Math.sin((u - end) / 0.01 * PI));
            if (sl.shape === 'puff' && u < A.sJ + 0.4 * (A.sE - A.sJ)) cc = cmul(cc, 0.92 + 0.12 * Math.abs(Math.sin(th * 4)));
            if (tr.extras.includes('wraps') && u > A.sE + 0.02) cc = cmul(hexLin('#d8d0bc'), 0.9 + 0.1 * Math.sin((u * 60 + th) * 2));
            return cc;
          },
          mask: (u) => (glo && u > A.sW - gr.cuff * k + 0.012 ? C.CUFF : 0), rough: sRough, glow: sGlow, ao: 0.5,
        });
        shoulderEnd[s] = so(A.sJ);
      }
    }
    // ---- collars on the neck: high, gorget, fur, hood down
    const N = parts.neck;
    if (['high', 'gorget', 'fur', 'hood'].includes(tr.neck) || tr.extras.includes('hoodDown')) {
      const n0 = N.us[0], h = tr.neck === 'hood' ? 0.05 : tr.neck === 'fur' ? 0.045 : 0.06, n1 = n0 + h * k;
      const ncol = tr.neck === 'gorget' ? (mat === 'plate' ? c : hexLin('#a0a8b2')) : tr.neck === 'fur' ? hexLin('#cdbb98') : tr.extras.includes('collarRim') ? c2 : c;
      const nmat = tr.neck === 'gorget' ? 'plate' : tr.neck === 'fur' ? 'fur' : mat;
      const [nr, ng] = MAT[nmat] || MAT.cloth;
      out.push({
        name: 'collar', lodThin: true, us: [n0, lerp(n0, n1, 0.33), lerp(n0, n1, 0.66), n1 - 0.006, n1], segs: N.segs,
        at: (y, th) => N.at(y, th, { bump: 0.3 }),
        offset: (y, th) => (tr.neck === 'hood' ? 0.018 + 0.03 * gauss(adiff(th, PI), 1.1) : tr.neck === 'fur' ? 0.026 : tr.neck === 'gorget' ? 0.018 : 0.011) + 0.026 * (1 - smooth(n0, n0 + 0.03 * k, y)) + (y > n1 - 0.007 ? 0.003 : 0),
        color: (y, th) => { const cc = paint(nmat, ncol, th * 0.06, y); return y > n1 - 0.007 ? (tr.neck === 'gorget' ? lift(cc, 0.3) : cmul(cc, 0.82)) : cc; },
        rough: nr, glow: ng, ao: 0.5,
      });
    }
    // ---- pauldrons: plate caps over the shoulder patch (the arm's own surface, so they ride the clavicle / arm)
    if (tr.extras.includes('pauldrons')) {
      const pc = mat === 'scale' ? cmul(c, 1.05) : c, rim = lift(pc, 0.35);
      for (const s of ['L', 'R']) {
        const A = Ar[s], sg = A.sg, u1 = A.sJ + 0.42 * (A.sE - A.sJ);
        out.push({
          // on the arm's own rows (the sleeve's), so the cap and the sleeve under it share every weight blend
          // (from half way up the shoulder patch: nearer the neck the skin is the torso's, and a shell that far out on a
          // half-torso, half-arm blend folds into the sleeve when the arm goes over the head)
          name: 'pauldron' + s, lodThin: true, us: [0.5 * A.sR, ...A.us.filter(u => u > 0.55 * A.sR && u < u1 - 0.012), u1 - 0.008, u1], segs: 12, wrap: false,
          theta: (j, n) => sg * (0.22 + (PI - 0.44) * j / n),      // over the top and outside, clear of the front and back folds
          // a plate cap rides the shoulder as one piece: the clavicle and the upper arm, the same at every vertex
          at: (u, th) => A.at(u, th, { bump: 0.2 }), out: A.out, normal: A.normal,
          offset: (u, th) => (shoulderEnd[s] ?? 0.012) + 0.04 + 0.012 * Math.sin(PI * clamp(u / u1, 0, 1)),
          color: (u) => { const f = u / u1; const band = f > 0.45 && (((f - 0.45) / 0.18) % 1) < 0.18; return u > u1 - 0.009 || band ? rim : paint(mat === 'scale' ? 'scale' : 'plate', cmul(pc, 0.95 + 0.2 * (1 - f)), u * 3, u); },
          rough: 0.27, glow: -0.82, ao: 0.4,
        });
      }
    }
    // ---- forearm pieces: bracers (leather), gauntlet cuffs (plate, when no gloves)
    const forearm = (name, A, u0, u1, offAt, cc, m2, rough2, glow2) => out.push({
      name, lodThin: true, us: [u0, u0 + 0.01, lerp(u0, u1, 0.5), u1 - 0.01, u1], segs: A.segs,
      at: (u, th) => A.at(u, th, { bump: 0.3 }), offset: (u) => offAt(u),
      color: (u, th) => u < u0 + 0.011 || u > u1 - 0.011 ? cmul(cc, 0.72) : paint(m2, cc, th * 0.04, u), rough: rough2, glow: glow2, ao: 0.4,
    });
    if (tr.extras.includes('bracers') && !glo) for (const s of ['L', 'R']) {
      const A = Ar[s], u0 = A.sE + 0.35 * (A.sW - A.sE), u1 = A.sW - 0.022, sOff = sleeveOver(A, sl, layerOff);
      forearm('bracer' + s, A, u0, u1, u => sOff(u) + 0.007, mat === 'leather' ? cmul(c, 0.85) : hexLin('#6a4a30'), 'leather', 0.6, 0);
    }
    if (tr.extras.includes('gauntletCuffs') && !glo) for (const s of ['L', 'R']) {
      const A = Ar[s], u0 = A.sE + 0.4 * (A.sW - A.sE), u1 = A.sW - 0.022, sOff = sleeveOver(A, sl, layerOff);
      forearm('gCuff' + s, A, u0, u1, u => sOff(u) + 0.008 + 0.014 * smooth(u0, u1, u), c, 'plate', 0.27, -0.82);
    }
  }
  // bare tops: the harness's straps, the wraps' bands
  if (top && tr.bare) {
    const c = col(top), c2 = col(top, 'trim'), [rough, glow] = matOf(top);
    if (tr.front === 'harness') {
      for (const sg of [-1, 1]) torsoStrap('harnessStrap', [[0.55 * sg, P.yMap(1.05 * k)], [0.25 * sg, P.yMap(1.25 * k)], [0.9 * sg, P.yMap(1.43 * k)], [2.2 * sg, P.yMap(1.38 * k)], [2.85 * sg, P.yMap(1.15 * k)]], 0.03 * k, 0.005, cmul(c, 0.9), rough, glow);
    } else {
      for (const yv of [1.13, 1.19, 1.25]) band('wrapBand', P.yMap(yv * k), 0.04 * k, 0.004, (phi) => cmul(hexLin(top.color || '#d8d0bc'), 0.92 + 0.08 * Math.sin(phi * 5)), 0.9, 0);
      for (const s of ['L', 'R']) { const A = Ar[s]; out.push({ name: 'armWrap' + s, us: [A.sE + 0.1, lerp(A.sE + 0.1, A.sW - 0.01, 0.5), A.sW - 0.01], segs: A.segs, at: (u, th) => A.at(u, th, { bump: 0.4 }), offset: () => 0.004, color: (u, th) => cmul(hexLin(top.color || '#d8d0bc'), 0.88 + 0.12 * Math.sin((u * 70 + th) * 2)), rough: 0.9, ao: 0.4 }); }
    }
    void c2;
  }

  // ---- belts (over the outermost layer)
  const beltKind = tr?.belt && tr.belt !== 'none' ? tr.belt : (!tr || (outerShells.find(o => o.top)?.y0 ?? 9) > pantsTopReal) ? (br && br.waist && br.waist !== 'none' ? (br.waist === true ? 'plain' : br.waist) : null) : null;
  if (beltKind) {
    const src = tr?.belt && tr.belt !== 'none' ? top : bot;
    const bc = src && src.color2 && beltKind === 'sash' ? col(src, 'trim') : beltKind === 'sash' ? cmul(col(src), 0.7) : beltKind === 'rope' ? hexLin('#8a7450') : hexLin('#4a3424');
    const y = pantsTopReal - 0.03 * k, w = beltKind === 'wide' ? 0.06 * k : beltKind === 'sash' ? 0.065 * k : beltKind === 'rope' ? 0.018 * k : 0.04 * k;
    band('belt', y, w, beltKind === 'rope' ? 0.009 : 0.009, (phi, v) => {
      const a = Math.abs(wrapPi(phi));
      if (beltKind !== 'sash' && beltKind !== 'rope' && a < 0.12 && v > 0.12 && v < 0.88) return a < 0.08 && a > 0.05 ? GOLD : cmul(GOLD, 0.8);
      if (beltKind === 'rope') return cmul(bc, 0.85 + 0.2 * Math.abs(Math.sin((phi * 9 + v * 3) * 2)));
      return v < 0.14 || v > 0.86 ? cmul(bc, 0.75) : bc;
    }, beltKind === 'sash' ? 0.8 : 0.6, 0);
    if (beltKind === 'sash') sashTail(y - w * 0.5, bc);
  }
  // an apron over the front (smith / plain)
  if (tr?.extras.includes('apron')) {
    const ac = hexLin(tr.mat === 'leather' ? '#5a3a24' : '#cfc6b0');
    const a = torsoGarment({
      name: 'apron', hemMin: hemY('knee') + 0.04 * k, topMax: P.yMap(1.3 * k), hem: () => hemY('knee') + 0.04 * k, top: () => P.yMap(1.3 * k), off: () => (LAYER_OFFSET[tr.layer] || 0.014) + 0.008,
      skirt: { flare: 0.05, clear: 0.032, arcs: [[-0.9, 0.9]] }, segs: 10, rowStep: 0.04 * k,
      color: (y, phi) => paint('leather', cmul(ac, Math.abs(wrapPi(phi)) > 0.82 ? 0.75 : 1), phi * 0.2, y), rough: 0.62, glow: 0,
    });
    a.spec.wrap = false; a.spec.theta = (j, n) => -0.9 + 1.8 * j / n;
    if (a.prof) { a.prof.arcs = [[TAU - 0.9, TAU + 0.9]]; skirtProfiles.push(a.prof); }
  }

  // ================================================================================================ SHOES
  if (sho) {
    const c = col(sho), c2 = col(sho, 'trim'), [rough, glow] = matOf(sho), mat = sr.mat;
    const sole = hexLin('#2a211b');
    for (const s of ['L', 'R']) {
      const L = Lg[s];
      if (sr.foot !== 'sandal' && sr.shaft !== 'none') {
        const t0 = shaftTop, t1 = L.sA + 0.02;
        out.push({
          name: 'shaft' + s, lodThin: true, us: [t0, t0 + 0.012, ...L.us.filter(u => u > t0 + 0.02 && u < t1 - 0.004), t1], segs: L.segs,
          at: (u, th) => L.at(u, th, { bump: bottomLeg?.fit === 'tight' ? 0.85 : 0.6 }), offset: (u) => shaftOff(u),   // (the trousers' own smoothing: the same relief under both)
          color: (u, th) => {
            let cc = paint(mat, c, th * 0.05, u);
            if (sr.foot === 'wrap') cc = cmul(c, 0.86 + 0.16 * Math.sin((u * 55 + (s === 'L' ? -th : th) * 1.2) * 2));
            if ((sr.extras || []).includes('splints') && Math.abs(Math.sin(th * 4)) > 0.85) cc = hexLin('#9aa2ac');
            if (u < t0 + 0.013) cc = sr.cuff ? cmul(c2, 1) : cmul(cc, 0.78);
            return cc;
          },
          mask: (u) => (greave && u > greave[0] + 0.012 && u < greave[1] - 0.012 ? C.GREAVE : 0), rough, glow, ao: 0.5,
        });
      }
      if (sr.foot === 'sandal') { sandal(s, c, sole); continue; }
      out.push(shoeFoot(P, s, sr, c, c2, sole, rough, glow, 0));
    }
  }

  // ================================================================================================ GLOVES
  if (glo) {
    const c = col(glo), c2 = col(glo, 'trim'), mat = gr.mat, [rough, glow] = matOf(glo);
    const th0 = gr.cover === 'gauntlet' ? 0.0045 : gr.cover === 'mitt' ? 0.003 : 0.0018;
    for (const s of ['L', 'R']) {
      const lay = hands[s];
      for (const hp of handParts(P, s, lay)) {
        const isPalm = hp.name.startsWith('palm');
        let us = hp.us, capEnd = hp.capEnd;
        if (gr.cover === 'wrap' && !isPalm) { const L = hp.us[hp.us.length - 1]; us = hp.us.filter(u => u <= 0.42 * L); if (us.length < 2) continue; capEnd = false; }
        out.push({
          ...hp, name: 'glove' + hp.name, lodThin: true, us, capEnd, offset: (u, th) => th0 + (isPalm ? 0.0012 : 0) + (gr.cover === 'gauntlet' && !isPalm ? 0.0015 * Math.max(0, Math.sin(th)) : 0),
          at: (u, th) => hp.at(u, th, { bump: 0.4 }),
          color: (u, th) => { let cc = paint(mat, c, th * 0.01, u); if (gr.cover === 'gauntlet' && !isPalm && (u / (hp.us[hp.us.length - 1] || 1)) % 0.33 < 0.05) cc = lift(cc, 0.3); if (gr.cover === 'wrap') cc = cmul(c, 0.88 + 0.12 * Math.sin((u * 140 + th) * 2)); return cc; },
          rough, glow, ao: 0.35, mask: 0, nail: undefined,
        });
      }
      // the cuff up the forearm
      const A = Ar[s], u0 = A.sW - gr.cuff * k, u1 = A.end;
      const sl = tr?.sleeve, sOff = top && !tr.bare ? sleeveOver(A, sl, LAYER_OFFSET[tr.layer] || 0.014) : () => 0;
      out.push({
        name: 'gloveCuff' + s, lodThin: true, us: [u0, u0 + 0.01, ...A.us.filter(u => u > u0 + 0.015 && u < u1 - 0.004), u1], segs: A.segs,
        at: (u, th) => A.at(u, th, { bump: 0.3 }), offset: (u) => Math.max(sOff(Math.min(u, A.sW)), 0) + th0 + 0.003 + (gr.cover === 'gauntlet' ? 0.016 * (1 - smooth(u0, u0 + 0.06, u)) : 0) + (u < u0 + 0.011 ? 0.002 : 0),
        color: (u, th) => u < u0 + 0.011 ? (gr.cover === 'gauntlet' ? lift(c, 0.3) : cmul(c2, 0.9)) : paint(mat, c, th * 0.04, u), rough, glow, ao: 0.4,
      });
    }
  }

  // ------------------------------------------------------------------------------------------- helpers using the plan
  function sleeveEnd(A, sl) {
    const to = sl?.to || 'none';
    // a sleeve to the wrist stops before the wrist's own bend (the skin there turns with the hand: a cuff over it would
    // not); a bell sleeve hangs on past it, on the forearm's weights only (wristCap)
    return to === 'cap' ? A.sJ + 0.15 * (A.sE - A.sJ) : to === 'short' ? A.sJ + 0.45 * (A.sE - A.sJ) : to === 'elbow' ? A.sE - 0.03 * k : to === 'forearm' ? A.sE + 0.5 * (A.sW - A.sE) : sl?.shape === 'bell' ? Math.min(A.end, A.sW + 0.006) : A.sW - 0.02;
  }
  /** A forearm point that never takes the hand's weight (sleeves, cuffs, bracers end on the forearm's own bend). */
  function wristCap(A, u, th, bump) {
    const r = A.at(u, th, { bump }), cap = A.sW - 0.022;
    if (u > cap) r.w = A.at(cap, th, { bump }).w;
    return r;
  }
  function sleeveCovers(A, sl) { return !!sl && sl.to && sl.to !== 'none'; }
  /** The sleeve's thickness where it reaches, 0 past its end (a bracer / cuff is laid on what is there). */
  function sleeveOver(A, sl, layerOff) {
    if (!sleeveCovers(A, sl)) return () => 0;
    const e = sleeveEnd(A, sl), so = sleeveOff(A, sl, layerOff, e);
    return u => (u <= e + 0.004 ? so(Math.min(u, e)) : 0);
  }
  function sleeveOff(A, sl, layerOff, end) {
    const base = Math.min(0.014, layerOff * 0.75);
    return (u) => {
      let o = lerp(0.008, base, smooth(0.04, A.sJ + 0.1, u));
      if (sl.shape === 'bell') o += 0.06 * Math.pow(smooth(A.sE - 0.03, end, u), 1.4);
      if (sl.shape === 'wide') o += 0.024 * smooth(A.sJ, end, u);
      if (sl.shape === 'puff') o += 0.024 * gauss((u - (A.sR + 0.35 * (A.sE - A.sR))) / (A.sE - A.sR), 0.3);
      if (sl.shape === 'rolled' && u > end - 0.03) o += 0.005;
      if (sl.shape === 'mail') o += 0.002;
      if (u > end - 0.013) o += 0.0015;
      return o;
    };
  }
  /** A band round the torso over the outermost layer at height y (belts, wraps). */
  function band(name, y, w, lift0, colorAt, rough, glow) {
    const v0 = y - w / 2, v1 = y + w / 2;
    out.push({
      name, us: [0, 0.15, 0.5, 0.85, 1], segs: 30, theta: (j, n) => (j / n) * TAU - PI,
      at: (v, th) => { const yy = lerp(v0, v1, v); const o = outerAt(yy, th); return { p: add(o.p, mul(o.n, lift0 * (v > 0.1 && v < 0.9 ? 1 : 0.55))), w: o.w }; },
      offset: () => 0, out: (p) => [p[0], 0, p[2] - T.centreZ(clamp(p[1], T.yBot, T.yTop))],
      color: (v, th) => colorAt(th, v), rough, glow, ao: 0.4,
    });
  }
  /** A sash's two tails hanging from the knot (on the outermost layer, so a robe's tails ride its skirt bones). */
  function sashTail(y0, bc) {
    let y1 = y0 - (topSkirt && order.indexOf(topSkirt) >= 2 ? 0.28 : 0.11) * k;
    if (tr && !tr.bare) y1 = Math.max(y1, hemY(topSkirt || tr.hem) + 0.012 * k);       // never below the garment it hangs on
    // the tails' rows sit on the garment's own rows and their edges on its own columns, so a tail is one facet of the
    // garment pushed out: it bends exactly where the garment does (no chord of the garment can cut through it)
    const g = outerShells.find(o => o.top && o.g)?.g;
    const rows = g ? g.rowYs(0.5).filter(y => y <= y0 + 1e-6 && y >= y1 - 0.03) : null;
    const ys = rows && rows.length >= 2 ? rows : [y0, lerp(y0, y1, 0.25), lerp(y0, y1, 0.5), lerp(y0, y1, 0.75), y1];
    const ya = ys[0], yb = ys[ys.length - 1];
    const vs = ys.map(y => (ya - y) / (ya - yb)), col = TAU / 36;
    y0 = ya; y1 = yb;
    for (const [a0, a1] of [[2 * col, 4 * col]]) out.push({
      name: 'sashTail', us: vs, segs: 2, wrap: false, theta: (j, n) => a0 + (a1 - a0) * j / n,
      at: (v, th) => { const o = outerAt(lerp(y0, y1, v), th); return { p: add(o.p, mul(o.n, 0.012)), w: o.w }; },
      offset: () => 0, out: (p) => [p[0], 0, p[2] - T.centreZ(clamp(p[1], T.yBot, T.yTop))],
      color: (v, th) => v > 0.9 || Math.abs(wrapPi(th) - 3 * col) < 0.004 ? cmul(bc, 0.78) : bc, rough: 0.8, ao: 0.3,
    });
  }
  /** A strap laid on the torso skin along a path of [φ, yReal] (the harness). */
  function torsoStrap(name, path, w, lift0, cc, rough, glow) {
    const P2 = table(path.map((q, i) => [i / (path.length - 1), q[0], q[1]]));
    out.push({
      name, us: Array.from({ length: 13 }, (_, i) => i / 12), segs: 2, wrap: false, t0: 0, t1: 1,
      at: (t, v) => { const [phi, y] = P2(t); const r = shellPoint(y, phi + (v - 0.5) * w / 0.16, lift0); return { p: r.p, w: r.w }; },
      offset: () => 0, out: (p) => [p[0], 0.2, p[2]], color: () => cc, rough, glow, ao: 0.3,
    });
  }
  /** The outermost garment point at (yReal, φ): its position, outward normal and skin weights. */
  function outerAt(y, phi) {
    let best = null;
    for (const o of outerShells) {
      if (y < o.y0 - 0.005 || y > o.y1 + 0.005) continue;
      let p, w;
      if (o.g) {
        // ask the garment's own surface: find its u for this height (the shell part maps u linearly)
        const r = sampleGarment(o.g, y, phi); if (!r) continue; p = r.p; w = r.w;
      } else { const s = shellPoint(y, phi, o.off(y)); p = s.p; w = s.w; }
      const rr = Math.hypot(p[0], p[2] - T.centreZ(clamp(y, T.yBot, T.yTop)));
      if (!best || rr > best.rr) best = { p, w, rr };
    }
    if (!best) { const s = shellPoint(y, phi, 0.004); best = { p: s.p, w: s.w }; }
    const n = norm([best.p[0], 0, best.p[2] - T.centreZ(clamp(y, T.yBot, T.yTop))]);
    return { p: best.p, w: best.w, n };
  }
  function sampleGarment(g, y, phi) { return g.atOut(y, phi); }
  /** Sandals: a sole under the foot and two straps over it, the foot itself still skin. */
  function sandal(s, c, sole) {
    const sg = s === 'L' ? -1 : 1, F = P.footLen, ank = [P.leg.ankle[0] * sg, P.leg.ankle[1], P.leg.ankle[2]], heelZ = ank[2] - 0.062 * F / 0.258;
    const R = table([[0, 0.022], [0.04, 0.034], [0.12, 0.04], [0.18, 0.05], [0.212, 0.045], [0.235, 0.03]].map(r => [r[0] * F / 0.258, r[1] * (fem ? 0.9 : 1) * Math.sqrt(P.W)]));
    const zs = [0, 0.02, 0.06, 0.1, 0.14, 0.18, 0.21, 0.235].map(v => v * F / 0.258);
    out.push({
      name: 'sandalSole' + s, us: zs, segs: 10, capStart: true, capEnd: true,
      at: (z, th) => { const hw = R(z)[0], sn = Math.sin(th), cs = Math.cos(th); const x = sn * hw, y = 0.0065 + cs * 0.0065; const tw = smooth(0.16 * F / 0.258, 0.2 * F / 0.258, z); return { p: [ank[0] + x - sg * 0.004, Math.max(0, y), heelZ + z], w: [['foot' + s, 1 - tw], ['toe' + s, tw]] }; },
      offset: () => 0, color: (z, th) => Math.cos(th) > 0.5 ? cmul(c, 0.9) : sole, rough: 0.7, ao: 0.3,
    });
    // straps: two bands over the instep (the foot's own surface, a few mm out)
    const fp = footBase(P, s);
    for (const [z0, z1] of [[0.09, 0.115], [0.16, 0.18]]) out.push({
      name: 'sandalStrap' + s, us: [z0, (z0 + z1) / 2, z1].map(v => v * F / 0.258), segs: 8, wrap: false, t0: -1.7, t1: 1.7,
      at: (z, th) => fp.at(z, th), offset: () => 0.003, color: () => c, rough: 0.6, ao: 0.3,
    });
    const L = Lg[s];
    out.push({ name: 'sandalTie' + s, us: [L.sA - 0.05, L.sA - 0.035, L.sA - 0.02], segs: L.segs, at: (u, th) => L.at(u, th, { bump: 0.5 }), offset: () => 0.004, color: () => c, rough: 0.6, ao: 0.3 });
  }

  // ------------------------------------------------------------------------------------------- what is covered
  const m = fit.m;
  const sleeveEndOf = s => (tr && !tr.bare && tr.sleeve?.to && tr.sleeve.to !== 'none') ? sleeveEnd(Ar[s], tr.sleeve) : null;
  const topHemReal = tr && !tr.bare ? (topSkirt ? -Infinity : hemY(tr.hem)) : Infinity;
  const coverTorso = (y, th) => {                                      // y = v1 torso height
    let c = 0;
    const yr = P.yMap(y);
    if (tr && !tr.bare && yr > topHemReal + m && (y < topCollarV(th) - m * 0.6 || collared)) c |= C.TOP;   // (a collar on the neck covers the skin up to it)
    if (bottomLeg && y < pantsTopV - m) c |= C.BOT;
    if (buildBotSkirt && !br.skirt.arcs && y < pantsTopV - m) c |= C.BOT;
    return c;
  };
  function topCollarV(th) {
    if (!tr || tr.bare) return -Infinity;
    const base = fit.collar(th), a = Math.abs(wrapPi(th));
    switch (tr.neck) {
      case 'v': return base - (fem ? 0.05 : 0.07) * k * gauss(a, 0.42);
      case 'crossed': return base - 0.075 * k * gauss(a, 0.5);
      case 'lapels': return base - 0.1 * k * gauss(a, 0.5);
      case 'scoop': return base - 0.07 * k * gauss(a, 0.95);
      case 'laced': return base - 0.035 * k * gauss(a, 0.3);
      case 'none': return base - 0.03 * k;
      default: return base;
    }
  }
  function cover(part, u, th, p) {
    let c = 0;
    switch (part) {
      case 'torso': return coverTorso(u, th);
      case 'arm': {
        const s = p && p[0] < 0 ? 'L' : 'R', e = sleeveEndOf(s);
        if (e != null && u < e - m * 0.8) c |= C.TOP;
        if (glo && u > Ar[s].sW - gr.cuff * k + m) c |= C.GLOVE;
        return c;
      }
      case 'leg': {
        if (bottomLeg && u < legEnd - m) c |= C.BOT;
        if (bottomLeg?.extras.includes('stockings') && u > legEnd - m) c |= C.BOT;
        if (robeHide != null && u < robeHide) c |= C.ROBE;
        if (sr && sr.foot !== 'sandal' && sr.shaft !== 'none' && u > shaftTop + m) c |= C.SHOE;
        return c;
      }
      case 'briefsTorso': {
        if (bottomLeg || (buildBotSkirt && !br.skirt.arcs)) c |= C.BOT;
        if (tr && !tr.bare && (topSkirt || P.yMap(u) > topHemReal + m)) c |= C.TOP;
        return c;
      }
      case 'briefsLegL': case 'briefsLegR':
        if (bottomLeg) c |= C.BOT;
        if (robeHide != null) c |= C.ROBE;
        return c;
      case 'bra': case 'strap': return tr && !tr.bare ? C.TOP : 0;
      default: return 0;
    }
  }
  const handMask = (name) => glo ? (gr.cover === 'wrap' ? (name.startsWith('palm') ? C.GLOVE : 0) : C.GLOVE) : 0;

  // ------------------------------------------------------------------------------------------- the skirt profile
  const skirt = skirtLv && skirtProfiles.length ? { surfaces: skirtProfiles, k } : null;
  // the gear bridge: how far out the outermost garment is at a real height / angle (beyond the skin)
  const outer = {
    off(y, th) {
      let o = 0;
      if (top && !tr.bare && y > (topSkirt ? -1 : hemY(tr.hem)) && y < topAt0(th) + 0.05) o = Math.max(o, (LAYER_OFFSET[tr.layer] || 0.014) + (tr.mat === 'plate' ? 0.006 : 0) + 0.011 * smooth(P.shoulderY - 0.14 * k, P.shoulderY, y));
      if (bottomLeg && y < pantsTopReal) o = Math.max(o, 0.011);
      if (tr?.extras.includes('pauldrons') && y > P.shoulderY - 0.06 * k) o = Math.max(o, 0.045);
      if (beltKind && Math.abs(y - (pantsTopReal - 0.03 * k)) < 0.04 * k) o = Math.max(o, o + 0.006);
      return o + 0.004;
    },
    /** the radius of the outermost garment from the torso's centre line at a height below the torso (skirts), or null */
    radius(y, th) {
      if (y >= T.yBot) return null;
      let r = null;
      for (const o of outerShells) if (o.g && y >= o.y0 && y <= o.y1) { const s = sampleGarment(o.g, y, th); if (s) { const rr = Math.hypot(s.p[0], s.p[2] - T.centreZ(T.yBot)); r = Math.max(r ?? 0, rr); } }
      return r;
    },
    /** the outermost skirt's skin weights at a height below the torso (the gear bridge lays a cape's tail with them) */
    weights(y, th) {
      if (y >= T.yBot) return null;
      let best = null, br2 = -1;
      for (const o of outerShells) if (o.g && y >= o.y0 && y <= o.y1) { const s = sampleGarment(o.g, y, th); if (s) { const rr = Math.hypot(s.p[0], s.p[2] - T.centreZ(T.yBot)); if (rr > br2) { br2 = rr; best = s.w; } } }
      return best;
    },
    shirt: !!top && !tr?.bare, skirt: !!skirt,
  };
  function topAt0(th) { return tr ? P.yMap(topCollarV(th)) : -Infinity; }
  const worn = { shirt: !!top && !tr?.bare, boots: footCovered, pants: !!bottomLeg };
  const hide = CLOTH_ALL | (footCovered ? COVER.BOOTS : 0);
  const legPads = { thigh: pantsOff(leg.sH + 0.5 * (leg.sK - leg.sH)) + 0.004, shin: legPad(leg.sK + 0.5 * (leg.sA - leg.sK)) + 0.004, foot: footCovered ? 0.045 : 0.012 };
  return { parts: out, hide, cover, handMask, outer, skirt, worn, stride: strideOf(clothes), legPads };
}

// ------------------------------------------------------------------------------------------- feet
/** The foot's own surface (as body.js footParts builds it), for laying straps on. */
function footBase(P, s) {
  const sg = s === 'L' ? -1 : 1, F = P.footLen, k = P.k, wF = P.fem ? 0.9 : 1;
  const ank = [P.leg.ankle[0] * sg, P.leg.ankle[1], P.leg.ankle[2]], heelZ = ank[2] - 0.058 * F / 0.258;
  const R = table([[0.0, 0.012, 0.03, 0], [0.008, 0.025, 0.05, 0], [0.025, 0.031, 0.068, 0], [0.055, 0.033, 0.083, 0], [0.085, 0.035, 0.078, 0.002], [0.12, 0.04, 0.062, 0.004], [0.155, 0.045, 0.048, 0.006], [0.185, 0.048, 0.037, 0.007], [0.2, 0.048, 0.032, 0.007], [0.212, 0.045, 0.024, 0.007]].map(r => [r[0] * F / 0.258, r[1] * wF * P.W ** 0.5, r[2] * k, r[3]]));
  return {
    at(z, th) {
      const [hw, top, shift] = R(z), sn = Math.sin(th), cs = Math.cos(th), r = superR(sn, cs, hw, top * 0.5, 2.3);
      const x = sn * r - sg * shift, y = Math.max(0.002, top * 0.5 + cs * r);
      const tw = smooth(0.162 * F / 0.258, 0.19 * F / 0.258, z);
      return { p: [ank[0] + x, y, heelZ + z], w: [['foot' + s, 1 - tw], ['toe' + s, tw]] };
    },
  };
}

/** A shoe's foot by kind: boot, heavy, shoe, slipper, pointed, wrap, curl, sabaton. */
function shoeFoot(P, s, sr, c, c2, sole, rough, glow, lodPush) {
  const sg = s === 'L' ? -1 : 1, F = P.footLen, k = P.k, wF = P.fem ? 0.9 : 1, kind = sr.foot;
  const ank = [P.leg.ankle[0] * sg, P.leg.ankle[1], P.leg.ankle[2]];
  const heelZ = ank[2] - 0.066 * F / 0.258;
  const big = kind === 'heavy' || kind === 'sabaton' ? 1.1 : kind === 'slipper' || kind === 'wrap' || kind === 'curl' ? 0.95 : 1;
  const point = kind === 'pointed' || kind === 'curl' || kind === 'sabaton';
  const rows = [
    [0.0, 0.016, 0.06], [0.01, 0.03, 0.082], [0.03, 0.037, 0.098], [0.06, 0.039, 0.112], [0.09, 0.04, 0.1],
    [0.13, 0.045, 0.074], [0.17, 0.051, 0.058], [0.205, 0.053, 0.05], [0.235, 0.05, 0.042], [0.26, 0.042, 0.034], [0.272, 0.028, 0.026],
  ];
  if (point) rows.splice(rows.length - 1, 1, [0.272, 0.034, 0.03], [0.292, 0.022, 0.022], [0.312, 0.008, 0.014]);
  if (kind === 'slipper' || kind === 'curl' || kind === 'wrap') rows.forEach(r => { r[2] *= r[0] < 0.1 ? 0.86 : 0.94; });
  const R = table(rows.map(r => [r[0] * F / 0.258, r[1] * wF * P.W ** 0.5 * big, r[2] * k * (big > 1 ? 1.06 : 1)]));
  const us = rows.map(r => r[0] * F / 0.258);
  const zBall = 0.18 * F / 0.258, zEnd = us[us.length - 1];
  const soleH = kind === 'slipper' || kind === 'curl' || kind === 'wrap' ? 0.006 : kind === 'heavy' || kind === 'sabaton' ? 0.02 : 0.014;
  return {
    name: 'shoe' + s, lodThin: true, us, segs: 16, capStart: true, capEnd: true, offset: () => lodPush * 0.5,
    at(z, th) {
      const [hw, top] = R(z), sn = Math.sin(th), cs = Math.cos(th);
      const r = superR(sn, cs, hw, top * 0.5, kind === 'heavy' || kind === 'sabaton' ? 3 : 2.6);
      let x = sn * r, y = top * 0.5 + cs * r;
      y = Math.max(y, 0.0); if (cs < -0.25) y = 0;
      if (kind === 'curl') y += 0.035 * k * Math.pow(smooth(0.255 * F / 0.258, zEnd, z), 2);
      const p = [ank[0] + x - sg * 0.006 * smooth(0.1, 0.2, z / F), y, heelZ + z];
      const tw = smooth(zBall - 0.01, zBall + 0.03, z);
      return { p, w: [['foot' + s, 1 - tw], ['toe' + s, tw]], y, z };
    },
    color(z, th, p, smp) {
      if (smp.y < soleH * 0.75 * k) return sole;
      if (smp.y < soleH * k) return cmul(c, 0.68);
      let cc = paint(sr.mat, c, Math.sin(th) * 0.05, z);
      if (kind === 'sabaton' && ((z / (0.03 * F / 0.258)) % 1) < 0.2) cc = lift(cc, 0.3);
      if (kind === 'heavy' && z > 0.2 * F / 0.258) cc = lift(cc, 0.18);
      if (kind === 'wrap') cc = cmul(c, 0.86 + 0.14 * Math.sin((z * 60 + th * 1.5) * 2));
      if (kind === 'curl' && z > 0.25 * F / 0.258) cc = c2;
      return cc;
    },
    rough, glow, ao: 0.5,
  };
}
