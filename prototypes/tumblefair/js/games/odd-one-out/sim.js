// ODD ONE OUT — a race through picture grids. Every player gets the SAME list of puzzles (made from the seed) and works
// through it at their own speed: a square grid of one little picture repeated, where exactly ONE is different — turned,
// mirrored, smaller, drawn in outline, or a look-alike (a half star among stars). Tap it and the next, bigger grid appears.
// A wrong tap freezes you for a second. A puzzle is worth (grid side - 2) points: 3x3 = 1, 4x4 = 2, 5x5 = 3…
// The odd one is never told apart by colour: every picture in a grid is the same colour.
// Alone it is a score attack with bronze / silver / gold marks.
//
// The whole puzzle list goes out in init(), so a phone shows the next grid the moment you tap (no round trip); the
// server checks every tap ({ k: puzzle number, i: cell }) against the same list and keeps the score.
export const meta = {
  id: 'odd-one-out', title: 'Odd One Out', blurb: 'One picture is different. Spot it and tap it, fast!',
  how: ['Every grid has ONE picture that is a little different.', 'It might be turned, flipped, smaller, an outline, or a look-alike.', 'Tap it to get the next grid. Grids grow as you go!', 'A wrong tap freezes you for a second. Most points wins.'],
  kind: 'ui', min: 1, max: 4, seconds: 48, scoring: 'points', unit: 'points', tags: ['puzzle', 'action'], card: 'card-odd-one-out', css: true,
};
export const READY_S = 3, PLAY_S = 40, END_S = 3, WRONG_S = 1, PUZZLES = 150;
export const MEDALS = { easy: [8, 18, 30], normal: [10, 25, 40], hard: [14, 32, 50] };
/** Pictures the grids are made of (Font Awesome names). The ones in SYMMETRIC look the same mirrored, so never 'flip'. */
export const BASES = ['cat', 'dog', 'fish', 'frog', 'crow', 'dove', 'horse', 'rabbit', 'hippo', 'otter', 'turtle', 'squirrel', 'kiwi-bird', 'duck', 'pig', 'cow', 'sheep', 'spider', 'bee', 'ice-cream', 'apple-whole', 'lemon', 'mushroom', 'umbrella', 'rocket', 'kite', 'hat-wizard', 'tree', 'leaf', 'feather', 'key', 'bell', 'music', 'anchor', 'balloon'];
export const SYMMETRIC = new Set(['umbrella', 'tree', 'bell', 'balloon', 'anchor', 'mushroom', 'ice-cream', 'spider', 'bee', 'apple-whole']);
/** Round 12 (owner's phone, 2026-10-24: a 5x5 of bees where all 25 looked the same). The Font Awesome bee is drawn
 *  from the front, so a MIRRORED bee is the same picture, and its outline style is nearly as solid as the filled one.
 *  tests/odd-one-out-looks.test.js draws every odd picture at phone size (js/shared/svg-raster.js) and fails any that
 *  differs from the normal one by less than a quarter of its ink — these are the ones it found, by kind. */
export const TOO_ALIKE = {
  flip: SYMMETRIC,
  style: new Set(['bee', 'kite', 'anchor', 'spider']),
  turn180: new Set(['lemon', 'spider']),
  turn25: new Set(['lemon']),
};
/** True when this odd picture would look the same as the rest. */
export const alike = (base, kind, v) => !!TOO_ALIKE[kind === 'turn' ? 'turn' + v : kind]?.has(base);
/** Look-alike pairs: the grid is one, the odd one is the other. */
export const PAIRS = [['face-smile', 'face-sunglasses'], ['star', 'star-half'], ['heart', 'heart-half'], ['lock', 'lock-open'], ['bell', 'bell-slash'], ['volume-high', 'volume-low'], ['battery-full', 'battery-empty'], ['hourglass-start', 'hourglass-end'], ['cloud-sun', 'cloud-moon']];
export const COLORS = 8;
/** What makes the odd one odd, by difficulty: [kind, value]. turn = degrees, small = scale. */
export const KINDS = {
  easy: [['turn', 180], ['turn', 90], ['small', 0.58], ['swap'], ['style']],
  normal: [['turn', 90], ['turn', 60], ['small', 0.7], ['flip'], ['swap'], ['style']],
  hard: [['turn', 35], ['turn', 25], ['small', 0.8], ['flip'], ['flip'], ['swap'], ['style']],
};
/** Grid side for puzzle k (0-based). */
export function sideOf(k, difficulty = 'normal') {
  if (difficulty === 'easy') return Math.min(5, 3 + Math.floor(k / 3));
  if (difficulty === 'hard') return Math.min(7, 4 + Math.floor(k / 2));
  return Math.min(6, 3 + Math.floor(k / 2));
}
export const pointsFor = side => side - 2;

