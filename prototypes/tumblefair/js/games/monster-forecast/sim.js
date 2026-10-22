// MONSTER FORECAST — a goofy fairground monster (one per game, from monsters.js) is about to do one of its three
// moves. First it shows a TELL (crouches, eyes glow, big breath in…); everyone secretly picks DODGE, BLOCK or COUNTER;
// then the move happens and the picks are shown together. Each move has one right answer, printed on the cheat sheet
// next to its two tells.
//   Right read: 3 points (+1 more once you have three right in a row). Wrong or no pick: you get bonked, 0.
//   Rounds 1-3: a slow, big tell with a caption. Rounds 4-6: quicker, smaller, no caption. Rounds 7-8: FAKE-OUTS —
//   a short tell from another move plays first, and the LAST tell is the true one.
// Everyone plays against the monster, so alone it is a score attack (out of 8 reads). The move list comes from the
// seed; the true move is never in the public state before the reveal (only the tells, which are the point).
import { MONSTERS, TELLS, ANSWERS } from './monsters.js';
export { MONSTERS, TELLS, ANSWERS };

export const meta = {
  id: 'monster-forecast', title: 'Monster Forecast', blurb: 'Read the monster\'s tells and pick the right move before it strikes!',
  how: ['Watch the monster: every move has its own tells (see the cheat sheet).', 'Pick DODGE, BLOCK or COUNTER before it strikes.', 'Right read = 3 points. Three in a row = a bonus point.', 'Tells get quicker, and later the monster fakes you out: trust the LAST tell!'],
  kind: 'ui', min: 1, max: 4, seconds: 56, scoring: 'points', unit: 'points', tags: ['action', 'puzzle'], card: 'card-monster-forecast', css: true,
};
export const ROUNDS = 8, START_S = 2.5, PICK_S = 2, REVEAL_S = 2.2, END_S = 3, RIGHT = 3, STREAK_AT = 3, STREAK_BONUS = 1;
/** How a round's tell plays: tier 1 big + caption, tier 2 quick + small, tier 3 a fake-out first. */
export const TIERS = { 1: { tell: 2.2, size: 1, say: true }, 2: { tell: 1.6, size: 0.6, say: false }, 3: { tell: 1.3, decoy: 0.6, size: 0.5, say: false } };
export const tierOf = round => round < 3 ? 1 : round < 6 ? 2 : 3;

/** The round plan: which move, which tell, and (tier 3) which decoy tell — never the same move three times running. */
export function planRounds(rng, mon) {
  const out = [];
  for (let r = 0; r < ROUNDS; r++) {
    let m;
    do m = rng.int(0, 2); while (r >= 2 && out[r - 1].m === m && out[r - 2].m === m);
    const move = mon.moves[m], tier = tierOf(r), T = TIERS[tier];
    const cues = [];
    if (T.decoy) { const others = mon.moves.filter((_, k) => k !== m); cues.push([rng.pick(rng.pick(others).tells), T.decoy]); }
    cues.push([rng.pick(move.tells), T.tell]);
    out.push({ m, tier, cues });
  }
  return out;
}
/** Points for one pick given the streak BEFORE it. -> { ok, gain, streak } */
export function scorePick(pick, answer, streak) {
  if (pick !== answer) return { ok: false, gain: 0, streak: 0 };
  const s = streak + 1; return { ok: true, gain: RIGHT + (s >= STREAK_AT ? STREAK_BONUS : 0), streak: s };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid);
  const monster = rng.pick(MONSTERS), plan = planRounds(rng, monster);
  const total = Object.fromEntries(pids.map(p => [p, 0])), streak = Object.fromEntries(pids.map(p => [p, 0])), right = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, picks = {}, reveal = null;
  const tellLen = r => plan[r].cues.reduce((s, c) => s + c[1], 0);
  function next() { round++; phase = 'tell'; left = tellLen(round); picks = {}; reveal = null; }
  function settle() {
    const P = plan[round], answer = monster.moves[P.m].answer, out = {};
    for (const p of pids) { const s = scorePick(picks[p] ?? null, answer, streak[p]); streak[p] = s.streak; total[p] += s.gain; if (s.ok) right[p]++; out[p] = { pick: picks[p] ?? null, ok: s.ok, gain: s.gain, streak: s.streak }; }
    reveal = { m: P.m, answer, out };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ monster: monster.id, rounds: ROUNDS, solo: pids.length === 1 }),
    act(pid, a, d) {
      if (a !== 'pick' || (phase !== 'tell' && phase !== 'pick') || !pids.includes(pid) || !ANSWERS.includes(d)) return;
      picks[pid] = d;
      if (phase === 'pick' && pids.every(p => picks[p])) left = Math.min(left, 0.3);
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'tell') { phase = 'pick'; left = pids.every(p => picks[p]) ? 0.3 : PICK_S; }
      else if (phase === 'pick') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total }, streak: { ...streak } };
      if (round >= 0 && phase !== 'end') { g.tier = plan[round].tier; g.cues = plan[round].cues; }
      if (phase === 'tell' || phase === 'pick') g.in = pids.filter(p => picks[p]);
      if (phase === 'reveal') g.reveal = reveal;
      if (phase === 'end') g.right = { ...right };
      return g;
    },
    priv: pid => ({ pick: (phase === 'tell' || phase === 'pick') ? picks[pid] ?? null : null }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
  };
}
