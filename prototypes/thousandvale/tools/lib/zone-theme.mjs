// Thousandvale — terrain that matches a zone's THEME (stream B). Lead ruling 2026-10-04: where stream E's province
// sheet gives a zone a watery archetype the World Forge ground does not have (a marsh on dry grassland, a coast with no
// sea, a lakeland on mountains), the BAKE adds the water instead of E renaming the theme.
//
// Themes live in data/world/zone-themes.json ({ "<world zone>": { theme, name, ... } }):
//   mere  — one lake (r ≈ 150 m) and a smaller second one: Coldwater, lakeland on mountains
//   shore — one big lake (r ≈ 320 m) with a sand beach band, its edge ~50 m from the hub town: Saltmouth, coast
//   marsh — a fen: a field of shallow wadeable pools (≤ 0.9 m) round one deeper mere, painted marsh: Brackwater
//
// Edge rule (PLAN §3.2.3): everything here stays ≥ (reach + 120 m) inside the zone, so the shared edge samples are
// untouched and the neighbours still agree bit for bit. Water is placed off every settlement circle and road
// corridor; heights and the location are a pure function of the zone (seeded from its id), so a re-bake is identical.
import { hashStr, smoothstep, makeNoise2D, fbm } from '../../../../worldgen/js/noise.js';

const EDGE = 120;

function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Carve the theme's water into the apron grid. ctx: { id, theme, G, STEP, ZM, ground, waterTop, waterKind, settlements,
 * roads, polyDist, hub }. Returns { lakes: [{name, x, z, r, level, kind}], fen: {x, z, r} | null, beach: [{x, z, r}] }.
 */
