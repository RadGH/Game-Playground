// HIGHER OR LOWER — nine flips of the fair's prize cards (1 Ticket … 13 Trophy, two of each in the deck, shuffled from
// the seed). A card is face up; everyone secretly picks HIGHER, LOWER or BANK before the next card flips.
//   Right call: your streak grows and the streak is added to your POT (1, then 2, then 3… so long runs pay big).
//   Wrong call: the pot is lost and the streak starts again.  Same card: nothing happens.
//   BANK: sit this flip out and move your pot safely into your score (the streak starts again).
//   BRAVE CALL: right, and nobody else picked the same side (2+ players called) = +3 straight into your score.
// No pick = sit out (nothing changes). Pots left at the end are banked for you. Most points wins.
// Alone it is a score attack with medals. Easy shows the odds of higher / lower and gives more time; hard gives less.
export const meta = {
  id: 'higher-or-lower', title: 'Higher or Lower', blurb: 'Higher or lower? Ride your luck, and bank it before it goes bust!',
  how: ['A prize card is showing. Will the next one be HIGHER or LOWER?', 'Each right call adds more to your pot. A wrong call loses the pot!', 'BANK to keep your pot safe instead of calling.', 'Right when nobody else picked your side? Brave call bonus!'],
  kind: 'ui', min: 1, max: 4, seconds: 78, scoring: 'points', unit: 'points', tags: ['chance', 'social'], card: 'card-higher-or-lower', css: true,
};
export const FLIPS = 9, START_S = 2, REVEAL_S = 2, END_S = 3, BRAVE = 3;
export const PICK_S = { easy: 6, normal: 5, hard: 4 };
export const MEDALS = [12, 24, 36];
export const CARDS = ['Ticket', 'Candy', 'Lollipop', 'Popcorn', 'Ice Cream', 'Balloon', 'Hot Dog', 'Teddy', 'Lucky Dice', 'Gift', 'Big Wheel', 'Crown', 'Trophy'];
export const PICKS = ['hi', 'lo', 'bank'];

/** The chance (0-1) that the next card is higher / lower than `v`, given the cards still in the deck. */
export function odds(v, rest) {
  const n = rest.length || 1;
  return { hi: rest.filter(c => c > v).length / n, lo: rest.filter(c => c < v).length / n };
}
/** Settle one flip for everyone. picks: pid -> 'hi'|'lo'|'bank'|undefined. Mutates pot / streak / score, returns rows. */
export function settleFlip(from, to, picks, pids, S) {
  const callers = pids.filter(p => picks[p] === 'hi' || picks[p] === 'lo'), rows = {};
  const side = to > from ? 'hi' : to < from ? 'lo' : null;
  for (const p of pids) {
    const k = picks[p]; let res = 'skip', gain = 0, brave = false;
    if (k === 'bank') { res = 'bank'; gain = S.pot[p]; S.score[p] += S.pot[p]; S.pot[p] = 0; S.streak[p] = 0; }
    else if (k === 'hi' || k === 'lo') {
      if (!side) res = 'same';
      else if (k === side) {
        res = 'win'; S.streak[p]++; gain = S.streak[p]; S.pot[p] += gain;
        if (callers.length >= 2 && callers.every(q => q === p || picks[q] !== k)) { brave = true; S.score[p] += BRAVE; }
      } else { res = 'lose'; gain = -S.pot[p]; S.pot[p] = 0; S.streak[p] = 0; }
    }
    rows[p] = { pick: k ?? null, res, gain, brave };
  }
  return rows;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, pickS = PICK_S[difficulty] ?? PICK_S.normal;
  const deck = rng.shuffle([...Array(13).keys(), ...Array(13).keys()].map(i => i + 1));
  const S = { score: {}, pot: {}, streak: {} };
  for (const p of pids) { S.score[p] = 0; S.pot[p] = 0; S.streak[p] = 0; }
  let phase = 'ready', flip = 0, left = START_S, over = false, picks = {}, reveal = null;
  const showOdds = difficulty === 'easy';
  function settle() {
    const rows = settleFlip(deck[flip], deck[flip + 1], picks, pids, S);
    reveal = { from: deck[flip], to: deck[flip + 1], rows };
    phase = 'reveal'; left = REVEAL_S;
  }
  const total = () => Object.fromEntries(pids.map(p => [p, S.score[p] + S.pot[p]]));
  return {
    init: () => ({ flips: FLIPS, solo, odds: showOdds, pick: pickS, medals: MEDALS }),
    act(pid, a, d) {
      if (a !== 'pick' || phase !== 'pick' || !pids.includes(pid) || !PICKS.includes(d)) return;
      picks[pid] = d;
      if (pids.every(p => picks[p])) left = Math.min(left, 0.8);
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') { phase = 'pick'; left = pickS; picks = {}; }
      else if (phase === 'pick') settle();
      else if (phase === 'reveal') {
        flip++;
        if (flip >= FLIPS) { for (const p of pids) { S.score[p] += S.pot[p]; S.pot[p] = 0; } phase = 'end'; left = END_S; }
        else { phase = 'pick'; left = pickS; picks = {}; reveal = null; }
      }
      else over = true;
    },
    state() {
      const g = { phase, flip, left: Math.max(0, Math.ceil(left)), card: deck[Math.min(flip, FLIPS - 1)], score: { ...S.score }, pot: { ...S.pot }, streak: { ...S.streak }, scores: total() };
      if (phase === 'pick') g.picked = pids.filter(p => picks[p]);
      if (phase === 'pick' && showOdds) { const o = odds(deck[flip], deck.slice(flip + 1)); g.odds = [Math.round(o.hi * 100), Math.round(o.lo * 100)]; }
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv: pid => ({ pick: phase === 'pick' ? picks[pid] ?? null : null }),
    get over() { return over; },
    result() {
      const sc = total(), groups = new Map();
      for (const p of pids) { if (!groups.has(sc[p])) groups.set(sc[p], []); groups.get(sc[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: sc, unit: meta.unit };
    },
    _deck: deck,
  };
}
