// Thousandvale — town perimeters (stream B, play-test 4 S7: "walls around cities: stone border walls, wooden fences,
// barricades … gates must open facing the right way"). Zone-local, pure, deterministic; called by tools/bake-zone.mjs
// after the towns are planned and the footpaths are laid (so every road, lane, street and path that reaches a town is
// known), before nav.bin.
//
// The rule that makes the gates right (Farhold's lesson, RPG.md R16/R21/R27): a gate exists BECAUSE something you walk on
// crosses the wall line, and it is cut WHERE it crosses and turned to the way THAT road runs. So the wall is not drawn
// first and then holed — the ring is sampled every metre and every sample within reach of a road / lane / street / path
// (or standing in water, or on one of stream E's discs) is an opening. What is left between the openings is wall. That
// makes "a wall across a road" impossible by construction rather than by a check, and a road that crosses at a slant
// simply makes a wider opening.
//
//   style      data/world/town-walls.json: by settlement kind, replaced in a frontier/blight/ruinfield zone; per-town overrides
//   radius     outside the outermost building by the style's margin (a proctown-walled city keeps proctown's wall radius,
//              which its main streets were already carried out to); never past the town circle - 2 m
//   gates      { x, z, h, yaw, out, wallYaw, open, width, kind, road } — (x, z) is ON the ring. yaw / out = the way OUT along
//              the road (what a walker follows). wallYaw = atan2(nx, nz) of the ring's outward normal there: the way the
//              gate STRUCTURE faces. Play-test 5 (T8b): the structure stands IN the wall — its width runs along the ring's
//              tangent whatever angle the road crosses at — and `open` is its clear opening along the wall, wide enough
//              for the road to pass at its slant (pass / cos + the depth of the gate x tan). Before, the gatehouse was
//              turned to the road, so where a road left town at an angle the gate stood skewed in its wall with a gap
//              either side. kind: gatehouse | posts | gap (an opening too wide for a gatehouse: towers stand either side)
//   runs       open polylines [[x, z, h]…] of wall between openings; towers [{x, z, h, yaw}] along them
//
//   main       W6 (play-test 8, report #27): gates[].main = { street, width, pts, metres } — the town's high street from
//              this gate to the edge of the square (proctown opt-in `highStreets`, laid by the bake). Where a town has
//              high streets the GATES FOLLOW THEM: ways[] entries { kind: 'street', high: true, town, linkRoad, joins }.
//
// Exported for tests: planTownWalls, wallNav (the SOLID stamp nav.bin uses), WALL_DEFAULTS.

const TAU = Math.PI * 2;
const r2 = v => Math.round(v * 100) / 100;

/** Fallbacks for a missing data/world/town-walls.json (kept equal to the file). */
export const WALL_DEFAULTS = {
  frontierArchetypes: ['frontier', 'blight', 'ruinfield'],
  culturalStone: { dwarf: 'cutstone', desert: 'mudbrick', undead: 'bone', orc: 'palisade' },
  styles: {
    curtain: { material: 'stone', tier: 'wall', h: 4.4, thick: 1.2, seg: 18, towerEvery: 46, margin: 8, gate: 'gatehouse', tint: '#a29c90' },
    curtain_city: { material: 'stone', tier: 'wall', h: 4.4, thick: 1.2, seg: 18, towerEvery: 38, margin: 8, gate: 'gatehouse', tint: '#a29c90' },
    stockade: { material: 'palisade', tier: 'wall', h: 4.5, thick: 0.8, seg: 14, towerEvery: 52, margin: 7, gate: 'gatehouse', tint: '#8a6a48' },
    palisade: { material: 'palisade', tier: 'wall', h: 4.5, thick: 0.8, seg: 14, towerEvery: 0, margin: 6, gate: 'gatehouse', tint: '#8a6a48' },
    barricade: { material: 'barricade', tier: 'low', h: 2.0, thick: 1.6, seg: 10, towerEvery: 0, margin: 5, gate: 'posts', tint: '#7d6448' },
    fence: { material: 'rail', tier: 'low', h: 1.25, thick: 0.3, seg: 10, towerEvery: -1, margin: 4, gate: 'posts', tint: '#8a6c50' },
    hedge: { material: 'hedge', tier: 'low', h: 1.4, thick: 0.9, seg: 10, towerEvery: -1, margin: 4, gate: 'posts', tint: '#56763a' },
  },
  bySize: { capital: 'curtain_city', city: 'curtain_city', town: 'curtain', village: 'palisade', hamlet: 'fence' },
  frontier: { capital: 'curtain_city', city: 'curtain_city', town: 'stockade', village: 'barricade', hamlet: 'barricade' },
  cultureFence: { elf: 'hedge' },
  towns: {},
};

