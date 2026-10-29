// Raids (PLAN M4). PURE.
//
// A nest whose raid timer runs out FORMS a raid: it picks the loudest thing in its reach that enemies may damage
// (the building putting the most Noise out; the nearest damageable one if nothing is making a sound), builds a flow
// field to it (js/world/flow.js, a few ticks at a time) and the console is told at once: the raid, its target and its
// PREDICTED PATH, which the scope draws for the whole warning time (60-120 s). Then the party leaves the nest and walks
// the field: wading fords, going round deep water, lava and cliffs, preferring roads, and — where the way round costs
// more than breaking through — chewing the section of wall that is weakest (a section's price in the field is its
// hit points, so the most damaged one is the cheapest). When the target falls they look for the next loudest thing
// in reach; with nothing left, or after `giveUp` ticks without reaching anything, they walk home.
// A raid record is JSON-safe (its fields are kept off the record): { id, nest, target, state, born, leaveAt,
//   toSpawn: [types], members: [ids], path, announced, spotted, atWall, guards }   state: forming | marching | withdrawing

import { SUB } from '../entities.js';
import { EDGE, ROAD, BRIDGE, OWNED } from '../../world/grid.js';
import { createFlowField, BLOCK } from '../../world/flow.js';
import { canDamage } from './targets.js';
import { hyp, dir, powi } from './maths.js';

