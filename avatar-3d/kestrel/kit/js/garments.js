// Kestrel (opus) — garments: underwear (always on), and the test outfit (shirt, pants, boots).
//
// A garment is the BODY'S OWN SURFACE sampled again over part of its range, smoothed (`bump` < 1: cloth bridges the
// grooves between muscles) and pushed out along the normal (`offset`). It therefore carries the same skin weights as the
// skin under it and moves with it in every clip. The skin it covers is tagged with the garment's cover bit and is not
// drawn when the garment is worn (geo.js `finish`), so nothing can poke through.
import { clamp, lerp, smooth, gauss, adiff, cmul, cmix, hexLin, add, mul, sub, norm, cross, table, superR } from './kmath.js';
import { COVER } from './geo.js';
import { BRIEF_TOP } from './body.js';

const PI = Math.PI;

export function garmentIds(look = {}) {
  const top = String(look.top?.id || 'none').toLowerCase(), bottom = String(look.bottom?.id || 'none').toLowerCase(), shoes = String(look.shoes?.id || 'none').toLowerCase();
  const none = v => !v || v === 'none' || v === 'bare' || v === 'nothing';
  return {
    shirt: none(top) ? null : 'shirt',      // every top maps to the one shirt test 1 ships (tunic, robe, vest, jacket … → shirt)
    pants: none(bottom) ? null : 'pants',   // trousers, leggings, skirts … → pants
    boots: none(shoes) ? null : 'boots',    // shoes, sandals … → boots
  };
}

/** Where each garment starts and ends, in each part's own coordinates. */
export function fitOf(P, parts) {
  const k = P.k, fem = P.fem, leg = parts.legR, arm = parts.armR;
  const thighAt = f => leg.sH + f * (leg.sK - leg.sH);
  return {
    briefTop: (fem ? BRIEF_TOP.fem : BRIEF_TOP.masc) * k,
    briefBand: (fem ? 0.024 : 0.034) * k,
    briefLeg: thighAt(fem ? 0.2 : 0.46),
    braBot: 1.135 * k,
    // the bra's top edge around the body: a scoop between the cups, up to the strap roots, armpit height at the sides,
    // a deep U at the back with the racerback strap rising up the middle
    braTop: (() => { const T = table([[0, 1.284], [0.2, 1.294], [0.42, 1.318], [0.58, 1.336], [0.75, 1.318], [1.1, 1.295], [1.6, 1.288], [2.1, 1.262], [2.55, 1.245], [2.8, 1.29], [2.97, 1.355], [PI, 1.372]]); return th => T(Math.abs(Math.atan2(Math.sin(th), Math.cos(th))))[0] * k; })(),
    hem: (fem ? 0.93 : 0.965) * k,
    collar: th => (fem ? 1.368 : 1.455) * k - (fem ? 0.022 : 0.016) * k * gauss(th, 0.55),
    sleeve: arm.sJ + 0.48 * (arm.sE - arm.sJ),
    pantsTop: (fem ? 1.0 : 1.04) * k,
    pantsEnd: leg.sA - 0.03 * k,
    bootTop: leg.sA - (fem ? 0.21 : 0.225) * k,
    m: 0.016 * k, fem,
  };
}

/** Cover bits for a body vertex, given its part and coordinates. */
export function coverOf(part, u, th, fit) {
  const m = fit.m;
  let c = 0;
  // batch 4: clothes.js says what the clothes cover (`fit.extra`); only the underwear's own bits stay here
  if (fit.extra) {
    if (part === 'torso') { if (u < fit.briefTop - m) c |= COVER.BRIEFS; if (fit.fem && u > fit.braBot + m && u < fit.braTop(th) - m) c |= COVER.BRA; }
    else if (part === 'leg' && u < fit.briefLeg - m) c |= COVER.BRIEFS;
    return c | fit.extra(part, u, th);
  }
  if (part === 'torso') {
    if (u < fit.briefTop - m) c |= COVER.BRIEFS;
    if (fit.fem && u > fit.braBot + m && u < fit.braTop(th) - m) c |= COVER.BRA;
    if (u > fit.hem + m && u < fit.collar(th) - m * 0.6) c |= COVER.SHIRT;
    if (u < fit.pantsTop - m) c |= COVER.PANTS;
  } else if (part === 'leg') {
    if (u < fit.briefLeg - m) c |= COVER.BRIEFS;
    if (u < fit.pantsEnd - m) c |= COVER.PANTS;
    if (u > fit.bootTop + m) c |= COVER.BOOTS;
  } else if (part === 'arm') {
    if (u < fit.sleeve - m * 0.8) c |= COVER.SHIRT;
  } else if (part === 'foot') c |= COVER.BOOTS;
  return c;
}

