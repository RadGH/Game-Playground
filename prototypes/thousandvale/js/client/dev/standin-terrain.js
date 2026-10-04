// STAND-IN — replaced by stream B's js/rules/terrain-read.js (docs/requests.md "D -> B").
//
// A seeded 1 km test valley built from World Forge's noise, so the client and the stand-in server
// have ground to stand on before the real zone bake exists. Both import this file and call
// `standinTerrain(seed)`, so they read identical heights. Pure (no DOM / three.js).
//
// Layout (metres, origin at the centre): a flat clearing at the origin where the waystone and the
// first camp stand, rolling meadow to the north where the wolves hunt, a lake to the south-east,
// and the ground climbing into ridges toward every edge so the valley has walls you can see.

import { makeNoise2D, fbm, ridged, subSeed } from '../../../../../worldgen/js/noise.js';
import { createHeightField } from '../heightfield.js';

export const STANDIN = {
  size: 1024, res: 513,
  spawn: { x: 0, z: 6 },
  lake: { x: 150, z: -150, r: 95, depth: 7 },
  clearing: { x: 0, z: 0, r: 46 },
  meadow: { x: -10, z: 150, r: 110 },
  // Worn earth the terrain shader draws and the tree scatter avoids.
  paths: [
    { width: 3.2, pts: [[0, 0], [-6, 40], [-22, 90], [-30, 130], [-60, 180], [-105, 215]] },
    { width: 2.6, pts: [[-22, 90], [30, 140], [60, 170], [22, 250]] },
    { width: 2.8, pts: [[0, 0], [40, -40], [95, -85], [130, -100]] },
    { width: 2.4, pts: [[0, 0], [-60, -30], [-150, 60]] },
  ],
  // Placements in the shape stream B's bake will emit: { kind, id, x, z, yaw, data }.
  placements: [
    { kind: 'prop', id: 'rune_stone', x: 0, z: -9, yaw: 0, data: { label: 'Waystone', glow: '#7fd7ff' } },
    { kind: 'prop', id: 'campfire', x: 7, z: 5, yaw: 0, data: { fire: true } },
    { kind: 'prop', id: 'wood_pile', x: 10.5, z: 7.2, yaw: 0.6 },
    { kind: 'prop', id: 'well', x: -12, z: 2, yaw: 0.3 },
    { kind: 'prop', id: 'crate', x: -14, z: -9, yaw: 0.2 }, { kind: 'prop', id: 'crate', x: -15.2, z: -7.6, yaw: 1.1 },
    { kind: 'prop', id: 'barrel', x: -12.8, z: -10.6, yaw: 0 }, { kind: 'prop', id: 'barrel', x: -11.6, z: -9.5, yaw: 0 },
    { kind: 'prop', id: 'hay_bale', x: 14, z: -8, yaw: 0.4 }, { kind: 'prop', id: 'hay_bale', x: 15.6, z: -6.9, yaw: 1.4 },
    { kind: 'prop', id: 'banner_pole', x: -5, z: -10, yaw: 0, data: { colour: '#a8322d' } },
    { kind: 'prop', id: 'banner_pole', x: 5, z: -10, yaw: 0, data: { colour: '#a8322d' } },
    { kind: 'prop', id: 'signpost', x: -4, z: 30, yaw: 3.0, data: { label: 'Greyfang Meadow' } },
    { kind: 'prop', id: 'torch_post', x: -3, z: 18, yaw: 0, data: { fire: true } },
    { kind: 'prop', id: 'torch_post', x: 4, z: 18, yaw: 0, data: { fire: true } },
    { kind: 'prop', id: 'torch_post', x: 18, z: -2, yaw: 0, data: { fire: true } },
    { kind: 'prop', id: 'torch_post', x: -18, z: -2, yaw: 0, data: { fire: true } },
    // Palisade arcs with gaps where the three paths leave (angles: x = cos a * r, z = sin a * r).
    { kind: 'ring', id: 'palisade_stake', x: 0, z: 0, data: { r: 30, from: 2.0, to: 3.35, step: 0.03 } },
    { kind: 'ring', id: 'palisade_stake', x: 0, z: 0, data: { r: 30, from: 3.85, to: 5.25, step: 0.03 } },
    { kind: 'ring', id: 'palisade_stake', x: 0, z: 0, data: { r: 30, from: 5.75, to: 7.73, step: 0.03 } },
  ],
};

const cache = new Map();

export function standinTerrain(seed = 7) {
  if (cache.has(seed)) return cache.get(seed);
  const { size, res, lake, clearing } = STANDIN;
  const nA = makeNoise2D(subSeed(seed, 'hills')), nB = makeNoise2D(subSeed(seed, 'ridges')), nC = makeNoise2D(subSeed(seed, 'detail'));
  const data = new Float32Array(res * res);
  const half = size / 2, step = size / (res - 1);
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = -half + i * step, z = -half + j * step;
      // Rolling hills.
      let h = (fbm(nA, x * 0.0032, z * 0.0032, { octaves: 5 }) - 0.5) * 34;
      h += (fbm(nC, x * 0.02, z * 0.02, { octaves: 3 }) - 0.5) * 2.2;
      // Valley walls: ridged mountains rising toward the edges.
      const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
      const wall = smooth(0.55, 0.98, edge);
      h += wall * (40 + ridged(nB, x * 0.006, z * 0.006, { octaves: 5 }) * 90);
      // The lake: a smooth bowl below the waterline.
      const dl = Math.hypot(x - lake.x, z - lake.z) / lake.r;
      if (dl < 1.6) h = h * smooth(0.6, 1.6, dl) + (-lake.depth * (1 - dl * dl)) * (1 - smooth(0.6, 1.6, dl));
      // The clearing: flattened toward a gentle height so the camp sits level.
      const dc = Math.hypot(x - clearing.x, z - clearing.z) / clearing.r;
      const k = 1 - smooth(0.7, 1.8, dc);
      h = h * (1 - k) + 2.0 * k;
      data[j * res + i] = h;
    }
  }
  const hf = createHeightField({ size, res, data, waterLevel: 0 });
  hf.seed = seed;
  hf.standin = true;
  cache.set(seed, hf);
  return hf;
}
