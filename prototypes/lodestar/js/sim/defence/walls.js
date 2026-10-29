// Walls and gates (PLAN M4, §0.5, §0.8). PURE.
//
// ONE wall kind. A wall is a vector record (§3.2) drawn as a smooth line and SIMULATED as cells: the cells within
// `vectors.wall.width` of its centre line (js/world/vectors.js rasterLine — the same rule the scope's wall field draws).
// The line is cut into 4 m SECTIONS, each with its own hit points; every cell of the wall belongs to exactly one
// section (the one its nearest point on the line falls in), so damage to a cell is damage to its section.
//
// Wall record: { id, kind: 'wall', base, pts, closed, len, placed, sections: [{ i, a, b, state, hp, gate, need,
//   delivered, builder, patch, lastHit }] }   state: 'plan' (blueprint) | 'up' | 'broken' | 'gone' (cleared)
//
// The blueprint goes down at once; builders carry the (small) cost and lay a few sections per trip
// (js/sim/economy/construction.js hands any builder whose task is a wall to `workerStep` here). Global Wall level
// (upgrades.json): every standing wall cell is re-stamped with that level's material and every section's hit points
// scale to the new maximum — the walls drawn before the level-up included. Fire follows the material: Wall I is
// timber and burns (a section loses `fireDamage` per burning cell every pass), Wall II and up do not.
// A broken section turns to rubble (or back to the water it stood in); once no enemy has been near for a while the
// blueprint brings the builders back to rebuild it, and to patch worn ones.
// GATES: a section flagged `gate` is stamped as gate cells — own people and carts walk through, enemies treat it as
// wall. A road that crosses a wall gets a gate there by itself; WALL tap on a wall adds one; CLEAR on a gate seals it.

import { SUB } from '../entities.js';
import { OWNED, BURN, SCORCH, ROAD, BRIDGE, WET, EDGE } from '../../world/grid.js';
import { rasterLine, nearestOn, pointAt, polyLength, cutPolyline, planWall, wallParts, canHoldWall, crossings } from '../../world/vectors.js';
import { walkable, floodMask } from '../../world/edges.js';
import { hyp, dir, powi } from './maths.js';

