// MONSTER LINE-UP (Halloween only) — Size Up's quick pick, but the answer is IN the picture. Seven questions; each
// lines up two to four cartoon monsters and asks "Who has the MOST EYES?", "the FEWEST LEGS?", "the MOST SPOTS?",
// "the MOST HORNS?", "Who is the BIGGEST?" — so you count, you don't know. Tap one: right = 5 points + up to 5 for
// being quick; wrong = 0; your first tap is final. The reveal writes the count under every monster.
// Difficulty is how hard the counting is: Family = two or three monsters and the answer leads by at least two;
// Normal = three, ahead by one; Tricky = three or four, ahead by one, and the others have lots of everything too.
// The monsters are plain data in the state ([body, fur, eyes, legs, spots, horns, size, hat]); every phone draws
// them with js/games/monster-svg.js, which draws exactly that many of each (tests count the shapes). Speed timing is
// Size Up's: the phone says how long after the question appeared it tapped, kept inside what the server saw.
export const meta = {
  id: 'monster-line-up', title: 'Monster Line-Up', blurb: 'Count the eyes, legs and spots — tap the right monster, quick!',
  how: ['Monsters line up with a question: MOST EYES? FEWEST LEGS? BIGGEST?', 'Count and tap the right monster. Your first tap counts!', 'Right = 5 points, plus up to 5 more for being quick.'],
  kind: 'ui', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'points', tags: ['puzzle', 'action', 'holiday'], season: 'halloween', card: 'card-monster-line-up', css: true,
};
export const ROUNDS = 7, START_S = 2.5, REVEAL_S = 2.6, END_S = 3, LAG_MAX = 700;
export const RIGHT = 5, QUICK = 5, QUICK_FULL_MS = 900;
export const MEDALS = [25, 40, 55];
/** Per difficulty: seconds a question stays up, how many monsters (per round), how far ahead the answer must be. */
export const LEVELS = {
  easy: { q: 7, counts: [2, 2, 3, 2, 3, 2, 3], lead: 2, sizeLead: 0.3, busy: false },
  normal: { q: 6, counts: [2, 3, 3, 3, 3, 3, 3], lead: 1, sizeLead: 0.22, busy: false },
  hard: { q: 5, counts: [3, 3, 4, 3, 4, 3, 4], lead: 1, sizeLead: 0.16, busy: true },
};
/** Question kinds: which feature, and whether the most or the fewest is the answer. */
export const QUESTIONS = {
  eyes: { f: 2, most: true, text: 'Who has the MOST EYES?', key: 'MOST EYES', word: 'eyes' },
  feweyes: { f: 2, most: false, text: 'Who has the FEWEST EYES?', key: 'FEWEST EYES', word: 'eyes' },
  legs: { f: 3, most: true, text: 'Who has the MOST LEGS?', key: 'MOST LEGS', word: 'legs' },
  fewlegs: { f: 3, most: false, text: 'Who has the FEWEST LEGS?', key: 'FEWEST LEGS', word: 'legs' },
  spots: { f: 4, most: true, text: 'Who has the MOST SPOTS?', key: 'MOST SPOTS', word: 'spots' },
  horns: { f: 5, most: true, text: 'Who has the MOST HORNS?', key: 'MOST HORNS', word: 'horns' },
  biggest: { f: 6, most: true, text: 'Who is the BIGGEST?', key: 'BIGGEST', word: 'size' },
  smallest: { f: 6, most: false, text: 'Who is the SMALLEST?', key: 'SMALLEST', word: 'size' },
};
export const RANGE = { 2: [1, 7], 3: [0, 8], 4: [0, 10], 5: [0, 4] };      // feature index -> [min, max] count
export const HAT_IDS = ['witch', 'top', 'bow', 'crown', 'pumpkin', 'cap'];
const KIND_LIST = ['eyes', 'legs', 'spots', 'horns', 'biggest', 'feweyes', 'fewlegs', 'smallest', 'eyes', 'legs', 'spots'];
const r2 = v => Math.round(v * 100) / 100;

