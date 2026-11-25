// Oathwild — the town planner (town round 2026-11-25; owner: "not just tiny houses plopped onto a flat area … more
// detailed terrain and realistic paths and alley ways … crowded"). Pure: no DOM, no three.js, no files. The server
// (colliders) and the browser (everything drawn, villagers) call it with the same terrain + data, so they agree.
//
//   const P = planTowns(T, towns, { placements, npcs })    towns = data/towns.json
//   P.houses    [{ id, town, at:[x,z], w, d, facing, cells:[wc,dc], storeys, floorY, baseY, style, roof, plaster,
//                 door:{ cell, at:[x,z] }, shop, jetty, chimney, street }]       w along the street, d away from it
//   P.yards     [{ at, w, d, facing, house, edge }]       a back yard behind a house (fenced, some clutter)
//   P.fences    [{ a:[x,z], b:[x,z], kind, y }]           yard edges (with a gate gap)
//   P.walls     [{ a, b, y0, y1 }]                        terrace walls where a level pad stands over the ground
//   P.props     [{ kind, at, facing, y, scale? }]         lamps, stalls, fountain, barrels, crates, carts, benches…
//   P.boxes     [{ x, z, hw, hd, facing }]                solid oriented boxes for js/game/ground.js (houses, stalls)
//   P.circles   [{ x, z, r }]                             solid round things (fountain, wells)
//   P.trees     [{ art, x, z, y, rot, scale, r, h, crown }]  big trees in open ground between houses (scatter.js format;
//                                                        the crown clears every roof; the trunk is solid)
//   P.spots     { npcId: { at:[x,z], face } }             where a townsperson stands to work (stall, anvil, door)
//   P.graph     { nodes:[{x,z}], edges:[[a,b,len]] }       the street network the villagers walk
//   P.villagers [{ id, town, look, route:[{x,z,wait,act}] }] each walks its loop for ever (villagers.js, world clock)
//
// The rule that keeps it honest (lessons rule 25): a house is a rectangle tested against EVERY street corridor, pad,
// placed thing, NPC spot and other house before it is kept, along its whole footprint — never by its centre.

import { TREE_SPECIES } from './scatter.js';

export const CELL = 3;                  // one kit cell (a Kenney Fantasy Town piece) in metres; one storey is one cell tall

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickW = (r, table) => { const tot = table.reduce((s, [, w]) => s + w, 0); let x = r() * tot; for (const [v, w] of table) { if ((x -= w) <= 0) return v; } return table[table.length - 1][0]; };
const r2 = v => Math.round(v * 100) / 100;

/** Point along a dense road line at arc length s (clamped): { x, z, tx, tz } (unit tangent). */
function along(pts, s) {
  if (s <= 0) { const a = pts[0], b = pts[1]; const L = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: a.x, z: a.z, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L }; }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.s >= s) { const t = (s - a.s) / ((b.s - a.s) || 1); const L = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L }; }
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1]; const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: b.x, z: b.z, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L };
}
const segDist = (px, pz, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / L2)); return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t); };

/** An oriented box: centre, half sizes along its own x (hw) and z (hd), turned `facing` (three.js rotation.y). */
export function boxCorners(b, grow = 0) {
  const c = Math.cos(b.facing), s = Math.sin(b.facing), hw = b.hw + grow, hd = b.hd + grow;
  // local (lx, lz) → world: rotation.y by f maps local x to (cos f, -sin f) and local z to (sin f, cos f)
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c]);
}
/** World point → the box's own frame. */
export function toLocal(b, x, z) { const c = Math.cos(b.facing), s = Math.sin(b.facing), dx = x - b.x, dz = z - b.z; return [dx * c - dz * s, dx * s + dz * c]; }
/** Separating-axis test for two oriented boxes (shrunk by `slack` so terraced neighbours may touch). */
export function boxesOverlap(a, b, slack = 0.05) {
  const A = boxCorners(a, -slack), B = boxCorners(b, -slack);
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const p = P[i], q = P[(i + 1) % 4], nx = -(q[1] - p[1]), nz = q[0] - p[0];
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const v of A) { const d = v[0] * nx + v[1] * nz; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const v of B) { const d = v[0] * nx + v[1] * nz; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}
/** Sample points over a box (edges + inside, about every `step` m). */
function boxSamples(b, step = 1, grow = 0) {
  const out = [], nx = Math.max(1, Math.ceil((b.hw + grow) * 2 / step)), nz = Math.max(1, Math.ceil((b.hd + grow) * 2 / step));
  const c = Math.cos(b.facing), s = Math.sin(b.facing);
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
    const lx = -(b.hw + grow) + (2 * (b.hw + grow)) * i / nx, lz = -(b.hd + grow) + (2 * (b.hd + grow)) * k / nz;
    out.push([b.x + lx * c + lz * s, b.z - lx * s + lz * c]);
  }
  return out;
}

