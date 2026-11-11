// Zones (ruling 15): hand-made, stored as a readable JSON file of SHAPES — not a pixel map — so Claude, the in-browser
// editor (M11) and the checker all read and write the same thing. Pure: no three.js here; the sim and the checker use
// it, and the client draws from the same samplers (js/client/zone-view.js), so what you see is what you collide with.
//
// data/zones/<id>.json:
//   { id, name, levels: [lo, hi], table: '<bestiary spawn table>', theme, bounds: [x0, z0, x1, z1], base: 'grass',
//     surfaces: [{ s: 'dirt', path: [[x,z]...], width } | { s, poly: [[x,z]...] } | { s, circle: [x, z, r] }],   later ones paint over earlier
//     heights:  [{ hill: [x, z, r, h] } | { ridge: [[x,z]...], width, h }],                                        visual only (the sim is flat)
//     water:    [{ poly: [[x,z]...] }],                                                                            not walkable
//     cliffs:   [{ path: [[x,z]...], h }],                                                                         a wall along the path
//     props:    [{ k: '<kit id>', x, z, yaw?, s? }],
//     scatter:  [{ k, poly | circle, n, seed?, minGap?, s?: [lo, hi] }],                                           seeded, so always the same
//     spawns:   [{ x, z, tag?: pack|patrol|swarm, level?, table?, route?: [[x,z]...], pack?: [ids] }],
//     chests:   [{ x, z, tier, level? }],
//     markers:  [{ kind: start|waypoint|exit|entrance|portal|npc|quest|stash|vendor, id?, x, z, to?, label? }] }
import { makeRng, hashStr } from '../sim/rng.js';
import { PROP_KIT } from './props.js';

export const SURFACES = {
  grass: '#79bf4f', grass2: '#62a83f', meadow: '#8fcf5a', dirt: '#c79a63', path: '#d4ad74', sand: '#e8d29a', wetsand: '#c9b07a', rock: '#9a958c', stone: '#b4ada0',
  flowers: '#8fae4e', mud: '#7a5a3a', forest: '#4f8a34', moss: '#5f9a3a', snow: '#eef4f8', cobble: '#a49a8a', ash: '#6a6460', farmland: '#9a6a3a', reeds: '#8aa04a',
};

const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
export function distToPath(x, z, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, Math.hypot(px, pz));
  }
  return best;
}
/** Is (x, z) inside a shape? `soft` returns 0..1 (1 deep inside, fading over `feather` metres at the edge). */
export function inShape(sh, x, z, feather = 0) {
  if (sh.circle) { const d = Math.hypot(x - sh.circle[0], z - sh.circle[1]); return feather ? Math.max(0, Math.min(1, (sh.circle[2] - d) / feather + 0.5)) : d <= sh.circle[2] ? 1 : 0; }
  if (sh.path) { const d = distToPath(x, z, sh.path), hw = (sh.width || 3) / 2; return feather ? Math.max(0, Math.min(1, (hw - d) / feather + 0.5)) : d <= hw ? 1 : 0; }
  if (sh.poly) return inPoly(x, z, sh.poly) ? 1 : 0;
  return 0;
}
/** Surface at a point: the base, painted over by every surface shape in order. */
export function surfaceAt(zone, x, z) { let s = zone.base || 'grass'; for (const sh of zone.surfaces || []) if (inShape(sh, x, z)) s = sh.s; return s; }
/** Ground height (visual; metres). */
export function heightAt(zone, x, z) {
  let h = 0;
  for (const e of zone.heights || []) {
    if (e.hill) { const [cx, cz, r, hh] = e.hill, d = Math.hypot(x - cx, z - cz); if (d < r) h += hh * (0.5 + 0.5 * Math.cos(Math.PI * d / r)); }
    else if (e.ridge) { const d = distToPath(x, z, e.ridge), r = (e.width || 8) / 2; if (d < r) h += (e.h || 2) * (0.5 + 0.5 * Math.cos(Math.PI * d / r)); }
  }
  for (const w of zone.water || []) if (inPoly(x, z, w.poly)) h -= 0.6;
  return h;
}
export const isWater = (zone, x, z) => (zone.water || []).some(w => inPoly(x, z, w.poly));

