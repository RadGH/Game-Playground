// The hangar hub and the test range: maps with the same shape makeCityMap returns (w, h, lots, roads, plazas, start,
// extract, edges), so the mission engine runs them unchanged. Lots are the hangar's walls, bay backs, service spines and
// parked props (City Kit recipes, citykit/js/kit/hangar.js + workshop.js); every lot is `fixed` (no wreck stages — the
// hangar never breaks). Extra fields the hangar uses: `bays` (walk-up trigger circles, in tiles), `decor` (the painted
// floor: bay boxes, hazard stripes, the launch pad, light pools, stencilled names) and `interior: true` (the view draws
// a concrete hangar floor instead of streets). Pure: no DOM, same output every time.
//
// Layout (1 tile = 16 m; a mech is 0.75 tiles tall): the two back walls (z = 0 runs up-right on screen, x = 0 runs
// up-left) carry the bays, so every bay faces the camera and its neon sign is never hidden. Service spines stick out
// between bays. The launch pad with the parked dropship is the open front-right of the floor; a low safety rail runs
// along the two front edges.

export const WALL_H = 1.9;          // back walls: ~30 m, two and a half mechs
export const SPINE_H = 0.5;         // service spines between bays
export const RAIL_H = 0.1;          // front safety rail

/** The bays you walk up to. id → what the hangar calls onBay(id) with. Colour = the bay's neon. */
export const BAYS = {
  terminal: { label: 'Contracts terminal', color: '#3ff0ff', station: 0 },
  assembly: { label: 'Assembly bay', color: '#ffb02e', station: 1 },
  dealer: { label: 'Parts dealer', color: '#5fffb0', station: 2 },
  workshop: { label: 'Workshop', color: '#ff7a3a', station: 3 },
  paint: { label: 'Paint bay', color: '#ff5adf', station: 4 },
  range: { label: 'Test range', color: '#ff4a4a', station: 5 },
  tuning: { label: 'Tuning rig', color: '#7dff9a', station: 6 },   // round 7: Frame Tuning + skills + frame lines (ui/tuning.js)
  pad: { label: 'Launch pad', color: '#7fb4ff' },
};
export const BAY_IDS = Object.keys(BAYS);

/** A small builder shared by both maps: walls along the two back edges, spines, props, rails. */
function builder(w, h) {
  const lots = [], bays = [], decor = { bays: [], lights: [], labels: [], walkways: [], pad: null, stripes: [] };
  const lot = (o) => { const l = { id: 'H' + lots.length, hp: 1, fixed: true, solid: true, params: {}, ...o }; lots.push(l); return l; };
  /** One wall run along the back edge z = 0 (axis 'x') or x = 0 (axis 'z'), from tile `at`, `len` tiles long. */
  const wall = (axis, at, len, recipe, params, hgt = WALL_H) => axis === 'x'
    ? lot({ x: at, z: 0, w: len, d: 1, h: hgt, recipe, params: { ...params, len, rot: 0 } })
    : lot({ x: 0, z: at, w: 1, d: len, h: hgt, recipe, params: { ...params, len, rot: 3 } });
  /** A service spine sticking out of a back wall at tile `at`, `len` tiles long. */
  const spine = (axis, at, len) => axis === 'x'
    ? lot({ x: at, z: 1, w: 1, d: len, h: SPINE_H, recipe: 'hg-spine', params: { len, rot: 0 } })
    : lot({ x: 1, z: at, w: len, d: 1, h: SPINE_H, recipe: 'hg-spine', params: { len, rot: 3 } });
  /** A prop on one tile. face = screen direction (0..15) for props that face a way; solid = blocks the mech. */
  const prop = (x, z, recipe, params = {}, { face = null, solid = true, h = 0.3, w: pw = 1, d: pd = 1 } = {}) =>
    lot({ x, z, w: pw, d: pd, h, recipe, params, solid, ...(face != null ? { face } : {}) });
  return { lots, bays, decor, lot, wall, spine, prop };
}

/**
 * The hangar hub. Options are accepted for the map-def shape (seed, w, h) but the layout is fixed: it is a place the
 * player learns, not a random district.
 * @returns {{ w, h, lots, roads, plazas, start, extract, edges, bays, decor, interior: true, kind: 'hangar', name }}
 */
