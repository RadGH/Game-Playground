// CAROUSEL RECALL — a memory game on a merry-go-round. The carousel lights its animals up one after another (each
// with its own note); then everyone taps the same animals in the same order on their own phone, all at once. The
// tune is the SAME every round with one more animal on the end, so it grows: 3, 4, 5, 6… A wrong tap and you are out
// for the rest of that round (you keep what you got right). Every right tap is 1 point, getting the whole tune +2,
// and the first to finish it +1 more. The longest tune you got all the way through is shown at the end.
// Solo: the same, a score attack with medals. Everything comes from the seed.
import { placeOrder } from '../toss-kit.js';

export const meta = {
  id: 'carousel-recall', title: 'Carousel Recall', blurb: 'Watch the carousel light up, then tap the animals back in order!',
  how: ['Watch which animals light up, in order.', 'Then tap them back in the same order. A slip and you sit out the round.', 'Each round adds one more animal to the end.'],
  kind: 'ui', min: 1, max: 4, seconds: 84, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-carousel-recall', css: true,
};
export const READY_S = 2, LEAD_S = 0.9, TALLY_S = 2.0, END_S = 3.5, MAX_LEN = 24;
export const FULL = 2, FIRST = 1;
export const LEVELS = {
  easy: { animals: 5, start: 2, on: 0.75, off: 0.25, per: 1.1, base: 3 },
  normal: { animals: 6, start: 3, on: 0.6, off: 0.2, per: 0.95, base: 2.5 },
  hard: { animals: 8, start: 3, on: 0.45, off: 0.15, per: 0.8, base: 2.2 },
};
export const MEDALS = [20, 36, 52];
/** The tune: never the same animal three times running. */
export function makeTune(rng, n) {
  const s = [];
  while (s.length < MAX_LEN) { const a = rng.int(0, n - 1); if (s.length >= 2 && s[s.length - 1] === a && s[s.length - 2] === a) continue; s.push(a); }
  return s;
}
/** How long showing `len` animals takes, and how long players get to tap them back. */
export const showTime = (L, len) => LEAD_S + len * (L.on + L.off);
export const goTime = (L, len) => L.base + len * L.per;

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const tune = makeTune(rng, L.animals);
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, prog: 0, out: false, done: false, best: 0, wrong: null }]));
  let phase = 'ready', round = -1, len = L.start - 1, left = READY_S, el = 0, over = false, first = null, finished = [];
  const events = [];
  const total = () => meta.seconds - 1.5;          // when the last round must be over
  function nextRound() {
    const nl = len + 1, need = showTime(L, nl) + goTime(L, nl) + TALLY_S;
    if (round >= 0 && (el + need > total() || nl > MAX_LEN)) { phase = 'end'; left = END_S; events.push({ e: 'end' }); return; }
    round++; len = nl; phase = 'show'; left = showTime(L, len); first = null; finished = [];
    for (const p of pids) Object.assign(S[p], { prog: 0, out: false, done: false, wrong: null });
  }
  /** Which animal is lit at `into` seconds of the show (or -1 between them) and which step it is. */
  function lit(into) {
    const t = into - LEAD_S; if (t < 0) return [-1, -1];
    const k = Math.floor(t / (L.on + L.off)); if (k >= len) return [-1, -1];
    return t - k * (L.on + L.off) < L.on ? [tune[k], k] : [-1, k];
  }
  function finishGo() { phase = 'tally'; left = TALLY_S; events.push({ e: 'tally', round, first, done: [...finished] }); }
  return {
    events,
    init: () => ({ animals: L.animals, start: L.start, solo, medals: MEDALS, full: FULL, first: FIRST, on: L.on, off: L.off, lead: LEAD_S }),
    act(pid, a, d) {
      if (a !== 'tap' || !S[pid] || phase !== 'go' || over) return;
      if (!d || typeof d !== 'object' || d.r !== round || !Number.isInteger(d.i) || d.i < 0 || d.i >= L.animals) return;
      const s = S[pid]; if (s.out || s.done) return;
      if (d.i !== tune[s.prog]) { s.out = true; s.wrong = d.i; events.push({ e: 'slip', pid, i: d.i, want: tune[s.prog], at: s.prog }); }
      else {
        s.prog++; s.pts++;
        if (s.prog >= len) {
          s.done = true; s.best = Math.max(s.best, len); s.pts += FULL; finished.push(pid);
          if (first == null && !solo) { first = pid; s.pts += FIRST; }
          events.push({ e: 'done', pid, len, first: first === pid });
        }
      }
      if (pids.every(p => S[p].out || S[p].done)) finishGo();
    },
    step(dt) {
      if (over) return;
      el += dt; left -= dt;
      if (phase === 'show') { if (left <= 0) { phase = 'go'; left = goTime(L, len); events.push({ e: 'go', round, len }); } return; }
      if (left > 1e-9) return;
      if (phase === 'ready') nextRound();
      else if (phase === 'go') { for (const p of pids) if (!S[p].done && !S[p].out) { S[p].out = true; S[p].late = true; } finishGo(); }
      else if (phase === 'tally') nextRound();
      else if (phase === 'end') over = true;
    },
    state() {
      const sc = {}, prog = {}, out = [], done = [];
      for (const p of pids) { const s = S[p]; sc[p] = s.pts; prog[p] = s.prog; if (s.out) out.push(p); if (s.done) done.push(p); }
      const g = { phase, round, len, left: Math.max(0, Math.ceil(left)), sc, prog, out, done };
      if (phase === 'show') { const [a, k] = lit(showTime(L, len) - left); g.lit = a; g.k = k; }
      if (phase === 'tally' || phase === 'end') g.tune = tune.slice(0, len);
      if (phase === 'end') g.best = Object.fromEntries(pids.map(p => [p, S[p].best]));
      return g;
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts]));
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit, best: Object.fromEntries(pids.map(p => [p, S[p].best])),
        ...(solo ? { medal: MEDALS.filter(m => S[pids[0]].pts >= m).length } : {}) };
    },
    get _phase() { return phase; }, get _round() { return round; }, get _len() { return len; }, _tune: tune, _stats: S, _level: L,
  };
}
