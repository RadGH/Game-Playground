// Megablocks: the district is a handful of giant blocks between wide three-lane avenues. Each block is one huge tower
// rising off a podium, standing in a wide paved plaza with planters, the odd smaller building at a corner, and open
// paving all round — long sight lines down the avenues, big open squares to fight in, towers to jump onto. The drop
// point and the dropship are on plazas in opposite corners. Fits downtown and residential.
import { GC, O, PIECES, streetLines, pickW } from './kit.js';

export function megablock(K) {
  const { R, w, h } = K, D = K.D, A = 3;                 // avenue width
  const lines = len => { const l = streetLines(R, len, A, [8, 10]); while (l.length > 1 && len - (l[l.length - 1] + A) < 6) l.pop(); return l; };   // no thin last block
  const xs = lines(w), zs = lines(h);
  for (const x of xs) K.road(x, 0, A, h);
  for (const z of zs) K.road(0, z, w, A);
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  // the blocks between the avenues
  const cuts = (lines, len) => { const out = []; let a = 0; for (const p of [...lines, len]) { if (p - a >= 1) out.push([a, p - a]); a = p + A; } return out; };
  const bx = cuts(xs, w), bz = cuts(zs, h);
  const towers = [];
  for (const [x0, bw] of bx) for (const [z0, bd] of bz) K.rect(x0, z0, bw, bd, O.FREE, GC.deck);   // every block is plaza paving to begin with
  K.openArea(4, h - 5, 3, GC.deck); K.openArea(w - 5, 4, 3, GC.deck);
  for (const [x0, bw] of bx) for (const [z0, bd] of bz) {
    const hasStart = start.x > x0 && start.x < x0 + bw && start.z > z0 && start.z < z0 + bd, hasEx = extract.x > x0 && extract.x < x0 + bw && extract.z > z0 && extract.z < z0 + bd;
    // the tower: 4×4 when the block has room for it and a 2-tile plaza round it, else a 2×2 tower
    const big = bw >= 7 && bd >= 7 && !(hasStart || hasEx) || bw >= 9 && bd >= 9;
    const c = big ? PIECES.megatower : pickW(R, D.lots.filter(l => l.size[0] === 2 && l.size[1] === 2).concat([{ recipe: 'res-tower', size: [2, 2], floors: [12, 20] }]));
    const sw = c.size[0], sd = c.size[1];
    for (let k = 0; k < 30; k++) {
      const tx = x0 + R.int(Math.min(2, bw - sw), Math.max(0, bw - sw - 2)), tz = z0 + R.int(Math.min(2, bd - sd), Math.max(0, bd - sd - 2));
      if (K.free(tx, tz, sw, sd)) { towers.push(K.place(c, tx, tz, sw, sd, false)); break; }
    }
  }
  // the plazas: planters in a loose grid, a smaller building on some corners, the rest open paving
  for (const [x0, bw] of bx) for (const [z0, bd] of bz) {
    const corners = [[x0, z0], [x0 + bw - 2, z0], [x0, z0 + bd - 2], [x0 + bw - 2, z0 + bd - 2]];
    for (let k = 0; k < 2; k++) if (R.chance(0.6)) {
      const [cx, cz] = corners[R.int(0, 3)];
      const c = pickW(R, D.lots.filter(l => l.size[0] * l.size[1] <= 2));
      if (c) K.tryPlace(c, cx, cz, { ok: (o, i) => o === O.FREE && !K.keep[i] && towers.every(t => Math.max(t.x - cx - 2, cx - (t.x + t.w), t.z - cz - 2, cz - (t.z + t.d)) >= 1) });
    }
    for (let z = z0 + 1; z < z0 + bd - 1; z += 3) for (let x = x0 + 1; x < x0 + bw - 1; x += 3) {
      if (!R.chance(0.35)) continue;
      const near = towers.some(t => x >= t.x - 1 && x <= t.x + t.w && z >= t.z - 1 && z <= t.z + t.d);
      if (!near && K.free(x, z, 1, 1)) K.place(PIECES.planter, x, z, 1, 1);
    }
  }
  for (let i = 0; i < K.N; i++) if (K.occ[i] === O.FREE) K.occ[i] = O.OPEN;
  return K.finish({ start, extract, extra: { mega: { avenues: { xs, zs, w: A } } } });
}
