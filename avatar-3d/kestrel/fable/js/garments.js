// Kestrel (fable) — garments. A garment is the BODY'S OWN PROFILE grown outward a few millimetres over a range
// (the same key profiles and sculpt the skin uses, so a shirt follows the chest exactly and skins to the same
// bones), plus trims (waistband, collar, cuffs, straps, soles). Each garment also says what it HIDES: ranges of the
// torso / arm / leg / foot where the skin under it is not built, and lower layers (pants hide the underwear).
//
// Slots: underwear (always; shorts for both, plus a sports top on a fem body), top 'shirt', bottom 'pants',
// shoes 'boots'. Any other id maps to the nearest, or nothing.
import { loft, ringY, ringZ, lerp, clamp, sstep, shade, mix, mirrorX } from './geometry.js';
import { ringsFrom, torsoKeys, torsoSculpt, torsoWeights, torsoPoint, legKeys, legSculpt, legWeights, armKeys, armSculpt, armWeights, footKeys } from './body.js';
import { tube } from './hair.js';

const PI = Math.PI, HALF = PI / 2, FRONT = HALF, BACK = 3 * HALF;
const sided = (w, s) => w.map(([b, k]) => [b.replace('%s', s), k]);
const UNDER = '#3a3d46', UNDER_BAND = '#8b9099';

export function topIdFor(id) { const s = String(id || 'none').toLowerCase(); if (s === 'none' || s === '') return 'none'; return 'shirt'; }
export function bottomIdFor(id) { const s = String(id || 'none').toLowerCase(); if (s === 'none' || s === '') return 'none'; return 'pants'; }
export function shoesIdFor(id) { const s = String(id || 'none').toLowerCase(); if (s === 'none' || s === '') return 'none'; return 'boots'; }

/**
 * Resolve the look's garments: returns { hides: { torso(y), arm(t), leg(t), foot(z), layers:Set }, build(rig, detail) → pieces by space }.
 * Pieces come back as { world: [], armR: [], legR: [], footR: [] } — the right-side pieces are mirrored by the caller.
 */
export function resolveOutfit(look) {
  const top = topIdFor(look.top?.id), bottom = bottomIdFor(look.bottom?.id), shoes = shoesIdFor(look.shoes?.id);
  const colors = { top: look.top?.color || '#56708c', bottom: look.bottom?.color || '#3e3a33', shoes: look.shoes?.color || '#5b3b24' };
  const layers = new Set();
  if (bottom !== 'none') layers.add('shorts');
  if (top !== 'none') layers.add('bra');
  return {
    ids: { top, bottom, shoes }, colors, layers,
    hidesFor(d) {
      const T = d.hipJointY - d.kneeY, C = d.kneeY - d.ankleY, L = T + C;
      const torso = [], arm = [], leg = [], foot = [];
      // underwear: hips to crotch; the shorts' legs down a quarter of the thigh
      torso.push([d.crotch - 1, d.hipY + 0.035]); leg.push([-T * 0.22, 1]);
      if (d.fem) torso.push([d.underBust - 0.012, d.chestY + 0.03]);
      if (top !== 'none') { torso.push([d.hipY - 0.03, d.neckBase - 0.012]); arm.push([-d.upperArm * 0.42, 1]); }
      if (bottom !== 'none') { torso.push([d.crotch - 1, d.hipY + 0.045]); leg.push([-L + 0.012, 1]); }
      if (shoes !== 'none') { leg.push([-L - 1, -L + C * 0.3]); foot.push([-1, 1]); }
      const inAny = (ranges) => (v) => ranges.some(([a, b]) => v >= a && v <= b);
      return { torso: inAny(torso), arm: inAny(arm), leg: inAny(leg), foot: inAny(foot), layers };
    },
  };
}

