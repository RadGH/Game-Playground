// Roads in the sim (PLAN M3, §0.5–0.6: one road kind, a road over shallow water is a bridge). PURE.
//
// drawRoad → planRoad (js/world/vectors.js: smooth, join, price, refuse) → a vector RECORD with `spans` that builders
// lay (js/sim/economy/construction.js). Only the laid part is cells: `laid` is the list of [a, b] distance ranges
// along the line that are down, and those — and only those — are what js/render/roads.js draws as road.
// Road vector record (§3.2 + M3): { id, kind: 'road', base, pts, closed: false, len, bridge, spans: [{ a, b, done,
//   builder, need, delivered, at? }], laid: [[a, b]], placed }.
//
// Extension points for later milestones:
//   sim.hooks.roadPlanned(plan)  — M4 offers a gate where a road meets a wall (`plan.pts`, after joining).
//   sim.levels.bridge / .road    — global levels (M9/M10 raise them); `reach` follows the Bridge level.

import { planRoad, polyLength, rasterLine } from '../../world/vectors.js';
import { ROAD, BRIDGE } from '../../world/grid.js';

export function createRoads(sim) {
  const { g, M, vectors } = sim.world;
  const D = sim.data;
  const byId = new Map();

  const reach = () => new Set((D.road.reach[String(Math.min(3, sim.levels.bridge || 1))] || ['shallow']).map((id) => M.id[id]));

  function list() { return vectors.list.filter((v) => v.kind === 'road'); }
  function doors() { return sim.ents.list('building').map((b) => [b.door[0], b.door[1], b.id]); }

  function plan(raw) {
    return planRoad({ cellAt: (x, y) => g.cells[g.idx(x, y)], W: g.W, H: g.H, M, cfg: D.road, levels: sim.levels, roads: list(), doors: doors() }, raw);
  }

  /** Accept a plan: the blueprint goes down at once and builders are on their way. */
  function add(p) {
    const v = vectors.addRecord('road', p.pts, false, { base: sim.base, len: polyLength(p.pts), bridge: p.bridge, laid: [], placed: sim.tick, cost: p.cost });
    v.spans = sim.construction.spansFor(v, p);
    byId.set(v.id, v);
    for (const [r, n] of Object.entries(p.cost)) sim.committed[r] = (sim.committed[r] || 0) + n;
    sim.sites.push({ kind: 'road', id: v.id });
    sim.vectorsDirty.add(v.id);
    for (const h of sim.hooks.roadPlanned) h(p, v);
    return v;
  }

  function mergeLaid(v, a, b) {
    const L = v.laid;
    L.push([a, b]);
    L.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const r of L) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], r[1]); else out.push([r[0], r[1]]); }
    v.laid = out;
  }

  /** Lay distance a..b of a road: those cells become road / bridge now. */
  function lay(v, a, b) {
    if (b <= a) return;
    vectors.applyPart(v, Math.max(0, a - 0.01), b, { reach: reach() });
    mergeLaid(v, a, b);
    sim.vectorsDirty.add(v.id);
  }

  /** Take a whole road, or the part from..to of it, away (CLEAR tool / undo). */
  function erase(id, from = 0, to = Infinity) {
    const v = byId.get(id);
    if (!v) return false;
    const L = v.len;
    from = Math.max(0, from); to = Math.min(L, to);
    // clear the road flags under every laid road, then lay back what is still there (roads that share cells keep them)
    const clear = (x, y) => { const i = g.idx(x, y); const c = g.cells[i]; if (c & (ROAD | BRIDGE)) { g.cells[i] = (c & ~(ROAD | BRIDGE)) >>> 0; g.ver[i >>> 12]++; } };
    for (const r of list()) for (const [a, b] of r.laid) { const pts = cutPolylineSafe(r, a, b); if (pts.length >= 2) rasterLine(pts, vectors.widths.road, false, clear, g.W, g.H); }
    vectors.remove(id); byId.delete(id);
    sim.vectorsDirty.add(id);
    const keep = [];
    if (from > 0.5) keep.push([0, from]);
    if (to < L - 0.5) keep.push([to, L]);
    for (const [a, b] of keep) {
      const pts = cutPolylineSafe(v, a, b).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
      if (pts.length < 2 || polyLength(pts) < D.road.minLen) continue;
      const nv = vectors.addRecord('road', pts, false, { base: v.base, len: polyLength(pts), bridge: 0, laid: [], placed: v.placed, cost: {} });
      nv.spans = sim.construction.spansFor(nv, { cost: {} });
      for (const sp of nv.spans) sp.need = {};
      // carry over what was laid
      for (const [la, lb] of v.laid) {
        const s = Math.max(la, a), e = Math.min(lb, b);
        if (e > s) nv.laid.push([s - a, e - a]);
      }
      for (const sp of nv.spans) if (nv.laid.some(([la, lb]) => la <= sp.a + 0.01 && lb >= sp.b - 0.01)) sp.done = true;
      byId.set(nv.id, nv);
      sim.vectorsDirty.add(nv.id);
      if (nv.spans.some((s) => !s.done)) sim.sites.push({ kind: 'road', id: nv.id });
    }
    // committed bridge timber that will now never be used
    for (const sp of v.spans) for (const [r, n] of Object.entries(sp.need)) { const left = n - (sp.delivered[r] || 0); if (left > 0 && !sp.done) sim.committed[r] = Math.max(0, (sim.committed[r] || 0) - left); }
    for (const w of sim.ents.list('worker')) if (w.task?.road === id) { w.task = null; w.phase = null; w.route = null; }
    for (const r of list()) for (const [a, b] of r.laid) vectors.applyPart(r, Math.max(0, a - 0.01), b, { reach: reach() });
    sim.routeVer++;
    sim.construction.prune();
    return true;
  }
  const cutPolylineSafe = (v, a, b) => { const pts = []; const n = Math.max(2, Math.ceil((b - a) / 2) + 1); for (let i = 0; i < n; i++) pts.push(pointAtLocal(v.pts, a + ((b - a) * i) / (n - 1))); return pts; };
  function pointAtLocal(pts, d) {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const l = Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
      if (d <= l || i === pts.length - 1) { const t = l ? Math.max(0, Math.min(1, d / l)) : 0; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }
      d -= l;
    }
    return [pts[0][0], pts[0][1]];
  }

  /** The road nearest cell (x, y) within r cells: { v, at, d } or null. */
  function near(x, y, r) {
    let best = null;
    for (const v of list()) {
      let acc = 0;
      for (let i = 1; i < v.pts.length; i++) {
        const a = v.pts[i - 1], b = v.pts[i];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
        let t = l2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = a[0] + dx * t - x, py = a[1] + dy * t - y, d = Math.sqrt(px * px + py * py);
        if (d <= r && (!best || d < best.d)) best = { v, at: acc + l * t, d };
        acc += l;
      }
    }
    return best;
  }

  return { plan, add, lay, erase, list, near, get: (id) => byId.get(id), reach };
}
