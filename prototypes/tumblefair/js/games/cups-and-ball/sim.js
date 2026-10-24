// SHELL SHUFFLE — the old fairground cups trick. A showman lifts one cup to show the ball, puts it down and shuffles
// the cups round the table. Everyone watches the same shuffle on their own phone, then everyone taps the cup they
// think hides the ball, at the same time. Right = 3 points, +1 for a quick tap (in the first 1.2 s), and a streak
// bonus (+1 on your 2nd right in a row, +2 from the 3rd). Rounds go 3 cups -> 4 -> 5 and every shuffle is longer and
// quicker than the last, with FAKE-OUTS: a swap that starts and goes back, two cups that only nudge at each other, and
// an empty cup lifted a crack to tempt you. Nobody sees anyone's pick until the reveal.
//
// TIMING: the whole round (the starting cup and the list of moves with their start times and lengths, in seconds
// after the shuffle starts) is in the state from the moment the round begins, so a phone animates exactly what the
// server decided. The state only changes when the phase changes, someone picks, or the clock ticks a whole second.
export const meta = {
  id: 'cups-and-ball', title: 'Shell Shuffle', blurb: 'Keep your eye on the ball while the cups shuffle — then tap the right cup!',
  how: ['Watch the ball go under a cup, then follow that cup!', 'When the shuffle stops, TAP the cup with the ball.', 'Quick taps and streaks score more. Beware fake-outs!'],
  kind: 'ui', min: 1, max: 4, seconds: 88, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-cups-and-ball', css: true,
  controls: { a: 'Pick' },
};
export const SHOW_S = 1.7, GAP_S = 0.5, REVEAL_S = 2.0, ALL_IN_S = 0.35, QUICK_S = 1.2;
export const CUPS = [3, 3, 4, 4, 5, 5, 5];                      // cups each round
export const MOVES = [4, 6, 6, 8, 8, 10, 12];                   // moves each round
export const LEVELS = {
  easy: { d0: 0.75, d1: 0.46, fake: 0.15, double: 0, guess: 5 },
  normal: { d0: 0.6, d1: 0.32, fake: 0.25, double: 0.15, guess: 4.2 },
  hard: { d0: 0.5, d1: 0.24, fake: 0.32, double: 0.3, guess: 3.6 },
};
export const PTS = { right: 3, quick: 1 };
export const streakBonus = s => (s >= 3 ? 2 : s === 2 ? 1 : 0);
const r2 = v => Math.round(v * 100) / 100;

/** One round's shuffle from the seed: { n, start, mv: [[t, d, kind, a, b, c?, e?]] } — kind 0 swap, 1 fake (half way
 *  and back), 2 nudge (a quarter and back), 3 peek (lift the cup in slot a a crack). A swap may carry a second pair
 *  (c, e) that swaps at the same time. Slots are left-to-right places on the table. */
export function makeRound(rng, r, difficulty = 'normal') {
  const L = LEVELS[difficulty] || LEVELS.normal, n = CUPS[r], count = MOVES[r], mv = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const u = count > 1 ? i / (count - 1) : 1, prog = r / (CUPS.length - 1);
    const d = r2((L.d0 + (L.d1 - L.d0) * Math.min(1, prog * 0.7 + u * 0.3)) * rng.range(0.9, 1.1));
    const a = rng.int(0, n - 1); let b = rng.int(0, n - 2); if (b >= a) b++;
    const roll = rng();
    if (r > 0 && i > 0 && i < count - 1 && roll < L.fake) {
      const k = 1 + rng.int(0, 2);
      mv.push(k === 3 ? [r2(t), r2(d * 0.8), 3, a, a] : [r2(t), d, k, Math.min(a, b), Math.max(a, b)]);
      t += (k === 3 ? d * 0.8 : d) + 0.06;
      continue;
    }
    const m = [r2(t), d, 0, Math.min(a, b), Math.max(a, b)];
    if (n >= 4 && rng() < L.double) {
      const rest = [...Array(n).keys()].filter(s => s !== a && s !== b);
      if (rest.length >= 2) { const c = rest[rng.int(0, rest.length - 1)], others = rest.filter(s => s !== c), e = others[rng.int(0, others.length - 1)]; m.push(Math.min(c, e), Math.max(c, e)); }
    }
    mv.push(m); t += d + 0.06;
  }
  return { n, start: rng.int(0, n - 1), mv, len: r2(t) };
}
/** Where the ball ends up (a slot) after the moves. Only real swaps (kind 0) change anything. */
export function ballAfter(round) {
  let s = round.start;
  for (const m of round.mv) {
    if (m[2] !== 0) continue;
    if (s === m[3]) s = m[4]; else if (s === m[4]) s = m[3];
    else if (m.length > 5) { if (s === m[5]) s = m[6]; else if (s === m[6]) s = m[5]; }
  }
  return s;
}
/** Where every cup is drawn at time t of the shuffle (seconds after it starts): [{ slot (fractional), lift }] by cup.
 *  Shared by the view and the tests, so what you see is what the server scores. Cup i starts in slot i. */
