// The automatic dispatcher (PLAN M3, ROAST 1.8: no micromanagement). PURE.
//
// Defaults do everything — the player never sends a porter anywhere:
//   * the HQ pool WANTS everything (so whatever a camp digs comes home);
//   * every other pool OFFERS everything above its reserve (what its own producers need + its "keep here");
//   * a producer PULLS its recipe's inputs (and fuel) into its own pool, from the nearest pool that offers them;
//   * a depot's optional "keep here" { res: n } pulls that much from the HQ and holds it.
// Each `economy.every` ticks the dispatcher turns wants and offers into JOBS and gives each to the nearest idle
// carrier (porters walk anywhere; a mule cart is chosen when it would move the load faster per unit, which in practice
// means a road runs most of the way). Nothing teleports (§0.9): a job is a vehicle entity walking a route to the
// source door, loading, walking to the destination door and unloading — the goods are on the vehicle (its `cargo`)
// the whole way, and an attack on it (M4) can take them.
//
// Vehicle fields (§3.2): { type: 'porter'|'cart', line: null, cargo: {res: n}, state: 'moving'|'loading'|'waiting',
//   home (building id), job: { from, to, res, n } | null, phase }.

import { SUB } from '../entities.js';
import { cellsPerTick } from './paths.js';

const sq = (v) => v * v;

