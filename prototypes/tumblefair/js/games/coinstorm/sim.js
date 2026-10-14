// COINSTORM — five rounds. Each round every player gets 10 fresh coins and splits them, in secret, between three spots:
//   Piggy Bank   keeps them.
//   Windmill     doubles them, UNLESS yours is the biggest pile on the windmill (ties for biggest too): then it
//                blows away. Alone, you are up against a pile from "the Gust", a pretend rival rolled each round.
//   Storm Cloud  a forecast says the chance of sunshine (20-80%). Sunshine triples the pile; a storm loses it all.
// Everyone reveals together; coins won are added to a running total, and the biggest total after round 5 wins.
// The storm's outcome (and the Gust's pile) are rolled from the seed when the game is made and kept here, never in
// the public state, until the reveal.
export const meta = {
  id: 'coinstorm', title: 'Coinstorm', blurb: 'Hide your coins: safe or risky, everyone reveals together!',
  how: ['Each round, split 10 coins between three spots.', 'Piggy Bank keeps them. Windmill doubles them, unless yours is the biggest pile there.', 'Storm Cloud triples them in sunshine, loses them in a storm. Check the forecast!', 'Everyone reveals together. Most coins after 5 rounds wins.'],
  kind: 'ui', min: 1, max: 4, seconds: 106, scoring: 'points', unit: 'coins', tags: ['chance', 'social'], card: 'card-coinstorm', css: true,
};
export const COINS = 10, ROUNDS = 5, START_S = 2, PICK_S = 14, REVEAL_S = 5.5, END_S = 3;
export const FORECASTS = [20, 30, 40, 50, 60, 70, 80];          // % chance of sunshine
export const SPOTS = ['bank', 'mill', 'cloud'];
export const GUST = [1, 7];                                       // solo: the pretend rival's windmill pile, inclusive

/** Is `d` a valid split: three whole numbers from 0, adding up to COINS? */
export const validSplit = d => Array.isArray(d) && d.length === 3 && d.every(n => Number.isInteger(n) && n >= 0 && n <= COINS) && d[0] + d[1] + d[2] === COINS;

/** Settle one round. alloc: pid -> [bank, mill, cloud]; extra: piles that compete on the windmill but win nothing. */
export function settleRound(alloc, sun, extra = []) {
  const piles = [...Object.values(alloc).map(a => a[1]), ...extra];
  const top = Math.max(0, ...piles);
  const blown = Object.keys(alloc).map(Number).filter(p => top > 0 && alloc[p][1] === top);
  const gain = {};
  for (const [k, [b, m, c]] of Object.entries(alloc)) gain[k] = b + (blown.includes(+k) ? 0 : m * 2) + (sun ? c * 3 : 0);
  return { top, blown, gain };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = Array.from({ length: ROUNDS }, () => { const f = rng.pick(FORECASTS); return { f, sun: rng() * 100 < f, gust: rng.int(GUST[0], GUST[1]) }; });
  const total = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false;
  let alloc = {}, locked = new Set(), reveal = null;
  const history = [];
  function next() { round++; phase = 'pick'; left = PICK_S; alloc = Object.fromEntries(pids.map(p => [p, [COINS, 0, 0]])); locked = new Set(); reveal = null; }
  function settle() {
    const P = plan[round], r = settleRound(alloc, P.sun, solo ? [P.gust] : []);
    for (const p of pids) total[p] += r.gain[p];
    reveal = { alloc: { ...alloc }, sun: P.sun, top: r.top, blown: r.blown, gain: r.gain, ...(solo ? { gust: P.gust } : {}) };
    history.push({ sun: P.sun, f: P.f });
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ coins: COINS, rounds: ROUNDS, solo }),
    act(pid, a, d) {
      if (phase !== 'pick' || !pids.includes(pid)) return;
      if (a === 'set') { if (!validSplit(d)) return; alloc[pid] = d.slice(); locked.delete(pid); }
      else if (a === 'lock') {
        if (d === false) { locked.delete(pid); return; }
        if (d !== true) return;
        locked.add(pid); if (pids.every(p => locked.has(p))) left = Math.min(left, 0.6);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 0) return;
      if (phase === 'ready') next();
      else if (phase === 'pick') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), round, scores: { ...total }, past: history.map(h => h.sun ? 1 : 0).join('') };
      if (round >= 0 && phase !== 'end') g.f = plan[round].f;
      if (phase === 'ready') g.f = plan[0].f;
      if (phase === 'pick') g.locked = pids.filter(p => locked.has(p));
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv: pid => ({ split: phase === 'pick' ? alloc[pid] : null, locked: locked.has(pid) }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
  };
}
