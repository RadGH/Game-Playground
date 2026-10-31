// A small town in the shape town-api.md describes, for tests and for the client until js/world's town is ready. Two
// street grids joined by one long road with one bridge on it: the same shape as the real map, and the bridge is the only
// way across, which is what the parked-truck test needs. No random numbers: same call, same town.

const KINDS_A = ['grocery', 'cafe', 'diner', 'bar', 'gym', 'park', 'office', 'school', 'clinic', 'fire_station', 'police_station', 'garage', 'town_hall', 'boutique'];
const KINDS_B = ['grocery', 'cafe', 'diner', 'bar', 'park', 'office', 'clinic', 'lumber_yard', 'sawmill', 'garage', 'rift_lodge', 'cafe'];

export function fakeTown({ size = 6, spacing = 56, gap = 2400 } = {}) {
  const nodes = [], edges = [], buildings = [];
  let e = 0, b = 0;
  const addGrid = (prefix, ox, zone, kinds) => {
    const id = (i, j) => `${prefix}${i}_${j}`;
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) nodes.push({ id: id(i, j), x: ox + i * spacing, z: j * spacing, zone });
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
      if (i + 1 < size) edges.push({ id: `e${e++}`, a: id(i, j), b: id(i + 1, j), speed: 12 });
      if (j + 1 < size) edges.push({ id: `e${e++}`, a: id(i, j), b: id(i, j + 1), speed: 12 });
    }
    let k = 0;
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
      const n = id(i, j), x = ox + i * spacing + 12, z = j * spacing + 12;
      const middle = i >= 2 && i <= 3 && j >= 1 && j <= 4;
      if (k < kinds.length && (middle || (i + j) % 3 === 0)) buildings.push({ id: `b${b++}`, kind: kinds[k++], node: n, x, z, zone });
      if (middle) buildings.push({ id: `b${b++}`, kind: 'apartment', node: n, x: x + 18, z, zone, units: 3 });
      else { buildings.push({ id: `b${b++}`, kind: 'house', node: n, x: x + 18, z, zone }); buildings.push({ id: `b${b++}`, kind: 'house', node: n, x, z: z + 18, zone }); }
    }
    while (k < kinds.length) buildings.push({ id: `b${b++}`, kind: kinds[k++], node: id(0, 0), x: ox - 15, z: k, zone });
  };
  addGrid('a', 0, 0, KINDS_A);
  const far = (size - 1) * spacing + gap;
  addGrid('b', far, 1, KINDS_B);
  const m = Math.floor(size / 2), edgeX = (size - 1) * spacing, z = m * spacing;
  nodes.push({ id: 'w1', x: edgeX + gap * 0.45, z, zone: 2 }, { id: 'w2', x: edgeX + gap * 0.55, z, zone: 2 });
  edges.push({ id: 'road1', a: `a${size - 1}_${m}`, b: 'w1', speed: 24 });
  edges.push({ id: 'bridge', a: 'w1', b: 'w2', speed: 24, bridge: true });
  edges.push({ id: 'road2', a: 'w2', b: `b0_${m}`, speed: 24 });
  // the timber site, on a lane of its own off the first town (tests)
  const gx = -90, gz = 0, tree = (i, j) => ({ x: gx - 60 + i * 6, z: gz - 40 - j * 6, y: 0, s: 1, tint: 0.5 });
  nodes.push({ id: 'timber:gate', x: gx, z: gz, zone: 0 });
  edges.push({ id: 'timber-lane', a: 'a0_0', b: 'timber:gate', speed: 12 });
  buildings.push({ id: 'camp', kind: 'forest_camp', node: 'timber:gate', x: gx - 30, z: gz - 12, zone: 0, w: 13, d: 10 }, { id: 'mill', kind: 'saw_mill', node: 'timber:gate', x: gx + 10, z: gz - 12, zone: 0, w: 16, d: 11 });
  const bench = z => ({ infeed: [gx + 2, z], lever: [gx + 11, z + 2.2], blade: [gx + 13, z], out: [gx + 25, z] }), trees = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 9; i++) trees.push(tree(i, j));
  const timber = { name: 'Test Wood', y: 0, centre: [gx - 10, gz - 40], radius: 110, camp: 'camp', mill: 'mill', node: 'timber:gate', trees, landing: [gx - 40, gz - 30], lever: [gx - 35.5, gz - 30], deck: [gx - 2, gz - 45], rack: [gx + 30, gz - 10], truck: { x: gx + 8, z: gz + 10, yaw: 0 }, benches: [bench(-40), bench(-30), bench(-20)] };
  const hydrants = nodes.filter(n => n.zone !== 2).map(n => [n.x + 3, n.z + 3]);
  return { id: `fake-${size}-${spacing}-${gap}`, nodes, edges, buildings, timber, hydrants };
}
