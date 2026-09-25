// Waves: the build-phase timer, spawning, and the Director that composes Free Play waves.
//
// Phases: 'build' (timer counts down; the next wave is composed `previewAt` seconds early so the
// HUD can preview it) -> 'wave' (spawns trickle in; the wave ends when its creatures are dead or
// `straggle` seconds pass) -> 'build' ... until the last wave is cleared.
//
// Campaign missions supply authored waves ({units: {type: n}, lanes: [...]}); Free Play uses the
// Director, which reads the player's defense and counter-picks.

import { createUnit, udef } from './units.js';
import { bdef } from './buildings.js';
import { M } from '../world/materials.js';

export function makeWaves(game, o) {
  const cfg = game.data.waves;
  return {
    n: 0,
    total: o.total ?? 10,                 // Infinity = endless
    phase: 'build',
    timer: o.firstDelay ?? cfg.firstDelay[o.pace || 'normal'],
    between: o.between ?? cfg.between[o.pace || 'normal'],
    difficulty: o.difficulty || 'normal',
    lanes: o.lanes || 'right',            // right | both | under | chaos
    authored: o.authored || null,         // array of wave defs, or null for the director
    allow: o.allow || null,               // list of enemy types allowed, or null = all by unlock
    preview: null,
    queue: [],
    waveStart: 0,
    active: false,
    alive: [],                            // ids of creatures from the current wave
    enabled: o.enabled !== false,
    cleared: 0,
    earlyStreak: 0,
    hideBrutalPreview: o.difficulty === 'brutal',
  };
}

export function updateWaves(game, dt) {
  const W = game.waves;
  if (!W || !W.enabled) return;
  if (W.phase === 'build') {
    if (W.n >= W.total) return;
    W.timer -= dt;
    if (!W.preview && W.timer <= game.data.waves.previewAt) {
      W.preview = composeWave(game, W.n + 1);
      game.events.emit('wavePreview', { n: W.n + 1, preview: W.preview });
    }
    if (W.timer <= 0) launch(game);
    return;
  }
  // Wave phase: spawn queued creatures.
  const t = game.time - W.waveStart;
  while (W.queue.length && W.queue[0].t <= t) {
    const s = W.queue.shift();
    const u = spawnAt(game, s.type, s.lane, s.hpMult);
    if (u) W.alive.push(u.id);
  }
  W.alive = W.alive.filter((id) => game.byId.has(id));
  const stragglers = t > game.data.waves.straggle;
  if (!W.queue.length && (W.alive.length === 0 || stragglers)) {
    W.active = false;
    W.phase = 'build';
    W.cleared = W.n;
    game.events.emit('waveCleared', { n: W.n, total: W.total });
    if (W.n >= W.total) { game.events.emit('allWavesCleared', {}); return; }
    W.timer = W.between;
  }
}

function launch(game) {
  const W = game.waves;
  W.n++;
  if (!W.preview) W.preview = composeWave(game, W.n);
  W.phase = 'wave';
  W.active = true;
  W.waveStart = game.time;
  W.queue = [];
  const spread = game.data.waves.spawnSpread;
  const groups = W.preview.groups;
  let k = 0;
  const hpMult = W.n > 10 ? 1 + (W.n - 10) * game.data.waves.hpGrowthAfter10 : 1;
  const total = groups.reduce((a, g) => a + g.count, 0);
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      W.queue.push({ type: g.type, lane: g.lane, t: (k / Math.max(1, total)) * spread + game.rng.range(0, 1.2), hpMult: hpMult * (g.hpMult || 1) });
      k++;
    }
  }
  W.queue.sort((a, b) => a.t - b.t);
  game.events.emit('waveStart', { n: W.n, total: W.total, boss: W.preview.boss, lanes: [...new Set(groups.map((g) => g.lane))] });
  W.preview = null;
}

// Spawn one creature on a lane. Lanes: right, left, sky-right, sky-left, under-right, under-left.
export function spawnAt(game, type, lane, hpMult = 1) {
  const world = game.world;
  const def = udef(game, type);
  const left = lane.endsWith('left');
  const x = left ? 6 + game.rng.range(0, 8) : world.w - 6 - game.rng.range(0, 8);
  let y;
  if (def.move === 'fly') y = Math.max(10 + def.size[1], world.surfaceY(Math.floor(x)) - (def.cruise || 40) - game.rng.range(0, 20));
  else if (def.move === 'burrow') y = Math.min(world.h - 12, world.surfaceY(Math.floor(x)) + 30 + game.rng.range(0, 20));
  else y = world.surfaceY(Math.floor(x)) - 1;
  const dmgMult = game.waves ? (game.data.waves.difficulty[game.waves.difficulty] > 1 ? 1 + (game.data.waves.difficulty[game.waves.difficulty] - 1) * 0.3 : 1) : 1;
  const u = createUnit(game, type, 3, x, y, { dir: left ? 1 : -1, hpMult, dmgMult });
  u.hpMult = hpMult;
  if (def.move === 'burrow') u.burrowed = true;
  return u;
}

