// Wayfare County towns: a street grid, blocks of box buildings, and the landmark yards the jobs need.
// Pure (no DOM / three / Rapier) and deterministic: every choice comes from the rng handed in.
//
// A town is nx x nz square blocks of B metres with S-metre streets between and around them (so the outer streets are
// a ring). The middle street each way runs on past the ring to a GATE 16 m out — county roads end there. Blocks named
// in `special` hold one landmark each; every other block is cut into lots along its north and south edges, each lot
// a box building set back from the street.
//
//   planCity(spec, rng) -> { id, name, x, z, ux, uz, streets: [{ pts: [[x,z],[x,z]], main }], gates: { n,s,e,w },
//                            buildings: [{ x, z, hx, hz, h, role, roof, colour, roofColour, floors, windows }],
//                            yards: [{ x0, z0, x1, z1 }]   paved ground (garage / depot yards, aprons),
//                            lots:  [{ x0, z0, x1, z1 }]   building ground,
//                            places: [{ kind, x, z, yaw, r, building (index into buildings), yard?, padSlots? }] }
//   yaw convention as everywhere: local +z points at world (sin yaw, 0, cos yaw); yaw 0 = facing south.

import { STYLES } from './county-data.js';

export function planCity(spec, rng) {
  const { B, S, nx, nz } = spec;
  const P = B + S;
  const ux = (nx * P) / 2, uz = (nz * P) / 2;            // centre -> outer street centreline
  const cx = spec.x, cz = spec.z;
  const style = STYLES[spec.style];
  const pick = (a) => a[Math.floor(rng() * a.length) % a.length];
  const lerp = (a, b, t) => a + (b - a) * t;

  // --- streets (centrelines). The middle ones run out to the gates. ---------------------------------------------
  const mi = Math.floor(nx / 2), mj = Math.floor(nz / 2);
  const GATE = 16;
  const streets = [];
  for (let i = 0; i <= nx; i++) {
    const x = cx - ux + i * P;
    const ext = i === mi ? GATE : 0;
    streets.push({ pts: [[x, cz - uz - ext], [x, cz + uz + ext]], main: i === mi });
  }
  for (let j = 0; j <= nz; j++) {
    const z = cz - uz + j * P;
    const ext = j === mj ? GATE : 0;
    streets.push({ pts: [[cx - ux - ext, z], [cx + ux + ext, z]], main: j === mj });
  }
  const xm = cx - ux + mi * P, zm = cz - uz + mj * P;
  const gates = { n: [xm, cz - uz - GATE], s: [xm, cz + uz + GATE], w: [cx - ux - GATE, zm], e: [cx + ux + GATE, zm] };

  const buildings = [], yards = [], lots = [], places = [];
  const specialAt = new Map();
  for (const [kind, [bi, bj]] of Object.entries(spec.special || {})) specialAt.set(bi + ',' + bj, kind);
  const blockCentre = (bi, bj) => [cx - ux + (bi + 0.5) * P, cz - uz + (bj + 0.5) * P];
  const half = B / 2;
  const centreDist = (x, z) => Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) / Math.max(ux, uz);

  function addBuilding(x, z, hx, hz, h, role, o = {}) {
    const floors = Math.max(1, Math.round(h / 3.4));
    const b = { x, z, hx, hz, h, role, roof: o.roof || style.roof, colour: o.colour || pick(style.walls), roofColour: o.roofColour || pick(style.roofs),
      floors, windows: o.windows ?? true };
    buildings.push(b);
    lots.push({ x0: x - hx - 1, z0: z - hz - 1, x1: x + hx + 1, z1: z + hz + 1 });
    return buildings.length - 1;
  }

  for (let bj = 0; bj < nz; bj++) for (let bi = 0; bi < nx; bi++) {
    const [bx, bz] = blockCentre(bi, bj);
    const kind = specialAt.get(bi + ',' + bj);
    if (kind) { landmark(kind, bx, bz); continue; }
    // ordinary block: two rows of lots, one facing the north street, one the south street
    for (const side of [-1, 1]) {
      let x = bx - half + 1;
      const end = bx + half - 1;
      while (end - x > 9) {
        let w = lerp(style.lot[0], style.lot[1], rng());
        if (end - x - w < 9) w = end - x;
        const lx0 = x, lx1 = x + w;
        x += w;
        if (rng() < 0.14) continue;                      // an empty lot: lawn
        const setback = 3 + rng() * 2;
        const depth = half - setback - 2 - rng() * 3;
        const hx = (lx1 - lx0) / 2 - 1.5, hz = depth / 2;
        if (hx < 3 || hz < 3) continue;
        const zFront = bz + side * (half - setback);    // the street-facing wall
        const z = zFront - side * hz;
        let h = lerp(style.h[0], style.h[1], rng() * rng());
        if (spec.style === 'port') h = lerp(style.h[0], style.h[1], Math.max(0, 1 - centreDist(bx, bz) * 0.8) * (0.4 + 0.6 * rng()));
        const role = spec.style === 'farm' || (spec.style === 'brick' && rng() < 0.35) ? 'house' : rng() < 0.45 ? 'shop' : 'block';
        addBuilding((lx0 + lx1) / 2, z, hx, hz, h, role, role === 'house' ? { roof: 'gable' } : {});
      }
    }
  }

  /** A landmark block: its building at the back (north), its yard or apron opening onto the south street. */
  function landmark(kind, bx, bz) {
    const yardKinds = { garage: 0.42, depot: 0.32, tow_yard: 0.36, fire_station: 0.46, hospital: 0.6, market: 0.36 };
    const front = bz + half;                              // the south edge of the block (on the street)
    if (kind in yardKinds) {
      const depth = B * yardKinds[kind];
      const hz = depth / 2 - 1, z = bz - half + 2 + hz;
      const wide = kind === 'tow_yard' ? half * 0.5 : half - 3;          // half-width of the building
      const bxOff = kind === 'tow_yard' ? -half * 0.45 : 0;
      const h = kind === 'hospital' ? 16 + rng() * 6 : kind === 'market' ? 6 : kind === 'fire_station' ? 9 : kind === 'depot' ? 10 : 7;
      const opts = { garage: { colour: [0.80, 0.78, 0.70], roofColour: [0.30, 0.32, 0.36], roof: 'flat' },
        depot: { colour: [0.62, 0.62, 0.58], roof: 'flat', windows: false }, tow_yard: { colour: [0.58, 0.52, 0.44], roof: 'flat' },
        fire_station: { colour: [0.72, 0.22, 0.18], roof: 'flat' }, hospital: { colour: [0.92, 0.92, 0.90], roof: 'flat' },
        market: { colour: [0.86, 0.72, 0.44], roofColour: [0.52, 0.26, 0.18], roof: 'gable', windows: false } }[kind];
      const bIdx = addBuilding(bx + bxOff, z, wide, hz, h, kind, opts);
      const y0 = z + hz + 1, yard = { x0: bx - half + 1, z0: y0, x1: bx + half - 1, z1: front - 1 };
      yards.push(yard);
      // the place you drive to: the middle of the yard, near the street; facing the street (south)
      const pz = (yard.z0 + yard.z1) / 2;
      const p = { kind, x: bx, z: pz, yaw: 0, r: Math.min(14, (yard.z1 - yard.z0) / 2), building: bIdx, yard };
      if (kind === 'garage' || kind === 'depot') {
        const n = kind === 'garage' ? 4 : 2;
        const span = B - 14;
        p.padSlots = [];
        for (let k = 0; k < n; k++) p.padSlots.push([bx - span / 2 + (n === 1 ? span / 2 : (k * span) / (n - 1)), pz]);
      }
      places.push(p);
      return;
    }
    // a shop or office: one building on the south half of the block, its front door on the south street;
    // ordinary lots behind it on the north half
    const hz = half / 2 - 2.5, z = front - 3 - hz;
    const h = kind === 'survey_office' ? 12 : 7 + rng() * 3;
    const opts = { outfitter: { colour: [0.74, 0.60, 0.78] }, supply: { colour: [0.56, 0.66, 0.54] }, survey_office: { colour: [0.80, 0.76, 0.62], roof: 'gable' } }[kind] || {};
    const bIdx = addBuilding(bx, z, half - 4, hz, h, kind, { roof: 'flat', ...opts });
    places.push({ kind, x: bx, z: front + 0.5, yaw: 0, r: 7, building: bIdx, door: [bx, front - 3] });
    const zb = bz - half / 2;
    for (const xx of [bx - half / 2, bx + half / 2]) {
      const hh = lerp(style.h[0], style.h[1], rng() * 0.6);
      addBuilding(xx, zb - 0.5, half / 2 - 2.5, half / 2 - 3.5, hh, 'block');
    }
  }

  return { id: spec.id, name: spec.name, x: cx, z: cz, ux, uz, streets, gates, buildings, yards, lots, places };
}
