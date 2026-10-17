export function moveWithWalls(position, dx, dz, walls, radius = 0.28) {
  let x = position.x + dx, z = position.z;
  for (const w of walls) if (Math.abs(z-w.z) < w.d/2+radius && Math.max(position.x,x)>=w.x-w.w/2-radius && Math.min(position.x,x)<=w.x+w.w/2+radius) x = position.x;
  z = position.z + dz;
  for (const w of walls) if (Math.abs(x-w.x) < w.w/2+radius && Math.max(position.z,z)>=w.z-w.d/2-radius && Math.min(position.z,z)<=w.z+w.d/2+radius) z = position.z;
  return { x, z };
}
export function nearestLiving(monsters, x, z) {
  return monsters.filter(m => !m.dead && !m.removed).sort((a,b) => Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0] || null;
}
