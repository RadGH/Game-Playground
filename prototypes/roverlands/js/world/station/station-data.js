// Lantern Station (map 'station') — the modules, how they join, their windows, lights and named spots. Plain data;
// change numbers here, not in stationgen.js. Every name is original.
//
// Axes as everywhere else: x east, y up, z south. The station floats with the home planet BELOW it (-y, tilted a
// little north), so the cupola under the hub and the lab's north window look down at it.
//
//                         Bunkroom (sleep)
//                               |
//   Dock (rocket port) ===== Hub ===== Lab ===== Greenhouse
//                               |  \
//                          Airlock    Cupola (below the hub)
//
// A room is an axis-aligned box: centre [x, y, z] and INSIDE half-sizes [hx, hy, hz]. Walls are WALL m thick outside
// that. A tunnel joins two rooms along one axis through a square door (TUNNEL half-size on each side).
// Windows / hatches sit in a room's face: face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'; [u, v] half-size of the hole
// and its offset [ou, ov] in the face (u, v = the face's two other axes in x, y, z order); fill 'glass' or 'hatch'.

export const STATION = {
  name: 'Lantern Station',
  gravity: 0,
  wall: 0.3,
  tunnel: 1.5,                     // a tunnel's inside half-size: doors are 3 m square
  floorY: -60,                     // the "ground" of the world contract, far below the station (nothing stands on it)
  space: {
    sky: 'black', hour: 11,
    sunDir: [0.55, 0.62, 0.56],
    // the planet fills the view below: dir = toward its centre; size = its radius over its distance
    planet: { dir: [0.16, -0.93, -0.33], size: 0.62, name: 'Wayfare', colour: '#4f8fd0', tilt: [1.75, 0.4, 0.25] },
  },
  rooms: [
    { id: 'hub', name: 'Hub', kind: 'hub', c: [0, 0, 0], h: [4, 4, 4], light: { colour: '#f2f4ff', power: 1.0 } },
    { id: 'dock', name: 'Docking Port', kind: 'dock', c: [-24, 0, 0], h: [8, 3, 3], light: { colour: '#ffd9a0', power: 0.9 },
      openings: [{ face: '-x', u: 1.6, v: 1.6, fill: 'hatch' }] },
    { id: 'lab', name: 'Lab', kind: 'lab', c: [22, 0, 0], h: [8, 3, 3.5], light: { colour: '#e8f4ff', power: 1.0 },
      openings: [{ face: '-z', u: 4.5, v: 1.4, fill: 'glass' }] },
    { id: 'greenhouse', name: 'Greenhouse', kind: 'greenhouse', c: [46, 0, 0], h: [8, 3.5, 4], light: { colour: '#ffd0f0', power: 1.1 },
      openings: [{ face: '+y', u: 6.5, v: 2.6, fill: 'glass' }] },
    { id: 'sleep', name: 'Bunkroom', kind: 'sleep', c: [0, 0, -20], h: [4, 3, 6], light: { colour: '#ffcf9a', power: 0.6 },
      openings: [{ face: '-x', u: 1.0, v: 2.0, fill: 'glass' }] },
    { id: 'airlock', name: 'Airlock', kind: 'airlock', c: [0, 0, 19], h: [2.5, 2.5, 3], light: { colour: '#ff9a6a', power: 0.7 },
      openings: [{ face: '+z', u: 1.2, v: 1.6, fill: 'hatch' }] },
    { id: 'cupola', name: 'Observation Cupola', kind: 'cupola', c: [0, -8.5, 0], h: [3, 2.5, 3], light: { colour: '#bcd4ff', power: 0.45 },
      openings: [{ face: '-y', u: 2.6, v: 2.6, fill: 'glass' }, { face: '-z', u: 2.4, v: 1.2, ov: -0.6, fill: 'glass' }] },
  ],
  // tunnels: [from room, to room] — they must line up along one axis (the generator checks)
  tunnels: [['hub', 'dock'], ['hub', 'lab'], ['lab', 'greenhouse'], ['hub', 'sleep'], ['hub', 'airlock'], ['hub', 'cupola']],
  // named spots: [x, y, z] (the generator checks each is inside a room or tunnel and clear of the walls)
  spots: [
    { id: 'dock_hatch', name: 'Docking hatch', at: [-30.6, 0, 0], room: 'dock', note: 'where the rocket docks and you float in' },
    { id: 'hub_centre', name: 'Hub', at: [0, 0, 0], room: 'hub' },
    { id: 'cupola_window', name: 'Cupola window', at: [0, -9.6, 0], room: 'cupola', note: 'the planet below' },
    { id: 'lab_bench', name: 'Lab bench', at: [24, -1.6, 2.2], room: 'lab' },
    { id: 'lab_window', name: 'Lab window', at: [22, 0, -2.6], room: 'lab' },
    { id: 'greenhouse_rows', name: 'Greenhouse rows', at: [46, 0, 0], room: 'greenhouse' },
    { id: 'bunk_1', name: 'Bunk 1', at: [2.8, -1.5, -23], room: 'sleep' },
    { id: 'bunk_2', name: 'Bunk 2', at: [2.8, 1.5, -23], room: 'sleep' },
    { id: 'bunk_3', name: 'Bunk 3', at: [-2.8, -1.5, -23], room: 'sleep' },
    { id: 'bunk_4', name: 'Bunk 4', at: [-2.8, 1.5, -23], room: 'sleep' },
    { id: 'airlock_inner', name: 'Airlock inner door', at: [0, 0, 16.6], room: 'airlock' },
    { id: 'airlock_outer', name: 'Airlock outer hatch', at: [0, 0, 21.4], room: 'airlock', note: 'the way out for a spacewalk (M11)' },
  ],
  spawn: 'dock_hatch',
  // props drawn inside (no colliders): benches, planters, bunks — [room, kind, x, y, z, hx, hy, hz]
  props: [
    ['lab', 'bench', 24, -2.4, 2.6, 4, 0.5, 0.7], ['lab', 'bench', 18, -2.4, -2.6, 3, 0.5, 0.7], ['lab', 'rack', 28.6, 0, 0, 0.6, 2.4, 2.4],
    ['greenhouse', 'planter', 46, -2.9, -2.6, 6.5, 0.5, 0.9], ['greenhouse', 'planter', 46, -2.9, 2.6, 6.5, 0.5, 0.9],
    ['greenhouse', 'planter', 46, 2.9, -2.6, 6.5, 0.5, 0.9], ['greenhouse', 'planter', 46, 2.9, 2.6, 6.5, 0.5, 0.9],
    ['sleep', 'bunk', 3.3, -1.5, -23, 0.6, 0.6, 2.2], ['sleep', 'bunk', 3.3, 1.5, -23, 0.6, 0.6, 2.2],
    ['sleep', 'bunk', -3.3, -1.5, -23, 0.6, 0.6, 2.2], ['sleep', 'bunk', -3.3, 1.5, -23, 0.6, 0.6, 2.2],
    ['hub', 'console', 0, -3.4, -3.2, 1.6, 0.6, 0.5], ['dock', 'locker', -22, 0, 2.6, 2.5, 2.2, 0.35], ['airlock', 'suit', 1.9, 0, 19.5, 0.4, 1.0, 0.4],
    ['airlock', 'suit', -1.9, 0, 19.5, 0.4, 1.0, 0.4],
  ],
};