const DEFAULTS = {
  // roomier (owner 2026-11-25: "too crowded with incredibly narrow streets, and houses have no yards"): a front strip,
  // gaps and alleys more often, a yard kept for every house beyond the core (`core` = share of the radius that may be
  // solid terraces), detached houses beyond `outskirts`
  setback: 1.0, plinthMax: 2.6,
  widths: [[2, 5], [3, 3], [4, 1]], depths: [[2, 3], [3, 2]], storeys: [[1, 1], [2, 5], [3, 2]],
  gapEvery: [2, 4], alley: [3, 4.5], yard: [4, 9], yardMin: 4, core: 0.45, outskirts: 0.62, detachedGap: [2, 5],
};

export function planTowns(T, towns = {}, { placements = null, npcs = null } = {}) {
  const out = { houses: [], yards: [], fences: [], walls: [], props: [], boxes: [], circles: [], trees: [], spots: {}, graph: { nodes: [], edges: [] }, villagers: [], trace: globalThis.__townTrace ? {} : null };
  for (const [id, def] of Object.entries(towns)) if (!id.startsWith('_')) planOne(T, id, def, out, { placements, npcs });
  if (towns._travellers) planTravellers(T, towns._travellers, out);
  return out;
}

/**
 * Travellers on the long roads (owner 2026-11-25: "The world still feels empty"): nameless walkers like the villagers,
 * going out along a road and back, a rest at each end, kept to one side. Same plan everywhere (villagers.js draws them
 * near the camera on the world clock).
 */
function planTravellers(T, cfg, out) {
  const r = rng32(cfg.seed || 77);
  for (const [li, leg] of (cfg.roads || []).entries()) {
    const rd = T.roads.find(x => x.id === leg.road); if (!rd) continue;
    const len = rd.pts[rd.pts.length - 1].s, from = leg.from ?? 0, to = Math.min(len, leg.to ?? len);
    for (let n = 0; n < (leg.count || 2); n++) {
      const side = (r() < 0.5 ? 1 : -1) * (rd.width / 2 - 0.7), route = [];
      const step = 8, there = [];
      for (let s = from; s <= to; s += step) { const p = along(rd.pts, s); there.push({ x: r2(p.x - p.tz * side), z: r2(p.z + p.tx * side), wait: 0 }); }
      const back = [];
      for (let s = to; s >= from; s -= step) { const p = along(rd.pts, s); back.push({ x: r2(p.x + p.tz * side), z: r2(p.z - p.tx * side), wait: 0 }); }
      if (there.length < 2) continue;
      there[there.length - 1].wait = r2(15 + r() * 30); there[there.length - 1].act = 'talk';
      back[back.length - 1].wait = r2(15 + r() * 30); back[back.length - 1].act = 'idle';
      route.push(...there, ...back);
      out.villagers.push({ id: `road${li + 1}_${leg.road}_${n + 1}`, town: 'road', seed: Math.floor(r() * 1e9), speed: r2(1.2 + r() * 0.3), route, traveller: true });
    }
  }
}

