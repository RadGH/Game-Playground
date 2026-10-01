// Chibi 3 hair and beards: sculpted, the way stylised games model hair — a solid mass laid on the
// scalp, combed with grooves that run the way the hair grows, plus the strand detail tile. No Three.js.
//
// The scalp mask is a HAIRLINE around the head (front, temples, over the ears, sideburns, the nape),
// and the hair's thickness tapers to nothing at it, so the hair grows out of the skin instead of
// sitting on it like a cap. Long hair, tails, buns and beards add volumes on top; anything that hangs
// is weighted to the hair / beard spring chains so it swings.

import { Shape, sphere, ellipsoid, cone, noise3, smoothstep } from './sdf.js';
import { paint, shadeHex, mixHex } from './paint.js';
import { jointWeights, chainWeights, mixWeights } from './skin.js';

/** Hairline height (head units) by angle around the head (0 = straight ahead). */
const HAIRLINE = [[0, 0.615], [0.55, 0.585], [0.9, 0.5], [1.15, 0.44], [1.9, 0.43], [2.35, 0.27], [Math.PI, 0.1]];
function hairlineAt(theta) {
  const a = Math.abs(theta);
  for (let i = 1; i < HAIRLINE.length; i++) if (a <= HAIRLINE[i][0]) { const [a0, y0] = HAIRLINE[i - 1], [a1, y1] = HAIRLINE[i]; return y0 + (y1 - y0) * (a - a0) / (a1 - a0); }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

export const HAIR_STYLES = ['short', 'long', 'wavy', 'ponytail', 'bun', 'topknot', 'mohawk', 'braids', 'buzz', 'slicked', 'side_part', 'bald'];

/** Map any hair id to a style we build. */
export function hairStyle(id = 'short') {
  if (!id || id === 'bald' || id === 'none') return 'bald';
  if (/mohawk/.test(id)) return 'mohawk';
  if (/pony/.test(id)) return 'ponytail';
  if (/topknot/.test(id)) return 'topknot';
  if (/bun/.test(id)) return 'bun';
  if (/braid/.test(id)) return 'braids';
  if (/buzz|stubble|shaved|crew/.test(id)) return 'buzz';
  if (/wavy|curly|afro/.test(id)) return 'wavy';
  if (/long|bob|hood_hair/.test(id)) return 'long';
  if (/slick/.test(id)) return 'slicked';
  if (/side|part|bangs|pixie|spiky/.test(id)) return 'side_part';
  return 'short';
}

/**
 * Add hair. `covered` (0..1) says how much of the head a hat or helm hides — a helm hides it all, a
 * wizard's hat leaves what falls below the brim.
 */
export function buildHair(ctx, { covered = 0, brimY = null } = {}) {
  const { a, R, body, asm } = ctx, style = hairStyle(a.hair?.id);
  if (style === 'bald') return;
  const hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2], S = R.P.S;
  const color = a.hair?.color || '#3b2a1a';
  const toHead = (x, y, z) => [x / hs, (y - headY) / hs, (z - hz) / hs];
  const longish = ['long', 'wavy', 'braids'].includes(style);
  const thick = { short: 0.05, long: 0.06, wavy: 0.075, ponytail: 0.032, bun: 0.035, topknot: 0.03, mohawk: 0.0, braids: 0.04, buzz: 0.006, slicked: 0.035, side_part: 0.055 }[style];
  // shaved sides: the scalp darkens where hair would grow (a mohawk's sides, a buzz cut)
  if (style === 'mohawk' || style === 'buzz') {
    const stubble = paint('skin', mixHex(a.body?.skin || '#e8b994', color, 0.45), { detail: 0.6, tile: 4 });
    body.shape.add({ op: 'paint', k: 0, box: null, band: 0.003, paint: stubble, d: (x, y, z) => { const [hx, hy, hzz] = toHead(x, y, z); return (hairlineAt(Math.atan2(hx, hzz)) - hy) * hs; } });
  }
  const sh = new Shape([], { name: 'hair', base: body.shape, offset: 0.0012 * S, basePaint: paint('hair', color) });
  // thickness grows from nothing at the hairline to `thick` (head units) a little above it
  const grooveN = style === 'slicked' ? 26 : 34;
  sh.displace = (x, y, z) => {
    const [hx, hy, hzz] = toHead(x, y, z), th = Math.atan2(hx, hzz);
    const above = hy - hairlineAt(th);
    if (above < -0.02) return 0;
    // (+0.0027 head units lifts it clear of the skin; at the hairline it is still under the skin, so
    // the cut edge of the hair mask is hidden and the hairline is a smooth line, not a stair)
    let t = (thick + 0.011) * smoothstep(-0.01, 0.07, above);
    // the crown sits higher: more volume on top than at the sides
    t *= 0.75 + 0.45 * smoothstep(0.35, 0.75, hy);
    if (style === 'side_part') t += 0.025 * smoothstep(0.45, 0.7, hy) * smoothstep(-0.2, 0.2, hx) * smoothstep(-0.2, 0.3, hzz);
    if (style === 'slicked') t *= 0.85;
    // combed grooves along the meridians, wobbling a little
    const g = Math.abs(Math.sin(th * grooveN + noise3(hx * 4, hy * 4, hzz * 4) * 1.8 + (style === 'wavy' ? Math.sin(hy * 30) * 0.8 : 0)));
    return (t - 0.006 * (1 - g) * smoothstep(0, 0.05, above)) * hs;
  };
  const hairMask = (x, y, z) => { const [hx, hy, hzz] = toHead(x, y, z); return (hairlineAt(Math.atan2(hx, hzz)) - 0.03 - hy) * hs; };
  // volumes
  const vol = [];
  const H = (x, y, z) => [x * hs, headY + y * hs, hz + z * hs];
  const hairPaint = paint('hair', color);
  if (longish) {
    // a curtain behind the head down to the shoulder blades
    vol.push(Object.assign(ellipsoid(H(0, 0.05, -0.33), [0.33 * hs, 0.55 * hs, 0.14 * hs]), { k: 0.08 * hs, paint: hairPaint }));
    for (const s of [1, -1]) vol.push(Object.assign(cone(H(s * 0.25, 0.42, -0.12), H(s * 0.3, -0.25, -0.2), 0.12 * hs, 0.07 * hs), { k: 0.06 * hs, paint: hairPaint }));
  }
  if (style === 'ponytail' || style === 'braids') {
    const tails = style === 'braids' ? [-0.12, 0.12] : [0];
    for (const tx of tails) {
      const p0 = H(tx, 0.42, -0.43), p1 = H(tx * 1.3, 0.05, -0.55), p2 = H(tx * 1.4, -0.45, -0.5);
      vol.push(Object.assign(sphere(p0, 0.075 * hs), { k: 0.03 * hs, paint: hairPaint }));
      vol.push(Object.assign(cone(p0, p1, 0.07 * hs, 0.06 * hs), { k: 0.03 * hs, paint: hairPaint }));
      vol.push(Object.assign(cone(p1, p2, 0.06 * hs, 0.02 * hs), { k: 0.03 * hs, paint: hairPaint }));
    }
  }
  if (style === 'bun' || style === 'topknot') {
    const c = style === 'bun' ? H(0, 0.62, -0.38) : H(0, 0.86, -0.12);
    vol.push(Object.assign(sphere(c, 0.12 * hs), { k: 0.04 * hs, paint: hairPaint }));
    if (style === 'topknot') vol.push(Object.assign(cone(c, H(0, 1.02, -0.2), 0.06 * hs, 0.02 * hs), { k: 0.03 * hs, paint: hairPaint }));
  }
  if (style === 'mohawk') {
    // a crest from the brow to the nape, tallest over the crown
    for (let i = 0; i < 7; i++) {
      const t = i / 6, ang = -0.45 + t * 2.5;     // 0 = straight up; positive leans back
      const h = (0.1 + 0.09 * Math.sin(t * Math.PI)) * (1 - t * 0.35);
      const r = 0.4 + h * 0.6;
      const p = H(0, 0.43 + Math.cos(ang) * r, -0.08 - Math.sin(ang) * r);
      vol.push(Object.assign(ellipsoid(p, [0.04 * hs, h * hs, 0.085 * hs], { rot: [-ang, 0, 0] }), { k: 0.035 * hs, paint: hairPaint }));
    }
  }
  const crestMask = style === 'mohawk' ? (x, y, z) => Math.max(hairMask(x, y, z), Math.abs(x) - 0.05 * hs) : hairMask;
  // a hat or helm hides the hair it covers
  const capMask = covered >= 1 ? () => 1 : brimY != null ? (x, y, z) => y - (brimY) : () => -1;
  // volumes are free of the hairline mask (a tail hangs below it), but not of the hat
  const volumeShape = new Shape(vol.slice(), { name: 'hairVol' });
  for (const v of vol) sh.add(v);
  sh.add({ op: 'inter', k: 0, box: null, d: (x, y, z) => Math.max(Math.min(crestMask(x, y, z), vol.length ? volumeShape.eval(x, y, z) + 0.004 : 1e9), capMask(x, y, z)) });
  // hair that hangs follows the hair chain; the rest rides the head
  const hairBones = ['hair1', 'hair2', 'hair3'], hairTop = R.byName.hair1.pos[1], hairLen = hairTop - (R.byName.hair3.pos[1] - (R.byName.hair2.pos[1] - R.byName.hair3.pos[1]));
  const weights = (x, y, z) => {
    const headW = [[R.byName.head.index, 1]];
    if (!(longish || style === 'ponytail' || style === 'braids')) return headW;
    const [, hy, hzz] = toHead(x, y, z);
    const behind = smoothstep(-0.05, -0.25, hzz), below = smoothstep(0.3, 0.0, hy);
    const t = Math.max(0, (hairTop - y) / hairLen);
    return mixWeights(headW, chainWeights(R, hairBones, t, 'head'), behind * below);
  };
  const b = [-0.62 * hs, headY - (longish || style === 'ponytail' || style === 'braids' ? 0.75 : 0.25) * hs, hz - 0.7 * hs, 0.62 * hs, headY + (style === 'topknot' ? 1.15 : style === 'mohawk' ? 1.12 : 0.98) * hs, hz + 0.5 * hs];
  asm.addField({ name: 'hair', shape: sh, owner: body.shape, step: 0.005, bounds: b, covers: true, hideable: true, hideDepth: 0.004, weights, aoStrength: 0.8, minLod: 0, maxLod: 1 });
  // LOD 2: one coarse lump of the same thing
  asm.addField({ name: 'hairLow', shape: sh, owner: body.shape, step: 0.012, stepFixed: true, bounds: b, covers: true, hideable: false, weights, minLod: 2, maxLod: 2 });
}

