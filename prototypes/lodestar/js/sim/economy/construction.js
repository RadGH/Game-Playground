// Builders and building sites, roads included (PLAN M3: "builders as entities that walk to sites"; "blueprint placed
// at once, builders lay it fast"). PURE.
//
// SITES are worked in the order they were placed (`sim.sites`). A building site needs its cost carried in — a builder
// walks to the nearest pool that has the material, loads up to its capacity, walks to the site door and drops it —
// then `work` builder-ticks on site. A ROAD is a blueprint split into SPANS of `SPAN` cells: a builder claims the next
// span whose start it can stand on (so a bridge grows out from the bank), fetches the timber a bridge span needs,
// then walks the span laying it: the cells it has passed become road (or bridge) as it goes. Builders are workers,
// not vehicles: they carry only for their own sites and the dispatcher never uses them.
//
// Worker fields (§3.2 `worker`): { type: 'builder', task: {...} | null, cargo: {res: n}, state, home }.

import { SUB } from '../entities.js';
import { walkable } from '../../world/edges.js';
import { pointAt, polyLength } from '../../world/vectors.js';
import { cellsPerTick } from '../logistics/paths.js';

export const SPAN = 24;

export function createConstruction(sim) {
  const { g, M } = sim.world;
  const D = sim.data, S = sim.stores;
  const maxOnBuilding = 2;

  function siteList() {
    const out = [];
    for (const s of sim.sites) {
      if (s.kind === 'building') { const b = sim.ents.get(s.id); if (b && b.built < 1) out.push({ kind: 'building', b }); }
      else if (s.kind === 'wall') { const v = sim.defence?.walls.get(s.id); if (v && sim.defence.walls.sites().includes(v)) out.push({ kind: 'wall', v }); } // M4
      else { const v = sim.roads.get(s.id); if (v && v.spans.some((p) => !p.done)) out.push({ kind: 'road', v }); }
    }
    return out;
  }
  function prune() { sim.sites = sim.sites.filter((s) => s.kind === 'building' ? sim.ents.get(s.id)?.built < 1 : s.kind === 'wall' ? sim.defence?.walls.sites().some((v) => v.id === s.id) : sim.roads.get(s.id)?.spans.some((p) => !p.done)); }

  const remaining = (need, delivered, incoming, r) => (need[r] || 0) - (delivered[r] || 0) - (incoming[r] || 0);

  /** Nearest pool holding at least one unit of r (stock in stores; builders may take committed goods — they are
   *  what the commitment was for). */
  function sourceFor(r, x, y) {
    let best = null, bd = Infinity;
    for (const p of S.pools) {
      if (S.stock(p, r) <= 0) continue;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function walkTo(w, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    let goal = [tx, ty];
    if (!g.inside(tx, ty) || !walkable(M, g.cells[g.idx(tx, ty)])) goal = nearestWalkable(tx, ty, 6);
    if (!goal) return false;
    const r = sim.paths.find(Math.floor(w.x / SUB), Math.floor(w.y / SUB), goal[0], goal[1], w.vrow);
    if (!r) return false;
    sim.movers.go(w, r);
    return true;
  }
  function nearestWalkable(x, y, R) {
    for (let d = 1; d <= R; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const xx = x + dx, yy = y + dy;
      if (g.inside(xx, yy) && walkable(M, g.cells[g.idx(xx, yy)])) return [xx, yy];
    }
    return null;
  }

  /** Give an idle builder something to do. */
  function pickTask(w) {
    for (const s of siteList()) {
      if (s.kind === 'wall') { if (sim.defence.walls.claim(w, s.v)) return true; continue; } // M4: walls lay themselves through js/sim/defence/walls.js
      if (s.kind === 'building') {
        const b = s.b, def = D.B[b.type];
        for (const r of Object.keys(b.need)) {
          if (remaining(b.need, b.delivered, b.incoming, r) <= 0) continue;
          const p = sourceFor(r, b.fp.cx, b.fp.cy);
          if (!p) { setSiteLamp(b, `waiting for ${D.R[r].name.toLowerCase()}`); continue; }
          const door = S.doorNear(p, w.x / SUB, w.y / SUB);
          w.task = { kind: 'fetch', site: b.id, res: r, pool: p.id, door, n: Math.min(w.vrow.capacity, remaining(b.need, b.delivered, b.incoming, r)) };
          b.incoming[r] = (b.incoming[r] || 0) + w.task.n; // booked so two builders do not fetch the same timber
          if (walkTo(w, door[0], door[1]) && reachable(b, w)) { w.phase = 'toStore'; return true; }
          b.incoming[r] -= w.task.n; w.task = null; w.route = null;
          if (!reachable(b, w)) { setSiteLamp(b, 'the builders cannot get there'); continue; }
        }
        const allIn = Object.keys(b.need).every((r) => (b.delivered[r] || 0) >= b.need[r]);
        if (allIn) {
          setSiteLamp(b, null);
          const on = sim.ents.list('worker').filter((x) => x.task?.kind === 'work' && x.task.site === b.id).length;
          if (on >= maxOnBuilding) continue;
          w.task = { kind: 'work', site: b.id };
          if (walkTo(w, b.door[0], b.door[1])) { w.phase = 'toSite'; return true; }
          w.task = null;
        }
        if (def) continue;
      } else {
        const v = s.v;
        for (let i = 0; i < v.spans.length; i++) {
          const sp = v.spans[i];
          if (sp.done || sp.builder) continue;
          const [sx, sy] = pointAt(v.pts, sp.a);
          const fx = Math.floor(sx + 0.5), fy = Math.floor(sy + 0.5);
          // a span is laid from its start: the start must be ground you can stand on (or road already laid)
          if (!g.inside(fx, fy) || !walkable(M, g.cells[g.idx(fx, fy)])) continue;
          sp.builder = w.id;
          w.task = { kind: 'span', road: v.id, span: i };
          const short = Object.keys(sp.need).find((r) => (sp.delivered[r] || 0) < sp.need[r]);
          if (short) {
            const p = sourceFor(short, sx, sy);
            if (!p) { sp.builder = null; w.task = null; v.waiting = `waiting for ${D.R[short].name.toLowerCase()}`; continue; }
            const door = S.doorNear(p, w.x / SUB, w.y / SUB);
            w.task.fetch = { res: short, pool: p.id, door, n: Math.min(w.vrow.capacity, sp.need[short] - (sp.delivered[short] || 0)) };
            if (walkTo(w, door[0], door[1])) { w.phase = 'toStore'; return true; }
          } else if (walkTo(w, fx, fy)) { w.phase = 'toSpan'; return true; }
          sp.builder = null; w.task = null;
        }
      }
    }
    return false;
  }

  /** Can builders walk from where this one stands to the site's door? (cached by the route search) */
  function reachable(b, w) {
    return !!sim.paths.find(Math.floor(w.x / SUB), Math.floor(w.y / SUB), b.door[0], b.door[1], w.vrow);
  }
  function setSiteLamp(b, why) { if (b.lamps.input !== why) { b.lamps.input = why; sim.dirty.add(b.id); } }

  function drop(w) {
    // a builder whose site went away takes its load back to the nearest store
    const r = Object.keys(w.cargo || {})[0];
    if (!r) { w.task = null; w.phase = null; return; }
    const p = S.hqPool() || S.pools[0];
    if (!p) { sim.dropPile(w.x / SUB, w.y / SUB, w.cargo); w.cargo = {}; w.task = null; return; }
    const door = S.doorNear(p, w.x / SUB, w.y / SUB);
    w.task = { kind: 'return', pool: p.id, door };
    if (walkTo(w, door[0], door[1])) w.phase = 'toStore';
    else { sim.dropPile(w.x / SUB, w.y / SUB, w.cargo); w.cargo = {}; w.task = null; w.phase = null; }
  }

  function stepWorker(w) {
    if (w.task?.kind === 'wall') { if (!w.route) sim.defence.walls.workerStep(w); return; } // M4
    if (w.blocked) { w.blocked = false; const t = w.task; w.task = null; w.phase = null; release(w, t); return; }
    if (w.phase === 'lay') return layStep(w);
    if (w.route) return;
    const t = w.task;
    if (!t) {
      if (pickTask(w)) return;
      // nothing to build: walk home and wait
      w.idleSince = w.idleSince || sim.tick;
      if (sim.tick - w.idleSince > D.econ.idleHome) {
        const home = sim.ents.get(w.home);
        if (home && (Math.abs(w.x / SUB - home.door[0]) > 1.5 || Math.abs(w.y / SUB - home.door[1]) > 1.5)) walkTo(w, home.door[0], home.door[1]);
        w.idleSince = sim.tick;
      }
      return;
    }
    w.idleSince = 0;
    if (w.phase === 'loading') { if (--w.wait > 0) return; return afterLoad(w); }
    if (w.phase === 'toStore') { w.phase = 'loading'; w.wait = w.vrow.load; return; }
    if (w.phase === 'toSite') return atSite(w);
    if (w.phase === 'toSpan') { w.phase = 'lay'; return; }
    if (w.phase === 'work') return workStep(w);
  }

  function afterLoad(w) {
    const t = w.task;
    if (t.kind === 'return') {
      const p = S.pools.find((x) => x.id === t.pool);
      for (const [r, n] of Object.entries(w.cargo)) { const put = p ? S.put(p, r, n) : 0; if (put < n) sim.dropPile(w.x / SUB, w.y / SUB, { [r]: n - put }); }
      w.cargo = {}; w.task = null; w.phase = null; return;
    }
    if (t.kind === 'fetch') {
      const b = sim.ents.get(t.site);
      const p = S.pools.find((x) => x.id === t.pool);
      if (!b || b.built >= 1) { w.task = null; w.phase = null; return; }
      const n = p ? S.take(p, t.res, t.n) : 0;
      b.incoming[t.res] -= t.n - n; // what was not there is no longer on its way
      sim.committed[t.res] = Math.max(0, (sim.committed[t.res] || 0) - n);
      if (!n) { w.task = null; w.phase = null; return; }
      w.cargo = { [t.res]: n }; t.n = n;
      sim.carriedDirty = true;
      if (walkTo(w, b.door[0], b.door[1])) w.phase = 'toSite'; else drop(w);
      return;
    }
    if (t.kind === 'span') {
      const v = sim.roads.get(t.road), sp = v?.spans[t.span];
      const f = t.fetch, p = S.pools.find((x) => x.id === f.pool);
      if (!sp) return drop(w);
      const n = p ? S.take(p, f.res, f.n) : 0;
      if (!n) { sp.builder = null; w.task = null; w.phase = null; return; }
      w.cargo = { [f.res]: n };
      sim.committed[f.res] = Math.max(0, (sim.committed[f.res] || 0) - n);
      sim.carriedDirty = true;
      const [sx, sy] = pointAt(v.pts, sp.a);
      if (walkTo(w, sx + 0.5, sy + 0.5)) w.phase = 'toSpan'; else drop(w);
    }
  }

  function atSite(w) {
    const t = w.task, b = sim.ents.get(t.site);
    if (!b || b.built >= 1) { if (w.cargo && Object.keys(w.cargo).length) return drop(w); w.task = null; w.phase = null; return; }
    if (t.kind === 'fetch') {
      const n = w.cargo[t.res] || 0;
      b.delivered[t.res] = (b.delivered[t.res] || 0) + n;
      b.incoming[t.res] = Math.max(0, (b.incoming[t.res] || 0) - n);
      w.cargo = {}; w.task = null; w.phase = null;
      sim.dirty.add(b.id); sim.carriedDirty = true;
      return;
    }
    w.phase = 'work';
  }

  function workStep(w) {
    const b = sim.ents.get(w.task.site);
    if (!b || b.built >= 1) { w.task = null; w.phase = null; return; }
    const def = D.B[b.type];
    b.work += sim.hooks.workFactor(b);
    if ((sim.tick & 15) === 0) sim.dirty.add(b.id);
    if (b.work >= def.work) {
      sim.buildings.complete(b);
      for (const x of sim.ents.list('worker')) if (x.task?.site === b.id) { x.task = null; x.phase = null; }
      prune();
    }
  }

  function layStep(w) {
    const t = w.task, v = sim.roads.get(t.road), sp = v?.spans[t.span];
    if (!sp) { w.phase = null; return drop(w); }
    // the timber a bridge span needs is used as it is carried onto the span
    for (const [r, n] of Object.entries(w.cargo || {})) { sp.delivered[r] = (sp.delivered[r] || 0) + n; }
    w.cargo = {};
    const short = Object.keys(sp.need).find((r) => (sp.delivered[r] || 0) < sp.need[r]);
    if (short) { sp.builder = null; w.task = null; w.phase = null; return; }
    const speed = Math.min(1 / D.road.layTicks, cellsPerTick(w.vrow) * w.vrow.road) * sim.hooks.workFactor(null);
    const from = sp.at ?? sp.a;
    const to = Math.min(sp.b, from + speed);
    sim.roads.lay(v, from, to);
    sp.at = to;
    const [x, y] = pointAt(v.pts, to);
    w.x = Math.round((x + 0.5) * SUB); w.y = Math.round((y + 0.5) * SUB);
    if (to >= sp.b) {
      sp.done = true; sp.builder = null; sp.at = sp.b;
      sim.roadVer = (sim.roadVer || 0) + 1;
      w.task = null; w.phase = null;
      if (v.spans.every((p) => p.done)) { sim.events.push({ e: 'built', tick: sim.tick, base: sim.base, id: v.id, type: 'road', name: v.bridge > 0 ? 'Road and bridge' : 'Road', x: Math.round(x), y: Math.round(y), len: v.len }); prune(); }
    }
  }

  function release(w, t) {
    if (!t) return;
    if (t.kind === 'fetch') { const b = sim.ents.get(t.site); if (b && w.phase !== 'toSite') b.incoming[t.res] = Math.max(0, (b.incoming[t.res] || 0) - t.n); }
    if (t.kind === 'span') { const v = sim.roads.get(t.road); if (v?.spans[t.span]) v.spans[t.span].builder = null; }
    if (w.cargo && Object.keys(w.cargo).length) drop(w);
  }

  function step() { for (const w of sim.ents.list('worker')) stepWorker(w); }

  /** Split a road blueprint into spans and price each one. */
  function spansFor(v, plan) {
    const L = polyLength(v.pts);
    const n = Math.max(1, Math.ceil(L / SPAN));
    const spans = [];
    for (let i = 0; i < n; i++) spans.push({ a: (L * i) / n, b: (L * (i + 1)) / n, done: false, builder: null, need: {}, delivered: {} });
    // bridge cost: per span, by how much of it is over water
    const steps = Math.ceil(L * 2);
    for (let s = 0; s < steps; s++) {
      const d = (L * (s + 0.5)) / steps;
      const [x, y] = pointAt(v.pts, d);
      const c = g.cells[g.idx(Math.floor(x + 0.5), Math.floor(y + 0.5))];
      if (M.water[c & 255] || M.hot[c & 255]) {
        const sp = spans[Math.min(n - 1, Math.floor(d / (L / n)))];
        for (const [r, k] of Object.entries(D.road.bridgeCost)) sp.need[r] = (sp.need[r] || 0) + (k * L) / steps;
      }
    }
    for (const sp of spans) for (const r of Object.keys(sp.need)) sp.need[r] = Math.ceil(sp.need[r] - 1e-9);
    // keep the planned total exact (rounding per span may differ by one)
    for (const [r, n0] of Object.entries(plan.cost)) {
      let sum = spans.reduce((a, sp) => a + (sp.need[r] || 0), 0);
      for (let i = spans.length - 1; i >= 0 && sum > n0; i--) { const k = Math.min(spans[i].need[r] || 0, sum - n0); spans[i].need[r] -= k; sum -= k; }
    }
    return spans;
  }

  return { step, siteList, prune, spansFor, release };
}
