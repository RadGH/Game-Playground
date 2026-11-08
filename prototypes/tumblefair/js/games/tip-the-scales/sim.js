// TIP THE SCALES — a big fairground balance. Each round a mystery thing sits on one pan (a piano, a cow, a wedding
// cake…) and everyone guesses how many farm DUCKS (1.5 kg each) it would take to balance it. One known comparison is
// shown as a hint ("a watermelon = 5 ducks"). Four rounds, one thing from each size band (small → huge).
// Reveal: ducks rain onto the other pan with a counter until the beam balances; every guess sits on a meter.
//   Closeness is by RATIO (a guess twice too big is as far off as one half too small): up to 10 points, 0 once you
//   are three times off. Within 10%: +3 "spot on". Closest guess of the round (2+ players, ties share): +4.
// Alone: the same without the closest bonus (out of 52).
// The answer is never in the state before the reveal (only the thing's id and the hint).
export const meta = {
  id: 'tip-the-scales', title: 'Tip the Scales', blurb: 'How many ducks does a piano weigh? Balance the scales to win!',
  how: ['Guess how many ducks (1.5 kg each) balance the mystery thing.', 'Slide to guess, nudge with − and +, then press OK.', 'Use the hint! Closest guess wins the round.', 'Four rounds, from tiny to enormous.'],
  kind: 'ui', min: 1, max: 4, seconds: 90, scoring: 'points', unit: 'points', tags: ['puzzle', 'social'], card: 'card-tip-the-scales', css: true,
};
export const ROUNDS = 4, START_S = 2, GUESS_S = 14, REVEAL_S = 6.5, END_S = 3;
export const DUCK_KG = 1.5, MAX_GUESS = 9999, SPOT_ON = 1.1, ZERO_AT = 3, SPOT_BONUS = 3, CLOSEST_BONUS = 4;

/** The mystery things: id, name (with its article), weight in kg, Font Awesome duotone icon. */
export const THINGS = Object.freeze([
  ['crown', 'a royal crown', 2.4, 'crown'], ['guitar', 'a guitar', 4, 'guitar'], ['piggy', 'a piggy bank full of coins', 6, 'piggy-bank'],
  ['bowling', 'a bowling ball', 7, 'bowling-ball'], ['vacuum', 'a vacuum cleaner', 8, 'vacuum'], ['trophy', 'a giant trophy', 10, 'trophy'],
  ['teddy', 'a grand-prize teddy bear', 12, 'teddy-bear'], ['bike', 'a bicycle', 15, 'bicycle'], ['microwave', 'a microwave oven', 16, 'microwave'],
  ['cake', 'a three-tier wedding cake', 30, 'cake-candles'], ['cheese', 'a whole wheel of cheese', 40, 'cheese'], ['toilet', 'a toilet', 40, 'toilet'],
  ['couch', 'a comfy sofa', 50, 'couch'], ['cauldron', 'a witch-sized cauldron', 60, 'cauldron'], ['washer', 'a washing machine', 75, 'washing-machine'],
  ['fridge', 'a fridge', 90, 'refrigerator'], ['pig', 'a farm pig', 120, 'pig'], ['deer', 'a deer', 120, 'deer'], ['bath', 'a cast-iron bathtub', 140, 'bath'],
  ['chest', 'a treasure chest of gold', 200, 'treasure-chest'], ['motorbike', 'a motorbike', 210, 'motorcycle'], ['piano', 'an upright piano', 250, 'piano'],
  ['basket', 'a hot-air balloon basket', 260, 'balloon'], ['snowman', 'a giant snowman', 300, 'snowman'], ['pumpkin', 'a prize-winning giant pumpkin', 450, 'pumpkin'],
  ['cow', 'a cow', 650, 'cow'], ['sailboat', 'a little sailboat', 900, 'sailboat'], ['dragon', 'a small, polite dragon', 900, 'dragon'],
  ['helicopter', 'a helicopter', 1300, 'helicopter'], ['hippo', 'a hippo', 1500, 'hippo'], ['cannon', 'a castle cannon', 1800, 'cannon'],
  ['tractor', 'a tractor', 3000, 'tractor'], ['elephant', 'an elephant', 5000, 'elephant'],
].map(([id, name, kg, icon]) => Object.freeze({ id, name, kg, icon })));
/** Things everybody knows the weight of, for the hint. */
export const HINTS = Object.freeze([
  ['cat', 'a house cat', 4.5, 'cat'], ['melon', 'a watermelon', 7.5, 'watermelon-slice'], ['dog', 'a big dog', 30, 'dog'], ['sheep', 'a sheep', 60, 'sheep'],
  ['person', 'a grown-up person', 75, 'person'], ['horse', 'a horse', 600, 'horse'], ['car', 'a family car', 1500, 'car-side'],
].map(([id, name, kg, icon]) => Object.freeze({ id, name, kg, icon })));
/** Size bands in ducks (inclusive lower, exclusive upper): one thing from each, smallest first. */
export const BANDS = Object.freeze([[1, 21], [21, 120], [120, 600], [600, 4000]]);