export function createDispatcher(sim) {
  const D = sim.data, S = sim.stores;
  const inbound = new Map();   // poolId → { res: n } booked to arrive
  const outbound = new Map();  // poolId → { res: n } booked to leave
  const bump = (map, p, r, n) => { const o = map.get(p) || {}; o[r] = (o[r] || 0) + n; if (o[r] <= 0) delete o[r]; map.set(p, o); };
  const got = (map, p, r) => map.get(p)?.[r] || 0;
  const unreachable = new Map(); // "from>to:kind" → tick when it may be tried again

  /** What a pool must keep for itself (its producers' inputs and fuel, its keep-here). */
  function reserve(p, r) {
    let n = 0;
    for (const b of sim.ents.list('building')) {
      if (b.built < 1 || S.poolOf(b.id) !== p) continue;
      const def = D.B[b.type];
      if (def.recipes && b.recipe) {
        const rc = D.RECIPE[b.recipe];
        if (rc.in?.[r]) n += rc.in[r] * D.econ.inputBatches;
        if (rc.fuel?.[r]) n += rc.fuel[r] * D.econ.inputBatches;
      }
      if (def.power?.fuel?.[r]) n += def.power.fuel[r] * D.econ.inputBatches;
      if (b.keepHere?.[r]) n += b.keepHere[r];
    }
    return n;
  }
  const avail = (p, r) => S.stock(p, r) - reserve(p, r) - got(outbound, p.id, r) - (p.hq ? Math.max(0, sim.committed[r] || 0) : 0);

  /** Every want this tick, most urgent first: [{ to: pool, res, n, kind }]. */
  function wants() {
    const out = [];
    const pools = S.pools;
    // 1. producers' inputs and fuel, into their own pool
    for (const b of sim.ents.list('building')) {
      if (b.built < 1) continue;
      const def = D.B[b.type];
      const p = S.poolOf(b.id);
      if (!p) continue;
      const need = {};
      if (def.recipes && b.recipe && b.wants !== false) {
        const rc = D.RECIPE[b.recipe];
        for (const [r, n] of Object.entries(rc.in || {})) need[r] = (need[r] || 0) + n * D.econ.inputBatches;
        if (rc.fuel) { const f = sim.production.pickFuel(rc.fuel, p); const f2 = anyHas(f) ? f : Object.keys(rc.fuel).find(anyHas) || f; need[f2] = (need[f2] || 0) + rc.fuel[f2] * D.econ.inputBatches; }
      }
      if (def.power?.fuel && sim.power.demand > sim.power.supply - (b.running ? def.power.supply : 0)) {
        const f = Object.keys(def.power.fuel).find(anyHas) || Object.keys(def.power.fuel)[0];
        need[f] = (need[f] || 0) + def.power.fuel[f] * D.econ.inputBatches;
      }
      for (const [r, n] of Object.entries(b.keepHere || {})) need[r] = (need[r] || 0) + n;
      for (const [r, n] of Object.entries(need)) {
        const short = n - S.stock(p, r) - got(inbound, p.id, r);
        if (short > 0) out.push({ to: p, res: r, n: short, kind: 'input' });
      }
    }
    // 2. the HQ wants everything other pools offer
    const hq = S.hqPool();
    if (hq) for (const p of pools) {
      if (p === hq) continue;
      for (const r of D.resList) {
        const a = avail(p, r);
        if (a <= 0) continue;
        const full = S.space(p) < D.econ.minLoad;
        if (a >= D.econ.minLoad || full || p.kindPile) out.push({ from: p, to: hq, res: r, n: a, kind: 'home' });
      }
    }
    return out;
  }
  const anyHas = (r) => S.pools.some((p) => S.stock(p, r) > 0);

  function idleCarriers() { return sim.ents.list('vehicle').filter((v) => !v.job && !v.route && !v.retire); }

  function assign(job, idle) {
    // source: given, or the nearest pool that can spare it
    let from = job.from;
    const to = job.to;
    if (!from) {
      let best = null, bd = Infinity;
      for (const p of S.pools) {
        if (p === to || avail(p, job.res) <= 0) continue;
        const d = sq(p.x - to.x) + sq(p.y - to.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) return 0;
      from = best;
    }
    const n0 = Math.min(job.n, avail(from, job.res));
    if (n0 <= 0) return 0;
    const fd = S.doorNear(from, to.x, to.y), td = S.doorNear(to, from.x, from.y);
    // pick the carrier that gets the load there soonest per unit (nearest of each kind, then compare)
    let best = null;
    for (const kind of ['porter', 'cart']) {
      const cands = idle.filter((v) => v.type === kind);
      if (!cands.length) continue;
      const near = cands.reduce((a, v) => { const d = sq(v.x / SUB - fd[0]) + sq(v.y / SUB - fd[1]); return !a || d < a.d ? { v, d } : a; }, null).v;
      const key = `${fd[2]}>${td[2]}:${kind}`;
      if ((unreachable.get(key) || 0) > sim.tick) continue;
      const leg = sim.paths.find(fd[0], fd[1], td[0], td[1], near.vrow);
      if (!leg) { unreachable.set(key, sim.tick + 400); continue; }
      const n = Math.min(n0, near.vrow.capacity);
      const toSrc = Math.sqrt(sq(near.x / SUB - fd[0]) + sq(near.y / SUB - fd[1])) / cellsPerTick(near.vrow);
      const perUnit = (leg.ticks + toSrc + 2 * near.vrow.load) / n;
      if (!best || perUnit < best.perUnit) best = { v: near, n, leg, perUnit };
    }
    if (!best) return 0;
    const v = best.v;
    const toFrom = sim.paths.find(Math.floor(v.x / SUB), Math.floor(v.y / SUB), fd[0], fd[1], v.vrow);
    if (!toFrom) return 0;
    v.job = { from: from.id, to: to.id, fromDoor: fd, toDoor: td, res: job.res, n: best.n, kind: job.kind };
    v.phase = 'toPickup'; v.idleSince = 0;
    bump(outbound, from.id, job.res, best.n); bump(inbound, to.id, job.res, best.n);
    sim.movers.go(v, toFrom);
    idle.splice(idle.indexOf(v), 1);
    return best.n;
  }

  function poolById(id) { return S.pools.find((p) => p.id === id) || null; }

  function release(v) {
    if (!v.job) return;
    const j = v.job;
    if (v.phase === 'toPickup' || v.phase === 'loading') bump(outbound, j.from, j.res, -j.n);
    bump(inbound, j.to, j.res, -j.n);
  }

  /** Per-tick: drive each vehicle's job forward when it arrives somewhere. */
  function stepVehicles() {
    for (const v of sim.ents.list('vehicle')) {
      if (v.blocked) { v.blocked = false; reroute(v); continue; }
      if (v.route) continue;
      const j = v.job;
      if (!j) {
        v.idleSince = v.idleSince || sim.tick;
        if (v.retire) { sim.ents.remove(v.id); sim.dirty.add(v.id); continue; }
        if (sim.tick - v.idleSince > D.econ.idleHome) {
          const home = sim.ents.get(v.home) || S.hqPool()?.members[0];
          if (home && (Math.abs(v.x / SUB - home.door[0]) > 1.5 || Math.abs(v.y / SUB - home.door[1]) > 1.5)) {
            const r = sim.paths.find(Math.floor(v.x / SUB), Math.floor(v.y / SUB), home.door[0], home.door[1], v.vrow);
            if (r) sim.movers.go(v, r);
          }
          v.idleSince = sim.tick;
        }
        continue;
      }
      if (v.phase === 'toPickup') { v.phase = 'loading'; v.state = 'loading'; v.wait = v.vrow.load; continue; }
      if (v.phase === 'loading') {
        if (--v.wait > 0) continue;
        const from = poolById(j.from), to = poolById(j.to);
        bump(outbound, j.from, j.res, -j.n);
        const n = from ? S.take(from, j.res, j.n) : 0;
        if (!n || !to) { bump(inbound, j.to, j.res, -j.n); v.job = null; v.phase = null; v.state = 'waiting'; continue; }
        if (n < j.n) { bump(inbound, j.to, j.res, n - j.n); j.n = n; }
        v.cargo = { [j.res]: n };
        j.loadedAt = sim.tick; j.loadedPos = [v.x / SUB, v.y / SUB];
        const r = sim.paths.find(j.fromDoor[0], j.fromDoor[1], j.toDoor[0], j.toDoor[1], v.vrow);
        if (!r) { j.stuck = true; v.phase = 'toDrop'; continue; }
        v.phase = 'toDrop'; sim.movers.go(v, r);
        sim.carriedDirty = true;
        continue;
      }
      if (v.phase === 'toDrop') { v.phase = 'unloading'; v.state = 'loading'; v.wait = v.vrow.load; continue; }
      if (v.phase === 'unloading') {
        if (--v.wait > 0) continue;
        const to = poolById(j.to);
        bump(inbound, j.to, j.res, -j.n);
        let n = v.cargo[j.res] || 0;
        const put = to ? S.put(to, j.res, n) : 0;
        n -= put;
        sim.deliveries.push({ id: v.id, type: v.type, res: j.res, n: put, from: j.loadedPos, to: [v.x / SUB, v.y / SUB], loadedAt: j.loadedAt, at: sim.tick });
        if (sim.deliveries.length > 200) sim.deliveries.shift();
        if (n > 0) {
          // the destination filled up: carry the rest to the HQ (or leave it as a pile at the door)
          const hq = S.hqPool();
          if (hq && to !== hq) {
            const td = S.doorNear(hq, v.x / SUB, v.y / SUB);
            const r = sim.paths.find(Math.floor(v.x / SUB), Math.floor(v.y / SUB), td[0], td[1], v.vrow);
            if (r) { v.cargo = { [j.res]: n }; v.job = { ...j, to: hq.id, toDoor: td, n }; bump(inbound, hq.id, j.res, n); v.phase = 'toDrop'; sim.movers.go(v, r); continue; }
          }
          sim.dropPile(v.x / SUB, v.y / SUB, { [j.res]: n });
        }
        v.cargo = {}; v.job = null; v.phase = null; v.state = 'waiting'; v.idleSince = sim.tick;
        sim.carriedDirty = true;
        continue;
      }
    }
  }

  function reroute(v) {
    const j = v.job;
    const dest = !j ? null : (v.phase === 'toPickup' ? j.fromDoor : j.toDoor);
    if (!dest) return;
    const r = sim.paths.find(Math.floor(v.x / SUB), Math.floor(v.y / SUB), dest[0], dest[1], v.vrow);
    if (r) sim.movers.go(v, r);
    else { release(v); if (v.cargo && Object.keys(v.cargo).length) sim.dropPile(v.x / SUB, v.y / SUB, v.cargo); v.cargo = {}; v.job = null; v.phase = null; }
  }

  /** Every economy tick: turn wants into jobs. */
  function dispatch() {
    const idle = idleCarriers();
    if (!idle.length) return;
    const list = wants();
    // inputs first (keep the machines running), then the haul home, biggest first
    list.sort((a, b) => (a.kind === 'input' ? 0 : 1) - (b.kind === 'input' ? 0 : 1) || b.n - a.n);
    for (const job of list) {
      if (!idle.length) break;
      // a big want can take several carriers
      for (let k = 0; k < 6 && idle.length && job.n > 0; k++) {
        const n = assign(job, idle);
        if (!n) break;
        job.n -= n;
        if (job.kind === 'home' && job.n < D.econ.minLoad) break;
      }
    }
  }

  return { dispatch, stepVehicles, wants, reserve, avail, inbound, outbound, release }; // release: M4 (a carrier lost on the road gives its bookings back)
}
