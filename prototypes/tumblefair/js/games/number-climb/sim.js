// NUMBER CLIMB — three rounds of the same scrambled grid for everyone: tap 1, 2, 3… up to the last number as fast as
// you can. Grids get bigger each round (normal: 3x3, 4x4, 5x5). A wrong tap freezes you for a moment.
//   Every right tap = 1 point. Finishing = + the whole seconds left on the round clock.
//   With 2+ players, the order you finish in adds 5 / 3 / 2 / 1 more.
// A round ends when everyone has finished, or on its clock. Alone it is a score attack with medals.
// Hard: bigger grids, and the numbers are drawn at different sizes and angles (the view, from the round's seed).
export const meta = {
  id: 'number-climb', title: 'Number Climb', blurb: 'Tap the numbers in order, 1, 2, 3… as fast as you can!',
  how: ['Everyone gets the same jumbled grid of numbers.', 'Tap them in order: 1, then 2, then 3… all the way up.', 'A wrong tap freezes you for a moment.', 'Finish first for a bonus. Grids get bigger each round!'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'points', unit: 'points', tags: ['action', 'puzzle'], card: 'card-number-climb', css: true,
};
export const START_S = 2, BETWEEN_S = 3, END_S = 3, WRONG_S = 0.8;
export const SIDES = { easy: [3, 4, 4], normal: [3, 4, 5], hard: [4, 5, 5] };
export const CAP = { 3: 10, 4: 16, 5: 24 };
export const PLACE = [5, 3, 2, 1];
export const levelOf = d => SIDES[d] ? d : 'normal';

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, diff = levelOf(difficulty);
  const rounds = SIDES[diff].map(n => ({ n, grid: rng.shuffle(Array.from({ length: n * n }, (_, i) => i + 1)), look: rng.int(1, 2 ** 30) }));
  const score = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, t = 0;
  let next = {}, lock = {}, done = [], gained = {};
  const events = [];
  function begin() {
    round++; phase = 'climb'; left = CAP[rounds[round].n]; t = 0;
    next = Object.fromEntries(pids.map(p => [p, 1])); lock = Object.fromEntries(pids.map(p => [p, -1])); done = []; gained = Object.fromEntries(pids.map(p => [p, 0]));
  }
  const add = (p, n) => { score[p] += n; gained[p] += n; };
  return {
    events,
    init: () => ({ rounds: rounds.length, solo, diff, wrong: WRONG_S, medals: diff === 'easy' ? [30, 45, 55] : diff === 'hard' ? [55, 75, 90] : [40, 60, 72] }),
    act(pid, a, d) {
      if (a !== 'tap' || phase !== 'climb' || !pids.includes(pid) || !d || typeof d !== 'object' || d.r !== round) return;
      const R = rounds[round], N = R.n * R.n;
      if (!Number.isInteger(d.n) || d.n < 1 || d.n > N || next[pid] > N || t < lock[pid] - 0.15) return;
      if (d.n === next[pid]) {
        add(pid, 1); next[pid]++;
        if (next[pid] > N) {
          done.push(pid); add(pid, Math.floor(left));
          if (!solo) add(pid, PLACE[done.length - 1] ?? 0);
          events.push({ e: 'done', pid, place: done.length });
          if (done.length === pids.length) left = Math.min(left, 0.6);
        }
      } else if (d.n > next[pid]) { lock[pid] = t + WRONG_S; events.push({ e: 'miss', pid }); }      // a tap on a number already done is harmless
    },
    step(dt) {
      if (over) return;
      if (phase === 'climb') t += dt;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready' || phase === 'between') begin();
      else if (phase === 'climb') { if (round + 1 < rounds.length) { phase = 'between'; left = BETWEEN_S; } else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...score } };
      if (round >= 0) { const R = rounds[round]; g.n = R.n; g.grid = R.grid; g.look = R.look; g.next = { ...next }; g.done = done.slice(); g.lock = phase === 'climb' ? pids.filter(p => t < lock[p]) : []; }
      if (phase === 'between' || phase === 'end') g.gained = { ...gained };
      return g;
    },
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(score[p])) groups.set(score[p], []); groups.get(score[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...score }, unit: meta.unit };
    },
    _rounds: rounds,
  };
}
