// Compile Lodestar's data files into lookup tables the sim reads (PURE: the caller passes parsed JSON).
// Cross-references are checked here so a typo in a data file fails at load, not mid-game.

export function compileData(raw) {
  const res = raw.resources, rec = raw.recipes, bld = raw.buildings, veh = raw.vehicles, research = raw.research, bal = raw.balance;
  const byId = (list, what) => {
    const m = {};
    for (const r of list) { if (m[r.id]) throw new Error(`${what}: duplicate id ${r.id}`); m[r.id] = r; }
    return m;
  };
  const R = byId(res.list, 'resources');
  const RECIPE = byId(rec.list, 'recipes');
  const B = byId(bld.list, 'buildings');
  const V = byId(veh.list, 'vehicles');
  const NODE = byId(research.list, 'research');
  const known = (id, where) => { if (!R[id]) throw new Error(`${where}: unknown resource ${id}`); };
  for (const r of rec.list) {
    for (const k of Object.keys(r.in || {})) known(k, `recipe ${r.id} in`);
    for (const k of Object.keys(r.out || {})) known(k, `recipe ${r.id} out`);
    for (const k of Object.keys(r.fuel || {})) known(k, `recipe ${r.id} fuel`);
    if (r.dig) { known(r.dig, `recipe ${r.id} dig`); if (!res.sources[r.dig]) throw new Error(`recipe ${r.id}: ${r.dig} has no source`); }
  }
  for (const b of bld.list) {
    for (const k of Object.keys(b.cost || {})) known(k, `building ${b.id} cost`);
    for (const id of b.recipes || []) if (!RECIPE[id]) throw new Error(`building ${b.id}: unknown recipe ${id}`);
    for (const k of Object.keys(b.power?.fuel || {})) known(k, `building ${b.id} fuel`);
    if (b.unlock && !NODE[b.unlock]) throw new Error(`building ${b.id}: unlock ${b.unlock} is not a research row`);
    for (const c of Object.keys(b.crew || {})) if (!V[c]) throw new Error(`building ${b.id}: crew ${c} is not a vehicle row`);
  }
  for (const n of research.list) {
    for (const u of n.unlocks) if (!B[u]) throw new Error(`research ${n.id}: unlocks unknown building ${u}`);
    for (const k of Object.keys(n.needs?.produced || {})) known(k, `research ${n.id}`);
  }
  for (const k of Object.keys(bal.start.stock)) known(k, 'balance start');
  return {
    raw, R, RECIPE, B, V, NODE,
    resList: res.list.map((r) => r.id),
    resIndex: Object.fromEntries(res.list.map((r, i) => [r.id, i])),
    unitsPerAmt: res.unitsPerAmt,
    sources: res.sources,
    deposits: res.deposits,
    road: bld.vectors.road,
    balance: bal,
    econ: bal.economy,
  };
}
