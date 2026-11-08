// PORTAL ROUTING — co-op. A marble rolls along a track that is broken by chasms; portals carry it across (it drops into
// one and pops out of the portal with the same letter). On the way it meets GATES: a gate is a junction with two ways
// out, and only the gate's owner can flip it (tap). One way is the road to the goal, the other runs to a pit or to a
// portal that leads nowhere good. The marble starts rolling by itself after a short "ready" moment, so the team has to
// flip the right gates before it gets there. A marble that drops comes back to the start; one that meets a gate set
// against it from behind bounces back. Six stages, each bigger; clear the goal number together. Fewer players = each
// owns more gates (a stage always has at least one gate per player).
//
// A stage is built so it can always be solved: the marble's route is laid first (a random walk, broken into 1-2
// portal hops), then gates are put ON that route, each with a decoy branch leading off into free cells. With every gate
// on its route arm the marble rolls start -> goal (checked by `runBall`, the same rules the live marble uses); with
// the starting gate settings it does not. Tests check thousands of stages.
//
// Round 12 (2026-10-24): 2 up / 2 down, "Didn't get it" + "too easy". Two fixes. (1) Every phone now draws WHERE THE
// MARBLE WILL GO with the gates as they are (`trace`, the same rules as `runBall`): a glowing trail from the marble
// through the portals, ending at the flag (green) or a pit (red). Flip a gate and the trail swings — cause and effect
// at a glance, no tracing rails by eye. (2) It is a race now: ten stages, the marble rolls faster each stage, the
// "get ready" pause is shorter, and the goal is 4 / 6 / 8 stages (easy / normal / hard) in the minute, so the team
// has to flip fast and the marble is never a long wait.
//
// Expansion 1 M4 (2026-11-07): rated "confusing", "too easy" and "unfair". Shared gates split by owner left some
// players with nothing to tap while one flipped everything, the full trail made each stage a single flip-until-green,
// and everyone got the same score whatever they did. Now it is a RACE: every player gets the SAME ten stages on their
// own board, every gate on it is theirs, and the first to roll their marble home moves on — score = stages cleared.
// The trail shows only as far as the next portal on normal and hard (you work out where the portal comes out), the
// whole way on easy. Alone you race Pip, a computer marble-roller who flips one gate at a time at a steady pace.
export const meta = {
  id: 'portal-routing', title: 'Portal Routing', blurb: 'Race to roll your marble through the portals to the flag — flip your gates fast!',
  how: ['Everyone gets the same boards. Tap a gate to flip which way it points.', 'The glowing trail shows where your marble will roll — up to the next portal.', 'Reach the flag to go on to the next board. Most boards cleared wins!'],
  kind: 'ui', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'boards', tags: ['puzzle', 'action'], card: 'card-portal-routing', css: true, rival: true,
};
export const W = 7, H = 6;
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];              // sides: 0 N, 1 E, 2 S, 3 W
export const opp = d => (d + 2) & 3;
export const STAGES = [
  { gates: 2, portals: 1, speed: 3.4 }, { gates: 3, portals: 1, speed: 3.7 }, { gates: 3, portals: 2, speed: 4.0 },
  { gates: 4, portals: 1, speed: 4.3 }, { gates: 4, portals: 2, speed: 4.6 }, { gates: 5, portals: 2, speed: 4.9 },
  { gates: 4, portals: 2, speed: 5.2 }, { gates: 5, portals: 1, speed: 5.5 }, { gates: 5, portals: 2, speed: 5.8 },
  { gates: 5, portals: 2, speed: 6.1 },
];
export const GAME_S = 60, FIRST_READY_S = 3, READY_S = 1.0, DROP_S = 0.9, CLEAR_S = 1.1;
/** Pip, the computer racer: seconds between its gate flips (and before its first one on a new board). */
export const CPU = 'cpu', CPU_NAME = 'Pip', CPU_FLIP = { easy: 3.0, normal: 2.2, hard: 1.5 };   // ~4.5 / 5.4 / 6.8 boards a minute

