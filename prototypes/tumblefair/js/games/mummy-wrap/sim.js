// MUMMY WRAP (Halloween only) — a timing game. Your little mummy spins in the middle of a ring and the loose end of
// its bandage runs round the ring with it; a glowing GAP sits somewhere on the ring. Tap WRAP when the bandage end is
// in the gap: dead centre = PERFECT (2 wraps), inside = GOOD (1 wrap). Then a new gap appears somewhere else ahead.
// Tap outside the gap and the bandage slips: one wrap comes off and you fumble for a moment (so mashing loses). The
// spin speeds up as the song goes on. Most-wrapped mummy wins. Alone it is a score attack with medals.
// Easy: a slow spin and a wide gap. Hard: faster and narrower.
//
// TIMING IS JUDGED BY THE SERVER from the moment the phone says it tapped: the phone counts its own clock from the
// start and sends `tap` { t }; the server accepts t only if it is not in the future (a little slack), not more than
// 1.2 s old and not before the last tap, and judges the angle at that moment itself, so lag never moves the gap. Every
// gap is placed relative to where the bandage was at the last good wrap ({ offsets } in init), so phone and server
// always agree on where it is.
export const meta = {
  id: 'mummy-wrap', title: 'Mummy Wrap', blurb: 'Tap when the bandage hits the gap. Most-wrapped mummy wins!',
  how: ['Your mummy spins and the loose bandage runs round the ring.', 'Tap WRAP when the bandage is inside the glowing gap.', 'Right in the middle = PERFECT, 2 wraps!', 'Miss and a wrap slips off. It spins faster and faster!'],
  kind: 'ui', min: 1, max: 4, seconds: 47, scoring: 'points', unit: 'wraps', tags: ['action', 'holiday'], season: 'halloween', card: 'card-mummy-wrap', css: true,
};
export const READY_S = 3, PLAY_S = 40, END_S = 3, FUMBLE_S = 0.6, LATE_S = 1.2, EARLY_S = 0.3, PERFECT = 0.4, OFFSETS = 300;
export const LEVEL = {
  easy: { w0: 0.4, w1: 0.75, half: 26, medals: [20, 35, 50] },
  normal: { w0: 0.5, w1: 0.95, half: 20, medals: [25, 42, 60] },
  hard: { w0: 0.6, w1: 1.2, half: 15, medals: [25, 45, 65] },
};
export const levelOf = d => LEVEL[d] ? d : 'normal';
/** Where the bandage end is (degrees, growing without limit) t seconds into the song. */
export function angleAt(t, L) { const tt = Math.max(0, Math.min(PLAY_S, t)); return 360 * (L.w0 * tt + (L.w1 - L.w0) * tt * tt / (2 * PLAY_S)) + (t > PLAY_S ? 360 * L.w1 * (t - PLAY_S) : 0); }
/** Shortest distance between two angles, 0-180. */
export const angDist = (a, b) => { const d = (((a - b) % 360) + 360) % 360; return Math.min(d, 360 - d); };
/** Judge a tap at angle `a` against a gap centred on `gap`: 2 perfect, 1 good, 0 miss. */
export const judge = (a, gap, half) => { const d = angDist(a, gap); return d <= half * PERFECT ? 2 : d <= half ? 1 : 0; };

/** One player's wrapping, run the same way by the server and the phone. */
export function createSpinner(L, offsets) {
  const S = { k: 0, gap: offsets[0], lastT: -1, fumble: -1, wraps: 0, perfect: 0, good: 0, miss: 0 };
  /** A tap at song time t -> 2 / 1 / 0, or null if it is not allowed (fumbling, or before the last tap). */
  S.tap = t => {
    if (t < S.lastT || t < S.fumble) return null;
    S.lastT = t;
    const a = angleAt(t, L), q = judge(a, S.gap, L.half);
    if (q) { S.wraps += q; q === 2 ? S.perfect++ : S.good++; S.k++; S.gap = (a + offsets[S.k % offsets.length]) % 360; }
    else { S.wraps = Math.max(0, S.wraps - 1); S.miss++; S.fumble = t + FUMBLE_S; }
    return q;
  };
  return S;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, diff = levelOf(difficulty), L = LEVEL[diff];
  const offsets = Array.from({ length: OFFSETS }, () => rng.int(110, 300));
  const S = Object.fromEntries(pids.map(p => [p, createSpinner(L, offsets)]));
  const events = [];
  let phase = 'ready', left = READY_S, t = 0, over = false;
  return {
    events,
    init: () => ({ diff, solo, play: PLAY_S, offsets, fumble: FUMBLE_S, medals: L.medals }),
    act(pid, a, d) {
      if (a !== 'tap' || phase !== 'play' || !S[pid] || !d || typeof d !== 'object') return;
      const tt = d.t;
      if (typeof tt !== 'number' || !Number.isFinite(tt) || tt < 0 || tt > t + EARLY_S || tt < t - LATE_S || tt > PLAY_S) return;
      const q = S[pid].tap(tt);
      if (q != null) events.push({ e: 'tap', pid, q });
    },
    step(dt) {
      if (over) return;
      if (phase === 'play') t += dt;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') { phase = 'play'; left = PLAY_S; t = 0; }
      else if (phase === 'play') { phase = 'end'; left = END_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), scores: {}, gap: {}, k: {} };
      for (const p of pids) { g.scores[p] = S[p].wraps; g.gap[p] = Math.round(S[p].gap * 10) / 10; g.k[p] = S[p].k; }
      if (phase === 'end') g.stats = Object.fromEntries(pids.map(p => [p, [S[p].perfect, S[p].good, S[p].miss]]));
      return g;
    },
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { const v = S[p].wraps; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, S[p].wraps])), unit: meta.unit };
    },
    _S: S, _L: L, get _t() { return t; },
  };
}
