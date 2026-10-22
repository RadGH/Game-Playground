// TREASURE MAP BLUFF — five rounds on a torn treasure map with four routes (A-D). Each round one route hides the
// TREASURE, one or two hide TRAPS, the rest are empty. Every player privately sees what is on TWO of the routes (their
// piece of the map). While the clock runs you may post up to three canned CLAIMS everyone sees ("Route B is safe!",
// "The treasure is on C!", "I'm taking A." …) — true or false, your call — and secretly pick a route.
//   Treasure: the pot (12 gold) is split evenly between everyone who picked it (alone = all 12).
//   Trap:     lose 4 gold (your total never drops below 0).   Empty: nothing.   No pick: you stayed at camp.
// The reveal shows every route, every pick, and stamps each claim TRUE or FALSE. Most gold after five rounds wins.
// Solo: Captain Squawk, a parrot who knows the other two routes, posts a claim (honest about half the time) and goes
// for the treasure too — split it with a bird. Its gold is shown but it is not placed.
// Contents, who sees what, and the parrot's choices all come from the seed when the game is made.
export const meta = {
  id: 'treasure-map-bluff', title: 'Treasure Map Bluff', blurb: 'You each hold a piece of the map: share it, or lie about it!',
  how: ['You can see what is on two of the four routes.', 'Post claims for everyone ("Route B is safe!") — true or false.', 'Secretly pick a route. Treasure is split between everyone who finds it; traps cost 4.', 'The reveal shows who told the truth!'],
  kind: 'ui', min: 1, max: 4, seconds: 90, scoring: 'points', unit: 'gold', tags: ['social', 'chance'], card: 'card-treasure-map-bluff', css: true,
};
export const ROUTES = 4, ROUNDS = 5, POT = 12, TRAP = 4, MAX_CLAIMS = 3, START_S = 2, PLAN_S = 12, REVEAL_S = 4, END_S = 3;
export const CPU = 'cpu', CPU_NAME = 'Captain Squawk';
/** Canned claims. `r`: the claim names a route. `test(content, picked)` says whether it was true (null = not a fact). */
export const CLAIMS = {
  safe: { r: true, text: 'Route {R} is safe!', test: (c) => c !== 'trap' },
  gold: { r: true, text: 'The treasure is on {R}!', test: (c) => c === 'gold' },
  trap: { r: true, text: '{R} is a trap!', test: (c) => c === 'trap' },
  going: { r: true, text: "I'm taking {R}.", test: (c, picked, r) => picked === r },
  trust: { r: false, text: 'Trust me!' },
  liar: { r: false, text: "Don't believe them!" },
  share: { r: false, text: "Let's share it!" },
};
export const LETTERS = 'ABCD';
export const claimText = (k, r) => CLAIMS[k].text.replace('{R}', LETTERS[r] ?? '?');

