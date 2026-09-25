// Team state: resources, power grid, population, research, stats. Plain data.

export const TEAM = { LUMEN: 1, UMBRA: 2, HOLLOW: 3 };

export function makeTeam(id, opts = {}) {
  return {
    id,
    ai: !!opts.ai,
    res: { c: opts.c ?? 200, f: opts.f ?? 40, a: opts.a ?? 0 },
    income: { c: 0, f: 0, a: 0 },          // smoothed per-second income, for the HUD
    incomeAcc: { c: 0, f: 0, a: 0 },
    power: { supply: 0, draw: 0, battery: 0, cap: 0, ratio: 1, net: 0 },
    pop: 0, popCap: opts.popCap ?? 30,
    coreId: 0,
    commanderId: 0,
    research: { done: {}, active: {} },     // done: key -> true; active: labId -> {key, t}
    mods: {},                               // research effects, e.g. wallHp: 1.3
    lastBuild: null,
    incomeMult: opts.incomeMult ?? 1,
    stats: { mined: { c: 0, f: 0, a: 0 }, spent: { c: 0, f: 0, a: 0 }, kills: {}, lost: 0, built: 0, cellsBuilt: 0, cellsLost: 0, dmgBy: {} },
  };
}

export function canAfford(team, cost, mult = 1) {
  if (!cost) return true;
  return (team.res.c >= (cost.c || 0) * mult) && (team.res.f >= (cost.f || 0) * mult) && (team.res.a >= (cost.a || 0) * mult);
}

export function spend(team, cost, mult = 1) {
  if (!cost) return;
  for (const k of ['c', 'f', 'a']) {
    const v = (cost[k] || 0) * mult;
    team.res[k] -= v;
    team.stats.spent[k] += v;
  }
}

export function refund(team, cost, frac = 1) {
  if (!cost) return;
  for (const k of ['c', 'f', 'a']) team.res[k] += (cost[k] || 0) * frac;
}

export function gain(team, key, amount) {
  const v = amount * (team.incomeMult || 1);
  team.res[key] += v;
  team.incomeAcc[key] += v;
  team.stats.mined[key] += v;
}
