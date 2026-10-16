// WANDERING PACK ROUTES (owner 2026-10-16: "groups of mobs … would not stick to one place but would wander around").
// Pure: no DOM, no Node APIs. tools/content-packs.mjs runs it over a loaded province and writes the routes to
// data/provinces/<province>-pack-routes.json (Torbor: data/provinces/pack-routes.json); js/sim/packs.js walks them.
//
//   packRoutes({ key, zones, terrain, keepOut, roads, perZone, seed }) -> { routes: [route] }
//   route = { id, zone, kind, loop, pts: [[x, z], …], rests: [i, …], length, zones: [zone keys it passes through] }
//
// KINDS (what kind of ground a pack walks — the composition picks the kind it likes, js/sim/packs.js):
//   road    a stretch of a town-to-town road, at least ROAD_CLEAR metres from every town; walked there and back
//   shore   round the rim of a lake / along a bank (a loop round a centre out on the water)
//   valley  a loop round a low point (lower than the ground 140 m round it)
//   open    a loop anywhere else in the zone
//   cross   an open loop that may run into a neighbouring zone of a close level band ("between zones")
// Every point a route passes (every 5 m of every leg) is walkable, out of the water, and outside every KEEP-OUT circle:
// towns (r + 120 m), villages and hamlets (r + 60 m), quest givers (60 m), waystones (50 m), dungeon doors (45 m),
// zone-event arenas (r + 15 m). So a pack never walks through a town, past the respawn point or across a giver's yard.

export const ROUTE = Object.freeze({
  STEP: 5,                 // metres between the samples a leg is checked at
  GRID: 40,                // anchor grid
  LEG: [90, 230],          // a loop's legs
  RADIUS: [130, 260],      // a loop's size round its centre
  POINTS: [5, 7],          // waypoints a loop
  ROAD_MIN: 320, ROAD_MAX: 1000,
  TOWN_PAD: 120, VILLAGE_PAD: 60, GIVER_M: 60, WAYSTONE_M: 50, DOOR_M: 45, ARENA_PAD: 15,
  NAV_SLACK: 0.2,          // a leg may cross this share of nav-blocked samples (a tree: the planner steps round it)
  TRIES: 60,
});

