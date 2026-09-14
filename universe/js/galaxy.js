// Galaxy layout: where the stars are, what they are, and which ones you can fly between.
//
//   import { generateGalaxy, GALAXY_DEFAULTS, LAYOUTS } from './galaxy.js';
//   const galaxy = generateGalaxy({ seed: 7, stars: 300, layout: 'spiral', arms: 4 });
//   galaxy.stars[0]   // a full star record from stars.js, plus x/y (−1 … 1) and neighbours[]
//   galaxy.lanes      // [{ a, b, dist }] — the travel graph, always fully connected
//
// Pure data: no DOM, no fetch. Same seed + same knobs = the same galaxy, always.

import { makeRng, subSeed, clamp } from '../../worldgen/js/noise.js';
import { makeStar, starName } from './stars.js';

export const LAYOUTS = ['spiral', 'elliptical', 'cluster', 'ring', 'scattered'];

export const GALAXY_DEFAULTS = {
  seed: 1,
  stars: 220,              // how many systems
  layout: 'spiral',        // spiral | elliptical | cluster | ring | scattered
  arms: 4,                 // spiral only — 2 is the classic, 6 is a pinwheel
  twist: 1.0,              // 0 (straight spokes) … 2.5 (tightly wound)
  spread: 0.32,            // how far a star can wander off its arm / shell
  coreDensity: 0.45,       // how much the middle crowds up
  clusters: 6,             // cluster layout only
  mix: { hot: 1, cool: 1, dying: 1, exotic: 1 },   // class weight multipliers (see MIX_GROUPS)
  lanes: 3,                // how many neighbours each star tries to link to
  laneRange: 0.22,         // longest link allowed before the connector has to force one
  namegen: null,           // a Name Forge instance; without it the built-in star namer is used
  nameRace: null,          // which Name Forge language names the stars (null = one picked per star)
};

// ---------------------------------------------------------------------------- layouts
// Each one returns { x, y, z } in a box roughly −1 … 1. z is the thickness of the disc: the 2D map
// ignores it, but a 3D galaxy view (or a travel-time model) can use it.

function spiralPoint(rng, o) {
  const arms = Math.max(1, Math.round(o.arms));
  const arm = rng.int(0, arms - 1);
  // bias toward the middle so the core is crowded; sqrt would be flat, higher powers pile up
  const t = Math.pow(rng(), 0.55 + o.coreDensity * 0.9);
  const r = 0.08 + t * 0.92;
  const angle = (arm / arms) * Math.PI * 2 + t * o.twist * Math.PI * 2.2;
  const wander = o.spread * (0.25 + t) * 0.8;
  const off = (rng() + rng() + rng() - 1.5) * wander;          // roughly bell-shaped
  const offA = (rng() + rng() + rng() - 1.5) * wander * 0.9;
  return { x: Math.cos(angle + offA) * r + off * 0.4, y: Math.sin(angle + offA) * r * 0.92 + off * 0.4, z: (rng() - 0.5) * 0.12 * (1.2 - t) };
}

function ellipticalPoint(rng, o) {
  const t = Math.pow(rng(), 0.4 + o.coreDensity);
  const a = rng() * Math.PI * 2;
  const r = t;
  const squash = 0.55 + o.spread;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * squash, z: (rng() - 0.5) * 0.4 * (1 - t) };
}

function clusterPoint(rng, o, centres) {
  const c = centres[rng.int(0, centres.length - 1)];
  const a = rng() * Math.PI * 2;
  const r = Math.pow(rng(), 0.6) * c.r;
  return { x: clamp(c.x + Math.cos(a) * r, -1, 1), y: clamp(c.y + Math.sin(a) * r, -1, 1), z: (rng() - 0.5) * 0.1 };
}

function ringPoint(rng, o) {
  const a = rng() * Math.PI * 2;
  const band = 0.62 + (rng() + rng() - 1) * (0.1 + o.spread * 0.35);
  const gapCore = rng() < o.coreDensity * 0.25;                 // a few stragglers in the middle
  const r = gapCore ? rng() * 0.2 : clamp(band, 0.12, 1);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: (rng() - 0.5) * 0.1 };
}