/** Metres either side of a gate's opening the wall stops short (the gatehouse jambs / posts stand there). */
export const POST = 1.0;
/** The nav stamp half-width of a wall line: a 2 m sample grid needs > √2 m so no diagonal step slips through. */
export const NAV_HALF = 1.5;
/** A gatehouse's clear opening in proctown's kit (x = -2.1..2.1), scaled up to the road; wider than this is a `gap`. */
export const GATEHOUSE_OPEN = 4.2, GATEHOUSE_MAX = 12;
/** Half the depth (along the road) a gate takes up: a gatehouse is 3.4 m through, a pair of posts is only the nav stamp. */
export const GATE_HALF_DEPTH = { gatehouse: 1.7, posts: NAV_HALF };
/** The clear opening along the wall line is never asked to be wider than this (a road at a very flat slant becomes a `gap`). */
export const OPEN_MAX = 15;
/** Tower footprint radius (proctown's stone tower is 4.8 m across, the palisade one ~4.2). */
export const TOWER_R = 2.6;
/** A stream narrower than this where it runs through the ring gets a grate (SOLID in nav); a wider river stays open. */
export const GRATE_MAX = 16;

/** Which style a settlement gets. */
export function styleFor(town, { archetype = null, culture = 'human', cfg = WALL_DEFAULTS, slug = '' } = {}) {
  const C = { ...WALL_DEFAULTS, ...(cfg || {}) };
  let key = C.towns?.[slug] || null;
  const frontier = (C.frontierArchetypes || []).includes(archetype);
  if (!key) key = (frontier ? C.frontier : C.bySize)?.[town.kind] || 'fence';
  if (key === 'fence' && C.cultureFence?.[culture]) key = C.cultureFence[culture];
  const st = { ...(C.styles[key] || C.styles.fence), key };
  if (st.material === 'stone' && C.culturalStone?.[culture]) st.material = C.culturalStone[culture];
  return st;
}

/** Distance from (x, z) to polyline pts → { d, k, t } (segment index, parameter). */
function polyNear(pts, x, z) {
  let d = Infinity, bk = 0, bt = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const q = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (q < d) { d = q; bk = k; bt = t; }
  }
  return { d, k: bk, t: bt };
}

/**
 * Plan every settlement's perimeter.
 * ctx: { plans (proctown plans with origin/town/plots/streets/wall), ways: [{id, kind ('road'|'street'|'path'), width, pts [[x, z]…]}]
 *        (zone metres), groundAt(x, z), wetAt(x, z) -> bool, discs: [{x, z, r, id}] (stream E things the wall must not cut),
 *        archetype, cfg (town-walls.json), slug(name) }
 * Returns [{ town, name, kind, style, material, tier, h, thick, tint, cx, cz, r, runs, towers, gates, openings }].
 */
