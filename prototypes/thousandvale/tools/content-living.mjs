// Stream E — the living-world pass of the zone placer (owner play-test P19, P26; tools/place-vignettes.mjs calls it).
//
// P19: "massive empty areas, only an occasional rock or bush, no enemies — more stuff to do, less empty space, a
// living world: routes and people walking and talking about the day and recent events, not just small camps."
//
//   fillDensity(st, { LF, typeMid })   — after every hand-placed thing: walk the zone's open ground on an 8 m grid and,
//                                         while any reachable open sample is more than TARGET m from the edge of the
//                                         nearest thing (or a road sample more than ROAD_TARGET m), drop something
//                                         there, cycling through:
//       curio    a mini vignette (data/vignettes/curios.json): forage, a shrine, a dead traveller's pack, a note…
//       wayside  roadside dressing to look at (data/vignettes/wayside.json)
//       stray    1–3 monsters of the zone's mix at the level the ramp gives there (P26: the weakest types nearest town)
//       roamer   a stray pack that walks a loop (`path`, every leg walkable) — the monsters between camps
//       folk     someone working the wilds (data/provinces/travellers.json `folk`): a woodcutter, a shepherd, a hermit…
//                 walking a small loop and talking (data/names/chatter.json)
//   routesFor(zones, { sheet, map }) — the travellers' routes: stream B's roads stitched across the province into one
//                                       graph, one route per pair of neighbouring settlements (no third town on the way).
//   placeWords(ctx, x, z)              — "in the hills about 400 m north-west of Copperdell" (a map/tracker hint).
//
// Same inputs -> same output (every choice draws from the zone's seeded rng).
import { readFileSync, existsSync } from 'node:fs';
import { NAV } from '../js/rules/terrain-read.js';
import { J, ROOT } from './content-lib.mjs';
import { findSpot, openPoint, walkLine, settlementEdge, campLevels, POINT_TYPES, heavyOk, capCount, groundPieces } from './content-place.mjs';

export const TARGET = 50;          // metres: no reachable open sample further than this from the edge of something (≈ one thing every ~100 m)
export const ROAD_TARGET = 45;     // metres, for road samples (travellers walk the roads as well: routesFor)
export const STEP = 8;             // the coverage grid
const RIM = 40;                    // samples this close to the zone edge are the neighbour's to cover
const opt = p => (existsSync(new URL(p, ROOT)) ? J(p) : null);
const CURIOS = (opt('data/vignettes/curios.json') || { curios: [] }).curios;
const WAYSIDE = (opt('data/vignettes/wayside.json') || { kinds: [] }).kinds;
const TRAV = opt('data/provinces/travellers.json') || { kinds: {}, folk: {} };
const NAMES = opt('data/names/torbor.json') || {};
const FOREST = new Set(['temperateForest', 'borealForest', 'rainforest']);
// open ground, in every 32: 14 curio, 8 stray, 5 wayside, 3 roaming pack, 2 folk (the owner: "more stuff to do", "no enemies")
const OPEN_MIX = 'cscwcrscfcswcscr' + 'cwscfcswcrscwcsc';
const ROAD_MIX = 'wcwscwcw';