function scatteredPoint(rng) {
  return { x: rng.range(-1, 1) * 0.98, y: rng.range(-1, 1) * 0.98, z: (rng() - 0.5) * 0.5 };
}

// ---------------------------------------------------------------------------- travel lanes

/** k-nearest links, then anything still cut off is joined to the nearest star in the main group. */
function buildLanes(stars, o) {
  const k = Math.max(1, Math.round(o.lanes));
  const keyOf = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  const seen = new Set();
  const lanes = [];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  for (const s of stars) {
    const near = stars
      .filter(t => t !== s)
      .map(t => ({ t, d: dist(s, t) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    for (const n of near) {
      if (n.d > o.laneRange) continue;
      const key = keyOf(s.id, n.t.id);
      if (seen.has(key)) continue;
      seen.add(key);
      lanes.push({ a: s.id, b: n.t.id, dist: +n.d.toFixed(4) });
    }
  }

  // union-find over what we have, then bridge the leftovers so every star is reachable
  const parent = stars.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) { parent[ra] = rb; return true; } return false; };
  for (const l of lanes) union(l.a, l.b);

  let guard = 0;
  while (guard++ < stars.length) {
    const groups = new Map();
    for (const s of stars) { const r = find(s.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); }
    if (groups.size <= 1) break;
    const list = [...groups.values()].sort((a, b) => b.length - a.length);
    const main = list[0];
    for (const other of list.slice(1)) {
      let best = null;
      for (const s of other) for (const t of main) {
        const d = dist(s, t);
        if (!best || d < best.d) best = { s, t, d };
      }
      if (!best) continue;
      const key = keyOf(best.s.id, best.t.id);
      if (!seen.has(key)) { seen.add(key); lanes.push({ a: best.s.id, b: best.t.id, dist: +best.d.toFixed(4), bridge: true }); }
      union(best.s.id, best.t.id);
    }
  }

  for (const s of stars) s.neighbours = [];
  for (const l of lanes) { stars[l.a].neighbours.push(l.b); stars[l.b].neighbours.push(l.a); }
  return lanes;
}

// ---------------------------------------------------------------------------- the generator

/**
 * Build a galaxy. Knobs are GALAXY_DEFAULTS above; anything you leave out keeps its default.
 * Returns { seed, opts, layout, stars, lanes, stats }.
 */
export function generateGalaxy(userOpts = {}) {
  const o = { ...GALAXY_DEFAULTS, ...userOpts, mix: { ...GALAXY_DEFAULTS.mix, ...(userOpts.mix || {}) } };
  o.stars = Math.max(4, Math.min(4000, Math.round(o.stars)));
  const rng = makeRng(subSeed(o.seed, 'galaxy'));

  const centres = [];
  if (o.layout === 'cluster') {
    const n = Math.max(1, Math.round(o.clusters));
    for (let i = 0; i < n; i++) centres.push({ x: rng.range(-0.72, 0.72), y: rng.range(-0.72, 0.72), r: rng.range(0.12, 0.16 + o.spread * 0.5) });
  }

  const place = () => {
    switch (o.layout) {
      case 'elliptical': return ellipticalPoint(rng, o);
      case 'cluster': return clusterPoint(rng, o, centres);
      case 'ring': return ringPoint(rng, o);
      case 'scattered': return scatteredPoint(rng);
      default: return spiralPoint(rng, o);
    }
  };

  const stars = [];
  const taken = new Set();
  const gridKey = (x, y) => `${Math.round(x * 90)},${Math.round(y * 90)}`;   // keeps dots from stacking
  for (let i = 0; i < o.stars; i++) {
    let p = place(), tries = 0;
    while (taken.has(gridKey(p.x, p.y)) && tries++ < 8) p = place();
    taken.add(gridKey(p.x, p.y));
    const seed = subSeed(o.seed, 'star' + i);
    const star = makeStar({ seed, id: i, namegen: o.namegen, nameRace: o.nameRace, mix: o.mix, x: +clamp(p.x, -1, 1).toFixed(4), y: +clamp(p.y, -1, 1).toFixed(4) });
    star.z = +p.z.toFixed(4);
    star.distFromCore = +Math.hypot(star.x, star.y).toFixed(4);
    stars.push(star);
  }

  const lanes = buildLanes(stars, o);

  const byClass = {};
  for (const s of stars) byClass[s.classKey] = (byClass[s.classKey] || 0) + 1;

  return {
    schema: 1, kind: 'galaxy',
    seed: o.seed, layout: o.layout,
    name: galaxyName(o.seed, o.namegen, o.nameRace),
    opts: serialisableOpts(o),
    stars, lanes,
    stats: {
      stars: stars.length, lanes: lanes.length,
      byClass,
      exotic: stars.filter(s => s.exotic).length,
      avgNeighbours: +(stars.reduce((a, s) => a + s.neighbours.length, 0) / stars.length).toFixed(2),
      isolated: stars.filter(s => s.neighbours.length === 0).length,
    },
  };
}

function serialisableOpts(o) { const out = { ...o }; delete out.namegen; return out; }

const GALAXY_SHAPES = ['Spiral', 'Coil', 'Wheel', 'Veil', 'Drift', 'Expanse', 'Shoal', 'Crown'];
/** A name for the whole galaxy. */
export function galaxyName(seed, namegen = null, nameRace = null) {
  const rng = makeRng(subSeed(seed, 'galaxyname'));
  return `the ${starName(subSeed(seed, 'gname'), namegen, nameRace)} ${rng.pick(GALAXY_SHAPES)}`;
}

/** Star nearest to a point in map space (−1 … 1), with an optional filter. */
export function nearestStar(galaxy, x, y, filter = null) {
  let best = null, bd = Infinity;
  for (const s of galaxy.stars) {
    if (filter && !filter(s)) continue;
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { star: best, dist: Math.sqrt(bd) } : null;
}

/** Shortest lane route between two stars (Dijkstra over lane length). [] when there is no path. */
export function route(galaxy, fromId, toId) {
  const dist = new Map([[fromId, 0]]), prev = new Map();
  const laneLen = new Map();
  for (const l of galaxy.lanes) { laneLen.set(l.a + ':' + l.b, l.dist); laneLen.set(l.b + ':' + l.a, l.dist); }
  const queue = new Set(galaxy.stars.map(s => s.id));
  while (queue.size) {
    let cur = null, best = Infinity;
    for (const id of queue) { const d = dist.get(id) ?? Infinity; if (d < best) { best = d; cur = id; } }
    if (cur == null || best === Infinity) break;
    queue.delete(cur);
    if (cur === toId) break;
    for (const n of galaxy.stars[cur].neighbours) {
      if (!queue.has(n)) continue;
      const alt = best + (laneLen.get(cur + ':' + n) ?? 1);
      if (alt < (dist.get(n) ?? Infinity)) { dist.set(n, alt); prev.set(n, cur); }
    }
  }
  if (!dist.has(toId)) return [];
  const path = [toId];
  while (path[0] !== fromId) { const p = prev.get(path[0]); if (p == null) return []; path.unshift(p); }
  return path;
}

/** Knob sets that give a recognisable galaxy in one click. */
export const GALAXY_PRESETS = {
  'Quiet spiral': { layout: 'spiral', stars: 220, arms: 4, twist: 1.0, spread: 0.3, coreDensity: 0.45, mix: { hot: 0.5, cool: 1.4, dying: 0.6, exotic: 0.25 } },
  'Dense cluster': { layout: 'cluster', stars: 420, clusters: 5, spread: 0.5, coreDensity: 0.7, lanes: 4, mix: { hot: 1.2, cool: 1, dying: 0.8, exotic: 0.8 } },
  'Dying stars': { layout: 'elliptical', stars: 260, spread: 0.4, coreDensity: 0.8, mix: { hot: 0.15, cool: 0.6, dying: 4, exotic: 1.6 } },
  'Young ring': { layout: 'ring', stars: 300, spread: 0.35, coreDensity: 0.2, mix: { hot: 3, cool: 1, dying: 0.1, exotic: 0.3 } },
  'Exotic frontier': { layout: 'scattered', stars: 200, spread: 0.8, lanes: 2, laneRange: 0.3, mix: { hot: 1, cool: 0.8, dying: 1.4, exotic: 5 } },
};
