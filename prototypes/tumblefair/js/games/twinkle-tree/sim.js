// TWINKLE TREE (Winter Fair only) — a big evergreen with six lights, each its own colour AND shape AND number (1 red
// ball, 2 gold star, 3 blue diamond, 4 green triangle, 5 purple heart, 6 white snowflake), so colour is never the only
// cue. Each round the tree blinks a pattern, then everyone repeats it by tapping the lights on their phone, all at
// once. The pattern is the same for everyone and grows by one light every round (3, 4, 5… on normal; six rounds).
// Every right tap is 1 point and a whole pattern is +2 more. A wrong tap ends your turn for THAT round only (you are
// back for the next one, so nobody sits out the rest of the game). Most points wins; ties go to the longer best run.
// Alone you play beside Twinkle the tree sprite, who taps along and slips now and then (more often on longer patterns
// and on easy), so a sharp memory beats it. With the room's "Rival when alone" off (`rivals: false`) a lone player
// has no Twinkle: the same six rounds, scored the same way.
//
// The pattern is in the state only while the tree is showing it (and again after the round, as the answer), never
// before; a phone remembers it the way a player does.
export const meta = {
  id: 'twinkle-tree', title: 'Twinkle Tree', blurb: 'Watch the tree twinkle, then tap the lights back in the same order!',
  how: ['The tree blinks a pattern of lights.', 'Tap the same lights in the same order.', 'Every right tap scores. A whole pattern is +2!', 'The pattern grows by one light every round.'],
  kind: 'ui', min: 1, max: 4, seconds: 90, scoring: 'points', unit: 'points', tags: ['puzzle', 'holiday'], season: 'winter', card: 'card-twinkle-tree', css: true, rival: true,
};
export const LIGHTS = [
  { id: 'red', name: 'Red ball', shape: 'ball', hex: '#ff4d4d' }, { id: 'gold', name: 'Gold star', shape: 'star', hex: '#ffd23f' },
  { id: 'blue', name: 'Blue diamond', shape: 'diamond', hex: '#4da6ff' }, { id: 'green', name: 'Green triangle', shape: 'triangle', hex: '#4fe07a' },
  { id: 'purple', name: 'Purple heart', shape: 'heart', hex: '#c27bff' }, { id: 'white', name: 'White snowflake', shape: 'flake', hex: '#f4fbff' },
];
export const ROUNDS = 6, START_S = 2, LEAD_S = 0.6, TAIL_S = 0.4, RES_S = 1.6, END_S = 3, WHOLE = 2;
export const CPU = 'cpu', CPU_NAME = 'Twinkle';
/** start = first pattern length; blink = seconds per light; slip = Twinkle's chance per tap of a slip, at a length. */
export const LEVELS = {
  easy: { start: 3, blink: 0.75, slip: len => 0.05 + 0.015 * len },
  normal: { start: 3, blink: 0.6, slip: len => 0.03 + 0.012 * len },
  hard: { start: 4, blink: 0.48, slip: len => 0.02 + 0.009 * len },
};
export const showS = (len, blink) => LEAD_S + len * blink + TAIL_S;
export const playS = len => 2 + len * 0.9;

/** The whole game's pattern (one long run; round r shows the first start + r lights). No light twice in a row. */
export function makePattern(rng, n) {
  const out = [];
  while (out.length < n) { const k = rng.int(0, LIGHTS.length - 1); if (k !== out[out.length - 1]) out.push(k); }
  return out;
}

