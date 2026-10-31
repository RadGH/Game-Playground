// Turns js/world's built world into the town the sim reads (town-api.md). Takes the built object, imports nothing from
// js/world, so the sim stays free of it. The world's streets are hand-written and its plots are houses / flats / shops /
// civic / park; each is dealt its trade from data/buildings.json `worldKinds`, in a fixed order, per town, so `b.use` on the
// world's own building row is what the page draws and what the sim plans.

export function townFromWorld(world, kindsData) {
  const map = kindsData.worldKinds, nodes = world.roadGraph.nodes.map(n => ({ id: n.id, x: n.x, z: n.z, zone: n.town ?? 'country' }));
  const edges = world.roads.map(r => ({ id: r.id, a: r.from, b: r.to, speed: r.limit, points: r.pts.map(p => [p[0], p[1]]) }));
  const nearest = (x, z) => {
    let best = null, bestD = Infinity;
    for (const n of nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bestD) { bestD = d; best = n; } }
    return best.id;
  };
  const counters = {};
  const nextKind = (town, shell) => {
    const list = map[shell], key = `${town}/${shell}`, i = counters[key] = (counters[key] ?? -1) + 1;
    return list[i % list.length];
  };
  const row = b => {
    const kind = nextKind(b.town, b.kind), [x, z] = b.door || [b.x, b.z];
    const out = { id: b.id, kind, node: nearest(x, z), x, z, zone: b.town, cx: b.x, cz: b.z, yaw: b.yaw, w: b.w, d: b.d, floors: b.floors, doorX: b.doorX ?? 0, garage: b.garage ?? 0 };
    if (kind === 'apartment') out.units = Math.max(2, (b.floors || 2) * 2);
    b.use = kind;
    return out;
  };
  const buildings = world.buildings.filter(b => !b.site).map(row);
  // Parks have no building, but they are places: a walk in the park is the most visible thing anybody does.
  for (const block of world.blocks) {
    if (block.style !== 'park') continue;
    const [x, z] = block.loop[0];
    buildings.push({ id: block.id, kind: 'park', node: nearest(x, z), x, z, zone: block.town });
  }
  // The timber site comes last of all: a save names places by position, so anything new goes on the end.
  for (const b of world.buildings) if (b.site) buildings.push(row(b));
  return { id: world.id, nodes, edges, buildings, timber: world.timber ?? null, hydrants: world.hydrants ?? [] };
}