export function planTownWalls(ctx) {
  const { plans, ways = [], groundAt, wetAt = () => false, discs = [], archetype = null, cfg = WALL_DEFAULTS, slug = s => s } = ctx;
  const out = [];
  for (const plan of plans) {
    const town = plan.town, cx = plan.origin.x, cz = plan.origin.z, id = slug(town.name);
    const st = styleFor(town, { archetype, culture: plan.culture, cfg, slug: id });
    // radius: outside every building corner by the style's margin (a proctown wall keeps its own radius: the streets reach it)
    let reach = 0;
    for (const p of plan.plots) {
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const lx = u * p.w / 2, lz = v * p.d / 2;
        reach = Math.max(reach, Math.hypot(p.cx + lx * c - lz * s, p.cz + lx * s + lz * c));
      }
    }
    const keepClear = st.thick / 2 + NAV_HALF + 0.6;   // a run's nav stamp never reaches a road
    let R = plan.wall ? Math.max(plan.wallRadius, reach + 3) : reach + st.margin;
    // a street (or path) that stops INSIDE the town is a dead end there, not a way out: the wall stands clear of its end
    // rather than holing itself for it. Only a way that really crosses the ring (or ends on it: a street proctown carried
    // out to its wall) gets an opening.
    const ext = w => Math.max(...w.pts.map(q => Math.hypot(q[0] - cx, q[1] - cz)));
    // (W6: a high street is never a dead end — it is the street a gate is cut FOR)
    const mine = ways.filter(w => w.kind !== 'road' && !w.high && w.pts.some(q => Math.hypot(q[0] - cx, q[1] - cz) < R + 10));
    for (let pass = 0; pass < 4; pass++) {
      let need = R;
      for (const w of mine) { const e = ext(w); if (e < R + 1.5 && w.pts.every(q => Math.hypot(q[0] - cx, q[1] - cz) < R + 1.5) && !(plan.wall && Math.abs(e - plan.wallRadius) < 1.5)) need = Math.max(need, e + w.width / 2 + keepClear + 0.5); }
      if (need <= R + 1e-6) break;
      R = need;
    }
    R = Math.min(R, town.radius - 2);
    if (R < reach + 2.5) R = reach + 2.5;           // never on a building, even if that leaves the town circle a little
    const N = Math.max(48, Math.ceil(TAU * R));      // one sample a metre
    const angle = (x, z) => { let a = Math.atan2(z - cz, x - cx); if (a < 0) a += TAU; return a; };
    const at = (a, rr = R) => [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr];
    const rank = w => (w.kind === 'road' ? 3 : w.kind === 'street' ? 2 : 1) * 100 + w.width;
    // W6 (play-test 8): the town's HIGH STREETS (proctown opt-in `highStreets`: one straight main street from where a
    // road reaches the town to the square). Where there are any, the gates follow THEM: a road crossing that owns a
    // high street always gets a gate, and a road crossing with none is led round to the nearest such gate — so no
    // gate can open onto an alley while the avenue meant for its road ends against blank wall twenty metres along.
    const highs = ways.filter(w => w.kind === 'street' && w.high && w.town === id);
    const HIGH = highs.length > 0;

    // 1. every place a way crosses the ring (exact segment / circle intersections), with the way's heading OUT there.
    // A street proctown carried out to its wall ENDS on the ring: that end counts as a crossing too.
    const cand = [];
    for (const w of ways) {
      let hi = -Infinity;
      for (const q of w.pts) hi = Math.max(hi, Math.hypot(q[0] - cx, q[1] - cz));
      if (hi < R - 1.5 || polyNear(w.pts, cx, cz).d > R + 1.5) continue;   // nearest approach by SEGMENT, not by vertex
      for (let k = 0; k < w.pts.length - 1; k++) {
        const A = w.pts[k], B = w.pts[k + 1], ax = A[0] - cx, az = A[1] - cz, dx = B[0] - A[0], dz = B[1] - A[1];
        const qa = dx * dx + dz * dz, qb = 2 * (ax * dx + az * dz), qc = ax * ax + az * az - R * R, disc = qb * qb - 4 * qa * qc;
        if (qa < 1e-9 || disc < 0) continue;
        for (const sg of [-1, 1]) {
          const t = (-qb + sg * Math.sqrt(disc)) / (2 * qa); if (t < 0 || t > 1) continue;
          const L = Math.sqrt(qa); let ux = dx / L, uz = dz / L;
          const x = A[0] + dx * t, z = A[1] + dz * t;
          if (ux * (x - cx) + uz * (z - cz) < 0) { ux = -ux; uz = -uz; }
          cand.push({ w, x, z, a: angle(x, z), ux, uz });
        }
      }
      for (const end of [0, w.pts.length - 1]) {
        const E = w.pts[end], I = w.pts[end === 0 ? 1 : end - 1]; if (!I) continue;
        if (Math.abs(Math.hypot(E[0] - cx, E[1] - cz) - R) > 1.5 || cand.some(c => c.w === w && Math.hypot(c.x - E[0], c.z - E[1]) < 2)) continue;
        const L = Math.hypot(E[0] - I[0], E[1] - I[1]) || 1; let ux = (E[0] - I[0]) / L, uz = (E[1] - I[1]) / L;
        if (ux * (E[0] - cx) + uz * (E[1] - cz) < 0) { ux = -ux; uz = -uz; }
        cand.push({ w, x: E[0], z: E[1], a: angle(E[0], E[1]), ux, uz });
      }
    }
    // a settlement no road reaches still gets a way in: facing the nearest way outside it, else the middle of the zone
    if (!cand.length) {
      let tx = 1024, tz = 1024, best = Infinity;
      for (const w of ways) for (const q of w.pts) { const d = Math.hypot(q[0] - cx, q[1] - cz); if (d > R + 5 && d < best) { best = d; tx = q[0]; tz = q[1]; } }
      const a = Math.atan2(tz - cz, tx - cx), [x, z] = at(a);
      cand.push({ w: { id: null, kind: 'path', width: 3, pts: [[cx, cz], [x + Math.cos(a) * 20, z + Math.sin(a) * 20]] }, x, z, a: angle(x, z), ux: Math.cos(a), uz: Math.sin(a), fallback: true });
    }
    for (const c of cand) c.slant = Math.acos(Math.min(1, (c.ux * (c.x - cx) + c.uz * (c.z - cz)) / R));
    cand.sort((p, q) => p.a - q.a);
    // W6: the seed of each high street's gate — where the STREET ITSELF crosses the ring (the bake starts it outside the
    // wall, on its road, so the gate, the street and the square are in one straight line); if it starts inside the
    // wall instead, the crossing of ITS road (ways[].linkRoad) nearest its start
    const arcTo = (c, a) => Math.abs(((c.a - a + Math.PI * 3) % TAU) - Math.PI) * R;
    for (const h of highs) {
      const s0 = h.pts[0];
      const own = cand.find(c => c.w === h) || cand.filter(c => c.w.kind === 'road' && c.w.id === h.linkRoad && !c.high && Math.hypot(c.x - s0[0], c.z - s0[1]) < 45)
        .sort((p, q) => Math.hypot(p.x - s0[0], p.z - s0[1]) - Math.hypot(q.x - s0[0], q.z - s0[1]))[0];
      if (own) own.high = h;
    }
    const seeds = cand.filter(c => c.high);
    // …and every ROAD crossing that is not a seed is taken out of the clustering. Where the road is one a high street
    // carries in (its own old line through the wall, a few metres along from the gate) it is simply dropped: nothing is
    // painted along that line inside the town any more. Any other road is led to the nearest gate that has a street.
    const looseAll = HIGH && seeds.length ? cand.filter(c => c.w.kind === 'road' && !c.high) : [];
    const loose = looseAll.filter(c => !seeds.some(sd => sd.high.linkRoad === c.w.id && Math.hypot(sd.x - c.x, sd.z - c.z) < 45));
    const pool = looseAll.length ? cand.filter(c => !looseAll.includes(c)) : cand;
    const rankC = c => rank(c.w) + (c.high ? 1000 : 0);

    // 2. one gate for roads arriving close together (they share it: the others are led round to it, see `approaches`)
    const CLUSTER = 26;                                // metres of ring
    const clusters = [];
    for (const c of pool) {
      const last = clusters[clusters.length - 1];
      if (last && (c.a - last[last.length - 1].a) * R < CLUSTER) last.push(c); else clusters.push([c]);
    }
    if (clusters.length > 1) {                         // wrap: the last cluster may join the first
      const f = clusters[0], l = clusters[clusters.length - 1];
      if ((f[0].a + TAU - l[l.length - 1].a) * R < CLUSTER) { clusters[0] = [...l, ...f]; clusters.pop(); }
    }
    const gates = [];
    const ownGate = [];                                 // street / path crossings that stand too far from the main one
    const pending = [];                                 // [bundle, led] before the loose roads are handed out
    for (const cl of clusters) {
      cl.sort((p, q) => rankC(q) - rankC(p) || p.slant - q.slant);
      const main = cl[0], bundle = [main];
      for (const c of cl.slice(1)) {
        const arc = Math.abs(((c.a - main.a + Math.PI * 3) % TAU) - Math.PI) * R;
        if (c.w === main.w && !c.high) continue;
        if (arc <= main.w.width / 2 + c.w.width / 2 + 7) { bundle.push(c); continue; }   // side by side: one wider gate
        if (c.high) { ownGate.push([c]); continue; }                      // W6: a second high street here has its own gate
        if (c.w.kind === 'road') continue;                                // a road further off: led round to the main gate
        if (arc <= 14) bundle.push(c); else ownGate.push([c]);
      }
      pending.push([bundle, cl.filter(c => c.w.kind === 'road' && c.w !== main.w && !bundle.some(b => b.w === c.w))]);
    }
    for (const b of ownGate) pending.push([b, []]);
    // W6: a road with no high street of its own is led (outside the wall) to the nearest gate that has one
    for (const c of loose) {
      const home = pending.filter(([b]) => b[0].high).sort((p, q) => arcTo(c, p[0][0].a) - arcTo(c, q[0][0].a))[0];
      if (!home || home[0].some(b => b.w === c.w) || home[1].some(b => b.w === c.w)) continue;
      home[1].push(c);
    }
    for (const [bundle, led] of pending) gates.push(makeGate(bundle, led));
    // two gates whose openings overlap, or leave less than a tower's worth of wall between them, are one gate
    for (let changed = true, guard = 0; changed && guard < 20; guard++) {
      changed = false;
      gates.sort((p, q) => p.a0 - q.a0);
      for (let m = 0; m < gates.length && gates.length > 1; m++) {
        const g = gates[m], last = m === gates.length - 1, h = gates[last ? 0 : m + 1];
        const gap = (last ? h.a0 + TAU : h.a0) - g.a1;
        if (gap * R >= Math.max(6, TOWER_R * 2 + 1)) continue;
        const bundle = [...g.bundle, ...h.bundle].sort((p, q) => rankC(q) - rankC(p) || p.slant - q.slant);
        const led = [...g.led, ...h.led].filter(c => !bundle.some(b => b.w === c.w));
        const merged = makeGate(bundle, led);
        // the merged opening must still cover both
        merged.a0 = Math.min(merged.a0, g.a0); merged.a1 = Math.max(merged.a1, last ? h.a1 + TAU : h.a1);
        if (merged.pass > GATEHOUSE_MAX) merged.kind = 'gap';
        gates.splice(m, 1, merged); gates.splice(last ? 0 : m + 1, 1);
        changed = true; break;
      }
    }

    function makeGate(bundle, led) {
      const main = bundle[0];
      const px = main.uz, pz = -main.ux;              // across the gate
      let lo = -main.w.width / 2, hi = main.w.width / 2;
      for (const c of bundle.slice(1)) { const q = (c.x - main.x) * px + (c.z - main.z) * pz; lo = Math.min(lo, q - c.w.width / 2); hi = Math.max(hi, q + c.w.width / 2); }
      const mid = (lo + hi) / 2;
      const pass = hi - lo + 1.2;                     // the clear passage, square to the road
      // T8b: the gate stands ON the ring and IN its line. Its normal is the ring's; the road crosses it at `th`.
      const ag = angle(main.x + px * mid, main.z + pz * mid), [gx, gz] = at(ag);
      const nx = Math.cos(ag), nz = Math.sin(ag);
      const th = Math.min(Math.acos(Math.max(-1, Math.min(1, main.ux * nx + main.uz * nz))), 1.15);
      // the clear opening ALONG THE WALL: the passage seen at the slant, plus what the gate's own depth cuts off it
      const open = pass / Math.cos(th) + 2 * (GATE_HALF_DEPTH[st.gate] ?? NAV_HALF) * Math.tan(th);
      // how much ring the opening takes: the opening + the posts
      const half = Math.min(Math.PI / 3, (open / 2 + POST + st.thick / 2) / R);
      // a way through the gate that runs on at a slant beside the wall (a street proctown carried out to it) would have
      // the next stretch of wall standing on its edge: grow the opening along the ring while any bundled way is that close
      let a0 = ag - half, a1 = ag + half;
      const close = a => { const [x, z] = at(a); return bundle.some(c => polyNear(c.w.pts, x, z).d - c.w.width / 2 < st.thick / 2 + 1.0); };
      for (let k = 0; k < 40 && close(a0 - 0.5 / R); k++) a0 -= 0.5 / R;
      for (let k = 0; k < 40 && close(a1 + 0.5 / R); k++) a1 += 0.5 / R;
      let kind = st.gate;
      if (pass > GATEHOUSE_MAX || open > OPEN_MAX) kind = 'gap';
      return { main, bundle, led, gx, gz, ux: main.ux, uz: main.uz, nx, nz, open, pass, slant: main.slant, a0, a1, kind };
    }

    // 3. openings: the gates, then the river where it runs through the ring, then stream E's discs
    const inGate = a => gates.some(g => { const d = ((a - g.a0) % TAU + TAU) % TAU; return d <= g.a1 - g.a0; });
    const why = new Array(N).fill(null);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU; if (inGate(a)) { why[i] = 'gate'; continue; }
      const [x, z] = at(a);
      if (wetAt(x, z)) { why[i] = 'water'; continue; }
      if (discs.some(d => Math.hypot(d.x - x, d.z - z) < d.r + st.thick / 2 + 0.5)) why[i] = 'keep';
    }
    const extra = [];                                   // water / keep openings as [a0, a1]
    for (let i = 0; i < N; i++) {
      if (why[i] !== 'water' && why[i] !== 'keep') continue;
      if (why[(i - 1 + N) % N] === why[i] && i > 0) { extra[extra.length - 1].a1 = ((i + 1) / N) * TAU; continue; }
      extra.push({ kind: why[i], a0: (i / N) * TAU, a1: ((i + 1) / N) * TAU });
    }
    if (extra.length > 1 && why[N - 1] === why[0] && extra[0].a0 === 0) { const l = extra.pop(); extra[0].a0 = l.a0 - TAU; }
    // 4. runs between every opening (merged where they overlap); a sliver shorter than MIN_RUN is left open
    const MIN_RUN = st.tier === 'wall' ? 6 : 3;
    const norm = a => ((a % TAU) + TAU) % TAU;
    const opens = [...gates.map(g => ({ a0: norm(g.a0), a1: norm(g.a0) + (g.a1 - g.a0), gate: g })), ...extra.map(e => ({ a0: norm(e.a0), a1: norm(e.a0) + (e.a1 - e.a0), kind: e.kind }))];
    opens.sort((p, q) => p.a0 - q.a0);
    // openings that overlap (or leave a sliver shorter than MIN_RUN between them) are one opening
    for (let m = 0; opens.length > 1 && m < opens.length; ) {
      const o = opens[m], last = m === opens.length - 1, nx = opens[last ? 0 : m + 1];
      const gap = last ? nx.a0 + TAU - o.a1 : nx.a0 - o.a1;
      if (gap * R < MIN_RUN) {
        const gs = [...(o.gates || (o.gate ? [o.gate] : [])), ...(nx.gates || (nx.gate ? [nx.gate] : []))];
        const merged = { a0: o.a0, a1: Math.max(o.a1, last ? nx.a1 + TAU : nx.a1), gates: gs, kind: o.kind || nx.kind };
        if (last) { opens.splice(m, 1); opens[0] = merged; m = 0; } else { opens.splice(m, 2, merged); }
        continue;
      }
      m++;
    }
    for (const o of opens) o.gates = o.gates || (o.gate ? [o.gate] : []);
    const runs = [], towers = [];
    const ringAt = a => { const [x, z] = at(a); return [r2(x), r2(z), r2(groundAt(x, z))]; };
    for (let m = 0; m < opens.length; m++) {
      const o = opens[m], nx = opens[(m + 1) % opens.length];
      let b0 = o.a1, b1 = nx.a0; while (b1 < b0 - 1e-9) b1 += TAU;
      if (opens.length === 1) b1 = o.a0 + TAU;
      const L = (b1 - b0) * R; if (L < MIN_RUN) continue;
      const n = Math.max(1, Math.round(L / st.seg));
      const pts = []; for (let k = 0; k <= n; k++) pts.push(ringAt(b0 + (b1 - b0) * k / n));
      runs.push(pts);
      if (st.towerEvery >= 0 && st.tier === 'wall') {
        const tw = [];
        if (o.gates.some(g => g.kind !== 'posts') && L > TOWER_R * 2 + 2) tw.push(b0 + (TOWER_R + 0.3) / R);
        if (nx.gates.some(g => g.kind !== 'posts') && L > TOWER_R * 4 + 4) tw.push(b1 - (TOWER_R + 0.3) / R);
        if (st.towerEvery > 0) {
          const k = Math.floor(L / st.towerEvery);
          for (let q = 1; q <= k; q++) { const a = b0 + (b1 - b0) * q / (k + 1); if (tw.every(t => Math.abs(t - a) * R > st.towerEvery * 0.45)) tw.push(a); }
        }
        for (const a of tw) { const [x, z, h] = ringAt(a); towers.push({ x, z, h, yaw: +Math.atan2(Math.cos(a), Math.sin(a)).toFixed(4) }); }
      }
    }
    if (!opens.length) {                                // no way in at all (cannot happen with a road; kept for safety)
      const n = Math.max(3, Math.round(TAU * R / st.seg)), pts = []; for (let k = 0; k <= n; k++) pts.push(ringAt(TAU * k / n)); runs.push(pts);
    }

    // 5. approaches: the painted way from where each road leaves the town circle to its gate, and on in to the streets.
    // Roads are only painted outside the town circle (bake-zone step 4), so without these a road stopped dead 20-60 m
    // short of its gate. A road that shares another's gate is led round to it outside the wall.
    const rimR = Math.max(town.radius + 2, R + 14), innerR = Math.max(4, R - 16);
    // the parts of w's polyline between radii rA < rB, densified to 2 m, as separate contiguous pieces
    const along = (w, rA, rB) => {
      const pieces = []; let cur = [];
      for (let k = 0; k < w.pts.length - 1; k++) {
        const A = w.pts[k], B = w.pts[k + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(L / 2));
        for (let q = k ? 1 : 0; q <= n; q++) {
          const x = A[0] + (B[0] - A[0]) * q / n, z = A[1] + (B[1] - A[1]) * q / n, d = Math.hypot(x - cx, z - cz);
          if (d >= rA && d <= rB) cur.push([x, z]); else if (cur.length) { pieces.push(cur); cur = []; }
        }
      }
      if (cur.length) pieces.push(cur);
      return pieces.filter(p => p.length > 1);
    };
    const densify = pts => { const o = []; for (let k = 0; k < pts.length - 1; k++) { const A = pts[k], B = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 2)); for (let q = k ? 1 : 0; q <= n; q++) o.push([A[0] + (B[0] - A[0]) * q / n, A[1] + (B[1] - A[1]) * q / n]); } return o; };
    /** the piece passing nearest (x, z) */
    const nearestPiece = (pieces, x, z) => pieces.map(p => [p, Math.min(...p.map(q => Math.hypot(q[0] - x, q[1] - z)))]).sort((a, b) => a[1] - b[1])[0]?.[0] || [];
    const gateOut = [];
    for (const g of gates) {
      const appr = [];
      const mainW = g.main.w;
      // W6: the gate's main street — the way a walker follows from the gate to the edge of the square
      const H = g.bundle.find(c => c.high)?.high || null;
      let route = null;
      if (H) {
        const gp = [g.gx, g.gz], n = polyNear(H.pts, g.gx, g.gz), A = H.pts[n.k], B = H.pts[n.k + 1];
        const near = [A[0] + (B[0] - A[0]) * n.t, A[1] + (B[1] - A[1]) * n.t], end = H.pts[H.pts.length - 1];
        const startIn = Math.hypot(H.pts[0][0] - cx, H.pts[0][1] - cz) < R - 0.5;
        if (n.d < 0.75) route = [gp, ...H.pts.slice(n.k + 1)];                 // the street runs through the gate itself
        else if (startIn) route = [gp, ...H.pts];                               // the road carries on to where the street starts
        else {                                                                  // the street started outside: meet it a few metres in
          const L = Math.hypot(end[0] - near[0], end[1] - near[1]) || 1, f = Math.min(1, 6 / L);
          route = [gp, [near[0] + (end[0] - near[0]) * f, near[1] + (end[1] - near[1]) * f], end];
        }
        // a street that joins another carries on along THAT one to the square
        for (let h = H, guard = 0; h.joins && guard < 6; guard++) {
          const J = highs.find(w => w.id === h.joins); if (!J) break;
          const last = route[route.length - 1], jn = polyNear(J.pts, last[0], last[1]);
          route.push(...J.pts.slice(jn.k + 1)); h = J;
        }
        route = route.filter((q, k) => !k || Math.hypot(q[0] - route[k - 1][0], q[1] - route[k - 1][1]) > 0.05);
        g.route = { street: H.id, width: H.width, pts: route };
      }
      if (H) {
        // the road is painted from the town circle in to where its high street takes over (the street's start, outside
        // the wall) — never on along the road's own line through the houses: that painted "road" led players into buildings
        const RW = ways.find(w => w.kind === 'road' && w.id === H.linkRoad), s0 = H.pts[0], d0 = Math.hypot(s0[0] - cx, s0[1] - cz);
        g.road = RW?.id || null;
        if (RW && d0 < rimR - 1) {
          const outer = nearestPiece(along(RW, Math.max(d0 - 0.5, 0), rimR), s0[0], s0[1]);
          if (outer.length > 1 && Math.min(...outer.map(q => Math.hypot(q[0] - s0[0], q[1] - s0[1]))) < 4) appr.push({ way: RW.id, width: RW.width, pts: outer });
        }
        // a street that starts inside the wall: the gate is on the road, so pave the few metres from the gate to it
        if (route.length > 2 && mainW.kind === 'road') appr.push({ way: mainW.id, width: Math.max(mainW.width, H.width), inside: true, pts: densify([route[0], route[1]]) });
      } else if (mainW.kind === 'road') appr.push({ way: mainW.id, width: mainW.width, pts: nearestPiece(along(mainW, innerR, rimR), g.gx, g.gz) });
      for (const c of g.led) {
        // outside: the led road from the town circle down to 10 m outside the wall, then straight to the gate's mouth
        const outer = nearestPiece(along(c.w, R + 9, rimR), c.x, c.z).slice().sort((p, q) => Math.hypot(q[0] - cx, q[1] - cz) - Math.hypot(p[0] - cx, p[1] - cz));
        const mouth = [g.gx + g.ux * 6, g.gz + g.uz * 6];
        const start = outer.length ? outer[outer.length - 1] : [c.x + c.ux * 10, c.z + c.uz * 10];
        const link = []; const L = Math.hypot(mouth[0] - start[0], mouth[1] - start[1]), n = Math.max(1, Math.ceil(L / 2));
        for (let q = 0; q <= n; q++) link.push([start[0] + (mouth[0] - start[0]) * q / n, start[1] + (mouth[1] - start[1]) * q / n]);
        // inside: from just inside the gate to where the led road's own high street begins
        const inner = nearestPiece(along(c.w, innerR, R - 6), c.x, c.z).slice().sort((p, q) => Math.hypot(q[0] - cx, q[1] - cz) - Math.hypot(p[0] - cx, p[1] - cz));
        const gin = [g.gx - g.ux * 5, g.gz - g.uz * 5], end = inner.length ? inner[0] : null;
        const link2 = [];
        if (end) { const L2 = Math.hypot(end[0] - gin[0], end[1] - gin[1]), n2 = Math.max(1, Math.ceil(L2 / 2)); for (let q = 0; q <= n2; q++) link2.push([gin[0] + (end[0] - gin[0]) * q / n2, gin[1] + (end[1] - gin[1]) * q / n2]); }
        appr.push({ way: c.w.id, width: c.w.width, led: true, pts: [...outer, ...link] });
        // W6: with a high street inside the gate there is nothing to lead a second road to inside the wall
        if (link2.length && !H) appr.push({ way: c.w.id, width: Math.min(c.w.width, 3.5), led: true, inside: true, pts: [...link2, ...inner] });
      }
      gateOut.push({ ...g, approaches: appr.filter(a => a.pts.length > 1) });
    }

    out.push({ town: id, name: town.name, kind: town.kind, style: st.key, material: st.material, tier: st.tier, h: st.h, thick: st.thick, tint: st.tint,
      cx: r2(cx), cz: r2(cz), r: r2(R), runs, towers,
      gates: gateOut.map((g, k) => ({ id: `${id}_gate_${k}`, x: r2(g.gx), z: r2(g.gz), h: r2(groundAt(g.gx, g.gz)), yaw: +Math.atan2(g.ux, g.uz).toFixed(4), out: [+g.ux.toFixed(4), +g.uz.toFixed(4)],
        wallYaw: +Math.atan2(g.nx, g.nz).toFixed(4), open: r2(g.kind === 'gap' ? 2 * R * Math.sin((g.a1 - g.a0) / 2) : g.open),
        width: r2(g.kind === 'gap' ? 2 * R * Math.sin((g.a1 - g.a0) / 2) : g.pass), pass: r2(g.pass), slant: +g.slant.toFixed(3), kind: g.kind,
        way: g.main.w.id, wayKind: g.road ? 'road' : g.main.w.kind, road: g.road ?? (g.main.w.kind === 'road' ? g.main.w.id : null), ways: [...new Set([...g.bundle, ...g.led].map(c => c.w.id))], led: g.led.map(c => c.w.id),
        ends: [at(g.a0), at(g.a1)].map(([x, z]) => [r2(x), r2(z)]),
        // W6: the main street from this gate to the edge of the square (null: a side gate no world road's high street uses)
        main: g.route ? { street: g.route.street, width: g.route.width, pts: g.route.pts.map(([x, z]) => [r2(x), r2(z)]), metres: r2(g.route.pts.reduce((s, q, k) => s + (k ? Math.hypot(q[0] - g.route.pts[k - 1][0], q[1] - g.route.pts[k - 1][1]) : 0), 0)) } : null,
        approaches: g.approaches.map(a => ({ ...a, pts: a.pts.map(([x, z]) => [r2(x), r2(z)]) })) })),
      // a narrow stream through the ring gets an iron grate across it (water passes, bodies do not); a wide river is left open
      openings: extra.map(o => { const metres = (o.a1 - o.a0) * R, [x0, z0] = at(o.a0), [x1, z1] = at(o.a1);
        return { kind: o.kind, a0: +o.a0.toFixed(4), a1: +o.a1.toFixed(4), metres: r2(metres), ends: [[r2(x0), r2(z0)], [r2(x1), r2(z1)]], ...(o.kind === 'water' && metres <= GRATE_MAX ? { grate: true, h: r2(Math.max(groundAt((x0 + x1) / 2, (z0 + z1) / 2), groundAt(x0, z0), groundAt(x1, z1))) } : {}) }; }) });
  }
  return out;
}

