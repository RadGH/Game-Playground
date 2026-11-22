// COPYCAT CHA-CHA — a dance-off against the Dance Captain. Each round the Captain dances a short routine on the beat
// (Clap, Jump, Wave, Spin — one move a beat) while everyone WATCHES; then the music says "your turn" and everyone
// dances it back, one move a beat, from memory. The routine grows every round (3 moves, then 4, 5…).
//   right move, right on the beat   3 (perfect) or 2 (good)
//   right move, off the beat        1
//   wrong move or no move           0
//   the whole routine right AND on the beat: +3 FLAWLESS
// Most points after the last round wins. Alone: the same show, medal scores to beat.
// Difficulty: Family = shorter routines and the moves stay faintly on screen while you copy; Tricky = longer routines.
//
// Timing is judged on the PHONE'S clock, like Spotlight Dance: the phone counts the song from the first state it gets
// and sends WHEN it pressed (`act('move', { t, m })`); the server checks t is recent and judges that time against the
// schedule below, so lag never moves the beat. The schedule is the same pure function on both sides (`phaseAt`).
export const meta = {
  id: 'copycat-cha-cha', title: 'Copycat Cha-Cha', blurb: 'Watch the Dance Captain, then copy the moves on the beat!',
  how: ['Watch the Dance Captain dance a routine.', 'Then dance it back: one move a beat, from memory.', 'Right move on the beat = big points. All right = Flawless!', 'Every round the routine gets longer.'],
  kind: 'ui', min: 1, max: 4, seconds: 76, scoring: 'points', unit: 'pts', tags: ['action'], card: 'card-copycat-cha-cha', css: true,
};

export const BEAT = 60 / 66;                       // one move every 2 beats of the 132 bpm fair-organ tune (same as Spotlight Dance)
export const LEAD = 2.0;                           // count-in before the first beat
export const MOVES = Object.freeze(['Clap', 'Jump', 'Wave', 'Spin']);
export const RULES = {
  lens: { easy: [3, 3, 4, 4, 5], normal: [3, 4, 5, 6, 7], hard: [4, 5, 6, 7, 7] },   // routine length per round
  window: { easy: 0.2, normal: 0.15, hard: 0.11 },  // seconds either side of the beat that count as on it (perfect = half)
  pts: { perfect: 3, good: 2, off: 1, wrong: 0 }, flawless: 3,
  ahead: 0.35, lag: 1.0,                           // a press's time may be this far ahead of / behind the server
};

export const diffOf = d => (RULES.lens[d] ? d : 'normal');
/** Beats a round takes: 1 "watch" cue + L captain moves + 1 "your turn" + 1 count + L copy slots + 1 review. */
export const roundBeats = L => 4 + 2 * L;
/** Where the show is at song time t (seconds): { r, ph, j, k } — ph 'lead' | 'watch' | 'cue' | 'copy' | 'review' | 'end';
 *  j = the move index inside the routine (watch/copy), k = the beat number. Same function in the sim, the view and the CPU. */
export function phaseAt(t, lens) {
  const k = Math.round((t - LEAD) / BEAT);
  if (t < LEAD - BEAT / 2) return { r: 0, ph: 'lead', j: -1, k };
  let start = 0;
  for (let r = 0; r < lens.length; r++) {
    const L = lens[r], b = k - start;
    if (b < roundBeats(L)) {
      if (b === 0) return { r, ph: 'watch', j: -1, k };             // "Watch!"
      if (b <= L) return { r, ph: 'watch', j: b - 1, k };
      if (b <= L + 2) return { r, ph: 'cue', j: -1, k };             // "Your turn!" + count
      if (b < L + 3 + L) return { r, ph: 'copy', j: b - L - 3, k };
      return { r, ph: 'review', j: -1, k };
    }
    start += roundBeats(L);
  }
  return { r: lens.length - 1, ph: 'end', j: -1, k };
}
/** Song time of the beat that starts round r, and of copy slot j in round r. */
export function roundStart(r, lens) { let b = 0; for (let i = 0; i < r; i++) b += roundBeats(lens[i]); return b; }
export const copyBeat = (r, j, lens) => roundStart(r, lens) + lens[r] + 3 + j;
export const showLength = lens => LEAD + roundStart(lens.length, lens) * BEAT;
export const maxScore = lens => lens.reduce((s, L) => s + L * RULES.pts.perfect + RULES.flawless, 0);
export const medalsFor = lens => { const m = maxScore(lens); return [0.38, 0.6, 0.82].map(f => Math.round(m * f)); };