function planOne(T, id, def, out, { placements, npcs }) {
  const place = T.places[id];
  if (!place) return;
  const cfg = { ...DEFAULTS, ...(def.rules || {}) };
  const r = rng32(def.seed || 1);
  const [cx, cz] = place.at;
  const radius = def.radius || place.radius;
  const streets = T.roads.filter(rd => rd.town === id || (def.streets || []).includes(rd.id));
  const allNear = T.roads.filter(rd => rd.pts.some(p => Math.hypot(p.x - cx, p.z - cz) < radius + 40));
  const pads = (T.places[id].pads || []).map(p => ({ x: p.at[0], z: p.at[1], hw: p.size[0] / 2, hd: p.size[1] / 2, facing: p.angle || 0, y: p.levelY, soft: p.soft ?? 2, front: !!p.front }));
  // keep-outs: everything placed by hand (buildings, props, shrines, chests, objects) and every person's spot
  const keep = [];
  const nearTown = (x, z, pad = 30) => Math.hypot(x - cx, z - cz) < radius + pad;
  if (placements) {
    for (const b of placements.buildings || []) if (nearTown(...b.at)) keep.push({ x: b.at[0], z: b.at[1], r: (b.footprint || 6) / 2 + 1.2 });
    for (const k of ['props', 'shrines', 'chests', 'objects']) for (const p of placements[k] || []) if (nearTown(...p.at)) keep.push({ x: p.at[0], z: p.at[1], r: (p.r || 1) + (k === 'shrines' ? 3 : 1) });
  }
  for (const s of def.spots || []) keep.push({ x: s.at[0], z: s.at[1], r: s.clear ?? 2.2 });
  for (const k of def.keep || []) keep.push({ x: k[0], z: k[1], r: k[2] });
  for (const st of def.stops || []) keep.push({ x: st.at[0], z: st.at[1], r: 1.8 });      // where villagers linger stays open
  if (npcs) for (const n of Object.values(npcs)) if (n.at && nearTown(...n.at) && !(def.spots || []).some(s => s.npc === n.id)) keep.push({ x: n.at[0], z: n.at[1], r: 1.6 });
  const stallsAt = (def.stalls || []).map(s => ({ x: s.at[0], z: s.at[1], hw: 1.8, hd: 1.3, facing: s.facing || 0 }));

  // own = the street a house fronts: it may stand right at that street's edge (a curve may poke in a hand's width);
  // every other street keeps its full clearance
  // only the segments near this town (a main road runs on for a kilometre), bucketed on an 8 m grid
  const segGrid = new Map(), SG = 8;
  for (const rd of allNear) for (let q = 0; q < rd.pts.length - 1; q++) {
    const a = rd.pts[q], b = rd.pts[q + 1];
    if (Math.hypot(a.x - cx, a.z - cz) > radius + 40) continue;
    const pad = rd.width / 2 + 3;
    for (let i = Math.floor((Math.min(a.x, b.x) - pad) / SG); i <= Math.floor((Math.max(a.x, b.x) + pad) / SG); i++)
      for (let k = Math.floor((Math.min(a.z, b.z) - pad) / SG); k <= Math.floor((Math.max(a.z, b.z) + pad) / SG); k++) {
        const key = i * 4096 + k; if (!segGrid.has(key)) segGrid.set(key, []); segGrid.get(key).push([rd, a, b]);
      }
  }
  const inRoad = (x, z, pad, own = null) => {
    for (const [rd, a, b] of segGrid.get(Math.floor(x / SG) * 4096 + Math.floor(z / SG)) || []) if (segDist(x, z, a, b) < rd.width / 2 + (rd === own ? -0.2 : pad)) return rd;
    return null;
  };
  const inPad = (x, z, pad = 0.6) => pads.some(p => { const [lx, lz] = toLocal(p, x, z); return Math.abs(lx) < p.hw + pad && Math.abs(lz) < p.hd + pad; });
  const inKeep = (x, z, pad = 0) => keep.some(k => Math.hypot(x - k.x, z - k.z) < k.r + pad);
  const mine = [];
  const why = out.why || (out.why = {});
  let tag = '';
  const no = k => { why[k] = (why[k] || 0) + 1; if (out.trace && tag) (out.trace[tag] = out.trace[tag] || []).push(k); return false; };
  const free = (b, { roadPad = 0.35, padPad = 0.6, keepPad = 0, slack = 0.05, sampleStep = 1, own = null } = {}) => {
    if (mine.some(h => boxesOverlap(h, b, slack))) return no('house');
    if (stallsAt.some(s => boxesOverlap(s, b, -0.5))) return no('stall');
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of boxSamples(b, sampleStep)) {
      if (Math.hypot(x - cx, z - cz) > radius) return no('radius');
      { const hit = inRoad(x, z, roadPad, own); if (hit) return no('road:' + hit.id); }
      if (inPad(x, z, padPad)) return no('pad');
      if (inKeep(x, z, keepPad)) return no('keep');
      if (!T.walkable(x, z) || T.waterAt(x, z)?.depth > -0.3) return no('ground');
      if (T.fieldAt?.(x, z)) return no('field');                    // a farm field is not a building plot (owner #125)
      const y = T.heightAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return { lo, hi };
  };

  // ---------------------------------------------------------------- 1. houses along every street, both sides
  const st = { ...(def.streetRules || {}) };
  // frontage lines: a square's edges first (houses face the square), then the streets, widest first
  const fronts = [];
  for (const p of pads) {
    if (!p.front) continue;
    const cs = boxCorners(p);
    for (let e = 0; e < 4; e++) {
      const a = cs[e], b = cs[(e + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // walk each edge so that "side" points out of the square: corners run anticlockwise on screen, outside = -1
      const pts = []; for (let i = 0; i <= Math.ceil(L); i++) { const t = i / Math.ceil(L); pts.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, s: L * t }); }
      fronts.push({ id: `${p.id || 'square'}_${e}`, class: 'square', width: 0, pts, squareEdge: true });
    }
  }
  const order = [...fronts, ...[...streets].sort((a, b) => b.width - a.width)];
  let n = 0;
  for (const rd of order) {
    const rule = { ...cfg, ...(st[rd.id] || st[rd.class] || {}) };
    if (rule.none) continue;
    const len = rd.pts[rd.pts.length - 1].s;
    for (const side of rd.squareEdge ? [squareSide(rd, pads)] : [-1, 1]) {
      if (rule.sides && !rule.sides.includes(side)) continue;
      let s = rule.startAt ?? 2, run = 0, nextGap = Math.floor(cfg.gapEvery[0] + r() * (cfg.gapEvery[1] - cfg.gapEvery[0] + 1));
      while (s < len - 2) {
        const wc = pickW(r, rule.widths), dc = pickW(r, rule.depths), W = wc * CELL, D = dc * CELL;
        const p0 = along(rd.pts, s), pm = along(rd.pts, s + W / 2), p1 = along(rd.pts, s + W);
        // the front follows the chord between the two ends (a curved lane gets slightly turned houses, like a real one)
        let tx = p1.x - p0.x, tz = p1.z - p0.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const nx = -tz * side, nz = tx * side;                 // away from the street on this side
        const off = rd.width / 2 + rule.setback + D / 2;
        const hx = pm.x + nx * off, hz = pm.z + nz * off;
        const facing = Math.atan2(nx, nz);                     // the front (-z of the model) looks back at the street: (-sin f, -cos f) = (-nx, -nz)
        const box = { x: hx, z: hz, hw: W / 2, hd: D / 2, facing };
        tag = `${rd.id}/${side}/${Math.round(s)}`;
        const ok = free(box, rd.squareEdge ? { padPad: 0.2 } : { own: rd });
        tag = '';
        if (!ok || ok.hi - ok.lo > rule.plinthMax) { s += 1; run = 0; continue; }
        const dist = Math.hypot(hx - cx, hz - cz);
        // beyond the core every house keeps a yard behind it: reserve it now, or this plot is not a house
        let yardBox = null;
        if (dist > radius * rule.core && !rd.squareEdge) {
          const Y = rule.yardMin, bx = Math.sin(facing), bz = Math.cos(facing);
          yardBox = { x: hx + bx * (D / 2 + Y / 2 + 0.05), z: hz + bz * (D / 2 + Y / 2 + 0.05), hw: W / 2 - 0.1, hd: Y / 2, facing };
          const yok = free(yardBox, { roadPad: 0.6, slack: 0.1 });
          if (!yok || yok.hi - yok.lo > 1.6) { s += 1; run = 0; continue; }
        }
        // outskirts: smaller, lower, detached; the middle: tall terraces
        const storeys = dist > radius * Math.max(cfg.outskirts, 0.8) ? Math.min(2, pickW(r, rule.storeys)) : pickW(r, rule.storeys);
        const roadY = T.heightAt(pm.x, pm.z);
        const floorY = r2(Math.max(ok.hi + 0.12, roadY + 0.12));
        const doorCell = wc <= 2 ? (r() < 0.5 ? 0 : 1) : 1 + Math.floor(r() * (wc - 2));
        const dlx = -W / 2 + CELL * (doorCell + 0.5);
        const fwd = [-nx, -nz], rgt = [tx * side * -1, tz * side * -1];
        // the door spot: on the street just outside the door (local -z is the front)
        const c = Math.cos(facing), sn = Math.sin(facing);
        const dl = [dlx, -D / 2 - 1.1];
        const door = { cell: doorCell, at: [r2(hx + dl[0] * c + dl[1] * sn), r2(hz - dl[0] * sn + dl[1] * c)] };
        const h = {
          id: `${id}_h${++n}`, town: id, at: [r2(hx), r2(hz)], w: W, d: D, facing: r2(facing) || 0, cells: [wc, dc], storeys,
          floorY, baseY: r2(ok.lo - 0.25), style: pickW(r, def.styles || [['timber', 3], ['stone', 2], ['plaster', 2]]),
          roof: Math.floor(r() * 4), plaster: Math.floor(r() * 4), door, street: rd.id,
          shop: !!(rule.shops && r() < rule.shops), jetty: storeys > 1 && r() < 0.45, chimney: r() < 0.8, seed: Math.floor(r() * 1e6),
        };
        mine.push(box); out.houses.push(h); out.boxes.push({ ...box, house: h.id });
        if (yardBox) { h.yardKept = yardBox; mine.push(yardBox); }
        s += W;
        run++;
        if (run >= nextGap) { s += cfg.alley[0] + r() * (cfg.alley[1] - cfg.alley[0]); run = 0; nextGap = Math.floor(cfg.gapEvery[0] + r() * (cfg.gapEvery[1] - cfg.gapEvery[0] + 1)); }
        else if (dist > radius * cfg.outskirts) s += cfg.detachedGap[0] + r() * (cfg.detachedGap[1] - cfg.detachedGap[0]);   // beyond the middle, houses stand apart
        void fwd; void rgt;
      }
    }
  }

  // ---------------------------------------------------------------- 2. back yards (fence + clutter) behind each house
  const yardKinds = def.yardProps || [['woodpile', 2], ['barrel', 3], ['crate', 3], ['sacks', 2], ['cart', 1], ['washing', 2], ['garden', 3], ['coop', 1]];
  for (const h of out.houses) {
    // (its own reserved strip is released while its yard is grown; a neighbour's stays taken)
    if (h.yardKept) { const i = mine.indexOf(h.yardKept); if (i >= 0) mine.splice(i, 1); }
    const c = Math.cos(h.facing), sn = Math.sin(h.facing);
    const back = [sn, c];                                       // local +z (away from the street) in world
    // the deepest yard that fits; failing all, the strip reserved with the house (worked out before its numbers were
    // rounded, so it is kept as it was)
    const tries = [];
    for (let Y = cfg.yard[1]; Y >= cfg.yard[0]; Y -= 1) tries.push(Y);
    if (h.yardKept) tries.push('kept');
    for (const T_ of tries) {
      let Y, yx, yz, yb, ok;
      if (T_ === 'kept') { yb = h.yardKept; Y = yb.hd * 2; yx = yb.x; yz = yb.z; ok = { lo: T.heightAt(yx, yz) }; }
      else {
        Y = T_; yx = h.at[0] + back[0] * (h.d / 2 + Y / 2 + 0.05); yz = h.at[1] + back[1] * (h.d / 2 + Y / 2 + 0.05);
        yb = { x: yx, z: yz, hw: h.w / 2 - 0.1, hd: Y / 2, facing: h.facing };
        ok = free(yb, { roadPad: 0.6, slack: 0.1 });
        if (!ok || ok.hi - ok.lo > 1.6) continue;
      }
      mine.push(yb);
      const yard = { at: [r2(yx), r2(yz)], w: h.w, d: Y, facing: h.facing, house: h.id, y: r2(ok.lo) };
      out.yards.push(yard);
      // fence on the three open sides; a gate gap in the far side
      const kind = pickW(r, def.fences || [['wood', 4], ['hedge', 2], ['stone', 2]]);
      const cs = boxCorners(yb);                                 // 0 (-x,-z) 1 (+x,-z) 2 (+x,+z) 3 (-x,+z); -z = house side
      const yAt = (x, z) => r2(T.heightAt(x, z));
      const seg = (a, b) => out.fences.push({ a: [r2(a[0]), r2(a[1])], b: [r2(b[0]), r2(b[1])], kind, y: yAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) });
      seg(cs[1], cs[2]); seg(cs[3], cs[0]);
      const g = 0.35 + r() * 0.3, gw = 1.3 / Math.max(2, h.w);
      const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      seg(cs[2], lerpP(cs[2], cs[3], g - gw)); seg(lerpP(cs[2], cs[3], g + gw), cs[3]);
      // clutter: 1-3 things along the inside of the yard
      const k = 1 + Math.floor(r() * 3);
      for (let i = 0; i < k; i++) {
        const kindP = pickW(r, yardKinds);
        const lx = (-0.5 + (i + 0.5) / k) * (h.w - 1.6), lz = (r() < 0.5 ? -1 : 1) * (Y / 2 - 1.1) * (0.4 + r() * 0.6);
        const px = yx + lx * c + lz * sn, pz = yz - lx * sn + lz * c;
        out.props.push({ kind: kindP, at: [r2(px), r2(pz)], facing: r2(h.facing + (r() - 0.5) * 0.6), y: yAt(px, pz), yard: true });
      }
      break;
    }
  }

  for (const h of out.houses) delete h.yardKept;

  // ---------------------------------------------------------------- 3. street furniture: lamps, barrels by shop doors, the square
  for (const rd of streets) {
    if (rd.width < 3.5) continue;
    const len = rd.pts[rd.pts.length - 1].s;
    let side = 1;
    for (let s = 6; s < len - 4; s += def.lampEvery || 17) {
      const p = along(rd.pts, s), nx = -p.tz * side, nz = p.tx * side;
      const x = p.x + nx * (rd.width / 2 + 0.25), z = p.z + nz * (rd.width / 2 + 0.25);
      if (Math.hypot(x - cx, z - cz) > radius - 2) continue;
      if (inPad(x, z, 0) || mine.some(m => toLocalIn(m, x, z, 0.3)) || inKeep(x, z, 0.5)) { side = -side; continue; }
      out.props.push({ kind: 'lantern', at: [r2(x), r2(z)], facing: 0, y: r2(T.heightAt(x, z)), lamp: true });
      side = -side;
    }
  }
  for (const h of out.houses) {
    if (!h.shop) continue;
    const c = Math.cos(h.facing), sn = Math.sin(h.facing);
    for (const [lx, kind] of [[-h.w / 2 + 0.7, r() < 0.5 ? 'barrel' : 'crate'], [h.w / 2 - 0.7, r() < 0.5 ? 'crate' : 'sacks']]) {
      const lz = -h.d / 2 - 0.55, x = h.at[0] + lx * c + lz * sn, z = h.at[1] - lx * sn + lz * c;
      if (!inRoad(x, z, 0.1)) out.props.push({ kind, at: [r2(x), r2(z)], facing: h.facing, y: r2(T.heightAt(x, z)) });
    }
  }
  for (const s of def.stalls || []) {
    out.props.push({ kind: s.kind || 'stall', at: s.at, facing: s.facing || 0, y: r2(T.heightAt(...s.at)), colour: s.colour });
    out.boxes.push({ x: s.at[0], z: s.at[1], hw: 1.45, hd: 0.7, facing: s.facing || 0, stall: true });
  }
  for (const p of def.props || []) {
    out.props.push({ ...p, y: r2(T.heightAt(...p.at)), facing: p.facing || 0 });
    if (p.solid) out.circles.push({ x: p.at[0], z: p.at[1], r: p.solid });
  }

  // ---------------------------------------------------------------- 4. terrace walls: where a pad stands over the ground round it
  for (const p of pads) {
    const cs = boxCorners(p, 0.15);
    for (let e = 0; e < 4; e++) {
      const a = cs[e], b = cs[(e + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.ceil(L);
      // outward normal of this edge
      const ex = (b[0] - a[0]) / L, ez = (b[1] - a[1]) / L;
      let onx = ez, onz = -ex; { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if ((mx - p.x) * onx + (mz - p.z) * onz < 0) { onx = -onx; onz = -onz; } }
      let run = null;
      const flush = () => { if (run && run.n >= 2) out.walls.push({ a: run.a, b: run.b, y0: r2(run.lo), y1: r2(p.y + 0.45), pad: true }); run = null; };
      for (let i = 0; i <= steps; i++) {
        const x = a[0] + ex * L * i / steps, z = a[1] + ez * L * i / steps;
        const below = T.heightAt(x + onx * (p.soft + 0.3), z + onz * (p.soft + 0.3));
        const drop = p.y - below;
        if (drop > 0.55 && !inRoad(x, z, 1.2) && !inRoad(x + onx * p.soft, z + onz * p.soft, 1.2)) {
          if (!run) run = { a: [r2(x), r2(z)], b: [r2(x), r2(z)], lo: below, n: 0 };
          run.b = [r2(x), r2(z)]; run.lo = Math.min(run.lo, below); run.n++;
        } else flush();
      }
      flush();
    }
  }
  for (const w of out.walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    out.boxes.push({ x: (w.a[0] + w.b[0]) / 2, z: (w.a[1] + w.b[1]) / 2, hw: L / 2, hd: 0.25, facing: Math.atan2(-(w.b[1] - w.a[1]), w.b[0] - w.a[0]), wall: true });
  }

  // ---------------------------------------------------------------- 4b. a few big trees in open ground (crown clear of every roof)
  const treeKinds = def.trees || [['oak-a', 2], ['birch', 2], ['oak-b', 1]];
  const placedT = [];
  for (let k = 0; k < (def.treeTries ?? 220) && placedT.length < (def.treeCount ?? 10); k++) {
    const a = r() * Math.PI * 2, d = radius * (0.25 + 0.72 * Math.sqrt(r())), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const art = pickW(r, treeKinds), sp = TREE_SPECIES[art], scale = 0.95 + r() * 0.25, crown = sp.crown * scale, trunk = sp.trunk * scale;
    if (inRoad(x, z, trunk + 1.2) || inPad(x, z, crown * 0.5) || inKeep(x, z, crown * 0.6) || !T.walkable(x, z)) continue;
    if (out.boxes.some(b => toLocalIn(b, x, z, crown + 0.4)) || mine.some(b => toLocalIn(b, x, z, trunk + 0.6))) continue;
    if (placedT.some(t => Math.hypot(t.x - x, t.z - z) < (t.crown + crown) * 0.9)) continue;
    const t = { art, x: r2(x), z: r2(z), y: r2(T.heightAt(x, z)), rot: r2(r() * 6.283), scale: r2(scale), r: r2(trunk), h: r2(sp.h * scale), crown: r2(crown), town: id };
    placedT.push(t); out.trees.push(t);
  }

  // ---------------------------------------------------------------- 5. people's work spots
  for (const s of def.spots || []) if (s.npc) out.spots[s.npc] = { at: s.at, face: s.face ?? 0, idle: s.idle || null, town: id };

  // ---------------------------------------------------------------- 6. the street graph + villagers
  buildGraph(out, streets, id, cx, cz, radius + 6);
  makeVillagers(out, id, def, r);
}
/** Which side of a square's edge is outside the square. */
function squareSide(rd, pads) {
  const a = rd.pts[0], b = rd.pts[rd.pts.length - 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const tx = b.x - a.x, tz = b.z - a.z, nx = -tz, nz = tx;          // side +1 normal
  const p = pads.find(q => Math.hypot(q.x - mx, q.z - mz) < Math.hypot(q.hw, q.hd) + 1) || pads[0];
  return (mx - p.x) * nx + (mz - p.z) * nz > 0 ? 1 : -1;            // the side whose normal points away from the middle
}
function toLocalIn(b, x, z, pad) { const [lx, lz] = toLocal(b, x, z); return Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad; }

/** Street sample points every ~6 m as nodes; consecutive points joined; ends within 3.5 m of any node joined (junctions). */
function buildGraph(out, streets, town, cx, cz, reach) {
  const G = out.graph, base = G.nodes.length;
  const lines = [];
  for (const rd of streets) {
    const len = rd.pts[rd.pts.length - 1].s, k = Math.max(1, Math.round(len / 6));
    let ids = [];
    const end = () => { if (ids.length > 1) lines.push(ids); ids = []; };
    for (let i = 0; i <= k; i++) {
      const p = along(rd.pts, len * i / k);
      if (Math.hypot(p.x - cx, p.z - cz) > reach) { end(); continue; }      // only the part of a long road inside the town
      const id = G.nodes.length; G.nodes.push({ x: r2(p.x), z: r2(p.z), town, road: rd.id, half: rd.width / 2 });
      if (ids.length) G.edges.push([ids[ids.length - 1], id, r2(len / k)]);
      ids.push(id);
    }
    end();
  }
  // a connector may not cut through a house
  const blocked = (a, b) => { const A = G.nodes[a], B = G.nodes[b], n = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.5); for (let i = 0; i <= n; i++) { const x = A.x + (B.x - A.x) * i / n, z = A.z + (B.z - A.z) * i / n; if (out.boxes.some(bx => toLocalIn(bx, x, z, 0.3))) return true; } return false; };
  // where two streets cross mid-way (neither ends there), join their closest points
  for (let li = 0; li < lines.length; li++) for (let lj = li + 1; lj < lines.length; lj++) {
    let best = null;
    for (const a of lines[li]) for (const b of lines[lj]) { const d = Math.hypot(G.nodes[a].x - G.nodes[b].x, G.nodes[a].z - G.nodes[b].z); if (d < 4.5 && (!best || d < best[2])) best = [a, b, d]; }
    if (best && !blocked(best[0], best[1])) G.edges.push([best[0], best[1], r2(best[2])]);
  }
  for (const ids of lines) for (const e of [ids[0], ids[ids.length - 1]]) {
    let best = -1, bd = 3.5;
    for (let j = base; j < G.nodes.length; j++) {
      if (ids.includes(j)) continue;
      const d = Math.hypot(G.nodes[j].x - G.nodes[e].x, G.nodes[j].z - G.nodes[e].z);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0 && !blocked(e, best)) G.edges.push([e, best, r2(bd)]);
    else {   // a junction onto the middle of another street: nearest node of any other line within 7 m
      let b2 = -1, d2 = 7;
      for (const other of lines) if (other !== ids) for (const j of other) { const d = Math.hypot(G.nodes[j].x - G.nodes[e].x, G.nodes[j].z - G.nodes[e].z); if (d < d2) { d2 = d; b2 = j; } }
      if (b2 >= 0 && !blocked(e, b2)) G.edges.push([e, b2, r2(d2)]);
    }
  }
}

/** Shortest path on the graph (Dijkstra; towns are small). */
export function graphPath(G, from, to) {
  const n = G.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  // (rebuilt when another town has added streets since; kept off the plan's JSON)
  if (!G._adj || G._adj.length !== n || G._adjE !== G.edges.length) { const a = Array.from({ length: n }, () => []); for (const [p, q, w] of G.edges) { a[p].push([q, w]); a[q].push([p, w]); } Object.defineProperty(G, '_adj', { value: a, writable: true, configurable: true }); Object.defineProperty(G, '_adjE', { value: G.edges.length, writable: true, configurable: true }); }
  const adj = G._adj;
  dist[from] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  if (!Number.isFinite(dist[to])) return null;
  const path = []; for (let v = to; v >= 0; v = prev[v]) path.unshift(v);
  return path;
}
function nearestNode(G, x, z, town) { let best = -1, bd = Infinity; G.nodes.forEach((p, i) => { if (p.town !== town) return; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i; } }); return best; }

