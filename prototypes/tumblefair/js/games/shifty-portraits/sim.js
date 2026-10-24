// SHIFTY PORTRAITS (Halloween only; round 12, built on Memory Heist — a top-rated memory game). A hallway of a haunted
// house hung with portraits of friendly monsters: a ghost, a black cat, a bat, a pumpkin… each in its own frame, some
// wearing a hat or a bow. The lights are on for a moment — remember the wall. Then they flicker out, and when they come
// back on the mischievous ghost has CHANGED some of them: a new face in a frame, a hat swapped for a bow, a frame
// repainted, a portrait looking the other way, or two portraits swapped round. The game says HOW MANY changed; you tap
// that many portraits. Every right one is +3 (+1 more for being the first to find it), a wrong one -1 (your score never
// goes below 0). The hall keeps its changes, and the next round the lights come on again so you can look before the
// ghost strikes again. Five rounds; the ghost gets busier. Alone: a score out of the most you could get, with medals.
// Everything is from the seed; which portraits changed is never in the state before the reveal.
export const meta = {
  id: 'shifty-portraits', title: 'Shifty Portraits', blurb: 'The ghost is changing the portraits — spot what moved!',
  how: ['The lights are on: remember the portraits on the wall.', 'Lights out! A ghost changes some of them.', 'Tap the portraits that changed. Right +3, wrong -1.', 'Find one first for +1. Five rounds!'],
  kind: 'ui', min: 1, max: 4, seconds: 74, scoring: 'points', unit: 'points', tags: ['puzzle', 'holiday'], season: 'halloween', card: 'card-shifty-portraits', css: true,
};
export const SUBJECTS = ['ghost', 'cat', 'bat', 'pumpkin', 'owl', 'frog', 'mummy', 'skull', 'witch', 'spider'];
export const NAMES = { ghost: 'Ghost', cat: 'Cat', bat: 'Bat', pumpkin: 'Pumpkin', owl: 'Owl', frog: 'Frog', mummy: 'Mummy', skull: 'Skelly', witch: 'Witch', spider: 'Spider' };
export const ACCS = ['none', 'tophat', 'bow', 'crown', 'flower'];
export const FRAMES = ['#d9a52b', '#b8c4cc', '#9b4fe0', '#2fbf57', '#e8383d', '#ff8a1a'];
export const CHANGE_KINDS = ['subject', 'acc', 'frame', 'turn', 'swap'];
/** Wall size [columns, rows], how long the lights stay on (first round, later rounds) and changes per round. */
export const LEVEL = {
  easy: { size: [3, 2], study: [5, 3], changes: [1, 1, 1, 2, 2] },
  normal: { size: [3, 2], study: [4.5, 2.6], changes: [1, 1, 2, 2, 2] },
  hard: { size: [4, 2], study: [4.5, 2.6], changes: [1, 2, 2, 3, 3] },
};
export const ROUNDS = 5, START_S = 1.5, DARK_S = 1.3, GUESS_S = 6, REVEAL_S = 2.6, END_S = 3;
export const RIGHT = 3, FIRST = 1, WRONG = 1;

/** A fresh wall: every portrait a different subject, random hat, frame and facing. Portrait = [subject, acc, frame, facingLeft]. */
export function makeWall(rng, n) {
  const subs = rng.shuffle(SUBJECTS.map((_, i) => i)).slice(0, n);
  return subs.map(s => [s, rng.chance(0.55) ? rng.int(1, ACCS.length - 1) : 0, rng.int(0, FRAMES.length - 1), rng.chance(0.5) ? 1 : 0]);
}
const same = (a, b) => a.every((v, i) => v === b[i]);
/** Change `count` different portraits of `wall` (in place-safe: returns a new wall + the indices that changed). A swap
 *  changes two at once (only when it would leave count or fewer). Every change is visible. */
