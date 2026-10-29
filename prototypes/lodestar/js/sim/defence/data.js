// Compile M4's data files (towers, enemies, nests, upgrades, radio, balance.defence, buildings.json vectors.wall) and
// check every cross-reference at load. PURE.

export function compileDefence(raw, M) {
  const by = (list, what) => { const m = {}; for (const r of list) { if (m[r.id]) throw new Error(`${what}: duplicate id ${r.id}`); m[r.id] = r; } return m; };
  const T = by(raw.towers.list, 'towers');
  const E = by(raw.enemies.list, 'enemies');
  const F = raw.enemies.families;
  const N = raw.nests;
  const U = raw.upgrades;
  const bal = raw.balance.defence;
  const wall = raw.buildings.vectors.wall;
  const B = by(raw.buildings.list, 'buildings');
  const NODE = by(raw.research.list, 'research');
  for (const b of raw.buildings.list) if (b.tower && !T[b.id]) throw new Error(`building ${b.id} is a tower with no towers.json row`);
  for (const t of raw.towers.list) {
    if (!B[t.id]) throw new Error(`towers.json ${t.id} has no buildings.json row`);
    if (B[t.id].tag !== 'military') throw new Error(`tower ${t.id} must be tagged military`);
  }
  for (const e of raw.enemies.list) if (!F[e.family]) throw new Error(`enemy ${e.id}: unknown family ${e.family}`);
  for (const s of N.stages) for (const k of [...Object.keys(s.raid), ...Object.keys(s.guards)]) if (!E[k]) throw new Error(`nest stage ${s.stage}: unknown enemy ${k}`);
  for (const l of U.wall.levels) {
    if (M && M.id[l.mat] === undefined) throw new Error(`wall level ${l.level}: unknown material ${l.mat}`);
    if (l.research && !NODE[l.research]) throw new Error(`wall level ${l.level}: unknown research ${l.research}`);
  }
  for (const l of U.towers.levels) {
    if (!NODE[l.research]) throw new Error(`${l.kind} ${l.level}: unknown research ${l.research}`);
    if (!T[l.kind.replace('tower.', '')]) throw new Error(`${l.kind}: no such tower`);
  }
  // noise.byType may name buildings of milestones not here yet (M6's harvester and refinery): they simply make no noise
  const levelKinds = new Set(['wall', ...raw.towers.list.map((t) => 'tower.' + t.id)]);
  return {
    T, E, F, N, U, bal, wall, levelKinds, radio: raw.radio,
    stage: (n) => N.stages[Math.max(0, Math.min(N.stages.length - 1, n - 1))],
    wallLevel: (lv) => U.wall.levels[Math.max(0, Math.min(U.wall.levels.length - 1, (lv || 1) - 1))],
    perLevel: raw.towers.perLevel,
  };
}
