// Old town: the district grew before anyone planned it. Cobbled lanes two tiles wide split the ground again and again
// at odd places and jog sideways halfway along, so no lane runs straight for long and you rarely see far; the houses
// are small and low (no towers), and here and there a lane opens into a little square with a fountain. The drop point
// and the dropship are in squares at opposite corners. Fits downtown and residential.
import { GC, O, PIECES } from './kit.js';

export function oldtown(K) {
  const { R, w, h } = K, D = K.D, L = 2;                 // lane width
  const lanes = [];
  const lane = (x, z, lw, ld) => { K.rect(x, z, lw, ld, O.ROAD, GC.cobble, o => o !== O.OPEN); lanes.push([x, z, lw, ld]); };
  const leaves = [];
  // split a block with a lane across it (along its longer side), jogging sideways partway on longer lanes
  const split = (b, depth) => {
    const long = Math.max(b.w, b.d);
    if ((b.w <= 8 && b.d <= 8) || depth > 6 || long < 8) { leaves.push(b); return; }
    const vertical = b.w > b.d + 1 ? true : b.d > b.w + 1 ? false : R.chance(0.5);   // a vertical lane cuts the width
    const span = vertical ? b.w : b.d, len = vertical ? b.d : b.w;
    const at = R.int(3, span - L - 3);
    const jog = len >= 9 && R.chance(0.75) ? (R.chance(0.5) ? 1 : -1) * R.int(1, 2) : 0;
    const at2 = Math.max(3, Math.min(span - L - 3, at + jog));
    const cut = R.int(Math.floor(len * 0.35), Math.ceil(len * 0.65));                  // where along the lane it jogs
    if (vertical) {
      lane(b.x + at, b.z, L, cut); lane(b.x + at2, b.z + cut, L, len - cut);
      if (at2 !== at) lane(b.x + Math.min(at, at2), b.z + cut - 1, Math.abs(at2 - at) + L, L);   // the dog-leg, full width
      const lo = Math.min(at, at2), hi = Math.max(at, at2) + L;
      split({ x: b.x, z: b.z, w: lo, d: b.d }, depth + 1);
      split({ x: b.x + hi, z: b.z, w: b.w - hi, d: b.d }, depth + 1);
      if (hi - lo > L) leaves.push({ x: b.x + lo, z: b.z, w: hi - lo, d: b.d });      // the sliver beside the jog fills too
    } else {
      lane(b.x, b.z + at, cut, L); lane(b.x + cut, b.z + at2, len - cut, L);
      if (at2 !== at) lane(b.x + cut - 1, b.z + Math.min(at, at2), L, Math.abs(at2 - at) + L);
      const lo = Math.min(at, at2), hi = Math.max(at, at2) + L;
      split({ x: b.x, z: b.z, w: b.w, d: lo }, depth + 1);
      split({ x: b.x, z: b.z + hi, w: b.w, d: b.d - hi }, depth + 1);
      if (hi - lo > L) leaves.push({ x: b.x, z: b.z + lo, w: b.w, d: hi - lo });
    }
  };
  // the drop point's and the dropship's squares first (lanes run into them)
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  K.openArea(4, h - 5, 3, GC.square); K.openArea(w - 5, 4, 3, GC.square);
  split({ x: 0, z: 0, w, d: h }, 0);
  // little squares: some blocks are open cobbles with a fountain in the middle
  const squares = [];
  for (const b of leaves) {
    if (b.w < 4 || b.d < 4 || squares.length >= Math.round(w * h / 400) || !R.chance(0.22)) continue;
    const sw = Math.min(b.w, 6), sd = Math.min(b.d, 6), sx = b.x + Math.floor((b.w - sw) / 2), sz = b.z + Math.floor((b.d - sd) / 2);
    K.rect(sx, sz, sw, sd, O.OPEN, GC.square, o => o === O.FREE);
    for (let j = sz; j < sz + sd; j++) for (let i = sx; i < sx + sw; i++) K.keep[K.I(i, j)] = 1;
    squares.push([sx, sz, sw, sd]);
    const fx = sx + Math.floor(sw / 2) - (sw % 2 ? 0 : 1) + R.int(0, 1), fz = sz + Math.floor(sd / 2) - (sd % 2 ? 0 : 1) + R.int(0, 1);
    if (K.free(fx, fz, 1, 1, o => o === O.OPEN)) K.place(PIECES.fountain, fx, fz, 1, 1);
  }
  // small, low houses: the district's 1×1 and 2×1 kinds (a 2×2 now and then), never more than four storeys
  const small = D.lots.filter(c => c.size[0] * c.size[1] <= 2 || R.chance(0.3)).map(c => ({ ...c, w: (c.w || 1) * (c.size[0] * c.size[1] <= 2 ? 1.6 : 0.5) }));
  K.fill({ list: small.length ? small : D.lots, floorsMax: 4, plaza: 0, fuel: 0.02, leftover: GC.square });
  return K.finish({ start, extract, edgeCodes: new Set([GC.cobble]), extra: { oldtown: { lanes, squares } } });
}
