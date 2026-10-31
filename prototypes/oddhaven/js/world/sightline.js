// Is a building in the way? Pure. A straight line from the person to the camera: if it enters a building's footprint below the roof, the building has to come down until the line clears it.
//   occludeK(b, target {x,y,z}, cam {x,y,z}, heightScale)  -> 0 keep it, up to MAX_DOWN how far it must sink (0..1 of its height)
export const MAX_DOWN = 0.9;
const CLEAR = 0.6;     // a little air over the sight line

export function occludeK(b, t, cam, scale = 1) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw), hx = b.w / 2 + 0.2, hz = b.d / 2 + 0.2;
  const toL = (x, z) => ({ x: (x - b.x) * c - (z - b.z) * s, z: (x - b.x) * s + (z - b.z) * c });
  const a = toL(t.x, t.z), e = toL(cam.x, cam.z), dx = e.x - a.x, dz = e.z - a.z;
  let t0 = 0, t1 = 1;
  for (const [p, d, h] of [[a.x, dx, hx], [a.z, dz, hz]]) {
    if (Math.abs(d) < 1e-6) { if (Math.abs(p) > h) return 0; continue; }
    const u = (-h - p) / d, v = (h - p) / d, lo = Math.min(u, v), hi = Math.max(u, v);
    t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
    if (t0 > t1) return 0;
  }
  // the lowest the sight line is over the footprint, as high as the person's head
  const y = (t.y ?? 0) + 1.4 + t0 * (cam.y - (t.y ?? 0) - 1.4), tall = (b.roof === 'gable' ? b.h + Math.min(b.w, b.d) * 0.42 : b.h + 1.2) * scale, roofY = b.y + tall, need = y - CLEAR - b.y;
  if (y - CLEAR >= roofY) return 0;
  return Math.max(0, Math.min(MAX_DOWN, 1 - Math.max(need, 0.6) / tall));
}
