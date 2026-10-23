// CROW COUNT — four rounds of "how many are left?". Each round a few crows sit in a cornfield, then for a few seconds
// crows flap in and land, others take off and leave, and (from normal difficulty) some just fly straight across
// without landing. When the flapping stops the field is hidden and everyone guesses how many crows are STILL in the
// field with big - / + buttons. Exact = 5 points, one off = 3, two off = 1; the closest guess of the round (2+ players,
// ties share) gets +2 more. Later rounds are busier. Alone it is a score attack out of 20 with medals.
//
// The whole round is a script made from the seed: landing spots, the crows already sitting there, and a list of
// [time, kind, spot, side] events (kind 'i' lands on a free spot, 'o' leaves from a sitting spot, 'p' passes over).
// Every screen plays the same script, so everyone sees the same crows.
export const meta = {
  id: 'crow-count', title: 'Crow Count', blurb: 'Crows come and go. How many are left in the field?',
  how: ['Watch the field: crows fly in and land, others fly away.', 'Some just fly over. They do not count!', 'When it stops, guess how many crows are left with - and +.', 'Spot on = 5 points. Closest guess gets a bonus!'],
  kind: 'ui', min: 1, max: 4, seconds: 76, scoring: 'points', unit: 'points', tags: ['puzzle', 'social'], card: 'card-crow-count', css: true,
};
export const ROUNDS = 4, START_S = 2, GUESS_S = 8, REVEAL_S = 3.5, END_S = 3, MAX_GUESS = 30;
export const WATCH_S = [4.5, 5.5, 6.5, 7.5];
export const POINTS = [5, 3, 1], CLOSEST_BONUS = 2;
export const PASS = 1.6;            // a flyover takes this many flights to cross
const LEVEL = {
  easy: { start: [[2, 3], [2, 4], [3, 5], [3, 6]], events: r => 3 + r, pass: 0, burst: 0, fly: 1.2 },
  normal: { start: [[2, 4], [3, 5], [4, 7], [5, 8]], events: r => 4 + 2 * r, pass: 0.18, burst: 0.2, fly: 1.0 },
  hard: { start: [[3, 5], [4, 7], [5, 8], [6, 10]], events: r => 6 + 2 * r, pass: 0.25, burst: 0.35, fly: 0.8 },
};
export const levelOf = d => LEVEL[d] ? d : 'normal';

/** Points for one guess (null = none). */
export const pointsFor = (guess, n) => guess == null ? 0 : (POINTS[Math.abs(guess - n)] ?? 0);

/** One round's script: { W, fly, spots: [[x%, y%]], start: [spot], ev: [[t, kind, spot, side]] , n } */
export function makeRound(rng, r, difficulty = 'normal') {
  const L = LEVEL[levelOf(difficulty)], W = WATCH_S[r];
  const spots = [];
  for (let tries = 0; spots.length < 18 && tries < 600; tries++) {
    const x = Math.round(rng.range(8, 92)), y = Math.round(rng.range(48, 90));
    if (x > 42 && x < 58 && y < 72) continue;                          // the scarecrow stands there
    if (spots.every(([a, b]) => Math.hypot((a - x) * 0.9, (b - y) * 1.6) > 13)) spots.push([x, y]);
  }
  const [lo, hi] = L.start[r];
  const start = rng.shuffle(spots.map((_, i) => i)).slice(0, rng.int(lo, hi));
  const sitting = new Set(start), ev = [], busy = {};
  const count = L.events(r), t0 = 0.5, t1 = W - L.fly - 0.3;
  let t = t0;
  for (let e = 0; e < count; e++) {
    t = Math.min(t1, t0 + (t1 - t0) * (e + rng.range(0.1, 0.9)) / count);
    const n = rng.chance(L.burst) ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const at = Math.round((t + j * 0.18) * 100) / 100;
      // a spot is free once its last crow has gone (plus a flight); a crow may leave once it has landed and settled
      const free = spots.map((_, i) => i).filter(i => !sitting.has(i) && at >= (busy[i] ?? -9));
      const leavers = [...sitting].filter(i => at >= (busy[i] ?? -9));
      let kind = rng.chance(L.pass) ? 'p' : rng.chance(0.5) ? 'i' : 'o';
      if (kind === 'o' && (sitting.size <= 1 || !leavers.length)) kind = 'i';
      if (kind === 'i' && !free.length) kind = leavers.length && sitting.size > 1 ? 'o' : 'p';
      const side = rng.chance(0.5) ? 1 : -1;
      if (kind === 'p') { ev.push([Math.min(at, Math.round((W - PASS * L.fly - 0.1) * 100) / 100), 'p', rng.int(8, 30), side]); continue; }
      const s = kind === 'i' ? rng.pick(free) : rng.pick(leavers);
      if (kind === 'i') sitting.add(s); else sitting.delete(s);
      busy[s] = at + L.fly + 0.3;
      ev.push([at, kind, s, side]);
    }
  }
  return { W, fly: L.fly, spots, start, ev, n: sitting.size };
}

/** Settle a round. guesses: pid -> number. -> { gain, closest: [pids], off } */
export function settleRound(guesses, n, pids) {
  const off = {}, gain = {};
  for (const p of pids) off[p] = guesses[p] == null ? null : Math.abs(guesses[p] - n);
  const given = pids.filter(p => off[p] != null), best = given.length ? Math.min(...given.map(p => off[p])) : null;
  const closest = pids.length > 1 && best != null && best <= 2 ? given.filter(p => off[p] === best) : [];
  for (const p of pids) gain[p] = pointsFor(guesses[p], n) + (closest.includes(p) ? CLOSEST_BONUS : 0);
  return { gain, closest, off };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, diff = levelOf(difficulty);
  const plan = Array.from({ length: ROUNDS }, (_, r) => makeRound(rng, r, diff));
  const total = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, guesses = {}, locked = new Set(), reveal = null;
  function settle() {
    const P = plan[round], r = settleRound(guesses, P.n, pids);
    for (const p of pids) total[p] += r.gain[p];
    reveal = { n: P.n, guesses: { ...guesses }, ...r };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo, max: MAX_GUESS, diff }),
    act(pid, a, d) {
      if (a !== 'guess' || phase !== 'guess' || !pids.includes(pid) || !d || typeof d !== 'object') return;
      if (!Number.isInteger(d.n) || d.n < 0 || d.n > MAX_GUESS) return;
      guesses[pid] = d.n;
      if (d.ok === true) locked.add(pid); else locked.delete(pid);
      if (pids.every(p => locked.has(p))) left = Math.min(left, 0.5);
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready' || phase === 'reveal') {
        if (round + 1 >= ROUNDS) { if (phase === 'reveal') { phase = 'end'; left = END_S; return; } }
        round++; phase = 'watch'; left = plan[round].W; guesses = {}; locked = new Set(); reveal = null;
      }
      else if (phase === 'watch') { phase = 'guess'; left = GUESS_S; }
      else if (phase === 'guess') settle();
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (phase === 'watch' || phase === 'reveal') { const { n, ...script } = plan[round]; g.script = script; if (phase === 'reveal') g.script.n = n; }
      if (phase === 'guess') { g.in = pids.filter(p => locked.has(p)); g.typing = pids.filter(p => guesses[p] != null && !locked.has(p)); }
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv: pid => ({ guess: phase === 'guess' ? guesses[pid] ?? null : null, ok: locked.has(pid) }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
    _plan: plan,
  };
}