/** One round's map: contents per route, and which two routes each seat sees (k = 0..3; 4 = the parrot when solo). */
export function planRound(rng, round, n) {
  const traps = round < 2 ? 1 : 2, content = new Array(ROUTES).fill('empty');
  const order = rng.shuffle([0, 1, 2, 3]);
  content[order[0]] = 'gold'; for (let t = 0; t < traps; t++) content[order[1 + t]] = 'trap';
  const perm = rng.shuffle([0, 1, 2, 3]), sees = [];
  for (let k = 0; k < Math.max(n, 2); k++) sees.push(k < 2 ? [perm[(2 * k) % 4], perm[(2 * k + 1) % 4]].sort() : rng.shuffle([0, 1, 2, 3]).slice(0, 2).sort());
  return { content, sees };
}
/** Settle a round. picks: id -> route or null. -> { gain: id -> gold change, finders: count } */
export function settleRound(content, picks) {
  const ids = Object.keys(picks), finders = ids.filter(k => picks[k] != null && content[picks[k]] === 'gold').length, gain = {};
  for (const k of ids) { const r = picks[k]; gain[k] = r == null ? 0 : content[r] === 'gold' ? Math.floor(POT / finders) : content[r] === 'trap' ? -TRAP : 0; }
  return { gain, finders };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, n = pids.length;
  const plans = Array.from({ length: ROUNDS }, (_, r) => planRound(rng, r, n));
  // the parrot (solo only): sees the routes the player does not; claim time, honesty and its pick are rolled now
  const parrot = solo ? plans.map(P => {
    const knows = [0, 1, 2, 3].filter(r => !P.sees[0].includes(r)), honest = rng() < 0.5, gold = knows.find(r => P.content[r] === 'gold');
    let claim;
    const other = knows.find(r => r !== gold), trap = knows.find(r => P.content[r] === 'trap'), empty = knows.find(r => P.content[r] === 'empty');
    if (gold != null) claim = honest ? ['gold', gold] : ['gold', other];                     // a lie points at its other route
    else if (honest) claim = trap != null ? ['trap', trap] : ['safe', empty];
    else claim = ['gold', rng.pick(knows)];
    const safeGuess = [0, 1, 2, 3].filter(r => !(knows.includes(r) && P.content[r] !== 'gold'));
    return { at: rng.range(1.2, 4), claim, pick: gold ?? rng.pick(safeGuess) };
  }) : null;
  const ids = solo ? [...pids, CPU] : pids;
  const total = Object.fromEntries(ids.map(k => [k, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, t = 0;
  let picks = {}, locked = new Set(), claims = [], said = {}, reveal = null, parrotSaid = false;
  const seat = Object.fromEntries(pids.map((p, k) => [p, k]));
  function next() { round++; phase = 'plan'; left = PLAN_S; t = 0; picks = {}; locked = new Set(); claims = []; said = {}; reveal = null; parrotSaid = false; }
  function settle() {
    if (solo && !parrotSaid) { parrotSaid = true; claims.push([CPU, ...parrot[round].claim]); }   // you locked in before it spoke
    const P = plans[round], all = { ...Object.fromEntries(pids.map(p => [p, picks[p] ?? null])) };
    if (solo) all[CPU] = parrot[round].pick;
    const r = settleRound(P.content, all);
    for (const k of ids) total[k] = Math.max(0, total[k] + r.gain[k]);
    const stamped = claims.map(([who, k, rt]) => { const c = CLAIMS[k]; return [who, k, rt, c.test ? (c.test(P.content[rt], all[who], rt) ? 1 : 0) : -1]; });
    reveal = { content: P.content, picks: all, gain: r.gain, claims: stamped, knew: Object.fromEntries(pids.map(p => [p, P.sees[seat[p]]])) };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ routes: ROUTES, rounds: ROUNDS, pot: POT, trap: TRAP, maxClaims: MAX_CLAIMS, solo, ...(solo ? { cpu: { pid: CPU, name: CPU_NAME } } : {}) }),
    act(pid, a, d) {
      if (phase !== 'plan' || !pids.includes(pid)) return;
      if (a === 'pick') {
        if (d === null) { delete picks[pid]; locked.delete(pid); return; }
        if (!Number.isInteger(d) || d < 0 || d >= ROUTES) return;
        picks[pid] = d;
      } else if (a === 'lock') {
        if (d !== true && d !== false) return;
        if (!d) { locked.delete(pid); return; }
        if (picks[pid] == null) return;
        locked.add(pid); if (pids.every(p => locked.has(p))) left = Math.min(left, 0.8);
      } else if (a === 'say') {
        if (!d || typeof d !== 'object' || !CLAIMS[d.k] || (said[pid] || 0) >= MAX_CLAIMS) return;
        const r = CLAIMS[d.k].r ? d.r : -1;
        if (CLAIMS[d.k].r && (!Number.isInteger(r) || r < 0 || r >= ROUTES)) return;
        said[pid] = (said[pid] || 0) + 1; claims.push([pid, d.k, r]);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; t += dt;
      if (phase === 'plan' && solo && !parrotSaid && t >= parrot[round].at) { parrotSaid = true; claims.push([CPU, ...parrot[round].claim]); }
      if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'plan') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (phase === 'plan') { g.claims = claims; g.in = pids.filter(p => locked.has(p)); g.picked = pids.filter(p => picks[p] != null); }
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv(pid) {
      if (!pids.includes(pid)) return {};
      if (phase !== 'plan') return { see: null, pick: null, locked: false, said: 0 };
      const P = plans[round], see = Object.fromEntries(P.sees[seat[pid]].map(r => [r, P.content[r]]));
      return { round, see, pick: picks[pid] ?? null, locked: locked.has(pid), said: said[pid] || 0 };
    },
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, total[p]])), unit: meta.unit };
    },
  };
}