/** Seeded scatter: n props of kind k inside a shape, at least minGap apart, never on a path surface. */
export function scatterProps(zone) {
  const out = [];
  const keepClear = [...(zone.spawns || []).map(s => [s.x, s.z, 3.5]), ...(zone.chests || []).map(c => [c.x, c.z, 2.2]), ...(zone.markers || []).map(m => [m.x, m.z, 4]), ...(zone.props || []).map(p => [p.x, p.z, 1.6])];
  for (const sc of zone.scatter || []) {
    const rng = makeRng(sc.seed ?? hashStr(zone.id + ':' + (sc.k || '') + ':' + JSON.stringify(sc.poly || sc.circle || sc.path).slice(0, 40)));
    const box = sc.circle ? [sc.circle[0] - sc.circle[2], sc.circle[1] - sc.circle[2], sc.circle[0] + sc.circle[2], sc.circle[1] + sc.circle[2]] : bbox(sc.poly || sc.path, sc.width || 0);
    const kinds = Array.isArray(sc.k) ? sc.k : [sc.k], gap = sc.minGap ?? 2.2, [s0, s1] = sc.s || [0.8, 1.3];
    let tries = 0;
    for (let n = 0; n < sc.n && tries < sc.n * 30; tries++) {
      const x = box[0] + rng() * (box[2] - box[0]), z = box[1] + rng() * (box[3] - box[1]);
      if (!inShape(sc, x, z) || isWater(zone, x, z)) continue;
      const surf = surfaceAt(zone, x, z); if (surf === 'path' || surf === 'cobble') continue;
      if (out.some(p => Math.hypot(p.x - x, p.z - z) < gap)) continue;
      if (keepClear.some(k => Math.hypot(k[0] - x, k[1] - z) < k[2])) continue;          // spawns, chests, markers stay open
      out.push({ k: kinds[Math.floor(rng() * kinds.length)], x: +x.toFixed(2), z: +z.toFixed(2), yaw: +(rng() * 6.283).toFixed(2), s: +(s0 + rng() * (s1 - s0)).toFixed(2) });
      n++;
    }
  }
  return out;
}
const bbox = (pts, pad = 0) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of pts) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return [a - pad, b - pad, c + pad, d + pad]; };

/** Zone JSON -> the area the sim runs (blockers, spawns, chests, markers) + everything the renderer needs. */
export function buildArea(zone) {
  const [x0, z0, x1, z1] = zone.bounds || [-60, -60, 60, 60];
  const props = [...(zone.props || []).map(p => ({ k: p.k, x: p.x, z: p.z, yaw: p.yaw || 0, s: p.s || 1 })), ...scatterProps(zone)];
  const blockers = [];
  for (const p of props) { const kit = PROP_KIT[p.k]; if (kit?.r) blockers.push({ x: p.x, z: p.z, r: kit.r * p.s, kind: p.k }); }
  for (const c of zone.cliffs || []) chain(c.path, 0.9, blockers, 'cliff');
  for (const w of zone.water || []) chain([...w.poly, w.poly[0]], 0.8, blockers, 'water');
  for (const c of zone.chests || []) blockers.push({ x: c.x, z: c.z, r: 0.5, kind: 'chest' });
  const start = (zone.markers || []).find(m => m.kind === 'start') || (zone.markers || []).find(m => m.kind === 'waypoint') || { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  return {
    id: zone.id, name: zone.name, level: (zone.levels || [1])[0], levels: zone.levels || [1, 1], table: zone.table || zone.id, theme: zone.theme || 'meadow',
    bounds: { x0, z0, x1, z1 }, spawn: { x: start.x, z: start.z },
    blockers, props, zone,
    spawns: (zone.spawns || []).map(s => ({ ...s, level: s.level ?? Math.round(((zone.levels || [1, 1])[0] + (zone.levels || [1, 1])[1]) / 2), route: s.route?.map(([x, z]) => ({ x, z })) })),
    chests: zone.chests || [], markers: zone.markers || [],
  };
}
/** Line of circles along a path (cliffs, shorelines) so the circle-only collider handles them. */
function chain(path, r, out, kind) {
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (r * 1.2)));
    for (let k = 0; k <= n; k++) out.push({ x: ax + (bx - ax) * k / n, z: az + (bz - az) * k / n, r, kind });
  }
}