export function shift(rng, wall, count) {
  const out = wall.map(p => p.slice()), changed = new Set(), n = wall.length, kinds = [];
  let guard = 0;
  while (changed.size < count && guard++ < 200) {
    const free = [...Array(n).keys()].filter(i => !changed.has(i)); if (!free.length) break;
    const kind = rng.pick(count - changed.size >= 2 && free.length >= 2 ? CHANGE_KINDS : CHANGE_KINDS.filter(k => k !== 'swap'));
    const i = rng.pick(free), p = out[i];
    if (kind === 'swap') {
      const j = rng.pick(free.filter(x => x !== i)); if (same(out[i], out[j])) continue;
      [out[i], out[j]] = [out[j], out[i]]; changed.add(i); changed.add(j); kinds.push(kind); continue;
    }
    if (kind === 'subject') { const used = new Set(out.map(q => q[0])), pool = SUBJECTS.map((_, s) => s).filter(s => !used.has(s)); if (!pool.length) continue; p[0] = rng.pick(pool); }
    else if (kind === 'acc') p[1] = rng.pick(ACCS.map((_, a) => a).filter(a => a !== p[1]));
    else if (kind === 'frame') p[2] = rng.pick(FRAMES.map((_, f) => f).filter(f => f !== p[2]));
    else if (kind === 'turn') p[3] = p[3] ? 0 : 1;
    changed.add(i); kinds.push(kind);
  }
  return { wall: out, changed: [...changed].sort((a, b) => a - b), kinds };
}
/** The whole game's plan: the wall before each round and the shift each round makes. */
export function planGame(rng, difficulty = 'normal') {
  const L = LEVEL[difficulty] || LEVEL.normal, n = L.size[0] * L.size[1];
  let wall = makeWall(rng, n); const rounds = [];
  for (let r = 0; r < ROUNDS; r++) { const s = shift(rng, wall, L.changes[r]); rounds.push({ before: wall, after: s.wall, changed: s.changed, kinds: s.kinds }); wall = s.wall; }
  return { size: L.size, study: L.study, rounds };
}
export const maxScore = (plan, solo) => plan.rounds.reduce((n, r) => n + r.changed.length * (RIGHT + (solo ? 0 : FIRST)), 0);

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, plan = planGame(rng, difficulty);
  const total = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, taps = {}, found = new Set(), firsts = {}, gain = null;
  const events = [];
  const R = () => plan.rounds[round];
  function next() { round++; phase = 'study'; left = plan.study[round === 0 ? 0 : 1]; taps = Object.fromEntries(pids.map(p => [p, []])); found = new Set(); firsts = {}; gain = null; }
  function settle() {
    const ch = R().changed; gain = {};
    for (const p of pids) {
      let g = 0; for (const i of taps[p]) g += ch.includes(i) ? RIGHT + (!solo && firsts[i] === p ? FIRST : 0) : -WRONG;
      gain[p] = Math.max(-total[p], g) || 0; total[p] += gain[p];
    }
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    events,
    init: () => ({ rounds: ROUNDS, solo, cols: plan.size[0], rows: plan.size[1], subjects: SUBJECTS, names: NAMES, accs: ACCS, frames: FRAMES, max: maxScore(plan, solo), medals: [0.4, 0.6, 0.8].map(k => Math.round(maxScore(plan, solo) * k)) }),
    act(pid, a, d) {
      if (phase !== 'guess' || a !== 'tap' || !pids.includes(pid)) return;
      const need = R().changed.length, mine = taps[pid];
      if (!Number.isInteger(d) || d < 0 || d >= R().after.length || mine.includes(d) || mine.length >= need) return;
      mine.push(d);
      const right = R().changed.includes(d);
      if (right && !(d in firsts)) firsts[d] = pid;
      events.push({ e: 'tap', to: pid, i: d });                     // only the tapper learns which one they tapped (not whether it was right)
      if (pids.every(p => taps[p].length >= need)) left = Math.min(left, 0.4);
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'study') { phase = 'dark'; left = DARK_S; }
      else if (phase === 'dark') { phase = 'guess'; left = GUESS_S; }
      else if (phase === 'guess') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (round < 0) return g;
      if (phase === 'study') g.wall = R().before;
      if (phase === 'guess' || phase === 'reveal' || phase === 'end') { g.wall = R().after; g.need = R().changed.length; }
      if (phase === 'guess') g.done = pids.map(p => taps[p].length);
      if (phase === 'reveal') { g.changed = R().changed; g.kinds = R().kinds; g.taps = taps; g.gain = gain; g.firsts = firsts; g.before = R().before; }
      return g;
    },
    priv: pid => ({ taps: phase === 'guess' ? taps[pid] || [] : [] }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
    plan,
  };
}