const rowsBetween = (a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n); return out; };

/**
 * Every garment surface for this look. `worn` = garmentIds(look); `parts` = the body parts by name.
 * Returns surface specs for MeshBuilder.surface().
 */
export function garmentParts(P, parts, fit, worn, colors, lod = 0) {
  fit.fem = P.fem;
  const out = [], k = P.k, fem = P.fem;
  const T = parts.torso, Lg = { L: parts.legL, R: parts.legR }, Ar = { L: parts.armL, R: parts.armR };
  const q = lod ? 0.5 : 1;
  const nr = n => Math.max(2, Math.round(n * q));
  const under = colors.under, band = colors.underBand;

  // ------------------------------------------------------------------ underwear: briefs (him) / shorts (her)
  {
    const top = fit.briefTop, bottom = T.y0;
    const us = rowsBetween(bottom, top, nr(7));
    us.splice(us.length - 1, 0, top - fit.briefBand, top - fit.briefBand * 0.8);
    us.sort((a, b) => a - b);
    out.push({
      name: 'briefsTorso', us, segs: Math.round(T.segs * (lod ? 0.5 : 0.85)), capStart: true,
      at: (y, th) => T.at(y, th, { bump: 1, pad: (yy, t) => (!fem ? 0.012 * gauss(t, 0.32) * gauss(yy - 0.875 * k, 0.03) : 0) + 0.004 * gauss(adiff(Math.abs(t), PI), 0.12) * (1 - smooth(0.9 * k, 0.97 * k, yy)) }),
      offset: (y) => 0.005 + 0.0018 * smooth(top - fit.briefBand, top, y),
      color: (y, th) => {
        const b = y > top - fit.briefBand ? band : under;
        const seam = gauss(adiff(Math.abs(th), PI / 2), 0.025) + (fem ? 0 : gauss(Math.abs(th) - 0.32, 0.02) * (1 - smooth(0.93 * k, 0.97 * k, y)));
        return cmix(b, band, Math.min(1, seam) * 0.6);
      },
      mask: (y) => COVER.PANTS | (y > fit.hem + fit.m ? COVER.SHIRT : 0), rough: 0.85, ao: 0.6,
    });
    for (const s of ['L', 'R']) {
      const leg = Lg[s];
      const end = fit.briefLeg, cuff = (fem ? 0.012 : 0.014) * k;
      const us2 = rowsBetween(leg.us[0], end, nr(6)); us2.splice(us2.length - 1, 0, end - cuff); us2.sort((a, b) => a - b);
      out.push({
        name: 'briefsLeg' + s, us: us2, segs: leg.segs,
        at: (u, th) => leg.at(u, th, { bump: 1 }),
        offset: (u) => 0.005 + 0.001 * smooth(end - cuff, end, u),
        color: (u, th) => {
          const t = s === 'L' ? -th : th;
          const seam = gauss(adiff(t, PI / 2), 0.04) * (fem ? 1 : 0.8) + (fem ? gauss(adiff(t, 0.5), 0.035) : 0);
          return u > end - cuff ? band : cmix(under, band, Math.min(1, seam) * 0.55);
        },
        mask: COVER.PANTS, rough: 0.85, ao: 0.6,
      });
    }
  }
  // ------------------------------------------------------------------ underwear: sports bra (her)
  if (fem) {
    const vs = [0, 0.12, 0.25, 0.42, 0.6, 0.78, 0.9, 1];
    // v2: the band bridges the cleavage (a sports bra is one smooth shell, not a V)
    const bustPad = (y, th) => 0.012 * gauss(th, 0.25) * gauss(y - 1.225 * k, 0.035) + 0.009 * gauss(th, 0.2) * smooth(1.2 * k, 1.27 * k, y);
    out.push({
      name: 'bra', us: vs, segs: 40, theta: (j, n) => (j / n) * PI * 2 - PI,
      at: (v, th) => { const y = lerp(fit.braBot, fit.braTop(th), v); const r = T.at(y, th, { bump: 1, pad: bustPad }); r.v = v; return r; },
      offset: (v) => 0.0038 + 0.0012 * (v < 0.15 ? 1 : 0),
      color: (v, th) => (v < 0.17 ? band : (v > 0.93 ? cmix(under, band, 0.3) : under)),
      mask: COVER.SHIRT, rough: 0.82, ao: 0.6,
    });
    // straps: a band ~3 cm wide from each cup over the top of the shoulder, down to the racerback at the back centre
    const path = table([[0, 0.58, 1.333], [0.25, 0.7, 1.352], [0.5, 0.98, 1.364], [0.7, 1.7, 1.364], [0.86, 2.45, 1.356], [1, 2.98, 1.352]]);
    const pAt = (t, sg) => { const [a, y] = path(t); return T.at(Math.min(y * k, T.y1 - 0.003), sg * a, { bump: 1 }).p; };
    for (const sg of [-1, 1]) {
      out.push({
        name: 'strap', us: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], segs: 2, wrap: false, t0: 0, t1: 1,
        at: (t, v) => {
          const p = pAt(t, sg), tn = norm(sub(pAt(Math.min(1, t + 0.02), sg), pAt(Math.max(0, t - 0.02), sg)));
          const radial = norm([p[0], 0, p[2]]);
          const across = norm(cross(tn, radial));
          const w = 0.026 * k * (t > 0.9 ? lerp(1, 0.6, (t - 0.9) / 0.1) : 1);
          const q = add(p, mul(across, (v - 0.5) * w));
          const y = Math.min(P.yInv(q[1]), T.y1 - 0.003), th = Math.atan2(q[0], q[2]);   // q is a real height; T.at takes v1 heights
          return T.at(y, th, { bump: 1 });
        },
        offset: () => 0.0048, out: (p) => [p[0], 0.2, p[2]],
        color: () => under, mask: COVER.SHIRT, rough: 0.82,
      });
    }
  }
  // batch 4: with clothes.js in charge (`fit.extra`), the underwear says what covers it, and the test outfit is not built here
  if (fit.extra) { for (const g of out) g.mask = (u, th, p) => fit.extra(g.name, u, th, p); return out; }
  // ------------------------------------------------------------------ shirt
  if (worn.shirt) {
    const c = colors.shirt;
    const top = th => fit.collar(th);
    const vs = [0, 0.06, 0.18, 0.32, 0.46, 0.6, 0.72, 0.82, 0.9, 0.96, 1];
    out.push({
      name: 'shirt', us: vs, segs: 34, theta: (j, n) => (j / n) * PI * 2 - PI,
      at: (v, th) => {
        const y = lerp(fit.hem, top(th), v);
        const pad = (yy, t) => fem ? 0.016 * gauss(t, 0.45) * smooth(1.27 * k, 1.12 * k, yy) * smooth(1.0 * k, 1.12 * k, yy) : 0.006 * gauss(t, 0.5) * smooth(1.26 * k, 1.18 * k, yy) * smooth(1.06 * k, 1.16 * k, yy);
        const r = T.at(y, th, { bump: fem ? 0.8 : 0.6, pad }); r.v = v; return r;
      },
      offset: (v) => lerp(0.026, 0.01, smooth(0.0, 0.6, v)) + (v > 0.97 ? 0.004 : 0),
      mask: (v, th, p) => (Ar.L.patchHit(p) || Ar.R.patchHit(p)) ? COVER.PATCH : 0,   // v2: under the sleeve's shoulder patch
      color: (v, th) => v < 0.04 ? cmul(c, 0.85) : v > 0.94 ? cmul(c, 0.82) : cmul(c, 1 - 0.05 * gauss(adiff(Math.abs(th), PI / 2), 0.05)),
      rough: 0.9, ao: 0.5,
    });
    for (const s of ['L', 'R']) {
      const arm = Ar[s], end = fit.sleeve;
      const us = [arm.us[0], ...arm.us.filter(u => u > 0 && u < end - 0.008), end - 0.012, end];
      out.push({
        name: 'sleeve' + s, us, segs: arm.segs, capStart: !arm.sR, out: arm.out, normal: arm.normal,
        at: (u, th) => arm.at(u, th, { bump: 0.7 }),
        offset: (u) => lerp(0.008, 0.014, smooth(0.04, end, u)),
        color: (u) => u > end - 0.013 ? cmul(c, 0.85) : c,
        rough: 0.9, ao: 0.5,
      });
    }
  }
  // ------------------------------------------------------------------ pants
  if (worn.pants) {
    const c = colors.pants, top = fit.pantsTop;
    const us = rowsBetween(T.y0, top, nr(8)); us.splice(us.length - 1, 0, top - 0.035 * k, top - 0.03 * k); us.sort((a, b) => a - b);
    out.push({
      name: 'pantsTorso', us, segs: Math.round(T.segs * (lod ? 0.6 : 1)), capStart: true,
      at: (y, th) => T.at(y, th, { bump: 0.7 }),
      offset: (y) => 0.0085 + 0.002 * smooth(top - 0.035 * k, top, y),
      color: (y, th) => y > top - 0.034 * k ? cmul(c, 0.75) : cmul(c, 1 - 0.07 * gauss(adiff(Math.abs(th), PI / 2), 0.04)),
      mask: (y) => (y > fit.hem + fit.m ? COVER.SHIRT : 0), rough: 0.92, ao: 0.6,
    });
    for (const s of ['L', 'R']) {
      const leg = Lg[s], end = fit.pantsEnd;
      const us2 = [...leg.us.filter(u => u < end - 0.01), end];
      out.push({
        name: 'pantsLeg' + s, us: us2, segs: leg.segs,
        at: (u, th) => leg.at(u, th, { bump: 0.6 }),
        offset: (u) => lerp(0.009, 0.016, smooth(leg.sK - 0.1, leg.sA, u)),
        color: (u, th) => { const t = s === 'L' ? -th : th; return cmul(c, 1 - 0.08 * gauss(adiff(t, PI / 2), 0.04) - 0.05 * gauss(adiff(t, PI), 0.6) * gauss(u - leg.sK, 0.03)); },
        mask: (u) => (u > fit.bootTop + fit.m ? COVER.BOOTS : 0), rough: 0.92, ao: 0.6,
      });
    }
  }
  // ------------------------------------------------------------------ boots
  if (worn.boots) {
    const c = colors.boots, sole = colors.sole;
    for (const s of ['L', 'R']) {
      const leg = Lg[s], top = fit.bootTop;
      const us = [top, top + 0.012, ...leg.us.filter(u => u > top + 0.02 && u < leg.sA + 0.02), leg.sA + 0.02];
      out.push({
        name: 'bootShaft' + s, us, segs: leg.segs,
        at: (u, th) => leg.at(u, th, { bump: 0.6 }),
        offset: (u) => (worn.pants ? 0.021 : 0.011) + (u < top + 0.011 ? 0.0025 : 0) - 0.004 * smooth(leg.sA - 0.06, leg.sA, u) * (worn.pants ? 0 : 1),
        color: (u) => u < top + 0.011 ? cmul(c, 0.78) : c,
        rough: 0.6, ao: 0.5,
      });
      out.push(bootFoot(P, s, c, sole, worn));
    }
  }
  return out;
}