/** Map facial hair ids to a beard style. */
export function beardStyle(id = 'none') {
  if (!id || id === 'none') return 'none';
  if (/stubble|shadow/.test(id)) return 'stubble';
  if (/long|wizard|sage/.test(id)) return 'long';
  if (/braid|dwarf/.test(id)) return 'braided';
  if (/goatee/.test(id)) return 'goatee';
  if (/mustache|moustache/.test(id)) return 'mustache';
  if (/chin/.test(id)) return 'short';
  return 'full';
}

export function buildBeard(ctx) {
  const { a, R, body, asm } = ctx, style = beardStyle(a.facialHair?.id);
  if (style === 'none') return;
  const hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2], S = R.P.S;
  const color = a.facialHair?.color || a.hair?.color || '#3b2a1a';
  const my = (body.mouth.y - headY) / hs, mz = (body.mouth.z - hz) / hs;
  const toHead = (x, y, z) => [x / hs, (y - headY) / hs, (z - hz) / hs];
  if (style === 'stubble') {
    body.shape.add({ op: 'paint', k: 0, box: null, band: 0.004, paint: paint('skin', mixHex(a.body?.skin || '#e8b994', color, 0.35), { detail: 0.7, tile: 4 }), d: (x, y, z) => beardRegion(...toHead(x, y, z), my, mz, 'full') * hs });
    return;
  }
  const H = (x, y, z) => [x * hs, headY + y * hs, hz + z * hs];
  const hairPaint = paint('hair', color, { rough: 0.7 });
  const thick = { full: 0.05, short: 0.03, goatee: 0.04, mustache: 0.035, long: 0.06, braided: 0.06 }[style];
  const vol = [];
  if (style === 'long' || style === 'braided') {
    vol.push(Object.assign(cone(H(0, -0.12, 0.25), H(0, -0.7, 0.32), 0.17 * hs, 0.05 * hs, { squash: [1.0, 0.6] }), { k: 0.06 * hs, paint: hairPaint }));
  }
  if (style === 'full') vol.push(Object.assign(ellipsoid(H(0, -0.16, 0.24), [0.15 * hs, 0.1 * hs, 0.1 * hs]), { k: 0.05 * hs, paint: hairPaint }));
  if (style === 'goatee') vol.push(Object.assign(cone(H(0, -0.12, 0.26), H(0, -0.3, 0.27), 0.05 * hs, 0.02 * hs), { k: 0.03 * hs, paint: hairPaint }));
  const sh = new Shape([], { name: 'beard', base: body.shape, offset: 0.0012 * S, basePaint: hairPaint });
  sh.displace = (x, y, z) => {
    const [hx, hy, hzz] = toHead(x, y, z), r = beardRegion(hx, hy, hzz, my, mz, style);
    if (r > 0.02) return 0;
    const t = (thick + 0.011) * smoothstep(0.015, -0.04, r);
    // strands run down the beard
    const g = Math.abs(Math.sin(hx * 70 + noise3(hx * 5, hy * 5, hzz * 5) * 2));
    return (t - 0.005 * (1 - g)) * hs;
  };
  const volumeShape = new Shape(vol.slice(), { name: 'beardVol' });
  for (const v of vol) sh.add(v);
  sh.add({ op: 'inter', k: 0, box: null, d: (x, y, z) => Math.min(beardRegion(...toHead(x, y, z), my, mz, style) * hs, vol.length ? volumeShape.eval(x, y, z) : 1e9) });
  if (style === 'braided') for (const yy of [-0.4, -0.55]) sh.add({ op: 'paint', k: 0, box: null, band: 0.002, paint: paint('gold', '#c8a050'), d: (x, y, z) => Math.abs((y - headY) / hs - yy) * hs - 0.012 * hs });
  const beardBones = ['beard1', 'beard2'], top = R.byName.beard1.pos[1], len = top - R.byName.beard2.pos[1] + (top - R.byName.beard2.pos[1]);
  const weights = (x, y, z, owner) => {
    const w = jointWeights(R, x, y, z, owner === 'jaw' ? 'head' : owner || 'head');
    // the beard on the chin and jaw rides the jaw, the long part below hangs on the beard chain
    const [, hy] = toHead(x, y, z);
    const jawW = [[R.byName.jaw.index, 1]];
    const onJaw = mixWeights(w, jawW, smoothstep(my + 0.01, my - 0.03, hy));
    if (!(style === 'long' || style === 'braided')) return onJaw;
    return mixWeights(onJaw, chainWeights(R, beardBones, Math.max(0, (top - y) / len), 'jaw'), smoothstep(-0.2, -0.32, hy));
  };
  asm.addField({ name: 'beard', shape: sh, owner: body.shape, step: 0.005, bounds: [-0.4 * hs, headY - (style === 'long' || style === 'braided' ? 1.05 : 0.45) * hs, hz - 0.1 * hs, 0.4 * hs, headY + 0.3 * hs, hz + 0.5 * hs],
    covers: true, hideable: false, weights, minLod: 0, maxLod: 1 });
}

