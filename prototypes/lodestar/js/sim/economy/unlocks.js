// The simple unlock list (PLAN M3, data/research.json) until M9's Calculator. PURE.
// A row is done the moment the base has PRODUCED its `needs.produced` totals (dug, cut or made — spending never undoes
// it). Its buildings join the Build Ledger and the teletype says so (`researchDone`).

export function createUnlocks(sim) {
  const D = sim.data;
  for (const b of Object.values(D.B)) if (b.start) sim.unlocked.add(b.id);
  function step() {
    for (const n of Object.values(D.NODE)) {
      if (sim.research.done.includes(n.id)) continue;
      const need = n.needs?.produced || {};
      if (!Object.entries(need).every(([r, k]) => (sim.produced[r] || 0) >= k)) continue;
      sim.research.done.push(n.id);
      for (const u of n.unlocks) sim.unlocked.add(u);
      sim.events.push({ e: 'researchDone', tick: sim.tick, base: sim.base, node: n.id, name: n.name, unlocks: n.unlocks.slice() });
    }
  }
  /** How far along each row is: [{ id, name, unlocks, done, parts: [{ res, have, need }] }]. */
  function progress() {
    return Object.values(D.NODE).map((n) => ({
      id: n.id, name: n.name, unlocks: n.unlocks, done: sim.research.done.includes(n.id),
      parts: Object.entries(n.needs?.produced || {}).map(([res, need]) => ({ res, have: Math.min(need, sim.produced[res] || 0), need })),
    }));
  }
  return { step, progress };
}
