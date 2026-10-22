// SIZE UP — a quick sorting quiz. Eight questions; each shows two things (three in rounds 4 and 8) and asks which is
// BIGGER / SMALLER, HEAVIER / LIGHTER or FASTER / SLOWER. Tap the answer: right = 5 points + up to 5 more for being
// quick (all 5 in the first second, none at the buzzer); wrong = 0. Your first tap is final. The reveal shows each
// thing's real value and how many times more it is.
// Questions only compare values at least RATIO apart (items.js holds rough real values), so every answer is clear:
// BIGGER needs both the size AND the weight to agree; FASTER only uses things that move by themselves.
// Speed bonus timing works like Quick Draw's: the phone says how long after the question appeared on ITS screen you
// tapped; the server keeps that inside what it saw itself (never more than the time since it sent the question, never
// more than LAG_MAX less), so a slow line costs nobody their bonus.
import { ITEMS } from './items.js';
export { ITEMS };

export const meta = {
  id: 'size-up', title: 'Size Up', blurb: 'Bigger? Heavier? Faster? Tap the right one, quick!',
  how: ['Two things appear with a question: which is BIGGER, HEAVIER, FASTER…?', 'Tap your answer. Your first tap counts!', 'Right = 5 points, plus up to 5 more for being quick.', 'Eight questions. Some have three things!'],
  kind: 'ui', min: 1, max: 4, seconds: 96, scoring: 'points', unit: 'points', tags: ['puzzle', 'action'], card: 'card-size-up', css: true,
};
export const ROUNDS = 8, START_S = 2.5, Q_S = 7, REVEAL_S = 3.6, END_S = 3, RATIO = 2.5, LAG_MAX = 700;
export const RIGHT = 5, QUICK = 5, QUICK_FULL_MS = 1000;
export const THREE_AT = [3, 7];
/** Question kinds: the stat it reads and whether the biggest value is the answer. */
export const QUESTIONS = {
  bigger: { stat: 'm', most: true, text: 'Which is BIGGER?' }, smaller: { stat: 'm', most: false, text: 'Which is SMALLER?' },
  heavier: { stat: 'kg', most: true, text: 'Which is HEAVIER?' }, lighter: { stat: 'kg', most: false, text: 'Which is LIGHTER?' },
  faster: { stat: 'kmh', most: true, text: 'Which is FASTER?' }, slower: { stat: 'kmh', most: false, text: 'Which is SLOWER?' },
  biggest: { stat: 'm', most: true, text: 'Which is the BIGGEST?' }, heaviest: { stat: 'kg', most: true, text: 'Which is the HEAVIEST?' },
  fastest: { stat: 'kmh', most: true, text: 'Which is the FASTEST?' }, smallest: { stat: 'm', most: false, text: 'Which is the SMALLEST?' },
};
const PAIR_KINDS = ['bigger', 'heavier', 'faster', 'smaller', 'lighter', 'slower', 'bigger', 'heavier', 'faster'];
const TRIO_KINDS = ['biggest', 'heaviest', 'fastest', 'smallest'];
const byId = new Map(ITEMS.map(t => [t.id, t]));

