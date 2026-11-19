// Rail yard: a wide band of tracks runs across the district from the west edge to the east edge — four tracks on
// gravel, a station platform between the middle two, freight trains standing on the tracks (box cars, flat cars with
// containers, tank cars that go up when hit), a signal tower at each throat and a station building on the north side.
// Streets cross the yard on level crossings. Trains are low enough to jump onto and make a maze of cover; the open
// gravel between them is where the swarm comes through. Fits industrial and downtown.
import { GC, O, PIECES, streetLines, pickW } from './kit.js';

export function railyard(K) {
  const { R, w, h, street } = K, D = K.D;
  // the yard's rows, top to bottom: gravel, track A, gravel, track B, platform ×2, track C, gravel, track D, gravel
  const z0 = Math.round(h * R.range(0.36, 0.44)), rows = ['T', 't', 'T', 't', 'P', 'P', 't', 'T', 't', 'T'];
  const tracks = [];
  rows.forEach((c, k) => {
    const z = z0 + k;
    K.rect(0, z, w, 1, O.OPEN, c === 't' ? GC.track : c === 'P' ? GC.platform : GC.ballast);
    if (c === 't') tracks.push(z);
  });
  for (let z = z0; z < z0 + rows.length; z++) for (let x = 0; x < w; x++) K.keep[K.I(x, z)] = 1;
  // a street along each side of the yard; north-south streets cross it on level crossings
  K.road(0, z0 - street, w, street); K.road(0, z0 + rows.length, w, street);
  const xs = streetLines(R, w, street, D.block);
  const crossX = xs.filter((x, i) => i % 2 === 0 || xs.length <= 3);                 // not every street crosses the yard
  for (const x of xs) {
    if (crossX.includes(x)) K.road(x, 0, street, h);
    else { K.road(x, 0, street, z0 - street); K.road(x, z0 + rows.length + street, street, h - z0 - rows.length - street); }
  }
  const zs = streetLines(R, h, street, D.block).filter(z => z + street < z0 - street - 2 || z > z0 + rows.length + street + 2);
  for (const z of zs) K.road(0, z, w, street);

  // the trains: on each track, runs of cars between the crossings with gaps to slip through
  const blockedX = x => crossX.some(c => x + 1 >= c - 1 && x <= c + street);       // keep a tile clear each side of a crossing
  const cars = [];
  for (const [ti, z] of tracks.entries()) {
    let x = R.int(1, 4);
    const busy = ti === 1 || ti === 2 ? 0.45 : 0.6;                                 // the platform tracks are quieter
    while (x < w - 2) {
      if (!R.chance(busy)) { x += R.int(3, 6); continue; }
      const n = R.int(2, 5), kind = pickW(R, [{ k: 'box', w: 3 }, { k: 'flat', w: 2 }, { k: 'tank', w: 1.5 }, { k: 'hopper', w: 1.5 }]).k;
      let put = 0;
      for (let c = 0; c < n && x < w - 2; c++) {
        if (blockedX(x) || !K.free(x, z, 2, 1, (o, i) => o === O.OPEN && K.gnd[i] === GC.track)) break;
        const k = c === 0 || R.chance(0.65) ? kind : pickW(R, [{ k: 'box' }, { k: 'flat' }, { k: 'tank' }, { k: 'hopper' }]).k;
        cars.push(K.place(k === 'tank' ? PIECES.tanker : PIECES.boxcar, x, z, 2, 1, false, { params: { kind: ['box', 'flat', 'tank', 'hopper'].indexOf(k), floors: 1 } }));
        x += 2; put++;
      }
      x += put ? R.int(2, 5) : 1;
    }
  }
  // signal towers at the yard's two throats, on the gravel between tracks A and B / C and D
  for (const [zz, xx] of [[z0 + 2, R.int(2, 5)], [z0 + 7, w - R.int(3, 6)]]) {
    for (let d = 0; d < 6; d++) { const x = xx + (zz === z0 + 2 ? d : -d); if (!blockedX(x) && K.free(x, zz, 1, 1, o => o === O.OPEN)) { K.place(PIECES.signal, x, zz, 1, 1); break; } }
  }
  // the station: on the north side of the yard, facing the platform, in the middle third
  {
    const sz = z0 - street - 2;
    for (let k = 0; k < 20; k++) { const sx = R.int(Math.round(w * 0.3), Math.round(w * 0.6)); if (K.free(sx, sz, 3, 2)) { K.place(PIECES.station, sx, sz, 3, 2, false); break; } }
  }
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  K.openArea(4, h - 5, 3); K.openArea(w - 5, 4, 3);
  K.fill({});
  return K.finish({ start, extract, extra: { rail: { z0, rows: rows.join(''), tracks } } });
}