/** Build every garment piece for the outfit. */
export function buildGarments(rig, outfit, detail) {
  const d = rig.d, out = { world: [], armR: [], legR: [], footR: [] };
  const S = detail ? 28 : 14, SL = detail ? 20 : 10, SA = detail ? 18 : 10;
  const T = d.hipJointY - d.kneeY, C = d.kneeY - d.ankleY, L = T + C;
  const tKeys = torsoKeys(d), tSculpt = torsoSculpt(d), tW = torsoWeights(rig);
  const lKeys = legKeys(d), lSculpt = legSculpt(d), lW = legWeights(rig);
  const aKeys = armKeys(d), aSculpt = armSculpt(d), aW = armWeights(rig);
  const torsoPart = (y0, y1, grow, count, color, opts = {}) => loft(ringsFrom(tKeys, count, tW, { t0: y0, t1: y1, grow }), S, { sculpt: tSculpt, color, capStart: opts.capStart || false, capEnd: opts.capEnd || false, tag: 'garment' });
  const legPart = (t0, t1, grow, count, color, opts = {}) => loft(ringsFrom(lKeys, count, y => sided(lW(y), 'R'), { t0, t1, grow }), SL, { sculpt: lSculpt, color, capStart: !!opts.capStart, capEnd: !!opts.capEnd, tag: 'garment' });
  const armPart = (t0, t1, grow, count, color, opts = {}) => loft(ringsFrom(aKeys, count, y => sided(aW(y), 'R'), { t0, t1, grow }), SA, { sculpt: aSculpt, color, capStart: !!opts.capStart, capEnd: !!opts.capEnd, tag: 'garment' });

  // ---- underwear shorts (under pants they are not built)
  if (!outfit.layers.has('shorts')) {
    const waist = d.hipY + 0.035;
    const body = torsoPart(d.crotch - 0.008, waist - 0.014, 0.006, detail ? 9 : 5, UNDER, { capStart: true });
    seamPaint(body, UNDER);
    out.world.push(body);
    out.world.push(torsoPart(waist - 0.016, waist + 0.004, 0.0085, 3, UNDER_BAND));                       // waistband
    out.legR.push(legPart(-T * 0.24, 0.045, 0.006, detail ? 5 : 3, UNDER));
    out.legR.push(legPart(-T * 0.25, -T * 0.21, 0.0075, 2, shade(UNDER, 1.35)));                           // hem
  }
  // ---- sports top (fem; under a shirt it is not built)
  if (d.fem && !outfit.layers.has('bra')) {
    out.world.push(torsoPart(d.underBust - 0.012, d.chestY + 0.03, 0.007, detail ? 7 : 4, UNDER));
    out.world.push(torsoPart(d.underBust - 0.014, d.underBust + 0.004, 0.0085, 2, UNDER_BAND));
    // straps: from the top front over the shoulders to the centre back (racerback)
    // the straps follow the torso's own surface: up from the cups, over the trapezius, down to a racerback join
    for (const sg of [-1, 1]) {
      const side = sg > 0 ? 0 : PI, s0 = sg > 0 ? 1 : -1;
      const P = (y, a, grow) => torsoPoint(d, y, a, grow, tSculpt);
      const pts = [P(d.chestY + 0.028, FRONT - s0 * 0.5, 0.012), P(d.chestY + 0.07, FRONT - s0 * 0.75, 0.011), P(d.shoulderY + 0.012, FRONT - s0 * 1.2, 0.01), P(d.shoulderY + 0.036, side, 0.01), P(d.shoulderY + 0.012, BACK + s0 * 1.2, 0.01), P(d.chestY + 0.05, BACK + s0 * 0.35, 0.009), P(d.chestY + 0.02, BACK, 0.009)];
      out.world.push(tube(pts, [0.008, 0.0085, 0.009, 0.009, 0.0085, 0.008, 0.008], detail ? 6 : 5, detail ? 10 : 6, () => [['chest', 1]], UNDER));
    }
  }
  // ---- shirt: body + short sleeves + collar
  if (outfit.ids.top === 'shirt') {
    const c = outfit.colors.top;
    out.world.push(torsoPart(d.hipY - 0.03, d.neckBase - 0.012, 0.008, detail ? 14 : 7, c));
    out.world.push(torsoPart(d.hipY - 0.032, d.hipY - 0.016, 0.0095, 2, shade(c, 0.8)));                 // hem
    out.world.push(torsoPart(d.neckBase - 0.016, d.neckBase + 0.012, 0.009, 3, shade(c, 0.85)));          // collar
    out.armR.push(armPart(-d.upperArm * 0.45, 0.05, 0.008, detail ? 6 : 4, c));
    out.armR.push(armPart(-d.upperArm * 0.47, -d.upperArm * 0.41, 0.0095, 2, shade(c, 0.8)));            // cuff
  }
  // ---- pants: hips to the ankle, a waistband and turned cuffs
  if (outfit.ids.bottom === 'pants') {
    const c = outfit.colors.bottom, waist = d.hipY + 0.045;
    out.world.push(torsoPart(d.crotch - 0.01, waist - 0.012, 0.009, detail ? 8 : 4, c, { capStart: true }));
    out.world.push(torsoPart(waist - 0.014, waist + 0.006, 0.011, 3, shade(c, 0.75)));
    const legs = ringsFrom(lKeys, detail ? 14 : 7, y => sided(lW(y), 'R'), { t0: -L + 0.012, t1: 0.045, grow: 0.009 });
    for (const r of legs) { const k = 1 + 0.35 * sstep(-r.c[1], T * 0.3, L - 0.05); r.ru += 0.004 * k; r.rv += 0.004 * k; }   // looser toward the shin
    out.legR.push(loft(legs, SL, { sculpt: lSculpt, color: c, tag: 'garment' }));
    out.legR.push(legPart(-L + 0.008, -L + 0.03, 0.017, 2, shade(c, 0.78)));                             // cuff
  }
  // ---- boots: the foot grown, a sole, and a shaft up the calf with a cuff
  if (outfit.ids.shoes === 'boots') {
    const c = outfit.colors.shoes, a = d.ankleY, fl = d.footLen;
    const fk = footKeys(d).map(k => ({ ...k, rx: k.rx + 0.007, ry: k.ry + 0.006, y: k.y + 0.002, n: Math.min(k.n + 0.3, 3.2) }));
    fk[fk.length - 1].t += 0.012; fk[fk.length - 1].rx -= 0.004;
    out.footR.push(loft(ringsFrom(fk, detail ? 9 : 6, (z) => [['footR', 1 - sstep(z, fl * 0.3, fl * 0.5) * 0.9], ['toesR', sstep(z, fl * 0.3, fl * 0.5) * 0.9]], { axis: 'z' }), detail ? 14 : 8, { capStart: true, capEnd: true, color: c, tag: 'boot' }));
    // sole: a flat slab under the boot
    const sole = ringsFrom(fk.map(k => ({ ...k, t: k.t, rx: k.rx + 0.004, ry: 0.009, y: -a - 0.003 })), detail ? 9 : 6, (z) => [['footR', 1 - sstep(z, fl * 0.3, fl * 0.5) * 0.9], ['toesR', sstep(z, fl * 0.3, fl * 0.5) * 0.9]], { axis: 'z' });
    out.footR.push(loft(sole, detail ? 14 : 8, { capStart: true, capEnd: true, color: shade(c, 0.45), tag: 'sole' }));
    // shaft: ankle collar up the shin, skinned to the foot low and the knee bone higher
    const shaft = ringsFrom(lKeys, detail ? 6 : 4, y => sided(lW(y), 'R'), { t0: -L - 0.01, t1: -L + C * 0.32, grow: 0.011 });
    out.legR.push(loft(shaft, SL, { sculpt: lSculpt, color: c, tag: 'boot' }));
    out.legR.push(legPart(-L + C * 0.3, -L + C * 0.36, 0.016, 2, shade(c, 0.8)));                         // cuff
  }
  return out;
}

function blend3(t, d) {
  // a strap runs chest (front) -> chest (shoulder) -> chest (back); keep it on the chest bone
  return [['chest', 1]];
}

/** Paint faint lighter seams down the sides and the front of a pair of shorts (vertex colours only). */
function seamPaint(piece, base) {
  const light = shade(base, 1.45);
  piece.colorAt = (x, y, z) => {
    const a = Math.atan2(z, x);
    const seam = Math.max(gauss2(a, 0.12, 0.05), gauss2(a, PI - 0.12, 0.05), gauss2(a, FRONT, 0.03) * 0.6);
    return seam > 0.3 ? mix(base, light, seam * 0.7) : null;
  };
}
function gauss2(a, c, w) { let dd = (a - c) % (2 * PI); if (dd > PI) dd -= 2 * PI; if (dd < -PI) dd += 2 * PI; return Math.exp(-(dd * dd) / (2 * w * w)); }

export { mirrorX };