/** One random monster: [body, fur, eyes, legs, spots, horns, size, hat] (hat = index into HAT_IDS, -1 = none). */
export function rollMonster(rng, busy = false) {
  const lo = busy ? 0.45 : 0;                                             // Tricky: everyone has plenty of everything
  const cnt = f => { const [a, b] = RANGE[f]; return rng.int(Math.round(a + (b - a) * lo), b); };
  return [rng.int(0, 3), rng.int(0, 7), cnt(2), cnt(3), cnt(4), cnt(5), r2(rng.range(0.15, 0.95)), rng.chance(0.4) ? rng.int(0, HAT_IDS.length - 1) : -1];
}
/** The answer's index for kind q among monsters ms, or -1 if it is not clear enough (lead too small, or a tie). */
export function answerOf(ms, q, lead = 1, sizeLead = 0.2) {
  const { f, most } = QUESTIONS[q], v = ms.map(m => most ? m[f] : -m[f]);
  const best = Math.max(...v), i = v.indexOf(best), rest = v.filter((x, j) => j !== i);
  const gap = best - Math.max(...rest);
  return gap >= (f === 6 ? sizeLead : lead) - 1e-9 ? i : -1;
}
/** Plan the whole quiz: a mix of kinds, every answer clear by the difficulty's margin. */
export function planQuiz(rng, difficulty = 'normal') {
  const L = LEVELS[difficulty] || LEVELS.normal, out = [];
  let kinds = rng.shuffle(KIND_LIST).slice(0, ROUNDS);
  for (let r = 0; r < ROUNDS; r++) {
    const q = kinds[r], n = L.counts[r];
    for (let tries = 0; tries < 500; tries++) {
      const ms = Array.from({ length: n }, () => rollMonster(rng, L.busy));
      const a = answerOf(ms, q, L.lead, L.sizeLead);
      if (a < 0) continue;
      // keep it a counting game: the leader should not ALSO win by miles on easy-to-see size when the question is a count
      out.push({ q, ms, answer: a }); break;
    }
  }
  return out;
}
export function pointsFor(ok, ms, qS) {
  if (!ok) return 0;
  const quick = ms <= QUICK_FULL_MS ? 1 : Math.max(0, 1 - (ms - QUICK_FULL_MS) / (qS * 1000 - QUICK_FULL_MS));
  return RIGHT + Math.round(QUICK * quick);
}
export function judgeMs(rt, serverMs) {
  const hi = serverMs + 50, lo = Math.max(0, serverMs - LAG_MAX);
  if (typeof rt !== 'number' || !Number.isFinite(rt)) return Math.round(hi);
  return Math.round(Math.min(hi, Math.max(lo, rt)));
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = planQuiz(rng, difficulty);
  const total = Object.fromEntries(pids.map(p => [p, 0])), right = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, t = 0, over = false, picks = {}, reveal = null;
  function next() { round++; phase = 'q'; left = L.q; t = 0; picks = {}; reveal = null; }
  function settle() {
    const P = plan[round], gain = {};
    for (const p of pids) { const k = picks[p], ok = k != null && k.i === P.answer; gain[p] = k ? pointsFor(ok, k.ms, L.q) : 0; total[p] += gain[p]; if (ok) right[p]++; }
    reveal = { answer: P.answer, picks: Object.fromEntries(Object.entries(picks).map(([p, k]) => [p, k.i])), gain };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo, q: L.q, medals: solo ? MEDALS : null, hats: HAT_IDS }),
    act(pid, a, d) {
      if (a !== 'pick' || phase !== 'q' || !pids.includes(pid) || picks[pid] || !d || typeof d !== 'object') return;
      if (!Number.isInteger(d.i) || d.i < 0 || d.i >= plan[round].ms.length) return;
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
      if ((phase === 'q' || phase === 'reveal') && plan[round]) { g.q = plan[round].q; g.ms = plan[round].ms; }
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
    get plan() { return plan; },
  };
}
