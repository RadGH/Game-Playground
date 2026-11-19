// Harbour front: the sea fills the north of the district. A concrete apron runs along the quay wall with ship-to-shore
// cranes standing at its edge; piers reach out into the water (the dropship picks you up off the end of the longest
// one); container stacks fill the yard behind the cranes, and warehouses and the district's buildings fill the blocks
// inland. Nothing comes out of the sea: the swarm and the army arrive along the dock road and the inland streets.
// The water is deep (world.js): you can't walk off a pier. Fits industrial and downtown.
import { GC, O, PIECES, streetLines, containerH } from './kit.js';

export function harbour(K) {
  const { R, w, h, street } = K, D = K.D;
  const sea = Math.round(h * R.range(0.2, 0.24));              // rows 0..sea-1 are water
  const apron = 4;                                             // rows sea..sea+3: the quay apron
  for (let z = 0; z < sea; z++) K.rect(0, z, w, 1, O.WATER, GC.water);
  K.rect(0, sea, w, apron, O.OPEN, GC.dock);
  for (let z = sea; z < sea + apron; z++) for (let x = 0; x < w; x++) K.keep[K.I(x, z)] = 1;
  // piers: 3 wide (the extraction pier 4), from the apron out to two rows short of the map edge
  const piers = [], tip = 2;
  let x = R.int(3, 6);
  while (x < w - 5) {
    const pw = piers.length === 0 ? 4 : 3;
    piers.push({ x, w: pw });
    K.rect(x, tip, pw, sea - tip, O.OPEN, GC.pier);
    for (let z = tip; z < sea; z++) for (let i = x; i < x + pw; i++) K.keep[K.I(i, z)] = 1;
    x += pw + R.int(6, 9);
  }
  // the extraction: the end of the widest pier furthest east… the first one is the wide one, so use it
  const P0 = piers[0];
  const extract = { x: P0.x + P0.w / 2, z: tip + 1.8, r: 1.6 };
  // the dock road behind the apron; inland streets
  K.road(0, sea + apron, w, street);
  const top = sea + apron + street;
  const xs = streetLines(R, w, street, D.block);
  for (const x of xs) K.road(x, top, street, h - top);
  const zs = streetLines(R, h - top, street, D.block, { from: 6 }).map(z => z + top);
  for (const z of zs) if (z + street < h - 1) K.road(0, z, w, street);
  // cranes on the apron's water edge, between the piers' roots
  const cranes = [];
  for (let k = 0; k < 60 && cranes.length < Math.max(2, Math.round(w / 12)); k++) {
    const cx = R.int(1, w - 3);
    if (piers.some(p => cx + 2 > p.x - 1 && cx < p.x + p.w + 1)) continue;
    if (cranes.some(c => Math.abs(c.x - cx) < 4)) continue;
    if (K.free(cx, sea, 2, 2, o => o === O.OPEN)) cranes.push(K.place(PIECES.crane, cx, sea, 2, 2, false, { params: { floors: 1 } }));
  }
  // container stacks: a yard in the first inland block row, plus a few along the piers' edges
  const yardZ1 = zs.find(z => z > top) ?? h;
  // the yard is dock concrete; stacks stand in pairs of rows with an aisle between each pair and gaps along the rows
  for (let z = top; z < yardZ1; z++) for (let xx = 0; xx < w; xx++) { const i = K.I(xx, z); if (K.occ[i] === O.FREE) { K.gnd[i] = GC.dock; if ((z - top) % 3 === 2) { K.occ[i] = O.OPEN; K.keep[i] = 1; } } }
  for (let z = top; z < yardZ1; z++) {
    if ((z - top) % 3 === 2) continue;
    for (let xx = R.int(0, 1); xx < w - 1; xx++) {
      if (!K.free(xx, z, 2, 1)) continue;
      if (R.chance(0.22)) { K.set(xx, z, O.OPEN, GC.dock); K.keep[K.I(xx, z)] = 1; continue; }   // a gap to slip through
      const n = R.int(1, 4);
      K.place({ ...PIECES.containers, h: containerH(n) }, xx, z, 2, 1, false, { floors: n }); xx++;
    }
  }
  for (const p of piers.slice(1)) for (let z = tip + 1; z < sea - 2; z += 3) if (R.chance(0.5)) {
    const n = R.int(1, 2), side = R.chance(0.5) ? p.x : p.x + p.w - 1;
    if (K.free(side, z, 1, 2, o => o === O.OPEN)) K.place({ ...PIECES.containers, h: containerH(n) }, side, z, 1, 2, true, { floors: n });
  }
  const start = { x: 4.5, z: h - 4.5 };
  K.openArea(4, h - 5, 3);
  // warehouses near the water, the district's buildings further in
  const ware = [...D.lots.filter(c => /depot|freight|workshop|printworks|shops|market|midrise|terrace/.test(c.recipe))];
  K.fill({ list: ware.length ? ware : D.lots, area: (xx, z) => z < top + 10 });
  K.fill({});
  return K.finish({ start, extract, edgeCodes: new Set([...['r', 'R', 'x', 'c'], GC.dock]), extra: { harbour: { sea, apron, piers, tip } } });
}
