// Chibi 3 headwear: helms, the wizard's hat, hoods and circlets, all as distance-field shapes.
// No Three.js. Returns how much hair stays visible ({ covered, brimY }) for hair.js.

import { Shape, sphere, ellipsoid, cone, roundBox, torus, noise3, smoothstep } from './sdf.js';
import { paint, shadeHex, mixHex } from './paint.js';
import { garmentShape, addGarment, capsuleDist } from './garments.js';
import { chainWeights, mixWeights } from './skin.js';

/** Map a hat id to a family we build. */
export function hatFamily(id = 'none') {
  if (!id || id === 'none') return 'none';
  if (/plate_helm|bascinet|sallet|knight/.test(id)) return 'bascinet';
  if (/great_helm|barrel|closed/.test(id)) return 'greathelm';
  if (/horn/.test(id)) return 'horned';
  if (/helm|helmet|wolf|rune/.test(id)) return 'warhelm';
  if (/wizard|witch|pointed/.test(id)) return 'wizard';
  if (/hood/.test(id)) return id === 'hood_down' ? 'none' : 'hood';
  if (/circlet|crown|tiara|band/.test(id)) return 'circlet';
  return 'cap';
}

export function buildHeadwear(ctx) {
  const { a, R, body, asm } = ctx, fam = hatFamily(a.hat?.id);
  if (fam === 'none') return { covered: 0 };
  const hs = R.hs, headY = R.headY, hz = R.byName.head.pos[2], S = R.P.S;
  const H = (x, y, z) => [x * hs, headY + y * hs, hz + z * hs];
  const toHead = (x, y, z) => [x / hs, (y - headY) / hs, (z - hz) / hs];
  const color = a.hat?.color || '#9aa0a8', color2 = a.hat?.color2 || '#c8a050';
  const headOnly = () => [[R.byName.head.index, 1]];
  const box = (y0, y1, x = 0.62, z0 = -0.72, z1 = 0.62) => [-x * hs, headY + y0 * hs, hz + z0 * hs, x * hs, headY + y1 * hs, hz + z1 * hs];
  const metal = paint('metal', color);

  if (fam === 'bascinet' || fam === 'warhelm' || fam === 'horned' || fam === 'greathelm') {
    const sh = new Shape([], { name: 'helm', basePaint: metal });
    // the bowl: bigger than the skull everywhere, a pointed crown on the bascinet
    sh.add(Object.assign(ellipsoid(H(0, 0.46, -0.06), [0.385 * hs, 0.43 * hs, 0.47 * hs]), { k: 0, paint: metal }));
    if (fam === 'bascinet') sh.add(Object.assign(cone(H(0, 0.68, -0.1), H(0, 0.98, -0.26), 0.2 * hs, 0.01 * hs), { k: 0.09 * hs, paint: metal }));
    if (fam === 'greathelm') sh.add(Object.assign(roundBox(H(0, 0.24, 0.04), [0.36 * hs, 0.32 * hs, 0.42 * hs], 0.08 * hs), { k: 0.05 * hs, paint: metal }));
    // the lower edge: down to the jaw at the sides, the nape behind
    sh.add({ op: 'sub', k: 0.01 * hs, box: null, d: (x, y, z) => { const [, hy, hzz] = toHead(x, y, z); return hy - (fam === 'greathelm' ? -0.2 : 0.14 - 0.12 * smoothstep(0.1, -0.4, hzz)); } });
    // the face opening (none on a great helm, which gets an eye slit and breaths instead)
    if (fam === 'greathelm') {
      sh.add({ ...roundBox(H(0, 0.36, 0.42), [0.3 * hs, 0.018 * hs, 0.12 * hs], 0.008 * hs), op: 'sub', k: 0.004 * hs, paint: paint('dark', '#101012'), paintBand: 0.004 });
      for (let i = 0; i < 5; i++) sh.add({ ...sphere(H(0.12 + i * 0.03, 0.12, 0.43), 0.012 * hs), op: 'sub', k: 0.002 * hs, paint: paint('dark', '#101012'), paintBand: 0.003 });
    } else {
      const open = fam === 'warhelm' || fam === 'horned' ? [0.25, 0.27, 0.35] : [0.24, 0.31, 0.34];
      sh.add({ ...roundBox(H(0, 0.18, 0.36), [open[0] * hs, open[1] * hs, open[2] * hs], 0.12 * hs), op: 'sub', k: 0.012 * hs });
    }
    if (fam === 'warhelm' || fam === 'horned') sh.add(Object.assign(roundBox(H(0, 0.3, 0.405), [0.028 * hs, 0.17 * hs, 0.02 * hs], 0.012 * hs), { k: 0.01 * hs, paint: metal }));   // nasal
    // a raised rim around the opening and the lower edge, a ridge over the crown, rivets
    const rivet = paint('darkMetal', shadeHex(color, -0.3));
    for (const s of [1, -1]) sh.add(Object.assign(sphere(H(s * 0.36, 0.42, 0.18), 0.022 * hs), { k: 0.004 * hs, paint: rivet }));
    sh.displace = (x, y, z) => {
      const [hx, hy, hzz] = toHead(x, y, z);
      return 0.012 * hs * Math.exp(-((hx / 0.03) ** 2)) * smoothstep(0.55, 0.75, hy) * (hzz < 0.3 ? 1 : 0);
    };
    asm.addField({ name: 'helm', shape: sh, owner: body.shape, step: 0.0055, bounds: box(-0.3, 1.08, 0.55, -0.66, 0.6), covers: true, hideable: true, weights: headOnly });
    // a raised visor resting on the brow (bascinet), hinged at the temples
    if (fam === 'bascinet') {
      const v = new Shape([], { name: 'visor', basePaint: metal });
      v.add(Object.assign(ellipsoid(H(0, 0.5, 0.0), [0.43 * hs, 0.42 * hs, 0.53 * hs]), { k: 0, paint: metal }));
      v.add({ op: 'inter', k: 0.008 * hs, box: null, d: (x, y, z) => { const [hx, hy, hzz] = toHead(x, y, z); return Math.max(0.52 - hy, hy - 0.8, 0.05 - hzz, Math.abs(hx) - 0.4); } });
      const bowl = ellipsoid(H(0, 0.46, -0.06), [0.4 * hs, 0.44 * hs, 0.485 * hs]);
      v.add({ op: 'sub', k: 0, box: null, d: bowl.d });
      // the visor's breaths: a row of small holes
      for (let i = -3; i <= 3; i++) v.add({ ...sphere(H(i * 0.05, 0.63, 0.47), 0.011 * hs), op: 'sub', k: 0, paint: paint('dark', '#101012'), paintBand: 0.003 });
      asm.addField({ name: 'visor', shape: v, owner: body.shape, step: 0.005, bounds: box(0.4, 0.9, 0.5, -0.1, 0.62), covers: true, hideable: true, weights: headOnly });
      // plume: a sweep of feathers from the crown, on the hat spring chain
      if (a.hat?.color2) {
        const pl = new Shape([], { name: 'plume' });
        const fp = paint('fur', color2, { sheen: 1, detail: 0.6 });
        const pts = [H(0, 0.9, -0.22), H(0, 1.12, -0.42), H(0, 1.08, -0.72), H(0, 0.82, -0.98)];
        for (let i = 0; i < 3; i++) pl.add(Object.assign(cone(pts[i], pts[i + 1], (0.06 - i * 0.012) * hs, (0.048 - i * 0.014) * hs), { k: 0.03 * hs, paint: fp }));
        pl.displace = (x, y, z) => 0.012 * hs * Math.abs(Math.sin(x * 900 + noise3(x * 30, y * 30, z * 30) * 3));
        const top = pts[0][1];
        asm.addField({ name: 'plume', shape: pl, owner: body.shape, step: 0.0045, covers: false, hideable: false,
          weights: (x, y, z) => mixWeights(headOnly(), chainWeights(R, ['hat1', 'hat2'], Math.min(1, Math.hypot(y - pts[0][1], z - pts[0][2]) / (0.85 * hs)), 'head'), smoothstep(0.0, 0.25 * hs, Math.hypot(y - top, z - pts[0][2]))) });
      }
    }
    if (fam === 'horned') for (const s of [1, -1]) {
      const hn = new Shape([], { name: 'horn' }), bone = paint('bone', '#e2d6b4');
      const pts = [H(s * 0.34, 0.6, 0.0), H(s * 0.55, 0.72, 0.04), H(s * 0.66, 0.95, -0.02), H(s * 0.63, 1.15, -0.1)];
      for (let i = 0; i < 3; i++) hn.add(Object.assign(cone(pts[i], pts[i + 1], (0.075 - i * 0.022) * hs, (0.053 - i * 0.022) * hs), { k: 0.02 * hs, paint: bone }));
      hn.displace = (x, y, z) => 0.003 * hs * Math.sin(y * 500);
      asm.addField({ name: 'horn', shape: hn, owner: body.shape, step: 0.004, covers: false, hideable: false, weights: headOnly });
    }
    // mail curtain (aventail) from the helm's edge over the neck and shoulders
    if (fam !== 'greathelm') {
      const L = ctx.L;
      const region = (x, y, z) => Math.max(Math.hypot(x, z - 0.0) - 0.21 * S, (L.shoulder - 0.05 * S) - y, y - (headY + 0.12 * hs), (y > headY - 0.1 * hs && z > hz + 0.1 * hs) ? 1 : -1);
      const sh2 = garmentShape('aventail', ctx, 0.011 * S, region, { paintBase: paint('chain', shadeHex(color, -0.1)), folds: (x, y, z) => noise3(x * 25, y * 25, z * 25) * 0.003 * S });
      addGarment(ctx, 'aventail', sh2, [-0.3 * S, L.shoulder - 0.1 * S, -0.3 * S, 0.3 * S, headY + 0.2 * hs, 0.3 * S], { step: 0.01 });
    }
    return { covered: 1 };
  }

  if (fam === 'wizard') {
    // a wide brim, a tall cone that bends back and droops at the tip (the tip rides the hat chain)
    const felt = paint('wool', color, { detail: 0.45 });
    const sh = new Shape([], { name: 'hat', basePaint: felt });
    const brimY = 0.58, brimR = 0.82;
    sh.add(Object.assign({ d: (x, y, z) => { const [hx, hy, hzz] = toHead(x, y, z); const r = Math.hypot(hx, (hzz + 0.06) * 0.95); const sag = (r - 0.3) * (r - 0.3) * 0.12; return Math.max(r - brimR, Math.abs(hy - brimY + sag) - 0.018) * hs; }, box: box(brimY - 0.15, brimY + 0.1, brimR + 0.05, -brimR - 0.1, brimR) }, { k: 0, paint: felt }));
    const path = [H(0, brimY - 0.02, -0.06), H(0, 0.95, -0.12), H(0, 1.3, -0.22), H(0, 1.55, -0.45), H(0, 1.5, -0.72)];
    const radii = [0.36, 0.26, 0.17, 0.09, 0.02];
    for (let i = 0; i < path.length - 1; i++) sh.add(Object.assign(cone(path[i], path[i + 1], radii[i] * hs, radii[i + 1] * hs), { k: 0.04 * hs, paint: felt }));
    // the band at the base of the crown, and a few stars
    sh.add({ op: 'paint', k: 0, box: null, band: 0.0015, paint: paint('silk', color2), d: (x, y, z) => Math.abs((y - headY) / hs - (brimY + 0.07)) * hs - 0.035 * hs });
    for (const [x, y, z] of [[0.15, 1.0, 0.18], [-0.12, 1.22, 0.05], [0.05, 1.42, -0.18]]) sh.add({ ...sphere(H(x, y, z), 0.035 * hs), op: 'paint', band: 0.002, paint: paint('gold', '#e8c860') });
    // the inside of the crown is hollow down to the head
    const skull = ellipsoid(H(0, 0.45, -0.08), [0.345 * hs, 0.39 * hs, 0.44 * hs]);
    sh.add({ op: 'sub', k: 0, box: null, d: skull.d });
    sh.displace = (x, y, z) => noise3(x * 14, y * 14, z * 14) * 0.006 * hs;
    const baseY = headY + 0.9 * hs;
    const weights = (x, y, z) => {
      const along = Math.max(0, y - baseY) / (0.6 * hs) + Math.max(0, -(z - hz + 0.3 * hs)) / (0.6 * hs) * 0.5;
      return mixWeights(headOnly(), chainWeights(R, ['hat1', 'hat2'], Math.min(1, along), 'head'), smoothstep(0, 0.3, along));
    };
    asm.addField({ name: 'hat', shape: sh, owner: body.shape, step: 0.0055, bounds: box(brimY - 0.2, 1.75, brimR + 0.08, -brimR - 0.15, brimR + 0.05), covers: true, hideable: true, weights });
    return { covered: 0, brimY: headY + (brimY - 0.03) * hs };
  }

  if (fam === 'hood') {
    const cloth = paint('cloth', color);
    const sh = new Shape([], { name: 'hood', basePaint: cloth });
    sh.add(Object.assign(ellipsoid(H(0, 0.42, -0.1), [0.43 * hs, 0.5 * hs, 0.52 * hs]), { k: 0, paint: cloth }));
    sh.add(Object.assign(cone(H(0, 0.75, -0.25), H(0, 0.8, -0.55), 0.18 * hs, 0.02 * hs), { k: 0.08 * hs, paint: cloth }));
    sh.add({ ...roundBox(H(0, 0.22, 0.42), [0.27 * hs, 0.36 * hs, 0.32 * hs], 0.14 * hs), op: 'sub', k: 0.02 * hs });
    sh.add({ op: 'sub', k: 0.02 * hs, box: null, d: (x, y, z) => (y - headY) / hs * hs + 0.15 * hs - Math.max(0, -(z - hz)) * 0.0 });
    sh.displace = (x, y, z) => noise3(x * 20, y * 8, z * 20) * 0.008 * hs;
    asm.addField({ name: 'hood', shape: sh, owner: body.shape, step: 0.005, bounds: box(-0.3, 1.0, 0.6, -0.8, 0.6), covers: true, hideable: true, weights: headOnly });
    return { covered: 1 };
  }

  if (fam === 'circlet') {
    const sh = new Shape([], { name: 'circlet' });
    sh.add(Object.assign(torus(H(0, 0.6, -0.05), 0.34 * hs, 0.018 * hs, { rot: [-0.18, 0, 0], stretch: [1, 1.27] }), { k: 0, paint: paint('gold', color2 || '#d8b040') }));
    sh.add(Object.assign(sphere(H(0, 0.6, 0.39), 0.035 * hs), { k: 0.01 * hs, paint: paint('gem', a.hat?.color || '#4080e0') }));
    asm.addField({ name: 'circlet', shape: sh, owner: body.shape, step: 0.003, covers: false, hideable: false, weights: headOnly });
    return { covered: 0 };
  }

  // cap / bandana / anything else: a close cloth cap over the crown
  const region = (x, y, z) => { const [, hy] = toHead(x, y, z); return 0.5 - hy; };
  const sh = garmentShape('cap', ctx, 0.012 * S, region, { paintBase: paint('cloth', color) });
  addGarment(ctx, 'cap', sh, box(0.4, 0.95), { step: 0.005, weights: headOnly });
  return { covered: 0, brimY: headY + 0.52 * hs };
}