const ACTS = [['idle', 5], ['talk', 2], ['look', 1]];
function makeVillagers(out, town, def, r) {
  const G = out.graph, count = def.villagers ?? 12;
  const homes = out.houses.filter(h => h.town === town);
  const stops = [...homes.map(h => ({ at: h.door.at, kind: 'door' })), ...(def.stops || []).map(s => ({ at: s.at, kind: s.kind || 'square', face: s.face }))];
  if (!stops.length || !G.nodes.length) return;
  for (let v = 0; v < count; v++) {
    const route = [];
    let cur = stops[Math.floor(r() * stops.length)];
    const first = cur, legs = 6 + Math.floor(r() * 4);
    const keepRight = (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6);
    for (let l = 0; l <= legs; l++) {
      const next = l === legs ? first : r() < 0.45 && def.stops?.length ? (() => { const s = def.stops[Math.floor(r() * def.stops.length)]; return { at: s.at, kind: s.kind || 'square', face: s.face }; })() : stops[Math.floor(r() * stops.length)];
      const a = nearestNode(G, ...cur.at, town), b = nearestNode(G, ...next.at, town);
      const path = a >= 0 && b >= 0 ? graphPath(G, a, b) : null;
      if (!path) continue;
      // walk: door → the street → along it (kept to one side) → the street by the next stop → the stop
      const pts = path.map(i => G.nodes[i]);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        let tx = q.x - o.x, tz = q.z - o.z; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
        const k = Math.min(keepRight, Math.max(0, p.half - 0.5));
        route.push({ x: r2(p.x - tz * k), z: r2(p.z + tx * k), wait: 0 });
      }
      const act = next.kind === 'door' ? 'idle' : pickW(r, ACTS);
      route.push({ x: next.at[0], z: next.at[1], wait: r2(next.kind === 'door' ? 4 + r() * 10 : 8 + r() * 22), act, face: next.face ?? null });
      cur = next;
    }
    if (route.length > 2) out.villagers.push({ id: `${town}_v${v + 1}`, town, seed: Math.floor(r() * 1e9), speed: r2(1.15 + r() * 0.35), route });
  }
}
