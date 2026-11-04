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

// who marches, from which wave, how many for each wave-number, how far apart (ticks), and what makes them awkward.
// armor = taken off every tower hit (pierce ignores it, a fifth always gets through); heals / wards / burrows / brood / summons:
// see the trait code in attachTowerGame. tip = the toast the first time it marches.
export const ROSTER = [
  { sp: 'goblin', from: 1, n: 1, gap: 20 },
  { sp: 'ratling', from: 2, n: 1, gap: 9, tip: 'Ratlings are quick. Make the road long.' },
  { sp: 'wolf', from: 3, n: 0.8, gap: 12 },
  { sp: 'mite', from: 4, n: 2.6, gap: 5, tip: 'A swarm: a Bombard or a Fire Pit catches a crowd.' },
  { sp: 'ironclad', from: 6, n: 0.4, gap: 26, armor: 5, tip: 'Ironclads wear armour: small hits barely scratch them. Arbalests and Venom go straight through.' },
  { sp: 'skeleton', from: 5, n: 0.9, gap: 18 },
  { sp: 'hollow', from: 6, n: 0.3, gap: 40, air: true, tip: 'Hollow orbs fly straight at the keep. Only some towers shoot at the sky.' },
  { sp: 'duskwing', from: 7, n: 1.4, gap: 7, air: true, tip: 'Duskwings fly in flocks. Archers, Storm Masts and Obelisks reach them.' },
  { sp: 'imp', from: 7, n: 0.9, gap: 14 },
  { sp: 'torchgob', from: 8, n: 0.8, gap: 16 },
  { sp: 'hexer', from: 9, n: 0.22, gap: 40, heals: true, tip: 'Hexers heal everyone around them. Kill them first.' },
  { sp: 'slime', from: 9, n: 0.5, gap: 28 },
  { sp: 'troll', from: 10, n: 0.14, gap: 70, breaker: true, armor: 3 },
  { sp: 'delver', from: 11, n: 0.5, gap: 24, burrows: true, tip: 'Delvers dig under the ground where towers cannot see them. A Sun Shrine drives them up.' },
  { sp: 'broodsack', from: 12, n: 0.25, gap: 40, brood: true, tip: 'A Broodsack bursts into mites when it dies. Kill it far from the keep.' },
  { sp: 'wardbearer', from: 13, n: 0.2, gap: 40, wards: true, armor: 3, tip: 'Wardbearers shield those around them. Venom and the Sun Shrine get past the shield.' },
  { sp: 'griffin', from: 14, n: 0.25, gap: 36, air: true },
  { sp: 'ram', from: 15, n: 0.12, gap: 80, breaker: true, armor: 12, tip: 'Siege rams are heavily armoured and break walls. Arbalests and Trebuchets.' },
  { sp: 'flamewraith', from: 16, n: 0.35, gap: 30 },
  { sp: 'gloomrider', from: 18, n: 0.4, gap: 18, armor: 4, tip: 'Gloom riders are fast and armoured.' },
  { sp: 'golem', from: 20, n: 0.1, gap: 90, breaker: true, armor: 8 },
];
// every tenth wave a boss walks (or flies) in behind it, in turn
const BOSSES = [
  { sp: 'troll', hp: 4, breaker: true, armor: 5 },
  { sp: 'dragon', air: true },
  { sp: 'lich', hp: 1.6, summons: true, armor: 2 },
  { sp: 'ram', hp: 7, breaker: true, armor: 18 },
];
const ELITES = ['armoured', 'swift', 'mending'];
export const TRAIT_WORDS = { armor: 'armoured', heals: 'heals others', wards: 'shields others', burrows: 'burrows', brood: 'bursts into mites', summons: 'raises the dead', breaker: 'breaks walls', air: 'flies' };
const MAX_PER_WAVE = 150;

