// MERRY-GO-GUESS — five rounds of "count it in your head". A merry-go-round turns with its lights on, and its one
// GOLDEN horse passes the bell at the top. Then the lights go OUT: the ride keeps turning in the dark, and you ring
// the bell at the moment you think the golden horse is passing it again (after 1 or 2 more laps — the round says how
// many). The lights come back and show where the horse really was when each of you rang.
//   Round 1 steady · 2 fast, two laps · 3 slowing down · 4 speeding up, two laps · 5 slow and steady.
// Score: up to 10 points for how close you rang (0 once you are `slack` off, which grows a little with a longer
// wait), +3 for the closest ring of the round (2+ players, ties share). Your first ring is final. Alone: out of 50.
// The answer (when the horse gets there) is never in the state before the reveal; how the ride is turning is — that
// is what everyone watches. A phone's ring carries its own time since the lights went out, kept honest by the server.
export const meta = {
  id: 'merry-go-guess', title: 'Merry-Go-Guess', blurb: 'The lights go out — ring the bell just as the golden horse comes round!',
  how: ['Watch how fast the golden horse goes round. Then the lights go out.', 'Tap RING when you think it is passing the bell again.', 'Closest ring wins the round. Some rounds speed up or slow down!', 'Five rounds.'],
  kind: 'ui', min: 1, max: 4, seconds: 92, scoring: 'points', unit: 'points', tags: ['puzzle', 'action'], card: 'card-merry-go-guess', css: true,
};
export const TAU = Math.PI * 2;
export const ROUNDS = 5, START_S = 2, SHOW_S = 4.2, AFTER_S = 2.2, REVEAL_S = 4, END_S = 3;
export const CLOSEST_BONUS = 3, LAG_MAX = 700;
/** The five rounds: lap time at the start of the show (s), speed change (laps/s per s, signed), laps to count. */
export const PLAN = [
  { kind: 'steady', lap: [3.6, 4.4], acc: 0, laps: 1 },
  { kind: 'fast', lap: [1.9, 2.3], acc: 0, laps: 2 },
  { kind: 'slower', lap: [2.2, 2.6], acc: [-0.028, -0.018], laps: 1 },
  { kind: 'faster', lap: [3.6, 4.2], acc: [0.03, 0.045], laps: 2 },
  { kind: 'slow', lap: [5, 5.8], acc: 0, laps: 1 },
];
const r3 = v => Math.round(v * 1000) / 1000;

/** How far round the horse has gone (radians) t seconds after the show began. */
export const phaseAt = (R, t) => R.ps + R.w * t + 0.5 * R.a * t * t;
/** Seconds after the lights go out until the horse passes the bell for the `laps`-th time. */
export function answerOf(R) {
  const pd = phaseAt(R, SHOW_S), wd = R.w + R.a * SHOW_S, goal = TAU * (Math.floor(pd / TAU) + R.laps), d = goal - pd;
  if (Math.abs(R.a) < 1e-9) return d / wd;
  return (-wd + Math.sqrt(wd * wd + 2 * R.a * d)) / R.a;
}
/** Points for a ring `errMs` off when the answer was `ansS` seconds. */
export const slackMs = ansS => 650 + ansS * 90;
export const pointsFor = (errMs, ansS) => errMs == null ? 0 : Math.max(0, Math.round(10 * (1 - errMs / slackMs(ansS))));
/** A phone's own time, kept within what the server could have seen (it cannot be later than now, nor much earlier). */
export function judgeMs(ms, serverMs) {
  const hi = serverMs + 50, lo = Math.max(0, serverMs - LAG_MAX);
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return Math.round(hi);
  return Math.round(Math.min(hi, Math.max(lo, ms)));
}

/** One round's ride: start phase ps, speed w (rad/s), change a (rad/s²), laps. The horse passes the bell during the show. */
export function planRound(rng, i) {
  const P = PLAN[i], lap = rng.range(P.lap[0], P.lap[1]), w = TAU / lap;
  const a = P.acc ? rng.range(P.acc[0], P.acc[1]) * TAU : 0;
  // the horse is at the bell tp s into the show; re-roll until the wait in the dark is a fair one to count
  let R = null;
  for (let k = 0; k < 40; k++) {
    const tp = rng.range(0.9, SHOW_S - 0.9), travel = w * tp + 0.5 * a * tp * tp;
    const ps = ((TAU - travel) % TAU + TAU) % TAU;
    R = { kind: P.kind, w: r3(w), a: r3(a), ps: r3(ps), laps: P.laps };
    R.ans = r3(answerOf(R));
    if (R.ans >= 1.3 && R.ans <= 8) break;
  }
  return R;
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = PLAN.map((_, i) => planRound(rng, i));
  const total = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, t = 0, over = false, rings = {}, reveal = null;
  function next() { round++; phase = 'show'; left = SHOW_S; t = 0; rings = {}; reveal = null; }
  function settle() {
    const R = plan[round], err = {}, gain = {};
    for (const p of pids) err[p] = rings[p] == null ? null : Math.abs(rings[p] - R.ans * 1000);
    for (const p of pids) gain[p] = pointsFor(err[p], R.ans);
    const given = pids.filter(p => err[p] != null && gain[p] > 0), best = given.length ? Math.min(...given.map(p => err[p])) : null;
    const closest = pids.length > 1 && best != null ? given.filter(p => err[p] === best) : [];
    for (const p of closest) gain[p] += CLOSEST_BONUS;
    for (const p of pids) total[p] += gain[p];
    reveal = { ans: Math.round(R.ans * 1000), rings: { ...rings }, gain, closest };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo, show: SHOW_S }),
    act(pid, a, d) {
      if (a !== 'ring' || phase !== 'dark' || !pids.includes(pid) || rings[pid] != null) return;
      if (!d || typeof d !== 'object' || d.r !== round) return;
      rings[pid] = judgeMs(d.ms, t * 1000);
      if (pids.every(p => rings[p] != null)) left = Math.min(left, 0.4);
    },
    step(dt) {
      if (over) return;
      left -= dt; t += dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'show') { phase = 'dark'; t = 0; left = plan[round].ans + AFTER_S; }
      else if (phase === 'dark') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (phase === 'dark') delete g.left;              // the clock in the dark would give the answer away (it runs out answer + AFTER_S later)
      if (round < 0 || phase === 'end') return g;
      const R = plan[round];
      g.kind = R.kind; g.laps = R.laps; g.w = R.w; g.a = R.a; g.ps = R.ps;
      if (phase === 'dark') g.rung = pids.filter(p => rings[p] != null);
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv: pid => ({ rung: rings[pid] ?? null }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
  };
}