export function makeHangarMap() {
  const w = 24, h = 20;   // round 7: one tile wider for the Tuning rig's bay
  const B = builder(w, h), { lots, bays, decor, wall, spine, prop } = B;

  // corner column where the two back walls meet
  B.lot({ x: 0, z: 0, w: 1, d: 1, h: WALL_H + 0.15, recipe: 'hg-wall', params: { len: 1, kind: 3, rot: 0 } });

  /** Walk one back wall: [ ['wall', len, kind] | ['col'] | ['bay', id] ], placing spines after each column. */
  const run = (axis, list) => {
    let at = 1;
    for (const [what, a, b] of list) {
      if (what === 'wall') { wall(axis, at, a, 'hg-wall', { kind: b || 0 }); at += a; continue; }
      if (what === 'col') { wall(axis, at, 1, 'hg-wall', { kind: 3 }, WALL_H + 0.15); spine(axis, at, 2); at += 1; continue; }
      // a bay: its back (the station) in the wall, a painted box in front, a trigger circle at the mouth
      const id = a, info = BAYS[id];
      wall(axis, at, 4, 'hg-bay', { station: info.station });
      const box = axis === 'x' ? { x: at, z: 1, w: 4, d: 3 } : { x: 1, z: at, w: 3, d: 4 };
      const c = axis === 'x' ? { x: at + 2, z: 2.6 } : { x: 2.6, z: at + 2 };
      bays.push({ id, label: info.label, x: c.x, z: c.z, r: 1.25, color: info.color, axis });
      decor.bays.push({ ...box, color: info.color, mouth: axis === 'x' ? 'z' : 'x' });
      decor.lights.push({ x: c.x - (axis === 'z' ? 1.2 : 0), z: c.z - (axis === 'x' ? 1.2 : 0), r: 3.2, color: info.color, a: 0.32 });
      // the bay's name, stencilled on the floor at its mouth (reads with the wall as "up")
      decor.labels.push(axis === 'x' ? { text: info.label, x: at + 2, z: 4.55, axis: 'x', size: 0.42, maxW: 3.7, color: info.color }
        : { text: info.label, x: 4.55, z: at + 2, axis: 'z', size: 0.42, maxW: 3.7, color: info.color });
      at += 4;
    }
    return at;
  };
  // back wall up-right on screen (z = 0): assembly, dealer, workshop (the corner keeps a plain stretch so the two
  // walls' bays never share floor)
  const endX = run('x', [['wall', 3, 1], ['bay', 'assembly'], ['col'], ['bay', 'dealer'], ['col'], ['bay', 'workshop'], ['col'], ['bay', 'tuning']]);
  if (endX < w) wall('x', endX, w - endX, 'hg-wall', { kind: 2 });
  // back wall up-left on screen (x = 0): the contracts terminal, the paint bay, the range door
  const endZ = run('z', [['wall', 4, 1], ['bay', 'terminal'], ['col'], ['bay', 'paint'], ['col'], ['bay', 'range']]);
  if (endZ < h) wall('z', endZ, h - endZ, 'hg-wall', { kind: 0 });

  // the launch pad: painted circle, the dropship parked on it, its trigger beside the ship's ramp
  decor.pad = { x: 17, z: 14, r: 3.1, color: BAYS.pad.color };
  prop(16, 13, 'of-dropship', { cargo: 0, parked: 1 }, { face: 6, w: 2, d: 2, h: 0.55 });
  bays.push({ id: 'pad', label: BAYS.pad.label, x: 14.5, z: 14, r: 1.25, color: BAYS.pad.color, axis: 'x' });
  decor.labels.push({ text: BAYS.pad.label, x: 17, z: 17.5, axis: 'x', size: 0.5, color: BAYS.pad.color });
  decor.lights.push({ x: 17, z: 14, r: 4.2, color: '#7fb4ff', a: 0.22 });

  // everyday machines and people for scale (props from citykit/js/kit/workshop.js), kept off the walkways
  prop(8, 16, 'ws-semi', { cab: 3, trailer: 0 }, { face: 2, h: 0.25 });
  prop(9, 17, 'ws-stack', { kind: 1, count: 3 }, { h: 0.35 });
  prop(22, 7, 'ws-stack', { kind: 1, count: 4 }, { h: 0.35 });   // round 7: moved out of the Tuning rig's bay
  prop(21, 10, 'ws-scaffold', { levels: 5 }, { h: 0.5 });
  prop(22, 9, 'ws-drums', { count: 6 }, { h: 0.1 });
  prop(20, 6, 'ws-toolcart', { paint: 2 }, { h: 0.08 });
  prop(12, 8, 'ws-forklift', { forks: 1 }, { face: 10, h: 0.2 });
  prop(8, 11, 'ws-palletjack', { load: 1 }, { face: 3, solid: false, h: 0.06 });
  prop(11, 16, 'ws-reel', { wound: 3 }, { h: 0.15 });
  prop(12, 16, 'ws-toolcart', { paint: 1 }, { h: 0.08 });
  prop(18, 8, 'ws-gantry', { span: 24, hook: 8 }, { w: 2, d: 1, h: 0.9, solid: false });
  prop(14, 6, 'ws-stack', { kind: 0, count: 5 }, { h: 0.2 });
  // a spare service cradle and a welding lift out on the floor, so the middle of the hangar isn't bare
  prop(12, 11, 'ws-cradle', { walkways: 2, arms: 0 }, { h: 0.9 });
  prop(7, 13, 'ws-scissor', { lift: 6, welder: 1 }, { h: 0.45 });
  prop(15, 9, 'ws-forklift', { forks: 0 }, { face: 6, h: 0.2 });
  // crew: standing at bay corners and on the pad (never in a bay's walk-up circle)
  const crew = [[8.5, 4.5, 4, 0], [13.5, 4.5, 5, 1], [17.5, 5.5, 3, 2], [6.5, 8.5, 2, 1], [13.5, 10.5, 6, 0], [20.5, 17.5, 0, 3], [10.5, 8.5, 12, 0]];
  crew.forEach(([x, z, f, pose], i) => prop(Math.floor(x), Math.floor(z), 'ws-crew', { pose, suit: i % 5 }, { face: f, solid: false, h: 0.11 }));

  // safety rail along the two front edges (low: you see over it; it keeps the floor's edge readable)
  for (let x = 1; x < w; x += 4) prop(x, h - 1, 'hg-rail', { len: Math.min(4, w - x), rot: 0 }, { w: Math.min(4, w - x), d: 1, h: RAIL_H });
  for (let z = 1; z < h - 1; z += 4) { const n = Math.min(4, h - 1 - z); prop(w - 1, z, 'hg-rail', { len: n, rot: 3 }, { w: 1, d: n, h: RAIL_H }); }

  // ceiling light pools in a grid over the open floor + the main walkways (painted lanes)
  for (let x = 6; x < w - 2; x += 5) for (let z = 6; z < h - 1; z += 5) decor.lights.push({ x, z, r: 2.6, color: '#ffe8c0', a: 0.16 });
  decor.walkways.push([5, 5.2, 14, 0], [5.2, 5, 0, 14]);
  decor.stripes.push(...decor.bays.map(b => b.mouth === 'z' ? { x: b.x, z: b.z + b.d - 0.3, w: b.w, d: 0.3 } : { x: b.x + b.w - 0.3, z: b.z, w: 0.3, d: b.d }));

  lots.forEach((l, i) => { l.id = 'H' + i; });
  const start = { x: 9.5, z: 9.5 };
  return { w, h, lots, roads: [], plazas: [], start, extract: { x: 17, z: 14, r: 1.6 }, edges: [], bays, decor, interior: true, kind: 'hangar', name: 'Hangar' };
}

