export function generateDungeon(seed, floor = 1) {
  let state = (seed >>> 0) || 1;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const rooms = [];
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
    rooms.push({ id: `${x},${z}`, x: (x - 1) * 13, z: (z - 1) * 13, width: 9 + Math.floor(random() * 3), depth: 9 + Math.floor(random() * 3), monsters: 1 + Math.floor(random() * 2) });
  }
  // Keep every room reachable by linking each to an earlier neighboring room.
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
    const room = rooms.find(r => r.id === `${x},${z}`); if (!room || (!x && !z)) continue;
    const candidates = [[x - 1, z], [x, z - 1]].map(([a,b]) => rooms.find(r => r.id === `${a},${b}`)).filter(Boolean);
    if (candidates.length) room.parent = candidates[Math.floor(random() * candidates.length)].id;
  }
  const links = rooms.filter(r => r.parent).map(r => [r.id, r.parent]);
  const start = rooms.find(r => r.id === '1,1') || rooms[0];
  const far = rooms.reduce((best, r) => Math.hypot(r.x-start.x,r.z-start.z) > Math.hypot(best.x-start.x,best.z-start.z) ? r : best, start);
  return { seed, floor, rooms, links, start: start.id, stairs: far.id };
}
