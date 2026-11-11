// Areas: a zone, a dungeon floor or the town. M1 has one test field built from a seed; M10 replaces this with the
// hand-made zone JSON (data/zones/*.json) read through the same shape:
//   { id, name, bounds: { x0, z0, x1, z1 }, spawn: { x, z }, blockers: [{ x, z, r, kind }], props: [{ kind, x, z, r, yaw, s }] }
import { makeRng } from './rng.js';

export function testField(seed = 7) {
  const rng = makeRng(seed);
  const half = 60;
  const area = { id: 'test_field', name: 'Proving Meadow', level: 1, bounds: { x0: -half, z0: -half, x1: half, z1: half }, spawn: { x: 0, z: 6 }, blockers: [], props: [] };
  const clear = (x, z) => Math.hypot(x, z - 6) > 7 && Math.abs(x) > 2.5;     // keep the start and the north road clear
  const kinds = [['tree', 0.55, 0.7], ['pine', 0.35, 0.6], ['rock', 0.1, 0.9]];
  for (let i = 0; i < 140; i++) {
    const x = (rng() * 2 - 1) * (half - 3), z = (rng() * 2 - 1) * (half - 3);
    if (!clear(x, z)) continue;
    let k = rng(), kind = 'tree';
    for (const [id, w] of kinds) { if (k < w) { kind = id; break; } k -= w; }
    const s = 0.8 + rng() * 0.6, r = (kind === 'rock' ? 0.9 : 0.5) * s;
    area.props.push({ kind, x, z, r, yaw: rng() * Math.PI * 2, s });
    area.blockers.push({ x, z, r, kind });
  }
  // a ring of torches and a fence by the start so the scale reads
  for (let i = 0; i < 6; i++) {
    const t = i / 6 * Math.PI * 2, x = Math.cos(t) * 5.5, z = 6 + Math.sin(t) * 5.5;
    area.props.push({ kind: 'torch', x, z, r: 0.2, yaw: 0, s: 1 });
    area.blockers.push({ x, z, r: 0.2, kind: 'torch' });
  }
  // monster packs in a ring around the start, further out = a level higher
  area.spawns = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.3, d = 20 + (i % 3) * 11;
    let x = Math.cos(a) * d, z = 6 + Math.sin(a) * d;
    for (const b of area.blockers) if (Math.hypot(x - b.x, z - b.z) < b.r + 2) { x += 2.5; }
    area.spawns.push({ x, z, level: 1 + (i % 3) });
  }
  for (let i = -6; i <= 6; i++) area.props.push({ kind: 'flowers', x: (rng() * 2 - 1) * 20, z: (rng() * 2 - 1) * 20, r: 0, yaw: rng() * 6, s: 1 });
  return area;
}
