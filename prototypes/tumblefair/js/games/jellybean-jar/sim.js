// JELLYBEAN JAR — three rounds of "guess how many". Each round shows one container packed with a seeded number of
// things (beans in a jar, gumballs in a machine, rubber ducks in a paddling pool, a bunch of balloons; a different one
// each round, more of them each round). Everyone types a guess on a big number pad. Then the reveal counts up to the
// real number, lighting the things up one by one, and every guess sits on a "guess-o-meter" as the counter passes it.
//   Closeness: up to 10 points (10 * (1 - 2 x how far off, as a share of the real number)); within half the real
//   number scores something. Exact guess: +5 more. Closest guess of the round (2+ players, ties share): +5.
// Alone, it is the same without the "closest" bonus: a score out of 45.
// The drawing comes from (thing, count, look seed) in the state; jar-art.js lays it out the same on every screen.
export const meta = {
  id: 'jellybean-jar', title: 'Jellybean Jar', blurb: 'How many are in there? The closest guess wins!',
  how: ['Look at the jar (or the pool, or the balloons) and guess how many.', 'Type your number on the pad and press OK. You can change it until time is up.', 'Closest guess wins the round. Spot on = big bonus!', 'Three rounds, and the piles get bigger.'],
  kind: 'ui', min: 1, max: 4, seconds: 98, scoring: 'points', unit: 'points', tags: ['puzzle', 'social'], card: 'card-jellybean-jar', css: true,
};
export const ROUNDS = 3, START_S = 2, GUESS_S = 22, REVEAL_S = 7.5, END_S = 3, MAX_GUESS = 9999;
export const CLOSEST_BONUS = 5, EXACT_BONUS = 5;
export const THINGS = ['beans', 'gumballs', 'ducks', 'balloons'];
/** How many things, by round (inclusive). */
export const RANGES = [[18, 45], [50, 110], [110, 220]];

/** Closeness points for one guess (null = no guess): 10 at spot on, 0 once you are half the real number away. */
export function closeness(guess, n) {
  if (guess == null) return 0;
  const err = Math.abs(guess - n) / n;
  return Math.max(0, Math.round(10 * (1 - 2 * err)));
}
/** Settle a round. guesses: pid -> number|undefined. -> { gain, closest: [pids], exact: [pids], off: pid -> distance } */
export function settleRound(guesses, n, pids) {
  const off = {}, gain = {};
  for (const p of pids) off[p] = guesses[p] == null ? null : Math.abs(guesses[p] - n);
  const given = pids.filter(p => off[p] != null);
  const best = given.length ? Math.min(...given.map(p => off[p])) : null;
  const closest = pids.length > 1 && best != null ? given.filter(p => off[p] === best) : [];
  const exact = given.filter(p => off[p] === 0);
  for (const p of pids) gain[p] = closeness(guesses[p], n) + (exact.includes(p) ? EXACT_BONUS : 0) + (closest.includes(p) ? CLOSEST_BONUS : 0);
  return { gain, closest, exact, off };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const kinds = rng.shuffle(THINGS);
  const plan = RANGES.map(([lo, hi], i) => ({ thing: kinds[i], n: rng.int(lo, hi), look: rng.int(1, 2 ** 30), fill: Math.round(rng.range(0.62, 0.9) * 100) / 100 }));
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
      if (!Number.isInteger(n) || n < 0 || n > MAX_GUESS) return;
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
      const P = plan[Math.max(0, Math.min(round, ROUNDS - 1))];
      if (phase !== 'end') { g.thing = P.thing; g.n = P.n; g.look = P.look; g.fill = P.fill; }
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