/** The puzzle list: [{ n: side, b: picture, x: odd picture (swap only), o: odd cell, k: kind, v: value, c: colour, r: turn sign }] */
export function makePuzzles(rng, difficulty = 'normal', count = PUZZLES) {
  const kinds = KINDS[difficulty] || KINDS.normal, out = [];
  let lastBase = null;
  for (let k = 0; k < count; k++) {
    const n = sideOf(k, difficulty);
    const [kind, v] = rng.pick(kinds);
    const P = { n, o: rng.int(0, n * n - 1), k: kind, c: rng.int(0, COLORS - 1) };
    if (kind === 'swap') { const pair = rng.pick(PAIRS), flip = rng.chance(0.5); P.b = 'solid/' + pair[flip ? 1 : 0]; P.x = 'solid/' + pair[flip ? 0 : 1]; }
    else {
      let base; do { base = rng.pick(BASES); } while (base === lastBase || alike(base, kind, v));
      lastBase = base; P.b = 'solid/' + base;
      if (kind === 'style') P.x = 'regular/' + base;
      if (v != null) P.v = v;
      if (kind === 'turn') P.r = rng.chance(0.5) ? 1 : -1;
    }
    out.push(P);
  }
  return out;
}

const groupsOf = (pids, score) => {
  const groups = new Map();
  for (const p of pids) { if (!groups.has(score[p])) groups.set(score[p], []); groups.get(score[p]).push(p); }
  return [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k));
};

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const diff = KINDS[difficulty] ? difficulty : 'normal';
  const puzzles = makePuzzles(rng, diff);
  const score = Object.fromEntries(pids.map(p => [p, 0])), at = Object.fromEntries(pids.map(p => [p, 0]));
  const lockUntil = Object.fromEntries(pids.map(p => [p, 0])), misses = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', left = READY_S, t = 0, over = false;
  const events = [];
  return {
    events,
    init: () => ({ puzzles, solo, diff, play: PLAY_S, wrong: WRONG_S, medals: MEDALS[diff] }),
    act(pid, a, d) {
      if (a !== 'tap' || phase !== 'play' || !pids.includes(pid) || !d || typeof d !== 'object') return;
      const { k, i } = d, P = puzzles[at[pid]];
      if (k !== at[pid] || !P || !Number.isInteger(i) || i < 0 || i >= P.n * P.n) return;
      if (t < lockUntil[pid] - 0.15) return;                  // frozen (a little slack for the phone's own clock)
      if (i === P.o) { score[pid] += pointsFor(P.n); at[pid]++; events.push({ e: 'found', pid, k }); }
      else { lockUntil[pid] = t + WRONG_S; misses[pid]++; events.push({ e: 'miss', pid, k, i }); }
    },
    step(dt) {
      if (over) return;
      if (phase === 'play') t += dt;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') { phase = 'play'; left = PLAY_S; }
      else if (phase === 'play') { phase = 'end'; left = END_S; }
      else over = true;
    },
    state: () => ({ phase, left: Math.max(0, Math.ceil(left)), scores: { ...score }, at: { ...at }, lock: phase === 'play' ? pids.filter(p => t < lockUntil[p]) : [] }),
    get over() { return over; },
    result: () => ({ order: groupsOf(pids, score), scores: { ...score }, unit: meta.unit }),
    _debug: { puzzles, at, misses },
  };
}