const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x;
const step = (i, d) => at(i % W + DX[d], ((i / W) | 0) + DY[d]);
const sides = m => [0, 1, 2, 3].filter(d => m & (1 << d));

/** Which side the marble leaves cell `c` by, having come in through side `inD` (-1 = it starts here). Gate settings in `st`. */
export function exitOf(c, inD, st) {
  switch (c.k) {
    case 't': return sides(c.m).find(d => d !== inD) ?? inD;
    case 'g': { const arm = c.arms[st[c.gate]]; if (inD === c.stem) return arm; if (inD === arm) return c.stem; return inD; }   // from behind on a shut arm: bounce
    case 'S': return inD < 0 ? sides(c.m)[0] : inD;                // the launcher bounces it back out
    default: return inD;                                           // portal / pit / goal: it stops in the middle
  }
}
/**
 * Roll the marble with fixed gate settings, a cell at a time, the same rules as the live game.
 * -> 'goal' | 'drop' | 'loop' (it would go round forever)
 */
export function runBall(stage, st) {
  const { cells, start } = stage; let c = start, inD = -1; const seen = new Set();
  for (let n = 0; n < 4000; n++) {
    const cell = cells[c];
    if (cell.k === 'G') return 'goal';
    if (cell.k === 'x') return 'drop';
    if (cell.k === 'p' && inD >= 0) { c = cell.twin; inD = -1; continue; }
    const key = c * 5 + inD + 1; if (seen.has(key)) return 'loop'; seen.add(key);
    const o = cell.k === 'p' ? sides(cell.m)[0] : exitOf(cell, inD, st), j = step(c, o);
    if (j < 0 || !cells[j] || !(cells[j].m & (1 << opp(o)))) return 'drop';
    c = j; inD = opp(o);
  }
  return 'loop';
}

/**
 * Where the marble goes from cell `c` (entered through side `inD`, -1 = sitting in its middle) with gate settings
 * `st`: the cells it passes, in order, as [cell, side in, side out] (a portal jump starts a new run at the twin), and
 * how it ends. The browser draws this as the "where it goes now" trail. -> { path: [[c, in, out]…], end }
 */
export function trace(stage, st, c = stage.start, inD = -1, stopAtPortal = false) {
  const { cells } = stage, path = [], seen = new Set();
  for (let n = 0; n < 400; n++) {
    const cell = cells[c];
    if (cell.k === 'G') { path.push([c, inD, -1]); return { path, end: 'goal' }; }
    if (cell.k === 'x') { path.push([c, inD, -1]); return { path, end: 'drop' }; }
    if (cell.k === 'p' && inD >= 0) { path.push([c, inD, -1]); if (stopAtPortal) return { path, end: 'portal' }; c = cell.twin; inD = -1; continue; }
    const key = c * 5 + inD + 1; if (seen.has(key)) return { path, end: 'loop' }; seen.add(key);
    const o = cell.k === 'p' ? sides(cell.m)[0] : exitOf(cell, inD, st), j = step(c, o);
    path.push([c, inD, o]);
    if (j < 0 || !cells[j] || !(cells[j].m & (1 << opp(o)))) return { path, end: 'drop' };
    c = j; inD = opp(o);
  }
  return { path, end: 'loop' };
}

/**
 * One stage: { cells: [cell|null], start, goal, gates: [cellIndex], ok: [arm index], st: [starting setting], speed }.
 * cell: { k: 't' track | 'g' gate | 'p' portal | 'x' pit | 'S' start | 'G' goal, m: side mask,
 *         gate: n, stem, arms: [side, side] (gates), twin, pair (portals), own: seat (gates) }
 */
