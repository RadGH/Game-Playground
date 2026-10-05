// One terrain for a whole province (stream A, PLAN §8.2: a province copy is ONE room over ~16 zones).
// Stitches stream B's per-zone bakes (zone-local metres 0..2048) into world metres (zone (zx, zy) covers
// x in [zx*2048, zx*2048 + 2048]), so walking between zones is seamless. Pure.
//
//   const t = createProvinceTerrain({ key, zones: [{ key, zx, zy, reader }] })
//   t.heightAt / t.walkable / t.bounds / t.spawn / t.reader (a composite reader: heightAt, normalAt, slopeAt,
//   waterAt, biomeAt, walkable, clamp, sample, meta.sites in world metres with `zone` set) / t.zones
// Points in no listed zone (sea, another province) are not walkable; their height is the nearest zone edge.

export const ZONE_METRES = 2048;

export function createProvinceTerrain({ key, zones, zoneMetres = ZONE_METRES, starter = null }) {
  const byCell = new Map(zones.map(z => [z.zx + ',' + z.zy, z]));
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const z of zones) {
    z.ox = z.zx * zoneMetres; z.oz = z.zy * zoneMetres;
    z.bounds = { minX: z.ox, minZ: z.oz, maxX: z.ox + zoneMetres, maxZ: z.oz + zoneMetres };
    minX = Math.min(minX, z.ox); minZ = Math.min(minZ, z.oz); maxX = Math.max(maxX, z.ox + zoneMetres); maxZ = Math.max(maxZ, z.oz + zoneMetres);
  }
  const bounds = { minX, minZ, maxX, maxZ };
  /** The zone holding (x, z), or the nearest one (for heights off the edge). */
  function zoneAt(x, z) {
    const zx = Math.floor(x / zoneMetres), zy = Math.floor(z / zoneMetres);
    return byCell.get(zx + ',' + zy) || null;
  }
  function nearest(x, z) {
    let best = null, bd = Infinity;
    for (const q of zones) {
      const cx = Math.max(q.ox, Math.min(q.ox + zoneMetres, x)), cz = Math.max(q.oz, Math.min(q.oz + zoneMetres, z));
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  const call = (name, fallback) => (x, z, ...a) => {
    const q = zoneAt(x, z) || nearest(x, z);
    return q.reader[name](x - q.ox, z - q.oz, ...a) ?? fallback;
  };
  const heightAt = call('heightAt', 0);
  const walkable = (x, z) => { const q = zoneAt(x, z); return !!q && q.reader.walkable(x - q.ox, z - q.oz); };
  const sites = [];
  for (const q of zones) for (const s of (q.reader.meta && q.reader.meta.sites) || []) sites.push({ ...s, x: s.x + q.ox, z: s.z + q.oz, zone: q.key });
  const hub = sites.find(s => s.type === 'settlement' && s.hub && s.zone === starter) || sites.find(s => s.type === 'settlement' && s.hub) || sites.find(s => s.type === 'settlement');
  const spawn = hub ? { x: hub.x, z: hub.z } : { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const first = zones[0].reader;
  const reader = {
    meta: { sites, spawn, province: key, biomes: first.meta && first.meta.biomes },
    biomes: first.biomes,
    bounds,
    heightAt,
    normalAt: call('normalAt', [0, 1, 0]),
    slopeAt: call('slopeAt', 0),
    waterAt: call('waterAt', { kind: 'none', surface: NaN, depth: 0 }),
    biomeAt: call('biomeAt', 0),
    sample: (x, z) => { const q = zoneAt(x, z) || nearest(x, z); const s = q.reader.sample(x - q.ox, z - q.oz); return { ...s, x, z, zone: q.key }; },
    walkable,
    inBounds: (x, z) => !!zoneAt(x, z),
    clamp: (x, z) => [Math.min(maxX, Math.max(minX, Number.isFinite(x) ? x : minX)), Math.min(maxZ, Math.max(minZ, Number.isFinite(z) ? z : minZ))],
    zoneAt: (x, z) => { const q = zoneAt(x, z); return q ? q.key : null; },
  };
  return {
    key: null, kind: 'province', province: key, reader, heightAt, walkable, bounds,
    size: Math.max(maxX - minX, maxZ - minZ), origin: { x: minX, z: minZ }, spawn,
    zones: zones.map(q => ({ key: q.key, zx: q.zx, zy: q.zy, bounds: q.bounds })),
  };
}