/** P19 density pass over one placed zone. Mutates st.ctx.placed (st.file.placements is the same array). */
export function fillDensity(st, { LF, typeMid, target = TARGET, roadTarget = ROAD_TARGET, maxAdd = 900 } = {}) {
  const { ctx, rnd, zs, eid, bake } = st;
  const P = ctx.placed, terrain = ctx.terrain, ext = ctx.extent;
  const top = zs.band[1], lvl = (x, z) => LF.at(eid, x, z);
  const N = Math.floor(ext / STEP) + 1;
  const d = new Float32Array(N * N).fill(1e9);
  const kind = new Uint8Array(N * N);     // 0 = not a target, 1 = open, 2 = road, 3 = given up
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * STEP, z = j * STEP;
    if (x < RIM || z < RIM || x > ext - RIM || z > ext - RIM) continue;
    const b = ctx.bitsAt(x, z);
    if (!(b & NAV.WALK) || (b & (NAV.DEEP | NAV.STEEP | NAV.BUILDING | NAV.TOWN))) continue;
    if (settlementEdge(ctx, x, z) < 0) continue;
    if (b & NAV.ROAD) { if (ctx.inMainLoose(x, z)) kind[j * N + i] = 2; continue; }
    if (b & NAV.SHALLOW) continue;
    if (ctx.inMainLoose(x, z)) kind[j * N + i] = 1;
  }
  const stamp = (px, pz, r) => {
    const reach = r + Math.max(target, roadTarget) + 90;
    const i0 = Math.max(0, Math.floor((px - reach) / STEP)), i1 = Math.min(N - 1, Math.ceil((px + reach) / STEP));
    const j0 = Math.max(0, Math.floor((pz - reach) / STEP)), j1 = Math.min(N - 1, Math.ceil((pz + reach) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = Math.max(0, Math.hypot(i * STEP - px, j * STEP - pz) - r); const k = j * N + i; if (v < d[k]) d[k] = v; }
  };
  const stampRec = p => { stamp(p.x, p.z, p.radius || 2); for (const q of p.path || p.pts || []) stamp(q[0], q[1], 8); };
  for (const p of P) stampRec(p);
  for (const f of st.file.features || []) stampRec(f);
  for (const s of ctx.settlements) stamp(s.x, s.z, s.r);
  for (const b of bake) {
    if (['dungeon_door', 'crossing', 'landmark', 'lair', 'bridge', 'pass', 'dungeon'].includes(b.kind)) stamp(b.x, b.z, 8);
    else if (b.kind === 'event_site' || b.kind === 'camp_site') stamp(b.x, b.z, b.data.r || 20);
  }
  for (const g of groundPieces(bake)) stamp(g.x, g.z, g.r);      // stream B's farms, fields, graveyards, orchards… (play-test 2) are things to see

  const counts = { curio: 0, wayside: 0, stray: 0, roamer: 0, folk: 0 };
  const recipeAt = new Map();             // recipe id -> [{x,z}] (no two of one curio within 350 m)
  for (const p of P) if (p.type === 'curio') (recipeAt.get(p.recipe) || recipeAt.set(p.recipe, []).get(p.recipe)).push(p);
  let nOpen = 0, nRoad = 0, added = 0;
  const lvlFloor = (x, z) => Math.max(1, Math.min(top, Math.floor(lvl(x, z))));
  const biomeAt = (x, z) => terrain.biomes[terrain.biomeAt(x, z)].key;

  for (let iter = 0; iter < maxAdd * 3 && added < maxAdd; iter++) {
    // the emptiest sample still over its target
    let best = -1, need = 0;
    for (let k = 0; k < d.length; k++) {
      const t = kind[k]; if (t !== 1 && t !== 2) continue;
      const over = d[k] - (t === 2 ? roadTarget : target);
      if (over > need) { need = over; best = k; }
    }
    if (best < 0) break;
    const cx = (best % N) * STEP, cz = Math.floor(best / N) * STEP, onRoad = kind[best] === 2;
    const order = onRoad ? [ROAD_MIX[nRoad++ % ROAD_MIX.length]] : [OPEN_MIX[nOpen++ % OPEN_MIX.length]];
    for (const k of ['c', 'w', 's']) if (!order.includes(k)) order.push(k);
    let rec = null;
    for (const k of order) {
      rec = k === 'c' ? curio(cx, cz, onRoad) : k === 'w' ? wayside(cx, cz, onRoad) : k === 's' ? stray(cx, cz, onRoad, false) : k === 'r' ? stray(cx, cz, onRoad, true) : folk(cx, cz, onRoad);
      if (rec) break;
    }
    if (!rec) {   // nothing fits round here: stop asking about this patch
      const r = 3;
      for (let j = Math.max(0, Math.floor(best / N) - r); j <= Math.min(N - 1, Math.floor(best / N) + r); j++) for (let i = Math.max(0, (best % N) - r); i <= Math.min(N - 1, (best % N) + r); i++) if (kind[j * N + i]) kind[j * N + i] = 3;
      continue;
    }
    P.push(rec); stampRec(rec); added++;
  }
  // what is left over the target (reported; tests/E/living.test.js holds the line)
  let open = 0, openOver = 0, road = 0, roadOver = 0;
  for (let k = 0; k < d.length; k++) {
    const t = kind[k];
    if (t === 1 || (t === 3 && !(ctx.bitsAt((k % N) * STEP, Math.floor(k / N) * STEP) & NAV.ROAD))) { open++; if (d[k] > target) openOver++; }
    else if (t === 2 || t === 3) { road++; if (d[k] > roadTarget) roadOver++; }
  }
  st.file.density = { target, roadTarget, added: counts, openShareCovered: +(1 - openOver / Math.max(1, open)).toFixed(3), roadShareCovered: +(1 - roadOver / Math.max(1, road)).toFixed(3) };
  return st.file.density;

  // ---- the kinds ------------------------------------------------------------------------------------------------
  function spotNear(kindRule, R, x, z, onRoad2) {
    const near = { x, z, min: onRoad2 ? R + 7 : 0, max: onRoad2 ? R + 40 : 36 };
    return findSpot(ctx, rnd, kindRule, R, { near, tries: 160, spread: 0, score: (px, pz) => -Math.hypot(px - x, pz - z) });
  }
  function nearOk(near, x, z) {
    switch (near) {
      case 'water': return ctx.waterDist(x, z) < 50;
      case 'forest': return FOREST.has(biomeAt(x, z));
      case 'steep': return ctx.steepDist(x, z) < 60;
      case 'road': return ctx.roadDist(x, z) < 45;
      case 'field': return !FOREST.has(biomeAt(x, z));
      case 'shrine': return P.some(p => (p.type === 'curio' && /shrine/.test(p.kind || '')) && Math.hypot(p.x - x, p.z - z) < 120);
      default: return true;
    }
  }
  function curio(x, z, onRoad2) {
    const bm = biomeAt(x, z), lv = lvl(x, z);
    const cands = CURIOS.filter(c => (!c.tags.biomes.length || c.tags.biomes.includes(bm)) && (c.tags.archetypes.includes('any') || c.tags.archetypes.includes(zs.archetype))
      && lv >= c.tags.band[0] - 1 && lv <= c.tags.band[1] && !(recipeAt.get(c.id) || []).some(q => Math.hypot(q.x - x, q.z - z) < 350));
    if (!cands.length) return null;
    const w = cands.map(c => (c.weight || 1) * (nearOk(c.near, x, z) ? 3 : 0.4) * (onRoad2 && c.near === 'road' ? 3 : 1));
    for (let tries = 0; tries < 3; tries++) {
      const c = pick(cands, w);
      const s = spotNear('curio', c.radius, x, z, onRoad2);
      if (!s || (recipeAt.get(c.id) || []).some(q => Math.hypot(q.x - s.x, q.z - s.z) < 350)) continue;
      counts.curio++;
      const rec = { type: 'curio', id: `cu_${eid}_${counts.curio}`, recipe: c.id, name: c.name, kind: c.kind, x: s.x, z: s.z, yaw: +(rnd() * 6.28).toFixed(2), radius: c.radius, levelBase: lvlFloor(s.x, s.z) };
      (recipeAt.get(c.id) || recipeAt.set(c.id, []).get(c.id)).push(rec);
      return rec;
    }
    return null;
  }
  function wayside(x, z, onRoad2) {
    const bm = biomeAt(x, z);
    const fits = WAYSIDE.filter(w => !w.biomes.length || w.biomes.includes(bm));
    const pool = fits.length ? fits : WAYSIDE;
    if (!pool.length) return null;
    const wk = pool[Math.floor(rnd() * pool.length)];
    const s = spotNear('wayside', wk.radius, x, z, onRoad2);
    if (!s) return null;
    counts.wayside++;
    return { type: 'wayside', id: `${wk.id}_${eid}_d${counts.wayside}`, kind: wk.id, name: wk.name, x: s.x, z: s.z, yaw: +(rnd() * 6.28).toFixed(2), radius: wk.radius, filler: true };
  }
  function stray(x, z, onRoad2, roams) {
    const mix = zs.camps || [];
    if (!mix.length) return null;
    const lv = lvl(x, z);
    // the type whose sheet level sits closest to the ramp here; brigands like roads
    const w = mix.map(c => Math.exp(-Math.abs(lv - Math.max(LF.span(eid)[0], typeMid(c))) * 1.1) * (onRoad2 && /brigand|cult|zealot/.test(c.type) ? 3 : 1) * ((c.count && c.count[1] <= 2) ? 0.5 : 1) * (heavyOk(c.type, lv) ? 1 : 0));
    if (!w.some(v => v > 0)) return null;
    const c = pick(mix, w);
    const s = spotNear('stray', 8, x, z, onRoad2);
    if (!s) return null;
    const lvls = campLevels(lvl(s.x, s.z), top), count = capCount(rnd() < 0.6 ? [1, 2] : [2, 3], LF.dist(eid, s.x, s.z));
    if (!roams) { counts.stray++; return { type: 'camp', id: `camp_${eid}_s${counts.stray}`, monster: c.type, with: null, level: lvls, count, x: s.x, z: s.z, yaw: 0, radius: 8, stray: true }; }
    const path = loop(s, 40 + rnd() * 50, 4, 50);
    if (!path) return null;
    counts.roamer++;
    return { type: 'camp', id: `roam_${eid}_${counts.roamer}`, monster: c.type, with: null, level: lvls, count, x: s.x, z: s.z, yaw: 0, radius: 8, path, roam: true };
  }
  function folk(x, z, onRoad2) {
    const roles = Object.entries(TRAV.folk || {});
    if (!roles.length) return null;
    const bm = biomeAt(x, z);
    const cands = roles.filter(([, f]) => !f.setpiece && (!f.biomes || !f.biomes.length || f.biomes.includes(bm)) && (!f.archetypes || !f.archetypes.length || f.archetypes.includes(zs.archetype)));
    if (!cands.length) return null;
    const [role, f] = pick(cands, cands.map(([, ff]) => (ff.weight || 1) * (nearOk(ff.places, x, z) ? 3 : 0.3)));
    const s = spotNear('folk', 6, x, z, onRoad2);
    if (!s) return null;
    const [l0, l1] = f.loopM || [10, 25];
    const path = loop(s, l0 + rnd() * (l1 - l0), 3, 0);
    if (!path) return null;
    counts.folk++;
    return { type: 'folk', id: `folk_${eid}_${counts.folk}`, role, name: personName(f.name), work: f.work || null, chatter: f.chatter || [`role.${role}`], x: s.x, z: s.z, yaw: +(rnd() * 6.28).toFixed(2), radius: 6, path };
  }
  /** A small walkable loop round `c`: n points at about radius R, every leg walkable, `townGap` m off any settlement. */
  function loop(c, R, n, townGap) {
    const a0 = rnd() * 6.283, pts = [];
    for (let i = 0; i < n; i++) {
      let p = null;
      for (let t = 0; t < 10 && !p; t++) {
        const a = a0 + i / n * 6.283 + (rnd() - 0.5) * 0.5, r = R * (0.7 + rnd() * 0.5);
        const x = Math.round(c.x + Math.cos(a) * r), z = Math.round(c.z + Math.sin(a) * r);
        if (openPoint(ctx, x, z, { slope: 30, allowRoad: true }) && settlementEdge(ctx, x, z) > townGap && (!pts.length || walkLine(ctx, { x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] }, { x, z }))) p = [x, z];
      }
      if (!p) return null;
      pts.push(p);
    }
    if (!walkLine(ctx, { x: pts[n - 1][0], z: pts[n - 1][1] }, { x: pts[0][0], z: pts[0][1] }) || !walkLine(ctx, c, { x: pts[0][0], z: pts[0][1] })) return null;
    return pts;
  }
  function personName(pattern) {
    const given = NAMES.given ? [...(NAMES.given.f || []), ...(NAMES.given.m || [])] : [];
    const fam = NAMES.family || NAMES.surnames || [];
    return String(pattern || 'Stranger').replace('{first}', () => given.length ? given[Math.floor(rnd() * given.length)] : 'Old').replace('{family}', () => fam.length ? fam[Math.floor(rnd() * fam.length)] : 'Nobody');
  }
  function pick(list, w) { let t = w.reduce((a, b) => a + b, 0) * rnd(); for (let i = 0; i < list.length; i++) { t -= w[i]; if (t <= 0) return list[i]; } return list[list.length - 1]; }
}

