// QUICK DRAW — a reaction duel at the fair bell. Seven rounds. Each round everyone waits; at a moment from the seed
// the BELL rings and the first tap wins. Before it, fake-outs happen (a hen clucks, a balloon pops, a cow moos, the
// word BALL or BELT flashes): tapping on one, or any time before the bell, is a FALSE START: you are out of that
// round and lose a point (scores never go below 0).
//   1st: 3 points; 2nd: 1 point (3+ players). Alone: points for speed (5 under 0.25 s ... 1 under 0.9 s).
//
// Fairness over a network. The server decides WHEN the bell rings (its own clock; the state flips to 'bell' on that
// tick and goes to every phone at once). Each phone then times its OWN reaction: from the moment it put the bell on
// screen to the tap, and sends that number. Ranking by the phone's own number means a phone with a slower line is
// not punished for its line. The server checks the claim against what it saw: the reaction can be no longer than the
// time since the bell rang on the server (+ one tick), and no shorter than that minus LAG_MAX (so a slow line is
// forgiven up to 0.7 s of round trip, no more). A tap sent while the phone still showed "wait" (on a fake, or before
// the bell reached it) is flagged early by the phone and is a false start; so is any tap the server gets before it
// rang the bell; a reaction under MIN_RT (faster than a person can react) is a guess, and counts as a false start too.
export const meta = {
  id: 'quick-draw', title: 'Quick Draw', blurb: 'Wait for the BELL, then tap first! Do not fall for the fakes!',
  how: ['Watch your phone. When the big BELL rings, tap as fast as you can!', 'First tap wins the round (3 points), second gets 1.', 'Fake-outs! A hen, a pop, a moo, or the word BALL. Tap on those and you are out of the round (-1).', 'Seven rounds.'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-quick-draw', css: true,
};
export const ROUNDS = 7, START_S = 2.5, BELL_MAX_S = 2.5, REVEAL_S = 2.8, END_S = 3;
export const LAG_MAX = 700, MIN_RT = 90, TICK = 50;
export const FAKES = ['hen', 'pop', 'ball', 'cow', 'belt'];
export const FAKE_S = 0.75;                       // how long a fake-out shows
export const FIRST = 3, SECOND = 1, FALSE_START = -1;
/** Solo points for a reaction time in ms. */
export function soloPoints(ms) { return ms == null ? 0 : ms <= 250 ? 5 : ms <= 330 ? 4 : ms <= 420 ? 3 : ms <= 550 ? 2 : ms <= 900 ? 1 : 0; }

/** The round plan: when the bell rings (s after the round starts) and the fake-outs before it. */
export function planRounds(rng) {
  const out = [];
  for (let r = 0; r < ROUNDS; r++) {
    const wait = r === 0 ? rng.range(2, 3.2) : rng.range(2.2, 5);
    const nf = r === 0 ? 0 : r === 1 ? 1 : rng.int(1, 2), fakes = [];
    let lo = 0.7;
    for (let i = 0; i < nf; i++) {
      const hi = wait - 0.95 - (nf - 1 - i) * 1.05;      // leave room for the ones still to come, and never just before the bell
      if (hi <= lo) break;
      const at = rng.range(lo, hi); fakes.push({ at, k: rng.pick(FAKES) }); lo = at + 1.05;
    }
    out.push({ wait, fakes });
  }
  return out;
}
/** The reaction the server will believe: the phone's own number, kept inside what the server itself saw. */
export function judgeRt(rt, serverMs) {
  const hi = serverMs + TICK, lo = Math.max(0, serverMs - LAG_MAX);
  if (typeof rt !== 'number' || !Number.isFinite(rt)) return hi;
  return Math.round(Math.min(hi, Math.max(lo, rt)));
}
/** Points for one round. times: pid -> ms (tapped), early: [pids]. -> { gain, order: [pids fastest first], place: pid -> 1|2|... } */
export function settleRound(times, early, pids) {
  const gain = {}, place = {};
  const tapped = pids.filter(p => times[p] != null && !early.includes(p)).sort((a, b) => times[a] - times[b]);
  const solo = pids.length === 1;
  let rank = 0, prev = null, seen = 0;
  for (const p of tapped) { seen++; if (times[p] !== prev) { rank = seen; prev = times[p]; } place[p] = rank; }
  for (const p of pids) {
    if (early.includes(p)) gain[p] = FALSE_START;
    else if (solo) gain[p] = soloPoints(times[p]);
    else gain[p] = place[p] === 1 ? FIRST : place[p] === 2 && pids.length >= 3 ? SECOND : 0;
  }
  return { gain, order: tapped, place };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = planRounds(rng);
  const total = Object.fromEntries(pids.map(p => [p, 0])), best = Object.fromEntries(pids.map(p => [p, null]));
  let phase = 'ready', round = -1, left = START_S, t = 0, over = false, bellAt = 0;
  let times = {}, early = [], fake = null, reveal = null;
  function next() { round++; phase = 'wait'; t = 0; times = {}; early = []; fake = null; reveal = null; }
  function ring() { phase = 'bell'; bellAt = t; fake = null; left = BELL_MAX_S; }
  function settle() {
    const r = settleRound(times, early, pids);
    for (const p of pids) { total[p] = Math.max(0, total[p] + r.gain[p]); if (times[p] != null && !early.includes(p) && (best[p] == null || times[p] < best[p])) best[p] = times[p]; }
    reveal = { times: { ...times }, early: [...early], ...r };
    phase = 'reveal'; left = REVEAL_S;
  }
  const waiting = () => pids.filter(p => times[p] == null && !early.includes(p));
  return {
    init: () => ({ rounds: ROUNDS, solo, fakes: FAKES }),
    act(pid, a, d) {
      if (a !== 'tap' || !pids.includes(pid) || !d || typeof d !== 'object' || d.r !== round) return;
      if (early.includes(pid) || times[pid] != null) return;
      if (phase === 'wait') { early.push(pid); return; }
      if (phase !== 'bell') return;
      const srv = (t - bellAt) * 1000;
      if (d.early === true) { early.push(pid); return; }
      if (typeof d.rt === 'number' && d.rt < MIN_RT) { early.push(pid); return; }   // faster than a person can react: a guess
      const rt = judgeRt(d.rt, srv);
      times[pid] = rt;
      if (!waiting().length) left = Math.min(left, 0.35);
    },
    step(dt) {
      if (over) return;
      t += dt;
      if (phase === 'wait') {
        const P = plan[round];
        fake = P.fakes.map((f, i) => ({ ...f, i })).find(f => t >= f.at && t < f.at + FAKE_S) || null;
        if (t >= P.wait - 1e-9) ring();
        return;
      }
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'bell') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      // no clock while waiting for the bell: a countdown would give the moment away
      const live = phase !== 'end' && phase !== 'ready';
      const g = { phase, round, scores: { ...total }, out: live ? [...early] : [], done: live ? Object.keys(times).map(Number) : [] };
      if (phase === 'ready' || phase === 'reveal' || phase === 'end') g.left = Math.max(0, Math.ceil(left));
      if (phase === 'wait' && fake) g.fake = { k: fake.k, i: fake.i };
      if (phase === 'reveal') g.reveal = reveal;
      if (phase === 'end') g.best = { ...best };
      return g;
    },
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
  };
}