/** Can a and b be asked about `stat` (both known, far enough apart; size also needs the weight to agree)? */
export function clearPair(a, b, stat) {
  const va = a[stat], vb = b[stat];
  if (va == null || vb == null || va <= 0 || vb <= 0) return false;
  if (Math.max(va, vb) / Math.min(va, vb) < RATIO) return false;
  if (stat === 'm' && a.kg != null && b.kg != null) {
    if (Math.max(a.kg, b.kg) / Math.min(a.kg, b.kg) < RATIO) return false;
    if ((va > vb) !== (a.kg > b.kg)) return false;
  }
  return true;
}
/** The answer's index among `ids` for question kind q. */
export function answerOf(ids, q) {
  const { stat, most } = QUESTIONS[q], v = ids.map(id => byId.get(id)[stat]);
  const best = most ? Math.max(...v) : Math.min(...v);
  return v.indexOf(best);
}
/** Plan the whole quiz: no thing twice. */
export function planQuiz(rng) {
  const used = new Set(), out = [];
  for (let r = 0; r < ROUNDS; r++) {
    const three = THREE_AT.includes(r);
    for (let tries = 0; tries < 400; tries++) {
      const q = three ? rng.pick(TRIO_KINDS) : rng.pick(PAIR_KINDS), stat = QUESTIONS[q].stat;
      const pool = ITEMS.filter(t => !used.has(t.id) && t[stat] != null);
      const a = rng.pick(pool), clear = pool.filter(t => t !== a && clearPair(a, t, stat));
      // a close call is more fun than a rocket against a mouse: prefer things no more than 8x (then 40x) apart
      const near = lim => clear.filter(t => Math.max(a[stat], t[stat]) / Math.min(a[stat], t[stat]) <= lim);
      const withA = near(8).length >= 1 ? near(8) : near(40).length ? near(40) : clear;
      if (!withA.length) continue;
      const b = rng.pick(withA);
      let ids = [a.id, b.id];
      if (three) { const cs = withA.filter(t => t !== b && clearPair(b, t, stat)); if (!cs.length) continue; ids.push(rng.pick(cs).id); }
      ids = rng.shuffle(ids);
      ids.forEach(id => used.add(id));
      out.push({ q, ids, answer: answerOf(ids, q) });
      break;
    }
  }
  return out;
}
/** Points for one answer: right + quickness (ms after the question appeared). */
export function pointsFor(ok, ms) {
  if (!ok) return 0;
  const quick = ms <= QUICK_FULL_MS ? 1 : Math.max(0, 1 - (ms - QUICK_FULL_MS) / (Q_S * 1000 - QUICK_FULL_MS));
  return RIGHT + Math.round(QUICK * quick);
}
export function judgeMs(rt, serverMs) {
  const hi = serverMs + 50, lo = Math.max(0, serverMs - LAG_MAX);
  if (typeof rt !== 'number' || !Number.isFinite(rt)) return Math.round(hi);
  return Math.round(Math.min(hi, Math.max(lo, rt)));
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = planQuiz(rng);
  const total = Object.fromEntries(pids.map(p => [p, 0])), right = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, t = 0, over = false, picks = {}, reveal = null;
  function next() { round++; phase = 'q'; left = Q_S; t = 0; picks = {}; reveal = null; }
  function settle() {
    const P = plan[round], gain = {};
    for (const p of pids) { const k = picks[p], ok = k != null && k.i === P.answer; gain[p] = k ? pointsFor(ok, k.ms) : 0; total[p] += gain[p]; if (ok) right[p]++; }
    reveal = { answer: P.answer, picks: Object.fromEntries(Object.entries(picks).map(([p, k]) => [p, k.i])), ms: Object.fromEntries(Object.entries(picks).map(([p, k]) => [p, k.ms])), gain };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo }),
    act(pid, a, d) {
      if (a !== 'pick' || phase !== 'q' || !pids.includes(pid) || picks[pid] || !d || typeof d !== 'object') return;
      const n = plan[round].ids.length;
      if (!Number.isInteger(d.i) || d.i < 0 || d.i >= n) return;
      picks[pid] = { i: d.i, ms: judgeMs(d.ms, t * 1000) };
      if (pids.every(p => picks[p])) left = Math.min(left, 0.5);
    },
    step(dt) {
      if (over) return;
      t += dt; left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'q') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if ((phase === 'q' || phase === 'reveal') && plan[round]) { g.q = plan[round].q; g.ids = plan[round].ids; }
      if (phase === 'q') g.in = pids.filter(p => picks[p]);
      if (phase === 'reveal') g.reveal = reveal;
      if (phase === 'end') g.right = { ...right };
      return g;
    },
    priv: pid => ({ pick: phase === 'q' && picks[pid] ? picks[pid].i : null }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
  };
}
