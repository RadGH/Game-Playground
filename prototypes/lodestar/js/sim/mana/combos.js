// Combos (PLAN M6): the first time a spell does something clever with the world, High Command sends a commendation.
// PURE. The names and lines are data (spells.json `combos`); this file only remembers which ones have happened.

export function createCombos(sim, rows) {
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const done = new Set();
  /** Record combo `id` (a row of spells.json combos). Returns true the first time. */
  function hit(id, at = {}) {
    const row = byId[id];
    if (!row) throw new Error('mana: unknown combo ' + id);
    if (done.has(id)) return false;
    done.add(id);
    sim.events.push({ e: 'combo', tick: sim.tick, base: sim.base, id, name: row.name, text: row.text, x: at.x, y: at.y });
    return true;
  }
  return { hit, has: (id) => done.has(id), list: () => [...done], restore(ids) { for (const i of ids || []) if (byId[i]) done.add(i); } };
}