// Build the composition for wave n: {groups: [{type, count, lane}], boss, budget}.
export function composeWave(game, n) {
  const W = game.waves;
  if (W.authored) {
    const a = W.authored[n - 1] || W.authored[W.authored.length - 1];
    const over = Math.max(0, n - W.authored.length);
    const grow = Math.pow(1.12, over); // past the authored list: repeat the last wave, growing
    const groups = [];
    const lanes = a.lanes || ['right'];
    let li = 0;
    for (const [type, count] of Object.entries(a.units)) {
      const def = udef(game, type);
      let lane = a.laneOf?.[type] || lanes[li++ % lanes.length];
      if (def.move === 'fly' && !lane.startsWith('sky')) lane = 'sky-' + (lane.endsWith('left') ? 'left' : 'right');
      if (def.move === 'burrow' && !lane.startsWith('under')) lane = 'under-' + (lane.endsWith('left') ? 'left' : 'right');
      const scaled = Math.max(1, Math.round(count * grow * (game.data.waves.difficulty[W.difficulty] ?? 1)));
      groups.push({ type, count: def.boss ? count : scaled, lane });
    }
    return { groups, boss: groups.some((g) => udef(game, g.type).boss), budget: 0 };
  }
  const cfg = game.data.waves;
  let budget = n <= cfg.budget.length ? cfg.budget[n - 1] : cfg.budget[cfg.budget.length - 1] * Math.pow(cfg.growth, n - cfg.budget.length);
  budget *= cfg.difficulty[W.difficulty] ?? 1;
  const surge = n % cfg.surgeEvery === 0;
  if (surge) budget *= cfg.surgeMult;
  const groups = [];
  let boss = null;
  if (n % cfg.bossEvery === 0) {
    boss = cfg.bosses[(n / cfg.bossEvery - 1) % cfg.bosses.length];
    if (!W.allow || W.allow.includes(boss)) {
      groups.push({ type: boss, count: 1, lane: udef(game, boss).move === 'fly' ? 'sky-right' : 'right' });
      budget = Math.max(budget * 0.5, budget - udef(game, boss).cost);
    } else boss = null;
  }
  const weights = counterWeights(game, n);
  const types = Object.keys(weights).filter((t) => weights[t] > 0);
  const counts = {};
  let guard = 0;
  while (budget > 0.5 && guard++ < 500 && types.length) {
    const affordable = types.filter((t) => udef(game, t).cost <= budget + 0.5);
    if (!affordable.length) break;
    const pick = game.rng.weighted(affordable.map((t) => ({ k: t, w: weights[t] }))).k;
    counts[pick] = (counts[pick] || 0) + 1;
    budget -= udef(game, pick).cost;
  }
  const laneOpts = laneSet(W.lanes);
  for (const [type, count] of Object.entries(counts)) {
    const def = udef(game, type);
    // Split big groups across lanes when several are enabled.
    const ground = laneOpts.filter((l) => !l.startsWith('sky') && !l.startsWith('under'));
    let lanesFor = def.move === 'fly' ? ground.map((l) => 'sky-' + l) : def.move === 'burrow' ? ground.map((l) => 'under-' + l) : ground;
    if (W.lanes === 'under' && def.move === 'burrow') lanesFor = ['under-right'];
    if (!lanesFor.length) lanesFor = ['right'];
    const per = Math.ceil(count / lanesFor.length);
    let left = count;
    for (const l of lanesFor) { const c = Math.min(per, left); if (c > 0) groups.push({ type, count: c, lane: l }); left -= c; }
  }
  return { groups, boss, surge, budget: Math.round(budget) };
}

function laneSet(l) {
  if (l === 'both') return ['right', 'left'];
  if (l === 'chaos') return ['right', 'left'];
  return ['right'];
}

// Director counter-picks: read the defense and bias the weights.
export function counterWeights(game, n) {
  const W = game.waves;
  const base = game.data.waves.weights;
  const a = analyzeDefense(game, 1);
  const out = {};
  for (const [type, w] of Object.entries(base)) {
    const def = udef(game, type);
    if (!def || def.from > n) continue;
    if (W.allow && !W.allow.includes(type)) continue;
    let mod = 1;
    if (type === 'carapace' && a.laserShare > 0.6) mod *= 3;
    if (a.wallCells > 600) { if (type === 'gnawer') mod *= 2; if (type === 'spitter') mod *= 1.5; if (type === 'borer') mod *= 2; if (type === 'bombard') mod *= 1.5; }
    if (a.wallCells < 150 && type === 'mite') mod *= 1.5;
    if (a.airDps < 20) { if (type === 'wisp') mod *= 2; if (type === 'bombard') mod *= 2; }
    if (a.prism > 200 && type === 'glare') mod *= 0.3;
    if (a.arc > 1 && type === 'mite') mod *= 0.5;
    if (a.arc > 1 && type === 'splitter') mod *= 0.6;
    out[type] = 0.5 * w + 0.5 * w * mod;
  }
  return out;
}

export function analyzeDefense(game, team) {
  let laser = 0, total = 0, airDps = 0, arc = 0;
  for (const b of game.buildings) {
    if (b.team !== team || !b.done) continue;
    const def = bdef(game, b.type);
    const w = def.weapon;
    if (!w || b.type === 'core') continue;
    const dps = w.dps || (w.dmg || 0) * (w.rate || 1) * (w.burst || 1);
    total += dps;
    if (w.dtype === 'laser') laser += dps;
    if (w.air) airDps += dps;
    if (w.kind === 'arc') arc++;
  }
  let wallCells = 0, prism = 0;
  const wd = game.world;
  // Sample every 4th column for speed.
  for (let x = 0; x < wd.w; x += 4) for (let y = 0; y < wd.h; y++) {
    const i = y * wd.w + x;
    const m = wd.mat[i];
    if (!wd.mats.built[m] || wd.team[i] !== team) continue;
    wallCells += 4;
    if (m === M.PRISM) prism += 4;
  }
  return { laserShare: total ? laser / total : 0, total, airDps, arc, wallCells, prism };
}

export function callEarly(game, team) {
  const W = game.waves;
  if (!W || W.phase !== 'build' || W.n >= W.total) return { ok: false, reason: 'No wave to call' };
  const bonus = Math.floor(Math.max(0, W.timer));
  game.teams[team].res.c += bonus;
  W.timer = 0;
  W.earlyStreak++;
  game.events.emit('calledEarly', { bonus });
  return { ok: true, bonus };
}
