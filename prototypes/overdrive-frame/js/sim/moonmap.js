// The moon district (round 5, "first taste of the moon"): a mining and research outpost on grey dust under a black
// sky. Same output as makeCityMap (lots, roads, plazas, start, extract, edges) so the mission, the flow field, the
// mirror and the briefing map need nothing new — plus `moon: { craters, mine, pads }` for the ground drawing.
//
//   roads    rover tracks: packed dust in a loose grid (enemies come in along them, like streets in the city)
//   craters  round open ground: nothing is built in one, you walk straight through (flat in the rules, a bowl on screen)
//   mine     the open-cast pit in a far corner, drill rigs and ore silos round its rim (missions can place nests in it)
//   pads     the landing pad you drop onto (start) and the one the dropship lifts you from (extraction)
//
// Buildings are City Kit moon recipes (citykit/js/kit/moon.js): domes, habitat modules, labs, comms masts, ore silos,
// rover garages, solar arrays, oxygen tanks (they blow up), drill rigs. Seeded and pure like the city: the co-op
// server and every player build the identical outpost from the same seed.
import { makeRng } from './rng.js';

const FLOOR = 0.22;
const STYLES = ['chrome', 'pearl', 'copper', 'concrete'];

/** The moon's entry in citymap.js DISTRICTS. h = roof height in tiles (a frame is 0.75 tall). */
export const MOON_DISTRICT = {
  label: 'Moon outpost', moon: true, street: 2, block: [8, 12], plaza: 0.2, open: 0.12, lots: [
    { recipe: 'moon-dome', size: [2, 2], floors: [1, 1], h: 0.8, w: 2 },
    { recipe: 'moon-hab', size: [2, 1], floors: [1, 2], w: 3 },
    { recipe: 'moon-lab', size: [1, 1], floors: [2, 4], w: 2 },
    { recipe: 'moon-mast', size: [1, 1], floors: [1, 1], h: 1.6, w: 0.8, hp: 600 },
    { recipe: 'moon-silo', size: [2, 1], floors: [1, 1], h: 0.72, w: 2 },
    { recipe: 'moon-garage', size: [2, 2], floors: [1, 1], h: 0.5, w: 2 },
    { recipe: 'moon-solar', size: [2, 1], floors: [1, 1], h: 0.24, w: 2.5, hp: 700 },
    { recipe: 'moon-tank', size: [1, 1], floors: [1, 1], h: 0.4, w: 0.7, explosive: 1100, hp: 500 },
  ],
};
const DRILL = { recipe: 'moon-drill', size: [2, 2], floors: [1, 1], h: 1.1 };

const pickW = (R, list) => { const tot = list.reduce((s, x) => s + (x.w || 1), 0); let v = R.next() * tot; for (const x of list) { v -= x.w || 1; if (v <= 0) return x; } return list[0]; };