export function create({ rng, players, difficulty = 'normal', rivals }) {
  const D = LEVELS[difficulty] ? difficulty : 'normal', L = LEVELS[D];
  const pids = players.map(p => p.pid), solo = pids.length === 1 && rivals !== false, ids = solo ? [...pids, CPU] : pids.slice();
  const pattern = makePattern(rng, L.start + ROUNDS - 1), cpuRng = rng.fork();
  const score = Object.fromEntries(ids.map(i => [i, 0])), best = Object.fromEntries(ids.map(i => [i, 0]));
  let phase = 'ready', r = -1, len = 0, left = START_S, over = false;
  let pos = {}, st = {}, cpuWait = 0;
  const pat = () => pattern.slice(0, len).join('');

  function begin() {
    r++; len = L.start + r; phase = 'show'; left = showS(len, L.blink);
    pos = Object.fromEntries(ids.map(i => [i, 0])); st = Object.fromEntries(ids.map(i => [i, 0]));
  }
  function tap(id, k) {
    if (st[id] !== 0) return;
    if (k === pattern[pos[id]]) {
      pos[id]++; score[id]++;
      if (pos[id] === len) { st[id] = 1; score[id] += WHOLE; best[id] = Math.max(best[id], len); }
    } else st[id] = 2;
    if (ids.every(i => st[i] !== 0)) left = Math.min(left, 0.4);
  }
  function stepCpu(dt) {
    if (st[CPU] !== 0) return;
    cpuWait -= dt; if (cpuWait > 0) return;
    cpuWait = cpuRng.range(0.45, 0.8);
    const want = pattern[pos[CPU]];
    tap(CPU, cpuRng.chance(L.slip(len)) ? (want + cpuRng.int(1, LIGHTS.length - 1)) % LIGHTS.length : want);
  }

  return {
    init: () => ({ rounds: ROUNDS, blink: L.blink, lead: LEAD_S, start: L.start, solo, cpu: solo ? { id: CPU, name: CPU_NAME } : null, d: D }),
    act(pid, a, d) {
      if (a !== 'tap' || phase !== 'play' || !pids.includes(pid) || over) return;
      if (!Number.isInteger(d) || d < 0 || d >= LIGHTS.length) return;
      tap(pid, d);
    },
    step(dt) {
      if (over) return;
      left -= dt;
      if (phase === 'play' && solo) stepCpu(dt);
      if (left > 1e-9) return;
      if (phase === 'ready') begin();
      else if (phase === 'show') { phase = 'play'; left = playS(len); cpuWait = cpuRng.range(0.6, 1.0); }
      else if (phase === 'play') { phase = 'res'; left = RES_S; }
      else if (phase === 'res') { if (r + 1 < ROUNDS) begin(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), r, len, s: { ...score } };
      if (phase === 'show' || phase === 'res') g.pat = pat();
      if (phase === 'play' || phase === 'res') g.p = Object.fromEntries(ids.map(i => [i, [pos[i], st[i]]]));
      if (phase === 'end') g.best = { ...best };
      return g;
    },
    priv: pid => ({ pos: pos[pid] ?? 0, st: st[pid] ?? 0 }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { const k = score[p] * 100 + best[p]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const out = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, score[p]])), unit: meta.unit };
      if (solo) { out.cpu = score[CPU]; out.beat = score[pids[0]] > score[CPU]; }
      return out;
    },
    get _phase() { return phase; }, _pattern: pattern,
  };
}

/** A test/practice bot: remembers the pattern while the tree shows it, then taps it back one light every `gap` s;
 *  each tap slips (a wrong light) with chance `slip`. Call once per 50 ms step. */
export function treeBot(g, pid, { slip = 0, gap = 0.35, seed = 1 } = {}) {
  let mem = '', round = -1, wait = 0, n = (seed * 7919 + pid * 104729) % 2147483647 || 1;
  const rnd = () => (n = (n * 48271) % 2147483647) / 2147483647;
  return () => {
    const s = g.state();
    if (s.phase === 'show' && s.r !== round) { round = s.r; mem = s.pat; wait = 0; }
    if (s.phase !== 'play' || !mem) return;
    const [pos, st] = s.p[pid]; if (st !== 0) return;
    wait += 0.05; if (wait < gap) return; wait = 0;
    const want = +mem[pos];
    g.act(pid, 'tap', rnd() < slip ? (want + 1) % LIGHTS.length : want);
  };
}
