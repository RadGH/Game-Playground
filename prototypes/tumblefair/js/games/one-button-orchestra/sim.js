// ONE BUTTON ORCHESTRA — everyone plays the same tune with one big button. Notes scroll down to a line on each phone;
// tap as a note crosses it. The chart is made from the seed: a lead-in bar of clicks, then four sections that get
// harder (on the beat -> eighth notes -> off-beats -> a busy finale), then one last note. Perfect = 100, good = 50,
// times a combo multiplier (x2 after 8 in a row, x3 after 16, x4 after 24); a missed note or a tap with no note near it
// breaks the combo. Highest score wins. Alone it is a score attack with a grade.
//
// TIMING IS JUDGED ON THE PHONE, against its own audio clock (a round trip to the server would ruin the rhythm). The
// phone sends what it judged: `hit` { n: note index, q: 0 perfect | 1 good } and `stray` n (a tap with no note, just
// before note n). The server only accepts what is possible: each note once, never a note whose time has not come yet
// (a judgement may arrive late — the network — but never early), and a stray at most once per note. Notes never judged
// count as misses once their time has clearly passed.
export const meta = {
  id: 'one-button-orchestra', title: 'One Button Orchestra', blurb: 'One button, one band: tap on the beat!',
  how: ['Notes fall down your phone towards the line.', 'Tap the big button as each note crosses the line.', 'Perfect taps score double, and a long combo multiplies everything.', 'The tune gets trickier as it goes. Highest score wins!'],
  kind: 'ui', min: 1, max: 4, seconds: 46, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-one-button-orchestra', css: true,
};
export const COUNT_S = 3, END_S = 3, PLAY_MAX = 36;
export const BPM = { easy: 96, normal: 108, hard: 120 };
export const WINDOW = { perfect: 0.075, good: 0.16 };      // seconds either side of a note (the phone uses these)
export const EARLY = 0.35, LATE_MISS = 1.2;                 // server: how early a judgement may be (clock slack); when an unjudged note is a miss
export const POINTS = [100, 50];
export const SECTIONS = ['Warm-up', 'Picking up', 'Off-beat!', 'Grand finale!'];
/** One-bar patterns of eight eighth-note steps per section ('x' = a note). */
export const PATTERNS = [
  ['x.x.x.x.', 'x...x...', 'x.x.x...', 'x...x.x.', 'x.x...x.'],
  ['x.xxx.x.', 'xxx.x.x.', 'x.x.xxx.', 'xx..xx..', 'x.xx.xx.'],
  ['x..x..x.', '.x.x.xx.', 'x..x.xx.', 'x.x..xx.', '.xx..xx.'],
  ['xxxx.x.x', 'x.xxx.xx', 'xx.xxx.x', 'xxx.xxx.', 'xx.xx.xx'],
];
export const mult = combo => 1 + Math.min(3, Math.floor(combo / 8));

/** The chart: { bpm, bars, steps: [eighth-step index of each note], sec: [section start bar] }. Step 0 = music start. */
export function makeChart(rng, difficulty = 'normal') {
  const bpm = BPM[difficulty] || BPM.normal, bars = Math.floor(PLAY_MAX * bpm / 240) - 1;   // -1: the lead-in bar
  const steps = [], sec = [];
  let last = null;
  for (let b = 0; b < bars - 1; b++) {
    const level = Math.min(3, Math.floor(b * 4 / (bars - 1)));
    if (sec[level] == null) sec[level] = b + 1;
    const set = PATTERNS[difficulty === 'easy' ? [0, 0, 2, 1][level] : level];      // easy: the finale is plain eighth notes
    let p = rng.pick(set); if (p === last) p = rng.pick(set); last = p;
    [...p].forEach((c, i) => { if (c === 'x') steps.push((b + 1) * 8 + i); });
  }
  steps.push(bars * 8);                                       // the last note: the downbeat of the final bar
  return { bpm, bars: bars + 1, steps, sec };
}
export const stepSec = bpm => 30 / bpm;

/** Score a player from what they judged. `upTo` (seconds of music) decides which unjudged notes count as missed. */
export function scoreOf(chart, judged, strays, upTo = Infinity) {
  const ss = stepSec(chart.bpm);
  let score = 0, combo = 0, best = 0, p = 0, g = 0, miss = 0;
  for (let n = 0; n < chart.steps.length; n++) {
    if (strays.has(n)) combo = 0;
    const q = judged.get(n);
    if (q == null) { if (chart.steps[n] * ss + LATE_MISS < upTo) { miss++; combo = 0; continue; } break; }
    score += POINTS[q] * mult(combo); combo++; best = Math.max(best, combo); if (q === 0) p++; else g++;
  }
  return { score, combo, best, p, g, miss };
}
export const maxScore = chart => scoreOf(chart, new Map(chart.steps.map((s, i) => [i, 0])), new Set()).score;

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), chart = makeChart(rng, difficulty), ss = stepSec(chart.bpm);
  const songLen = chart.bars * 8 * ss;
  const judged = Object.fromEntries(pids.map(p => [p, new Map()])), strays = Object.fromEntries(pids.map(p => [p, new Set()]));
  const instrument = Object.fromEntries(players.map(p => [p.pid, (p.seat ?? 0) % 4]));
  let phase = 'count', left = COUNT_S, el = 0, over = false;
  const noteT = n => chart.steps[n] * ss;
  const okNote = n => Number.isInteger(n) && n >= 0 && n < chart.steps.length;
  const stats = upTo => Object.fromEntries(pids.map(p => { const s = scoreOf(chart, judged[p], strays[p], upTo); return [p, [s.score, s.combo, s.p, s.g, s.miss, s.best]]; }));

  return {
    init: () => ({ chart, songLen, instrument, max: maxScore(chart), window: WINDOW, solo: pids.length === 1 }),
    act(pid, a, d) {
      if (phase !== 'play' || !pids.includes(pid)) return;
      if (a === 'hit') {
        if (!d || typeof d !== 'object' || !okNote(d.n) || (d.q !== 0 && d.q !== 1)) return;
        if (judged[pid].has(d.n) || noteT(d.n) > el + EARLY) return;          // once per note, and never before its time
        judged[pid].set(d.n, d.q);
      } else if (a === 'stray') {
        if (!okNote(d) || strays[pid].has(d) || judged[pid].has(d)) return;
        if (d > 0 && noteT(d - 1) > el + EARLY) return;                        // a stray before note n happens after note n-1
        strays[pid].add(d);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt;
      if (phase === 'play') el += dt;
      if (left > 0) return;
      if (phase === 'count') { phase = 'play'; left = songLen + 0.6; el = 0; }
      else if (phase === 'play') { phase = 'end'; left = END_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), st: stats(phase === 'play' ? el : Infinity) };
      if (phase === 'play') g.sec = chart.sec.filter(b => b * 8 * ss <= el).length - 1;
      return g;
    },
    get over() { return over; },
    result() {
      const st = stats(Infinity), groups = new Map(), scores = {};
      for (const p of pids) { scores[p] = st[p][0]; if (!groups.has(scores[p])) groups.set(scores[p], []); groups.get(scores[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
