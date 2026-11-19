// City park: a big park fills the middle of the district — open lawns to fight a swarm on, clumps of trees for cover,
// a shallow pond you can wade, gravel paths that wander from a gate in each side, a playground, a sports court, an
// open-air stage. A street runs all the way round the park; the city blocks are outside it. The drop point is on the
// lawn by the south-west gate; the dropship waits in the far corner of the city. Fits downtown and residential.
import { GC, O, PIECES, spline, wander, pickW } from './kit.js';

export function park(K) {
  const { R, w, h, street } = K, D = K.D;
  const m = Math.round(Math.min(w, h) * 0.2), x0 = m, z0 = m, x1 = w - m, z1 = h - m;    // the park (inside the ring street)
  // the ring street round the park, and streets out from the middle of each side to the map edge
  K.road(x0 - street, z0 - street, x1 - x0 + street * 2, street); K.road(x0 - street, z1, x1 - x0 + street * 2, street);
  K.road(x0 - street, z0, street, z1 - z0); K.road(x1, z0, street, z1 - z0);
  const gx = Math.round((x0 + x1) / 2 + R.range(-3, 3)) - 1, gz = Math.round((z0 + z1) / 2 + R.range(-3, 3)) - 1;
  K.road(gx, 0, street, z0 - street); K.road(gx, z1 + street, street, h - z1 - street);
  K.road(0, gz, x0 - street, street); K.road(x1 + street, gz, w - x1 - street, street);
  // and one more street in each outer strip so the city blocks aren't too deep
  if (x0 - street > 9) { K.road(Math.round((x0 - street) / 2) - 1, 0, street, h); K.road(x1 + street + Math.round((w - x1 - street) / 2) - 1, 0, street, h); }
  if (z0 - street > 9) { K.road(0, Math.round((z0 - street) / 2) - 1, w, street); K.road(0, z1 + street + Math.round((h - z1 - street) / 2) - 1, w, street); }

  // the park ground: lawn, kept clear of the city's buildings
  const inPark = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) { K.set(x, z, O.FREE, GC.lawn); }
  // the pond: an oval a little off the middle (shallow: open ground you wade through)
  const pond = { x: (x0 + x1) / 2 + R.range(-2.5, 2.5), z: (z0 + z1) / 2 + R.range(-2.5, 2.5), rx: R.range(2.6, 3.6), rz: R.range(1.8, 2.6) };
  const inPond = (px, pz, k = 1) => ((px - pond.x) / (pond.rx * k)) ** 2 + ((pz - pond.z) / (pond.rz * k)) ** 2 <= 1;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = K.I(x, z);
    if (inPond(x + 0.5, z + 0.5)) { K.occ[i] = O.OPEN; K.gnd[i] = GC.pond; K.keep[i] = 1; }
    else if (inPond(x + 0.5, z + 0.5, 1.45)) K.keep[i] = 1;      // a clear shore round it
  }
  // paths: from each gate (where the outside streets meet the park) round the pond and across
  const gates = [{ x: gx + 1, z: z0 - 0.5 }, { x: gx + 1, z: z1 + 0.5 }, { x: x0 - 0.5, z: gz + 1 }, { x: x1 + 0.5, z: gz + 1 }];
  const around = (a, b) => { const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, dx = mx - pond.x, dz = mz - pond.z, d = Math.hypot(dx, dz) || 1, need = Math.max(pond.rx, pond.rz) * 1.6 + 1.2; return d < need ? { x: pond.x + dx / d * need, z: pond.z + dz / d * need } : { x: mx, z: mz }; };
  const paths = [];
  // a path never runs through the pond: points inside the shore are pushed out round it
  const shore = p => { const dx = (p.x - pond.x) / (pond.rx * 1.35), dz = (p.z - pond.z) / (pond.rz * 1.35), d = Math.hypot(dx, dz); return d >= 1 || d < 1e-6 ? p : { x: pond.x + dx / d * pond.rx * 1.35, z: pond.z + dz / d * pond.rz * 1.35 }; };
  const path = pts => { const s = spline(wander(R, pts, 1.6)).map(shore); paths.push(K.band(s, 0.52, 'path', { o: O.OPEN })); };
  path([gates[0], around(gates[0], gates[2]), gates[2]]);
  path([gates[1], around(gates[1], gates[3]), gates[3]]);
  path([gates[0], around(gates[0], gates[1]), gates[1]]);
  path([gates[2], around(gates[2], gates[3]), gates[3]]);

  // the drop point: open lawn by the south-west corner of the park
  const start = { x: x0 + 3.5, z: z1 - 3.5 };
  K.disc(start.x, start.z, 3.2, (x, z, i) => { if (inPark(x, z)) { K.keep[i] = 1; if (K.occ[i] === O.FREE) K.occ[i] = O.OPEN; } });
  const extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  K.openArea(w - 5, 4, 3);

  // the park's features, then clumps of trees, each 2+ tiles from anything else in the park (lanes to fight in)
  const parkLots = [];
  const gapOk = (x, z, sw, sd) => parkLots.every(l => Math.max(l.x - (x + sw), x - (l.x + l.w), l.z - (z + sd), z - (l.z + l.d)) >= 2);
  const inside = (x, z, sw, sd) => x >= x0 + 1 && z >= z0 + 1 && x + sw <= x1 - 1 && z + sd <= z1 - 1;
  const put = (c, tries, { turn = null } = {}) => {
    for (let k = 0; k < tries; k++) {
      const t = turn ?? (c.size[0] !== c.size[1] && R.chance(0.5)), sw = t ? c.size[1] : c.size[0], sd = t ? c.size[0] : c.size[1];
      const x = R.int(x0 + 1, x1 - sw - 1), z = R.int(z0 + 1, z1 - sd - 1);
      if (inside(x, z, sw, sd) && gapOk(x, z, sw, sd) && K.free(x, z, sw, sd)) { const l = K.place(c, x, z, sw, sd, t); parkLots.push(l); return l; }
    }
    return null;
  };
  const S = (x1 - x0) * (z1 - z0);
  if (S >= 400) put(PIECES.amphi, 40, { turn: false });
  put(PIECES.court, 30); put(PIECES.playground, 30); put(PIECES.fountain, 30);
  if (R.chance(0.5)) put(PIECES.garden, 30);
  const nTrees = Math.round(S / 16);
  for (let k = 0; k < nTrees; k++) put(pickW(R, [{ ...PIECES.grove, w: 2 }, { ...PIECES.tree, w: 3 }]), 12);
  // a row of street trees along the inside of the park's edge (gaps for the gates and the paths)
  for (let x = x0; x < x1; x += 3) for (const z of [z0, z1 - 1]) if (K.free(x, z, 1, 1) && gapOk(x, z, 1, 1)) parkLots.push(K.place(PIECES.tree, x, z, 1, 1));
  for (let z = z0 + 3; z < z1 - 1; z += 3) for (const x of [x0, x1 - 1]) if (K.free(x, z, 1, 1) && gapOk(x, z, 1, 1)) parkLots.push(K.place(PIECES.tree, x, z, 1, 1));
  // what's left of the park stays lawn; the city outside gets the district's buildings
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) { const i = K.I(x, z); if (K.occ[i] === O.FREE) K.occ[i] = O.OPEN; }
  K.fill({ list: D.lots });
  return K.finish({ start, extract, extra: { park: { x: x0, z: z0, w: x1 - x0, d: z1 - z0, pond } } });
}
