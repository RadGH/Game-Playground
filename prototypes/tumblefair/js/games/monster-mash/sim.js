// MONSTER MASH (Halloween only) — a rhythm dance on a spooky-cute graveyard stage. Arrows scroll down four lanes to a
// line in time with a synthesized tune; tap the matching big button (Wave / Hop / Zombie / Clap) as an arrow reaches
// the line and your character does that move on the stage. The chart is made from the seed: a lead-in bar, then four
// sections that get busier (on the beat -> some eighths -> off-beats -> a monster finale), then one last note.
// Perfect = 100, good = 50, times a combo multiplier (x2 after 8 in a row, x3 after 16, x4 after 24); a missed arrow,
// a tap with no arrow near it or the wrong button breaks the combo. Highest score wins. Alone: a score attack with a
// grade.
//
// TIMING IS JUDGED ON THE PHONE against its own audio clock (a round trip would ruin the rhythm), exactly like One
// Button Orchestra: the phone sends `hit` { n, q: 0 perfect | 1 good } and `stray` n (a wrong or empty tap just before
// arrow n). The server accepts only what could have happened: each arrow once, never an arrow whose time has not come
// yet (late is fine — the network), a stray at most once per arrow. Arrows never judged count as misses once their time
// has clearly passed.
export const meta = {
  id: 'monster-mash', title: 'Monster Mash', blurb: 'Dance to the spooky beat: tap the arrows right on time!',
  how: ['Arrows slide down your phone towards the line.', 'Tap the matching button as each one reaches the line.', 'Your character dances the move: Wave, Hop, Zombie or Clap!', 'Perfect taps and long combos score big. Highest score wins!'],
  kind: 'ui', min: 1, max: 4, seconds: 48, scoring: 'points', unit: 'points', tags: ['action', 'holiday'], season: 'halloween', card: 'card-monster-mash', css: true,
};
export const COUNT_S = 3, END_S = 4, PLAY_MAX = 36;
export const BPM = { easy: 92, normal: 104, hard: 116 };
export const WINDOW = { perfect: 0.08, good: 0.17 };
export const EARLY = 0.35, LATE_MISS = 1.2;
export const POINTS = [100, 50];
export const MOVES = [
  { id: 'wave', name: 'Wave', arrow: 'left', clip: 'wave' },
  { id: 'hop', name: 'Hop', arrow: 'up', clip: 'jump' },
  { id: 'zombie', name: 'Zombie', arrow: 'down', clip: 'cast' },
  { id: 'clap', name: 'Clap', arrow: 'right', clip: 'clap' },
];
export const SECTIONS = ['Warm-up', 'Getting spooky', 'Graveyard shuffle', 'Monster finale!'];
/** One-bar patterns of eight eighth-note steps per section ('x' = an arrow). */
export const PATTERNS = [
  ['x.x.x.x.', 'x...x...', 'x.x.x...', 'x...x.x.'],
  ['x.x.xxx.', 'xxx.x...', 'x.x.x.xx', 'x...xxx.', 'x.xx.x..'],
  ['x..x..x.', '.x.x.x.x', 'x..x.xx.', '.xx..x.x', 'x.x..xx.'],
  ['xx.xx.x.', 'x.xxx.x.', 'xx.x.xx.', 'x.xx.xxx', 'xxx.x.x.'],
];
export const mult = combo => 1 + Math.min(3, Math.floor(combo / 8));

/** The chart: { bpm, bars, steps: [eighth-step of each arrow], lanes: [0-3 per arrow], sec: [section start bar] }. */
export function makeChart(rng, difficulty = 'normal') {
  const bpm = BPM[difficulty] || BPM.normal, bars = Math.floor(PLAY_MAX * bpm / 240) - 1;
  const steps = [], lanes = [], sec = [];
  let last = null, lane = rng.int(0, 3), run = 0;
  for (let b = 0; b < bars - 1; b++) {
    const level = Math.min(3, Math.floor(b * 4 / (bars - 1)));
    if (sec[level] == null) sec[level] = b + 1;
    const set = PATTERNS[difficulty === 'easy' ? [0, 0, 2, 1][level] : level];
    let p = rng.pick(set); if (p === last) p = rng.pick(set); last = p;
    [...p].forEach((c, i) => {
      if (c !== 'x') return;
      const s = (b + 1) * 8 + i, quick = steps.length && s - steps[steps.length - 1] === 1;
      // quick pairs stay on the same button or a neighbour; never more than three of one button in a row
      let next = quick ? Math.max(0, Math.min(3, lane + rng.pick([-1, 0, 1]))) : rng.int(0, 3);
      if (next === lane && run >= 2) next = (lane + rng.int(1, 3)) % 4;
      run = next === lane ? run + 1 : 0; lane = next;
      steps.push(s); lanes.push(lane);
    });
  }
  let end = rng.int(0, 3); if (end === lane && run >= 2) end = (lane + 1) % 4;
  steps.push(bars * 8); lanes.push(end);                      // the last arrow: the downbeat of the final bar
  return { bpm, bars: bars + 1, steps, lanes, sec };
}
export const stepSec = bpm => 30 / bpm;

/** Score a player from what they judged (like One Button Orchestra). */
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
  let phase = 'count', left = COUNT_S, el = 0, over = false;
  const noteT = n => chart.steps[n] * ss;
  const okNote = n => Number.isInteger(n) && n >= 0 && n < chart.steps.length;
  const stats = upTo => Object.fromEntries(pids.map(p => { const s = scoreOf(chart, judged[p], strays[p], upTo); return [p, [s.score, s.combo, s.p, s.g, s.miss, s.best]]; }));
  // the last move each player landed ([arrow index, lane]) so every screen can make their character dance it
  const moved = Object.fromEntries(pids.map(p => [p, [-1, -1]]));

  return {
    init: () => ({ chart, songLen, moves: MOVES, max: maxScore(chart), window: WINDOW, solo: pids.length === 1 }),
    act(pid, a, d) {
      if (phase !== 'play' || !pids.includes(pid)) return;
      if (a === 'hit') {
        if (!d || typeof d !== 'object' || !okNote(d.n) || (d.q !== 0 && d.q !== 1)) return;
        if (judged[pid].has(d.n) || noteT(d.n) > el + EARLY) return;
        judged[pid].set(d.n, d.q);
        if (d.n > moved[pid][0]) moved[pid] = [d.n, chart.lanes[d.n]];
      } else if (a === 'stray') {
        if (!okNote(d) || strays[pid].has(d) || judged[pid].has(d)) return;
        if (d > 0 && noteT(d - 1) > el + EARLY) return;
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
      const g = { phase, left: Math.max(0, Math.ceil(left)), st: stats(phase === 'play' ? el : Infinity), mv: moved };
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
