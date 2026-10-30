// Tower Defense: a keep, gates at the edge of the land, walls that shape the enemies' road and towers that shoot along it.
// PURE. Structures are real cells (timber burns, a blast knocks stone down); the bookkeeping here says which cells make up
// which structure. Enemies are ordinary creatures with c.runner set, steered by a flow field (flowfield.js) from the keep.
//
// Data: data/structures.json (what can be built), data/gamemodes.json `td` (difficulty). Attached by modes.js as s.run.

import { BURN, OWNED, setCell, ignite } from '../sim/world.js';
import { spawn, burst, P } from '../sim/particles.js';
import { hexRgb } from '../sim/materials.js';
import { createField, FAR } from './flowfield.js';

const TPS = 30;
const KEEP_R = 9, GATE_CLEAR = 7, STUCK_SECS = 60;

// who marches, from which wave, how many for each wave-number, and how far apart (ticks)
const ROSTER = [
  { sp: 'goblin', from: 1, n: 1, gap: 22 },
  { sp: 'wolf', from: 3, n: 0.7, gap: 14 },
  { sp: 'mite', from: 4, n: 2.6, gap: 6 },
  { sp: 'skeleton', from: 5, n: 0.9, gap: 20 },
  { sp: 'hollow', from: 6, n: 0.3, gap: 40, air: true },
  { sp: 'imp', from: 7, n: 0.9, gap: 16 },
  { sp: 'torchgob', from: 8, n: 0.8, gap: 18 },
  { sp: 'slime', from: 9, n: 0.5, gap: 30 },
  { sp: 'troll', from: 10, n: 0.14, gap: 70, breaker: true },
  { sp: 'griffin', from: 14, n: 0.25, gap: 40, air: true },
  { sp: 'flamewraith', from: 16, n: 0.35, gap: 36 },
  { sp: 'golem', from: 20, n: 0.1, gap: 90, breaker: true },
];

/** The plan for wave n: same n + difficulty always gives the same wave. Pure, so tests and the HUD's preview can read it. */
export function waveOf(n, hpK = 1) {
  const can = ROSTER.filter(r => r.from <= n);
  const main = can[(n * 3 + (n >> 1)) % can.length], side = can[(n * 5 + 1) % can.length];
  const hp = hpK * (1 + (n - 1) * 0.11) * Math.pow(1.02, n);
  const size = 5 + n * 1.15;
  const groups = [{ ...main, count: Math.min(50, Math.max(1, Math.round(size * main.n))), hp }];
  if (n > 2 && side !== main) groups.push({ ...side, count: Math.min(30, Math.max(1, Math.round(size * side.n * 0.5))), hp });
  // every tenth wave a boss walks in behind it; every twentieth one flies
  if (n % 20 === 0) groups.push({ sp: 'dragon', count: 1, gap: 30, hp: hpK * (0.6 + n / 40), boss: true, air: true });
  else if (n % 10 === 0) groups.push({ sp: n < 30 ? 'troll' : 'golem', count: 1, gap: 30, hp: hp * 3, breaker: true, boss: true });
  return groups;
}
const bountyOf = (sp) => Math.max(1, Math.round(Math.sqrt(sp.hp) * 0.95));
const leakOf = (sp, boss) => (boss ? 5 : sp.hp >= 100 ? 3 : sp.hp >= 30 ? 2 : 1);

