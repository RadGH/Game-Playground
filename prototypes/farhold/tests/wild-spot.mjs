// Shared by the browser specs that need the enemy spawn ring to be busy.
//
// A run starts beside (or inside) a town, and nothing hostile spawns inside a settlement's watch
// (`EnemyField.wild`) or on water — on seed 7 the start sits 41 m into a 153 m town ring and
// only 13 of 108 points on the spawn ring were dry wild ground. A spec about the spawner must walk
// out to somewhere the spawner is allowed to work first. That is what this does, and it is the
// RULE those specs care about: in the wild, the ring fills.
//
// Pass to `page.evaluate(goWild)`; it returns { x, z, share } — share is the fraction of the
// spawn ring that is dry wild ground at the chosen spot.

export async function goWild(minShare = 0.8) {
  const f = window.farhold;
  const F = f.field;
  const lo = F.cfg?.minRadius ?? 34, hi = F.cfg?.radius ?? 115;
  const share = (x, z) => {
    let ok = 0, n = 0;
    for (let a = 0; a < 24; a++) for (const d of [lo + 6, (lo + hi) / 2, hi - 6]) {
      n++;
      const px = x + Math.cos(a / 24 * Math.PI * 2) * d, pz = z + Math.sin(a / 24 * Math.PI * 2) * d;
      if (!f.terrain.underwater(px, pz) && F.wild(px, pz)) ok++;
    }
    return ok / n;
  };
  const x0 = f.control.x, z0 = f.control.z;
  let best = { x: x0, z: z0, share: share(x0, z0) };
  for (let r = 300; r <= 3000 && best.share < minShare; r += 150) {
    for (let a = 0; a < 16; a++) {
      const [x, z] = f.terrain.clampToWorld(x0 + Math.cos(a / 16 * Math.PI * 2) * r, z0 + Math.sin(a / 16 * Math.PI * 2) * r);
      const s = share(x, z);
      if (s > best.share) best = { x, z, share: s };
    }
  }
  f.teleport(best.x, best.z);
  await new Promise(r => setTimeout(r, 300));
  F.clear();
  return best;
}
