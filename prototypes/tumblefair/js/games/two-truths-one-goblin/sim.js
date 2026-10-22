// TWO TRUTHS, ONE GOBLIN — one player is the TELLER each round (it rotates). The game deals them claim cards about
// themselves ("I once rode a goose to the fair.") and decides, secretly, which are true: two TRUTHS and two possible
// GOBLINS (lies). While the others wait, the Teller privately:
//   * plants ONE of the two Goblins (the other goes back in the deck),
//   * picks a wording for each card (plain or dramatic),
//   * puts the three cards in any order.
// Then the three claims go up for everyone and the other players tap the one they think is the Goblin (they can
// change their mind until the clock runs out — watch the Teller's face!).
// Scoring: catch the Goblin +2; with two or more guessers, the fastest catch is a Sharp Eye, +1; the Teller gets +2
// for every guesser who picked a truth. No guess earns nobody anything. Ties go to the quicker detective: less total
// time spent on your catches (printed on the card) — this is what settles a 2-player game, where the points can match.
// Solo: the House is the Teller for five rounds and you guess. The House has a tell, printed on the intro: its Goblin
// is usually its longest claim (3 times in 4). Your catches are your score.
// Every deal, every truth/lie and the House's choices come from the seeded rng.
import { CARDS } from './cards.js';

