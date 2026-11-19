// Canal quarter: a deep canal cuts the district in two from the west edge to the east edge, with a dog-leg in the
// middle on most seeds. Stone quays two tiles wide run along both banks; every street that meets the canal crosses it
// on a bridge, so the bridges are the only ways across on foot (a frame can still jump the water). The drop point is
// on the south bank, the dropship waits on the north bank. Fits every city district.
import { GC, O, streetLines } from './kit.js';

export function canal(K) {
  const { R, w, h, street } = K, D = K.D;
  const WW = 3, QW = 2;                                  // water width, quay width (tiles)
  // the canal's course: rows zA (west part), zB (east part), joined by a north-south leg at column xj
  const zA = Math.round(h * R.range(0.38, 0.5)), jog = R.chance(0.7);
  const zB = jog ? Math.max(9, Math.min(h - WW - QW - 9, zA + (R.chance(0.5) ? 1 : -1) * R.int(5, 7))) : zA;
  const xj = Math.round(w * R.range(0.4, 0.58));
  const wet = (x, z) => (x < xj + WW && z >= zA && z < zA + WW) || (x >= xj && z >= zB && z < zB + WW) || (x >= xj && x < xj + WW && z >= Math.min(zA, zB) && z < Math.max(zA, zB) + WW);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (wet(x, z)) K.set(x, z, O.WATER, GC.water);
  // the quays: every land tile within QW of the water (Chebyshev), kept open
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (K.occ[K.I(x, z)] === O.WATER) continue;
    let near = false;
    for (let dz = -QW; dz <= QW && !near; dz++) for (let dx = -QW; dx <= QW && !near; dx++) if (K.inMap(x + dx, z + dz) && K.occ[K.I(x + dx, z + dz)] === O.WATER) near = true;
    if (near) { K.set(x, z, O.OPEN, GC.quay); K.keep[K.I(x, z)] = 1; }
  }
  const band = { z0: Math.min(zA, zB) - QW, z1: Math.max(zA, zB) + WW + QW };   // rows the canal + quays cover
  // streets: north-south lines everywhere except along the dog-leg (they'd run down the water); east-west lines only
  // where they don't land on the canal (the quays are the promenade there)
  const xs = streetLines(R, w, street, D.block).filter(x => !(jog && x + street > xj - QW - 1 && x < xj + WW + QW + 1));
  const zs = streetLines(R, h, street, D.block).filter(z => {
    // a line may cross the dog-leg (a bridge over the leg) but never run along the canal's west or east stretch
    for (let k = 0; k < street; k++) { const rr = z + k; if ((rr >= zA - QW - 1 && rr < zA + WW + QW + 1) || (rr >= zB - QW - 1 && rr < zB + WW + QW + 1)) return false; }
    return true;
  });
  // make sure the canal has at least two bridges: add north-south lines where it has none
  const crossings = xs.filter(x => x + street <= xj || x >= xj + WW);
  if (crossings.length < 2) for (const fx of [0.2, 0.8]) { const x = Math.round(w * fx); if (!xs.some(q => Math.abs(q - x) < street + 3)) xs.push(x); }
  for (const x of xs) K.road(x, 0, street, h);
  for (const z of zs) K.road(0, z, w, street);
  // a bridge over the dog-leg if no street crosses it: from the west stretch's quay to the east stretch's
  if (jog) {
    const lo = Math.min(zA, zB) + WW, hi = Math.max(zA, zB);
    if (hi - lo >= street + 2 && !zs.some(z => z >= lo && z + street <= hi)) { const z = Math.round((lo + hi - street) / 2); K.road(xj - QW, z, WW + QW * 2, street); }
  }

  // the drop point on the south bank (bottom-left), the extraction on the north bank (top-right)
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  K.openArea(4, h - 5, 3); K.openArea(w - 5, 4, 3);
  // waterfront: tall buildings like the water — the first row of lots behind each quay comes from the district's
  // biggest kinds; then the rest of the blocks as usual
  K.fill({});
  return K.finish({ start, extract, extra: { canal: { zA, zB, xj, jog, ww: WW, qw: QW, band } } });
}