export const ducksOf = kg => Math.max(1, Math.round(kg / DUCK_KG));
/** The hint for a thing: the known thing nearest to it in size (by ratio), but at least HINT_GAP times off. */
export const HINT_GAP = 1.2;
export function hintFor(thing) {
  const n = ducksOf(thing.kg), off = h => Math.abs(Math.log(ducksOf(h.kg) / n));
  const ok = HINTS.filter(h => off(h) > Math.log(HINT_GAP));        // never one so close it gives the answer away
  return ok.reduce((b, h) => off(h) < off(b) ? h : b, ok[0]);
}
/** Closeness points (null guess = 0): 10 spot on, falling with the log of the ratio, 0 at three times off. */
export function closeness(guess, n) {
  if (guess == null || guess <= 0) return 0;
  const r = Math.abs(Math.log(guess / n));
  return Math.max(0, Math.round(10 * (1 - r / Math.log(ZERO_AT))));
}
export const spotOn = (guess, n) => guess != null && guess > 0 && Math.abs(Math.log(guess / n)) <= Math.log(SPOT_ON) + 1e-9;
/** Settle a round. -> { gain, closest: [pids], spot: [pids], off: pid -> |log ratio| | null } */
export function settleRound(guesses, n, pids) {
  const off = {}, gain = {};
  for (const p of pids) off[p] = guesses[p] == null ? null : Math.abs(Math.log(guesses[p] / n));
  const given = pids.filter(p => off[p] != null), best = given.length ? Math.min(...given.map(p => off[p])) : null;
  const closest = pids.length > 1 && best != null ? given.filter(p => Math.abs(off[p] - best) < 1e-9) : [];
  const spot = given.filter(p => spotOn(guesses[p], n));
  for (const p of pids) gain[p] = closeness(guesses[p], n) + (spot.includes(p) ? SPOT_BONUS : 0) + (closest.includes(p) ? CLOSEST_BONUS : 0);
  return { gain, closest, spot, off };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = BANDS.map(([lo, hi]) => {
    const pool = THINGS.filter(t => ducksOf(t.kg) >= lo && ducksOf(t.kg) < hi), t = rng.pick(pool);
    return { thing: t.id, n: ducksOf(t.kg), hint: hintFor(t).id };
  });
  const total = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, guesses = {}, locked = new Set(), reveal = null;
  function next() { round++; phase = 'guess'; left = GUESS_S; guesses = {}; locked = new Set(); reveal = null; }
  function settle() {
    const P = plan[round], r = settleRound(guesses, P.n, pids);
    for (const p of pids) total[p] += r.gain[p];
    reveal = { n: P.n, guesses: { ...guesses }, ...r };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo, max: MAX_GUESS }),
    act(pid, a, d) {
      if (a !== 'guess' || phase !== 'guess' || !pids.includes(pid) || !d || typeof d !== 'object') return;
      const n = d.n;
      if (n === null) { delete guesses[pid]; locked.delete(pid); return; }
      if (!Number.isInteger(n) || n < 1 || n > MAX_GUESS) return;
      guesses[pid] = n;
      if (d.ok === true) locked.add(pid); else locked.delete(pid);
      if (pids.every(p => locked.has(p))) left = Math.min(left, 1);
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'guess') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (round >= 0 && phase !== 'end') { const P = plan[round]; g.thing = P.thing; g.hint = P.hint; }
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
  };
}
