// Drones and construction: building sites, painted wall blueprints (built bottom-up), dig areas,
// repairs and salvage. Drones pick the most important job near them twice a second.
//
// Wall blueprints live in world.plan (material id) + world.planTeam. The game keeps a Set of plan
// cell indices per team that still need building (game.planCells[team]) and a Set of cells to dig
// (game.digCells[team]).

import { M, S } from '../world/materials.js';
import { flyToward, flyTo, boxFree } from './physics.js';
import { bdef, damageBuilding, salvageBuilding } from './buildings.js';
import { udef } from './units.js';
import { updateWeapon } from './weapons.js';

const MAX_PER_SITE = 4;

// Wall cost per cell for a material, as {c, f, a} fractions.
export function wallCellCost(game, mat) {
  for (const k in game.data.buildings.walls) {
    const w = game.data.buildings.walls[k];
    if (w.mat === mat) {
      const c = {};
      for (const r in w.cost) c[r] = w.cost[r] / w.cells;
      if (w.alloyPer) c.a = (c.a || 0) + 1 / w.alloyPer;
      return c;
    }
  }
  return { c: 0.5 };
}

// Can a structural cell of `mat` be placed at (x, y) without exceeding its span? Local 0-1 search
// over existing structure toward an anchor, bounded by the material's span.
export function spanOk(world, x, y, mat) {
  const st = world.mats.state;
  const limit = st[mat] === S.STICKY ? world.mats.maxSpan[mat] || 3 : world.mats.maxSpan[mat];
  const isAnchor = (cx, cy, m) => {
    const below = world.get(cx, cy + 1);
    const sb = st[below];
    if (sb === S.STATIC || sb === S.LOOSE || sb === S.FOOTPRINT) return true;
    const side = (xx, yy) => { const s = st[world.get(xx, yy)]; return s === S.STATIC || s === S.FOOTPRINT; };
    if (st[m] === S.STICKY) {
      const l = st[world.get(cx - 1, cy)], r = st[world.get(cx + 1, cy)], u = st[world.get(cx, cy - 1)];
      return l === S.STATIC || l === S.LOOSE || r === S.STATIC || r === S.LOOSE || u === S.STATIC;
    }
    return side(cx - 1, cy) || side(cx + 1, cy) || st[world.get(cx, cy - 1)] === S.STATIC;
  };
  if (isAnchor(x, y, mat)) return true;
  // 0-1 BFS over structure cells, starting at (x, y). Going down is free, sideways/up cost 1.
  const seen = new Map();
  const dq = [[x, y, 0]];
  seen.set(x * 100000 + y, 0);
  let guard = 0;
  while (dq.length && guard++ < 1500) {
    const [cx, cy, d] = dq.shift();
    const nb = [[cx, cy + 1, 0], [cx - 1, cy, 1], [cx + 1, cy, 1], [cx, cy - 1, 1]];
    for (const [nx, ny, c] of nb) {
      const nd = d + c;
      if (nd > limit) continue;
      const m = world.get(nx, ny);
      const s = st[m];
      if (s !== S.STRUCTURAL && s !== S.STICKY) continue;
      const key = nx * 100000 + ny;
      if (seen.has(key) && seen.get(key) <= nd) continue;
      seen.set(key, nd);
      if (isAnchor(nx, ny, m)) return true;
      if (c === 0) dq.unshift([nx, ny, nd]); else dq.push([nx, ny, nd]);
    }
  }
  return false;
}

// A plan cell is ready when the cell is empty/loose and it touches something solid below or beside.
function planReady(world, i) {
  const m = world.mat[i];
  if (m !== M.EMPTY && world.mats.state[m] !== S.LOOSE) return false;
  const W = world.w, x = i % W, y = (i / W) | 0;
  const pm = world.plan[i];
  const b = world.get(x, y + 1), l = world.get(x - 1, y), r = world.get(x + 1, y);
  const solid = (v) => v !== M.EMPTY && world.mats.state[v] !== S.LOOSE;
  if (!(solid(b) || world.mats.state[b] === S.LOOSE || solid(l) || solid(r) || world.mats.state[world.get(x, y - 1)] === S.STATIC)) return false;
  return spanOk(world, x, y, pm);
}