/** Test range distances from the firing line, in tiles (1 tile = 16 m). */
export const RANGE_ROWS = [3, 7, 13];

/**
 * The test range: a long firing hall running up-right on screen (toward the berm at z = 0). You start behind the
 * firing line; three rows of dummies stand at 48 m, 112 m and 208 m — plain, moving and armoured in each row.
 * @returns map shape + enemies: [{ kind, x, z }] (the dummies, placed at the start)
 */
export function makeRangeMap() {
  const w = 11, h = 30;
  const B = builder(w, h), { lots, decor, wall, prop } = B;
  B.lot({ x: 0, z: 0, w: 1, d: 1, h: WALL_H + 0.15, recipe: 'hg-wall', params: { len: 1, kind: 3, rot: 0 } });
  // berm at the far end (z = 0), the long side wall (x = 0) with columns every 6 tiles
  for (let x = 1; x < w; x += 5) wall('x', x, Math.min(5, w - x), 'hg-wall', { kind: 4 });
  for (let z = 1; z < h; z += 6) { wall('z', z, 1, 'hg-wall', { kind: 3 }, WALL_H + 0.15); const n = Math.min(5, h - z - 1); if (n > 0) wall('z', z + 1, n, 'hg-wall', { kind: z % 12 === 1 ? 1 : 0 }); }
  for (let z = 1; z < h - 1; z += 4) { const n = Math.min(4, h - 1 - z); prop(w - 1, z, 'hg-rail', { len: n, rot: 3 }, { w: 1, d: n, h: RAIL_H }); }
  for (let x = 1; x < w; x += 4) prop(x, h - 1, 'hg-rail', { len: Math.min(4, w - x), rot: 0 }, { w: Math.min(4, w - x), d: 1, h: RAIL_H });
  prop(1, 27, 'ws-toolcart', { paint: 0 }, { h: 0.08 });
  prop(1, 25, 'ws-crew', { pose: 1, suit: 1 }, { face: 2, solid: false, h: 0.11 });

  const line = 24;                          // the firing line
  decor.stripes.push({ x: 1, z: line, w: w - 2, d: 0.3 });
  decor.labels.push({ text: 'Firing line', x: 5.5, z: line + 1.1, axis: 'x', size: 0.42, color: '#ffb02e' });
  const enemies = [];
  for (const d of RANGE_ROWS) {
    const z = line - d;
    decor.walkways.push([1, z + 0.6, w - 2, 0]);
    decor.labels.push({ text: `${d * 16} m`, x: 9.4, z: z + 1.05, axis: 'x', size: 0.36, color: '#c9ced6' });
    enemies.push({ kind: 'dummy', x: 2.5, z }, { kind: 'dummy-move', x: 5.5, z }, { kind: 'dummy-armour', x: 8.5, z });
    decor.lights.push({ x: 5.5, z, r: 3, color: '#ffe8c0', a: 0.16 });
  }
  decor.lights.push({ x: 5.5, z: line + 2, r: 3.6, color: '#ffb02e', a: 0.14 });
  lots.forEach((l, i) => { l.id = 'R' + i; });
  return { w, h, lots, roads: [], plazas: [], start: { x: 5.5, z: line + 1.6 }, extract: { x: 5.5, z: line + 1.6, r: 1 }, edges: [], bays: [], decor, interior: true, kind: 'range', name: 'Test range', enemies };
}