export function cupsAt(round, t) {
  const at = [...Array(round.n).keys()];                               // at[slot] = the cup there now
  const out = at.map(c => ({ slot: c, lift: 0, z: 0 }));
  const ease = u => u * u * (3 - 2 * u);
  for (const m of round.mv) {
    const [t0, d, k, a, b] = m;
    if (t < t0) break;
    const u = Math.min(1, (t - t0) / d), done = t >= t0 + d;
    const pairs = [[a, b]]; if (m.length > 5) pairs.push([m[5], m[6]]);
    if (k === 3) { if (!done) { const c = at[a]; out[c].lift = Math.sin(u * Math.PI) * 0.35; } continue; }
    for (const [p, q] of pairs) {
      const cp = at[p], cq = at[q];
      if (k === 0) {
        if (done) { at[p] = cq; at[q] = cp; out[cp].slot = q; out[cq].slot = p; out[cp].z = out[cq].z = 0; }
        else { const e = ease(u); out[cp].slot = p + (q - p) * e; out[cq].slot = q + (p - q) * e; const arc = Math.sin(e * Math.PI) * 0.5; out[cp].z = arc; out[cq].z = -arc; }
      } else {
        const reach = k === 1 ? 0.5 : 0.25, e = done ? 0 : Math.sin(u * Math.PI) * reach;
        out[cp].slot = p + (q - p) * e; out[cq].slot = q + (p - q) * e; const arc = Math.sin(u * Math.PI) * 0.25 * (done ? 0 : 1); out[cp].z = arc; out[cq].z = -arc;
      }
    }
  }
  return out;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const rounds = CUPS.map((_, r) => makeRound(rng, r, difficulty));
  const P = Object.fromEntries(pids.map(p => [p, { score: 0, streak: 0, best: 0, right: 0, quick: 0, pick: null, at: 0 }]));
  let r = 0, ph = 'show', t = 0, el = 0, over = false, last = null;
  const events = [];
  const dur = () => (ph === 'show' ? SHOW_S : ph === 'shuffle' ? rounds[r].len + GAP_S : ph === 'guess' ? L.guess : REVEAL_S);
  function reveal() {
    const R = rounds[r], ball = ballAfter(R), got = {};
    for (const p of pids) {
      const s = P[p];
      if (s.pick === ball) { s.streak++; s.right++; const q = s.at <= QUICK_S ? PTS.quick : 0; if (q) s.quick++; const g = PTS.right + q + streakBonus(s.streak); s.score += g; got[p] = g; s.best = Math.max(s.best, s.streak); }
      else { s.streak = 0; got[p] = 0; }
    }
    last = { ball, picks: Object.fromEntries(pids.map(p => [p, P[p].pick])), got };
    events.push({ e: 'reveal', r, ball, ...last });
  }
  return {
    events,
    init: () => ({ rounds: CUPS.length, solo, guess: L.guess, show: SHOW_S, gap: GAP_S, quick: QUICK_S }),
    act(pid, a, d) {
      if (a !== 'pick' || !P[pid] || ph !== 'guess' || over) return;
      const s = P[pid]; if (s.pick != null) return;                       // the first tap is your answer
      const i = typeof d === 'object' && d ? d.i : d, rr = typeof d === 'object' && d ? d.r : r;
      if (!Number.isInteger(i) || i < 0 || i >= rounds[r].n || (rr != null && rr !== r)) return;
      s.pick = i; s.at = r2(t);
      events.push({ e: 'picked', pid });
    },
    step(dt) {
      if (over) return;
      el += dt; t += dt;
      if (ph === 'guess' && pids.every(p => P[p].pick != null) && t < dur() - ALL_IN_S) t = dur() - ALL_IN_S;
      if (t < dur()) return;
      t = 0;
      if (ph === 'show') ph = 'shuffle';
      else if (ph === 'shuffle') { ph = 'guess'; for (const p of pids) { P[p].pick = null; P[p].at = 0; } }
      else if (ph === 'guess') { reveal(); ph = 'reveal'; }
      else { r++; last = null; if (r >= rounds.length) { over = true; r = rounds.length - 1; ph = 'end'; } else ph = 'show'; }
      events.push({ e: 'phase', ph, r });
    },
    state() {
      const R = rounds[r];
      const g = { ph, r, n: R.n, st: R.start, mv: R.mv, sc: Object.fromEntries(pids.map(p => [p, P[p].score])), sk: Object.fromEntries(pids.map(p => [p, P[p].streak])) };
      if (ph === 'guess') { g.pk = pids.filter(p => P[p].pick != null); g.left = Math.max(0, Math.ceil(L.guess - t)); }
      if (ph === 'reveal' && last) { g.ball = last.ball; g.picks = last.picks; g.got = last.got; }
      return g;
    },
    priv: pid => ({ pick: P[pid]?.pick ?? null, r }),
    get over() { return over; },
    _P: P, _rounds: rounds, get _ph() { return ph; }, get _r() { return r; }, get _t() { return t; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, P[p].score])), groups = new Map();
      const key = p => P[p].score * 100 + P[p].right;                      // ties on points: more right answers
      for (const p of pids) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const res = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
      if (solo) res.medal = [20, 30, 38].filter(m => scores[pids[0]] >= m).length;
      return res;
    },
  };
}
