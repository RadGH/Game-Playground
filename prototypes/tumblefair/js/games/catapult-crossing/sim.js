// CATAPULT CROSSING — a STAIRCASE of stone blocks over an ENDLESS PIT: a grassy start ledge at the top, then twelve
// rows of blocks, each a step lower than the last, down to the goal ledge at the bottom. Each round one player works the CATAPULT on the cliff behind the start; everyone else is a RUNNER.
//   runners    cross the blocks from the top ledge to the bottom one. A = HOP (clears a one-block gap). A block with
//              no floor under you = you fall into the pit and are out for the round.
//   catapult   the stick moves a TARGET over the field; A = fire a boulder there (it lands after about a second — the
//              runners see the red ring at once, so it can always be dodged). The boulder smashes the block it lands
//              on (it shakes, then drops) and knocks anyone close by flying. B = a BIG boulder: smashes a plus of five
//              blocks, longer reload. The catapult may already fire during the "Get set" count (the runners wait on
//              the ledge and plan a way round the damage).
// Rounds: everyone takes one turn at the catapult (the order is shuffled from the seed). A round ends when every
// runner is home or in the pit, or after its time.
//   runner home (reached the bottom ledge)   5 points, +2 for the first one home
//   runner still on the blocks at the bell   1 point
//   catapult                                 3 points for every runner who falls
// Alone: three crossings with Old Bonkers, the fair's own catapult, aiming at you (it gets sharper each crossing).
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const COLS = 7, ROWS = 12, S = 1.4;                        // the block field: 7 x 12 blocks of 1.4 m
export const HW = COLS * S / 2, FZ0 = -ROWS * S / 2, FZ1 = ROWS * S / 2;   // field from z -8.4 (top) to +8.4 (bottom)
export const LEDGE = 2.2;                                         // start ledge above the field, goal ledge below it
export const STEP = 0.25;                                         // each row is this much lower than the one before
export const GOAL_Z = FZ1 + 0.35;                                 // over this line = home
export const CAT = { x: 0, y: 2.9, z: FZ0 - LEDGE - 2.4 };        // where boulders leave the catapult's bucket
export const meta = {
  id: 'catapult-crossing', title: 'Catapult Crossing', blurb: 'Cross the blocks over the pit while a friend fires the catapult!',
  how: ['One player fires the catapult; everyone else crosses the blocks.', 'Boulders smash blocks — fall in the pit and you are out.', 'A hops a gap. Reach the bottom ledge to score!', 'Everyone gets a turn at the catapult.'],
  kind: 'arena', min: 1, max: 4, seconds: 112, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Hop', b: 'Big shot' }, move: { speed: 3.2, accel: 30, stunDrag: 2.6, boostMul: 2.3 },
  arena: { shape: 'rect', hw: HW, hd: FZ1 + LEDGE, wall: true }, pitch: 60, card: 'card-catapult-crossing', css: true,
};
export const RULES = {
  ready: 3, round: { easy: 22, normal: 22, hard: 20 }, after: 2.2,          // 4 rounds x 27.2 s fit in meta.seconds
  holes: { easy: 12, normal: 16, hard: 20 },                      // blocks missing at the start of a round (of 84)
  flight: { easy: 1.25, normal: 1.05, hard: 0.95 },               // seconds a boulder is in the air (the warning)
  reload: { easy: 1.2, normal: 0.95, hard: 0.8 }, bigReload: 4.5,
  crack: 0.55,                                                    // a smashed block shakes this long, then drops
  hitR: 1.15, bigHitR: 1.6, push: 7.5, stun: 0.5,
  hop: { cool: 0.8, time: 0.42, h: 0.8 },                         // boosted (x2.3) for 0.42 s = about 3 m: clears one missing block
  fallG: 22, outY: -9,
  pts: { home: 5, first: 2, alive: 1, catch: 3 },
  solo: { rounds: 3, aim: [1.3, 0.85, 0.55], every: [2.0, 1.6, 1.25] },   // Old Bonkers: aim error (m) and fire gap per crossing
};
const r2 = v => Math.round(v * 100) / 100;
const SOLID = 0, CRACK = 1, GONE = 2;
/** The block under (x, z): its index, -1 on a ledge (solid ground), -2 outside everything. */
export function tileAt(x, z) {
  if (z < FZ0 || z >= FZ1) return Math.abs(x) <= HW + 0.01 && z >= FZ0 - LEDGE - 0.01 && z <= FZ1 + LEDGE + 0.01 ? -1 : -2;
  const c = Math.floor((x + HW) / S), r = Math.floor((z - FZ0) / S);
  return c < 0 || c >= COLS ? -2 : r * COLS + c;
}
/** Floor height at (x, z): 0 on the start ledge, one STEP lower each row, the goal ledge one step below the last row. */
export function floorY(z) {
  if (z < FZ0) return 0;
  if (z >= FZ1) return -(ROWS + 1) * STEP;
  return -(Math.floor((z - FZ0) / S) + 1) * STEP;
}
export const tileXZ = i => [-HW + S / 2 + (i % COLS) * S, FZ0 + S / 2 + Math.floor(i / COLS) * S];
/** Missing blocks for a round, with a 4-way path of whole blocks from the top row to the bottom row always left. */
export function holesFor(rng, count) {
  for (let tries = 0; tries < 60; tries++) {
    const gone = new Set(rng.shuffle([...Array(COLS * ROWS).keys()]).slice(0, count));
    if (pathExists(i => !gone.has(i))) return gone;
  }
  return new Set();
}
export function pathExists(ok) {
  const seen = new Set(), q = [];
  for (let c = 0; c < COLS; c++) if (ok(c)) { seen.add(c); q.push(c); }
  while (q.length) {
    const i = q.shift(), c = i % COLS, r = Math.floor(i / COLS);
    if (r === ROWS - 1) return true;
    for (const j of [c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1, i - COLS, i + COLS]) if (j >= 0 && j < COLS * ROWS && !seen.has(j) && ok(j)) { seen.add(j); q.push(j); }
  }
  return false;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.round[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), events = [];
  const order = solo ? Array(RULES.solo.rounds).fill(null) : rng.shuffle(players.map(p => p.pid));   // who fires, round by round (null = Old Bonkers)
  const P = new Map(players.map(p => [p.pid, { pts: 0, prevB: 0, cool: 0, hop: 0, stun: 0, falling: false, vy: 0, home: false, reload: 0, big: 0, fell: 0, homes: 0 }]));
  for (const p of players) bodies.set(p.pid, makeBody(0, FZ0 - 1, 0));
  const T = Array.from({ length: COLS * ROWS }, () => ({ st: SOLID, c: 0 }));
  let round = -1, phase = 'ready', phaseT = 0, el = 0, over = false, cat = null, boulders = [], bid = 0, firstHome = null, botIn = 1.5, homeSlot = 0;
  const flight = RULES.flight[D];
  const runners = () => players.filter(p => p.pid !== cat);
  const live = pid => { const s = P.get(pid); return !s.falling && !s.home; };

  function startRound() {
    round++; phase = 'ready'; phaseT = RULES.ready; cat = order[round]; boulders = []; firstHome = null; homeSlot = 0; botIn = 1.8;
    const gone = holesFor(rng, RULES.holes[D]);
    T.forEach((t, i) => { t.st = gone.has(i) ? GONE : SOLID; t.c = 0; });
    const rs = runners(), m = rs.length;
    rs.forEach((p, i) => {
      const b = bodies.get(p.pid), s = P.get(p.pid);
      Object.assign(b, makeBody(m === 1 ? 0 : -HW + 1.2 + i * (2 * HW - 2.4) / (m - 1), FZ0 - 1.1, 0)); b.flags = F.FROZEN;
      Object.assign(s, { cool: 0, hop: 0, stun: 0, falling: false, vy: 0, home: false });
    });
    if (cat != null) { const b = bodies.get(cat), s = P.get(cat); Object.assign(b, makeBody(0, 0, Math.PI)); b.flags = F.BOOST | F.GHOST; Object.assign(s, { falling: false, home: false, reload: 0.6, big: 2, stun: 0, hop: 0 }); }
    events.push({ e: 'round', r: round, cat });
  }
  function crack(i) { const t = T[i]; if (!t || t.st !== SOLID) return; t.st = CRACK; t.c = 0; }
  function fire(x, z, big, by) {
    x = Math.max(-HW + 0.3, Math.min(HW - 0.3, x)); z = Math.max(FZ0 - LEDGE + 0.3, Math.min(FZ1 + LEDGE - 0.3, z));
    const b = { id: ++bid, x: r2(x), z: r2(z), t: flight, big: big ? 1 : 0, by };
    boulders.push(b); events.push({ e: 'fire', id: b.id, x: b.x, z: b.z, t: flight, big: b.big, by });
  }
  function land(b) {
    const i = tileAt(b.x, b.z);
    if (i >= 0) { crack(i); if (b.big) { const c = i % COLS; if (c > 0) crack(i - 1); if (c < COLS - 1) crack(i + 1); crack(i - COLS); crack(i + COLS); } }
    const R = b.big ? RULES.bigHitR : RULES.hitR, hit = [];
    for (const p of runners()) {
      const s = P.get(p.pid), c = bodies.get(p.pid); if (!live(p.pid) || s.hop > 0) continue;
      const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); if (d > R) continue;
      const ux = d > 0.05 ? dx / d : Math.sin(c.yaw), uz = d > 0.05 ? dz / d : Math.cos(c.yaw), k = RULES.push * (1 - d / R * 0.4);
      c.vx = ux * k; c.vz = uz * k; c.flags |= F.STUN; s.stun = RULES.stun; hit.push(p.pid);
    }
    events.push({ e: 'land', id: b.id, x: b.x, z: b.z, big: b.big, hit });
  }
  function startFall(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.falling = true; s.vy = 0.4; s.fell++; b.flags |= F.STUN; b.flags &= ~F.AIR;
    if (cat != null) P.get(cat).pts += RULES.pts.catch;
    events.push({ e: 'fall', pid, x: r2(b.x), z: r2(b.z), by: cat });
  }
  function goHome(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.home = true; s.homes++; s.pts += RULES.pts.home;
    const first = firstHome == null; if (first) { firstHome = pid; s.pts += RULES.pts.first; }
    // step off the field: stand in a side corner of the goal ledge, out of the way of the runners still coming
    const slot = homeSlot++; b.x = (slot % 2 ? 1 : -1) * (HW - 0.55); b.z = FZ1 + 0.95 + Math.floor(slot / 2) * 0.95;   // the goal ledge's side corners b.vx = b.vz = 0; b.yaw = 0; b.flags = F.FROZEN; b.y = floorY(b.z);
    events.push({ e: 'home', pid, first: first ? 1 : 0, add: RULES.pts.home + (first ? RULES.pts.first : 0) });
  }
  function endRound() {
    for (const p of runners()) if (live(p.pid)) { P.get(p.pid).pts += RULES.pts.alive; events.push({ e: 'alive', pid: p.pid }); }
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    phase = 'after'; phaseT = RULES.after; boulders = [];
    events.push({ e: 'roundEnd', r: round });
  }
  startRound();

  return {
    bodies, events,
    init: () => ({ solo, order, cols: COLS, rows: ROWS, size: S, flight, reload: RULES.reload[D], rounds: order.length, left: meta.seconds }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pA = (bits & IN.A) && !(s.prevB & IN.A), pB = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (pid === cat) {
        stepBody(b, inp, meta.move, meta.arena);
        if (phase === 'after') return;                              // the catapult may fire in the "Get set" count too
        if (pA && s.reload <= 0) { fire(b.x, b.z, false, pid); s.reload = RULES.reload[D]; }
        else if (pB && s.big <= 0 && s.reload <= 0) { fire(b.x, b.z, true, pid); s.big = RULES.bigReload; s.reload = RULES.reload[D]; }
        return;
      }
      if (phase === 'play' && pA && live(pid) && s.cool <= 0 && !(b.flags & F.STUN)) {
        s.hop = RULES.hop.time; s.cool = RULES.hop.cool; b.flags |= F.AIR | F.BOOST; events.push({ e: 'hop', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      el += dt; phaseT -= dt;
      if (phase === 'ready' && phaseT <= 0) { phase = 'play'; phaseT = RULES.round[D]; for (const p of runners()) bodies.get(p.pid).flags &= ~F.FROZEN; events.push({ e: 'go', r: round }); }
      if (phase === 'after') {
        if (phaseT <= 0) { if (round + 1 < order.length) startRound(); else { over = true; events.push({ e: 'end' }); } }
        // let a faller finish falling
        for (const [pid, b] of bodies) { const s = P.get(pid); if (s.falling && !(b.flags & F.OUT)) { s.vy -= RULES.fallG * dt; b.y = r2(b.y + s.vy * dt); if (b.y < RULES.outY) b.flags = F.OUT; } }
        return;
      }
      // ---- get set + play: boulders fly, smashed blocks drop
      separate(runners().filter(p => live(p.pid)).map(p => bodies.get(p.pid)));
      if (cat != null) { const s = P.get(cat); s.reload = Math.max(0, s.reload - dt); s.big = Math.max(0, s.big - dt); }
      else {                                                       // solo: Old Bonkers aims at you
        botIn -= dt;
        const me = players[0].pid, b = bodies.get(me);
        if (botIn <= 0 && live(me)) {
          const lvl = Math.min(round, 2), err = RULES.solo.aim[lvl] * (D === 'easy' ? 1.3 : D === 'hard' ? 0.8 : 1);
          const lead = flight * 0.7, a = rng() * Math.PI * 2, d = rng() * err;
          if (phase === 'ready') { const [x, z] = tileXZ(rng.int(1, 5) * COLS + rng.int(0, COLS - 1)); fire(x, z, false, null); }   // a warm-up shot at the field
          else fire(b.x + b.vx * lead + Math.cos(a) * d, b.z + b.vz * lead + Math.sin(a) * d, round >= 1 && rng() < 0.2, null);
          botIn = RULES.solo.every[lvl] * (D === 'easy' ? 1.25 : D === 'hard' ? 0.85 : 1);
        }
      }
      for (const bo of boulders) { bo.t -= dt; if (bo.t <= 0) land(bo); }
      boulders = boulders.filter(bo => bo.t > 0);
      for (let i = 0; i < T.length; i++) { const t = T[i]; if (t.st === CRACK) { t.c += dt; if (t.c >= RULES.crack) { t.st = GONE; events.push({ e: 'drop', i }); } } }
      if (phase === 'ready') return;
      for (const p of runners()) {
        const pid = p.pid, s = P.get(pid), b = bodies.get(pid);
        if (s.home) continue;
        if (s.falling) { if (!(b.flags & F.OUT)) { s.vy -= RULES.fallG * dt; b.y = r2(b.y + s.vy * dt); if (b.y < RULES.outY) { b.flags = F.OUT; b.vx = b.vz = 0; } } continue; }
        s.cool = Math.max(0, s.cool - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.hop > 0) {
          s.hop -= dt; const k = 1 - Math.max(0, s.hop) / RULES.hop.time; b.y = r2(floorY(b.z) + Math.max(0, 4 * RULES.hop.h * k * (1 - k)));
          if (s.hop <= 0) { s.hop = 0; b.flags &= ~(F.AIR | F.BOOST); }
          else continue;                                            // in the air: no floor needed
        }
        b.y = floorY(b.z);
        if (b.z >= GOAL_Z) { goHome(pid); continue; }
        const i = tileAt(b.x, b.z);
        if (i === -2 || (i >= 0 && T[i].st === GONE)) startFall(pid);
      }
      const left = runners().filter(p => live(p.pid)).length;
      const falling = runners().some(p => P.get(p.pid).falling && !(bodies.get(p.pid).flags & F.OUT));
      if ((left === 0 && !falling) || phaseT <= 0) endRound();
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      let t = ''; for (const x of T) t += x.st === SOLID ? '0' : x.st === CRACK ? '1' : 'x';
      const cs = cat != null ? P.get(cat) : null;
      return {
        sc, t, r: round, ph: phase, cat, left: Math.max(0, Math.ceil(phaseT)),
        bo: boulders.map(b => [b.id, b.x, b.z, r2(b.t), b.big]),
        rl: cs ? [r2(cs.reload), r2(cs.big)] : null,
        home: runners().filter(p => P.get(p.pid).home).map(p => p.pid), out: runners().filter(p => P.get(p.pid).falling).map(p => p.pid),
      };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).pts; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get round() { return round; }, get phase() { return phase; }, get cat() { return cat; }, tiles: T, P,
  };
}