/** A seeded rng (mulberry32 over a string hash): the same province + zone always gives the same routes. */
export function routeRng(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Keep-out circles from a built province layout (js/sim/realm.js buildLayout's L). */
export function keepOutOf(L) {
  const out = [];
  for (const t of L.towns || []) out.push({ x: t.x, z: t.z, r: (t.r || 60) + ROUTE.TOWN_PAD, why: 'town' });
  for (const s of (L.terrain && L.terrain.reader && L.terrain.reader.meta && L.terrain.reader.meta.sites) || []) {
    if (s.type === 'settlement' && !(L.towns || []).some(t => Math.hypot(t.x - s.x, t.z - s.z) < (t.r || 60))) out.push({ x: s.x, z: s.z, r: (s.radius || 40) + ROUTE.VILLAGE_PAD, why: 'village' });
    if (s.type === 'harbour') out.push({ x: s.x, z: s.z, r: 150, why: 'harbour' });
  }
  const npcs = [...(L.objects || []), ...((L.townObjects || []).flat())];
  for (const o of npcs) if (o && o.npc && ((o.npc.quests && o.npc.quests.length) || o.npc.quest)) out.push({ x: o.x, z: o.z, r: ROUTE.GIVER_M, why: 'giver' });
  for (const w of L.waystones || []) out.push({ x: w.x, z: w.z, r: ROUTE.WAYSTONE_M, why: 'waystone' });
  for (const d of L.doors || []) out.push({ x: d.x, z: d.z, r: ROUTE.DOOR_M, why: 'door' });
  for (const e of L.zoneEvents || []) out.push({ x: e.x, z: e.z, r: (e.r || 40) + ROUTE.ARENA_PAD, why: 'arena' });
  return out;
}

/** Circles bucketed by a 128 m grid: inside(x, z) -> the first circle holding the point, or null. */
export function circleIndex(circles, cell = 128) {
  const map = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  for (const c of circles) {
    for (let cx = Math.floor((c.x - c.r) / cell); cx <= Math.floor((c.x + c.r) / cell); cx++)
      for (let cz = Math.floor((c.z - c.r) / cell); cz <= Math.floor((c.z + c.r) / cell); cz++) { const k = key(cx, cz); (map.get(k) || map.set(k, []).get(k)).push(c); }
  }
  return {
    inside(x, z) {
      const b = map.get(key(Math.floor(x / cell), Math.floor(z / cell)));
      if (b) for (const c of b) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return c;
      return null;
    },
  };
}

const lenOf = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

/**
 * Every route of a province. `zones` = [{ key, bounds:{minX,minZ,maxX,maxZ}, band:[lo,hi] }], `terrain` = { walkable,
 * waterAt, heightAt, nav? }, `keepOut` = circles (keepOutOf), `roads` = [{ id, pts:[[x,z]…] }] (town-to-town roads).
 */
export function packRoutes({ key = 'p', zones = [], terrain, keepOut = [], roads = [], perZone = 6, mix = null, seed = 1 } = {}) {
  const R = ROUTE;
  const keep = circleIndex(keepOut);
  const zoneAt = (x, z) => zones.find(q => x >= q.bounds.minX && x < q.bounds.maxX && z >= q.bounds.minZ && z < q.bounds.maxZ) || null;
  const wet = (x, z) => { const w = terrain.waterAt ? terrain.waterAt(x, z) : null; return !!(w && w.depth > 0.25); };
  const navOk = (x, z) => !terrain.nav || !terrain.nav.passable || terrain.nav.passable(x, z);
  const dry = (x, z) => terrain.walkable(x, z) && !wet(x, z) && !keep.inside(x, z);
  /** A leg a pack can walk: every STEP metres dry, walkable, out of the keep-out circles and inside `allowed` zones. */
  function legOk(a, b, allowed) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / R.STEP));
    let blocked = 0;
    for (let i = 0; i <= n; i++) {
      const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
      const q = zoneAt(x, z);
      if (!q || !allowed.has(q.key) || !dry(x, z)) return false;
      if (!navOk(x, z)) blocked++;
    }
    return blocked <= n * R.NAV_SLACK;
  }
  const routes = [];
  // ---- anchors: a jittered grid of dry, open, walkable points per zone, each classed shore / valley / open
  const anchorCache = new Map();
  function anchorsOf(zone) {
    if (anchorCache.has(zone.key)) return anchorCache.get(zone.key);
    const rng = routeRng(key + ':anchors:' + zone.key + ':' + seed);
    const b = zone.bounds, pad = 30, anchors = [];
    for (let x = b.minX + pad; x < b.maxX - pad; x += R.GRID) for (let z = b.minZ + pad; z < b.maxZ - pad; z += R.GRID) {
      const ax = x + (rng() - 0.5) * R.GRID * 0.6, az = z + (rng() - 0.5) * R.GRID * 0.6;
      if (!dry(ax, az) || !navOk(ax, az)) continue;
      let shore = false, sum = 0, n = 0, wx = 0, wz = 0;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        if (wet(ax + c * 24, az + s * 24)) { shore = true; wx += c; wz += s; }
        const h = terrain.heightAt(ax + c * 140, az + s * 140); if (Number.isFinite(h)) { sum += h; n++; }
      }
      const h0 = terrain.heightAt(ax, az);
      const valley = n > 4 && Number.isFinite(h0) && h0 < sum / n - 6;
      anchors.push({ x: ax, z: az, kind: shore ? 'shore' : valley ? 'valley' : 'open', wx, wz });
    }
    anchorCache.set(zone.key, anchors);
    return anchors;
  }
  const bandMid = q => (Array.isArray(q.band) ? (q.band[0] + q.band[1]) / 2 : 1);
  for (const zone of zones) {
    const rng = routeRng(key + ':' + zone.key + ':' + seed);
    const b = zone.bounds, pad = 30;
    const neigh = zones.filter(q => q !== zone && Math.abs(bandMid(q) - bandMid(zone)) <= 2.5
      && q.bounds.minX <= b.maxX && q.bounds.maxX >= b.minX && q.bounds.minZ <= b.maxZ && q.bounds.maxZ >= b.minZ);
    const anchors = anchorsOf(zone);
    if (!anchors.length) continue;
    const crossAnchors = neigh.length ? [...anchors, ...neigh.flatMap(anchorsOf)] : anchors;
    const near = (x, z, r, kind, list = anchors) => {
      let best = null, bd = r * r;
      for (const p of list) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; const w = kind && p.kind === kind ? d * 0.5 : d; if (w < bd) { bd = w; best = p; } }
      return best;
    };
    const made = [];
    /** A loop round centre (cx, cz): N points snapped to anchors, every leg walkable. */
    function loopRound(cx, cz, kind, allowed) {
      const N = R.POINTS[0] + Math.floor(rng() * (R.POINTS[1] - R.POINTS[0] + 1));
      const rad = R.RADIUS[0] + rng() * (R.RADIUS[1] - R.RADIUS[0]), a0 = rng() * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < N; k++) {
        const a = a0 + k / N * Math.PI * 2, rr = rad * (0.8 + rng() * 0.4);
        const p = near(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 70, kind === 'shore' ? 'shore' : kind === 'valley' ? 'valley' : null, kind === 'cross' ? crossAnchors : anchors);
        if (!p) return null;
        const q = zoneAt(p.x, p.z);
        if (!q || !allowed.has(q.key)) return null;
        pts.push([Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]);
      }
      for (let k = 0; k < N; k++) {
        const a = pts[k], c = pts[(k + 1) % N], d = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (d < 40 || d > R.LEG[1] * 1.4 || !legOk(a, c, allowed)) return null;
      }
      return pts;
    }
    function farFromMade(x, z) { return made.every(r => r.pts.every(p => Math.hypot(p[0] - x, p[1] - z) > 160)); }
    const own = new Set([zone.key]);
    const wide = new Set([zone.key, ...neigh.map(q => q.key)]);
    function makeLoop(kind) {
      for (let t = 0; t < R.TRIES; t++) {
        let pool = anchors.filter(p => (kind === 'shore' ? p.kind === 'shore' : kind === 'valley' ? p.kind === 'valley' : true));
        if (!pool.length) return null;
        const s = pool[Math.floor(rng() * pool.length)];
        if (!farFromMade(s.x, s.z)) continue;
        let cx = s.x, cz = s.z;
        if (kind === 'shore') { const l = Math.hypot(s.wx, s.wz) || 1; const d = 150 + rng() * 80; cx = s.x + s.wx / l * d; cz = s.z + s.wz / l * d; }
        else if (kind === 'cross' && neigh.length) {
          // a centre near a border shared with a neighbour of a close band
          const q = neigh[Math.floor(rng() * neigh.length)];
          const bx = Math.max(b.minX, Math.min(b.maxX, (q.bounds.minX + q.bounds.maxX) / 2)), bz = Math.max(b.minZ, Math.min(b.maxZ, (q.bounds.minZ + q.bounds.maxZ) / 2));
          const p = near(bx + (rng() - 0.5) * 600, bz + (rng() - 0.5) * 600, 400, null);
          if (!p) continue;
          cx = p.x; cz = p.z;
        }
        const pts = loopRound(cx, cz, kind, kind === 'cross' ? wide : own);
        if (!pts) continue;
        const zs = [...new Set(pts.map(p => (zoneAt(p[0], p[1]) || {}).key).filter(Boolean))];
        if (kind === 'cross' && zs.length < 2) continue;
        return { kind, loop: true, pts };
      }
      return null;
    }
    function makeRoad() {
      // stretches of the roads that cross this zone, resampled every 8 m, cut where they are not clear
      const runs = [];
      for (const rd of roads) {
        const P = rd.pts || [];
        let cur = [];
        const flush = () => { if (cur.length > 1 && lenOf(cur) >= R.ROAD_MIN) runs.push(cur); cur = []; };
        for (let i = 1; i < P.length; i++) {
          const a = P[i - 1], c = P[i], d = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(d / 8));
          for (let k = i === 1 ? 0 : 1; k <= n; k++) {
            const x = a[0] + (c[0] - a[0]) * k / n, z = a[1] + (c[1] - a[1]) * k / n;
            const q = zoneAt(x, z);
            if (q && q.key === zone.key && dry(x, z)) cur.push([x, z]); else flush();
          }
        }
        flush();
      }
      for (let t = 0; t < 12 && runs.length; t++) {
        const run = runs[Math.floor(rng() * runs.length)];
        const total = lenOf(run);
        const want = Math.min(R.ROAD_MAX, total) * (0.7 + rng() * 0.3);
        const startS = rng() * Math.max(0, total - want);
        const pts = [];
        let s = 0;
        for (let i = 0; i < run.length; i++) {
          if (i) s += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
          if (s >= startS && s <= startS + want && (pts.length === 0 || Math.hypot(run[i][0] - pts.at(-1)[0], run[i][1] - pts.at(-1)[1]) >= 40)) pts.push([Math.round(run[i][0] * 10) / 10, Math.round(run[i][1] * 10) / 10]);
        }
        if (pts.length < 3 || !farFromMade(pts[0][0], pts[0][1])) continue;
        let ok = true;
        for (let i = 1; i < pts.length && ok; i++) ok = legOk(pts[i - 1], pts[i], own);
        if (ok) return { kind: 'road', loop: false, pts };
      }
      return null;
    }
    /** A there-and-back trail when no loop fits (a narrow pass, a fen): anchor to anchor, never doubling back. */
    function makeTrail() {
      for (let t = 0; t < R.TRIES; t++) {
        const s0 = anchors[Math.floor(rng() * anchors.length)];
        if (!farFromMade(s0.x, s0.z)) continue;
        const pts = [[s0.x, s0.z]];
        let heading = rng() * Math.PI * 2;
        for (let k = 0; k < 6; k++) {
          const last = pts.at(-1);
          let got = null;
          for (let q = 0; q < 8 && !got; q++) {
            const a = heading + (rng() - 0.5) * 1.6, d = R.LEG[0] + rng() * (R.LEG[1] - R.LEG[0]);
            const p = near(last[0] + Math.cos(a) * d, last[1] + Math.sin(a) * d, 60, null);
            if (p && Math.hypot(p.x - last[0], p.z - last[1]) > 50 && legOk(last, [p.x, p.z], own)) { got = p; heading = Math.atan2(p.z - last[1], p.x - last[0]); }
          }
          if (!got) break;
          pts.push([got.x, got.z]);
        }
        if (pts.length >= 3 && lenOf(pts) >= 380) return { kind: 'open', loop: false, pts: pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) };
      }
      return null;
    }
    const plan = mix || ['road', 'road', 'shore', 'valley', 'cross', 'road', 'open', 'valley', 'shore', 'cross', 'open', 'open'];
    for (const kind of plan) {
      if (made.length >= perZone) break;
      const r = kind === 'road' ? makeRoad() : makeLoop(kind);
      if (r) made.push(r);
    }
    for (let k = 0; made.length < perZone && k < perZone * 2; k++) { const r = makeLoop('open') || makeTrail(); if (r) made.push(r); }
    made.forEach((r, i) => {
      const n = r.pts.length;
      const rests = [Math.floor(n * 0.3), Math.floor(n * 0.75)].filter((v, j, a) => v > 0 && v < n && a.indexOf(v) === j);
      const pts = r.loop ? [...r.pts, r.pts[0]] : r.pts;
      routes.push({ id: `${zone.key}:${i}`, zone: zone.key, kind: r.kind, loop: r.loop, pts: r.pts, rests, length: Math.round(lenOf(pts) * (r.loop ? 1 : 2)),
        zones: [...new Set(r.pts.map(p => (zoneAt(p[0], p[1]) || {}).key).filter(Boolean))] });
    });
  }
  return { routes };
}

/** Check a route the way packRoutes made it (tests, the tool's --check): the first bad sample, or null. */
export function routeProblem(route, { terrain, keepOut = [], zones = [] }) {
  const keep = circleIndex(keepOut);
  const pts = route.loop ? [...route.pts, route.pts[0]] : route.pts;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / ROUTE.STEP));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      if (!terrain.walkable(x, z)) return { x, z, why: 'not walkable' };
      const w = terrain.waterAt ? terrain.waterAt(x, z) : null;
      if (w && w.depth > 0.25) return { x, z, why: 'water' };
      const c = keep.inside(x, z);
      if (c) return { x, z, why: 'inside a ' + c.why };
      if (zones.length && !zones.some(q => x >= q.bounds.minX && x < q.bounds.maxX && z >= q.bounds.minZ && z < q.bounds.maxZ)) return { x, z, why: 'off the province' };
    }
  }
  return null;
}
