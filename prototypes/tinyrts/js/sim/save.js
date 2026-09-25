// Save / load a whole match. The snapshot is plain data plus typed arrays, so it can go straight
// into IndexedDB (which stores typed arrays natively) or through structuredClone in tests.
// Cell arrays are run-length encoded; HP is stored only where it differs from the material's full HP.

import { Game } from './game.js';

const ARRAYS = ['mat', 'team', 'aux', 'owner', 'plan', 'planTeam'];

export function rle(arr) {
  // Pairs of (value, runLength) in the same typed-array family as the source.
  const Ctor = arr.constructor;
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i]; let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 65535) n++;
    out.push(v, n);
    i += n;
  }
  return { type: Ctor.name, len: arr.length, data: Ctor === Uint16Array ? Uint16Array.from(out) : Uint32Array.from(out) };
}

export function unrle(r, target) {
  const d = r.data;
  let i = 0;
  for (let k = 0; k < d.length; k += 2) { target.fill(d[k], i, i + d[k + 1]); i += d[k + 1]; }
  return target;
}

export function snapshot(game) {
  const w = game.world;
  const arrays = {};
  for (const k of ARRAYS) arrays[k] = rle(w[k]);
  // Sparse HP: index/value pairs where HP != material default.
  const hpIdx = [], hpVal = [];
  for (let i = 0; i < w.mat.length; i++) {
    const m = w.mat[i];
    if (m && w.hp[i] !== game.mats.hp[m]) { hpIdx.push(i); hpVal.push(w.hp[i]); }
  }
  const plain = (v) => JSON.parse(JSON.stringify(v));
  return {
    version: 1,
    opts: plainOpts(game.opts),
    savedAt: Date.now(),
    tickNo: game.tickNo, time: game.time, nextId: game.nextId, rng: game.rng.state, debrisBudget: game.debrisBudget,
    world: { w: w.w, h: w.h, arrays, hpIdx: Uint32Array.from(hpIdx), hpVal: Uint8Array.from(hpVal) },
    surface: Array.from(game.terrainInfo.surface),
    bases: plain(game.terrainInfo.bases),
    teams: plain(game.teams),
    buildings: plain(game.buildings),
    units: plain(game.units),
    projectiles: plain(game.projectiles),
    acids: plain(game.acids),
    debris: plain(game.debris),
    clumps: game.support.clumps.map((c) => ({ ...c, mat: Array.from(c.mat), team: Array.from(c.team), hp: Array.from(c.hp), bottom: Array.from(c.bottom) })),
    planCells: { 1: [...game.planCells[1]], 2: [...game.planCells[2]] },
    digCells: { 1: [...game.digCells[1]], 2: [...game.digCells[2]] },
    rebuilds: [...game.rebuilds],
    waves: game.waves ? plain(game.waves) : null,
    abilityFx: plain(game.abilityFx),
    result: game.result,
    stats: plain(game.stats),
    objectives: game.objectives?.save ? game.objectives.save() : null,
    ai: game.ai?.save ? game.ai.save() : null,
    extra: game.saveExtra ? plain(game.saveExtra) : null,
  };
}

function plainOpts(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) if (typeof v !== 'function') out[k] = v;
  return JSON.parse(JSON.stringify(out));
}

// Rebuild a Game from a snapshot. `hooks.beforeRestore(game)` lets the caller re-attach mission
// scripts / AI (with their own state loaded from snap.objectives / snap.ai).
export function restore(data, snap, hooks = {}) {
  const opts = { ...snap.opts, restoring: true };
  const g = new Game(data, opts);
  const w = g.world;
  for (const k of ARRAYS) unrle(snap.world.arrays[k], w[k]);
  w.hp.fill(0);
  for (let i = 0; i < w.mat.length; i++) if (w.mat[i]) w.hp[i] = g.mats.hp[w.mat[i]];
  const hi = snap.world.hpIdx, hv = snap.world.hpVal;
  for (let k = 0; k < hi.length; k++) w.hp[hi[k]] = hv[k];
  w.dirtyGfx.fill(1); w.dirtyNav.fill(1); w.awake.fill(1); w.awakeNext.fill(1);
  w.anyGfxDirty = true; w.anyNavDirty = true; w.supportQueue.length = 0; w.planLost.length = 0;
  g.terrainInfo.surface = Float32Array.from(snap.surface);
  g.terrainInfo.bases = snap.bases; g.bases = snap.bases;
  g.tickNo = snap.tickNo; g.time = snap.time; g.nextId = snap.nextId; g.rng.state = snap.rng; g.debrisBudget = snap.debrisBudget ?? 60;
  g.teams = snap.teams;
  g.buildings = snap.buildings; g.units = snap.units;
  g.projectiles = snap.projectiles; g.acids = snap.acids; g.debris = snap.debris;
  g.support.clumps = snap.clumps.map((c) => ({ ...c, mat: Uint8Array.from(c.mat), team: Uint8Array.from(c.team), hp: Uint8Array.from(c.hp), bottom: Int16Array.from(c.bottom) }));
  g.support.nextClumpId = Math.max(1, ...g.support.clumps.map((c) => c.id + 1));
  g.byId = new Map();
  for (const b of g.buildings) g.byId.set(b.id, b);
  for (const u of g.units) g.byId.set(u.id, u);
  g.planCells = { 1: new Set(snap.planCells[1]), 2: new Set(snap.planCells[2]) };
  g.digCells = { 1: new Set(snap.digCells[1]), 2: new Set(snap.digCells[2]) };
  g.rebuilds = new Set(snap.rebuilds);
  g.waves = snap.waves;
  if (g.waves && g.waves.total === null) g.waves.total = Infinity; // JSON turns Infinity into null
  g.abilityFx = snap.abilityFx;
  g.result = snap.result;
  g.stats = snap.stats;
  g.linksDirty = true;
  g.saveExtra = snap.extra;
  if (g.ai && snap.ai) {
    g.ai.state = snap.ai;
    if (snap.ai.style && g.data['ai-templates'].styles[snap.ai.style]) { g.ai.styleKey = snap.ai.style; g.ai.style = g.data['ai-templates'].styles[snap.ai.style]; }
  }
  if (g.objectives && snap.objectives) { g.objectives.load(snap.objectives); g.objectives.script.init?.(g.objectives, g); }
  if (hooks.beforeRestore) hooks.beforeRestore(g, snap);
  return g;
}

// Compare two games for the round-trip test: same cells, same entities (ignoring volatile
// fields), same resources.
export function sameState(a, b) {
  const diffs = [];
  for (const k of ['mat', 'hp', 'team', 'owner', 'plan']) {
    const x = a.world[k], y = b.world[k];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { diffs.push(`${k}[${i}] ${x[i]} != ${y[i]}`); break; }
  }
  const strip = (e) => { const o = { ...e }; delete o.path; delete o._ore; delete o._oreT; return JSON.stringify(o); };
  if (a.buildings.length !== b.buildings.length) diffs.push('building count');
  a.buildings.forEach((x, i) => { if (strip(x) !== strip(b.buildings[i])) diffs.push('building ' + x.id); });
  if (a.units.length !== b.units.length) diffs.push('unit count');
  a.units.forEach((x, i) => { if (b.units[i] && strip(x) !== strip(b.units[i])) diffs.push('unit ' + x.id); });
  if (JSON.stringify(a.teams) !== JSON.stringify(b.teams)) diffs.push('teams');
  if (a.rng.state !== b.rng.state) diffs.push('rng');
  return diffs;
}
