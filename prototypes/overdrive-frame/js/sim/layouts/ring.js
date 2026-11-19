// Ring plaza: a round paved plaza in the middle of the district with a monument at its heart, a ring road round it,
// a second ring further out, and avenues running out from the plaza like spokes — four straight ones to the middle of
// each map edge and four diagonals to the corners. The blocks between are wedges. The drop point is on the plaza, so
// the swarm comes at you down every spoke at once; the dropship waits in a far corner. Fits every city district.
import { GC, O, PIECES, straight } from './kit.js';

export function ring(K) {
  const { R, w, h } = K, cx = w / 2, cz = h / 2, S = Math.min(w, h);
  const plazaR = Math.round(S * 0.14 * 2) / 2;          // the round plaza (≈5.5 on a 40 map)
  const HW = 1.25;                                       // half-width of the ring roads and avenues as drawn
  const ringA = plazaR + HW, ringB = Math.round(S * 0.37 * 2) / 2;
  const turn = R.range(-0.2, 0.2);                       // the spokes lean a little differently on every seed
  // the plaza: every tile inside the inner ring road's inner edge (drawn as a circle by the ground renderer)
  K.disc(cx, cz, ringA - HW + 0.71, (x, z, i) => { K.occ[i] = O.OPEN; K.gnd[i] = GC.round; K.keep[i] = 1; });
  const circle = r => { const n = Math.ceil(r * Math.PI * 2 / 0.25), out = []; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); } return out; };
  K.band(circle(ringA), HW, 'road');
  K.band(circle(ringB), HW, 'road');
  // the spokes: from the inner ring out past the map edge
  const spokes = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + (k % 2 ? 0 : turn * 0.5), diag = k % 2 === 1;
    const far = diag ? Math.hypot(w, h) / 2 + 1 : (Math.abs(Math.cos(a)) > 0.5 ? w / 2 : h / 2) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) + 1;
    const a0 = { x: cx + Math.cos(a) * ringA, z: cz + Math.sin(a) * ringA }, a1 = { x: cx + Math.cos(a) * far, z: cz + Math.sin(a) * far };
    spokes.push(K.band(straight(a0, a1), HW, 'road'));
  }
  // the monument in the middle of the plaza; the drop point on the plaza's south side
  const mx = Math.round(cx) - 1, mz = Math.round(cz) - 1;
  K.place(PIECES.memorial, mx, mz, 2, 2, false, { params: { height: 2 } });
  const start = { x: cx + 0.5, z: cz + plazaR * 0.62 };
  const extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  K.openArea(w - 5, 4, 3);
  // a few lamp-lit planters round the plaza's rim (cover, low enough to jump onto)
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.4, x = Math.floor(cx + Math.cos(a) * (plazaR - 1.6)), z = Math.floor(cz + Math.sin(a) * (plazaR - 1.6));
    if (Math.hypot(x + 0.5 - start.x, z + 0.5 - start.z) > 2.2 && K.free(x, z, 1, 1, o => o === O.OPEN)) K.place(PIECES.planter, x, z, 1, 1);
  }
  // the wedges: the district's buildings
  K.fill({});
  return K.finish({ start, extract, extra: { ring: { x: cx, z: cz, plaza: plazaR, rings: [ringA, ringB], hw: HW } } });
}
