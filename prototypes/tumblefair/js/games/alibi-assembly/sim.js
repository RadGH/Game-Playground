// ALIBI ASSEMBLY — something terrible happened at the fair ("Who ate the prize pie?") and the Inspector wants to know
// where you all were. Co-op, in two halves:
//   1. BUILD (25 s): the alibi has 4-6 slots (Where / Eating / Who saw you / When / Wearing / Doing / Carrying). Each
//      slot belongs to one player (round robin) and offers four authored options; its owner taps one. Every pick is
//      shown to everyone as it happens, so the whole group can see the story take shape. A slot nobody filled when the
//      clock runs out is filled by the game ("…nobody remembers, so it was this").
//   2. STUDY (6 s): the finished alibi is shown to everyone. Remember it!
//   3. QUESTIONS: the Inspector questions each player PRIVATELY, one question at a time: one multiple-choice question
//      per slot (the wrong answers are the other three options everyone saw while building) plus two "So you were …
//      and …?" yes/no questions, where half the time one detail has been swapped. Order shuffled per player.
//   4. VERDICT: a slot "holds" when everyone answered it the same as the alibi. The story holds (co-op win) when the
//      team gets at least 70% of all questions right. Each player's score is their own right answers, so the results
//      also rank who kept the story straight.
// Solo: the house builds the alibi one piece at a time while you watch, then you face the Inspector alone.
// Everything is decided from the seeded rng: the crime, the slots, the four options per slot, every question list.
import { CRIMES, SLOTS } from './data.js';