export function createRaids(sim, DD) {
  const { g, M } = sim.world;
  const W = g.W, H = g.H;
  const bal = DD.bal.raid;
  const rng = sim.rng.split('defence.raids');
  const raids = [];
  const fields = new Map();   // raid id → { field, next, home, homeNext, builtAt, ver, wide }
  let nextId = 1;
  const PART = sim.defence.walls.PART;
  const fam = DD.F.skitterkin;
  const chew = bal.chew ?? 0.2;

  const get = (id) => raids.find((r) => r.id === id) || null;
  function targetOf(r) {
    const t = r.target && sim.ents.get(r.target);
    return t && !t.removed && t.kind === 'building' && t.built >= 1 ? t : null;
  }

  /** What a raid from nest n goes for: the loudest building in reach it may damage, else the nearest. */
  function pickTarget(n, from = null) {
    const [nx, ny] = [n.x / SUB, n.y / SUB];
    const reach = DD.stage(n.stage).reach;
    const fx = from ? from[0] : nx, fy = from ? from[1] : ny;
    let loud = null, near = null, far = null;
    for (const b of sim.ents.list('building')) {
      if (!canDamage(sim, b, { team: 1 })) continue;
      const d = hyp(b.fp.cx - nx, b.fp.cy - ny);
      const dn = hyp(b.fp.cx - fx, b.fp.cy - fy);
      if (d > reach) { if (d <= reach * DD.bal.raid.farReach && (!far || d < far.d)) far = { b, d }; continue; }
      const lv = sim.defence.fields.buildingNoise(b);
      if (lv > 0 && (!loud || lv > loud.lv || (lv === loud.lv && dn < loud.d))) loud = { b, lv, d: dn };
      if (!near || dn < near.d) near = { b, d: dn };
    }
    // nothing in reach: a hungry nest sends its party further, at the nearest thing it may damage
    return (loud || near || (from ? null : far))?.b || null;
  }

  function scaledParty(n) {
    const st = DD.stage(n.stage);
    const diff = sim.defence.diff;
    const day = sim.clock.dayAt(sim.tick);
    const k = diff.raid * (1 + DD.N.perDay * Math.max(0, day - 1));
    const out = [];
    for (const [type, c] of Object.entries(st.raid)) { const m = Math.max(type === 'skitter' ? 1 : 0, Math.round(c * k)); for (let i = 0; i < m; i++) out.push(type); }
    // a mixed column: the big ones in the middle
    out.sort((a, b) => (DD.E[a].hp - DD.E[b].hp) || a.localeCompare(b));
    return out;
  }

  /** A nest forms a raid (nests.js calls this when its timer runs out). Returns the raid or null. */
  function form(n, opts = {}) {
    if (sim.defence.over) return null;
    if (sim.ents.list('enemy').length >= bal.maxEnemies) return null;
    const t = opts.target || pickTarget(n);
    if (!t) return null;
    const warn = opts.warn ?? bal.warn[0] + rng.int(bal.warn[1] - bal.warn[0] + 1);
    const r = { id: nextId++, nest: n.id, target: t.id, state: 'forming', born: sim.tick, leaveAt: sim.tick + warn, toSpawn: opts.members ? [] : scaledParty(n), members: [], path: null, announced: false, spotted: false, atWall: false, guards: !!opts.members, hits: 0, lost: 0 };
    raids.push(r);
    if (opts.members) for (const e of opts.members) { e.raid = r.id; e.state = 'march'; r.members.push(e.id); }
    fields.set(r.id, { field: null, next: null, home: null, homeNext: null, builtAt: -1e9, ver: -1, wide: false });
    return r;
  }

  /** The nest's guards come out for a tower that is shooting it. */
  function defend(n, from) {
    if (!from || raids.some((r) => r.guards && r.nest === n.id && r.state !== 'withdrawing')) return null;
    const b = sim.ents.get(from);
    if (!b || !canDamage(sim, b, { team: 1 })) return null;
    const guards = sim.ents.list('enemy').filter((e) => e.nest === n.id && e.state === 'guard' && !e.raid);
    if (!guards.length) return null;
    return form(n, { target: b, warn: 0, members: guards });
  }

  // ---- fields -------------------------------------------------------------------------------------------------------

  /** Who owns each building cell (for the cost function): row-major cell → building. */
  function owners() {
    const m = new Map();
    for (const b of sim.ents.list('building')) { const f = b.fp; for (let y = f.y0; y < f.y0 + f.h; y++) for (let x = f.x0; x < f.x0 + f.w; x++) m.set(y * W + x, b); }
    return m;
  }

  /** The price of stepping into (x, y) for a Skitterkin walker heading for `goal` cells. */
  function costFn(goalSet) {
    const own = owners();
    const walls = sim.defence.walls;
    return (x, y) => {
      const k = y * W + x;
      if (goalSet && goalSet.has(k)) return 1;
      const c = g.cells[g.idx(x, y)];
      if (c & EDGE) return Infinity;
      const m = c & 255;
      if (PART[m]) {
        const code = walls.sectionCodeAt(k);
        const v = code !== undefined && walls.get(Math.floor(code / 4096));
        const s = v && v.sections[code % 4096];
        return BLOCK + (s && s.state === 'up' ? s.hp : walls.maxHp()) * chew;
      }
      if ((c & OWNED) && !M.walk[m]) {
        const b = own.get(k);
        if (b && canDamage(sim, b, { team: 1 })) return BLOCK + Math.max(1, b.hp) * chew;
        return Infinity;
      }
      const w = (c & BRIDGE) ? 100 : M.walk[m];
      if (!w) return Infinity;
      let cost = 100 / w;
      if (c & (ROAD | BRIDGE)) cost /= fam.road;
      return cost;
    };
  }

  function boxOf(a, b, wide) {
    if (wide) return [0, 0, W - 1, H - 1];
    const m = bal.margin;
    return [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m];
  }

  function startField(r, F) {
    const n = sim.ents.get(r.nest), t = targetOf(r);
    if (!n || !t) return;
    const goals = [], gs = new Set();
    const f = t.fp;
    for (let y = f.y0; y < f.y0 + f.h; y++) for (let x = f.x0; x < f.x0 + f.w; x++) { goals.push([x, y]); gs.add(y * W + x); }
    F.next = createFlowField({ W, H, box: boxOf([n.x / SUB, n.y / SUB], [f.cx, f.cy], F.wide), goals, cost: costFn(gs) });
    F.nextVer = sim.defence.blockVer;
  }
  function startHome(r, F) {
    const n = sim.ents.get(r.nest);
    const goals = [];
    let from = null;
    if (n) {
      for (const p of sim.defence.nests.exits(n)) goals.push(p);
      from = [n.x / SUB, n.y / SUB];
    } else {
      // the nest is gone: walk back to where they came out
      const e = sim.ents.get(r.members[0]);
      if (e) goals.push(e.home);
      from = e ? e.home : [W / 2, H / 2];
    }
    const centre = membersCentre(r) || from;
    F.homeNext = createFlowField({ W, H, box: boxOf(from, centre, F.homeWide), goals, cost: costFn(null) });
  }
  function membersCentre(r) {
    let sx = 0, sy = 0, n = 0;
    for (const id of r.members) { const e = sim.ents.get(id); if (e) { sx += e.x / SUB; sy += e.y / SUB; n++; } }
    return n ? [sx / n, sy / n] : null;
  }

  // ---- the per-tick step ---------------------------------------------------------------------------------------------

  function step() {
    let budget = bal.fieldBudget;
    for (const r of [...raids]) {
      const F = fields.get(r.id);
      const n = sim.ents.get(r.nest);
      if (r.state !== 'withdrawing') {
        // the target fell: the next loudest thing in reach, or home
        if (!targetOf(r)) {
          const c = membersCentre(r);
          const t = n && !r.guards ? pickTarget(n, c) : null;
          if (t) { r.target = t.id; F.field = null; F.next = null; F.builtAt = -1e9; }
          else { withdraw(r); continue; }
        }
        const refresh = (F.ver !== sim.defence.blockVer || r.stale) && sim.tick - F.builtAt >= bal.refresh;
        if (!F.next && (!F.field || refresh)) { r.stale = false; startField(r, F); }
        if (F.next && budget > 0) {
          const before = F.next.settled;
          const done = F.next.step(budget);
          budget -= F.next.settled - before;
          if (done) {
            const ex = spawnPoint(r, n);
            if (ex && F.next.at(ex[0], ex[1]) === Infinity && !F.wide) { F.wide = true; F.next = null; continue; }
            if (ex && F.next.at(ex[0], ex[1]) === Infinity) { cancel(r); continue; }
            F.field = F.next; F.ver = F.nextVer; F.next = null; F.builtAt = sim.tick;
            if (ex) r.path = thin(F.field.path(ex[0], ex[1], 6000));
          }
        }
        if (!F.field) continue;
        if (!r.announced) announce(r, n);
        if (r.state === 'forming' && sim.tick >= r.leaveAt) {
          if (!r.toSpawn.length) r.state = 'marching';
          else if ((sim.tick - r.leaveAt) % bal.spawnEvery === 0) {
            const type = r.toSpawn.shift();
            const p = spawnPoint(r, n, r.toSpawn.length);
            if (p) { const e = sim.defence.enemies.spawn(type, p[0], p[1], { raid: r.id, nest: r.nest, state: 'march' }); r.members.push(e.id); }
            if (!r.toSpawn.length) r.state = 'marching';
          }
        }
        if (r.state === 'marching') {
          if (!r.spotted && sim.tick % 10 === 0) spotCheck(r);
          if (!r.members.length && !r.toSpawn.length) { beaten(r); continue; }
          if (!r.guards && sim.tick - r.leaveAt > bal.giveUp && !r.hits) withdraw(r);
        }
      } else {
        if (!F.homeNext && !F.home) startHome(r, F);
        if (F.homeNext && budget > 0) {
          const before = F.homeNext.settled;
          const done = F.homeNext.step(budget);
          budget -= F.homeNext.settled - before;
          if (done) { F.home = F.homeNext; F.homeNext = null; }
        }
        if (!r.members.length) { drop(r); continue; }
        if (F.home && sim.tick - r.withdrewAt > bal.giveUp) {
          // could not get home: they dig in where they are (out of the game)
          for (const id of [...r.members]) { const e = sim.ents.get(id); if (e) sim.defence.enemies.remove(e); }
          drop(r);
        }
      }
    }
  }

  function spawnPoint(r, n, k = 0) {
    if (!n) { const e = sim.ents.get(r.members[0]); return e ? [Math.floor(e.x / SUB), Math.floor(e.y / SUB)] : null; }
    const ex = sim.defence.nests.exits(n);
    if (!ex.length) return null;
    // the exit facing the target first, then fanned out round it
    const t = targetOf(r);
    let best = 0;
    if (t) { let bd = Infinity; ex.forEach(([x, y], i) => { const d = (x - t.fp.cx) ** 2 + (y - t.fp.cy) ** 2; if (d < bd) { bd = d; best = i; } }); }
    const j = (best + ((k % 5) - 2) + ex.length) % ex.length;
    return ex[j];
  }

  const thin = (path) => path.filter((_, i) => i % 6 === 0 || i === path.length - 1);

  function announce(r, n) {
    r.announced = true;
    const t = targetOf(r);
    const [x, y] = n ? [n.x / SUB, n.y / SUB] : [0, 0];
    sim.events.push({
      e: 'raidForming', tick: sim.tick, base: sim.base, raid: r.id, nest: r.nest, target: r.target, guards: r.guards,
      what: t ? sim.data.B[t.type].name : '', n: r.toSpawn.length + r.members.length, x: Math.round(x), y: Math.round(y),
      tx: t ? Math.round(t.fp.cx) : null, ty: t ? Math.round(t.fp.cy) : null, eta: Math.max(0, r.leaveAt - sim.tick), path: r.path,
    });
  }

  function spotCheck(r) {
    for (const id of r.members) {
      const e = sim.ents.get(id);
      if (!e) continue;
      const x = Math.floor(e.x / SUB), y = Math.floor(e.y / SUB);
      if (g.fog[g.qIdx(x, y)] === 2) {
        r.spotted = true;
        if (!r.guards) sim.events.push({ e: 'raidSpotted', tick: sim.tick, base: sim.base, raid: r.id, x, y, n: r.members.length });
        return;
      }
    }
  }

  function atWall(id, e) {
    const r = get(id);
    if (!r) return;
    r.hits++;
    if (r.atWall) return;
    r.atWall = true;
    sim.events.push({ e: 'raidAtWall', tick: sim.tick, base: sim.base, raid: r.id, x: Math.round(e.x / SUB), y: Math.round(e.y / SUB), n: r.members.length });
  }

  function withdraw(r) {
    if (r.state === 'withdrawing') return;
    const wasOut = r.members.length > 0;
    r.state = 'withdrawing'; r.withdrewAt = sim.tick; r.toSpawn = [];
    const F = fields.get(r.id); F.field = null; F.next = null;
    if (!wasOut) { drop(r); return; }
    const c = membersCentre(r);
    if (!r.guards) sim.events.push({ e: 'raidWithdrew', tick: sim.tick, base: sim.base, raid: r.id, x: c ? Math.round(c[0]) : 0, y: c ? Math.round(c[1]) : 0, n: r.members.length });
  }
  /** A raider got home: back into the mound (guards go back to guarding). */
  function home(r, e) {
    const n = sim.ents.get(r.nest);
    if (r.guards && n) { e.raid = null; e.state = 'guard'; r.members = r.members.filter((id) => id !== e.id); return; }
    if (n) n.fed = Math.min(1, n.fed + 0.02);
    sim.defence.enemies.remove(e);
  }
  function beaten(r) {
    if (!r.guards) sim.events.push({ e: 'raidBeaten', tick: sim.tick, base: sim.base, raid: r.id, x: r.path?.length ? r.path[r.path.length - 1][0] : 0, y: r.path?.length ? r.path[r.path.length - 1][1] : 0 });
    drop(r);
  }
  function cancel(r) {
    for (const id of [...r.members]) { const e = sim.ents.get(id); if (e) { if (r.guards) { e.raid = null; e.state = 'guard'; } else sim.defence.enemies.remove(e); } }
    sim.events.push({ e: 'raidCancelled', tick: sim.tick, base: sim.base, raid: r.id, why: 'no way through' });
    drop(r);
  }
  function drop(r) {
    const i = raids.indexOf(r);
    if (i >= 0) raids.splice(i, 1);
    fields.delete(r.id);
    sim.events.push({ e: 'raidOver', tick: sim.tick, base: sim.base, raid: r.id });
  }
  function stale(r) { r.stale = true; }

  return {
    form, defend, step, get, list: () => raids, targetOf, costFn, pickTarget, atWall, withdraw, home, stale,
    fieldOf: (id) => fields.get(id)?.field || null, homeOf: (id) => fields.get(id)?.home || null,
    get count() { return raids.length; },
    // flow.js hands raiders a field per raid; enemies.js reads it through the raid record
  };
}