/** @returns the same shape as makeCityMap, district 'moon', plus `moon: { craters: [{x,z,r}], mine: {x,z,r}, pads: [{x,z,r}] }`. */
export function makeMoonMap({ seed, w = 44, h = 44 }) {
  const D = MOON_DISTRICT, R = makeRng(seed * 31 + 7);
  const occ = new Uint8Array(w * h);            // 0 free, 1 track, 2 building, 3 kept open, 4 crater / mine pit
  const set = (x, z, v) => { if (x >= 0 && z >= 0 && x < w && z < h) occ[z * w + x] = v; };
  const free = (x, z, sw, sd) => { for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) if (i < 0 || j < 0 || i >= w || j >= h || occ[j * w + i]) return false; return true; };
  const roads = [], plazas = [], lots = [], craters = [];

  // rover tracks: a loose grid, wider apart than city streets
  const lines = (len) => { const out = []; let p = 2 + R.int(0, 2); while (p < len - 4) { out.push(p); p += D.street + R.int(D.block[0], D.block[1]); } return out; };
  const xs = lines(w), zs = lines(h);
  for (const x of xs) { roads.push([x, 0, D.street, h]); for (let z = 0; z < h; z++) for (let k = 0; k < D.street; k++) set(x + k, z, 1); }
  for (const z of zs) { roads.push([0, z, w, D.street]); for (let x = 0; x < w; x++) for (let k = 0; k < D.street; k++) set(x, z + k, 1); }

  // the two landing pads stay open
  const openArea = (cx, cz, r) => { plazas.push([cx - r, cz - r, r * 2, r * 2]); for (let z = cz - r; z < cz + r; z++) for (let x = cx - r; x < cx + r; x++) if (occ[z * w + x] !== 1) set(x, z, 3); };
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  openArea(4, h - 5, 3); openArea(w - 5, 4, 3);
  const pads = [{ x: start.x, z: start.z, r: 2.4 }, { x: extract.x, z: extract.z, r: 2.2 }];

  // round open ground (crater, mine pit): every tile whose centre is inside, except tracks
  const hollow = (cx, cz, r) => { for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r && x >= 0 && z >= 0 && x < w && z < h && occ[z * w + x] !== 1) set(x, z, 4); };

  // the mine: an open-cast pit in one of the two corners that are neither drop nor extraction
  // — set in the middle of the block between tracks nearest that corner, so no track runs through the pit
  const corner = R.chance(0.5) ? { x: 11, z: 11 } : { x: w - 11, z: h - 11 };
  const gaps = (ls, len) => { const out = [], ends = [-D.street, ...ls, len]; for (let i = 0; i + 1 < ends.length; i++) { const a = ends[i] + D.street, b = ends[i + 1]; if (b - a >= 6) out.push([a, b]); } return out; };
  const near = (gs, c) => gs.reduce((best, g) => (Math.abs((g[0] + g[1]) / 2 - c) < Math.abs((best[0] + best[1]) / 2 - c) ? g : best), gs[0] || [c - 4, c + 4]);
  const gx = near(gaps(xs, w), corner.x), gz = near(gaps(zs, h), corner.z);
  const mine = { x: (gx[0] + gx[1]) / 2, z: (gz[0] + gz[1]) / 2, r: Math.min(4.4, (gx[1] - gx[0]) / 2 - 0.4, (gz[1] - gz[0]) / 2 - 0.4) };
  hollow(mine.x, mine.z, mine.r);

  // craters: a handful, never on a landing pad or the mine
  const n = 5 + R.int(0, 4);
  for (let tries = 0; craters.length < n && tries < 80; tries++) {
    const r = R.range(1.3, 3.4), x = R.range(r + 1, w - r - 1), z = R.range(r + 1, h - r - 1);
    if (pads.some(p => Math.hypot(p.x - x, p.z - z) < r + p.r + 2.5)) continue;
    if (Math.hypot(mine.x - x, mine.z - z) < r + mine.r + 1.5) continue;
    if (craters.some(c => Math.hypot(c.x - x, c.z - z) < r + c.r + 0.5)) continue;
    const c = { x: +x.toFixed(2), z: +z.toFixed(2), r: +r.toFixed(2) }; craters.push(c); hollow(c.x, c.z, c.r);
  }

  const place = (c, x, z, sw, sd, turn) => {
    const floors = R.int(c.floors[0], c.floors[1]);
    const height = c.h ?? (floors * FLOOR + 0.14);
    const hp = c.hp ?? Math.round(500 * sw * sd * (1 + Math.min(floors, 30) * 0.18));
    lots.push({ id: 'L' + lots.length, x, z, w: sw, d: sd, h: +height.toFixed(3), hp, recipe: c.recipe, params: { floors, seed: R.int(1, 9999), rot: turn ? 1 : 0, style: STYLES[R.int(0, STYLES.length - 1)] }, explosive: c.explosive || 0 });
    for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) set(i, j, 2);
  };

  // drill rigs round the mine's rim (and ore silos), up to three of each
  const silo = D.lots.find(l => l.recipe === 'moon-silo'); let drills = 0, silos = 0;
  for (let k = 0, a0 = R.range(0, Math.PI * 2); k < 10; k++) {
    const a = a0 + k * Math.PI / 5, x = Math.round(mine.x + Math.cos(a) * (mine.r + 1.2) - 1), z = Math.round(mine.z + Math.sin(a) * (mine.r + 1.2) - 1);
    const c = k % 2 ? silo : DRILL; if (c === DRILL ? drills >= 3 : silos >= 2) continue;
    const [sw, sd] = c.size;
    if (free(x, z, sw, sd)) { place(c, x, z, sw, sd, false); if (c === DRILL) drills++; else silos++; }
  }

  // compounds: clusters of buildings with bare dust between them (an outpost, not a city block)
  const compounds = [];
  for (let k = 0, m = Math.round(w * h / 75); k < m; k++) compounds.push({ x: R.range(2, w - 2), z: R.range(2, h - 2), r: R.range(2.2, 4.2) });
  const inCompound = (x, z) => compounds.some(c => Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z) <= c.r);

  // the outpost: walk every free tile; outside a compound the dust stays open
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (occ[z * w + x]) continue;
    if (!inCompound(x, z)) { set(x, z, 3); continue; }
    if (R.chance(D.plaza * 0.06) && free(x, z, 3, 3)) { plazas.push([x, z, 3, 3]); for (let j = z; j < z + 3; j++) for (let i = x; i < x + 3; i++) set(i, j, 3); continue; }
    if (R.chance(D.open)) { set(x, z, 3); continue; }
    let pick = null;
    for (let tries = 0; tries < 6 && !pick; tries++) {
      const c = pickW(R, D.lots);
      const turn = R.chance(0.5) && c.size[0] !== c.size[1];
      const sw = turn ? c.size[1] : c.size[0], sd = turn ? c.size[0] : c.size[1];
      if (free(x, z, sw, sd)) pick = { c, sw, sd, turn };
    }
    if (!pick) { set(x, z, 3); continue; }
    place(pick.c, x, z, pick.sw, pick.sd, pick.turn);
  }

  // every open area reaches a track: a 2-wide lane from each landing pad and from the mine to the nearest one
  const carve = (cx, cz) => {
    let best = null;
    for (const x of xs) { const d = Math.abs(x + D.street / 2 - cx); if (!best || d < best.d) best = { d, axis: 'x', at: x + D.street / 2 }; }
    for (const z of zs) { const d = Math.abs(z + D.street / 2 - cz); if (!best || d < best.d) best = { d, axis: 'z', at: z + D.street / 2 }; }
    if (!best) return;
    const lane = best.axis === 'x' ? [Math.floor(Math.min(cx, best.at)) - 1, Math.floor(cz) - 1, Math.ceil(Math.abs(best.at - cx)) + 2, 2] : [Math.floor(cx) - 1, Math.floor(Math.min(cz, best.at)) - 1, 2, Math.ceil(Math.abs(best.at - cz)) + 2];
    const hit = l => l.x < lane[0] + lane[2] && l.x + l.w > lane[0] && l.z < lane[1] + lane[3] && l.z + l.d > lane[1];
    for (let i = lots.length - 1; i >= 0; i--) if (hit(lots[i])) lots.splice(i, 1);
    plazas.push(lane);
  };
  carve(start.x, start.z); carve(extract.x, extract.z); carve(mine.x, mine.z);
  // nothing sealed in: a building with no open ground next to it that the pad can walk to is left out (dust instead),
  // so every building can be walked up to and every pocket of dust is empty
  const solid = new Uint8Array(w * h); for (const l of lots) for (let j = l.z; j < l.z + l.d; j++) for (let i = l.x; i < l.x + l.w; i++) solid[j * w + i] = 1;
  const seen = new Uint8Array(w * h), q = [Math.floor(start.z) * w + Math.floor(start.x)]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), x = c % w, z = (c / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, n = nz * w + nx; if (nx >= 0 && nz >= 0 && nx < w && nz < h && !solid[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
  const reachable = l => { for (let j = l.z - 1; j <= l.z + l.d; j++) for (let i = l.x - 1; i <= l.x + l.w; i++) if (i >= 0 && j >= 0 && i < w && j < h && seen[j * w + i]) return true; return false; };
  for (let i = lots.length - 1; i >= 0; i--) if (!reachable(lots[i])) lots.splice(i, 1);
  lots.forEach((l, i) => { l.id = 'L' + i; });

  // spawn edges: track ends on the map border (the swarm comes in along the rover tracks)
  const edges = [];
  for (const x of xs) { edges.push({ x: x + D.street / 2, z: 0.5 }); edges.push({ x: x + D.street / 2, z: h - 0.5 }); }
  for (const z of zs) { edges.push({ x: 0.5, z: z + D.street / 2 }); edges.push({ x: w - 0.5, z: z + D.street / 2 }); }
  return { w, h, lots, roads, plazas, start, extract, edges, district: 'moon', seed, moon: { craters, mine: { x: +mine.x.toFixed(2), z: +mine.z.toFixed(2), r: +mine.r.toFixed(2) }, pads } };
}
