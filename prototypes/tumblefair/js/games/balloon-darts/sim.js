// BALLOON DARTS — one tall cork board at the fair, balloons drifting up it, everyone throwing darts at the SAME
// balloons. Drag on the board to aim (the crosshair sits a little above your finger so you can see it), let go to
// throw. A dart takes a quarter of a second to land, so aim where the balloon is GOING. Red is 1, blue 2, green 3
// (smaller and quicker), gold 5 (rare, fast). Pop the same colour again and again for a CHAIN: x2, x3, up to x4. The
// black BOOM balloon costs 5 points (never below 0) and breaks your chain. First dart to land on a balloon gets it.
// Alone: a score attack with medals.
//
// TIMING (the Apple Bobbing way): every balloon's path is a fixed function of the game clock, in init, the same on the
// phone and the server. A phone counts its own clock and sends `throw` { x, y, t }; the server takes t only if it is not
// in the future (AHEAD_S) or too old (LAG_S), and lands the dart at t + FLY_S where the balloons were THEN. Darts land
// in time order (then by pid), so two players racing for one balloon is settled by who threw first.
export const meta = {
  id: 'balloon-darts', title: 'Balloon Darts', blurb: 'Pop the drifting balloons, chain the colours, and never hit the BOOM!',
  how: ['Drag on the board to aim, let go to throw a dart.', 'Red 1, blue 2, green 3, gold 5. Same colour again = a chain (x2, x3, x4)!', 'The black BOOM balloon costs 5 points.'],
  kind: 'ui', min: 1, max: 4, seconds: 56, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-balloon-darts', css: true,
  controls: { a: 'Throw' },
};
export const BW = 100, BH = 140;                       // the board, in its own units (portrait)
export const COUNT_S = 3, PLAY_S = 45, END_S = 3;
export const LAG_S = 0.8, AHEAD_S = 0.15, FLY_S = 0.25, COOL_S = 0.45;
export const COLOURS = {
  red: { pts: 1, r: 8, speed: 1 },
  blue: { pts: 2, r: 7.5, speed: 1.15 },
  green: { pts: 3, r: 6.2, speed: 1.35 },
  gold: { pts: 5, r: 5.6, speed: 1.7 },
  boom: { pts: -5, r: 8, speed: 0.9 },
};
export const CHAIN_MAX = 4;
export const LEVELS = {
  easy: { rise: 13, every: 0.55, boom: 0.06, hit: 1.25 },
  normal: { rise: 17, every: 0.5, boom: 0.1, hit: 1.1 },
  hard: { rise: 22, every: 0.45, boom: 0.15, hit: 1 },
};
export const MEDALS = [25, 50, 80];
const r2 = v => Math.round(v * 100) / 100;