/**
 * The SOLID stamp for nav.bin: every run as a line NAV_HALF (or half the wall's thickness) wide, every tower as a disc,
 * every gatehouse's two jambs. Gate openings stay as they are. Calls mark(i, j) for each sample to make SOLID.
 */
export function wallNav(walls, { SIZE, STEP, mark }) {
  const disc = (x, z, r) => {
    for (let j = Math.max(0, Math.floor((z - r) / STEP)); j <= Math.min(SIZE - 1, Math.ceil((z + r) / STEP)); j++)
      for (let i = Math.max(0, Math.floor((x - r) / STEP)); i <= Math.min(SIZE - 1, Math.ceil((x + r) / STEP)); i++)
        if (Math.hypot(i * STEP - x, j * STEP - z) <= r) mark(i, j);
  };
  for (const w of walls) {
    const half = Math.max(NAV_HALF, w.thick / 2);
    for (const pts of w.runs) for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let u = 0; u <= L; u += 0.5) disc(a[0] + (b[0] - a[0]) * u / L, a[1] + (b[1] - a[1]) * u / L, half);
    }
    for (const t of w.towers) disc(t.x, t.z, TOWER_R);
    for (const o of w.openings || []) if (o.grate) {
      const [a, b] = o.ends, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let u = 0; u <= L; u += 0.5) disc(a[0] + (b[0] - a[0]) * u / (L || 1), a[1] + (b[1] - a[1]) * u / (L || 1), half);
    }
    // a gatehouse's / gate's jambs: from each run end in to the edge of the passage, so the ONLY way through is the road
    for (const g of w.gates) {
      if (g.kind === 'gap' || !g.ends) continue;
      // T8b: the jambs stand on the WALL line (the ring's tangent at the gate), `open` apart — not square to the road
      const wall = Number.isFinite(g.wallYaw) && g.open > 0;
      const px = wall ? Math.cos(g.wallYaw) : g.out[1], pz = wall ? -Math.sin(g.wallYaw) : -g.out[0], off = (wall ? g.open : g.width) / 2 + half;
      const J = [[g.x + px * off, g.z + pz * off], [g.x - px * off, g.z - pz * off]];
      for (const j of J) {
        const e = g.ends.slice().sort((a, b) => Math.hypot(a[0] - j[0], a[1] - j[1]) - Math.hypot(b[0] - j[0], b[1] - j[1]))[0];
        const L = Math.hypot(e[0] - j[0], e[1] - j[1]);
        for (let u = 0; u <= L; u += 0.5) disc(j[0] + (e[0] - j[0]) * u / (L || 1), j[1] + (e[1] - j[1]) * u / (L || 1), half);
      }
    }
  }
}

/** Placement records for placements.json (one `town_wall` per settlement). */
export function wallPlacements(walls) {
  return walls.map(w => ({ kind: 'town_wall', id: `${w.town}_wall`, x: w.cx, z: w.cz, yaw: 0, data: {
    town: w.town, name: w.name, settlement: w.kind, style: w.style, material: w.material, tier: w.tier, h: w.h, thick: w.thick, tint: w.tint,
    radius: w.r, solid: true, runs: w.runs, towers: w.towers, gates: w.gates, openings: w.openings } }));
}