export const meta = {
  id: 'alibi-assembly', title: 'Alibi Assembly', blurb: 'Build an alibi together, then keep your story straight!',
  how: ['Something happened at the fair. Build your alibi: each of you fills in a piece.', 'Everyone can see every piece. Remember them all!', 'Then the Inspector questions each of you in private.', 'Get 70% of the answers right as a team to walk free!'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'coop', unit: 'answers', tags: ['social', 'coop'], card: 'card-alibi-assembly', css: true,
};
export const OPTS = 4, NEED = 0.7, YN = 2;
export const BUILD_S = 25, SOLO_STEP_S = 2.6, STUDY_S = 6, PER_Q_S = 4, ASK_EXTRA_S = 6, VERDICT_S = 7;
/** How many slots the alibi has for n players (each player owns one or two). */
export const slotCount = n => ({ 1: 5, 2: 4, 3: 6, 4: 4 })[n] || 4;
export const clause = (slot, x) => slot.yn.replace('{x}', x);

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), n = pids.length, solo = n === 1;
  const crime = rng.pick(CRIMES);
  const k = slotCount(n);
  const slots = rng.shuffle(SLOTS).slice(0, k).sort((a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b))
    .map((s, i) => ({ id: s.id, label: s.label, ask: s.ask, yn: s.yn, opts: rng.shuffle(s.opts).slice(0, OPTS), owner: solo ? null : pids[i % n] }));
  const housePicks = slots.map(() => rng.int(0, OPTS - 1));      // what fills a slot nobody picked (and the solo alibi)
  const Q = k + YN, ASK_S = Q * PER_Q_S + ASK_EXTRA_S;
  const picks = slots.map(() => null), auto = new Set();
  let phase = 'build', left = solo ? SOLO_STEP_S * (k + 1) : BUILD_S, over = false, soloT = 0;
  let qs = null;                                     // pid -> [{ text, opts, ans, slot }]
  const answers = Object.fromEntries(pids.map(p => [p, []]));
  let reveal = null;

  function toStudy() {
    slots.forEach((s, i) => { if (picks[i] == null) { picks[i] = housePicks[i]; if (!solo) auto.add(i); } });
    qs = Object.fromEntries(pids.map(p => [p, questionsFor()]));
    phase = 'study'; left = STUDY_S;
  }
  function questionsFor() {
    const list = slots.map((s, i) => {
      const opts = rng.shuffle(s.opts);
      return { slot: i, text: s.ask, opts, ans: opts.indexOf(s.opts[picks[i]]) };
    });
    for (let y = 0; y < YN; y++) {
      const [a, b] = rng.shuffle(slots.map((_, i) => i)).slice(0, 2).sort((x, z) => x - z);
      const truth = rng.chance(0.5), swap = rng.chance(0.5) ? a : b;
      const val = i => {
        if (truth || i !== swap) return slots[i].opts[picks[i]];
        const others = slots[i].opts.filter((_, j) => j !== picks[i]); return rng.pick(others);
      };
      list.push({ slot: -1, text: `So ${clause(slots[a], val(a))}, and ${clause(slots[b], val(b))}?`, opts: ['Yes', 'No'], ans: truth ? 0 : 1 });
    }
    return rng.shuffle(list);
  }
  function settle() {
    const right = {}, wrong = slots.map(() => []);
    for (const p of pids) {
      right[p] = qs[p].reduce((c, q, i) => c + (answers[p][i] === q.ans ? 1 : 0), 0);
      qs[p].forEach((q, i) => { if (q.slot >= 0 && answers[p][i] !== q.ans) wrong[q.slot].push(p); });
    }
    const total = Object.values(right).reduce((a, b) => a + b, 0), team = total / (Q * n);
    reveal = { picks: picks.slice(), auto: [...auto], right, wrong, team: Math.round(team * 100), ok: team >= NEED - 1e-9 };
    phase = 'verdict'; left = VERDICT_S;
  }
  const doneOf = p => answers[p].length >= Q;

  return {
    init: () => ({ crime, solo, q: Q, need: Math.round(NEED * 100), slots: slots.map(s => ({ label: s.label, ask: s.ask, opts: s.opts, owner: s.owner })) }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'build' && a === 'pick') {
        if (solo || !d || typeof d !== 'object') return;
        const { s, o } = d;
        if (!Number.isInteger(s) || s < 0 || s >= k || slots[s].owner !== pid) return;
        if (!Number.isInteger(o) || o < 0 || o >= OPTS) return;
        picks[s] = o;
        if (picks.every(x => x != null)) left = Math.min(left, 4);
        return;
      }
      if (phase === 'ask' && a === 'ans') {
        if (!d || typeof d !== 'object') return;
        const { i, o } = d, list = qs[pid];
        if (i !== answers[pid].length || i >= Q || !Number.isInteger(o) || o < 0 || o >= list[i].opts.length) return;
        answers[pid].push(o);
        if (pids.every(doneOf)) left = Math.min(left, 1);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt;
      if (phase === 'build' && solo) {                       // the house fills a slot every SOLO_STEP_S
        soloT += dt; const due = Math.min(k, Math.floor(soloT / SOLO_STEP_S));
        for (let i = 0; i < due; i++) if (picks[i] == null) picks[i] = housePicks[i];
      }
      if (left > 1e-9) return;
      if (phase === 'build') toStudy();
      else if (phase === 'study') { phase = 'ask'; left = ASK_S; }
      else if (phase === 'ask') { for (const p of pids) while (answers[p].length < Q) answers[p].push(-1); settle(); }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)) };
      if (phase === 'build' || phase === 'study') g.picks = picks.slice();
      if (phase === 'study') g.auto = [...auto];
      if (phase === 'ask') g.progress = Object.fromEntries(pids.map(p => [p, Math.min(Q, answers[p].length)]));
      if (phase === 'verdict') { g.reveal = reveal; g.scores = { ...reveal.right }; }
      return g;
    },
    priv(pid) {
      if (!pids.includes(pid)) return {};
      if (phase === 'ask') {
        const i = answers[pid].length, q = qs[pid][i];
        return { qi: i, q: q ? { text: q.text, opts: q.opts } : null };
      }
      if (phase === 'verdict') return { mine: qs[pid].map((q, i) => ({ text: q.text, right: q.opts[q.ans], got: answers[pid][i] >= 0 ? q.opts[answers[pid][i]] : null })) };
      return {};
    },
    get over() { return over; },
    result() {
      if (!reveal) {
        if (!qs) toStudy();
        for (const p of pids) while (answers[p].length < Q) answers[p].push(-1);
        settle();
      }
      const groups = new Map();
      for (const p of pids) { const r = reveal.right[p]; if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
      return { coop: { success: reveal.ok }, order: [...groups.keys()].sort((a, b) => b - a).map(r => groups.get(r)), scores: { ...reveal.right }, unit: meta.unit };
    },
  };
}