export function makeStage(rng, def, seats) {
  const nGates = Math.max(def.gates, seats.length);
  for (let tries = 0; tries < 600; tries++) {
    const s = tryStage(rng, def.portals, nGates);
    if (!s) continue;
    // owners: round robin over the seats in a shuffled order, so the first gate is not always red's
    const order = rng.shuffle(seats);
    s.gates.forEach((ci, n) => { s.cells[ci].own = order[n % order.length]; });
    // starting settings: most gates wrong, and every owner has at least one wrong gate (everyone has a job)
    s.st = s.ok.map(ok => rng.chance(0.75) ? 1 - ok : ok);
    for (const seat of seats) { const mine = s.gates.map((ci, n) => n).filter(n => s.cells[s.gates[n]].own === seat); if (mine.length && mine.every(n => s.st[n] === s.ok[n])) { const n = rng.pick(mine); s.st[n] = 1 - s.ok[n]; } }
    if (runBall(s, s.ok) !== 'goal' || runBall(s, s.st) === 'goal') continue;
    s.speed = def.speed;
    return s;
  }
  throw new Error('portal-routing: could not build a stage');
}
function tryStage(rng, nPortals, nGates) {
  const cells = new Array(W * H).fill(null), used = i => i < 0 || cells[i] !== null;
  const free = i => i >= 0 && cells[i] === null;
  const route = [];                                                   // { i, in, out } along the marble's way
  let pair = 0, goalI = -1;
  // the launcher: on the west edge, pointing east
  let cur = at(0, rng.int(0, H - 1)), inD = -1;
  const startI = cur; cells[cur] = { k: 'S', m: 1 << 1 }; let out = 1;
  for (let seg = 0; seg <= nPortals; seg++) {
    // walk on from `cur` leaving by `out`
    const len = rng.int(4, 6) + (seg === 0 ? 1 : 0);
    let i = step(cur, out); if (!free(i)) return null;
    inD = opp(out);
    for (let n = 0; ; n++) {
      cells[i] = { k: 't', m: 1 << inD };
      const last = n >= len;
      const opts = [0, 1, 2, 3].filter(d => d !== inD && free(step(i, d)));
      if (last || !opts.length) {
        if (n < 3) return null;                                       // too short to be worth a segment
        if (seg === nPortals) { cells[i] = { k: 'G', m: 1 << inD }; route.push({ i, in: inD, out: -1 }); goalI = i; break; }
        // a portal here, its twin somewhere well away, not touching anything built
        const far = [...cells.keys()].filter(j => free(j) && Math.abs(j % W - i % W) + Math.abs(((j / W) | 0) - ((i / W) | 0)) >= 3 && [0, 1, 2, 3].every(d => !used(step(j, d)) || step(j, d) < 0) && [0, 1, 2, 3].some(d => free(step(j, d))));
        if (!far.length) return null;
        const j = rng.pick(far), od = rng.pick([0, 1, 2, 3].filter(d => free(step(j, d))));
        cells[i] = { k: 'p', m: 1 << inD, twin: j, pair }; cells[j] = { k: 'p', m: 1 << od, twin: i, pair }; pair++;
        route.push({ i, in: inD, out: -1 }); route.push({ i: j, in: -1, out: od });
        cur = j; out = od; break;
      }
      const straight = opts.includes(opp(inD)) && rng.chance(0.45) ? opp(inD) : rng.pick(opts);
      cells[i].m |= 1 << straight; route.push({ i, in: inD, out: straight });
      i = step(i, straight); inD = opp(straight);
    }
  }
  // gates: track cells on the route with a free side; never two gates side by side on the route
  const cand = route.map((r, n) => ({ ...r, n })).filter(r => cells[r.i].k === 't' && r.n > 0);
  const picked = [];
  for (const r of rng.shuffle(cand)) {
    if (picked.length >= nGates) break;
    if (picked.some(p => Math.abs(p.n - r.n) < 2)) continue;
    const ds = [0, 1, 2, 3].filter(d => d !== r.in && d !== r.out && free(step(r.i, d)));
    if (!ds.length) continue;
    const dd = rng.pick(ds);
    if (!decoy(rng, cells, step(r.i, dd), opp(dd), () => pair++)) continue;
    const arms = rng.chance(0.5) ? [r.out, dd] : [dd, r.out];
    cells[r.i] = { k: 'g', m: (1 << r.in) | (1 << r.out) | (1 << dd), stem: r.in, arms, okArm: arms.indexOf(r.out) };
    picked.push(r);
  }
  if (picked.length < nGates) return null;
  picked.sort((a, b) => a.n - b.n);                                  // gate numbers follow the marble's way
  const gates = picked.map(r => r.i), ok = gates.map(ci => cells[ci].okArm);
  gates.forEach((ci, n) => { cells[ci].gate = n; delete cells[ci].okArm; });
  return { cells, start: startI, goal: goalI, gates, ok };
}
/** A dead end off a gate: 1-3 cells of track, then a pit — or a portal whose twin drops straight into a pit. */
function decoy(rng, cells, i, inD, newPair) {
  const free = j => j >= 0 && cells[j] === null;
  if (!free(i)) return false;
  const made = [], len = rng.int(0, 2);
  let cur = i, d = inD;
  for (let n = 0; ; n++) {
    made.push(cur); cells[cur] = { k: 't', m: 1 << d };
    const opts = [0, 1, 2, 3].filter(e => e !== d && free(step(cur, e)));
    if (n >= len || !opts.length) break;
    const e = rng.pick(opts); cells[cur].m |= 1 << e; cur = step(cur, e); d = opp(e);
  }
  // the end: a portal (to a far pit) now and then, else a pit
  const tw = [...cells.keys()].filter(j => free(j) && [0, 1, 2, 3].some(e => free(step(j, e))) && [0, 1, 2, 3].every(e => step(j, e) < 0 || cells[step(j, e)] === null));
  if (made.length >= 2 && tw.length && rng.chance(0.4)) {
    const j = rng.pick(tw), e = rng.pick([0, 1, 2, 3].filter(f => free(step(j, f)))), pair = newPair();
    cells[cur] = { k: 'p', m: 1 << d, twin: j, pair }; cells[j] = { k: 'p', m: 1 << e, twin: cur, pair };
    cells[step(j, e)] = { k: 'x', m: 1 << opp(e) };
  } else cells[cur] = { k: 'x', m: 1 << d };
  return true;
}

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, pip = solo && rivals !== false;   // "Rival when alone" off: no Pip
  const racers = pip ? [...pids, CPU] : pids.slice();
  const stages = STAGES.map(def => makeStage(rng, def, [0]));
  const cpuFlip = CPU_FLIP[difficulty] || CPU_FLIP.normal, peek = difficulty === 'easy' ? 'all' : 'portal';
  let left = GAME_S, over = false, clock = 0;
  const events = [];
  /** One racer's own board: which stage, its gate settings, its marble. */
  function newRunner() { const r = { si: 0, st: stages[0].st.slice(), phase: 'ready', wait: FIRST_READY_S, cleared: 0, drops: 0, at: 0, flips: 0, think: cpuFlip + 0.6 }; reset(r); return r; }
  function reset(r) { const s = stages[r.si]; r.ball = { c: s.start, i: -1, o: exitOf(s.cells[s.start], -1, r.st), t: 0.5 }; }
  function begin(r, n) { r.si = n; r.st = stages[n].st.slice(); r.phase = 'ready'; r.wait = READY_S; r.think = cpuFlip + 0.4; reset(r); }
  const runners = new Map(racers.map(p => [p, newRunner()]));
  /** The marble reaches the middle of its cell. */
  function middle(r, pid) {
    const s = stages[r.si], cell = s.cells[r.ball.c];
    if (cell.k === 'G') { r.cleared++; r.at = clock; r.phase = 'clear'; r.wait = CLEAR_S; events.push({ e: 'goal', pid, n: r.cleared }); return false; }
    if (cell.k === 'x') { r.drops++; r.phase = 'drop'; r.wait = DROP_S; events.push({ e: 'drop', pid, c: r.ball.c }); return false; }
    if (cell.k === 'p' && r.ball.i >= 0) { events.push({ e: 'warp', pid, a: r.ball.c, b: cell.twin }); r.ball = { c: cell.twin, i: -1, o: sides(s.cells[cell.twin].m)[0], t: 0.5 }; }
    return true;
  }
  /** The marble reaches the edge of its cell: into the next one, or off the end of the track. */
  function edge(r, pid) {
    const s = stages[r.si], j = step(r.ball.c, r.ball.o);
    if (j < 0 || !s.cells[j] || !(s.cells[j].m & (1 << opp(r.ball.o)))) { r.drops++; r.phase = 'drop'; r.wait = DROP_S; events.push({ e: 'drop', pid, c: r.ball.c }); return false; }
    const inD = opp(r.ball.o), o = exitOf(s.cells[j], inD, r.st);
    if (s.cells[j].k === 'g' && o === inD) events.push({ e: 'bonk', pid, c: j });
    r.ball = { c: j, i: inD, o, t: 0 };
    return true;
  }
  function roll(r, pid, dist) {
    for (let guard = 0; dist > 1e-9 && guard < 20; guard++) {
      const target = r.ball.t < 0.5 ? 0.5 : 1, need = target - r.ball.t;
      if (dist < need) { r.ball.t += dist; return; }
      r.ball.t = target; dist -= need;
      if (!(target === 0.5 ? middle(r, pid) : edge(r, pid))) return;
    }
  }
  /** Pip: once every cpuFlip seconds, flips the first gate of its board that is set wrong. Never peeks ahead of the rules. */
  function cpuStep(r, dt) {
    if (r.phase === 'clear') return;
    r.think -= dt; if (r.think > 0) return;
    r.think = cpuFlip;
    const s = stages[r.si], n = s.ok.findIndex((ok, k) => r.st[k] !== ok);
    if (n >= 0) { r.st[n] = 1 - r.st[n]; r.flips++; }
  }
  function stepRunner(pid, r, dt) {
    if (pid === CPU) cpuStep(r, dt);
    if (r.phase === 'roll') { roll(r, pid, stages[r.si].speed * dt); return; }
    r.wait -= dt; if (r.wait > 0) return;
    if (r.phase === 'ready') r.phase = 'roll';
    else if (r.phase === 'drop') { reset(r); r.phase = 'roll'; }
    else if (r.phase === 'clear') { if (r.si + 1 >= stages.length) r.phase = 'done'; else begin(r, r.si + 1); }
  }
  return {
    events,
    init: () => ({ w: W, h: H, seconds: GAME_S, peek, solo, cpu: pip ? CPU_NAME : null, stages: stages.map(s => ({
      speed: s.speed, start: s.start, goal: s.goal, gates: s.gates,
      cells: s.cells.map(c => c && { k: c.k, m: c.m, ...(c.k === 'g' ? { gate: c.gate, stem: c.stem, arms: c.arms } : {}), ...(c.k === 'p' ? { twin: c.twin, pair: c.pair } : {}) }),
    })) }),
    act(pid, a, d) {
      if (over || a !== 'flip' || !pids.includes(pid)) return;
      const r = runners.get(pid), s = stages[r.si];
      if (r.phase === 'clear' || r.phase === 'done' || !Number.isInteger(d) || d < 0 || d >= s.gates.length) return;
      r.st[d] = 1 - r.st[d]; r.flips++;
      // a marble sitting in this gate already chose its way out on the way in: it keeps it
    },
    step(dt) {
      if (over) return;
      left -= dt; clock += dt;
      if (left <= 0) { left = 0; over = true; return; }
      for (const [pid, r] of runners) stepRunner(pid, r, dt);
      if ([...runners.values()].every(r => r.phase === 'done')) over = true;
    },
    state: () => ({ left: Math.max(0, Math.ceil(left)), r: Object.fromEntries([...runners].map(([p, r]) => [p, [r.si, r.phase, r.st.join(''), r.ball.c, r.ball.i, r.ball.o, Math.round(r.ball.t * 100), r.cleared]])) }),
    get over() { return over; },
    /** For tests. */
    stages, runners,
    result() {
      const key = p => runners.get(p);
      const ranked = pids.slice().sort((a, b) => key(b).cleared - key(a).cleared || key(a).at - key(b).at);
      const order = [];
      for (const p of ranked) { const g = order[order.length - 1], q = g && key(g[0]); if (q && q.cleared === key(p).cleared && (q.cleared === 0 || q.at === key(p).at)) g.push(p); else order.push([p]); }
      return { order, scores: Object.fromEntries(pids.map(p => [p, key(p).cleared])), unit: meta.unit };
    },
  };
}
