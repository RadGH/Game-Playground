// SHAPE SORTER — toys drop down a chute one at a time; tap the bin that matches it, SHAPE and COLOUR both (every
// colour also has its own pattern — red stripes, blue dots, green checks — so colour is never the only cue). Everyone
// gets the same toys in the same order but sorts at their own speed: the next toy drops the moment you sort one, so a
// quick sorter gets more toys. Toys fall faster as you go. A toy that reaches the bottom unsorted, or a wrong bin,
// breaks your combo. A sort is worth 1 + (combo / 5) points (up to 5), so a long clean run pays.
// Easy: 3 bins that differ in shape AND colour. Normal: 4 bins (two shapes x two colours, so you need both). Hard: 6.
// Alone it is a score attack with medals.
//
// The toy list goes out in init(), so the phone drops and judges toys by its own clock with no waiting; it sends
// `sort` { k: toy number, b: bin } and the server judges it again. The server also drops a toy itself when its time is
// well past (a phone that stopped tapping), and a tap for a later toy counts the ones in between as dropped.
export const meta = {
  id: 'shape-sorter', title: 'Shape Sorter', blurb: 'Sort the falling toys into the right bins, faster and faster!',
  how: ['A toy drops down the chute.', 'Tap the bin with the same SHAPE and the same COLOUR.', 'Toys fall faster and faster. Keep a combo going for bonus points!', 'A wrong bin or a dropped toy breaks your combo.'],
  kind: 'ui', min: 1, max: 4, seconds: 52, scoring: 'points', unit: 'points', tags: ['action', 'puzzle'], card: 'card-shape-sorter', css: true,
};
export const READY_S = 3, PLAY_S = 45, END_S = 3, GRACE = 0.6, TOYS = 220, MAX_BONUS = 4;
export const SHAPES = ['circle', 'square', 'triangle'], COLORS = ['red', 'blue', 'green'];
/** Bins by difficulty: [shape, colour] each. */
export const BINS = {
  easy: [['circle', 'red'], ['square', 'blue'], ['triangle', 'green']],
  normal: [['circle', 'red'], ['square', 'red'], ['circle', 'blue'], ['square', 'blue']],
  hard: [['circle', 'red'], ['square', 'red'], ['triangle', 'red'], ['circle', 'blue'], ['square', 'blue'], ['triangle', 'blue']],
};
const FALL = { easy: [3.4, 0.045, 1.6], normal: [3.0, 0.055, 1.2], hard: [2.7, 0.06, 0.95] };
export const levelOf = d => BINS[d] ? d : 'normal';
/** Seconds toy k takes to fall. */
export const fallOf = (k, d = 'normal') => { const [a, s, lo] = FALL[levelOf(d)]; return Math.max(lo, Math.round((a - k * s) * 100) / 100); };
/** Points for a right sort with `combo` right sorts in a row before it. */
export const worth = combo => 1 + Math.min(MAX_BONUS, Math.floor(combo / 5));

/** The toy list: bin numbers, never the same bin three times running. */
export function makeToys(rng, nBins, count = TOYS) {
  const out = [];
  for (let k = 0; k < count; k++) { let b; do { b = rng.int(0, nBins - 1); } while (k >= 2 && b === out[k - 1] && b === out[k - 2]); out.push(b); }
  return out;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, diff = levelOf(difficulty);
  const bins = BINS[diff], toys = makeToys(rng, bins.length), events = [];
  const P = Object.fromEntries(pids.map(p => [p, { at: 0, spawn: 0, combo: 0, best: 0, score: 0, right: 0, wrong: 0, dropped: 0 }]));
  let phase = 'ready', left = READY_S, t = 0, over = false;
  const drop = (pid, why) => { const s = P[pid]; s.combo = 0; s.at++; s.dropped += why === 'drop'; s.spawn = t; };
  return {
    events,
    init: () => ({ bins, toys, diff, solo, play: PLAY_S, fall: toys.map((_, k) => fallOf(k, diff)), medals: diff === 'easy' ? [25, 50, 80] : diff === 'hard' ? [30, 60, 100] : [30, 60, 90] }),
    act(pid, a, d) {
      if (a !== 'sort' || phase !== 'play' || !P[pid] || !d || typeof d !== 'object') return;
      const s = P[pid], { k, b } = d;
      if (!Number.isInteger(k) || !Number.isInteger(b) || b < 0 || b >= bins.length || k < s.at || k > s.at + 4 || k >= toys.length) return;
      while (s.at < k) drop(pid, 'drop');                       // the phone let toys fall that the server had not dropped yet
      const ok = toys[k] === b;
      if (ok) { s.score += worth(s.combo); s.combo++; s.best = Math.max(s.best, s.combo); s.right++; } else { s.combo = 0; s.wrong++; }
      s.at++; s.spawn = t;
      events.push({ e: 'sort', pid, k, ok });
    },
    step(dt) {
      if (over) return;
      if (phase === 'play') {
        t += dt;
        for (const pid of pids) { const s = P[pid]; if (s.at < toys.length && t > s.spawn + fallOf(s.at, diff) + GRACE) { drop(pid, 'drop'); events.push({ e: 'sort', pid, k: s.at - 1, ok: false, drop: true }); } }
      }
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') { phase = 'play'; left = PLAY_S; t = 0; for (const p of pids) P[p].spawn = 0; }
      else if (phase === 'play') { phase = 'end'; left = END_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), scores: {}, at: {}, combo: {} };
      for (const p of pids) { g.scores[p] = P[p].score; g.at[p] = P[p].at; g.combo[p] = P[p].combo; }
      if (phase === 'end') g.best = Object.fromEntries(pids.map(p => [p, P[p].best]));
      return g;
    },
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { const v = P[p].score; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, P[p].score])), unit: meta.unit };
    },
    _P: P, _toys: toys,
  };
}