export function carveTheme(ctx) {
  const { id, theme, G, STEP, ZM, ground, waterTop, waterKind } = ctx, AP = ctx.AP ?? 1;   // AP = apron samples
  const R = rng(hashStr('theme:' + id));
  const noise = makeNoise2D(hashStr('theme-shape:' + id));
  const at = (x, z) => ground[(Math.round(z / STEP) + AP) * G + Math.round(x / STEP) + AP];
  const out = { lakes: [], fen: null, beach: [] };
  const roadNear = (x, z, d) => ctx.roads.some(r => ctx.polyDist(r.pts, x, z)[0] < d);
  const clearOf = (x, z, r, extra) => ctx.settlements.every(s => Math.hypot(s.x - x, s.z - z) > s.radius + r + extra)
    && out.lakes.every(l => Math.hypot(l.x - x, l.z - z) > l.r + r + 40);
  const roadClear = (x, z, r) => !roadNear(x, z, r + 20) && [0, 1, 2, 3, 4, 5, 6, 7].every(k => !roadNear(x + Math.cos(k * 0.785) * r * 0.8, z + Math.sin(k * 0.785) * r * 0.8, 14));

  /** Pick a lake centre: inside the edge margin, off towns and roads; `want(x, z)` scores (lower is better). */
  function pick(r, want, extraTown = 40) {
    const reach = r * 1.3 + 50, m = reach + EDGE;
    let best = null, bestS = Infinity;
    for (let z = m; z <= ZM - m; z += 32) for (let x = m; x <= ZM - m; x += 32) {
      if (!clearOf(x, z, r * 1.3 + 50, extraTown) || !roadClear(x, z, r * 1.3 + 10)) continue;
      const s = want(x, z) + R() * 0.01;
      if (s < bestS) { bestS = s; best = { x, z }; }
    }
    return best;
  }
  /** The lake outline radius at angle a: a few slow lobes with seeded phases (smooth, never star-shaped). */
  const radiusAt = (l, a) => shoreRadius(l, a);
  /** Ring heights of a candidate (for choosing a valley: a small rim spread holds water without a dam). */
  const rimSpread = (x, z, r) => { let lo = Infinity, hi = -Infinity; for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, h = at(x + Math.cos(a) * r, z + Math.sin(a) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };

  function carve(l, depth, bank = 40) {
    l.ph = [R() * 6.283, R() * 6.283, R() * 6.283, R() * 6.283];
    // level = the lowest point of the outline, a little under it, so the shore is everywhere at or above the water
    let lo = Infinity;
    for (let k = 0; k < 96; k++) { const a = k / 96 * 6.283, rr = radiusAt(l, a); lo = Math.min(lo, at(l.x + Math.cos(a) * rr, l.z + Math.sin(a) * rr)); }
    l.level = +(lo - 0.3).toFixed(2);
    const reach = l.r * 1.3 + bank;
    const i0 = Math.max(AP, Math.floor((l.x - reach) / STEP) + AP), i1 = Math.min(G - 1 - AP, Math.ceil((l.x + reach) / STEP) + AP);
    const j0 = Math.max(AP, Math.floor((l.z - reach) / STEP) + AP), j1 = Math.min(G - 1 - AP, Math.ceil((l.z + reach) / STEP) + AP);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i - AP) * STEP, z = (j - AP) * STEP, dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz);
      const rr = radiusAt(l, Math.atan2(dz, dx)), k = j * G + i;
      if (d <= rr) {
        const f = smoothstep(0, 1, 1 - d / rr);                       // 0 at the shore, 1 in the middle
        ground[k] = Math.min(ground[k], l.level - 0.35 - depth * f);
        waterTop[k] = l.level; waterKind[k] = 2;
      } else if (d <= rr + bank) {
        // ease the bank down toward a lip just above the water (no wall where the lake cut into a slope)
        const t = smoothstep(0, 1, (d - rr) / bank), lip = l.level + 0.3;
        if (ground[k] > lip) ground[k] = lip + (ground[k] - lip) * (0.25 + 0.75 * t);
      }
    }
    out.lakes.push({ name: l.name, kind: l.kind, x: Math.round(l.x), z: Math.round(l.z), r: l.r, level: l.level, ph: l.ph.map(v => +v.toFixed(3)), shape: { x: l.x, z: l.z } });
  }

  const hub = ctx.hub;
  const nearHub = gap => (x, z, r) => (hub ? Math.abs(Math.hypot(x - hub.x, z - hub.z) - hub.radius - r * 1.15 - gap) / 50 : 0);
  if (theme.theme === 'mere') {
    const r = theme.r || 150;
    const c = pick(r, (x, z) => rimSpread(x, z, r * 1.1) / 20 + nearHub(160)(x, z, r));
    if (c) carve({ ...c, r, name: theme.name || 'the Mere', kind: 'mere' }, theme.depth || 7);
    const r2 = theme.r2 || 70;
    const c2 = pick(r2, (x, z) => rimSpread(x, z, r2 * 1.1) / 20);
    if (c2) carve({ ...c2, r: r2, name: theme.name2 || 'the Little Mere', kind: 'mere' }, 4);
  } else if (theme.theme === 'shore') {
    const r = theme.r || 320;
    const c = pick(r, (x, z) => nearHub(50)(x, z, r) + rimSpread(x, z, r) / 60, 10);
    if (c) {
      carve({ ...c, r, name: theme.name || 'the Salt Mere', kind: 'shore' }, theme.depth || 9, 60);
      out.beach.push({ lake: out.lakes[out.lakes.length - 1], band: theme.beach || 26 });
    }
  } else if (theme.theme === 'marsh') {
    // the fen: centred off the towns, with one deeper mere and a field of shallow pools round it
    const fr = theme.fen || 420;
    const c = pick(90, (x, z) => nearHub(220)(x, z, 90) + rimSpread(x, z, 200) / 15);
    if (c) {
      carve({ ...c, r: 90, name: theme.name || 'the Black Mere', kind: 'mere' }, 3);
      out.fen = { x: c.x, z: c.z, r: fr };
      const pools = theme.pools || 14;
      for (let n = 0, tries = 0; n < pools && tries < 400; tries++) {
        const a = R() * 6.283, d = 130 + R() * (fr - 150), pr = 16 + R() * 30;
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        const reach = pr * 1.3 + 30;
        if (x < reach + EDGE || z < reach + EDGE || x > ZM - reach - EDGE || z > ZM - reach - EDGE) continue;
        if (!clearOf(x, z, pr * 1.3 + 30, 30) || !roadClear(x, z, pr * 1.3 + 6)) continue;
        carve({ x, z, r: Math.round(pr), name: null, kind: 'pool' }, 0.5, 18);   // ≤ 0.85 m deep: wade, never swim
        n++;
      }
    }
  }
  return out;
}

