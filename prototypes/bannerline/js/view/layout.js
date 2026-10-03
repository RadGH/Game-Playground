// sim.map (docs/interfaces.md §6) -> the drawing layout js/view/terrain.js takes.
// Kept separate so terrain.js does not care how the sim names things.

export function layoutFromMap(map, buildings = []) {
  const fields = map.fields.map((f) => {
    const lanes = f.gates.map((g) => [
      { x: g.x, z: f.z0 - 4 },
      { x: g.x, z: f.z0 + (f.keep.z - f.z0) * 0.6 },
      { x: f.keep.x, z: f.keep.z - f.keep.d / 2 },
    ]);
    return {
      team: f.team, id: f.id,
      x0: f.x0, x1: f.x1,
      zGate: f.z0, zKeep: f.keep.z, zEnd: f.z1 + 4, dir: 1,
      gates: f.gates, keep: f.keep, armory: f.armory, spawn: f.spawn,
      lanes,
      ford: f.ford ? { z0: f.ford.z0, z1: f.ford.z1 } : null,
      walls: f.walls || [],
    };
  });
  const bounds = {
    x0: Math.min(...fields.map((f) => f.x0)), x1: Math.max(...fields.map((f) => f.x1)),
    z0: Math.min(...fields.map((f) => f.zGate)), z1: Math.max(...fields.map((f) => f.zEnd)),
  };
  return { fields, bounds, buildings };
}