/** A routine of L moves from the seeded rng: never the same move three times running, and never all one move. */
export function routine(rng, L) {
  for (;;) {
    const s = [];
    for (let i = 0; i < L; i++) { let m; do m = rng.int(0, 3); while (i >= 2 && s[i - 1] === m && s[i - 2] === m); s.push(m); }
    if (new Set(s).size > 1) return s;
  }
}

export function create({ rng, players, difficulty = 'normal' }) {
  const D = diffOf(difficulty), lens = RULES.lens[D], WIN = RULES.window[D], solo = players.length === 1;
  const seqs = lens.map(L => routine(rng, L));
  // per player: points, per-round marks ('' until a slot is judged: P perfect, G good, O off-beat, X wrong, - missed)
  const P = new Map(players.map(p => [p.pid, { pts: 0, lastT: -9, marks: lens.map(L => Array(L).fill('')), flaw: 0, best: 0 }]));
  const events = [], END = showLength(lens);
  let el = 0, over = false, reviewed = -1;
  const ptsOf = q => RULES.pts[{ P: 'perfect', G: 'good', O: 'off', X: 'wrong' }[q]] || 0;
  function review(r) {                     // a round's copy slots are all behind us: misses, flawless bonuses
    const res = {};
    for (const [pid, s] of P) {
      const m = s.marks[r];
      for (let j = 0; j < m.length; j++) if (!m[j]) m[j] = '-';
      const flawless = m.every(q => q === 'P' || q === 'G');
      if (flawless) { s.pts += RULES.flawless; s.flaw++; }
      const right = m.filter(q => q !== 'X' && q !== '-').length;
      s.best = Math.max(s.best, right);
      res[pid] = [right, m.length, flawless ? 1 : 0];
    }
    events.push({ e: 'round', r, res });
  }
  return {
    events,
    init: () => ({ solo, lens, beat: BEAT, lead: LEAD, window: WIN, hints: D === 'easy', medals: solo ? medalsFor(lens) : null, left: Math.ceil(meta.seconds - el) }),
    act(pid, a, d) {
      if (a !== 'move' || over || !P.has(pid)) return;
      if (!d || typeof d !== 'object' || typeof d.t !== 'number' || !Number.isFinite(d.t) || !Number.isInteger(d.m) || d.m < 0 || d.m > 3) return;
      const s = P.get(pid), t = d.t;
      if (t > el + RULES.ahead || t < el - RULES.lag || t <= s.lastT) return;
      s.lastT = t;
      const at = phaseAt(t, lens);
      if (at.ph !== 'copy') { events.push({ e: 'move', pid, m: d.m, q: 'wait' }); return; }   // dancing along while watching: no points
      if (s.marks[at.r][at.j]) { events.push({ e: 'move', pid, m: d.m, q: 'double', to: pid }); return; }
      const off = t - (LEAD + at.k * BEAT), right = seqs[at.r][at.j] === d.m;
      const q = !right ? 'X' : Math.abs(off) <= WIN / 2 ? 'P' : Math.abs(off) <= WIN ? 'G' : 'O';
      s.marks[at.r][at.j] = q;
      const add = ptsOf(q); s.pts += add;
      events.push({ e: 'move', pid, m: d.m, q, add, r: at.r, j: at.j, early: off < 0 ? 1 : 0 });
    },
    step(dt) {
      if (over) return;
      el += dt;
      // a round is reviewed once its last copy slot (and its timing window) is past
      for (let r = reviewed + 1; r < lens.length; r++) {
        const lastT = LEAD + (copyBeat(r, lens[r] - 1, lens)) * BEAT + BEAT / 2;
        if (el < lastT) break;
        review(r); reviewed = r;
      }
      if (el >= END + 0.6 || el >= meta.seconds) { if (reviewed < lens.length - 1) for (let r = reviewed + 1; r < lens.length; r++) review(r); reviewed = lens.length - 1; over = true; events.push({ e: 'end' }); }
    },
    state() {
      const at = phaseAt(el, lens), sc = {}, mk = {};
      for (const p of players) { const s = P.get(p.pid); sc[p.pid] = s.pts; mk[p.pid] = s.marks[at.r].join('') || ''; }
      // the routine is public from the round's "Watch!" beat on (everyone sees the Captain dance it anyway)
      return { el: Math.round(el * 20) / 20, r: at.r, ph: at.ph, seq: at.ph === 'lead' ? null : seqs[at.r], sc, mk, left: Math.max(0, Math.ceil(Math.min(meta.seconds, END + 0.6) - el)) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).pts; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get el() { return el; }, seqs, lens,
  };
}