/** The outline radius of a carved lake at angle a (also used by the bake to paint the beach band). */
export function shoreRadius(l, a) {
  const p = l.ph || [0, 0, 0, 0];
  return l.r * (1 + 0.13 * Math.sin(2 * a + p[0]) + 0.09 * Math.sin(3 * a + p[1]) + 0.05 * Math.sin(5 * a + p[2]) + 0.03 * Math.sin(7 * a + p[3]));
}
/** Metres outside the lake's shoreline (negative = in the water). */
export function shoreDistance(l, x, z) {
  const cx = l.shape?.x ?? l.x, cz = l.shape?.z ?? l.z;
  return Math.hypot(x - cx, z - cz) - shoreRadius(l, Math.atan2(z - cz, x - cx));
}

/** Is (x, z) in the painted fen (a noise-ragged disc)? */
export function inFen(fen, x, z, noise) {
  if (!fen) return false;
  const d = Math.hypot(x - fen.x, z - fen.z) / fen.r;
  return d < 1 && d < 0.75 + (fbm(noise, x / 90, z / 90, { octaves: 2 }) - 0.5) * 0.7;
}

/**
 * A cliff beside a road (stream E's hooks, e.g. the_long_stair in Hollin Pass). The face rises on one side of the road
 * between two x positions: flat ground for `offset` m from the road centre, then `height` m (lo..hi, highest mid-way)
 * over a 2.5 m run (≈ 80°, past MAX_WALK_SLOPE — nav marks it STEEP), then a plateau easing down over `back` m. Any
 * `keep` disc (E's hook) is left as an alcove at the foot. The ends taper over 15 m, and nothing within 6 m of a zone
 * edge is touched (neighbour edges stay bit-exact). spec: { road, x: [x0, x1], side: 'north'|'south', offset, height: [lo, hi],
 * back, keep: [{x, z, r}] }. Returns { x0, x1, road, height } for meta.
 */
export function cutCliff(ctx, spec) {
  const { G, STEP, ZM, ground } = ctx, AP = ctx.AP ?? 1;
  const road = ctx.roads.find(r => r.id === spec.road);
  if (!road) throw new Error('cliff: no road ' + spec.road);
  const [x0, x1] = spec.x, [lo, hi] = spec.height, off = spec.offset ?? 8, back = spec.back ?? 80, run = 2.5;
  const north = (spec.side || 'north') === 'north';
  const keep = spec.keep || [];
  const reach = off + run + back;
  let zMin = Infinity, zMax = -Infinity;
  for (const p of road.pts) if (p[0] >= x0 - 20 && p[0] <= x1 + 20) { zMin = Math.min(zMin, p[1]); zMax = Math.max(zMax, p[1]); }
  const i0 = Math.max(AP, Math.floor((x0 - 20) / STEP) + AP), i1 = Math.min(G - 1 - AP, Math.ceil((x1 + 20) / STEP) + AP);
  const j0 = Math.max(AP, Math.floor((zMin - reach) / STEP) + AP), j1 = Math.min(G - 1 - AP, Math.ceil((zMax + reach) / STEP) + AP);
  const edge = (x, z) => smoothstep(0, 1, Math.min(x, z, ZM - x, ZM - z) / 6 - 1);   // 0 within 6 m of an edge, 1 beyond 12 m
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = (i - AP) * STEP, z = (j - AP) * STEP;
    const [d, k, t] = ctx.polyDist(road.pts, x, z);
    if (d > reach) continue;
    const a = road.pts[k], b = road.pts[k + 1], cx = a[0] + (b[0] - a[0]) * t, cz = a[1] + (b[1] - a[1]) * t;
    if ((z < cz) !== north) continue;                                // the cliff side only
    if (cx < x0 || cx > x1) continue;
    const u = (cx - x0) / (x1 - x0);
    const H = (lo + (hi - lo) * Math.sin(Math.PI * u)) * smoothstep(0, 1, Math.min(u, 1 - u) * (x1 - x0) / 15);
    // metres past the foot: past the road offset AND past every kept disc (so a hook disc becomes an alcove in the face)
    let e = d - off;
    for (const q of keep) e = Math.min(e, Math.hypot(x - q.x, z - q.z) - q.r - 2);
    if (e <= 0) continue;
    const rise = smoothstep(0, 1, e / run), fall = 1 - 0.65 * smoothstep(0, 1, (d - off - run) / back);
    ground[j * G + i] += H * rise * fall * edge(x, z);
  }
  return { road: spec.road, x: [x0, x1], height: [lo, hi], side: spec.side || 'north', offset: off };
}