/** The boot's foot: the foot's own shape, roomier, a toe box over the toes and a sole with a heel. */
function bootFoot(P, s, c, sole, worn) {
  const sg = s === 'L' ? -1 : 1, F = P.footLen, k = P.k, wF = P.fem ? 0.9 : 1;
  const ank = [P.leg.ankle[0] * sg, P.leg.ankle[1], P.leg.ankle[2]];
  const heelZ = ank[2] - 0.066 * F / 0.258;
  const R = table([
    [0.0, 0.016, 0.06], [0.01, 0.03, 0.082], [0.03, 0.037, 0.098], [0.06, 0.039, 0.112], [0.09, 0.04, 0.1],
    [0.13, 0.045, 0.074], [0.17, 0.051, 0.058], [0.205, 0.053, 0.05], [0.235, 0.05, 0.042], [0.26, 0.042, 0.034], [0.272, 0.028, 0.026],
  ].map(r => [r[0] * F / 0.258, r[1] * wF * P.W ** 0.5, r[2] * k]));
  const us = [0, 0.01, 0.03, 0.06, 0.09, 0.13, 0.17, 0.205, 0.235, 0.26, 0.272].map(v => v * F / 0.258);
  const zBall = 0.18 * F / 0.258;
  return {
    name: 'bootFoot' + s, us, segs: 16, capStart: true, capEnd: true,
    at(z, th) {
      const [hw, top] = R(z);
      const sn = Math.sin(th), cs = Math.cos(th);
      const r = superR(sn, cs, hw, top * 0.5, 2.6);
      let x = sn * r, y = top * 0.5 + cs * r;
      y = Math.max(y, 0.0);
      if (cs < -0.25) y = 0;
      const p = [ank[0] + x - sg * 0.006 * smooth(0.1, 0.2, z / F), y, heelZ + z];
      const tw = smooth(zBall - 0.01, zBall + 0.03, z);
      return { p, w: [['foot' + s, 1 - tw], ['toe' + s, tw]], y };
    },
    color(z, th, p, smp) { return smp.y < 0.014 * k ? sole : (smp.y < 0.019 * k ? cmul(c, 0.7) : c); },
    rough: 0.55, ao: 0.5,
  };
}