/** The plan for wave n: same n + difficulty always gives the same wave. Pure, so tests and the HUD's preview can read it. */
export function waveOf(n, hpK = 1) {
  const can = ROSTER.filter(r => r.from <= n);
  const hp = hpK * (1 + (n - 1) * 0.17) * Math.pow(1.042, n);
  const size = 8 + n * 1.9;
  const nGroups = n < 3 ? 1 : n < 9 ? 2 : n < 18 ? 3 : 4;
  // a type marches alone-ish on the wave it first appears, so the player sees what it does
  const fresh = can.filter(r => r.from === n);
  const picks = [...fresh];
  for (let k = 0; picks.length < nGroups && k < 12; k++) {
    const r = can[(n * (3 + k * 2) + (n >> 1) + k * 7) % can.length];
    if (!picks.includes(r)) picks.push(r);
  }
  const share = [1, 0.6, 0.45, 0.35];
  const gapK = Math.max(0.45, 1 - n / 50);
  let groups = picks.slice(0, nGroups).map((r, k) => ({ ...r, count: Math.max(1, Math.round(size * r.n * share[k])), hp, gap: Math.max(4, Math.round(r.gap * gapK)), armor: r.armor ? r.armor * (1 + n * 0.03) : 0 }));
  // past MAX_PER_WAVE the crowd gets tougher instead of bigger (phones have to draw them)
  const total = groups.reduce((a, g) => a + g.count, 0);
  if (total > MAX_PER_WAVE) { const k = MAX_PER_WAVE / total; for (const g of groups) { g.count = Math.max(1, Math.round(g.count * k)); g.hp /= Math.sqrt(k); } }
  // from wave 12 some of them are elites: armoured, swift or mending
  if (n >= 12) {
    const frac = Math.min(0.5, (n - 10) * 0.03);
    groups.forEach((g, k) => { g.elite = ELITES[(n + k) % ELITES.length]; g.eliteEvery = Math.max(2, Math.round(1 / frac)); });
  }
  // every tenth wave a boss; from wave 15, every fifth one in between brings two champions of the main kind
  if (n % 10 === 0) {
    const B = BOSSES[(n / 10 - 1) % BOSSES.length], round = Math.floor((n / 10 - 1) / BOSSES.length);
    if (B.air) groups.push({ sp: B.sp, count: 1 + round, gap: 60, hp: hpK * (0.7 + n / 25), boss: true, air: true });
    else groups.push({ ...B, count: 1 + round, gap: 60, hp: hp * B.hp, boss: true, armor: B.armor * (1 + n * 0.03) });
  } else if (n % 5 === 0 && n >= 15) {
    const m = groups[0];
    groups.push({ ...m, count: 2, gap: 40, hp: hp * 4, champion: true, armor: (m.armor || 2) + 3, elite: null });
  }
  return groups;
}
const bountyOf = (sp) => Math.max(1, Math.round(Math.sqrt(sp.hp) * 0.95));
const leakOf = (sp, boss) => (boss ? 5 : sp.hp >= 100 ? 3 : sp.hp >= 30 ? 2 : 1);
/** "12 Ironclad (armoured)" for the preview. */
export function describeGroup(g, species) {
  const bits = Object.keys(TRAIT_WORDS).filter(k => g[k]).map(k => TRAIT_WORDS[k]);
  if (g.elite) bits.push('some ' + g.elite);
  const name = species[g.sp].name;
  return `${g.boss ? 'BOSS: ' : g.champion ? 'champion ' : ''}${g.count} ${name}${bits.length ? ' (' + bits.join(', ') + ')' : ''}`;
}

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
    // a trap lies flat: it never blocks the road, so it never needs the road test
    if (!skipPath && K.group !== 'trap') {
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
    (K.cells || []).forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) st.cells.push({ i: (st.y + dy) * W + st.x + dx, m: KEY[row[dx]] }); });
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
  function enlist(c, g, elite) {
    c.runner = true; c.team = 'monster'; c.think = 0;
    c.breaker = !!g.breaker; c.boss = !!g.boss;
    const big = g.boss ? 10 : g.champion ? 4 : elite ? 1.5 : 1;
    c.bounty = Math.round(bountyOf(c.sp) * big); c.leak = g.champion ? 3 : leakOf(c.sp, g.boss);
    // c.td: everything Tower Defense adds to a creature; saved with it (realm.js saveWorld)
    c.td = { armor: +(g.armor || 0).toFixed(1), shield: 0 };
    for (const k of ['heals', 'wards', 'burrows', 'brood', 'summons']) if (g[k]) c.td[k] = 1;
    if (g.champion) c.td.champion = 1;
    if (elite) { c.td.elite = elite; if (elite === 'armoured') c.td.armor += 4 + T.wave * 0.1; if (elite === 'mending') c.td.mend = 1; if (elite === 'swift') c.td.swift = 1; }
    traitsOn(c);
    return c;
  }
  // what a saved td object turns back into on the creature
  function traitsOn(c) { c.speedK = c.td?.swift ? 1.35 : c.td?.champion ? 0.85 : 0; }
  // a slime splits in two; in Tower Defense only twice over (a late-wave slime would otherwise split six times, into 127)
  sim.on('split', (e) => {
    if (!e.c.runner) return;
    const gen = (e.c.td?.gen || 0) + 1;
    if (gen > 2) { C.remove(e.child); return; }
    enlist(e.child, { breaker: e.c.breaker, armor: e.c.td?.armor }); e.child.bounty = 1; e.child.td.gen = gen;
  });
  sim.on('death', (e) => {
    if (!e.c.runner && !e.c.towerBoss) return;
    if (e.cause === 'keep') return;
    T.gold += e.c.bounty || 0; T.kills++;
    // a broodsack bursts into mites where it fell
    if (e.c.td?.brood) for (let k = 0; k < 6; k++) {
      const m = C.add('mite', (e.c.x + (rng() - 0.5) * 4) | 0, (e.c.y + (rng() - 0.5) * 4) | 0, { hpScale: Math.max(1, e.c.maxHp / e.c.sp.hp * 0.5), team: 'monster' });
      if (m) { enlist(m, {}); m.bounty = 1; }
    }
  });
  sim.on('fled', (e) => { if (e.c.towerBoss) { T.gold += e.c.bounty || 0; } });

  function spawnOne(g, at, elite) {
    const x = at.x + ((rng() * 5) | 0) - 2, y = at.y + ((rng() * 5) | 0) - 2;
    const c = C.add(g.sp, x, y, { hpScale: g.hp * (elite ? 1.4 : 1), team: 'monster', goal: g.boss && g.air ? T.keep : undefined });
    if (!c) return;
    if (g.boss && g.air) { c.towerBoss = true; c.bounty = 120 + T.wave * 4; c.td = { armor: 0, shield: 0 }; }
    else enlist(c, g, elite);
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
      for (let k = 0; k < g.count; k++) { T.queue.push({ at, g, gate: gates[k % gates.length], elite: g.elite && k % g.eliteEvery === g.eliteEvery - 1 ? g.elite : null }); at += g.gap; }
      at += 40;
    }
    T.active = true;
    T.dirty = true;
    const fresh = Object.values(KIND).filter(K => K.fromWave === T.wave);
    if (fresh.length) sim.fire('structures-new', { names: fresh.map(K => K.name) });
    for (const r of ROSTER) if (r.from === T.wave && r.tip) sim.fire('enemy-new', { name: s.data.species[r.sp].name, tip: r.tip });
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
  // every tower hit goes through here: a ward's shield soaks it first, then armour takes a flat amount off (a fifth always
  // gets through). pierce (Arbalest, Venom, Sun Shrine) skips both. Tar doubles fire.
  function strike(c, dmg, cause, pierce) {
    if (!c.alive) return;
    const t = c.td;
    if (t && !pierce) {
      if (t.shield > 0) { const a = Math.min(t.shield, dmg); t.shield -= a; dmg -= a; if (dmg <= 0) { c.hurtFlash = 2; return; } }
      if (t.armor) dmg = Math.max(dmg * 0.2, dmg - t.armor);
    }
    if (cause === 'fire' && c.tarT > 0) dmg *= 2;
    C.hurt(c, dmg, cause, 'tower');
  }
  T.strike = strike;   // tests
  const seen = (c) => c.team === 'monster' && !c.under;
  function targetFor(st) {
    const r = rangeOf(st), min = st.K.minRange ?? 0;
    let best = null, bd = Infinity;
    C.near(st.cx, st.cy, r, (c, d2) => {
      if (!seen(c) || (c.sp.flies && !st.K.air) || (min && d2 < min * min)) return;
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
    sim.api.later(() => {
      if (!t.alive) return;
      if (K.fire === 'venom') { poison(t, dmg); return; }
      strike(t, dmg, 'arrow', !!K.pierce);
    }, Math.round(T2));
    sim.fire('shoot', { c: { x: st.cx, y: st.cy }, kind: 'arrow' });
  }
  function shootBomb(st, t) {
    const K = st.K;
    const lead = 20, x = t.x + (t.vx || 0) * lead, y = t.y + (t.vy || 0) * lead;
    const d = Math.hypot(x - st.cx, y - st.cy), TT = Math.max(8, d / (K.speed ?? 0.9)), g = 0.04;
    spawn(sim.ps, { kind: P.spark, x: st.cx, y: st.cy - 3, z: 4, vx: (x - st.cx) / TT, vy: (y - st.cy + 3) / TT, vz: (0.5 * g * TT * TT - 4) / TT, grav: g, life: TT, rgb: [60, 50, 60] });
    sim.api.later(() => {
      const dmg = dmgOf(st);
      C.near(x, y, K.splash, (c) => { if (seen(c) && !c.sp.flies) strike(c, dmg, 'blast'); });
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
      if (!seen(c) || c.sp.flies) return;
      strike(c, dmg, 'fire'); hit++;
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
      if (!seen(c)) return;
      strike(c, dmg, 'frost'); hit++;
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
      strike(cur, dmg, 'lightning');
      dmg *= 0.7;
      const from = cur;
      cur = C.nearest(from.x, from.y, 14, (o) => seen(o) && !hitSet.has(o));
    }
    (w.bolts ||= []).push({ pts, ttl: 8, color: [190, 220, 255] });
    sim.fire('shoot', { c: { x: st.cx, y: st.cy }, kind: 'bolt' });
  }
  // venom: stacks of poison that ignore armour and shields, five at most, each for 4 s
  function poison(c, dps) {
    const t = c.td ||= { armor: 0, shield: 0 };
    const list = (t.pois ||= []).filter(p => p[1] > sim.tick);
    list.push([dps, sim.tick + 4 * TPS]);
    list.sort((a, b) => b[0] - a[0]);
    t.pois = list.slice(0, 5);
    c.hurtFlash = 2;
  }
  // the Sun Shrine: a pulse that burns the dead three times over, strips wards and drags delvers up
  function shootSun(st) {
    const r = rangeOf(st), dmg = dmgOf(st);
    let hit = 0;
    C.near(st.cx, st.cy, r, (c) => {
      if (c.team !== 'monster') return;
      if (c.td) { c.td.shield = 0; c.td.reveal = sim.tick + 3 * TPS; }
      c.under = false;
      strike(c, dmg * (c.sp.undead ? 3 : 1), 'holy', true); hit++;
    });
    if (hit) { (w.rings ||= []).push({ x: st.cx, y: st.cy, max: r, ttl: 12, life: 12, color: [255, 230, 140] }); w.lights.push({ x: st.cx, y: st.cy, r: 255, g: 220, b: 120, rad: r, ttl: 6, max: 6 }); }
    return hit > 0;
  }
  // traps sit flat on the road: whatever walks over them is hurt (spikes) or slowed and made to burn twice as hard (tar)
  function trapStep(st) {
    if ((sim.tick + st.id) % 10) return;
    const K = st.K, half = K.size * G / 2 + 0.6;
    C.near(st.cx, st.cy, half * 1.5, (c) => {
      if (c.team !== 'monster' || c.sp.flies || Math.abs(c.x - st.cx) > half || Math.abs(c.y - st.cy) > half) return;
      if (K.dmg) strike(c, dmgOf(st), 'spike');
      if (K.slow) { c.slowT = Math.max(c.slowT || 0, 20); c.slowK = K.slow; c.tarT = 90; }
    });
  }
  // what the enemies' own traits do, a few times a second
  function traitStep() {
    const now = sim.tick;
    for (const c of C.list) {
      if (!c.alive || !c.td) continue;
      const t = c.td;
      if (c.tarT > 0) c.tarT -= 5;
      if (t.pois?.length) {
        let dps = 0;
        t.pois = t.pois.filter(p => p[1] > now);
        for (const p of t.pois) dps += p[0];
        if (dps) C.hurt(c, dps / 6, 'poison', 'tower');
        if (!c.alive) continue;
      }
      if (t.mend && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.012 / 6 * 5);
      // a delver spends 2.5 s of every 6 under the ground, unless a Sun Shrine has it in sight
      if (t.burrows) {
        const ph = (now + c.id * 37) % (6 * TPS);
        c.under = ph < 2.5 * TPS && !(t.reveal > now);
      }
      if (t.heals && (now + c.id) % 45 < 5) {
        let n = 0;
        C.near(c.x, c.y, 10, (o) => { if (o.runner && o.alive && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o.boss ? 0.02 : 0.06)); n++; } });
        if (n) (w.rings ||= []).push({ x: c.x, y: c.y, max: 10, ttl: 10, life: 10, color: [120, 255, 140] });
      }
      if (t.wards && (now + c.id) % 180 < 5) {
        C.near(c.x, c.y, 9, (o) => { if (o.runner && o.alive && o.td) o.td.shield = Math.max(o.td.shield, o.maxHp * 0.3); });
        (w.rings ||= []).push({ x: c.x, y: c.y, max: 9, ttl: 12, life: 12, color: [130, 210, 255] });
      }
      if (t.summons && (now + c.id) % 120 < 5) {
        for (let k = 0; k < 2; k++) {
          const sk = C.add('skeleton', (c.x + (rng() - 0.5) * 6) | 0, (c.y + (rng() - 0.5) * 6) | 0, { hpScale: Math.max(1, waveOf(T.wave, D.hp)[0].hp * 0.7), team: 'monster' });
          if (sk) { enlist(sk, { armor: 1 }); sk.bounty = 1; burst(sim.ps, rng, sk.x, sk.y, 6, { kind: P.mote, life: 14, rgb: [120, 255, 150], glow: 1, speed: 0.3 }); }
        }
      }
    }
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
    if (K.group === 'trap') return trapStep(st);
    if (!K.fire || K.fire === 'aura') return;
    if (--st.cd > 0) return;
    st.cd = rateOf(st) * TPS;
    if (K.fire === 'mend') return mend(st);
    if (K.fire === 'sun') return void (shootSun(st) || (st.cd = 6));
    if (K.fire === 'flame') return void (shootFlame(st) || (st.cd = 6));
    if (K.fire === 'frost') return void (shootFrost(st) || (st.cd = 6));
    const t = targetFor(st);
    if (!t) { st.cd = 5; return; }
    if (K.fire === 'arrow' || K.fire === 'venom') shootArrow(st, t);
    else if (K.fire === 'bomb') shootBomb(st, t);
    else if (K.fire === 'chain') shootChain(st, t);
    else if (K.fire === 'missile') { if (t.td?.shield) t.td.shield = Math.max(0, t.td.shield - dmgOf(st) * K.count); C.missile(st.cx, st.cy - 3, 3, t, dmgOf(st), 'player', hexRgb(K.color)); for (let k = 1; k < K.count; k++) C.missile(st.cx, st.cy - 3, 3, t, dmgOf(st), 'player', hexRgb(K.color), k * 3); }
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
      while (T.queue.length && T.queue[0].at <= sim.tick) { const q = T.queue.shift(); spawnOne(q.g, q.gate, q.elite); }
    }
    for (const st of T.structures) towerStep(st);
    if (sim.tick % 5 === 0) traitStep();
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
    sim.fire('keep-hit', { lives: T.lives, x: T.keep.x, y: T.keep.y, by: c.sp.id, n });
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
      if (K.pierce || K.fire === 'venom' || K.fire === 'sun') bits.push('Goes through armour');
      if (K.slow) bits.push('Slows what walks over it');
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
    /** After a won game: the same keep carries on with no last wave. */
    keepGoing() { T.length = 0; s.setup.length = '0'; s.result = null; },
    sendNow() { if (T.active) return; T.gold += Math.ceil(T.until / TPS / 2); T.until = 0; },
    panel() {
      const groups = waveOf(T.wave + 1, D.hp).map(g => describeGroup(g, s.data.species)).join(', ');
      return { title: run.progress(), rows: [`Next: ${groups}`, `Gold ${T.gold} · Lives ${T.lives}/${T.livesMax} · ${T.kills} defeated`], tip: 'Enemies always take the shortest open road, shown as moving dots. Stretch it with walls so they spend longer under your towers. Armoured enemies shrug off small hits: mix your towers. Tap a tower with Look, or with any structure, to upgrade or sell it.' };
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
      for (const st of T.structures) if (st.K.group === 'trap') {
        const n = st.K.size * G, tar = !!st.K.slow;
        for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) {
          if (tar) { if ((xx * 7 + yy * 3) % 4) api.px(st.x + xx, st.y + yy, 30, 22, 30, 0); }
          else if ((xx + yy) % 2 === 0) api.px(st.x + xx, st.y + yy, 190, 195, 205, 0.15);
        }
      }
      for (const c of C.list) {
        if (!c.alive || !c.td) continue;
        if (c.under) { api.px(c.x, c.y, 110, 80, 50, 0); api.px(c.x - 1, c.y, 90, 65, 40, 0); api.px(c.x + 1, c.y, 90, 65, 40, 0); continue; }
        const top = c.y - c.sp.sprite.h - (c.z || 0) * 0.7;
        if (c.td.shield > 0) for (let k = -1; k <= 1; k++) api.px(c.x + k, top - 1, 130, 210, 255, 0.8);
        if (c.td.elite || c.td.champion) api.px(c.x, top - 2, 255, c.td.champion ? 120 : 220, 60, 0.9);
        if (c.td.pois?.length) api.px(c.x + 1, top, 150, 255, 80, 0.7);
      }
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
    relink(c, extra) { c.runner = !!extra.run; c.breaker = !!extra.breaker; c.bounty = extra.bounty; c.leak = extra.leak; c.boss = !!extra.boss; c.towerBoss = !!extra.towerBoss; if (extra.towerBoss) c.goal = T.keep; c.td = extra.td || null; traitsOn(c); },
  };
  return run;
}
