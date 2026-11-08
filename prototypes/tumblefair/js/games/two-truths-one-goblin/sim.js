// TWO TRUTHS, ONE GOBLIN — Expansion 1 M4 (2026-11-07) rebuild. Live ratings: "unplayable". The round 10 version dealt
// claims about the Teller themselves (letters in their name, how many times they had been the Teller) and asked the
// Teller to plant, re-word and re-order cards before anyone could guess — three screens of rules for a coin toss.
//
// Now there is one idea: LOOK at the prize stall, then spot the lie.
//   * show:   everyone sees the same prize stall (three shelves of prizes) for a few seconds.
//   * guess:  the stall is covered and the Goblin makes three claims about it — two true, one a lie. Tap the lie.
//   * reveal: the stall comes back with the lie stamped GOBLIN.
// With two or more players the Goblin takes turns being a player (the Teller): while the stall is shown, the Teller is
// offered two lies and taps the sneakier one to plant (one tap; if they do not choose, the first is used). The Teller
// does not guess that round. Alone, Fib the Goblin (the computer) plants the lies and keeps its own score.
// Scoring: catch the lie +2; with two or more guessers, the fastest catch +1; the Teller (or Fib) +2 for each guesser who
// picked a truth. Ties go to the quicker detective. Everything comes from the seeded rng.
import { makeStall, dealClaims, SIZE } from './cards.js';

export const meta = {
  id: 'two-truths-one-goblin', title: 'Two Truths, One Goblin', blurb: 'Look at the prize stall, then spot the one claim that is a lie!',
  how: ['Look hard at the prize stall — it is only shown for a few seconds.', 'Then the Goblin makes three claims about it. Two are true, one is a lie.', 'Tap the lie: +2. Your turn as the Goblin? Pick the sneakier lie and fool them!'],
  kind: 'ui', min: 1, max: 4, seconds: 120, scoring: 'points', unit: 'points', tags: ['social', 'puzzle'], card: 'card-two-truths-one-goblin', css: true, rival: true,
};
export const FIB = 'fib', FIB_NAME = 'Fib the Goblin';
export const CATCH = 2, FOOL = 2, SHARP = 1, READY_S = 1.5;
/** Rounds and phase lengths for n players (show = the stall on screen, guess, reveal). */
export function timing(n, difficulty = 'normal') {
  const show = (SIZE[difficulty] || SIZE.normal).show;
  return { rounds: n === 1 ? 5 : n === 3 ? 3 : 4, show, guess: 11, reveal: 4 };
}

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const pids = players.map(p => p.pid), n = pids.length, solo = n === 1, T = timing(n, difficulty);
  const rival = solo && rivals !== false;            // "Rival when alone" off: the Goblin still lies, but Fib keeps no score
  const ids = rival ? [...pids, FIB] : pids;
  const score = Object.fromEntries(ids.map(k => [k, 0])), speed = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = READY_S, over = false, t = 0;
  let stall = null, deal = null, planted = 0, order = null, cards = null, teller = null, guesses = {}, at = {}, reveal = null;

  function next() {
    round++; guesses = {}; at = {}; reveal = null; t = 0; planted = 0;
    teller = solo ? FIB : pids[round % n];
    stall = makeStall(rng, difficulty);
    deal = dealClaims(stall, rng);
    order = rng.shuffle([0, 1, 2]);                 // where the lie goes among the three cards (drawn now, so a plant never moves the rng)
    if (solo) planted = rng.int(0, 1);              // Fib picks one of its two lies
    phase = 'show'; left = T.show;
  }
  function startGuess() {
    const pool = [deal.truths[0], deal.truths[1], deal.lies[planted]];
    cards = order.map(i => pool[i]);
    phase = 'guess'; left = T.guess; t = 0;
  }
  const guessers = () => solo ? pids : pids.filter(p => p !== teller);
  function settle() {
    const gob = order.indexOf(2), gain = Object.fromEntries(ids.map(k => [k, 0]));
    const right = guessers().filter(p => guesses[p] === gob);
    for (const p of right) { gain[p] += CATCH; speed[p] += at[p]; }
    let sharp = null;
    if (right.length && guessers().length >= 2) { sharp = right.slice().sort((a, b) => at[a] - at[b] || pids.indexOf(a) - pids.indexOf(b))[0]; gain[sharp] += SHARP; }
    if (teller in gain) gain[teller] += FOOL * guessers().filter(p => guesses[p] != null && guesses[p] !== gob).length;
    for (const k of ids) score[k] += gain[k];
    reveal = { gob, guesses: { ...guesses }, gain, sharp, cards: cards.slice() };
    phase = 'reveal'; left = T.reveal;
  }

  return {
    init: () => ({ rounds: T.rounds, solo, catch: CATCH, fool: FOOL, sharp: SHARP, show: T.show, ...(rival ? { fib: { pid: FIB, name: FIB_NAME } } : {}) }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (a === 'plant' && phase === 'show' && pid === teller) { if (d === 0 || d === 1) planted = d; return; }
      if (a === 'guess' && phase === 'guess' && pid !== teller) {
        if (!Number.isInteger(d) || d < 0 || d > 2) return;
        guesses[pid] = d; at[pid] = t;
        if (guessers().every(p => p in guesses)) left = Math.min(left, 1.5);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; t += dt;
      if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'show') startGuess();
      else if (phase === 'guess') settle();
      else if (round + 1 < T.rounds) next();
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), teller, scores: { ...score } };
      if (phase === 'show' || phase === 'reveal') g.stall = stall.slots;
      if (phase === 'guess') { g.cards = cards; g.guessed = Object.keys(guesses).map(Number); }
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv(pid) {
      if (!pids.includes(pid)) return {};
      if (phase === 'show' && pid === teller) return { teller: true, lies: deal.lies, planted, round };
      if (phase === 'guess' && pid !== teller) return { guess: guesses[pid] ?? null, round };
      return { round };
    },
    get over() { return over; },
    /** For tests and bots. */
    get stall() { return stall; }, get deal() { return deal; },
    result() {
      const ranked = pids.slice().sort((a, b) => score[b] - score[a] || speed[a] - speed[b]);
      const out = [];
      for (const p of ranked) { const g = out[out.length - 1]; if (g && score[g[0]] === score[p] && speed[g[0]] === speed[p]) g.push(p); else out.push([p]); }
      return { order: out, scores: Object.fromEntries(pids.map(p => [p, score[p]])), unit: meta.unit };
    },
  };
}