/**
 * Where a beard grows (head units): negative inside. Below the cheekbones, in front of the ears,
 * not on the lips. A goatee keeps only the chin, a moustache only the upper lip.
 */
function beardRegion(hx, hy, hz, my, mz, style) {
  const ax = Math.abs(hx);
  const cheekLine = 0.2 - ax * 0.25;                     // the top edge, lower toward the ears
  // below the cheekbones, in front of the ears, and no further down than under the chin (a long
  // beard's length comes from its own volume)
  let d = Math.max(hy - cheekLine, -0.08 - hz, ax - 0.33, -0.3 - hy);
  // the lips stay bare: an ellipse around the mouth
  const lips = Math.hypot(hx / 0.085, (hy - my) / 0.032) - 1;
  d = Math.max(d, -lips * 0.03);
  if (style === 'goatee') d = Math.max(d, ax - 0.07, hy - (my + 0.05));
  if (style === 'mustache') d = Math.max(Math.hypot(hx / 0.11, (hy - (my + 0.04)) / 0.035) - 1, -lips * 0.03) * 0.04;
  if (style === 'full' || style === 'long' || style === 'braided') { const mus = Math.hypot(hx / 0.11, (hy - (my + 0.04)) / 0.035) - 1; d = Math.min(d, Math.max(mus * 0.04, -lips * 0.03)); }
  return d;
}
