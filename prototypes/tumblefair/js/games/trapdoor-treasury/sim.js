// TRAPDOOR TREASURY — push your luck. Each round everyone secretly picks a chest (or banks). A chest pays into your
// SACK, unless its trapdoor opens: then everyone who picked it loses their whole sack. Banking moves your sack to the
// BANK, safe for good, but you sit that round out. Only the bank counts at the end.
export const meta = {
  id: 'trapdoor-treasury', title: 'Trapdoor Treasury', blurb: 'Grab gold, bank it, or push your luck over a trapdoor!',
  how: ['Pick a chest each round. Bigger chests have shakier floors.', 'A trapdoor empties your sack.', 'BANK to make your sack safe. Only banked gold counts!'],
  kind: 'ui', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'gold', tags: ['chance'], card: 'card-trapdoor-treasury',
};
export const CHESTS = [
  { id: 'safe', name: 'Tin Box', lo: 2, hi: 3, risk: 0 },
  { id: 'tempting', name: 'Oak Chest', lo: 4, hi: 7, risk: 0.25 },
  { id: 'reckless', name: 'Gold Hoard', lo: 9, hi: 14, risk: 0.5 },
];
export const ROUNDS = 6, PICK_S = 9, REVEAL_S = 4;

export function create({ rng, players }) {
  const pids = players.map(p => p.pid);
  const sack = {}, bank = {}; for (const p of pids) { sack[p] = 0; bank[p] = 0; }
  let round = 1, phase = 'pick', left = PICK_S, picks = {}, reveal = null, over = false;
  function resolve() {
    const chests = CHESTS.map(c => ({ loot: rng.int(c.lo, c.hi), trap: rng.chance(c.risk) }));
    const out = {};
    for (const p of pids) {
      const k = picks[p] ?? (sack[p] > 0 ? 'bank' : 0);                       // no answer: bank what you have, else the safe box
      if (k === 'bank') { bank[p] += sack[p]; out[p] = { pick: 'bank', d: sack[p] }; sack[p] = 0; continue; }
      const c = chests[k];
      if (c.trap) { out[p] = { pick: k, d: -sack[p], trap: true }; sack[p] = 0; } else { sack[p] += c.loot; out[p] = { pick: k, d: c.loot }; }
    }
    reveal = { chests, out }; phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ chests: CHESTS, rounds: ROUNDS }),
    act(pid, a, d) {
      if (phase !== 'pick' || !pids.includes(pid) || a !== 'pick') return;
      if (d === 'bank') picks[pid] = 'bank'; else if (Number.isInteger(d) && d >= 0 && d < CHESTS.length) picks[pid] = d; else return;
      if (pids.every(p => p in picks)) left = Math.min(left, 0.6);              // everyone is in: no need to wait
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 0) return;
      if (phase === 'pick') resolve();
      else if (round >= ROUNDS) { for (const p of pids) { bank[p] += 0; } over = true; }
      else { round++; phase = 'pick'; left = PICK_S; picks = {}; reveal = null; }
    },
    state: () => ({ round, phase, left: Math.max(0, Math.ceil(left)), in: pids.filter(p => p in picks), reveal, sack, bank, last: round === ROUNDS }),
    priv: pid => ({ pick: picks[pid] ?? null }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(bank[p])) groups.set(bank[p], []); groups.get(bank[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...bank }, unit: meta.unit };
    },
  };
}