export function attachTowerGame(s, o) {
  const sim = s.sim, w = sim.world, M = w.M, ID = M.id, W = w.W, H = w.H, C = sim.creatures;
  const rng = sim.rng;
  const data = s.data.structures, G = data.grid, KIND = data.kinds, UP = data.upgrade;
  const D = s.data.gamemodes.td[o.difficulty] || s.data.gamemodes.td.fair;
  const KEY = Object.fromEntries(Object.entries(data.key).map(([k, v]) => [k, ID[v]]));
  const field = createField(w);
  const GW = Math.ceil(W / G), GH = Math.ceil(H / G);
  const T = {
    keep: null, gates: [], structures: [], at: new Map(), nextId: 1,
    gold: D.gold, lives: D.lives, livesMax: D.lives,
    wave: 0, length: +o.length || 0, active: false, queue: [], until: 45 * TPS, clock: 0,
    dirty: true, fieldAt: 0, seeds: [], path: [], left: 0, leaked: 0, kills: 0, essenceOwed: 0, sel: null, newly: [], airBoss: null,
  };
  sim.td = T;

  // ---------- the keep and the gates ----------
  function keepSeeds(x, y) {
    const out = [];
    for (let yy = y - KEEP_R; yy <= y + KEEP_R; yy++) for (let xx = x - KEEP_R; xx <= x + KEEP_R; xx++) {
      if (!w.inside(xx, yy) || Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== KEEP_R) continue;
      const i = yy * W + xx;
      if (field.open(i)) out.push(i);
    }
    return out;
  }
  /** Far, reachable land cells, one per sector round the keep: where the enemies come in. */
  function chooseGates(x, y, n) {
    const dist = field.compute(keepSeeds(x, y));
    const reach = Math.min(170, Math.max(W, H) * 0.62);
    const start = rng() * 6.283, out = [];
    for (let k = 0; k < n; k++) {
      let best = null, bs = -1;
      const a0 = start + k / n * 6.283, half = 3.1416 / n;
      for (let yy = 8; yy < H - 8; yy += 3) for (let xx = 8; xx < W - 8; xx += 3) {
        const i = yy * W + xx;
        if (dist[i] === FAR) continue;
        const d = Math.hypot(xx - x, yy - y);
        if (d > reach) continue;
        let da = Math.atan2(yy - y, xx - x) - a0;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > half) continue;
        if (d > bs) { bs = d; best = { x: xx, y: yy }; }
      }
      if (best && bs > 40) out.push(best);
    }
    return out;
  }
  s.baseRule = (x, y) => {
    const seeds = keepSeeds(x, y);
    if (!seeds.length) return { ok: false, reason: 'No way in here' };
    const d = field.test(seeds);
    for (let yy = 8; yy < H - 8; yy += 5) for (let xx = 8; xx < W - 8; xx += 5) if (d[yy * W + xx] !== FAR && Math.hypot(xx - x, yy - y) > 60) return { ok: true };
    return { ok: false, reason: 'Enemies could never reach this spot' };
  };
  function placeKeep(x, y) {
    const rows = data.keep.cells, h = rows.length, kw = rows[0].length;
    const x0 = x - (kw >> 1), y0 = y - (h >> 1);
    rows.forEach((row, dy) => { for (let dx = 0; dx < kw; dx++) { const i = (y0 + dy) * W + x0 + dx; setCell(w, i, KEY[row[dx]]); w.flag[i] |= OWNED; } });
    T.keep = { x, y };
    T.seeds = keepSeeds(x, y);
    T.gates = chooseGates(x, y, 3);
    // gates come ONLINE as the waves go by: the first is the road you learn
    T.gates.forEach((g, k) => { g.from = D.gates[k] ?? 99; });
    T.dirty = true;
    refresh();
  }
  s.onBase = placeKeep;
  const liveGates = () => T.gates.filter(g => T.wave + 1 >= g.from);

  // ---------- the map's shape ----------
  function refresh() {
    if (!T.keep) return;
    T.seeds = keepSeeds(T.keep.x, T.keep.y);
    field.compute(T.seeds);
    T.dirty = false; T.fieldAt = sim.tick;
    // the road the next enemies will take, drawn as moving dots: this is what makes mazing readable
    T.path = [];
    for (const g of T.gates) {
      if (T.wave + 1 < g.from) continue;
      let x = g.x, y = g.y;
      const line = [];
      for (let k = 0; k < 500; k++) {
        const n = field.ahead(x, y, 2);
        if (!n || (n.x === x && n.y === y)) break;
        line.push(n); x = n.x; y = n.y;
        if (field.dist[y * W + x] < 2) break;
      }
      T.path.push(line);
    }
  }

  // ---------- building ----------
  const snap = (v) => Math.floor(v / G);
  // enemies spawn across a little patch, so a gate is open if any of that patch has a way to the keep
  function gateOpen(d, g) {
    for (let yy = g.y - 3; yy <= g.y + 3; yy++) for (let xx = g.x - 3; xx <= g.x + 3; xx++) if (w.inside(xx, yy) && d[yy * W + xx] !== FAR) return true;
    return false;
  }
  function canPlace(id, gx, gy, skipPath) {
    const K = KIND[id], n = K.size;
    const x0 = gx * G, y0 = gy * G, cells = n * G;
    if (x0 < 3 || y0 < 3 || x0 + cells >= W - 3 || y0 + cells >= H - 3) return { ok: false, reason: 'Too close to the edge' };
    // the ring the road is measured from stays clear, or walls could box the measurement in
    if (T.keep && Math.max(Math.abs(x0 + cells / 2 - T.keep.x), Math.abs(y0 + cells / 2 - T.keep.y)) < KEEP_R + 1 + cells / 2) return { ok: false, reason: 'Too close to the keep' };
    for (const g of T.gates) if (Math.hypot(x0 + cells / 2 - g.x, y0 + cells / 2 - g.y) < GATE_CLEAR + cells / 2) return { ok: false, reason: 'Too close to an enemy gate' };
    for (let yy = y0; yy < y0 + cells; yy++) for (let xx = x0; xx < x0 + cells; xx++) {
      const i = yy * W + xx, m = w.mat[i];
      if (w.flag[i] & OWNED) return { ok: false, reason: 'Something is built here' };
      if (M.liquid[m]) return { ok: false, reason: 'Not on water' };
      if (M.solid[m]) return { ok: false, reason: 'Something is in the way' };
    }
    if (!skipPath) {
      const mask = new Uint8Array(w.N);
      for (let yy = y0; yy < y0 + cells; yy++) mask.fill(1, yy * W + x0, yy * W + x0 + cells);
      // Only what THIS piece would cut off counts. A gate that is already cut off (a troll turned to stone on it, a landslide)
      // must not refuse every wall on the map: that stopped all building until a refresh, and selling walls could not help.
      const seeds = keepSeeds(T.keep.x, T.keep.y);
      const was = T.gates.map(g => gateOpen(field.test(seeds), g));
      const d = field.test(seeds, mask);
      for (let k = 0; k < T.gates.length; k++) if (was[k] && !gateOpen(d, T.gates[k])) return { ok: false, reason: 'That seals the road. Leave them a way through' };
    }
    return { ok: true };
  }
  function record(st) {
    const K = KIND[st.kind];
    st.K = K; st.cx = st.x + K.size * G / 2; st.cy = st.y + K.size * G / 2;
    st.cells = [];
    K.cells.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) st.cells.push({ i: (st.y + dy) * W + st.x + dx, m: KEY[row[dx]] }); });
    for (let a = 0; a < K.size; a++) for (let b = 0; b < K.size; b++) T.at.set((snap(st.y) + a) * GW + snap(st.x) + b, st);
    st.buff = 0; st.cd = (K.rate ?? 1) * TPS * rng();
    T.structures.push(st);
    return st;
  }
  function place(id, gx, gy) {
    const K = KIND[id];
    const st = record({ id: T.nextId++, kind: id, x: gx * G, y: gy * G, tier: 1, spent: K.cost });
    T.gold -= K.cost;
    for (const c of st.cells) { setCell(w, c.i, c.m); w.flag[c.i] |= OWNED; }
    T.dirty = true;
    auras();
    sim.fire('structure', { st, x: st.cx, y: st.cy });
    return st;
  }
  function unplace(st) {
    T.structures.splice(T.structures.indexOf(st), 1);
    for (const [k, v] of T.at) if (v === st) T.at.delete(k);
    if (T.sel === st) T.sel = null;
    T.dirty = true;
    auras();
  }
  function auras() {
    for (const st of T.structures) st.buff = 0;
    for (const a of T.structures) {
      if (!a.K.buff) continue;
      for (const st of T.structures) if (st !== a && st.K.group === 'tower' && Math.hypot(st.cx - a.cx, st.cy - a.cy) <= rangeOf(a)) st.buff = Math.max(st.buff, a.K.buff);
    }
  }
  const rangeOf = (st) => (st.K.range ?? 0) * Math.pow(UP.range, st.tier - 1);
  const dmgOf = (st) => (st.K.dmg ?? 0) * Math.pow(UP.dmg, st.tier - 1) * (1 + st.buff);
  const rateOf = (st) => (st.K.rate ?? 1) * Math.pow(UP.rate, st.tier - 1);
  const upgradeCost = (st) => (st.tier >= UP.max || st.K.group === 'wall' ? null : Math.round(st.K.cost * UP.cost[st.tier - 1]));

  function loseStructure(st) {
    unplace(st);
    for (const c of st.cells) {
      if (w.mat[c.i] !== c.m) { w.flag[c.i] &= ~OWNED; continue; }
      setCell(w, c.i, rng() < 0.5 ? ID.rubble : 0); w.flag[c.i] &= ~OWNED;
    }
    sim.fire('structure-lost', { st, x: st.cx, y: st.cy });
  }

  // ---------- the enemies ----------
  T.keepCell = (x, y) => Math.max(Math.abs(x - T.keep.x), Math.abs(y - T.keep.y)) <= KEEP_R;
  T.steer = function (c) {
    if (!T.keep) return false;
    c.age = 0; c.hunger = 0;
    const cx = c.x | 0, cy = c.y | 0;
    c.state = 'raid';
    if (c.sp.flies) { c.tx = T.keep.x; c.ty = T.keep.y; return true; }
    if (c.breaker) {
      // trolls and golems take the road too, but any wall within reach on the straight line to the keep gets broken
      const dx = T.keep.x - c.x, dy = T.keep.y - c.y, d = Math.hypot(dx, dy) || 1;
      for (let r = 2; r <= 7; r++) {
        const nx = (c.x + dx / d * r) | 0, ny = (c.y + dy / d * r) | 0, i = ny * W + nx;
        if (!w.inside(nx, ny) || !M.built[w.mat[i]] || !(w.flag[i] & OWNED) || T.keepCell(nx, ny)) continue;
        c.state = 'smash'; c.targetCell = { x: nx, y: ny };
        if (r <= 3) { c.tx = c.x; c.ty = c.y; } else { c.tx = nx + 0.5; c.ty = ny + 0.5; }
        return true;
      }
    }
    const n = field.ahead(cx, cy, 5);
    if (n && field.dist[n.y * W + n.x] !== FAR) { c.tx = n.x + 0.5; c.ty = n.y + 0.5; return true; }
    // sealed in (a spell, a landslide): break out through the nearest wall
    const dx = Math.sign(T.keep.x - cx), dy = Math.sign(T.keep.y - cy);
    for (let r = 1; r < 6; r++) {
      const i = (cy + dy * r) * W + cx + dx * r;
      if (i >= 0 && i < w.N && M.built[w.mat[i]]) { c.state = 'smash'; c.targetCell = { x: cx + dx * r, y: cy + dy * r }; c.tx = c.x; c.ty = c.y; return true; }
    }
    c.tx = T.keep.x; c.ty = T.keep.y;
    return true;
  };
  function enlist(c, g) {
    c.runner = true; c.team = 'monster'; c.think = 0;
    c.breaker = !!g.breaker; c.bounty = bountyOf(c.sp) * (g.boss ? 10 : 1); c.leak = leakOf(c.sp, g.boss); c.boss = !!g.boss;
    return c;
  }
  sim.on('split', (e) => { if (e.c.runner) { enlist(e.child, { breaker: e.c.breaker }); e.child.bounty = 1; } });
  sim.on('death', (e) => {
    if (!e.c.runner && !e.c.towerBoss) return;
    if (e.cause === 'keep') return;
    T.gold += e.c.bounty || 0; T.kills++;
  });
  sim.on('fled', (e) => { if (e.c.towerBoss) { T.gold += e.c.bounty || 0; } });

  function spawnOne(g, at) {
    const x = at.x + ((rng() * 5) | 0) - 2, y = at.y + ((rng() * 5) | 0) - 2;
    const c = C.add(g.sp, x, y, { hpScale: g.hp, team: 'monster', goal: g.boss && g.air ? T.keep : undefined });
    if (!c) return;
    if (g.boss && g.air) { c.towerBoss = true; c.bounty = 120; }
    else enlist(c, g);
  }
  function startWave() {
    T.wave++;
    // whatever fell on a gate (a petrified troll, rubble) is swept away, so nobody spawns inside a rock
    for (const g of T.gates) for (let yy = g.y - 3; yy <= g.y + 3; yy++) for (let xx = g.x - 3; xx <= g.x + 3; xx++) {
      const i = yy * W + xx;
      if (w.inside(xx, yy) && M.solid[w.mat[i]] && !(w.flag[i] & OWNED)) setCell(w, i, 0);
    }
    T.dirty = true;
    const gates = T.gates.filter(g => T.wave >= g.from);
    if (!gates.length) gates.push(T.gates[0]);
    const groups = waveOf(T.wave, D.hp);
    T.queue = [];
    let at = sim.tick + 10;
    for (const g of groups) {
      for (let k = 0; k < g.count; k++) { T.queue.push({ at, g, gate: gates[k % gates.length] }); at += g.gap; }
      at += 40;
    }
    T.active = true;
    T.dirty = true;
    const fresh = Object.values(KIND).filter(K => K.fromWave === T.wave);
    if (fresh.length) sim.fire('structures-new', { names: fresh.map(K => K.name) });
    const boss = groups.find(g => g.boss);
    sim.fire('announce', { text: boss ? `Wave ${T.wave}: a ${s.data.species[boss.sp].name} comes!` : `Wave ${T.wave}`, x: gates[0].x, y: gates[0].y });
  }
  function endWave() {
    T.active = false;
    const income = T.structures.reduce((a, st) => a + (st.K.income ? st.K.income * st.tier : 0), 0);
    const pay = 16 + T.wave * 3 + income;
    T.gold += pay;
    T.essenceOwed += 3 + T.wave * 0.6;
    T.until = 22 * TPS;
    sim.fire('wave-end', { wave: T.wave, gold: pay });
    if (T.length && T.wave >= T.length) s.finishRun({ won: true, title: 'The keep stands!', text: `You held ${T.wave} waves with ${T.lives} lives left.`, score: T.wave, label: `${T.wave} waves`, essence: 40 + T.wave * 3 });
  }

  // ---------- towers shooting ----------
  function targetFor(st) {
    const r = rangeOf(st);
    let best = null, bd = Infinity;
    C.near(st.cx, st.cy, r, (c) => {
      if (c.team !== 'monster' || (c.sp.flies && !st.K.air)) return;
      const d = field.dist[(c.y | 0) * W + (c.x | 0)] ?? FAR;   // the one nearest the keep
      if (d < bd) { bd = d; best = c; }
      if (d === FAR && !best) best = c;
    });
    return best;
  }
  function shootArrow(st, t) {
    const K = st.K, col = hexRgb(K.color);
    const d = Math.hypot(t.x - st.cx, t.y - st.cy), T2 = Math.max(3, d / (K.speed ?? 1.2));
    spawn(sim.ps, { kind: P.spark, x: st.cx, y: st.cy - 3, z: 3, vx: (t.x - st.cx) / T2, vy: (t.y - 1 - st.cy + 3) / T2, vz: -3 / T2, life: T2, rgb: col, glow: 0.3 });
    const dmg = dmgOf(st) * (t.boss || t.sp.boss ? K.boss ?? 1 : 1);
    sim.api.later(() => { if (t.alive) C.hurt(t, dmg, 'arrow', 'tower'); }, Math.round(T2));
    sim.fire('shoot', { c: { x: st.cx, y: st.cy }, kind: 'arrow' });
  }
  function shootBomb(st, t) {
    const K = st.K;
    const lead = 20, x = t.x + (t.vx || 0) * lead, y = t.y + (t.vy || 0) * lead;
    const d = Math.hypot(x - st.cx, y - st.cy), TT = Math.max(8, d / 0.9), g = 0.04;
    spawn(sim.ps, { kind: P.spark, x: st.cx, y: st.cy - 3, z: 4, vx: (x - st.cx) / TT, vy: (y - st.cy + 3) / TT, vz: (0.5 * g * TT * TT - 4) / TT, grav: g, life: TT, rgb: [60, 50, 60] });
    sim.api.later(() => {
      const dmg = dmgOf(st);
      C.near(x, y, K.splash, (c) => { if (c.team === 'monster' && !c.sp.flies) { C.hurt(c, dmg, 'blast', 'tower'); } });
      burst(sim.ps, rng, x, y, 12, { kind: P.spark, life: 14, palette: [[255, 180, 60], [255, 110, 30], [90, 80, 80]], glow: 0.9, speed: 0.6 });
      w.lights.push({ x, y, r: 255, g: 150, b: 60, rad: 12, ttl: 6, max: 6 });
      (w.rings ||= []).push({ x, y, max: K.splash, ttl: 8, life: 8, color: [255, 170, 80] });
      sim.fire('tower-boom', { x, y });
    }, Math.round(TT));
  }
  function shootFlame(st) {
    const K = st.K, r = rangeOf(st), dmg = dmgOf(st);
    let hit = 0;
    C.near(st.cx, st.cy, r, (c) => {
      if (c.team !== 'monster' || c.sp.flies) return;
      C.hurt(c, dmg, 'fire', 'tower'); hit++;
      if (!c.sp.fireproof) c.burning = Math.max(c.burning, 60);
      spawn(sim.ps, { kind: P.spark, x: st.cx, y: st.cy, z: 2, vx: (c.x - st.cx) / 8, vy: (c.y - st.cy) / 8, vz: 0.05, life: 8, rgb: [255, 130 + (rng() * 80 | 0), 30], glow: 1 });
    });
    if (hit && rng() < 0.15) { const a = rng() * 6.283, q = r * rng(); const x = (st.cx + Math.cos(a) * q) | 0, y = (st.cy + Math.sin(a) * q) | 0; if (w.inside(x, y)) ignite(w, y * W + x); }
    return hit > 0;
  }
  function shootFrost(st) {
    const r = rangeOf(st), dmg = dmgOf(st);
    let hit = 0;
    C.near(st.cx, st.cy, r, (c) => {
      if (c.team !== 'monster') return;
      C.hurt(c, dmg, 'frost', 'tower'); hit++;
      c.frozen = Math.max(c.frozen, c.sp.boss || c.boss ? 12 : 40);
    });
    if (hit) (w.rings ||= []).push({ x: st.cx, y: st.cy, max: r, ttl: 12, life: 12, color: [150, 220, 255] });
    return hit > 0;
  }
  function shootChain(st, t) {
    const K = st.K, pts = [[st.cx, st.cy - 3]], hitSet = new Set();
    let cur = t, dmg = dmgOf(st);
    for (let k = 0; k < K.chain && cur; k++) {
      hitSet.add(cur);
      pts.push([cur.x, cur.y - 1]);
      C.hurt(cur, dmg, 'lightning', 'tower');
      dmg *= 0.7;
      const from = cur;
      cur = C.nearest(from.x, from.y, 14, (o) => o.team === 'monster' && !hitSet.has(o));
    }
    (w.bolts ||= []).push({ pts, ttl: 8, color: [190, 220, 255] });
    sim.fire('shoot', { c: { x: st.cx, y: st.cy }, kind: 'bolt' });
  }
  function mend(st) {
    const r = rangeOf(st);
    for (const o of T.structures) {
      if (Math.hypot(o.cx - st.cx, o.cy - st.cy) > r) continue;
      for (const c of o.cells) if (w.mat[c.i] !== c.m) {
        if (w.flag[c.i] & BURN) continue;
        setCell(w, c.i, c.m); w.flag[c.i] |= OWNED;
        burst(sim.ps, rng, c.i % W, (c.i / W) | 0, 4, { kind: P.mote, life: 16, rgb: [140, 255, 180], glow: 1, speed: 0.2 });
        T.dirty = true;
        return;
      }
    }
  }
  function towerStep(st) {
    const K = st.K;
    if (!K.fire || K.fire === 'aura') return;
    if (--st.cd > 0) return;
    st.cd = rateOf(st) * TPS;
    if (K.fire === 'mend') return mend(st);
    if (K.fire === 'flame') return void (shootFlame(st) || (st.cd = 6));
    if (K.fire === 'frost') return void (shootFrost(st) || (st.cd = 6));
    const t = targetFor(st);
    if (!t) { st.cd = 5; return; }
    if (K.fire === 'arrow') shootArrow(st, t);
    else if (K.fire === 'bomb') shootBomb(st, t);
    else if (K.fire === 'chain') shootChain(st, t);
    else if (K.fire === 'missile') { C.missile(st.cx, st.cy - 3, 3, t, dmgOf(st), 'player', hexRgb(K.color)); for (let k = 1; k < K.count; k++) C.missile(st.cx, st.cy - 3, 3, t, dmgOf(st), 'player', hexRgb(K.color), k * 3); }
  }

  // ---------- one tick ----------
  const prev = s.onStep;
  s.onStep = () => {
    prev?.(s);
    if (!T.keep || s.result) return;
    T.clock++;
    if (T.dirty && sim.tick - T.fieldAt >= 6) refresh();
    else if (T.active && sim.tick - T.fieldAt > 60 * TPS / 30) refresh();   // the land moved: fire, quakes, lava
    if (!T.active) { if (--T.until <= 0) startWave(); }
    else {
      while (T.queue.length && T.queue[0].at <= sim.tick) { const q = T.queue.shift(); spawnOne(q.g, q.gate); }
    }
    for (const st of T.structures) towerStep(st);
    if (sim.tick % 5 === 0) {
      let left = 0;
      for (const c of C.list) {
        if (!c.alive || !(c.runner || c.towerBoss)) continue;
        left++;
        const d = Math.max(Math.abs(c.x - T.keep.x), Math.abs(c.y - T.keep.y));
        if (c.towerBoss) { if (d < 24 && sim.tick % 90 === 0) leak(c, 1); continue; }
        if (d < KEEP_R + 1) { leak(c, c.leak); C.remove(c); burst(sim.ps, rng, c.x, c.y, 8, { kind: P.spark, life: 12, rgb: [255, 90, 70], glow: 1, speed: 0.4 }); continue; }
        // a wave must always be able to end: whoever makes no headway for a long while is taken off the board
        if (d < (c.bestD ?? Infinity) - 1) { c.bestD = d; c.bestAt = sim.tick; }
        else if (sim.tick - (c.bestAt ?? sim.tick) > STUCK_SECS * TPS) { C.remove(c); left--; }
      }
      T.left = left;
      if (T.active && !T.queue.length && left === 0) endWave();
    }
    if (sim.tick % 30 === 0) for (const st of [...T.structures]) {
      let ok = 0;
      for (const c of st.cells) if (w.mat[c.i] === c.m) ok++;
      if (ok < st.cells.length) T.dirty = true;
      if (ok < st.cells.length * 0.45) loseStructure(st);
    }
  };
  function leak(c, n) {
    if (s.result) return;
    T.lives -= n; T.leaked += n;
    sim.fire('keep-hit', { lives: T.lives, x: T.keep.x, y: T.keep.y });
    if (T.lives <= 0) { T.lives = 0; s.finishRun({ won: false, title: 'The keep has fallen', text: `You reached wave ${T.wave}.`, score: T.wave, label: `wave ${T.wave}`, essence: 0 }); }
  }

  // ---------- what the screen needs ----------
  const run = {
    id: 'td', name: 'Tower Defense', startTab: 'structure', hideTabs: ['material', 'creature'],
    priceOf: (id) => KIND[id]?.cost ?? 0,
    pages(tab, owned) {
      if (tab === 'structure') return Object.entries(KIND).filter(([, K]) => (K.fromWave ?? 0) <= T.wave + 1).map(([id]) => 'structure:' + id);
      if (tab === 'tool') return ['tool:inspect'];
      if (tab === 'spell') return owned.filter(p => p.startsWith('spell:'));
      return [];
    },
    isLine: (id) => KIND[id]?.group === 'wall',
    snapRect(id, x, y) { const K = KIND[id]; const n = K.size * G; return { x: snap(x - (n - G) / 2) * G, y: snap(y - (n - G) / 2) * G, n, range: K.range ?? 0 }; },
    canBuild(id, x, y) { const r = run.snapRect(id, x, y); const c = canPlace(id, r.x / G, r.y / G, true); return c.ok ? (T.gold >= KIND[id].cost ? c : { ok: false, reason: 'Not enough gold' }) : c; },
    build(id, x, y, o2 = {}) {
      const K = KIND[id];
      if (!K) return { ok: false, reason: 'Nothing happens' };
      if (!T.keep) return { ok: false, reason: 'Place the keep first' };
      const one = (px, py) => {
        const r = run.snapRect(id, px, py), gx = r.x / G, gy = r.y / G;
        const on = T.at.get(gy * GW + gx);
        if (on) return { ok: false, open: on };
        if (T.gold < K.cost) return { ok: false, reason: 'Not enough gold' };
        const c = canPlace(id, gx, gy);
        if (!c.ok) return c;
        place(id, gx, gy);
        return { ok: true, cost: 0 };
      };
      if (o2.x2 == null || K.group !== 'wall') return one(x, y);
      // a dragged line of wall, one grid square at a time, as far as the gold (and the road) allows
      const n = Math.max(1, Math.ceil(Math.hypot(o2.x2 - x, o2.y2 - y) / G));
      let built = 0, last = null, seen = new Set();
      for (let k = 0; k <= n; k++) {
        const px = x + (o2.x2 - x) * k / n, py = y + (o2.y2 - y) * k / n, key = snap(px) + ',' + snap(py);
        if (seen.has(key)) continue;
        seen.add(key);
        const r = one(px, py);
        if (r.ok) built++; else if (!r.open) last = r;
      }
      return built ? { ok: true, cost: 0, built } : (last || { ok: false, reason: '' });
    },
    structureAt(x, y) { return T.at.get(snap(y) * GW + snap(x)) || null; },
    select(st) { T.sel = st; },
    info(st) {
      const K = st.K, bits = [];
      if (K.dmg) bits.push(`Hits for ${+dmgOf(st).toFixed(1)}, every ${+rateOf(st).toFixed(2)}s`);
      if (K.range) bits.push(`Reach ${Math.round(rangeOf(st))}`);
      if (K.income) bits.push(`Pays ${K.income * st.tier} gold a wave`);
      if (st.buff) bits.push(`+${Math.round(st.buff * 100)}% from a beacon`);
      return { name: K.name, desc: K.desc, tier: st.tier, stats: bits.join(' · '), upgrade: upgradeCost(st), refund: Math.round(st.spent * data.sell), gold: T.gold };
    },
    upgrade(st) {
      const c = upgradeCost(st);
      if (c == null) return { ok: false, reason: 'Fully upgraded' };
      if (T.gold < c) return { ok: false, reason: 'Not enough gold' };
      T.gold -= c; st.spent += c; st.tier++;
      auras();
      sim.fire('structure', { st, x: st.cx, y: st.cy });
      return { ok: true };
    },
    sell(st) {
      const back = Math.round(st.spent * data.sell);
      unplace(st);
      for (const c of st.cells) { if (w.mat[c.i] === c.m) setCell(w, c.i, 0); w.flag[c.i] &= ~OWNED; }
      T.gold += back;
      return { ok: true, gold: back };
    },
    strip() {
      const next = T.active ? `<span class="omen">${T.queue.length + T.left} enemies</span>` : `<span class="omen">Wave ${T.wave + 1} in ${Math.ceil(T.until / TPS)}s</span>`;
      return `<span>Wave ${T.wave}${T.length ? '/' + T.length : ''}</span><span class="gold">Gold ${T.gold}</span><span>Lives ${T.lives}</span>${next}`;
    },
    goal: () => (T.length ? `Hold the keep for ${T.length} waves` : 'Hold the keep'),
    progress: () => `Wave ${T.wave}${T.length ? '/' + T.length : ''}`,
    action: () => (!T.active && T.keep ? { label: `Send wave ${T.wave + 1} now`, run: () => run.sendNow() } : null),
    sendNow() { if (T.active) return; T.gold += Math.ceil(T.until / TPS / 2); T.until = 0; },
    panel() {
      const groups = waveOf(T.wave + 1, D.hp).map(g => `${g.count} ${s.data.species[g.sp].name}${g.breaker ? ' (breaks walls)' : ''}${g.air ? ' (flies)' : ''}`).join(', ');
      return { title: run.progress(), rows: [`Next: ${groups}`, `Gold ${T.gold} · Lives ${T.lives}/${T.livesMax} · ${T.kills} defeated`], tip: 'Enemies always take the shortest open road, shown as moving dots. Stretch it with walls so they spend longer under your towers. Tap a tower with Look, or with any structure, to upgrade or sell it.' };
    },
    collect() { const n = Math.floor(T.essenceOwed); T.essenceOwed -= n; return n; },
    state: () => ({ type: 'td', wave: T.wave, gold: T.gold, lives: T.lives, active: T.active, left: T.left, queue: T.queue.length, structures: T.structures.length, keep: T.keep, gates: T.gates.map(g => [g.x, g.y]), pathLen: T.path.map(l => l.length) }),
    draw(api, tick) {
      if (!T.keep) return;
      for (const g of T.gates) {
        const on = T.wave + 1 >= g.from;
        for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283 + tick * 0.06; api.px(g.x + Math.cos(a) * 4, g.y + Math.sin(a) * 4, on ? 255 : 110, on ? 70 : 90, on ? 200 : 130, on ? 0.9 : 0); }
      }
      if (!T.active) for (const line of T.path) for (let k = (tick >> 2) % 4; k < line.length; k += 4) { const q = line[k]; api.px(q.x, q.y, 255, 235, 120, 0.9); api.px(q.x + 1, q.y, 255, 235, 120, 0.9); api.px(q.x, q.y + 1, 255, 235, 120, 0.9); api.px(q.x + 1, q.y + 1, 255, 235, 120, 0.9); }
      for (const st of T.structures) if (st.tier > 1) for (let k = 0; k < st.tier - 1; k++) api.px(st.x + 1 + k * 2, st.y, 255, 225, 110, 0.8);
      const sel = T.sel;
      if (sel?.K.range) { const r = rangeOf(sel), n = Math.ceil(r * 6.3); for (let k = 0; k < n; k += 2) api.px(sel.cx + Math.cos(k / r) * r, sel.cy + Math.sin(k / r) * r, 255, 230, 150, 0.4); }
    },
    save: () => ({ keep: T.keep, gates: T.gates, gold: T.gold, lives: T.lives, wave: T.wave, active: T.active, until: T.until, kills: T.kills, essenceOwed: T.essenceOwed, structures: T.structures.map(st => ({ kind: st.kind, x: st.x, y: st.y, tier: st.tier, spent: st.spent })) }),
    load(o2) {
      Object.assign(T, { keep: o2.keep, gates: o2.gates, gold: o2.gold, lives: o2.lives, wave: o2.wave, until: o2.until, kills: o2.kills, essenceOwed: o2.essenceOwed || 0, active: false });
      // a wave in progress goes on: whoever was saved is still walking, and the wave ends when they are gone
      T.active = !!o2.active; T.queue = [];
      for (const q of o2.structures) record({ id: T.nextId++, ...q });
      auras();
      T.dirty = true; refresh();
    },
    relink(c, extra) { c.runner = !!extra.run; c.breaker = !!extra.breaker; c.bounty = extra.bounty; c.leak = extra.leak; c.boss = !!extra.boss; c.towerBoss = !!extra.towerBoss; if (extra.towerBoss) c.goal = T.keep; },
  };
  return run;
}