export function updateDrone(game, u, dt) {
  const def = udef(game, u.type);
  const team = game.teams[u.team];
  const world = game.world;
  // Self-defense zap.
  if (def.weapon) updateWeapon(game, u, def.weapon, dt);
  u.jobT -= dt;
  if (u.order.t === 'move') {
    const left = flyTo(game, u, u.order.x, u.order.y, def.speed, dt);
    if (left < 1) u.order = { t: 'idle' };
    u.job = null;
    return;
  }
  if (!u.job || u.jobT <= 0 || !jobValid(game, u, u.job)) {
    u.jobT = 0.5;
    const nj = findJob(game, u);
    if (nj) u.job = nj; else if (!jobValid(game, u, u.job)) u.job = null;
  }
  const b = def.builder;
  if (!u.job) {
    // Idle: hover near the Core.
    const core = game.byId.get(team.coreId);
    if (core) {
      const hx = core.x + core.w / 2 + ((u.id * 7) % 30) - 15, hy = core.y - 10 - (u.id % 4) * 3;
      flyToward(world, u, hx, hy, def.speed * 0.6, dt);
    }
    u.working = false;
    return;
  }
  const j = u.job;
  // If the planned hover spot is inside something, pick an open spot within reach instead.
  if (!j.checked) {
    j.checked = true;
    if (!boxFree(world, u, j.hx, j.hy)) {
      const hs = hoverSpot(world, u, j.x, j.y, b.range - 3);
      if (hs) { j.hx = hs.x; j.hy = hs.y; }
    }
  }
  const d = flyTo(game, u, j.hx, j.hy, def.speed, dt);
  const near = Math.hypot(j.x - u.x, j.y - (u.y - u.h / 2)) <= b.range;
  u.working = false;
  if (!near && d > 2) return;
  const mods = team.mods;
  const rate = (mods.build || 1);
  if (j.kind === 'site') {
    const s = game.byId.get(j.id);
    const sd = bdef(game, s.type);
    const inc = (dt / (sd.build || 5)) * b.buildRate * rate;
    s.progress = Math.min(1, s.progress + inc);
    s.hp = Math.min(s.maxHp, s.hp + s.maxHp * inc * 0.95);
    u.working = true; u.workAt = { x: j.x, y: j.y };
    if (s.progress >= 1) {
      s.done = true; s.hp = Math.max(s.hp, s.maxHp * 0.98);
      game.linksDirty = true;
      team.stats.built++;
      game.events.emit('built', { id: s.id, type: s.type, team: s.team, x: s.x + s.w / 2, y: s.y + s.h / 2 });
      u.job = null;
    }
  } else if (j.kind === 'repair') {
    const s = game.byId.get(j.id);
    const heal = Math.min(s.maxHp - s.hp, b.repairRate * rate * dt);
    const cost = heal * (b.repairCost || 0);
    if (team.res.c < cost) { u.waitingRes = true; return; }
    team.res.c -= cost; team.stats.spent.c += cost;
    s.hp += heal;
    u.working = true; u.workAt = { x: j.x, y: j.y };
    if (s.hp >= s.maxHp) u.job = null;
  } else if (j.kind === 'salvage') {
    const s = game.byId.get(j.id);
    s.salvageT = (s.salvageT || 0) + dt * rate;
    u.working = true; u.workAt = { x: j.x, y: j.y };
    if (s.salvageT >= Math.max(2, (bdef(game, s.type).build || 4) / 2)) { salvageBuilding(game, s); u.job = null; }
  } else if (j.kind === 'wall') {
    u.buildAcc += b.wallRate * rate * dt;
    const set = game.planCells[u.team];
    let placed = 0;
    while (u.buildAcc >= 1) {
      const i = nearestPlan(game, u, set, b.range, true);
      if (i < 0) { u.job = null; break; }
      const pm = world.plan[i];
      const cost = wallCellCost(game, pm);
      if (team.res.c < (cost.c || 0) || team.res.f < (cost.f || 0) || team.res.a < (cost.a || 0)) { u.waitingRes = true; u.buildAcc = 0; break; }
      u.waitingRes = false;
      for (const k in cost) { team.res[k] -= cost[k]; team.stats.spent[k] += cost[k]; }
      const x = i % world.w, y = (i / world.w) | 0;
      world.set(x, y, pm, u.team, Math.round(world.mats.hp[pm] * (team.mods.wallHp || 1) > 255 ? 255 : world.mats.hp[pm] * (team.mods.wallHp || 1)));
      set.delete(i);
      team.stats.cellsBuilt++;
      u.buildAcc -= 1; placed++;
      u.workAt = { x: x + 0.5, y: y + 0.5 };
    }
    if (placed) u.working = true;
  } else if (j.kind === 'dig') {
    u.buildAcc += b.digRate * rate * dt;
    const set = game.digCells[u.team];
    let dug = 0;
    while (u.buildAcc >= 1) {
      const i = nearestDig(game, u, set, b.range);
      if (i < 0) { u.job = null; break; }
      const x = i % world.w, y = (i / world.w) | 0;
      const m = world.mat[i];
      if (m === M.CRYSTAL) { team.res.c += 3; team.stats.mined.c += 3; }
      if (m === M.FERRITE) { team.res.f += 3; team.stats.mined.f += 3; }
      world.set(x, y, M.EMPTY);
      u.buildAcc -= 1; dug++;
      u.workAt = { x: x + 0.5, y: y + 0.5 };
    }
    if (dug) u.working = true;
  }
}

// Nearest open spot (for the drone's box) within `r` of (x, y), searching rings outward.
function hoverSpot(world, u, x, y, r) {
  let best = null, bd = Infinity;
  for (let rr = 4; rr <= r; rr += 3) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const hx = x + Math.cos(ang) * rr, hy = y + Math.sin(ang) * rr + u.h / 2;
      if (!boxFree(world, u, hx, hy)) continue;
      const d = (hx - u.x) ** 2 + (hy - u.y) ** 2 + rr * 4;
      if (d < bd) { bd = d; best = { x: hx, y: hy }; }
    }
    if (best) return best;
  }
  return best;
}