export function createWalls(sim, DD) {
  const { g, M, vectors } = sim.world;
  const cfg = DD.wall;
  const PART = wallParts(M);
  const W = g.W, H = g.H;
  const byId = new Map();
  const sectionAt = new Map();   // row-major cell → wallId * 4096 + section
  const under = new Map();       // row-major cell → the cell value before any wall stood there
  const cellsOf = new Map();     // wallId → [Int32Array of row-major cells per section]
  const gateMat = M.id.gate, rubble = M.id.rubble;
  const rng = sim.rng.split('defence.walls');
  const lastDamaged = new Map();

  const level = () => sim.levels.wall || 1;
  const lv = () => DD.wallLevel(level());
  const maxHp = () => lv().hp;
  const loopPts = (v) => v.closed ? [...v.pts, v.pts[0]] : v.pts;
  const list = () => vectors.list.filter((v) => v.kind === 'wall');
  const mid = (v, s) => pointAt(loopPts(v), (s.a + s.b) / 2);
  const rowIdx = (x, y) => y * W + x;

  function plan(raw, straight = false) {
    return planWall({ cellAt: (x, y) => g.cells[g.idx(x, y)], W, H, M, cfg, walls: list(), straight }, raw);
  }

  /** Accept a plan: the blueprint (every section) goes down at once and the builders are told. */
  function add(p) {
    const v = vectors.addRecord('wall', p.pts, p.closed, { base: sim.base, len: polyLength(p.pts, p.closed), placed: sim.tick });
    const n = Math.max(1, p.sections), L = v.len;
    const per = {};
    for (const [r, k] of Object.entries(cfg.cost || {})) per[r] = Math.max(0, Math.ceil((k * L) / n - 1e-9));
    v.sections = [];
    for (let i = 0; i < n; i++) v.sections.push({ i, a: (L * i) / n, b: (L * (i + 1)) / n, state: 'plan', hp: 0, gate: false, need: { ...per }, delivered: {}, builder: null, patch: false, lastHit: -1e9 });
    byId.set(v.id, v);
    assignCells(v);
    for (const s of v.sections) for (const [r, k] of Object.entries(s.need)) sim.committed[r] = (sim.committed[r] || 0) + k;
    sim.sites.push({ kind: 'wall', id: v.id });
    // a road that already crosses the new wall gets a gate in it
    for (const r of sim.roads.list()) gatesWhereCrossed(v, r.pts, r.id);
    sim.vectorsDirty.add(v.id);
    return v;
  }

  /** Give every cell of the wall's band to the section its nearest point on the line falls in. */
  function assignCells(v) {
    const pts = loopPts(v), n = v.sections.length, L = v.len;
    const per = v.sections.map(() => []);
    // exactly the cells whose centre is within the wall width of the line (the scope's wall field draws the same test)
    const r = vectors.widths.wall, r2 = r * r, R = Math.ceil(r) + 1;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const [x, y] of pts) { if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
    for (let y = Math.max(0, by0 - R); y <= Math.min(H - 1, by1 + R); y++) for (let x = Math.max(0, bx0 - R); x <= Math.min(W - 1, bx1 + R); x++) {
      const nr = nearestOn(pts, x, y);
      if (nr.d2 > r2) continue;
      const k = rowIdx(x, y);
      if (sectionAt.has(k)) continue; // a junction: the wall that was there first keeps it
      const i = Math.max(0, Math.min(n - 1, Math.floor((nr.at / L) * n)));
      sectionAt.set(k, v.id * 4096 + i);
      per[i].push(k);
    }
    cellsOf.set(v.id, per.map((a) => Int32Array.from(a)));
  }

  /** The wall piece holding row-major cell (x, y): { kind: 'section', wall, i } or null. */
  function pieceAt(x, y) {
    const code = sectionAt.get(rowIdx(x, y));
    if (code === undefined) return null;
    const v = byId.get(Math.floor(code / 4096));
    return v ? { kind: 'section', wall: v, i: code % 4096 } : null;
  }
  const sectionCodeAt = (k) => sectionAt.get(k);

  function setCell(k, c) {
    const x = k % W, y = (k / W) | 0, i = g.idx(x, y);
    if (g.cells[i] !== c) { g.cells[i] = c >>> 0; g.ver[i >>> 12]++; }
  }

  /** Stamp a standing section's cells with the level's material (or gate). */
  function stamp(v, s) {
    const mat = s.gate ? gateMat : M.id[lv().mat];
    const fireproof = !M.flammable[mat];
    for (const k of cellsOf.get(v.id)[s.i]) {
      const x = k % W, y = (k / W) | 0, i = g.idx(x, y);
      const c = g.cells[i];
      if (!canHoldWall(M, c)) continue;
      if (!under.has(k)) under.set(k, c);
      let burn = c & BURN;
      if (fireproof || !PART[c & 255]) burn = 0;
      const nc = ((c & (ROAD | BRIDGE | WET)) | burn | OWNED | mat | ((PART[c & 255] ? (c >>> 8) & 255 : M.ambient) << 8) | (255 << 16)) >>> 0;
      if (nc !== c) { g.cells[i] = nc; g.ver[i >>> 12]++; }
      if (M.emits[mat]) g.emitHint[i >>> 12] = 1;
    }
  }

  /** What a cell goes back to when its wall section falls (`broken`) or is cleared away (`gone`). */
  function unstamp(v, s, how) {
    for (const k of cellsOf.get(v.id)[s.i]) {
      const x = k % W, y = (k / W) | 0, i = g.idx(x, y);
      const c = g.cells[i];
      if (!PART[c & 255]) continue;
      const orig = under.get(k) ?? c;
      let nc;
      if (how === 'gone' || M.water[orig & 255]) nc = (orig & ~BURN) >>> 0;
      else nc = (rubble | (Math.min(255, ((c >>> 8) & 255) + 40) << 8) | (orig & (ROAD | BRIDGE | WET)) | SCORCH) >>> 0;
      g.cells[i] = nc; g.ver[i >>> 12]++;
      if (how !== 'gone') g.regrowHint[i >>> 12] = 1;
    }
    g.wakeAt(...mid(v, s).map((q) => Math.round(q)));
  }

  function changed(v) {
    sim.vectorsDirty.add(v.id);
    sim.routeVer++;
    sim.defence.blockVer++;
  }

  // ---- damage -------------------------------------------------------------------------------------------------------

  function damage(v, i, amount, source) {
    const s = v.sections[i];
    if (!s || s.state !== 'up') return 0;
    if (source.kind === 'acid') amount *= lv().acid;
    s.hp -= amount;
    s.lastHit = sim.tick;
    v.lastHit = sim.tick;
    const key = v.id * 4096 + i;
    if (sim.tick - (lastDamaged.get(key) ?? -1e9) >= 20) {
      lastDamaged.set(key, sim.tick);
      const [x, y] = mid(v, s);
      sim.events.push({ e: 'damaged', tick: sim.tick, base: sim.base, id: v.id, section: i, type: s.gate ? 'gate' : 'wall', frac: Math.max(0, s.hp / maxHp()), x: Math.round(x), y: Math.round(y) });
      sim.vectorsDirty.add(v.id);
    }
    if (s.hp <= 0) breakSection(v, s, source);
    return amount;
  }

  function breakSection(v, s, source) {
    s.state = 'broken'; s.hp = 0; s.patch = false;
    unstamp(v, s, 'broken');
    // the section comes apart: chunks fly, dust and smoke go up
    const [mx, my] = mid(v, s);
    const cells = cellsOf.get(v.id)[s.i];
    for (let k = 0; k < Math.min(10, cells.length); k++) {
      const c = cells[(k * 7) % cells.length], x = c % W + 0.5, y = ((c / W) | 0) + 0.5;
      const [ca, sa] = dir(rng.float()), sp = 0.4 + rng.float() * 0.8;
      sim.world.debris.spawn(x, y, ca * sp, sa * sp, 0.6 + rng.float() * 0.6, rubble, false);
    }
    sim.defence.pulse('noise', mx, my, 90, 120);
    changed(v);
    const n = sim.ents.list('enemy').filter((e) => e.raid && Math.abs(e.x / SUB - mx) < 30 && Math.abs(e.y / SUB - my) < 30).length;
    sim.events.push({ e: 'wallBreached', tick: sim.tick, base: sim.base, id: v.id, section: s.i, gate: s.gate, x: Math.round(mx), y: Math.round(my), n, raid: source.raid ?? null });
  }

  // ---- levels --------------------------------------------------------------------------------------------------------

  /** The global Wall level changed: every standing section is re-stamped and its hit points scale to the new top. */
  function relevel(from, to) {
    const a = DD.wallLevel(from).hp, b = DD.wallLevel(to).hp;
    for (const v of list()) {
      for (const s of v.sections) if (s.state === 'up') { s.hp = Math.min(b, Math.round((s.hp / a) * b)); stamp(v, s); }
      sim.vectorsDirty.add(v.id);
    }
  }

  // ---- gates ---------------------------------------------------------------------------------------------------------

  function setGate(v, i, on, why = 'gate') {
    const s = v.sections[i];
    if (!s || s.state === 'gone' || s.gate === on) return false;
    s.gate = on;
    if (s.state === 'up') stamp(v, s);
    changed(v);
    const [x, y] = mid(v, s);
    sim.events.push({ e: on ? 'gateSet' : 'gateSealed', tick: sim.tick, base: sim.base, id: v.id, section: i, x: Math.round(x), y: Math.round(y), why });
    return true;
  }

  /** Gates where polyline `pts` (a road) crosses wall v — the section it crosses, and its neighbour when it crosses
   *  near a section end (the road band is wider than the crossing point). */
  function gatesWhereCrossed(v, pts, roadId) {
    const n = v.sections.length;
    for (const at of crossings(loopPts(v), pts)) {
      const i = Math.max(0, Math.min(n - 1, Math.floor((at / v.len) * n)));
      setGate(v, i, true, 'road');
      const s = v.sections[i];
      if (at - s.a < 3 && i > 0) setGate(v, i - 1, true, 'road');
      if (s.b - at < 3 && i < n - 1) setGate(v, i + 1, true, 'road');
      if (v.closed && at - s.a < 3 && i === 0) setGate(v, n - 1, true, 'road');
    }
    void roadId;
  }
  /** M3's hook: a road was accepted — every wall it crosses gets a gate there (the gate offer, taken). */
  function onRoadPlanned(p, road) { for (const v of list()) gatesWhereCrossed(v, road.pts, road.id); }

  // ---- near / clear / undo -----------------------------------------------------------------------------------------

  /** The wall section nearest (x, y) within r cells: { v, i, d } or null. */
  function near(x, y, r = 4) {
    let best = null;
    for (const v of list()) {
      const n = nearestOn(loopPts(v), x, y);
      const d = Math.sqrt(n.d2);
      if (d > r || (best && d >= best.d)) continue;
      const i = Math.max(0, Math.min(v.sections.length - 1, Math.floor((n.at / v.len) * v.sections.length)));
      if (v.sections[i].state === 'gone') continue;
      best = { v, i, d };
    }
    return best;
  }

  /** CLEAR on a wall: a gate is sealed back into wall; a wall section is taken away (half its cost comes back). */
  function clearAt(x, y) {
    const n = near(x, y, 4);
    if (!n) return null;
    const s = n.v.sections[n.i];
    if (s.gate) { setGate(n.v, n.i, false, 'clear'); return 'sealed'; }
    removeSection(n.v, s, sim.data.econ.refund);
    return 'cleared';
  }

  function removeSection(v, s, share) {
    const back = {};
    if (s.state === 'up' || s.state === 'broken') for (const [r, k] of Object.entries(cfg.cost || {})) { const q = Math.floor(((k * v.len) / v.sections.length) * share); if (q) back[r] = q; }
    for (const [r, k] of Object.entries(s.delivered)) if (s.state === 'plan') back[r] = (back[r] || 0) + k;
    if (s.state === 'plan') for (const [r, k] of Object.entries(s.need)) { const left = k - (s.delivered[r] || 0); if (left > 0) sim.committed[r] = Math.max(0, (sim.committed[r] || 0) - left); }
    if (s.state === 'up' || s.state === 'broken') unstamp(v, s, 'gone');
    s.state = 'gone'; s.need = {}; s.delivered = {}; s.patch = false;
    for (const k of cellsOf.get(v.id)[s.i]) under.delete(k);
    releaseBuilders(v, s.i);
    const [x, y] = mid(v, s);
    if (Object.keys(back).length) sim.dropPile(x, y, back);
    changed(v);
    if (v.sections.every((q) => q.state === 'gone')) removeRecord(v);
  }

  function removeRecord(v) {
    for (const per of cellsOf.get(v.id)) for (const k of per) { if (Math.floor(sectionAt.get(k) / 4096) === v.id) sectionAt.delete(k); }
    cellsOf.delete(v.id);
    byId.delete(v.id);
    vectors.remove(v.id);
    sim.vectorsDirty.add(v.id);
    sim.sites = sim.sites.filter((x) => !(x.kind === 'wall' && x.id === v.id));
  }

  /** Undo (within 30 s): the whole wall goes, everything delivered comes back. */
  function undo(id) {
    const v = byId.get(id);
    if (!v) return false;
    for (const s of v.sections) if (s.state !== 'gone') removeSection(v, s, 1);
    return true;
  }

  /** eraseVector on a wall: sections between distances from..to are taken away. */
  function erase(id, from = 0, to = Infinity) {
    const v = byId.get(id);
    if (!v) return false;
    for (const s of v.sections) if (s.state !== 'gone' && s.b > from && s.a < to) removeSection(v, s, sim.data.econ.refund);
    return true;
  }

  // ---- builders (construction.js hands them over) -----------------------------------------------------------------

  const needsWork = (s) => !s.builder && (s.state === 'plan' || (s.state === 'up' && s.patch));
  const short = (s) => Object.keys(s.need).find((r) => (s.delivered[r] || 0) < s.need[r]);
  function sites() { return list().filter((v) => v.sections.some(needsWork)); }

  /** Where a builder stands to lay a section: beside its middle, on the side it can walk to. */
  function standFor(v, s, from) {
    const pts = loopPts(v);
    const [mx, my] = pointAt(pts, (s.a + s.b) / 2);
    const [ax, ay] = pointAt(pts, Math.max(0, s.a)), [bx, by] = pointAt(pts, Math.min(v.len, s.b));
    let nx = -(by - ay), ny = bx - ax; const l = hyp(nx, ny) || 1; nx /= l; ny /= l;
    const opts = [];
    for (const side of [1, -1]) for (const d of [3, 4, 5]) opts.push([Math.round(mx + nx * d * side), Math.round(my + ny * d * side)]);
    opts.sort((p, q) => hyp(p[0] - from[0], p[1] - from[1]) - hyp(q[0] - from[0], q[1] - from[1]));
    for (const [x, y] of opts) if (g.inside(x, y) && walkable(M, g.cells[g.idx(x, y)]) && !sectionAt.has(rowIdx(x, y))) return [x, y];
    return null;
  }

  function walkTo(w, x, y) {
    if (!g.inside(x, y)) return false;
    const r = sim.paths.find(Math.floor(w.x / SUB), Math.floor(w.y / SUB), x, y, w.vrow);
    if (!r) return false;
    sim.movers.go(w, r);
    return true;
  }

  /** construction.js asks: can this builder take work on wall v? Claims a run of sections up to what it can carry. */
  function claim(w, v) {
    const from = [w.x / SUB, w.y / SUB];
    for (let i = 0; i < v.sections.length; i++) {
      const s = v.sections[i];
      if (!needsWork(s)) continue;
      const stand = standFor(v, s, from);
      if (!stand) continue;
      // a run of neighbouring sections whose cost fits in one load
      const secs = [i];
      let load = Object.values(s.need).reduce((a, k) => a + k, 0) - Object.values(s.delivered).reduce((a, k) => a + k, 0);
      for (let j = i + 1; j < v.sections.length && secs.length < 8; j++) {
        const q = v.sections[j];
        if (!needsWork(q)) break;
        const more = Object.values(q.need).reduce((a, k) => a + k, 0) - Object.values(q.delivered).reduce((a, k) => a + k, 0);
        if (load + more > w.vrow.capacity) break;
        load += more; secs.push(j);
      }
      for (const j of secs) v.sections[j].builder = w.id;
      w.task = { kind: 'wall', wall: v.id, secs, k: 0, work: 0 };
      if (fetchNext(w, v)) return true;
      if (walkTo(w, stand[0], stand[1])) { w.phase = 'toSite'; return true; }
      for (const j of secs) v.sections[j].builder = null;
      w.task = null;
    }
    return false;
  }

  /** If the claimed sections still need something, go and fetch it from the nearest pool that has it. */
  function fetchNext(w, v) {
    const t = w.task;
    const need = {};
    for (const j of t.secs.slice(t.k)) { const s = v.sections[j]; for (const [r, k] of Object.entries(s.need)) { const left = k - (s.delivered[r] || 0); if (left > 0) need[r] = (need[r] || 0) + left; } }
    const res = Object.keys(need)[0];
    if (!res) return false;
    const S = sim.stores;
    let best = null, bd = Infinity;
    for (const p of S.pools) { if (S.stock(p, res) <= 0) continue; const d = (p.x - w.x / SUB) ** 2 + (p.y - w.y / SUB) ** 2; if (d < bd) { bd = d; best = p; } }
    if (!best) { v.waiting = `waiting for ${sim.data.R[res].name.toLowerCase()}`; return false; }
    const door = S.doorNear(best, w.x / SUB, w.y / SUB);
    t.fetch = { res, pool: best.id, n: Math.min(w.vrow.capacity, need[res]) };
    if (!walkTo(w, door[0], door[1])) { t.fetch = null; return false; }
    w.phase = 'toStore';
    return true;
  }

  function release(w) {
    const t = w.task;
    if (!t || t.kind !== 'wall') return;
    const v = byId.get(t.wall);
    if (v) for (const j of t.secs) if (v.sections[j]?.builder === w.id) v.sections[j].builder = null;
    // whatever it carries goes back into a store (or onto the ground)
    if (w.cargo && Object.keys(w.cargo).length) {
      const p = sim.stores.hqPool() || sim.stores.pools[0];
      let left = {};
      for (const [r, n] of Object.entries(w.cargo)) { const put = p ? sim.stores.put(p, r, n) : 0; if (n - put > 0) left[r] = n - put; }
      if (Object.keys(left).length) sim.dropPile(w.x / SUB, w.y / SUB, left);
      w.cargo = {};
      sim.carriedDirty = true;
    }
    w.task = null; w.phase = null; w.route = null;
  }
  function releaseBuilders(v, i) {
    for (const w of sim.ents.list('worker')) if (w.task?.kind === 'wall' && w.task.wall === v.id && w.task.secs.includes(i)) release(w);
  }

  /** One tick of a builder whose task is a wall (called by construction.js when it is not walking). */
  function workerStep(w) {
    const t = w.task, v = byId.get(t.wall);
    if (!v) return release(w);
    if (w.blocked) { w.blocked = false; w.phase = w.phase === 'toStore' ? 'toStore' : 'toSite'; }
    if (w.route) return;
    const sec = () => v.sections[t.secs[t.k]];
    if (w.phase === 'toStore') { w.phase = 'loading'; w.wait = w.vrow.load; return; }
    if (w.phase === 'loading') {
      if (--w.wait > 0) return;
      const f = t.fetch, p = sim.stores.pools.find((x) => x.id === f.pool);
      const n = p ? sim.stores.take(p, f.res, f.n) : 0;
      t.fetch = null;
      if (!n) return release(w);
      w.cargo = { [f.res]: n };
      sim.committed[f.res] = Math.max(0, (sim.committed[f.res] || 0) - n);
      sim.carriedDirty = true;
      const st = standFor(v, sec(), [w.x / SUB, w.y / SUB]);
      if (!st || !walkTo(w, st[0], st[1])) return release(w);
      w.phase = 'toSite';
      return;
    }
    if (w.phase === 'toSite') {
      // hand the load over to the claimed sections, in order
      for (const [r, n0] of Object.entries(w.cargo || {})) {
        let n = n0;
        for (const j of t.secs.slice(t.k)) { const s = v.sections[j]; const left = (s.need[r] || 0) - (s.delivered[r] || 0); if (left > 0 && n > 0) { const k = Math.min(left, n); s.delivered[r] = (s.delivered[r] || 0) + k; n -= k; } }
        if (n > 0) { const p = sim.stores.hqPool(); const put = p ? sim.stores.put(p, r, n) : 0; if (n - put > 0) sim.dropPile(w.x / SUB, w.y / SUB, { [r]: n - put }); }
      }
      w.cargo = {}; sim.carriedDirty = true;
      w.phase = 'work'; t.work = 0;
      return;
    }
    if (w.phase === 'work') {
      const s = sec();
      if (!s || s.state === 'gone' || (s.state === 'up' && !s.patch)) return nextSection(w, v);
      if (s.state === 'broken') return nextSection(w, v);
      if (short(s)) { if (!fetchNext(w, v)) release(w); return; }
      t.work += sim.hooks.workFactor(null);
      const cells = cellsOf.get(v.id)[s.i].length;
      const need = Math.max(4, (cells * cfg.layTicks) / 3) * (s.patch && s.state === 'up' ? 0.5 : 1);
      if (t.work < need) return;
      if (s.state === 'plan') { s.state = 'up'; s.hp = maxHp(); s.need = {}; s.delivered = {}; stamp(v, s); changed(v); }
      else { s.hp = maxHp(); s.patch = false; sim.vectorsDirty.add(v.id); }
      s.builder = null;
      // a builder standing where the wall just went up steps off it
      const bx = Math.floor(w.x / SUB), by = Math.floor(w.y / SUB);
      if (!walkable(M, g.cells[g.idx(bx, by)])) { const st = standFor(v, s, [bx, by]); if (st) { w.x = Math.round((st[0] + 0.5) * SUB); w.y = Math.round((st[1] + 0.5) * SUB); } }
      if (v.sections.every((q) => q.state === 'up' || q.state === 'gone')) finished(v);
      return nextSection(w, v);
    }
    // unknown phase: start over
    release(w);
  }

  function nextSection(w, v) {
    const t = w.task;
    t.k++; t.work = 0;
    while (t.k < t.secs.length) {
      const s = v.sections[t.secs[t.k]];
      if (s && (s.state === 'plan' || (s.state === 'up' && s.patch))) break;
      if (s?.builder === w.id) s.builder = null;
      t.k++;
    }
    if (t.k >= t.secs.length) { w.task = null; w.phase = null; sim.construction.prune(); return; }
    const st = standFor(v, v.sections[t.secs[t.k]], [w.x / SUB, w.y / SUB]);
    if (st && walkTo(w, st[0], st[1])) { w.phase = 'toSite'; return; }
    if (st && hyp(st[0] - w.x / SUB, st[1] - w.y / SUB) < 2) { w.phase = 'toSite'; return; }
    release(w);
  }

  /** Every section of a wall is up: tell the works, and check whether it closed a ring. */
  function finished(v) {
    if (v.done) return;
    v.done = true;
    const [x, y] = pointAt(loopPts(v), v.len / 2);
    sim.events.push({ e: 'built', tick: sim.tick, base: sim.base, id: v.id, type: 'wall', name: 'Wall', x: Math.round(x), y: Math.round(y), len: v.len });
    const ring = ringCheck(v);
    if (ring) sim.events.push({ e: 'ringClosed', tick: sim.tick, base: sim.base, wallId: v.id, cells: ring.cells, x: ring.x, y: ring.y });
  }

  /**
   * Does wall v close a ring (with other walls, cliffs, deep water, lava)? Flood the ground an enemy can walk on from
   * each side of the wall's middle; a side that runs out before `ringMax` cells is enclosed. Returns the enclosed
   * area { cells, x, y } (its centre) or null.
   */
  function ringCheck(v) {
    const pts = loopPts(v), [mx, my] = pointAt(pts, v.len / 2);
    const [ax, ay] = pointAt(pts, Math.max(0, v.len / 2 - 2)), [bx, by] = pointAt(pts, Math.min(v.len, v.len / 2 + 2));
    let nx = -(by - ay), ny = bx - ax; const l = hyp(nx, ny) || 1; nx /= l; ny /= l;
    let best = null;
    for (const side of [1, -1]) {
      const sx = Math.round(mx + nx * 4 * side), sy = Math.round(my + ny * 4 * side);
      if (!g.inside(sx, sy) || !enemyOpen(g.cells[g.idx(sx, sy)])) continue;
      const r = boundedFlood(sx, sy, cfg.ringMax);
      if (r && (!best || r.cells < best.cells)) best = r;
    }
    return best;
  }
  /** Ground an enemy may walk on without breaking anything (walls and gates are closed to it). */
  const enemyOpen = (c) => !PART[c & 255] && walkable(M, c);
  let floodSeen = null;
  function boundedFlood(sx, sy, cap) {
    if (!floodSeen || floodSeen.length !== W * H) floodSeen = new Uint8Array(W * H); else floodSeen.fill(0);
    const q = new Int32Array(Math.min(W * H, cap + 16));
    let h = 0, t = 0, sumX = 0, sumY = 0;
    const s = sy * W + sx;
    floodSeen[s] = 1; q[t++] = s;
    while (h < t) {
      const p = q[h++];
      const x = p % W, y = (p / W) | 0;
      sumX += x; sumY += y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return null; // reached the map edge: open
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        const nk = ny * W + nx;
        if (floodSeen[nk]) continue;
        if (!enemyOpen(g.cells[g.idx(nx, ny)])) continue;
        floodSeen[nk] = 1;
        if (t >= q.length) return null; // bigger than any ring we call closed
        q[t++] = nk;
      }
    }
    return { cells: t, x: Math.round(sumX / t), y: Math.round(sumY / t) };
  }

  // ---- the slow pass: fire, integrity, self-repair, the rebuild after a raid ---------------------------------------

  function step() {
    const L = lv();
    const enemies = sim.ents.list('enemy');
    const q = cfg.quietCells;
    for (const v of list()) {
      const per = cellsOf.get(v.id);
      let dirty = false;
      for (const s of v.sections) {
        if (s.state !== 'up') continue;
        let burning = 0;
        for (const k of per[s.i]) {
          const c = g.cells[g.idx(k % W, (k / W) | 0)];
          if (c & BURN) burning++;
          else if (!PART[c & 255] && canHoldWall(M, under.get(k) ?? c) && (c & 255) === rubble) { dirty = true; } // burnt through: the section still stands
        }
        if (burning) damage(v, s.i, burning * cfg.fireDamage, { team: 0, kind: 'fire' });
        if (s.state === 'up' && dirty) { stamp(v, s); dirty = false; }
        if (s.state === 'up' && L.regen) { const before = s.hp; s.hp = Math.min(maxHp(), s.hp + L.regen); if (s.hp !== before && (sim.tick % 200) === 0) sim.vectorsDirty.add(v.id); }
      }
      // quiet: no enemy near the wall for a while → the blueprint brings the builders back
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of v.pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      const loud = enemies.some((e) => { const ex = e.x / SUB, ey = e.y / SUB; return ex > x0 - q && ex < x1 + q && ey > y0 - q && ey < y1 + q; });
      if (loud) { v.quietSince = sim.tick; continue; }
      if (v.quietSince === undefined) v.quietSince = sim.tick;
      if (sim.tick - v.quietSince < cfg.quietTicks) continue;
      let queued = false;
      for (const s of v.sections) {
        if (s.state === 'broken') {
          s.state = 'plan';
          for (const [r, k] of Object.entries(cfg.cost || {})) { const n = Math.max(0, Math.ceil((k * v.len) / v.sections.length - 1e-9)); s.need[r] = n; s.delivered[r] = 0; sim.committed[r] = (sim.committed[r] || 0) + n; }
          queued = true; v.done = false;
        } else if (s.state === 'up' && !s.patch && s.hp < maxHp() * cfg.patchBelow) { s.patch = true; queued = true; }
      }
      if (queued) {
        if (!sim.sites.some((x) => x.kind === 'wall' && x.id === v.id)) sim.sites.push({ kind: 'wall', id: v.id });
        sim.vectorsDirty.add(v.id);
        const bad = v.sections.filter((s) => s.state === 'plan').length;
        if (bad) { const [x, y] = pointAt(loopPts(v), v.len / 2); sim.events.push({ e: 'wallRepair', tick: sim.tick, base: sim.base, id: v.id, n: bad, x: Math.round(x), y: Math.round(y) }); }
      }
    }
  }

  /** Glow from Wall V (every standing wall cell gives off a little). */
  function glowSources() {
    const L = lv();
    if (!L.glow) return [];
    const out = [];
    for (const v of list()) for (const s of v.sections) if (s.state === 'up') { const [x, y] = mid(v, s); out.push({ x, y, level: L.glow }); }
    return out;
  }

  /** What the scope needs to draw a wall (the worker sends it when it changed). */
  function publicRecord(v) {
    const top = maxHp();
    const code = { plan: 0, up: 1, broken: 2, gone: 3 };
    return { id: v.id, kind: 'wall', pts: v.pts, closed: v.closed, len: v.len, level: level(), sections: v.sections.map((s) => [s.a, s.b, code[s.state], s.state === 'up' ? Math.max(0, Math.min(1, s.hp / top)) : 0, s.gate ? 1 : 0, s.patch ? 1 : 0, s.builder ? 1 : 0]) };
  }

  /** For tests and the flow field: is row-major cell k part of a standing wall section (or gate)? */
  function standing(k) {
    const code = sectionAt.get(k);
    if (code === undefined) return false;
    const v = byId.get(Math.floor(code / 4096));
    return !!v && v.sections[code % 4096].state === 'up';
  }

  return {
    plan, add, list, get: (id) => byId.get(id), near, clearAt, erase, undo, damage, relevel, setGate, onRoadPlanned,
    sites, claim, workerStep, release, step, ringCheck, pieceAt, sectionCodeAt, standing, glowSources, publicRecord,
    cellsOf: (id) => cellsOf.get(id), loopPts, maxHp, mid, PART,
  };
}