// ---- routes for travellers ----------------------------------------------------------------------------------------
/**
 * zones = [{ eid, wid, gx, gy (WORLD zone numbers: z<gx>_<gy>), bake }] (every baked zone of the province); -> { routes: [...] } in WORLD metres.
 * A route joins two settlements by road with no third settlement on the way (so the network is neighbour to
 * neighbour); `pts` every ~16 m; `kinds` = the traveller kinds (travellers.json) whose minRouteM it meets.
 */
export function routesFor(zones, { ZM = 2048, maxM = 5200 } = {}) {
  const roads = new Map(), towns = [];
  // the province's zones as a set of cells (world zone numbers): a road point counts when it lies in one of them
  const cells = new Set(zones.map(z => `${z.gx},${z.gy}`));
  const inside = (x, z) => cells.has(`${Math.floor(x / ZM)},${Math.floor(z / ZM)}`);
  for (const z of zones) {
    const ox = z.gx * ZM, oz = z.gy * ZM;
    for (const b of z.bake) {
      if (b.kind === 'road' && !roads.has(b.id)) roads.set(b.id, b.data.pts.map(p => [p[0] + ox, p[1] + oz]));
      if (b.kind === 'settlement') towns.push({ name: b.data.name, kind: b.data.kind, zone: z.wid, eid: z.eid, x: b.x + ox, z: b.z + oz, r: b.data.radius || 40 });
    }
  }
  // graph: points snapped to 2 m; consecutive points joined; a road END joins the nearest point of another road within 8 m
  const key = (x, z) => `${Math.round(x / 2)},${Math.round(z / 2)}`;
  const node = new Map(), xy = [], adj = [];
  const id = (x, z) => { const k = key(x, z); let n = node.get(k); if (n === undefined) { n = xy.length; node.set(k, n); xy.push([x, z]); adj.push([]); } return n; };
  const link = (a, b) => { if (a === b) return; const L = Math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1]); adj[a].push([b, L]); adj[b].push([a, L]); };
  const ends = [];
  for (const [rid, pts] of roads) {
    let prev = null;
    for (const [x, z] of pts) { if (!inside(x, z)) { prev = null; continue; } const n = id(x, z); if (prev !== null) link(prev, n); prev = n; }
    const ins = pts.filter(([x, z]) => inside(x, z));
    if (ins.length) { ends.push({ rid, n: id(...ins[0]) }, { rid, n: id(...ins[ins.length - 1]) }); }
  }
  // spatial hash for end-joins and town anchors
  const cell = new Map(), C = 16;
  xy.forEach(([x, z], n) => { const k = `${Math.floor(x / C)},${Math.floor(z / C)}`; (cell.get(k) || cell.set(k, []).get(k)).push(n); });
  const nearNodes = (x, z, r) => { const out = []; for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) for (const n of cell.get(`${i},${j}`) || []) if (Math.hypot(xy[n][0] - x, xy[n][1] - z) <= r) out.push(n); return out; };
  for (const e of ends) {
    if (adj[e.n].length > 1) continue;
    let best = null, bd = 9;
    for (const n of nearNodes(xy[e.n][0], xy[e.n][1], 8)) { if (n === e.n || adj[e.n].some(([m]) => m === n)) continue; const dd = Math.hypot(xy[n][0] - xy[e.n][0], xy[n][1] - xy[e.n][1]); if (dd < bd && dd > 0) { bd = dd; best = n; } }
    if (best !== null) link(e.n, best);
  }
  // each town's anchor: the nearest road node to its centre within r + 60
  for (const t of towns) {
    let best = null, bd = Infinity;
    for (const n of nearNodes(t.x, t.z, t.r + 60)) { const dd = Math.hypot(xy[n][0] - t.x, xy[n][1] - t.z); if (dd < bd) { bd = dd; best = n; } }
    t.node = best;
  }
  const routes = [];
  const kinds = Object.entries(TRAV.kinds || {});
  for (let a = 0; a < towns.length; a++) {
    const A = towns[a]; if (A.node == null) continue;
    const { dist, prev } = dijkstra(A.node, maxM);
    for (let b = a + 1; b < towns.length; b++) {
      const B = towns[b]; if (B.node == null || !Number.isFinite(dist[B.node])) continue;
      const path = []; for (let n = B.node; n !== undefined && n !== -1; n = prev[n]) { path.push(n); if (n === A.node) break; }
      path.reverse();
      const pts = path.map(n => xy[n]);
      // no third town on the way (inside its circle)
      if (towns.some((T, k) => k !== a && k !== b && pts.some(([x, z]) => Math.hypot(x - T.x, z - T.z) < T.r))) continue;
      const length = Math.round(dist[B.node]);
      const thin = [pts[0]]; let acc = 0;
      for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc >= 16 || i === pts.length - 1) { thin.push([Math.round(pts[i][0]), Math.round(pts[i][1])]); acc = 0; } }
      const zonesOn = [...new Set(thin.map(([x, z]) => zones.find(q => q.gx === Math.floor(x / ZM) && q.gy === Math.floor(z / ZM))).filter(Boolean).map(q => q.wid))];
      routes.push({ id: `route_${slug(A.name)}_${slug(B.name)}`, from: pick2(A), to: pick2(B), length, zones: zonesOn, kinds: kinds.filter(([, k]) => !k.minRouteM || length >= k.minRouteM).map(([kid]) => kid), pts: thin });
    }
  }
  return { routes, towns: towns.map(pick2), unanchored: towns.filter(t => t.node == null).map(t => t.name) };

  function pick2(t) { return { name: t.name, kind: t.kind, zone: t.zone, x: Math.round(t.x), z: Math.round(t.z), r: t.r }; }
  function dijkstra(src, lim) {
    const dist = new Float64Array(xy.length).fill(Infinity), prev = new Int32Array(xy.length).fill(-1);
    dist[src] = 0; const heap = [[0, src]];
    while (heap.length) {
      const [dd, n] = pop(heap); if (dd > dist[n]) continue; if (dd > lim) break;
      for (const [m, L] of adj[n]) { const nd = dd + L; if (nd < dist[m]) { dist[m] = nd; prev[m] = n; push(heap, [nd, m]); } }
    }
    return { dist, prev };
  }
}
function push(h, v) { h.push(v); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function pop(h) { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

// ---- words for a place --------------------------------------------------------------------------------------------
const BIOME_WORDS = { grassland: 'open grass', temperateForest: 'woods', borealForest: 'pinewoods', rainforest: 'wet forest', shrubland: 'scrub', savanna: 'dry grass', badlands: 'badlands',
  hills: 'hills', mountains: 'mountains', tundra: 'cold moor', marsh: 'marsh', lake: 'lakeside', coast: 'coast', beach: 'shore', blighted: 'blighted ground', road: 'roadside' };
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Compass word from a to b: -z is north, +x east (the map draws x right, z down). */
export function compass(ax, az, bx, bz) { const a = Math.atan2(bx - ax, -(bz - az)); return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
/** "in the hills about 400 m north-west of Copperdell" — the nearest settlement of this zone (ctx.settlements). */
export function placeWords(ctx, x, z) {
  const bm = ctx.terrain.biomes[ctx.terrain.biomeAt(x, z)].key, words = BIOME_WORDS[bm] || 'wilds';
  let s = null, best = Infinity;
  for (const t of ctx.settlements) { const dd = Math.hypot(t.x - x, t.z - z); if (dd < best) { best = dd; s = t; } }
  if (!s) return `in the ${words}`;
  const edge = Math.max(0, best - s.r);
  if (edge < 40) return `at the edge of ${s.name}`;
  const m = edge < 400 ? Math.round(edge / 50) * 50 : Math.round(edge / 100) * 100;
  return `in the ${words}, about ${m} m ${compass(s.x, s.z, x, z)} of ${s.name}`;
}
void readFileSync; void POINT_TYPES;

// ---- play-test 3, R2: something to kill near the start -----------------------------------------------------------
/**
 * The owner, play-test 3: "the map is still so empty, no enemies to kill" — he reached level 2 after killing
 * everything he saw. fillDensity puts ONE thing every ~100 m and only 11 of every 32 are monsters, so near the start
 * the nearest hound could be 150 m away. This pass looks only at MONSTERS: wherever the level ramp is still low
 * (<= HUNT.maxLevel, i.e. within ~1.4 km of the start hub) every reachable open sample gets a monster camp within
 * HUNT.target m, and every road sample one within HUNT.roadTarget m — solos and pairs (the starting-area rule),
 * a third of them walking a small loop.
 *
 * The records go to data/vignettes/placements/<zone>.hunt.json, NOT the main file: stream B's bake reads the main file
 * (keep-clear discs for scatter), and a monster camp needs no cleared ground — so this pass never forces a re-bake and
 * runs on kept zones too. js/sim/content.js merges the two. Same inputs -> same output (the zone's own seeded rng, used
 * after the main file is complete).
 */
export const HUNT = Object.freeze({ maxLevel: 3.5, target: 55, roadTarget: 50, maxAdd: 260, roamShare: 0.35 });

export function fillHunting(st, { LF, typeMid, hunt = HUNT } = {}) {
  const { ctx, rnd, zs, eid } = st;
  const P = ctx.placed, ext = ctx.extent;
  const top = zs.band[1], lvl = (x, z) => LF.at(eid, x, z);
  const mix = (zs.camps || []).filter(c => c.type);
  const N = Math.floor(ext / STEP) + 1;
  const d = new Float32Array(N * N).fill(1e9);
  const kind = new Uint8Array(N * N);
  let targets = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * STEP, z = j * STEP;
    if (x < RIM || z < RIM || x > ext - RIM || z > ext - RIM) continue;
    if (lvl(x, z) > hunt.maxLevel) continue;
    const b = ctx.bitsAt(x, z);
    if (!(b & NAV.WALK) || (b & (NAV.DEEP | NAV.STEEP | NAV.BUILDING | NAV.TOWN | NAV.SHALLOW))) continue;
    if (settlementEdge(ctx, x, z) < 70) continue;                       // the stray rule's town gap
    if (!ctx.inMainLoose(x, z)) continue;
    kind[j * N + i] = b & NAV.ROAD ? 2 : 1; targets++;
  }
  const out = { file: [], stats: { targets, added: 0, stray: 0, roamer: 0 } };
  if (!targets || !mix.length) return out;
  const stamp = (px, pz, r) => {
    const reach = r + Math.max(hunt.target, hunt.roadTarget) + 60;
    const i0 = Math.max(0, Math.floor((px - reach) / STEP)), i1 = Math.min(N - 1, Math.ceil((px + reach) / STEP));
    const j0 = Math.max(0, Math.floor((pz - reach) / STEP)), j1 = Math.min(N - 1, Math.ceil((pz + reach) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = Math.max(0, Math.hypot(i * STEP - px, j * STEP - pz) - r); const k = j * N + i; if (v < d[k]) d[k] = v; }
  };
  const isMonster = p => p.type === 'camp' || p.type === 'rare';
  const stampRec = p => { stamp(p.x, p.z, Math.min(p.radius || 8, 12)); for (const q of p.path || []) stamp(q[0], q[1], 8); };
  for (const p of P) if (isMonster(p)) stampRec(p);
  const mine = [];
  for (let iter = 0; iter < hunt.maxAdd * 3 && mine.length < hunt.maxAdd; iter++) {
    let best = -1, need = 0;
    for (let k = 0; k < d.length; k++) {
      const t = kind[k]; if (t !== 1 && t !== 2) continue;
      const over = d[k] - (t === 2 ? hunt.roadTarget : hunt.target);
      if (over > need) { need = over; best = k; }
    }
    if (best < 0) break;
    const cx = (best % N) * STEP, cz = Math.floor(best / N) * STEP, onRoad = kind[best] === 2;
    const rec = monster(cx, cz, onRoad, rnd() < hunt.roamShare) || monster(cx, cz, onRoad, false);
    if (!rec) {
      const r = 2;
      for (let j = Math.max(0, Math.floor(best / N) - r); j <= Math.min(N - 1, Math.floor(best / N) + r); j++) for (let i = Math.max(0, (best % N) - r); i <= Math.min(N - 1, (best % N) + r); i++) if (kind[j * N + i]) kind[j * N + i] = 3;
      continue;
    }
    P.push(rec); mine.push(rec); stampRec(rec);
  }
  // out of the main file again: these live in <zone>.hunt.json
  for (const r of mine) P.splice(P.indexOf(r), 1);
  let over = 0, cover = 0;
  for (let k = 0; k < d.length; k++) if (kind[k]) { cover++; if (d[k] > (kind[k] === 2 ? hunt.roadTarget : hunt.target)) over++; }
  out.file = mine;
  out.stats = { targets, added: mine.length, stray: mine.filter(r => !r.roam).length, roamer: mine.filter(r => r.roam).length, covered: +(1 - over / Math.max(1, cover)).toFixed(3) };
  return out;

  function monster(x, z, onRoad, roams) {
    const lv = lvl(x, z);
    const w = mix.map(c => Math.exp(-Math.abs(lv - Math.max(LF.span(eid)[0], typeMid(c))) * 1.1) * (onRoad && /brigand|cult|zealot/.test(c.type) ? 3 : 1) * (heavyOk(c.type, lv) ? 1 : 0));
    if (!w.some(v => v > 0)) return null;
    const c = pick(mix, w);
    const near = { x, z, min: onRoad ? 12 : 0, max: onRoad ? 40 : 30 };
    const s = findSpot(ctx, rnd, 'stray', 6, { near, tries: 120, spread: 0, score: (px, pz) => -Math.hypot(px - x, pz - z) });
    if (!s) return null;
    const lvls = campLevels(lvl(s.x, s.z), top);
    const count = rnd() < 0.5 ? [1, 1] : [1, 2];                         // solos and pairs: the start is for learning
    const n = out.stats.added + mine.length + 1;
    if (!roams) return { type: 'camp', id: `hunt_${eid}_${n}`, monster: c.type, with: null, level: lvls, count, x: s.x, z: s.z, yaw: 0, radius: 6, stray: true, hunt: true };
    const path = loopAt(s, 30 + rnd() * 40, 4);
    if (!path) return null;
    return { type: 'camp', id: `hunt_${eid}_${n}`, monster: c.type, with: null, level: lvls, count, x: s.x, z: s.z, yaw: 0, radius: 6, path, roam: true, hunt: true };
  }
  function loopAt(c, R, n) {
    const a0 = rnd() * 6.283, pts = [];
    for (let i = 0; i < n; i++) {
      let p = null;
      for (let t = 0; t < 10 && !p; t++) {
        const a = a0 + i / n * 6.283 + (rnd() - 0.5) * 0.5, r = R * (0.7 + rnd() * 0.5);
        const x = Math.round(c.x + Math.cos(a) * r), z = Math.round(c.z + Math.sin(a) * r);
        if (openPoint(ctx, x, z, { slope: 30, allowRoad: true }) && settlementEdge(ctx, x, z) > 70 && (!pts.length || walkLine(ctx, { x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] }, { x, z }))) p = [x, z];
      }
      if (!p) return null;
      pts.push(p);
    }
    if (!walkLine(ctx, { x: pts[n - 1][0], z: pts[n - 1][1] }, { x: pts[0][0], z: pts[0][1] }) || !walkLine(ctx, c, { x: pts[0][0], z: pts[0][1] })) return null;
    return pts;
  }
  function pick(list, w) { let t = w.reduce((a, b) => a + b, 0) * rnd(); for (let i = 0; i < list.length; i++) { t -= w[i]; if (t <= 0) return list[i]; } return list[list.length - 1]; }
}
