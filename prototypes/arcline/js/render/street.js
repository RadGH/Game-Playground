// Where the street lights and neon signs stand (owner report #71, 2026-11-16: "Add street lights and neon
// sign/billboards especially in commercial areas"). Visual only — no cost, no upkeep, nothing the sim reads. Pure (no
// DOM), so tests check the spacing; map.js draws each piece with the City Kit models in citykit/js/kit/street.js.
//
//   Lamps: on straight road tiles every LAMP_EVERY tiles along the road (never on a crossing or a corner), at the road's
//          edge with the arm over the road, alternating sides; avenues and highways get a two-armed lamp on the
//          median instead. Bridges too (map.js draws them at deck height).
//   Signs: most shops and offices (zoned Commercial) put up one sign on the pavement of a road beside them — a wide
//          billboard for small shops, a tall neon blade sign for hotels and towers. The lamp on that edge steps aside.
// → [{ id: 'st-lamp' | 'st-billboard', x, z, turn, params, arm?: [dx, dz] }]   x, z = the post's foot (tile units);
//   turn = the model turn that lays it out (model +x → +x, +z, −x, −z for turns 0..3).
export const LAMP_EVERY = 3;
export const SIGN_SHARE = 0.75;
const EDGE = 0.42;
const turnOf = (dx, dz) => (dx > 0 ? 0 : dz > 0 ? 1 : dx < 0 ? 2 : 3);
const hash = (a, b, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

export function streetPlan(r) {
  const N = r.size, road = r.tiles.road;
  let sig = 0; for (const l of r.lots) if (l.zone === 'C') sig = (sig + l.x * 7 + l.z * 13 + l.tier * 31 + (l.n || 0)) % 1e9;
  const key = `${r.lineRev || 0}|${r.lots.length}|${sig}`;
  if (r._street?.key === key) return r._street.list;
  const isRoad = (x, z) => x >= 0 && z >= 0 && x < N && z < N && road[z * N + x] > 0;
  const out = [], taken = new Set();   // `${i}|${side}` — a sign already stands on that pavement
  // signs first (they choose their spot; lamps keep clear)
  for (const l of r.lots) {
    if (l.kind !== 'zoned' || l.zone !== 'C') continue;
    const h = hash(l.x, l.z, l.n || 1); if ((h % 1000) / 1000 >= SIGN_SHARE) continue;
    const spots = [];
    for (let k = 0; k < l.d; k++) { spots.push([l.x - 1, l.z + k, 1, 0]); spots.push([l.x + l.w, l.z + k, -1, 0]); }
    for (let j = 0; j < l.w; j++) { spots.push([l.x + j, l.z - 1, 0, 1]); spots.push([l.x + j, l.z + l.d, 0, -1]); }
    const ok = spots.filter(([x, z]) => isRoad(x, z) && !r.ter.water[z * N + x]);
    if (!ok.length) continue;
    const [x, z, dx, dz] = ok[h % ok.length], i = z * N + x;   // (dx, dz): from the road toward the shop
    if (taken.has(`${i}|${dx},${dz}`)) continue;
    taken.add(`${i}|${dx},${dz}`);
    const along = (h >> 8) % 2 ? 0.26 : -0.26, blade = l.tier >= 3 || (l.tier === 2 && (h >> 10) % 2);
    out.push({ id: 'st-billboard', x: x + 0.5 + dx * EDGE + (dz ? along : 0), z: z + 0.5 + dz * EDGE + (dx ? along : 0),
      turn: dx ? 1 : 0, params: { kind: blade ? 1 : 0, hue: (h >> 4) % 6, seed: (h >> 12) % 6 + 1 } });
  }
  // lamps
  for (let i = 0; i < N * N; i++) {
    const lv = road[i]; if (!lv) continue;
    const x = i % N, z = (i / N) | 0;
    const ax = isRoad(x + 1, z) || isRoad(x - 1, z), az = isRoad(x, z + 1) || isRoad(x, z - 1);
    if (ax === az) continue;                                   // a crossing, a corner or a lone tile
    const pos = ax ? x : z; if (pos % LAMP_EVERY) continue;
    const [px, pz] = ax ? [0, 1] : [1, 0];                    // across the road
    if (lv >= 2) { out.push({ id: 'st-lamp', x: x + 0.5, z: z + 0.5, turn: turnOf(px, pz), params: { kind: 1 }, arm: [px, pz] }); continue; }
    let s = ((pos / LAMP_EVERY) | 0) % 2 ? 1 : -1;
    if (taken.has(`${i}|${s * px},${s * pz}`)) s = -s;       // a sign stands on that pavement: the other side
    if (taken.has(`${i}|${s * px},${s * pz}`)) continue;
    // the post on side s, its arm reaching back over the road (toward −s)
    out.push({ id: 'st-lamp', x: x + 0.5 + s * px * EDGE, z: z + 0.5 + s * pz * EDGE, turn: turnOf(-s * px, -s * pz), params: { kind: 0 }, arm: [-s * px, -s * pz] });
  }
  Object.defineProperty(r, '_street', { value: { key, list: out }, enumerable: false, configurable: true, writable: true });
  return out;
}
