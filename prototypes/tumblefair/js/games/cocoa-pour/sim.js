// COCOA POUR (Winter Fair, Expansion 1 M6, 2026-11-07) — a timing game for the winter season. Five rounds. Each round
// shows a big mug with a dotted fill line and how the pot pours this time ("Steady", "Speeds up!", "Glug glug": the
// stream comes in pulses). Everyone HOLDS the pour button and lets go when they think the cocoa is at the line. You
// don't see the cocoa rise in the last stretch: the steam fogs the top of the mug (the top 30% of the way to the line),
// so it is a real judgement, not a reaction test. Too much = it spills over and scores nothing.
//   Points a round: 10 at the line, one fewer per 2% off (0 from 20% off); within 2% = "Marshmallow!" +3. A spill is 0.
// The phone measures how long it was held (ms) and sends that once; the sim turns it into a level with the round's own
// pour curve (`levelAt`, shared with the view so the mug on your phone fills exactly as the server counts it). The
// round ends when everyone has poured (or after POUR_S), then the reveal shows every mug side by side.
// Solo: a CPU, Mallow the cat, pours too (its error is set by the difficulty, so a careful player can beat it).
export const meta = {
  id: 'cocoa-pour', title: 'Cocoa Pour', blurb: 'Hold to pour the cocoa and let go right on the line. Don\'t spill!',
  how: ['HOLD the pour button. Let go when the cocoa reaches the dotted line.', 'The steam hides the top bit, so judge it!', 'Each pot pours differently: steady, speeding up, or in glugs.', 'Spill over the top and the round scores nothing.'],
  kind: 'ui', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'points', tags: ['action', 'holiday'], season: 'winter', card: 'card-cocoa-pour', css: true, rival: true,
};
export const ROUNDS = 5, START_S = 2, SHOW_S = 1.6, POUR_S = 9, REVEAL_S = 3.2, END_S = 2.5, MAX_MS = 12000;
export const PERFECT = 2, PERFECT_BONUS = 3, SPILL = 100;
export const POTS = { steady: 'Steady pour', speedy: 'Speeds up!', glug: 'Glug glug' };
export const CPU = { pid: -1, name: 'Mallow', seat: 3 };
const CPU_ERR = { easy: 9, normal: 5.5, hard: 3 };          // Mallow's typical miss, in % of the mug

/** The cocoa level (0..~120, % of the mug) after holding for `ms` with this round's pot. Shared with the view. */
export function levelAt(pot, ms) {
  const t = Math.max(0, Math.min(MAX_MS, ms)) / 1000;
  if (pot.kind === 'speedy') return pot.rate * 0.55 * t * t;                       // accelerating
  if (pot.kind === 'glug') return pot.rate * (t + 0.85 * Math.sin(t * 7) / 7);     // pulses: the speed swings 0.15x..1.85x, never backwards
  return pot.rate * t;
}
/** Points for a level against the line (null = never poured). */
export function scoreFor(level, line) {
  if (level == null) return 0;
  if (level >= SPILL) return 0;
  const off = Math.abs(level - line);
  return Math.max(0, Math.round(10 - off / 2)) + (off <= PERFECT ? PERFECT_BONUS : 0);
}
/** How long to hold to hit `level` exactly (for bots and Mallow): inverts levelAt by bisection. */
export function msFor(pot, level) {
  let lo = 0, hi = MAX_MS;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (levelAt(pot, mid) < level) lo = mid; else hi = mid; }
  return Math.round((lo + hi) / 2);
}

export function create({ rng, players, difficulty = 'normal', rivals }) {
  // rivals === false (the lobby's "Rival when alone" off): no Mallow, a lone player just pours for points
  const pids = players.map(p => p.pid), solo = pids.length === 1 && rivals !== false;
  const all = solo ? [...pids, CPU.pid] : pids.slice();
  const kinds = rng.shuffle(['steady', 'speedy', 'glug', 'steady', 'speedy']);
  const plan = kinds.map(kind => ({ kind, rate: Math.round(rng.range(kind === 'speedy' ? 14 : 18, kind === 'speedy' ? 22 : 30) * 10) / 10, line: Math.round(rng.range(45, 88)) }));
  const cpuMiss = plan.map(() => { const e = CPU_ERR[difficulty] ?? CPU_ERR.normal; return Math.round((rng.range(-1, 1) + rng.range(-1, 1)) * e * 10) / 10; });
  const cpuAt = plan.map(() => rng.range(1.2, 3.5));
  const total = Object.fromEntries(all.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, poured = {}, reveal = null, since = 0;
  const pot = () => plan[round];
  function next() { round++; phase = 'show'; left = SHOW_S; poured = {}; reveal = null; since = 0; }
  function settle() {
    const P = pot(), gain = {}, lv = {};
    for (const p of all) { lv[p] = poured[p] == null ? null : Math.round(levelAt(P, poured[p]) * 10) / 10; gain[p] = scoreFor(lv[p], P.line); total[p] += gain[p]; }
    reveal = { lv, gain };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo, cpu: solo ? CPU : null, maxMs: MAX_MS }),
    act(pid, a, d) {
      if (a !== 'pour' || phase !== 'pour' || !pids.includes(pid) || poured[pid] != null) return;
      if (!Number.isFinite(d) || d < 0 || d > MAX_MS) return;
      poured[pid] = Math.round(d);
      if (all.every(p => poured[p] != null)) left = Math.min(left, 0.6);
    },
    step(dt) {
      if (over) return;
      left -= dt;
      if (phase === 'pour') {
        since += dt;
        if (solo && poured[CPU.pid] == null && since >= cpuAt[round]) {
          const P = pot(); poured[CPU.pid] = msFor(P, Math.max(0, P.line + cpuMiss[round]));
          if (all.every(p => poured[p] != null)) left = Math.min(left, 0.6);
        }
      }
      if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'show') { phase = 'pour'; left = POUR_S; }
      else if (phase === 'pour') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (round >= 0 && phase !== 'end') { const P = pot(); g.pot = [P.kind, P.rate, P.line]; }
      if (phase === 'pour') g.in = all.filter(p => poured[p] != null);
      if (phase === 'reveal') g.reveal = reveal;
      return g;
    },
    priv: pid => ({ ms: phase === 'pour' || phase === 'reveal' ? poured[pid] ?? null : null }),
    get over() { return over; },
    result() {
      const score = Object.fromEntries(pids.map(p => [p, total[p]]));
      const vals = [...new Set(pids.map(p => total[p]))].sort((a, b) => b - a);
      return { order: vals.map(v => pids.filter(p => total[p] === v)), scores: score, unit: meta.unit, ...(solo ? { cpu: total[CPU.pid], beat: total[pids[0]] > total[CPU.pid] } : {}) };
    },
    get cpuScore() { return total[CPU.pid] ?? null; },
  };
}

/** A bot that pours from the public state: `err` = its miss in % (seeded per round by the caller). */
export function cocoaBot(g, err = 0) {
  if (g?.phase !== 'pour' || !g.pot) return null;
  const [kind, rate, line] = g.pot;
  return msFor({ kind, rate }, Math.max(0, line + err));
}