/** Every balloon of the match: { id, c, t0, x0, v, a, w, ph } — fixed from the seed. */
export function makeBalloons(rng, difficulty = 'normal') {
  const L = LEVELS[difficulty] || LEVELS.normal, out = [];
  let t = 0.2, id = 0;
  while (t < PLAY_S) {
    const roll = rng(), c = id < 3 ? 'red' : roll < L.boom ? 'boom' : roll < L.boom + 0.07 ? 'gold' : roll < 0.42 ? 'red' : roll < 0.72 ? 'blue' : 'green';
    const ramp = 1 + Math.min(0.35, t / PLAY_S * 0.35);
    out.push({ id: id++, c, t0: r2(t), x0: r2(rng.range(14, BW - 14)), v: r2(L.rise * COLOURS[c].speed * ramp * rng.range(0.85, 1.15)), a: r2(rng.range(3, 11)), w: r2(rng.range(1, 2.6)), ph: r2(rng.range(0, 6.28)) });
    t += L.every * rng.range(0.6, 1.4) / ramp;
  }
  return out;
}
/** Where balloon b is at game time t, or null when it is not on the board. y grows downward, a balloon rises. */
export function balloonAt(b, t) {
  const s = t - b.t0, r = COLOURS[b.c].r;
  if (s < 0) return null;
  const y = BH + r - b.v * s;
  if (y < -r) return null;
  return [Math.max(r, Math.min(BW - r, b.x0 + b.a * Math.sin(b.w * s + b.ph))), y];
}
/** Which un-popped balloon a dart at (x, y) landing at time t hits (the nearest centre inside its radius), or null. */
export function hitAt(balloons, popped, x, y, t, hit = 1) {
  let best = null, bd = Infinity;
  for (const b of balloons) {
    if (popped.has(b.id) || b.t0 > t) continue;
    const p = balloonAt(b, t); if (!p) continue;
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d <= COLOURS[b.c].r * hit && d < bd) { bd = d; best = b; }
  }
  return best;
}
/** Score one pop for a player { score, chain: [colour, n] } -> points gained (negative for a boom). */
export function scorePop(pl, c) {
  if (c === 'boom') { const lost = Math.min(5, pl.score); pl.score -= lost; pl.chain = [null, 0]; pl.booms++; return -lost; }
  pl.chain = pl.chain[0] === c ? [c, Math.min(CHAIN_MAX, pl.chain[1] + 1)] : [c, 1];
  const got = COLOURS[c].pts * pl.chain[1]; pl.score += got; pl.pops++; return got;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const balloons = makeBalloons(rng, difficulty), popped = new Map();      // id -> pid
  const P = Object.fromEntries(pids.map(p => [p, { score: 0, chain: [null, 0], pops: 0, booms: 0, misses: 0, last: -9 }]));
  let phase = 'count', left = COUNT_S, el = 0, over = false, darts = [], did = 0;
  const events = [];
  function land(d) {
    const pl = P[d.pid], b = hitAt(balloons, popped, d.x, d.y, d.at, L.hit);
    if (!b) { pl.misses++; events.push({ e: 'miss', pid: d.pid, x: d.x, y: d.y }); return; }
    popped.set(b.id, d.pid);
    const got = scorePop(pl, b.c);
    events.push({ e: 'pop', pid: d.pid, id: b.id, c: b.c, got, ch: pl.chain[1], x: d.x, y: d.y });
  }
  return {
    events,
    init: () => ({ balloons, colours: COLOURS, bw: BW, bh: BH, play: PLAY_S, fly: FLY_S, cool: COOL_S, hit: L.hit, solo, medals: MEDALS }),
    act(pid, a, d) {
      if (a !== 'throw' || !P[pid] || phase !== 'play' || over) return;
      if (!d || typeof d !== 'object' || ![d.x, d.y].every(v => typeof v === 'number' && Number.isFinite(v))) return;
      if (d.x < 0 || d.x > BW || d.y < 0 || d.y > BH) return;
      let t = typeof d.t === 'number' && Number.isFinite(d.t) ? d.t : el;
      if (t > el + AHEAD_S || t < el - LAG_S) t = el;
      const pl = P[pid]; if (t < pl.last + COOL_S - 0.02) return;           // one dart at a time
      pl.last = t;
      darts.push({ id: ++did, pid, x: r2(d.x), y: r2(d.y), at: r2(t + FLY_S) });
      events.push({ e: 'throw', pid, x: r2(d.x), y: r2(d.y), at: r2(t + FLY_S) });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      const due = darts.filter(d => d.at <= el).sort((a, b) => a.at - b.at || a.pid - b.pid);
      if (due.length) { darts = darts.filter(d => d.at > el); due.forEach(land); }
      if (phase === 'play' && el >= PLAY_S + FLY_S) phase = 'end';
      if (phase === 'end' && el >= PLAY_S + END_S) over = true;
    },
    state() {
      const g = { phase, el: r2(el), left: phase === 'count' ? Math.max(0, Math.ceil(left)) : Math.max(0, Math.ceil(PLAY_S - el)) };
      g.sc = Object.fromEntries(pids.map(p => [p, P[p].score]));
      g.ch = Object.fromEntries(pids.map(p => [p, P[p].chain[1] ? [P[p].chain[0], P[p].chain[1]] : 0]));
      g.p = [];                                                         // pops of balloons that would still be on the board
      for (const [id, pid] of popped) if (balloonAt(balloons[id], el)) g.p.push([id, pid]);
      return g;
    },
    get over() { return over; },
    _P: P, get _el() { return el; }, _balloons: balloons, _popped: popped,
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, P[p].score])), groups = new Map();
      const key = p => P[p].score * 1000 + Math.min(999, P[p].pops);        // ties on points go to more balloons popped
      for (const p of pids) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const r = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
      if (solo) r.medal = MEDALS.filter(m => scores[pids[0]] >= m).length;
      return r;
    },
  };
}