export const meta = {
  id: 'two-truths-one-goblin', title: 'Two Truths, One Goblin', blurb: 'Two claims are true and one is a Goblin. Spot the lie!',
  how: ['Each round one of you is the Teller and gets three claims about themselves.', 'The game says which one is the Goblin (the lie). The Teller arranges the cards to fool you.', 'Everyone else taps the Goblin. Catch it: +2. Fool someone: +2 to the Teller.', 'Ties go to the quickest catches.'],
  kind: 'ui', min: 1, max: 4, seconds: 76, scoring: 'points', unit: 'points', tags: ['social'], card: 'card-two-truths-one-goblin', css: true,
};
export const HOUSE = 'house', HOUSE_NAME = 'The House';
export const CATCH = 2, FOOL = 2, SHARP = 1, READY_S = 1.5;
/** Rounds and phase lengths for n players (prep = the Teller arranging, guess, reveal). */
export function timing(n) {
  if (n === 1) return { rounds: 5, prep: 0, guess: 8, reveal: 3 };
  if (n === 3) return { rounds: 3, prep: 7, guess: 10, reveal: 4 };
  return { rounds: 4, prep: 6, guess: 8, reveal: 3.5 };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), n = pids.length, solo = n === 1, T = timing(n);
  const deck = rng.shuffle(CARDS.map((_, i) => i));
  const draw = () => deck.pop();
  const ids = solo ? [...pids, HOUSE] : pids;
  const score = Object.fromEntries(ids.map(k => [k, 0])), speed = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = READY_S, over = false, t = 0;
  let hand = [], alt = null, teller = null, guesses = {}, at = {}, reveal = null, readyEarly = false;

  const card = (i, gob) => ({ i, t: CARDS[i], w: 0, gob });
  function deal() {
    round++; guesses = {}; at = {}; reveal = null; readyEarly = false; t = 0;
    teller = solo ? HOUSE : pids[round % n];
    const truths = [card(draw(), false), card(draw(), false)], gobs = [card(draw(), true), card(draw(), true)];
    hand = rng.shuffle([...truths, gobs[0]]); alt = gobs[1];
    if (solo) houseArranges();
    phase = solo ? 'guess' : 'prep'; left = solo ? T.guess : T.prep;
  }
  /** The House's tell: 3 times in 4 its Goblin is its longest claim (longest candidate, long wording, short truths). */
  function houseArranges() {
    const long = rng.chance(0.75), gi = hand.findIndex(c => c.gob);
    const best = c => Math.max(c.t[0].length, c.t[1].length), worst = c => Math.min(c.t[0].length, c.t[1].length);
    if (long ? best(alt) > best(hand[gi]) : worst(alt) < worst(hand[gi])) [hand[gi], alt] = [alt, hand[gi]];
    for (const c of hand) { const longer = c.t[1].length > c.t[0].length ? 1 : 0; c.w = (c.gob === long) ? longer : 1 - longer; }
    hand = rng.shuffle(hand);
  }
  function settle() {
    const gob = hand.findIndex(c => c.gob), gain = Object.fromEntries(ids.map(k => [k, 0]));
    const guessers = solo ? pids : pids.filter(p => p !== teller);
    const right = guessers.filter(p => guesses[p] === gob);
    for (const p of right) { gain[p] += CATCH; speed[p] += at[p]; }
    let sharp = null;
    if (right.length && guessers.length >= 2) { sharp = right.slice().sort((a, b) => at[a] - at[b] || pids.indexOf(a) - pids.indexOf(b))[0]; gain[sharp] += SHARP; }
    gain[teller] += FOOL * guessers.filter(p => guesses[p] != null && guesses[p] !== gob).length;
    for (const k of ids) score[k] += gain[k];
    reveal = { gob, guesses: { ...guesses }, gain, sharp, cards: hand.map(c => c.t[c.w]) };
    phase = 'reveal'; left = T.reveal;
  }

  return {
    init: () => ({ rounds: T.rounds, solo, catch: CATCH, fool: FOOL, sharp: SHARP, ...(solo ? { house: { pid: HOUSE, name: HOUSE_NAME } } : {}) }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'prep' && pid === teller) {
        if (a === 'plant') {                                   // d = 0: keep the Goblin in the hand, 1: swap in the other
          if (d !== 1) return;
          const gi = hand.findIndex(c => c.gob); [hand[gi], alt] = [alt, hand[gi]]; hand[gi].w = 0;
        } else if (a === 'word') {
          if (!Number.isInteger(d) || d < 0 || d > 2) return;
          hand[d].w = 1 - hand[d].w;
        } else if (a === 'up') {
          if (!Number.isInteger(d) || d < 1 || d > 2) return;
          [hand[d - 1], hand[d]] = [hand[d], hand[d - 1]];
        } else if (a === 'ready') { readyEarly = true; left = Math.min(left, 0.3); }
        return;
      }
      if (phase === 'guess' && a === 'guess' && pid !== teller) {
        if (!Number.isInteger(d) || d < 0 || d > 2) return;
        guesses[pid] = d; at[pid] = t;
        if (pids.every(p => p === teller || p in guesses)) left = Math.min(left, 2);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; t += dt;
      if (left > 1e-9) return;
      if (phase === 'ready') deal();
      else if (phase === 'prep') { phase = 'guess'; left = T.guess; t = 0; }
      else if (phase === 'guess') settle();
      else if (round + 1 < T.rounds) deal();
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), teller, scores: { ...score } };
      if (phase === 'guess') { g.cards = hand.map(c => c.t[c.w]); g.guessed = Object.keys(guesses).map(Number); }
      if (phase === 'prep') g.ready = readyEarly;
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv(pid) {
      if (!pids.includes(pid)) return {};
      if (phase === 'prep' && pid === teller) return { teller: true, hand: hand.map(c => ({ t: c.t, w: c.w, gob: c.gob })), alt: alt.t };
      if (phase === 'guess' && pid !== teller) return { guess: guesses[pid] ?? null };
      return {};
    },
    get over() { return over; },
    result() {
      const ranked = pids.slice().sort((a, b) => score[b] - score[a] || speed[a] - speed[b]);
      const order = [];
      for (const p of ranked) { const g = order[order.length - 1]; if (g && score[g[0]] === score[p] && speed[g[0]] === speed[p]) g.push(p); else order.push([p]); }
      return { order, scores: Object.fromEntries(pids.map(p => [p, score[p]])), unit: meta.unit };
    },
  };
}
