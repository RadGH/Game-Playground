// What the player may use. PURE, a sim system.
//
// Owner (2026-11-03): "Settlement tiers + research … I'd like to do that eventually. But to start let's
// just unlock everything. We should have infrastructure to support it later." So: ONE check,
// sim.unlocked(id), that every build, hire, wall, road, power, rail and train path calls; it reads
// data/research.json (nodes that unlock ids) and data/tiers.json (groups a settlement tier opens).
// While `unlockEverything` is true (the default) it always says yes.
//
// Ids: a building kind ('smelter'), or 'guard:archer', 'wall:stone', 'road:gravel', 'power:meteor',
// 'rail', 'station', 'train:freight', a vehicle ('wagon').

export function createUnlock(sim, data) {
  const S = sim.state.unlock ??= { done: [], points: 0 };
  const nodes = data.nodes || {};
  const byId = new Map();
  for (const [nid, n] of Object.entries(nodes)) for (const u of n.unlocks) byId.set(u, nid);
  const tiers = data.tiers || [];
  const gating = () => !(sim.state.unlock.everything ?? data.unlockEverything ?? true);

  function tierOf(pop) { let t = tiers[0]; for (const x of tiers) if (pop >= x.pop) t = x; return t; }
  function groupOpen(group) {
    if (!group || !tiers.length) return true;
    const pop = sim.state.town?.people?.length || 0;
    const opened = new Set(tiers.filter(t => pop >= t.pop).flatMap(t => t.opens));
    const everOpened = new Set(tiers.flatMap(t => t.opens));
    return !everOpened.has(group) || opened.has(group);
  }
  /** May the player use this? (always yes while everything is unlocked) */
  function unlocked(id) {
    sim.unlockAsked?.(id);
    if (!gating()) return true;
    const node = byId.get(id);
    if (node && !S.done.includes(node)) return false;
    const kind = data.kinds?.[id];
    if (kind && !groupOpen(kind.group)) return false;
    return true;
  }
  function research(nid) {
    const n = nodes[nid]; if (!n || S.done.includes(nid)) return null;
    if (!n.after.every(a => S.done.includes(a))) return { error: 'Research what comes before it first.' };
    if (S.points < n.cost) return { error: 'Not enough research.' };
    S.points -= n.cost; S.done.push(nid);
    return { done: nid };
  }
  sim.unlocked = unlocked;
  return {
    id: 'unlock',
    step() {
      // research points come from the population, so the tree is ready to switch on
      if (sim.tick % sim.dayTicks === sim.dayTicks - 5) S.points += Math.round((sim.state.town?.people?.length || 0) / 10);
    },
    order(o) {
      if (o.t === 'research') return research(o.id);
      if (o.t === 'unlock.everything') { S.everything = !!o.on; return { everything: S.everything }; }
      return null;
    },
    view() { return { gating: gating(), done: S.done, points: S.points, tier: tierOf(sim.state.town?.people?.length || 0)?.name || null }; },
    unlocked, tierOf,
  };
}