function jobValid(game, u, j) {
  if (!j) return false;
  if (j.kind === 'site') { const s = game.byId.get(j.id); return s && !s.done && !s.falling; }
  if (j.kind === 'repair') { const s = game.byId.get(j.id); return s && s.done && s.hp < s.maxHp && !s.falling; }
  if (j.kind === 'salvage') { const s = game.byId.get(j.id); return s && s.salvage; }
  if (j.kind === 'wall') return game.planCells[u.team].size > 0;
  if (j.kind === 'dig') return game.digCells[u.team].size > 0;
  return false;
}

function hover(x, y, h) { return { hx: x, hy: y - 6 }; }

export function findJob(game, u) {
  const team = game.teams[u.team];
  const world = game.world;
  const drones = game.units.filter((d) => d.team === u.team && d.type === 'drone' && d !== u);
  const countOn = (kind, id) => drones.filter((d) => d.job && d.job.kind === kind && d.job.id === id).length;
  let best = null, bd = Infinity;
  const consider = (j, pri) => {
    const d = Math.hypot(j.x - u.x, j.y - u.y) + pri;
    if (d < bd) { bd = d; best = j; }
  };
  for (const s of game.buildings) {
    if (s.team !== u.team || s.falling) continue;
    const c = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    if (s.salvage) { if (countOn('salvage', s.id) < 2) consider({ kind: 'salvage', id: s.id, ...c, hx: c.x, hy: s.y - 6 }, 0); continue; }
    if (!s.done) { if (countOn('site', s.id) < MAX_PER_SITE) consider({ kind: 'site', id: s.id, ...c, hx: c.x + ((u.id % 3) - 1) * 5, hy: s.y - 6 }, 0); continue; }
    if (s.hp < s.maxHp * 0.98 && game.time - s.lastHit > 3 && countOn('repair', s.id) < 2) consider({ kind: 'repair', id: s.id, ...c, hx: c.x, hy: s.y - 6 }, 150);
  }
  const waveOn = game.waves && game.waves.active;
  const rebuildOk = !waveOn || game.settings.rebuildDuringWaves;
  if (game.planCells[u.team].size) {
    const i = nearestPlan(game, u, game.planCells[u.team], 9999, true, !rebuildOk);
    if (i >= 0) {
      const x = i % world.w, y = (i / world.w) | 0;
      consider({ kind: 'wall', x, y, hx: x + 0.5 + ((u.id % 5) - 2) * 3, hy: y - 5 }, 60);
    }
  }
  if (game.digCells[u.team].size) {
    const i = nearestDig(game, u, game.digCells[u.team], 9999);
    if (i >= 0) {
      const x = i % world.w, y = (i / world.w) | 0;
      consider({ kind: 'dig', x, y, hx: x + 0.5, hy: y - 6 }, 90);
    }
  }
  return best;
}

// Nearest ready plan cell to the drone (lowest first among near ones). `onlyNew` skips cells that
// are rebuilds (were built before) when rebuilding is paused during waves.
function nearestPlan(game, u, set, range, ready = true, skipRebuilds = false) {
  const world = game.world, W = world.w;
  let best = -1, bd = Infinity;
  const r2 = range * range;
  let n = 0;
  for (const i of set) {
    if (++n > 6000 && best >= 0) break;
    if (world.mat[i] === world.plan[i]) { set.delete(i); continue; }
    if (!world.plan[i]) { set.delete(i); continue; }
    if (skipRebuilds && game.rebuilds.has(i)) continue;
    const x = i % W, y = (i / W) | 0;
    const d2 = (x - u.x) ** 2 + (y - (u.y - u.h / 2)) ** 2;
    if (d2 > r2) continue;
    const score = d2 - y * 40; // prefer lower cells (bottom-up)
    if (score >= bd) continue;
    if (ready && !planReady(world, i)) continue;
    bd = score; best = i;
  }
  return best;
}

function nearestDig(game, u, set, range) {
  const world = game.world, W = world.w;
  let best = -1, bd = Infinity, any = false;
  const r2 = range * range;
  for (const i of set) {
    const m = world.mat[i];
    // Dug cells stay in the zone (dust that slides back in gets dug out too); the zone is
    // dropped once nothing in it is left to dig.
    if (m === M.EMPTY) continue;
    if (m === M.BEDROCK || m === M.FOOTPRINT || world.mats.built[m]) { set.delete(i); continue; }
    any = true;
    const x = i % W, y = (i / W) | 0;
    // Exposed cells only (something empty next to it), top-down.
    if (world.get(x, y - 1) !== M.EMPTY && world.get(x - 1, y) !== M.EMPTY && world.get(x + 1, y) !== M.EMPTY && world.get(x, y + 1) !== M.EMPTY) continue;
    const d2 = (x - u.x) ** 2 + (y - (u.y - u.h / 2)) ** 2;
    if (d2 > r2) continue;
    const score = d2 + y * 30;
    if (score < bd) { bd = score; best = i; }
  }
  if (!any) set.clear();
  return best;
}
